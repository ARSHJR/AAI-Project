from app.services.language_service import heuristic_detect


def test_detects_devanagari_as_hindi_native():
    result = heuristic_detect("मेरा ऑर्डर लेट है")
    assert result["detected_language"] == "hi"
    assert result["script"] == "native"


def test_detects_romanized_hindi():
    result = heuristic_detect("Mera order 3 din se late hai, kab aayega?")
    assert result is not None
    assert result["detected_language"] == "hi"
    assert result["script"] == "romanized"


def test_detects_romanized_marathi():
    result = heuristic_detect("Mala ha product return karaycha aahe")
    assert result is not None
    assert result["detected_language"] == "mr"


def test_detects_plain_english():
    result = heuristic_detect("Where is my order? It was supposed to arrive yesterday.")
    assert result["detected_language"] == "en"


def test_code_mixed_hindi_marathi_defers_to_llm():
    # Contains markers for both languages -> heuristic should not force a guess
    result = heuristic_detect("mala order nahi mila hai abhi tak")
    assert result is None
