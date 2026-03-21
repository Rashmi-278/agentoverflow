/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Required for Netlify SSR — the plugin reads from .next/standalone
  output: "standalone",
};
module.exports = nextConfig;
