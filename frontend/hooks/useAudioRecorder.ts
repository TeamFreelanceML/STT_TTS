"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface AudioRecorderResult {
  /** Whether the recorder is currently capturing */
  isRecording: boolean;
  /** Start capturing audio into WebM container */
  startRecording: (stream: MediaStream) => void;
  /** Stop capturing and return the final Blob */
  stopRecording: () => Promise<Blob | null>;
  /** The final recorded Blob after stopping */
  recordedBlob: Blob | null;
}

/**
 * useAudioRecorder — High-fidelity WebM audio capture.
 * Captures 48kHz opus/webm for Phase 3 Whisper grading.
 * Implements Idempotent Stop logic to prevent race conditions.
 */
export function useAudioRecorder(): AudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Track the ongoing stop promise to prevent race conditions
  const stopPromiseRef = useRef<Promise<Blob | null> | null>(null);
  // Persist the final blob so subsequent calls to stopRecording() return it instead of null
  const lastBlobRef = useRef<Blob | null>(null);

  // -------------------------------------------------------------------------
  // Start Recording
  // -------------------------------------------------------------------------
  const startRecording = useCallback((stream: MediaStream) => {
    console.log("[useAudioRecorder] [ACTION] Initializing new recording session...");
    setIsRecording(true);
    setRecordedBlob(null);
    lastBlobRef.current = null;
    chunksRef.current = [];
    stopPromiseRef.current = null;

    try {
      // Configuration for high-fidelity audio
      const options = { mimeType: "audio/webm;codecs=opus" };
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      console.log("[useAudioRecorder] Recording started (48kHz WebM)");
    } catch (err) {
      console.error("[useAudioRecorder] Failed to start recorder:", err);
      setIsRecording(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Stop Recording (Idempotent Promise Logic)
  // -------------------------------------------------------------------------
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    // 1. If a stop is currently in flight, return that existing promise
    if (stopPromiseRef.current) {
      console.log("[useAudioRecorder] [RACE] stopRecording called while already stopping. Returning existing promise.");
      return stopPromiseRef.current;
    }

    // 2. If the recorder is already inactive, return the last captured blob (if any)
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      console.log("[useAudioRecorder] [RACE] stopRecording called on inactive recorder. Returning last known blob.");
      setIsRecording(false);
      return lastBlobRef.current;
    }

    // 3. Create and store the stop promise
    stopPromiseRef.current = new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }

      // Handle the final data processing
      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
        lastBlobRef.current = finalBlob;
        setRecordedBlob(finalBlob);
        setIsRecording(false);
        stopPromiseRef.current = null; // Reset for the next session
        
        console.log("[useAudioRecorder] [SUCCESS] Recording finalized. Session Blob size:", (finalBlob.size / 1024).toFixed(1), "KB");
        resolve(finalBlob);
      };

      recorder.stop();
    });

    return stopPromiseRef.current;
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordedBlob,
  };
}
