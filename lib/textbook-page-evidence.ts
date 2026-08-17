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
  images: Array<{ dataUrl: string; filename: string; width: number; height: number }>;
  pageImageDataUrl?: string;
  pageImageHeight?: number;
  pageImageWidth?: number;
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

async function extractEmbeddedImages(pageBytes: Uint8Array, stem: string) {
  try {
    const { createCanvas, ImageData } = await import(
      /* webpackIgnore: true */ "@napi-rs/canvas"
    );
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: pageBytes,
      // Textbooks assembled by some scanners contain harmless malformed object
      // references. Keep parsing tolerant so one such reference cannot make
      // every visual crop disappear in a serverless runtime.
      stopAtErrors: false
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const objects = page.objs;
    const operatorList = await page.getOperatorList();
    const images: Array<{ dataUrl: string; filename: string; width: number; height: number }> = [];
    const seen = new Set<string>();
    for (let index = 0; index < operatorList.fnArray.length && images.length < 4; index += 1) {
      const operator = operatorList.fnArray[index];
      if (operator !== pdfjs.OPS.paintImageXObject && operator !== pdfjs.OPS.paintInlineImageXObject) {
        continue;
      }
      const args = operatorList.argsArray[index] as unknown[] | undefined;
      const name = typeof args?.[0] === "string" ? args[0] : "";
      if (!name || seen.has(name)) continue;
      let image: { data?: Uint8ClampedArray; width?: number; height?: number; kind?: number } | undefined;
      try {
        image = objects.get(name) as typeof image;
      } catch {
        continue;
      }
      if (!image?.data || !image.width || !image.height || image.width < 80 || image.height < 60) continue;
      seen.add(name);
      const canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      images.push({
        dataUrl: canvas.toDataURL("image/png"),
        filename: `${stem}-${images.length + 1}.png`,
        width: image.width,
        height: image.height
      });
    }
    await pdf.destroy();
    return images;
  } catch (error) {
    console.warn("[textbook-page-evidence] embedded image extraction skipped", {
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

async function renderPageImage(pageBytes: Uint8Array) {
  try {
    const { createCanvas, DOMMatrix, ImageData, Path2D } = await import(
      /* webpackIgnore: true */ "@napi-rs/canvas"
    );
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.DOMMatrix ||= DOMMatrix;
    globals.ImageData ||= ImageData;
    globals.Path2D ||= Path2D;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({
      data: pageBytes,
      stopAtErrors: false
    }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale: Math.max(1, scale) });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvas.getContext("2d") as never,
      viewport
    }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    await pdf.destroy();
    return { dataUrl, height: canvas.height, width: canvas.width };
  } catch (error) {
    console.warn("[textbook-page-evidence] page rendering failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function cropTextbookFigure({
  crop,
  dataUrl
}: {
  crop: { height?: number; width?: number; x?: number; y?: number };
  dataUrl?: string;
}) {
  if (!dataUrl) return "";
  try {
    const { createCanvas, loadImage } = await import(
      /* webpackIgnore: true */ "@napi-rs/canvas"
    );
    const image = await loadImage(dataUrl);
    const x = Math.max(0, Math.min(900, Number(crop.x) || 0));
    const y = Math.max(0, Math.min(900, Number(crop.y) || 0));
    const width = Math.max(100, Math.min(1000 - x, Number(crop.width) || 1000));
    const height = Math.max(100, Math.min(1000 - y, Number(crop.height) || 1000));
    const sourceX = Math.round((x / 1000) * image.width);
    const sourceY = Math.round((y / 1000) * image.height);
    const sourceWidth = Math.max(1, Math.round((width / 1000) * image.width));
    const sourceHeight = Math.max(1, Math.round((height / 1000) * image.height));
    const canvas = createCanvas(sourceWidth, sourceHeight);
    canvas.getContext("2d").drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return "";
  }
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
        const stem = `${safeFileStem(textbookName)}-p-${page.pageNumber}`;

        const renderedPage = await renderPageImage(bytes);
        evidence.push({
          dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
          filename: `${stem}.pdf`,
          pageNumber: page.pageNumber,
          textbookId,
          textbookName,
          images: await extractEmbeddedImages(bytes, stem),
          pageImageDataUrl: renderedPage?.dataUrl,
          pageImageHeight: renderedPage?.height,
          pageImageWidth: renderedPage?.width
        });
      }
    } catch (error) {
      // Native text retrieval remains usable if a protected or malformed PDF page
      // cannot be isolated for visual verification.
      console.warn("[textbook-page-evidence] source page extraction failed", {
        message: error instanceof Error ? error.message : String(error),
        textbookId
      });
    }
  }

  return evidence;
}
