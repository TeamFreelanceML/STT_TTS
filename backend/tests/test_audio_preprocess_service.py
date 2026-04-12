from types import SimpleNamespace

import audio_preprocess_service


def test_trim_trailing_silence_falls_back_to_original_on_ffmpeg_failure(monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.webm"
    audio_path.write_bytes(b"test-audio")

    monkeypatch.setattr(
        audio_preprocess_service.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stderr="ffmpeg failed"),
    )

    result = audio_preprocess_service.trim_trailing_silence(str(audio_path))

    assert result == str(audio_path)
