// Advanced Generative Skill Engine (Version 3.0)
// Multi-Tier Progression, Time-Windowed N-Gram Combos (up to 4 steps),
// Zero-Penalty Masteries, Contextual Affixes & Branching Morphologies.

const EVENT_LABELS = {
  move: 'движение', standstill: 'неподвижность', dash: 'рывок', target_lock: 'захват цели',
  fire: 'автоогонь', hit: 'попадание', point_blank_hit: 'удар в упор', sniper_hit: 'дальний выстрел',
  crit: 'крит', kill: 'убийство', multikill: 'серия убийств', close_call: 'опасный пролет',
  damage_taken: 'полученный урон', heal: 'лечение', wave_clear: 'очистка волны',
  swarmer_hit: 'урон рою', ranger_hit: 'урон стрелку', tank_hit: 'урон танку',
  stalker_hit: 'урон сталкеру', mortar_hit: 'урон миномету', boss_hit: 'урон боссу'
};

// Explicit hand-crafted rules for core actions & combos
const SEMANTIC_RULES = {
  // Tier 1: Common Basic Actions
  move: {
    name: 'Kinetic Stride', tier: 'common', threshold: 80,
    buff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'скорость движения' },
    debuff: { stat: 'targetRange', base: 0.8, unit: '%', label: 'сужение сектора при беге' }
  },
  'move→move': {
    name: 'Continuous Momentum', tier: 'common', threshold: 50,
    buff: { stat: 'moveSpeed', base: 0.8, unit: '%', label: 'разгон скорости' },
    debuff: { stat: 'armor', base: 0.5, unit: '', label: 'инерционная уязвимость' }
  },
  standstill: {
    name: 'Siege Protocol', tier: 'uncommon', threshold: 25,
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'осадный урон' },
    debuff: { stat: 'moveSpeed', base: 2.0, unit: '%', label: 'инерция старта' }
  },
  'standstill→standstill': {
    name: 'Fortified Bunker', tier: 'uncommon', threshold: 18,
    buff: { stat: 'armor', base: 1.5, unit: '', label: 'укрепление брони' },
    debuff: { stat: 'moveSpeed', base: 2.2, unit: '%', label: 'фиксация в грунте' }
  },
  dash: {
    name: 'Slipstream Step', tier: 'uncommon', threshold: 25,
    buff: { stat: 'dashDistance', base: 3.2, unit: '%', label: 'дистанция рывка' },
    debuff: { stat: 'attackSpeed', base: 0.8, unit: '%', label: 'задержка прицела' }
  },
  'move→dash': {
    name: 'Vector Drift', tier: 'uncommon', threshold: 20,
    buff: { stat: 'dashCooldown', base: 3.5, unit: '%', label: 'перезарядка рывка' },
    debuff: { stat: 'targetRange', base: 0.8, unit: '%', label: 'динамическая фокусировка' }
  },
  'dash→move': {
    name: 'Flow Recovery', tier: 'uncommon', threshold: 20,
    buff: { stat: 'moveSpeed', base: 0.7, unit: '%', label: 'спринт после рывка' },
    debuff: { stat: 'armor', base: 0.5, unit: '', label: 'уязвимость перехода' }
  },
  'dash→dash': {
    name: 'Phase Flicker', tier: 'rare', threshold: 15,
    buff: { stat: 'dashDistance', base: 4.5, unit: '%', label: 'серийный рывок' },
    debuff: null // Zero penalty for mastering double-dash!
  },
  fire: {
    name: 'Rapid Volley', tier: 'common', threshold: 60,
    buff: { stat: 'attackSpeed', base: 2.4, unit: '%', label: 'скорость атаки' },
    debuff: { stat: 'dashDistance', base: 1.0, unit: '%', label: 'вес вооружения' }
  },
  'fire→fire': {
    name: 'Lead Storm', tier: 'uncommon', threshold: 45,
    buff: { stat: 'damage', base: 2.8, unit: '%', label: 'нагрев стволов' },
    debuff: { stat: 'healPower', base: 1.2, unit: '%', label: 'расход систем охлаждения' }
  },
  'standstill→fire': {
    name: 'Turret Battery', tier: 'uncommon', threshold: 20,
    buff: { stat: 'attackSpeed', base: 3.6, unit: '%', label: 'скорострельность турели' },
    debuff: { stat: 'moveSpeed', base: 1.8, unit: '%', label: 'неподвижность в стойке' }
  },
  'dash→fire': {
    name: 'Phantom Thrust', tier: 'uncommon', threshold: 15,
    buff: { stat: 'damage', base: 4.0, unit: '%', label: 'урон с выпада' },
    debuff: { stat: 'dashCooldown', base: 1.2, unit: '%', label: 'затрата энергии' }
  },
  target_lock: {
    name: 'Targeting Matrix', tier: 'uncommon', threshold: 40,
    buff: { stat: 'targetRange', base: 4.5, unit: '%', label: 'дальность захвата' },
    debuff: { stat: 'attackSpeed', base: 0.8, unit: '%', label: 'задержка калибровки' }
  },
  point_blank_hit: {
    name: 'Point Blank Blast', tier: 'uncommon', threshold: 25,
    buff: { stat: 'damage', base: 4.0, unit: '%', label: 'контактный урон' },
    debuff: { stat: 'targetRange', base: 1.2, unit: '%', label: 'ближний фокус' }
  },
  'dash→point_blank_hit': {
    name: 'Assassin Rush', tier: 'rare', threshold: 12,
    buff: { stat: 'damage', base: 5.5, unit: '%', label: 'урон выпада' },
    debuff: null // Pure rewarding mastery!
  },
  sniper_hit: {
    name: 'Longshot Cadence', tier: 'uncommon', threshold: 25,
    buff: { stat: 'targetRange', base: 5.0, unit: '%', label: 'снайперский радиус' },
    debuff: { stat: 'attackSpeed', base: 1.0, unit: '%', label: 'время наводки' }
  },
  'sniper_hit→kill': {
    name: 'Longshot Execution', tier: 'rare', threshold: 10,
    buff: { stat: 'critChance', base: 2.5, unit: '%', label: 'шанс крита снайпера' },
    debuff: null
  },
  crit: {
    name: 'Lethal Exposure', tier: 'uncommon', threshold: 20,
    buff: { stat: 'critChance', base: 1.5, unit: '%', label: 'шанс крита' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'агрессивная стойка' }
  },
  'fire→crit': {
    name: 'Critical Mass', tier: 'rare', threshold: 15,
    buff: { stat: 'critChance', base: 2.4, unit: '%', label: 'шанс серийного крита' },
    debuff: null
  },
  close_call: {
    name: 'Adrenaline Reflex', tier: 'uncommon', threshold: 15,
    buff: { stat: 'moveSpeed', base: 0.9, unit: '%', label: 'адреналиновая скорость' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'рискованный маневр' }
  },
  'close_call→dash': {
    name: 'Hyper Reflex', tier: 'rare', threshold: 8,
    buff: { stat: 'dashDistance', base: 5.5, unit: '%', label: 'сверхрывок' },
    debuff: null
  },
  damage_taken: {
    name: 'Iron Conditioning', tier: 'uncommon', threshold: 18,
    buff: { stat: 'armor', base: 1.2, unit: '', label: 'динамическая броня' },
    debuff: { stat: 'attackSpeed', base: 0.8, unit: '%', label: 'контузия' }
  },
  'damage_taken→damage_taken': {
    name: 'Indomitable Hull', tier: 'rare', threshold: 10,
    buff: { stat: 'maxHp', base: 5.5, unit: '', label: 'закалка корпуса (+HP)' },
    debuff: null
  },
  'damage_taken→heal': {
    name: 'Vampiric Rebound', tier: 'rare', threshold: 8,
    buff: { stat: 'healPower', base: 4.0, unit: '%', label: 'эффективность лечения' },
    debuff: null
  },
  'damage_taken→kill': {
    name: 'Vengeful Retaliation', tier: 'rare', threshold: 8,
    buff: { stat: 'damage', base: 5.2, unit: '%', label: 'урон возмездия' },
    debuff: null
  },
  kill: {
    name: 'Soul Siphon', tier: 'uncommon', threshold: 35,
    buff: { stat: 'healPower', base: 2.2, unit: '%', label: 'вампиризм лечения' },
    debuff: { stat: 'dashCooldown', base: 0.6, unit: '%', label: 'сбор эссенции' }
  },
  'kill→kill': {
    name: 'Chain Extermination', tier: 'rare', threshold: 20,
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'урон серии' },
    debuff: null
  },
  multikill: {
    name: 'Rampage Catalyst', tier: 'rare', threshold: 12,
    buff: { stat: 'attackSpeed', base: 3.5, unit: '%', label: 'боевой раж' },
    debuff: null
  },
  'multikill→fire': {
    name: 'Rampage Flow', tier: 'rare', threshold: 8,
    buff: { stat: 'damage', base: 4.8, unit: '%', label: 'шквальный урон' },
    debuff: null
  },
  heal: {
    name: 'Recovery Loop', tier: 'uncommon', threshold: 10,
    buff: { stat: 'healPower', base: 3.0, unit: '%', label: 'сила лечения' },
    debuff: { stat: 'dashDistance', base: 1.0, unit: '%', label: 'регенеративный транс' }
  },
  swarmer_hit: {
    name: 'Swarmer Shredder', tier: 'uncommon', threshold: 40,
    buff: { stat: 'attackSpeed', base: 2.0, unit: '%', label: 'темп против роя' },
    debuff: { stat: 'targetRange', base: 0.8, unit: '%', label: 'рассеивание огня' }
  },
  ranger_hit: {
    name: 'Counter-Sniper', tier: 'uncommon', threshold: 25,
    buff: { stat: 'targetRange', base: 3.5, unit: '%', label: 'дальность против стрелков' },
    debuff: { stat: 'dashDistance', base: 0.8, unit: '%', label: 'контр-батарейный темп' }
  },
  tank_hit: {
    name: 'Armor Piercer', tier: 'uncommon', threshold: 20,
    buff: { stat: 'damage', base: 3.8, unit: '%', label: 'бронебойный урон' },
    debuff: { stat: 'attackSpeed', base: 0.8, unit: '%', label: 'тяжелый калибр' }
  },
  stalker_hit: {
    name: 'Interceptor Edge', tier: 'uncommon', threshold: 20,
    buff: { stat: 'moveSpeed', base: 0.7, unit: '%', label: 'скорость перехвата' },
    debuff: { stat: 'armor', base: 0.5, unit: '', label: 'риск маневра' }
  },
  mortar_hit: {
    name: 'Artillery Breaker', tier: 'uncommon', threshold: 15,
    buff: { stat: 'dashCooldown', base: 3.0, unit: '%', label: 'кд рывка от залпов' },
    debuff: { stat: 'targetRange', base: 0.8, unit: '%', label: 'уклонение' }
  },
  boss_hit: {
    name: 'Titan Slayer', tier: 'rare', threshold: 15,
    buff: { stat: 'damage', base: 5.5, unit: '%', label: 'урон по титанам' },
    debuff: null
  },
  wave_clear: {
    name: 'Floor Architect', tier: 'rare', threshold: 1,
    buff: { stat: 'maxHp', base: 4.0, unit: '', label: 'max HP' },
    debuff: null
  },

  // Tier 4: Epic / Legendary High-Order 3-Step & 4-Step Masteries (ZERO DEBUFFS!)
  'dash→point_blank_hit→kill': {
    name: 'Shadow Executioner', tier: 'legendary', threshold: 6,
    buff: { stat: 'damage', base: 7.5, unit: '%', label: 'смертоносный выпад' },
    debuff: null
  },
  'close_call→dash→fire': {
    name: 'Counter-Strike Matrix', tier: 'legendary', threshold: 5,
    buff: { stat: 'critChance', base: 3.5, unit: '%', label: 'контратакующий крит' },
    debuff: null
  },
  'fire→crit→multikill': {
    name: 'Cascade Annihilation', tier: 'legendary', threshold: 5,
    buff: { stat: 'attackSpeed', base: 5.0, unit: '%', label: 'каскадный шквал' },
    debuff: null
  },
  'move→dash→sniper_hit': {
    name: 'Ghost Infiltrator', tier: 'legendary', threshold: 6,
    buff: { stat: 'targetRange', base: 6.5, unit: '%', label: 'разведка в движении' },
    debuff: null
  },
  'damage_taken→dash→heal': {
    name: 'Phoenix Resurgence', tier: 'legendary', threshold: 4,
    buff: { stat: 'healPower', base: 6.0, unit: '%', label: 'аварийное восстановление' },
    debuff: null
  }
};

const hashString = value => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 7) >>> 0;

// Dynamic Progression Calculations based on Tier & Frequency
const calcLevel = (observations, threshold, tier = 'uncommon') => {
  if (!observations || observations < threshold) return 0;
  // High-tier combos level up faster with higher payoff per observation!
  const power = tier === 'legendary' ? 0.60 : (tier === 'rare' ? 0.52 : (tier === 'uncommon' ? 0.45 : 0.38));
  return Math.min(10, Math.floor(Math.pow(observations / threshold, power)) + 1);
};

const tierStart = (threshold, level, tier = 'uncommon') => {
  if (level <= 1) return threshold;
  const power = tier === 'legendary' ? 0.60 : (tier === 'rare' ? 0.52 : (tier === 'uncommon' ? 0.45 : 0.38));
  return threshold * Math.pow(level - 1, 1 / power);
};

const tierNext = (threshold, level, tier = 'uncommon') => {
  const power = tier === 'legendary' ? 0.60 : (tier === 'rare' ? 0.52 : (tier === 'uncommon' ? 0.45 : 0.38));
  return threshold * Math.pow(level, 1 / power);
};

// Stat-dependent scaling: Common skills have soft scaling; Rare/Epic have aggressive scaling
const calcBuffValue = (base, level, tier = 'uncommon') => {
  const growthExp = tier === 'legendary' ? 0.95 : (tier === 'rare' ? 0.85 : (tier === 'uncommon' ? 0.70 : 0.60));
  return base * Math.pow(Math.max(1, level), growthExp);
};

// Debuff scaling: Common has standard penalty, Rare diminishes with mastery, Legendary is 0!
const calcDebuffValue = (debuffRule, level, tier = 'uncommon') => {
  if (!debuffRule || !debuffRule.base || tier === 'legendary' || tier === 'rare') return 0;
  // Penalty diminishes as level increases (mastery reduces the penalty!)
  const penaltyFactor = tier === 'uncommon' ? 0.20 : 0.35;
  return (debuffRule.base * penaltyFactor) * Math.pow(Math.max(1, level), 0.30);
};

export function calculateDotaCrit(baseCrit, critSources = [], debuffSources = []) {
  let nonCritChance = Math.max(0.01, 1 - baseCrit);
  for (const buffVal of critSources) {
    const p = Math.max(0, Math.min(0.95, buffVal / 100));
    nonCritChance *= (1 - p);
  }
  for (const debuffVal of debuffSources) {
    const d = Math.max(0, Math.min(0.95, debuffVal / 100));
    nonCritChance = Math.min(0.99, nonCritChance / Math.max(0.05, 1 - d));
  }
  const finalCrit = 1 - nonCritChance;
  return Math.max(0.01, Math.min(0.90, finalCrit));
}

export class GenerativeSkillEngine {
  constructor(seed = 184921) {
    this.seed = seed;
    this.mode = 'hardcore';
    this.reset();
  }

  setMode(mode) {
    this.mode = mode || 'hardcore';
    this.regenerate();
  }

  reset() {
    this.events = {};
    this.sequences = {};
    this.lastContext = {};
    this.skills = [];
  }

  record(pattern, meta = {}) {
    const isFast = (this.mode === 'fast');
    const weight = isFast ? 2 : 1;

    if (pattern.includes('→')) {
      this.sequences[pattern] = (this.sequences[pattern] || 0) + weight;
    } else {
      this.events[pattern] = (this.events[pattern] || 0) + weight;
    }
    this.lastContext = { ...this.lastContext, ...meta };
    this.regenerate(meta);
  }

  regenerate(meta = {}) {
    const context = { ...this.lastContext, ...meta };
    const sources = [
      ...Object.entries(this.events).map(([pattern, observations]) => ({
        pattern, observations, kind: 'event'
      })),
      ...Object.entries(this.sequences).map(([pattern, observations]) => ({
        pattern, observations, kind: 'sequence'
      }))
    ];

    this.skills = sources
      .filter(source => source.observations > 0)
      .map(source => this.buildSkill(source, context))
      .filter(skill => skill.level >= 1)
      .sort((a, b) => b.level - a.level || b.observations - a.observations)
      .slice(0, 18);
  }

  buildSkill(source, context = {}) {
    const pattern = source.pattern;
    const rule = SEMANTIC_RULES[pattern] || this.fallbackRule(pattern);
    const tier = rule.tier || 'uncommon';

    // Fast Mode threshold reduction
    const threshold = this.mode === 'fast' ? Math.max(2, Math.round(rule.threshold / 6.0)) : rule.threshold;
    const level = calcLevel(source.observations, threshold, tier);

    const start = tierStart(threshold, level, tier);
    const next = tierNext(threshold, level, tier);
    const progress = level >= 10 ? 1.0 : Math.max(0, Math.min(1, (source.observations - start) / Math.max(1, next - start)));

    // Contextual Affixes (Low HP Desperation, Flawless streak, Boss presence)
    let contextBonus = 1.0;
    let affixTag = '';
    if (context.isLowHp && (rule.buff.stat === 'moveSpeed' || rule.buff.stat === 'armor' || rule.buff.stat === 'healPower')) {
      contextBonus = 1.25;
      affixTag = ' [ADRENALINE]';
    } else if (context.isFlawless && (rule.buff.stat === 'damage' || rule.buff.stat === 'attackSpeed' || rule.buff.stat === 'critChance')) {
      contextBonus = 1.20;
      affixTag = ' [OVERDRIVE]';
    } else if (context.isBossActive && (rule.buff.stat === 'damage' || rule.buff.stat === 'targetRange')) {
      contextBonus = 1.30;
      affixTag = ' [SLAYER]';
    }

    const buffMultiplier = (this.mode === 'fast' ? 1.3 : 1.0) * contextBonus;
    const buffVal = calcBuffValue(rule.buff.base * buffMultiplier, level, tier);
    const debuffVal = calcDebuffValue(rule.debuff, level, tier);

    // Branching Morphology at LV 3, LV 6, LV 9
    let morphedName = rule.name + affixTag;
    if (level >= 6) morphedName = `Mastered ${morphedName}`;
    else if (level >= 3) morphedName = `Enhanced ${morphedName}`;

    const sourceLabel = pattern.split('→').map(a => EVENT_LABELS[a] || a).join(' → ');
    const seed = hashString(`${this.seed}:${pattern}`);

    const debuffText = debuffVal > 0 && rule.debuff
      ? `-${debuffVal.toFixed(1)}${rule.debuff.unit} ${rule.debuff.label}`
      : 'Без штрафов (Мастерство)';

    return {
      id: `skill_${seed.toString(16)}`,
      name: morphedName,
      tier,
      pattern,
      observations: source.observations,
      threshold,
      source: `${source.kind === 'sequence' ? 'Связка' : 'Действие'}: ${sourceLabel}`,
      unlock: `${threshold} подтверждений паттерна ${pattern}`,
      growth: `LV${level} (След. ур: ${Math.round(next)} набл.)`,
      level,
      progress,
      confidence: Math.min(99, Math.round((source.observations / threshold) * 100)),
      buff: `+${buffVal.toFixed(1)}${rule.buff.unit} ${rule.buff.label}`,
      debuff: debuffText,
      formula: `Бафф: +${(rule.buff.base * buffMultiplier).toFixed(2)}${rule.buff.unit} | Дебафф: ${debuffVal > 0 ? `-${debuffVal.toFixed(2)}` : '0 (Чистый бонус)'}`,
      buffEffect: { stat: rule.buff.stat, value: buffVal, unit: rule.buff.unit, label: rule.buff.label },
      debuffEffect: (debuffVal > 0 && rule.debuff) ? { stat: rule.debuff.stat, value: debuffVal, unit: rule.debuff.unit, label: rule.debuff.label } : null,
      context
    };
  }

  // Intelligent fallback for high-order or unlisted combos (up to 4 steps)
  fallbackRule(pattern) {
    const parts = pattern.split('→');
    const comboLength = parts.length;
    const tier = comboLength >= 3 ? 'legendary' : (comboLength === 2 ? 'rare' : 'uncommon');

    const first = parts[0];
    const last = parts[parts.length - 1];

    // High-order 3+ step combos have ZERO debuffs!
    const debuff = comboLength >= 3 ? null : { stat: 'targetRange', base: 0.6, unit: '%', label: 'фокус' };

    // Movement / Evasion
    if (parts.some(p => p === 'move' || p === 'dash' || p === 'close_call')) {
      const baseStat = parts.includes('dash') ? 'dashDistance' : 'moveSpeed';
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Combo`,
        tier,
        threshold: comboLength >= 3 ? 5 : (comboLength === 2 ? 14 : 25),
        buff: { stat: baseStat, base: baseStat === 'moveSpeed' ? 0.8 * comboLength : 3.0 * comboLength, unit: '%', label: 'маневренность комбо' },
        debuff
      };
    }

    // Shooting / Crit
    if (parts.some(p => p === 'fire' || p === 'crit' || p === 'sniper_hit')) {
      const baseStat = parts.includes('crit') ? 'critChance' : 'attackSpeed';
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Cadence`,
        tier,
        threshold: comboLength >= 3 ? 5 : (comboLength === 2 ? 14 : 25),
        buff: { stat: baseStat, base: baseStat === 'critChance' ? 1.8 * comboLength : 2.4 * comboLength, unit: '%', label: 'боевой темп' },
        debuff
      };
    }

    // Damage / Execution
    return {
      name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Mastery`,
      tier,
      threshold: comboLength >= 3 ? 5 : (comboLength === 2 ? 12 : 20),
      buff: { stat: 'damage', base: 3.5 * comboLength, unit: '%', label: 'урон комбо' },
      debuff: null
    };
  }

  modifier(stat) {
    let total = 0;
    for (const skill of this.skills) {
      if (skill.level < 1) continue;
      if (skill.buffEffect && skill.buffEffect.stat === stat) {
        total += skill.buffEffect.value;
      }
      if (skill.debuffEffect && skill.debuffEffect.stat === stat) {
        total -= skill.debuffEffect.value;
      }
    }
    // Smooth Diminishing Soft-Cap on moveSpeed
    if (stat === 'moveSpeed') {
      if (total > 0) {
        total = 35.0 * Math.tanh(total / 35.0);
      } else {
        total = -25.0 * Math.tanh(Math.abs(total) / 25.0);
      }
    }
    return total;
  }

  critRate(baseCrit = 0.05) {
    const buffs = [];
    const debuffs = [];
    for (const skill of this.skills) {
      if (skill.level < 1) continue;
      if (skill.buffEffect && skill.buffEffect.stat === 'critChance') {
        buffs.push(skill.buffEffect.value);
      }
      if (skill.debuffEffect && skill.debuffEffect.stat === 'critChance') {
        debuffs.push(skill.debuffEffect.value);
      }
    }
    return calculateDotaCrit(baseCrit, buffs, debuffs);
  }

  snapshot() {
    return this.skills.map(s => ({ ...s }));
  }
}
