"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface WordTiming {
  word_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export function useAudioHighlight(
  audioRef: React.RefObject<HTMLAudioElement>,
  paragraphs: any[] | undefined
) {
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const flattenedWords = useRef<WordTiming[]>([]);
  const requestRef = useRef<number>();

  // Pre-process paragraphs into a flat, searchable list of words
  useEffect(() => {
    if (!paragraphs) {
      flattenedWords.current = [];
      return;
    }

    const words: WordTiming[] = [];
    paragraphs.forEach((p) => {
      p.chunks?.forEach((c: any) => {
        c.words?.forEach((w: any) => {
          words.push(w);
        });
      });
    });

    // Sort by start_ms just in case, though backend sends them sorted
    flattenedWords.current = words.sort((a, b) => a.start_ms - b.start_ms);
  }, [paragraphs]);

  const findWordAtTime = (timeMs: number) => {
    const words = flattenedWords.current;
    if (words.length === 0) return null;

    // Binary search for efficiency
    let low = 0;
    let high = words.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const word = words[mid];

      if (timeMs >= word.start_ms && timeMs <= word.end_ms) {
        return word.word_id;
      }

      if (timeMs < word.start_ms) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return null;
  };

  const animate = useCallback(() => {
    if (!audioRef || !audioRef.current) return;

    const currentTimeMs = audioRef.current.currentTime * 1000;
    const wordId = findWordAtTime(currentTimeMs);

    if (wordId !== activeWordId) {
      setActiveWordId(wordId);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [activeWordId, audioRef]);

  useEffect(() => {
    if (!audioRef) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      requestRef.current = requestAnimationFrame(animate);
    };

    const onPause = () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", animate);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeked", animate);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animate, audioRef]);

  return { activeWordId };
}
