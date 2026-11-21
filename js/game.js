(function () {
  const DATA = window.RUN_DATA;
  const SFX = window.SFX;
  const Renderer = window.RunRenderer;

  const SAVE_KEY = 'kr_weather_runner_save_v1';
  const SAVE_BACKUP_KEY = 'kr_weather_runner_save_v1_backup';

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getWeekKey() {
    const d = new Date();
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  const ASSET_VER = '20261121hd8';

  function haptic(ms = 10) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch {}
    }
  }

  function createDefaultCharLevels() {
    const lv = {};
    DATA.CHARACTERS.forEach((c) => { lv[c.id] = 1; });
    return lv;
  }

  // ===================== PERSISTENT SAVE DATA (SAFE MIGRATION + BACKUP) =====================
  function loadSave() {
    const today = getTodayKey();
    const week = getWeekKey();
    const def = {
      gold: 80,
      gems: 0,
      unlockedChars: ['umbrella_master'],
      selectedChar: 'umbrella_master',
      charLevels: createDefaultCharLevels(),
      unlockedSkins: [],
      equippedSkins: {},
      chestBag: { wood: 0, silver: 0, gold: 0, diamond: 0 },
      pity: { gold: 0, diamond: 0 },
      dailyWoodChestDrops: { date: today, count: 0 },
      upgrades: { hp: 0, magnet: 0, defense: 0, score: 0 },
      boosters: { norway: 0, shield: 0, boost: 0 },
      bestScore: 0,
      bestYear: 1,
      bestDistanceM: 0,
      totalCoinsEver: 0,
      maxDodgeComboEver: 0,
      playCount: 0,
      attendance: { lastClaimDate: '', streak: 0 },
      dailyMissions: { date: today, progress: { dist: 0, coins: 0, jumps: 0, dodges: 0 }, claimed: {} },
      weeklyMissions: { week, progress: { dist: 0, runs: 0, dodges: 0, year2Runs: 0 }, claimed: {} },
      achievementsClaimed: {},
      stageMilestonesClaimed: {},
      audioSettings: { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.45 }
    };

    function parseKey(key) {
      try {
        const str = localStorage.getItem(key);
        if (!str) return null;
        const parsed = JSON.parse(str);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }

    const raw = parseKey(SAVE_KEY) || parseKey(SAVE_BACKUP_KEY);
    if (!raw) return def;

    const validIds = new Set(DATA.CHARACTERS.map((c) => c.id));
    const mergedLevels = { ...createDefaultCharLevels(), ...(raw.charLevels || {}) };
    if (raw.charLevels && raw.charLevels.basic > (mergedLevels.umbrella_master || 1)) {
      mergedLevels.umbrella_master = raw.charLevels.basic;
    }
    delete mergedLevels.basic;

    const rawUnlocked = Array.isArray(raw.unlockedChars) ? raw.unlockedChars.filter((id) => validIds.has(id)) : [];
    if (!rawUnlocked.includes('umbrella_master')) rawUnlocked.unshift('umbrella_master');
    const migratedSelected = validIds.has(raw.selectedChar) ? raw.selectedChar : 'umbrella_master';

    const rawDaily = raw.dailyMissions && raw.dailyMissions.date === today ? raw.dailyMissions : def.dailyMissions;
    const rawWeekly = raw.weeklyMissions && raw.weeklyMissions.week === week ? raw.weeklyMissions : def.weeklyMissions;
    const rawDrops = raw.dailyWoodChestDrops && raw.dailyWoodChestDrops.date === today ? raw.dailyWoodChestDrops : def.dailyWoodChestDrops;

    return {
      ...def,
      ...raw,
      gold: typeof raw.gold === 'number' && Number.isFinite(raw.gold) ? Math.max(0, Math.floor(raw.gold)) : def.gold,
      gems: typeof raw.gems === 'number' && Number.isFinite(raw.gems) ? Math.max(0, Math.floor(raw.gems)) : 0,
      unlockedChars: rawUnlocked,
      selectedChar: migratedSelected,
      charLevels: mergedLevels,
      unlockedSkins: Array.isArray(raw.unlockedSkins) ? raw.unlockedSkins : [],
      equippedSkins: raw.equippedSkins && typeof raw.equippedSkins === 'object' ? { ...raw.equippedSkins } : {},
      chestBag: { wood: 0, silver: 0, gold: 0, diamond: 0, ...(raw.chestBag || {}) },
      pity: { gold: 0, diamond: 0, ...(raw.pity || {}) },
      dailyWoodChestDrops: { date: today, count: Number(rawDrops.count) || 0 },
      upgrades: { ...def.upgrades, ...(raw.upgrades || {}) },
      boosters: { ...def.boosters, ...(raw.boosters || {}) },
      bestDistanceM: typeof raw.bestDistanceM === 'number' ? raw.bestDistanceM : 0,
      totalCoinsEver: typeof raw.totalCoinsEver === 'number' ? raw.totalCoinsEver : 0,
      maxDodgeComboEver: typeof raw.maxDodgeComboEver === 'number' ? raw.maxDodgeComboEver : 0,
      attendance: { ...def.attendance, ...(raw.attendance || {}) },
      dailyMissions: {
        date: today,
        progress: { dist: 0, coins: 0, jumps: 0, dodges: 0, ...(rawDaily.progress || {}) },
        claimed: { ...(rawDaily.claimed || {}) }
      },
      weeklyMissions: {
        week,
        progress: { dist: 0, runs: 0, dodges: 0, year2Runs: 0, ...(rawWeekly.progress || {}) },
        claimed: { ...(rawWeekly.claimed || {}) }
      },
      achievementsClaimed: { ...(raw.achievementsClaimed || {}) },
      stageMilestonesClaimed: { ...(raw.stageMilestonesClaimed || {}) },
      audioSettings: { ...def.audioSettings, ...(raw.audioSettings || {}) }
    };
  }

  let save = loadSave();
  SFX.applySettings(save.audioSettings);

  function ensureTodayMissions() {
    const today = getTodayKey();
    if (!save.dailyMissions || save.dailyMissions.date !== today) {
      save.dailyMissions = {
        date: today,
        progress: { dist: 0, coins: 0, jumps: 0, dodges: 0 },
        claimed: {}
      };
    }
    const week = getWeekKey();
    if (!save.weeklyMissions || save.weeklyMissions.week !== week) {
      save.weeklyMissions = {
        week,
        progress: { dist: 0, runs: 0, dodges: 0, year2Runs: 0 },
        claimed: {}
      };
    }
    if (!save.dailyWoodChestDrops || save.dailyWoodChestDrops.date !== today) {
      save.dailyWoodChestDrops = { date: today, count: 0 };
    }
  }

  function persistSave() {
    try {
      const json = JSON.stringify(save);
      localStorage.setItem(SAVE_KEY, json);
      localStorage.setItem(SAVE_BACKUP_KEY, json);
    } catch {
      // ignore storage errors
    }
  }

  // ===================== APP UI STATE =====================
  let currentTab = 'home';
  let currentShopSubtab = 'chests';
  let currentQuestSubtab = 'daily';
  let previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));
  let detailCharIdx = null;
  let lastHomeHeroSrc = '';

  // ===================== ACTIVE RUN STATE =====================
  let run = null;
  let paused = false;

  // ===================== DOM REFERENCES =====================
  const el = {
    btnRotateFullscreen: document.getElementById('btn-rotate-fullscreen'),
    introOverlay: document.getElementById('intro-overlay'),
    headerBestScore: document.getElementById('header-best-score'),
    btnGoldShop: document.getElementById('btn-gold-shop'),
    uiGold: document.getElementById('ui-gold'),
    btnGemShop: document.getElementById('btn-gem-shop'),
    uiGems: document.getElementById('ui-gems'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnShopProb: document.getElementById('btn-shop-prob'),

    attendanceOverlay: document.getElementById('attendance-overlay'),
    btnCloseAttendance: document.getElementById('btn-close-attendance'),
    attModalDesc: document.getElementById('att-modal-desc'),
    attDaysGrid: document.getElementById('att-days-grid'),
    btnClaimAttendance: document.getElementById('btn-claim-attendance'),

    achievementsOverlay: document.getElementById('achievements-overlay'),
    btnCloseAchievements: document.getElementById('btn-close-achievements'),
    achModalSummary: document.getElementById('ach-modal-summary'),
    achList: document.getElementById('ach-list'),

    settingsOverlay: document.getElementById('settings-overlay'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    chkBgmOn: document.getElementById('chk-bgm-on'),
    rngBgmVol: document.getElementById('rng-bgm-vol'),
    lblBgmVol: document.getElementById('lbl-bgm-vol'),
    chkSfxOn: document.getElementById('chk-sfx-on'),
    rngSfxVol: document.getElementById('rng-sfx-vol'),
    lblSfxVol: document.getElementById('lbl-sfx-vol'),
    btnToggleFullscreen: document.getElementById('btn-toggle-fullscreen'),

    homeHeroStage: document.getElementById('home-hero-stage'),
    homeHeroImg: document.getElementById('home-hero-img'),
    btnHomeCharInfo: document.getElementById('btn-home-char-info'),
    homeCharName: document.getElementById('home-char-name'),
    homeCharLvBadge: document.getElementById('home-char-lv-badge'),
    homeCharTier: document.getElementById('home-char-tier'),
    btnHomeBrawlers: document.getElementById('btn-home-brawlers'),
    homeBrawlerMini: document.getElementById('home-brawler-mini'),
    homeBrawlerCount: document.getElementById('home-brawler-count'),
    btnPrevChar: document.getElementById('btn-prev-char'),
    btnNextChar: document.getElementById('btn-next-char'),

    btnPlayStart: document.getElementById('btn-play-start'),
    btnPlayLabel: document.getElementById('btn-play-label'),
    btnPlaySub: document.getElementById('btn-play-sub'),

    dexRateText: document.getElementById('dex-rate-text'),
    dexBarFill: document.getElementById('dex-bar-fill'),
    dexBonusText: document.getElementById('dex-bonus-text'),
    charList: document.getElementById('char-list'),
    shopItemsList: document.getElementById('shop-items-list'),

    navMissionDot: document.getElementById('nav-mission-dot'),
    btnTabOpenAttendance: document.getElementById('btn-tab-open-attendance'),
    btnQuestProb: document.getElementById('btn-quest-prob'),
    questVaultBadge: document.getElementById('quest-vault-badge'),
    questResetLabel: document.getElementById('quest-reset-label'),
    pityGoldChip: document.getElementById('pity-gold-chip'),
    pityDiamondChip: document.getElementById('pity-diamond-chip'),
    bsQuestGrid: document.getElementById('bs-quest-grid'),

    rankMyAvatar: document.getElementById('rank-my-avatar'),
    rankMyPos: document.getElementById('rank-my-pos'),
    rankMyScoreLine: document.getElementById('rank-my-score-line'),
    rankStatYear: document.getElementById('rank-stat-year'),
    rankStatCoins: document.getElementById('rank-stat-coins'),
    rankStatCombo: document.getElementById('rank-stat-combo'),
    rankStatDex: document.getElementById('rank-stat-dex'),
    rankBoardList: document.getElementById('rank-board-list'),

    charDetailOverlay: document.getElementById('char-detail-overlay'),
    btnCloseCharDetail: document.getElementById('btn-close-char-detail'),
    btnDetailPrev: document.getElementById('btn-detail-prev'),
    btnDetailNext: document.getElementById('btn-detail-next'),
    detailHeroStage: document.getElementById('detail-hero-stage'),
    detailCharTier: document.getElementById('detail-char-tier'),
    detailCharName: document.getElementById('detail-char-name'),
    detailCharLv: document.getElementById('detail-char-lv'),
    detailEquippedPill: document.getElementById('detail-equipped-pill'),
    detailCharImg: document.getElementById('detail-char-img'),
    detailCharDesc: document.getElementById('detail-char-desc'),
    detailStatHp: document.getElementById('detail-stat-hp'),
    detailFillHp: document.getElementById('detail-fill-hp'),
    detailStatGold: document.getElementById('detail-stat-gold'),
    detailFillGold: document.getElementById('detail-fill-gold'),
    detailStatScore: document.getElementById('detail-stat-score'),
    detailFillScore: document.getElementById('detail-fill-score'),
    detailPassiveIco: document.getElementById('detail-passive-ico'),
    detailPassiveName: document.getElementById('detail-passive-name'),
    detailPassiveDesc: document.getElementById('detail-passive-desc'),
    detailSkinsRow: document.getElementById('detail-skins-row'),
    btnDetailSub: document.getElementById('btn-detail-sub'),
    btnDetailMain: document.getElementById('btn-detail-main'),

    viewRun: document.getElementById('view-run'),
    runCanvasWrap: document.getElementById('run-canvas-wrap'),
    runCanvas: document.getElementById('runCanvas'),
    runPortraitImg: document.getElementById('run-portrait-img'),
    runYearNum: document.getElementById('run-year-num'),
    runSeasonLabel: document.getElementById('run-season-label'),
    runScoreText: document.getElementById('run-score-text'),
    runHearts: document.getElementById('run-hearts'),
    runHpText: document.getElementById('run-hp-text'),
    runFeverFill: document.getElementById('run-fever-fill'),
    runFeverText: document.getElementById('run-fever-text'),
    runGoldText: document.getElementById('run-gold-text'),
    runYearFill: document.getElementById('run-year-fill'),
    runForecastBar: document.getElementById('run-forecast-bar'),
    fcSourceBadge: document.getElementById('fc-source-badge'),
    fcMessage: document.getElementById('fc-message'),
    fcHeatPill: document.getElementById('fc-heat-pill'),
    mudOverlay: document.getElementById('mud-splatter-overlay'),
    runBanner: document.getElementById('run-banner'),

    btnJump: document.getElementById('btn-jump'),
    btnSlide: document.getElementById('btn-slide'),
    btnToggleUmbrella: document.getElementById('btn-toggle-umbrella'),
    gearUmbrellaBar: document.getElementById('gear-umbrella-bar'),
    gearUmbrellaState: document.getElementById('gear-umbrella-state'),
    btnToggleMask: document.getElementById('btn-toggle-mask'),
    gearMaskBar: document.getElementById('gear-mask-bar'),
    gearMaskState: document.getElementById('gear-mask-state'),
    orbUiFever: document.getElementById('orb-ui-fever'),
    orbUiSpeed: document.getElementById('orb-ui-speed'),
    orbUiMagnet: document.getElementById('orb-ui-magnet'),
    orbUiNorway: document.getElementById('orb-ui-norway'),
    orbUiShield: document.getElementById('orb-ui-shield'),
    btnLandscapeRun: document.getElementById('btn-landscape-run'),
    btnPauseRun: document.getElementById('btn-pause-run'),

    pauseOverlay: document.getElementById('pause-overlay'),
    btnResumeRun: document.getElementById('btn-resume-run'),
    btnPauseSettings: document.getElementById('btn-pause-settings'),
    btnQuitHome: document.getElementById('btn-quit-home'),

    gameoverOverlay: document.getElementById('gameover-overlay'),
    resBestScore: document.getElementById('res-best-score'),
    resNewBest: document.getElementById('res-new-best'),
    resScore: document.getElementById('res-score'),
    btnResultHome: document.getElementById('btn-result-home'),

    chestOpenOverlay: document.getElementById('chest-open-overlay'),
    chestOpenStage: document.getElementById('chest-open-stage'),
    chestOpenTitle: document.getElementById('chest-open-title'),
    chestPityNote: document.getElementById('chest-pity-note'),
    btnTapChest: document.getElementById('btn-tap-chest'),
    chestAnimImg: document.getElementById('chest-anim-img'),
    chestTapHint: document.getElementById('chest-tap-hint'),
    chestRewardCard: document.getElementById('chest-reward-card'),
    chestRewardPity: document.getElementById('chest-reward-pity'),
    chestRewardRarity: document.getElementById('chest-reward-rarity'),
    chestRewardVisual: document.getElementById('chest-reward-visual'),
    chestRewardName: document.getElementById('chest-reward-name'),
    chestRewardSub: document.getElementById('chest-reward-sub'),
    btnChestEquip: document.getElementById('btn-chest-equip'),
    btnChestClose: document.getElementById('btn-chest-close'),

    probOverlay: document.getElementById('prob-overlay'),
    btnCloseProb: document.getElementById('btn-close-prob'),
    probModalBody: document.getElementById('prob-modal-body'),

    globalToast: document.getElementById('global-toast')
  };

  const runCtx = el.runCanvas.getContext('2d');

  // ===================== HELPERS =====================
  function getCharDef(id) {
    return DATA.CHARACTERS.find((c) => c.id === id) || DATA.CHARACTERS[0];
  }

  function isCharUnlocked(id) {
    return save.unlockedChars.includes(id);
  }

  function getCharLevel(id) {
    return Math.max(1, Math.min(DATA.MAX_CHAR_LEVEL, (save.charLevels && save.charLevels[id]) || 1));
  }

  function getCharStats(charDef) {
    return DATA.getCharEffectiveStats(charDef, getCharLevel(charDef.id), save.upgrades, save.unlockedChars.length);
  }

  function getMaxHp(charDef) {
    return getCharStats(charDef).maxHp;
  }

  function getEquippedSkin(charId) {
    const sid = save.equippedSkins && save.equippedSkins[charId];
    if (!sid || !save.unlockedSkins.includes(sid)) return null;
    return DATA.getSkinById(sid);
  }

  function getSkinAvatar(charDef, skinDef) {
    return (skinDef && skinDef.customAvatar) ? skinDef.customAvatar : charDef.avatar;
  }

  function getSkinFilter(skinDef) {
    return (skinDef && skinDef.filter && skinDef.filter !== 'none') ? skinDef.filter : '';
  }

  function getCharAnimSpec(charDef, skinDef) {
    if (skinDef && skinDef.customAnimSkin) {
      return { skin: skinDef.customAnimSkin, frames: skinDef.customAnimFrames || 4 };
    }
    return { skin: charDef.animSkin || 'yellow', frames: charDef.animFrames || 2 };
  }

  function getTotalBagChests() {
    const b = save.chestBag || {};
    return (b.wood || 0) + (b.silver || 0) + (b.gold || 0) + (b.diamond || 0);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // ===================== CHEST GACHA ENGINE (EXACT RATES + DUPLICATE PROTECTION + PITY!) =====================
  function pickSkinOrDupGold(rarity, pityTriggered) {
    const pool = DATA.SKINS.filter((s) => s.rarity === rarity);
    const unowned = pool.filter((s) => !save.unlockedSkins.includes(s.id));
    if (unowned.length > 0) {
      const picked = unowned[Math.floor(Math.random() * unowned.length)];
      save.unlockedSkins.push(picked.id);
      return { kind: 'skin', rarity, skin: picked, isDuplicate: false, pityTriggered };
    }
    // Duplicate skin protection -> grant transparent disclosed gold refund!
    const dupGold = (DATA.SKIN_RARITIES[rarity] && DATA.SKIN_RARITIES[rarity].dupGold) || 300;
    save.gold += dupGold;
    return { kind: 'dup_gold', rarity, amount: dupGold, isDuplicate: true, pityTriggered };
  }

  function rollChestReward(tierId) {
    const chest = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
    const pity = save.pity || (save.pity = { gold: 0, diamond: 0 });
    let result = null;

    // 1. Check Pity Guarantee FIRST!
    if (tierId === 'gold' && (pity.gold || 0) >= chest.pityTarget - 1) {
      // 10th Gold Chest -> Guaranteed Epic+ unowned skin!
      const unownedEpic = DATA.SKINS.filter((s) => s.rarity === 'epic' && !save.unlockedSkins.includes(s.id));
      const unownedLeg = DATA.SKINS.filter((s) => s.rarity === 'legendary' && !save.unlockedSkins.includes(s.id));
      let chosenRarity = 'epic';
      if (unownedLeg.length > 0 && (unownedEpic.length === 0 || Math.random() < 0.15)) {
        chosenRarity = 'legendary';
      } else if (unownedEpic.length === 0 && unownedLeg.length === 0) {
        chosenRarity = 'epic';
      }
      pity.gold = 0;
      result = pickSkinOrDupGold(chosenRarity, true);
    } else if (tierId === 'diamond' && (pity.diamond || 0) >= chest.pityTarget - 1) {
      // 15th Diamond Chest -> Guaranteed Legendary+ unowned skin!
      const unownedLeg = DATA.SKINS.filter((s) => s.rarity === 'legendary' && !save.unlockedSkins.includes(s.id));
      const unownedMyth = DATA.SKINS.filter((s) => s.rarity === 'mythic' && !save.unlockedSkins.includes(s.id));
      let chosenRarity = 'legendary';
      if (unownedMyth.length > 0 && (unownedLeg.length === 0 || Math.random() < 0.12)) {
        chosenRarity = 'mythic';
      } else if (unownedLeg.length === 0 && unownedMyth.length === 0) {
        chosenRarity = 'legendary';
      }
      pity.diamond = 0;
      result = pickSkinOrDupGold(chosenRarity, true);
    } else {
      // 2. Exact Weighted Probability Roll (uses totalWeight for safety; all chests sum to 100%)
      const order = ['gold', 'common', 'rare', 'epic', 'legendary', 'mythic', 'diamond'];
      const totalWeight = order.reduce((sum, k) => sum + (chest.rates[k] || 0), 0) || 100;
      const r = Math.random() * totalWeight;
      let acc = 0;
      let hit = 'gold';
      for (const k of order) {
        acc += chest.rates[k] || 0;
        if (r < acc) { hit = k; break; }
      }

      if (hit === 'gold') {
        const amt = randInt(chest.goldRange[0], chest.goldRange[1]);
        save.gold += amt;
        result = { kind: 'gold', amount: amt, rarity: null, pityTriggered: false };
      } else if (hit === 'diamond') {
        const amt = randInt(chest.gemRange[0], chest.gemRange[1]);
        save.gems += amt;
        result = { kind: 'diamond', amount: amt, rarity: null, pityTriggered: false };
      } else {
        result = pickSkinOrDupGold(hit, false);
      }

      // 3. Update Pity Counters
      if (tierId === 'gold') {
        const isEpicPlus = hit === 'epic' || hit === 'legendary' || hit === 'mythic';
        pity.gold = isEpicPlus ? 0 : (pity.gold || 0) + 1;
      } else if (tierId === 'diamond') {
        const isLegPlus = hit === 'legendary' || hit === 'mythic';
        pity.diamond = isLegPlus ? 0 : (pity.diamond || 0) + 1;
      }
    }

    persistSave();
    return { tierId, chest, ...result };
  }

  // ===================== 8-FRAME ANIMATED CHEST OPENING MODAL =====================
  let activeChestSession = null;

  function openChestModal(tierId) {
    const chest = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
    if (activeChestSession && activeChestSession.timers) {
      activeChestSession.timers.forEach((id) => clearTimeout(id));
    }
    activeChestSession = { tierId, opened: false, animating: false, reward: null, timers: [] };

    el.chestOpenStage.className = `chest-open-stage tier-${tierId}`;
    el.chestOpenTitle.textContent = chest.name;

    if (tierId === 'gold') {
      const rem = Math.max(1, chest.pityTarget - (save.pity.gold || 0));
      el.chestPityNote.textContent = rem === 1 ? '✨ 이번 상자 에픽 이상 스킨 확정!' : `에픽+ 천장까지 ${rem}회 남음 (${save.pity.gold || 0}/${chest.pityTarget})`;
      el.chestPityNote.classList.remove('hidden');
    } else if (tierId === 'diamond') {
      const rem = Math.max(1, chest.pityTarget - (save.pity.diamond || 0));
      el.chestPityNote.textContent = rem === 1 ? '✨ 이번 상자 전설 이상 스킨 확정!' : `전설+ 천장까지 ${rem}회 남음 (${save.pity.diamond || 0}/${chest.pityTarget})`;
      el.chestPityNote.classList.remove('hidden');
    } else {
      el.chestPityNote.classList.add('hidden');
    }

    el.chestAnimImg.src = `assets/chests/chest_${tierId}_0.png?v=${ASSET_VER}`;
    el.chestAnimImg.classList.remove('burst', 'shaking');
    el.chestTapHint.textContent = '상자를 터치해서 열기!';
    el.chestTapHint.classList.remove('hidden');
    el.chestRewardCard.classList.add('hidden');
    el.btnChestEquip.classList.add('hidden');
    el.chestOpenOverlay.classList.remove('hidden');
    SFX.click();
  }

  function triggerChestAnimation() {
    if (!activeChestSession || activeChestSession.animating || activeChestSession.opened) return;
    activeChestSession.animating = true;
    const tierId = activeChestSession.tierId;
    el.chestTapHint.classList.add('hidden');
    el.chestAnimImg.classList.add('shaking');

    // Roll reward right as opening starts so persistence is immediate and safe!
    const reward = rollChestReward(tierId);
    activeChestSession.reward = reward;

    // 8-frame sequence: anticipation wiggle (0->1->2->1->2) -> lid crack & burst (3->4->5->6->7)!
    const seq = [
      { f: 1, t: 0, sfx: 'shake' },
      { f: 2, t: 85, sfx: null },
      { f: 1, t: 170, sfx: 'shake' },
      { f: 2, t: 255, sfx: null },
      { f: 3, t: 360, sfx: 'shake' },
      { f: 4, t: 460, sfx: null },
      { f: 5, t: 550, sfx: 'open' },
      { f: 6, t: 645, sfx: null },
      { f: 7, t: 745, sfx: null }
    ];

    seq.forEach((step) => {
      const tid = setTimeout(() => {
        if (!activeChestSession) return;
        el.chestAnimImg.src = `assets/chests/chest_${tierId}_${step.f}.png?v=${ASSET_VER}`;
        if (step.sfx === 'shake') SFX.chestShake();
        if (step.sfx === 'open') {
          el.chestAnimImg.classList.remove('shaking');
          el.chestAnimImg.classList.add('burst');
          const isJackpot = reward.kind === 'diamond' || reward.rarity === 'epic' || reward.rarity === 'legendary' || reward.rarity === 'mythic';
          if (isJackpot) SFX.chestJackpot();
          else SFX.chestOpen();
        }
      }, step.t);
      activeChestSession.timers.push(tid);
    });

    const revealTid = setTimeout(() => {
      if (!activeChestSession) return;
      activeChestSession.animating = false;
      activeChestSession.opened = true;
      showChestRewardCard(reward);
      refreshAllMenus();
    }, 860);
    activeChestSession.timers.push(revealTid);
  }

  function showChestRewardCard(rw) {
    el.chestRewardPity.classList.toggle('hidden', !rw.pityTriggered);
    el.btnChestEquip.classList.add('hidden');
    el.btnChestEquip.onclick = null;

    if (rw.kind === 'gold') {
      el.chestRewardRarity.textContent = '🪙 골드 획득';
      el.chestRewardRarity.style.background = '#8f5900';
      el.chestRewardRarity.style.color = '#ffe866';
      el.chestRewardVisual.innerHTML = `<img src="assets/design/item_coin.png?v=20261121hd6" alt="골드" class="rw-big-ico" />`;
      el.chestRewardName.textContent = `+${rw.amount.toLocaleString('ko-KR')} G`;
      el.chestRewardSub.textContent = `${rw.chest.name}에서 골드를 획득했습니다!`;
    } else if (rw.kind === 'diamond') {
      el.chestRewardRarity.textContent = '💎 다이아 획득!';
      el.chestRewardRarity.style.background = '#10548c';
      el.chestRewardRarity.style.color = '#7ef6ff';
      el.chestRewardVisual.innerHTML = `<span class="rw-big-emoji">💎</span>`;
      el.chestRewardName.textContent = `+${rw.amount} 다이아`;
      el.chestRewardSub.textContent = `희귀 보석 재화 획득! 다이아 상자 · 전용 스킨에 사용하세요!`;
    } else if (rw.kind === 'skin') {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.common;
      const ownerChar = getCharDef(rw.skin.charId);
      el.chestRewardRarity.textContent = `✨ ${rar.name} 스킨 획득!`;
      el.chestRewardRarity.style.background = rar.bg;
      el.chestRewardRarity.style.color = rar.color;
      const skAv = getSkinAvatar(ownerChar, rw.skin);
      const skFlt = getSkinFilter(rw.skin);
      el.chestRewardVisual.innerHTML = `<img src="${skAv}" alt="${rw.skin.name}" class="rw-skin-preview" style="${skFlt ? `filter:${skFlt};` : ''}" />`;
      el.chestRewardName.textContent = rw.skin.name;
      el.chestRewardSub.textContent = rw.skin.desc || `${ownerChar.name} 전용 ${rar.name} 스킨 (신규 획득!)`;

      el.btnChestEquip.classList.remove('hidden');
      el.btnChestEquip.onclick = () => {
        save.equippedSkins[rw.skin.charId] = rw.skin.id;
        if (isCharUnlocked(rw.skin.charId)) {
          save.selectedChar = rw.skin.charId;
          previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === rw.skin.charId));
        }
        SFX.levelUp();
        persistSave();
        closeChestModal();
        refreshAllMenus();
        showToast(`✨ [${rw.skin.name}] 스킨 장착 완료!`);
      };
    } else if (rw.kind === 'dup_gold') {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.common;
      el.chestRewardRarity.textContent = `🔄 ${rar.name} 스킨 전체 보유 (중복 대체)`;
      el.chestRewardRarity.style.background = rar.bg;
      el.chestRewardRarity.style.color = rar.color;
      el.chestRewardVisual.innerHTML = `<img src="assets/design/item_coin.png?v=20261121hd6" alt="중복 골드" class="rw-big-ico" />`;
      el.chestRewardName.textContent = `+${rw.amount.toLocaleString('ko-KR')} G`;
      el.chestRewardSub.textContent = `해당 등급 스킨을 모두 보유해 중복 방지 골드로 지급되었습니다!`;
    }

    // Update live pity badge after roll
    if (rw.tierId === 'gold') {
      const rem = DATA.CHESTS.gold.pityTarget - (save.pity.gold || 0);
      el.chestPityNote.textContent = `다음 황금 상자 에픽+ 천장까지 ${rem}회 (${save.pity.gold || 0}/${DATA.CHESTS.gold.pityTarget})`;
    } else if (rw.tierId === 'diamond') {
      const rem = DATA.CHESTS.diamond.pityTarget - (save.pity.diamond || 0);
      el.chestPityNote.textContent = `다음 다이아 상자 전설+ 천장까지 ${rem}회 (${save.pity.diamond || 0}/${DATA.CHESTS.diamond.pityTarget})`;
    }

    el.chestRewardCard.classList.remove('hidden');
    el.chestOpenStage.classList.add('revealed');
  }

  function closeChestModal() {
    if (activeChestSession && activeChestSession.animating) return;
    if (activeChestSession && activeChestSession.timers) {
      activeChestSession.timers.forEach((id) => clearTimeout(id));
    }
    activeChestSession = null;
    el.chestOpenOverlay.classList.add('hidden');
    refreshAllMenus();
  }

  function openProbModal() {
    SFX.click();
    const gPity = save.pity.gold || 0;
    const dPity = save.pity.diamond || 0;
    el.probModalBody.innerHTML = `
      <div class="prob-section">
        <h4>📊 상자별 보상 확률 (합계 100%)</h4>
        <table class="prob-table">
          <thead>
            <tr><th>보상</th><th>🪵 나무</th><th>🥈 은</th><th>👑 황금</th><th>💎 다이아</th></tr>
          </thead>
          <tbody>
            <tr><td>🪙 골드</td><td>75%</td><td>65%</td><td>50%</td><td>25%</td></tr>
            <tr><td style="color:#a3c8eb">일반 스킨</td><td>18%</td><td>15%</td><td>-</td><td>-</td></tr>
            <tr><td style="color:#47c8ff">희귀 스킨</td><td>5%</td><td>15%</td><td>25%</td><td>10%</td></tr>
            <tr><td style="color:#d084ff">에픽 스킨</td><td>1.5%</td><td>3%</td><td>17%</td><td>30%</td></tr>
            <tr><td style="color:#ffca42">전설 스킨</td><td>-</td><td>-</td><td>3%</td><td>22%</td></tr>
            <tr><td style="color:#ff5ea8">신화 스킨</td><td>-</td><td>-</td><td>-</td><td>3%</td></tr>
            <tr><td style="color:#7ef6ff">💎 다이아</td><td>0.5%</td><td>2%</td><td>5%</td><td>10%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="prob-section">
        <h4>💰 골드 · 💎 다이아 지급 범위</h4>
        <table class="prob-table">
          <thead><tr><th>상자</th><th>골드 획득 시</th><th>다이아 획득 시</th><th>획득 경로</th></tr></thead>
          <tbody>
            <tr><td>🪵 나무</td><td>100 ~ 250G</td><td>1 ~ 2💎</td><td>일반 주행(400m+) · 출석</td></tr>
            <tr><td>🥈 은</td><td>250 ~ 500G</td><td>2 ~ 4💎</td><td>연속 출석 · 업적 · 상점</td></tr>
            <tr><td>👑 황금</td><td>500 ~ 1,000G</td><td>5 ~ 10💎</td><td>일일 퀘스트 · 업적 · 상점</td></tr>
            <tr><td>💎 다이아</td><td>1,000 ~ 2,000G</td><td>10 ~ 20💎</td><td>주간 퀘스트 · 고난도 업적 · 7일 출석</td></tr>
          </tbody>
        </table>
      </div>
      <div class="prob-section">
        <h4>🛡️ 중복 방지 &amp; 천장 시스템 (현재 진행도)</h4>
        <ul class="prob-rules">
          <li><strong>미보유 스킨 우선 지급:</strong> 해당 등급에 미보유 스킨이 있으면 100% 새 스킨이 나옵니다.</li>
          <li><strong>등급 완료 시 대체 골드:</strong> 일반 120G · 희귀 300G · 에픽 650G · 전설 1,200G · 신화 2,500G</li>
          <li><strong>👑 황금 상자 천장 (10회):</strong> 에픽 이상 스킨 미획득 시 10회차 확정! (현재 <strong>${gPity} / 10회</strong> · 남은 ${10 - gPity}회)</li>
          <li><strong>💎 다이아 상자 천장 (15회):</strong> 전설 이상 스킨 미획득 시 15회차 확정! (현재 <strong>${dPity} / 15회</strong> · 남은 ${15 - dPity}회)</li>
        </ul>
      </div>
    `;
    el.probOverlay.classList.remove('hidden');
  }

  function canClaimAttendanceToday() {
    return !save.attendance || save.attendance.lastClaimDate !== getTodayKey();
  }

  function getNextAttendanceDayIndex() {
    const streak = (save.attendance && save.attendance.streak) || 0;
    if (canClaimAttendanceToday()) {
      return streak % DATA.ATTENDANCE_REWARDS.length;
    }
    return Math.max(0, (streak - 1) % DATA.ATTENDANCE_REWARDS.length);
  }

  let toastTimer = null;
  function showToast(msg) {
    el.globalToast.textContent = msg;
    el.globalToast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.globalToast.classList.add('hidden'), 2200);
  }

  let bannerTimer = null;
  function showRunBanner(msg, ms = 2200) {
    el.runBanner.textContent = msg;
    el.runBanner.classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.runBanner.classList.add('hidden'), ms);
  }

  // ===================== HOME / MISSIONS / ATTENDANCE / CHARS / SHOP UI RENDER =====================
  function refreshAllMenus() {
    ensureTodayMissions();
    el.uiGold.textContent = save.gold.toLocaleString('ko-KR');
    el.uiGems.textContent = (save.gems || 0).toLocaleString('ko-KR');
    el.headerBestScore.textContent = save.bestScore.toLocaleString('ko-KR');

    renderAttendanceUI();
    renderAchievementsUI();
    renderSettingsUI();
    renderHomeCharStage();
    renderBrawlQuests();
    renderCharList();
    renderShopList();
    renderRankingTab();
    updateNavMissionDot();
    if (detailCharIdx !== null) renderCharDetailModal();
  }

  function updateNavMissionDot() {
    ensureTodayMissions();
    const dProg = save.dailyMissions.progress || {};
    const dClaimed = save.dailyMissions.claimed || {};
    const wProg = save.weeklyMissions.progress || {};
    const wClaimed = save.weeklyMissions.claimed || {};
    const hasDaily = DATA.DAILY_MISSIONS.some((m) => (dProg[m.metric] || 0) >= m.target && !dClaimed[m.id]);
    const hasWeekly = DATA.WEEKLY_MISSIONS.some((m) => (wProg[m.metric] || 0) >= m.target && !wClaimed[m.id]);
    const hasAch = DATA.ACHIEVEMENTS.some((a) => getAchievementMetricValue(a.metric) >= a.target && !(save.achievementsClaimed && save.achievementsClaimed[a.id]));
    const hasAtt = canClaimAttendanceToday();
    const bagCnt = getTotalBagChests();
    el.navMissionDot.classList.toggle('hidden', !(hasDaily || hasWeekly || hasAch || hasAtt || bagCnt > 0));
    if (el.questVaultBadge) {
      el.questVaultBadge.textContent = String(bagCnt);
      el.questVaultBadge.classList.toggle('hidden', bagCnt === 0);
    }
  }

  const RANK_RIVALS = [
    { name: '노르웨이신봉자', charId: 'umbrella_master', score: 24500, dist: 2850, year: 4 },
    { name: '태풍뚫는얼죽아', charId: 'iced_americano', score: 17800, dist: 2120, year: 3 },
    { name: '한파패딩대장', charId: 'long_padding', score: 12400, dist: 1580, year: 3 },
    { name: '풍류반팔충', charId: 'short_sleeve', score: 8600, dist: 1120, year: 2 },
    { name: '산타코인부자', charId: 'fashionista', score: 5400, dist: 760, year: 2 },
    { name: '구라청저격수', charId: 'long_padding', score: 3100, dist: 480, year: 1 },
    { name: '장마침수서퍼', charId: 'umbrella_master', score: 1650, dist: 290, year: 1 },
    { name: '우산뒤집힌민수', charId: 'umbrella_master', score: 750, dist: 140, year: 1 }
  ];

  function renderRankingTab() {
    const myChar = getCharDef(save.selectedChar);
    const myEntry = {
      name: `나 (${myChar.name})`,
      charId: myChar.id,
      score: save.bestScore || 0,
      dist: save.bestDistanceM || 0,
      year: save.bestYear || 1,
      isMe: true
    };
    const board = [...RANK_RIVALS, myEntry].sort((a, b) => b.score - a.score);
    const myIdx = board.findIndex((r) => r.isMe);
    const myRankNum = myIdx + 1;

    const mySkin = getEquippedSkin(myChar.id);
    el.rankMyAvatar.src = getSkinAvatar(myChar, mySkin);
    el.rankMyAvatar.style.filter = getSkinFilter(mySkin);
    el.rankMyPos.textContent = `${myRankNum}위`;
    el.rankMyScoreLine.textContent = `최고 점수 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · 최장 거리 ${(save.bestDistanceM || 0).toLocaleString('ko-KR')}m`;
    el.rankStatYear.textContent = `${save.bestYear || 1}년 차`;
    el.rankStatCoins.textContent = `${(save.totalCoinsEver || 0).toLocaleString('ko-KR')}개`;
    el.rankStatCombo.textContent = `${save.maxDodgeComboEver || 0}연속`;
    el.rankStatDex.textContent = `${save.unlockedChars.length}/${DATA.CHARACTERS.length}`;

    el.rankBoardList.innerHTML = '';
    board.forEach((entry, idx) => {
      const rank = idx + 1;
      const chDef = getCharDef(entry.charId);
      const row = document.createElement('div');
      const topClass = rank === 1 ? ' top1' : (rank === 2 ? ' top2' : (rank === 3 ? ' top3' : ''));
      const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `${rank}`));
      row.className = `rank-row${topClass}${entry.isMe ? ' me' : ''}`;
      row.innerHTML = `
        <div class="rank-medal">${medal}</div>
        <img src="${chDef.avatar}" alt="" class="rank-row-avatar" />
        <div class="rank-row-info">
          <div class="rank-row-name">${entry.name}${entry.isMe ? ' <span class="item-badge equipped">ME</span>' : ''}</div>
          <div class="rank-row-sub">${entry.year}년 차 · ${entry.dist.toLocaleString('ko-KR')}m</div>
        </div>
        <div class="rank-row-score">${entry.score.toLocaleString('ko-KR')}점</div>
      `;
      el.rankBoardList.appendChild(row);
    });
  }

  function getAchievementMetricValue(metric) {
    if (metric === 'bestDistanceM') return save.bestDistanceM || 0;
    if (metric === 'totalCoinsEver') return save.totalCoinsEver || 0;
    if (metric === 'bestYear') return save.bestYear || 1;
    if (metric === 'maxDodgeComboEver') return save.maxDodgeComboEver || 0;
    if (metric === 'unlockedCount') return save.unlockedChars.length;
    return 0;
  }

  function renderAchievementsUI() {
    let unlockedCount = 0;
    let claimableCount = 0;
    if (el.achList) el.achList.innerHTML = '';

    DATA.ACHIEVEMENTS.forEach((ach) => {
      const val = getAchievementMetricValue(ach.metric);
      const isDone = val >= ach.target;
      const isClaimed = Boolean(save.achievementsClaimed && save.achievementsClaimed[ach.id]);
      if (isDone) unlockedCount += 1;
      if (isDone && !isClaimed) claimableCount += 1;

      if (!el.achList) return;
      const pct = Math.min(100, (val / ach.target) * 100);
      const chest = DATA.CHESTS[ach.rewardChest] || DATA.CHESTS.silver;

      const card = document.createElement('div');
      card.className = `ach-card${isClaimed ? ' claimed' : (isDone ? ' ready' : '')}`;
      card.innerHTML = `
        <div class="ach-ico">${ach.icon}</div>
        <div class="ach-meta">
          <div class="ach-title">${ach.title}</div>
          <div class="ach-desc">${ach.desc} (${Math.min(val, ach.target).toLocaleString('ko-KR')} / ${ach.target.toLocaleString('ko-KR')})</div>
          <div class="ach-prog-track"><div class="ach-prog-fill" style="width: ${pct.toFixed(1)}%"></div></div>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (isClaimed) {
        btn.className = 'mission-claim-btn done';
        btn.textContent = '수령 ✓';
        btn.disabled = true;
      } else if (isDone) {
        btn.className = 'mission-claim-btn ready';
        btn.textContent = `${chest.name} 열기`;
        btn.onclick = () => {
          save.achievementsClaimed[ach.id] = true;
          persistSave();
          el.achievementsOverlay.classList.add('hidden');
          refreshAllMenus();
          openChestModal(ach.rewardChest);
        };
      } else {
        btn.className = 'mission-claim-btn pending';
        btn.textContent = chest.name;
        btn.disabled = true;
      }
      card.appendChild(btn);
      el.achList.appendChild(card);
    });

    if (el.achModalSummary) {
      el.achModalSummary.textContent = `달성 현황: ${unlockedCount} / ${DATA.ACHIEVEMENTS.length} (미수령 ${claimableCount}개)`;
    }
  }

  function renderSettingsUI() {
    const st = SFX.getSettings();

    el.chkBgmOn.classList.toggle('on', st.bgmOn);
    el.chkBgmOn.textContent = st.bgmOn ? 'ON' : 'OFF';
    const bgmPct = Math.round(st.bgmVol * 100);
    el.rngBgmVol.value = String(bgmPct);
    el.lblBgmVol.textContent = `${bgmPct}%`;

    el.chkSfxOn.classList.toggle('on', st.sfxOn);
    el.chkSfxOn.textContent = st.sfxOn ? 'ON' : 'OFF';
    const sfxPct = Math.round(st.sfxVol * 100);
    el.rngSfxVol.value = String(sfxPct);
    el.lblSfxVol.textContent = `${sfxPct}%`;

    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    el.btnToggleFullscreen.textContent = isFs ? '📱 전체화면 종료' : '📱 가로 전체화면 전환';
  }

  async function toggleLandscapeFullscreen() {
    SFX.click();
    const docEl = document.documentElement;
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    try {
      if (isFs) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        if (screen.orientation && screen.orientation.unlock) {
          try { screen.orientation.unlock(); } catch {}
        }
        showToast('전체화면이 해제되었습니다.');
      } else {
        if (docEl.requestFullscreen) await docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          try { await screen.orientation.lock('landscape'); } catch {}
        }
        showToast('📱 가로 전체화면 모드! 폰을 가로로 돌려 쾌적하게 즐기세요!');
      }
    } catch {
      showToast('📱 스마트폰을 가로로 돌리면 자동으로 가로 플레이 모드로 전환됩니다!');
    }
    setTimeout(renderSettingsUI, 150);
  }

  function renderAttendanceUI() {
    const claimable = canClaimAttendanceToday();
    const dayIdx = getNextAttendanceDayIndex();

    el.attDaysGrid.innerHTML = '';
    const claimedDays = claimable ? dayIdx : dayIdx + 1;
    DATA.ATTENDANCE_REWARDS.forEach((rw, idx) => {
      const cell = document.createElement('div');
      const isClaimed = idx < claimedDays;
      const isToday = claimable && idx === dayIdx;
      const chest = rw.chest ? DATA.CHESTS[rw.chest] : null;
      cell.className = `att-day-cell${idx === 6 ? ' day7' : ''}${isClaimed ? ' claimed' : ''}${isToday ? ' today' : ''}`;
      const icoHtml = isClaimed
        ? '<span class="att-day-ico">✅</span>'
        : (chest
          ? `<img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="att-chest-thumb" />`
          : '<span class="att-day-ico">🪙</span>');
      cell.innerHTML = `
        <span class="att-day-num">${rw.day}일차</span>
        ${icoHtml}
        <span class="att-day-val">${rw.label}</span>
      `;
      el.attDaysGrid.appendChild(cell);
    });

    if (claimable) {
      const rw = DATA.ATTENDANCE_REWARDS[dayIdx];
      el.attModalDesc.textContent = `오늘(${rw.day}일차) 출석 보상: ${rw.label}`;
      el.btnClaimAttendance.disabled = false;
      el.btnClaimAttendance.textContent = `🎁 ${rw.day}일차 출석 상자 열기!`;
    } else {
      el.attModalDesc.textContent = '오늘 출석 보상을 이미 받았습니다! 내일 또 방문해 주세요.';
      el.btnClaimAttendance.disabled = true;
      el.btnClaimAttendance.textContent = '✅ 오늘 출석 완료';
    }
  }

  function claimAttendanceToday() {
    if (!canClaimAttendanceToday()) return;
    const dayIdx = getNextAttendanceDayIndex();
    const rw = DATA.ATTENDANCE_REWARDS[dayIdx];
    if (rw.gold) save.gold += rw.gold;
    if (rw.gems) save.gems = (save.gems || 0) + rw.gems;
    if (rw.booster) {
      save.boosters[rw.booster] = (save.boosters[rw.booster] || 0) + 1;
    }
    save.attendance = {
      lastClaimDate: getTodayKey(),
      streak: ((save.attendance && save.attendance.streak) || 0) + 1
    };
    SFX.reward();
    persistSave();
    el.attendanceOverlay.classList.add('hidden');
    refreshAllMenus();
    if (rw.chest) {
      openChestModal(rw.chest);
    } else {
      showToast(`🎁 ${rw.day}일차 출석 보상 수령! (${rw.label})`);
    }
  }

  function renderBrawlQuests() {
    ensureTodayMissions();
    document.querySelectorAll('.bs-qtab').forEach((b) => {
      b.classList.toggle('active', b.dataset.qtab === currentQuestSubtab);
    });

    const gPity = save.pity.gold || 0;
    const dPity = save.pity.diamond || 0;
    if (el.pityGoldChip) el.pityGoldChip.textContent = `👑 황금 천장 ${gPity}/10`;
    if (el.pityDiamondChip) el.pityDiamondChip.textContent = `💎 다이아 천장 ${dPity}/15`;

    const grid = el.bsQuestGrid;
    if (!grid) return;
    grid.innerHTML = '';

    if (currentQuestSubtab === 'daily') {
      if (el.questResetLabel) el.questResetLabel.textContent = '⏱️ 일일 퀘스트 · 매일 초기화 · 완료 시 황금 상자!';
      const prog = save.dailyMissions.progress || {};
      const claimed = save.dailyMissions.claimed || {};
      DATA.DAILY_MISSIONS.forEach((m) => {
        const cur = Math.min(m.target, Math.floor(prog[m.metric] || 0));
        const pct = Math.min(100, (cur / m.target) * 100);
        const isDone = cur >= m.target;
        const isClaimed = Boolean(claimed[m.id]);
        const chest = DATA.CHESTS[m.rewardChest] || DATA.CHESTS.gold;
        grid.appendChild(createBrawlQuestCard({
          tierClass: 'tier-daily',
          tag: '일일 퀘스트',
          icon: m.icon,
          title: m.title,
          progText: `${cur.toLocaleString('ko-KR')} / ${m.target.toLocaleString('ko-KR')}${m.unit}`,
          pct,
          chest,
          isDone,
          isClaimed,
          onClaim: () => {
            save.dailyMissions.claimed[m.id] = true;
            persistSave();
            refreshAllMenus();
            openChestModal(m.rewardChest);
          }
        }));
      });
    } else if (currentQuestSubtab === 'weekly') {
      if (el.questResetLabel) el.questResetLabel.textContent = '⏱️ 주간 퀘스트 · 매주 월요일 초기화 · 완료 시 다이아 상자!';
      const prog = save.weeklyMissions.progress || {};
      const claimed = save.weeklyMissions.claimed || {};
      DATA.WEEKLY_MISSIONS.forEach((m) => {
        const cur = Math.min(m.target, Math.floor(prog[m.metric] || 0));
        const pct = Math.min(100, (cur / m.target) * 100);
        const isDone = cur >= m.target;
        const isClaimed = Boolean(claimed[m.id]);
        const chest = DATA.CHESTS[m.rewardChest] || DATA.CHESTS.diamond;
        grid.appendChild(createBrawlQuestCard({
          tierClass: 'tier-weekly',
          tag: '주간 퀘스트',
          icon: m.icon,
          title: m.title,
          progText: `${cur.toLocaleString('ko-KR')} / ${m.target.toLocaleString('ko-KR')}${m.unit}`,
          pct,
          chest,
          isDone,
          isClaimed,
          onClaim: () => {
            save.weeklyMissions.claimed[m.id] = true;
            persistSave();
            refreshAllMenus();
            openChestModal(m.rewardChest);
          }
        }));
      });
    } else if (currentQuestSubtab === 'ach') {
      if (el.questResetLabel) el.questResetLabel.textContent = '🏅 영구 업적 · 달성 시 은 / 황금 / 다이아 상자 지급!';
      DATA.ACHIEVEMENTS.forEach((a) => {
        const cur = Math.min(a.target, getAchievementMetricValue(a.metric));
        const pct = Math.min(100, (cur / a.target) * 100);
        const isDone = cur >= a.target;
        const isClaimed = Boolean(save.achievementsClaimed && save.achievementsClaimed[a.id]);
        const chest = DATA.CHESTS[a.rewardChest] || DATA.CHESTS.silver;
        grid.appendChild(createBrawlQuestCard({
          tierClass: `tier-ach chest-${a.rewardChest}`,
          tag: '영구 업적',
          icon: a.icon,
          title: `${a.title} · ${a.desc}`,
          progText: `${cur.toLocaleString('ko-KR')} / ${a.target.toLocaleString('ko-KR')}`,
          pct,
          chest,
          isDone,
          isClaimed,
          onClaim: () => {
            save.achievementsClaimed[a.id] = true;
            persistSave();
            refreshAllMenus();
            openChestModal(a.rewardChest);
          }
        }));
      });
    } else {
      const dropsToday = (save.dailyWoodChestDrops && save.dailyWoodChestDrops.count) || 0;
      if (el.questResetLabel) el.questResetLabel.textContent = `🎁 보관함 · 오늘 일반 주행(400m+) 나무 상자 드랍 ${dropsToday}/3회`;
      DATA.CHEST_ORDER.forEach((tierId) => {
        const chest = DATA.CHESTS[tierId];
        const qty = (save.chestBag && save.chestBag[tierId]) || 0;
        const pityLine = tierId === 'gold'
          ? `에픽+ 천장 ${save.pity.gold || 0}/10회`
          : (tierId === 'diamond' ? `전설+ 천장 ${save.pity.diamond || 0}/15회` : `골드 ${chest.goldRange[0]}~${chest.goldRange[1]}G · 💎${chest.gemRange[0]}~${chest.gemRange[1]}`);

        const card = document.createElement('div');
        card.className = `bs-quest-card bs-vault-card tier-${tierId}${qty > 0 ? ' ready' : ''}`;
        card.innerHTML = `
          <div class="bs-vault-left">
            <img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="bs-vault-chest-img" />
            <span class="bs-vault-qty">×${qty}</span>
          </div>
          <div class="bs-qcard-main">
            <div class="bs-qcard-top">
              <span class="bs-qtag">${chest.name}</span>
              <span class="bs-qsub">${pityLine}</span>
            </div>
            <div class="bs-vault-src">${chest.source}</div>
          </div>
        `;
        const btn = document.createElement('button');
        btn.type = 'button';
        if (qty > 0) {
          btn.className = 'bs-vault-open-btn ready';
          btn.textContent = '열기!';
          btn.onclick = () => {
            if ((save.chestBag[tierId] || 0) <= 0) return;
            save.chestBag[tierId] -= 1;
            persistSave();
            refreshAllMenus();
            openChestModal(tierId);
          };
        } else {
          btn.className = 'bs-vault-open-btn empty';
          btn.textContent = '상점';
          btn.onclick = () => {
            currentShopSubtab = 'chests';
            switchTab('shop');
          };
        }
        card.appendChild(btn);
        grid.appendChild(card);
      });
    }
  }

  function createBrawlQuestCard({ tierClass, tag, icon, title, progText, pct, chest, isDone, isClaimed, onClaim }) {
    const card = document.createElement('div');
    card.className = `bs-quest-card ${tierClass}${isClaimed ? ' claimed' : (isDone ? ' ready' : '')}`;
    card.innerHTML = `
      <div class="bs-qcard-main">
        <div class="bs-qcard-top">
          <span class="bs-qtag">${tag}</span>
          <span class="bs-qprog-num">${progText}</span>
        </div>
        <div class="bs-qcard-title"><span class="bs-qico">${icon}</span><span>${title}</span></div>
        <div class="bs-qbar-track">
          <div class="bs-qbar-fill" style="width: ${pct.toFixed(1)}%"></div>
        </div>
      </div>
    `;

    const rwBtn = document.createElement('button');
    rwBtn.type = 'button';
    rwBtn.className = `bs-qreward-tile tier-${chest.id}${isClaimed ? ' done' : (isDone ? ' ready' : ' locked')}`;
    rwBtn.innerHTML = `
      <img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="bs-qchest-img" />
      <span class="bs-qchest-lbl">${isClaimed ? '완료 ✓' : (isDone ? '열기!' : chest.name)}</span>
    `;
    if (isDone && !isClaimed) {
      rwBtn.onclick = onClaim;
    } else {
      rwBtn.disabled = true;
    }

    card.appendChild(rwBtn);
    return card;
  }

  function renderHomeCharStage() {
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);
    const stats = getCharStats(ch);
    const skin = getEquippedSkin(ch.id);
    const anim = getCharAnimSpec(ch, skin);
    const tierCls = `tier-${ch.auraType || 'basic'}`;

    el.homeHeroStage.className = `bs-home-stage ${tierCls}${unlocked ? '' : ' locked'}`;
    lastHomeHeroSrc = '';
    el.homeHeroImg.src = `assets/chars/${anim.skin}_run_0.png?v=${ASSET_VER}`;
    el.homeHeroImg.alt = skin ? `${ch.name} (${skin.name})` : ch.name;
    el.homeHeroImg.style.filter = getSkinFilter(skin);
    el.homeHeroImg.style.setProperty('--skin-glow', skin ? skin.glow : '');
    el.homeCharLvBadge.textContent = unlocked ? `POWER ${stats.level}` : '잠금';
    el.homeCharTier.textContent = unlocked
      ? (skin ? `✨ ${skin.name}` : ch.tier)
      : `🔒 ${ch.price.toLocaleString('ko-KR')}G`;
    el.homeCharName.textContent = ch.name;

    // Brawl Stars Bottom-Left Character Switcher Badge
    el.homeBrawlerMini.src = getSkinAvatar(ch, skin);
    el.homeBrawlerMini.style.filter = getSkinFilter(skin);
    el.homeBrawlerCount.textContent = `${save.unlockedChars.length} / ${DATA.CHARACTERS.length}`;

    if (unlocked) {
      el.btnPlayStart.disabled = false;
      el.btnPlayLabel.textContent = '플레이';
      el.btnPlaySub.textContent = `${ch.name} Lv.${stats.level}`;
    } else {
      el.btnPlayStart.disabled = save.gold < ch.price;
      el.btnPlayLabel.textContent = `${ch.price.toLocaleString('ko-KR')}G 해금`;
      el.btnPlaySub.textContent = `${ch.name} 구매 후 플레이`;
    }
  }

  function updateHomeRunningHero(t) {
    if (currentTab !== 'home') return;
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const skin = getEquippedSkin(ch.id);
    const anim = getCharAnimSpec(ch, skin);
    const fps = anim.frames >= 3 ? 9.5 : 7.5;
    const frame = Math.floor(t * fps) % anim.frames;
    const src = `assets/chars/${anim.skin}_run_${frame}.png?v=${ASSET_VER}`;
    if (src !== lastHomeHeroSrc) {
      lastHomeHeroSrc = src;
      el.homeHeroImg.src = src;
    }
  }

  function levelUpCharacter(ch) {
    if (!isCharUnlocked(ch.id)) return;
    const curLv = getCharLevel(ch.id);
    if (curLv >= DATA.MAX_CHAR_LEVEL) return;
    const price = DATA.getCharLevelPrice(curLv);
    if (save.gold < price) {
      showToast(`골드가 부족합니다! (필요: ${price}G)`);
      return;
    }
    save.gold -= price;
    const nextLv = curLv + 1;
    save.charLevels[ch.id] = nextLv;
    SFX.levelUp();
    persistSave();
    refreshAllMenus();
    const gotHeart = (nextLv === 3 || nextLv === 5) ? ' · 최대 하트 +1!' : '';
    showToast(`⬆️ ${ch.name} Lv.${nextLv} 성장 완료! (골드/점수 +5%${gotHeart})`);
  }

  function openCharDetail(idx) {
    SFX.click();
    detailCharIdx = ((idx % DATA.CHARACTERS.length) + DATA.CHARACTERS.length) % DATA.CHARACTERS.length;
    renderCharDetailModal();
    el.charDetailOverlay.classList.remove('hidden');
  }

  function closeCharDetail() {
    SFX.click();
    detailCharIdx = null;
    el.charDetailOverlay.classList.add('hidden');
  }

  function renderCharDetailModal() {
    if (detailCharIdx === null) return;
    const ch = DATA.CHARACTERS[detailCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);
    const selected = save.selectedChar === ch.id;
    const stats = getCharStats(ch);
    const equippedSkin = getEquippedSkin(ch.id);
    const isMaxLv = stats.level >= DATA.MAX_CHAR_LEVEL;
    const lvPrice = DATA.getCharLevelPrice(stats.level);
    const tierCls = `tier-${ch.auraType || 'basic'}`;

    el.detailHeroStage.className = `brawl-hero-stage ${tierCls}`;
    el.detailCharTier.textContent = equippedSkin ? `✨ ${equippedSkin.name}` : ch.tier;
    el.detailCharName.textContent = ch.name;
    el.detailCharLv.textContent = unlocked
      ? `POWER Lv.${stats.level} / ${DATA.MAX_CHAR_LEVEL}`
      : `🔒 ${ch.price.toLocaleString('ko-KR')}G 필요`;
    el.detailEquippedPill.classList.toggle('hidden', !selected);
    el.detailCharImg.src = getSkinAvatar(ch, equippedSkin);
    el.detailCharImg.style.filter = getSkinFilter(equippedSkin);
    el.detailCharDesc.textContent = (equippedSkin && equippedSkin.desc) ? `${ch.desc} (${equippedSkin.desc})` : ch.desc;

    el.detailStatHp.textContent = `${stats.maxHp}칸`;
    el.detailFillHp.style.width = `${Math.min(100, Math.round((stats.maxHp / 12) * 100))}%`;
    el.detailStatGold.textContent = `${Math.round(stats.goldMult * 100)}%`;
    el.detailFillGold.style.width = `${Math.min(100, Math.round(((stats.goldMult - 0.7) / 1.0) * 100))}%`;
    el.detailStatScore.textContent = `${Math.round(stats.scoreMult * 100)}%`;
    el.detailFillScore.style.width = `${Math.min(100, Math.round(((stats.scoreMult - 0.7) / 1.0) * 100))}%`;

    el.detailPassiveIco.textContent = ch.icon || '★';
    el.detailPassiveName.textContent = ch.passiveName;
    el.detailPassiveDesc.textContent = ch.passiveDesc;

    // Render Character Skins Row (Default + Character-specific collectible skins)
    if (el.detailSkinsRow) {
      el.detailSkinsRow.innerHTML = '';
      const defChip = document.createElement('button');
      defChip.type = 'button';
      defChip.className = `skin-chip${!equippedSkin ? ' active' : ''}`;
      defChip.innerHTML = `<span class="skin-dot" style="background:#9eb8d8"></span><span>기본</span>`;
      defChip.onclick = () => {
        SFX.click();
        delete save.equippedSkins[ch.id];
        persistSave();
        refreshAllMenus();
        showToast(`${ch.name} 기본 외형으로 변경!`);
      };
      el.detailSkinsRow.appendChild(defChip);

      DATA.getSkinsForChar(ch.id).forEach((sk) => {
        const owned = save.unlockedSkins.includes(sk.id);
        const isEq = equippedSkin && equippedSkin.id === sk.id;
        const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.common;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `skin-chip rar-${sk.rarity}${isEq ? ' active' : ''}${owned ? '' : ' locked'}`;
        chip.innerHTML = `
          <span class="skin-dot" style="background:${sk.glow || rar.color}"></span>
          <span>${sk.name}</span>
          <span class="skin-rar-mini" style="color:${rar.color}">${owned ? (isEq ? '✓' : rar.name) : (sk.gemPrice ? `💎${sk.gemPrice}` : '🔒')}</span>
        `;
        chip.onclick = () => {
          if (owned) {
            SFX.click();
            save.equippedSkins[ch.id] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`✨ [${sk.name}] 스킨 장착 완료!`);
          } else if (sk.gemPrice) {
            SFX.click();
            closeCharDetail();
            currentShopSubtab = 'skins';
            switchTab('shop');
            showToast(`💎 상점 스킨 탭에서 ${sk.gemPrice} 다이아로 구매할 수 있습니다!`);
          } else {
            showToast(`🎁 [${sk.name}] (${rar.name}) 스킨은 상자 열기로 획득할 수 있습니다!`);
          }
        };
        el.detailSkinsRow.appendChild(chip);
      });
    }

    if (unlocked) {
      if (isMaxLv) {
        el.btnDetailSub.className = 'item-action-btn done';
        el.btnDetailSub.textContent = '레벨 MAX';
        el.btnDetailSub.disabled = true;
        el.btnDetailSub.onclick = null;
      } else {
        el.btnDetailSub.className = 'item-action-btn purple';
        el.btnDetailSub.textContent = `⬆️ Lv.${stats.level + 1} (${lvPrice}G)`;
        el.btnDetailSub.disabled = save.gold < lvPrice;
        el.btnDetailSub.onclick = () => levelUpCharacter(ch);
      }

      if (selected) {
        el.btnDetailMain.className = 'item-action-btn done brawl-main-cta';
        el.btnDetailMain.textContent = '✓ 현재 장착 중';
        el.btnDetailMain.disabled = true;
        el.btnDetailMain.onclick = null;
      } else {
        el.btnDetailMain.className = 'cr-gold-btn brawl-main-cta';
        el.btnDetailMain.textContent = '▶ 선택하기';
        el.btnDetailMain.disabled = false;
        el.btnDetailMain.onclick = () => {
          SFX.click();
          save.selectedChar = ch.id;
          previewCharIdx = detailCharIdx;
          persistSave();
          refreshAllMenus();
          showToast(`${ch.name} 캐릭터를 장착했습니다!`);
        };
      }
    } else {
      el.btnDetailSub.className = 'item-action-btn ghost';
      el.btnDetailSub.textContent = '🏠 홈에서 선택';
      el.btnDetailSub.disabled = false;
      el.btnDetailSub.onclick = () => {
        SFX.click();
        previewCharIdx = detailCharIdx;
        closeCharDetail();
        switchTab('home');
      };

      el.btnDetailMain.className = 'cr-gold-btn brawl-main-cta';
      el.btnDetailMain.textContent = `🔓 ${ch.price.toLocaleString('ko-KR')}G 해금`;
      el.btnDetailMain.disabled = save.gold < ch.price;
      el.btnDetailMain.onclick = () => buyCharacter(ch, detailCharIdx);
    }
  }

  function renderCharList() {
    const ownedCount = save.unlockedChars.length;
    const totalCount = DATA.CHARACTERS.length;
    const ratePct = Math.round((ownedCount / totalCount) * 100);
    const dexBonusPct = Math.max(0, ownedCount - 1) * 3;
    el.dexRateText.textContent = `${ownedCount} / ${totalCount} (${ratePct}%)`;
    el.dexBarFill.style.width = `${ratePct}%`;
    el.dexBonusText.textContent = `현재 도감 효과: 전체 점수 +${dexBonusPct}% (캐릭터 추가 해금당 +3%) · 보유 스킨 ${save.unlockedSkins.length}/${DATA.SKINS.length}`;

    el.charList.innerHTML = '';
    DATA.CHARACTERS.forEach((ch, idx) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;
      const stats = getCharStats(ch);
      const eqSkin = getEquippedSkin(ch.id);
      const tierCls = `tier-${ch.auraType || 'basic'}`;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `brawl-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.setAttribute('aria-label', `${ch.name} 능력치 상세 보기`);
      card.innerHTML = `
        <div class="brawl-card-stage ${tierCls}">
          <span class="brawl-lv-chip">${unlocked ? `Lv.${stats.level}` : `🔒 ${ch.price}G`}</span>
          ${selected ? '<span class="brawl-eq-chip">장착 중</span>' : ''}
          <img src="${getSkinAvatar(ch, eqSkin)}" alt="${ch.name}" class="brawl-card-img" style="${getSkinFilter(eqSkin) ? `filter:${getSkinFilter(eqSkin)};` : ''}" />
          <span class="brawl-tap-hint">${eqSkin ? `✨ ${eqSkin.name}` : '터치해 능력·스킨 보기'}</span>
        </div>
        <div class="brawl-nameplate">
          <span class="brawl-name">${ch.name}</span>
          <span class="brawl-tier-mini">${ch.tier}</span>
        </div>
      `;
      card.onclick = () => openCharDetail(idx);
      el.charList.appendChild(card);
    });
  }

  function buyCharacter(ch, idx) {
    if (isCharUnlocked(ch.id)) return;
    if (save.gold < ch.price) {
      showToast('골드가 부족합니다! 달리면서 코인을 모아보세요.');
      return;
    }
    SFX.buy();
    save.gold -= ch.price;
    save.unlockedChars.push(ch.id);
    save.selectedChar = ch.id;
    previewCharIdx = idx;
    persistSave();
    refreshAllMenus();
    showToast(`🎉 [${ch.name}] 해금 및 장착 완료!`);
  }

  function renderShopList() {
    document.querySelectorAll('.subtab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.shoptab === currentShopSubtab);
    });

    el.shopItemsList.innerHTML = '';

    if (currentShopSubtab === 'chests') {
      DATA.CHEST_ORDER.forEach((tierId) => {
        const chest = DATA.CHESTS[tierId];
        const pityInfo = tierId === 'gold'
          ? `👑 에픽+ 천장 ${save.pity.gold || 0}/10회`
          : (tierId === 'diamond'
            ? `💎 전설+ 천장 ${save.pity.diamond || 0}/15회`
            : `골드 ${chest.goldRange[0]}~${chest.goldRange[1]}G · 💎${chest.gemRange[0]}~${chest.gemRange[1]}`);
        const rateSummary = tierId === 'wood'
          ? '골드 75% · 일반 18% · 희귀 5% · 에픽 1.5% · 💎 0.5%'
          : (tierId === 'silver'
            ? '골드 65% · 일반 15% · 희귀 15% · 에픽 3% · 💎 2%'
            : (tierId === 'gold'
              ? '골드 50% · 희귀 25% · 에픽 17% · 전설 3% · 💎 5%'
              : '골드 25% · 희귀 10% · 에픽 30% · 전설 22% · 신화 3% · 💎 10%'));

        const card = document.createElement('div');
        card.className = `item-card chest-shop-card tier-${tierId}`;
        card.innerHTML = `
          <div class="item-avatar chest-avatar"><img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="item-avatar-img chest-img" /></div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-name">${chest.name}</span>
              <span class="item-badge chest-pity-badge">${pityInfo}</span>
            </div>
            <div class="item-desc">${rateSummary}</div>
          </div>
        `;

        const btnCol = document.createElement('div');
        btnCol.className = 'chest-buy-btns';

        if (chest.shopGold) {
          const gBtn = document.createElement('button');
          gBtn.type = 'button';
          gBtn.className = 'item-action-btn';
          gBtn.textContent = `${chest.shopGold.toLocaleString('ko-KR')} G`;
          gBtn.disabled = save.gold < chest.shopGold;
          gBtn.onclick = () => {
            if (save.gold < chest.shopGold) return;
            save.gold -= chest.shopGold;
            persistSave();
            refreshAllMenus();
            openChestModal(tierId);
          };
          btnCol.appendChild(gBtn);
        }

        if (chest.shopGems) {
          const dBtn = document.createElement('button');
          dBtn.type = 'button';
          dBtn.className = 'item-action-btn gem-btn';
          dBtn.textContent = `💎 ${chest.shopGems}`;
          dBtn.disabled = (save.gems || 0) < chest.shopGems;
          dBtn.onclick = () => {
            if ((save.gems || 0) < chest.shopGems) return;
            save.gems -= chest.shopGems;
            persistSave();
            refreshAllMenus();
            openChestModal(tierId);
          };
          btnCol.appendChild(dBtn);
        }

        card.appendChild(btnCol);
        el.shopItemsList.appendChild(card);
      });
    } else if (currentShopSubtab === 'skins') {
      // Sort diamond-purchasable skins first, then by rarity descending!
      const rarRank = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
      const sortedSkins = [...DATA.SKINS].sort((a, b) => {
        const aBuy = a.gemPrice ? 1 : 0;
        const bBuy = b.gemPrice ? 1 : 0;
        if (aBuy !== bBuy) return bBuy - aBuy;
        return (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0);
      });

      sortedSkins.forEach((sk) => {
        const owned = save.unlockedSkins.includes(sk.id);
        const ownerChar = getCharDef(sk.charId);
        const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.common;
        const isEq = save.equippedSkins[sk.charId] === sk.id;

        const card = document.createElement('div');
        const skAv = getSkinAvatar(ownerChar, sk);
        const skFlt = getSkinFilter(sk);
        card.className = `item-card skin-shop-card rar-${sk.rarity}${isEq ? ' selected' : ''}`;
        card.innerHTML = `
          <div class="item-avatar">
            <img src="${skAv}" alt="${sk.name}" class="item-avatar-img" style="${skFlt ? `filter:${skFlt};` : ''}" />
          </div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-name">${sk.name}</span>
              <span class="skin-rar-pill" style="background:${rar.bg};color:${rar.color}">${rar.name}</span>
            </div>
            <div class="item-desc">${sk.desc ? `${ownerChar.name} · ${sk.desc}` : `${ownerChar.name} 전용 스킨 · ${sk.gemPrice ? '보석 직구매 & 상자 획득 가능' : '상자 뽑기 전용 스킨'}`}</div>
          </div>
        `;

        const btn = document.createElement('button');
        btn.type = 'button';
        if (owned) {
          btn.className = isEq ? 'item-action-btn done' : 'item-action-btn purple';
          btn.textContent = isEq ? '장착 중' : '장착';
          btn.disabled = isEq;
          btn.onclick = () => {
            SFX.click();
            save.equippedSkins[sk.charId] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`✨ [${sk.name}] 스킨 장착 완료!`);
          };
        } else if (sk.gemPrice) {
          btn.className = 'item-action-btn gem-btn';
          btn.textContent = `💎 ${sk.gemPrice}`;
          btn.disabled = (save.gems || 0) < sk.gemPrice;
          btn.onclick = () => {
            if ((save.gems || 0) < sk.gemPrice) return;
            SFX.chestJackpot();
            save.gems -= sk.gemPrice;
            save.unlockedSkins.push(sk.id);
            save.equippedSkins[sk.charId] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`💎 [${sk.name}] 구매 및 즉시 장착 완료!`);
          };
        } else {
          btn.className = 'item-action-btn locked-chest';
          btn.textContent = '🎁 상자 획득';
          btn.onclick = () => {
            currentShopSubtab = 'chests';
            renderShopList();
          };
        }

        card.appendChild(btn);
        el.shopItemsList.appendChild(card);
      });
    } else if (currentShopSubtab === 'upgrades') {
      DATA.UPGRADES.forEach((upg) => {
        const lv = save.upgrades[upg.id] || 0;
        const isMax = lv >= upg.maxLv;
        const price = DATA.getUpgradePrice(upg, lv);

        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-avatar"><img src="${upg.icon}" alt="${upg.name}" class="item-avatar-img" /></div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-name">${upg.name}</span>
              <span class="item-badge">Lv.${lv} / ${upg.maxLv}</span>
            </div>
            <div class="item-desc">${isMax ? '최대 레벨 달성!' : upg.desc(lv)}</div>
          </div>
        `;

        const btn = document.createElement('button');
        btn.type = 'button';
        if (isMax) {
          btn.className = 'item-action-btn done';
          btn.textContent = 'MAX';
          btn.disabled = true;
        } else {
          btn.className = 'item-action-btn';
          btn.textContent = `${price} G`;
          btn.disabled = save.gold < price;
          btn.onclick = () => {
            if (save.gold < price) return;
            SFX.buy();
            save.gold -= price;
            save.upgrades[upg.id] = lv + 1;
            persistSave();
            refreshAllMenus();
            showToast(`${upg.name} Lv.${lv + 1} 강화 성공!`);
          };
        }

        card.appendChild(btn);
        el.shopItemsList.appendChild(card);
      });
    } else if (currentShopSubtab === 'boosters') {
      DATA.BOOSTERS.forEach((b) => {
        const ownedQty = save.boosters[b.id] || 0;
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
          <div class="item-avatar"><img src="${b.icon}" alt="${b.name}" class="item-avatar-img" /></div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-name">${b.name}</span>
              <span class="item-badge">보유 ${ownedQty}개</span>
            </div>
            <div class="item-desc">${b.desc}</div>
          </div>
        `;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item-action-btn';
        btn.textContent = `${b.price} G`;
        btn.disabled = save.gold < b.price;
        btn.onclick = () => {
          if (save.gold < b.price) return;
          SFX.buy();
          save.gold -= b.price;
          save.boosters[b.id] = ownedQty + 1;
          persistSave();
          refreshAllMenus();
          showToast(`${b.name} 구매 완료! 다음 달리기에 자동 적용됩니다.`);
        };
        card.appendChild(btn);
        el.shopItemsList.appendChild(card);
      });
    } else {
      DATA.CHARACTERS.forEach((ch, idx) => {
        const unlocked = isCharUnlocked(ch.id);
        const card = document.createElement('div');
        card.className = `item-card${save.selectedChar === ch.id ? ' selected' : ''}`;
        card.innerHTML = `
          <div class="item-avatar"><img src="${ch.avatar}" alt="${ch.name}" class="item-avatar-img" /></div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-name">${ch.name}</span>
              <span class="item-badge">${ch.tag}</span>
            </div>
            <div class="item-desc">${ch.desc}</div>
          </div>
        `;
        const btn = document.createElement('button');
        btn.type = 'button';
        if (unlocked) {
          btn.className = 'item-action-btn done';
          btn.textContent = save.selectedChar === ch.id ? '장착 중' : '보유 중';
          btn.disabled = save.selectedChar === ch.id;
          btn.onclick = () => {
            SFX.click();
            save.selectedChar = ch.id;
            previewCharIdx = idx;
            persistSave();
            refreshAllMenus();
            showToast(`${ch.name} 장착 완료!`);
          };
        } else {
          btn.className = 'item-action-btn';
          btn.textContent = `${ch.price} G`;
          btn.disabled = save.gold < ch.price;
          btn.onclick = () => buyCharacter(ch, idx);
        }
        card.appendChild(btn);
        el.shopItemsList.appendChild(card);
      });
    }
  }

  function switchTab(tab) {
    SFX.click();
    currentTab = tab;
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    refreshAllMenus();
  }

  // ===================== RUNNER ENGINE (WEATHER PHYSICS + GEAR + FORECAST) =====================
  const GEAR_DURATION = 6.0;
  const GEAR_COOLDOWN = 5.0;
  const UMBRELLA_BROKEN_CD = 7.0;

  function triggerCameraShake(intensity = 6, dur = 0.25) {
    if (!run) return;
    run.shakeIntensity = Math.max(run.shakeIntensity || 0, intensity);
    run.shakeTimer = Math.max(run.shakeTimer || 0, dur);
  }

  function commitRunMissionProgress() {
    if (!run || run.missionsCommitted) return;
    run.missionsCommitted = true;
    ensureTodayMissions();
    const dist = run.distanceM || 0;
    const coins = run.coinsCollected || 0;
    const jumps = run.jumpCount || 0;
    const dodges = run.dodgesTotal || 0;

    save.dailyMissions.progress.dist = (save.dailyMissions.progress.dist || 0) + dist;
    save.dailyMissions.progress.coins = (save.dailyMissions.progress.coins || 0) + coins;
    save.dailyMissions.progress.jumps = (save.dailyMissions.progress.jumps || 0) + jumps;
    save.dailyMissions.progress.dodges = (save.dailyMissions.progress.dodges || 0) + dodges;

    save.weeklyMissions.progress.dist = (save.weeklyMissions.progress.dist || 0) + dist;
    save.weeklyMissions.progress.runs = (save.weeklyMissions.progress.runs || 0) + 1;
    save.weeklyMissions.progress.dodges = (save.weeklyMissions.progress.dodges || 0) + dodges;
    if ((run.year || 1) >= 2) {
      save.weeklyMissions.progress.year2Runs = (save.weeklyMissions.progress.year2Runs || 0) + 1;
    }
    persistSave();
  }

  function startRun() {
    const ch = getCharDef(save.selectedChar);
    const stats = getCharStats(ch);
    const skinDef = getEquippedSkin(ch.id);
    const maxHp = stats.maxHp;

    let hasShield = false;
    let startFever = 0;
    let norwayPerm = false;
    if (save.boosters.shield > 0) { save.boosters.shield -= 1; hasShield = true; }
    if (save.boosters.boost > 0) { save.boosters.boost -= 1; startFever = 4.5; }
    if (save.boosters.norway > 0) { save.boosters.norway -= 1; norwayPerm = true; }
    persistSave();

    paused = false;
    Renderer.clearFloaters();

    run = {
      active: true,
      dying: false,
      deathAnimTimer: 0,
      dead: false,
      missionsCommitted: false,
      charId: ch.id,
      skinDef,
      charLevel: stats.level,
      goldMult: stats.goldMult,
      scoreMult: stats.scoreMult,
      hp: maxHp,
      maxHp,
      score: 0,
      distanceM: 0,
      gold: 0,
      coinsCollected: 0,
      jumpCount: 0,
      dodgesTotal: 0,
      dodgeCombo: 0,
      maxDodgeCombo: 0,
      elapsed: 0,
      year: 1,
      seasonIdx: 0,
      seasonId: 'spring',
      prevSeasonId: null,
      seasonTransition: 1,
      seasonTime: { spring: 0, summer: 0, autumn: 0, winter: 0 },
      stageMilestonesEarned: [],
      lastHeartCount: -1,
      scroll: 0,
      baseSpeed: 188,
      speed: 188,

      // Player physics (16:9 Cookie Run widescreen framing)
      basePlayerX: 132,
      playerX: 132,
      playerY: Renderer.GROUND_Y,
      currentFloorY: Renderer.GROUND_Y,
      onPlatform: false,
      petY: Renderer.GROUND_Y,
      vy: 0,
      jumpsLeft: 2,
      jumpHeld: false,
      jumpBufferTimer: 0,
      coyoteTimer: 0.095,
      springLaunchTimer: 0,
      sliding: false,
      slideInputHeld: false,
      iceSlideInertia: 0,
      iceSlipTimer: 0,
      gliding: false,
      squashX: 1,
      squashY: 1,
      hitStopTimer: 0,
      coinStreak: 0,
      coinStreakTimer: 0,

      // Strategic Gear Toggles with Duration & Cooldown + Weather Exposure Timers
      umbrellaOn: false,
      umbrellaActiveTimer: 0,
      umbrellaCooldown: 0,
      umbrellaBrokenTimer: 0,
      maskOn: false,
      maskActiveTimer: 0,
      maskCooldown: 0,
      rainExposeTimer: 0,
      dustExposeTimer: 0,
      lastHeartKey: '',

      // Camera Juice & Feedback Timers
      shakeTimer: 0,
      shakeIntensity: 0,
      hitFlashTimer: 0,

      // Buffs & Timers
      invulnTimer: 0,
      shield: hasShield,
      feverCharge: startFever > 0 ? 100 : 0,
      feverTimer: startFever,
      speedBoostTimer: 0,
      magnetTimer: 0,
      norwayPermanent: norwayPerm,
      norwayTimer: 0,
      mudBlindTimer: 0,
      heatGauge: 0, // Summer sun heat (0..100)
      shadeScoreCd: 0,
      hitPoseTimer: 0,
      itemPoseTimer: 0,
      winPoseTimer: 0,

      // Weather Event & KMA Fake Forecast State Machine
      weatherEvent: 'clear',
      weatherEventTimer: 3.5, // seconds until next forecast starts
      pendingWeather: null,
      forecastCountdown: 0,
      forecastIsFake: false,
      fakeShockTimer: 0,

      // Street Features & Passing Car
      features: [],
      featureCd: 2.2,
      convStoreCd: 13.0,
      passingCar: null,
      passingCarCd: 5.5,

      // Obstacles & Collectibles
      obstacleCd: 1.5,
      itemCd: 2.6,
      obstacles: [],
      items: [],
      lastHitCause: '극한 한국 날씨에 체력이 다했습니다!'
    };

    el.runPortraitImg.src = getSkinAvatar(ch, skinDef);
    el.runPortraitImg.style.filter = getSkinFilter(skinDef);
    el.runCanvasWrap.classList.toggle('fever-active', startFever > 0);
    el.mudOverlay.classList.add('hidden');
    el.gameoverOverlay.classList.add('hidden');
    el.pauseOverlay.classList.add('hidden');
    el.viewRun.classList.remove('hidden');

    SFX.startBgm();
    SFX.setBgmMode(startFever > 0 ? 'fever' : 'run');
    SFX.seasonUp();
    showRunBanner(`🌸 1년 차 봄 출발! (${ch.name} Lv.${stats.level})`, 2400);
    updateRunHud();
  }

  function checkStageMilestone(year, seasonIdx) {
    if (!run || !DATA.STAGE_MILESTONES) return;
    DATA.STAGE_MILESTONES.forEach((ms) => {
      if (ms.year === year && ms.seasonIdx === seasonIdx && !save.stageMilestonesClaimed[ms.id]) {
        save.stageMilestonesClaimed[ms.id] = true;
        run.gold += ms.rewardGold;
        run.stageMilestonesEarned.push(`${ms.label} (+${ms.rewardGold}G)`);
        persistSave();
        SFX.reward();
        Renderer.spawnFloater(`🏆 ${ms.label} +${ms.rewardGold}G!`, '#ffe866', run.playerX + 26, run.playerY - 62);
      }
    });
  }

  function hasNorwayForecast() {
    return Boolean(run && (run.norwayPermanent || run.norwayTimer > 0));
  }

  function getEffectiveGearCooldown() {
    return Math.max(2.5, Number((GEAR_COOLDOWN - save.upgrades.defense * 0.35).toFixed(2)));
  }

  function toggleUmbrella() {
    if (!run || !run.active || paused) return;
    if (run.umbrellaBrokenTimer > 0) {
      SFX.hit();
      Renderer.spawnFloater(`우산 파손 수리 중 (${Math.ceil(run.umbrellaBrokenTimer)}초)`, '#ff9e9e', run.playerX + 10, run.playerY - 42);
      return;
    }
    if (!run.umbrellaOn && run.umbrellaCooldown > 0) {
      SFX.hit();
      Renderer.spawnFloater(`우산 쿨타임 (${Math.ceil(run.umbrellaCooldown)}초)`, '#ffcb7a', run.playerX + 10, run.playerY - 42);
      return;
    }

    const cd = getEffectiveGearCooldown();
    if (run.umbrellaOn) {
      run.umbrellaOn = false;
      run.umbrellaActiveTimer = 0;
      run.umbrellaCooldown = cd;
      SFX.click();
      haptic(10);
      Renderer.spawnFloater(`우산 접기 (쿨타임 ${cd}초)`, '#8ce0ff', run.playerX + 10, run.playerY - 42);
    } else {
      run.umbrellaOn = true;
      run.umbrellaActiveTimer = GEAR_DURATION;
      run.rainExposeTimer = 0;
      SFX.click();
      haptic(14);
      Renderer.spawnFloater(`우산 ON! (${GEAR_DURATION}초 지속)`, '#8ce0ff', run.playerX + 10, run.playerY - 42);

      // Immediate danger if opened during a roaring wind gust!
      if (run.weatherEvent === 'gust') {
        breakUmbrellaByGust();
      }
    }
    updateRunHud();
  }

  function breakUmbrellaByGust() {
    run.umbrellaOn = false;
    run.umbrellaActiveTimer = 0;
    run.umbrellaBrokenTimer = UMBRELLA_BROKEN_CD;
    run.umbrellaCooldown = UMBRELLA_BROKEN_CD;
    run.hitPoseTimer = 0.5;
    run.hitFlashTimer = 0.28;
    run.hitStopTimer = 0.055;
    run.squashX = 1.22;
    run.squashY = 0.80;
    run.dodgeCombo = 0;
    triggerCameraShake(7, 0.28);
    haptic(35);
    SFX.umbrellaBreak();
    run.hp = Math.max(0, run.hp - 1);
    run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, 강풍 속에 우산을 펴다 뒤집혀 쓰러졌습니다!`;
    Renderer.spawnFloater('강풍에 우산 파손!! -1 ❤️', '#ff5c5c', run.playerX + 16, run.playerY - 48);
    showRunBanner(`💨 돌풍에 우산이 뒤집혔습니다!! (${UMBRELLA_BROKEN_CD}초 사용 불가)`, 2200);
  }

  function toggleMask() {
    if (!run || !run.active || paused) return;
    if (!run.maskOn && run.maskCooldown > 0) {
      SFX.hit();
      Renderer.spawnFloater(`마스크 쿨타임 (${Math.ceil(run.maskCooldown)}초)`, '#ffcb7a', run.playerX + 10, run.playerY - 42);
      return;
    }

    const cd = getEffectiveGearCooldown();
    if (run.maskOn) {
      run.maskOn = false;
      run.maskActiveTimer = 0;
      run.maskCooldown = cd;
      SFX.click();
      haptic(10);
      Renderer.spawnFloater(`마스크 벗기 (쿨타임 ${cd}초)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
    } else {
      run.maskOn = true;
      run.maskActiveTimer = GEAR_DURATION;
      run.dustExposeTimer = 0;
      SFX.click();
      haptic(14);
      Renderer.spawnFloater(`KF94 마스크 ON! (${GEAR_DURATION}초 지속)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
    }
    updateRunHud();
  }

  function executeJump(isGroundJump) {
    const ch = getCharDef(run.charId);
    const inFloodWater = run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2;
    const floodFactor = inFloodWater ? (ch.floodResist ? 0.94 : 0.78) : 1.0;

    run.sliding = false;
    run.iceSlideInertia = 0;
    run.jumpBufferTimer = 0;
    run.coyoteTimer = 0;
    run.springLaunchTimer = 0;
    run.onPlatform = false;
    run.jumpCount += 1;

    if (isGroundJump) {
      run.vy = -384 * floodFactor;
      run.jumpsLeft = 1;
      run.squashX = 0.84;
      run.squashY = 1.18;
      Renderer.spawnLandDust(run.playerX, run.playerY);
      SFX.jump();
      haptic(10);
      if (inFloodWater && !ch.floodResist) Renderer.spawnFloater('침수 저항!', '#75c4ff', run.playerX, run.playerY - 36);
    } else {
      run.vy = -342 * floodFactor;
      run.jumpsLeft = Math.max(0, run.jumpsLeft - 1);
      run.squashX = 0.86;
      run.squashY = 1.15;
      Renderer.spawnDust(run.playerX, run.playerY - 6, true);
      SFX.doubleJump();
      haptic(12);
      Renderer.spawnFloater('2단 점프!', '#9be6ff', run.playerX, run.playerY - 40);
    }
  }

  function doJumpPress() {
    if (!run || !run.active || paused) return;
    run.jumpHeld = true;

    const isGrounded = run.playerY >= run.currentFloorY - 2;
    if (isGrounded || run.coyoteTimer > 0) {
      executeJump(true);
    } else if (run.jumpsLeft > 0) {
      executeJump(false);
    } else {
      // 130ms Jump Input Buffer: executes instant frame-1 jump right upon landing!
      run.jumpBufferTimer = 0.13;
    }
  }

  function doJumpRelease() {
    if (!run) return;
    run.jumpHeld = false;
    run.gliding = false;
    // Variable Jump Height: releasing Jump early smoothly trims upward arc for surgical control!
    if (run.vy < -155 && run.springLaunchTimer <= 0) {
      run.vy *= 0.62;
    }
  }

  function doSlideStart() {
    if (!run || !run.active || paused) return;
    run.slideInputHeld = true;
    const inAirNow = run.playerY < run.currentFloorY - 2;
    if (inAirNow) {
      // Snappy Fast-Fall Dive into instant Slide!
      run.vy = Math.max(run.vy, 470);
      run.squashX = 0.86;
      run.squashY = 1.16;
      SFX.fastFall();
      haptic(8);
    } else if (!run.sliding) {
      run.squashX = 1.14;
      run.squashY = 0.88;
      SFX.slide();
      haptic(8);
    }
    run.sliding = true;
  }

  function doSlideEnd() {
    if (!run) return;
    const ch = getCharDef(run.charId);
    run.slideInputHeld = false;
    if (run.weatherEvent === 'ice_road' && !ch.iceMastery) {
      // Ice inertia keeps sliding slightly longer (Skier controls it cleanly!)
      run.iceSlideInertia = 0.24;
    } else {
      run.sliding = false;
    }
  }

  // ===================== FORECAST & WEATHER PHASE SCHEDULER =====================
  function scheduleNextWeatherForecast() {
    const diff = DATA.getYearDifficulty(run.year);
    const pool = DATA.SEASON_WEATHER_POOL[run.seasonId] || ['rain', 'gust', 'dust'];
    const candidates = pool.filter((w) => w !== run.weatherEvent);
    const nextW = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];

    run.pendingWeather = nextW;
    run.forecastCountdown = Math.max(1.8, 3.0 / Math.min(1.5, diff.weatherPaceMult));
    // KMA gives a fake forecast 65% of the time (escalating slightly with years!) unless Norway Yr.no is active!
    const fakeProb = Math.min(0.82, 0.65 + (run.year - 1) * 0.05);
    run.forecastIsFake = !hasNorwayForecast() && nextW !== 'clear' && Math.random() < fakeProb;
  }

  function activatePendingWeather() {
    const diff = DATA.getYearDifficulty(run.year);
    const nextW = run.pendingWeather || 'clear';
    const wasFake = run.forecastIsFake && !hasNorwayForecast();

    run.weatherEvent = nextW;
    run.pendingWeather = null;
    run.weatherEventTimer = Math.max(5.2, (8.5 + Math.random() * 2.5) / diff.weatherPaceMult);
    run.forecastIsFake = false;
    run.rainExposeTimer = 0;
    run.dustExposeTimer = 0;

    const evDef = DATA.WEATHER_EVENTS[nextW];
    if (wasFake) {
      run.fakeShockTimer = 2.6;
      SFX.fakeAlert();
      showRunBanner(`⚠️ 구라청 오보!! 실제 날씨는 [${evDef.label}]`, 2500);
    } else {
      showRunBanner(`🌦️ 기상 변화: ${evDef.label}`, 2000);
    }

    // If a sudden gust hits while umbrella is open -> snap!
    if (nextW === 'gust' && run.umbrellaOn) {
      breakUmbrellaByGust();
    }
  }

  // ===================== SPAWNERS (100% UPLOADED SHEET OBSTACLES & STRUCTURES) =====================
  function spawnObstacleWave() {
    const diff = DATA.getYearDifficulty(run.year);
    const pool = DATA.OBSTACLES_BY_SEASON[run.seasonId];
    const preset = pool[Math.floor(Math.random() * pool.length)];

    // During flood, leave ground room for submerged car / box platforming!
    if (run.weatherEvent === 'flood' && preset.lane === 'low' && Math.random() < 0.55) {
      return;
    }

    let startX = Renderer.W + (preset.warn ? 48 : 22);
    let y = Renderer.GROUND_Y - preset.h;
    const extra = {};

    if (preset.lane === 'air') {
      y = Renderer.GROUND_Y - 20 - preset.h;
    } else if (preset.lane === 'icicle') {
      startX = Renderer.W + 24;
      y = 8;
      extra.falling = false;
      extra.vy = 0;
    }

    run.obstacles.push({
      ...preset,
      ...extra,
      x: startX,
      y,
      passed: false,
      nearMissed: false,
      extraSpeed: (preset.speedBonus || 0) * diff.extraObsSpeedMult
    });

    // Year 2+ Escalating Difficulty: Fair Double-Obstacle Combo Wave!
    if (run.weatherEvent !== 'flood' && preset.lane !== 'icicle' && Math.random() < diff.doubleWaveChance) {
      const followPool = pool.filter((p) => p.lane !== 'icicle');
      const second = followPool[Math.floor(Math.random() * followPool.length)] || preset;
      const gapX = Math.max(155, 195 - (run.year - 2) * 10);
      const sx2 = startX + gapX;
      const sy2 = second.lane === 'air' ? Renderer.GROUND_Y - 20 - second.h : Renderer.GROUND_Y - second.h;
      run.obstacles.push({
        ...second,
        x: sx2,
        y: sy2,
        passed: false,
        nearMissed: false,
        extraSpeed: (second.speedBonus || 0) * diff.extraObsSpeedMult
      });
    }

    // Tighter & Riskier Coin Economy: coins appear on ~55% of waves in smaller, higher-skill clusters!
    if (Math.random() < 0.55) {
      const coinX0 = startX - 8;
      if (preset.lane === 'low') {
        for (let i = 0; i < 3; i++) {
          const arc = Math.sin((i / 2) * Math.PI) * 58;
          run.items.push({ kind: 'coin', x: coinX0 + i * 24, y: Renderer.GROUND_Y - 22 - arc });
        }
      } else if (preset.lane === 'tall') {
        const hasBig = Math.random() < 0.25;
        for (let i = 0; i < 3; i++) {
          const arc = Math.sin((i / 2) * Math.PI) * 96;
          run.items.push({ kind: (i === 1 && hasBig) ? 'big_coin' : 'coin', x: coinX0 + i * 24, y: Renderer.GROUND_Y - 22 - arc });
        }
      } else if (preset.lane === 'air') {
        for (let i = 0; i < 3; i++) {
          run.items.push({ kind: 'coin', x: startX - 4 + i * 22, y: Renderer.GROUND_Y - 10 });
        }
      } else {
        for (let i = 0; i < 2; i++) {
          run.items.push({ kind: 'coin', x: startX + 38 + i * 24, y: Renderer.GROUND_Y - 24 });
        }
      }
    }
  }

  function spawnUtilityPickup() {
    const r = Math.random();
    const y = Renderer.GROUND_Y - (Math.random() < 0.5 ? 28 : 78);
    if (r < 0.19) {
      run.items.push({ kind: 'norway', x: Renderer.W + 24, y });
    } else if (r < 0.39) {
      run.items.push({ kind: 'coffee', x: Renderer.W + 24, y });
    } else if (r < 0.55) {
      run.items.push({ kind: 'star', x: Renderer.W + 24, y });
    } else if (r < 0.68) {
      run.items.push({ kind: 'magnet', x: Renderer.W + 24, y });
    } else if (r < 0.81) {
      run.items.push({ kind: 'speed_boost', x: Renderer.W + 24, y });
    } else if (r < 0.90) {
      run.items.push({ kind: 'shield_item', x: Renderer.W + 24, y });
    } else if (r < 0.96) {
      run.items.push({ kind: 'umbrella_fever', x: Renderer.W + 24, y });
    } else {
      run.items.push({ kind: 'chest', x: Renderer.W + 24, y: Renderer.GROUND_Y - 16 });
    }
  }

  function spawnStreetFeature() {
    if (run.weatherEvent === 'flood') {
      // Spawn dry submerged red car or crate/metal platform strictly from uploaded sheet!
      const r = Math.random();
      const kind = r < 0.48 ? 'car_roof' : (r < 0.76 ? 'crate_plat' : 'metal_plat');
      const w = kind === 'car_roof' ? 76 : 68;
      const platformY = kind === 'car_roof' ? Renderer.GROUND_Y - 30 : Renderer.GROUND_Y - 26;
      run.features.push({ kind, x: Renderer.W + 30, w, platformY, isPlatform: true });
      for (let i = 0; i < 2; i++) {
        run.items.push({ kind: 'coin', x: Renderer.W + 46 + i * 24, y: platformY - 16 });
      }
    } else if (run.weatherEvent === 'heat') {
      // Summer Shade Hopping strictly using sp_summer_tree / sp_palm_tree / sp_parasol!
      const r = Math.random();
      if (r < 0.36) {
        run.features.push({ kind: 'shade_tree', x: Renderer.W + 30, w: 74, isShade: true });
      } else if (r < 0.70) {
        run.features.push({ kind: 'shade_parasol', x: Renderer.W + 30, w: 72, isShade: true });
      } else {
        run.features.push({ kind: 'shade_palm', x: Renderer.W + 30, w: 76, isShade: true });
      }
    }
  }

  function spawnConvenienceStore() {
    // Spawn either a bouncy Red Spring Jump Pad (sp_spring_pad) or Cooling Parasol Spot (sp_parasol)!
    if (Math.random() < 0.55) {
      run.features.push({ kind: 'spring_pad', x: Renderer.W + 40, w: 44, triggered: false });
      const hasBig = Math.random() < 0.35;
      for (let i = 0; i < 3; i++) {
        const arc = Math.sin((i / 2) * Math.PI) * 98;
        run.items.push({ kind: (i === 1 && hasBig) ? 'big_coin' : 'coin', x: Renderer.W + 76 + i * 26, y: Renderer.GROUND_Y - 40 - arc });
      }
    } else {
      run.features.push({ kind: 'cool_spot', x: Renderer.W + 40, w: 78, triggered: false, isShade: true });
    }
  }

  // ===================== MAIN RUN UPDATE =====================
  function updateRun(dt) {
    if (!run || !run.active || paused) return;

    // 55ms Micro Hit-Stop (Supercell tactile impact freeze!)
    if (run.hitStopTimer > 0) {
      run.hitStopTimer = Math.max(0, run.hitStopTimer - dt);
      if (run.shakeTimer > 0) run.shakeTimer = Math.max(0, run.shakeTimer - dt);
      if (run.hitFlashTimer > 0) run.hitFlashTimer = Math.max(0, run.hitFlashTimer - dt);
      return;
    }

    // Spring-back Squash & Stretch + Input Assist Timers
    const sqLerp = Math.min(1, dt * 14);
    run.squashX += (1 - run.squashX) * sqLerp;
    run.squashY += (1 - run.squashY) * sqLerp;
    if (run.jumpBufferTimer > 0) run.jumpBufferTimer = Math.max(0, run.jumpBufferTimer - dt);
    if (run.coyoteTimer > 0) run.coyoteTimer = Math.max(0, run.coyoteTimer - dt);
    if (run.springLaunchTimer > 0) run.springLaunchTimer = Math.max(0, run.springLaunchTimer - dt);
    if (run.coinStreakTimer > 0) {
      run.coinStreakTimer = Math.max(0, run.coinStreakTimer - dt);
      if (run.coinStreakTimer <= 0) run.coinStreak = 0;
    }

    const ch = getCharDef(run.charId);
    const diff = DATA.getYearDifficulty(run.year);
    const upgradeScoreMult = 1 + save.upgrades.score * 0.12;

    run.elapsed += dt;
    if (run.seasonTime && run.seasonId in run.seasonTime) {
      run.seasonTime[run.seasonId] += dt;
    }

    // Equal 4-season infinite cycle (15s * 4 = 60s per year)
    const newYear = Math.floor(run.elapsed / DATA.YEAR_DURATION) + 1;
    const yearTime = run.elapsed % DATA.YEAR_DURATION;
    const newSeasonIdx = Math.floor(yearTime / DATA.SEASON_DURATION);

    if (newYear > run.year) {
      run.prevSeasonId = run.seasonId;
      run.seasonTransition = 0;
      run.year = newYear;
      run.seasonIdx = 0;
      run.seasonId = DATA.SEASONS[0].id;
      const yearGoldBonus = 20 + run.year * 5;
      run.score += Math.round(600 * run.year * run.scoreMult);
      run.gold += yearGoldBonus;
      run.winPoseTimer = 0.9;
      SFX.yearUp();
      const nextDiff = DATA.getYearDifficulty(run.year);
      showRunBanner(`🔥 ${run.year}년 차 진입! 속도×${nextDiff.speedMult.toFixed(2)} · 콤보 장애물 경보! (+${yearGoldBonus}G)`, 3000);
      Renderer.spawnFloater(`${run.year}년 차 난이도 UP!`, '#ff944d', run.playerX + 40, run.playerY - 52);
      checkStageMilestone(run.year, 0);
    } else if (newSeasonIdx !== run.seasonIdx) {
      run.prevSeasonId = run.seasonId;
      run.seasonTransition = 0;
      run.seasonIdx = newSeasonIdx;
      const sObj = DATA.SEASONS[run.seasonIdx];
      run.seasonId = sObj.id;
      run.score += Math.round(200 * run.year * run.scoreMult);
      run.gold += 5;
      run.heatGauge = 0;
      SFX.seasonUp();
      showRunBanner(`${sObj.icon} ${run.year}년 차 [${sObj.name}] 전환 · ${sObj.weatherLabel}`, 2300);
      checkStageMilestone(run.year, run.seasonIdx);
      // Immediately queue a forecast for the new season's weather!
      if (!run.pendingWeather) scheduleNextWeatherForecast();
    }

    // Smooth 3.2-second visual seasonal background & particle crossfade!
    if (run.seasonTransition < 1) {
      run.seasonTransition = Math.min(1, run.seasonTransition + dt / 3.2);
      if (run.seasonTransition >= 1) run.prevSeasonId = null;
    }

    // Weather Forecast Countdown State Machine
    if (run.pendingWeather) {
      run.forecastCountdown -= dt;
      if (run.forecastCountdown <= 0) {
        activatePendingWeather();
      }
    } else {
      run.weatherEventTimer -= dt;
      if (run.weatherEventTimer <= 0) {
        scheduleNextWeatherForecast();
      }
    }

    // Timers
    if (run.invulnTimer > 0) run.invulnTimer = Math.max(0, run.invulnTimer - dt);
    if (run.magnetTimer > 0) run.magnetTimer = Math.max(0, run.magnetTimer - dt);
    if (run.speedBoostTimer > 0) run.speedBoostTimer = Math.max(0, run.speedBoostTimer - dt);
    if (run.norwayTimer > 0) run.norwayTimer = Math.max(0, run.norwayTimer - dt);
    if (run.mudBlindTimer > 0) run.mudBlindTimer = Math.max(0, run.mudBlindTimer - dt);
    if (run.umbrellaBrokenTimer > 0) run.umbrellaBrokenTimer = Math.max(0, run.umbrellaBrokenTimer - dt);
    if (run.fakeShockTimer > 0) run.fakeShockTimer = Math.max(0, run.fakeShockTimer - dt);
    if (run.shadeScoreCd > 0) run.shadeScoreCd = Math.max(0, run.shadeScoreCd - dt);
    if (run.hitPoseTimer > 0) run.hitPoseTimer = Math.max(0, run.hitPoseTimer - dt);
    if (run.itemPoseTimer > 0) run.itemPoseTimer = Math.max(0, run.itemPoseTimer - dt);
    if (run.winPoseTimer > 0) run.winPoseTimer = Math.max(0, run.winPoseTimer - dt);
    if (run.shakeTimer > 0) run.shakeTimer = Math.max(0, run.shakeTimer - dt);
    if (run.hitFlashTimer > 0) run.hitFlashTimer = Math.max(0, run.hitFlashTimer - dt);
    if (run.feverTimer > 0) {
      run.feverTimer = Math.max(0, run.feverTimer - dt);
      run.feverCharge = (run.feverTimer / 4.5) * 100;
    }

    // Umbrella & Mask Active Duration + Cooldown Timers
    const effGearCd = getEffectiveGearCooldown();
    if (run.umbrellaOn) {
      run.umbrellaActiveTimer = Math.max(0, run.umbrellaActiveTimer - dt);
      if (run.umbrellaActiveTimer <= 0) {
        run.umbrellaOn = false;
        run.umbrellaCooldown = effGearCd;
        SFX.click();
        Renderer.spawnFloater(`우산 종료 (쿨타임 ${effGearCd}초)`, '#9fd9ff', run.playerX + 10, run.playerY - 42);
      }
    } else if (run.umbrellaCooldown > 0) {
      run.umbrellaCooldown = Math.max(0, run.umbrellaCooldown - dt);
    }

    if (run.maskOn) {
      run.maskActiveTimer = Math.max(0, run.maskActiveTimer - dt);
      if (run.maskActiveTimer <= 0) {
        run.maskOn = false;
        run.maskCooldown = effGearCd;
        SFX.click();
        Renderer.spawnFloater(`마스크 종료 (쿨타임 ${effGearCd}초)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
      }
    } else if (run.maskCooldown > 0) {
      run.maskCooldown = Math.max(0, run.maskCooldown - dt);
    }

    // Ice Road slide inertia
    if (run.iceSlideInertia > 0) {
      run.iceSlideInertia = Math.max(0, run.iceSlideInertia - dt);
      if (run.iceSlideInertia <= 0 && !run.slideInputHeld) {
        run.sliding = false;
      }
    }

    // ---- MECHANIC 1: WEATHER-DRIVEN MOVEMENT SPEED & CHARACTER PASSIVES ----
    const feverBoost = run.feverTimer > 0 ? 1.36 : (run.speedBoostTimer > 0 ? 1.32 : 1.0);
    const boostScoreMult = run.speedBoostTimer > 0 ? 1.5 : 1.0;
    let weatherSpeedMult = 1.0;
    let iceScoreBonus = 1.0;
    if (run.umbrellaOn) weatherSpeedMult *= 0.84; // Umbrella air drag slows runner!
    if (run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2) {
      weatherSpeedMult *= ch.floodResist ? 0.92 : 0.72; // 우비 소년 mitigates flood drag!
    }
    if (run.weatherEvent === 'ice_road') {
      if (ch.iceMastery) {
        weatherSpeedMult *= 1.15; // 스키어 excels on icy roads!
        iceScoreBonus = 1.2;
      } else if (run.sliding) {
        weatherSpeedMult *= 1.38; // Fast slippery ice slide!
      }
    }
    if (run.weatherEvent === 'gust' && run.sliding) {
      weatherSpeedMult *= 1.12; // Aerodynamic crouch cuts headwind!
    }

    run.speed = run.baseSpeed * diff.speedMult * feverBoost * weatherSpeedMult;
    run.scroll += run.speed * dt;
    run.distanceM = Math.floor(run.scroll / 14);
    run.score += run.speed * dt * 0.16 * run.scoreMult * diff.scoreMult * upgradeScoreMult * iceScoreBonus * boostScoreMult;

    // Gust Headwind Horizontal Push-Back vs Slide Push-Forward!
    if (run.weatherEvent === 'gust' && run.feverTimer <= 0) {
      if (run.sliding) {
        run.playerX = Math.min(run.basePlayerX + 10, run.playerX + 72 * dt);
      } else if (run.playerY < run.currentFloorY - 2) {
        run.playerX = Math.max(54, run.playerX - 58 * dt); // Blown back in midair!
      } else {
        run.playerX = Math.max(66, run.playerX - 18 * dt);
      }
    } else {
      // Gently return toward standard runner X position
      const slipOffset = run.iceSlipTimer > 0 ? 16 : 0;
      if (run.iceSlipTimer > 0) run.iceSlipTimer = Math.max(0, run.iceSlipTimer - dt);
      const targetX = run.basePlayerX + slipOffset;
      run.playerX += (targetX - run.playerX) * Math.min(1, dt * 4.5);
    }

    // Vertical Physics + Apex Hang + Coyote Time + Jump Buffer + One-Way Platforms!
    const prevY = run.playerY;
    const baseGravity = (run.weatherEvent === 'gust' && run.vy < 180) ? 740 : 1080;
    const apexMult = (run.playerY < run.currentFloorY - 2 && Math.abs(run.vy) < 65) ? 0.80 : 1.0;
    run.vy += baseGravity * apexMult * dt;

    if (ch.canGlide && run.jumpHeld && run.playerY < run.currentFloorY && run.vy > 45) {
      run.vy = 85;
      run.gliding = true;
    } else {
      run.gliding = false;
    }

    run.playerY += run.vy * dt;

    // Detect active platform under player
    let floorY = Renderer.GROUND_Y;
    let landedPlatform = false;
    for (const f of run.features) {
      if (f.isPlatform && run.playerX >= f.x - 6 && run.playerX <= f.x + f.w + 6) {
        if (prevY <= f.platformY + 7 && run.playerY >= f.platformY && run.vy >= 0) {
          floorY = Math.min(floorY, f.platformY);
          landedPlatform = true;
        }
      }
    }
    run.currentFloorY = floorY;

    if (run.playerY >= floorY) {
      const wasAir = prevY < floorY - 4;
      run.playerY = floorY;
      run.vy = 0;
      run.jumpsLeft = 2;
      run.coyoteTimer = 0.095;
      run.gliding = false;
      run.onPlatform = landedPlatform;
      if (wasAir) {
        run.squashX = 1.18;
        run.squashY = 0.84;
        Renderer.spawnLandDust(run.playerX, floorY);
        SFX.land();
        if (run.weatherEvent === 'ice_road' && !landedPlatform && !ch.iceMastery) {
          run.iceSlipTimer = 0.28; // Slippery landing on winter ice (Skier has full control!)
        }
        // Consume 130ms Jump Input Buffer on exact frame-1 landing!
        if (run.jumpBufferTimer > 0) {
          executeJump(true);
        }
      }
    } else {
      run.onPlatform = false;
    }

    // Loyal Shiba Puppy mirrors player jump smoothly
    run.petY += (run.playerY - run.petY) * Math.min(1, dt * 11);

    // ---- UPDATE STREET FEATURES (CONVENIENCE STORE AC + SHADE COOLING) ----
    let inShade = false;
    for (let i = run.features.length - 1; i >= 0; i--) {
      const f = run.features[i];
      f.x -= (run.speed + (f.extraSpeed || 0)) * dt;

      // Red Spring Jump Pad (sp_spring_pad) -> High Bounce + Score + FEVER!
      if (f.kind === 'spring_pad' && !f.triggered && run.playerX >= f.x - 4 && run.playerX <= f.x + f.w + 4 && run.playerY >= Renderer.GROUND_Y - 26) {
        f.triggered = true;
        run.vy = -495;
        run.springLaunchTimer = 0.45;
        run.jumpsLeft = 1;
        run.onPlatform = false;
        run.squashX = 0.80;
        run.squashY = 1.24;
        haptic(14);
        run.score += Math.round(120 * run.scoreMult * upgradeScoreMult);
        if (run.feverTimer <= 0) run.feverCharge = Math.min(100, run.feverCharge + 12);
        SFX.doubleJump();
        Renderer.spawnPickupEffect(f.x + 22, Renderer.GROUND_Y - 18, '#ff7675', true);
        Renderer.spawnFloater('스프링 점프! +120 · 피버+12%', '#ffe36e', run.playerX + 14, run.playerY - 46);
      }

      // Cooling Parasol Spot (sp_parasol + watermelon/icecream) -> Heat Cooling + Score + FEVER (NO HP healing!)
      if (f.kind === 'cool_spot' && !f.triggered && run.playerX >= f.x + 12 && run.playerX <= f.x + f.w - 4) {
        f.triggered = true;
        run.heatGauge = Math.max(0, run.heatGauge - 60);
        run.score += Math.round(150 * run.scoreMult * upgradeScoreMult);
        if (run.feverTimer <= 0) {
          run.feverCharge = Math.min(100, run.feverCharge + 12);
        }
        SFX.acChime();
        Renderer.spawnPickupEffect(f.x + 42, Renderer.GROUND_Y - 28, '#70f2ff', true);
        Renderer.spawnFloater('파라솔 쿨링! 점수+150 · 피버+12%', '#70f2ff', run.playerX + 18, run.playerY - 48);
      }

      if (f.isShade && run.playerX >= f.x - 8 && run.playerX <= f.x + f.w + 8) {
        inShade = true;
      }

      if (f.x + f.w < -60) run.features.splice(i, 1);
    }

    // ---- ACTIVE WEATHER EXPOSURE SYSTEM (RAIN WITHOUT UMBRELLA / YELLOW DUST WITHOUT MASK -> -1 HEART!) ----
    const rainExposeLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustExposeLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    const isRainingNow = run.weatherEvent === 'rain' || run.weatherEvent === 'flood';
    const isDustNow = run.weatherEvent === 'dust';

    if (run.feverTimer <= 0) {
      // 1. Rain without Umbrella for set duration -> -1 Heart!
      if (isRainingNow && !run.umbrellaOn) {
        run.rainExposeTimer += dt;
        if (run.rainExposeTimer >= rainExposeLimit) {
          run.rainExposeTimer = 0;
          run.hp = Math.max(0, run.hp - 1);
          run.hitPoseTimer = 0.3;
          run.hitFlashTimer = 0.25;
          triggerCameraShake(5, 0.2);
          run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, 비가 오는데 우산을 쓰지 않아 쓰러졌습니다!`;
          SFX.hit();
          Renderer.spawnFloater('비 노출! -1 ❤️ (우산 펴기!)', '#6ec6ff', run.playerX + 8, run.playerY - 46);
        }
      } else {
        run.rainExposeTimer = 0;
      }

      // 2. Yellow Dust (황사) without Mask for set duration -> -1 Heart!
      if (isDustNow && !run.maskOn) {
        run.dustExposeTimer += dt;
        if (run.dustExposeTimer >= dustExposeLimit) {
          run.dustExposeTimer = 0;
          run.hp = Math.max(0, run.hp - 1);
          run.hitPoseTimer = 0.3;
          run.hitFlashTimer = 0.25;
          triggerCameraShake(5, 0.2);
          run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, 황사가 왔는데 마스크를 쓰지 않아 쓰러졌습니다!`;
          SFX.hit();
          Renderer.spawnFloater('황사 노출! -1 ❤️ (마스크 착용!)', '#ffd966', run.playerX + 8, run.playerY - 46);
        }
      } else {
        run.dustExposeTimer = 0;
      }

      // 3. Summer Heat Gauge (only builds in active heatwave outside shade, escalates by year!)
      if (run.weatherEvent === 'heat' && !ch.summerImmune) {
        if (inShade) {
          run.heatGauge = Math.max(0, run.heatGauge - 46 * dt);
          if (run.shadeScoreCd <= 0) {
            run.shadeScoreCd = 1.1;
            run.score += Math.round(60 * upgradeScoreMult);
            Renderer.spawnFloater('그늘 밟기! 냉각', '#7ae8ff', run.playerX + 8, run.playerY - 42);
          }
        } else {
          run.heatGauge = Math.min(100, run.heatGauge + 15 * diff.heatRateMult * dt);
          if (run.heatGauge >= 100) {
            run.heatGauge = 55;
            run.hp = Math.max(0, run.hp - 1);
            run.hitPoseTimer = 0.3;
            run.hitFlashTimer = 0.25;
            triggerCameraShake(5, 0.2);
            run.lastHitCause = `${run.year}년 차 여름 폭염, 그늘을 놓쳐 열사병으로 쓰러졌습니다!`;
            SFX.hit();
            Renderer.spawnFloater('열사병! -1 ❤️ (그늘 밟기!)', '#ff8052', run.playerX + 8, run.playerY - 46);
          }
        }
      } else {
        run.heatGauge = Math.max(0, run.heatGauge - 24 * dt);
      }
    } else {
      run.heatGauge = Math.max(0, run.heatGauge - 40 * dt);
      run.rainExposeTimer = 0;
      run.dustExposeTimer = 0;
    }

    // ---- PASSING CAR SPLASH EVENT (RAIN / FLOOD) ----
    if (run.passingCar) {
      const car = run.passingCar;
      if (car.phase === 'warn') {
        car.timer -= dt;
        if (car.timer <= 0) {
          car.phase = 'pass';
          car.x = Renderer.W + 20;
          car.checked = false;
        }
      } else {
        car.x -= (run.speed + 250) * dt;
        if (!car.checked && car.x <= run.playerX + 18 && car.x + 70 >= run.playerX) {
          car.checked = true;
          if (run.playerY < Renderer.GROUND_Y - 18 || run.feverTimer > 0) {
            run.score += Math.round(130 * upgradeScoreMult);
            SFX.guard();
            Renderer.spawnFloater('물벼락 점프 회피! +130', '#7affb3', run.playerX + 12, run.playerY - 46);
          } else {
            run.mudBlindTimer = 2.8;
            SFX.splash();
            run.hp = Math.max(0, run.hp - 1);
            run.hitPoseTimer = 0.45;
            run.hitFlashTimer = 0.25;
            triggerCameraShake(5, 0.22);
            run.lastHitCause = `${run.year}년 차 장마철, 지나가는 차의 흙탕물 물벼락을 맞고 쓰러졌습니다!`;
            Renderer.spawnFloater('물벼락 적중! -1 ❤️', '#ff9452', run.playerX + 10, run.playerY - 44);
          }
        }
        if (car.x < -100) run.passingCar = null;
      }
    } else if (run.weatherEvent === 'rain' || run.weatherEvent === 'flood') {
      run.passingCarCd -= dt;
      if (run.passingCarCd <= 0) {
        run.passingCarCd = Math.max(3.6, (6.5 + Math.random() * 2.5) / diff.weatherPaceMult);
        run.passingCar = { phase: 'warn', timer: Math.max(0.85, 1.15 / Math.min(1.35, diff.weatherPaceMult)), x: Renderer.W + 30 };
        SFX.fakeAlert();
      }
    }

    // ---- SPAWN TIMERS ----
    run.obstacleCd -= dt;
    if (run.obstacleCd <= 0) {
      spawnObstacleWave();
      const baseInterval = 1.68 / diff.spawnRateMult;
      run.obstacleCd = Math.max(0.58, baseInterval + (Math.random() - 0.35) * 0.32);
    }

    run.itemCd -= dt;
    if (run.itemCd <= 0) {
      spawnUtilityPickup();
      run.itemCd = 3.8 + Math.random() * 1.9;
    }

    if (run.weatherEvent === 'flood' || run.weatherEvent === 'heat') {
      run.featureCd -= dt;
      if (run.featureCd <= 0) {
        spawnStreetFeature();
        run.featureCd = run.weatherEvent === 'flood' ? 1.55 : 1.85;
      }
    }

    run.convStoreCd -= dt;
    if (run.convStoreCd <= 0) {
      spawnConvenienceStore();
      run.convStoreCd = 16.0 + Math.random() * 5.0;
    }

    // ---- COLLECTIBLES & OBSTACLE COLLISIONS (FORGIVING TIGHT CORE HITBOXES) ----
    const pBox = {
      x: run.playerX - 5,
      y: run.sliding ? run.playerY - 11 : run.playerY - 28,
      w: 10,
      h: run.sliding ? 9 : 24
    };

    function addFeverCharge(amount) {
      if (run.feverTimer > 0) return;
      run.feverCharge = Math.min(100, run.feverCharge + amount);
      if (run.feverCharge >= 100) {
        run.feverTimer = 4.5;
        run.winPoseTimer = 0.7;
        SFX.feverStart();
        Renderer.spawnFloater('FEVER! 무적 질주!', '#ffe85c', run.playerX + 16, run.playerY - 48);
      }
    }

    const hasSuperMagnet = run.feverTimer > 0 || run.magnetTimer > 0;
    const magnetRadius = hasSuperMagnet ? 145 : 24 + save.upgrades.magnet * 16;

    for (let i = run.items.length - 1; i >= 0; i--) {
      const it = run.items[i];
      it.x -= run.speed * dt;

      const pcx = pBox.x + pBox.w / 2;
      const pcy = pBox.y + pBox.h / 2;
      const dist = Math.hypot(it.x - pcx, it.y - pcy);

      if ((it.kind === 'coin' || it.kind === 'big_coin' || it.kind === 'star') && dist < magnetRadius && dist > 16) {
        const pull = (hasSuperMagnet ? 420 : 230) * dt;
        it.x += ((pcx - it.x) / dist) * pull;
        it.y += ((pcy - it.y) / dist) * pull;
      }

      if (dist < 24) {
        run.items.splice(i, 1);
        if (it.kind === 'coin' || it.kind === 'big_coin') {
          const baseG = (it.kind === 'big_coin' ? 4 : 1) + diff.goldBonus;
          const gainedG = Math.max(1, Math.round(baseG * run.goldMult));
          const gainedS = Math.round((it.kind === 'big_coin' ? 120 : 30) * run.scoreMult * upgradeScoreMult);
          run.gold += gainedG;
          run.coinsCollected += it.kind === 'big_coin' ? 2 : 1;
          run.score += gainedS;
          addFeverCharge(it.kind === 'big_coin' ? 10 : 2.5);
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe55c', it.kind === 'big_coin');
          if (it.kind === 'big_coin') {
            SFX.bigCoin();
            haptic(10);
            Renderer.spawnFloater(`+${gainedG}G!`, '#ffea59', it.x, it.y - 10);
          } else {
            SFX.coin(run.coinStreak);
            run.coinStreak = Math.min(6, (run.coinStreak || 0) + 1);
            run.coinStreakTimer = 0.65;
          }
        } else if (it.kind === 'norway') {
          run.norwayTimer = 25.0;
          run.forecastIsFake = false;
          run.itemPoseTimer = 0.5;
          SFX.norway();
          Renderer.spawnPickupEffect(it.x, it.y, '#70e2ff', true);
          Renderer.spawnFloater('노르웨이 기상청 ON! (25초)', '#70e2ff', run.playerX + 16, run.playerY - 46);
          showRunBanner('🇳🇴 노르웨이 기상청 획득! 3초 전 100% 정확 예보!', 2300);
        } else if (it.kind === 'star') {
          run.score += Math.round(160 * run.scoreMult * upgradeScoreMult);
          addFeverCharge(24);
          SFX.bigCoin();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe866', true);
          Renderer.spawnFloater('FEVER +24%!', '#ffe866', it.x, it.y - 10);
        } else if (it.kind === 'magnet') {
          run.magnetTimer = 6.0;
          run.itemPoseTimer = 0.45;
          SFX.magnet();
          Renderer.spawnPickupEffect(it.x, it.y, '#ff6e8a', true);
          Renderer.spawnFloater('자석 발동! (6초)', '#ff7d95', run.playerX + 12, run.playerY - 42);
        } else if (it.kind === 'speed_boost') {
          run.speedBoostTimer = 4.0;
          run.itemPoseTimer = 0.45;
          run.score += Math.round(140 * run.scoreMult * upgradeScoreMult);
          SFX.speedBoost();
          Renderer.spawnPickupEffect(it.x, it.y, '#59e8ff', true);
          Renderer.spawnFloater('⚡ 스피드 부스트! (4초 무적 질주)', '#66f2ff', run.playerX + 16, run.playerY - 46);
        } else if (it.kind === 'shield_item') {
          run.shield = true;
          run.itemPoseTimer = 0.45;
          SFX.shieldUp();
          Renderer.spawnPickupEffect(it.x, it.y, '#7ad8ff', true);
          Renderer.spawnFloater('🛡️ 기상 보호막 획득!', '#8ce2ff', run.playerX + 12, run.playerY - 44);
        } else if (it.kind === 'chest') {
          const bonusG = Math.round(12 * run.goldMult);
          run.gold += bonusG;
          run.coinsCollected += 4;
          run.score += Math.round(250 * upgradeScoreMult);
          addFeverCharge(25);
          SFX.reward();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffd847', true);
          Renderer.spawnFloater(`보물상자 +${bonusG}G!`, '#ffe55c', it.x, it.y - 14);
        } else if (it.kind === 'coffee') {
          // Energy drink / Iced Americano -> Score + FEVER + Heat cooling (NO HP healing!)
          const bonusSc = ch.icedBonus ? 280 : 120;
          const feverGain = ch.icedBonus ? 24 : 16;
          run.heatGauge = Math.max(0, run.heatGauge - 25);
          run.score += Math.round(bonusSc * run.scoreMult * upgradeScoreMult);
          addFeverCharge(feverGain);
          run.itemPoseTimer = 0.55;
          SFX.heal();
          Renderer.spawnPickupEffect(it.x, it.y, '#70f59b', true);
          Renderer.spawnFloater(
            ch.icedBonus ? `얼죽아 파워! +${bonusSc} · 피버+${feverGain}%` : `이온음료! +${bonusSc} · 피버+${feverGain}%`,
            '#70f59b',
            run.playerX + 10,
            run.playerY - 40
          );
        } else if (it.kind === 'umbrella_fever') {
          run.feverCharge = 100;
          run.feverTimer = 4.5;
          run.score += 180;
          run.itemPoseTimer = 0.55;
          SFX.feverStart();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe55c', true);
          Renderer.spawnFloater('FEVER! 무적 질주!', '#ffe55c', run.playerX + 12, run.playerY - 44);
        }
        continue;
      }

      if (it.x < -30) run.items.splice(i, 1);
    }

    for (let i = run.obstacles.length - 1; i >= 0; i--) {
      const ob = run.obstacles[i];

      // Special movement & telegraph for Summer Lightning and Winter Falling Icicle!
      if (ob.lane === 'lightning') {
        ob.x -= run.speed * 0.72 * dt;
        if (ob.strikeTimer > 0) {
          ob.strikeTimer -= dt;
          if (ob.strikeTimer <= 0 && !ob.thunderPlayed) {
            ob.thunderPlayed = true;
            SFX.thunder();
            triggerCameraShake(4.5, 0.16);
          }
        } else {
          ob.strikeActiveTimer -= dt;
          if (ob.strikeActiveTimer <= 0) {
            run.obstacles.splice(i, 1);
            continue;
          }
        }
      } else if (ob.lane === 'icicle') {
        ob.x -= run.speed * dt;
        if (!ob.falling && ob.x < Renderer.W - 70) {
          ob.falling = true;
        }
        if (ob.falling) {
          ob.vy = (ob.vy || 0) + 520 * dt;
          ob.y = Math.min(Renderer.GROUND_Y - ob.h, ob.y + ob.vy * dt);
        }
      } else {
        ob.x -= (run.speed + ob.extraSpeed) * dt;
      }

      // Forgiving inset hitbox so grazing visual edges never causes unfair hits!
      const isHarmlessTelegraph = ob.lane === 'lightning' && ob.strikeTimer > 0;
      const padX = Math.round(ob.w * 0.28);
      const padTop = ob.lane === 'lightning' ? 24 : Math.round(ob.h * 0.34);
      const padBot = ob.lane === 'air' ? Math.round(ob.h * 0.10) : Math.round(ob.h * 0.16);
      const oBox = {
        x: ob.x + padX,
        y: ob.y + padTop,
        w: Math.max(8, ob.w - padX * 2),
        h: Math.max(8, ob.h - padTop - padBot)
      };

      const overlap =
        !isHarmlessTelegraph &&
        pBox.x < oBox.x + oBox.w &&
        pBox.x + pBox.w > oBox.x &&
        pBox.y < oBox.y + oBox.h &&
        pBox.y + pBox.h > oBox.y;

      if (overlap) {
        if (run.feverTimer > 0 || run.speedBoostTimer > 0) {
          run.obstacles.splice(i, 1);
          const bonusPts = run.feverTimer > 0 ? 150 : 120;
          run.score += Math.round(bonusPts * run.scoreMult * upgradeScoreMult);
          SFX.guard();
          Renderer.spawnPickupEffect(ob.x + ob.w / 2, ob.y + ob.h / 2, run.feverTimer > 0 ? '#ffe866' : '#59e8ff', false);
          Renderer.spawnFloater(run.feverTimer > 0 ? '돌파 +150!' : '스피드 돌파 +120!', run.feverTimer > 0 ? '#ffe866' : '#6ef2ff', ob.x, ob.y);
          continue;
        } else if (run.invulnTimer <= 0) {
          handleObstacleHit(ob, ch);
        }
      } else {
        // Clean Dodge Feedback & Sound when passing an obstacle unscathed!
        if (!ob.passed && ob.x + ob.w < pBox.x - 4) {
          ob.passed = true;
          run.dodgesTotal = (run.dodgesTotal || 0) + 1;
          run.dodgeCombo += 1;
          if (run.dodgeCombo > run.maxDodgeCombo) run.maxDodgeCombo = run.dodgeCombo;
          run.score += Math.round(15 * run.scoreMult * upgradeScoreMult);
          SFX.dodge();
          if (run.dodgeCombo > 0 && run.dodgeCombo % 5 === 0) {
            const comboBonus = Math.round(60 * run.scoreMult * upgradeScoreMult);
            run.score += comboBonus;
            Renderer.spawnFloater(`${run.dodgeCombo}연속 회피! +${comboBonus}`, '#9ef5ff', run.playerX + 12, run.playerY - 48);
          }
        }
        if (ch.nearMissBonus && !ob.nearMissed && ob.x + ob.w < pBox.x) {
          ob.nearMissed = true;
          const vertDist = Math.min(Math.abs(pBox.y - (oBox.y + oBox.h)), Math.abs((pBox.y + pBox.h) - oBox.y));
          if (vertDist < 28) {
            run.score += Math.round(120 * upgradeScoreMult);
            run.gold += 2;
            SFX.coin();
            Renderer.spawnFloater('NEAR MISS +2G!', '#ff9ce6', run.playerX + 10, run.playerY - 45);
          }
        }
      }

      if (ob.x + ob.w < -45) run.obstacles.splice(i, 1);
    }

    if (run.hp <= 0) {
      updateRunHud();
      startDyingSequence();
      return;
    }

    updateRunHud();
  }

  function startDyingSequence() {
    run.active = false;
    run.dying = true;
    run.dead = true;
    run.deathAnimTimer = 0.58;
    run.sliding = false;
    run.umbrellaOn = false;
    run.maskOn = false;
    el.mudOverlay.classList.add('hidden');
    el.runCanvasWrap.classList.remove('fever-active');
    SFX.setBgmMode('menu');
    SFX.fail();
    triggerCameraShake(8, 0.3);
  }

  function handleObstacleHit(ob, ch) {
    if (run.shield) {
      run.shield = false;
      run.invulnTimer = 1.25;
      SFX.guard();
      Renderer.spawnFloater('기상 보호막 방어!', '#82e2ff', run.playerX + 10, run.playerY - 44);
      return;
    }

    // Every obstacle hit ALWAYS deducts exactly 1 heart!
    run.hp = Math.max(0, run.hp - 1);
    run.invulnTimer = 1.5 + (ch.extraInvuln || 0) + save.upgrades.defense * 0.2;
    run.hitPoseTimer = 0.45;
    run.hitFlashTimer = 0.3;
    run.hitStopTimer = 0.055;
    run.squashX = 1.24;
    run.squashY = 0.78;
    run.dodgeCombo = 0;
    triggerCameraShake(7, 0.28);
    haptic(35);

    const seasonName = DATA.SEASONS[run.seasonIdx].name;
    if (run.weatherEvent === 'ice_road' && !ch.iceMastery) {
      run.lastHitCause = `${run.year}년 차 겨울 빙판에서 미끄러져 '${ob.name}'에 부딪혔습니다!`;
    } else {
      run.lastHitCause = `${run.year}년 차 ${seasonName}, '${ob.name}'에 부딪혀 쓰러졌습니다!`;
    }

    SFX.hit();
    Renderer.spawnFloater('-1 ❤️', '#ff5c5c', run.playerX, run.playerY - 42);
  }

  function updateRunHud() {
    if (!run) return;
    const ch = getCharDef(run.charId);
    const diff = DATA.getYearDifficulty(run.year);
    const seasonObj = DATA.SEASONS[run.seasonIdx];

    el.runYearNum.textContent = `${run.year}Y`;
    const yrTier = run.year >= 4 ? 'yr-4' : (run.year === 3 ? 'yr-3' : (run.year === 2 ? 'yr-2' : 'yr-1'));
    el.runYearNum.className = `portrait-yr-badge ${yrTier}`;
    el.runSeasonLabel.textContent = `${run.year}년 차 ${seasonObj.name}`;
    el.runScoreText.textContent = `${run.distanceM.toLocaleString('ko-KR')}m · ${Math.floor(run.score).toLocaleString('ko-KR')}점`;
    el.runGoldText.textContent = run.gold.toLocaleString('ko-KR');

    // Exact Heart-Based HP Rendering (1 heart = 1 hit!)
    const curHp = Math.max(0, Math.round(run.hp));
    const maxHp = Math.max(1, Math.round(run.maxHp));
    const heartKey = `${curHp}/${maxHp}`;
    if (run.lastHeartKey !== heartKey) {
      run.lastHeartKey = heartKey;
      el.runHearts.classList.toggle('compact', maxHp >= 7);
      let heartHtml = '';
      for (let i = 0; i < maxHp; i++) {
        heartHtml += `<span class="heart-unit${i < curHp ? '' : ' empty'}">❤️</span>`;
      }
      el.runHearts.innerHTML = heartHtml;
    }
    el.runHpText.textContent = heartKey;

    // Rainbow FEVER Gauge
    const feverPct = Math.max(0, Math.min(100, run.feverCharge));
    el.runFeverFill.style.width = `${feverPct.toFixed(1)}%`;
    el.runFeverText.textContent = run.feverTimer > 0
      ? `★ FEVER! ${run.feverTimer.toFixed(1)}s`
      : `★ FEVER ${Math.floor(feverPct)}%`;

    const yearPct = ((run.elapsed % DATA.YEAR_DURATION) / DATA.YEAR_DURATION) * 100;
    el.runYearFill.style.width = `${yearPct.toFixed(1)}%`;

    // Weather Forecast Strip (KMA Fake vs Norway Yr.no Accurate!)
    const isNorway = hasNorwayForecast();
    el.fcSourceBadge.className = `fc-badge ${isNorway ? 'norway' : 'kma'}`;
    el.fcSourceBadge.textContent = isNorway
      ? (run.norwayPermanent ? '🇳🇴 노르웨이' : `🇳🇴 노르웨이 ${Math.ceil(run.norwayTimer)}s`)
      : '📡 K-기상청';

    el.runForecastBar.classList.toggle('norway-on', isNorway);
    el.runForecastBar.classList.toggle('fake-shock', run.fakeShockTimer > 0 && !isNorway);

    if (run.pendingWeather) {
      const targetDef = DATA.WEATHER_EVENTS[run.pendingWeather];
      const sec = Math.max(0.1, run.forecastCountdown).toFixed(1);
      if (isNorway) {
        el.fcMessage.textContent = `[${sec}초 후] ${targetDef.norwayWarn}`;
      } else if (run.forecastIsFake) {
        el.fcMessage.textContent = `예보: ${targetDef.kmaFake}`;
      } else {
        el.fcMessage.textContent = `예보(${sec}s): ${targetDef.label}`;
      }
    } else {
      const curDef = DATA.WEATHER_EVENTS[run.weatherEvent] || DATA.WEATHER_EVENTS.clear;
      el.fcMessage.textContent = run.fakeShockTimer > 0
        ? `오보 발생!! 현재 [${curDef.label}]`
        : `현재: ${curDef.label}`;
    }

    // Live Exposure Countdown / Heat Warning Pill!
    const rainLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    if (run.rainExposeTimer > 0.05 && !run.umbrellaOn && run.feverTimer <= 0) {
      const rem = Math.max(0, rainLimit - run.rainExposeTimer);
      el.fcHeatPill.classList.remove('hidden');
      el.fcHeatPill.classList.toggle('urgent', rem <= 1.3);
      el.fcHeatPill.textContent = `☂️ 우산 필요 ${rem.toFixed(1)}s`;
    } else if (run.dustExposeTimer > 0.05 && !run.maskOn && run.feverTimer <= 0) {
      const rem = Math.max(0, dustLimit - run.dustExposeTimer);
      el.fcHeatPill.classList.remove('hidden');
      el.fcHeatPill.classList.toggle('urgent', rem <= 1.3);
      el.fcHeatPill.textContent = `😷 마스크 필요 ${rem.toFixed(1)}s`;
    } else if (run.weatherEvent === 'heat' || run.heatGauge > 5) {
      el.fcHeatPill.classList.remove('hidden');
      el.fcHeatPill.classList.toggle('urgent', run.heatGauge >= 75);
      el.fcHeatPill.textContent = `🌡️ 열기 ${Math.round(run.heatGauge)}%`;
    } else {
      el.fcHeatPill.classList.add('hidden');
      el.fcHeatPill.classList.remove('urgent');
    }

    // Muddy Water Splash Blindness Overlay
    if (run.mudBlindTimer > 0) {
      el.mudOverlay.classList.remove('hidden');
      el.mudOverlay.style.opacity = Math.min(1, run.mudBlindTimer / 1.0).toFixed(2);
    } else {
      el.mudOverlay.classList.add('hidden');
    }

    // Umbrella & Mask Toggle Buttons with Active Duration & Cooldown Fill Bars
    const effGearCd = getEffectiveGearCooldown();
    const umbBroken = run.umbrellaBrokenTimer > 0;
    const umbCd = !umbBroken && !run.umbrellaOn && run.umbrellaCooldown > 0;
    el.btnToggleUmbrella.classList.toggle('on', run.umbrellaOn);
    el.btnToggleUmbrella.classList.toggle('broken', umbBroken);
    el.btnToggleUmbrella.classList.toggle('cooldown', umbCd);
    if (umbBroken) {
      el.gearUmbrellaState.textContent = `파손 ${Math.ceil(run.umbrellaBrokenTimer)}s`;
      el.gearUmbrellaBar.style.width = `${((run.umbrellaBrokenTimer / UMBRELLA_BROKEN_CD) * 100).toFixed(1)}%`;
    } else if (run.umbrellaOn) {
      el.gearUmbrellaState.textContent = `${run.umbrellaActiveTimer.toFixed(1)}s`;
      el.gearUmbrellaBar.style.width = `${((run.umbrellaActiveTimer / GEAR_DURATION) * 100).toFixed(1)}%`;
    } else if (umbCd) {
      el.gearUmbrellaState.textContent = `쿨 ${Math.ceil(run.umbrellaCooldown)}s`;
      el.gearUmbrellaBar.style.width = `${((run.umbrellaCooldown / effGearCd) * 100).toFixed(1)}%`;
    } else {
      el.gearUmbrellaState.textContent = '우산';
      el.gearUmbrellaBar.style.width = '0%';
    }

    const maskCd = !run.maskOn && run.maskCooldown > 0;
    el.btnToggleMask.classList.toggle('on', run.maskOn);
    el.btnToggleMask.classList.toggle('cooldown', maskCd);
    if (run.maskOn) {
      el.gearMaskState.textContent = `${run.maskActiveTimer.toFixed(1)}s`;
      el.gearMaskBar.style.width = `${((run.maskActiveTimer / GEAR_DURATION) * 100).toFixed(1)}%`;
    } else if (maskCd) {
      el.gearMaskState.textContent = `쿨 ${Math.ceil(run.maskCooldown)}s`;
      el.gearMaskBar.style.width = `${((run.maskCooldown / effGearCd) * 100).toFixed(1)}%`;
    } else {
      el.gearMaskState.textContent = '마스크';
      el.gearMaskBar.style.width = '0%';
    }

    // 5 Status Orbs + Full-Canvas FEVER Frame Pulse + Dynamic BGM Mode
    el.orbUiFever.classList.toggle('active', run.feverTimer > 0);
    el.orbUiSpeed.classList.toggle('active', run.speedBoostTimer > 0);
    el.orbUiMagnet.classList.toggle('active', run.magnetTimer > 0 || run.feverTimer > 0);
    el.orbUiNorway.classList.toggle('active', isNorway);
    el.orbUiShield.classList.toggle('active', Boolean(run.shield));
    el.runCanvasWrap.classList.toggle('fever-active', run.feverTimer > 0);
    SFX.setBgmMode(run.feverTimer > 0 ? 'fever' : 'run');
  }

  function finishRunGameOver() {
    run.active = false;
    run.dying = false;
    run.dead = true;
    el.mudOverlay.classList.add('hidden');
    el.runCanvasWrap.classList.remove('fever-active');
    SFX.setBgmMode('menu');

    ensureTodayMissions();
    commitRunMissionProgress();

    const finalScore = Math.floor(run.score);
    const finalDist = run.distanceM || 0;
    const distGoldBonus = Math.floor(run.elapsed * 0.25);
    const totalGoldEarned = run.gold + distGoldBonus;

    const prevBest = save.bestScore || 0;
    const isNewBest = finalScore > prevBest;
    if (isNewBest) save.bestScore = finalScore;
    if (finalDist > (save.bestDistanceM || 0)) save.bestDistanceM = finalDist;
    if (run.year > save.bestYear) save.bestYear = run.year;
    save.totalCoinsEver = (save.totalCoinsEver || 0) + (run.coinsCollected || 0);
    if ((run.maxDodgeCombo || 0) > (save.maxDodgeComboEver || 0)) {
      save.maxDodgeComboEver = run.maxDodgeCombo;
    }
    save.gold += totalGoldEarned;
    save.playCount += 1;

    // Normal Play Wood Chest Acquisition Path: 400m+ grants 1 Wood Chest into Vault (up to 3/day)
    let gotWoodChest = false;
    if (finalDist >= 400 && (save.dailyWoodChestDrops.count || 0) < 3) {
      save.dailyWoodChestDrops.count = (save.dailyWoodChestDrops.count || 0) + 1;
      save.chestBag.wood = (save.chestBag.wood || 0) + 1;
      gotWoodChest = true;
    }

    persistSave();

    if (el.resBestScore) {
      el.resBestScore.textContent = `${(save.bestScore || 0).toLocaleString('ko-KR')}점`;
    }
    if (el.resNewBest) {
      el.resNewBest.classList.toggle('hidden', !isNewBest);
    }
    el.resScore.textContent = `${finalScore.toLocaleString('ko-KR')}점`;
    el.gameoverOverlay.classList.remove('hidden');

    if (gotWoodChest) {
      showToast(`🪵 400m 돌파! 나무 상자 1개 보관함 획득! (오늘 ${save.dailyWoodChestDrops.count}/3)`);
    }
  }

  function exitRunToHome() {
    SFX.click();
    SFX.setBgmMode('menu');
    if (run) commitRunMissionProgress();
    run = null;
    paused = false;
    el.mudOverlay.classList.add('hidden');
    el.runCanvasWrap.classList.remove('fever-active');
    el.pauseOverlay.classList.add('hidden');
    el.gameoverOverlay.classList.add('hidden');
    el.viewRun.classList.add('hidden');
    switchTab('home');
  }

  // ===================== MAIN LOOP =====================
  let lastTs = performance.now();
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    const t = ts / 1000;

    if (run && !el.viewRun.classList.contains('hidden')) {
      if (run.active && !paused) {
        updateRun(dt);
      } else if (run.dying && !paused) {
        // Brief dramatic collapse animation on the ground before Result Modal appears!
        if (run.shakeTimer > 0) run.shakeTimer = Math.max(0, run.shakeTimer - dt);
        if (run.hitFlashTimer > 0) run.hitFlashTimer = Math.max(0, run.hitFlashTimer - dt);
        const floorY = run.currentFloorY || Renderer.GROUND_Y;
        if (run.playerY < floorY) {
          run.vy = (run.vy || 0) + 1250 * dt;
          run.playerY = Math.min(floorY, run.playerY + run.vy * dt);
        }
        run.deathAnimTimer -= dt;
        if (run.deathAnimTimer <= 0) {
          finishRunGameOver();
        }
      }
      if (run) {
        const animDt = paused || (!run.active && !run.dying) ? 0 : dt;
        Renderer.renderRunFrame(runCtx, run, getCharDef(run.charId), animDt, t);
      }
    } else if (currentTab === 'home') {
      updateHomeRunningHero(t);
    }

    requestAnimationFrame(loop);
  }

  // ===================== EVENT LISTENERS =====================
  function bindControlButton(btn, onDown, onUp) {
    let activePtr = null;
    const down = (e) => {
      e.preventDefault();
      if (activePtr !== null) return;
      activePtr = e.pointerId;
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch {}
      }
      btn.classList.add('pressed');
      onDown();
    };
    const up = (e) => {
      e.preventDefault();
      if (activePtr !== null && e.pointerId !== activePtr) return;
      activePtr = null;
      btn.classList.remove('pressed');
      onUp();
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }

  function setupEvents() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        currentShopSubtab = btn.dataset.shoptab;
        renderShopList();
      });
    });

    el.btnGoldShop.addEventListener('click', () => switchTab('shop'));
    el.btnGemShop.addEventListener('click', () => {
      currentShopSubtab = 'chests';
      switchTab('shop');
    });
    el.btnHomeCharInfo.addEventListener('click', () => openCharDetail(previewCharIdx));
    el.btnHomeBrawlers.addEventListener('click', () => switchTab('chars'));

    // Brawl Stars Quest Subtabs (Daily / Weekly / Achievements / Chest Vault)
    document.querySelectorAll('.bs-qtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        currentQuestSubtab = btn.dataset.qtab;
        renderBrawlQuests();
      });
    });

    // Transparent Probability & Pity Info Modal
    if (el.btnShopProb) el.btnShopProb.addEventListener('click', openProbModal);
    if (el.btnQuestProb) el.btnQuestProb.addEventListener('click', openProbModal);
    if (el.btnCloseProb) {
      el.btnCloseProb.addEventListener('click', () => {
        SFX.click();
        el.probOverlay.classList.add('hidden');
      });
    }
    if (el.probOverlay) {
      el.probOverlay.addEventListener('click', (e) => {
        if (e.target === el.probOverlay) el.probOverlay.classList.add('hidden');
      });
    }

    // 8-Frame Animated Chest Opening Modal
    if (el.btnTapChest) el.btnTapChest.addEventListener('click', triggerChestAnimation);
    if (el.btnChestClose) el.btnChestClose.addEventListener('click', closeChestModal);
    if (el.chestOpenOverlay) {
      el.chestOpenOverlay.addEventListener('click', (e) => {
        if (e.target === el.chestOpenOverlay && activeChestSession && activeChestSession.opened) {
          closeChestModal();
        }
      });
    }

    // 7-Day Attendance Reward Modal (accessible from Missions Tab)
    function openAttendanceModal() {
      SFX.click();
      renderAttendanceUI();
      el.attendanceOverlay.classList.remove('hidden');
    }
    el.btnTabOpenAttendance.addEventListener('click', openAttendanceModal);
    el.btnCloseAttendance.addEventListener('click', () => {
      SFX.click();
      el.attendanceOverlay.classList.add('hidden');
    });
    el.attendanceOverlay.addEventListener('click', (e) => {
      if (e.target === el.attendanceOverlay) {
        el.attendanceOverlay.classList.add('hidden');
      }
    });
    el.btnClaimAttendance.addEventListener('click', claimAttendanceToday);

    // Achievements Modal
    el.btnCloseAchievements.addEventListener('click', () => {
      SFX.click();
      el.achievementsOverlay.classList.add('hidden');
    });
    el.achievementsOverlay.addEventListener('click', (e) => {
      if (e.target === el.achievementsOverlay) {
        el.achievementsOverlay.classList.add('hidden');
      }
    });

    // Brawl Stars Character Detail Modal
    el.btnCloseCharDetail.addEventListener('click', closeCharDetail);
    el.charDetailOverlay.addEventListener('click', (e) => {
      if (e.target === el.charDetailOverlay) closeCharDetail();
    });
    el.btnDetailPrev.addEventListener('click', () => {
      if (detailCharIdx !== null) openCharDetail(detailCharIdx - 1);
    });
    el.btnDetailNext.addEventListener('click', () => {
      if (detailCharIdx !== null) openCharDetail(detailCharIdx + 1);
    });

    // Audio & Landscape Settings Modal
    function openSettingsModal() {
      SFX.click();
      renderSettingsUI();
      el.settingsOverlay.classList.remove('hidden');
    }
    el.btnOpenSettings.addEventListener('click', openSettingsModal);
    el.btnPauseSettings.addEventListener('click', openSettingsModal);
    el.btnCloseSettings.addEventListener('click', () => {
      SFX.click();
      el.settingsOverlay.classList.add('hidden');
    });
    el.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === el.settingsOverlay) {
        el.settingsOverlay.classList.add('hidden');
      }
    });

    function saveAudioState() {
      save.audioSettings = SFX.getSettings();
      persistSave();
      renderSettingsUI();
    }

    el.chkBgmOn.addEventListener('click', () => {
      SFX.toggleBgm();
      SFX.click();
      saveAudioState();
    });
    el.rngBgmVol.addEventListener('input', () => {
      const v = Number(el.rngBgmVol.value) / 100;
      SFX.applySettings({ bgmVol: v, bgmOn: v > 0 });
      saveAudioState();
    });
    el.chkSfxOn.addEventListener('click', () => {
      SFX.toggleSfx();
      SFX.click();
      saveAudioState();
    });
    el.rngSfxVol.addEventListener('input', () => {
      const v = Number(el.rngSfxVol.value) / 100;
      SFX.applySettings({ sfxVol: v, sfxOn: v > 0 });
      saveAudioState();
    });
    el.btnToggleFullscreen.addEventListener('click', toggleLandscapeFullscreen);
    el.btnLandscapeRun.addEventListener('click', toggleLandscapeFullscreen);
    el.btnRotateFullscreen.addEventListener('click', toggleLandscapeFullscreen);

    // Auto-pause run safely if user rotates phone back into portrait!
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const handleOrientationCheck = () => {
      if (portraitMq.matches && run && run.active && !paused) {
        paused = true;
        el.pauseOverlay.classList.remove('hidden');
      }
    };
    if (portraitMq.addEventListener) portraitMq.addEventListener('change', handleOrientationCheck);
    else window.addEventListener('resize', handleOrientationCheck);

    // Auto-pause active run safely when switching apps / backgrounding browser tab!
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && run && run.active && !paused) {
        paused = true;
        el.pauseOverlay.classList.remove('hidden');
      }
    });
    document.addEventListener('fullscreenchange', renderSettingsUI);

    el.btnPrevChar.addEventListener('click', () => {
      SFX.click();
      previewCharIdx = (previewCharIdx - 1 + DATA.CHARACTERS.length) % DATA.CHARACTERS.length;
      const ch = DATA.CHARACTERS[previewCharIdx];
      if (isCharUnlocked(ch.id)) {
        save.selectedChar = ch.id;
        persistSave();
      }
      renderHomeCharStage();
    });

    el.btnNextChar.addEventListener('click', () => {
      SFX.click();
      previewCharIdx = (previewCharIdx + 1) % DATA.CHARACTERS.length;
      const ch = DATA.CHARACTERS[previewCharIdx];
      if (isCharUnlocked(ch.id)) {
        save.selectedChar = ch.id;
        persistSave();
      }
      renderHomeCharStage();
    });

    el.btnPlayStart.addEventListener('click', () => {
      const ch = DATA.CHARACTERS[previewCharIdx];
      if (!isCharUnlocked(ch.id)) {
        buyCharacter(ch, previewCharIdx);
        return;
      }
      save.selectedChar = ch.id;
      persistSave();
      startRun();
    });

    // Runner Controls + Gear Toggles (All 4 use crisp Up/Down sprite swap on press & release!)
    bindControlButton(el.btnJump, doJumpPress, doJumpRelease);
    bindControlButton(el.btnSlide, doSlideStart, doSlideEnd);
    bindControlButton(el.btnToggleUmbrella, toggleUmbrella, () => {});
    bindControlButton(el.btnToggleMask, toggleMask, () => {});

    el.btnPauseRun.addEventListener('click', () => {
      if (!run || !run.active) return;
      SFX.click();
      paused = true;
      el.pauseOverlay.classList.remove('hidden');
    });

    el.btnResumeRun.addEventListener('click', () => {
      SFX.click();
      paused = false;
      el.pauseOverlay.classList.add('hidden');
    });

    el.btnQuitHome.addEventListener('click', exitRunToHome);
    el.btnResultHome.addEventListener('pointerdown', () => el.btnResultHome.classList.add('pressed'));
    el.btnResultHome.addEventListener('pointerup', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('pointercancel', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('pointerleave', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('click', exitRunToHome);

    // Pure Splash Intro (Seoul Winter BG + Logo Only: Auto-Enters & Tap-to-Skip!)
    let introLeaving = false;
    let introAutoTimer = null;

    function scheduleIntroAutoDismiss() {
      if (introAutoTimer) clearTimeout(introAutoTimer);
      introAutoTimer = setTimeout(() => {
        enterFromIntro(true);
      }, 2200);
    }

    function enterFromIntro(isAuto = false) {
      if (introLeaving || el.introOverlay.classList.contains('hidden')) return;
      introLeaving = true;
      if (introAutoTimer) {
        clearTimeout(introAutoTimer);
        introAutoTimer = null;
      }
      if (!isAuto) {
        SFX.introJingle();
        SFX.startBgm();
        SFX.setBgmMode('menu');
      }
      el.introOverlay.classList.add('leaving');
      setTimeout(() => {
        el.introOverlay.classList.add('hidden');
        el.introOverlay.classList.remove('playing', 'leaving');
        introLeaving = false;
      }, 520);
    }

    el.introOverlay.addEventListener('click', () => enterFromIntro(false));
    window.addEventListener('pointerdown', () => {
      SFX.startBgm();
      if (!run || !run.active) SFX.setBgmMode('menu');
    }, { once: true });
    scheduleIntroAutoDismiss();

    // Desktop Keyboard Controls (Space/↑ Jump, ↓ Slide, Q Umbrella, E Mask, Esc Pause)
    window.addEventListener('keydown', (e) => {
      if (!el.introOverlay.classList.contains('hidden')) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          enterFromIntro();
        }
        return;
      }
      if (!run || !run.active) return;
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        el.btnJump.classList.add('pressed');
        doJumpPress();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        el.btnSlide.classList.add('pressed');
        doSlideStart();
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        el.btnToggleUmbrella.classList.add('pressed');
        toggleUmbrella();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        el.btnToggleMask.classList.add('pressed');
        toggleMask();
      } else if (e.code === 'Escape') {
        paused = !paused;
        el.pauseOverlay.classList.toggle('hidden', !paused);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (!run) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        el.btnJump.classList.remove('pressed');
        doJumpRelease();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        el.btnSlide.classList.remove('pressed');
        doSlideEnd();
      } else if (e.code === 'KeyQ') {
        el.btnToggleUmbrella.classList.remove('pressed');
      } else if (e.code === 'KeyE') {
        el.btnToggleMask.classList.remove('pressed');
      }
    });
  }

  // ===================== BOOT =====================
  setupEvents();
  refreshAllMenus();
  try { SFX.introJingle(); } catch {}
  requestAnimationFrame(loop);
})();
