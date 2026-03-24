"""Cleaning log — records every skip, mapping, or transform during data loading."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CleaningEntry:
    action: str  # "skipped_row", "mapped_value", "dropped_duplicate"
    reason: str  # "unmappable_location", "no_parseable_date"
    column: str | None = None
    original_value: str | None = None
    row_index: int | None = None


class CleaningLog:
    """Accumulates cleaning actions during a load and produces a summary."""

    def __init__(self) -> None:
        self._entries: list[CleaningEntry] = []

    def add(
        self,
        action: str,
        reason: str,
        *,
        column: str | None = None,
        original_value: str | None = None,
        row_index: int | None = None,
    ) -> None:
        self._entries.append(
            CleaningEntry(
                action=action,
                reason=reason,
                column=column,
                original_value=str(original_value)[:200] if original_value is not None else None,
                row_index=row_index,
            )
        )

    @property
    def summary(self) -> dict[str, int]:
        """Counts by (action, reason) pair."""
        counts: dict[str, int] = {}
        for e in self._entries:
            key = f"{e.action}:{e.reason}"
            counts[key] = counts.get(key, 0) + 1
        return counts

    def to_dict(self) -> list[dict]:
        return [
            {
                "action": e.action,
                "reason": e.reason,
                "column": e.column,
                "original_value": e.original_value,
                "row_index": e.row_index,
            }
            for e in self._entries
        ]

    def __len__(self) -> int:
        return len(self._entries)
