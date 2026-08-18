import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const selectionSource = await readFile(
  new URL("../lib/textbook-visual-selection.ts", import.meta.url),
  "utf8"
);
const rendererSource = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8"
);
const lectureRouteSource = await readFile(
  new URL("../app/api/lecture-ai/route.ts", import.meta.url),
  "utf8"
);
const visualRepairRouteSource = await readFile(
  new URL("../app/api/reconstruction-visuals/route.ts", import.meta.url),
  "utf8"
);
const visualContractSource = await readFile(
  new URL("../lib/textbook-visual-contract.ts", import.meta.url),
  "utf8"
);
const pageEvidenceSource = await readFile(
  new URL("../lib/textbook-page-evidence.ts", import.meta.url),
  "utf8"
);
const textbookExtractionSource = await readFile(
  new URL("../app/api/textbook/extract/route.ts", import.meta.url),
  "utf8"
);
const visualContractModule = await import(
  "data:text/javascript;base64," + Buffer.from(
    ts.transpileModule(visualContractSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
    }).outputText
  ).toString("base64")
);

assert.equal(
  /maxItems:\s*\d+/.test(selectionSource),
  false,
  "Textbook visual selection must not impose a fixed number of visual aids."
);
assert.equal(
  selectionSource.includes("const selectedCropsBySource = new Map<string"),
  true,
  "Textbook visual selection must deduplicate overlapping figures without blocking distinct figures on one page."
);
assert.equal(
  selectionSource.includes("new Set(candidates)].slice"),
  false,
  "Textbook visual selection must not cap usable inline anchors."
);
assert.equal(
  rendererSource.includes("for (const aid of matches.slice(0, 2))"),
  false,
  "The reconstruction renderer must not cap inline visuals per explanatory passage."
);
assert.equal(
  rendererSource.includes("const remainingVisuals ="),
  false,
  "Source visuals must not fall back to an end-of-document gallery."
);
assert.equal(
  /tokens:\s*\[citation\.inlineAnchor\s*\|\|\s*""\]\s*\.filter\(Boolean\)/.test(rendererSource),
  true,
  "Textbook figures must use their exact teaching anchor rather than a page citation fallback."
);
assert.equal(
  rendererSource.includes("REFERENCE_ONLY_VISUAL_SECTIONS"),
  true,
  "Source and textbook provenance sections must never accept inline visual placement."
);
assert.equal(
  selectionSource.includes("There is no numeric visual quota."),
  true,
  "The visual selector must be explicitly comprehensive for dense source material."
);
assert.equal(
  selectionSource.includes("referenceOnlySection"),
  true,
  "The visual selector must not offer provenance sections as figure anchors."
);
assert.equal(
  selectionSource.includes("containsExactlyOneCompleteVisual"),
  true,
  "A visual verifier must explicitly audit whether a crop contains one complete visual."
);
assert.equal(
  selectionSource.includes("containsSubstantialProse"),
  true,
  "A visual verifier must reject crops dominated by textbook prose or page furniture."
);
assert.equal(
  selectionSource.includes("hasCutOffVisualElements"),
  true,
  "A visual verifier must reject truncated diagrams and plots."
);
assert.equal(
  selectionSource.includes("supportsInlineAnchor"),
  true,
  "A visual verifier must confirm that each figure supports its exact explanation."
);
assert.equal(
  lectureRouteSource.includes("OPENAI_TEXTBOOK_VISUAL_VERIFICATION_MODEL"),
  true,
  "Visual verification must be independently configurable from the lecture-generation model."
);
assert.equal(
  visualContractSource.includes("TEXTBOOK_VISUAL_AUDIT_VERSION = 3"),
  true,
  "Only figures that pass the current audited-figure contract may be rendered."
);
assert.equal(
  visualContractModule.normalizeTightTextbookFigureCrop({ x: 15, y: 50, width: 970, height: 900 }),
  null,
  "A broad near-full-page textbook crop must be rejected before visual auditing."
);
assert.equal(
  visualContractModule.normalizeTightTextbookFigureCrop({ x: 200, y: 120, width: 760, height: 520 }),
  null,
  "A crop covering more than the permitted portion of a page must be rejected."
);
assert.deepEqual(
  visualContractModule.normalizeTightTextbookFigureCrop({ x: 80, y: 120, width: 760, height: 360 }),
  { x: 80, y: 120, width: 760, height: 360 },
  "A bounded interior figure crop must remain eligible for pixel and relevance audits."
);
assert.equal(
  selectionSource.includes("may cover no more than 36% of the page"),
  true,
  "The selector must receive the same maximum crop area as the server, so valid candidates are not silently discarded."
);
assert.equal(
  lectureRouteSource.includes("MAX_TEXTBOOK_VISUAL_SELECTION_ATTEMPTS = 2") &&
    lectureRouteSource.includes("retry: attempt === 1"),
  true,
  "A lesson with relevant textbook pages must receive one refined visual-selection attempt when its first pass produces no safe visual."
);
assert.equal(
  selectionSource.includes("Do not provide the selector's claimed visual kind, rationale, textbook page, or teaching anchor"),
  true,
  "The pixel-quality audit must be blind to the selector's claims so it cannot rubber-stamp a broad page crop."
);
assert.equal(
  selectionSource.includes("specificSubject"),
  true,
  "The pixel-quality audit must identify the actual figure subject, not merely accept a generic topical match."
);
assert.equal(
  selectionSource.includes("const relevanceAudit = await client.responses.create"),
  true,
  "A separately audited figure must also pass exact teaching-anchor relevance before it can render."
);
assert.equal(
  lectureRouteSource.includes("visualAuditVersion: TEXTBOOK_VISUAL_AUDIT_VERSION"),
  true,
  "Only newly audited textbook figures may carry the current rendering approval version."
);
assert.equal(
  rendererSource.includes("citation.visualAuditVersion === TEXTBOOK_VISUAL_AUDIT_VERSION"),
  true,
  "The client must fail closed and hide unversioned textbook crops from older reconstructions."
);
assert.equal(
  selectionSource.includes("embeddedImages") &&
    lectureRouteSource.includes("embeddedImages: page.images") &&
    visualRepairRouteSource.includes("embeddedImages: page.images") &&
    pageEvidenceSource.includes("images: await extractEmbeddedImages"),
  true,
  "Isolated textbook image assets must reach visual selection in reconstruction and visual-repair flows instead of being discarded after extraction."
);
assert.equal(
  visualRepairRouteSource.includes("visualAuditVersion: TEXTBOOK_VISUAL_AUDIT_VERSION"),
  true,
  "Verified repaired textbook figures must carry the current audit version so the fail-closed renderer can display them."
);
assert.equal(
  visualRepairRouteSource.includes("MAX_TEXTBOOK_VISUAL_SELECTION_ATTEMPTS = 2") &&
    visualRepairRouteSource.includes("retry: attempt === 1") &&
    visualRepairRouteSource.includes("previousRejections"),
  true,
  "Refreshing an existing reconstruction must retry with pixel-audit feedback instead of blindly repeating a failed crop."
);
assert.equal(
  visualRepairRouteSource.includes("citedPageRequests(body.textbookCitations, sources)") &&
    rendererSource.includes("const citedTextbookPages = evidenceForTranscript(transcript, state.mediaItems).textbookCitations") &&
    rendererSource.includes("textbookCitations: citedTextbookPages") &&
    rendererSource.includes("Textbook Context Used") &&
    visualRepairRouteSource.includes("textbookNameMatches"),
  true,
  "Visual repair must recover cited pages from both structured and legacy text records before semantic nearest-neighbour pages."
);
assert.equal(
  selectionSource.includes("Rendered-page sources include a faint orange coordinate grid") &&
    pageEvidenceSource.includes("textbookFigureSelectionGuide") &&
    selectionSource.includes("selectionImageDataUrl"),
  true,
  "The selector must receive a coordinate-guided page image while final figures are cropped from the clean page render."
);
assert.equal(
  selectionSource.includes("Inspect exactly one textbook source") &&
    selectionSource.includes("discoverTextbookVisualCitations") &&
    visualRepairRouteSource.includes("focused visual candidates") &&
    lectureRouteSource.includes("focusedSelection"),
  true,
  "When whole-set selection fails, each retrieved textbook source must receive a focused tight-figure pass before the system concludes that no visual qualifies."
);
assert.equal(
  rendererSource.includes("Refresh textbook visual aids") &&
    rendererSource.includes('fetch("/api/reconstruction-visuals"'),
  true,
  "An existing saved reconstruction must expose a source-only visual-aid repair action rather than requiring a duplicate rebuild."
);
assert.equal(
  textbookExtractionSource.includes("OPENAI_TEXTBOOK_VISUAL_INDEX_PAGE_LIMIT || String(MAX_VISUAL_INDEX_PAGES)") &&
    textbookExtractionSource.includes("alreadyVisuallyIndexedPages") &&
    textbookExtractionSource.includes("source_kind\", \"visual_index\""),
  true,
  "Visual indexing must run by default and a refresh must continue with deferred pages from the existing textbook instead of repeating the first batch."
);
assert.equal(
  pageEvidenceSource.includes('import("@napi-rs/canvas")') &&
    textbookExtractionSource.includes('import("@napi-rs/canvas")') &&
    pageEvidenceSource.includes("CanvasFactory: textbookCanvasFactory(createCanvas)") &&
    !pageEvidenceSource.includes('webpackIgnore: true */ "@napi-rs/canvas"') &&
    !textbookExtractionSource.includes('webpackIgnore: true */ "@napi-rs/canvas"'),
  true,
  "The production PDF renderer must keep its canvas dependency traceable and provide it directly to PDF.js so Vercel can supply actual candidate pixels."
);

console.log("Textbook visual contract passed.");
