import { referencesFigure } from './exam-review-context';

type FigureGuide = { label: string; explanation: string };
type Problem = {
  problem: string; givens: string; find: string; method: string;
  steps: string[]; answer: string; check: string; citation: string; figures: FigureGuide[];
};
export type TutorLesson = {
  meaning: string; formulas: string; conceptFigures: FigureGuide[];
  walkthroughs: Problem[]; mistakes: string[]; practice: Problem[]; unusedFigureReason: string;
};

const text = { type: 'string' };
const figure = { type: 'object', additionalProperties: false,
  properties: { label: text, explanation: text }, required: ['label', 'explanation'] };
const figures = { type: 'array', items: figure };
const problem = { type: 'object', additionalProperties: false, properties: {
  problem: text, givens: text, find: text, method: text,
  steps: { type: 'array', items: text, minItems: 1 }, answer: text, check: text, citation: text, figures
}, required: ['problem', 'givens', 'find', 'method', 'steps', 'answer', 'check', 'citation', 'figures'] };
export const TUTOR_LESSON_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  meaning: text, formulas: text, conceptFigures: figures,
  walkthroughs: { type: 'array', items: problem, minItems: 1 },
  mistakes: { type: 'array', items: text },
  practice: { type: 'array', items: problem, minItems: 1 }, unusedFigureReason: text
}, required: ['meaning', 'formulas', 'conceptFigures', 'walkthroughs', 'mistakes', 'practice', 'unusedFigureReason'] };

export function renderTutorLesson(lesson: TutorLesson, title: string, number: number, availableFigures: Array<{ label: string }>) {
  const used = new Set<string>();
  function guides(items: FigureGuide[]) {
    return items.flatMap(item => {
      const source = availableFigures.find(figure => referencesFigure(item.label, figure.label));
      if (!source || used.has(source.label)) return [];
      used.add(source.label);
      return [`**Figure guide — ${source.label}:** ${item.explanation}`];
    });
  }
  function walkthrough(item: Problem, index: number) {
    if (!item.problem?.trim() || !item.givens?.trim() || !item.find?.trim() || !item.steps?.length) {
      throw new Error('A walkthrough returned without its problem statement, givens, target, or solution steps. Completed earlier lessons remain resumable.');
    }
    return [
      `#### Problem ${index + 1}`, `**Problem statement:** ${item.problem}`,
      `**Source:** ${item.citation}`, `**Given:** ${item.givens}`, `**Find:** ${item.find}`,
      `**Why this method:** ${item.method}`, ...guides(item.figures),
      ...item.steps.map((step, i) => `${i + 1}. ${step}`),
      `**Answer:** ${item.answer}`, `**Check:** ${item.check}`
    ].join('\n\n');
  }
  return [
    `## Topic ${number}: ${title}`, '### Meaning and method', lesson.meaning,
    ...guides(lesson.conceptFigures), '### Formulas and assumptions', lesson.formulas,
    '### Worked walkthrough', ...lesson.walkthroughs.map(walkthrough),
    '### Common mistakes', ...lesson.mistakes.map(mistake => `- ${mistake}`),
    '### Practice with solution', ...lesson.practice.map(walkthrough)
  ].join('\n\n');
}
