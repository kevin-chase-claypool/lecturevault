export type LessonContextInput = {
  title: string;
  date: string;
  course: string;
  studyProfile?: string;
  summary?: string;
  lesson: string;
  concepts?: Array<{ title: string; detail: string }>;
  media?: Array<{ name: string; kind: string; sourceRole?: string; sourceCaption?: string }>;
  oneNoteSources?: Array<{ title: string; webUrl?: string; text: string }>;
  evidence?: {
    figures?: Array<{ label?: string; description?: string }>;
    audioClips?: Array<{ startSeconds: number; endSeconds: number; description?: string }>;
    textbookCitations?: Array<{ textbookName: string; pageStart: number; pageEnd?: number; description?: string }>;
  };
};

// Export original lesson Markdown/LaTeX, rather than rendered KaTeX DOM text.
// Use an explicit field allowlist so uploaded binaries, storage credentials,
// signed URLs, and unrelated reconstructions never enter the clipboard.
export function buildLessonContext(input: LessonContextInput) {
  const references = [
    ...(input.media || []).map((source) => `- ${source.name} (${source.sourceRole || source.kind})${source.sourceCaption ? `: ${source.sourceCaption}` : ""}`),
    ...(input.evidence?.figures || []).map((figure) => `- ${figure.label || "Figure"}: ${figure.description || "Visual cited by the lesson"}`),
    ...(input.evidence?.audioClips || []).map((clip) => `- Audio ${clip.startSeconds}–${clip.endSeconds} seconds${clip.description ? `: ${clip.description}` : ""}`),
    ...(input.evidence?.textbookCitations || []).map((citation) => `- ${citation.textbookName}, ${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `pp. ${citation.pageStart}–${citation.pageEnd}` : `p. ${citation.pageStart}`}${citation.description ? `: ${citation.description}` : ""}`),
    ...(input.oneNoteSources || []).map((source) => `- OneNote: ${source.title}${source.webUrl && /^https:\/\//i.test(source.webUrl) ? ` (${source.webUrl})` : ""}`)
  ];
  return [
    "Please help me understand the lesson below. Start by asking which part I find confusing, then teach it step by step with intuition, defined notation, and a worked example. Preserve the mathematics and distinguish the supplied lesson from any extra examples or assumptions. If source material is missing, say so rather than inventing it.",
    `# ${input.title}\nCourse: ${input.course}\nClass date: ${input.date}`,
    input.studyProfile?.trim() ? `## Course context\n${input.studyProfile.trim()}` : "",
    input.summary?.trim() && input.summary.trim() !== input.lesson.trim() ? `## Lesson summary\n${input.summary.trim()}` : "",
    `## Full lesson\n${input.lesson.trim() || "No lesson text was saved for this reconstruction."}`,
    input.concepts?.length ? `## Key concepts\n${input.concepts.map((concept) => `### ${concept.title}\n${concept.detail}`).join("\n\n")}` : "",
    references.length ? `## Source references\n${references.join("\n")}\n\nThis is a text export. Original audio, PDFs, and figure images are not attached. Ask me to upload a relevant image or source excerpt if needed; do not assume you can access private source links.` : "",
    "## My question\nI need help understanding: [describe the step, formula, or idea here]."
  ].filter(Boolean).join("\n\n");
}
