import OpenAI from "openai";
import { completedReviewText, reviewInstructions, completeReviewPlan, withLessonSources } from "../../../lib/exam-review-context";
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
Source ID: ${lectureId}
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
    if (lectures.some(lecture => !transcripts.some(transcript => transcript.lectureId === cleanString(lecture.id) && transcript.text))) {
      return jsonError("Every selected reconstruction needs saved study text before it can receive a complete review lesson.", 400);
    }
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
    const instructions = reviewInstructions(examName, courseName, cleanString(body.instructions));

    if (!process.env.OPENAI_API_KEY) {
      return jsonError("AI review generation is unavailable. No incomplete fallback review was saved.", 503);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageInputs = figures
      .filter((figure) => {
        const reference = cleanString(figure.dataUrl);
        return /^data:image\//.test(reference) || /^https:\/\//.test(reference);
      });
    if (imageInputs.length > MAX_IMAGE_INPUTS) {
      return jsonError(`This review has more than ${MAX_IMAGE_INPUTS} available figures. Narrow its scope so no image is silently omitted.`, 400);
    }
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
    const model = process.env.OPENAI_EXAM_REVIEW_MODEL || DEFAULT_MODEL;
    const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    const addUsage = (value: { input_tokens: number; output_tokens: number; total_tokens: number } | null | undefined) => {
      if (!value) return;
      usage.input_tokens += value.input_tokens;
      usage.output_tokens += value.output_tokens;
      usage.total_tokens += value.total_tokens;
    };
    const sourceContext = [
      `Exam: ${examName}\nCourse: ${courseName}`,
      `Instructor and user priorities:\n${instructions}`,
      courseStudyProfile ? `Course study profile:\n${courseStudyProfile}` : "",
      canonicalTextbookEvidenceText(canonicalTextbookEvidence.evidence)
    ].filter(Boolean).join("\n\n");
    const planResponse = await client.responses.create({
      model,
      max_output_tokens: 8000,
      text: { format: { type: "json_object" } },
      instructions: [
        "Plan a concise but thoroughly taught exam review, using only the selected reconstructions.",
        "Return JSON with topics: [{title, lectureIds}], and missingInstructorEvidence: [string].",
        "Inventory EVERY substantive topic, subtopic, theorem, distribution, and distinct problem method in EVERY reconstruction and its extracted concepts.",
        "Group duplicates across lectures, but do not let instructor priorities erase other selected material. Order prerequisites before dependent topics.",
        "Each topic needs its own teaching and fully worked example. Use exact Source IDs as lectureIds. Every selected Source ID must appear in at least one topic.",
        "Compare the instructor outline to available evidence. In missingInstructorEvidence identify any named exercise or priority without a usable statement or supporting evidence. Never infer a problem statement from its number.",
        "Do not generate the lessons yet."
      ].join(" "),
      input: [{
        role: "user",
        content: `Return the coverage plan as JSON with topics and missingInstructorEvidence.\n\n${sourceContext}\n\n${buildLectureBundle({ lectures, transcripts, concepts, figures })}`
      }]
    });
    addUsage(planResponse.usage);
    const planned = JSON.parse(completedReviewText(planResponse)) as {
      topics?: unknown;
      missingInstructorEvidence?: unknown;
    };
    const topics = completeReviewPlan(planned, lectures);
    const lessons: string[] = new Array(topics.length);
    let nextTopic = 0;
    await Promise.all(Array.from({ length: Math.min(3, topics.length) }, async () => {
      while (nextTopic < topics.length) {
        const index = nextTopic++;
        const topic = topics[index];
        const ids = new Set(topic.lectureIds);
        const topicLectures = lectures.filter(lecture => ids.has(cleanString(lecture.id)));
        const topicFigures = figures.filter(figure => ids.has(figure.lectureId));
        const visibleFigures = topicFigures.filter(figure => imageInputs.some(image => image.label === figure.label));
        const content: ResponseInputMessageContentList = [{
          type: "input_text",
          text: [
            sourceContext,
            `Write topic ${index + 1}: ${topic.title}.`,
            `Full packet plan:\n${topics.map((item, i) => `${i + 1}. ${item.title}`).join("\n")}`,
            textbookPageManifest,
            buildLectureBundle({
              lectures: topicLectures,
              transcripts: transcripts.filter(item => ids.has(item.lectureId)),
              concepts: concepts.filter(item => ids.has(cleanString(item.lectureId))),
              figures: topicFigures
            })
          ].filter(Boolean).join("\n\n")
        }];
        for (const figure of visibleFigures) {
          content.push({ type: "input_text", text: `Review-wide image label: ${figure.label}. Source: ${figure.lectureTitle}. File: ${figure.name}. Caption: ${figure.sourceCaption || "No caption saved."}` });
          content.push({ type: "input_image", image_url: figure.dataUrl!, detail: "auto" });
        }
        for (const page of textbookVisualPages) {
          content.push({ type: "input_file", file_data: page.dataUrl, filename: page.filename });
        }
        const response = await client.responses.create({
          model,
          max_output_tokens: 8000,
          instructions: [
            "Teach this one planned topic for an engineering/math exam: concise wording, complete reasoning, not a summary or a list of prompts.",
            "Use only the supplied reconstructions, concepts, instructor guidance, and visible evidence. Do not re-transcribe or invent instructor examples.",
            "Begin with ## Topic N: Title, using the supplied topic number.",
            "Include these exact subsections: ### Meaning and method, ### Formulas and assumptions, ### Worked walkthrough, ### Common mistakes, ### Practice with solution.",
            "Explain every subtopic and distinct method belonging to this topic, when to choose each method, notation, assumptions, and why each step works.",
            "For each distinct problem method give a worked walkthrough: usable given values, question, numbered calculation steps with substitutions, intermediate results, final answer, and a sanity check. Prefer saved instructor/assignment problems.",
            "If a source example lacks its statement or values, explicitly flag that gap. A clearly labeled illustrative practice variant may use chosen values, but its method must be supported by the sources; never present it as the instructor's problem.",
            "Practice with solution must include a fresh supported-method question AND its explained solution, not merely a checklist.",
            "Cite each explanation and walkthrough compactly using [Lecture: exact title, date] and, only when supported, [Textbook name, p. N] or actual audio timestamps.",
            "Use supplied review-wide labels such as Fig. 1 in the explanation immediately next to the calculation or concept the image supports. Explain what to inspect in that figure. Never create a separate figure gallery or cite all figures indiscriminately.",
            "Local figure numbering inside old reconstruction text may collide. Match the actual attached image/file/caption and cite only its supplied review-wide label. Do not substitute textbook figure numbers for review-wide labels.",
            "If a figure is unavailable as pixels, label its evidence as metadata-only and do not claim to inspect it.",
            "Do not refer to irrelevant figures just to include them. Keep equations as complete LaTeX \\(...\\) or \\[...\\] blocks.",
            "Avoid Markdown tables: use concise lists. Avoid repetitive introductions and retain concrete calculations.",
            "Do not claim to assess the student's mastery or that unconfirmed material will be on the exam."
          ].join(" "),
          input: [{ role: "user", content }]
        });
        addUsage(response.usage);
        const lesson = completedReviewText(response);
        for (const heading of ["Meaning and method", "Formulas and assumptions", "Worked walkthrough", "Common mistakes", "Practice with solution"]) {
          if (!lesson.includes(`### ${heading}`)) throw new Error(`Review topic "${topic.title}" is missing ${heading}. No partial review was saved.`);
        }
        // Source attribution comes from validated source IDs, not a brittle
        // substring check against the model's choice of citation formatting.
        lessons[index] = withLessonSources(lesson, topicLectures);
      }
    }));
    const gaps = Array.isArray(planned.missingInstructorEvidence)
      ? planned.missingInstructorEvidence.filter((item): item is string => typeof item === "string")
      : [];
    const text = [
      `# ${examName} Exam Review`,
      `Course: ${courseName}`,
      "## Exam Blueprint",
      instructions,
      ...topics.map((topic, index) => `- Topic ${index + 1}: ${topic.title}. Sources: ${topic.lectureIds.map(id => cleanString(lectures.find(lecture => lecture.id === id)?.title)).join("; ")}.`),
      ...(gaps.length ? ["## Source gaps to verify", ...gaps.map(gap => `- ${gap}`)] : []),
      ...lessons,
      "## Source Map",
      ...lectures.map(lecture => `- ${cleanString(lecture.title)} (${cleanString(lecture.date)}): ${figures.filter(figure => figure.lectureId === lecture.id).map(figure => figure.label).join(", ") || "No board figures"}.`)
    ].join("\n\n");
    return Response.json({ text, figures, usage, instructions, generatedBy: "openai" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate exam review.";
    return jsonError(message, 500);
  }
}
