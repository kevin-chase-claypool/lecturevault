import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const selectionSource = await readFile(
  new URL("../lib/textbook-visual-selection.ts", import.meta.url),
  "utf8"
);
const rendererSource = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8"
);

assert.equal(
  /maxItems:\s*\d+/.test(selectionSource),
  false,
  "Textbook visual selection must not impose a fixed number of visual aids."
);
assert.equal(
  selectionSource.includes("const seenCrops = new Set<string>();"),
  true,
  "Textbook visual selection must deduplicate exact crops rather than whole textbook pages."
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

console.log("Textbook visual contract passed.");
