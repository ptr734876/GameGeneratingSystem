"""Interactive SkillGen arena sandbox.

Run from the repository root with: python demo/arena_sandbox.py
Use --frames N for a short headless smoke run.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import random
import sys
import time
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import pygame
from src.math_model.procedural_synthesis import ProceduralSkillEngine

BASELINE_PATH = ROOT / "artifacts" / "global_baseline.json"
WIDTH, HEIGHT, PANEL = 1280, 720, 350
ARENA = pygame.Rect(0, 0, WIDTH - PANEL, HEIGHT)
ACTION_NAMES = {1: "Move", 2: "Dash", 3: "Light Strike", 10: "Block", 11: "Parry", 12: "Heavy Strike", 20: "Spammer", 21: "Recovery", 30: "Heal"}
BOT_ACTIONS = {"Speedster": ((1, .4), (2, .4), (3, .2)), "Tank": ((10, .3), (11, .3), (12, .4)), "Berserker": ((3, .55), (12, .4), (2, .05))}


class ActionEvent(ctypes.Structure):
    _fields_ = [("action_id", ctypes.c_uint32), ("context_tags", ctypes.c_uint32), ("timestamp_seconds", ctypes.c_double)]


class SkillModifier(ctypes.Structure):
    _fields_ = [("action_name", ctypes.c_char * 64), ("value", ctypes.c_double), ("confidence", ctypes.c_double), ("sample_count", ctypes.c_uint64)]


class GateRule(ctypes.Structure):
    _fields_ = [("required_level", ctypes.c_int32), ("required_region", ctypes.c_char_p), ("minimum_samples", ctypes.c_uint64)]


class EngineConfig(ctypes.Structure):
    _fields_ = [("ema_alpha", ctypes.c_double), ("gate", GateRule), ("max_skills", ctypes.c_uint32)]


class NativeTracker:
    """Thin C-ABI adapter; absence of DLL is handled by the Python metrics path."""
    def __init__(self) -> None:
        self.api: Any = None
        self.ctx: Any = None
        dll = ROOT / "build-capi" / "libskillgen_c_api.dll"
        core = ROOT / "build-capi" / "libgame_core.dll"
        try:
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(str(dll.parent))
                os.add_dll_directory(r"C:\mingw64\bin")
            ctypes.CDLL(str(core))
            self.api = ctypes.CDLL(str(dll))
            self.api.skillgen_create_context.argtypes = [ctypes.POINTER(EngineConfig)]
            self.api.skillgen_create_context.restype = ctypes.c_void_p
            self.api.skillgen_destroy_context.argtypes = [ctypes.c_void_p]
            self.api.skillgen_push_action.argtypes = [ctypes.c_void_p, ctypes.POINTER(ActionEvent)]
            self.api.skillgen_push_action.restype = ctypes.c_int
            self.api.skillgen_evaluate_skills.argtypes = [ctypes.c_void_p, ctypes.POINTER(SkillModifier), ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
            self.api.skillgen_evaluate_skills.restype = ctypes.c_int
            config = EngineConfig(.2, GateRule(0, b"", 1), 64)
            self.ctx = self.api.skillgen_create_context(ctypes.byref(config))
        except (OSError, FileNotFoundError):
            self.api = None

    def push(self, action_id: int, tags: int, timestamp: float) -> None:
        if self.api and self.ctx:
            event = ActionEvent(action_id, tags, timestamp)
            self.api.skillgen_push_action(self.ctx, ctypes.byref(event))

    def values(self) -> dict[int, float]:
        if not self.api or not self.ctx:
            return {}
        output = (SkillModifier * 64)()
        count = ctypes.c_int()
        self.api.skillgen_evaluate_skills(self.ctx, output, 64, ctypes.byref(count))
        return {int(output[i].action_name.decode()): output[i].value for i in range(count.value)}

    def close(self) -> None:
        if self.api and self.ctx:
            self.api.skillgen_destroy_context(self.ctx)
            self.ctx = None


@dataclass
class Enemy:
    position: pygame.Vector2
    kind: str = "Melee"
    health: float = 100.0
    max_health: float = 100.0
    phase: float = 0.0
    attack_cooldown: float = 0.0
    speed: float = 2.0


@dataclass
class Projectile:
    position: pygame.Vector2
    velocity: pygame.Vector2
    damage: float
    is_enemy: bool = True
    life: float = 3.0


@dataclass
class FloatingText:
    text: str
    position: pygame.Vector2
    color: tuple[int, int, int]
    life: float = 1.0


class ArenaGame:
    def __init__(self, headless: bool = False) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("SkillGen // Adaptive Arena") if not headless else None
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("consolas", 14)
        self.bold_font = pygame.font.SysFont("consolas", 15, bold=True)
        self.title = pygame.font.SysFont("consolas", 24, bold=True)
        self.running, self.mode, self.frame = True, "Manual", 0
        self.graph_fullscreen = False
        self.rng = random.Random(42)
        self.counts: Counter[int] = Counter()
        self.events: deque[str] = deque(maxlen=8)
        self.toasts: deque[tuple[str, float]] = deque(maxlen=4)
        self.skills: dict[str, float] = {}
        self.previous_levels: dict[str, int] = {}
        self.player = pygame.Vector2(360, 340)
        self.velocity = pygame.Vector2()
        self.last_action = "Idle"
        self.native = NativeTracker()
        self.baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8")) if BASELINE_PATH.exists() else {}
        self.synthesis = ProceduralSkillEngine(self.baseline)
        self.health, self.max_health = 100.0, 100.0
        self.stamina, self.combo_gauge = 100.0, 0.0
        self.wave = 1
        self.enemies: list[Enemy] = []
        self.projectiles: list[Projectile] = []
        self.floating_texts: list[FloatingText] = []
        self.kills = 0
        self.dash_time = 0.0
        self.dash_cooldown = 0.0
        self.attack_cooldown = 0.0
        self.heal_cooldown = 0.0
        self.is_parrying = False
        self.move_emit_timer = 0.0
        self.stat_sheet: dict[str, float] = {}
        self.spawn_wave()

    def spawn_wave(self) -> None:
        kinds = ("Melee", "Ranged", "Heavy")
        base_count = min(3 + self.wave, 8)
        self.enemies = []
        for index in range(base_count):
            kind = kinds[index % 3]
            pos = pygame.Vector2(
                random.uniform(60, ARENA.width - 60),
                random.uniform(60, HEIGHT - 60)
            )
            while pos.distance_to(self.player) < 160:
                pos = pygame.Vector2(
                    random.uniform(60, ARENA.width - 60),
                    random.uniform(60, HEIGHT - 60)
                )
            hp = 70.0 + self.wave * 18.0 if kind != "Heavy" else 150.0 + self.wave * 35.0
            spd = 2.4 if kind == "Melee" else (1.4 if kind == "Ranged" else 1.1)
            self.enemies.append(Enemy(pos, kind, hp, hp, 0.0, random.uniform(0.5, 1.5), spd))
        self.toast(f"WAVE {self.wave} INCOMING")

    def reset(self) -> None:
        self.counts.clear(); self.events.clear(); self.skills.clear(); self.previous_levels.clear()
        self.toasts.clear(); self.projectiles.clear(); self.floating_texts.clear()
        self.player.update(360, 340); self.mode = "Manual"; self.frame = 0; self.kills = 0; self.wave = 1
        self.native.close(); self.native = NativeTracker(); self.toast("Telemetry reset")
        self.synthesis = ProceduralSkillEngine(self.baseline)
        self.health, self.stamina, self.combo_gauge = 100.0, 100.0, 0.0
        self.spawn_wave()

    def toast(self, message: str) -> None:
        self.toasts.append((message, time.monotonic() + 2.5))

    def add_floating_text(self, text: str, pos: pygame.Vector2, color: tuple[int, int, int]) -> None:
        self.floating_texts.append(FloatingText(text, pygame.Vector2(pos.x, pos.y), color, 1.0))

    def emit(self, action_id: int, label: str, value: float = 0.0) -> None:
        self.counts[action_id] += 1
        self.last_action = label
        self.native.push(action_id, 1, self.frame / 60.0)
        action_key = {
            1: "move", 2: "dash", 3: "light_attack", 10: "block", 11: "parry",
            12: "heavy_attack", 20: "light_attack", 21: "heal", 30: "heal"
        }.get(action_id, "move")
        generated = self.synthesis.process_action(action_key, self.frame / 60.0, low_hp=self.health < 25)
        for skill in generated:
            if skill.level > self.previous_levels.get(skill.skill_id, 0):
                self.toast(f"PROMOTED: {skill.name} LV{skill.level}")
            self.previous_levels[skill.skill_id] = skill.level
        top = self.counts.most_common(1)[0][1]
        share = top / max(1, sum(self.counts.values()))
        combo = " + combo" if len(self.events) and label.split()[0] == self.events[-1].split()[0] else ""
        self.events.appendleft(f"{label:<14} -> z {share * 2 - 1:+.2f}{combo} -> +{value * 100:.1f}%")
        if share > 0.82 and sum(self.counts.values()) > 20:
            self.toast("DIMINISHING RETURNS ACTIVE")

    def bot_tick(self) -> None:
        actions = BOT_ACTIONS.get(self.mode)
        if not actions:
            return
        point = self.rng.random(); cumulative = 0.0
        for action_id, probability in actions:
            cumulative += probability
            if point < cumulative:
                self.emit(action_id, ACTION_NAMES[action_id], 0.1)
                break
        if self.mode == "Speedster":
            self.player.x = (self.player.x + 3.0) % (ARENA.width - 50) + 25
        elif self.mode == "Tank":
            self.player.x += math.sin(self.frame / 30.0) * 0.8
            self.is_parrying = (self.frame % 60 < 30)
        else:
            self.player.x += math.cos(self.frame / 40.0) * 1.5

    def manual_tick(self, keys: Any, mouse: tuple[int, int], buttons: tuple[bool, bool, bool]) -> None:
        speed_mult = 1.0 + self.stat_sheet.get("move_speed_percent", 0.0) / 100.0
        dash_dist_mult = 1.0 + self.stat_sheet.get("dash_distance_percent", 0.0) / 100.0
        dash_cd_reduction = self.stat_sheet.get("dash_cooldown_reduction_percent", 0.0) / 100.0

        direction = pygame.Vector2(keys[pygame.K_d] - keys[pygame.K_a], keys[pygame.K_s] - keys[pygame.K_w])
        is_moving = direction.length_squared() > 0

        # Dash execution
        if keys[pygame.K_SPACE] and self.dash_cooldown <= 0 and self.stamina >= 20.0:
            self.stamina -= 20.0
            self.dash_time = 0.18
            self.dash_cooldown = max(0.4, 1.2 * (1.0 - dash_cd_reduction))
            dash_dir = direction.normalize() if is_moving else pygame.Vector2(1, 0)
            self.velocity = dash_dir * (12.0 * dash_dist_mult)
            self.emit(2, "Dash", 0.08)
            self.toast("DASH // I-FRAMES")

        # Movement physics and throttled telemetry emission
        if self.dash_time > 0:
            self.player += self.velocity
            self.dash_time = max(0.0, self.dash_time - 1.0 / 60.0)
        elif is_moving:
            direction = direction.normalize()
            self.velocity = direction * (4.5 * speed_mult)
            self.player += self.velocity
            self.move_emit_timer -= 1.0 / 60.0
            if self.move_emit_timer <= 0.0:
                self.emit(1, "Move", 0.04)
                self.move_emit_timer = 0.25
        else:
            self.velocity.update(0, 0)

        # Parry mechanic
        self.is_parrying = (keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]) and self.stamina > 0.0
        if self.is_parrying:
            self.stamina = max(0.0, self.stamina - 0.4)
            if self.frame % 30 == 0:
                self.emit(11, "Parry", 0.03)

        # Attacks
        mouse_pos = pygame.Vector2(mouse[0], mouse[1])
        damage_mult = 1.0 + self.stat_sheet.get("attack_damage_percent", 0.0) / 100.0
        crit_chance = min(0.75, 0.10 + self.stat_sheet.get("critical_chance_percent", 0.0) / 100.0)
        lifesteal = self.stat_sheet.get("life_steal_on_hit_percent", 0.0) / 100.0

        if buttons[0] and self.attack_cooldown <= 0:
            self.attack_cooldown = max(0.15, 0.35 / (1.0 + self.stat_sheet.get("attack_speed_percent", 0.0) / 100.0))
            self.emit(3, "Light Strike", 0.08)
            is_crit = (random.random() < crit_chance)
            dmg = (28.0 * damage_mult) * (1.8 if is_crit else 1.0)
            hit_any = self.execute_player_attack(mouse_pos, 95.0, dmg, is_crit, lifesteal)
            if hit_any:
                self.combo_gauge = min(100.0, self.combo_gauge + 15.0)

        if buttons[2] and self.attack_cooldown <= 0:
            self.attack_cooldown = max(0.3, 0.7 / (1.0 + self.stat_sheet.get("attack_speed_percent", 0.0) / 100.0))
            self.emit(12, "Heavy Strike", 0.14)
            is_crit = (random.random() < crit_chance)
            dmg = (65.0 * damage_mult) * (2.0 if is_crit else 1.0)
            hit_any = self.execute_player_attack(mouse_pos, 140.0, dmg, is_crit, lifesteal)
            if hit_any:
                self.combo_gauge = min(100.0, self.combo_gauge + 25.0)

        # Healing potion
        if keys[pygame.K_q] and self.heal_cooldown <= 0:
            self.heal_cooldown = max(2.0, 5.0 * (1.0 - self.stat_sheet.get("healing_cooldown_reduction_percent", 0.0) / 100.0))
            heal_power = 35.0 * (1.0 + self.stat_sheet.get("hp_recovery_percent", 0.0) / 100.0)
            self.health = min(self.max_health, self.health + heal_power)
            self.emit(30, "Healing Potion", 0.06)
            self.add_floating_text(f"+{int(heal_power)} HP", self.player, (120, 240, 160))

        # Clamp inside arena
        self.player.x = max(25, min(ARENA.right - 25, self.player.x))
        self.player.y = max(25, min(HEIGHT - 25, self.player.y))

    def execute_player_attack(self, target_pos: pygame.Vector2, reach: float, damage: float, is_crit: bool, lifesteal: float) -> bool:
        hit = False
        aim_vec = target_pos - self.player
        aim_dist = aim_vec.length()
        for enemy in self.enemies:
            if enemy.health <= 0:
                continue
            to_enemy = enemy.position - self.player
            dist = to_enemy.length()
            if dist <= reach or (aim_dist > 0 and dist < reach * 1.5 and to_enemy.normalize().dot(aim_vec.normalize()) > 0.65):
                enemy.health = max(0.0, enemy.health - damage)
                hit = True
                col = (255, 215, 80) if is_crit else (255, 255, 255)
                lbl = f"{int(damage)} CRIT!" if is_crit else f"{int(damage)}"
                self.add_floating_text(lbl, enemy.position, col)
                if lifesteal > 0:
                    stolen = damage * lifesteal
                    self.health = min(self.max_health, self.health + stolen)
                    self.add_floating_text(f"+{int(stolen)}", self.player, (120, 240, 160))
                if enemy.health <= 0:
                    self.kills += 1
                    self.add_floating_text("DEFEATED", enemy.position, (255, 100, 100))
        return hit

    def update_combat(self) -> None:
        dt = 1.0 / 60.0
        self.dash_cooldown = max(0.0, self.dash_cooldown - dt)
        self.attack_cooldown = max(0.0, self.attack_cooldown - dt)
        self.heal_cooldown = max(0.0, self.heal_cooldown - dt)

        # Enemy AI & Projectiles
        mitigation = min(0.75, self.stat_sheet.get("damage_mitigation_percent", 0.0) / 100.0)
        counter_mult = 1.0 + self.stat_sheet.get("counter_damage_multiplier_percent", 0.0) / 100.0
        reflect_pct = self.stat_sheet.get("reflect_percent", 0.0) / 100.0

        for enemy in self.enemies:
            if enemy.health <= 0:
                continue
            to_player = self.player - enemy.position
            dist = to_player.length()
            if dist > 0:
                dir_vec = to_player.normalize()
            else:
                dir_vec = pygame.Vector2(1, 0)

            # Move logic
            if enemy.kind == "Melee":
                enemy.position += dir_vec * enemy.speed
                if dist < 32 and enemy.attack_cooldown <= 0:
                    enemy.attack_cooldown = 1.0
                    self.apply_incoming_damage(16.0, enemy, mitigation, counter_mult, reflect_pct)
            elif enemy.kind == "Ranged":
                if dist < 180:
                    enemy.position -= dir_vec * enemy.speed
                elif dist > 260:
                    enemy.position += dir_vec * enemy.speed
                if enemy.attack_cooldown <= 0:
                    enemy.attack_cooldown = 2.2
                    self.projectiles.append(Projectile(pygame.Vector2(enemy.position.x, enemy.position.y), dir_vec * 5.0, 14.0, is_enemy=True))
            elif enemy.kind == "Heavy":
                enemy.position += dir_vec * enemy.speed
                if dist < 42 and enemy.attack_cooldown <= 0:
                    enemy.attack_cooldown = 1.8
                    self.apply_incoming_damage(30.0, enemy, mitigation, counter_mult, reflect_pct)

            enemy.attack_cooldown = max(0.0, enemy.attack_cooldown - dt)

        # Update Projectiles
        for p in self.projectiles:
            p.position += p.velocity
            p.life -= dt
            if p.is_enemy and p.position.distance_to(self.player) < 22:
                p.life = 0
                self.apply_incoming_damage(p.damage, None, mitigation, counter_mult, reflect_pct)

        self.projectiles = [p for p in self.projectiles if p.life > 0]

        # Update Floating Texts
        for ft in self.floating_texts:
            ft.position.y -= 0.6
            ft.life -= dt
        self.floating_texts = [ft for ft in self.floating_texts if ft.life > 0]

        # Filter dead enemies and check wave clear
        alive_enemies = [e for e in self.enemies if e.health > 0]
        if not alive_enemies and self.enemies:
            self.wave += 1
            self.spawn_wave()

    def apply_incoming_damage(self, raw_damage: float, attacker: Enemy | None, mitigation: float, counter_mult: float, reflect_pct: float) -> None:
        if self.dash_time > 0:
            self.add_floating_text("DODGE", self.player, (100, 200, 255))
            return

        if self.is_parrying:
            parry_reflect = raw_damage * counter_mult * max(0.5, reflect_pct)
            self.add_floating_text("PARRIED!", self.player, (255, 230, 90))
            if attacker:
                attacker.health = max(0.0, attacker.health - parry_reflect)
                self.add_floating_text(f"{int(parry_reflect)} REFLECT", attacker.position, (255, 180, 50))
            return

        actual_damage = raw_damage * (1.0 - mitigation)
        self.health = max(0.0, self.health - actual_damage)
        self.add_floating_text(f"-{int(actual_damage)}", self.player, (255, 90, 90))
        if self.health <= 0:
            self.toast("CRITICAL HEALTH // RESYNCING")
            self.health = self.max_health

    def update_skills(self) -> None:
        self.skills = {skill.name: skill.granted_bonus for skill in self.synthesis.skills.values()}
        self.stat_sheet = self.synthesis.stat_sheet()
        self.stamina = min(100.0, self.stamina + 0.35)
        self.combo_gauge = max(0.0, self.combo_gauge - 0.12)

    def draw_curve(self, area: pygame.Rect) -> None:
        pygame.draw.rect(self.screen, (22, 30, 42), area, border_radius=4)
        pygame.draw.line(self.screen, (65, 81, 101), (area.left + 12, area.bottom - 15), (area.right - 10, area.bottom - 15), 1)
        points = []
        for i in range(area.width - 24):
            x = i / max(1, area.width - 24) * 3
            y = 1 - math.exp(-x * 1.7)
            points.append((area.left + 12 + i, area.bottom - 15 - int(y * (area.height - 30))))
        pygame.draw.lines(self.screen, (74, 211, 164), False, points, 2)
        most = self.counts.most_common(1)
        position = most[0][1] / max(1, sum(self.counts.values())) if most else 0
        px = area.left + 12 + int(min(1, position) * (area.width - 24))
        pygame.draw.circle(self.screen, (255, 190, 84), (px, area.bottom - 15 - int((1 - math.exp(-position * 5)) * (area.height - 30))), 5)
        self.text("HILL SATURATION CURVE", area.left + 12, area.top + 8, (151, 166, 184))

    def text(self, value: str, x: int, y: int, color: tuple[int, int, int] = (220, 228, 238), font: Any = None) -> None:
        rendered = (font or self.font).render(value, True, color)
        self.screen.blit(rendered, (x, y))

    def draw(self) -> None:
        self.screen.fill((10, 16, 25))
        pygame.draw.rect(self.screen, (13, 21, 33), ARENA)
        for x in range(0, ARENA.width, 40):
            pygame.draw.line(self.screen, (18, 31, 46), (x, 0), (x, HEIGHT))
        for y in range(0, HEIGHT, 40):
            pygame.draw.line(self.screen, (18, 31, 46), (0, y), (ARENA.width, y))

        # Draw Player
        player_color = (120, 255, 210) if self.dash_time <= 0 else (255, 255, 255)
        if self.is_parrying:
            pygame.draw.circle(self.screen, (255, 215, 80), self.player, 24, 2)
        pygame.draw.circle(self.screen, player_color, self.player, 16)

        # Draw Player HP bar
        hp_bar_w = 40
        pygame.draw.rect(self.screen, (30, 40, 50), (self.player.x - hp_bar_w // 2, self.player.y - 26, hp_bar_w, 4))
        pygame.draw.rect(self.screen, (74, 211, 164), (self.player.x - hp_bar_w // 2, self.player.y - 26, int(hp_bar_w * self.health / self.max_health), 4))

        # Draw Enemies
        for enemy in self.enemies:
            if enemy.health <= 0:
                continue
            color = {"Melee": (218, 91, 103), "Ranged": (224, 154, 75), "Heavy": (166, 104, 190)}[enemy.kind]
            radius = 22 if enemy.kind == "Heavy" else 16
            pygame.draw.circle(self.screen, color, enemy.position, radius)
            # Enemy HP bar
            pygame.draw.rect(self.screen, (30, 40, 50), (enemy.position.x - 22, enemy.position.y - 28, 44, 4))
            pygame.draw.rect(self.screen, color, (enemy.position.x - 22, enemy.position.y - 28, int(44 * enemy.health / enemy.max_health), 4))

        # Draw Projectiles
        for p in self.projectiles:
            pygame.draw.circle(self.screen, (255, 110, 80), p.position, 5)

        # Draw Floating Texts
        for ft in self.floating_texts:
            self.text(ft.text, int(ft.position.x - 15), int(ft.position.y), ft.color, self.bold_font)

        # Sidebar HUD
        pygame.draw.rect(self.screen, (24, 32, 46), (ARENA.right, 0, PANEL, HEIGHT))
        self.text("SKILLGEN // ARENA", ARENA.right + 22, 16, (74, 211, 164), self.title)
        self.text(f"MODE {self.mode.upper()}  WAVE {self.wave:02d}  KILLS {self.kills:03d}", ARENA.right + 22, 50, (151, 166, 184))

        # Live Player Modifiers Panel
        self.text("LIVE AVATAR STATS (FEEDBACK)", ARENA.right + 22, 78, (255, 190, 84), self.bold_font)
        speed_val = self.stat_sheet.get('move_speed_percent', 0.0)
        dmg_val = self.stat_sheet.get('attack_damage_percent', 0.0)
        mit_val = self.stat_sheet.get('damage_mitigation_percent', 0.0)
        ls_val = self.stat_sheet.get('life_steal_on_hit_percent', 0.0)
        self.text(f"Speed: +{speed_val:4.1f}%   Attack Dmg: +{dmg_val:4.1f}%", ARENA.right + 22, 98, (190, 210, 230))
        self.text(f"Mitigate: +{mit_val:4.1f}%  Life Steal: +{ls_val:4.1f}%", ARENA.right + 22, 118, (190, 210, 230))

        # Procedural DAG List
        self.text("TOP SYNTHESIZED SKILLS", ARENA.right + 22, 146, (255, 190, 84), self.bold_font)
        top_skills = sorted(self.synthesis.skills.values(), key=lambda s: (s.level, s.granted_bonus), reverse=True)[:4]
        for index, skill in enumerate(top_skills):
            y = 168 + index * 26
            cap = " [CAP]" if skill.soft_cap_active else ""
            self.text(f"{skill.name[:18]:<18} L{skill.level} +{skill.granted_bonus * 100:4.1f}%{cap}", ARENA.right + 22, y)

        self.draw_curve(pygame.Rect(ARENA.right + 18, 280, PANEL - 36, 120))
        self.text(f"HP {self.health:05.1f}/{self.max_health}  STAM {self.stamina:05.1f}  COMBO {self.combo_gauge:05.1f}", ARENA.right + 22, 412, (170, 187, 204), self.bold_font)

        self.text("TELEMETRY STREAM", ARENA.right + 22, 438, (255, 190, 84), self.bold_font)
        for index, line in enumerate(self.events):
            self.text(line, ARENA.right + 22, 462 + index * 19, (170, 187, 204))

        self.text("WASD: Move  Space: Dash  LClick: Light  RClick: Heavy  Shift: Parry  Q: Heal", 18, HEIGHT - 38, (200, 215, 230))
        self.text("0 Manual  1 Speedster  2 Tank  3 Berserker  TAB Graph  R Reset  S Save", 18, HEIGHT - 18, (151, 166, 184))

        # Fullscreen Graph Inspector
        if self.graph_fullscreen:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((8, 13, 22, 245))
            self.screen.blit(overlay, (0, 0))
            self.text("PROCEDURAL DAG INSPECTOR", 60, 45, (74, 211, 164), self.title)
            nodes = sorted(self.synthesis.skills.values(), key=lambda s: (s.level, s.granted_bonus), reverse=True)[:16]
            for index, skill in enumerate(nodes):
                x = 60 + (index % 4) * 285
                y = 100 + (index // 4) * 90
                pygame.draw.rect(self.screen, (28, 43, 59), (x, y, 260, 68), border_radius=5)
                self.text(f"{skill.name[:22]}  LV{skill.level}", x + 10, y + 8, (255, 255, 255), self.bold_font)
                self.text(f"{skill.trigger} | {skill.stat_types[0] if skill.stat_types else 'stat'}", x + 10, y + 28, (160, 180, 200))
                self.text(f"Bonus: +{skill.granted_bonus * 100:.1f}% {'(SoftCap)' if skill.soft_cap_active else ''}", x + 10, y + 46, (255, 190, 84))
            self.text("TAB to close inspector", 60, HEIGHT - 42, (151, 166, 184))

        # Toast notifications
        now = time.monotonic()
        for index, (message, expiry) in enumerate(self.toasts):
            if expiry > now:
                box = pygame.Rect(30, 30 + index * 42, 340, 32)
                pygame.draw.rect(self.screen, (255, 190, 84), box, border_radius=4)
                self.text(message, 42, 38 + index * 42, (10, 16, 25), self.bold_font)

    def save(self) -> None:
        payload = {
            "mode": self.mode, "frames": self.frame, "wave": self.wave, "kills": self.kills, "actions": dict(self.counts),
            "skill_graph": self.synthesis.snapshot(), "skills": self.skills, "stat_sheet": self.synthesis.stat_sheet(),
            "telemetry": list(self.events), "saturation": [{"x": i / 20, "y": 1 - math.exp(-i / 7)} for i in range(61)]
        }
        for filename in ("demo_session_report.json", "demo_roguelite_report.json"):
            (ROOT / "artifacts" / filename).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self.toast("ROGUELITE REPORT SAVED")

    def run(self, max_frames: int | None = None) -> None:
        while self.running and (max_frames is None or self.frame < max_frames):
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_0:
                        self.mode = "Manual"
                    elif event.key == pygame.K_1:
                        self.mode = "Speedster"
                    elif event.key == pygame.K_2:
                        self.mode = "Tank"
                    elif event.key == pygame.K_3:
                        self.mode = "Berserker"
                    elif event.key == pygame.K_TAB:
                        self.graph_fullscreen = not self.graph_fullscreen
                    elif event.key == pygame.K_r:
                        self.reset()
                    elif event.key == pygame.K_s:
                        self.save()

            if self.mode == "Manual":
                self.manual_tick(pygame.key.get_pressed(), pygame.mouse.get_pos(), pygame.mouse.get_pressed())
            else:
                self.bot_tick()

            self.update_combat()
            self.update_skills()
            self.draw()
            pygame.display.flip()
            self.clock.tick(60)
            self.frame += 1

        self.save()
        self.native.close()
        pygame.quit()


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--frames", type=int, default=None); parser.add_argument("--headless", action="store_true"); args = parser.parse_args()
    if args.headless: os.environ["SDL_VIDEODRIVER"] = "dummy"
    ArenaGame(args.headless).run(args.frames)


if __name__ == "__main__": main()
