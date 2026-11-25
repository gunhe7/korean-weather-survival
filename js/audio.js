window.SFX = (function () {
  let ctx = null;
  let sfxEnabled = true;
  let bgmEnabled = true;
  let sfxVolume = 0.8;
  let bgmVolume = 0.45;

  let bgmTimer = null;
  let bgmStep = 0;
  let bgmMode = 'menu'; // 'menu' | 'run' | 'fever'
  let bgmStarted = false;
  let studioIntroPlaying = false;
  let activeStudioStop = null;

  // Reusable looping noise buffers (generated lazily once per AudioContext)
  let noiseBuffers = null;

  // Continuous Weather Ambience Engine (rain, flood, dust, gust, heat, ice_road, covid)
  let ambientMasterGain = null;
  let desiredWeather = 'clear';
  let activeWeather = 'clear';
  let ambientPaused = false;
  let activeLayer = null; // { gain, nodes, timers }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!ambientMasterGain && ctx) {
      ambientMasterGain = ctx.createGain();
      ambientMasterGain.gain.setValueAtTime(getTargetAmbientMasterGain(), ctx.currentTime);
      ambientMasterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function ensureNoiseBuffers(c) {
    if (noiseBuffers && noiseBuffers.ctx === c) return noiseBuffers;
    const sr = c.sampleRate || 44100;
    const len = Math.floor(sr * 3.0); // 3-second seamless noise loops

    const white = c.createBuffer(1, len, sr);
    const pink = c.createBuffer(1, len, sr);
    const brown = c.createBuffer(1, len, sr);

    const wData = white.getChannelData(0);
    const pData = pink.getChannelData(0);
    const bData = brown.getChannelData(0);

    // Paul Kellet pink noise filter + leaky integrator brown noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastBrown = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      wData[i] = w;

      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const pVal = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      pData[i] = Math.max(-1, Math.min(1, pVal));

      lastBrown = (lastBrown + 0.024 * w) / 1.024;
      bData[i] = Math.max(-1, Math.min(1, lastBrown * 3.2));
    }

    // Crossfade last 256 samples with start for click-free looping
    const fadeN = Math.min(256, Math.floor(len / 8));
    for (let i = 0; i < fadeN; i++) {
      const t = i / fadeN;
      const idx = len - fadeN + i;
      wData[idx] = wData[idx] * (1 - t) + wData[i] * t;
      pData[idx] = pData[idx] * (1 - t) + pData[i] * t;
      bData[idx] = bData[idx] * (1 - t) + bData[i] * t;
    }

    noiseBuffers = { ctx: c, white, pink, brown };
    return noiseBuffers;
  }

  function getTargetAmbientMasterGain() {
    if (!sfxEnabled || sfxVolume <= 0 || ambientPaused) return 0;
    if (typeof document !== 'undefined' && document.hidden) return 0;
    return sfxVolume;
  }

  function updateAmbientMasterGain(fadeSec = 0.16) {
    if (!ctx || !ambientMasterGain) return;
    const now = ctx.currentTime;
    const target = getTargetAmbientMasterGain();
    try {
      ambientMasterGain.gain.cancelScheduledValues(now);
      ambientMasterGain.gain.setValueAtTime(ambientMasterGain.gain.value, now);
      ambientMasterGain.gain.linearRampToValueAtTime(target, now + fadeSec);
    } catch {}
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

  function slideTone(startF, endF, dur, type = 'triangle', gainVal = 0.055, delay = 0) {
    if (!sfxEnabled || sfxVolume <= 0) return;
    const c = ensure();
    if (!c) return;
    const vol = gainVal * sfxVolume;
    if (vol <= 0.0005) return;

    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startF), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endF), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  // One-shot filtered noise burst for weather cues, thunder, wind gusts, water splash, gear tactile feedback
  function playNoiseBurst(opts = {}) {
    if (!sfxEnabled || sfxVolume <= 0) return;
    const c = ensure();
    if (!c) return;
    const bufs = ensureNoiseBuffers(c);
    const buf = bufs[opts.bufType || 'pink'] || bufs.pink;
    const dur = Math.max(0.04, opts.dur || 0.35);
    const delay = Math.max(0, opts.delay || 0);
    const attack = Math.min(dur * 0.45, Math.max(0.008, opts.attack || 0.03));
    const onAmbBus = Boolean(opts.useAmbientBus && ambientMasterGain);
    const vol = onAmbBus ? (opts.gainVal || 0.14) : (opts.gainVal || 0.14) * sfxVolume;
    if (vol <= 0.0005) return;

    const now = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    const fStart = Math.max(40, opts.startFreq || 800);
    const fMid = opts.midFreq ? Math.max(40, opts.midFreq) : null;
    const fEnd = Math.max(40, opts.endFreq || fStart);
    filter.frequency.setValueAtTime(fStart, now);
    if (fMid) {
      filter.frequency.exponentialRampToValueAtTime(fMid, now + dur * 0.42);
      filter.frequency.exponentialRampToValueAtTime(fEnd, now + dur);
    } else if (fEnd !== fStart) {
      filter.frequency.exponentialRampToValueAtTime(fEnd, now + dur);
    }
    if (typeof opts.Q === 'number') filter.Q.setValueAtTime(opts.Q, now);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(onAmbBus ? ambientMasterGain : c.destination);

    const offset = Math.random() * Math.max(0.1, buf.duration - 0.2);
    src.start(now, offset);
    src.stop(now + dur + 0.03);
  }

  // Authentic Korean Summer Cicada ("매미" 맴-맴-맴-맴~) phrase!
  function playCicadaBurst(delay = 0, dur = 1.45, gainScale = 1.0) {
    if (!sfxEnabled || sfxVolume <= 0 || ambientPaused) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const c = ensure();
    if (!c || !ambientMasterGain) return;
    const bufs = ensureNoiseBuffers(c);
    const baseGain = 0.038 * gainScale;
    if (baseGain <= 0.0005) return;

    const now = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = bufs.white;
    src.loop = true;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4450, now);
    bp.Q.setValueAtTime(6.0, now);

    const toneOsc = c.createOscillator();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(4380, now);
    const toneMix = c.createGain();
    toneMix.gain.setValueAtTime(0.28, now);

    // Classic cicada amplitude pulse (~14.5Hz "맴-맴-맴-맴")
    const pulseGain = c.createGain();
    pulseGain.gain.setValueAtTime(0.55, now);
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14.5, now);
    const lfoDepth = c.createGain();
    lfoDepth.gain.setValueAtTime(0.45, now);
    lfo.connect(lfoDepth);
    lfoDepth.connect(pulseGain.gain);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0005, now);
    env.gain.linearRampToValueAtTime(baseGain, now + 0.22);
    env.gain.setValueAtTime(baseGain * 0.92, now + Math.max(0.26, dur - 0.36));
    env.gain.exponentialRampToValueAtTime(0.0005, now + dur);

    src.connect(bp);
    bp.connect(pulseGain);
    toneOsc.connect(toneMix);
    toneMix.connect(pulseGain);
    pulseGain.connect(env);
    env.connect(ambientMasterGain);

    src.start(now, Math.random() * 1.5);
    toneOsc.start(now);
    lfo.start(now);
    src.stop(now + dur + 0.04);
    toneOsc.stop(now + dur + 0.04);
    lfo.stop(now + dur + 0.04);
  }

  // Realistic Storm Thunderclap & Rolling Distant Thunder
  function playThunderRumble(intense = false) {
    if (!sfxEnabled || sfxVolume <= 0) return;
    if (intense) {
      // Sharp lightning crack + booming rolling thunder!
      playNoiseBurst({ bufType: 'pink', dur: 0.26, filterType: 'bandpass', startFreq: 1300, endFreq: 260, Q: 0.9, gainVal: 0.26, attack: 0.01 });
      playNoiseBurst({ bufType: 'brown', dur: 1.25, delay: 0.05, filterType: 'lowpass', startFreq: 300, endFreq: 68, Q: 0.8, gainVal: 0.30, attack: 0.04 });
      slideTone(84, 34, 0.55, 'sine', 0.14, 0.02);
    } else {
      if (ambientPaused || (typeof document !== 'undefined' && document.hidden)) return;
      playNoiseBurst({ bufType: 'brown', dur: 1.1, filterType: 'lowpass', startFreq: 210, endFreq: 62, Q: 0.7, gainVal: 0.16, attack: 0.12, useAmbientBus: true });
    }
  }

  // Stop & cleanly fade out active weather ambient layer without clicking
  function stopActiveAmbient(fadeSec = 0.35) {
    if (!activeLayer) {
      activeWeather = 'clear';
      return;
    }
    const old = activeLayer;
    activeLayer = null;
    activeWeather = 'clear';

    if (old.timers) {
      old.timers.forEach((id) => clearInterval(id));
      old.timers.length = 0;
    }

    if (ctx && old.gain) {
      const now = ctx.currentTime;
      try {
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(old.gain.gain.value, now);
        old.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      } catch {}
    }

    setTimeout(() => {
      if (old.nodes) {
        old.nodes.forEach((n) => {
          try { if (typeof n.stop === 'function') n.stop(); } catch {}
          try { if (typeof n.disconnect === 'function') n.disconnect(); } catch {}
        });
      }
      try { if (old.gain) old.gain.disconnect(); } catch {}
    }, Math.ceil((fadeSec + 0.08) * 1000));
  }

  function addLoopNoise(c, bufs, bufType, filterCfg, gainVal, dest, nodes, lfoCfg = null) {
    const src = c.createBufferSource();
    src.buffer = bufs[bufType] || bufs.pink;
    src.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = filterCfg.type || 'bandpass';
    filter.frequency.setValueAtTime(filterCfg.freq || 1000, c.currentTime);
    if (typeof filterCfg.Q === 'number') filter.Q.setValueAtTime(filterCfg.Q, c.currentTime);

    const g = c.createGain();
    g.gain.setValueAtTime(gainVal, c.currentTime);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(c.currentTime, Math.random() * 1.8);
    nodes.push(src, filter, g);

    if (lfoCfg) {
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(lfoCfg.rate || 0.3, c.currentTime);
      const lfoG = c.createGain();
      lfoG.gain.setValueAtTime(lfoCfg.depth || 200, c.currentTime);
      lfo.connect(lfoG);
      if (lfoCfg.target === 'gain') {
        lfoG.connect(g.gain);
      } else {
        lfoG.connect(filter.frequency);
      }
      lfo.start(c.currentTime);
      nodes.push(lfo, lfoG);
    }
    return { src, filter, gain: g };
  }

  function startWeatherAmbientLayer(weatherId) {
    if (!weatherId || weatherId === 'clear') {
      stopActiveAmbient(0.38);
      return;
    }
    if (!sfxEnabled || sfxVolume <= 0) {
      stopActiveAmbient(0.2);
      return;
    }
    const c = ensure();
    if (!c || !ambientMasterGain) return;
    if (activeWeather === weatherId && activeLayer) {
      updateAmbientMasterGain(0.16);
      return;
    }

    stopActiveAmbient(0.32);

    const bufs = ensureNoiseBuffers(c);
    const now = c.currentTime;
    const layerGain = c.createGain();
    layerGain.gain.setValueAtTime(0.0005, now);
    layerGain.gain.linearRampToValueAtTime(1.0, now + 0.45);
    layerGain.connect(ambientMasterGain);

    const nodes = [];
    const timers = [];

    if (weatherId === 'rain') {
      // Steady natural pouring rain (warm pink patter + crisp fine raindrop hiss + gentle droplet plinks)
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 1550, Q: 0.65 }, 0.17, layerGain, nodes, { rate: 0.22, depth: 180 });
      addLoopNoise(c, bufs, 'white', { type: 'highpass', freq: 3700 }, 0.036, layerGain, nodes);
      timers.push(setInterval(() => {
        if (activeWeather !== 'rain' || ambientPaused || document.hidden || !sfxEnabled) return;
        const dropF = 780 + Math.random() * 520;
        slideTone(dropF, dropF * 0.72, 0.055, 'sine', 0.022);
      }, 540));
    } else if (weatherId === 'flood') {
      // Heavy torrential downpour + rushing floodwater + periodic distant rolling thunder
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 1320, Q: 0.55 }, 0.21, layerGain, nodes, { rate: 0.28, depth: 200 });
      addLoopNoise(c, bufs, 'brown', { type: 'lowpass', freq: 360, Q: 0.8 }, 0.22, layerGain, nodes, { rate: 0.36, depth: 95 });
      addLoopNoise(c, bufs, 'white', { type: 'highpass', freq: 3400 }, 0.044, layerGain, nodes);
      timers.push(setInterval(() => {
        if (activeWeather !== 'flood' || ambientPaused || document.hidden || !sfxEnabled) return;
        playThunderRumble(false);
      }, 4200));
    } else if (weatherId === 'dust') {
      // Gritty howling yellow dust / sandstorm wind (swept dry wind + sandy grit hiss + periodic dust gusts)
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 560, Q: 2.7 }, 0.20, layerGain, nodes, { rate: 0.27, depth: 250 });
      addLoopNoise(c, bufs, 'white', { type: 'bandpass', freq: 2450, Q: 1.5 }, 0.048, layerGain, nodes, { rate: 0.44, depth: 620 });
      timers.push(setInterval(() => {
        if (activeWeather !== 'dust' || ambientPaused || document.hidden || !sfxEnabled) return;
        playNoiseBurst({ bufType: 'pink', dur: 0.85, filterType: 'bandpass', startFreq: 380, midFreq: 960, endFreq: 420, Q: 3.0, gainVal: 0.11, attack: 0.22, useAmbientBus: true });
      }, 2500));
    } else if (weatherId === 'gust') {
      // Fierce howling typhoon gale (whistling resonant wind + deep roaring pressure surges)
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 520, Q: 4.8 }, 0.18, layerGain, nodes, { rate: 0.52, depth: 290 });
      addLoopNoise(c, bufs, 'brown', { type: 'lowpass', freq: 260, Q: 0.9 }, 0.24, layerGain, nodes, { rate: 0.38, depth: 0.08, target: 'gain' });
      timers.push(setInterval(() => {
        if (activeWeather !== 'gust' || ambientPaused || document.hidden || !sfxEnabled) return;
        playNoiseBurst({ bufType: 'pink', dur: 0.72, filterType: 'bandpass', startFreq: 260, midFreq: 1180, endFreq: 340, Q: 4.2, gainVal: 0.13, attack: 0.16, useAmbientBus: true });
      }, 2150));
    } else if (weatherId === 'heat') {
      // Scorching Korean summer afternoon: cicada waves ("매미") + soft dry breeze + subtle heat shimmer
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 960, Q: 1.1 }, 0.032, layerGain, nodes);
      const drone1 = c.createOscillator();
      const drone2 = c.createOscillator();
      drone1.type = 'sine';
      drone2.type = 'sine';
      drone1.frequency.setValueAtTime(164.81, now);
      drone2.frequency.setValueAtTime(246.94, now);
      const dGain = c.createGain();
      dGain.gain.setValueAtTime(0.014, now);
      drone1.connect(dGain);
      drone2.connect(dGain);
      dGain.connect(layerGain);
      drone1.start(now);
      drone2.start(now);
      nodes.push(drone1, drone2, dGain);

      timers.push(setInterval(() => {
        if (activeWeather !== 'heat' || ambientPaused || document.hidden || !sfxEnabled) return;
        playCicadaBurst(0, 1.55, 0.95);
      }, 2400));
    } else if (weatherId === 'ice_road') {
      // Crisp freezing Arctic wind + frosty whistle + delicate ice-crystal shimmer
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 1380, Q: 2.4 }, 0.125, layerGain, nodes, { rate: 0.31, depth: 420 });
      addLoopNoise(c, bufs, 'white', { type: 'bandpass', freq: 2950, Q: 3.4 }, 0.034, layerGain, nodes, { rate: 0.24, depth: 500 });
      timers.push(setInterval(() => {
        if (activeWeather !== 'ice_road' || ambientPaused || document.hidden || !sfxEnabled) return;
        const notes = [1975.5, 2349.3, 2637.0, 3136.0];
        const f = notes[Math.floor(Math.random() * notes.length)];
        tone(f, 0.16, 'sine', 0.022, 0);
        tone(f * 1.25, 0.18, 'sine', 0.016, 0.07);
      }, 2400));
    } else if (weatherId === 'covid') {
      // Tense bio-alert quarantine ambience + subtle radar sonar pulse
      addLoopNoise(c, bufs, 'pink', { type: 'bandpass', freq: 680, Q: 1.6 }, 0.042, layerGain, nodes);
      const hum = c.createOscillator();
      hum.type = 'sine';
      hum.frequency.setValueAtTime(92, now);
      const hGain = c.createGain();
      hGain.gain.setValueAtTime(0.024, now);
      hum.connect(hGain);
      hGain.connect(layerGain);
      hum.start(now);
      nodes.push(hum, hGain);

      timers.push(setInterval(() => {
        if (activeWeather !== 'covid' || ambientPaused || document.hidden || !sfxEnabled) return;
        tone(1046.5, 0.09, 'sine', 0.026, 0);
        tone(783.99, 0.12, 'sine', 0.020, 0.11);
      }, 1750));
    } else {
      try { layerGain.disconnect(); } catch {}
      return;
    }

    activeLayer = { gain: layerGain, nodes, timers };
    activeWeather = weatherId;
    updateAmbientMasterGain(0.18);
  }

  function setWeatherAmbient(weatherId) {
    const next = weatherId || 'clear';
    desiredWeather = next;
    if (next === 'clear') {
      stopActiveAmbient(0.38);
      return;
    }
    startWeatherAmbientLayer(next);
  }

  function setAmbientPaused(isPaused) {
    ambientPaused = Boolean(isPaused);
    if (!ambientPaused && desiredWeather !== 'clear' && sfxEnabled && sfxVolume > 0 && !activeLayer) {
      startWeatherAmbientLayer(desiredWeather);
    }
    updateAmbientMasterGain(0.16);
  }

  // Distinct One-Shot Onset Sound Effects when each Weather/Special Event begins!
  function playWeatherCue(weatherId) {
    if (!sfxEnabled || sfxVolume <= 0) return;
    if (weatherId === 'rain') {
      // Crisp falling raindrops + fresh rain curtain swell
      slideTone(1180, 820, 0.065, 'sine', 0.055, 0.00);
      slideTone(980, 680, 0.070, 'sine', 0.055, 0.07);
      slideTone(1320, 920, 0.075, 'sine', 0.050, 0.14);
      playNoiseBurst({ bufType: 'pink', dur: 0.60, delay: 0.04, filterType: 'bandpass', startFreq: 2100, endFreq: 1350, Q: 0.8, gainVal: 0.18, attack: 0.08 });
    } else if (weatherId === 'flood') {
      // Dramatic thunderclap + heavy rushing water wave
      playThunderRumble(true);
      playNoiseBurst({ bufType: 'brown', dur: 0.85, delay: 0.12, filterType: 'lowpass', startFreq: 520, endFreq: 280, Q: 0.9, gainVal: 0.22, attack: 0.12 });
    } else if (weatherId === 'dust') {
      // Swirling yellow-dust sandstorm whoosh + hazy dust warning chime
      playNoiseBurst({ bufType: 'pink', dur: 0.78, filterType: 'bandpass', startFreq: 280, midFreq: 1280, endFreq: 440, Q: 2.8, gainVal: 0.22, attack: 0.12 });
      playNoiseBurst({ bufType: 'white', dur: 0.55, delay: 0.08, filterType: 'bandpass', startFreq: 2200, endFreq: 3100, Q: 1.6, gainVal: 0.065, attack: 0.10 });
      tone(523.25, 0.10, 'triangle', 0.052, 0.02);
      tone(466.16, 0.16, 'triangle', 0.052, 0.12);
    } else if (weatherId === 'gust') {
      // Fierce roaring typhoon gust sweep + wind whistle
      playNoiseBurst({ bufType: 'pink', dur: 0.82, filterType: 'bandpass', startFreq: 190, midFreq: 1380, endFreq: 340, Q: 4.5, gainVal: 0.24, attack: 0.10 });
      playNoiseBurst({ bufType: 'brown', dur: 0.70, filterType: 'lowpass', startFreq: 320, endFreq: 160, gainVal: 0.20, attack: 0.08 });
      slideTone(320, 740, 0.24, 'sine', 0.045, 0.04);
      slideTone(740, 380, 0.28, 'sine', 0.040, 0.28);
    } else if (weatherId === 'heat') {
      // Scorching sun shimmer + unmistakable Korean summer cicada burst!
      tone(659.25, 0.14, 'sine', 0.048, 0.00);
      tone(880.00, 0.18, 'sine', 0.048, 0.06);
      tone(1174.66, 0.22, 'sine', 0.042, 0.12);
      playCicadaBurst(0.10, 1.35, 1.12);
    } else if (weatherId === 'ice_road') {
      // Sparkling frost bells + chilly winter breeze
      [1567.98, 2093.0, 2637.02, 3135.96].forEach((f, i) => tone(f, 0.15, 'sine', 0.048, i * 0.055));
      playNoiseBurst({ bufType: 'pink', dur: 0.55, delay: 0.04, filterType: 'bandpass', startFreq: 2400, endFreq: 1200, Q: 2.4, gainVal: 0.14, attack: 0.08 });
    } else if (weatherId === 'covid') {
      // Bio-alert quarantine two-tone siren
      tone(880, 0.11, 'square', 0.052, 0.00);
      tone(659.25, 0.11, 'square', 0.052, 0.12);
      tone(880, 0.11, 'square', 0.052, 0.24);
      tone(659.25, 0.15, 'square', 0.048, 0.36);
    } else if (weatherId === 'covid_rush') {
      // Urgent virus incoming klaxon (mask timing alert!)
      tone(1174.66, 0.075, 'square', 0.065, 0.00);
      tone(932.33, 0.075, 'square', 0.065, 0.085);
      tone(1174.66, 0.11, 'square', 0.070, 0.17);
    } else if (weatherId === 'hail') {
      // Crystalline falling-ice warning chime (umbrella timing alert!)
      tone(1567.98, 0.08, 'triangle', 0.062, 0.00);
      tone(1174.66, 0.08, 'triangle', 0.062, 0.085);
      tone(1760.00, 0.12, 'sine', 0.068, 0.17);
      playNoiseBurst({ bufType: 'white', dur: 0.18, delay: 0.04, filterType: 'highpass', startFreq: 3200, endFreq: 2200, gainVal: 0.06, attack: 0.02 });
    } else if (weatherId === 'clear') {
      // Gentle bright clear-sky relief chime
      tone(659.25, 0.08, 'sine', 0.040, 0.00);
      tone(880.00, 0.12, 'sine', 0.042, 0.07);
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      updateAmbientMasterGain(0.12);
    });
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
    if (!bgmEnabled || !bgmStarted || studioIntroPlaying) return;
    if (typeof window !== 'undefined' && window.StudioIntro && window.StudioIntro.isActive()) return;
    if (document.hidden || !ctx || ctx.state !== 'running') return;
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
    if (!bgmEnabled || !bgmStarted) return;
    const pat = BGM_PATTERNS[bgmMode] || BGM_PATTERNS.menu;
    bgmTimer = setInterval(tickBgm, pat.tempoMs);
  }

  function syncAmbientAfterSettingsChange() {
    if (!sfxEnabled || sfxVolume <= 0) {
      updateAmbientMasterGain(0.12);
    } else if (desiredWeather !== 'clear' && !ambientPaused) {
      if (!activeLayer) startWeatherAmbientLayer(desiredWeather);
      else updateAmbientMasterGain(0.14);
    } else {
      updateAmbientMasterGain(0.14);
    }
  }

  return {
    applySettings(opts = {}) {
      if (typeof opts.sfxOn === 'boolean') sfxEnabled = opts.sfxOn;
      if (typeof opts.bgmOn === 'boolean') bgmEnabled = opts.bgmOn;
      if (typeof opts.sfxVol === 'number') sfxVolume = Math.max(0, Math.min(1, opts.sfxVol));
      if (typeof opts.bgmVol === 'number') bgmVolume = Math.max(0, Math.min(1, opts.bgmVol));
      restartBgmTimer();
      syncAmbientAfterSettingsChange();
    },
    getSettings() {
      return { sfxOn: sfxEnabled, bgmOn: bgmEnabled, sfxVol: sfxVolume, bgmVol: bgmVolume };
    },
    toggle() {
      const next = !(sfxEnabled || bgmEnabled);
      sfxEnabled = next;
      bgmEnabled = next;
      restartBgmTimer();
      syncAmbientAfterSettingsChange();
      return next;
    },
    toggleSfx() {
      sfxEnabled = !sfxEnabled;
      syncAmbientAfterSettingsChange();
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
      if (bgmStarted) restartBgmTimer();
    },
    startBgm() {
      bgmStarted = true;
      ensure();
      restartBgmTimer();
    },
    stopBgm() {
      bgmStarted = false;
      if (bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
      }
    },
    isEnabled() {
      return sfxEnabled || bgmEnabled;
    },
    setWeatherAmbient,
    setAmbientPaused,
    playWeatherCue,
    umbrellaToggle(isOn) {
      if (isOn) {
        // Crisp umbrella open fabric pop + whoosh!
        playNoiseBurst({ bufType: 'pink', dur: 0.14, filterType: 'bandpass', startFreq: 650, endFreq: 1950, Q: 1.4, gainVal: 0.14, attack: 0.015 });
        slideTone(320, 760, 0.09, 'triangle', 0.055);
      } else {
        playNoiseBurst({ bufType: 'pink', dur: 0.11, filterType: 'bandpass', startFreq: 1500, endFreq: 520, Q: 1.4, gainVal: 0.11, attack: 0.012 });
        slideTone(620, 290, 0.075, 'triangle', 0.045);
      }
    },
    maskToggle(isOn) {
      if (isOn) {
        // Soft clean KF94 mask fit puff + lock chime
        playNoiseBurst({ bufType: 'white', dur: 0.10, filterType: 'bandpass', startFreq: 1600, endFreq: 2600, Q: 1.8, gainVal: 0.06, attack: 0.015 });
        tone(740, 0.055, 'sine', 0.05, 0);
        tone(1046, 0.065, 'sine', 0.045, 0.035);
      } else {
        slideTone(680, 420, 0.065, 'sine', 0.042);
      }
    },
    virusCharge() {
      // Menacing fast dash whoosh as the virus rockets toward the player!
      playNoiseBurst({ bufType: 'pink', dur: 0.32, filterType: 'bandpass', startFreq: 380, endFreq: 1450, Q: 3.0, gainVal: 0.17, attack: 0.03 });
      slideTone(520, 240, 0.24, 'sawtooth', 0.055);
    },
    hailDrop() {
      slideTone(1320, 420, 0.26, 'triangle', 0.062);
      playNoiseBurst({ bufType: 'white', dur: 0.24, filterType: 'bandpass', startFreq: 2600, endFreq: 1400, Q: 2.2, gainVal: 0.12, attack: 0.02 });
    },
    hailBlock() {
      // Crisp icy clink off umbrella canopy!
      tone(1480, 0.055, 'triangle', 0.072, 0.00);
      tone(2093, 0.09, 'sine', 0.062, 0.035);
      playNoiseBurst({ bufType: 'white', dur: 0.09, filterType: 'highpass', startFreq: 2800, endFreq: 4200, gainVal: 0.075, attack: 0.008 });
    },
    click() { tone(700, 0.04, 'triangle', 0.055); },
    buy() {
      tone(880, 0.055, 'triangle', 0.065, 0);
      tone(1174, 0.09, 'triangle', 0.065, 0.055);
    },
    jump() { slideTone(305, 650, 0.105, 'triangle', 0.068); },
    doubleJump() { slideTone(480, 980, 0.115, 'triangle', 0.072); },
    slide() { slideTone(340, 145, 0.075, 'sine', 0.058); },
    fastFall() { slideTone(520, 180, 0.07, 'triangle', 0.048); },
    land() { tone(138, 0.045, 'sine', 0.036, 0); },
    coin(streak = 0) {
      const mult = Math.min(1.5, 1 + Math.min(6, Math.max(0, streak)) * 0.08);
      tone(1046 * mult, 0.048, 'triangle', 0.052, 0);
      tone(1396 * mult, 0.058, 'triangle', 0.046, 0.038);
    },
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
      playNoiseBurst({ bufType: 'pink', dur: 0.22, filterType: 'bandpass', startFreq: 1600, endFreq: 340, Q: 1.5, gainVal: 0.18, attack: 0.01 });
      tone(440, 0.06, 'sawtooth', 0.085, 0);
      tone(220, 0.14, 'sawtooth', 0.085, 0.06);
      tone(140, 0.16, 'square', 0.075, 0.14);
    },
    splash() {
      playNoiseBurst({ bufType: 'pink', dur: 0.36, filterType: 'bandpass', startFreq: 1650, endFreq: 380, Q: 0.85, gainVal: 0.22, attack: 0.012 });
      slideTone(260, 110, 0.18, 'sawtooth', 0.068);
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
      playThunderRumble(true);
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
    },
    chestShake() {
      tone(220, 0.055, 'triangle', 0.075, 0);
      tone(330, 0.05, 'sine', 0.055, 0.035);
    },
    chestOpen() {
      slideTone(340, 1280, 0.22, 'triangle', 0.08);
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.13, 'triangle', 0.075, 0.12 + i * 0.055));
    },
    chestJackpot() {
      slideTone(420, 1680, 0.26, 'triangle', 0.085);
      [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.16, 'triangle', 0.085, i * 0.055 + 0.1));
    },
    wishLaunch() {
      // Genshin-style airy celestial comet whoosh + shimmering starry chime rise
      playNoiseBurst({ bufType: 'pink', dur: 0.78, filterType: 'bandpass', startFreq: 320, midFreq: 1450, endFreq: 780, Q: 1.6, gainVal: 0.16, attack: 0.14 });
      slideTone(293.66, 880, 0.62, 'sine', 0.065, 0.02);
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone(f, 0.24, 'sine', 0.05, 0.06 + i * 0.085);
      });
    },
    wishColorShift(rarity = 'rare') {
      // Mid-air meteor color transformation flare!
      if (rarity === 'mythic') {
        playNoiseBurst({ bufType: 'white', dur: 0.55, filterType: 'bandpass', startFreq: 900, midFreq: 3400, endFreq: 1800, Q: 1.8, gainVal: 0.16, attack: 0.05 });
        slideTone(440, 1760, 0.45, 'triangle', 0.085, 0);
        [659.25, 880, 1174.66, 1318.51, 1760, 2093].forEach((f, i) => tone(f, 0.28, 'triangle', 0.072, i * 0.055));
      } else if (rarity === 'legendary') {
        playNoiseBurst({ bufType: 'pink', dur: 0.5, filterType: 'bandpass', startFreq: 720, midFreq: 2600, endFreq: 1400, Q: 1.7, gainVal: 0.15, attack: 0.05 });
        slideTone(392, 1568, 0.42, 'triangle', 0.08, 0);
        [587.33, 880, 1174.66, 1567.98, 1760].forEach((f, i) => tone(f, 0.25, 'triangle', 0.068, i * 0.06));
      } else if (rarity === 'epic') {
        playNoiseBurst({ bufType: 'pink', dur: 0.42, filterType: 'bandpass', startFreq: 600, midFreq: 1950, endFreq: 1100, Q: 1.8, gainVal: 0.13, attack: 0.05 });
        slideTone(349.23, 1174.66, 0.36, 'sine', 0.07, 0);
        [523.25, 659.25, 987.77, 1318.51].forEach((f, i) => tone(f, 0.22, 'sine', 0.06, i * 0.065));
      } else {
        slideTone(330, 987.77, 0.32, 'sine', 0.055, 0);
        [523.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.18, 'sine', 0.05, i * 0.07));
      }
    },
    wishImpact(rarity = 'rare') {
      // Resonant supernova impact + heavenly reveal chord
      const isBig = rarity === 'mythic' || rarity === 'legendary';
      playNoiseBurst({ bufType: 'pink', dur: isBig ? 0.65 : 0.4, filterType: 'lowpass', startFreq: isBig ? 2400 : 1500, endFreq: 180, Q: 0.9, gainVal: isBig ? 0.22 : 0.14, attack: 0.01 });
      slideTone(isBig ? 140 : 120, 48, 0.38, 'sine', isBig ? 0.14 : 0.09, 0);
      if (rarity === 'mythic') {
        [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093, 2637.02].forEach((f, i) => {
          tone(f, 0.42, i < 4 ? 'triangle' : 'sine', 0.08, i * 0.042);
        });
      } else if (rarity === 'legendary') {
        [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => {
          tone(f, 0.36, 'triangle', 0.075, i * 0.048);
        });
      } else if (rarity === 'epic') {
        [440, 554.37, 659.25, 880, 1108.73, 1318.51].forEach((f, i) => {
          tone(f, 0.30, 'triangle', 0.07, i * 0.05);
        });
      } else {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          tone(f, 0.24, 'sine', 0.065, i * 0.052);
        });
      }
    },
    playStudioIntro(offsetSec = 0) {
      // YAGUN STUDIO 6-second cinematic intro audio (never overlaps BGM or itself!)
      if (!sfxEnabled || sfxVolume <= 0) return { started: false, stop() {} };
      const c = ensure();
      if (!c) return { started: false, stop() {} };
      if (c.state === 'suspended') {
        let resumePromise = null;
        try { resumePromise = c.resume(); } catch {}
        if (c.state === 'suspended') {
          return { started: false, resumePromise, stop() {} };
        }
      }

      if (typeof activeStudioStop === 'function') {
        try { activeStudioStop(); } catch {}
        activeStudioStop = null;
      }
      studioIntroPlaying = true;

      const now = c.currentTime;
      const off = Math.max(0, offsetSec || 0);
      const bufs = ensureNoiseBuffers(c);
      const nodes = [];

      const master = c.createGain();
      const baseVol = Math.min(1, sfxVolume * 0.85);
      master.gain.setValueAtTime(baseVol, now);
      // Smooth cinematic fadeout from 5.10s to 5.95s
      const fadeStart = Math.max(0.05, 5.10 - off);
      const fadeEnd = Math.max(fadeStart + 0.08, 5.95 - off);
      master.gain.setValueAtTime(baseVol, now + fadeStart);
      master.gain.linearRampToValueAtTime(0.0001, now + fadeEnd);
      master.connect(c.destination);
      nodes.push(master);

      const schedOsc = (type, fStart, fEnd, tAt, dur, amp, panVal = 0) => {
        const startRel = tAt - off;
        if (startRel + dur <= 0.01) return;
        const s0 = Math.max(0, startRel);
        const effDur = dur - (s0 - startRel);
        if (effDur <= 0.02) return;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(20, fStart), now + s0);
        if (fEnd && fEnd !== fStart) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), now + s0 + effDur);
        }
        g.gain.setValueAtTime(0.0001, now + s0);
        g.gain.linearRampToValueAtTime(amp, now + s0 + Math.min(0.025, effDur * 0.15));
        g.gain.exponentialRampToValueAtTime(0.0001, now + s0 + effDur);
        osc.connect(g);
        if (typeof c.createStereoPanner === 'function' && panVal !== 0) {
          const pan = c.createStereoPanner();
          pan.pan.setValueAtTime(panVal, now + s0);
          g.connect(pan);
          pan.connect(master);
          nodes.push(pan);
        } else {
          g.connect(master);
        }
        osc.start(now + s0);
        osc.stop(now + s0 + effDur + 0.04);
        nodes.push(osc, g);
      };

      const schedNoise = (bufType, filterType, fStart, fEnd, Q, tAt, dur, amp, att = 0.02) => {
        const startRel = tAt - off;
        if (startRel + dur <= 0.01) return;
        const s0 = Math.max(0, startRel);
        const effDur = dur - (s0 - startRel);
        if (effDur <= 0.02) return;
        const src = c.createBufferSource();
        src.buffer = bufs[bufType] || bufs.pink;
        src.loop = true;
        const flt = c.createBiquadFilter();
        flt.type = filterType;
        flt.Q.setValueAtTime(Q, now + s0);
        flt.frequency.setValueAtTime(Math.max(40, fStart), now + s0);
        if (fEnd && fEnd !== fStart) {
          flt.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), now + s0 + effDur);
        }
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now + s0);
        g.gain.linearRampToValueAtTime(amp, now + s0 + Math.min(att, effDur * 0.65));
        g.gain.exponentialRampToValueAtTime(0.0001, now + s0 + effDur);
        src.connect(flt);
        flt.connect(g);
        g.connect(master);
        src.start(now + s0);
        src.stop(now + s0 + effDur + 0.05);
        nodes.push(src, flt, g);
      };

      // 1. Airy Spectral Riser (0.35s -> 1.45s)
      schedNoise('pink', 'bandpass', 360, 4800, 1.4, 0.35, 1.12, 0.24, 0.92);
      schedOsc('sine', 200, 1500, 0.35, 1.10, 0.075, 0);

      // 2. Impact Boom at 1.45s (sub drop 114->44Hz, 98Hz thump, lowpass body, crisp crack)
      schedOsc('sine', 114, 44, 1.45, 1.45, 0.38, 0);
      schedOsc('sine', 98, 72, 1.45, 0.42, 0.16, 0);
      schedNoise('pink', 'lowpass', 1600, 220, 0.8, 1.45, 0.42, 0.30, 0.005);
      schedNoise('white', 'highpass', 3600, 2400, 0.9, 1.45, 0.08, 0.14, 0.002);

      // 3. Cmaj9 Crystalline Chime Arpeggio (1.47s+)
      const chimes = [
        [1046.5, 1.7, 0.068],
        [1318.5, 1.5, 0.058],
        [1568.0, 1.6, 0.062],
        [1975.5, 1.3, 0.046],
        [2093.0, 1.2, 0.048],
        [2637.0, 1.0, 0.036]
      ];
      chimes.forEach(([fq, tau, amp], idx) => {
        const t0 = 1.47 + 0.05 * idx;
        const pan = Math.sin(idx * 2.1) * 0.55;
        schedOsc('sine', fq, fq, t0, tau * 1.4, amp, pan);
        schedOsc('sine', fq * 2.76, fq * 2.76, t0, 0.38, amp * 0.22, -pan * 0.6);
      });

      // 4. Warm Stereo Cmaj9 Pad (1.42s -> 5.90s)
      const padStart = Math.max(0, 1.42 - off);
      const padDur = Math.max(0, 4.45 - Math.max(0, off - 1.42));
      if (padDur > 0.2) {
        [130.81, 196.0, 261.63, 329.63, 392.0].forEach((fq) => {
          [-1, 1].forEach((side) => {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(fq + side * (fq / 220), now + padStart);
            g.gain.setValueAtTime(0.0001, now + padStart);
            g.gain.linearRampToValueAtTime(0.024, now + padStart + 0.85);
            g.gain.setValueAtTime(0.024, now + padStart + Math.max(0.86, padDur - 0.9));
            g.gain.exponentialRampToValueAtTime(0.0001, now + padStart + padDur);
            osc.connect(g);
            if (typeof c.createStereoPanner === 'function') {
              const pan = c.createStereoPanner();
              pan.pan.setValueAtTime(side * 0.45, now + padStart);
              g.connect(pan);
              pan.connect(master);
              nodes.push(pan);
            } else {
              g.connect(master);
            }
            osc.start(now + padStart);
            osc.stop(now + padStart + padDur + 0.05);
            nodes.push(osc, g);
          });
        });
      }

      // 5. Metallic Sweep Glint (~2.25s) & Wordmark Airy Whoosh (~2.52s)
      schedOsc('sine', 2200, 4200, 2.22, 0.65, 0.032, 0);
      schedNoise('white', 'highpass', 5200, 4200, 1.0, 2.22, 0.52, 0.042, 0.22);
      schedNoise('pink', 'bandpass', 900, 4600, 1.5, 2.48, 0.56, 0.11, 0.22);

      let stopped = false;
      const clearTimer = setTimeout(() => {
        if (!stopped) studioIntroPlaying = false;
      }, Math.max(80, Math.round((6.02 - off) * 1000)));

      const stopFn = () => {
        if (stopped) return;
        stopped = true;
        studioIntroPlaying = false;
        if (activeStudioStop === stopFn) activeStudioStop = null;
        clearTimeout(clearTimer);
        try {
          const tNow = c.currentTime;
          master.gain.cancelScheduledValues(tNow);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), tNow);
          master.gain.linearRampToValueAtTime(0.0001, tNow + 0.12);
        } catch {}
        setTimeout(() => {
          nodes.forEach((nd) => {
            try { if (typeof nd.stop === 'function') nd.stop(); } catch {}
            try { if (typeof nd.disconnect === 'function') nd.disconnect(); } catch {}
          });
        }, 160);
      };
      activeStudioStop = stopFn;
      return {
        started: true,
        stop: stopFn
      };
    }
  };
})();
