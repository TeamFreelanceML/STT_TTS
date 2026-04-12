from timing_utils import TimingCollector


def test_timing_collector_records_named_stage():
    collector = TimingCollector()

    with collector.measure("sample_ms"):
        _ = sum(range(100))

    result = collector.as_dict()

    assert "sample_ms" in result
    assert "total_ms" in result
    assert result["total_ms"] >= result["sample_ms"]
