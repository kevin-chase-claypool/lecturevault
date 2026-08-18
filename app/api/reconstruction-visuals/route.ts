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
  selectTextbookVisualCitations
} from "../../../lib/textbook-visual-selection";

export const runtime = "nodejs";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_LECTURE_MODEL = "gpt-4.1-mini";
const MAX_TEXTBOOK_VISUAL_PAGES = 8;

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
    const selection = await selectTextbookVisualCitations({
      client,
      model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL,
      pages: visualPages.map((page) => ({
        textbookName: page.textbookName,
        pageNumber: page.pageNumber,
        pageImageDataUrl: page.pageImageDataUrl
      })),
      transcriptText
    });
    const pageByKey = new Map(
      visualPages.map((page) => [
        `${page.textbookName.toLowerCase()}:${page.pageNumber}`,
        page
      ])
    );
    const textbookCitations = await Promise.all(
      selection.citations.map(async (citation) => {
        const page = pageByKey.get(`${citation.textbookName.toLowerCase()}:${citation.pageStart}`);
        const imageDataUrl = page?.pageImageDataUrl && citation.imageCrop
          ? await cropTextbookFigure({ crop: citation.imageCrop, dataUrl: page.pageImageDataUrl })
          : undefined;

        return {
          ...citation,
          imageDataUrl: imageDataUrl || undefined,
          imageFilename: imageDataUrl ? `textbook-figure-p-${citation.pageStart}.jpg` : undefined
        };
      })
    );
    const usableCitations = textbookCitations.filter((citation) => Boolean(citation.imageDataUrl));

    return Response.json({
      evidence: { textbookCitations: usableCitations },
      transcriptText: ensureTextbookVisualAnchors(transcriptText, usableCitations),
      usage: {
        input_tokens:
          (embedding.usage?.prompt_tokens || 0) + (selection.usage?.input_tokens || 0) || undefined,
        output_tokens: selection.usage?.output_tokens,
        total_tokens:
          (embedding.usage?.total_tokens || 0) + (selection.usage?.total_tokens || 0) || undefined
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add textbook visuals.";
    console.error("[reconstruction-visuals] failed", { message });
    return jsonError(message, 500);
  }
}
