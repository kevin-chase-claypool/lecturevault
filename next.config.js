/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Keep PDF.js external so Vercel traces its complete Node runtime while the
  // extractor processes textbook pages sequentially without a browser worker.
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"]
};

module.exports = nextConfig;
