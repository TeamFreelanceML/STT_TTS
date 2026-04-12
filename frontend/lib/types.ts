// =============================================================================
// types.ts — Story Hierarchy Data Model
// =============================================================================
// Strict hierarchy: Story → Paragraph → Sentence → Chunk → Word
// Every evaluated word maps to an exact coordinate in this system.
// =============================================================================

/** Status of an individual word during the reading session */
export type WordStatus =
  | "pending"   // Not yet reached
  | "active"    // Currently expected word
  | "correct"   // Successfully recognized
  | "skipped"   // Missed / TTS rescue triggered (Phase 2)
  | "wrong";    // Mispronounced

/** Status of a chunk during the reading session */
export type ChunkStatus =
  | "pending"   // Not yet reached
  | "active"    // Currently being read
  | "complete"  // All words recognized
  | "failed";   // Contains skipped/wrong words or timing violations

/**
 * A single word in the story.
 * The `id` encodes its exact position: "p{i}-s{j}-c{k}-w{l}"
 */
export interface Word {
  /** Hierarchical coordinate ID, e.g. "p0-s0-c0-w0" */
  id: string;
  /** Cleaned, lowercased text for matching against STT output */
  text: string;
  /** Original display text with casing and trailing punctuation */
  display: string;
  /** Current status of this word */
  status: WordStatus;
  /** Parent paragraph index */
  paragraphIndex: number;
  /** Parent sentence index (within paragraph) */
  sentenceIndex: number;
  /** Parent chunk index (within sentence) */
  chunkIndex: number;
  /** Word index (within chunk) */
  wordIndex: number;
}

/**
 * A chunk is a phrase within a sentence, delimited by natural
 * punctuation (commas, dashes, quotes, conjunctions).
 */
export interface Chunk {
  /** Hierarchical coordinate ID, e.g. "p0-s0-c0" */
  id: string;
  /** Ordered words in this chunk */
  words: Word[];
  /** Current status of this chunk */
  status: ChunkStatus;
}

/**
 * A sentence within a paragraph, delimited by sentence-ending
 * punctuation (. ! ? ; :).
 */
export interface Sentence {
  /** Hierarchical coordinate ID, e.g. "p0-s0" */
  id: string;
  /** Ordered chunks in this sentence */
  chunks: Chunk[];
  /** Original full text of the sentence */
  text: string;
}

/** A paragraph in the story, delimited by blank lines. */
export interface Paragraph {
  /** Hierarchical coordinate ID, e.g. "p0" */
  id: string;
  /** Ordered sentences in this paragraph */
  sentences: Sentence[];
}

/** The top-level story container. */
export interface Story {
  /** Display title */
  title: string;
  /** Ordered paragraphs */
  paragraphs: Paragraph[];
  /** Total word count across all paragraphs */
  totalWords: number;
  /** Total chunk count across all paragraphs */
  totalChunks: number;
}

/**
 * Position cursor for the highlight engine.
 * Points to the currently active word in the hierarchy.
 */
export interface ReadingCursor {
  paragraphIndex: number;
  sentenceIndex: number;
  chunkIndex: number;
  wordIndex: number;
}

/**
 * WASM engine loading states.
 */
export type SherpaStatus =
  | "idle"
  | "loading"
  | "ready"
  | "listening"
  | "error";

/**
 * The return type of the useSherpa hook.
 */
export interface SherpaHookResult {
  /** Current engine status */
  status: SherpaStatus;
  /** Human-readable status message */
  statusMessage: string;
  /** Start listening to the microphone */
  start: () => Promise<void>;
  /** Stop listening */
  stop: () => void;
  /** Latest text recognized by the WASM engine */
  recognizedText: string;
  /** Current reading cursor position */
  cursor: ReadingCursor;
  /** Count of correctly matched words */
  correctCount: number;
}
