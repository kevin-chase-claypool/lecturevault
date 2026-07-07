"use client";

import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import katex from "katex";

type Screen =
  | "dashboard"
  | "courses"
  | "archive"
  | "lecture"
  | "capture"
  | "builder"
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
  folderId?: string;
  title: string;
  date: string;
  summary: string;
  createdAt: string;
};

type ArchiveFolder = {
  id: string;
  courseId: string;
  parentId?: string;
  name: string;
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
  storageBucket?: string;
  storagePath?: string;
  createdAt: string;
};

type Transcript = {
  id: string;
  lectureId: string;
  mediaItemId?: string;
  sourceMediaIds?: string[];
  transcribedMediaIds?: string[];
  text: string;
  segments: TranscriptSegment[];
  generatedBy?: "manual" | "placeholder" | "openai";
  usage?: TokenUsage | null;
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
  context?: string;
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
  usage?: TokenUsage | null;
  createdAt: string;
};

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
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
  archiveFolders: ArchiveFolder[];
  lectures: Lecture[];
  mediaItems: MediaItem[];
  transcripts: Transcript[];
  concepts: ExtractedConcept[];
  exams: ExamWorkspace[];
  examItems: ExamWorkspaceItem[];
  studyGuides: StudyGuide[];
};

const STORAGE_KEY = "lecturevault-state-v1";
const DEFAULT_LECTURES_FOLDER_NAME = "Lectures";
const LEGACY_UNFILED_FOLDER_NAME = "Unfiled";
const LEGACY_DEMO_COURSE_IDS = new Set(["course-calculus", "course-physics"]);
const DEFAULT_REVIEW_CONTEXT =
  "Prioritize high-yield concepts, formulas, worked problem patterns, common mistakes, and a practice checklist.";
const MAX_INLINE_IMAGE_DIMENSION = 1600;
const INLINE_IMAGE_QUALITY = 0.78;
const SAMPLE_GAUSS_BOARD_DATA_URL =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221200%22%20height%3D%22800%22%20viewBox%3D%220%200%201200%20800%22%3E%3Crect%20width%3D%221200%22%20height%3D%22800%22%20fill%3D%22%23f8fafc%22/%3E%3Crect%20x%3D%2260%22%20y%3D%2250%22%20width%3D%221080%22%20height%3D%22700%22%20rx%3D%2224%22%20fill%3D%22%23ffffff%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%224%22/%3E%3Ctext%20x%3D%22100%22%20y%3D%22120%22%20font-family%3D%22Arial%22%20font-size%3D%2252%22%20font-weight%3D%22700%22%20fill%3D%22%231e293b%22%3EGauss%27s%20Law%3C/text%3E%3Ctext%20x%3D%22100%22%20y%3D%22205%22%20font-family%3D%22Arial%22%20font-size%3D%2246%22%20fill%3D%22%231e293b%22%3EFlux%3A%20Phi_E%20%3D%20%E2%88%AE%20E%20%C2%B7%20dA%20%3D%20Q_enc%20/%20epsilon_0%3C/text%3E%3Ccircle%20cx%3D%22770%22%20cy%3D%22420%22%20r%3D%22172%22%20fill%3D%22none%22%20stroke%3D%22%232563eb%22%20stroke-width%3D%226%22/%3E%3Ccircle%20cx%3D%22770%22%20cy%3D%22420%22%20r%3D%2222%22%20fill%3D%22%23ef4444%22/%3E%3Ctext%20x%3D%22748%22%20y%3D%22438%22%20font-family%3D%22Arial%22%20font-size%3D%2242%22%20font-weight%3D%22700%22%20fill%3D%22%23ffffff%22%3E%2B%3C/text%3E%3Cpath%20d%3D%22M770%20420%20L770%20205%20M770%20420%20L985%20420%20M770%20420%20L618%20268%20M770%20420%20L922%20572%20M770%20420%20L618%20572%22%20stroke%3D%22%230f766e%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%22975%22%20y%3D%22395%22%20font-family%3D%22Arial%22%20font-size%3D%2236%22%20fill%3D%22%230f766e%22%3EE%20radial%3C/text%3E%3Ctext%20x%3D%22100%22%20y%3D%22325%22%20font-family%3D%22Arial%22%20font-size%3D%2238%22%20fill%3D%22%231e293b%22%3EChoose%20a%20Gaussian%20surface%20that%20matches%20symmetry.%3C/text%3E%3Ctext%20x%3D%22100%22%20y%3D%22385%22%20font-family%3D%22Arial%22%20font-size%3D%2238%22%20fill%3D%22%231e293b%22%3ESphere%3A%20E%20is%20constant%20on%20surface.%3C/text%3E%3Ctext%20x%3D%22100%22%20y%3D%22445%22%20font-family%3D%22Arial%22%20font-size%3D%2238%22%20fill%3D%22%231e293b%22%3EThen%3A%20E%284%CF%80r%5E2%29%20%3D%20Q_enc%20/%20epsilon_0%3C/text%3E%3C/svg%3E";

const emptyState: VaultState = {
  courses: [],
  archiveFolders: [],
  lectures: [],
  mediaItems: [],
  transcripts: [],
  concepts: [],
  exams: [],
  examItems: [],
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

function formatTokenUsage(usage?: TokenUsage | null) {
  if (!usage) {
    return "";
  }

  return [
    typeof usage.total_tokens === "number"
      ? `${usage.total_tokens.toLocaleString()} total`
      : "",
    typeof usage.input_tokens === "number"
      ? `${usage.input_tokens.toLocaleString()} input`
      : "",
    typeof usage.output_tokens === "number"
      ? `${usage.output_tokens.toLocaleString()} output`
      : ""
  ]
    .filter(Boolean)
    .join(" / ");
}

function transcriptUsageLabel(transcript?: Transcript) {
  if (!transcript) {
    return "No transcript saved yet.";
  }

  const usage = formatTokenUsage(transcript.usage);

  if (usage) {
    return `AI transcription usage: ${usage}`;
  }

  if (transcript.generatedBy === "placeholder") {
    return "No AI transcription usage recorded. This lecture is using placeholder transcript text.";
  }

  if (transcript.generatedBy === "openai") {
    return "AI transcription completed, but token usage was not returned.";
  }

  return "No AI transcription usage recorded. Transcript text was pasted or saved manually.";
}

function renderMathMarkup(text: string) {
  const parts: Array<{ content: string; display: boolean; math: boolean }> = [];
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]*?\\\))/g;
  const normalizedText = normalizeLatexEscapes(text);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        content: normalizedText.slice(lastIndex, match.index),
        display: false,
        math: false
      });
    }

    const raw = match[0];
    const display = raw.startsWith("$$") || raw.startsWith("\\[");
    const content = raw.startsWith("$$")
      ? raw.slice(2, -2)
      : raw.startsWith("\\[")
        ? raw.slice(2, -2)
        : raw.startsWith("\\(")
          ? raw.slice(2, -2)
          : raw.slice(1, -1);

    try {
      parts.push({
        content: katex.renderToString(content.trim(), {
          displayMode: display,
          throwOnError: false
        }),
        display,
        math: true
      });
    } catch {
      parts.push({ content: raw, display: false, math: false });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < normalizedText.length) {
    parts.push({
      content: normalizedText.slice(lastIndex),
      display: false,
      math: false
    });
  }

  return parts.length
    ? parts
    : [{ content: normalizedText, display: false, math: false }];
}

function MathPreview({ text }: { text: string }) {
  return (
    <>
      {renderMathMarkup(text).map((part, index) =>
        part.math ? (
          <span
            className={part.display ? "math-block" : "math-inline"}
            dangerouslySetInnerHTML={{ __html: part.content }}
            key={`${part.content}-${index}`}
          />
        ) : (
          <span key={`${part.content}-${index}`}>{part.content}</span>
        )
      )}
    </>
  );
}

function normalizeLatexEscapes(text: string) {
  return text
    .replace(/\\\\(?=[()[\]])/g, "\\")
    .replace(/\\\\(?=[a-zA-Z])/g, "\\");
}

function stripInlineMarkdown(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function ReviewMarkdownPreview({
  compact = false,
  text
}: {
  compact?: boolean;
  text: string;
}) {
  const lines = normalizeLatexEscapes(text).trim().split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  let mathLines: string[] = [];
  let inDisplayMath = false;

  function flushBullets() {
    if (!bullets.length) {
      return;
    }

    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {bullets.map((item, index) => (
          <li key={`${item}-${index}`}>
            <MathPreview text={stripInlineMarkdown(item)} />
          </li>
        ))}
      </ul>
    );
    bullets = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "\\[") {
      flushBullets();
      inDisplayMath = true;
      mathLines = ["\\["];
      continue;
    }

    if (line === "\\]" && inDisplayMath) {
      mathLines.push("\\]");
      nodes.push(
        <div className="review-math-block" key={`math-${nodes.length}`}>
          <MathPreview text={mathLines.join("\n")} />
        </div>
      );
      inDisplayMath = false;
      mathLines = [];
      continue;
    }

    if (inDisplayMath) {
      mathLines.push(rawLine);
      continue;
    }

    if (!line) {
      flushBullets();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBullets();
      const HeadingTag = `h${Math.min(heading[1].length + 2, 5)}` as
        | "h3"
        | "h4"
        | "h5";
      nodes.push(
        <HeadingTag key={`heading-${nodes.length}`}>
          <MathPreview text={stripInlineMarkdown(heading[2])} />
        </HeadingTag>
      );
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }

    flushBullets();
    nodes.push(
      <p key={`paragraph-${nodes.length}`}>
        <MathPreview text={stripInlineMarkdown(line)} />
      </p>
    );
  }

  flushBullets();

  return (
    <div className={compact ? "guide-rendered compact" : "guide-rendered"}>
      {nodes.length ? nodes : <p>No generated review content yet.</p>}
    </div>
  );
}

function embeddedDataUrlForMedia(item: MediaItem) {
  if (item.dataUrl) {
    return item.dataUrl;
  }

  return item.id === "media-gauss-board" || item.name === "gauss-board.jpg"
    ? SAMPLE_GAUSS_BOARD_DATA_URL
    : undefined;
}

function mediaStorageUrl(item: MediaItem) {
  if (item.dataUrl) {
    return item.dataUrl;
  }

  if (!item.storagePath) {
    return "";
  }

  const params = new URLSearchParams({
    path: item.storagePath
  });

  if (item.storageBucket) {
    params.set("bucket", item.storageBucket);
  }

  return `/api/media/read?${params.toString()}`;
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
        dataUrl: embeddedDataUrlForMedia(item)
      };
    });
}

function folderDescendantIds(folders: ArchiveFolder[], folderId: string) {
  const ids = new Set<string>();
  const stack = [folderId];

  while (stack.length) {
    const current = stack.pop();

    if (!current || ids.has(current)) {
      continue;
    }

    ids.add(current);
    for (const folder of folders) {
      if (folder.parentId === current) {
        stack.push(folder.id);
      }
    }
  }

  return ids;
}

function folderLectureCount(
  folders: ArchiveFolder[],
  lectures: Lecture[],
  folderId: string
) {
  const ids = folderDescendantIds(folders, folderId);
  return lectures.filter((lecture) => lecture.folderId && ids.has(lecture.folderId))
    .length;
}

function examItemExists(
  examItems: ExamWorkspaceItem[],
  examWorkspaceId: string,
  lectureId: string
) {
  return examItems.some(
    (item) =>
      item.examWorkspaceId === examWorkspaceId && item.lectureId === lectureId
  );
}

function defaultLectureFolderId(folders: ArchiveFolder[], courseId: string) {
  return folders.find(
    (folder) =>
      folder.courseId === courseId &&
      !folder.parentId &&
      folder.name.trim().toLowerCase() ===
        DEFAULT_LECTURES_FOLDER_NAME.toLowerCase()
  )?.id;
}

function isLegacyUnfiledFolder(folder?: ArchiveFolder) {
  return Boolean(
    folder &&
      !folder.parentId &&
      folder.name.trim().toLowerCase() ===
        LEGACY_UNFILED_FOLDER_NAME.toLowerCase()
  );
}

function isDefaultLectureFolder(folder?: ArchiveFolder) {
  return Boolean(
    folder &&
      !folder.parentId &&
      folder.name.trim().toLowerCase() ===
        DEFAULT_LECTURES_FOLDER_NAME.toLowerCase()
  );
}

function createDefaultLectureFolder(courseId: string, createdAt = new Date().toISOString()) {
  return {
    id: uid("folder"),
    courseId,
    name: DEFAULT_LECTURES_FOLDER_NAME,
    createdAt
  };
}

function removeLegacyDemoRecords(state: VaultState): VaultState {
  const legacyLectureIds = new Set(
    state.lectures
      .filter((lecture) => LEGACY_DEMO_COURSE_IDS.has(lecture.courseId))
      .map((lecture) => lecture.id)
  );
  const legacyExamIds = new Set(
    state.exams
      .filter((exam) => LEGACY_DEMO_COURSE_IDS.has(exam.courseId))
      .map((exam) => exam.id)
  );

  if (!legacyLectureIds.size && !legacyExamIds.size) {
    const hasLegacyCourses = state.courses.some((course) =>
      LEGACY_DEMO_COURSE_IDS.has(course.id)
    );
    const hasLegacyFolders = state.archiveFolders.some((folder) =>
      LEGACY_DEMO_COURSE_IDS.has(folder.courseId)
    );

    if (!hasLegacyCourses && !hasLegacyFolders) {
      return state;
    }
  }

  return {
    ...state,
    courses: state.courses.filter(
      (course) => !LEGACY_DEMO_COURSE_IDS.has(course.id)
    ),
    archiveFolders: state.archiveFolders.filter(
      (folder) => !LEGACY_DEMO_COURSE_IDS.has(folder.courseId)
    ),
    lectures: state.lectures.filter(
      (lecture) => !LEGACY_DEMO_COURSE_IDS.has(lecture.courseId)
    ),
    mediaItems: state.mediaItems.filter(
      (item) => !legacyLectureIds.has(item.lectureId)
    ),
    transcripts: state.transcripts.filter(
      (transcript) => !legacyLectureIds.has(transcript.lectureId)
    ),
    concepts: state.concepts.filter(
      (concept) => !legacyLectureIds.has(concept.lectureId)
    ),
    exams: state.exams.filter(
      (exam) => !LEGACY_DEMO_COURSE_IDS.has(exam.courseId)
    ),
    examItems: state.examItems.filter(
      (item) =>
        !legacyExamIds.has(item.examWorkspaceId) &&
        !legacyLectureIds.has(item.lectureId)
    ),
    studyGuides: state.studyGuides
      .filter((guide) => !legacyExamIds.has(guide.examWorkspaceId))
      .map((guide) => ({
        ...guide,
        sourceLectureIds: guide.sourceLectureIds.filter(
          (id) => !legacyLectureIds.has(id)
        ),
        figures: guide.figures?.filter(
          (figure) => !legacyLectureIds.has(figure.lectureId)
        )
      }))
  };
}

function ensureCourseLectureFolders(state: VaultState): VaultState {
  let changed = false;
  let folders = [...state.archiveFolders];
  const defaultFolderByCourse = new Map<string, string>();
  const legacyFolderRemap = new Map<string, string>();

  for (const course of state.courses) {
    const courseFolders = folders.filter((folder) => folder.courseId === course.id);
    const legacyUnfiledFolders = courseFolders.filter(isLegacyUnfiledFolder);
    let folderId = defaultLectureFolderId(folders, course.id);

    if (!folderId && legacyUnfiledFolders.length) {
      const [primaryLegacyFolder] = legacyUnfiledFolders;
      folders = folders.map((folder) =>
        folder.id === primaryLegacyFolder.id
          ? { ...folder, name: DEFAULT_LECTURES_FOLDER_NAME }
          : folder
      );
      folderId = primaryLegacyFolder.id;
      changed = true;
    }

    if (!folderId) {
      const folder = createDefaultLectureFolder(course.id);
      folders.push(folder);
      folderId = folder.id;
      changed = true;
    }

    for (const folder of legacyUnfiledFolders) {
      if (folder.id !== folderId) {
        legacyFolderRemap.set(folder.id, folderId);
        changed = true;
      }
    }

    defaultFolderByCourse.set(course.id, folderId);
  }

  const lectures = state.lectures.map((lecture) => {
    if (lecture.folderId && legacyFolderRemap.has(lecture.folderId)) {
      changed = true;
      return { ...lecture, folderId: legacyFolderRemap.get(lecture.folderId) };
    }

    if (lecture.folderId) {
      return lecture;
    }

    const folderId = defaultFolderByCourse.get(lecture.courseId);

    if (!folderId) {
      return lecture;
    }

    changed = true;
    return { ...lecture, folderId };
  });
  folders = folders
    .filter((folder) => !legacyFolderRemap.has(folder.id))
    .map((folder) => {
      if (folder.parentId && legacyFolderRemap.has(folder.parentId)) {
        changed = true;
        return { ...folder, parentId: legacyFolderRemap.get(folder.parentId) };
      }

      return folder;
    });

  return changed ? { ...state, archiveFolders: folders, lectures } : state;
}

function compareArchiveFolders(first: ArchiveFolder, second: ArchiveFolder) {
  const firstIsDefault = isDefaultLectureFolder(first);
  const secondIsDefault = isDefaultLectureFolder(second);

  if (firstIsDefault !== secondIsDefault) {
    return firstIsDefault ? -1 : 1;
  }

  return first.name.localeCompare(second.name);
}

function archiveLecturesForLocation(
  state: VaultState,
  courseId: string,
  folderId: string
) {
  const selectedFolderIds =
    folderId === "all" || folderId === "unfiled"
      ? new Set<string>()
      : folderDescendantIds(state.archiveFolders, folderId);

  return state.lectures.filter((lecture) => {
    const matchesCourse = lecture.courseId === courseId;
    const matchesFolder =
      folderId === "all"
        ? true
        : folderId === "unfiled"
          ? !lecture.folderId
          : Boolean(lecture.folderId && selectedFolderIds.has(lecture.folderId));

    return matchesCourse && matchesFolder;
  });
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

async function imageFileToInlineDataUrl(file: File) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(
    1,
    MAX_INLINE_IMAGE_DIMENSION /
      Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return readFileAsDataUrl(file);
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", INLINE_IMAGE_QUALITY);
}

async function fileToMediaDataUrl(file: File) {
  if (file.type.startsWith("image/")) {
    return imageFileToInlineDataUrl(file);
  }

  return file.size <= 8 * 1024 * 1024 ? readFileAsDataUrl(file) : undefined;
}

async function uploadMediaFile({
  file,
  lectureId,
  mediaId
}: {
  file: File;
  lectureId: string;
  mediaId: string;
}) {
  const form = new FormData();
  form.set("file", file);
  form.set("lectureId", lectureId);
  form.set("mediaId", mediaId);

  const response = await fetch("/api/media/upload", {
    body: form,
    credentials: "include",
    method: "POST"
  });
  const data = (await response.json()) as {
    bucket?: string;
    error?: string;
    path?: string;
  };

  if (!response.ok || !data.path) {
    throw new Error(data.error || `Could not upload ${file.name} to Supabase.`);
  }

  return {
    storageBucket: data.bucket,
    storagePath: data.path
  };
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
    return emptyState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyState;
  }

  try {
    const parsed = { ...emptyState, ...JSON.parse(raw) } as VaultState;
    const normalized = {
      ...parsed,
      archiveFolders: Array.isArray(parsed.archiveFolders)
        ? parsed.archiveFolders
        : []
    };
    return ensureCourseLectureFolders(removeLegacyDemoRecords(normalized));
  } catch {
    return emptyState;
  }
}

function normalizeState(input: unknown): VaultState {
  if (!input || typeof input !== "object") {
    return emptyState;
  }

  const parsed = { ...emptyState, ...(input as Partial<VaultState>) } as VaultState;
  return ensureCourseLectureFolders(
    removeLegacyDemoRecords({
      ...parsed,
      archiveFolders: Array.isArray(parsed.archiveFolders)
        ? parsed.archiveFolders
        : []
    })
  );
}

function stateHasUserData(state: VaultState) {
  return Boolean(
    state.courses.length ||
      state.archiveFolders.length ||
      state.lectures.length ||
      state.mediaItems.length ||
      state.transcripts.length ||
      state.concepts.length ||
      state.exams.length ||
      state.examItems.length ||
      state.studyGuides.length
  );
}

export default function LectureVaultApp() {
  const [state, setState] = useState<VaultState>(() => loadState());
  const [authStatus, setAuthStatus] = useState<"checking" | "ready" | "locked" | "setup">("checking");
  const [cloudStateLoaded, setCloudStateLoaded] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState("");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedLectureId, setSelectedLectureId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [selectedArchiveFolderId, setSelectedArchiveFolderId] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Local archive ready.");
  const [archiveFolderName, setArchiveFolderName] = useState("");
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    term: ""
  });
  const [captureForm, setCaptureForm] = useState({
    courseId: "",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    transcript: "",
    summary: ""
  });
  const [captureFiles, setCaptureFiles] = useState<File[]>([]);
  const [examForm, setExamForm] = useState({
    courseId: "",
    name: "",
    startsOn: ""
  });
  const [builderCourseId, setBuilderCourseId] = useState("");
  const [builderFolderId, setBuilderFolderId] = useState("all");
  const [builderQuery, setBuilderQuery] = useState("");
  const [builderSelectedLectureIds, setBuilderSelectedLectureIds] = useState<string[]>([]);
  const [isLectureGenerating, setIsLectureGenerating] = useState(false);
  const [isReviewGenerating, setIsReviewGenerating] = useState(false);
  const stateJsonRef = useRef(JSON.stringify(state));
  const skipNextCloudSaveRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "include"
        });
        const data = (await response.json()) as {
          authenticated?: boolean;
          configured?: boolean;
        };

        if (!active) {
          return;
        }

        if (!data.configured) {
          setAuthStatus("setup");
        } else {
          setAuthStatus(data.authenticated ? "ready" : "locked");
        }
      } catch {
        if (active) {
          setAuthStatus("locked");
        }
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "ready") {
      setCloudStateLoaded(false);
      setCloudSyncEnabled(false);
      return;
    }

    let active = true;

    async function loadCloudState() {
      try {
        const response = await fetch("/api/vault-state", {
          credentials: "include"
        });
        const data = (await response.json()) as {
          configured?: boolean;
          state?: unknown;
          updatedAt?: string | null;
          error?: string;
        };

        if (!active) {
          return;
        }

        if (!response.ok) {
          throw new Error(data.error || "Could not load Supabase archive state.");
        }

        if (!data.configured) {
          setCloudSyncEnabled(false);
          setCloudStateLoaded(true);
          setStatus("Supabase sync is not configured. Using this browser only.");
          return;
        }

        setCloudSyncEnabled(true);
        setCloudUpdatedAt(data.updatedAt || "");

        if (data.state) {
          const nextState = normalizeState(data.state);
          skipNextCloudSaveRef.current = true;
          setState(nextState);
          setStatus("Archive synced from Supabase.");
        } else if (stateHasUserData(state)) {
          setStatus("Supabase archive is empty. Uploading this browser's archive.");
        } else {
          setStatus("Supabase archive ready.");
        }

        setCloudStateLoaded(true);
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Could not load Supabase archive state.";
        setCloudSyncEnabled(false);
        setCloudStateLoaded(true);
        setStatus(`Supabase sync unavailable: ${message}`);
      }
    }

    void loadCloudState();

    return () => {
      active = false;
    };
  }, [authStatus]);

  useEffect(() => {
    stateJsonRef.current = JSON.stringify(state);
  }, [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Browser storage could not save the archive.";
      setStatus(`Archive save failed: ${message}`);
    }
  }, [state]);

  useEffect(() => {
    if (authStatus !== "ready" || !cloudStateLoaded || !cloudSyncEnabled) {
      return;
    }

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/vault-state", {
          body: JSON.stringify({ state }),
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          method: "PUT"
        });
        const data = (await response.json()) as {
          updatedAt?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not save Supabase archive state.");
        }

        setCloudUpdatedAt(data.updatedAt || "");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not save Supabase archive state.";
        setStatus(`Supabase save failed: ${message}`);
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [authStatus, cloudStateLoaded, cloudSyncEnabled, state]);

  useEffect(() => {
    if (authStatus !== "ready" || !cloudStateLoaded || !cloudSyncEnabled) {
      return;
    }

    let active = true;

    async function pullLatestCloudState() {
      try {
        const response = await fetch("/api/vault-state", {
          credentials: "include",
          headers: {
            "cache-control": "no-cache"
          }
        });
        const data = (await response.json()) as {
          configured?: boolean;
          state?: unknown;
          updatedAt?: string | null;
          error?: string;
        };

        if (!active || !response.ok || !data.configured || !data.state) {
          return;
        }

        if (data.updatedAt && data.updatedAt === cloudUpdatedAt) {
          return;
        }

        const nextState = normalizeState(data.state);
        const nextJson = JSON.stringify(nextState);

        setCloudUpdatedAt(data.updatedAt || "");

        if (nextJson !== stateJsonRef.current) {
          skipNextCloudSaveRef.current = true;
          setState(nextState);
          setStatus("Archive updated from Supabase.");
        }
      } catch {
        // Keep the current local view if a background refresh fails.
      }
    }

    const intervalId = window.setInterval(() => {
      void pullLatestCloudState();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [authStatus, cloudStateLoaded, cloudSyncEnabled, cloudUpdatedAt]);

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

    return archiveLecturesForLocation(
      state,
      selectedCourseId,
      selectedArchiveFolderId
    ).filter((lecture) => {
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
  }, [query, selectedArchiveFolderId, selectedCourseId, state]);

  const selectedExamLectures = selectedExam
    ? state.examItems
        .filter((item) => item.examWorkspaceId === selectedExam.id)
        .map((item) =>
          state.lectures.find((lecture) => lecture.id === item.lectureId)
        )
        .filter((lecture): lecture is Lecture => Boolean(lecture))
    : [];

  const selectedArchiveLecture = archiveLectures.find(
    (lecture) => lecture.id === selectedLectureId
  );
  const selectedArchiveFolder = state.archiveFolders.find(
    (folder) => folder.id === selectedArchiveFolderId
  );
  const builderLectures = useMemo(() => {
    const term = builderQuery.trim().toLowerCase();

    return archiveLecturesForLocation(
      state,
      builderCourseId,
      builderFolderId
    ).filter((lecture) => {
      const transcript = state.transcripts.find(
        (item) => item.lectureId === lecture.id
      );
      const mediaNames = state.mediaItems
        .filter((item) => item.lectureId === lecture.id)
        .map((item) => item.name)
        .join(" ");

      return [lecture.title, lecture.summary, lecture.date, transcript?.text, mediaNames]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [builderCourseId, builderFolderId, builderQuery, state]);
  const builderSelectedLectures = builderSelectedLectureIds
    .map((id) => state.lectures.find((lecture) => lecture.id === id))
    .filter((lecture): lecture is Lecture =>
      Boolean(lecture && lecture.courseId === builderCourseId)
    );
  const basketCount = builderSelectedLectures.length;
  const reviewContext = selectedExam?.context ?? DEFAULT_REVIEW_CONTEXT;

  function updateSelectedReviewContext(context: string) {
    if (!selectedExam) {
      return;
    }

    setState((current) => ({
      ...current,
      exams: current.exams.map((exam) =>
        exam.id === selectedExam.id ? { ...exam, context } : exam
      )
    }));
  }

  useEffect(() => {
    setState((current) => ensureCourseLectureFolders(current));
  }, [state.archiveFolders, state.courses, state.lectures]);

  useEffect(() => {
    const courseIds = new Set(state.courses.map((course) => course.id));
    const firstCourseId = state.courses[0]?.id || "";

    if (firstCourseId && !courseIds.has(selectedCourseId)) {
      setSelectedCourseId(firstCourseId);
      setSelectedArchiveFolderId("all");
    }

    if (firstCourseId && !courseIds.has(captureForm.courseId)) {
      setCaptureForm((current) => ({ ...current, courseId: firstCourseId }));
    }

    if (firstCourseId && !courseIds.has(examForm.courseId)) {
      setExamForm((current) => ({ ...current, courseId: firstCourseId }));
    }

    if (firstCourseId && !courseIds.has(builderCourseId)) {
      setBuilderCourseId(firstCourseId);
      setBuilderFolderId("all");
    }

    if (
      selectedLectureId &&
      !state.lectures.some((lecture) => lecture.id === selectedLectureId)
    ) {
      setSelectedLectureId(state.lectures[0]?.id || "");
    }

    if (
      selectedExamId &&
      !state.exams.some((exam) => exam.id === selectedExamId)
    ) {
      setSelectedExamId(state.exams[0]?.id || "");
    }
  }, [
    builderCourseId,
    captureForm.courseId,
    examForm.courseId,
    selectedCourseId,
    selectedExamId,
    selectedLectureId,
    state.courses,
    state.exams,
    state.lectures
  ]);

  useEffect(() => {
    if (selectedArchiveFolderId === "unfiled") {
      setSelectedArchiveFolderId(
        defaultLectureFolderId(state.archiveFolders, selectedCourseId) || "all"
      );
      return;
    }

    if (
      selectedArchiveFolderId !== "all" &&
      !state.archiveFolders.some(
        (folder) =>
          folder.id === selectedArchiveFolderId &&
          folder.courseId === selectedCourseId
      )
    ) {
      setSelectedArchiveFolderId("all");
    }
  }, [selectedArchiveFolderId, selectedCourseId, state.archiveFolders]);

  useEffect(() => {
    if (builderFolderId === "unfiled") {
      setBuilderFolderId(
        defaultLectureFolderId(state.archiveFolders, builderCourseId) || "all"
      );
      return;
    }

    if (
      builderFolderId !== "all" &&
      !state.archiveFolders.some(
        (folder) =>
          folder.id === builderFolderId && folder.courseId === builderCourseId
      )
    ) {
      setBuilderFolderId("all");
    }
  }, [builderCourseId, builderFolderId, state.archiveFolders]);

  useEffect(() => {
    if (screen !== "archive") {
      return;
    }

    if (
      selectedLectureId &&
      archiveLectures.some((lecture) => lecture.id === selectedLectureId)
    ) {
      return;
    }

    setSelectedLectureId(archiveLectures[0]?.id || "");
  }, [archiveLectures, screen, selectedLectureId]);

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
    const lectureFolder = createDefaultLectureFolder(course.id, course.createdAt);

    setState((current) => ({
      ...current,
      courses: [course, ...current.courses],
      archiveFolders: [lectureFolder, ...current.archiveFolders]
    }));
    setCourseForm({ code: "", name: "", term: "" });
    setSelectedCourseId(course.id);
    setSelectedArchiveFolderId(lectureFolder.id);
    setStatus(`Created ${course.code} with a default Lectures folder.`);
  }

  function deleteCourse(courseId: string) {
    const course = state.courses.find((item) => item.id === courseId);

    if (!course) {
      setStatus("Could not find that course.");
      return;
    }

    const lectureCount = state.lectures.filter(
      (lecture) => lecture.courseId === courseId
    ).length;
    const examCount = state.exams.filter((exam) => exam.courseId === courseId)
      .length;
    const confirmed = window.confirm(
      `Delete ${course.code} ${course.name}? This removes ${lectureCount} archived lecture item${lectureCount === 1 ? "" : "s"}, related media/transcripts/concepts, ${examCount} review set${examCount === 1 ? "" : "s"}, and generated reviews for this course.`
    );

    if (!confirmed) {
      return;
    }

    const deletedLectureIds = new Set(
      state.lectures
        .filter((lecture) => lecture.courseId === courseId)
        .map((lecture) => lecture.id)
    );
    const deletedExamIds = new Set(
      state.exams
        .filter((exam) => exam.courseId === courseId)
        .map((exam) => exam.id)
    );
    const nextCourse = state.courses.find((item) => item.id !== courseId);
    const nextCourseId = nextCourse?.id || "";
    const nextLecture = state.lectures.find(
      (lecture) => lecture.courseId !== courseId
    );
    const nextExam = state.exams.find((exam) => exam.courseId !== courseId);

    setState((current) => ({
      ...current,
      courses: current.courses.filter((item) => item.id !== courseId),
      archiveFolders: current.archiveFolders.filter(
        (folder) => folder.courseId !== courseId
      ),
      lectures: current.lectures.filter((lecture) => lecture.courseId !== courseId),
      mediaItems: current.mediaItems.filter(
        (item) => !deletedLectureIds.has(item.lectureId)
      ),
      transcripts: current.transcripts.filter(
        (transcript) => !deletedLectureIds.has(transcript.lectureId)
      ),
      concepts: current.concepts.filter(
        (concept) => !deletedLectureIds.has(concept.lectureId)
      ),
      exams: current.exams.filter((exam) => exam.courseId !== courseId),
      examItems: current.examItems.filter(
        (item) =>
          !deletedExamIds.has(item.examWorkspaceId) &&
          !deletedLectureIds.has(item.lectureId)
      ),
      studyGuides: current.studyGuides
        .filter((guide) => !deletedExamIds.has(guide.examWorkspaceId))
        .map((guide) => ({
          ...guide,
          sourceLectureIds: guide.sourceLectureIds.filter(
            (id) => !deletedLectureIds.has(id)
          ),
          figures: guide.figures?.filter(
            (figure) => !deletedLectureIds.has(figure.lectureId)
          )
        }))
    }));

    setSelectedCourseId(nextCourseId);
    setSelectedArchiveFolderId("all");
    setSelectedLectureId(nextLecture?.id || "");
    setSelectedExamId(nextExam?.id || "");
    setSelectedGuideId("");
    setBuilderCourseId(nextCourseId);
    setBuilderFolderId("all");
    setBuilderSelectedLectureIds((current) =>
      current.filter((id) => !deletedLectureIds.has(id))
    );
    setCaptureForm((current) => ({ ...current, courseId: nextCourseId }));
    setExamForm((current) => ({ ...current, courseId: nextCourseId }));
    setStatus(`Deleted ${course.code} and its related archive and review data.`);
  }

  function addArchiveFolder(event: FormEvent) {
    event.preventDefault();
    const name = archiveFolderName.trim();

    if (!name) {
      setStatus("Name the folder before adding it.");
      return;
    }

    const parentId =
      selectedArchiveFolderId === "all" || selectedArchiveFolderId === "unfiled"
        ? undefined
        : selectedArchiveFolderId;
    const folder: ArchiveFolder = {
      id: uid("folder"),
      courseId: selectedCourseId,
      parentId,
      name,
      createdAt: new Date().toISOString()
    };

    setState((current) => ({
      ...current,
      archiveFolders: [...current.archiveFolders, folder]
    }));
    setArchiveFolderName("");
    setSelectedArchiveFolderId(folder.id);
    setStatus(`Added folder "${name}".`);
  }

  function renameArchiveFolder() {
    const folder = state.archiveFolders.find(
      (item) => item.id === selectedArchiveFolderId
    );

    if (!folder) {
      setStatus("Select a folder to rename.");
      return;
    }

    if (isDefaultLectureFolder(folder)) {
      setStatus("The default Lectures folder cannot be renamed.");
      return;
    }

    const nextName = window.prompt("Rename folder", folder.name)?.trim();

    if (!nextName || nextName === folder.name) {
      return;
    }

    setState((current) => ({
      ...current,
      archiveFolders: current.archiveFolders.map((item) =>
        item.id === folder.id ? { ...item, name: nextName } : item
      )
    }));
    setStatus(`Renamed folder to "${nextName}".`);
  }

  function deleteArchiveFolder() {
    const folder = state.archiveFolders.find(
      (item) => item.id === selectedArchiveFolderId
    );

    if (!folder) {
      setStatus("Select a folder to delete.");
      return;
    }

    if (isDefaultLectureFolder(folder)) {
      setStatus("The default Lectures folder cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete folder "${folder.name}"? Lectures will stay archived and move to the parent folder.`
    );

    if (!confirmed) {
      return;
    }

    const parentId = folder.parentId;
    setState((current) => ({
      ...current,
      archiveFolders: current.archiveFolders
        .filter((item) => item.id !== folder.id)
        .map((item) =>
          item.parentId === folder.id ? { ...item, parentId } : item
        ),
      lectures: current.lectures.map((lecture) =>
        lecture.folderId === folder.id ? { ...lecture, folderId: parentId } : lecture
      )
    }));
    setSelectedArchiveFolderId(parentId || "all");
    setStatus(`Deleted folder "${folder.name}". Archive items were not deleted.`);
  }

  function deleteLectureFromArchive(lectureId: string) {
    const lecture = state.lectures.find((item) => item.id === lectureId);

    if (!lecture) {
      setStatus("Could not find that lecture in the archive.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${lecture.title}" from the archive? This removes its transcript, media, concepts, and review-set references.`
    );

    if (!confirmed) {
      return;
    }

    setState((current) => ({
      ...current,
      lectures: current.lectures.filter((item) => item.id !== lectureId),
      mediaItems: current.mediaItems.filter((item) => item.lectureId !== lectureId),
      transcripts: current.transcripts.filter(
        (item) => item.lectureId !== lectureId
      ),
      concepts: current.concepts.filter((item) => item.lectureId !== lectureId),
      examItems: current.examItems.filter((item) => item.lectureId !== lectureId),
      studyGuides: current.studyGuides.map((guide) => ({
        ...guide,
        sourceLectureIds: guide.sourceLectureIds.filter((id) => id !== lectureId),
        figures: guide.figures?.filter((figure) => figure.lectureId !== lectureId)
      }))
    }));

    if (selectedLectureId === lectureId) {
      const nextLecture = state.lectures.find((item) => item.id !== lectureId);
      setSelectedLectureId(nextLecture?.id || "");
    }

    setStatus(`Deleted "${lecture.title}" from the archive.`);
  }

  function moveLectureToFolder(lectureId: string, folderId?: string) {
    const lecture = state.lectures.find((item) => item.id === lectureId);
    const folder = folderId
      ? state.archiveFolders.find((item) => item.id === folderId)
      : undefined;

    if (!lecture) {
      setStatus("Could not find that lecture in the archive.");
      return;
    }

    if (folderId && !folder) {
      setStatus("Could not find that archive folder.");
      return;
    }

    if (folder && folder.courseId !== lecture.courseId) {
      setStatus("Archive folders can only contain lectures from the same course.");
      return;
    }

    setState((current) => ({
      ...current,
      lectures: current.lectures.map((lecture) =>
        lecture.id === lectureId ? { ...lecture, folderId } : lecture
      )
    }));
    setStatus(folderId ? "Moved lecture into archive folder." : "Moved lecture.");
  }

  async function saveCapture(event: FormEvent) {
    event.preventDefault();
    await persistCapture(false);
  }

  async function saveCaptureWithAi() {
    await persistCapture(true);
  }

  async function persistCapture(useAi: boolean) {
    const title = captureForm.title.trim() || "Untitled lecture";
    const lectureId = uid("lecture");
    const createdAt = new Date().toISOString();
    const pastedTranscript = captureForm.transcript.trim();
    const mediaItems: MediaItem[] = [];

    try {
      if (useAi) {
        setIsLectureGenerating(true);
        setStatus("Generating lecture study artifact from source media...");
      }

      for (const file of captureFiles) {
        const mediaId = uid("media");
        let storage: Pick<MediaItem, "storageBucket" | "storagePath"> = {};
        let dataUrl: string | undefined;

        try {
          storage = await uploadMediaFile({ file, lectureId, mediaId });
        } catch {
          dataUrl = await fileToMediaDataUrl(file);
        }

        mediaItems.push({
          id: mediaId,
          lectureId,
          kind: fileKind(file),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
          ...storage,
          createdAt
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read lecture source files.";
      setStatus(message);
      setIsLectureGenerating(false);
      return;
    }

    let transcriptText =
      pastedTranscript ||
      `Transcript placeholder for ${title}. Add audio transcription or paste notes here.`;
    let transcriptUsage: TokenUsage | null = null;
    let generatedBy: Transcript["generatedBy"] = pastedTranscript
      ? "manual"
      : "placeholder";
    let sourceMediaIds = mediaItems.map((item) => item.id);
    let transcribedMediaIds: string[] = [];
    let aiConcepts: ExtractedConcept[] | null = null;
    let aiSummary = "";

    if (useAi) {
      try {
        const response = await fetch("/api/lecture-ai", {
          body: JSON.stringify({
            courseName: courseLabel(captureForm.courseId),
            date: captureForm.date,
            mediaItems,
            notes: [captureForm.summary.trim(), pastedTranscript]
              .filter(Boolean)
              .join("\n\n"),
            title
          }),
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        });
        const data = (await response.json()) as {
          concepts?: Array<{
            title?: string;
            detail?: string;
            sourceMediaId?: string;
          }>;
          error?: string;
          generatedBy?: "openai";
          sourceMediaIds?: string[];
          summary?: string;
          transcribedMediaIds?: string[];
          transcriptText?: string;
          usage?: TokenUsage | null;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not generate lecture study artifact.");
        }

        transcriptText = data.transcriptText || transcriptText;
        transcriptUsage = data.usage || null;
        generatedBy = data.generatedBy || "openai";
        sourceMediaIds = data.sourceMediaIds?.length
          ? data.sourceMediaIds
          : sourceMediaIds;
        transcribedMediaIds = data.transcribedMediaIds || [];
        aiSummary = data.summary || "";
        aiConcepts =
          data.concepts?.map((concept, index) => ({
            detail: concept.detail || "No detail returned.",
            id: uid("concept"),
            lectureId,
            mediaItemId: concept.sourceMediaId,
            sourceSegmentId: `ai-concept-${index + 1}`,
            title: concept.title || `Concept ${index + 1}`
          })) || [];
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not generate lecture study artifact.";
        setStatus(message);
        setIsLectureGenerating(false);
        return;
      }
    }

    const transcript: Transcript = {
      id: uid("transcript"),
      lectureId,
      mediaItemId: mediaItems[0]?.id,
      sourceMediaIds,
      transcribedMediaIds,
      text: transcriptText,
      segments: splitTranscript(transcriptText),
      generatedBy,
      usage: transcriptUsage,
      createdAt
    };

    const existingDefaultFolderId = defaultLectureFolderId(
      state.archiveFolders,
      captureForm.courseId
    );
    const fallbackLectureFolder = existingDefaultFolderId
      ? null
      : createDefaultLectureFolder(captureForm.courseId, createdAt);
    const assignedFolderId = existingDefaultFolderId || fallbackLectureFolder?.id;

    const lecture: Lecture = {
      id: lectureId,
      courseId: captureForm.courseId,
      folderId: assignedFolderId,
      title,
      date: captureForm.date,
      summary:
        aiSummary ||
        captureForm.summary.trim() ||
        transcript.segments
          .slice(0, 2)
          .map((segment) => segment.text)
          .join(" "),
      createdAt
    };

    setState((current) => ({
      ...current,
      archiveFolders: fallbackLectureFolder
        ? [fallbackLectureFolder, ...current.archiveFolders]
        : current.archiveFolders,
      lectures: [lecture, ...current.lectures],
      mediaItems: [...mediaItems, ...current.mediaItems],
      transcripts: [transcript, ...current.transcripts],
      concepts: [
        ...(aiConcepts || extractConcepts(lectureId, transcript)),
        ...current.concepts
      ]
    }));
    setSelectedLectureId(lectureId);
    setCaptureFiles([]);
    setCaptureForm((current) => ({
      ...current,
      title: "",
      transcript: "",
      summary: ""
    }));
    setStatus(
      useAi
        ? `Generated and saved ${title} to the permanent archive.`
        : `Saved ${title} to the permanent archive.`
    );
    setIsLectureGenerating(false);
    setScreen("lecture");
  }

  function createExam(event: FormEvent) {
    event.preventDefault();
    if (!examForm.name.trim()) {
      return;
    }

    const createdAt = new Date().toISOString();
    const exam: ExamWorkspace = {
      id: uid("exam"),
      courseId: examForm.courseId,
      name: examForm.name.trim(),
      startsOn: examForm.startsOn,
      context: DEFAULT_REVIEW_CONTEXT,
      createdAt
    };

    setState((current) => ({
      ...current,
      exams: [exam, ...current.exams]
    }));
    setSelectedExamId(exam.id);
    setExamForm((current) => ({ ...current, name: "", startsOn: "" }));
    setStatus(`Created ${exam.name}. Add archive sources to the review set.`);
    setScreen("exam");
  }

  function addLectureToExam(lectureId: string, examId = selectedExamId) {
    const exam = state.exams.find((item) => item.id === examId);
    const lecture = state.lectures.find((item) => item.id === lectureId);

    if (!exam) {
      setStatus("Create a review set first.");
      return;
    }

    if (!lecture) {
      setStatus("Could not find that lecture in the archive.");
      return;
    }

    if (lecture.courseId !== exam.courseId) {
      setStatus("Review sets can only use lectures from the same course.");
      return;
    }

    const alreadyAdded = state.examItems.some(
      (item) => item.examWorkspaceId === examId && item.lectureId === lectureId
    );

    if (alreadyAdded) {
      setStatus("That lecture is already in this review set.");
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
    setStatus("Added lecture reference to the review set. Original media stayed in the archive.");
  }

  function setExamBuilderCourse(courseId: string) {
    setBuilderCourseId(courseId);
    setBuilderFolderId("all");
    setBuilderSelectedLectureIds((current) =>
      current.filter((id) =>
        state.lectures.some(
          (lecture) => lecture.id === id && lecture.courseId === courseId
        )
      )
    );
    setExamForm((current) => ({ ...current, courseId }));
  }

  function addLectureToBasket(lectureId: string) {
    const lecture = state.lectures.find((item) => item.id === lectureId);

    if (!lecture) {
      setStatus("Could not find that lecture in the archive.");
      return;
    }

    if (lecture.courseId !== builderCourseId) {
      setExamBuilderCourse(lecture.courseId);
    }

    setBuilderSelectedLectureIds((current) => {
      if (current.includes(lectureId)) {
        return current;
      }

      const sameCourseIds = current.filter((id) =>
        state.lectures.some(
          (item) => item.id === id && item.courseId === lecture.courseId
        )
      );

      return [...sameCourseIds, lectureId];
    });
    setStatus(`Added "${lecture.title}" to the review set draft.`);
  }

  function removeLectureFromBasket(lectureId: string) {
    setBuilderSelectedLectureIds((current) =>
      current.filter((id) => id !== lectureId)
    );
    setStatus("Removed source from the review set draft.");
  }

  function toggleBuilderLecture(lectureId: string) {
    if (builderSelectedLectureIds.includes(lectureId)) {
      removeLectureFromBasket(lectureId);
    } else {
      addLectureToBasket(lectureId);
    }
  }

  function addBuilderVisibleLectures() {
    setBuilderSelectedLectureIds((current) => {
      const next = new Set(current);
      for (const lecture of builderLectures) {
        next.add(lecture.id);
      }
      return Array.from(next);
    });
    setStatus("Added visible archive materials to the review set draft.");
  }

  function createWorkspaceFromBuilder(event: FormEvent) {
    event.preventDefault();

    if (!examForm.name.trim()) {
      setStatus("Name the review set before creating it.");
      return;
    }

    if (!builderSelectedLectures.length) {
      setStatus("Select archive materials before creating the review set.");
      return;
    }

    const createdAt = new Date().toISOString();
    const exam: ExamWorkspace = {
      id: uid("exam"),
      courseId: builderCourseId,
      name: examForm.name.trim(),
      startsOn: examForm.startsOn,
      context: DEFAULT_REVIEW_CONTEXT,
      createdAt
    };

    setState((current) => ({
      ...current,
      exams: [exam, ...current.exams],
      examItems: [
        ...builderSelectedLectures.map((lecture) => ({
          id: uid("exam-item"),
          examWorkspaceId: exam.id,
          lectureId: lecture.id,
          addedAt: createdAt
        })),
        ...current.examItems
      ]
    }));
    setSelectedExamId(exam.id);
    setExamForm((current) => ({ ...current, name: "", startsOn: "" }));
    setBuilderSelectedLectureIds([]);
    setStatus(`Created ${exam.name} with ${builderSelectedLectures.length} archive source${builderSelectedLectures.length === 1 ? "" : "s"}.`);
    setScreen("exam");
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
    setStatus("Removed from review set. Archive item was not changed.");
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

    const sourceLectureIds = selectedExamLectures.map((lecture) => lecture.id);
    const selectedTranscripts = state.transcripts.filter((transcript) =>
      sourceLectureIds.includes(transcript.lectureId)
    );

    if (!selectedTranscripts.length) {
      setStatus("Add at least one lecture transcript before generating an AI review.");
      return;
    }

    setIsReviewGenerating(true);
    setStatus("Generating AI review from selected review-set materials...");
    const submittedContext = reviewContext.trim();

    const selectedConcepts = state.concepts.filter((concept) =>
      sourceLectureIds.includes(concept.lectureId)
    );
    const selectedMediaItems = state.mediaItems.filter((item) =>
      sourceLectureIds.includes(item.lectureId)
    );
    const reviewMediaItems = selectedMediaItems.map((item) =>
      item.kind === "image" && embeddedDataUrlForMedia(item)
        ? { ...item, dataUrl: embeddedDataUrlForMedia(item) }
        : item
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
          instructions: submittedContext,
          lectures: selectedExamLectures,
          transcripts: selectedTranscripts,
          concepts: selectedConcepts,
          mediaItems: reviewMediaItems
        })
      });
      const data = (await response.json()) as {
        text?: string;
        figures?: ReviewFigure[];
        usage?: TokenUsage | null;
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
          : buildReviewFigures(selectedExamLectures, reviewMediaItems),
        instructions: submittedContext,
        generatedBy: data.generatedBy || "openai",
        usage: data.usage || null,
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
          : `AI review generated from selected review-set materials${
              formatTokenUsage(data.usage) ? ` (${formatTokenUsage(data.usage)})` : ""
            }.`
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
      const guideFiguresHaveImages = Boolean(
        guide.figures?.some((figure) => figure.dataUrl)
      );
      const figures = guideFiguresHaveImages
        ? guide.figures || []
        : currentFigures.length
          ? currentFigures
          : guide.figures || [];
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
      setStatus(`PDF download failed: ${message}`);
    } finally {
      setIsReviewGenerating(false);
    }
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

  function selectArchiveCourse(courseId: string) {
    const nextLectures = archiveLecturesForLocation(state, courseId, "all");

    setSelectedCourseId(courseId);
    setSelectedArchiveFolderId("all");
    setSelectedLectureId(nextLectures[0]?.id || "");
  }

  function selectArchiveFolder(folderId: string) {
    const folder = state.archiveFolders.find((item) => item.id === folderId);
    const courseId = folder?.courseId || selectedCourseId;
    const nextLectures = archiveLecturesForLocation(state, courseId, folderId);

    if (folder) {
      setSelectedCourseId(folder.courseId);
    }

    setSelectedArchiveFolderId(folderId);
    setSelectedLectureId(nextLectures[0]?.id || "");
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      credentials: "include",
      method: "POST"
    });
    setAuthStatus("locked");
  }

  if (authStatus === "checking") {
    return <AuthShell title="Checking access..." />;
  }

  if (authStatus === "setup") {
    return (
      <AuthShell
        title="Set an app password"
        message="LECTUREVAULT_APP_PASSWORD is not configured. Add it to Vercel environment variables so this app can protect your OpenAI API key."
      />
    );
  }

  if (authStatus === "locked") {
    return <LoginGate onAuthenticated={() => setAuthStatus("ready")} />;
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
            ["capture", "New Lecture"],
            ["archive", "Vault"],
            ["builder", "Reviews"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={
                id === "builder" &&
                ["builder", "exams", "exam", "guide"].includes(screen)
                  ? "active"
                  : screen === id
                    ? "active"
                    : ""
              }
              type="button"
              onClick={() => setScreen(id as Screen)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>{state.lectures.length}</strong> archived items
          <span>{state.exams.length} review sets</span>
          <span>
            {cloudSyncEnabled
              ? cloudUpdatedAt
                ? `Supabase synced ${new Date(cloudUpdatedAt).toLocaleTimeString()}`
                : "Supabase sync ready"
              : cloudStateLoaded
                ? "Browser-only storage"
                : "Checking sync"}
          </span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{selectedCourse?.term || "Local-first MVP"}</p>
            <h2>{screenTitle(screen)}</h2>
          </div>
          <div className="topbar-actions">
            <button
              className={basketCount ? "cart-button active" : "cart-button"}
              type="button"
              onClick={() => setScreen("builder")}
              aria-label={`Review set draft with ${basketCount} selected source${basketCount === 1 ? "" : "s"}`}
            >
              <span className="cart-icon" aria-hidden="true">Review</span>
              <strong>{basketCount}</strong>
            </button>
            <button type="button" onClick={() => setScreen("capture")}>
              New Lecture
            </button>
            <button type="button" onClick={() => void logout()}>
              Log out
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
                <div
                  className="row-card"
                  key={course.id}
                >
                  <div>
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
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setScreen("archive");
                      }}
                    >
                      Open archive
                    </button>
                    <button
                      className="danger"
                      type="button"
                      onClick={() => deleteCourse(course.id)}
                    >
                      Delete course
                    </button>
                  </div>
                </div>
              ))}
              {!state.courses.length ? (
                <p className="empty">No courses yet. Add a course to start archiving lectures.</p>
              ) : null}
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
                onChange={(event) => selectArchiveCourse(event.target.value)}
              >
                {state.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="archive-organizer">
              <aside className="panel archive-folder-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">Folders</span>
                    <h3>Archive Tree</h3>
                  </div>
                </div>
                <form className="folder-form" onSubmit={addArchiveFolder}>
                  <input
                    value={archiveFolderName}
                    onChange={(event) => setArchiveFolderName(event.target.value)}
                    placeholder={
                      selectedArchiveFolderId === "all" ||
                      selectedArchiveFolderId === "unfiled"
                        ? "New folder"
                        : "New subfolder"
                    }
                  />
                  <button type="submit">Add</button>
                </form>
                <div className="folder-actions">
                  <button
                    type="button"
                    onClick={renameArchiveFolder}
                    disabled={
                      selectedArchiveFolderId === "all" ||
                      selectedArchiveFolderId === "unfiled" ||
                      isDefaultLectureFolder(selectedArchiveFolder)
                    }
                  >
                    Rename
                  </button>
                  <button
                    className="danger"
                    type="button"
                    onClick={deleteArchiveFolder}
                    disabled={
                      selectedArchiveFolderId === "all" ||
                      selectedArchiveFolderId === "unfiled" ||
                      isDefaultLectureFolder(selectedArchiveFolder)
                    }
                  >
                    Delete
                  </button>
                </div>
                <ArchiveFolderTree
                  courses={state.courses}
                  folders={state.archiveFolders}
                  lectures={state.lectures}
                  selectedCourseId={selectedCourseId}
                  selectedFolderId={selectedArchiveFolderId}
                  onSelectCourse={selectArchiveCourse}
                  onSelectFolder={selectArchiveFolder}
                  onDropLecture={moveLectureToFolder}
                />
              </aside>

              <section className="archive-list-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">
                      {archiveLectures.length} item
                      {archiveLectures.length === 1 ? "" : "s"}
                    </span>
                    <h3>Folder Contents</h3>
                  </div>
                </div>
                <div className="lecture-grid compact">
                  {archiveLectures.map((lecture) => (
                    <LectureCard
                      key={lecture.id}
                      lecture={lecture}
                      courseLabel={courseLabel}
                      compact
                      selected={selectedLectureId === lecture.id}
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
                      onSelect={() => setSelectedLectureId(lecture.id)}
                      onOpen={() => {
                        setSelectedLectureId(lecture.id);
                        setScreen("lecture");
                      }}
                      onAdd={() => addLectureToBasket(lecture.id)}
                      onDelete={() => deleteLectureFromArchive(lecture.id)}
                    />
                  ))}
                  {!archiveLectures.length ? (
                    <p className="empty panel">
                      No lectures in this folder yet. Drag archive cards into
                      folders to organize them.
                    </p>
                  ) : null}
                </div>
              </section>

              <aside className="panel side-panel">
                <h3>Selected Lecture</h3>
                {selectedArchiveLecture ? (
                  <>
                    <strong>{selectedArchiveLecture.title}</strong>
                    <span>{courseLabel(selectedArchiveLecture.courseId)}</span>
                    <small>{selectedArchiveLecture.date}</small>
                    <p>
                      <MathPreview text={selectedArchiveLecture.summary} />
                    </p>
                    <div className="button-row stacked">
                      <button
                        type="button"
                        onClick={() => addLectureToBasket(selectedArchiveLecture.id)}
                      >
                        Add to Review
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLectureId(selectedArchiveLecture.id);
                          setScreen("lecture");
                        }}
                      >
                        Open detail
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => deleteLectureFromArchive(selectedArchiveLecture.id)}
                      >
                        Delete archive item
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="empty">Select an archive item to inspect it.</p>
                )}
              </aside>
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
          <form className="capture panel capture-workflow" onSubmit={saveCapture}>
            <div className="capture-hero">
              <div>
                <span className="eyebrow">New Lecture</span>
                <h3>Upload an MP3 lecture into the vault</h3>
                <p>
                  Add lecture audio first, attach board photos when useful,
                  then save a searchable lecture record for exam review.
                </p>
              </div>
              <div className="capture-steps" aria-label="Capture workflow">
                <span>1 Details</span>
                <span>2 Media</span>
                <span>3 Notes</span>
                <span>4 Save</span>
              </div>
            </div>
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
              className="dropzone lecture-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addCaptureFiles(Array.from(event.dataTransfer.files || []));
              }}
            >
              <span>Lecture source files</span>
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
                  : "Drop or choose an MP3 lecture"}
              </strong>
              <small>
                MP3 and other audio/video files are the main input. Add board
                photos, PDFs, or notes in the same lecture record when needed.
              </small>
            </label>

            {captureFiles.length ? (
              <div className="capture-media-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">Vault Sources</span>
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
                placeholder="Paste transcript text or rough notes. If you only attach an MP3 for now, the lecture is still saved as an archive item."
              />
            </label>

            <label>
              Summary / board context
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
              <button
                className="primary"
                type="button"
                onClick={() => void saveCaptureWithAi()}
                disabled={
                  isLectureGenerating ||
                  (!captureFiles.length &&
                    !captureForm.transcript.trim() &&
                    !captureForm.summary.trim())
                }
              >
                {isLectureGenerating ? "Working..." : "Generate AI Lecture"}
              </button>
              <button type="submit" disabled={isLectureGenerating}>
                Save to Vault
              </button>
              <button
                type="button"
                disabled={isLectureGenerating}
                onClick={() =>
                  setCaptureForm((current) => ({
                    ...current,
                    transcript:
                      current.transcript ||
                      "Today we introduced the main definition, worked through an example, and identified common exam mistakes. Use inline math like $F=ma$ or display math like $$E=mc^2$$ when formulas matter."
                  }))
                }
              >
                Draft Transcript
              </button>
            </div>
          </form>
        ) : null}

        {screen === "builder" ? (
          <section className="exam-builder-layout">
            <aside className="panel archive-folder-panel">
              <div className="section-heading">
                <div>
                  <span className="pill">Archive</span>
                  <h3>Shop by Course</h3>
                </div>
              </div>
              <label>
                Course
                <select
                  value={builderCourseId}
                  onChange={(event) => setExamBuilderCourse(event.target.value)}
                >
                  {state.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <ArchiveFolderTree
                courses={state.courses.filter(
                  (course) => course.id === builderCourseId
                )}
                folders={state.archiveFolders}
                lectures={state.lectures}
                selectedCourseId={builderCourseId}
                selectedFolderId={builderFolderId}
                onSelectCourse={setExamBuilderCourse}
                onSelectFolder={setBuilderFolderId}
                onDropLecture={() => undefined}
              />
            </aside>

            <section className="archive-list-panel">
              <div className="toolbar">
                <label>
                  Search selected course materials
                  <input
                    value={builderQuery}
                    onChange={(event) => setBuilderQuery(event.target.value)}
                    placeholder="Lecture, formula, media name, transcript..."
                  />
                </label>
                <button
                  type="button"
                  onClick={addBuilderVisibleLectures}
                  disabled={!builderLectures.length}
                >
                  Add visible sources
                </button>
              </div>
              <div className="lecture-grid compact">
                {builderLectures.map((lecture) => {
                  const selected = builderSelectedLectureIds.includes(lecture.id);

                  return (
                    <LectureCard
                      key={lecture.id}
                      lecture={lecture}
                      courseLabel={courseLabel}
                      compact
                      selected={selected}
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
                      addLabel={selected ? "Selected" : "Add to Review"}
                      addPrimary={selected}
                      onSelect={() => toggleBuilderLecture(lecture.id)}
                      onOpen={() => {
                        setSelectedLectureId(lecture.id);
                        setScreen("lecture");
                      }}
                      onAdd={() => toggleBuilderLecture(lecture.id)}
                    />
                  );
                })}
                {!builderLectures.length ? (
                  <p className="empty panel">
                    No archive materials match this course, folder, and search.
                  </p>
                ) : null}
              </div>
            </section>

            <aside className="panel side-panel source-inspector">
              <form onSubmit={createWorkspaceFromBuilder}>
                <div className="section-heading">
                  <div>
                    <span className="pill">
                      {builderSelectedLectures.length} selected
                    </span>
                    <h3>Review Set Draft</h3>
                  </div>
                </div>
                <label>
                  Review set name
                  <input
                    value={examForm.name}
                    onChange={(event) =>
                      setExamForm((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    placeholder="Exam 1, Midterm, Final"
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
                <div className="source-list">
                  {builderSelectedLectures.map((lecture) => (
                    <div className="source-card" key={lecture.id}>
                      <strong>{lecture.title}</strong>
                      <span>{lecture.date}</span>
                      <button
                        type="button"
                        onClick={() => toggleBuilderLecture(lecture.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!builderSelectedLectures.length ? (
                    <p className="empty">
                      Select archived lectures to build this review set.
                    </p>
                  ) : null}
                </div>
                <div className="button-row stacked">
                  <button
                    className="primary"
                    type="submit"
                    disabled={
                      !examForm.name.trim() || !builderSelectedLectures.length
                    }
                  >
                    Create Review Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuilderSelectedLectureIds([])}
                    disabled={!builderSelectedLectureIds.length}
                  >
                    Clear Selection
                  </button>
                </div>
                <div className="review-action-preview">
                  <h3>Review Actions</h3>
                  <div className="button-row stacked">
                    <button type="button" disabled>
                      Generate AI Review
                    </button>
                    <button type="button" disabled>
                      Download Review PDF
                    </button>
                  </div>
                </div>
              </form>
              <div className="saved-review-sets">
                <h3>Saved Review Sets</h3>
                <div className="source-list">
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
                        selected source
                        {state.examItems.filter(
                          (item) => item.examWorkspaceId === exam.id
                        ).length === 1
                          ? ""
                          : "s"}
                      </small>
                    </button>
                  ))}
                  {!state.exams.length ? (
                    <p className="empty">Created review sets will appear here.</p>
                  ) : null}
                </div>
              </div>
            </aside>
          </section>
        ) : null}

        {screen === "exams" ? (
          <section className="content-grid">
            <form className="panel form-panel" onSubmit={createExam}>
              <h3>Create Empty Review Set</h3>
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
                Review set name
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
                Create Review Set
              </button>
            </form>

            <section className="panel list-panel">
              <h3>Review Sets</h3>
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
            instructions={reviewContext}
            isGenerating={isReviewGenerating}
            courseLabel={courseLabel}
            onInstructionsChange={updateSelectedReviewContext}
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
    archive: "Vault",
    lecture: "Lecture detail",
    capture: "New lecture",
    builder: "Reviews",
    exams: "Review sets",
    exam: "Review set",
    guide: "Study guide preview"
  };
  return titles[screen];
}

function AuthShell({
  title,
  message = "Loading LectureVault."
}: {
  title: string;
  message?: string;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="mark">LV</div>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function LoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ password }),
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Could not sign in.");
      }

      setPassword("");
      onAuthenticated();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={login}>
        <div className="mark">LV</div>
        <h1>LectureVault</h1>
        <p>
          Enter the app password to use the lecture archive, review sets, AI
          review generation, and PDF download.
        </p>
        <label>
          App password
          <input
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
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
          <span>Review sets</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel action-panel capture-action">
          <div className="section-heading">
            <div>
              <span className="eyebrow">New Lecture</span>
              <h3>Transcribe an MP3 lecture</h3>
            </div>
            <button className="primary" type="button" onClick={() => setScreen("capture")}>
              Add Lecture
            </button>
          </div>
          <p>
            Start with audio, add board photos or rough notes, then save the
            lecture into the permanent vault.
          </p>
        </section>

        <section className="panel action-panel basket-action">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Reviews</span>
              <h3>Build from saved lectures</h3>
            </div>
            <button type="button" onClick={() => setScreen("builder")}>
              Create Review Set
            </button>
          </div>
          <p>
            Select archived lecture sources, create a review set, and
            generate one focused AI review with PDF export.
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
          <h3>Review Sets</h3>
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

function ArchiveFolderTree({
  courses,
  folders,
  lectures,
  selectedCourseId,
  selectedFolderId,
  onSelectCourse,
  onSelectFolder,
  onDropLecture
}: {
  courses: Course[];
  folders: ArchiveFolder[];
  lectures: Lecture[];
  selectedCourseId: string;
  selectedFolderId: string;
  onSelectCourse: (courseId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onDropLecture: (lectureId: string, folderId?: string) => void;
}) {
  function allowDrop(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropOnFolder(event: DragEvent, folderId?: string) {
    event.preventDefault();
    const lectureId = event.dataTransfer.getData("text/lecture-id");

    if (lectureId) {
      onDropLecture(lectureId, folderId);
    }
  }

  function dropOnCourseDefault(event: DragEvent, courseId: string) {
    event.preventDefault();
    const lectureId = event.dataTransfer.getData("text/lecture-id");
    const lecture = lectures.find((item) => item.id === lectureId);
    const folderId = defaultLectureFolderId(folders, courseId);

    if (lecture?.courseId === courseId && folderId) {
      onDropLecture(lectureId, folderId);
    }
  }

  function renderFolder(folder: ArchiveFolder, depth = 0) {
    const courseFolders = folders.filter((item) => item.courseId === folder.courseId);
    const childFolders = courseFolders
      .filter((item) => item.parentId === folder.id && !isLegacyUnfiledFolder(item))
      .sort(compareArchiveFolders);
    const count = folderLectureCount(folders, lectures, folder.id);

    return (
      <details className="folder-node" key={folder.id} open>
        <summary
          className={
            selectedCourseId === folder.courseId && selectedFolderId === folder.id
              ? "active"
              : ""
          }
          style={{ "--tree-depth": depth } as CSSProperties}
          onClick={() => onSelectFolder(folder.id)}
          onDragOver={allowDrop}
          onDrop={(event) => dropOnFolder(event, folder.id)}
        >
          <span className="folder-icon" aria-hidden="true" />
          <span>{folder.name}</span>
          <small>{count}</small>
        </summary>
        {childFolders.length ? (
          <div className="folder-children">
            {childFolders.map((child) => renderFolder(child, depth + 1))}
          </div>
        ) : null}
      </details>
    );
  }

  return (
    <div className="archive-folder-tree">
      {courses.map((course) => {
        const courseLectures = lectures.filter(
          (lecture) => lecture.courseId === course.id
        );
        const courseFolders = folders.filter(
          (folder) => folder.courseId === course.id
        );
        const rootFolders = courseFolders
          .filter((folder) => !folder.parentId && !isLegacyUnfiledFolder(folder))
          .sort(compareArchiveFolders);
        return (
          <details className="course-folder-group" key={course.id} open>
            <summary
              className={
                selectedCourseId === course.id && selectedFolderId === "all"
                  ? "active course-node"
                  : "course-node"
              }
              onClick={() => onSelectCourse(course.id)}
              onDragOver={allowDrop}
              onDrop={(event) => dropOnCourseDefault(event, course.id)}
            >
              <span className="folder-icon" aria-hidden="true" />
              <span>
                {course.code} {course.name}
              </span>
              <small aria-hidden="true" />
            </summary>
            <div className="folder-children">
              {rootFolders.map((folder) => renderFolder(folder))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function LectureCard({
  lecture,
  courseLabel,
  mediaCount,
  conceptCount,
  compact = false,
  selected = false,
  addLabel = "Add to Review",
  addPrimary = false,
  onSelect,
  onOpen,
  onAdd,
  onDelete
}: {
  lecture: Lecture;
  courseLabel: (id: string) => string;
  mediaCount: number;
  conceptCount: number;
  compact?: boolean;
  selected?: boolean;
  addLabel?: string;
  addPrimary?: boolean;
  onSelect?: () => void;
  onOpen: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
}) {
  const classes = [
    "lecture-card",
    compact ? "compact-card" : "",
    selected ? "selected" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      draggable
      onClick={onSelect}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/lecture-id", lecture.id)
      }
    >
      <div>
        <span className="pill">{courseLabel(lecture.courseId)}</span>
        <h3>{lecture.title}</h3>
        <p>
          <MathPreview text={lecture.summary} />
        </p>
      </div>
      <div className="card-meta">
        <span>{lecture.date}</span>
        <span>{mediaCount} media</span>
        <span>{conceptCount} concepts</span>
      </div>
      <div className="button-row" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onOpen}>
          Open
        </button>
        {onAdd ? (
          <button
            className={addPrimary ? "primary" : ""}
            type="button"
            onClick={onAdd}
          >
            {addLabel}
          </button>
        ) : null}
        {onDelete ? (
          <button className="danger" type="button" onClick={onDelete}>
            Delete
          </button>
        ) : null}
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
  const matchingExams = useMemo(
    () => exams.filter((exam) => exam.courseId === lecture.courseId),
    [exams, lecture.courseId]
  );
  const [targetExamId, setTargetExamId] = useState(matchingExams[0]?.id || "");

  useEffect(() => {
    setTargetExamId(matchingExams[0]?.id || "");
  }, [matchingExams]);

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
        <p>
          <MathPreview text={lecture.summary} />
        </p>

        <section className="usage-panel" aria-label="Transcription usage">
          <div>
            <h4>Transcription Usage</h4>
            <p>{transcriptUsageLabel(transcript)}</p>
          </div>
          {transcript?.sourceMediaIds?.length ? (
            <div className="usage-source-list">
              <h4>Source Media Used</h4>
              {transcript.sourceMediaIds.map((mediaId) => {
                const item = mediaItems.find((entry) => entry.id === mediaId);
                const wasTranscribed = transcript.transcribedMediaIds?.includes(mediaId);

                return (
                  <span key={mediaId}>
                    {item?.name || mediaId}
                    {wasTranscribed ? " - transcribed" : ""}
                  </span>
                );
              })}
            </div>
          ) : null}
        </section>

        <h4>Transcript</h4>
        <div className="transcript-box">
          {transcript?.segments.map((segment) => (
            <p key={segment.id}>
              <a href={`#${segment.id}`}>
                {formatSeconds(segment.startSeconds)}
              </a>{" "}
              <MathPreview text={segment.text} />
            </p>
          )) || "No transcript yet."}
        </div>
        <h4>KaTeX Preview</h4>
        <div className="math-preview-panel">
          <MathPreview
            text={
              transcript?.text ||
              lecture.summary ||
              "No transcript or summary math to preview."
            }
          />
        </div>
      </article>

      <aside className="panel side-panel">
        <h3>Add to Review Set</h3>
        <select
          value={targetExamId}
          onChange={(event) => setTargetExamId(event.target.value)}
        >
          {matchingExams.map((exam) => (
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
        {!matchingExams.length ? (
          <p className="empty">
            Create a review set for this course before adding references.
          </p>
        ) : null}

        <h3>Media</h3>
        <div className="media-list">
          {mediaItems.map((item) => {
            const sourceUrl = mediaStorageUrl(item);

            return (
              <div key={item.id} className="media-item">
                <strong>{item.name}</strong>
                <span>
                  {item.kind} - {(item.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {item.storagePath ? <span>Stored in Supabase</span> : null}
                {item.kind === "image" && sourceUrl ? (
                  <img src={sourceUrl} alt={item.name} />
                ) : null}
                {item.kind === "audio" && sourceUrl ? (
                  <audio src={sourceUrl} controls />
                ) : null}
                {item.kind === "video" && sourceUrl ? (
                  <video src={sourceUrl} controls />
                ) : null}
              </div>
            );
          })}
        </div>

        <h3>Extracted Concepts</h3>
        <div className="concept-list">
          {concepts.map((concept) => (
            <div key={concept.id}>
              <strong>
                <MathPreview text={concept.title} />
              </strong>
              <p>
                <MathPreview text={concept.detail} />
              </p>
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
  const reviewUsage = formatTokenUsage(selectedGuide?.usage);

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
          Drag lectures from the file explorer into this review set. Items here
          are references to the archive, so removing them does not delete
          original media.
        </p>

        <div className="workflow-steps" aria-label="Exam review workflow">
          {[
            { number: "1", label: "Select sources", complete: lectures.length > 0 },
            {
              number: "2",
              label: "Add AI context",
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
                Remove from review
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

        <section className="usage-panel" aria-label="Review generation usage">
          <div>
            <h4>Review Generation Usage</h4>
            <p>
              {reviewUsage
                ? `AI review usage: ${reviewUsage}`
                : selectedGuide
                  ? "Review generated without token usage returned."
                  : "No review-generation usage yet. Usage appears after Generate AI Review runs."}
            </p>
          </div>
        </section>

        <label className="exam-instructions">
          AI context before submission
          <textarea
            value={instructions}
            onChange={(event) => onInstructionsChange(event.target.value)}
            rows={4}
            placeholder="Example: focus on formulas from chapters 4-6, emphasize worked examples, assume the exam is closed-note, and flag common unit mistakes."
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
            <ReviewMarkdownPreview compact text={selectedGuide.content} />
          </section>
        ) : null}

        <div className="button-row">
          <button
            className="primary"
            type="button"
            onClick={() => void onGenerate()}
            disabled={isGenerating || !lectures.length || !selectedTranscriptCount}
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
            Delete Review Set
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
            Sources added to the review set will appear here.
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
        {guide.usage ? (
          <div className="token-usage">
            AI token usage: {formatTokenUsage(guide.usage)}
          </div>
        ) : null}
        {guide.instructions ? (
          <section className="usage-panel" aria-label="Submitted AI context">
            <div>
              <h4>Submitted AI Context</h4>
              <p>{guide.instructions}</p>
            </div>
          </section>
        ) : null}
        <ReviewMarkdownPreview text={guide.content} />
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
