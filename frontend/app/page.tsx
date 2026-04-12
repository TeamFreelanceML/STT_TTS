"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { parseStory, getWordAtCursor, flattenWords } from "@/lib/parseStory";
import { useSherpa } from "@/hooks/useSherpa";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useEvaluation } from "@/hooks/useEvaluation";
import BlurGate from "@/components/BlurGate";
import type { Story } from "@/lib/types";
import { structuredStory, structuredStoryToText } from "@/lib/storyData";
import { Book, Mic, Square, RefreshCcw } from "lucide-react";

const STORY_TEXT = structuredStoryToText(structuredStory);
const STORY_TITLE = structuredStory.title;
const TTS_WORD_API_URL = "/api/tts/narrate/word";
const EVALUATE_API_URL = "/api/evaluation"; 
const STUCK_TIMEOUT_MS = 6000;
const FIRST_CHECKPOINT_MS = 18000;
const SECOND_CHECKPOINT_MS = 36000;
const SESSION_LIMIT_MS = 42000;

type PausePrompt = "continue" | "still-recording" | null;

export default function ReadingApp() {
  const router = useRouter();
  const [story] = useState<Story>(() => parseStory(STORY_TEXT, STORY_TITLE));
  const helperSkippedWordsRef = useRef<Array<{ expected_index: number; word: string }>>([]);
  const expectedIndexByWordId = useMemo(() => {
    const map = new Map<string, number>();
    flattenWords(story).forEach((word, index) => {
      map.set(word.id, index);
    });
    return map;
  }, [story]);
  
  const { status, start: startSherpa, stop: stopSherpa, cursor, correctCount, recognizedText, advanceManual } = useSherpa(story);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const { isEvaluating, result, evaluateReading } = useEvaluation();

  const [isComplete, setIsComplete] = useState(false);
  const [pausePrompt, setPausePrompt] = useState<PausePrompt>(null);
  const [coachMessage, setCoachMessage] = useState("Start reading when you're ready.");
  const [silenceRemaining, setSilenceRemaining] = useState(SESSION_LIMIT_MS);
  const isStoppingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number | null>(null);
  const lastSpokenWordRef = useRef<string | null>(null);
  const promptActiveRef = useRef(false);
  const idleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const helperAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastCursorKeyRef = useRef<string>("");
  const lastRecognizedAttemptRef = useRef<string>("");
  const helperAdvanceRef = useRef(false);
  const helperStepRef = useRef(0);
  const promptStageRef = useRef<0 | 1 | 2>(0);
  const ignoreRecognizedUntilRef = useRef(0);

  const getCursorKey = useCallback(() => {
    return `${cursor.paragraphIndex}:${cursor.sentenceIndex}:${cursor.chunkIndex}:${cursor.wordIndex}`;
  }, [cursor]);

  const speakWordFallback = useCallback((word: string): Promise<void> => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      synthRef.current = synth;
      synth.cancel();
      if (helperAudioRef.current) {
        helperAudioRef.current.pause();
        helperAudioRef.current = null;
      }
      ignoreRecognizedUntilRef.current = Date.now() + 1800;

      const utterance = new SpeechSynthesisUtterance(word);
      utterance.rate = 0.85;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }, []);

  const speakWord = useCallback(async (word: string): Promise<void> => {
    if (typeof window === "undefined") return;

    try {
      if (synthRef.current) synthRef.current.cancel();

      const response = await fetch(TTS_WORD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voice: {
            voice_id: "voice_1_bm_lewis",
            language: "en-US",
          },
          speech_config: {
            wpm: 140,
          },
          word,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed with ${response.status}`);
      }

      const data = await response.json();
      const audioUrl = data?.audio?.url;
      if (!audioUrl) {
        throw new Error("TTS response missing audio URL");
      }

      const resolvedAudioUrl = audioUrl.startsWith("http")
        ? audioUrl
        : new URL(audioUrl, TTS_WORD_API_URL).toString();

      const helperAudio = new Audio(resolvedAudioUrl);
      helperAudioRef.current = helperAudio;

      const durationMs =
        typeof data?.audio?.duration_ms === "number" ? data.audio.duration_ms : 1800;
      ignoreRecognizedUntilRef.current = Date.now() + durationMs + 400;

      await new Promise<void>((resolve, reject) => {
        helperAudio.onended = () => resolve();
        helperAudio.onerror = () => reject(new Error("Helper audio playback failed"));
        helperAudio
          .play()
          .catch(reject);
      });
    } catch (err) {
      console.warn("[ReadingApp] TTS helper failed. Falling back to browser speech.", err);
      await speakWordFallback(word);
    }
  }, [speakWordFallback]);

  const clearIdleTimer = useCallback(() => {
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    }
  }, []);

  const resetIdleTracking = useCallback((message?: string) => {
    lastActivityAtRef.current = Date.now();
    helperStepRef.current = 0;
    promptStageRef.current = 0;
    lastSpokenWordRef.current = null;
    setSilenceRemaining(SESSION_LIMIT_MS);
    if (message) setCoachMessage(message);
  }, []);

  useEffect(() => {
    if (result) {
      sessionStorage.setItem("latest_evaluation", JSON.stringify(result));
      router.push("/results");
    }
  }, [result, router]);

  const handleStopSession = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    sessionActiveRef.current = false;
    pausedAtRef.current = null;
    clearIdleTimer();
    setSilenceRemaining(SESSION_LIMIT_MS);
    setPausePrompt(null);
    promptActiveRef.current = false;
    
    try {
        if (synthRef.current) synthRef.current.cancel();
        if (helperAudioRef.current) {
          helperAudioRef.current.pause();
          helperAudioRef.current = null;
        }
        stopSherpa();
        const finalBlob = await stopRecording();
        if (finalBlob) {
          // Use EVALUATE_API_URL if needed, but the hook might handle it.
          // I will check useEvaluation.ts next.
          evaluateReading(finalBlob, STORY_TEXT, helperSkippedWordsRef.current);
        }
    } catch (err) {
        console.error("Teardown error:", err);
    }
  }, [clearIdleTimer, stopRecording, stopSherpa, evaluateReading]);

  const handleStartSession = useCallback(async () => {
    isStoppingRef.current = false;
    try {
      // [PRODUCTION BUGFIX] UNIFIED STREAM ACCESS
      // Capture the high-fidelity 48kHz stream once and share it.
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true } 
      });

      // Pass the shared stream to both the STT engine and the Recorder
      await startSherpa(stream);
      startRecording(stream);

      sessionActiveRef.current = true;
      pausedAtRef.current = null;
      setPausePrompt(null);
      promptActiveRef.current = false;
      helperAdvanceRef.current = false;
      helperSkippedWordsRef.current = [];
      lastRecognizedAttemptRef.current = "";
      resetIdleTracking("Great start. Read the glowing word first.");
    } catch (err) {
      console.error("Startup error:", err);
      setCoachMessage(`Microphone error: ${(err as Error).message}`);
    }
  }, [startSherpa, startRecording, resetIdleTracking]);

  const handleContinueReading = useCallback(() => {
    const pausedAt = pausedAtRef.current;
    if (pausedAt) {
      const pausedDuration = Date.now() - pausedAt;
      lastActivityAtRef.current = (lastActivityAtRef.current ?? Date.now()) + pausedDuration;
      pausedAtRef.current = null;
    }
    setPausePrompt(null);
    promptActiveRef.current = false;
    setCoachMessage("Nice. Keep going from the highlighted word.");
  }, []);

  const handleExitReading = useCallback(() => {
    setPausePrompt(null);
    promptActiveRef.current = false;
    setCoachMessage("Session ended. We can try again anytime.");
    void handleStopSession();
  }, [handleStopSession]);

  useEffect(() => {
    if (cursor.paragraphIndex < 0 && !isComplete) {
      setIsComplete(true);
      handleStopSession();
    }
  }, [cursor, isComplete, handleStopSession]);

  useEffect(() => {
    if (!sessionActiveRef.current) return;
    if (isStoppingRef.current) return;
    if (isEvaluating) return;

    // If recording has stopped for any reason (including the 42s hard stop)
    // while Sherpa is still in listening mode, close the live session cleanly.
    if (!isRecording && status === "listening") {
      void handleStopSession();
    }
  }, [handleStopSession, isEvaluating, isRecording, status]);

  useEffect(() => {
    const currentKey = getCursorKey();
    if (currentKey !== lastCursorKeyRef.current) {
      lastCursorKeyRef.current = currentKey;
      if (isRecording && cursor.paragraphIndex >= 0) {
        if (helperAdvanceRef.current) {
          helperAdvanceRef.current = false;
        } else {
          resetIdleTracking("Good job. Keep reading.");
        }
      }
    }
  }, [cursor, getCursorKey, isRecording, resetIdleTracking]);

  useEffect(() => {
    const normalizedAttempt = recognizedText
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = normalizedAttempt ? normalizedAttempt.split(" ").filter(Boolean) : [];
    const hasMeaningfulAttempt = words.some((word) => word.length >= 2);

    if (
      isRecording &&
      hasMeaningfulAttempt &&
      Date.now() >= ignoreRecognizedUntilRef.current &&
      normalizedAttempt !== lastRecognizedAttemptRef.current
    ) {
      lastRecognizedAttemptRef.current = normalizedAttempt;
      resetIdleTracking();
    }
  }, [isRecording, recognizedText, resetIdleTracking]);

  useEffect(() => {
    clearIdleTimer();

    if (!isRecording || status !== "listening") return;

    idleIntervalRef.current = setInterval(() => {
      if (!sessionActiveRef.current) return;

      const now = Date.now();
      const lastActivity = lastActivityAtRef.current ?? now;
      const idleFor = now - lastActivity;
      setSilenceRemaining(Math.max(0, SESSION_LIMIT_MS - idleFor));

      if (idleFor >= SESSION_LIMIT_MS) {
        setCoachMessage("Time is up for this round. Let's see your report.");
        void handleStopSession();
        return;
      }

      if (promptActiveRef.current) return;

      if (promptStageRef.current < 2 && idleFor >= SECOND_CHECKPOINT_MS) {
        promptActiveRef.current = true;
        pausedAtRef.current = now;
        promptStageRef.current = 2;
        setPausePrompt("still-recording");
        setCoachMessage("Are you still recording?");
        return;
      }

      if (promptStageRef.current < 1 && idleFor >= FIRST_CHECKPOINT_MS) {
        promptActiveRef.current = true;
        pausedAtRef.current = now;
        promptStageRef.current = 1;
        setPausePrompt("continue");
        setCoachMessage("Do you want to keep reading?");
        return;
      }

      const nextHelperAt = (helperStepRef.current + 1) * STUCK_TIMEOUT_MS;
      const helperLimit =
        promptStageRef.current === 0
          ? FIRST_CHECKPOINT_MS
          : promptStageRef.current === 1
            ? SECOND_CHECKPOINT_MS
            : SESSION_LIMIT_MS;

      if (idleFor < nextHelperAt || nextHelperAt >= helperLimit) return;

      const activeWord = getWordAtCursor(story, cursor);
      if (!activeWord) return;

      lastSpokenWordRef.current = activeWord.id;
      helperStepRef.current += 1;
      helperAdvanceRef.current = true;
      setCoachMessage(`Let's try the next word together: ${activeWord.display}`);
      promptActiveRef.current = true;

      void (async () => {
        await speakWord(activeWord.display);

        if (!sessionActiveRef.current || isStoppingRef.current) {
          promptActiveRef.current = false;
          return;
        }

        const expectedIndex = expectedIndexByWordId.get(activeWord.id);
        if (
          expectedIndex !== undefined &&
          !helperSkippedWordsRef.current.some((item) => item.expected_index === expectedIndex)
        ) {
          helperSkippedWordsRef.current.push({
            expected_index: expectedIndex,
            word: activeWord.display,
          });
        }
        advanceManual("skipped");
        resetIdleTracking("Let's keep going with the next word.");
        promptActiveRef.current = false;
      })();
    }, 500);

    return clearIdleTimer;
  }, [
    advanceManual,
    clearIdleTimer,
    cursor,
    handleStopSession,
    isRecording,
    speakWord,
    status,
    story,
    expectedIndexByWordId,
  ]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      clearIdleTimer();
      if (synthRef.current) synthRef.current.cancel();
      if (helperAudioRef.current) {
        helperAudioRef.current.pause();
        helperAudioRef.current = null;
      }
    };
  }, [clearIdleTimer]);

  if (isEvaluating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19] text-white">
        <div className="w-16 h-16 border-4 border-[#1E293B] border-t-blue-500 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold tracking-widest text-blue-400">ANALYZING RECORDING...</h2>
      </div>
    );
  }

  const formatTime = (remainingMs: number) => {
     const totalSeconds = Math.ceil(remainingMs / 1000);
     const m = Math.floor(totalSeconds / 60);
     const s = totalSeconds % 60;
     return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <main className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans flex flex-col relative pb-32">
      <style>{`
        .word-active {
          background-color: rgba(99, 102, 241, 0.2) !important;
          border: 1px solid rgba(129, 140, 248, 0.8) !important;
          border-radius: 0.375rem !important;
          padding: 2px 4px !important;
          box-shadow: 0 0 10px rgba(99,102,241,0.5) !important;
          color: white !important;
        }
      `}</style>
      
      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-4">
        <Book className="w-8 h-8 text-blue-500 mr-3" />
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">ReadAloud</h1>
      </div>

      {/* Status Bar */}
      <div className="w-full bg-[#131A2A] border-y border-[#1E293B] py-2 text-center mb-10 shadow-sm">
        <span className="text-purple-400 text-sm font-semibold tracking-wider">
          {pausePrompt
            ? coachMessage
            : isRecording
              ? coachMessage
              : status === "ready"
                ? "Connected! Start reading..."
                : "Initializing..."}
        </span>
      </div>

      {/* Main Layout Grid */}
      <div className="w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
         
         {/* Left Column (70%) */}
         <div className="lg:col-span-8 bg-[#131A2A] rounded-xl p-8 border border-[#1E293B] shadow-lg flex flex-col items-center">
            <h2 className="text-2xl font-bold mb-8 text-white self-start">{story.title}</h2>
            <div className="text-xl md:text-2xl leading-[2.2em] text-slate-400 font-medium pb-8 w-full">
               <BlurGate story={story} cursor={cursor} />
            </div>
         </div>

         {/* Right Column (30%) */}
         <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-[#131A2A] rounded-xl p-6 border border-[#1E293B] shadow-lg">
               <h3 className="text-sm font-bold text-slate-500 tracking-widest uppercase mb-6 border-b border-[#1E293B] pb-4">PROGRESS</h3>
               
               <div className="flex flex-col gap-8">
                  <div className="flex flex-col">
                     <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2">Words read</span>
                     <div className="text-4xl font-bold text-white tracking-tight">{correctCount} <span className="text-xl text-slate-500 font-normal">/ {story.totalWords}</span></div>
                  </div>
                  
                  <div className="flex flex-col">
                     <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2">Silence timer</span>
                     <div className={`text-4xl font-bold tracking-tight ${silenceRemaining < 15000 ? 'text-red-400' : 'text-white'}`}>{formatTime(silenceRemaining)}</div>
                  </div>
               </div>
            </div>

            <div className="bg-[#131A2A] rounded-xl p-6 border border-[#1E293B] shadow-lg">
               <h3 className="text-sm font-bold text-slate-500 tracking-widest uppercase mb-4 border-b border-[#1E293B] pb-4">Reading Helper</h3>
               <p className="text-slate-300 leading-7">{coachMessage}</p>
               <p className="text-slate-500 text-sm mt-4">If you get stuck for 6 seconds, the app will say the word and move you to the next one.</p>
            </div>
         </div>

      </div>

      {pausePrompt && (
        <div className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-md bg-[#131A2A] border border-[#1E293B] rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-3">
              {pausePrompt === "continue" ? "Keep Reading?" : "Are You Still There?"}
            </h2>
            <p className="text-slate-300 leading-7 mb-6">
              {pausePrompt === "continue"
                ? "You have been quiet for a little while. Do you want to keep going?"
                : "We have not heard you for a while. Are you still recording?"}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleExitReading}
                className="px-5 py-3 rounded-full border border-slate-600 text-slate-200 hover:bg-slate-700/40 transition-colors"
              >
                No, Stop
              </button>
              <button
                onClick={handleContinueReading}
                className="px-5 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls Absolute Bottom Center */}
      <div className="fixed bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#0B0F19] to-transparent flex items-center justify-center gap-6 pb-4">
         
         <button 
           onClick={isRecording ? handleStopSession : handleStartSession}
           className="relative flex items-center justify-center bg-gradient-to-b from-blue-400 to-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.5)] w-16 h-16 rounded-full hover:scale-105 active:scale-95 transition-transform z-10"
         >
           {isRecording ? <Square fill="white" className="w-6 h-6 text-white" /> : <Mic className="w-8 h-8 text-white" />}
         </button>
         
         <button 
           onClick={() => window.location.reload()}
           className="flex items-center justify-center bg-[#131A2A] border border-[#1E293B] hover:bg-[#1E293B] w-12 h-12 rounded-full transition-colors text-slate-400 hover:text-white group z-10"
         >
           <RefreshCcw className="w-5 h-5 group-active:-rotate-90 transition-transform duration-300" />
         </button>

      </div>
    </main>
  );
}
