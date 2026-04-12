"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Mic2, History, Settings, Info, Sparkles } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Voice Registry", href: "/voices", icon: Mic2 },
    { name: "Narrate Story", href: "/narrate", icon: History },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-72 border-r border-white/5 bg-zinc-950/80 flex flex-col backdrop-blur-2xl relative z-50">
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent" />
      
      <div className="p-8 flex flex-col h-full">
        <div className="flex items-center gap-3 mb-12 group cursor-pointer">
          <div className="relative">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 group-hover:rotate-6 transition-transform duration-300 overflow-hidden">
               <Sparkles className="w-5 h-5" />
               <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-zinc-950 rounded-full border-2 border-zinc-900 flex items-center justify-center">
               <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-white leading-none">STORY<span className="text-blue-500">TTS</span></span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Admin Panel</span>
          </div>
        </div>

        <nav className="space-y-1.5 flex-1">
          <div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4 ml-3">Navigation</div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all group overflow-hidden border border-transparent",
                  isActive 
                    ? "text-blue-400 bg-blue-500/5 border-blue-500/10 shadow-sm" 
                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="active-nav"
                    className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                )}
                
                <item.icon className={cn(
                  "w-4 h-4 transition-transform group-hover:scale-110",
                  isActive ? "text-blue-400" : "text-zinc-600 group-hover:text-zinc-300"
                )} />
                <span className="relative z-10">{item.name}</span>

                {!isActive && (
                  <div className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-1 h-1 bg-zinc-700 rounded-full" />
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <div className="bg-gradient-to-b from-zinc-900/50 to-zinc-950/50 rounded-2xl p-4 border border-zinc-800/50 shadow-sm group hover:border-zinc-700 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 p-0.5">
                   <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center font-bold text-xs text-zinc-100">
                      AD
                   </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-zinc-200 truncate group-hover:text-white transition-colors">Administrator</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-black truncate mt-0.5">Production Engine</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-tighter text-zinc-500">
               <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50 text-center">API OK</div>
               <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50 text-center">V3.0</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
