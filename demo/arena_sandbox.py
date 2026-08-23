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
    phase: float = 0.0


class ArenaGame:
    def __init__(self, headless: bool = False) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("SkillGen // Adaptive Arena") if not headless else None
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("consolas", 16)
        self.title = pygame.font.SysFont("consolas", 26, bold=True)
        self.running, self.mode, self.frame = True, "Manual", 0
        self.graph_fullscreen = False
        self.rng = random.Random(42)
        self.counts: Counter[int] = Counter()
        self.events: deque[str] = deque(maxlen=8)
        self.toasts: deque[tuple[str, float]] = deque(maxlen=3)
        self.skills: dict[str, float] = {}
        self.previous_levels: dict[str, int] = {}
        self.enemy = Enemy(pygame.Vector2(500, 300), "Melee")
        self.player = pygame.Vector2(360, 340)
        self.velocity = pygame.Vector2()
        self.last_action = "Idle"
        self.native = NativeTracker()
        self.baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8")) if BASELINE_PATH.exists() else {}
        self.synthesis = ProceduralSkillEngine(self.baseline)
        self.health, self.stamina, self.combo_gauge = 100.0, 100.0, 0.0
        self.wave, self.enemies = 1, [self.enemy]
        self.spawn_wave()

    def spawn_wave(self) -> None:
        kinds = ("Melee", "Ranged", "Heavy")
        self.enemies = [Enemy(pygame.Vector2(210 + index * 115, 160 + (index % 2) * 280), kinds[index % 3], 100.0 + index * 25)
                        for index in range(min(3 + self.wave, 6))]
        self.enemy = self.enemies[0]

    def reset(self) -> None:
        self.counts.clear(); self.events.clear(); self.skills.clear(); self.previous_levels.clear()
        self.toasts.clear(); self.player.update(360, 340); self.mode = "Manual"; self.frame = 0
        self.native.close(); self.native = NativeTracker(); self.toast("Telemetry reset")
        self.synthesis = ProceduralSkillEngine(self.baseline)
        self.health, self.stamina, self.combo_gauge = 100.0, 100.0, 0.0

    def toast(self, message: str) -> None:
        self.toasts.append((message, time.monotonic() + 2.5))

    def emit(self, action_id: int, label: str, value: float = 0.0) -> None:
        self.counts[action_id] += 1
        self.last_action = label
        self.native.push(action_id, 1, self.frame / 60.0)
        action_key = {1: "move", 2: "dash", 3: "light_attack", 10: "parry", 11: "parry", 12: "heavy_attack", 20: "light_attack", 21: "heal", 30: "heal"}.get(action_id, "move")
        generated = self.synthesis.process_action(action_key, self.frame / 60.0, low_hp=self.health < 25)
        for skill in generated:
            if skill.level > self.previous_levels.get(skill.skill_id, 0):
                self.toast(f"NEW SKILL: {skill.name}")
            self.previous_levels[skill.skill_id] = skill.level
        top = self.counts.most_common(1)[0][1]
        share = top / max(1, sum(self.counts.values()))
        combo = " + combo" if len(self.events) and label.split()[0] == self.events[-1].split()[0] else ""
        self.events.appendleft(f"{label:<14} -> z {share * 2 - 1:+.2f}{combo} -> +{value * 100:.1f}%")
        if share > .82 and sum(self.counts.values()) > 12:
            self.toast("DIMINISHING RETURNS ACTIVE")

    def bot_tick(self) -> None:
        actions = BOT_ACTIONS.get(self.mode)
        if not actions:
            return
        point = self.rng.random(); cumulative = 0.0
        for action_id, probability in actions:
            cumulative += probability
            if point < cumulative:
                self.emit(action_id, ACTION_NAMES[action_id], .1); break
        if self.mode == "Speedster": self.player.x += 2.0
        elif self.mode == "Tank": self.player.x += math.sin(self.frame / 50) * .2
        else: self.player.x += .2

    def manual_tick(self, keys: Any, mouse: tuple[int, int], buttons: tuple[bool, bool, bool]) -> None:
        direction = pygame.Vector2(keys[pygame.K_d] - keys[pygame.K_a], keys[pygame.K_s] - keys[pygame.K_w])
        if direction.length_squared():
            direction = direction.normalize(); self.velocity = direction * (4.5 if not keys[pygame.K_SPACE] else 10)
            self.player += self.velocity
            self.emit(2 if keys[pygame.K_SPACE] else 1, "Dash" if keys[pygame.K_SPACE] else "Move", .04)
        if buttons[0]: self.emit(3, "Light Strike", .08); self.enemy.health = max(0, self.enemy.health - .3)
        if buttons[2]: self.emit(12, "Heavy Strike", .12); self.enemy.health = max(0, self.enemy.health - .5)
        if keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]:
            if self.stamina > 0:
                self.stamina = max(0.0, self.stamina - 0.8); self.emit(11, "Parry", .03)
        if keys[pygame.K_q]: self.emit(30, "Healing Potion", .06)
        self.player.x = max(25, min(ARENA.right - 25, self.player.x)); self.player.y = max(25, min(HEIGHT - 25, self.player.y))

    def update_skills(self) -> None:
        self.skills = {skill.name: skill.granted_bonus for skill in self.synthesis.skills.values()}
        self.stamina = min(100.0, self.stamina + 0.25)
        self.combo_gauge = max(0.0, self.combo_gauge - 0.15)

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
        self.screen.blit(font or self.font, (x, y), area=None) if False else self.screen.blit((font or self.font).render(value, True, color), (x, y))

    def draw(self) -> None:
        self.screen.fill((10, 16, 25)); pygame.draw.rect(self.screen, (13, 21, 33), ARENA)
        for x in range(0, ARENA.width, 40): pygame.draw.line(self.screen, (18, 31, 46), (x, 0), (x, HEIGHT))
        for y in range(0, HEIGHT, 40): pygame.draw.line(self.screen, (18, 31, 46), (0, y), (ARENA.width, y))
        pygame.draw.circle(self.screen, (64, 217, 173), self.player, 16)
        for enemy in self.enemies:
            color = {"Melee": (218, 91, 103), "Ranged": (224, 154, 75), "Heavy": (166, 104, 190)}[enemy.kind]
            pygame.draw.circle(self.screen, color, enemy.position, 22 if enemy.kind == "Heavy" else 17)
            pygame.draw.rect(self.screen, color, (enemy.position.x - 25, enemy.position.y - 30, 50 * enemy.health / 100, 4))
        pygame.draw.rect(self.screen, (24, 32, 46), (ARENA.right, 0, PANEL, HEIGHT)); self.text("SKILLGEN // ARENA", ARENA.right + 22, 20, (74, 211, 164), self.title)
        self.text(f"MODE  {self.mode.upper()}    FPS {self.clock.get_fps():04.1f}", ARENA.right + 22, 60, (151, 166, 184))
        self.text("PROCEDURAL SKILL DAG", ARENA.right + 22, 100, (255, 190, 84))
        for index, (name, score) in enumerate(self.skills.items()):
            if index >= 4: break
            skill = next(item for item in self.synthesis.skills.values() if item.name == name)
            y = 126 + index * 32; cap = "  SOFT-CAP" if skill.soft_cap_active else ""
            self.text(f"{name[:18]:<18} L{skill.level} +{score * 100:4.1f}%{cap}", ARENA.right + 22, y)
        for parent, child in self.synthesis.edges:
            parent_name = self.synthesis.skills[parent].name
            child_name = self.synthesis.skills[child].name
            parent_index = next((i for i, item in enumerate(self.skills) if item == parent_name), -1)
            child_index = next((i for i, item in enumerate(self.skills) if item == child_name), -1)
            if parent_index >= 0 and child_index >= 0:
                pygame.draw.line(self.screen, (64, 90, 112), (ARENA.right + 18, 140 + parent_index * 32),
                                 (ARENA.right + 18, 140 + child_index * 32), 1)
        self.draw_curve(pygame.Rect(ARENA.right + 18, 270, PANEL - 36, 130))
        self.text(f"RES  HP {self.health:05.1f}  EN {self.stamina:05.1f}  COMBO {self.combo_gauge:05.1f}", ARENA.right + 22, 410, (170, 187, 204))
        self.text("TELEMETRY / DIAGNOSTICS", ARENA.right + 22, 440, (255, 190, 84))
        for index, line in enumerate(self.events): self.text(line, ARENA.right + 22, 467 + index * 20, (170, 187, 204))
        self.text("0 Manual  1 Speedster  2 Tank  3 Berserker  TAB Graph  R Reset  S Save", 18, HEIGHT - 28, (151, 166, 184))
        if self.graph_fullscreen:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA); overlay.fill((8, 13, 22, 245)); self.screen.blit(overlay, (0, 0))
            self.text("PROCEDURAL DAG INSPECTOR", 60, 45, (74, 211, 164), self.title)
            nodes = list(self.synthesis.skills.values())
            for index, skill in enumerate(nodes):
                x = 80 + (index % 4) * 285; y = 110 + (index // 4) * 90
                pygame.draw.rect(self.screen, (28, 43, 59), (x, y, 240, 58), border_radius=5)
                self.text(f"{skill.name[:24]}  L{skill.level}", x + 10, y + 9)
                self.text(f"{skill.trigger}  +{skill.granted_bonus * 100:.1f}%", x + 10, y + 32, (255, 190, 84))
            self.text("TAB close inspector", 60, HEIGHT - 42, (151, 166, 184))
        now = time.monotonic()
        for index, (message, expiry) in enumerate(self.toasts):
            if expiry > now:
                box = pygame.Rect(30, 30 + index * 42, 300, 32); pygame.draw.rect(self.screen, (255, 190, 84), box, border_radius=4); self.text(message, 42, 38 + index * 42, (10, 16, 25))

    def save(self) -> None:
        payload = {"mode": self.mode, "frames": self.frame, "wave": self.wave, "actions": dict(self.counts),
                   "skill_graph": self.synthesis.snapshot(), "skills": self.skills, "stat_sheet": self.synthesis.stat_sheet(),
                   "telemetry": list(self.events), "saturation": [{"x": i / 20, "y": 1 - math.exp(-i / 7)} for i in range(61)]}
        for filename in ("demo_session_report.json", "demo_roguelite_report.json"):
            (ROOT / "artifacts" / filename).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self.toast("ROGUELITE REPORT SAVED")

    def run(self, max_frames: int | None = None) -> None:
        while self.running and (max_frames is None or self.frame < max_frames):
            for event in pygame.event.get():
                if event.type == pygame.QUIT: self.running = False
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_0: self.mode = "Manual"
                    elif event.key == pygame.K_1: self.mode = "Speedster"
                    elif event.key == pygame.K_2: self.mode = "Tank"
                    elif event.key == pygame.K_3: self.mode = "Berserker"
                    elif event.key == pygame.K_TAB: self.graph_fullscreen = not self.graph_fullscreen
                    elif event.key == pygame.K_r: self.reset()
                    elif event.key == pygame.K_s: self.save()
            if self.mode == "Manual": self.manual_tick(pygame.key.get_pressed(), pygame.mouse.get_pos(), pygame.mouse.get_pressed())
            else: self.bot_tick()
            self.update_skills(); self.draw(); pygame.display.flip(); self.clock.tick(60); self.frame += 1
        self.save(); self.native.close(); pygame.quit()


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--frames", type=int, default=None); parser.add_argument("--headless", action="store_true"); args = parser.parse_args()
    if args.headless: os.environ["SDL_VIDEODRIVER"] = "dummy"
    ArenaGame(args.headless).run(args.frames)


if __name__ == "__main__": main()
