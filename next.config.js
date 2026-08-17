/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The textbook extractor uses pdf2json's self-contained Node parser. Keep it
  // external so Vercel traces the complete parser without a browser worker.
  serverExternalPackages: ["pdf2json"]
};

module.exports = nextConfig;
