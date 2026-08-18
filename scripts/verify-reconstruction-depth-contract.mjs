import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lectureRouteSource = await readFile(
  new URL("../app/api/lecture-ai/route.ts", import.meta.url),
  "utf8"
);
const lectureInstructionsSource = await readFile(
  new URL("../lib/lecture-ai-context.ts", import.meta.url),
  "utf8"
);

assert.equal(
  lectureRouteSource.includes("MAX_RECONSTRUCTION_OUTPUT_TOKENS") &&
    lectureRouteSource.includes("max_output_tokens: MAX_RECONSTRUCTION_OUTPUT_TOKENS"),
  true,
  "A reconstruction must explicitly reserve the model's full supported response budget instead of relying on an implicit default."
);
assert.equal(
  lectureRouteSource.includes("responseReachedOutputLimit") &&
    lectureRouteSource.includes("continueReconstructionArtifact") &&
    lectureRouteSource.includes("previous_response_id"),
  true,
  "A response that reaches its per-call ceiling must continue in a follow-up pass rather than being saved as a shortened lesson."
);
assert.equal(
  lectureInstructionsSource.includes("Never target a uniform reconstruction length") &&
    lectureInstructionsSource.includes("Coverage and beginner-ready understanding, not brevity"),
  true,
  "Reconstruction depth must scale with the number, density, and difficulty of source-grounded topics."
);
assert.equal(
  lectureInstructionsSource.includes("a formula alone is never sufficient") &&
    lectureInstructionsSource.includes("complete example walkthrough") &&
    lectureInstructionsSource.includes("Do not skip from setup to answer"),
  true,
  "Math-heavy material must include intuition-led, step-by-step walkthroughs whenever the topic requires calculation or derivation."
);

console.log("Reconstruction depth contract passed.");
