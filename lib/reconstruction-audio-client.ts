export type PreparedAudio = {
  audioTranscripts: string[];
  audioTranscriptTexts: string[];
  timedAudioSegments: Array<{ mediaItemId: string; startSeconds: number; endSeconds: number; text: string }>;
  transcribedMediaIds: string[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

type AudioSource = { id: string; kind: string; name: string; mimeType?: string; storageBucket?: string; storagePath?: string; dataUrl?: string; size?: number };
type AudioPart = PreparedAudio & { chunkCount: number; nextChunkIndex: number | null };
type Checkpoint = { mediaId: string; parts: AudioPart[] };

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
    let nextIndex = saved.parts.length ? saved.parts[saved.parts.length - 1].nextChunkIndex : 0;
    while (nextIndex !== null) {
      options.progress?.(`Transcribing audio ${sourceIndex + 1}/${audio.length}, part ${nextIndex + 1}${saved.parts[0]?.chunkCount ? `/${saved.parts[0].chunkCount}` : ""}`);
      const part = await reconstructionResponse<AudioPart>(await request("/api/lecture-ai", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...context, phase: "transcribe", audioChunkIndex: nextIndex, mediaItems: [{ ...source, id: saved.mediaId }] })
      }));
      if (!Array.isArray(part.audioTranscripts) || !Array.isArray(part.audioTranscriptTexts) || !Array.isArray(part.timedAudioSegments) || !Array.isArray(part.transcribedMediaIds) || !Number.isInteger(part.chunkCount) || part.chunkCount <= nextIndex || (part.nextChunkIndex !== null && part.nextChunkIndex !== nextIndex + 1)) {
        throw new Error("The transcription service returned an incomplete audio part. Retry Build to resume.");
      }
      saved.parts.push(part);
      try { storage?.setItem(key, JSON.stringify(saved)); } catch { /* Quota/storage failure must not discard the active run. */ }
      nextIndex = part.nextChunkIndex;
    }
    for (const part of saved.parts) {
      result.audioTranscripts.push(...part.audioTranscripts.map((text) => text.replaceAll(saved.mediaId, source.id)));
      result.audioTranscriptTexts.push(...part.audioTranscriptTexts);
      result.timedAudioSegments.push(...part.timedAudioSegments.map((segment) => ({ ...segment, mediaItemId: source.id })));
      for (const field of ["input_tokens", "output_tokens", "total_tokens"] as const) result.usage![field] = (result.usage![field] || 0) + (part.usage?.[field] || 0);
    }
    if (saved.parts.length) result.transcribedMediaIds.push(source.id);
  }
  return result;
}
