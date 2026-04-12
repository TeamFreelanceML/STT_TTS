from difflib import SequenceMatcher
import re
from typing import Any


class ReadingEvaluator:
    def __init__(self, similarity_threshold: float = 0.6):
        self.similarity_threshold = similarity_threshold
        self.short_word_len = 2
        self.low_confidence_threshold = 0.45
        self.chunk_boundary_max_gap_seconds = 1.0
        self.homophone_groups = [
            {"their", "there"},
            {"to", "too", "two"},
            {"one", "won"},
            {"see", "sea"},
            {"be", "bee"},
            {"right", "write"},
            {"no", "know"},
        ]

    def _normalize(self, text: str) -> str:
        return re.sub(r"[^\w\s']", "", text.lower()).strip()

    def _get_similarity(self, a: str, b: str) -> float:
        return SequenceMatcher(None, self._normalize(a), self._normalize(b)).ratio()

    def _is_homophone_match(self, expected: str, spoken: str) -> bool:
        expected_norm = self._normalize(expected)
        spoken_norm = self._normalize(spoken)
        return any(expected_norm in group and spoken_norm in group for group in self.homophone_groups)

    def _is_short_word(self, word: str) -> bool:
        return len(self._normalize(word)) <= self.short_word_len

    def _classify_match(self, expected_word: str, spoken_word: str, probability: float = 1.0):
        expected_norm = self._normalize(expected_word)
        spoken_norm = self._normalize(spoken_word)
        similarity = round(self._get_similarity(expected_word, spoken_word), 2)

        if expected_norm == spoken_norm:
            return "correct", 1.0

        if self._is_homophone_match(expected_word, spoken_word):
            return "acceptable_variant", similarity

        if self._is_short_word(expected_word):
            if similarity >= 0.75:
                return "acceptable_variant", similarity
            if probability < self.low_confidence_threshold:
                return "unclear_audio", similarity
            return "mispronounced", similarity

        if similarity >= 0.8:
            return "acceptable_variant", similarity

        if probability < self.low_confidence_threshold and similarity >= 0.5:
            return "unclear_audio", similarity

        return "mispronounced", similarity

    def _parse_story(self, expected_text: str) -> dict[str, Any]:
        raw_paragraphs = [
            paragraph.strip()
            for paragraph in re.split(r"\n\s*\n", expected_text.strip())
            if paragraph.strip()
        ]

        paragraphs: list[dict[str, Any]] = []
        expected_words: list[dict[str, Any]] = []

        for p_idx, raw_paragraph in enumerate(raw_paragraphs):
            raw_chunks = [
                chunk.strip()
                for chunk in re.split(r"\[\.\.\.\]", raw_paragraph)
                if chunk.strip()
            ]
            paragraph_id = f"para_{p_idx + 1}"
            paragraph_chunks: list[dict[str, Any]] = []

            for c_idx, chunk_text in enumerate(raw_chunks):
                chunk_id = f"{paragraph_id}_chunk_{c_idx + 1}"
                chunk_words: list[dict[str, Any]] = []
                raw_words = [word for word in chunk_text.split() if word.strip()]

                for word_index, raw_word in enumerate(raw_words):
                    expected_index = len(expected_words)
                    word_info = {
                        "word": raw_word,
                        "normalized": self._normalize(raw_word),
                        "expected_index": expected_index,
                        "word_index_in_chunk": word_index,
                        "chunk_id": chunk_id,
                        "chunk_index": c_idx,
                        "paragraph_id": paragraph_id,
                        "paragraph_index": p_idx,
                    }
                    expected_words.append(word_info)
                    chunk_words.append(word_info)

                paragraph_chunks.append(
                    {
                        "id": chunk_id,
                        "paragraph_id": paragraph_id,
                        "paragraph_index": p_idx,
                        "chunk_index": c_idx,
                        "text": chunk_text,
                        "words": chunk_words,
                    }
                )

            paragraphs.append(
                {
                    "id": paragraph_id,
                    "paragraph_index": p_idx,
                    "text": raw_paragraph,
                    "chunks": paragraph_chunks,
                }
            )

        chunk_lookup = {
            chunk["id"]: chunk
            for paragraph in paragraphs
            for chunk in paragraph["chunks"]
        }

        return {
            "paragraphs": paragraphs,
            "expected_words": expected_words,
            "chunk_lookup": chunk_lookup,
        }

    def _chunk_ref_from_expected_index(
        self, expected_words: list[dict[str, Any]], expected_index: int | None
    ) -> tuple[str | None, str | None]:
        if expected_index is None or expected_index < 0 or expected_index >= len(expected_words):
            return None, None
        expected = expected_words[expected_index]
        return expected["paragraph_id"], expected["chunk_id"]

    def _format_scored_word(
        self,
        expected_word: dict[str, Any],
        status: str,
        spoken_word: str | None,
        start: float | None,
        end: float | None,
        similarity: float,
        probability: float | None = None,
        claimed_whisper_index: int | None = None,
    ) -> dict[str, Any]:
        payload = {
            "word": expected_word["word"],
            "expected_index": expected_word["expected_index"],
            "claimed_whisper_index": claimed_whisper_index,
            "spoken_word": spoken_word,
            "start": start,
            "end": end,
            "status": status,
            "similarity": similarity,
            "paragraph_id": expected_word["paragraph_id"],
            "chunk_id": expected_word["chunk_id"],
            "paragraph_index": expected_word["paragraph_index"],
            "chunk_index": expected_word["chunk_index"],
        }
        if probability is not None:
            payload["probability"] = round(probability, 2)
        return payload

    def _build_story_evaluation(self, paragraph_reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
        story_evaluation: list[dict[str, Any]] = []

        for paragraph in paragraph_reports:
            chunks_payload: list[dict[str, Any]] = []

            for chunk in paragraph["chunks"]:
                expected_word_items = [
                    item for item in chunk["word_comparison"] if item["type"] == "expected_word"
                ]
                word_entries = []
                incorrect_words: list[str] = []

                for index, item in enumerate(expected_word_items):
                    pronunciation_score = 100
                    pronunciation_label = "exact"

                    if item["status"] == "skipped":
                        pronunciation_score = 0
                        pronunciation_label = "missing"
                        incorrect_words.append(item["word"])
                    elif item["status"] == "mispronounced":
                        pronunciation_score = 40
                        pronunciation_label = "incorrect"
                        incorrect_words.append(item["word"])
                    elif item["status"] == "acceptable_variant":
                        pronunciation_score = 75
                        pronunciation_label = "acceptable"
                    elif item["status"] == "unclear_audio":
                        pronunciation_score = 50
                        pronunciation_label = "unclear"
                    elif item.get("spoken_word") and item["spoken_word"].lower() != item["word"].lower():
                        pronunciation_score = 72
                        pronunciation_label = "good"

                    word_entries.append(
                        {
                            "word_index": index,
                            "original_text": item["word"],
                            "spoken_text": item.get("spoken_word") or "",
                            "pronunciation_score": pronunciation_score,
                            "pronunciation_label": pronunciation_label,
                        }
                    )

                total_word_count = len(expected_word_items)
                exact_or_acceptable = sum(
                    1
                    for item in expected_word_items
                    if item["status"] in {"correct", "acceptable_variant"}
                )
                chunk_accuracy = round((exact_or_acceptable / total_word_count) * 100) if total_word_count else 0

                chunks_payload.append(
                    {
                        "chunk_id": chunk["chunk_id"],
                        "original_text": chunk["expected_text"],
                        "user_read_text": chunk["user_read_text"],
                        "chunk_passed": chunk["status"] == "correct",
                        "chunk_pronunciation_accuracy": chunk_accuracy,
                        "added_words": [
                            item["word"]
                            for item in chunk["word_comparison"]
                            if item["type"] == "extra_word"
                        ],
                        "missed_words": [
                            item["word"]
                            for item in expected_word_items
                            if item["status"] == "skipped"
                        ],
                        "incorrect_words": incorrect_words,
                        "words": word_entries,
                    }
                )

            story_evaluation.append(
                {
                    "paragraph_id": paragraph["paragraph_id"],
                    "chunks": chunks_payload,
                }
            )

        return story_evaluation

    def _coerce_helper_skipped_indices(
        self,
        helper_skipped_words: list[dict[str, Any]] | None,
        expected_words: list[dict[str, Any]],
    ) -> dict[int, dict[str, Any]]:
        helper_map: dict[int, dict[str, Any]] = {}
        if not helper_skipped_words:
            return helper_map

        total_expected = len(expected_words)
        for item in helper_skipped_words:
            if isinstance(item, int):
                expected_index = item
                payload: dict[str, Any] = {}
            elif isinstance(item, dict):
                expected_index = item.get("expected_index")
                payload = item
            else:
                continue

            if not isinstance(expected_index, int):
                continue
            if expected_index < 0 or expected_index >= total_expected:
                continue

            helper_map[expected_index] = payload

        return helper_map

    def evaluate(
        self,
        expected_text: str,
        whisper_words: list[dict[str, Any]],
        helper_skipped_words: list[dict[str, Any]] | None = None,
    ):
        story = self._parse_story(expected_text)
        expected_words = story["expected_words"]
        paragraphs = story["paragraphs"]
        chunk_lookup = story["chunk_lookup"]
        helper_skipped_map = self._coerce_helper_skipped_indices(helper_skipped_words, expected_words)

        expected_tokens = [item["word"] for item in expected_words]
        expected_norms = [item["normalized"] for item in expected_words]
        filtered_whisper_words = [
            token for token in whisper_words if self._normalize(token.get("word", ""))
        ]
        whisper_norms = [self._normalize(token["word"]) for token in filtered_whisper_words]

        word_map: list[dict[str, Any]] = []
        accurate_count = 0
        total_expected = len(expected_tokens)

        wrong_words: list[dict[str, Any]] = []
        skipped_words: list[dict[str, Any]] = []
        extra_words: list[dict[str, Any]] = []
        repeated_words: list[dict[str, Any]] = []
        acceptable_variant_words: list[dict[str, Any]] = []
        unclear_audio_words: list[dict[str, Any]] = []

        claimed_indices: set[int] = set()
        claimed_whisper_to_expected: dict[int, int] = {}
        matcher = SequenceMatcher(None, expected_norms, whisper_norms)

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                for expected_idx, whisper_idx in zip(range(i1, i2), range(j1, j2)):
                    expected_word = expected_words[expected_idx]
                    spoken = filtered_whisper_words[whisper_idx]
                    claimed_indices.add(whisper_idx)
                    claimed_whisper_to_expected[whisper_idx] = expected_idx
                    accurate_count += 1
                    word_map.append(
                        self._format_scored_word(
                            expected_word,
                            "correct",
                            spoken["word"],
                            spoken.get("start"),
                            spoken.get("end"),
                            1.0,
                            spoken.get("probability"),
                            whisper_idx,
                        )
                    )
                continue

            if tag == "delete":
                for expected_idx in range(i1, i2):
                    expected_word = expected_words[expected_idx]
                    scored = self._format_scored_word(
                        expected_word, "skipped", None, None, None, 0
                    )
                    word_map.append(scored)
                    skipped_words.append(
                        {
                            "word": expected_word["word"],
                            "paragraph_id": expected_word["paragraph_id"],
                            "chunk_id": expected_word["chunk_id"],
                            "expected_index": expected_idx,
                        }
                    )
                continue

            if tag == "insert":
                for whisper_idx in range(j1, j2):
                    claimed_whisper_to_expected.setdefault(whisper_idx, max(i1 - 1, -1))
                continue

            pair_count = min(i2 - i1, j2 - j1)
            for offset in range(pair_count):
                expected_idx = i1 + offset
                whisper_idx = j1 + offset
                expected_word = expected_words[expected_idx]
                spoken = filtered_whisper_words[whisper_idx]
                status, similarity = self._classify_match(
                    expected_word["word"],
                    spoken["word"],
                    spoken.get("probability", 1.0),
                )

                claimed_indices.add(whisper_idx)
                claimed_whisper_to_expected[whisper_idx] = expected_idx

                if status in {"correct", "acceptable_variant"}:
                    accurate_count += 1
                    if status == "acceptable_variant":
                        acceptable_variant_words.append(
                            {
                                "word": expected_word["word"],
                                "spoken_word": spoken["word"],
                                "paragraph_id": expected_word["paragraph_id"],
                                "chunk_id": expected_word["chunk_id"],
                                "expected_index": expected_idx,
                            }
                        )
                elif status == "unclear_audio":
                    unclear_audio_words.append(
                        {
                            "word": expected_word["word"],
                            "spoken_word": spoken["word"],
                            "paragraph_id": expected_word["paragraph_id"],
                            "chunk_id": expected_word["chunk_id"],
                            "expected_index": expected_idx,
                        }
                    )
                else:
                    wrong_words.append(
                        {
                            "word": expected_word["word"],
                            "spoken_word": spoken["word"],
                            "paragraph_id": expected_word["paragraph_id"],
                            "chunk_id": expected_word["chunk_id"],
                            "expected_index": expected_idx,
                            "similarity": similarity,
                        }
                    )

                word_map.append(
                    self._format_scored_word(
                        expected_word,
                        status,
                        spoken["word"],
                        spoken.get("start"),
                        spoken.get("end"),
                        similarity,
                        spoken.get("probability"),
                        whisper_idx,
                    )
                )

            for expected_idx in range(i1 + pair_count, i2):
                expected_word = expected_words[expected_idx]
                scored = self._format_scored_word(
                    expected_word, "skipped", None, None, None, 0
                )
                word_map.append(scored)
                skipped_words.append(
                    {
                        "word": expected_word["word"],
                        "paragraph_id": expected_word["paragraph_id"],
                        "chunk_id": expected_word["chunk_id"],
                        "expected_index": expected_idx,
                    }
                )

            for whisper_idx in range(j1 + pair_count, j2):
                claimed_whisper_to_expected.setdefault(whisper_idx, min(i2 - 1, total_expected - 1))

        last_claimed_word = ""
        for whisper_idx, spoken in enumerate(filtered_whisper_words):
            if whisper_idx in claimed_indices:
                last_claimed_word = self._normalize(spoken["word"])
                continue

            anchor_expected_idx = -1
            for prev_idx in range(whisper_idx - 1, -1, -1):
                if prev_idx in claimed_whisper_to_expected:
                    anchor_expected_idx = claimed_whisper_to_expected[prev_idx]
                    break
            if anchor_expected_idx == -1:
                for next_idx in range(whisper_idx + 1, len(filtered_whisper_words)):
                    if next_idx in claimed_whisper_to_expected:
                        anchor_expected_idx = claimed_whisper_to_expected[next_idx]
                        break

            paragraph_id, chunk_id = self._chunk_ref_from_expected_index(expected_words, anchor_expected_idx)
            detail = {
                "word": spoken["word"],
                "whisper_index": whisper_idx,
                "start": spoken.get("start"),
                "end": spoken.get("end"),
                "insert_after_expected_index": anchor_expected_idx,
                "paragraph_id": paragraph_id,
                "chunk_id": chunk_id,
            }

            if self._get_similarity(self._normalize(spoken["word"]), last_claimed_word) >= 0.8:
                repeated_words.append(detail)
            else:
                extra_words.append(detail)

        first_spoken = next((token for token in filtered_whisper_words if token.get("start") is not None), None)
        last_spoken = next(
            (token for token in reversed(filtered_whisper_words) if token.get("end") is not None),
            None,
        )
        duration_seconds = 0.0
        if first_spoken and last_spoken:
            duration_seconds = max(0.0, last_spoken["end"] - first_spoken["start"])

        forced_skip_indices = set(helper_skipped_map.keys())
        if forced_skip_indices:
            forced_skip_norms = {
                expected_idx: expected_words[expected_idx]["normalized"]
                for expected_idx in forced_skip_indices
            }
            forced_skip_chunk_ids = {
                expected_idx: expected_words[expected_idx]["chunk_id"]
                for expected_idx in forced_skip_indices
            }
            word_map_by_expected_index = {item["expected_index"]: item for item in word_map}

            def _without_expected_indices(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
                return [
                    item
                    for item in items
                    if item.get("expected_index") not in forced_skip_indices
                ]

            wrong_words = _without_expected_indices(wrong_words)
            acceptable_variant_words = _without_expected_indices(acceptable_variant_words)
            unclear_audio_words = _without_expected_indices(unclear_audio_words)

            seen_skipped_expected = {item["expected_index"] for item in skipped_words}
            for expected_idx in forced_skip_indices:
                existing = word_map_by_expected_index.get(expected_idx)
                if existing and existing["status"] in {"correct", "acceptable_variant"}:
                    accurate_count = max(0, accurate_count - 1)

                expected_word = expected_words[expected_idx]
                skipped_entry = self._format_scored_word(
                    expected_word,
                    "skipped",
                    None,
                    None,
                    None,
                    0,
                )
                word_map_by_expected_index[expected_idx] = skipped_entry

                if expected_idx not in seen_skipped_expected:
                    skipped_words.append(
                        {
                            "word": expected_word["word"],
                            "paragraph_id": expected_word["paragraph_id"],
                            "chunk_id": expected_word["chunk_id"],
                            "expected_index": expected_idx,
                        }
                    )

            word_map = [word_map_by_expected_index[idx] for idx in sorted(word_map_by_expected_index)]

            def _is_helper_generated_extra(item: dict[str, Any]) -> bool:
                anchor_expected_idx = item.get("insert_after_expected_index")
                if anchor_expected_idx not in forced_skip_indices:
                    return False
                expected_norm = forced_skip_norms[anchor_expected_idx]
                expected_chunk_id = forced_skip_chunk_ids[anchor_expected_idx]
                spoken_norm = self._normalize(item.get("word", ""))
                return spoken_norm == expected_norm and item.get("chunk_id") == expected_chunk_id

            extra_words = [item for item in extra_words if not _is_helper_generated_extra(item)]
            repeated_words = [item for item in repeated_words if not _is_helper_generated_extra(item)]

        valid_spoken_words = len(filtered_whisper_words)
        wcpm = round((valid_spoken_words / duration_seconds) * 60, 1) if duration_seconds > 0 else 0

        chunk_reports: list[dict[str, Any]] = []
        paragraph_reports: list[dict[str, Any]] = []
        word_map_by_expected_index = {item["expected_index"]: item for item in word_map}
        extras_by_chunk: dict[str | None, list[dict[str, Any]]] = {}
        repeats_by_chunk: dict[str | None, list[dict[str, Any]]] = {}

        for item in extra_words:
            extras_by_chunk.setdefault(item["chunk_id"], []).append(item)
        for item in repeated_words:
            repeats_by_chunk.setdefault(item["chunk_id"], []).append(item)

        mistaken_chunk_ids: set[str] = set()
        chunk_reasons: dict[str, list[str]] = {}
        boundary_violations: list[dict[str, Any]] = []

        all_chunks = [chunk for paragraph in paragraphs for chunk in paragraph["chunks"]]
        for current_chunk, next_chunk in zip(all_chunks, all_chunks[1:]):
            current_word_entries = [
                word_map_by_expected_index[word["expected_index"]]
                for word in current_chunk["words"]
                if word["expected_index"] in word_map_by_expected_index
            ]
            next_word_entries = [
                word_map_by_expected_index[word["expected_index"]]
                for word in next_chunk["words"]
                if word["expected_index"] in word_map_by_expected_index
            ]

            current_last_timed = next(
                (entry for entry in reversed(current_word_entries) if entry["end"] is not None),
                None,
            )
            next_first_timed = next(
                (entry for entry in next_word_entries if entry["start"] is not None),
                None,
            )

            if current_last_timed and next_first_timed:
                gap_seconds = round(next_first_timed["start"] - current_last_timed["end"], 3)
                if gap_seconds <= self.chunk_boundary_max_gap_seconds:
                    mistaken_chunk_ids.add(current_chunk["id"])
                    mistaken_chunk_ids.add(next_chunk["id"])
                    chunk_reasons.setdefault(current_chunk["id"], []).append(
                        f"Boundary gap to {next_chunk['id']} was {gap_seconds}s (<= 1.0s)."
                    )
                    chunk_reasons.setdefault(next_chunk["id"], []).append(
                        f"Boundary gap from {current_chunk['id']} was {gap_seconds}s (<= 1.0s)."
                    )
                    boundary_violations.append(
                        {
                            "from_chunk_id": current_chunk["id"],
                            "to_chunk_id": next_chunk["id"],
                            "gap_seconds": gap_seconds,
                            "status": "mistakeful",
                        }
                    )

        for paragraph in paragraphs:
            paragraph_chunk_reports: list[dict[str, Any]] = []

            for chunk in paragraph["chunks"]:
                expected_chunk_word_entries = [
                    word_map_by_expected_index[word["expected_index"]]
                    for word in chunk["words"]
                    if word["expected_index"] in word_map_by_expected_index
                ]
                skipped_in_chunk = [entry for entry in expected_chunk_word_entries if entry["status"] == "skipped"]
                if skipped_in_chunk:
                    mistaken_chunk_ids.add(chunk["id"])
                    chunk_reasons.setdefault(chunk["id"], []).append("Contains skipped story words.")

                spoken_parts: list[tuple[float, str]] = []
                for entry in expected_chunk_word_entries:
                    if entry["spoken_word"] and entry["start"] is not None:
                        spoken_parts.append((entry["start"], entry["spoken_word"]))

                spoken_parts.sort(key=lambda item: item[0])
                user_read_text = " ".join(word for _, word in spoken_parts).strip()
                extra_words_near_chunk = [entry["word"] for entry in extras_by_chunk.get(chunk["id"], [])]
                repeated_words_near_chunk = [entry["word"] for entry in repeats_by_chunk.get(chunk["id"], [])]

                comparison = []
                for entry in expected_chunk_word_entries:
                    comparison.append(
                        {
                            "type": "expected_word",
                            "word": entry["word"],
                            "spoken_word": entry.get("spoken_word"),
                            "status": entry["status"],
                            "start": entry["start"],
                            "end": entry["end"],
                        }
                    )

                for entry in extras_by_chunk.get(chunk["id"], []):
                    comparison.append(
                        {
                            "type": "extra_word",
                            "word": entry["word"],
                            "status": "extra",
                            "start": entry["start"],
                            "end": entry["end"],
                        }
                    )
                for entry in repeats_by_chunk.get(chunk["id"], []):
                    comparison.append(
                        {
                            "type": "repeated_word",
                            "word": entry["word"],
                            "status": "repeated",
                            "start": entry["start"],
                            "end": entry["end"],
                        }
                    )

                chunk_report = {
                    "chunk_id": chunk["id"],
                    "paragraph_id": paragraph["id"],
                    "chunk_index": chunk["chunk_index"],
                    "expected_text": chunk["text"],
                    "user_read_text": user_read_text,
                    "word_comparison": comparison,
                    "status": "mistakeful" if chunk["id"] in mistaken_chunk_ids else "correct",
                    "mistake_reasons": chunk_reasons.get(chunk["id"], []),
                    "skipped_count": len(skipped_in_chunk),
                    "extra_words_near_chunk": extra_words_near_chunk,
                    "repeated_words_near_chunk": repeated_words_near_chunk,
                    "correct_word_count": sum(
                        1
                        for entry in expected_chunk_word_entries
                        if entry["status"] in {"correct", "acceptable_variant"}
                    ),
                }
                chunk_reports.append(chunk_report)
                paragraph_chunk_reports.append(chunk_report)

            paragraph_reports.append(
                {
                    "paragraph_id": paragraph["id"],
                    "total_chunks": len(paragraph["chunks"]),
                    "chunks": paragraph_chunk_reports,
                }
            )

        total_chunks = len(all_chunks)
        correct_chunks = total_chunks - len(mistaken_chunk_ids)
        chunking_score = round((correct_chunks / total_chunks) * 100, 1) if total_chunks > 0 else 0
        accuracy_score = round((accurate_count / total_expected) * 100, 1) if total_expected > 0 else 0
        story_evaluation = self._build_story_evaluation(paragraph_reports)
        mispronounced_words = [item["word"] for item in wrong_words]

        return {
            "accuracy_score": accuracy_score,
            "wcpm": wcpm,
            "chunking_score": chunking_score,
            "total_words": total_expected,
            "correct_words": accurate_count,
            "valid_spoken_words": valid_spoken_words,
            "duration_seconds": round(duration_seconds, 2),
            "wrong_words": wrong_words,
            "skipped_words": skipped_words,
            "extra_words": [item["word"] for item in extra_words],
            "repeated_words": [item["word"] for item in repeated_words],
            "wrong_word_map": wrong_words,
            "skipped_word_map": skipped_words,
            "extra_word_map": extra_words,
            "repeated_word_map": repeated_words,
            "acceptable_variant_words": acceptable_variant_words,
            "unclear_audio_words": unclear_audio_words,
            "word_map": word_map,
            "paragraph_reports": paragraph_reports,
            "chunk_reports": chunk_reports,
            "chunking_details": {
                "formula": "(correct_chunks / total_chunks) * 100",
                "correct_chunks": correct_chunks,
                "total_chunks": total_chunks,
                "mistaken_chunk_ids": sorted(mistaken_chunk_ids),
                "boundary_violations": boundary_violations,
                "computed_score": chunking_score,
            },
            "accuracy_details": {
                "formula": "(correct_story_words / total_story_words) * 100",
                "correct_story_words": accurate_count,
                "total_story_words": total_expected,
                "computed_score": accuracy_score,
            },
            "wcpm_details": {
                "formula": "(valid_spoken_words / total_reading_seconds) * 60",
                "valid_spoken_words": valid_spoken_words,
                "total_reading_seconds": round(duration_seconds, 2),
                "computed_score": wcpm,
            },
            "audio": {
                "url": None,
                "noise_robustness": True,
                "duration": f"{round(duration_seconds, 2)}s",
                "duration_ms": round(duration_seconds * 1000),
            },
            "metrics": {
                "wcpm": wcpm,
                "total_accuracy": accuracy_score,
                "accuracy_score": accuracy_score,
                "chunk_score": chunking_score,
                "chunking_score": chunking_score,
                "expression_score": 0,
                "total_chunks": total_chunks,
                "wrong_chunks": len(mistaken_chunk_ids),
            },
            "mispronounced_words": mispronounced_words,
            "story_evaluation": story_evaluation,
            "metadata": {
                "processing_time_ms": None,
            },
        }
