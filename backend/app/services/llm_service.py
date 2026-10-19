"""Thin LLM wrapper with structured-output parsing and timeout/retry handling.

Keeps provider choice (Groq / Gemini) swappable behind one function, and
isolates the one place that must defend against malformed structured output.
"""
import json
import logging

from tenacity import retry, stop_after_attempt, wait_fixed

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class LLMError(Exception):
    pass


def _call_groq(system_prompt: str, user_prompt: str) -> str:
    from groq import Groq

    settings = get_settings()
    client = Groq(api_key=settings.groq_api_key)
    completion = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
        timeout=20,
    )
    return completion.choices[0].message.content


def _call_gemini(system_prompt: str, user_prompt: str) -> str:
    import google.generativeai as genai

    settings = get_settings()
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.gemini_model, system_instruction=system_prompt)
    resp = model.generate_content(
        user_prompt,
        generation_config={"temperature": 0.2, "response_mime_type": "application/json"},
        request_options={"timeout": 20},
    )
    return resp.text


@retry(stop=stop_after_attempt(2), wait=wait_fixed(1), reraise=True)
def call_structured_llm(system_prompt: str, user_prompt: str) -> dict:
    """Calls the configured LLM provider and parses a JSON object response.

    Retries once on transport/timeout errors. Raises LLMError on repeated
    failure or on malformed JSON so callers can apply a deterministic
    fallback rather than trusting a broken response.
    """
    settings = get_settings()
    if not settings.llm_configured:
        raise LLMError("No LLM provider configured (set GROQ_API_KEY or GEMINI_API_KEY)")

    try:
        if settings.llm_provider == "gemini":
            raw = _call_gemini(system_prompt, user_prompt)
        else:
            raw = _call_groq(system_prompt, user_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM call failed: %s", exc)
        raise LLMError(str(exc)) from exc

    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("LLM returned malformed JSON: %r", raw)
        raise LLMError(f"Malformed structured output: {exc}") from exc
