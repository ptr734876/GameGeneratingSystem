// Advanced Generative Skill Engine (Version 6.0 - Unlimited Scaling & Elastic Combo Engine)
// Features: Pure Manual Aim Synthesis, Unlimited Super-Linear Leveling Curve,
// Elastic Combo Time Window, Arbitrary Chain Length, Increased Discovery Difficulty.

const EVENT_LABELS = {
  move: 'движение', standstill: 'неподвижность', dash: 'рывок',
  point_blank_hit: 'удар в упор', sniper_hit: 'дальний выстрел', crit: 'крит',
  kill: 'убийство', multikill: 'мульти-убийство', close_call: 'опасный пролет',
  damage_taken: 'полученный урон', heal: 'лечение', wave_clear: 'очистка волны',
  swarmer_hit: 'урон рою', ranger_hit: 'урон стрелку', tank_hit: 'урон танку',
  stalker_hit: 'урон сталкеру', mortar_hit: 'урон миномету', boss_hit: 'урон боссу',
  parry: 'парирование', charged_shot: 'заряженный выстрел', manual_shot: 'ручной выстрел'
};

const ACT_TAGS = {
  move: 'MOV', standstill: 'STN', dash: 'DSH', point_blank_hit: 'PNT',
  sniper_hit: 'SNI', crit: 'CRT', kill: 'KIL', multikill: 'MLT',
  close_call: 'EVN', damage_taken: 'DMG', heal: 'HEL', wave_clear: 'WAV',
  swarmer_hit: 'SWR', tank_hit: 'TNK', ranger_hit: 'RNG', stalker_hit: 'STK',
  mortar_hit: 'MOR', boss_hit: 'BOS', parry: 'PAR', charged_shot: 'CHG', manual_shot: 'MAN'
};

const STAT_TAGS = {
  moveSpeed: 'SPD', damage: 'DMG', attackSpeed: 'ATK', critChance: 'CRT',
  armor: 'ARM', maxHp: 'HP+', dashDistance: 'DSH', dashCooldown: 'DCD',
  targetRange: 'RNG', healPower: 'HEL'
};

// Increased discovery difficulty thresholds across the board
const SEMANTIC_RULES = {
  // Class D: Common basic movement (High thresholds)
  move: {
    name: 'Kinetic Stride', tier: 'common', threshold: 160, styleClass: 'D',
    buff: { stat: 'moveSpeed', base: 0.5, unit: '%', label: 'скорость движения' },
    debuff: { stat: 'targetRange', base: 1.6, unit: '%', label: 'сужение сектора при беге' }
  },


  // Class C: Tactical 1-step positioning
  standstill: {
    name: 'Siege Protocol', tier: 'uncommon', threshold: 60, styleClass: 'C',
    buff: { stat: 'damage', base: 2.5, unit: '%', label: 'осадный урон' },
    debuff: { stat: 'moveSpeed', base: 1.4, unit: '%', label: 'инерция старта' }
  },
  dash: {
    name: 'Slipstream Step', tier: 'uncommon', threshold: 60, styleClass: 'C',
    buff: { stat: 'dashDistance', base: 2.5, unit: '%', label: 'дистанция рывка' },
    debuff: { stat: 'attackSpeed', base: 1.4, unit: '%', label: 'задержка прицела' }
  },
  manual_shot: {
    name: 'Manual Reflex', tier: 'uncommon', threshold: 75, styleClass: 'C',
    buff: { stat: 'attackSpeed', base: 1.8, unit: '%', label: 'темп ручной стрельбы' },
    debuff: { stat: 'moveSpeed', base: 0.8, unit: '%', label: 'стрельба на бегу' }
  },
  point_blank_hit: {
    name: 'Point Blank Blast', tier: 'uncommon', threshold: 55, styleClass: 'C',
    buff: { stat: 'damage', base: 3.0, unit: '%', label: 'контактный урон' },
    debuff: { stat: 'targetRange', base: 2.2, unit: '%', label: 'ближний фокус' }
  },
  sniper_hit: {
    name: 'Longshot Cadence', tier: 'uncommon', threshold: 55, styleClass: 'C',
    buff: { stat: 'targetRange', base: 3.5, unit: '%', label: 'дальнобойный фокус' },
    debuff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'время наводки' }
  },
  crit: {
    name: 'Lethal Exposure', tier: 'uncommon', threshold: 45, styleClass: 'C',
    buff: { stat: 'critChance', base: 1.2, unit: '%', label: 'шанс крита' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'агрессивная стойка' }
  },
  close_call: {
    name: 'Adrenaline Reflex', tier: 'uncommon', threshold: 35, styleClass: 'C',
    buff: { stat: 'moveSpeed', base: 0.8, unit: '%', label: 'адреналиновая скорость' },
    debuff: { stat: 'damage', base: 1.4, unit: '%', label: 'уход в оборону' }
  },
  kill: {
    name: 'Soul Siphon', tier: 'uncommon', threshold: 65, styleClass: 'C',
    buff: { stat: 'healPower', base: 1.8, unit: '%', label: 'вампиризм лечения' },
    debuff: { stat: 'targetRange', base: 1.4, unit: '%', label: 'сбор эссенции' }
  },
  damage_taken: {
    name: 'Iron Conditioning', tier: 'uncommon', threshold: 40, styleClass: 'C',
    buff: { stat: 'armor', base: 1.0, unit: '', label: 'динамическая броня' },
    debuff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'контузия' }
  },
  heal: {
    name: 'Recovery Loop', tier: 'uncommon', threshold: 25, styleClass: 'C',
    buff: { stat: 'healPower', base: 2.5, unit: '%', label: 'сила лечения' },
    debuff: { stat: 'dashDistance', base: 1.6, unit: '%', label: 'регенеративный транс' }
  },
  swarmer_hit: {
    name: 'Swarmer Shredder', tier: 'uncommon', threshold: 80, styleClass: 'C',
    buff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'темп против роя' },
    debuff: { stat: 'targetRange', base: 1.2, unit: '%', label: 'рассеивание огня' }
  },
  ranger_hit: {
    name: 'Counter-Sniper', tier: 'uncommon', threshold: 55, styleClass: 'C',
    buff: { stat: 'targetRange', base: 2.5, unit: '%', label: 'дальность против стрелков' },
    debuff: { stat: 'dashDistance', base: 1.4, unit: '%', label: 'контр-батарейная стойка' }
  },
  tank_hit: {
    name: 'Armor Piercer', tier: 'uncommon', threshold: 45, styleClass: 'C',
    buff: { stat: 'damage', base: 2.8, unit: '%', label: 'бронебойный урон' },
    debuff: { stat: 'attackSpeed', base: 1.2, unit: '%', label: 'тяжелый калибр' }
  },
  stalker_hit: {
    name: 'Interceptor Edge', tier: 'uncommon', threshold: 45, styleClass: 'C',
    buff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'скорость перехвата' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'риск маневра' }
  },
  mortar_hit: {
    name: 'Artillery Breaker', tier: 'uncommon', threshold: 35, styleClass: 'C',
    buff: { stat: 'dashCooldown', base: 2.2, unit: '%', label: 'кд рывка от залпов' },
    debuff: { stat: 'targetRange', base: 1.2, unit: '%', label: 'уклонение от мин' }
  },

  // Class B: Tactical 2-step combos

  'move→dash': {
    name: 'Vector Drift', tier: 'uncommon', threshold: 48, styleClass: 'B',
    buff: { stat: 'dashCooldown', base: 2.5, unit: '%', label: 'перезарядка рывка' },
    debuff: { stat: 'damage', base: 1.4, unit: '%', label: 'перенаправление энергии' }
  },
  'dash→move': {
    name: 'Flow Recovery', tier: 'uncommon', threshold: 48, styleClass: 'B',
    buff: { stat: 'moveSpeed', base: 0.6, unit: '%', label: 'спринт после рывка' },
    debuff: { stat: 'healPower', base: 1.8, unit: '%', label: 'нагрузка восстановления' }
  },
  'standstill→sniper_hit': {
    name: 'Turret Overwatch', tier: 'rare', threshold: 30, styleClass: 'B',
    buff: { stat: 'targetRange', base: 4.5, unit: '%', label: 'дальнобойная стойка' },
    debuff: { stat: 'moveSpeed', base: 1.6, unit: '%', label: 'неподвижность' }
  },
  'kill→multikill': {
    name: 'Rampage Surge', tier: 'rare', threshold: 25, styleClass: 'B',
    buff: { stat: 'attackSpeed', base: 2.6, unit: '%', label: 'шквальный темп' },
    debuff: { stat: 'dashDistance', base: 1.8, unit: '%', label: 'фиксация в секторе' }
  },
  multikill: {
    name: 'Rampage Catalyst', tier: 'rare', threshold: 30, styleClass: 'B',
    buff: { stat: 'attackSpeed', base: 2.4, unit: '%', label: 'боевой раж' },
    debuff: { stat: 'dashDistance', base: 2.0, unit: '%', label: 'фиксация в зоне' }
  },
  charged_shot: {
    name: 'Overcharge Blast', tier: 'uncommon', threshold: 35, styleClass: 'B',
    buff: { stat: 'damage', base: 3.8, unit: '%', label: 'сила заряда' },
    debuff: { stat: 'moveSpeed', base: 1.2, unit: '%', label: 'замедление при зарядке' }
  },

  // Class A: Rare high-skill actions & parry
  parry: {
    name: 'Deflect Matrix', tier: 'rare', threshold: 14, styleClass: 'A',
    buff: { stat: 'damage', base: 4.2, unit: '%', label: 'урон парирования' },
    debuff: { stat: 'maxHp', base: 2.0, unit: '', label: 'риск тайминга' }
  },
  boss_hit: {
    name: 'Titan Slayer', tier: 'rare', threshold: 35, styleClass: 'A',
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'урон по титанам' },
    debuff: { stat: 'attackSpeed', base: 1.0, unit: '%', label: 'сосредоточенный удар' }
  },
  wave_clear: {
    name: 'Floor Architect', tier: 'rare', threshold: 4, styleClass: 'A',
    buff: { stat: 'maxHp', base: 3.0, unit: '', label: 'max HP' },
    debuff: { stat: 'moveSpeed', base: 0.4, unit: '%', label: 'наращивание бронелистов' }
  },
  'dash→dash': {
    name: 'Phase Flicker', tier: 'rare', threshold: 32, styleClass: 'A',
    buff: { stat: 'dashDistance', base: 3.5, unit: '%', label: 'серийный рывок' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'фазовая дестабилизация' }
  },
  'point_blank_hit→crit': {
    name: 'Lethal Point Blank', tier: 'rare', threshold: 24, styleClass: 'A',
    buff: { stat: 'critChance', base: 2.0, unit: '%', label: 'контактный крит' },
    debuff: { stat: 'dashDistance', base: 1.8, unit: '%', label: 'жесткая отдача' }
  },
  'sniper_hit→crit': {
    name: 'Precision Caliber', tier: 'rare', threshold: 24, styleClass: 'A',
    buff: { stat: 'critChance', base: 2.2, unit: '%', label: 'снайперский крит' },
    debuff: { stat: 'moveSpeed', base: 0.5, unit: '%', label: 'фиксация цели' }
  },
  'sniper_hit→kill': {
    name: 'Longshot Execution', tier: 'rare', threshold: 24, styleClass: 'A',
    buff: { stat: 'critChance', base: 2.0, unit: '%', label: 'шанс крита снайпера' },
    debuff: { stat: 'attackSpeed', base: 1.2, unit: '%', label: 'позиционная перезарядка' }
  },
  'crit→kill': {
    name: 'Fatal Impact', tier: 'rare', threshold: 28, styleClass: 'A',
    buff: { stat: 'damage', base: 3.2, unit: '%', label: 'добивающий урон' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'боевой раж' }
  },
  'kill→kill': {
    name: 'Chain Extermination', tier: 'rare', threshold: 38, styleClass: 'A',
    buff: { stat: 'damage', base: 2.4, unit: '%', label: 'урон серии' },
    debuff: { stat: 'armor', base: 0.8, unit: '', label: 'боевой раж' }
  },

  'damage_taken→heal': {
    name: 'Vampiric Rebound', tier: 'rare', threshold: 20, styleClass: 'A',
    buff: { stat: 'healPower', base: 3.0, unit: '%', label: 'эффективность лечения' },
    debuff: { stat: 'damage', base: 1.8, unit: '%', label: 'защитная регенерация' }
  },
  'damage_taken→kill': {
    name: 'Vengeful Retaliation', tier: 'rare', threshold: 20, styleClass: 'A',
    buff: { stat: 'damage', base: 3.5, unit: '%', label: 'урон возмездия' },
    debuff: { stat: 'armor', base: 1.2, unit: '', label: 'ярость берсерка' }
  },

  // Class S: Precision Ripostes & Dynamic In-Combat Charges
  'parry→kill': {
    name: 'Riposte Execution', tier: 'rare', threshold: 12, styleClass: 'S',
    buff: { stat: 'critChance', base: 2.8, unit: '%', label: 'контратакующий крит' },
    debuff: { stat: 'moveSpeed', base: 0.5, unit: '%', label: 'фиксация парирования' }
  },
  'dash→parry': {
    name: 'Vanguard Deflection', tier: 'rare', threshold: 12, styleClass: 'S',
    buff: { stat: 'armor', base: 1.6, unit: '', label: 'динамический барьер' },
    debuff: { stat: 'attackSpeed', base: 1.2, unit: '%', label: 'задержка взмаха' }
  },
  'dash→charged_shot': {
    name: 'Drift Railgun', tier: 'rare', threshold: 20, styleClass: 'S',
    buff: { stat: 'damage', base: 4.5, unit: '%', label: 'залп с выката' },
    debuff: { stat: 'dashCooldown', base: 2.0, unit: '%', label: 'перегрев привода' }
  },
  'charged_shot→kill': {
    name: 'Kinetic Annihilation', tier: 'rare', threshold: 16, styleClass: 'S',
    buff: { stat: 'critChance', base: 2.5, unit: '%', label: 'шанс пробития' },
    debuff: { stat: 'attackSpeed', base: 1.4, unit: '%', label: 'пауза охлаждения' }
  },
  'dash→point_blank_hit': {
    name: 'Assassin Rush', tier: 'rare', threshold: 28, styleClass: 'S',
    buff: { stat: 'damage', base: 3.8, unit: '%', label: 'урон выпада' },
    debuff: { stat: 'armor', base: 1.0, unit: '', label: 'риск ближнего боя' }
  },
  'dash→sniper_hit': {
    name: 'Mobile Marksman', tier: 'rare', threshold: 28, styleClass: 'S',
    buff: { stat: 'targetRange', base: 4.0, unit: '%', label: 'снайперский рывок' },
    debuff: { stat: 'attackSpeed', base: 1.8, unit: '%', label: 'калибровка в движении' }
  },
  'close_call→dash': {
    name: 'Hyper Reflex', tier: 'rare', threshold: 20, styleClass: 'S',
    buff: { stat: 'dashDistance', base: 3.5, unit: '%', label: 'сверхрывок' },
    debuff: { stat: 'attackSpeed', base: 1.6, unit: '%', label: 'сбив прицела' }
  },
  'close_call→sniper_hit': {
    name: 'Evasive Return', tier: 'rare', threshold: 20, styleClass: 'S',
    buff: { stat: 'targetRange', base: 3.8, unit: '%', label: 'ответный выстрел' },
    debuff: { stat: 'damage', base: 1.2, unit: '%', label: 'беглая наводка' }
  },

  // Class SS: 3-step Mastery Combos
  'dash→point_blank_hit→kill': {
    name: 'Shadow Executioner', tier: 'legendary', threshold: 16, styleClass: 'SS',
    buff: { stat: 'damage', base: 4.8, unit: '%', label: 'смертоносный выпад' },
    debuff: { stat: 'armor', base: 0.6, unit: '', label: 'риск ближнего контакта' }
  },
  'close_call→dash→point_blank_hit': {
    name: 'Counter-Strike Rush', tier: 'legendary', threshold: 14, styleClass: 'SS',
    buff: { stat: 'damage', base: 4.5, unit: '%', label: 'контратака в упор' },
    debuff: { stat: 'dashDistance', base: 1.2, unit: '%', label: 'резкое торможение' }
  },
  'close_call→dash→sniper_hit': {
    name: 'Evasive Marksman', tier: 'legendary', threshold: 14, styleClass: 'SS',
    buff: { stat: 'critChance', base: 2.4, unit: '%', label: 'контратакующий крит' },
    debuff: { stat: 'moveSpeed', base: 0.4, unit: '%', label: 'снайперская стойка' }
  },
  'point_blank_hit→crit→kill': {
    name: 'Executioner Core', tier: 'legendary', threshold: 14, styleClass: 'SS',
    buff: { stat: 'damage', base: 5.0, unit: '%', label: 'казнящий контакт' },
    debuff: { stat: 'targetRange', base: 1.5, unit: '%', label: 'ближний туннель' }
  },
  'sniper_hit→crit→multikill': {
    name: 'Cascade Annihilation', tier: 'legendary', threshold: 14, styleClass: 'SS',
    buff: { stat: 'attackSpeed', base: 3.2, unit: '%', label: 'каскадный шквал' },
    debuff: { stat: 'damage', base: 1.2, unit: '%', label: 'нагрев орудий' }
  },
  'damage_taken→dash→heal': {
    name: 'Phoenix Resurgence', tier: 'legendary', threshold: 14, styleClass: 'SS',
    buff: { stat: 'healPower', base: 4.0, unit: '%', label: 'аварийное восстановление' },
    debuff: { stat: 'targetRange', base: 1.0, unit: '%', label: 'фокус на защите' }
  },

  // Class SSS: 4-step Ultimate Execution Chains
  'close_call→dash→point_blank_hit→kill': {
    name: 'Apex Predator Protocol', tier: 'legendary', threshold: 10, styleClass: 'SSS',
    buff: { stat: 'damage', base: 6.5, unit: '%', label: 'ультимативная казнь' },
    debuff: { stat: 'armor', base: 0.4, unit: '', label: 'сверхнагрузка' }
  },
  'close_call→dash→sniper_hit→crit': {
    name: 'Phantom Longshot Zero', tier: 'legendary', threshold: 10, styleClass: 'SSS',
    buff: { stat: 'critChance', base: 3.5, unit: '%', label: 'абсолютный крит' },
    debuff: { stat: 'moveSpeed', base: 0.3, unit: '%', label: 'снайперский ноль' }
  },
  'parry→dash→point_blank_hit→kill': {
    name: 'Vanguard Counter-Annihilation', tier: 'legendary', threshold: 8, styleClass: 'SSS',
    buff: { stat: 'damage', base: 7.0, unit: '%', label: 'парирующий разрыв' },
    debuff: { stat: 'attackSpeed', base: 1.0, unit: '%', label: 'отдача разрыва' }
  }
};

const hashString = value => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 7) >>> 0;

// Unlimited super-linear level curve: Level = 1 + floor(((ratio - 1) / 2.5) ^ (1 / 1.85))

function isValidComboSequence(pattern) {
  if (!pattern.includes('→')) return true;
  const parts = pattern.split('→');
  if (parts.length < 2) return false;

  const unique = new Set(parts);
  if (unique.size < 2) return false; // Disallow mono-action sequences

  // Movement, Damage Taken, and Standstill must be strictly unique in any combo chain
  if (parts.filter(p => p === 'move').length > 1) return false;
  if (parts.filter(p => p === 'damage_taken').length > 1) return false;
  if (parts.filter(p => p === 'standstill').length > 1) return false;
  if (parts.filter(p => p === 'heal').length > 1) return false;

  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === parts[i + 1]) {
      if (parts[i] === 'move' || parts[i] === 'damage_taken' || parts[i] === 'standstill' || parts[i] === 'heal') {
        return false;
      }
    }
  }
  return true;
}

const calcLevel = (observations, threshold) => {
  if (!observations || observations < threshold) return 0;
  const ratio = observations / threshold;
  if (ratio < 1.0) return 0;
  const excess = (ratio - 1.0) / 2.5;
  const lvl = 1 + Math.floor(Math.pow(Math.max(0, excess), 1.0 / 1.85));
  return Math.max(1, lvl);
};

const tierStart = (threshold, level) => {
  if (level <= 1) return threshold;
  return threshold * (1.0 + 2.5 * Math.pow(level - 1, 1.85));
};

const tierNext = (threshold, level) => {
  return threshold * (1.0 + 2.5 * Math.pow(level, 1.85));
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
    this.maxSlots = 18;
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
    this.discoveredSkills = [];
    this.equippedSkillIds = new Set();
  }

  isEquipped(skillId) {
    return this.equippedSkillIds.has(skillId);
  }

  equip(skillId) {
    if (this.equippedSkillIds.has(skillId)) {
      return { success: true, count: this.equippedSkillIds.size, already: true };
    }
    if (this.equippedSkillIds.size >= this.maxSlots) {
      return { success: false, reason: 'Слоты активного билда заполнены (18/18)' };
    }
    const exists = this.discoveredSkills.some(s => s.id === skillId);
    if (!exists) return { success: false, reason: 'Навык не обнаружен' };
    this.equippedSkillIds.add(skillId);
    return { success: true, count: this.equippedSkillIds.size };
  }

  record(pattern, meta = {}) {
    const isFast = (this.mode === 'fast');
    const weight = isFast ? 2 : 1;

    const isSeq = pattern.includes('→');
    if (isSeq && !isValidComboSequence(pattern)) return;
    const dict = isSeq ? this.sequences : this.events;
    const prevObs = dict[pattern] || 0;

    const rule = SEMANTIC_RULES[pattern] || this.fallbackRule(pattern);
    const threshold = this.mode === 'fast' ? Math.max(2, Math.round(rule.threshold / 2.5)) : rule.threshold;
    const seed = hashString(`${this.seed}:${pattern}`);
    const skillId = `skill_${seed.toString(16)}`;

    const isAlreadyEquipped = this.equippedSkillIds.has(skillId);

    if (prevObs < threshold || isAlreadyEquipped) {
      dict[pattern] = prevObs + weight;
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

    this.discoveredSkills = sources
      .filter(source => source.observations > 0)
      .map(source => this.buildSkill(source, context))
      .filter(skill => skill.level >= 1)
      .sort((a, b) => {
        const aEq = this.equippedSkillIds.has(a.id) ? 1 : 0;
        const bEq = this.equippedSkillIds.has(b.id) ? 1 : 0;
        if (bEq !== aEq) return bEq - aEq;
        return b.level - a.level || b.observations - a.observations;
      });
  }

  buildSkill(source, context = {}) {
    const pattern = source.pattern;
    const rule = SEMANTIC_RULES[pattern] || this.fallbackRule(pattern);
    const tier = rule.tier || 'uncommon';
    const styleClass = rule.styleClass || this.calculateStyleClass(pattern, tier);

    const threshold = this.mode === 'fast' ? Math.max(2, Math.round(rule.threshold / 2.5)) : rule.threshold;
    const level = calcLevel(source.observations, threshold);

    const start = tierStart(threshold, level);
    const next = tierNext(threshold, level);
    const progress = Math.max(0, Math.min(1, (source.observations - start) / Math.max(1, next - start)));

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

    const actParts = pattern.split('→');
    const actCode = actParts.map(p => ACT_TAGS[p] || p.slice(0, 3).toUpperCase()).join('+');
    const bTag = STAT_TAGS[rule.buff.stat] || 'GEN';
    const dTag = (debuffVal > 0 && rule.debuff) ? (STAT_TAGS[rule.debuff.stat] || 'GEN') : 'CLR';
    const affixSuffix = affixCode ? ` [${affixCode}]` : '';
    const traitHash = `#${actCode} ${bTag}:${dTag}-${styleClass}·L${level}${affixSuffix}`;

    const sourceLabel = pattern.split('→').map(a => EVENT_LABELS[a] || a).join(' → ');
    const seed = hashString(`${this.seed}:${pattern}`);
    const skillId = `skill_${seed.toString(16)}`;

    const debuffText = debuffVal > 0 && rule.debuff
      ? `-${debuffVal.toFixed(1)}${rule.debuff.unit} ${rule.debuff.label}`
      : 'Без штрафов';

    return {
      id: skillId,
      name: traitHash,
      traitHash,
      tier,
      styleClass,
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
      buffStat: bTag,
      debuffStat: dTag,
      formula: `+${buffVal.toFixed(1)}${rule.buff.unit} | -${debuffVal.toFixed(1)}${rule.debuff ? rule.debuff.unit : ''}`,
      buffEffect: { stat: rule.buff.stat, value: buffVal, unit: rule.buff.unit, label: rule.buff.label },
      debuffEffect: (debuffVal > 0 && rule.debuff) ? { stat: rule.debuff.stat, value: debuffVal, unit: rule.debuff.unit, label: rule.debuff.label } : null,
      context
    };
  }

  calculateStyleClass(pattern, tier) {
    const parts = pattern.split('→');
    const len = parts.length;
    if (len >= 5) return 'SSS+';
    if (len === 4) return 'SSS';
    if (len === 3) return 'SS';
    if (tier === 'rare') return len <= 1 ? 'A' : 'S';
    if (tier === 'uncommon') return len >= 2 ? 'B' : 'C';
    return 'D';
  }

  fallbackRule(pattern) {
    const parts = pattern.split('→');
    const comboLength = parts.length;
    const tier = comboLength >= 3 ? 'legendary' : (comboLength === 2 ? 'rare' : 'uncommon');
    const styleClass = this.calculateStyleClass(pattern, tier);

    const baseThreshold = comboLength >= 4 ? 8 : (comboLength === 3 ? 15 : (comboLength === 2 ? 35 : 55));

    if (parts.some(p => p === 'move' || p === 'dash' || p === 'close_call')) {
      const baseStat = parts.includes('dash') ? 'dashDistance' : 'moveSpeed';
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Combo`,
        tier,
        styleClass,
        threshold: baseThreshold,
        buff: { stat: baseStat, base: baseStat === 'moveSpeed' ? 0.6 * comboLength : 2.2 * comboLength, unit: '%', label: 'маневренность' },
        debuff: { stat: 'armor', base: 0.4 * comboLength, unit: '', label: 'инерция' }
      };
    }

    if (parts.some(p => p === 'crit' || p === 'sniper_hit' || p === 'charged_shot' || p === 'parry')) {
      return {
        name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Precision`,
        tier,
        styleClass,
        threshold: baseThreshold,
        buff: { stat: 'critChance', base: 1.2 * comboLength, unit: '%', label: 'точность' },
        debuff: { stat: 'dashDistance', base: 1.2 * comboLength, unit: '%', label: 'позиция' }
      };
    }

    return {
      name: `${parts.map(p => EVENT_LABELS[p] || p).join(' ')} Mastery`,
      tier,
      styleClass,
      threshold: baseThreshold,
      buff: { stat: 'damage', base: 2.0 * comboLength, unit: '%', label: 'урон' },
      debuff: { stat: 'moveSpeed', base: 0.5 * comboLength, unit: '%', label: 'отдача' }
    };
  }

  modifier(stat) {
    let total = 0;
    for (const skill of this.discoveredSkills) {
      if (!this.equippedSkillIds.has(skill.id)) continue;
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
    for (const skill of this.discoveredSkills) {
      if (!this.equippedSkillIds.has(skill.id)) continue;
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
    return this.discoveredSkills.map(s => ({
      ...s,
      isEquipped: this.equippedSkillIds.has(s.id)
    }));
  }
}
