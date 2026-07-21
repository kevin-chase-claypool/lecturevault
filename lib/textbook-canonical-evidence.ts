import { supabaseServerClient } from "./supabase-server";
import type { TextbookPageRequest } from "./textbook-page-evidence";

export type CanonicalTextbookPageEvidence = {
  courseId: string;
  evidenceText: string;
  pageNumber: number;
  requiresVisualVerification: boolean;
  sourceKind: "native_text" | "visual_index";
  textbookId: string;
  textbookName: string;
};

type CanonicalEvidenceLookup = {
  evidence: CanonicalTextbookPageEvidence[];
  pageRequestsNeedingSource: TextbookPageRequest[];
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestedPages(requests: TextbookPageRequest[]) {
  const pages = new Map<string, TextbookPageRequest & { pageNumber: number }>();

  for (const request of requests) {
    const textbookId = cleanString(request.textbookId);
    const textbookName = cleanString(request.textbookName) || "Course textbook";
    const pageStart = Math.max(1, Math.floor(Number(request.pageStart) || 0));
    const pageEnd = Math.max(pageStart, Math.floor(Number(request.pageEnd) || pageStart));

    if (!textbookId || !pageStart) {
      continue;
    }

    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const key = `${textbookId}:${pageNumber}`;

      if (!pages.has(key)) {
        pages.set(key, {
          pageEnd: pageNumber,
          pageNumber,
          pageStart: pageNumber,
          textbookId,
          textbookName
        });
      }
    }
  }

  return [...pages.values()];
}

export async function canonicalTextbookPageEvidence({
  courseId,
  requests
}: {
  courseId: string;
  requests: TextbookPageRequest[];
}): Promise<CanonicalEvidenceLookup> {
  const requested = requestedPages(requests);

  if (!cleanString(courseId) || !requested.length) {
    return { evidence: [], pageRequestsNeedingSource: requested };
  }

  const supabase = supabaseServerClient();

  if (!supabase) {
    return { evidence: [], pageRequestsNeedingSource: requested };
  }

  const textbookIds = [...new Set(requested.map((request) => request.textbookId || "").filter(Boolean))];
  const pageNumbers = [...new Set(requested.map((request) => request.pageNumber))];
  const requestedKeys = new Set(
    requested.map((request) => `${cleanString(request.textbookId)}:${request.pageNumber}`)
  );

  const { data, error } = await supabase
    .from("textbook_page_evidence")
    .select(
      "course_id, evidence_text, page_number, requires_visual_verification, source_kind, textbook_id, textbook_name"
    )
    .eq("course_id", cleanString(courseId))
    .in("textbook_id", textbookIds)
    .in("page_number", pageNumbers);

  if (error || !Array.isArray(data)) {
    // Existing textbook uploads predate the durable page-evidence table. Keep their
    // original-page fallback working until the user reindexes that textbook.
    return { evidence: [], pageRequestsNeedingSource: requested };
  }

  const evidence = data
    .map((record) => ({
      courseId: cleanString(record.course_id),
      evidenceText: cleanString(record.evidence_text),
      pageNumber: Number(record.page_number),
      requiresVisualVerification: Boolean(record.requires_visual_verification),
      sourceKind:
        cleanString(record.source_kind) === "visual_index" ? "visual_index" : "native_text",
      textbookId: cleanString(record.textbook_id),
      textbookName: cleanString(record.textbook_name) || "Course textbook"
    }))
    .filter(
      (record): record is CanonicalTextbookPageEvidence =>
        Boolean(record.evidenceText) &&
        Number.isInteger(record.pageNumber) &&
        requestedKeys.has(`${record.textbookId}:${record.pageNumber}`)
    );
  const evidenceKeys = new Set(evidence.map((record) => `${record.textbookId}:${record.pageNumber}`));
  const pageRequestsNeedingSource = requested.filter(
    (request) =>
      !evidenceKeys.has(`${cleanString(request.textbookId)}:${request.pageNumber}`) ||
      evidence.some(
        (record) =>
          record.textbookId === cleanString(request.textbookId) &&
          record.pageNumber === request.pageNumber &&
          record.requiresVisualVerification
      )
  );

  return { evidence, pageRequestsNeedingSource };
}

export function canonicalTextbookEvidenceText(evidence: CanonicalTextbookPageEvidence[]) {
  return evidence
    .map((record) => {
      const verificationNote = record.requiresVisualVerification
        ? "This page was marked unclear during its initial scan; its original page is attached for one-time recheck."
        : "This is canonical page evidence created during textbook ingestion."

      return [
        `Canonical textbook page: ${record.textbookName}, p. ${record.pageNumber}.`,
        `Use this exact citation only when it materially clarifies nearby lecture material: Textbook reference: ${record.textbookName}, p. ${record.pageNumber}.`,
        verificationNote,
        record.evidenceText
      ].join("\n");
    })
    .join("\n\n---\n\n");
}
