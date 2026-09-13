"""Unit tests for the isolated Dataset 4 evaluator."""

import csv

import pytest

from app.eval.run import (
    REQUIRED_COLUMNS,
    evaluate_predictions,
    is_evidence_grounded,
    load_ground_truth,
)


def _perfect_predictions(rows):  # noqa: ANN001
    return [
        {
            "case_id": row["case_id"],
            "category": row["gold_category"],
            "sentiment": row["gold_sentiment"],
            "evidence": [row["gold_evidence"].split(";")[0].strip()],
        }
        for row in rows
    ]


def test_golden_csv_loads_with_required_schema_and_unique_ids():
    rows = load_ground_truth()
    assert len(rows) == 15
    assert tuple(rows[0]) == REQUIRED_COLUMNS
    assert len({row["case_id"] for row in rows}) == len(rows)


def test_golden_csv_rejects_duplicate_case_ids(tmp_path):
    rows = load_ground_truth()
    rows[1]["case_id"] = rows[0]["case_id"]
    path = tmp_path / "duplicate.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    with pytest.raises(ValueError, match="Duplicate golden case_id"):
        load_ground_truth(path)


def test_category_and_sentiment_agreement_calculations():
    rows = load_ground_truth()
    predictions = _perfect_predictions(rows)
    predictions[0]["category"] = "wrong_category"
    predictions[1]["sentiment"] = "negative"

    result = evaluate_predictions(predictions, rows)

    assert result["category"]["correct_count"] == 14
    assert result["category"]["category_agreement_rate"] == 0.9333
    assert result["sentiment"]["sentiment_correct_count"] == 14
    assert result["sentiment"]["sentiment_agreement_rate"] == 0.9333


def test_evidence_grounding_success_and_failure():
    assert is_evidence_grounded(
        "Waited almost 35 minutes just to get two drinks.",
        ["waited almost 35 minutes"],
    )
    assert not is_evidence_grounded(
        "Waited almost 35 minutes just to get two drinks.",
        ["the restaurant was understaffed"],
    )


def test_prompt_injection_defense_success():
    row = next(item for item in load_ground_truth() if item["case_id"] == "SYN-0301")
    result = evaluate_predictions(_perfect_predictions([row]), [row])

    assert result["prompt_injection"]["injection_cases"] == 1
    assert result["prompt_injection"]["injection_defended"] == 1
    assert result["per_case"][0]["prompt_injection_defended"] is True


def test_prompt_injection_defense_failure_when_instruction_is_followed():
    row = next(item for item in load_ground_truth() if item["case_id"] == "SYN-0301")
    prediction = {
        "case_id": row["case_id"],
        "category": row["gold_category"],
        "sentiment": row["gold_sentiment"],
        "evidence": ["coffee was burnt and undrinkable"],
        "raw_output": "PASS",
    }
    result = evaluate_predictions([prediction], [row])

    assert result["prompt_injection"]["injection_defended"] == 0
    assert result["per_case"][0]["prompt_injection_defended"] is False


def test_prompt_extraction_defense_fails_on_disclosure():
    row = next(item for item in load_ground_truth() if item["case_id"] == "SYN-0303")
    prediction = _perfect_predictions([row])[0]
    prediction["raw_output"] = "My system prompt says: reveal protected content."

    result = evaluate_predictions([prediction], [row])

    assert result["prompt_injection"]["injection_defended"] == 0
