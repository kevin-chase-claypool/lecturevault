import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import {
  TEXTBOOK_VISUAL_AUDIT_VERSION,
  normalizeTightTextbookFigureCrop
} from "./textbook-visual-contract";

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
  visualAuditVersion?: number;
};

type VisualVerificationResponse = {
  verdicts?: Array<{
    approved?: unknown;
    containsExactlyOneCompleteVisual?: unknown;
    containsSubstantialProse?: unknown;
    hasCutOffVisualElements?: unknown;
    hasUnrelatedVisualFragments?: unknown;
    observedVisualKind?: unknown;
    specificSubject?: unknown;
    visualIndex?: unknown;
  }>;
};

type VisualRelevanceResponse = {
  verdicts?: Array<{
    supportsInlineAnchor?: unknown;
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
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "visualIndex",
          "approved",
          "containsExactlyOneCompleteVisual",
          "containsSubstantialProse",
          "hasCutOffVisualElements",
          "hasUnrelatedVisualFragments",
          "observedVisualKind",
          "specificSubject"
        ],
        properties: {
          visualIndex: { type: "number", minimum: 1 },
          approved: { type: "boolean" },
          containsExactlyOneCompleteVisual: { type: "boolean" },
          containsSubstantialProse: { type: "boolean" },
          hasCutOffVisualElements: { type: "boolean" },
          hasUnrelatedVisualFragments: { type: "boolean" },
          observedVisualKind: { type: "string", enum: [...TEXTBOOK_VISUAL_KINDS, "none"] },
          specificSubject: { type: "string" }
        }
      }
    }
  }
} as const;

const TEXTBOOK_VISUAL_RELEVANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["visualIndex", "supportsInlineAnchor"],
        properties: {
          visualIndex: { type: "number", minimum: 1 },
          supportsInlineAnchor: { type: "boolean" }
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

function parseVisualRelevance(value: string): VisualRelevanceResponse {
  const raw = cleanString(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as VisualRelevanceResponse;
  } catch {
    return {};
  }
}

function isApprovedVisualVerdict(
  verdict: NonNullable<VisualVerificationResponse["verdicts"]>[number]
) {
  return (
    verdict.approved === true &&
    verdict.containsExactlyOneCompleteVisual === true &&
    verdict.containsSubstantialProse === false &&
    verdict.hasCutOffVisualElements === false &&
    verdict.hasUnrelatedVisualFragments === false &&
    isTextbookVisualKind(verdict.observedVisualKind) &&
    cleanString(verdict.specificSubject).length >= 12
  );
}

function normalizedCrop(value: NonNullable<VisualSelectionResponse["textbookCitations"]>[number]["imageCrop"]) {
  return normalizeTightTextbookFigureCrop(value);
}

function inlineAnchorCandidates(transcriptText: string) {
  const candidates: string[] = [];
  let inDisplayMath = false;
  let referenceOnlySection = false;

  for (const rawLine of transcriptText.split(/\r?\n/)) {
    const line = rawLine.trim();

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      referenceOnlySection = /^(?:source media used|textbook context used)$/i.test(heading[1].trim());
      continue;
    }

    if (line === "\\[") {
      inDisplayMath = true;
      continue;
    }

    if (line === "\\]") {
      inDisplayMath = false;
      continue;
    }

    // ReviewMarkdownPreview renders display math as its own block, so an image
    // can only be placed reliably beside prose outside that block. Provenance
    // sections are evidence records, never teaching anchors.
    if (
      referenceOnlySection ||
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

  return [...new Set(candidates)];
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
        "Return [] only when no supplied page contains a self-contained block diagram, signal-flow diagram, schematic, graph/plot, geometry diagram, map/chart, or photo/illustration that directly improves intuition. It is correct to return [] for pages containing only prose, equations, worked algebra, tables, or page layouts.",
        "Be comprehensive rather than minimal: inspect every supplied page and select every distinct qualifying visual that materially supports a different beginner-facing explanation, process, or worked step. There is no numeric visual quota. Dense source material can legitimately need several visuals. You may select multiple figures from one page only when they are separate complete visual elements with distinct instructional value; do not repeat a figure or select a merely decorative visual.",
        "A valid benchmark is Figure 8.5 in Roberts: crop the system-realization block diagram itself, not the textbook page around it. A valid crop must tightly bound one complete figure element with no surrounding explanatory paragraphs, no unrelated equations, no book/page header or footer, and no page margins. Include every arrow, curve, axis, label, and connection that belongs to that figure; leave a small whitespace rim on all four sides so no visual element is cut off. Reject a crop that would show only part of a figure, multiple partial figures, or any diagram element running into a crop edge. Keep a short figure label only if it is inseparable from the diagram.",
        "Never select a book cover, whole page, cropped page, equation, worked calculation, table of text, or paragraph. If the diagram can be written clearly as ordinary KaTeX, do not select it. The crop may cover no more than 48% of the page.",
        "Choose the anchorIndex for the exact Structured Notes, Guided Lesson, Worked Problems, or Common Mistakes paragraph that this visual should appear after. Never choose Source Media Used or Textbook Context Used: those are provenance sections, not explanation.",
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
  const seenCrops = new Set<string>();
  const citations = selected.flatMap((citation) => {
    const page = usablePages[Math.floor(Number(citation.imageIndex)) - 1];
    const inlineAnchor = anchors[Math.floor(Number(citation.anchorIndex)) - 1] || "";
    const crop = normalizedCrop(citation.imageCrop);
    const visualKind = isTextbookVisualKind(citation.visualKind) ? citation.visualKind : null;
    const whyNotKaTeX = cleanString(citation.whyNotKaTeX);
    const cropKey = page && crop
      ? `${page.textbookName.toLowerCase()}:${page.pageNumber}:${crop.x}:${crop.y}:${crop.width}:${crop.height}`
      : "";

    if (!page || !crop || !inlineAnchor || !visualKind || !whyNotKaTeX || seenCrops.has(cropKey)) {
      return [];
    }

    seenCrops.add(cropKey);
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
    // This pass receives pixels only. It deliberately does not see the
    // selector's claimed figure type, page number, rationale, or lesson
    // anchor, because those claims were biasing it into approving broad page
    // regions that looked generally related to the topic.
    const pixelAudit = await client.responses.create({
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Blind pixel audit for textbook crops. Do not provide the selector's claimed visual kind, rationale, textbook page, or teaching anchor; judge only the pixels in each crop.",
              "Audit every candidate independently. approved may be true only when all of these are true: containsExactlyOneCompleteVisual; containsSubstantialProse is false; hasCutOffVisualElements is false; and hasUnrelatedVisualFragments is false.",
              "containsExactlyOneCompleteVisual is true only for one self-contained non-KaTeX block/signal-flow diagram with connecting structure, schematic, graph/plot with axes/traces, geometry diagram, map/chart, or photo/illustration. A page heading, figure caption, equation, worked calculation, table of text, list of contents, exercise wording, or prose is never a visual. A short title inseparable from the selected diagram is allowed; axis labels, node labels, and callouts do not count as prose.",
              "containsSubstantialProse is true when the crop includes any paragraph, exercise question, table of contents, chapter/section heading, page header/footer, code listing, or other book furniture. hasCutOffVisualElements is true when any intended arrow, axis, trace, label, connection, or diagram body reaches or is cut by a crop edge. hasUnrelatedVisualFragments is true when the crop includes another partial diagram, graph, or illustration.",
              "observedVisualKind must name the one visible visual type, or none. specificSubject must identify what this particular visual depicts with enough precision to distinguish it from a generic topic; for example, say 'windowed FIR side-lobe response' rather than 'frequency response graph'. Reject a crop whenever any audit condition is uncertain. A missing figure is better than a page fragment. Do not impose a numeric approval quota.",
              "Candidates: " + usableCandidates.map((_, index) => `Visual ${index + 1}`).join(", ")
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
    const pixelAuditedCandidates = (parseVisualVerification(pixelAudit.output_text).verdicts || [])
      .flatMap((verdict) => {
        const index = Math.floor(Number(verdict.visualIndex)) - 1;
        const candidate = usableCandidates[index];
        const observedVisualKind = isTextbookVisualKind(verdict.observedVisualKind)
          ? verdict.observedVisualKind
          : null;
        const specificSubject = cleanString(verdict.specificSubject);

        if (
          !candidate ||
          !isApprovedVisualVerdict(verdict) ||
          !observedVisualKind ||
          observedVisualKind !== candidate.visualKind ||
          !specificSubject
        ) {
          return [];
        }

        return [{
          ...candidate,
          visualAuditVersion: TEXTBOOK_VISUAL_AUDIT_VERSION,
          visualSubject: specificSubject
        }];
      });

    if (!pixelAuditedCandidates.length) {
      return { citations: [] as TextbookVisualCandidate[], usage: pixelAudit.usage };
    }

    // Relevance is intentionally a separate decision from pixel quality. It
    // gets the independently observed subject—not the selector's rationale—so
    // a generic graph about an adjacent textbook topic cannot be attached to a
    // more specific explanation such as active RLC biquad realization.
    const relevanceAudit = await client.responses.create({
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: [
            "Decide whether each already pixel-audited textbook figure directly teaches its exact reconstruction paragraph.",
            "supportsInlineAnchor may be true only when the specific visual subject explains the exact paragraph, process, or worked step. General topical overlap is not enough: a windowed-FIR response graph does not teach an active-RLC biquad or pole-zero-realization explanation merely because both concern frequency response.",
            "Reject when the stated figure subject is generic, tangential, or insufficiently specific. Do not infer relevance from a textbook page number or a selector rationale.",
            "Candidates:\n" + pixelAuditedCandidates.map((candidate, index) =>
              `Visual ${index + 1}: subject: ${candidate.visualSubject}; exact paragraph: ${candidate.inlineAnchor}`
            ).join("\n")
          ].join("\n\n")
        }]
      }],
      instructions: "Return only the requested strict JSON. Reject when uncertain.",
      model,
      text: {
        format: {
          type: "json_schema",
          name: "textbook_visual_relevance",
          strict: true,
          schema: TEXTBOOK_VISUAL_RELEVANCE_SCHEMA
        }
      }
    });
    const relevantIndexes = new Set(
      (parseVisualRelevance(relevanceAudit.output_text).verdicts || [])
        .filter((verdict) => verdict.supportsInlineAnchor === true)
        .map((verdict) => Math.floor(Number(verdict.visualIndex)) - 1)
        .filter((index) => index >= 0 && index < pixelAuditedCandidates.length)
    );

    return {
      citations: pixelAuditedCandidates
        .filter((_, index) => relevantIndexes.has(index))
        .map(({ visualSubject: _visualSubject, ...candidate }) => candidate),
      usage: {
        input_tokens: (pixelAudit.usage?.input_tokens || 0) + (relevanceAudit.usage?.input_tokens || 0) || undefined,
        output_tokens: (pixelAudit.usage?.output_tokens || 0) + (relevanceAudit.usage?.output_tokens || 0) || undefined,
        total_tokens: (pixelAudit.usage?.total_tokens || 0) + (relevanceAudit.usage?.total_tokens || 0) || undefined
      }
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
