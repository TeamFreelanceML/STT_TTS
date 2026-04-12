"""
utils/text_normalizer.py

NLP module to normalize abbreviations, currencies, and numbers 
before they reach the TTS engine, ensuring flawless pronunciation.
"""
import re

ABBREVIATIONS = {
    r"\bDr\.": "Doctor",
    r"\bMr\.": "Mister",
    r"\bMrs\.": "Missus",
    r"\bMs\.": "Miss",
    r"\bProf\.": "Professor",
    r"\bSt\.": "Street", # Context dependent, but typically street
    r"\bvs\.": "versus",
    r"\betc\.": "et cetera",
    r"&": "and",
}

_ELLIPSIS_PATTERN = re.compile(r"\.{2,}")

def normalize_tts_text(text: str) -> str:
    """
    Apply safe NLP expansions to ensure TTS engine correctly pronounces
    symbols, abbreviations, and currencies.
    """
    if not text:
        return text

    # Normalize ellipses (trailing dots) to a single period to avoid phonemizer confusion
    text = _ELLIPSIS_PATTERN.sub(".", text)

    # Expand common abbreviations
    for pattern, replacement in ABBREVIATIONS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Expand basic currencies (e.g. $1,200 -> 1,200 dollars)
    # Note: Kokoro handles the digits well, but explicitly saying "dollars" helps
    text = re.sub(r"\$([\d,]+(?:\.\d{2})?)", r"\1 dollars", text)
    
    # Expand simple percentages
    text = re.sub(r"(\d+)%", r"\1 percent", text)

    return text
