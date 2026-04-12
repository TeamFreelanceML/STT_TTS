import logging

from evaluator import ReadingEvaluator


logger = logging.getLogger("AIJudge.EvaluationService")


class EvaluationService:
    def __init__(self, evaluator: ReadingEvaluator):
        self.evaluator = evaluator

    def evaluate(
        self,
        expected_text: str,
        whisper_words: list[dict],
        helper_skipped_words: list[dict] | None = None,
    ) -> dict:
        logger.info("[PHASE 2] Entering Linguistic Scorecard Alignment...")
        return self.evaluator.evaluate(
            expected_text,
            whisper_words,
            helper_skipped_words=helper_skipped_words,
        )
