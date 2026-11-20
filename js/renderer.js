window.RunRenderer = (function () {
  const W = 450;
  const H = 270;
  const GROUND_Y = 224;

  let particles = [];
  let dustPuffs = [];
  let floaters = [];

  // ===================== PRELOAD ALL CHARACTER + DESIGN SPRITES =====================
  const CHAR_SPRITES = [
    'motion_idle', 'motion_walk', 'motion_run', 'motion_jump',
    'motion_hit', 'motion_item', 'motion_win',
    'skin_basic', 'skin_raincoat', 'skin_padding',
    'skin_hanbok', 'skin_santa', 'skin_skier'
  ];

  const DESIGN_SPRITES = [
    'obs_dirt_block', 'obs_crate', 'obs_stone_block', 'obs_ice_block', 'obs_spikes',
    'obs_fence', 'obs_barricade', 'obs_ice_spikes', 'obs_storm_cloud', 'obs_snowman',
    'obs_fire', 'obs_mace', 'obs_warning_sign', 'obs_tornado', 'obs_meteor',
    'item_coin', 'item_coin_side', 'item_star',
    'orb_star', 'orb_magnet', 'orb_bolt', 'orb_potion',
    'tile_grass', 'tile_stone', 'tile_ice',
    'tree_green', 'tree_snow', 'prop_lamp',
    'ui_chest', 'ui_fever', 'pet_dog'
  ];

  const ATLAS_SPRITES = [
    'char_idle', 'char_run_0', 'char_run_1', 'char_run_2', 'char_run_3', 'char_run_4', 'char_run_5',
    'char_slide', 'char_jump_0', 'char_jump_1',
    'dog_run_0', 'dog_run_1', 'dog_run_2', 'dog_run_3',
    'spr_umbrella', 'spr_shield'
  ];

  const sprites = {};

  CHAR_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/sprites/${key}.png`;
    sprites[key] = img;
  });

  DESIGN_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/design/${key}.png`;
    sprites[key] = img;
  });

  ATLAS_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/atlas/${key}.png`;
    sprites[key] = img;
  });

  function getSprite(key) {
    const img = sprites[key];
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < 58; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        v: 0.7 + Math.random() * 1.4,
        s: 1 + Math.floor(Math.random() * 2),
        p: Math.random() * Math.PI * 2
      });
    }
  }
  initParticles();

  function clearFloaters() {
    floaters = [];
    dustPuffs = [];
  }

  function spawnFloater(text, color, x, y) {
    floaters.push({ text, color, x, y, life: 0.95, maxLife: 0.95 });
  }

  function spawnDust(x, y, isStar = false) {
    dustPuffs.push({
      x,
      y,
      vx: -35 - Math.random() * 30,
      vy: -8 - Math.random() * 14,
      r: isStar ? 4 : 4 + Math.random() * 4,
      isStar,
      life: isStar ? 0.55 : 0.42,
      maxLife: isStar ? 0.55 : 0.42
    });
  }

  // ===================== COLOR LERP & SMOOTH SEASON TRANSITIONS =====================
  function parseHex(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function lerpHex(hexA, hexB, f) {
    const t = Math.max(0, Math.min(1, f));
    const a = parseHex(hexA);
    const b = parseHex(hexB);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  // ===================== MOCKUP-INSPIRED BACKGROUND & TILESET =====================
  function drawBackground(ctx, w, h, groundY, seasonId, scroll, t, prevSeasonId = null, blend = 1, weatherEvent = 'clear') {
    const seasons = window.RUN_DATA.SEASONS;
    const season = seasons.find((s) => s.id === seasonId) || seasons[0];
    const prevSeason = prevSeasonId ? (seasons.find((s) => s.id === prevSeasonId) || season) : season;
    const f = prevSeasonId ? Math.max(0, Math.min(1, blend)) : 1;

    let top = lerpHex(prevSeason.sky[0], season.sky[0], f);
    let mid = lerpHex(prevSeason.sky[1], season.sky[1], f);
    let bot = lerpHex(prevSeason.sky[2], season.sky[2], f);

    // Stormy cloud darkening during rain / flood / gust
    const isStormy = weatherEvent === 'rain' || weatherEvent === 'flood' || weatherEvent === 'gust';
    if (isStormy) {
      top = lerpHex(season.sky[0], '#2c4166', 0.55);
      mid = lerpHex(season.sky[1], '#4d658a', 0.45);
      bot = lerpHex(season.sky[2], '#8aa0bf', 0.4);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, top);
    grad.addColorStop(0.58, mid);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    // Fluffy pixel clouds (softly darken when rain/storm rolls in!)
    const cloudShadow = isStormy ? 'rgba(110, 128, 160, 0.85)' : 'rgba(210, 226, 255, 0.8)';
    const cloudMain = isStormy ? 'rgba(175, 192, 218, 0.92)' : 'rgba(255, 255, 255, 0.94)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 145 - scroll * 0.06 + t * 6) % (w + 120) + (w + 120)) % (w + 120) - 70;
      const cy = 22 + (i % 2) * 20;
      ctx.fillStyle = cloudShadow;
      ctx.fillRect(Math.floor(cx) + 4, cy + 12, 54, 10);
      ctx.fillStyle = cloudMain;
      ctx.fillRect(Math.floor(cx), cy + 6, 62, 12);
      ctx.fillRect(Math.floor(cx) + 10, cy - 4, 38, 12);
      ctx.fillRect(Math.floor(cx) + 20, cy - 10, 20, 8);
    }

    // Distant Namsan Mountain + N Seoul Tower (smooth season color crossfade!)
    ctx.fillStyle = lerpHex(prevSeason.mountain || '#7ea2d6', season.mountain || '#7ea2d6', f);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - 40);
    ctx.lineTo(w * 0.22, groundY - 68);
    ctx.lineTo(w * 0.52, groundY - 96);
    ctx.lineTo(w * 0.80, groundY - 64);
    ctx.lineTo(w, groundY - 78);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // N Seoul Tower crisp pixel silhouette on peak
    const tx = Math.floor(w * 0.52);
    const ty = groundY - 96;
    ctx.fillStyle = '#5c7db5';
    ctx.fillRect(tx - 2, ty - 34, 4, 36);
    ctx.fillRect(tx - 7, ty - 26, 14, 7);
    ctx.fillStyle = '#d4e8ff';
    ctx.fillRect(tx - 5, ty - 24, 10, 3);
    ctx.fillStyle = '#5c7db5';
    ctx.fillRect(tx - 1, ty - 48, 2, 14);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(tx - 1, ty - 50, 2, 3);

    // Pastel Korean City Skyline Silhouette (far parallax)
    const cityOff = Math.floor(scroll * 0.16) % 240;
    for (let rep = -1; rep < 4; rep++) {
      const bx = rep * 240 - cityOff;
      drawPastelBuilding(ctx, bx + 12, groundY - 72, 36, 72, '#9db4de');
      drawPastelBuilding(ctx, bx + 54, groundY - 90, 42, 90, '#91aad6');
      drawPastelBuilding(ctx, bx + 110, groundY - 64, 34, 64, '#a4bae0');
      drawPastelBuilding(ctx, bx + 166, groundY - 82, 44, 82, '#8fa6d4');
    }

    // Midground Pixel Pine Trees & Streetlamps from uploaded tileset!
    const treeSpr = getSprite(season.tree);
    const lampSpr = getSprite('prop_lamp');
    const propOff = Math.floor(scroll * 0.55) % 260;
    for (let rep = -1; rep <= 3; rep++) {
      const px = rep * 260 - propOff;
      if (treeSpr) {
        const th = seasonId === 'winter' ? 54 : 42;
        const tw = Math.round(th * (treeSpr.naturalWidth / treeSpr.naturalHeight));
        ctx.drawImage(treeSpr, Math.floor(px + 20), Math.floor(groundY - th + 3), tw, th);
        ctx.drawImage(treeSpr, Math.floor(px + 135), Math.floor(groundY - Math.round(th * 0.82) + 3), Math.round(tw * 0.82), Math.round(th * 0.82));
      }
      if (lampSpr) {
        const lh = 48;
        const lw = Math.round(lh * (lampSpr.naturalWidth / lampSpr.naturalHeight));
        ctx.drawImage(lampSpr, Math.floor(px + 92), Math.floor(groundY - lh + 2), lw, lh);
      }
    }

    // Tiled Pixel Ground (using extracted tile_grass / tile_stone / tile_ice!)
    const tileSpr = getSprite(season.tile) || getSprite('tile_grass');
    const tileW = 36;
    const tileH = 34;
    const tileOff = Math.floor(scroll) % tileW;

    // Deep underground soil/ice base below tile row (smooth transition!)
    ctx.fillStyle = lerpHex(prevSeason.groundBase || '#57392c', season.groundBase || '#57392c', f);
    ctx.fillRect(0, groundY, w, h - groundY);

    if (tileSpr) {
      for (let gx = -tileOff; gx < w + tileW; gx += tileW) {
        ctx.drawImage(tileSpr, Math.floor(gx), groundY - 2, tileW, tileH);
      }
      // Second dark brick sub-layer to fill bottom cleanly
      ctx.fillStyle = 'rgba(20, 18, 36, 0.35)';
      ctx.fillRect(0, groundY + tileH - 3, w, h - (groundY + tileH - 3));
    } else {
      ctx.fillStyle = '#5fc256';
      ctx.fillRect(0, groundY - 2, w, 6);
      ctx.fillStyle = '#85553b';
      ctx.fillRect(0, groundY + 4, w, h - groundY);
    }
  }

  function drawPastelBuilding(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(235, 245, 255, 0.45)';
    for (let r = 0; r < Math.floor((h - 14) / 11); r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(x + 5 + c * 10, y + 8 + r * 11, 6, 5);
      }
    }
  }

  // ===================== WEATHER PARTICLES & DUST PUFFS =====================
  function drawDustPuffs(ctx, dt) {
    for (let i = dustPuffs.length - 1; i >= 0; i--) {
      const p = dustPuffs[i];
      p.life -= dt;
      if (p.life <= 0) { dustPuffs.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      if (p.isStar) {
        ctx.fillStyle = '#ffe966';
        ctx.fillRect(Math.floor(p.x) - 3, Math.floor(p.y) - 1, 6, 2);
        ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 3, 2, 6);
      } else {
        ctx.fillStyle = '#fff3df';
        ctx.beginPath();
        ctx.arc(Math.floor(p.x), Math.floor(p.y), p.r * (0.6 + (1 - alpha) * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles(ctx, w, h, seasonId, dt, t, weatherEvent = 'clear', prevSeasonId = null, blend = 1) {
    // Active weather atmosphere tint & gust streaks
    if (weatherEvent === 'dust') {
      ctx.fillStyle = 'rgba(205, 174, 72, 0.24)';
      ctx.fillRect(0, 0, w, h);
    } else if (weatherEvent === 'heat') {
      ctx.fillStyle = 'rgba(255, 130, 35, 0.14)';
      ctx.fillRect(0, 0, w, h);
      // Blazing diagonal sun rays
      ctx.fillStyle = 'rgba(255, 240, 160, 0.16)';
      for (let i = 0; i < 4; i++) {
        const rx = ((i * 130 - t * 25) % (w + 100) + (w + 100)) % (w + 100) - 50;
        ctx.beginPath();
        ctx.moveTo(rx, 0);
        ctx.lineTo(rx + 26, 0);
        ctx.lineTo(rx - 30, h);
        ctx.lineTo(rx - 56, h);
        ctx.closePath();
        ctx.fill();
      }
    } else if (weatherEvent === 'gust') {
      ctx.fillStyle = 'rgba(210, 238, 255, 0.52)';
      for (let i = 0; i < 7; i++) {
        const gx = ((i * 85 - t * 340) % (w + 90) + (w + 90)) % (w + 90) - 70;
        const gy = 34 + (i * 29) % (GROUND_Y - 40);
        ctx.fillRect(Math.floor(gx), gy, 44 + (i % 3) * 14, 2);
      }
    } else if (weatherEvent === 'ice_road') {
      ctx.fillStyle = 'rgba(135, 228, 255, 0.42)';
      ctx.fillRect(0, GROUND_Y - 3, w, 12);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
      for (let i = 0; i < 8; i++) {
        const ix = ((i * 68 - t * 110) % (w + 40) + (w + 40)) % (w + 40) - 20;
        ctx.fillRect(Math.floor(ix), GROUND_Y - 1, 14, 2);
      }
    }

    const heavyRain = weatherEvent === 'rain' || weatherEvent === 'flood';
    const heavyDust = weatherEvent === 'dust';
    const isBlizzard = seasonId === 'winter' && (weatherEvent === 'gust' || weatherEvent === 'ice_road');

    particles.forEach((p, idx) => {
      // During seasonal transition (blend < 1), smoothly swap particles from prevSeason -> seasonId!
      const usePrev = prevSeasonId && blend < 1 && (idx / particles.length) > blend;
      const effSeason = usePrev ? prevSeasonId : seasonId;

      if (heavyRain || (effSeason === 'summer' && !heavyDust)) {
        p.x -= (heavyRain ? 145 : 95) * dt * p.v;
        p.y += (heavyRain ? 285 : 225) * dt * p.v;
        ctx.fillStyle = heavyRain ? 'rgba(185, 228, 255, 0.92)' : 'rgba(210, 236, 255, 0.68)';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), heavyRain ? 2 : 1, heavyRain ? 13 : 9);
      } else if (heavyDust) {
        p.x -= 110 * dt * p.v;
        p.y += Math.sin(t * 4 + p.p) * 16 * dt;
        ctx.fillStyle = 'rgba(235, 198, 75, 0.88)';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 3);
      } else if (effSeason === 'winter' || weatherEvent === 'ice_road') {
        p.x -= ((isBlizzard ? 185 : 52) + Math.sin(t * 2 + p.p) * 18) * dt;
        p.y += (isBlizzard ? 88 : 52) * dt * p.v;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.s + 1, p.s + 1);
      } else if (effSeason === 'autumn' || weatherEvent === 'gust') {
        p.x -= (weatherEvent === 'gust' ? 230 : 115) * dt * p.v;
        p.y += (34 + Math.sin(t * 4 + p.p) * 18) * dt;
        ctx.fillStyle = p.s === 1 ? '#ff7d30' : '#ffd24d';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 4, 2);
      } else {
        // Spring cherry blossom petals!
        p.x -= 64 * dt * p.v;
        p.y += (26 + Math.sin(t * 3 + p.p) * 14) * dt;
        ctx.fillStyle = p.s === 1 ? '#ffb3d1' : '#ffe4ef';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 2);
      }
      if (p.y > h) { p.y = -6; p.x = Math.random() * (w + 60); }
      if (p.x < -10) { p.x = w + 10; p.y = Math.random() * h; }
    });
  }

  // ===================== KOREAN STREET INTERACTIVE FEATURES =====================
  function drawStreetFeatures(ctx, run, t) {
    // 1. Rising Floodwater Layer during 장마 침수 구간!
    if (run.weatherEvent === 'flood') {
      const wave = Math.sin(t * 7) * 2;
      ctx.fillStyle = 'rgba(42, 118, 198, 0.58)';
      ctx.fillRect(0, GROUND_Y - 15 + wave, W, 22);
      ctx.fillStyle = 'rgba(180, 232, 255, 0.75)';
      for (let wx = 0; wx < W; wx += 36) {
        const ox = Math.floor((wx - (run.scroll * 0.8) % 36));
        ctx.fillRect(ox, GROUND_Y - 15 + wave, 18, 2);
      }
    }

    (run.features || []).forEach((f) => {
      const x = Math.floor(f.x);
      if (f.kind === 'conv_store') {
        // K-24 Convenience Store (AC/Heating chance when passing!)
        const sy = GROUND_Y - 66;
        ctx.fillStyle = '#e8f1fa';
        ctx.fillRect(x, sy, f.w, 66);
        ctx.fillStyle = '#25b865'; ctx.fillRect(x, sy, f.w, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, sy + 5, f.w, 5);
        ctx.fillStyle = '#ff8b24'; ctx.fillRect(x, sy + 10, f.w, 4);
        ctx.fillStyle = '#1b5eb8'; ctx.fillRect(x + 28, sy + 1, 44, 12);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 9px "Paperlogy", sans-serif';
        ctx.fillText('K-24', x + 39, sy + 10);
        // Glass windows
        ctx.fillStyle = '#a4dbfa';
        ctx.fillRect(x + 8, sy + 20, 44, 34);
        // Sliding Automatic Door (opens when triggered!)
        const doorOpen = f.triggered ? 12 : 0;
        ctx.fillStyle = f.triggered ? (run.seasonId === 'winter' ? '#ffcf6e' : '#7ae8ff') : '#5d9bd4';
        ctx.fillRect(x + 58, sy + 20, 32, 46);
        ctx.fillStyle = '#d4edff';
        ctx.fillRect(x + 58, sy + 20, 15 - doorOpen, 46);
        ctx.fillRect(x + 75 + doorOpen, sy + 20, 15 - doorOpen, 46);
        // Cool AC / Warm Heater air burst lines when door opens!
        if (f.triggered) {
          ctx.fillStyle = run.seasonId === 'winter' ? 'rgba(255, 195, 75, 0.85)' : 'rgba(115, 240, 255, 0.85)';
          for (let k = 0; k < 4; k++) {
            ctx.fillRect(x + 52 - k * 8, sy + 28 + k * 8, 16, 3);
          }
        }
      } else if (f.kind === 'shade_tree') {
        // Cool dark-blue shade pool on sidewalk + big tree overhead
        ctx.fillStyle = 'rgba(20, 52, 108, 0.36)';
        ctx.fillRect(x, GROUND_Y - 12, f.w, 16);
        ctx.fillStyle = '#6e4933';
        ctx.fillRect(x + f.w / 2 - 5, GROUND_Y - 56, 10, 56);
        ctx.fillStyle = '#258a45';
        ctx.fillRect(x - 6, GROUND_Y - 94, f.w + 12, 44);
        ctx.fillStyle = '#47c96b';
        ctx.fillRect(x + 4, GROUND_Y - 102, f.w - 8, 28);
        ctx.fillStyle = '#a8ecff';
        ctx.font = '800 9px "Paperlogy", sans-serif';
        ctx.fillText('그늘', x + f.w / 2 - 10, GROUND_Y - 2);
      } else if (f.kind === 'bus_stop') {
        // Bus Shelter with shaded ground AND jumpable roof platform!
        ctx.fillStyle = 'rgba(20, 52, 108, 0.38)';
        ctx.fillRect(x, GROUND_Y - 12, f.w, 16);
        ctx.fillStyle = '#475b78';
        ctx.fillRect(x + 4, GROUND_Y - 46, 4, 46);
        ctx.fillRect(x + f.w - 8, GROUND_Y - 46, 4, 46);
        ctx.fillStyle = 'rgba(185, 226, 255, 0.55)';
        ctx.fillRect(x + 8, GROUND_Y - 42, f.w - 16, 30);
        // Roof platform
        ctx.fillStyle = '#2463b8';
        ctx.fillRect(x - 4, f.platformY, f.w + 8, 8);
        ctx.fillStyle = '#8cc7ff';
        ctx.fillRect(x - 2, f.platformY, f.w + 4, 3);
      } else if (f.kind === 'truck_shade') {
        // Moving Korean Cargo Truck casting cool mobile shade!
        ctx.fillStyle = 'rgba(20, 52, 108, 0.42)';
        ctx.fillRect(x - 10, GROUND_Y - 14, f.w + 20, 18);
        // Truck cab & cargo box in background lane
        ctx.fillStyle = '#edf3fa';
        ctx.fillRect(x + 22, GROUND_Y - 54, f.w - 22, 36);
        ctx.fillStyle = '#2d76d6';
        ctx.fillRect(x, GROUND_Y - 44, 24, 26);
        ctx.fillStyle = '#9be0ff';
        ctx.fillRect(x + 3, GROUND_Y - 40, 12, 11);
        ctx.fillStyle = '#262b36';
        ctx.beginPath(); ctx.arc(x + 14, GROUND_Y - 16, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + f.w - 16, GROUND_Y - 16, 7, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'car_roof') {
        // Submerged sedan roof platform during flood!
        const py = f.platformY;
        ctx.fillStyle = '#d94c4c';
        ctx.fillRect(x, py + 12, f.w, 16);
        ctx.fillStyle = '#f26b6b';
        ctx.fillRect(x + 12, py, f.w - 24, 14);
        ctx.fillStyle = '#b5e8ff';
        ctx.fillRect(x + 16, py + 3, f.w - 32, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 12, py, f.w - 24, 3);
      } else if (f.kind === 'bench') {
        // Dry park bench platform during flood!
        const py = f.platformY;
        ctx.fillStyle = '#47362b';
        ctx.fillRect(x + 6, py + 6, 5, 20);
        ctx.fillRect(x + f.w - 11, py + 6, 5, 20);
        ctx.fillStyle = '#c47b3d';
        ctx.fillRect(x, py, f.w, 8);
        ctx.fillStyle = '#f0a860';
        ctx.fillRect(x, py, f.w, 3);
      }
    });
  }

  function drawPassingCar(ctx, car, t) {
    if (!car) return;
    if (car.phase === 'warn') {
      const blink = Math.floor(t * 14) % 2 === 0;
      ctx.fillStyle = blink ? '#d93232' : '#ff9814';
      ctx.fillRect(W - 122, GROUND_Y - 64, 114, 24);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(W - 122, GROUND_Y - 64, 114, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 11px "Paperlogy", sans-serif';
      ctx.fillText('물벼락 주의! 점프!', W - 114, GROUND_Y - 48);
    } else if (car.phase === 'pass') {
      const x = Math.floor(car.x);
      // Speeding Korean sedan
      ctx.fillStyle = '#2f3d57';
      ctx.fillRect(x, GROUND_Y - 26, 76, 18);
      ctx.fillStyle = '#4b6187';
      ctx.fillRect(x + 14, GROUND_Y - 38, 44, 14);
      ctx.fillStyle = '#a6dcff';
      ctx.fillRect(x + 18, GROUND_Y - 35, 16, 9);
      ctx.fillRect(x + 38, GROUND_Y - 35, 16, 9);
      ctx.fillStyle = '#ffe873';
      ctx.fillRect(x, GROUND_Y - 22, 6, 5);
      // Towering muddy water splash wave!
      ctx.fillStyle = 'rgba(130, 92, 46, 0.85)';
      ctx.fillRect(x + 10, GROUND_Y - 52, 54, 48);
      ctx.fillStyle = 'rgba(196, 160, 110, 0.9)';
      ctx.fillRect(x + 16, GROUND_Y - 58, 40, 14);
    }
  }

  // ===================== 4-FRAME ANIMATED SHIBA PUPPY COMPANION PET =====================
  function drawPuppyPet(ctx, x, y, t, customH = 30) {
    const frame = Math.floor(t * 10) % 4;
    const dog = getSprite(`dog_run_${frame}`) || getSprite('pet_dog');
    if (!dog) return;
    const hop = Math.abs(Math.sin(t * 12 + 0.8)) * 2.5;
    const h = customH;
    const w = Math.round(h * (dog.naturalWidth / dog.naturalHeight));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(Math.floor(x - w * 0.35), Math.floor(y - 1), Math.floor(w * 0.7), 3);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dog, Math.floor(x - w / 2), Math.floor(y - h - hop), w, h);
  }

  // ===================== UPLOADED PIXEL K-CHARACTER SPRITE RENDERER =====================
  function pickCharacterSprite(charDef, opts, t) {
    if (charDef.useAtlasRun) {
      if (opts.sliding) return getSprite('char_slide') || getSprite('motion_hit');
      if (opts.hitPoseTimer > 0) return getSprite('char_slide') || getSprite('motion_hit');
      if (opts.inAir) {
        return getSprite(Math.floor(t * 8) % 2 === 0 ? 'char_jump_0' : 'char_jump_1') || getSprite('motion_jump');
      }
      if (opts.winPoseTimer > 0) return getSprite('motion_win') || getSprite('char_jump_1');
      if (opts.itemPoseTimer > 0) return getSprite('motion_item') || getSprite('char_jump_0');
      if (opts.running) {
        const frame = Math.floor(t * 11) % 6;
        return getSprite(`char_run_${frame}`) || getSprite('motion_run');
      }
      return getSprite('char_idle') || getSprite('motion_idle');
    }
    return getSprite(charDef.spriteKey) || getSprite('char_idle');
  }

  function drawCharacter(ctx, charDef, x, y, opts, t) {
    const {
      sliding, inAir, gliding, invulnTimer, shield, feverTimer, running,
      umbrellaOn = false, maskOn = false, umbrellaBrokenTimer = 0,
      scaleHeight = 52
    } = opts;

    if (invulnTimer > 0 && Math.floor(t * 20) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    const col = charDef.colors || {};
    const cx = Math.floor(x);
    const cy = Math.floor(y);

    if (!inAir) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(cx - (sliding ? 18 : 13), cy - 1, sliding ? 36 : 26, 4);
    }

    // Fever rainbow aura / Shield ring
    if (feverTimer > 0) {
      ctx.strokeStyle = Math.floor(t * 14) % 2 === 0 ? '#ffe85c' : '#63e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - (sliding ? 13 : scaleHeight * 0.48), sliding ? 24 : scaleHeight * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shield) {
      ctx.strokeStyle = 'rgba(110, 220, 255, 0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - (sliding ? 13 : scaleHeight * 0.48), sliding ? 23 : scaleHeight * 0.54, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Uploaded Rainbow Umbrella sprite when 우비 소년 glides OR Umbrella Toggle is ON!
    const showUmbrella = (col.umbrella && gliding) || umbrellaOn;
    if (showUmbrella) {
      const umbSpr = getSprite('spr_umbrella');
      const uy = cy - (sliding ? 22 : scaleHeight) - 12;
      if (umbSpr) {
        const uh = 34;
        const uw = Math.round(uh * (umbSpr.naturalWidth / umbSpr.naturalHeight));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(umbSpr, Math.floor(cx - uw / 2 + 4), Math.floor(uy - 12), uw, uh);
      } else {
        ctx.fillStyle = '#2672d9';
        ctx.fillRect(cx - 18, uy - 10, 40, 7);
      }
    } else if (umbrellaBrokenTimer > 5.6) {
      // Flipped broken umbrella brief comedy animation!
      const uy = cy - scaleHeight - 8;
      ctx.fillStyle = '#3c4759';
      ctx.fillRect(cx + 8, uy - 6, 2, 22);
      ctx.fillStyle = '#e05252';
      ctx.fillRect(cx - 12, uy - 14, 6, 10);
      ctx.fillRect(cx + 12, uy - 14, 6, 10);
      ctx.fillRect(cx - 6, uy - 7, 18, 5);
    }

    if (sliding) {
      ctx.fillStyle = 'rgba(255, 245, 230, 0.85)';
      const dustShift = Math.floor((t * 48) % 8);
      ctx.fillRect(cx - 26 - dustShift, cy - 5, 11, 4);
      ctx.fillRect(cx - 20 - dustShift, cy - 10, 7, 3);
    }

    // Character-Specific Unique Animated Aura / Running Trail!
    if (running && charDef.auraType) {
      const aura = charDef.auraType;
      if (aura === 'skier') {
        // Icy crystal glide sparks under ski boots!
        for (let k = 0; k < 3; k++) {
          const ox = ((t * 58 + k * 14) % 28);
          const oy = Math.sin(t * 9 + k * 2) * 5;
          ctx.fillStyle = k % 2 === 0 ? '#a8f4ff' : '#ffffff';
          ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - 6 + oy), 4, 2);
        }
      } else if (aura === 'raincoat') {
        // Waterproof cyan droplet ring sparkles
        for (let k = 0; k < 3; k++) {
          const ang = t * 4.5 + k * 2.1;
          ctx.fillStyle = '#70e4ff';
          ctx.fillRect(Math.floor(cx + Math.cos(ang) * 18), Math.floor(cy - scaleHeight * 0.45 + Math.sin(ang) * 12), 3, 3);
        }
      } else if (aura === 'padding') {
        // Warm crimson-gold thermal defense shimmer
        ctx.strokeStyle = `rgba(255, 130, 90, ${(0.35 + Math.sin(t * 7) * 0.2).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy - scaleHeight * 0.46, scaleHeight * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      } else if (aura === 'hanbok') {
        // Traditional breeze ribbon petals (gold + sky blue)
        for (let k = 0; k < 3; k++) {
          const ox = ((t * 44 + k * 16) % 32);
          const oy = Math.sin(t * 7 + k * 2.4) * 9;
          ctx.fillStyle = k === 0 ? '#ffe566' : '#85d6ff';
          ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - scaleHeight * 0.5 + oy), 4, 3);
        }
      } else if (aura === 'santa') {
        // Sparkling golden coin/star confetti trail!
        for (let k = 0; k < 4; k++) {
          const ox = ((t * 52 + k * 12) % 34);
          const oy = Math.cos(t * 8 + k * 1.7) * 10;
          ctx.fillStyle = k % 2 === 0 ? '#ffdf47' : '#ff6b6b';
          ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - scaleHeight * 0.42 + oy), 3, 3);
        }
      }
    }

    const spr = pickCharacterSprite(charDef, opts, t);
    if (spr) {
      const targetH = sliding ? Math.round(scaleHeight * 0.56) : scaleHeight;
      const ratio = spr.naturalWidth / spr.naturalHeight;
      const drawW = Math.round(targetH * ratio);
      const drawH = targetH;

      const bob = running && !inAir && !sliding ? (charDef.useAtlasRun ? Math.abs(Math.sin(t * 14)) * 1.8 : Math.abs(Math.sin(t * 16)) * 3.5) : 0;
      let rot = 0;
      if (!charDef.useAtlasRun) {
        if (sliding) rot = -0.32;
        else if (inAir) rot = gliding ? 0.05 : -0.14;
        else if (running) rot = 0.08 + Math.sin(t * 16) * 0.06;
      }

      ctx.save();
      ctx.translate(cx, Math.floor(cy - bob));
      if (rot !== 0) ctx.rotate(rot);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, Math.floor(-drawW / 2), Math.floor(-drawH), drawW, drawH);

      // White KF94 Mask overlay when Mask Toggle is ON!
      if (maskOn) {
        const my = sliding ? Math.floor(-drawH * 0.42) : Math.floor(-drawH * 0.44);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.floor(drawW * 0.02), my, 12, 7);
        ctx.strokeStyle = '#9bb8d4';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(drawW * 0.02), my, 12, 7);
      }

      if (col.coffeeCup && !sliding) {
        ctx.fillStyle = 'rgba(225, 248, 255, 0.95)';
        ctx.fillRect(Math.floor(drawW * 0.34), Math.floor(-drawH * 0.52), 7, 10);
        ctx.fillStyle = '#4a2c16';
        ctx.fillRect(Math.floor(drawW * 0.34) + 1, Math.floor(-drawH * 0.52) + 3, 5, 6);
        ctx.fillStyle = '#9ce8ff';
        ctx.fillRect(Math.floor(drawW * 0.34) + 1, Math.floor(-drawH * 0.52) + 2, 2, 2);
        ctx.fillStyle = '#24c464';
        ctx.fillRect(Math.floor(drawW * 0.34) + 3, Math.floor(-drawH * 0.52) - 4, 2, 5);
      }

      ctx.restore();
    } else {
      ctx.fillStyle = col.top || '#f5b82e';
      ctx.fillRect(cx - 10, cy - (sliding ? 18 : 36), 20, sliding ? 18 : 36);
    }

    ctx.globalAlpha = 1;
  }

  // ===================== DESIGN SHEET & CUSTOM SEASONAL OBSTACLES =====================
  function drawCustomObstacle(ctx, ob, x, y, t) {
    const kind = ob.customDraw;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (kind === 'smog_zone') {
      // Billowing yellow-brown fine-dust smog mound on sidewalk!
      const bob = Math.sin(t * 7 + ob.x * 0.05) * 2;
      ctx.fillStyle = 'rgba(138, 116, 44, 0.92)';
      ctx.fillRect(x + 2, y + 10 + bob, ob.w - 4, ob.h - 10);
      ctx.fillRect(x + 8, y + 3 + bob, ob.w - 16, 12);
      ctx.fillStyle = 'rgba(218, 190, 78, 0.92)';
      ctx.fillRect(x + 6, y + 8 + bob, ob.w - 12, 12);
      ctx.fillRect(x + 14, y + 1 + bob, ob.w - 28, 10);
      ctx.fillStyle = '#33290e';
      ctx.font = '900 9px "Paperlogy", sans-serif';
      ctx.fillText('PM2.5', x + 9, y + 20 + bob);
    } else if (kind === 'flying_branch') {
      // Spinning windblown spring branch with pink cherry blossoms!
      ctx.translate(x + ob.w / 2, y + ob.h / 2);
      ctx.rotate(-t * 4.5);
      ctx.fillStyle = '#5c3b24';
      ctx.fillRect(-ob.w / 2 + 2, -4, ob.w - 4, 8);
      ctx.fillRect(-6, -12, 6, 10);
      ctx.fillStyle = '#3d2414';
      ctx.fillRect(-ob.w / 2 + 2, 2, ob.w - 4, 3);
      ctx.fillStyle = '#ff9ec4';
      ctx.fillRect(-ob.w / 2 + 4, -9, 8, 7);
      ctx.fillRect(-4, -14, 9, 7);
      ctx.fillRect(8, -8, 8, 7);
      ctx.fillStyle = '#ffe2ee';
      ctx.fillRect(-2, -12, 4, 3);
      ctx.fillRect(10, -6, 4, 3);
    } else if (kind === 'hot_asphalt') {
      // Blazing red-orange heatwave cracked asphalt + rising flames!
      ctx.fillStyle = '#2d2833';
      ctx.fillRect(x, y + ob.h - 12, ob.w, 12);
      ctx.fillStyle = '#ff5722';
      ctx.fillRect(x + 4, y + ob.h - 11, ob.w - 8, 4);
      for (let k = 0; k < 4; k++) {
        const fh = 10 + Math.floor(Math.abs(Math.sin(t * 14 + k * 1.4)) * 14);
        const fx = x + 5 + k * 10;
        ctx.fillStyle = '#ff6a1a';
        ctx.fillRect(fx, y + ob.h - 12 - fh, 8, fh);
        ctx.fillStyle = '#ffd633';
        ctx.fillRect(fx + 2, y + ob.h - 12 - Math.floor(fh * 0.65), 4, Math.floor(fh * 0.65));
      }
    } else if (kind === 'lightning_strike') {
      // Summer Lightning Bolt: telegraph column first, then vivid pixel strike!
      const cx = x + ob.w / 2;
      // Dark thundercloud overhead
      ctx.fillStyle = '#2f384f';
      ctx.fillRect(cx - 22, y - 10, 44, 16);
      ctx.fillRect(cx - 14, y - 16, 28, 8);
      if (ob.strikeTimer > 0) {
        const blink = Math.floor(t * 18) % 2 === 0;
        ctx.fillStyle = blink ? 'rgba(255, 235, 92, 0.35)' : 'rgba(255, 110, 60, 0.22)';
        ctx.fillRect(cx - 9, y + 6, 18, ob.h - 6);
        ctx.fillStyle = blink ? '#ffe84d' : '#ff5938';
        ctx.fillRect(cx - 11, GROUND_Y - 18, 22, 16);
        ctx.fillStyle = '#141226';
        ctx.font = '900 11px "Paperlogy", sans-serif';
        ctx.fillText('⚡', cx - 6, GROUND_Y - 6);
      } else {
        // Active jagged lightning strike!
        ctx.fillStyle = 'rgba(255, 245, 150, 0.42)';
        ctx.fillRect(cx - 13, y + 4, 26, ob.h - 4);
        ctx.fillStyle = '#fff9c4';
        for (let sy = 4; sy < ob.h - 4; sy += 14) {
          const zig = ((sy / 14) % 2 === 0 ? -5 : 5);
          ctx.fillRect(cx + zig - 4, y + sy, 8, 16);
        }
        ctx.fillStyle = '#ffe033';
        ctx.fillRect(cx - 14, GROUND_Y - 8, 28, 8);
      }
    } else if (kind === 'flying_umbrella') {
      // Tumbling flipped umbrella blown by summer storm wind!
      ctx.translate(x + ob.w / 2, y + ob.h / 2);
      ctx.rotate(-t * 5.2);
      ctx.fillStyle = '#141226';
      ctx.fillRect(-16, -2, 32, 4);
      ctx.fillStyle = '#e84545';
      ctx.fillRect(-16, -13, 10, 12);
      ctx.fillRect(6, -13, 10, 12);
      ctx.fillStyle = '#ff7b54';
      ctx.fillRect(-8, -7, 16, 7);
      ctx.fillStyle = '#73829e';
      ctx.fillRect(-2, -14, 4, 26);
      ctx.fillRect(-2, 10, 8, 3);
    } else if (kind === 'flying_sign') {
      // Iconic Korean neon street signboard tumbling through typhoon!
      ctx.translate(x + ob.w / 2, y + ob.h / 2);
      ctx.rotate(Math.sin(t * 9) * 0.28);
      ctx.fillStyle = '#161426';
      ctx.fillRect(-ob.w / 2, -ob.h / 2, ob.w, ob.h);
      ctx.fillStyle = ob.signColor || '#ff4757';
      ctx.fillRect(-ob.w / 2 + 3, -ob.h / 2 + 3, ob.w - 6, ob.h - 6);
      ctx.fillStyle = '#fff59d';
      ctx.font = '900 12px "Paperlogy", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ob.signText || '치킨', 0, 5);
      ctx.textAlign = 'left';
    } else if (kind === 'leaf_pile') {
      // Layered orange/red/gold pixel autumn leaf mound!
      ctx.fillStyle = '#a63e1b';
      ctx.fillRect(x + 2, y + 12, ob.w - 4, ob.h - 12);
      ctx.fillStyle = '#e06d1f';
      ctx.fillRect(x + 6, y + 6, ob.w - 12, ob.h - 8);
      ctx.fillStyle = '#ffae2b';
      ctx.fillRect(x + 12, y + 1, ob.w - 24, 12);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 10, y + 11, 6, 4);
      ctx.fillRect(x + 24, y + 8, 7, 4);
      ctx.fillRect(x + 18, y + 18, 6, 4);
    } else if (kind === 'falling_tree') {
      // Autumn street tree tilting forward in the typhoon wind!
      const tilt = Math.min(0.42, Math.max(0, (W - ob.x) / W) * 0.5);
      ctx.translate(x + ob.w / 2, y + ob.h);
      ctx.rotate(-tilt);
      ctx.fillStyle = '#5e3c23';
      ctx.fillRect(-6, -ob.h + 14, 12, ob.h - 14);
      ctx.fillStyle = '#d9532f';
      ctx.fillRect(-20, -ob.h, 40, 26);
      ctx.fillStyle = '#ff9233';
      ctx.fillRect(-15, -ob.h - 5, 30, 16);
      ctx.fillStyle = '#ffd24d';
      ctx.fillRect(-8, -ob.h - 2, 12, 8);
    } else if (kind === 'snow_pile') {
      // Chunky white & ice-blue winter snowbank mound!
      ctx.fillStyle = '#8ebce8';
      ctx.fillRect(x + 2, y + 12, ob.w - 4, ob.h - 12);
      ctx.fillStyle = '#d8efff';
      ctx.fillRect(x + 6, y + 6, ob.w - 12, ob.h - 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 11, y + 1, ob.w - 22, 13);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8, y + 10, 8, 5);
      ctx.fillRect(x + 26, y + 12, 9, 5);
    } else if (kind === 'falling_icicle') {
      // Sharp cyan-white pixel icicle falling from the top!
      if (y < 46) {
        const blink = Math.floor(t * 16) % 2 === 0;
        ctx.fillStyle = blink ? '#ff4757' : '#38c8ff';
        ctx.fillRect(x + 4, 8, ob.w - 8, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px sans-serif';
        ctx.fillText('!', x + ob.w / 2 - 2, 20);
      }
      ctx.fillStyle = '#2d7dc4';
      ctx.beginPath();
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + ob.w - 2, y);
      ctx.lineTo(x + ob.w / 2, y + ob.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9be8ff';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 2);
      ctx.lineTo(x + ob.w - 8, y + 2);
      ctx.lineTo(x + ob.w / 2, y + ob.h - 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8, y + 4, 4, 14);
    }

    ctx.restore();
  }

  function drawObstacle(ctx, ob, t) {
    // Right-edge warning badge before fast flying aerial obstacle enters
    if (ob.warn && ob.x > W - 18 && ob.lane !== 'lightning' && ob.lane !== 'icicle') {
      const wy = Math.floor(ob.y + ob.h / 2);
      const blink = Math.floor(t * 14) % 2 === 0;
      ctx.fillStyle = blink ? '#e83a3a' : '#ff9914';
      ctx.fillRect(W - 26, wy - 12, 20, 24);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - 26, wy - 12, 20, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', W - 16, wy + 6);
      ctx.textAlign = 'left';
      return;
    }

    const x = Math.floor(ob.x);
    let y = Math.floor(ob.y);

    if (ob.lane === 'air') {
      y += Math.round(Math.sin(t * 9 + ob.x * 0.04) * 3);
    }

    if (ob.customDraw) {
      drawCustomObstacle(ctx, ob, x, y, t);
      return;
    }

    const spr = getSprite(ob.sprite);
    if (spr) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (ob.sprite === 'obs_mace' || ob.sprite === 'obs_meteor') {
        ctx.translate(x + ob.w / 2, y + ob.h / 2);
        ctx.rotate(-t * (ob.sprite === 'obs_mace' ? 5.5 : 3.2));
        ctx.drawImage(spr, -ob.w / 2, -ob.h / 2, ob.w, ob.h);
      } else {
        ctx.drawImage(spr, x, y, ob.w, ob.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x, y, ob.w, ob.h);
    }
  }

  // ===================== DESIGN SHEET COINS & ITEMS =====================
  function drawItem(ctx, it, t) {
    const x = Math.floor(it.x);
    const y = Math.floor(it.y + Math.sin(t * 7 + it.x * 0.05) * 2.5);
    ctx.imageSmoothingEnabled = false;

    if (it.kind === 'coin' || it.kind === 'big_coin') {
      const spin = Math.floor(t * 7 + it.x * 0.03) % 4 === 0;
      const spr = getSprite(spin ? 'item_coin_side' : 'item_coin');
      const sz = it.kind === 'big_coin' ? 28 : 20;
      if (spr) {
        const dw = spin ? Math.round(sz * 0.55) : sz;
        ctx.drawImage(spr, Math.floor(x - dw / 2), Math.floor(y - sz / 2), dw, sz);
      } else {
        ctx.fillStyle = '#ffd447';
        ctx.beginPath(); ctx.arc(x, y, sz / 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (it.kind === 'star') {
      const spr = getSprite('item_star');
      if (spr) ctx.drawImage(spr, x - 12, y - 12, 24, 24);
    } else if (it.kind === 'coffee') {
      const spr = getSprite('orb_potion');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'magnet') {
      const spr = getSprite('orb_magnet');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'umbrella_fever') {
      const spr = getSprite('orb_bolt');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'chest') {
      const spr = getSprite('ui_chest');
      if (spr) ctx.drawImage(spr, x - 16, y - 14, 32, 28);
    } else if (it.kind === 'norway') {
      // Glowing Norwegian Meteorological Institute (Yr.no) Badge!
      ctx.fillStyle = 'rgba(102, 217, 255, 0.35)';
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ba0c2f';
      ctx.fillRect(x - 12, y - 9, 24, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 6, y - 9, 5, 18);
      ctx.fillRect(x - 12, y - 2, 24, 5);
      ctx.fillStyle = '#00205b';
      ctx.fillRect(x - 5, y - 9, 3, 18);
      ctx.fillRect(x - 12, y - 1, 24, 3);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 12, y - 9, 24, 18);
    }
  }

  function drawFeverOverlay(ctx, t) {
    // Full-screen energetic speed lines!
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const lx = ((i * 80 - t * 520) % (W + 100) + (W + 100)) % (W + 100) - 60;
      const ly = i < 4 ? 14 + i * 11 : H - 50 + (i - 4) * 10;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 120, 0.55)' : 'rgba(130, 232, 255, 0.5)';
      ctx.fillRect(Math.floor(lx), ly, 58, 3);
    }

    // Animated Rainbow Screen Border Glow!
    const hue = Math.floor(t * 280) % 360;
    ctx.strokeStyle = `hsla(${hue}, 95%, 62%, 0.85)`;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.restore();

    const spr = getSprite('ui_fever');
    if (!spr) return;
    const scale = 1 + Math.sin(t * 14) * 0.08;
    const dw = Math.round(122 * scale);
    const dh = Math.round(48 * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, Math.floor((W - dw) / 2), 36, dw, dh);
  }

  function drawFloaters(ctx, dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      const prog = 1 - f.life / f.maxLife;
      const fx = Math.max(54, Math.min(W - 54, Math.floor(f.x)));
      const fy = Math.max(22, Math.floor(f.y - prog * 28));
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.font = '800 13px "Paperlogy", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#142038';
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  // ===================== PUBLIC RENDERERS =====================
  let dustTimer = 0;
  function renderRunFrame(ctx, run, charDef, dt, t) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Camera Screen Shake on Hit / Lightning / Umbrella Break!
    if (run.shakeTimer > 0) {
      const mag = (run.shakeIntensity || 6) * Math.min(1, run.shakeTimer / 0.25);
      const sx = (Math.random() - 0.5) * 2 * mag;
      const sy = (Math.random() - 0.5) * 2 * mag;
      ctx.translate(Math.round(sx), Math.round(sy));
    }

    const blend = run.seasonTransition !== undefined ? run.seasonTransition : 1;
    drawBackground(ctx, W, H, GROUND_Y, run.seasonId, run.scroll, t, run.prevSeasonId, blend, run.weatherEvent);

    // Interactive Korean Street Terrain (Convenience Store, Shade Zones, Flood Platforms!)
    drawStreetFeatures(ctx, run, t);

    // Passing Car Water Splash Event
    drawPassingCar(ctx, run.passingCar, t);

    // Emit cute running dust & FEVER stars!
    if (dt > 0) {
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = run.feverTimer > 0 ? 0.05 : 0.14;
        if (run.playerY >= GROUND_Y - 2) {
          spawnDust(run.playerX - 14, GROUND_Y - 3, run.feverTimer > 0);
        } else if (run.feverTimer > 0) {
          spawnDust(run.playerX - 10, run.playerY - 18, true);
        }
      }
    }

    drawDustPuffs(ctx, dt);

    // Collectibles
    run.items.forEach((it) => drawItem(ctx, it, t));

    // Obstacles
    run.obstacles.forEach((ob) => drawObstacle(ctx, ob, t));

    // Loyal Shiba Puppy Pet running right behind!
    drawPuppyPet(ctx, run.playerX - 42, run.petY, t);

    // Runner Character
    drawCharacter(ctx, charDef, run.playerX, run.playerY, {
      sliding: run.sliding,
      inAir: run.playerY < (run.currentFloorY || GROUND_Y) - 1,
      gliding: run.gliding,
      invulnTimer: run.invulnTimer,
      shield: run.shield,
      feverTimer: run.feverTimer,
      umbrellaOn: run.umbrellaOn,
      maskOn: run.maskOn,
      umbrellaBrokenTimer: run.umbrellaBrokenTimer || 0,
      hitPoseTimer: run.hitPoseTimer || 0,
      itemPoseTimer: run.itemPoseTimer || 0,
      winPoseTimer: run.winPoseTimer || 0,
      running: true,
      scaleHeight: 50
    }, t);

    // Active Weather Atmosphere & Smoothly Transitioning Particles
    drawParticles(ctx, W, H, run.seasonId, dt, t, run.weatherEvent, run.prevSeasonId, blend);

    // FEVER! Full-screen Rainbow Edge + Speed Lines + Ribbon Banner!
    if (run.feverTimer > 0) {
      drawFeverOverlay(ctx, t);
    }

    // Red Damage Vignette Flash on Hit!
    if (run.hitFlashTimer > 0) {
      const a = Math.min(0.45, (run.hitFlashTimer / 0.3) * 0.42);
      ctx.strokeStyle = `rgba(255, 52, 52, ${a.toFixed(2)})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, W, H);
    }

    drawFloaters(ctx, dt);
    ctx.restore();
  }

  function renderHomePreview(ctx, charDef, t, forcedSeasonIdx = null) {
    const pw = 380, ph = 180, gy = 148;
    ctx.imageSmoothingEnabled = false;
    const seasonIdx = forcedSeasonIdx !== null ? (forcedSeasonIdx % 4) : (Math.floor(t / 6) % 4);
    const seasonId = window.RUN_DATA.SEASONS[seasonIdx].id;
    drawBackground(ctx, pw, ph, gy, seasonId, t * 48, t, null, 1, 'clear');
    drawPuppyPet(ctx, pw / 2 - 58, gy + 2, t, 38);
    drawCharacter(ctx, charDef, pw / 2 + 12, gy + 2, {
      sliding: false,
      inAir: false,
      gliding: false,
      invulnTimer: 0,
      shield: false,
      feverTimer: 0,
      running: true,
      scaleHeight: 70
    }, t);
    drawParticles(ctx, pw, ph, seasonId, 0.016, t, 'clear');
  }

  return {
    W,
    H,
    GROUND_Y,
    clearFloaters,
    spawnFloater,
    spawnDust,
    renderRunFrame,
    renderHomePreview
  };
})();
