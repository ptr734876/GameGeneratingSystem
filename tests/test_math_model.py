"""Tests and convergence plot for the power-budget model."""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pytest

from src.math_model.power_budget import (
    action_statistics,
    empirical_bayes_smoothing,
    ema,
    hill_soft_cap,
    ngram_counts,
    ratchet_bonus,
    z_score,
)


def test_zero_division_is_safe() -> None:
    assert z_score(10, 10, 0) == 0.0
    assert empirical_bayes_smoothing(0, 0, 0.25, 4) == 0.25
    assert action_statistics([]) == {}


def test_action_statistics() -> None:
    assert action_statistics(["a", "a", "b"])["a"] == {"count": 2.0, "frequency": pytest.approx(2 / 3)}


def test_empirical_bayes_reduces_cold_start_outlier() -> None:
    smoothed = empirical_bayes_smoothing(1, 1, prior_mean=0.2, prior_strength=9)
    assert smoothed == pytest.approx(0.28)
    assert smoothed < 1.0


def test_outlier_z_score_can_be_clipped() -> None:
    assert z_score(1_000, 0, 1, clip=5) == 5.0


def test_bonus_ratchet_never_degrades() -> None:
    assert ratchet_bonus(0.8, 0.2) == 0.8
    assert ratchet_bonus(0.8, 0.9) == 0.9


def test_saturation_is_bounded_and_asymptotic() -> None:
    values = [hill_soft_cap(x, threshold=10, maximum=100, decay=0.2) for x in np.logspace(-2, 5, 100)]
    assert all(0 <= value <= 100 for value in values)
    assert values[-1] == pytest.approx(100, abs=1e-6)
    assert values[-1] > values[0]


def test_ngram_mining() -> None:
    assert ngram_counts(["a", "b", "a"]) == {
        ("a", "b"): 1, ("b", "a"): 1, ("a", "b", "a"): 1
    }


def test_ema_converges() -> None:
    result = ema([0.0] + [1.0] * 100, alpha=0.2)
    assert result[-1] == pytest.approx(1.0, abs=1e-8)


def test_convergence_plot() -> None:
    output = Path("artifacts/plots")
    output.mkdir(parents=True, exist_ok=True)
    samples = np.arange(1, 101, dtype=float)
    curve = ema(samples, alpha=0.15)
    figure, axis = plt.subplots(figsize=(7, 4))
    axis.plot(samples, label="input")
    axis.plot(curve, label="EMA")
    axis.set(title="EMA convergence", xlabel="sample", ylabel="value")
    axis.legend()
    figure.tight_layout()
    figure.savefig(output / "ema_convergence.png", dpi=150)
    plt.close(figure)
    assert (output / "ema_convergence.png").exists()
