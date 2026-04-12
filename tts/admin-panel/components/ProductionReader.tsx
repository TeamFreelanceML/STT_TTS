"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";

// --- TYPES & INTERFACES ---

export interface WordMetadata {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface ChunkMetadata {
  id: string;
  start: number;
  end: number;
  words: WordMetadata[];
}

export interface ParagraphMetadata {
  id: string;
  start: number;
  end: number;
  chunks: ChunkMetadata[];
}

export interface AlignmentData {
  paragraphs: ParagraphMetadata[];
}

interface ProcessedWord extends WordMetadata {
  paragraphId: string;
  chunkId: string;
  duration: number;
  tolerance: number;
  effectiveStart: number;
  effectiveEnd: number;
}

// --- OPTIMIZED SYNC ENGINE & COMPONENT ---

export const ProductionReader: React.FC<{ alignment: AlignmentData; audioUrl: string }> = ({ alignment, audioUrl }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // High-frequency state
  const [activeIds, setActiveIds] = useState<{ word: string | null; chunk: string | null; paragraph: string | null }>({
    word: null,
    chunk: null,
    paragraph: null
  });

  // Performance Refs
  const requestRef = useRef<number>(0);
  const lastActiveRef = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });
  const lastAudioTime = useRef<number>(0);
  const lastPerfTime = useRef<number>(0);
  const smoothTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const domCacheRef = useRef<Map<string, HTMLElement>>(new Map());

  // 1. DATA PREPROCESSING (ONCE)
  const { words, WPM } = useMemo(() => {
    const flatWords: ProcessedWord[] = [];
    let totalWordCount = 0;
    let minStart = Infinity;
    let maxEnd = -Infinity;

    alignment.paragraphs.forEach((p) => {
      p.chunks.forEach((c) => {
        c.words.forEach((w) => {
          totalWordCount++;
          minStart = Math.min(minStart, w.start);
          maxEnd = Math.max(maxEnd, w.end);
          
          const duration = w.end - w.start;
          let tolerance = Math.min(Math.max(duration * 0.25, 20), 60);

          flatWords.push({
            ...w,
            paragraphId: p.id,
            chunkId: c.id,
            duration,
            tolerance,
            effectiveStart: w.start - tolerance,
            effectiveEnd: w.end + tolerance
          });
        });
      });
    });

    const durationMinutes = (maxEnd - minStart) / 60000;
    const wpmValue = totalWordCount / durationMinutes;

    const adjustedWords = flatWords.map(w => {
      let tol = w.tolerance;
      if (wpmValue < 100) tol *= 1.2;
      else if (wpmValue > 180) tol *= 0.85;
      return { ...w, tolerance: tol, effectiveStart: w.start - tol, effectiveEnd: w.end + tol };
    });

    return { words: adjustedWords, WPM: wpmValue };
  }, [alignment]);

  // PRE-INDEX DOM NODES
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const cache = new Map<string, HTMLElement>();
    container.querySelectorAll("[data-word-id], [data-chunk-id], [data-paragraph-id]").forEach(el => {
      const id = el.getAttribute("data-word-id") || el.getAttribute("data-chunk-id") || el.getAttribute("data-paragraph-id");
      if (id) cache.set(id, el as HTMLElement);
    });
    domCacheRef.current = cache;
  }, [alignment]);

  // 2. BINARY SEARCH (O(log n))
  const findActiveWord = useCallback((timeMs: number): ProcessedWord | null => {
    let low = 0;
    let high = words.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const w = words[mid];
      if (timeMs >= w.effectiveStart && timeMs <= w.effectiveEnd) return w;
      if (timeMs < w.effectiveStart) high = mid - 1;
      else low = mid + 1;
    }
    return null;
  }, [words]);

  // 3. HIGHLIGHT LOOP (requestAnimationFrame)
  const syncLoop = useCallback((timestamp: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const now = performance.now();
    const currentAudioTime = audio.currentTime * 1000;

    // Phase 4: Hybrid Clock Logic
    if (currentAudioTime !== lastAudioTime.current || audio.paused) {
      lastAudioTime.current = currentAudioTime;
      lastPerfTime.current = now;
      smoothTimeRef.current = currentAudioTime;
    } else {
      const delta = now - lastPerfTime.current;
      smoothTimeRef.current = lastAudioTime.current + (delta * audio.playbackRate);
    }

    const currentTime = smoothTimeRef.current + 45; // Premium Phase 4 +45ms lookahead
    let activeWord = findActiveWord(currentTime);

    if (activeWord) {
      const { id, chunkId, paragraphId } = activeWord;
      
      if (id !== activeIds.word || chunkId !== activeIds.chunk) {
        setActiveIds({ word: id, chunk: chunkId, paragraph: paragraphId });
        
        // 4. LOW-LEVEL DOM MANIPULATION (Avoid React Re-renders)
        updateDOM(id, chunkId, paragraphId);
        
        lastActiveRef.current = { id, time: timestamp };
      }
    }
 else {
      if (activeIds.word !== null) {
        setActiveIds({ word: null, chunk: null, paragraph: null });
        updateDOM(null, null, null);
        lastActiveRef.current = { id: null, time: timestamp };
      }
    }

    requestRef.current = requestAnimationFrame(syncLoop);
  }, [words, findActiveWord, activeIds]);

  const updateDOM = (wordId: string | null, chatId: string | null, paraId: string | null) => {
    const cache = domCacheRef.current;
    if (!cache.size) return;

    // Premium Active Class Management (Fast Reset)
    const container = containerRef.current;
    if (container) {
      container.querySelectorAll(".active").forEach(el => el.classList.remove("active"));
    }
    
    if (paraId) {
      const pEl = cache.get(paraId);
      if (pEl) pEl.classList.add("active");
    }
    if (chatId) {
      const cEl = cache.get(chatId);
      if (cEl) cEl.classList.add("active");
    }
    if (wordId) {
      const wEl = cache.get(wordId);
      if (wEl) wEl.classList.add("active");
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(syncLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [syncLoop]);

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto p-12 bg-black min-h-screen text-zinc-100">
      <audio ref={audioRef} src={audioUrl} controls className="w-full opacity-50 hover:opacity-100 transition-opacity" />
      
      <div ref={containerRef} className="reading-surface space-y-12">
        {alignment.paragraphs.map((para) => (
            <div 
              key={para.id} 
              data-paragraph-id={para.id}
              className="paragraph-block"
            >
              {para.chunks.map((chunk) => (
                <span 
                  key={chunk.id} 
                  data-chunk-id={chunk.id} 
                  className="chunk-span"
                >
                  {chunk.words.map((word) => (
                    <span 
                      key={word.id} 
                      data-word-id={word.id}
                      className="word-span"
                    >
                      {word.text}
                    </span>
                  ))}
                </span>
              ))}
            </div>
        ))}
      </div>
    </div>
  );
};
