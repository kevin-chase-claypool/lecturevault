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

## Latest Changes

### 2026-07-13 - Media Library Explorer

- Reworked Media Library into the same folder tree, compact explorer list, and selected-file details model used by Vault.
- Added filename/type search plus Name, Date, and Size sort headers with ascending/descending toggles; filenames can be found by typing their first letter or any matching text.
- Retained multi-select checkboxes, drag-to-folder organization, delete-selected behavior, storage usage, original file paths, and Open/Download actions in the selected-file pane.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Transient Status Toast

- Replaced the workspace-level status strip with a fixed foreground toast at the bottom of the viewport, allowing page content to scroll behind it.
- Status messages now dismiss automatically after three seconds; new messages restart the timer, and long-running progress remains represented by the pipeline surface.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Vault Metadata Tooltips

- Added desktop hover and keyboard-focus tooltips to the selected reconstruction's media and concept bubbles.
- Media metadata now exposes saved file name, kind, size, source role, and optional caption; concept metadata exposes the title, linked source timestamp/media, and extracted detail.
- Tooltips stay hidden on touch-first layouts to keep the compact mobile Details pane clean.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Vault Explorer List

- Replaced the Vault reconstruction card list with a compact explorer-style Name, Date, and Source Size list; selection keeps all remaining reconstruction information and actions in the Details pane.
- Added sortable list headers for alphabetical name, date, and total attached-source size, with ascending/descending toggles and responsive table sizing for phone and tablet layouts.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Reconstruction Flow Refinement

- Removed the fade treatment from the compact vertical guidance ticker while keeping its restrained source-to-reconstruction motion.
- Clarified reconstruction readiness and active workflow steps, and added the date and attached-source count to the compact active-record status.
- Removed unused New Reconstruction disclosure/helper styles after the course-first collapsed flow replaced those surfaces.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Compact Reconstruction Guidance and Record Discard

- Replaced the large static New Reconstruction guidance copy with a compact vertically scrolling source-to-reconstruction ticker that fades at its entry and exit.
- Added `Discard class record` to the active course-locked record. It clears the temporary shared bucket and its attached-source references after confirmation, while retaining the original files in Supabase Media Library.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Course-First Reconstruction Start

- Reordered New Reconstruction so the user selects a course and starts its class record directly in Step 1 before sources, context, and build controls appear.
- Locked the selected course after starting the record and show its name in a compact active-record status, preventing shared sources from being assigned to the wrong class.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Consolidated Archive Sync Status

- Removed the passive `Archive synced from Supabase` workspace strip, avoiding a duplicate of the persistent connection information.
- Added the archive-storage connection state to the dark expandable navigation menu on tablet and phone; the desktop sidebar continues to show the same state.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Desktop Top Bar Cleanup

- Removed the PWA `Install app` action from the desktop top bar, where the Windows workspace does not need it.
- Kept the action on tablet and phone layouts, where installing LectureVault enables Android sharing from OneNote and audio-recorder apps.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Quiet Surface and Capacity UI Polish

- Simplified the visual system with quieter page backgrounds, solid content surfaces, lighter card elevation, and slightly denser panel spacing so information reads before decoration.
- Restyled the Media Library capacity meter as a distinct teal information panel with a higher-contrast capacity bar, separating storage health from folder-management controls without adding clutter.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Media Storage Capacity Meter

- Added a compact Media Library meter showing the live size of files in LectureVault's Supabase media bucket, used percentage, and remaining included capacity against the current Pro plan's 100 GB file-storage allowance.
- This is bucket-specific media usage, not a complete Supabase billing dashboard: database disk, egress, and unrelated projects/buckets remain visible in Supabase itself.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Require Courses for Archive Organization

- New reconstructions now require a selected course before they can be built. This prevents future unassigned (`Unfiled`) archive records that cannot belong to an archive tree.
- When the first course is created, any existing unassigned reconstructions are recovered into that course's default Lectures folder. The Vault now clearly directs users to create a course instead of presenting an empty course selector and inert folder controls.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Archive Folder Sync Protection

- Prevented the background Supabase poll from applying an older whole-state snapshot while a local archive update is still queued or being saved. This protects new folders and existing reconstructions from a stale overwrite.
- Archive subfolders now inherit their selected parent folder's course directly, preventing a new subfolder from being saved under an invisible or stale course selection.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - AI-Generated Reconstruction Titles

- The reconstruction AI now returns a concise, searchable 3-10 word title as part of the same reconstruction request. It uses the provided audio, visual notes, source roles, and relevant textbook context without a second API call.
- Newly reconstructed Vault items save this AI title automatically, replacing generic placeholders such as `Untitled reconstruction`. A user-entered working topic remains the fallback if an AI title cannot be produced.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Single Current Class Record

- Replaced the visible multi-draft selector with one `Current class record`. It is the sole temporary cross-device bucket for the just-finished class meeting.
- Starting a record creates the shared container; the tablet and phone add their OneNote PDF, images, and lecture audio to it. A successful reconstruction saves the permanent archive artifact and clears the temporary record for the next class.
- Draft hydration now also preserves a direct-share source that arrives before the cloud record finishes loading, so a newly shared PDF/MP3 is not displaced by the initial state refresh.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Direct Android Audio Sharing

- Extended the installed Android share target to accept audio files as well as OneNote PDFs and images. An MP3 shared from a recorder is uploaded directly to Supabase and attached to the active class-day workspace with the `Lecture audio` role.
- A shared OneNote PDF/image and a shared MP3 can now be sent from separate devices into the same workspace, then reconstructed together without an intermediate Media Library step.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Handwritten OneNote PDF Workflow

- Removed the readable-text OneNote browser from New Reconstruction. The intended OneNote workflow is now exclusively sharing an exported PDF or image into the active class-day workspace, preserving handwritten math, diagrams, and page layout for AI inspection.
- Existing OneNote integration and historical source snapshots remain intact; the unused import route is simply no longer presented in the reconstruction workflow.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Compartmentalized Reconstruction Workflow

- Reworked New Reconstruction into a progressive workflow: the class-day workspace remains prominent, while Android OneNote sharing, readable OneNote browsing, pasted notes, optional AI instructions, and the full AI context preview are compact expanders.
- The primary path now stays focused on details, attaching sources, and building. All prior controls remain available without forcing every user through every source or context method.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Clearer Attached-File Roles

- Reworded the attached-source role picker to explain that it classifies a file for AI rather than opening a follow-up menu or changing the original file.
- Each source now confirms, directly below its selector, how the reconstruction AI will use that chosen role. Selecting a role also reports the saved classification in the page status.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Conflict-Safe Class-Day Source Sync

- Prevented a stale phone or tablet draft view from replacing sources that were already uploaded from another device. Draft hydration is now read-only for its first render, and later saves merge permanent Supabase source references by storage path.
- This keeps a OneNote PDF attached to the selected class-day workspace after another device opens the same workspace before its normal sync interval completes.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Shared Class-Day Drafts

- Added Supabase-synced pre-reconstruction drafts for a course/date/topic, notes, and permanent source references. A draft can be opened on phone or tablet before AI reconstruction.
- New sources in an active draft upload directly to Supabase immediately, then the draft metadata syncs to the other device before Build Reconstruction is used.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Responsive Header Empty-State Fix

- Prevented the tablet and phone sidebar from stretching to an empty grid row after course state changes, such as deleting the final course. The compact header now keeps only its real content height.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Android OneNote Direct Share PWA

- LectureVault is now installable as a Progressive Web App. On Android, install it from Chrome and sign in once; it registers as a share destination for OneNote PDF and image exports.
- Sharing an exported OneNote page to LectureVault uploads the original PDF/image directly to Supabase Storage, then opens New Reconstruction with the source already attached. This avoids email clients, Resend, and Vercel request-body limits.
- Shared sources remain permanent Supabase media after reconstruction and are retained for later archive/review workflows.
- Removed the Resend email-intake feature and its temporary intake schema because the direct Android workflow is simpler and matches OneNote's actual share sheet.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Reconstruction Workflow Sections

- Organized New Reconstruction into explicit `1 Details`, `2 Sources`, `3 Context`, and `4 Build` sections that match the workflow navigator at the top of the page.
- Clarified the OneNote source picker: it imports and saves only readable OneNote page text, not handwritten ink or OneNote page images. Handwritten notes and images must be added as source files for AI to inspect them.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Compact Reconstruction Source Status

- Replaced the large stacked source-readiness cards with a compact, wrapping metadata strip for audio/video, board images, documents, notes, and textbooks.
- The same compact treatment now applies to review-source summaries, keeping source counts visible without consuming the working area on phone and tablet layouts.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - OneNote Source Picker

- Added Microsoft Graph OAuth routes for connecting a personal or school OneNote account, with encrypted refresh-token storage in Supabase.
- Added a reconstruction-level OneNote picker: browse notebooks, sections, and pages, then add selected page snapshots to the current class-day source bundle.
- Selected pages are included in the visible `Full AI build context`, passed to the reconstruction AI request, and saved on the resulting reconstruction transcript with the original OneNote page link and notebook/section names.
- OneNote is deliberately snapshot-based: future changes or moves in OneNote do not rewrite the reconstruction that used the page.
- Added `supabase/onenote_tokens.sql`. Run it in the LectureVault Supabase SQL Editor before connecting an account.
- Added required Vercel variable `ONENOTE_TOKEN_ENCRYPTION_KEY`, a random 32-byte base64 value used only to encrypt the stored OAuth tokens.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Fix OneNote OAuth Redirect

- Replaced immutable native redirect responses with `NextResponse` in the OneNote connect and callback routes, allowing the OAuth verification cookie to be set and cleared correctly.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Make OneNote Connection Discoverable

- Moved `Connect OneNote` into a prominent source-action panel directly below the course, topic, and date fields on New Reconstruction.
- Kept the lower OneNote source picker focused on browsing and selecting pages after the account is connected.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Compact Dashboard Information Density

- Reworked dashboard count cards into a compact inline metric strip and removed oversized decorative rings.
- Tablet and phone views now keep metrics in a two-column grid instead of a tall single-column stack.
- Tightened token-usage summaries and dashboard action-card height while retaining the same information and controls.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - OneNote File Explorer

- Replaced the OneNote notebook/section dropdowns with a lazy-loaded file explorer.
- The explorer supports notebooks, nested OneNote section groups, sections, and page-level selection without loading the complete account tree at once.
- Selected pages remain imported as fixed reconstruction snapshots with their notebook and section provenance.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - OneNote Explorer Feedback

- Added visible in-panel loading, successful-load, empty-library, and Graph error feedback to the OneNote explorer controls.
- OneNote folder browsing no longer fails silently; the panel now explains what was loaded or why Microsoft did not return data.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Simplify Reconstruction Sources

- Removed the redundant `Source bundle` intake panel from New Reconstruction.
- Renamed the remaining upload area to `Files for this reconstruction` / `Attached Files` and moved the OneNote connection action into the Class Notes header.
- The same source data is still saved and used for the reconstruction; this change removes visual duplication only.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-13 - Source-Grounded AI Context

- Reworked the read-only preview into `Full AI build context`. It now displays the exact shared organizing instructions and output contract used by the reconstruction API before the current course, notes, source manifest, and textbook-retrieval context.
- Centralized the reconstruction AI instructions and output contract in `lib/lecture-ai-context.ts`, which is imported by both the API route and the client preview to prevent divergence.
- Added a live read-only AI context preview to the Reconstruction Brief so users can inspect the course profile, brief fields, pasted notes, source roles/captions, and textbook-retrieval status before starting a token-spending build.
- Added an optional, saved course study profile for exam format, allowed materials, notation, textbook scope, and recurring instructor priorities. It is included in reconstruction and review AI requests for that course.
- Added a compact per-class `Reconstruction Brief` with a class-day objective, instructor/board emphasis, and unresolved-question field so the model can preserve important worked problems and flag uncertainty instead of guessing.
- Added source roles and optional captions to every reconstruction upload. These persist with media records and tell AI whether a file is lecture audio, board work, a worked example, OneNote export, handout, or other context.
- Strengthened lecture AI instructions and output requirements for learning objectives, formulas with definitions, source-supported worked-problem steps, common mistakes, figure references, and uncertainty flags.
- Added course profile and image-caption context to AI review generation as well, without re-transcribing saved audio.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-12 - Intuitive workflow polish

- Added a visible `Ready to build` / `Add a source` state to the New Reconstruction screen.
- Grouped reconstruction completion controls into a dedicated action area with clear guidance for building now versus saving the source bundle for later.
- Strengthened the shared shell hierarchy with a primary `New Reconstruction` action, quieter logout treatment, more generous desktop spacing, and clearer navigation rhythm.
- Added subtle metric-card depth and tightened capture-media panel shadows without changing workflow behavior.
- Made each course summary show explicit reconstruction and textbook totals as compact status chips.
- Audited responsive topbar actions and allowed long labels such as `New Reconstruction` to wrap cleanly on phone and tablet widths.
- Removed the redundant `Save Source Bundle` control; `Build Reconstruction` is now the single action that persists the source bundle and creates the AI artifact.
- Added a responsive dashboard workflow diagram showing `Capture -> Reconstruct -> Archive -> Review` beside the dashboard title on desktop and as a compact step strip on smaller screens.
- Fixed the phone/tablet workflow strip inheriting a desktop flex height, which caused excessive vertical whitespace between its numbers and labels.
- Shortened the workflow diagram's second step from `Reconstruct` to `Build` so it cannot split awkwardly at compact widths.
- Grouped desktop navigation into `Workspace`, `Library`, and `Study` sections while keeping the mobile menu as a compact flat grid.
- Reworked Vault folder contents into a scalable selectable lecture list with a sticky selected-reconstruction inspector and inline `Open`, `Add to Review`, and `Delete` actions.
- Made the Vault list stack cleanly on phone widths while removing its desktop max-height restriction on small screens.
- Added clear `In Review Draft` states to Vault list rows and the details pane so sources already selected for the active review cannot be added twice.
- Renamed Vault pane headings to `Reconstructions` and `Details` and added an accessible label to the selected-course control.
- Removed the dead non-AI reconstruction branch, unreachable standalone study-guide screen, unused guide-selection state, unused helper, and unused shadow token.
- Refined Vault action hierarchy: list rows now keep only `Open` and `Add to Review`, deletion stays in Details, and the current review-draft status is visible at list and item level.
- Added keyboard selection support for Vault rows and clearer review-draft wording in the topbar.
- Verified with `npm run typecheck` and `npm run build`.
- Disabled `Build Reconstruction` and `Save Source Bundle` until at least one source exists, matching the source-bundle workflow.
- Added concise helper text explaining that one source is enough and clarifying what token-spending actions do.
- Renamed dashboard archive heading to `Recent Reconstructions` and added lightweight section notes for dashboard usage and review sets.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Shift intake workflow to Lecture Reconstruction

- Reframed the capture workflow from `New Lecture` / transcription into `New Reconstruction` / daily class-meeting reconstruction.
- Added source-readiness indicators for optional source types: audio/video, board images, documents, notes, and indexed textbooks.
- Updated the lecture AI route instructions so missing source types are expected and the model builds the best reconstruction from the available source bundle without inventing missing context.
- Kept the existing `Lecture` data model for compatibility with saved records while changing the user-facing workflow language.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Cross-device polish pass

- Replaced the internal `Local-first MVP` header fallback with `LectureVault Workspace`.
- Refined global design tokens, shadows, radii, button styling, focus outlines, panels, dashboard action cards, repeated rows, Media Library rows, capture panels, and review workflow surfaces.
- Tightened tablet and phone spacing so the same visual system holds across desktop, tablet, and mobile without removing any features.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Name Media Library usage references

- Media Library file rows now show which lecture title references a stored file, for example `Used by: Calc`, instead of only showing a generic count.
- Multiple lecture references are deduplicated and listed by title; legacy records without a matching lecture still fall back to the count.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Fix tablet Media Library row overflow

- Reworked Media Library file rows from loose table-like columns into grouped file identity, metadata, actions, and path regions.
- Added tablet-specific storage row card styling so filenames wrap cleanly and `Open` / `Download` actions stay inside the row boundary.
- Phone storage rows reuse the same grouped layout as a single-column card.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Collapsible tablet navigation

- Extended the brand/logo-triggered hidden navigation menu to tablet widths.
- Tablet now uses a sticky top app header instead of a narrow left rail, keeping section navigation reachable without permanently occupying horizontal space.
- The opened tablet menu uses a compact three-column layout; phone remains two-column.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Collapsible phone navigation

- Replaced the overflowing horizontal phone navigation with a hidden mobile menu opened from the LectureVault brand/logo header.
- Kept the mobile header sticky at the top of the viewport so navigation remains reachable while scrolling.
- Mobile menu items render as a compact two-column panel and close after selecting a section.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-12 - Phone UI modernization

- Reworked the phone layout so the desktop sidebar becomes a compact sticky mobile header with brand, author line, and horizontally scrollable pill navigation.
- Tightened the mobile topbar, status panel, metrics, lecture cards, review action cards, and panels for a sleeker app-like experience while keeping all existing sections and actions reachable.
- Improved mobile touch targets for form controls and toolbar actions, while keeping lecture-card actions compact in a two-column layout when space allows.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

### 2026-07-08 - Professional polish pass

- Refined the sidebar, brand mark, navigation active states, app background, topbar, status panels, cards, pills, and review action cards for a calmer professional interface.
- Renamed the review bulk action from `Add visible sources` to `Add Shown Lectures to Review` so the button describes exactly what it does.
- Split GPT package export busy state from PDF rendering busy state. Downloading a GPT package now shows `Building ZIP...` only on that action instead of making the PDF action appear busy.
- Verification: run `npm run build`, then run `npm run typecheck` as a standalone command.

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

Required for OneNote source selection:

```text
ONENOTE_CLIENT_ID
ONENOTE_CLIENT_SECRET
ONENOTE_TENANT_ID=common
ONENOTE_REDIRECT_URI
ONENOTE_TOKEN_ENCRYPTION_KEY
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

### 2026-07-08 - Separate Review Action Workflows

- Replaced the mixed review action button row with grouped `Review Actions` cards.
- Split actions into: generate in LectureVault, export saved review PDF, export raw GPT context package, and delete review set.
- Added concise helper text explaining which actions spend OpenAI API tokens and which are exports only.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-08 - Add Review Set GPT Package Export

- Added `Download GPT Package` to review sets.
- The export builds a ZIP in the browser with `README.md`, `prompt.md`, `source-map.json`, per-lecture transcript markdown files, and attached board/worked-problem image files under `media/`.
- The package uses existing authenticated Supabase media reads to include actual image files instead of only text references.
- This gives a low-token path for using ChatGPT manually outside LectureVault while preserving source organization.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-08 - Further Professional UI Polish

- Refined global color tokens, shadows, typography weight, and form control spacing.
- Tightened sidebar, topbar, status, metric, panel, lecture-card, row-card, pipeline, and usage-summary surfaces.
- Improved archive tree, upload dropzone, source cards, review workflow panels, and dense repeated item cards.
- Improved tablet/mobile button-row behavior so action controls fill space cleanly instead of bunching.
- Visual-only pass; no data or workflow behavior changed.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-08 - Add AI Pipeline Status and Usage Summary

- Added a visible pipeline status panel for long AI workflows.
- Textbook indexing now shows upload, extraction, vector indexing, and save stages.
- Lecture AI generation now shows media upload, transcription, textbook retrieval, artifact generation, and vault save stages.
- Review AI generation now shows source collection, context preparation, generation, and save stages.
- Added a dashboard token usage summary separating lecture/transcription usage, textbook embedding/indexing usage, and review generation usage.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-08 - Add Course Textbook PDF Context

- Added course-level textbook PDF support on the Courses screen.
- Textbook PDFs upload directly to Supabase Storage using the existing signed-upload path, so large PDFs do not route through Vercel request bodies.
- Added `/api/textbook/extract` to read the stored PDF from Supabase and extract per-page text chunks server-side.
- Added `textbooks` and `textbookChunks` to the shared Vault state.
- Textbook extraction now generates OpenAI embeddings and upserts chunk vectors into Supabase `public.textbook_chunks`.
- New textbook uploads keep full chunk text in Supabase vector rows rather than bloating the shared JSON app state.
- Lecture AI generation now uses the Supabase `match_textbook_chunks` RPC for semantic textbook retrieval when a course id is available.
- Lecture AI instructions now require a `Textbook Context Used` section and page citations when textbook excerpts are used.
- Removing a textbook deletes its vector rows from Supabase before removing local metadata.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Sidebar Brand and UI Polish

- Added `Kevin C. Claypool` as smaller italic brand text under `LectureVault` in the left sidebar.
- Refined the app chrome with a more polished sidebar treatment, topbar surface, panel elevation, status message styling, and navigation/button states.
- Kept the polish pass visual-only; no workflow or data model changes.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Add Supabase Media Library

- Added a `Media Library` section to the left navigation.
- Added `/api/media/objects` for authenticated recursive listing and deletion of Supabase Storage media objects.
- Added a file-explorer-style Media Library screen showing bucket, file count, total stored size, object path, MIME type, size, updated date, usage references, and open/download actions.
- Added virtual folders with drag-and-drop file organization. Moving files in the Media Library only updates LectureVault placement metadata; it does not rename or move the Supabase object, so saved lecture/review links keep working.
- Added virtual-folder create, rename, delete, all-files, and unfiled views.
- Added guarded multi-select deletion for Supabase files, with a warning that deleting storage objects does not remove lecture records.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Direct Supabase Media Uploads

- Added `/api/media/signed-upload` to create short-lived Supabase Storage signed upload URLs for authenticated users.
- Lecture media now uploads directly from the browser to Supabase Storage using the signed URL, avoiding Vercel function payload limits for large MP3/image uploads.
- Kept the existing server upload route only as a fallback for small files under 4 MB.
- Large files now fail visibly if direct Supabase upload cannot be created or completed, instead of silently saving metadata-only media.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Further Professional UI Polish

- Refined global rendering with font smoothing, selection color, and styled scrollbars.
- Improved button/input focus, active nav, card, metric, panel, and selected-card states.
- Added more polished gradients/shadows to archive trees, repeated list items, media/concept cards, math/transcript panels, drop zones, and review workflow surfaces.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Make PDF Download Feedback Visible

- Added a local PDF status/error message inside the Review Set panel, directly below the review actions.
- The `Download Review PDF` action now immediately shows progress and any failure near the button instead of only updating the global status banner.
- Split review generation and PDF rendering busy states so `Generate AI Review` and `Download Review PDF` no longer both show `Working...` for either operation.
- Clarified the review usage panel copy: PDF downloads do not run AI again or spend review-generation tokens.
- Hardened PDF error parsing on the client so non-JSON failures do not appear silent.
- Expanded the missing `BROWSERLESS_TOKEN` server error with a clear Vercel environment-variable instruction.
- Added non-secret Browserless runtime diagnostics to PDF errors and token fallbacks for `BROWSERLESS_API_KEY` / `BROWSERLESS_KEY`.
- Reduced PDF request payload size by sending Supabase image references instead of large base64 image data when storage paths are available; the PDF route resolves images server-side.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Professional Brand Polish and Vault Icon

- Replaced the text `LV` brand mark with a reusable vault icon in the sidebar, login, and setup/loading screens.
- Added `app/icon.svg` and metadata icon wiring so the website/browser icon uses the vault mark.
- Refined the visual system with stronger surfaces, cleaner shadows, polished button gradients, improved nav active treatment, and a more professional sidebar/topbar treatment.
- Removed the sidebar tagline so the brand area is only the vault icon next to `LectureVault`, and tightened sidebar spacing/nav/sync styling.
- Verified with:
  - `npm run build`
  - `npm run typecheck`

### 2026-07-07 - Compact Vault Cards and Render Review Math

- Made Vault folder contents use compact lecture cards so folder contents are shorter and easier to scan.
- Made Reviews source candidates use the same compact lecture cards as Vault for a shorter at-a-glance list.
- Fixed Vault lecture selection so clicking a compact folder-content card updates the right-side `Selected Lecture` inspector without opening the detail page.
- Replaced raw generated-review `<pre>` previews with rendered Markdown-style review content that supports KaTeX math in the app.
- Normalized double-escaped AI LaTeX such as `\\(` and `\\frac` before app/PDF rendering so generated math previews as KaTeX instead of raw text.
- Fixed inline KaTeX detection for formulas containing normal parentheses, such as `p(\theta)`, by matching through the closing `\)` delimiter.
- Rendered extracted concept titles/details through the same KaTeX preview path as summaries and transcripts.
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

### 2026-07-13 - Inspector Tooltip Refinement

- Constrained desktop metadata tooltips to the available details-pane width and made long source names, paths, and concept details wrap safely instead of creating horizontal overflow.
- Added hover and keyboard-focus metadata inspectors to Media Library file-size and reconstruction-reference bubbles, while retaining the visible reference list for touch devices.
- Removed horizontal scrolling from the Vault Details inspector while preserving vertical scrolling for long records.
- Removed course-term labels from workspace page headers to keep navigation context compact and consistent.

### 2026-07-13 - Interface Refinement Pass

- Tightened the shared control and surface system with calmer secondary actions, tactile button feedback, centered desktop composition, and more legible dashboard rows.
- Reworked phone header actions so the primary reconstruction action has a full row, with the review draft and log-out controls placed beneath it.
- Matched the Vault course selector width to the Details inspector for clearer alignment in the archive workspace.
- Replaced Review source cards with a compact, sortable file-explorer list and a focused selected-reconstruction preview.
- Added explicit Review Draft progression guidance so disabled creation and generation actions explain the next required step.
- Moved global token-usage totals and reconstruction/textbook/review breakdowns from the dashboard into the desktop sidebar and mobile navigation drawer.
- Reduced sidebar and mobile usage labels to total-token counts, with full input/output breakdowns retained in native hover tooltips.
- Aligned desktop sidebar library counts into the same compact label/value row pattern as AI usage.
- Hide the New Reconstruction shortcut while the user is already on the New Reconstruction workspace.

- Add direct browser-to-Supabase signed uploads if deployment body limits block large MP3 uploads.
- Replace single-row Supabase JSON state with relational tables and conflict-aware sync if multi-user editing becomes important.
- Add explicit image upload/re-upload controls for archive items.
- Add formula audit or uncertainty section for advanced engineering/math courses.
- Add project-level test coverage for API routes and PDF HTML generation.
