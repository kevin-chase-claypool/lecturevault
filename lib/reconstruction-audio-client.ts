export type PreparedAudio = {
  audioTranscripts: string[];
  audioTranscriptTexts: string[];
  timedAudioSegments: Array<{ mediaItemId: string; startSeconds: number; endSeconds: number; text: string }>;
  transcribedMediaIds: string[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

type AudioSource = { id: string; kind: string; name: string; mimeType?: string; storageBucket?: string; storagePath?: string; dataUrl?: string; size?: number };
type AudioPart = PreparedAudio & { chunkCount: number; nextChunkIndex: number | null };
type Checkpoint = { mediaId: string; parts: Array<AudioPart | null> };

export async function reconstructionResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: T & { error?: string };
  try { data = JSON.parse(text); } catch {
    throw new Error(response.status === 504 || /timed?\s*out|FUNCTION_INVOCATION_TIMEOUT/i.test(text)
      ? "This reconstruction step exceeded the server time limit. Retry Build; completed audio parts will be reused."
      : `The reconstruction service returned an unreadable response (HTTP ${response.status}). Retry Build; completed audio parts will be reused.`);
  }
  if (!response.ok) throw new Error(data?.error || `Reconstruction request failed (HTTP ${response.status}). Retry Build to resume.`);
  if (!data || typeof data !== "object") throw new Error("The reconstruction service returned an empty result. Retry Build to resume.");
  return data;
}

export async function prepareReconstructionAudio(
  sources: AudioSource[],
  context: { courseName: string; title: string; courseStudyProfile?: string },
  options: {
    request?: typeof fetch;
    storage?: Pick<Storage, "getItem" | "setItem">;
    progress?: (message: string) => void;
  } = {}
): Promise<PreparedAudio> {
  const result: PreparedAudio = { audioTranscripts: [], audioTranscriptTexts: [], timedAudioSegments: [], transcribedMediaIds: [], usage: {} };
  const request = options.request || fetch;
  let storage = options.storage;
  if (!storage) { try { storage = localStorage; } catch { /* Storage may be disabled. */ } }
  const audio = sources.filter((source) => source.kind === "audio" && (source.dataUrl || source.storagePath) && /mp3|mpeg|wav/i.test(`${source.name} ${source.mimeType}`)).slice(0, 3);
  for (const [sourceIndex, source] of audio.entries()) {
    // Stable source identity: media IDs are regenerated when a failed build is
    // retried. Hash source bytes/path and transcription context instead.
    const identity = JSON.stringify({ version: 1, ...context, name: source.name, size: source.size, bucket: source.storageBucket, path: source.storagePath, inline: source.dataUrl });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    const key = `lecturevault-audio-v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    let saved: Checkpoint = { mediaId: source.id, parts: [] };
    try {
      const parsed = JSON.parse(storage?.getItem(key) || "null") as Checkpoint | null;
      if (parsed?.mediaId && Array.isArray(parsed.parts)) saved = parsed;
    } catch { /* An unavailable or invalid checkpoint starts a fresh run. */ }
    const reportProgress = () => options.progress?.(`Transcribing audio ${sourceIndex + 1}/${audio.length}: ${saved.parts.filter(Boolean).length}/${saved.parts[0]?.chunkCount || "?"} parts complete`);
    const transcribePart = async (index: number) => {
      reportProgress();
      const part = await reconstructionResponse<AudioPart>(await request("/api/lecture-ai", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...context, phase: "transcribe", audioChunkIndex: index, mediaItems: [{ ...source, id: saved.mediaId }] })
      }));
      if (!Array.isArray(part.audioTranscripts) || !Array.isArray(part.audioTranscriptTexts) || !Array.isArray(part.timedAudioSegments) || !Array.isArray(part.transcribedMediaIds) || !Number.isInteger(part.chunkCount) || part.chunkCount <= index || part.nextChunkIndex !== (index + 1 < part.chunkCount ? index + 1 : null) || (saved.parts[0] && saved.parts[0].chunkCount !== part.chunkCount)) {
        throw new Error("The transcription service returned an incomplete audio part. Retry Build to resume.");
      }
      // Index parts by source position, since concurrent requests can finish
      // out of order. Persist each completion immediately, including gaps.
      saved.parts[index] = part;
      try { storage?.setItem(key, JSON.stringify(saved)); } catch { /* Quota/storage failure must not discard the active run. */ }
      reportProgress();
    };
    // The first part discovers the total count. Existing sequential checkpoints
    // use the same layout and remain reusable after this concurrency change.
    if (!saved.parts[0]) await transcribePart(0);
    const count = saved.parts[0]!.chunkCount;
    const pending = Array.from({ length: count }, (_, index) => index).filter((index) => !saved.parts[index]);
    let cursor = 0;
    let failure: unknown;
    const worker = async () => {
      while (!failure && cursor < pending.length) {
        const index = pending[cursor++];
        try { await transcribePart(index); } catch (error) { failure = error; }
      }
    };
    // Bound provider pressure and wait for all in-flight requests on failure,
    // so their completed work is checkpointed before offering a retry.
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
    if (failure) throw failure;
    for (let index = 0; index < count; index += 1) {
      const part = saved.parts[index];
      if (!part) throw new Error("An audio part is missing. Retry Build to resume.");
      result.audioTranscripts.push(...part.audioTranscripts.map((text) => text.replaceAll(saved.mediaId, source.id)));
      result.audioTranscriptTexts.push(...part.audioTranscriptTexts);
      result.timedAudioSegments.push(...part.timedAudioSegments.map((segment) => ({ ...segment, mediaItemId: source.id })));
      for (const field of ["input_tokens", "output_tokens", "total_tokens"] as const) result.usage![field] = (result.usage![field] || 0) + (part.usage?.[field] || 0);
    }
    if (saved.parts.length) result.transcribedMediaIds.push(source.id);
  }
  return result;
}
