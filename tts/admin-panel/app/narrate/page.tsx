"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, FileText, Settings2, Sparkles, CheckCircle2, Music, 
  Play, ExternalLink, RefreshCcw, Info, Plus, Trash2, Code, ChevronDown, ChevronUp 
} from "lucide-react";
import Loader from "@/components/Loader";
import SynthesisLoader from "@/components/SynthesisLoader";
import { Reader } from "@/components/Reader";
import { getVoices, submitNarration, pollNarration, Voice, NarrationRequest, NarrationResponse } from "@/utils/api";
import { useRouter } from "next/navigation";

const BEAR_TEMPLATE = [
  "It is the first warm day of spring. [...] A mother bear slowly peeks out of a hollow tree trunk [...] on the side of a quiet mountain. [...] She and her two cubs have slept all winter. [...] The cubs drank milk from their mother [...] but the mother bear ate nothing. [...] She is very hungry.",
  "The cubs blink in the bright sunlight [...] and tumble out of the tree behind her. [...] The snow is melting [...] and tiny streams of water trickle down the rocks. [...] The air smells fresh [...] and full of new life. [...] The mother bear listens carefully... [...] making sure the forest is safe.",
  "She leads her cubs down the mountain path [...] toward a river she remembers. [...] Along the way she digs into the soft ground for roots [...] and turns over fallen logs to find insects. [...] The cubs watch her closely [...] learning how to search and how to survive.",
  "At last they reach the rushing river. [...] Silver fish swim beneath the clear water. [...] With a quick and powerful swipe [...] the mother bear catches one. [...] The cubs squeal with excitement [...] as she shares the meal. [...] Spring has begun [...] and their new season of life together is just starting."
];

export default function NarratePage() {
  const [paragraphs, setParagraphs] = useState<string[]>([""]);
  const [storyId, setStoryId] = useState<number>(0);
  const [storyName, setStoryName] = useState<string>("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(140);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<NarrationResponse | null>(null);
  const [showJson, setShowJson] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const router = useRouter();

  useEffect(() => {
    generateMetadata();
    async function loadVoices() {
      try {
        const data = await getVoices();
        setVoices(data.voices);
        if (data.voices.length > 0) {
          setVoice(data.voices[0].client_voice_id);
        }
      } catch (err) {
        console.error("Failed to load voices:", err);
      } finally {
        setIsLoadingVoices(false);
      }
    }
    loadVoices();
  }, []);

  const generateMetadata = () => {
    const id = Math.floor(Math.random() * 10000);
    setStoryId(id);
    setStoryName(`Narration Job #${id}`);
  };

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPayload: NarrationRequest = useMemo(() => ({
    story: { id: storyId, name: storyName },
    voice: { voice_id: voice, language: "en-US" },
    speech_config: { wpm: speed },
    text: { 
      story_text: paragraphs
        .filter(p => p.trim())
        .map((p, i) => ({ para_id: i, para_text: p })) 
    },
    output_config: { include_word_timestamps: true, include_chunk_timestamps: true }
  }), [storyId, storyName, voice, speed, paragraphs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paragraphs.every(p => !p.trim())) {
      setError("Please enter at least one paragraph of text.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setAudioUrl(null);
    setJobId(null);
    setCurrentResponse({ job_id: "pending", status: "pending" });

    try {
      const { job_id } = await submitNarration(requestPayload);
      router.push("/");
    } catch (err) {
      console.error(err);
      setError("Failed to synthesize story. Please check backend availability.");
      setIsSubmitting(false);
    }
  };

  const updateParagraph = (index: number, value: string) => {
    const newParas = [...paragraphs];
    newParas[index] = value;
    setParagraphs(newParas);
  };

  const addParagraph = () => {
    setParagraphs([...paragraphs, ""]);
  };

  const removeParagraph = (index: number) => {
    if (paragraphs.length <= 1) return;
    setParagraphs(paragraphs.filter((_, i) => i !== index));
  };

  if (isSubmitting) {
    return (
      <SynthesisLoader 
        status="pending" 
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12 font-inter">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-3">
             Synthesis <span className="text-blue-500">Workshop</span>
          </h1>
          <p className="text-zinc-500 mt-2 font-medium">Auto-generating Story Metadata for strictly compliant JSON schemas.</p>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => setShowJson(!showJson)}
             className="flex items-center gap-2 px-6 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all shadow-lg"
           >
             <Code className="w-3.5 h-3.5" />
             {showJson ? "Hide API Demo" : "View API Demo"}
           </button>
        </div>
      </header>

      <AnimatePresence>
        {showJson && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-3xl p-8 bg-zinc-950/80 mb-8 border border-blue-500/20">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <Play className="w-3.5 h-3.5" /> POST /narrate request demonstration
                  </span>
                  <span className="text-[10px] font-bold text-zinc-600">CLIENT COMPLIANT FORMAT</span>
               </div>
               <pre className="text-[11px] text-zinc-400 font-mono leading-relaxed bg-black/50 p-6 rounded-2xl overflow-x-auto border border-zinc-900 shadow-inner">
                 {JSON.stringify(requestPayload, null, 4)}
               </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-8">
          <div className="glass rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col min-h-[600px]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  Script Paragraph Management
                </label>
                <div className="flex items-center gap-2 mt-1">
                   <p className="text-xs font-bold text-zinc-200">Story ID: <span className="text-blue-500">#{storyId}</span></p>
                   <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                   <p className="text-xs font-bold text-zinc-200 truncate max-w-[200px]">{storyName}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setParagraphs(BEAR_TEMPLATE)}
                className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 bg-blue-500/5 px-4 py-2 rounded-xl border border-blue-500/10 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load Bear Template
              </button>
            </div>

            <div className="flex-1 space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {paragraphs.map((para, idx) => (
                <motion.div 
                  key={idx}
                  layoutId={`para-${idx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative group"
                >
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-0 bg-blue-500 group-hover:h-8 transition-all rounded-full" />
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                       <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-1">Paragraph #{idx + 1}</span>
                       <textarea 
                         value={para}
                         onChange={(e) => updateParagraph(idx, e.target.value)}
                         placeholder={`Enter paragraph text...`}
                         className="w-full bg-zinc-950/40 border border-zinc-800 focus:border-blue-500/50 rounded-2xl p-5 text-zinc-200 placeholder:text-zinc-800 focus:outline-none transition-all resize-none leading-relaxed text-sm shadow-inner min-h-[100px]"
                       />
                    </div>
                    <button 
                      onClick={() => removeParagraph(idx)}
                      disabled={paragraphs.length <= 1}
                      className="self-end mb-1 p-3 bg-red-500/5 hover:bg-red-500/10 text-red-500/40 hover:text-red-500 border border-red-500/10 rounded-xl transition-all disabled:opacity-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <button 
              onClick={addParagraph}
              className="mt-8 py-4 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600 hover:text-blue-500 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 group"
            >
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              Add Narrative Paragraph
            </button>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={paragraphs.every(p => !p.trim())}
            className="w-full bg-zinc-100 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 font-black uppercase tracking-[0.2em] py-6 rounded-3xl shadow-xl shadow-white/5 flex items-center justify-center gap-4 transition-all active:scale-[0.98] group"
          >
            <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            Initialize Pipeline Delivery
          </button>
        </div>

        <aside className="lg:col-span-4 space-y-8">
          <div className="glass rounded-3xl p-8 space-y-10 border border-zinc-800/50">
             <div className="space-y-6">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                   <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                   Vocal Profile & Target
                </label>
                <div className="relative group">
                   <select 
                     value={voice}
                     onChange={(e) => setVoice(e.target.value)}
                     disabled={isLoadingVoices}
                     className="w-full bg-zinc-950/50 border border-zinc-900 rounded-2xl px-5 py-4 text-sm font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer appearance-none shadow-inner disabled:opacity-50"
                   >
                     {isLoadingVoices ? (
                        <option>Querying Registry...</option>
                     ) : voices.length === 0 ? (
                        <option>No Voices Found</option>
                     ) : (
                        voices.map((v) => (
                          <option key={v.client_voice_id} value={v.client_voice_id}>
                            {v.client_voice_id}
                          </option>
                        ))
                     )}
                   </select>
                   <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600 group-hover:text-blue-500 transition-colors">
                      <ChevronDown className="w-4 h-4" />
                   </div>
                </div>
                <div className="space-y-3">
                   <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest ml-1">Fixed Engine Configuration</p>
                   <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-900 opacity-50 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Target Language</span>
                      <span className="text-[10px] font-black text-blue-400">EN-US</span>
                   </div>
                   <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-900 opacity-50 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Input Format</span>
                      <span className="text-[10px] font-black text-blue-400">STRUCTURED ARRAY</span>
                   </div>
                </div>
             </div>

             <div className="space-y-6">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                   <Settings2 className="w-3.5 h-3.5 text-indigo-500" />
                   Temporal Matrix
                </label>
                <div className="bg-zinc-950/50 p-6 rounded-2xl border border-zinc-900 shadow-inner space-y-6">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">WPM Rate</span>
                      <span className="text-sm font-black text-indigo-400 tabular-nums">{speed}</span>
                   </div>
                   <input 
                     type="range" 
                     value={speed}
                     onChange={(e) => setSpeed(parseInt(e.target.value) || 0)}
                     min={50}
                     max={300}
                     step={10}
                     className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
                   />
                </div>
             </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 bg-red-500/5 border border-red-500/20 rounded-3xl text-red-500 text-sm font-bold text-center uppercase tracking-[0.2em] shadow-xl"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
