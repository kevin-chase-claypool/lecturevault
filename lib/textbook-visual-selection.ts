import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";

export type TextbookVisualPage = {
  pageImageDataUrl?: string;
  pageNumber: number;
  textbookName: string;
};

export type TextbookVisualCitation = {
  description: string;
  imageCrop: { height: number; width: number; x: number; y: number } | null;
  inlineAnchor: string;
  pageEnd: number;
  pageStart: number;
  textbookName: string;
  visualKind: TextbookVisualKind;
  whyNotKaTeX: string;
};

// These are intentionally limited to visuals that KaTeX cannot usefully
// replace. Equations, worked algebra, prose, tables of text, and whole pages
// never qualify, even when they are relevant to the reconstruction.
export const TEXTBOOK_VISUAL_KINDS = [
  "block_diagram",
  "signal_flow_diagram",
  "schematic",
  "graph_or_plot",
  "geometry_diagram",
  "photo_or_illustration",
  "map_or_chart"
] as const;

export type TextbookVisualKind = (typeof TEXTBOOK_VISUAL_KINDS)[number];

export function isTextbookVisualKind(value: unknown): value is TextbookVisualKind {
  return typeof value === "string" && (TEXTBOOK_VISUAL_KINDS as readonly string[]).includes(value);
}

type VisualSelectionResponse = {
  textbookCitations?: Array<{
    description?: unknown;
    visualKind?: unknown;
    whyNotKaTeX?: unknown;
    imageCrop?: {
      height?: unknown;
      width?: unknown;
      x?: unknown;
      y?: unknown;
    } | null;
    anchorIndex?: unknown;
    imageIndex?: unknown;
  }>;
};

export type TextbookVisualCandidate = TextbookVisualCitation & {
  imageDataUrl: string;
  imageFilename?: string;
};

type VisualVerificationResponse = {
  verdicts?: Array<{
    approved?: unknown;
    visualIndex?: unknown;
  }>;
};

const TEXTBOOK_VISUAL_SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["textbookCitations"],
  properties: {
    textbookCitations: {
      type: "array",
      // Returning no visual is correct whenever the retrieved pages contain
      // only prose, equations, tables, or other content KaTeX already handles.
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["imageIndex", "anchorIndex", "description", "visualKind", "whyNotKaTeX", "imageCrop"],
        properties: {
          imageIndex: { type: "number", minimum: 1 },
          anchorIndex: { type: "number", minimum: 1 },
          description: { type: "string" },
          visualKind: { type: "string", enum: TEXTBOOK_VISUAL_KINDS },
          whyNotKaTeX: { type: "string" },
          imageCrop: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number", minimum: 0, maximum: 1000 },
              y: { type: "number", minimum: 0, maximum: 1000 },
              width: { type: "number", minimum: 90, maximum: 920 },
              height: { type: "number", minimum: 90, maximum: 920 }
            }
          }
        }
      }
    }
  }
} as const;

const TEXTBOOK_VISUAL_VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["visualIndex", "approved"],
        properties: {
          visualIndex: { type: "number", minimum: 1 },
          approved: { type: "boolean" }
        }
      }
    }
  }
} as const;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseVisualSelection(value: string): VisualSelectionResponse {
  const raw = cleanString(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as VisualSelectionResponse;
  } catch {
    return {};
  }
}

function parseVisualVerification(value: string): VisualVerificationResponse {
  const raw = cleanString(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as VisualVerificationResponse;
  } catch {
    return {};
  }
}

function normalizedCrop(value: NonNullable<VisualSelectionResponse["textbookCitations"]>[number]["imageCrop"]) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  const cropArea = width * height;

  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width < 90 ||
    height < 90 ||
    x + width > 1000 ||
    y + height > 1000 ||
    // A figure can be wide or tall, but it cannot be a cropped textbook page.
    // Figure 8.5 (the system-realization diagram) is well within this bound.
    cropArea > 480000
  ) {
    return null;
  }

  return { x, y, width, height };
}

function inlineAnchorCandidates(transcriptText: string) {
  const candidates: string[] = [];
  let inDisplayMath = false;

  for (const rawLine of transcriptText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === "\\[") {
      inDisplayMath = true;
      continue;
    }

    if (line === "\\]") {
      inDisplayMath = false;
      continue;
    }

    // ReviewMarkdownPreview renders display math as its own block, so an image
    // can only be placed reliably beside prose outside that block.
    if (
      inDisplayMath ||
      line.length < 28 ||
      line.length > 520 ||
      /^(?:#{1,4}\s|[-*]\s|\d+[.)]\s)/.test(line) ||
      /^textbook visual:/i.test(line)
    ) {
      continue;
    }

    // The renderer works line-by-line. A concise exact prefix is far more
    // reliable than a full paragraph when placing a figure beside its source.
    candidates.push(line.slice(0, 140).trim());
  }

  return [...new Set(candidates)].slice(0, 24);
}

export async function selectTextbookVisualCitations({
  client,
  model,
  pages,
  transcriptText
}: {
  client: OpenAI;
  model: string;
  pages: TextbookVisualPage[];
  transcriptText: string;
}) {
  const usablePages = pages.filter(
    (page) => Boolean(cleanString(page.textbookName)) && Number.isInteger(page.pageNumber) && Boolean(page.pageImageDataUrl)
  );

  if (!usablePages.length || !cleanString(transcriptText)) {
    return { citations: [] as TextbookVisualCitation[], usage: undefined };
  }

  const anchors = inlineAnchorCandidates(transcriptText);

  if (!anchors.length) {
    return { citations: [] as TextbookVisualCitation[], usage: undefined };
  }

  const pageManifest = usablePages
    .map((page, index) => `Image ${index + 1}: ${page.textbookName}, p. ${page.pageNumber}.`)
    .join("\n");
  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: [
        "You select only non-KaTeX textbook visuals for a saved engineering/math reconstruction.",
        "Return [] unless a supplied page contains a self-contained block diagram, signal-flow diagram, schematic, graph/plot, geometry diagram, map/chart, or photo/illustration that directly improves intuition. It is correct, and preferred, to return [] for pages containing only prose, equations, worked algebra, tables, or page layouts.",
        "A valid benchmark is Figure 8.5 in Roberts: crop the system-realization block diagram itself, not the textbook page around it. A valid crop must tightly bound one complete figure element with no surrounding explanatory paragraphs, no unrelated equations, no book/page header or footer, and no page margins. Include every arrow, curve, axis, label, and connection that belongs to that figure; leave a small whitespace rim on all four sides so no visual element is cut off. Reject a crop that would show only part of a figure, multiple partial figures, or any diagram element running into a crop edge. Keep a short figure label only if it is inseparable from the diagram.",
        "Never select a book cover, whole page, cropped page, equation, worked calculation, table of text, or paragraph. If the diagram can be written clearly as ordinary KaTeX, do not select it. The crop may cover no more than 48% of the page.",
        "Choose the anchorIndex for the exact reconstruction paragraph that this visual should appear after. Do not invent anchor text.",
        "Use the imageIndex from this manifest. The server, not you, will bind that index to the exact textbook and page:\n" + pageManifest,
        "Use the anchorIndex from this exact paragraph manifest:\n" + anchors.map((anchor, index) => `Anchor ${index + 1}: ${anchor}`).join("\n"),
        "Reconstruction:\n" + transcriptText.slice(0, 18000)
      ].join("\n\n")
    },
    ...usablePages.map((page) => ({
      type: "input_image" as const,
      image_url: page.pageImageDataUrl as string,
      detail: "high" as const
    }))
  ];
  const response = await client.responses.create({
    input: [{ role: "user", content }],
    instructions:
      "Return only the requested strict JSON. Every selected item must be a genuine non-KaTeX visual aid. Returning an empty array is the correct response if none qualifies.",
    model,
    text: {
      format: {
        type: "json_schema",
        name: "textbook_visual_selection",
        strict: true,
        schema: TEXTBOOK_VISUAL_SELECTION_SCHEMA
      }
    }
  });
  const selected = parseVisualSelection(response.output_text).textbookCitations || [];
  const seen = new Set<string>();
  const citations = selected.flatMap((citation) => {
    const page = usablePages[Math.floor(Number(citation.imageIndex)) - 1];
    const inlineAnchor = anchors[Math.floor(Number(citation.anchorIndex)) - 1] || "";
    const key = page ? `${page.textbookName.toLowerCase()}:${page.pageNumber}` : "";
    const crop = normalizedCrop(citation.imageCrop);
    const visualKind = isTextbookVisualKind(citation.visualKind) ? citation.visualKind : null;
    const whyNotKaTeX = cleanString(citation.whyNotKaTeX);

    if (!page || !crop || !inlineAnchor || !visualKind || !whyNotKaTeX || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{
      description: cleanString(citation.description) || "Textbook visual selected to clarify the nearby explanation.",
      imageCrop: crop,
      inlineAnchor,
      pageEnd: page.pageNumber,
      pageStart: page.pageNumber,
      textbookName: page.textbookName,
      visualKind,
      whyNotKaTeX
    }];
  });

  return { citations, usage: response.usage };
}

export async function verifyTextbookVisualCitations({
  candidates,
  client,
  model
}: {
  candidates: TextbookVisualCandidate[];
  client: OpenAI;
  model: string;
}) {
  const usableCandidates = candidates.filter((candidate) =>
    Boolean(cleanString(candidate.imageDataUrl)) &&
    isTextbookVisualKind(candidate.visualKind)
  );

  if (!usableCandidates.length) {
    return { citations: [] as TextbookVisualCandidate[], usage: undefined };
  }

  try {
    const response = await client.responses.create({
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Verify each supplied textbook crop before it is displayed inline in a reconstruction.",
              "Approve only when the crop pixels themselves clearly show one complete, self-contained non-KaTeX visual: a block/signal-flow diagram with connecting structure, schematic, graph or plot with axes/traces, geometry diagram, map/chart, or photo/illustration.",
              "Reject a crop that is prose, a section heading, caption, formula, worked calculation, table of text, book/page furniture, a blank area, or a page fragment. Also reject a crop with any arrow, axis, trace, label, connection, or diagram body cut off by a crop edge; with more than one partial figure; or with unrelated figure fragments. A heading that says 'system block diagram' is not a diagram and must be rejected. Do not infer a figure from surrounding text that is not visible in the crop.",
              "Figure 8.5's actual Direct Form II block diagram is approvable; a crop of the sentence or heading referring to that figure is not.",
              "Candidates:\n" + usableCandidates.map((candidate, index) =>
                `Visual ${index + 1}: ${candidate.visualKind}; ${candidate.description}; ${candidate.whyNotKaTeX}`
              ).join("\n")
            ].join("\n\n")
          },
          ...usableCandidates.map((candidate) => ({
            type: "input_image" as const,
            image_url: candidate.imageDataUrl,
            detail: "high" as const
          }))
        ]
      }],
      instructions: "Return only the requested strict JSON. Reject when uncertain; a missing textbook visual is better than an incorrect one.",
      model,
      text: {
        format: {
          type: "json_schema",
          name: "textbook_visual_verification",
          strict: true,
          schema: TEXTBOOK_VISUAL_VERIFICATION_SCHEMA
        }
      }
    });
    const approvedIndexes = new Set(
      (parseVisualVerification(response.output_text).verdicts || [])
        .filter((verdict) => verdict.approved === true)
        .map((verdict) => Math.floor(Number(verdict.visualIndex)) - 1)
        .filter((index) => index >= 0 && index < usableCandidates.length)
    );

    return {
      citations: usableCandidates.filter((_, index) => approvedIndexes.has(index)),
      usage: response.usage
    };
  } catch {
    // Verification failure is deliberately fail-closed: the lecture itself is
    // still usable, but an unverified image must never be displayed.
    return { citations: [] as TextbookVisualCandidate[], usage: undefined };
  }
}

export function ensureTextbookVisualAnchors(
  transcriptText: string,
  _citations: TextbookVisualCitation[]
) {
  // Citations use exact prose anchors chosen from transcriptText. Do not append
  // an image gallery or synthetic "visual aids" section when an anchor cannot
  // be found; an image belongs inline or it is omitted.
  return transcriptText.trim();
}
