"""Synthetic player telemetry generation for prototyping."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterator, Mapping, Sequence

import numpy as np


@dataclass(frozen=True)
class ActionLog:
    """One player action event."""

    timestamp: datetime
    action_id: str
    context_tags: tuple[str, ...]


_ARCHETYPES: Mapping[str, tuple[tuple[str, float], ...]] = {
    "Melee Berserker": (
        ("heavy_attack", 0.30), ("light_attack", 0.25), ("dodge", 0.15),
        ("block", 0.12), ("ability_rage", 0.10), ("heal", 0.08),
    ),
    "Stealth Archer": (
        ("aim", 0.26), ("ranged_attack", 0.25), ("hide", 0.18),
        ("relocate", 0.13), ("dodge", 0.10), ("ability_trap", 0.08),
    ),
    "Unorthodox Hybrid": (
        ("light_attack", 0.18), ("ranged_attack", 0.17), ("dodge", 0.16),
        ("ability_trap", 0.13), ("block", 0.12), ("heal", 0.11),
        ("ability_rage", 0.13),
    ),
}


class TelemetryGenerator:
    """Generate reproducible, timestamped action streams for player archetypes."""

    def __init__(self, seed: int | None = None) -> None:
        self._rng = np.random.default_rng(seed)

    def generate(
        self,
        archetype: str,
        n_actions: int = 1_000,
        start: datetime | None = None,
    ) -> list[ActionLog]:
        """Generate ``n_actions`` while preserving chronological order."""
        if archetype not in _ARCHETYPES:
            raise ValueError(f"Unknown archetype: {archetype!r}")
        if n_actions < 0:
            raise ValueError("n_actions must be non-negative")
        start = start or datetime.now(timezone.utc)
        actions, probabilities = zip(*_ARCHETYPES[archetype])
        selected = self._rng.choice(actions, size=n_actions, p=probabilities)
        gaps = self._rng.exponential(scale=2.5, size=n_actions)
        contexts = {
            "heavy_attack": ("close_range", "combat"), "light_attack": ("close_range", "combat"),
            "ranged_attack": ("long_range", "combat"), "aim": ("long_range", "combat"),
            "hide": ("stealth", "exploration"), "relocate": ("movement",), "dodge": ("movement", "defense"),
            "block": ("close_range", "defense"), "heal": ("resource",),
            "ability_rage": ("ability", "combat"), "ability_trap": ("ability", "stealth"),
        }
        elapsed = 0.0
        result: list[ActionLog] = []
        for action in selected:
            elapsed += float(gaps[len(result)])
            result.append(ActionLog(start + timedelta(seconds=elapsed), str(action), contexts[str(action)]))
        return result

    def iter_events(self, archetype: str, n_actions: int = 1_000) -> Iterator[ActionLog]:
        """Yield generated events as an iterator."""
        yield from self.generate(archetype, n_actions)


def generate_telemetry(archetype: str, n_actions: int = 1_000, seed: int | None = None) -> list[ActionLog]:
    """Convenience wrapper around :class:`TelemetryGenerator`."""
    return TelemetryGenerator(seed).generate(archetype, n_actions)


ARCHETYPES: Sequence[str] = tuple(_ARCHETYPES)
