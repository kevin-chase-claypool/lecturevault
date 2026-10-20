import assert from "node:assert/strict";
import { prepareMp3TranscriptionChunks } from "../lib/mp3-transcription.ts";

// Real MPEG-1 Layer III frame headers; synthetic payloads avoid using private
// lecture audio or spending API credits while testing the chunk boundaries.
const samplesPerFrame = 1152;
const sampleRate = 44100;
const secondsPerFrame = samplesPerFrame / sampleRate;
function mp3(seconds, bitrateIndex, kbps) {
  const frame = Buffer.alloc(Math.floor(144000 * kbps / sampleRate));
  frame.set([0xff, 0xfb, bitrateIndex << 4, 0]);
  const count = Math.ceil(seconds / secondsPerFrame);
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

function verifyChunks(buffer, frameLength) {
  const chunks = prepareMp3TranscriptionChunks(buffer);
  let coveredUntil = 0;
  for (const chunk of chunks) {
    assert.ok(chunk.buffer.length <= 20 * 1024 * 1024);
    assert.equal(chunk.buffer.length % frameLength, 0, "frame-aligned output");
    const duration = chunk.buffer.length / frameLength * secondsPerFrame;
    assert.ok(duration <= 1200, `chunk duration ${duration} must fit the model`);
    assert.ok(Math.abs(chunk.acceptAfterSeconds - coveredUntil) < 1e-5, "no missing source time");
    assert.ok(chunk.sourceStartSeconds <= chunk.acceptAfterSeconds);
    assert.ok(chunk.acceptAfterSeconds - chunk.sourceStartSeconds <= 2.001, "bounded overlap");
    coveredUntil = chunk.sourceStartSeconds + duration;
  }
  assert.ok(Math.abs(coveredUntil - buffer.length / frameLength * secondsPerFrame) < 1e-5, "all source frames covered");
  return chunks;
}

const lowBitrate = mp3(2878.59, 1, 32);
assert.ok(lowBitrate.length < 20 * 1024 * 1024, "reproduces the former small-file bypass");
assert.equal(verifyChunks(lowBitrate, Math.floor(144000 * 32 / sampleRate)).length, 3);
const short = mp3(90, 9, 128);
assert.equal(prepareMp3TranscriptionChunks(short)[0].buffer, short, "short audio needs no split");
assert.ok(verifyChunks(mp3(800, 14, 320), Math.floor(144000 * 320 / sampleRate)).length > 1, "byte limit still enforced");
assert.throws(() => prepareMp3TranscriptionChunks(Buffer.from("not an MP3")), /safely prepared/);
console.log("MP3 duration/byte limits, complete source coverage, overlap, short-file path, and invalid input passed.");
