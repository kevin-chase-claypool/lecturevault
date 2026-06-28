import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "LectureVault",
  description:
    "A transcription-first lecture archive with exam study workspaces."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
