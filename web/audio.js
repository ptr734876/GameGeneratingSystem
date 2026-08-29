// Dynamic Web Audio Engine: Procedural Cyberpunk Synthwave & Combat SFX
// Multi-layer synth bassline, snappy snare/kick drums, lush pads, and arpeggios.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.isMuted = false;
    this.musicPlaying = false;
    this.baseTempo = 126; // Hardcore BPM
    this.fastTempo = 148; // Fast Mode BPM
    this.step = 0;
    this.musicTimer = null;
    this.bossMode = false;
    this.fastMode = false;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.38, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.createNoiseBuffer();
      this.startMusic();
    } catch (e) {
      console.warn('Web Audio API initialized with warning:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
    }
    return !this.isMuted;
  }

  setFastMode(isFast) {
    this.fastMode = !!isFast;
  }

  setBossMode(isBoss) {
    this.bossMode = !!isBoss;
  }

  // --- SOUND EFFECTS (SFX) ---

  playShot() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.075);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playHit() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  playCrit() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1180, now);
    osc1.frequency.exponentialRampToValueAtTime(320, now + 0.16);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(now);
    osc1.stop(now + 0.17);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(280, now);
    osc2.frequency.exponentialRampToValueAtTime(45, now + 0.14);
    gain2.gain.setValueAtTime(0.30, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(now);
    osc2.stop(now + 0.15);
  }

  playDash() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.22);
    filter.Q.value = 3.0;

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.23);
  }

  playKill() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.10);

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  playScore() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.setValueAtTime(1760, now + 0.04);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  playHurt() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  playWaveClear() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.18, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.46);
    });
  }

  playBossSpawn() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.7);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.76);
  }

  // --- DYNAMIC CYBERPUNK MUSIC ENGINE ---

  startMusic() {
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.scheduleNextBeat();
  }

  scheduleNextBeat() {
    if (!this.musicPlaying || !this.ctx) return;

    const currentTempo = this.fastMode ? this.fastTempo : (this.bossMode ? 138 : this.baseTempo);
    const stepDuration = (60.0 / currentTempo) / 4; // 16th note step duration

    this.playMusicStep(this.step, this.ctx.currentTime, stepDuration);
    this.step = (this.step + 1) % 64; // 4-bar phrase

    this.musicTimer = setTimeout(() => {
      this.scheduleNextBeat();
    }, stepDuration * 1000);
  }

  playMusicStep(step, time, stepDuration) {
    if (this.isMuted || !this.ctx) return;

    const barStep = step % 16; // step within current bar (0-15)
    const chordIndex = Math.floor((step % 64) / 16); // 4 bars: A minor -> F major -> D minor -> E minor

    // 1. DYNAMIC DRUM GROOVE
    // Kick drum pattern: punchy electro beats on 0, 6, 10, 12 in fast mode
    const isKick = barStep === 0 || barStep === 6 || barStep === 10 || (this.fastMode && barStep === 12);
    if (isKick) {
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(this.bossMode || this.fastMode ? 170 : 140, time);
      kickOsc.frequency.exponentialRampToValueAtTime(36, time + 0.11);
      kickGain.gain.setValueAtTime(0.28, time);
      kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
      kickOsc.connect(kickGain);
      kickGain.connect(this.musicGain);
      kickOsc.start(time);
      kickOsc.stop(time + 0.12);
    }

    // Snare / Clap on beat 4 and 12 (backbeats)
    if (barStep === 4 || barStep === 12) {
      // Noise burst for snare snap
      if (this.noiseBuffer) {
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = this.noiseBuffer;
        const noiseGain = this.ctx.createGain();
        const noiseFilter = this.ctx.createBiquadFilter();

        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1100, time);

        noiseGain.gain.setValueAtTime(0.14, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.musicGain);

        noiseNode.start(time);
        noiseNode.stop(time + 0.15);
      }

      // Snare tone body
      const snareOsc = this.ctx.createOscillator();
      const snareGain = this.ctx.createGain();
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(210, time);
      snareOsc.frequency.exponentialRampToValueAtTime(90, time + 0.08);
      snareGain.gain.setValueAtTime(0.16, time);
      snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      snareOsc.connect(snareGain);
      snareGain.connect(this.musicGain);
      snareOsc.start(time);
      snareOsc.stop(time + 0.09);
    }

    // Dynamic Hi-Hat Groove (swung velocity 16ths + rolls)
    if (this.noiseBuffer) {
      const isRoll = barStep >= 14 && step % 32 >= 28; // Roll at end of phrase
      const hatVelocity = isRoll ? 0.07 : (barStep % 2 === 0 ? 0.025 : 0.055);

      const hatSource = this.ctx.createBufferSource();
      hatSource.buffer = this.noiseBuffer;
      const hatGain = this.ctx.createGain();
      const hatFilter = this.ctx.createBiquadFilter();

      hatFilter.type = 'highpass';
      hatFilter.frequency.setValueAtTime(6500, time);

      hatGain.gain.setValueAtTime(hatVelocity, time);
      hatGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      hatSource.connect(hatFilter);
      hatFilter.connect(hatGain);
      hatGain.connect(this.musicGain);

      hatSource.start(time);
      hatSource.stop(time + 0.045);
    }

    // 2. SLAPPING CYBERPUNK BASSLINE (Syncopated 16th groove)
    // Chord root notes: A1 (55Hz), F1 (43.65Hz), D1 (36.7Hz), E1 (41.2Hz)
    const roots = [55, 43.65, 36.7, 41.2];
    const root = roots[chordIndex];

    // Syncopated bass pattern: steps with pitch shifts (octaves and 5ths)
    const bassOffsets = [0, 0, 12, 0, 7, 0, 12, 0, 0, 12, 0, 7, 12, 0, 12, 10];
    const semitone = bassOffsets[barStep];
    const bassFreq = root * Math.pow(2, semitone / 12);

    if (bassOffsets[barStep] !== undefined) {
      const osc = this.ctx.createOscillator();
      const oscSub = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, time);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(bassFreq * 0.5, time);

      filter.type = 'lowpass';
      const cutoff = (this.bossMode || this.fastMode ? 1400 : 800) * (barStep % 4 === 0 ? 1.4 : 1.0);
      filter.frequency.setValueAtTime(cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(cutoff * 0.4, time + stepDuration * 0.9);
      filter.Q.value = 4.0;

      const vol = (barStep % 4 === 0 ? 0.20 : 0.14) * (this.bossMode ? 1.25 : 1.0);
      bassGain.gain.setValueAtTime(vol, time);
      bassGain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.95);

      osc.connect(filter);
      oscSub.connect(filter);
      filter.connect(bassGain);
      bassGain.connect(this.musicGain);

      osc.start(time);
      oscSub.start(time);
      osc.stop(time + stepDuration);
      oscSub.stop(time + stepDuration);
    }

    // 3. RETRO SYNTH ARPEGGIATOR & CHORD PADS
    const chordPitches = [
      [220, 261.63, 329.63, 440], // Am
      [174.61, 220, 261.63, 349.23], // F
      [146.83, 174.61, 220, 293.66], // Dm
      [164.81, 196, 246.94, 329.63]  // Em
    ];

    const currentChord = chordPitches[chordIndex];
    const arpNote = currentChord[barStep % currentChord.length];

    if (barStep % 2 === 1 || this.fastMode) {
      const arpOsc = this.ctx.createOscillator();
      const arpGain = this.ctx.createGain();
      const arpFilter = this.ctx.createBiquadFilter();

      arpOsc.type = 'sine';
      arpOsc.frequency.setValueAtTime(arpNote * (this.fastMode ? 2.0 : 1.5), time);

      arpFilter.type = 'bandpass';
      arpFilter.frequency.setValueAtTime(1600, time);
      arpFilter.Q.value = 2.5;

      arpGain.gain.setValueAtTime(this.fastMode ? 0.08 : 0.055, time);
      arpGain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 1.5);

      arpOsc.connect(arpFilter);
      arpFilter.connect(arpGain);
      arpGain.connect(this.musicGain);

      arpOsc.start(time);
      arpOsc.stop(time + stepDuration * 1.6);
    }
  }
}
