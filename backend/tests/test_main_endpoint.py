import importlib
import sys
import types

from fastapi.testclient import TestClient


class _FakeWhisperModel:
    def transcribe(self, *args, **kwargs):
        return {"segments": []}


def _load_main_with_fake_whisper():
    sys.modules.pop("main", None)
    sys.modules["whisper"] = types.SimpleNamespace(load_model=lambda name: _FakeWhisperModel())
    return importlib.import_module("main")


def test_evaluate_endpoint_returns_timing(monkeypatch, tmp_path):
    main = _load_main_with_fake_whisper()

    monkeypatch.setattr(main, "trim_trailing_silence", lambda path: path)
    monkeypatch.setattr(
        main.transcription_service,
        "transcribe",
        lambda path: [{"word": "hello", "start": 0.0, "end": 0.5, "probability": 0.9}],
    )
    monkeypatch.setattr(
        main.evaluation_service,
        "evaluate",
        lambda expected_text, whisper_words, helper_skipped_words=None: {
            "accuracy_score": 100,
            "wcpm": 60,
            "chunking_score": 100,
        },
    )

    client = TestClient(main.app)
    response = client.post(
        "/evaluate",
        files={"audio": ("sample.webm", b"abc", "audio/webm")},
        data={"expected_text": "hello"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "timing" in payload
    assert "transcribe_ms" in payload["timing"]
    assert "evaluate_ms" in payload["timing"]
    assert payload["filename"] == "sample.webm"
