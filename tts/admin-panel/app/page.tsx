"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Mic, Clock, CheckCircle2, TrendingUp, Zap, Server, Globe, Box, Play, Pause, X, FileJson, Music, ExternalLink, ChevronLeft, ChevronRight, Download, Copy, Check } from "lucide-react";
import { getJobs, pollNarration, getStats, API_BASE_URL } from "@/utils/api";
import { Reader } from "@/components/Reader";
import SynthesisLoader from "@/components/SynthesisLoader";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalJobs: "0",
    activeJobs: "0",
    voicesCount: "0",
    systemHealth: "Online",
    latency: "0ms",
    nodeUtils: [0, 0, 0, 0, 0, 0, 0, 0]
  });
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Job Inspection Modal State
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleView = async (id: string) => {
    setViewingJobId(id);
    setJobDetails(null);
    setIsPlaying(false);
    try {
      const details = await pollNarration(id);
      setJobDetails(details);
    } catch (err) {
      console.error("Failed to fetch job", err);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const [{ jobs: latestJobs }, liveStats] = await Promise.all([
          getJobs(),
          getStats()
        ]);
        setJobs(latestJobs);
        setStats(liveStats);
      } catch (err) {
        console.error("Dashboard data fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    
    // Snappy production refresh - 3s for live feel
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  // REAL-TIME MODAL POLLING
  useEffect(() => {
    if (!viewingJobId) return;
    
    // Only poll if the job is not yet finished/failed
    const shouldPoll = !jobDetails || jobDetails.status === 'pending' || jobDetails.status === 'processing';
    if (!shouldPoll) return;

    const poll = async () => {
      try {
        const details = await pollNarration(viewingJobId);
        setJobDetails(details);
        
        // If it just finished, refresh the background dashboard list too
        if (details.status === 'complete') {
           const { jobs: latest } = await getJobs();
           setJobs(latest);
        }
      } catch (err) {
        console.error("Modal poll failed:", err);
      }
    };

    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [viewingJobId, jobDetails]);

  const formatTime = (ts: number) => {
    if (!ts) return "Just now";
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="space-y-12 pb-12 font-inter text-zinc-300">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-3">
            System <span className="text-blue-500">Overview</span>
          </h1>
          <p className="text-zinc-500 mt-2 font-medium">Real-time telemetry from your Story TTS production cluster.</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800/50 px-4 py-2 rounded-full backdrop-blur-md">
           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Cluster Status: {stats.systemHealth}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Narration Volume" 
          value={stats.totalJobs} 
          icon={<Clock className="w-5 h-5 text-blue-400" />} 
          trend="Total"
          trendIsPositive={true}
          loading={loading}
          delay={0}
        />
        <StatCard 
          title="Active Workers" 
          value={stats.activeJobs} 
          icon={<Zap className="w-5 h-5 text-amber-400" />} 
          trend="Running"
          trendIsPositive={true}
          loading={loading}
          delay={0.1}
        />
        <StatCard 
          title="Engine Voice Count" 
          value={stats.voicesCount} 
          icon={<Mic className="w-5 h-5 text-indigo-400" />} 
          trend="Registry"
          trendIsPositive={true}
          loading={loading}
          delay={0.2}
        />
        <StatCard 
          title="Average Latency" 
          value={stats.latency} 
          icon={<Globe className="w-5 h-5 text-emerald-400" />} 
          trend="Real-time"
          trendIsPositive={true}
          loading={loading}
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass rounded-3xl p-8 relative overflow-hidden group min-h-[500px]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">Live Activity Flow</h2>
              <p className="text-xs text-zinc-500 mt-1 font-medium italic">Streaming the latest snapshots from the production pipeline</p>
            </div>
            <div className="flex items-center gap-2">
               <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[9px] font-black text-blue-400 uppercase tracking-widest animate-pulse">Live Tracking</div>
            </div>
          </div>
          
          <div className="space-y-4">
             {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-20 w-full bg-zinc-950/20 animate-pulse rounded-2xl border border-zinc-900" />
                ))
             ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                   <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700">
                      <Box className="w-6 h-6" />
                   </div>
                   <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">No recent jobs detected</p>
                </div>
             ) : (
                jobs.map((job) => (
                  <motion.div 
                    key={job.job_id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="group flex items-center justify-between p-5 bg-zinc-950/40 hover:bg-zinc-900/60 rounded-2xl border border-zinc-800/50 hover:border-zinc-700/80 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 group-hover:text-blue-500 transition-colors shadow-inner shrink-0">
                        <Server className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-zinc-200 group-hover:text-white transition-colors truncate max-w-[250px]">{job.story_name}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                           <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest flex items-center gap-1.5 truncate">
                              <Mic className="w-3 h-3 text-blue-500/50" /> {job.voice_name}
                           </span>
                           <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                           <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">{formatTime(job.created_at)}</span>
                           <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                           <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">{job.total_chunks} Chunks</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => handleView(job.job_id)} 
                        className="px-4 py-1.5 text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-full border border-blue-500/20 transition-all shadow-sm"
                      >
                        View
                      </button>
                      <button 
                        onClick={() => setJobs(j => j.filter(x => x.job_id !== job.job_id))}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all shadow-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))
             )}
          </div>
        </div>

        <div className="glass rounded-3xl p-8 flex flex-col min-h-[500px]">
          <div className="mb-10">
            <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">Node Telemetry</h2>
            <p className="text-xs text-zinc-500 mt-1 font-medium italic">Resource utilization per Kokoro instance</p>
          </div>
          
          <div className="flex-1 flex items-end gap-3 justify-between px-2 pt-10">
            {stats.nodeUtils.map((h, i) => (
              <div key={i} className="relative flex-1 group">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="w-full bg-blue-500/10 group-hover:bg-blue-500/30 border-t-2 border-blue-500/50 rounded-t-lg transition-all cursor-pointer relative"
                >
                   <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent" />
                </motion.div>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-900 text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap border border-zinc-800 font-black shadow-2xl scale-75 group-hover:scale-100 translate-y-2 group-hover:translate-y-0 z-20">
                  {h}% UTIL
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 mt-12 text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] border-t border-zinc-800/50 pt-6">
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" />
                <span>Primary VPC</span>
             </div>
             <div className="text-right">A100-80GB CLUSTER</div>
          </div>
        </div>
      </div>

      {/* JOB INSPECTION MODAL */}
      <AnimatePresence>
        {viewingJobId && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex bg-black overflow-hidden"
          >
            <motion.div 
              initial={{ y: 40, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full h-full flex flex-col relative bg-black"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 px-12 border-b border-white/5 bg-black shrink-0 relative z-10">
                 <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-blue-500/10 rounded-[1.5rem] flex items-center justify-center border border-blue-500/20 text-blue-500 shadow-inner">
                       <Server className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight">Job Inspection Protocol</h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mt-1">ID: {viewingJobId}</p>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-4">
                     <div className="flex border border-zinc-800 rounded-2xl bg-zinc-900/50 overflow-hidden mr-4 shadow-inner">
                        <button 
                          onClick={() => {
                             const idx = jobs.findIndex(j => j.job_id === viewingJobId);
                             if (idx > 0) handleView(jobs[idx - 1].job_id);
                          }}
                          disabled={jobs.findIndex(j => j.job_id === viewingJobId) === 0}
                          className="px-4 py-3 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent text-zinc-400 hover:text-white transition-all border-r border-zinc-800 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                        >
                          <ChevronLeft className="w-4 h-4" /> Prev
                        </button>
                        <button 
                          onClick={() => {
                             const idx = jobs.findIndex(j => j.job_id === viewingJobId);
                             if (idx < jobs.length - 1) handleView(jobs[idx + 1].job_id);
                          }}
                          disabled={jobs.findIndex(j => j.job_id === viewingJobId) === jobs.length - 1}
                          className="px-4 py-3 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                        >
                          Next <ChevronRight className="w-4 h-4" />
                        </button>
                     </div>
                     <button 
                       onClick={() => setViewingJobId(null)} 
                       className="w-12 h-12 flex flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all active:scale-95 shadow-sm"
                     >
                       <X className="w-6 h-6" />
                     </button>
                 </div>
              </div>
              
              {/* Content Split */}
              {jobDetails && (jobDetails.status === 'pending' || jobDetails.status === 'processing') ? (
                 <div className="flex-1 p-8 px-12 flex items-center justify-center">
                    <SynthesisLoader status={jobDetails.status} progress={jobDetails.progress} inline={true} />
                 </div>
              ) : (
                 <div className="flex-1 p-8 px-12 grid grid-cols-1 lg:grid-cols-2 gap-12 overflow-hidden h-full">
                
                {/* Left: JSON Payload */}
                <div className="flex flex-col h-full overflow-hidden">
                   <div className="flex items-center justify-between shrink-0 mb-6">
                      <div className="flex items-center gap-3 text-emerald-500 font-black uppercase tracking-[0.2em] text-[11px]">
                        <div className="p-2 bg-emerald-500/10 rounded-lg"><FileJson className="w-4 h-4" /></div>
                        Production Payload Format
                      </div>
                      
                      {jobDetails && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(jobDetails, null, 2));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                            copied 
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700'
                          }`}
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Copied' : 'Copy JSON'}
                        </button>
                      )}
                   </div>
                   <div className="flex-1 bg-[#0A0A0A] rounded-[2rem] p-8 border border-white/5 overflow-auto text-[11px] font-mono text-zinc-500 relative custom-scrollbar">
                     {jobDetails ? (
                       <pre className="text-emerald-500/80 leading-relaxed outline-none">{JSON.stringify(jobDetails, null, 2)}</pre>
                     ) : (
                       <div className="absolute inset-0 flex items-center justify-center animate-pulse flex-col gap-4">
                          <Zap className="w-8 h-8 text-emerald-500/50" />
                          <span className="text-zinc-600 font-black uppercase tracking-widest text-[10px]">Retrieving snapshot...</span>
                       </div>
                     )}
                   </div>
                </div>

                {/* Right: Reader Demonstration */}
                <div className="flex flex-col h-full overflow-hidden">
                   <div className="flex items-center justify-between shrink-0 mb-6">
                      <div className="flex items-center gap-3 text-blue-500 font-black uppercase tracking-[0.2em] text-[11px]">
                         <div className="p-2 bg-blue-500/10 rounded-lg"><Activity className="w-4 h-4" /></div>
                         Matched Highlighting
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {jobDetails && jobDetails.result?.audio && (
                            <button 
                            onClick={() => {
                                if (audioRef.current) {
                                    if (isPlaying) audioRef.current.pause();
                                    else audioRef.current.play();
                                    setIsPlaying(!isPlaying);
                                }
                            }}
                            className={`px-8 py-3.5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center gap-3 shadow-lg active:scale-95 ${
                                isPlaying 
                                ? 'bg-zinc-100 text-zinc-950 hover:bg-white' 
                                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_30px_rgba(37,99,235,0.4)]'
                            }`}
                            >
                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                            {isPlaying ? 'PAUSE' : 'START READ'}
                            </button>
                        )}
                        
                        {jobDetails?.result?.audio?.url && (
                            <a 
                            href={`${API_BASE_URL}${jobDetails.result.audio.url}`}
                            download={`${jobDetails.story_name || 'narration'}.wav`}
                            className="w-12 h-12 flex items-center justify-center rounded-[1.25rem] bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xl group/dl"
                            title="Download Audio Asset"
                            >
                            <Download className="w-5 h-5 group-hover/dl:translate-y-0.5 transition-transform" />
                            </a>
                        )}
                      </div>
                   </div>

                   <div className="flex-1 bg-[#0A0A0A] rounded-[2rem] border border-white/5 relative overflow-hidden flex flex-col p-8 md:p-12 shadow-inner">
                      {jobDetails ? (
                         <div className="flex-1 overflow-y-auto custom-scrollbar">
                           <Reader alignment={jobDetails.result?.alignment} audioRef={audioRef} />
                         </div>
                      ) : (
                         <div className="flex-1 flex items-center justify-center">
                           <div className="w-12 h-12 rounded-full border-t-[3px] border-blue-500 animate-spin" />
                         </div>
                      )}
                   </div>
                   
                   {/* Hidden Audio */}
                   {jobDetails && jobDetails.result?.audio?.url && (
                      <audio 
                        ref={audioRef} 
                        src={`${API_BASE_URL}${jobDetails.result.audio.url}`} 
                        onEnded={() => setIsPlaying(false)} 
                        className="hidden"
                      />
                   )}
                </div>

              </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  trend, 
  trendIsPositive,
  loading,
  delay
}: { 
  title: string, 
  value: string, 
  icon: React.ReactNode, 
  trend: string,
  trendIsPositive: boolean,
  loading: boolean,
  delay: number
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-3xl p-7 relative overflow-hidden group cursor-default shadow-lg"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors duration-500" />
      
      <div className="flex items-center justify-between mb-6">
        <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.15em]">{title}</span>
        <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner">
          {icon}
        </div>
      </div>
      
      <div className="flex items-end justify-between">
        {loading ? (
          <div className="h-10 w-32 bg-zinc-800/50 animate-pulse rounded-xl" />
        ) : (
          <div className="text-4xl font-black tracking-tighter text-white mr-2">{value}</div>
        )}
        {!loading && (
          <div className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-1 flex items-center gap-1 ${trendIsPositive ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
            {trendIsPositive && <TrendingUp className="w-3 h-3 text-blue-500" />}
            {trend}
          </div>
        )}
      </div>
    </motion.div>
  );
}
