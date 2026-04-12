// =============================================================================
// BlurGate.tsx - Visibility Gate Component
// =============================================================================
// Controls the reading focus so only the active paragraph is clearly visible.
// Chunks and words inside that paragraph continue to update based on reading.
// =============================================================================

"use client";

import React, { useMemo } from "react";
import type { Story, ReadingCursor, Word } from "@/lib/types";

interface BlurGateProps {
  story: Story;
  cursor: ReadingCursor;
}

function getParagraphDistance(
  paragraphIndex: number,
  cursor: ReadingCursor
): number {
  if (cursor.paragraphIndex < 0) return 0;
  return Math.abs(paragraphIndex - cursor.paragraphIndex);
}

function getWordClasses(word: Word, isInActiveChunk: boolean): string {
  const base = "word-span inline transition-all duration-300 ease-out";

  switch (word.status) {
    case "active":
      return `${base} word-active`;
    case "correct":
      return `${base} word-correct`;
    case "skipped":
      return `${base} word-skipped`;
    case "wrong":
      return `${base} word-wrong`;
    case "pending":
    default:
      return `${base} ${isInActiveChunk ? "word-pending-visible" : "word-pending"}`;
  }
}

function getParagraphStyles(distance: number): React.CSSProperties {
  if (distance === 0) {
    return {
      filter: "blur(0px)",
      opacity: 1,
      transition: "filter 0.4s ease, opacity 0.4s ease",
    };
  }
  if (distance === 1) {
    return {
      filter: "blur(4px)",
      opacity: 0.35,
      transition: "filter 0.4s ease, opacity 0.4s ease",
    };
  }

  return {
    filter: "blur(8px)",
    opacity: 0.15,
    transition: "filter 0.4s ease, opacity 0.4s ease",
  };
}

function getChunkStyles(isActive: boolean): React.CSSProperties {
  return {
    display: "inline",
    padding: "0.18rem 0.28rem",
    borderRadius: "0.5rem",
    background: isActive ? "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(99,102,241,0.16))" : "transparent",
    boxShadow: isActive ? "0 0 0 1px rgba(96,165,250,0.28), 0 10px 24px rgba(37,99,235,0.14)" : "none",
    transition:
      "background 220ms ease, box-shadow 220ms ease, transform 220ms ease, opacity 220ms ease",
  };
}

export default function BlurGate({ story, cursor }: BlurGateProps) {
  const content = useMemo(() => {
    return story.paragraphs.map((paragraph, pIdx) => {
      const paragraphStyle = getParagraphStyles(getParagraphDistance(pIdx, cursor));

      return (
        <div
          key={paragraph.id}
          className="paragraph-block mb-8 leading-relaxed"
          id={`paragraph-${pIdx}`}
          style={paragraphStyle}
        >
          {paragraph.sentences.map((sentence, sIdx) => (
            <span key={sentence.id} className="sentence-span">
              {sentence.chunks.map((chunk, cIdx) => {
                const isActive =
                  pIdx === cursor.paragraphIndex &&
                  sIdx === cursor.sentenceIndex &&
                  cIdx === cursor.chunkIndex;

                return (
                  <span
                    key={chunk.id}
                    className={`chunk-span inline ${
                      isActive ? "chunk-active" : ""
                    } ${chunk.status === "complete" ? "chunk-complete" : ""}`}
                    id={`chunk-${pIdx}-${sIdx}-${cIdx}`}
                    style={getChunkStyles(isActive)}
                  >
                    {chunk.words.map((word, wIdx) => (
                      <span
                        key={word.id}
                        className={getWordClasses(word, isActive)}
                        id={`word-${pIdx}-${sIdx}-${cIdx}-${wIdx}`}
                      >
                        {word.display}
                        {wIdx < chunk.words.length - 1 ? " " : ""}
                      </span>
                    ))}
                    {cIdx < sentence.chunks.length - 1 ? " " : ""}
                  </span>
                );
              })}
              {sIdx < paragraph.sentences.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      );
    });
  }, [story, cursor]);

  return (
    <div className="blur-gate-container" id="blur-gate">
      {content}
    </div>
  );
}
