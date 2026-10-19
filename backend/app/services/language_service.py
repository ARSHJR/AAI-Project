"""Language detection for English / Hindi / Marathi, including Romanized and
code-mixed (Hinglish/Marlish) text.

Approach: fast deterministic signals first (Devanagari script, common
Romanized Hindi/Marathi function words), then LLM for ambiguous cases. This
keeps the common WhatsApp-style "Mera order 3 din se late hai" path fast and
free of LLM flakiness, while still handling genuinely ambiguous input.
"""
import re

from app.services.llm_service import LLMError, call_structured_llm

DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")

# Romanized function words strongly indicative of Hindi/Marathi, used for
# code-mixed WhatsApp-style text where script is pure ASCII.
HINDI_MARKERS = {
    "hai", "mera", "meri", "mujhe", "chahiye", "kab", "aayega", "aaega",
    "nahi", "mila", "kyu", "kyun", "kaise", "abhi", "tak", "din", "se",
    "raha", "rahi", "hua", "karo", "karna", "bhai", "humein", "humko",
}
MARATHI_MARKERS = {
    "aahe", "mala", "pahije", "karaycha", "karaychi", "kadhi", "yeil",
    "milala", "milali", "zala", "zali", "karaa", "dyava", "kasa", "tyacha",
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z]+", text.lower())


def heuristic_detect(text: str) -> dict | None:
    if DEVANAGARI_RE.search(text):
        # Pure Devanagari - still need Hindi vs Marathi distinction, which is
        # hard heuristically; let the LLM decide script-vs-language for this case
        # unless it's unambiguous common Hindi.
        return {"detected_language": "hi", "script": "native", "confidence": 0.7}

    tokens = set(_tokenize(text))
    if not tokens:
        return None

    hindi_hits = tokens & HINDI_MARKERS
    marathi_hits = tokens & MARATHI_MARKERS

    if marathi_hits and not hindi_hits:
        return {"detected_language": "mr", "script": "romanized", "confidence": 0.8}
    if hindi_hits and not marathi_hits:
        return {"detected_language": "hi", "script": "romanized", "confidence": 0.8}
    if hindi_hits and marathi_hits:
        # Code-mixed / ambiguous - defer to LLM
        return None

    # No markers at all -> looks like plain English
    non_english_ratio = 0
    return {"detected_language": "en", "script": "native", "confidence": 0.9}


def detect_language(text: str) -> dict:
    heuristic = heuristic_detect(text)
    if heuristic is not None and heuristic["confidence"] >= 0.75:
        return {**heuristic, "normalized": text.strip(), "source": "heuristic"}

    system_prompt = (
        "You detect the language of short Indian e-commerce customer support "
        "messages. Languages supported: English (en), Hindi (hi), Marathi (mr). "
        "Text may be Romanized or code-mixed (Hinglish/Marlish) as typed on "
        "WhatsApp. Respond ONLY with JSON: "
        '{"detected_language": "en|hi|mr", "script": "native|romanized", '
        '"confidence": 0.0-1.0, "normalized": "<cleaned version of the text>"}'
    )
    try:
        result = call_structured_llm(system_prompt, text)
        result.setdefault("normalized", text.strip())
        result["source"] = "llm"
        return result
    except LLMError:
        fallback = heuristic or {"detected_language": "en", "script": "native", "confidence": 0.4}
        return {**fallback, "normalized": text.strip(), "source": "fallback"}
