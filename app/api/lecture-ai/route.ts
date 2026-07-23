import OpenAI, { toFile } from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import { requireAuthenticatedRequest } from "../../../lib/auth";
import {
  LECTURE_AI_INSTRUCTIONS,
  LECTURE_AI_OUTPUT_CONTRACT,
  TEXTBOOK_REFERENCE_POLICY
} from "../../../lib/lecture-ai-context";
import {
  storageObjectToDataUrl,
  supabaseServerClient
} from "../../../lib/supabase-server";
import {
  textbookPageEvidence,
  type TextbookPageSource
} from "../../../lib/textbook-page-evidence";
import {
  canonicalTextbookEvidenceText,
  canonicalTextbookPageEvidence
} from "../../../lib/textbook-canonical-evidence";

export const runtime = "nodejs";

const DEFAULT_LECTURE_MODEL = "gpt-4.1-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe-diarize";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_IMAGE_INPUTS = 30;
const MAX_AUDIO_INPUTS = 3;
const MAX_DOCUMENT_INPUTS = 5;
// Keep retrieval and original-page verification aligned: every retrieved context
// candidate can be backed by its actual textbook page in the same model request.
const MAX_TEXTBOOK_CONTEXT = 8;
// Leave reliable headroom below the Audio API's 25 MB request limit. These chunks
// are created only for transcription; the original source remains in Supabase.
const MAX_TRANSCRIPTION_CHUNK_BYTES = 20 * 1024 * 1024;
const TARGET_TRANSCRIPTION_CHUNK_BYTES = 16 * 1024 * 1024;
const TRANSCRIPTION_CHUNK_OVERLAP_SECONDS = 2;

type LectureMediaItem = {
  id?: string;
  kind?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  sourceRole?: string;
  sourceCaption?: string;
};

type TextbookContextChunk = {
  id?: string;
  pageEnd?: number;
  pageStart?: number;
  text?: string;
  textbookId?: string;
  textbookName?: string;
};

type TextbookSource = TextbookPageSource;

type OneNoteSource = {
  notebookName?: string;
  pageId?: string;
  sectionName?: string;
  text?: string;
  title?: string;
  webUrl?: string;
};

type MatchTextbookChunk = {
  content?: string;
  id?: string;
  page_end?: number;
  page_start?: number;
  similarity?: number;
  textbook_id?: string;
  textbook_name?: string;
};

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type TimedAudioSegment = {
  mediaItemId: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

type AudioTranscriptionChunk = {
  buffer: Buffer;
  acceptAfterSeconds: number;
  sourceStartSeconds: number;
};

type Mp3Frame = {
  durationSeconds: number;
  length: number;
  offset: number;
  startSeconds: number;
};

type ReconstructionEvidence = {
  figures?: Array<{ mediaItemId?: string; description?: string }>;
  audioClips?: Array<{
    mediaItemId?: string;
    startSeconds?: number;
    endSeconds?: number;
    description?: string;
  }>;
  textbookCitations?: Array<{
    textbookName?: string;
    pageStart?: number;
    pageEnd?: number;
    description?: string;
  }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripNonAudioTimestampPrefixes(text: string) {
  return text.replace(
    /(^|\n)\s*(?:\*\*)?\d{1,2}:\d{2}(?:\*\*)?\s*(?:[-–—:]\s*)?/g,
    "$1"
  );
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]+)$/);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";

  return {
    base64: isBase64 ? data : Buffer.from(decodeURIComponent(data)).toString("base64"),
    buffer: isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data)),
    mimeType
  };
}

function audioFormat(media: LectureMediaItem) {
  const name = cleanString(media.name).toLowerCase();
  const mimeType = cleanString(media.mimeType).toLowerCase();

  if (mimeType.includes("mpeg") || mimeType.includes("mp3") || name.endsWith(".mp3")) {
    return "mp3" as const;
  }

  if (mimeType.includes("wav") || name.endsWith(".wav")) {
    return "wav" as const;
  }

  return null;
}

function id3v2Length(buffer: Buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") {
    return 0;
  }

  const flags = buffer[5] || 0;
  const size =
    ((buffer[6] || 0) & 0x7f) * 0x200000 +
    ((buffer[7] || 0) & 0x7f) * 0x4000 +
    ((buffer[8] || 0) & 0x7f) * 0x80 +
    ((buffer[9] || 0) & 0x7f);

  return Math.min(buffer.length, 10 + size + (flags & 0x10 ? 10 : 0));
}

function mp3FrameAt(buffer: Buffer, offset: number, startSeconds: number): Mp3Frame | null {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (buffer[offset + 1] >> 3) & 0x03;
  const layerBits = (buffer[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
  const padding = (buffer[offset + 2] >> 1) & 0x01;

  // LectureVault only needs Layer III MP3 parsing. Reject reserved/free-format frames.
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const sampleRates =
    versionBits === 3
      ? [44100, 48000, 32000]
      : versionBits === 2
        ? [22050, 24000, 16000]
        : [11025, 12000, 8000];
  const bitrates =
    versionBits === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate = sampleRates[sampleRateIndex];
  const bitrate = bitrates[bitrateIndex];

  if (!sampleRate || !bitrate) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  const length = Math.floor(((isMpeg1 ? 144000 : 72000) * bitrate) / sampleRate) + padding;

  if (length < 4 || offset + length > buffer.length) {
    return null;
  }

  return {
    durationSeconds: (isMpeg1 ? 1152 : 576) / sampleRate,
    length,
    offset,
    startSeconds
  };
}

function mp3Frames(buffer: Buffer): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let offset = id3v2Length(buffer);
  let startSeconds = 0;

  while (offset + 4 <= buffer.length) {
    const frame = mp3FrameAt(buffer, offset, startSeconds);

    if (!frame) {
      offset += 1;
      continue;
    }

    frames.push(frame);
    offset += frame.length;
    startSeconds += frame.durationSeconds;
  }

  return frames;
}

function prepareMp3TranscriptionChunks(buffer: Buffer): AudioTranscriptionChunk[] {
  if (buffer.length <= MAX_TRANSCRIPTION_CHUNK_BYTES) {
    return [{ buffer, acceptAfterSeconds: 0, sourceStartSeconds: 0 }];
  }

  const frames = mp3Frames(buffer);

  // Do not risk corrupting a lecture transcript by slicing an unrecognized MP3 stream.
  if (!frames.length) {
    throw new Error("This MP3 could not be safely prepared for transcription. Please re-export it as a standard MP3.");
  }

  const chunks: AudioTranscriptionChunk[] = [];
  let contentStartIndex = 0;

  while (contentStartIndex < frames.length) {
    let endIndex = contentStartIndex;
    const contentStartOffset = frames[contentStartIndex].offset;

    while (
      endIndex < frames.length &&
      frames[endIndex].offset + frames[endIndex].length - contentStartOffset <= TARGET_TRANSCRIPTION_CHUNK_BYTES
    ) {
      endIndex += 1;
    }

    if (endIndex === contentStartIndex) {
      throw new Error("An MP3 frame is too large to prepare for transcription.");
    }

    const acceptAfterSeconds = frames[contentStartIndex].startSeconds;
    let chunkStartIndex = contentStartIndex;

    if (contentStartIndex > 0) {
      const overlapStart = Math.max(0, acceptAfterSeconds - TRANSCRIPTION_CHUNK_OVERLAP_SECONDS);
      while (chunkStartIndex > 0 && frames[chunkStartIndex - 1].startSeconds >= overlapStart) {
        chunkStartIndex -= 1;
      }
    }

    const chunkStart = frames[chunkStartIndex];
    const chunkEnd = frames[endIndex - 1];
    chunks.push({
      buffer: buffer.subarray(chunkStart.offset, chunkEnd.offset + chunkEnd.length),
      acceptAfterSeconds,
      sourceStartSeconds: chunkStart.startSeconds
    });

    contentStartIndex = endIndex;
  }

  return chunks;
}

async function mediaDataUrl(media: LectureMediaItem) {
  const inline = cleanString(media.dataUrl);

  if (inline) {
    return inline;
  }

  return (
    (await storageObjectToDataUrl({
      bucket: cleanString(media.storageBucket),
      mimeType: cleanString(media.mimeType),
      path: cleanString(media.storagePath)
    })) || ""
  );
}

function usageFromOpenAI(usage: unknown): TokenUsage {
  if (!usage || typeof usage !== "object") {
    return {};
  }

  const record = usage as Record<string, unknown>;

  return {
    input_tokens:
      typeof record.input_tokens === "number" ? record.input_tokens : undefined,
    output_tokens:
      typeof record.output_tokens === "number" ? record.output_tokens : undefined,
    total_tokens:
      typeof record.total_tokens === "number" ? record.total_tokens : undefined
  };
}

function addUsage(first: TokenUsage, second: TokenUsage): TokenUsage {
  return {
    input_tokens: (first.input_tokens || 0) + (second.input_tokens || 0) || undefined,
    output_tokens:
      (first.output_tokens || 0) + (second.output_tokens || 0) || undefined,
    total_tokens: (first.total_tokens || 0) + (second.total_tokens || 0) || undefined
  };
}

function usageFromEmbedding(usage: unknown): TokenUsage {
  if (!usage || typeof usage !== "object") {
    return {};
  }

  const record = usage as Record<string, unknown>;
  const input =
    typeof record.prompt_tokens === "number"
      ? record.prompt_tokens
      : typeof record.input_tokens === "number"
        ? record.input_tokens
        : undefined;
  const total =
    typeof record.total_tokens === "number" ? record.total_tokens : input;

  return {
    input_tokens: input,
    total_tokens: total
  };
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function fallbackArtifact(transcriptText: string, media: LectureMediaItem[], title: string) {
  const sourceLines = media.map(
    (item, index) =>
      `- Source ${index + 1}: ${cleanString(item.name) || "Unnamed media"} (${cleanString(item.kind) || "media"})`
  );

  return {
    reconstructionTitle: title,
    summary: transcriptText.slice(0, 600) || "Lecture reconstruction source media saved.",
    transcriptText: [
      transcriptText || "No transcript text was returned.",
      "",
      "## Source Media Used",
      ...sourceLines
    ].join("\n"),
    concepts: []
  };
}

function isTimedTranscriptionModel(model: string) {
  return model === "gpt-4o-transcribe-diarize";
}

function cleanTimedSegments(value: unknown, mediaItemId: string): TimedAudioSegment[] {
  if (!Array.isArray(value) || !mediaItemId) {
    return [];
  }

  return value
    .map((segment) => {
      const record = segment && typeof segment === "object" ? segment as Record<string, unknown> : {};
      const startSeconds = typeof record.start === "number" ? record.start : Number(record.start);
      const endSeconds = typeof record.end === "number" ? record.end : Number(record.end);
      const text = cleanString(record.text);

      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds || !text) {
        return null;
      }

      return {
        mediaItemId,
        startSeconds: Math.max(0, startSeconds),
        endSeconds,
        text
      };
    })
    .filter((segment): segment is TimedAudioSegment => Boolean(segment));
}

function normalizeEvidence(
  evidence: ReconstructionEvidence | undefined,
  mediaItems: LectureMediaItem[],
  timedAudioSegments: TimedAudioSegment[],
  textbookContext: TextbookContextChunk[]
) {
  const figureSources = mediaItems
    .filter((item) => item.kind === "image" && cleanString(item.id))
    .map((item, index) => ({
      label: `Fig. ${index + 1}`,
      mediaItemId: cleanString(item.id),
      description: cleanString(item.sourceCaption)
    }));
  const figureById = new Map(figureSources.map((figure) => [figure.mediaItemId, figure]));
  const audioSourceIds = new Set(timedAudioSegments.map((segment) => segment.mediaItemId));
  const textbookByName = new Map(
    textbookContext
      .filter((chunk) => cleanString(chunk.textbookName))
      .map((chunk) => [cleanString(chunk.textbookName).toLowerCase(), chunk])
  );

  const figures = (Array.isArray(evidence?.figures) ? evidence.figures : [])
    .map((figure) => {
      const source = figureById.get(cleanString(figure.mediaItemId));
      return source
        ? {
            ...source,
            description: cleanString(figure.description) || source.description
          }
        : null;
    })
    .filter((figure): figure is NonNullable<typeof figure> => Boolean(figure));

  const audioClips = (Array.isArray(evidence?.audioClips) ? evidence.audioClips : [])
    .map((clip) => {
      const mediaItemId = cleanString(clip.mediaItemId);
      const startSeconds = Number(clip.startSeconds);
      const endSeconds = Number(clip.endSeconds);

      if (
        !audioSourceIds.has(mediaItemId) ||
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds
      ) {
        return null;
      }

      const matchesSource = timedAudioSegments.some(
        (segment) =>
          segment.mediaItemId === mediaItemId &&
          startSeconds >= segment.startSeconds - 0.5 &&
          endSeconds <= segment.endSeconds + 0.5
      );

      return matchesSource
        ? {
            mediaItemId,
            startSeconds: Math.max(0, startSeconds),
            endSeconds,
            description: cleanString(clip.description)
          }
        : null;
    })
    .filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));

  const textbookCitations = (Array.isArray(evidence?.textbookCitations)
    ? evidence.textbookCitations
    : [])
    .map((citation) => {
      const source = textbookByName.get(cleanString(citation.textbookName).toLowerCase());
      const pageStart = Number(citation.pageStart);
      const pageEnd = Number(citation.pageEnd || citation.pageStart);

      if (!source || !Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) {
        return null;
      }

      return {
        textbookName: cleanString(source.textbookName),
        pageStart,
        pageEnd: Math.max(pageStart, pageEnd),
        description: cleanString(citation.description)
      };
    })
    .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

  return { audioClips, figures, textbookCitations };
}

export async function POST(request: Request) {
  const authError = requireAuthenticatedRequest(request);

  if (authError) {
    return authError;
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("OPENAI_API_KEY is not configured.", 503);
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      courseId?: string;
      date?: string;
      courseName?: string;
      courseStudyProfile?: string;
      notes?: string;
      mediaItems?: LectureMediaItem[];
      oneNoteSources?: OneNoteSource[];
      textbookContext?: TextbookContextChunk[];
      textbookSources?: TextbookSource[];
    };
    const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
    const oneNoteSources = Array.isArray(body.oneNoteSources) ? body.oneNoteSources : [];
    const textbookSources = Array.isArray(body.textbookSources) ? body.textbookSources : [];
    let textbookContext = Array.isArray(body.textbookContext)
      ? body.textbookContext.slice(0, 8)
      : [];
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let totalUsage: TokenUsage = {};
    const audioTranscripts: string[] = [];
    const timedAudioSegments: TimedAudioSegment[] = [];
    const transcribedMediaIds: string[] = [];
    const usableAudio = mediaItems
      .filter(
        (item) =>
          item.kind === "audio" &&
          Boolean(cleanString(item.dataUrl) || cleanString(item.storagePath)) &&
          audioFormat(item)
      )
      .slice(0, MAX_AUDIO_INPUTS);

    for (const item of usableAudio) {
      const parsed = parseDataUrl(await mediaDataUrl(item));
      const format = audioFormat(item);

      if (!parsed || !format) {
        continue;
      }
      const transcriptionModel =
        process.env.OPENAI_TRANSCRIPTION_MODEL ||
        process.env.OPENAI_LECTURE_TRANSCRIPTION_MODEL ||
        DEFAULT_TRANSCRIPTION_MODEL;
      const chunks =
        format === "mp3"
          ? prepareMp3TranscriptionChunks(parsed.buffer)
          : [{ buffer: parsed.buffer, acceptAfterSeconds: 0, sourceStartSeconds: 0 }];
      const itemTimedSegments: TimedAudioSegment[] = [];
      const unsegmentedChunkTexts: Array<{ startSeconds: number; text: string }> = [];
      const sourceName = cleanString(item.name) || item.id || "audio";

      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkName =
          chunks.length === 1
            ? sourceName
            : `${sourceName.replace(/\.[^.]+$/, "") || "lecture-audio"}-part-${String(chunkIndex + 1).padStart(2, "0")}.${format}`;
        const file = await toFile(chunk.buffer, chunkName, { type: parsed.mimeType });
        const transcription = isTimedTranscriptionModel(transcriptionModel)
          ? await client.audio.transcriptions.create({
              chunking_strategy: "auto",
              file,
              model: transcriptionModel,
              response_format: "diarized_json"
            })
          : await client.audio.transcriptions.create({
              file,
              model: transcriptionModel,
              prompt: [
                cleanString(body.courseName),
                cleanString(body.title),
                cleanString(body.courseStudyProfile).slice(0, 900)
              ]
                .filter(Boolean)
                .join(". ") || undefined
            });
        const text = cleanString(transcription.text);

        if (item.id && "segments" in transcription) {
          const segments = cleanTimedSegments(transcription.segments, item.id)
            .map((segment) => ({
              ...segment,
              startSeconds: segment.startSeconds + chunk.sourceStartSeconds,
              endSeconds: segment.endSeconds + chunk.sourceStartSeconds
            }))
            // The two-second overlap protects speech at a split boundary. Keep only
            // new source time so reconstruction context and cited clips are not duplicated.
            .filter((segment) => segment.endSeconds > chunk.acceptAfterSeconds + 0.05)
            .map((segment) => ({
              ...segment,
              startSeconds: Math.max(segment.startSeconds, chunk.acceptAfterSeconds)
            }));
          itemTimedSegments.push(...segments);
          if (!segments.length && text) {
            unsegmentedChunkTexts.push({ startSeconds: chunk.acceptAfterSeconds, text });
          }
        } else if (text) {
          unsegmentedChunkTexts.push({ startSeconds: chunk.acceptAfterSeconds, text });
        }

        totalUsage = addUsage(totalUsage, usageFromOpenAI(transcription.usage));
      }

      const orderedTimedSegments = itemTimedSegments.sort(
        (first, second) => first.startSeconds - second.startSeconds || first.endSeconds - second.endSeconds
      );
      timedAudioSegments.push(...orderedTimedSegments);
      const timestampedSegments = orderedTimedSegments.map(
        (segment) =>
          `[Audio cue | media id: ${segment.mediaItemId} | ${Math.floor(segment.startSeconds)}-${Math.ceil(segment.endSeconds)} seconds] ${segment.text}`
      );
      const unsegmentedTranscript = unsegmentedChunkTexts
        .sort((first, second) => first.startSeconds - second.startSeconds)
        .map(
          (chunk) =>
            `[Audio transcript | media id: ${item.id || "unlinked"} | beginning near ${Math.floor(chunk.startSeconds)} seconds] ${chunk.text}`
        );

      if (timestampedSegments.length || unsegmentedTranscript.length) {
        audioTranscripts.push(
          `Audio source: ${sourceName}\n${[...timestampedSegments, ...unsegmentedTranscript].join("\n")}`
        );
      }

      if (item.id) {
        transcribedMediaIds.push(item.id);
      }
    }

    const imageInputs = (
      await Promise.all(
        mediaItems
          .filter((item) => item.kind === "image")
          .slice(0, MAX_IMAGE_INPUTS)
          .map(async (item) => ({
            dataUrl: await mediaDataUrl(item),
            item
          }))
      )
    ).filter(({ dataUrl }) => dataUrl.startsWith("data:image/"));
    const documentInputs = (
      await Promise.all(
        mediaItems
          .filter(
            (item) =>
              item.kind === "document" &&
              (cleanString(item.mimeType).includes("pdf") || cleanString(item.name).toLowerCase().endsWith(".pdf"))
          )
          .slice(0, MAX_DOCUMENT_INPUTS)
          .map(async (item) => ({ dataUrl: await mediaDataUrl(item), item }))
      )
    ).filter(({ dataUrl }) => dataUrl.startsWith("data:application/pdf"));
    const figureCatalog = mediaItems
      .filter((item) => item.kind === "image" && cleanString(item.id))
      .map(
        (item, index) =>
          `${`Fig. ${index + 1}`} | media id: ${cleanString(item.id)} | ${cleanString(item.name) || "Unnamed figure"}${cleanString(item.sourceCaption) ? ` | ${cleanString(item.sourceCaption)}` : ""}`
      )
      .join("\n");
    const mediaManifest = mediaItems
      .map(
        (item, index) =>
          [
            `${index + 1}. ${cleanString(item.name) || "Unnamed media"}`,
            `role: ${cleanString(item.sourceRole) || cleanString(item.kind) || "media"}`,
            `type: ${cleanString(item.mimeType) || "unknown type"}`,
            cleanString(item.sourceCaption)
              ? `caption: ${cleanString(item.sourceCaption)}`
              : "",
            `id: ${cleanString(item.id)}`
          ]
            .filter(Boolean)
            .join(" | ")
      )
      .join("\n");
    const oneNoteContext = oneNoteSources
      .map((source, index) =>
        [
          `OneNote page ${index + 1}: ${cleanString(source.title) || "Untitled page"}`,
          `Notebook: ${cleanString(source.notebookName) || "unknown"} | Section: ${cleanString(source.sectionName) || "unknown"}`,
          cleanString(source.webUrl) ? `Original page: ${cleanString(source.webUrl)}` : "",
          cleanString(source.text)
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n---\n\n");
    const textbookQuery = [
      cleanString(body.title),
      cleanString(body.courseName),
      cleanString(body.notes),
      audioTranscripts.join("\n\n")
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);

    if (cleanString(body.courseId) && textbookQuery) {
      const supabase = supabaseServerClient();

      if (supabase) {
        const embeddingResponse = await client.embeddings.create({
          input: textbookQuery,
          model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
        });
        totalUsage = addUsage(totalUsage, usageFromEmbedding(embeddingResponse.usage));

        const { data } = await supabase.rpc("match_textbook_chunks", {
          match_count: MAX_TEXTBOOK_CONTEXT,
          match_course_id: cleanString(body.courseId),
          query_embedding: embeddingResponse.data[0]?.embedding || []
        });

        if (Array.isArray(data) && data.length) {
          textbookContext = (data as MatchTextbookChunk[]).map((chunk) => ({
            id: cleanString(chunk.id),
            pageEnd: typeof chunk.page_end === "number" ? chunk.page_end : undefined,
            pageStart:
              typeof chunk.page_start === "number" ? chunk.page_start : undefined,
            text: cleanString(chunk.content),
            textbookId: cleanString(chunk.textbook_id),
            textbookName: cleanString(chunk.textbook_name)
          }));
        }
      }
    }
    const textbookPageRequests = textbookContext.map((chunk) => ({
      pageEnd: chunk.pageEnd,
      pageStart: chunk.pageStart,
      textbookId: chunk.textbookId,
      textbookName: chunk.textbookName
    }));
    const canonicalTextbookEvidence = await canonicalTextbookPageEvidence({
      courseId: cleanString(body.courseId),
      requests: textbookPageRequests
    });
    const canonicalTextbookKeys = new Set(
      canonicalTextbookEvidence.evidence.map(
        (page) => `${page.textbookId}:${page.pageNumber}`
      )
    );
    const unmatchedTextbookContext = textbookContext.filter((chunk) => {
      const pageStart = Math.max(1, Math.floor(Number(chunk.pageStart) || 0));
      const pageEnd = Math.max(pageStart, Math.floor(Number(chunk.pageEnd) || pageStart));

      for (let page = pageStart; page <= pageEnd; page += 1) {
        if (!canonicalTextbookKeys.has(`${cleanString(chunk.textbookId)}:${page}`)) {
          return true;
        }
      }

      return false;
    });
    const legacyTextbookContextText = unmatchedTextbookContext
      .map((chunk, index) => {
        const pageStart = Number.isFinite(chunk.pageStart) ? chunk.pageStart : undefined;
        const pageEnd = Number.isFinite(chunk.pageEnd) ? chunk.pageEnd : pageStart;
        const pageLabel =
          pageStart && pageEnd && pageEnd !== pageStart
            ? `pp. ${pageStart}-${pageEnd}`
            : pageStart
              ? `p. ${pageStart}`
              : "page unknown";

        return [
          `Textbook excerpt ${index + 1}: ${cleanString(chunk.textbookName) || "Course textbook"} (${pageLabel})`,
          `Use this exact citation when this excerpt directly supports a nearby explanation: Textbook reference: ${cleanString(chunk.textbookName) || "Course textbook"}, ${pageLabel}.`,
          cleanString(chunk.text)
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n---\n\n");
    const textbookContextText = [
      canonicalTextbookEvidenceText(canonicalTextbookEvidence.evidence),
      legacyTextbookContextText
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const textbookVisualPages = await textbookPageEvidence({
      requests: canonicalTextbookEvidence.pageRequestsNeedingSource,
      sources: textbookSources
    });
    const textbookVisualPageManifest = textbookVisualPages
      .map(
        (page) =>
          `Visual textbook page: ${page.textbookName}, p. ${page.pageNumber}. This is the original PDF page for the retrieved excerpt; inspect its equations, diagrams, units, and layout before relying on or citing it.`
      )
      .join("\n");
    const content: ResponseInputMessageContentList = [
      {
        type: "input_text",
        text: [
          `Lecture title: ${cleanString(body.title) || "Untitled lecture"}`,
          `Course: ${cleanString(body.courseName) || "Unfiled"}`,
          `Date: ${cleanString(body.date) || "No date"}`,
          cleanString(body.courseStudyProfile)
            ? `Saved course study profile:\n${cleanString(body.courseStudyProfile)}`
            : "",
          cleanString(body.notes)
            ? `User notes/context:\n${cleanString(body.notes)}`
            : "",
          oneNoteContext ? `Selected OneNote page snapshots:\n${oneNoteContext}` : "",
          mediaManifest ? `Source media manifest:\n${mediaManifest}` : "",
          figureCatalog
            ? `Figure catalog. Use these exact labels only when the nearby reconstruction text relies on the visual:\n${figureCatalog}`
            : "No source figures were attached.",
          textbookContextText
            ? `Relevant course textbook excerpts:\n${textbookContextText}`
            : "No course textbook excerpts were selected for this lecture.",
          textbookVisualPageManifest
            ? `Original textbook pages attached only because they need visual verification:\n${textbookVisualPageManifest}`
            : "No original textbook pages require repeated visual verification.",
          TEXTBOOK_REFERENCE_POLICY,
          audioTranscripts.length
            ? `Audio transcription text:\n${audioTranscripts.join("\n\n---\n\n")}`
            : "No audio transcription text was available. Use the notes and visible images.",
          timedAudioSegments.length
            ? "Timestamped audio cues are source evidence. Return an audio clip only when one of those exact cue ranges directly supports a nearby reconstruction claim."
            : "No audio transcription or timestamped audio cue is available. Do not return audio clips and do not write elapsed timestamps such as M:SS anywhere in the reconstruction. Organize visual or document-only material with headings rather than a timeline.",
          documentInputs.length
            ? `${documentInputs.length} source PDF${documentInputs.length === 1 ? "" : "s"} is attached as visual study material. Inspect handwriting, formulas, diagrams, and page layout directly.`
            : "No source PDF was attached.",
          LECTURE_AI_OUTPUT_CONTRACT
        ]
          .filter(Boolean)
          .join("\n\n")
      },
      ...imageInputs.map(({ dataUrl }) => ({
        type: "input_image" as const,
        image_url: dataUrl,
        detail: "auto" as const
      })),
      ...documentInputs.map(({ dataUrl, item }) => ({
        type: "input_file" as const,
        detail: "high" as const,
        file_data: dataUrl,
        filename: cleanString(item.name) || "onenote-page.pdf"
      })),
      ...textbookVisualPages.map((page) => ({
        type: "input_file" as const,
        detail: "high" as const,
        file_data: page.dataUrl,
        filename: page.filename
      }))
    ];
    const response = await client.responses.create({
      input: [{ role: "user", content }],
      instructions: LECTURE_AI_INSTRUCTIONS,
      model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL
    });
    totalUsage = addUsage(totalUsage, usageFromOpenAI(response.usage));

    let artifact: {
      reconstructionTitle?: string;
      summary?: string;
      transcriptText?: string;
      concepts?: Array<{ title?: string; detail?: string; sourceMediaId?: string }>;
      evidence?: ReconstructionEvidence;
    };

    try {
      artifact = extractJson(response.output_text);
    } catch {
      artifact = fallbackArtifact(
        response.output_text || audioTranscripts.join("\n\n"),
        mediaItems,
        cleanString(body.title)
      );
    }

    const artifactTranscriptText =
      cleanString(artifact.transcriptText) || audioTranscripts.join("\n\n");
    const transcriptText = timedAudioSegments.length
      ? artifactTranscriptText
      : stripNonAudioTimestampPrefixes(artifactTranscriptText);

    return Response.json({
      concepts: Array.isArray(artifact.concepts) ? artifact.concepts : [],
      evidence: normalizeEvidence(artifact.evidence, mediaItems, timedAudioSegments, textbookContext),
      generatedBy: "openai",
      reconstructionTitle: cleanString(artifact.reconstructionTitle).slice(0, 120),
      sourceMediaIds: mediaItems.map((item) => cleanString(item.id)).filter(Boolean),
      summary: cleanString(artifact.summary),
      timedAudioSegments,
      transcribedMediaIds,
      transcriptText,
      usage: totalUsage
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not build lecture reconstruction.";
    return jsonError(message, 500);
  }
}
