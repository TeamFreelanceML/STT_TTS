"use client";

import React, { useEffect, useRef, useMemo, useCallback } from "react";

/**
 * PRODUCTION HIGHLIGHT CORE
 * -------------------------
 * Strict Duolingo CHUNK -> WORD Hierarchy with WPM adaptation.
 * Zero-overhead DOM manipulations for animation.
 */

interface ComputedWord {
  word_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  duration: number;
  tolerance: number;
  effectiveStart: number;
  effectiveEnd: number;
  chunk_id: string;
  para_id: number;
}

interface ComputedChunk {
  chunk_id: string;
  para_id: number;
  start_ms: number;
  end_ms: number;
  effectiveStart: number;
  effectiveEnd: number;
  words: ComputedWord[];
}

function preprocessAlignment(alignment: any) {
  const paragraphsArray = alignment?.paragraph_list || alignment?.paragraphs;
  if (!paragraphsArray || !Array.isArray(paragraphsArray)) return { chunks: [], avgWordDuration: 300 };

  const chunks: ComputedChunk[] = [];
  let totalWords = 0;
  let totalAudioMs = alignment.total_ms || 0;

  // WPM Estimation
  paragraphsArray.forEach((p: any) => {
    p.chunks?.forEach((c: any) => {
      totalWords += (c.words?.length || 0);
      totalAudioMs = Math.max(totalAudioMs, c.end_ms || 0);
    });
  });

  const avgWordDuration = totalWords > 0 ? totalAudioMs / totalWords : 300;
  const estimatedWPM = 60000 / (avgWordDuration || 300);
  const chunkBuffer = Math.min(Math.max(avgWordDuration * 0.5, 60), 150);

  // Flatten mapped to hierarchy
  paragraphsArray.forEach((p: any) => {
    p.chunks?.forEach((c: any) => {
      const computedWords: ComputedWord[] = [];
      const rawWords = c.words || [];

      rawWords.forEach((w: any) => {
        // --- PREMIUM SYNC TUNING ---
        // 1. Lead-in: Small head start (10% of duration, max 40ms)
        // 2. Tail: Visual persistence
        const leadIn = Math.min(Math.max(w.end_ms - w.start_ms * 0.10, 10), 40);
        const tolerance = 40; 

        computedWords.push({
          word_id: w.word_id,
          text: w.text || w.word || "",
          start_ms: w.start_ms,
          end_ms: w.end_ms,
          duration: w.end_ms - w.start_ms,
          tolerance,
          effectiveStart: w.start_ms - leadIn, // Premium: 25% head start
          effectiveEnd: w.end_ms + tolerance,
          chunk_id: c.chunk_id,
          para_id: p.para_id,
        });
      });

      if (computedWords.length > 0) {
        chunks.push({
          chunk_id: c.chunk_id,
          para_id: p.para_id,
          start_ms: c.start_ms,
          end_ms: c.end_ms,
          effectiveStart: computedWords[0].effectiveStart,
          effectiveEnd: computedWords[computedWords.length - 1].effectiveEnd + chunkBuffer,
          words: computedWords
        });
      }
    });
  });

  return { chunks, avgWordDuration };
}

export function Reader({ alignment, audioRef }: { alignment: any, audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const { chunks } = useMemo(() => preprocessAlignment(alignment), [alignment]);

  const requestRef = useRef<number>();
  
  // State refs 
  const activeChunkIdxRef = useRef<number>(0);
  const activeWordIdRef = useRef<string | null>(null);
  const activeChunkIdRef = useRef<string | null>(null);
  const activeParaIdRef = useRef<number | null>(null);

  const lastAudioTime = useRef<number>(0);
  const lastPerfTime = useRef<number>(0);
  const smoothTimeRef = useRef<number>(0);
  const lastTimeMs = useRef<number>(0);
  const domCacheRef = useRef<Map<string, HTMLElement>>(new Map());

  // PRE-INDEX DOM NODES FOR O(1) LOOKUP
  useEffect(() => {
    const container = document.getElementById("reader-container");
    if (!container || chunks.length === 0) return;
    
    const cache = new Map<string, HTMLElement>();
    container.querySelectorAll("[data-word-id], [data-chunk-id], [data-para-id]").forEach(el => {
      const id = el.getAttribute("data-word-id") || el.getAttribute("data-chunk-id") || el.getAttribute("data-para-id");
      if (id) cache.set(id, el as HTMLElement);
    });
    domCacheRef.current = cache;
  }, [chunks]);

  const findActiveChunkGlobal = useCallback((timeMs: number): number => {
    if (chunks.length === 0) return -1;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      if (timeMs >= c.effectiveStart && timeMs <= c.effectiveEnd) return i;
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (timeMs > chunks[i].effectiveEnd) return i;
    }
    return -1;
  }, [chunks]);

  const findWordWithinChunk = useCallback((chunk: ComputedChunk, timeMs: number): number => {
    if (chunk.words.length === 0) return -1;
    for (let i = chunk.words.length - 1; i >= 0; i--) {
      const w = chunk.words[i];
      if (timeMs >= w.effectiveStart && timeMs <= w.effectiveEnd) return i;
    }
    for (let i = chunk.words.length - 1; i >= 0; i--) {
      if (timeMs > chunk.words[i].effectiveEnd) return i;
    }
    return -1;
  }, []);

  const loop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || chunks.length === 0) return;
    
    const now = performance.now();
    const currentAudioTime = audio.currentTime * 1000;

    // 1. HYBRID CLOCK
    if (currentAudioTime !== lastAudioTime.current || audio.paused) {
      lastAudioTime.current = currentAudioTime;
      lastPerfTime.current = now;
      smoothTimeRef.current = currentAudioTime;
    } else {
      const delta = now - lastPerfTime.current;
      smoothTimeRef.current = lastAudioTime.current + (delta * audio.playbackRate);
    }

    // Balanced 30ms lookahead (reduced from 45ms to prevent "fast" feeling)
    const timeMs = smoothTimeRef.current + 30;

    let cIdx = activeChunkIdxRef.current;
    
    // 2. SEEK & JUMP DETECTION
    if (audio.seeking || Math.abs(timeMs - lastTimeMs.current) > 500) {
      cIdx = findActiveChunkGlobal(timeMs);
    } else if (!audio.paused) {
      const currentChunk = chunks[cIdx];
      if (currentChunk && timeMs >= currentChunk.effectiveEnd) {
        if (cIdx < chunks.length - 1) {
          const nextChunk = chunks[cIdx + 1];
          if (timeMs >= nextChunk.effectiveStart) cIdx += 1;
        }
      } else if (currentChunk && timeMs < currentChunk.effectiveStart) {
        cIdx = findActiveChunkGlobal(timeMs);
      } else if (cIdx === -1) {
        const nextIdx = findActiveChunkGlobal(timeMs);
        if (nextIdx !== -1) cIdx = nextIdx;
      }
    }

    // 3. WORD SEARCH 
    let targetWord: ComputedWord | null = null;
    let targetChunk: ComputedChunk | null = null;

    if (cIdx !== -1 && chunks[cIdx]) {
      targetChunk = chunks[cIdx];
      const wIdx = findWordWithinChunk(targetChunk, timeMs);
      if (wIdx !== -1) {
        targetWord = targetChunk.words[wIdx];
      } else if (timeMs > targetChunk.words[targetChunk.words.length - 1].effectiveEnd) {
        targetWord = targetChunk.words[targetChunk.words.length - 1];
      }
    }

    // 4. INSTANT O(1) DOM SYNC
    if (targetWord || targetChunk) {
        const newWordId = targetWord?.word_id || null;
        const newChunkId = targetChunk?.chunk_id || null;
        const newParaId = targetChunk?.para_id !== undefined ? String(targetChunk.para_id) : null;

        if (newWordId !== activeWordIdRef.current || newChunkId !== activeChunkIdRef.current) {
          const cache = domCacheRef.current;

          // Reset previous
          if (activeWordIdRef.current) {
            const el = cache.get(activeWordIdRef.current);
            if (el) el.classList.remove('active');
          }
          if (activeChunkIdRef.current && activeChunkIdRef.current !== newChunkId) {
            const el = cache.get(activeChunkIdRef.current);
            if (el) el.classList.remove('active');
          }

          // Apply new (Fast)
          if (newWordId) {
            const el = cache.get(newWordId);
            if (el) el.classList.add('active');
          }
          if (newChunkId && newChunkId !== activeChunkIdRef.current) {
            const el = cache.get(newChunkId);
            if (el) el.classList.add('active');
          }
          
          if (newParaId !== null && String(newParaId) !== String(activeParaIdRef.current)) {
             const oldPara = cache.get(String(activeParaIdRef.current));
             if (oldPara) oldPara.classList.remove('active');
             
             const paraEl = cache.get(newParaId);
             if (paraEl) {
               paraEl.classList.add('active');
               paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
             }
          }

          activeWordIdRef.current = newWordId;
          activeChunkIdRef.current = newChunkId;
          if (newParaId !== null) activeParaIdRef.current = Number(newParaId);
        }
    }

    activeChunkIdxRef.current = cIdx;
    lastTimeMs.current = timeMs;
    requestRef.current = requestAnimationFrame(loop);
  }, [chunks, findWordWithinChunk, findActiveChunkGlobal, audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => requestRef.current = requestAnimationFrame(loop);
    const onPause = () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    const onSeeked = () => { activeChunkIdxRef.current = -1; loop(); };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", onSeeked);

    if (!audio.paused) onPlay();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeked", onSeeked);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop, audioRef]);

  return (
    <div className="w-full space-y-12 py-10 px-8 select-none font-inter">
      {/* Reader System */}
      <div id="reader-container" className="reading-surface group">
        {(alignment?.paragraph_list || alignment?.paragraphs)?.map((p: any) => {
          return (
            <div 
              key={p.para_id}
              data-para-id={p.para_id}
              className="paragraph-block"
            >
              <p className="text-xl md:text-2xl font-black leading-[1.6] tracking-tight">
                {p.chunks?.map((c: any) => {
                  return (
                    <span 
                      key={c.chunk_id}
                      data-chunk-id={c.chunk_id}
                      className="chunk-span"
                    >
                      {c.words?.map((w: any) => {
                        return (
                          <span 
                            key={w.word_id}
                            data-word-id={w.word_id}
                            className="word-span"
                          >
                            {w.text || w.word}
                          </span>
                        );
                      })}
                    </span>
                  );
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
