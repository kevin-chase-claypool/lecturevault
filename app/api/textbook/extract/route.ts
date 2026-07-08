import { PDFParse } from "pdf-parse";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { storageObjectToBuffer } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXTBOOK_CHUNKS = 180;
const CHUNK_SIZE = 2400;
const CHUNK_OVERLAP = 280;

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
      mimeType?: string;
      name?: string;
      path?: string;
      textbookId?: string;
    };
    const textbookId = cleanString(body.textbookId);
    const path = cleanString(body.path);
    const mimeType = cleanString(body.mimeType).toLowerCase();
    const name = cleanString(body.name);

    if (!textbookId) {
      return jsonError("Textbook id is required.", 400);
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

    return Response.json({
      chunks: fallbackChunks.slice(0, MAX_TEXTBOOK_CHUNKS),
      pageCount: parsed.total || parsed.pages.length || 0
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not extract textbook PDF.";
    return jsonError(message, 500);
  }
}
