# LectureVault

LectureVault is a new, separate MVP app for a transcription-first lecture archive. It keeps courses, lecture/media records, transcripts, extracted concepts, exam workspaces, workspace items, and study guides in browser local storage.

## MVP Screens

- Dashboard
- Course list
- Lecture/media archive
- Lecture detail page
- Upload/record lecture page
- Exam workspace list
- Exam workspace detail page
- Study guide preview page

## Core Behavior

- Capture lecture audio, video, whiteboard images, PDFs, or rough transcript text.
- Save every capture to the permanent archive first.
- Build exam workspaces such as Exam 1, Quiz 1, or Final.
- Add archive lectures into exam workspaces by button or drag/drop.
- Generate a study guide from only the lectures selected in that exam workspace.
- Delete an exam workspace without deleting original archive media or transcripts.
- Link generated study material back to lecture titles, transcript timestamp segments, and media records.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Next.js.

## Notes

This MVP is local-first and stores structured data in `localStorage`. Small selected media files are stored as data URLs for preview. Larger files are represented by metadata so the UI remains responsive.
