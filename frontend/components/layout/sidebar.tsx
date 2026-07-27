"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Bot, ClipboardList, Wallet, Settings, Wand2, PlusCircle, ChevronLeft, ChevronRight, X } from "lucide-react";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: ClipboardList,   label: "Tasks",     href: "/tasks"     },
  { icon: Bot,             label: "Agents",    href: "/agents"    },
  { icon: Wand2,           label: "Builder",   href: "/builder"   },
  { icon: PlusCircle,      label: "Register",  href: "/register"  },
  { icon: Wallet,          label: "Payments",  href: "/payments"  },
  { icon: Settings,        label: "Settings",  href: "/settings"  },
];

interface Props { mobileOpen: boolean; onClose: () => void; }

export function Sidebar({ mobileOpen, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const content = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 h-14 border-b border-white/[0.05] flex-shrink-0 ${collapsed ? "justify-center" : ""}`}>
        <Link href="/" className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/10 hover:ring-cyan-500/30 transition-all">
          <Image src="/logo.png" alt="GuildNet" width={32} height={32} className="object-cover w-full h-full" />
        </Link>
        {!collapsed && (
          <Link href="/" className="min-w-0">
            <p className="font-bold text-[15px] gradient-text leading-none">GuildNet</p>
            <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide uppercase">Agent Network</p>
          </Link>
        )}
        <button onClick={onClose} className="ml-auto lg:hidden text-slate-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ icon: Icon, label, href }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} onClick={onClose}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                active
                  ? "bg-gradient-to-r from-cyan-500/[0.12] to-violet-500/[0.08] text-cyan-400"
                  : "text-slate-500 hover:text-white hover:bg-white/[0.04]"
              }`}>
              {/* Active indicator bar */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-cyan-400 to-violet-400" />
              )}
              <Icon style={{ width: 17, height: 17 }} className={`flex-shrink-0 transition-colors ${active ? "text-cyan-400" : "group-hover:text-cyan-400"}`} />
              {!collapsed && <span className="text-[13px] font-medium">{label}</span>}
              {active && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center p-3 border-t border-white/[0.05] text-slate-600 hover:text-white transition-colors hover:bg-white/[0.03]">
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </div>
  );

  return (
    <>
      <aside className={`hidden lg:flex flex-col border-r border-white/[0.05] transition-all duration-300 ${collapsed ? "w-[60px]" : "w-56"}`}
        style={{ background: "rgba(5,5,12,0.98)" }}>
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 h-full w-56 border-r border-white/[0.05] flex flex-col"
            style={{ background: "rgba(5,5,12,0.99)" }}>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
