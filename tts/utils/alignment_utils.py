"""
utils/alignment_utils.py
------------------------
Text splitting and timestamp alignment utilities for the narration pipeline.

Public API (used by story_tts_service.py):

    split_paragraph_into_chunks(paragraph_text, delimiter)   → List[str]
    offset_word_timestamps(word_timestamp_list, offset_ms)   → List[dict]
    label_word_ids(word_timestamp_list, paragraph_id, ...)   → List[dict]
    make_chunk_id(paragraph_id, chunk_index)                 → str
    extract_word_text(word_timestamp_dict)                   → str
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


# ─────────────────────────────────────────────────────────────────────────────
# CHUNK SPLITTING
# ─────────────────────────────────────────────────────────────────────────────

# Default delimiter — matches [...] with optional internal whitespace
_DEFAULT_DELIMITER_PATTERN = re.compile(r"\[\s*\.\.\.\s*\]")
DEFAULT_CHUNK_DELIMITER = "[...]"


def split_paragraph_into_chunks(
    paragraph_text: str,
    delimiter: str = DEFAULT_CHUNK_DELIMITER,
) -> List[str]:
    """
    Split a paragraph on the given chunk delimiter.

    Default delimiter is "[...]". Clients may pass any custom string
    (e.g. "||", "---", "<br>"). The delimiter is removed from output.

    Rules:
        - Delimiter is removed from each chunk.
        - Each chunk is whitespace-stripped.
        - Empty chunks after stripping are discarded.

    Examples:
        split_paragraph_into_chunks("Hello. [...] Goodbye.")
        → ["Hello.", "Goodbye."]

        split_paragraph_into_chunks("Hello. || Goodbye.", delimiter="||")
        → ["Hello.", "Goodbye."]

    Args:
        paragraph_text: Raw paragraph string.
        delimiter:      Chunk boundary marker. Default "[...]".

    Returns:
        Ordered list of non-empty trimmed chunk strings.
    """
    if delimiter == DEFAULT_CHUNK_DELIMITER:
        # Use regex for default to allow whitespace variants like "[ ... ]"
        raw_chunks = _DEFAULT_DELIMITER_PATTERN.split(paragraph_text)
    else:
        # Exact string split for custom delimiters
        raw_chunks = paragraph_text.split(delimiter)

    chunks = [chunk.strip() for chunk in raw_chunks if chunk.strip()]
    
    # NLP Auto-Chunker Fallback:
    if len(chunks) == 1 and len(chunks[0].split()) > 15:
        import re as _nlp_re
        # Splitting efficiently on (.?!) keeping capitalization and punctuation intact
        auto_chunks = _nlp_re.split(r'(?<=[.?!])\s+', chunks[0])
        chunks = [c.strip() for c in auto_chunks if c.strip()]
        
    return chunks


# ─────────────────────────────────────────────────────────────────────────────
# TIMESTAMP OFFSETTING
# ─────────────────────────────────────────────────────────────────────────────

def offset_word_timestamps(
    word_timestamp_list: List[Dict[str, Any]],
    offset_ms: int,
) -> List[Dict[str, Any]]:
    """
    Shift every word's start_ms and end_ms forward by offset_ms.

    Used to align per-chunk word timestamps into the merged stream timeline.
    Does not mutate input dicts — returns new dicts.
    """
    return [
        {
            **word_timestamp,
            "start_ms": int(word_timestamp.get("start_ms", 0)) + offset_ms,
            "end_ms":   int(word_timestamp.get("end_ms",   0)) + offset_ms,
        }
        for word_timestamp in word_timestamp_list
    ]


# ─────────────────────────────────────────────────────────────────────────────
# WORD ID LABELING
# ─────────────────────────────────────────────────────────────────────────────

def label_word_ids(
    word_timestamp_list: List[Dict[str, Any]],
    paragraph_id: int,
    word_counter_offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Assign a globally unique word_id to each word timestamp dict.

    Format: p{paragraph_id}_w{1-based sequential index}

    word_counter_offset allows numbering to continue across chunks
    in the same paragraph so IDs never reset mid-paragraph.
    """
    return [
        {
            **word_timestamp,
            "word_id": f"p{paragraph_id}_w{word_counter_offset + position + 1}",
        }
        for position, word_timestamp in enumerate(word_timestamp_list)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# ID HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def make_chunk_id(paragraph_id: int, chunk_index: int) -> str:
    """
    Build the chunk_id string: p{paragraph_id}_c{1-based chunk index}
    Example: paragraph_id=1, chunk_index=0 → "p1_c1"
    """
    return f"p{paragraph_id}_c{chunk_index + 1}"


def extract_word_text(word_timestamp_dict: Dict[str, Any]) -> str:
    """
    Extract the surface word string from a word timestamp dict.
    Engine returns key "word"; older engines may use "text".
    Falls back to empty string if neither key is present.
    """
    return word_timestamp_dict.get("word") or word_timestamp_dict.get("text") or ""