import { NextResponse } from "next/server";

export async function GET() {
  const currentWebVersion = process.env.NEXT_PUBLIC_WEB_VERSION ?? "2026.02.20.1";
  const minSupportedWebVersion = process.env.MIN_SUPPORTED_WEB_VERSION ?? currentWebVersion;

  return NextResponse.json({
    currentWebVersion,
    minSupportedWebVersion,
    updateBoundary: {
      activateOn: ["app_background", "home_navigation", "cold_start"],
    },
  });
}
