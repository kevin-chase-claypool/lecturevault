# LectureVault

LectureVault is a transcription-first lecture vault and exam review builder. It keeps courses, lecture/media records, transcripts, extracted concepts, exam baskets, basket items, and study guides in browser local storage.

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

## Notes

This MVP is local-first and stores structured data in `localStorage`. Small selected media files are stored as data URLs for preview. Larger files are represented by metadata so the UI remains responsive. Lecture-level audio transcription is still a future backend step; current capture saves attached audio and any pasted transcript or notes into the vault.
