import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks = {}, extra = '') {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id] || require(id),
    Response, Request, URL, Error, TextEncoder, Uint8Array, crypto: require('node:crypto').webcrypto, process: { env: { OPENAI_API_KEY: 'test-only' } }, console });
  return module.exports;
}
const context = load('lib/exam-review-context.ts');
const unordered = [
  { title: 'Conditional Probability', lectureIds: ['a'] },
  { title: 'Expected Value', lectureIds: ['a'] },
  { title: 'Communication Channel Problem (Assignment 2)', lectureIds: ['a'] },
  { title: 'Mathematical Probability Models in Engineering — all topics and problem methods', lectureIds: ['b'] },
  { title: 'Variance: Exercise 3.21', lectureIds: ['a'] },
  { title: 'Conditional PMF: Exercise 3.37', lectureIds: ['a'] }
];
const ordered = context.orderReviewTopics(unordered, [{ id: 'b', title: 'Probability Models' }, { id: 'a', title: 'Expectation' }], 'Exam1', 'ENGR-4176');
assert.match(ordered[0].title, /Probability Models/);
assert.match(ordered[1].title, /Conditional Probability/);
assert.match(ordered[2].title, /Communication Channel/);
assert.match(ordered[3].title, /Expected Value/);
assert.match(ordered[4].title, /3\.21/);
assert.match(ordered[5].title, /3\.37/);
assert.equal(context.orderReviewTopics(unordered, [], 'Exam2', 'Other'), unordered);
const tutor = load('lib/review-lesson.ts', { './exam-review-context': context });
const problemFixture = { problem: 'Two fair coin tosses: find the probability of two heads.', givens: 'Independent tosses; P(H)=1/2.', find: 'P(HH).', method: 'Multiply independent probabilities.', steps: ['P(HH) = (1/2)(1/2).'], answer: '1/4.', check: 'Four equally likely outcomes.', citation: 'Assignment 1, p. 3', figures: [{ label: 'Figure 1', explanation: 'Follow the two branches to HH.' }] };
const lessonFixture = { meaning: 'Multiply independent event probabilities.', formulas: 'Independence assumption.', conceptFigures: [], walkthroughs: [problemFixture], mistakes: ['Do not assume independence without evidence.'], practice: [problemFixture], unusedFigureReason: '' };
const renderedTutor = tutor.renderTutorLesson(lessonFixture, 'Independence', 1, [{ label: 'Fig. 1' }]);
assert.ok(renderedTutor.indexOf('Problem statement:') < renderedTutor.indexOf('1. P(HH)'));
assert.ok(renderedTutor.indexOf('Given:') < renderedTutor.indexOf('1. P(HH)'));
assert.match(renderedTutor, /Figure guide — Fig\. 1/);
assert.equal(context.referencesFigure('Figure 1 supports this.', 'Fig. 1'), true);
assert.equal(context.referencesFigure('Fig 1 supports this.', 'Fig. 1'), true);
const indexFilters = [];
const indexRows = [
  { course_id: 'course', textbook_id: 'assignment3', textbook_name: 'Assignment 3', page_number: 6, source_kind: 'native_text', evidence_text: 'Printed problem 3.21' },
  { course_id: 'course', textbook_id: 'assignment3', textbook_name: 'Assignment 3', page_number: 6, source_kind: 'visual_index', evidence_text: 'Handwritten solution' },
  { course_id: 'course', textbook_id: 'assignment3', textbook_name: 'Assignment 3', page_number: 9, source_kind: 'visual_index', evidence_text: 'Printed problem 3.37', requires_visual_verification: true }
];
const indexBuilder = {
  select() { return this; },
  eq(key, value) { indexFilters.push([key, value]); return this; },
  in(key, value) { indexFilters.push([key, value]); return this; },
  order() { return this; },
  async range(start, end) { return { data: indexRows.slice(start, end + 1), error: null }; }
};
const canonical = load('lib/textbook-canonical-evidence.ts', {
  './supabase-server': { supabaseServerClient: () => ({ from: () => indexBuilder }) }
});
const assignmentEvidence = await canonical.courseAssignmentReviewEvidence({ courseId: 'course', sources: [
  { textbookId: 'assignment3', name: 'Assignment 3.pdf' }, { textbookId: 'largebook', name: 'Probability textbook.pdf' }
] });
assert.equal(assignmentEvidence.evidence.length, 2);
assert.match(assignmentEvidence.evidence[0].evidenceText, /Printed problem 3.21/);
assert.match(assignmentEvidence.evidence[0].evidenceText, /Handwritten solution/);
assert.equal(assignmentEvidence.pageRequestsNeedingSource[0].pageStart, 9);
assert.deepEqual(JSON.parse(JSON.stringify(indexFilters)), [['course_id', 'course'], ['textbook_id', ['assignment3']]]);
assert.equal(context.referencesFigure('See Fig. 1.', 'Fig. 1'), true);
assert.equal(context.referencesFigure('Fig. 10', 'Fig. 1'), false);
assert.equal(context.referencesFigure('Textbook Fig. 1.2', 'Fig. 1'), false);
assert.equal(context.referencesFigure('Fig. 1', 'Fig. 10'), false);
assert.match(context.reviewInstructions('Exam1', 'ENGR-4176', 'Study'), /Assignment 2/);
assert.equal(context.reviewInstructions('Exam 2', 'ENGR-4176', 'Study'), 'Study');
assert.equal(context.reviewInstructions('Exam 1', 'Other course', 'Study'), 'Study');
const guided = context.reviewInstructions('Exam1', 'ENGR-4176', 'Study');
assert.equal(context.reviewInstructions('Exam1', 'ENGR-4176', guided), guided);
assert.throws(() => context.validateReviewPlan({ topics: [{ title: 'PMF', lectureIds: ['a'] }] }, ['a', 'b']), /omitted/);
assert.throws(() => context.validateReviewPlan({ topics: [{ title: 'PMF', lectureIds: ['outside'] }] }, ['a']), /invalid/);
const sources = Array.from({ length: 16 }, (_, i) => ({ id: `source-${i}`, title: `Lecture ${i}` }));
const repaired = context.completeReviewPlan({ topics: [{ title: 'Planned topic', lectureIds: ['source-0', 'outside'] }] }, sources);
assert.equal(new Set(repaired.flatMap(topic => topic.lectureIds)).size, 16);
assert.equal(repaired.some(topic => topic.lectureIds.includes('outside')), false);
assert.equal(context.completeReviewPlan({ topics: [] }, sources).length, 16);
assert.throws(() => context.completedReviewText({ status: 'incomplete', output_text: 'Partial' }), /No partial/);
const attributed = context.withLessonSources('## Topic: PMF\nExplanation with a differently formatted citation.', [{ title: 'Saved PMF Lecture', date: '2026-09-01' }]);
assert.match(attributed, /\[Lecture: Saved PMF Lecture, 2026-09-01\]/);
assert.ok(attributed.indexOf('[Lecture:') < attributed.indexOf('Explanation'));

const pdf = load('app/api/exam-review/pdf/route.ts', {
  '../../../../lib/exam-review-context': context,
  '../../../../lib/auth': { requireAuthenticatedRequest: () => null },
  '../../../../lib/supabase-server': {}
}, '\nexport { buildHtml };');
const html = pdf.buildHtml({ title: 'Exam', courseName: 'Math', sourceLinks: [],
  figures: [1, 10].map(n => ({ label: `Fig. ${n}`, name: `Image ${n}`, dataUrl: 'data:image/png;base64,TEST' })),
  review: '## Topic 1: Conditional PMF\nUse Fig. 10 to follow the tree.\n1. Condition.\n2. Normalize.\nUse Fig. 1 for the result.\nAgain Fig. 10.\n## Source Map\n- Fig. 1, Fig. 10'
});
assert.ok(html.indexOf('Image 10') < html.indexOf('Condition.'));
assert.ok(html.indexOf('Image 1</figcaption>') > html.indexOf('Normalize.'));
assert.equal((html.match(/<figure>/g) || []).length, 2);
assert.match(html, /<ol><li>Condition\.<\/li><li>Normalize\.<\/li><\/ol>/);
assert.doesNotMatch(html, /<h2>Figure References/);
assert.match(html, /class="topic-start"/);
assert.match(html, /\.topic-start \{ break-before: page; page-break-before: always;/);

let incomplete = false;
const calls = [];
class FakeOpenAI {
  responses = { create: async options => {
    calls.push(options);
    if (options.text?.format?.type === 'json_object') {
      assert.match(JSON.stringify(options.input), /json/i, 'JSON mode requires JSON in an input message, not only separate instructions');
    }
    const output_text = options.text?.format?.type === 'json_object'
      ? JSON.stringify({ topics: [{ title: 'Counting', lectureIds: ['a'] }], missingInstructorEvidence: ['Example 3.37 statement missing'] })
      : JSON.stringify(lessonFixture);
    return { status: incomplete && options.text?.format?.type !== 'json_object' ? 'incomplete' : 'completed', output_text, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } };
  }};
}
const route = load('app/api/exam-review/route.ts', {
  openai: FakeOpenAI,
  '../../../lib/exam-review-context': context,
  '../../../lib/review-lesson': tutor,
  '../../../lib/auth': { requireAuthenticatedRequest: () => null },
  '../../../lib/supabase-server': { storageObjectToSignedUrl: async () => 'https://example.com/figure.png' },
  '../../../lib/textbook-canonical-evidence': {
    canonicalTextbookPageEvidence: async () => ({ evidence: [], pageRequestsNeedingSource: [] }),
    courseAssignmentReviewEvidence: async () => ({ evidence: [{ textbookId: 'assignment3', textbookName: 'Assignment 3', pageNumber: 6, evidenceText: 'ASSIGNMENT_EXERCISE_3_21' }], pageRequestsNeedingSource: [] }),
    canonicalTextbookEvidenceText: evidence => evidence.map(page => page.evidenceText).join('\n')
  },
  '../../../lib/textbook-page-evidence': { textbookPageEvidence: async () => [] }
});
function request() {
  return new Request('https://example.com/api/exam-review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    examName: 'Exam1', courseName: 'ENGR-4176', reviewSectionIds: ['exam1'],
    lectures: [{ id: 'a', title: 'Counting', examSectionIds: ['exam1'] }, { id: 'b', title: 'PMF', examSectionIds: ['exam1'] }, { id: 'outside', title: 'OUTSIDE_SCOPE', examSectionIds: ['exam2'] }],
    transcripts: [{ lectureId: 'a', text: 'Counting example' }, { lectureId: 'b', text: 'PMF example' }, { lectureId: 'outside', text: 'OUTSIDE_SCOPE' }],
    mediaItems: [{ lectureId: 'a', kind: 'image', name: 'Tree', storagePath: 'tree.png' }]
  }) });
}
const response = await route.POST(request());
assert.equal(response.status, 200);
const data = await response.json();
assert.equal(calls.length, 3);
assert.equal(data.usage.total_tokens, 90);
assert.match(data.text, /Source gaps to verify/);
assert.match(data.instructions, /Assignment 3/);
assert.match(data.text, /\[Lecture: Counting\]/);
assert.match(data.text, /\[Lecture: PMF\]/);
assert.doesNotMatch(JSON.stringify(calls), /OUTSIDE_SCOPE/);
assert.match(JSON.stringify(calls[0].input), /ASSIGNMENT_EXERCISE_3_21/);
assert.match(JSON.stringify(calls[1].input), /ASSIGNMENT_EXERCISE_3_21/);
const imageCall = calls.find(call => JSON.stringify(call.input).includes('input_image'));
assert.ok(imageCall);
assert.match(JSON.stringify(imageCall.input), /Review-wide image label: Fig\. 1/);
incomplete = true;
const failed = await route.POST(request());
assert.equal(failed.status, 500);
assert.match((await failed.json()).error, /No partial review/);
incomplete = false;
const phased = await route.POST(new Request('https://example.com/api/exam-review', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...await request().json(), phase: 'plan' })
}));
const planData = await phased.json();
assert.equal(planData.topics.length, 2);
const beforeTopic = calls.length;
const topicResponse = await route.POST(new Request('https://example.com/api/exam-review', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...await request().json(), phase: 'topic', topic: planData.topics[0], topicIndex: 0 })
}));
assert.equal(topicResponse.status, 200);
assert.equal(calls.length, beforeTopic + 1, 'A topic request must never regenerate the plan or other lessons');
assert.ok((await topicResponse.json()).lesson);
const client = load('lib/review-generation-client.ts');
const saved = new Map();
const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const payload = { examName: 'Exam1', courseName: 'Math', lectures: [{ id: 'a', title: 'Counting' }, { id: 'b', title: 'PMF' }] };
const attempts = [];
let disconnect = true;
const fetcher = async (_url, options) => {
  const body = JSON.parse(options.body);
  attempts.push(body.phase === 'plan' ? 'plan' : body.topicIndex);
  if (body.phase === 'plan') return Response.json(planData);
  if (body.topicIndex === 1 && disconnect) throw new TypeError('Failed to fetch');
  return Response.json({ lesson: `Completed topic ${body.topicIndex}`, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } });
};
await assert.rejects(client.generateReviewInSteps({ payload, key: 'exam1', storage, fetcher, onProgress: () => {} }), /connection was interrupted/);
disconnect = false;
const resumed = await client.generateReviewInSteps({ payload, key: 'exam1', storage, fetcher, onProgress: () => {} });
assert.deepEqual(attempts, ['plan', 0, 1, 1]);
assert.match(resumed.text, /Completed topic 0/);
assert.match(resumed.text, /Completed topic 1/);
assert.equal(resumed.usage.total_tokens, 90);
console.log('Exam review contracts passed: scope, coverage, completion, token aggregation, instructor outline, inline figures, ordered walkthroughs.');
