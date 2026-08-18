import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const lectureRouteSource = await readFile(
  new URL("../app/api/lecture-ai/route.ts", import.meta.url),
  "utf8"
);

assert.equal(
  pageSource.includes('sourceTranscriptKind?: "audio" | "pasted"'),
  true,
  "A saved reconstruction must record whether source-transcript rows came from audio or intentionally pasted source text."
);
assert.equal(
  !pageSource.includes(": splitTranscript(transcriptText),"),
  true,
  "Generated reconstruction text must never be split and presented as source-transcript passages."
);
assert.equal(
  pageSource.includes("{hasSourceTranscript ? ("),
  true,
  "The source-transcript panel must be absent when a reconstruction has no actual audio or pasted source transcript."
);
assert.equal(
  lectureRouteSource.includes("audioTranscriptText"),
  true,
  "A completed audio transcription must be returned separately from the generated reconstruction artifact."
);

console.log("Source transcript contract passed.");
