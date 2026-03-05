"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  File,
  Filter,
  Folder,
  FolderOpen,
  Lightbulb,
  MessageCircle,
  MessageSquarePlus,
  RotateCcw,
  Search,
  Send,
  Shield,
  SortAsc,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";

/* ── Follow-up parser ─────────────────────────────────────── */
const FOLLOWUP_RE = /\n?\n?--- Player Follow-up \(([^)]+)\) ---\n/;

function parseFollowups(text: string): { original: string; followups: { timestamp: string; text: string }[] } {
  const parts = text.split(FOLLOWUP_RE);
  const original = parts[0];
  const followups: { timestamp: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    followups.push({ timestamp: parts[i], text: (parts[i + 1] || "").trim() });
  }
  return { original, followups };
}

function hasFollowups(text: string | null | undefined): boolean {
  return !!text && text.includes("--- Player Follow-up");
}

function hasUnreadFollowups(text: string | null | undefined, lastAiProcessedAt: string | null | undefined): boolean {
  if (!text || !text.includes("--- Player Follow-up")) return false;
  const { followups } = parseFollowups(text);
  if (followups.length === 0) return false;
  if (!lastAiProcessedAt) return true; // never processed → all unread
  const aiTime = new Date(lastAiProcessedAt).getTime();
  return followups.some(f => {
    const followupTime = new Date(f.timestamp.replace(" ", "T") + ":00Z").getTime();
    return followupTime > aiTime;
  });
}

function DescriptionWithFollowups({ text, label, lastAiProcessedAt }: { text: string; label: string; lastAiProcessedAt?: string | null }) {
  const { original, followups } = parseFollowups(text);
  const aiTime = lastAiProcessedAt ? new Date(lastAiProcessedAt).getTime() : 0;
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{original}</p>
      {followups.map((f, i) => {
        const followupTime = new Date(f.timestamp.replace(" ", "T") + ":00Z").getTime();
        const aiRead = aiTime > 0 && followupTime <= aiTime;
        return (
          <div key={i} className={`mt-3 rounded-lg border p-3 ${aiRead ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="mb-1 flex items-center gap-1.5">
              {aiRead ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400" title="Team has reviewed this follow-up">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 animate-strobe" title="Team has NOT reviewed this yet — click Revise to send for review">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase tracking-wider ${aiRead ? "text-emerald-400" : "text-amber-400"}`}>
                Player Follow-up {aiRead ? "— Reviewed" : "— Unread"}
              </span>
              <span className="ml-auto text-[10px] text-text-muted">{f.timestamp}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{f.text}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── Structured result renderer ──────────────────────────── */
function FormattedResult({ text, color }: { text: string; color: "cyan" | "yellow" | "emerald" | "indigo" }) {
  const colorMap = {
    cyan: { border: "border-cyan-500/30", bg: "bg-cyan-500/5", heading: "text-cyan-400", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
    yellow: { border: "border-yellow-500/30", bg: "bg-yellow-500/5", heading: "text-yellow-400", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", heading: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    indigo: { border: "border-indigo-500/30", bg: "bg-indigo-500/5", heading: "text-indigo-400", badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  };
  const c = colorMap[color];

  // Extract structured fields
  const diffMatch = text.match(/DIFFICULTY:\s*(\d+)\s*\/\s*10/i);
  const timeMatch = text.match(/ESTIMATED TIME:\s*(.+)/i);
  const feasMatch = text.match(/FEASIBILITY:\s*(.+)/i);
  const rootMatch = text.match(/ROOT CAUSE:\s*(.+)/i);
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
  const approachMatch = text.match(/(?:FIX )?APPROACH:\s*([\s\S]*?)(?=\n[A-Z]{2,}|\n*$)/i);

  // Extract file lists
  const filesChanged = [...text.matchAll(/FILES (?:CHANGED|INVOLVED|TO MODIFY):\s*\n((?:- .+\n?)*)/gi)];
  const newFiles = [...text.matchAll(/NEW FILES (?:CREATED|NEEDED):\s*\n((?:- .+\n?)*)/gi)];
  const fileList = filesChanged.length > 0 ? filesChanged[0][1].trim().split("\n").map(l => l.replace(/^- /, "").trim()).filter(Boolean) : [];
  const newFileList = newFiles.length > 0 ? newFiles[0][1].trim().split("\n").map(l => l.replace(/^- /, "").trim()).filter(Boolean) : [];
  const hasNone = newFileList.length === 1 && newFileList[0].toLowerCase() === "none";

  const hasStructured = diffMatch || timeMatch || fileList.length > 0 || feasMatch || rootMatch || summaryMatch;

  if (!hasStructured) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{text}</p>;
  }

  const difficulty = diffMatch ? parseInt(diffMatch[1]) : null;
  const diffColor = difficulty !== null
    ? difficulty <= 3 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
    : difficulty <= 6 ? "text-yellow-400 bg-yellow-500/15 border-yellow-500/30"
    : "text-red-400 bg-red-500/15 border-red-500/30"
    : "";

  return (
    <div className="space-y-3">
      {/* Top badges row */}
      <div className="flex flex-wrap gap-2">
        {difficulty !== null && (
          <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${diffColor}`}>
            Difficulty: {difficulty}/10
          </span>
        )}
        {timeMatch && (
          <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${c.badge}`}>
            Est. Time: {timeMatch[1].trim()}
          </span>
        )}
        {feasMatch && (
          <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${c.badge}`}>
            {feasMatch[1].trim()}
          </span>
        )}
      </div>

      {/* Root cause or summary */}
      {rootMatch && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${c.heading} mb-1`}>Root Cause</p>
          <p className="text-sm text-text-secondary">{rootMatch[1].trim()}</p>
        </div>
      )}
      {summaryMatch && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${c.heading} mb-1`}>Summary</p>
          <p className="text-sm text-text-secondary">{summaryMatch[1].trim()}</p>
        </div>
      )}

      {/* Files list */}
      {fileList.length > 0 && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${c.heading} mb-1.5`}>Files {filesChanged[0]?.[0]?.includes("INVOLVED") ? "Involved" : "Changed"}</p>
          <ul className="space-y-1">
            {fileList.map((f, i) => {
              const [path, ...desc] = f.split(" — ");
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-50" />
                  <span>
                    <code className="font-mono text-text">{path}</code>
                    {desc.length > 0 && <span className="text-text-muted"> — {desc.join(" — ")}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* New files */}
      {newFileList.length > 0 && !hasNone && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${c.heading} mb-1.5`}>New Files</p>
          <ul className="space-y-1">
            {newFileList.map((f, i) => {
              const [path, ...desc] = f.split(" — ");
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400 opacity-50" />
                  <span>
                    <code className="font-mono text-emerald-400">{path}</code>
                    {desc.length > 0 && <span className="text-text-muted"> — {desc.join(" — ")}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Approach */}
      {approachMatch && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${c.heading} mb-1`}>Approach</p>
          <p className="text-sm text-text-secondary leading-relaxed">{approachMatch[1].trim()}</p>
        </div>
      )}
    </div>
  );
}

/* ── Admin Comment Thread ─────────────────────────────────── */
type AdminComment = {
  id: string;
  authorName: string;
  authorId: string;
  text: string;
  createdAt: string;
};

function AdminCommentThread({ slug, targetType, targetId, currentUserId, serverOwnerId }: {
  slug: string;
  targetType: "BUG" | "SUGGESTION";
  targetId: string;
  currentUserId: string;
  serverOwnerId: string;
}) {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/fivem/servers/${encodeURIComponent(slug)}/comments?targetType=${targetType}&targetId=${targetId}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [slug, targetType, targetId]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  const addComment = async () => {
    const text = newText.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType, targetId, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewText("");
      }
    } catch { /* ignore */ }
    setPosting(false);
  };

  const deleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ commentId }),
      });
      if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch { /* ignore */ }
  };

  const isBug = targetType === "BUG";

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Comments</p>

      {loading ? (
        <p className="text-xs text-text-muted">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="mb-3 text-xs text-text-muted">No comments yet.</p>
      ) : (
        <div className="mb-3 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="group rounded-lg border border-border bg-bg-surface2 px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${isBug ? "text-red-400" : "text-amber-400"}`}>{c.authorName}</span>
                <span className="text-[10px] text-text-muted">
                  {new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {(c.authorId === currentUserId || serverOwnerId === currentUserId) && (
                  <button
                    onClick={() => void deleteComment(c.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-400"
                    title="Delete comment"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void addComment(); } }}
          placeholder="Add a comment..."
          className={`flex-1 rounded-lg border border-border bg-bg-surface2 px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 ${isBug ? "focus:border-red-500/40 focus:ring-red-500/15" : "focus:border-amber-500/40 focus:ring-amber-500/15"}`}
        />
        <button
          onClick={() => void addComment()}
          disabled={!newText.trim() || posting}
          className={`rounded-lg border px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isBug ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"}`}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

type FivemJob = {
  id: string;
  title: string;
  description: string | null;
  whitelistOnly: boolean;
  isActive: boolean;
};

/* ── Push to Server modal ─────────────────────────────────── */
type TreeNode = { name: string; type: "file" | "dir"; children?: TreeNode[]; fileCount?: number; changed?: boolean };

function TreeItem({ node, depth, selected, onToggle, expanded, onExpand }: {
  node: TreeNode; depth: number; selected: Set<string>; onToggle: (path: string) => void;
  expanded: Set<string>; onExpand: (path: string) => void;
}) {
  const pathKey = node.name;
  const isDir = node.type === "dir";
  const isExpanded = expanded.has(pathKey);
  const isSelected = selected.has(pathKey);
  const isChanged = !!node.changed;

  if (!isDir) return null; // only show directories at top level

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors hover:bg-bg-surface2 ${isSelected ? "bg-primary/10 border border-primary/30" : ""} ${isChanged ? "shadow-[0_0_8px_rgba(34,197,94,0.3)] border-l-2 border-l-emerald-500/60" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggle(pathKey)}
      >
        {isDir && node.children && node.children.some(c => c.type === "dir") ? (
          <button onClick={(e) => { e.stopPropagation(); onExpand(pathKey); }} className="p-0.5 text-text-muted hover:text-text">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : <span className="w-5" />}
        <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${isSelected ? "bg-primary border-primary text-white" : "border-zinc-600 bg-transparent"}`}>
          {isSelected && <Check size={10} />}
        </span>
        {isDir ? (isExpanded ? <FolderOpen size={14} className={isChanged ? "text-emerald-400" : "text-amber-400"} /> : <Folder size={14} className={isChanged ? "text-emerald-400" : "text-amber-400"} />) : <File size={14} className="text-text-muted" />}
        <span className={`text-sm ${isChanged ? "text-emerald-400 font-semibold" : "text-text"}`}>{node.name}</span>
        {isChanged && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        {isDir && node.fileCount !== undefined && <span className="text-[10px] text-text-muted ml-auto">{node.fileCount} files</span>}
        {isDir && node.children && (
          <span className="text-[10px] text-text-muted ml-auto">
            {node.children.filter(c => c.type === "dir").length > 0 && `${node.children.filter(c => c.type === "dir").length} folders`}
            {node.children.filter(c => c.type === "file").length > 0 && ` · ${node.children.filter(c => c.type === "file").length} files`}
          </span>
        )}
      </div>
      {isDir && isExpanded && node.children?.filter(c => c.type === "dir").map(child => (
        <TreeItem
          key={child.name}
          node={{ ...child, name: `${pathKey}/${child.name}` }}
          depth={depth + 1}
          selected={selected}
          onToggle={onToggle}
          expanded={expanded}
          onExpand={onExpand}
        />
      ))}
    </div>
  );
}

function PushToServerModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [canPush, setCanPush] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/tree`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setTree(data.tree);
          setCanPush(data.canPush);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [slug]);

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleExpand = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    for (const node of tree) if (node.type === "dir") all.add(node.name);
    setSelected(all);
  };

  const selectNone = () => setSelected(new Set());

  const pushSelected = async () => {
    // Extract top-level folder names from selected paths
    const topLevel = new Set<string>();
    for (const p of selected) {
      const root = p.split("/")[0];
      topLevel.add(root);
    }

    setPushing(true);
    setResult(null);
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resources: [...topLevel] }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `Pushed ${data.filesCopied} files from ${topLevel.size} folder(s). FiveM will auto-ensure affected resources.` });
      } else {
        setResult({ ok: false, message: data.error || "Push failed" });
      }
    } catch {
      setResult({ ok: false, message: "Network error" });
    }
    setPushing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-border bg-bg-base shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-primary" />
            <h3 className="text-base font-bold text-text">Push to Server</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:text-text hover:bg-bg-surface2 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="ml-3 text-sm text-text-muted">Loading file tree...</span>
            </div>
          ) : !canPush ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-amber-400 font-semibold">Cannot push — no local path stored</p>
              <p className="mt-1 text-xs text-text-muted">Re-sync files from your FiveM server first so RallyLive knows the destination path.</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-text-muted">
                Select the resource folders to push back to your FiveM server. Changed files will be overwritten. FiveM will auto-restart affected resources.
              </p>
              <div className="mb-3 flex items-center gap-2">
                <button onClick={selectAll} className="rounded-md border border-border px-2.5 py-1 text-[11px] font-bold text-text-muted hover:text-text hover:border-zinc-500 transition-colors">Select All</button>
                <button onClick={selectNone} className="rounded-md border border-border px-2.5 py-1 text-[11px] font-bold text-text-muted hover:text-text hover:border-zinc-500 transition-colors">Select None</button>
                <span className="ml-auto text-[11px] text-text-muted">{selected.size} selected</span>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface max-h-[40vh] overflow-y-auto">
                {tree.filter(n => n.type === "dir").map(node => (
                  <TreeItem key={node.name} node={node} depth={0} selected={selected} onToggle={toggleSelect} expanded={expanded} onExpand={toggleExpand} />
                ))}
                {tree.filter(n => n.type === "dir").length === 0 && (
                  <p className="p-4 text-sm text-text-muted text-center">No resource folders found in workspace</p>
                )}
              </div>
            </>
          )}

          {result && (
            <div className={`mt-4 rounded-lg border p-3 ${result.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <p className={`text-xs font-bold ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
                {result.ok ? "Push successful" : "Push failed"}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">{result.message}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {canPush && !loading && (
          <div className="border-t border-border px-5 py-4 flex items-center justify-end gap-3">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:text-text transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void pushSelected()}
              disabled={selected.size === 0 || pushing}
              className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pushing ? "Pushing..." : `Push ${selected.size} folder(s)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type FivemServer = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  websiteName: string;
  summary: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  discordInviteUrl: string | null;
  discordMemberCount: number;
  onlinePlayers: number;
  maxPlayers: number;
  whitelistOpen: boolean;
  isPublished: boolean;
  lastHeartbeatAt: string | null;
  apiKey?: string;
};

type MemberRow = {
  id: string;
  role: "ADMIN" | "MODERATOR" | "USER";
  username: string;
  displayName: string;
};

type VipPackage = {
  id: string;
  name: string;
  description: string | null;
  priceCredits: number;
  durationDays: number;
};

type WebsiteSubscription = {
  status: string;
  amountCents: number;
  nextBillingAt: string;
};

type ServerApplication = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  type: "JOB" | "RULE";
  targetName: string;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  paidCredits: number;
  reviewedNote: string | null;
  createdAt: string;
};

type ServerFeedItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
};

type FivemBugReport = {
  id: string;
  playerName: string;
  playerId: string | null;
  title: string;
  description: string;
  stepsToRepro: string;
  expected: string | null;
  severity: string;
  status: string;
  location: string | null;
  adminNotes: string | null;
  diagnosis: string | null;
  fixPlan: string | null;
  fixResult: string | null;
  testResult: string | null;
  resolvedAt: string | null;
  lastAiProcessedAt: string | null;
  createdAt: string;
};

const TEMPLATE_DEPARTMENTS = ["Police", "EMS", "Fire", "DOJ", "Mechanic", "Taxi", "Real Estate", "Civilian", "Gang"] as const;


type FivemSuggestion = {
  id: string;
  playerName: string;
  playerId: string | null;
  title: string;
  description: string;
  howItWorks: string;
  whyItsGood: string | null;
  priority: string;
  category: string | null;
  status: string;
  adminNotes: string | null;
  analysis: string | null;
  implementationPlan: string | null;
  implementationResult: string | null;
  verifyResult: string | null;
  resolvedAt: string | null;
  lastAiProcessedAt: string | null;
  votes: number;
  createdAt: string;
};

type FivemPlayerReport = {
  id: string;
  reporterName: string;
  reporterId: string | null;
  reportedPlayer: string;
  reasons: string[];
  description: string;
  screenshots: string[] | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
};


function resolveServerLogo(server: FivemServer): string {
  if (server.logoUrl && server.logoUrl.trim()) return server.logoUrl;
  if (server.name.toLowerCase().includes("hkc")) return "/fivem/hkc-logo.svg";
  return "/logo.png";
}

export default function FivemServerPage() {
  const routeParams = useParams<{ slug: string }>();
  const slug = String(routeParams?.slug || "");
  const [server, setServer] = useState<FivemServer | null>(null);
  const [jobs, setJobs] = useState<FivemJob[]>([]);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [vipPackages, setVipPackages] = useState<VipPackage[]>([]);
  const [websiteSubscription, setWebsiteSubscription] = useState<WebsiteSubscription | null>(null);
  const [applications, setApplications] = useState<ServerApplication[]>([]);
  const [feed, setFeed] = useState<ServerFeedItem[]>([]);
  const [jobApplicationFeeCredits, setJobApplicationFeeCredits] = useState(0);
  const [ruleApplicationFeeCredits, setRuleApplicationFeeCredits] = useState(0);
  const [platformFeePct, setPlatformFeePct] = useState(10);
  const [activeView, setActiveView] = useState<"home" | "admin" | "nui">("home");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [jobForm, setJobForm] = useState({ title: "", description: "", whitelistOnly: false });
  const [memberForm, setMemberForm] = useState({ username: "", role: "USER" });
  const [vipForm, setVipForm] = useState({ name: "", description: "", priceCredits: 500, durationDays: 30 });
  const [brandForm, setBrandForm] = useState({
    websiteName: "",
    summary: "",
    description: "",
    logoUrl: "",
    coverUrl: "",
    discordInviteUrl: "",
    onlinePlayers: 0,
    maxPlayers: 64,
    discordMemberCount: 0,
    whitelistOpen: false,
    isPublished: true,
  });
  const [applicationForm, setApplicationForm] = useState({ type: "JOB", targetName: "", message: "" });
  const [pingStatus, setPingStatus] = useState<"idle" | "pinging" | "online" | "offline">("idle");
  const [syncState, setSyncState] = useState<{
    status: "idle" | "requesting" | "waiting" | "uploading" | "done" | "error";
    commandId: string | null;
    error: string | null;
    workspace: { exists: boolean; fileCount: number; resourceCount: number } | null;
    serverOnline: boolean;
  }>({ status: "idle", commandId: null, error: null, workspace: null, serverOnline: false });
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [bugReports, setBugReports] = useState<FivemBugReport[]>([]);
  const [expandedBug, setExpandedBug] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FivemSuggestion[]>([]);
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [playerReports, setPlayerReports] = useState<FivemPlayerReport[]>([]);
  const [expandedPlayerReport, setExpandedPlayerReport] = useState<string | null>(null);
  const [aiProgress, setAiProgressState] = useState<Record<string, { action: string; status: string; output: string; startedAt: string }>>({});

  // Dashboard state
  const [adminSubTab, setAdminSubTab] = useState<"bugs" | "suggestions" | "reports">("bugs");
  const [bugSearch, setBugSearch] = useState("");
  const [bugStatusFilter, setBugStatusFilter] = useState("ALL");
  const [bugSortBy, setBugSortBy] = useState<"newest" | "oldest" | "severity" | "player">("newest");
  const [sugSearch, setSugSearch] = useState("");
  const [sugStatusFilter, setSugStatusFilter] = useState("ALL");
  const [sugSortBy, setSugSortBy] = useState<"newest" | "oldest" | "priority" | "player">("newest");
  const [repSearch, setRepSearch] = useState("");
  const [repStatusFilter, setRepStatusFilter] = useState("ALL");
  const [repSortBy, setRepSortBy] = useState<"newest" | "oldest" | "player">("newest");
  const bugNotesRef = useRef<Record<string, string>>({});
  const sugNotesRef = useRef<Record<string, string>>({});
  const repNotesRef = useRef<Record<string, string>>({});

  // Auto-pilot mode: Ctrl+K to toggle, password gated, per-section toggles
  const [autoBugs, setAutoBugs] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState(false);
  const [showAutoPrompt, setShowAutoPrompt] = useState(false);
  const [showAutoToggles, setShowAutoToggles] = useState(false);
  const [autoPin, setAutoPin] = useState("");
  const autoProcessingRef = useRef<Set<string>>(new Set());
  const autoActive = autoBugs || autoSuggestions;
  const [aiActionLoading, setAiActionLoading] = useState<string | null>(null);
  const [aiActionFeedback, setAiActionFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const backupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // NUI Preview state
  const [nuiResources, setNuiResources] = useState<{ name: string; uiPage: string; openMessages: string[] }[]>([]);
  const [selectedNuiResource, setSelectedNuiResource] = useState<string | null>(null);
  const [nuiCustomMessage, setNuiCustomMessage] = useState('{"type": "open"}');
  const nuiIframeRef = useRef<HTMLIFrameElement>(null);

  const canAdmin = viewerRole === "ADMIN" || viewerRole === "MODERATOR";
  const activeJobs = useMemo(() => jobs.filter((job) => job.isActive), [jobs]);

  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const PRIORITY_ORDER: Record<string, number> = { NEED_THIS: 4, REALLY_WANT: 3, WOULD_BE_COOL: 2, NICE_TO_HAVE: 1 };
  const filteredBugs = useMemo(() => {
    let list = [...bugReports];
    if (bugStatusFilter !== "ALL") list = list.filter((b) => b.status === bugStatusFilter);
    if (bugSearch.trim()) {
      const q = bugSearch.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.playerName.toLowerCase().includes(q) ||
          (b.playerId && b.playerId.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      if (bugSortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (bugSortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (bugSortBy === "severity") return (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
      if (bugSortBy === "player") return a.playerName.localeCompare(b.playerName);
      return 0;
    });
    return list;
  }, [bugReports, bugStatusFilter, bugSearch, bugSortBy]);

  const filteredSuggestions = useMemo(() => {
    let list = [...suggestions];
    if (sugStatusFilter !== "ALL") list = list.filter((s) => s.status === sugStatusFilter);
    if (sugSearch.trim()) {
      const q = sugSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.playerName.toLowerCase().includes(q) ||
          (s.playerId && s.playerId.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      if (sugSortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sugSortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sugSortBy === "priority") return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
      if (sugSortBy === "player") return a.playerName.localeCompare(b.playerName);
      return 0;
    });
    return list;
  }, [suggestions, sugStatusFilter, sugSearch, sugSortBy]);

  const bugStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: bugReports.length };
    for (const b of bugReports) counts[b.status] = (counts[b.status] || 0) + 1;
    return counts;
  }, [bugReports]);

  const sugStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: suggestions.length };
    for (const s of suggestions) counts[s.status] = (counts[s.status] || 0) + 1;
    return counts;
  }, [suggestions]);

  const filteredPlayerReports = useMemo(() => {
    let list = [...playerReports];
    if (repStatusFilter !== "ALL") list = list.filter((r) => r.status === repStatusFilter);
    if (repSearch.trim()) {
      const q = repSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.reportedPlayer.toLowerCase().includes(q) ||
          r.reporterName.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.reasons && r.reasons.some((reason) => reason.toLowerCase().includes(q))),
      );
    }
    list.sort((a, b) => {
      if (repSortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (repSortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (repSortBy === "player") return a.reportedPlayer.localeCompare(b.reportedPlayer);
      return 0;
    });
    return list;
  }, [playerReports, repStatusFilter, repSearch, repSortBy]);

  const repStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: playerReports.length };
    for (const r of playerReports) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [playerReports]);

  const loadServer = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load server.");
        return;
      }
      setServer(data.server);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setVipPackages(Array.isArray(data.vipPackages) ? data.vipPackages : []);
      setWebsiteSubscription(data.websiteSubscription ?? null);
      setViewerRole(data.viewerRole ?? null);
      setViewerUserId(data.viewerUserId ?? null);
      setBrandForm({
        websiteName: data.server?.websiteName ?? "",
        summary: data.server?.summary ?? "",
        description: data.server?.description ?? "",
        logoUrl: data.server?.logoUrl ?? "",
        coverUrl: data.server?.coverUrl ?? "",
        discordInviteUrl: data.server?.discordInviteUrl ?? "",
        onlinePlayers: data.server?.onlinePlayers ?? 0,
        maxPlayers: data.server?.maxPlayers ?? 64,
        discordMemberCount: data.server?.discordMemberCount ?? 0,
        whitelistOpen: Boolean(data.server?.whitelistOpen),
        isPublished: Boolean(data.server?.isPublished ?? true),
      });
    } catch {
      setError("Network error while loading server.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const loadMembers = useCallback(async () => {
    if (!slug || !canAdmin) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/members`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch {}
  }, [canAdmin, slug]);

  const loadApplications = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/applications`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setApplications(Array.isArray(data.applications) ? data.applications : []);
      if (data.fees) {
        setJobApplicationFeeCredits(Number(data.fees.jobApplicationFeeCredits ?? 0));
        setRuleApplicationFeeCredits(Number(data.fees.ruleApplicationFeeCredits ?? 0));
      }
    } catch {}
  }, [slug]);

  const loadFeed = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/feed`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setFeed(Array.isArray(data.feed) ? data.feed : []);
    } catch {}
  }, [slug]);

  const loadFees = useCallback(async () => {
    if (!slug || !canAdmin) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/fees`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.fees) {
        setJobApplicationFeeCredits(Number(data.fees.jobApplicationFeeCredits ?? 0));
        setRuleApplicationFeeCredits(Number(data.fees.ruleApplicationFeeCredits ?? 0));
      }
      setPlatformFeePct(Number(data.platformFeePct ?? 10));
    } catch {}
  }, [canAdmin, slug]);

  const loadBugReports = useCallback(async () => {
    if (!slug || !canAdmin) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/bugs`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setBugReports(Array.isArray(data.bugs) ? data.bugs : []);
    } catch {}
  }, [canAdmin, slug]);

  const loadSuggestions = useCallback(async () => {
    if (!slug || !canAdmin) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/suggestions`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {}
  }, [canAdmin, slug]);

  const loadPlayerReports = useCallback(async () => {
    if (!slug || !canAdmin) return;
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/reports`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setPlayerReports(Array.isArray(data.reports) ? data.reports : []);
    } catch {}
  }, [canAdmin, slug]);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Invalid FiveM server url.");
      return;
    }
    void loadServer();
  }, [loadServer, slug]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadApplications();
    void loadFeed();
    void loadFees();
    void loadBugReports();
    void loadSuggestions();
    void loadPlayerReports();
  }, [loadApplications, loadFeed, loadFees, loadBugReports, loadSuggestions, loadPlayerReports]);

  // Auto-poll when any bug/suggestion is in an AI-waiting state — also fetch live progress
  useEffect(() => {
    const bugAiWaiting = bugReports.filter((b) =>
      b.status === "INVESTIGATING" || b.status === "FIXING" || b.status === "TESTING" || b.status === "DEPLOYING"
    );
    const sugAiWaiting = suggestions.filter((s) =>
      s.status === "ANALYZING" || s.status === "IMPLEMENTING" || s.status === "VERIFYING" || s.status === "DEPLOYING"
    );
    const anyWaiting = bugAiWaiting.length > 0 || sugAiWaiting.length > 0;
    if (!anyWaiting) return;

    const pollProgress = async () => {
      // Fetch live progress for each waiting item
      const progressUpdates: Record<string, any> = {};
      for (const b of bugAiWaiting) {
        try {
          const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/ai-progress?id=${encodeURIComponent(b.id)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) progressUpdates[b.id] = data.progress;
          }
        } catch {}
      }
      for (const s of sugAiWaiting) {
        try {
          const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/ai-progress?id=${encodeURIComponent(s.id)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) progressUpdates[s.id] = data.progress;
          }
        } catch {}
      }
      setAiProgressState((prev) => ({ ...prev, ...progressUpdates }));

      // Reload data to catch status transitions
      if (bugAiWaiting.length > 0) void loadBugReports();
      if (sugAiWaiting.length > 0) void loadSuggestions();
    };

    const interval = setInterval(pollProgress, 3000);
    void pollProgress();
    return () => clearInterval(interval);
  }, [bugReports, suggestions, loadBugReports, loadSuggestions, slug]);

  // Ctrl+K keyboard listener for auto-pilot toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        if (autoBugs || autoSuggestions) {
          setShowAutoToggles(true);
        } else {
          setShowAutoPrompt(true);
          setAutoPin("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autoBugs, autoSuggestions]);

  // Auto-pilot engine: advance bugs & suggestions through the pipeline based on per-section toggles
  useEffect(() => {
    if (!autoBugs && !autoSuggestions) return;
    const proc = autoProcessingRef.current;

    const advance = async () => {
      if (autoBugs) {
        // Bugs: OPEN → investigate, DIAGNOSED → fix, FIXED → verify → deploy
        for (const bug of bugReports) {
          const key = `bug-${bug.id}-${bug.status}`;
          if (proc.has(key)) continue;
          if (bug.status === "OPEN" || bug.status === "CANT_FIND") {
            proc.add(key);
            await triggerBugAI(bug.id, "investigate");
          } else if (bug.status === "DIAGNOSED") {
            proc.add(key);
            await triggerBugAI(bug.id, "fix");
          } else if (bug.status === "FIXED") {
            proc.add(key);
            await triggerBugAI(bug.id, "deploy");
          }
        }
      }
      if (autoSuggestions) {
        // Suggestions: NEW → analyze, ANALYZED → plan+implement, PLANNED → implement, IMPLEMENTED → deploy
        for (const sug of suggestions) {
          const key = `sug-${sug.id}-${sug.status}`;
          if (proc.has(key)) continue;
          if (sug.status === "NEW" || sug.status === "CANT_ANALYZE") {
            proc.add(key);
            await triggerSuggestionAI(sug.id, "analyze");
          } else if (sug.status === "ANALYZED") {
            proc.add(key);
            await updateSuggestionStatus(sug.id, "PLANNED");
          } else if (sug.status === "PLANNED") {
            proc.add(key);
            await triggerSuggestionAI(sug.id, "implement");
          } else if (sug.status === "IMPLEMENTED") {
            proc.add(key);
            await triggerSuggestionAI(sug.id, "deploy");
          }
        }
      }
    };

    void advance();
  }, [autoBugs, autoSuggestions, bugReports, suggestions]);

  const createJob = async (event: FormEvent) => {
    event.preventDefault();
    if (!jobForm.title.trim()) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(jobForm),
    });
    if (res.ok) {
      setJobForm({ title: "", description: "", whitelistOnly: false });
      await loadServer();
    }
  };

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberForm.username.trim()) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(memberForm),
    });
    if (res.ok) {
      setMemberForm({ username: "", role: "USER" });
      await loadMembers();
    }
  };

  const updateMemberRole = async (memberId: string, role: "ADMIN" | "MODERATOR" | "USER") => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ memberId, role, status: "ACTIVE" }),
    });
    if (res.ok) await loadMembers();
  };

  const buyVip = async (packageId: string) => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/vip/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ packageId }),
    });
    if (res.ok) {
      await loadServer();
      return;
    }
    const data = await res.json();
    setError(data.error || "Could not purchase VIP package.");
  };

  const createVipPackage = async (event: FormEvent) => {
    event.preventDefault();
    if (!vipForm.name.trim()) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/vip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(vipForm),
    });
    if (res.ok) {
      setVipForm({ name: "", description: "", priceCredits: 500, durationDays: 30 });
      await loadServer();
    }
  };

  const saveBrandSettings = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(brandForm),
    });
    if (res.ok) {
      await loadServer();
      return;
    }
    const data = await res.json();
    setError(data.error || "Failed to save website settings.");
  };

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!applicationForm.targetName.trim()) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(applicationForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not submit application.");
      return;
    }
    setApplicationForm({ type: "JOB", targetName: "", message: "" });
    await loadApplications();
    await loadFeed();
  };

  const reviewApplication = async (applicationId: string, status: "APPROVED" | "REJECTED") => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/applications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ applicationId, status }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not review application.");
      return;
    }
    await loadApplications();
    await loadFeed();
  };

  const saveFees = async () => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/fees`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ jobApplicationFeeCredits, ruleApplicationFeeCredits }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save fees.");
      return;
    }
    setPlatformFeePct(Number(data.platformFeePct ?? platformFeePct));
    await loadApplications();
  };

  const updateBugStatus = async (bugId: string, status: string) => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/bugs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bugId, status }),
    });
    if (res.ok) await loadBugReports();
  };

  const pingServer = async () => {
    setPingStatus("pinging");
    // Reload server data to get fresh lastHeartbeatAt
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}`, { credentials: "include" });
      if (!res.ok) { setPingStatus("offline"); return; }
      const data = await res.json();
      const srv = data.server;
      if (srv) {
        setServer(srv);
        const hb = srv.lastHeartbeatAt ? new Date(srv.lastHeartbeatAt) : null;
        const isRecent = hb && (Date.now() - hb.getTime()) < 120000; // within 2 min
        setPingStatus(isRecent ? "online" : "offline");
      } else {
        setPingStatus("offline");
      }
    } catch {
      setPingStatus("offline");
    }
  };

  const rotateApiKey = async () => {
    if (!confirm("Rotate API key?\n\nYour FiveM server will automatically pick up the new key within 15 seconds if it's online.\n\nIf the server is offline, you'll need to update server.cfg with the new key manually.")) return;
    setRotatingKey(true);
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/rotate-key`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok && data.apiKey && server) {
        // Show the new key in the UI immediately (even though DB updates after server confirms)
        setServer({ ...server, apiKey: data.apiKey });
      }
    } catch {
      // silent
    }
    setRotatingKey(false);
  };

  // Load workspace status on admin tab open
  const loadSyncStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/sync`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSyncState(prev => ({ ...prev, workspace: data.workspace, serverOnline: data.serverOnline }));
      }
    } catch { /* silent */ }
  }, [slug]);

  const stopSyncPoll = useCallback(() => {
    if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; }
  }, []);

  const syncFiles = async () => {
    stopSyncPoll();
    setSyncState(prev => ({ ...prev, status: "requesting", error: null, commandId: null }));
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/sync`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setSyncState(prev => ({ ...prev, status: "error", error: data.error || `HTTP ${res.status}` }));
        return;
      }
      const syncData = await res.json();

      // If server did a direct local copy, sync is already done — no polling needed
      if (syncData.type === "LOCAL_COPY") {
        await loadSyncStatus();
        setSyncState(prev => ({ ...prev, status: "done" }));
        return;
      }

      const commandId = syncData.commandId;
      setSyncState(prev => ({ ...prev, status: "waiting", commandId }));

      // Poll every 3s for up to 2 minutes
      let polls = 0;
      const maxPolls = 40;
      syncPollRef.current = setInterval(async () => {
        polls++;
        try {
          const r = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/sync?commandId=${commandId}`, { credentials: "include" });
          if (!r.ok) return;
          const d = await r.json();
          const cmdStatus = d.command?.status;
          const ws = d.workspace;

          if (cmdStatus === "DONE") {
            stopSyncPoll();
            setSyncState(prev => ({ ...prev, status: "done", workspace: ws, serverOnline: d.serverOnline }));
          } else if (cmdStatus === "FAILED") {
            stopSyncPoll();
            setSyncState(prev => ({ ...prev, status: "error", error: "FiveM server reported sync failed", workspace: ws, serverOnline: d.serverOnline }));
          } else if (ws && ws.exists && ws.fileCount > 0) {
            // Workspace appeared (upload happened via heartbeat needsSync)
            stopSyncPoll();
            setSyncState(prev => ({ ...prev, status: "done", workspace: ws, serverOnline: d.serverOnline }));
          } else {
            // Still pending — update server online status
            setSyncState(prev => ({ ...prev, status: "waiting", serverOnline: d.serverOnline, workspace: ws }));
          }
        } catch { /* silent */ }

        if (polls >= maxPolls) {
          stopSyncPoll();
          setSyncState(prev => ({ ...prev, status: "error", error: "Timed out waiting for FiveM server to upload resources. Is HK-debug running?" }));
        }
      }, 3000);
    } catch {
      setSyncState(prev => ({ ...prev, status: "error", error: "Network error — could not reach API" }));
    }
  };

  // Load sync status on mount and cleanup poll on unmount
  useEffect(() => {
    void loadSyncStatus();
    return () => {
      stopSyncPoll();
      if (backupPollRef.current) { clearInterval(backupPollRef.current); backupPollRef.current = null; }
    };
  }, [loadSyncStatus, stopSyncPoll]);

  /** Queue a backup, poll until DONE, then auto-retry the original action */
  const runBackupThenRetry = async (itemId: string, retryFn: () => Promise<void>, errorMsg: string) => {
    const doBackup = confirm(`${errorMsg}\n\nRun a backup now? Fix/Deploy will be disabled until the backup completes.`);
    if (!doBackup) return;

    setBackupRunning(true);
    setAiActionFeedback({ id: itemId, msg: "Backup running — Fix/Deploy disabled until complete...", ok: true });

    try {
      const bRes = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "BACKUP" }),
      });
      if (!bRes.ok) {
        setBackupRunning(false);
        setAiActionFeedback({ id: itemId, msg: "Failed to queue backup", ok: false });
        return;
      }
      const { commandId } = await bRes.json();

      // Poll every 3s for up to 2 minutes
      let polls = 0;
      const maxPolls = 40;
      backupPollRef.current = setInterval(async () => {
        polls++;
        try {
          const r = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/resources/sync?commandId=${commandId}`, { credentials: "include" });
          if (!r.ok) return;
          const d = await r.json();
          const status = d.command?.status;

          if (status === "DONE") {
            if (backupPollRef.current) { clearInterval(backupPollRef.current); backupPollRef.current = null; }
            setBackupRunning(false);
            setAiActionFeedback({ id: itemId, msg: "Backup complete — retrying action...", ok: true });
            await retryFn();
          } else if (status === "FAILED") {
            if (backupPollRef.current) { clearInterval(backupPollRef.current); backupPollRef.current = null; }
            setBackupRunning(false);
            setAiActionFeedback({ id: itemId, msg: "Backup failed — cannot proceed", ok: false });
          }
        } catch { /* silent */ }

        if (polls >= maxPolls) {
          if (backupPollRef.current) { clearInterval(backupPollRef.current); backupPollRef.current = null; }
          setBackupRunning(false);
          setAiActionFeedback({ id: itemId, msg: "Backup timed out — is the server online?", ok: false });
        }
      }, 3000);
    } catch {
      setBackupRunning(false);
      setAiActionFeedback({ id: itemId, msg: "Network error queuing backup", ok: false });
    }
  };

  const triggerBugAI = async (bugId: string, action: "investigate" | "fix" | "verify" | "deploy") => {
    if (aiActionLoading || backupRunning) return;
    setError("");
    setAiActionFeedback({ id: bugId, msg: `Starting ${action}...`, ok: true });
    setAiActionLoading(`bug-${bugId}-${action}`);
    try {
      const url = `/api/fivem/servers/${encodeURIComponent(slug)}/bugs/${encodeURIComponent(bugId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setAiActionFeedback({ id: bugId, msg: `${action} started — Team is working`, ok: true });
        await loadBugReports();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.needsBackup) {
          setAiActionLoading(null);
          await runBackupThenRetry(bugId, () => triggerBugAI(bugId, action), data.error);
          return;
        }
        const errMsg = data.error || `Failed to ${action}`;
        setError(errMsg);
        setAiActionFeedback({ id: bugId, msg: errMsg, ok: false });
      }
    } catch (e: any) {
      const errMsg = `Network error: ${e.message}`;
      setError(errMsg);
      setAiActionFeedback({ id: bugId, msg: errMsg, ok: false });
    } finally {
      setAiActionLoading(null);
    }
  };

  const updateBugNotes = async (bugId: string, adminNotes: string) => {
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/bugs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bugId, adminNotes }),
    });
    if (res.ok) await loadBugReports();
  };

  const triggerSuggestionAI = async (suggestionId: string, action: "analyze" | "implement" | "verify" | "deploy") => {
    if (aiActionLoading || backupRunning) return;
    setError("");
    setAiActionFeedback({ id: suggestionId, msg: `Starting ${action}...`, ok: true });
    setAiActionLoading(`sug-${suggestionId}-${action}`);
    try {
      const url = `/api/fivem/servers/${encodeURIComponent(slug)}/suggestions/${encodeURIComponent(suggestionId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setAiActionFeedback({ id: suggestionId, msg: `${action} started — Team is working`, ok: true });
        await loadSuggestions();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.needsBackup) {
          setAiActionLoading(null);
          await runBackupThenRetry(suggestionId, () => triggerSuggestionAI(suggestionId, action), data.error);
          return;
        }
        const errMsg = data.error || `Failed to ${action}`;
        setError(errMsg);
        setAiActionFeedback({ id: suggestionId, msg: errMsg, ok: false });
      }
    } catch (e: any) {
      const errMsg = `Network error: ${e.message}`;
      setError(errMsg);
      setAiActionFeedback({ id: suggestionId, msg: errMsg, ok: false });
    } finally {
      setAiActionLoading(null);
    }
  };

  const updateSuggestionStatus = async (suggestionId: string, status: string) => {
    setError("");
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/suggestions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ suggestionId, status }),
      });
      if (res.ok) await loadSuggestions();
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to update suggestion status to ${status}`);
      }
    } catch (e: any) {
      setError(`Network error: ${e.message}`);
    }
  };

  const updateSuggestionNotes = async (suggestionId: string, adminNotes: string) => {
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/suggestions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ suggestionId, adminNotes }),
    });
    if (res.ok) await loadSuggestions();
  };

  const updatePlayerReportStatus = async (reportId: string, status: string) => {
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/reports`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reportId, status }),
    });
    if (res.ok) await loadPlayerReports();
  };

  const deleteBug = async (bugId: string) => {
    if (!confirm("Delete this bug report permanently?")) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/bugs`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bugId }),
    });
    if (res.ok) { setExpandedBug(null); await loadBugReports(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to delete bug"); }
  };

  const deleteSuggestion = async (suggestionId: string) => {
    if (!confirm("Delete this suggestion permanently?")) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/suggestions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ suggestionId }),
    });
    if (res.ok) { setExpandedSuggestion(null); await loadSuggestions(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to delete suggestion"); }
  };

  const deletePlayerReport = async (reportId: string) => {
    if (!confirm("Delete this player report permanently?")) return;
    setError("");
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/reports`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reportId }),
    });
    if (res.ok) { setExpandedPlayerReport(null); await loadPlayerReports(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Failed to delete report"); }
  };

  const updatePlayerReportNotes = async (reportId: string, adminNotes: string) => {
    const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/reports`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reportId, adminNotes }),
    });
    if (res.ok) await loadPlayerReports();
  };

  if (loading) return <div className="p-4 text-sm text-text-muted">Loading FiveM server...</div>;
  if (!server) return <div className="p-4 text-sm text-danger">{error || "Server not found."}</div>;
  const showInsufficientCreditsHint = error.toLowerCase().includes("insufficient credits");

  return (
    <div className="min-h-full bg-bg px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        {error ? (
          <section className={`rounded-2xl border px-4 py-3 text-sm ${
            showInsufficientCreditsHint ? "border-warning/50 bg-warning/10 text-warning" : "border-danger/40 bg-danger/10 text-danger"
          }`}>
            <p>{error}</p>
            {showInsufficientCreditsHint ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold animate-pulse">
                  Buy credits
                  <span aria-hidden>→</span>
                </span>
                <Link href="/wallet" className="inline-flex rounded-lg border border-warning px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20">
                  Open Wallet
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
          <div
            className="h-36 w-full bg-bg-surface2"
            style={server.coverUrl ? { backgroundImage: `url(${server.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          />
          <div className="p-5">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
              <img src={resolveServerLogo(server)} alt={server.name} className="h-20 w-20 rounded-2xl border border-border object-cover" />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-text-muted">FiveM Server</p>
                <h1 className="mt-1 text-3xl font-bold text-text">{server.websiteName || server.name}</h1>
                <p className="mt-1 text-sm text-text-secondary">{server.summary || "No summary provided."}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-border px-3 py-1">{server.onlinePlayers}/{server.maxPlayers} online</span>
              <span className="rounded-full border border-border px-3 py-1">Discord: {server.discordMemberCount}</span>
              <span className="rounded-full border border-border px-3 py-1">{server.whitelistOpen ? "Whitelist Open" : "Whitelist Closed"}</span>
              {websiteSubscription ? (
                <span className="rounded-full border border-emerald-500/40 px-3 py-1 text-emerald-400">
                  {websiteSubscription.amountCents} credits / 30d
                </span>
              ) : null}
            </div>
            {server.discordInviteUrl ? <a href={server.discordInviteUrl} target="_blank" className="mt-3 block text-center text-sm text-primary underline">Join Discord</a> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-surface p-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView("home")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeView === "home" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg-surface2"}`}
            >
              Home
            </button>
            {canAdmin ? (
              <>
                <button
                  onClick={() => setActiveView("admin")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeView === "admin" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg-surface2"}`}
                >
                  Admin
                </button>
                <button
                  onClick={() => {
                    setActiveView("nui");
                    if (!nuiResources.length) {
                      fetch(`/api/fivem/nui?slug=${encodeURIComponent(slug)}`, { credentials: "include" })
                        .then((r) => r.json())
                        .then((d) => { if (d.resources) setNuiResources(d.resources); })
                        .catch(() => {});
                    }
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeView === "nui" ? "bg-primary text-white" : "text-text-secondary hover:bg-bg-surface2"}`}
                >
                  NUI Preview
                </button>
              </>
            ) : null}
          </div>
        </section>

        {activeView === "home" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">About Server</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{server.description || "Server description not set yet."}</p>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Departments</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {TEMPLATE_DEPARTMENTS.map((dept) => (
                  <div key={dept} className="rounded-xl border border-border bg-bg-surface2 p-3 text-sm text-text-secondary">{dept}</div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <div className="mb-3 flex items-center gap-2 text-text"><Wrench size={16} /><h2 className="text-base font-semibold">Whitelisted Jobs</h2></div>
              {activeJobs.length === 0 ? <p className="text-sm text-text-muted">No jobs listed yet.</p> : (
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="rounded-xl border border-border bg-bg-surface2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-text">{job.title}</h3>
                        {job.whitelistOnly ? <span className="text-xs text-primary">Whitelist required</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">{job.description || "No details provided."}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">VIP Packages</h2>
              <p className="mt-2 text-sm text-text-secondary">Server owner sets prices. Buyers pay in credits.</p>
              <Link href="/wallet" className="mt-2 inline-block text-xs text-primary underline">Need credits? Buy in Wallet</Link>
              <div className="mt-3 space-y-2">
                {vipPackages.length === 0 ? <p className="text-sm text-text-muted">No VIP packages yet.</p> : vipPackages.map((vip) => (
                  <div key={vip.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-surface2 p-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{vip.name}</p>
                      <p className="text-xs text-text-muted">{vip.description || "VIP access package"}</p>
                      <p className="mt-1 text-xs text-text-secondary">Duration: {vip.durationDays} days</p>
                    </div>
                    <button onClick={() => void buyVip(vip.id)} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">
                      Buy {vip.priceCredits.toLocaleString()} credits
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Whitelist</h2>
              <p className="mt-2 text-sm text-text-secondary">Apply through the FiveM whitelist form.</p>
              <Link href="/fivem-whitelist" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                <Shield size={15} />
                Open Whitelist Form
              </Link>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Apply For Jobs / Rules</h2>
              <p className="mt-1 text-xs text-text-muted">
                Job fee: {jobApplicationFeeCredits} credits | Rule fee: {ruleApplicationFeeCredits} credits
              </p>
              <form onSubmit={submitApplication} className="mt-3 space-y-2">
                <select
                  value={applicationForm.type}
                  onChange={(e) => setApplicationForm((v) => ({ ...v, type: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text"
                >
                  <option value="JOB">Job Application</option>
                  <option value="RULE">Rule Request</option>
                </select>
                <input
                  value={applicationForm.targetName}
                  onChange={(e) => setApplicationForm((v) => ({ ...v, targetName: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text"
                  placeholder={applicationForm.type === "JOB" ? "Job name (Police, EMS...)" : "Rule title"}
                  required
                />
                <textarea
                  value={applicationForm.message}
                  onChange={(e) => setApplicationForm((v) => ({ ...v, message: e.target.value }))}
                  className="min-h-20 w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text"
                  placeholder="Why you should be approved"
                />
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Submit Application</button>
              </form>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Rules</h2>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>1. No fail RP, no random deathmatch, no powergaming/metagaming.</li>
                <li>2. Stay in character during active scenes and follow department SOP.</li>
                <li>3. Respect staff instructions and escalation procedures.</li>
                <li>4. Toxicity and exploit abuse can lead to immediate removal.</li>
                <li>5. Whitelist and VIP are privileges tied to server policy.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-bg-surface p-4 lg:col-span-2">
              <div className="flex items-center gap-2 text-text"><MessageCircle size={16} /><h2 className="text-base font-semibold">RallyLive Chat</h2></div>
              <p className="mt-2 text-sm text-text-secondary">This server reuses RallyLive chat so community and moderation are centralized.</p>
              <Link href="/messages" className="mt-3 inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-text hover:bg-bg-surface2">
                Open RallyLive Chat
              </Link>
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold text-text">Server Feed</h3>
                {feed.length === 0 ? (
                  <p className="text-xs text-text-muted">No feed events yet.</p>
                ) : (
                  feed.slice(0, 10).map((item) => (
                    <div key={item.id} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2">
                      <p className="text-sm font-medium text-text">{item.title}</p>
                      <p className="text-xs text-text-secondary">{item.body || ""}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {activeView === "nui" && canAdmin && (
          <section className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
            <div className="flex h-[calc(100vh-260px)] min-h-[400px]">
              {/* Sidebar — resource list */}
              <div className="w-56 shrink-0 border-r border-border overflow-y-auto bg-bg-surface2/50">
                <div className="p-3 border-b border-border">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Resources ({nuiResources.length})</p>
                </div>
                {nuiResources.map((res) => (
                  <button
                    key={res.name}
                    onClick={() => setSelectedNuiResource(res.name)}
                    className={`w-full text-left px-3 py-2.5 text-sm border-b border-border/50 transition-colors ${
                      selectedNuiResource === res.name
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-text-secondary hover:bg-bg-surface2 hover:text-text"
                    }`}
                  >
                    {res.name}
                  </button>
                ))}
                {!nuiResources.length && (
                  <p className="p-4 text-xs text-text-muted">No NUI resources found</p>
                )}
              </div>

              {/* Main — iframe + toolbar */}
              <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-surface">
                  <span className="text-xs font-semibold text-text-muted mr-auto">
                    {selectedNuiResource ? selectedNuiResource : "Select a resource"}
                  </span>
                  {selectedNuiResource && (() => {
                    const res = nuiResources.find((r) => r.name === selectedNuiResource);
                    return (
                      <>
                        {res?.openMessages?.map((msg) => (
                          <button
                            key={msg}
                            onClick={() => {
                              nuiIframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: msg }), "*");
                            }}
                            className="rounded-lg border border-border bg-bg-surface2 px-3 py-1 text-[11px] font-semibold text-text-secondary hover:text-text hover:border-text-muted"
                            title={`Send: {"type":"${msg}"}`}
                          >
                            {msg}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(nuiCustomMessage);
                              nuiIframeRef.current?.contentWindow?.postMessage(JSON.stringify(parsed), "*");
                            } catch {}
                          }}
                          className="rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-white"
                        >
                          Send
                        </button>
                        <button
                          onClick={() => {
                            if (nuiIframeRef.current) {
                              nuiIframeRef.current.src = nuiIframeRef.current.src;
                            }
                          }}
                          className="rounded-lg border border-border bg-bg-surface2 px-3 py-1 text-[11px] font-semibold text-text-secondary hover:text-text"
                        >
                          Reload
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* Custom message input */}
                {selectedNuiResource && (
                  <div className="px-4 py-1.5 border-b border-border bg-bg-surface2/30">
                    <input
                      value={nuiCustomMessage}
                      onChange={(e) => setNuiCustomMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          try {
                            const parsed = JSON.parse(nuiCustomMessage);
                            nuiIframeRef.current?.contentWindow?.postMessage(JSON.stringify(parsed), "*");
                          } catch {}
                        }
                      }}
                      className="w-full rounded-lg border border-border bg-bg-surface px-3 py-1.5 text-xs font-mono text-text placeholder:text-text-muted focus:outline-none focus:border-primary/50"
                      placeholder='Custom JSON message, e.g. {"type":"open"}'
                    />
                  </div>
                )}

                {/* Iframe */}
                <div className="flex-1 bg-black/20 relative">
                  {selectedNuiResource ? (
                    <iframe
                      ref={nuiIframeRef}
                      src={`/api/fivem/nui/${encodeURIComponent(selectedNuiResource)}/${nuiResources.find((r) => r.name === selectedNuiResource)?.uiPage || "html/index.html"}?slug=${encodeURIComponent(slug)}`}
                      className="absolute inset-0 w-full h-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm text-text-muted">Select a resource from the sidebar to preview its NUI</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "admin" && canAdmin && (
          <section className="grid gap-3 md:grid-cols-2">

            {/* ═══════════ Server Integration / Setup ═══════════ */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 md:col-span-2">
              {/* Header with server name + ping */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Wrench size={18} className="text-primary" />
                  <div>
                    <h2 className="text-base font-semibold text-text">Connect Your FiveM Server</h2>
                    <p className="text-xs text-text-muted">
                      Linked to: <span className="font-bold text-text">{server.websiteName || server.name}</span>
                      <span className="mx-1.5 text-text-muted/50">|</span>
                      slug: <code className="font-mono text-primary">{slug}</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Connection status */}
                  {pingStatus === "online" && (
                    <span className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Online — {server.onlinePlayers}/{server.maxPlayers} players
                    </span>
                  )}
                  {pingStatus === "offline" && (
                    <span className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      No heartbeat — server may be offline
                    </span>
                  )}
                  {pingStatus === "pinging" && (
                    <span className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-400">
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                      Pinging...
                    </span>
                  )}
                  <button
                    onClick={() => void pingServer()}
                    disabled={pingStatus === "pinging"}
                    className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    Ping
                  </button>
                  <button
                    onClick={() => void syncFiles()}
                    disabled={syncState.status === "requesting" || syncState.status === "waiting" || syncState.status === "uploading"}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    {syncState.status === "requesting" || syncState.status === "waiting" || syncState.status === "uploading" ? "Syncing..." : "Sync Files"}
                  </button>
                  {syncState.workspace?.exists && (
                    <button
                      onClick={() => setShowPushModal(true)}
                      className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-400 hover:bg-blue-500/20 transition-colors"
                    >
                      Push to Server
                    </button>
                  )}
                </div>
              </div>

              {showPushModal && <PushToServerModal slug={slug} onClose={() => setShowPushModal(false)} />}

              {/* Last heartbeat info */}
              {server.lastHeartbeatAt && (
                <p className="mt-2 text-[11px] text-text-muted">
                  Last heartbeat: {new Date(server.lastHeartbeatAt).toLocaleString()}
                  {" — "}
                  {(() => {
                    const ago = Math.round((Date.now() - new Date(server.lastHeartbeatAt!).getTime()) / 1000);
                    if (ago < 60) return `${ago}s ago`;
                    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
                    return `${Math.floor(ago / 3600)}h ago`;
                  })()}
                </p>
              )}

              {/* ── Resource Sync Status Panel ── */}
              <div className="mt-3 rounded-xl border border-border bg-bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <RotateCcw size={16} className="text-text-muted" />
                    <p className="text-sm font-semibold text-text">Resource Workspace</p>
                  </div>
                  {syncState.workspace?.exists && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                      {syncState.workspace.resourceCount} resources &middot; {syncState.workspace.fileCount} files
                    </span>
                  )}
                  {syncState.workspace && !syncState.workspace.exists && syncState.status === "idle" && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
                      No workspace yet
                    </span>
                  )}
                </div>

                {/* Progress bar for active sync */}
                {(syncState.status === "requesting" || syncState.status === "waiting" || syncState.status === "uploading") && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-xs font-semibold text-blue-400">
                        {syncState.status === "requesting" && "Sending sync request..."}
                        {syncState.status === "waiting" && (syncState.serverOnline
                          ? "Waiting for FiveM server to zip & upload resources..."
                          : "Waiting for FiveM server — server appears offline, HK-debug must be running"
                        )}
                        {syncState.status === "uploading" && "Uploading resources..."}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-surface2">
                      <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: syncState.status === "requesting" ? "15%" : syncState.status === "waiting" ? "40%" : "70%" }} />
                    </div>
                    <p className="mt-1.5 text-[10px] text-text-muted">
                      HK-debug polls every 15s. This may take up to 30 seconds.
                    </p>
                  </div>
                )}

                {/* Success */}
                {syncState.status === "done" && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        Workspace synced — {syncState.workspace?.resourceCount ?? "?"} resources, {syncState.workspace?.fileCount ?? "?"} files
                      </span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {syncState.status === "error" && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-400 shrink-0" />
                      <span className="text-xs font-bold text-red-400">Sync failed</span>
                    </div>
                    {syncState.error && (
                      <p className="mt-1.5 text-[11px] text-red-300/80">{syncState.error}</p>
                    )}
                    <button
                      onClick={() => setSyncState(prev => ({ ...prev, status: "idle", error: null }))}
                      className="mt-2 text-[11px] font-bold text-text-muted hover:text-text-secondary"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Info when no workspace and idle */}
                {syncState.workspace && !syncState.workspace.exists && syncState.status === "idle" && (
                  <p className="mt-2 text-[11px] text-text-muted">
                    Click <span className="font-bold text-emerald-400">Sync Files</span> to pull your server&apos;s resources into RallyLive.
                    This lets Claude AI read and edit your FiveM code for bug fixes and suggestions.
                    Your FiveM server must be running with HK-debug active.
                  </p>
                )}
              </div>

              {/* Step 1 — Download resource */}
              <div className="mt-4 rounded-xl border border-border bg-bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">1</span>
                  <p className="text-sm font-semibold text-text">Add the HK-debug resource to your server</p>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Drop the <span className="font-mono font-bold text-text-secondary">HK-debug</span> resource folder into your server&apos;s <span className="font-mono">resources/</span> directory.
                </p>
              </div>

              {/* Step 2 — F8 commands */}
              <div className="mt-3 rounded-xl border border-primary/30 bg-bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">2</span>
                  <p className="text-sm font-semibold text-text">Paste into F8 console <span className="text-text-muted font-normal">or server.cfg</span></p>
                </div>
                <div className="relative mt-3">
                  <pre className="rounded-lg border border-border bg-zinc-900 p-4 font-mono text-sm leading-relaxed text-emerald-400 overflow-x-auto">{`set rallylive_slug "${slug}"
set rallylive_api "https://rallylive.ca"
set rallylive_apikey "${server?.apiKey || "YOUR_API_KEY"}"
ensure HK-debug`}</pre>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `set rallylive_slug "${slug}"\nset rallylive_api "https://rallylive.ca"\nset rallylive_apikey "${server?.apiKey || "YOUR_API_KEY"}"\nensure HK-debug`
                      );
                    }}
                    className="absolute top-2 right-2 rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:text-white hover:border-zinc-400 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-text-muted">
                  Press <span className="font-bold text-text-secondary">F8</span> in your FiveM server console, paste the commands, hit Enter. For permanent setup, add these 3 lines to <span className="font-mono font-bold text-text-secondary">server.cfg</span>.
                  Then click <span className="font-bold text-primary">Ping</span> above to verify the connection.
                </p>

                {/* API Key management */}
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-zinc-900/50 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-text-secondary">API Key</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">{server?.apiKey || "Not generated"}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (server?.apiKey) void navigator.clipboard.writeText(server.apiKey);
                    }}
                    className="shrink-0 rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:text-white hover:border-zinc-400 transition-colors"
                  >
                    Copy Key
                  </button>
                  <button
                    onClick={rotateApiKey}
                    disabled={rotatingKey}
                    className="shrink-0 rounded-md border border-amber-600/50 bg-amber-900/30 px-2.5 py-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 hover:border-amber-500 hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                    title="Generate a new API key. If your server is online, it picks up the new key automatically within 15 seconds."
                  >
                    {rotatingKey ? "Rotating..." : "Rotate Key"}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-text-muted">
                  If your server is running, rotating the key updates it automatically — no restart needed. If offline, update <span className="font-mono text-text-secondary">rallylive_apikey</span> in server.cfg.
                </p>
              </div>

              {/* Step 3 — Done */}
              <div className="mt-3 rounded-xl border border-border bg-bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">3</span>
                  <p className="text-sm font-semibold text-text">Players press F3 in-game to report</p>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Bug reports, suggestions, and player reports all route to <span className="font-bold text-text">{server.websiteName || server.name}</span>&apos;s admin panel using slug <code className="rounded bg-bg-surface2 px-1.5 py-0.5 font-mono text-primary">{slug}</code>. Each server gets its own separate data.
                </p>
              </div>

              {/* API reference (collapsed) */}
              <details className="mt-3 rounded-xl border border-border bg-bg-surface overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-text-muted hover:text-text-secondary hover:bg-bg-surface2/50 transition-colors">
                  API Endpoints Reference
                </summary>
                <div className="border-t border-border px-4 py-3 space-y-1 text-xs font-mono text-text-secondary">
                  <p>POST /api/fivem/servers/<span className="text-primary">{slug}</span>/bugs</p>
                  <p>POST /api/fivem/servers/<span className="text-primary">{slug}</span>/suggestions</p>
                  <p>POST /api/fivem/servers/<span className="text-primary">{slug}</span>/reports</p>
                  <p>POST /api/fivem/servers/<span className="text-primary">{slug}</span>/heartbeat</p>
                  <p className="mt-2 text-text-muted">GET endpoints also available for player history (append /player?playerId=...)</p>
                </div>
              </details>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4 md:col-span-2">
              <h2 className="text-base font-semibold text-text">Fees & Platform Cut</h2>
              <p className="mt-1 text-xs text-text-muted">Platform fee is {platformFeePct}% on paid actions. You set local application fees below.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  value={jobApplicationFeeCredits}
                  onChange={(e) => setJobApplicationFeeCredits(Math.max(0, Number(e.target.value || 0)))}
                  className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text"
                  placeholder="Job application fee (credits)"
                />
                <input
                  type="number"
                  value={ruleApplicationFeeCredits}
                  onChange={(e) => setRuleApplicationFeeCredits(Math.max(0, Number(e.target.value || 0)))}
                  className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text"
                  placeholder="Rule request fee (credits)"
                />
              </div>
              <button onClick={() => void saveFees()} className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                Save Fees
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4 md:col-span-2">
              <h2 className="text-base font-semibold text-text">Applications Review</h2>
              <div className="mt-3 space-y-2">
                {applications.length === 0 ? (
                  <p className="text-sm text-text-muted">No applications yet.</p>
                ) : (
                  applications.map((app) => (
                    <div key={app.id} className="rounded-xl border border-border bg-bg-surface2 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text">{app.type}: {app.targetName}</p>
                        <span className="text-xs text-text-muted">{app.status} • {app.paidCredits} credits</span>
                      </div>
                      <p className="text-xs text-text-secondary">By {app.displayName} (@{app.username})</p>
                      <p className="mt-1 text-sm text-text-secondary">{app.message || ""}</p>
                      {app.status === "PENDING" ? (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => void reviewApplication(app.id, "APPROVED")} className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-black">
                            Approve
                          </button>
                          <button onClick={() => void reviewApplication(app.id, "REJECTED")} className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white">
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4 md:col-span-2">
              <h2 className="text-base font-semibold text-text">Website Branding & Server Setup</h2>
              <form onSubmit={saveBrandSettings} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={brandForm.websiteName} onChange={(e) => setBrandForm((v) => ({ ...v, websiteName: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Website name" />
                <input value={brandForm.discordInviteUrl} onChange={(e) => setBrandForm((v) => ({ ...v, discordInviteUrl: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Discord invite url" />
                <input value={brandForm.logoUrl} onChange={(e) => setBrandForm((v) => ({ ...v, logoUrl: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Logo image url" />
                <input value={brandForm.coverUrl} onChange={(e) => setBrandForm((v) => ({ ...v, coverUrl: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Cover image url" />
                <input type="number" value={brandForm.onlinePlayers} onChange={(e) => setBrandForm((v) => ({ ...v, onlinePlayers: Number(e.target.value || 0) }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Online players" />
                <input type="number" value={brandForm.maxPlayers} onChange={(e) => setBrandForm((v) => ({ ...v, maxPlayers: Number(e.target.value || 64) }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Max players" />
                <input type="number" value={brandForm.discordMemberCount} onChange={(e) => setBrandForm((v) => ({ ...v, discordMemberCount: Number(e.target.value || 0) }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Discord members" />
                <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text-secondary">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={brandForm.whitelistOpen} onChange={(e) => setBrandForm((v) => ({ ...v, whitelistOpen: e.target.checked }))} />Whitelist open</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={brandForm.isPublished} onChange={(e) => setBrandForm((v) => ({ ...v, isPublished: e.target.checked }))} />Published</label>
                </div>
                <textarea value={brandForm.summary} onChange={(e) => setBrandForm((v) => ({ ...v, summary: e.target.value }))} className="sm:col-span-2 min-h-16 rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Summary" />
                <textarea value={brandForm.description} onChange={(e) => setBrandForm((v) => ({ ...v, description: e.target.value }))} className="sm:col-span-2 min-h-24 rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Full website description" />
                <button className="sm:col-span-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Save Website Settings</button>
              </form>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Add Job Listing</h2>
              <form onSubmit={createJob} className="mt-3 space-y-2">
                <input value={jobForm.title} onChange={(e) => setJobForm((v) => ({ ...v, title: e.target.value }))} className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Job title" required />
                <textarea value={jobForm.description} onChange={(e) => setJobForm((v) => ({ ...v, description: e.target.value }))} className="min-h-20 w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Job description" />
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={jobForm.whitelistOnly} onChange={(e) => setJobForm((v) => ({ ...v, whitelistOnly: e.target.checked }))} />Whitelist required</label>
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Save Job</button>
              </form>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4">
              <h2 className="text-base font-semibold text-text">Admin / Moderator / User</h2>
              <form onSubmit={addMember} className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                <input value={memberForm.username} onChange={(e) => setMemberForm((v) => ({ ...v, username: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="username" required />
                <select value={memberForm.role} onChange={(e) => setMemberForm((v) => ({ ...v, role: e.target.value as "ADMIN" | "MODERATOR" | "USER" }))} className="rounded-xl border border-border bg-bg-surface2 px-2 py-2 text-sm text-text">
                  <option value="USER">User</option>
                  <option value="MODERATOR">Moderator</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white">Add</button>
              </form>
              <div className="mt-3 space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-xl border border-border bg-bg-surface2 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-text">{member.displayName}</p>
                      <p className="text-xs text-text-muted">@{member.username}</p>
                    </div>
                    <select value={member.role} onChange={(e) => void updateMemberRole(member.id, e.target.value as "ADMIN" | "MODERATOR" | "USER")} className="rounded-lg border border-border bg-bg-surface px-2 py-1 text-xs text-text">
                      <option value="USER">User</option>
                      <option value="MODERATOR">Moderator</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-4 md:col-span-2">
              <h2 className="text-base font-semibold text-text">Create VIP Package</h2>
              <form onSubmit={createVipPackage} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={vipForm.name} onChange={(e) => setVipForm((v) => ({ ...v, name: e.target.value }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="VIP package name" required />
                <input type="number" value={vipForm.priceCredits} onChange={(e) => setVipForm((v) => ({ ...v, priceCredits: Number(e.target.value || 0) }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Price in credits" min={1} />
                <input type="number" value={vipForm.durationDays} onChange={(e) => setVipForm((v) => ({ ...v, durationDays: Number(e.target.value || 30) }))} className="rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="Duration days" min={1} />
                <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Save VIP</button>
                <textarea value={vipForm.description} onChange={(e) => setVipForm((v) => ({ ...v, description: e.target.value }))} className="sm:col-span-2 min-h-20 rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text" placeholder="VIP package details" />
              </form>
            </div>

            {/* Auto-pilot PIN prompt */}
            {showAutoPrompt && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowAutoPrompt(false)}>
                <div className="w-80 rounded-xl border border-border bg-bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-bold text-text">Enter Auto-Pilot PIN</p>
                  <input
                    type="password"
                    autoFocus
                    value={autoPin}
                    onChange={(e) => setAutoPin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (autoPin === "4311") {
                          setShowAutoPrompt(false);
                          setShowAutoToggles(true);
                          autoProcessingRef.current.clear();
                        } else {
                          setAutoPin("");
                        }
                      }
                      if (e.key === "Escape") setShowAutoPrompt(false);
                    }}
                    className="w-full rounded-lg border border-border bg-bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-blue-500/50"
                    placeholder="PIN..."
                  />
                  <p className="text-[10px] text-text-muted">Press Enter to confirm, Escape to cancel</p>
                </div>
              </div>
            )}

            {/* Auto-pilot toggle menu */}
            {showAutoToggles && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowAutoToggles(false)}>
                <div className="w-80 rounded-xl border border-border bg-bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-bold text-text">Auto-Pilot Controls</p>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-text-secondary">Auto Bug Reports</span>
                      <button
                        onClick={() => { setAutoBugs((v) => !v); autoProcessingRef.current.clear(); }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoBugs ? "bg-emerald-500" : "bg-zinc-600"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoBugs ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-text-secondary">Auto Suggestions</span>
                      <button
                        onClick={() => { setAutoSuggestions((v) => !v); autoProcessingRef.current.clear(); }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSuggestions ? "bg-emerald-500" : "bg-zinc-600"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSuggestions ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAutoBugs(false); setAutoSuggestions(false); autoProcessingRef.current.clear(); setShowAutoToggles(false); }}
                      className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted hover:bg-bg-surface2"
                    >
                      Turn All Off
                    </button>
                    <button
                      onClick={() => setShowAutoToggles(false)}
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ Bug Reports & Suggestions Dashboard ═══════════ */}
            <div className="rounded-2xl border border-border bg-bg-surface md:col-span-2 overflow-hidden">

              {/* Dashboard Header — Sub-tabs */}
              <div className="flex items-stretch border-b border-border">
                {autoActive && (
                  <div className="flex items-center gap-2 px-4 border-r border-border cursor-pointer" onClick={() => setShowAutoToggles(true)}>
                    <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span></span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      Auto: {autoBugs && autoSuggestions ? "All" : autoBugs ? "Bugs" : "Suggestions"}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setAdminSubTab("bugs")}
                  className={`flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-colors relative ${
                    adminSubTab === "bugs"
                      ? "text-red-400"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-surface2/50"
                  }`}
                >
                  <Bug size={18} />
                  <span>Bug Reports</span>
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    adminSubTab === "bugs" ? "bg-red-500/15 text-red-400" : "bg-bg-surface2 text-text-muted"
                  }`}>{bugReports.length}</span>
                  {adminSubTab === "bugs" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-400" />}
                </button>
                <button
                  onClick={() => setAdminSubTab("suggestions")}
                  className={`flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-colors relative ${
                    adminSubTab === "suggestions"
                      ? "text-amber-400"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-surface2/50"
                  }`}
                >
                  <Lightbulb size={18} />
                  <span>Suggestions</span>
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    adminSubTab === "suggestions" ? "bg-amber-500/15 text-amber-400" : "bg-bg-surface2 text-text-muted"
                  }`}>{suggestions.length}</span>
                  {adminSubTab === "suggestions" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-400" />}
                </button>
                <button
                  onClick={() => setAdminSubTab("reports")}
                  className={`flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-colors relative ${
                    adminSubTab === "reports"
                      ? "text-rose-400"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-surface2/50"
                  }`}
                >
                  <AlertTriangle size={18} />
                  <span>Player Reports</span>
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    adminSubTab === "reports" ? "bg-rose-500/15 text-rose-400" : "bg-bg-surface2 text-text-muted"
                  }`}>{playerReports.length}</span>
                  {adminSubTab === "reports" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-400" />}
                </button>
              </div>

              {/* ───── BUG REPORTS PANEL ───── */}
              {adminSubTab === "bugs" && (
                <div>
                  {/* Stats Row */}
                  <div className="grid grid-cols-5 sm:grid-cols-10 border-b border-border">
                    {(["OPEN", "INVESTIGATING", "DIAGNOSED", "CANT_FIND", "NOT_A_BUG", "FIXING", "FIXED", "TESTING", "DEPLOYING", "RESOLVED", "FAILED", "DISMISSED"] as const).map((s) => {
                      const colorMap: Record<string, string> = {
                        OPEN: "text-zinc-400",
                        INVESTIGATING: "text-blue-400",
                        DIAGNOSED: "text-yellow-400",
                        CANT_FIND: "text-orange-400",
                        NOT_A_BUG: "text-rose-400",
                        FIXING: "text-purple-400",
                        FIXED: "text-emerald-400",
                        TESTING: "text-cyan-400",
                        DEPLOYING: "text-cyan-400",
                        RESOLVED: "text-emerald-500",
                        FAILED: "text-red-400",
                        DISMISSED: "text-zinc-500",
                      };
                      const pulseStatuses = ["INVESTIGATING", "FIXING", "TESTING", "DEPLOYING"];
                      const strobeStatuses = ["FIXED", "RESOLVED"];
                      const label: Record<string, string> = { CANT_FIND: "Can't Find", NOT_A_BUG: "Not a Bug" };
                      return (
                        <button
                          key={s}
                          onClick={() => setBugStatusFilter(bugStatusFilter === s ? "ALL" : s)}
                          className={`flex flex-col items-center gap-1 py-3 text-center transition-colors border-b-2 ${
                            bugStatusFilter === s
                              ? `${colorMap[s]} border-current bg-bg-surface2/50`
                              : "border-transparent text-text-muted hover:text-text-secondary hover:bg-bg-surface2/30"
                          }`}
                        >
                          <span className={`text-lg font-bold tabular-nums ${pulseStatuses.includes(s) && (bugStatusCounts[s] || 0) > 0 ? "animate-pulse" : ""} ${strobeStatuses.includes(s) && (bugStatusCounts[s] || 0) > 0 ? "animate-strobe text-emerald-400" : ""}`}>{bugStatusCounts[s] || 0}</span>
                          <span className="text-[9px] font-semibold uppercase tracking-wider">{label[s] || s}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Search + Sort Toolbar */}
                  <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={bugSearch}
                        onChange={(e) => setBugSearch(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg-surface2 pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                        placeholder="Search by title, description, or player name..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <SortAsc size={14} className="text-text-muted" />
                      <select
                        value={bugSortBy}
                        onChange={(e) => setBugSortBy(e.target.value as typeof bugSortBy)}
                        className="rounded-lg border border-border bg-bg-surface2 px-3 py-2 text-xs font-semibold text-text focus:outline-none"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="severity">Severity (Highest)</option>
                        <option value="player">Player Name (A-Z)</option>
                      </select>
                    </div>
                    {bugStatusFilter !== "ALL" && (
                      <button
                        onClick={() => setBugStatusFilter("ALL")}
                        className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                      >
                        <Filter size={12} />
                        {bugStatusFilter}
                        <span className="ml-1">&times;</span>
                      </button>
                    )}
                    <span className="text-xs text-text-muted">{filteredBugs.length} result{filteredBugs.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Bug List */}
                  <div className="divide-y divide-border">
                    {filteredBugs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                        <Bug size={32} className="mb-3 opacity-30" />
                        <p className="text-sm font-medium">
                          {bugReports.length === 0
                            ? "No bug reports yet"
                            : "No reports match your search"}
                        </p>
                        <p className="mt-1 text-xs opacity-60">
                          {bugReports.length === 0
                            ? "Players submit reports in-game by pressing F3"
                            : "Try adjusting your filters or search term"}
                        </p>
                      </div>
                    ) : (
                      filteredBugs.map((bug) => {
                        const isExpanded = expandedBug === bug.id;
                        const sevColor: Record<string, string> = {
                          CRITICAL: "bg-red-500 text-white",
                          HIGH: "bg-orange-500 text-white",
                          MEDIUM: "bg-yellow-500 text-black",
                          LOW: "bg-emerald-500 text-white",
                        };
                        const statusBadge: Record<string, string> = {
                          OPEN: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
                          INVESTIGATING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                          DIAGNOSED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                          CANT_FIND: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                          NOT_A_BUG: "bg-rose-500/15 text-rose-400 border-rose-500/30",
                          FIXING: "bg-purple-500/15 text-purple-400 border-purple-500/30",
                          FIXED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          TESTING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
                          DEPLOYING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
                          RESOLVED: "bg-emerald-600/15 text-emerald-500 border-emerald-600/30",
                          FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
                          DISMISSED: "bg-zinc-600/15 text-zinc-500 border-zinc-600/30",
                        };
                        return (
                          <div key={bug.id} className="group">
                            <button
                              onClick={() => setExpandedBug(isExpanded ? null : bug.id)}
                              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-surface2/40"
                            >
                              {/* Severity Badge */}
                              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black uppercase ${sevColor[bug.severity] || "bg-zinc-500 text-white"}`}>
                                {bug.severity === "CRITICAL" ? "!" : bug.severity[0]}
                              </span>
                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-text truncate">{bug.title}</h3>
                                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[bug.status] || "border-border text-text-muted"} ${["INVESTIGATING", "FIXING", "TESTING"].includes(bug.status) ? "animate-pulse" : ""}`}>
                                    {bug.status === "CANT_FIND" ? "Can't Find" : bug.status === "NOT_A_BUG" ? "Not a Bug" : bug.status}
                                  </span>
                                  {["FIXED", "RESOLVED"].includes(bug.status) && (
                                    <span className="flex items-center gap-1 text-emerald-400 animate-strobe" title="Fix applied — click to review">
                                      <Sparkles size={13} />
                                    </span>
                                  )}
                                  {hasFollowups(bug.description) && (
                                    <span className={`flex items-center gap-1 text-amber-400 ${hasUnreadFollowups(bug.description, bug.lastAiProcessedAt) ? "animate-strobe" : ""}`} title="Player added a follow-up — click to review">
                                      <MessageSquarePlus size={13} />
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                                  <span className="font-medium text-text-secondary">{bug.playerName}</span>
                                  <span>{new Date(bug.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                                  {bug.location ? <span className="truncate max-w-[140px]" title={bug.location}>{bug.location}</span> : null}
                                </div>
                              </div>
                              {/* Expand */}
                              {isExpanded ? <ChevronUp size={16} className="text-text-muted flex-shrink-0" /> : <ChevronDown size={16} className="text-text-muted flex-shrink-0" />}
                            </button>

                            {/* Expanded Detail */}
                            {isExpanded && (
                              <div className="bg-bg-surface2/30 px-5 pb-5 pt-1">
                                <div className="grid gap-4 md:grid-cols-2">
                                  {/* Left Column — Report Details */}
                                  <div className="space-y-4">
                                    <DescriptionWithFollowups text={bug.description} label="Description" lastAiProcessedAt={bug.lastAiProcessedAt} />
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Steps to Reproduce</p>
                                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{bug.stepsToRepro}</p>
                                    </div>
                                    {bug.expected ? (
                                      <div className="rounded-xl border border-border bg-bg-surface p-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Expected Behavior</p>
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{bug.expected}</p>
                                      </div>
                                    ) : null}
                                  </div>

                                  {/* Right Column — Admin Controls */}
                                  <div className="space-y-4">
                                    {/* Meta */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Details</p>
                                      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                                        <div>
                                          <span className="text-text-muted">Player</span>
                                          <p className="mt-0.5 font-semibold text-text">{bug.playerName}</p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Severity</span>
                                          <p className="mt-0.5"><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${sevColor[bug.severity] || "bg-zinc-500 text-white"}`}>{bug.severity}</span></p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Submitted</span>
                                          <p className="mt-0.5 font-medium text-text">{new Date(bug.createdAt).toLocaleString()}</p>
                                        </div>
                                        {bug.playerId ? (
                                          <div>
                                            <span className="text-text-muted">Player ID</span>
                                            <p className="mt-0.5 font-mono text-[11px] text-text-secondary truncate" title={bug.playerId}>{bug.playerId}</p>
                                          </div>
                                        ) : null}
                                        {bug.location ? (
                                          <div className="col-span-2">
                                            <span className="text-text-muted">Location</span>
                                            <p className="mt-0.5 font-medium text-text">{bug.location}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>

                                    {/* Team Actions */}
                                    {(bug.status === "FIXED" || bug.status === "RESOLVED") ? (
                                      <div className={`rounded-xl border p-4 space-y-3 ${hasUnreadFollowups(bug.description, bug.lastAiProcessedAt) ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                                        {hasUnreadFollowups(bug.description, bug.lastAiProcessedAt) && (
                                          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                            <MessageSquarePlus size={14} className="text-amber-400 animate-strobe" />
                                            <p className="text-xs font-bold text-amber-400">Player added new info — review and send back to team</p>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <Sparkles size={14} className="text-emerald-400 animate-strobe" />
                                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                            {bug.status === "RESOLVED" ? "Bug Resolved & Deployed" : "Fix Ready — Review & Deploy"}
                                          </p>
                                        </div>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                          {bug.status === "RESOLVED"
                                            ? "This bug has been fixed, deployed, and verified on the live server."
                                            : "The team has applied a fix. Click 'Apply to Server' to deploy it live, or add a note and send it back for revision."}
                                        </p>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                          {bug.status === "FIXED" && (
                                            <>
                                              <button
                                                onClick={() => void triggerBugAI(bug.id, "deploy")}
                                                disabled={aiActionLoading === `bug-${bug.id}-deploy` || backupRunning}
                                                className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                              >
                                                {aiActionLoading === `bug-${bug.id}-deploy` ? "Deploying..." : "Apply to Server"}
                                              </button>
                                              <button
                                                onClick={() => void triggerBugAI(bug.id, "verify")}
                                                disabled={aiActionLoading === `bug-${bug.id}-verify`}
                                                className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                              >
                                                {aiActionLoading === `bug-${bug.id}-verify` ? "Verifying..." : "Verify Fix"}
                                              </button>
                                            </>
                                          )}
                                          <button
                                            onClick={() => void updateBugStatus(bug.id, "DIAGNOSED")}
                                            className="rounded-lg bg-orange-500/15 border border-orange-500/30 px-4 py-2 text-xs font-bold text-orange-400 hover:bg-orange-500/25 transition-colors flex items-center gap-1.5"
                                          >
                                            <RotateCcw size={12} />
                                            Revise — Send Back to Team
                                          </button>
                                        </div>
                                        <p className="text-[10px] text-text-muted italic">
                                          Tip: Add notes below explaining what to change, then click Revise. The team will review your notes.
                                        </p>
                                        {aiActionFeedback && aiActionFeedback.id === bug.id && (
                                          <p className={`mt-2 text-xs font-semibold ${aiActionFeedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                                            {aiActionFeedback.msg}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-blue-400">Team Pipeline</p>
                                        <div className="flex flex-wrap gap-2">
                                          {bug.status === "NOT_A_BUG" && (
                                            <div className="w-full rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 mb-1">
                                              <p className="text-xs font-bold text-rose-400">Not a Bug — Feature Request</p>
                                              <p className="text-[10px] text-rose-300/70 mt-1">The team determined this system doesn&apos;t exist in the codebase. This is a feature request, not a bug.</p>
                                            </div>
                                          )}
                                          {(bug.status === "OPEN" || bug.status === "CANT_FIND" || bug.status === "NOT_A_BUG" || bug.status === "FAILED") && (
                                            <button
                                              onClick={() => void triggerBugAI(bug.id, "investigate")}
                                              disabled={aiActionLoading === `bug-${bug.id}-investigate`}
                                              className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 text-xs font-bold text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                            >
                                              {aiActionLoading === `bug-${bug.id}-investigate` ? "Sending..." : bug.status === "NOT_A_BUG" ? "Re-investigate" : "Send to Team Investigation"}
                                            </button>
                                          )}
                                          {bug.status === "NOT_A_BUG" && (
                                            <button
                                              onClick={() => void updateBugStatus(bug.id, "DISMISSED")}
                                              className="rounded-lg bg-zinc-600/15 border border-zinc-600/30 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-600/25 transition-colors"
                                            >
                                              Dismiss
                                            </button>
                                          )}
                                          {bug.status === "DIAGNOSED" && (
                                            <button
                                              onClick={() => void triggerBugAI(bug.id, "fix")}
                                              disabled={aiActionLoading === `bug-${bug.id}-fix` || backupRunning}
                                              className="rounded-lg bg-purple-500/15 border border-purple-500/30 px-3 py-1.5 text-xs font-bold text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                            >
                                              {aiActionLoading === `bug-${bug.id}-fix` ? "Sending..." : "Approve & Send Fix"}
                                            </button>
                                          )}
                                          {bug.status === "FAILED" && (
                                            <button
                                              onClick={() => void triggerBugAI(bug.id, "fix")}
                                              disabled={aiActionLoading === `bug-${bug.id}-fix` || backupRunning}
                                              className="rounded-lg bg-orange-500/15 border border-orange-500/30 px-3 py-1.5 text-xs font-bold text-orange-400 hover:bg-orange-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                            >
                                              {aiActionLoading === `bug-${bug.id}-fix` ? "Sending..." : "Retry Fix"}
                                            </button>
                                          )}
                                          {["INVESTIGATING", "FIXING", "TESTING", "DEPLOYING"].includes(bug.status) && (
                                            <span className="flex items-center gap-2 text-xs text-text-muted">
                                              <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                                              {bug.status === "DEPLOYING" ? "Deploying to server..." : "Team is working..."}
                                            </span>
                                          )}
                                        </div>
                                        {aiActionFeedback && aiActionFeedback.id === bug.id && (
                                          <p className={`mt-2 text-xs font-semibold ${aiActionFeedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                                            {aiActionFeedback.msg}
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Live Team Log */}
                                    {["INVESTIGATING", "FIXING", "TESTING"].includes(bug.status) && aiProgress[bug.id] && (
                                      <div className="rounded-xl border border-blue-500/30 bg-blue-950/30 overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-500/20">
                                          <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                            Live Team Output — {aiProgress[bug.id].action}
                                          </span>
                                          <span className="ml-auto text-[10px] text-text-muted">
                                            {new Date(aiProgress[bug.id].startedAt).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        <pre className="max-h-[300px] overflow-y-auto px-4 py-3 text-xs leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-words">
                                          {aiProgress[bug.id].output || "Waiting for Claude to start..."}
                                        </pre>
                                      </div>
                                    )}

                                    {/* Team Result Panels */}
                                    {bug.diagnosis && (
                                      <details open className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
                                        <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-yellow-400 hover:bg-yellow-500/10">
                                          Diagnosis
                                        </summary>
                                        <div className="border-t border-yellow-500/20 px-4 py-3">
                                          <FormattedResult text={bug.diagnosis} color="yellow" />
                                        </div>
                                      </details>
                                    )}
                                    {bug.fixResult && (
                                      <details open className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                                        <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10">
                                          Fix Result
                                        </summary>
                                        <div className="border-t border-emerald-500/20 px-4 py-3">
                                          <FormattedResult text={bug.fixResult} color="emerald" />
                                        </div>
                                      </details>
                                    )}
                                    {bug.testResult && (
                                      <details open className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 overflow-hidden">
                                        <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:bg-cyan-500/10">
                                          Test Result
                                        </summary>
                                        <div className="border-t border-cyan-500/20 px-4 py-3">
                                          <FormattedResult text={bug.testResult} color="cyan" />
                                        </div>
                                      </details>
                                    )}

                                    {/* Status Changer */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Manual Status</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(["OPEN", "DISMISSED"] as const).map((s) => (
                                          <button
                                            key={s}
                                            onClick={() => void updateBugStatus(bug.id, s)}
                                            disabled={bug.status === s}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                              bug.status === s
                                                ? `${statusBadge[s]} border cursor-default`
                                                : "border border-border bg-bg-surface2 text-text-muted hover:text-text hover:border-text-muted"
                                            }`}
                                          >
                                            {s === "OPEN" ? "Reset to Open" : "Dismiss"}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Admin Notes */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Admin Notes</p>
                                      <textarea
                                        defaultValue={bug.adminNotes || ""}
                                        ref={(el) => { if (el) bugNotesRef.current[bug.id] = el.value; }}
                                        onChange={(e) => { bugNotesRef.current[bug.id] = e.target.value; }}
                                        onBlur={(e) => {
                                          const val = e.target.value.trim();
                                          if (val !== (bug.adminNotes || "")) void updateBugNotes(bug.id, val);
                                        }}
                                        className="min-h-[80px] w-full rounded-lg border border-border bg-bg-surface2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/15"
                                        placeholder="Add internal notes, context, or resolution details..."
                                      />
                                    </div>

                                    {/* Comment Thread */}
                                    {viewerUserId && server && (
                                      <AdminCommentThread
                                        slug={slug}
                                        targetType="BUG"
                                        targetId={bug.id}
                                        currentUserId={viewerUserId}
                                        serverOwnerId={server.ownerId}
                                      />
                                    )}

                                    {/* Delete */}
                                    <button
                                      onClick={() => void deleteBug(bug.id)}
                                      className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors self-start"
                                    >
                                      <Trash2 size={12} />
                                      Delete Bug Report
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ───── SUGGESTIONS PANEL ───── */}
              {adminSubTab === "suggestions" && (
                <div>
                  {/* Stats Row */}
                  <div className="grid grid-cols-6 border-b border-border overflow-x-auto">
                    {(["NEW", "ANALYZING", "ANALYZED", "PLANNED", "IMPLEMENTING", "IMPLEMENTED", "VERIFYING", "DEPLOYING", "ADDED", "FAILED", "DECLINED"] as const).map((s) => {
                      const colorMap: Record<string, string> = {
                        NEW: "text-blue-400",
                        ANALYZING: "text-cyan-400",
                        ANALYZED: "text-yellow-400",
                        CANT_ANALYZE: "text-orange-400",
                        CONSIDERING: "text-yellow-400",
                        PLANNED: "text-purple-400",
                        IMPLEMENTING: "text-indigo-400",
                        IMPLEMENTED: "text-teal-400",
                        VERIFYING: "text-sky-400",
                        DEPLOYING: "text-cyan-400",
                        ADDED: "text-emerald-400",
                        FAILED: "text-red-400",
                        DECLINED: "text-zinc-500",
                      };
                      const pulseStatuses = ["ANALYZING", "IMPLEMENTING", "VERIFYING", "DEPLOYING"];
                      const strobeStatuses = ["IMPLEMENTED", "ADDED"];
                      return (
                        <button
                          key={s}
                          onClick={() => setSugStatusFilter(sugStatusFilter === s ? "ALL" : s)}
                          className={`flex flex-col items-center gap-1 py-3 text-center transition-colors border-b-2 min-w-[80px] ${
                            sugStatusFilter === s
                              ? `${colorMap[s]} border-current bg-bg-surface2/50`
                              : "border-transparent text-text-muted hover:text-text-secondary hover:bg-bg-surface2/30"
                          } ${pulseStatuses.includes(s) && (sugStatusCounts[s] || 0) > 0 ? "animate-pulse" : ""}`}
                        >
                          <span className={`text-lg font-bold tabular-nums ${strobeStatuses.includes(s) && (sugStatusCounts[s] || 0) > 0 ? "animate-strobe text-emerald-400" : ""}`}>{sugStatusCounts[s] || 0}</span>
                          <span className="text-[8px] font-semibold uppercase tracking-wider">{s.replace(/_/g, " ")}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Search + Sort Toolbar */}
                  <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={sugSearch}
                        onChange={(e) => setSugSearch(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg-surface2 pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="Search by title, description, or player name..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <SortAsc size={14} className="text-text-muted" />
                      <select
                        value={sugSortBy}
                        onChange={(e) => setSugSortBy(e.target.value as typeof sugSortBy)}
                        className="rounded-lg border border-border bg-bg-surface2 px-3 py-2 text-xs font-semibold text-text focus:outline-none"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="priority">Priority (Highest)</option>
                        <option value="player">Player Name (A-Z)</option>
                      </select>
                    </div>
                    {sugStatusFilter !== "ALL" && (
                      <button
                        onClick={() => setSugStatusFilter("ALL")}
                        className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20"
                      >
                        <Filter size={12} />
                        {sugStatusFilter.replace(/_/g, " ")}
                        <span className="ml-1">&times;</span>
                      </button>
                    )}
                    <span className="text-xs text-text-muted">{filteredSuggestions.length} result{filteredSuggestions.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Suggestion List */}
                  <div className="divide-y divide-border">
                    {filteredSuggestions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                        <Lightbulb size={32} className="mb-3 opacity-30" />
                        <p className="text-sm font-medium">
                          {suggestions.length === 0
                            ? "No suggestions yet"
                            : "No suggestions match your search"}
                        </p>
                        <p className="mt-1 text-xs opacity-60">
                          {suggestions.length === 0
                            ? "Players submit ideas in-game by pressing F3"
                            : "Try adjusting your filters or search term"}
                        </p>
                      </div>
                    ) : (
                      filteredSuggestions.map((sug) => {
                        const isExpanded = expandedSuggestion === sug.id;
                        const priColor: Record<string, string> = {
                          NEED_THIS: "bg-red-500 text-white",
                          REALLY_WANT: "bg-orange-500 text-white",
                          WOULD_BE_COOL: "bg-blue-500 text-white",
                          NICE_TO_HAVE: "bg-emerald-500 text-white",
                        };
                        const statusBadge: Record<string, string> = {
                          NEW: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                          ANALYZING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
                          ANALYZED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                          CANT_ANALYZE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                          CONSIDERING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                          PLANNED: "bg-purple-500/15 text-purple-400 border-purple-500/30",
                          IMPLEMENTING: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
                          IMPLEMENTED: "bg-teal-500/15 text-teal-400 border-teal-500/30",
                          VERIFYING: "bg-sky-500/15 text-sky-400 border-sky-500/30",
                          DEPLOYING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
                          ADDED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
                          DECLINED: "bg-zinc-600/15 text-zinc-500 border-zinc-600/30",
                        };
                        return (
                          <div key={sug.id} className="group">
                            <button
                              onClick={() => setExpandedSuggestion(isExpanded ? null : sug.id)}
                              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-surface2/40"
                            >
                              {/* Priority Badge */}
                              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs ${priColor[sug.priority] || "bg-zinc-500 text-white"}`}>
                                <Lightbulb size={16} />
                              </span>
                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-text truncate">{sug.title}</h3>
                                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[sug.status] || "border-border text-text-muted"} ${["ANALYZING", "IMPLEMENTING", "VERIFYING", "DEPLOYING"].includes(sug.status) ? "animate-pulse" : ""}`}>
                                    {sug.status.replace(/_/g, " ")}
                                  </span>
                                  {["IMPLEMENTED", "ADDED"].includes(sug.status) && (
                                    <span className="flex items-center gap-1 text-emerald-400 animate-strobe" title="Update ready — click to review">
                                      <Sparkles size={13} />
                                    </span>
                                  )}
                                  {["FIXED", "RESOLVED"].includes(sug.status) && (
                                    <span className="flex items-center gap-1 text-emerald-400 animate-strobe" title="Fix applied — click to review">
                                      <Sparkles size={13} />
                                    </span>
                                  )}
                                  {hasFollowups(sug.description) && (
                                    <span className={`flex items-center gap-1 text-amber-400 ${hasUnreadFollowups(sug.description, sug.lastAiProcessedAt) ? "animate-strobe" : ""}`} title="Player added a follow-up — click to review">
                                      <MessageSquarePlus size={13} />
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                                  <span className="font-medium text-text-secondary">{sug.playerName}</span>
                                  <span>{new Date(sug.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                                  <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${priColor[sug.priority] || "bg-zinc-500 text-white"}`}>{sug.priority.replace(/_/g, " ")}</span>
                                  {sug.category ? <span className="rounded-sm bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">{sug.category}</span> : null}
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp size={16} className="text-text-muted flex-shrink-0" /> : <ChevronDown size={16} className="text-text-muted flex-shrink-0" />}
                            </button>

                            {/* Expanded Detail */}
                            {isExpanded && (
                              <div className="bg-bg-surface2/30 px-5 pb-5 pt-1">
                                <div className="grid gap-4 md:grid-cols-2">
                                  {/* Left Column — Suggestion Details + Team Results */}
                                  <div className="space-y-4">
                                    <DescriptionWithFollowups text={sug.description} label="What They Want" lastAiProcessedAt={sug.lastAiProcessedAt} />
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">How It Should Work</p>
                                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{sug.howItWorks}</p>
                                    </div>
                                    {sug.whyItsGood ? (
                                      <div className="rounded-xl border border-border bg-bg-surface p-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Why It Would Be Good</p>
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{sug.whyItsGood}</p>
                                      </div>
                                    ) : null}

                                    {/* Team Analysis Result */}
                                    {sug.analysis && (
                                      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-cyan-400">Team Analysis</p>
                                        <FormattedResult text={sug.analysis} color="cyan" />
                                      </div>
                                    )}

                                    {/* Team Implementation Result */}
                                    {sug.implementationResult && (
                                      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-indigo-400">Implementation Result</p>
                                        <FormattedResult text={sug.implementationResult} color="indigo" />
                                      </div>
                                    )}

                                    {/* Team Verification Result */}
                                    {sug.verifyResult && (
                                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-400">Verification Result</p>
                                        <FormattedResult text={sug.verifyResult} color="emerald" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Right Column — Admin Controls */}
                                  <div className="space-y-4">
                                    {/* Meta */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Details</p>
                                      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                                        <div>
                                          <span className="text-text-muted">Player</span>
                                          <p className="mt-0.5 font-semibold text-text">{sug.playerName}</p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Priority</span>
                                          <p className="mt-0.5"><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${priColor[sug.priority] || "bg-zinc-500 text-white"}`}>{sug.priority.replace(/_/g, " ")}</span></p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Category</span>
                                          <p className="mt-0.5 font-semibold text-text">{sug.category || "—"}</p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Submitted</span>
                                          <p className="mt-0.5 font-medium text-text">{new Date(sug.createdAt).toLocaleString()}</p>
                                        </div>
                                        {sug.playerId ? (
                                          <div>
                                            <span className="text-text-muted">Player ID</span>
                                            <p className="mt-0.5 font-mono text-[11px] text-text-secondary truncate" title={sug.playerId}>{sug.playerId}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>

                                    {/* Team Pipeline */}
                                    {(sug.status === "IMPLEMENTED" || sug.status === "ADDED") ? (
                                      <div className={`rounded-xl border p-4 space-y-3 ${hasUnreadFollowups(sug.description, sug.lastAiProcessedAt) ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                                        {hasUnreadFollowups(sug.description, sug.lastAiProcessedAt) && (
                                          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                            <MessageSquarePlus size={14} className="text-amber-400 animate-strobe" />
                                            <p className="text-xs font-bold text-amber-400">Player added new info — review and send back to team</p>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <Sparkles size={14} className="text-emerald-400 animate-strobe" />
                                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                            {sug.status === "ADDED" ? "Added to Server" : "Implemented — Awaiting Review"}
                                          </p>
                                        </div>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                          {sug.status === "ADDED"
                                            ? "This suggestion has been implemented and verified. If something needs changing, add a note below and click Revise."
                                            : "The team has finished implementing this suggestion. You can verify it, or add a note and send it back for revision."}
                                        </p>
                                        <div className="flex flex-wrap gap-2 pt-1">
                                          {sug.status === "IMPLEMENTED" && (
                                            <>
                                              <button
                                                onClick={() => void triggerSuggestionAI(sug.id, "deploy")}
                                                disabled={aiActionLoading === `sug-${sug.id}-deploy` || backupRunning}
                                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                              >
                                                {aiActionLoading === `sug-${sug.id}-deploy` ? "Deploying..." : "Apply to Server"}
                                              </button>
                                              <button
                                                onClick={() => void triggerSuggestionAI(sug.id, "verify")}
                                                disabled={aiActionLoading === `sug-${sug.id}-verify`}
                                                className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                              >
                                                {aiActionLoading === `sug-${sug.id}-verify` ? "Verifying..." : "Verify Implementation"}
                                              </button>
                                            </>
                                          )}
                                          <button
                                            onClick={() => void updateSuggestionStatus(sug.id, "PLANNED")}
                                            className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-400 hover:bg-orange-500/20 transition-colors flex items-center gap-1.5"
                                          >
                                            <RotateCcw size={12} />
                                            Revise — Send Back to Team
                                          </button>
                                        </div>
                                        <p className="text-[10px] text-text-muted italic">
                                          Tip: Add notes below explaining what to change, then click Revise. The team will review your notes.
                                        </p>
                                        {aiActionFeedback && aiActionFeedback.id === sug.id && (
                                          <p className={`mt-2 text-xs font-semibold ${aiActionFeedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                                            {aiActionFeedback.msg}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-amber-500/30 bg-bg-surface p-4">
                                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-400">Team Pipeline</p>
                                        <div className="flex flex-wrap gap-2">
                                          {(sug.status === "NEW" || sug.status === "CANT_ANALYZE" || sug.status === "FAILED") && (
                                            <button
                                              onClick={() => void triggerSuggestionAI(sug.id, "analyze")}
                                              disabled={aiActionLoading === `sug-${sug.id}-analyze`}
                                              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                            >
                                              {aiActionLoading === `sug-${sug.id}-analyze` ? "Sending..." : "Send to Team Analysis"}
                                            </button>
                                          )}
                                          {sug.status === "ANALYZED" && (
                                            <button
                                              onClick={() => void updateSuggestionStatus(sug.id, "PLANNED")}
                                              className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-400 hover:bg-purple-500/20 transition-colors"
                                            >
                                              Approve &amp; Plan
                                            </button>
                                          )}
                                          {(sug.status === "PLANNED" || (sug.status === "FAILED" && sug.implementationResult)) && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                console.log("[Team Pipeline] Send to Team Implementation clicked for", sug.id, "status:", sug.status);
                                                void triggerSuggestionAI(sug.id, "implement");
                                              }}
                                              disabled={aiActionLoading === `sug-${sug.id}-implement` || backupRunning}
                                              className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                            >
                                              {aiActionLoading === `sug-${sug.id}-implement` ? "Sending..." : "Send to Team Implementation"}
                                            </button>
                                          )}
                                          {["ANALYZING", "IMPLEMENTING", "VERIFYING", "DEPLOYING"].includes(sug.status) && (
                                            <span className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-400 animate-pulse">
                                              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                                              {sug.status === "DEPLOYING" ? "Deploying to server..." : "Team Working..."}
                                            </span>
                                          )}
                                          {(sug.status === "CANT_ANALYZE" || sug.status === "FAILED") && (
                                            <button
                                              onClick={() => void updateSuggestionStatus(sug.id, "DECLINED")}
                                              className="rounded-lg border border-zinc-600/30 bg-zinc-600/10 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-600/20 transition-colors"
                                            >
                                              Dismiss
                                            </button>
                                          )}
                                        </div>
                                        {aiActionFeedback && aiActionFeedback.id === sug.id && (
                                          <p className={`mt-2 text-xs font-semibold ${aiActionFeedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                                            {aiActionFeedback.msg}
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Live Team Log */}
                                    {["ANALYZING", "IMPLEMENTING", "VERIFYING", "DEPLOYING"].includes(sug.status) && aiProgress[sug.id] && (
                                      <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-500/20">
                                          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                            Live Team Output — {aiProgress[sug.id].action}
                                          </span>
                                          <span className="ml-auto text-[10px] text-text-muted">
                                            {new Date(aiProgress[sug.id].startedAt).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        <pre className="max-h-[300px] overflow-y-auto px-4 py-3 text-xs leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-words">
                                          {aiProgress[sug.id].output || "Waiting for Claude to start..."}
                                        </pre>
                                      </div>
                                    )}

                                    {/* Manual Status */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Manual Status</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(["NEW", "CONSIDERING", "PLANNED", "ADDED", "DECLINED"] as const).map((s) => (
                                          <button
                                            key={s}
                                            onClick={() => void updateSuggestionStatus(sug.id, s)}
                                            disabled={sug.status === s}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                              sug.status === s
                                                ? `${statusBadge[s]} border cursor-default`
                                                : "border border-border bg-bg-surface2 text-text-muted hover:text-text hover:border-text-muted"
                                            }`}
                                          >
                                            {s.replace(/_/g, " ")}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Admin Notes */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Admin Notes</p>
                                      <textarea
                                        defaultValue={sug.adminNotes || ""}
                                        ref={(el) => { if (el) sugNotesRef.current[sug.id] = el.value; }}
                                        onChange={(e) => { sugNotesRef.current[sug.id] = e.target.value; }}
                                        onBlur={(e) => {
                                          const val = e.target.value.trim();
                                          if (val !== (sug.adminNotes || "")) void updateSuggestionNotes(sug.id, val);
                                        }}
                                        className="min-h-[80px] w-full rounded-lg border border-border bg-bg-surface2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/15"
                                        placeholder="Add internal notes, decisions, or implementation details..."
                                      />
                                    </div>

                                    {/* Comment Thread */}
                                    {viewerUserId && server && (
                                      <AdminCommentThread
                                        slug={slug}
                                        targetType="SUGGESTION"
                                        targetId={sug.id}
                                        currentUserId={viewerUserId}
                                        serverOwnerId={server.ownerId}
                                      />
                                    )}

                                    {/* Delete */}
                                    <button
                                      onClick={() => void deleteSuggestion(sug.id)}
                                      className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors self-start"
                                    >
                                      <Trash2 size={12} />
                                      Delete Suggestion
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ───── PLAYER REPORTS PANEL ───── */}
              {adminSubTab === "reports" && (
                <div>
                  {/* Stats Row */}
                  <div className="grid grid-cols-4 border-b border-border">
                    {(["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const).map((s) => {
                      const colorMap: Record<string, string> = {
                        OPEN: "text-rose-400",
                        INVESTIGATING: "text-yellow-400",
                        RESOLVED: "text-emerald-400",
                        DISMISSED: "text-zinc-500",
                      };
                      return (
                        <button
                          key={s}
                          onClick={() => setRepStatusFilter(repStatusFilter === s ? "ALL" : s)}
                          className={`flex flex-col items-center gap-1 py-3 text-center transition-colors border-b-2 ${
                            repStatusFilter === s
                              ? `${colorMap[s]} border-current bg-bg-surface2/50`
                              : "border-transparent text-text-muted hover:text-text-secondary hover:bg-bg-surface2/30"
                          }`}
                        >
                          <span className="text-lg font-bold tabular-nums">{repStatusCounts[s] || 0}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider">{s}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Search + Sort Toolbar */}
                  <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={repSearch}
                        onChange={(e) => setRepSearch(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg-surface2 pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-rose-500/50 focus:outline-none focus:ring-1 focus:ring-rose-500/20"
                        placeholder="Search by player name, reporter, reason, or description..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <SortAsc size={14} className="text-text-muted" />
                      <select
                        value={repSortBy}
                        onChange={(e) => setRepSortBy(e.target.value as typeof repSortBy)}
                        className="rounded-lg border border-border bg-bg-surface2 px-3 py-2 text-xs font-semibold text-text focus:outline-none"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="player">Reported Player (A-Z)</option>
                      </select>
                    </div>
                    {repStatusFilter !== "ALL" && (
                      <button
                        onClick={() => setRepStatusFilter("ALL")}
                        className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                      >
                        <Filter size={12} />
                        {repStatusFilter}
                        <span className="ml-1">&times;</span>
                      </button>
                    )}
                    <span className="text-xs text-text-muted">{filteredPlayerReports.length} result{filteredPlayerReports.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Player Report List */}
                  <div className="divide-y divide-border">
                    {filteredPlayerReports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                        <AlertTriangle size={32} className="mb-3 opacity-30" />
                        <p className="text-sm font-medium">
                          {playerReports.length === 0
                            ? "No player reports yet"
                            : "No reports match your search"}
                        </p>
                        <p className="mt-1 text-xs opacity-60">
                          {playerReports.length === 0
                            ? "Players submit reports in-game by pressing F3"
                            : "Try adjusting your filters or search term"}
                        </p>
                      </div>
                    ) : (
                      filteredPlayerReports.map((rep) => {
                        const isExpanded = expandedPlayerReport === rep.id;
                        const statusBadge: Record<string, string> = {
                          OPEN: "bg-rose-500/15 text-rose-400 border-rose-500/30",
                          INVESTIGATING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                          RESOLVED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          DISMISSED: "bg-zinc-600/15 text-zinc-500 border-zinc-600/30",
                        };
                        const reasons: string[] = Array.isArray(rep.reasons)
                          ? rep.reasons
                          : typeof rep.reasons === "string"
                            ? JSON.parse(rep.reasons as string)
                            : [];
                        return (
                          <div key={rep.id} className="group">
                            <button
                              onClick={() => setExpandedPlayerReport(isExpanded ? null : rep.id)}
                              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-surface2/40"
                            >
                              {/* Icon */}
                              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white">
                                <AlertTriangle size={16} />
                              </span>
                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-text truncate">Report: {rep.reportedPlayer}</h3>
                                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge[rep.status] || "border-border text-text-muted"}`}>
                                    {rep.status}
                                  </span>
                                  {hasFollowups(rep.description) && (
                                    <span className="flex items-center gap-1 text-amber-400 animate-strobe" title="Player added a follow-up — click to review">
                                      <MessageSquarePlus size={13} />
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                                  <span>by <span className="font-medium text-text-secondary">{rep.reporterName}</span></span>
                                  <span>{new Date(rep.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                                  {reasons.slice(0, 3).map((r) => (
                                    <span key={r} className="rounded-sm bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">{r}</span>
                                  ))}
                                  {reasons.length > 3 ? <span className="text-[10px] text-text-muted">+{reasons.length - 3} more</span> : null}
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp size={16} className="text-text-muted flex-shrink-0" /> : <ChevronDown size={16} className="text-text-muted flex-shrink-0" />}
                            </button>

                            {/* Expanded Detail */}
                            {isExpanded && (
                              <div className="bg-bg-surface2/30 px-5 pb-5 pt-1">
                                <div className="grid gap-4 md:grid-cols-2">
                                  {/* Left Column — Report Details */}
                                  <div className="space-y-4">
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Reasons</p>
                                      <div className="flex flex-wrap gap-2">
                                        {reasons.map((r) => (
                                          <span key={r} className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-1.5 text-xs font-bold text-rose-400">{r}</span>
                                        ))}
                                      </div>
                                    </div>
                                    <DescriptionWithFollowups text={rep.description} label="Description" />
                                    {rep.screenshots && rep.screenshots.length > 0 ? (
                                      <div className="rounded-xl border border-border bg-bg-surface p-4">
                                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Screenshots ({rep.screenshots.length})</p>
                                        <div className="flex flex-wrap gap-2">
                                          {(Array.isArray(rep.screenshots) ? rep.screenshots : JSON.parse(rep.screenshots as unknown as string)).map((src: string, i: number) => (
                                            <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                                              <img src={src} alt={`Screenshot ${i + 1}`} className="h-20 w-28 rounded-lg border border-border object-cover hover:opacity-80 transition-opacity" />
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  {/* Right Column — Admin Controls */}
                                  <div className="space-y-4">
                                    {/* Meta */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Details</p>
                                      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                                        <div>
                                          <span className="text-text-muted">Reported Player</span>
                                          <p className="mt-0.5 font-semibold text-text">{rep.reportedPlayer}</p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Reported By</span>
                                          <p className="mt-0.5 font-semibold text-text">{rep.reporterName}</p>
                                        </div>
                                        <div>
                                          <span className="text-text-muted">Submitted</span>
                                          <p className="mt-0.5 font-medium text-text">{new Date(rep.createdAt).toLocaleString()}</p>
                                        </div>
                                        {rep.reporterId ? (
                                          <div>
                                            <span className="text-text-muted">Reporter ID</span>
                                            <p className="mt-0.5 font-mono text-[11px] text-text-secondary truncate" title={rep.reporterId}>{rep.reporterId}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>

                                    {/* Status Changer */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Set Status</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const).map((s) => (
                                          <button
                                            key={s}
                                            onClick={() => void updatePlayerReportStatus(rep.id, s)}
                                            disabled={rep.status === s}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                              rep.status === s
                                                ? `${statusBadge[s]} border cursor-default`
                                                : "border border-border bg-bg-surface2 text-text-muted hover:text-text hover:border-text-muted"
                                            }`}
                                          >
                                            {s}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Admin Notes */}
                                    <div className="rounded-xl border border-border bg-bg-surface p-4">
                                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">Admin Notes</p>
                                      <textarea
                                        defaultValue={rep.adminNotes || ""}
                                        ref={(el) => { if (el) repNotesRef.current[rep.id] = el.value; }}
                                        onChange={(e) => { repNotesRef.current[rep.id] = e.target.value; }}
                                        onBlur={(e) => {
                                          const val = e.target.value.trim();
                                          if (val !== (rep.adminNotes || "")) void updatePlayerReportNotes(rep.id, val);
                                        }}
                                        className="min-h-[80px] w-full rounded-lg border border-border bg-bg-surface2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-rose-500/40 focus:outline-none focus:ring-1 focus:ring-rose-500/15"
                                        placeholder="Add internal notes, actions taken, or resolution details..."
                                      />
                                    </div>

                                    {/* Delete */}
                                    <button
                                      onClick={() => void deletePlayerReport(rep.id)}
                                      className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors self-start"
                                    >
                                      <Trash2 size={12} />
                                      Delete Report
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
