import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import {
  TEXTBOOK_VISUAL_AUDIT_VERSION,
  normalizeTightTextbookFigureCrop
} from "./textbook-visual-contract";

export type TextbookVisualPage = {
  embeddedImages?: Array<{
    dataUrl?: string;
    filename?: string;
    height?: number;
    width?: number;
  }>;
  pageImageDataUrl?: string;
  selectionImageDataUrl?: string;
  pageNumber: number;
  textbookName: string;
};

export type TextbookVisualSourceKind = "page_crop" | "embedded_image";

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

export type TextbookVisualSelectionCitation = TextbookVisualCitation & {
  sourceDataUrl: string;
  sourceFilename?: string;
  sourceKind: TextbookVisualSourceKind;
  sourceKey: string;
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
    sourceIndex?: unknown;
  }>;
};

type VisualDiscoveryResponse = {
  figures?: Array<{
    description?: unknown;
    visualKind?: unknown;
    whyNotKaTeX?: unknown;
    imageCrop?: {
      height?: unknown;
      width?: unknown;
      x?: unknown;
      y?: unknown;
    } | null;
  }>;
};

type VisualAnchorResponse = {
  assignments?: Array<{
    anchorIndex?: unknown;
    visualIndex?: unknown;
  }>;
};

export type TextbookVisualCandidate = TextbookVisualCitation & {
  imageDataUrl: string;
  imageFilename?: string;
  sourceKey?: string;
  visualAuditVersion?: number;
};

export type TextbookVisualRejection = {
  imageCrop: TextbookVisualCitation["imageCrop"];
  pageNumber: number;
  reason: string;
  sourceKey?: string;
  sourceKind?: TextbookVisualSourceKind;
  textbookName: string;
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
        required: ["sourceIndex", "anchorIndex", "description", "visualKind", "whyNotKaTeX", "imageCrop"],
        properties: {
          sourceIndex: { type: "number", minimum: 1 },
          anchorIndex: { type: "number", minimum: 1 },
          description: { type: "string" },
          visualKind: { type: "string", enum: TEXTBOOK_VISUAL_KINDS },
          whyNotKaTeX: { type: "string" },
          imageCrop: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "width", "height"],
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1000 },
                  y: { type: "number", minimum: 0, maximum: 1000 },
                  width: { type: "number", minimum: 90, maximum: 920 },
                  height: { type: "number", minimum: 90, maximum: 920 }
                }
              },
              { type: "null" }
            ]
          }
        }
      }
    }
  }
} as const;

const TEXTBOOK_VISUAL_DISCOVERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["figures"],
  properties: {
    figures: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "visualKind", "whyNotKaTeX", "imageCrop"],
        properties: {
          description: { type: "string" },
          visualKind: { type: "string", enum: TEXTBOOK_VISUAL_KINDS },
          whyNotKaTeX: { type: "string" },
          imageCrop: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "width", "height"],
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1000 },
                  y: { type: "number", minimum: 0, maximum: 1000 },
                  width: { type: "number", minimum: 90, maximum: 920 },
                  height: { type: "number", minimum: 90, maximum: 920 }
                }
              },
              { type: "null" }
            ]
          }
        }
      }
    }
  }
} as const;

const TEXTBOOK_VISUAL_ANCHOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assignments"],
  properties: {
    assignments: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["visualIndex", "anchorIndex"],
        properties: {
          visualIndex: { type: "number", minimum: 1 },
          anchorIndex: { type: "number", minimum: 1 }
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

type TextbookVisualSource = {
  dataUrl: string;
  filename?: string;
  pageNumber: number;
  selectionDataUrl?: string;
  sourceKey: string;
  sourceKind: TextbookVisualSourceKind;
  textbookName: string;
};

// PDF extraction can expose a figure as an isolated bitmap in addition to a
// rendered page. Keep both representations: vector diagrams still need a
// tight page crop, while isolated textbook figures can bypass the fragile crop
// step and then face the same independent pixel and relevance audits.
export function textbookVisualSources(pages: TextbookVisualPage[]): TextbookVisualSource[] {
  return pages.flatMap((page) => {
    const textbookName = cleanString(page.textbookName);
    const pageNumber = Number(page.pageNumber);

    if (!textbookName || !Number.isInteger(pageNumber)) {
      return [];
    }

    const pageKey = `${textbookName.toLowerCase()}:${pageNumber}`;
    const sources: TextbookVisualSource[] = [];
    const pageImageDataUrl = cleanString(page.pageImageDataUrl);
    const selectionImageDataUrl = cleanString(page.selectionImageDataUrl);

    if (pageImageDataUrl) {
      sources.push({
        dataUrl: pageImageDataUrl,
        pageNumber,
        selectionDataUrl: selectionImageDataUrl || pageImageDataUrl,
        sourceKey: `${pageKey}:page`,
        sourceKind: "page_crop",
        textbookName
      });
    }

    for (const [imageIndex, image] of (page.embeddedImages || []).entries()) {
      const dataUrl = cleanString(image.dataUrl);

      if (!dataUrl) {
        continue;
      }

      sources.push({
        dataUrl,
        filename: cleanString(image.filename) || undefined,
        pageNumber,
        sourceKey: `${pageKey}:embedded:${imageIndex + 1}`,
        sourceKind: "embedded_image",
        textbookName
      });
    }

    return sources;
  });
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

function parseVisualDiscovery(value: string): VisualDiscoveryResponse {
  const raw = cleanString(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!raw) return {};

  try {
    return JSON.parse(raw) as VisualDiscoveryResponse;
  } catch {
    return {};
  }
}

function parseVisualAnchors(value: string): VisualAnchorResponse {
  const raw = cleanString(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!raw) return {};

  try {
    return JSON.parse(raw) as VisualAnchorResponse;
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

function cropOverlap(
  left: NonNullable<TextbookVisualCitation["imageCrop"]>,
  right: NonNullable<TextbookVisualCitation["imageCrop"]>
) {
  const horizontal = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const vertical = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = horizontal * vertical;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function rejectionReason(
  verdict: NonNullable<VisualVerificationResponse["verdicts"]>[number] | undefined
) {
  if (!verdict) return "The pixel audit did not return a verdict for this crop.";
  if (verdict.containsSubstantialProse === true) return "The crop contains textbook prose or page furniture rather than an isolated figure.";
  if (verdict.containsExactlyOneCompleteVisual !== true) return "The crop does not contain exactly one complete non-KaTeX visual.";
  if (verdict.hasCutOffVisualElements === true) return "The crop cuts off a required diagram, graph, or label.";
  if (verdict.hasUnrelatedVisualFragments === true) return "The crop includes unrelated visual fragments.";
  return "The pixel audit could not verify this crop as a displayable textbook figure.";
}

function combinedUsage(values: Array<{ input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined>) {
  const input_tokens = values.reduce((total, usage) => total + (usage?.input_tokens || 0), 0);
  const output_tokens = values.reduce((total, usage) => total + (usage?.output_tokens || 0), 0);
  const total_tokens = values.reduce((total, usage) => total + (usage?.total_tokens || 0), 0);

  return {
    input_tokens: input_tokens || undefined,
    output_tokens: output_tokens || undefined,
    total_tokens: total_tokens || undefined
  };
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
  transcriptText,
  retry = false,
  previousRejections = []
}: {
  client: OpenAI;
  model: string;
  pages: TextbookVisualPage[];
  previousRejections?: TextbookVisualRejection[];
  retry?: boolean;
  transcriptText: string;
}) {
  const usableSources = textbookVisualSources(pages);

  if (!usableSources.length || !cleanString(transcriptText)) {
    return { citations: [] as TextbookVisualSelectionCitation[], usage: undefined };
  }

  const anchors = inlineAnchorCandidates(transcriptText);

  if (!anchors.length) {
    return { citations: [] as TextbookVisualSelectionCitation[], usage: undefined };
  }

  const sourceManifest = usableSources
    .map((source, index) =>
      source.sourceKind === "embedded_image"
        ? `Source ${index + 1}: isolated embedded textbook figure from ${source.textbookName}, p. ${source.pageNumber}. Use imageCrop: null.`
        : `Source ${index + 1}: rendered textbook page ${source.textbookName}, p. ${source.pageNumber}. Use a tight imageCrop.`
    )
    .join("\n");
  const retryFeedback = previousRejections
    .slice(0, 12)
    .map((rejection) => {
      const sourceIndex = usableSources.findIndex((source) => source.sourceKey === rejection.sourceKey) + 1;
      const sourceLabel = sourceIndex
        ? `Source ${sourceIndex}`
        : `${rejection.textbookName}, p. ${rejection.pageNumber}`;
      const crop = rejection.imageCrop
        ? ` at x=${rejection.imageCrop.x}, y=${rejection.imageCrop.y}, width=${rejection.imageCrop.width}, height=${rejection.imageCrop.height}`
        : "";
      return `${sourceLabel}${crop} was rejected: ${rejection.reason}`;
    })
    .join("\n");
  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: [
        "You select only non-KaTeX textbook visuals for a saved engineering/math reconstruction.",
        retry
          ? "A prior visual pass did not produce any safely displayable figure. Reinspect every supplied source carefully for complete source diagrams, schematics, plots, or illustrations that directly teach the lesson. Do not reuse an exact rejected crop. If it was rejected for prose or no complete visual, abandon that region and choose a different figure; only revise a crop on the same page when the new tight bounds clearly remove the stated defect."
          : "Inspect every supplied source carefully before deciding that no visual qualifies.",
        "Return [] only when no supplied source contains a self-contained block diagram, signal-flow diagram, schematic, graph/plot, geometry diagram, map/chart, or photo/illustration that directly improves intuition. It is correct to return [] for sources containing only prose, equations, worked algebra, tables, or page layouts.",
        "Be comprehensive rather than minimal: inspect every supplied page and select every distinct qualifying visual that materially supports a different beginner-facing explanation, process, or worked step. There is no numeric visual quota. Dense source material can legitimately need several visuals. You may select multiple figures from one page only when they are separate complete visual elements with distinct instructional value; do not repeat a figure or select a merely decorative visual.",
        "A valid benchmark is Figure 8.5 in Roberts: crop the system-realization block diagram itself, not the textbook page around it. A valid crop must tightly bound one complete figure element with no surrounding explanatory paragraphs, no unrelated equations, no book/page header or footer, and no page margins. Include every arrow, curve, axis, label, and connection that belongs to that figure; leave a small whitespace rim on all four sides so no visual element is cut off. Reject a crop that would show only part of a figure, multiple partial figures, or any diagram element running into a crop edge. Keep a short figure label only if it is inseparable from the diagram.",
        "Never select a book cover, whole page, cropped page, equation, worked calculation, table of text, or paragraph. If the diagram can be written clearly as ordinary KaTeX, do not select it. A rendered-page crop may cover no more than 36% of the page and must leave at least 24 page-coordinate units of whitespace on every side. Rendered-page sources include a faint orange coordinate grid: it is a selection guide only, not textbook content. Use the 0–1000 labels to specify the actual figure bounds precisely. For an isolated embedded textbook figure, select it only when the asset itself is exactly one complete visual and set imageCrop to null.",
        retryFeedback ? `Pixel-audit feedback from the prior pass:\n${retryFeedback}` : "",
        "Choose the anchorIndex for the exact Structured Notes, Guided Lesson, Worked Problems, or Common Mistakes paragraph that this visual should appear after. Never choose Source Media Used or Textbook Context Used: those are provenance sections, not explanation.",
        "Use the sourceIndex from this manifest. The server, not you, will bind that index to the exact textbook asset and page:\n" + sourceManifest,
        "Use the anchorIndex from this exact paragraph manifest:\n" + anchors.map((anchor, index) => `Anchor ${index + 1}: ${anchor}`).join("\n"),
        "Reconstruction:\n" + transcriptText.slice(0, 18000)
      ].join("\n\n")
    },
    ...usableSources.map((source) => ({
      type: "input_image" as const,
      image_url: source.selectionDataUrl || source.dataUrl,
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
  const seenEmbeddedSources = new Set<string>();
  const selectedCropsBySource = new Map<string, NonNullable<TextbookVisualCitation["imageCrop"]>[]>();
  const citations = selected.flatMap((citation) => {
    const source = usableSources[Math.floor(Number(citation.sourceIndex)) - 1];
    const inlineAnchor = anchors[Math.floor(Number(citation.anchorIndex)) - 1] || "";
    const crop = source?.sourceKind === "page_crop" ? normalizedCrop(citation.imageCrop) : null;
    const visualKind = isTextbookVisualKind(citation.visualKind) ? citation.visualKind : null;
    const whyNotKaTeX = cleanString(citation.whyNotKaTeX);
    const isValidSourceSelection = Boolean(source) && (
      source?.sourceKind === "page_crop"
        ? Boolean(crop)
        : citation.imageCrop === null
    );

    const priorCrops = crop ? selectedCropsBySource.get(source?.sourceKey || "") || [] : [];
    const repeatsExistingPageVisual = Boolean(crop && priorCrops.some((priorCrop) => cropOverlap(priorCrop, crop) >= 0.7));
    const repeatsEmbeddedVisual = source?.sourceKind === "embedded_image" && seenEmbeddedSources.has(source.sourceKey);

    if (
      !source ||
      !isValidSourceSelection ||
      !inlineAnchor ||
      !visualKind ||
      !whyNotKaTeX ||
      repeatsExistingPageVisual ||
      repeatsEmbeddedVisual
    ) {
      return [];
    }

    if (crop) {
      selectedCropsBySource.set(source.sourceKey, [...priorCrops, crop]);
    } else {
      seenEmbeddedSources.add(source.sourceKey);
    }
    return [{
      description: cleanString(citation.description) || "Textbook visual selected to clarify the nearby explanation.",
      imageCrop: crop,
      inlineAnchor,
      pageEnd: source.pageNumber,
      pageStart: source.pageNumber,
      sourceDataUrl: source.dataUrl,
      sourceFilename: source.filename,
      sourceKind: source.sourceKind,
      sourceKey: source.sourceKey,
      textbookName: source.textbookName,
      visualKind,
      whyNotKaTeX
    }];
  });

  return { citations, usage: response.usage };
}

/**
 * Fallback for dense or visually mixed textbook pages. The ordinary selector
 * compares the full set of retrieved pages at once, which is economical but
 * can confuse nearby prose with a figure when several pages show related
 * engineering notation. This path has the model inspect every source alone,
 * with the same coordinate guide, then assigns only discovered figures to
 * lesson anchors. It never manufactures a visual and remains subject to the
 * independent pixel and relevance audits below.
 */
export async function discoverTextbookVisualCitations({
  client,
  model,
  pages,
  previousRejections = [],
  transcriptText
}: {
  client: OpenAI;
  model: string;
  pages: TextbookVisualPage[];
  previousRejections?: TextbookVisualRejection[];
  transcriptText: string;
}) {
  const usableSources = textbookVisualSources(pages);
  const anchors = inlineAnchorCandidates(transcriptText);

  if (!usableSources.length || !anchors.length) {
    return { citations: [] as TextbookVisualSelectionCitation[], usage: undefined };
  }

  const discoveries = await Promise.all(usableSources.map(async (source) => {
    const rejectedCrops = previousRejections
      .filter((rejection) => rejection.sourceKey === source.sourceKey && rejection.imageCrop)
      .map((rejection) => ({ crop: rejection.imageCrop, reason: rejection.reason }));
    const refinementFeedback = rejectedCrops.length
      ? [
          "A prior crop from this exact source was rejected by an independent pixel audit. Repair the crop rather than repeating it verbatim.",
          ...rejectedCrops.map(({ crop, reason }) =>
            `Rejected crop: x=${crop?.x}, y=${crop?.y}, width=${crop?.width}, height=${crop?.height}. Reason: ${reason}`
          ),
          "If the rejection says prose, remove surrounding paragraphs, exercise text, headers, footers, and page furniture while retaining figure-internal axis labels, legends, node labels, callouts, and a short inseparable Figure label. If it says cut off, expand only enough to include the missing visual element and whitespace rim. Do not return the same rejected bounds."
        ].join("\n")
      : "";

    try {
      const response = await client.responses.create({
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Inspect exactly one textbook source for visual aids that cannot be written clearly in KaTeX.",
              source.sourceKind === "embedded_image"
                ? "This is an isolated embedded image. Return it only if it is exactly one complete, useful diagram, schematic, graph/plot, geometry figure, chart, or illustration; imageCrop must be null."
                : "This is one rendered textbook page with a faint orange 0–1000 coordinate guide. Return every distinct complete diagram, schematic, graph/plot, geometry figure, chart, or illustration that is useful on its own. Use the guide to give tight bounds around one figure only.",
              "Do not return a heading, caption paragraph, equation, worked algebra, table, book cover, broad page region, or decorative visual. A valid crop includes every required arrow, trace, axis, label, legend, node label, in-figure formula, and connection plus a small whitespace rim, but no surrounding textbook prose, other figure fragments, header, footer, or margins. Text that belongs to the visual itself is allowed; narrative text outside the visual is not. A multi-panel graphic under one shared figure label counts as one figure when its panels jointly explain one concept. The guide is synthetic and will not appear in the final crop.",
              refinementFeedback,
              "There is no numerical quota: return all distinct qualifying figures in this one source, or an empty array when it contains none."
            ].join("\n\n")
          },
          {
            type: "input_image",
            image_url: source.selectionDataUrl || source.dataUrl,
            detail: "high"
          }
        ]
      }],
      instructions: "Return only the requested strict JSON. Do not guess a figure when the pixels show only prose, equations, or page layout.",
      model,
      text: {
        format: {
          type: "json_schema",
          name: "textbook_visual_discovery",
          strict: true,
          schema: TEXTBOOK_VISUAL_DISCOVERY_SCHEMA
        }
      }
    });

      return {
        figures: parseVisualDiscovery(response.output_text).figures || [],
        source,
        usage: response.usage
      };
    } catch {
      // A transient model failure for one page must not prevent valid figures
      // from the remaining cited pages from reaching the independent audit.
      return { figures: [], source, usage: undefined };
    }
  }));
  const usage = combinedUsage(discoveries.map((discovery) => discovery.usage));
  const seenEmbeddedSources = new Set<string>();
  const selectedCropsBySource = new Map<string, NonNullable<TextbookVisualCitation["imageCrop"]>[]>();
  const discovered = discoveries.flatMap(({ figures, source }) => figures.flatMap((figure) => {
    const crop = source.sourceKind === "page_crop" ? normalizedCrop(figure.imageCrop) : null;
    const visualKind = isTextbookVisualKind(figure.visualKind) ? figure.visualKind : null;
    const whyNotKaTeX = cleanString(figure.whyNotKaTeX);
    const isValid = source.sourceKind === "page_crop" ? Boolean(crop) : figure.imageCrop === null;
    const priorCrops = crop ? selectedCropsBySource.get(source.sourceKey) || [] : [];
    const repeatsPageVisual = Boolean(crop && priorCrops.some((priorCrop) => cropOverlap(priorCrop, crop) >= 0.7));
    const repeatsEmbeddedVisual = source.sourceKind === "embedded_image" && seenEmbeddedSources.has(source.sourceKey);

    if (!isValid || !visualKind || !whyNotKaTeX || repeatsPageVisual || repeatsEmbeddedVisual) {
      return [];
    }

    if (crop) {
      selectedCropsBySource.set(source.sourceKey, [...priorCrops, crop]);
    } else {
      seenEmbeddedSources.add(source.sourceKey);
    }

    return [{
      description: cleanString(figure.description) || "Textbook figure selected to clarify the nearby explanation.",
      imageCrop: crop,
      pageEnd: source.pageNumber,
      pageStart: source.pageNumber,
      source,
      visualKind,
      whyNotKaTeX
    }];
  }));

  if (!discovered.length) {
    return { citations: [] as TextbookVisualSelectionCitation[], usage };
  }

  const anchoring = await client.responses.create({
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: [
          "Attach each textbook visual to an exact explanatory paragraph in this engineering reconstruction.",
          "Assign a visual only when its described subject directly improves that specific beginner-facing explanation. Select all direct matches; there is no numerical quota. Do not select source/provenance paragraphs.",
          "Discovered visuals:\n" + discovered.map((figure, index) =>
            `Visual ${index + 1}: ${figure.visualKind}; ${figure.description}; why image not KaTeX: ${figure.whyNotKaTeX}`
          ).join("\n"),
          "Explanatory paragraphs:\n" + anchors.map((anchor, index) => `Anchor ${index + 1}: ${anchor}`).join("\n")
        ].join("\n\n")
      }]
    }],
    instructions: "Return only the requested strict JSON. Omit a visual if no exact explanatory anchor fits it.",
    model,
    text: {
      format: {
        type: "json_schema",
        name: "textbook_visual_anchors",
        strict: true,
        schema: TEXTBOOK_VISUAL_ANCHOR_SCHEMA
      }
    }
  });
  const assignedVisualIndexes = new Set<number>();
  const citations = (parseVisualAnchors(anchoring.output_text).assignments || []).flatMap((assignment) => {
    const visualIndex = Math.floor(Number(assignment.visualIndex)) - 1;
    const anchorIndex = Math.floor(Number(assignment.anchorIndex)) - 1;
    const figure = discovered[visualIndex];
    const inlineAnchor = anchors[anchorIndex] || "";

    if (!figure || !inlineAnchor || assignedVisualIndexes.has(visualIndex)) {
      return [];
    }

    assignedVisualIndexes.add(visualIndex);
    return [{
      description: figure.description,
      imageCrop: figure.imageCrop,
      inlineAnchor,
      pageEnd: figure.pageEnd,
      pageStart: figure.pageStart,
      sourceDataUrl: figure.source.dataUrl,
      sourceFilename: figure.source.filename,
      sourceKey: figure.source.sourceKey,
      sourceKind: figure.source.sourceKind,
      textbookName: figure.source.textbookName,
      visualKind: figure.visualKind,
      whyNotKaTeX: figure.whyNotKaTeX
    }];
  });

  return {
    citations,
    usage: combinedUsage([usage, anchoring.usage])
  };
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
    return {
      citations: [] as TextbookVisualCandidate[],
      rejections: [] as TextbookVisualRejection[],
      usage: undefined
    };
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
              "containsExactlyOneCompleteVisual is true only for one cohesive, self-contained non-KaTeX figure: a block/signal-flow diagram with connecting structure, schematic, graph/plot with axes/traces, geometry diagram, map/chart, or photo/illustration. A named multi-panel figure counts as one cohesive visual when its panels share a legend, caption, or concept; do not reject it merely because it contains multiple related plots. A page heading, long caption paragraph, equation presented as the lesson content, worked calculation, table of text, list of contents, exercise wording, or prose is never a visual. A short Figure label, axis labels, legend text, node labels, in-figure equations, and callouts that belong to the diagram do not count as prose.",
              "containsSubstantialProse is true only when the crop contains narrative textbook paragraphs, an exercise question, table of contents, chapter/section heading, page header/footer, code listing, or other book furniture outside the figure. Do not call a graph's labels, a diagram's callouts, or a short inseparable figure caption prose. hasCutOffVisualElements is true when any intended arrow, axis, trace, label, connection, or diagram body reaches or is cut by a crop edge. hasUnrelatedVisualFragments is true when the crop includes another partial diagram, graph, or illustration unrelated to the one cohesive figure.",
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
    const pixelVerdicts = parseVisualVerification(pixelAudit.output_text).verdicts || [];
    console.info("[textbook-visual-selection] pixel audit", pixelVerdicts.map((verdict) => ({
      approved: verdict.approved === true,
      containsExactlyOneCompleteVisual: verdict.containsExactlyOneCompleteVisual === true,
      containsSubstantialProse: verdict.containsSubstantialProse === true,
      hasCutOffVisualElements: verdict.hasCutOffVisualElements === true,
      hasUnrelatedVisualFragments: verdict.hasUnrelatedVisualFragments === true,
      observedVisualKind: cleanString(verdict.observedVisualKind),
      visualIndex: Number(verdict.visualIndex)
    })));
    const verdictByCandidateIndex = new Map<number, NonNullable<VisualVerificationResponse["verdicts"]>[number]>();
    for (const verdict of pixelVerdicts) {
      const index = Math.floor(Number(verdict.visualIndex)) - 1;
      if (index >= 0 && index < usableCandidates.length && !verdictByCandidateIndex.has(index)) {
        verdictByCandidateIndex.set(index, verdict);
      }
    }
    const pixelAuditedCandidates = pixelVerdicts
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
    const pixelRejections = usableCandidates.flatMap((candidate, index) => {
      const verdict = verdictByCandidateIndex.get(index);
      const observedVisualKind = isTextbookVisualKind(verdict?.observedVisualKind)
        ? verdict.observedVisualKind
        : null;
      const isApproved = Boolean(
        verdict &&
        isApprovedVisualVerdict(verdict) &&
        observedVisualKind === candidate.visualKind &&
        cleanString(verdict.specificSubject)
      );

      return isApproved
        ? []
        : [{
            imageCrop: candidate.imageCrop,
            pageNumber: candidate.pageStart,
            reason: rejectionReason(verdict),
            sourceKey: candidate.sourceKey,
            textbookName: candidate.textbookName
          }];
    });

    if (!pixelAuditedCandidates.length) {
      return {
        citations: [] as TextbookVisualCandidate[],
        rejections: pixelRejections,
        usage: pixelAudit.usage
      };
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

    const relevanceRejections = pixelAuditedCandidates.flatMap((candidate, index) =>
      relevantIndexes.has(index)
        ? []
        : [{
            imageCrop: candidate.imageCrop,
            pageNumber: candidate.pageStart,
            reason: "The complete figure did not directly teach its selected explanation paragraph.",
            sourceKey: candidate.sourceKey,
            textbookName: candidate.textbookName
          }]
    );

    return {
      citations: pixelAuditedCandidates
        .filter((_, index) => relevantIndexes.has(index))
        .map(({ visualSubject: _visualSubject, sourceKey: _sourceKey, ...candidate }) => candidate),
      rejections: [...pixelRejections, ...relevanceRejections],
      usage: {
        input_tokens: (pixelAudit.usage?.input_tokens || 0) + (relevanceAudit.usage?.input_tokens || 0) || undefined,
        output_tokens: (pixelAudit.usage?.output_tokens || 0) + (relevanceAudit.usage?.output_tokens || 0) || undefined,
        total_tokens: (pixelAudit.usage?.total_tokens || 0) + (relevanceAudit.usage?.total_tokens || 0) || undefined
      }
    };
  } catch {
    // Verification failure is deliberately fail-closed: the lecture itself is
    // still usable, but an unverified image must never be displayed.
    return {
      citations: [] as TextbookVisualCandidate[],
      rejections: [] as TextbookVisualRejection[],
      usage: undefined
    };
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
