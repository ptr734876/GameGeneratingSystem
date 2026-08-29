import { GenerativeSkillEngine, calculateDotaCrit } from './generator.js?v=20260829_21';
import { SoundEngine } from './audio.js?v=20260829_21';

function getOrCreateGuestUsername() {
  let stored = localStorage.getItem('skillgen_username');
  if (!stored || stored === 'ptr734876' || stored === 'null' || stored === 'undefined') {
    const prefixes = ['Operator', 'Specter', 'Vanguard', 'Nova', 'CyberPilot', 'Apex', 'Phantom', 'Ronin', 'Vector', 'Echo'];
    const num = Math.floor(100 + Math.random() * 900);
    stored = `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${num}`;
    localStorage.setItem('skillgen_username', stored);
  }
  return stored;
}

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const effectiveDps = (baseDamage, damageMult, attackSpeed, critChance, critMult) => (baseDamage * damageMult) * attackSpeed * (1 + critChance * (critMult - 1));
export const mitigatedDamage = (rawDamage, armor) => rawDamage * (100 / (100 + Math.max(0, armor)));

const generator = new GenerativeSkillEngine();
const audio = new SoundEngine();

const STYLE_RANKS = [
  { rank: 'D', min: 0, mult: 1.0, class: 'rank-D' },
  { rank: 'C', min: 16, mult: 1.2, class: 'rank-C' },
  { rank: 'B', min: 36, mult: 1.5, class: 'rank-B' },
  { rank: 'A', min: 61, mult: 2.0, class: 'rank-A' },
  { rank: 'S', min: 91, mult: 2.5, class: 'rank-S' },
  { rank: 'SS', min: 131, mult: 3.2, class: 'rank-SS' },
  { rank: 'SSS', min: 181, mult: 4.0, class: 'rank-SSS' }
];

const state = {
  mode: 'playing',
  gameMode: localStorage.getItem('skillgen_mode') || 'hardcore',
  leaderboardTab: localStorage.getItem('skillgen_mode') || 'hardcore',
  sessionId: 'ses_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
  wave: 1,
  score: 0.0,
  kills: 0,
  damage: 0,
  bestHit: 0,
  elapsed: 0,
  dps: 0,
  lastDamage: 0,
  shake: 0,
  fireCooldown: 0,
  dashCooldown: 0,
  dashTime: 0,
  moveTimer: 0,
  stillTimer: 0,
  telemetryTimer: 0,
  flawlessTimer: 0,
  totalInputs: 0,
  deathCause: 'combat',
  recentKills: [],
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },
  charging: false,
  chargeStartTime: 0,
  chargeMult: 1.0,
  stylePoints: 0,
  styleRank: 'D',
  styleMultiplier: 1.0,
  actionBuffer: [],
  enemies: [],
  projectiles: [],
  particles: [],
  texts: [],
  zones: [],
  obstacles: [],
  logs: [],
  actions: [],
  actionCounts: {},
  sequenceCounts: {},
  sequenceMatrix: {},
  combatTimeline: [],
  lastAction: null,
  generatedSkills: [],
  bossesSpawned: 0,
  username: getOrCreateGuestUsername()
};

const player = {
  x: 0, y: 0, vx: 0, vy: 0, angle: 0, r: 15,
  maxHp: 100, hp: 100, armor: 6.0, damage: 22, damageMult: 1.0,
  attackSpeed: 1.0, crit: 0.05, critMult: 2.0,
  invuln: 0, speedBoost: 0
};

const rand = (min, max) => min + Math.random() * (max - min);

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width || canvas.clientWidth || 900);
  const h = Math.round(rect.height || canvas.clientHeight || 800);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!player.x || isNaN(player.x)) {
    player.x = w / 2;
    player.y = h / 2;
  }
}

function arena() {
  return {
    w: canvas.clientWidth || 900,
    h: canvas.clientHeight || 800
  };
}

function log(message) {
  state.logs.unshift({ message, time: state.elapsed });
  state.logs = state.logs.slice(0, 4);
  if (ui.combatLog) {
    ui.combatLog.innerHTML = state.logs.map(item => `<div class="log-line"><b>${formatTime(item.time)}</b> ${item.message}</div>`).join('');
  }
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function addStyle(points) {
  state.stylePoints = Math.min(250, state.stylePoints + points);
  updateStyleMeter();
}

function updateStyleMeter() {
  let active = STYLE_RANKS[0];
  for (const sr of STYLE_RANKS) {
    if (state.stylePoints >= sr.min) active = sr;
  }
  state.styleRank = active.rank;
  state.styleMultiplier = active.mult;

  if (ui.styleMeterBadge) {
    ui.styleMeterBadge.className = `style-meter-badge ${active.class}`;
  }
  if (ui.styleRankText) ui.styleRankText.textContent = `STYLE: ${active.rank}`;
  if (ui.styleMultText) ui.styleMultText.textContent = `x${active.mult.toFixed(1)}`;
}

function recordAction(action, customMeta = {}) {
  state.actions.push(action);
  if (state.actions.length > 80) state.actions.shift();
  state.actionCounts[action] = (state.actionCounts[action] || 0) + 1;

  if (action === 'damage_taken') {
    state.flawlessTimer = 0;
    state.stylePoints = Math.max(0, state.stylePoints - 35);
    updateStyleMeter();
  }

  const currentMaxHp = clamp(player.maxHp + generatedValue('maxHp'), 50, 300);
  const context = {
    isLowHp: player.hp < (currentMaxHp * 0.40),
    isFlawless: state.flawlessTimer >= 20.0,
    isBossActive: state.enemies.some(e => e.type === 'boss' && !e.dead),
    ...customMeta
  };

  const now = state.elapsed;
  state.actionBuffer.push({ action, time: now });

  const comboWindow = 1.8;
  state.actionBuffer = state.actionBuffer.filter(item => (now - item.time) <= comboWindow);

  generator.record(action, context);

  const bufLen = state.actionBuffer.length;
  if (bufLen >= 2) {
    const seq2 = `${state.actionBuffer[bufLen - 2].action}→${action}`;
    state.sequenceCounts[seq2] = (state.sequenceCounts[seq2] || 0) + 1;
    generator.record(seq2, context);
  }
  if (bufLen >= 3) {
    const seq3 = `${state.actionBuffer[bufLen - 3].action}→${state.actionBuffer[bufLen - 2].action}→${action}`;
    generator.record(seq3, context);
  }
  if (bufLen >= 4) {
    const seq4 = `${state.actionBuffer[bufLen - 4].action}→${state.actionBuffer[bufLen - 3].action}→${state.actionBuffer[bufLen - 2].action}→${action}`;
    generator.record(seq4, context);
  }

  state.lastAction = action;
  state.generatedSkills = generator.snapshot();
  updateGenerativeHud();
}

function generatedModifier(stat) { return generator.modifier(stat) / 100; }
function generatedValue(stat) { return generator.modifier(stat); }

function toggleGameMode() {
  state.gameMode = (state.gameMode === 'hardcore') ? 'fast' : 'hardcore';
  localStorage.setItem('skillgen_mode', state.gameMode);
  state.leaderboardTab = state.gameMode;
  updateModeUI();
  reset();
}

function updateModeUI() {
  const isFast = state.gameMode === 'fast';
  if (ui.modeIcon) ui.modeIcon.textContent = isFast ? '⚡' : '🛡️';
  if (ui.modeLabel) ui.modeLabel.textContent = isFast ? 'FAST MODE' : 'HARDCORE';
  if (ui.modeToggleBtn) ui.modeToggleBtn.classList.toggle('fast', isFast);
  generator.setMode(state.gameMode);
  audio.setFastMode(isFast);
  setLeaderboardTab(state.leaderboardTab || state.gameMode);
}

function setLeaderboardTab(mode) {
  state.leaderboardTab = mode;
  if (ui.lbTabHardcore) ui.lbTabHardcore.classList.toggle('active', mode === 'hardcore');
  if (ui.lbTabFast) ui.lbTabFast.classList.toggle('active', mode === 'fast');
  fetchLeaderboard(mode);
}

function reset() {
  state.sessionId = 'ses_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now();
  generator.reset();
  generator.setMode(state.gameMode);
  audio.setFastMode(state.gameMode === 'fast');

  Object.assign(state, {
    mode: 'playing', wave: 1, score: 0.0, kills: 0, damage: 0, bestHit: 0,
    elapsed: 0, dps: 0, lastDamage: 0, shake: 0,
    fireCooldown: 0, dashCooldown: 0, dashTime: 0, moveTimer: 0, stillTimer: 0,
    telemetryTimer: 0, flawlessTimer: 0, totalInputs: 0, deathCause: 'combat',
    charging: false, chargeStartTime: 0, chargeMult: 1.0,
    stylePoints: 0, styleRank: 'D', styleMultiplier: 1.0,
    actionBuffer: [], recentKills: [], enemies: [], projectiles: [], particles: [], texts: [],
    zones: [], obstacles: [], logs: [], actions: [], actionCounts: {},
    sequenceCounts: {}, sequenceMatrix: {}, combatTimeline: [], lastAction: null,
    generatedSkills: [], bossesSpawned: 0
  });

  Object.assign(player, {
    x: arena().w / 2, y: arena().h / 2, vx: 0, vy: 0, angle: 0,
    maxHp: 100, hp: 100, armor: 6.0, damage: 22, damageMult: 1.0,
    attackSpeed: 1.0, crit: 0.05, critMult: 2.0, invuln: 0, speedBoost: 0
  });

  hideModal();
  if (ui.pauseScreen) ui.pauseScreen.classList.add('hidden');
  createArena();
  spawnWave();
  log(`Run initiated [${state.gameMode.toUpperCase()}]. Dataset telemetry active.`);
  updateHud();
  fetchLeaderboard(state.leaderboardTab);
  updateModeUI();
  updateStyleMeter();
}

function createArena() {
  const { w, h } = arena();
  state.obstacles = [];
  for (let i = 0; i < 6; i++) {
    let x = rand(100, w - 100), y = rand(100, h - 100);
    if (Math.hypot(x - w / 2, y - h / 2) > 140) {
      state.obstacles.push({ x, y, r: rand(24, 36), kind: i === 0 ? 'portal' : 'column' });
    }
  }
}

function spawnWave() {
  const isFast = (state.gameMode === 'fast');
  const isBoss = isFast ? (state.wave % 3 === 0) : (state.wave % 5 === 0);
  state.enemies = [];

  const difficulty = isFast
    ? (1 + (state.wave - 1) * 0.48 + state.bossesSpawned * 0.70)
    : (1 + (state.wave - 1) * 0.16 + state.bossesSpawned * 0.35);

  const count = isBoss ? 1 : (isFast ? Math.min(130, 14 + Math.floor(state.wave * 7)) : Math.min(120, 10 + Math.floor(state.wave * 4.5)));
  const scoreMult = isFast ? 8.0 : 1.0;

  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const radius = Math.max(arena().w, arena().h) * 0.6 + rand(60, 160);
    const isElite = (!isBoss && Math.random() < (isFast ? 0.25 : 0.15));

    let type = 'swarmer';
    let base = {};

    if (isBoss) {
      type = 'boss';
      state.bossesSpawned++;
      base = {
        hp: (isFast ? 2400 : 1800) * difficulty,
        speed: (isFast ? 55 : 42) * (1 + state.wave * 0.02),
        r: 38, color: '#eb4d4b', damage: 32 * difficulty,
        attackSpeed: isFast ? 1.8 : 1.4,
        baseScore: 1.50 * scoreMult, hitAction: 'boss_hit', phaseTime: 0, phaseState: 0
      };
    } else {
      const roll = i % 5;
      if (roll === 0 || roll === 1) {
        type = 'swarmer';
        base = {
          hp: 28 * difficulty, speed: (isFast ? 125 : 95) * (1 + state.wave * 0.02), r: 11,
          color: '#e67565', damage: 8 * difficulty, attackSpeed: 1.2,
          baseScore: 0.01 * scoreMult, hitAction: 'swarmer_hit'
        };
      } else if (roll === 2) {
        type = 'stalker';
        base = {
          hp: 45 * difficulty, speed: (isFast ? 155 : 125) * (1 + state.wave * 0.02), r: 12,
          color: '#f0932b', damage: 14 * difficulty, attackSpeed: 1.0,
          baseScore: 0.03 * scoreMult, hitAction: 'stalker_hit', sprintCooldown: rand(1.2, 2.5), isSprinting: false
        };
      } else if (roll === 3) {
        type = 'ranger';
        base = {
          hp: 55 * difficulty, speed: 40 * (1 + state.wave * 0.015), r: 13,
          color: '#f6e58d', damage: 12 * difficulty, attackSpeed: isFast ? 0.9 : 0.65,
          baseScore: 0.05 * scoreMult, hitAction: 'ranger_hit'
        };
      } else {
        type = (i % 2 === 0) ? 'tank' : 'mortar';
        if (type === 'tank') {
          base = {
            hp: 220 * difficulty, speed: (isFast ? 35 : 25) * (1 + state.wave * 0.01), r: 21,
            color: '#be2edd', damage: 24 * difficulty, attackSpeed: 0.8,
            baseScore: 0.10 * scoreMult, hitAction: 'tank_hit'
          };
        } else {
          base = {
            hp: 90 * difficulty, speed: 28 * (1 + state.wave * 0.01), r: 16,
            color: '#686de0', damage: 28 * difficulty, attackSpeed: isFast ? 0.55 : 0.35,
            baseScore: 0.15 * scoreMult, hitAction: 'mortar_hit'
          };
        }
      }
    }

    if (isElite) {
      base.hp *= 2.2;
      base.maxHp = base.hp;
      base.damage *= 1.4;
      base.r = Math.round(base.r * 1.3);
      base.isElite = true;
    } else {
      base.maxHp = base.hp;
      base.isElite = false;
    }

    state.enemies.push({
      x: player.x + Math.cos(angle) * radius,
      y: player.y + Math.sin(angle) * radius,
      ...base,
      type,
      phase: rand(0, TAU),
      cooldown: rand(0.3, 1.6) / (base.attackSpeed || 1),
      offscreenTimer: 0,
      hitFlash: 0,
      freeze: 0,
      burn: 0,
      dead: false
    });
  }

  if (ui.bossBar) ui.bossBar.classList.toggle('active', isBoss);
  audio.setBossMode(isBoss);
  if (isBoss) audio.playBossSpawn();
  log(isBoss ? `WARDEN // BOSS ENCOUNTER WAVE ${state.wave}` : `Wave ${state.wave} deployed // ${state.enemies.length} hostiles`);
}

function inputVector() {
  const x = (state.keys.has('ArrowRight') || state.keys.has('KeyD') ? 1 : 0) - (state.keys.has('ArrowLeft') || state.keys.has('KeyA') ? 1 : 0);
  const y = (state.keys.has('ArrowDown') || state.keys.has('KeyS') ? 1 : 0) - (state.keys.has('ArrowUp') || state.keys.has('KeyW') ? 1 : 0);
  const length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : null;
}

function lineHitsObstacle(start, end, obstacle) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return false;
  const projection = clamp(((obstacle.x - start.x) * dx + (obstacle.y - start.y) * dy) / lengthSquared, 0, 1);
  const closest = { x: start.x + dx * projection, y: start.y + dy * projection };
  return distance(closest, obstacle) < obstacle.r + 4;
}

function getAutoTarget() {
  const { w, h } = arena();
  const range = clamp(620 * (1 + generatedModifier('targetRange')), 350, 1100);
  return state.enemies
    .filter(enemy => enemy.hp > 0 && !enemy.dead)
    .filter(enemy => enemy.x >= 0 && enemy.x <= w && enemy.y >= 0 && enemy.y <= h)
    .map(enemy => ({ enemy, distance: distance(player, enemy) }))
    .filter(c => c.distance < range && !state.obstacles.some(o => lineHitsObstacle(player, c.enemy, o)))
    .sort((a, b) => a.distance - b.distance)[0]?.enemy || null;
}

function scrollWorld(dx, dy) {
  for (const collection of [state.enemies, state.projectiles, state.obstacles, state.zones]) {
    for (const item of collection) { item.x -= dx; item.y -= dy; }
  }
  state.obstacles = state.obstacles.filter(o => o.x > -180 && o.x < arena().w + 180 && o.y > -180 && o.y < arena().h + 180);
  while (state.obstacles.length < 6) {
    const edge = Math.floor(rand(0, 4));
    const point = edge === 0 ? { x: rand(-80, arena().w + 80), y: -120 } :
                  edge === 1 ? { x: arena().w + 120, y: rand(-80, arena().h + 80) } :
                  edge === 2 ? { x: rand(-80, arena().w + 80), y: arena().h + 120 } :
                  { x: -120, y: rand(-80, arena().h + 80) };
    state.obstacles.push({ x: point.x, y: point.y, r: rand(24, 36), kind: state.obstacles.length % 4 === 0 ? 'portal' : 'column' });
  }
}

function movePlayer(dt) {
  const direction = inputVector();
  let moveSpeed = clamp(260 * (1 + generatedModifier('moveSpeed')), 180, 350);

  // Slow down during infinite mouse charge
  if (state.charging) {
    const holdSec = (performance.now() - state.chargeStartTime) / 1000;
    state.chargeMult = 1.0 + holdSec * 1.5;
    moveSpeed /= state.chargeMult;
  }

  if (direction) {
    state.stillTimer = 0;
    state.moveTimer = (state.moveTimer || 0) + dt;
    if (state.moveTimer >= 0.3) {
      recordAction('move');
      state.moveTimer = 0;
    }
    player.vx += (direction.x * moveSpeed - player.vx) * Math.min(1, dt * 10);
    player.vy += (direction.y * moveSpeed - player.vy) * Math.min(1, dt * 10);
  } else {
    player.vx *= Math.pow(0.001, dt);
    player.vy *= Math.pow(0.001, dt);
    state.stillTimer = (state.stillTimer || 0) + dt;
    if (state.stillTimer >= 1.0) {
      recordAction('standstill');
      state.stillTimer = 0;
    }
  }

  if (state.dashTime > 0) { player.vx *= 1.02; player.vy *= 1.02; }

  // Player-Obstacle collision
  const targetX = player.x + player.vx * dt;
  const targetY = player.y + player.vy * dt;
  for (const obstacle of state.obstacles) {
    const od = Math.hypot(targetX - obstacle.x, targetY - obstacle.y);
    const minObs = obstacle.r + player.r;
    if (od < minObs) {
      const onx = (targetX - obstacle.x) / (od || 1);
      const ony = (targetY - obstacle.y) / (od || 1);
      player.vx = onx * 50;
      player.vy = ony * 50;
    }
  }

  scrollWorld(player.vx * dt, player.vy * dt);
  player.x = arena().w / 2;
  player.y = arena().h / 2;
}

function dash() {
  const cooldown = clamp(1.4 * (1 - generatedModifier('dashCooldown')), 0.5, 3.0);
  if (state.mode !== 'playing' || state.dashCooldown > 0) return;

  const direction = inputVector() || (Math.hypot(player.vx, player.vy) > 20
    ? { x: player.vx / Math.hypot(player.vx, player.vy), y: player.vy / Math.hypot(player.vx, player.vy) }
    : { x: Math.cos(Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x)), y: Math.sin(Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x)) });

  const dashDistance = clamp(720 * (1 + generatedModifier('dashDistance')), 400, 1300);
  recordAction('dash');
  player.vx = direction.x * dashDistance;
  player.vy = direction.y * dashDistance;
  player.invuln = 0.40;
  state.dashTime = 0.28;
  state.dashCooldown = cooldown;
  state.shake = 5;
  audio.playDash();

  // 50% Chance Bullet Reflection on close dash
  const effectiveCrit = generator.critRate(player.crit);
  const damageBonus = generatedModifier('damage');
  const actualDamage = clamp(player.damage * player.damageMult * (1 + damageBonus), 6, 250);

  let reflectedAny = false;
  for (const p of state.projectiles) {
    if (p.damage < 0 && distance(p, player) <= player.r + 40) {
      if (Math.random() < 0.50) {
        const isCrit = Math.random() < effectiveCrit;
        p.damage = Math.abs(p.damage) * 1.5 * (isCrit ? player.critMult : 1.0);
        p.vx = -p.vx * 1.4;
        p.vy = -p.vy * 1.4;
        p.life = 2.5;
        p.reflected = true;
        reflectedAny = true;
        state.particles.push({ x: p.x, y: p.y, r: 6, life: 0.3, color: '#f4bd62' });
        state.texts.push({ x: p.x, y: p.y - 20, text: 'PARRY!', color: '#86e0b1', life: 0.8, vy: -20 });
      }
    }
  }

  if (reflectedAny) {
    recordAction('parry');
    addStyle(35);
    audio.playCrit();
    log('Parry // Bullets deflected!');
  } else {
    log('Dash // 100% i-frames engaged');
  }
}

function fireAuto() {
  if (state.fireCooldown > 0 || state.mode !== 'playing') return;
  const target = getAutoTarget();
  if (!target) return;

  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  const attackBonus = generatedModifier('attackSpeed');
  const damageBonus = generatedModifier('damage');

  const effectiveCrit = generator.critRate(player.crit);
  const actualDamage = clamp(player.damage * player.damageMult * (1 + damageBonus), 6, 250);

  state.projectiles.push({
    x: player.x + Math.cos(angle) * 18,
    y: player.y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * 570,
    vy: Math.sin(angle) * 570,
    life: 1.4,
    damage: actualDamage,
    critChance: effectiveCrit,
    r: 3,
    pierce: 1,
    target
  });

  const actualAttackSpeed = clamp(player.attackSpeed * (1 + attackBonus), 0.5, 8.0);
  state.fireCooldown = 1.0 / actualAttackSpeed;
  audio.playShot();
}

function releaseChargedShot() {
  if (!state.charging || state.mode !== 'playing') return;
  const holdSec = (performance.now() - state.chargeStartTime) / 1000;
  const mult = 1.0 + holdSec * 1.5;

  const angle = Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x);
  const damageBonus = generatedModifier('damage');
  const effectiveCrit = generator.critRate(player.crit);
  const baseDmg = clamp(player.damage * player.damageMult * (1 + damageBonus), 6, 250);
  const blastDmg = baseDmg * mult;

  const radius = clamp(4 * Math.sqrt(mult), 4, 22);
  const pierceCount = Math.floor(1 + holdSec * 1.5);

  state.projectiles.push({
    x: player.x + Math.cos(angle) * 20,
    y: player.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * clamp(570 + holdSec * 30, 570, 850),
    vy: Math.sin(angle) * clamp(570 + holdSec * 30, 570, 850),
    life: 1.8,
    damage: blastDmg,
    critChance: effectiveCrit,
    r: radius,
    pierce: pierceCount,
    isCharged: holdSec >= 0.8
  });

  state.shake = Math.min(12, 3 + mult * 0.8);
  state.charging = false;
  state.chargeMult = 1.0;

  if (holdSec >= 0.8) {
    recordAction('charged_shot');
    addStyle(25);
    audio.playCrit();
    state.texts.push({ x: player.x, y: player.y - 30, text: `CHARGE x${mult.toFixed(1)}!`, color: '#f4bd62', life: 1, vy: -20 });
  } else {
    recordAction('manual_shot');
    audio.playShot();
  }
}

function hitEnemy(enemy, raw, critical = false) {
  if (enemy.dead) return;
  const critMult = critical ? player.critMult : 1.0;
  const damage = mitigatedDamage(raw * critMult, 0);
  enemy.hp -= damage;
  enemy.hitFlash = 0.1;
  state.damage += damage;
  state.lastDamage = damage;
  state.bestHit = Math.max(state.bestHit, damage);

  const hitDist = distance(player, enemy);
  if (hitDist < 110) {
    recordAction('point_blank_hit');
    addStyle(15);
  } else if (hitDist > 420) {
    recordAction('sniper_hit');
    addStyle(15);
  }

  if (enemy.hitAction) recordAction(enemy.hitAction);
  if (critical) {
    recordAction('crit');
    addStyle(12);
    audio.playCrit();
  } else {
    audio.playHit();
  }

  state.shake = Math.max(state.shake, critical ? 6 : 2);
  state.texts.push({
    x: enemy.x, y: enemy.y - 20,
    text: `${Math.round(damage)}${critical ? ' CRIT' : ''}`,
    color: critical ? '#f4bd62' : '#edf6ea',
    life: 1, vy: -28
  });

  if (enemy.hp <= 0 && !enemy.dead) {
    killEnemy(enemy);
  }
}

function killEnemy(enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.hp = 0;
  state.kills++;
  recordAction('kill');

  const isFast = (state.gameMode === 'fast');
  const waveScale = 1 + (state.wave - 1) * (isFast ? 0.40 : 0.15);
  const earned = (enemy.baseScore || 0.01) * (enemy.isElite ? 3.0 : 1.0) * waveScale * state.styleMultiplier;
  state.score += earned;

  state.texts.push({
    x: enemy.x, y: enemy.y - 30,
    text: `+${earned.toFixed(2)} PTS`,
    color: '#f4bd62', life: 1.2, vy: -22
  });
  audio.playKill();
  audio.playScore();

  const now = state.elapsed;
  state.recentKills = state.recentKills.filter(t => now - t <= 1.2);
  state.recentKills.push(now);
  if (state.recentKills.length >= 3) {
    recordAction('multikill');
    addStyle(25);
    state.recentKills = [];
  }
}

function updateCombat(dt) {
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.dashTime = Math.max(0, state.dashTime - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.speedBoost = Math.max(0, player.speedBoost - dt);
  state.flawlessTimer = (state.flawlessTimer || 0) + dt;

  // Style Meter Decay
  state.stylePoints = Math.max(0, state.stylePoints - dt * 5.0);
  updateStyleMeter();

  const isInvulnerable = player.invuln > 0 || state.dashTime > 0;

  // Periodic Telemetry
  state.telemetryTimer += dt;
  if (state.telemetryTimer >= 5.0) {
    state.telemetryTimer = 0;
    const apm = state.elapsed > 0 ? (state.totalInputs / (state.elapsed / 60)) : 0;
    state.combatTimeline.push({
      time: Math.round(state.elapsed * 10) / 10,
      hp: Math.round(player.hp),
      score: Math.round(state.score * 100) / 100,
      dps: Math.round(state.dps),
      kills: state.kills,
      wave: state.wave,
      apm: Math.round(apm),
      styleRank: state.styleRank
    });
    if (state.combatTimeline.length > 50) state.combatTimeline.shift();
  }

  // Auto fire
  if (!state.charging && getAutoTarget()) fireAuto();

  // Projectile simulation & obstacle collision
  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;

    for (const obstacle of state.obstacles) {
      if (distance(projectile, obstacle) < obstacle.r + 4) {
        projectile.life = 0;
        state.particles.push({ x: projectile.x, y: projectile.y, r: 4, life: 0.2, color: '#72c8e3' });
        break;
      }
    }
    if (projectile.life <= 0) continue;

    // Player or Reflected bullets hit enemies
    if (projectile.damage > 0) {
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && !enemy.dead && distance(projectile, enemy) < enemy.r + (projectile.r || 4) + 2) {
          const critical = Math.random() < (projectile.critChance || player.crit);
          hitEnemy(enemy, projectile.damage, critical);
          projectile.pierce = (projectile.pierce || 1) - 1;
          if (projectile.pierce <= 0) projectile.life = 0;
          break;
        }
      }
    }
  }

  // Enemy projectiles hit player
  const effectiveArmor = clamp(player.armor + generatedValue('armor'), 0, 60);
  for (const projectile of state.projectiles) {
    if (projectile.damage < 0 && projectile.life > 0) {
      const d = distance(projectile, player);
      if (d < player.r + 32 && d > player.r + 6 && !isInvulnerable) {
        if (!projectile.closeCallRecorded) {
          recordAction('close_call');
          addStyle(18);
          projectile.closeCallRecorded = true;
        }
      }
      if (d < player.r + 6) {
        projectile.life = 0;
        if (!isInvulnerable) {
          recordAction('damage_taken');
          player.hp -= mitigatedDamage(-projectile.damage, effectiveArmor);
          state.shake = 4;
          audio.playHurt();
          if (player.hp <= 0) state.deathCause = 'ranger_bullet';
        }
      }
    }
  }
  state.projectiles = state.projectiles.filter(item => item.life > 0);

  // Ground Zones
  for (const zone of state.zones) {
    zone.life -= dt;
    if (zone.isWarning) {
      if (zone.life <= 0) {
        state.shake = 6;
        if (distance(player, zone) < zone.r && !isInvulnerable) {
          recordAction('damage_taken');
          player.hp -= mitigatedDamage(zone.damage, effectiveArmor);
          state.texts.push({ x: player.x, y: player.y - 20, text: `-${Math.ceil(zone.damage)}`, color: '#f06d62', life: 0.8, vy: -10 });
          audio.playHurt();
          if (player.hp <= 0) state.deathCause = 'mortar_blast';
        }
        state.zones.push({ x: zone.x, y: zone.y, r: zone.r, damage: zone.damage * 0.4, life: 1.5, isWarning: false });
      }
    } else {
      if (distance(player, zone) < zone.r && !isInvulnerable) {
        player.hp -= mitigatedDamage(zone.damage * dt, effectiveArmor);
        if (player.hp <= 0) state.deathCause = 'acid_zone';
      }
    }
  }
  state.zones = state.zones.filter(zone => zone.life > 0);

  const viewRadius = Math.max(arena().w, arena().h) * 0.65;

  // Enemy movement, obstacle navigation & steering
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || enemy.dead) continue;
    let dx = player.x - enemy.x, dy = player.y - enemy.y;
    let d = Math.hypot(dx, dy) || 1;

    if (d > viewRadius * 1.6) {
      enemy.offscreenTimer = (enemy.offscreenTimer || 0) + dt;
      if (enemy.offscreenTimer >= 1.5) {
        const flankAngle = rand(0, TAU);
        const flankDist = viewRadius * 1.25 + rand(40, 120);
        enemy.x = player.x + Math.cos(flankAngle) * flankDist;
        enemy.y = player.y + Math.sin(flankAngle) * flankDist;
        enemy.offscreenTimer = 0;
      }
    } else {
      enemy.offscreenTimer = 0;
    }

    enemy.freeze = Math.max(0, enemy.freeze - dt);
    enemy.burn = Math.max(0, enemy.burn - dt);
    if (enemy.burn > 0 && Math.random() < dt * 2) hitEnemy(enemy, 4, false);

    // Obstacle avoidance & tangential steering
    let moveDirX = dx / d, moveDirY = dy / d;
    for (const obstacle of state.obstacles) {
      const od = distance(enemy, obstacle);
      const avoidDist = obstacle.r + enemy.r + 20;
      if (od < avoidDist && od > 0.001) {
        const pushX = (enemy.x - obstacle.x) / od;
        const pushY = (enemy.y - obstacle.y) / od;
        const tangentX = -pushY;
        const tangentY = pushX;
        const dot = moveDirX * tangentX + moveDirY * tangentY;
        const sign = dot >= 0 ? 1 : -1;
        moveDirX = pushX * 0.6 + tangentX * sign * 0.8;
        moveDirY = pushY * 0.6 + tangentY * sign * 0.8;
        const mlen = Math.hypot(moveDirX, moveDirY) || 1;
        moveDirX /= mlen;
        moveDirY /= mlen;
      }
    }

    if (enemy.type === 'swarmer') {
      enemy.x += moveDirX * enemy.speed * (enemy.freeze ? 0.4 : 1) * dt;
      enemy.y += moveDirY * enemy.speed * (enemy.freeze ? 0.4 : 1) * dt;
    } else if (enemy.type === 'stalker') {
      enemy.sprintCooldown -= dt;
      if (enemy.sprintCooldown <= 0) {
        enemy.isSprinting = !enemy.isSprinting;
        enemy.sprintCooldown = enemy.isSprinting ? 0.8 : rand(2.0, 3.5);
      }
      const spd = enemy.isSprinting ? enemy.speed * 2.2 : enemy.speed;
      enemy.x += moveDirX * spd * (enemy.freeze ? 0.4 : 1) * dt;
      enemy.y += moveDirY * spd * (enemy.freeze ? 0.4 : 1) * dt;
    } else if (enemy.type === 'ranger') {
      if (d < 240) {
        enemy.x -= (dx / d) * enemy.speed * dt;
        enemy.y -= (dy / d) * enemy.speed * dt;
      } else if (d > 340) {
        enemy.x += moveDirX * enemy.speed * dt;
        enemy.y += moveDirY * enemy.speed * dt;
      }
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0) {
        state.projectiles.push({ x: enemy.x, y: enemy.y, vx: (dx / d) * 190, vy: (dy / d) * 190, life: 4, damage: -enemy.damage });
        enemy.cooldown = 1 / enemy.attackSpeed;
      }
    } else if (enemy.type === 'mortar') {
      if (d < 380) {
        enemy.x -= (dx / d) * enemy.speed * dt;
        enemy.y -= (dy / d) * enemy.speed * dt;
      } else if (d > 520) {
        enemy.x += moveDirX * enemy.speed * dt;
        enemy.y += moveDirY * enemy.speed * dt;
      }
      enemy.cooldown -= dt;
      if (enemy.cooldown <= 0) {
        state.zones.push({ x: player.x, y: player.y, r: 55, damage: enemy.damage, life: 1.2, isWarning: true });
        enemy.cooldown = 1 / enemy.attackSpeed;
      }
    } else if (enemy.type === 'tank') {
      enemy.x += moveDirX * enemy.speed * (enemy.freeze ? 0.4 : 1) * dt;
      enemy.y += moveDirY * enemy.speed * (enemy.freeze ? 0.4 : 1) * dt;
    } else if (enemy.type === 'boss') {
      enemy.phaseTime = (enemy.phaseTime || 0) + dt;
      enemy.x += moveDirX * enemy.speed * dt;
      enemy.y += moveDirY * enemy.speed * dt;
      enemy.cooldown -= dt;

      if (enemy.cooldown <= 0) {
        enemy.phaseState = (enemy.phaseState + 1) % 4;
        if (enemy.phaseState === 0) {
          for (let i = 0; i < 16; i++) {
            const a = (i * TAU) / 16 + state.elapsed;
            state.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 155, vy: Math.sin(a) * 155, life: 4, damage: -enemy.damage * 0.7 });
          }
          enemy.cooldown = 1.6;
        } else if (enemy.phaseState === 1) {
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(dy, dx) + i * 0.18;
            state.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 3.5, damage: -enemy.damage * 0.9 });
          }
          enemy.cooldown = 1.4;
        } else if (enemy.phaseState === 2) {
          for (let i = 0; i < 3; i++) {
            const ox = rand(-90, 90), oy = rand(-90, 90);
            state.zones.push({ x: player.x + ox, y: player.y + oy, r: 60, damage: enemy.damage * 1.1, life: 1.1, isWarning: true });
          }
          enemy.cooldown = 2.0;
        } else {
          enemy.speed *= 2.5;
          setTimeout(() => { enemy.speed /= 2.5; }, 800);
          for (let s = 0; s < 2; s++) {
            state.enemies.push({
              x: enemy.x + rand(-30, 30), y: enemy.y + rand(-30, 30),
              hp: 35, maxHp: 35, speed: 100, r: 11, color: '#e67565',
              damage: 10, attackSpeed: 1.2, baseScore: 0.01 * (state.gameMode === 'fast' ? 8.0 : 1.0), type: 'swarmer',
              hitAction: 'swarmer_hit', freeze: 0, burn: 0, hitFlash: 0, dead: false
            });
          }
          enemy.cooldown = 2.5;
        }
      }
    }

    // Hard enemy-obstacle collision
    for (const obstacle of state.obstacles) {
      const od = distance(enemy, obstacle);
      const minObs = obstacle.r + enemy.r;
      if (od < minObs && od > 0.0001) {
        const onx = (enemy.x - obstacle.x) / od;
        const ony = (enemy.y - obstacle.y) / od;
        enemy.x = obstacle.x + onx * minObs;
        enemy.y = obstacle.y + ony * minObs;
      }
    }

    // Hard Enemy-to-Player collision
    const pdx = enemy.x - player.x;
    const pdy = enemy.y - player.y;
    const minPlayerDist = player.r + enemy.r;
    const pd2 = pdx * pdx + pdy * pdy;
    if (pd2 < minPlayerDist * minPlayerDist) {
      const pdist = Math.sqrt(pd2) || 1;
      enemy.x = player.x + (pdx / pdist) * minPlayerDist;
      enemy.y = player.y + (pdy / pdist) * minPlayerDist;

      if (!isInvulnerable) {
        recordAction('damage_taken');
        player.hp -= mitigatedDamage(enemy.damage * dt, effectiveArmor);
        state.texts.push({ x: player.x, y: player.y - 20, text: `-${Math.ceil(enemy.damage * dt)}`, color: '#f06d62', life: 0.4, vy: -10 });
        if (player.hp <= 0) state.deathCause = enemy.type === 'boss' ? 'warden_boss' : 'contact_melee';
      }
    }

    if (enemy.hp <= 0 && !enemy.dead) killEnemy(enemy);
  }

  // Mob-to-Mob Soft Separation
  const enemyCount = state.enemies.length;
  for (let i = 0; i < enemyCount; i++) {
    const a = state.enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemyCount; j++) {
      const b = state.enemies[j];
      if (b.dead) continue;
      const edx = b.x - a.x;
      const edy = b.y - a.y;
      const minD = a.r + b.r;
      const d2 = edx * edx + edy * edy;
      if (d2 < minD * minD && d2 > 0.0001) {
        const dist = Math.sqrt(d2);
        const push = (minD - dist) * 0.5;
        const nx = edx / dist;
        const ny = edy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  state.enemies = state.enemies.filter(enemy => enemy.hp > 0 && !enemy.dead);

  if (state.enemies.length === 0 && state.mode === 'playing') {
    clearWave();
  }

  if (player.hp <= 0) gameOver();
}

function heal(amount) {
  recordAction('heal');
  const actualAmount = amount * (1 + generatedModifier('healPower'));
  const currentMaxHp = clamp(player.maxHp + generatedValue('maxHp'), 50, 300);
  player.hp = clamp(player.hp + actualAmount, 0, currentMaxHp);
  state.texts.push({ x: player.x, y: player.y - 25, text: `+${Math.round(actualAmount)}`, color: '#86e0b1', life: 1, vy: -24 });
}

function clearWave() {
  recordAction('wave_clear');
  addStyle(30);
  audio.playWaveClear();
  state.wave++;
  heal(12);
  const currentMaxHp = clamp(player.maxHp + generatedValue('maxHp'), 50, 300);
  player.hp = Math.min(currentMaxHp, player.hp + 20);
  spawnWave();
  updateHud();
  if (state.wave % 5 === 0) sendTelemetry();
}

async function submitScore() {
  try {
    const payload = {
      username: state.username,
      score: state.score,
      mode: state.gameMode,
      wave: state.wave,
      kills: state.kills,
      duration: state.elapsed
    };
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    fetchLeaderboard(state.leaderboardTab);
  } catch (err) {
    console.error('Score submit error:', err);
  }
}

async function sendTelemetry() {
  try {
    const apm = state.elapsed > 0 ? (state.totalInputs / (state.elapsed / 60)) : 0;
    const payload = {
      sessionId: state.sessionId,
      username: state.username,
      mode: state.gameMode,
      score: state.score,
      wave: state.wave,
      kills: state.kills,
      duration: state.elapsed,
      damage: state.damage,
      dps: state.dps,
      bestHit: state.bestHit,
      apm: Math.round(apm),
      deathCause: state.deathCause,
      actionsDistribution: state.actionCounts,
      sequenceMatrix: state.sequenceMatrix,
      skillsSynthesized: state.generatedSkills,
      timeline: state.combatTimeline
    };
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {}
}

async function fetchLeaderboard(mode = 'hardcore') {
  if (!ui.leaderboardList) return;
  try {
    const res = await fetch(`/api/leaderboard?mode=${mode}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      ui.leaderboardList.innerHTML = data.map((item, idx) => {
        const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
        const medal = idx === 0 ? '👑 #1' : `#${item.rank}`;
        const modeBadge = `<span class="mode-tag ${item.mode || 'hardcore'}">${(item.mode || 'hardcore').toUpperCase()}</span>`;
        return `
          <div class="lb-card ${rankClass}">
            <div class="lb-card-top">
              <span class="lb-rank-tag">${medal} <b>${item.username}</b> ${modeBadge}</span>
              <span class="lb-pts">${item.score.toFixed(2)} PTS</span>
            </div>
            <div class="lb-meta">
              <span>WAVE ${String(item.wave).padStart(2, '0')} · ${item.kills} KILLS</span>
              <span>${formatTime(item.duration || 0)}</span>
            </div>
          </div>
        `;
      }).join('');

      const userEntry = data.find(d => d.username === state.username);
      if (ui.userRankName) ui.userRankName.textContent = state.username;
      if (ui.userRankScore) {
        ui.userRankScore.textContent = userEntry ? `${userEntry.score.toFixed(2)} PTS (#${userEntry.rank})` : `${state.score.toFixed(2)} PTS (UNRANKED)`;
      }
    } else {
      ui.leaderboardList.innerHTML = '<div class="empty-state">No rankings recorded for this mode.</div>';
    }
  } catch (err) {
    ui.leaderboardList.innerHTML = '<div class="empty-state">Offline mode.</div>';
  }
}

function gameOver() {
  if (state.mode === 'dead') return;
  state.mode = 'dead';
  submitScore();
  sendTelemetry();
  if (ui.modalKicker) ui.modalKicker.textContent = 'RUN TERMINATED';
  if (ui.modalTitle) ui.modalTitle.textContent = `${formatTime(state.elapsed)} // ${state.kills} eliminated`;
  if (ui.modalCopy) ui.modalCopy.textContent = `Operator [${state.username}] · Mode: [${state.gameMode.toUpperCase()}] · Rank [${state.styleRank}] · Score ${state.score.toFixed(2)} PTS · Damage dealt ${Math.round(state.damage)} · Best hit ${Math.round(state.bestHit)} · Wave ${state.wave}`;
  if (ui.choices) ui.choices.innerHTML = '';
  if (ui.restartButton) ui.restartButton.classList.remove('hidden');
  if (ui.modal) ui.modal.classList.remove('hidden');
}

function hideModal() {
  if (ui.modal) ui.modal.classList.add('hidden');
  if (ui.restartButton) ui.restartButton.classList.add('hidden');
  if (ui.loginModal) ui.loginModal.classList.add('hidden');
  if (ui.infoModal) ui.infoModal.classList.add('hidden');
}

function handleEquipClick(skillId) {
  generator.toggleEquip(skillId);
  state.generatedSkills = generator.snapshot();
  updateHud();
  if (state.mode === 'paused') updateAnalysis();
}

function updateGenerativeHud() {
  const equippedCount = generator.equippedSkillIds.size;
  if (ui.patternCount) ui.patternCount.textContent = `DECK: ${equippedCount} / 18 SLOTS`;
  if (ui.generatedList) {
    ui.generatedList.innerHTML = state.generatedSkills.length
      ? state.generatedSkills.slice(0, 6).map(skill => {
          const isEq = skill.isEquipped;
          const isFull = !isEq && equippedCount >= 18;
          const btnClass = isEq ? 'equipped' : (isFull ? 'full' : '');
          const btnText = isEq ? 'EQUIPPED ✓' : (isFull ? 'SLOTS FULL' : '+ EQUIP');
          return `
            <div class="generated ${isEq ? 'is-equipped' : 'unequipped'}">
              <div class="generated-head">
                <b style="font-family:'Space Mono',monospace;color:var(--mint);font-size:11px;">${skill.name}</b>
                <button class="equip-btn ${btnClass}" data-skill-id="${skill.id}">${btnText}</button>
              </div>
              <small style="color:var(--mint);display:block;margin-top:2px;">▲ ${skill.buff}</small>
              <small style="color:var(--red);display:block;margin-top:1px;">▼ ${skill.debuff}</small>
              <div class="generated-track"><i style="width:${skill.progress * 100}%"></i></div>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">Collecting combat telemetry...</div>';

    // Bind equip buttons
    ui.generatedList.querySelectorAll('.equip-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const sid = btn.getAttribute('data-skill-id');
        if (sid) handleEquipClick(sid);
      };
    });
  }
}

function updateHud() {
  updateGenerativeHud();
  if (ui.wave) ui.wave.textContent = `${String(state.wave).padStart(2, '0')} / ∞`;
  if (ui.phaseLabel) ui.phaseLabel.textContent = `${state.gameMode === 'fast' ? '⚡ ' : ''}WAVE ${String(state.wave).padStart(2, '0')}`;
  if (ui.timer) ui.timer.textContent = formatTime(state.elapsed);
  if (ui.kills) ui.kills.textContent = String(state.kills).padStart(3, '0');
  if (ui.damage) ui.damage.textContent = String(Math.round(state.damage)).padStart(4, '0');
  if (ui.bestHit) ui.bestHit.textContent = String(Math.round(state.bestHit)).padStart(3, '0');

  const currentMaxHp = clamp(player.maxHp + generatedValue('maxHp'), 50, 300);
  player.hp = Math.min(player.hp, currentMaxHp);
  if (ui.healthText) ui.healthText.textContent = `${Math.ceil(player.hp)} / ${Math.round(currentMaxHp)}`;
  if (ui.healthBar) ui.healthBar.style.width = `${clamp((player.hp / currentMaxHp) * 100, 0, 100)}%`;
  if (ui.dashBar) ui.dashBar.style.width = `${clamp((1 - state.dashCooldown / 1.4) * 100, 0, 100)}%`;
  if (ui.dashText) ui.dashText.textContent = state.dashCooldown ? 'CHARGING' : 'READY (50% REFLECT)';

  const effectiveArmor = clamp(player.armor + generatedValue('armor'), 0, 60);
  if (ui.armor) ui.armor.textContent = effectiveArmor.toFixed(1);

  const effectiveCrit = generator.critRate(player.crit);
  if (ui.crit) ui.crit.textContent = `${Math.round(effectiveCrit * 100)}%`;
  if (ui.dps) ui.dps.textContent = Math.round(state.dps);

  if (ui.score) ui.score.textContent = `${state.score.toFixed(2)} PTS`;

  const boss = state.enemies.find(e => e.type === 'boss');
  if (ui.bossHealth) ui.bossHealth.style.width = `${clamp(((boss?.hp || 0) / (boss?.maxHp || 1)) * 100, 0, 100)}%`;

  if (ui.activeUser) ui.activeUser.textContent = `OPERATOR: ${state.username}`;
  if (ui.operatorTitle) ui.operatorTitle.textContent = state.username;
}

function updateAnalysis() {
  const effectiveDamageMult = clamp(player.damageMult * (1 + generatedModifier('damage')), 0.2, 5.0);
  const actualDamage = player.damage * effectiveDamageMult;
  const dmgBonusPercent = (effectiveDamageMult - 1) * 100;

  const attackBonus = generatedModifier('attackSpeed');
  const actualAttackSpeed = clamp(player.attackSpeed * (1 + attackBonus), 0.5, 8.0);
  const atkBonusPercent = attackBonus * 100;

  const effectiveCrit = generator.critRate(player.crit);
  const effectiveArmor = clamp(player.armor + generatedValue('armor'), 0, 60);
  const dmgReduction = (1 - (100 / (100 + effectiveArmor))) * 100;

  const moveSpeed = clamp(260 * (1 + generatedModifier('moveSpeed')), 180, 350);
  const moveBonusPercent = generatedModifier('moveSpeed') * 100;

  const currentMaxHp = clamp(player.maxHp + generatedValue('maxHp'), 50, 300);
  const hpBonus = generatedValue('maxHp');

  const dashDist = clamp(720 * (1 + generatedModifier('dashDistance')), 400, 1300);
  const dashCd = clamp(1.4 * (1 - generatedModifier('dashCooldown')), 0.5, 3.0);
  const targetRange = clamp(620 * (1 + generatedModifier('targetRange')), 350, 1100);
  const healBonus = generatedModifier('healPower') * 100;

  if (ui.pauseStats) {
    const shotInterval = 1.0 / actualAttackSpeed;
    ui.pauseStats.innerHTML = `
      <div class="stat-breakdown-row">
        <span>DAMAGE (СИЛА УРОНА)</span>
        <b>${actualDamage.toFixed(1)} <small style="color:${dmgBonusPercent >= 0 ? 'var(--mint)' : 'var(--red)'};">(${dmgBonusPercent >= 0 ? '+' : ''}${dmgBonusPercent.toFixed(1)}% к урону | Базовый ${player.damage})</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>ATTACK SPEED (ТЕМП ОГНЯ)</span>
        <b>${actualAttackSpeed.toFixed(2)} выстр/сек <small style="color:${atkBonusPercent >= 0 ? 'var(--mint)' : 'var(--red)'};">(${atkBonusPercent >= 0 ? '+' : ''}${atkBonusPercent.toFixed(1)}% скорострельность | Пауза: ${shotInterval.toFixed(2)}с)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>CRIT CHANCE (ШАНС КРИТА)</span>
        <b>${(effectiveCrit * 100).toFixed(1)}% <small style="color:var(--gold);">(Базовый 5% + Dota 2 пассивки | Урон: ×${player.critMult.toFixed(1)})</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>ARMOR (ЗАЩИТА)</span>
        <b>${effectiveArmor.toFixed(1)} <small style="color:var(--mint);">(Поглощение входящего урона: ${dmgReduction.toFixed(1)}%)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>VITALITY (ЗДОРОВЬЕ)</span>
        <b>${Math.ceil(player.hp)} / ${Math.round(currentMaxHp)} <small style="color:var(--mint);">(${hpBonus >= 0 ? '+' : ''}${hpBonus.toFixed(1)} к макс HP | База 100)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>MOVE SPEED (СКОРОСТЬ)</span>
        <b>${Math.round(moveSpeed)} px/s <small style="color:${moveBonusPercent >= 0 ? 'var(--mint)' : 'var(--red)'};">(${moveBonusPercent >= 0 ? '+' : ''}${moveBonusPercent.toFixed(1)}% от базы 260 | Софт-кап)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>DASH CORE (РЫВОК)</span>
        <b>${Math.round(dashDist)} px <small style="color:var(--blue);">(КД: ${dashCd.toFixed(2)}с | 100% i-frames | 50% Отражение пуль)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>TARGET RANGE (СЕКТОР АВТООГНЯ)</span>
        <b>${Math.round(targetRange)} px <small>(${((targetRange/620 - 1)*100).toFixed(1)}% к радиусу обзора)</small></b>
      </div>
      <div class="stat-breakdown-row">
        <span>HEAL POWER (ЛЕЧЕНИЕ)</span>
        <b>${healBonus >= 0 ? '+' : ''}${healBonus.toFixed(1)}% <small style="color:var(--mint);">(Бонус к восстановлению HP)</small></b>
      </div>
      <div class="stat-breakdown-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px;">
        <span>SCORE & STYLE (СЧЕТ И СТИЛЬ)</span>
        <b style="color:var(--gold);font-size:14px;">${state.score.toFixed(2)} PTS <small>[${state.styleRank} x${state.styleMultiplier.toFixed(1)}] (${state.gameMode.toUpperCase()})</small></b>
      </div>
    `;
  }

  if (ui.dpsFormula) {
    ui.dpsFormula.textContent = `${player.damage} × ${effectiveDamageMult.toFixed(2)} × ${actualAttackSpeed.toFixed(2)} × (1 + ${effectiveCrit.toFixed(2)} × ${(player.critMult - 1).toFixed(2)})`;
  }
  if (ui.formulaResult) {
    ui.formulaResult.textContent = `= ${effectiveDps(player.damage, effectiveDamageMult, actualAttackSpeed, effectiveCrit, player.critMult).toFixed(2)} DPS`;
  }

  const equippedCount = generator.equippedSkillIds.size;
  if (ui.skillGraph) {
    ui.skillGraph.innerHTML = state.generatedSkills.length
      ? state.generatedSkills.map(skill => {
          const isEq = skill.isEquipped;
          const isFull = !isEq && equippedCount >= 18;
          const btnText = isEq ? '✕ UNEQUIP' : (isFull ? 'SLOTS FULL (18/18)' : '+ EQUIP INTO DECK');
          const btnClass = isEq ? 'equipped' : (isFull ? 'full' : '');
          return `
            <div class="skill-node ${isEq ? 'is-equipped' : 'unequipped'}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <b style="font-family:'Space Mono',monospace;color:var(--mint);font-size:12px;">${skill.name}</b>
                <button class="equip-btn ${btnClass}" data-skill-id="${skill.id}">${btnText}</button>
              </div>
              <small>${skill.pattern} · LV ${skill.level}</small>
              <strong style="color:var(--mint);display:block;margin-top:4px;">Бафф: ${skill.buff}</strong>
              <strong style="color:var(--red);display:block;margin-top:2px;">Дебафф: ${skill.debuff}</strong>
              <span>${skill.source}</span>
              <span>Наблюдений: ${skill.observations} / Порог: ${skill.threshold}</span>
              <span>Формула: ${skill.formula}</span>
              <i style="width:${skill.progress * 100}%"></i>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">No stable pattern yet. Move, dash, aim and reflect bullets to train the engine.</div>';

    ui.skillGraph.querySelectorAll('.equip-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const sid = btn.getAttribute('data-skill-id');
        if (sid) handleEquipClick(sid);
      };
    });
  }

  const recent = state.actions.slice(-8).join(' → ') || 'No events recorded';
  if (ui.sequenceView) ui.sequenceView.innerHTML = `LATEST SEQUENCE <b>${recent}</b>`;
}

function togglePause() {
  if (state.mode === 'dead') return;
  if (state.mode === 'paused') {
    state.mode = 'playing';
    if (ui.pauseScreen) ui.pauseScreen.classList.add('hidden');
    if (ui.statusLabel) ui.statusLabel.textContent = 'LIVE RUN';
  } else {
    state.mode = 'paused';
    if (ui.pauseScreen) ui.pauseScreen.classList.remove('hidden');
    if (ui.statusLabel) ui.statusLabel.textContent = 'ANALYSIS PAUSED';
    updateAnalysis();
  }
}

function draw() {
  const { w, h } = arena();
  const target = getAutoTarget();
  ctx.clearRect(0, 0, w, h);
  ctx.save();

  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

  ctx.fillStyle = '#0b1719';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#17302d';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 42) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  for (const obstacle of state.obstacles) {
    ctx.strokeStyle = obstacle.kind === 'portal' ? '#72c8e3' : '#35514b';
    ctx.fillStyle = obstacle.kind === 'portal' ? '#102d34' : '#1b2b2b';
    ctx.beginPath(); ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, TAU); ctx.fill(); ctx.stroke();
  }

  if (target && !state.charging) {
    ctx.strokeStyle = 'rgba(134,224,177,.28)';
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(target.x, target.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#86e0b1';
    ctx.beginPath(); ctx.arc(target.x, target.y, target.r + 7, 0, TAU); ctx.stroke();
  }

  for (const zone of state.zones) {
    if (zone.isWarning) {
      ctx.fillStyle = 'rgba(235, 77, 75, 0.25)';
      ctx.strokeStyle = '#eb4d4b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(235, 77, 75, 0.12)';
      ctx.strokeStyle = 'rgba(235, 77, 75, 0.4)';
      ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  for (const projectile of state.projectiles) {
    if (projectile.reflected) {
      ctx.fillStyle = '#86e0b1';
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, 5, 0, TAU); ctx.fill();
    } else if (projectile.isCharged) {
      ctx.fillStyle = '#f4bd62';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#f4bd62';
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.r || 6, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = projectile.damage < 0 ? '#f06d62' : '#f4bd62';
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.damage < 0 ? 4 : 3, 0, TAU); ctx.fill();
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    if (enemy.isElite) {
      ctx.strokeStyle = '#f4bd62';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, enemy.r + 4, 0, TAU); ctx.stroke();
    }

    ctx.fillStyle = enemy.hitFlash > 0 ? '#fff' : enemy.color;
    ctx.strokeStyle = enemy.type === 'boss' ? '#f4bd62' : '#263b38';
    ctx.lineWidth = enemy.type === 'boss' ? 3 : 2;
    ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, TAU); ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#081016';
    ctx.fillRect(-enemy.r, -enemy.r - 8, enemy.r * 2, 3);
    ctx.fillStyle = '#f06d62';
    ctx.fillRect(-enemy.r, -enemy.r - 8, enemy.r * 2 * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
    ctx.restore();
  }

  // Draw Player
  ctx.save();
  ctx.translate(player.x, player.y);
  const targetAngle = state.charging
    ? Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x)
    : (target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x));
  
  const angleDelta = Math.atan2(Math.sin(targetAngle - player.angle), Math.cos(targetAngle - player.angle));
  player.angle += angleDelta * Math.min(1, 0.16);
  ctx.rotate(player.angle);

  // Dash trail & invulnerability glow
  if (player.invuln > 0 || state.dashTime > 0) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#86e0b1';
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#86e0b1';
  }

  ctx.strokeStyle = '#dce8df';
  ctx.beginPath();
  ctx.moveTo(19, 0); ctx.lineTo(-12, -11); ctx.lineTo(-7, 0); ctx.lineTo(-12, 11); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Infinite Mouse Charge Visual Reticle
  if (state.charging) {
    const holdSec = (performance.now() - state.chargeStartTime) / 1000;
    const mult = 1.0 + holdSec * 1.5;
    const ringRadius = clamp(26 + holdSec * 6, 26, 65);

    // Aim Laser Line to cursor
    ctx.strokeStyle = 'rgba(244, 189, 98, 0.6)';
    ctx.lineWidth = clamp(1 + holdSec * 0.8, 1, 6);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(state.mouse.x, state.mouse.y);
    ctx.stroke();

    // Charging Arc around player
    ctx.strokeStyle = '#f4bd62';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, ringRadius, 0, TAU * Math.min(1, holdSec / 3.0));
    ctx.stroke();

    // Real-time Damage Multiplier Readout
    ctx.fillStyle = '#f4bd62';
    ctx.font = '700 13px Space Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`CHARGE ×${mult.toFixed(1)} DMG`, player.x, player.y - ringRadius - 10);
  }

  for (const text of state.texts) {
    ctx.globalAlpha = clamp(text.life, 0, 1);
    ctx.fillStyle = text.color;
    ctx.font = '700 12px Space Mono';
    ctx.textAlign = 'center';
    ctx.fillText(text.text, text.x, text.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  state.shake = Math.max(0, state.shake - 0.4);
}

function update(dt) {
  if (state.mode === 'playing') {
    state.elapsed += dt;
    movePlayer(dt);
    updateCombat(dt);
    state.dps = state.elapsed ? state.damage / state.elapsed : 0;
  }
  for (const text of state.texts) { text.y += text.vy * dt; text.life -= dt; }
  state.texts = state.texts.filter(text => text.life > 0);
  for (const enemy of state.enemies) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  updateHud();
  draw();
  requestAnimationFrame(loop);
}

let previous = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;
  update(dt);
}

function handleUserAudioUnlock() {
  audio.ensureContext();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  handleUserAudioUnlock();
  state.totalInputs++;

  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
    if (event.code === 'Escape') {
      if (ui.loginModal) ui.loginModal.classList.add('hidden');
      if (ui.infoModal) ui.infoModal.classList.add('hidden');
    }
    return;
  }

  state.keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    dash();
  }
  if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) {
    event.preventDefault();
    togglePause();
  }
  if (event.code === 'KeyM' && !event.repeat) {
    event.preventDefault();
    if (ui.audioToggleBtn) ui.audioToggleBtn.click();
  }
  if (event.code === 'KeyI' && !event.repeat) {
    event.preventDefault();
    toggleInfoModal();
  }
});

window.addEventListener('keyup', event => {
  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
    return;
  }
  state.keys.delete(event.code);
});

canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = event.clientX - rect.left;
  state.mouse.y = event.clientY - rect.top;
});

canvas.addEventListener('pointerdown', (e) => {
  handleUserAudioUnlock();
  state.totalInputs++;
  state.mouse.down = true;
  state.charging = true;
  state.chargeStartTime = performance.now();
});

window.addEventListener('pointerup', () => {
  state.mouse.down = false;
  if (state.charging) {
    releaseChargedShot();
  }
});

if (ui.pauseButton) ui.pauseButton.onclick = togglePause;
if (ui.resumeButton) ui.resumeButton.onclick = togglePause;
if (ui.newRunButton) ui.newRunButton.onclick = reset;
if (ui.restartButton) ui.restartButton.onclick = reset;
if (ui.modeToggleBtn) ui.modeToggleBtn.onclick = toggleGameMode;

if (ui.lbTabHardcore) ui.lbTabHardcore.onclick = () => setLeaderboardTab('hardcore');
if (ui.lbTabFast) ui.lbTabFast.onclick = () => setLeaderboardTab('fast');

if (ui.audioToggleBtn) {
  ui.audioToggleBtn.onclick = () => {
    const unmuted = audio.toggleMute();
    ui.audioToggleBtn.textContent = unmuted ? '🔊' : '🔇';
    ui.audioToggleBtn.title = unmuted ? 'Звук включен (M)' : 'Звук выключен (M)';
  };
}

// Info Modal
function toggleInfoModal() {
  if (!ui.infoModal) return;
  const isHidden = ui.infoModal.classList.contains('hidden');
  if (isHidden) {
    state.keys.clear();
    ui.infoModal.classList.remove('hidden');
  } else {
    ui.infoModal.classList.add('hidden');
  }
}
if (ui.infoModalBtn) ui.infoModalBtn.onclick = toggleInfoModal;
if (ui.closeInfoBtn) ui.closeInfoBtn.onclick = toggleInfoModal;

// Operator Auth Modal
if (ui.loginModalBtn) {
  ui.loginModalBtn.onclick = () => {
    state.keys.clear();
    if (ui.loginModal) ui.loginModal.classList.remove('hidden');
    if (ui.loginUsername) {
      ui.loginUsername.value = state.username;
      setTimeout(() => ui.loginUsername.focus(), 60);
    }
  };
}
if (ui.closeLoginBtn) {
  ui.closeLoginBtn.onclick = () => {
    if (ui.loginModal) ui.loginModal.classList.add('hidden');
  };
}
if (ui.loginForm) {
  ui.loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const uname = ui.loginUsername.value.trim() || 'ptr734876';
    const pwd = ui.loginPassword.value.trim();
    state.username = uname;
    localStorage.setItem('skillgen_username', uname);
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd })
      });
      fetchLeaderboard(state.leaderboardTab);
    } catch (err) {}
    if (ui.loginModal) ui.loginModal.classList.add('hidden');
    updateHud();
    log(`Operator profile verified: [${uname}]`);
  };
}

const arenaWrap = document.querySelector('.arena-wrap');
if (window.ResizeObserver && arenaWrap) {
  const ro = new ResizeObserver(() => {
    resize();
  });
  ro.observe(arenaWrap);
}

resize();
reset();
requestAnimationFrame(loop);
