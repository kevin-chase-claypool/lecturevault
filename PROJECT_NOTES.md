# LectureVault Project Notes

## Working Rule

Update this file after every code change. Keep it current with what changed, why it changed, how to verify it, and what remains unresolved.

## Product Goal

LectureVault is a transcription-first lecture archive with exam workspaces. The intended workflow is:

1. Capture or upload lecture material.
2. Archive the lecture, transcript, concepts, and media permanently.
3. Create an exam workspace.
4. Add selected archived lectures/media into that exam workspace.
5. Run a distinct AI aggregation pass over only the selected exam materials.
6. Preview a focused exam review.
7. Download a KaTeX-rendered PDF with formulas, source references, and board figures.

The exam review must be a new synthesis artifact, not a raw transcript export.

## Current Architecture

- App: Next.js app in `LectureVault/`.
- Storage: browser `localStorage` under `lecturevault-state-v1`.
- Archive data model: courses, lectures, media items, transcripts, extracted concepts, exam workspaces, workspace items, and generated study guides.
- Exam review route: `app/api/exam-review/route.ts`.
- PDF route: `app/api/exam-review/pdf/route.ts`.
- Main UI: `app/page.tsx`.
- Styles: `app/styles.css`.

## AI Boundaries

Lecture-level AI and exam-level AI should remain separate.

- Lecture-level AI: transcribes/cleans/extracts concepts for one archived lecture. This is still mostly MVP/local behavior.
- Exam-level AI: aggregates selected exam workspace materials into a review. This is implemented through `/api/exam-review`.

The exam review route should not re-transcribe media. It should use saved transcripts, concepts, media references, and user exam instructions.

## Environment Variables

Required for real AI aggregation:

```text
OPENAI_API_KEY
```

Optional model override:

```text
OPENAI_EXAM_REVIEW_MODEL
```

Required for PDF download:

```text
BROWSERLESS_TOKEN
BROWSERLESS_PDF_ENDPOINT
```

Default Browserless endpoint fallback:

```text
https://production-sfo.browserless.io/pdf
```

## Recent Changes

### 2026-07-05 - Image Embedding, Smaller PDF Text, Token Usage

- Compressed future uploaded images into embeddable JPEG data URLs.
- Added an embedded demo board image fallback for `gauss-board.jpg`.
- Rebuilt PDF figure lists from selected exam workspace media at download time.
- Preserved figure appendix references even when image pixels are unavailable.
- Reduced PDF typography by about 30%.
- Stored and displayed OpenAI token usage for generated exam reviews.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-05 - Figure Reference Preservation

- Ensured every selected image media item gets a `Fig. N` reference.
- Updated the AI prompt to require figure labels in `Figure-Guided Review` and `Source Map`.
- Updated PDF generation to show a board figure appendix even for metadata-only images.

### 2026-07-05 - AI Exam Review PDF Workflow

- Added `/api/exam-review` for selected-material AI aggregation.
- Added `/api/exam-review/pdf` for KaTeX + Browserless PDF rendering.
- Added exam workspace controls:
  - workflow steps
  - source readiness counts
  - exam instructions
  - `Generate AI Review`
  - generated review preview
  - `Download Review PDF`
  - `Remove from exam`
- Added `openai`, `katex`, and `@types/katex`.

## Known Limitations

- Lecture transcription is not fully implemented yet. Current capture uses pasted transcript text or a placeholder.
- Data is stored in browser `localStorage`, so it does not sync across devices and can be cleared by the browser.
- Existing media records that only contain metadata cannot recover original image pixels. Users must re-upload those images after the image embedding fix.
- PDF image embedding depends on image data being stored in `MediaItem.dataUrl`.
- Browserless is required for PDF output in deployed environments.
- The app has no user accounts or cloud database yet.
- The AI output should be source-audited for senior-level engineering/math accuracy.

## Verification Checklist

After code changes:

```bash
npm run typecheck
npm run build
```

For workflow changes, manually verify:

1. Open an exam workspace.
2. Add archive materials.
3. Confirm source readiness counts update.
4. Add or edit exam instructions.
5. Generate AI Review.
6. Confirm token usage appears when OpenAI is used.
7. Download Review PDF.
8. Confirm PDF text size, equations, source map, and figure appendix.
9. Confirm embedded images render when image data exists.

## Next Priorities

- Add real lecture-level transcription route.
- Move storage from `localStorage` to durable cloud storage/database.
- Add explicit image upload/re-upload controls for archive items.
- Add formula audit or uncertainty section for advanced engineering/math courses.
- Add project-level test coverage for API routes and PDF HTML generation.
