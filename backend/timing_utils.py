import time
from contextlib import contextmanager


class TimingCollector:
    def __init__(self) -> None:
        self._started_at = time.perf_counter()
        self.timings_ms: dict[str, float] = {}

    @contextmanager
    def measure(self, key: str):
        started = time.perf_counter()
        try:
            yield
        finally:
            self.timings_ms[key] = round((time.perf_counter() - started) * 1000, 1)

    def as_dict(self) -> dict[str, float]:
        total_ms = round((time.perf_counter() - self._started_at) * 1000, 1)
        return {
            **self.timings_ms,
            "total_ms": total_ms,
        }
