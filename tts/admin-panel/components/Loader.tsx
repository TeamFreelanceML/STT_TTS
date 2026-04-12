"use client";

import { motion } from "framer-motion";

export default function Loader({ label = "Loading", fullScreen = true }: { label?: string, fullScreen?: boolean }) {
  return (
    <div className={`${fullScreen ? 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md' : 'w-full h-64'} flex flex-col items-center justify-center gap-6 p-4`}>
       <div className="relative w-20 h-20">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="absolute inset-0 border-4 border-zinc-800 rounded-full"
          />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
          />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute inset-4 bg-zinc-900 rounded-full flex items-center justify-center"
          >
             <div className="w-2 h-2 bg-blue-500 rounded-full" />
          </motion.div>
       </div>
       <motion.p 
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         className="text-zinc-400 font-medium tracking-wide animate-pulse"
       >
         {label}
       </motion.p>
    </div>
  );
}
