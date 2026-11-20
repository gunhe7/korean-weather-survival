window.SFX = (function () {
  let ctx = null;
  let sfxEnabled = true;
  let bgmEnabled = true;
  let sfxVolume = 0.8;
  let bgmVolume = 0.45;

  let bgmTimer = null;
  let bgmStep = 0;
  let bgmMode = 'menu'; // 'menu' | 'run' | 'fever'

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freq, dur, type = 'square', gainVal = 0.05, delay = 0, isBgm = false) {
    if (isBgm) {
      if (!bgmEnabled || bgmVolume <= 0) return;
    } else {
      if (!sfxEnabled || sfxVolume <= 0) return;
    }
    const c = ensure();
    if (!c) return;
    const vol = isBgm ? gainVal * bgmVolume : gainVal * sfxVolume;
    if (vol <= 0.0005) return;

    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  function slideTone(startF, endF, dur, type = 'triangle', gainVal = 0.055) {
    if (!sfxEnabled || sfxVolume <= 0) return;
    const c = ensure();
    if (!c) return;
    const vol = gainVal * sfxVolume;
    if (vol <= 0.0005) return;

    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  // Lightweight upbeat 8-bit chiptune BGM loops (no external audio files needed!)
  const BGM_PATTERNS = {
    menu: {
      tempoMs: 260,
      lead: [523.25, 0, 659.25, 783.99, 659.25, 0, 587.33, 659.25, 523.25, 0, 440, 523.25, 587.33, 0, 392, 0],
      bass: [261.63, 0, 196, 0, 220, 0, 196, 0, 174.61, 0, 196, 0, 146.83, 0, 196, 0]
    },
    run: {
      tempoMs: 175,
      lead: [523.25, 659.25, 783.99, 659.25, 880, 783.99, 659.25, 587.33, 523.25, 587.33, 659.25, 783.99, 1046.5, 880, 783.99, 659.25],
      bass: [261.63, 261.63, 196, 196, 220, 220, 196, 196, 174.61, 174.61, 196, 196, 261.63, 220, 196, 196]
    },
    fever: {
      tempoMs: 135,
      lead: [783.99, 987.77, 1046.5, 1318.5, 1174.66, 1046.5, 987.77, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1318.5, 1174.66, 1046.5, 987.77],
      bass: [392, 392, 329.63, 329.63, 349.23, 349.23, 392, 392, 261.63, 261.63, 329.63, 329.63, 392, 440, 493.88, 392]
    }
  };

  function tickBgm() {
    if (!bgmEnabled || document.hidden || !ctx || ctx.state !== 'running') return;
    const pat = BGM_PATTERNS[bgmMode] || BGM_PATTERNS.menu;
    const idx = bgmStep % pat.lead.length;
    const leadF = pat.lead[idx];
    const bassF = pat.bass[idx];
    if (leadF > 0) tone(leadF, pat.tempoMs / 1000 * 0.78, 'triangle', 0.042, 0, true);
    if (bassF > 0) tone(bassF, pat.tempoMs / 1000 * 0.65, 'sine', 0.036, 0, true);
    bgmStep = (bgmStep + 1) % pat.lead.length;
  }

  function restartBgmTimer() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
    if (!bgmEnabled) return;
    const pat = BGM_PATTERNS[bgmMode] || BGM_PATTERNS.menu;
    bgmTimer = setInterval(tickBgm, pat.tempoMs);
  }

  return {
    applySettings(opts = {}) {
      if (typeof opts.sfxOn === 'boolean') sfxEnabled = opts.sfxOn;
      if (typeof opts.bgmOn === 'boolean') bgmEnabled = opts.bgmOn;
      if (typeof opts.sfxVol === 'number') sfxVolume = Math.max(0, Math.min(1, opts.sfxVol));
      if (typeof opts.bgmVol === 'number') bgmVolume = Math.max(0, Math.min(1, opts.bgmVol));
      restartBgmTimer();
    },
    getSettings() {
      return { sfxOn: sfxEnabled, bgmOn: bgmEnabled, sfxVol: sfxVolume, bgmVol: bgmVolume };
    },
    toggle() {
      const next = !(sfxEnabled || bgmEnabled);
      sfxEnabled = next;
      bgmEnabled = next;
      restartBgmTimer();
      return next;
    },
    toggleSfx() {
      sfxEnabled = !sfxEnabled;
      return sfxEnabled;
    },
    toggleBgm() {
      bgmEnabled = !bgmEnabled;
      if (bgmEnabled) ensure();
      restartBgmTimer();
      return bgmEnabled;
    },
    setBgmMode(mode) {
      const target = BGM_PATTERNS[mode] ? mode : 'menu';
      if (bgmMode === target && bgmTimer) return;
      bgmMode = target;
      bgmStep = 0;
      restartBgmTimer();
    },
    startBgm() {
      ensure();
      restartBgmTimer();
    },
    stopBgm() {
      if (bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
      }
    },
    isEnabled() {
      return sfxEnabled || bgmEnabled;
    },
    click() { tone(700, 0.04, 'triangle', 0.055); },
    buy() {
      tone(880, 0.055, 'triangle', 0.065, 0);
      tone(1174, 0.09, 'triangle', 0.065, 0.055);
    },
    jump() { slideTone(290, 620, 0.11, 'triangle', 0.065); },
    doubleJump() { slideTone(460, 920, 0.12, 'triangle', 0.07); },
    slide() { slideTone(320, 150, 0.08, 'sine', 0.055); },
    coin() { tone(1046, 0.05, 'triangle', 0.05, 0); tone(1396, 0.06, 'triangle', 0.045, 0.04); },
    bigCoin() {
      tone(987, 0.06, 'triangle', 0.065, 0);
      tone(1318, 0.06, 'triangle', 0.065, 0.05);
      tone(1568, 0.1, 'triangle', 0.065, 0.1);
    },
    heal() {
      tone(587, 0.07, 'sine', 0.075, 0);
      tone(880, 0.08, 'sine', 0.075, 0.06);
      tone(1174, 0.11, 'sine', 0.075, 0.12);
    },
    guard() {
      tone(900, 0.07, 'triangle', 0.075, 0);
      tone(1350, 0.1, 'triangle', 0.065, 0.05);
    },
    magnet() {
      slideTone(420, 960, 0.14, 'sine', 0.07);
      tone(1244, 0.09, 'triangle', 0.055, 0.09);
    },
    shieldUp() {
      tone(523, 0.07, 'sine', 0.07, 0);
      tone(784, 0.09, 'sine', 0.07, 0.06);
      tone(1046, 0.13, 'triangle', 0.07, 0.12);
    },
    speedBoost() {
      slideTone(340, 1180, 0.18, 'sawtooth', 0.055);
      tone(1318, 0.12, 'triangle', 0.07, 0.12);
    },
    norway() {
      [659, 880, 1174, 1318].forEach((f, i) => tone(f, 0.09, 'sine', 0.065, i * 0.055));
    },
    hit() {
      tone(190, 0.11, 'sawtooth', 0.085, 0);
      tone(110, 0.14, 'square', 0.075, 0.06);
    },
    seasonUp() {
      tone(523, 0.08, 'triangle', 0.065, 0);
      tone(659, 0.09, 'triangle', 0.065, 0.08);
      tone(784, 0.12, 'triangle', 0.065, 0.16);
    },
    yearUp() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.075, i * 0.085));
    },
    introJingle() {
      const melody = [
        [523.25, 0.00, 0.13, 'triangle', 0.08],
        [659.25, 0.11, 0.13, 'triangle', 0.08],
        [783.99, 0.22, 0.13, 'triangle', 0.085],
        [987.77, 0.33, 0.15, 'triangle', 0.08],
        [1046.5, 0.46, 0.38, 'triangle', 0.095],
        [523.25, 0.46, 0.38, 'sine',     0.06],
        [783.99, 0.46, 0.38, 'sine',     0.055],
        [1318.5, 0.56, 0.28, 'sine',     0.05]
      ];
      melody.forEach(([f, d, dur, t, g]) => tone(f, dur, t, g, d));
    },
    fail() {
      [392, 349, 311, 246].forEach((f, i) => tone(f, 0.15, 'sawtooth', 0.06, i * 0.11));
    },
    umbrellaBreak() {
      tone(440, 0.06, 'sawtooth', 0.085, 0);
      tone(220, 0.14, 'sawtooth', 0.085, 0.06);
      tone(140, 0.16, 'square', 0.075, 0.14);
    },
    splash() {
      slideTone(260, 120, 0.16, 'sawtooth', 0.075);
    },
    acChime() {
      tone(880, 0.11, 'sine', 0.075, 0);
      tone(659.25, 0.18, 'sine', 0.075, 0.11);
    },
    fakeAlert() {
      tone(740, 0.09, 'square', 0.065, 0);
      tone(587, 0.12, 'square', 0.065, 0.10);
    },
    dodge() {
      slideTone(540, 820, 0.07, 'sine', 0.042);
    },
    thunder() {
      tone(150, 0.18, 'sawtooth', 0.095, 0);
      tone(92, 0.24, 'square', 0.085, 0.07);
      tone(68, 0.28, 'sawtooth', 0.065, 0.14);
    },
    feverStart() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.11, 'triangle', 0.075, i * 0.06));
    },
    levelUp() {
      [587, 740, 880, 1174].forEach((f, i) => tone(f, 0.11, 'triangle', 0.08, i * 0.07));
    },
    reward() {
      tone(880, 0.07, 'triangle', 0.075, 0);
      tone(1174, 0.08, 'triangle', 0.075, 0.06);
      tone(1568, 0.14, 'triangle', 0.08, 0.12);
    }
  };
})();
