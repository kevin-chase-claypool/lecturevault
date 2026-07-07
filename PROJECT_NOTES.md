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
- Storage: Supabase shared JSON state in `lecturevault_state` when configured, with browser `localStorage` under `lecturevault-state-v1` as fallback/cache. Lecture source media is stored in Supabase Storage when configured.
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

Required for cross-device Supabase sync:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional Supabase media bucket override:

```text
SUPABASE_MEDIA_BUCKET
```

Optional shared state row override:

```text
LECTUREVAULT_STATE_ID
```

Optional model override:

```text
OPENAI_EXAM_REVIEW_MODEL
OPENAI_LECTURE_MODEL
OPENAI_TRANSCRIPTION_MODEL
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

### 2026-07-07 - Compact Vault Cards and Render Review Math

- Made Vault folder contents use compact lecture cards so folder contents are shorter and easier to scan.
- Replaced raw generated-review `<pre>` previews with rendered Markdown-style review content that supports KaTeX math in the app.
- Updated PDF download errors to clearly report `PDF download failed: ...` in the status banner.
- Browserless is still required for deployed PDF export through `/api/exam-review/pdf`.
- Verified with:
  - `npm run typecheck`

### 2026-07-07 - Store Lecture Media in Supabase Storage

- Added shared Supabase server helpers and a default private `lecturevault-media` bucket.
- Added authenticated media upload/read routes:
  - `/api/media/upload`
  - `/api/media/read`
- New lecture source media now saves `storageBucket` and `storagePath` references on each `MediaItem` when Supabase upload succeeds.
- Lecture detail renders stored images/audio/video through the authenticated read route.
- Lecture AI resolves stored MP3/WAV and image objects from Supabase before sending them to OpenAI.
- Exam review AI resolves stored lecture images from Supabase so returned review figures can be embedded in KaTeX/PDF output.
- Kept data URL fallback for demo/existing records and for cases where media upload is unavailable.
- Verified with:
  - `npm run typecheck`

### 2026-07-07 - Add Lecture-Level AI Artifact Generation

- Added `/api/lecture-ai` for authenticated lecture-level AI generation.
- Lecture AI now:
  - transcribes stored MP3/WAV source media when a data URL is available
  - sends uploaded images to the model as first-class visual context
  - creates an exam-focused lecture study artifact rather than only a raw transcript
  - saves source media IDs and transcribed media IDs on the transcript
  - saves combined OpenAI usage on the transcript
- Added `Generate AI Lecture` to the New Lecture screen; `Save to Vault` remains the no-token path.
- Lecture detail now lists `Source Media Used` and marks transcribed source media.
- Review/PDF generation can continue to include selected lecture images as figures.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Auto-Refresh Supabase State

- Added background polling for `/api/vault-state` while Supabase sync is enabled.
- Open browser sessions now pick up newer Supabase state from another device without a manual refresh.
- Added a skip-save guard so state pulled from Supabase does not immediately write back and create sync loops.
- Supabase sync remains last-write-wins.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Add Supabase Shared State Sync

- Added `/api/vault-state` for authenticated server-side Supabase reads/writes.
- Added `@supabase/supabase-js`.
- The client now loads shared vault state from Supabase after login and saves subsequent state changes back to Supabase.
- Browser `localStorage` remains a fallback/cache when Supabase is unavailable or not configured.
- Added a sidebar sync indicator for Supabase/browser-only state.
- Added `supabase/lecturevault_state.sql` with the expected shared JSON state table.
- Updated README with required Vercel environment variables.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Persist Per-Review AI Context

- Added a `context` field to review sets so AI context is saved per review set instead of shared globally.
- Renamed the review-set textarea to `AI context before submission`.
- The selected review set's context is sent to `/api/exam-review` when `Generate AI Review` runs.
- Generated reviews still store the submitted context snapshot, and the standalone guide preview now shows that submitted context.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Add Lecture and Review Usage Surfaces

- Added optional transcription metadata to transcript records so future OpenAI transcription usage can be stored per lecture.
- New manually saved/pasted transcripts are marked as manual with no AI usage; placeholder transcripts are marked separately.
- Added a `Transcription Usage` panel on lecture detail pages.
- Added a persistent `Review Generation Usage` panel on saved review-set pages.
- Removed duplicate review usage text from the generated-review preview on the review-set page; the standalone guide preview still shows usage.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Show Review Action Disabled States

- Kept the full Reviews workflow visible by showing disabled `Generate AI Review` and `Download Review PDF` actions in the review-set draft panel.
- Disabled `Create Review Set` until the draft has a name and at least one selected source.
- Disabled `Add visible sources` when the current archive filter has no visible sources.
- Disabled AI generation until a saved review set has selected sources with at least one transcript, preventing accidental token use without transcript material.
- Strengthened disabled button styling so unavailable actions are clearly greyed out.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Consolidate Reviews UX

- Replaced the separate user-facing `Exam Review` and `Exam Baskets` navigation entries with one `Reviews` entry.
- Reworded basket/cart/builder language to `Review Set`, `Selected Sources`, and `Create Review Set`.
- Added a saved review-set list inside the Reviews screen so existing review sets remain reachable without a separate navigation section.
- Kept the underlying exam workspace data model unchanged for compatibility with existing saved data.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Purge Legacy Demo Records

- Added a localStorage migration that removes the old hardcoded demo course IDs:
  - `course-calculus`
  - `course-physics`
- The cleanup also removes their folders, lectures, media, transcripts, concepts, exam baskets, basket items, and study-guide references.
- Confirmed the live deployment bundle no longer includes `Reset Demo`, `MATH 241`, or `PHYS 212` before adding this cleanup.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Remove Demo Course Reseeding

- Stopped normal app startup from falling back to demo course data when browser storage is empty or unreadable.
- Removed the hardcoded startup selections for the old demo courses, lectures, and exam.
- Removed the top-bar `Reset Demo` action so production users cannot accidentally restore the old MATH/PHYS demo records.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Clamp Stale Course Selections

- Added a startup/runtime cleanup pass that keeps selected courses, capture defaults, exam forms, builder filters, selected lectures, and selected exams pointed at records that still exist.
- This prevents deleted courses from lingering in archive or exam screens through browser `localStorage`.
- Preserved the legacy `Unfiled` to `Lectures` merge so existing users get one default `Lectures` folder per course without stale `Unfiled` rows.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Merge Legacy Unfiled Into Lectures

- Added a localStorage migration for existing course roots that still had `Unfiled` folders:
  - if no `Lectures` folder exists, the first root `Unfiled` folder is renamed to `Lectures`
  - extra root `Unfiled` folders are merged into `Lectures`
  - lectures and child folders referencing removed `Unfiled` folders are reassigned to `Lectures`
- Fixed nested archive tree row sizing so item counts stay inside the row boundary.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Default Lectures Folder and Tree Count Fix

- Added a default `Lectures` folder for every course.
- Migrated legacy no-folder lectures into each course's `Lectures` folder on state load.
- New courses now create their `Lectures` folder immediately.
- New captured/transcribed lectures now save into the course `Lectures` folder by default.
- Removed the visible default `Unfiled` row from the archive tree.
- Dropping a lecture onto a course root now sends it to that course's `Lectures` folder.
- Protected the default `Lectures` folder from rename/delete actions.
- Sorted `Lectures` to the top of each course and tightened tree indentation/count alignment so counts stay inside the row boundary.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Explorer-Style Archive Tree

- Reworked the archive folder tree to behave more like Windows File Explorer:
  - course and folder rows now use expandable disclosure nodes
  - rows are compact instead of card-like
  - nested folders have clearer indentation
  - selected rows use a lighter explorer-style highlight
  - folders can collapse as the number of lectures and folders grows
- Preserved drag/drop folder behavior and course/unfiled selection behavior.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - Tablet Navigation Layout Fix

- Changed responsive navigation behavior so tablet widths keep a compact left sidebar instead of moving the navigation into an uneven top panel.
- Limited the top navigation layout to smaller phone widths.
- Updated narrow-screen navigation to a balanced 3-by-2 grid for the six primary options.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Professional Visual Polish Pass

- Refined the app-wide visual system:
  - softer page background and shadows
  - clearer focus rings
  - smoother button, card, and drop-zone hover states
  - more professional topbar and sidebar treatment
- Improved dashboard and card presentation with stronger task hierarchy and lighter surfaces.
- Improved New Lecture intake visuals with a more polished hero, details panel, source drop zone, and attached-media surface.
- Preserved the current local-first behavior and screen structure.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

### 2026-07-07 - New Lecture UX and Vault Language

- Confirmed the active LectureVault app is the nested `LectureVault/` repo, which has the `l3cturevault` Git remote.
- Updated dashboard action panels so the main paths are clearer:
  - `New Lecture` for MP3/audio capture into the vault
  - `Exam Review` for building from saved lectures
- Updated navigation and screen titles from generic archive/upload language toward `New Lecture`, `Vault`, and `Exam Review`.
- Reworked the capture screen into a guided intake:
  - hero panel with workflow steps
  - MP3/audio-first drop zone language
  - clearer vault source naming
  - `Save to Vault` primary action
- Refined visual styling with calmer colors, task-focused dashboard cards, and responsive capture workflow chips.
- Updated `README.md` to match the current product language and clarify that lecture-level audio transcription is still a future backend step.
- Verified with:
  - `npm run typecheck`
  - `npm run build`

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

- Lecture media storage now uses Supabase Storage when configured, but server-routed uploads can still be constrained by deployment request body limits. Direct browser-to-Supabase signed uploads may be needed if large MP3 uploads are rejected by Vercel.
- Supabase sync currently stores the whole app state as one JSON row with last-write-wins semantics.
- Browser `localStorage` remains a fallback/cache and can diverge if Supabase is unavailable.
- Existing media records that only contain metadata cannot recover original image pixels. Users must re-upload those images after the image embedding fix.
- PDF image embedding uses stored image data returned by review generation when available; existing metadata-only image records still cannot render pixels.
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

- Add direct browser-to-Supabase signed uploads if deployment body limits block large MP3 uploads.
- Replace single-row Supabase JSON state with relational tables and conflict-aware sync if multi-user editing becomes important.
- Add explicit image upload/re-upload controls for archive items.
- Add formula audit or uncertainty section for advanced engineering/math courses.
- Add project-level test coverage for API routes and PDF HTML generation.
