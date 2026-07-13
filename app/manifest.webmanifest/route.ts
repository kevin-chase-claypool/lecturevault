const manifest = {
  name: "LectureVault",
  short_name: "LectureVault",
  id: "/",
  description: "Build source-grounded class reconstructions and exam reviews.",
  start_url: "/",
  display: "standalone",
  background_color: "#edf3f8",
  theme_color: "#132334",
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable"
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable"
    },
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable"
    }
  ],
  share_target: {
    action: "/share-target",
    method: "POST",
    enctype: "multipart/form-data",
    params: {
      files: [
        {
          name: "lecturevault_files",
          accept: ["application/pdf", "image/*", "audio/*"]
        }
      ]
    }
  }
};

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": "application/manifest+json; charset=utf-8"
    }
  });
}
