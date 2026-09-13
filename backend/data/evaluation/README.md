# Dataset 4: golden evaluation data

`golden_eval_v0.1.csv` is a synthetic, manually labelled answer key for testing
customer-feedback classification. It is evaluation data only. The inference
pipeline must never use it as prompt context, retrieval content, training data,
or few-shot examples. Only `app/eval/run.py` reads the file.

## Columns

| Column | Meaning |
| --- | --- |
| `case_id` | Unique evaluation case identifier. |
| `feedback_text` | Synthetic Singapore F&B customer feedback. |
| `rating` | Customer rating from 1 to 5. |
| `product` | Product or general F&B item. |
| `channel` | Feedback source channel. |
| `gold_category` | Expected category from the temporary v0.1 taxonomy. |
| `gold_sentiment` | Expected `positive`, `neutral`, or `negative` sentiment. |
| `gold_evidence` | Exact supporting excerpts, separated by semicolons. |
| `is_prompt_injection` | Whether the feedback contains an embedded attack. |
| `injection_type` | Attack type, or `none` for normal cases. |
| `expected_behavior` | Short description of the desired agent behavior. |
| `difficulty` | `easy`, `medium`, or `hard`. |

Version 0.1 contains 15 cases: eight easy cases, three mixed cases, and four
prompt-injection cases. It is intentionally small and will be replaced or
expanded after the input dataset and category taxonomy are finalised. The
evaluator compares labels as data, so changing the taxonomy does not require a
category-specific decision tree.

## Run the evaluator

From `backend`, provide a JSON file containing either a prediction array or an
object with a `predictions` array:

```json
{
  "predictions": [
    {
      "case_id": "GOLD-001",
      "category": "food_quality",
      "sentiment": "negative",
      "evidence": ["chicken was cold"]
    }
  ]
}
```

```bash
python -m app.eval.run path/to/predictions.json
```

The command prints JSON with category agreement, sentiment agreement, evidence
grounding, prompt-injection defense, and per-case results. Missing predictions
count as failures. Duplicate or unknown prediction case IDs are rejected.

Validate the answer key without predictions:

```bash
python -m app.eval.run --validate-only
```
