/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Uploaded documents and processed artifacts must NEVER be served statically.
  // They live under data/ (outside public/). Nothing in app/public is sensitive.
  experimental: {
    // Native/worker-based packages must stay unbundled on the server:
    // pdf-parse reads files at runtime, bcryptjs loads native-ish crypto,
    // tesseract.js spawns worker threads + WASM, sharp ships native binaries.
    serverComponentsExternalPackages: ['pdf-parse', 'bcryptjs', 'tesseract.js', 'sharp'],
  },
};

export default nextConfig;