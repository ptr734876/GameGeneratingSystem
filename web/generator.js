// Advanced Generative Skill Engine (Version 3.3 - Calibrated Pacing & Trait Hash System)
// Every passive displays a cyber-trait hash encoding its action source, buff, debuff, tier and level.

const EVENT_LABELS = {
  move: 'движение', standstill: 'неподвижность', dash: 'рывок',
  point_blank_hit: 'удар в упор', sniper_hit: 'дальний выстрел', crit: 'крит',
  kill: 'убийство', multikill: 'мульти-убийство', close_call: 'опасный пролет',
  damage_taken: 'полученный урон', heal: 'лечение', wave_clear: 'очистка волны',
  swarmer_hit: 'урон рою', ranger_hit: 'урон стрелку', tank_hit: 'урон танку',
  stalker_hit: 'урон сталкеру', mortar_hit: 'урон миномету', boss_hit: 'урон боссу'
};

const ACT_TAGS = {
  move: 'MOV', standstill: 'STN', dash: 'DSH', point_blank_hit: 'PNT',
  sniper_hit: 'SNI', crit: 'CRT', kill: 'KIL', multikill: 'MLT',
  close_call: 'EVN', damage_taken: 'DMG', heal: 'HEL', wave_clear: 'WAV',
  swarmer_hit: 'SWR', tank_hit: 'TNK', ranger_hit: 'RNG', stalker_hit: 'STK',
  mortar_hit: 'MOR', boss_hit: 'BOS'
};

const STAT_TAGS = {
  moveSpeed: 'SPD', damage: 'DMG', attackSpeed: 'ATK', critChance: 'CRT',
  armor: 'ARM', maxHp: 'HP+', dashDistance: 'DSH', dashCooldown: 'DCD',
  targetRange: 'RNG', healPower: 'HEL'
};

const SEMANTIC_RULES = {
  // 1. Movement & Positioning Dynamics (Calibrated thresholds)
  move: {
    name: 'Kinetic Stride', tier: 'common', threshold: 100,
    buff: { stat: 'moveSpeed', base: 0.5, unit: '%', label: 'скорость движения' },
    debuff: { stat: 'targetRange', base: 1.6, unit: '%', label: 'сужение сектора при беге' }
  },
  'move→move': {
    name: 'Continuous Momentum', tier: 'common', threshold: 70,
    buff: { stat: 'moveSpeed', base: 0.7, unit: '%', label: 'разгон скорости' },
    debuff: { stat: 'armor', base: 0.7, unit: '', label: 'инерционная уязвимость' }
  },
  standstill: {
    name: 'Siege Protocol', tier: 'uncommon', threshold: 30,
    buff: { stat: 'damage', base: 2.5, unit: '%', label: 'осадный урон' },
    debuff: { stat: 'moveSpeed', base: 1.4, unit: '%', label: 'инерция старта' }
  },
  'standstill→standstill': {
    name: 'Fortified Bunker', tier: 'uncommon', threshold: 22,
    buff: { stat: 'armor', base: 1.2, unit: '', label: 'укрепление брони' },
    debuff: { stat: 'moveSpeed', base: 2.0, unit: '%', label: 'фиксация в грунте' }
  },
  dash: {
    name: 'Slipstream Step', tier: 'uncommon', threshold: 30,
    buff: { stat: 'dashDistance', base: 2.5, unit: '%', label: 'дистанция рывка' },
    debuff: { stat: 'attackSpeed', base: 1.4, unit: '%', label: 'задержка прицела' }
  },
  'move→dash': {
    name: 'Vector Drift', tier: 'uncommon', threshold: 24,
    buff: { stat: 'dashCooldown', base: 2.5, unit: '%', label: 'перезарядка рывка' },
    debuff: { stat: 'damage', base: 1.4, unit: '%', label: 'перенаправление энергии' }
  },
  'dash→move': {
    name: 'Flow Recovery', tier: 'uncommon', threshold: 24,
    buff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'спринт после рывка' },
    debuff: { stat: 'healPower', base: 1.8, unit: '%', label: 'нагрузка восстановления' }
  },
  'dash→dash': {
    name: 'Phase Flicker', tier: 'rare', threshold: 16,
    buff: { stat: 'dashDistance', base: 3.5, unit: '%', label: 'серийный рывок' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'фазовая дестабилизация' }
  },

  // 2. Tactical Range & Combat Positioning
  point_blank_hit: {
    name: 'Point Blank Blast', tier: 'uncommon', threshold: 30,
    buff: { stat: 'damage', base: 3.0, unit: '%', label: 'контактный урон' },
    debuff: { stat: 'targetRange', base: 2.2, unit: '%', label: 'ближний фокус' }
  },
  'dash→point_blank_hit': {
    name: 'Assassin Rush', tier: 'rare', threshold: 15,
    buff: { stat: 'damage', base: 3.8, unit: '%', label: 'урон выпада' },
    debuff: { stat: 'armor', base: 1.0, unit: '', label: 'риск ближнего боя' }
  },
  'point_blank_hit→crit': {
    name: 'Lethal Point Blank', tier: 'rare', threshold: 12,
    buff: { stat: 'critChance', base: 2.0, unit: '%', label: 'контактный крит' },
    debuff: { stat: 'dashDistance', base: 1.8, unit: '%', label: 'жесткая отдача' }
  },
  sniper_hit: {
    name: 'Longshot Cadence', tier: 'uncommon', threshold: 30,
    buff: { stat: 'targetRange', base: 3.5, unit: '%', label: 'снайперский радиус' },
    debuff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'время наводки' }
  },
  'dash→sniper_hit': {
    name: 'Mobile Marksman', tier: 'rare', threshold: 15,
    buff: { stat: 'targetRange', base: 4.0, unit: '%', label: 'снайперский рывок' },
    debuff: { stat: 'attackSpeed', base: 1.8, unit: '%', label: 'калибровка в движении' }
  },
  'standstill→sniper_hit': {
    name: 'Turret Overwatch', tier: 'rare', threshold: 14,
    buff: { stat: 'targetRange', base: 4.5, unit: '%', label: 'дальнобойная стойка' },
    debuff: { stat: 'moveSpeed', base: 1.6, unit: '%', label: 'неподвижность' }
  },
  'sniper_hit→crit': {
    name: 'Precision Caliber', tier: 'rare', threshold: 12,
    buff: { stat: 'critChance', base: 2.2, unit: '%', label: 'снайперский крит' },
    debuff: { stat: 'moveSpeed', base: 0.5, unit: '%', label: 'фиксация цели' }
  },
  'sniper_hit→kill': {
    name: 'Longshot Execution', tier: 'rare', threshold: 12,
    buff: { stat: 'critChance', base: 2.0, unit: '%', label: 'шанс крита снайпера' },
    debuff: { stat: 'attackSpeed', base: 1.2, unit: '%', label: 'позиционная перезарядка' }
  },

  // 3. Crits, Evasion & Killstreaks
  crit: {
    name: 'Lethal Exposure', tier: 'uncommon', threshold: 25,
    buff: { stat: 'critChance', base: 1.2, unit: '%', label: 'шанс крита' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'агрессивная стойка' }
  },
  'crit→kill': {
    name: 'Fatal Impact', tier: 'rare', threshold: 15,
    buff: { stat: 'damage', base: 3.2, unit: '%', label: 'добивающий урон' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'боевой раж' }
  },
  close_call: {
    name: 'Adrenaline Reflex', tier: 'uncommon', threshold: 18,
    buff: { stat: 'moveSpeed', base: 0.8, unit: '%', label: 'адреналиновая скорость' },
    debuff: { stat: 'damage', base: 1.4, unit: '%', label: 'уход в оборону' }
  },
  'close_call→dash': {
    name: 'Hyper Reflex', tier: 'rare', threshold: 10,
    buff: { stat: 'dashDistance', base: 3.5, unit: '%', label: 'сверхрывок' },
    debuff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'сбив прицела' }
  },
  'close_call→sniper_hit': {
    name: 'Evasive Return', tier: 'rare', threshold: 10,
    buff: { stat: 'targetRange', base: 3.8, unit: '%', label: 'ответный выстрел' },
    debuff: { stat: 'damage', base: 1.2, unit: '%', label: 'беглая наводка' }
  },
  kill: {
    name: 'Soul Siphon', tier: 'uncommon', threshold: 35,
    buff: { stat: 'healPower', base: 1.8, unit: '%', label: 'вампиризм лечения' },
    debuff: { stat: 'targetRange', base: 1.4, unit: '%', label: 'сбор эссенции' }
  },
  'kill→kill': {
    name: 'Chain Extermination', tier: 'rare', threshold: 20,
    buff: { stat: 'damage', base: 2.4, unit: '%', label: 'урон серии' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'боевой раж' }
  },
  'kill→multikill': {
    name: 'Rampage Surge', tier: 'rare', threshold: 12,
    buff: { stat: 'attackSpeed', base: 2.6, unit: '%', label: 'шквальный темп' },
    debuff: { stat: 'dashDistance', base: 1.8, unit: '%', label: 'фиксация в секторе' }
  },
  multikill: {
    name: 'Rampage Catalyst', tier: 'rare', threshold: 15,
    buff: { stat: 'attackSpeed', base: 2.4, unit: '%', label: 'боевой раж' },
    debuff: { stat: 'dashDistance', base: 2.0, unit: '%', label: 'фиксация в зоне' }
  },

  // 4. Damage Received & Counter-Attacks
  damage_taken: {
    name: 'Iron Conditioning', tier: 'uncommon', threshold: 22,
    buff: { stat: 'armor', base: 1.0, unit: '', label: 'динамическая броня' },
    debuff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'контузия' }
  },
  'damage_taken→damage_taken': {
    name: 'Indomitable Hull', tier: 'rare', threshold: 12,
    buff: { stat: 'maxHp', base: 3.5, unit: '', label: 'закалка корпуса (+HP)' },
    debuff: { stat: 'dashCooldown', base: 2.0, unit: '%', label: 'деформация систем' }
  },
  'damage_taken→heal': {
    name: 'Vampiric Rebound', tier: 'rare', threshold: 10,
    buff: { stat: 'healPower', base: 3.0, unit: '%', label: 'эффективность лечения' },
    debuff: { stat: 'damage', base: 1.8, unit: '%', label: 'защитная регенерация' }
  },
  'damage_taken→kill': {
    name: 'Vengeful Retaliation', tier: 'rare', threshold: 10,
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'урон возмездия' },
    debuff: { stat: 'armor', base: 1.2, unit: '', label: 'ярость берсерка' }
  },
  heal: {
    name: 'Recovery Loop', tier: 'uncommon', threshold: 12,
    buff: { stat: 'healPower', base: 2.5, unit: '%', label: 'сила лечения' },
    debuff: { stat: 'dashDistance', base: 1.6, unit: '%', label: 'регенеративный транс' }
  },

  // 5. Enemy Specific Adaptations
  swarmer_hit: {
    name: 'Swarmer Shredder', tier: 'uncommon', threshold: 45,
    buff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'темп против роя' },
    debuff: { stat: 'targetRange', base: 1.2, unit: '%', label: 'рассеивание огня' }
  },
  ranger_hit: {
    name: 'Counter-Sniper', tier: 'uncommon', threshold: 30,
    buff: { stat: 'targetRange', base: 2.5, unit: '%', label: 'дальность против стрелков' },
    debuff: { stat: 'dashDistance', base: 1.4, unit: '%', label: 'контр-батарейная стойка' }
  },
  tank_hit: {
    name: 'Armor Piercer', tier: 'uncommon', threshold: 24,
    buff: { stat: 'damage', base: 2.8, unit: '%', label: 'бронебойный урон' },
    debuff: { stat: 'attackSpeed', base: 1.2, unit: '%', label: 'тяжелый калибр' }
  },
  stalker_hit: {
    name: 'Interceptor Edge', tier: 'uncommon', threshold: 24,
    buff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'скорость перехвата' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'риск маневра' }
  },
  mortar_hit: {
    name: 'Artillery Breaker', tier: 'uncommon', threshold: 18,
    buff: { stat: 'dashCooldown', base: 2.2, unit: '%', label: 'кд рывка от залпов' },
    debuff: { stat: 'targetRange', base: 1.2, unit: '%', label: 'уклонение от мин' }
  },
  boss_hit: {
    name: 'Titan Slayer', tier: 'rare', threshold: 18,
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'урон по титанам' },
    debuff: { stat: 'attackSpeed', base: 1.0, unit: '%', label: 'сосредоточенный удар' }
  },
  wave_clear: {
    name: 'Floor Architect', tier: 'rare', threshold: 2,
    buff: { stat: 'maxHp', base: 3.0, unit: '', label: 'max HP' },
    debuff: { stat: 'moveSpeed', base: 0.4, unit: '%', label: 'наращивание бронелистов' }
  },

  // 6. High-Order Mastery Combos
  'dash→point_blank_hit→kill': {
    name: 'Shadow Executioner', tier: 'legendary', threshold: 8,
    buff: { stat: 'damage', base: 4.8, unit: '%', label: 'смертоносный выпад' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'риск ближнего контакта' }
  },
  'close_call→dash→point_blank_hit': {
    name: 'Counter-Strike Rush', tier: 'legendary', threshold: 6,
    buff: { stat: 'damage', base: 4.5, unit: '%', label: 'контратака в упор' },
    debuff: { stat: 'dashDistance', base: 1.2, unit: '%', label: 'резкое торможение' }
  },
  'close_call→dash→sniper_hit': {
    name: 'Evasive Marksman', tier: 'legendary', threshold: 6,
    buff: { stat: 'critChance', base: 2.4, unit: '%', label: 'контратакующий крит' },
    debuff: { stat: 'moveSpeed', base: 0.4, unit: '%', label: 'снайперская стойка' }
  },
  'point_blank_hit→crit→kill': {
    name: 'Executioner Core', tier: 'legendary', threshold: 6,
    buff: { stat: 'damage', base: 5.0, unit: '%', label: 'казнящий контакт' },
    debuff: { stat: 'targetRange', base: 1.5, unit: '%', label: 'ближний туннель' }
  },
  'sniper_hit→crit→multikill': {
    name: 'Cascade Annihilation', tier: 'legendary', threshold: 6,
    buff: { stat: 'attackSpeed', base: 3.2, unit: '%', label: 'каскадный шквал' },
    debuff: { stat: 'damage', base: 1.2, unit: '%', label: 'нагрев орудий' }
  },
  'damage_taken→dash→heal': {
    name: 'Phoenix Resurgence', tier: 'legendary', threshold: 6,
    buff: { stat: 'healPower', base: 4.0, unit: '%', label: 'аварийное восстановление' },
    debuff: { stat: 'targetRange', base: 1.0, unit: '%', label: 'фокус на защите' }
  }
};

const hashString = value => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 7) >>> 0;

// Sub-exponential level curve without free jumps
const calcLevel = (observations, threshold) => {
  if (!observations || observations < threshold) return 0;
  const ratio = observations / threshold;
  const lvl = Math.floor(Math.pow(ratio, 0.42));
  return Math.max(1, Math.min(10, lvl));
};

const tierStart = (threshold, level) => {
  if (level <= 1) return threshold;
  return threshold * Math.pow(level, 1 / 0.42);
};

const tierNext = (threshold, level) => {
  return threshold * Math.pow(level + 1, 1 / 0.42);
};

const calcBuffValue = (base, level) => base * Math.pow(Math.max(1, level), 0.50);
const calcDebuffValue = (debuffRule, level) => (!debuffRule || !debuffRule.base) ? 0 : debuffRule.base * Math.pow(Math.max(1, level), 0.45);

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

    // Thresholds: In Fast Mode, thresholds are reduced 4.5x for rapid arcade progression
    const threshold = this.mode === 'fast' ? Math.max(2, Math.round(rule.threshold / 4.5)) : rule.threshold;
    const level = calcLevel(source.observations, threshold);

    const start = tierStart(threshold, level);
    const next = tierNext(threshold, level);
    const progress = level >= 10 ? 1.0 : Math.max(0, Math.min(1, (source.observations - start) / Math.max(1, next - start)));

    let contextBonus = 1.0;
    let affixCode = '';
    if (context.isLowHp && (rule.buff.stat === 'moveSpeed' || rule.buff.stat === 'armor' || rule.buff.stat === 'healPower')) {
      contextBonus = 1.15;
      affixCode = 'ADR';
    } else if (context.isFlawless && (rule.buff.stat === 'damage' || rule.buff.stat === 'attackSpeed' || rule.buff.stat === 'critChance')) {
      contextBonus = 1.12;
      affixCode = 'OVR';
    } else if (context.isBossActive && (rule.buff.stat === 'damage' || rule.buff.stat === 'targetRange')) {
      contextBonus = 1.15;
      affixCode = 'SLY';
    }

    const buffVal = calcBuffValue(rule.buff.base * contextBonus, level);
    const debuffVal = calcDebuffValue(rule.debuff, level);

    let morphedName = rule.name + (affixCode ? ` [${affixCode}]` : '');
    if (level >= 6) morphedName = `Mastered ${morphedName}`;
    else if (level >= 3) morphedName = `Enhanced ${morphedName}`;

    // Cyber Trait Hash Generator (Encodes action, buff, debuff, tier, level, and affix)
    const actParts = pattern.split('→');
    const actCode = actParts.map(p => ACT_TAGS[p] || p.slice(0, 3).toUpperCase()).join('+');
    const bTag = STAT_TAGS[rule.buff.stat] || 'GEN';
    const dTag = (debuffVal > 0 && rule.debuff) ? (STAT_TAGS[rule.debuff.stat] || 'GEN') : 'CLR';
    const tierCode = tier === 'common' ? 'T1' : (tier === 'uncommon' ? 'T2' : (tier === 'rare' ? 'T3' : 'T4'));
    const affixSuffix = affixCode ? ` [${affixCode}]` : '';
    const traitHash = `#${actCode} ${bTag}:${dTag}-${tierCode}·L${level}${affixSuffix}`;

    const sourceLabel = pattern.split('→').map(a => EVENT_LABELS[a] || a).join(' → ');
    const seed = hashString(`${this.seed}:${pattern}`);

    const debuffText = debuffVal > 0 && rule.debuff
      ? `-${debuffVal.toFixed(1)}${rule.debuff.unit} ${rule.debuff.label}`
      : 'Без штрафов';

    return {
      id: `skill_${seed.toString(16)}`,
      name: morphedName,
      traitHash,
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
      formula: `+${buffVal.toFixed(1)}${rule.buff.unit} | -${debuffVal.toFixed(1)}${rule.debuff ? rule.debuff.unit : ''}`,
      buffEffect: { stat: rule.buff.stat, value: buffVal, unit: rule.buff.unit, label: rule.buff.label },
      debuffEffect: (debuffVal > 0 && rule.debuff) ? { stat: rule.debuff.stat, value: debuffVal, unit: rule.debuff.unit, label: rule.debuff.label } : null,
      context
    };
  }

  fallbackRule(pattern) {
    const parts = pattern.split('→');
    const comboLength = parts.length;
    const tier = comboLength >= 3 ? 'legendary' : (comboLength === 2 ? 'rare' : 'uncommon');

    if (parts.some(p => p === 'move' || p === 'dash' || p === 'close_call')) {
      const baseStat = parts.includes('dash') ? 'dashDistance' : 'moveSpeed';
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Combo`,
        tier,
        threshold: comboLength >= 3 ? 8 : (comboLength === 2 ? 18 : 28),
        buff: { stat: baseStat, base: baseStat === 'moveSpeed' ? 0.6 * comboLength : 2.2 * comboLength, unit: '%', label: 'маневренность' },
        debuff: { stat: 'armor', base: 0.5 * comboLength, unit: '', label: 'инерция' }
      };
    }

    if (parts.some(p => p === 'crit' || p === 'sniper_hit')) {
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Precision`,
        tier,
        threshold: comboLength >= 3 ? 8 : (comboLength === 2 ? 16 : 24),
        buff: { stat: 'critChance', base: 1.2 * comboLength, unit: '%', label: 'точность' },
        debuff: { stat: 'dashDistance', base: 1.4 * comboLength, unit: '%', label: 'позиция' }
      };
    }

    return {
      name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Mastery`,
      tier,
      threshold: comboLength >= 3 ? 8 : (comboLength === 2 ? 14 : 22),
      buff: { stat: 'damage', base: 2.0 * comboLength, unit: '%', label: 'урон' },
      debuff: { stat: 'moveSpeed', base: 0.5 * comboLength, unit: '%', label: 'отдача' }
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
    if (stat === 'moveSpeed') {
      total = (total > 0) ? (30.0 * Math.tanh(total / 30.0)) : (-25.0 * Math.tanh(Math.abs(total) / 25.0));
    } else if (stat === 'damage') {
      total = (total > 0) ? (50.0 * Math.tanh(total / 50.0)) : (-40.0 * Math.tanh(Math.abs(total) / 40.0));
    } else if (stat === 'attackSpeed') {
      total = (total > 0) ? (45.0 * Math.tanh(total / 45.0)) : (-35.0 * Math.tanh(Math.abs(total) / 35.0));
    } else if (stat === 'dashDistance') {
      total = (total > 0) ? (40.0 * Math.tanh(total / 40.0)) : (-35.0 * Math.tanh(Math.abs(total) / 35.0));
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
