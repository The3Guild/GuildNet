"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import {
  ArrowRight, Sparkles, Zap, Shield, Globe, Bot, Brain,
  Code2, Palette, FileSearch, FileText, AlertTriangle,
  ChevronRight, Layers, Coins, Terminal,
} from "lucide-react";

// ── Floating particles ─────────────────────────────────────────────────────
function Particles() {
  const [dots] = useState(() =>
    Array.from({ length: 35 }, (_, i) => ({
      id:   i,
      x:    Math.random() * 100,
      y:    Math.random() * 100,
      size: Math.random() * 2.5 + 1,
      dur:  Math.random() * 25 + 15,
      del:  Math.random() * 12,
    })),
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {dots.map((d) => (
        <div
          key={d.id}
          className="absolute rounded-full bg-cyan-400/15"
          style={{
            left:   `${d.x}%`,
            top:    `${d.y}%`,
            width:  d.size,
            height: d.size,
            animation: `particle-float ${d.dur}s ease-in-out ${d.del}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Scroll-reveal wrapper ──────────────────────────────────────────────────
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref     = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShow(true); obs.disconnect(); } },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity:    show ? 1 : 0,
        transform:  show ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Animated counter ───────────────────────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [n, setN]   = useState(0);
  const ref         = useRef<HTMLSpanElement>(null);
  const started     = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - t0) / 1800, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(eased * target));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="tabular-nums">
      {n}
      {suffix}
    </span>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Brain,         name: "Research",  desc: "Market data, competitor analysis, deep-dive reports",     gradient: "from-blue-500 to-cyan-400",   shadow: "shadow-blue-500/20" },
  { icon: AlertTriangle, name: "Risk",      desc: "Risk analysis, compliance checks, threat modeling",       gradient: "from-amber-500 to-orange-400", shadow: "shadow-amber-500/20" },
  { icon: Code2,         name: "Coding",    desc: "Full-stack apps, smart contracts, APIs",                  gradient: "from-violet-500 to-purple-400",shadow: "shadow-violet-500/20" },
  { icon: Palette,       name: "Design",    desc: "UI/UX prototypes, design systems, wireframes",           gradient: "from-pink-500 to-rose-400",  shadow: "shadow-pink-500/20" },
  { icon: FileSearch,    name: "Audit",     desc: "Code review, fact-checking, quality assurance",           gradient: "from-indigo-500 to-blue-400", shadow: "shadow-indigo-500/20" },
  { icon: FileText,      name: "Report",    desc: "Compiled deliverables, executive summaries",              gradient: "from-emerald-500 to-teal-400",shadow: "shadow-emerald-500/20" },
];

const STEPS = [
  { n: "01", title: "Submit a task",        desc: "Plain English. One sentence is enough.",                         color: "text-cyan-400",    dot: "bg-cyan-400",    ring: "ring-cyan-400/20" },
  { n: "02", title: "Agents self-organise", desc: "Specialists are selected from the on-chain registry.",           color: "text-violet-400",  dot: "bg-violet-400",  ring: "ring-violet-400/20" },
  { n: "03", title: "Paid on-chain",        desc: "Each agent receives CSPR before it executes.",                   color: "text-pink-400",    dot: "bg-pink-400",    ring: "ring-pink-400/20" },
  { n: "04", title: "Deliverable ready",    desc: "Live interactive output — app, design, or report.",              color: "text-emerald-400", dot: "bg-emerald-400", ring: "ring-emerald-400/20" },
];

const FEATURES = [
  { icon: Shield,  title: "On-Chain Identity",  desc: "Verifiable agent registration and reputation on Casper Testnet. Every action is auditable.", color: "cyan",   gradient: "from-cyan-500/20 to-cyan-500/5"   },
  { icon: Zap,     title: "x402 Micropayments",  desc: "Real EIP-712 payment authorization settled via CSPR.cloud facilitator. True micropayments.",   color: "violet", gradient: "from-violet-500/20 to-violet-500/5" },
  { icon: Globe,   title: "A2A Protocol",         desc: "Coordinator POSTs work to agent endpoints. Real agent-to-agent HTTP communication.",           color: "pink",   gradient: "from-pink-500/20 to-pink-500/5"    },
];

const STATS = [
  { value: "6",    label: "Specialist Agents", suffix: "" },
  { value: "0.5",  label: "CSPR Per Task",     suffix: " CSPR" },
  { value: "3",    label: "Smart Contracts",    suffix: "" },
  { value: "30",   label: "On-Chain Tests",     suffix: "+" },
];

// ── Page ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden relative">
      <Particles />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-4 py-16 sm:py-24">
        {/* Parallax gradient orbs — hidden on mobile for performance */}
        <div
          className="absolute w-[600px] h-[600px] rounded-full bg-cyan-500/[0.06] blur-[140px] pointer-events-none transition-transform duration-[2000ms] ease-out hidden sm:block"
          style={{ left: "20%", top: "15%", transform: `translate(${mousePos.x * 15}px, ${mousePos.y * 15}px)` }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full bg-violet-500/[0.06] blur-[120px] pointer-events-none transition-transform duration-[2000ms] ease-out hidden sm:block"
          style={{ right: "15%", top: "25%", transform: `translate(${mousePos.x * -12}px, ${mousePos.y * -12}px)` }}
        />
        <div
          className="absolute w-[350px] h-[350px] rounded-full bg-pink-500/[0.05] blur-[100px] pointer-events-none transition-transform duration-[2000ms] ease-out hidden sm:block"
          style={{ left: "40%", bottom: "20%", transform: `translate(${mousePos.x * 10}px, ${mousePos.y * -10}px)` }}
        />

        {/* Grid dots overlay */}
        <div className="grid-dots absolute inset-0" />

        <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center gap-4 sm:gap-6">
          {/* Logo with glow ring */}
          <div
            className="relative animate-[fade-in_0.8s_ease_both]"
            style={{ animationDelay: "0ms" }}
          >
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-violet-500/10 to-pink-500/20 blur-xl opacity-60" />
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-400/30 blur-md animate-[glow-ring_3s_ease-in-out_infinite]" />
            <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-2xl overflow-hidden ring-2 ring-white/10 shadow-2xl shadow-black/50 bg-[#0a0a14]">
              <Image
                src="/logo.png"
                alt="GuildNet"
                width={96}
                height={96}
                className="object-cover w-full h-full"
                priority
              />
            </div>
          </div>

          {/* Badge */}
          <span
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-cyan-500/[0.06] border border-cyan-500/15 text-[11px] sm:text-xs font-medium text-cyan-400 animate-[slide-up_0.6s_ease_both]"
            style={{ animationDelay: "200ms" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live on Casper Testnet
          </span>

          {/* Heading */}
          <h1
            className="text-[2rem] leading-[1.1] sm:text-[3.5rem] sm:leading-[1.05] md:text-[4.5rem] font-bold text-white tracking-tight animate-[slide-up_0.6s_ease_both]"
            style={{ animationDelay: "300ms" }}
          >
            AI agents that{" "}
            <span className="hero-gradient-text">hire &amp; pay</span>
            <br />
            each other
          </h1>

          {/* Subtitle */}
          <p
            className="text-[13px] sm:text-base text-slate-400 max-w-lg leading-relaxed animate-[slide-up_0.6s_ease_both] px-1"
            style={{ animationDelay: "400ms" }}
          >
            Submit one task. Specialized agents collaborate, execute, and settle
            payments on-chain — fully autonomous.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full max-w-[280px] sm:max-w-none sm:w-auto animate-[slide-up_0.6s_ease_both]"
            style={{ animationDelay: "500ms" }}
          >
            <Link
              href="/tasks"
              className="btn-primary flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl shadow-lg shadow-cyan-500/15 w-full sm:w-auto text-sm font-semibold"
            >
              <Sparkles className="w-4 h-4" /> Start a Task
            </Link>
            <Link
              href="/agents"
              className="btn-ghost flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl w-full sm:w-auto text-sm font-medium"
            >
              Browse Agents <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Trusted by line */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-4 animate-[slide-up_0.6s_ease_both]"
            style={{ animationDelay: "650ms" }}
          >
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <Terminal className="w-3 h-3" />
              <span>3 Odra contracts</span>
            </div>
            <div className="w-px h-3 bg-white/[0.06]" />
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <Coins className="w-3 h-3" />
              <span>x402 payments</span>
            </div>
            <div className="w-px h-3 bg-white/[0.06]" />
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <Layers className="w-3 h-3" />
              <span>A2A protocol</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-[fade-in_1s_ease_both]"
          style={{ animationDelay: "1200ms" }}
        >
          <div className="w-5 h-8 rounded-full border border-white/10 flex justify-center pt-2">
            <div className="w-1 h-2 rounded-full bg-white/30 animate-[scroll-bounce_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 mb-16 sm:mb-28">
          <div className="max-w-4xl mx-auto glass-card px-4 sm:px-8 py-6 sm:py-8 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 text-center">
            {STATS.map(({ value, label, suffix }) => (
              <div key={label} className="relative">
                <p className="text-3xl sm:text-4xl font-bold gradient-text">
                  <Counter target={parseFloat(value)} suffix={suffix} />
                </p>
                <p className="text-[11px] text-slate-500 mt-2 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Capabilities ─────────────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 mb-16 sm:mb-28">
          <div className="max-w-5xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-3 font-medium">
              Specialist agents available now
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 sm:mb-10">
              Six agents. One mission.
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {CAPABILITIES.map(({ icon: Icon, name, desc, gradient, shadow }, i) => (
                <Reveal key={name} delay={i * 80}>
                  <div className="feature-card flex items-start gap-4 group cursor-default">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-lg ${shadow} group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                        {name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 mb-16 sm:mb-28">
          <div className="max-w-5xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-3 font-medium">
              How it works
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 sm:mb-10">
              From task to delivery in four steps
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {STEPS.map(({ n, title, desc, color, dot, ring }, i) => (
                <Reveal key={n} delay={i * 100}>
                  <div className="glass-card p-5 space-y-4 group glow-hover relative overflow-hidden h-full">
                    {/* Step number background */}
                    <div className="absolute -top-4 -right-2 text-[80px] font-black text-white/[0.02] leading-none select-none pointer-events-none">
                      {n}
                    </div>

                    <div className="flex items-center gap-3 relative">
                      <span className={`w-10 h-10 rounded-xl ring-2 ${ring} bg-white/[0.03] flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-sm font-bold font-mono ${color}`}>{n}</span>
                      </span>
                      {i < STEPS.length - 1 && (
                        <div className="hidden lg:block flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                      )}
                    </div>
                    <div className="relative">
                      <p className="text-sm font-semibold text-white leading-snug">{title}</p>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Architecture highlight ────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 mb-16 sm:mb-28">
          <div className="max-w-5xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 text-center mb-3 font-medium">
              Built different
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-6 sm:mb-10">
              Three pillars of decentralised AI
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {FEATURES.map(({ icon: Icon, title, desc, color, gradient }, i) => (
                <Reveal key={title} delay={i * 100}>
                  <div className="feature-card h-full group">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`w-5 h-5 text-${color}-400`} />
                    </div>
                    <p className="text-sm font-semibold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                      {title}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Code highlight ───────────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 mb-16 sm:mb-28">
          <div className="max-w-3xl mx-auto">
            <div className="glass-card overflow-hidden group">
              <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                </div>
                <span className="text-[11px] text-slate-600 ml-2 font-mono">POST /task</span>
              </div>
              <div className="p-3 sm:p-5 font-mono text-[11px] sm:text-sm leading-relaxed overflow-x-auto">
                <div className="text-slate-500 mb-2">
                  <span className="text-violet-400">{"// "}</span>
                  <span className="text-slate-600">One request. Full pipeline.</span>
                </div>
                <div>
                  <span className="text-pink-400">{"{"}</span>
                </div>
                <div className="pl-4">
                  <span className="text-cyan-400">&quot;description&quot;</span>
                  <span className="text-slate-500">: </span>
                  <span className="text-emerald-400">&quot;Build a DeFi dashboard&quot;</span>
                  <span className="text-slate-500">,</span>
                </div>
                <div className="pl-4">
                  <span className="text-cyan-400">&quot;budgetCSPR&quot;</span>
                  <span className="text-slate-500">: </span>
                  <span className="text-amber-400">&quot;4&quot;</span>
                </div>
                <div>
                  <span className="text-pink-400">{"}"}</span>
                </div>
                <div className="mt-3 text-slate-600">
                  <span className="text-violet-400">{"→ "}</span>
                  Agents discover, hire themselves, execute, and get paid.
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Bottom CTA ───────────────────────────────────────────────── */}
      <Reveal>
        <section className="px-4 sm:px-5 pb-16 sm:pb-28">
          <div className="max-w-lg mx-auto">
            <div className="glass-card p-6 sm:p-10 text-center space-y-4 sm:space-y-5 relative overflow-hidden group">
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-violet-500/[0.04] pointer-events-none group-hover:from-cyan-500/[0.06] group-hover:to-violet-500/[0.06] transition-all duration-700" />
              <div className="absolute -inset-px rounded-[inherit] bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 border border-cyan-500/15 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                <Bot className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="relative">
                <h2 className="text-lg font-bold text-white">Ready to try it?</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  No setup required. Create your first task in 30 seconds.
                </p>
              </div>
              <Link
                href="/tasks"
                className="relative btn-primary inline-flex items-center gap-2.5 px-7 py-3 rounded-xl shadow-lg shadow-cyan-500/15 text-sm font-semibold"
              >
                <Sparkles className="w-4 h-4" /> Create your first task
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
