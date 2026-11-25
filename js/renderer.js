window.RunRenderer = (function () {
  const W = 560;
  const H = 315;
  const GROUND_Y = 258;
  let curView = { minX: 0, maxX: W, minY: 0, maxY: H };

  // Detect touch mobile devices once for adaptive DPR, hardware bilinear scaling, and lighter particle budgets
  const IS_MOBILE = (() => {
    try {
      const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const ua = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      return Boolean(coarse || ua);
    } catch {
      return false;
    }
  })();

  function getSpawnX() {
    return Math.max(440, Math.ceil(curView.maxX));
  }

  let particles = [];
  let dustPuffs = [];
  let floaters = [];
  let pickupBursts = [];

  // ===================== SMART ON-DEMAND & TARGETED PRELOAD SPRITE MANAGER =====================
  // Stable static sprite version keeps unchanged PNGs 100% cached across code deploys!
  const SPRITE_VER = '20261121hd56';
  const CHAR_SHEET_SKINS = [
    { id: 'yellow', frames: 3, runFrames: 8 },
    { id: 'blue', frames: 3, runFrames: 8 },
    { id: 'hanbok', frames: 3, runFrames: 8 },
    { id: 'skier', frames: 4, runFrames: 8, ver: '20261121hd67' },
    { id: 'santa', frames: 4, runFrames: 8, ver: '20261121hd79' },
    { id: 'catgirl', frames: 4, runFrames: 8 },
    { id: 'hades', frames: 3, runFrames: 4 }
  ];
  const CHAR_ANIM_STATES = ['idle', 'run', 'jump', 'fall', 'slide', 'hurt', 'die'];
  const CHAR_VFX_SPRITES = [
    'fx_dash_gold', 'fx_dash_blue', 'fx_shield_ring', 'catgirl_fx_paw',
    'hades_umbrella', 'hades_mask',
    'hades_shield_0', 'hades_shield_1', 'hades_shield_2', 'hades_shield_3', 'hades_shield_4', 'hades_shield_5',
    'hades_booster_0', 'hades_booster_1', 'hades_booster_2', 'hades_booster_3', 'hades_booster_4', 'hades_booster_5',
    'hades_booster_6', 'hades_booster_7', 'hades_booster_8', 'hades_booster_9', 'hades_booster_10', 'hades_booster_11',
    'hades_aura_0', 'hades_aura_1', 'hades_aura_2', 'hades_aura_3', 'hades_aura_4', 'hades_aura_5'
  ];

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
    'sp_spring_tile', 'sp_flower_patch', 'sp_flood_wave1', 'sp_flood_wave2', 'sp_flood_barricade',
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

  const CHEST_TIERS = ['wood', 'silver', 'gold', 'diamond'];
  const SPRITE_URL_MAP = {};
  const sprites = {};

  CHEST_TIERS.forEach((tier) => {
    for (let f = 0; f < 8; f++) {
      const key = `chest_${tier}_${f}`;
      SPRITE_URL_MAP[key] = `assets/chests/${key}.png?v=${SPRITE_VER}`;
    }
  });
  CHAR_SHEET_SKINS.forEach((sk) => {
    const skVer = sk.ver || SPRITE_VER;
    CHAR_ANIM_STATES.forEach((st) => {
      const fCount = (st === 'run' && sk.runFrames)
        ? sk.runFrames
        : ((st === 'idle' && sk.idleFrames) ? sk.idleFrames : sk.frames);
      for (let f = 0; f < fCount; f++) {
        const key = `${sk.id}_${st}_${f}`;
        SPRITE_URL_MAP[key] = `assets/chars/${key}.png?v=${skVer}`;
      }
    });
    SPRITE_URL_MAP[`port_${sk.id}`] = `assets/chars/port_${sk.id}.png?v=${skVer}`;
  });
  CHAR_VFX_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/chars/${key}.png?v=${SPRITE_VER}`; });
  DESIGN_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/design/${key}.png?v=${SPRITE_VER}`; });
  ATLAS_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/atlas/${key}.png?v=${SPRITE_VER}`; });
  WORLD_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/world/${key}.png?v=${SPRITE_VER}`; });

  function requestSprite(key) {
    if (!key) return null;
    if (sprites[key]) return sprites[key];
    const url = SPRITE_URL_MAP[key];
    if (!url) return null;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    sprites[key] = img;
    return img;
  }

  function getSprite(key) {
    const img = requestSprite(key);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  // Only preload lightweight core run HUD/item sprites on startup (cuts startup load from 320+ PNGs / 34MB to <1.2MB!)
  const CORE_BOOT_KEYS = [
    'item_coin', 'item_coin_1', 'item_coin_2', 'item_coin_side', 'item_star',
    'orb_bolt', 'orb_magnet', 'orb_potion', 'spr_umbrella', 'spr_mask', 'spr_shield',
    'ui_fever', 'fx_dash_gold', 'fx_dash_blue', 'fx_shield_ring',
    'chest_wood_0', 'chest_silver_0', 'chest_gold_0', 'chest_diamond_0'
  ];
  const preloadedSeasons = new Set();

  function preloadSeason(seasonId) {
    if (!seasonId || preloadedSeasons.has(seasonId)) return;
    preloadedSeasons.add(seasonId);
    const data = window.RUN_DATA;
    if (!data) return;
    const s = (data.SEASONS || []).find((x) => x.id === seasonId);
    if (s) {
      [s.tree, s.treeAlt, s.bush, s.prop, s.tile, 'sp_smog_city', 'sp_spring_pad'].forEach(requestSprite);
      if (seasonId === 'summer') {
        ['sp_sun', 'sp_flood_wave1', 'sp_flood_wave2', 'sp_red_car', 'sp_crate', 'sp_metal_box'].forEach(requestSprite);
      }
      if (seasonId === 'spring') {
        ['sp_red_car', 'sp_flood_wave1', 'sp_flood_wave2'].forEach(requestSprite);
      }
    }
    const obsList = (data.OBSTACLES_BY_SEASON && data.OBSTACLES_BY_SEASON[seasonId]) || [];
    obsList.forEach((ob) => { if (ob && ob.sprite) requestSprite(ob.sprite); });
  }

  function preloadForRun(charDef, skinDef, seasonId = 'spring') {
    CORE_BOOT_KEYS.forEach(requestSprite);
    const customSkin = skinDef && skinDef.customAnimSkin ? skinDef : null;
    const animId = customSkin ? customSkin.customAnimSkin : ((charDef && charDef.animSkin) || 'yellow');
    const sheetSpec = CHAR_SHEET_SKINS.find((s) => s.id === animId) || { id: animId, frames: 3, runFrames: 4 };
    CHAR_ANIM_STATES.forEach((st) => {
      const cnt = (st === 'run' && sheetSpec.runFrames) ? sheetSpec.runFrames : sheetSpec.frames;
      for (let f = 0; f < cnt; f++) requestSprite(`${animId}_${st}_${f}`);
    });
    if (skinDef) {
      if (skinDef.customUmbrella) requestSprite(skinDef.customUmbrella);
      if (skinDef.customMask) requestSprite(skinDef.customMask);
      if (skinDef.customShieldVfx) requestSprite(skinDef.customShieldVfx);
      if (skinDef.customShieldPrefix) {
        for (let f = 0; f < (skinDef.customShieldFrames || 6); f++) requestSprite(`${skinDef.customShieldPrefix}_${f}`);
      }
      if (skinDef.customBoosterPrefix) {
        for (let f = 0; f < (skinDef.customBoosterFrames || 12); f++) requestSprite(`${skinDef.customBoosterPrefix}_${f}`);
      }
      if (skinDef.customAuraPrefix) {
        for (let f = 0; f < (skinDef.customAuraFrames || 6); f++) requestSprite(`${skinDef.customAuraPrefix}_${f}`);
      }
    }
    preloadSeason(seasonId);
    // Warm up common tutorial/covid sprites lightly
    requestSprite('sp_covid_walker');
    requestSprite('sp_covid_virus');
  }

  function preloadChestAnim(tierId) {
    if (!tierId) return;
    for (let f = 0; f < 8; f++) requestSprite(`chest_${tierId}_${f}`);
  }

  // Defer tiny core boot preload until after first paint so intro logo renders immediately!
  setTimeout(() => {
    CORE_BOOT_KEYS.forEach(requestSprite);
  }, 450);

  function initParticles() {
    particles = [];
    const cnt = IS_MOBILE ? 34 : 50;
    for (let i = 0; i < cnt; i++) {
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
    if (floaters.length >= 10) floaters.shift();
    floaters.push({ text, color, x, y, life: 0.95, maxLife: 0.95 });
  }

  function spawnPickupEffect(x, y, color = '#ffe55c', big = false) {
    if (pickupBursts.length >= 10) pickupBursts.shift();
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
    if (dustPuffs.length >= 18) dustPuffs.shift();
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
    const cnt = IS_MOBILE ? 3 : 4;
    for (let i = 0; i < cnt; i++) {
      if (dustPuffs.length >= 18) dustPuffs.shift();
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

  // ===================== CACHED SKY / CLOUD / EXTERNAL PNG PARALLAX BG LAYERS =====================
  let cachedSkyKey = '';
  let cachedSkyGrad = null;
  const cloudSpriteCache = {};
  const softBgSpriteCache = {};

  // External PNG Parallax Background Layers (drop PNGs into assets/bg/ — zero Canvas shape drawing!)
  // Missing files fail safely once and skip rendering cleanly without errors.
  const BG_PARALLAX_LAYERS = [
    { key: 'bg_seoul_far', src: 'assets/bg/bg_seoul_far.png', parallax: 0.08, targetH: 152, baselineOffset: 4, alpha: 0.92, dustAlpha: 0.78 },
    { key: 'bg_city_mid',  src: 'assets/bg/bg_city_mid.png',  parallax: 0.18, targetH: 104, baselineOffset: 3, alpha: 0.90, dustAlpha: 0.84 }
  ];
  const bgLayerCache = {};

  function getBgLayerImage(layer) {
    if (!layer || !layer.key) return null;
    let entry = bgLayerCache[layer.key];
    if (!entry) {
      const img = new Image();
      img.decoding = 'async';
      entry = { img, loaded: false, failed: false };
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) entry.loaded = true;
        else entry.failed = true;
      };
      img.onerror = () => { entry.failed = true; };
      img.src = layer.src;
      bgLayerCache[layer.key] = entry;
    }
    if (entry.failed || !entry.loaded) return null;
    return entry.img;
  }

  // Aspect-ratio-preserving seamless horizontal parallax tiling across any viewport width
  function drawTiledParallaxLayer(ctx, img, scroll, parallax, targetH, baselineY, minX, maxX, alpha) {
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;
    const aspect = img.naturalWidth / img.naturalHeight;
    const drawH = targetH;
    const drawW = Math.max(1, Math.round(drawH * aspect));
    const drawY = Math.floor(baselineY - drawH);
    const offset = ((Math.floor(scroll * parallax) % drawW) + drawW) % drawW;
    const firstX = Math.floor((minX - drawW) / drawW) * drawW - offset;
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    for (let x = firstX; x < maxX + drawW; x += drawW) {
      ctx.drawImage(img, Math.floor(x), drawY, drawW, drawH);
    }
    ctx.restore();
    return true;
  }

  const BG_ATMOSPHERE_TINT = {
    spring: 'rgba(182, 218, 250, 0.17)',
    summer: 'rgba(164, 214, 248, 0.16)',
    autumn: 'rgba(226, 200, 174, 0.17)',
    winter: 'rgba(212, 228, 248, 0.19)'
  };

  // Pre-bake desaturated + atmospheric-haze midground sprite ONCE (zero per-frame filter cost!)
  function getSoftBgSprite(key, spr, seasonId) {
    if (!spr || !spr.naturalWidth || !spr.naturalHeight) return spr;
    const cacheKey = `${key}|${seasonId || 'spring'}`;
    if (softBgSpriteCache[cacheKey]) return softBgSpriteCache[cacheKey];
    const maxDim = 220;
    const scale = Math.min(1, maxDim / Math.max(spr.naturalWidth, spr.naturalHeight));
    const cw = Math.max(1, Math.round(spr.naturalWidth * scale));
    const ch = Math.max(1, Math.round(spr.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    g.drawImage(spr, 0, 0, cw, ch);
    // Reduce saturation & contrast (~18%) + apply subtle seasonal sky atmospheric perspective strictly inside silhouette
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(126, 134, 148, 0.16)';
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = BG_ATMOSPHERE_TINT[seasonId] || BG_ATMOSPHERE_TINT.spring;
    g.fillRect(0, 0, cw, ch);
    g.fillStyle = 'rgba(14, 26, 48, 0.08)';
    g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over';
    softBgSpriteCache[cacheKey] = c;
    return c;
  }

  function getCloudSprite(mode) {
    if (cloudSpriteCache[mode]) return cloudSpriteCache[mode];
    const c = document.createElement('canvas');
    c.width = 76;
    c.height = 42;
    const g = c.getContext('2d');
    const cloudShadow = mode === 'covid' ? 'rgba(148, 56, 84, 0.65)' : (mode === 'storm' ? 'rgba(92, 112, 146, 0.72)' : 'rgba(184, 214, 255, 0.65)');
    const cloudMain = mode === 'covid' ? 'rgba(255, 224, 232, 0.88)' : (mode === 'storm' ? 'rgba(176, 194, 222, 0.90)' : 'rgba(255, 255, 255, 0.93)');
    g.translate(6, 15);
    g.fillStyle = cloudShadow;
    g.beginPath();
    g.arc(16, 10, 14, 0, Math.PI * 2);
    g.arc(34, 8, 18, 0, Math.PI * 2);
    g.arc(52, 11, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = cloudMain;
    g.beginPath();
    g.arc(15, 7, 13, 0, Math.PI * 2);
    g.arc(32, 3, 17, 0, Math.PI * 2);
    g.arc(50, 8, 12, 0, Math.PI * 2);
    g.arc(24, 10, 12, 0, Math.PI * 2);
    g.arc(41, 10, 12, 0, Math.PI * 2);
    g.fill();
    cloudSpriteCache[mode] = c;
    return c;
  }

  // ===================== MOCKUP-INSPIRED BACKGROUND & TILESET =====================
  function drawBackground(ctx, w, h, groundY, seasonId, scroll, t, prevSeasonId = null, blend = 1, weatherEvent = 'clear', bounds = null) {
    const minX = bounds ? bounds.minX : 0;
    const maxX = bounds ? bounds.maxX : w;
    const minY = bounds ? bounds.minY : 0;
    const maxY = bounds ? bounds.maxY : h;
    const spanW = Math.max(w, maxX - minX);

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

    const skyKey = `${top}|${mid}|${bot}|${Math.round(minY)}|${groundY}`;
    if (cachedSkyKey !== skyKey || !cachedSkyGrad) {
      cachedSkyKey = skyKey;
      const grad = ctx.createLinearGradient(0, minY, 0, groundY);
      grad.addColorStop(0, top);
      grad.addColorStop(0.58, mid);
      grad.addColorStop(1, bot);
      cachedSkyGrad = grad;
    }
    ctx.fillStyle = cachedSkyGrad;
    ctx.fillRect(minX - 10, minY - 10, spanW + 20, groundY - minY + 12);

    // Cached glossy cartoon clouds (5 fast drawImage blits instead of 40 arc paths/frame!)
    const cloudSpr = getCloudSprite(isCovid ? 'covid' : (isStormy ? 'storm' : 'clear'));
    const cloudWrap = spanW + 150;
    const cloudCount = Math.max(4, Math.ceil(spanW / 145));
    for (let i = 0; i < cloudCount; i++) {
      const cx = minX + (((i * 155 - scroll * 0.055 + t * 5.5) % cloudWrap + cloudWrap) % cloudWrap) - 75;
      const cy = Math.max(minY + 16, 26 + (i % 2) * 20);
      const sc = i % 2 === 0 ? 1.0 : 0.84;
      ctx.drawImage(cloudSpr, Math.floor(cx - 6 * sc), Math.floor(cy - 15 * sc), Math.round(76 * sc), Math.round(42 * sc));
    }

    // Blazing Summer Sun sprite from uploaded sheet!
    if (seasonId === 'summer' && !isStormy) {
      const sunSpr = getSprite('sp_sun');
      if (sunSpr) {
        const sSz = 42 + Math.round(Math.sin(t * 3) * 2);
        ctx.drawImage(sunSpr, Math.floor(maxX - 66), Math.max(12, Math.floor(minY + 14)), sSz, sSz);
      }
    }

    // External PNG Far & Midground Seoul Skyline Parallax Layers (assets/bg/bg_seoul_far.png, bg_city_mid.png)
    // Safe fallback: missing PNG layers are cleanly skipped without Canvas geometry or runtime errors.
    for (let li = 0; li < BG_PARALLAX_LAYERS.length; li++) {
      const layer = BG_PARALLAX_LAYERS[li];
      const layerImg = getBgLayerImage(layer);
      if (!layerImg) continue;
      const layerAlpha = weatherEvent === 'dust' ? layer.dustAlpha : layer.alpha;
      drawTiledParallaxLayer(
        ctx,
        layerImg,
        scroll,
        layer.parallax,
        layer.targetH,
        groundY + (layer.baselineOffset || 0),
        minX,
        maxX,
        layerAlpha
      );
    }

    // Midground Seasonal Trees, Bushes & Street Props (softened saturation + atmospheric depth for crisp character contrast!)
    const treeSpr = getSprite(season.tree);
    const treeAltKey = season.treeAlt || season.tree;
    const treeAltSpr = getSprite(treeAltKey);
    const bushSpr = getSprite(season.bush);
    const propSpr = getSprite(season.prop);
    const softTree = treeSpr ? getSoftBgSprite(season.tree, treeSpr, seasonId) : null;
    const softTreeAlt = treeAltSpr ? getSoftBgSprite(treeAltKey, treeAltSpr, seasonId) : null;
    const softBush = bushSpr ? getSoftBgSprite(season.bush, bushSpr, seasonId) : null;
    const softProp = propSpr ? getSoftBgSprite(season.prop, propSpr, seasonId) : null;
    const propOff = Math.floor(scroll * 0.55) % 280;
    const pStartRep = Math.floor((minX - 280) / 280);
    const pEndRep = Math.ceil((maxX + 280) / 280);
    ctx.save();
    ctx.globalAlpha = 0.88;
    for (let rep = pStartRep; rep <= pEndRep; rep++) {
      const px = rep * 280 - propOff;
      if (softTree && treeSpr) {
        const th = 58;
        const tw = Math.round(th * (treeSpr.naturalWidth / treeSpr.naturalHeight));
        ctx.drawImage(softTree, Math.floor(px + 14), Math.floor(groundY - th + 4), tw, th);
      }
      if (softBush && bushSpr) {
        const bh = 26;
        const bw = Math.round(bh * (bushSpr.naturalWidth / bushSpr.naturalHeight));
        ctx.drawImage(softBush, Math.floor(px + 94), Math.floor(groundY - bh + 3), bw, bh);
      }
      if (softTreeAlt && treeAltSpr) {
        const th2 = 50;
        const tw2 = Math.round(th2 * (treeAltSpr.naturalWidth / treeAltSpr.naturalHeight));
        ctx.drawImage(softTreeAlt, Math.floor(px + 154), Math.floor(groundY - th2 + 4), tw2, th2);
      }
      if (softProp && propSpr) {
        const ph = season.prop === 'sp_flower_patch' ? 24 : 44;
        const pw = Math.round(ph * (propSpr.naturalWidth / propSpr.naturalHeight));
        ctx.drawImage(softProp, Math.floor(px + 228), Math.floor(groundY - ph + 3), pw, ph);
      }
    }
    ctx.restore();

    // Tiled Pixel Ground strictly from uploaded sheet (sp_spring_tile / sp_metal_box / sp_ice_tile)!
    const tileSpr = getSprite(season.tile) || getSprite('sp_spring_tile');
    const tileW = 46;
    const tileH = 34;
    const tileOff = Math.floor(scroll) % tileW;
    const tileStart = Math.floor((minX - tileW) / tileW) * tileW - tileOff;

    ctx.fillStyle = lerpHex(prevSeason.groundBase || '#57392c', season.groundBase || '#57392c', f);
    ctx.fillRect(minX - 10, groundY, spanW + 20, Math.max(h, maxY) - groundY + 12);

    if (tileSpr) {
      for (let gx = tileStart; gx < maxX + tileW; gx += tileW) {
        ctx.drawImage(tileSpr, Math.floor(gx), groundY - 3, tileW, tileH);
      }
      ctx.fillStyle = 'rgba(18, 16, 32, 0.35)';
      ctx.fillRect(minX - 10, groundY + tileH - 4, spanW + 20, Math.max(h, maxY) - (groundY + tileH - 4) + 12);
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

  function drawParticles(ctx, w, h, seasonId, dt, t, weatherEvent = 'clear', prevSeasonId = null, blend = 1, bounds = null) {
    const minX = bounds ? bounds.minX : 0;
    const maxX = bounds ? bounds.maxX : w;
    const minY = bounds ? bounds.minY : 0;
    const maxY = bounds ? bounds.maxY : h;
    const spanW = Math.max(w, maxX - minX);
    const spanH = Math.max(h, maxY - minY);

    // Active weather atmosphere tint & gust streaks
    if (weatherEvent === 'dust') {
      ctx.fillStyle = 'rgba(205, 174, 72, 0.24)';
      ctx.fillRect(minX - 10, minY - 10, spanW + 20, spanH + 20);
    } else if (weatherEvent === 'heat') {
      ctx.fillStyle = 'rgba(255, 130, 35, 0.14)';
      ctx.fillRect(minX - 10, minY - 10, spanW + 20, spanH + 20);
      // Blazing diagonal sun rays
      ctx.fillStyle = 'rgba(255, 240, 160, 0.16)';
      for (let i = 0; i < 5; i++) {
        const rx = minX + (((i * 130 - t * 25) % (spanW + 100) + (spanW + 100)) % (spanW + 100)) - 50;
        ctx.beginPath();
        ctx.moveTo(rx, minY);
        ctx.lineTo(rx + 26, minY);
        ctx.lineTo(rx - 30, maxY);
        ctx.lineTo(rx - 56, maxY);
        ctx.closePath();
        ctx.fill();
      }
    } else if (weatherEvent === 'gust') {
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 245, 255, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const gx = minX + (((i * 92 - t * 380) % (spanW + 110) + (spanW + 110)) % (spanW + 110)) - 80;
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
      ctx.fillRect(minX - 10, GROUND_Y - 3, spanW + 20, 12);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      for (let i = 0; i < 10; i++) {
        const ix = minX + (((i * 68 - t * 110) % (spanW + 40) + (spanW + 40)) % (spanW + 40)) - 20;
        drawRoundRect(ctx, ix, GROUND_Y - 1, 16, 2.5, 1.2);
        ctx.fill();
      }
    } else if (weatherEvent === 'covid') {
      const pulse = 0.10 + Math.sin(t * 5) * 0.04;
      ctx.fillStyle = `rgba(210, 26, 68, ${pulse.toFixed(3)})`;
      ctx.fillRect(minX - 10, minY - 10, spanW + 20, spanH + 20);
    }

    const heavyRain = weatherEvent === 'rain' || weatherEvent === 'flood';
    const heavyDust = weatherEvent === 'dust';
    const isCovidParticles = weatherEvent === 'covid';
    const isBlizzard = seasonId === 'winter' && (weatherEvent === 'gust' || weatherEvent === 'ice_road');

    // Batched Weather Particles (1~2 GPU draw calls instead of 58 individual paths/save/restores!)
    const len = particles.length;
    if (heavyRain) {
      ctx.strokeStyle = 'rgba(195, 234, 255, 0.86)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= 165 * dt * p.v;
        p.y += 315 * dt * p.v;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 5.5, p.y + 12);
      }
      ctx.stroke();
    } else if (isCovidParticles || heavyDust) {
      const col1 = isCovidParticles ? 'rgba(255, 58, 98, 0.85)' : 'rgba(235, 198, 75, 0.82)';
      const col2 = isCovidParticles ? 'rgba(255, 130, 155, 0.72)' : 'rgba(196, 152, 46, 0.74)';
      const spdX = isCovidParticles ? 95 : 120;
      const ampY = isCovidParticles ? 24 : 18;
      const freq = isCovidParticles ? 5 : 4;
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= spdX * dt * p.v;
        p.y += Math.sin(t * freq + p.p) * ampY * dt;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
      }
      for (let pass = 1; pass <= 2; pass++) {
        ctx.fillStyle = pass === 1 ? col1 : col2;
        const r = pass === 1 ? (isCovidParticles ? 2.6 : 2.4) : (isCovidParticles ? 1.9 : 1.7);
        ctx.beginPath();
        for (let idx = 0; idx < len; idx++) {
          const p = particles[idx];
          if ((p.s === 1 ? 1 : 2) !== pass) continue;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    } else if (seasonId === 'winter' || weatherEvent === 'ice_road') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= ((isBlizzard ? 185 : 52) + Math.sin(t * 2 + p.p) * 18) * dt;
        p.y += (isBlizzard ? 88 : 52) * dt * p.v;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
        const r = p.s * 0.9 + 1.1;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    } else if (seasonId === 'summer' && weatherEvent !== 'gust') {
      ctx.fillStyle = 'rgba(255, 245, 175, 0.76)';
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= 48 * dt * p.v;
        p.y += Math.sin(t * 3 + p.p) * 14 * dt;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
        ctx.moveTo(p.x + 1.8, p.y);
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      // Batched spinning petals (spring) or leaves (autumn/gust) using lightweight rotated diamonds — ZERO ctx.save/restore!
      const isAutumnMode = seasonId === 'autumn' || weatherEvent === 'gust';
      const col1 = isAutumnMode ? '#ff7930' : '#ffa8cd';
      const col2 = isAutumnMode ? '#ffcf48' : '#ffe2ef';
      const vxBase = isAutumnMode ? (weatherEvent === 'gust' ? 235 : 115) : 64;
      const vyBase = isAutumnMode ? 34 : 26;
      const rx = isAutumnMode ? 3.4 : 2.9;
      const ry = isAutumnMode ? 1.7 : 1.5;
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= vxBase * dt * p.v;
        p.y += (vyBase + Math.sin(t * 3.5 + p.p) * 15) * dt;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
      }
      for (let pass = 1; pass <= 2; pass++) {
        ctx.fillStyle = pass === 1 ? col1 : col2;
        ctx.beginPath();
        for (let idx = 0; idx < len; idx++) {
          const p = particles[idx];
          if ((p.s === 1 ? 1 : 2) !== pass) continue;
          const ang = t * 3.5 + p.p;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          ctx.moveTo(p.x + ca * rx, p.y + sa * rx);
          ctx.lineTo(p.x - sa * ry, p.y + ca * ry);
          ctx.lineTo(p.x - ca * rx, p.y - sa * rx);
          ctx.lineTo(p.x + sa * ry, p.y - ca * ry);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
  }

  // ===================== KOREAN STREET INTERACTIVE FEATURES (100% UPLOADED SPRITES!) =====================
  function drawStreetFeatures(ctx, run, t) {
    // 1. Rising Floodwater Waves strictly using uploaded sp_flood_wave1 / sp_flood_wave2!
    if (run.weatherEvent === 'flood') {
      const waveY = Math.round(Math.sin(t * 7) * 2);
      const minX = curView.minX;
      const maxX = curView.maxX;
      ctx.fillStyle = 'rgba(34, 110, 198, 0.45)';
      ctx.fillRect(minX - 10, GROUND_Y - 12 + waveY, (maxX - minX) + 20, 18);
      const wSpr = getSprite('sp_flood_wave2') || getSprite('sp_flood_wave1');
      if (wSpr) {
        const wOff = Math.floor(run.scroll * 0.75) % 58;
        const wStart = Math.floor((minX - 58) / 58) * 58 - wOff;
        ctx.save();
        ctx.globalAlpha = 0.85;
        for (let wx = wStart; wx < maxX + 60; wx += 58) {
          ctx.drawImage(wSpr, Math.floor(wx), GROUND_Y - 22 + waveY, 54, 26);
        }
        ctx.restore();
      }
    }

    (run.features || []).forEach((f) => {
      const x = Math.floor(f.x);
      ctx.imageSmoothingEnabled = true;

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

  function drawIceStone(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const pts = 7;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const rad = r * (i % 2 === 0 ? 1.0 : 0.78);
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#8be4ff');
    g.addColorStop(1, '#2b8fe0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = '#09152e';
    ctx.stroke();

    // Crisp specular crystal glint
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, -r * 0.42);
    ctx.lineTo(r * 0.08, -r * 0.48);
    ctx.lineTo(-r * 0.12, -r * 0.08);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.restore();
  }

  function drawHailAttack(ctx, attack, playerX, playerY, t) {
    if (!attack) return;
    const ax = attack.x;
    const ay = attack.y;
    const stones = Array.isArray(attack.stones) && attack.stones.length
      ? attack.stones
      : [{ dx: 0, dy: 0, r: 12, spin: 1 }, { dx: -16, dy: -12, r: 9, spin: -1.4 }, { dx: 15, dy: -10, r: 9, spin: 1.3 }];

    ctx.save();
    ctx.imageSmoothingEnabled = true;

    if (attack.phase === 'warn') {
      const ratio = Math.max(0, Math.min(1, attack.timer / (attack.maxTimer || 1.8)));
      const blink = Math.floor(t * 14) % 2 === 0;
      const targetX = playerX + 4;
      const targetY = playerY - 46;

      // Dashed icy-blue vertical drop trajectory line
      ctx.save();
      ctx.strokeStyle = blink ? 'rgba(98, 232, 255, 0.88)' : 'rgba(255, 224, 72, 0.78)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 75;
      ctx.beginPath();
      ctx.moveTo(ax, 34);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.restore();

      // Shrinking cyan-yellow lock ring at sky spawn point
      const lockR = 20 + ratio * 22;
      ctx.save();
      ctx.strokeStyle = ratio < 0.38 ? '#ffe247' : '#58e1ff';
      ctx.lineWidth = ratio < 0.38 ? 3.2 : 2.2;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.arc(ax, 28, lockR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Dark storm cloud puff behind hailstones
      ctx.save();
      ctx.fillStyle = '#1d3154';
      ctx.beginPath();
      ctx.arc(ax - 18, 22, 16, 0, Math.PI * 2);
      ctx.arc(ax + 18, 22, 16, 0, Math.PI * 2);
      ctx.arc(ax, 17, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#314b73';
      ctx.beginPath();
      ctx.arc(ax - 12, 19, 13, 0, Math.PI * 2);
      ctx.arc(ax + 12, 19, 13, 0, Math.PI * 2);
      ctx.arc(ax, 15, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Trembling 3-stone ice hail cluster
      const jitterX = Math.sin(t * 48) * 2.2;
      const jitterY = Math.cos(t * 42) * 1.8;
      stones.forEach((st, idx) => {
        drawIceStone(ctx, ax + st.dx + jitterX, 28 + st.dy + jitterY, st.r || 10, t * (st.spin || 1) * 4 + idx);
      });

      // Glossy cartoon warning pill directly below cloud
      const minX = (curView && curView.minX !== undefined) ? curView.minX + 8 : 8;
      const maxX = (curView && curView.maxX !== undefined) ? curView.maxX - 150 : W - 150;
      const bw = 142;
      const bh = 24;
      const bx = Math.min(maxX, Math.max(minX, ax - bw / 2));
      const by = 56;
      const pGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
      pGrad.addColorStop(0, blink ? '#35caff' : '#ff9814');
      pGrad.addColorStop(1, blink ? '#136ed4' : '#d65c00');
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
      ctx.strokeText('🧊 우박 낙하! 우산 펴기!', bx + bw / 2, by + 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🧊 우박 낙하! 우산 펴기!', bx + bw / 2, by + 16);
    } else if (attack.phase === 'fall') {
      stones.forEach((st, idx) => {
        const sx = ax + st.dx;
        const sy = ay + st.dy;
        for (let k = 1; k <= 3; k++) {
          ctx.save();
          ctx.globalAlpha = 0.34 - k * 0.08;
          ctx.fillStyle = '#8be4ff';
          ctx.fillRect(Math.floor(sx - 2.5), Math.floor(sy - k * 14 - 12), 5, 13);
          ctx.restore();
        }
        drawIceStone(ctx, sx, sy, (st.r || 11) + 1.5, t * (st.spin || 1) * 14 + idx);
      });
    } else if (attack.phase === 'deflected') {
      const alpha = Math.max(0, Math.min(1, (attack.deflectTimer || 0) / 0.55));
      ctx.globalAlpha = alpha;
      stones.forEach((st, idx) => {
        const spreadX = (idx === 0 ? 0 : (idx === 1 ? -14 : 18));
        const spreadY = (idx === 0 ? 0 : -10);
        drawIceStone(ctx, ax + st.dx + spreadX, ay + st.dy + spreadY, st.r || 10, t * 20 + idx * 2);
      });
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
    ctx.drawImage(dog, Math.floor(x - w / 2), Math.floor(y - h - hop), w, h);
  }

  // ===================== UPLOADED 7-STATE PIXEL K-CHARACTER SPRITE RENDERER =====================
  // ===================== CACHED FILTERED SKIN SPRITES (ZERO PER-FRAME ctx.filter LAG!) =====================
  const filteredSkinCache = {};

  function getFilteredCharSprite(spr, skinDef) {
    if (!spr || !skinDef || !skinDef.filter || skinDef.filter === 'none') return spr;
    const key = `${skinDef.id}|${spr.src}`;
    if (filteredSkinCache[key]) return filteredSkinCache[key];
    const sw = spr.naturalWidth || 64;
    const sh = spr.naturalHeight || 64;
    const maxDim = IS_MOBILE ? 180 : 220;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const octx = off.getContext('2d');
    if ('filter' in octx) {
      octx.filter = skinDef.filter;
    }
    octx.drawImage(spr, 0, 0, cw, ch);
    if ('filter' in octx) octx.filter = 'none';
    filteredSkinCache[key] = off;
    return off;
  }

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
    const idleCnt = customSkin && customSkin.customIdleFrames ? customSkin.customIdleFrames : n;
    const idleFrame = Math.floor(t * (idleCnt >= 6 ? 6.5 : 3.5)) % idleCnt;
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

    // Grounded semi-transparent elliptical contact shadow (stays anchored on ground/platform & scales smoothly with jump height!)
    const shadowY = opts.floorY !== undefined ? opts.floorY : y;
    const airH = Math.max(0, shadowY - y);
    const shadowScale = Math.max(0.42, 1 - airH / 165);
    const shadowAlpha = Math.max(0.14, 0.40 * (1 - airH / 195));
    const shadowRx = (isProne ? 24 : 18) * shadowScale;
    const shadowRy = (isProne ? 4.3 : 4.8) * shadowScale;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(8, 16, 36, ${(shadowAlpha * 0.42).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx, Math.floor(shadowY) + 1.5, shadowRx * 1.24, shadowRy * 1.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(8, 16, 36, ${shadowAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx, Math.floor(shadowY) + 1.5, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Uploaded Golden / Blue Dash VFX streaks OR Custom Mythic Booster Jet (e.g. Hades 12-frame flipped purple flame!)
    if (!dead && (feverTimer > 0 || speedBoostTimer > 0)) {
      let dashSpr = null;
      const isCustomBooster = Boolean(skinDef && skinDef.customBoosterPrefix);
      if (isCustomBooster) {
        const bf = Math.floor(t * 18) % (skinDef.customBoosterFrames || 12);
        dashSpr = getSprite(`${skinDef.customBoosterPrefix}_${bf}`) || getSprite(`${skinDef.customBoosterPrefix}_0`);
      } else {
        dashSpr = getSprite(feverTimer > 0 ? 'fx_dash_gold' : 'fx_dash_blue');
      }
      if (dashSpr) {
        const pulse = 0.95 + Math.sin(t * 22) * 0.06;
        const dh = Math.round((isCustomBooster ? (isProne ? 36 : 44) : (isProne ? 26 : 34)) * pulse);
        const dw = Math.round(dh * (dashSpr.naturalWidth / dashSpr.naturalHeight));
        ctx.save();
        ctx.globalAlpha = isCustomBooster ? 0.94 : 0.88;
        ctx.imageSmoothingEnabled = true;
        const offsetBack = isCustomBooster ? 6 : 2;
        ctx.drawImage(dashSpr, Math.floor(cx - dw - offsetBack), Math.floor(cy - (isProne ? 18 : scaleHeight * 0.48) - dh / 2), dw, dh);
        ctx.restore();
      }
    }

    // Always-on soft glowing underworld aura BEHIND Mythic Hades (intensifies smoothly during FEVER!)
    if (!dead && skinDef && skinDef.customAuraPrefix) {
      const isFever = feverTimer > 0;
      const af = Math.floor(t * (isFever ? 14 : 9)) % (skinDef.customAuraFrames || 6);
      const auraSpr = getSprite(`${skinDef.customAuraPrefix}_${af}`) || getSprite(`${skinDef.customAuraPrefix}_0`);
      const auraCy = cy - (isProne ? 18 : scaleHeight * 0.48);
      // Soft atmospheric ambient purple backlight behind Hades
      const backR = isFever ? (isProne ? 38 : scaleHeight * 0.82) : (isProne ? 30 : scaleHeight * 0.68);
      const backGrad = ctx.createRadialGradient(cx, auraCy, 4, cx, auraCy, backR);
      backGrad.addColorStop(0, isFever ? 'rgba(180, 92, 255, 0.48)' : 'rgba(166, 78, 255, 0.28)');
      backGrad.addColorStop(1, 'rgba(120, 42, 235, 0)');
      ctx.save();
      ctx.fillStyle = backGrad;
      ctx.beginPath();
      ctx.arc(cx, auraCy, backR, 0, Math.PI * 2);
      ctx.fill();
      if (auraSpr) {
        const pulse = 1.0 + Math.sin(t * (isFever ? 10 : 4.5)) * 0.05;
        const aSz = Math.round((isFever ? (isProne ? 60 : scaleHeight * 1.44) : (isProne ? 54 : scaleHeight * 1.30)) * pulse);
        ctx.globalAlpha = isFever ? 0.84 : (0.36 + Math.sin(t * 4.5) * 0.08);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(auraSpr, Math.floor(cx - aSz / 2), Math.floor(auraCy - aSz / 2), aSz, aSz);
      }
      ctx.restore();
    }

    // Fever rainbow aura (for non-customAura skins) / Uploaded glowing Shield Ring VFX!
    if (!dead && feverTimer > 0 && !(skinDef && skinDef.customAuraPrefix)) {
      ctx.strokeStyle = Math.floor(t * 14) % 2 === 0 ? '#ffe85c' : '#63e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - (isProne ? 14 : scaleHeight * 0.48), isProne ? 24 : scaleHeight * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    } else if (!dead && shield && feverTimer <= 0) {
      let ringSpr = null;
      if (skinDef && skinDef.customShieldPrefix) {
        const sf = Math.floor(t * 10) % (skinDef.customShieldFrames || 6);
        ringSpr = getSprite(`${skinDef.customShieldPrefix}_${sf}`) || getSprite(`${skinDef.customShieldPrefix}_0`);
      } else {
        ringSpr = getSprite((skinDef && skinDef.customShieldVfx) || 'fx_shield_ring');
      }
      if (ringSpr) {
        const pulse = 1 + Math.sin(t * 8) * 0.04;
        const rSz = Math.round((isProne ? 52 : scaleHeight * 1.24) * pulse);
        ctx.save();
        ctx.globalAlpha = skinDef && skinDef.customShieldPrefix ? 0.72 : 0.88;
        ctx.imageSmoothingEnabled = true;
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

    // Uploaded Sky-Blue & White Umbrella OR Mythic Skin Custom Umbrella (e.g. Hades Skull Flame Umbrella!)
    const showUmbrella = !dead && ((col.umbrella && gliding) || umbrellaOn);
    const customUmb = skinDef && skinDef.customUmbrella ? getSprite(skinDef.customUmbrella) : null;
    const umbSpr = customUmb || getSprite('spr_umbrella');
    if (showUmbrella && umbSpr) {
      const uy = cy - (isProne ? 26 : scaleHeight) - 8;
      const uh = customUmb ? 46 : 44;
      const uw = Math.round(uh * (umbSpr.naturalWidth / umbSpr.naturalHeight));
      ctx.save();
      ctx.imageSmoothingEnabled = true;
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
    } else if (!dead && umbrellaBrokenTimer > 4.25 && umbSpr) {
      // Crisp flipped real umbrella sprite flying backward when snapped by typhoon!
      const prog = Math.max(0, Math.min(1, (5.0 - umbrellaBrokenTimer) / 0.75));
      const uy = cy - scaleHeight - 10 - prog * 34;
      const ux = cx + 6 - prog * 46;
      const uh = customUmb ? 42 : 40;
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
      const pRatio = Math.max(0, Math.min(1, maskParryTimer / 3.5));
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
      if (skinDef.customAuraPrefix) {
        // Clean delicate drifting underworld flame embers behind Hades (zero blocky squares or muddying ring during normal run!)
        ctx.save();
        for (let k = 0; k < 4; k++) {
          const prog = ((t * 1.65 + k * 0.25) % 1);
          const ox = 16 + prog * 34;
          const oy = Math.sin(t * 7 + k * 2.1) * 10 - prog * 8;
          ctx.globalAlpha = Math.max(0, (1 - prog) * 0.75);
          ctx.fillStyle = tr[k % tr.length];
          ctx.beginPath();
          ctx.arc(cx - ox, cy - scaleHeight * 0.45 + oy, 2.2 * (1 - prog * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else {
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
      const drawSpr = (skinDef && skinDef.filter && skinDef.filter !== 'none')
        ? getFilteredCharSprite(spr, skinDef)
        : spr;
      ctx.drawImage(drawSpr, Math.floor(-drawW / 2), Math.floor(-drawH), drawW, drawH);

      // Uploaded KF94 Mask Sprite OR Mythic Custom Mask (e.g. Hades Purple Mask!)
      if (maskOn && !dead) {
        const customMsk = skinDef && skinDef.customMask ? getSprite(skinDef.customMask) : null;
        const maskSpr = customMsk || getSprite('spr_mask');
        if (maskSpr) {
          const mw = customMsk ? (sliding ? 19 : 21) : (sliding ? 20 : 22);
          const mh = Math.round(mw * (maskSpr.naturalHeight / maskSpr.naturalWidth));
          const mx = sliding ? Math.floor(drawW * 0.08) : Math.floor(customMsk ? drawW * 0.02 : -mw * 0.14);
          const my = sliding ? Math.floor(-drawH * 0.40) : Math.floor(-drawH * (customMsk ? 0.45 : 0.50));
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

    // Downscale working obstacle sprite to max 128px before generating outline (10x faster build, 12x less VRAM!)
    const rawW = spr.naturalWidth;
    const rawH = spr.naturalHeight;
    const workScale = Math.min(1, 128 / Math.max(rawW, rawH));
    const sw = Math.max(16, Math.round(rawW * workScale));
    const sh = Math.max(16, Math.round(rawH * workScale));

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

    // Soft outer crimson danger aura (8 crisp passes)
    octx.globalAlpha = 0.45;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      octx.drawImage(sil, pad + Math.cos(ang) * glowR, pad + Math.sin(ang) * glowR);
    }

    // Crisp solid red danger outline hugging obstacle contour (10 crisp passes)
    octx.globalAlpha = 1;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
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
    const rightEdge = Math.floor(curView.maxX);
    if (ob.warn && ob.x > rightEdge - 18 && ob.lane !== 'icicle') {
      const wy = Math.floor(ob.y + ob.h / 2);
      const blink = Math.floor(t * 14) % 2 === 0;
      ctx.save();
      drawRoundRect(ctx, rightEdge - 28, wy - 13, 22, 26, 8);
      ctx.fillStyle = blink ? '#ff2b44' : '#ff9814';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#09152e';
      ctx.stroke();
      drawRoundRect(ctx, rightEdge - 26, wy - 11, 18, 22, 6);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.stroke();
      ctx.font = '900 16px "Paperlogy", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#09152e';
      ctx.strokeText('!', rightEdge - 17, wy + 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', rightEdge - 17, wy + 6);
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

  // ===================== CACHED GLOSSY TRANSLUCENT BUBBLE CONTAINER FOR ITEMS =====================
  const bubbleBackCache = {};
  const bubbleFrontCache = {};

  function getBubbleBackSprite(tintRgba) {
    if (bubbleBackCache[tintRgba]) return bubbleBackCache[tintRgba];
    const sz = 64;
    const half = sz / 2;
    const r = 26;
    const c = document.createElement('canvas');
    c.width = sz;
    c.height = sz;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(half - r * 0.25, half - r * 0.25, r * 0.12, half, half, r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    grad.addColorStop(0.68, tintRgba);
    grad.addColorStop(1, 'rgba(180, 238, 255, 0.52)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(half, half, r, 0, Math.PI * 2);
    g.fill();
    bubbleBackCache[tintRgba] = c;
    return c;
  }

  function getBubbleFrontSprite(rimColor) {
    if (bubbleFrontCache[rimColor]) return bubbleFrontCache[rimColor];
    const sz = 64;
    const half = sz / 2;
    const r = 26;
    const c = document.createElement('canvas');
    c.width = sz;
    c.height = sz;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(half, half, r, 0, Math.PI * 2);
    g.stroke();

    g.strokeStyle = rimColor;
    g.lineWidth = 1.8;
    g.globalAlpha = 0.82;
    g.beginPath();
    g.arc(half, half, r + 1.8, 0, Math.PI * 2);
    g.stroke();

    g.globalAlpha = 0.9;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.8;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(half, half, r * 0.72, Math.PI * 1.12, Math.PI * 1.46);
    g.stroke();

    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(half - r * 0.42, half - r * 0.42, 2.8, 0, Math.PI * 2);
    g.fill();

    g.globalAlpha = 0.55;
    g.strokeStyle = rimColor;
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(half, half, r * 0.76, Math.PI * 0.14, Math.PI * 0.38);
    g.stroke();

    bubbleFrontCache[rimColor] = c;
    return c;
  }

  function drawItemBubbleBack(ctx, x, y, r, tintRgba) {
    const spr = getBubbleBackSprite(tintRgba);
    const drawSz = r * (64 / 26);
    ctx.drawImage(spr, Math.floor(x - drawSz / 2), Math.floor(y - drawSz / 2), Math.round(drawSz), Math.round(drawSz));
  }

  function drawItemBubbleFront(ctx, x, y, r, rimColor) {
    const spr = getBubbleFrontSprite(rimColor);
    const drawSz = r * (64 / 26);
    ctx.drawImage(spr, Math.floor(x - drawSz / 2), Math.floor(y - drawSz / 2), Math.round(drawSz), Math.round(drawSz));
  }

  // ===================== DESIGN SHEET COINS & BUBBLE-TRAPPED ITEMS =====================
  function drawItem(ctx, it, t) {
    const x = Math.floor(it.x);
    const y = Math.floor(it.y + Math.sin(t * 7 + it.x * 0.05) * 2.5);
    ctx.imageSmoothingEnabled = true;

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
    const isDropChest = it.kind === 'chest_wood' || it.kind === 'chest_silver' || it.kind === 'chest_gold' || it.kind === 'chest_diamond';
    const bubbleR = (isDropChest ? 21 : 19) + wobble;
    let tint = 'rgba(130, 224, 255, 0.26)';
    let rim = '#7ef0ff';
    if (it.kind === 'chest_wood') {
      tint = 'rgba(224, 154, 66, 0.30)';
      rim = '#f2b866';
    } else if (it.kind === 'chest_silver') {
      tint = 'rgba(130, 200, 255, 0.32)';
      rim = '#9ce2ff';
    } else if (it.kind === 'chest_gold') {
      tint = 'rgba(255, 216, 69, 0.36)';
      rim = '#ffe966';
    } else if (it.kind === 'chest_diamond') {
      tint = 'rgba(140, 220, 255, 0.40)';
      rim = '#d38eff';
    } else if (it.kind === 'star' || it.kind === 'umbrella_fever' || it.kind === 'chest') {
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

    if (isDropChest) {
      const tierKey = it.kind.replace('chest_', '');
      const spr = getSprite(`chest_${tierKey}_0`) || getSprite('ui_chest');
      if (spr) {
        const cSz = tierKey === 'diamond' ? 30 : (tierKey === 'gold' ? 29 : 27);
        ctx.drawImage(spr, Math.floor(x - cSz / 2), Math.floor(y - cSz / 2), cSz, cSz);
      }
      if (tierKey === 'diamond' || tierKey === 'gold') {
        const spAlpha = 0.55 + Math.sin(t * 10 + x) * 0.4;
        ctx.save();
        ctx.globalAlpha = spAlpha;
        ctx.fillStyle = tierKey === 'diamond' ? '#a6f6ff' : '#fff08a';
        ctx.fillRect(x - 14, y - 14, 4, 4);
        ctx.fillRect(x + 11, y + 9, 3, 3);
        ctx.restore();
      }
    } else if (it.kind === 'star') {
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
    const minX = curView.minX;
    const maxX = curView.maxX;
    const minY = curView.minY;
    const maxY = curView.maxY;
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    // Full-screen energetic speed lines!
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const lx = minX + (((i * 80 - t * 520) % (spanW + 100) + (spanW + 100)) % (spanW + 100)) - 60;
      const ly = i < 4 ? minY + 14 + i * 11 : maxY - 50 + (i - 4) * 10;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 120, 0.55)' : 'rgba(130, 232, 255, 0.5)';
      ctx.fillRect(Math.floor(lx), ly, 58, 3);
    }

    // Animated Rainbow Screen Border Glow!
    const hue = Math.floor(t * 280) % 360;
    ctx.strokeStyle = `hsla(${hue}, 95%, 62%, 0.85)`;
    ctx.lineWidth = 6;
    ctx.strokeRect(minX + 3, minY + 3, spanW - 6, spanH - 6);
    ctx.restore();

    const spr = getSprite('ui_fever');
    if (!spr) return;
    const scale = 1 + Math.sin(t * 14) * 0.08;
    const dw = Math.round(122 * scale);
    const dh = Math.round(48 * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(spr, Math.floor(minX + (spanW - dw) / 2), Math.max(36, Math.floor(minY + 38)), dw, dh);
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
      const fx = Math.max(curView.minX + 54, Math.min(curView.maxX - 54, Math.floor(f.x)));
      const fy = Math.max(curView.minY + 22, Math.floor(f.y - easeOut * 30));
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

  // ===================== PUBLIC RENDERERS (CACHED VIEWPORT SIZE + ADAPTIVE MOBILE DPR!) =====================
  let dustTimer = 0;
  let cachedCssW = 0;
  let cachedCssH = 0;
  let canvasSizeDirty = true;

  function invalidateCanvasSize() {
    canvasSizeDirty = true;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', invalidateCanvasSize, { passive: true });
    window.addEventListener('orientationchange', () => {
      invalidateCanvasSize();
      setTimeout(invalidateCanvasSize, 220);
    }, { passive: true });
  }

  function renderRunFrame(ctx, run, charDef, dt, t) {
    // True 1:1 Uniform Responsive Camera — cached CSS size eliminates 60fps layout reflow thrashing!
    if (canvasSizeDirty || cachedCssW < 240 || cachedCssH < 180) {
      cachedCssW = Math.max(240, ctx.canvas.clientWidth || window.innerWidth || W);
      cachedCssH = Math.max(180, ctx.canvas.clientHeight || window.innerHeight || H);
      canvasSizeDirty = false;
    }
    const cssW = cachedCssW;
    const cssH = cachedCssH;
    // Adaptive DPR: mobile capped at 1.5x (cuts pixel fill-rate by 2.8x~4x for locked 60fps!), desktop up to 2.0x!
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = IS_MOBILE ? Math.min(1.5, Math.max(1, rawDpr)) : Math.min(2.0, Math.max(1, rawDpr));
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (ctx.canvas.width !== targetW || ctx.canvas.height !== targetH) {
      ctx.canvas.width = targetW;
      ctx.canvas.height = targetH;
    }

    const aspect = cssW / cssH;
    let scale = targetH / H;
    let camX = 0;
    let offsetY = 0;
    if (aspect >= 1.52) {
      // Wide landscape (Desktop 16:9, iPhone/Galaxy wide landscape) -> full H=315, crisp panorama width!
      scale = targetH / H;
      camX = 0;
      offsetY = 0;
    } else if (aspect >= 1.0) {
      // iPad / Tablet Landscape (4:3 ~ 3:2) -> 1:1 unstretched sprites, lush sky & earth, zero wasted top sky!
      const targetViewW = 470;
      scale = targetW / targetViewW;
      const visH = targetH / scale;
      camX = 28;
      offsetY = Math.round((visH - H) * 0.16);
    } else {
      // Upright Portrait (Phone / iPad Portrait) -> 1:1 unstretched playable framing with space for HUD & controls!
      const targetViewW = 405;
      scale = targetW / targetViewW;
      const visH = targetH / scale;
      camX = 44;
      offsetY = Math.round(Math.max(40, (visH - H) * 0.28));
    }

    const visW = targetW / scale;
    const visH = targetH / scale;
    curView = {
      minX: camX,
      maxX: camX + visW,
      minY: -offsetY,
      maxY: visH - offsetY
    };

    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, offsetY * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = IS_MOBILE ? 'low' : 'medium';

    // Camera Screen Shake on Hit / Lightning / Umbrella Break!
    if (run.shakeTimer > 0) {
      const mag = (run.shakeIntensity || 6) * Math.min(1, run.shakeTimer / 0.25);
      const sx = (Math.random() - 0.5) * 2 * mag;
      const sy = (Math.random() - 0.5) * 2 * mag;
      ctx.translate(Math.round(sx), Math.round(sy));
    }

    const blend = run.seasonTransition !== undefined ? run.seasonTransition : 1;
    drawBackground(ctx, W, H, GROUND_Y, run.seasonId, run.scroll, t, run.prevSeasonId, blend, run.weatherEvent, curView);

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
      floorY: run.currentFloorY || GROUND_Y,
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

    // Corona Virus Timed Rush Attack & Sky Hailstone Drop Attack!
    drawCovidAttack(ctx, run.covidAttack, run.playerX, run.playerY, t);
    drawHailAttack(ctx, run.hailAttack, run.playerX, run.playerY, t);

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
        const spanW = curView.maxX - curView.minX;
        const sx = curView.minX + (((i * 105 - t * spd) % (spanW + 120) + (spanW + 120)) % (spanW + 120)) - 60;
        const sy = 24 + ((i * 43) % (GROUND_Y - 54));
        const len = boostMode ? 54 : Math.round(24 + intensity * 32);
        ctx.fillRect(Math.floor(sx), sy, len, 2);
      }
      ctx.restore();
    }

    // Item Pickup Ring & Sparkle Burst Animations!
    drawPickupEffects(ctx, dt);

    // Active Weather Atmosphere & Smoothly Transitioning Particles
    drawParticles(ctx, W, H, run.seasonId, dt, t, run.weatherEvent, run.prevSeasonId, blend, curView);

    // FEVER! Full-screen Rainbow Edge + Speed Lines + Ribbon Banner!
    if (run.feverTimer > 0) {
      drawFeverOverlay(ctx, t);
    }

    // Red Damage Vignette Flash on Hit!
    if (run.hitFlashTimer > 0) {
      const a = Math.min(0.45, (run.hitFlashTimer / 0.3) * 0.42);
      ctx.strokeStyle = `rgba(255, 52, 52, ${a.toFixed(2)})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(curView.minX, curView.minY, curView.maxX - curView.minX, curView.maxY - curView.minY);
    }

    drawFloaters(ctx, dt);
    ctx.restore();
  }

  function renderHomePreview(ctx, charDef, t, forcedSeasonIdx = null) {
    const pw = 380, ph = 180, gy = 148;
    ctx.imageSmoothingEnabled = true;
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
    IS_MOBILE,
    getSpawnX,
    invalidateCanvasSize,
    preloadForRun,
    preloadSeason,
    preloadChestAnim,
    clearFloaters,
    spawnFloater,
    spawnDust,
    spawnLandDust,
    spawnPickupEffect,
    renderRunFrame,
    renderHomePreview
  };
})();
