import OpenAI, { toFile } from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import { requireAuthenticatedRequest } from "../../../lib/auth";
import {
  storageObjectToDataUrl,
  supabaseServerClient
} from "../../../lib/supabase-server";

export const runtime = "nodejs";

const DEFAULT_LECTURE_MODEL = "gpt-4.1-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_IMAGE_INPUTS = 30;
const MAX_AUDIO_INPUTS = 3;
const MAX_TEXTBOOK_CONTEXT = 10;

type LectureMediaItem = {
  id?: string;
  kind?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  dataUrl?: string;
  storageBucket?: string;
  storagePath?: string;
};

type TextbookContextChunk = {
  id?: string;
  pageEnd?: number;
  pageStart?: number;
  text?: string;
  textbookId?: string;
  textbookName?: string;
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

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function fallbackArtifact(transcriptText: string, media: LectureMediaItem[]) {
  const sourceLines = media.map(
    (item, index) =>
      `- Source ${index + 1}: ${cleanString(item.name) || "Unnamed media"} (${cleanString(item.kind) || "media"})`
  );

  return {
    summary: transcriptText.slice(0, 600) || "Lecture source media saved.",
    transcriptText: [
      transcriptText || "No transcript text was returned.",
      "",
      "## Source Media Used",
      ...sourceLines
    ].join("\n"),
    concepts: []
  };
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
      notes?: string;
      mediaItems?: LectureMediaItem[];
      textbookContext?: TextbookContextChunk[];
    };
    const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
    let textbookContext = Array.isArray(body.textbookContext)
      ? body.textbookContext.slice(0, 10)
      : [];
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let totalUsage: TokenUsage = {};
    const audioTranscripts: string[] = [];
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

      const file = await toFile(
        parsed.buffer,
        cleanString(item.name) || `lecture-audio.${format}`,
        { type: parsed.mimeType }
      );
      const transcription = await client.audio.transcriptions.create({
        file,
        model:
          process.env.OPENAI_TRANSCRIPTION_MODEL ||
          process.env.OPENAI_LECTURE_TRANSCRIPTION_MODEL ||
          DEFAULT_TRANSCRIPTION_MODEL
      });
      const text = cleanString(transcription.text);

      if (text) {
        audioTranscripts.push(
          `Audio source: ${cleanString(item.name) || item.id || "audio"}\n${text}`
        );
      }

      if (item.id) {
        transcribedMediaIds.push(item.id);
      }

      totalUsage = addUsage(totalUsage, usageFromOpenAI(transcription.usage));
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
    const mediaManifest = mediaItems
      .map(
        (item, index) =>
          `${index + 1}. ${cleanString(item.name) || "Unnamed media"} | ${cleanString(item.kind) || "media"} | ${cleanString(item.mimeType) || "unknown type"} | id: ${cleanString(item.id)}`
      )
      .join("\n");
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
    const textbookContextText = textbookContext
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
          cleanString(chunk.text)
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n---\n\n");
    const content: ResponseInputMessageContentList = [
      {
        type: "input_text",
        text: [
          `Lecture title: ${cleanString(body.title) || "Untitled lecture"}`,
          `Course: ${cleanString(body.courseName) || "Unfiled"}`,
          `Date: ${cleanString(body.date) || "No date"}`,
          cleanString(body.notes)
            ? `User notes/context:\n${cleanString(body.notes)}`
            : "",
          mediaManifest ? `Source media manifest:\n${mediaManifest}` : "",
          textbookContextText
            ? `Relevant course textbook excerpts:\n${textbookContextText}`
            : "No course textbook excerpts were selected for this lecture.",
          audioTranscripts.length
            ? `Audio transcription text:\n${audioTranscripts.join("\n\n---\n\n")}`
            : "No audio transcription text was available. Use the notes and visible images.",
          [
            "Return strict JSON with this shape:",
            "{",
            '  "summary": "exam-focused lecture summary with important formulas in LaTeX",',
            '  "transcriptText": "cleaned transcript/study notes in Markdown; include Source Media Used and Textbook Context Used sections; cite textbook pages when useful; refer to images as Fig. 1, Fig. 2 when useful",',
            '  "concepts": [{"title": "short concept title", "detail": "exam-useful explanation", "sourceMediaId": "optional media id"}]',
            "}",
            "Do not invent facts not supported by the source media, transcript, notes, or textbook excerpts."
          ].join("\n")
        ]
          .filter(Boolean)
          .join("\n\n")
      },
      ...imageInputs.map(({ dataUrl }) => ({
        type: "input_image" as const,
        image_url: dataUrl,
        detail: "auto" as const
      }))
    ];
    const response = await client.responses.create({
      input: [{ role: "user", content }],
      instructions: [
        "You create source-grounded engineering/math lecture study artifacts from lecture audio transcripts, board images, screenshots, PDFs/notes metadata, and user notes.",
        "Course textbook excerpts are supporting context, not a replacement for the lecture. Use them to clarify formulas, definitions, and exam-relevant connections, and cite page numbers when they are used.",
        "Images are first-class study material. Refer to uploaded images as figures in the transcriptText where they support formulas, diagrams, board work, or worked examples.",
        "The output must be useful for exam preparation, not just a summary.",
        "Use LaTeX-compatible math syntax for formulas."
      ].join(" "),
      model: process.env.OPENAI_LECTURE_MODEL || DEFAULT_LECTURE_MODEL
    });
    totalUsage = addUsage(totalUsage, usageFromOpenAI(response.usage));

    let artifact: {
      summary?: string;
      transcriptText?: string;
      concepts?: Array<{ title?: string; detail?: string; sourceMediaId?: string }>;
    };

    try {
      artifact = extractJson(response.output_text);
    } catch {
      artifact = fallbackArtifact(response.output_text || audioTranscripts.join("\n\n"), mediaItems);
    }

    return Response.json({
      concepts: Array.isArray(artifact.concepts) ? artifact.concepts : [],
      generatedBy: "openai",
      sourceMediaIds: mediaItems.map((item) => cleanString(item.id)).filter(Boolean),
      summary: cleanString(artifact.summary),
      transcribedMediaIds,
      transcriptText: cleanString(artifact.transcriptText) || audioTranscripts.join("\n\n"),
      usage: totalUsage
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate lecture study artifact.";
    return jsonError(message, 500);
  }
}
