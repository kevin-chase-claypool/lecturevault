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

let incomplete = false;
const calls = [];
class FakeOpenAI {
  responses = { create: async options => {
    calls.push(options);
    if (options.text?.format?.type === 'json_object') {
      assert.match(JSON.stringify(options.input), /json/i, 'JSON mode requires JSON in an input message, not only separate instructions');
    }
    const output_text = options.text
      ? JSON.stringify({ topics: [{ title: 'Counting', lectureIds: ['a'] }], missingInstructorEvidence: ['Example 3.37 statement missing'] })
      : '## Topic lesson\n### Meaning and method\nExplanation with alternate source formatting.\n### Formulas and assumptions\nAssumptions.\n### Worked walkthrough\n1. Substitute.\n2. Calculate.\n### Common mistakes\nMistake.\n### Practice with solution\nQuestion and worked answer.';
    return { status: incomplete && !options.text ? 'incomplete' : 'completed', output_text, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } };
  }};
}
const route = load('app/api/exam-review/route.ts', {
  openai: FakeOpenAI,
  '../../../lib/exam-review-context': context,
  '../../../lib/auth': { requireAuthenticatedRequest: () => null },
  '../../../lib/supabase-server': { storageObjectToSignedUrl: async () => 'https://example.com/figure.png' },
  '../../../lib/textbook-canonical-evidence': { canonicalTextbookPageEvidence: async () => ({ evidence: [], pageRequestsNeedingSource: [] }), canonicalTextbookEvidenceText: () => '' },
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
