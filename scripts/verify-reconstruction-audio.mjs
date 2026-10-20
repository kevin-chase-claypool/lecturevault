import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareReconstructionAudio, reconstructionResponse } from "../lib/reconstruction-audio-client.ts";

const values = new Map();
const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
const context = { courseName: "Math", title: "Random variables" };
const source = { id: "first-id", kind: "audio", name: "lecture.mp3", storagePath: "original.mp3", storageBucket: "media" };
const calls = [];
let interrupt = true;
const request = async (_url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(body.phase, "transcribe");
  assert.equal(body.mediaItems.length, 1);
  calls.push(body.audioChunkIndex);
  if (body.audioChunkIndex === 1 && interrupt) { interrupt = false; return new Response("An error occurred", { status: 504 }); }
  const mediaId = body.mediaItems[0].id;
  return Response.json({
    audioTranscripts: [`media id: ${mediaId} part ${body.audioChunkIndex}`],
    audioTranscriptTexts: [`text ${body.audioChunkIndex}`],
    timedAudioSegments: [{ mediaItemId: mediaId, startSeconds: body.audioChunkIndex * 298, endSeconds: body.audioChunkIndex * 298 + 5, text: "lecture" }],
    transcribedMediaIds: [mediaId], usage: { total_tokens: 10 }, chunkCount: 2,
    nextChunkIndex: body.audioChunkIndex === 0 ? 1 : null
  });
};
await assert.rejects(prepareReconstructionAudio([source], context, { request, storage }), /server time limit/);
const result = await prepareReconstructionAudio([{ ...source, id: "retry-id" }], context, { request, storage });
assert.deepEqual(calls, [0, 1, 1], "retry must not repeat completed transcription");
assert.deepEqual(result.transcribedMediaIds, ["retry-id"]);
assert.equal(result.timedAudioSegments[1].startSeconds, 298, "keep original source offsets");
assert.ok(result.timedAudioSegments.every((part) => part.mediaItemId === "retry-id"));
assert.ok(result.audioTranscripts.every((text) => text.includes("retry-id") && !text.includes("first-id")));
assert.equal(result.usage.total_tokens, 20);
await prepareReconstructionAudio([source], context, { request, storage });
assert.equal(calls.length, 3, "generation retry must reuse all completed parts");
await prepareReconstructionAudio([{ ...source, storagePath: "other.mp3" }], context, { request, storage });
assert.deepEqual(calls.slice(3), [0, 1], "changed source invalidates the checkpoint");
await prepareReconstructionAudio([source], context, { request, storage: { getItem() { throw Error("disabled"); }, setItem() { throw Error("full"); } } });
await assert.rejects(reconstructionResponse(new Response("<html>Bad gateway</html>", { status: 502 })), /unreadable response/);
await assert.rejects(reconstructionResponse(Response.json({ error: "Reconnect account" }, { status: 401 })), /Reconnect account/);
const route = await readFile(new URL("../app/api/lecture-ai/route.ts", import.meta.url), "utf8");
assert.ok(route.indexOf('if (body.phase === "transcribe") {') < route.indexOf("const imageInputs"), "transcription returns before retrieval and generation");
assert.ok(route.includes("for (const item of prepared ? [] : usableAudio)"), "prepared generation skips transcription");
console.log("Audio phase isolation, interruption/resume, identity remapping, cache invalidation, storage failure, and non-JSON error handling passed.");

// Resolve later source parts first, fail another while work is still in flight,
// and prove a retry retains those out-of-order completions without duplication.
const concurrentValues = new Map();
const concurrentStorage = { getItem: (key) => concurrentValues.get(key), setItem: (key, value) => concurrentValues.set(key, value) };
let active = 0;
let peak = 0;
let failOnce = true;
const concurrentCalls = [];
const concurrentRequest = async (_url, init) => {
  const body = JSON.parse(init.body);
  const index = body.audioChunkIndex;
  concurrentCalls.push(index);
  active++;
  peak = Math.max(peak, active);
  try {
    await new Promise((resolve) => setTimeout(resolve, index === 1 ? 30 : 5));
    if (index === 1 && failOnce) { failOnce = false; return new Response("Timed out", { status: 504 }); }
    return Response.json({
      audioTranscripts: [`part ${index}`], audioTranscriptTexts: [`text ${index}`],
      timedAudioSegments: [{ mediaItemId: source.id, startSeconds: index * 298, endSeconds: index * 298 + 5, text: `part ${index}` }],
      transcribedMediaIds: [source.id], chunkCount: 6, nextChunkIndex: index < 5 ? index + 1 : null
    });
  } finally { active--; }
};
await assert.rejects(prepareReconstructionAudio([source], context, { request: concurrentRequest, storage: concurrentStorage }), /server time limit/);
assert.equal(active, 0, "all in-flight work settles before retry");
assert.equal(peak, 3, "run up to three transcription requests together");
const snapshot = JSON.parse([...concurrentValues.values()][0]);
assert.equal(snapshot.parts[1], null, "preserve missing-part gap");
assert.ok(snapshot.parts[2], "preserve later completed part");
const callsBeforeResume = concurrentCalls.length;
const resumed = await prepareReconstructionAudio([source], context, { request: concurrentRequest, storage: concurrentStorage });
assert.deepEqual(concurrentCalls.slice(callsBeforeResume), [1], "only retry the missing part");
assert.deepEqual(resumed.audioTranscriptTexts, Array.from({ length: 6 }, (_, index) => `text ${index}`), "assemble in source order");
console.log("Bounded three-request concurrency, out-of-order checkpoints, in-flight failure recovery, and ordered assembly passed.");
