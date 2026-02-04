import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js development indicator
  devIndicators: false,
  // Fix Turbopack root directory
  turbopack: {
    root: ".",
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
