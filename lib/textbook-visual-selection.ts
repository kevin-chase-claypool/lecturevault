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
};

type VisualSelectionResponse = {
  textbookCitations?: Array<{
    description?: unknown;
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

const TEXTBOOK_VISUAL_SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["textbookCitations"],
  properties: {
    textbookCitations: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["imageIndex", "anchorIndex", "description", "imageCrop"],
        properties: {
          imageIndex: { type: "number", minimum: 1 },
          anchorIndex: { type: "number", minimum: 1 },
          description: { type: "string" },
          imageCrop: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number", minimum: 0, maximum: 1000 },
              y: { type: "number", minimum: 0, maximum: 1000 },
              width: { type: "number", minimum: 70, maximum: 1000 },
              height: { type: "number", minimum: 70, maximum: 1000 }
            }
          }
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
    width < 70 ||
    height < 70 ||
    x + width > 1000 ||
    y + height > 1000 ||
    cropArea > 700000
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
        "You select textbook visuals for a saved engineering/math reconstruction.",
        "Choose one to three supplied textbook diagrams, plots, tables, worked layouts, or textbook illustrations that directly improve intuitive understanding of the reconstruction. At least one source page was retrieved as relevant, so do not return an empty array.",
        "For every selected visual, return a tight normalized 0-1000 crop around the visual itself. Never crop an entire page, body prose, a book cover, or an equation alone. A crop may cover no more than 70% of the page.",
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
      "Return only the requested strict JSON. A textbook visual must be a self-contained aid that is useful beside the cited explanation; do not return page screenshots.",
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

    if (!page || !crop || !inlineAnchor || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{
      description: cleanString(citation.description) || "Textbook visual selected to clarify the nearby explanation.",
      imageCrop: crop,
      inlineAnchor,
      pageEnd: page.pageNumber,
      pageStart: page.pageNumber,
      textbookName: page.textbookName
    }];
  });

  return { citations, usage: response.usage };
}

export function ensureTextbookVisualAnchors(
  transcriptText: string,
  citations: TextbookVisualCitation[]
) {
  let nextText = transcriptText.trim();
  const normalizeForAnchorMatch = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedTranscript = normalizeForAnchorMatch(nextText);
  const missing = citations.filter((citation) =>
    !citation.inlineAnchor || !normalizedTranscript.includes(normalizeForAnchorMatch(citation.inlineAnchor))
  );

  if (!missing.length) {
    return nextText;
  }

  const appendix = missing.map((citation) => {
    const anchor = `Textbook visual: ${citation.textbookName}, p. ${citation.pageStart}`;
    citation.inlineAnchor = anchor;
    return `${anchor}. ${citation.description} Textbook reference: ${citation.textbookName}, p. ${citation.pageStart}.`;
  });

  return [nextText, "### Textbook Visual Aids", ...appendix].filter(Boolean).join("\n\n");
}
