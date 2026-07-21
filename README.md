# LectureVault

LectureVault turns a daily class source bundle into a searchable, source-grounded reconstruction, then turns selected reconstructions into an exam review.

## User Workflow

1. Create a course and optionally attach its syllabus and textbooks.
2. Start one class record for that course and date.
3. Share or upload the original lecture MP3, handwritten OneNote PDF, board images, and any relevant notes into that record from any device.
4. Build the reconstruction. AI transcribes audio, interprets selected visual/PDF material, retrieves only relevant textbook sections, verifies cited textbook pages against their original PDF layout, and produces a structured KaTeX-backed study artifact.
5. Organize and study saved reconstructions in the Vault.
6. Select multiple reconstructions to create an exam review. Review AI uses saved reconstruction artifacts; it does not transcribe the original audio again.

Original source media remains in Supabase Storage. Reconstruction and review outputs cite figures, timestamped audio clips, and textbook pages selectively rather than duplicating media throughout the document. Textbook upload is automatic: LectureVault indexes every readable page for semantic search, then supplies only the relevant original PDF pages to the AI when it needs to verify equations, diagrams, tables, units, or notation.

## Local Development

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js. Before committing a change, run:

```bash
npm run typecheck
npm run build
```

## Required Services

LectureVault is a password-protected, single-owner workspace backed by Supabase.

```text
LECTUREVAULT_APP_PASSWORD
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
```

Additional capabilities require their own configuration:

- Browserless: review PDF export.
- Microsoft Graph / OneNote: readable OneNote page picker.
- Supabase Storage: direct signed uploads and original-media preservation.

See [PROJECT_NOTES.md](PROJECT_NOTES.md) for the complete environment-variable list, current architecture, limitations, and deployment conventions. Never commit secret values.

## Long Lecture Audio

Upload one original MP3. When an MP3 is larger than 20 MB, the reconstruction API internally splits only its temporary transcription inputs at MP3 frame boundaries, preserves a short overlap, and merges diarized segments into one source-timestamped transcript. The original Supabase object remains unchanged.

## Project Conventions

- Main UI and state orchestration: `app/page.tsx`
- Global visual system: `app/styles.css`
- Reconstruction AI: `app/api/lecture-ai/route.ts`
- Review AI: `app/api/exam-review/route.ts`
- Review PDF: `app/api/exam-review/pdf/route.ts`
- Textbook visual evidence: `lib/textbook-page-evidence.ts`
- Fresh-project textbook schema: `supabase/textbook_retrieval.sql`
- Update `PROJECT_NOTES.md` after every code change.
- Use `apply_patch` for manual edits.
- Push verified changes to both configured `main` remotes. Vercel production is served at [l3cturevault.vercel.app](https://l3cturevault.vercel.app).
