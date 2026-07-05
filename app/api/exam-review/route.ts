import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_LECTURES = 25;
const MAX_TOTAL_CHARS = 90000;
const MAX_IMAGE_INPUTS = 100;

type ExamReviewLecture = {
  id?: string;
  title?: string;
  date?: string;
  summary?: string;
};

type ExamReviewTranscript = {
  lectureId?: string;
  text?: string;
  segments?: Array<{
    id?: string;
    startSeconds?: number;
    endSeconds?: number;
    text?: string;
  }>;
};

type ExamReviewConcept = {
  lectureId?: string;
  title?: string;
  detail?: string;
  sourceSegmentId?: string;
};

type ExamReviewMediaItem = {
  id?: string;
  lectureId?: string;
  kind?: string;
  name?: string;
  dataUrl?: string;
};

type ExamReviewFigure = {
  label: string;
  lectureId: string;
  lectureTitle: string;
  name: string;
  dataUrl?: string;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function trimTranscripts(transcripts: ExamReviewTranscript[]) {
  let remaining = MAX_TOTAL_CHARS;

  return transcripts.map((transcript) => {
    const text = cleanString(transcript.text);
    const trimmedText = text.slice(0, Math.max(0, remaining));
    remaining -= trimmedText.length;

    return {
      lectureId: cleanString(transcript.lectureId),
      text: trimmedText,
      segments: Array.isArray(transcript.segments) ? transcript.segments : []
    };
  });
}

function buildFigures(
  lectures: ExamReviewLecture[],
  mediaItems: ExamReviewMediaItem[]
) {
  let index = 0;

  return mediaItems
    .filter((item) => item.kind === "image")
    .map((item) => {
      const lecture = lectures.find((entry) => entry.id === item.lectureId);
      index += 1;

      return {
        label: `Fig. ${index}`,
        lectureId: cleanString(item.lectureId),
        lectureTitle: cleanString(lecture?.title) || "Untitled lecture",
        name: cleanString(item.name) || `Board image ${index}`,
        dataUrl: cleanString(item.dataUrl) || undefined
      };
    });
}

function formatSeconds(value: unknown) {
  const seconds = cleanNumber(value);
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function buildLectureBundle({
  lectures,
  transcripts,
  concepts,
  figures
}: {
  lectures: ExamReviewLecture[];
  transcripts: ReturnType<typeof trimTranscripts>;
  concepts: ExamReviewConcept[];
  figures: ExamReviewFigure[];
}) {
  return lectures
    .map((lecture, index) => {
      const lectureId = cleanString(lecture.id);
      const transcript = transcripts.find((item) => item.lectureId === lectureId);
      const lectureConcepts = concepts.filter(
        (concept) => cleanString(concept.lectureId) === lectureId
      );
      const lectureFigures = figures.filter((figure) => figure.lectureId === lectureId);
      const segments = transcript?.segments || [];

      return `Lecture ${index + 1}
Title: ${cleanString(lecture.title) || "Untitled lecture"}
Date: ${cleanString(lecture.date) || "No date"}
Summary: ${cleanString(lecture.summary) || "No summary saved."}

Extracted concepts:
${
  lectureConcepts.length
    ? lectureConcepts
        .map(
          (concept) =>
            `- ${cleanString(concept.title)}: ${cleanString(concept.detail)} ${
              cleanString(concept.sourceSegmentId)
                ? `[${cleanString(concept.sourceSegmentId)}]`
                : ""
            }`
        )
        .join("\n")
    : "- No extracted concepts saved."
}

Board figures:
${
  lectureFigures.length
    ? lectureFigures
        .map((figure) => `- ${figure.label}: ${figure.name}`)
        .join("\n")
    : "- No board images saved."
}

Transcript segments:
${
  segments.length
    ? segments
        .slice(0, 80)
        .map(
          (segment) =>
            `- ${formatSeconds(segment.startSeconds)}-${formatSeconds(
              segment.endSeconds
            )}: ${cleanString(segment.text)}`
        )
        .join("\n")
    : transcript?.text || "No transcript text saved."
}`;
    })
    .join("\n\n---\n\n");
}

function buildLocalFallback({
  examName,
  courseName,
  instructions,
  lectures,
  transcripts,
  concepts,
  figures
}: {
  examName: string;
  courseName: string;
  instructions: string;
  lectures: ExamReviewLecture[];
  transcripts: ReturnType<typeof trimTranscripts>;
  concepts: ExamReviewConcept[];
  figures: ExamReviewFigure[];
}) {
  const lines = [
    `# ${examName} Exam Review`,
    "",
    `Course: ${courseName || "Unfiled"}`,
    instructions ? `Instructions: ${instructions}` : "",
    "",
    "## Study Guide Overview",
    `This review was generated from ${lectures.length} selected archived lecture${lectures.length === 1 ? "" : "s"}.`,
    "",
    "## High-Yield Concepts"
  ].filter(Boolean);

  for (const concept of concepts) {
    const lecture = lectures.find((item) => item.id === concept.lectureId);
    lines.push(
      `- ${cleanString(concept.title)}: ${cleanString(concept.detail)} [${
        cleanString(lecture?.title) || "Lecture"
      }]`
    );
  }

  lines.push("", "## Formula Sheet", "- Review formulas identified in the selected transcript segments and board figures.");
  lines.push("", "## Worked Problems and Patterns");

  for (const lecture of lectures) {
    const transcript = transcripts.find((item) => item.lectureId === lecture.id);
    const firstExample = transcript?.segments.find((segment) =>
      /example|problem|solve|given|find|calculate|compute/i.test(cleanString(segment.text))
    );
    lines.push(
      `- ${cleanString(lecture.title) || "Lecture"}: ${
        cleanString(firstExample?.text) ||
        cleanString(lecture.summary) ||
        "Create one practice problem from this lecture's main concept."
      }`
    );
  }

  lines.push("", "## Figure-Guided Review");
  for (const figure of figures) {
    lines.push(`- ${figure.label}: ${figure.name} from ${figure.lectureTitle}`);
  }

  lines.push("", "## Common Mistakes", "- Recheck signs, units, assumptions, boundary conditions, and notation against the source lectures.");
  lines.push("", "## Practice Checklist");
  for (const lecture of lectures) {
    lines.push(`- Explain and practice the main problem type from ${cleanString(lecture.title) || "this lecture"}.`);
  }

  lines.push("", "## Source Map");
  for (const lecture of lectures) {
    lines.push(`- ${cleanString(lecture.title) || "Untitled lecture"} (${cleanString(lecture.date) || "No date"})`);
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      examName?: string;
      courseName?: string;
      instructions?: string;
      lectures?: ExamReviewLecture[];
      transcripts?: ExamReviewTranscript[];
      concepts?: ExamReviewConcept[];
      mediaItems?: ExamReviewMediaItem[];
    };
    const lectures = Array.isArray(body.lectures) ? body.lectures : [];

    if (!lectures.length) {
      return jsonError("Select at least one archive lecture for this exam.", 400);
    }

    if (lectures.length > MAX_LECTURES) {
      return jsonError(`Select ${MAX_LECTURES} or fewer lectures at a time.`, 400);
    }

    const transcripts = trimTranscripts(
      Array.isArray(body.transcripts) ? body.transcripts : []
    );
    const concepts = Array.isArray(body.concepts) ? body.concepts : [];
    const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
    const figures = buildFigures(lectures, mediaItems);
    const examName = cleanString(body.examName) || "Exam";
    const courseName = cleanString(body.courseName);
    const instructions = cleanString(body.instructions);

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        text: buildLocalFallback({
          examName,
          courseName,
          instructions,
          lectures,
          transcripts,
          concepts,
          figures
        }),
        figures,
        generatedBy: "local-fallback"
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageInputs = figures
      .filter((figure) => cleanString(figure.dataUrl).startsWith("data:image/"))
      .slice(0, MAX_IMAGE_INPUTS);
    const content: ResponseInputMessageContentList = [
      {
        type: "input_text",
        text: [
          instructions ? `User exam instructions:\n${instructions}` : "",
          `Exam: ${examName}`,
          `Course: ${courseName || "Unfiled"}`,
          "Selected archive materials:",
          buildLectureBundle({ lectures, transcripts, concepts, figures })
        ]
          .filter(Boolean)
          .join("\n\n")
      },
      ...imageInputs.map((figure) => ({
        type: "input_image" as const,
        image_url: figure.dataUrl,
        detail: "auto" as const
      }))
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_EXAM_REVIEW_MODEL || DEFAULT_MODEL,
      instructions: [
        "You create senior-level engineering and math exam review guides from selected lecture archive materials.",
        "This is a second AI aggregation pass. Do not re-transcribe; use the saved transcripts, concepts, segments, media, and explicit user instructions.",
        "Use only the selected exam workspace materials. Do not invent unsupported formulas, facts, theorems, or examples.",
        "Prioritize high-yield concepts, formulas, assumptions, worked problem patterns, common mistakes, and practice steps.",
        "Use LaTeX math with \\(...\\) for inline math and complete \\[ equation \\] blocks for display math.",
        "Reference useful images by the provided labels such as Fig. 1 and Fig. 2.",
        "The Figure-Guided Review section must list every provided figure label, explain what it appears to support if visible, and say when an image is available only as archive metadata.",
        "The Source Map must include figure labels next to the lecture that provided them.",
        "Include these top-level Markdown headings in order: ## Study Guide Overview, ## High-Yield Concepts, ## Formula Sheet, ## Worked Problems and Patterns, ## Figure-Guided Review, ## Common Mistakes, ## Practice Checklist, ## Source Map."
      ].join(" "),
      input: [{ role: "user", content }]
    });

    return Response.json({
      text: response.output_text.trim(),
      figures,
      usage: response.usage || null,
      generatedBy: "openai"
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate exam review.";
    return jsonError(message, 500);
  }
}
