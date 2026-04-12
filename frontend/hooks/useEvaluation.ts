"use client";

import { useState, useCallback } from "react";

const EVALUATION_API_BASE_URL = "/api/evaluation";

export interface EvaluationResult {
  [key: string]: unknown;
  accuracy_score?: number;
  fluency_score?: number;
  wpm?: number;
  total_words?: number;
  correct_words?: number;
  word_map?: EvaluationWord[];
}

export interface EvaluationWord {
  word: string;
  start?: number | null;
  end?: number | null;
  status: string;
}

interface UseEvaluationResult {
  isEvaluating: boolean;
  result: EvaluationResult | null;
  error: string | null;
  evaluateReading: (
    audioBlob: Blob,
    expectedText: string,
    helperSkippedWords?: Array<{ expected_index: number; word: string }>
  ) => Promise<void>;
  reset: () => void;
}

export function useEvaluation(): UseEvaluationResult {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const evaluateReading = useCallback(async (
    audioBlob: Blob,
    expectedText: string,
    helperSkippedWords: Array<{ expected_index: number; word: string }> = []
  ) => {
    console.log("[useEvaluation] [TRACE] evaluateReading invoked.");
    console.log("[useEvaluation] [TRACE] audioBlob Size:", (audioBlob.size / 1024).toFixed(2), "KB");
    console.log("[useEvaluation] [TRACE] audioBlob Type:", audioBlob.type);

    setIsEvaluating(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("audio", audioBlob, "evaluation_session.webm");
    formData.append("expected_text", expectedText);
    if (helperSkippedWords.length > 0) {
      formData.append("helper_skipped_words", JSON.stringify(helperSkippedWords));
    }

    console.log("[useEvaluation] [TRACE] FormData prepared. Dispatching POST request to Judges Core...");

    try {
      const response = await fetch(`${EVALUATION_API_BASE_URL}/evaluate`, {
        method: "POST",
        body: formData,
      });

      console.log("[useEvaluation] [TRACE] Network response received. HTTP Status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[useEvaluation] [ERROR] Handshake rejected by server:", errorText);
        throw new Error(`Evaluation failed (${response.status}): ${response.statusText}`);
      }

      const data: EvaluationResult = await response.json();
      console.log("[useEvaluation] [SUCCESS] Received Evaluation Results from Judge Engine:", data);
      setResult(data);
    } catch (err) {
      console.error("[useEvaluation] [CRITICAL] The bridge between Frontend and Backend has failed:", err);
      setError((err as Error).message);
    } finally {
      console.log("[useEvaluation] [TRACE] evaluateReading process finished.");
      setIsEvaluating(false);
    }
  }, []);

  const reset = useCallback(() => {
    console.log("[useEvaluation] [TRACE] State reset requested.");
    setResult(null);
    setError(null);
    setIsEvaluating(false);
  }, []);

  return {
    isEvaluating,
    result,
    error,
    evaluateReading,
    reset,
  };
}
