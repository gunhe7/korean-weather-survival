window.StudioIntro = (function () {
  const STUDIO_VER = '20261121hd59';
  const DUR = 6.0;
  const LW = 456.45;
  const LH = 413.95;

  // Exact connected-component metrics extracted from YAGUN STUDIO PNG (scaled 0.85x)
  const LEFT_META  = { src: `assets/studio/yagun_left.png?v=${STUDIO_VER}`,  w: 226, h: 190, rx: 15.3, ry: -5.1,  t0: 1.22, ox: -182, oy: -105 };
  const RIGHT_META = { src: `assets/studio/yagun_right.png?v=${STUDIO_VER}`, w: 359, h: 362, rx: 83.3, ry: 2.55,  t0: 1.27, ox: 162,  oy: 94 };
  const TEXT_META  = { src: `assets/studio/yagun_text.png?v=${STUDIO_VER}`,  w: 467, h: 33,  rx: -5.1, ry: 385.9 };
  const LETTERS = [
    { sx: 2,   sw: 37 },
    { sx: 42,  sw: 42 },
    { sx: 93,  sw: 33 },
    { sx: 137, sw: 34 },
    { sx: 183, sw: 35 },
    { sx: 256, sw: 28 },
    { sx: 293, sw: 28 },
    { sx: 331, sw: 30 },
    { sx: 371, sw: 30 },
    { sx: 412, sw: 12 },
    { sx: 434, sw: 30 }
  ];

  function cl(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function sst(x) { const v = cl(x); return v * v * (3 - 2 * v); }
  function eoExp(x) { const v = cl(x); return v >= 1 ? 1 : 1 - Math.pow(2, -10 * v); }
  function eoCub(x) { const v = cl(x); return 1 - Math.pow(1 - v, 3); }
  function eioCub(x) { const v = cl(x); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }

  function seededRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Bake a soft icy-blue glow offscreen canvas ONCE (zero runtime ctx.filter cost!)
  function bakeGlow(img, blurPx, tint) {
    if (!img) return null;
    const pad = Math.ceil(blurPx * 2.2);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const g = c.getContext('2d');
    // Step 1: tinted silhouette
    const sil = document.createElement('canvas');
    sil.width = w;
    sil.height = h;
    const sg = sil.getContext('2d');
    sg.drawImage(img, 0, 0, w, h);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = tint;
    sg.fillRect(0, 0, w, h);
    // Step 2: soft glow pass (use native filter if available, else multi-offset soft ring fallback)
    if ('filter' in g) {
      g.filter = `blur(${blurPx}px)`;
      g.drawImage(sil, pad, pad);
      g.filter = 'none';
    } else {
      g.globalAlpha = 0.18;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        g.drawImage(sil, pad + Math.cos(ang) * (blurPx * 0.55), pad + Math.sin(ang) * (blurPx * 0.55));
      }
      g.globalAlpha = 0.25;
      g.drawImage(sil, pad, pad);
    }
    return { canvas: c, pad };
  }

  // Bake crisp tinted silhouette for RGB chromatic aberration impact flash
  function bakeTint(img, color) {
    if (!img) return null;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    return c;
  }

  let active = false;
  let rafId = 0;
  let finishCb = null;
  let stopAudioFn = null;
  let overlayEl = null;
  let unlockTapFn = null;

  function isActive() {
    return active;
  }

  function finish(skipped = false) {
    if (!active) return;
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (overlayEl && unlockTapFn) {
      try { overlayEl.removeEventListener('pointerdown', unlockTapFn); } catch {}
      unlockTapFn = null;
    }
    if (typeof stopAudioFn === 'function') {
      try { stopAudioFn(); } catch {}
      stopAudioFn = null;
    }
    const ov = overlayEl || document.getElementById('studio-splash-overlay');
    if (ov) {
      ov.classList.add('leaving');
      setTimeout(() => {
        ov.classList.add('hidden');
        ov.classList.remove('leaving');
      }, skipped ? 180 : 320);
    }
    const cb = finishCb;
    finishCb = null;
    if (typeof cb === 'function') {
      try { cb(skipped); } catch {}
    }
  }

  function play(onComplete) {
    overlayEl = document.getElementById('studio-splash-overlay');
    const canvas = document.getElementById('studio-splash-canvas');
    if (!overlayEl || !canvas) {
      if (typeof onComplete === 'function') onComplete(false);
      return;
    }

    active = true;
    finishCb = onComplete || null;
    overlayEl.classList.remove('hidden', 'leaving');

    let audioStarted = false;
    let audioPending = false;
    let animStartMs = 0;
    function tryStartStudioAudio() {
      if (audioStarted || audioPending || !active) return;
      if (window.SFX && typeof window.SFX.playStudioIntro === 'function') {
        try {
          const elapsed = animStartMs > 0 ? Math.max(0, (performance.now() - animStartMs) / 1000) : 0;
          if (elapsed >= DUR - 0.25) return;
          const handle = window.SFX.playStudioIntro(elapsed);
          if (handle && handle.started) {
            audioStarted = true;
            stopAudioFn = handle.stop;
          } else if (handle && handle.resumePromise && typeof handle.resumePromise.then === 'function') {
            audioPending = true;
            handle.resumePromise.then(() => {
              audioPending = false;
              if (!audioStarted && active) tryStartStudioAudio();
            }).catch(() => {
              audioPending = false;
            });
          }
        } catch {
          audioPending = false;
        }
      }
    }

    // Attempt immediate audio playback; also unlock & sync on first user tap if browser suspended WebAudio
    tryStartStudioAudio();
    unlockTapFn = () => {
      if (!active) return;
      if (!audioStarted) tryStartStudioAudio();
    };
    overlayEl.addEventListener('pointerdown', unlockTapFn, { passive: true });

    const isMobile = (() => {
      try {
        return Boolean(
          (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
          /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
        );
      } catch {
        return false;
      }
    })();

    const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    const rng = seededRng(11);
    const NP = isMobile ? 32 : 46;
    const NB = isMobile ? 7 : 9;
    const dust = Array.from({ length: NP }, () => ({
      nx: 0.13 + rng() * 0.74,
      ny: 0.11 + rng() * 0.78,
      vx: (rng() - 0.5) * 0.0042,
      vy: -(0.005 + rng() * 0.010),
      r: 0.9 + rng() * 1.4,
      b: 0.25 + rng() * 0.5,
      ph: rng() * Math.PI * 2,
      fr: 0.5 + rng() * 1.0
    }));
    const bokeh = Array.from({ length: NB }, () => ({
      nx: 0.10 + rng() * 0.80,
      ny: 0.09 + rng() * 0.82,
      vx: (rng() - 0.5) * 0.003,
      vy: -(0.002 + rng() * 0.0055),
      r: 12 + rng() * 16,
      b: 0.03 + rng() * 0.04,
      ph: rng() * Math.PI * 2
    }));

    // Pre-build reusable offscreen sweep buffer for metallic light glint
    const sweepBuf = document.createElement('canvas');
    sweepBuf.width = Math.ceil(LW + 40);
    sweepBuf.height = Math.ceil(LH + 40);
    const sweepCtx = sweepBuf.getContext('2d');

    // Load the 3 lightweight YAGUN STUDIO layers (~127KB total)
    Promise.all([
      loadImg(LEFT_META.src),
      loadImg(RIGHT_META.src),
      loadImg(TEXT_META.src)
    ]).then(([leftImg, rightImg, textImg]) => {
      if (!active) return;

      const leftGlow  = bakeGlow(leftImg,  isMobile ? 12 : 18, 'rgb(178, 210, 255)');
      const rightGlow = bakeGlow(rightImg, isMobile ? 12 : 18, 'rgb(178, 210, 255)');
      const textGlow  = bakeGlow(textImg,  isMobile ? 7 : 10,  'rgb(178, 210, 255)');
      const leftRed   = bakeTint(leftImg,  'rgba(255, 70, 95, 0.72)');
      const leftBlue  = bakeTint(leftImg,  'rgba(60, 175, 255, 0.72)');
      const rightRed  = bakeTint(rightImg, 'rgba(255, 70, 95, 0.72)');
      const rightBlue = bakeTint(rightImg, 'rgba(60, 175, 255, 0.72)');

      let cachedW = 0;
      let cachedH = 0;
      let bgGrad = null;
      let vigGrad = null;
      let haloGrad = null;

      function syncCanvasSize() {
        const cssW = Math.max(320, overlayEl.clientWidth || window.innerWidth || 960);
        const cssH = Math.max(240, overlayEl.clientHeight || window.innerHeight || 540);
        if (cssW === cachedW && cssH === cachedH) return { W: cssW, H: cssH };
        cachedW = cssW;
        cachedH = cssH;
        const dpr = isMobile ? Math.min(1.5, window.devicePixelRatio || 1) : Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const maxR = Math.hypot(cssW * 0.55, cssH * 0.55);
        bgGrad = ctx.createRadialGradient(cssW * 0.5, cssH * 0.47, 10, cssW * 0.5, cssH * 0.47, maxR);
        bgGrad.addColorStop(0, '#101524');
        bgGrad.addColorStop(0.55, '#070a14');
        bgGrad.addColorStop(1, '#020308');

        vigGrad = ctx.createRadialGradient(cssW * 0.5, cssH * 0.5, Math.min(cssW, cssH) * 0.25, cssW * 0.5, cssH * 0.5, maxR * 1.08);
        vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.46)');

        const haloR = Math.min(cssW, cssH) * 0.52;
        haloGrad = ctx.createRadialGradient(cssW * 0.5, cssH * 0.5, 4, cssW * 0.5, cssH * 0.5, haloR);
        haloGrad.addColorStop(0, 'rgba(108, 152, 245, 0.92)');
        haloGrad.addColorStop(0.45, 'rgba(84, 130, 232, 0.34)');
        haloGrad.addColorStop(1, 'rgba(40, 72, 160, 0)');
        return { W: cssW, H: cssH };
      }

      const startMs = performance.now();
      animStartMs = startMs;
      if (!audioStarted) tryStartStudioAudio();
      const pieces = [
        { meta: LEFT_META,  img: leftImg,  glow: leftGlow,  red: leftRed,  blue: leftBlue },
        { meta: RIGHT_META, img: rightImg, glow: rightGlow, red: rightRed, blue: rightBlue }
      ];

      function drawFrame(nowMs) {
        if (!active) return;
        const t = (nowMs - startMs) / 1000;
        if (t >= DUR) {
          finish(false);
          return;
        }

        const { W, H } = syncCanvasSize();
        const te = t - 1.45;
        const baseScale = Math.min(
          (W < H ? W * 0.70 : W * 0.44) / LW,
          (W < H ? H * 0.42 : H * 0.50) / LH
        );
        const z = 1 + 0.028 * eioCub((t - 1.3) / 4.3) + (te >= 0 ? 0.022 * Math.exp(-te / 0.16) : 0);
        const flash = te >= 0 ? 0.26 * Math.exp(-te / 0.20) : 0;
        const haloAmt = 0.12 * sst((t - 1.45) / 1.4) * (1 + 0.08 * Math.sin(t * 2.2));
        const globalFade = 1 - sst((t - 5.2) / 0.72);

        // 1. Deep Cosmic Midnight Radial Backdrop
        ctx.fillStyle = '#020308';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = (0.55 + 0.45 * sst(t / 1.0)) * globalFade;
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 2. Impact Flash + Breathing Central Icy-Blue Halo
        if (flash + haloAmt > 0.003) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, (flash * 1.45 + haloAmt) * globalFade);
          ctx.fillStyle = haloGrad;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }

        // 3. Anamorphic Horizontal Icy-Blue Light Streak (0.45s -> impact spike at 1.45s -> dissolve)
        if (t > 0.45) {
          let I = 0;
          let halfLen = 0;
          if (t < 1.45) {
            I = 0.9 * sst((t - 0.45) / 1.0);
            halfLen = (40 + 560 * eoCub((t - 0.45) / 1.0)) * (W / 1920);
          } else {
            I = (0.9 + 0.7 * Math.exp(-te / 0.06)) * Math.exp(-te / 0.20);
            halfLen = (600 + 500 * eoCub(te / 0.6)) * (W / 1920);
          }
          if (I > 0.004) {
            const sy = H * 0.477;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const layers = [
              { h: 52, a: 0.14 * I },
              { h: 16, a: 0.36 * I },
              { h: 2.6, a: 0.95 * I }
            ];
            for (let li = 0; li < layers.length; li++) {
              const lay = layers[li];
              const lg = ctx.createLinearGradient(W * 0.5 - halfLen, sy, W * 0.5 + halfLen, sy);
              lg.addColorStop(0, 'rgba(158, 198, 255, 0)');
              lg.addColorStop(0.32, li === 2 ? 'rgba(218, 236, 255, 0.75)' : 'rgba(158, 198, 255, 0.65)');
              lg.addColorStop(0.5, li === 2 ? 'rgba(255, 255, 255, 1)' : 'rgba(182, 214, 255, 0.95)');
              lg.addColorStop(0.68, li === 2 ? 'rgba(218, 236, 255, 0.75)' : 'rgba(158, 198, 255, 0.65)');
              lg.addColorStop(1, 'rgba(158, 198, 255, 0)');
              ctx.globalAlpha = Math.min(1, lay.a * globalFade);
              ctx.fillStyle = lg;
              ctx.fillRect(W * 0.5 - halfLen, sy - lay.h * 0.5, halfLen * 2, lay.h);
            }
            ctx.restore();
          }
        }

        // 4. Floating Cosmic Dust & Soft Bokeh Orbs
        const pf = sst((t - 0.2) / 1.2) * (1 + 2.5 * flash) * globalFade;
        if (pf > 0.005) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < bokeh.length; i++) {
            const b = bokeh[i];
            const bx = (b.nx + b.vx * t) * W;
            const by = (b.ny + b.vy * t) * H;
            const br = b.r * (Math.min(W, H) / 720);
            const ba = b.b * pf * (0.7 + 0.3 * Math.sin(t * 0.8 + b.ph));
            const bg = ctx.createRadialGradient(bx, by, 1, bx, by, br);
            bg.addColorStop(0, `rgba(190, 218, 255, ${(ba * 1.8).toFixed(3)})`);
            bg.addColorStop(1, 'rgba(150, 188, 255, 0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
          }
          for (let i = 0; i < dust.length; i++) {
            const d = dust[i];
            const dx = (d.nx + d.vx * t) * W;
            const dy = (d.ny + d.vy * t) * H;
            const da = Math.min(1, d.b * (0.55 + 0.45 * Math.sin(2 * Math.PI * d.fr * t + d.ph)) * pf * 0.68);
            ctx.fillStyle = `rgba(196, 222, 255, ${da.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(dx, dy, d.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 5. YAGUN STUDIO 2-Piece Kinetic Emblem + Chromatic Aberration + Diagonal Light Sweep + 11 Staggered Letters!
        const S = baseScale * z;
        const cx = W * 0.5;
        const cy = H * 0.5;
        const glK = (0.38 + (te >= 0 ? 0.95 * Math.exp(-te / 0.28) : 0) + 0.04 * Math.sin(t * 2.2)) * globalFade;
        const caShift = te >= 0 ? Math.round(5.5 * Math.exp(-te / 0.14)) : 0;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(S, S);
        ctx.translate(-LW * 0.5, -LH * 0.5);

        // 5a. Emblem pieces glow + slam-in
        for (let pi = 0; pi < pieces.length; pi++) {
          const P = pieces[pi];
          const m = P.meta;
          if (!P.img || t < m.t0) continue;
          const p = eoExp((t - m.t0) / 1.1);
          const a = sst(p / 0.7) * globalFade;
          const ox = (1 - p) * m.ox;
          const oy = (1 - p) * m.oy;
          const px = m.rx + ox;
          const py = m.ry + oy;

          // Additive icy-blue ambient & impact glow behind piece
          if (P.glow) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, glK * a * 0.78);
            ctx.drawImage(P.glow.canvas, px - P.glow.pad, py - P.glow.pad);
            ctx.restore();
          }

          // Impact Chromatic Aberration (RGB split echoes right on lock-in at t = 1.45s!)
          if (caShift >= 1 && P.red && P.blue) {
            const caAlpha = Math.min(0.65, (caShift / 5.5) * 0.55) * a;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = caAlpha;
            ctx.drawImage(P.red, px + caShift, py);
            ctx.drawImage(P.blue, px - caShift, py);
            ctx.restore();
          }

          // Metallic piece art
          ctx.save();
          ctx.globalAlpha = a;
          ctx.drawImage(P.img, px, py);
          ctx.restore();
        }

        // 5b. Diagonal Glossy Light Sweep across the assembled metallic emblem (2.05s -> 3.05s)
        if (t > 2.02 && t < 3.25 && leftImg && rightImg) {
          const sp = eioCub((t - 2.05) / 1.0);
          const padB = 20;
          sweepCtx.clearRect(0, 0, sweepBuf.width, sweepBuf.height);
          sweepCtx.globalCompositeOperation = 'source-over';
          sweepCtx.drawImage(leftImg, LEFT_META.rx + padB, LEFT_META.ry + padB);
          sweepCtx.drawImage(rightImg, RIGHT_META.rx + padB, RIGHT_META.ry + padB);
          sweepCtx.globalCompositeOperation = 'source-in';
          const sx0 = -160 + sp * (LW + 420);
          const swGrad = sweepCtx.createLinearGradient(sx0 - 95, 0, sx0 + 95, 190);
          swGrad.addColorStop(0, 'rgba(230, 245, 255, 0)');
          swGrad.addColorStop(0.5, 'rgba(235, 248, 255, 0.72)');
          swGrad.addColorStop(1, 'rgba(230, 245, 255, 0)');
          sweepCtx.fillStyle = swGrad;
          sweepCtx.fillRect(0, 0, sweepBuf.width, sweepBuf.height);
          sweepCtx.globalCompositeOperation = 'source-over';

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = globalFade * 0.85;
          ctx.drawImage(sweepBuf, -padB, -padB);
          ctx.restore();
        }

        // 5c. 11 Staggered Letters ("Y A G U N   S T U D I O") rising & expanding cleanly (2.45s -> 3.9s)
        const tg = eoCub((t - 2.45) / 1.4);
        if (tg > 0 && textImg) {
          if (textGlow) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, 0.58 * tg * tg * globalFade);
            ctx.drawImage(textGlow.canvas, TEXT_META.rx - textGlow.pad, TEXT_META.ry - textGlow.pad);
            ctx.restore();
          }
          const trackScale = 0.90 + 0.10 * tg;
          for (let i = 0; i < LETTERS.length; i++) {
            const q = eoCub((t - 2.45 - 0.06 * i) / 0.55);
            if (q <= 0) continue;
            const la = sst(q / 0.6) * globalFade;
            const L = LETTERS[i];
            const origX = TEXT_META.rx + L.sx;
            const lCenter = origX + L.sw * 0.5;
            const trackedCenter = LW * 0.5 + (lCenter - LW * 0.5) * trackScale;
            const dx = origX + (trackedCenter - lCenter);
            const dy = TEXT_META.ry + (1 - q) * 14;
            ctx.save();
            ctx.globalAlpha = la;
            ctx.drawImage(textImg, L.sx, 0, L.sw, TEXT_META.h, dx, dy, L.sw, TEXT_META.h);
            ctx.restore();
          }
        }

        ctx.restore();

        // 6. Subtle Cinema Vignette
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);

        rafId = requestAnimationFrame(drawFrame);
      }

      rafId = requestAnimationFrame(drawFrame);
    });
  }

  return {
    play,
    skip: () => finish(true),
    isActive
  };
})();
