/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Keep PDF.js external so Vercel traces its complete Node runtime while the
  // extractor processes textbook pages sequentially without a browser worker.
  // Keep only the native canvas package external. Bundling pdfjs-dist ensures
  // its worker module is present in the Vercel function instead of being lost
  // from pnpm's external package trace.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"]
};

module.exports = nextConfig;
