import type { SupabaseClient } from "@supabase/supabase-js";

export type TitleMatchedTextbookChunk = {
  content?: string;
  id?: string;
  page_end?: number;
  page_start?: number;
  textbook_id?: string;
  textbook_name?: string;
};

type RankedTextbookChunk = TitleMatchedTextbookChunk & {
  titleMatchScore: number;
};

const IGNORED_TITLE_TERMS = new Set([
  "analysis", "and", "application", "design", "for", "from", "in", "method", "of", "the", "to", "using", "with"
]);

const VISUAL_EVIDENCE_PATTERN = /\b(?:fig(?:ure)?|diagram|plot|graph|illustrat(?:ion|ed)?|schematic|pole[ -]?zero)\b/gi;
const PER_TITLE_PHRASE_LIMIT = 16;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function textbookTitleSearchPhrases(title: string) {
  const terms = title
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.filter((term) => !IGNORED_TITLE_TERMS.has(term)) || [];
  const phrases = new Map<string, number>();

  for (let size = Math.min(3, terms.length); size >= 2; size -= 1) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      const phrase = terms.slice(index, index + size).join(" ");
      if (phrase.length >= 9) {
        phrases.set(phrase, size);
      }
    }
  }

  return [...phrases]
    .map(([phrase, wordCount]) => ({ phrase, wordCount }))
    .sort((left, right) => right.wordCount - left.wordCount || right.phrase.length - left.phrase.length);
}

function chunkKey(chunk: TitleMatchedTextbookChunk) {
  const id = cleanString(chunk.id);
  if (id) return id;

  return [
    cleanString(chunk.textbook_id),
    Number(chunk.page_start),
    Number(chunk.page_end),
    cleanString(chunk.content).slice(0, 80)
  ].join(":");
}

function visualEvidenceBonus(content: string) {
  return [...content.matchAll(VISUAL_EVIDENCE_PATTERN)].length * 100;
}

// Fetch title matches phrase-by-phrase, then rank them locally before callers
// apply their context/page budget. A single broad PostgREST `.or(...).limit()`
// request has no relevance ordering: an early, generic phrase such as “digital
// filter” can otherwise crowd out a later page that explicitly names the figure.
export async function rankedTitleTextbookMatches({
  courseId,
  limit,
  supabase,
  title
}: {
  courseId: string;
  limit: number;
  supabase: SupabaseClient;
  title: string;
}): Promise<TitleMatchedTextbookChunk[]> {
  const phrases = textbookTitleSearchPhrases(title);
  if (!courseId || !phrases.length || limit < 1) return [];

  const results = await Promise.all(
    phrases.map(async ({ phrase, wordCount }) => {
      const { data } = await supabase
        .from("textbook_chunks")
        .select("content, id, page_end, page_start, textbook_id, textbook_name")
        .eq("course_id", courseId)
        .ilike("content", `%${phrase}%`)
        .limit(PER_TITLE_PHRASE_LIMIT);

      return {
        matches: Array.isArray(data) ? data as TitleMatchedTextbookChunk[] : [],
        phrase,
        wordCount
      };
    })
  );
  const ranked = new Map<string, RankedTextbookChunk>();

  for (const { matches, phrase, wordCount } of results) {
    for (const chunk of matches) {
      const key = chunkKey(chunk);
      const content = cleanString(chunk.content);
      const score = (wordCount * 10_000) + visualEvidenceBonus(content);
      const current = ranked.get(key);

      if (!current || score > current.titleMatchScore) {
        ranked.set(key, { ...chunk, titleMatchScore: score });
      }
    }
  }

  return [...ranked.values()]
    .sort((left, right) =>
      right.titleMatchScore - left.titleMatchScore ||
      Number(left.page_start || 0) - Number(right.page_start || 0)
    )
    .slice(0, limit)
    .map(({ titleMatchScore: _titleMatchScore, ...chunk }) => chunk);
}
