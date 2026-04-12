"use client";

import { useRef, useState } from "react";
import { Reader } from "@/components/Reader";
import { Music, Play, Pause, Layers, Zap, Info, RotateCcw } from "lucide-react";

const MOCK_ALIGNMENT = {
  paragraphs: [
    {
      para_id: 0,
      chunks: [
        {
          chunk_id: "p0_c1",
          start_ms: 0, end_ms: 2200,
          words: [
            { word_id: "w1", text: "It", start_ms: 0, end_ms: 200 },
            { word_id: "w2", text: "is", start_ms: 200, end_ms: 400 },
            { word_id: "w3", text: "the", start_ms: 400, end_ms: 600 },
            { word_id: "w4", text: "first", start_ms: 600, end_ms: 1000 },
            { word_id: "w5", text: "warm", start_ms: 1000, end_ms: 1400 },
            { word_id: "w6", text: "day", start_ms: 1400, end_ms: 1600 },
            { word_id: "w7", text: "of", start_ms: 1600, end_ms: 1800 },
            { word_id: "w8", text: "spring.", start_ms: 1800, end_ms: 2200 },
          ]
        },
        {
          chunk_id: "p0_c2",
          start_ms: 2600, end_ms: 6200,
          words: [
            { word_id: "w9", text: "A", start_ms: 2600, end_ms: 2800 },
            { word_id: "w10", text: "mother", start_ms: 2800, end_ms: 3200 },
            { word_id: "w11", text: "bear", start_ms: 3200, end_ms: 3600 },
            { word_id: "w12", text: "slowly", start_ms: 3600, end_ms: 4200 },
            { word_id: "w13", text: "peeks", start_ms: 4200, end_ms: 4600 },
            { word_id: "w14", text: "out", start_ms: 4600, end_ms: 4800 },
            { word_id: "w15", text: "of", start_ms: 4800, end_ms: 5000 },
            { word_id: "w16", text: "a", start_ms: 5000, end_ms: 5200 },
            { word_id: "w17", text: "hollow", start_ms: 5200, end_ms: 5700 },
            { word_id: "w18", text: "tree", start_ms: 5700, end_ms: 6000 },
            { word_id: "w19", text: "trunk", start_ms: 6000, end_ms: 6200 },
          ]
        },
        {
          chunk_id: "p0_c3",
          start_ms: 6600, end_ms: 8800,
          words: [
            { word_id: "w20", text: "on", start_ms: 6600, end_ms: 6800 },
            { word_id: "w21", text: "the", start_ms: 6800, end_ms: 7000 },
            { word_id: "w22", text: "side", start_ms: 7000, end_ms: 7400 },
            { word_id: "w23", text: "of", start_ms: 7400, end_ms: 7600 },
            { word_id: "w24", text: "a", start_ms: 7600, end_ms: 7800 },
            { word_id: "w25", text: "quiet", start_ms: 7800, end_ms: 8200 },
            { word_id: "w26", text: "mountain.", start_ms: 8200, end_ms: 8800 },
          ]
        },
        {
          chunk_id: "p0_c4",
          start_ms: 9200, end_ms: 12200,
          words: [
            { word_id: "w27", text: "She", start_ms: 9200, end_ms: 9500 },
            { word_id: "w28", text: "and", start_ms: 9500, end_ms: 9800 },
            { word_id: "w29", text: "her", start_ms: 9800, end_ms: 10000 },
            { word_id: "w30", text: "two", start_ms: 10000, end_ms: 10400 },
            { word_id: "w31", text: "cubs", start_ms: 10400, end_ms: 10800 },
            { word_id: "w32", text: "have", start_ms: 10800, end_ms: 11100 },
            { word_id: "w33", text: "slept", start_ms: 11100, end_ms: 11500 },
            { word_id: "w34", text: "all", start_ms: 11500, end_ms: 11800 },
            { word_id: "w35", text: "winter.", start_ms: 11800, end_ms: 12200 },
          ]
        },
        {
          chunk_id: "p0_c5",
          start_ms: 12600, end_ms: 15200,
          words: [
            { word_id: "w36", text: "The", start_ms: 12600, end_ms: 12800 },
            { word_id: "w37", text: "cubs", start_ms: 12800, end_ms: 13200 },
            { word_id: "w38", text: "drank", start_ms: 13200, end_ms: 13600 },
            { word_id: "w39", text: "milk", start_ms: 13600, end_ms: 14000 },
            { word_id: "w40", text: "from", start_ms: 14000, end_ms: 14300 },
            { word_id: "w41", text: "their", start_ms: 14300, end_ms: 14600 },
            { word_id: "w42", text: "mother", start_ms: 14600, end_ms: 15200 },
          ]
        },
        {
          chunk_id: "p0_c6",
          start_ms: 15600, end_ms: 17800,
          words: [
            { word_id: "w43", text: "but", start_ms: 15600, end_ms: 15800 },
            { word_id: "w44", text: "the", start_ms: 15800, end_ms: 16000 },
            { word_id: "w45", text: "mother", start_ms: 16000, end_ms: 16400 },
            { word_id: "w46", text: "bear", start_ms: 16400, end_ms: 16800 },
            { word_id: "w47", text: "ate", start_ms: 16800, end_ms: 17200 },
            { word_id: "w48", text: "nothing.", start_ms: 17200, end_ms: 17800 },
          ]
        },
        {
          chunk_id: "p0_c7",
          start_ms: 18200, end_ms: 19800,
          words: [
            { word_id: "w49", text: "She", start_ms: 18200, end_ms: 18500 },
            { word_id: "w50", text: "is", start_ms: 18500, end_ms: 18800 },
            { word_id: "w51", text: "very", start_ms: 18800, end_ms: 19200 },
            { word_id: "w52", text: "hungry.", start_ms: 19200, end_ms: 19800 },
          ]
        }
      ]
    },
    {
      para_id: 1,
      chunks: [
        {
          chunk_id: "p1_c1",
          start_ms: 21000, end_ms: 23800,
          words: [
             { word_id: "w100", text: "Silver", start_ms: 21000, end_ms: 21400 },
             { word_id: "w101", text: "fish", start_ms: 21400, end_ms: 21800 },
             { word_id: "w102", text: "swim", start_ms: 21800, end_ms: 22200 },
             { word_id: "w103", text: "beneath", start_ms: 22200, end_ms: 22600 },
             { word_id: "w104", text: "the", start_ms: 22600, end_ms: 22800 },
             { word_id: "w105", text: "clear", start_ms: 22800, end_ms: 23200 },
             { word_id: "w106", text: "water.", start_ms: 23200, end_ms: 23800 },
          ]
        }
      ]
    },
    {
      para_id: 2,
      chunks: [
        {
          chunk_id: "p2_c1",
          start_ms: 25000, end_ms: 30400,
          words: [
             { word_id: "w200", text: "Spring", start_ms: 25000, end_ms: 25500 },
             { word_id: "w201", text: "has", start_ms: 25500, end_ms: 25800 },
             { word_id: "w202", text: "begun", start_ms: 25800, end_ms: 26400 },
             { word_id: "w203", text: "and", start_ms: 26400, end_ms: 26700 },
             { word_id: "w204", text: "their", start_ms: 26700, end_ms: 27000 },
             { word_id: "w205", text: "new", start_ms: 27000, end_ms: 27300 },
             { word_id: "w206", text: "season", start_ms: 27300, end_ms: 27800 },
             { word_id: "w207", text: "of", start_ms: 27800, end_ms: 28000 },
             { word_id: "w208", text: "life", start_ms: 28000, end_ms: 28400 },
             { word_id: "w209", text: "together", start_ms: 28400, end_ms: 29000 },
             { word_id: "w210", text: "is", start_ms: 29000, end_ms: 29200 },
             { word_id: "w211", text: "just", start_ms: 29200, end_ms: 29600 },
             { word_id: "w212", text: "starting.", start_ms: 29600, end_ms: 30400 },
          ]
        }
      ]
    }
  ]
};

export default function ReaderDemo() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleStart = () => {
    if (audioRef.current) {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
    }
  };

  const handleReset = () => {
    if (audioRef.current) {
        audioRef.current.currentTime = 0;
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-zinc-100 p-8 md:p-24 font-inter relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-blue-500/5 rounded-full blur-[140px] -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[120px] -ml-24 -mb-24" />

      <header className="max-w-6xl mx-auto mb-20 relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
           <div className="flex items-center gap-4 mb-6">
              <div className="bg-blue-600 p-4 rounded-3xl shadow-[0_0_50px_rgba(37,99,235,0.3)]">
                 <Zap className="w-8 h-8 text-white fill-current" />
              </div>
              <div>
                 <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Standard <span className="text-blue-500">Sync Engine</span></h1>
                 <p className="text-zinc-500 font-black text-[10px] uppercase tracking-[0.4em] mt-2">Production Logic Verification — 10/10 Fidelity</p>
              </div>
           </div>
        </div>

        <div className="flex items-center gap-6">
           <button 
             onClick={handleReset}
             className="p-5 bg-zinc-950 border border-zinc-900 rounded-3xl text-zinc-500 hover:text-white transition-all shadow-inner active:scale-95"
           >
             <RotateCcw className="w-6 h-6" />
           </button>
           <button 
             onClick={handleStart}
             className={`px-12 py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-2xl active:scale-[0.98] flex items-center gap-4 ${
               isPlaying 
               ? "bg-zinc-100 text-zinc-950 hover:bg-white" 
               : "bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_40px_rgba(37,99,235,0.4)]"
             }`}
           >
             {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
             {isPlaying ? "PAUSE" : "START READ"}
           </button>
        </div>
      </header>
      
      <main className="relative z-10">
        <div className="max-w-6xl mx-auto">
           {/* Production Reader Interface */}
           <div className="bg-zinc-950/40 rounded-[4rem] border border-zinc-900/50 shadow-2xl relative overflow-hidden min-h-[500px] flex items-center justify-center backdrop-blur-3xl group">
              <div className="absolute top-10 left-12 flex items-center gap-3">
                 <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">O(log n) Binary Search Active</span>
              </div>
              <Reader 
                alignment={MOCK_ALIGNMENT} 
                audioRef={audioRef} 
              />
           </div>

           {/* Real Copied Demo Audio */}
           <audio 
             ref={audioRef}
             src="/bear.wav"
             onEnded={() => setIsPlaying(false)}
             onPause={() => setIsPlaying(false)}
             onPlay={() => setIsPlaying(true)}
           />
        </div>
      </main>

      <footer className="max-w-6xl mx-auto mt-24 grid grid-cols-1 md:grid-cols-4 gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 relative z-10 border-t border-zinc-900/50 pt-16">
         <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-500">
               <Layers className="w-4 h-4" />
               <p>Structural Integrity</p>
            </div>
            <p className="text-zinc-400 text-lg tracking-tighter normal-case font-bold">Para → Chunk → Word</p>
         </div>
         <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-500">
               <Zap className="w-4 h-4" />
               <p>Latency Benchmark</p>
            </div>
            <p className="text-zinc-400 text-lg tracking-tighter normal-case font-bold">~1.2ms per frame</p>
         </div>
         <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-500">
               <Music className="w-4 h-4" />
               <p>Drift Tolerance</p>
            </div>
            <p className="text-zinc-400 text-lg tracking-tighter normal-case font-bold">Dynamic (20-60ms)</p>
         </div>
         <div className="space-y-4">
            <div className="flex items-center gap-3 text-blue-500">
               <Info className="w-4 h-4" />
               <p>Search Algorithm</p>
            </div>
            <p className="text-zinc-400 text-lg tracking-tighter normal-case font-bold">Binary O(log n)</p>
         </div>
      </footer>
    </div>
  );
}
