// =============================================================================
// Scorecard.tsx — Placeholder for Phase 4 Deep Grader UI
// =============================================================================
// This component will display the full evaluation scorecard after
// the backend processes the recorded .webm file. Stubbed for Phase 1.
// =============================================================================

"use client";

import React from "react";

interface ScorecardProps {
  visible: boolean;
  totalWords: number;
  correctCount: number;
}

export default function Scorecard({
  visible,
  totalWords,
  correctCount,
}: ScorecardProps) {
  if (!visible) return null;

  const accuracy = totalWords > 0 ? ((correctCount / totalWords) * 100).toFixed(1) : "0.0";

  return (
    <div className="scorecard-overlay" id="scorecard-overlay">
      <div className="scorecard-card" id="scorecard-card">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-emerald-400 bg-clip-text text-transparent">
            Reading Complete!
          </h2>
          <p className="text-white/50 mt-2 text-sm">
            Edge STT Results (Full grading available in Phase 4)
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="stat-card">
            <div className="text-2xl font-bold text-amber-400">{correctCount}</div>
            <div className="text-xs text-white/40 uppercase tracking-wider">
              Words Matched
            </div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold text-emerald-400">{accuracy}%</div>
            <div className="text-xs text-white/40 uppercase tracking-wider">
              Edge Accuracy
            </div>
          </div>
        </div>

        <p className="text-white/30 text-xs text-center">
          Deep grading with WCPM, chunking score, and word-level analysis
          will be available after backend processing (Phase 4).
        </p>
      </div>
    </div>
  );
}
