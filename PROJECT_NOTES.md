# LectureVault Project Notes

## 2026-08-17 - Layer Reconstructions and Persist Syllabus Mapping

- Reconstruction AI now returns one notes-first, guided-lesson-second Markdown artifact. Outside pedagogical additions must be visibly labelled as Enrichment, while uncertainty remains explicit and source-grounded.
- The course syllabus is attached as private, signed PDF context during reconstruction when available. AI suggests topic/unit labels and high/medium/low exam relevance; the saved reconstruction shows an editable mapping panel so the owner can correct it.
- Exam review generation now treats explicit instructor evidence as stronger than inferred lecture emphasis and produces a layered exam packet without claiming to assess student mastery.
- Verification: `npm run typecheck` and `npm run build` from `LectureVault`.

## 2026-08-17 - Initialize PDF.js Node Canvas Globals

- The sequential extractor exposed a second runtime compatibility issue: PDF.js references `DOMMatrix` before page text extraction begins.
- Registered `DOMMatrix`, `ImageData`, and `Path2D` from `@napi-rs/canvas` before dynamically importing PDF.js, preserving the low-memory sequential page path.
- Verification: run `npm run typecheck` and `npm run build` from `LectureVault`.
- The native canvas import is intentionally dynamic so Vercel does not try to webpack the platform `.node` binary.

## 2026-08-17 - Extract Textbook Pages Sequentially

- Production logs showed `pdf2json` exhausting the Vercel function memory while parsing a 387-page textbook because its PDF.js path requests all pages concurrently.
- Replaced the extraction step with direct PDF.js text extraction that processes one page at a time, calls `page.cleanup()`, and destroys the document after indexing. Page numbering, chunking, canonical evidence, embeddings, and targeted visual-review behavior remain unchanged.
- Verification: `npm run typecheck`, `npm run build`, and `git diff --check` passed.

## 2026-08-17 - Make Textbook Storage And Index Details Expandable

- Kept the uploaded textbook row compact while moving the full file, Storage, page, chunk, canonical-evidence, visual-review, and AI usage metadata into an inline collapsible disclosure.
- Storage paths remain wrapped safely, and the disclosure uses the existing textbook card so it stays associated with the original PDF and its reconstruction/review evidence.
- Verification: `npm run typecheck`, `npm run build`, and `git diff --check` passed.

## 2026-08-17 - Move Large Textbook Uploads Off Vercel

- Replaced the broken multipart `PUT` to a Supabase signed-object URL with a raw-file request for small non-PDF files and a signed TUS resumable upload for every PDF (and files over 6 MB).
- Large textbook PDFs now travel directly from the browser to Supabase Storage's dedicated hostname in fixed 6 MB chunks, automatically retrying and resuming an interrupted upload. The Vercel app only issues a short-lived, path-scoped signed upload token; it never receives the PDF request body.
- Textbooks retain the existing private Storage object, one-time canonical page evidence, embeddings, and page citations. Reconstruction and review generation therefore continue to retrieve only relevant saved pages/chunks rather than duplicating the textbook or repeatedly running full-book vision analysis.
- Verification: run `npm run typecheck` and `npm run build` from `LectureVault`.

## 2026-08-17 - Include Public API Key In TUS Uploads

- Added the Supabase publishable/legacy anon key as the `apikey` header on resumable uploads, alongside the path-scoped signed upload token. Supabase's current TUS examples send both headers; the service-role key is never exposed to the browser.
- Configure one of `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel if the project does not already provide one.

## 2026-08-17 - Restore Vercel Textbook Deployment Lockfile

- Regenerated `pnpm-lock.yaml` after adding `pdf2json`. Vercel uses pnpm because this repository includes a pnpm lockfile, and its frozen install rejected the prior production deployment because the new parser dependency was absent from that lockfile.
- Verified both type checking and the production build after the lockfile update. This enables Vercel to install the self-contained textbook parser before the extraction route runs.

## 2026-08-17 - Replace Textbook PDF.js Worker Extraction

- Replaced the textbook ingestion route's `pdf-parse`/PDF.js worker path with `pdf2json`, a self-contained Node-side parser that does not dynamically import a browser worker at runtime.
- Preserved the existing page-aware textbook contract by converting parser pages into ordered `{ num, text }` records, so chunking, embeddings, page citations, math-risk visual verification, and reconstruction/review retrieval remain unchanged.
- Derived the returned page count from the normalized parser pages rather than relying on the previous parser's `total` field.
- Removed the obsolete PDF.js worker tracing configuration and retained only the self-contained parser as a Vercel server external package.
- This targets the production failure where Vercel uploaded a textbook successfully but could not locate `pdf.worker.mjs` during extraction.

## 2026-08-16 - Trace PDF.js Worker in the Textbook Function

- Expanded the Vercel trace to include the full legacy PDF.js build from both the regular dependency link and pnpm's physical package path. This covers the location used by Vercel's serverless pnpm runtime when `PDFParse` loads its worker.
- The extraction route now targets the traced dependency-root worker path and passes its `file:` URL to `PDFParse.setWorker`, avoiding PDF.js's fragile relative worker lookup through Vercel's pnpm package links without requiring Next.js to statically parse `createRequire`.
- Marked `pdf-parse` and `pdfjs-dist` as Next.js server-external packages alongside the native canvas dependency.
- This keeps PDF.js and its adjacent `pdf.worker.mjs` together in Vercel's traced serverless function instead of bundling only the loader into a generated Next.js chunk. The worker is also explicitly included in the textbook route trace because PDF.js loads it dynamically.
- The extraction route now resolves that traced worker with Node's module resolver and passes its `file:` URL to `PDFParse.setWorker`, avoiding PDF.js's fragile relative worker lookup through Vercel's pnpm package links.
- Resolves the textbook-upload failure where PDF.js attempted to import a missing fake worker. The existing extraction, indexing, citation, and Supabase storage workflows are unchanged.

## 2026-08-16 - Fix Server PDF Runtime Initialization

- Removed the eager `pdf-parse` import from textbook extraction because it initialized PDF.js before Node DOM polyfills existed in the Vercel function.
- The extraction route now loads `@napi-rs/canvas`, registers `DOMMatrix`, `ImageData`, and `Path2D`, then dynamically loads `pdf-parse` and always destroys the parser after text extraction.
- Declared the native canvas package as a Next.js server external dependency so Vercel retains it in the function bundle.
- Added structured server-side extraction failure logging with the course, textbook, and storage path identifiers. Client behavior and existing textbook indexing workflow remain unchanged.

## 2026-07-28 - Isolate Full Transcript Equation Flow

- Added a dedicated source-transcript math renderer that uses real block elements for display equations instead of relying on inline spans inside grid buttons.
- Reworked full-transcript rows into a wrapping flex layout with bounded equation overflow, preventing KaTeX from painting across adjacent source passages on mobile and narrow screens.
- Kept the general `MathPreview` renderer unchanged so reconstruction, review, and other KaTeX surfaces retain their existing behavior.

## 2026-07-28 - Keep Source Transcript Math Inline

- Changed only the compact Full Transcript source-record list to render recognized formulas inline, preventing incomplete or split delimiters from producing oversized KaTeX display boxes that overlap neighboring passages.
- Preserved display-mode KaTeX for reconstruction artifacts, review output, and other study views where complete equations are available.

## 2026-07-28 - Prevent Source Transcript Display Fragments

- Removed the remaining display-equation branch from compact Full Transcript rows so split or incomplete source delimiters cannot create block-level equation containers inside neighboring passages.
- Reconstruction and review artifact rendering still retain their existing display-equation behavior.

## 2026-07-28 - Use Dedicated Flow for Full Transcript Math

- Added a dedicated rendered-content wrapper inside Reconstruction Detail transcript rows so plain text and display equations flow vertically without overlapping adjacent source passages.
- Kept the existing transcript selection, search, audio cue, and KaTeX behavior unchanged.

## 2026-07-28 - Contain KaTeX in Full Transcript Rows

- Strengthened the Reconstruction Detail full-transcript list so rows size to their content instead of allowing display equations to paint over adjacent source passages.
- Added explicit content sizing, overflow, and KaTeX containment rules for wide and narrow layouts.
- Preserved transcript selection, search, and audio cue behavior.

## 2026-07-28 - Prevent Math Overlap in Source Transcript Rows

- Changed full transcript rows to use a block-level text container so rendered KaTeX/display equations participate in the row height correctly.
- Added wrapping and equation overflow rules scoped to transcript rows, preventing long formulas and source passages from drawing over neighboring rows.
- Preserved transcript selection, search, and audio cue behavior.

## 2026-07-28 - Align Source Disclosure Status Badges

- Changed reconstruction source/context disclosure summaries from a flexible space-between row to a fixed three-column grid.
- Optional/Added status badges now share one aligned column across Android sharing, typed notes, and AI instruction panels, while the expand control remains at the far edge.
- No workflow, state, data, or responsive behavior was changed beyond the row alignment.

## 2026-07-28 - Visually Verify Math-Risk Textbook Pages Once

- Strengthened textbook ingestion for mathematics-heavy courses with a conservative math-risk detector that recognizes LaTeX commands, equation operators, indexed variables, and multiple equation-like lines.
- Native-text pages that trigger the detector now receive one-time page-level vision indexing during upload/reindex, while ordinary text pages remain on the lower-cost native extraction path.
- The visual record replaces the provisional native page evidence for that page instead of creating duplicate citation records. Future reconstructions and reviews reuse the saved evidence and only attach original pages that still require verification.
- The user workflow remains one textbook upload; no per-reconstruction full-PDF reprocessing was introduced.

## 2026-07-28 - Unify Explorer Selection Contrast

- Ontoly/source inspection and the responsive UI audit found a CSS cascade conflict: later dark-mode explorer surface rules could override the gold selected-state treatment used by Vault, Media Library, Reviews, and Past Reviews.
- Added a final theme-layer override so selected rows, folders, review sources, and explorer items consistently use the gold border/background/text treatment in dark mode.
- Native text selection, checkboxes, and audio range controls now use the same gold selection accent. This changes presentation only; archive selection and data behavior are unchanged.

## 2026-07-28 - Normalize Responsive Header Alignment

- The responsive stylesheet contained a late `translateY(5px)` adjustment and asymmetric sidebar padding that shifted the mobile/tablet brand row and menu control away from the header centerline.
- Added a final responsive header contract that uses balanced rail padding, flex alignment, and no transform offset at widths below 1120px.
  - Navigation behavior, menu expansion, and workspace spacing are unchanged; this is a layout-only correction for tablet, phone, and split-screen widths.

## 2026-07-28 - Remove Conflicting Responsive Header Rules

- Removed the obsolete responsive `translateY(5px)` brand-row adjustment and duplicate asymmetric sidebar padding that remained earlier in `app/styles.css` after the header alignment fix.
- The final responsive header contract is now the only rule responsible for compact header padding and vertical alignment, reducing cascade ambiguity across tablet, phone, and split-screen widths.
- Navigation behavior, menu expansion, workspace spacing, and data flows are unchanged.

## 2026-07-28 - Align Mobile Media Explorer Columns

- Added compact tablet/phone grid definitions for Media Library rows and headers so filename, date, and size remain aligned within one readable row.
- Added a narrower phone variant for long media names without removing searchable or sortable metadata.
- This is a presentation-only correction; Supabase objects, media links, selection state, and file-management behavior are unchanged.

## 2026-07-28 - Align Media Explorer Headers With Rows

- Added the same final responsive grid contract to the Media Library header and body rows at tablet, phone, and narrow-phone widths.
- Date and size headings now remain aligned with their corresponding file metadata instead of retaining desktop column widths.
- Search, sorting, selection, drag-and-drop, Supabase links, and file-management behavior are unchanged.

## Working Rule

Update this file after every code change. Keep it current with what changed, why it changed, how to verify it, and what remains unresolved.

## 2026-07-24 - Normalize Explorer Readability and Selection States

Added a final shared explorer styling layer for Vault, Media Library, Reviews, Past Reviews, and study navigation. Compact rows now keep date, size, and metadata columns vertically aligned and readable at narrow widths, while selected rows and active folders use one gold treatment in both themes. Blue remains available for actions and hover states.

Follow-up: corrected the mobile storage-card override that was forcing Media Library checkboxes onto a full-width grid row. Storage explorer rows now keep filename, date, and size in aligned columns on phone and tablet widths.

## 2026-07-24 - Signed Media References for AI Visual Inputs

Stored images and OneNote PDFs now use short-lived Supabase signed URLs when passed to OpenAI visual inputs. Inline data URLs remain supported for newly attached local files, and audio transcription continues using the existing MP3 chunking path. This avoids expanding every stored visual source into a large base64 request payload while preserving private storage and the one-upload workflow. Textbook page visual verification still uses small extracted page PDFs because those pages are generated from the indexed source and require bounded page-level inspection.

## Product Goal

LectureVault is a source-grounded class reconstruction archive with exam reviews. The intended workflow is:

1. Capture or upload lecture material.
2. Build and archive one reconstruction per class meeting, including its transcript, concepts, citations, and source media.
3. Select archived reconstructions for an exam review.
4. Use the review set as the active exam-preparation surface.
5. Run a distinct AI aggregation pass over only the selected exam materials.
6. Preview a focused exam review.
7. Download a KaTeX-rendered PDF with formulas, source references, and board figures.

The exam review must be a new synthesis artifact, not a raw transcript export.

## Current Architecture

- App: Next.js app in `LectureVault/`.
- Storage: Supabase shared JSON state in `lecturevault_state`, with browser `localStorage` under `lecturevault-state-v1` as a fallback/cache. Original source media is stored in Supabase Storage through direct signed browser uploads.
- Archive data model: courses, class records, reconstructions, media items, transcripts, extracted concepts, review sets, source references, and generated study guides.
- Exam review route: `app/api/exam-review/route.ts`.
- PDF route: `app/api/exam-review/pdf/route.ts`.
- Main UI: `app/page.tsx`.
- Styles: `app/styles.css`.

## New Thread Handoff

Read this section before changing the project.

- Workspace: `C:\Users\jacks\Documents\Fix spacemouse\LectureVault`.
- Production app: `https://l3cturevault.vercel.app`. The repository has `origin` (`lecturevault`) and `l3cturevault` remotes; verified changes are pushed to `main` on both.
- User workflow is one class record per class meeting. The user uploads one original lecture MP3 and optional handwritten OneNote PDF, board images, notes, and course-textbook context. These sources create one reconstruction; selected reconstructions later create one exam review.
- Direct browser-to-Supabase uploads preserve original source files. Do not replace, rename, or move a Supabase object merely to reorganize a UI folder; saved reconstruction and review references depend on stable source paths.
- Reconstruction audio is transcribed once using `gpt-4o-transcribe-diarize` by default. MP3s above 20 MB are split only as temporary frame-aligned transcription inputs, then merged into one chronological, original-time transcript. Reviews reuse saved reconstructions and must not re-transcribe raw audio.
- AI source rules: media is the primary class record; textbook excerpts only clarify directly supported material; figures render once and are cited as `Fig. N`; audio citations use real timestamps; cited Supabase links are signed for authenticated access.
- Primary modules: `app/page.tsx` (UI/state), `app/styles.css` (visual system), `app/api/lecture-ai/route.ts` (reconstruction), `app/api/exam-review/route.ts` (review), and `app/api/exam-review/pdf/route.ts` (PDF). Read the relevant route and adjacent UI before changing behavior.
- Supabase setup scripts checked into the repository are `supabase/lecturevault_state.sql`, `supabase/onenote_tokens.sql`, and `supabase/textbook_retrieval.sql`. Textbook retrieval depends on `pgvector`, `public.textbook_chunks`, `public.textbook_page_evidence`, and the `match_textbook_chunks` RPC; apply `textbook_retrieval.sql` before its first textbook upload.
- Do not commit secrets, modify user records, or revert unrelated dirty worktree changes. Use `apply_patch` for manual edits.

### Required Change Protocol

1. Read the relevant architecture and latest-change sections in this file, then inspect the implementation before making assumptions.
2. Keep the user-visible workflow simple: one source bundle in, one reconstruction out; selected reconstructions in, one review out.
3. Preserve responsive light and dark themes. Verify desktop, tablet, and phone surfaces when touching shared UI or CSS.
4. Update this file after every code change with behavior, rationale, and verification.
5. Run `npm run typecheck` and `npm run build` before committing. Run focused manual workflow checks when behavior changes.
6. Commit only the intended files, push `main` to both configured remotes, and confirm the Vercel deployment before telling the user the update is live.

## Latest Changes

### 2026-07-24 - Keep Mobile Toast Fully In View

- Corrected the mobile status toast so it no longer inherits the desktop `translateX(-50%)` centering transform after being anchored with both left and right insets.
- The toast now uses safe-area-aware bottom and side insets, automatic width, and a vertical-only entrance animation, keeping feedback fully visible above Android system controls.

### 2026-07-24 - Mobile Layout Consolidation

- Replaced the guessed-height fixed responsive header with a normal-flow sticky app bar. Opening or closing the mobile navigation no longer overlays workspace content or leaves a reserved blank gap.
- Consolidated phone layouts around bounded explorer lists, stacked detail panels, compact review rows, and touch-sized controls. Desktop retains its multi-column explorer layouts while mobile keeps the same actions and data in a smaller presentation.
- Mobile archive, media, review, and study lists now constrain their own scrolling areas instead of widening the document. Figure and formula surfaces stay contained within the available device width.
- Verification required: run `npm run typecheck`, `npm run build`, then check the closed and open mobile menu, Vault selection, Media Library, New Review, Past Reviews, and reconstruction study detail in both light and dark themes.

### 2026-07-23 - Dedicated Past Reviews Explorer

- Split the Study navigation into `New Review` and `Past Reviews`. The New Review workspace now focuses only on selecting reconstructions and creating a review set; saved review sets no longer expand the narrow draft panel.
- Replaced the retired empty-review form with a compact Past Reviews explorer. It supports nested review folders, folder create/rename/delete, search, name/date/course sorting, a selected-review inspector, and moving any saved review to a folder or back to Unfiled. Changing folders or search results selects the first visible review so the inspector never shows an unrelated hidden item.
- Review folders are archive metadata only. Moving or deleting a review folder never changes the saved review artifact, selected reconstructions, generated guide, or referenced Supabase media; deleting a folder returns its review sets to Unfiled.
- Verification required: run `npm run typecheck`, then `npm run build`; create a review in New Review, organize it in Past Reviews, move it between folders, and confirm opening it still preserves all selected reconstructions and generated output.

### 2026-07-23 - Audio Timestamps Only

- Removed the synthetic 45-second transcript timing fallback. Logical reconstruction sections now use an untimed representation instead of implying they are audio cues.
- Reconstruction and review prompts explicitly prohibit elapsed `M:SS` timestamps when no actual audio cue is available. The reconstruction API also removes stray leading timestamps from non-audio output before it is saved.
- Reconstruction, KaTeX preview, study-guide, source-map, concept-tooltip, and review-context rendering now expose timestamps only for segments that have a real audio media reference and a valid duration. Image, PDF, and note-only sources remain organized by headings and figures without an artificial timeline.
- Existing untimed reconstructions receive the same cleanup in their KaTeX and study-guide display, so legacy visual-only output no longer shows fake timing prefixes.
- Verification required: run `npm run typecheck`, `npm run build`, create an image-only reconstruction, and confirm neither its detail view nor review context shows elapsed timestamps; confirm a recorded MP3 still renders clickable audio times.

### 2026-07-21 - One-Time Canonical Textbook Evidence

- Added the durable `public.textbook_page_evidence` Supabase table. Textbook ingestion now saves a page-level canonical record for every readable page: native PDF text for text-backed pages and a faithful vision record for sparse/image-first pages.
- Reconstructions and reviews now retrieve this stored page evidence alongside existing vector results. A normal cited textbook page is not reattached to the model, so later reconstructions and reviews do not pay repeated vision input cost for the same book page.
- Original PDF pages stay in Supabase Storage and keep their page-specific signed links. They are attached to an AI request only when the first visual scan explicitly marked a page unclear, or while an older textbook has not yet been reindexed into the new page-evidence table.
- Removed the old silent page-evidence cut-off from the original-page fallback. All selected citation pages are retained when a recheck is actually needed.
- Course textbook metadata now reports canonical page-record and recheck counts after upload. Existing textbooks remain usable through the fallback path and show a one-time `Reindex once` action that builds their canonical page cache without uploading the PDF again.
- Hardened the existing `match_textbook_chunks` database function with an explicit `public` search path while applying the page-evidence migration.
- Verification required: apply `supabase/textbook_retrieval.sql`, run `npm run typecheck`, then `npm run build`; upload a textbook and confirm subsequent reconstruction/review calls use the canonical page record without attaching the normal source PDF page again.

### 2026-07-21 - Header Accent Seam Removal

- Removed the nonfunctional fading underline from shared desktop page headers. Its clipped gradient created a false broken-corner artifact under titles such as Dashboard, Courses, Reviews, and Media Library.
- The header now relies on its contained border and surface hierarchy, which remains consistent in light and dark mode at every viewport.

### 2026-07-21 - Textbook Evidence Retrieval and Citation Verification

- Added `supabase/textbook_retrieval.sql`, which creates the checked-in `pgvector` table, indexes, and bounded semantic-search RPC required for textbook retrieval in a fresh project.
- Removed the previous silent 180-chunk indexing cap. A textbook upload now embeds every readable extracted section, so later chapters remain searchable instead of being omitted without warning.
- Textbook upload indexes native PDF text across every readable page. For sparse scanned/image-only pages, it automatically creates a faithful visual search record before embedding; the source PDF remains the permanent authority in Supabase Storage.
- Textbook indexing usage now includes both native-embedding tokens and any visual-page analysis tokens, so the stored usage summary reflects the complete one-time indexing cost.
- The compact sidebar/mobile usage summary now separates `Visual pages` from the complete `Textbooks` total when image-first textbook pages were analyzed. The visual amount is a subtotal, not an additional charge, and its hover detail explains that relationship.
- Reconstruction AI now receives up to eight semantically retrieved excerpts together with isolated original PDF pages from those exact locations. The original page is used to verify equations, diagrams, tables, units, and notation before a citation is emitted.
- Review AI receives the original pages for textbook citations already selected by its reconstructions, so review citations are also visually grounded rather than relying only on saved text.
- Citation behavior remains selective: only material that clarifies lecture-supported content is cited, and figures/textbook pages are linked rather than repeatedly duplicated.
- Verification required: run `npm run typecheck`, then `npm run build`; upload a textbook, reconstruct a lecture with a textbook-supported formula, generate a review, and confirm a concise citation links to the expected PDF page.

### 2026-07-21 - New Thread Documentation Handoff

- Rewrote `README.md` to describe the current reconstruction-and-review product instead of retired lecture/exam-basket screens and obsolete local-media constraints.
- Added a concise new-thread handoff and required change protocol, including the active data workflow, source-link invariants, primary modules, verification, deployment, and documentation rules.

### 2026-07-21 - Reliable Long-Lecture Audio Transcription

- Added internal MP3 transcription chunking for files larger than 20 MB. LectureVault splits only temporary transcription inputs at MP3 frame boundaries while leaving the single original MP3 untouched in Supabase.
- Chunks target 16 MB, retain a two-second boundary overlap to protect spoken context, and merge diarized segments into one ordered transcript with source-relative timestamps.
- Reconstruction AI receives one continuous transcript and retains accurate `Audio M:SS` citations against the original stored MP3. The user still uploads one lecture recording and never manages chunks.
- Verified with `npm run typecheck` and `npm run build`.

### 2026-07-23 - Readable Long-Lecture Reconstruction View

- Reordered reconstruction detail so the structured, KaTeX-capable study artifact is the primary reading surface rather than the raw source transcript.
- Preserved every saved transcript passage in a collapsed `Full audio transcript` source timeline with search, bounded scrolling, and click-to-play audio cues against the original stored recording.
- The transcript remains available in full for verification, AI context, exports, and source-grounded study, but no longer forces a student to scroll through an hour of raw speech before reaching the reconstruction.
- Renamed review-facing segment counts to `source passages` so workflow screens emphasize selected reconstructions and study material rather than internal transcription chunking.

### 2026-07-21 - Reconstruction Evidence and Review Context

- Added selective source-linked reconstruction evidence: stable `Fig. N` board visuals, source-grounded timestamped audio clips, and nearby textbook page citations only where they clarify lecture-supported material.
- Added signed Supabase source links for authenticated, direct access from reconstructions and PDF exports without an additional LectureVault sign-in.
- Review outputs render each selected figure once in a dedicated `Figure references` section and preserve clickable source links in their PDF appendix.
- Removed the fixed combined-character review cutoff. Every selected reconstruction's saved text is now included; the safeguards are 25 selected reconstructions and 100 review figures, with visible failure rather than silent omission if provider capacity is exceeded.

### 2026-07-20 - Reconstruction Flow and Theme Consistency

- Ordered class-record setup as Course, Reconstruction topic, Date, then Start class record. Course and topic use `A` and `B` labels, leaving numbers for the main workflow stages.
- Added selective textbook-reference instructions: retrieved excerpts clarify lecture-supported explanations only and use nearby page citations.
- Completed dark authentication, dark explorer/card coverage, gold workflow emphasis, and consolidated theme controls into the bottom workspace summary.

### 2026-07-20 - Cohesive Interface Audit

- Added a final shared visual layer for control radii, keyboard focus, compact metadata, overflow-safe explorer rows, and consistent scrollbar treatment.
- Refined the review draft into neutral blue-gray workflow surfaces rather than competing teal cards, while retaining its visual priority.
- Completed dark-mode coverage for status toasts, review-draft internals, and course reference cards; removed remaining light-surface fallthroughs.
- Tightened the responsive header offset and mobile toast placement so fixed navigation leaves less empty space without covering content.
- Kept one theme control per context: desktop sidebar summary on desktop, and the bottom of the opened compact Menu after its data on tablet and phone.
- Verification: run `npm run build`, then run `npm run typecheck`; review desktop, tablet, and phone layouts in both themes.

### 2026-07-20 - Theme Control Placement

- Removed the duplicate visible desktop theme button and moved the desktop toggle into the bottom sidebar archive/usage summary.
- Removed the navigation-menu theme action so the bottom archive and usage summary is the sole theme-control location on every viewport.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Dark Course Status Accent

- Restyled the course reconstruction, textbook, and syllabus status badges in dark mode with the same gold text, warm highlight, and inset accent used by the active navigation state.
- This differentiates course status at a glance without introducing a separate visual language.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Complete Dark Explorer and Study Cards

- Added final-cascade dark-mode surfaces for unselected Vault and Media Library rows, study-page archive/list surfaces, source-media entries, and extracted-concept cards.
- Used explicit dark precedence for components with fixed white defaults so both selected and unselected data remain readable without light flashes or white panels.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-18 - Persistent Dark Mode

- Added a persisted light/dark theme preference with accessible toggle controls in the desktop navigation rail and opened tablet/phone Menu.
- Dark mode updates the browser/PWA theme color and preserves explorer selection, review, status, capture, and KaTeX contrast instead of applying a simple color inversion.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-18 - Dark Archive Explorer Contrast

- Replaced the archive tree's default light gradient with dedicated dark explorer surfaces so folder labels, counts, and selection states remain readable in dark mode.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Complete Reconstruction Dark Surfaces

- Added dedicated dark-mode surfaces for the reconstruction details grid, class-record guidance, workflow steps, readiness badges, source drop zones, and action panels.
- Replaced their fixed light gradients with accessible dark equivalents while preserving source-state hierarchy and primary-action emphasis.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Vault Selection Dark Surface

- Added dark-mode styling for the Vault batch-selection toolbar and review-draft status indicator, removing the remaining light panel above the reconstruction explorer.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Explorer Row Dark Defaults

- Added dark defaults for unselected Vault and Media Library explorer rows, internal table dividers, sort headers, and the Media Library folder tree.
- This removes fixed light row backgrounds while preserving stronger selected and hover states.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-20 - Vault Full-Width Details Panel

- Moved the Vault selected-reconstruction inspector from its narrow right column to a full-width panel beneath the archive tree and reconstruction explorer.
- Removed the inspector's constrained sticky viewport so summaries and KaTeX equations have natural reading width and are not cut off.
- Kept the archive tree in normal document flow as well, preventing it from floating over the full-width details panel while scrolling.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-18 - Responsive Header Scroll Boundary

- Returned tablet/phone layouts to native browser document scrolling after the internal application scroll container prevented scrolling in mobile Chrome.
- Replaced unreliable responsive sticky positioning with a fixed app bar and a reserved workspace offset, keeping the complete header visible while preserving native document scrolling.
- The opened Menu acts as a controlled overlay below the fixed bar instead of changing page scroll geometry.
- Removed the previous mobile optical translation and balanced responsive app-bar padding so the logo, name, owner label, and Menu control are vertically centered.
- Verification: run `npm run build`, then run `npm run typecheck`.

### 2026-07-18 - Product-Wide Workbench Refinement

- Rebalanced the shared visual system around a cleaner workbench canvas, stronger surface hierarchy, and more deliberate spacing while retaining every existing workflow.
- Refined Dashboard metrics, headers, workflow cues, action panels, course rows, forms, capture disclosures, explorer lists, media/vault inspectors, review-draft surfaces, and pipeline states as one consistent system.
- Added responsive density rules so phones and tablets keep readable controls and compact study surfaces rather than inheriting desktop spacing.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-18 - Review Source KaTeX Preview

- Routed the selected reconstruction summary in Reviews through the existing KaTeX renderer used by Vault and Reconstruction Detail.
- Kept rendered source-preview equations compact and inline-safe so review selection remains a short, scannable work surface.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-18 - Responsive Header and Dashboard Polish

- Corrected compact-header vertical alignment so the vault mark, LectureVault text, owner label, and Menu control share a centerline on phones.
- Restored the responsive sidebar padding after the desktop visual overrides, removing the unused lower strip that made the compact header appear vertically off-center.
- Corrected compact-toolbar alignment structurally across tablet and phone breakpoints by centering the entire brand control in the dark header rather than offsetting its individual children.
- Applied a small shared responsive optical adjustment so the vault mark, brand copy, and Menu label are centered inside the outlined header control.
- Tightened the responsive dashboard rhythm with clearer title alignment, consistent metric heights, and more deliberate action-panel spacing.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-16 - Structured Reconstruction KaTeX Preview

- Replaced the flat reconstruction KaTeX preview with a structured Markdown-and-math reader that separates generated headings, labelled details, bullets, and numbered steps.
- Display equations remain isolated, while study sections receive readable spacing and hierarchy rather than becoming one continuous paragraph.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-16 - Reliable Class Record File Removal

- Replaced temporary browser `File` metadata as the class-record source identity with stable persistent source IDs.
- Eliminates duplicate attachments during cloud hydration and ensures removal and Clear Files update the shared class record, while original Supabase media remains intact in Media Library.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-15 - Persistent Detail Archive Tree

- Removed the redundant nested disclosure from Reconstruction Detail's Study Navigation so its Archive Tree stays expanded whenever the surrounding navigator is open.
- Selecting a folder on mobile still closes only the outer navigator, returning screen space to the selected reconstruction.
- Kept the responsive study navigator in normal page flow so it cannot slide underneath the variable-height mobile or tablet menu.
- Uses the same compact header/menu treatment for every narrow window, including Windows split-screen; archive and token summaries remain inside the opened menu rather than consuming header space.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-15 - Vault Selection and Study Flow

- Changed Vault reconstruction-row clicks to select and populate the Details pane rather than navigating away immediately.
- Added a separate `Study selected` action for checked Vault sources; multiple selections open as compact collapsed reconstruction summaries before focused reading.
- Retained the existing batch review action so study and review creation remain separate workflows.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-15 - Vault Review Multi-Select

- Added separate checkboxes to Vault reconstruction rows so selecting review sources does not navigate away from the archive.
- Added select-all, clear, and batch `Add selected to Review` controls for the visible folder, while retaining row clicks for opening a reconstruction's study view.
- Batch additions preserve the selected course context and the permanent source links used by each reconstruction.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Interface Polish Pass

- Refined hierarchy across the workspace with quieter panels, deliberate elevation, clearer section headers, consistent field feedback, and stronger primary/destructive action states.
- Improved explorer legibility with pinned column headers, cleaner active and hover states, and a more consistent folder-selection treatment.
- Tightened dashboard metrics, action panels, review surfaces, media controls, and mobile spacing while preserving all existing workflows and responsive behavior.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Reconstruction Study Explorer

- Added a folder-aware Archive Tree to Reconstruction Detail so saved class records are browsed by their actual Vault folder hierarchy; the adjacent list now follows the selected folder and its descendants.
- Retained search and title/date/length sorting within the selected folder, with direct opening for focused study.
- Made each Vault reconstruction row open its study view directly, renamed the inspector action to `Open study view`, and added a breadcrumb plus Back to Vault action that returns to the reconstruction's folder.
- Kept the full reconstruction artifact in the primary pane and its media/review inspector beside it on desktop; the explorer stacks above the record on narrow screens.
- Offset the sticky Reconstruction Detail explorer below the responsive header on tablet and phone layouts so its controls are never covered while reading a long reconstruction.
- Made the Reconstruction Detail Archive Tree a compact disclosure, closed by default; its header shows the active folder and item count, and it closes after selecting a folder on phones to preserve reading space.
- Collapsed the entire Reconstruction Detail study navigator across tablet and phone layouts. The compact header retains course/folder context; opening it temporarily exposes the tree, search, sorting, and folder contents, then selecting a folder or reconstruction restores reading space.
- Replaced native browser audio controls in Reconstruction Detail with an embedded play/pause and seek control, preventing Android's native media UI from floating over other content during scrolling.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Product-Wide Visual System Refinement

- Reworked the visual system around a calm neutral workspace, steel-blue primary controls, restrained amber emphasis, and a compact dark navigation rail.
- Replaced decorative sidebar dots with named navigation icons and refined active, hover, and focus states across primary navigation.
- Standardized panel density, form fields, action buttons, explorer lists, capture disclosures, review surfaces, metrics, and responsive spacing while preserving all existing workflows.
- Fixed responsive navigation collapse so a closed menu no longer retains drawer height or leaves an empty gap above workspace content on tablets and phones.
- Verification: run `npm run typecheck`, then run `npm run build` and inspect desktop and mobile layouts.

### 2026-07-14 - Compact Course Creation

- Replaced the vertically expanding Add Course form with a compact code/name/term grid.
- Moved the optional course study profile behind a collapsed disclosure and made the desktop Save Course control content-sized.
- Prevented the form from stretching to match the height of the adjacent course list.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Course Syllabus Reference

- Added a dedicated course-level syllabus PDF attachment, separate from textbooks and their AI indexing workflow.
- Syllabus PDFs upload directly to Supabase Storage, support replacement, opening, downloading, and removal from the course record while preserving original files in Media Library.
- Reworked course rows into a full-width course summary plus compact syllabus, textbook, archive, and icon-only delete actions, preventing actions from collapsing course names into a narrow column.
- Added a compact responsive syllabus reference row to each course, including attachment status in the course totals.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Review Set Destination Emphasis

- Replaced the teal-heavy accent system with a cooler professional blue across primary controls, focus states, selected rows, labels, and supporting status details.
- Gave the Review Set Draft a restrained light-blue workspace surface, distinct from neutral page panels without clashing with the app background.
- Kept its white editable controls, compact source organizer, and trash-can removal actions for a clear, space-efficient review workflow.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Compact Review Draft Removal

- Replaced the repeated Review Set Draft `Remove` text controls with labeled trash-can icon buttons, increasing space for reconstruction titles without sacrificing accessible control names.
- Added `lucide-react` as the shared icon source for this and future compact interface controls.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Bounded Review Draft Selection

- Replaced the pre-creation Review Set Draft's expanding source-card stack with a compact, scrollable selected-reconstructions list.
- The draft now keeps its name, date, next step, and creation actions visible while selected sources grow; each row retains the reconstruction title, date, and direct remove action.
- The selection list is capped on both desktop and mobile, with a persistent source count and list heading for quick scanning.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Scalable Review Set Draft

- Replaced the unbounded review-set source card list with a compact, internally scrollable Review Scope organizer grouped by lecture date.
- Added a pinned readiness summary above the organizer and a single contextual Selected Reconstruction inspector, removing the previous duplicate all-source detail list.
- Each source row now exposes transcript segments, concepts, and media counts at a glance; selecting a row reveals its attached media and archive actions without expanding the overall page.
- The source organizer remains bounded on mobile, while the selected-source inspector naturally follows it as an inline detail panel.
- Verification: run `npm run typecheck`, then run `npm run build`.

### 2026-07-14 - Professional Interface Polish

- Refined the shared visual language into a quieter, more professional workspace: neutral page surfaces, sharper radii, lighter elevation, solid control fills, and restrained hover feedback.
- Simplified the navigation rail by removing decorative lighting while preserving its high-contrast active state and warm brand mark.
- Reworked dashboard and review action panels around clear left-edge status accents instead of layered gradients, keeping the established capture and exam-prep hierarchy intact.
- Verification: run `npm run typecheck`, then run `npm run build`.

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

Lecture reconstruction AI and exam-review AI remain separate.

- Reconstruction AI: transcribes selected source audio, interprets selected visual/PDF/text context, retrieves relevant textbook excerpts, and creates one source-grounded class reconstruction.
- Review AI: aggregates selected saved reconstructions into a focused exam review through `/api/exam-review`.

The review route must not re-transcribe raw media. It uses saved reconstruction text, concepts, figures, citations, and user review instructions.

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

## Historical Change Log

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
- Lecture AI generation now uses the Supabase `match_textbook_chunks` RPC for semantic textbook retrieval when a course id is available. This was later strengthened with original-page visual verification in the 2026-07-21 entry above.
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

### 2026-07-23 - Reconstruction and Review Readiness Polish

- Added compact evidence coverage to the reconstruction build stage so users can confirm the number and kind of attached class-day sources, plus whether course textbooks are available, before AI runs.
- Added review coverage to the New Review draft, showing selected reconstructions, linked media, extracted concepts, and indexed course textbooks alongside a concise statement of the source-grounded inputs used for review generation.
- Updated embedded audio to prefer direct, time-limited Supabase Storage URLs for media with a stored object path. This preserves byte-range requests so browser controls can retrieve duration and seek; the authenticated media proxy remains the fallback.
- Improved player metadata handling and added a visible load failure message for audio that cannot be read.
- Increased dark-mode secondary text contrast across dashboard action descriptions, course metadata, explorer rows, media details, and review rows. Removed the low-contrast muted-blue treatment from supporting copy.

### 2026-07-23 - Coherent Dark Review Workspace

- Unified the dark-mode treatment for the full saved-review workflow: workflow steps, source readiness counters, the archive drop target, AI context field, generated-review reader, and review actions now use the same dark surface and readable text hierarchy.
- Removed fixed light gradients from nested review surfaces in dark mode so generated review content remains readable rather than switching abruptly between white and dark cards.
- Applied the same treatment to the selected-reconstruction inspector card and its attached-media list, eliminating the remaining white card from the saved-review workspace.

### 2026-07-23 - Wider Review Workspace

- Moved the selected-reconstruction inspector beneath the review File Explorer on desktop, converting the review builder to a two-column layout and giving the main review canvas substantially more reading and authoring width.
- Bounded the attached-media list in that inspector so large source bundles remain a compact, scrollable reference list instead of extending the page indefinitely.

### 2026-07-23 - Continuous New Review Sidebar

- Grouped Browse Archive and the Review Set Draft into one continuous left-hand stack on the New Review screen. The draft now follows the archive browser directly instead of being placed in an implicit grid row beneath the main reconstruction list.
- Retained the complete review-draft workflow while widening the central course-reconstruction workspace and removing unused vertical space.

### 2026-07-23 - System-Wide Workflow Confluence

- Applied a shared hierarchy to the workspace: dense explorers for selection, compact forms for setup, and quiet full-width panels for reading detail. Adjacent panels no longer stretch short forms to match longer lists.
- Reduced dashboard action-card height while retaining the persistent navigation model, so summary cards explain the workflow without competing with the sidebar/menu as duplicate navigation.
- Normalized New Review’s draft styling into the same neutral editor surface used elsewhere. Source counts, next action, and disabled post-creation actions remain available, but no longer read as separate competing panels.
- Performed a final dark-surface audit for review generation, saved-review lists, inspectors, and source previews to prevent light-mode white fills from leaking into the dark workspace.

### 2026-07-23 - Review Viewer Naming

- Renamed the existing-review workspace title from `Review set` to `Review Viewer`. `New Review` remains the only creation workflow; the viewer is for reading, exporting, and managing saved reviews.

### 2026-07-23 - Separate Review Building From Viewing

- Moved AI review construction into `New Review`. The draft now collects instructions alongside its selected reconstructions, and `Build Review` creates, generates, and saves the review before opening it.
- Made `Review Viewer` read-only for saved review content: it shows preserved source provenance, generation instructions, usage, figures, generated output, PDF export, GPT-package export, and deletion. It no longer accepts source changes, context edits, or AI generation.
- Removed the remaining saved-review source-removal path so source edits are confined to the new-review draft before a review is built.

### 2026-07-23 - Review Reading Density

- Enlarged the saved generated-review reading surface to use most of the available viewport height instead of the compact preview cap.
- Collapsed each review image into a compact `Fig. N` disclosure row. Opening a row reveals that source image once, its source lecture, and its filename.
- Left-aligned saved-source rows in Review Viewer so they scan as file-explorer entries rather than centered cards.

### 2026-07-23 - Review Viewer De-duplication

- Removed repeated saved-review totals for sources, transcripts, passages, concepts, and images from the main viewing pane. The source explorer and selected-source inspector remain the single places to inspect that provenance.
- Consolidated selected-source metadata into one compact line, leaving more visual priority for the generated review, figures, and exports.

### 2026-07-23 - Review Viewer Explorer

- Added a compact, scrollable saved-review list above Review Sources in Review Viewer. Selecting a review now switches the complete read-only workspace, including its source list, selected source inspector, instructions, generated review, figures, and exports.

### 2026-07-23 - Audio Seek Track

- Isolated embedded audio range controls from shared form-field padding and added explicit cross-browser track/thumb styling, so the seek thumb reaches both playback endpoints.

### 2026-07-23 - Past Review Drag Organization

- Made saved review rows draggable into Past Reviews folders or Unfiled. Folder moves only change the review's organizational placement, preserving its saved sources, generated content, and exports.

### 2026-07-24 - Conflict-Aware Supabase State Sync

- Replaced unconditional whole-state Supabase upserts with compare-and-swap writes using the existing `lecturevault_state.updated_at` value.
- A stale desktop, phone, or tablet write now receives the current cloud snapshot instead of overwriting it.
- The client performs a three-way merge across independent state collections, preserving local additions and remote additions when devices changed different records, then retries the merged snapshot against the latest timestamp.
- Existing deployments require no schema migration because the protocol uses the existing `id`, `data`, and `updated_at` columns. The deployed client must be refreshed after deployment so all devices send `expectedUpdatedAt`.
- Same-record concurrent edits still resolve in favor of the local device during reconciliation; the UI reports that a merge occurred so this limitation is visible.

## 2026-07-24 - Fixed Responsive App Bar and Dashboard Flow

- Fixed the narrow responsive shell so the LectureVault menu remains fixed to the viewport while the document scrolls naturally beneath it.
- Bounded the expanded menu with its own internal scroll, preventing the archive/usage summary from pushing the Dashboard far below the header or leaving a large blank region after the menu closes.
- Kept the workspace offset stable for phone, tablet, and narrow split-screen desktop layouts, while preserving the existing navigation and menu contents.

## 2026-07-24 - Fixed Desktop Sidebar Scroll Position

- Fixed the wide-screen sidebar to the viewport so navigation, archive counts, and usage status remain visible while the workspace scrolls.
- Preserved the existing reserved grid column and separate responsive drawer behavior for tablet, phone, and narrow split-screen layouts.

## 2026-07-24 - Corrected Sidebar Cascade Regression

- Moved the authoritative desktop and responsive sidebar rules to the end of the stylesheet so legacy media queries cannot override fixed positioning, width, or workspace placement.
- Restored the desktop grid relationship between the fixed sidebar and workspace while keeping narrow layouts as a fixed top drawer with natural page scrolling.

## 2026-07-24 - Tightened Mobile Dashboard Header

- Reworked the narrow Dashboard topbar into an explicit compact vertical grid: title, workflow steps, then actions.
- Reduced excess padding and forced Review Draft and Log out into a balanced two-column action row, preserving the complete workflow diagram without the large empty band.

## 2026-07-24 - Compacted Mobile Dashboard Content

- Reduced mobile Dashboard header, workflow, metric, action-panel, and recent-item spacing without removing any information or actions.
- Kept the workflow diagram and metric labels intact while lowering minimum heights, font sizes, and internal padding so more study content is visible per screen.

## 2026-07-24 - Compacted Tablet Dashboard Content

- Added a dedicated 761-1120px tablet layout that keeps the title and actions on one row, places the workflow beneath it, and reduces metric, action-panel, and recent-item height.
- Preserved the desktop two-column information architecture while removing tablet-scale vertical waste.

## 2026-07-24 - Centered Responsive App Bar Content

- Made the responsive brand row, menu control, navigation icons, labels, and active-state rows explicitly center-aligned within their controls.
- Preserved the gold active outline while removing inconsistent vertical alignment caused by competing responsive rules.

## 2026-07-24 - Centered Tablet App Bar Content

- Added a tablet-only responsive override for the expanded three-column navigation.
- Explicitly centered the tablet brand mark, brand text, menu control, icons, and navigation labels without changing the phone layout or active gold selection treatment.

## 2026-07-24 - Approved Ontoly Sharp Build

- Recorded the explicit approval for Ontoly's Sharp dependency build script in `pnpm-workspace.yaml` so local architecture analysis can complete without changing application runtime behavior.

## 2026-07-24 - Added Ontoly CLI For Audit Evidence

- Added `@0xsarwagya/ontoly-cli` as a development dependency so architecture, dependency, route, and coverage reports can be regenerated from this repository during product-quality audits.

## 2026-07-24 - Repaired Responsive Shell And Added UI Guardrails

- Fixed the narrow responsive shell retaining the desktop sidebar grid column after the sidebar becomes fixed, which was shifting and clipping every page below the desktop breakpoint.
- Added shared responsive guardrails for minimum-width handling, text wrapping, media bounds, math overflow, toast containment, and narrow-workspace sizing.
- Standardized dark-mode active selections to use the gold selection treatment consistently while retaining blue for supporting actions.

## Known Limitations

- Lecture media uses direct browser-to-Supabase signed uploads. The reconstruction server still downloads source objects to create AI requests, so unusually large source bundles can take longer to process.
- Supabase sync still stores the whole app state as one JSON row, but writes are now guarded by `updated_at` compare-and-swap and independent collection records are three-way merged on conflicts.
- Browser `localStorage` remains a fallback/cache and can diverge if Supabase is unavailable.
- Existing media records that only contain metadata cannot recover original image pixels. Users must re-upload those images after the image embedding fix.
- PDF image embedding uses stored image data returned by review generation when available; existing metadata-only image records still cannot render pixels.
- Browserless is required for PDF output in deployed environments.
- The app is currently a single-owner password-protected workspace, not a multi-user product with separate user accounts and authorization policies.
- The AI output should be source-audited for senior-level engineering/math accuracy.

## Verification Checklist

After code changes:

```bash
npm run typecheck
npm run build
```

For workflow changes, manually verify:

1. Open `New Review`.
2. Select archive materials and confirm source coverage counts update.
3. Name the review, set an exam date, and add AI instructions.
4. Use `Build Review` and confirm token usage appears when OpenAI is used.
5. Confirm the saved read-only `Review Viewer` opens with source provenance and generated output.
6. Download Review PDF.
7. Confirm PDF text size, equations, source map, and figure appendix.
8. Confirm embedded images render when image data exists.

For archive organization changes, manually verify:

1. Open the archive.
2. Add a folder.
3. Add a subfolder.
4. Drag a lecture card into a folder.
5. Select parent and child folders and confirm contents update.
6. Rename a folder.
7. Delete a folder and confirm lectures remain archived.

## Next Priorities

- The New Review course reconstruction selector uses a compact phone-specific list treatment: mobile hides desktop table headers/source-size, retains title/date, and preserves the existing sort and selection behavior.

- Add resilient background or resumable indexing for exceptionally large scanned textbooks if production uploads approach the hosting runtime limit; retain the current single-upload, no-manual-step workflow.
- Replace single-row Supabase JSON state with relational tables and conflict-aware sync if multi-user editing becomes important.
- Add explicit image upload/re-upload controls for archive items.
- Add formula audit or uncertainty section for advanced engineering/math courses.
- Add project-level test coverage for API routes and PDF HTML generation.
## 2026-07-24 - Reference-Safe Media Deletion

- Added a server-side guard to `app/api/media/objects/route.ts` so Media Library deletion checks the canonical Supabase state before removing storage objects.
- Files referenced by lectures, textbooks, syllabi, reconstruction drafts, or other saved records now return a clear `409` response instead of being deleted and leaving broken links.
- Updated the Media Library confirmation copy to explain the protection behavior.
- Verification: `npm run typecheck`, `npm run build`, and production deployment completed after this change.

## 2026-07-24 - Decouple Session Signing from OpenAI Credentials

- Ontoly graph hash `15jhjcc` identified `app/api/exam-review/pdf/route.ts -> lib/auth.ts -> signingSecret()` as the longest authentication path.
- Removed the `OPENAI_API_KEY` fallback from `lib/auth.ts`. Session cookies now use `LECTUREVAULT_AUTH_SECRET`, `NEXTAUTH_SECRET`, or the existing app password fallback, in that order.
- This prevents an OpenAI provider credential from becoming the session-signing key while keeping existing deployments functional without an immediate environment-variable migration.
- Production should set a dedicated high-entropy `LECTUREVAULT_AUTH_SECRET`; changing from the old OpenAI fallback may require users to sign in again.
- Verification: Ontoly coverage/stats/architecture/dependency reports, `npm run typecheck`, `npm run build`, and production deployment completed after this change.

## 2026-07-24 - Isolate Conflict Merge Policy

- Ontoly graph hash `15jhjcc` identified `app/page.tsx` as the highest-degree module with 134 relationships.
- Moved the three-way collection merge algorithm into `lib/state-sync.ts`; the Supabase conflict behavior is unchanged, but synchronization policy is now independently testable and easier to audit.
- `app/page.tsx` retains only the state collection list and normalization boundary.
- Verification: Ontoly stats/impact/trace queries and `npm run typecheck` completed after this change.

## 2026-07-24 - Remove Ambiguous Supabase Service-Key Fallback

- Ontoly graph hash `1u3o3sb` identified `lib/supabase-server.ts` as the shared server boundary for Supabase credentials, while its configuration scan showed both `SUPABASE_SERVICE_ROLE_KEY` and the undocumented `SUPABASE_SERVICE_KEY` being accepted.
- Removed the legacy `SUPABASE_SERVICE_KEY` fallback. Server access now requires the documented `SUPABASE_SERVICE_ROLE_KEY`, preventing a stale or misnamed secret from being selected silently.
- No Vercel configuration change is required because Production and Preview already use `SUPABASE_SERVICE_ROLE_KEY`.
- Verification: Ontoly coverage/stats/architecture/configuration queries completed before the change; typecheck and production build completed after the change.
## 2026-07-24 - Product-quality responsive UI pass

- Audited the shared shell and responsive cascade with Ontoly graph `1u3o3sb`; the UI is concentrated in `app/page.tsx` and `app/styles.css`, so the lowest-risk improvement was a final shared stylesheet layer rather than screen-specific rewrites.
- Added width-safe behavior for shared controls, grids, explorer rows, long study text, audio players, range controls, and status toasts across desktop, split-screen, tablet, and phone widths.
- Added a coherent dark-mode surface layer for review viewers, explorers, source inspectors, course cards, media cards, generated review content, transcript/math panels, and form controls to prevent late light-theme rules from producing white islands or low-contrast copy.
- Kept all routes, state behavior, Supabase links, AI workflows, media references, and existing feature controls unchanged.
## 2026-07-24 - Unified Selection Highlight Across Explorers

- Added a final shared selection contract so Vault, Media Library, Reviews, Past Reviews, study navigation, and folder explorers use one gold active/selected treatment instead of mixing gold borders with teal-blue selected backgrounds.
- Kept blue available for actions, links, and hover feedback; dark-mode selected text and checkbox accents now remain readable against the gold-tinted selection surface.

## 2026-07-24 - Keep Mobile Media Explorer Metadata In Row

- Locked compact Media Library rows to explicit filename, date, and size grid columns at narrow widths.
- Prevented the generic mobile storage-card rules from moving the checkbox, date, or file size into separate implicit rows, which caused metadata to appear detached at the bottom of the list.
- Kept the explorer horizontally contained with ellipsis-safe date and size cells.
- Applied the placement guard through the tablet breakpoint as well; device pixel width can be narrower than its CSS viewport, so phone-only breakpoints were insufficient.
- Named the explorer filename, date, and size cells and added a final explicit placement contract so generic storage-card rules cannot detach metadata into implicit rows.

## 2026-07-24 - Consolidate Responsive Shell And Dark Explorer States

- Added one final responsive shell contract to override conflicting historical media-query layers: desktop keeps the sidebar fixed beside the workspace, while tablet and phone keep the app bar fixed without disabling page scrolling or covering the workspace.
- Standardized dark explorer rows and metadata cells so filenames, dates, sizes, and selected states remain readable across Vault, Media Library, Reviews, Past Reviews, and study navigation.
- Prevented hover rules from replacing the gold active/selected treatment with competing teal or blue surfaces.
- Kept this change at the shared CSS layer; routes, Supabase state, media links, AI workflows, and stored data contracts are unchanged.

## 2026-07-28 - Make Concurrent Archive Deletions Non-Resurrecting

- Hardened `lib/state-sync.ts`, the shared three-way merge boundary used when Supabase compare-and-swap reports a concurrent update.
- Collection comparisons now use stable object-key ordering, avoiding false conflicts caused only by JSON property order.
- When both devices changed the same record and one side deleted it, the deletion now wins instead of falling back to the other device's stale record. This prevents deleted lectures, media references, folders, courses, or reviews from unexpectedly reappearing after a cross-device conflict.
- Concurrent edit/edit conflicts retain the existing local-preference behavior; unrelated additions and changes still merge by record ID.
- Verification: Ontoly coverage/stats/architecture re-check, production build, typecheck, and `git diff --check` passed. Commit, push, and production deployment follow this note update.

## 2026-07-28 - Prevent Stale Cloud Save Responses

- Hardened the client Supabase synchronization effects in `app/page.tsx` after reviewing the current whole-state compare-and-swap flow.
- Debounced writes now distinguish queued saves from in-flight requests and use a generation guard, so a cancelled or older request cannot overwrite the current cloud revision, merged state, or user-facing status after a newer edit.
- Background polling now pauses while either a save is queued or any save request is in flight, preventing an intermediate remote snapshot from replacing local changes during the save window.
- Exported and reused `stableSerialize` from `lib/state-sync.ts` for client state comparisons, eliminating false pull updates caused only by object-key ordering.
- The underlying single-row JSON state and CAS API remain unchanged; this reduces client-side race risk without requiring a schema migration.
- Verification: the client race fix was verified with Ontoly coverage/stats/architecture, typecheck, production build, and `git diff --check`. Commit, push, and production deployment completed.

## 2026-07-28 - Send Collection-Scoped Cloud Patches

- Ontoly graph `1lefn2z` confirmed that `app/page.tsx` remains the highest-degree module and that `/api/vault-state` is the shared persistence boundary.
- Added a backward-compatible `patch` payload to `/api/vault-state`. It accepts only known VaultState collection arrays and merges them into the current row under the existing compare-and-swap timestamp, so one device no longer replaces unrelated collections changed by another device.
- The client now compares local state with its last cloud baseline and sends only changed collections. Existing full `state` payloads remain supported for compatibility and the database schema is unchanged.
- This reduces the blast radius of concurrent course, lecture, media, folder, textbook, reconstruction, and review edits while retaining the existing conflict merge behavior.
- Verification: Ontoly coverage/stats/architecture re-check, `npm run build`, `npm run typecheck`, and `git diff --check` passed. Commit `eeca04a` was pushed to `main`, and the production deployment completed successfully.

## 2026-07-28 - Make Legacy State Writes Collection-Safe

- Kept backward compatibility for older open/PWA clients that still send a full `state` payload to `/api/vault-state`, but stopped treating that payload as a wholesale replacement.
- When a legacy request includes `expectedUpdatedAt`, the API now compares the known collection arrays against the current server row, derives a collection-scoped patch, and merges only those changed collections under the existing compare-and-swap check.
- This preserves unrelated changes made on another device and makes the compatibility path follow the same collection-level safety contract as the current client.
- Verification: Ontoly route/dependency reports, `git diff --check`, `npm run typecheck`, and `npm run build` completed. Commit `7b6d10b` was pushed to `main`; Vercel production deployment `dpl_DnJHPA8oaT3mb4xEtzXvyKhb4bYL` is ready and aliased to `https://l3cturevault.vercel.app`.

## 2026-07-28 - Harden State Request Parsing

- Reused the canonical stable serializer in the legacy full-state compatibility path, so object-key ordering cannot create false collection changes during a cross-device save.
- `/api/vault-state` now rejects malformed JSON and non-object request bodies with a clear `400` response instead of allowing parsing failures to become an opaque server error.
- The state schema, compare-and-swap behavior, collection patch contract, and client workflow are unchanged.
- Verification: Ontoly coverage/stats/architecture reports, `git diff --check`, `npm run typecheck`, and `npm run build` completed; production deployment and endpoint checks follow this note update.

## 2026-07-28 - Preserve Edits During Initial Cloud Load

- Hardened the initial Supabase load in `app/page.tsx` against a cross-device startup race.
- If a user changes the local archive while the first cloud-state request is still in flight, the returned remote snapshot is now three-way merged with those local edits instead of replacing them.
- Unchanged local startup state still adopts the remote snapshot directly, while merged local edits remain eligible for the normal collection-scoped save path.
- The storage schema, media links, AI workflows, and existing conflict behavior are unchanged.
- Verification: Ontoly coverage/stats/dependency reports, `git diff --check`, typecheck, production build, commit/push, and Vercel deployment follow this note update.
## 2026-07-28 - Constrain Legacy State Payloads

- Hardened `app/api/vault-state/route.ts` so legacy full-state requests are sanitized to the same known collection keys as patch requests before either insert or update.
- This prevents arbitrary top-level payload fields from entering the shared Supabase state row on the initial legacy insert path, reducing schema drift and accidental persistence of unsupported data.
- Added validation for `expectedUpdatedAt`; malformed or empty optimistic-concurrency timestamps now receive a clear `400` response instead of reaching the database filter.
- The route still accepts the existing full-state client contract, but stores only supported collection arrays. Patch-based writes remain the preferred path.

## 2026-07-28 - Harden Media Request Parsing

- Hardened `app/api/media/signed-upload/route.ts` so malformed JSON, non-object payloads, and non-string upload identifiers return clear `400` responses or safe defaults instead of causing runtime exceptions.
- Hardened `app/api/media/objects/route.ts` deletion parsing so malformed JSON is rejected explicitly before reference checks or Storage operations run.
- Upload behavior, Supabase paths, signed URLs, and reference-protected deletion behavior are unchanged for valid requests.
- Verification also covers strict TypeScript narrowing for filtered deletion paths.

## 2026-07-28 - Constrain Media Read Bucket Access

- Ontoly impact analysis identified `lib/supabase-server.ts` as a shared boundary for all media and document routes. The media read and signed-read endpoints now enforce the configured `SUPABASE_MEDIA_BUCKET` instead of accepting arbitrary bucket names from authenticated requests.
- Signed-read requests now reject malformed JSON and non-object payloads with clear `400` responses, and invalid individual objects are ignored safely.
- Valid media links, signed URL paths, authentication, and the existing seven-day URL lifetime are unchanged.

## 2026-07-28 - Constrain Shared Storage Helper Access

- Ontoly impact analysis showed that `lib/supabase-server.ts` is also called directly by AI and PDF-generation routes, bypassing the HTTP media read guards.
- The shared data URL, signed URL, and buffer helpers now accept only the configured `SUPABASE_MEDIA_BUCKET`; an unexpected client-provided bucket returns no object instead of allowing a service-role read from another bucket.
  - Existing media paths, default bucket behavior, signed links, figures, audio references, and PDF workflows remain unchanged for valid LectureVault media records.

## 2026-07-28 - Prevent Silent Media Overwrites

- Ontoly/source inspection showed that both direct signed uploads and the legacy server-routed upload accepted client-derived paths with `upsert: true`.
- Uploads now use create-only semantics, so a path collision fails explicitly instead of replacing an existing audio, image, PDF, syllabus, or textbook object that may still be referenced by archived records.
- Existing callers already generate fresh media, syllabus, and textbook IDs for each new upload; normal uploads and cross-device references are unchanged.

## 2026-07-28 - Normalize Dark Explorer Surfaces

- Added a final shared dark-mode contract for Vault, Media Library, Reviews, Past Reviews, and reconstruction explorer headers and rows.
- Explorer metadata, sort controls, review lists, and hover states now use consistent readable dark surfaces and light text while preserving gold active selections.
- No routes, persistence behavior, media links, AI workflows, or archive data contracts changed.
- Verification: Ontoly coverage/stats/dependency inspection, typecheck, production build, and `git diff --check` completed after this CSS-only change.

## 2026-07-28 - Keep Status Toasts Inside Responsive Gutters

- Added a final shared toast geometry contract so transient status messages remain fully visible instead of clipping at the viewport edge.
- Desktop toasts center within the workspace column beside the fixed sidebar; tablet and phone toasts use safe-area-aware gutters and no horizontal transform.
- Toast timing, messages, persistence, navigation, and API behavior are unchanged.

## 2026-07-28 - Keep Narrow Explorer Rows Readable

- Added a final shared narrow-screen contract for Vault, Media Library, Reviews, Past Reviews, and study navigation explorers.
- Explorer lists now suppress horizontal spill, constrain every cell to its panel, and apply predictable ellipsis to long names and metadata without removing date or size information.
- No archive selection, sorting, drag-and-drop, folder, media, review, or persistence behavior changed.

## 2026-08-16 - Harden Textbook Indexing and Defer Unbounded Vision Work

- Hardened `app/page.tsx` textbook upload, reindex, and delete calls so HTML/proxy failures are handled as actionable errors instead of throwing `Unexpected token '<'` while parsing JSON.
- Hardened `app/api/textbook/extract/route.ts` so native PDF extraction, page evidence, and embeddings remain the default upload path, while upload-time vision indexing is opt-in through `OPENAI_TEXTBOOK_VISUAL_INDEX_PAGE_LIMIT` and capped at 64 pages.
- Math-heavy and sparse pages remain flagged as requiring visual verification. Their original page PDFs are still available to the reconstruction and review retrieval flows for targeted, on-demand vision analysis, preserving math accuracy without forcing a full textbook vision scan during every upload.
- Existing textbook storage paths, embeddings, page citations, AI retrieval, and cross-device state contracts are unchanged for valid requests.
- The deferred-page count is persisted with the course textbook metadata so the UI can distinguish pages already visually indexed from pages intentionally reserved for targeted retrieval.
- Upload and course views now expose that deferred visual-page count, so users can tell that math/visual pages are available for targeted reconstruction or review analysis rather than silently omitted.
- Verification: Ontoly review, `git diff --check`, typecheck, production build, commit/push, and Vercel deployment follow this note update.
## 2026-08-16 Textbook PDF parser runtime compatibility

- Added `@napi-rs/canvas` as a production dependency so `pdfjs-dist`, used by `pdf-parse`, can provide the canvas globals expected by the Node/Vercel runtime (`DOMMatrix`, `ImageData`, and `Path2D`).
- This fixes textbook indexing failures that occurred before the extraction handler could run, where Vercel returned an HTTP 500 during PDF parsing.
- The lockfile was regenerated so the existing Ontoly development dependency and the new native parser dependency are represented consistently.
- The pnpm lockfile is also synchronized because Vercel uses frozen pnpm installs during production builds.

## 2026-08-17 - Keep native canvas out of Vercel webpack

- The first canvas-global fix still let webpack traverse `@napi-rs/canvas` and fail while parsing its platform-specific `.node` binary.
- The extractor now uses a webpack-ignored runtime import; `serverExternalPackages` continues to make the native package available to the Node runtime while keeping the production bundle portable.
- Verification: typecheck and production build pass locally after the import change.

## 2026-08-17 - Pass Uint8Array to PDF.js

- Updated textbook extraction to pass the downloaded PDF bytes directly as a `Uint8Array` instead of wrapping them in Node's `Buffer`.
- This resolves PDF.js runtime validation failures (`Please provide binary data as Uint8Array, rather than Buffer`) after successful large-file uploads.
- Verification: typecheck and production build pass locally.

## 2026-08-17 - Normalize Supabase downloads before extraction

- Supabase Storage returns downloaded files as Node `Buffer` instances through the server helper. The extraction route now converts those bytes at the storage boundary and reuses the normalized `Uint8Array` for PDF.js and visual-page PDF loading.
- This closes the remaining runtime path that could reintroduce the Buffer validation error after a successful upload.

## 2026-08-17 - Disable PDF.js workers in Node extraction

- Disabled PDF.js workers for the server-side extractor. Vercel functions do not ship a browser worker module, so worker startup produced a fake-worker module-resolution error before page extraction.
- Sequential in-process parsing remains the memory-safe path for large textbooks.

## 2026-08-17 - Include PDF.js worker in Vercel tracing

- The runtime still attempted fake-worker fallback because the external PDF.js package's `pdf.worker.mjs` was absent from the traced function output.
- The extractor now points PDF.js at its package worker and Next.js explicitly includes that worker in the textbook route's output tracing. This preserves the large-file Node runtime while resolving worker module loading on Vercel.
- Verification: typecheck and production build pass locally.

## 2026-08-17 - Bundle PDF.js worker with textbook function

- Externalizing `pdfjs-dist` left its worker module out of Vercel's pnpm-traced function package, causing repeated fake-worker resolution failures.
- PDF.js is now bundled by Next.js while only native `@napi-rs/canvas` remains external, so the worker module ships with the extraction function.

## 2026-08-17 - Use pdf-parse's embedded worker for extraction

- Replaced the direct PDF.js worker setup with `pdf-parse` v2's `PDFParse` API. Its Node build embeds the PDF.js worker as a data URL, eliminating both Vercel package-resolution failures and pnpm symlink tracing issues.
- Page-wise text results and the existing downstream chunk/evidence/indexing contracts are preserved.

## 2026-08-17 - Register canvas globals for embedded PDF parsing

- Registered `DOMMatrix`, `ImageData`, and `Path2D` from the external native canvas package before `pdf-parse` initializes PDF.js.
- The native import remains webpack-ignored and server-external, preventing `.node` bundling while satisfying PDF.js's Node runtime globals.

## 2026-08-17 - Set pdf-parse's embedded worker data explicitly

- Configured `PDFParse` with the worker data URL provided by `pdf-parse/worker`, rather than allowing PDF.js to fall back to a relative `pdf.worker.mjs` import inside a generated Vercel chunk.
- `pdf-parse` is externalized alongside the native canvas package so its worker helper and embedded data remain available at runtime.

## 2026-08-17 - Make reconstructions visually intuitive and technically complete

- Reconstruction requests now attach up to eight retrieved original textbook pages, prioritizing pages flagged for visual verification while also including clear pages when their diagrams, plots, layout, or worked notation can improve intuition.
- Updated the lecture-generation instructions to inspect supplied whiteboard images and textbook pages, preserve source-supported technical complexity, explain the intuition before formal derivations, and cite/label visuals selectively only when they materially support the explanation.
- Verification: typecheck and production build pass locally.

## 2026-08-17 - Embed cited textbook visuals in reconstruction view

- Added an inline textbook-visual section beneath the rendered reconstruction. Each cited page can be expanded in an embedded PDF viewer at the cited page number, making pole-zero plots and other diagrams visible beside the LaTeX explanation instead of only appearing as a text citation.
- Added targeted generation guidance for pole-zero, stability, frequency-response, transfer-function, and realization topics so the model actively uses relevant supplied diagrams and explains their geometric meaning.
- Verification: typecheck and production build pass locally.
