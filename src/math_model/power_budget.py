"""Numerically stable helpers for telemetry-derived skill modifiers."""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
import math

import numpy as np


def ratchet_bonus(previously_granted_bonus: float, new_calculated_bonus: float) -> float:
    """Apply the non-degrading rule: granted power can only move upward."""
    if not math.isfinite(previously_granted_bonus) or not math.isfinite(new_calculated_bonus):
        raise ValueError("bonuses must be finite")
    return max(0.0, previously_granted_bonus, new_calculated_bonus)


def action_statistics(actions: Iterable[str]) -> dict[str, dict[str, float]]:
    """Return per-action counts and normalized frequencies."""
    counts = Counter(actions)
    total = sum(counts.values())
    return {
        action: {"count": float(count), "frequency": count / total if total else 0.0}
        for action, count in counts.items()
    }


def ema(values: Iterable[float], alpha: float = 0.2, initial: float | None = None) -> np.ndarray:
    """Return the exponential moving average; ``alpha`` must be in ``(0, 1]``."""
    if not 0 < alpha <= 1:
        raise ValueError("alpha must be in (0, 1]")
    data = np.asarray(list(values), dtype=float)
    if data.ndim != 1:
        raise ValueError("values must be one-dimensional")
    if data.size == 0:
        return np.array([], dtype=float)
    result = np.empty_like(data)
    result[0] = data[0] if initial is None else initial
    for i in range(1, data.size):
        result[i] = alpha * data[i] + (1 - alpha) * result[i - 1]
    return result


def empirical_bayes_smoothing(count: float, trials: float, prior_mean: float, prior_strength: float) -> float:
    """Beta-binomial posterior mean, providing a stable cold-start estimate."""
    if count < 0 or trials < 0 or count > trials:
        raise ValueError("count must be in [0, trials]")
    if not 0 <= prior_mean <= 1 or prior_strength < 0:
        raise ValueError("prior_mean must be in [0, 1] and prior_strength non-negative")
    denominator = trials + prior_strength
    return prior_mean if denominator == 0 else (count + prior_strength * prior_mean) / denominator


def z_score(value: float, mean: float, std: float, *, clip: float | None = None) -> float:
    """Calculate a z-score; a zero spread returns zero rather than NaN."""
    score = 0.0 if std <= 0 or not math.isfinite(std) else (value - mean) / std
    if clip is not None:
        if clip <= 0:
            raise ValueError("clip must be positive")
        score = float(np.clip(score, -clip, clip))
    return float(score)


def hill_soft_cap(value: float, threshold: float, maximum: float, hill: float = 2.0, decay: float = 0.15) -> float:
    """Apply Hill growth up to ``threshold`` and exponential soft-cap afterwards."""
    if threshold <= 0 or maximum <= 0 or hill <= 0 or decay < 0:
        raise ValueError("threshold, maximum and hill must be positive; decay non-negative")
    x = max(0.0, float(value))
    base = maximum * x**hill / (threshold**hill + x**hill) if x else 0.0
    if x <= threshold:
        return float(base)
    cap = maximum * (1.0 - math.exp(-decay * (x - threshold))) if decay else maximum
    return float(min(maximum, max(base, cap)))


def ngram_counts(actions: Sequence[str], min_length: int = 2, max_length: int = 3) -> Counter[tuple[str, ...]]:
    """Count contiguous action n-grams of lengths two and three by default."""
    if min_length < 1 or max_length < min_length:
        raise ValueError("invalid n-gram length range")
    counts: Counter[tuple[str, ...]] = Counter()
    for size in range(min_length, max_length + 1):
        counts.update(tuple(actions[i : i + size]) for i in range(len(actions) - size + 1))
    return counts
