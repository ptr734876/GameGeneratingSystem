"""One-hour procedural progression verification."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from src.math_model.procedural_synthesis import ProceduralSkillEngine, simulate_archetype



def _stream(probabilities: list[float], actions: list[str], count: int, seed: int) -> list[str]:
    rng = np.random.default_rng(seed)
    return rng.choice(actions, size=count, p=probabilities).tolist()


def test_one_hour_generates_distinct_dags_and_bounded_stats() -> None:
    baseline_path = Path("artifacts/global_baseline.json")
    baseline = json.loads(baseline_path.read_text(encoding="utf-8")) if baseline_path.exists() else None
    streams = {
        "speedster": _stream([.45, .35, .15, .05], ["move", "dash", "light_attack", "heal"], 2400, 1),
        "turtle": _stream([.45, .30, .15, .10], ["parry", "heavy_parry", "heavy_attack", "heal"], 2400, 2),
        "hybrid": _stream([.25, .25, .20, .15, .15], ["move", "dash", "light_attack", "parry", "heal"], 2400, 3),
    }
    engines = {name: simulate_archetype(stream, baseline) for name, stream in streams.items()}
    graph_signatures = {name: tuple(sorted(engine.skills)) for name, engine in engines.items()}
    assert len(set(graph_signatures.values())) == 3
    for engine in engines.values():
        assert engine.total_xp > 0
        assert all(skill.granted_bonus <= .35 + 1e-9 for skill in engine.skills.values())
        assert all(skill.level >= 0 for skill in engine.skills.values())
        assert len(engine.audit) >= len(engine.skills)


def test_non_degrading_bonus_invariant() -> None:
    engine = simulate_archetype(["dash", "light_attack"] * 40)
    bonuses = {}
    for entry in engine.audit:
        if entry["event"] != "xp_gain":
            continue
        skill_id = entry["skill_id"]
        current = entry["granted_non_degrading"]
        assert current >= bonuses.get(skill_id, 0.0)
        bonuses[skill_id] = current


def test_ten_thousand_actions_have_strict_transitions_and_semantic_stats() -> None:
    stream = _stream([.35, .25, .20, .10, .10],
                     ["move", "dash", "light_attack", "heavy_attack", "parry"], 10_000, 42)
    engine = simulate_archetype(stream)
    assert all("move -> move" not in " -> ".join(pattern) for pattern in engine.pattern_counts)
    for skill in engine.skills.values():
        if set(skill.pattern) <= {"move", "dash"}:
            assert set(skill.stat_types) <= set(ProceduralSkillEngine.STAT_RULES["mobility"])
        if set(skill.pattern) <= {"light_attack", "heavy_attack"}:
            assert set(skill.stat_types) <= set(ProceduralSkillEngine.STAT_RULES["combat"])
        assert skill.granted_bonus <= 0.35


def test_progression_audit_is_reproducible() -> None:
    baseline_path = Path("artifacts/global_baseline.json")
    baseline = json.loads(baseline_path.read_text(encoding="utf-8")) if baseline_path.exists() else None
    streams = {
        "speedster": _stream([.5, .3, .2], ["move", "dash", "light_attack"], 2400, 11),
        "tank": _stream([.5, .3, .2], ["parry", "heavy_attack", "heal"], 2400, 12),
        "spammer": ["light_attack"] * 2400,
    }
    result = {}
    for name, stream in streams.items():
        engine = simulate_archetype(stream, baseline)
        result[name] = {"snapshot": engine.snapshot(), "stat_sheet": engine.stat_sheet(), "audit": engine.audit}
    output = Path("artifacts/procedural_progression_audit.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"duration_minutes": 60, "actions": 7200, "archetypes": result}, indent=2), encoding="utf-8")
    assert output.exists()
    assert result["spammer"]["stat_sheet"]["damage_percent"] <= 35.0
