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
import JSZip from "jszip";
import katex from "katex";
import { BookOpen, FilePlus2, FolderOpen, Trash2 } from "lucide-react";
import {
  LECTURE_AI_INSTRUCTIONS,
  LECTURE_AI_OUTPUT_CONTRACT
} from "../lib/lecture-ai-context";

type Screen =
  | "dashboard"
  | "courses"
  | "archive"
  | "lecture"
  | "capture"
  | "storage"
  | "builder"
  | "exams"
  | "exam";

type Course = {
  id: string;
  code: string;
  name: string;
  term: string;
  studyProfile?: string;
  syllabus?: CourseSyllabus;
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
  sourceRole?: string;
  sourceCaption?: string;
  createdAt: string;
};

type ArchiveSortKey = "name" | "date" | "size";
type SortDirection = "asc" | "desc";
type MediaSortKey = "name" | "date" | "size";

type CaptureSource = {
  file: File;
  role: string;
  caption: string;
  size?: number;
  storageBucket?: string;
  storagePath?: string;
};

type ClassDayDraft = {
  id: string;
  courseId: string;
  title: string;
  date: string;
  transcript: string;
  objective: string;
  emphasis: string;
  questions: string;
  sources: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    role: string;
    caption: string;
    storageBucket?: string;
    storagePath?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type SharedPwaSource = {
  id: string;
  mimeType: string;
  name: string;
  size: number;
  storageBucket: string;
  storagePath: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type OneNoteSource = {
  id: string;
  pageId: string;
  title: string;
  text: string;
  notebookName: string;
  sectionName: string;
  webUrl?: string;
  importedAt: string;
};

type OneNoteLibraryItem = {
  kind?: "notebook" | "sectionGroup" | "section" | "page";
  id: string;
  displayName?: string;
  title?: string;
  links?: { oneNoteWebUrl?: { href?: string } };
};

type OneNoteTrail = {
  notebookName: string;
  sectionName: string;
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
  oneNoteSources?: OneNoteSource[];
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

type PipelineStep = {
  detail?: string;
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
};

type ReviewFigure = {
  label: string;
  lectureId: string;
  lectureTitle: string;
  name: string;
  dataUrl?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
};

type SupabaseStorageFile = {
  createdAt?: string;
  mimeType?: string;
  name: string;
  path: string;
  size?: number;
  updatedAt?: string;
};

type MediaLibraryFolder = {
  id: string;
  parentId?: string;
  name: string;
  createdAt: string;
};

type MediaLibraryPlacement = {
  storagePath: string;
  folderId: string;
};

type CourseTextbook = {
  id: string;
  courseId: string;
  name: string;
  mimeType: string;
  size: number;
  storageBucket?: string;
  storagePath?: string;
  pageCount?: number;
  chunkCount: number;
  indexedChunkCount?: number;
  embeddingUsage?: TokenUsage | null;
  createdAt: string;
};

type CourseSyllabus = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storageBucket?: string;
  storagePath?: string;
  createdAt: string;
};

type TextbookChunk = {
  id: string;
  textbookId: string;
  pageStart: number;
  pageEnd: number;
  text: string;
};

type VaultState = {
  courses: Course[];
  archiveFolders: ArchiveFolder[];
  lectures: Lecture[];
  mediaItems: MediaItem[];
  mediaLibraryFolders: MediaLibraryFolder[];
  mediaLibraryPlacements: MediaLibraryPlacement[];
  textbooks: CourseTextbook[];
  textbookChunks: TextbookChunk[];
  transcripts: Transcript[];
  concepts: ExtractedConcept[];
  exams: ExamWorkspace[];
  examItems: ExamWorkspaceItem[];
  studyGuides: StudyGuide[];
  reconstructionDrafts: ClassDayDraft[];
};

const STORAGE_KEY = "lecturevault-state-v1";
const DEFAULT_LECTURES_FOLDER_NAME = "Lectures";
const LEGACY_UNFILED_FOLDER_NAME = "Unfiled";
const PRO_MEDIA_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;
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
  mediaLibraryFolders: [],
  mediaLibraryPlacements: [],
  textbooks: [],
  textbookChunks: [],
  transcripts: [],
  concepts: [],
  exams: [],
  examItems: [],
  studyGuides: [],
  reconstructionDrafts: []
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

function defaultSourceRole(file: File) {
  switch (fileKind(file)) {
    case "audio":
      return "Lecture audio";
    case "video":
      return "Lecture recording";
    case "image":
      return "Board work";
    default:
      return "Reference handout";
  }
}

function sourceRoleDescription(role: string) {
  const descriptions: Record<string, string> = {
    "Lecture audio": "the spoken class explanation and pacing",
    "Lecture recording": "the audiovisual lecture sequence",
    "Board work": "handwritten formulas, diagrams, and board annotations",
    "Worked example": "the problem setup, solution steps, and result",
    "OneNote export": "the original handwritten page layout, formulas, and diagrams",
    "Reference handout": "supporting definitions, instructions, or reference material",
    "Other context": "additional background that helps explain this class day"
  };
  return descriptions[role] || descriptions["Other context"];
}

function fileKey(file: File) {
  return [file.name, file.size, file.lastModified].join("-");
}

const PWA_SHARE_DATABASE = "lecturevault-pwa-share";
const PWA_SHARE_STORE = "pending-sources";

async function takeSharedPwaSources(): Promise<SharedPwaSource[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PWA_SHARE_DATABASE, 1);

    request.onerror = () => reject(request.error || new Error("Could not open shared sources."));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PWA_SHARE_STORE)) {
        request.result.createObjectStore(PWA_SHARE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(PWA_SHARE_STORE, "readwrite");
      const store = transaction.objectStore(PWA_SHARE_STORE);
      const getAll = store.getAll();

      getAll.onerror = () => {
        database.close();
        reject(getAll.error || new Error("Could not read shared sources."));
      };
      getAll.onsuccess = () => {
        const sources = (getAll.result || []) as SharedPwaSource[];
        store.clear();
        transaction.oncomplete = () => {
          database.close();
          resolve(sources);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error("Could not clear imported shared sources."));
        };
      };
    };
  });
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(1)} GB`;
  }

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

function formatCompactTokenUsage(usage?: TokenUsage | null) {
  if (!usageHasTokens(usage)) {
    return "None";
  }

  const total =
    usage?.total_tokens ||
    (usage?.input_tokens || 0) + (usage?.output_tokens || 0);

  return `${total.toLocaleString()} tokens`;
}

function addTokenUsage(first?: TokenUsage | null, second?: TokenUsage | null): TokenUsage {
  return {
    input_tokens:
      ((first?.input_tokens || 0) + (second?.input_tokens || 0)) || undefined,
    output_tokens:
      ((first?.output_tokens || 0) + (second?.output_tokens || 0)) || undefined,
    total_tokens:
      ((first?.total_tokens || 0) + (second?.total_tokens || 0)) || undefined
  };
}

function usageHasTokens(usage?: TokenUsage | null) {
  return Boolean(
    usage &&
      (usage.input_tokens || usage.output_tokens || usage.total_tokens)
  );
}

function keywordSet(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4)
  );
}

function relevantTextbookChunks({
  chunks,
  limit = 8,
  query,
  textbooks
}: {
  chunks: TextbookChunk[];
  limit?: number;
  query: string;
  textbooks: CourseTextbook[];
}) {
  const keywords = keywordSet(query);
  const textbookById = new Map(textbooks.map((textbook) => [textbook.id, textbook]));

  return chunks
    .map((chunk) => {
      const chunkText = chunk.text.toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        if (chunkText.includes(keyword)) {
          score += keyword.length > 7 ? 2 : 1;
        }
      }

      return {
        ...chunk,
        score,
        textbookName: textbookById.get(chunk.textbookId)?.name || "Course textbook"
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...chunk }) => chunk);
}

function transcriptUsageLabel(transcript?: Transcript) {
  if (!transcript) {
    return "No transcript saved yet.";
  }

  const usage = formatTokenUsage(transcript.usage);

  if (usage) {
    return `AI reconstruction usage: ${usage}`;
  }

  if (transcript.generatedBy === "placeholder") {
    return "No AI reconstruction usage recorded. This item is using placeholder text.";
  }

  if (transcript.generatedBy === "openai") {
    return "AI reconstruction completed, but token usage was not returned.";
  }

  return "No AI reconstruction usage recorded. Text was pasted or saved manually.";
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

function storageObjectUrl(path: string, bucket?: string) {
  const params = new URLSearchParams({ path });

  if (bucket) {
    params.set("bucket", bucket);
  }

  return `/api/media/read?${params.toString()}`;
}

function safePackageName(value: string, fallback = "lecturevault") {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || fallback
  );
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
        dataUrl: embeddedDataUrlForMedia(item),
        mimeType: item.mimeType,
        storageBucket: item.storageBucket,
        storagePath: item.storagePath
      };
    });
}

function stripLargeFigureDataUrls(figures: ReviewFigure[]) {
  return figures.map((figure) => {
    if (figure.storagePath) {
      const { dataUrl, ...withoutInlineData } = figure;
      return withoutInlineData;
    }

    return figure.dataUrl && figure.dataUrl.length > 450000
      ? { ...figure, dataUrl: undefined }
      : figure;
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

function mediaFolderDescendantIds(folders: MediaLibraryFolder[], folderId: string) {
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
    mediaLibraryFolders: state.mediaLibraryFolders,
    mediaLibraryPlacements: state.mediaLibraryPlacements,
    textbooks: state.textbooks,
    textbookChunks: state.textbookChunks,
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
  const signedResponse = await fetch("/api/media/signed-upload", {
    body: JSON.stringify({
      fileName: file.name,
      lectureId,
      mediaId
    }),
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const signedData = (await signedResponse.json()) as {
    bucket?: string;
    error?: string;
    path?: string;
    signedUrl?: string;
  };

  if (signedResponse.ok && signedData.path && signedData.signedUrl) {
    const uploadBody = new FormData();
    uploadBody.append("cacheControl", "3600");
    uploadBody.append("", file);

    const directUpload = await fetch(signedData.signedUrl, {
      body: uploadBody,
      method: "PUT"
    });

    if (!directUpload.ok) {
      throw new Error(`Could not upload ${file.name} directly to Supabase.`);
    }

    return {
      storageBucket: signedData.bucket,
      storagePath: signedData.path
    };
  }

  if (file.size > 4 * 1024 * 1024) {
    throw new Error(
      signedData.error || `Could not create a direct Supabase upload for ${file.name}.`
    );
  }

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
        : [],
      mediaLibraryFolders: Array.isArray(parsed.mediaLibraryFolders)
        ? parsed.mediaLibraryFolders
        : [],
      mediaLibraryPlacements: Array.isArray(parsed.mediaLibraryPlacements)
        ? parsed.mediaLibraryPlacements
        : [],
      textbooks: Array.isArray(parsed.textbooks)
        ? parsed.textbooks
        : [],
      textbookChunks: Array.isArray(parsed.textbookChunks)
        ? parsed.textbookChunks
        : [],
      reconstructionDrafts: Array.isArray(parsed.reconstructionDrafts)
        ? parsed.reconstructionDrafts
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
        : [],
      mediaLibraryFolders: Array.isArray(parsed.mediaLibraryFolders)
        ? parsed.mediaLibraryFolders
        : [],
      mediaLibraryPlacements: Array.isArray(parsed.mediaLibraryPlacements)
        ? parsed.mediaLibraryPlacements
        : [],
      textbooks: Array.isArray(parsed.textbooks)
        ? parsed.textbooks
        : [],
      textbookChunks: Array.isArray(parsed.textbookChunks)
        ? parsed.textbookChunks
        : [],
      reconstructionDrafts: Array.isArray(parsed.reconstructionDrafts)
        ? parsed.reconstructionDrafts
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
      state.mediaLibraryFolders.length ||
      state.mediaLibraryPlacements.length ||
      state.textbooks.length ||
      state.textbookChunks.length ||
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedLectureId, setSelectedLectureId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedArchiveFolderId, setSelectedArchiveFolderId] = useState("all");
  const [archiveSortKey, setArchiveSortKey] = useState<ArchiveSortKey>("date");
  const [archiveSortDirection, setArchiveSortDirection] = useState<SortDirection>("desc");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Local archive ready.");
  const [archiveFolderName, setArchiveFolderName] = useState("");
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    term: "",
    studyProfile: ""
  });
  const [courseProfileDrafts, setCourseProfileDrafts] = useState<Record<string, string>>({});
  const [captureForm, setCaptureForm] = useState({
    courseId: "",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    transcript: "",
    objective: "",
    emphasis: "",
    questions: ""
  });
  const [captureFiles, setCaptureFiles] = useState<CaptureSource[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [oneNoteSources, setOneNoteSources] = useState<OneNoteSource[]>([]);
  const [oneNoteStatus, setOneNoteStatus] = useState<{
    configured?: boolean;
    connected?: boolean;
    accountLabel?: string;
    reason?: string;
  }>({});
  const [oneNoteExplorer, setOneNoteExplorer] = useState<Record<string, OneNoteLibraryItem[]>>({});
  const [oneNoteExpandedIds, setOneNoteExpandedIds] = useState<string[]>([]);
  const [oneNoteTrails, setOneNoteTrails] = useState<Record<string, OneNoteTrail>>({});
  const [oneNoteLoading, setOneNoteLoading] = useState(false);
  const [oneNoteExplorerFeedback, setOneNoteExplorerFeedback] = useState("");
  const [oneNoteExplorerError, setOneNoteExplorerError] = useState("");
  const [examForm, setExamForm] = useState({
    courseId: "",
    name: "",
    startsOn: ""
  });
  const [builderCourseId, setBuilderCourseId] = useState("");
  const [builderFolderId, setBuilderFolderId] = useState("all");
  const [builderQuery, setBuilderQuery] = useState("");
  const [builderSortKey, setBuilderSortKey] = useState<ArchiveSortKey>("date");
  const [builderSortDirection, setBuilderSortDirection] = useState<SortDirection>("desc");
  const [selectedBuilderLectureId, setSelectedBuilderLectureId] = useState("");
  const [builderSelectedLectureIds, setBuilderSelectedLectureIds] = useState<string[]>([]);
  const [pipelineTitle, setPipelineTitle] = useState("");
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [isLectureGenerating, setIsLectureGenerating] = useState(false);
  const [isReviewGenerating, setIsReviewGenerating] = useState(false);
  const [isPdfRendering, setIsPdfRendering] = useState(false);
  const [isGptPackageBuilding, setIsGptPackageBuilding] = useState(false);
  const [textbookProcessingCourseId, setTextbookProcessingCourseId] = useState("");
  const [syllabusProcessingCourseId, setSyllabusProcessingCourseId] = useState("");
  const [reviewPdfStatus, setReviewPdfStatus] = useState("");
  const [storageBucket, setStorageBucket] = useState("");
  const [storageFiles, setStorageFiles] = useState<SupabaseStorageFile[]>([]);
  const [selectedStoragePaths, setSelectedStoragePaths] = useState<string[]>([]);
  const [selectedStorageFolderId, setSelectedStorageFolderId] = useState("all");
  const [storageFolderName, setStorageFolderName] = useState("");
  const [isStorageLoading, setIsStorageLoading] = useState(false);
  const stateJsonRef = useRef(JSON.stringify(state));
  const skipNextCloudSaveRef = useRef(false);
  const cloudSavePendingRef = useRef(false);
  const draftUploadsRef = useRef(new Set<string>());
  const loadedDraftVersionRef = useRef("");
  const suppressDraftSaveRef = useRef(false);

  useEffect(() => {
    if (!status) return;

    const timeoutId = window.setTimeout(() => {
      setStatus((current) => (current === status ? "" : current));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    const currentRecordId = state.reconstructionDrafts[0]?.id || "";
    if (activeDraftId !== currentRecordId) setActiveDraftId(currentRecordId);
  }, [activeDraftId, state.reconstructionDrafts]);

  useEffect(() => {
    if (activeDraftId) window.localStorage.setItem("lecturevault-active-draft", activeDraftId);
    else window.localStorage.removeItem("lecturevault-active-draft");
  }, [activeDraftId]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // The app remains usable in the browser when PWA registration is unavailable.
      });
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    const params = new URLSearchParams(window.location.search);
    const shareError = params.get("share-error");
    if (shareError) {
      setScreen("capture");
      setStatus(`Direct share upload failed: ${shareError}`);
    }

    if (params.get("shared") === "1") {
      void takeSharedPwaSources()
        .then((sources) => {
          if (!sources.length) {
            setScreen("capture");
            setStatus("No shared PDF, image, or audio file was received. Share it again from the source app.");
            return;
          }

          setCaptureFiles((current) => [
            ...current,
            ...sources.map((source) => {
              const file = new File([], source.name, { type: source.mimeType });
              const isAudio = source.mimeType.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(source.name);
              return {
                file,
                role: isAudio ? "Lecture audio" : "OneNote export",
                caption: isAudio
                  ? "Shared directly from Android. Transcribe the spoken lecture and connect it to the visual class sources."
                  : "Shared directly from OneNote. Preserve handwriting, formulas, diagrams, and page layout.",
                size: source.size,
                storageBucket: source.storageBucket,
                storagePath: source.storagePath
              };
            })
          ]);
          setScreen("capture");
          setStatus(
            `${sources.length} shared source file${sources.length === 1 ? "" : "s"} added to this reconstruction.`
          );
        })
        .catch((error) => {
          setScreen("capture");
          setStatus(error instanceof Error ? error.message : "Could not import the shared source file.");
        });
    }

    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

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
      return;
    }

    let active = true;
    async function loadOneNoteStatus() {
      try {
        const response = await fetch("/api/onenote/status", { credentials: "include" });
        const data = (await response.json()) as {
          configured?: boolean;
          connected?: boolean;
          accountLabel?: string;
          reason?: string;
        };
        if (active) setOneNoteStatus(data);
      } catch {
        if (active) setOneNoteStatus({ configured: false, reason: "Could not check OneNote connection." });
      }
    }

    void loadOneNoteStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("onenote") === "connected") {
      setStatus("OneNote connected. Select the notes for this class day.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("onenote_message")) {
      setStatus(params.get("onenote_message") || "OneNote connection was not completed.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    return () => {
      active = false;
    };
  }, [authStatus]);

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

    // Do not let the background poll replace this in-memory state with a snapshot from
    // before the local change has reached Supabase.
    cloudSavePendingRef.current = true;
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
      } finally {
        cloudSavePendingRef.current = false;
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
        if (cloudSavePendingRef.current) return;
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

        if (!active || cloudSavePendingRef.current || !response.ok || !data.configured || !data.state) {
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
  const activeDraft = state.reconstructionDrafts.find((draft) => draft.id === activeDraftId);
  const cloudSyncLabel = cloudSyncEnabled
    ? cloudUpdatedAt
      ? `Supabase synced ${new Date(cloudUpdatedAt).toLocaleTimeString()}`
      : "Supabase sync ready"
    : cloudStateLoaded
      ? "Browser-only storage"
      : "Checking sync";
  const isPassiveCloudStatus = status === "Archive synced from Supabase.";

  useEffect(() => {
    if (!activeDraft) return;
    const version = `${activeDraft.id}:${activeDraft.updatedAt}`;
    if (loadedDraftVersionRef.current === version) return;
    loadedDraftVersionRef.current = version;
    // Hydrating a draft from cloud state must never immediately save an empty local source list back over it.
    const draftFiles = activeDraft.sources.map((source) => ({
      file: new File([], source.name, { type: source.mimeType }),
      role: source.role,
      caption: source.caption,
      size: source.size,
      storageBucket: source.storageBucket,
      storagePath: source.storagePath
    }));
    const hasPendingSource = captureFiles.some(
      (source) => source.storagePath && !activeDraft.sources.some((saved) => saved.storagePath === source.storagePath)
    );
    suppressDraftSaveRef.current = !hasPendingSource;
    setCaptureForm({ courseId: activeDraft.courseId, title: activeDraft.title, date: activeDraft.date, transcript: activeDraft.transcript, objective: activeDraft.objective, emphasis: activeDraft.emphasis, questions: activeDraft.questions });
    setCaptureFiles((current) => {
      const existingPaths = new Set(draftFiles.map((source) => source.storagePath).filter(Boolean));
      return [...draftFiles, ...current.filter((source) => !source.storagePath || !existingPaths.has(source.storagePath))];
    });
  }, [activeDraft]);

  useEffect(() => {
    if (!activeDraftId) return;
    if (suppressDraftSaveRef.current) {
      suppressDraftSaveRef.current = false;
      return;
    }
    const sources = captureFiles.map((source) => ({
      id: fileKey(source.file), name: source.file.name, mimeType: source.file.type || "application/octet-stream",
      size: source.size ?? source.file.size, role: source.role, caption: source.caption,
      storageBucket: source.storageBucket, storagePath: source.storagePath
    }));
    setState((current) => {
      const existing = current.reconstructionDrafts.find((draft) => draft.id === activeDraftId);
      if (!existing) return current;
      // Sources are uploaded independently from the form state. Keep every saved storage reference when
      // another device has not yet pulled it, then layer this device's edits on top.
      const mergedSources = [...existing.sources];
      for (const source of sources) {
        const index = mergedSources.findIndex((saved) =>
          source.storagePath
            ? saved.storagePath === source.storagePath
            : !saved.storagePath && saved.id === source.id
        );
        if (index >= 0) mergedSources[index] = { ...mergedSources[index], ...source };
        else mergedSources.push(source);
      }
      const nextDraft = { ...existing, ...captureForm, sources: mergedSources, updatedAt: "" };
      if (JSON.stringify({ ...existing, updatedAt: "" }) === JSON.stringify(nextDraft)) return current;
      return { ...current, reconstructionDrafts: current.reconstructionDrafts.map((draft) =>
        draft.id === activeDraftId ? { ...nextDraft, updatedAt: new Date().toISOString() } : draft
      ) };
    });
  }, [activeDraftId, captureFiles, captureForm]);

  useEffect(() => {
    if (!activeDraftId) return;
    for (const source of captureFiles) {
      const key = fileKey(source.file);
      if (source.storagePath || !source.file.size || draftUploadsRef.current.has(key)) continue;
      draftUploadsRef.current.add(key);
      void uploadMediaFile({ file: source.file, lectureId: `draft-${activeDraftId}`, mediaId: uid("media") })
        .then((storage) => setCaptureFiles((current) => current.map((item) =>
          fileKey(item.file) === key ? { ...item, ...storage } : item
        )))
        .catch((error) => setStatus(error instanceof Error ? error.message : `Could not upload ${source.file.name}.`))
        .finally(() => draftUploadsRef.current.delete(key));
    }
  }, [activeDraftId, captureFiles]);
  const archiveLectures = useMemo(() => {
    const term = query.trim().toLowerCase();

    const mediaSizeByLecture = new Map<string, number>();
    for (const item of state.mediaItems) {
      mediaSizeByLecture.set(
        item.lectureId,
        (mediaSizeByLecture.get(item.lectureId) || 0) + item.size
      );
    }

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
    }).sort((first, second) => {
      const comparison =
        archiveSortKey === "size"
          ? (mediaSizeByLecture.get(first.id) || 0) - (mediaSizeByLecture.get(second.id) || 0)
          : archiveSortKey === "date"
            ? first.date.localeCompare(second.date)
            : first.title.localeCompare(second.title, undefined, { sensitivity: "base" });
      return archiveSortDirection === "asc" ? comparison : -comparison;
    });
  }, [archiveSortDirection, archiveSortKey, query, selectedArchiveFolderId, selectedCourseId, state]);

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
  const selectedArchiveMedia = selectedArchiveLecture
    ? state.mediaItems.filter((item) => item.lectureId === selectedArchiveLecture.id)
    : [];
  const selectedArchiveConcepts = selectedArchiveLecture
    ? state.concepts.filter((concept) => concept.lectureId === selectedArchiveLecture.id)
    : [];
  const selectedArchiveTranscript = selectedArchiveLecture
    ? state.transcripts.find((transcript) => transcript.lectureId === selectedArchiveLecture.id)
    : undefined;
  const selectedArchiveSourceSize = selectedArchiveMedia.reduce(
    (total, item) => total + item.size,
    0
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
    }).sort((first, second) => {
      const firstSize = state.mediaItems
        .filter((item) => item.lectureId === first.id)
        .reduce((total, item) => total + item.size, 0);
      const secondSize = state.mediaItems
        .filter((item) => item.lectureId === second.id)
        .reduce((total, item) => total + item.size, 0);
      const comparison =
        builderSortKey === "size"
          ? firstSize - secondSize
          : builderSortKey === "date"
            ? first.date.localeCompare(second.date)
            : first.title.localeCompare(second.title, undefined, { sensitivity: "base" });
      return builderSortDirection === "asc" ? comparison : -comparison;
    });
  }, [builderCourseId, builderFolderId, builderQuery, builderSortDirection, builderSortKey, state]);
  const selectedBuilderLecture =
    builderLectures.find((lecture) => lecture.id === selectedBuilderLectureId) ||
    builderLectures[0];
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

  function startPipeline(title: string, steps: Array<Omit<PipelineStep, "status">>) {
    setPipelineTitle(title);
    setPipelineSteps(
      steps.map((step, index) => ({
        ...step,
        status: index === 0 ? "active" : "pending"
      }))
    );
  }

  function updatePipelineStep(
    stepId: string,
    statusValue: PipelineStep["status"],
    detail?: string
  ) {
    setPipelineSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              detail: detail ?? step.detail,
              status: statusValue
            }
          : step
      )
    );
  }

  function activatePipelineStep(stepId: string, detail?: string) {
    setPipelineSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              detail: detail ?? step.detail,
              status: "active"
            }
          : step.status === "active"
            ? { ...step, status: "done" }
            : step
      )
    );
  }

  function completePipeline(finalDetail?: string) {
    setPipelineSteps((current) =>
      current.map((step, index) =>
        index === current.length - 1 && finalDetail
          ? { ...step, detail: finalDetail, status: "done" }
          : { ...step, status: "done" }
      )
    );
  }

  function failPipeline(stepId: string, detail: string) {
    setPipelineSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? { ...step, detail, status: "error" }
          : step.status === "active"
            ? { ...step, status: "error" }
            : step
      )
    );
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
      studyProfile: courseForm.studyProfile.trim(),
      createdAt: new Date().toISOString()
    };
    const lectureFolder = createDefaultLectureFolder(course.id, course.createdAt);
    const reassignUnfiledLectures = state.courses.length === 0;
    const unfiledLectureCount = reassignUnfiledLectures
      ? state.lectures.filter((lecture) => !lecture.courseId).length
      : 0;

    setState((current) => ({
      ...current,
      courses: [course, ...current.courses],
      archiveFolders: [lectureFolder, ...current.archiveFolders],
      lectures: reassignUnfiledLectures
        ? current.lectures.map((lecture) =>
            lecture.courseId
              ? lecture
              : { ...lecture, courseId: course.id, folderId: lectureFolder.id }
          )
        : current.lectures
    }));
    setCourseForm({ code: "", name: "", term: "", studyProfile: "" });
    setSelectedCourseId(course.id);
    setSelectedArchiveFolderId(lectureFolder.id);
    setStatus(
      unfiledLectureCount
        ? `Created ${course.code}, added its Lectures folder, and recovered ${unfiledLectureCount} unassigned reconstruction${unfiledLectureCount === 1 ? "" : "s"}.`
        : `Created ${course.code} with a default Lectures folder.`
    );
  }

  function saveCourseStudyProfile(courseId: string) {
    const course = state.courses.find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    const studyProfile = (courseProfileDrafts[courseId] ?? course.studyProfile ?? "").trim();
    setState((current) => ({
      ...current,
      courses: current.courses.map((item) =>
        item.id === courseId ? { ...item, studyProfile } : item
      )
    }));
    setCourseProfileDrafts((current) => ({ ...current, [courseId]: studyProfile }));
    setStatus(`${course.code} study profile saved.`);
  }

  async function addCourseSyllabus(courseId: string, file: File) {
    const course = state.courses.find((item) => item.id === courseId);

    if (!course) {
      setStatus("Choose a course before adding its syllabus.");
      return;
    }

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Choose a PDF syllabus.");
      return;
    }

    if (
      course.syllabus &&
      !window.confirm(
        `Replace ${course.syllabus.name} as the syllabus for ${course.code}? The previous file will remain available in Media Library.`
      )
    ) {
      return;
    }

    setSyllabusProcessingCourseId(courseId);

    try {
      const syllabusId = uid("syllabus");
      setStatus(`Uploading ${file.name} as the syllabus for ${course.code}...`);
      const storage = await uploadMediaFile({
        file,
        lectureId: `syllabus-${courseId}`,
        mediaId: syllabusId
      });
      const syllabus: CourseSyllabus = {
        id: syllabusId,
        name: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
        storageBucket: storage.storageBucket,
        storagePath: storage.storagePath,
        createdAt: new Date().toISOString()
      };

      setState((current) => ({
        ...current,
        courses: current.courses.map((item) =>
          item.id === courseId ? { ...item, syllabus } : item
        )
      }));
      setStatus(`Added ${file.name} as the syllabus for ${course.code}.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not add the course syllabus."
      );
    } finally {
      setSyllabusProcessingCourseId("");
    }
  }

  function removeCourseSyllabus(courseId: string) {
    const course = state.courses.find((item) => item.id === courseId);

    if (!course?.syllabus) {
      return;
    }

    if (
      !window.confirm(
        `Remove ${course.syllabus.name} from ${course.code}? The original PDF will remain in Media Library.`
      )
    ) {
      return;
    }

    setState((current) => ({
      ...current,
      courses: current.courses.map((item) =>
        item.id === courseId ? { ...item, syllabus: undefined } : item
      )
    }));
    setStatus(`Removed the syllabus from ${course.code}.`);
  }

  async function addCourseTextbooks(courseId: string, files: File[]) {
    const pdfFiles = files.filter(
      (file) => file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
    );
    const course = state.courses.find((item) => item.id === courseId);

    if (!course) {
      setStatus("Choose a course before adding textbooks.");
      return;
    }

    if (!pdfFiles.length) {
      setStatus("Choose at least one PDF textbook.");
      return;
    }

    setTextbookProcessingCourseId(courseId);
    startPipeline("Textbook indexing", [
      {
        id: "upload",
        label: "Uploading textbook",
        detail: `${pdfFiles.length} PDF file${pdfFiles.length === 1 ? "" : "s"} selected`
      },
      {
        id: "extract",
        label: "Extracting PDF text",
        detail: "Reading pages from Supabase Storage"
      },
      {
        id: "index",
        label: "Indexing textbook chunks",
        detail: "Creating embeddings and saving vectors in Supabase"
      },
      {
        id: "save",
        label: "Saving course textbook",
        detail: "Adding searchable textbook metadata to the course"
      }
    ]);

    try {
      for (const file of pdfFiles) {
        const textbookId = uid("textbook");
        activatePipelineStep("upload", `${file.name} (${formatFileSize(file.size)})`);
        setStatus(`Uploading and extracting ${file.name}...`);
        const storage = await uploadMediaFile({
          file,
          lectureId: `textbook-${courseId}`,
          mediaId: textbookId
        });
        updatePipelineStep("upload", "done", `${file.name} uploaded`);
        activatePipelineStep("extract", "Extracting page text from the uploaded PDF");
        const response = await fetch("/api/textbook/extract", {
          body: JSON.stringify({
            bucket: storage.storageBucket,
            courseId,
            mimeType: file.type || "application/pdf",
            name: file.name,
            path: storage.storagePath,
            textbookId
          }),
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        });
        const data = (await response.json()) as {
          chunkCount?: number;
          chunks?: TextbookChunk[];
          embeddingUsage?: TokenUsage | null;
          error?: string;
          indexedChunkCount?: number;
          pageCount?: number;
        };

        if (!response.ok) {
          throw new Error(data.error || `Could not extract ${file.name}.`);
        }

        updatePipelineStep("extract", "done", `${data.pageCount || 0} pages read`);
        updatePipelineStep(
          "index",
          "done",
          `${data.indexedChunkCount || 0} chunks indexed${
            data.embeddingUsage ? ` (${formatTokenUsage(data.embeddingUsage)})` : ""
          }`
        );
        activatePipelineStep("save", "Saving textbook metadata");
        const chunkCount = data.chunkCount || data.chunks?.length || 0;
        const textbook: CourseTextbook = {
          id: textbookId,
          courseId,
          name: file.name,
          mimeType: file.type || "application/pdf",
          size: file.size,
          storageBucket: storage.storageBucket,
          storagePath: storage.storagePath,
          pageCount: data.pageCount,
          chunkCount,
          indexedChunkCount: data.indexedChunkCount || 0,
          embeddingUsage: data.embeddingUsage || null,
          createdAt: new Date().toISOString()
        };

        setState((current) => ({
          ...current,
          textbooks: [textbook, ...current.textbooks],
          textbookChunks: current.textbookChunks
        }));
        setStatus(
          `Added ${file.name} to ${course.code}. Indexed ${data.indexedChunkCount || 0} textbook chunk${data.indexedChunkCount === 1 ? "" : "s"} for AI search.`
        );
        updatePipelineStep("save", "done", `${file.name} ready for AI search`);
      }
      completePipeline("Textbook context is ready for semantic retrieval.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not add textbook PDF.";
      setStatus(message);
      failPipeline("index", message);
    } finally {
      setTextbookProcessingCourseId("");
    }
  }

  async function deleteTextbook(textbookId: string) {
    const textbook = state.textbooks.find((item) => item.id === textbookId);

    if (!textbook) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${textbook.name} from this course? This removes the extracted AI context from LectureVault, but does not delete the Supabase file.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch("/api/textbook/extract", {
        body: JSON.stringify({ textbookId }),
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        method: "DELETE"
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Could not remove textbook vectors.");
      }

      setState((current) => ({
        ...current,
        textbooks: current.textbooks.filter((item) => item.id !== textbookId),
        textbookChunks: current.textbookChunks.filter(
          (chunk) => chunk.textbookId !== textbookId
        )
      }));
      setStatus(`Removed ${textbook.name} from course textbook context.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not remove textbook.";
      setStatus(message);
    }
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
    const deletedTextbookIds = new Set(
      state.textbooks
        .filter((textbook) => textbook.courseId === courseId)
        .map((textbook) => textbook.id)
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
      reconstructionDrafts: current.reconstructionDrafts.filter((draft) => draft.courseId !== courseId),
      archiveFolders: current.archiveFolders.filter(
        (folder) => folder.courseId !== courseId
      ),
      lectures: current.lectures.filter((lecture) => lecture.courseId !== courseId),
      mediaItems: current.mediaItems.filter(
        (item) => !deletedLectureIds.has(item.lectureId)
      ),
      textbooks: current.textbooks.filter(
        (textbook) => textbook.courseId !== courseId
      ),
      textbookChunks: current.textbookChunks.filter(
        (chunk) => !deletedTextbookIds.has(chunk.textbookId)
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
    const parentFolder = parentId
      ? state.archiveFolders.find((item) => item.id === parentId)
      : undefined;
    const courseId = parentFolder?.courseId || selectedCourseId;

    if (!courseId) {
      setStatus("Select a course before adding an archive folder.");
      return;
    }
    const folder: ArchiveFolder = {
      id: uid("folder"),
      courseId,
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

  async function buildReconstruction() {
    await persistCapture();
  }

  async function installLectureVault() {
    if (!installPrompt) {
      setStatus("Install LectureVault from Chrome's menu, then sign in once before sharing OneNote PDFs or images.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setStatus(
      choice.outcome === "accepted"
        ? "LectureVault installed. Open it once and sign in before sharing OneNote pages."
        : "LectureVault installation was dismissed. You can install it later from Chrome's menu."
    );
  }

  async function persistCapture() {
    if (!captureForm.courseId) {
      setStatus("Select a course before building a reconstruction.");
      return;
    }
    const title = captureForm.title.trim() || "Untitled reconstruction";
    const lectureId = uid("lecture");
    const createdAt = new Date().toISOString();
    const pastedTranscript = captureForm.transcript.trim();
    const mediaItems: MediaItem[] = [];

    try {
      setIsLectureGenerating(true);
      startPipeline("Lecture Reconstruction build", [
          {
            id: "upload",
            label: "Uploading media",
            detail: `${captureFiles.length} source file${captureFiles.length === 1 ? "" : "s"} queued`
          },
          {
            id: "transcribe",
            label: "Transcribing available audio",
            detail: "Audio is used when attached; other sources remain optional"
          },
          {
            id: "retrieve",
            label: "Retrieving textbook context",
            detail: "Searching indexed course textbooks semantically"
          },
          {
            id: "generate",
            label: "Building reconstruction",
            detail: "Combining audio transcript, notes, media, and textbook context"
          },
          {
            id: "save",
            label: "Saving to vault",
            detail: "Archiving reconstruction, concepts, source references, and usage"
          }
      ]);
      setStatus("Building lecture reconstruction from available source material...");

      for (const source of captureFiles) {
        const { file } = source;
        const mediaId = uid("media");
        let storage: Pick<MediaItem, "storageBucket" | "storagePath"> = {};
        let dataUrl: string | undefined;

        if (source.storageBucket && source.storagePath) {
          storage = {
            storageBucket: source.storageBucket,
            storagePath: source.storagePath
          };
          activatePipelineStep("upload", `Using shared Supabase source ${file.name}`);
        } else {
          try {
            activatePipelineStep("upload", `Uploading ${file.name}`);
            storage = await uploadMediaFile({ file, lectureId, mediaId });
          } catch (error) {
            dataUrl = await fileToMediaDataUrl(file);

            if (!dataUrl) {
              throw error instanceof Error
                ? error
                : new Error(`Could not upload ${file.name}.`);
            }
          }
        }

        mediaItems.push({
          id: mediaId,
          lectureId,
          kind: fileKind(file),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: source.size ?? file.size,
          dataUrl,
          sourceRole: source.role.trim(),
          sourceCaption: source.caption.trim(),
          ...storage,
          createdAt
        });
      }

      updatePipelineStep(
        "upload",
        "done",
        `${mediaItems.length} source file${mediaItems.length === 1 ? "" : "s"} ready`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read reconstruction source files.";
      setStatus(message);
      failPipeline("upload", message);
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
    let aiReconstructionTitle = "";

    try {
        activatePipelineStep(
          "transcribe",
          mediaItems.some((item) => item.kind === "audio")
            ? "Transcribing attached audio and preparing source context"
            : "No audio file attached; using notes and visible media"
        );
        const courseTextbooks = state.textbooks.filter(
          (textbook) => textbook.courseId === captureForm.courseId
        );
        const courseTextbookIds = new Set(
          courseTextbooks.map((textbook) => textbook.id)
        );
        const courseStudyProfile = reconstructionCourseProfile;
        const reconstructionBrief = reconstructionBriefContext;
        const textbookContext = relevantTextbookChunks({
          chunks: state.textbookChunks.filter((chunk) =>
            courseTextbookIds.has(chunk.textbookId)
          ),
          query: [title, courseStudyProfile, reconstructionBrief, pastedTranscript]
            .filter(Boolean)
            .join("\n\n"),
          textbooks: courseTextbooks
        });
        const response = await fetch("/api/lecture-ai", {
          body: JSON.stringify({
            courseName: courseLabel(captureForm.courseId),
            courseId: captureForm.courseId,
            date: captureForm.date,
            courseStudyProfile,
            mediaItems,
            notes: [reconstructionBrief, pastedTranscript]
              .filter(Boolean)
              .join("\n\n"),
            oneNoteSources,
            textbookContext,
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
          reconstructionTitle?: string;
          sourceMediaIds?: string[];
          summary?: string;
          transcribedMediaIds?: string[];
          transcriptText?: string;
          usage?: TokenUsage | null;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not build lecture reconstruction.");
        }

        updatePipelineStep(
          "transcribe",
          "done",
          data.transcribedMediaIds?.length
            ? `${data.transcribedMediaIds.length} audio source${data.transcribedMediaIds.length === 1 ? "" : "s"} transcribed`
            : "No audio was transcribed; reconstruction used other available sources"
        );
        updatePipelineStep(
          "retrieve",
          "done",
          courseTextbooks.length
            ? "Course textbook vectors searched for relevant context"
            : "No course textbooks attached"
        );
        updatePipelineStep(
          "generate",
          "done",
          data.usage ? `Reconstruction built (${formatTokenUsage(data.usage)})` : "Reconstruction built"
        );
        activatePipelineStep("save", "Saving generated reconstruction and concepts");
        transcriptText = data.transcriptText || transcriptText;
        transcriptUsage = data.usage || null;
        generatedBy = data.generatedBy || "openai";
        sourceMediaIds = data.sourceMediaIds?.length
          ? data.sourceMediaIds
          : sourceMediaIds;
        transcribedMediaIds = data.transcribedMediaIds || [];
        aiReconstructionTitle = data.reconstructionTitle?.trim() || "";
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
            : "Could not build lecture reconstruction.";
        setStatus(message);
        failPipeline("generate", message);
        setIsLectureGenerating(false);
        return;
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
      oneNoteSources,
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
      title: aiReconstructionTitle || title,
      date: captureForm.date,
      summary:
        aiSummary ||
        captureForm.objective.trim() ||
        captureForm.emphasis.trim() ||
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
      ],
      reconstructionDrafts: []
    }));
    setActiveDraftId("");
    loadedDraftVersionRef.current = "";
    setSelectedLectureId(lectureId);
    setCaptureFiles([]);
    setOneNoteSources([]);
    setCaptureForm((current) => ({
      ...current,
      title: "",
      transcript: "",
      objective: "",
      emphasis: "",
      questions: ""
    }));
    setStatus(`Built and saved ${aiReconstructionTitle || title} as a lecture reconstruction.`);
    completePipeline("Lecture reconstruction saved to the vault.");
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
    setSelectedBuilderLectureId("");
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

  function changeBuilderSort(key: ArchiveSortKey) {
    if (builderSortKey === key) {
      setBuilderSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setBuilderSortKey(key);
    setBuilderSortDirection(key === "name" ? "asc" : "desc");
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
    setReviewPdfStatus("");
    startPipeline("Review AI generation", [
      {
        id: "collect",
        label: "Collecting review sources",
        detail: `${selectedExamLectures.length} lecture source${selectedExamLectures.length === 1 ? "" : "s"} selected`
      },
      {
        id: "prepare",
        label: "Preparing AI context",
        detail: "Combining transcripts, concepts, images, and instructions"
      },
      {
        id: "generate",
        label: "Generating review",
        detail: "Creating one exam-focused study artifact"
      },
      {
        id: "save",
        label: "Saving review set output",
        detail: "Saving generated review and token usage"
      }
    ]);
    setStatus("Generating AI review from selected review-set materials...");
    const submittedContext = reviewContext.trim();

    const selectedConcepts = state.concepts.filter((concept) =>
      sourceLectureIds.includes(concept.lectureId)
    );
    const selectedMediaItems = state.mediaItems.filter((item) =>
      sourceLectureIds.includes(item.lectureId)
    );
    const courseStudyProfile = state.courses.find(
      (course) => course.id === selectedExam.courseId
    )?.studyProfile;
    const reviewMediaItems = selectedMediaItems.map((item) =>
      item.kind === "image" && embeddedDataUrlForMedia(item)
        ? { ...item, dataUrl: embeddedDataUrlForMedia(item) }
        : item
    );
    updatePipelineStep(
      "collect",
      "done",
      `${selectedTranscripts.length} transcript${selectedTranscripts.length === 1 ? "" : "s"}, ${selectedConcepts.length} concept${selectedConcepts.length === 1 ? "" : "s"}, ${selectedMediaItems.length} media item${selectedMediaItems.length === 1 ? "" : "s"}`
    );
    activatePipelineStep("prepare", "Preparing selected review-set context");

    try {
      updatePipelineStep("prepare", "done", "Context package ready");
      activatePipelineStep("generate", "Sending review context to AI");
      const response = await fetch("/api/exam-review", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          examName: selectedExam.name,
          courseName: courseLabel(selectedExam.courseId),
          courseStudyProfile,
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

      updatePipelineStep(
        "generate",
        "done",
        data.usage ? `Review generated (${formatTokenUsage(data.usage)})` : "Review generated"
      );
      activatePipelineStep("save", "Saving generated review");
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
      setStatus(
        data.generatedBy === "local-fallback"
          ? "Review generated locally because OPENAI_API_KEY is not configured."
          : `AI review generated from selected review-set materials${
              formatTokenUsage(data.usage) ? ` (${formatTokenUsage(data.usage)})` : ""
            }.`
      );
      completePipeline("Review output saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not generate exam review.";
      setStatus(message);
      failPipeline("generate", message);
    } finally {
      setIsReviewGenerating(false);
    }
  }

  async function downloadExamReviewPdf(guide = selectedExamGuide) {
    if (!selectedExam || !guide) {
      setReviewPdfStatus("Generate an exam review before downloading the PDF.");
      setStatus("Generate an exam review before downloading the PDF.");
      return;
    }

    setIsPdfRendering(true);
    setReviewPdfStatus("Rendering PDF with KaTeX...");
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
      const figures = stripLargeFigureDataUrls(
        currentFigures.length ? currentFigures : guide.figures || []
      );
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
        const fallback = "Could not render exam review PDF.";
        const contentType = response.headers.get("content-type") || "";
        const message = contentType.includes("application/json")
          ? ((await response.json()) as { error?: string }).error || fallback
          : (await response.text()) || fallback;
        throw new Error(message);
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
      setReviewPdfStatus("PDF downloaded.");
      setStatus("Exam review PDF downloaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not render exam review PDF.";
      setReviewPdfStatus(`PDF download failed: ${message}`);
      setStatus(`PDF download failed: ${message}`);
    } finally {
      setIsPdfRendering(false);
    }
  }

  async function downloadGptPackage(guide = selectedExamGuide) {
    if (!selectedExam) {
      setReviewPdfStatus("Create or open a review set before downloading a GPT package.");
      setStatus("Create or open a review set before downloading a GPT package.");
      return;
    }

    if (!selectedExamLectures.length) {
      setReviewPdfStatus("Add archive sources before downloading a GPT package.");
      setStatus("Add archive sources before downloading a GPT package.");
      return;
    }

    setIsGptPackageBuilding(true);
    setReviewPdfStatus("Building GPT package...");
    setStatus("Building GPT context package...");

    try {
      const zip = new JSZip();
      const packageName = safePackageName(selectedExam.name, "review-set");
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
      const imageItems = selectedMediaItems.filter((item) => item.kind === "image");
      const textbookNames = state.textbooks
        .filter((textbook) => textbook.courseId === selectedExam.courseId)
        .map((textbook) => textbook.name);
      const mediaFolder = zip.folder("media");
      const transcriptFolder = zip.folder("transcripts");
      const imageReferences: Array<{
        fileName: string;
        id: string;
        lectureId: string;
        name: string;
        path?: string;
      }> = [];

      for (let index = 0; index < imageItems.length; index += 1) {
        const item = imageItems[index];
        const extension =
          item.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") ||
          (item.mimeType.includes("png") ? "png" : "jpg");
        const fileName = `fig-${index + 1}-${safePackageName(item.name, "board-image")}.${extension}`;
        let blob: Blob | null = null;

        if (item.dataUrl) {
          blob = await (await fetch(item.dataUrl)).blob();
        } else if (item.storagePath) {
          const response = await fetch(
            storageObjectUrl(item.storagePath, item.storageBucket),
            { credentials: "include" }
          );

          if (response.ok) {
            blob = await response.blob();
          }
        }

        if (blob) {
          mediaFolder?.file(fileName, blob);
          imageReferences.push({
            fileName,
            id: item.id,
            lectureId: item.lectureId,
            name: item.name,
            path: item.storagePath
          });
        }
      }

      for (const lecture of selectedExamLectures) {
        const transcript = selectedTranscripts.find(
          (item) => item.lectureId === lecture.id
        );
        transcriptFolder?.file(
          `${safePackageName(lecture.title, "lecture")}.md`,
          [
            `# ${lecture.title}`,
            "",
            `Course: ${courseLabel(lecture.courseId)}`,
            `Date: ${lecture.date || "No date"}`,
            "",
            "## Summary",
            lecture.summary || "No summary saved.",
            "",
            "## Transcript",
            transcript?.text || "No transcript saved."
          ].join("\n")
        );
      }

      const sourceMap = selectedExamLectures.map((lecture) => ({
        concepts: selectedConcepts
          .filter((concept) => concept.lectureId === lecture.id)
          .map((concept) => ({
            detail: concept.detail,
            sourceSegmentId: concept.sourceSegmentId,
            title: concept.title
          })),
        date: lecture.date,
        images: imageReferences.filter((image) => image.lectureId === lecture.id),
        lectureId: lecture.id,
        media: selectedMediaItems
          .filter((item) => item.lectureId === lecture.id)
          .map((item) => ({
            id: item.id,
            kind: item.kind,
            mimeType: item.mimeType,
            name: item.name,
            size: item.size,
            storagePath: item.storagePath
          })),
        title: lecture.title,
        transcriptSegments:
          selectedTranscripts.find((item) => item.lectureId === lecture.id)
            ?.segments || []
      }));
      const contextMarkdown = [
        `# GPT Context Package: ${selectedExam.name}`,
        "",
        `Course: ${courseLabel(selectedExam.courseId)}`,
        `Exam date: ${selectedExam.startsOn || "No date set"}`,
        `Generated: ${new Date().toLocaleString()}`,
        "",
        "## How to Use This Package",
        "Upload this markdown file and the included media folder to ChatGPT. Ask it to use the transcripts, board images, source map, and textbook context to build an exam-focused review.",
        "",
        "## Suggested Prompt",
        "Use the attached LectureVault package to create a source-grounded exam study guide. Prioritize worked problem methods, formulas, assumptions, common mistakes, and practice variations. Reference board images by filename and cite transcript/source details when useful.",
        "",
        "## User Instructions",
        selectedExam.context || DEFAULT_REVIEW_CONTEXT,
        "",
        "## Course Textbooks Indexed in LectureVault",
        textbookNames.length
          ? textbookNames.map((name) => `- ${name}`).join("\n")
          : "- No course textbooks indexed.",
        "",
        "## Selected Lectures",
        ...selectedExamLectures.flatMap((lecture) => {
          const transcript = selectedTranscripts.find(
            (item) => item.lectureId === lecture.id
          );
          const lectureImages = imageReferences.filter(
            (image) => image.lectureId === lecture.id
          );
          const lectureConcepts = selectedConcepts.filter(
            (concept) => concept.lectureId === lecture.id
          );

          return [
            "",
            `### ${lecture.title}`,
            `Date: ${lecture.date || "No date"}`,
            "",
            "Summary:",
            lecture.summary || "No summary saved.",
            "",
            "Transcript file:",
            `transcripts/${safePackageName(lecture.title, "lecture")}.md`,
            "",
            "Board / Worked Problem Images:",
            lectureImages.length
              ? lectureImages
                  .map((image) => `- ${image.name}: media/${image.fileName}`)
                  .join("\n")
              : "- No board images attached.",
            "",
            "Extracted Concepts:",
            lectureConcepts.length
              ? lectureConcepts
                  .map((concept) => `- ${concept.title}: ${concept.detail}`)
                  .join("\n")
              : "- No extracted concepts saved.",
            "",
            "Transcript Preview:",
            (transcript?.text || "No transcript saved.").slice(0, 2400)
          ];
        }),
        "",
        "## Existing Generated Review",
        guide?.content || "No generated in-app review saved yet."
      ].join("\n");

      zip.file("README.md", contextMarkdown);
      zip.file("prompt.md", [
        `# Prompt for ${selectedExam.name}`,
        "",
        "Create an exam-focused study guide from this LectureVault package.",
        "Use the transcripts, board images, extracted concepts, source map, and any textbook context mentioned.",
        "Focus on worked problem reconstruction, formulas, assumptions, common mistakes, and practice variations.",
        "Do not ignore the images; treat them as board work and cite image filenames when explaining worked examples."
      ].join("\n"));
      zip.file("source-map.json", JSON.stringify(sourceMap, null, 2));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${packageName}-gpt-package.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setReviewPdfStatus("GPT package downloaded.");
      setStatus("GPT context package downloaded.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not build GPT package.";
      setReviewPdfStatus(`GPT package failed: ${message}`);
      setStatus(`GPT package failed: ${message}`);
    } finally {
      setIsGptPackageBuilding(false);
    }
  }

  function addCaptureFiles(files: File[]) {
    if (!files.length) {
      return;
    }

    setCaptureFiles((current) => {
      const existingKeys = new Set(current.map((source) => fileKey(source.file)));
      const next = [...current];

      for (const file of files) {
        const key = fileKey(file);

        if (!existingKeys.has(key)) {
          next.push({ file, role: defaultSourceRole(file), caption: "" });
          existingKeys.add(key);
        }
      }

      return next;
    });
    setStatus(
      `${files.length} source file${files.length === 1 ? "" : "s"} queued for this reconstruction.`
    );
  }

  function startClassDayRecord() {
    if (!state.courses.length) {
      setStatus("Create a course before starting a class record.");
      setScreen("courses");
      return;
    }
    if (!captureForm.courseId) {
      setStatus("Choose the course for this class record first.");
      return;
    }
    const currentRecord = state.reconstructionDrafts[0];
    if (currentRecord) {
      openClassDayDraft(currentRecord.id);
      setStatus("Current class record is already open. Add sources from either device, then build it.");
      return;
    }
    const now = new Date().toISOString();
    const draft: ClassDayDraft = {
      id: uid("draft"),
      courseId: captureForm.courseId || state.courses[0]?.id || "",
      title: captureForm.title,
      date: captureForm.date,
      transcript: captureForm.transcript,
      objective: captureForm.objective,
      emphasis: captureForm.emphasis,
      questions: captureForm.questions,
      sources: [],
      createdAt: now,
      updatedAt: now
    };
    setState((current) => ({ ...current, reconstructionDrafts: [draft] }));
    setActiveDraftId(draft.id);
    setCaptureFiles([]);
    setStatus("Current class record started. Add audio on your phone and OneNote PDFs on your tablet.");
  }

  function discardClassDayRecord() {
    const record = state.reconstructionDrafts.find((draft) => draft.id === activeDraftId) || state.reconstructionDrafts[0];
    if (!record) return;

    const confirmed = window.confirm(
      "Discard this active class record and clear its attached-source references? The original files remain in Supabase Media Library."
    );
    if (!confirmed) return;

    setState((current) => ({ ...current, reconstructionDrafts: [] }));
    setActiveDraftId("");
    loadedDraftVersionRef.current = "";
    suppressDraftSaveRef.current = false;
    setCaptureFiles([]);
    setOneNoteSources([]);
    setCaptureForm({
      courseId: record.courseId,
      title: "",
      date: new Date().toISOString().slice(0, 10),
      transcript: "",
      objective: "",
      emphasis: "",
      questions: ""
    });
    setStatus("Class record discarded. Original uploaded files remain available in Media Library.");
  }

  function openClassDayDraft(id: string) {
    const draft = state.reconstructionDrafts.find((item) => item.id === id);
    if (!draft) return;
    const hasPendingSource = captureFiles.some(
      (source) => source.storagePath && !draft.sources.some((saved) => saved.storagePath === source.storagePath)
    );
    suppressDraftSaveRef.current = !hasPendingSource;
    setActiveDraftId(id);
    setCaptureForm({
      courseId: draft.courseId,
      title: draft.title,
      date: draft.date,
      transcript: draft.transcript,
      objective: draft.objective,
      emphasis: draft.emphasis,
      questions: draft.questions
    });
    const draftFiles = draft.sources.map((source) => ({
      file: new File([], source.name, { type: source.mimeType }),
      role: source.role,
      caption: source.caption,
      size: source.size,
      storageBucket: source.storageBucket,
      storagePath: source.storagePath
    }));
    setCaptureFiles((current) => {
      const existingPaths = new Set(draftFiles.map((source) => source.storagePath).filter(Boolean));
      return [...draftFiles, ...current.filter((source) => !source.storagePath || !existingPaths.has(source.storagePath))];
    });
    setScreen("capture");
  }

  function removeCaptureFile(key: string) {
    setCaptureFiles((current) =>
      current.filter((source) => fileKey(source.file) !== key)
    );
  }

  function updateCaptureSource(key: string, updates: Partial<Omit<CaptureSource, "file">>) {
    setCaptureFiles((current) =>
      current.map((source) =>
        fileKey(source.file) === key ? { ...source, ...updates } : source
      )
    );
  }

  async function loadOneNoteExplorer(parent?: OneNoteLibraryItem) {
    setOneNoteLoading(true);
    setOneNoteExplorerError("");
    setOneNoteExplorerFeedback(
      parent
        ? `Loading ${parent.displayName || parent.title || "OneNote folder"}...`
        : "Loading OneNote notebooks..."
    );
    try {
      const query = parent
        ? parent.kind === "notebook"
          ? `?notebookId=${encodeURIComponent(parent.id)}`
          : parent.kind === "sectionGroup"
            ? `?sectionGroupId=${encodeURIComponent(parent.id)}`
            : parent.kind === "section"
              ? `?sectionId=${encodeURIComponent(parent.id)}`
              : ""
        : "";
      const response = await fetch(`/api/onenote/library${query}`, { credentials: "include" });
      const data = (await response.json()) as { error?: string; value?: OneNoteLibraryItem[] };
      if (!response.ok) throw new Error(data.error || "Could not load OneNote library.");
      const items = data.value || [];
      const parentKey = parent?.id || "root";
      const parentTrail = parent ? oneNoteTrails[parent.id] : undefined;
      setOneNoteExplorer((current) => ({ ...current, [parentKey]: items }));
      setOneNoteTrails((current) => {
        const next = { ...current };
        for (const item of items) {
          const itemName = item.displayName || item.title || "Untitled OneNote item";
          next[item.id] = item.kind === "notebook"
            ? { notebookName: itemName, sectionName: "" }
            : item.kind === "section"
              ? { notebookName: parentTrail?.notebookName || "OneNote notebook", sectionName: itemName }
              : parentTrail || { notebookName: "OneNote notebook", sectionName: "" };
        }
        return next;
      });
      setOneNoteExplorerFeedback(
        items.length
          ? `${items.length} ${parent ? "item" : "notebook"}${items.length === 1 ? "" : "s"} loaded.`
          : parent
            ? "This folder has no sections or pages."
            : "No OneNote notebooks were returned for this Microsoft account."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load OneNote library.";
      setOneNoteExplorerFeedback("");
      setOneNoteExplorerError(message);
      setStatus(message);
    } finally {
      setOneNoteLoading(false);
    }
  }

  async function toggleOneNoteExplorerNode(node: OneNoteLibraryItem) {
    if (node.kind === "page") {
      await importOneNotePage(node);
      return;
    }

    const isExpanded = oneNoteExpandedIds.includes(node.id);
    setOneNoteExpandedIds((current) =>
      isExpanded ? current.filter((id) => id !== node.id) : [...current, node.id]
    );

    if (!isExpanded && !oneNoteExplorer[node.id]) {
      await loadOneNoteExplorer(node);
    }
  }

  async function importOneNotePage(page: OneNoteLibraryItem) {
    setOneNoteLoading(true);
    try {
      const response = await fetch(`/api/onenote/page?pageId=${encodeURIComponent(page.id)}`, { credentials: "include" });
      const data = (await response.json()) as { error?: string; pageId?: string; text?: string; title?: string; webUrl?: string };
      if (!response.ok) throw new Error(data.error || "Could not import OneNote page.");
      if (!data.text?.trim()) throw new Error("That OneNote page did not contain readable text.");
      const trail = oneNoteTrails[page.id];
      const source: OneNoteSource = {
        id: `onenote-${data.pageId || page.id}`,
        pageId: data.pageId || page.id,
        title: data.title || page.title || "Untitled OneNote page",
        text: data.text.trim(),
        notebookName: trail?.notebookName || "OneNote notebook",
        sectionName: trail?.sectionName || "OneNote section",
        webUrl: data.webUrl || page.links?.oneNoteWebUrl?.href || "",
        importedAt: new Date().toISOString()
      };
      setOneNoteSources((current) => current.some((item) => item.pageId === source.pageId) ? current : [...current, source]);
      setStatus(`Imported OneNote page: ${source.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import OneNote page.");
    } finally {
      setOneNoteLoading(false);
    }
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

  function changeArchiveSort(key: ArchiveSortKey) {
    if (archiveSortKey === key) {
      setArchiveSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setArchiveSortKey(key);
    setArchiveSortDirection(key === "name" ? "asc" : "desc");
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      credentials: "include",
      method: "POST"
    });
    setAuthStatus("locked");
  }

  async function loadStorageFiles() {
    setIsStorageLoading(true);
    setStatus("Loading Supabase media objects...");

    try {
      const response = await fetch("/api/media/objects", {
        credentials: "include"
      });
      const data = (await response.json()) as {
        bucket?: string;
        error?: string;
        files?: SupabaseStorageFile[];
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not load Supabase media objects.");
      }

      setStorageBucket(data.bucket || "");
      setStorageFiles(data.files || []);
      setSelectedStoragePaths((current) =>
        current.filter((path) => (data.files || []).some((file) => file.path === path))
      );
      setStatus(`Loaded ${(data.files || []).length} Supabase media object${(data.files || []).length === 1 ? "" : "s"}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load Supabase media objects.";
      setStatus(message);
    } finally {
      setIsStorageLoading(false);
    }
  }

  function toggleStoragePath(path: string) {
    setSelectedStoragePaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
    );
  }

  function createStorageFolder(event: FormEvent) {
    event.preventDefault();
    const name = storageFolderName.trim();

    if (!name) {
      return;
    }

    const now = new Date().toISOString();
    const parentId =
      selectedStorageFolderId === "all" || selectedStorageFolderId === "unfiled"
        ? undefined
        : selectedStorageFolderId;

    setState((current) => ({
      ...current,
      mediaLibraryFolders: [
        {
          id: uid("media-folder"),
          parentId,
          name,
          createdAt: now
        },
        ...current.mediaLibraryFolders
      ]
    }));
    setStorageFolderName("");
    setStatus(`Created storage folder ${name}.`);
  }

  function renameStorageFolder() {
    const name = storageFolderName.trim();

    if (!name || selectedStorageFolderId === "all" || selectedStorageFolderId === "unfiled") {
      return;
    }

    setState((current) => ({
      ...current,
      mediaLibraryFolders: current.mediaLibraryFolders.map((folder) =>
        folder.id === selectedStorageFolderId ? { ...folder, name } : folder
      )
    }));
    setStorageFolderName("");
    setStatus(`Renamed storage folder to ${name}.`);
  }

  function deleteStorageFolder() {
    if (selectedStorageFolderId === "all" || selectedStorageFolderId === "unfiled") {
      return;
    }

    const folder = state.mediaLibraryFolders.find(
      (item) => item.id === selectedStorageFolderId
    );
    const ids = mediaFolderDescendantIds(
      state.mediaLibraryFolders,
      selectedStorageFolderId
    );

    setState((current) => ({
      ...current,
      mediaLibraryFolders: current.mediaLibraryFolders.filter(
        (item) => !ids.has(item.id)
      ),
      mediaLibraryPlacements: current.mediaLibraryPlacements.filter(
        (placement) => !ids.has(placement.folderId)
      )
    }));
    setSelectedStorageFolderId("all");
    setStatus(
      `${folder?.name || "Storage folder"} removed. Files remain in Supabase and are now unfiled.`
    );
  }

  function moveStoragePathsToFolder(paths: string[], folderId?: string) {
    if (!paths.length) {
      return;
    }

    setState((current) => ({
      ...current,
      mediaLibraryPlacements: [
        ...current.mediaLibraryPlacements.filter(
          (placement) => !paths.includes(placement.storagePath)
        ),
        ...(folderId
          ? paths.map((path) => ({
              folderId,
              storagePath: path
            }))
          : [])
      ]
    }));
    setSelectedStoragePaths([]);
    setStatus(
      folderId
        ? `Moved ${paths.length} file${paths.length === 1 ? "" : "s"} in the media library. Supabase file links were not changed.`
        : `Moved ${paths.length} file${paths.length === 1 ? "" : "s"} to Unfiled. Supabase file links were not changed.`
    );
  }

  async function deleteSelectedStorageFiles() {
    if (!selectedStoragePaths.length) {
      setStatus("Select at least one Supabase file to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedStoragePaths.length} file${selectedStoragePaths.length === 1 ? "" : "s"} from Supabase Storage? This does not remove lecture records that reference them.`
    );

    if (!confirmed) {
      return;
    }

    setIsStorageLoading(true);
    setStatus("Deleting selected Supabase media objects...");

    try {
      const response = await fetch("/api/media/objects", {
        body: JSON.stringify({ paths: selectedStoragePaths }),
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        method: "DELETE"
      });
      const data = (await response.json()) as { deleted?: number; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Could not delete selected Supabase files.");
      }

      setSelectedStoragePaths([]);
      setState((current) => ({
        ...current,
        mediaLibraryPlacements: current.mediaLibraryPlacements.filter(
          (placement) => !selectedStoragePaths.includes(placement.storagePath)
        )
      }));
      setStatus(`Deleted ${data.deleted || 0} Supabase media object${data.deleted === 1 ? "" : "s"}.`);
      await loadStorageFiles();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not delete selected Supabase files.";
      setStatus(message);
    } finally {
      setIsStorageLoading(false);
    }
  }

  const reconstructionAudioCount = captureFiles.filter(
    (source) => fileKind(source.file) === "audio" || fileKind(source.file) === "video"
  ).length;
  const reconstructionImageCount = captureFiles.filter((source) => fileKind(source.file) === "image").length;
  const reconstructionDocumentCount = captureFiles.filter((source) => fileKind(source.file) === "document").length;
  const oneNoteContext = oneNoteSources
    .map((source, index) => [
      `OneNote page ${index + 1}: ${source.title}`,
      `Notebook: ${source.notebookName} | Section: ${source.sectionName}`,
      source.webUrl ? `Original page: ${source.webUrl}` : "",
      source.text
    ].filter(Boolean).join("\n"))
    .join("\n\n---\n\n");
  const reconstructionNotesReady = Boolean(
    captureForm.transcript.trim() ||
      captureForm.objective.trim() ||
      captureForm.emphasis.trim() ||
      captureForm.questions.trim()
  );
  const reconstructionTextbookCount = state.textbooks.filter(
    (textbook) => textbook.courseId === captureForm.courseId
  ).length;
  const reconstructionCourseProfile = state.courses.find(
    (course) => course.id === captureForm.courseId
  )?.studyProfile?.trim();
  const reconstructionBriefContext = [
    captureForm.objective.trim() && `Class-day objective: ${captureForm.objective.trim()}`,
    captureForm.emphasis.trim() && `Instructor emphasis / board context: ${captureForm.emphasis.trim()}`,
    captureForm.questions.trim() && `Unresolved question or uncertainty: ${captureForm.questions.trim()}`
  ]
    .filter(Boolean)
    .join("\n");
  const reconstructionAiContextPreview = [
    "AI ORGANIZING INSTRUCTIONS:",
    LECTURE_AI_INSTRUCTIONS,
    "REQUIRED OUTPUT STRUCTURE:",
    LECTURE_AI_OUTPUT_CONTRACT,
    "CURRENT RECONSTRUCTION CONTEXT:",
    `Course: ${courseLabel(captureForm.courseId)}`,
    `Topic: ${captureForm.title.trim() || "Untitled reconstruction"}`,
    reconstructionCourseProfile
      ? `Saved course study profile:\n${reconstructionCourseProfile}`
      : "Saved course study profile: none",
    reconstructionBriefContext
      ? `Class-day reconstruction brief:\n${reconstructionBriefContext}`
      : "Class-day reconstruction brief: none",
    captureForm.transcript.trim() || oneNoteContext
      ? `Pasted notes / selected OneNote pages:\n${[captureForm.transcript.trim(), oneNoteContext].filter(Boolean).join("\n\n")}`
      : "Pasted notes / selected OneNote pages: none",
    captureFiles.length
      ? [
          "Source media manifest:",
          ...captureFiles.map((source, index) =>
            [
              `${index + 1}. ${source.file.name}`,
              `role: ${source.role}`,
              source.caption.trim() ? `caption: ${source.caption.trim()}` : ""
            ]
              .filter(Boolean)
              .join(" | ")
          )
        ].join("\n")
      : "Source media manifest: none",
    reconstructionTextbookCount
      ? `Textbook context: relevant excerpts will be retrieved from ${reconstructionTextbookCount} indexed course textbook${reconstructionTextbookCount === 1 ? "" : "s"}.`
      : "Textbook context: no indexed course textbooks."
  ].join("\n\n");
  const reconstructionHasSource = Boolean(
    captureFiles.length || reconstructionNotesReady || oneNoteSources.length
  );
  const reconstructionReadyToBuild = Boolean(captureForm.courseId && reconstructionHasSource);
  const reconstructionReadinessLabel = !activeDraft
    ? "Start record"
    : reconstructionHasSource
      ? "Ready to build"
      : "Add sources";
  const activeRecordSourceLabel = `${captureFiles.length} attached source${captureFiles.length === 1 ? "" : "s"}`;

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
        <button
          className="brand brand-button"
          type="button"
          aria-controls="primary-navigation"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
        >
          <VaultMark />
          <div>
            <h1>LectureVault</h1>
            <p>Kevin C. Claypool</p>
          </div>
          <span className="mobile-menu-cue" aria-hidden="true">
            Menu
          </span>
        </button>
        <nav
          id="primary-navigation"
          className={isMobileMenuOpen ? "nav mobile-open" : "nav"}
          aria-label="Primary"
        >
          {[
            {
              label: "Workspace",
              items: [
                ["dashboard", "Dashboard"],
                ["courses", "Courses"],
                ["capture", "New Reconstruction"]
              ]
            },
            {
              label: "Library",
              items: [
                ["archive", "Vault"],
                ["storage", "Media Library"]
              ]
            },
            {
              label: "Study",
              items: [["builder", "Reviews"]]
            }
          ].map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([id, label]) => (
                <button
                  key={id}
                  className={
                    id === "builder" &&
                    ["builder", "exams", "exam"].includes(screen)
                      ? "active"
                      : screen === id
                        ? "active"
                        : ""
                  }
                  type="button"
                  onClick={() => {
                    setScreen(id as Screen);
                    setIsMobileMenuOpen(false);

                    if (id === "storage") {
                      void loadStorageFiles();
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
          <div className="mobile-sync-status" aria-live="polite">
            <span>Archive storage</span>
            <strong>{cloudSyncLabel}</strong>
          </div>
          <CompactUsageSummary state={state} className="mobile-usage-summary" />
        </nav>
        <div className="sidebar-note">
          <div className="sidebar-library-summary">
            <span>Archived items</span>
            <strong>{state.lectures.length}</strong>
            <span>Review sets</span>
            <strong>{state.exams.length}</strong>
          </div>
          <span className="sidebar-sync-status">{cloudSyncLabel}</span>
          <CompactUsageSummary state={state} className="sidebar-usage-summary" />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{screenTitle(screen)}</h2>
          </div>
          {screen === "dashboard" ? <WorkflowDiagram /> : null}
          <div className="topbar-actions">
            <button
              className={basketCount ? "cart-button active" : "cart-button"}
              type="button"
              onClick={() => setScreen("builder")}
              aria-label={`Review set draft with ${basketCount} selected source${basketCount === 1 ? "" : "s"}`}
            >
              <span className="cart-icon" aria-hidden="true">Review Draft</span>
              <strong>{basketCount}</strong>
            </button>
            {installPrompt ? (
              <button className="quiet-button install-button" type="button" onClick={() => void installLectureVault()}>
                Install app
              </button>
            ) : null}
            <button className="quiet-button" type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </header>

        {status && !isPassiveCloudStatus ? (
          <p className="status status-toast" role="status">
            {status}
          </p>
        ) : null}
        <PipelineStatus title={pipelineTitle} steps={pipelineSteps} />

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
            <form className="panel form-panel course-form-panel" onSubmit={addCourse}>
              <h3>Add Course</h3>
              <div className="course-form-fields">
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
                <label className="course-name-field">
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
              </div>
              <details className="course-form-profile">
                <summary>Course study profile <span>Optional</span></summary>
                <p>
                  Add exam format, allowed materials, notation or units, textbook scope, and recurring instructor priorities.
                </p>
                <textarea
                  value={courseForm.studyProfile}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      studyProfile: event.target.value
                    }))
                  }
                  rows={4}
                  placeholder="Study profile details"
                />
              </details>
              <button className="primary" type="submit">
                Save Course
              </button>
            </form>

            <section className="panel list-panel">
              <h3>Course List</h3>
              {state.courses.map((course) => {
                const reconstructionCount = state.lectures.filter(
                  (lecture) => lecture.courseId === course.id
                ).length;
                const textbookCount = state.textbooks.filter(
                  (textbook) => textbook.courseId === course.id
                ).length;

                return (
                <div className="row-card course-row" key={course.id}>
                  <div className="course-summary">
                    <strong>{course.code}</strong>
                    <span>{course.name}</span>
                    <small>{course.term}</small>
                    <div className="course-stats" aria-label={`${course.code} totals`}>
                      <span>{reconstructionCount} reconstructions</span>
                      <span>{textbookCount} textbooks</span>
                      <span>{course.syllabus ? "syllabus attached" : "syllabus not attached"}</span>
                    </div>
                  </div>
                  <div className="course-actions" aria-label={`${course.code} actions`}>
                    <label
                      className="button-like course-action-button course-syllabus-upload"
                      title={course.syllabus ? "Replace course syllabus PDF" : "Add course syllabus PDF"}
                    >
                      <FilePlus2 aria-hidden="true" size={16} strokeWidth={2} />
                      {syllabusProcessingCourseId === course.id
                        ? "Uploading..."
                        : course.syllabus
                          ? "Syllabus"
                          : "Syllabus"}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={Boolean(syllabusProcessingCourseId)}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void addCourseSyllabus(course.id, file);
                          }
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <label
                      className="button-like course-action-button course-textbook-upload"
                      title="Add textbook PDF"
                    >
                      <BookOpen aria-hidden="true" size={16} strokeWidth={2} />
                      {textbookProcessingCourseId === course.id
                        ? "Processing..."
                        : "Textbook"}
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,.pdf"
                        disabled={Boolean(textbookProcessingCourseId)}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          void addCourseTextbooks(
                            course.id,
                            Array.from(event.target.files || [])
                          );
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      className="course-action-button"
                      type="button"
                      title="Open course archive"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setScreen("archive");
                      }}
                    >
                      <FolderOpen aria-hidden="true" size={16} strokeWidth={2} />
                      Archive
                    </button>
                    <button
                      className="icon-button danger course-delete-button"
                      type="button"
                      aria-label={`Delete ${course.code} ${course.name}`}
                      title="Delete course"
                      onClick={() => deleteCourse(course.id)}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
                    </button>
                  </div>
                  {course.syllabus ? (
                    <div className="course-syllabus-item">
                      <div>
                        <span className="course-reference-kicker">Course syllabus</span>
                        <strong title={course.syllabus.name}>{course.syllabus.name}</strong>
                        <small>
                          {formatFileSize(course.syllabus.size)} - added {new Date(course.syllabus.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                      <div className="course-syllabus-actions">
                        {course.syllabus.storagePath ? (
                          <>
                            <a
                              className="button-like"
                              href={storageObjectUrl(
                                course.syllabus.storagePath,
                                course.syllabus.storageBucket
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                            <a
                              className="button-like"
                              href={storageObjectUrl(
                                course.syllabus.storagePath,
                                course.syllabus.storageBucket
                              )}
                              download={course.syllabus.name}
                            >
                              Download
                            </a>
                          </>
                        ) : null}
                        <button
                          className="icon-button danger"
                          type="button"
                          aria-label={`Remove ${course.syllabus.name} from ${course.code}`}
                          title="Remove syllabus from course"
                          onClick={() => removeCourseSyllabus(course.id)}
                        >
                          <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <details className="course-study-profile">
                    <summary>Study profile</summary>
                    <p>
                      Saved course context is included with every reconstruction for this course.
                    </p>
                    <textarea
                      value={courseProfileDrafts[course.id] ?? course.studyProfile ?? ""}
                      onChange={(event) =>
                        setCourseProfileDrafts((current) => ({
                          ...current,
                          [course.id]: event.target.value
                        }))
                      }
                      rows={5}
                      placeholder="Exam format, allowed materials, notation or units, textbook scope, and recurring instructor priorities."
                    />
                    <div className="button-row">
                      <button type="button" onClick={() => saveCourseStudyProfile(course.id)}>
                        Save study profile
                      </button>
                    </div>
                  </details>
                  {textbookCount ? (
                    <div className="course-textbook-list">
                      {state.textbooks
                        .filter((textbook) => textbook.courseId === course.id)
                        .map((textbook) => (
                          <div className="course-textbook-item" key={textbook.id}>
                            <div>
                              <strong>{textbook.name}</strong>
                              <small>
                                {formatFileSize(textbook.size)} -{" "}
                                {textbook.pageCount || 0} pages -{" "}
                                {textbook.indexedChunkCount || 0} indexed AI chunks
                                {textbook.embeddingUsage
                                  ? ` - ${formatTokenUsage(textbook.embeddingUsage)} embedding usage`
                                  : ""}
                              </small>
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteTextbook(textbook.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
                );
              })}
              {!state.courses.length ? (
                <p className="empty">No courses yet. Add a course to start archiving lectures.</p>
              ) : null}
            </section>
          </section>
        ) : null}

        {screen === "archive" ? (
          <section className="archive-layout">
            <div className="toolbar archive-toolbar">
              <label>
                Search lecture/media archive
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Title, course, formula, keyword, transcript..."
                />
              </label>
              {state.courses.length ? (
                <select
                  aria-label="Selected course"
                  value={selectedCourseId}
                  onChange={(event) => selectArchiveCourse(event.target.value)}
                >
                  {state.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} {course.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button type="button" onClick={() => setScreen("courses")}>Add a course</button>
              )}
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
                    disabled={!selectedCourseId}
                    placeholder={
                      !selectedCourseId
                        ? "Create a course first"
                        : selectedArchiveFolderId === "all" ||
                      selectedArchiveFolderId === "unfiled"
                          ? "New folder"
                          : "New subfolder"
                    }
                  />
                  <button type="submit" disabled={!selectedCourseId}>Add</button>
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
                {state.courses.length ? (
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
                ) : (
                  <p className="empty">Create a course first. Existing unassigned reconstructions will be recovered into its Lectures folder.</p>
                )}
              </aside>

              <section className="archive-list-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">
                      {archiveLectures.length} item
                      {archiveLectures.length === 1 ? "" : "s"}
                    </span>
                    <h3>Reconstructions</h3>
                  </div>
                  <span className={basketCount ? "draft-status active" : "draft-status"}>
                    {basketCount
                      ? `${basketCount} in review draft`
                      : "No review sources selected"}
                  </span>
                </div>
                <div className="lecture-list explorer-list" aria-label="Reconstructions in this folder">
                  <div className="lecture-list-header">
                    {([
                      ["name", "Name"],
                      ["date", "Date"],
                      ["size", "Source size"]
                    ] as Array<[ArchiveSortKey, string]>).map(([key, label]) => {
                      const isActive = archiveSortKey === key;
                      const direction = archiveSortDirection === "asc" ? "ascending" : "descending";
                      return (
                        <button
                          key={key}
                          className={isActive ? "sort-header active" : "sort-header"}
                          type="button"
                          aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}
                          onClick={() => changeArchiveSort(key)}
                        >
                          {label}
                          <span aria-hidden="true">{isActive ? (archiveSortDirection === "asc" ? "Asc" : "Desc") : "Sort"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {archiveLectures.map((lecture) => (
                    <LectureListRow
                      key={lecture.id}
                      lecture={lecture}
                      selected={selectedLectureId === lecture.id}
                      sourceSize={state.mediaItems
                        .filter((item) => item.lectureId === lecture.id)
                        .reduce((total, item) => total + item.size, 0)}
                      onSelect={() => setSelectedLectureId(lecture.id)}
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
                <h3>Details</h3>
                {selectedArchiveLecture ? (
                  <>
                    <span className="selected-lecture-kicker">Selected reconstruction</span>
                    <strong className="selected-lecture-title">{selectedArchiveLecture.title}</strong>
                    <span>{courseLabel(selectedArchiveLecture.courseId)}</span>
                    <small>{selectedArchiveLecture.date}</small>
                    <div className="selected-lecture-meta">
                      <MetadataBubble label={`${selectedArchiveMedia.length} media`}>
                        <strong>Source media</strong>
                        {selectedArchiveMedia.length ? selectedArchiveMedia.map((item) => (
                          <span className="metadata-tooltip-item" key={item.id}>
                            <b>{item.name}</b>
                            <small>{item.kind} · {formatFileSize(item.size)} · {item.sourceRole || "Source material"}</small>
                            {item.sourceCaption ? <em>{item.sourceCaption}</em> : null}
                          </span>
                        )) : <small>No source media was saved.</small>}
                      </MetadataBubble>
                      <MetadataBubble label={`${selectedArchiveConcepts.length} concepts`}>
                        <strong>Extracted concepts</strong>
                        {selectedArchiveConcepts.length ? selectedArchiveConcepts.map((concept) => {
                          const segment = selectedArchiveTranscript?.segments.find((item) => item.id === concept.sourceSegmentId);
                          const media = selectedArchiveMedia.find((item) => item.id === concept.mediaItemId);
                          return (
                            <span className="metadata-tooltip-item" key={concept.id}>
                              <b>{concept.title}</b>
                              <small>{segment ? `Source ${formatSeconds(segment.startSeconds)}` : "Source segment unavailable"}{media ? ` · ${media.name}` : ""}</small>
                              <em>{concept.detail}</em>
                            </span>
                          );
                        }) : <small>No concepts were extracted.</small>}
                      </MetadataBubble>
                      <span>
                        {formatFileSize(selectedArchiveSourceSize)} source size
                      </span>
                    </div>
                    <p>
                      <MathPreview text={selectedArchiveLecture.summary} />
                    </p>
                    <div className="button-row stacked">
                      <button
                        className={
                          builderSelectedLectureIds.includes(selectedArchiveLecture.id)
                            ? "review-draft-button"
                            : "primary"
                        }
                        type="button"
                        onClick={() => addLectureToBasket(selectedArchiveLecture.id)}
                        disabled={builderSelectedLectureIds.includes(selectedArchiveLecture.id)}
                      >
                        {builderSelectedLectureIds.includes(selectedArchiveLecture.id)
                          ? "In Review Draft"
                          : "Add to Review"}
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

        {screen === "storage" ? (
          <StorageManager
            bucket={storageBucket}
            files={storageFiles}
            folders={state.mediaLibraryFolders}
            isLoading={isStorageLoading}
            lectures={state.lectures}
            mediaItems={state.mediaItems}
            newFolderName={storageFolderName}
            placements={state.mediaLibraryPlacements}
            selectedFolderId={selectedStorageFolderId}
            selectedPaths={selectedStoragePaths}
            onCreateFolder={createStorageFolder}
            onDeleteSelected={() => void deleteSelectedStorageFiles()}
            onDeleteFolder={deleteStorageFolder}
            onMoveFiles={moveStoragePathsToFolder}
            onRenameFolder={renameStorageFolder}
            onRefresh={() => void loadStorageFiles()}
            onSelectFolder={setSelectedStorageFolderId}
            onSetNewFolderName={setStorageFolderName}
            onToggle={toggleStoragePath}
          />
        ) : null}

        {screen === "capture" ? (
          <form
            className="capture panel capture-workflow"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="capture-hero">
              <div>
                <span className="eyebrow">New Reconstruction</span>
                <h3>Reconstruct a class meeting</h3>
                <div
                  className="capture-guidance-ticker"
                  aria-label="Add source materials to one class record, then build a reconstruction."
                >
                  <div className="capture-guidance-track" aria-hidden="true">
                    <span>Sources: audio, handwritten OneNote PDFs, board images, or rough notes.</span>
                    <span>Class record: keep everything from this meeting together.</span>
                    <span>Destination: one source-grounded reconstruction for the selected course.</span>
                    <span>Sources: audio, handwritten OneNote PDFs, board images, or rough notes.</span>
                  </div>
                </div>
              </div>
              <div>
                <span className={reconstructionReadyToBuild ? "readiness-badge ready" : "readiness-badge"}>
                  {reconstructionReadinessLabel}
                </span>
                <div className="capture-steps" aria-label="Capture workflow">
                  <span className={!activeDraft ? "active" : "complete"}>1 Details</span>
                  <span className={activeDraft && !reconstructionHasSource ? "active" : reconstructionHasSource ? "complete" : ""}>2 Sources</span>
                  <span>3 Context</span>
                  <span className={reconstructionReadyToBuild ? "active" : ""}>4 Build</span>
                </div>
              </div>
            </div>
            <section className="capture-stage" aria-labelledby="reconstruction-details-heading">
              <div className="capture-stage-heading">
                <span>1</span>
                <div>
                  <h2 id="reconstruction-details-heading">Details</h2>
                  <p>Choose the course first, then start its shared class record.</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="capture-course-start">
                  <label>
                    Course
                    <select
                      value={captureForm.courseId}
                      disabled={Boolean(activeDraft)}
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
                  {activeDraft ? (
                    <div className="capture-record-status">
                      <strong>Class record active</strong>
                      <span>{courseLabel(activeDraft.courseId)} · {activeDraft.date}</span>
                      <small>{activeRecordSourceLabel} · shared across devices</small>
                      <button type="button" onClick={discardClassDayRecord}>
                        Discard class record
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary"
                      type="button"
                      onClick={startClassDayRecord}
                      disabled={!captureForm.courseId}
                    >
                      Start class record
                    </button>
                  )}
                </div>
                <label>
                  Reconstruction topic
                  <input
                    value={captureForm.title}
                    onChange={(event) =>
                      setCaptureForm((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Laplace transform examples"
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
            </section>

            {activeDraft ? (
              <>
            <section className="capture-stage" aria-labelledby="reconstruction-sources-heading">
              <div className="capture-stage-heading">
                <span>2</span>
                <div>
                  <h2 id="reconstruction-sources-heading">Sources</h2>
                  <p>Add the materials that document this class meeting.</p>
                </div>
              </div>
              <div className="source-readiness reconstruction-readiness" aria-label="Reconstruction source readiness">
                <div>
                  <strong>{reconstructionAudioCount}</strong>
                  <span>audio/video</span>
                </div>
                <div>
                  <strong>{reconstructionImageCount}</strong>
                  <span>board images</span>
                </div>
                <div>
                  <strong>{reconstructionDocumentCount}</strong>
                  <span>documents</span>
                </div>
                <div>
                  <strong>{reconstructionNotesReady ? "Ready" : "Optional"}</strong>
                  <span>notes</span>
                </div>
                <div>
                  <strong>{reconstructionTextbookCount}</strong>
                  <span>textbooks</span>
                </div>
              </div>
              <label
                className="dropzone lecture-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addCaptureFiles(Array.from(event.dataTransfer.files || []));
                }}
              >
                <span>Files for this reconstruction</span>
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
                    ? `${captureFiles.length} source file${captureFiles.length === 1 ? "" : "s"} attached`
                    : "Drop audio, board images, PDFs, or notes"}
                </strong>
                <small>
                  Every source type is optional. Add whichever materials you have
                  for this class day; at least one meaningful source is needed.
                </small>
              </label>

              <details className="capture-disclosure" aria-label="Android direct share">
                <summary>
                  <span><strong>Share OneNote pages or lecture audio from Android</strong><small>Send handwritten PDFs/images or your MP3 directly into this workspace.</small></span>
                  <span className="disclosure-state">Optional</span>
                </summary>
                <div className="capture-disclosure-body">
                  <p>Install LectureVault once, sign in, then use the Share action in OneNote or your recorder and choose LectureVault. The original PDF, image, or MP3 uploads directly to Supabase and appears in Attached Files.</p>
                  {installPrompt ? <button type="button" onClick={() => void installLectureVault()}>Install app</button> : null}
                </div>
              </details>

            {captureFiles.length ? (
              <div className="capture-media-panel">
                <div className="section-heading">
                  <div>
                    <span className="pill">Files</span>
                    <h3>Attached Files</h3>
                    <p className="capture-file-purpose">Choose how AI should interpret each file. This classifies the source; it does not open another menu or change the original file.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCaptureFiles([])}
                  >
                    Clear Files
                  </button>
                </div>
                <div className="capture-media-list">
                  {captureFiles.map((source) => {
                    const { file } = source;
                    const key = fileKey(file);
                    const kind = fileKind(file);

                    return (
                      <div className="capture-media-item" key={key}>
                        <span className="media-kind">{kind}</span>
                        <div>
                          <strong>{file.name}</strong>
                          <small>
                            {formatFileSize(source.size ?? file.size)} -{" "}
                            {file.type || "unknown type"}
                            {source.storagePath ? " - stored in Supabase" : ""}
                          </small>
                        </div>
                        <label className="capture-source-role">
                          <span>Use this file as</span>
                          <select
                            value={source.role}
                            onChange={(event) => {
                              const role = event.target.value;
                              updateCaptureSource(key, { role });
                              setStatus(`${file.name} will be used as ${role}.`);
                            }}
                          >
                            <option>Lecture audio</option>
                            <option>Lecture recording</option>
                            <option>Board work</option>
                            <option>Worked example</option>
                            <option>OneNote export</option>
                            <option>Reference handout</option>
                            <option>Other context</option>
                          </select>
                          <small className="capture-source-role-confirmation">AI will use this as {sourceRoleDescription(source.role)}.</small>
                        </label>
                        <label className="capture-source-caption">
                          <span>Caption <small>Optional</small></span>
                          <input
                            value={source.caption}
                            onChange={(event) => updateCaptureSource(key, { caption: event.target.value })}
                            placeholder="What should AI inspect or preserve?"
                          />
                        </label>
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

              <details className="capture-disclosure">
                <summary>
                  <span><strong>Paste typed notes or a partial transcript</strong><small>Optional when your attached sources already tell the story.</small></span>
                  <span className="disclosure-state">{captureForm.transcript.trim() ? "Added" : "Optional"}</span>
                </summary>
                <div className="capture-disclosure-body">
                  <label>
                    Notes for this class day
                    <textarea
                      value={captureForm.transcript}
                      onChange={(event) =>
                        setCaptureForm((current) => ({
                          ...current,
                          transcript: event.target.value
                        }))
                      }
                      rows={7}
                      placeholder="Paste typed notes, a partial transcript, or rough notes. This is optional if you attached audio, images, or documents."
                    />
                  </label>
                </div>
              </details>
            </section>

            <section className="capture-stage" aria-labelledby="reconstruction-context-heading">
              <div className="capture-stage-heading">
                <span>3</span>
                <div>
                  <h2 id="reconstruction-context-heading">Context</h2>
                  <p>Clarify what matters when the source materials cannot say it themselves.</p>
                </div>
              </div>
              <details className="capture-disclosure capture-brief">
                <summary>
                  <span><strong>Optional AI instructions</strong><small>Add instructor emphasis or questions only when the sources cannot say it themselves.</small></span>
                  <span className="disclosure-state">{captureForm.objective.trim() || captureForm.emphasis.trim() || captureForm.questions.trim() ? "Added" : "Optional"}</span>
                </summary>
                <div className="capture-disclosure-body">
                <div className="form-grid">
                  <label>
                    Today&apos;s objective
                    <input
                      value={captureForm.objective}
                      onChange={(event) =>
                        setCaptureForm((current) => ({ ...current, objective: event.target.value }))
                      }
                      placeholder="Apply nodal analysis to multi-source circuits"
                    />
                  </label>
                  <label>
                    Instructor emphasis / board context
                    <textarea
                      value={captureForm.emphasis}
                      onChange={(event) =>
                        setCaptureForm((current) => ({ ...current, emphasis: event.target.value }))
                      }
                      rows={4}
                      placeholder="Worked problem on the left board is exam-relevant. Preserve the method and why each step is used."
                    />
                  </label>
                  <label>
                    Unresolved question <small>Optional</small>
                    <textarea
                      value={captureForm.questions}
                      onChange={(event) =>
                        setCaptureForm((current) => ({ ...current, questions: event.target.value }))
                      }
                      rows={4}
                      placeholder="The final substitution was hard to hear; flag it rather than guessing."
                    />
                  </label>
                </div>
                <details className="ai-context-preview">
                  <summary><strong>View full AI build context</strong><small>Read-only template, current source manifest, and instructions</small></summary>
                  <textarea value={reconstructionAiContextPreview} readOnly rows={12} />
                  <span>Audio transcription and retrieved textbook excerpts are added during the build.</span>
                </details>
                </div>
              </details>
            </section>

            <section className="capture-stage" aria-labelledby="reconstruction-build-heading">
              <div className="capture-stage-heading">
                <span>4</span>
                <div>
                  <h2 id="reconstruction-build-heading">Build</h2>
                  <p>Generate and save the completed class-day reconstruction.</p>
                </div>
              </div>
              <div className="capture-actions">
                <div className="capture-action-copy">
                  <span className="eyebrow">Ready when you are</span>
                  <p>
                    Add the sources you have, then build one complete reconstruction
                    for this class day.
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="primary"
                    type="button"
                    onClick={() => void buildReconstruction()}
                    disabled={isLectureGenerating || !reconstructionReadyToBuild}
                  >
                    {isLectureGenerating ? "Working..." : "Build Reconstruction"}
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
                    Draft Notes
                  </button>
                </div>
              </div>
            </section>
              </>
            ) : (
              <div className="capture-next-step" role="status">
                <strong>Start the class record to add sources.</strong>
                <span>Your audio, handwritten OneNote PDF, and images will then sync into this selected course from either device.</span>
              </div>
            )}
          </form>
        ) : null}

        {screen === "builder" ? (
          <section className="exam-builder-layout">
            <aside className="panel archive-folder-panel">
              <div className="section-heading">
                <div>
                  <span className="pill">Archive</span>
                  <h3>Browse Archive</h3>
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
                  Add Shown Lectures to Review
                </button>
              </div>
              <div className="section-heading compact-heading builder-list-heading">
                <div>
                  <span className="pill">
                    {builderLectures.length} reconstruction{builderLectures.length === 1 ? "" : "s"}
                  </span>
                  <h3>Course Reconstructions</h3>
                </div>
                <span className={basketCount ? "draft-status active" : "draft-status"}>
                  {basketCount ? `${basketCount} in review draft` : "Select sources to review"}
                </span>
              </div>
              <div className="lecture-list explorer-list" aria-label="Course reconstructions">
                <div className="lecture-list-header">
                  {([
                    ["name", "Name"],
                    ["date", "Date"],
                    ["size", "Source size"]
                  ] as Array<[ArchiveSortKey, string]>).map(([key, label]) => {
                    const isActive = builderSortKey === key;
                    const direction = builderSortDirection === "asc" ? "ascending" : "descending";
                    return (
                      <button
                        key={key}
                        className={isActive ? "sort-header active" : "sort-header"}
                        type="button"
                        aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}
                        onClick={() => changeBuilderSort(key)}
                      >
                        {label}
                        <span aria-hidden="true">{isActive ? (builderSortDirection === "asc" ? "Asc" : "Desc") : "Sort"}</span>
                      </button>
                    );
                  })}
                </div>
                {builderLectures.map((lecture) => (
                  <LectureListRow
                    key={lecture.id}
                    lecture={lecture}
                    selected={selectedBuilderLecture?.id === lecture.id}
                    sourceSize={state.mediaItems
                      .filter((item) => item.lectureId === lecture.id)
                      .reduce((total, item) => total + item.size, 0)}
                    onSelect={() => setSelectedBuilderLectureId(lecture.id)}
                  />
                ))}
                {!builderLectures.length ? (
                  <p className="empty panel">
                    No archive materials match this course, folder, and search.
                  </p>
                ) : null}
              </div>
              {selectedBuilderLecture ? (
                <section className="panel builder-source-preview">
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="selected-lecture-kicker">Selected reconstruction</span>
                      <h3>{selectedBuilderLecture.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLectureId(selectedBuilderLecture.id);
                        setScreen("lecture");
                      }}
                    >
                      Open detail
                    </button>
                  </div>
                  <div className="selected-lecture-meta">
                    <span>{selectedBuilderLecture.date}</span>
                    <span>{state.mediaItems.filter((item) => item.lectureId === selectedBuilderLecture.id).length} media</span>
                    <span>{state.concepts.filter((concept) => concept.lectureId === selectedBuilderLecture.id).length} concepts</span>
                  </div>
                  <p>{selectedBuilderLecture.summary}</p>
                  <button
                    className={builderSelectedLectureIds.includes(selectedBuilderLecture.id) ? "review-draft-button" : "primary"}
                    type="button"
                    onClick={() => toggleBuilderLecture(selectedBuilderLecture.id)}
                  >
                    {builderSelectedLectureIds.includes(selectedBuilderLecture.id) ? "Remove from Review" : "Add to Review"}
                  </button>
                </section>
              ) : null}
            </section>

            <aside className="panel side-panel source-inspector review-draft-panel">
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
                    aria-describedby="review-draft-next-step"
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
                <div className="review-draft-source-list" aria-label="Selected reconstructions">
                  <div className="review-draft-source-heading">
                    <strong>Selected reconstructions</strong>
                    <span>
                      {builderSelectedLectures.length} source
                      {builderSelectedLectures.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {builderSelectedLectures.map((lecture) => (
                    <div className="review-draft-source-row" key={lecture.id}>
                      <div>
                        <strong>{lecture.title}</strong>
                        <span>{lecture.date}</span>
                      </div>
                      <button
                        aria-label={`Remove ${lecture.title} from the review set draft`}
                        className="review-draft-remove"
                        type="button"
                        onClick={() => toggleBuilderLecture(lecture.id)}
                      >
                        <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                  {!builderSelectedLectures.length ? (
                    <p className="empty">
                      Select archived lectures to build this review set.
                    </p>
                  ) : null}
                </div>
                <p className="review-draft-next-step" id="review-draft-next-step">
                  {!builderSelectedLectures.length
                    ? "Select one or more reconstructions to begin."
                    : !examForm.name.trim()
                      ? "Name this review set to continue."
                      : "Create the review set to unlock AI generation and PDF export."}
                </p>
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
            isGeneratingReview={isReviewGenerating}
            isRenderingPdf={isPdfRendering}
            isBuildingGptPackage={isGptPackageBuilding}
            pdfStatus={reviewPdfStatus}
            courseLabel={courseLabel}
            onInstructionsChange={updateSelectedReviewContext}
            onAdd={addLectureToExam}
            onRemove={removeLectureFromExam}
            onGenerate={generateGuide}
            onDownloadPdf={downloadExamReviewPdf}
            onDownloadGptPackage={downloadGptPackage}
            onDelete={() => deleteExam(selectedExam.id)}
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
    lecture: "Reconstruction detail",
    capture: "New reconstruction",
    storage: "Media Library",
    builder: "Reviews",
    exams: "Review sets",
    exam: "Review set"
  };
  return titles[screen];
}

function VaultMark() {
  return (
    <div className="mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <rect className="vault-body" x="8" y="14" width="32" height="26" rx="5" />
        <path className="vault-door" d="M15 14V10.8C15 7 18 4 21.8 4h4.4C30 4 33 7 33 10.8V14" />
        <circle className="vault-dial" cx="24" cy="27" r="6.2" />
        <path className="vault-spoke" d="M24 20.8v3.2M24 30v3.2M17.8 27H21M27 27h3.2M19.6 22.6l2.2 2.2M26.2 29.2l2.2 2.2M28.4 22.6l-2.2 2.2M21.8 29.2l-2.2 2.2" />
      </svg>
    </div>
  );
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
        <VaultMark />
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
        <VaultMark />
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
          <span>Reconstructions</span>
        </div>
        <div className="metric">
          <strong>{state.transcripts.length}</strong>
          <span>Artifacts</span>
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
              <span className="eyebrow">New Reconstruction</span>
              <h3>Reconstruct a class meeting</h3>
            </div>
          </div>
          <p>
            Combine audio, notes, board images, and textbook context into one
            daily source-grounded reconstruction.
          </p>
        </section>

        <section className="panel action-panel basket-action">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Reviews</span>
              <h3>Build from saved reconstructions</h3>
            </div>
            <button type="button" onClick={() => setScreen("builder")}>
              Create Review Set
            </button>
          </div>
          <p>
            Select archived reconstruction sources, create a review set, and
            generate one focused AI review with PDF export.
          </p>
        </section>
      </div>

      <div className="content-grid">
        <section className="panel list-panel">
          <div className="section-heading compact-heading">
            <div>
              <h3>Recent Reconstructions</h3>
              <p className="section-note">Open a daily class record or source bundle.</p>
            </div>
          </div>
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
          <div className="section-heading compact-heading">
            <div>
              <h3>Review Sets</h3>
              <p className="section-note">Build exam prep from saved reconstructions.</p>
            </div>
          </div>
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

function WorkflowDiagram() {
  const steps = [
    ["1", "Capture", "Audio, notes, images"],
    ["2", "Build", "AI creates the class record"],
    ["3", "Archive", "Keep sources connected"],
    ["4", "Review", "Prepare for the exam"]
  ];

  return (
    <ol className="workflow-diagram" aria-label="LectureVault workflow">
      {steps.map(([number, title, detail]) => (
        <li key={number}>
          <span className="workflow-diagram-number">{number}</span>
          <span className="workflow-diagram-copy">
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function PipelineStatus({
  steps,
  title
}: {
  steps: PipelineStep[];
  title: string;
}) {
  if (!steps.length) {
    return null;
  }

  return (
    <section className="pipeline-panel" aria-label={title || "AI pipeline status"}>
      <div className="section-heading">
        <div>
          <span className="pill">Pipeline</span>
          <h3>{title || "Working"}</h3>
        </div>
      </div>
      <div className="pipeline-steps">
        {steps.map((step) => (
          <div className={`pipeline-step ${step.status}`} key={step.id}>
            <span aria-hidden="true" />
            <div>
              <strong>{step.label}</strong>
              {step.detail ? <small>{step.detail}</small> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactUsageSummary({
  className,
  state
}: {
  className: string;
  state: VaultState;
}) {
  const reconstructionUsage = state.transcripts.reduce(
    (total, transcript) => addTokenUsage(total, transcript.usage),
    {} as TokenUsage
  );
  const textbookUsage = state.textbooks.reduce(
    (total, textbook) => addTokenUsage(total, textbook.embeddingUsage),
    {} as TokenUsage
  );
  const reviewUsage = state.studyGuides.reduce(
    (total, guide) => addTokenUsage(total, guide.usage),
    {} as TokenUsage
  );
  const totalUsage = [reconstructionUsage, textbookUsage, reviewUsage].reduce(
    (total, usage) => addTokenUsage(total, usage),
    {} as TokenUsage
  );

  return (
    <div className={className} aria-label="AI token usage summary">
      <span className="compact-usage-label">AI usage</span>
      <strong title={usageHasTokens(totalUsage) ? formatTokenUsage(totalUsage) : undefined}>
        {usageHasTokens(totalUsage) ? formatCompactTokenUsage(totalUsage) : "No usage yet"}
      </strong>
      <div className="compact-usage-breakdown">
        <span title={usageHasTokens(reconstructionUsage) ? formatTokenUsage(reconstructionUsage) : undefined}>Rebuild <b>{formatCompactTokenUsage(reconstructionUsage)}</b></span>
        <span title={usageHasTokens(textbookUsage) ? formatTokenUsage(textbookUsage) : undefined}>Textbooks <b>{formatCompactTokenUsage(textbookUsage)}</b></span>
        <span title={usageHasTokens(reviewUsage) ? formatTokenUsage(reviewUsage) : undefined}>Reviews <b>{formatCompactTokenUsage(reviewUsage)}</b></span>
      </div>
    </div>
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

function StorageManager({
  bucket,
  files,
  folders,
  isLoading,
  lectures,
  mediaItems,
  newFolderName,
  placements,
  selectedFolderId,
  selectedPaths,
  onCreateFolder,
  onDeleteSelected,
  onDeleteFolder,
  onMoveFiles,
  onRenameFolder,
  onRefresh,
  onSelectFolder,
  onSetNewFolderName,
  onToggle
}: {
  bucket: string;
  files: SupabaseStorageFile[];
  folders: MediaLibraryFolder[];
  isLoading: boolean;
  lectures: Lecture[];
  mediaItems: MediaItem[];
  newFolderName: string;
  placements: MediaLibraryPlacement[];
  selectedFolderId: string;
  selectedPaths: string[];
  onCreateFolder: (event: FormEvent) => void;
  onDeleteSelected: () => void;
  onDeleteFolder: () => void;
  onMoveFiles: (paths: string[], folderId?: string) => void;
  onRenameFolder: () => void;
  onRefresh: () => void;
  onSelectFolder: (folderId: string) => void;
  onSetNewFolderName: (value: string) => void;
  onToggle: (path: string) => void;
}) {
  const [fileQuery, setFileQuery] = useState("");
  const [sortKey, setSortKey] = useState<MediaSortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [activeFilePath, setActiveFilePath] = useState("");
  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const storageUsagePercent = Math.min(100, (totalBytes / PRO_MEDIA_STORAGE_QUOTA_BYTES) * 100);
  const storageRemainingBytes = Math.max(0, PRO_MEDIA_STORAGE_QUOTA_BYTES - totalBytes);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const selectedFolderIds =
    selectedFolderId === "all" || selectedFolderId === "unfiled"
      ? new Set<string>()
      : mediaFolderDescendantIds(folders, selectedFolderId);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const placementByPath = new Map(
    placements
      .filter((placement) => folderIds.has(placement.folderId))
      .map((placement) => [placement.storagePath, placement.folderId])
  );
  const visibleFiles = files.filter((file) => {
    const placement = placementByPath.get(file.path);

    if (selectedFolderId === "all") {
      return true;
    }

    if (selectedFolderId === "unfiled") {
      return !placement;
    }

    return placement ? selectedFolderIds.has(placement) : false;
  });
  const listedFiles = visibleFiles
    .filter((file) => {
      const term = fileQuery.trim().toLowerCase();
      return !term || `${file.name} ${file.mimeType || ""}`.toLowerCase().includes(term);
    })
    .sort((first, second) => {
      const comparison =
        sortKey === "size"
          ? (first.size || 0) - (second.size || 0)
          : sortKey === "date"
            ? (first.updatedAt || first.createdAt || "").localeCompare(second.updatedAt || second.createdAt || "")
            : first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  const visibleBytes = listedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  const selectedFolder =
    selectedFolderId === "all"
      ? "All files"
      : selectedFolderId === "unfiled"
        ? "Unfiled"
        : folderById.get(selectedFolderId)?.name || "Folder";
  const selectedFolderCanEdit =
    selectedFolderId !== "all" && selectedFolderId !== "unfiled";
  const lectureById = new Map(lectures.map((lecture) => [lecture.id, lecture]));
  const activeFile = listedFiles.find((file) => file.path === activeFilePath) || listedFiles[0];

  function changeSort(key: MediaSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "name" ? "asc" : "desc");
  }

  function pathsFromDrop(event: DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/json");

    if (!raw) {
      return [];
    }

    try {
      const paths = JSON.parse(raw);
      return Array.isArray(paths)
        ? paths.filter((path): path is string => typeof path === "string")
        : [];
    } catch {
      return [];
    }
  }

  function dragFiles(event: DragEvent<HTMLElement>, path: string) {
    const paths = selectedPaths.includes(path) ? selectedPaths : [path];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(paths));
  }

  function dropOnFolder(event: DragEvent<HTMLElement>, folderId?: string) {
    event.preventDefault();
    const paths = pathsFromDrop(event);

    if (paths.length) {
      onMoveFiles(paths, folderId);
    }
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function fileCountForFolder(folderId?: string) {
    if (!folderId) {
      return files.filter((file) => !placementByPath.get(file.path)).length;
    }

    const ids = mediaFolderDescendantIds(folders, folderId);
    return files.filter((file) => {
      const placement = placementByPath.get(file.path);
      return placement ? ids.has(placement) : false;
    }).length;
  }

  function renderFolder(folder: MediaLibraryFolder, depth = 0): ReactNode {
    const children = folders
      .filter((item) => item.parentId === folder.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const active = selectedFolderId === folder.id;

    return (
      <div className="storage-folder-branch" key={folder.id}>
        <button
          className={active ? "storage-folder-button active" : "storage-folder-button"}
          onClick={() => onSelectFolder(folder.id)}
          onDragOver={allowDrop}
          onDrop={(event) => dropOnFolder(event, folder.id)}
          style={{ "--depth": depth } as CSSProperties}
          type="button"
        >
          <span className="folder-icon" aria-hidden="true" />
          <span>{folder.name}</span>
          <small>{fileCountForFolder(folder.id)}</small>
        </button>
        {children.length ? (
          <div className="storage-folder-children">
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  const rootFolders = folders
    .filter((folder) => !folder.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeFileUsageItems = activeFile
    ? mediaItems.filter((item) => item.storagePath === activeFile.path)
    : [];
  const activeFileUsageNames = Array.from(
    new Set(
      activeFileUsageItems
        .map((item) => lectureById.get(item.lectureId)?.title)
        .filter((title): title is string => Boolean(title))
    )
  );
  const activeFileUrl = activeFile ? storageObjectUrl(activeFile.path, bucket) : "";

  return (
    <section className="storage-layout">
      <aside className="panel side-panel storage-browser-panel">
        <div className="section-heading">
          <div>
            <span className="pill">{bucket || "Supabase Storage"}</span>
            <h3>Media Library</h3>
          </div>
        </div>
        <p>
          Organize files here without renaming or moving the actual Supabase
          objects. Lecture and review links keep pointing to the original file
          paths.
        </p>
        <div className="media-storage-usage" aria-label="Supabase media storage usage">
          <div>
            <span>Supabase media storage</span>
            <strong>{formatFileSize(totalBytes)} of 100 GB</strong>
          </div>
          <div
            aria-label={`${storageUsagePercent.toFixed(2)} percent of included media storage used`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={storageUsagePercent}
            className="media-storage-meter"
            role="progressbar"
          >
            <span style={{ width: `${Math.max(1, storageUsagePercent)}%` }} />
          </div>
          <small>{formatFileSize(storageRemainingBytes)} remaining on the included Pro storage allowance.</small>
        </div>

        <form className="storage-folder-form" onSubmit={onCreateFolder}>
          <input
            aria-label="New storage folder"
            onChange={(event) => onSetNewFolderName(event.target.value)}
            placeholder="New folder"
            value={newFolderName}
          />
          <button type="submit">Add</button>
        </form>
        <div className="storage-folder-actions">
          <button
            type="button"
            onClick={onRenameFolder}
            disabled={!selectedFolderCanEdit || !newFolderName.trim()}
          >
            Rename
          </button>
          <button
            className="danger"
            type="button"
            onClick={onDeleteFolder}
            disabled={!selectedFolderCanEdit}
          >
            Delete
          </button>
        </div>

        <div className="storage-folder-tree">
          <button
            className={
              selectedFolderId === "all"
                ? "storage-folder-button active"
                : "storage-folder-button"
            }
            onClick={() => onSelectFolder("all")}
            onDragOver={allowDrop}
            onDrop={(event) => dropOnFolder(event, undefined)}
            style={{ "--depth": 0 } as CSSProperties}
            type="button"
          >
            <span className="folder-icon" aria-hidden="true" />
            <span>All files</span>
            <small>{files.length}</small>
          </button>
          <button
            className={
              selectedFolderId === "unfiled"
                ? "storage-folder-button active"
                : "storage-folder-button"
            }
            onClick={() => onSelectFolder("unfiled")}
            onDragOver={allowDrop}
            onDrop={(event) => dropOnFolder(event, undefined)}
            style={{ "--depth": 0 } as CSSProperties}
            type="button"
          >
            <span className="folder-icon" aria-hidden="true" />
            <span>Unfiled</span>
            <small>{fileCountForFolder()}</small>
          </button>
          {rootFolders.map((folder) => renderFolder(folder))}
        </div>
      </aside>

      <article className="panel detail-main storage-explorer-panel">
        <div className="section-heading">
          <div>
            <span className="pill">
              {listedFiles.length} file{listedFiles.length === 1 ? "" : "s"}
            </span>
            <h3>{selectedFolder}</h3>
          </div>
          <span>
            {formatFileSize(visibleBytes)} visible / {formatFileSize(totalBytes)} stored
          </span>
        </div>
        <div className="storage-explorer-toolbar">
          <label>
            Search files
            <input
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="Name, first letter, or file type..."
            />
          </label>
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="danger"
            type="button"
            onClick={onDeleteSelected}
            disabled={isLoading || !selectedPaths.length}
          >
            Delete selected
          </button>
        </div>

        <div className="storage-list storage-explorer-list" aria-label="Files in selected media folder">
          <div className="storage-explorer-header">
            {([
              ["name", "Name"],
              ["date", "Date"],
              ["size", "Size"]
            ] as Array<[MediaSortKey, string]>).map(([key, label]) => {
              const isActive = sortKey === key;
              const direction = sortDirection === "asc" ? "ascending" : "descending";
              return (
                <button
                  key={key}
                  className={isActive ? "sort-header active" : "sort-header"}
                  type="button"
                  aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}
                  onClick={() => changeSort(key)}
                >
                  {label}
                  <span aria-hidden="true">{isActive ? (sortDirection === "asc" ? "Asc" : "Desc") : "Sort"}</span>
                </button>
              );
            })}
          </div>
          {listedFiles.map((file) => {
            const active = activeFile?.path === file.path;

            return (
              <div
                className={active ? "storage-row explorer-row selected" : "storage-row explorer-row"}
                draggable
                key={file.path}
                onClick={() => setActiveFilePath(file.path)}
                onDragStart={(event) => dragFiles(event, file.path)}
              >
                <label className="storage-check">
                  <input
                    type="checkbox"
                    checked={selectedPaths.includes(file.path)}
                    onChange={() => onToggle(file.path)}
                  />
                  <span title={file.name}>{file.name}</span>
                </label>
                <time dateTime={file.updatedAt || file.createdAt}>{file.updatedAt || file.createdAt ? new Date(file.updatedAt || file.createdAt || "").toLocaleDateString() : "No date"}</time>
                <span>{typeof file.size === "number" ? formatFileSize(file.size) : "Unknown"}</span>
              </div>
            );
          })}
          {!listedFiles.length ? (
            <p className="empty storage-explorer-empty">
              {isLoading
                ? "Loading Supabase media files..."
                : fileQuery.trim()
                  ? "No files match this search."
                  : "No files in this folder yet. Drag files here or upload lecture media."}
            </p>
          ) : null}
        </div>
      </article>

      <aside className="panel side-panel storage-file-details">
        <h3>Details</h3>
        {activeFile ? (
          <>
            <span className="selected-lecture-kicker">Selected file</span>
            <strong className="selected-lecture-title" title={activeFile.name}>{activeFile.name}</strong>
            <span>{activeFile.mimeType || "Unknown file type"}</span>
            <small>{activeFile.updatedAt || activeFile.createdAt ? new Date(activeFile.updatedAt || activeFile.createdAt || "").toLocaleString() : "No date available"}</small>
            <div className="selected-lecture-meta">
              <MetadataBubble label={typeof activeFile.size === "number" ? formatFileSize(activeFile.size) : "Unknown size"}>
                <strong>File metadata</strong>
                <span className="metadata-tooltip-item">
                  <b>{activeFile.mimeType || "Unknown file type"}</b>
                  <small>{activeFile.updatedAt || activeFile.createdAt ? `Updated ${new Date(activeFile.updatedAt || activeFile.createdAt || "").toLocaleString()}` : "No date available"}</small>
                  <em>{activeFile.path}</em>
                </span>
              </MetadataBubble>
              <MetadataBubble label={activeFileUsageNames.length ? `Used by ${activeFileUsageNames.length} reconstruction${activeFileUsageNames.length === 1 ? "" : "s"}` : "No reconstruction reference"}>
                <strong>Reconstruction references</strong>
                {activeFileUsageNames.length ? activeFileUsageNames.map((name) => (
                  <span className="metadata-tooltip-item" key={name}>
                    <b>{name}</b>
                    <small>References this original Supabase file.</small>
                  </span>
                )) : <small>This file is not referenced by a saved reconstruction.</small>}
              </MetadataBubble>
            </div>
            {activeFileUsageNames.length ? (
              <div className="storage-reference-list">
                <strong>Referenced by</strong>
                {activeFileUsageNames.map((name) => <span key={name}>{name}</span>)}
              </div>
            ) : null}
            <small className="storage-object-path">{activeFile.path}</small>
            <div className="button-row stacked">
              <a className="button-like" href={activeFileUrl} target="_blank" rel="noreferrer">Open file</a>
              <a className="button-like" href={activeFileUrl} download={activeFile.name}>Download</a>
            </div>
          </>
        ) : (
          <p className="empty">Select a media file to inspect it.</p>
        )}
      </aside>
    </section>
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

function MetadataBubble({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="metadata-bubble" tabIndex={0}>
      {label}
      <span className="metadata-tooltip" role="tooltip">
        {children}
      </span>
    </span>
  );
}

function LectureListRow({
  lecture,
  sourceSize,
  selected = false,
  onSelect
}: {
  lecture: Lecture;
  sourceSize: number;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={selected ? "lecture-list-row explorer-row selected" : "lecture-list-row explorer-row"}
      draggable
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/lecture-id", lecture.id)
      }
    >
      <strong className="explorer-row-name" title={lecture.title}>{lecture.title}</strong>
      <time dateTime={lecture.date}>{lecture.date}</time>
      <span>{formatFileSize(sourceSize)}</span>
    </article>
  );
}

function OneNoteExplorer({
  childrenById,
  depth = 0,
  expandedIds,
  isLoading,
  nodes,
  onToggle,
  selectedPageIds
}: {
  childrenById: Record<string, OneNoteLibraryItem[]>;
  depth?: number;
  expandedIds: string[];
  isLoading: boolean;
  nodes: OneNoteLibraryItem[];
  onToggle: (node: OneNoteLibraryItem) => void;
  selectedPageIds: string[];
}) {
  return (
    <div className={depth ? "onenote-explorer nested" : "onenote-explorer"} aria-label={depth ? undefined : "OneNote file explorer"}>
      {nodes.map((node) => {
        const isPage = node.kind === "page";
        const isExpanded = expandedIds.includes(node.id);
        const childNodes = childrenById[node.id] || [];
        const label = node.displayName || node.title || "Untitled OneNote item";
        const selected = selectedPageIds.includes(node.id);

        return (
          <div className="onenote-explorer-branch" key={node.id}>
            <div
              className={isPage ? "onenote-explorer-row page" : "onenote-explorer-row folder"}
              style={{ "--depth": depth } as CSSProperties}
            >
              <button
                aria-expanded={isPage ? undefined : isExpanded}
                className="onenote-explorer-item"
                type="button"
                onClick={() => onToggle(node)}
              >
                <span className="onenote-node-icon" aria-hidden="true" />
                <span>{label}</span>
              </button>
              {isPage ? (
                <button
                  className={selected ? "review-draft-button" : ""}
                  disabled={isLoading || selected}
                  type="button"
                  onClick={() => onToggle(node)}
                >
                  {selected ? "Selected" : "Add"}
                </button>
              ) : null}
            </div>
            {!isPage && isExpanded ? (
              childNodes.length ? (
                <OneNoteExplorer
                  childrenById={childrenById}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  isLoading={isLoading}
                  nodes={childNodes}
                  onToggle={onToggle}
                  selectedPageIds={selectedPageIds}
                />
              ) : (
                <small className="onenote-explorer-empty" style={{ "--depth": depth + 1 } as CSSProperties}>{isLoading ? "Loading..." : "No folders or pages here."}</small>
              )
            ) : null}
          </div>
        );
      })}
    </div>
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
            <h4>Reconstruction AI Usage</h4>
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
          {transcript?.oneNoteSources?.length ? (
            <div className="usage-source-list">
              <h4>OneNote Pages Used</h4>
              {transcript.oneNoteSources.map((source) => (
                <span key={source.id}>
                  {source.webUrl ? <a href={source.webUrl} target="_blank" rel="noreferrer">{source.title}</a> : source.title}
                  {` - ${source.notebookName} / ${source.sectionName}`}
                </span>
              ))}
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
  isGeneratingReview,
  isRenderingPdf,
  isBuildingGptPackage,
  pdfStatus,
  courseLabel,
  onInstructionsChange,
  onAdd,
  onRemove,
  onGenerate,
  onDownloadPdf,
  onDownloadGptPackage,
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
  isGeneratingReview: boolean;
  isRenderingPdf: boolean;
  isBuildingGptPackage: boolean;
  pdfStatus: string;
  courseLabel: (id: string) => string;
  onInstructionsChange: (value: string) => void;
  onAdd: (lectureId: string, examId?: string) => void;
  onRemove: (lectureId: string) => void;
  onGenerate: () => void | Promise<void>;
  onDownloadPdf: () => void | Promise<void>;
  onDownloadGptPackage: () => void | Promise<void>;
  onDelete: () => void;
  onOpenLecture: (lectureId: string) => void;
}) {
  const [explorerQuery, setExplorerQuery] = useState("");
  const [selectedScopeLectureId, setSelectedScopeLectureId] = useState<string | null>(null);
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
  const reviewScopeGroups = useMemo(() => {
    const groups = new Map<string, Lecture[]>();

    lectures.forEach((lecture) => {
      const group = groups.get(lecture.date) || [];
      group.push(lecture);
      groups.set(lecture.date, group);
    });

    return Array.from(groups, ([date, groupLectures]) => ({
      date: date || "Undated",
      lectures: groupLectures
    }));
  }, [lectures]);
  const selectedScopeLecture =
    lectures.find((lecture) => lecture.id === selectedScopeLectureId) || lectures[0];
  const selectedScopeMedia = selectedScopeLecture
    ? mediaItems.filter((item) => item.lectureId === selectedScopeLecture.id)
    : [];
  const selectedScopeTranscript = selectedScopeLecture
    ? transcripts.find((transcript) => transcript.lectureId === selectedScopeLecture.id)
    : undefined;
  const selectedScopeConceptCount = selectedScopeLecture
    ? concepts.filter((concept) => concept.lectureId === selectedScopeLecture.id).length
    : 0;

  function addToReviewScope(lectureId: string) {
    setSelectedScopeLectureId(lectureId);
    onAdd(lectureId, exam.id);
  }

  function removeFromReviewScope(lectureId: string) {
    const currentIndex = lectures.findIndex((lecture) => lecture.id === lectureId);
    const nextSelection =
      lectures[currentIndex + 1]?.id || lectures[currentIndex - 1]?.id || null;

    if (selectedScopeLectureId === lectureId) {
      setSelectedScopeLectureId(nextSelection);
    }
    onRemove(lectureId);
  }

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
                          onClick={() => addToReviewScope(lecture.id)}
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
            addToReviewScope(lectureId);
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

        <section className="review-scope" aria-label="Review set draft">
          <div className="section-heading compact-heading">
            <div>
              <span className="pill">Review Scope</span>
              <h3>Selected reconstructions</h3>
            </div>
            <span>
              {lectures.length} source{lectures.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="review-scope-list">
            {reviewScopeGroups.map((group) => (
              <section className="review-scope-group" key={group.date}>
                <div className="review-scope-group-heading">
                  <strong>{group.date}</strong>
                  <span>
                    {group.lectures.length} reconstruction
                    {group.lectures.length === 1 ? "" : "s"}
                  </span>
                </div>
                {group.lectures.map((lecture) => {
                  const lectureTranscript = transcripts.find(
                    (transcript) => transcript.lectureId === lecture.id
                  );
                  const lectureConceptCount = concepts.filter(
                    (concept) => concept.lectureId === lecture.id
                  ).length;
                  const lectureMediaCount = mediaItems.filter(
                    (item) => item.lectureId === lecture.id
                  ).length;
                  const isSelected = selectedScopeLecture?.id === lecture.id;

                  return (
                    <div
                      className={
                        isSelected
                          ? "review-scope-row selected"
                          : "review-scope-row"
                      }
                      key={lecture.id}
                    >
                      <button
                        aria-pressed={isSelected}
                        type="button"
                        onClick={() => setSelectedScopeLectureId(lecture.id)}
                      >
                        <span className="file-icon" aria-hidden="true" />
                        <span className="review-scope-row-copy">
                          <strong>{lecture.title}</strong>
                          <small>
                            {lectureTranscript?.segments.length || 0} segments · {lectureConceptCount} concepts · {lectureMediaCount} media
                          </small>
                        </span>
                      </button>
                      <button
                        className="review-scope-remove"
                        type="button"
                        onClick={() => removeFromReviewScope(lecture.id)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
            {!lectures.length ? (
              <p className="empty">
                Add lectures from the archive or drag lecture cards here.
              </p>
            ) : null}
          </div>
        </section>

        <section className="usage-panel" aria-label="Review generation usage">
          <div>
            <h4>Review Generation Usage</h4>
            <p>
              {reviewUsage
                ? `AI review usage: ${reviewUsage}. PDF downloads do not run AI again.`
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

        <section className="review-actions" aria-label="Review actions">
          <div className="section-heading">
            <div>
              <span className="pill">Actions</span>
              <h3>Review Actions</h3>
              <p className="section-note">
                Generate spends AI tokens. PDF and GPT package exports reuse saved content.
              </p>
            </div>
          </div>
          <div className="review-action-grid">
            <div className="review-action-card primary-action">
              <div>
                <strong>Generate in LectureVault</strong>
                <span>
                  Sends selected review-set material to AI, spends API tokens,
                  and saves the generated review here.
                </span>
              </div>
              <button
                className="primary"
                type="button"
                onClick={() => void onGenerate()}
                disabled={
                  isGeneratingReview ||
                  isRenderingPdf ||
                  isBuildingGptPackage ||
                  !lectures.length ||
                  !selectedTranscriptCount
                }
              >
                {isGeneratingReview ? "Generating..." : "Generate AI Review"}
              </button>
            </div>

            <div className="review-action-card">
              <div>
                <strong>Export saved review</strong>
                <span>
                  Renders the already-generated review as a KaTeX PDF. This does
                  not run AI again.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onDownloadPdf()}
                disabled={
                  isRenderingPdf ||
                  isGeneratingReview ||
                  isBuildingGptPackage ||
                  !selectedGuide
                }
              >
                {isRenderingPdf ? "Rendering PDF..." : "Download Review PDF"}
              </button>
            </div>

            <div className="review-action-card">
              <div>
                <strong>Export raw context</strong>
                <span>
                  Downloads transcripts, source map, prompt, and board images as
                  a ZIP for manual ChatGPT use. This does not run AI.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onDownloadGptPackage()}
                disabled={
                  isRenderingPdf ||
                  isGeneratingReview ||
                  isBuildingGptPackage ||
                  !lectures.length
                }
              >
                {isBuildingGptPackage ? "Building ZIP..." : "Download GPT Package"}
              </button>
            </div>

            <div className="review-action-card danger-action">
              <div>
                <strong>Remove this review set</strong>
                <span>
                  Deletes the review set record. Archived lectures and media stay
                  in the vault.
                </span>
              </div>
              <button className="danger" type="button" onClick={onDelete}>
                Delete Review Set
              </button>
            </div>
          </div>
        </section>
        {pdfStatus ? (
          <p
            className={
              pdfStatus.startsWith("PDF download failed")
                ? "pdf-status error"
                : "pdf-status"
            }
            role="status"
          >
            {pdfStatus}
          </p>
        ) : null}
      </article>

      <aside className="panel side-panel source-inspector">
        <h3>Selected Reconstruction</h3>
        {selectedScopeLecture ? (
          <div className="source-card selected-source-card">
            <strong>{selectedScopeLecture.title}</strong>
            <span>{selectedScopeLecture.date}</span>
            <small>
              {selectedScopeTranscript?.segments.length || 0} transcript segments
            </small>
            <small>{selectedScopeConceptCount} extracted concepts</small>
            <small>
              {selectedScopeMedia.length} media item
              {selectedScopeMedia.length === 1 ? "" : "s"}
            </small>
            {selectedScopeMedia.length ? (
              <div className="selected-source-media" aria-label="Attached media">
                {selectedScopeMedia.map((item) => (
                  <span key={item.id}>{item.name}</span>
                ))}
              </div>
            ) : null}
            <div className="button-row stacked">
              <button
                type="button"
                onClick={() => onOpenLecture(selectedScopeLecture.id)}
              >
                Open reconstruction
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => removeFromReviewScope(selectedScopeLecture.id)}
              >
                Remove from review
              </button>
            </div>
          </div>
        ) : (
          <p className="empty">
            Choose a reconstruction in the review scope to inspect it here.
          </p>
        )}
      </aside>
    </section>
  );
}
