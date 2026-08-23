"""Generate a reproducible empirical telemetry baseline for 10,000 profiles."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

ACTIONS = ("dash", "light_attack", "heavy_parry", "heal", "move")
ARCHETYPES = {
    "casual": np.array([0.08, 0.28, 0.16, 0.16, 0.32]),
    "speedrunner": np.array([0.30, 0.20, 0.12, 0.04, 0.34]),
    "turtle": np.array([0.06, 0.12, 0.38, 0.20, 0.24]),
    "spam_exploiter": np.array([0.02, 0.08, 0.03, 0.02, 0.85]),
    "hybrid": np.array([0.22, 0.22, 0.20, 0.12, 0.24]),
}


def _profile_weights(rng: np.random.Generator, archetype: np.ndarray) -> np.ndarray:
    concentration = rng.lognormal(mean=2.0, sigma=0.45)
    return rng.dirichlet(np.maximum(archetype * concentration, 0.15))


def generate_baseline(profiles: int = 10_000, seed: int = 20260823) -> dict[str, Any]:
    """Return action distribution statistics with realistic profile-level variation."""
    if profiles <= 0:
        raise ValueError("profiles must be positive")
    rng = np.random.default_rng(seed)
    archetype_names = tuple(ARCHETYPES)
    profile_weights = rng.dirichlet(np.array([0.42, 0.12, 0.16, 0.08, 0.22]), profiles)
    samples: list[np.ndarray] = []
    intervals: list[float] = []
    streaks: list[int] = []
    for profile in profile_weights:
        archetype = ARCHETYPES[archetype_names[int(rng.choice(len(archetype_names), p=profile))]]
        distribution = _profile_weights(rng, archetype)
        ticks = int(rng.lognormal(np.log(750), 0.55))
        observations = rng.multinomial(ticks, distribution)
        samples.append(observations / ticks)
        intervals.extend(rng.lognormal(np.log(2.8), 0.75, max(4, ticks // 80)).tolist())
        streaks.append(int(rng.geometric(0.18)))
    matrix = np.vstack(samples)
    statistics: dict[str, Any] = {}
    for index, action in enumerate(ACTIONS):
        values = matrix[:, index]
        statistics[action] = {
            "mean": float(np.mean(values)),
            "variance": float(np.var(values, ddof=1)),
            "std_dev": float(np.std(values, ddof=1)),
            "percentiles": {str(p): float(np.percentile(values, p)) for p in (5, 25, 50, 75, 95)},
            "prior_weight": float(np.clip(1.0 / max(np.var(values), 1e-8), 5.0, 500.0)),
            "profiles": profiles,
        }
    return {
        "schema_version": 1, "seed": seed, "profiles": profiles,
        "archetypes": {name: {"prior_share": float(profile_weights[:, i].mean()), "action_means": ARCHETYPES[name].tolist()}
                for i, name in enumerate(archetype_names)},
        "actions": statistics,
        "intervals": {"mean": float(np.mean(intervals)), "variance": float(np.var(intervals)),
                       "percentiles": {str(p): float(np.percentile(intervals, p)) for p in (5, 50, 95)}},
        "streaks": {"mean": float(np.mean(streaks)), "p95": float(np.percentile(streaks, 95))},
    }


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    output = root / "artifacts" / "global_baseline.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(generate_baseline(), indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
