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
  ensureTextbookVisualAnchors,
  selectTextbookVisualCitations,
  verifyTextbookVisualCitations
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

type VisualRepairSource = TextbookPageSource;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

    const pageRequests = (Array.isArray(data) ? data : [])
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
    const visualPages = await textbookPageEvidence({
      requests: pageRequests.slice(0, MAX_TEXTBOOK_VISUAL_PAGES),
      sources
    });
    const visualPagesForSelection = visualPages.map((page) => ({
      textbookName: page.textbookName,
      pageNumber: page.pageNumber,
      embeddedImages: page.images,
      pageImageDataUrl: page.pageImageDataUrl
    }));
    let visualUsage: TokenUsage = {};
    let verifiedCitations: Awaited<ReturnType<typeof verifyTextbookVisualCitations>>["citations"] = [];

    for (let attempt = 0; attempt < MAX_TEXTBOOK_VISUAL_SELECTION_ATTEMPTS; attempt += 1) {
      const selection = await selectTextbookVisualCitations({
        client,
        model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL,
        pages: visualPagesForSelection,
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

      if (verification.citations.length) {
        verifiedCitations = verification.citations;
        break;
      }
    }
    const usableCitations = verifiedCitations.map((citation) => ({
      ...citation,
      visualAuditVersion: TEXTBOOK_VISUAL_AUDIT_VERSION
    }));

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
