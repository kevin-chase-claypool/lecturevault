export const ENGINEERING_MATH_EXAM_1_OUTLINE = `Instructor Exam 1 outline (transcribed from the supplied OneNote image):
Chapter 1: Understand sample spaces; sampling with and without replacement (highlighted example); independence.
Chapter 2: Ways of counting to calculate probabilities; damaged/non-damaged component example; conditional probabilities; communication-channel example from Assignment 2 using a probability tree (highlighted).
Chapter 3: Sample space with respect to a random variable; how to obtain a PMF; calculate expected value and variance of discrete random variables; examples 3.21 and 3.37, Assignment 3 (highlighted).
Use this outline to prioritize and connect the selected reconstructions, while teaching every topic they cover. Do not assume an exercise's content from its number: use its saved statement or mark it as unavailable. Other exam instructions may refine this outline.`;

export function reviewInstructions(examName: string, courseName: string, instructions: string) {
  const isRequestedExam = /\bexam\s*1\b/i.test(examName) &&
    (/ENGR\s*-?\s*4176/i.test(courseName) || /advanced engineering math/i.test(courseName));
  return isRequestedExam && !instructions.includes('Instructor Exam 1 outline')
    ? `${instructions}\n\n${ENGINEERING_MATH_EXAM_1_OUTLINE}`.trim()
    : instructions;
}

export function referencesFigure(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A review-wide Fig. 1 is distinct from Fig. 10 and textbook Fig. 1.2.
  return new RegExp(`(?<![\\w.])${escaped}(?!\\w|\\.\\d|\\s*\\d)`, 'i').test(text);
}

export type ReviewTopic = { title: string; lectureIds: string[] };

export function validateReviewPlan(value: unknown, lectureIds: string[]): ReviewTopic[] {
  const topics = (value as { topics?: unknown })?.topics;
  if (!Array.isArray(topics) || !topics.length) throw new Error('Review planning returned no topics. Retry generation.');
  const allowed = new Set(lectureIds);
  const covered = new Set<string>();
  const plan = topics.map((topic: unknown) => {
    const item = topic as Partial<ReviewTopic>;
    if (typeof item.title !== 'string' || !item.title.trim() || !Array.isArray(item.lectureIds) || !item.lectureIds.length ||
      item.lectureIds.some(id => typeof id !== 'string' || !allowed.has(id))) {
      throw new Error('Review planning returned an invalid source scope. Retry generation.');
    }
    item.lectureIds.forEach(id => covered.add(id));
    return { title: item.title.trim(), lectureIds: [...new Set(item.lectureIds)] };
  });
  if (lectureIds.some(id => !covered.has(id))) throw new Error('Review planning omitted a selected reconstruction. Retry generation.');
  return plan;
}

export function completedReviewText(response: { status?: string; output_text: string }) {
  if (response.status !== 'completed' || !response.output_text.trim()) {
    throw new Error('AI review output was incomplete or reached its output limit. No partial review was saved. Retry or narrow the review scope.');
  }
  return response.output_text.trim();
}

export function withLessonSources(text: string, sources: Array<{ title?: string; date?: string }>) {
  const citations = sources.map(source => `[Lecture: ${source.title?.trim() || 'Untitled lecture'}${source.date?.trim() ? `, ${source.date.trim()}` : ''}]`);
  const attribution = `Source reconstructions provided for this lesson: ${citations.join('; ')}.`;
  const lines = text.split('\n');
  const heading = lines.findIndex(line => /^##\s/.test(line));
  lines.splice(heading >= 0 ? heading + 1 : 0, 0, '', attribution, '');
  return lines.join('\n');
}
