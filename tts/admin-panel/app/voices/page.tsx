"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Search, Play, AlertCircle, Sparkles, Filter, ChevronRight, Zap, Download } from "lucide-react";
import Loader from "@/components/Loader";
import { getVoices, narrateWord, Voice, API_BASE_URL } from "@/utils/api";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [previewText, setPreviewText] = useState("Hello! This is a preview of my voice synthesis. I hope you like how I sound!");
  const [previewWpm, setPreviewWpm] = useState(140);

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [anyPreviewing, setAnyPreviewing] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({}); // voiceId -> audioUrl
  const [lastMetadata, setLastMetadata] = useState<Record<string, any>>({}); // voiceId -> last JSON resp

  useEffect(() => {
    async function loadVoices() {
      try {
        const data = await getVoices();
        setVoices(data.voices);
      } catch (err) {
        console.error(err);
        setError("Could not connect to the TTS backend. Please ensure the API is running on port 8001.");
      } finally {
        setIsLoading(false);
      }
    }
    loadVoices();
  }, []);

  const handlePreview = async (voiceId: string) => {
    if (anyPreviewing) return;
    setPreviewingId(voiceId);
    setAnyPreviewing(true);
    try {
      const resp = await narrateWord({
        voice: { voice_id: voiceId, language: "en-US" },
        speech_config: { wpm: previewWpm },
        word: previewText
      });

      const url = `${API_BASE_URL}${resp.audio.url}`;
      const audio = new Audio(url);
      audio.play();
      
      setPreviews(prev => ({ ...prev, [voiceId]: url }));
      setLastMetadata(prev => ({ ...prev, [voiceId]: resp.metadata }));
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPreviewingId(null);
      setAnyPreviewing(false);
    }
  };

  const categories = useMemo(() => ["all", ...new Set(voices.map(v => v.category).filter(Boolean))], [voices]);

  const filteredVoices = useMemo(() => 
    voices.filter(v => 
      (category === "all" || (v.category && v.category.toLowerCase() === category.toLowerCase())) &&
      ((v.display_name?.toLowerCase().includes(search.toLowerCase()) || 
        v.voice_name?.toLowerCase().includes(search.toLowerCase()) || 
        v.description?.toLowerCase().includes(search.toLowerCase()) ||
        v.client_voice_id.toLowerCase().includes(search.toLowerCase())))
    ),
    [voices, category, search]
  );

  if (isLoading) return <Loader label="Accessing Voice Registry..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 glass rounded-3xl text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-black text-white">Registry Offline</h3>
        <p className="text-zinc-500 mt-2 max-w-md font-medium leading-relaxed">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-white/5"
        >
          Try Reconnecting
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      <header className="flex flex-col gap-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Voice <span className="text-blue-500 focus:outline-none">Registry</span>
            </h1>
            <p className="text-zinc-500 mt-2 font-medium">Explore and audition professional Kokoro synthesizer profiles.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search profiles..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-zinc-950/50 border border-zinc-900 focus:border-blue-500/50 rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none transition-all w-64 md:w-80 shadow-inner"
              />
            </div>
            
            <div className="relative group">
               <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                  <Filter className="w-3.5 h-3.5 text-zinc-500" />
               </div>
               <select 
                 value={category}
                 onChange={(e) => setCategory(e.target.value)}
                 className="bg-zinc-950/50 border border-zinc-900 rounded-2xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer appearance-none shadow-inner"
               >
                 {categories.map(cat => (
                   <option key={cat} value={cat}>
                     {cat === "all" ? "All Categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                   </option>
                 ))}
               </select>
               <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-r border-b border-zinc-600 rotate-45 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="glass rounded-3xl p-8 relative group overflow-hidden shadow-2xl shadow-blue-500/5">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/30 group-hover:bg-blue-500 transition-colors" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex-1 space-y-4">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Audition Script Configuration
              </label>
              <div className="flex flex-col xl:flex-row gap-4">
                <div className="flex-1 bg-zinc-950/50 border border-zinc-800 focus-within:border-blue-500/50 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all shadow-inner">
                  <input 
                    type="text" 
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Enter custom text for real-time synthesis..."
                    className="flex-1 bg-transparent text-sm text-zinc-200 outline-none font-medium"
                  />
                  <div className="h-8 w-px bg-zinc-800 shrink-0" />
                  <div className="flex items-center gap-4 shrink-0 pr-1">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">Velocity (WPM)</span>
                       <span className="text-sm font-black text-blue-400 tabular-nums">{previewWpm}</span>
                    </div>
                    <input 
                      type="range"
                      min="80"
                      max="240"
                      step="10"
                      value={previewWpm}
                      onChange={(e) => setPreviewWpm(parseInt(e.target.value))}
                      className="w-32 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredVoices.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-900 rounded-3xl"
            >
              <Mic className="w-12 h-12 mb-4 opacity-10" />
              <p className="font-bold text-lg">No matching voices found</p>
              <button 
                onClick={() => { setSearch(""); setCategory("all"); }}
                className="mt-4 text-blue-500 text-xs font-black uppercase tracking-widest hover:text-blue-400 transition-colors"
              >
                Reset Search Filters
              </button>
            </motion.div>
          ) : (
            filteredVoices.map((voice) => (
              <VoiceCard 
                key={voice.client_voice_id}
                voice={voice}
                previewingId={previewingId}
                anyPreviewing={anyPreviewing}
                previewUrl={previews[voice.client_voice_id]}
                metadata={lastMetadata[voice.client_voice_id]}
                onPreview={handlePreview}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function VoiceCard({ 
  voice, 
  previewingId, 
  anyPreviewing, 
  previewUrl,
  metadata,
  onPreview 
}: { 
  voice: Voice, 
  previewingId: string | null, 
  anyPreviewing: boolean, 
  previewUrl?: string,
  metadata?: any,
  onPreview: (id: string) => void 
}) {
  const isPreviewing = previewingId === voice.client_voice_id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="group glass rounded-3xl p-7 flex flex-col hover:bg-zinc-900/60 hover:border-zinc-700/80 transition-all duration-300 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl -mr-12 -mt-12 group-hover:bg-blue-500/10 transition-colors" />
      
      <div className="flex items-start justify-between mb-6">
        <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600 group-hover:text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner">
          <Mic className="w-7 h-7" />
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-[9px] items-center uppercase font-black tracking-widest">
          <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 fill-current" />
            Sync
          </div>
          <Badge text={voice.category} variant="blue" />
          <Badge text={voice.gender} variant="zinc" />
          {voice.age && <Badge text={voice.age} variant="zinc" />}
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
           <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
           <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors leading-none tracking-tight">
             {voice.display_name || voice.voice_name || voice.client_voice_id || "Unnamed Voice"}
           </h3>
        </div>
        <p className="text-zinc-500 text-xs mt-3 line-clamp-2 min-h-[3.25rem] leading-relaxed font-medium">
          {voice.description || "Synthesizer profile tuned for high-fidelity narration and expressive storytelling."}
        </p>
      </div>
      
      {metadata && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800/50 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
             <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Metadata Inspector</span>
             <span className="text-[8px] text-zinc-600 font-mono">ONE-SHOT PROTOCOL V1.0</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1">
                <p className="text-[8px] text-zinc-500 font-black uppercase tracking-tighter">WPM</p>
                <p className="text-xs font-bold text-zinc-300 tabular-nums">{metadata.wpm}</p>
             </div>
             <div className="space-y-1">
                <p className="text-[8px] text-zinc-500 font-black uppercase tracking-tighter">Voice ID</p>
                <p className="text-xs font-bold text-zinc-300 font-mono truncate">{metadata.voice_id}</p>
             </div>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800/50">
             <p className="text-[8px] text-zinc-500 font-black uppercase tracking-tighter mb-1">Payload Sample</p>
             <div className="bg-black/40 p-2 rounded-lg text-[10px] text-zinc-500 font-mono break-all leading-tight border border-white/5">
                {JSON.stringify({ metadata }, null, 1)}
             </div>
          </div>
        </motion.div>
      )}

      <div className="mt-8 pt-6 border-t border-zinc-800/50 flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest font-mono">Registry ID</p>
          <div className="text-[11px] text-zinc-400 font-bold font-mono tracking-tighter flex items-center gap-2">
             {voice.client_voice_id}
             <div className="w-1 h-1 bg-zinc-800 rounded-full" />
             <span className="text-blue-500/60 uppercase">V3.0</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {previewUrl && (
                <a 
                href={previewUrl}
                download={`${voice.display_name || voice.voice_name}.wav`}
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all shadow-lg active:scale-95 group/dl"
                title="Download Audition Clip"
                >
                <Download className="w-4 h-4 group-hover/dl:translate-y-0.5 transition-transform" />
                </a>
            )}
            <button 
            disabled={anyPreviewing}
            onClick={() => onPreview(voice.client_voice_id)}
            className="relative flex items-center justify-center w-12 h-12 bg-zinc-950 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-950 disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl border border-zinc-800 transition-all duration-300 shadow-lg active:scale-95 group/btn"
            >
            {isPreviewing ? (
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
                <Play className="w-4 h-4 fill-current group-hover/btn:translate-x-0.5" />
            )}
            </button>
        </div>
      </div>
    </motion.div>
  );
}

function Badge({ text, variant }: { text: string, variant: 'blue' | 'zinc' }) {
  const styles = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    zinc: "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"
  };
  
  return (
    <span className={`px-2.5 py-1 rounded-lg border font-black whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px] ${styles[variant]}`}>
      {text}
    </span>
  );
}
