import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { PDFDocument } from "pdf-lib";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  storageObjectToBuffer,
  supabaseServerClient
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK_SIZE = 2400;
const CHUNK_OVERLAP = 280;
const EMBEDDING_BATCH_SIZE = 48;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_VISUAL_INDEX_MODEL = "gpt-4.1-mini";

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

async function visuallyIndexPage({
  client,
  pageBytes,
  pageNumber,
  textbookName
}: {
  client: OpenAI;
  pageBytes: Uint8Array;
  pageNumber: number;
  textbookName: string;
}) {
  const dataUrl = `data:application/pdf;base64,${Buffer.from(pageBytes).toString("base64")}`;
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXTBOOK_VISION_MODEL || DEFAULT_VISUAL_INDEX_MODEL,
    instructions: [
      "You are indexing one original textbook PDF page for semantic search.",
      "Return only a compact, faithful plain-text search record for the page.",
      "Transcribe visible headings, definitions, labels, and equations using LaTeX where readable; summarize diagrams, tables, and worked steps with their visible labels.",
      "Preserve variables, subscripts, units, and notation. Do not infer missing content or solve the problem. If content is unclear, say that it is unclear rather than guessing."
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Textbook: ${textbookName || "Course textbook"}. Page: ${pageNumber}. Create the search record for this page.`
          },
          {
            type: "input_file",
            detail: "high",
            file_data: dataUrl,
            filename: `textbook-page-${pageNumber}.pdf`
          }
        ]
      }
    ]
  });

  return {
    text: normalizeText(response.output_text),
    usage: {
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      total_tokens: response.usage?.total_tokens
    }
  };
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
    const pages = parsed.pages || [];
    const nativeTextPageCount = pages.filter(
      (page) => normalizeText(page.text || "").length >= 80
    ).length;
    const visuallyDependentPageCount = Math.max(0, pages.length - nativeTextPageCount);
    const wholeDocumentText = parsed.text;

    for (const page of pages) {
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
      chunks.length || !wholeDocumentText
        ? chunks
        : chunkPageText({
            pageNumber: 1,
            text: wholeDocumentText,
            textbookId
          });
    // Do not silently exclude later textbook pages. Every extracted chunk is embedded
    // so a late-semester chapter remains retrievable for a later reconstruction.
    const indexedChunks = [...fallbackChunks];
    let indexedChunkCount = 0;
    let visuallyIndexedPageCount = 0;
    let embeddingUsage: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    } = {};

    if (indexedChunks.length || visuallyDependentPageCount) {
      if (!process.env.OPENAI_API_KEY) {
        return jsonError("OPENAI_API_KEY is required to index textbook chunks.", 503);
      }

      const supabase = supabaseServerClient();

      if (!supabase) {
        return jsonError("Supabase is not configured for textbook indexing.", 503);
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      if (visuallyDependentPageCount) {
        const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });

        for (const page of pages) {
          if (normalizeText(page.text || "").length >= 80) {
            continue;
          }

          const pageIndex = page.num - 1;

          if (pageIndex < 0 || pageIndex >= sourcePdf.getPageCount()) {
            continue;
          }

          const pagePdf = await PDFDocument.create();
          const [copiedPage] = await pagePdf.copyPages(sourcePdf, [pageIndex]);
          pagePdf.addPage(copiedPage);
          const visualRecord = await visuallyIndexPage({
            client: openai,
            pageBytes: await pagePdf.save(),
            pageNumber: page.num,
            textbookName: name || "Course textbook"
          });
          const visualChunks = chunkPageText({
            pageNumber: page.num,
            text: visualRecord.text,
            textbookId
          });

          if (visualChunks.length) {
            indexedChunks.push(...visualChunks);
            visuallyIndexedPageCount += 1;
          }

          embeddingUsage = {
            input_tokens:
              (embeddingUsage.input_tokens || 0) + (visualRecord.usage.input_tokens || 0) || undefined,
            output_tokens:
              (embeddingUsage.output_tokens || 0) + (visualRecord.usage.output_tokens || 0) || undefined,
            total_tokens:
              (embeddingUsage.total_tokens || 0) + (visualRecord.usage.total_tokens || 0) || undefined
          };
        }
      }

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
          output_tokens: embeddingUsage.output_tokens,
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
      nativeTextPageCount,
      pageCount: parsed.total || pages.length || 0,
      visuallyIndexedPageCount,
      visuallyDependentPageCount
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
