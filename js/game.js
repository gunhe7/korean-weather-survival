(function () {
  const DATA = window.RUN_DATA;
  const SFX = window.SFX;
  const Renderer = window.RunRenderer;
  const ONLINE = window.OnlineService;

  const SAVE_KEY = 'kr_weather_runner_save_v1';
  const SAVE_BACKUP_KEY = 'kr_weather_runner_save_v1_backup';
  const ACTIVE_AUTH_KEY = 'kr_weather_active_auth_v2';
  const GUEST_SAVE_KEY = 'kr_weather_save_v2_guest';
  const RESET_EPOCH_KEY = 'kr_weather_reset_epoch';
  const CURRENT_RESET_EPOCH = '20261121_all_accounts_reset_v1';

  // One-time full wipe of all previously created local accounts, saves, and cached boards!
  let didEpochReset = false;
  try {
    if (localStorage.getItem(RESET_EPOCH_KEY) !== CURRENT_RESET_EPOCH) {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('kr_weather_') || k.startsWith('firebase:'))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
      localStorage.setItem(RESET_EPOCH_KEY, CURRENT_RESET_EPOCH);
      didEpochReset = true;
    }
  } catch {}

  function getAccountSaveKey(auth) {
    if (auth && (auth.provider === 'google' || auth.provider === 'apple') && auth.uid) {
      return `kr_weather_save_v2_acc_${auth.uid}`;
    }
    return GUEST_SAVE_KEY;
  }

  function loadActiveAuth() {
    try {
      const raw = localStorage.getItem(ACTIVE_AUTH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    // Check legacy v1 save auth once (only restore if verified OAuth or previously logged in)
    try {
      const leg = localStorage.getItem(SAVE_KEY);
      if (leg) {
        const p = JSON.parse(leg);
        if (p && p.auth && p.auth.loggedIn && p.auth.provider === 'guest') {
          return { loggedIn: false, provider: 'guest', uid: p.auth.uid || '', nickname: '게스트', email: '' };
        }
      }
    } catch {}
    return { loggedIn: false, provider: 'guest', uid: '', nickname: '', email: '' };
  }

  function persistActiveAuth(authObj) {
    try {
      localStorage.setItem(ACTIVE_AUTH_KEY, JSON.stringify(authObj || { loggedIn: false, provider: 'guest', uid: '', nickname: '', email: '' }));
    } catch {}
  }

  let activeAuth = loadActiveAuth();

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getWeekKey() {
    if (ONLINE && ONLINE.getWeekInfo) return ONLINE.getWeekInfo().weekKey;
    const d = new Date();
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  const ASSET_VER = '20261121hd56';

  function ticketIconHtml(cls = '') {
    return `<img src="assets/ui/gacha_ticket.png?v=${ASSET_VER}" alt="뽑기권" class="ticket-ico${cls ? ` ${cls}` : ''}" />`;
  }

  function getSpawnRight() {
    return (Renderer && Renderer.getSpawnX) ? Renderer.getSpawnX() : Renderer.W;
  }

  // Detect iOS / iPadOS Home-Screen PWA (black-translucent status bar safe clearance)
  try {
    const isIosPwa = Boolean(window.navigator && window.navigator.standalone === true);
    if (isIosPwa) document.documentElement.classList.add('ios-standalone');
  } catch {}

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

  // ===================== PERSISTENT PER-ACCOUNT SAVE DATA (LOCAL + FIREBASE CLOUD) =====================
  function parseStorageJson(key) {
    try {
      const str = localStorage.getItem(key);
      if (!str) return null;
      const parsed = JSON.parse(str);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function hydrateSaveData(raw, authProfile) {
    const today = getTodayKey();
    const week = getWeekKey();
    const cleanAuth = {
      loggedIn: false,
      provider: 'guest',
      uid: '',
      nickname: '',
      email: '',
      ...(authProfile || {})
    };
    const def = {
      gold: 80,
      gems: 0,
      unlockedChars: ['umbrella_master'],
      selectedChar: 'umbrella_master',
      charLevels: createDefaultCharLevels(),
      unlockedSkins: [],
      equippedSkins: {},
      chestBag: { wood: 0, silver: 0, gold: 0, diamond: 0 },
      gachaTickets: 0,
      mileage: 0,
      gachaHistory: [],
      pity: { gold: 0, diamond: 0 },
      dailyWoodChestDrops: { date: today, count: 0 },
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
      scoreRoadClaimed: {},
      tutorialDone: false,
      cloudUpdatedAt: 0,
      audioSettings: { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.45 },
      auth: cleanAuth,
      weeklyRank: { weekKey: week, bestScore: 0, bestDist: 0, bestYear: 1, history: {}, claimedWeeks: [] }
    };

    if (!raw || typeof raw !== 'object') return def;

    const validIds = new Set(DATA.CHARACTERS.map((c) => c.id));
    const mergedLevels = { ...createDefaultCharLevels(), ...(raw.charLevels || {}) };
    if (raw.charLevels && raw.charLevels.basic > (mergedLevels.umbrella_master || 1)) {
      mergedLevels.umbrella_master = raw.charLevels.basic;
    }
    delete mergedLevels.basic;

    const toSafeArray = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
    const rawUnlocked = toSafeArray(raw.unlockedChars).filter((id) => validIds.has(id));
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
      unlockedSkins: toSafeArray(raw.unlockedSkins).filter((id) => typeof id === 'string'),
      equippedSkins: raw.equippedSkins && typeof raw.equippedSkins === 'object' ? { ...raw.equippedSkins } : {},
      chestBag: { wood: 0, silver: 0, gold: 0, diamond: 0, ...(raw.chestBag || {}) },
      gachaTickets: typeof raw.gachaTickets === 'number' && Number.isFinite(raw.gachaTickets) ? Math.max(0, Math.floor(raw.gachaTickets)) : 0,
      mileage: typeof raw.mileage === 'number' && Number.isFinite(raw.mileage) ? Math.max(0, Math.floor(raw.mileage)) : 0,
      gachaHistory: toSafeArray(raw.gachaHistory).filter((x) => x && typeof x === 'object').slice(0, 50),
      pity: { gold: 0, diamond: 0, ...(raw.pity || {}) },
      dailyWoodChestDrops: { date: today, count: Number(rawDrops.count) || 0 },
      boosters: { ...def.boosters, ...(raw.boosters || {}) },
      bestScore: typeof raw.bestScore === 'number' && Number.isFinite(raw.bestScore) ? Math.max(0, Math.floor(raw.bestScore)) : 0,
      bestYear: typeof raw.bestYear === 'number' && Number.isFinite(raw.bestYear) ? Math.max(1, Math.floor(raw.bestYear)) : 1,
      bestDistanceM: typeof raw.bestDistanceM === 'number' && Number.isFinite(raw.bestDistanceM) ? Math.max(0, Math.floor(raw.bestDistanceM)) : 0,
      totalCoinsEver: typeof raw.totalCoinsEver === 'number' && Number.isFinite(raw.totalCoinsEver) ? Math.max(0, Math.floor(raw.totalCoinsEver)) : 0,
      maxDodgeComboEver: typeof raw.maxDodgeComboEver === 'number' && Number.isFinite(raw.maxDodgeComboEver) ? Math.max(0, Math.floor(raw.maxDodgeComboEver)) : 0,
      playCount: typeof raw.playCount === 'number' && Number.isFinite(raw.playCount) ? Math.max(0, Math.floor(raw.playCount)) : 0,
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
      scoreRoadClaimed: { ...(raw.scoreRoadClaimed || {}) },
      tutorialDone: Boolean(raw.tutorialDone || (Number(raw.playCount) || 0) > 0 || (Number(raw.bestScore) || 0) > 0),
      cloudUpdatedAt: typeof raw.cloudUpdatedAt === 'number' && Number.isFinite(raw.cloudUpdatedAt) ? Math.max(0, Math.floor(raw.cloudUpdatedAt)) : 0,
      audioSettings: { ...def.audioSettings, ...(raw.audioSettings || {}) },
      auth: {
        ...cleanAuth,
        // Preserve custom saved nickname for this account if one was previously set
        nickname: (raw.auth && raw.auth.nickname) ? raw.auth.nickname : cleanAuth.nickname
      },
      weeklyRank: (() => {
        const wr = raw.weeklyRank && typeof raw.weeklyRank === 'object' ? raw.weeklyRank : {};
        const hist = { ...(wr.history || {}) };
        if (wr.weekKey && wr.weekKey !== week && (wr.bestScore || 0) > 0) {
          hist[wr.weekKey] = {
            score: wr.bestScore || 0,
            dist: wr.bestDist || 0,
            year: wr.bestYear || 1
          };
        }
        const sameWeek = wr.weekKey === week;
        return {
          weekKey: week,
          bestScore: sameWeek ? (Number(wr.bestScore) || 0) : 0,
          bestDist: sameWeek ? (Number(wr.bestDist) || 0) : 0,
          bestYear: sameWeek ? (Number(wr.bestYear) || 1) : 1,
          history: hist,
          claimedWeeks: toSafeArray(wr.claimedWeeks).filter((w) => typeof w === 'string')
        };
      })()
    };
  }

  function loadSaveForAuth(authProfile) {
    const slotKey = getAccountSaveKey(authProfile);
    let raw = parseStorageJson(slotKey);
    // Safe one-time migration from legacy v1 key so existing players never lose skins/gold/gems!
    if (!raw && slotKey === GUEST_SAVE_KEY) {
      raw = parseStorageJson(SAVE_KEY) || parseStorageJson(SAVE_BACKUP_KEY);
    }
    return hydrateSaveData(raw, authProfile);
  }

  let save = loadSaveForAuth(activeAuth);
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

  let cloudSaveTimer = null;
  let cloudHydratedUid = '';
  let cloudSyncInFlight = false;
  let lastCloudPullAt = 0;

  function persistSave(immediateCloud = false, opts = {}) {
    if (!opts.keepTimestamp) {
      save.cloudUpdatedAt = Date.now();
    }
    try {
      const slotKey = getAccountSaveKey(save.auth || activeAuth);
      const json = JSON.stringify(save);
      localStorage.setItem(slotKey, json);
      if (slotKey === GUEST_SAVE_KEY) {
        localStorage.setItem(SAVE_KEY, json);
        localStorage.setItem(SAVE_BACKUP_KEY, json);
      }
      if (save.auth) {
        activeAuth = { ...save.auth };
        persistActiveAuth(activeAuth);
      }
    } catch {
      // ignore storage errors
    }

    if (opts.localOnly) return;

    // Auto cloud backup to Firebase /user_saves/{uid} ONLY after initial cloud pull completed for this UID!
    // (Prevents a freshly opened device with stale localStorage from ever overwriting newer cloud progress!)
    const auth = save.auth;
    if (ONLINE && auth && auth.loggedIn && ONLINE.isRankedProvider(auth.provider) && auth.uid) {
      if (!opts.forceCloud && cloudHydratedUid !== auth.uid) {
        return;
      }
      if (cloudSaveTimer) {
        clearTimeout(cloudSaveTimer);
        cloudSaveTimer = null;
      }
      if (immediateCloud) {
        try { ONLINE.saveCloudUserSave(auth.uid, save); } catch {}
      } else {
        const uidSnap = auth.uid;
        cloudSaveTimer = setTimeout(() => {
          cloudSaveTimer = null;
          if (save.auth && save.auth.uid === uidSnap && ONLINE.isRankedProvider(save.auth.provider) && cloudHydratedUid === uidSnap) {
            try { ONLINE.saveCloudUserSave(uidSnap, save); } catch {}
          }
        }, 900);
      }
    }
  }

  // ===================== APP UI STATE =====================
  let currentTab = 'home';
  let currentShopSubtab = 'gacha';
  let currentQuestSubtab = 'daily';
  let previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));
  let detailCharIdx = null;
  let lastHomeHeroSrc = '';

  // ===================== ACTIVE RUN STATE =====================
  let run = null;
  let paused = false;

  // ===================== DOM REFERENCES =====================
  const el = {
    introOverlay: document.getElementById('intro-overlay'),
    introLoginBox: document.getElementById('intro-login-box'),
    btnIntroGoogle: document.getElementById('btn-intro-google'),
    btnIntroGuest: document.getElementById('btn-intro-guest'),
    introStartBox: document.getElementById('intro-start-box'),
    introAccBadge: document.getElementById('intro-acc-badge'),
    introAccName: document.getElementById('intro-acc-name'),
    btnIntroSwitchAcc: document.getElementById('btn-intro-switch-acc'),

    loginOverlay: document.getElementById('login-overlay'),
    btnCloseLogin: document.getElementById('btn-close-login'),
    loginMainPanel: document.getElementById('login-main-panel'),
    loginCurBadge: document.getElementById('login-cur-badge'),
    loginCurName: document.getElementById('login-cur-name'),
    loginCurSub: document.getElementById('login-cur-sub'),
    btnLoginSync: document.getElementById('btn-login-sync'),
    btnLoginLogout: document.getElementById('btn-login-logout'),
    loginNicknameInput: document.getElementById('login-nickname-input'),
    btnSaveNickname: document.getElementById('btn-save-nickname'),
    btnLoginGoogle: document.getElementById('btn-login-google'),
    btnLoginGuest: document.getElementById('btn-login-guest'),
    loginSetupNotice: document.getElementById('login-setup-notice'),

    btnHeaderProfile: document.getElementById('btn-header-profile'),
    btnHeaderProfileName: document.getElementById('btn-header-profile-name'),
    hdrProfileAvatar: document.getElementById('hdr-profile-avatar'),
    hdrProfileRank: document.getElementById('hdr-profile-rank'),
    hdrProfileBadge: document.getElementById('hdr-profile-badge'),
    hdrProfileName: document.getElementById('hdr-profile-name'),
    btnScoreRoad: document.getElementById('btn-score-road'),
    hdrScoreRoadDot: document.getElementById('hdr-score-road-dot'),
    headerBestScore: document.getElementById('header-best-score'),
    hdrTrophyFill: document.getElementById('hdr-trophy-fill'),
    hdrTrophyNext: document.getElementById('hdr-trophy-next'),
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
    settingsAccountBadge: document.getElementById('settings-account-badge'),
    settingsAccountName: document.getElementById('settings-account-name'),
    settingsAccountSub: document.getElementById('settings-account-sub'),
    btnSettingsSwitchLogin: document.getElementById('btn-settings-switch-login'),
    btnReplayTutorial: document.getElementById('btn-replay-tutorial'),
    btnSettingsOk: document.getElementById('btn-settings-ok'),

    homeHeroStage: document.getElementById('home-hero-stage'),
    homeHeroAura: document.getElementById('home-hero-aura'),
    homeHeroImg: document.getElementById('home-hero-img'),
    btnHomeCharInfo: document.getElementById('btn-home-char-info'),
    homeCharName: document.getElementById('home-char-name'),
    homeCharLvBadge: document.getElementById('home-char-lv-badge'),
    homeCharTier: document.getElementById('home-char-tier'),
    btnHomeVault: document.getElementById('btn-home-vault'),
    homeVaultCount: document.getElementById('home-vault-count'),
    homeVaultDot: document.getElementById('home-vault-dot'),
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
    questResetLabel: document.getElementById('quest-reset-label'),
    pityGoldChip: document.getElementById('pity-gold-chip'),
    pityDiamondChip: document.getElementById('pity-diamond-chip'),
    bsQuestGrid: document.getElementById('bs-quest-grid'),

    rankLivePill: document.getElementById('rank-live-pill'),
    rankOnlineCount: document.getElementById('rank-online-count'),
    btnRankRefresh: document.getElementById('btn-rank-refresh'),
    rankWeekLabel: document.getElementById('rank-week-label'),
    rankWeekCountdown: document.getElementById('rank-week-countdown'),
    rankLastWinner: document.getElementById('rank-last-winner'),
    rankGuestBanner: document.getElementById('rank-guest-banner'),
    btnRankLinkAccount: document.getElementById('btn-rank-link-account'),
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
    runWeatherBar: document.getElementById('run-weather-bar'),
    weatherStatusBadge: document.getElementById('weather-status-badge'),
    weatherStatusTip: document.getElementById('weather-status-tip'),
    fcHeatPill: document.getElementById('fc-heat-pill'),
    mudOverlay: document.getElementById('mud-splatter-overlay'),
    runBanner: document.getElementById('run-banner'),
    weatherCenterAlert: document.getElementById('weather-center-alert'),
    weatherAlertTitle: document.getElementById('weather-alert-title'),
    weatherAlertSub: document.getElementById('weather-alert-sub'),

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
    btnChestStore: document.getElementById('btn-chest-store'),
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

    iapOverlay: document.getElementById('iap-overlay'),
    btnCloseIap: document.getElementById('btn-close-iap'),
    iapPackName: document.getElementById('iap-pack-name'),
    iapPackGems: document.getElementById('iap-pack-gems'),
    iapPackPrice: document.getElementById('iap-pack-price'),
    iapPayNote: document.getElementById('iap-pay-note'),
    btnIapCancel: document.getElementById('btn-iap-cancel'),
    btnIapConfirm: document.getElementById('btn-iap-confirm'),

    weeklyChampOverlay: document.getElementById('weekly-champ-overlay'),
    weeklyChampWeek: document.getElementById('weekly-champ-week'),
    weeklyChampScore: document.getElementById('weekly-champ-score'),
    weeklyChampGems: document.getElementById('weekly-champ-gems'),
    btnClaimWeeklyChamp: document.getElementById('btn-claim-weekly-champ'),

    scoreRoadOverlay: document.getElementById('score-road-overlay'),
    scoreRoadBestVal: document.getElementById('score-road-best-val'),
    scoreRoadTrack: document.getElementById('score-road-track'),
    btnScoreRoadClaimAll: document.getElementById('btn-score-road-claim-all'),
    btnCloseScoreRoad: document.getElementById('btn-close-score-road'),

    vaultOverlay: document.getElementById('vault-overlay'),
    vaultTotalPill: document.getElementById('vault-total-pill'),
    vaultTicketPill: document.getElementById('vault-ticket-pill'),
    btnVaultGoGacha: document.getElementById('btn-vault-go-gacha'),
    vaultModalGrid: document.getElementById('vault-modal-grid'),
    btnCloseVault: document.getElementById('btn-close-vault'),

    gachaWishOverlay: document.getElementById('gacha-wish-overlay'),
    gachaWishCanvas: document.getElementById('gacha-wish-canvas'),
    gachaWishFlash: document.getElementById('gacha-wish-flash'),
    gachaWishBanner: document.getElementById('gacha-wish-banner'),
    btnGachaWishSkip: document.getElementById('btn-gacha-wish-skip'),

    gachaResultOverlay: document.getElementById('gacha-result-overlay'),
    gachaResTitle: document.getElementById('gacha-res-title'),
    gachaResMileage: document.getElementById('gacha-res-mileage'),
    gachaResGrid: document.getElementById('gacha-res-grid'),
    gachaResSummary: document.getElementById('gacha-res-summary'),
    btnGachaResEquip: document.getElementById('btn-gacha-res-equip'),
    btnGachaResAgain: document.getElementById('btn-gacha-res-again'),
    btnGachaResClose: document.getElementById('btn-gacha-res-close'),

    gachaHistoryOverlay: document.getElementById('gacha-history-overlay'),
    btnCloseGachaHistory: document.getElementById('btn-close-gacha-history'),
    gachaHistoryList: document.getElementById('gacha-history-list'),

    tutRunHud: document.getElementById('tut-run-hud'),
    tutRunStepPill: document.getElementById('tut-run-step-pill'),
    tutRunTitle: document.getElementById('tut-run-title'),
    tutRunSub: document.getElementById('tut-run-sub'),
    btnTutRunSkip: document.getElementById('btn-tut-run-skip'),
    tutRunActionCallout: document.getElementById('tut-run-action-callout'),
    tutRunDots: document.getElementById('tut-run-dots'),
    tutCompleteOverlay: document.getElementById('tut-complete-overlay'),
    tutCompleteReward: document.getElementById('tut-complete-reward'),
    btnTutDoneHome: document.getElementById('btn-tut-done-home'),
    btnTutDonePlay: document.getElementById('btn-tut-done-play'),

    globalToast: document.getElementById('global-toast')
  };

  const runCtx = el.runCanvas.getContext('2d', { alpha: false, desynchronized: true }) || el.runCanvas.getContext('2d');

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
    return DATA.getCharEffectiveStats(charDef, getCharLevel(charDef.id), save.unlockedChars.length);
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
      return { skin: skinDef.customAnimSkin, frames: skinDef.customRunFrames || skinDef.customAnimFrames || 4 };
    }
    return { skin: charDef.animSkin || 'yellow', frames: charDef.runFrames || charDef.animFrames || 2 };
  }

  function getTotalBagChests() {
    const b = save.chestBag || {};
    return (b.wood || 0) + (b.silver || 0) + (b.gold || 0) + (b.diamond || 0);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // ===================== CHEST & SKIN GACHA ENGINE (4 RARITIES · MILEAGE · TICKETS!) =====================
  function getSkinMileagePrice(sk) {
    if (!sk) return 10;
    if (typeof sk.mileagePrice === 'number' && sk.mileagePrice > 0) return sk.mileagePrice;
    const rar = DATA.SKIN_RARITIES[sk.rarity];
    return (rar && rar.mileagePrice) || 10;
  }

  function computeGachaCost(count) {
    const c = Math.max(1, Math.floor(count || 1));
    const tickets = Math.max(0, Math.floor(save.gachaTickets || 0));
    const gemPerPull = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.gemCostPerPull) || 200;
    const useTickets = Math.min(tickets, c);
    const needGems = (c - useTickets) * gemPerPull;
    const canAfford = (save.gems || 0) >= needGems;
    return { count: c, useTickets, needGems, canAfford };
  }

  function rollOneGachaSkin() {
    const rates = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.rates) || { rare: 70, epic: 20, legendary: 8, mythic: 2 };
    const order = ['rare', 'epic', 'legendary', 'mythic'];
    const totalW = order.reduce((s, k) => s + (rates[k] || 0), 0) || 100;
    const r = Math.random() * totalW;
    let acc = 0;
    let hitRarity = 'rare';
    for (const k of order) {
      acc += rates[k] || 0;
      if (r < acc) { hitRarity = k; break; }
    }

    let pool = DATA.SKINS.filter((s) => s.rarity === hitRarity);
    if (pool.length === 0) {
      // Gracefully fall back to rare skins if an intermediate tier has no skins yet (Mythic stays strictly at its exact rate!)
      pool = DATA.SKINS.filter((s) => s.rarity === 'rare');
      if (pool.length === 0) pool = DATA.SKINS;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const alreadyOwned = save.unlockedSkins.includes(picked.id);
    const milGain = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.mileagePerPull) || 2;
    let dupMileage = 0;
    if (!alreadyOwned) {
      save.unlockedSkins.push(picked.id);
    } else {
      // Duplicate skin in Skin Gacha awards +2 extra Mileage!
      dupMileage = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.dupMileageBonus) || 2;
    }

    save.mileage = (save.mileage || 0) + milGain + dupMileage;
    if (!Array.isArray(save.gachaHistory)) save.gachaHistory = [];
    save.gachaHistory.unshift({
      skinId: picked.id,
      name: picked.name,
      rarity: picked.rarity,
      isNew: !alreadyOwned,
      dupMileage,
      dupGold: 0,
      at: Date.now()
    });
    if (save.gachaHistory.length > 50) save.gachaHistory.length = 50;

    return { skin: picked, rarity: picked.rarity, isNew: !alreadyOwned, dupMileage, dupGold: 0, milGain };
  }

  // ===================== GENSHIN IMPACT STYLE SHOOTING STAR WISH ANIMATION =====================
  let activeWishAnim = null;

  function finishActiveWishAnimation(skipped = false) {
    if (!activeWishAnim) return;
    const sess = activeWishAnim;
    activeWishAnim = null;
    if (sess.rafId) cancelAnimationFrame(sess.rafId);
    if (el.gachaWishOverlay) el.gachaWishOverlay.classList.add('hidden');
    if (el.gachaWishBanner) {
      el.gachaWishBanner.classList.add('hidden');
      el.gachaWishBanner.className = 'gacha-wish-banner hidden';
    }
    if (el.gachaWishFlash) {
      el.gachaWishFlash.style.opacity = '0';
    }
    if (skipped) {
      try { SFX.click(); } catch {}
      const hasBig = sess.results.some((x) => x.rarity === 'mythic' || x.rarity === 'legendary' || x.isNew);
      if (hasBig) SFX.chestJackpot();
      else SFX.chestOpen();
    }
    showGachaResultModal(sess.results, sess.count);
  }

  function playGachaWishAnimation(results, count) {
    if (!el.gachaWishOverlay || !el.gachaWishCanvas) {
      showGachaResultModal(results, count);
      return;
    }
    if (activeWishAnim && activeWishAnim.rafId) {
      cancelAnimationFrame(activeWishAnim.rafId);
    }

    const rarRank = { rare: 1, epic: 2, legendary: 3, mythic: 4 };
    let bestRarity = 'rare';
    results.forEach((r) => {
      if ((rarRank[r.rarity] || 1) > (rarRank[bestRarity] || 1)) bestRarity = r.rarity;
    });

    const PALETTES = {
      rare:      { main: '#4ad8ff', trail: '#1b88ff', alt: '#b3f2ff', flash: 'rgba(180, 240, 255, 0.92)', label: '✦ 희귀 스킨 소환! ✦' },
      epic:      { main: '#d27bff', trail: '#8a35ff', alt: '#f5c7ff', flash: 'rgba(232, 196, 255, 0.94)', label: '★ 영웅 스킨 출현! ★' },
      legendary: { main: '#ffd545', trail: '#ff9614', alt: '#fff5b3', flash: 'rgba(255, 244, 196, 0.97)', label: '★★ 전설 스킨 강림! ★★' },
      mythic:    { main: '#ff5eb8', trail: '#a855f7', alt: '#ffe46b', flash: 'rgba(255, 224, 246, 0.98)', label: '✦ 신화 MYTHIC 스킨 강림!! ✦' }
    };
    const initPal = PALETTES.rare;
    const targetPal = PALETTES[bestRarity] || PALETTES.rare;

    el.gachaWishOverlay.classList.remove('hidden');
    if (el.gachaWishFlash) {
      el.gachaWishFlash.style.background = targetPal.flash;
      el.gachaWishFlash.style.opacity = '0';
    }
    if (el.gachaWishBanner) {
      el.gachaWishBanner.textContent = targetPal.label;
      el.gachaWishBanner.className = `gacha-wish-banner rar-${bestRarity} hidden`;
    }

    const canvas = el.gachaWishCanvas;
    const isMobWish = Boolean(Renderer && Renderer.IS_MOBILE);
    const dpr = isMobWish ? Math.min(1.5, window.devicePixelRatio || 1) : Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(320, el.gachaWishOverlay.clientWidth || window.innerWidth || 960);
    const H = Math.max(240, el.gachaWishOverlay.clientHeight || window.innerHeight || 540);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');

    // Background twinkling cosmos + soft horizon clouds
    const bgStars = Array.from({ length: isMobWish ? 68 : 110 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.92,
      r: 0.7 + Math.random() * 1.9,
      phase: Math.random() * Math.PI * 2,
      spd: 2.2 + Math.random() * 3.8,
      cross: Math.random() < 0.14
    }));

    const clouds = Array.from({ length: 9 }, (_, i) => ({
      x: (i / 8) * W * 1.15 - W * 0.08,
      y: H * (0.83 + (i % 3) * 0.045),
      rx: W * (0.14 + (i % 3) * 0.04),
      ry: H * (0.08 + (i % 2) * 0.03),
      drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 4)
    }));

    // Lead meteor Bezier control points (upper-left -> high sky arc -> center impact!)
    const p0 = { x: W * 0.07, y: H * 0.16 };
    const p1 = { x: W * 0.44, y: H * 0.03 };
    const p2 = { x: W * 0.76, y: H * 0.24 };
    const p3 = { x: W * 0.50, y: H * 0.53 };

    function evalCubic(a, b, c, d, u) {
      const m = 1 - u;
      return {
        x: m * m * m * a.x + 3 * m * m * u * b.x + 3 * m * u * u * c.x + u * u * u * d.x,
        y: m * m * m * a.y + 3 * m * m * u * b.y + 3 * m * u * u * c.y + u * u * u * d.y
      };
    }

    // Companion shooting stars for 10-pull meteor shower!
    const companions = [];
    if (count > 1) {
      for (let i = 1; i < Math.min(results.length, 10); i++) {
        const pal = PALETTES[results[i].rarity] || PALETTES.rare;
        const spreadY = ((i % 2 === 0 ? 1 : -1) * (0.035 + (i * 0.011))) * H;
        const spreadX = ((i - 5) * 0.025) * W;
        companions.push({
          delay: 0.08 + i * 0.055,
          pal,
          ox: spreadX,
          oy: spreadY,
          trail: []
        });
      }
    }

    const leadTrail = [];
    const trailSparks = [];
    const burstSparks = [];

    function drawFourPointStar(cx, cy, outerR, innerR, color, alpha, rot = 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? outerR : innerR;
        const ang = (i * Math.PI) / 4;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const SHIFT_T = 0.82;
    const IMPACT_T = 1.72;
    const END_T = 2.62;
    const startMs = performance.now();
    let shiftedSfx = false;
    let impactSfx = false;
    let bannerShown = false;

    const sess = { results, count, rafId: 0 };
    activeWishAnim = sess;

    try { SFX.wishLaunch(); } catch {}

    function frame(nowMs) {
      if (activeWishAnim !== sess) return;
      const t = (nowMs - startMs) / 1000;
      if (t >= END_T) {
        finishActiveWishAnimation(false);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Deep Genshin Twilight-to-Cosmos Night Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, '#020616');
      skyGrad.addColorStop(0.42, '#081438');
      skyGrad.addColorStop(0.78, '#162b63');
      skyGrad.addColorStop(1, '#2a4180');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // Soft Diagonal Milky Way Band
      ctx.save();
      ctx.translate(W * 0.5, H * 0.36);
      ctx.rotate(-0.28);
      const milky = ctx.createRadialGradient(0, 0, 10, 0, 0, W * 0.56);
      milky.addColorStop(0, 'rgba(130, 180, 255, 0.22)');
      milky.addColorStop(0.45, 'rgba(128, 92, 224, 0.12)');
      milky.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = milky;
      ctx.fillRect(-W * 0.7, -H * 0.3, W * 1.4, H * 0.6);
      ctx.restore();

      // Twinkling Cosmic Stars
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i];
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.spd + s.phase));
        ctx.fillStyle = `rgba(235, 246, 255, ${tw.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.cross && tw > 0.72) {
          drawFourPointStar(s.x, s.y, s.r * 4.5, s.r * 0.7, '#ffffff', tw * 0.65);
        }
      }

      // Soft Horizon Sea of Clouds (Genshin Signature Sky!)
      for (let i = 0; i < clouds.length; i++) {
        const cl = clouds[i];
        const cx = cl.x + cl.drift * t;
        const cg = ctx.createRadialGradient(cx, cl.y, 4, cx, cl.y, cl.rx);
        cg.addColorStop(0, 'rgba(154, 198, 255, 0.22)');
        cg.addColorStop(0.55, 'rgba(72, 118, 206, 0.14)');
        cg.addColorStop(1, 'rgba(20, 40, 96, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, cl.y, cl.rx, cl.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trigger Mid-Air Rarity Color Shift!
      if (t >= SHIFT_T && !shiftedSfx) {
        shiftedSfx = true;
        try { SFX.wishColorShift(bestRarity); } catch {}
      }

      const shifted = t >= SHIFT_T;
      const curPal = shifted ? targetPal : initPal;

      // 2. Phase A: Shooting Star Meteor Flight (0 -> IMPACT_T)
      if (t < IMPACT_T) {
        const rawU = Math.max(0, Math.min(1, t / IMPACT_T));
        // Smooth launch -> graceful zenith hang -> blazing dive acceleration!
        const easedU = rawU < 0.5
          ? 2 * rawU * rawU * 0.75 + rawU * 0.25
          : 0.5 + Math.pow((rawU - 0.5) * 2, 1.45) * 0.5;
        const head = evalCubic(p0, p1, p2, p3, Math.min(1, easedU));
        leadTrail.push({ x: head.x, y: head.y, pal: curPal });
        if (leadTrail.length > 34) leadTrail.shift();

        // Spawn glittering stardust along the meteor path
        const sparkCount = shifted && (bestRarity === 'mythic' || bestRarity === 'legendary') ? 4 : 2;
        for (let k = 0; k < sparkCount; k++) {
          trailSparks.push({
            x: head.x + (Math.random() - 0.5) * 18,
            y: head.y + (Math.random() - 0.5) * 18,
            vx: (Math.random() - 0.5) * 65,
            vy: (Math.random() - 0.5) * 65 + 14,
            life: 0.45 + Math.random() * 0.45,
            maxLife: 0.9,
            size: 2.2 + Math.random() * 3.6,
            color: (shifted && bestRarity === 'mythic' && Math.random() < 0.45) ? targetPal.alt : curPal.main
          });
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Companion 10-Pull Shooting Stars
        for (let ci = 0; ci < companions.length; ci++) {
          const cp = companions[ci];
          const cu = (t - cp.delay) / (IMPACT_T - cp.delay * 0.5);
          if (cu <= 0 || cu > 1.05) continue;
          const ce = Math.min(1, cu * cu * 0.65 + cu * 0.35);
          const pos = evalCubic(
            { x: p0.x + cp.ox * 0.8, y: p0.y + cp.oy },
            { x: p1.x + cp.ox,       y: p1.y + cp.oy * 0.8 },
            { x: p2.x + cp.ox * 0.6, y: p2.y + cp.oy * 0.5 },
            { x: p3.x + cp.ox * 0.18, y: p3.y + cp.oy * 0.18 },
            ce
          );
          cp.trail.push(pos);
          if (cp.trail.length > 16) cp.trail.shift();
          const cCol = shifted ? cp.pal.main : initPal.main;
          for (let j = 1; j < cp.trail.length; j++) {
            const frac = j / cp.trail.length;
            ctx.strokeStyle = cCol;
            ctx.globalAlpha = frac * 0.55;
            ctx.lineWidth = Math.max(1.2, frac * 5.5);
            ctx.beginPath();
            ctx.moveTo(cp.trail[j - 1].x, cp.trail[j - 1].y);
            ctx.lineTo(cp.trail[j].x, cp.trail[j].y);
            ctx.stroke();
          }
          drawFourPointStar(pos.x, pos.y, 13, 3.2, '#ffffff', 0.95, t * 4 + ci);
          drawFourPointStar(pos.x, pos.y, 20, 4.5, cCol, 0.72, -t * 3);
        }

        // Lead Meteor Luminous Tapered Ribbon Trail
        ctx.lineCap = 'round';
        for (let j = 1; j < leadTrail.length; j++) {
          const frac = j / leadTrail.length;
          const prev = leadTrail[j - 1];
          const curr = leadTrail[j];
          // Outer halo ribbon
          ctx.strokeStyle = curr.pal.trail;
          ctx.globalAlpha = frac * 0.42;
          ctx.lineWidth = frac * 26;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
          // Mid vivid color beam
          ctx.strokeStyle = curr.pal.main;
          ctx.globalAlpha = frac * 0.78;
          ctx.lineWidth = frac * 12;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
          // White-hot core spine
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = frac * 0.92;
          ctx.lineWidth = frac * 4.5;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
        }

        // Mid-Air Color Shift Expanding Flare Ring (at t = SHIFT_T .. SHIFT_T + 0.45)
        if (t >= SHIFT_T && t < SHIFT_T + 0.48) {
          const st = (t - SHIFT_T) / 0.48;
          const ringR = 16 + st * 135;
          ctx.strokeStyle = targetPal.main;
          ctx.globalAlpha = (1 - st) * 0.92;
          ctx.lineWidth = (1 - st) * 7 + 1.5;
          ctx.beginPath();
          ctx.arc(head.x, head.y, ringR, 0, Math.PI * 2);
          ctx.stroke();
          if (bestRarity === 'mythic' || bestRarity === 'legendary') {
            ctx.strokeStyle = targetPal.alt;
            ctx.globalAlpha = (1 - st) * 0.85;
            ctx.lineWidth = (1 - st) * 4 + 1;
            ctx.beginPath();
            ctx.arc(head.x, head.y, ringR * 0.68, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Glowing Meteor Head + Genshin 4-Point Diamond Lens Flare!
        const headGlow = ctx.createRadialGradient(head.x, head.y, 2, head.x, head.y, shifted ? 74 : 52);
        headGlow.addColorStop(0, '#ffffff');
        headGlow.addColorStop(0.28, curPal.main);
        headGlow.addColorStop(0.62, curPal.trail);
        headGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = headGlow;
        ctx.beginPath();
        ctx.arc(head.x, head.y, shifted ? 74 : 52, 0, Math.PI * 2);
        ctx.fill();

        drawFourPointStar(head.x, head.y, shifted ? 58 : 38, shifted ? 8 : 5, curPal.main, 0.9, t * 2.4);
        drawFourPointStar(head.x, head.y, shifted ? 42 : 28, shifted ? 5 : 3.5, '#ffffff', 1.0, 0);
        ctx.restore();
      } else {
        // 3. Phase B: Supernova Impact & Radiance Burst! (IMPACT_T -> END_T)
        const bt = t - IMPACT_T;
        if (!impactSfx) {
          impactSfx = true;
          try { SFX.wishImpact(bestRarity); } catch {}
          haptic(bestRarity === 'mythic' || bestRarity === 'legendary' ? 32 : 16);
          const cnt = bestRarity === 'mythic' ? 115 : (bestRarity === 'legendary' ? 95 : 70);
          for (let i = 0; i < cnt; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 120 + Math.random() * (Math.max(W, H) * 0.68);
            const colPick = bestRarity === 'mythic'
              ? (i % 3 === 0 ? targetPal.main : (i % 3 === 1 ? targetPal.alt : '#8be8ff'))
              : (i % 2 === 0 ? targetPal.main : targetPal.alt);
            burstSparks.push({
              x: p3.x,
              y: p3.y,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              size: 3 + Math.random() * 6,
              color: colPick,
              rot: Math.random() * Math.PI
            });
          }
        }

        // Show glowing rarity banner right after initial white flash peak
        if (bt >= 0.16 && !bannerShown && el.gachaWishBanner) {
          bannerShown = true;
          el.gachaWishBanner.classList.remove('hidden');
        }

        // Peak screen light bloom
        if (el.gachaWishFlash) {
          const flashAlpha = bt < 0.16
            ? (bt / 0.16) * 0.92
            : Math.max(0, 0.92 * (1 - (bt - 0.16) / 0.56));
          el.gachaWishFlash.style.opacity = flashAlpha.toFixed(3);
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Radiant Supernova Backdrop Halo
        const maxRad = Math.max(W, H) * 0.72;
        const prog = Math.min(1, bt / 0.85);
        const halo = ctx.createRadialGradient(p3.x, p3.y, 4, p3.x, p3.y, maxRad * (0.35 + prog * 0.65));
        halo.addColorStop(0, '#ffffff');
        halo.addColorStop(0.22, targetPal.alt);
        halo.addColorStop(0.55, targetPal.main);
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = Math.max(0, 0.95 - prog * 0.55);
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);

        // Staggered Expanding Shockwave Rings
        const ringCols = bestRarity === 'mythic'
          ? [targetPal.main, targetPal.alt, '#6beeff']
          : [targetPal.main, targetPal.alt, '#ffffff'];
        for (let ri = 0; ri < 3; ri++) {
          const rProg = (bt - ri * 0.08) / 0.68;
          if (rProg <= 0 || rProg >= 1) continue;
          const rRad = 24 + Math.pow(rProg, 0.72) * maxRad * 0.88;
          ctx.strokeStyle = ringCols[ri];
          ctx.globalAlpha = (1 - rProg) * 0.92;
          ctx.lineWidth = (1 - rProg) * 11 + 1.5;
          ctx.beginPath();
          ctx.arc(p3.x, p3.y, rRad, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Giant Rotating Genshin Cross Star Flare
        const flareScale = 1 + prog * 0.55;
        drawFourPointStar(p3.x, p3.y, 190 * flareScale, 18 * flareScale, targetPal.main, Math.max(0, 0.95 - prog * 0.65), bt * 0.7);
        drawFourPointStar(p3.x, p3.y, 130 * flareScale, 12 * flareScale, '#ffffff', Math.max(0, 1 - prog * 0.75), -bt * 0.45);

        // Radial Supernova Stardust Sparks
        for (let i = 0; i < burstSparks.length; i++) {
          const sp = burstSparks[i];
          const damp = Math.pow(0.92, bt * 18);
          const sx = sp.x + sp.vx * bt * (0.55 + 0.45 * damp);
          const sy = sp.y + sp.vy * bt * (0.55 + 0.45 * damp);
          const alpha = Math.max(0, 1 - bt / 0.88);
          drawFourPointStar(sx, sy, sp.size * (1.2 + alpha), sp.size * 0.35, sp.color, alpha, sp.rot + bt * 3);
        }
        ctx.restore();
      }

      // Render drifting trail sparkles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = trailSparks.length - 1; i >= 0; i--) {
        const sp = trailSparks[i];
        sp.x += sp.vx * 0.016;
        sp.y += sp.vy * 0.016;
        sp.life -= 0.016;
        if (sp.life <= 0) {
          trailSparks.splice(i, 1);
          continue;
        }
        const a = Math.max(0, sp.life / sp.maxLife);
        drawFourPointStar(sp.x, sp.y, sp.size * 2.1, sp.size * 0.45, sp.color, a, sp.life * 6);
      }
      ctx.restore();

      ctx.restore();
      sess.rafId = requestAnimationFrame(frame);
    }

    sess.rafId = requestAnimationFrame(frame);
  }

  let lastGachaPullCount = 1;
  function performSkinGacha(count = 1) {
    if (activeWishAnim) return;
    const cost = computeGachaCost(count);
    if (!cost.canAfford) {
      SFX.click();
      showToast(`🎟️ 뽑기권(상자 보관함 교환) 또는 💎 보석(${cost.needGems.toLocaleString('ko-KR')}💎)이 부족합니다!`);
      return;
    }
    if (el.gachaResultOverlay) el.gachaResultOverlay.classList.add('hidden');
    save.gachaTickets = Math.max(0, (save.gachaTickets || 0) - cost.useTickets);
    save.gems = Math.max(0, (save.gems || 0) - cost.needGems);

    const results = [];
    for (let i = 0; i < cost.count; i++) {
      results.push(rollOneGachaSkin());
    }
    lastGachaPullCount = cost.count;
    persistSave(true);
    refreshAllMenus();

    playGachaWishAnimation(results, cost.count);
  }

  function showGachaResultModal(results, count) {
    if (!el.gachaResultOverlay || !el.gachaResGrid) return;
    const baseMileage = results.reduce((s, x) => s + (x.milGain || 2), 0);
    const dupMileageTotal = results.reduce((s, x) => s + (x.dupMileage || 0), 0);
    const totalMileage = baseMileage + dupMileageTotal;
    const newSkins = results.filter((x) => x.isNew);
    const rarRank = { mythic: 4, legendary: 3, epic: 2, rare: 1 };
    const bestNew = newSkins.slice().sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0))[0] || null;

    if (el.gachaResTitle) {
      el.gachaResTitle.textContent = count > 1 ? `🌟 스킨 ${count}회 연속 뽑기 결과!` : '🌟 스킨 1회 뽑기 결과!';
    }
    if (el.gachaResMileage) {
      el.gachaResMileage.textContent = `✨ +${totalMileage} 마일리지 적립 (보유 ${(save.mileage || 0).toLocaleString('ko-KR')})`;
    }

    el.gachaResGrid.className = `gacha-res-grid ${count === 1 ? 'single' : 'multi'}`;
    el.gachaResGrid.innerHTML = '';

    results.forEach((item, idx) => {
      const sk = item.skin;
      const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.rare;
      const ownerChar = getCharDef(sk.charId);
      const skAv = getSkinAvatar(ownerChar, sk);
      const skFlt = getSkinFilter(sk);

      const card = document.createElement('div');
      card.className = `gacha-res-card rar-${sk.rarity}${item.isNew ? ' is-new' : ''}`;
      card.style.animationDelay = `${Math.min(idx * 55, 550)}ms`;
      card.innerHTML = `
        <div class="gacha-rc-top">
          <span class="gacha-rc-rar" style="background:${rar.bg};color:${rar.color}">${rar.name}</span>
          ${item.isNew ? '<span class="gacha-rc-new">NEW!</span>' : '<span class="gacha-rc-dup">중복</span>'}
        </div>
        <div class="gacha-rc-art">
          <img src="${skAv}" alt="${sk.name}" style="${skFlt ? `filter:${skFlt};` : ''}" />
        </div>
        <div class="gacha-rc-name">${sk.name}</div>
        <div class="gacha-rc-sub">${item.isNew ? ownerChar.name : `✨ 중복 +${item.dupMileage || 2}M`}</div>
      `;
      el.gachaResGrid.appendChild(card);
    });

    if (el.gachaResSummary) {
      const parts = [];
      if (newSkins.length > 0) parts.push(`✨ 신규 스킨 ${newSkins.length}종 획득!`);
      if (dupMileageTotal > 0) parts.push(`🔄 중복 보너스 +${dupMileageTotal} 마일리지`);
      parts.push(`✨ 총 마일리지 +${totalMileage} (뽑기 +${baseMileage}${dupMileageTotal > 0 ? ` · 중복 +${dupMileageTotal}` : ''})`);
      el.gachaResSummary.textContent = parts.join(' · ');
    }

    if (el.btnGachaResEquip) {
      if (bestNew) {
        el.btnGachaResEquip.classList.remove('hidden');
        el.btnGachaResEquip.textContent = `✨ [${bestNew.skin.name}] 장착`;
        el.btnGachaResEquip.onclick = () => {
          SFX.levelUp();
          save.equippedSkins[bestNew.skin.charId] = bestNew.skin.id;
          if (isCharUnlocked(bestNew.skin.charId)) {
            save.selectedChar = bestNew.skin.charId;
            previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === bestNew.skin.charId));
          }
          persistSave();
          el.gachaResultOverlay.classList.add('hidden');
          refreshAllMenus();
          showToast(`✨ [${bestNew.skin.name}] 스킨 장착 완료!`);
        };
      } else {
        el.btnGachaResEquip.classList.add('hidden');
        el.btnGachaResEquip.onclick = null;
      }
    }

    if (el.btnGachaResAgain) {
      const nextCost = computeGachaCost(count);
      const costHtml = nextCost.useTickets > 0 && nextCost.needGems > 0
        ? `${ticketIconHtml('btn')} ${nextCost.useTickets} + 💎 ${nextCost.needGems.toLocaleString('ko-KR')}`
        : (nextCost.useTickets > 0 ? `${ticketIconHtml('btn')} ${nextCost.useTickets}` : `💎 ${nextCost.needGems.toLocaleString('ko-KR')}`);
      el.btnGachaResAgain.innerHTML = `<span class="gc-again-inline">🎰 ${count}회 다시 뽑기 (${costHtml})</span>`;
      el.btnGachaResAgain.onclick = () => performSkinGacha(count);
    }

    el.gachaResultOverlay.classList.remove('hidden');
  }

  function openGachaHistoryModal() {
    if (!el.gachaHistoryOverlay || !el.gachaHistoryList) return;
    SFX.click();
    const list = Array.isArray(save.gachaHistory) ? save.gachaHistory : [];
    if (list.length === 0) {
      el.gachaHistoryList.innerHTML = '<div class="gacha-hist-empty">아직 스킨 뽑기 내역이 없습니다.<br/>스킨 뽑기를 이용하면 최근 50회 기록이 표시됩니다!</div>';
    } else {
      el.gachaHistoryList.innerHTML = list.map((h) => {
        const rar = DATA.SKIN_RARITIES[h.rarity] || DATA.SKIN_RARITIES.rare;
        const d = h.at ? new Date(h.at) : null;
        const ts = d ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
        const dupLabel = h.dupMileage > 0
          ? `중복 ✨+${h.dupMileage}M`
          : (h.dupGold > 0 ? `중복 +${h.dupGold.toLocaleString('ko-KR')}G` : '중복 ✨+2M');
        return `
          <div class="gacha-hist-row">
            <span class="gacha-rc-rar" style="background:${rar.bg};color:${rar.color}">${rar.name}</span>
            <strong class="gacha-hist-name">${h.name}</strong>
            <span class="gacha-hist-tag ${h.isNew ? 'new' : 'dup'}">${h.isNew ? 'NEW!' : dupLabel}</span>
            <span class="gacha-hist-time">${ts}</span>
          </div>
        `;
      }).join('');
    }
    el.gachaHistoryOverlay.classList.remove('hidden');
  }

  function pickSkinOrDupGold(rarity, pityTriggered) {
    // 신화(mythic) 등급은 상자에서 절대 출현하지 않음! (스킨 뽑기 / 마일리지 200 전용)
    if (rarity === 'mythic') rarity = 'legendary';
    let pool = DATA.SKINS.filter((s) => s.rarity === rarity && s.rarity !== 'mythic');
    if (pool.length === 0) {
      pool = DATA.SKINS.filter((s) => s.rarity !== 'mythic');
    }
    const unowned = pool.filter((s) => !save.unlockedSkins.includes(s.id));
    if (unowned.length > 0) {
      const picked = unowned[Math.floor(Math.random() * unowned.length)];
      save.unlockedSkins.push(picked.id);
      return { kind: 'skin', rarity: picked.rarity, skin: picked, isDuplicate: false, pityTriggered };
    }
    // Duplicate skin protection -> grant transparent disclosed gold refund!
    const effRar = DATA.SKIN_RARITIES[rarity] ? rarity : 'rare';
    const dupGold = (DATA.SKIN_RARITIES[effRar] && DATA.SKIN_RARITIES[effRar].dupGold) || 300;
    save.gold += dupGold;
    return { kind: 'dup_gold', rarity: effRar, amount: dupGold, isDuplicate: true, pityTriggered };
  }

  function rollChestReward(tierId) {
    const chest = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
    const pity = save.pity || (save.pity = { gold: 0, diamond: 0 });
    let result = null;

    // 1. Check Pity Guarantee FIRST! (신화는 상자에서 미출현)
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
      // 15th Diamond Chest -> Guaranteed Legendary unowned skin (Mythic excluded from chests!)
      pity.diamond = 0;
      result = pickSkinOrDupGold('legendary', true);
    } else {
      // 2. Exact Weighted Probability Roll (uses totalWeight for safety; Mythic excluded from chests!)
      const order = ['gold', 'rare', 'epic', 'legendary', 'diamond'];
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
        const isEpicPlus = hit === 'epic' || hit === 'legendary';
        pity.gold = isEpicPlus ? 0 : (pity.gold || 0) + 1;
      } else if (tierId === 'diamond') {
        const isLeg = hit === 'legendary';
        pity.diamond = isLeg ? 0 : (pity.diamond || 0) + 1;
      }
    }

    persistSave();
    return { tierId, chest, ...result };
  }

  // ===================== 8-FRAME ANIMATED CHEST OPENING MODAL =====================
  let activeChestSession = null;

  function openChestModal(tierId) {
    const chest = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
    if (Renderer && Renderer.preloadChestAnim) Renderer.preloadChestAnim(tierId);
    if (activeChestSession && activeChestSession.timers) {
      activeChestSession.timers.forEach((id) => clearTimeout(id));
    }
    activeChestSession = { tierId, opened: false, animating: false, reward: null, timers: [] };

    el.chestOpenStage.className = `chest-open-stage tier-${tierId}`;
    el.chestOpenTitle.textContent = chest.name;

    if (tierId === 'gold') {
      const rem = Math.max(1, chest.pityTarget - (save.pity.gold || 0));
      el.chestPityNote.textContent = rem === 1 ? '✨ 이번 상자 영웅 이상 스킨 확정!' : `영웅+ 천장까지 ${rem}회 남음 (${save.pity.gold || 0}/${chest.pityTarget})`;
      el.chestPityNote.classList.remove('hidden');
    } else if (tierId === 'diamond') {
      const rem = Math.max(1, chest.pityTarget - (save.pity.diamond || 0));
      el.chestPityNote.textContent = rem === 1 ? '✨ 이번 상자 전설 스킨 확정!' : `전설 천장까지 ${rem}회 남음 (${save.pity.diamond || 0}/${chest.pityTarget})`;
      el.chestPityNote.classList.remove('hidden');
    } else {
      el.chestPityNote.classList.add('hidden');
    }

    el.chestAnimImg.src = `assets/chests/chest_${tierId}_0.png?v=${ASSET_VER}`;
    el.chestAnimImg.classList.remove('burst', 'shaking');
    el.chestTapHint.textContent = '상자를 터치해서 열기!';
    el.chestTapHint.classList.remove('hidden');
    if (el.btnChestStore) el.btnChestStore.classList.remove('hidden');
    el.chestRewardCard.classList.add('hidden');
    el.btnChestEquip.classList.add('hidden');
    el.chestOpenOverlay.classList.remove('hidden');
    SFX.click();
  }

  function storeActiveChestToVault() {
    if (!activeChestSession || activeChestSession.animating || activeChestSession.opened) return;
    const tierId = activeChestSession.tierId;
    const chest = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
    save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
    save.chestBag[tierId] = (save.chestBag[tierId] || 0) + 1;
    if (activeChestSession.timers) {
      activeChestSession.timers.forEach((id) => clearTimeout(id));
    }
    activeChestSession = null;
    el.chestOpenOverlay.classList.add('hidden');
    SFX.reward();
    persistSave();
    refreshAllMenus();
    showToast(`📦 ${chest.name}가 상자 보관함에 저장되었습니다!`);
  }

  function triggerChestAnimation() {
    if (!activeChestSession || activeChestSession.animating || activeChestSession.opened) return;
    activeChestSession.animating = true;
    const tierId = activeChestSession.tierId;
    el.chestTapHint.classList.add('hidden');
    if (el.btnChestStore) el.btnChestStore.classList.add('hidden');
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
      el.chestRewardVisual.innerHTML = `<img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="골드" class="rw-big-ico" />`;
      el.chestRewardName.textContent = `+${rw.amount.toLocaleString('ko-KR')} G`;
      el.chestRewardSub.textContent = `${rw.chest.name}에서 골드를 획득했습니다!`;
    } else if (rw.kind === 'diamond') {
      el.chestRewardRarity.textContent = '💎 다이아 획득!';
      el.chestRewardRarity.style.background = '#10548c';
      el.chestRewardRarity.style.color = '#7ef6ff';
      el.chestRewardVisual.innerHTML = `<span class="rw-big-emoji">💎</span>`;
      el.chestRewardName.textContent = `+${rw.amount} 다이아`;
      el.chestRewardSub.textContent = `희귀 보석 재화 획득! 스킨 뽑기(200💎) · 황금/다이아 상자에 사용하세요!`;
    } else if (rw.kind === 'skin') {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.rare;
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
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.rare;
      el.chestRewardRarity.textContent = `🔄 ${rar.name} 스킨 전체 보유 (중복 대체)`;
      el.chestRewardRarity.style.background = rar.bg;
      el.chestRewardRarity.style.color = rar.color;
      el.chestRewardVisual.innerHTML = `<img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="중복 골드" class="rw-big-ico" />`;
      el.chestRewardName.textContent = `+${rw.amount.toLocaleString('ko-KR')} G`;
      el.chestRewardSub.textContent = `해당 등급 스킨을 모두 보유해 중복 방지 골드로 지급되었습니다!`;
    }

    // Update live pity badge after roll
    if (rw.tierId === 'gold') {
      const rem = DATA.CHESTS.gold.pityTarget - (save.pity.gold || 0);
      el.chestPityNote.textContent = `다음 황금 상자 영웅+ 천장까지 ${rem}회 (${save.pity.gold || 0}/${DATA.CHESTS.gold.pityTarget})`;
    } else if (rw.tierId === 'diamond') {
      const rem = DATA.CHESTS.diamond.pityTarget - (save.pity.diamond || 0);
      el.chestPityNote.textContent = `다음 다이아 상자 전설 천장까지 ${rem}회 (${save.pity.diamond || 0}/${DATA.CHESTS.diamond.pityTarget})`;
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
    const gRates = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.rates) || { rare: 70, epic: 20, legendary: 8, mythic: 2 };
    el.probModalBody.innerHTML = `
      <div class="prob-section">
        <h4>🎰 스킨 전용 뽑기 확률 &amp; 마일리지 교환 (4등급 체계)</h4>
        <table class="prob-table">
          <thead>
            <tr><th>등급</th><th>뽑기 확률</th><th>마일리지 교환</th><th>뽑기 중복 보상</th></tr>
          </thead>
          <tbody>
            <tr><td style="color:#47c8ff">희귀 (RARE)</td><td>${gRates.rare}%</td><td>✨ 10 마일리지</td><td>✨ +2 마일리지</td></tr>
            <tr><td style="color:#d084ff">영웅 (EPIC)</td><td>${gRates.epic}%</td><td>✨ 30 마일리지</td><td>✨ +2 마일리지</td></tr>
            <tr><td style="color:#ffca42">전설 (LEGENDARY)</td><td>${gRates.legendary}%</td><td>✨ 50 마일리지</td><td>✨ +2 마일리지</td></tr>
            <tr><td style="color:#ff5ea8">신화 (MYTHIC)</td><td>${gRates.mythic}%</td><td>✨ 200 마일리지</td><td>✨ +2 마일리지</td></tr>
          </tbody>
        </table>
        <ul class="prob-rules" style="margin-top:6px;">
          <li><strong>뽑기 비용:</strong> ${ticketIconHtml('xs')} 뽑기권 1장/회 (뽑기권 부족 시 💎 200 보석/회) · <strong>1회당 ✨ +2 마일리지 적립 + 중복 스킨 출현 시 ✨ +2 마일리지 추가 지급!</strong></li>
          <li><strong>${ticketIconHtml('xs')} 상자 → 뽑기권 교환 (상자 보관함):</strong> 나무 15개 · 은 10개 · 황금 5개 · 다이아 2개 = 뽑기권 1장</li>
          <li>미출시 중간 등급(영웅·전설)은 희귀 스킨 풀로 자동 전환되며, 신화 스킨 확률(${gRates.mythic}%)은 그대로 유지됩니다.</li>
        </ul>
      </div>
      <div class="prob-section">
        <h4>📊 상자별 보상 확률 (합계 100%)</h4>
        <table class="prob-table">
          <thead>
            <tr><th>보상</th><th>🪵 나무(300G)</th><th>🥈 은(700G)</th><th>👑 황금(40💎)</th><th>💎 다이아(100💎)</th></tr>
          </thead>
          <tbody>
            <tr><td>🪙 골드</td><td>75%</td><td>65%</td><td>50%</td><td>25%</td></tr>
            <tr><td style="color:#47c8ff">희귀 스킨</td><td>23%</td><td>30%</td><td>25%</td><td>10%</td></tr>
            <tr><td style="color:#d084ff">영웅 스킨</td><td>1.5%</td><td>3%</td><td>17%</td><td>30%</td></tr>
            <tr><td style="color:#ffca42">전설 스킨</td><td>-</td><td>-</td><td>3%</td><td>25%</td></tr>
            <tr><td style="color:#ff5ea8">신화 스킨</td><td colspan="4">상자 미출현 (🎰 스킨 뽑기 · ✨ 마일리지 200 교환)</td></tr>
            <tr><td style="color:#7ef6ff">💎 다이아</td><td>0.5%</td><td>2%</td><td>5%</td><td>10%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="prob-section">
        <h4>🛡️ 인게임 상자 드랍 &amp; 천장 시스템</h4>
        <ul class="prob-rules">
          <li><strong>달리기 중 상자 등장:</strong> 나무(56%) &gt; 은(27%) &gt; 황금(13%) &gt; 다이아(4%) 비율로 등장하며 획득 시 상자 보관함에 자동 저장!</li>
          <li><strong>👑 황금 상자 천장 (10회):</strong> 영웅 이상 스킨 미획득 시 10회차 확정! (현재 <strong>${gPity} / 10회</strong>)</li>
          <li><strong>💎 다이아 상자 천장 (15회):</strong> 전설 스킨 미획득 시 15회차 확정! (현재 <strong>${dPity} / 15회</strong>)</li>
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

  let weatherAlertTimer = null;
  const WEATHER_ALERT_META = {
    rain:       { title: '🌧️ 국지성 폭우!', sub: '☂️ 우산을 펴세요!' },
    flood:      { title: '🌊 장마 침수 경보!', sub: '☂️ 우산 ON · 차 지붕을 밟으세요!' },
    dust:       { title: '😷 황사 · 미세먼지!', sub: '😷 마스크를 착용하세요!' },
    heat:       { title: '☀️ 폭염 땡볕 경보!', sub: '☂️ 우산(양산)을 펴세요!' },
    gust:       { title: '💨 태풍 · 강풍 돌풍!', sub: '☂️ 우산을 접고 슬라이드!' },
    ice_road:   { title: '🧊 겨울 빙판길!', sub: '❄️ 미끄럼 주의!' },
    covid:      { title: '🦠 코로나 경보!', sub: '😷 확진자 회피 · 돌진 직전 마스크!' },
    covid_rush: { title: '🦠 코로나 바이러스 발생!', sub: '😷 마스크를 쓰세요!' }
  };

  function showWeatherCenterAlert(weatherId, customSub = null) {
    if (!el.weatherCenterAlert) return;
    const meta = WEATHER_ALERT_META[weatherId];
    if (!meta) return;
    el.weatherCenterAlert.className = `weather-center-alert ev-${weatherId}`;
    el.weatherAlertTitle.textContent = meta.title;
    el.weatherAlertSub.textContent = customSub || meta.sub;
    // Force clean animation restart on consecutive events
    void el.weatherCenterAlert.offsetWidth;
    el.weatherCenterAlert.classList.add('show');
    if (weatherAlertTimer) clearTimeout(weatherAlertTimer);
    weatherAlertTimer = setTimeout(() => {
      if (el.weatherCenterAlert) el.weatherCenterAlert.classList.add('hidden');
    }, 2200);
  }

  function hideWeatherCenterAlert() {
    if (weatherAlertTimer) {
      clearTimeout(weatherAlertTimer);
      weatherAlertTimer = null;
    }
    if (el.weatherCenterAlert) el.weatherCenterAlert.classList.add('hidden');
  }

  // ===================== AUTO HARDWARE LANDSCAPE ORIENTATION LOCK =====================
  function isTouchMobileDevice() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const ua = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    return coarse || ua;
  }

  function isInAppBrowser() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    // Google App (GSA), KakaoTalk, Naver, Instagram, Facebook, Line, Android WebView
    return /GSA\/|GoogleApp|KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line\/|\bwv\b/i.test(ua);
  }

  let landscapeLockInFlight = false;
  let fullscreenAttemptedOnce = false;

  function isAppleTouchDevice() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isIPadOs = typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || isIPadOs;
  }

  async function tryAutoLockLandscape(fromUserGesture = false) {
    // 1. Native Capacitor ScreenOrientation plugin if present
    try {
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.ScreenOrientation && cap.Plugins.ScreenOrientation.lock) {
        await cap.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
      }
    } catch {}

    // Never fight iOS/iPadOS Safari native orientation (prevents rotation spin/white-bar glitches!)
    if (isAppleTouchDevice()) return;
    if (!isTouchMobileDevice()) return;
    if (landscapeLockInFlight) return;
    landscapeLockInFlight = true;
    try {
      const docEl = document.documentElement;
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      const canFs = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

      // Avoid calling requestFullscreen inside Google App / KakaoTalk / in-app WebViews where it can break touch/viewport!
      if (fromUserGesture && !isFs && canFs && !isInAppBrowser() && !fullscreenAttemptedOnce) {
        fullscreenAttemptedOnce = true;
        try {
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          }
        } catch {}
      }
      if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
        try {
          await screen.orientation.lock('landscape');
        } catch {
          try { await screen.orientation.lock('landscape-primary'); } catch {}
        }
      }
    } finally {
      landscapeLockInFlight = false;
    }
  }

  // ===================== AUTH / LOGIN / PROFILE UI =====================
  let pendingOauthProvider = null;

  function ensureWeeklyRankCurrentWeek() {
    const info = ONLINE ? ONLINE.getWeekInfo() : { weekKey: getWeekKey() };
    if (!save.weeklyRank || typeof save.weeklyRank !== 'object') {
      save.weeklyRank = { weekKey: info.weekKey, bestScore: 0, bestDist: 0, bestYear: 1, history: {}, claimedWeeks: [] };
    }
    if (save.weeklyRank.weekKey && save.weeklyRank.weekKey !== info.weekKey) {
      save.weeklyRank.history = save.weeklyRank.history || {};
      if ((save.weeklyRank.bestScore || 0) > 0) {
        save.weeklyRank.history[save.weeklyRank.weekKey] = {
          score: save.weeklyRank.bestScore,
          dist: save.weeklyRank.bestDist || 0,
          year: save.weeklyRank.bestYear || 1
        };
      }
      save.weeklyRank.weekKey = info.weekKey;
      save.weeklyRank.bestScore = 0;
      save.weeklyRank.bestDist = 0;
      save.weeklyRank.bestYear = 1;
      persistSave();
    }
    return info;
  }

  function setProviderChip(node, provider, mini = false) {
    if (!node) return;
    const prov = provider || 'guest';
    const meta = ONLINE ? ONLINE.getProviderMeta(prov) : { badge: 'GUEST' };
    node.className = `prov-chip${mini ? ' mini' : ''} ${prov}`;
    if (prov === 'google') {
      node.innerHTML = `<img src="assets/ui/google_logo.png?v=${ASSET_VER}" alt="Google" class="prov-google-img" />`;
    } else {
      node.textContent = meta.badge;
    }
  }

  function renderIntroAuthState() {
    const auth = (save && save.auth) || activeAuth || { loggedIn: false, provider: 'guest', nickname: '' };
    const isLogged = Boolean(auth.loggedIn);
    if (el.introLoginBox) el.introLoginBox.classList.toggle('hidden', isLogged);
    if (el.introStartBox) el.introStartBox.classList.toggle('hidden', !isLogged);
    if (isLogged) {
      const meta = ONLINE ? ONLINE.getProviderMeta(auth.provider) : { badge: 'GUEST', label: '게스트' };
      setProviderChip(el.introAccBadge, auth.provider, false);
      if (el.introAccName) {
        el.introAccName.textContent = auth.nickname || meta.label;
      }
    }
  }

  function getScoreRoadBracket(score) {
    const step = DATA.SCORE_ROAD_STEP || 1000;
    const sc = Math.max(0, Math.floor(score || 0));
    const completed = Math.floor(sc / step);
    const rank = completed + 1;
    const prev = completed * step;
    const next = (completed + 1) * step;
    const pct = Math.max(0, Math.min(100, ((sc - prev) / step) * 100));
    const tierCls = rank >= 15 ? 'tier-mythic' : (rank >= 10 ? 'tier-epic' : (rank >= 5 ? 'tier-gold' : 'tier-blue'));
    return { rank, prev, next, pct, tierCls };
  }

  function getUnclaimedScoreRoadMilestones() {
    const step = DATA.SCORE_ROAD_STEP || 1000;
    const best = Math.max(0, Math.floor(save.bestScore || 0));
    const claimed = save.scoreRoadClaimed || {};
    const list = [];
    for (let m = step; m <= best; m += step) {
      if (!claimed[String(m)]) list.push(m);
    }
    return list;
  }

  function grantScoreRoadReward(milestoneScore, silentToast = false) {
    const key = String(milestoneScore);
    save.scoreRoadClaimed = save.scoreRoadClaimed || {};
    if (save.scoreRoadClaimed[key]) return null;
    if ((save.bestScore || 0) < milestoneScore) return null;

    const rw = DATA.getScoreRoadMilestone(milestoneScore);
    save.scoreRoadClaimed[key] = true;
    if (rw.kind === 'gold') {
      save.gold += rw.amount;
    } else if (rw.kind === 'gems') {
      save.gems = (save.gems || 0) + rw.amount;
    } else if (rw.kind === 'chest') {
      save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
      save.chestBag[rw.chest] = (save.chestBag[rw.chest] || 0) + (rw.amount || 1);
    }
    if (!silentToast) {
      SFX.reward();
      persistSave();
      refreshAllMenus();
      if (rw.kind === 'chest') {
        showToast(`🎁 ${milestoneScore.toLocaleString('ko-KR')}점 달성 보상! ${rw.label}이(가) 상자 보관함에 저장되었습니다!`);
      } else {
        showToast(`🎁 ${milestoneScore.toLocaleString('ko-KR')}점 달성 보상! ${rw.label} 획득!`);
      }
    }
    return rw;
  }

  function claimAllScoreRoad() {
    const ready = getUnclaimedScoreRoadMilestones();
    if (!ready.length) return;
    let totalGold = 0;
    let totalGems = 0;
    let totalChests = 0;
    ready.forEach((m) => {
      const rw = grantScoreRoadReward(m, true);
      if (!rw) return;
      if (rw.kind === 'gold') totalGold += rw.amount;
      else if (rw.kind === 'gems') totalGems += rw.amount;
      else if (rw.kind === 'chest') totalChests += (rw.amount || 1);
    });
    SFX.reward();
    persistSave();
    refreshAllMenus();
    const parts = [];
    if (totalGold > 0) parts.push(`🪙 ${totalGold.toLocaleString('ko-KR')}G`);
    if (totalGems > 0) parts.push(`💎 ${totalGems}`);
    if (totalChests > 0) parts.push(`📦 상자 ${totalChests}개(보관함 저장)`);
    showToast(`🎉 최고점수 보상 ${ready.length}건 모두 수령! (${parts.join(' · ')})`);
  }

  function renderScoreRoadModal() {
    if (!el.scoreRoadTrack) return;
    const step = DATA.SCORE_ROAD_STEP || 1000;
    const best = Math.max(0, Math.floor(save.bestScore || 0));
    const claimed = save.scoreRoadClaimed || {};
    const unclaimed = getUnclaimedScoreRoadMilestones();

    if (el.scoreRoadBestVal) {
      el.scoreRoadBestVal.textContent = `내 최고점수 ${best.toLocaleString('ko-KR')}점`;
    }
    if (el.btnScoreRoadClaimAll) {
      el.btnScoreRoadClaimAll.classList.toggle('hidden', unclaimed.length === 0);
      el.btnScoreRoadClaimAll.textContent = `🎁 모두 받기 (${unclaimed.length})`;
    }

    const maxMilestone = Math.max(20000, (Math.floor(best / step) + 6) * step);
    el.scoreRoadTrack.innerHTML = '';

    let focusCard = null;
    for (let m = step; m <= maxMilestone; m += step) {
      const rw = DATA.getScoreRoadMilestone(m);
      const isReached = best >= m;
      const isClaimed = Boolean(claimed[String(m)]);
      const canClaim = isReached && !isClaimed;
      const segFill = Math.max(0, Math.min(100, ((best - (m - step)) / step) * 100));

      let iconHtml = '';
      if (rw.kind === 'gold') {
        iconHtml = `<img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="골드" class="sr-rw-img" />`;
      } else if (rw.kind === 'gems') {
        iconHtml = `<span class="sr-rw-gem" aria-hidden="true">💎</span>`;
      } else {
        const chDef = DATA.CHESTS[rw.chest] || DATA.CHESTS.wood;
        iconHtml = `<img src="${chDef.icon}?v=${ASSET_VER}" alt="${chDef.name}" class="sr-rw-img chest" />`;
      }

      const card = document.createElement('div');
      card.className = `sr-node tier-${rw.tier}${isClaimed ? ' claimed' : (canClaim ? ' ready' : ' locked')}`;
      card.innerHTML = `
        <div class="sr-node-head">
          <span class="sr-node-score">${m.toLocaleString('ko-KR')}점</span>
          <span class="sr-node-tag">${rw.tag}</span>
        </div>
        <div class="sr-node-rail">
          <div class="sr-node-rail-fill" style="width:${segFill.toFixed(1)}%"></div>
          <span class="sr-node-pip">${isClaimed ? '✓' : (canClaim ? '!' : '★')}</span>
        </div>
        <div class="sr-node-art">${iconHtml}</div>
        <div class="sr-node-lbl">${rw.label}</div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (canClaim) {
        btn.className = 'sr-claim-btn ready';
        btn.textContent = rw.kind === 'chest' ? '보관함 받기!' : '받기!';
        btn.onclick = () => grantScoreRoadReward(m, false);
        if (!focusCard) focusCard = card;
      } else if (isClaimed) {
        btn.className = 'sr-claim-btn done';
        btn.textContent = '완료 ✓';
        btn.disabled = true;
      } else {
        btn.className = 'sr-claim-btn locked';
        btn.textContent = `🔒 ${(m - best).toLocaleString('ko-KR')}점 남음`;
        btn.disabled = true;
        if (!focusCard) focusCard = card;
      }
      card.appendChild(btn);
      el.scoreRoadTrack.appendChild(card);
    }

    if (focusCard && el.scoreRoadTrack.scrollTo) {
      requestAnimationFrame(() => {
        try {
          const targetLeft = Math.max(0, focusCard.offsetLeft - 60);
          el.scoreRoadTrack.scrollTo({ left: targetLeft, behavior: 'smooth' });
        } catch {}
      });
    }
  }

  function openScoreRoadModal() {
    if (!el.scoreRoadOverlay) return;
    SFX.click();
    renderScoreRoadModal();
    el.scoreRoadOverlay.classList.remove('hidden');
  }

  function renderVaultModal() {
    if (!el.vaultModalGrid) return;
    const total = getTotalBagChests();
    if (el.vaultTotalPill) el.vaultTotalPill.textContent = `보유 ${total}개`;
    if (el.vaultTicketPill) el.vaultTicketPill.innerHTML = `${ticketIconHtml('sm')} 뽑기권 ${(save.gachaTickets || 0).toLocaleString('ko-KR')}장`;
    el.vaultModalGrid.innerHTML = '';

    DATA.CHEST_ORDER.forEach((tierId) => {
      const chest = DATA.CHESTS[tierId];
      const qty = (save.chestBag && save.chestBag[tierId]) || 0;
      const ticketCost = chest.ticketCost || 15;
      const pityLine = tierId === 'gold'
        ? `영웅+ 천장 ${save.pity.gold || 0}/10회`
        : (tierId === 'diamond'
          ? `전설 천장 ${save.pity.diamond || 0}/15회`
          : `골드 ${chest.goldRange[0]}~${chest.goldRange[1]}G · 💎${chest.gemRange[0]}~${chest.gemRange[1]}`);

      const card = document.createElement('div');
      card.className = `vault-card tier-${tierId}${qty > 0 ? ' ready' : ' empty'}`;
      card.innerHTML = `
        <div class="vault-card-top">
          <span class="vault-card-name">${chest.name}</span>
          <span class="vault-card-qty">×${qty}</span>
        </div>
        <div class="vault-card-stage">
          <img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="vault-card-img" />
        </div>
        <div class="vault-card-sub">${pityLine}</div>
      `;
      const btnRow = document.createElement('div');
      btnRow.className = 'vault-card-actions';

      const btn = document.createElement('button');
      btn.type = 'button';
      if (qty > 0) {
        btn.className = 'vault-open-btn ready';
        btn.textContent = '열기!';
        btn.onclick = () => {
          if ((save.chestBag[tierId] || 0) <= 0) return;
          save.chestBag[tierId] -= 1;
          persistSave();
          refreshAllMenus();
          openChestModal(tierId);
        };
      } else {
        btn.className = 'vault-open-btn empty';
        btn.textContent = '상점에서 얻기';
        btn.onclick = () => {
          SFX.click();
          if (el.vaultOverlay) el.vaultOverlay.classList.add('hidden');
          currentShopSubtab = 'chests';
          switchTab('shop');
        };
      }
      btnRow.appendChild(btn);

      // Chest -> Skin Gacha Ticket Exchange Button (Wood 15, Silver 10, Gold 5, Diamond 2 = 1 Ticket!)
      const exBtn = document.createElement('button');
      exBtn.type = 'button';
      const canEx = qty >= ticketCost;
      exBtn.className = `vault-ticket-ex-btn${canEx ? ' ready' : ''}`;
      exBtn.innerHTML = `${ticketIconHtml('xs')} 뽑기권 1장 (${ticketCost}개)`;
      exBtn.disabled = !canEx;
      exBtn.onclick = () => {
        if ((save.chestBag[tierId] || 0) < ticketCost) return;
        SFX.buy();
        save.chestBag[tierId] -= ticketCost;
        save.gachaTickets = (save.gachaTickets || 0) + 1;
        persistSave();
        refreshAllMenus();
        showToast(`🎟️ ${chest.name} ${ticketCost}개 → 스킨 뽑기권 1장 교환 완료! (보유 ${save.gachaTickets}장)`);
      };
      btnRow.appendChild(exBtn);

      card.appendChild(btnRow);
      el.vaultModalGrid.appendChild(card);
    });
  }

  function openVaultModal() {
    if (!el.vaultOverlay) return;
    SFX.click();
    renderVaultModal();
    el.vaultOverlay.classList.remove('hidden');
  }

  function renderProfileUI() {
    const auth = save.auth || { loggedIn: false, provider: 'guest', nickname: '게스트' };
    const meta = ONLINE ? ONLINE.getProviderMeta(auth.provider) : { badge: 'GUEST', label: '게스트' };
    const nick = auth.nickname || meta.label;
    const isLinked = ONLINE ? ONLINE.isRankedProvider(auth.provider) : false;

    const selCh = DATA.CHARACTERS.find((c) => c.id === save.selectedChar) || DATA.CHARACTERS[0];
    const selSkin = getEquippedSkin(selCh.id);
    if (el.hdrProfileAvatar) {
      el.hdrProfileAvatar.src = getSkinAvatar(selCh, selSkin);
      el.hdrProfileAvatar.style.filter = getSkinFilter(selSkin);
    }

    const bracket = getScoreRoadBracket(save.bestScore || 0);
    const unclaimedCnt = getUnclaimedScoreRoadMilestones().length;
    if (el.hdrProfileRank) {
      el.hdrProfileRank.textContent = `★${bracket.rank}`;
      el.hdrProfileRank.className = `bs-prof-rank-badge ${bracket.tierCls}`;
    }
    if (el.headerBestScore) {
      el.headerBestScore.textContent = (save.bestScore || 0).toLocaleString('ko-KR');
    }
    if (el.hdrTrophyFill) {
      el.hdrTrophyFill.style.width = `${bracket.pct.toFixed(1)}%`;
    }
    if (el.hdrTrophyNext) {
      el.hdrTrophyNext.textContent = `/ ${bracket.next.toLocaleString('ko-KR')}`;
    }
    if (el.btnScoreRoad) {
      el.btnScoreRoad.classList.toggle('has-reward', unclaimedCnt > 0);
    }
    if (el.hdrScoreRoadDot) {
      el.hdrScoreRoadDot.classList.toggle('hidden', unclaimedCnt <= 0);
      el.hdrScoreRoadDot.textContent = unclaimedCnt > 9 ? '9+' : String(unclaimedCnt);
    }

    setProviderChip(el.hdrProfileBadge, auth.provider, true);
    if (el.hdrProfileName) el.hdrProfileName.textContent = nick;

    setProviderChip(el.settingsAccountBadge, auth.provider, false);
    if (el.settingsAccountName) el.settingsAccountName.textContent = nick;
    const syncSt = (ONLINE && ONLINE.getCloudSyncStatus) ? ONLINE.getCloudSyncStatus() : { ok: null, status: 0, error: '' };
    const isPermErr = syncSt.ok === false && (syncSt.status === 401 || syncSt.status === 403 || syncSt.error === 'permission_denied');
    const syncStateTxt = !isLinked
      ? '게스트 모드 (기기 저장 · 랭킹 미표시)'
      : (isPermErr
        ? `${meta.label} · ⚠️ 클라우드 DB 규칙(user_saves) 미게시 (HTTP ${syncSt.status || 401})`
        : (syncSt.ok === false
          ? `${meta.label}${auth.email ? ` · ${auth.email}` : ''} · ⚠️ 동기화 재시도 필요`
          : (syncSt.ok === true
            ? `${meta.label}${auth.email ? ` · ${auth.email}` : ''} · ☁️ 클라우드 동기화 완료`
            : `${meta.label}${auth.email ? ` · ${auth.email}` : ''} · ☁️ 모든 기기 자동 동기화`)));

    if (el.settingsAccountSub) {
      el.settingsAccountSub.textContent = syncStateTxt;
    }

    setProviderChip(el.loginCurBadge, auth.provider, false);
    if (el.loginCurName) el.loginCurName.textContent = auth.loggedIn ? nick : '미로그인';
    if (el.loginCurSub) {
      el.loginCurSub.textContent = !auth.loggedIn ? '계정을 선택해 로그인하세요' : syncStateTxt;
    }
    if (el.btnLoginSync) el.btnLoginSync.classList.toggle('hidden', !auth.loggedIn || !isLinked);
    if (el.btnLoginLogout) el.btnLoginLogout.classList.toggle('hidden', !auth.loggedIn);
    if (el.loginSetupNotice && ONLINE) {
      el.loginSetupNotice.classList.toggle('hidden', ONLINE.hasFirebaseAuth() && !isPermErr);
    }
    renderIntroAuthState();
  }

  function openLoginOverlay() {
    if (!el.loginOverlay) return;
    if (el.loginMainPanel) el.loginMainPanel.classList.remove('hidden');
    renderProfileUI();
    if (el.loginNicknameInput) {
      el.loginNicknameInput.value = (save.auth && save.auth.nickname) || '';
    }
    el.loginOverlay.classList.remove('hidden');
  }

  function hasMeaningfulProgress(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const skins = Array.isArray(raw.unlockedSkins) ? raw.unlockedSkins : (raw.unlockedSkins ? Object.values(raw.unlockedSkins) : []);
    const chars = Array.isArray(raw.unlockedChars) ? raw.unlockedChars : (raw.unlockedChars ? Object.values(raw.unlockedChars) : []);
    return Boolean(
      (Number(raw.playCount) || 0) > 0 ||
      (Number(raw.bestScore) || 0) > 0 ||
      skins.length > 0 ||
      chars.length > 1 ||
      (Number(raw.gems) || 0) > 0 ||
      (Number(raw.gold) || 0) > 80 ||
      (Number(raw.gachaTickets) || 0) > 0 ||
      (Number(raw.mileage) || 0) > 0
    );
  }

  function getSaveProgressWeight(s) {
    if (!s) return 0;
    const cb = s.chestBag || {};
    const bagWeight = (cb.wood || 0) * 80 + (cb.silver || 0) * 180 + (cb.gold || 0) * 400 + (cb.diamond || 0) * 900;
    return (s.bestScore || 0)
      + (s.playCount || 0) * 120
      + (s.unlockedSkins ? s.unlockedSkins.length : 0) * 600
      + (s.unlockedChars ? Math.max(0, s.unlockedChars.length - 1) : 0) * 500
      + (s.gold || 0)
      + (s.gems || 0) * 15
      + (s.gachaTickets || 0) * 1200
      + (s.mileage || 0) * 40
      + bagWeight;
  }

  function mergeCrossDeviceSaves(cloudRaw, localRaw, authProfile) {
    const c = hydrateSaveData(cloudRaw, authProfile);
    const l = hydrateSaveData(localRaw, authProfile);
    const cHas = hasMeaningfulProgress(cloudRaw);
    const lHas = hasMeaningfulProgress(localRaw);
    if (cHas && !lHas) return c;
    if (lHas && !cHas) return l;

    const cTs = Number(cloudRaw && cloudRaw.cloudUpdatedAt) || 0;
    const lTs = Number(localRaw && localRaw.cloudUpdatedAt) || 0;
    // When both devices have real timestamps, newest play wins; during one-time legacy merge (ts === 0), richer progress wins!
    let cloudWins = cTs >= lTs;
    if (cTs === 0 || lTs === 0) {
      cloudWins = getSaveProgressWeight(c) >= getSaveProgressWeight(l);
    }
    const primary = cloudWins ? c : l;
    const secondary = cloudWins ? l : c;

    const mergedChars = Array.from(new Set([...(primary.unlockedChars || []), ...(secondary.unlockedChars || [])]));
    const mergedSkins = Array.from(new Set([...(primary.unlockedSkins || []), ...(secondary.unlockedSkins || [])]));
    const mergedCharLv = { ...secondary.charLevels, ...primary.charLevels };
    Object.keys(mergedCharLv).forEach((k) => {
      mergedCharLv[k] = Math.max(Number(c.charLevels[k]) || 1, Number(l.charLevels[k]) || 1);
    });
    const curWk = getWeekKey();
    const cWkScore = (c.weeklyRank && c.weeklyRank.weekKey === curWk) ? (c.weeklyRank.bestScore || 0) : 0;
    const lWkScore = (l.weeklyRank && l.weeklyRank.weekKey === curWk) ? (l.weeklyRank.bestScore || 0) : 0;
    const bestWkObj = cWkScore >= lWkScore ? c.weeklyRank : l.weeklyRank;

    return {
      ...primary,
      cloudUpdatedAt: Math.max(cTs, lTs),
      unlockedChars: mergedChars,
      unlockedSkins: mergedSkins,
      charLevels: mergedCharLv,
      bestScore: Math.max(c.bestScore || 0, l.bestScore || 0),
      bestYear: Math.max(c.bestYear || 1, l.bestYear || 1),
      bestDistanceM: Math.max(c.bestDistanceM || 0, l.bestDistanceM || 0),
      totalCoinsEver: Math.max(c.totalCoinsEver || 0, l.totalCoinsEver || 0),
      maxDodgeComboEver: Math.max(c.maxDodgeComboEver || 0, l.maxDodgeComboEver || 0),
      playCount: Math.max(c.playCount || 0, l.playCount || 0),
      achievementsClaimed: { ...(secondary.achievementsClaimed || {}), ...(primary.achievementsClaimed || {}) },
      stageMilestonesClaimed: { ...(secondary.stageMilestonesClaimed || {}), ...(primary.stageMilestonesClaimed || {}) },
      scoreRoadClaimed: { ...(secondary.scoreRoadClaimed || {}), ...(primary.scoreRoadClaimed || {}) },
      tutorialDone: Boolean(c.tutorialDone || l.tutorialDone),
      weeklyRank: {
        ...bestWkObj,
        history: { ...((secondary.weeklyRank && secondary.weeklyRank.history) || {}), ...((primary.weeklyRank && primary.weeklyRank.history) || {}) },
        claimedWeeks: Array.from(new Set([...((c.weeklyRank && c.weeklyRank.claimedWeeks) || []), ...((l.weeklyRank && l.weeklyRank.claimedWeeks) || [])]))
      }
    };
  }

  // ===================== COOKIE RUN STYLE LIVE PLAYABLE TUTORIAL ENGINE =====================
  const PLAYABLE_TUTORIAL_STEPS = [
    {
      id: 'jump',
      icon: '⬆️',
      title: '1. 장애물을 뛰어넘으세요!',
      sub: '왼쪽 [점프] 버튼 (Space / ↑)을 눌러 피하세요',
      actionPrompt: '👇 지금! [점프] 버튼을 누르세요!',
      targetBtn: 'jump',
      successMsg: '👍 나이스 점프!'
    },
    {
      id: 'double_jump',
      icon: '⬆️⬆️',
      title: '2. 높은 장애물은 2단 점프!',
      sub: '점프 후 공중에서 [점프]를 한 번 더 누르세요',
      actionPrompt: '👇 지금! [점프] 1단 점프!',
      secondPrompt: '👇 공중에서 한 번 더! [2단 점프]!',
      targetBtn: 'jump',
      successMsg: '✨ 완벽한 2단 점프!'
    },
    {
      id: 'slide',
      icon: '⬇️',
      title: '3. 날아오는 구름은 슬라이드!',
      sub: '오른쪽 [슬라이드] 버튼 (↓)을 눌러 아래로 통과하세요',
      actionPrompt: '👇 지금! [슬라이드] 버튼을 누르세요!',
      targetBtn: 'slide',
      successMsg: '💨 멋진 슬라이드 통과!'
    },
    {
      id: 'rain_umbrella',
      icon: '🌧️',
      title: '4. 비가 오면 우산을 펴세요!',
      sub: '왼쪽 위 [우산] 버튼 (Q)을 누르세요 (10초 자동 해제)',
      actionPrompt: '👇 지금! [우산] 버튼을 눌러 펴세요!',
      targetBtn: 'umbrella',
      successMsg: '☂️ 빗물 완벽 방어!'
    },
    {
      id: 'gust_fold',
      icon: '💨',
      title: '5. 태풍 돌풍엔 우산을 접으세요!',
      sub: '제한 시간 안에 안 접으면 파손됩니다! [우산] 버튼 (Q)',
      actionPrompt: '👇 지금! [우산] 버튼을 눌러 접으세요!',
      targetBtn: 'umbrella',
      successMsg: '💨 태풍 대비! 우산 접기 성공!'
    },
    {
      id: 'dust_mask',
      icon: '😷',
      title: '6. 황사·미세먼지엔 마스크!',
      sub: '오른쪽 위 [마스크] 버튼 (E)을 눌러 황사를 막으세요',
      actionPrompt: '👇 지금! [마스크] 버튼을 누르세요!',
      targetBtn: 'mask',
      successMsg: '😷 황사 완벽 차단!'
    },
    {
      id: 'covid_parry',
      icon: '🦠',
      title: '7. 코로나 바이러스 돌진 차단!',
      sub: '바이러스가 돌진할 때 [마스크] (E)를 눌러 튕겨내세요!',
      actionPrompt: '👇 지금! [마스크]로 바이러스를 튕겨내세요!',
      targetBtn: 'mask',
      successMsg: '🎉 완벽 차단! 모든 조작 마스터!'
    }
  ];

  function clearTutorialHighlights() {
    if (el.btnJump) el.btnJump.classList.remove('tut-highlight');
    if (el.btnSlide) el.btnSlide.classList.remove('tut-highlight');
    if (el.btnToggleUmbrella) el.btnToggleUmbrella.classList.remove('tut-highlight');
    if (el.btnToggleMask) el.btnToggleMask.classList.remove('tut-highlight');
  }

  function updateTutorialHudUI() {
    const isTut = Boolean(run && run.isTutorial && run.tut);
    if (el.tutRunHud) el.tutRunHud.classList.toggle('hidden', !isTut);
    if (!isTut) {
      clearTutorialHighlights();
      return;
    }

    const tut = run.tut;
    const total = PLAYABLE_TUTORIAL_STEPS.length;
    const step = PLAYABLE_TUTORIAL_STEPS[Math.min(total - 1, tut.stepIdx)] || PLAYABLE_TUTORIAL_STEPS[0];
    const waiting = Boolean(tut.waitAction);

    if (el.tutRunHud) el.tutRunHud.classList.toggle('waiting-action', waiting);
    if (el.tutRunStepPill) el.tutRunStepPill.textContent = `튜토리얼 ${Math.min(total, tut.stepIdx + 1)}/${total}`;
    if (el.tutRunTitle) el.tutRunTitle.textContent = `${step.icon} ${step.title}`;
    if (el.tutRunSub) el.tutRunSub.textContent = step.sub;

    if (el.tutRunActionCallout) {
      if (waiting) {
        const promptTxt = (tut.waitAction === 'double_jump' && step.secondPrompt)
          ? step.secondPrompt
          : step.actionPrompt;
        el.tutRunActionCallout.textContent = promptTxt;
        el.tutRunActionCallout.classList.remove('hidden');
      } else {
        el.tutRunActionCallout.classList.add('hidden');
      }
    }

    if (el.tutRunDots) {
      el.tutRunDots.innerHTML = PLAYABLE_TUTORIAL_STEPS.map((_, idx) => {
        const cls = idx < tut.stepIdx ? ' done' : (idx === tut.stepIdx ? ' active' : '');
        return `<span class="tut-run-dot${cls}"></span>`;
      }).join('');
    }

    clearTutorialHighlights();
    if (waiting) {
      if (step.targetBtn === 'jump' && el.btnJump) el.btnJump.classList.add('tut-highlight');
      else if (step.targetBtn === 'slide' && el.btnSlide) el.btnSlide.classList.add('tut-highlight');
      else if (step.targetBtn === 'umbrella' && el.btnToggleUmbrella) el.btnToggleUmbrella.classList.add('tut-highlight');
      else if (step.targetBtn === 'mask' && el.btnToggleMask) el.btnToggleMask.classList.add('tut-highlight');
    }
  }

  function spawnTutorialStepObstacle(stepId) {
    if (!run) return;
    const startX = getSpawnRight() + 24;
    if (stepId === 'jump') {
      const ob = {
        id: 'tut_cone', name: '도로 라바콘', lane: 'low', w: 32, h: 34, tag: 'wind', sprite: 'sp_traffic_cone',
        x: startX, y: Renderer.GROUND_Y - 34, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 0, isTutObs: true
      };
      run.obstacles.push(ob);
      const cx = startX + ob.w / 2;
      run.items.push(
        { kind: 'coin', x: cx - 42, y: Renderer.GROUND_Y - 52 },
        { kind: 'coin', x: cx,      y: Renderer.GROUND_Y - 82 },
        { kind: 'coin', x: cx + 42, y: Renderer.GROUND_Y - 52 }
      );
    } else if (stepId === 'double_jump') {
      const ob = {
        id: 'tut_barricade', name: '높은 바리케이드', lane: 'tall', w: 46, h: 48, tag: 'wind', sprite: 'sp_barricade',
        x: startX, y: Renderer.GROUND_Y - 48, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 0, isTutObs: true
      };
      run.obstacles.push(ob);
      const cx = startX + ob.w / 2;
      run.items.push(
        { kind: 'coin',     x: cx - 54, y: Renderer.GROUND_Y - 76 },
        { kind: 'big_coin', x: cx,      y: Renderer.GROUND_Y - 118 },
        { kind: 'coin',     x: cx + 54, y: Renderer.GROUND_Y - 76 }
      );
    } else if (stepId === 'slide') {
      const ob = {
        id: 'tut_cloud', name: '황사 모래구름', lane: 'air', w: 52, h: 36, tag: 'dust', sprite: 'sp_dust_cloud', warn: true,
        x: startX, y: Renderer.GROUND_Y - 24 - 36, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 18, isTutObs: true
      };
      run.obstacles.push(ob);
      const cx = startX + ob.w / 2;
      run.items.push(
        { kind: 'coin', x: cx - 28, y: Renderer.GROUND_Y - 12 },
        { kind: 'coin', x: cx,      y: Renderer.GROUND_Y - 12 },
        { kind: 'coin', x: cx + 28, y: Renderer.GROUND_Y - 12 }
      );
    }
  }

  function advanceTutorialStep() {
    if (!run || !run.tut) return;
    const tut = run.tut;
    const curStep = PLAYABLE_TUTORIAL_STEPS[tut.stepIdx];
    if (curStep) {
      SFX.reward();
      run.winPoseTimer = 0.5;
      Renderer.spawnFloater(curStep.successMsg, '#7affb3', run.playerX + 18, run.playerY - 54);
    }
    tut.waitAction = null;
    tut.phase = 'cleared_delay';
    tut.timer = 0.85;
    updateTutorialHudUI();
  }

  function finishTutorialRun(skipped = false) {
    if (!run) return;
    const firstClear = !save.tutorialDone;
    save.tutorialDone = true;
    clearTutorialHighlights();
    if (el.tutRunHud) el.tutRunHud.classList.add('hidden');
    SFX.setWeatherAmbient('clear');
    SFX.setAmbientPaused(false);
    hideWeatherCenterAlert();

    if (skipped) {
      persistSave();
      exitRunToHome();
      showToast('📖 튜토리얼을 건너뛰었습니다. 설정에서 언제든 다시 플레이할 수 있습니다!');
      return;
    }

    if (firstClear) {
      save.gold = (save.gold || 0) + 100;
    }
    persistSave(true);
    refreshAllMenus();

    run.active = false;
    if (run.tut) {
      run.tut.phase = 'done';
      run.tut.waitAction = null;
    }
    SFX.setBgmMode('menu');
    SFX.chestJackpot();

    if (el.tutCompleteReward) {
      el.tutCompleteReward.textContent = firstClear
        ? '🪙 첫 튜토리얼 완료 보너스 +100G 지급!'
        : '✨ 모든 조작 연습을 완벽하게 마쳤습니다!';
    }
    if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.remove('hidden');
  }

  function updateTutorialStep(dt) {
    if (!run || !run.isTutorial || !run.tut) return;
    const tut = run.tut;
    const step = PLAYABLE_TUTORIAL_STEPS[tut.stepIdx];
    if (!step || tut.phase === 'done') return;

    if (tut.autoSlideTimer > 0) {
      tut.autoSlideTimer = Math.max(0, tut.autoSlideTimer - dt);
      run.sliding = true;
      if (tut.autoSlideTimer <= 0 && !run.slideInputHeld) {
        run.sliding = false;
      }
    }

    if (tut.phase === 'cleared_delay') {
      tut.timer -= dt;
      if (tut.timer <= 0) {
        tut.stepIdx += 1;
        if (tut.stepIdx >= PLAYABLE_TUTORIAL_STEPS.length) {
          finishTutorialRun(false);
          return;
        }
        tut.phase = 'intro';
        tut.timer = 0.55;
        tut.spawned = false;
        tut.waitAction = null;
        tut.didFirstJump = false;
        tut.didSecondJump = false;
        tut.covidDeflected = false;
        updateTutorialHudUI();
      }
      return;
    }

    // ---- STEP 1: SINGLE JUMP ----
    if (step.id === 'jump') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          spawnTutorialStepObstacle('jump');
          tut.spawned = true;
          tut.phase = 'active';
        }
      } else if (tut.phase === 'active') {
        const ob = run.obstacles[0];
        if (ob) {
          if (!ob.passed && !tut.didFirstJump && ob.x <= run.playerX + 92 && ob.x > run.playerX + 12 && run.playerY >= Renderer.GROUND_Y - 6) {
            tut.waitAction = 'jump';
            updateTutorialHudUI();
          } else if (ob.passed) {
            advanceTutorialStep();
          }
        } else if (tut.spawned) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 2: DOUBLE JUMP ----
    if (step.id === 'double_jump') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          spawnTutorialStepObstacle('double_jump');
          tut.spawned = true;
          tut.phase = 'active';
        }
      } else if (tut.phase === 'active') {
        const ob = run.obstacles[0];
        if (ob) {
          if (!ob.passed && !tut.didFirstJump && ob.x <= run.playerX + 108 && ob.x > run.playerX + 16 && run.playerY >= Renderer.GROUND_Y - 6) {
            tut.waitAction = 'jump';
            updateTutorialHudUI();
          } else if (!ob.passed && tut.didFirstJump && !tut.didSecondJump && run.jumpsLeft === 1 && run.vy > -105 && run.playerY < Renderer.GROUND_Y - 30) {
            tut.waitAction = 'double_jump';
            updateTutorialHudUI();
          } else if (ob.passed) {
            advanceTutorialStep();
          }
        } else if (tut.spawned) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 3: SLIDE ----
    if (step.id === 'slide') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          spawnTutorialStepObstacle('slide');
          tut.spawned = true;
          tut.phase = 'active';
        }
      } else if (tut.phase === 'active') {
        const ob = run.obstacles[0];
        if (ob) {
          if (!ob.passed && !run.sliding && ob.x <= run.playerX + 118 && ob.x > run.playerX + 10) {
            tut.waitAction = 'slide';
            updateTutorialHudUI();
          } else if (ob.passed) {
            tut.autoSlideTimer = 0;
            if (!run.slideInputHeld) run.sliding = false;
            advanceTutorialStep();
          }
        } else if (tut.spawned) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 4: RAIN -> OPEN UMBRELLA ----
    if (step.id === 'rain_umbrella') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          run.weatherEvent = 'rain';
          run.umbrellaOn = false;
          run.umbrellaActiveTimer = 0;
          SFX.playWeatherCue('rain');
          SFX.setWeatherAmbient('rain');
          showWeatherCenterAlert('rain');
          tut.phase = 'active';
          tut.timer = 0.65;
          for (let i = 0; i < 4; i++) {
            run.items.push({ kind: 'coin', x: getSpawnRight() + 30 + i * 34, y: Renderer.GROUND_Y - 26 });
          }
        }
      } else if (tut.phase === 'active') {
        if (run.umbrellaOn) {
          tut.phase = 'hold_success';
          tut.timer = 1.45;
          updateTutorialHudUI();
        } else {
          tut.timer -= dt;
          if (tut.timer <= 0) {
            tut.waitAction = 'umbrella_on';
            updateTutorialHudUI();
          }
        }
      } else if (tut.phase === 'hold_success') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 5: TYPHOON GUST -> FOLD UMBRELLA ----
    if (step.id === 'gust_fold') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          run.umbrellaOn = true;
          run.umbrellaActiveTimer = GEAR_DURATION;
          run.weatherEvent = 'gust';
          run.gustExposeTimer = 0;
          SFX.playWeatherCue('gust');
          SFX.setWeatherAmbient('gust');
          showWeatherCenterAlert('gust', '⚠️ 제한 시간 안에 우산을 접으세요!');
          tut.phase = 'active';
          tut.timer = 0.72;
        }
      } else if (tut.phase === 'active') {
        if (!run.umbrellaOn) {
          tut.phase = 'hold_success';
          tut.timer = 1.05;
          updateTutorialHudUI();
        } else {
          tut.timer -= dt;
          if (tut.timer <= 0) {
            tut.waitAction = 'umbrella_off';
            updateTutorialHudUI();
          }
        }
      } else if (tut.phase === 'hold_success') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 6: YELLOW DUST -> PUT ON MASK ----
    if (step.id === 'dust_mask') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          run.weatherEvent = 'dust';
          run.maskOn = false;
          run.maskActiveTimer = 0;
          run.maskParryTimer = 0;
          SFX.playWeatherCue('dust');
          SFX.setWeatherAmbient('dust');
          showWeatherCenterAlert('dust');
          tut.phase = 'active';
          tut.timer = 0.65;
          for (let i = 0; i < 4; i++) {
            run.items.push({ kind: 'coin', x: getSpawnRight() + 30 + i * 34, y: Renderer.GROUND_Y - 26 });
          }
        }
      } else if (tut.phase === 'active') {
        if (run.maskOn) {
          tut.phase = 'hold_success';
          tut.timer = 1.45;
          updateTutorialHudUI();
        } else {
          tut.timer -= dt;
          if (tut.timer <= 0) {
            tut.waitAction = 'mask_on';
            updateTutorialHudUI();
          }
        }
      } else if (tut.phase === 'hold_success') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          advanceTutorialStep();
        }
      }
      return;
    }

    // ---- STEP 7: CORONA VIRUS RUSH -> TIMED MASK PARRY ----
    if (step.id === 'covid_parry') {
      if (tut.phase === 'intro') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          run.weatherEvent = 'covid';
          run.maskOn = false;
          run.maskActiveTimer = 0;
          run.maskParryTimer = 0;
          SFX.playWeatherCue('covid_rush');
          SFX.setWeatherAmbient('covid');
          showWeatherCenterAlert('covid_rush');
          run.covidAttack = {
            phase: 'warn',
            timer: 1.05,
            maxTimer: 1.05,
            x: getSpawnRight() - 56,
            y: Math.max(84, run.playerY - 34),
            vx: 0,
            vy: 0,
            checked: false
          };
          tut.spawned = true;
          tut.phase = 'active';
        }
      } else if (tut.phase === 'active') {
        const atk = run.covidAttack;
        if (atk && atk.phase === 'charge' && !atk.checked && atk.x <= run.playerX + 128) {
          if (!(run.maskOn && run.maskParryTimer > 0)) {
            tut.waitAction = 'covid_mask';
            updateTutorialHudUI();
          }
        } else if (atk && atk.phase === 'deflected') {
          tut.covidDeflected = true;
          tut.phase = 'hold_success';
          tut.timer = 0.95;
          updateTutorialHudUI();
        } else if (!atk && tut.spawned) {
          if (tut.covidDeflected) {
            advanceTutorialStep();
          } else {
            tut.phase = 'intro';
            tut.timer = 0.6;
            tut.spawned = false;
          }
        }
      } else if (tut.phase === 'hold_success') {
        tut.timer -= dt;
        if (tut.timer <= 0) {
          advanceTutorialStep();
        }
      }
    }
  }

  function startTutorialRun() {
    if (el.settingsOverlay) el.settingsOverlay.classList.add('hidden');
    startRun({ isTutorial: true });
  }

  function dismissIntroToHome() {
    if (!el.introOverlay || el.introOverlay.classList.contains('hidden')) return;
    try {
      SFX.introJingle();
      SFX.startBgm();
      SFX.setBgmMode('menu');
    } catch {}
    el.introOverlay.classList.add('leaving');
    try { tryAutoLockLandscape(true); } catch {}
    setTimeout(() => {
      el.introOverlay.classList.add('hidden');
      el.introOverlay.classList.remove('playing', 'leaving');
      try { syncMyWeeklyScore(); } catch {}
      try { checkAndAwardWeeklyChampion(); } catch {}
      if (!save.tutorialDone) {
        startTutorialRun();
      }
    }, 340);
  }

  function getSaveVisualSig(s) {
    if (!s) return '';
    const cb = s.chestBag || {};
    return `${s.gold}|${s.gems}|${s.gachaTickets || 0}|${s.mileage || 0}|${s.bestScore}|${s.playCount}|${(s.unlockedSkins || []).length}|${(s.unlockedChars || []).length}|${cb.wood || 0},${cb.silver || 0},${cb.gold || 0},${cb.diamond || 0}|${s.selectedChar}|${JSON.stringify(s.equippedSkins || {})}|${JSON.stringify(s.charLevels || {})}`;
  }

  async function syncAccountWithCloud(profile, opts = {}) {
    const auth = profile || (save && save.auth);
    if (!ONLINE || !auth || !auth.loggedIn || !ONLINE.isRankedProvider(auth.provider) || !auth.uid) {
      return { ok: false, reason: 'not_linked' };
    }
    if (cloudSyncInFlight) return { ok: false, reason: 'busy' };
    if (opts.minIntervalMs && (Date.now() - lastCloudPullAt) < opts.minIntervalMs) {
      return { ok: true, skipped: true };
    }

    cloudSyncInFlight = true;
    if (el.btnLoginSync) {
      el.btnLoginSync.disabled = true;
      el.btnLoginSync.textContent = '동기화 중...';
    }
    try {
      const uid = auth.uid;
      const cloudRes = await ONLINE.loadCloudUserSave(uid);
      lastCloudPullAt = Date.now();

      if (!cloudRes || !cloudRes.ok) {
        renderProfileUI();
        if (opts.manual) {
          const st = cloudRes ? cloudRes.status : 0;
          if (st === 401 || st === 403 || (cloudRes && cloudRes.error === 'permission_denied')) {
            showToast('⚠️ 클라우드 권한 오류(401) · Firebase DB 규칙에 user_saves 게시가 필요합니다!');
          } else if (cloudRes && cloudRes.error === 'no_auth_token') {
            showToast('⚠️ Google 로그인 세션이 만료되었습니다. Google 계정을 다시 연동해 주세요.');
          } else {
            showToast('⚠️ 클라우드 서버 연결 실패 · 네트워크를 확인 후 다시 시도해 주세요.');
          }
        }
        return { ok: false, status: cloudRes ? cloudRes.status : 0 };
      }

      // Initial cloud read succeeded -> safe to enable cloud writes for this UID!
      cloudHydratedUid = uid;
      const cloudData = cloudRes.data;
      const beforeSig = getSaveVisualSig(save);
      const localTsBefore = Number(save.cloudUpdatedAt) || 0;
      const cloudTs = Number(cloudData && cloudData.cloudUpdatedAt) || 0;

      if (cloudData) {
        const merged = mergeCrossDeviceSaves(cloudData, save, { ...auth, loggedIn: true });
        const savedNick = (cloudData.auth && cloudData.auth.nickname) || (save.auth && save.auth.nickname) || auth.nickname;
        merged.auth = { ...auth, loggedIn: true, nickname: savedNick };
        save = merged;
        SFX.applySettings(save.audioSettings);
        previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));

        const afterSig = getSaveVisualSig(save);
        const cloudSig = getSaveVisualSig(hydrateSaveData(cloudData, merged.auth));
        const localChanged = afterSig !== beforeSig;
        const needPushUp = afterSig !== cloudSig || localTsBefore > cloudTs;

        persistSave(false, { localOnly: true, keepTimestamp: !needPushUp });
        if (needPushUp) {
          await ONLINE.saveCloudUserSave(uid, save);
        }
        renderProfileUI();
        refreshAllMenus();
        try { syncMyWeeklyScore(); } catch {}

        if (opts.manual) {
          showToast('☁️ 클라우드 최신 데이터 동기화 완료!');
        } else if (localChanged && !opts.silent) {
          showToast('☁️ 다른 기기의 최신 골드 · 스킨 · 기록을 불러왔습니다!');
        }
        return { ok: true, updated: localChanged };
      } else {
        // First time pushing this account's save to Firebase Cloud
        save.cloudUpdatedAt = save.cloudUpdatedAt || Date.now();
        persistSave(false, { localOnly: true, keepTimestamp: true });
        const pushRes = await ONLINE.saveCloudUserSave(uid, save);
        renderProfileUI();
        if (opts.manual) {
          showToast(pushRes && pushRes.ok
            ? '☁️ 현재 계정 데이터를 클라우드에 백업했습니다!'
            : '⚠️ 클라우드 업로드 실패 · Firebase 규칙(user_saves)을 확인해 주세요.');
        }
        return { ok: Boolean(pushRes && pushRes.ok), uploaded: true };
      }
    } finally {
      cloudSyncInFlight = false;
      if (el.btnLoginSync) {
        el.btnLoginSync.disabled = false;
        el.btnLoginSync.textContent = '☁️ 동기화';
      }
    }
  }

  async function switchToAccount(profile, opts = {}) {
    if (!profile) return;
    // 1. Flush previous different account locally only (Firebase Auth currentUser may already be the newly signed-in account!)
    if (save && save.auth && save.auth.loggedIn && save.auth.uid && save.auth.uid !== profile.uid) {
      persistSave(false, { localOnly: true });
    }

    const isLinked = ONLINE && ONLINE.isRankedProvider(profile.provider);
    const slotKey = getAccountSaveKey(profile);
    const localSlot = parseStorageJson(slotKey);
    let cloudRes = { ok: false, data: null, status: 0 };
    if (isLinked && ONLINE && profile.uid) {
      try { cloudRes = await ONLINE.loadCloudUserSave(profile.uid); } catch {}
      lastCloudPullAt = Date.now();
    }
    const cloudSlot = cloudRes && cloudRes.ok ? cloudRes.data : null;

    activeAuth = { ...profile, loggedIn: true };
    persistActiveAuth(activeAuth);

    if (cloudSlot && localSlot) {
      save = mergeCrossDeviceSaves(cloudSlot, localSlot, activeAuth);
    } else if (cloudSlot) {
      save = hydrateSaveData(cloudSlot, activeAuth);
    } else if (localSlot) {
      save = hydrateSaveData(localSlot, activeAuth);
    } else if (opts.carryGuestSave && save && save.auth && save.auth.provider === 'guest' && hasMeaningfulProgress(save)) {
      const clone = JSON.parse(JSON.stringify(save));
      delete clone.auth;
      save = hydrateSaveData(clone, activeAuth);
    } else {
      save = hydrateSaveData(null, activeAuth);
    }

    // Preserve custom nickname saved in cloud/local for this exact account if present
    const savedNick = (cloudSlot && cloudSlot.auth && cloudSlot.auth.nickname)
      || (localSlot && localSlot.auth && localSlot.auth.nickname);
    save.auth = {
      ...activeAuth,
      nickname: savedNick || activeAuth.nickname
    };

    SFX.applySettings(save.audioSettings);
    previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));

    if (isLinked && cloudRes && cloudRes.ok) {
      cloudHydratedUid = profile.uid;
      // Only push back up if cloud had no save yet or local contributed merged progress
      const cloudSig = cloudSlot ? getSaveVisualSig(hydrateSaveData(cloudSlot, save.auth)) : '';
      const mergedSig = getSaveVisualSig(save);
      const shouldPush = !cloudSlot || cloudSig !== mergedSig;
      persistSave(shouldPush, { localOnly: !shouldPush, keepTimestamp: !shouldPush, forceCloud: shouldPush });
    } else {
      // Cloud read failed (e.g., 401 rules missing or offline) or guest account: save locally ONLY, NEVER overwrite cloud!
      cloudHydratedUid = '';
      persistSave(false, { localOnly: true, keepTimestamp: true });
    }

    if (el.loginOverlay) el.loginOverlay.classList.add('hidden');
    renderProfileUI();
    refreshAllMenus();

    if (isLinked) {
      try { await syncMyWeeklyScore(); } catch {}
      try { checkAndAwardWeeklyChampion(); } catch {}
    }

    const meta = ONLINE ? ONLINE.getProviderMeta(save.auth.provider) : { label: '계정' };
    if (isLinked) {
      if (cloudRes && !cloudRes.ok && (cloudRes.status === 401 || cloudRes.status === 403 || cloudRes.error === 'permission_denied')) {
        showToast('⚠️ 클라우드 DB 권한(401) 오류! Firebase 규칙에 user_saves를 게시해 주세요.');
      } else {
        const restored = Boolean(cloudSlot);
        showToast(restored
          ? `☁️ ${meta.label} [${save.auth.nickname}] 클라우드 데이터 불러오기 완료!`
          : `✅ ${meta.label} [${save.auth.nickname}] 연동 완료! (클라우드 저장 · 랭킹 참여)`);
      }
    } else {
      showToast('👤 게스트로 입장했습니다. (랭킹은 Google 연동 시 참여)');
    }
  }

  let oauthInFlight = false;
  async function handleOAuthLogin(provider, fromIntro = false) {
    if (oauthInFlight || !ONLINE) return;
    try { SFX.click(); } catch {}
    oauthInFlight = true;
    try {
      const res = await ONLINE.signInWithOAuth(provider);
      if (res && res.ok && res.profile) {
        const carryGuest = Boolean(!fromIntro && save.auth && save.auth.provider === 'guest');
        await switchToAccount(res.profile, { carryGuestSave: carryGuest });
        if (fromIntro) dismissIntroToHome();
      } else if (res && res.needsSetup) {
        showToast(`⚙️ ${res.message}`);
        openLoginOverlay();
        if (el.loginSetupNotice) el.loginSetupNotice.classList.remove('hidden');
      } else if (res && res.redirecting) {
        showToast('🔄 로그인 페이지로 이동 중입니다...');
      } else if (res && !res.cancelled && res.message) {
        showToast(`⚠️ ${res.message}`);
      }
    } finally {
      oauthInFlight = false;
    }
  }

  async function handleGuestLogin(fromIntro = false) {
    try { SFX.click(); } catch {}
    const prevGuestUid = (activeAuth && activeAuth.provider === 'guest' && activeAuth.uid) ? activeAuth.uid : '';
    const profile = ONLINE ? ONLINE.createGuestProfile(prevGuestUid) : {
      loggedIn: true, provider: 'guest', uid: prevGuestUid || 'guest_local', nickname: '게스트', email: ''
    };
    await switchToAccount(profile, { carryGuestSave: false });
    if (fromIntro) dismissIntroToHome();
  }

  async function handleLogout() {
    try { SFX.click(); } catch {}
    if (cloudSaveTimer) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
    }
    const prevAuth = save && save.auth;
    persistSave(false, { localOnly: true });
    if (ONLINE && prevAuth && prevAuth.loggedIn && ONLINE.isRankedProvider(prevAuth.provider) && prevAuth.uid && cloudHydratedUid === prevAuth.uid) {
      try { await ONLINE.saveCloudUserSave(prevAuth.uid, save); } catch {}
    }
    cloudHydratedUid = '';
    if (ONLINE) {
      try { await ONLINE.signOutOAuth(); } catch {}
    }
    activeAuth = { loggedIn: false, provider: 'guest', uid: '', nickname: '', email: '' };
    persistActiveAuth(activeAuth);
    save.auth = { ...activeAuth };
    if (el.loginOverlay) el.loginOverlay.classList.add('hidden');
    if (el.settingsOverlay) el.settingsOverlay.classList.add('hidden');
    renderProfileUI();
    if (el.introOverlay) {
      el.introOverlay.classList.remove('hidden', 'leaving');
    }
    showToast('👋 로그아웃되었습니다. 로고 아래에서 계정을 선택해 주세요.');
  }

  async function saveEditedNickname() {
    if (!el.loginNicknameInput) return;
    const raw = el.loginNicknameInput.value.trim();
    if (!raw) {
      showToast('닉네임을 입력해 주세요.');
      return;
    }
    SFX.click();
    const clean = ONLINE ? ONLINE.sanitizeNickname(raw, '날씨러너') : raw.slice(0, 12);
    save.auth = { ...(save.auth || activeAuth), nickname: clean };
    persistSave(true);
    renderProfileUI();
    if (ONLINE && ONLINE.isRankedProvider(save.auth.provider)) {
      try { await syncMyWeeklyScore(); } catch {}
    }
    renderRankingTab();
    showToast(`🏷️ 닉네임이 [${clean}](으)로 저장되었습니다!`);
  }

  // ===================== IN-APP PURCHASE (REAL-MONEY GEM STORE: 100💎 = ₩1,000) =====================
  let pendingGemPack = null;

  function openIapModal(pack) {
    if (!pack || !el.iapOverlay) return;
    SFX.click();
    pendingGemPack = pack;
    if (el.iapPackName) el.iapPackName.textContent = pack.name;
    if (el.iapPackGems) el.iapPackGems.textContent = `+${pack.gems.toLocaleString('ko-KR')} 💎 즉시 지급`;
    if (el.iapPackPrice) el.iapPackPrice.textContent = `₩${pack.krwPrice.toLocaleString('ko-KR')}`;
    const isNativeApp = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (el.iapPayNote) {
      el.iapPayNote.textContent = isNativeApp
        ? `Google Play / App Store 공식 인앱 결제 · 상품ID: ${pack.productId}`
        : `스토어 결제 연동 규격 (100💎 = ₩1,000) · 웹 미리보기에서는 테스트 결제로 보석이 지급됩니다.`;
    }
    if (el.btnIapConfirm) {
      el.btnIapConfirm.textContent = `₩${pack.krwPrice.toLocaleString('ko-KR')} 결제하기`;
    }
    el.iapOverlay.classList.remove('hidden');
  }

  async function confirmIapPurchase() {
    if (!pendingGemPack) return;
    const pack = pendingGemPack;
    // Native Capacitor IAP bridge hook when packaged as Android/iOS store app
    if (window.KWeatherIAP && typeof window.KWeatherIAP.purchase === 'function') {
      try {
        const res = await window.KWeatherIAP.purchase(pack.productId);
        if (!res || res.cancelled) return;
      } catch {
        showToast('결제가 취소되었거나 실패했습니다.');
        return;
      }
    }
    SFX.chestJackpot();
    save.gems = (save.gems || 0) + pack.gems;
    persistSave();
    pendingGemPack = null;
    if (el.iapOverlay) el.iapOverlay.classList.add('hidden');
    refreshAllMenus();
    showToast(`💎 ${pack.name} (₩${pack.krwPrice.toLocaleString('ko-KR')}) 결제 완료! +${pack.gems.toLocaleString('ko-KR')}💎 지급!`);
  }

  // ===================== WEEKLY #1 CHAMPION 500 GEMS AUTOMATIC PAYOUT =====================
  let pendingChampionReward = null;

  async function checkAndAwardWeeklyChampion() {
    if (!ONLINE || !save.auth || !save.auth.loggedIn) return;
    const reward = await ONLINE.checkWeeklyChampionPayout(save);
    if (!reward || !reward.won) return;
    pendingChampionReward = reward;
    if (el.weeklyChampWeek) el.weeklyChampWeek.textContent = `${reward.weekLabel} 주간 최종 1위!`;
    if (el.weeklyChampScore) el.weeklyChampScore.textContent = `우승 점수 ${reward.score.toLocaleString('ko-KR')}점`;
    if (el.weeklyChampGems) el.weeklyChampGems.textContent = `+${reward.gems.toLocaleString('ko-KR')} 💎 보석 지급!`;
    if (el.weeklyChampOverlay) el.weeklyChampOverlay.classList.remove('hidden');
    SFX.chestJackpot();
  }

  function claimWeeklyChampionReward() {
    if (!pendingChampionReward) {
      if (el.weeklyChampOverlay) el.weeklyChampOverlay.classList.add('hidden');
      return;
    }
    const rw = pendingChampionReward;
    pendingChampionReward = null;
    save.gems = (save.gems || 0) + rw.gems;
    save.weeklyRank = save.weeklyRank || { weekKey: getWeekKey(), bestScore: 0, bestDist: 0, bestYear: 1, history: {}, claimedWeeks: [] };
    if (!Array.isArray(save.weeklyRank.claimedWeeks)) save.weeklyRank.claimedWeeks = [];
    if (!save.weeklyRank.claimedWeeks.includes(rw.weekKey)) {
      save.weeklyRank.claimedWeeks.push(rw.weekKey);
    }
    persistSave();
    if (el.weeklyChampOverlay) el.weeklyChampOverlay.classList.add('hidden');
    SFX.chestJackpot();
    refreshAllMenus();
    showToast(`👑 ${rw.weekLabel} 주간 1위 보상 💎 ${rw.gems} 보석 수령 완료!`);
  }

  async function syncMyWeeklyScore() {
    if (!ONLINE || !save.auth || !save.auth.uid) return;
    const info = ensureWeeklyRankCurrentWeek();
    const myChar = getCharDef(save.selectedChar);
    const mySkin = getEquippedSkin(myChar.id);
    const weeklyBest = Math.max(save.weeklyRank.bestScore || 0, 0);
    await ONLINE.submitWeeklyScore({
      weekKey: info.weekKey,
      uid: save.auth.uid,
      nickname: save.auth.nickname || '날씨러너',
      provider: save.auth.provider || 'guest',
      charId: myChar.id,
      skinId: mySkin ? mySkin.id : null,
      score: weeklyBest,
      dist: save.weeklyRank.bestDist || save.bestDistanceM || 0,
      year: save.weeklyRank.bestYear || save.bestYear || 1
    });
  }

  // ===================== HOME / MISSIONS / ATTENDANCE / CHARS / SHOP UI RENDER =====================
  function refreshAllMenus() {
    ensureTodayMissions();
    ensureWeeklyRankCurrentWeek();
    el.uiGold.textContent = save.gold.toLocaleString('ko-KR');
    el.uiGems.textContent = (save.gems || 0).toLocaleString('ko-KR');
    el.headerBestScore.textContent = save.bestScore.toLocaleString('ko-KR');

    renderProfileUI();
    updateNavMissionDot();

    // Render ONLY the currently visible tab (eliminates hidden-tab DOM churn, image downloads & extra Firebase fetches!)
    if (currentTab === 'home') renderHomeCharStage();
    else if (currentTab === 'shop') renderShopList();
    else if (currentTab === 'chars') renderCharList();
    else if (currentTab === 'missions') renderBrawlQuests();
    else if (currentTab === 'rank') renderRankingTab();

    // Render modals ONLY when actively open
    if (el.attendanceOverlay && !el.attendanceOverlay.classList.contains('hidden')) renderAttendanceUI();
    if (el.achievementsOverlay && !el.achievementsOverlay.classList.contains('hidden')) renderAchievementsUI();
    if (el.settingsOverlay && !el.settingsOverlay.classList.contains('hidden')) renderSettingsUI();
    if (detailCharIdx !== null) renderCharDetailModal();
    if (el.scoreRoadOverlay && !el.scoreRoadOverlay.classList.contains('hidden')) renderScoreRoadModal();
    if (el.vaultOverlay && !el.vaultOverlay.classList.contains('hidden')) renderVaultModal();
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
    el.navMissionDot.classList.toggle('hidden', !(hasDaily || hasWeekly || hasAch || hasAtt));
  }

  let rankRenderSeq = 0;

  function updateWeeklyRankCountdownUI() {
    if (!ONLINE) return;
    const info = ONLINE.getWeekInfo();
    if (el.rankWeekLabel) el.rankWeekLabel.textContent = `${info.weekLabel} 주간 랭킹 1위 보상`;
    if (el.rankWeekCountdown) el.rankWeekCountdown.textContent = info.countdownText;
  }

  async function renderRankingTab() {
    const seq = ++rankRenderSeq;
    const info = ensureWeeklyRankCurrentWeek();
    updateWeeklyRankCountdownUI();

    const myChar = getCharDef(save.selectedChar);
    const mySkin = getEquippedSkin(myChar.id);
    const myAuth = save.auth || { provider: 'guest', uid: '', nickname: '게스트' };
    const isLinkedUser = Boolean(ONLINE && ONLINE.isRankedProvider(myAuth.provider));
    const myUid = myAuth.uid || '';
    const myNick = myAuth.nickname || `나 (${myChar.name})`;
    const weeklyBest = save.weeklyRank ? (save.weeklyRank.bestScore || 0) : 0;

    if (el.rankGuestBanner) {
      el.rankGuestBanner.classList.toggle('hidden', isLinkedUser);
    }

    el.rankMyAvatar.src = getSkinAvatar(myChar, mySkin);
    el.rankMyAvatar.style.filter = getSkinFilter(mySkin);
    el.rankMyScoreLine.textContent = isLinkedUser
      ? `이번 주 ${weeklyBest.toLocaleString('ko-KR')}점 · 역대 최고 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · 최장 ${(save.bestDistanceM || 0).toLocaleString('ko-KR')}m`
      : `게스트 기록(비공개) · 역대 최고 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · Google 연동 시 랭킹 등록`;
    el.rankStatYear.textContent = `${save.bestYear || 1}년 차`;
    el.rankStatCoins.textContent = `${(save.totalCoinsEver || 0).toLocaleString('ko-KR')}개`;
    el.rankStatCombo.textContent = `${save.maxDodgeComboEver || 0}연속`;
    el.rankStatDex.textContent = `${save.unlockedChars.length}/${DATA.CHARACTERS.length}`;

    if (!ONLINE) return;
    let curRes = null;
    let prevRes = null;
    try {
      [curRes, prevRes] = await Promise.all([
        ONLINE.fetchWeeklyBoard(info.weekKey, isLinkedUser ? myUid : null),
        ONLINE.fetchWeeklyBoard(info.prevWeekKey, isLinkedUser ? myUid : null)
      ]);
    } catch {
      return;
    }
    if (seq !== rankRenderSeq || !curRes) return;

    // STRICT: Only linked Google/Apple real users appear on the leaderboard (NEVER guests!)
    let board = curRes.board.slice();
    if (isLinkedUser && weeklyBest > 0 && myUid && !board.some((r) => r.isMe)) {
      board.push({
        uid: myUid,
        nickname: myNick,
        provider: myAuth.provider,
        charId: myChar.id,
        skinId: mySkin ? mySkin.id : null,
        score: weeklyBest,
        dist: save.weeklyRank.bestDist || 0,
        year: save.weeklyRank.bestYear || 1,
        isMe: true
      });
      board.sort((a, b) => b.score - a.score);
      board = board.map((e, i) => ({ ...e, rank: i + 1 }));
    }

    const myEntry = isLinkedUser ? board.find((r) => r.isMe) : null;
    el.rankMyPos.textContent = !isLinkedUser ? '게스트 (미등록)' : (myEntry ? `${myEntry.rank}위` : '미참여');

    if (el.rankLivePill) {
      if (curRes.syncedOnline) {
        el.rankLivePill.className = 'rank-live-pill';
        el.rankLivePill.innerHTML = '<span class="live-dot"></span>LIVE 서버';
      } else {
        el.rankLivePill.className = 'rank-live-pill local';
        el.rankLivePill.innerHTML = '📱 로컬 모드';
      }
    }
    if (el.rankOnlineCount) {
      el.rankOnlineCount.textContent = curRes.syncedOnline
        ? `연동 유저 ${board.length}명 참여`
        : `연동 기록 ${board.length}명`;
    }
    if (el.rankLastWinner) {
      if (prevRes && prevRes.board && prevRes.board[0]) {
        const w = prevRes.board[0];
        el.rankLastWinner.textContent = `지난 주(${info.prevWeekLabel}) 1위: 👑 ${w.nickname} (${w.score.toLocaleString('ko-KR')}점 · 💎500 지급)`;
      } else {
        el.rankLastWinner.textContent = '매주 월요일 00:00(KST) 정산 · Google 연동 유저 1위에게 💎 500 보석 지급!';
      }
    }

    el.rankBoardList.innerHTML = '';
    if (board.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rank-empty-card';
      empty.innerHTML = `
        <div class="rank-empty-ico">🏆</div>
        <div class="rank-empty-title">아직 이번 주 연동 유저 랭킹 기록이 없습니다</div>
        <div class="rank-empty-sub">게스트와 봇을 제외하고 <strong>Google 연동 실제 유저만</strong> 표시됩니다.<br/>계정을 연동하고 첫 1위(💎500)를 선점해 보세요!</div>
      `;
      el.rankBoardList.appendChild(empty);
      return;
    }

    board.forEach((entry) => {
      const rank = entry.rank;
      const chDef = getCharDef(entry.charId);
      const skDef = entry.skinId ? DATA.getSkinById(entry.skinId) : null;
      const avSrc = getSkinAvatar(chDef, skDef);
      const avFlt = getSkinFilter(skDef);
      const prov = ONLINE.getProviderMeta(entry.provider);
      const provHtml = entry.provider === 'google'
        ? `<img src="assets/ui/google_logo.png?v=${ASSET_VER}" alt="Google" class="prov-google-img" />`
        : prov.badge;

      const row = document.createElement('div');
      const topClass = rank === 1 ? ' top1' : (rank === 2 ? ' top2' : (rank === 3 ? ' top3' : ''));
      const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `${rank}`));
      row.className = `rank-row${topClass}${entry.isMe ? ' me' : ''}`;
      row.innerHTML = `
        <div class="rank-medal">${medal}</div>
        <img src="${avSrc}" alt="" class="rank-row-avatar" style="${avFlt ? `filter:${avFlt};` : ''}" />
        <div class="rank-row-info">
          <div class="rank-row-name">
            <span class="prov-chip mini ${entry.provider || 'guest'}">${provHtml}</span>
            <span>${entry.nickname}</span>
            ${entry.isMe ? '<span class="item-badge equipped">ME</span>' : ''}
            ${rank === 1 ? '<span class="rank-top1-prize">👑 500💎</span>' : ''}
          </div>
          <div class="rank-row-sub">${entry.year || 1}년 차 · ${(entry.dist || 0).toLocaleString('ko-KR')}m</div>
        </div>
        <div class="rank-row-score">${(entry.score || 0).toLocaleString('ko-KR')}점</div>
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
    el.rngBgmVol.style.setProperty('--pct', `${st.bgmOn ? bgmPct : 0}%`);
    el.lblBgmVol.textContent = `${bgmPct}%`;

    el.chkSfxOn.classList.toggle('on', st.sfxOn);
    el.chkSfxOn.textContent = st.sfxOn ? 'ON' : 'OFF';
    const sfxPct = Math.round(st.sfxVol * 100);
    el.rngSfxVol.value = String(sfxPct);
    el.rngSfxVol.style.setProperty('--pct', `${st.sfxOn ? sfxPct : 0}%`);
    el.lblSfxVol.textContent = `${sfxPct}%`;
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
    if (currentQuestSubtab !== 'daily' && currentQuestSubtab !== 'weekly' && currentQuestSubtab !== 'ach') {
      currentQuestSubtab = 'daily';
    }
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
          },
          onStore: () => {
            save.dailyMissions.claimed[m.id] = true;
            save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
            save.chestBag[m.rewardChest] = (save.chestBag[m.rewardChest] || 0) + 1;
            SFX.reward();
            persistSave();
            refreshAllMenus();
            showToast(`📦 ${chest.name}가 상자 보관함에 저장되었습니다!`);
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
          },
          onStore: () => {
            save.weeklyMissions.claimed[m.id] = true;
            save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
            save.chestBag[m.rewardChest] = (save.chestBag[m.rewardChest] || 0) + 1;
            SFX.reward();
            persistSave();
            refreshAllMenus();
            showToast(`📦 ${chest.name}가 상자 보관함에 저장되었습니다!`);
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
          },
          onStore: () => {
            save.achievementsClaimed[a.id] = true;
            save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
            save.chestBag[a.rewardChest] = (save.chestBag[a.rewardChest] || 0) + 1;
            SFX.reward();
            persistSave();
            refreshAllMenus();
            showToast(`📦 ${chest.name}가 상자 보관함에 저장되었습니다!`);
          }
        }));
      });
    }
  }

  function createBrawlQuestCard({ tierClass, tag, icon, title, progText, pct, chest, isDone, isClaimed, onClaim, onStore }) {
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

    const actionCol = document.createElement('div');
    actionCol.className = 'bs-qreward-col';

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
    actionCol.appendChild(rwBtn);

    if (isDone && !isClaimed && typeof onStore === 'function') {
      const storeBtn = document.createElement('button');
      storeBtn.type = 'button';
      storeBtn.className = 'bs-qstore-btn';
      storeBtn.textContent = '📦 보관';
      storeBtn.title = '상자 보관함에 저장';
      storeBtn.onclick = onStore;
      actionCol.appendChild(storeBtn);
    }

    card.appendChild(actionCol);
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
    const homePose = (skin && skin.customIdleFrames) ? 'idle' : 'run';
    el.homeHeroImg.src = `assets/chars/${anim.skin}_${homePose}_0.png?v=${ASSET_VER}`;
    el.homeHeroImg.alt = skin ? `${ch.name} (${skin.name})` : ch.name;
    el.homeHeroImg.style.filter = getSkinFilter(skin);
    el.homeHeroImg.style.setProperty('--skin-glow', skin ? skin.glow : '');
    if (el.homeHeroAura) {
      const hasAura = Boolean(unlocked && skin && skin.customAuraPrefix);
      el.homeHeroAura.classList.toggle('hidden', !hasAura);
      if (hasAura) {
        el.homeHeroAura.src = `assets/chars/${skin.customAuraPrefix}_0.png?v=${ASSET_VER}`;
      }
    }
    el.homeCharLvBadge.textContent = unlocked ? `POWER ${stats.level}` : '잠금';
    el.homeCharTier.textContent = unlocked
      ? (skin ? `✨ ${skin.name}` : ch.tier)
      : `🔒 ${ch.price.toLocaleString('ko-KR')}G`;
    el.homeCharName.textContent = ch.name;

    // Brawl Stars Bottom-Left Chest Vault Button (상자 보관함)
    const vaultTotal = getTotalBagChests();
    if (el.homeVaultCount) el.homeVaultCount.textContent = `보유 ${vaultTotal}개`;
    if (el.btnHomeVault) el.btnHomeVault.classList.toggle('has-chests', vaultTotal > 0);
    if (el.homeVaultDot) {
      el.homeVaultDot.classList.toggle('hidden', vaultTotal <= 0);
      el.homeVaultDot.textContent = vaultTotal > 99 ? '99+' : String(vaultTotal);
    }

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

  const homeHeroPreloadCache = {};

  function getPreloadedHomeHeroSrc(src) {
    let img = homeHeroPreloadCache[src];
    if (!img) {
      img = new Image();
      img.src = src;
      homeHeroPreloadCache[src] = img;
    }
    return img.complete && img.naturalWidth > 0 ? src : null;
  }

  let lastHomeAnimUpdate = 0;
  function updateHomeRunningHero(t) {
    if (currentTab !== 'home') return;
    if (el.introOverlay && !el.introOverlay.classList.contains('hidden')) return;
    if (el.loginOverlay && !el.loginOverlay.classList.contains('hidden')) return;
    if (t - lastHomeAnimUpdate < 0.055) return;
    lastHomeAnimUpdate = t;
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const skin = getEquippedSkin(ch.id);
    const anim = getCharAnimSpec(ch, skin);
    const useIdle = Boolean(skin && skin.customIdleFrames);
    const frameCnt = useIdle ? skin.customIdleFrames : anim.frames;
    const fps = useIdle ? 6.5 : (frameCnt >= 6 ? 13 : (frameCnt >= 3 ? 9.5 : 7.5));
    const frame = Math.floor(t * fps) % frameCnt;
    const src = `assets/chars/${anim.skin}_${useIdle ? 'idle' : 'run'}_${frame}.png?v=${ASSET_VER}`;
    const readySrc = getPreloadedHomeHeroSrc(src);
    if (readySrc && readySrc !== lastHomeHeroSrc) {
      lastHomeHeroSrc = readySrc;
      el.homeHeroImg.src = readySrc;
    }
    if (el.homeHeroAura && skin && skin.customAuraPrefix && isCharUnlocked(ch.id)) {
      const af = Math.floor(t * 9) % (skin.customAuraFrames || 6);
      const auraSrc = `assets/chars/${skin.customAuraPrefix}_${af}.png?v=${ASSET_VER}`;
      const readyAura = getPreloadedHomeHeroSrc(auraSrc);
      if (readyAura && el.homeHeroAura.getAttribute('src') !== readyAura) {
        el.homeHeroAura.src = readyAura;
      }
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
    showToast(`⬆️ ${ch.name} Lv.${nextLv} 성장 완료! (골드·점수 +5%)`);
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
        const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.rare;
        const milPrice = getSkinMileagePrice(sk);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `skin-chip rar-${sk.rarity}${isEq ? ' active' : ''}${owned ? '' : ' locked'}`;
        chip.innerHTML = `
          <span class="skin-dot" style="background:${sk.glow || rar.color}"></span>
          <span>${sk.name}</span>
          <span class="skin-rar-mini" style="color:${rar.color}">${owned ? (isEq ? '✓' : rar.name) : `✨${milPrice}M`}</span>
        `;
        chip.onclick = () => {
          if (owned) {
            SFX.click();
            save.equippedSkins[ch.id] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`✨ [${sk.name}] 스킨 장착 완료!`);
          } else {
            SFX.click();
            closeCharDetail();
            currentShopSubtab = 'skins';
            switchTab('shop');
            showToast(`✨ 상점 [스킨 교환]에서 ${milPrice} 마일리지로 교환하거나 [뽑기]에서 획득하세요!`);
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
    if (!['gacha', 'chests', 'skins', 'gold', 'gems', 'boosters'].includes(currentShopSubtab)) {
      currentShopSubtab = 'gacha';
    }
    document.querySelectorAll('.subtab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.shoptab === currentShopSubtab);
    });

    el.shopItemsList.innerHTML = '';

    if (currentShopSubtab === 'gacha') {
      // COOKIE RUN STYLE COSMIC SKIN GACHA SCREEN (1-PULL / 10-PULL · SKINS ONLY · ALL RARITIES!)
      const cost1 = computeGachaCost(1);
      const cost10 = computeGachaCost(10);
      const fmtCostHtml = (c) => {
        if (c.useTickets > 0 && c.needGems > 0) {
          return `<span class="gc-cost-line">${ticketIconHtml('btn')} ${c.useTickets} + 💎 ${c.needGems.toLocaleString('ko-KR')}</span>`;
        }
        if (c.useTickets > 0) {
          return `<span class="gc-cost-line">${ticketIconHtml('btn')} ${c.useTickets}</span>`;
        }
        return `<span class="gc-cost-line">💎 ${c.needGems.toLocaleString('ko-KR')}</span>`;
      };

      const stage = document.createElement('div');
      stage.className = 'gacha-screen';
      stage.innerHTML = `
        <aside class="gacha-sidebar">
          <div class="gacha-side-title">🎰 스킨 뽑기</div>
          <button type="button" class="gacha-banner-thumb active" data-gaction="stay">
            <span class="gacha-pickup-tag">PickUp!</span>
            <img src="assets/chars/port_hades.png?v=${ASSET_VER}" alt="상시 스킨 뽑기" class="gacha-thumb-art" />
            <div class="gacha-thumb-txt">
              <strong>상시 스킨 뽑기</strong>
              <span>전 등급 출현</span>
            </div>
          </button>
          <button type="button" class="gacha-banner-thumb exchange" data-gaction="exchange">
            <img src="assets/chars/port_catgirl.png?v=${ASSET_VER}" alt="마일리지 스킨 교환" class="gacha-thumb-art" />
            <div class="gacha-thumb-txt">
              <strong>✨ 스킨 교환소</strong>
              <span>보유 ${(save.mileage || 0).toLocaleString('ko-KR')}M</span>
            </div>
          </button>
          <button type="button" class="gacha-banner-thumb vault" data-gaction="vault">
            <img src="assets/ui/gacha_ticket.png?v=${ASSET_VER}" alt="뽑기권 교환" class="gacha-thumb-art ticket-art" />
            <div class="gacha-thumb-txt">
              <strong>뽑기권 교환</strong>
              <span>보관함 상자 사용</span>
            </div>
          </button>
        </aside>

        <div class="gacha-main-stage">
          <div class="gacha-stars" aria-hidden="true"></div>
          <div class="gacha-nebula" aria-hidden="true"></div>

          <div class="gacha-top-row">
            <button type="button" class="gacha-pill-btn" data-gaction="history">📜 뽑기 내역</button>
            <div class="gacha-cur-bar">
              <button type="button" class="gacha-cur-chip mileage" data-gaction="exchange" title="마일리지 스킨 교환">
                <span>✨</span><strong>${(save.mileage || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
              <button type="button" class="gacha-cur-chip ticket" data-gaction="vault" title="상자 보관함에서 뽑기권 교환">
                ${ticketIconHtml('lg')}<strong>${(save.gachaTickets || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
              <button type="button" class="gacha-cur-chip gem" data-gaction="gems" title="보석 상점">
                <span>💎</span><strong>${(save.gems || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
            </div>
          </div>

          <div class="gacha-hero-zone">
            <div class="gacha-title-col">
              <div class="gacha-main-title">상시 스킨 뽑기</div>
              <div class="gacha-sub-strip">
                <span>1회 뽑기 <strong>✨ +2M</strong> · 중복 스킨 시 <strong>✨ +2M 추가!</strong> · 희귀·영웅·전설·<strong>신화</strong> 출현</span>
              </div>
              <div class="gacha-rate-chips">
                <span class="gr-chip mythic">신화 2%</span>
                <span class="gr-chip leg">전설 8%</span>
                <span class="gr-chip epic">영웅 20%</span>
                <span class="gr-chip rare">희귀 70%</span>
              </div>
            </div>

            <div class="gacha-showcase-collage" aria-hidden="true">
              <img src="assets/chars/hades_aura_0.png?v=${ASSET_VER}" alt="" class="gc-art-aura" />
              <img src="assets/chars/port_hanbok.png?v=${ASSET_VER}" alt="" class="gc-art-side left-far" />
              <img src="assets/chars/port_catgirl.png?v=${ASSET_VER}" alt="" class="gc-art-side left" />
              <img src="assets/chars/port_hades.png?v=${ASSET_VER}" alt="" class="gc-art-center" />
              <img src="assets/chars/port_blue.png?v=${ASSET_VER}" alt="" class="gc-art-side right" />
              <img src="assets/chars/port_yellow.png?v=${ASSET_VER}" alt="" class="gc-art-side right-far" />
            </div>
          </div>

          <div class="gacha-bottom-row">
            <button type="button" class="gacha-pill-btn prob" data-gaction="prob">📊 상세 확률</button>
            <div class="gacha-pull-group">
              <div class="gacha-pull-note">${ticketIconHtml('xs')} 뽑기권 우선 사용 · 부족 시 💎 200 보석 / 1회</div>
              <div class="gacha-pull-btns">
                <button type="button" class="gacha-green-btn pull-1" data-gaction="pull1">
                  ${fmtCostHtml(cost1)}
                  <span class="gc-pull-lbl">1회 뽑기</span>
                </button>
                <button type="button" class="gacha-green-btn pull-10" data-gaction="pull10">
                  ${fmtCostHtml(cost10)}
                  <span class="gc-pull-lbl">10회 연속 뽑기</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      stage.querySelectorAll('[data-gaction]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.gaction;
          if (act === 'pull1') performSkinGacha(1);
          else if (act === 'pull10') performSkinGacha(10);
          else if (act === 'history') openGachaHistoryModal();
          else if (act === 'prob') openProbModal();
          else if (act === 'exchange') {
            SFX.click();
            currentShopSubtab = 'skins';
            renderShopList();
          } else if (act === 'vault') {
            openVaultModal();
          } else if (act === 'gems') {
            SFX.click();
            currentShopSubtab = 'gems';
            renderShopList();
          }
        });
      });

      el.shopItemsList.appendChild(stage);
    } else if (currentShopSubtab === 'chests') {
      const sec = document.createElement('div');
      sec.className = 'bs-shop-section';
      sec.innerHTML = `
        <div class="bs-shop-sec-head chests">
          <span class="bs-shop-sec-title">🎁 상자 상점</span>
          <span class="bs-shop-sec-sub">나무·은 상자는 골드, 황금(40💎)·다이아(100💎)는 보석 구매! 보관함에서 뽑기권 교환 가능</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid four';

      DATA.CHEST_ORDER.forEach((tierId) => {
        const chest = DATA.CHESTS[tierId];
        const pityInfo = tierId === 'gold'
          ? `👑 영웅+ 천장 ${save.pity.gold || 0}/10`
          : (tierId === 'diamond'
            ? `💎 전설 천장 ${save.pity.diamond || 0}/15`
            : `🪙 ${chest.goldRange[0]}~${chest.goldRange[1]}G`);
        const rateSummary = tierId === 'wood'
          ? '희귀 23% · 영웅 1.5% · 💎 0.5%'
          : (tierId === 'silver'
            ? '희귀 30% · 영웅 3% · 💎 2%'
            : (tierId === 'gold'
              ? '희귀 25% · 영웅 17% · 전설 3%'
              : '영웅 30% · 전설 25% · 💎 10%'));

        const card = document.createElement('div');
        card.className = `bs-offer-card tier-${tierId}`;
        card.innerHTML = `
          <div class="bs-offer-ribbon">${pityInfo}</div>
          <div class="bs-offer-stage">
            <div class="bs-offer-rays"></div>
            <img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="bs-offer-img chest" />
          </div>
          <div class="bs-offer-name">${chest.name}</div>
          <div class="bs-offer-sub">${rateSummary}</div>
        `;

        const foot = document.createElement('div');
        foot.className = 'bs-offer-foot';

        if (chest.shopGold) {
          const gBtn = document.createElement('button');
          gBtn.type = 'button';
          gBtn.className = 'bs-buy-btn gold';
          gBtn.textContent = `🪙 ${chest.shopGold.toLocaleString('ko-KR')}`;
          gBtn.disabled = save.gold < chest.shopGold;
          gBtn.onclick = () => {
            if (save.gold < chest.shopGold) return;
            save.gold -= chest.shopGold;
            persistSave();
            refreshAllMenus();
            openChestModal(tierId);
          };
          foot.appendChild(gBtn);
        }

        if (chest.shopGems) {
          const dBtn = document.createElement('button');
          dBtn.type = 'button';
          dBtn.className = 'bs-buy-btn gem';
          dBtn.textContent = `💎 ${chest.shopGems}`;
          dBtn.disabled = (save.gems || 0) < chest.shopGems;
          dBtn.onclick = () => {
            if ((save.gems || 0) < chest.shopGems) return;
            save.gems -= chest.shopGems;
            persistSave();
            refreshAllMenus();
            openChestModal(tierId);
          };
          foot.appendChild(dBtn);
        }

        card.appendChild(foot);
        grid.appendChild(card);
      });

      sec.appendChild(grid);
      el.shopItemsList.appendChild(sec);
    } else if (currentShopSubtab === 'skins') {
      // MILEAGE SKIN EXCHANGE TAB (NO GEM DIRECT PURCHASE! 희귀 10M · 영웅 30M · 전설 50M · 신화 200M)
      const curMileage = save.mileage || 0;
      const topBar = document.createElement('div');
      topBar.className = 'mileage-exchange-bar';
      topBar.innerHTML = `
        <div class="mil-bar-left">
          <span class="mil-bar-badge">✨ 보유 마일리지 <strong>${curMileage.toLocaleString('ko-KR')}</strong></span>
          <span class="mil-bar-rates">희귀 10M · 영웅 30M · 전설 50M · 신화 200M (보석 직접 구매 불가)</span>
        </div>
        <button type="button" class="cr-gold-btn mil-go-gacha-btn">🎰 스킨 뽑기 (+2M/회)</button>
      `;
      topBar.querySelector('.mil-go-gacha-btn').onclick = () => {
        SFX.click();
        currentShopSubtab = 'gacha';
        renderShopList();
      };
      el.shopItemsList.appendChild(topBar);

      const rarRank = { mythic: 4, legendary: 3, epic: 2, rare: 1 };
      const sortedSkins = [...DATA.SKINS].sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0));
      const mythicSkins = sortedSkins.filter((s) => s.rarity === 'mythic');
      const otherSkins = sortedSkins.filter((s) => s.rarity !== 'mythic');

      // Featured Mythic Showcase Banner (Mileage 200 Exchange!)
      if (mythicSkins.length > 0) {
        const featSec = document.createElement('div');
        featSec.className = 'bs-shop-section';
        featSec.innerHTML = `
          <div class="bs-shop-sec-head mythic">
            <span class="bs-shop-sec-title">🌟 신화 스페셜 스킨 (스킨 뽑기 · ✨ 200 마일리지)</span>
            <span class="bs-shop-sec-sub">스킨 뽑기에서 획득하거나 200 마일리지로 확정 교환!</span>
          </div>
        `;
        mythicSkins.forEach((sk) => {
          const owned = save.unlockedSkins.includes(sk.id);
          const ownerChar = getCharDef(sk.charId);
          const milPrice = getSkinMileagePrice(sk);
          const isEq = save.equippedSkins[sk.charId] === sk.id;
          const hero = document.createElement('div');
          hero.className = 'bs-mythic-hero-banner';
          hero.innerHTML = `
            <div class="bs-mythic-rays"></div>
            <div class="bs-mythic-art-wrap">
              <img src="${getSkinAvatar(ownerChar, sk)}" alt="${sk.name}" class="bs-mythic-art" />
            </div>
            <div class="bs-mythic-info">
              <div class="bs-mythic-badges">
                <span class="skin-rar-pill" style="background:#8a144d;color:#ff80c2">신화 MYTHIC</span>
                <span class="bs-mythic-exclusive">뽑기 · 마일리지 교환</span>
              </div>
              <div class="bs-mythic-name">${sk.name}</div>
              <div class="bs-mythic-desc">${ownerChar.name} · ${sk.desc || '전용 애니메이션 & 이펙트'}</div>
            </div>
          `;
          const btn = document.createElement('button');
          btn.type = 'button';
          if (owned) {
            btn.className = isEq ? 'bs-buy-btn done' : 'bs-buy-btn equip';
            btn.textContent = isEq ? '장착 중' : '장착하기';
            btn.disabled = isEq;
            btn.onclick = () => {
              SFX.click();
              save.equippedSkins[sk.charId] = sk.id;
              persistSave();
              refreshAllMenus();
              showToast(`✨ [${sk.name}] 스킨 장착 완료!`);
            };
          } else {
            btn.className = 'bs-buy-btn mileage big';
            btn.textContent = `✨ ${milPrice} 마일리지`;
            btn.onclick = () => {
              if ((save.mileage || 0) < milPrice) {
                SFX.click();
                currentShopSubtab = 'gacha';
                renderShopList();
                showToast(`✨ 마일리지가 부족합니다! (보유 ${save.mileage || 0} / 필요 ${milPrice}) 스킨 뽑기 1회당 +2 마일리지!`);
                return;
              }
              SFX.chestJackpot();
              save.mileage -= milPrice;
              save.unlockedSkins.push(sk.id);
              save.equippedSkins[sk.charId] = sk.id;
              persistSave(true);
              refreshAllMenus();
              showToast(`✨ [${sk.name}] 마일리지 교환 및 즉시 장착 완료!`);
            };
          }
          hero.appendChild(btn);
          featSec.appendChild(hero);
        });
        el.shopItemsList.appendChild(featSec);
      }

      // Skin Exchange Grid (Rare 10M · Epic 30M · Legendary 50M)
      const gridSec = document.createElement('div');
      gridSec.className = 'bs-shop-section';
      gridSec.innerHTML = `
        <div class="bs-shop-sec-head skins">
          <span class="bs-shop-sec-title">✨ 스킨 마일리지 교환소</span>
          <span class="bs-shop-sec-sub">희귀 10M · 영웅 30M · 전설 50M · 신화 200M</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid skins';

      otherSkins.forEach((sk) => {
        const owned = save.unlockedSkins.includes(sk.id);
        const ownerChar = getCharDef(sk.charId);
        const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.rare;
        const milPrice = getSkinMileagePrice(sk);
        const isEq = save.equippedSkins[sk.charId] === sk.id;
        const skAv = getSkinAvatar(ownerChar, sk);
        const skFlt = getSkinFilter(sk);

        const card = document.createElement('div');
        card.className = `bs-offer-card skin-card rar-${sk.rarity}${isEq ? ' selected' : ''}`;
        card.innerHTML = `
          <div class="bs-offer-ribbon" style="background:${rar.bg};color:${rar.color}">${rar.name}</div>
          <div class="bs-offer-stage">
            <div class="bs-offer-rays"></div>
            <img src="${skAv}" alt="${sk.name}" class="bs-offer-img skin" style="${skFlt ? `filter:${skFlt};` : ''}" />
          </div>
          <div class="bs-offer-name">${sk.name}</div>
          <div class="bs-offer-sub">${ownerChar.name}</div>
        `;

        const foot = document.createElement('div');
        foot.className = 'bs-offer-foot';
        const btn = document.createElement('button');
        btn.type = 'button';
        if (owned) {
          btn.className = isEq ? 'bs-buy-btn done' : 'bs-buy-btn equip';
          btn.textContent = isEq ? '장착 중' : '장착';
          btn.disabled = isEq;
          btn.onclick = () => {
            SFX.click();
            save.equippedSkins[sk.charId] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`✨ [${sk.name}] 스킨 장착 완료!`);
          };
        } else {
          btn.className = 'bs-buy-btn mileage';
          btn.textContent = `✨ ${milPrice}M`;
          btn.onclick = () => {
            if ((save.mileage || 0) < milPrice) {
              SFX.click();
              currentShopSubtab = 'gacha';
              renderShopList();
              showToast(`✨ 마일리지가 부족합니다! (보유 ${save.mileage || 0}M / 필요 ${milPrice}M) 스킨 뽑기를 이용해 보세요!`);
              return;
            }
            SFX.chestJackpot();
            save.mileage -= milPrice;
            save.unlockedSkins.push(sk.id);
            save.equippedSkins[sk.charId] = sk.id;
            persistSave(true);
            refreshAllMenus();
            showToast(`✨ [${sk.name}] 마일리지 교환 및 장착 완료!`);
          };
        }
        foot.appendChild(btn);
        card.appendChild(foot);
        grid.appendChild(card);
      });

      gridSec.appendChild(grid);
      el.shopItemsList.appendChild(gridSec);
    } else if (currentShopSubtab === 'gold') {
      // BRAWL STARS GOLD PACKS (BOUGHT WITH GEMS!)
      const sec = document.createElement('div');
      sec.className = 'bs-shop-section';
      sec.innerHTML = `
        <div class="bs-shop-sec-head gold">
          <span class="bs-shop-sec-title">🪙 골드 상점</span>
          <span class="bs-shop-sec-sub">💎 보석으로 골드를 즉시 교환하세요!</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid four';

      (DATA.GOLD_PACKS || []).forEach((pk) => {
        const card = document.createElement('div');
        card.className = `bs-offer-card gold-pack tier-${pk.tier}`;
        card.innerHTML = `
          ${pk.bonusTag ? `<div class="bs-offer-ribbon bonus">${pk.bonusTag}</div>` : '<div class="bs-offer-ribbon">골드 교환</div>'}
          <div class="bs-offer-stage gold-stage">
            <div class="bs-offer-rays"></div>
            <img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="${pk.name}" class="bs-offer-img coin ${pk.tier}" />
          </div>
          <div class="bs-offer-bigval gold">+${pk.gold.toLocaleString('ko-KR')} G</div>
          <div class="bs-offer-sub">${pk.name}</div>
        `;
        const foot = document.createElement('div');
        foot.className = 'bs-offer-foot';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bs-buy-btn gem';
        btn.textContent = `💎 ${pk.gemCost.toLocaleString('ko-KR')}`;
        btn.onclick = () => {
          if ((save.gems || 0) < pk.gemCost) {
            SFX.click();
            currentShopSubtab = 'gems';
            renderShopList();
            showToast('💎 보석이 부족합니다! 보석 상점에서 충전할 수 있어요.');
            return;
          }
          SFX.buy();
          save.gems -= pk.gemCost;
          save.gold += pk.gold;
          persistSave();
          refreshAllMenus();
          showToast(`🪙 ${pk.gold.toLocaleString('ko-KR')} 골드 구매 완료!`);
        };
        foot.appendChild(btn);
        card.appendChild(foot);
        grid.appendChild(card);
      });

      sec.appendChild(grid);
      el.shopItemsList.appendChild(sec);
    } else if (currentShopSubtab === 'gems') {
      // BRAWL STARS REAL-MONEY GEM SHOP (EXACT 100💎 = ₩1,000!)
      const sec = document.createElement('div');
      sec.className = 'bs-shop-section';
      sec.innerHTML = `
        <div class="bs-shop-sec-head gems">
          <span class="bs-shop-sec-title">💎 보석 상점</span>
          <span class="bs-shop-sec-sub">100💎 = ₩1,000 정가 · 스킨 뽑기(200💎) · 골드 · 황금/다이아 상자 구매에 사용!</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid four';

      (DATA.GEM_PACKS || []).forEach((pk) => {
        const card = document.createElement('div');
        card.className = `bs-offer-card gem-pack tier-${pk.tier}`;
        card.innerHTML = `
          <div class="bs-offer-ribbon gem-rib" style="background:${pk.accent};color:#08162c">${pk.badge}</div>
          <div class="bs-offer-stage gem-stage">
            <div class="bs-offer-rays"></div>
            <div class="bs-gem-pile ${pk.tier}" aria-hidden="true">${pk.tier === 'xl' ? '💎💎💎' : (pk.tier === 'lg' ? '💎💎' : '💎')}</div>
          </div>
          <div class="bs-offer-bigval gem">${pk.gems.toLocaleString('ko-KR')} 💎</div>
          <div class="bs-offer-sub">${pk.name}</div>
        `;
        const foot = document.createElement('div');
        foot.className = 'bs-offer-foot';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bs-buy-btn cash';
        btn.textContent = `₩${pk.krwPrice.toLocaleString('ko-KR')}`;
        btn.onclick = () => openIapModal(pk);
        foot.appendChild(btn);
        card.appendChild(foot);
        grid.appendChild(card);
      });

      sec.appendChild(grid);
      el.shopItemsList.appendChild(sec);
    } else {
      // 1-RUN WEATHER BOOSTERS (PERMANENT UPGRADES REMOVED!)
      const bstSec = document.createElement('div');
      bstSec.className = 'bs-shop-section';
      bstSec.innerHTML = `
        <div class="bs-shop-sec-head boosters">
          <span class="bs-shop-sec-title">⚡ 1회용 기상 부스터</span>
          <span class="bs-shop-sec-sub">구매 시 다음 달리기에 자동 장착됩니다!</span>
        </div>
      `;
      const bstGrid = document.createElement('div');
      bstGrid.className = 'bs-shop-grid three';

      DATA.BOOSTERS.forEach((b) => {
        const ownedQty = save.boosters[b.id] || 0;
        const card = document.createElement('div');
        card.className = 'bs-offer-card booster-card';
        card.innerHTML = `
          <div class="bs-offer-ribbon">보유 ${ownedQty}개</div>
          <div class="bs-offer-stage">
            <img src="${b.icon}" alt="${b.name}" class="bs-offer-img upg" />
          </div>
          <div class="bs-offer-name">${b.name}</div>
          <div class="bs-offer-sub">${b.desc}</div>
        `;
        const foot = document.createElement('div');
        foot.className = 'bs-offer-foot';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bs-buy-btn gold';
        btn.textContent = `🪙 ${b.price.toLocaleString('ko-KR')}`;
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
        foot.appendChild(btn);
        card.appendChild(foot);
        bstGrid.appendChild(card);
      });
      bstSec.appendChild(bstGrid);
      el.shopItemsList.appendChild(bstSec);
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

  // ===================== RUNNER ENGINE (WEATHER PHYSICS + GEAR + CORONA EVENT) =====================
  const GEAR_DURATION = 10.0;
  const MASK_PARRY_WINDOW = 3.5;
  const UMBRELLA_BROKEN_CD = 5.0;
  const COVID_WALKER_PRESET = {
    id: 'covid_walker',
    name: '코로나 확진자',
    lane: 'low',
    w: 28,
    h: 44,
    tag: 'covid',
    sprite: 'sp_covid_walker',
    speedBonus: 8
  };

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

  function startRun(opts = {}) {
    const isTutorial = Boolean(opts && opts.isTutorial);
    const ch = getCharDef(save.selectedChar);
    const stats = getCharStats(ch);
    const skinDef = getEquippedSkin(ch.id);
    const maxHp = stats.maxHp;

    let hasShield = false;
    let startFever = 0;
    if (!isTutorial) {
      if (save.boosters.shield > 0) { save.boosters.shield -= 1; hasShield = true; }
      if (save.boosters.boost > 0) { save.boosters.boost -= 1; startFever = 4.5; }
      persistSave();
    }

    paused = false;
    releaseAllControlButtons();
    Renderer.clearFloaters();

    run = {
      isTutorial,
      tut: isTutorial ? {
        stepIdx: 0,
        phase: 'intro',
        timer: 0.65,
        spawned: false,
        waitAction: null,
        autoSlideTimer: 0,
        didFirstJump: false,
        didSecondJump: false,
        covidDeflected: false
      } : null,
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
      baseSpeed: isTutorial ? 186 : 196,
      speed: isTutorial ? 186 : 196,

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

      // Strategic Gear Toggles (Zero Cooldown · 10s Auto-Off) + Weather Exposure Timers
      umbrellaOn: false,
      umbrellaActiveTimer: 0,
      umbrellaCooldown: 0,
      umbrellaBrokenTimer: 0,
      maskOn: false,
      maskActiveTimer: 0,
      maskParryTimer: 0,
      maskCooldown: 0,
      rainExposeTimer: 0,
      dustExposeTimer: 0,
      gustExposeTimer: 0,
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
      mudBlindTimer: 0,
      heatGauge: 0, // Summer sun heat (0..100)
      shadeScoreCd: 0,
      hitPoseTimer: 0,
      itemPoseTimer: 0,
      winPoseTimer: 0,

      // Live Korean Weather Cycle State Machine (Clean Direct Weather System)
      weatherEvent: 'clear',
      weatherEventTimer: 3.5,
      pendingWeather: null,
      weatherPrepTimer: 0,

      // Street Features, Passing Car & Corona Virus Rush Event
      features: [],
      featureCd: 2.2,
      convStoreCd: 13.0,
      passingCar: null,
      passingCarCd: 5.5,
      covidAttack: null,
      covidAttackCd: 0,

      // Obstacles & Collectibles
      obstacleCd: 1.5,
      itemCd: 2.6,
      obstacles: [],
      items: [],
      lastHitCause: '극한 한국 날씨에 체력이 다했습니다!'
    };

    if (Renderer && Renderer.preloadForRun) Renderer.preloadForRun(ch, skinDef, 'spring');
    el.runPortraitImg.src = getSkinAvatar(ch, skinDef);
    el.runPortraitImg.style.filter = getSkinFilter(skinDef);
    el.runCanvasWrap.classList.toggle('fever-active', startFever > 0);
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    el.gameoverOverlay.classList.add('hidden');
    if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.add('hidden');
    el.pauseOverlay.classList.add('hidden');
    el.viewRun.classList.remove('hidden');
    if (Renderer && Renderer.invalidateCanvasSize) Renderer.invalidateCanvasSize();
    resetHudCache();
    updateTutorialHudUI();

    SFX.startBgm();
    SFX.setBgmMode(startFever > 0 ? 'fever' : 'run');
    SFX.setAmbientPaused(false);
    SFX.setWeatherAmbient('clear');
    SFX.seasonUp();
    if (!isTutorial) {
      showRunBanner(`🌸 1년 차 봄 출발! (${ch.name} Lv.${stats.level})`, 2400);
    }
    updateRunHud(true);
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

  function isUmbrellaWeather(w) {
    return w === 'rain' || w === 'flood' || w === 'heat';
  }

  function isMaskWeather(w) {
    return w === 'dust';
  }

  function toggleUmbrella() {
    if (!run || !run.active || paused) return;
    if (run.isTutorial && run.tut && run.tut.waitAction) {
      const wa = run.tut.waitAction;
      if (wa === 'umbrella_on' && !run.umbrellaOn) {
        run.tut.waitAction = null;
        updateTutorialHudUI();
      } else if (wa === 'umbrella_off' && run.umbrellaOn) {
        run.tut.waitAction = null;
        updateTutorialHudUI();
      } else {
        return;
      }
    }
    if (run.umbrellaBrokenTimer > 0) {
      SFX.hit();
      Renderer.spawnFloater(`우산 파손! ${Math.ceil(run.umbrellaBrokenTimer)}초간 사용 불가`, '#ff9e9e', run.playerX + 10, run.playerY - 42);
      return;
    }

    if (run.umbrellaOn) {
      const foldedForGust = run.weatherEvent === 'gust';
      run.umbrellaOn = false;
      run.umbrellaActiveTimer = 0;
      run.gustExposeTimer = 0;
      run.umbrellaCooldown = 0;
      if (foldedForGust) {
        run.score += Math.round(50 * run.scoreMult);
        SFX.guard();
        haptic(14);
        Renderer.spawnFloater('💨 태풍 대비! 우산 접기 성공 +50', '#7ef6ff', run.playerX + 12, run.playerY - 44);
      } else {
        SFX.umbrellaToggle(false);
        haptic(10);
        Renderer.spawnFloater('☂️ 우산 접기', '#8ce0ff', run.playerX + 10, run.playerY - 42);
      }
    } else {
      run.umbrellaOn = true;
      run.umbrellaActiveTimer = GEAR_DURATION;
      run.rainExposeTimer = 0;
      run.gustExposeTimer = 0;
      SFX.umbrellaToggle(true);
      haptic(14);
      if (run.weatherEvent === 'gust') {
        run.gustExposeTimer = 0.05;
        Renderer.spawnFloater('💨 태풍 중! 빨리 우산을 접으세요!', '#ff9b54', run.playerX + 12, run.playerY - 44);
      } else {
        Renderer.spawnFloater(`☂️ 우산 ON! (${GEAR_DURATION}초 자동 해제)`, '#8ce0ff', run.playerX + 10, run.playerY - 42);
      }
    }
    updateRunHud();
  }

  function breakUmbrellaByGust() {
    run.umbrellaOn = false;
    run.umbrellaActiveTimer = 0;
    run.umbrellaBrokenTimer = UMBRELLA_BROKEN_CD;
    run.umbrellaCooldown = 0;
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
    run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, 강풍 속에 우산을 접지 않아 뒤집혀 쓰러졌습니다!`;
    Renderer.spawnFloater(`강풍에 우산 파손!! -1 ❤️ (${UMBRELLA_BROKEN_CD}초 불가)`, '#ff5c5c', run.playerX + 16, run.playerY - 48);
    showRunBanner(`💨 돌풍에 우산이 뒤집혔습니다!! (${UMBRELLA_BROKEN_CD}초간 사용 불가 · -1 ❤️)`, 2200);
  }

  function toggleMask() {
    if (!run || !run.active || paused) return;
    if (run.isTutorial && run.tut && run.tut.waitAction) {
      const wa = run.tut.waitAction;
      if (wa === 'mask_on' && !run.maskOn) {
        run.tut.waitAction = null;
        updateTutorialHudUI();
      } else if (wa === 'covid_mask') {
        run.tut.waitAction = null;
        updateTutorialHudUI();
      } else {
        return;
      }
    }

    const covidIncoming = Boolean(
      run.covidAttack &&
      (run.covidAttack.phase === 'warn' || run.covidAttack.phase === 'charge') &&
      !run.covidAttack.checked
    );

    if (covidIncoming) {
      // 코로나 바이러스 돌진 중 마스크 버튼을 누르면 실수로 벗겨지지 않고 정확한 타이밍 차단을 장전!
      run.maskOn = true;
      run.maskActiveTimer = GEAR_DURATION;
      run.maskParryTimer = MASK_PARRY_WINDOW;
      run.maskCooldown = 0;
      run.dustExposeTimer = 0;
      SFX.maskToggle(true);
      haptic(14);
      Renderer.spawnFloater('😷 마스크 타이밍 장전! 차단 준비!', '#5effbe', run.playerX + 12, run.playerY - 46);
    } else if (run.maskOn) {
      run.maskOn = false;
      run.maskActiveTimer = 0;
      run.maskParryTimer = 0;
      run.maskCooldown = 0;
      SFX.maskToggle(false);
      haptic(10);
      Renderer.spawnFloater('😷 마스크 해제', '#a6ffcf', run.playerX + 10, run.playerY - 42);
    } else {
      run.maskOn = true;
      run.maskActiveTimer = GEAR_DURATION;
      run.maskParryTimer = MASK_PARRY_WINDOW;
      run.maskCooldown = 0;
      run.dustExposeTimer = 0;
      SFX.maskToggle(true);
      haptic(14);
      Renderer.spawnFloater(`😷 KF94 마스크 ON! (${GEAR_DURATION}초 자동 해제)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
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
    if (run.isTutorial && run.tut && run.tut.waitAction) {
      const wa = run.tut.waitAction;
      if (wa === 'jump' || wa === 'double_jump') {
        run.tut.waitAction = null;
        if (wa === 'jump') run.tut.didFirstJump = true;
        if (wa === 'double_jump') run.tut.didSecondJump = true;
        updateTutorialHudUI();
      } else {
        return;
      }
    }
    run.jumpHeld = true;

    const isGrounded = run.playerY >= run.currentFloorY - 2;
    if (isGrounded || run.coyoteTimer > 0) {
      if (run.isTutorial && run.tut) run.tut.didFirstJump = true;
      executeJump(true);
    } else if (run.jumpsLeft > 0) {
      if (run.isTutorial && run.tut) run.tut.didSecondJump = true;
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
    if (run.isTutorial && run.tut && run.tut.waitAction) {
      if (run.tut.waitAction === 'slide') {
        run.tut.waitAction = null;
        run.tut.autoSlideTimer = 0.92;
        updateTutorialHudUI();
      } else {
        return;
      }
    }
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
    if (run.isTutorial && run.tut && run.tut.autoSlideTimer > 0) {
      return; // Smoothly finish gliding underneath the tutorial cloud even after a quick mobile tap!
    }
    if (run.weatherEvent === 'ice_road' && !ch.iceMastery) {
      // Ice inertia keeps sliding slightly longer (Skier controls it cleanly!)
      run.iceSlideInertia = 0.24;
    } else {
      run.sliding = false;
    }
  }

  // ===================== DIRECT KOREAN WEATHER PHASE SCHEDULER =====================
  function scheduleNextWeatherEvent() {
    const diff = DATA.getYearDifficulty(run.year, run.elapsed);
    const pool = DATA.SEASON_WEATHER_POOL[run.seasonId] || ['rain', 'gust', 'dust'];
    const candidates = pool.filter((w) => w !== run.weatherEvent);
    let nextW = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];

    // 1년(60초) 경과 후 2년 차부터 코로나 이벤트가 랜덤하게 발생!
    if (run.year >= 2 && run.weatherEvent !== 'covid' && Math.random() < 0.34) {
      nextW = 'covid';
    }

    run.pendingWeather = nextW;
    run.weatherPrepTimer = Math.max(1.2, 2.0 / Math.min(1.65, diff.weatherPaceMult));
  }

  function activatePendingWeather() {
    const diff = DATA.getYearDifficulty(run.year, run.elapsed);
    const nextW = run.pendingWeather || 'clear';

    run.weatherEvent = nextW;
    run.pendingWeather = null;
    run.weatherEventTimer = nextW === 'covid'
      ? Math.max(9.5, 11.0 / Math.min(1.18, diff.weatherPaceMult))
      : Math.max(5.2, (8.5 + Math.random() * 2.5) / diff.weatherPaceMult);
    run.rainExposeTimer = 0;
    run.dustExposeTimer = 0;
    run.gustExposeTimer = 0;

    if (nextW === 'covid') {
      run.covidAttack = null;
      run.covidAttackCd = 2.0;
      // 아직 화면 진입 전인 대기 장애물도 코로나 확진자 보행 장애물로 즉시 교체!
      for (let i = 0; i < run.obstacles.length; i++) {
        const ob = run.obstacles[i];
        if (ob.x > getSpawnRight() - 8) {
          run.obstacles[i] = {
            ...COVID_WALKER_PRESET,
            x: ob.x,
            y: Renderer.GROUND_Y - COVID_WALKER_PRESET.h,
            passed: false,
            nearMissed: false,
            stepSeed: Math.random() * Math.PI * 2,
            extraSpeed: (COVID_WALKER_PRESET.speedBonus || 0) * diff.extraObsSpeedMult
          };
        }
      }
      showWeatherCenterAlert('covid');
    } else if (nextW === 'gust') {
      const subTxt = run.umbrellaOn ? '⚠️ 제한 시간 안에 우산을 접으세요!' : '💨 맞바람 주의! 슬라이드로 돌파!';
      showWeatherCenterAlert('gust', subTxt);
    } else if (nextW !== 'clear') {
      showWeatherCenterAlert(nextW);
    } else {
      showRunBanner('☀️ 맑음 · 잠시 숨 고르기!', 1800);
    }

    // Play distinct onset SFX + continuous ambient weather soundscape (rain, flood, dust, gust, heat, ice, covid)!
    SFX.playWeatherCue(nextW);
    SFX.setWeatherAmbient(nextW);
  }

  // ===================== SPAWNERS (100% UPLOADED SHEET OBSTACLES & STRUCTURES) =====================
  function pickFollowObstacle(pool, prevLane) {
    const followPool = pool.filter((p) => p.lane !== 'icicle');
    if (!followPool.length) return pool[0];
    // 65% of the time alternate jump <-> slide lane for crisp rhythmic combos!
    if (Math.random() < 0.65) {
      const wantAir = prevLane !== 'air';
      const contrasted = followPool.filter((p) => (wantAir ? p.lane === 'air' : p.lane !== 'air'));
      if (contrasted.length) return contrasted[Math.floor(Math.random() * contrasted.length)];
    }
    return followPool[Math.floor(Math.random() * followPool.length)];
  }

  // ===================== SPATIAL ANTI-OVERLAP HELPERS (ZERO OBJECT COLLISIONS!) =====================
  function isPointBlockedByObstacle(x, y, padX = 24, padY = 18) {
    if (!run || !run.obstacles) return false;
    for (let i = 0; i < run.obstacles.length; i++) {
      const ob = run.obstacles[i];
      if (x >= ob.x - padX && x <= ob.x + ob.w + padX && y >= ob.y - padY && y <= ob.y + ob.h + padY) {
        return true;
      }
    }
    return false;
  }

  function isRectBlockedByObstacle(x, w, padX = 42) {
    if (!run || !run.obstacles) return false;
    for (let i = 0; i < run.obstacles.length; i++) {
      const ob = run.obstacles[i];
      if (x < ob.x + ob.w + padX && x + w + padX > ob.x) return true;
    }
    return false;
  }

  function isRectBlockedByFeature(x, w, padX = 32) {
    if (!run || !run.features) return false;
    for (let i = 0; i < run.features.length; i++) {
      const f = run.features[i];
      if (x < f.x + f.w + padX && x + w + padX > f.x) return true;
    }
    return false;
  }

  function isPointNearItem(x, y, minDist = 26) {
    if (!run || !run.items) return false;
    for (let i = 0; i < run.items.length; i++) {
      const it = run.items[i];
      if (Math.hypot(it.x - x, it.y - y) < minDist) return true;
    }
    return false;
  }

  function pushSafeItem(item, padObsX = 22, padObsY = 16, minItemDist = 24) {
    if (isPointBlockedByObstacle(item.x, item.y, padObsX, padObsY)) return false;
    if (isPointNearItem(item.x, item.y, minItemDist)) return false;
    run.items.push(item);
    return true;
  }

  function spawnObstacleWave() {
    const diff = DATA.getYearDifficulty(run.year, run.elapsed);
    const isCovid = run.weatherEvent === 'covid';

    // 코로나 바이러스 돌진 중엔 장애물 생성을 잠시 멈춰 마스크 타이밍에 집중할 수 있게 완화!
    if (isCovid && run.covidAttack && run.covidAttack.phase === 'charge') {
      return 0.45;
    }

    const pool = isCovid
      ? [COVID_WALKER_PRESET]
      : DATA.OBSTACLES_BY_SEASON[run.seasonId];
    const preset = pool[Math.floor(Math.random() * pool.length)];

    // During flood, leave ground room for submerged car / box platforming!
    if (run.weatherEvent === 'flood' && preset.lane === 'low' && Math.random() < 0.55) {
      return 0;
    }

    let startX = getSpawnRight() + (preset.warn ? 48 : 22);
    // 스프링 패드 · 침수 차량 지붕 등 지형 오브젝트와 절대 겹치지 않게 회피!
    if (isRectBlockedByFeature(startX, preset.w, 38)) {
      return 0.35;
    }
    // 기존 장애물과도 최소 안전 간격 유지!
    if (isRectBlockedByObstacle(startX, preset.w, 86)) {
      return 0.3;
    }

    let y = Renderer.GROUND_Y - preset.h;
    const extra = {};

    if (preset.lane === 'air') {
      y = Renderer.GROUND_Y - 24 - preset.h;
    } else if (preset.lane === 'icicle') {
      startX = getSpawnRight() + 24;
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
      stepSeed: Math.random() * Math.PI * 2,
      extraSpeed: (preset.speedBonus || 0) * diff.extraObsSpeedMult
    });

    // Continuous Escalating Difficulty: Fair Double (15s+) & Triple (45s+) Combos (Corona keeps it gentle!)
    let comboExtraWidth = 0;
    const dblChance = isCovid ? Math.min(0.24, diff.doubleWaveChance * 0.45) : diff.doubleWaveChance;
    if (run.weatherEvent !== 'flood' && preset.lane !== 'icicle' && Math.random() < dblChance) {
      const second = pickFollowObstacle(pool, preset.lane);
      const gapX = Math.max(isCovid ? 195 : 158, Math.min(264, (run.speed || 220) * (isCovid ? 0.78 : 0.66)));
      const sx2 = startX + gapX;
      if (!isRectBlockedByFeature(sx2, second.w, 34)) {
        const sy2 = second.lane === 'air' ? Renderer.GROUND_Y - 24 - second.h : Renderer.GROUND_Y - second.h;
        run.obstacles.push({
          ...second,
          x: sx2,
          y: sy2,
          passed: false,
          nearMissed: false,
          stepSeed: Math.random() * Math.PI * 2,
          extraSpeed: (second.speedBonus || 0) * diff.extraObsSpeedMult
        });
        comboExtraWidth += gapX;

        if (!isCovid && Math.random() < diff.tripleWaveChance) {
          const third = pickFollowObstacle(pool, second.lane);
          const gapX3 = Math.round(gapX * 1.05);
          const sx3 = sx2 + gapX3;
          if (!isRectBlockedByFeature(sx3, third.w, 34)) {
            const sy3 = third.lane === 'air' ? Renderer.GROUND_Y - 24 - third.h : Renderer.GROUND_Y - third.h;
            run.obstacles.push({
              ...third,
              x: sx3,
              y: sy3,
              passed: false,
              nearMissed: false,
              stepSeed: Math.random() * Math.PI * 2,
              extraSpeed: (third.speedBonus || 0) * diff.extraObsSpeedMult
            });
            comboExtraWidth += gapX3;
          }
        }
      }
    }

    // Natural Non-Overlapping Coin Guide Arcs (centered cleanly OVER low/tall obstacles or cleanly BELOW air obstacles!)
    if (Math.random() < 0.58) {
      const obsCx = startX + preset.w / 2;
      if (preset.lane === 'low') {
        const peakY = Math.min(Renderer.GROUND_Y - preset.h - 28, Renderer.GROUND_Y - 80);
        const sideY = Math.min(Renderer.GROUND_Y - 46, peakY + 32);
        const pts = [
          { x: obsCx - 44, y: sideY },
          { x: obsCx,      y: peakY },
          { x: obsCx + 44, y: sideY }
        ];
        pts.forEach((pt) => pushSafeItem({ kind: 'coin', x: pt.x, y: pt.y }, 18, 16, 24));
      } else if (preset.lane === 'tall') {
        const hasBig = Math.random() < 0.28;
        const peakY = Math.min(Renderer.GROUND_Y - preset.h - 40, Renderer.GROUND_Y - 102);
        const sideY = peakY + 32;
        const pts = [
          { x: obsCx - 50, y: sideY, kind: 'coin' },
          { x: obsCx,      y: peakY, kind: hasBig ? 'big_coin' : 'coin' },
          { x: obsCx + 50, y: sideY, kind: 'coin' }
        ];
        pts.forEach((pt) => pushSafeItem({ kind: pt.kind, x: pt.x, y: pt.y }, 18, 16, 24));
      } else if (preset.lane === 'air') {
        for (let i = -1; i <= 1; i++) {
          pushSafeItem({ kind: 'coin', x: obsCx + i * 26, y: Renderer.GROUND_Y - 11 }, 16, 8, 22);
        }
      } else {
        for (let i = 0; i < 2; i++) {
          pushSafeItem({ kind: 'coin', x: startX + preset.w + 34 + i * 28, y: Renderer.GROUND_Y - 26 }, 20, 16, 24);
        }
      }
    }

    return (comboExtraWidth / Math.max(190, run.speed || 196)) + (isCovid ? 0.35 : 0);
  }

  function pickRunDropChestKind() {
    const w = (DATA.SKIN_GACHA && DATA.SKIN_GACHA.runChestDropWeights) || { wood: 56, silver: 27, gold: 13, diamond: 4 };
    const tiers = ['wood', 'silver', 'gold', 'diamond'];
    const total = tiers.reduce((s, k) => s + (w[k] || 0), 0) || 100;
    const r = Math.random() * total;
    let acc = 0;
    for (const k of tiers) {
      acc += w[k] || 0;
      if (r < acc) return `chest_${k}`;
    }
    return 'chest_wood';
  }

  function spawnUtilityPickup() {
    const r = Math.random();
    let kind = 'coffee';
    if (r < 0.20) kind = 'coffee';
    else if (r < 0.37) kind = 'star';
    else if (r < 0.52) kind = 'magnet';
    else if (r < 0.65) kind = 'speed_boost';
    else if (r < 0.76) kind = 'shield_item';
    else if (r < 0.82) kind = 'umbrella_fever';
    else kind = pickRunDropChestKind(); // 18% chance: Wood(56%) > Silver(27%) > Gold(13%) > Diamond(4%) stored to Vault!

    const isDropChest = kind.startsWith('chest_');
    const prefHigh = Math.random() < 0.5;
    const laneYs = isDropChest
      ? [Renderer.GROUND_Y - 26, Renderer.GROUND_Y - 84]
      : (prefHigh ? [Renderer.GROUND_Y - 88, Renderer.GROUND_Y - 30] : [Renderer.GROUND_Y - 30, Renderer.GROUND_Y - 88]);
    const xOffsets = [28, 76, 124];

    for (let xi = 0; xi < xOffsets.length; xi++) {
      const cx = getSpawnRight() + xOffsets[xi];
      for (let yi = 0; yi < laneYs.length; yi++) {
        const cy = laneYs[yi];
        if (!isPointBlockedByObstacle(cx, cy, 38, 28) && !isPointNearItem(cx, cy, 38)) {
          if (cy > Renderer.GROUND_Y - 48 && isRectBlockedByFeature(cx - 18, 36, 18)) continue;
          run.items.push({ kind, x: cx, y: cy });
          return true;
        }
      }
    }
    return false;
  }

  function spawnStreetFeature() {
    if (run.weatherEvent === 'flood') {
      const r = Math.random();
      const kind = r < 0.48 ? 'car_roof' : (r < 0.76 ? 'crate_plat' : 'metal_plat');
      const w = kind === 'car_roof' ? 76 : 68;
      const fx = getSpawnRight() + 30;
      if (isRectBlockedByFeature(fx, w, 26) || isRectBlockedByObstacle(fx, w, 28)) return;
      const platformY = kind === 'car_roof' ? Renderer.GROUND_Y - 30 : Renderer.GROUND_Y - 26;
      run.features.push({ kind, x: fx, w, platformY, isPlatform: true });
      for (let i = 0; i < 2; i++) {
        pushSafeItem({ kind: 'coin', x: fx + 20 + i * 28, y: platformY - 18 }, 18, 14, 24);
      }
    }
  }

  function spawnConvenienceStore() {
    const fx = getSpawnRight() + 40;
    const fw = 44;
    // 장애물이나 다른 지형과 겹치면 잠시 뒤로 미뤄 자연스럽게 배치!
    if (isRectBlockedByObstacle(fx, fw, 64) || isRectBlockedByFeature(fx, fw, 52)) {
      return false;
    }
    run.features.push({ kind: 'spring_pad', x: fx, w: fw, triggered: false });
    const hasBig = Math.random() < 0.35;
    for (let i = 0; i < 3; i++) {
      const arc = Math.sin((i / 2) * Math.PI) * 96;
      pushSafeItem(
        { kind: (i === 1 && hasBig) ? 'big_coin' : 'coin', x: fx + 46 + i * 28, y: Renderer.GROUND_Y - 46 - arc },
        20, 16, 24
      );
    }
    return true;
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
    const diff = DATA.getYearDifficulty(run.year, run.elapsed);

    if (!run.isTutorial) {
      run.elapsed += dt;
      if (run.seasonTime && run.seasonId in run.seasonTime) {
        run.seasonTime[run.seasonId] += dt;
      }

      // Equal 4-season infinite cycle (15s * 4 = 60s per year)
      const newYear = Math.floor(run.elapsed / DATA.YEAR_DURATION) + 1;
      const yearTime = run.elapsed % DATA.YEAR_DURATION;
      const newSeasonIdx = Math.floor(yearTime / DATA.SEASON_DURATION);
      const timeIntoSeason = yearTime - newSeasonIdx * DATA.SEASON_DURATION;
      // Quietly preload upcoming season's sprites 4 seconds before transition so zero pop-in or frame hitch!
      if (timeIntoSeason > DATA.SEASON_DURATION - 4.5 && Renderer && Renderer.preloadSeason) {
        const upcomingSeason = DATA.SEASONS[(newSeasonIdx + 1) % DATA.SEASONS.length];
        if (upcomingSeason) Renderer.preloadSeason(upcomingSeason.id);
      }

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
        const nextDiff = DATA.getYearDifficulty(run.year, run.elapsed);
        showRunBanner(`🔥 ${run.year}년 차 돌파! 속도 ×${nextDiff.speedMult.toFixed(2)} · 3연속 콤보 경보! (+${yearGoldBonus}G)`, 3000);
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
        const nextDiff = DATA.getYearDifficulty(run.year, run.elapsed);
        showRunBanner(`${sObj.icon} ${run.year}년 차 [${sObj.name}] · 속도 ×${nextDiff.speedMult.toFixed(2)} UP! (${sObj.weatherLabel})`, 2400);
        Renderer.spawnFloater(`⚡ 속도 ×${nextDiff.speedMult.toFixed(2)} ↑`, '#ffe259', run.playerX + 36, run.playerY - 50);
        checkStageMilestone(run.year, run.seasonIdx);
        // Immediately queue the new season's weather!
        if (!run.pendingWeather) scheduleNextWeatherEvent();
      }

      // Smooth 3.2-second visual seasonal background & particle crossfade!
      if (run.seasonTransition < 1) {
        run.seasonTransition = Math.min(1, run.seasonTransition + dt / 3.2);
        if (run.seasonTransition >= 1) run.prevSeasonId = null;
      }

      // Direct Weather Event State Machine
      if (run.pendingWeather) {
        run.weatherPrepTimer -= dt;
        if (run.weatherPrepTimer <= 0) {
          activatePendingWeather();
        }
      } else {
        run.weatherEventTimer -= dt;
        if (run.weatherEventTimer <= 0) {
          scheduleNextWeatherEvent();
        }
      }
    } else {
      updateTutorialStep(dt);
    }

    // Timers
    if (run.invulnTimer > 0) run.invulnTimer = Math.max(0, run.invulnTimer - dt);
    if (run.magnetTimer > 0) run.magnetTimer = Math.max(0, run.magnetTimer - dt);
    if (run.speedBoostTimer > 0) run.speedBoostTimer = Math.max(0, run.speedBoostTimer - dt);
    if (run.mudBlindTimer > 0) run.mudBlindTimer = Math.max(0, run.mudBlindTimer - dt);
    if (run.umbrellaBrokenTimer > 0) run.umbrellaBrokenTimer = Math.max(0, run.umbrellaBrokenTimer - dt);
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

    // Umbrella & Mask: Zero Cooldown · Auto-Turn-Off every 10 seconds!
    run.umbrellaCooldown = 0;
    run.maskCooldown = 0;
    if (run.maskParryTimer > 0) run.maskParryTimer = Math.max(0, run.maskParryTimer - dt);

    if (run.umbrellaOn) {
      run.umbrellaActiveTimer = Math.max(0, run.umbrellaActiveTimer - dt);
      if (run.umbrellaActiveTimer <= 0) {
        run.umbrellaOn = false;
        run.gustExposeTimer = 0;
        SFX.umbrellaToggle(false);
        Renderer.spawnFloater('☂️ 우산 자동 해제 (10초 경과)', '#9fd9ff', run.playerX + 10, run.playerY - 42);
      }
    }

    if (run.maskOn) {
      run.maskActiveTimer = Math.max(0, run.maskActiveTimer - dt);
      if (run.maskActiveTimer <= 0) {
        run.maskOn = false;
        run.maskParryTimer = 0;
        SFX.maskToggle(false);
        Renderer.spawnFloater('😷 마스크 자동 해제 (10초 경과)', '#a6ffcf', run.playerX + 10, run.playerY - 42);
      }
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
    run.score += run.speed * dt * 0.16 * run.scoreMult * diff.scoreMult * iceScoreBonus * boostScoreMult;

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

    // ---- UPDATE STREET FEATURES (SPRING PAD & FLOOD PLATFORMS — NO SHADE SYSTEM!) ----
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
        run.score += Math.round(120 * run.scoreMult);
        if (run.feverTimer <= 0) run.feverCharge = Math.min(100, run.feverCharge + 5);
        SFX.doubleJump();
        Renderer.spawnPickupEffect(f.x + 22, Renderer.GROUND_Y - 18, '#ff7675', true);
        Renderer.spawnFloater('스프링 점프! +120 · 피버+5%', '#ffe36e', run.playerX + 14, run.playerY - 46);
      }

      if (f.x + f.w < -60) run.features.splice(i, 1);
    }

    // ---- ACTIVE WEATHER EXPOSURE SYSTEM (RAIN/HEAT WITHOUT UMBRELLA · YELLOW DUST WITHOUT MASK -> -1 HEART!) ----
    const rainExposeLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustExposeLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    const isRainingNow = run.weatherEvent === 'rain' || run.weatherEvent === 'flood';
    const isDustNow = run.weatherEvent === 'dust';

    if (run.feverTimer <= 0 && !run.isTutorial) {
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

      // 3. Summer Heatwave (폭염): Open Umbrella(양산) to stay cool! Without Umbrella, heat builds -> -1 Heart!
      if (run.weatherEvent === 'heat' && !ch.summerImmune) {
        if (run.umbrellaOn) {
          run.heatGauge = Math.max(0, run.heatGauge - 46 * dt);
        } else {
          const heatRate = Math.max(10, 19 * diff.heatRateMult);
          run.heatGauge = Math.min(100, run.heatGauge + heatRate * dt);
          if (run.heatGauge >= 100) {
            run.heatGauge = 55;
            run.hp = Math.max(0, run.hp - 1);
            run.hitPoseTimer = 0.3;
            run.hitFlashTimer = 0.25;
            triggerCameraShake(5, 0.2);
            run.lastHitCause = `${run.year}년 차 여름 폭염, 우산(양산)을 펴지 않아 열사병으로 쓰러졌습니다!`;
            SFX.hit();
            Renderer.spawnFloater('폭염 열사병! -1 ❤️ (우산 펴기!)', '#ff8052', run.playerX + 8, run.playerY - 46);
          }
        }
      } else {
        run.heatGauge = Math.max(0, run.heatGauge - 28 * dt);
      }
      // 4. Typhoon / Strong Gust with Umbrella still open -> Grace period to fold, else snap & -1 Heart!
      const gustFoldLimit = Math.max(1.8, 2.8 - diff.exposureGracePenalty);
      if (run.weatherEvent === 'gust' && run.umbrellaOn) {
        run.gustExposeTimer += dt;
        if (run.gustExposeTimer >= gustFoldLimit) {
          run.gustExposeTimer = 0;
          breakUmbrellaByGust();
        }
      } else {
        run.gustExposeTimer = 0;
      }
    } else {
      run.heatGauge = Math.max(0, run.heatGauge - 40 * dt);
      run.rainExposeTimer = 0;
      run.dustExposeTimer = 0;
      run.gustExposeTimer = 0;
    }

    // ---- PASSING CAR SPLASH EVENT (RAIN / FLOOD) ----
    if (run.passingCar) {
      const car = run.passingCar;
      if (car.phase === 'warn') {
        car.timer -= dt;
        if (car.timer <= 0) {
          car.phase = 'pass';
          car.x = getSpawnRight() + 20;
          car.checked = false;
        }
      } else {
        car.x -= (run.speed + 250) * dt;
        if (!car.checked && car.x <= run.playerX + 18 && car.x + 70 >= run.playerX) {
          car.checked = true;
          if (run.playerY < Renderer.GROUND_Y - 18 || run.feverTimer > 0) {
            run.score += 130;
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
    } else if (!run.isTutorial && (run.weatherEvent === 'rain' || run.weatherEvent === 'flood')) {
      run.passingCarCd -= dt;
      if (run.passingCarCd <= 0) {
        run.passingCarCd = Math.max(3.6, (6.5 + Math.random() * 2.5) / diff.weatherPaceMult);
        run.passingCar = { phase: 'warn', timer: Math.max(0.85, 1.15 / Math.min(1.35, diff.weatherPaceMult)), x: getSpawnRight() + 30 };
        SFX.fakeAlert();
      }
    }

    // ---- CORONA VIRUS TIMED RUSH EVENT (YEAR 2+ RANDOM COVID EVENT · FAIR & FUN DIFFICULTY) ----
    if (run.covidAttack) {
      const atk = run.covidAttack;
      if (atk.phase === 'warn') {
        atk.timer -= dt;
        const targetY = Math.max(76, Math.min(Renderer.GROUND_Y - 36, run.playerY - 30));
        atk.y += (targetY - atk.y) * Math.min(1, dt * 6);
        if (atk.timer <= 0) {
          atk.phase = 'charge';
          atk.vx = 330 + run.speed * 0.22;
          atk.checked = false;
          SFX.virusCharge();
        }
      } else if (atk.phase === 'charge') {
        atk.x -= atk.vx * dt;
        const targetY = Math.max(76, Math.min(Renderer.GROUND_Y - 26, run.playerY - 28));
        atk.y += (targetY - atk.y) * Math.min(1, dt * 7);
        if (!atk.checked && atk.x <= run.playerX + 26) {
          atk.checked = true;
          if (run.feverTimer > 0) {
            atk.phase = 'deflected';
            atk.deflectTimer = 0.55;
            atk.vx = 280;
            atk.vy = -260;
            run.score += Math.round(250 * run.scoreMult);
            SFX.guard();
            Renderer.spawnPickupEffect(run.playerX + 14, run.playerY - 30, '#ffe866', true);
            Renderer.spawnFloater('🔥 피버! 코로나 격파 +250', '#ffe866', run.playerX + 14, run.playerY - 50);
          } else if (run.maskOn && run.maskParryTimer > 0) {
            const isPerfect = run.maskParryTimer >= 1.65;
            const bonusPts = isPerfect ? 350 : 250;
            const feverGain = isPerfect ? 14 : 12;
            atk.phase = 'deflected';
            atk.deflectTimer = 0.55;
            atk.vx = 300;
            atk.vy = -280;
            run.score += Math.round(bonusPts * run.scoreMult);
            run.feverCharge = Math.min(100, run.feverCharge + feverGain);
            if (run.feverCharge >= 100 && run.feverTimer <= 0) {
              run.feverTimer = 4.5;
              run.winPoseTimer = 0.7;
              SFX.feverStart();
            } else {
              SFX.guard();
            }
            haptic(16);
            Renderer.spawnPickupEffect(run.playerX + 16, run.playerY - 30, '#5effbe', true);
            Renderer.spawnFloater(
              isPerfect ? `😷 완벽 타이밍 차단! +${bonusPts}` : `😷 코로나 차단 성공! +${bonusPts}`,
              '#5effbe',
              run.playerX + 14,
              run.playerY - 50
            );
          } else if (run.maskOn) {
            // 미리 써둔 오래된 마스크는 체력 피해 대신 마스크가 벗겨지며 방어 (난이도 완화!)
            run.maskOn = false;
            run.maskActiveTimer = 0;
            run.maskParryTimer = 0;
            atk.phase = 'deflected';
            atk.deflectTimer = 0.5;
            atk.vx = 240;
            atk.vy = -220;
            SFX.guard();
            haptic(12);
            Renderer.spawnPickupEffect(run.playerX + 14, run.playerY - 30, '#a6ffcf', false);
            Renderer.spawnFloater('😷 마스크 방어! (돌진 시 새로 누르면 보너스!)', '#a6ffcf', run.playerX + 14, run.playerY - 48);
          } else if (run.shield) {
            run.shield = false;
            run.invulnTimer = 1.25;
            atk.phase = 'deflected';
            atk.deflectTimer = 0.55;
            atk.vx = 260;
            atk.vy = -240;
            SFX.guard();
            Renderer.spawnPickupEffect(run.playerX + 14, run.playerY - 30, '#82e2ff', true);
            Renderer.spawnFloater('🛡️ 기상 보호막으로 코로나 방어!', '#82e2ff', run.playerX + 14, run.playerY - 48);
          } else if (run.isTutorial) {
            run.hitPoseTimer = 0.3;
            run.hitFlashTimer = 0.2;
            SFX.hit();
            Renderer.spawnFloater('💪 괜찮아요! 마스크 타이밍 다시 한번!', '#ffe866', run.playerX + 14, run.playerY - 48);
            run.covidAttack = null;
            if (run.tut) {
              run.tut.phase = 'intro';
              run.tut.timer = 0.7;
              run.tut.spawned = false;
              run.tut.waitAction = null;
              updateTutorialHudUI();
            }
          } else {
            run.hp = Math.max(0, run.hp - 1);
            run.hitPoseTimer = 0.45;
            run.hitFlashTimer = 0.3;
            run.hitStopTimer = 0.055;
            run.squashX = 1.24;
            run.squashY = 0.78;
            run.dodgeCombo = 0;
            triggerCameraShake(7, 0.28);
            haptic(35);
            SFX.hit();
            run.lastHitCause = `${run.year}년 차 코로나 이벤트, 마스크를 쓰지 않아 코로나 바이러스에 감염되었습니다!`;
            Renderer.spawnFloater('🦠 코로나 감염! -1 ❤️ (마스크 착용!)', '#ff5c7c', run.playerX + 14, run.playerY - 48);
          }
        }
        if (atk.x < -70) run.covidAttack = null;
      } else if (atk.phase === 'deflected') {
        atk.x += (atk.vx || 280) * dt;
        atk.y += (atk.vy || -260) * dt;
        atk.vy = (atk.vy || -260) + 520 * dt;
        atk.deflectTimer -= dt;
        if (atk.deflectTimer <= 0 || atk.x > getSpawnRight() + 70) {
          run.covidAttack = null;
        }
      }
    } else if (!run.isTutorial && run.weatherEvent === 'covid') {
      run.covidAttackCd -= dt;
      if (run.covidAttackCd <= 0) {
        const warnDur = 2.0;
        run.covidAttackCd = 6.2;
        run.covidAttack = {
          phase: 'warn',
          timer: warnDur,
          maxTimer: warnDur,
          x: getSpawnRight() - 56,
          y: Math.max(84, run.playerY - 34),
          vx: 0,
          vy: 0,
          checked: false
        };
        SFX.playWeatherCue('covid_rush');
        showWeatherCenterAlert('covid_rush');
      }
    }

    // ---- SPAWN TIMERS ----
    if (!run.isTutorial) {
      run.obstacleCd -= dt;
      if (run.obstacleCd <= 0) {
        const comboExtraCd = spawnObstacleWave() || 0;
        const baseInterval = (run.weatherEvent === 'covid' ? 1.85 : 1.48) / diff.spawnRateMult;
        run.obstacleCd = Math.max(0.52, baseInterval + (Math.random() - 0.35) * 0.24) + comboExtraCd * 0.72;
      }

      run.itemCd -= dt;
      if (run.itemCd <= 0) {
        const placed = spawnUtilityPickup();
        run.itemCd = placed ? (3.8 + Math.random() * 1.9) : 0.55;
      }

      if (run.weatherEvent === 'flood') {
        run.featureCd -= dt;
        if (run.featureCd <= 0) {
          spawnStreetFeature();
          run.featureCd = 1.55;
        }
      }

      run.convStoreCd -= dt;
      if (run.convStoreCd <= 0) {
        const placedPad = spawnConvenienceStore();
        run.convStoreCd = placedPad ? (16.0 + Math.random() * 5.0) : 0.6;
      }
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
    const magnetRadius = hasSuperMagnet ? 145 : 24;

    for (let i = run.items.length - 1; i >= 0; i--) {
      const it = run.items[i];
      it.x -= run.speed * dt;

      const pcx = pBox.x + pBox.w / 2;
      const pcy = pBox.y + pBox.h / 2;
      const dist = Math.hypot(it.x - pcx, it.y - pcy);

      const isPullable = it.kind === 'coin' || it.kind === 'big_coin' || it.kind === 'star' || (hasSuperMagnet && it.kind.startsWith('chest_'));
      if (isPullable && dist < magnetRadius && dist > 16) {
        const pull = (hasSuperMagnet ? 420 : 230) * dt;
        it.x += ((pcx - it.x) / dist) * pull;
        it.y += ((pcy - it.y) / dist) * pull;
      }

      if (dist < 24) {
        run.items.splice(i, 1);
        if (it.kind === 'coin' || it.kind === 'big_coin') {
          const baseG = (it.kind === 'big_coin' ? 4 : 1) + diff.goldBonus;
          const gainedG = Math.max(1, Math.round(baseG * run.goldMult));
          const gainedS = Math.round((it.kind === 'big_coin' ? 120 : 30) * run.scoreMult);
          run.gold += gainedG;
          run.coinsCollected += it.kind === 'big_coin' ? 2 : 1;
          run.score += gainedS;
          addFeverCharge(it.kind === 'big_coin' ? 3.0 : 0.8);
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
        } else if (it.kind === 'star') {
          run.score += Math.round(160 * run.scoreMult);
          addFeverCharge(9);
          SFX.bigCoin();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe866', true);
          Renderer.spawnFloater('FEVER +9%!', '#ffe866', it.x, it.y - 10);
        } else if (it.kind === 'magnet') {
          run.magnetTimer = 6.0;
          run.itemPoseTimer = 0.45;
          SFX.magnet();
          Renderer.spawnPickupEffect(it.x, it.y, '#ff6e8a', true);
          Renderer.spawnFloater('자석 발동! (6초)', '#ff7d95', run.playerX + 12, run.playerY - 42);
        } else if (it.kind === 'speed_boost') {
          run.speedBoostTimer = 4.0;
          run.itemPoseTimer = 0.45;
          run.score += Math.round(140 * run.scoreMult);
          SFX.speedBoost();
          Renderer.spawnPickupEffect(it.x, it.y, '#59e8ff', true);
          Renderer.spawnFloater('⚡ 스피드 부스트! (4초 무적 질주)', '#66f2ff', run.playerX + 16, run.playerY - 46);
        } else if (it.kind === 'shield_item') {
          run.shield = true;
          run.itemPoseTimer = 0.45;
          SFX.shieldUp();
          Renderer.spawnPickupEffect(it.x, it.y, '#7ad8ff', true);
          Renderer.spawnFloater('🛡️ 기상 보호막 획득!', '#8ce2ff', run.playerX + 12, run.playerY - 44);
        } else if (it.kind === 'chest_wood' || it.kind === 'chest_silver' || it.kind === 'chest_gold' || it.kind === 'chest_diamond') {
          const tierId = it.kind.replace('chest_', '');
          const chestDef = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
          save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
          save.chestBag[tierId] = (save.chestBag[tierId] || 0) + 1;
          persistSave();
          const tierIco = tierId === 'diamond' ? '💎' : (tierId === 'gold' ? '👑' : (tierId === 'silver' ? '🥈' : '🪵'));
          const burstColor = chestDef.accent || '#ffd847';
          run.score += tierId === 'diamond' ? 400 : (tierId === 'gold' ? 300 : 200);
          addFeverCharge(tierId === 'diamond' ? 12 : 8);
          run.itemPoseTimer = 0.5;
          if (tierId === 'diamond' || tierId === 'gold') SFX.chestJackpot();
          else SFX.reward();
          haptic(tierId === 'diamond' ? 24 : 14);
          Renderer.spawnPickupEffect(it.x, it.y, burstColor, true);
          Renderer.spawnFloater(`${tierIco} ${chestDef.name} 보관함 저장!`, burstColor, it.x, it.y - 16);
        } else if (it.kind === 'chest') {
          const bonusG = Math.round(12 * run.goldMult);
          run.gold += bonusG;
          run.coinsCollected += 4;
          run.score += 250;
          addFeverCharge(8);
          SFX.reward();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffd847', true);
          Renderer.spawnFloater(`보물상자 +${bonusG}G!`, '#ffe55c', it.x, it.y - 14);
        } else if (it.kind === 'coffee') {
          // Energy drink / Iced Americano -> Score + FEVER + Heat cooling (NO HP healing!)
          const bonusSc = ch.icedBonus ? 280 : 120;
          const feverGain = ch.icedBonus ? 9 : 6;
          run.heatGauge = Math.max(0, run.heatGauge - 25);
          run.score += Math.round(bonusSc * run.scoreMult);
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
          addFeverCharge(30);
          run.score += 180;
          run.itemPoseTimer = 0.55;
          SFX.bigCoin();
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe55c', true);
          Renderer.spawnFloater('FEVER 부스트 +30%!', '#ffe55c', run.playerX + 12, run.playerY - 44);
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
        if (!ob.falling && ob.x < getSpawnRight() - 56) {
          ob.falling = true;
        }
        if (ob.falling) {
          ob.vy = (ob.vy || 0) + (540 * Math.min(1.85, diff.extraObsSpeedMult)) * dt;
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
          run.score += Math.round(bonusPts * run.scoreMult);
          SFX.guard();
          Renderer.spawnPickupEffect(ob.x + ob.w / 2, ob.y + ob.h / 2, run.feverTimer > 0 ? '#ffe866' : '#59e8ff', false);
          Renderer.spawnFloater(run.feverTimer > 0 ? '돌파 +150!' : '스피드 돌파 +120!', run.feverTimer > 0 ? '#ffe866' : '#6ef2ff', ob.x, ob.y);
          continue;
        } else if (run.invulnTimer <= 0) {
          handleObstacleHit(ob, ch);
          if (run.isTutorial) break;
        }
      } else {
        // Clean Dodge Feedback & Sound when passing an obstacle unscathed!
        if (!ob.passed && ob.x + ob.w < pBox.x - 4) {
          ob.passed = true;
          run.dodgesTotal = (run.dodgesTotal || 0) + 1;
          run.dodgeCombo += 1;
          if (run.dodgeCombo > run.maxDodgeCombo) run.maxDodgeCombo = run.dodgeCombo;
          run.score += Math.round(15 * run.scoreMult);
          SFX.dodge();
          if (run.dodgeCombo > 0 && run.dodgeCombo % 5 === 0) {
            const comboBonus = Math.round(60 * run.scoreMult);
            run.score += comboBonus;
            Renderer.spawnFloater(`${run.dodgeCombo}연속 회피! +${comboBonus}`, '#9ef5ff', run.playerX + 12, run.playerY - 48);
          }
        }
        if (ch.nearMissBonus && !ob.nearMissed && ob.x + ob.w < pBox.x) {
          ob.nearMissed = true;
          const vertDist = Math.min(Math.abs(pBox.y - (oBox.y + oBox.h)), Math.abs((pBox.y + pBox.h) - oBox.y));
          if (vertDist < 28) {
            run.score += 120;
            run.gold += 2;
            SFX.coin();
            Renderer.spawnFloater('NEAR MISS +2G!', '#ff9ce6', run.playerX + 10, run.playerY - 45);
          }
        }
      }

      if (ob.x + ob.w < -45) run.obstacles.splice(i, 1);
    }

    if (run.hp <= 0) {
      updateRunHud(true);
      startDyingSequence();
      return;
    }

    updateRunHud(false, dt);
  }

  function startDyingSequence() {
    run.active = false;
    run.dying = true;
    run.dead = true;
    run.deathAnimTimer = 0.58;
    run.sliding = false;
    run.umbrellaOn = false;
    run.maskOn = false;
    run.maskParryTimer = 0;
    run.covidAttack = null;
    releaseAllControlButtons();
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    el.runCanvasWrap.classList.remove('fever-active');
    SFX.setWeatherAmbient('clear');
    SFX.setAmbientPaused(false);
    SFX.setBgmMode('menu');
    SFX.fail();
    triggerCameraShake(8, 0.3);
  }

  function handleObstacleHit(ob, ch) {
    if (run.isTutorial) {
      run.invulnTimer = 0.7;
      run.hitPoseTimer = 0.28;
      run.hitFlashTimer = 0.2;
      run.sliding = false;
      SFX.hit();
      Renderer.spawnFloater('💪 괜찮아요! 다시 한번 해봐요!', '#ffe866', run.playerX + 14, run.playerY - 48);
      run.obstacles = [];
      run.items = [];
      if (run.tut) {
        run.tut.phase = 'intro';
        run.tut.timer = 0.72;
        run.tut.spawned = false;
        run.tut.waitAction = null;
        run.tut.autoSlideTimer = 0;
        run.tut.didFirstJump = false;
        run.tut.didSecondJump = false;
        updateTutorialHudUI();
      }
      return;
    }

    if (run.shield) {
      run.shield = false;
      run.invulnTimer = 1.25;
      SFX.guard();
      Renderer.spawnFloater('기상 보호막 방어!', '#82e2ff', run.playerX + 10, run.playerY - 44);
      return;
    }

    // Every obstacle hit deducts 1 heart (no score deduction!)
    run.hp = Math.max(0, run.hp - 1);
    run.invulnTimer = 1.5 + (ch.extraInvuln || 0);
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
    Renderer.spawnFloater('-1 ❤️', '#ff5c5c', run.playerX, run.playerY - 44);
  }

  // ===================== DIRTY-CHECKED & THROTTLED HUD UPDATER (ZERO 60FPS DOM THRASHING!) =====================
  let hudCache = {};
  let hudSlowAccum = 0;

  function resetHudCache() {
    hudCache = {};
    hudSlowAccum = 1;
  }

  function hudText(key, node, val) {
    if (!node || hudCache[key] === val) return;
    hudCache[key] = val;
    node.textContent = val;
  }

  function hudWidth(key, node, val) {
    if (!node || hudCache[key] === val) return;
    hudCache[key] = val;
    node.style.width = val;
  }

  function hudClass(key, node, val) {
    if (!node || hudCache[key] === val) return;
    hudCache[key] = val;
    node.className = val;
  }

  function hudToggle(key, node, cls, on) {
    const b = Boolean(on);
    if (!node || hudCache[key] === b) return;
    hudCache[key] = b;
    node.classList.toggle(cls, b);
  }

  function updateRunHud(force = false, dt = 0.016) {
    if (!run) return;
    hudSlowAccum += dt;
    const doSlow = force || hudSlowAccum >= 0.065;
    if (doSlow) hudSlowAccum = 0;

    const ch = getCharDef(run.charId);
    const diff = DATA.getYearDifficulty(run.year, run.elapsed);
    const seasonObj = DATA.SEASONS[run.seasonIdx];

    hudText('yr', el.runYearNum, `${run.year}Y`);
    const yrTier = run.year >= 4 ? 'yr-4' : (run.year === 3 ? 'yr-3' : (run.year === 2 ? 'yr-2' : 'yr-1'));
    hudClass('yrCls', el.runYearNum, `portrait-yr-badge ${yrTier}`);
    if (doSlow) {
      const seasonLbl = run.isTutorial
        ? '📖 실전 튜토리얼 (체력 감소 없음)'
        : `${run.year}년 차 ${seasonObj.name} · ⚡×${diff.speedMult.toFixed(2)}`;
      hudText('seasonLbl', el.runSeasonLabel, seasonLbl);
      const scoreInt = Math.floor(run.score);
      const scoreKey = `${run.distanceM}|${scoreInt}`;
      if (hudCache._scoreKey !== scoreKey) {
        hudCache._scoreKey = scoreKey;
        el.runScoreText.textContent = `${run.distanceM.toLocaleString('ko-KR')}m · ${scoreInt.toLocaleString('ko-KR')}점`;
      }
    }
    if (hudCache._gold !== run.gold) {
      hudCache._gold = run.gold;
      el.runGoldText.textContent = run.gold.toLocaleString('ko-KR');
    }

    // Exact Heart-Based HP Rendering (instant on hit!)
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
      hudText('hpTxt', el.runHpText, heartKey);
    }

    // Rainbow FEVER & Year Progress Gauges (throttled ~15Hz to skip per-frame layout reflow!)
    if (doSlow) {
      const feverPct = Math.max(0, Math.min(100, run.feverCharge));
      hudWidth('fevW', el.runFeverFill, `${feverPct.toFixed(1)}%`);
      hudText(
        'fevT',
        el.runFeverText,
        run.feverTimer > 0 ? `★ FEVER! ${run.feverTimer.toFixed(1)}s` : `★ FEVER ${Math.floor(feverPct)}%`
      );
      const yearPct = ((run.elapsed % DATA.YEAR_DURATION) / DATA.YEAR_DURATION) * 100;
      hudWidth('yrW', el.runYearFill, `${yearPct.toFixed(1)}%`);
    }

    // Live Active Weather Status Pill (Cleanly hidden during calm clear sky — NO Weather Agency clutter!)
    const rainLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    const gustLimit = Math.max(1.8, 2.8 - diff.exposureGracePenalty);

    const activeEv = run.weatherEvent || 'clear';
    const incomingEv = (run.pendingWeather && run.pendingWeather !== 'clear') ? run.pendingWeather : null;
    const covidUrgent = Boolean(
      run.covidAttack &&
      (run.covidAttack.phase === 'warn' || run.covidAttack.phase === 'charge') &&
      !run.covidAttack.checked &&
      run.feverTimer <= 0
    );
    const needCovidMask = covidUrgent && !(run.maskOn && run.maskParryTimer > 0);
    const needFoldUmb = activeEv === 'gust' && run.umbrellaOn && run.feverTimer <= 0;
    const needOpenUmb = (activeEv === 'rain' || activeEv === 'flood' || (activeEv === 'heat' && !ch.summerImmune)) && !run.umbrellaOn && run.feverTimer <= 0;
    const needOpenMask = activeEv === 'dust' && !run.maskOn && run.feverTimer <= 0;

    if (el.runWeatherBar) {
      const showBar = activeEv !== 'clear' || Boolean(incomingEv) || covidUrgent || run.heatGauge > 5;
      hudToggle('wBarHide', el.runWeatherBar, 'hidden', !showBar);
      hudToggle('wBarUrg', el.runWeatherBar, 'urgent-danger', needFoldUmb || needCovidMask);
      if (showBar) {
        if (covidUrgent) {
          hudText('wBadge', el.weatherStatusBadge, '🦠 코로나 바이러스 발생!');
          hudText('wTip', el.weatherStatusTip, needCovidMask ? '마스크를 쓰세요!' : '😷 차단 준비 완료!');
        } else if (activeEv !== 'clear') {
          const curDef = DATA.WEATHER_EVENTS[activeEv] || DATA.WEATHER_EVENTS.clear;
          hudText('wBadge', el.weatherStatusBadge, `${curDef.icon || ''} ${curDef.label}`);
          hudText('wTip', el.weatherStatusTip, needFoldUmb ? '우산을 접으세요!' : (curDef.actionTip || ''));
        } else if (incomingEv && doSlow) {
          const nextDef = DATA.WEATHER_EVENTS[incomingEv] || DATA.WEATHER_EVENTS.clear;
          const sec = Math.max(0.1, run.weatherPrepTimer || 0).toFixed(1);
          hudText('wBadge', el.weatherStatusBadge, `${nextDef.icon || '⚡'} 곧 ${nextDef.label}`);
          hudText('wTip', el.weatherStatusTip, `${sec}초 후 접근`);
        }
      }
    }

    // Live Exposure / Fold / Corona Rush Countdown Pill!
    if (doSlow || covidUrgent || needFoldUmb) {
      if (covidUrgent) {
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        if (needCovidMask) {
          hudToggle('fcUrg', el.fcHeatPill, 'urgent', true);
          hudText(
            'fcTxt',
            el.fcHeatPill,
            run.covidAttack.phase === 'warn'
              ? `😷 마스크! ${Math.max(0, run.covidAttack.timer).toFixed(1)}s`
              : '🦠 돌진! 지금 마스크!'
          );
        } else {
          hudToggle('fcUrg', el.fcHeatPill, 'urgent', false);
          hudText('fcTxt', el.fcHeatPill, '🛡️ 마스크 차단 준비!');
        }
      } else if (needFoldUmb) {
        const rem = Math.max(0, gustLimit - (run.gustExposeTimer || 0));
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', true);
        hudText('fcTxt', el.fcHeatPill, `💨 우산 접기! ${rem.toFixed(1)}s`);
      } else if (run.rainExposeTimer > 0.05 && !run.umbrellaOn && run.feverTimer <= 0) {
        const rem = Math.max(0, rainLimit - run.rainExposeTimer);
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', rem <= 1.4);
        hudText('fcTxt', el.fcHeatPill, `☂️ 우산 펴기 ${rem.toFixed(1)}s`);
      } else if (run.dustExposeTimer > 0.05 && !run.maskOn && run.feverTimer <= 0) {
        const rem = Math.max(0, dustLimit - run.dustExposeTimer);
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', rem <= 1.4);
        hudText('fcTxt', el.fcHeatPill, `😷 마스크 착용 ${rem.toFixed(1)}s`);
      } else if (activeEv === 'heat' && !ch.summerImmune) {
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        if (run.umbrellaOn) {
          hudToggle('fcUrg', el.fcHeatPill, 'urgent', false);
          hudText('fcTxt', el.fcHeatPill, '☂️ 양산 보호 중');
        } else {
          hudToggle('fcUrg', el.fcHeatPill, 'urgent', run.heatGauge >= 60);
          hudText('fcTxt', el.fcHeatPill, `☂️ 폭염 ${Math.round(run.heatGauge)}%`);
        }
      } else if (run.heatGauge > 5) {
        hudToggle('fcHide', el.fcHeatPill, 'hidden', false);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', run.heatGauge >= 75);
        hudText('fcTxt', el.fcHeatPill, `🌡️ 열기 ${Math.round(run.heatGauge)}%`);
      } else {
        hudToggle('fcHide', el.fcHeatPill, 'hidden', true);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', false);
      }
    }

    // Muddy Water Splash Blindness Overlay
    if (run.mudBlindTimer > 0) {
      hudToggle('mudHide', el.mudOverlay, 'hidden', false);
      if (doSlow) {
        const op = Math.min(1, run.mudBlindTimer / 1.0).toFixed(2);
        if (hudCache.mudOp !== op) {
          hudCache.mudOp = op;
          el.mudOverlay.style.opacity = op;
        }
      }
    } else {
      hudToggle('mudHide', el.mudOverlay, 'hidden', true);
    }

    // Umbrella & Mask Toggle Buttons (instant ON/OFF visual, throttled countdown bar!)
    const umbBroken = run.umbrellaBrokenTimer > 0;
    hudToggle('umbOn', el.btnToggleUmbrella, 'on', run.umbrellaOn);
    hudToggle('umbBrk', el.btnToggleUmbrella, 'broken', umbBroken);
    hudToggle('umbFold', el.btnToggleUmbrella, 'urgent-fold', needFoldUmb);
    hudToggle('umbOpen', el.btnToggleUmbrella, 'urgent-open', needOpenUmb && !umbBroken);
    if (doSlow || hudCache._umbStateSig !== `${umbBroken}|${needFoldUmb}|${run.umbrellaOn}`) {
      hudCache._umbStateSig = `${umbBroken}|${needFoldUmb}|${run.umbrellaOn}`;
      if (umbBroken) {
        hudText('umbSt', el.gearUmbrellaState, `파손 ${Math.ceil(run.umbrellaBrokenTimer)}s`);
        hudWidth('umbBar', el.gearUmbrellaBar, `${((run.umbrellaBrokenTimer / UMBRELLA_BROKEN_CD) * 100).toFixed(1)}%`);
      } else if (needFoldUmb) {
        const rem = Math.max(0, gustLimit - (run.gustExposeTimer || 0));
        hudText('umbSt', el.gearUmbrellaState, `접기! ${rem.toFixed(1)}s`);
        hudWidth('umbBar', el.gearUmbrellaBar, `${Math.min(100, ((run.gustExposeTimer || 0) / gustLimit) * 100).toFixed(1)}%`);
      } else if (run.umbrellaOn) {
        hudText('umbSt', el.gearUmbrellaState, `${run.umbrellaActiveTimer.toFixed(1)}s`);
        hudWidth('umbBar', el.gearUmbrellaBar, `${((run.umbrellaActiveTimer / GEAR_DURATION) * 100).toFixed(1)}%`);
      } else {
        hudText('umbSt', el.gearUmbrellaState, '우산');
        hudWidth('umbBar', el.gearUmbrellaBar, '0%');
      }
    }

    hudToggle('mskOn', el.btnToggleMask, 'on', run.maskOn);
    hudToggle('mskFold', el.btnToggleMask, 'urgent-fold', needCovidMask);
    hudToggle('mskOpen', el.btnToggleMask, 'urgent-open', !needCovidMask && needOpenMask);
    const mskParryReady = covidUrgent && run.maskOn && run.maskParryTimer > 0;
    if (doSlow || hudCache._mskStateSig !== `${needCovidMask}|${mskParryReady}|${run.maskOn}`) {
      hudCache._mskStateSig = `${needCovidMask}|${mskParryReady}|${run.maskOn}`;
      if (needCovidMask) {
        hudText('mskSt', el.gearMaskState, '타이밍!');
        hudWidth('mskBar', el.gearMaskBar, '100%');
      } else if (mskParryReady) {
        hudText('mskSt', el.gearMaskState, '차단 ON');
        hudWidth('mskBar', el.gearMaskBar, `${((run.maskActiveTimer / GEAR_DURATION) * 100).toFixed(1)}%`);
      } else if (run.maskOn) {
        hudText('mskSt', el.gearMaskState, `${run.maskActiveTimer.toFixed(1)}s`);
        hudWidth('mskBar', el.gearMaskBar, `${((run.maskActiveTimer / GEAR_DURATION) * 100).toFixed(1)}%`);
      } else {
        hudText('mskSt', el.gearMaskState, '마스크');
        hudWidth('mskBar', el.gearMaskBar, '0%');
      }
    }

    // 4 Glossy HD Buff Orbs + Full-Canvas FEVER Frame Pulse + Dynamic BGM Mode (dirty-checked!)
    const fevActive = run.feverTimer > 0;
    hudToggle('orbFev', el.orbUiFever, 'active', fevActive);
    hudToggle('orbSpd', el.orbUiSpeed, 'active', run.speedBoostTimer > 0);
    hudToggle('orbMag', el.orbUiMagnet, 'active', run.magnetTimer > 0 || fevActive);
    hudToggle('orbShd', el.orbUiShield, 'active', Boolean(run.shield));
    hudToggle('wrapFev', el.runCanvasWrap, 'fever-active', fevActive);
    const targetBgm = fevActive ? 'fever' : 'run';
    if (hudCache.bgmMode !== targetBgm) {
      hudCache.bgmMode = targetBgm;
      SFX.setBgmMode(targetBgm);
    }
  }

  function finishRunGameOver() {
    run.active = false;
    run.dying = false;
    run.dead = true;
    releaseAllControlButtons();
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    el.runCanvasWrap.classList.remove('fever-active');
    SFX.setWeatherAmbient('clear');
    SFX.setAmbientPaused(false);
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

    // Update Weekly Online Ranking Record & Submit Live!
    ensureWeeklyRankCurrentWeek();
    if (finalScore > (save.weeklyRank.bestScore || 0)) {
      save.weeklyRank.bestScore = finalScore;
      save.weeklyRank.bestDist = finalDist;
      save.weeklyRank.bestYear = run.year || 1;
    }

    // Normal Play Wood Chest Acquisition Path: 400m+ grants 1 Wood Chest into Vault (up to 3/day)
    let gotWoodChest = false;
    if (finalDist >= 400 && (save.dailyWoodChestDrops.count || 0) < 3) {
      save.dailyWoodChestDrops.count = (save.dailyWoodChestDrops.count || 0) + 1;
      save.chestBag.wood = (save.chestBag.wood || 0) + 1;
      gotWoodChest = true;
    }

    persistSave(true);
    syncMyWeeklyScore();

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
    SFX.setWeatherAmbient('clear');
    SFX.setAmbientPaused(false);
    SFX.setBgmMode('menu');
    if (run && run.isTutorial) {
      if (!save.tutorialDone) {
        save.tutorialDone = true;
        persistSave();
      }
    } else if (run) {
      commitRunMissionProgress();
    }
    run = null;
    paused = false;
    releaseAllControlButtons();
    clearTutorialHighlights();
    if (el.tutRunHud) el.tutRunHud.classList.add('hidden');
    if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.add('hidden');
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
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
      const tutFrozen = Boolean(run.isTutorial && run.tut && run.tut.waitAction);
      if (run.active && !paused && !tutFrozen) {
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
        const animDt = paused || tutFrozen || (!run.active && !run.dying) ? 0 : dt;
        try {
          Renderer.renderRunFrame(runCtx, run, getCharDef(run.charId), animDt, t);
        } catch (err) {
          if (!run._renderErrShown) {
            run._renderErrShown = true;
            showToast(`⚠️ 렌더 복구: ${(err && err.message) || '스킨 로드 중'}`);
          }
        }
      }
    } else if (currentTab === 'home') {
      updateHomeRunningHero(t);
    }

    requestAnimationFrame(loop);
  }

  // ===================== EVENT LISTENERS (STUCK-PROOF MULTI-TOUCH CONTROLS) =====================
  const controlResetters = [];

  function releaseAllControlButtons() {
    for (let i = 0; i < controlResetters.length; i++) {
      try { controlResetters[i](); } catch {}
    }
  }

  function bindControlButton(btn, onDown, onUp, opts = {}) {
    if (!btn) return;
    const isToggle = Boolean(opts && opts.isToggle);
    const activePtrs = new Set();
    let toggleVisualTimer = null;

    const clearVisual = (invokeUp) => {
      if (toggleVisualTimer) {
        clearTimeout(toggleVisualTimer);
        toggleVisualTimer = null;
      }
      const hadActive = activePtrs.size > 0 || btn.classList.contains('pressed');
      activePtrs.clear();
      btn.classList.remove('pressed');
      if (invokeUp && hadActive && typeof onUp === 'function') {
        onUp();
      }
    };

    const down = (e) => {
      e.preventDefault();
      // Guard ONLY against duplicate delivery of the exact same pointerId (never block a fresh tap!)
      if (activePtrs.has(e.pointerId)) return;
      activePtrs.add(e.pointerId);
      btn.classList.add('pressed');
      if (isToggle) {
        if (toggleVisualTimer) clearTimeout(toggleVisualTimer);
        toggleVisualTimer = setTimeout(() => {
          toggleVisualTimer = null;
          activePtrs.clear();
          btn.classList.remove('pressed');
        }, 180);
      }
      onDown();
    };

    const up = (e) => {
      if (!activePtrs.has(e.pointerId)) return;
      activePtrs.delete(e.pointerId);
      if (activePtrs.size === 0) {
        if (toggleVisualTimer) {
          clearTimeout(toggleVisualTimer);
          toggleVisualTimer = null;
        }
        btn.classList.remove('pressed');
        if (typeof onUp === 'function') onUp();
      }
    };

    btn.addEventListener('pointerdown', down, { passive: false });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    // Catch releases even when a thumb slides off the button or hits the iPad/iPhone screen edge!
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);

    controlResetters.push(() => clearVisual(true));
  }

  // Zero-finger failsafe on touchscreens (iOS/iPadOS Safari): if all fingers left the screen, NO button can stay stuck!
  window.addEventListener('touchend', (e) => {
    if (e && e.touches && e.touches.length === 0) {
      releaseAllControlButtons();
    }
  }, { passive: true });
  window.addEventListener('touchcancel', (e) => {
    if (!e || !e.touches || e.touches.length === 0) {
      releaseAllControlButtons();
    }
  }, { passive: true });
  window.addEventListener('blur', releaseAllControlButtons);

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

    el.btnGoldShop.addEventListener('click', () => {
      currentShopSubtab = 'gold';
      switchTab('shop');
    });
    el.btnGemShop.addEventListener('click', () => {
      currentShopSubtab = 'gems';
      switchTab('shop');
    });
    if (el.btnHeaderProfile) {
      el.btnHeaderProfile.addEventListener('click', () => {
        SFX.click();
        openLoginOverlay();
      });
    }
    if (el.btnHeaderProfileName) {
      el.btnHeaderProfileName.addEventListener('click', () => {
        SFX.click();
        openLoginOverlay();
      });
    }
    if (el.btnScoreRoad) {
      el.btnScoreRoad.addEventListener('click', openScoreRoadModal);
    }
    if (el.btnCloseScoreRoad) {
      el.btnCloseScoreRoad.addEventListener('click', () => {
        SFX.click();
        if (el.scoreRoadOverlay) el.scoreRoadOverlay.classList.add('hidden');
      });
    }
    if (el.scoreRoadOverlay) {
      el.scoreRoadOverlay.addEventListener('click', (e) => {
        if (e.target === el.scoreRoadOverlay) el.scoreRoadOverlay.classList.add('hidden');
      });
    }
    if (el.btnScoreRoadClaimAll) {
      el.btnScoreRoadClaimAll.addEventListener('click', claimAllScoreRoad);
    }
    if (el.btnSettingsSwitchLogin) {
      el.btnSettingsSwitchLogin.addEventListener('click', () => {
        SFX.click();
        el.settingsOverlay.classList.add('hidden');
        openLoginOverlay();
      });
    }

    // Intro Login Buttons Directly Below Logo (Google / Guest)
    if (el.btnIntroGoogle) {
      el.btnIntroGoogle.addEventListener('click', (e) => {
        e.stopPropagation();
        handleOAuthLogin('google', true);
      });
    }
    if (el.btnIntroGuest) {
      el.btnIntroGuest.addEventListener('click', (e) => {
        e.stopPropagation();
        handleGuestLogin(true);
      });
    }
    if (el.btnIntroSwitchAcc) {
      el.btnIntroSwitchAcc.addEventListener('click', (e) => {
        e.stopPropagation();
        SFX.click();
        openLoginOverlay();
      });
    }

    // Account Link Modal Buttons (Google / Guest / Nickname / Logout)
    if (el.btnCloseLogin) {
      el.btnCloseLogin.addEventListener('click', () => {
        SFX.click();
        el.loginOverlay.classList.add('hidden');
      });
    }
    if (el.loginOverlay) {
      el.loginOverlay.addEventListener('click', (e) => {
        if (e.target === el.loginOverlay) {
          el.loginOverlay.classList.add('hidden');
        }
      });
    }
    if (el.btnSaveNickname) el.btnSaveNickname.addEventListener('click', saveEditedNickname);
    if (el.btnLoginSync) {
      el.btnLoginSync.addEventListener('click', () => {
        SFX.click();
        syncAccountWithCloud(save.auth, { manual: true });
      });
    }
    if (el.btnLoginLogout) el.btnLoginLogout.addEventListener('click', handleLogout);
    if (el.btnLoginGoogle) {
      el.btnLoginGoogle.addEventListener('click', () => handleOAuthLogin('google', false));
    }
    if (el.btnLoginGuest) {
      el.btnLoginGuest.addEventListener('click', () => handleGuestLogin(false));
    }
    if (el.btnRankLinkAccount) {
      el.btnRankLinkAccount.addEventListener('click', () => {
        SFX.click();
        openLoginOverlay();
      });
    }

    // Real-Money Gem IAP Modal
    if (el.btnCloseIap) {
      el.btnCloseIap.addEventListener('click', () => {
        SFX.click();
        pendingGemPack = null;
        el.iapOverlay.classList.add('hidden');
      });
    }
    if (el.btnIapCancel) {
      el.btnIapCancel.addEventListener('click', () => {
        SFX.click();
        pendingGemPack = null;
        el.iapOverlay.classList.add('hidden');
      });
    }
    if (el.iapOverlay) {
      el.iapOverlay.addEventListener('click', (e) => {
        if (e.target === el.iapOverlay) {
          pendingGemPack = null;
          el.iapOverlay.classList.add('hidden');
        }
      });
    }
    if (el.btnIapConfirm) el.btnIapConfirm.addEventListener('click', confirmIapPurchase);

    // Weekly #1 Champion 500 Gems Reward Modal
    if (el.btnClaimWeeklyChamp) el.btnClaimWeeklyChamp.addEventListener('click', claimWeeklyChampionReward);

    // Online Live Ranking Refresh + Live Countdown + Auto Poll
    if (el.btnRankRefresh) {
      el.btnRankRefresh.addEventListener('click', async () => {
        SFX.click();
        await syncMyWeeklyScore();
        await renderRankingTab();
        showToast('🔄 온라인 실시간 랭킹이 갱신되었습니다!');
      });
    }
    if (ONLINE && ONLINE.onBoardUpdate) {
      ONLINE.onBoardUpdate(() => {
        if (currentTab === 'rank') renderRankingTab();
      });
    }
    setInterval(() => {
      updateWeeklyRankCountdownUI();
    }, 1000);
    setInterval(() => {
      if (currentTab === 'rank' && (!run || !run.active)) {
        renderRankingTab();
      }
    }, 5000);

    el.btnHomeCharInfo.addEventListener('click', () => openCharDetail(previewCharIdx));
    if (el.btnHomeVault) el.btnHomeVault.addEventListener('click', openVaultModal);
    if (el.btnCloseVault) {
      el.btnCloseVault.addEventListener('click', () => {
        SFX.click();
        if (el.vaultOverlay) el.vaultOverlay.classList.add('hidden');
      });
    }
    if (el.vaultOverlay) {
      el.vaultOverlay.addEventListener('click', (e) => {
        if (e.target === el.vaultOverlay) el.vaultOverlay.classList.add('hidden');
      });
    }
    if (el.btnVaultGoGacha) {
      el.btnVaultGoGacha.addEventListener('click', () => {
        SFX.click();
        if (el.vaultOverlay) el.vaultOverlay.classList.add('hidden');
        currentShopSubtab = 'gacha';
        switchTab('shop');
      });
    }

    // Genshin Impact Style Skin Gacha Wish Animation Skip Button
    if (el.btnGachaWishSkip) {
      el.btnGachaWishSkip.addEventListener('click', (e) => {
        e.stopPropagation();
        finishActiveWishAnimation(true);
      });
    }

    // Cookie Run Style Skin Gacha Result & Pull History Modals
    if (el.btnGachaResClose) {
      el.btnGachaResClose.addEventListener('click', () => {
        SFX.click();
        if (el.gachaResultOverlay) el.gachaResultOverlay.classList.add('hidden');
      });
    }
    if (el.gachaResultOverlay) {
      el.gachaResultOverlay.addEventListener('click', (e) => {
        if (e.target === el.gachaResultOverlay) {
          SFX.click();
          el.gachaResultOverlay.classList.add('hidden');
        }
      });
    }
    if (el.btnCloseGachaHistory) {
      el.btnCloseGachaHistory.addEventListener('click', () => {
        SFX.click();
        if (el.gachaHistoryOverlay) el.gachaHistoryOverlay.classList.add('hidden');
      });
    }
    if (el.gachaHistoryOverlay) {
      el.gachaHistoryOverlay.addEventListener('click', (e) => {
        if (e.target === el.gachaHistoryOverlay) {
          SFX.click();
          el.gachaHistoryOverlay.classList.add('hidden');
        }
      });
    }

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
    if (el.btnChestStore) el.btnChestStore.addEventListener('click', storeActiveChestToVault);
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
    if (el.btnSettingsOk) {
      el.btnSettingsOk.addEventListener('click', () => {
        SFX.click();
        el.settingsOverlay.classList.add('hidden');
      });
    }
    if (el.btnReplayTutorial) {
      el.btnReplayTutorial.addEventListener('click', () => {
        SFX.click();
        el.settingsOverlay.classList.add('hidden');
        startTutorialRun();
      });
    }
    if (el.btnTutRunSkip) {
      el.btnTutRunSkip.addEventListener('click', () => {
        SFX.click();
        finishTutorialRun(true);
      });
    }
    if (el.btnTutDoneHome) {
      el.btnTutDoneHome.addEventListener('click', () => {
        exitRunToHome();
      });
    }
    if (el.btnTutDonePlay) {
      el.btnTutDonePlay.addEventListener('click', () => {
        SFX.click();
        if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.add('hidden');
        const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
        if (isCharUnlocked(ch.id)) {
          save.selectedChar = ch.id;
          persistSave();
        }
        startRun();
      });
    }
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
    if (el.btnLandscapeRun) el.btnLandscapeRun.addEventListener('click', toggleLandscapeFullscreen);

    // Auto-pause active run + keepalive cloud save flush on leave + auto cloud pull on return!
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        releaseAllControlButtons();
        if (run && run.active && !paused) {
          paused = true;
          SFX.setAmbientPaused(true);
          el.pauseOverlay.classList.remove('hidden');
        }
        if (ONLINE && save && save.auth && save.auth.loggedIn && ONLINE.isRankedProvider(save.auth.provider) && save.auth.uid && cloudHydratedUid === save.auth.uid) {
          try { ONLINE.saveCloudUserSave(save.auth.uid, save, true); } catch {}
        }
      } else if (!run || !run.active) {
        // Returning from another device/tab -> pull latest cloud progress automatically!
        if (ONLINE && save && save.auth && save.auth.loggedIn && ONLINE.isRankedProvider(save.auth.provider) && save.auth.uid) {
          syncAccountWithCloud(save.auth, { minIntervalMs: 8000 });
        }
      }
    });
    window.addEventListener('pagehide', () => {
      if (ONLINE && save && save.auth && save.auth.loggedIn && ONLINE.isRankedProvider(save.auth.provider) && save.auth.uid && cloudHydratedUid === save.auth.uid) {
        try { ONLINE.saveCloudUserSave(save.auth.uid, save, true); } catch {}
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
        renderProfileUI();
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
        renderProfileUI();
      }
      renderHomeCharStage();
    });

    el.btnPlayStart.addEventListener('click', () => {
      try {
        const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
        if (!isCharUnlocked(ch.id)) {
          buyCharacter(ch, previewCharIdx);
          return;
        }
        save.selectedChar = ch.id;
        persistSave();
        startRun();
      } catch (err) {
        showToast(`⚠️ 시작 오류: ${(err && err.message) || '다시 시도해주세요'}`);
      }
    });

    // Runner Controls + Gear Toggles (All 4 use crisp Up/Down sprite swap + stuck-proof multi-touch!)
    bindControlButton(el.btnJump, doJumpPress, doJumpRelease);
    bindControlButton(el.btnSlide, doSlideStart, doSlideEnd);
    bindControlButton(el.btnToggleUmbrella, toggleUmbrella, () => {}, { isToggle: true });
    bindControlButton(el.btnToggleMask, toggleMask, () => {}, { isToggle: true });

    el.btnPauseRun.addEventListener('click', () => {
      if (!run || !run.active) return;
      SFX.click();
      paused = true;
      releaseAllControlButtons();
      SFX.setAmbientPaused(true);
      el.pauseOverlay.classList.remove('hidden');
    });

    el.btnResumeRun.addEventListener('click', () => {
      SFX.click();
      paused = false;
      SFX.setAmbientPaused(false);
      el.pauseOverlay.classList.add('hidden');
    });

    el.btnQuitHome.addEventListener('click', exitRunToHome);
    el.btnResultHome.addEventListener('pointerdown', () => el.btnResultHome.classList.add('pressed'));
    el.btnResultHome.addEventListener('pointerup', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('pointercancel', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('pointerleave', () => el.btnResultHome.classList.remove('pressed'));
    el.btnResultHome.addEventListener('click', exitRunToHome);

    // Intro Tap-to-Start (When Logged In: Tap Prompt or Background Enters Home; When Logged Out: Use Login Buttons Below Logo!)
    let introLeaving = false;

    function enterFromIntro(ev) {
      if (!save.auth || !save.auth.loggedIn) return;
      if (ev && ev.target && ev.target.closest && ev.target.closest('#btn-intro-switch-acc')) return;
      if (introLeaving || !el.introOverlay || el.introOverlay.classList.contains('hidden')) return;
      introLeaving = true;
      dismissIntroToHome();
      setTimeout(() => { introLeaving = false; }, 400);
    }

    el.introOverlay.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      enterFromIntro(e);
    });
    window.addEventListener('pointerdown', () => {
      try {
        SFX.startBgm();
        if (!run || !run.active) SFX.setBgmMode('menu');
      } catch {}
    }, { once: true });

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
        SFX.setAmbientPaused(paused);
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

  // ===================== GLOBAL ERROR GUARD & BOOT =====================
  window.addEventListener('error', (ev) => {
    try {
      if (ev && ev.message) showToast(`⚠️ 오류: ${ev.message}`);
    } catch {}
  });
  setupEvents();
  refreshAllMenus();
  renderIntroAuthState();
  try { SFX.introJingle(); } catch {}

  // Handle Real Firebase OAuth Redirect / Persistent Session Restoration & Cross-Device Cloud Pull!
  if (ONLINE && ONLINE.onCloudSyncStatusChange) {
    ONLINE.onCloudSyncStatusChange(() => {
      try { renderProfileUI(); } catch {}
    });
  }
  if (ONLINE && ONLINE.hasFirebaseAuth()) {
    const startAuthListeners = () => {
      ONLINE.checkRedirectLoginResult().then(async (redirectProfile) => {
        if (redirectProfile) {
          await switchToAccount(redirectProfile, { carryGuestSave: save.auth && save.auth.provider === 'guest' });
          dismissIntroToHome();
        }
      }).catch(() => {});

      ONLINE.onAuthStateReady(async (fbProfile) => {
        if (!fbProfile) return;
        if (!save.auth || !save.auth.loggedIn || save.auth.uid !== fbProfile.uid) {
          await switchToAccount(fbProfile, { carryGuestSave: false });
        } else {
          // Same Google account already cached on this device -> ALWAYS pull & merge latest cloud save!
          await syncAccountWithCloud(fbProfile, { silent: false });
        }
      });
    };

    if (didEpochReset) {
      // Ensure any previously signed-in Firebase browser session is also cleanly signed out on reset!
      ONLINE.signOutOAuth().finally(startAuthListeners);
    } else {
      startAuthListeners();
    }
  }

  try { tryAutoLockLandscape(false); } catch {}
  requestAnimationFrame(loop);
})();
