import assert from "node:assert/strict";
import { buildLessonContext } from "../lib/lesson-context.ts";

const lesson = String.raw`## Transformation of a random variable
For $Y=g(X)$, use $f_Y(y)=f_X(g^{-1}(y))\left|\frac{d}{dy}g^{-1}(y)\right|$.
Include all valid inverse branches.`;
const input = {
  title: "Functions of random variables", date: "2026-10-19", course: "ENGR-4176",
  studyProfile: "Engineering mathematics", summary: "Change of variables", lesson,
  concepts: [{ title: "Jacobian", detail: "The absolute derivative rescales density." }],
  media: [{ name: "lecture.mp3", kind: "audio", storagePath: "private/object", dataUrl: "data:audio/mp3;base64,SECRET", signedUrl: "https://private.example/?token=SECRET" }],
  evidence: { textbookCitations: [{ textbookName: "Probability", pageStart: 12, pageEnd: 13, description: "Density transformations", imageDataUrl: "data:image/png;base64,SECRET" }], audioClips: [{ startSeconds: 120, endSeconds: 150, description: "Inverse branches" }] },
  oneNoteSources: [{ title: "Class notes", text: "", webUrl: "https://www.onenote.com/page" }]
};
const text = buildLessonContext(input);
assert.ok(text.includes(lesson), "preserve complete Markdown and LaTeX");
for (const value of [input.title, input.course, input.date, input.studyProfile, "Jacobian", "lecture.mp3", "Probability, pp. 12–13", "120–150 seconds", "https://www.onenote.com/page"]) assert.ok(text.includes(value), value);
assert.ok(!text.includes("SECRET") && !text.includes("private/object"), "exclude media payloads and private storage fields");
assert.ok(text.includes("Original audio, PDFs, and figure images are not attached"));
const minimal = buildLessonContext({ title: "Saved lesson", date: "2026-01-01", course: "Math", lesson: "Only this lesson" });
assert.ok(minimal.includes("Only this lesson") && !minimal.includes(input.title), "scope to the selected reconstruction");
const longLesson = "Full lesson content. ".repeat(10000);
assert.ok(buildLessonContext({ title: "Long lesson", date: "", course: "", lesson: longLesson }).includes(longLesson.trim()), "never silently truncate");
assert.ok(buildLessonContext({ title: "Missing lesson", date: "", course: "", lesson: "" }).includes("No lesson text was saved"));
console.log("Lesson export preserves math and full content, includes context/citations, handles missing fields, and excludes private media payloads.");
