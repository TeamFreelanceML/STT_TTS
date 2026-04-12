"use client";

import { motion } from "framer-motion";
import { Settings, Shield, Bell, Cloud, Database, Cpu, Lock, Globe } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-3">
          System <span className="text-blue-500">Settings</span>
        </h1>
        <p className="text-zinc-500 mt-2 font-medium">Fine-tune your Story TTS orchestration and engine parameters.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <SettingsCard 
          title="API Configuration"
          description="Manage your production API keys and endpoint endpoints."
          icon={<Shield className="w-5 h-5 text-blue-400" />}
        />
        <SettingsCard 
          title="Engine Orchestration"
          description="Configure Celery workers, Redis parameters and job queues."
          icon={<Cpu className="w-5 h-5 text-amber-400" />}
        />
        <SettingsCard 
          title="Storage & Cache"
          description="Manage WAV file retention and Redis TTL settings."
          icon={<Database className="w-5 h-5 text-indigo-400" />}
        />
        <SettingsCard 
          title="Global Prefixes"
          description="Customize audio URL base and CDN integration."
          icon={<Globe className="w-5 h-5 text-emerald-400" />}
        />
      </div>

      <div className="glass rounded-[2rem] p-12 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
         <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600 shadow-inner">
            <Lock className="w-8 h-8" />
         </div>
         <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Advanced Controls Protected</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto font-medium">Some hardware-level settings are managed via core configuration files and restricted for this environment.</p>
         </div>
         <button className="px-8 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Request elevated access</button>
      </div>
    </div>
  );
}

function SettingsCard({ title, description, icon }: { title: string, description: string, icon: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-8 group hover:bg-zinc-900/60 transition-all border border-zinc-800/50 hover:border-zinc-700/80 cursor-pointer">
      <div className="flex items-start gap-5">
        <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-900 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner shrink-0">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-zinc-200 group-hover:text-white transition-colors tracking-tight">{title}</h3>
          <p className="text-xs text-zinc-500 font-medium leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
