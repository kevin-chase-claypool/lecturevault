"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Screen =
  | "dashboard"
  | "courses"
  | "archive"
  | "lecture"
  | "capture"
  | "exams"
  | "exam"
  | "guide";

type Course = {
  id: string;
  code: string;
  name: string;
  term: string;
  createdAt: string;
};

type Lecture = {
  id: string;
  courseId: string;
  title: string;
  date: string;
  summary: string;
  createdAt: string;
};

type MediaItem = {
  id: string;
  lectureId: string;
  kind: "audio" | "video" | "image" | "document";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  createdAt: string;
};

type Transcript = {
  id: string;
  lectureId: string;
  mediaItemId?: string;
  text: string;
  segments: TranscriptSegment[];
  createdAt: string;
};

type TranscriptSegment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

type ExtractedConcept = {
  id: string;
  lectureId: string;
  title: string;
  detail: string;
  sourceSegmentId?: string;
  mediaItemId?: string;
};

type ExamWorkspace = {
  id: string;
  courseId: string;
  name: string;
  startsOn: string;
  createdAt: string;
};

type ExamWorkspaceItem = {
  id: string;
  examWorkspaceId: string;
  lectureId: string;
  addedAt: string;
};

type StudyGuide = {
  id: string;
  examWorkspaceId: string;
  title: string;
  content: string;
  sourceLectureIds: string[];
  figures?: ReviewFigure[];
  instructions?: string;
  generatedBy?: "openai" | "local-fallback";
  createdAt: string;
};

type ReviewFigure = {
  label: string;
  lectureId: string;
  lectureTitle: string;
  name: string;
  dataUrl?: string;
};

type VaultState = {
  courses: Course[];
  lectures: Lecture[];
  mediaItems: MediaItem[];
  transcripts: Transcript[];
  concepts: ExtractedConcept[];
  exams: ExamWorkspace[];
  examItems: ExamWorkspaceItem[];
  studyGuides: StudyGuide[];
};

const STORAGE_KEY = "lecturevault-state-v1";

const emptyState: VaultState = {
  courses: [],
  lectures: [],
  mediaItems: [],
  transcripts: [],
  concepts: [],
  exams: [],
  examItems: [],
  studyGuides: []
};

const sampleState: VaultState = {
  courses: [
    {
      id: "course-calculus",
      code: "MATH 241",
      name: "Calculus III",
      term: "Fall 2026",
      createdAt: new Date().toISOString()
    },
    {
      id: "course-physics",
      code: "PHYS 212",
      name: "Electricity and Magnetism",
      term: "Fall 2026",
      createdAt: new Date().toISOString()
    }
  ],
  lectures: [
    {
      id: "lecture-gradient",
      courseId: "course-calculus",
      title: "Gradient and Directional Derivatives",
      date: "2026-09-08",
      summary:
        "Directional rate of change, gradient vector meaning, level curves, and worked optimization examples.",
      createdAt: new Date().toISOString()
    },
    {
      id: "lecture-gauss",
      courseId: "course-physics",
      title: "Gauss's Law",
      date: "2026-09-10",
      summary:
        "Electric flux, symmetry choices, closed surfaces, and field calculations for spheres and cylinders.",
      createdAt: new Date().toISOString()
    }
  ],
  mediaItems: [
    {
      id: "media-gradient-audio",
      lectureId: "lecture-gradient",
      kind: "audio",
      name: "gradient-lecture.m4a",
      mimeType: "audio/mp4",
      size: 18400000,
      createdAt: new Date().toISOString()
    },
    {
      id: "media-gauss-board",
      lectureId: "lecture-gauss",
      kind: "image",
      name: "gauss-board.jpg",
      mimeType: "image/jpeg",
      size: 940000,
      createdAt: new Date().toISOString()
    }
  ],
  transcripts: [
    {
      id: "transcript-gradient",
      lectureId: "lecture-gradient",
      mediaItemId: "media-gradient-audio",
      text:
        "The directional derivative measures how a function changes as you move from a point in a chosen direction. The gradient points in the direction of steepest increase and is perpendicular to level curves. To compute it, take the dot product of the gradient with a unit direction vector.",
      segments: [
        {
          id: "seg-gradient-1",
          startSeconds: 0,
          endSeconds: 48,
          text:
            "The directional derivative measures how a function changes as you move from a point in a chosen direction."
        },
        {
          id: "seg-gradient-2",
          startSeconds: 49,
          endSeconds: 126,
          text:
            "The gradient points in the direction of steepest increase and is perpendicular to level curves."
        },
        {
          id: "seg-gradient-3",
          startSeconds: 127,
          endSeconds: 170,
          text:
            "To compute it, take the dot product of the gradient with a unit direction vector."
        }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: "transcript-gauss",
      lectureId: "lecture-gauss",
      mediaItemId: "media-gauss-board",
      text:
        "Gauss's law relates electric flux through a closed surface to enclosed charge. Pick Gaussian surfaces that match symmetry. Spherical charge distributions use spheres; line charges use cylinders.",
      segments: [
        {
          id: "seg-gauss-1",
          startSeconds: 0,
          endSeconds: 55,
          text:
            "Gauss's law relates electric flux through a closed surface to enclosed charge."
        },
        {
          id: "seg-gauss-2",
          startSeconds: 56,
          endSeconds: 118,
          text:
            "Pick Gaussian surfaces that match symmetry. Spherical charge distributions use spheres; line charges use cylinders."
        }
      ],
      createdAt: new Date().toISOString()
    }
  ],
  concepts: [
    {
      id: "concept-gradient",
      lectureId: "lecture-gradient",
      title: "Gradient vector",
      detail:
        "Vector of partial derivatives. It points toward steepest increase and supports directional derivative calculations.",
      sourceSegmentId: "seg-gradient-2",
      mediaItemId: "media-gradient-audio"
    },
    {
      id: "concept-gauss",
      lectureId: "lecture-gauss",
      title: "Gaussian surface choice",
      detail:
        "Choose a closed surface that matches the charge symmetry so the flux integral becomes simple.",
      sourceSegmentId: "seg-gauss-2",
      mediaItemId: "media-gauss-board"
    }
  ],
  exams: [
    {
      id: "exam-1",
      courseId: "course-calculus",
      name: "Exam 1",
      startsOn: "2026-09-28",
      createdAt: new Date().toISOString()
    }
  ],
  examItems: [
    {
      id: "exam-item-gradient",
      examWorkspaceId: "exam-1",
      lectureId: "lecture-gradient",
      addedAt: new Date().toISOString()
    }
  ],
  studyGuides: []
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function fileKind(file: File): MediaItem["kind"] {
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function fileKey(file: File) {
  return [file.name, file.size, file.lastModified].join("-");
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function buildReviewFigures(lectures: Lecture[], mediaItems: MediaItem[]) {
  let index = 0;

  return mediaItems
    .filter((item) => item.kind === "image")
    .map((item) => {
      const lecture = lectures.find((entry) => entry.id === item.lectureId);
      index += 1;

      return {
        label: `Fig. ${index}`,
        lectureId: item.lectureId,
        lectureTitle: lecture?.title || "Untitled lecture",
        name: item.name || `Board image ${index}`,
        dataUrl: item.dataUrl
      };
    });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function splitTranscript(text: string): TranscriptSegment[] {
  const sentences =
    text
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((item) => item.trim())
      .filter(Boolean) || [];

  return (sentences.length ? sentences : ["No transcript text yet."]).map(
    (sentence, index) => ({
      id: uid("seg"),
      startSeconds: index * 45,
      endSeconds: index * 45 + 44,
      text: sentence
    })
  );
}

function extractConcepts(lectureId: string, transcript: Transcript) {
  const important = transcript.segments
    .filter((segment) =>
      /law|definition|theorem|formula|gradient|derivative|surface|charge|matrix|vector|proof|example|important|means|because/i.test(
        segment.text
      )
    )
    .slice(0, 6);

  return (important.length ? important : transcript.segments.slice(0, 4)).map(
    (segment, index) => {
      const title =
        segment.text
          .replace(/^(the|a|an)\s+/i, "")
          .split(/\s+/)
          .slice(0, 5)
          .join(" ")
          .replace(/[.,!?;:]$/, "") || `Concept ${index + 1}`;

      return {
        id: uid("concept"),
        lectureId,
        title,
        detail: segment.text,
        sourceSegmentId: segment.id,
        mediaItemId: transcript.mediaItemId
      };
    }
  );
}

function buildStudyGuide(
  exam: ExamWorkspace,
  lectures: Lecture[],
  transcripts: Transcript[],
  concepts: ExtractedConcept[],
  courseName: string
) {
  const lines = [
    `# ${exam.name} Study Guide`,
    "",
    `Course: ${courseName}`,
    `Materials: ${lectures.length} lecture${lectures.length === 1 ? "" : "s"}`,
    "",
    "## High-Yield Concepts"
  ];

  const selectedConcepts = concepts.filter((concept) =>
    lectures.some((lecture) => lecture.id === concept.lectureId)
  );

  if (selectedConcepts.length) {
    for (const concept of selectedConcepts) {
      const lecture = lectures.find((item) => item.id === concept.lectureId);
      lines.push(
        `- ${concept.title}: ${concept.detail} [${lecture?.title || "Lecture"} -> ${concept.sourceSegmentId || "media"}]`
      );
    }
  } else {
    lines.push("- No extracted concepts yet. Add transcript text to generate review points.");
  }

  lines.push("", "## Lecture Review");
  for (const lecture of lectures) {
    const transcript = transcripts.find((item) => item.lectureId === lecture.id);
    lines.push("", `### ${lecture.title}`, lecture.summary || "No summary yet.");

    for (const segment of transcript?.segments.slice(0, 4) || []) {
      lines.push(
        `- ${formatSeconds(segment.startSeconds)}-${formatSeconds(
          segment.endSeconds
        )}: ${segment.text}`
      );
    }
  }

  lines.push("", "## Practice Prompts");
  for (const lecture of lectures) {
    lines.push(`- Explain the main idea from "${lecture.title}" without notes.`);
    lines.push(`- Make one problem that uses a concept from "${lecture.title}".`);
  }

  lines.push("", "## Source Map");
  for (const lecture of lectures) {
    const transcript = transcripts.find((item) => item.lectureId === lecture.id);
    const first = transcript?.segments[0];
    lines.push(
      `- ${lecture.title}: transcript ${first ? formatSeconds(first.startSeconds) : "0:00"} and attached media remain in the permanent archive.`
    );
  }

  return lines.join("\n");
}

function loadState(): VaultState {
  if (typeof window === "undefined") {
    return sampleState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return sampleState;
  }

  try {
    return { ...emptyState, ...JSON.parse(raw) };
  } catch {
    return sampleState;
  }
}

export default function LectureVaultApp() {
  const [state, setState] = useState<VaultState>(sampleState);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedCourseId, setSelectedCourseId] = useState("course-calculus");
  const [selectedLectureId, setSelectedLectureId] = useState("lecture-gradient");
  const [selectedExamId, setSelectedExamId] = useState("exam-1");
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Local archive ready.");
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    term: ""
  });
  const [captureForm, setCaptureForm] = useState({
    courseId: "course-calculus",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    transcript: "",
    summary: ""
  });
  const [captureFiles, setCaptureFiles] = useState<File[]>([]);
  const [examForm, setExamForm] = useState({
    courseId: "course-calculus",
    name: "",
    startsOn: ""
  });
  const [examInstructions, setExamInstructions] = useState(
    "Prioritize high-yield concepts, formulas, worked problem patterns, common mistakes, and a practice checklist."
  );
  const [isReviewGenerating, setIsReviewGenerating] = useState(false);

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const selectedCourse = state.courses.find(
    (course) => course.id === selectedCourseId
  );
  const selectedLecture = state.lectures.find(
    (lecture) => lecture.id === selectedLectureId
  );
  const selectedExam = state.exams.find((exam) => exam.id === selectedExamId);
  const selectedGuide = state.studyGuides.find(
    (guide) => guide.id === selectedGuideId
  );

  const archiveLectures = useMemo(() => {
    const term = query.trim().toLowerCase();
    return state.lectures.filter((lecture) => {
      const course = state.courses.find((item) => item.id === lecture.courseId);
      const transcript = state.transcripts.find(
        (item) => item.lectureId === lecture.id
      );
      return [lecture.title, lecture.summary, lecture.date, course?.name, course?.code, transcript?.text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [query, state]);

  const selectedExamLectures = selectedExam
    ? state.examItems
        .filter((item) => item.examWorkspaceId === selectedExam.id)
        .map((item) =>
          state.lectures.find((lecture) => lecture.id === item.lectureId)
        )
        .filter((lecture): lecture is Lecture => Boolean(lecture))
    : [];
  const selectedExamGuide = selectedExam
    ? state.studyGuides.find(
        (guide) => guide.examWorkspaceId === selectedExam.id
      )
    : undefined;

  function courseLabel(courseId: string) {
    const course = state.courses.find((item) => item.id === courseId);
    return course ? `${course.code} ${course.name}` : "Unfiled";
  }

  function addCourse(event: FormEvent) {
    event.preventDefault();
    if (!courseForm.name.trim()) {
      return;
    }

    const course: Course = {
      id: uid("course"),
      code: courseForm.code.trim() || "COURSE",
      name: courseForm.name.trim(),
      term: courseForm.term.trim() || "Current term",
      createdAt: new Date().toISOString()
    };

    setState((current) => ({
      ...current,
      courses: [course, ...current.courses]
    }));
    setCourseForm({ code: "", name: "", term: "" });
    setSelectedCourseId(course.id);
    setStatus(`Created ${course.code}.`);
  }

  async function saveCapture(event: FormEvent) {
    event.preventDefault();
    const title = captureForm.title.trim() || "Untitled lecture";
    const lectureId = uid("lecture");
    const createdAt = new Date().toISOString();
    const transcriptText =
      captureForm.transcript.trim() ||
      `Transcript placeholder for ${title}. Add audio transcription or paste notes here.`;
    const mediaItems: MediaItem[] = [];

    for (const file of captureFiles) {
      const shouldInline = file.size <= 8 * 1024 * 1024;
      mediaItems.push({
        id: uid("media"),
        lectureId,
        kind: fileKind(file),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: shouldInline ? await readFileAsDataUrl(file) : undefined,
        createdAt
      });
    }

    const transcript: Transcript = {
      id: uid("transcript"),
      lectureId,
      mediaItemId: mediaItems[0]?.id,
      text: transcriptText,
      segments: splitTranscript(transcriptText),
      createdAt
    };

    const lecture: Lecture = {
      id: lectureId,
      courseId: captureForm.courseId,
      title,
      date: captureForm.date,
      summary:
        captureForm.summary.trim() ||
        transcript.segments
          .slice(0, 2)
          .map((segment) => segment.text)
          .join(" "),
      createdAt
    };

    setState((current) => ({
      ...current,
      lectures: [lecture, ...current.lectures],
      mediaItems: [...mediaItems, ...current.mediaItems],
      transcripts: [transcript, ...current.transcripts],
      concepts: [...extractConcepts(lectureId, transcript), ...current.concepts]
    }));
    setSelectedLectureId(lectureId);
    setCaptureFiles([]);
    setCaptureForm((current) => ({
      ...current,
      title: "",
      transcript: "",
      summary: ""
    }));
    setStatus(`Saved ${title} to the permanent archive.`);
    setScreen("lecture");
  }

  function createExam(event: FormEvent) {
    event.preventDefault();
    if (!examForm.name.trim()) {
      return;
    }

    const exam: ExamWorkspace = {
      id: uid("exam"),
      courseId: examForm.courseId,
      name: examForm.name.trim(),
      startsOn: examForm.startsOn,
      createdAt: new Date().toISOString()
    };

    setState((current) => ({
      ...current,
      exams: [exam, ...current.exams]
    }));
    setSelectedExamId(exam.id);
    setExamForm((current) => ({ ...current, name: "", startsOn: "" }));
    setStatus(`Created ${exam.name}.`);
    setScreen("exam");
  }

  function addLectureToExam(lectureId: string, examId = selectedExamId) {
    const exam = state.exams.find((item) => item.id === examId);
    if (!exam) {
      setStatus("Create an exam workspace first.");
      return;
    }

    const alreadyAdded = state.examItems.some(
      (item) => item.examWorkspaceId === examId && item.lectureId === lectureId
    );

    if (alreadyAdded) {
      setStatus("That lecture is already in this exam workspace.");
      return;
    }

    setState((current) => ({
      ...current,
      examItems: [
        {
          id: uid("exam-item"),
          examWorkspaceId: examId,
          lectureId,
          addedAt: new Date().toISOString()
        },
        ...current.examItems
      ]
    }));
    setStatus("Added lecture reference to exam workspace. Original media stayed in the archive.");
  }

  function removeLectureFromExam(lectureId: string) {
    if (!selectedExam) {
      return;
    }

    setState((current) => ({
      ...current,
      examItems: current.examItems.filter(
        (item) =>
          !(
            item.examWorkspaceId === selectedExam.id &&
            item.lectureId === lectureId
          )
      )
    }));
    setStatus("Removed from exam workspace only. Archive item was not deleted.");
  }

  function deleteExam(examId: string) {
    const exam = state.exams.find((item) => item.id === examId);
    setState((current) => ({
      ...current,
      exams: current.exams.filter((item) => item.id !== examId),
      examItems: current.examItems.filter(
        (item) => item.examWorkspaceId !== examId
      ),
      studyGuides: current.studyGuides.filter(
        (guide) => guide.examWorkspaceId !== examId
      )
    }));
    setSelectedExamId(state.exams.find((item) => item.id !== examId)?.id || "");
    setScreen("exams");
    setStatus(
      `${exam?.name || "Exam"} deleted. Original lecture media and transcripts remain in the archive.`
    );
  }

  async function generateGuide() {
    if (!selectedExam) {
      return;
    }

    if (!selectedExamLectures.length) {
      setStatus("Add archive materials before generating an exam review.");
      return;
    }

    setIsReviewGenerating(true);
    setStatus("Generating AI exam review from selected workspace materials...");

    const sourceLectureIds = selectedExamLectures.map((lecture) => lecture.id);
    const selectedTranscripts = state.transcripts.filter((transcript) =>
      sourceLectureIds.includes(transcript.lectureId)
    );
    const selectedConcepts = state.concepts.filter((concept) =>
      sourceLectureIds.includes(concept.lectureId)
    );
    const selectedMediaItems = state.mediaItems.filter((item) =>
      sourceLectureIds.includes(item.lectureId)
    );

    try {
      const response = await fetch("/api/exam-review", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          examName: selectedExam.name,
          courseName: courseLabel(selectedExam.courseId),
          instructions: examInstructions,
          lectures: selectedExamLectures,
          transcripts: selectedTranscripts,
          concepts: selectedConcepts,
          mediaItems: selectedMediaItems
        })
      });
      const data = (await response.json()) as {
        text?: string;
        figures?: ReviewFigure[];
        generatedBy?: "openai" | "local-fallback";
        error?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Could not generate exam review.");
      }

      const guide: StudyGuide = {
        id: uid("guide"),
        examWorkspaceId: selectedExam.id,
        title: `${selectedExam.name} Exam Review`,
        content: data.text,
        sourceLectureIds,
        figures: data.figures?.length
          ? data.figures
          : buildReviewFigures(selectedExamLectures, selectedMediaItems),
        instructions: examInstructions,
        generatedBy: data.generatedBy || "openai",
        createdAt: new Date().toISOString()
      };

      setState((current) => ({
        ...current,
        studyGuides: [
          guide,
          ...current.studyGuides.filter(
            (item) => item.examWorkspaceId !== selectedExam.id
          )
        ]
      }));
      setSelectedGuideId(guide.id);
      setStatus(
        data.generatedBy === "local-fallback"
          ? "Review generated locally because OPENAI_API_KEY is not configured."
          : "AI exam review generated from selected workspace materials."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not generate exam review.";
      setStatus(message);
    } finally {
      setIsReviewGenerating(false);
    }
  }

  async function downloadExamReviewPdf(guide = selectedExamGuide) {
    if (!selectedExam || !guide) {
      setStatus("Generate an exam review before downloading the PDF.");
      return;
    }

    setIsReviewGenerating(true);
    setStatus("Rendering exam review PDF with KaTeX...");

    try {
      const sourceLectureIds = selectedExamLectures.map((lecture) => lecture.id);
      const selectedMediaItems = state.mediaItems.filter((item) =>
        sourceLectureIds.includes(item.lectureId)
      );
      const currentFigures = buildReviewFigures(
        selectedExamLectures,
        selectedMediaItems
      );
      const figures = currentFigures.length ? currentFigures : guide.figures || [];
      const response = await fetch("/api/exam-review/pdf", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: guide.title,
          courseName: courseLabel(selectedExam.courseId),
          review: guide.content,
          figures
        })
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Could not render exam review PDF.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedExam.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "exam-review"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("Exam review PDF downloaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not render exam review PDF.";
      setStatus(message);
    } finally {
      setIsReviewGenerating(false);
    }
  }

  function resetDemo() {
    setState(sampleState);
    setSelectedCourseId("course-calculus");
    setSelectedLectureId("lecture-gradient");
    setSelectedExamId("exam-1");
    setSelectedGuideId("");
    setStatus("Demo data restored.");
  }

  function addCaptureFiles(files: File[]) {
    if (!files.length) {
      return;
    }

    setCaptureFiles((current) => {
      const existingKeys = new Set(current.map(fileKey));
      const next = [...current];

      for (const file of files) {
        const key = fileKey(file);

        if (!existingKeys.has(key)) {
          next.push(file);
          existingKeys.add(key);
        }
      }

      return next;
    });
    setStatus(
      `${files.length} media file${files.length === 1 ? "" : "s"} queued for this lecture.`
    );
  }

  function removeCaptureFile(key: string) {
    setCaptureFiles((current) =>
      current.filter((file) => fileKey(file) !== key)
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">LV</div>
          <div>
            <h1>LectureVault</h1>
            <p>Transcription-first lecture archive</p>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {[
            ["dashboard", "Dashboard"],
            ["courses", "Courses"],
            ["archive", "Archive"],
            ["capture", "Upload / Record"],
            ["exams", "Exam Workspaces"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={screen === id ? "active" : ""}
              type="button"
              onClick={() => setScreen(id as Screen)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>{state.lectures.length}</strong> archived items
          <span>{state.exams.length} exam workspaces</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{selectedCourse?.term || "Local-first MVP"}</p>
            <h2>{screenTitle(screen)}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button" onClick={() => setScreen("capture")}>
              New Capture
            </button>
            <button type="button" onClick={resetDemo}>
              Reset Demo
            </button>
          </div>
        </header>

        <p className="status" role="status">
          {status}
        </p>

        {screen === "dashboard" ? (
          <Dashboard
            state={state}
            setScreen={setScreen}
            setSelectedLectureId={setSelectedLectureId}
            setSelectedExamId={setSelectedExamId}
            courseLabel={courseLabel}
          />
        ) : null}

        {screen === "courses" ? (
          <section className="content-grid">
            <form className="panel form-panel" onSubmit={addCourse}>
              <h3>Add Course</h3>
              <label>
                Code
                <input
                  value={courseForm.code}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      code: event.target.value
                    }))
                  }
                  placeholder="BIOL 110"
                />
              </label>
              <label>
                Name
                <input
                  value={courseForm.name}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Cell Biology"
                />
              </label>
              <label>
                Term
                <input
                  value={courseForm.term}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      term: event.target.value
                    }))
                  }
                  placeholder="Fall 2026"
                />
              </label>
              <button className="primary" type="submit">
                Save Course
              </button>
            </form>

            <section className="panel list-panel">
              <h3>Course List</h3>
              {state.courses.map((course) => (
                <button
                  className="row-button"
                  key={course.id}
                  type="button"
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setScreen("archive");
                  }}
                >
                  <strong>{course.code}</strong>
                  <span>{course.name}</span>
                  <small>
                    {course.term} -{" "}
                    {
                      state.lectures.filter(
                        (lecture) => lecture.courseId === course.id
                      ).length
                    }{" "}
                    items
                  </small>
                </button>
              ))}
            </section>
          </section>
        ) : null}

        {screen === "archive" ? (
          <section className="archive-layout">
            <div className="toolbar">
              <label>
                Search lecture/media archive
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Title, course, formula, keyword, transcript..."
                />
              </label>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                {state.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lecture-grid">
              {archiveLectures.map((lecture) => (
                <LectureCard
                  key={lecture.id}
                  lecture={lecture}
                  courseLabel={courseLabel}
                  mediaCount={
                    state.mediaItems.filter(
                      (item) => item.lectureId === lecture.id
                    ).length
                  }
                  conceptCount={
                    state.concepts.filter(
                      (concept) => concept.lectureId === lecture.id
                    ).length
                  }
                  onOpen={() => {
                    setSelectedLectureId(lecture.id);
                    setScreen("lecture");
                  }}
                  onAdd={() => addLectureToExam(lecture.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {screen === "lecture" && selectedLecture ? (
          <LectureDetail
            lecture={selectedLecture}
            courseLabel={courseLabel}
            mediaItems={state.mediaItems.filter(
              (item) => item.lectureId === selectedLecture.id
            )}
            transcript={state.transcripts.find(
              (item) => item.lectureId === selectedLecture.id
            )}
            concepts={state.concepts.filter(
              (concept) => concept.lectureId === selectedLecture.id
            )}
            exams={state.exams}
            onAddToExam={addLectureToExam}
          />
        ) : null}

        {screen === "capture" ? (
          <form className="capture panel" onSubmit={saveCapture}>
            <div className="form-grid">
              <label>
                Course
                <select
                  value={captureForm.courseId}
                  onChange={(event) =>
                    setCaptureForm((current) => ({
                      ...current,
                      courseId: event.target.value
                    }))
                  }
                >
                  {state.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lecture title
                <input
                  value={captureForm.title}
                  onChange={(event) =>
                    setCaptureForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="Photosynthesis overview"
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={captureForm.date}
                  onChange={(event) =>
                    setCaptureForm((current) => ({
                      ...current,
                      date: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            <label
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addCaptureFiles(Array.from(event.dataTransfer.files || []));
              }}
            >
              <span>Audio, video, whiteboard images, or related media</span>
              <input
                type="file"
                multiple
                accept="audio/*,video/*,image/*,.pdf,.txt"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  addCaptureFiles(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
              />
              <strong>
                {captureFiles.length
                  ? `${captureFiles.length} media file${captureFiles.length === 1 ? "" : "s"} attached`
                  : "Choose files"}
              </strong>
              <small>
                Add audio, video, board photos, PDFs, or notes in multiple
                passes before saving one lecture.
              </small>
            </label>

            {captureFiles.length ? (
              <div className="capture-media-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">Aggregation Sources</span>
                    <h3>Attached Media</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCaptureFiles([])}
                  >
                    Clear All
                  </button>
                </div>
                <div className="capture-media-list">
                  {captureFiles.map((file) => {
                    const key = fileKey(file);
                    const kind = fileKind(file);

                    return (
                      <div className="capture-media-item" key={key}>
                        <span className="media-kind">{kind}</span>
                        <div>
                          <strong>{file.name}</strong>
                          <small>
                            {formatFileSize(file.size)} -{" "}
                            {file.type || "unknown type"}
                          </small>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCaptureFile(key)}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <label>
              Transcript or rough notes
              <textarea
                value={captureForm.transcript}
                onChange={(event) =>
                  setCaptureForm((current) => ({
                    ...current,
                    transcript: event.target.value
                  }))
                }
                rows={9}
                placeholder="Paste transcript text, record notes, or leave blank for a placeholder. The MVP stores locally and derives source timestamp segments from this text."
              />
            </label>

            <label>
              AI summary / board context
              <textarea
                value={captureForm.summary}
                onChange={(event) =>
                  setCaptureForm((current) => ({
                    ...current,
                    summary: event.target.value
                  }))
                }
                rows={4}
                placeholder="Definitions, board diagrams, formulas, instructor emphasis..."
              />
            </label>

            <div className="button-row">
              <button className="primary" type="submit">
                Save to Archive
              </button>
              <button
                type="button"
                onClick={() =>
                  setCaptureForm((current) => ({
                    ...current,
                    transcript:
                      current.transcript ||
                      "Today we introduced the main definition, worked through an example, and identified common exam mistakes. The key formula should be memorized and practiced with two problem types."
                  }))
                }
              >
                Draft Transcript
              </button>
            </div>
          </form>
        ) : null}

        {screen === "exams" ? (
          <section className="content-grid">
            <form className="panel form-panel" onSubmit={createExam}>
              <h3>Create Exam Workspace</h3>
              <label>
                Course
                <select
                  value={examForm.courseId}
                  onChange={(event) =>
                    setExamForm((current) => ({
                      ...current,
                      courseId: event.target.value
                    }))
                  }
                >
                  {state.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Workspace name
                <input
                  value={examForm.name}
                  onChange={(event) =>
                    setExamForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Exam 2, Final, Quiz 1"
                />
              </label>
              <label>
                Exam date
                <input
                  type="date"
                  value={examForm.startsOn}
                  onChange={(event) =>
                    setExamForm((current) => ({
                      ...current,
                      startsOn: event.target.value
                    }))
                  }
                />
              </label>
              <button className="primary" type="submit">
                Create Workspace
              </button>
            </form>

            <section className="panel list-panel">
              <h3>Exam Workspace List</h3>
              {state.exams.map((exam) => (
                <button
                  className="row-button"
                  key={exam.id}
                  type="button"
                  onClick={() => {
                    setSelectedExamId(exam.id);
                    setScreen("exam");
                  }}
                >
                  <strong>{exam.name}</strong>
                  <span>{courseLabel(exam.courseId)}</span>
                  <small>
                    {
                      state.examItems.filter(
                        (item) => item.examWorkspaceId === exam.id
                      ).length
                    }{" "}
                    selected archive items
                  </small>
                </button>
              ))}
            </section>
          </section>
        ) : null}

        {screen === "exam" && selectedExam ? (
          <ExamDetail
            exam={selectedExam}
            lectures={selectedExamLectures}
            availableLectures={state.lectures.filter(
              (lecture) => lecture.courseId === selectedExam.courseId
            )}
            courses={state.courses}
            mediaItems={state.mediaItems}
            concepts={state.concepts}
            transcripts={state.transcripts}
            selectedGuide={selectedExamGuide}
            instructions={examInstructions}
            isGenerating={isReviewGenerating}
            courseLabel={courseLabel}
            onInstructionsChange={setExamInstructions}
            onAdd={addLectureToExam}
            onRemove={removeLectureFromExam}
            onGenerate={generateGuide}
            onDownloadPdf={downloadExamReviewPdf}
            onDelete={() => deleteExam(selectedExam.id)}
            onOpenLecture={(lectureId) => {
              setSelectedLectureId(lectureId);
              setScreen("lecture");
            }}
          />
        ) : null}

        {screen === "guide" && selectedGuide ? (
          <StudyGuidePreview
            guide={selectedGuide}
            lectures={state.lectures.filter((lecture) =>
              selectedGuide.sourceLectureIds.includes(lecture.id)
            )}
            onOpenLecture={(lectureId) => {
              setSelectedLectureId(lectureId);
              setScreen("lecture");
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function screenTitle(screen: Screen) {
  const titles: Record<Screen, string> = {
    dashboard: "Dashboard",
    courses: "Course list",
    archive: "Lecture/media archive",
    lecture: "Lecture detail",
    capture: "Upload or record lecture",
    exams: "Exam workspace list",
    exam: "Exam workspace detail",
    guide: "Study guide preview"
  };
  return titles[screen];
}

function Dashboard({
  state,
  setScreen,
  setSelectedLectureId,
  setSelectedExamId,
  courseLabel
}: {
  state: VaultState;
  setScreen: (screen: Screen) => void;
  setSelectedLectureId: (id: string) => void;
  setSelectedExamId: (id: string) => void;
  courseLabel: (id: string) => string;
}) {
  const recentLectures = state.lectures.slice(0, 4);
  const activeExams = state.exams.slice(0, 4);

  return (
    <section className="dashboard">
      <div className="metric-grid">
        <div className="metric">
          <strong>{state.courses.length}</strong>
          <span>Courses</span>
        </div>
        <div className="metric">
          <strong>{state.lectures.length}</strong>
          <span>Lecture/media items</span>
        </div>
        <div className="metric">
          <strong>{state.transcripts.length}</strong>
          <span>Transcripts</span>
        </div>
        <div className="metric">
          <strong>{state.exams.length}</strong>
          <span>Exam workspaces</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h3>Daily Capture</h3>
            <button type="button" onClick={() => setScreen("capture")}>
              Capture
            </button>
          </div>
          <p>
            Record or upload lecture audio, video, whiteboard photos, and
            supporting files into the permanent archive first.
          </p>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h3>Exam Builder</h3>
            <button type="button" onClick={() => setScreen("exams")}>
              Organize
            </button>
          </div>
          <p>
            Exam workspaces are filtered collections. Removing or deleting an
            exam never deletes the original lecture media.
          </p>
        </section>
      </div>

      <div className="content-grid">
        <section className="panel list-panel">
          <h3>Recent Archive Items</h3>
          {recentLectures.map((lecture) => (
            <button
              key={lecture.id}
              type="button"
              className="row-button"
              onClick={() => {
                setSelectedLectureId(lecture.id);
                setScreen("lecture");
              }}
            >
              <strong>{lecture.title}</strong>
              <span>{courseLabel(lecture.courseId)}</span>
              <small>{lecture.date}</small>
            </button>
          ))}
        </section>
        <section className="panel list-panel">
          <h3>Active Exam Workspaces</h3>
          {activeExams.map((exam) => (
            <button
              key={exam.id}
              type="button"
              className="row-button"
              onClick={() => {
                setSelectedExamId(exam.id);
                setScreen("exam");
              }}
            >
              <strong>{exam.name}</strong>
              <span>{courseLabel(exam.courseId)}</span>
              <small>{exam.startsOn || "No date set"}</small>
            </button>
          ))}
        </section>
      </div>
    </section>
  );
}

function LectureCard({
  lecture,
  courseLabel,
  mediaCount,
  conceptCount,
  onOpen,
  onAdd
}: {
  lecture: Lecture;
  courseLabel: (id: string) => string;
  mediaCount: number;
  conceptCount: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <article
      className="lecture-card"
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData("text/lecture-id", lecture.id)
      }
    >
      <div>
        <span className="pill">{courseLabel(lecture.courseId)}</span>
        <h3>{lecture.title}</h3>
        <p>{lecture.summary}</p>
      </div>
      <div className="card-meta">
        <span>{lecture.date}</span>
        <span>{mediaCount} media</span>
        <span>{conceptCount} concepts</span>
      </div>
      <div className="button-row">
        <button type="button" onClick={onOpen}>
          Open
        </button>
        <button type="button" onClick={onAdd}>
          Add to Exam
        </button>
      </div>
    </article>
  );
}

function LectureDetail({
  lecture,
  courseLabel,
  mediaItems,
  transcript,
  concepts,
  exams,
  onAddToExam
}: {
  lecture: Lecture;
  courseLabel: (id: string) => string;
  mediaItems: MediaItem[];
  transcript?: Transcript;
  concepts: ExtractedConcept[];
  exams: ExamWorkspace[];
  onAddToExam: (lectureId: string, examId?: string) => void;
}) {
  const [targetExamId, setTargetExamId] = useState(exams[0]?.id || "");

  useEffect(() => {
    setTargetExamId(exams[0]?.id || "");
  }, [exams]);

  return (
    <section className="detail-grid">
      <article className="panel detail-main">
        <div className="section-heading">
          <div>
            <span className="pill">{courseLabel(lecture.courseId)}</span>
            <h3>{lecture.title}</h3>
          </div>
          <span>{lecture.date}</span>
        </div>
        <p>{lecture.summary}</p>

        <h4>Transcript</h4>
        <div className="transcript-box">
          {transcript?.segments.map((segment) => (
            <p key={segment.id}>
              <a href={`#${segment.id}`}>
                {formatSeconds(segment.startSeconds)}
              </a>{" "}
              {segment.text}
            </p>
          )) || "No transcript yet."}
        </div>
      </article>

      <aside className="panel side-panel">
        <h3>Add to Exam Workspace</h3>
        <select
          value={targetExamId}
          onChange={(event) => setTargetExamId(event.target.value)}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onAddToExam(lecture.id, targetExamId)}
          disabled={!targetExamId}
        >
          Add Reference
        </button>

        <h3>Media</h3>
        <div className="media-list">
          {mediaItems.map((item) => (
            <div key={item.id} className="media-item">
              <strong>{item.name}</strong>
              <span>
                {item.kind} - {(item.size / 1024 / 1024).toFixed(1)} MB
              </span>
              {item.kind === "image" && item.dataUrl ? (
                <img src={item.dataUrl} alt={item.name} />
              ) : null}
              {item.kind === "audio" && item.dataUrl ? (
                <audio src={item.dataUrl} controls />
              ) : null}
              {item.kind === "video" && item.dataUrl ? (
                <video src={item.dataUrl} controls />
              ) : null}
            </div>
          ))}
        </div>

        <h3>Extracted Concepts</h3>
        <div className="concept-list">
          {concepts.map((concept) => (
            <div key={concept.id}>
              <strong>{concept.title}</strong>
              <p>{concept.detail}</p>
              <small>Source: {concept.sourceSegmentId || "media"}</small>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function ExamDetail({
  exam,
  lectures,
  availableLectures,
  courses,
  mediaItems,
  concepts,
  transcripts,
  selectedGuide,
  instructions,
  isGenerating,
  courseLabel,
  onInstructionsChange,
  onAdd,
  onRemove,
  onGenerate,
  onDownloadPdf,
  onDelete,
  onOpenLecture
}: {
  exam: ExamWorkspace;
  lectures: Lecture[];
  availableLectures: Lecture[];
  courses: Course[];
  mediaItems: MediaItem[];
  concepts: ExtractedConcept[];
  transcripts: Transcript[];
  selectedGuide?: StudyGuide;
  instructions: string;
  isGenerating: boolean;
  courseLabel: (id: string) => string;
  onInstructionsChange: (value: string) => void;
  onAdd: (lectureId: string, examId?: string) => void;
  onRemove: (lectureId: string) => void;
  onGenerate: () => void | Promise<void>;
  onDownloadPdf: () => void | Promise<void>;
  onDelete: () => void;
  onOpenLecture: (lectureId: string) => void;
}) {
  const [explorerQuery, setExplorerQuery] = useState("");
  const selectedIds = new Set(lectures.map((lecture) => lecture.id));
  const normalizedQuery = explorerQuery.trim().toLowerCase();
  const visibleCourses = courses.filter(
    (course) =>
      course.id === exam.courseId ||
      availableLectures.some((lecture) => lecture.courseId === course.id)
  );
  const filteredLectures = availableLectures.filter((lecture) => {
    const haystack = [
      lecture.title,
      lecture.summary,
      lecture.date,
      courseLabel(lecture.courseId),
      mediaItems
        .filter((item) => item.lectureId === lecture.id)
        .map((item) => item.name)
        .join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
  const selectedTranscriptCount = transcripts.filter((transcript) =>
    selectedIds.has(transcript.lectureId)
  ).length;
  const selectedSegmentCount = transcripts
    .filter((transcript) => selectedIds.has(transcript.lectureId))
    .reduce((total, transcript) => total + transcript.segments.length, 0);
  const selectedConceptCount = concepts.filter((concept) =>
    selectedIds.has(concept.lectureId)
  ).length;
  const selectedImageCount = mediaItems.filter(
    (item) => selectedIds.has(item.lectureId) && item.kind === "image"
  ).length;

  return (
    <section className="exam-builder-layout">
      <aside className="panel archive-explorer" aria-label="Archive explorer">
        <div className="section-heading">
          <div>
            <span className="pill">Archive</span>
            <h3>File Explorer</h3>
          </div>
        </div>
        <label>
          Filter materials
          <input
            value={explorerQuery}
            onChange={(event) => setExplorerQuery(event.target.value)}
            placeholder="Lecture, media file, date, concept..."
          />
        </label>

        <div className="explorer-tree">
          {visibleCourses.map((course) => {
            const courseLectures = filteredLectures.filter(
              (lecture) => lecture.courseId === course.id
            );

            if (!courseLectures.length) {
              return null;
            }

            return (
              <details key={course.id} open>
                <summary>
                  <span className="folder-icon" aria-hidden="true" />
                  <strong>{course.code}</strong>
                  <small>{courseLectures.length}</small>
                </summary>
                <div className="explorer-children">
                  {courseLectures.map((lecture) => {
                    const lectureMedia = mediaItems.filter(
                      (item) => item.lectureId === lecture.id
                    );
                    const lectureConcepts = concepts.filter(
                      (concept) => concept.lectureId === lecture.id
                    );

                    return (
                      <div
                        className={
                          selectedIds.has(lecture.id)
                            ? "explorer-item selected"
                            : "explorer-item"
                        }
                        draggable
                        key={lecture.id}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(
                            "text/lecture-id",
                            lecture.id
                          );
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onAdd(lecture.id, exam.id)}
                        >
                          <span className="file-icon" aria-hidden="true" />
                          <span>
                            <strong>{lecture.title}</strong>
                            <small>{lecture.date}</small>
                          </span>
                        </button>
                        <div className="explorer-meta">
                          {lectureMedia.map((item) => (
                            <span key={item.id}>
                              {item.kind === "image"
                                ? "Image"
                                : item.kind === "video"
                                  ? "Video"
                                  : item.kind === "audio"
                                    ? "Audio"
                                    : "Doc"}
                              : {item.name}
                            </span>
                          ))}
                          <span>{lectureConcepts.length} concepts</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </aside>

      <article
        className="panel detail-main exam-dropbox"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const lectureId = event.dataTransfer.getData("text/lecture-id");
          if (lectureId) {
            onAdd(lectureId, exam.id);
          }
        }}
      >
        <div className="section-heading">
          <div>
            <span className="pill">{courseLabel(exam.courseId)}</span>
            <h3>{exam.name}</h3>
          </div>
          <span>{exam.startsOn || "No date"}</span>
        </div>
        <p>
          Drag lectures from the file explorer into this exam box. Items here
          are references to the archive, so removing them does not delete
          original media.
        </p>

        <div className="workflow-steps" aria-label="Exam review workflow">
          {[
            { number: "1", label: "Select sources", complete: lectures.length > 0 },
            {
              number: "2",
              label: "Add instructions",
              complete: instructions.trim().length > 0
            },
            { number: "3", label: "Generate review", complete: Boolean(selectedGuide) },
            { number: "4", label: "Download PDF", complete: Boolean(selectedGuide) }
          ].map((step) => (
            <div
              className={step.complete ? "workflow-step complete" : "workflow-step"}
              key={step.label}
            >
              <strong>{step.number}</strong>
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        <div className="drop-instructions">
          <strong>Drop archive lectures here</strong>
          <span>
            {lectures.length
              ? `${lectures.length} selected source${lectures.length === 1 ? "" : "s"}`
              : "No sources selected yet"}
          </span>
        </div>

        <div className="exam-items">
          {lectures.map((lecture) => (
            <div className="exam-item" key={lecture.id}>
              <button type="button" onClick={() => onOpenLecture(lecture.id)}>
                <strong>{lecture.title}</strong>
                <span>{lecture.date}</span>
              </button>
              <button type="button" onClick={() => onRemove(lecture.id)}>
                Remove from exam
              </button>
            </div>
          ))}
          {!lectures.length ? (
            <p className="empty">
              Add lectures from the archive or drag lecture cards here.
            </p>
          ) : null}
        </div>

        <div className="source-readiness">
          <div>
            <strong>{lectures.length}</strong>
            <span>sources</span>
          </div>
          <div>
            <strong>{selectedTranscriptCount}</strong>
            <span>transcripts</span>
          </div>
          <div>
            <strong>{selectedSegmentCount}</strong>
            <span>segments</span>
          </div>
          <div>
            <strong>{selectedConceptCount}</strong>
            <span>concepts</span>
          </div>
          <div>
            <strong>{selectedImageCount}</strong>
            <span>images</span>
          </div>
        </div>

        <label className="exam-instructions">
          Exam review instructions
          <textarea
            value={instructions}
            onChange={(event) => onInstructionsChange(event.target.value)}
            rows={4}
            placeholder="Example: focus on formulas, worked examples, boundary conditions, units, and common mistakes for Exam 2."
          />
        </label>

        {selectedGuide ? (
          <section className="review-preview" aria-label="Generated exam review preview">
            <div className="section-heading">
              <div>
                <span className="pill">
                  {selectedGuide.generatedBy === "local-fallback"
                    ? "Local fallback"
                    : "AI aggregation"}
                </span>
                <h3>Generated Review</h3>
              </div>
              <span>{new Date(selectedGuide.createdAt).toLocaleString()}</span>
            </div>
            <pre className="guide-preview compact">{selectedGuide.content}</pre>
          </section>
        ) : null}

        <div className="button-row">
          <button
            className="primary"
            type="button"
            onClick={() => void onGenerate()}
            disabled={isGenerating || !lectures.length}
          >
            {isGenerating ? "Working..." : "Generate AI Review"}
          </button>
          <button
            type="button"
            onClick={() => void onDownloadPdf()}
            disabled={isGenerating || !selectedGuide}
          >
            Download Review PDF
          </button>
          <button className="danger" type="button" onClick={onDelete}>
            Delete Workspace
          </button>
        </div>
      </article>

      <aside className="panel side-panel source-inspector">
        <h3>Selected Sources</h3>
        {lectures.map((lecture) => {
          const lectureMedia = mediaItems.filter(
            (item) => item.lectureId === lecture.id
          );

          return (
            <div className="source-card" key={lecture.id}>
              <strong>{lecture.title}</strong>
              <span>{lecture.date}</span>
              <small>
                {lectureMedia.length} media item
                {lectureMedia.length === 1 ? "" : "s"}
              </small>
              <small>
                {
                  transcripts.find((transcript) => transcript.lectureId === lecture.id)
                    ?.segments.length || 0
                }{" "}
                transcript segments
              </small>
            </div>
          );
        })}
        {!lectures.length ? (
          <p className="empty">
            Sources added to the exam workspace will appear here.
          </p>
        ) : null}
      </aside>
    </section>
  );
}

function StudyGuidePreview({
  guide,
  lectures,
  onOpenLecture
}: {
  guide: StudyGuide;
  lectures: Lecture[];
  onOpenLecture: (lectureId: string) => void;
}) {
  return (
    <section className="detail-grid">
      <article className="panel detail-main">
        <div className="section-heading">
          <div>
            <span className="pill">Generated {new Date(guide.createdAt).toLocaleString()}</span>
            <h3>{guide.title}</h3>
          </div>
        </div>
        <pre className="guide-preview">{guide.content}</pre>
      </article>
      <aside className="panel side-panel">
        <h3>Source Links</h3>
        {lectures.map((lecture) => (
          <button
            className="row-button"
            key={lecture.id}
            type="button"
            onClick={() => onOpenLecture(lecture.id)}
          >
            <strong>{lecture.title}</strong>
            <span>Open transcript and media</span>
          </button>
        ))}
      </aside>
    </section>
  );
}
