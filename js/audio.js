// Blox Strike - Procedural Web Audio Synthesizer
// Zero external audio files required; crisp arcade FPS & Roblox-inspired SFX.

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.volume = 0.6;
      this.muted = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      // Pre-build 1.5s white noise buffer for gunshots/explosions
      const length = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    }

    setMuted(m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    }

    _noise(duration, filterType, freq, q, gainStart, gainEnd = 0.001, delay = 0) {
      if (!this.ctx || !this.noiseBuffer) return;
      const t = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freq, t);
      filter.Q.value = q;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, gainStart), t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), t + duration);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.master);

      src.start(t);
      src.stop(t + duration + 0.02);
    }

    _tone(type, fStart, fEnd, duration, gainStart, gainEnd = 0.001, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(fStart, t);
      if (fEnd !== fStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + duration);
      }
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, gainStart), t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), t + duration);

      osc.connect(g);
      g.connect(this.master);

      osc.start(t);
      osc.stop(t + duration + 0.02);
    }

    playShoot(weaponId, distScale = 1.0) {
      if (!this.ctx || distScale <= 0.03) return;
      const s = Math.min(1, distScale);
      switch (weaponId) {
        case 'ar':
          this._noise(0.09, 'bandpass', 1400, 1.1, 0.38 * s);
          this._tone('sawtooth', 190, 58, 0.08, 0.28 * s);
          break;
        case 'smg':
          this._noise(0.06, 'bandpass', 2100, 1.4, 0.28 * s);
          this._tone('square', 270, 95, 0.055, 0.18 * s);
          break;
        case 'shotgun':
          this._noise(0.22, 'lowpass', 900, 0.8, 0.65 * s);
          this._noise(0.14, 'bandpass', 2200, 1.0, 0.32 * s);
          this._tone('triangle', 140, 36, 0.2, 0.45 * s);
          break;
        case 'sniper':
          this._tone('sawtooth', 880, 120, 0.26, 0.34 * s);
          this._tone('sine', 1600, 320, 0.2, 0.2 * s);
          this._noise(0.24, 'bandpass', 1900, 1.6, 0.42 * s);
          break;
        case 'rocket':
          this._noise(0.32, 'lowpass', 650, 0.9, 0.48 * s);
          this._tone('sawtooth', 150, 48, 0.28, 0.35 * s);
          break;
        case 'blade':
          this._noise(0.11, 'highpass', 2600, 1.8, 0.28 * s);
          this._tone('sine', 640, 210, 0.12, 0.24 * s);
          break;
        default:
          this._noise(0.09, 'bandpass', 1400, 1.0, 0.3 * s);
      }
    }

    playExplosion(distScale = 1.0) {
      if (!this.ctx || distScale <= 0.03) return;
      const s = Math.min(1, distScale);
      this._noise(0.55, 'lowpass', 420, 0.7, 0.8 * s);
      this._tone('sine', 115, 24, 0.48, 0.65 * s);
      this._noise(0.25, 'bandpass', 1200, 1.1, 0.3 * s);
    }

    playHitmarker(isHeadshot = false) {
      if (!this.ctx) return;
      if (isHeadshot) {
        // Crisp bell + double tick for headshot!
        this._tone('triangle', 1680, 2240, 0.075, 0.32);
        this._tone('sine', 2480, 2480, 0.12, 0.22, 0.001, 0.03);
      } else {
        this._tone('triangle', 1350, 920, 0.045, 0.26);
      }
    }

    playKill(streak = 1) {
      if (!this.ctx) return;
      const base = 520 + Math.min(streak, 6) * 65;
      this._tone('triangle', base, base * 1.25, 0.11, 0.25);
      this._tone('sine', base * 1.5, base * 1.5, 0.18, 0.2, 0.001, 0.06);
    }

    playBlockShatter(distScale = 1.0) {
      if (!this.ctx || distScale <= 0.05) return;
      const s = Math.min(1, distScale);
      // Playful blocky clatter pop!
      this._tone('square', 340, 110, 0.11, 0.2 * s);
      this._tone('triangle', 560, 220, 0.08, 0.14 * s, 0.001, 0.05);
      this._noise(0.12, 'bandpass', 2500, 2.0, 0.18 * s, 0.001, 0.02);
    }

    playHurt() {
      if (!this.ctx) return;
      this._tone('sawtooth', 180, 72, 0.14, 0.28);
      this._noise(0.1, 'lowpass', 700, 1.0, 0.22);
    }

    playReload() {
      if (!this.ctx) return;
      this._tone('square', 520, 420, 0.04, 0.12);
      this._tone('square', 720, 960, 0.05, 0.14, 0.001, 0.14);
    }

    playJumpPad() {
      if (!this.ctx) return;
      this._tone('sine', 220, 920, 0.26, 0.3);
      this._tone('triangle', 330, 1180, 0.22, 0.16, 0.001, 0.03);
    }

    playDash() {
      if (!this.ctx) return;
      this._noise(0.14, 'bandpass', 1800, 0.9, 0.24);
      this._tone('sine', 420, 190, 0.12, 0.16);
    }

    playPickup(type) {
      if (!this.ctx) return;
      const notes =
        type === 'shield'
          ? [523, 659, 880]
          : type === 'speed'
          ? [587, 784, 1174]
          : [440, 554, 659];
      notes.forEach((n, idx) => {
        this._tone('sine', n, n * 1.02, 0.12, 0.18, 0.001, idx * 0.055);
      });
    }

    playStep() {
      if (!this.ctx) return;
      this._noise(0.035, 'lowpass', 480, 1.0, 0.06);
    }

    playUiClick() {
      if (!this.ctx) return;
      this._tone('sine', 760, 520, 0.045, 0.12);
    }

    playWeaponSwitch() {
      if (!this.ctx) return;
      this._noise(0.03, 'bandpass', 2400, 2.0, 0.12);
      this._tone('triangle', 460, 680, 0.05, 0.14);
    }

    playLevelUp() {
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        this._tone('triangle', n, n * 1.03, 0.16, 0.22, 0.001, idx * 0.065);
      });
    }

    playBountyClaim() {
      if (!this.ctx) return;
      const notes = [659.25, 880, 1174.66, 1318.5];
      notes.forEach((n, idx) => {
        this._tone('sine', n, n * 1.02, 0.15, 0.24, 0.001, idx * 0.055);
      });
    }

    playSlide() {
      if (!this.ctx) return;
      this._noise(0.24, 'bandpass', 950, 0.9, 0.22, 0.01);
      this._tone('sine', 190, 75, 0.18, 0.16);
    }

    playGrenadeThrow() {
      if (!this.ctx) return;
      this._tone('triangle', 980, 1420, 0.04, 0.14); // pin clink
      this._noise(0.11, 'highpass', 1600, 1.2, 0.2); // throw whoosh
    }

    playGrenadeBounce(distScale = 1.0) {
      if (!this.ctx || distScale <= 0.05) return;
      const s = Math.min(1, distScale);
      this._tone('triangle', 1240, 780, 0.05, 0.14 * s);
    }
  }

  BS.SoundEngine = SoundEngine;
})(window);
