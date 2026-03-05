/**
 * Extract FiveM resource names from Claude's response text.
 *
 * Pass 1 — explicit `RESOURCES: res1, res2` line
 * Pass 2 — fallback: scan file paths like `resources/[category]/NAME/`
 */
export function parseResources(text: string): string[] {
  const found = new Set<string>();

  // Pass 1: explicit RESOURCES line
  const explicitMatch = text.match(/^RESOURCES:\s*(.+)$/im);
  if (explicitMatch) {
    const names = explicitMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of names) {
      // Only allow reasonable resource names (alphanumeric, hyphens, underscores)
      if (/^[\w-]+$/.test(n)) {
        found.add(n);
      }
    }
  }

  // Pass 2: fallback path regex — resources/[anything]/NAME/
  if (found.size === 0) {
    const pathRegex = /resources\/\[[^\]]+\]\/([\w-]+)\//g;
    let m: RegExpExecArray | null;
    while ((m = pathRegex.exec(text)) !== null) {
      found.add(m[1]);
    }
  }

  return Array.from(found);
}
