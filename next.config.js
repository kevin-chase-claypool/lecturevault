/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Keep PDF.js packages intact in the serverless function. PDF.js resolves its
  // worker relative to its own module, which does not work after Next bundles
  // only the loader into a generated server chunk.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/textbook/extract": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/**"
    ]
  }
};

module.exports = nextConfig;
