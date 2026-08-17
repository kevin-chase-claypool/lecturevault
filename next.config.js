/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["@napi-rs/canvas"]
};

module.exports = nextConfig;
