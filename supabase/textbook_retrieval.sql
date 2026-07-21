-- Textbook semantic retrieval for LectureVault.
-- Apply this to a new Supabase project before uploading textbooks. The app uses the
-- service-role key server-side; no browser policy is required for these private rows.

create extension if not exists vector;

create table if not exists public.textbook_chunks (
  id text primary key,
  textbook_id text not null,
  textbook_name text not null,
  course_id text not null,
  page_start integer not null,
  page_end integer not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists textbook_chunks_course_id_idx
  on public.textbook_chunks (course_id);

create index if not exists textbook_chunks_textbook_id_idx
  on public.textbook_chunks (textbook_id);

-- This index accelerates semantic search after a textbook has been indexed.
create index if not exists textbook_chunks_embedding_idx
  on public.textbook_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.textbook_chunks enable row level security;

-- Canonical page evidence is written once during ingestion. It preserves the
-- page-level text/vision record that supports citations so later reconstruction
-- and review requests do not need to re-send the same textbook page to vision.
create table if not exists public.textbook_page_evidence (
  textbook_id text not null,
  page_number integer not null check (page_number > 0),
  textbook_name text not null,
  course_id text not null,
  source_kind text not null check (source_kind in ('native_text', 'visual_index')),
  evidence_text text not null,
  requires_visual_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (textbook_id, page_number)
);

create index if not exists textbook_page_evidence_course_id_idx
  on public.textbook_page_evidence (course_id);

create index if not exists textbook_page_evidence_textbook_id_idx
  on public.textbook_page_evidence (textbook_id);

alter table public.textbook_page_evidence enable row level security;

create or replace function public.match_textbook_chunks(
  query_embedding vector(1536),
  match_course_id text,
  match_count integer default 8
)
returns table (
  id text,
  textbook_id text,
  textbook_name text,
  page_start integer,
  page_end integer,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    textbook_chunks.id,
    textbook_chunks.textbook_id,
    textbook_chunks.textbook_name,
    textbook_chunks.page_start,
    textbook_chunks.page_end,
    textbook_chunks.content,
    1 - (textbook_chunks.embedding <=> query_embedding) as similarity
  from public.textbook_chunks
  where textbook_chunks.course_id = match_course_id
  order by textbook_chunks.embedding <=> query_embedding
  limit greatest(1, least(match_count, 8));
$$;
