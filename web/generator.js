const NAME_A = ['Crimson', 'Adaptive', 'Recursive', 'Hollow', 'Vector', 'Ashen', 'Silent', 'Violet', 'Solar', 'Grave', 'Kinetic', 'Fractal'];
const NAME_B = ['Pact', 'Loop', 'Matrix', 'Protocol', 'Ritual', 'Surge', 'Instinct', 'Cascade', 'Lattice', 'Engine', 'Bloom', 'Orbit'];
const EFFECTS = [
  {stat:'damage', base:4, unit:'%', label:'урон'}, {stat:'attackSpeed', base:3, unit:'%', label:'скорость атаки'},
  {stat:'moveSpeed', base:2, unit:'%', label:'скорость движения'}, {stat:'critChance', base:2, unit:'%', label:'шанс крита'},
  {stat:'armor', base:1, unit:'', label:'броня'}, {stat:'maxHp', base:3, unit:'', label:'max HP'}, {stat:'healPower', base:2, unit:'%', label:'сила лечения'},
  {stat:'targetRange', base:6, unit:'%', label:'дальность захвата'}, {stat:'dashDistance', base:4, unit:'%', label:'дистанция dash'},
  {stat:'dashCooldown', base:3, unit:'%', label:'снижение cooldown dash'}
];
const EVENT_LABELS = {move:'движение',dash:'рывок',target_lock:'захват цели',fire:'автоогонь',hit:'попадание',crit:'крит',kill:'убийство',damage_taken:'полученный урон',heal:'лечение',wave_clear:'очистка волны',crimson_mend_roll:'roll красного моба',amber_volley:'залп рейнджера',violet_pressure:'давление танка',warden_barrage:'атака Warden'};
const hashString = value => [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 7) >>> 0;
const pick = (items, seed) => items[seed % items.length];
const softGain = (base, level) => base * Math.pow(level, .72);

export class GenerativeSkillEngine {
  constructor(seed = 184921) { this.seed = seed; this.reset(); }
  reset() { this.events = {}; this.sequences = {}; this.lastAction = null; this.skills = []; }
  record(action, meta = {}) {
    this.events[action] = (this.events[action] || 0) + 1;
    if (this.lastAction) { const sequence = `${this.lastAction}→${action}`; this.sequences[sequence] = (this.sequences[sequence] || 0) + 1; }
    this.lastAction = action;
    this.regenerate(meta);
  }
  regenerate(meta = {}) {
    const sources = [...Object.entries(this.events).map(([pattern, observations]) => ({pattern, observations, threshold: this.threshold(pattern), kind:'event'})), ...Object.entries(this.sequences).map(([pattern, observations]) => ({pattern, observations, threshold:this.threshold(pattern), kind:'sequence'}))];
    this.skills = sources.filter(source => source.observations > 0).slice(0, 36).map(source => this.buildSkill(source, meta));
  }
  threshold(pattern) { return pattern.includes('→') ? Math.max(2, pattern.length % 5 + 2) : Math.max(3, pattern.length % 7 + 3); }
  buildSkill(source, meta) {
    const seed = hashString(`${this.seed}:${source.pattern}`); const effect = EFFECTS[seed % EFFECTS.length];
    const ratio = source.observations / source.threshold; const level = Math.max(1, Math.floor(Math.pow(ratio, .74)) + 1);
    const levelStart = source.threshold * Math.pow(Math.max(0, level - 1), 1 / .74); const nextThreshold = source.threshold * Math.pow(level, 1 / .74);
    const progress = Math.max(0, Math.min(1, (source.observations - levelStart) / Math.max(1, nextThreshold - levelStart)));
    const name = `${pick(NAME_A, seed)} ${pick(NAME_B, seed >>> 3)}-${seed.toString(16).slice(-4).toUpperCase()}`;
    const sourceLabel = source.pattern.split('→').map(action => EVENT_LABELS[action] || action).join(' → ');
    const power = softGain(effect.base, level);
    return {
      id:`skill_${seed.toString(16)}`, name, pattern:source.pattern, observations:source.observations, threshold:source.threshold,
      source:`${source.kind === 'sequence' ? 'Последовательность' : 'Событие'}: ${sourceLabel}`,
      unlock:`${source.threshold} наблюдений паттерна ${source.pattern}`, growth:`floor((observations / ${source.threshold}) ^ 0.74) + 1`, level,
      progress, confidence:Math.min(99, Math.round(ratio * 100)), buff:`+${power.toFixed(1)}${effect.unit} ${effect.label}`,
      formula:`${effect.base}${effect.unit} × level^0.72`, effect:{stat:effect.stat, base:effect.base, value:power, label:effect.label}, context:meta
    };
  }
  modifier(stat) { return this.skills.filter(skill => skill.effect.stat === stat).reduce((total, skill) => total + skill.effect.value, 0); }
  snapshot() { return this.skills.map(skill => ({...skill, effect:{...skill.effect}})); }
}

export { softGain };
