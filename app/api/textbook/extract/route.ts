import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  storageObjectToBuffer,
  supabaseServerClient
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXTBOOK_CHUNKS = 180;
const CHUNK_SIZE = 2400;
const CHUNK_OVERLAP = 280;
const EMBEDDING_BATCH_SIZE = 48;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function chunkPageText({
  pageNumber,
  text,
  textbookId
}: {
  pageNumber: number;
  text: string;
  textbookId: string;
}) {
  const normalized = normalizeText(text);
  const chunks: Array<{
    id: string;
    pageEnd: number;
    pageStart: number;
    text: string;
    textbookId: string;
  }> = [];

  if (!normalized) {
    return chunks;
  }

  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const textSlice = normalized.slice(start, start + CHUNK_SIZE).trim();

    if (textSlice.length < 80) {
      continue;
    }

    chunks.push({
      id: `chunk-${textbookId}-${pageNumber}-${chunks.length + 1}`,
      pageEnd: pageNumber,
      pageStart: pageNumber,
      text: textSlice,
      textbookId
    });
  }

  return chunks;
}

export async function POST(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      bucket?: string;
      courseId?: string;
      mimeType?: string;
      name?: string;
      path?: string;
      textbookId?: string;
    };
    const textbookId = cleanString(body.textbookId);
    const courseId = cleanString(body.courseId);
    const path = cleanString(body.path);
    const mimeType = cleanString(body.mimeType).toLowerCase();
    const name = cleanString(body.name);

    if (!textbookId) {
      return jsonError("Textbook id is required.", 400);
    }

    if (!courseId) {
      return jsonError("Course id is required.", 400);
    }

    if (!path) {
      return jsonError("Supabase storage path is required.", 400);
    }

    if (mimeType && !mimeType.includes("pdf") && !name.toLowerCase().endsWith(".pdf")) {
      return jsonError("Only PDF textbooks can be extracted right now.", 400);
    }

    const buffer = await storageObjectToBuffer({
      bucket: cleanString(body.bucket),
      path
    });

    if (!buffer) {
      return jsonError("Could not read textbook PDF from Supabase Storage.", 404);
    }

    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const chunks = [];

    for (const page of parsed.pages) {
      chunks.push(
        ...chunkPageText({
          pageNumber: page.num,
          text: page.text,
          textbookId
        })
      );
    }

    await parser.destroy();

    const fallbackChunks =
      chunks.length || !parsed.text
        ? chunks
        : chunkPageText({
            pageNumber: 1,
            text: parsed.text,
            textbookId
          });

    const indexedChunks = fallbackChunks.slice(0, MAX_TEXTBOOK_CHUNKS);
    let indexedChunkCount = 0;
    let embeddingUsage: {
      input_tokens?: number;
      total_tokens?: number;
    } = {};

    if (indexedChunks.length) {
      if (!process.env.OPENAI_API_KEY) {
        return jsonError("OPENAI_API_KEY is required to index textbook chunks.", 503);
      }

      const supabase = supabaseServerClient();

      if (!supabase) {
        return jsonError("Supabase is not configured for textbook indexing.", 503);
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      for (let start = 0; start < indexedChunks.length; start += EMBEDDING_BATCH_SIZE) {
        const batch = indexedChunks.slice(start, start + EMBEDDING_BATCH_SIZE);
        const embeddingResponse = await openai.embeddings.create({
          input: batch.map((chunk) => chunk.text),
          model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
        });
        embeddingUsage = {
          input_tokens:
            (embeddingUsage.input_tokens || 0) +
              (embeddingResponse.usage?.prompt_tokens || 0) || undefined,
          total_tokens:
            (embeddingUsage.total_tokens || 0) +
              (embeddingResponse.usage?.total_tokens || 0) || undefined
        };
        const rows = batch.map((chunk, index) => ({
          content: chunk.text,
          course_id: courseId,
          embedding: embeddingResponse.data[index]?.embedding || [],
          id: chunk.id,
          page_end: chunk.pageEnd,
          page_start: chunk.pageStart,
          textbook_id: textbookId,
          textbook_name: name || "Course textbook"
        }));
        const { error } = await supabase.from("textbook_chunks").upsert(rows);

        if (error) {
          return jsonError(error.message, 500);
        }

        indexedChunkCount += rows.length;
      }
    }

    return Response.json({
      chunkCount: indexedChunks.length,
      chunks: [],
      embeddingUsage,
      indexedChunkCount,
      pageCount: parsed.total || parsed.pages.length || 0
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not extract textbook PDF.";
    return jsonError(message, 500);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      textbookId?: string;
    };
    const textbookId = cleanString(body.textbookId);

    if (!textbookId) {
      return jsonError("Textbook id is required.", 400);
    }

    const supabase = supabaseServerClient();

    if (!supabase) {
      return jsonError("Supabase is not configured.", 503);
    }

    const { error } = await supabase
      .from("textbook_chunks")
      .delete()
      .eq("textbook_id", textbookId);

    if (error) {
      return jsonError(error.message, 500);
    }

    return Response.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete textbook vectors.";
    return jsonError(message, 500);
  }
}
