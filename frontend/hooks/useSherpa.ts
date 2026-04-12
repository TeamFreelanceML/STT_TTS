"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Story, Word, ReadingCursor } from "@/lib/types";
import { normalizeWord, getWordAtCursor, advanceCursor } from "@/lib/parseStory";

// ---------------------------------------------------------------------------
// Types for Sherpa-ONNX WASM
// ---------------------------------------------------------------------------

interface SherpaModule {
  onRuntimeInitialized?: () => void;
  locateFile?: (path: string, scriptDirectory: string) => string;
  setStatus?: (text: string) => void;
  [key: string]: any;
}

interface SherpaOnlineRecognizer {
  createStream: () => SherpaOnlineStream;
  isReady: (stream: SherpaOnlineStream) => boolean;
  decode: (stream: SherpaOnlineStream) => void;
  getResult: (stream: SherpaOnlineStream) => { text: string };
  delete?: () => void;
  free?: () => void;
}

interface SherpaOnlineStream {
  acceptWaveform: (sampleRate: number, samples: Float32Array) => void;
  inputFinished: () => void;
  delete?: () => void;
  free?: () => void;
}

// Global declaration for window object properties
declare global {
  interface Window {
    Module: SherpaModule;
    createOnlineRecognizer: (module: any, config: any) => SherpaOnlineRecognizer;
    [key: string]: any;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 16000;
const WASM_BASE_PATH = "/sherpa-onnx";

function formatInitError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Utility: Levenshtein distance for fuzzy word matching
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Hook: useSherpa
// ---------------------------------------------------------------------------

export type SherpaStatus = "idle" | "loading" | "ready" | "listening" | "error";

export interface SherpaHookResult {
  status: SherpaStatus;
  statusMessage: string;
  start: (existingStream?: MediaStream) => Promise<void>; // Support shared stream
  stop: () => void;
  recognizedText: string;
  cursor: ReadingCursor;
  correctCount: number;
  advanceManual: (status: "correct" | "skipped") => void;
}

/**
 * useSherpa — Neural STT engine using Sherpa-ONNX WebAssembly.
 * Handles Fast Refresh resiliency and real-time word highlighting.
 */
export function useSherpa(story: Story | null): SherpaHookResult {
  const [status, setStatus] = useState<SherpaStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Idle");
  const [recognizedText, setRecognizedText] = useState("");
  const [cursor, setCursor] = useState<ReadingCursor>({
    paragraphIndex: 0,
    sentenceIndex: 0,
    chunkIndex: 0,
    wordIndex: 0,
  });
  const [correctCount, setCorrectCount] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Mutable Refs
  const recognizerRef = useRef<SherpaOnlineRecognizer | null>(null);
  const streamRef = useRef<SherpaOnlineStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rawMediaStreamRef = useRef<MediaStream | null>(null);
  
  const cursorRef = useRef<ReadingCursor>(cursor);
  const storyRef = useRef<Story | null>(story);
  const correctCountRef = useRef<number>(0);
  const lastResultRef = useRef<string>("");
  const statusRef = useRef(status);

  // Sync refs with state
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { storyRef.current = story; }, [story]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // -------------------------------------------------------------------------
  // Load WASM Module (With Hot-Reload Guard)
  // -------------------------------------------------------------------------

  const loadWasmModule = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Cannot load WASM in SSR context"));
        return;
      }

      // [FIX] Hot-Reload Guard
      if (document.querySelector('script[src*="sherpa-onnx.js"]')) {
        console.log("[useSherpa] WASM Scripts already present. Skipping injection.");
        if (typeof window.createOnlineRecognizer === "function") {
           setStatus("ready");
        }
        resolve();
        return;
      }

      if (window.Module && typeof window.createOnlineRecognizer === "function") {
        setStatus("ready");
        resolve();
        return;
      }

      setStatus("loading");
      setStatusMessage("Loading Neural Engine...");

      const win = window as any;
      const origProcess = win.process;
      const origRequire = win.require;
      win.process = undefined;
      win.require = undefined;

      const moduleConfig: SherpaModule = {
        locateFile: (path: string) => {
          if (path.endsWith(".wasm") || path.endsWith(".data")) {
            return `${WASM_BASE_PATH}/${path}`;
          }
          return path;
        },
        setStatus: (text: string) => {
          if (!text) setStatusMessage("Neural Engine active");
          else setStatusMessage(text);
        },
        onRuntimeInitialized: () => {
          console.log("[useSherpa] WASM Runtime Initialized");
          win.process = origProcess;
          win.require = origRequire;

          (async () => {
            try {
              console.log("[useSherpa] Configuring Neural Recognizer...");

              const config = {
                featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
                modelConfig: {
                  transducer: {
                    encoder: "./encoder.onnx",
                    decoder: "./decoder.onnx",
                    joiner: "./joiner.onnx",
                  },
                  tokens: "./tokens.txt",
                  modelType: "zipformer",
                },
              };

              const recognizer = window.createOnlineRecognizer(window.Module, config);
              if (!recognizer) throw new Error("createOnlineRecognizer returned null");

              recognizerRef.current = recognizer;
              setStatus("ready");
              setStatusMessage("Ready — Click Start to begin reading");
              resolve();
            } catch (err) {
              console.error("[useSherpa] Initialization Failure:", err);
              setStatus("error");
              setStatusMessage(`ASR Initializer Failed: ${formatInitError(err)}`);
              reject(err);
            }
          })().catch(reject);
        }
      };

      window.Module = moduleConfig;

      const apiScriptPath = `${WASM_BASE_PATH}/sherpa-onnx.js`;
      const apiScript = document.createElement("script");
      apiScript.src = apiScriptPath;
      apiScript.async = true;
      apiScript.onload = () => {
        const glueScriptPath = `${WASM_BASE_PATH}/sherpa-onnx-wasm-main-asr.js`;
        const glueScript = document.createElement("script");
        glueScript.src = glueScriptPath;
        glueScript.async = true;
        glueScript.onerror = () => {
          setStatus("error");
          setStatusMessage("Failed to load binary glue");
          reject(new Error("Glue fetch failure"));
        };
        document.head.appendChild(glueScript);
      };
      apiScript.onerror = () => {
        setStatus("error");
        setStatusMessage("Failed to load API");
        reject(new Error("API fetch failure"));
      };
      document.head.appendChild(apiScript);
    });
  }, []);

  useEffect(() => {
    if (!hasInitialized && typeof window !== "undefined") {
      setHasInitialized(true);
      loadWasmModule().catch(() => {});
    }
  }, [hasInitialized, loadWasmModule]);

  // -------------------------------------------------------------------------
  // Match results
  // -------------------------------------------------------------------------

  const processResult = useCallback((text: string) => {
    const curStory = storyRef.current;
    if (!curStory || !text.trim()) return;

    const tokens = text.trim().split(/\s+/).map(t => normalizeWord(t)).filter(t => t.length > 0);
    if (tokens.length === 0) return;

    const lastToken = tokens[tokens.length - 1];
    const curCursor = cursorRef.current;

    let matchedPos: { cursor: ReadingCursor; word: Word } | null = null;
    let scanCursor: ReadingCursor | null = { ...curCursor };

    for (let i = 0; i < 5; i++) {
        if (!scanCursor) break;
        const targetWord = getWordAtCursor(curStory, scanCursor);
        if (!targetWord) break;

        const isExact = lastToken === targetWord.text;
        const isFuzzy = targetWord.text.length > 2 && levenshteinDistance(lastToken, targetWord.text) <= 1;

        if (isExact || isFuzzy) {
          matchedPos = { cursor: { ...scanCursor }, word: targetWord };
          break;
        }
        scanCursor = advanceCursor(curStory, scanCursor);
    }

    if (matchedPos) {
      matchedPos.word.status = "correct";
      correctCountRef.current++;
      setCorrectCount(correctCountRef.current);

      const next = advanceCursor(curStory, matchedPos.cursor);
      if (next) {
        const nextWord = getWordAtCursor(curStory, next);
        if (nextWord) nextWord.status = "active";
        setCursor(next);
        cursorRef.current = next;
      } else {
        setCursor({ paragraphIndex: -1, sentenceIndex: -1, chunkIndex: -1, wordIndex: -1 });
        setStatus("ready"); 
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // Progressive Reset
  // -------------------------------------------------------------------------

  const resetStoryProgress = useCallback(() => {
    const curStory = storyRef.current;
    if (!curStory) return;

    for (const paragraph of curStory.paragraphs) {
      for (const sentence of paragraph.sentences) {
        for (const chunk of sentence.chunks) {
          for (const word of chunk.words) {
            word.status = "pending";
          }
        }
      }
    }

    const startCursor = {
      paragraphIndex: 0,
      sentenceIndex: 0,
      chunkIndex: 0,
      wordIndex: 0,
    };

    const firstWord = getWordAtCursor(curStory, startCursor);
    if (firstWord) firstWord.status = "active";

    setCursor(startCursor);
    cursorRef.current = startCursor;
    correctCountRef.current = 0;
    setCorrectCount(0);
  }, []);

  const advanceManual = useCallback((newStatus: "correct" | "skipped") => {
    const curStory = storyRef.current;
    if (!curStory) return;

    const targetWord = getWordAtCursor(curStory, cursorRef.current);
    if (!targetWord) return;

    targetWord.status = newStatus;
    if (newStatus === "correct") {
      correctCountRef.current++;
      setCorrectCount(correctCountRef.current);
    }

    const next = advanceCursor(curStory, cursorRef.current);
    if (next) {
      const nextWord = getWordAtCursor(curStory, next);
      if (nextWord) nextWord.status = "active";
      setCursor(next);
      cursorRef.current = next;
    } else {
      setCursor({ paragraphIndex: -1, sentenceIndex: -1, chunkIndex: -1, wordIndex: -1 });
      setStatus("ready");
    }
  }, []);

  // -------------------------------------------------------------------------
  // Recording controls
  // -------------------------------------------------------------------------

  const start = useCallback(async (existingStream?: MediaStream) => {
    if (!storyRef.current) return;
    if (!recognizerRef.current) return;

    resetStoryProgress();

    try {
      /** [PRODUCTION BUGFIX] SHARED STREAM PROTECTION
       * If an existing stream is provided (from the recorder), we share it.
       * This prevents hardware allocation errors when requesting the mic twice.
       */
      if (existingStream) {
        console.log("[useSherpa] Sharing existing microphone stream...");
        rawMediaStreamRef.current = existingStream;
      } else {
        console.log("[useSherpa] Requesting new microphone access...");
        rawMediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
          audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true } 
        });
      }

      // Initialize Audio processing at 16kHz for Sherpa
      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(rawMediaStreamRef.current);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      const stream = recognizerRef.current.createStream();
      streamRef.current = stream;

      processor.onaudioprocess = (e) => {
        if (statusRef.current !== "listening") return;
        const inputData = e.inputBuffer.getChannelData(0);
        stream.acceptWaveform(SAMPLE_RATE, inputData);
        
        while (recognizerRef.current?.isReady?.(stream) ?? true) {
          recognizerRef.current?.decode?.(stream);
        }

        const result = recognizerRef.current?.getResult(stream);
        if (result?.text && result.text !== lastResultRef.current) {
          lastResultRef.current = result.text;
          setRecognizedText(result.text);
          processResult(result.text);
        }
      };

      processorRef.current = processor;
      setStatus("listening");
      setStatusMessage("Listening — Please read aloud");
    } catch (err) {
      setStatus("error");
      setStatusMessage(`Microphone Fail: ${(err as Error).message}`);
    }
  }, [resetStoryProgress, processResult]);

  const stop = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
    }
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    
    // Only stop tracks if WE created the stream (not if shared)
    // Actually in this app UI, we stop everything at once.
    if (rawMediaStreamRef.current) {
        rawMediaStreamRef.current.getTracks().forEach(t => t.stop());
    }

    if (streamRef.current) {
      const stream = streamRef.current;
      if (stream.free) stream.free();
      else if (stream.delete) (stream as any).delete();
      streamRef.current = null;
    }

    processorRef.current = null;
    audioCtxRef.current = null;
    rawMediaStreamRef.current = null;
    lastResultRef.current = "";
    setStatus("ready");
    setStatusMessage("Session Ended");
    setRecognizedText("");
  }, []);

  return { status, statusMessage, start, stop, recognizedText, cursor, correctCount, advanceManual };
}
