type Topic = { title: string; lectureIds: string[] };
type Usage = { input_tokens: number; output_tokens: number; total_tokens: number };
type Figure = { label: string; lectureId: string; lectureTitle: string; name: string; storagePath?: string; storageBucket?: string; dataUrl?: string; mimeType?: string; sourceCaption?: string };
type Payload = { examName: string; courseName: string; lectures: Array<{ id: string; title: string; date?: string }>; [key: string]: unknown };
type Plan = { topics: Topic[]; gaps: string[]; figures: Figure[]; usage: Usage; instructions: string };
type Checkpoint = { fingerprint: string; plan: Plan; lessons: Array<string | null>; usage: Usage };

const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
function addUsage(total: Usage, value?: Partial<Usage>) {
  for (const key of ['input_tokens', 'output_tokens', 'total_tokens'] as const) total[key] += value?.[key] || 0;
}

export async function generateReviewInSteps({ payload, key, storage, onProgress, fetcher = fetch }: {
  payload: Payload;
  key: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  onProgress: (message: string) => void;
  fetcher?: typeof fetch;
}) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let checkpoint: Checkpoint | undefined;
  try {
    const saved = storage?.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as Checkpoint;
      if (parsed.fingerprint === fingerprint && parsed.plan?.topics?.length && parsed.lessons?.length === parsed.plan.topics.length) checkpoint = parsed;
    }
  } catch { /* Storage access may be unavailable; generation can still proceed. */ }
  const persist = () => { try { storage?.setItem(key, JSON.stringify(checkpoint)); } catch { /* Keep the active run usable if storage is full. */ } };
  async function request(body: object) {
    let response: Response;
    try {
      response = await fetcher('/api/exam-review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error('The connection was interrupted. Completed lessons are retained when browser storage is available. Tap Rebuild Review to resume.');
    }
    let data;
    try { data = await response.json(); } catch {
      throw new Error(`The server returned an unreadable response (${response.status}). Tap Rebuild Review to resume completed lessons.`);
    }
    if (!response.ok) throw new Error(data.error || `Review request failed (${response.status}). Tap Rebuild Review to resume.`);
    return data;
  }
  if (!checkpoint) {
    onProgress('Planning complete topic coverage...');
    const plan = await request({ ...payload, phase: 'plan' }) as Plan;
    if (!Array.isArray(plan.topics) || !plan.topics.length) throw new Error('No review topic plan was returned.');
    const usage = emptyUsage();
    addUsage(usage, plan.usage);
    checkpoint = { fingerprint, plan, lessons: Array(plan.topics.length).fill(null), usage };
    persist();
  }
  for (let index = 0; index < checkpoint.plan.topics.length; index++) {
    if (checkpoint.lessons[index]) continue;
    const topic = checkpoint.plan.topics[index];
    onProgress(`Teaching topic ${index + 1} of ${checkpoint.plan.topics.length}: ${topic.title}`);
    const result = await request({ ...payload, phase: 'topic', topic, topicIndex: index }) as { lesson?: string; usage?: Usage };
    if (!result.lesson?.trim()) throw new Error(`Topic ${index + 1} returned no lesson. Tap Rebuild Review to resume.`);
    checkpoint.lessons[index] = result.lesson;
    addUsage(checkpoint.usage, result.usage);
    persist();
  }
  const { plan, lessons, usage } = checkpoint;
  const text = [
    `# ${payload.examName} Exam Review`, `Course: ${payload.courseName}`, '## Exam Blueprint', plan.instructions,
    ...plan.topics.map((topic, index) => `- Topic ${index + 1}: ${topic.title}. Sources: ${topic.lectureIds.map(id => payload.lectures.find(lecture => lecture.id === id)?.title || id).join('; ')}.`),
    ...(plan.gaps?.length ? ['## Source gaps to verify', ...plan.gaps.map(gap => `- ${gap}`)] : []),
    ...lessons,
    '## Source Map',
    ...payload.lectures.map(lecture => `- ${lecture.title} (${lecture.date || 'No date'}): ${plan.figures.filter(figure => figure.lectureId === lecture.id).map(figure => figure.label).join(', ') || 'No board figures'}.`)
  ].join('\n\n');
  // Keep the completed checkpoint until the caller saves the assembled review.
  return { text, figures: plan.figures, usage, instructions: plan.instructions, generatedBy: 'openai' as const };
}
