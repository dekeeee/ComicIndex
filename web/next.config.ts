import type { NextConfig } from "next";

// Static export only: the site is served from Cloudflare Pages with no server runtime.
// SSR / ISR / Route Handlers / Server Actions are intentionally unavailable.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
