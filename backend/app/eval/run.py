"""CLI runner for the evaluation suite.

Usage (from the backend directory):
    python -m app.eval.run

Prints the human-readable report. Reproducible: uses synthetic cases and an
isolated in-memory database, so repeated runs give the same measured results.
"""

from __future__ import annotations

from app.eval.report import build_report, render_text


def main() -> None:
    report = build_report()
    print(render_text(report))


if __name__ == "__main__":
    main()
