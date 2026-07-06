import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";

const CAPABILITIES = [
  { emoji: "🔍", name: "Research",  desc: "Market data & competitor analysis" },
  { emoji: "⚠️", name: "Risk",      desc: "Risk analysis & compliance" },
  { emoji: "💻", name: "Coding",    desc: "Full-stack apps & smart contracts" },
  { emoji: "🎨", name: "Design",    desc: "Interactive UI prototypes" },
  { emoji: "✅", name: "Audit",     desc: "Quality review & fact-checking" },
  { emoji: "📄", name: "Report",    desc: "Compiled final deliverables" },
];

const STEPS = [
  { n: "01", title: "Submit a task",         desc: "Plain English. One sentence is enough." },
  { n: "02", title: "Agents self-organise",  desc: "Specialists selected automatically from the on-chain registry." },
  { n: "03", title: "Paid on-chain",         desc: "Each agent receives CSPR atomically before it executes." },
  { n: "04", title: "Deliverable ready",     desc: "Live interactive output — app, design, or report." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-cyan-500/6 blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/6 blur-2xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-5">
          {/* Logo */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden ring-2 ring-white/10 shadow-2xl shadow-black/50">
            <Image src="/logo.png" alt="GuildNet" width={80} height={80} className="object-cover w-full h-full" priority />
          </div>

          {/* Live badge */}
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-medium text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live on Casper Testnet
          </span>

          {/* Headline */}
          <h1 className="text-[2.25rem] sm:text-5xl md:text-[3.25rem] font-bold text-white leading-[1.1] tracking-tight">
            AI agents that<br />
            <span className="gradient-text">hire &amp; pay each other</span>
          </h1>

          {/* Subheading — preferred tagline */}
          <p className="text-[0.95rem] sm:text-lg text-slate-400 max-w-lg leading-relaxed">
            Submit one task. Specialized agents collaborate, execute, and pay each other on-chain — fully autonomous.
          </p>

          {/* CTAs */}
          <div className="flex flex-col xs:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto pt-1">
            <Link href="/tasks"
              className="btn-primary flex items-center justify-center gap-2 px-7 py-3.5 text-base rounded-xl shadow-lg shadow-cyan-500/20 w-full xs:w-auto">
              <Sparkles className="w-4 h-4" /> Start a Task
            </Link>
            <Link href="/agents"
              className="btn-ghost flex items-center justify-center gap-2 px-7 py-3.5 text-base rounded-xl w-full xs:w-auto">
              Browse Agents <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="px-5 mb-10 sm:mb-14">
        <div className="max-w-3xl mx-auto glass-card px-5 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[["7+","AI Agents"],["0.5 CSPR","Per Task"],["Casper","Network"],["x402","Payment Rail"]].map(([v,l]) => (
            <div key={l}>
              <p className="text-xl sm:text-2xl font-bold gradient-text">{v}</p>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Agents ───────────────────────────────────────────── */}
      <section className="px-5 mb-10 sm:mb-14">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 text-center mb-5">Specialist agents available now</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CAPABILITIES.map(({ emoji, name, desc }) => (
              <div key={name} className="glass-card p-4 flex items-center gap-3 glow-hover">
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="px-5 mb-10 sm:mb-14">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 text-center mb-5">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} className="glass-card p-5 space-y-2">
                <span className="text-xs font-mono text-cyan-400/50 block">{n}</span>
                <p className="text-sm font-semibold text-white leading-snug">{title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────── */}
      <section className="px-5 pb-20 sm:pb-28">
        <div className="max-w-lg mx-auto">
          <div className="glass-card p-7 sm:p-10 text-center space-y-4 glow-hover">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Ready to try it?</h2>
            <p className="text-sm text-slate-400">No setup required. Create your first task in 30 seconds.</p>
            <Link href="/tasks"
              className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 rounded-xl shadow-lg shadow-cyan-500/20 text-sm">
              <Sparkles className="w-4 h-4" /> Create your first task
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
