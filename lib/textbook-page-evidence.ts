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

const FIGURE_SAFETY_MARGIN = 18;

/**
 * Adds a small, bounded whitespace rim around a model-selected figure box.
 * Vision models often place a box directly on a diagram's outermost arrow,
 * axis label, or connection. Keeping that box verbatim makes the result look
 * clipped even when the selected figure was otherwise correct. A missing or
 * invalid crop deliberately produces no image: textbook pages must never be
 * used as a fallback visual.
 */
export function expandTextbookFigureCrop(crop: {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
}) {
  const rawX = Number(crop.x);
  const rawY = Number(crop.y);
  const rawWidth = Number(crop.width);
  const rawHeight = Number(crop.height);

  if (
    ![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite) ||
    rawX < 0 ||
    rawY < 0 ||
    rawWidth < 90 ||
    rawHeight < 90 ||
    rawX + rawWidth > 1000 ||
    rawY + rawHeight > 1000
  ) {
    return null;
  }

  const x = Math.max(0, Math.floor(rawX));
  const y = Math.max(0, Math.floor(rawY));
  const right = Math.min(1000, Math.ceil(rawX + rawWidth));
  const bottom = Math.min(1000, Math.ceil(rawY + rawHeight));
  const paddedX = Math.max(0, x - FIGURE_SAFETY_MARGIN);
  const paddedY = Math.max(0, y - FIGURE_SAFETY_MARGIN);
  const paddedRight = Math.min(1000, right + FIGURE_SAFETY_MARGIN);
  const paddedBottom = Math.min(1000, bottom + FIGURE_SAFETY_MARGIN);

  return {
    x: paddedX,
    y: paddedY,
    width: paddedRight - paddedX,
    height: paddedBottom - paddedY
  };
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

async function loadPdfJsWithInlineWorker() {
  // In a Node function PDF.js deliberately uses a fake worker. Loading the
  // worker module first registers WorkerMessageHandler on globalThis, which
  // keeps PDF.js in-process and avoids its otherwise unresolved relative
  // "./pdf.worker.mjs" runtime import after Next.js bundles the function.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

type CanvasLike = {
  getContext: (contextId: "2d") => unknown;
  height: number;
  width: number;
};

/**
 * PDF.js normally constructs NodeCanvasFactory, whose nested `require` starts
 * from pdfjs-dist's own pnpm package directory. In a traced Vercel function
 * that lookup can miss the app-level native canvas package even though this
 * module loaded it successfully. Passing this factory to getDocument keeps
 * every temporary PDF.js canvas on the same known implementation.
 */
function textbookCanvasFactory(
  createCanvas: (width: number, height: number) => CanvasLike
) {
  return class TextbookCanvasFactory {
    constructor(private readonly options: { enableHWA?: boolean } = {}) {}

    create(width: number, height: number) {
      if (width <= 0 || height <= 0) {
        throw new Error("Invalid canvas size");
      }

      const canvas = createCanvas(width, height);
      return {
        canvas,
        // @napi-rs/canvas does not expose the browser-only
        // `willReadFrequently` context option; its 2D context is already
        // appropriate for the short-lived render and audit work here.
        context: canvas.getContext("2d")
      };
    }

    reset(canvasAndContext: { canvas?: CanvasLike | null; context?: unknown }, width: number, height: number) {
      if (!canvasAndContext.canvas || width <= 0 || height <= 0) {
        throw new Error("Invalid canvas reset");
      }

      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext: { canvas?: CanvasLike | null; context?: unknown }) {
      if (!canvasAndContext.canvas) {
        return;
      }

      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  };
}

async function extractEmbeddedImages(pageBytes: Uint8Array, stem: string) {
  try {
    // Keep this import visible to Next's file tracer. `webpackIgnore` made
    // the local development import work while omitting the native canvas
    // package from the Vercel function, which left every textbook visual
    // candidate without pixels in production.
    const { createCanvas, ImageData } = await import("@napi-rs/canvas");
    const pdfjs = await loadPdfJsWithInlineWorker();
    const loadingTask = pdfjs.getDocument({
      CanvasFactory: textbookCanvasFactory(createCanvas),
      // PDF.js transfers this buffer to its worker. Keep the original bytes
      // intact because they are also the source of the OpenAI page attachment.
      data: pageBytes.slice(),
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
    const { createCanvas, DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.DOMMatrix ||= DOMMatrix;
    globals.ImageData ||= ImageData;
    globals.Path2D ||= Path2D;
    const pdfjs = await loadPdfJsWithInlineWorker();
    const pdf = await pdfjs.getDocument({
      CanvasFactory: textbookCanvasFactory(createCanvas),
      // PDF.js transfers this buffer to its worker. Rendering must never
      // detach the canonical one-page PDF that we attach to the model.
      data: pageBytes.slice(),
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
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const image = await loadImage(dataUrl);
    const expandedCrop = expandTextbookFigureCrop(crop);
    if (!expandedCrop) return "";
    const { x, y, width, height } = expandedCrop;
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

        const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
        const renderedPage = await renderPageImage(bytes);
        evidence.push({
          dataUrl,
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
