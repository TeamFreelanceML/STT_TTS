"use client";

import React from "react";
import type { EvaluationResult, EvaluationWord } from "@/hooks/useEvaluation";

// ---------------------------------------------------------------------------
// Component: WordResult
// ---------------------------------------------------------------------------

function WordResult({ item }: { item: EvaluationWord }) {
  /**
   * Colors and styles based on the Judge's status:
   * Correct: Emerald Green
   * Mispronounced: Amber/Orange underline
   * Skipped: Gray / Strikethrough
   */
  const getStatusStyles = () => {
    switch (item.status) {
      case "correct":
        return "text-emerald-400 font-medium";
      case "mispronounced":
        return "text-amber-400 underline decoration-amber-500/50 decoration-2 underline-offset-4";
      case "skipped":
        return "text-white/20 line-through decoration-white/30";
      default:
        return "text-white/60";
    }
  };

  return (
    <span className={`inline-block mr-2 mb-1 px-1 rounded transition-colors duration-300 ${getStatusStyles()}`}>
      {item.word}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component: MetricCard
// ---------------------------------------------------------------------------

function MetricCard({ 
  label, 
  value, 
  subLabel, 
  variant = "default" 
}: { 
  label: string; 
  value: string | number; 
  subLabel?: string;
  variant?: "default" | "highlight";
}) {
  return (
    <div className={`glass-card p-6 flex flex-col items-center justify-center text-center ${variant === "highlight" ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
      <span className="text-xs text-white/30 uppercase tracking-widest mb-1">{label}</span>
      <span className={`text-4xl font-bold tracking-tight mb-0.5 ${variant === "highlight" ? "text-amber-400" : "text-white/90"}`}>
        {value}
      </span>
      {subLabel && <span className="text-[10px] text-white/20 uppercase tracking-tighter">{subLabel}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: ReportCard (Main Export)
// ---------------------------------------------------------------------------

interface ReportCardProps {
  data: EvaluationResult | null;
  isVisible: boolean;
  onRestart: () => void;
}

export default function ReportCard({ data, isVisible, onRestart }: ReportCardProps) {
  if (!isVisible || !data) return null;

  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950/95 backdrop-blur-xl animate-[fade-in_0.5s_ease-out]">
      <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center">
        
        {/* --- Header Section --- */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Reading Report Card</h2>
          <p className="text-white/40 max-w-md mx-auto text-sm">
            Our AI Judge has analyzed your pronunciation, fluency, and accuracy. 
            Here is your detailed performance breakdown.
          </p>
        </div>

        {/* --- Scores Section --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-12">
          <MetricCard 
            label="Accuracy" 
            value={`${data.accuracy_score ?? 0}%`} 
            subLabel={`${data.correct_words ?? 0} / ${data.total_words ?? 0} words`}
          />
          <MetricCard 
            label="Fluency" 
            value={`${data.fluency_score ?? 0}%`} 
            variant="highlight"
            subLabel="Pacing & Smoothness"
          />
          <MetricCard 
            label="Pace" 
            value={data.wpm ?? 0} 
            subLabel="Words Per Minute"
          />
        </div>

        {/* --- Word Breakdown Section --- */}
        <div className="w-full glass-card p-8 mb-12">
          <h3 className="text-xs font-semibold text-white/30 uppercase tracking-[0.2em] mb-8 pb-4 border-b border-white/5 text-center">
            Word-by-Word Analysis
          </h3>
          <div className="flex flex-wrap items-baseline justify-center text-xl leading-relaxed max-w-2xl mx-auto">
            {(data.word_map || []).map((item, idx) => (
              <WordResult key={`${item.word}-${idx}`} item={item} />
            ))}
          </div>
          
          <div className="mt-12 pt-8 border-t border-white/5 flex flex-wrap justify-center gap-8 text-[10px] uppercase tracking-widest text-white/20">
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-emerald-400" />
               Correct
             </div>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-amber-400" />
               Mispronounced
             </div>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full border border-white/20 bg-slate-800 line-through" />
               Skipped / Missed
             </div>
          </div>
        </div>

        {/* --- Actions --- */}
        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={onRestart}
            className="px-8 py-3 bg-white text-slate-950 font-semibold rounded-full hover:bg-white/90 transition-all active:scale-95 text-sm uppercase tracking-wider"
          >
            Try Another Reading
          </button>
          <span className="text-[10px] text-white/20 uppercase tracking-widest">
            Results provided by Whisper Engine v2
          </span>
        </div>

      </div>
    </div>
  );
}
