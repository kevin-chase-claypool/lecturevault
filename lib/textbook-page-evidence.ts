import { PDFDocument } from "pdf-lib";
import { storageObjectToBuffer } from "./supabase-server";

export type TextbookPageSource = {
  name?: string;
  storageBucket?: string;
  storagePath?: string;
  textbookId?: string;
};

export type TextbookPageRequest = {
  pageEnd?: number;
  pageStart?: number;
  textbookId?: string;
  textbookName?: string;
};

export type TextbookPageEvidence = {
  dataUrl: string;
  filename: string;
  pageNumber: number;
  textbookId: string;
  textbookName: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileStem(value: string) {
  return (
    value
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "textbook"
  );
}

function requestedPages(requests: TextbookPageRequest[]) {
  const pages = new Map<string, { pageNumber: number; textbookId: string; textbookName: string }>();

  for (const request of requests) {
    const textbookId = cleanString(request.textbookId);
    const textbookName = cleanString(request.textbookName) || "Course textbook";
    const start = Math.max(1, Math.floor(Number(request.pageStart) || 0));
    const end = Math.max(start, Math.floor(Number(request.pageEnd) || start));

    if (!textbookId || !start) {
      continue;
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      const key = `${textbookId}:${pageNumber}`;
      if (!pages.has(key)) {
        pages.set(key, { pageNumber, textbookId, textbookName });
      }
    }
  }

  return [...pages.values()];
}

export async function textbookPageEvidence({
  requests,
  sources
}: {
  requests: TextbookPageRequest[];
  sources: TextbookPageSource[];
}): Promise<TextbookPageEvidence[]> {
  const sourceById = new Map(
    sources
      .filter((source) => cleanString(source.textbookId) && cleanString(source.storagePath))
      .map((source) => [cleanString(source.textbookId), source])
  );
  const requestsByTextbook = new Map<string, Array<{ pageNumber: number; textbookName: string }>>();

  for (const request of requestedPages(requests)) {
    const pages = requestsByTextbook.get(request.textbookId) || [];
    pages.push({ pageNumber: request.pageNumber, textbookName: request.textbookName });
    requestsByTextbook.set(request.textbookId, pages);
  }

  const evidence: TextbookPageEvidence[] = [];

  for (const [textbookId, pages] of requestsByTextbook) {
    const source = sourceById.get(textbookId);
    if (!source?.storagePath) {
      continue;
    }

    try {
      const sourceBuffer = await storageObjectToBuffer({
        bucket: cleanString(source.storageBucket),
        path: cleanString(source.storagePath)
      });

      if (!sourceBuffer) {
        continue;
      }

      const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });

      for (const page of pages) {
        const pageIndex = page.pageNumber - 1;
        if (pageIndex < 0 || pageIndex >= sourcePdf.getPageCount()) {
          continue;
        }

        const singlePagePdf = await PDFDocument.create();
        const [copiedPage] = await singlePagePdf.copyPages(sourcePdf, [pageIndex]);
        singlePagePdf.addPage(copiedPage);
        const bytes = await singlePagePdf.save();
        const textbookName = cleanString(source.name) || page.textbookName;

        evidence.push({
          dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
          filename: `${safeFileStem(textbookName)}-p-${page.pageNumber}.pdf`,
          pageNumber: page.pageNumber,
          textbookId,
          textbookName
        });
      }
    } catch {
      // Native text retrieval remains usable if a protected or malformed PDF page
      // cannot be isolated for visual verification.
    }
  }

  return evidence;
}
