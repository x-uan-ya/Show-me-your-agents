"""Source readers.

A ``SourceReader`` turns raw uploaded bytes into a uniform tabular form:
a list of column names and a list of row dicts. Business logic (mapping,
normalisation, storage) depends only on this interface, so adding an Excel or
JSON reader later requires no changes elsewhere.

Only CSV is implemented now, per scope.
"""

from __future__ import annotations

import csv
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class IngestionError(Exception):
    """Raised when uploaded content cannot be read as a valid table."""


@dataclass
class ParsedTable:
    columns: list[str] = field(default_factory=list)
    rows: list[dict[str, str]] = field(default_factory=list)


class SourceReader(ABC):
    """Reads raw bytes into a :class:`ParsedTable`."""

    @abstractmethod
    def read(self, raw: bytes) -> ParsedTable:  # pragma: no cover - interface
        raise NotImplementedError


class CsvReader(SourceReader):
    def read(self, raw: bytes) -> ParsedTable:
        try:
            # utf-8-sig transparently strips a BOM if present.
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise IngestionError("File is not valid UTF-8 text.") from exc

        # Reject content that is clearly not delimited text.
        if not text.strip():
            raise IngestionError("File is empty.")

        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise IngestionError("Could not read a header row.")

        columns = [c.strip() for c in reader.fieldnames if c and c.strip()]
        if not columns:
            raise IngestionError("No usable column headers found.")

        rows: list[dict[str, str]] = []
        for raw_row in reader:
            # Normalise keys (strip header whitespace); keep values as-is here,
            # value-level normalisation happens later during import.
            row = {
                (k.strip() if k else ""): ("" if v is None else v)
                for k, v in raw_row.items()
                if k and k.strip()
            }
            rows.append(row)

        return ParsedTable(columns=columns, rows=rows)


# Registry so a reader can be selected by source type. Extend this for xlsx/json.
_READERS: dict[str, SourceReader] = {"csv": CsvReader()}


def get_reader(source_type: str) -> SourceReader:
    reader = _READERS.get(source_type.lower())
    if reader is None:
        raise IngestionError(f"Unsupported source type: {source_type!r}")
    return reader
