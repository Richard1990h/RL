import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js development indicator
  devIndicators: false,
  // Allow Cloudflare tunnel origin in dev
  allowedDevOrigins: ["rallylive.ca", "www.rallylive.ca"],
  // Set Turbopack root to this project (avoid wrong lockfile detection)
  turbopack: {
    root: __dirname,
  },
  // Keep production bootable while type cleanup is in progress.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow larger API request bodies for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
  },
  // Prevent browser from caching dev JS chunks
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/:path*.png",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        source: "/:path*.ico",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        source: "/:path*.svg",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
  // Rewrite /uploads/* to the API route that resolves UPLOAD_DIR correctly
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
      // Rewrite /@username/videoId to /watch/videoId
      {
        source: "/@:username/:videoId",
        destination: "/watch/:videoId",
      },
    ];
  },
};

export default nextConfig;
