import OpenAI from "openai";
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
const MAX_VISUAL_INDEX_PAGES = 64;

async function extractPdfText(buffer: Uint8Array) {
  // Process one page at a time. pdf2json asks PDF.js for every page at once,
  // retaining all page render structures and exhausting serverless memory on
  // large textbooks. PDF.js text extraction can release each page immediately.
  // Its Node canvas globals must be installed before the PDF.js module loads.
  // Keep this native dependency out of the webpack graph. Vercel's Node
  // runtime can resolve it from the traced serverExternalPackages at runtime,
  // while webpack cannot parse the platform-specific `.node` binary.
  const { DOMMatrix, ImageData, Path2D } = await import(
    /* webpackIgnore: true */ "@napi-rs/canvas"
  );
  const canvasGlobals = globalThis as unknown as Record<string, unknown>;
  canvasGlobals.DOMMatrix ||= DOMMatrix;
  canvasGlobals.ImageData ||= ImageData;
  canvasGlobals.Path2D ||= Path2D;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: Buffer.from(buffer),
    disableAutoFetch: true,
    disableFontFace: true,
    disableStream: true,
    isEvalSupported: false,
    useWorkerFetch: false
  }).promise;
  const pages: Array<{ num: number; text: string }> = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .filter((item): item is typeof item & { str: string } =>
            typeof item === "object" && item !== null && "str" in item
          )
          .map((item) => item.str)
          .join("\n");
        pages.push({ num: pageNumber, text });
      } finally {
        page.cleanup();
      }
    }

    return {
      pages,
      text: pages.map((page) => page.text).join("\n\n")
    };
  } finally {
    await document.destroy();
  }
}

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

function requiresVisualVerification(text: string) {
  const normalized = normalizeText(text);

  return (
    normalized.length < 160 ||
    /\b(?:unclear|illegible|cannot determine|not readable|unable to read)\b/i.test(normalized)
  );
}

function hasMathVisualRisk(text: string) {
  const normalized = normalizeText(text);
  const latexSignals = normalized.match(/\\(?:frac|sqrt|sum|int|oint|lim|partial|nabla|vec|mathrm|text)\b/g) || [];
  const operatorSignals = normalized.match(/[=<>≤≥≈≠±×÷∫∑√∞∂∇→←]/g) || [];
  const indexedVariableSignals = normalized.match(/\b[A-Za-z]{1,4}\s*[_^]\s*[A-Za-z0-9{(]/g) || [];
  const equationLines = normalized
    .split(/\n+/)
    .filter((line) => /[A-Za-z0-9)]\s*=\s*[A-Za-z0-9(\\]/.test(line)).length;

  return (
    latexSignals.length >= 1 ||
    operatorSignals.length >= 3 ||
    indexedVariableSignals.length >= 2 ||
    equationLines >= 2
  );
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

  let requestContext: {
    courseId?: string;
    path?: string;
    textbookId?: string;
  } = {};

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
    requestContext = { courseId, path, textbookId };

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

    const parsed = await extractPdfText(buffer);
    const chunks = [];
    const pageEvidence: Array<{
      course_id: string;
      evidence_text: string;
      page_number: number;
      requires_visual_verification: boolean;
      source_kind: "native_text" | "visual_index";
      textbook_id: string;
      textbook_name: string;
      updated_at: string;
    }> = [];
    const pages = parsed.pages || [];
    const nativeTextPageCount = pages.filter(
      (page) => normalizeText(page.text || "").length >= 80
    ).length;
    const visuallyDependentPageCount = pages.filter((page) => {
      const nativePageText = normalizeText(page.text || "");
      return nativePageText.length < 80 || hasMathVisualRisk(nativePageText);
    }).length;
    const configuredVisualIndexPageLimit = Number.parseInt(
      process.env.OPENAI_TEXTBOOK_VISUAL_INDEX_PAGE_LIMIT || "0",
      10
    );
    const visualIndexPageLimit = Math.max(
      0,
      Math.min(
        MAX_VISUAL_INDEX_PAGES,
        Number.isFinite(configuredVisualIndexPageLimit)
          ? configuredVisualIndexPageLimit
          : 0
      )
    );
    const visualCandidates = pages.filter((page) => {
      const nativePageText = normalizeText(page.text || "");
      return nativePageText.length < 80 || hasMathVisualRisk(nativePageText);
    });
    const pagesForVisualIndex = visualCandidates.slice(0, visualIndexPageLimit);
    const visualIndexDeferredPageCount = Math.max(
      0,
      visuallyDependentPageCount - pagesForVisualIndex.length
    );
    const wholeDocumentText = parsed.text;

    for (const page of pages) {
      const nativePageText = normalizeText(page.text || "");

      if (nativePageText.length >= 80) {
        pageEvidence.push({
          course_id: courseId,
          evidence_text: nativePageText,
          page_number: page.num,
          requires_visual_verification: hasMathVisualRisk(nativePageText),
          source_kind: "native_text",
          textbook_id: textbookId,
          textbook_name: name || "Course textbook",
          updated_at: new Date().toISOString()
        });
      }
      chunks.push(
        ...chunkPageText({
          pageNumber: page.num,
          text: page.text,
          textbookId
        })
      );
    }

    const fallbackChunks =
      chunks.length || !wholeDocumentText
        ? chunks
        : chunkPageText({
            pageNumber: 1,
            text: wholeDocumentText,
            textbookId
          });

    if (!pageEvidence.length && normalizeText(wholeDocumentText || "").length >= 80) {
      pageEvidence.push({
        course_id: courseId,
        evidence_text: normalizeText(wholeDocumentText),
        page_number: 1,
        requires_visual_verification: false,
        source_kind: "native_text",
        textbook_id: textbookId,
        textbook_name: name || "Course textbook",
        updated_at: new Date().toISOString()
      });
    }
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
    let visualAnalysisUsage: {
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

      if (pagesForVisualIndex.length) {
        const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });

        for (const page of pagesForVisualIndex) {
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

          if (visualRecord.text) {
            const visualEvidence = {
              course_id: courseId,
              evidence_text: visualRecord.text,
              page_number: page.num,
              requires_visual_verification: requiresVisualVerification(visualRecord.text),
              source_kind: "visual_index" as const,
              textbook_id: textbookId,
              textbook_name: name || "Course textbook",
              updated_at: new Date().toISOString()
            };
            const existingEvidenceIndex = pageEvidence.findIndex(
              (evidence) => evidence.page_number === page.num
            );
            if (existingEvidenceIndex >= 0) {
              pageEvidence[existingEvidenceIndex] = visualEvidence;
            } else {
              pageEvidence.push(visualEvidence);
            }
          }

          embeddingUsage = {
            input_tokens:
              (embeddingUsage.input_tokens || 0) + (visualRecord.usage.input_tokens || 0) || undefined,
            output_tokens:
              (embeddingUsage.output_tokens || 0) + (visualRecord.usage.output_tokens || 0) || undefined,
            total_tokens:
              (embeddingUsage.total_tokens || 0) + (visualRecord.usage.total_tokens || 0) || undefined
          };
          visualAnalysisUsage = {
            input_tokens:
              (visualAnalysisUsage.input_tokens || 0) + (visualRecord.usage.input_tokens || 0) || undefined,
            output_tokens:
              (visualAnalysisUsage.output_tokens || 0) + (visualRecord.usage.output_tokens || 0) || undefined,
            total_tokens:
              (visualAnalysisUsage.total_tokens || 0) + (visualRecord.usage.total_tokens || 0) || undefined
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

      if (pageEvidence.length) {
        const { error } = await supabase.from("textbook_page_evidence").upsert(pageEvidence);

        if (error) {
          return jsonError(error.message, 500);
        }
      }
    }

    return Response.json({
      chunkCount: indexedChunks.length,
      chunks: [],
      embeddingUsage,
      indexedChunkCount,
      nativeTextPageCount,
      pageCount: pages.length,
      pageEvidenceCount: pageEvidence.length,
      pagesNeedingVisualVerification: pageEvidence.filter(
        (page) => page.requires_visual_verification
      ).length,
      visualAnalysisUsage,
      visualIndexDeferredPageCount,
      visuallyIndexedPageCount,
      visuallyDependentPageCount
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not extract textbook PDF.";
    console.error("[textbook/extract] failed", {
      message,
      ...requestContext
    });
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

    const [{ error: chunkError }, { error: evidenceError }] = await Promise.all([
      supabase.from("textbook_chunks").delete().eq("textbook_id", textbookId),
      supabase.from("textbook_page_evidence").delete().eq("textbook_id", textbookId)
    ]);

    if (chunkError || evidenceError) {
      return jsonError(chunkError?.message || evidenceError?.message || "Could not delete textbook index.", 500);
    }

    return Response.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete textbook vectors.";
    return jsonError(message, 500);
  }
}
