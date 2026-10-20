import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

assert.equal(
  pageSource.includes("oneNoteShareUrl: string"),
  true,
  "Class-day drafts must persist the OneNote share link."
);
assert.equal(
  pageSource.includes("OneNote share link for this class day:"),
  true,
  "The shared OneNote link must reach the AI build context."
);
assert.equal(
  pageSource.includes("id: `onenote-share-${lectureId}`"),
  true,
  "The completed reconstruction must retain the OneNote share link as a source reference."
);
assert.equal(
  pageSource.includes("Add a OneNote page link"),
  true,
  "The capture form must provide a OneNote share-link field."
);

console.log("OneNote share-link contract passed.");
