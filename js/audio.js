window.SFX = (function () {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
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

  function tone(freq, dur, type = 'square', gainVal = 0.05, delay = 0) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  function slideTone(startF, endF, dur, type = 'triangle', gainVal = 0.055) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + dur);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  return {
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
    click() { tone(700, 0.04, 'triangle', 0.05); },
    buy() {
      tone(880, 0.055, 'triangle', 0.06, 0);
      tone(1174, 0.09, 'triangle', 0.06, 0.055);
    },
    jump() { slideTone(290, 620, 0.11, 'triangle', 0.06); },
    doubleJump() { slideTone(460, 920, 0.12, 'triangle', 0.065); },
    slide() { slideTone(320, 150, 0.08, 'sine', 0.05); },
    coin() { tone(1046, 0.05, 'triangle', 0.045, 0); tone(1396, 0.06, 'triangle', 0.04, 0.04); },
    bigCoin() {
      tone(987, 0.06, 'triangle', 0.06, 0);
      tone(1318, 0.06, 'triangle', 0.06, 0.05);
      tone(1568, 0.1, 'triangle', 0.06, 0.1);
    },
    heal() {
      tone(587, 0.07, 'sine', 0.07, 0);
      tone(880, 0.08, 'sine', 0.07, 0.06);
      tone(1174, 0.11, 'sine', 0.07, 0.12);
    },
    guard() {
      tone(900, 0.07, 'triangle', 0.07, 0);
      tone(1350, 0.1, 'triangle', 0.06, 0.05);
    },
    hit() {
      tone(190, 0.11, 'sawtooth', 0.08, 0);
      tone(110, 0.14, 'square', 0.07, 0.06);
    },
    seasonUp() {
      tone(523, 0.08, 'triangle', 0.06, 0);
      tone(659, 0.09, 'triangle', 0.06, 0.08);
      tone(784, 0.12, 'triangle', 0.06, 0.16);
    },
    yearUp() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, i * 0.085));
    },
    introJingle() {
      // Bright MapleStory-inspired retro pixel logo startup fanfare!
      const melody = [
        [523.25, 0.00, 0.13, 'triangle', 0.075], // C5
        [659.25, 0.11, 0.13, 'triangle', 0.075], // E5
        [783.99, 0.22, 0.13, 'triangle', 0.08],  // G5
        [987.77, 0.33, 0.15, 'triangle', 0.075], // B5
        [1046.5, 0.46, 0.38, 'triangle', 0.09],  // C6
        [523.25, 0.46, 0.38, 'sine',     0.055], // C5 harmony
        [783.99, 0.46, 0.38, 'sine',     0.05],  // G5 harmony
        [1318.5, 0.56, 0.28, 'sine',     0.045]  // E6 sparkle shimmer
      ];
      melody.forEach(([f, d, dur, t, g]) => tone(f, dur, t, g, d));
    },
    fail() {
      [392, 349, 311, 246].forEach((f, i) => tone(f, 0.15, 'sawtooth', 0.055, i * 0.11));
    }
  };
})();
