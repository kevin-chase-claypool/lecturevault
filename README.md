# LectureVault

LectureVault is a transcription-first lecture vault and exam review builder. It keeps courses, lecture/media records, transcripts, extracted concepts, review sets, selected sources, and study guides in Supabase when configured, with browser local storage as a fallback/cache.

## MVP Screens

- Dashboard
- Course list
- Vault
- Lecture detail page
- New Lecture page
- Exam basket list
- Exam review builder
- Exam basket detail page
- Study guide preview page

## Core Behavior

- Capture lecture audio such as MP3, video, whiteboard images, PDFs, or rough transcript text.
- Save every capture to the permanent vault first.
- Build exam baskets such as Exam 1, Quiz 1, or Final.
- Add vault lectures into exam baskets by button or drag/drop.
- Generate a study guide from only the lectures selected in that exam basket.
- Delete an exam basket without deleting original vault media or transcripts.
- Link generated study material back to lecture titles, transcript timestamp segments, and media records.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Next.js.

## Supabase Sync

Create the shared state table with:

```sql
-- supabase/lecturevault_state.sql
create table if not exists public.lecturevault_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

Set these Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional:

```text
LECTUREVAULT_STATE_ID=default
OPENAI_LECTURE_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

## Notes

Small selected media files are stored as data URLs inside the shared state for preview and lecture-level AI analysis. Larger files are represented by metadata so the UI remains responsive and cannot be transcribed/analyzed until durable file storage is added. Current capture can save manually pasted transcript text or generate an AI lecture artifact from supported source media.
