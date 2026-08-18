/**
 * Shared, client-safe contract for a textbook image that is allowed to appear
 * in a reconstruction. Keeping this outside the OpenAI/server module lets the
 * renderer reject legacy or partially audited evidence as well.
 */
export const TEXTBOOK_VISUAL_AUDIT_VERSION = 3;

// Coordinates use the 0–1000 page coordinate system sent to the visual model.
// A useful figure can be large, but it may not be a broad textbook-page region.
export const TEXTBOOK_VISUAL_MAX_PAGE_AREA = 360_000;
export const TEXTBOOK_VISUAL_MIN_PAGE_MARGIN = 24;

export type TextbookFigureCrop = {
  height?: unknown;
  width?: unknown;
  x?: unknown;
  y?: unknown;
};

export function normalizeTightTextbookFigureCrop(value: TextbookFigureCrop | null | undefined) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  const area = width * height;
  const right = x + width;
  const bottom = y + height;

  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < TEXTBOOK_VISUAL_MIN_PAGE_MARGIN ||
    y < TEXTBOOK_VISUAL_MIN_PAGE_MARGIN ||
    width < 90 ||
    height < 90 ||
    right > 1000 - TEXTBOOK_VISUAL_MIN_PAGE_MARGIN ||
    bottom > 1000 - TEXTBOOK_VISUAL_MIN_PAGE_MARGIN ||
    area > TEXTBOOK_VISUAL_MAX_PAGE_AREA
  ) {
    return null;
  }

  return { x, y, width, height };
}
