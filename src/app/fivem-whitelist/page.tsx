"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Loader2,
  Scale,
  Shield,
  Stethoscope,
  Users,
} from "lucide-react";

type Department = "POLICE" | "EMS" | "FIREFIGHTER" | "JUDGE" | "LAWYER";

interface FormState {
  displayName: string;
  discordTag: string;
  email: string;
  age: string;
  timezone: string;
  department: Department;
  availability: string;
  experience: string;
  scenarioResponse: string;
  motivation: string;
  knowsRules: boolean;
  agreesToPolicy: boolean;
  hasWorkingMic: boolean;
}

const initialForm: FormState = {
  displayName: "",
  discordTag: "",
  email: "",
  age: "",
  timezone: "",
  department: "POLICE",
  availability: "",
  experience: "",
  scenarioResponse: "",
  motivation: "",
  knowsRules: false,
  agreesToPolicy: false,
  hasWorkingMic: false,
};

export default function FivemWhitelistPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");

  const scenarioPrompt = useMemo(() => {
    if (form.department === "POLICE") {
      return "You arrive at a traffic stop where the driver is hostile and refuses commands. Walk us through your escalation and communication.";
    }
    if (form.department === "EMS") {
      return "You arrive at a crash with multiple injuries and one unconscious victim. Explain your triage and communication process.";
    }
    if (form.department === "FIREFIGHTER") {
      return "A house fire call comes in with possible occupants trapped inside. Explain your response priorities and scene coordination.";
    }
    if (form.department === "JUDGE") {
      return "You are presiding over a bail hearing with conflicting testimony. Explain how you keep legal RP fair and consistent.";
    }
    return "As a lawyer, your client is charged with armed robbery and claims illegal search. Explain your legal strategy and conduct.";
  }, [form.department]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessId("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/fivem/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          age: Number(form.age),
          website: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed.");
        return;
      }
      setSuccessId(data.application?.id || "");
      setForm(initialForm);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-cyan-500/20 bg-[#0b1020]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">HKC Roleplay</p>
            <h1 className="text-lg font-semibold text-white">Welcome to HKC Server</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#apply"
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Sign Up for Whitelist
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-[radial-gradient(1000px_500px_at_-10%_0%,rgba(14,165,233,0.25),transparent),radial-gradient(800px_500px_at_100%_-10%,rgba(59,130,246,0.2),transparent),#0c1224] p-6 sm:p-9">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-wide text-cyan-200">
            <Users size={12} />
            Serious RP Community
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-5xl">
            Build your story in HKC FiveM.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
            We run structured, realistic roleplay with active staff and department leadership. Join as Police, EMS,
            Firefighter, Judge, or Lawyer through whitelist.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="#apply" className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
              Apply Now
            </a>
            <a href="#rules" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-cyan-300/40">
              Read Rules
            </a>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <button type="button" onClick={() => setField("department", "POLICE")} className={`rounded-2xl border p-4 text-left ${form.department === "POLICE" ? "border-blue-400/70 bg-blue-500/15" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2"><Shield size={16} className="text-blue-300" /><span className="font-semibold">Police</span></div>
            <p className="mt-1 text-xs text-slate-300">Patrol, response, legal enforcement RP.</p>
          </button>
          <button type="button" onClick={() => setField("department", "EMS")} className={`rounded-2xl border p-4 text-left ${form.department === "EMS" ? "border-emerald-400/70 bg-emerald-500/15" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2"><Stethoscope size={16} className="text-emerald-300" /><span className="font-semibold">EMS</span></div>
            <p className="mt-1 text-xs text-slate-300">Triage, treatment, transport RP.</p>
          </button>
          <button type="button" onClick={() => setField("department", "FIREFIGHTER")} className={`rounded-2xl border p-4 text-left ${form.department === "FIREFIGHTER" ? "border-orange-400/70 bg-orange-500/15" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2"><Flame size={16} className="text-orange-300" /><span className="font-semibold">Firefighter</span></div>
            <p className="mt-1 text-xs text-slate-300">Fire/Rescue scene command RP.</p>
          </button>
          <button type="button" onClick={() => setField("department", "JUDGE")} className={`rounded-2xl border p-4 text-left ${form.department === "JUDGE" ? "border-violet-400/70 bg-violet-500/15" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2"><Scale size={16} className="text-violet-300" /><span className="font-semibold">Judge</span></div>
            <p className="mt-1 text-xs text-slate-300">Court fairness and legal process RP.</p>
          </button>
          <button type="button" onClick={() => setField("department", "LAWYER")} className={`rounded-2xl border p-4 text-left ${form.department === "LAWYER" ? "border-fuchsia-400/70 bg-fuchsia-500/15" : "border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-2"><Scale size={16} className="text-fuchsia-300" /><span className="font-semibold">Lawyer</span></div>
            <p className="mt-1 text-xs text-slate-300">Defense/prosecution and evidence RP.</p>
          </button>
        </section>

        <section id="rules" className="rounded-2xl border border-white/10 bg-[#0d1326] p-5">
          <h3 className="text-xl font-semibold text-white">Server Rules Snapshot</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>1. No fail-RP, no random deathmatch, no powergaming/metagaming.</li>
            <li>2. Stay in character during active scenes and use proper radio comms.</li>
            <li>3. Respect staff decisions and department SOP chains.</li>
            <li>4. Toxic behavior, discrimination, and trolling are instant review flags.</li>
            <li>5. Whitelist does not guarantee rank; training and probation may apply.</li>
          </ul>
        </section>

        <section id="apply" className="rounded-2xl border border-cyan-500/20 bg-[#0b1123] p-4 sm:p-6">
          <h3 className="text-2xl font-semibold text-white">Sign Up for Whitelist</h3>
          <p className="mt-1 text-sm text-slate-300">Fill this out like a real RP interview. Low-effort answers are rejected.</p>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Display Name</span>
                <input value={form.displayName} onChange={(e) => setField("displayName", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Discord Tag or ID</span>
                <input value={form.discordTag} onChange={(e) => setField("discordTag", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Email (optional)</span>
                <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Age</span>
                <input type="number" min={15} max={90} value={form.age} onChange={(e) => setField("age", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-300">Timezone</span>
              <input value={form.timezone} onChange={(e) => setField("timezone", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" required />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-300">Availability</span>
              <textarea value={form.availability} onChange={(e) => setField("availability", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 min-h-20" required />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-300">Previous RP Experience</span>
              <textarea value={form.experience} onChange={(e) => setField("experience", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 min-h-20" required />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-300">Scenario Response</span>
              <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{scenarioPrompt}</p>
              <textarea value={form.scenarioResponse} onChange={(e) => setField("scenarioResponse", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 min-h-24" required />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-300">Why should HKC whitelist you?</span>
              <textarea value={form.motivation} onChange={(e) => setField("motivation", e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#121727] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 min-h-20" required />
            </label>

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
              <label className="flex items-start gap-2"><input type="checkbox" checked={form.knowsRules} onChange={(e) => setField("knowsRules", e.target.checked)} className="mt-1" required /><span>I have read and understand HKC server rules.</span></label>
              <label className="flex items-start gap-2"><input type="checkbox" checked={form.agreesToPolicy} onChange={(e) => setField("agreesToPolicy", e.target.checked)} className="mt-1" required /><span>I agree to roleplay standards and admin enforcement.</span></label>
              <label className="flex items-start gap-2"><input type="checkbox" checked={form.hasWorkingMic} onChange={(e) => setField("hasWorkingMic", e.target.checked)} className="mt-1" required /><span>I have a working microphone and can communicate clearly.</span></label>
            </div>

            {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
            {successId && <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>Application submitted. Reference ID: {successId}</span></div>}

            <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

