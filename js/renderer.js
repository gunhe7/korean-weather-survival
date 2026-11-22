window.RunRenderer = (function () {
  const W = 560;
  const H = 315;
  const GROUND_Y = 258;

  let particles = [];
  let dustPuffs = [];
  let floaters = [];
  let pickupBursts = [];

  // ===================== PRELOAD ALL CHARACTER + DESIGN + WORLD SPRITES =====================
  const CHAR_SHEET_SKINS = [
    { id: 'yellow', frames: 3, runFrames: 8 },
    { id: 'blue', frames: 3, runFrames: 8 },
    { id: 'hanbok', frames: 2 },
    { id: 'skier', frames: 2 },
    { id: 'santa', frames: 2 },
    { id: 'catgirl', frames: 4, runFrames: 8 }
  ];
  const CHAR_ANIM_STATES = ['idle', 'run', 'jump', 'fall', 'slide', 'hurt', 'die'];
  const CHAR_VFX_SPRITES = ['fx_dash_gold', 'fx_dash_blue', 'fx_shield_ring', 'catgirl_fx_paw'];

  const DESIGN_SPRITES = [
    'item_coin', 'item_coin_1', 'item_coin_2', 'item_coin_side', 'item_star',
    'orb_star', 'orb_magnet', 'orb_bolt', 'orb_potion',
    'ui_chest', 'ui_fever', 'pet_dog'
  ];

  const ATLAS_SPRITES = [
    'dog_run_0', 'dog_run_1', 'dog_run_2', 'dog_run_3',
    'spr_umbrella', 'spr_shield', 'spr_mask'
  ];

  const WORLD_SPRITES = [
    'sp_cherry_tree', 'sp_flower_bush', 'sp_dust_cloud', 'sp_smog_cloud', 'sp_smog_city',
    'sp_rain_cloud', 'sp_thunder_cloud', 'sp_shower_cloud', 'sp_sun',
    'sp_spring_tile', 'sp_flower_patch', 'sp_flood_wave1', 'sp_flood_barricade', 'sp_flood_wave2',
    'sp_puddle', 'sp_red_umbrella', 'sp_traffic_cone', 'sp_warning_sign', 'sp_stump',
    'sp_summer_tree', 'sp_watermelon', 'sp_icecream', 'sp_gust_wind', 'sp_heat_waves',
    'sp_heat_mound', 'sp_cactus', 'sp_palm_tree', 'sp_beach_ball', 'sp_parasol',
    'sp_autumn_tree', 'sp_falling_leaves', 'sp_leaf_pile', 'sp_tornado', 'sp_fence',
    'sp_fallen_tree', 'sp_tilted_lamp', 'sp_red_car', 'sp_road_sign', 'sp_rock',
    'sp_winter_tree', 'sp_snowman', 'sp_snow_pile', 'sp_ice_spikes', 'sp_ice_tile',
    'sp_snowflake', 'sp_icicles', 'sp_snow_cloud', 'sp_ice_crystal', 'sp_snow_rock',
    'sp_mace', 'sp_spike_strip', 'sp_spike_stump', 'sp_spring_pad', 'sp_barricade',
    'sp_crate', 'sp_hazard_barrel', 'sp_green_bush', 'sp_metal_box', 'sp_siren_post',
    'sp_covid_walker', 'sp_covid_virus'
  ];

  const sprites = {};
  const CHAR_ASSET_VER = '20261121hd45';
  const CHEST_TIERS = ['wood', 'silver', 'gold', 'diamond'];

  CHEST_TIERS.forEach((tier) => {
    for (let f = 0; f < 8; f++) {
      const key = `chest_${tier}_${f}`;
      const img = new Image();
      img.src = `assets/chests/${key}.png?v=${CHAR_ASSET_VER}`;
      sprites[key] = img;
    }
  });

  CHAR_SHEET_SKINS.forEach((sk) => {
    CHAR_ANIM_STATES.forEach((st) => {
      const fCount = (st === 'run' && sk.runFrames) ? sk.runFrames : sk.frames;
      for (let f = 0; f < fCount; f++) {
        const key = `${sk.id}_${st}_${f}`;
        const img = new Image();
        img.src = `assets/chars/${key}.png?v=${CHAR_ASSET_VER}`;
        sprites[key] = img;
      }
    });
    const pKey = `port_${sk.id}`;
    const pImg = new Image();
    pImg.src = `assets/chars/${pKey}.png?v=${CHAR_ASSET_VER}`;
    sprites[pKey] = pImg;
  });

  CHAR_VFX_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/chars/${key}.png?v=${CHAR_ASSET_VER}`;
    sprites[key] = img;
  });

  DESIGN_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/design/${key}.png?v=${CHAR_ASSET_VER}`;
    sprites[key] = img;
  });

  ATLAS_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/atlas/${key}.png?v=${CHAR_ASSET_VER}`;
    sprites[key] = img;
  });

  WORLD_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/world/${key}.png?v=${CHAR_ASSET_VER}`;
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
    pickupBursts = [];
  }

  function spawnFloater(text, color, x, y) {
    floaters.push({ text, color, x, y, life: 0.95, maxLife: 0.95 });
  }

  function spawnPickupEffect(x, y, color = '#ffe55c', big = false) {
    pickupBursts.push({
      x,
      y,
      color,
      big,
      life: big ? 0.52 : 0.36,
      maxLife: big ? 0.52 : 0.36
    });
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function drawFourPointStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.36;
      const px = x + Math.cos(ang) * rr;
      const py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawPickupEffects(ctx, dt) {
    for (let i = pickupBursts.length - 1; i >= 0; i--) {
      const b = pickupBursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        pickupBursts.splice(i, 1);
        continue;
      }
      const prog = 1 - b.life / b.maxLife;
      const alpha = Math.max(0, 1 - prog);
      const maxR = b.big ? 38 : 22;
      const r = 6 + prog * maxR;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.big ? 2.8 : 2;
      ctx.beginPath();
      ctx.arc(Math.floor(b.x), Math.floor(b.y), r, 0, Math.PI * 2);
      ctx.stroke();

      const sparks = b.big ? 8 : 5;
      ctx.fillStyle = b.color;
      for (let k = 0; k < sparks; k++) {
        const ang = (Math.PI * 2 * k) / sparks + prog * 1.6;
        const sx = b.x + Math.cos(ang) * (r * 1.08);
        const sy = b.y + Math.sin(ang) * (r * 1.08);
        drawFourPointStar(ctx, sx, sy, (b.big ? 4.5 : 3.2) * (1 - prog * 0.35));
      }
      ctx.restore();
    }
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

  function spawnLandDust(x, y) {
    for (let i = 0; i < 4; i++) {
      const dir = i < 2 ? -1 : 1;
      dustPuffs.push({
        x: x + dir * (4 + Math.random() * 8),
        y: y - 2,
        vx: dir * (28 + Math.random() * 28) - 18,
        vy: -10 - Math.random() * 16,
        r: 4.5 + Math.random() * 2.5,
        isStar: false,
        life: 0.32,
        maxLife: 0.32
      });
    }
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

    // Stormy cloud darkening during rain / flood / gust, or crimson biohazard sky during covid!
    const isStormy = weatherEvent === 'rain' || weatherEvent === 'flood' || weatherEvent === 'gust';
    const isCovid = weatherEvent === 'covid';
    if (isStormy) {
      top = lerpHex(season.sky[0], '#2c4166', 0.55);
      mid = lerpHex(season.sky[1], '#4d658a', 0.45);
      bot = lerpHex(season.sky[2], '#8aa0bf', 0.4);
    } else if (isCovid) {
      top = lerpHex(season.sky[0], '#5a1834', 0.62);
      mid = lerpHex(season.sky[1], '#9c2d4e', 0.48);
      bot = lerpHex(season.sky[2], '#f29eb0', 0.42);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, top);
    grad.addColorStop(0.58, mid);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    // Soft glossy cartoon clouds (plump rounded puffs matching HD art style!)
    const cloudShadow = isCovid ? 'rgba(148, 56, 84, 0.65)' : (isStormy ? 'rgba(92, 112, 146, 0.72)' : 'rgba(184, 214, 255, 0.65)');
    const cloudMain = isCovid ? 'rgba(255, 224, 232, 0.88)' : (isStormy ? 'rgba(176, 194, 222, 0.90)' : 'rgba(255, 255, 255, 0.93)');
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 155 - scroll * 0.055 + t * 5.5) % (w + 130) + (w + 130)) % (w + 130) - 75;
      const cy = 28 + (i % 2) * 19;
      const sc = i % 2 === 0 ? 1.0 : 0.84;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      // Soft underside shadow
      ctx.fillStyle = cloudShadow;
      ctx.beginPath();
      ctx.arc(16, 10, 14, 0, Math.PI * 2);
      ctx.arc(34, 8, 18, 0, Math.PI * 2);
      ctx.arc(52, 11, 13, 0, Math.PI * 2);
      ctx.fill();
      // Plump bright top puffs
      ctx.fillStyle = cloudMain;
      ctx.beginPath();
      ctx.arc(15, 7, 13, 0, Math.PI * 2);
      ctx.arc(32, 3, 17, 0, Math.PI * 2);
      ctx.arc(50, 8, 12, 0, Math.PI * 2);
      ctx.arc(24, 10, 12, 0, Math.PI * 2);
      ctx.arc(41, 10, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Layered Smooth Curved Namsan Mountain Ridges (atmospheric parallax depth!)
    const mtnBase = lerpHex(prevSeason.mountain || '#7ea2d6', season.mountain || '#7ea2d6', f);
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = mtnBase;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - 46);
    ctx.quadraticCurveTo(w * 0.18, groundY - 82, w * 0.38, groundY - 58);
    ctx.quadraticCurveTo(w * 0.68, groundY - 96, w, groundY - 56);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const hillGrad = ctx.createLinearGradient(0, groundY - 102, 0, groundY);
    hillGrad.addColorStop(0, mtnBase);
    hillGrad.addColorStop(1, isStormy ? 'rgba(54, 74, 108, 0.92)' : 'rgba(92, 132, 188, 0.88)');
    ctx.fillStyle = hillGrad;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - 36);
    ctx.quadraticCurveTo(w * 0.16, groundY - 68, w * 0.34, groundY - 60);
    ctx.quadraticCurveTo(w * 0.52, groundY - 104, w * 0.72, groundY - 62);
    ctx.quadraticCurveTo(w * 0.88, groundY - 82, w, groundY - 58);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // Crisp Stylized N Seoul Tower on Namsan Peak with Glowing Observatory & Beacon
    const tx = Math.floor(w * 0.52);
    const ty = groundY - 84;
    ctx.save();
    // Base pavilion
    ctx.fillStyle = '#4c6da6';
    drawRoundRect(ctx, tx - 8, ty - 6, 16, 8, 2);
    ctx.fill();
    // Tapered shaft
    ctx.fillStyle = '#6c8ec4';
    ctx.beginPath();
    ctx.moveTo(tx - 3.2, ty - 5);
    ctx.lineTo(tx - 2.0, ty - 38);
    ctx.lineTo(tx + 2.0, ty - 38);
    ctx.lineTo(tx + 3.2, ty - 5);
    ctx.closePath();
    ctx.fill();
    // Observation pod (double-deck)
    ctx.fillStyle = '#4f71ab';
    drawRoundRect(ctx, tx - 9, ty - 34, 18, 9, 3);
    ctx.fill();
    // Glowing glass observatory windows
    ctx.fillStyle = isStormy ? '#ffe580' : '#e6f5ff';
    drawRoundRect(ctx, tx - 7, ty - 31.5, 14, 3.6, 1.5);
    ctx.fill();
    // Antenna spire
    ctx.fillStyle = '#5c7db5';
    ctx.fillRect(tx - 1, ty - 52, 2, 18);
    // Softly pulsing red aviation beacon
    const beaconPulse = 0.55 + Math.sin(t * 5) * 0.45;
    ctx.fillStyle = `rgba(255, 92, 108, ${beaconPulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(tx, ty - 53, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b78';
    ctx.beginPath();
    ctx.arc(tx, ty - 53, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Blazing Summer Sun sprite from uploaded sheet!
    if (seasonId === 'summer' && !isStormy) {
      const sunSpr = getSprite('sp_sun');
      if (sunSpr) {
        const sSz = 42 + Math.round(Math.sin(t * 3) * 2);
        ctx.drawImage(sunSpr, w - 66, 12, sSz, sSz);
      }
    }

    // Far Korean Skyline using uploaded sp_smog_city silhouette!
    const smogCitySpr = getSprite('sp_smog_city');
    if (smogCitySpr) {
      const cityOff = Math.floor(scroll * 0.16) % 160;
      ctx.save();
      ctx.globalAlpha = weatherEvent === 'dust' ? 0.72 : 0.42;
      for (let rep = -1; rep < 5; rep++) {
        const bx = rep * 160 - cityOff;
        ctx.drawImage(smogCitySpr, Math.floor(bx), groundY - 82, 110, 84);
      }
      ctx.restore();
    }

    // Midground Seasonal Trees, Bushes & Street Props strictly from uploaded sheet!
    const treeSpr = getSprite(season.tree);
    const treeAltSpr = getSprite(season.treeAlt || season.tree);
    const bushSpr = getSprite(season.bush);
    const propSpr = getSprite(season.prop);
    const propOff = Math.floor(scroll * 0.55) % 280;
    for (let rep = -1; rep <= 3; rep++) {
      const px = rep * 280 - propOff;
      if (treeSpr) {
        const th = 58;
        const tw = Math.round(th * (treeSpr.naturalWidth / treeSpr.naturalHeight));
        ctx.drawImage(treeSpr, Math.floor(px + 14), Math.floor(groundY - th + 4), tw, th);
      }
      if (bushSpr) {
        const bh = 26;
        const bw = Math.round(bh * (bushSpr.naturalWidth / bushSpr.naturalHeight));
        ctx.drawImage(bushSpr, Math.floor(px + 94), Math.floor(groundY - bh + 3), bw, bh);
      }
      if (treeAltSpr) {
        const th2 = 50;
        const tw2 = Math.round(th2 * (treeAltSpr.naturalWidth / treeAltSpr.naturalHeight));
        ctx.drawImage(treeAltSpr, Math.floor(px + 154), Math.floor(groundY - th2 + 4), tw2, th2);
      }
      if (propSpr) {
        const ph = season.prop === 'sp_flower_patch' ? 24 : 44;
        const pw = Math.round(ph * (propSpr.naturalWidth / propSpr.naturalHeight));
        ctx.drawImage(propSpr, Math.floor(px + 228), Math.floor(groundY - ph + 3), pw, ph);
      }
    }

    // Tiled Pixel Ground strictly from uploaded sheet (sp_spring_tile / sp_metal_box / sp_ice_tile)!
    const tileSpr = getSprite(season.tile) || getSprite('sp_spring_tile');
    const tileW = 46;
    const tileH = 34;
    const tileOff = Math.floor(scroll) % tileW;

    ctx.fillStyle = lerpHex(prevSeason.groundBase || '#57392c', season.groundBase || '#57392c', f);
    ctx.fillRect(0, groundY, w, h - groundY);

    if (tileSpr) {
      for (let gx = -tileOff; gx < w + tileW; gx += tileW) {
        ctx.drawImage(tileSpr, Math.floor(gx), groundY - 3, tileW, tileH);
      }
      ctx.fillStyle = 'rgba(18, 16, 32, 0.35)';
      ctx.fillRect(0, groundY + tileH - 4, w, h - (groundY + tileH - 4));
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
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 245, 255, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const gx = ((i * 92 - t * 380) % (w + 110) + (w + 110)) % (w + 110) - 80;
        const gy = 30 + (i * 31) % (GROUND_Y - 42);
        const len = 46 + (i % 3) * 18;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + len * 0.5, gy - 5 + Math.sin(t * 9 + i) * 4, gx + len, gy + 1);
        ctx.stroke();
      }
      ctx.restore();
    } else if (weatherEvent === 'ice_road') {
      ctx.fillStyle = 'rgba(135, 228, 255, 0.42)';
      ctx.fillRect(0, GROUND_Y - 3, w, 12);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      for (let i = 0; i < 8; i++) {
        const ix = ((i * 68 - t * 110) % (w + 40) + (w + 40)) % (w + 40) - 20;
        drawRoundRect(ctx, ix, GROUND_Y - 1, 16, 2.5, 1.2);
        ctx.fill();
      }
    } else if (weatherEvent === 'covid') {
      const pulse = 0.10 + Math.sin(t * 5) * 0.04;
      ctx.fillStyle = `rgba(210, 26, 68, ${pulse.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    const heavyRain = weatherEvent === 'rain' || weatherEvent === 'flood';
    const heavyDust = weatherEvent === 'dust';
    const isCovidParticles = weatherEvent === 'covid';
    const isBlizzard = seasonId === 'winter' && (weatherEvent === 'gust' || weatherEvent === 'ice_road');

    particles.forEach((p, idx) => {
      // During seasonal transition (blend < 1), smoothly swap particles from prevSeason -> seasonId!
      const usePrev = prevSeasonId && blend < 1 && (idx / particles.length) > blend;
      const effSeason = usePrev ? prevSeasonId : seasonId;

      if (isCovidParticles) {
        p.x -= 95 * dt * p.v;
        p.y += Math.sin(t * 5 + p.p) * 24 * dt;
        const r = p.s === 1 ? 2.6 : 1.9;
        ctx.fillStyle = p.s === 1 ? 'rgba(255, 58, 98, 0.85)' : 'rgba(255, 130, 155, 0.72)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (heavyRain) {
        p.x -= 165 * dt * p.v;
        p.y += 315 * dt * p.v;
        ctx.strokeStyle = 'rgba(195, 234, 255, 0.86)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 5.5, p.y + 12);
        ctx.stroke();
      } else if (heavyDust) {
        p.x -= 120 * dt * p.v;
        p.y += Math.sin(t * 4 + p.p) * 18 * dt;
        ctx.fillStyle = p.s === 1 ? 'rgba(235, 198, 75, 0.82)' : 'rgba(196, 152, 46, 0.74)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s === 1 ? 2.4 : 1.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (effSeason === 'summer') {
        p.x -= 48 * dt * p.v;
        p.y += Math.sin(t * 3 + p.p) * 14 * dt;
        ctx.fillStyle = 'rgba(255, 245, 175, 0.76)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (effSeason === 'winter' || weatherEvent === 'ice_road') {
        p.x -= ((isBlizzard ? 185 : 52) + Math.sin(t * 2 + p.p) * 18) * dt;
        p.y += (isBlizzard ? 88 : 52) * dt * p.v;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * 0.9 + 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (effSeason === 'autumn' || weatherEvent === 'gust') {
        p.x -= (weatherEvent === 'gust' ? 235 : 115) * dt * p.v;
        p.y += (34 + Math.sin(t * 4 + p.p) * 18) * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 4 + p.p);
        ctx.fillStyle = p.s === 1 ? '#ff7930' : '#ffcf48';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Soft spinning cherry blossom petals!
        p.x -= 64 * dt * p.v;
        p.y += (26 + Math.sin(t * 3 + p.p) * 14) * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * 3 + p.p);
        ctx.fillStyle = p.s === 1 ? '#ffa8cd' : '#ffe2ef';
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.8, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (p.y > h) { p.y = -6; p.x = Math.random() * (w + 60); }
      if (p.x < -10) { p.x = w + 10; p.y = Math.random() * h; }
    });
  }

  // ===================== KOREAN STREET INTERACTIVE FEATURES (100% UPLOADED SPRITES!) =====================
  function drawStreetFeatures(ctx, run, t) {
    // 1. Rising Floodwater Waves strictly using uploaded sp_flood_wave1 / sp_flood_wave2!
    if (run.weatherEvent === 'flood') {
      const waveY = Math.round(Math.sin(t * 7) * 2);
      ctx.fillStyle = 'rgba(34, 110, 198, 0.45)';
      ctx.fillRect(0, GROUND_Y - 12 + waveY, W, 18);
      const wSpr = getSprite('sp_flood_wave2') || getSprite('sp_flood_wave1');
      if (wSpr) {
        const wOff = Math.floor(run.scroll * 0.75) % 58;
        ctx.save();
        ctx.globalAlpha = 0.85;
        for (let wx = -wOff; wx < W + 60; wx += 58) {
          ctx.drawImage(wSpr, Math.floor(wx), GROUND_Y - 22 + waveY, 54, 26);
        }
        ctx.restore();
      }
    }

    (run.features || []).forEach((f) => {
      const x = Math.floor(f.x);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (f.kind === 'spring_pad') {
        // Bouncy Red Spring Jump Pad (sp_spring_pad)!
        const spr = getSprite('sp_spring_pad');
        const bounceH = f.triggered ? 44 : 36;
        if (spr) {
          ctx.drawImage(spr, x + 4, GROUND_Y - bounceH, 36, bounceH);
        }
      } else if (f.kind === 'cool_spot') {
        // Cooling Parasol Rest Spot (sp_parasol + sp_watermelon / sp_icecream)!
        ctx.fillStyle = 'rgba(20, 52, 108, 0.34)';
        ctx.fillRect(x, GROUND_Y - 10, f.w, 12);
        const pSpr = getSprite('sp_parasol');
        const treatSpr = getSprite(run.seasonId === 'summer' ? 'sp_watermelon' : 'sp_icecream');
        if (pSpr) ctx.drawImage(pSpr, x + 6, GROUND_Y - 62, 60, 62);
        if (treatSpr && !f.triggered) {
          const bob = Math.round(Math.sin(t * 7) * 3);
          ctx.drawImage(treatSpr, x + 48, GROUND_Y - 30 + bob, 24, 24);
        }
      } else if (f.kind === 'shade_tree' || f.kind === 'shade_palm' || f.kind === 'shade_parasol') {
        // Summer Shade Hopping strictly using sp_summer_tree / sp_palm_tree / sp_parasol!
        ctx.fillStyle = 'rgba(18, 48, 104, 0.36)';
        ctx.fillRect(x - 2, GROUND_Y - 11, f.w + 4, 14);
        const sprKey = f.kind === 'shade_palm' ? 'sp_palm_tree' : (f.kind === 'shade_parasol' ? 'sp_parasol' : 'sp_summer_tree');
        const spr = getSprite(sprKey);
        if (spr) {
          const sh = f.kind === 'shade_parasol' ? 62 : 84;
          const sw = Math.round(sh * (spr.naturalWidth / spr.naturalHeight));
          ctx.drawImage(spr, Math.floor(x + (f.w - sw) / 2), GROUND_Y - sh + 4, sw, sh);
        }
        ctx.fillStyle = '#a8ecff';
        ctx.font = '800 9px "Paperlogy", sans-serif';
        ctx.fillText('그늘', x + Math.floor(f.w / 2) - 10, GROUND_Y - 1);
      } else if (f.kind === 'car_roof') {
        // Flooded Red Car Platform strictly using sp_red_car!
        const spr = getSprite('sp_red_car');
        if (spr) {
          ctx.drawImage(spr, x + 4, f.platformY - 6, f.w - 8, GROUND_Y - f.platformY + 8);
        }
      } else if (f.kind === 'crate_plat' || f.kind === 'metal_plat') {
        // Dry Crate / Metal Box Platform during Flood strictly using sp_crate / sp_metal_box!
        const spr = getSprite(f.kind === 'metal_plat' ? 'sp_metal_box' : 'sp_crate');
        if (spr) {
          const tiles = Math.max(1, Math.round(f.w / 34));
          const tw = Math.floor(f.w / tiles);
          const th = GROUND_Y - f.platformY + 4;
          for (let k = 0; k < tiles; k++) {
            ctx.drawImage(spr, x + k * tw, f.platformY, tw, th);
          }
        }
      }
    });
  }

  function drawPassingCar(ctx, car, t) {
    if (!car) return;
    if (car.phase === 'warn') {
      const blink = Math.floor(t * 14) % 2 === 0;
      const bx = W - 128;
      const by = GROUND_Y - 68;
      const bw = 118;
      const bh = 26;
      ctx.save();
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, blink ? '#ff4d5a' : '#ffad2b');
      grad.addColorStop(1, blink ? '#c91228' : '#d96900');
      drawRoundRect(ctx, bx, by, bw, bh, 13);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#09152e';
      ctx.stroke();
      drawRoundRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 11);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.stroke();
      ctx.font = '900 11px "Paperlogy", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = '#09152e';
      ctx.strokeText('💦 물벼락 주의! 점프!', bx + bw / 2, by + 17);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('💦 물벼락 주의! 점프!', bx + bw / 2, by + 17);
      ctx.restore();
    } else if (car.phase === 'pass') {
      const x = Math.floor(car.x);
      const carSpr = getSprite('sp_red_car');
      const waveSpr = getSprite('sp_flood_wave1') || getSprite('sp_flood_wave2');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (waveSpr) {
        const ow = getOutlinedObstacleSprite('sp_flood_wave_pass', waveSpr);
        if (ow) {
          const px = 62 * ow.padRatioX;
          const py = 46 * ow.padRatioY;
          ctx.drawImage(ow.canvas, x + 16 - px, GROUND_Y - 48 - py, 62 + px * 2, 46 + py * 2);
        } else {
          ctx.drawImage(waveSpr, x + 16, GROUND_Y - 48, 62, 46);
        }
      }
      if (carSpr) {
        const oc = getOutlinedObstacleSprite('sp_red_car_pass', carSpr);
        if (oc) {
          const px = 56 * oc.padRatioX;
          const py = 48 * oc.padRatioY;
          ctx.drawImage(oc.canvas, x - px, GROUND_Y - 46 - py, 56 + px * 2, 48 + py * 2);
        } else {
          ctx.drawImage(carSpr, x, GROUND_Y - 46, 56, 48);
        }
      }
    }
  }

  function drawCovidAttack(ctx, attack, playerX, playerY, t) {
    if (!attack) return;
    const spr = getSprite('sp_covid_virus');
    const ax = attack.x;
    const ay = attack.y;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (attack.phase === 'warn') {
      const ratio = Math.max(0, Math.min(1, attack.timer / (attack.maxTimer || 1.45)));
      const blink = Math.floor(t * 14) % 2 === 0;
      const targetX = playerX + 10;
      const targetY = playerY - 30;

      // Dashed crimson aim laser toward runner
      ctx.save();
      ctx.strokeStyle = blink ? 'rgba(255, 45, 85, 0.82)' : 'rgba(255, 196, 72, 0.72)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 75;
      ctx.beginPath();
      ctx.moveTo(ax - 18, ay);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.restore();

      // Shrinking timing-lock halo around hovering virus
      const lockR = 24 + ratio * 26;
      ctx.save();
      ctx.strokeStyle = ratio < 0.38 ? '#ffe247' : '#ff385c';
      ctx.lineWidth = ratio < 0.38 ? 3.2 : 2.2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(ax, ay, lockR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Pulsing danger glow behind virus
      const glowGrad = ctx.createRadialGradient(ax, ay, 4, ax, ay, 36);
      glowGrad.addColorStop(0, 'rgba(255, 40, 82, 0.55)');
      glowGrad.addColorStop(1, 'rgba(255, 40, 82, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(ax, ay, 36, 0, Math.PI * 2);
      ctx.fill();

      // Trembling angry coronavirus sprite
      const jitterX = Math.sin(t * 48) * 2.2;
      const jitterY = Math.cos(t * 42) * 2.2;
      const sz = Math.round(52 + (1 - ratio) * 8);
      if (spr) {
        ctx.drawImage(spr, Math.floor(ax + jitterX - sz / 2), Math.floor(ay + jitterY - sz / 2), sz, sz);
      } else {
        ctx.fillStyle = '#ff2b55';
        ctx.beginPath();
        ctx.arc(ax + jitterX, ay + jitterY, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glossy cartoon warning pill directly above virus
      const bx = Math.min(W - 144, Math.max(8, ax - 70));
      const by = Math.max(12, ay - 56);
      const bw = 136;
      const bh = 24;
      const pGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
      pGrad.addColorStop(0, blink ? '#ff335c' : '#ff9814');
      pGrad.addColorStop(1, blink ? '#b80e32' : '#d65c00');
      drawRoundRect(ctx, bx, by, bw, bh, 12);
      ctx.fillStyle = pGrad;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#09152e';
      ctx.stroke();
      drawRoundRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 10);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.stroke();
      ctx.font = '900 10.5px "Paperlogy", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#09152e';
      ctx.strokeText('🦠 돌진! 마스크 착용!', bx + bw / 2, by + 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🦠 돌진! 마스크 착용!', bx + bw / 2, by + 16);
    } else if (attack.phase === 'charge') {
      // High-speed crimson shockwave trail behind charging virus
      for (let k = 1; k <= 3; k++) {
        ctx.save();
        ctx.globalAlpha = 0.28 - k * 0.07;
        ctx.fillStyle = '#ff2b55';
        ctx.beginPath();
        ctx.arc(ax + k * 15, ay, Math.max(10, 24 - k * 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Fast spinning charging virus
      const sz = 54;
      ctx.translate(ax, ay);
      ctx.rotate(-t * 14);
      if (spr) {
        const outlined = getOutlinedObstacleSprite('sp_covid_virus_rush', spr);
        if (outlined) {
          const px = sz * outlined.padRatioX;
          const py = sz * outlined.padRatioY;
          ctx.drawImage(outlined.canvas, -sz / 2 - px, -sz / 2 - py, sz + px * 2, sz + py * 2);
        } else {
          ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
        }
      } else {
        ctx.fillStyle = '#ff2b55';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (attack.phase === 'deflected') {
      const alpha = Math.max(0, Math.min(1, (attack.deflectTimer || 0) / 0.55));
      ctx.globalAlpha = alpha;
      const sz = 48;
      ctx.translate(ax, ay);
      ctx.rotate(t * 20);
      if (spr) {
        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.fillStyle = '#ff5e7e';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dog, Math.floor(x - w / 2), Math.floor(y - h - hop), w, h);
  }

  // ===================== UPLOADED 7-STATE PIXEL K-CHARACTER SPRITE RENDERER =====================
  function pickCharacterSprite(charDef, opts, t) {
    const customSkin = opts.skinDef && opts.skinDef.customAnimSkin ? opts.skinDef : null;
    const skin = customSkin ? customSkin.customAnimSkin : (charDef.animSkin || 'yellow');
    const n = customSkin ? (customSkin.customAnimFrames || 4) : (charDef.animFrames || 2);

    if (opts.dead) {
      const prog = opts.deathProgress !== undefined ? opts.deathProgress : 1;
      const frame = Math.min(n - 1, Math.floor(Math.max(0, prog) * n));
      return getSprite(`${skin}_die_${frame}`) || getSprite(`${skin}_die_0`);
    }
    if (opts.hitPoseTimer > 0) {
      const frame = Math.floor(t * 11) % n;
      return getSprite(`${skin}_hurt_${frame}`) || getSprite(`${skin}_hurt_0`);
    }
    if (opts.sliding) {
      const frame = Math.floor(t * 10) % n;
      return getSprite(`${skin}_slide_${frame}`) || getSprite(`${skin}_slide_0`);
    }
    if (opts.inAir) {
      const state = (opts.vy !== undefined && opts.vy < 0) ? 'jump' : 'fall';
      const frame = Math.floor(t * 9) % n;
      return getSprite(`${skin}_${state}_${frame}`) || getSprite(`${skin}_${state}_0`);
    }
    if (opts.running) {
      const rn = customSkin ? (customSkin.customRunFrames || n) : (charDef.runFrames || n);
      const fps = rn >= 6 ? 13 : (rn >= 3 ? 10 : 8.5);
      const frame = Math.floor(t * fps) % rn;
      return getSprite(`${skin}_run_${frame}`) || getSprite(`${skin}_run_0`);
    }
    const idleFrame = Math.floor(t * 3.5) % n;
    return getSprite(`${skin}_idle_${idleFrame}`) || getSprite(`${skin}_idle_0`);
  }

  function drawCharacter(ctx, charDef, x, y, opts, t) {
    const {
      sliding, inAir, gliding, invulnTimer, shield, feverTimer, running,
      dead = false, speedBoostTimer = 0, skinDef = null,
      umbrellaOn = false, maskOn = false, maskParryTimer = 0, umbrellaBrokenTimer = 0,
      gustWarning = false,
      scaleHeight = 52
    } = opts;

    if (!dead && invulnTimer > 0 && Math.floor(t * 20) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    const col = charDef.colors || {};
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const isProne = sliding || dead;

    if (!inAir) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 16, 36, 0.30)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1, isProne ? 22 : 15, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Uploaded Golden / Blue Dash VFX streaks behind character during FEVER or Speed Boost!
    if (!dead && (feverTimer > 0 || speedBoostTimer > 0)) {
      const dashSpr = getSprite(feverTimer > 0 ? 'fx_dash_gold' : 'fx_dash_blue');
      if (dashSpr) {
        const pulse = 0.92 + Math.sin(t * 24) * 0.1;
        const dh = Math.round((isProne ? 26 : 34) * pulse);
        const dw = Math.round(dh * (dashSpr.naturalWidth / dashSpr.naturalHeight));
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(dashSpr, Math.floor(cx - dw - 2), Math.floor(cy - (isProne ? 22 : scaleHeight * 0.56) - dh / 2), dw, dh);
        ctx.restore();
      }
    }

    // Fever rainbow aura / Uploaded glowing Shield Ring VFX!
    if (!dead && feverTimer > 0) {
      ctx.strokeStyle = Math.floor(t * 14) % 2 === 0 ? '#ffe85c' : '#63e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - (isProne ? 14 : scaleHeight * 0.48), isProne ? 24 : scaleHeight * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    } else if (!dead && shield) {
      const ringSpr = getSprite((skinDef && skinDef.customShieldVfx) || 'fx_shield_ring');
      if (ringSpr) {
        const pulse = 1 + Math.sin(t * 8) * 0.05;
        const rSz = Math.round((isProne ? 50 : scaleHeight * 1.24) * pulse);
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(ringSpr, Math.floor(cx - rSz / 2), Math.floor(cy - (isProne ? 16 : scaleHeight * 0.5) - rSz / 2), rSz, rSz);
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(110, 220, 255, 0.92)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - (isProne ? 14 : scaleHeight * 0.48), isProne ? 23 : scaleHeight * 0.54, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Uploaded Sky-Blue & White Umbrella sprite (shakes violently during Typhoon gust until folded, flips away if broken!)
    const showUmbrella = !dead && ((col.umbrella && gliding) || umbrellaOn);
    const umbSpr = getSprite('spr_umbrella');
    if (showUmbrella && umbSpr) {
      const uy = cy - (isProne ? 26 : scaleHeight) - 8;
      const uh = 44;
      const uw = Math.round(uh * (umbSpr.naturalWidth / umbSpr.naturalHeight));
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (gustWarning) {
        // Diegetic visual cue: typhoon wind violently rattles & pulls the umbrella backward!
        const jitterX = Math.sin(t * 54) * 2.5 - 3;
        const tilt = -0.24 + Math.sin(t * 44) * 0.14;
        ctx.translate(cx + 8 + jitterX, uy - 2);
        ctx.rotate(tilt);
        ctx.drawImage(umbSpr, Math.floor(-uw / 2), Math.floor(-uh * 0.52), uw, uh);
      } else {
        ctx.drawImage(umbSpr, Math.floor(cx - uw / 2 + 8), Math.floor(uy - 24), uw, uh);
      }
      ctx.restore();
    } else if (!dead && umbrellaBrokenTimer > 0 && umbSpr) {
      // Crisp flipped real umbrella sprite flying backward when snapped by typhoon!
      const prog = Math.max(0, Math.min(1, 1 - umbrellaBrokenTimer / 0.85));
      const uy = cy - scaleHeight - 10 - prog * 34;
      const ux = cx + 6 - prog * 46;
      const uh = 40;
      const uw = Math.round(uh * (umbSpr.naturalWidth / umbSpr.naturalHeight));
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      ctx.translate(ux, uy);
      ctx.rotate(-0.5 - prog * 2.4);
      ctx.scale(1, -0.82);
      ctx.drawImage(umbSpr, Math.floor(-uw / 2), Math.floor(-uh / 2), uw, uh);
      ctx.restore();
    }

    // Glowing emerald-cyan KF94 Timing Seal Ring while fresh mask parry window is active!
    if (!dead && maskOn && maskParryTimer > 0) {
      const pRatio = Math.max(0, Math.min(1, maskParryTimer / 1.85));
      const pR = isProne ? 25 : Math.round(scaleHeight * 0.56);
      const pCy = cy - (isProne ? 14 : scaleHeight * 0.48);
      ctx.save();
      ctx.strokeStyle = 'rgba(84, 255, 190, 0.28)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, pCy, pR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#5effbe';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, pCy, pR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pRatio);
      ctx.stroke();
      ctx.restore();
    }

    if (sliding && !dead) {
      ctx.save();
      const dustShift = (t * 42) % 10;
      ctx.fillStyle = 'rgba(255, 248, 236, 0.72)';
      ctx.beginPath();
      ctx.arc(cx - 22 - dustShift * 0.8, cy - 4, 5.2, 0, Math.PI * 2);
      ctx.arc(cx - 29 - dustShift, cy - 3, 3.8, 0, Math.PI * 2);
      ctx.arc(cx - 18 - dustShift * 0.5, cy - 8, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Character-Specific Unique Animated Aura + Equipped Skin Radiant Trail!
    if (running && !dead && skinDef && skinDef.trail) {
      const tr = skinDef.trail;
      const isHigh = skinDef.rarity === 'legendary' || skinDef.rarity === 'mythic' || skinDef.rarity === 'epic';
      const cnt = isHigh ? 6 : 3;
      for (let k = 0; k < cnt; k++) {
        const ox = ((t * (isHigh ? 74 : 52) + k * 11) % 38);
        const oy = Math.sin(t * 9 + k * 1.9) * (isHigh ? 14 : 8);
        ctx.fillStyle = tr[k % tr.length];
        const sz = isHigh && k % 2 === 0 ? 4 : 3;
        ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - scaleHeight * 0.48 + oy), sz, sz);
      }
      if (isHigh) {
        const customAura = skinDef.customShieldVfx ? getSprite(skinDef.customShieldVfx) : null;
        if (customAura) {
          const pulse = 0.96 + Math.sin(t * 7) * 0.06;
          const aSz = Math.round((isProne ? 46 : scaleHeight * 1.12) * pulse);
          ctx.save();
          ctx.globalAlpha = 0.34 + Math.sin(t * 6) * 0.10;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(customAura, Math.floor(cx - aSz / 2), Math.floor(cy - (isProne ? 16 : scaleHeight * 0.5) - aSz / 2), aSz, aSz);
          ctx.restore();
        } else {
          ctx.save();
          ctx.strokeStyle = skinDef.glow || tr[0];
          ctx.globalAlpha = 0.42 + Math.sin(t * 8) * 0.16;
          ctx.lineWidth = skinDef.rarity === 'mythic' ? 2.5 : 1.8;
          ctx.beginPath();
          ctx.arc(cx, cy - (isProne ? 16 : scaleHeight * 0.5), isProne ? 26 : scaleHeight * 0.54, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    } else if (running && !dead && charDef.auraType) {
      const aura = charDef.auraType;
      if (aura === 'skier') {
        for (let k = 0; k < 3; k++) {
          const ox = ((t * 58 + k * 14) % 28);
          const oy = Math.sin(t * 9 + k * 2) * 5;
          ctx.fillStyle = k % 2 === 0 ? '#a8f4ff' : '#ffffff';
          ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - 6 + oy), 4, 2);
        }
      } else if (aura === 'raincoat') {
        for (let k = 0; k < 3; k++) {
          const ang = t * 4.5 + k * 2.1;
          ctx.fillStyle = '#70e4ff';
          ctx.fillRect(Math.floor(cx + Math.cos(ang) * 18), Math.floor(cy - scaleHeight * 0.45 + Math.sin(ang) * 12), 3, 3);
        }
      } else if (aura === 'padding') {
        ctx.strokeStyle = `rgba(115, 200, 255, ${(0.35 + Math.sin(t * 7) * 0.2).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy - scaleHeight * 0.46, scaleHeight * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      } else if (aura === 'hanbok') {
        for (let k = 0; k < 3; k++) {
          const ox = ((t * 44 + k * 16) % 32);
          const oy = Math.sin(t * 7 + k * 2.4) * 9;
          ctx.fillStyle = k === 0 ? '#ffe566' : '#85d6ff';
          ctx.fillRect(Math.floor(cx - 14 - ox), Math.floor(cy - scaleHeight * 0.5 + oy), 4, 3);
        }
      } else if (aura === 'santa') {
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
      // Prone poses (Slide & Die) are naturally horizontal (~66x52 vs ~60x78 standing):
      // 0.67 height keeps head & body scale pixel-consistent across every animation state!
      const targetH = isProne ? Math.round(scaleHeight * 0.67) : scaleHeight;
      const ratio = (spr.naturalWidth > 0 && spr.naturalHeight > 0) ? (spr.naturalWidth / spr.naturalHeight) : 1;
      const drawW = Math.max(1, Math.round(targetH * ratio));
      const drawH = Math.max(1, targetH);

      const bob = running && !dead && !inAir && !sliding ? Math.abs(Math.sin(t * 14)) * 2.0 : 0;
      const sx = opts.squashX !== undefined ? opts.squashX : 1;
      const sy = opts.squashY !== undefined ? opts.squashY : 1;

      ctx.save();
      ctx.translate(cx, Math.floor(cy - bob));
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (skinDef && skinDef.filter && skinDef.filter !== 'none' && 'filter' in ctx) {
        ctx.filter = skinDef.filter;
      }
      ctx.drawImage(spr, Math.floor(-drawW / 2), Math.floor(-drawH), drawW, drawH);
      if ('filter' in ctx) ctx.filter = 'none';

      // Uploaded KF94 Mask Sprite overlay when Mask Toggle is ON!
      if (maskOn && !dead) {
        const maskSpr = getSprite('spr_mask');
        if (maskSpr) {
          const mw = sliding ? 20 : 22;
          const mh = Math.round(mw * (maskSpr.naturalHeight / maskSpr.naturalWidth));
          const mx = sliding ? Math.floor(drawW * 0.04) : Math.floor(-mw * 0.14);
          const my = sliding ? Math.floor(-drawH * 0.42) : Math.floor(-drawH * 0.50);
          ctx.drawImage(maskSpr, mx, my, mw, mh);
        } else {
          const my = sliding ? Math.floor(-drawH * 0.34) : Math.floor(-drawH * 0.44);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.floor(drawW * 0.04), my, 12, 7);
          ctx.strokeStyle = '#9bb8d4';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.floor(drawW * 0.04), my, 12, 7);
        }
      }

      if (col.coffeeCup && !isProne) {
        ctx.fillStyle = 'rgba(225, 248, 255, 0.95)';
        ctx.fillRect(Math.floor(drawW * 0.36), Math.floor(-drawH * 0.50), 7, 10);
        ctx.fillStyle = '#4a2c16';
        ctx.fillRect(Math.floor(drawW * 0.36) + 1, Math.floor(-drawH * 0.50) + 3, 5, 6);
        ctx.fillStyle = '#9ce8ff';
        ctx.fillRect(Math.floor(drawW * 0.36) + 1, Math.floor(-drawH * 0.50) + 2, 2, 2);
        ctx.fillStyle = '#24c464';
        ctx.fillRect(Math.floor(drawW * 0.36) + 3, Math.floor(-drawH * 0.50) - 4, 2, 5);
      }

      ctx.restore();
    } else {
      ctx.fillStyle = col.top || '#f5b82e';
      ctx.fillRect(cx - 10, cy - (isProne ? 18 : 36), 20, isProne ? 18 : 36);
    }

    ctx.globalAlpha = 1;
  }

  // ===================== CACHED CRISP RED DANGER OUTLINE FOR ALL OBSTACLES =====================
  const obstacleOutlineCache = {};

  function getOutlinedObstacleSprite(key, spr) {
    if (!spr || !spr.complete || !spr.naturalWidth || !spr.naturalHeight) return null;
    if (obstacleOutlineCache[key]) return obstacleOutlineCache[key];

    const sw = spr.naturalWidth;
    const sh = spr.naturalHeight;
    // Consistent bold red contour (~2.2px~2.6px on screen) hugging exact sprite alpha shape!
    const outlineR = Math.max(3, Math.round(Math.max(sw, sh) * 0.062));
    const glowR = outlineR + Math.max(2, Math.round(outlineR * 0.45));
    const pad = glowR + 2;
    const cw = sw + pad * 2;
    const ch = sh + pad * 2;

    const sil = document.createElement('canvas');
    sil.width = sw;
    sil.height = sh;
    const sctx = sil.getContext('2d');
    sctx.drawImage(spr, 0, 0, sw, sh);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#ff1e38';
    sctx.fillRect(0, 0, sw, sh);

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    // Soft outer crimson danger aura
    octx.globalAlpha = 0.45;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      octx.drawImage(sil, pad + Math.cos(ang) * glowR, pad + Math.sin(ang) * glowR);
    }

    // Crisp solid red danger outline hugging obstacle contour
    octx.globalAlpha = 1;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      octx.drawImage(sil, pad + Math.cos(ang) * outlineR, pad + Math.sin(ang) * outlineR);
    }

    // Original obstacle art cleanly layered on top
    octx.drawImage(spr, pad, pad, sw, sh);

    const entry = { canvas: out, padRatioX: pad / sw, padRatioY: pad / sh };
    obstacleOutlineCache[key] = entry;
    return entry;
  }

  // ===================== UPLOADED SEASONAL SHEET OBSTACLES ONLY =====================
  function drawObstacle(ctx, ob, t) {
    // Right-edge glossy cartoon warning badge before fast flying aerial obstacle enters
    if (ob.warn && ob.x > W - 18 && ob.lane !== 'icicle') {
      const wy = Math.floor(ob.y + ob.h / 2);
      const blink = Math.floor(t * 14) % 2 === 0;
      ctx.save();
      drawRoundRect(ctx, W - 28, wy - 13, 22, 26, 8);
      ctx.fillStyle = blink ? '#ff2b44' : '#ff9814';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#09152e';
      ctx.stroke();
      drawRoundRect(ctx, W - 26, wy - 11, 18, 22, 6);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.stroke();
      ctx.font = '900 16px "Paperlogy", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#09152e';
      ctx.strokeText('!', W - 17, wy + 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', W - 17, wy + 6);
      ctx.restore();
      return;
    }

    const x = Math.floor(ob.x);
    let y = Math.floor(ob.y);

    if (ob.lane === 'air') {
      y += Math.round(Math.sin(t * 9 + ob.x * 0.04) * 3);
    }

    // Top glossy rounded warning badge while winter icicles hang before dropping
    if (ob.lane === 'icicle' && y < 38) {
      const blink = Math.floor(t * 16) % 2 === 0;
      const ix = x + Math.floor(ob.w / 2);
      ctx.save();
      drawRoundRect(ctx, ix - 10, 4, 20, 18, 7);
      ctx.fillStyle = blink ? '#ff2b44' : '#2dbdff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#09152e';
      ctx.stroke();
      ctx.font = '900 12px "Paperlogy", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', ix, 17);
      ctx.restore();
    }

    const spr = getSprite(ob.sprite);
    if (spr) {
      const outlined = getOutlinedObstacleSprite(ob.sprite, spr);
      const drawImg = outlined ? outlined.canvas : spr;
      const px = outlined ? ob.w * outlined.padRatioX : 0;
      const py = outlined ? ob.h * outlined.padRatioY : 0;
      const dw = ob.w + px * 2;
      const dh = ob.h + py * 2;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (ob.sprite === 'sp_mace' || ob.sprite === 'sp_snowflake' || ob.sprite === 'sp_red_umbrella') {
        ctx.translate(x + ob.w / 2, y + ob.h / 2);
        const spd = ob.sprite === 'sp_mace' ? -5.5 : (ob.sprite === 'sp_snowflake' ? -3.4 : Math.sin(t * 7) * 0.35);
        ctx.rotate(ob.sprite === 'sp_red_umbrella' ? spd : t * spd);
        ctx.drawImage(drawImg, -dw / 2, -dh / 2, dw, dh);
      } else if (ob.sprite === 'sp_covid_walker') {
        // Tired infected pedestrian walking toward the player with natural step bob & sway!
        const stepPhase = t * 9.5 + (ob.stepSeed || 0);
        const walkBob = Math.abs(Math.sin(stepPhase)) * 3.0;
        const walkSway = Math.sin(stepPhase) * 0.055;
        ctx.fillStyle = 'rgba(8, 16, 36, 0.28)';
        ctx.beginPath();
        ctx.ellipse(x + ob.w / 2, y + ob.h, ob.w * 0.44, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.translate(x + ob.w / 2, y + ob.h - walkBob);
        ctx.rotate(walkSway);
        ctx.drawImage(drawImg, -dw / 2, -dh + py, dw, dh);
      } else {
        ctx.drawImage(drawImg, x - px, y - py, dw, dh);
      }
      ctx.restore();
    }
  }

  // ===================== GLOSSY TRANSLUCENT BUBBLE CONTAINER FOR ITEMS =====================
  function drawItemBubbleBack(ctx, x, y, r, tintRgba) {
    ctx.save();
    const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.12, x, y, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    grad.addColorStop(0.68, tintRgba);
    grad.addColorStop(1, 'rgba(180, 238, 255, 0.52)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawItemBubbleFront(ctx, x, y, r, rimColor, t) {
    ctx.save();
    // Outer glossy crystal rim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Soft colored outer aura rim
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.72 + Math.sin(t * 9 + x * 0.04) * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
    ctx.stroke();

    // Bright curved top-left specular crescent highlight
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, Math.PI * 1.12, Math.PI * 1.46);
    ctx.stroke();

    // Crisp specular reflection dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - r * 0.42, y - r * 0.42, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // Subtle bottom-right iridescent bounce highlight
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.76, Math.PI * 0.14, Math.PI * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  // ===================== DESIGN SHEET COINS & BUBBLE-TRAPPED ITEMS =====================
  function drawItem(ctx, it, t) {
    const x = Math.floor(it.x);
    const y = Math.floor(it.y + Math.sin(t * 7 + it.x * 0.05) * 2.5);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (it.kind === 'coin' || it.kind === 'big_coin') {
      // Smooth 6-step 3D spinning star coin using all 4 uploaded angle frames!
      const spinSeq = [
        { key: 'item_coin', flip: false },
        { key: 'item_coin_1', flip: false },
        { key: 'item_coin_2', flip: false },
        { key: 'item_coin_side', flip: false },
        { key: 'item_coin_2', flip: true },
        { key: 'item_coin_1', flip: true }
      ];
      const step = spinSeq[Math.floor(t * 10 + it.x * 0.04) % spinSeq.length];
      const spr = getSprite(step.key) || getSprite('item_coin');
      const sz = it.kind === 'big_coin' ? 28 : 21;
      if (spr) {
        if (step.flip) {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(-1, 1);
          ctx.drawImage(spr, Math.floor(-sz / 2), Math.floor(-sz / 2), sz, sz);
          ctx.restore();
        } else {
          ctx.drawImage(spr, Math.floor(x - sz / 2), Math.floor(y - sz / 2), sz, sz);
        }
      } else {
        ctx.fillStyle = '#ffd447';
        ctx.beginPath(); ctx.arc(x, y, sz / 2, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }

    // All power-up / utility items float trapped inside a glossy iridescent bubble!
    const wobble = Math.sin(t * 6.5 + it.x * 0.04) * 1.0;
    const bubbleR = 19 + wobble;
    let tint = 'rgba(130, 224, 255, 0.26)';
    let rim = '#7ef0ff';
    if (it.kind === 'star' || it.kind === 'umbrella_fever' || it.kind === 'chest') {
      tint = 'rgba(255, 224, 92, 0.26)';
      rim = '#ffe359';
    } else if (it.kind === 'coffee') {
      tint = 'rgba(105, 245, 175, 0.26)';
      rim = '#70f5b3';
    } else if (it.kind === 'magnet') {
      tint = 'rgba(255, 118, 162, 0.26)';
      rim = '#ff8cb5';
    }

    drawItemBubbleBack(ctx, x, y, bubbleR, tint);

    if (it.kind === 'star') {
      const spr = getSprite('item_star');
      if (spr) ctx.drawImage(spr, x - 12, y - 12, 24, 24);
    } else if (it.kind === 'coffee') {
      const spr = getSprite('orb_potion');
      if (spr) ctx.drawImage(spr, x - 13, y - 13, 26, 26);
    } else if (it.kind === 'magnet') {
      const spr = getSprite('orb_magnet');
      if (spr) ctx.drawImage(spr, x - 13, y - 13, 26, 26);
    } else if (it.kind === 'umbrella_fever') {
      const spr = getSprite('orb_bolt');
      if (spr) ctx.drawImage(spr, x - 13, y - 13, 26, 26);
    } else if (it.kind === 'speed_boost') {
      const spr = getSprite('orb_bolt');
      if (spr) {
        ctx.drawImage(spr, x - 13, y - 13, 26, 26);
      } else {
        ctx.fillStyle = '#ffe94d';
        ctx.fillRect(x - 4, y - 8, 8, 16);
      }
    } else if (it.kind === 'shield_item') {
      const spr = getSprite('spr_shield');
      if (spr) {
        ctx.drawImage(spr, x - 12, y - 13, 24, 26);
      } else {
        ctx.fillStyle = '#5cc8ff';
        ctx.fillRect(x - 9, y - 10, 18, 20);
      }
    } else if (it.kind === 'chest') {
      const spr = getSprite('ui_chest');
      if (spr) ctx.drawImage(spr, x - 13, y - 11, 26, 22);
    }

    drawItemBubbleFront(ctx, x, y, bubbleR, rim, t);
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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
      const easeOut = 1 - Math.pow(1 - prog, 3);
      const pop = prog < 0.14 ? (1.28 - (prog / 0.14) * 0.28) : 1.0;
      const fx = Math.max(54, Math.min(W - 54, Math.floor(f.x)));
      const fy = Math.max(22, Math.floor(f.y - easeOut * 30));
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, f.life * 2.4);
      ctx.font = '900 13px "Paperlogy", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#09152e';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  // ===================== PUBLIC RENDERERS =====================
  let dustTimer = 0;
  function renderRunFrame(ctx, run, charDef, dt, t) {
    // True Hi-DPI Retina Backing Store (2x ~ 3x: 1120x630 ~ 1680x945 physical pixels!)
    const dpr = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)));
    const targetW = W * dpr;
    const targetH = H * dpr;
    if (ctx.canvas.width !== targetW || ctx.canvas.height !== targetH) {
      ctx.canvas.width = targetW;
      ctx.canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    if (dt > 0 && !run.dead && !run.dying) {
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

    // Runner Character (Full 7-State Animation: Idle, Run, Jump, Fall, Slide, Hurt, Die!)
    drawCharacter(ctx, charDef, run.playerX, run.playerY, {
      sliding: run.sliding,
      inAir: run.playerY < (run.currentFloorY || GROUND_Y) - 1,
      vy: run.vy || 0,
      gliding: run.gliding,
      invulnTimer: run.invulnTimer,
      shield: run.shield,
      feverTimer: run.feverTimer,
      speedBoostTimer: run.speedBoostTimer || 0,
      dead: Boolean(run.dead),
      deathProgress: run.dying ? (1 - Math.max(0, run.deathAnimTimer || 0) / 0.58) : 1,
      umbrellaOn: run.umbrellaOn,
      maskOn: run.maskOn,
      maskParryTimer: run.maskParryTimer || 0,
      umbrellaBrokenTimer: run.umbrellaBrokenTimer || 0,
      gustWarning: Boolean(run.weatherEvent === 'gust' && run.umbrellaOn && run.feverTimer <= 0),
      hitPoseTimer: run.hitPoseTimer || 0,
      itemPoseTimer: run.itemPoseTimer || 0,
      winPoseTimer: run.winPoseTimer || 0,
      running: !run.dead && !run.dying,
      skinDef: run.skinDef || null,
      squashX: run.squashX !== undefined ? run.squashX : 1,
      squashY: run.squashY !== undefined ? run.squashY : 1,
      scaleHeight: 62
    }, t);

    // Corona Virus Timed Rush Attack!
    drawCovidAttack(ctx, run.covidAttack, run.playerX, run.playerY, t);

    // Dynamic High-Speed Wind Momentum Streaks (ramps smoothly as speed climbs past 220 px/s!)
    const speedRatio = (run.speed || 196) / 196;
    if ((speedRatio >= 1.14 || run.speedBoostTimer > 0) && run.feverTimer <= 0 && !run.dead) {
      ctx.save();
      const boostMode = run.speedBoostTimer > 0;
      const intensity = Math.min(1, Math.max(0.18, (speedRatio - 1.1) / 1.2));
      const streakCnt = boostMode ? 8 : Math.min(8, Math.max(2, Math.floor(2 + intensity * 6)));
      ctx.fillStyle = boostMode
        ? 'rgba(110, 244, 255, 0.36)'
        : `rgba(255, 255, 255, ${(0.12 + intensity * 0.24).toFixed(2)})`;
      for (let i = 0; i < streakCnt; i++) {
        const spd = boostMode ? 640 : 340 + speedRatio * 145;
        const sx = ((i * 105 - t * spd) % (W + 120) + (W + 120)) % (W + 120) - 60;
        const sy = 24 + ((i * 43) % (GROUND_Y - 54));
        const len = boostMode ? 54 : Math.round(24 + intensity * 32);
        ctx.fillRect(Math.floor(sx), sy, len, 2);
      }
      ctx.restore();
    }

    // Item Pickup Ring & Sparkle Burst Animations!
    drawPickupEffects(ctx, dt);

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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const seasonIdx = forcedSeasonIdx !== null ? (forcedSeasonIdx % 4) : (Math.floor(t / 6) % 4);
    const seasonId = window.RUN_DATA.SEASONS[seasonIdx].id;
    drawBackground(ctx, pw, ph, gy, seasonId, t * 48, t, null, 1, 'clear');
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
    spawnLandDust,
    spawnPickupEffect,
    renderRunFrame,
    renderHomePreview
  };
})();
