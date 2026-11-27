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
  let floodLevel = 0;

  // ===================== SMART ON-DEMAND & TARGETED PRELOAD SPRITE MANAGER =====================
  // Stable static sprite version keeps unchanged PNGs 100% cached across code deploys!
  const SPRITE_VER = '20261121hd56';
  const CHAR_SHEET_SKINS = [
    { id: 'yellow', frames: 3, runFrames: 8 },
    { id: 'blue', frames: 3, runFrames: 8 },
    { id: 'hanbok', frames: 3, runFrames: 8 },
    { id: 'skier', frames: 4, runFrames: 8, ver: '20261121hd67' },
    { id: 'santa', frames: 4, runFrames: 8, ver: '20261121hd79' },
    { id: 'ice_emperor', frames: 4, runFrames: 8, ver: '20261121hd83' },
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
    'hades_aura_0', 'hades_aura_1', 'hades_aura_2', 'hades_aura_3', 'hades_aura_4', 'hades_aura_5',
    'ice_emperor_umbrella', 'ice_emperor_mask', 'ice_emperor_shield',
    'ice_emperor_aura_0', 'ice_emperor_aura_1', 'ice_emperor_aura_2', 'ice_emperor_aura_3', 'ice_emperor_aura_4', 'ice_emperor_aura_5',
    'ice_emperor_booster_0', 'ice_emperor_booster_1', 'ice_emperor_booster_2', 'ice_emperor_booster_3'
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
  SPRITE_URL_MAP['ice_emperor_shield'] = 'assets/chars/ice_emperor_shield.png?v=20261121hd89';
  SPRITE_URL_MAP['fx_shield_ring'] = 'assets/chars/fx_shield_ring.png?v=20261121hd108';
  for (let bf = 0; bf < 6; bf++) {
    SPRITE_URL_MAP[`fx_booster_${bf}`] = `assets/chars/fx_booster_${bf}.png?v=20261121hd105`;
  }
  DESIGN_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/design/${key}.png?v=${SPRITE_VER}`; });
  SPRITE_URL_MAP['ui_fever'] = 'assets/design/ui_fever.png?v=20261121hd103';
  ATLAS_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/atlas/${key}.png?v=${SPRITE_VER}`; });
  WORLD_SPRITES.forEach((key) => { SPRITE_URL_MAP[key] = `assets/world/${key}.png?v=${SPRITE_VER}`; });
  const GROUND_STRIP_VER = '20261121hd100';
  ['ground_spring', 'ground_summer', 'ground_autumn', 'ground_winter'].forEach((key) => {
    SPRITE_URL_MAP[key] = `assets/world/${key}.png?v=${GROUND_STRIP_VER}`;
  });
  const NEW_OBS_VER = '20261121hd115';
  const NEW_OBS_SPRITES = [
    'obs_air_bird', 'obs_air_maple', 'obs_air_snowball', 'obs_air_iceball',
    'obs_air_icicle', 'obs_air_gift', 'obs_air_pinecone', 'obs_air_snowflake',
    'obs_sp_tree', 'obs_sp_rock', 'obs_sp_fence', 'obs_sp_log', 'obs_sp_bush', 'obs_sp_lantern',
    'obs_su_palm', 'obs_su_parasol', 'obs_su_fence', 'obs_su_surfboard', 'obs_su_coral', 'obs_su_tube',
    'obs_au_tree', 'obs_au_rock', 'obs_au_fence', 'obs_au_log', 'obs_au_leaves', 'obs_au_lantern',
    'obs_wi_tree', 'obs_wi_snowman', 'obs_wi_fence', 'obs_wi_crystal', 'obs_wi_rock', 'obs_wi_pond'
  ];
  NEW_OBS_SPRITES.forEach((key) => {
    SPRITE_URL_MAP[key] = `assets/world/${key}.png?v=${NEW_OBS_VER}`;
  });
  const SEASON_BG_VER = '20261121hd116';
  const SEASON_SKY_SPRITES = ['bg_sky_spring', 'bg_sky_summer', 'bg_sky_autumn', 'bg_sky_winter'];
  SEASON_SKY_SPRITES.forEach((key) => {
    SPRITE_URL_MAP[key] = `assets/world/${key}.jpg?v=${SEASON_BG_VER}`;
  });
  const SEASON_NATURE_SPRITES = [
    'nat_sp_tree1', 'nat_sp_tree2', 'nat_sp_bush', 'nat_sp_tuft1', 'nat_sp_tuft2', 'nat_sp_petal',
    'nat_su_tree1', 'nat_su_tree2', 'nat_su_bush', 'nat_su_tuft1', 'nat_su_tuft2', 'nat_su_leaf',
    'nat_au_tree1', 'nat_au_tree2', 'nat_au_bush', 'nat_au_tuft1', 'nat_au_tuft2', 'nat_au_leaf',
    'nat_wi_tree1', 'nat_wi_tree2', 'nat_wi_bush', 'nat_wi_tuft1', 'nat_wi_tuft2', 'nat_wi_prop'
  ];
  SEASON_NATURE_SPRITES.forEach((key) => {
    SPRITE_URL_MAP[key] = `assets/world/${key}.png?v=${SEASON_BG_VER}`;
  });

  function requestSprite(key) {
    if (!key) return null;
    const prev = sprites[key];
    if (prev) {
      if (prev.naturalWidth > 0) return prev;
      if (!prev.complete) return prev;
      // Auto-retry a failed image once every 2.5s (e.g. transient mobile blip) instead of staying dead forever!
      const now = Date.now();
      if (now - (prev._retryAt || 0) < 2500) return prev;
      prev._retryAt = now;
    }
    const url = SPRITE_URL_MAP[key];
    if (!url) return null;
    const absUrl = toAbsUrl(url);
    const img = new Image();
    img.decoding = 'sync';
    img._retryAt = Date.now();
    img.onerror = () => {
      if (img._triedIdb) return;
      img._triedIdb = true;
      idbGetBlob(absUrl).then((blob) => {
        if (blob && typeof URL !== 'undefined' && URL.createObjectURL) {
          const bUrl = deviceBlobUrlMap[absUrl] || URL.createObjectURL(blob);
          deviceBlobUrlMap[absUrl] = bUrl;
          img.src = bUrl;
        }
      }).catch(() => {});
    };
    img.src = url;
    sprites[key] = img;
    return img;
  }

  function getSprite(key) {
    const img = requestSprite(key);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  // Only preload lightweight core run HUD/item sprites & 4 seasonal skies on startup
  const CORE_BOOT_KEYS = [
    'item_coin', 'item_coin_1', 'item_coin_2', 'item_coin_side', 'item_star',
    'orb_bolt', 'orb_magnet', 'orb_potion', 'spr_umbrella', 'spr_mask', 'spr_shield',
    'ui_fever', 'fx_booster_0', 'fx_booster_1', 'fx_booster_2', 'fx_booster_3', 'fx_booster_4', 'fx_booster_5', 'fx_shield_ring',
    'chest_wood_0', 'chest_silver_0', 'chest_gold_0', 'chest_diamond_0',
    'bg_sky_spring', 'bg_sky_summer', 'bg_sky_autumn', 'bg_sky_winter',
    'ground_spring', 'ground_summer', 'ground_autumn', 'ground_winter'
  ];
  const preloadedSeasons = new Set();

  function preloadSeason(seasonId) {
    if (!seasonId || preloadedSeasons.has(seasonId)) return;
    preloadedSeasons.add(seasonId);
    const data = window.RUN_DATA;
    if (!data) return;
    const s = (data.SEASONS || []).find((x) => x.id === seasonId);
    if (s) {
      [s.skyBg, s.tree, s.treeAlt, s.bush, s.tuft1, s.tuft2, s.prop, s.particleSprite, s.tile, 'sp_smog_city', 'sp_spring_pad'].forEach(requestSprite);
      if (seasonId === 'summer') {
        ['sp_red_car', 'sp_crate', 'sp_metal_box'].forEach(requestSprite);
      }
      if (seasonId === 'spring') {
        ['sp_red_car'].forEach(requestSprite);
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
    const data = window.RUN_DATA;
    if (data && Array.isArray(data.SEASONS)) {
      const idx = data.SEASONS.findIndex((s) => s.id === seasonId);
      const nextS = data.SEASONS[(Math.max(0, idx) + 1) % data.SEASONS.length];
      if (nextS) preloadSeason(nextS.id);
    }
    // Warm up common tutorial/covid sprites lightly
    requestSprite('sp_covid_walker');
    requestSprite('sp_covid_virus');
  }

  function preloadChestAnim(tierId) {
    if (!tierId) return;
    for (let f = 0; f < 8; f++) requestSprite(`chest_${tierId}_${f}`);
  }

  // ===================== USER-TRIGGERED ON-DEVICE ASSET PRE-DOWNLOADER (INDEXEDDB + CACHE STORAGE) =====================
  const ASSET_CACHE_NAME = 'k-weather-survival-assets-v1';
  const DEVICE_IDB_NAME = 'kws_device_assets_v1';
  const DEVICE_IDB_STORE = 'files';
  const memPreloadedUrls = new Set();
  const deviceBlobUrlMap = {};
  let deviceDbPromise = null;
  let deviceStoragePersisted = false;

  function toAbsUrl(relUrl) {
    try {
      return new URL(relUrl, window.location.href).href;
    } catch (_) {
      return relUrl;
    }
  }

  function guessMimeType(url) {
    const clean = String(url || '').split('?')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    if (clean.endsWith('.m4a') || clean.endsWith('.mp4')) return 'audio/mp4';
    if (clean.endsWith('.mp3')) return 'audio/mpeg';
    return 'application/octet-stream';
  }

  function openDeviceAssetDb() {
    if (deviceDbPromise) return deviceDbPromise;
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    deviceDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DEVICE_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DEVICE_IDB_STORE)) {
            db.createObjectStore(DEVICE_IDB_STORE, { keyPath: 'url' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return deviceDbPromise;
  }

  async function idbPutFile(absUrl, blob) {
    const db = await openDeviceAssetDb();
    if (!db || !blob) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DEVICE_IDB_STORE, 'readwrite');
        tx.objectStore(DEVICE_IDB_STORE).put({
          url: absUrl,
          blob,
          size: blob.size || 0,
          savedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbGetKeyStats() {
    const db = await openDeviceAssetDb();
    const keySet = new Set();
    let totalBytes = 0;
    if (!db) return { keySet, totalBytes };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DEVICE_IDB_STORE, 'readonly');
        const store = tx.objectStore(DEVICE_IDB_STORE);
        const req = store.openCursor();
        req.onsuccess = (ev) => {
          const cur = ev.target.result;
          if (cur) {
            if (cur.key) keySet.add(String(cur.key));
            if (cur.value && typeof cur.value.size === 'number') totalBytes += cur.value.size;
            cur.continue();
          } else {
            resolve({ keySet, totalBytes });
          }
        };
        req.onerror = () => resolve({ keySet, totalBytes });
      } catch (_) {
        resolve({ keySet, totalBytes });
      }
    });
  }

  async function idbGetBlob(absUrl) {
    const db = await openDeviceAssetDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DEVICE_IDB_STORE, 'readonly');
        const req = tx.objectStore(DEVICE_IDB_STORE).get(absUrl);
        req.onsuccess = () => resolve(req.result && req.result.blob ? req.result.blob : null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbClearAll() {
    const db = await openDeviceAssetDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DEVICE_IDB_STORE, 'readwrite');
        tx.objectStore(DEVICE_IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  async function requestDevicePersistentStorage() {
    try {
      if (navigator.storage && typeof navigator.storage.persisted === 'function') {
        const already = await navigator.storage.persisted();
        if (already) {
          deviceStoragePersisted = true;
          return true;
        }
      }
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        deviceStoragePersisted = Boolean(await navigator.storage.persist());
        return deviceStoragePersisted;
      }
    } catch (_) {}
    return deviceStoragePersisted;
  }

  function buildPreloadPacks() {
    const coreVfxKeys = [
      'fx_dash_gold', 'fx_dash_blue', 'fx_shield_ring',
      'fx_booster_0', 'fx_booster_1', 'fx_booster_2', 'fx_booster_3', 'fx_booster_4', 'fx_booster_5'
    ];
    const gameplayKeys = [
      ...NEW_OBS_SPRITES,
      ...SEASON_SKY_SPRITES,
      ...SEASON_NATURE_SPRITES,
      'ground_spring', 'ground_summer', 'ground_autumn', 'ground_winter',
      ...WORLD_SPRITES,
      ...DESIGN_SPRITES,
      ...ATLAS_SPRITES,
      ...coreVfxKeys
    ];
    const gameplayUrls = Array.from(new Set(gameplayKeys.map((k) => SPRITE_URL_MAP[k]).filter(Boolean)));

    const charKeys = [];
    CHAR_SHEET_SKINS.forEach((sk) => {
      CHAR_ANIM_STATES.forEach((st) => {
        const fCount = (st === 'run' && sk.runFrames)
          ? sk.runFrames
          : ((st === 'idle' && sk.idleFrames) ? sk.idleFrames : sk.frames);
        for (let f = 0; f < fCount; f++) charKeys.push(`${sk.id}_${st}_${f}`);
      });
      charKeys.push(`port_${sk.id}`);
    });
    const coreVfxSet = new Set(coreVfxKeys);
    CHAR_VFX_SPRITES.forEach((k) => {
      if (!coreVfxSet.has(k)) charKeys.push(k);
    });
    const charUrlSet = new Set(charKeys.map((k) => SPRITE_URL_MAP[k]).filter(Boolean));
    const data = window.RUN_DATA;
    if (data && Array.isArray(data.SKINS)) {
      data.SKINS.forEach((sk) => {
        if (sk && sk.customAvatar) charUrlSet.add(sk.customAvatar);
      });
    }
    const charUrls = Array.from(charUrlSet);

    const extraUrls = [];
    CHEST_TIERS.forEach((tier) => {
      for (let f = 0; f < 8; f++) {
        const u = SPRITE_URL_MAP[`chest_${tier}_${f}`];
        if (u) extraUrls.push(u);
      }
    });
    extraUrls.push('assets/audio/bgm_home.m4a?v=20261121hd86');
    extraUrls.push('assets/audio/bgm_game.m4a?v=20261121hd86');

    return [
      {
        id: 'gameplay',
        name: '장애물 · 계절 배경 · 이펙트',
        desc: '32종 장애물, 4계절 하늘 배경·자연물 24종, 지형, 아이템·부스터·보호막',
        badge: '필수 추천',
        estMb: 13.6,
        urls: gameplayUrls,
        bakeOutlines: true
      },
      {
        id: 'chars',
        name: '캐릭터 · 스킨 애니메이션',
        desc: '전 캐릭터 7종 동작 프레임, 신화 스킨 이펙트, 희귀 스킨 초상화 20종',
        badge: '모션 최적화',
        estMb: 23.8,
        urls: charUrls,
        bakeOutlines: false
      },
      {
        id: 'extra',
        name: '상자 연출 · 배경음',
        desc: '4종 상자 오픈 8프레임 애니메이션, 홈/인게임 고음질 배경음',
        badge: '선택',
        estMb: 9.6,
        urls: Array.from(new Set(extraUrls)),
        bakeOutlines: false
      }
    ];
  }

  async function inspectPreloadCacheStatus() {
    const packs = buildPreloadPacks();
    const hasCacheApi = typeof caches !== 'undefined' && caches && typeof caches.open === 'function';
    const hasIdb = typeof indexedDB !== 'undefined' && Boolean(indexedDB);
    const cachedUrlSet = new Set(memPreloadedUrls);

    const idbStats = await idbGetKeyStats();
    idbStats.keySet.forEach((u) => cachedUrlSet.add(u));

    if (hasCacheApi) {
      try {
        const cache = await caches.open(ASSET_CACHE_NAME);
        const keys = await cache.keys();
        keys.forEach((req) => {
          if (req && req.url) cachedUrlSet.add(req.url);
        });
      } catch (_) {}
    }

    try {
      if (navigator.storage && typeof navigator.storage.persisted === 'function') {
        deviceStoragePersisted = Boolean(await navigator.storage.persisted());
      }
    } catch (_) {}

    let totalFiles = 0;
    let cachedFiles = 0;
    const packStates = packs.map((p) => {
      let c = 0;
      for (let i = 0; i < p.urls.length; i++) {
        const abs = toAbsUrl(p.urls[i]);
        if (cachedUrlSet.has(abs) || cachedUrlSet.has(p.urls[i])) c++;
      }
      totalFiles += p.urls.length;
      cachedFiles += c;
      return {
        id: p.id,
        name: p.name,
        desc: p.desc,
        badge: p.badge,
        estMb: p.estMb,
        total: p.urls.length,
        cached: c,
        done: p.urls.length > 0 && c >= p.urls.length
      };
    });

    const gp = packStates.find((x) => x.id === 'gameplay');
    return {
      supported: hasCacheApi || hasIdb,
      hasIdb,
      hasCacheApi,
      persisted: deviceStoragePersisted,
      deviceBytes: idbStats.totalBytes,
      deviceFiles: idbStats.keySet.size,
      packs: packStates,
      totalFiles,
      cachedFiles,
      gameplayDone: Boolean(gp && gp.done),
      allDone: totalFiles > 0 && cachedFiles >= totalFiles
    };
  }

  function loadAndDecodeImageKey(key) {
    return new Promise((resolve) => {
      const url = SPRITE_URL_MAP[key];
      if (!url) { resolve(null); return; }
      const img = requestSprite(key);
      if (!img) { resolve(null); return; }
      const finishImg = (target) => {
        if (target && target.decode) {
          target.decode().catch(() => {}).finally(() => resolve(target));
        } else {
          resolve(target);
        }
      };
      if (img.complete && img.naturalWidth > 0) {
        finishImg(img);
        return;
      }
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onErr);
        resolve(val);
      };
      const onLoad = () => finishImg(img);
      const onErr = () => {
        // Allow onerror IndexedDB fallback a brief moment if triggered
        setTimeout(() => done(img.complete && img.naturalWidth > 0 ? img : null), 250);
      };
      const timer = setTimeout(() => done(img.complete && img.naturalWidth > 0 ? img : null), 8000);
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onErr, { once: true });
    });
  }

  function nextFrameTick() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
  }

  async function fetchBlobWithTimeout(absUrl, userSignal, timeoutMs = 15000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let onUserAbort = null;
    if (userSignal && ctrl) {
      if (userSignal.aborted) {
        ctrl.abort();
      } else {
        onUserAbort = () => ctrl.abort();
        userSignal.addEventListener('abort', onUserAbort, { once: true });
      }
    }
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(absUrl, {
        cache: 'default',
        credentials: 'same-origin',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!resp || !resp.ok) return null;
      const blob = await resp.blob();
      return blob && blob.size > 0 ? blob : null;
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      if (userSignal && onUserAbort) userSignal.removeEventListener('abort', onUserAbort);
    }
  }

  async function downloadPreloadPacks(packIds, onProgress, opts = {}) {
    await requestDevicePersistentStorage();

    const allPacks = buildPreloadPacks();
    const wantedIds = Array.isArray(packIds) && packIds.length > 0
      ? new Set(packIds)
      : new Set(allPacks.map((p) => p.id));
    const targetPacks = allPacks.filter((p) => wantedIds.has(p.id));
    const signal = opts.signal || null;

    const queue = [];
    const seen = new Set();
    targetPacks.forEach((p) => {
      p.urls.forEach((u) => {
        if (!seen.has(u)) {
          seen.add(u);
          queue.push({ url: u, absUrl: toAbsUrl(u), packName: p.name });
        }
      });
    });

    const total = queue.length;
    let done = 0;
    let failed = 0;
    let bytesDownloaded = 0;

    const hasCacheApi = typeof caches !== 'undefined' && caches && typeof caches.open === 'function';
    let cache = null;
    const cacheSet = new Set();
    const idbStats = await idbGetKeyStats();
    const idbSet = idbStats.keySet;

    if (hasCacheApi) {
      try {
        cache = await caches.open(ASSET_CACHE_NAME);
        const keys = await cache.keys();
        keys.forEach((req) => { if (req && req.url) cacheSet.add(req.url); });
      } catch (_) {
        cache = null;
      }
    }

    const pending = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const inIdb = idbSet.has(item.absUrl);
      const inCache = cacheSet.has(item.absUrl) || cacheSet.has(item.url);
      if (inIdb && (!hasCacheApi || inCache)) {
        done++;
      } else {
        pending.push({ ...item, inCache, inIdb });
      }
    }

    if (onProgress) {
      onProgress({
        phase: 'download',
        done,
        total,
        failed,
        bytesDownloaded,
        packName: targetPacks[0] ? targetPacks[0].name : ''
      });
    }

    let cursor = 0;
    const concurrency = IS_MOBILE ? 4 : 6;

    async function saveItemToDevice(item) {
      let blob = null;
      // Fast path: if already in Service Worker CacheStorage, copy blob directly into device IndexedDB with ZERO network!
      if (cache && item.inCache) {
        try {
          const cachedResp = await cache.match(item.absUrl) || await cache.match(item.url);
          if (cachedResp && cachedResp.ok) {
            blob = await cachedResp.blob();
          }
        } catch (_) {
          blob = null;
        }
      }
      // Network fetch if not already cached locally
      if (!blob) {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal && signal.aborted) return false;
          blob = await fetchBlobWithTimeout(item.absUrl, signal, 15000);
          if (blob) break;
        }
      }
      if (!blob) return false;
      bytesDownloaded += blob.size || 0;

      // 1. Write binary blob physically to device IndexedDB (survives SW clears & works in all WebViews)
      if (!item.inIdb) {
        await idbPutFile(item.absUrl, blob);
      }
      // 2. Write clean fresh Response built from Blob into SW CacheStorage (zero Safari stream-clone deadlock!)
      if (cache && !item.inCache) {
        try {
          const mime = blob.type || guessMimeType(item.url);
          const freshResp = new Response(blob, {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': mime }
          });
          await cache.put(item.absUrl, freshResp);
        } catch (_) {}
      }
      memPreloadedUrls.add(item.absUrl);
      return true;
    }

    async function worker() {
      while (cursor < pending.length) {
        if (signal && signal.aborted) return;
        const item = pending[cursor++];
        const ok = await saveItemToDevice(item);
        if (signal && signal.aborted) return;
        done++;
        if (!ok) failed++;
        if (onProgress) {
          onProgress({
            phase: 'download',
            done,
            total,
            failed,
            bytesDownloaded,
            packName: item.packName
          });
        }
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, Math.max(1, pending.length)); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (signal && signal.aborted) {
      if (onProgress) onProgress({ phase: 'cancelled', done, total, failed, bytesDownloaded, packName: '' });
      return { cancelled: true, done, total, failed, bytesDownloaded };
    }

    // Phase 2: Decode all 32 rim-baked obstacle PNGs, 4 seasonal sky backdrops, 24 nature props & ground strips into RAM!
    if (wantedIds.has('gameplay')) {
      const bakeKeys = [...NEW_OBS_SPRITES, ...SEASON_SKY_SPRITES, ...SEASON_NATURE_SPRITES, 'ground_spring', 'ground_summer', 'ground_autumn', 'ground_winter'];
      const bakeTotal = bakeKeys.length;
      for (let i = 0; i < bakeTotal; i++) {
        if (signal && signal.aborted) {
          if (onProgress) onProgress({ phase: 'cancelled', done, total, failed, bytesDownloaded, packName: '' });
          return { cancelled: true, done, total, failed, bytesDownloaded };
        }
        await loadAndDecodeImageKey(bakeKeys[i]);
        if (onProgress) {
          onProgress({
            phase: 'bake',
            done,
            total,
            bakeDone: i + 1,
            bakeTotal,
            failed,
            bytesDownloaded,
            packName: '장애물 이미지 사전 최적화'
          });
        }
        if (i % 4 === 3) await nextFrameTick();
      }
    }

    // Optional Phase 2b: Pre-warm equipped rare skin outfit recolor canvases for zero-hitch first run
    if (opts.equippedChar && opts.equippedSkin && opts.equippedSkin.outfitColor) {
      const animId = opts.equippedChar.animSkin || 'yellow';
      const spec = CHAR_SHEET_SKINS.find((s) => s.id === animId) || { frames: 3, runFrames: 4 };
      const warmKeys = [];
      for (let f = 0; f < (spec.runFrames || 4); f++) warmKeys.push(`${animId}_run_${f}`);
      for (let f = 0; f < (spec.frames || 3); f++) {
        warmKeys.push(`${animId}_jump_${f}`);
        warmKeys.push(`${animId}_slide_${f}`);
      }
      for (let i = 0; i < warmKeys.length; i++) {
        if (signal && signal.aborted) break;
        const img = await loadAndDecodeImageKey(warmKeys[i]);
        if (img && img.naturalWidth > 0) getFilteredCharSprite(img, opts.equippedSkin);
        if (i % 3 === 2) await nextFrameTick();
      }
    }

    if (onProgress) {
      onProgress({ phase: 'done', done, total, failed, bytesDownloaded, packName: '' });
    }
    return { cancelled: false, done, total, failed, bytesDownloaded };
  }

  async function clearPreloadCache() {
    memPreloadedUrls.clear();
    Object.keys(deviceBlobUrlMap).forEach((k) => {
      try { URL.revokeObjectURL(deviceBlobUrlMap[k]); } catch (_) {}
      delete deviceBlobUrlMap[k];
    });
    await idbClearAll();
    if (typeof caches !== 'undefined' && caches && typeof caches.delete === 'function') {
      try {
        await caches.delete(ASSET_CACHE_NAME);
      } catch (_) {}
    }
    return true;
  }

  // Defer tiny core boot preload until after first paint, then warm up all 32 obstacle sprites so mobile never delays spawning!
  setTimeout(() => {
    CORE_BOOT_KEYS.forEach(requestSprite);
    preloadSeason('spring');
  }, 450);
  setTimeout(() => {
    preloadSeason('summer');
    preloadSeason('autumn');
    preloadSeason('winter');
  }, 1300);

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
    floodLevel = 0;
  }

  function spawnFloater(text, color, x, y) {
    const cleanText = String(text || '');
    const prefix = cleanText.split(/[0-9+]/)[0].trim();
    if (prefix.length >= 3) {
      for (let i = floaters.length - 1; i >= 0; i--) {
        if (floaters[i].text.startsWith(prefix)) {
          floaters.splice(i, 1);
        }
      }
    }
    const LINE_GAP = 16;
    const safeTopY = Math.max(curView.minY + 86, 86);
    let spawnY = Math.min(y, 206);
    for (let attempt = 0; attempt < 6; attempt++) {
      let clash = false;
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        const prog = 1 - f.life / f.maxLife;
        const curY = f.y - (1 - Math.pow(1 - prog, 3)) * 22;
        if (Math.abs(f.x - x) < 120 && Math.abs(curY - spawnY) < LINE_GAP) {
          clash = true;
          break;
        }
      }
      if (!clash) break;
      spawnY -= LINE_GAP;
    }
    spawnY = Math.max(safeTopY, spawnY);
    if (floaters.length >= 4) floaters.shift();
    floaters.push({ text: cleanText, color, x, y: spawnY, life: 0.85, maxLife: 0.85 });
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

    // Uploaded 4-Season Panoramic Sky Backdrops (Seamless Mirror-Tiled Parallax + Smooth Season Crossfade!)
    const drawSeamlessSkyPanorama = (img, alpha) => {
      if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;
      const drawH = Math.min(315, Math.max(264, Math.ceil(groundY - minY + 6)));
      const drawW = Math.max(320, Math.round(drawH * (img.naturalWidth / img.naturalHeight)));
      const drawY = Math.floor(groundY + 6 - drawH);
      const period = drawW * 2;
      const shiftMod = ((Math.floor(scroll * 0.08) % period) + period) % period;
      const kStart = Math.floor((minX + shiftMod) / drawW) - 1;
      const kEnd = Math.ceil((maxX + shiftMod) / drawW) + 1;

      ctx.save();
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      for (let k = kStart; k <= kEnd; k++) {
        const ix = Math.floor(k * drawW - shiftMod);
        if ((k & 1) === 0) {
          ctx.drawImage(img, ix, drawY, drawW + 1, drawH);
        } else {
          ctx.save();
          ctx.translate(ix + drawW + 1, drawY);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, drawW + 1, drawH);
          ctx.restore();
        }
      }
      ctx.restore();
      return true;
    };

    const curSkyKey = season.skyBg || `bg_sky_${season.id}`;
    const prevSkyKey = prevSeason ? (prevSeason.skyBg || `bg_sky_${prevSeason.id}`) : curSkyKey;
    const curSkyImg = getSprite(curSkyKey);
    const prevSkyImg = (prevSkyKey !== curSkyKey && f < 0.995) ? getSprite(prevSkyKey) : null;
    let drewSkyImg = false;
    if (prevSkyImg && f < 0.995) {
      drewSkyImg = drawSeamlessSkyPanorama(prevSkyImg, 1) || drewSkyImg;
      if (curSkyImg) drewSkyImg = drawSeamlessSkyPanorama(curSkyImg, f) || drewSkyImg;
    } else if (curSkyImg) {
      drewSkyImg = drawSeamlessSkyPanorama(curSkyImg, 1);
    }

    // Atmospheric weather tint over sky panorama during storm / covid events
    if (drewSkyImg && (isStormy || isCovid)) {
      ctx.fillStyle = isCovid ? 'rgba(116, 20, 52, 0.36)' : 'rgba(20, 38, 72, 0.42)';
      ctx.fillRect(minX - 10, minY - 10, spanW + 20, groundY - minY + 14);
    }

    // Fallback cartoon clouds only while sky panorama is loading
    if (!drewSkyImg) {
      const cloudSpr = getCloudSprite(isCovid ? 'covid' : (isStormy ? 'storm' : 'clear'));
      const cloudWrap = spanW + 150;
      const cloudCount = Math.max(4, Math.ceil(spanW / 145));
      for (let i = 0; i < cloudCount; i++) {
        const cx = minX + (((i * 155 - scroll * 0.055 + t * 5.5) % cloudWrap + cloudWrap) % cloudWrap) - 75;
        const cy = Math.max(minY + 16, 26 + (i % 2) * 20);
        const sc = i % 2 === 0 ? 1.0 : 0.84;
        ctx.drawImage(cloudSpr, Math.floor(cx - 6 * sc), Math.floor(cy - 15 * sc), Math.round(76 * sc), Math.round(42 * sc));
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

    // Midground Seasonal Nature Props Behind Obstacles (Direct ctx.drawImage for 100% mobile reliability & crisp HD!)
    const drawSeasonNatureLayer = (sObj, layerAlpha) => {
      if (!sObj || layerAlpha <= 0.01) return;
      const treeSpr = getSprite(sObj.tree);
      const treeAltSpr = getSprite(sObj.treeAlt || sObj.tree);
      const bushSpr = getSprite(sObj.bush);
      const tuft1Spr = getSprite(sObj.tuft1 || sObj.prop);
      const tuft2Spr = getSprite(sObj.tuft2 || sObj.prop);
      const propSpr = getSprite(sObj.prop || sObj.tuft1);
      const cycleW = 360;
      const propOff = ((Math.floor(scroll * 0.52) % cycleW) + cycleW) % cycleW;
      const pStartRep = Math.floor((minX - cycleW) / cycleW);
      const pEndRep = Math.ceil((maxX + cycleW) / cycleW);
      ctx.save();
      ctx.globalAlpha = 0.56 * layerAlpha;
      ctx.imageSmoothingEnabled = true;
      for (let rep = pStartRep; rep <= pEndRep; rep++) {
        const px = rep * cycleW - propOff;
        if (treeSpr) {
          const th = 68;
          const tw = Math.round(th * (treeSpr.naturalWidth / treeSpr.naturalHeight));
          ctx.drawImage(treeSpr, Math.floor(px + 8), Math.floor(groundY - th + 5), tw, th);
        }
        if (tuft1Spr) {
          const fh = 24;
          const fw = Math.round(fh * (tuft1Spr.naturalWidth / tuft1Spr.naturalHeight));
          ctx.drawImage(tuft1Spr, Math.floor(px + 92), Math.floor(groundY - fh + 3), fw, fh);
        }
        if (bushSpr) {
          const bh = 30;
          const bw = Math.round(bh * (bushSpr.naturalWidth / bushSpr.naturalHeight));
          ctx.drawImage(bushSpr, Math.floor(px + 138), Math.floor(groundY - bh + 3), bw, bh);
        }
        if (treeAltSpr) {
          const th2 = 56;
          const tw2 = Math.round(th2 * (treeAltSpr.naturalWidth / treeAltSpr.naturalHeight));
          ctx.drawImage(treeAltSpr, Math.floor(px + 206), Math.floor(groundY - th2 + 5), tw2, th2);
        }
        if (tuft2Spr) {
          const t2h = 26;
          const t2w = Math.round(t2h * (tuft2Spr.naturalWidth / tuft2Spr.naturalHeight));
          ctx.drawImage(tuft2Spr, Math.floor(px + 276), Math.floor(groundY - t2h + 3), t2w, t2h);
        }
        if (propSpr) {
          const ph = sObj.id === 'winter' ? 21 : 19;
          const pw = Math.round(ph * (propSpr.naturalWidth / propSpr.naturalHeight));
          ctx.drawImage(propSpr, Math.floor(px + 322), Math.floor(groundY - ph + 3), pw, ph);
        }
      }
      ctx.restore();
    };

    if (prevSeason && prevSeason.id !== season.id && f < 0.995) {
      drawSeasonNatureLayer(prevSeason, 1 - f);
      drawSeasonNatureLayer(season, f);
    } else {
      drawSeasonNatureLayer(season, 1);
    }

    // Seamless Panoramic Seasonal Ground Strip (Spring / Summer / Autumn / Winter)
    const groundKey = season.tile || `ground_${season.id}`;
    const prevGroundKey = prevSeason ? (prevSeason.tile || `ground_${prevSeason.id}`) : groundKey;
    const tileSpr = getSprite(groundKey) || getSprite('ground_spring') || getSprite('sp_spring_tile');
    const prevTileSpr = (prevGroundKey !== groundKey && f < 0.995) ? getSprite(prevGroundKey) : null;
    const groundBottomSpan = Math.max(h, maxY) - groundY;

    ctx.fillStyle = lerpHex(prevSeason.groundBase || '#5b2813', season.groundBase || '#5b2813', f);
    ctx.fillRect(minX - 10, groundY, spanW + 20, groundBottomSpan + 14);

    const drawGroundStrip = (spr, alpha) => {
      if (!spr) return;
      ctx.save();
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      if (spr.naturalWidth > spr.naturalHeight * 3) {
        const surfSrcY = 34;
        const bodySrcH = Math.max(40, spr.naturalHeight - surfSrcY);
        const bodyTargetH = Math.max(60, Math.ceil(groundBottomSpan) + 4);
        const scale = bodyTargetH / bodySrcH;
        const drawH = Math.ceil(spr.naturalHeight * scale);
        const drawW = Math.max(240, Math.round(spr.naturalWidth * scale));
        const drawTop = Math.round(groundY - surfSrcY * scale);
        const off = ((Math.floor(scroll) % drawW) + drawW) % drawW;
        const startX = Math.floor((minX - drawW) / drawW) * drawW - off;
        for (let gx = startX; gx < maxX + drawW; gx += drawW) {
          ctx.drawImage(spr, Math.floor(gx), drawTop, drawW + 1, drawH);
        }
      } else {
        const tileW = 46;
        const tileH = 34;
        const tileOff = ((Math.floor(scroll) % tileW) + tileW) % tileW;
        const tileStart = Math.floor((minX - tileW) / tileW) * tileW - tileOff;
        for (let gx = tileStart; gx < maxX + tileW; gx += tileW) {
          ctx.drawImage(spr, Math.floor(gx), groundY - 3, tileW, tileH);
        }
      }
      ctx.restore();
    };

    if (prevTileSpr && f < 0.995) {
      drawGroundStrip(prevTileSpr, 1);
      drawGroundStrip(tileSpr, f);
    } else if (tileSpr) {
      drawGroundStrip(tileSpr, 1);
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

    // Batched Weather Particles (realistic layered rain texture stopping cleanly at water/ground surface!)
    const len = particles.length;
    if (heavyRain) {
      const surfaceY = floodLevel > 0.04 ? (GROUND_Y - 19 * floodLevel + 3) : (GROUND_Y + 2);
      const rainSpanH = Math.max(40, surfaceY - minY);
      const isFloodRain = weatherEvent === 'flood';
      const rainTiltX = isFloodRain ? -6.2 : -5.2;
      const rainLenY = isFloodRain ? 15.5 : 13.0;

      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        const spdMult = isFloodRain ? 1.18 : 1.0;
        p.x -= 175 * dt * p.v * spdMult;
        p.y += 355 * dt * p.v * spdMult;
        if (p.y > surfaceY) {
          p.y = minY - 8 - Math.random() * 18;
          p.x = minX + Math.random() * (spanW + 90);
        }
        if (p.x < minX - 16) {
          p.x = maxX + 12 + Math.random() * 40;
          p.y = minY + Math.random() * rainSpanH;
        }
      }

      ctx.save();
      ctx.lineCap = 'round';
      // Pass 1: Soft far/mid misty rain sheet for depth
      ctx.strokeStyle = isFloodRain ? 'rgba(182, 224, 255, 0.44)' : 'rgba(188, 228, 255, 0.36)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        if (p.s !== 1) continue;
        const endY = Math.min(surfaceY, p.y + rainLenY * 1.15);
        const ratio = Math.max(0, (endY - p.y) / (rainLenY * 1.15));
        if (ratio <= 0.05) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + rainTiltX * 1.15 * ratio, endY);
      }
      ctx.stroke();

      // Pass 2: Crisp bright foreground rain droplets
      ctx.strokeStyle = isFloodRain ? 'rgba(232, 249, 255, 0.86)' : 'rgba(220, 244, 255, 0.78)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        if (p.s === 1) continue;
        const endY = Math.min(surfaceY, p.y + rainLenY);
        const ratio = Math.max(0, (endY - p.y) / rainLenY);
        if (ratio <= 0.05) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + rainTiltX * ratio, endY);
      }
      ctx.stroke();

      // Subtle wet rain-hit ground shimmer & micro splashes during regular rain (when not fully flooded)
      if (floodLevel < 0.35) {
        const sheenA = (1 - floodLevel / 0.35) * 0.24;
        ctx.fillStyle = `rgba(140, 210, 255, ${sheenA.toFixed(3)})`;
        ctx.fillRect(minX - 10, GROUND_Y - 2, spanW + 20, 4);
        ctx.strokeStyle = `rgba(225, 248, 255, ${(sheenA * 2.1).toFixed(3)})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        const hitCnt = IS_MOBILE ? 6 : 9;
        for (let k = 0; k < hitCnt; k++) {
          const cycle = (t * 2.8 + k * 0.37) % 1;
          const sx = minX + (((k * 97 + Math.floor(t * 2.8 + k * 0.37) * 53) % Math.max(200, Math.floor(spanW))) + spanW) % spanW;
          const sy = GROUND_Y + 0.5;
          const spread = 2 + cycle * 4.5;
          const lift = Math.sin(cycle * Math.PI) * 3.8;
          ctx.moveTo(sx - spread, sy - lift);
          ctx.lineTo(sx, sy);
          ctx.lineTo(sx + spread, sy - lift);
        }
        ctx.stroke();
      }
      ctx.restore();
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
      const leafSpr = getSprite('nat_su_leaf');
      ctx.fillStyle = 'rgba(255, 245, 175, 0.72)';
      ctx.beginPath();
      for (let idx = 0; idx < len; idx++) {
        const p = particles[idx];
        p.x -= 48 * dt * p.v;
        p.y += Math.sin(t * 3 + p.p) * 14 * dt;
        if (p.y > maxY) { p.y = minY - 6; p.x = minX + Math.random() * (spanW + 60); }
        if (p.x < minX - 10) { p.x = maxX + 10; p.y = minY + Math.random() * spanH; }
        if (!leafSpr || (idx % 4) !== 0) {
          ctx.moveTo(p.x + 1.8, p.y);
          ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      if (leafSpr) {
        const sz = 9;
        for (let idx = 0; idx < len; idx += 4) {
          const p = particles[idx];
          ctx.save();
          ctx.globalAlpha = 0.82;
          ctx.translate(p.x, p.y);
          ctx.rotate(t * 2.2 + p.p);
          ctx.drawImage(leafSpr, -sz * 0.5, -sz * 0.5, sz, sz);
          ctx.restore();
        }
      }
    } else {
      // Uploaded seasonal petal (spring) / maple leaf (autumn) sprites + lightweight sparkle accent
      const isAutumnMode = seasonId === 'autumn' || weatherEvent === 'gust';
      const sprKey = isAutumnMode ? 'nat_au_leaf' : 'nat_sp_petal';
      const natSpr = getSprite(sprKey);
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
      if (natSpr) {
        const step = IS_MOBILE ? 3 : 2;
        const baseSz = isAutumnMode ? 11 : 9;
        const aspect = natSpr.naturalWidth / Math.max(1, natSpr.naturalHeight);
        for (let idx = 0; idx < len; idx += step) {
          const p = particles[idx];
          const sz = baseSz * (p.s === 1 ? 0.86 : 1.12);
          ctx.save();
          ctx.globalAlpha = 0.88;
          ctx.translate(p.x, p.y);
          ctx.rotate(t * 2.8 + p.p);
          ctx.drawImage(natSpr, -sz * aspect * 0.5, -sz * 0.5, sz * aspect, sz);
          ctx.restore();
        }
      } else {
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
  }

  // ===================== REALISTIC TRANSLUCENT FLOODED RAINWATER (NO CARTOON WAVES!) =====================
  function traceFloodSurface(ctx, minX, maxX, baseY, scroll, t) {
    const step = 18;
    const startX = minX - 16;
    const endX = maxX + 20;
    const phaseA = scroll * 0.032 + t * 2.6;
    const phaseB = scroll * 0.068 - t * 4.1;
    ctx.moveTo(startX, baseY + Math.sin(startX * 0.028 + phaseA) * 1.15 + Math.sin(startX * 0.064 + phaseB) * 0.55);
    for (let x = startX + step; x <= endX; x += step) {
      const wy = baseY + Math.sin(x * 0.028 + phaseA) * 1.15 + Math.sin(x * 0.064 + phaseB) * 0.55;
      ctx.lineTo(x, wy);
    }
  }

  function drawFloodWaterBack(ctx, run, t) {
    if (floodLevel <= 0.01) return;
    const minX = curView.minX;
    const maxX = curView.maxX;
    const depth = 19 * floodLevel;
    const waterTopY = GROUND_Y - depth;
    const waterBotY = GROUND_Y + 6;

    ctx.save();
    ctx.beginPath();
    traceFloodSurface(ctx, minX, maxX, waterTopY, run.scroll, t);
    ctx.lineTo(maxX + 20, waterBotY);
    ctx.lineTo(minX - 16, waterBotY);
    ctx.closePath();
    const bgGrad = ctx.createLinearGradient(0, waterTopY, 0, waterBotY);
    bgGrad.addColorStop(0, `rgba(92, 168, 228, ${(0.24 * floodLevel).toFixed(3)})`);
    bgGrad.addColorStop(0.55, `rgba(28, 98, 174, ${(0.34 * floodLevel).toFixed(3)})`);
    bgGrad.addColorStop(1, `rgba(14, 52, 112, ${(0.42 * floodLevel).toFixed(3)})`);
    ctx.fillStyle = bgGrad;
    ctx.fill();
    ctx.restore();
  }

  function drawFloodWaterFront(ctx, run, t) {
    if (floodLevel <= 0.01) return;
    const minX = curView.minX;
    const maxX = curView.maxX;
    const spanW = maxX - minX;
    const depth = 19 * floodLevel;
    const waterTopY = GROUND_Y - depth;
    const waterBotY = GROUND_Y + 7;

    ctx.save();
    // 1. Translucent pooled rainwater body overlapping lower legs & obstacle bases
    ctx.beginPath();
    traceFloodSurface(ctx, minX, maxX, waterTopY, run.scroll, t);
    ctx.lineTo(maxX + 20, waterBotY);
    ctx.lineTo(minX - 16, waterBotY);
    ctx.closePath();
    const fgGrad = ctx.createLinearGradient(0, waterTopY, 0, waterBotY);
    fgGrad.addColorStop(0, `rgba(168, 226, 255, ${(0.32 * floodLevel).toFixed(3)})`);
    fgGrad.addColorStop(0.28, `rgba(54, 148, 224, ${(0.38 * floodLevel).toFixed(3)})`);
    fgGrad.addColorStop(1, `rgba(14, 62, 132, ${(0.50 * floodLevel).toFixed(3)})`);
    ctx.fillStyle = fgGrad;
    ctx.fill();

    // 2. Clip inside water body for scrolling underwater light shimmer & rain caustics
    ctx.save();
    ctx.clip();
    const bandCnt = IS_MOBILE ? 7 : 11;
    for (let i = 0; i < bandCnt; i++) {
      const bx = minX + (((i * 78 - run.scroll * 0.82 - t * 24) % (spanW + 90) + (spanW + 90)) % (spanW + 90)) - 45;
      const by = waterTopY + 3 + ((i * 7) % Math.max(5, Math.floor(depth - 2)));
      const bw = 20 + (i % 3) * 14;
      const shimmer = 0.14 + Math.sin(t * 5.2 + i * 1.7) * 0.08;
      ctx.fillStyle = `rgba(218, 246, 255, ${(shimmer * floodLevel).toFixed(3)})`;
      ctx.fillRect(Math.floor(bx), Math.floor(by), bw, 1.5);
    }
    ctx.restore();

    // 3. Crisp glassy surface meniscus line (sky light reflection on rainwater)
    ctx.beginPath();
    traceFloodSurface(ctx, minX, maxX, waterTopY, run.scroll, t);
    ctx.strokeStyle = `rgba(228, 249, 255, ${(0.82 * floodLevel).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    traceFloodSurface(ctx, minX, maxX, waterTopY + 2.2, run.scroll, t);
    ctx.strokeStyle = `rgba(130, 214, 255, ${(0.36 * floodLevel).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 4. Organic raindrop impact ripples & micro water-crown splashes on the flooded surface
    const rippleCnt = IS_MOBILE ? 8 : 12;
    for (let i = 0; i < rippleCnt; i++) {
      const rate = 1.45 + (i % 3) * 0.35;
      const rawPhase = t * rate + i * 0.43;
      const cycle = rawPhase % 1;
      const seed = Math.floor(rawPhase);
      const rxBase = minX + (((i * 89 + seed * 67) % Math.max(200, Math.floor(spanW))) + spanW) % spanW;
      const ryBase = waterTopY + 2.5 + ((i * 5 + seed * 3) % Math.max(4, Math.floor(depth * 0.55)));
      const fade = (1 - cycle) * floodLevel;
      const radX = 2.5 + cycle * 12.5;
      const radY = 0.9 + cycle * 2.6;

      ctx.strokeStyle = `rgba(225, 248, 255, ${(0.68 * fade).toFixed(3)})`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.ellipse(rxBase, ryBase, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Tiny bright upward rainwater crown droplet right at impact
      if (cycle < 0.28) {
        const sp = cycle / 0.28;
        const lift = Math.sin(sp * Math.PI) * 5.2;
        const spread = 1.5 + sp * 4.2;
        ctx.strokeStyle = `rgba(240, 252, 255, ${(0.85 * (1 - sp) * floodLevel).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(rxBase - spread, ryBase - lift);
        ctx.lineTo(rxBase, ryBase);
        ctx.lineTo(rxBase + spread, ryBase - lift);
        ctx.stroke();
      }
    }

    // 5. Runner wading foot-splash spray when running directly through the flooded rainwater
    if (!run.dead && !run.dying && !run.onPlatform && run.playerY >= GROUND_Y - 5 && floodLevel > 0.25) {
      const px = run.playerX;
      const py = waterTopY + 3;
      ctx.fillStyle = `rgba(232, 250, 255, ${(0.82 * floodLevel).toFixed(3)})`;
      for (let k = 0; k < 5; k++) {
        const pCycle = (t * 5.4 + k * 0.21) % 1;
        const sx = px - 4 - pCycle * (16 + (k % 3) * 7);
        const sy = py - Math.sin(pCycle * Math.PI) * (7 + (k % 2) * 5);
        const dr = Math.max(0.9, (2.2 - pCycle * 1.4));
        ctx.beginPath();
        ctx.arc(sx, sy, dr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(230, 250, 255, ${(0.62 * floodLevel).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(px - 2, py + 1.5, 11 + Math.sin(t * 16) * 2.5, 2.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ===================== KOREAN STREET INTERACTIVE FEATURES (100% UPLOADED SPRITES!) =====================
  function drawStreetFeatures(ctx, run, t) {
    // 1. Back layer of translucent rising floodwater (foreground glass layer renders over feet!)
    drawFloodWaterBack(ctx, run, t);

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
      ctx.strokeText('물벼락 주의! 점프!', bx + bw / 2, by + 17);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('물벼락 주의! 점프!', bx + bw / 2, by + 17);
      ctx.restore();
    } else if (car.phase === 'pass') {
      const x = Math.floor(car.x);
      const carSpr = getSprite('sp_red_car');
      ctx.imageSmoothingEnabled = true;
      // Translucent rainwater tire-spray plume instead of cartoon wave stamp
      ctx.save();
      const sprayGrad = ctx.createRadialGradient(x + 42, GROUND_Y - 16, 4, x + 46, GROUND_Y - 20, 38);
      sprayGrad.addColorStop(0, 'rgba(225, 248, 255, 0.78)');
      sprayGrad.addColorStop(0.55, 'rgba(110, 198, 255, 0.45)');
      sprayGrad.addColorStop(1, 'rgba(60, 150, 230, 0)');
      ctx.fillStyle = sprayGrad;
      ctx.beginPath();
      ctx.ellipse(x + 44, GROUND_Y - 16, 36, 20, -0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(235, 252, 255, 0.86)';
      for (let s = 0; s < 8; s++) {
        const p = (t * 9 + s * 0.19) % 1;
        const dx = x + 26 + p * 44 + (s % 3) * 5;
        const dy = GROUND_Y - 6 - Math.sin(p * Math.PI) * (20 + (s % 3) * 8);
        ctx.beginPath();
        ctx.arc(dx, dy, 2.2 * (1 - p * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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
      ctx.strokeText('돌진! 마스크 착용!', bx + bw / 2, by + 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('돌진! 마스크 착용!', bx + bw / 2, by + 16);
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
      ctx.strokeText('우박 낙하! 우산 펴기!', bx + bw / 2, by + 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('우박 낙하! 우산 펴기!', bx + bw / 2, by + 16);
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
  // ===================== CACHED OUTFIT-ONLY SKIN SPRITES (ZERO PER-FRAME LAG & NATURAL SKIN/HAIR!) =====================
  const filteredSkinCache = {};
  const filteredDataUrlCache = {};

  function rgbToHsl(r, g, b) {
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    const l = (max + min) * 0.5;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rf) h = ((gf - bf) / d) + (gf < bf ? 6 : 0);
    else if (max === gf) h = ((bf - rf) / d) + 2;
    else h = ((rf - gf) / d) + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    let hp = (h % 360) / 60;
    if (hp < 0) hp += 6;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const m = l - c * 0.5;
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    return [
      Math.max(0, Math.min(255, Math.round((r1 + m) * 255))),
      Math.max(0, Math.min(255, Math.round((g1 + m) * 255))),
      Math.max(0, Math.min(255, Math.round((b1 + m) * 255)))
    ];
  }

  function applyOutfitColorRecolor(octx, cw, ch, oc) {
    let imgData;
    try {
      imgData = octx.getImageData(0, 0, cw, ch);
    } catch (_) {
      return false;
    }
    const d = imgData.data;
    const mode = oc.mode;
    const targetH = oc.h;
    const targetS = oc.s;
    const lumMult = oc.lm || 1.0;

    // For white-puffer padding skins, build exact per-row & per-column pale-peach face hull
    // so white eye sclera inside the face stay 100% pure white in every pose (run/jump/slide/die)!
    let rowMinX = null, rowMaxX = null, colMaxY = null;
    let skinCount = 0, faceMinY = ch;
    const padTop = Math.max(4, Math.round(ch * 0.05));
    const padSide = Math.max(3, Math.round(cw * 0.02));

    if (mode === 'padding') {
      rowMinX = new Int16Array(ch);
      rowMaxX = new Int16Array(ch);
      colMaxY = new Int16Array(cw);
      rowMinX.fill(cw);
      rowMaxX.fill(-1);
      colMaxY.fill(-1);
      for (let y = 0; y < ch; y++) {
        const rowOff = y * cw * 4;
        for (let x = 0; x < cw; x++) {
          const i = rowOff + x * 4;
          if (d[i + 3] < 160) continue;
          const pr = d[i], pg = d[i + 1], pb = d[i + 2];
          const rb = pr - pb;
          if (pr >= 205 && pg >= 170 && pb >= 140 && pr >= pg && pg >= pb && rb >= 14 && rb <= 82) {
            skinCount++;
            if (x < rowMinX[y]) rowMinX[y] = x;
            if (x > rowMaxX[y]) rowMaxX[y] = x;
            if (y > colMaxY[x]) colMaxY[x] = y;
            if (y < faceMinY) faceMinY = y;
          }
        }
      }
    }

    let nonEmptyAlpha = 0;
    for (let y = 0; y < ch; y++) {
      let rMin = cw, rMax = -1;
      if (mode === 'padding' && skinCount > 10) {
        rMin = rowMinX[y];
        rMax = rowMaxX[y];
        for (let dy = 1; dy <= padTop; dy++) {
          const yy = y + dy;
          if (yy < ch && rowMaxX[yy] >= 0) {
            if (rowMinX[yy] < rMin) rMin = rowMinX[yy];
            if (rowMaxX[yy] > rMax) rMax = rowMaxX[yy];
          }
        }
      }
      const rowOff = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        const i = rowOff + x * 4;
        if (d[i + 3] < 20) continue;
        nonEmptyAlpha++;
        const pr = d[i], pg = d[i + 1], pb = d[i + 2];
        const hsl = rgbToHsl(pr, pg, pb);
        const hue = hsl[0], sat = hsl[1], lum = hsl[2];
        let blend = 0;
        let newL = lum;

        if (mode === 'yellow') {
          const gb = pg - pb;
          if (hue >= 30 && hue <= 68 && sat >= 0.36 && lum >= 0.24 && gb >= 34) {
            blend = Math.min(1, (gb - 30) / 36);
            newL = Math.max(0.12, Math.min(0.90, lum * lumMult));
          }
        } else if (mode === 'blue') {
          const br = pb - pr;
          if (hue >= 176 && hue <= 256 && sat >= 0.18 && lum >= 0.16 && br >= 14) {
            blend = Math.min(1, (br - 10) / 26);
            newL = Math.max(0.12, Math.min(0.88, lum * lumMult));
          }
        } else if (mode === 'red') {
          const rg = pr - pg;
          if ((hue >= 334 || hue <= 16) && sat >= 0.36 && lum >= 0.16 && lum <= 0.68 && rg >= 36) {
            blend = Math.min(1, (rg - 32) / 32);
            newL = Math.max(0.12, Math.min(0.86, lum * lumMult));
          }
        } else if (mode === 'padding') {
          const maxC = Math.max(pr, pg, pb);
          const minC = Math.min(pr, pg, pb);
          const chroma = maxC - minC;
          const hasSkinBelow = colMaxY[x] >= 0 && y <= colMaxY[x] + 2;
          const inFaceHull = (skinCount > 10) && hasSkinBelow && (y >= faceMinY - padTop) && (x >= rMin + 1) && (x <= rMax + padSide);
          const isCoolAccent = !inFaceHull && hue >= 186 && hue <= 256 && chroma >= 18 && lum >= 0.24 && (pb - pr) >= 14;
          const isWhitePuff = !inFaceHull && lum >= 0.56 && chroma <= 34 && (pr - pb) <= 12;
          if (isCoolAccent || isWhitePuff) {
            if (isCoolAccent) {
              blend = 1;
            } else {
              const b1 = Math.min(1, (lum - 0.52) / 0.12);
              const b2 = Math.min(1, (14 - (pr - pb)) / 8);
              const b3 = Math.min(1, (36 - chroma) / 14);
              blend = Math.max(0, Math.min(b1, b2, b3));
            }
            newL = Math.max(0.16, Math.min(0.76, 0.06 + lum * lumMult));
          }
        }

        if (blend > 0) {
          const rgb = hslToRgb(targetH, targetS, newL);
          d[i]     = Math.round(pr * (1 - blend) + rgb[0] * blend);
          d[i + 1] = Math.round(pg * (1 - blend) + rgb[1] * blend);
          d[i + 2] = Math.round(pb * (1 - blend) + rgb[2] * blend);
        }
      }
    }
    if (nonEmptyAlpha < 8) return false;
    octx.putImageData(imgData, 0, 0);
    return true;
  }

  function getFilteredCharSprite(spr, skinDef) {
    if (!spr || !skinDef) return spr;
    const hasOutfit = Boolean(skinDef.outfitColor);
    const hasFilter = Boolean(skinDef.filter && skinDef.filter !== 'none');
    if (!hasOutfit && !hasFilter) return spr;
    const key = `${skinDef.id}|${spr.src}`;
    if (filteredSkinCache[key]) return filteredSkinCache[key];
    const sw = spr.naturalWidth || 64;
    const sh = spr.naturalHeight || 64;
    const maxDim = IS_MOBILE ? 200 : 256;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const octx = off.getContext('2d', hasOutfit ? { willReadFrequently: true } : undefined);
    if (hasOutfit) {
      octx.drawImage(spr, 0, 0, cw, ch);
      if (!applyOutfitColorRecolor(octx, cw, ch, skinDef.outfitColor)) {
        off.width = 0;
        off.height = 0;
        return spr;
      }
    } else {
      if ('filter' in octx) {
        octx.filter = skinDef.filter;
      }
      octx.drawImage(spr, 0, 0, cw, ch);
      if ('filter' in octx) octx.filter = 'none';
    }
    filteredSkinCache[key] = off;
    return off;
  }

  function getRecoloredDataUrl(spr, skinDef) {
    if (!spr || !spr.complete || !spr.naturalWidth) return null;
    if (!skinDef || !skinDef.outfitColor) return spr.src;
    const key = `${skinDef.id}|${spr.src}`;
    if (filteredDataUrlCache[key]) return filteredDataUrlCache[key];
    const off = getFilteredCharSprite(spr, skinDef);
    if (!off || off === spr) return spr.src;
    try {
      const url = off.toDataURL('image/png');
      filteredDataUrlCache[key] = url;
      return url;
    } catch (_) {
      return spr.src;
    }
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

    // Default 6-frame Flipped Blue Comic Jet Booster (all non-Mythic chars/skins + Hoodie Catgirl; same for FEVER!) OR Custom Mythic Booster Jet
    if (!dead && (feverTimer > 0 || speedBoostTimer > 0)) {
      let dashSpr = null;
      const isCustomBooster = Boolean(skinDef && skinDef.customBoosterPrefix && skinDef.id !== 'catgirl_hoodie');
      if (isCustomBooster) {
        const bf = Math.floor(t * 18) % (skinDef.customBoosterFrames || 12);
        dashSpr = getSprite(`${skinDef.customBoosterPrefix}_${bf}`) || getSprite(`${skinDef.customBoosterPrefix}_0`);
      } else {
        const bf = Math.floor(t * 15) % 6;
        dashSpr = getSprite(`fx_booster_${bf}`) || getSprite('fx_booster_0');
      }
      if (dashSpr) {
        const pulse = 0.96 + Math.sin(t * 20) * 0.05;
        const dh = Math.round((isCustomBooster ? (isProne ? 36 : 44) : (isProne ? 30 : 38)) * pulse);
        const dw = Math.round(dh * (dashSpr.naturalWidth / dashSpr.naturalHeight));
        ctx.save();
        ctx.globalAlpha = isCustomBooster ? 0.94 : 0.95;
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
      // Soft atmospheric ambient backlight behind Mythic aura skins
      const backR = isFever ? (isProne ? 38 : scaleHeight * 0.82) : (isProne ? 30 : scaleHeight * 0.68);
      const backGrad = ctx.createRadialGradient(cx, auraCy, 4, cx, auraCy, backR);
      const isIceEmp = skinDef.id === 'ice_emperor_mythic';
      backGrad.addColorStop(
        0,
        isIceEmp
          ? (isFever ? 'rgba(104, 214, 255, 0.48)' : 'rgba(96, 186, 255, 0.30)')
          : (isFever ? 'rgba(180, 92, 255, 0.48)' : 'rgba(166, 78, 255, 0.28)')
      );
      backGrad.addColorStop(1, isIceEmp ? 'rgba(98, 114, 255, 0)' : 'rgba(120, 42, 235, 0)');
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

    // Fever rainbow aura (for non-customAura skins) / Custom Mythic Shield VFX behind character!
    const hasCustomShield = Boolean(skinDef && (skinDef.customShieldPrefix || skinDef.customShieldVfx));
    if (!dead && feverTimer > 0 && !(skinDef && skinDef.customAuraPrefix)) {
      ctx.strokeStyle = Math.floor(t * 14) % 2 === 0 ? '#ffe85c' : '#63e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - (isProne ? 14 : scaleHeight * 0.48), isProne ? 24 : scaleHeight * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    } else if (!dead && shield && feverTimer <= 0 && hasCustomShield) {
      let ringSpr = null;
      if (skinDef && skinDef.customShieldPrefix) {
        const sf = Math.floor(t * 10) % (skinDef.customShieldFrames || 6);
        ringSpr = getSprite(`${skinDef.customShieldPrefix}_${sf}`) || getSprite(`${skinDef.customShieldPrefix}_0`);
      } else {
        ringSpr = getSprite(skinDef.customShieldVfx);
      }
      if (ringSpr) {
        const pulse = 1 + Math.sin(t * 8) * 0.04;
        const rSz = Math.round((isProne ? 52 : scaleHeight * 1.24) * pulse);
        ctx.save();
        ctx.globalAlpha = skinDef && skinDef.customShieldPrefix ? 0.72 : 0.88;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ringSpr, Math.floor(cx - rSz / 2), Math.floor(cy - (isProne ? 16 : scaleHeight * 0.5) - rSz / 2), rSz, rSz);
        ctx.restore();
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
      const drawSpr = (skinDef && (skinDef.outfitColor || (skinDef.filter && skinDef.filter !== 'none')))
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

    // Default Iridescent Glossy Bubble Shield rendered OVER the character (crystal-clear center encloses runner!)
    if (!dead && shield && feverTimer <= 0 && !hasCustomShield) {
      const bubbleSpr = getSprite('fx_shield_ring');
      const pulse = 1 + Math.sin(t * 7.5) * 0.035;
      const rSz = Math.round((isProne ? 56 : scaleHeight * 1.28) * pulse);
      const bCy = cy - (isProne ? 16 : scaleHeight * 0.5);
      if (bubbleSpr) {
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bubbleSpr, Math.floor(cx - rSz / 2), Math.floor(bCy - rSz / 2), rSz, rSz);
        ctx.restore();
      } else {
        ctx.save();
        ctx.strokeStyle = 'rgba(110, 220, 255, 0.92)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, bCy, isProne ? 23 : scaleHeight * 0.54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
  }

  // ===================== CACHED THIN LUMINOUS RED DANGER RIM FOR ALL OBSTACLES =====================
  const obstacleOutlineCache = {};

  function getOutlinedObstacleSprite(key, spr) {
    if (!spr || !spr.complete || !spr.naturalWidth || !spr.naturalHeight) return null;
    if (obstacleOutlineCache[key]) return obstacleOutlineCache[key];

    // Crisp working resolution (max 160px) for razor-thin glowing red outline
    const rawW = spr.naturalWidth;
    const rawH = spr.naturalHeight;
    const workScale = Math.min(1, 160 / Math.max(rawW, rawH));
    const sw = Math.max(16, Math.round(rawW * workScale));
    const sh = Math.max(16, Math.round(rawH * workScale));

    // Thin luminous red rim (~1.1px on screen) + soft neon crimson halo
    const rimR = Math.max(1.6, Math.max(sw, sh) * 0.022);
    const glowBlur = Math.max(5, Math.round(Math.max(sw, sh) * 0.068));
    const pad = Math.ceil(rimR + glowBlur + 3);
    const cw = sw + pad * 2;
    const ch = sh + pad * 2;

    const sil = document.createElement('canvas');
    sil.width = sw;
    sil.height = sh;
    const sctx = sil.getContext('2d');
    if (!sctx) { sil.width = 0; sil.height = 0; return null; }
    sctx.drawImage(spr, 0, 0, sw, sh);

    // Guard against undecoded / blank mobile frames so a transparent canvas is NEVER cached!
    try {
      const sample = sctx.getImageData(0, 0, sw, sh).data;
      let hasSolid = false;
      const step = Math.max(4, Math.floor(sample.length / 256) * 4);
      for (let i = 3; i < sample.length; i += step) {
        if (sample[i] > 20) { hasSolid = true; break; }
      }
      if (!hasSolid) {
        sil.width = 0;
        sil.height = 0;
        return null;
      }
    } catch (_) {}

    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#ff243d';
    sctx.fillRect(0, 0, sw, sh);

    const silLight = document.createElement('canvas');
    silLight.width = sw;
    silLight.height = sh;
    const lctx = silLight.getContext('2d');
    if (!lctx) { sil.width = 0; sil.height = 0; silLight.width = 0; silLight.height = 0; return null; }
    lctx.drawImage(spr, 0, 0, sw, sh);
    lctx.globalCompositeOperation = 'source-in';
    lctx.fillStyle = '#ff7a8a';
    lctx.fillRect(0, 0, sw, sh);

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    if (!octx) { sil.width = 0; sil.height = 0; silLight.width = 0; silLight.height = 0; out.width = 0; out.height = 0; return null; }
    octx.imageSmoothingEnabled = true;

    // 1) Soft luminous crimson outer glow hugging the exact contour
    octx.save();
    octx.shadowColor = 'rgba(255, 34, 62, 0.92)';
    octx.shadowBlur = glowBlur;
    octx.globalAlpha = 0.72;
    octx.drawImage(sil, pad, pad);
    octx.restore();

    // 2) Thin, crisp glowing red contour line (12 smooth passes)
    octx.globalAlpha = 0.95;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      octx.drawImage(sil, pad + Math.cos(ang) * rimR, pad + Math.sin(ang) * rimR);
    }

    // 3) Subtle bright coral-red highlight edge so the thin line visibly glows
    octx.globalAlpha = 0.65;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      octx.drawImage(silLight, pad + Math.cos(ang) * (rimR * 0.58), pad + Math.sin(ang) * (rimR * 0.58));
    }

    // 4) Original crisp comic obstacle art cleanly layered on top
    octx.globalAlpha = 1;
    octx.drawImage(spr, pad, pad, sw, sh);

    // Immediately release temporary GPU surfaces on mobile!
    sil.width = 0;
    sil.height = 0;
    silLight.width = 0;
    silLight.height = 0;

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
      // All 32 obs_* PNGs already include the crisp thin luminous red rim directly in the image (9% padding each side),
      // so mobile draws ctx.drawImage(spr) directly with ZERO offscreen canvas risk or GPU memory spikes!
      const isBakedRim = typeof ob.sprite === 'string' && ob.sprite.startsWith('obs_');
      let drawImg = spr;
      let px = 0;
      let py = 0;
      if (isBakedRim) {
        px = ob.w * 0.09;
        py = ob.h * 0.09;
      } else {
        const outlined = getOutlinedObstacleSprite(ob.sprite, spr);
        if (outlined && outlined.canvas && outlined.canvas.width > 0) {
          drawImg = outlined.canvas;
          px = ob.w * outlined.padRatioX;
          py = ob.h * outlined.padRatioY;
        }
      }
      const dw = ob.w + px * 2;
      const dh = ob.h + py * 2;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if (ob.lane === 'air') {
        // Directional flying obstacles keep speed streaks aligned with lively slight tilt
        ctx.translate(x + ob.w / 2, y + ob.h / 2);
        const tilt = Math.sin(t * 10 + ob.x * 0.04) * 0.055;
        ctx.rotate(tilt);
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
    } else {
      // Crisp visible fallback while an obstacle image is still downloading on slow mobile networks (never invisible!)
      ctx.save();
      drawRoundRect(ctx, x + 2, y + 2, Math.max(12, ob.w - 4), Math.max(12, ob.h - 4), 8);
      ctx.fillStyle = ob.lane === 'air' ? 'rgba(42, 92, 185, 0.88)' : 'rgba(62, 78, 108, 0.88)';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#ff2a42';
      ctx.shadowColor = 'rgba(255, 34, 62, 0.85)';
      ctx.shadowBlur = 6;
      ctx.stroke();
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

  function drawFeverSkyBanner(ctx, t, feverTimer = 4.5) {
    if (feverTimer <= 2.5) return;
    const spr = getSprite('ui_fever');
    if (!spr) return;

    const minX = curView.minX;
    const maxX = curView.maxX;
    const minY = curView.minY;
    const maxY = curView.maxY;
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    const elapsed = Math.max(0, 4.5 - feverTimer);
    const popIn = elapsed < 0.18
      ? (0.62 + Math.sin((elapsed / 0.18) * Math.PI * 0.65) * 0.44)
      : (1 + Math.sin(t * 11) * 0.035);
    const fadeIn = Math.min(1, elapsed / 0.12);
    const fadeOut = feverTimer < 2.95 ? Math.max(0, (feverTimer - 2.5) / 0.45) : 1;
    const alpha = Math.min(fadeIn, fadeOut) * 0.94;
    if (alpha <= 0.01) return;

    const ratio = (spr.naturalWidth && spr.naturalHeight) ? (spr.naturalWidth / spr.naturalHeight) : 2.0;
    const baseW = Math.min(116, Math.max(92, spanW * 0.215));
    const dw = Math.round(baseW * popIn);
    const dh = Math.round(dw / ratio);

    // Drawn in the open sky layer BEHIND all gameplay objects & strictly BELOW top HUD/season bar!
    const rawTopY = Math.max(minY + 90, Math.floor(minY + spanH * 0.275));
    const clampedTopY = Math.min(rawTopY, Math.max(minY + 76, GROUND_Y - dh - 94));
    const bobY = Math.sin(t * 7) * 1.6;
    const dx = Math.floor(minX + (spanW - dw) / 2);
    const dy = Math.floor(clampedTopY + bobY);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(spr, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawFeverOverlay(ctx, t, feverTimer = 4.5) {
    const minX = curView.minX;
    const maxX = curView.maxX;
    const minY = curView.minY;
    const maxY = curView.maxY;
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    // Full-screen energetic speed lines along outer edges only
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
      const fy = Math.max(curView.minY + 76, Math.floor(f.y - easeOut * 22));
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, f.life * 2.4);
      ctx.font = '900 12px "Paperlogy", "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.2;
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

  function syncViewport(canvasEl) {
    const cssW = Math.max(240, (canvasEl && canvasEl.clientWidth) || (typeof window !== 'undefined' ? window.innerWidth : W) || W);
    const cssH = Math.max(180, (canvasEl && canvasEl.clientHeight) || (typeof window !== 'undefined' ? window.innerHeight : H) || H);
    cachedCssW = cssW;
    cachedCssH = cssH;
    canvasSizeDirty = false;
    const aspect = cssW / cssH;
    let camX = 0;
    let offsetY = 0;
    let visW = W;
    let visH = H;
    if (aspect >= 1.52) {
      visW = H * aspect;
      visH = H;
    } else if (aspect >= 1.0) {
      visW = 470;
      visH = visW / aspect;
      camX = 28;
      offsetY = Math.round((visH - H) * 0.16);
    } else {
      visW = 405;
      visH = visW / aspect;
      camX = 44;
      offsetY = Math.round(Math.max(40, (visH - H) * 0.28));
    }
    curView = {
      minX: camX,
      maxX: camX + visW,
      minY: -offsetY,
      maxY: visH - offsetY
    };
    return curView;
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
    const targetFlood = run.weatherEvent === 'flood' ? 1 : 0;
    if (dt > 0) {
      if (floodLevel < targetFlood) floodLevel = Math.min(targetFlood, floodLevel + dt * 1.15);
      else if (floodLevel > targetFlood) floodLevel = Math.max(targetFlood, floodLevel - dt * 1.05);
    }
    drawBackground(ctx, W, H, GROUND_Y, run.seasonId, run.scroll, t, run.prevSeasonId, blend, run.weatherEvent, curView);

    // FEVER TIME! Sky Banner — drawn behind all gameplay objects so it never obscures coins, obstacles, or the player!
    if (run.feverTimer > 0) {
      drawFeverSkyBanner(ctx, t, run.feverTimer);
    }

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

    // Foreground Translucent Flooded Rainwater (submerges lower legs & obstacle bases with ripples & splashes!)
    if (floodLevel > 0.01) {
      drawFloodWaterFront(ctx, run, t);
    }

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
      drawFeverOverlay(ctx, t, run.feverTimer);
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
    syncViewport,
    invalidateCanvasSize,
    preloadForRun,
    preloadSeason,
    preloadChestAnim,
    inspectPreloadCacheStatus,
    downloadPreloadPacks,
    clearPreloadCache,
    clearFloaters,
    spawnFloater,
    spawnDust,
    spawnLandDust,
    spawnPickupEffect,
    getRecoloredDataUrl,
    renderRunFrame,
    renderHomePreview
  };
})();
