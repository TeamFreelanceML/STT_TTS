"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, CheckCircle2, AlertCircle, Cpu, Music, Radio } from "lucide-react";

interface SynthesisLoaderProps {
  status: "pending" | "processing" | "complete" | "failed";
  progress?: { completed: number; total: number };
  label?: string;
  inline?: boolean;
}

export default function SynthesisLoader({ status, progress, label, inline = false }: SynthesisLoaderProps) {
  const steps = [
    { id: 'pending', label: 'Queuing Task', icon: Radio },
    { id: 'processing', label: 'Neural Synthesis', icon: Cpu },
    { id: 'complete', label: 'Audio Mastered', icon: Music },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === status);
  const percentage = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className={inline ? "w-full flex-1 flex flex-col items-center justify-center p-6 relative z-10" : "fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6"}>
      <div className="relative w-full max-w-lg">
        {/* Glowing Background Effect */}
        <div className="absolute inset-0 bg-blue-500/10 blur-[120px] rounded-full" />
        
        <div className="glass rounded-[2.5rem] p-12 relative border border-white/5 space-y-10 text-center">
          <div className="relative inline-block">
            {/* Pulsing Outer Ring */}
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="absolute -inset-4 rounded-full bg-blue-500/20 blur-xl"
            />
            
            <div className="relative w-32 h-32 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
               <AnimatePresence mode="wait">
                 {status === 'failed' ? (
                   <motion.div key="failed" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <AlertCircle className="w-12 h-12 text-red-500" />
                   </motion.div>
                 ) : (
                   <motion.div 
                     key="loading"
                     animate={{ rotate: 360 }}
                     transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                     className="absolute inset-2 border-2 border-transparent border-t-blue-500 rounded-full"
                   />
                 )}
               </AnimatePresence>
               <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl font-black text-white">{percentage || '0'}%</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800">
                    {progress?.total ? `${progress.completed} / ${progress.total} CHUNKS` : 'INITIALIZING...'}
                  </span>
               </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">
              {status === 'failed' ? 'Synthesis Interrupted' 
              : status === 'pending' ? 'Job Successfully Created' 
              : 'Real-time Tracing'}
            </h2>
            <p className="text-xs text-zinc-500 font-medium max-w-sm mx-auto">
              {status === 'pending' 
               ? 'Pipeline job registered gracefully. Securing Celery execution thread...' 
               : 'Pipeline is actively processing sequential chunks through the neural engine.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
             {steps.map((step, idx) => {
               const StepIcon = step.icon;
               const isDone = idx < currentStepIndex || status === 'complete';
               const isCurrent = idx === currentStepIndex;

               return (
                 <div key={step.id} className="space-y-3">
                    <div className={`w-full h-1.5 rounded-full overflow-hidden bg-zinc-800 border border-zinc-900 shadow-inner`}>
                       {(isDone || isCurrent) && (
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: isDone ? '100%' : '50%' }}
                           className={`h-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`}
                         />
                       )}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                       <div className={`p-2 rounded-lg border ${isDone ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : isCurrent ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}>
                          <StepIcon className="w-3.5 h-3.5" />
                       </div>
                       <span className={`text-[8px] font-black uppercase tracking-tighter ${isDone ? 'text-emerald-500' : isCurrent ? 'text-white' : 'text-zinc-600'}`}>
                         {step.label}
                       </span>
                    </div>
                 </div>
               );
             })}
          </div>

          {status === 'failed' && (
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-transform"
            >
              Abort & Restart Pipeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
