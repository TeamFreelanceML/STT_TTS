from evaluator import ReadingEvaluator


def test_evaluator_returns_score_sections():
    evaluator = ReadingEvaluator()
    expected_text = "One bright day. [...] The bird sang."
    whisper_words = [
        {"word": "One", "start": 0.0, "end": 0.2, "probability": 0.9},
        {"word": "bright", "start": 0.21, "end": 0.4, "probability": 0.9},
        {"word": "day", "start": 0.41, "end": 0.6, "probability": 0.9},
        {"word": "The", "start": 1.8, "end": 2.0, "probability": 0.9},
        {"word": "bird", "start": 2.01, "end": 2.2, "probability": 0.9},
        {"word": "sang", "start": 2.21, "end": 2.5, "probability": 0.9},
    ]

    result = evaluator.evaluate(expected_text, whisper_words)

    assert "accuracy_details" in result
    assert "wcpm_details" in result
    assert "chunking_details" in result
    assert "paragraph_reports" in result
    assert result["total_words"] == 6


def test_chunk_boundary_gap_marks_both_chunks_mistakeful():
    evaluator = ReadingEvaluator()
    expected_text = "One bright day. [...] The bird sang."
    whisper_words = [
        {"word": "One", "start": 0.0, "end": 0.2, "probability": 0.9},
        {"word": "bright", "start": 0.21, "end": 0.4, "probability": 0.9},
        {"word": "day", "start": 0.41, "end": 0.6, "probability": 0.9},
        {"word": "The", "start": 0.8, "end": 1.0, "probability": 0.9},
        {"word": "bird", "start": 1.01, "end": 1.2, "probability": 0.9},
        {"word": "sang", "start": 1.21, "end": 1.4, "probability": 0.9},
    ]

    result = evaluator.evaluate(expected_text, whisper_words)

    mistaken = set(result["chunking_details"]["mistaken_chunk_ids"])
    assert "para_1_chunk_1" in mistaken
    assert "para_1_chunk_2" in mistaken
    assert result["chunking_score"] == 0


def test_skipped_word_marks_chunk_mistakeful():
    evaluator = ReadingEvaluator()
    expected_text = "One bright day. [...] The bird sang."
    whisper_words = [
        {"word": "One", "start": 0.0, "end": 0.2, "probability": 0.9},
        {"word": "bright", "start": 0.21, "end": 0.4, "probability": 0.9},
        {"word": "The", "start": 1.8, "end": 2.0, "probability": 0.9},
        {"word": "bird", "start": 2.01, "end": 2.2, "probability": 0.9},
        {"word": "sang", "start": 2.21, "end": 2.4, "probability": 0.9},
    ]

    result = evaluator.evaluate(expected_text, whisper_words)
    first_chunk = next(
        chunk
        for paragraph in result["paragraph_reports"]
        for chunk in paragraph["chunks"]
        if chunk["chunk_id"] == "para_1_chunk_1"
    )

    assert first_chunk["status"] == "mistakeful"
    assert any("skipped" in reason.lower() for reason in first_chunk["mistake_reasons"])


def test_helper_skipped_word_stays_skipped_and_not_extra():
    evaluator = ReadingEvaluator()
    expected_text = "One bright day."
    whisper_words = [
        {"word": "One", "start": 0.0, "end": 0.2, "probability": 0.9},
        {"word": "bright", "start": 0.21, "end": 0.4, "probability": 0.9},
        {"word": "day", "start": 0.41, "end": 0.6, "probability": 0.9},
    ]

    result = evaluator.evaluate(
        expected_text,
        whisper_words,
        helper_skipped_words=[{"expected_index": 1, "word": "bright"}],
    )

    skipped_indices = {item["expected_index"] for item in result["skipped_words"]}
    assert 1 in skipped_indices
    assert "bright" not in result["extra_words"]

    bright_entry = next(item for item in result["word_map"] if item["expected_index"] == 1)
    assert bright_entry["status"] == "skipped"


def test_unread_chunk_user_read_text_excludes_extra_words():
    evaluator = ReadingEvaluator()
    expected_text = "It is the first warm day of spring. [...] A mother bear slowly peeks out."
    whisper_words = [
        {"word": "going", "start": 0.0, "end": 0.2, "probability": 0.9},
        {"word": "to", "start": 0.21, "end": 0.35, "probability": 0.9},
        {"word": "have", "start": 0.36, "end": 0.52, "probability": 0.9},
    ]

    result = evaluator.evaluate(expected_text, whisper_words)
    second_chunk = next(
        chunk
        for paragraph in result["paragraph_reports"]
        for chunk in paragraph["chunks"]
        if chunk["chunk_id"] == "para_1_chunk_2"
    )

    assert second_chunk["user_read_text"] == ""
    assert second_chunk["extra_words_near_chunk"] == []
