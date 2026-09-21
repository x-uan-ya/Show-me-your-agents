"""In-process coordination for dataset analysis requests.

The deployed container currently runs one Uvicorn process. This coordinator
closes the small window before an ``AnalysisRun`` row is committed, preventing
two request threads from starting the same dataset analysis simultaneously.
The database-level running-run check in ``CustomerInsightEngine`` provides an
additional guard for already-recorded work.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock


class AnalysisAlreadyActiveError(RuntimeError):
    """Raised when this process is already analysing the same dataset."""


class AnalysisCoordinator:
    def __init__(self) -> None:
        self._guard = Lock()
        self._active: set[tuple[int, int]] = set()

    @contextmanager
    def claim(self, client_id: int, dataset_id: int) -> Iterator[None]:
        key = (client_id, dataset_id)
        with self._guard:
            if key in self._active:
                raise AnalysisAlreadyActiveError
            self._active.add(key)

        try:
            yield
        finally:
            with self._guard:
                self._active.discard(key)


analysis_coordinator = AnalysisCoordinator()
