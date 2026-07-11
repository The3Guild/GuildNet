"use client";

import { useState } from "react";
import { Award, ExternalLink, Copy, CheckCircle, AlertCircle, Send, Users, Github, FileText, Tag, Globe, Loader2 } from "lucide-react";

const TRACKS = [
  { id: "rwa-oracle", label: "RWA Oracle Agent with Verifiable On-Chain Identity", desc: "AI agent that scrapes off-chain data, runs risk assessment, and posts verified data on-chain via x402" },
  { id: "autonomous-agent", label: "Autonomous AI Agent", desc: "Fully autonomous agent that performs complex tasks without human intervention" },
  { id: "defi-agent", label: "DeFi Agent", desc: "Agent that interacts with DeFi protocols for trading, lending, or yield optimization" },
];

const DEFAULT_PROJECT = {
  name: "GuildNet — RWA Oracle Agents with Verifiable On-Chain Identity",
  desc: `GuildNet is a decentralized AI agent coordination network with verifiable on-chain identity and reputation, built for the Casper Agentic Buildathon.

AI agents self-register in an on-chain directory, get hired by a coordinator, execute work via Venice AI, settle payments through Casper's x402 Facilitator, and build a verifiable trust score — all without human intervention.

Key features:
• Three Odra smart contracts (AgentRegistry, AgentReputation, TaskCoordinator) deployed on Casper Testnet
• Real x402 micropayment flow via CSPR.cloud Facilitator (verify + settle)
• 6 specialized Venice AI agent types (research, risk, coding, design, audit, report)
• Verifiable on-chain reputation scoring with failure penalty weighting
• Full TypeScript backend coordinator with Express API
• Next.js frontend with CSPR.click wallet integration`,
  github: "https://github.com/anomalyco/GuildNet",
  track: "rwa-oracle",
  team: "",
};

export default function SubmitPage() {
  const [form, setForm] = useState({ ...DEFAULT_PROJECT });
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function buildSubmissionText(): string {
    return `# ${form.name}

## Track
${TRACKS.find(t => t.id === form.track)?.label ?? form.track}

## Description
${form.desc}

## GitHub Repository
${form.github}

${form.team ? `## Team Members\n${form.team}` : ""}

---

### Smart Contracts (Casper Testnet)
| Contract | Package Hash |
|---|---|
| AgentRegistry | \`hash-d99fca67a1671de057392109594fab2bb2f412643f7f6aa22ca0f297c60c00c3\` |
| AgentReputation | \`hash-87cb7a6c8e3a7a8fcc7aa1d4c0f8024859d54d300344ae8d53039b7f8ab11c69\` |
| TaskCoordinator | \`hash-2216cbbc233837a526e1b3b47ec1e1535258151ef779a1bd8476266898105ac1\` |

### Architecture
- Backend: TypeScript/Express (port 3000)
- Frontend: Next.js + CSPR.click wallet
- AI: Venice AI (6 agent types)
- Payments: x402 Facilitator (EIP-712)
- Blockchain: Casper Testnet (Odra Rust contracts)

### Links
- Explorer: https://testnet.cspr.live
- CSPR.click Wallet: https://wallet.cspr.click/`;
  }

  async function copySubmission() {
    const text = buildSubmissionText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      // Open the hackathon submission platform in a new tab
      window.open("https://www.casper.build/", "_blank", "noopener,noreferrer");
      await navigator.clipboard.writeText(buildSubmissionText());
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Submit to Hackathon</h1>
          <p className="text-sm text-slate-400 mt-1">Submit GuildNet to the Casper Agentic Buildathon 2026.</p>
        </div>
        {submitted && (
          <span className="tag tag-green flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3" /> Submission Ready
          </span>
        )}
      </div>

      {/* Progress steps */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-semibold">1</span>
            Fill details
          </span>
          <span className="text-slate-700">——</span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-slate-500 font-semibold">2</span>
            Review
          </span>
          <span className="text-slate-700">——</span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-slate-500 font-semibold">3</span>
            Submit
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 glass-card p-6 space-y-5">

          {/* Project Name */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1.5">
              <Award className="w-3 h-3" /> Project Name
            </label>
            <input value={form.name} onChange={e => update("name", e.target.value)}
              className="input-base px-3 py-2 text-sm" />
          </div>

          {/* Track */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1.5">
              <Tag className="w-3 h-3" /> Track
            </label>
            <div className="space-y-2">
              {TRACKS.map(t => (
                <button key={t.id} onClick={() => update("track", t.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${form.track === t.id
                    ? "border-cyan-500/40 bg-cyan-500/10"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}>
                  <p className="text-sm font-medium text-white">{t.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Description
            </label>
            <textarea value={form.desc} onChange={e => update("desc", e.target.value)}
              rows={10} className="input-base px-3 py-2 text-sm resize-y" />
          </div>

          {/* GitHub */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1.5">
              <Github className="w-3 h-3" /> GitHub Repository
            </label>
            <input value={form.github} onChange={e => update("github", e.target.value)}
              className="input-base px-3 py-2 text-sm font-mono" />
          </div>

          {/* Team */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Team Members
            </label>
            <textarea value={form.team} onChange={e => update("team", e.target.value)}
              placeholder="Name 1 — Role&#10;Name 2 — Role&#10;..."
              rows={3} className="input-base px-3 py-2 text-sm resize-y" />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button onClick={handleSubmit} disabled={submitting || !form.name || !form.desc}
              className="btn-primary flex-1 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? "Preparing..." : "Open Submission Platform"}
            </button>
            <button onClick={copySubmission} className="btn-ghost flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm">
              {copied ? <><CheckCircle className="w-4 h-4 text-green-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Details</>}
            </button>
          </div>

          {/* Success message */}
          {submitted && (
            <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">Submission details copied to clipboard!</p>
                <p className="text-xs text-slate-500 mt-1">The hackathon platform should open in a new tab. Paste the details there to complete your submission.</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Sidebar - Preview + Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Submission preview */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Submission Preview
            </h2>
            <pre className="text-xs text-green-300/80 bg-black/40 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {buildSubmissionText().slice(0, 600)}{buildSubmissionText().length > 600 ? "..." : ""}
            </pre>
          </div>

          {/* Quick links */}
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Links</h2>
            <a href="https://github.com/anomalyco/GuildNet" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors">
              <Github className="w-3.5 h-3.5" /> GitHub Repository <ExternalLink className="w-3 h-3 ml-auto" />
            </a>
            <a href="https://www.casper.build/" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors">
              <Globe className="w-3.5 h-3.5" /> Casper Buildathon <ExternalLink className="w-3 h-3 ml-auto" />
            </a>
            <a href="https://testnet.cspr.live/contract/hash-d99fca67a1671de057392109594fab2bb2f412643f7f6aa22ca0f297c60c00c3" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> AgentRegistry Explorer <ExternalLink className="w-3 h-3 ml-auto" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
