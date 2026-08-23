"""Dynamic procedural skill synthesis and one-hour progression model."""
from __future__ import annotations

from collections import Counter, deque
from dataclasses import asdict, dataclass
import math
from typing import Any, Iterable

from .power_budget import hill_soft_cap, ratchet_bonus


@dataclass
class SkillEntity:
    """A generated capability node in the player's DAG."""

    skill_id: str
    name: str
    trigger: str
    pattern: tuple[str, ...]
    level: int = 0
    xp: float = 0.0
    next_threshold: float = 100.0
    granted_bonus: float = 0.0
    damage_percent: float = 0.0
    cooldown_reduction_percent: float = 0.0
    speed_percent: float = 0.0
    lifesteal_percent: float = 0.0
    parents: tuple[str, ...] = ()
    soft_cap_active: bool = False
    stat_types: tuple[str, ...] = ()
    situational: bool = False
    combo_window_seconds: float | None = None
    stats: dict[str, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["pattern"] = list(self.pattern)
        result["parents"] = list(self.parents)
        result["stat_types"] = list(self.stat_types)
        result["stats"] = self.stats or {}
        return result


class ProceduralSkillEngine:
    """Synthesize distinct skills from recurring sequences and contextual anomalies."""

    NAME_RULES = {
        ("dash", "light_attack"): ("Phantom Thrust", "On Combo", "hybrid"),
        ("parry", "heavy_attack"): ("Vengeful Cleave", "On Combo", "hybrid"),
        ("move", "dash"): ("Vector Drift", "On Combo", "mobility"),
        ("light_attack", "light_attack", "light_attack"): ("Blade Flurry", "On Combo", "combat"),
        ("light_attack", "light_attack"): ("Relentless Tempo", "On Combo", "combat"),
        ("heal",): ("Second Wind", "Passive", "sustain"),
        ("heavy_parry",): ("Iron Reflex", "Low-HP Reaction", "defensive"),
        ("move",): ("Kinetic Footwork", "Passive", "mobility"),
        ("dash",): ("Slipstream Step", "Passive", "mobility"),
        ("light_attack",): ("Rising Edge", "Passive", "combat"),
        ("heavy_attack",): ("Bastion Force", "Passive", "combat"),
        ("parry",): ("Readied Guard", "Passive", "defensive"),
    }

    STAT_RULES = {
        "mobility": ("move_speed_percent", "dash_cooldown_reduction_percent", "dash_distance_percent", "stamina_cost_reduction_percent"),
        "combat": ("attack_damage_percent", "critical_chance_percent", "attack_speed_percent", "armor_penetration_percent"),
        "defensive": ("damage_mitigation_percent", "counter_damage_multiplier_percent", "parry_window_expansion_ms", "reflect_percent"),
        "sustain": ("hp_recovery_percent", "life_steal_on_hit_percent", "healing_cooldown_reduction_percent"),
        "hybrid": ("dash_strike_damage_percent", "invulnerability_frame_bonus_ms"),
    }

    def __init__(self, baseline: dict[str, Any] | None = None) -> None:
        self.baseline = baseline or {}
        self.skills: dict[str, SkillEntity] = {}
        self.edges: set[tuple[str, str]] = set()
        self.recent: deque[str] = deque(maxlen=3)
        self.pattern_counts: Counter[tuple[str, ...]] = Counter()
        self.total_xp = 0.0
        self.audit: list[dict[str, Any]] = []

    def _definition(self, pattern: tuple[str, ...], low_hp: bool) -> tuple[str, str, str]:
        if low_hp and pattern[-1] in {"parry", "heavy_parry"}:
            return "Last Stand Protocol", "Low-HP Reaction", "defensive"
        if pattern in self.NAME_RULES:
            return self.NAME_RULES[pattern]
        category = self._category(pattern)
        return (f"{' '.join(word.title() for word in pattern)} Mastery", "On Combo" if len(pattern) > 1 else "Passive", category)

    @staticmethod
    def _category(pattern: tuple[str, ...]) -> str:
        groups = [{"move", "dash"}, {"light_attack", "heavy_attack"}, {"block", "parry", "heavy_parry"}, {"heal", "potion"}]
        touched = [index for index, group in enumerate(groups) if any(action in group for action in pattern)]
        if len(touched) > 1:
            return "hybrid"
        return ("mobility", "combat", "defensive", "sustain")[touched[0]] if touched else "combat"

    def _skill_id(self, pattern: tuple[str, ...], trigger: str) -> str:
        return "skill:" + trigger.lower().replace(" ", "-") + ":" + "+".join(pattern)

    def _allocate(self, category: str, bonus: float) -> dict[str, float]:
        allocation = {key: 0.0 for keys in self.STAT_RULES.values() for key in keys}
        for key in self.STAT_RULES[category]:
            allocation[key] = bonus * 100.0
        return allocation

    def _ensure_skill(self, pattern: tuple[str, ...], low_hp: bool) -> SkillEntity:
        name, trigger, category = self._definition(pattern, low_hp)
        skill_id = self._skill_id(pattern, trigger)
        if skill_id in self.skills:
            return self.skills[skill_id]
        parents = tuple(skill.skill_id for skill in self.skills.values() if len(skill.pattern) < len(pattern) and set(skill.pattern).issubset(pattern))
        category = self._definition(pattern, low_hp)[2]
        skill = SkillEntity(skill_id, name, trigger, pattern, parents=parents,
                    stat_types=self.STAT_RULES[category], situational=len(pattern) > 1,
                            combo_window_seconds=1.2 if len(pattern) > 1 else None,
                            stats={key: 0.0 for key in self.STAT_RULES[category]})
        self.skills[skill_id] = skill
        self.edges.update((parent, skill_id) for parent in parents)
        self.audit.append({"event": "skill_synthesized", "skill": skill.to_dict(), "pattern": list(pattern), "parents": list(parents)})
        return skill

    def process_action(self, action: str, timestamp: float, *, low_hp: bool = False) -> list[SkillEntity]:
        """Feed one action and return newly synthesized or activated skills."""
        if self.recent and self.recent[-1] == action:
            self.recent.clear()
            self.recent.append(action)
            self.pattern_counts[(action,)] += 1
            if self.pattern_counts[(action,)] >= 3:
                skill = self._ensure_skill((action,), low_hp)
                self.grant_xp(skill.skill_id, 2.4, timestamp, low_hp=low_hp)
                return [skill]
            return []
        self.recent.append(action)
        recent = tuple(self.recent)
        candidates = [recent[-size:] for size in (1, 2, 3) if len(recent) >= size]
        activated: list[SkillEntity] = []
        for pattern in candidates:
            self.pattern_counts[pattern] += 1
            if len(pattern) == 1 and self.pattern_counts[pattern] < 3:
                continue
            if len(pattern) > 1 and self.pattern_counts[pattern] < 2:
                continue
            skill = self._ensure_skill(pattern, low_hp)
            xp_gain = 2.4 if len(pattern) == 1 else 4.8 + len(pattern)
            self.grant_xp(skill.skill_id, xp_gain, timestamp, low_hp=low_hp)
            activated.append(skill)
        return activated

    def grant_xp(self, skill_id: str, amount: float, timestamp: float, *, low_hp: bool = False) -> None:
        skill = self.skills[skill_id]
        before = skill.granted_bonus
        skill.xp += max(0.0, amount)
        self.total_xp += max(0.0, amount)
        while skill.xp >= skill.next_threshold:
            skill.xp -= skill.next_threshold
            skill.level += 1
            skill.next_threshold = 100.0 * math.pow(1.12, skill.level)
        normalized = skill.level + skill.xp / skill.next_threshold
        calculated = hill_soft_cap(normalized, 2.0, 0.35, 2.0, 0.35)
        skill.granted_bonus = ratchet_bonus(skill.granted_bonus, calculated)
        skill.soft_cap_active = normalized > 2.0
        allocation = self._allocate(self._definition(skill.pattern, low_hp)[2], skill.granted_bonus)
        if skill.stats is None:
            skill.stats = {}
        for key, value in allocation.items():
            if key in skill.stat_types:
                skill.stats[key] = max(skill.stats.get(key, 0.0), value)
        self.audit.append({"event": "xp_gain", "timestamp": timestamp, "skill_id": skill_id, "xp_gain": amount,
                           "xp_after": skill.xp, "level": skill.level, "threshold": skill.next_threshold,
                           "hill_input": normalized, "calculated_bonus": calculated,
                           "previous_granted_bonus": before, "granted_non_degrading": skill.granted_bonus,
                           "soft_cap_active": skill.soft_cap_active, "stats": skill.to_dict()})

    def snapshot(self) -> dict[str, Any]:
        return {"nodes": [skill.to_dict() for skill in self.skills.values()],
                "edges": [list(edge) for edge in sorted(self.edges)], "total_xp": self.total_xp,
                "pattern_counts": {" -> ".join(pattern): count for pattern, count in self.pattern_counts.items()}}

    def stat_sheet(self) -> dict[str, float]:
        keys = {key for skill in self.skills.values() for key in skill.stat_types}
        sheet = {key: min(35.0, sum((skill.stats or {}).get(key, 0.0) for skill in self.skills.values())) for key in keys}
        # Compatibility aliases expose the old aggregate view without changing semantic allocation.
        sheet["damage_percent"] = sheet.get("attack_damage_percent", 0.0)
        sheet["speed_percent"] = sheet.get("move_speed_percent", 0.0)
        sheet["cooldown_reduction_percent"] = sheet.get("dash_cooldown_reduction_percent", 0.0)
        sheet["lifesteal_percent"] = sheet.get("life_steal_on_hit_percent", 0.0)
        return sheet


def simulate_archetype(actions: Iterable[str], baseline: dict[str, Any] | None = None) -> ProceduralSkillEngine:
    """Run a deterministic action stream through a fresh synthesis engine."""
    engine = ProceduralSkillEngine(baseline)
    for tick, action in enumerate(actions):
        engine.process_action(action, tick / 120.0, low_hp=(action in {"parry", "heavy_parry"} and tick % 17 == 0))
    return engine
