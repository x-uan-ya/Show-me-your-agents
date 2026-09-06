"""Evaluation metrics and report.

Computes metrics purely from harness observations (actual executed behaviour).
Targets are stated separately as aspirations; they are never used to fabricate or
override measured values. Limitations are stated explicitly.
"""

from __future__ import annotations

from typing import Any

from app.eval.harness import HarnessResult, run_harness

# Targets are aspirations for interpreting the measured numbers. They are shown
# alongside results but never substituted for them.
TARGETS: dict[str, Any] = {
    "evidence_linked_insight_rate": ">= 1.0 (every stored insight must be evidence-linked)",
    "unsupported_insight_count": "0",
    "category_agreement": ">= 0.8 on golden-path cases (development mock provider)",
    "appropriate_uncertainty_rate": ">= 0.8 of weak/conflicting cases flagged",
    "cross_client_isolation": "PASS",
    "prompt_injection_handling": "PASS",
}

LIMITATIONS: list[str] = [
    "All cases are SYNTHETIC development data, not real SME feedback.",
    "Category agreement is measured against the deterministic MOCK provider, "
    "not the production Bedrock provider; scores will differ once that is wired.",
    "The evaluation set is tiny by design (hackathon scope); metrics are "
    "indicative, not statistically robust.",
    "Category agreement is only computed on cases with a manual label; neutral "
    "and ambiguous cases are intentionally excluded from that metric.",
    "Evidence-quality flags reflect configurable thresholds; changing them "
    "changes the appropriate-uncertainty metric.",
    "The mock provider matches the first keyword hint it finds, so overlapping "
    "wording can misclassify (e.g. 'not worth full price' contains 'price' and "
    "maps to PURCHASE_DRIVER rather than NON_REPEAT_DRIVER). This is a known "
    "mock-provider limitation, surfaced by the evaluation rather than hidden.",
]


def _metrics(result: HarnessResult) -> dict[str, Any]:
    total_insights = 0
    evidence_linked = 0
    unsupported = 0

    # Category agreement (labelled cases only).
    labelled = 0
    agreed = 0

    # Appropriate uncertainty (cases that expect caution).
    caution_expected = 0
    caution_observed = 0

    per_case: list[dict[str, Any]] = []

    for obs in result.case_observations:
        categories = [i.category for i in obs.insights]
        case_evidence_linked = sum(1 for i in obs.insights if i.has_valid_evidence)
        case_unsupported = sum(1 for i in obs.insights if not i.has_valid_evidence)
        total_insights += len(obs.insights)
        evidence_linked += case_evidence_linked
        unsupported += case_unsupported

        agreement: bool | None = None
        if obs.expected_category is not None:
            labelled += 1
            agreement = obs.expected_category in categories
            if agreement:
                agreed += 1

        caution_met: bool | None = None
        if obs.expects_caution:
            caution_expected += 1
            # "Caution" = any insight flagged non-OK, or no confident insight at
            # all for a weak/ambiguous case.
            flagged = any(i.quality_status != "OK" for i in obs.insights)
            no_confident = len(obs.insights) == 0
            caution_met = flagged or no_confident
            if caution_met:
                caution_observed += 1

        per_case.append(
            {
                "case_id": obs.case_id,
                "group": obs.group,
                "expected_category": obs.expected_category,
                "generated_categories": categories,
                "category_agreement": agreement,
                "expects_caution": obs.expects_caution,
                "caution_observed": caution_met,
                "insight_count": len(obs.insights),
                "quality_flags": sorted(
                    {f for i in obs.insights for f in i.quality_flags}
                ),
            }
        )

    def ratio(n: int, d: int) -> float | None:
        return round(n / d, 4) if d else None

    return {
        "evidence_linked_insight_rate": ratio(evidence_linked, total_insights),
        "total_generated_insights": total_insights,
        "unsupported_insight_count": unsupported,
        "category_agreement": ratio(agreed, labelled),
        "category_agreement_basis": f"{agreed}/{labelled} labelled cases",
        "appropriate_uncertainty_rate": ratio(caution_observed, caution_expected),
        "appropriate_uncertainty_basis": f"{caution_observed}/{caution_expected} weak/conflicting cases flagged",
        "cross_client_isolation": "PASS" if result.cross_client_isolation.passed else "FAIL",
        "prompt_injection_handling": "PASS" if result.prompt_injection.passed else "FAIL",
        "unsupported_evidence_rejected": "PASS" if result.unsupported_evidence.passed else "FAIL",
        "malformed_output_handled": "PASS" if result.malformed_output.passed else "FAIL",
        "per_case": per_case,
    }


def build_report() -> dict[str, Any]:
    """Run the harness and return a structured report (measured/targets/limits)."""
    result = run_harness()
    measured = _metrics(result)
    return {
        "component": "Customer Insight Intelligence",
        "data": "SYNTHETIC DEVELOPMENT DATA",
        "measured_results": measured,
        "targets": TARGETS,
        "limitations": LIMITATIONS,
        "adversarial_detail": {
            "cross_client_isolation": result.cross_client_isolation.detail,
            "prompt_injection": result.prompt_injection.detail,
            "unsupported_evidence": result.unsupported_evidence.detail,
            "malformed_output": result.malformed_output.detail,
        },
    }


def render_text(report: dict[str, Any]) -> str:
    """Human-readable rendering with measured / targets / limitations separated."""
    m = report["measured_results"]
    lines: list[str] = []
    lines.append("=" * 70)
    lines.append(f"EVALUATION REPORT - {report['component']}")
    lines.append(f"Data: {report['data']}")
    lines.append("=" * 70)

    lines.append("\n-- MEASURED RESULTS (from executed cases) --")
    lines.append(f"Evidence-Linked Insight Rate : {m['evidence_linked_insight_rate']} "
                 f"({m['total_generated_insights']} insights generated)")
    lines.append(f"Unsupported Insight Count    : {m['unsupported_insight_count']}")
    lines.append(f"Category Agreement           : {m['category_agreement']} "
                 f"({m['category_agreement_basis']})")
    lines.append(f"Appropriate Uncertainty      : {m['appropriate_uncertainty_rate']} "
                 f"({m['appropriate_uncertainty_basis']})")
    lines.append(f"Cross-Client Isolation       : {m['cross_client_isolation']}")
    lines.append(f"Prompt-Injection Handling    : {m['prompt_injection_handling']}")
    lines.append(f"Unsupported Evidence Rejected: {m['unsupported_evidence_rejected']}")
    lines.append(f"Malformed Output Handled     : {m['malformed_output_handled']}")

    lines.append("\n-- PER-CASE --")
    for c in m["per_case"]:
        agree = c["category_agreement"]
        agree_str = "-" if agree is None else ("agree" if agree else "MISS")
        caution = c["caution_observed"]
        caution_str = "-" if caution is None else ("caution" if caution else "NO-CAUTION")
        lines.append(
            f"  [{c['group']:11}] {c['case_id']:26} "
            f"exp={c['expected_category'] or '-':18} "
            f"got={','.join(c['generated_categories']) or '-':40} "
            f"{agree_str:6} {caution_str}"
        )

    lines.append("\n-- TARGETS (aspirational, not measured) --")
    for k, v in report["targets"].items():
        lines.append(f"  {k}: {v}")

    lines.append("\n-- LIMITATIONS --")
    for lim in report["limitations"]:
        lines.append(f"  - {lim}")

    lines.append("=" * 70)
    return "\n".join(lines)
