# LectureVault Project Notes

## Working Rule

Update this file after every code change. Keep it current with what changed, why it changed, how to verify it, and what remains unresolved.

## Product Goal

LectureVault is a transcription-first lecture archive with exam baskets. The intended workflow is:

1. Capture or upload lecture material.
2. Archive the lecture, transcript, concepts, and media permanently.
3. Add selected archived lectures/media into an exam basket.
4. Use the basket as the active review preparation surface.
5. Run a distinct AI aggregation pass over only the selected exam materials.
6. Preview a focused exam review.
7. Download a KaTeX-rendered PDF with formulas, source references, and board figures.

The exam review must be a new synthesis artifact, not a raw transcript export.

## Current Architecture

- App: Next.js app in `LectureVault/`.
- Storage: browser `localStorage` under `lecturevault-state-v1`.
- Archive data model: courses, lectures, media items, transcripts, extracted concepts, exam baskets, basket source references, and generated study guides.
- Exam review route: `app/api/exam-review/route.ts`.
- PDF route: `app/api/exam-review/pdf/route.ts`.
- Main UI: `app/page.tsx`.
- Styles: `app/styles.css`.

## AI Boundaries

Lecture-level AI and exam-level AI should remain separate.

- Lecture-level AI: transcribes/cleans/extracts concepts for one archived lecture. This is still mostly MVP/local behavior.
- Exam-level AI: aggregates selected exam basket materials into a review. This is implemented through `/api/exam-review`.

The exam review route should not re-transcribe media. It should use saved transcripts, concepts, media references, and user exam instructions.

## Environment Variables

Required for real AI aggregation:

```text
OPENAI_API_KEY
```

Required to protect the app:

```text
LECTUREVAULT_APP_PASSWORD
```

Optional session signing override:

```text
LECTUREVAULT_AUTH_SECRET
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

### 2026-07-05 - Course Deletion

- Added explicit `Delete course` controls to the Courses list.
- Course rows now separate `Open archive` from destructive course deletion.
- Deleting a course confirms the cascade and removes:
  - course archive folders
  - course lectures
  - related media, transcripts, and extracted concepts
  - related exam baskets and basket references
  - generated reviews for deleted baskets
- Selection state is reset to the next available course/lecture/basket after deletion.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-05 - Password Gate and Persistent Device Login

- Added password authentication with a persistent 30-day signed httpOnly session cookie.
- Added `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout`.
- Added a client login gate before the app loads.
- Added a top-bar `Log out` action.
- Protected the OpenAI exam review route and Browserless PDF route so they require an authenticated session before using server-side API keys.
- Requires `LECTUREVAULT_APP_PASSWORD` in deployment environment variables.
- Optional `LECTUREVAULT_AUTH_SECRET` can be set to decouple session signing from other server secrets.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-05 - Shopping Cart Exam Basket Interaction

- Added a persistent top-bar cart button with the current exam basket count.
- Archive lecture cards now support `Add to Basket`, making the archive feel like a browsable source shop.
- Selected archive lecture previews also include `Add to Basket`.
- The basket screen now uses shopping-cart language:
  - `Shopping Cart`
  - `In Basket`
  - `Add to Basket`
  - `Checkout: Create Review`
- Adding a lecture from a different course switches the active basket course and keeps the basket course-consistent.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-05 - Exam Basket Language and Archive KaTeX Preview

- Updated the user-facing workflow language from exam workspace/builder toward `Exam Basket`.
- The basket is now framed as the active selected-source collection that can generate the AI review and PDF.
- Updated visible navigation, dashboard copy, basket creation labels, deletion labels, and add/remove messages.
- Added KaTeX rendering for archive lecture summaries and transcript previews.
- Added a dedicated `KaTeX Preview` panel in lecture detail so formulas in archived transcript text can be inspected before adding sources to a basket.
- Added formula examples to demo lecture summaries/transcripts and the draft transcript helper.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-05 - Dedicated Exam Builder Workflow

- Added a dedicated `Exam Builder` screen between the archive and exam workspace detail.
- Exam Builder lets the user choose a course, browse that course's archive tree, search visible materials, select lectures into an exam basket, and create an exam workspace from those selected sources.
- Removed the archive-folder-name inference flow from the app logic:
  - moving lectures between archive folders no longer adds/removes exam workspace sources
  - saving a lecture to an archive folder no longer adds it to an exam workspace
  - creating an exam workspace no longer creates a matching archive folder
- Archive is now permanent organization only; Exam Builder is the explicit source-selection workflow.
- Exam workspace detail remains the review-generation and PDF-download workflow.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-05 - Explicit Archive Folder and Workspace Linking

- Clarified the archive tree so only same-course folders with a matching exam workspace are labeled as `workspace`.
- Exam-like folders without a matching workspace are labeled as folders instead of appearing workspace-linked.
- Added `Create linked workspace` for the selected archive folder; it creates a same-course exam workspace and seeds it with lectures in that folder subtree.
- Fixed archive course/folder selection so the selected lecture panel updates to the visible folder contents instead of showing a stale lecture from another course.
- Changed archive `Add to Exam` behavior to target an exam workspace from the lecture's own course instead of the last selected workspace from another course.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-05 - Exam Bucket to Workspace Sync

- Linked archive folders whose names match exam workspace names in the same course to the corresponding exam workspace.
- Moving a lecture into an exam-named archive bucket now adds that lecture as an exam workspace source.
- Moving a lecture out of an exam-named archive bucket now removes that bucket-created workspace source reference.
- Existing localStorage data is reconciled on load so lectures already sitting in matching exam buckets are added to the matching workspace.
- Creating a new exam workspace now creates a matching top-level archive bucket when one does not already exist.
- Removing a lecture from an exam workspace now moves it out of the matching exam bucket so it does not immediately sync back in.
- Archive tree labels matching exam buckets as workspace-linked.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-05 - Course-Aware Archive Tree and Lecture Deletion

- Changed the archive tree to show every course as a top-level navigation group instead of only showing folders for the currently selected course.
- Added per-course `Unfiled` rows and folder groups so lectures from separate courses are easier to distinguish.
- Restricted drag/drop into `Unfiled` so a lecture can only be dropped into the matching course group.
- Added individual archive item deletion from lecture cards and the selected lecture panel.
- Deleting an archive item removes its lecture record, transcript, media, extracted concepts, exam workspace references, and stale study guide figure/source references.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-05 - Data Flow Consistency Fixes

- Changed app state initialization to load from `localStorage` immediately instead of writing demo state during initial hydration.
- Wrapped `localStorage` persistence in error handling so storage quota/save failures are surfaced in the status message.
- Enforced course consistency when adding lectures to exam workspaces.
- Filtered the lecture detail exam selector to same-course exam workspaces.
- Enforced course consistency when moving lectures into archive folders.
- Made archive card `Open` navigate directly to lecture detail.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-05 - Archive Folder Tree Organization

- Added an `ArchiveFolder` model to the localStorage state.
- Added optional `folderId` assignment on lectures.
- Replaced the flat archive grid with a responsive archive organizer:
  - folder tree
  - folder contents
  - selected lecture inspector
- Added folder actions:
  - add folder/subfolder
  - rename folder
  - delete folder without deleting lectures
  - drag lectures/transcriptions into folders
  - move lectures back to `Unfiled`
- Selecting a parent folder includes nested folder contents.
- Added sample `Exam 1` folders for demo courses.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

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
- Archive folders are currently local-only and stored in `localStorage`.
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

For archive organization changes, manually verify:

1. Open the archive.
2. Add a folder.
3. Add a subfolder.
4. Drag a lecture card into a folder.
5. Select parent and child folders and confirm contents update.
6. Rename a folder.
7. Delete a folder and confirm lectures remain archived.

## Next Priorities

- Add real lecture-level transcription route.
- Move storage from `localStorage` to durable cloud storage/database.
- Add explicit image upload/re-upload controls for archive items.
- Add formula audit or uncertainty section for advanced engineering/math courses.
- Add project-level test coverage for API routes and PDF HTML generation.
