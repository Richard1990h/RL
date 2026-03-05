"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Server, Users, Shield, X, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

type FivemServerCard = {
  id: string;
  slug: string;
  name: string;
  websiteName: string;
  summary: string | null;
  discordMemberCount: number;
  onlinePlayers: number;
  maxPlayers: number;
  whitelistOpen: boolean;
};

function getServerLogoUrl(server: FivemServerCard): string {
  if (server.name.toLowerCase().includes("hkc")) return "/fivem/hkc-logo.svg";
  return "/logo.png";
}

export default function FivemHubPage() {
  const { isLoggedIn } = useAuthStore();
  const [myServers, setMyServers] = useState<FivemServerCard[]>([]);
  const [allServers, setAllServers] = useState<FivemServerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createCostCredits, setCreateCostCredits] = useState(200);
  const [form, setForm] = useState({ name: "", websiteName: "", slug: "", summary: "" });
  const showInsufficientCreditsHint = error.toLowerCase().includes("insufficient credits");

  const discoverServers = useMemo(
    () => allServers.filter((server) => !myServers.some((mine) => mine.id === server.id)),
    [allServers, myServers],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [allRes, mineRes] = await Promise.all([
        fetch("/api/fivem/servers", { credentials: "include" }),
        isLoggedIn ? fetch("/api/fivem/servers?mine=1", { credentials: "include" }) : Promise.resolve(null),
      ]);

      const allData = await allRes.json();
      if (!allRes.ok) {
        setError(allData.error || "Failed to load FiveM servers.");
      } else {
        setAllServers(Array.isArray(allData.servers) ? allData.servers : []);
        if (typeof allData.websiteCreateCostCredits === "number") {
          setCreateCostCredits(allData.websiteCreateCostCredits);
        }
      }

      if (mineRes) {
        const mineData = await mineRes.json();
        if (mineRes.ok) {
          setMyServers(Array.isArray(mineData.servers) ? mineData.servers : []);
        }
      }
    } catch {
      setError("Network error while loading FiveM.");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const closeCreate = () => setShowCreateModal(false);
  const openCreate = () => {
    setError("");
    setShowCreateModal(true);
  };

  const createWithCredits = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Server name is required.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/fivem/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create FiveM website.");
        return;
      }
      setForm({ name: "", websiteName: "", slug: "", summary: "" });
      closeCreate();
      await loadData();
    } catch {
      setError("Network error while creating website.");
    } finally {
      setCreating(false);
    }
  };

  const saveServer = async (slug: string) => {
    try {
      const res = await fetch(`/api/fivem/servers/${encodeURIComponent(slug)}/save`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save server.");
        return;
      }
      await loadData();
    } catch {
      setError("Network error while saving server.");
    }
  };

  const renderServerCards = (servers: FivemServerCard[], mode: "my" | "discover") => {
    if (servers.length === 0) {
      return <div className="rounded-2xl border border-border bg-bg-surface p-5 text-sm text-text-muted">No servers yet.</div>;
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {servers.map((server) => (
          <div key={server.id} className="rounded-2xl border border-border bg-bg-surface p-4 transition-colors hover:border-primary/60">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/fivem/${server.slug}`} className="group flex min-w-0 flex-1 items-center gap-3">
                <img src={getServerLogoUrl(server)} alt={`${server.name} logo`} className="h-10 w-10 rounded-lg border border-border object-cover" />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-text">{server.websiteName || server.name}</h3>
                  <p className="truncate text-xs text-text-muted">{server.name}</p>
                </div>
              </Link>
              <Server size={16} className="text-text-muted group-hover:text-primary" />
            </div>
            <Link href={`/fivem/${server.slug}`} className="mt-2 block">
              <p className="line-clamp-2 text-sm text-text-secondary">{server.summary || "No summary added yet."}</p>
            </Link>
            <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1"><Users size={14} /> {server.onlinePlayers}/{server.maxPlayers}</span>
              <span className="inline-flex items-center gap-1"><Shield size={14} /> {server.whitelistOpen ? "Whitelist On" : "Whitelist Off"}</span>
            </div>
            <p className="mt-2 text-xs text-text-muted">Discord members: {server.discordMemberCount}</p>
            {mode === "discover" && isLoggedIn ? (
              <div className="mt-3 flex justify-end">
                <button onClick={() => void saveServer(server.slug)} className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
                  Add Server
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-full bg-bg p-4 pb-24 lg:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">RallyLive x FiveM</p>
          <h1 className="mt-2 text-2xl font-semibold text-text">My Servers</h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Manage your FiveM websites, staff roles, whitelist, VIP packages, and server presentation from one place.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text">My Servers</h2>
            {isLoggedIn ? (
              <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white">
                <Plus size={16} />
                Create FiveM Website
              </button>
            ) : null}
          </div>
          <div className="mt-3">
            {loading ? <div className="rounded-2xl border border-border bg-bg-surface2 p-4 text-sm text-text-muted">Loading...</div> : renderServerCards(myServers, "my")}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">Discover FiveM Servers</h2>
            <button onClick={() => void loadData()} className="text-xs text-text-muted hover:text-text">Refresh</button>
          </div>
          <div className="mt-3">
            {loading ? <div className="rounded-2xl border border-border bg-bg-surface2 p-4 text-sm text-text-muted">Loading...</div> : renderServerCards(discoverServers, "discover")}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            <p>{error}</p>
            {error.toLowerCase().includes("credits") ? (
              <Link href="/wallet" className="mt-1 inline-block text-xs underline">
                Buy credits in Wallet
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3 sm:items-center sm:justify-center">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-bg-surface p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text">Create FiveM Website</h3>
              <button onClick={closeCreate} className="rounded-lg p-1 text-text-muted hover:bg-bg-surface2">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <form onSubmit={createWithCredits} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Server Info</p>
                <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-primary" placeholder="Server name" required />
                <input value={form.websiteName} onChange={(e) => setForm((v) => ({ ...v, websiteName: e.target.value }))} className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-primary" placeholder="Website name" />
                <input value={form.slug} onChange={(e) => setForm((v) => ({ ...v, slug: e.target.value }))} className="w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-primary" placeholder="URL slug" />
                <textarea value={form.summary} onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} className="min-h-24 w-full rounded-xl border border-border bg-bg-surface2 px-3 py-2 text-sm text-text outline-none focus:border-primary" placeholder="Summary" />
                <button disabled={creating} className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {creating ? "Creating..." : `Create for ${createCostCredits} credits`}
                </button>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">How Credits Billing Works</p>
                <div className="rounded-xl border border-border bg-bg-surface2 p-3 text-sm text-text-secondary">
                  <p>Setup cost: <span className="font-semibold text-text">{createCostCredits} credits</span>.</p>
                  <p className="mt-1">Every 30 days we auto-charge <span className="font-semibold text-text">{createCostCredits} credits</span>.</p>
                  <p className="mt-1">If your balance is below {createCostCredits} at renewal time, the server is auto-hidden.</p>
                  <p className="mt-1">Top up credits in Wallet anytime to keep it active.</p>
                </div>
                {showInsufficientCreditsHint ? (
                  <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
                    <p className="font-semibold">You don&apos;t have enough credits.</p>
                    <p className="mt-1">Use the wallet button below to buy credits first.</p>
                    <div className="mt-2 inline-flex items-center gap-1 animate-pulse">
                      <span>Go here</span>
                      <ArrowRight size={14} />
                    </div>
                  </div>
                ) : null}
                <Link
                  href="/wallet"
                  className={`inline-flex rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    showInsufficientCreditsHint
                      ? "border-warning bg-warning/20 text-warning"
                      : "border-primary/40 text-primary hover:bg-primary/10"
                  }`}
                >
                  Go to Wallet to buy credits
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
