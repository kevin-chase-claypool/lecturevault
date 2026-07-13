import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "LectureVault",
  description:
    "A transcription-first lecture archive with exam baskets and AI review PDFs.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#132334"
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
