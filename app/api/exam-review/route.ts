import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";
import { requireAuthenticatedRequest } from "../../../lib/auth";
import {
  storageObjectToDataUrl,
  storageObjectToSignedUrl
} from "../../../lib/supabase-server";
import {
  textbookPageEvidence,
  type TextbookPageRequest,
  type TextbookPageSource
} from "../../../lib/textbook-page-evidence";
import {
  canonicalTextbookEvidenceText,
  canonicalTextbookPageEvidence
} from "../../../lib/textbook-canonical-evidence";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_LECTURES = 25;
const MAX_IMAGE_INPUTS = 100;

type ExamReviewLecture = {
  id?: string;
  title?: string;
  date?: string;
  summary?: string;
  examSectionIds?: string[];
};

type ExamReviewTranscript = {
  lectureId?: string;
  text?: string;
  segments?: Array<{
    id?: string;
    mediaItemId?: string;
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
  mimeType?: string;
  name?: string;
  dataUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  sourceRole?: string;
  sourceCaption?: string;
};

type ExamReviewFigure = {
  label: string;
  lectureId: string;
  lectureTitle: string;
  name: string;
  dataUrl?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
  sourceCaption?: string;
};

type ExamReviewTextbookCitation = TextbookPageRequest;
type ExamReviewTextbookSource = TextbookPageSource;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cleanSectionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))];
}

function lectureIsWithinReviewScope(lecture: ExamReviewLecture, sectionIds: string[]) {
  const allocatedIds = cleanSectionIds(lecture.examSectionIds);
  return allocatedIds.some((id) => sectionIds.includes(id));
}

function isTimedAudioSegment(segment: {
  mediaItemId?: string;
  startSeconds?: number;
  endSeconds?: number;
}) {
  return (
    Boolean(cleanString(segment.mediaItemId)) &&
    cleanNumber(segment.endSeconds) > cleanNumber(segment.startSeconds)
  );
}

function stripNonAudioTimestampPrefixes(text: string) {
  return text.replace(
    /(^|\n)\s*(?:\*\*)?\d{1,2}:\d{2}(?:\*\*)?\s*(?:[-–—:]\s*)?/g,
    "$1"
  );
}

function prepareTranscripts(transcripts: ExamReviewTranscript[]) {
  return transcripts.map((transcript) => {
    const segments = Array.isArray(transcript.segments) ? transcript.segments : [];
    const hasTimedAudio = segments.some(isTimedAudioSegment);
    const text = cleanString(transcript.text);

    return {
      lectureId: cleanString(transcript.lectureId),
      // Keep every selected reconstruction intact. The review must never silently omit
      // later lecture material because an internal character budget was exhausted.
      text: hasTimedAudio ? text : stripNonAudioTimestampPrefixes(text),
      segments
    };
  });
}

async function dataUrlForMedia(item: ExamReviewMediaItem) {
  const inline = cleanString(item.dataUrl);

  if (inline) {
    return inline;
  }

  return (
    (await storageObjectToDataUrl({
      bucket: cleanString(item.storageBucket),
      mimeType: cleanString(item.mimeType),
      path: cleanString(item.storagePath)
    })) || undefined
  );
}

async function visualReferenceForMedia(item: ExamReviewMediaItem) {
  const inline = cleanString(item.dataUrl);

  if (inline) {
    return inline;
  }

  return (
    (await storageObjectToSignedUrl({
      bucket: cleanString(item.storageBucket),
      path: cleanString(item.storagePath)
    })) || undefined
  );
}

async function buildFigures(
  lectures: ExamReviewLecture[],
  mediaItems: ExamReviewMediaItem[]
) {
  let index = 0;
  const figures: ExamReviewFigure[] = [];

  for (const item of mediaItems.filter((entry) => entry.kind === "image")) {
    const lecture = lectures.find((entry) => entry.id === item.lectureId);
    index += 1;
    figures.push({
      label: `Fig. ${index}`,
      lectureId: cleanString(item.lectureId),
      lectureTitle: cleanString(lecture?.title) || "Untitled lecture",
      name: cleanString(item.name) || `Board image ${index}`,
      sourceCaption: cleanString(item.sourceCaption) || undefined,
      dataUrl: await visualReferenceForMedia(item),
      mimeType: cleanString(item.mimeType) || undefined,
      storageBucket: cleanString(item.storageBucket) || undefined,
      storagePath: cleanString(item.storagePath) || undefined
    });
  }

  return figures;
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
  transcripts: ReturnType<typeof prepareTranscripts>;
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
      const timedAudioSegments = (transcript?.segments || []).filter(isTimedAudioSegment);

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
        .map(
          (figure) =>
            `- ${figure.label}: ${figure.name}${
              cleanString(figure.sourceCaption)
                ? ` - ${cleanString(figure.sourceCaption)}`
                : ""
            }`
        )
        .join("\n")
    : "- No board images saved."
}

Source audio transcript:
${
  timedAudioSegments.length
    ? timedAudioSegments
        .slice(0, 80)
        .map(
          (segment) =>
            `- Audio ${formatSeconds(segment.startSeconds)}-${formatSeconds(
              segment.endSeconds
            )}: ${cleanString(segment.text)}`
        )
        .join("\n")
    : "- No timestamped source audio transcript saved."
}

Reconstruction artifact:
${cleanString(transcript?.text) || "No reconstruction text saved."}`;
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
  transcripts: ReturnType<typeof prepareTranscripts>;
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
  const authError = requireAuthenticatedRequest(request);

  if (authError) {
    return authError;
  }

  try {
    const body = (await request.json()) as {
      courseId?: string;
      examName?: string;
      courseName?: string;
      courseStudyProfile?: string;
      instructions?: string;
      reviewSectionIds?: string[];
      lectures?: ExamReviewLecture[];
      transcripts?: ExamReviewTranscript[];
      concepts?: ExamReviewConcept[];
      mediaItems?: ExamReviewMediaItem[];
      textbookCitations?: ExamReviewTextbookCitation[];
      textbookSources?: ExamReviewTextbookSource[];
    };
    const reviewSectionIds = cleanSectionIds(body.reviewSectionIds);
    if (!reviewSectionIds.length) {
      return jsonError("Choose at least one course exam section before generating a review.", 400);
    }

    const lectures = (Array.isArray(body.lectures) ? body.lectures : []).filter((lecture) =>
      lectureIsWithinReviewScope(lecture, reviewSectionIds)
    );

    if (!lectures.length) {
      return jsonError("Select at least one archive lecture for this exam.", 400);
    }

    if (lectures.length > MAX_LECTURES) {
      return jsonError(`Select ${MAX_LECTURES} or fewer lectures at a time.`, 400);
    }

    const selectedLectureIds = new Set(lectures.map((lecture) => cleanString(lecture.id)));
    const transcripts = prepareTranscripts(
      (Array.isArray(body.transcripts) ? body.transcripts : []).filter((transcript) =>
        selectedLectureIds.has(cleanString(transcript.lectureId))
      )
    );
    const concepts = (Array.isArray(body.concepts) ? body.concepts : []).filter((concept) =>
      selectedLectureIds.has(cleanString(concept.lectureId))
    );
    const mediaItems = (Array.isArray(body.mediaItems) ? body.mediaItems : []).filter((item) =>
      selectedLectureIds.has(cleanString(item.lectureId))
    );
    const textbookCitations = Array.isArray(body.textbookCitations)
      ? body.textbookCitations
      : [];
    const textbookSources = Array.isArray(body.textbookSources) ? body.textbookSources : [];
    const figures = await buildFigures(lectures, mediaItems);
    const examName = cleanString(body.examName) || "Exam";
    const courseName = cleanString(body.courseName);
    const courseStudyProfile = cleanString(body.courseStudyProfile);
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
      .filter((figure) => {
        const reference = cleanString(figure.dataUrl);
        return /^data:image\//.test(reference) || /^https:\/\//.test(reference);
      })
      .slice(0, MAX_IMAGE_INPUTS);
    const canonicalTextbookEvidence = await canonicalTextbookPageEvidence({
      courseId: cleanString(body.courseId),
      requests: textbookCitations
    });
    const textbookVisualPages = await textbookPageEvidence({
      requests: canonicalTextbookEvidence.pageRequestsNeedingSource,
      sources: textbookSources
    });
    const textbookPageManifest = textbookVisualPages
      .map(
        (page) =>
          `- ${page.textbookName}, p. ${page.pageNumber}: original textbook page attached for visual verification.`
      )
      .join("\n");
    const content: ResponseInputMessageContentList = [
      {
        type: "input_text",
        text: [
          instructions ? `User exam instructions:\n${instructions}` : "",
          `Exam: ${examName}`,
          `Course: ${courseName || "Unfiled"}`,
          courseStudyProfile ? `Saved course study profile:\n${courseStudyProfile}` : "",
          canonicalTextbookEvidence.evidence.length
            ? `Canonical textbook evidence already retrieved from the selected reconstructions:\n${canonicalTextbookEvidenceText(canonicalTextbookEvidence.evidence)}`
            : "No canonical textbook evidence was available for the selected citations.",
          textbookPageManifest
            ? `Original textbook pages attached only because their initial scan needs visual verification:\n${textbookPageManifest}`
            : "No original textbook page needs repeated visual verification for this review.",
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
      })),
      ...textbookVisualPages.map((page) => ({
        type: "input_file" as const,
        detail: "high" as const,
        file_data: page.dataUrl,
        filename: page.filename
      }))
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_EXAM_REVIEW_MODEL || DEFAULT_MODEL,
      instructions: [
        "You create senior-level engineering and math exam review guides from selected lecture archive materials.",
        "This is a second AI aggregation pass. Do not re-transcribe; use the saved transcripts, concepts, segments, media, and explicit user instructions.",
        "Preserve elapsed timestamps only when the selected source material provides actual timed audio evidence. Do not invent M:SS timestamps for image, PDF, document, or note-only material.",
        "Use only the selected exam workspace materials. Do not invent unsupported formulas, facts, theorems, or examples.",
        "Prioritize instructor evidence in this order when it is supplied: explicit exam/study instructions, assignment or rubric language, syllabus statements, then lecture emphasis inferred from the selected reconstructions. Do not claim a topic will be tested unless the source supports that claim.",
        "Create a layered exam packet: begin with an exam blueprint and concept connections, then concise review notes, formulas, worked problem patterns, common mistakes, and representative practice prompts. This is not a measure of the student's mastery and must not claim to diagnose individual weakness.",
        "Use LaTeX math with \\(...\\) for inline math and complete \\[ equation \\] blocks for display math.",
        "Reference useful images by the provided labels such as Fig. 1 and Fig. 2.",
        "Use canonical textbook evidence only where it materially clarifies selected lecture content. When an original textbook page is attached because its initial scan was uncertain, use that page to recheck equations, diagrams, tables, notation, units, and page references before relying on it. Cite textbook support compactly as [Textbook Name, p. N]; do not invent textbook citations or repeat the same citation excessively.",
        "The Figure-Guided Review section must list every provided figure label, explain what it appears to support if visible, and say when an image is available only as archive metadata.",
        "The Source Map must include figure labels next to the lecture that provided them.",
        "Include these top-level Markdown headings in order: ## Exam Blueprint, ## Concept Connections, ## High-Yield Concepts, ## Formula Sheet, ## Worked Problems and Patterns, ## Figure-Guided Review, ## Common Mistakes, ## Practice Prompts, ## Source Map."
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
