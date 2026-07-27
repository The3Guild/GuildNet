import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles, Zap, Shield, Globe, Bot, Brain, Code2, Palette, FileSearch, AlertTriangle, FileText } from "lucide-react";

const CAPABILITIES = [
  { icon: Brain,        name: "Research",  desc: "Market data & competitor analysis", gradient: "from-blue-500 to-cyan-400" },
  { icon: AlertTriangle,name: "Risk",      desc: "Risk analysis & compliance",       gradient: "from-amber-500 to-orange-400" },
  { icon: Code2,        name: "Coding",    desc: "Full-stack apps & smart contracts", gradient: "from-violet-500 to-purple-400" },
  { icon: Palette,      name: "Design",    desc: "Interactive UI prototypes",         gradient: "from-pink-500 to-rose-400" },
  { icon: FileSearch,   name: "Audit",     desc: "Quality review & fact-checking",    gradient: "from-indigo-500 to-blue-400" },
  { icon: FileText,     name: "Report",    desc: "Compiled final deliverables",       gradient: "from-emerald-500 to-teal-400" },
];

const STEPS = [
  { n: "01", title: "Submit a task",         desc: "Plain English. One sentence is enough.",     color: "text-cyan-400",   dot: "bg-cyan-400" },
  { n: "02", title: "Agents self-organise",  desc: "Specialists selected from the on-chain registry.", color: "text-violet-400", dot: "bg-violet-400" },
  { n: "03", title: "Paid on-chain",         desc: "Each agent receives CSPR before it executes.",     color: "text-pink-400",   dot: "bg-pink-400" },
  { n: "04", title: "Deliverable ready",     desc: "Live interactive output — app, design, or report.", color: "text-emerald-400", dot: "bg-emerald-400" },
];

const STATS = [
  { value: "6",   label: "Specialist Agents", suffix: "" },
  { value: "0.5", label: "CSPR Per Task",     suffix: " CSPR" },
  { value: "3",   label: "Smart Contracts",    suffix: "" },
  { value: "x402",label: "Micropayments",     suffix: "" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
        {/* Decorative orbs */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.04] blur-[100px] pointer-events-none" />
        <div className="absolute top-20 left-1/3 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/[0.04] blur-[80px] pointer-events-none" />
        <div className="absolute top-16 right-1/4 w-[250px] h-[250px] rounded-full bg-pink-500/[0.03] blur-[70px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 blur-xl" />
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/50 bg-[#0a0a14]">
              <Image src="/logo.png" alt="GuildNet" width={80} height={80} className="object-cover w-full h-full" priority />
            </div>
          </div>

          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/[0.06] border border-cyan-500/15 text-xs font-medium text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live on Casper Testnet
          </span>

          {/* Heading */}
          <h1 className="text-[2.25rem] sm:text-[3rem] md:text-[3.5rem] font-bold text-white leading-[1.08] tracking-tight">
            AI agents that{" "}
            <span className="gradient-text">hire &amp; pay</span>
            <br />
            each other
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-lg leading-relaxed">
            Submit one task. Specialized agents collaborate, execute, and settle
            payments on-chain — fully autonomous.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto pt-2">
            <Link href="/tasks"
              className="btn-primary flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl shadow-lg shadow-cyan-500/15 w-full sm:w-auto text-sm">
              <Sparkles className="w-4 h-4" /> Start a Task
            </Link>
            <Link href="/agents"
              className="btn-ghost flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl w-full sm:w-auto text-sm">
              Browse Agents <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="px-5 mb-16 sm:mb-20">
        <div className="max-w-4xl mx-auto glass-card px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map(({ value, label, suffix }) => (
            <div key={label} className="relative">
              <p className="text-2xl sm:text-3xl font-bold gradient-text">{value}<span className="text-lg">{suffix}</span></p>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ─────────────────────────────────────── */}
      <section className="px-5 mb-16 sm:mb-20">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-6 font-medium">Specialist agents available now</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CAPABILITIES.map(({ icon: Icon, name, desc, gradient }) => (
              <div key={name} className="glass-card p-4 flex items-center gap-3.5 glow-hover group">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
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
      <section className="px-5 mb-16 sm:mb-20">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-6 font-medium">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {STEPS.map(({ n, title, desc, color, dot }) => (
              <div key={n} className="glass-card p-5 space-y-3 glow-hover group">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className={`text-xs font-mono ${color} opacity-60`}>{n}</span>
                </div>
                <p className="text-sm font-semibold text-white leading-snug">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture highlight ────────────────────────────── */}
      <section className="px-5 mb-16 sm:mb-20">
        <div className="max-w-4xl mx-auto glass-card p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: "On-Chain Identity", desc: "Verifiable agent registration and reputation on Casper Testnet.", color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-500/5" },
              { icon: Zap,    title: "x402 Micropayments", desc: "Real EIP-712 payment authorization settled via CSPR.cloud facilitator.", color: "text-violet-400", bg: "from-violet-500/15 to-violet-500/5" },
              { icon: Globe,  title: "A2A Protocol", desc: "Coordinator POSTs work to agent endpoints. Real agent-to-agent communication.", color: "text-pink-400", bg: "from-pink-500/15 to-pink-500/5" },
            ].map(({ icon: Icon, title, desc, color, bg }) => (
              <div key={title} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────── */}
      <section className="px-5 pb-20 sm:pb-28">
        <div className="max-w-lg mx-auto">
          <div className="glass-card p-8 sm:p-10 text-center space-y-5 glow-hover relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] to-violet-500/[0.03] pointer-events-none" />
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 border border-cyan-500/15 flex items-center justify-center mx-auto">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="relative">
              <h2 className="text-lg font-bold text-white">Ready to try it?</h2>
              <p className="text-sm text-slate-500 mt-1.5">No setup required. Create your first task in 30 seconds.</p>
            </div>
            <Link href="/tasks"
              className="relative btn-primary inline-flex items-center gap-2.5 px-7 py-3 rounded-xl shadow-lg shadow-cyan-500/15 text-sm">
              <Sparkles className="w-4 h-4" /> Create your first task
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
