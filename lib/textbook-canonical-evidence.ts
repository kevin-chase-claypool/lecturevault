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

  const eligibleEvidence = data
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
  // Native PDF text and a durable vision description are complementary
  // records for a page. Reconstruction context should receive the visual
  // description when it exists, rather than an arbitrary row order that can
  // bury a figure's subject beneath OCR prose.
  const evidenceByPage = new Map<string, CanonicalTextbookPageEvidence>();
  for (const record of eligibleEvidence) {
    const key = `${record.textbookId}:${record.pageNumber}`;
    const existing = evidenceByPage.get(key);
    if (!existing || record.sourceKind === "visual_index") {
      evidenceByPage.set(key, record);
    }
  }
  const evidence = [...evidenceByPage.values()];
  const evidenceKeys = new Set(evidence.map((record) => `${record.textbookId}:${record.pageNumber}`));
  const pageRequestsNeedingSource = requested.filter(
    (request) =>
      !evidenceKeys.has(`${cleanString(request.textbookId)}:${request.pageNumber}`) ||
      evidenceByPage.get(`${cleanString(request.textbookId)}:${request.pageNumber}`)
        ?.requiresVisualVerification
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

// Assignment PDFs share the course's textbook slots and page index. They must
// be available to review AI even when no reconstruction has cited them yet.
export async function courseAssignmentReviewEvidence({ courseId, sources }: {
  courseId: string;
  sources: Array<{ textbookId?: string; name?: string }>;
}): Promise<CanonicalEvidenceLookup> {
  const ids = sources.filter(source => /\b(?:assignments?|homework|worksheets?|problem[ -]?sets?)\b/i.test(source.name || ''))
    .map(source => cleanString(source.textbookId)).filter(Boolean);
  if (!cleanString(courseId) || !ids.length) return { evidence: [], pageRequestsNeedingSource: [] };
  const supabase = supabaseServerClient();
  if (!supabase) throw new Error('Course assignment evidence could not be loaded. Review generation was not continued with missing assignment context.');
  const byPage = new Map<string, CanonicalTextbookPageEvidence>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('textbook_page_evidence')
      .select('course_id, evidence_text, page_number, requires_visual_verification, source_kind, textbook_id, textbook_name')
      .eq('course_id', cleanString(courseId)).in('textbook_id', ids)
      .order('textbook_id').order('page_number').order('source_kind').range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new Error('The stored course assignment page index could not be read. Retry without reuploading the assignments.');
    for (const record of data) {
      const text = cleanString(record.evidence_text);
      const page = Number(record.page_number);
      if (!text || !Number.isInteger(page) || page < 1) continue;
      const key = `${record.textbook_id}:${page}`;
      const existing = byPage.get(key);
      const kind = record.source_kind === 'visual_index' ? 'visual_index' : 'native_text';
      byPage.set(key, {
        courseId: cleanString(record.course_id), textbookId: cleanString(record.textbook_id),
        textbookName: cleanString(record.textbook_name), pageNumber: page,
        evidenceText: existing ? `${existing.evidenceText}\n\nAdditional ${kind} record:\n${text}` : text,
        sourceKind: kind,
        requiresVisualVerification: Boolean(record.requires_visual_verification) || Boolean(existing?.requiresVisualVerification)
      });
    }
    if (data.length < 500) break;
  }
  const evidence = [...byPage.values()];
  const loaded = new Set(evidence.map(page => page.textbookId));
  if (ids.some(id => !loaded.has(id))) throw new Error('A course assignment has no indexed pages yet. Refresh its textbook-slot index before rebuilding the review.');
  return { evidence, pageRequestsNeedingSource: evidence.filter(page => page.requiresVisualVerification).map(page => ({
    textbookId: page.textbookId, textbookName: page.textbookName, pageStart: page.pageNumber, pageEnd: page.pageNumber
  })) };
}
