import OpenAI from "openai";
import { requireAuthenticatedRequest } from "../../../lib/auth";
import { supabaseServerClient } from "../../../lib/supabase-server";
import {
  cropTextbookFigure,
  textbookPageEvidence,
  type TextbookPageRequest,
  type TextbookPageSource
} from "../../../lib/textbook-page-evidence";
import {
  discoverTextbookVisualCitations,
  ensureTextbookVisualAnchors,
  selectTextbookVisualCitations,
  verifyTextbookVisualCitations,
  type TextbookVisualRejection
} from "../../../lib/textbook-visual-selection";
import { TEXTBOOK_VISUAL_AUDIT_VERSION } from "../../../lib/textbook-visual-contract";

export const runtime = "nodejs";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_LECTURE_MODEL = "gpt-4.1-mini";
const DEFAULT_TEXTBOOK_VISUAL_VERIFICATION_MODEL = "gpt-4.1";
const MAX_TEXTBOOK_VISUAL_PAGES = 8;
const MAX_TEXTBOOK_VISUAL_SELECTION_ATTEMPTS = 2;

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type MatchTextbookChunk = {
  page_end?: number;
  page_start?: number;
  textbook_id?: string;
  textbook_name?: string;
};

type TextbookCitationHint = {
  pageEnd?: unknown;
  page_end?: unknown;
  pageStart?: unknown;
  page_start?: unknown;
  textbookName?: unknown;
  textbook_name?: unknown;
};

type VisualRepairSource = TextbookPageSource;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textbookNameKey(value: unknown) {
  return cleanString(value)
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function textbookNameMatches(citationName: string, sourceName: string) {
  const citationKey = textbookNameKey(citationName);
  const sourceKey = textbookNameKey(sourceName);

  if (!citationKey || !sourceKey) return false;
  if (sourceKey === citationKey || sourceKey.includes(citationKey) || citationKey.includes(sourceKey)) return true;

  // Legacy prose citations commonly abbreviate a title to an author name
  // (for example, "Wickert" or "Roberts (2018)"). A meaningful shared author
  // token is precise enough here because the candidate set is already limited
  // to textbooks attached to the same course.
  const ignored = new Set(["analysis", "book", "digital", "edition", "filter", "for", "methods", "signals", "systems", "the", "using"]);
  const tokens = (value: string) => new Set(
    value.toLowerCase().match(/[a-z]{4,}/g)?.filter((token) => !ignored.has(token)) || []
  );
  const citationTokens = tokens(citationName);
  const sourceTokens = tokens(sourceName);
  return [...citationTokens].some((token) => sourceTokens.has(token));
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function addUsage(current: TokenUsage, next?: TokenUsage | null): TokenUsage {
  return {
    input_tokens: (current.input_tokens || 0) + (next?.input_tokens || 0) || undefined,
    output_tokens: (current.output_tokens || 0) + (next?.output_tokens || 0) || undefined,
    total_tokens: (current.total_tokens || 0) + (next?.total_tokens || 0) || undefined
  };
}

function validSources(value: unknown): VisualRepairSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((source) => {
    const record = source && typeof source === "object" ? source as Record<string, unknown> : {};
    const textbookId = cleanString(record.textbookId);
    const textbookName = cleanString(record.name);
    const storageBucket = cleanString(record.storageBucket);
    const storagePath = cleanString(record.storagePath);

    return textbookId && textbookName && storageBucket && storagePath
      ? [{ textbookId, name: textbookName, storageBucket, storagePath }]
      : [];
  });
}

function citedPageRequests(
  citations: unknown,
  sources: VisualRepairSource[]
): TextbookPageRequest[] {
  if (!Array.isArray(citations)) return [];

  return citations.flatMap((citation) => {
    const record = citation && typeof citation === "object"
      ? citation as TextbookCitationHint
      : {};
    const citationName = cleanString(record.textbookName ?? record.textbook_name);
    const pageStart = Math.max(1, Math.floor(Number(record.pageStart ?? record.page_start) || 0));
    const pageEnd = Math.max(pageStart, Math.floor(Number(record.pageEnd ?? record.page_end) || pageStart));
    const citationKey = textbookNameKey(citationName);
    const source = sources.find((candidate) => {
      const sourceKey = textbookNameKey(candidate.name);
      return sourceKey && citationKey && textbookNameMatches(citationName, cleanString(candidate.name));
    });

    return source && pageStart
      ? [{
          textbookId: cleanString(source.textbookId),
          textbookName: cleanString(source.name) || citationName,
          pageEnd,
          pageStart
        }]
      : [];
  });
}

function individualPageRequests(requests: TextbookPageRequest[]) {
  const pages = new Map<string, TextbookPageRequest>();

  for (const request of requests) {
    const textbookId = cleanString(request.textbookId);
    const textbookName = cleanString(request.textbookName);
    const pageStart = Math.max(1, Math.floor(Number(request.pageStart) || 0));
    const pageEnd = Math.max(pageStart, Math.floor(Number(request.pageEnd) || pageStart));

    if (!textbookId || !textbookName || !pageStart) continue;

    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const key = `${textbookId}:${pageNumber}`;
      if (!pages.has(key)) {
        pages.set(key, { textbookId, textbookName, pageStart: pageNumber, pageEnd: pageNumber });
      }
    }
  }

  return [...pages.values()];
}

export async function POST(request: Request) {
  const authError = requireAuthenticatedRequest(request);

  if (authError) {
    return authError;
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("OPENAI_API_KEY is not configured.", 503);
  }

  try {
    const body = await request.json() as {
      courseId?: unknown;
      textbookCitations?: unknown;
      textbookSources?: unknown;
      title?: unknown;
      transcriptText?: unknown;
    };
    const courseId = cleanString(body.courseId);
    const title = cleanString(body.title);
    const transcriptText = cleanString(body.transcriptText);
    const sources = validSources(body.textbookSources);

    if (!courseId || !title || !transcriptText || !sources.length) {
      return jsonError("Course, reconstruction text, and attached textbook sources are required.", 400);
    }

    const supabase = supabaseServerClient();

    if (!supabase) {
      return jsonError("Supabase is not configured for textbook retrieval.", 503);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const query = [title, transcriptText].join("\n\n").slice(0, 12000);
    const embedding = await client.embeddings.create({
      input: query,
      model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
    });
    const { data, error } = await supabase.rpc("match_textbook_chunks", {
      match_count: MAX_TEXTBOOK_VISUAL_PAGES,
      match_course_id: courseId,
      query_embedding: embedding.data[0]?.embedding || []
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    const semanticPageRequests = (Array.isArray(data) ? data : [])
      .map((chunk) => chunk as MatchTextbookChunk)
      .flatMap((chunk) => {
        const textbookId = cleanString(chunk.textbook_id);
        const textbookName = cleanString(chunk.textbook_name);
        const pageStart = Math.max(1, Math.floor(Number(chunk.page_start) || 0));
        const pageEnd = Math.max(pageStart, Math.floor(Number(chunk.page_end) || pageStart));

        return textbookId && textbookName && pageStart
          ? [{ textbookId, textbookName, pageStart, pageEnd }]
          : [];
      }) as TextbookPageRequest[];
    // A saved reconstruction has already identified the exact textbook pages
    // used in its explanation.  Those pages must be inspected before an
    // embedding-nearest neighbour: the latter can be topical but contain no
    // relevant diagram (the cause of the false block-diagram selection on
    // this repair flow).
    const citedRequests = individualPageRequests(citedPageRequests(body.textbookCitations, sources));
    const pageRequests = individualPageRequests([
      ...citedRequests,
      ...semanticPageRequests
    ]).slice(0, MAX_TEXTBOOK_VISUAL_PAGES);
    const visualPages = await textbookPageEvidence({
      requests: pageRequests,
      sources
    });
    const visualPagesForSelection = visualPages.map((page) => ({
      textbookName: page.textbookName,
      pageNumber: page.pageNumber,
      embeddedImages: page.images,
      pageImageDataUrl: page.pageImageDataUrl,
      selectionImageDataUrl: page.selectionImageDataUrl
    }));
    const visualDiagnostics = {
      embeddedImageCount: visualPages.reduce((count, page) => count + page.images.length, 0),
      citedPageCount: citedRequests.length,
      matchedChunkCount: Array.isArray(data) ? data.length : 0,
      pageRenderCount: visualPages.filter((page) => Boolean(page.pageImageDataUrl)).length,
      requestedPageCount: pageRequests.length,
      retrievedPageCount: visualPages.length,
      selectionAttempts: [] as Array<{
        candidateCount: number;
        rejectedCount: number;
        selectedCount: number;
        verifiedCount: number;
      }>
    };
    let visualUsage: TokenUsage = {};
    let verifiedCitations: Awaited<ReturnType<typeof verifyTextbookVisualCitations>>["citations"] = [];
    let previousRejections: TextbookVisualRejection[] = [];

    for (let attempt = 0; attempt < MAX_TEXTBOOK_VISUAL_SELECTION_ATTEMPTS; attempt += 1) {
      const selection = await selectTextbookVisualCitations({
        client,
        model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL,
        pages: visualPagesForSelection,
        previousRejections,
        retry: attempt === 1,
        transcriptText
      });
      visualUsage = addUsage(visualUsage, selection.usage);
      const textbookCitations = await Promise.all(
        selection.citations.map(async (citation) => {
          const { sourceDataUrl, sourceFilename, sourceKind, ...citationEvidence } = citation;
          const imageDataUrl = sourceKind === "embedded_image"
            ? sourceDataUrl
            : citation.imageCrop
              ? await cropTextbookFigure({ crop: citation.imageCrop, dataUrl: sourceDataUrl })
              : undefined;

          return {
            ...citationEvidence,
            imageDataUrl: imageDataUrl || undefined,
            imageFilename: imageDataUrl
              ? sourceFilename || `textbook-figure-p-${citation.pageStart}.jpg`
              : undefined
          };
        })
      );
      const verification = await verifyTextbookVisualCitations({
        candidates: textbookCitations.filter((citation): citation is typeof citation & { imageDataUrl: string } =>
          Boolean(citation.imageDataUrl)
        ),
        client,
        model: process.env.OPENAI_TEXTBOOK_VISUAL_VERIFICATION_MODEL || DEFAULT_TEXTBOOK_VISUAL_VERIFICATION_MODEL
      });
      visualUsage = addUsage(visualUsage, verification.usage);
      console.info("[reconstruction-visuals] selected visual candidates", selection.citations.map((citation) => ({
        imageCrop: citation.imageCrop,
        pageNumber: citation.pageStart,
        sourceKind: citation.sourceKind,
        visualKind: citation.visualKind
      })));
      visualDiagnostics.selectionAttempts.push({
        candidateCount: textbookCitations.filter((citation) => Boolean(citation.imageDataUrl)).length,
        rejectedCount: verification.rejections.length,
        selectedCount: selection.citations.length,
        verifiedCount: verification.citations.length
      });

      if (verification.citations.length) {
        verifiedCitations = verification.citations;
        break;
      }

      previousRejections = verification.rejections;
    }

    if (!verifiedCitations.length) {
      // When comparison across several textbook pages still yields only
      // rejected regions, inspect each source on its own. This is a focused
      // precision fallback, not a gallery or a quota: every returned figure
      // still has to pass the same pixel and teaching-anchor audits.
      const selection = await discoverTextbookVisualCitations({
        client,
        model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL,
        pages: visualPagesForSelection,
        transcriptText
      });
      visualUsage = addUsage(visualUsage, selection.usage);
      const textbookCitations = await Promise.all(
        selection.citations.map(async (citation) => {
          const { sourceDataUrl, sourceFilename, sourceKind, ...citationEvidence } = citation;
          const imageDataUrl = sourceKind === "embedded_image"
            ? sourceDataUrl
            : citation.imageCrop
              ? await cropTextbookFigure({ crop: citation.imageCrop, dataUrl: sourceDataUrl })
              : undefined;

          return {
            ...citationEvidence,
            imageDataUrl: imageDataUrl || undefined,
            imageFilename: imageDataUrl
              ? sourceFilename || `textbook-figure-p-${citation.pageStart}.jpg`
              : undefined
          };
        })
      );
      const verification = await verifyTextbookVisualCitations({
        candidates: textbookCitations.filter((citation): citation is typeof citation & { imageDataUrl: string } =>
          Boolean(citation.imageDataUrl)
        ),
        client,
        model: process.env.OPENAI_TEXTBOOK_VISUAL_VERIFICATION_MODEL || DEFAULT_TEXTBOOK_VISUAL_VERIFICATION_MODEL
      });
      visualUsage = addUsage(visualUsage, verification.usage);
      console.info("[reconstruction-visuals] focused visual candidates", selection.citations.map((citation) => ({
        imageCrop: citation.imageCrop,
        pageNumber: citation.pageStart,
        sourceKind: citation.sourceKind,
        visualKind: citation.visualKind
      })));
      visualDiagnostics.selectionAttempts.push({
        candidateCount: textbookCitations.filter((citation) => Boolean(citation.imageDataUrl)).length,
        rejectedCount: verification.rejections.length,
        selectedCount: selection.citations.length,
        verifiedCount: verification.citations.length
      });
      verifiedCitations = verification.citations;
    }
    const usableCitations = verifiedCitations.map((citation) => ({
      ...citation,
      visualAuditVersion: TEXTBOOK_VISUAL_AUDIT_VERSION
    }));
    console.info("[reconstruction-visuals] visual diagnostics", visualDiagnostics);

    return Response.json({
      evidence: { textbookCitations: usableCitations },
      transcriptText: ensureTextbookVisualAnchors(transcriptText, usableCitations),
      usage: {
        input_tokens:
          (embedding.usage?.prompt_tokens || 0) + (visualUsage.input_tokens || 0) || undefined,
        output_tokens: visualUsage.output_tokens,
        total_tokens:
          (embedding.usage?.total_tokens || 0) + (visualUsage.total_tokens || 0) || undefined
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add textbook visuals.";
    console.error("[reconstruction-visuals] failed", { message });
    return jsonError(message, 500);
  }
}
