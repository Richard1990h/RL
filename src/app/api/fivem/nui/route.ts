import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getResourcesPath, workspaceExists } from "@/lib/fivem/workspace";
import fs from "fs";
import path from "path";

const RESOURCES_DIR_FALLBACK = "C:\\Users\\Richard\\Desktop\\Five M server\\txData\\FiveMBasicServerCFXDefault_90B233.base\\resources\\[hk]";

interface NuiResource {
  name: string;
  uiPage: string;
  openMessages: string[];
}

function parseFxManifest(content: string): string | null {
  // Match ui_page 'path' or ui_page "path"
  const m = content.match(/ui_page\s+['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function detectOpenMessages(jsContent: string): string[] {
  const messages: string[] = [];
  // Look for addEventListener("message") handlers that check event.data.type or event.data.action
  const typeMatches = jsContent.matchAll(/(?:event|e|ev|msg)\.data\.(?:type|action)\s*===?\s*['"]([^'"]+)['"]/g);
  for (const m of typeMatches) {
    if (m[1] && !messages.includes(m[1])) {
      messages.push(m[1]);
    }
  }
  // Also look for case "something": patterns in switch statements
  const caseMatches = jsContent.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g);
  for (const m of caseMatches) {
    if (m[1] && !messages.includes(m[1])) {
      messages.push(m[1]);
    }
  }
  return messages;
}

// GET — list all [hk] resources that have a ui_page
// Accepts optional ?slug= param for per-server workspace, falls back to local path
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const slug = request.nextUrl.searchParams.get("slug");
    const RESOURCES_DIR = slug && workspaceExists(slug)
      ? getResourcesPath(slug)
      : RESOURCES_DIR_FALLBACK;

    if (!fs.existsSync(RESOURCES_DIR)) {
      return NextResponse.json({ error: "Resources directory not found" }, { status: 404 });
    }

    const entries = fs.readdirSync(RESOURCES_DIR, { withFileTypes: true });
    const resources: NuiResource[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(RESOURCES_DIR, entry.name, "fxmanifest.lua");
      if (!fs.existsSync(manifestPath)) continue;

      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const uiPage = parseFxManifest(manifestContent);
      if (!uiPage) continue;

      // Scan JS files in html/ directory for open message formats
      let openMessages: string[] = [];
      const htmlDir = path.join(RESOURCES_DIR, entry.name, "html");
      if (fs.existsSync(htmlDir)) {
        const jsFiles = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".js"));
        for (const jsFile of jsFiles) {
          try {
            const jsContent = fs.readFileSync(path.join(htmlDir, jsFile), "utf-8");
            openMessages = openMessages.concat(detectOpenMessages(jsContent));
          } catch {}
        }
      }

      resources.push({
        name: entry.name,
        uiPage,
        openMessages: [...new Set(openMessages)],
      });
    }

    resources.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ resources });
  } catch (error) {
    console.error("GET /api/fivem/nui error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
