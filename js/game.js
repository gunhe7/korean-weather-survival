(function () {
  const DATA = window.RUN_DATA;
  const SFX = window.SFX;
  const Renderer = window.RunRenderer;
  const ONLINE = window.OnlineService;
  const LIVE_WEATHER = window.LiveWeather;

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

  function getKstDateKey() {
    if (ONLINE && ONLINE.getKstDayInfo) return ONLINE.getKstDayInfo().dateKey;
    return getTodayKey();
  }

  const ASSET_VER = '20261121hd56';
  const ICONS = window.UIIcons;

  function uiIcon(key, size = 'sm', extraClass = '') {
    return ICONS ? ICONS.html(key, size, extraClass) : '';
  }

  function uiText(text, size = 'sm', extraClass = '') {
    return ICONS ? ICONS.formatText(text, size, extraClass) : String(text == null ? '' : text);
  }

  function ticketIconHtml(cls = '') {
    return uiIcon('ticket', cls || 'sm', `ticket-ico${cls ? ` ${cls}` : ''}`);
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

  const RANK_FRAME_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

  const DEFAULT_CONTROL_LAYOUT = {
    customized: false,
    jump: { x: 10, y: 84, scale: 1 },
    umbrella: { x: 10, y: 61, scale: 1 },
    slide: { x: 90, y: 84, scale: 1 },
    mask: { x: 90, y: 61, scale: 1 }
  };
  const CTRL_LAYOUT_KEYS = ['jump', 'slide', 'umbrella', 'mask'];
  const CTRL_LAYOUT_LABELS = { jump: '점프', slide: '슬라이드', umbrella: '우산', mask: '마스크' };

  function clampCtrlVal(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;
  }

  function normalizeControlLayout(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { customized: Boolean(src.customized) };
    CTRL_LAYOUT_KEYS.forEach((k) => {
      const defBtn = DEFAULT_CONTROL_LAYOUT[k];
      const item = src[k] && typeof src[k] === 'object' ? src[k] : {};
      out[k] = {
        x: clampCtrlVal(item.x, 6, 94, defBtn.x),
        y: clampCtrlVal(item.y, 22, 92, defBtn.y),
        scale: clampCtrlVal(item.scale, 0.6, 1.5, defBtn.scale)
      };
    });
    return out;
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
      controlLayout: normalizeControlLayout(null),
      auth: cleanAuth,
      profile: { avatarCharId: null, avatarSkinId: null, nameColor: '#ffffff', nameFrame: 'none', unlockedFrames: [], frameExpires: {} },
      seasonPass: {
        seasonId: 's1',
        xp: 0,
        goldUnlocked: false,
        claimedFree: {},
        claimedGold: {},
        bonusClaimed: 0,
        dailyMissions: { date: today, progress: { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0 }, claimed: {} }
      },
      weeklyRank: { weekKey: week, bestScore: 0, bestDist: 0, bestYear: 1, history: {}, claimedWeeks: [] },
      dailyWeatherRank: { dateKey: getKstDateKey(), bestScore: 0, bestDist: 0, bestYear: 1, cityName: '서울', weatherTag: '' }
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
      controlLayout: normalizeControlLayout(raw.controlLayout),
      auth: {
        ...cleanAuth,
        // Preserve custom saved nickname for this account if one was previously set
        nickname: (raw.auth && raw.auth.nickname) ? raw.auth.nickname : cleanAuth.nickname
      },
      profile: (() => {
        const pr = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
        const validAvId = pr.avatarCharId && validIds.has(pr.avatarCharId) ? pr.avatarCharId : null;
        const nowMs = Date.now();
        const rawExpires = pr.frameExpires && typeof pr.frameExpires === 'object' ? { ...pr.frameExpires } : {};
        const cleanExpires = {};
        const rawFrames = toSafeArray(pr.unlockedFrames).filter((f) => {
          if (!['rank_1', 'rank_2', 'rank_3'].includes(f)) return false;
          const exp = Number(rawExpires[f]);
          if (Number.isFinite(exp) && exp > 0) {
            if (exp <= nowMs) return false;
            cleanExpires[f] = exp;
            return true;
          }
          cleanExpires[f] = nowMs + RANK_FRAME_DURATION_MS;
          return true;
        });
        const activeFrame = (typeof pr.nameFrame === 'string' && rawFrames.includes(pr.nameFrame)) ? pr.nameFrame : 'none';
        return {
          avatarCharId: validAvId,
          avatarSkinId: typeof pr.avatarSkinId === 'string' ? pr.avatarSkinId : null,
          nameColor: typeof pr.nameColor === 'string' && pr.nameColor ? pr.nameColor : '#ffffff',
          nameFrame: activeFrame,
          unlockedFrames: rawFrames,
          frameExpires: cleanExpires
        };
      })(),
      seasonPass: (() => {
        const sp = raw.seasonPass && typeof raw.seasonPass === 'object' ? raw.seasonPass : {};
        const spDm = sp.dailyMissions && sp.dailyMissions.date === today ? sp.dailyMissions : def.seasonPass.dailyMissions;
        return {
          seasonId: 's1',
          xp: typeof sp.xp === 'number' && Number.isFinite(sp.xp) ? Math.max(0, Math.floor(sp.xp)) : 0,
          goldUnlocked: Boolean(sp.goldUnlocked),
          claimedFree: sp.claimedFree && typeof sp.claimedFree === 'object' ? { ...sp.claimedFree } : {},
          claimedGold: sp.claimedGold && typeof sp.claimedGold === 'object' ? { ...sp.claimedGold } : {},
          bonusClaimed: typeof sp.bonusClaimed === 'number' && Number.isFinite(sp.bonusClaimed) ? Math.max(0, Math.floor(sp.bonusClaimed)) : 0,
          dailyMissions: {
            date: today,
            progress: { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0, ...(spDm.progress || {}) },
            claimed: { ...(spDm.claimed || {}) }
          }
        };
      })(),
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
      })(),
      dailyWeatherRank: (() => {
        const curDate = getKstDateKey();
        const dr = raw.dailyWeatherRank && typeof raw.dailyWeatherRank === 'object' ? raw.dailyWeatherRank : {};
        const sameDay = dr.dateKey === curDate;
        return {
          dateKey: curDate,
          bestScore: sameDay ? (Number(dr.bestScore) || 0) : 0,
          bestDist: sameDay ? (Number(dr.bestDist) || 0) : 0,
          bestYear: sameDay ? (Number(dr.bestYear) || 1) : 1,
          cityName: sameDay && dr.cityName ? String(dr.cityName) : '서울',
          weatherTag: sameDay && dr.weatherTag ? String(dr.weatherTag) : ''
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
  let dockCollapsed = false;
  let dockAutoHideTimer = null;
  let lastTabScrollTop = 0;

  // ===================== ACTIVE RUN STATE =====================
  let run = null;
  let paused = false;

  // ===================== DOM REFERENCES =====================
  const el = {
    rotateOverlay: document.getElementById('rotate-overlay'),
    rotateCardDesc: document.getElementById('rotate-card-desc'),
    btnRotateLock: document.getElementById('btn-rotate-lock'),
    tabContainer: document.getElementById('tab-container'),
    bottomNav: document.getElementById('bottom-nav'),

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

    profileEditOverlay: document.getElementById('profile-edit-overlay'),
    btnCloseProfileEdit: document.getElementById('btn-close-profile-edit'),
    profPrevAvatar: document.getElementById('prof-prev-avatar'),
    profPrevRank: document.getElementById('prof-prev-rank'),
    profPrevNameWrap: document.getElementById('prof-prev-name-wrap'),
    profPrevStats: document.getElementById('prof-prev-stats'),
    profNicknameInput: document.getElementById('prof-nickname-input'),
    btnProfSaveNick: document.getElementById('btn-prof-save-nick'),
    btnProfOpenAccount: document.getElementById('btn-prof-open-account'),
    profCustomGrid: document.getElementById('prof-custom-grid'),

    btnHeaderProfile: document.getElementById('btn-header-profile'),
    btnHeaderProfileName: document.getElementById('btn-header-profile-name'),
    hdrProfileFrameBg: document.getElementById('hdr-profile-frame-bg'),
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
    btnOpenCtrlEditor: document.getElementById('btn-open-ctrl-editor'),
    ctrlEditorOverlay: document.getElementById('ctrl-editor-overlay'),
    ctrlEdStage: document.getElementById('ctrl-ed-stage'),
    ctrlEdSelectedName: document.getElementById('ctrl-ed-selected-name'),
    rngCtrlSize: document.getElementById('rng-ctrl-size'),
    lblCtrlSize: document.getElementById('lbl-ctrl-size'),
    btnCtrlEdReset: document.getElementById('btn-ctrl-ed-reset'),
    btnCtrlEdCancel: document.getElementById('btn-ctrl-ed-cancel'),
    btnCtrlEdSave: document.getElementById('btn-ctrl-ed-save'),

    btnHomeWeather: document.getElementById('btn-home-weather'),
    homeWeatherBtnIco: document.getElementById('home-weather-btn-ico'),
    homeWeatherBtnTemp: document.getElementById('home-weather-btn-temp'),
    modeSelectOverlay: document.getElementById('mode-select-overlay'),
    btnCloseModeSelect: document.getElementById('btn-close-mode-select'),
    btnSelectModeNormal: document.getElementById('btn-select-mode-normal'),
    btnSelectModeToday: document.getElementById('btn-select-mode-today'),
    modeTodayIco: document.getElementById('mode-today-ico'),
    modeNormalBestRow: document.getElementById('mode-normal-best-row'),
    modeTodayBestRow: document.getElementById('mode-today-best-row'),
    modeTodayMiniFactors: document.getElementById('mode-today-mini-factors'),
    modeCardWeatherLine: document.getElementById('mode-card-weather-line'),
    modeCardModPills: document.getElementById('mode-card-mod-pills'),
    btnModeOpenRank: document.getElementById('btn-mode-open-rank'),
    btnModeOpenWeather: document.getElementById('btn-mode-open-weather'),
    weatherOverlay: document.getElementById('weather-overlay'),
    btnCloseWeather: document.getElementById('btn-close-weather'),
    btnWeatherRefresh: document.getElementById('btn-weather-refresh'),
    weatherHeroIcon: document.getElementById('weather-hero-icon'),
    weatherHeroCity: document.getElementById('weather-hero-city'),
    weatherHeroSeason: document.getElementById('weather-hero-season'),
    weatherHeroLiveTag: document.getElementById('weather-hero-live-tag'),
    weatherHeroTemp: document.getElementById('weather-hero-temp'),
    weatherHeroDesc: document.getElementById('weather-hero-desc'),
    weatherHeroMeta: document.getElementById('weather-hero-meta'),
    weatherHeroUpdated: document.getElementById('weather-hero-updated'),
    weatherBuffGrid: document.getElementById('weather-buff-grid'),
    weatherModSummary: document.getElementById('weather-mod-summary'),
    btnWeatherPlayToday: document.getElementById('btn-weather-play-today'),

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
    qdotDaily: document.getElementById('qdot-daily'),
    qdotWeekly: document.getElementById('qdot-weekly'),
    qdotAch: document.getElementById('qdot-ach'),
    qdotAtt: document.getElementById('qdot-att'),
    btnTabOpenAttendance: document.getElementById('btn-tab-open-attendance'),
    btnQuestProb: document.getElementById('btn-quest-prob'),
    questResetLabel: document.getElementById('quest-reset-label'),
    pityGoldChip: document.getElementById('pity-gold-chip'),
    pityDiamondChip: document.getElementById('pity-diamond-chip'),
    bsQuestGrid: document.getElementById('bs-quest-grid'),

    rankScreenTitle: document.getElementById('rank-screen-title'),
    btnRankModeNormal: document.getElementById('btn-rank-mode-normal'),
    btnRankModeToday: document.getElementById('btn-rank-mode-today'),
    rankPrizeCrown: document.getElementById('rank-prize-crown'),
    rankPrizeInlineText: document.getElementById('rank-prize-inline-text'),
    rankMyTitleLabel: document.getElementById('rank-my-title-label'),
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
    rankPodiumStage: document.getElementById('rank-podium-stage'),
    rankBoardList: document.getElementById('rank-board-list'),

    bsRosterCount: document.getElementById('bs-roster-count'),
    charDetailOverlay: document.getElementById('char-detail-overlay'),
    btnCloseCharDetail: document.getElementById('btn-close-char-detail'),
    btnDetailSkins: document.getElementById('btn-detail-skins'),
    btnDetailHome: document.getElementById('btn-detail-home'),
    btnDetailPrev: document.getElementById('btn-detail-prev'),
    btnDetailNext: document.getElementById('btn-detail-next'),
    detailHeroStage: document.getElementById('detail-hero-stage'),
    detailSkinCount: document.getElementById('detail-skin-count'),
    charSkinsOverlay: document.getElementById('char-skins-overlay'),
    btnCloseCharSkins: document.getElementById('btn-close-char-skins'),
    charSkinsTitle: document.getElementById('char-skins-title'),
    charSkinsCountPill: document.getElementById('char-skins-count-pill'),
    charSkinsBody: document.getElementById('char-skins-body'),
    detailTopGold: document.getElementById('detail-top-gold'),
    detailTopGems: document.getElementById('detail-top-gems'),
    detailRibbonIco: document.getElementById('detail-ribbon-ico'),
    detailCharTier: document.getElementById('detail-char-tier'),
    detailCharName: document.getElementById('detail-char-name'),
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
    btnDetailMain: document.getElementById('btn-detail-main'),

    viewRun: document.getElementById('view-run'),
    runCanvasWrap: document.getElementById('run-canvas-wrap'),
    runCanvas: document.getElementById('runCanvas'),
    runPortraitImg: document.getElementById('run-portrait-img'),
    runYearNum: document.getElementById('run-year-num'),
    runSeasonLabel: document.getElementById('run-season-label'),
    runScoreText: document.getElementById('run-score-text'),
    runHearts: document.getElementById('run-hearts'),
    runFeverFill: document.getElementById('run-fever-fill'),
    runFeverText: document.getElementById('run-fever-text'),
    runGoldText: document.getElementById('run-gold-text'),
    runSeasonExpWrap: document.getElementById('run-season-exp-wrap'),
    runYearFill: document.getElementById('run-year-fill'),
    runWeatherBar: document.getElementById('run-weather-bar'),
    weatherStatusBadge: document.getElementById('weather-status-badge'),
    fcHeatPill: document.getElementById('fc-heat-pill'),
    weatherEdgeVignette: document.getElementById('weather-edge-vignette'),
    mudOverlay: document.getElementById('mud-splatter-overlay'),
    runBanner: document.getElementById('run-banner'),
    weatherCenterAlert: document.getElementById('weather-center-alert'),
    weatherAlertIcon: document.getElementById('weather-alert-icon'),
    weatherAlertTitle: document.getElementById('weather-alert-title'),

    mobileControls: document.getElementById('mobile-controls'),
    btnJump: document.getElementById('btn-jump'),
    btnSlide: document.getElementById('btn-slide'),
    btnToggleUmbrella: document.getElementById('btn-toggle-umbrella'),
    gearUmbrellaBar: document.getElementById('gear-umbrella-bar'),
    gearUmbrellaState: document.getElementById('gear-umbrella-state'),
    btnToggleMask: document.getElementById('btn-toggle-mask'),
    gearMaskBar: document.getElementById('gear-mask-bar'),
    gearMaskState: document.getElementById('gear-mask-state'),
    ctrlCenterOrbs: document.getElementById('ctrl-center-orbs'),
    orbUiFever: document.getElementById('orb-ui-fever'),
    orbUiSpeed: document.getElementById('orb-ui-speed'),
    orbUiMagnet: document.getElementById('orb-ui-magnet'),
    orbUiShield: document.getElementById('orb-ui-shield'),
    orbBarFever: document.getElementById('orb-bar-fever'),
    orbBarSpeed: document.getElementById('orb-bar-speed'),
    orbBarMagnet: document.getElementById('orb-bar-magnet'),
    orbBarShield: document.getElementById('orb-bar-shield'),
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
    weeklyChampTitle: document.getElementById('weekly-champ-title'),
    weeklyChampWeek: document.getElementById('weekly-champ-week'),
    weeklyChampScore: document.getElementById('weekly-champ-score'),
    weeklyChampGems: document.getElementById('weekly-champ-gems'),
    weeklyChampFramePreview: document.getElementById('weekly-champ-frame-preview'),
    btnClaimWeeklyChamp: document.getElementById('btn-claim-weekly-champ'),

    scoreRoadOverlay: document.getElementById('score-road-overlay'),
    scoreRoadBestVal: document.getElementById('score-road-best-val'),
    scoreRoadTrack: document.getElementById('score-road-track'),
    btnScoreRoadClaimAll: document.getElementById('btn-score-road-claim-all'),
    btnCloseScoreRoad: document.getElementById('btn-close-score-road'),

    btnHomeSeasonPass: document.getElementById('btn-home-season-pass'),
    homePassFill: document.getElementById('home-pass-fill'),
    homePassLv: document.getElementById('home-pass-lv'),
    homePassDot: document.getElementById('home-pass-dot'),
    seasonPassOverlay: document.getElementById('season-pass-overlay'),
    btnCloseSeasonPass: document.getElementById('btn-close-season-pass'),
    spTierPill: document.getElementById('sp-tier-pill'),
    btnSpClaimAll: document.getElementById('btn-sp-claim-all'),
    spXpFill: document.getElementById('sp-xp-fill'),
    spXpText: document.getElementById('sp-xp-text'),
    btnSpSkipTier: document.getElementById('btn-sp-skip-tier'),
    btnBuyGoldPass: document.getElementById('btn-buy-gold-pass'),
    spGoldActivePill: document.getElementById('sp-gold-active-pill'),
    spSeasonTimer: document.getElementById('sp-season-timer'),
    btnSpTabRewards: document.getElementById('btn-sp-tab-rewards'),
    btnSpTabMissions: document.getElementById('btn-sp-tab-missions'),
    spMissionDot: document.getElementById('sp-mission-dot'),
    spRewardsPane: document.getElementById('sp-rewards-pane'),
    spMissionsPane: document.getElementById('sp-missions-pane'),
    spMissionsList: document.getElementById('sp-missions-list'),
    spTrack: document.getElementById('sp-track'),
    spSkipOverlay: document.getElementById('sp-skip-overlay'),
    btnCloseSpSkip: document.getElementById('btn-close-sp-skip'),
    spSkipTierRange: document.getElementById('sp-skip-tier-range'),
    spSkipDesc: document.getElementById('sp-skip-desc'),
    spSkipBalance: document.getElementById('sp-skip-balance'),
    btnSpSkipCancel: document.getElementById('btn-sp-skip-cancel'),
    btnSpSkipConfirm: document.getElementById('btn-sp-skip-confirm'),
    spSkipConfirmTxt: document.getElementById('sp-skip-confirm-txt'),

    vaultOverlay: document.getElementById('vault-overlay'),
    vaultTotalPill: document.getElementById('vault-total-pill'),
    vaultTicketPill: document.getElementById('vault-ticket-pill'),
    btnVaultOpenAll: document.getElementById('btn-vault-open-all'),
    btnVaultGoGacha: document.getElementById('btn-vault-go-gacha'),
    vaultModalGrid: document.getElementById('vault-modal-grid'),
    btnCloseVault: document.getElementById('btn-close-vault'),

    vaultBatchOverlay: document.getElementById('vault-batch-overlay'),
    vaultBatchTitle: document.getElementById('vault-batch-title'),
    vaultBatchSummary: document.getElementById('vault-batch-summary'),
    vaultBatchGrid: document.getElementById('vault-batch-grid'),
    btnVaultBatchEquip: document.getElementById('btn-vault-batch-equip'),
    btnVaultBatchClose: document.getElementById('btn-vault-batch-close'),
    btnVaultBatchX: document.getElementById('btn-vault-batch-x'),

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

    skinExchangeOverlay: document.getElementById('skin-exchange-overlay'),
    btnCloseSkinExchange: document.getElementById('btn-close-skin-exchange'),
    exchangeMileageVal: document.getElementById('exchange-mileage-val'),
    skinExchangeBody: document.getElementById('skin-exchange-body'),

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
    if (!skinDef || skinDef.outfitColor) return '';
    return (skinDef.filter && skinDef.filter !== 'none') ? skinDef.filter : '';
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

    let pool = DATA.SKINS.filter((s) => DATA.isPassSkinReleased(s) && s.rarity === hitRarity);
    if (pool.length === 0) {
      // Gracefully fall back to rare skins if an intermediate tier has no skins yet (Mythic stays strictly at its exact rate!)
      pool = DATA.SKINS.filter((s) => DATA.isPassSkinReleased(s) && s.rarity === 'rare');
      if (pool.length === 0) pool = DATA.SKINS.filter((s) => DATA.isPassSkinReleased(s));
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
      rare:      { main: '#4ad8ff', trail: '#1b88ff', alt: '#b3f2ff', flash: 'rgba(180, 240, 255, 0.92)', label: '희귀 스킨 소환!' },
      epic:      { main: '#d27bff', trail: '#8a35ff', alt: '#f5c7ff', flash: 'rgba(232, 196, 255, 0.94)', label: '영웅 스킨 출현!' },
      legendary: { main: '#ffd545', trail: '#ff9614', alt: '#fff5b3', flash: 'rgba(255, 244, 196, 0.97)', label: '전설 스킨 강림!' },
      mythic:    { main: '#ff5eb8', trail: '#a855f7', alt: '#ffe46b', flash: 'rgba(255, 224, 246, 0.98)', label: '신화 MYTHIC 스킨 강림!!' }
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
      showToast(`뽑기권(상자 보관함 교환) 또는 보석(${cost.needGems.toLocaleString('ko-KR')}개)이 부족합니다!`);
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
      el.gachaResTitle.textContent = count > 1 ? `스킨 ${count}회 뽑기 결과` : '스킨 1회 뽑기 결과';
    }
    if (el.gachaResMileage) {
      el.gachaResMileage.textContent = `+${totalMileage} 마일리지 (보유 ${(save.mileage || 0).toLocaleString('ko-KR')})`;
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
          ${item.isNew ? '<span class="gacha-rc-new">NEW</span>' : '<span class="gacha-rc-dup">중복</span>'}
        </div>
        <div class="gacha-rc-art">
          <img src="${skAv}" alt="${sk.name}" style="${skFlt ? `filter:${skFlt};` : ''}" />
        </div>
        <div class="gacha-rc-name">${sk.name}</div>
        <div class="gacha-rc-sub">${item.isNew ? ownerChar.name : `중복 +${item.dupMileage || 2}M`}</div>
      `;
      el.gachaResGrid.appendChild(card);
    });

    if (el.gachaResSummary) {
      const parts = [];
      if (newSkins.length > 0) parts.push(`신규 ${newSkins.length}종`);
      if (dupMileageTotal > 0) parts.push(`중복 +${dupMileageTotal}M`);
      parts.push(`총 +${totalMileage} 마일리지`);
      el.gachaResSummary.textContent = parts.join(' · ');
    }

    if (el.btnGachaResEquip) {
      if (bestNew) {
        el.btnGachaResEquip.classList.remove('hidden');
        el.btnGachaResEquip.textContent = `[${bestNew.skin.name}] 장착`;
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
          showToast(`[${bestNew.skin.name}] 스킨 장착 완료`);
        };
      } else {
        el.btnGachaResEquip.classList.add('hidden');
        el.btnGachaResEquip.onclick = null;
      }
    }

    if (el.btnGachaResAgain) {
      const nextCost = computeGachaCost(count);
      const costHtml = nextCost.useTickets > 0 && nextCost.needGems > 0
        ? `${ticketIconHtml('btn')} ${nextCost.useTickets} + ${uiIcon('gem', 'btn')} ${nextCost.needGems.toLocaleString('ko-KR')}`
        : (nextCost.useTickets > 0 ? `${ticketIconHtml('btn')} ${nextCost.useTickets}` : `${uiIcon('gem', 'btn')} ${nextCost.needGems.toLocaleString('ko-KR')}`);
      el.btnGachaResAgain.innerHTML = `<span class="gc-again-inline">${count}회 다시 뽑기 (${costHtml})</span>`;
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
          ? `중복+${h.dupMileage}M`
          : (h.dupGold > 0 ? `중복 +${h.dupGold.toLocaleString('ko-KR')}G` : '중복+2M');
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
    // 신화(mythic) 등급 및 시즌패스 전용(seasonExclusive) 스킨은 상자에서 절대 출현하지 않음!
    if (rarity === 'mythic') rarity = 'legendary';
    let pool = DATA.SKINS.filter((s) => !s.seasonExclusive && s.rarity === rarity && s.rarity !== 'mythic');
    if (pool.length === 0) {
      pool = DATA.SKINS.filter((s) => !s.seasonExclusive && s.rarity !== 'mythic');
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
      const unownedEpic = DATA.SKINS.filter((s) => !s.seasonExclusive && s.rarity === 'epic' && !save.unlockedSkins.includes(s.id));
      const unownedLeg = DATA.SKINS.filter((s) => !s.seasonExclusive && s.rarity === 'legendary' && !save.unlockedSkins.includes(s.id));
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
      el.chestPityNote.textContent = rem === 1 ? '이번 상자 영웅 이상 스킨 확정!' : `영웅+ 천장까지 ${rem}회 남음 (${save.pity.gold || 0}/${chest.pityTarget})`;
      el.chestPityNote.classList.remove('hidden');
    } else if (tierId === 'diamond') {
      const rem = Math.max(1, chest.pityTarget - (save.pity.diamond || 0));
      el.chestPityNote.textContent = rem === 1 ? '이번 상자 전설 스킨 확정!' : `전설 천장까지 ${rem}회 남음 (${save.pity.diamond || 0}/${chest.pityTarget})`;
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
    showToast(`${chest.name}가 상자 보관함에 저장되었습니다!`);
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
      el.chestRewardRarity.innerHTML = `${uiIcon('coin', 'sm')} 골드 획득`;
      el.chestRewardRarity.style.background = '#8f5900';
      el.chestRewardRarity.style.color = '#ffe866';
      el.chestRewardVisual.innerHTML = `<img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="골드" class="rw-big-ico" />`;
      el.chestRewardName.textContent = `+${rw.amount.toLocaleString('ko-KR')} G`;
      el.chestRewardSub.textContent = `${rw.chest.name}에서 골드를 획득했습니다!`;
    } else if (rw.kind === 'diamond') {
      el.chestRewardRarity.innerHTML = `${uiIcon('gem', 'sm')} 다이아 획득!`;
      el.chestRewardRarity.style.background = '#10548c';
      el.chestRewardRarity.style.color = '#7ef6ff';
      el.chestRewardVisual.innerHTML = uiIcon('gem', 'xl', 'rw-big-emoji');
      el.chestRewardName.textContent = `+${rw.amount} 다이아`;
      el.chestRewardSub.innerHTML = uiText('희귀 보석 재화 획득! 스킨 뽑기(200보석) · 황금/다이아 상자에 사용하세요!', 'xs');
    } else if (rw.kind === 'skin') {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.rare;
      const ownerChar = getCharDef(rw.skin.charId);
      el.chestRewardRarity.textContent = `${rar.name} 스킨 획득!`;
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
        showToast(`[${rw.skin.name}] 스킨 장착 완료!`);
      };
    } else if (rw.kind === 'dup_gold') {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.rare;
      el.chestRewardRarity.textContent = `${rar.name} 스킨 전체 보유 (중복 대체)`;
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
        <h4>스킨 전용 뽑기 확률 &amp; 마일리지 교환 (4등급 체계)</h4>
        <table class="prob-table">
          <thead>
            <tr><th>등급</th><th>뽑기 확률</th><th>마일리지 교환</th><th>뽑기 중복 보상</th></tr>
          </thead>
          <tbody>
            <tr><td style="color:#47c8ff">희귀 (RARE)</td><td>${gRates.rare}%</td><td>10 마일리지</td><td>+2 마일리지</td></tr>
            <tr><td style="color:#d084ff">영웅 (EPIC)</td><td>${gRates.epic}%</td><td>30 마일리지</td><td>+2 마일리지</td></tr>
            <tr><td style="color:#ffca42">전설 (LEGENDARY)</td><td>${gRates.legendary}%</td><td>50 마일리지</td><td>+2 마일리지</td></tr>
            <tr><td style="color:#ff5ea8">신화 (MYTHIC)</td><td>${gRates.mythic}%</td><td>200 마일리지</td><td>+2 마일리지</td></tr>
          </tbody>
        </table>
        <ul class="prob-rules" style="margin-top:6px;">
          <li><strong>뽑기 비용:</strong> ${ticketIconHtml('xs')} 뽑기권 1장/회 (뽑기권 부족 시 ${uiIcon('gem', 'xs')} 200 보석/회) · <strong>1회당 +2 마일리지 적립 + 중복 스킨 출현 시 +2 마일리지 추가 지급!</strong></li>
          <li><strong>${ticketIconHtml('xs')} 상자 → 뽑기권 교환 (상자 보관함):</strong> 나무 15개 · 은 10개 · 황금 5개 · 다이아 2개 = 뽑기권 1장</li>
          <li>미출시 중간 등급(영웅·전설)은 희귀 스킨 풀로 자동 전환되며, 신화 스킨 확률(${gRates.mythic}%)은 그대로 유지됩니다.</li>
          <li><strong>시즌 패스 전용 스킨(얼음황제):</strong> 시즌 기간 동안 골드 패스로만 획득할 수 있으며, 시즌 종료 후 신화 등급 뽑기 풀에 추가됩니다.</li>
        </ul>
      </div>
      <div class="prob-section">
        <h4>상자별 보상 확률 (합계 100%)</h4>
        <table class="prob-table">
          <thead>
            <tr><th>보상</th><th>나무(300G)</th><th>은(700G)</th><th>${uiIcon('crown', 'xs')} 황금(40${uiIcon('gem', 'xs')})</th><th>${uiIcon('gem', 'xs')} 다이아(100${uiIcon('gem', 'xs')})</th></tr>
          </thead>
          <tbody>
            <tr><td>${uiIcon('coin', 'xs')} 골드</td><td>75%</td><td>65%</td><td>50%</td><td>25%</td></tr>
            <tr><td style="color:#47c8ff">희귀 스킨</td><td>23%</td><td>30%</td><td>25%</td><td>10%</td></tr>
            <tr><td style="color:#d084ff">영웅 스킨</td><td>1.5%</td><td>3%</td><td>17%</td><td>30%</td></tr>
            <tr><td style="color:#ffca42">전설 스킨</td><td>-</td><td>-</td><td>3%</td><td>25%</td></tr>
            <tr><td style="color:#ff5ea8">신화 스킨</td><td colspan="4">상자 미출현 (스킨 뽑기 · 마일리지 200 교환)</td></tr>
            <tr><td style="color:#7ef6ff">${uiIcon('gem', 'xs')} 다이아</td><td>0.5%</td><td>2%</td><td>5%</td><td>10%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="prob-section">
        <h4>인게임 상자 드랍 &amp; 천장 시스템</h4>
        <ul class="prob-rules">
          <li><strong>달리기 중 상자 등장:</strong> 나무(56%) &gt; 은(27%) &gt; 황금(13%) &gt; 다이아(4%) 비율로 등장하며 획득 시 상자 보관함에 자동 저장!</li>
          <li><strong>${uiIcon('crown', 'xs')} 황금 상자 천장 (10회):</strong> 영웅 이상 스킨 미획득 시 10회차 확정! (현재 <strong>${gPity} / 10회</strong>)</li>
          <li><strong>${uiIcon('gem', 'xs')} 다이아 상자 천장 (15회):</strong> 전설 스킨 미획득 시 15회차 확정! (현재 <strong>${dPity} / 15회</strong>)</li>
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
    el.globalToast.innerHTML = uiText(msg, 'sm');
    el.globalToast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.globalToast.classList.add('hidden'), 2200);
  }

  let bannerTimer = null;
  let runBannerActive = false;
  function showRunBanner(msg, ms = 2200, tone = 'gold', tag = '') {
    if (!el.runBanner) return;
    runBannerActive = true;
    el.runBanner.className = `run-banner bs-run-banner tone-${tone || 'gold'}`;
    if (tag) {
      el.runBanner.innerHTML = `<span class="rb-tag">${uiText(tag, 'xs')}</span><span class="rb-main">${uiText(msg, 'sm')}</span>`;
    } else {
      el.runBanner.innerHTML = `<span class="rb-main">${uiText(msg, 'sm')}</span>`;
    }
    el.runBanner.classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      runBannerActive = false;
      el.runBanner.classList.add('hidden');
    }, ms);
  }

  let weatherAlertTimer = null;
  let weatherAlertActive = false;
  const WEATHER_ALERT_META = {
    rain:       { iconKey: 'umbrella', title: '우산!' },
    flood:      { iconKey: 'umbrella', title: '우산!' },
    dust:       { iconKey: 'mask',     title: '마스크!' },
    heat:       { iconKey: 'umbrella', title: '우산!' },
    gust:       { iconSvg: '<svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true"><path d="M4 9h12a2.5 2.5 0 1 0-2.2-3.7M3 13.5h15.5a2.5 2.5 0 1 1-2.2 3.7M6 18h8" fill="none" stroke="#9be8ff" stroke-width="2.6" stroke-linecap="round"/></svg>', title: '우산 접기!' },
    ice_road:   { iconSvg: '<svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8" fill="none" stroke="#9ee8ff" stroke-width="2.4" stroke-linecap="round"/></svg>', title: '빙판!' },
    covid:      { iconKey: 'mask',     title: '마스크!' },
    covid_rush: { iconKey: 'mask',     title: '마스크!' },
    hail:       { iconKey: 'umbrella', title: '우박! 우산!' }
  };

  function showWeatherCenterAlert(weatherId, customKeyword = null) {
    if (!el.weatherCenterAlert) return;
    const meta = WEATHER_ALERT_META[weatherId];
    if (!meta) return;
    weatherAlertActive = true;
    el.weatherCenterAlert.className = `weather-center-alert ev-${weatherId}`;
    if (el.weatherAlertIcon) {
      el.weatherAlertIcon.innerHTML = meta.iconKey ? uiIcon(meta.iconKey, 'hero') : (meta.iconSvg || '');
    }
    el.weatherAlertTitle.textContent = customKeyword || meta.title;
    // Force clean animation restart on consecutive events
    void el.weatherCenterAlert.offsetWidth;
    el.weatherCenterAlert.classList.add('show');
    if (weatherAlertTimer) clearTimeout(weatherAlertTimer);
    weatherAlertTimer = setTimeout(() => {
      weatherAlertActive = false;
      if (el.weatherCenterAlert) el.weatherCenterAlert.classList.add('hidden');
    }, 1650);
  }

  function hideWeatherCenterAlert() {
    weatherAlertActive = false;
    if (weatherAlertTimer) {
      clearTimeout(weatherAlertTimer);
      weatherAlertTimer = null;
    }
    if (el.weatherCenterAlert) el.weatherCenterAlert.classList.add('hidden');
    if (el.weatherEdgeVignette) el.weatherEdgeVignette.className = 'weather-edge-vignette hidden';
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

  function isAppleTouchDevice() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isIPadOs = typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || isIPadOs;
  }

  function syncRotateGuardCopy() {
    if (isAppleTouchDevice()) {
      if (el.rotateCardDesc) {
        el.rotateCardDesc.textContent = '아이폰은 기기를 가로로 돌리면 자동으로 가로 화면으로 전환됩니다!';
      }
      if (el.btnRotateLock) {
        el.btnRotateLock.classList.add('hidden');
      }
    }
  }

  async function tryAutoLockLandscape(fromUserGesture = false) {
    // 1. Native Capacitor ScreenOrientation plugin if present
    try {
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.ScreenOrientation && cap.Plugins.ScreenOrientation.lock) {
        await cap.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
      }
    } catch {}

    // Never fight iOS/iPadOS Safari native orientation (Apple WebKit blocks JS hardware orientation lock)
    if (isAppleTouchDevice()) {
      syncRotateGuardCopy();
      return;
    }
    if (!isTouchMobileDevice()) return;
    if (landscapeLockInFlight) return;
    landscapeLockInFlight = true;
    try {
      if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
        try {
          await screen.orientation.lock('landscape');
        } catch {
          try { await screen.orientation.lock('landscape-primary'); } catch {}
        }
      }

      const docEl = document.documentElement;
      const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      const canFs = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

      // On any valid user gesture (outside restricted in-app WebViews), enter fullscreen and re-lock hardware landscape!
      if (fromUserGesture && !isFs && canFs && !isInAppBrowser()) {
        try {
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => docEl.requestFullscreen());
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          }
          if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
            try {
              await screen.orientation.lock('landscape');
            } catch {
              try { await screen.orientation.lock('landscape-primary'); } catch {}
            }
          }
        } catch {}
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

  function ensureDailyWeatherRankToday() {
    const dayInfo = (ONLINE && ONLINE.getKstDayInfo) ? ONLINE.getKstDayInfo() : { dateKey: getKstDateKey(), dateLabel: '오늘', countdownText: '00:00:00' };
    if (!save.dailyWeatherRank || typeof save.dailyWeatherRank !== 'object' || save.dailyWeatherRank.dateKey !== dayInfo.dateKey) {
      save.dailyWeatherRank = {
        dateKey: dayInfo.dateKey,
        bestScore: 0,
        bestDist: 0,
        bestYear: 1,
        cityName: (liveWeatherSnapshot && liveWeatherSnapshot.cityName) || '서울',
        weatherTag: ''
      };
    }
    return dayInfo;
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
        showToast(`${milestoneScore.toLocaleString('ko-KR')}점 달성 보상! ${rw.label}이(가) 상자 보관함에 저장되었습니다!`);
      } else {
        showToast(`${milestoneScore.toLocaleString('ko-KR')}점 달성 보상! ${rw.label} 획득!`);
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
    if (totalGold > 0) parts.push(`${totalGold.toLocaleString('ko-KR')}G`);
    if (totalGems > 0) parts.push(`보석 ${totalGems}`);
    if (totalChests > 0) parts.push(`상자 ${totalChests}개(보관함 저장)`);
    showToast(`최고점수 보상 ${ready.length}건 모두 수령! (${parts.join(' · ')})`);
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
      el.btnScoreRoadClaimAll.textContent = `모두 받기 (${unclaimed.length})`;
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
        iconHtml = uiIcon('gem', 'xl', 'sr-rw-gem');
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
          <span class="sr-node-pip">${isClaimed ? 'OK' : (canClaim ? '!' : 'R')}</span>
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
        btn.textContent = '완료';
        btn.disabled = true;
      } else {
        btn.className = 'sr-claim-btn locked';
        btn.textContent = `${(m - best).toLocaleString('ko-KR')}점 남음`;
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

  // ===================== BRAWL STARS STYLE SEASON PASS ENGINE =====================
  let currentSpTab = 'rewards';

  function ensureSeasonPass() {
    const spCfg = DATA.SEASON_PASS || { seasonId: 's1', xpPerTier: 100, maxTier: 80, bonusXpStep: 500, tiers: [] };
    const today = getTodayKey();
    if (!save.seasonPass || typeof save.seasonPass !== 'object') {
      save.seasonPass = {
        seasonId: spCfg.seasonId,
        xp: 0,
        goldUnlocked: false,
        claimedFree: {},
        claimedGold: {},
        bonusClaimed: 0,
        dailyMissions: { date: today, progress: { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0 }, claimed: {} }
      };
    }
    const sp = save.seasonPass;
    if (!sp.claimedFree || typeof sp.claimedFree !== 'object') sp.claimedFree = {};
    if (!sp.claimedGold || typeof sp.claimedGold !== 'object') sp.claimedGold = {};
    if (!sp.dailyMissions || typeof sp.dailyMissions !== 'object' || sp.dailyMissions.date !== today) {
      sp.dailyMissions = {
        date: today,
        progress: { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0 },
        claimed: {}
      };
    } else {
      sp.dailyMissions.progress = { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0, ...(sp.dailyMissions.progress || {}) };
      if (!sp.dailyMissions.claimed || typeof sp.dailyMissions.claimed !== 'object') sp.dailyMissions.claimed = {};
    }
    sp.xp = Math.max(0, Math.floor(Number(sp.xp) || 0));
    sp.bonusClaimed = Math.max(0, Math.floor(Number(sp.bonusClaimed) || 0));
    sp.goldUnlocked = Boolean(sp.goldUnlocked);
    return sp;
  }

  function getClaimablePassDailyMissions() {
    const sp = ensureSeasonPass();
    const prog = (sp.dailyMissions && sp.dailyMissions.progress) || {};
    const claimed = (sp.dailyMissions && sp.dailyMissions.claimed) || {};
    return (DATA.PASS_DAILY_MISSIONS || []).filter((m) => Math.floor(prog[m.metric] || 0) >= m.target && !claimed[m.id]);
  }

  let pendingSpSkip = null;

  function claimPassDailyMission(mission) {
    if (!mission) return;
    const sp = ensureSeasonPass();
    const prog = (sp.dailyMissions && sp.dailyMissions.progress) || {};
    const claimed = (sp.dailyMissions && sp.dailyMissions.claimed) || {};
    if (claimed[mission.id]) return;
    if (Math.floor(prog[mission.metric] || 0) < mission.target) return;
    const prevBonus = getSeasonPassProgress().bonusEarned;
    sp.dailyMissions.claimed[mission.id] = true;
    const xpGain = addSeasonPassXp(mission.xp || 100);
    const afterProg = getSeasonPassProgress();
    SFX.reward();
    persistSave(true);
    refreshAllMenus();
    if (afterProg.bonusEarned > prevBonus) {
      showToast(`패스 미션 완료! +${xpGain} XP (보너스 다이아 상자 달성!)`);
    } else if (afterProg.isMax) {
      showToast(`패스 미션 완료! 보너스 +${xpGain} XP (${afterProg.bonusCurXp}/${afterProg.bonusXpStep})`);
    } else {
      showToast(`패스 미션 완료! 시즌 패스 +${xpGain} XP 획득`);
    }
  }

  function getSeasonPassProgress() {
    const spCfg = DATA.SEASON_PASS || { xpPerTier: 100, maxTier: 80, bonusXpStep: 500, tiers: [] };
    const sp = ensureSeasonPass();
    const xpPerTier = spCfg.xpPerTier || 100;
    const maxTier = spCfg.maxTier || 80;
    const bonusXpStep = spCfg.bonusXpStep || 500;
    const baseMaxXp = maxTier * xpPerTier;
    const isMax = sp.xp >= baseMaxXp;
    const tier = isMax ? maxTier : Math.floor(sp.xp / xpPerTier);
    const overflowXp = isMax ? (sp.xp - baseMaxXp) : 0;
    const bonusEarned = isMax ? Math.floor(overflowXp / bonusXpStep) : 0;
    const bonusClaimed = Math.max(0, Math.floor(Number(sp.bonusClaimed) || 0));
    const bonusClaimable = Math.max(0, bonusEarned - bonusClaimed);
    const bonusCurXp = isMax ? (overflowXp % bonusXpStep) : 0;
    const curXp = isMax ? bonusCurXp : (sp.xp % xpPerTier);
    const reqXp = isMax ? bonusXpStep : xpPerTier;
    const pct = Math.min(100, (curXp / reqXp) * 100);
    return {
      tier, maxTier, totalXp: sp.xp, curXp, reqXp, xpPerTier,
      pct, isMax, bonusXpStep, bonusEarned, bonusClaimed, bonusClaimable, bonusCurXp
    };
  }

  function addSeasonPassXp(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return 0;
    const sp = ensureSeasonPass();
    sp.xp += add;
    return add;
  }

  function claimSeasonPassBonusChests(silentToast = false) {
    const sp = ensureSeasonPass();
    const prog = getSeasonPassProgress();
    const count = prog.bonusClaimable;
    if (count <= 0) return 0;
    sp.bonusClaimed = (sp.bonusClaimed || 0) + count;
    save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
    save.chestBag.diamond = (save.chestBag.diamond || 0) + count;
    if (!silentToast) {
      SFX.chestJackpot();
      persistSave(true);
      refreshAllMenus();
      showToast(`시즌 패스 보너스! 다이아 상자 ${count}개 획득 (상자 보관함)`);
    }
    return count;
  }

  function getSeasonDaysLeft() {
    const endsAt = (DATA.SEASON_PASS && DATA.SEASON_PASS.endsAt) || 0;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));
  }

  function closeSeasonPassSkipModal() {
    pendingSpSkip = null;
    if (el.spSkipOverlay) el.spSkipOverlay.classList.add('hidden');
  }

  function skipSeasonPassTier(targetTier = null) {
    const prog = getSeasonPassProgress();
    if (prog.isMax) {
      showToast('이미 시즌 패스 최고 티어입니다.');
      return;
    }
    const destTier = targetTier == null
      ? Math.min(prog.maxTier, prog.tier + 1)
      : Math.max(prog.tier + 1, Math.min(prog.maxTier, Math.floor(Number(targetTier) || (prog.tier + 1))));
    const tiersToSkip = destTier - prog.tier;
    if (tiersToSkip <= 0) return;
    const costPerTier = (DATA.SEASON_PASS && DATA.SEASON_PASS.skipGemCost) || 100;
    const totalCost = tiersToSkip * costPerTier;
    const curGems = save.gems || 0;
    if (curGems < totalCost) {
      showToast(`보석이 부족합니다. (보유 ${curGems.toLocaleString('ko-KR')} / 필요 ${totalCost.toLocaleString('ko-KR')})`);
      return;
    }
    pendingSpSkip = {
      fromTier: prog.tier,
      destTier,
      tiersToSkip,
      totalCost,
      xpGain: tiersToSkip * prog.xpPerTier
    };
    if (el.spSkipTierRange) {
      el.spSkipTierRange.textContent = `Lv.${prog.tier} → Lv.${destTier}`;
    }
    if (el.spSkipDesc) {
      el.spSkipDesc.textContent = tiersToSkip === 1
        ? `보석 ${totalCost.toLocaleString('ko-KR')}개로 1티어를 건너뜁니다.`
        : `보석 ${totalCost.toLocaleString('ko-KR')}개로 ${tiersToSkip}티어를 한 번에 건너뜁니다.`;
    }
    if (el.spSkipBalance) {
      el.spSkipBalance.textContent = `보유 보석 ${curGems.toLocaleString('ko-KR')} → ${(curGems - totalCost).toLocaleString('ko-KR')}`;
    }
    if (el.spSkipConfirmTxt) {
      el.spSkipConfirmTxt.textContent = `${totalCost.toLocaleString('ko-KR')} 건너뛰기`;
    }
    if (el.spSkipOverlay) {
      el.spSkipOverlay.classList.remove('hidden');
    } else {
      confirmSeasonPassSkip();
    }
  }

  function confirmSeasonPassSkip() {
    if (!pendingSpSkip) return;
    const req = pendingSpSkip;
    const prog = getSeasonPassProgress();
    if (prog.isMax) {
      closeSeasonPassSkipModal();
      showToast('이미 시즌 패스 최고 티어입니다.');
      return;
    }
    const curGems = save.gems || 0;
    if (curGems < req.totalCost) {
      closeSeasonPassSkipModal();
      showToast(`보석이 부족합니다. (보유 ${curGems.toLocaleString('ko-KR')} / 필요 ${req.totalCost.toLocaleString('ko-KR')})`);
      return;
    }
    save.gems = curGems - req.totalCost;
    addSeasonPassXp(req.xpGain);
    closeSeasonPassSkipModal();
    SFX.reward();
    persistSave(true);
    refreshAllMenus();
    showToast(`시즌 패스 Lv.${req.destTier} 달성! (보석 -${req.totalCost.toLocaleString('ko-KR')})`);
  }

  function getUnclaimedSeasonPassRewards() {
    const spCfg = DATA.SEASON_PASS || { tiers: [] };
    const sp = ensureSeasonPass();
    const prog = getSeasonPassProgress();
    const list = [];
    (spCfg.tiers || []).forEach((row) => {
      if (row.tier > prog.tier) return;
      const key = String(row.tier);
      if (row.free && !sp.claimedFree[key]) {
        list.push({ tier: row.tier, track: 'free', rw: row.free });
      }
      if (row.gold && sp.goldUnlocked && !sp.claimedGold[key]) {
        list.push({ tier: row.tier, track: 'gold', rw: row.gold });
      }
    });
    return list;
  }

  function grantSeasonPassReward(tierNum, track, rw, silentToast = false) {
    if (!rw) return null;
    const sp = ensureSeasonPass();
    const prog = getSeasonPassProgress();
    if (tierNum > prog.tier) return null;
    if (track === 'gold' && !sp.goldUnlocked) {
      if (!silentToast) showToast('골드 패스(₩9,900) 구매 후 수령할 수 있습니다.');
      return null;
    }
    const key = String(tierNum);
    const map = track === 'gold' ? sp.claimedGold : sp.claimedFree;
    if (map[key]) return null;
    map[key] = true;

    let note = rw.label.replace('\n', ' ');
    if (rw.kind === 'gold') {
      save.gold += rw.amount;
    } else if (rw.kind === 'gems') {
      save.gems = (save.gems || 0) + rw.amount;
    } else if (rw.kind === 'ticket') {
      save.gachaTickets = (save.gachaTickets || 0) + (rw.amount || 1);
    } else if (rw.kind === 'chest') {
      save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
      save.chestBag[rw.chest] = (save.chestBag[rw.chest] || 0) + (rw.amount || 1);
    } else if (rw.kind === 'skin' && rw.skinId) {
      const sk = DATA.getSkinById(rw.skinId);
      if (sk) {
        const rarInfo = (DATA.SKIN_RARITIES && DATA.SKIN_RARITIES[sk.rarity]) || DATA.SKIN_RARITIES.mythic;
        if (!save.unlockedSkins.includes(sk.id)) {
          save.unlockedSkins.push(sk.id);
          if (save.unlockedChars.includes(sk.charId)) {
            save.equippedSkins = save.equippedSkins || {};
            save.equippedSkins[sk.charId] = sk.id;
          }
          note = `${rarInfo.name} 스킨 [${sk.name}] 획득`;
        } else {
          save.gold += rarInfo.dupGold;
          save.mileage = (save.mileage || 0) + rarInfo.mileagePrice;
          note = `[${sk.name}] 중복 보상 +${rarInfo.dupGold}G · 마일리지 +${rarInfo.mileagePrice}`;
        }
      }
    }

    if (!silentToast) {
      if (rw.kind === 'skin') SFX.chestJackpot();
      else SFX.reward();
      persistSave();
      refreshAllMenus();
      showToast(`${tierNum}티어 ${track === 'gold' ? '골드' : '무료'} 보상 수령: ${note}`);
    }
    return rw;
  }

  function claimAllSeasonPassRewards() {
    const ready = getUnclaimedSeasonPassRewards();
    const prog = getSeasonPassProgress();
    if (!ready.length && prog.bonusClaimable <= 0) return;
    let gSum = 0;
    let gemSum = 0;
    let chestSum = 0;
    let tickSum = 0;
    let gotSkin = false;
    ready.forEach((it) => {
      const rw = grantSeasonPassReward(it.tier, it.track, it.rw, true);
      if (!rw) return;
      if (rw.kind === 'gold') gSum += rw.amount;
      else if (rw.kind === 'gems') gemSum += rw.amount;
      else if (rw.kind === 'chest') chestSum += (rw.amount || 1);
      else if (rw.kind === 'ticket') tickSum += (rw.amount || 1);
      else if (rw.kind === 'skin') gotSkin = true;
    });
    const bonusChests = claimSeasonPassBonusChests(true);
    chestSum += bonusChests;
    const totalCount = ready.length + bonusChests;
    if (totalCount <= 0) return;
    if (gotSkin || bonusChests > 0) SFX.chestJackpot();
    else SFX.reward();
    persistSave(true);
    refreshAllMenus();
    const parts = [];
    if (gSum > 0) parts.push(`골드 ${gSum.toLocaleString('ko-KR')}G`);
    if (gemSum > 0) parts.push(`보석 ${gemSum}`);
    if (chestSum > 0) parts.push(`상자 ${chestSum}개`);
    if (tickSum > 0) parts.push(`뽑기권 ${tickSum}장`);
    if (gotSkin) parts.push('신화 스킨');
    showToast(`시즌 패스 보상 ${totalCount}건 수령 (${parts.join(' · ')})`);
  }

  function formatSeasonPassIconHtml(rw) {
    if (rw.kind === 'gold') {
      return `<div class="sp-rw-box"><img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="골드" class="sp-rw-art" /></div>`;
    }
    if (rw.kind === 'gems') {
      return `<div class="sp-rw-box">${uiIcon('gem', 'xl', 'sp-rw-gem')}</div>`;
    }
    if (rw.kind === 'ticket') {
      return `<div class="sp-rw-box"><img src="assets/ui/gacha_ticket.png?v=${ASSET_VER}" alt="뽑기권" class="sp-rw-art" /></div>`;
    }
    if (rw.kind === 'chest') {
      const ch = DATA.CHESTS[rw.chest] || DATA.CHESTS.wood;
      return `<div class="sp-rw-box"><img src="${ch.icon}?v=${ASSET_VER}" alt="${ch.name}" class="sp-rw-art chest" /></div>`;
    }
    if (rw.kind === 'skin') {
      const sk = DATA.getSkinById(rw.skinId);
      const chDef = getCharDef(sk ? sk.charId : 'fashionista');
      const avSrc = getSkinAvatar(chDef, sk);
      const flt = getSkinFilter(sk);
      return `<div class="sp-rw-box"><img src="${avSrc}" alt="${sk ? sk.name : '신화 스킨'}" class="sp-rw-art skin" style="${flt ? `filter:${flt};` : ''}" /></div>`;
    }
    return '<div class="sp-rw-box"></div>';
  }

  function updateHomeSeasonPassUI() {
    if (!DATA.SEASON_PASS) return;
    const sp = ensureSeasonPass();
    const prog = getSeasonPassProgress();
    const unclaimed = getUnclaimedSeasonPassRewards();
    const readyMissions = getClaimablePassDailyMissions();
    const totalReady = unclaimed.length + prog.bonusClaimable + readyMissions.length;
    if (el.homePassFill) el.homePassFill.style.width = `${prog.pct.toFixed(1)}%`;
    if (el.homePassLv) {
      el.homePassLv.textContent = prog.isMax
        ? `보너스 · ${prog.bonusCurXp}/${prog.bonusXpStep}`
        : `Lv.${prog.tier} · ${prog.curXp}/${prog.xpPerTier}`;
    }
    if (el.homePassDot) {
      el.homePassDot.classList.toggle('hidden', totalReady <= 0);
      el.homePassDot.textContent = totalReady > 9 ? '9+' : String(totalReady);
    }
    if (el.btnHomeSeasonPass) {
      el.btnHomeSeasonPass.classList.toggle('gold-active', sp.goldUnlocked);
    }
  }

  function renderSeasonPassModal() {
    if (!el.spTrack || !DATA.SEASON_PASS) return;
    const spCfg = DATA.SEASON_PASS;
    const sp = ensureSeasonPass();
    const prog = getSeasonPassProgress();
    const unclaimed = getUnclaimedSeasonPassRewards();
    const readyMissions = getClaimablePassDailyMissions();
    const totalClaimable = unclaimed.length + prog.bonusClaimable;
    currentSpTab = currentSpTab === 'missions' ? 'missions' : 'rewards';

    if (el.btnSpTabRewards) {
      el.btnSpTabRewards.classList.toggle('active', currentSpTab === 'rewards');
      el.btnSpTabRewards.setAttribute('aria-selected', String(currentSpTab === 'rewards'));
    }
    if (el.btnSpTabMissions) {
      el.btnSpTabMissions.classList.toggle('active', currentSpTab === 'missions');
      el.btnSpTabMissions.setAttribute('aria-selected', String(currentSpTab === 'missions'));
    }
    if (el.spRewardsPane) el.spRewardsPane.classList.toggle('hidden', currentSpTab !== 'rewards');
    if (el.spMissionsPane) el.spMissionsPane.classList.toggle('hidden', currentSpTab !== 'missions');
    if (el.spMissionDot) {
      el.spMissionDot.classList.toggle('hidden', readyMissions.length <= 0);
      el.spMissionDot.textContent = readyMissions.length > 9 ? '9+' : String(readyMissions.length);
    }

    if (el.spTierPill) {
      el.spTierPill.textContent = prog.isMax ? `Lv.${prog.maxTier} MAX` : `Lv.${prog.tier} / ${prog.maxTier}`;
    }
    if (el.btnSpClaimAll) {
      el.btnSpClaimAll.classList.toggle('hidden', totalClaimable === 0);
      el.btnSpClaimAll.textContent = `모두 받기 (${totalClaimable})`;
    }
    if (el.spXpFill) el.spXpFill.style.width = `${prog.pct.toFixed(1)}%`;
    if (el.spXpText) {
      el.spXpText.textContent = prog.isMax
        ? `보너스 ${prog.bonusCurXp} / ${prog.bonusXpStep} XP`
        : `${prog.curXp} / ${prog.xpPerTier} XP`;
    }
    if (el.btnSpSkipTier) {
      const skipCost = spCfg.skipGemCost || 100;
      el.btnSpSkipTier.innerHTML = `${uiIcon('skip', 'xs', 'sp-btn-ico')}<span>1티어</span>${uiIcon('gem', 'xs', 'sp-btn-ico')}<span>${skipCost}</span>`;
      el.btnSpSkipTier.disabled = prog.isMax;
      el.btnSpSkipTier.classList.toggle('hidden', prog.isMax);
    }
    if (el.spSeasonTimer) {
      const daysLeft = getSeasonDaysLeft();
      el.spSeasonTimer.textContent = daysLeft > 0
        ? `종료 D-${daysLeft}`
        : '얼음황제 뽑기 출시';
    }
    if (el.btnBuyGoldPass) el.btnBuyGoldPass.classList.toggle('hidden', sp.goldUnlocked);
    if (el.spGoldActivePill) el.spGoldActivePill.classList.toggle('hidden', !sp.goldUnlocked);

    if (el.spMissionsList) {
      el.spMissionsList.innerHTML = '';
      const dm = (sp && sp.dailyMissions) || { progress: {}, claimed: {} };
      const mProg = dm.progress || {};
      const mClaimed = dm.claimed || {};
      (DATA.PASS_DAILY_MISSIONS || []).forEach((m) => {
        const cur = Math.min(m.target, Math.floor(mProg[m.metric] || 0));
        const pct = Math.min(100, (cur / m.target) * 100);
        const isDone = cur >= m.target;
        const isClaimed = Boolean(mClaimed[m.id]);

        const card = document.createElement('div');
        card.className = `sp-mission-card${isClaimed ? ' claimed' : (isDone ? ' ready' : '')}`;
        card.innerHTML = `
          <div class="sp-mission-ico" aria-hidden="true">${uiIcon(m.iconKey || 'm_play', 'md')}</div>
          <div class="sp-mission-body">
            <div class="sp-mission-top">
              <span class="sp-mission-title">${m.title}</span>
              <span class="sp-mission-xp">+${m.xp} XP</span>
            </div>
            <div class="sp-mission-bar-row">
              <div class="sp-mission-bar"><div class="sp-mission-fill" style="width:${pct.toFixed(1)}%"></div></div>
              <span class="sp-mission-prog">${cur.toLocaleString('ko-KR')} / ${m.target.toLocaleString('ko-KR')}${m.unit}</span>
            </div>
          </div>
        `;
        const btn = document.createElement('button');
        btn.type = 'button';
        if (isClaimed) {
          btn.className = 'sp-mission-btn done';
          btn.innerHTML = `${uiIcon('check', 'xs', 'sp-btn-ico')}<span>수령 완료</span>`;
          btn.disabled = true;
        } else if (isDone) {
          btn.className = 'sp-mission-btn ready';
          btn.textContent = `+${m.xp} XP 받기`;
          btn.onclick = () => claimPassDailyMission(m);
        } else {
          btn.className = 'sp-mission-btn locked';
          btn.textContent = '진행 중';
          btn.disabled = true;
        }
        card.appendChild(btn);
        el.spMissionsList.appendChild(card);
      });
    }

    el.spTrack.innerHTML = '';
    let focusCol = null;

    const buildCard = (tierNum, track, rw, reached) => {
      const isGold = track === 'gold';
      const claimedMap = isGold ? sp.claimedGold : sp.claimedFree;
      const isClaimed = Boolean(claimedMap[String(tierNum)]);
      const canClaim = reached && !isClaimed && (!isGold || sp.goldUnlocked);
      const needsPass = reached && isGold && !sp.goldUnlocked;
      const isFinal = tierNum === spCfg.maxTier;

      const card = document.createElement('div');
      card.className = `sp-card ${isGold ? 'gold-track' : 'free-track'}${isFinal ? ' tier-final' : ''}${isClaimed ? ' claimed' : (canClaim ? ' ready' : ' locked')}`;
      card.innerHTML = `
        ${isGold && isFinal ? '<span class="sp-final-tag">최종 보상</span>' : ''}
        ${formatSeasonPassIconHtml(rw)}
        <div class="sp-rw-lbl">${rw.label}</div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      if (canClaim) {
        btn.className = 'sp-claim-btn ready';
        btn.textContent = '받기';
        btn.onclick = () => grantSeasonPassReward(tierNum, track, rw, false);
      } else if (isClaimed) {
        btn.className = 'sp-claim-btn done';
        btn.innerHTML = `${uiIcon('check', 'xs', 'sp-btn-ico')}<span>완료</span>`;
        btn.disabled = true;
      } else if (needsPass) {
        btn.className = 'sp-claim-btn locked';
        btn.innerHTML = `${uiIcon('crown', 'xs', 'sp-btn-ico')}<span>골드 필요</span>`;
        btn.onclick = () => openGoldPassPurchase();
      } else {
        btn.className = 'sp-claim-btn locked-clean';
        btn.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>Lv.${tierNum}</span>`;
        btn.title = `Lv.${tierNum}까지 건너뛰기`;
        btn.onclick = () => skipSeasonPassTier(tierNum);
      }
      card.appendChild(btn);
      return card;
    };

    const skipUnitCost = spCfg.skipGemCost || 100;
    (spCfg.tiers || []).forEach((row) => {
      const reached = prog.tier >= row.tier;
      const isNext = !reached && row.tier === prog.tier + 1;
      const col = document.createElement('div');
      col.className = `sp-col${row.tier === spCfg.maxTier ? ' tier-final' : ''}`;
      col.appendChild(buildCard(row.tier, 'gold', row.gold, reached));

      const tierCell = document.createElement('div');
      tierCell.className = `sp-tier-cell${reached ? ' reached' : (isNext ? ' next-tier' : '')}`;
      if (isNext) {
        const skipNode = document.createElement('button');
        skipNode.type = 'button';
        skipNode.className = 'sp-tier-node next-tier next-skip-btn';
        skipNode.title = `1티어 건너뛰기 (보석 ${skipUnitCost.toLocaleString('ko-KR')}개)`;
        skipNode.innerHTML = `<span class="sp-node-num">${row.tier}</span>${uiIcon('gem', 'xs', 'sp-btn-ico')}<span>${skipUnitCost.toLocaleString('ko-KR')}</span>`;
        skipNode.onclick = () => skipSeasonPassTier(row.tier);
        tierCell.appendChild(skipNode);
      } else {
        const node = document.createElement('div');
        node.className = `sp-tier-node${reached ? ' reached' : ''}`;
        node.textContent = String(row.tier);
        tierCell.appendChild(node);
      }
      col.appendChild(tierCell);

      col.appendChild(buildCard(row.tier, 'free', row.free, reached));

      const hasReadyHere = reached && (!sp.claimedFree[String(row.tier)] || (sp.goldUnlocked && !sp.claimedGold[String(row.tier)]));
      if (!focusCol && (hasReadyHere || !reached)) {
        focusCol = col;
      }
      el.spTrack.appendChild(col);
    });

    // End-of-Pass Brawl Stars 500 XP Repeating Bonus Diamond Chest Card
    const bonusCol = document.createElement('div');
    bonusCol.className = 'sp-col tier-bonus';
    const dChest = (DATA.CHESTS && DATA.CHESTS.diamond) || { icon: 'assets/chests/chest_diamond_0.png', name: '다이아 상자' };
    const bonusPct = prog.isMax ? Math.min(100, (prog.bonusCurXp / prog.bonusXpStep) * 100) : 0;
    const bonusCard = document.createElement('div');
    bonusCard.className = `sp-bonus-card${prog.bonusClaimable > 0 ? ' ready' : (prog.isMax ? '' : ' locked')}`;
    bonusCard.innerHTML = `
      <span class="sp-bonus-badge">반복 보너스</span>
      <div class="sp-bonus-art-wrap">
        <img src="${dChest.icon}?v=${ASSET_VER}" alt="${dChest.name}" class="sp-bonus-art" />
      </div>
      <div class="sp-bonus-title">다이아 상자 ×1</div>
      <div class="sp-bonus-sub">${prog.bonusXpStep} XP마다 지급</div>
      <div class="sp-bonus-prog-track">
        <div class="sp-bonus-prog-fill" style="width:${bonusPct.toFixed(1)}%"></div>
        <span class="sp-bonus-prog-txt">${prog.isMax ? `${prog.bonusCurXp} / ${prog.bonusXpStep} XP` : '80티어 완료 후'}</span>
      </div>
      ${prog.bonusClaimed > 0 ? `<div class="sp-bonus-count">누적 ${prog.bonusClaimed}개 수령</div>` : ''}
    `;
    const bonusBtn = document.createElement('button');
    bonusBtn.type = 'button';
    if (prog.bonusClaimable > 0) {
      bonusBtn.className = 'sp-claim-btn ready';
      bonusBtn.textContent = `받기 (${prog.bonusClaimable})`;
      bonusBtn.onclick = () => claimSeasonPassBonusChests(false);
    } else if (prog.isMax) {
      bonusBtn.className = 'sp-claim-btn done';
      bonusBtn.textContent = '진행 중';
      bonusBtn.disabled = true;
    } else {
      bonusBtn.className = 'sp-claim-btn skip-far';
      bonusBtn.textContent = 'Lv.80 이후';
      bonusBtn.disabled = true;
    }
    bonusCard.appendChild(bonusBtn);
    bonusCol.appendChild(bonusCard);
    el.spTrack.appendChild(bonusCol);

    if (!focusCol && (prog.bonusClaimable > 0 || prog.isMax)) {
      focusCol = bonusCol;
    }

    if (currentSpTab === 'rewards' && focusCol && el.spTrack.scrollTo) {
      requestAnimationFrame(() => {
        try {
          const targetX = Math.max(0, focusCol.offsetLeft - el.spTrack.offsetLeft - 12);
          el.spTrack.scrollTo({ left: targetX, behavior: 'smooth' });
        } catch {}
      });
    }
  }

  function openSeasonPassModal() {
    if (!el.seasonPassOverlay) return;
    SFX.click();
    renderSeasonPassModal();
    el.seasonPassOverlay.classList.remove('hidden');
  }

  function openGoldPassPurchase() {
    const spCfg = DATA.SEASON_PASS || {};
    const sp = ensureSeasonPass();
    if (sp.goldUnlocked) {
      showToast('이미 시즌 1 골드 패스가 활성화되어 있습니다.');
      return;
    }
    openIapModal({
      id: 'gold_pass_s1',
      isGoldPass: true,
      productId: spCfg.productId || 'com.gunhe7.kweathersurvival.goldpass_s1',
      name: '시즌 1 골드 패스',
      krwPrice: spCfg.goldPriceKrw || 9900,
      gems: 0
    });
  }

  function openVaultChestsBatch(tierOrAll = 'all') {
    save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
    const tiersToOpen = tierOrAll === 'all' ? DATA.CHEST_ORDER : [tierOrAll];
    const plan = [];
    tiersToOpen.forEach((tId) => {
      const qty = Math.max(0, Math.floor(save.chestBag[tId] || 0));
      for (let i = 0; i < qty; i++) plan.push(tId);
    });
    if (plan.length === 0) return;

    // Deduct all planned chests before rolling
    tiersToOpen.forEach((tId) => {
      save.chestBag[tId] = 0;
    });

    const rewards = [];
    let totalGold = 0;
    let totalDupGold = 0;
    let totalGems = 0;
    const newSkins = [];
    plan.forEach((tId) => {
      const rw = rollChestReward(tId);
      rewards.push(rw);
      if (rw.kind === 'gold') totalGold += rw.amount;
      else if (rw.kind === 'dup_gold') totalDupGold += rw.amount;
      else if (rw.kind === 'diamond') totalGems += rw.amount;
      else if (rw.kind === 'skin' && rw.skin) newSkins.push(rw);
    });

    persistSave(true);
    refreshAllMenus();
    if (newSkins.length > 0 || totalGems > 0) SFX.chestJackpot();
    else SFX.chestOpen();

    if (!el.vaultBatchOverlay || !el.vaultBatchGrid) {
      showToast(`상자 ${plan.length}개 개봉 완료!`);
      return;
    }

    const tierDef = tierOrAll !== 'all' ? DATA.CHESTS[tierOrAll] : null;
    if (el.vaultBatchTitle) {
      el.vaultBatchTitle.textContent = tierDef
        ? `${tierDef.name} ${plan.length}개 일괄 개봉!`
        : `상자 ${plan.length}개 전체 개봉!`;
    }
    if (el.vaultBatchSummary) {
      const pills = [`<span class="vb-pill cnt">총 ${plan.length}개 개봉</span>`];
      if (totalGold + totalDupGold > 0) {
        pills.push(`<span class="vb-pill gold">${uiIcon('coin', 'xs')} +${(totalGold + totalDupGold).toLocaleString('ko-KR')}G</span>`);
      }
      if (totalGems > 0) {
        pills.push(`<span class="vb-pill gem">${uiIcon('gem', 'xs')} +${totalGems.toLocaleString('ko-KR')}</span>`);
      }
      if (newSkins.length > 0) {
        pills.push(`<span class="vb-pill skin">신규 스킨 ${newSkins.length}종!</span>`);
      }
      el.vaultBatchSummary.innerHTML = pills.join('');
    }

    el.vaultBatchGrid.innerHTML = '';
    const rarRank = { mythic: 4, legendary: 3, epic: 2, rare: 1 };
    const sortedSkins = newSkins.slice().sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0));

    // Render all newly unlocked skins first
    sortedSkins.forEach((rw) => {
      const rar = DATA.SKIN_RARITIES[rw.rarity] || DATA.SKIN_RARITIES.rare;
      const ownerChar = getCharDef(rw.skin.charId);
      const skAv = getSkinAvatar(ownerChar, rw.skin);
      const skFlt = getSkinFilter(rw.skin);
      const item = document.createElement('div');
      item.className = `vb-card skin rar-${rw.rarity}`;
      item.innerHTML = `
        <span class="vb-tag" style="background:${rar.bg};color:${rar.color}">${rar.name} NEW!</span>
        <img src="${skAv}" alt="${rw.skin.name}" class="vb-art" style="${skFlt ? `filter:${skFlt};` : ''}" />
        <div class="vb-name">${rw.skin.name}</div>
      `;
      el.vaultBatchGrid.appendChild(item);
    });

    if (totalGems > 0) {
      const item = document.createElement('div');
      item.className = 'vb-card gem';
      item.innerHTML = `
        <span class="vb-tag gem">보석 획득</span>
        <div class="vb-art-ico">${uiIcon('gem', 'xl')}</div>
        <div class="vb-name">+${totalGems.toLocaleString('ko-KR')} 보석</div>
      `;
      el.vaultBatchGrid.appendChild(item);
    }

    if (totalGold > 0) {
      const item = document.createElement('div');
      item.className = 'vb-card gold';
      item.innerHTML = `
        <span class="vb-tag gold">골드 획득</span>
        <img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="골드" class="vb-art" />
        <div class="vb-name">+${totalGold.toLocaleString('ko-KR')} G</div>
      `;
      el.vaultBatchGrid.appendChild(item);
    }

    if (totalDupGold > 0) {
      const item = document.createElement('div');
      item.className = 'vb-card gold';
      item.innerHTML = `
        <span class="vb-tag dup">중복 골드</span>
        <img src="assets/design/item_coin.png?v=${ASSET_VER}" alt="중복 골드" class="vb-art" />
        <div class="vb-name">+${totalDupGold.toLocaleString('ko-KR')} G</div>
      `;
      el.vaultBatchGrid.appendChild(item);
    }

    if (el.btnVaultBatchEquip) {
      const bestSkinRw = sortedSkins[0] || null;
      if (bestSkinRw) {
        el.btnVaultBatchEquip.classList.remove('hidden');
        el.btnVaultBatchEquip.textContent = `[${bestSkinRw.skin.name}] 장착`;
        el.btnVaultBatchEquip.onclick = () => {
          SFX.levelUp();
          save.equippedSkins[bestSkinRw.skin.charId] = bestSkinRw.skin.id;
          if (isCharUnlocked(bestSkinRw.skin.charId)) {
            save.selectedChar = bestSkinRw.skin.charId;
            previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === bestSkinRw.skin.charId));
          }
          persistSave();
          el.vaultBatchOverlay.classList.add('hidden');
          refreshAllMenus();
          showToast(`[${bestSkinRw.skin.name}] 스킨 장착 완료!`);
        };
      } else {
        el.btnVaultBatchEquip.classList.add('hidden');
        el.btnVaultBatchEquip.onclick = null;
      }
    }

    el.vaultBatchOverlay.classList.remove('hidden');
  }

  function renderVaultModal() {
    if (!el.vaultModalGrid) return;
    const total = getTotalBagChests();
    if (el.vaultTotalPill) el.vaultTotalPill.textContent = `보유 ${total}개`;
    if (el.vaultTicketPill) el.vaultTicketPill.innerHTML = `${ticketIconHtml('sm')} 뽑기권 ${(save.gachaTickets || 0).toLocaleString('ko-KR')}장`;
    if (el.btnVaultOpenAll) {
      el.btnVaultOpenAll.classList.toggle('hidden', total < 2);
      el.btnVaultOpenAll.textContent = `전체 열기 (${total})`;
    }
    el.vaultModalGrid.innerHTML = '';

    DATA.CHEST_ORDER.forEach((tierId) => {
      const chest = DATA.CHESTS[tierId];
      const qty = (save.chestBag && save.chestBag[tierId]) || 0;
      const ticketCost = chest.ticketCost || 15;
      const pityLine = tierId === 'gold'
        ? `영웅+ 천장 ${save.pity.gold || 0}/10회`
        : (tierId === 'diamond'
          ? `전설 천장 ${save.pity.diamond || 0}/15회`
          : `골드 ${chest.goldRange[0]}~${chest.goldRange[1]}G · 보석 ${chest.gemRange[0]}~${chest.gemRange[1]}`);

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
        <div class="vault-card-sub">${uiText(pityLine, 'xs')}</div>
      `;
      const btnRow = document.createElement('div');
      btnRow.className = 'vault-card-actions';

      const openRow = document.createElement('div');
      openRow.className = 'vault-open-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      if (qty > 0) {
        btn.className = 'vault-open-btn ready';
        btn.textContent = qty >= 2 ? '1개 열기' : '열기!';
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
      openRow.appendChild(btn);

      if (qty >= 2) {
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'vault-open-multi-btn';
        allBtn.textContent = `${qty}개 열기`;
        allBtn.onclick = () => openVaultChestsBatch(tierId);
        openRow.appendChild(allBtn);
      }
      btnRow.appendChild(openRow);

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
        showToast(`${chest.name} ${ticketCost}개 → 스킨 뽑기권 1장 교환 완료! (보유 ${save.gachaTickets}장)`);
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

  const RANK_ART_VER = '20261121hd78';
  let currentProfileTab = 'icons';

  function escapeNickHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function ensureSaveProfile() {
    if (!save.profile || typeof save.profile !== 'object') {
      save.profile = { avatarCharId: null, avatarSkinId: null, nameColor: '#ffffff', nameFrame: 'none', unlockedFrames: [], frameExpires: {} };
    }
    if (!Array.isArray(save.profile.unlockedFrames)) save.profile.unlockedFrames = [];
    if (!save.profile.frameExpires || typeof save.profile.frameExpires !== 'object') save.profile.frameExpires = {};
    const nowMs = Date.now();
    let changed = false;
    save.profile.unlockedFrames = save.profile.unlockedFrames.filter((fid) => {
      if (!['rank_1', 'rank_2', 'rank_3'].includes(fid)) {
        changed = true;
        return false;
      }
      const exp = Number(save.profile.frameExpires[fid]);
      if (!Number.isFinite(exp) || exp <= 0) {
        save.profile.frameExpires[fid] = nowMs + RANK_FRAME_DURATION_MS;
        return true;
      }
      if (exp <= nowMs) {
        delete save.profile.frameExpires[fid];
        changed = true;
        return false;
      }
      return true;
    });
    if (save.profile.nameFrame && save.profile.nameFrame !== 'none' && !save.profile.unlockedFrames.includes(save.profile.nameFrame)) {
      save.profile.nameFrame = 'none';
      changed = true;
    }
    if (save.profile.nameColor === 'rainbow' && !ensureSeasonPass().goldUnlocked) {
      save.profile.nameColor = '#ffffff';
      changed = true;
    }
    if (changed) {
      try { persistSave(false, { localOnly: true }); } catch {}
    }
    return save.profile;
  }

  function getFrameRemainingLabel(frameId) {
    if (!frameId || frameId === 'none') return '';
    const prof = ensureSaveProfile();
    const exp = prof.frameExpires && Number(prof.frameExpires[frameId]);
    if (!Number.isFinite(exp) || exp <= 0) return '30일';
    const rem = exp - Date.now();
    if (rem <= 0) return '';
    if (rem >= 86400000) return `${Math.ceil(rem / 86400000)}일`;
    return `${Math.max(1, Math.ceil(rem / 3600000))}시간`;
  }

  function getProfileAvatarInfo(profileObj, fallbackCharId, fallbackSkinId, checkLocalUnlock = false) {
    const useCharId = (profileObj && profileObj.avatarCharId) || fallbackCharId || save.selectedChar;
    const ch = DATA.CHARACTERS.find((c) => c.id === useCharId) || getCharDef(fallbackCharId || save.selectedChar);
    let sk = null;
    if (profileObj && profileObj.avatarCharId) {
      if (profileObj.avatarSkinId) {
        const candidate = DATA.getSkinById(profileObj.avatarSkinId);
        if (candidate && candidate.charId === ch.id && (!checkLocalUnlock || save.unlockedSkins.includes(candidate.id))) {
          sk = candidate;
        }
      }
    } else if (fallbackSkinId) {
      const candidate = DATA.getSkinById(fallbackSkinId);
      if (candidate && (!checkLocalUnlock || save.unlockedSkins.includes(candidate.id))) sk = candidate;
    }
    return {
      src: getSkinAvatar(ch, sk),
      filter: getSkinFilter(sk),
      charDef: ch,
      skinDef: sk
    };
  }

  function getNameFrameMeta(frameId) {
    const frames = DATA.PROFILE_NAME_FRAMES || [];
    return frames.find((f) => f.id === frameId) || null;
  }

  function applyNameColorStyle(node, nameColor) {
    if (!node) return;
    const isRainbow = nameColor === 'rainbow';
    node.classList.toggle('nick-rainbow', isRainbow);
    node.style.color = isRainbow ? '' : (nameColor || '#ffffff');
  }

  function renderNameplateHtml(nickname, nameFrame, nameColor, sizeClass = 'sm', extraPlainClass = '') {
    const safeNick = escapeNickHtml(nickname || '날씨러너');
    const isRainbow = nameColor === 'rainbow';
    const colorAttr = isRainbow ? '' : `style="color:${escapeNickHtml(nameColor || '#ffffff')};"`;
    const rainbowCls = isRainbow ? ' nick-rainbow' : '';
    const frameMeta = getNameFrameMeta(nameFrame);
    if (frameMeta && frameMeta.img) {
      return `<span class="rank-nameplate ${frameMeta.id} ${sizeClass}"><img src="${frameMeta.img}?v=${RANK_ART_VER}" alt="" class="rnp-bg" /><span class="rnp-txt${rainbowCls}" ${colorAttr}>${safeNick}</span></span>`;
    }
    const innerSpan = `<span${rainbowCls ? ` class="${rainbowCls.trim()}"` : ''} ${colorAttr}>${safeNick}</span>`;
    return extraPlainClass ? `<span class="${escapeNickHtml(extraPlainClass)}">${innerSpan}</span>` : innerSpan;
  }

  async function syncProfileOnlineIfLinked() {
    persistSave(true);
    renderProfileUI();
    if (currentTab === 'rank') renderRankingTab();
    if (ONLINE && save.auth && ONLINE.isRankedProvider(save.auth.provider)) {
      try { await syncMyWeeklyScore(); } catch {}
      try { await syncMyDailyWeatherScore(); } catch {}
      if (currentTab === 'rank') renderRankingTab();
    }
  }

  function renderProfileUI() {
    const auth = save.auth || { loggedIn: false, provider: 'guest', nickname: '게스트' };
    const meta = ONLINE ? ONLINE.getProviderMeta(auth.provider) : { badge: 'GUEST', label: '게스트' };
    const nick = auth.nickname || meta.label;
    const isLinked = ONLINE ? ONLINE.isRankedProvider(auth.provider) : false;
    const prof = ensureSaveProfile();

    const selCh = DATA.CHARACTERS.find((c) => c.id === save.selectedChar) || DATA.CHARACTERS[0];
    const selSkin = getEquippedSkin(selCh.id);
    const avInfo = getProfileAvatarInfo(prof, selCh.id, selSkin ? selSkin.id : null, true);
    if (el.hdrProfileAvatar) {
      el.hdrProfileAvatar.src = avInfo.src;
      el.hdrProfileAvatar.style.filter = avInfo.filter;
    }

    const bracket = getScoreRoadBracket(save.bestScore || 0);
    const unclaimedCnt = getUnclaimedScoreRoadMilestones().length;
    if (el.hdrProfileRank) {
      el.hdrProfileRank.textContent = `R${bracket.rank}`;
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
    const activeFrame = (prof.unlockedFrames.includes(prof.nameFrame) && getNameFrameMeta(prof.nameFrame)) ? getNameFrameMeta(prof.nameFrame) : null;
    if (el.btnHeaderProfileName) {
      el.btnHeaderProfileName.classList.toggle('has-rank-frame', Boolean(activeFrame && activeFrame.img));
      el.btnHeaderProfileName.classList.remove('frame-rank_1', 'frame-rank_2', 'frame-rank_3');
      if (activeFrame && activeFrame.img) {
        el.btnHeaderProfileName.classList.add(`frame-${activeFrame.id}`);
      }
    }
    if (el.hdrProfileFrameBg) {
      if (activeFrame && activeFrame.img) {
        el.hdrProfileFrameBg.src = `${activeFrame.img}?v=${RANK_ART_VER}`;
        el.hdrProfileFrameBg.classList.remove('hidden');
      } else {
        el.hdrProfileFrameBg.classList.add('hidden');
      }
    }
    if (el.hdrProfileName) {
      el.hdrProfileName.textContent = nick;
      applyNameColorStyle(el.hdrProfileName, prof.nameColor);
    }

    setProviderChip(el.settingsAccountBadge, auth.provider, false);
    if (el.settingsAccountName) el.settingsAccountName.textContent = nick;
    const syncSt = (ONLINE && ONLINE.getCloudSyncStatus) ? ONLINE.getCloudSyncStatus() : { ok: null, status: 0, error: '' };
    const acctLabel = auth.email || meta.label;
    const syncStateTxt = !isLinked
      ? '게스트 모드 (기기 저장)'
      : (syncSt.ok === true
        ? `${acctLabel} · 동기화 완료`
        : `${acctLabel} · 자동 저장 중`);

    if (el.settingsAccountSub) {
      el.settingsAccountSub.textContent = syncStateTxt;
    }

    setProviderChip(el.loginCurBadge, auth.provider, false);
    if (el.loginCurName) el.loginCurName.textContent = auth.loggedIn ? nick : '미로그인';
    if (el.loginCurSub) {
      el.loginCurSub.textContent = !auth.loggedIn ? '계정을 선택해 주세요' : syncStateTxt;
    }
    if (el.btnLoginSync) el.btnLoginSync.classList.toggle('hidden', !auth.loggedIn || !isLinked);
    if (el.btnLoginLogout) el.btnLoginLogout.classList.toggle('hidden', !auth.loggedIn);
    renderIntroAuthState();
    if (el.profileEditOverlay && !el.profileEditOverlay.classList.contains('hidden')) {
      renderProfileEditModal();
    }
  }

  function renderProfileEditModal() {
    if (!el.profCustomGrid) return;
    const prof = ensureSaveProfile();
    const auth = save.auth || { nickname: '게스트' };
    const nick = auth.nickname || '날씨러너';
    const selCh = DATA.CHARACTERS.find((c) => c.id === save.selectedChar) || DATA.CHARACTERS[0];
    const selSkin = getEquippedSkin(selCh.id);
    const avInfo = getProfileAvatarInfo(prof, selCh.id, selSkin ? selSkin.id : null, true);
    const bracket = getScoreRoadBracket(save.bestScore || 0);

    if (el.profPrevAvatar) {
      el.profPrevAvatar.src = avInfo.src;
      el.profPrevAvatar.style.filter = avInfo.filter;
    }
    if (el.profPrevRank) {
      el.profPrevRank.textContent = `R${bracket.rank}`;
      el.profPrevRank.className = `bs-prof-rank-badge ${bracket.tierCls}`;
    }
    if (el.profPrevNameWrap) {
      const frameToUse = prof.unlockedFrames.includes(prof.nameFrame) ? prof.nameFrame : 'none';
      const expTxt = frameToUse !== 'none' ? getFrameRemainingLabel(frameToUse) : '';
      el.profPrevNameWrap.innerHTML = `${renderNameplateHtml(nick, frameToUse, prof.nameColor, 'lg')}${expTxt ? `<span class="prof-frame-exp-mini">${expTxt}</span>` : ''}`;
    }
    if (el.profPrevStats) {
      el.profPrevStats.textContent = `최고 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · ${save.bestYear || 1}년 차 · 캐릭터 ${save.unlockedChars.length}/${DATA.CHARACTERS.length}`;
    }

    document.querySelectorAll('.prof-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.proftab === currentProfileTab);
    });

    el.profCustomGrid.innerHTML = '';
    el.profCustomGrid.className = `prof-custom-grid ${currentProfileTab === 'colors' ? 'colors-mode' : (currentProfileTab === 'frames' ? 'frames-mode' : '')}`;

    if (currentProfileTab === 'icons') {
      const makeIconCard = (label, src, filter, equipped, locked, onSelect) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `prof-item-card${equipped ? ' equipped' : ''}${locked ? ' locked' : ''}`;
        card.innerHTML = `
          ${equipped ? '<span class="prof-eq-tag">장착</span>' : (locked ? '<span class="prof-eq-tag">잠금</span>' : '')}
          <img src="${src}" alt="${escapeNickHtml(label)}" class="prof-card-avatar" style="${filter ? `filter:${filter};` : ''}" />
          <span class="prof-card-label">${escapeNickHtml(label)}</span>
        `;
        card.onclick = () => {
          if (locked) {
            SFX.error();
            showToast('캐릭터 또는 스킨을 먼저 해금해 주세요!');
            return;
          }
          SFX.click();
          onSelect();
        };
        el.profCustomGrid.appendChild(card);
      };

      makeIconCard('대표 캐릭터', getSkinAvatar(selCh, selSkin), getSkinFilter(selSkin), !prof.avatarCharId, false, () => {
        prof.avatarCharId = null;
        prof.avatarSkinId = null;
        syncProfileOnlineIfLinked();
        showToast('프로필 아이콘이 대표 캐릭터 연동으로 설정되었습니다!');
      });

      DATA.CHARACTERS.forEach((ch) => {
        const unlocked = save.unlockedChars.includes(ch.id);
        const eq = prof.avatarCharId === ch.id && !prof.avatarSkinId;
        makeIconCard(ch.name, ch.avatar, '', eq, !unlocked, () => {
          prof.avatarCharId = ch.id;
          prof.avatarSkinId = null;
          syncProfileOnlineIfLinked();
          showToast(`프로필 아이콘 [${ch.name}] 장착!`);
        });

        DATA.getSkinsForChar(ch.id).forEach((sk) => {
          if (sk.isDefault) return;
          const skUnlocked = unlocked && save.unlockedSkins.includes(sk.id);
          const skEq = prof.avatarCharId === ch.id && prof.avatarSkinId === sk.id;
          makeIconCard(sk.name, getSkinAvatar(ch, sk), getSkinFilter(sk), skEq, !skUnlocked, () => {
            prof.avatarCharId = ch.id;
            prof.avatarSkinId = sk.id;
            syncProfileOnlineIfLinked();
            showToast(`프로필 아이콘 [${sk.name}] 장착!`);
          });
        });
      });
    } else if (currentProfileTab === 'colors') {
      const hasGoldPass = ensureSeasonPass().goldUnlocked;
      (DATA.PROFILE_NAME_COLORS || []).forEach((col) => {
        const locked = Boolean(col.requiresGoldPass && !hasGoldPass);
        const eq = (prof.nameColor || '#ffffff') === col.color && !locked;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `prof-item-card${eq ? ' equipped' : ''}${locked ? ' locked' : ''}`;
        const swatchStyle = col.color === 'rainbow' ? '' : `style="background:${col.color};"`;
        const badgeHtml = eq
          ? '<span class="prof-eq-tag">장착</span>'
          : (locked ? '<span class="prof-eq-tag" style="background:#ffb830;color:#241200;">패스</span>' : '');
        card.innerHTML = `
          ${badgeHtml}
          <span class="prof-color-swatch${col.color === 'rainbow' ? ' rainbow' : ''}" ${swatchStyle}></span>
          <span class="prof-card-label">${col.name}</span>
        `;
        card.onclick = () => {
          SFX.click();
          if (locked) {
            showToast('무지개 프리즘은 골드 패스 구매자만 장착할 수 있습니다!');
            openGoldPassPurchase();
            return;
          }
          prof.nameColor = col.color;
          syncProfileOnlineIfLinked();
          showToast(`닉네임 색상 [${col.name}] 적용!`);
        };
        el.profCustomGrid.appendChild(card);
      });
    } else {
      (DATA.PROFILE_NAME_FRAMES || []).forEach((fr) => {
        const unlocked = fr.id === 'none' || prof.unlockedFrames.includes(fr.id);
        const eq = (prof.nameFrame || 'none') === fr.id && unlocked;
        const expLabel = fr.id === 'none' ? '' : (unlocked ? getFrameRemainingLabel(fr.id) : '30일');
        const expBadge = expLabel ? `<span class="prof-frame-exp${unlocked ? '' : ' locked'}">${expLabel}</span>` : '';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `prof-item-card prof-frame-card${eq ? ' equipped' : ''}${!unlocked ? ' locked' : ''}`;
        card.innerHTML = `
          <div class="prof-frame-meta">
            <span class="prof-frame-title">${fr.name} ${expBadge} ${eq ? '· 장착 중' : (!unlocked ? '· 미보유' : '')}</span>
            <span class="prof-frame-desc">${fr.desc}</span>
          </div>
          <div class="prof-frame-preview">${renderNameplateHtml(nick, fr.id, prof.nameColor, 'md')}</div>
        `;
        card.onclick = () => {
          if (!unlocked) {
            SFX.error();
            showToast(`${fr.desc}`);
            return;
          }
          SFX.click();
          prof.nameFrame = fr.id;
          syncProfileOnlineIfLinked();
          showToast(`[${fr.name}] 장착 완료!`);
        };
        el.profCustomGrid.appendChild(card);
      });
    }
  }

  function openProfileEditModal() {
    if (!el.profileEditOverlay) return;
    SFX.click();
    if (el.profNicknameInput) {
      el.profNicknameInput.value = (save.auth && save.auth.nickname) || '';
    }
    renderProfileEditModal();
    el.profileEditOverlay.classList.remove('hidden');
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

    const curDayKey = getKstDateKey();
    const cDayScore = (c.dailyWeatherRank && c.dailyWeatherRank.dateKey === curDayKey) ? (c.dailyWeatherRank.bestScore || 0) : 0;
    const lDayScore = (l.dailyWeatherRank && l.dailyWeatherRank.dateKey === curDayKey) ? (l.dailyWeatherRank.bestScore || 0) : 0;
    const bestDayObj = cDayScore >= lDayScore ? c.dailyWeatherRank : l.dailyWeatherRank;

    const todayKey = getTodayKey();
    const cAtt = (c.attendance && typeof c.attendance === 'object') ? c.attendance : { lastClaimDate: '', streak: 0 };
    const lAtt = (l.attendance && typeof l.attendance === 'object') ? l.attendance : { lastClaimDate: '', streak: 0 };
    const latestClaimDate = [cAtt.lastClaimDate || '', lAtt.lastClaimDate || ''].sort().pop() || '';
    const mergedAttendance = {
      lastClaimDate: (cAtt.lastClaimDate === todayKey || lAtt.lastClaimDate === todayKey) ? todayKey : latestClaimDate,
      streak: Math.max(Number(cAtt.streak) || 0, Number(lAtt.streak) || 0)
    };
    const mergedDailyClaimed = {
      ...((c.dailyMissions && c.dailyMissions.date === todayKey && c.dailyMissions.claimed) || {}),
      ...((l.dailyMissions && l.dailyMissions.date === todayKey && l.dailyMissions.claimed) || {})
    };
    const mergedWeeklyClaimed = {
      ...((c.weeklyMissions && c.weeklyMissions.week === curWk && c.weeklyMissions.claimed) || {}),
      ...((l.weeklyMissions && l.weeklyMissions.week === curWk && l.weeklyMissions.claimed) || {})
    };
    const cSp = (c.seasonPass && typeof c.seasonPass === 'object') ? c.seasonPass : {};
    const lSp = (l.seasonPass && typeof l.seasonPass === 'object') ? l.seasonPass : {};
    const cSpDm = (cSp.dailyMissions && cSp.dailyMissions.date === todayKey) ? cSp.dailyMissions : { date: todayKey, progress: {}, claimed: {} };
    const lSpDm = (lSp.dailyMissions && lSp.dailyMissions.date === todayKey) ? lSp.dailyMissions : { date: todayKey, progress: {}, claimed: {} };
    const mergedSpProgress = { runs: 0, dist: 0, coins: 0, jumps: 0, dodges: 0 };
    ['runs', 'dist', 'coins', 'jumps', 'dodges'].forEach((k) => {
      mergedSpProgress[k] = Math.max(Number((cSpDm.progress && cSpDm.progress[k]) || 0), Number((lSpDm.progress && lSpDm.progress[k]) || 0));
    });
    const mergedSeasonPass = {
      seasonId: 's1',
      xp: Math.max(Number(cSp.xp) || 0, Number(lSp.xp) || 0),
      goldUnlocked: Boolean(cSp.goldUnlocked || lSp.goldUnlocked),
      claimedFree: { ...(cSp.claimedFree || {}), ...(lSp.claimedFree || {}) },
      claimedGold: { ...(cSp.claimedGold || {}), ...(lSp.claimedGold || {}) },
      bonusClaimed: Math.max(Number(cSp.bonusClaimed) || 0, Number(lSp.bonusClaimed) || 0),
      dailyMissions: {
        date: todayKey,
        progress: mergedSpProgress,
        claimed: { ...(cSpDm.claimed || {}), ...(lSpDm.claimed || {}) }
      }
    };

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
      attendance: mergedAttendance,
      dailyMissions: {
        ...(primary.dailyMissions || { date: todayKey, progress: {}, claimed: {} }),
        claimed: mergedDailyClaimed
      },
      weeklyMissions: {
        ...(primary.weeklyMissions || { week: curWk, progress: {}, claimed: {} }),
        claimed: mergedWeeklyClaimed
      },
      seasonPass: mergedSeasonPass,
      achievementsClaimed: { ...(secondary.achievementsClaimed || {}), ...(primary.achievementsClaimed || {}) },
      stageMilestonesClaimed: { ...(secondary.stageMilestonesClaimed || {}), ...(primary.stageMilestonesClaimed || {}) },
      scoreRoadClaimed: { ...(secondary.scoreRoadClaimed || {}), ...(primary.scoreRoadClaimed || {}) },
      tutorialDone: Boolean(c.tutorialDone || l.tutorialDone),
      weeklyRank: {
        ...bestWkObj,
        history: { ...((secondary.weeklyRank && secondary.weeklyRank.history) || {}), ...((primary.weeklyRank && primary.weeklyRank.history) || {}) },
        claimedWeeks: Array.from(new Set([...((c.weeklyRank && c.weeklyRank.claimedWeeks) || []), ...((l.weeklyRank && l.weeklyRank.claimedWeeks) || [])]))
      },
      dailyWeatherRank: bestDayObj || { dateKey: curDayKey, bestScore: 0, bestDist: 0, bestYear: 1, cityName: '서울', weatherTag: '' }
    };
  }

  // ===================== MOBILE-FIRST LIVE PLAYABLE TUTORIAL ENGINE =====================
  const PLAYABLE_TUTORIAL_STEPS = [
    {
      id: 'jump',
      icon: '',
      title: '1. 장애물을 뛰어넘으세요!',
      sub: '왼쪽 [점프] 버튼을 터치해 장애물을 피하세요',
      actionPrompt: '지금! [점프] 버튼을 터치하세요!',
      targetBtn: 'jump',
      successMsg: '나이스 점프!'
    },
    {
      id: 'double_jump',
      icon: '',
      title: '2. 높은 장애물은 2단 점프!',
      sub: '점프 후 공중에서 [점프] 버튼을 한 번 더 터치하세요',
      actionPrompt: '지금! [점프] 1단 점프!',
      secondPrompt: '공중에서 한 번 더! [2단 점프]!',
      targetBtn: 'jump',
      successMsg: '완벽한 2단 점프!'
    },
    {
      id: 'slide',
      icon: '',
      title: '3. 날아오는 구름은 슬라이드!',
      sub: '오른쪽 [슬라이드] 버튼을 눌러 아래로 통과하세요',
      actionPrompt: '지금! [슬라이드] 버튼을 누르세요!',
      targetBtn: 'slide',
      successMsg: '멋진 슬라이드 통과!'
    },
    {
      id: 'rain_umbrella',
      icon: '',
      title: '4. 비가 오면 우산을 펴세요!',
      sub: '왼쪽 위 [우산] 버튼을 터치하세요 (10초 자동 해제)',
      actionPrompt: '지금! [우산] 버튼을 눌러 펴세요!',
      targetBtn: 'umbrella',
      successMsg: '빗물 완벽 방어!'
    },
    {
      id: 'gust_fold',
      icon: '',
      title: '5. 태풍 돌풍엔 우산을 접으세요!',
      sub: '제한 시간 안에 [우산] 버튼을 다시 눌러 접으세요!',
      actionPrompt: '지금! [우산] 버튼을 눌러 접으세요!',
      targetBtn: 'umbrella',
      successMsg: '태풍 대비! 우산 접기 성공!'
    },
    {
      id: 'dust_mask',
      icon: '',
      title: '6. 황사·미세먼지엔 마스크!',
      sub: '오른쪽 위 [마스크] 버튼을 터치해 황사를 막으세요',
      actionPrompt: '지금! [마스크] 버튼을 누르세요!',
      targetBtn: 'mask',
      successMsg: '황사 완벽 차단!'
    },
    {
      id: 'covid_parry',
      icon: '',
      title: '7. 코로나 바이러스 돌진 차단!',
      sub: '바이러스가 돌진할 때 [마스크] 버튼을 눌러 튕겨내세요!',
      actionPrompt: '지금! [마스크]로 바이러스를 튕겨내세요!',
      targetBtn: 'mask',
      successMsg: '완벽 차단! 모든 조작 마스터!'
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
        id: 'tut_rock', name: '이끼 벚꽃 바위', lane: 'low', w: 46, h: 33, tag: 'wind', sprite: 'obs_sp_rock',
        x: startX, y: Renderer.GROUND_Y - 33, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 0, isTutObs: true
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
        id: 'tut_lantern', name: '벚꽃 돌등불', lane: 'tall', w: 45, h: 47, tag: 'wind', sprite: 'obs_sp_lantern',
        x: startX, y: Renderer.GROUND_Y - 47, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 0, isTutObs: true
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
        id: 'tut_bird', name: '돌진 파랑새', lane: 'air', w: 48, h: 36, tag: 'wind', sprite: 'obs_air_bird', warn: true,
        x: startX, y: Renderer.GROUND_Y - 34 - 36, passed: false, nearMissed: false, stepSeed: 0, extraSpeed: 18, isTutObs: true
      };
      run.obstacles.push(ob);
      const cx = startX + ob.w / 2;
      run.items.push(
        { kind: 'coin', x: cx - 28, y: Renderer.GROUND_Y - 14 },
        { kind: 'coin', x: cx,      y: Renderer.GROUND_Y - 14 },
        { kind: 'coin', x: cx + 28, y: Renderer.GROUND_Y - 14 }
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
      showToast('튜토리얼을 건너뛰었습니다. 설정에서 언제든 다시 플레이할 수 있습니다!');
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
      el.tutCompleteReward.innerHTML = firstClear
        ? `${uiIcon('coin', 'sm')} 첫 튜토리얼 완료 보너스 +100G 지급!`
        : '모든 조작 연습을 완벽하게 마쳤습니다!';
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
          showWeatherCenterAlert('gust', '우산 접기!');
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
          if (cloudRes && cloudRes.error === 'no_auth_token') {
            showToast('로그인 세션이 만료되었습니다. 다시 연동해 주세요.');
          } else {
            showToast('현재 기기에 안전하게 저장되어 있습니다. 잠시 후 다시 시도해 주세요.');
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
          showToast('클라우드 최신 데이터 동기화 완료!');
        } else if (localChanged && !opts.silent) {
          showToast('다른 기기의 최신 골드 · 스킨 · 기록을 불러왔습니다!');
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
            ? '클라우드 동기화 완료!'
            : '기기에 데이터가 안전하게 저장되었습니다.');
        }
        return { ok: Boolean(pushRes && pushRes.ok), uploaded: true };
      }
    } finally {
      cloudSyncInFlight = false;
      if (el.btnLoginSync) {
        el.btnLoginSync.disabled = false;
        el.btnLoginSync.textContent = '동기화';
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

    if (isLinked) {
      const restored = Boolean(cloudSlot);
      showToast(restored
        ? `[${save.auth.nickname}] 데이터를 불러왔습니다!`
        : `[${save.auth.nickname}] 계정 연동 완료!`);
    } else {
      showToast('게스트 모드로 시작합니다.');
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
        showToast(`${res.message || '네트워크 연결을 확인해 주세요.'}`);
      } else if (res && res.redirecting) {
        showToast('로그인 페이지로 이동 중입니다...');
      } else if (res && !res.cancelled && res.message) {
        showToast(`${res.message}`);
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
    showToast('로그아웃되었습니다. 로고 아래에서 계정을 선택해 주세요.');
  }

  async function saveNicknameValue(rawVal) {
    const raw = String(rawVal || '').trim();
    if (!raw) {
      showToast('닉네임을 입력해 주세요.');
      return false;
    }
    SFX.click();
    const clean = ONLINE ? ONLINE.sanitizeNickname(raw, '날씨러너') : raw.slice(0, 12);
    save.auth = { ...(save.auth || activeAuth), nickname: clean };
    if (el.loginNicknameInput) el.loginNicknameInput.value = clean;
    if (el.profNicknameInput) el.profNicknameInput.value = clean;
    await syncProfileOnlineIfLinked();
    showToast(`닉네임이 [${clean}](으)로 저장되었습니다!`);
    return true;
  }

  async function saveEditedNickname() {
    if (!el.loginNicknameInput) return;
    await saveNicknameValue(el.loginNicknameInput.value);
  }

  // ===================== IN-APP PURCHASE (REAL-MONEY GEM STORE: 100보석 = ₩1,000) =====================
  let pendingGemPack = null;

  function openIapModal(pack) {
    if (!pack || !el.iapOverlay) return;
    SFX.click();
    pendingGemPack = pack;
    if (el.iapPackName) el.iapPackName.textContent = pack.name;
    if (el.iapPackGems) {
      el.iapPackGems.innerHTML = pack.isGoldPass
        ? `${uiIcon('crown', 'sm')} 골드 패스 활성화 + 즉시 3티어(300 XP) · 무지개 프리즘 닉네임 · 최종 신화 스킨 [얼음황제]`
        : `+${pack.gems.toLocaleString('ko-KR')} ${uiIcon('gem', 'sm')} 즉시 지급`;
    }
    if (el.iapPackPrice) el.iapPackPrice.textContent = `₩${pack.krwPrice.toLocaleString('ko-KR')}`;
    const isNativeApp = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (el.iapPayNote) {
      el.iapPayNote.innerHTML = isNativeApp
        ? `Google Play / App Store 공식 인앱 결제 · 상품ID: ${pack.productId}`
        : (
          pack.isGoldPass
            ? '스토어 결제 연동 규격 (₩9,900) · 웹 미리보기에서는 테스트 결제로 골드 패스가 활성화됩니다.'
            : `스토어 결제 연동 규격 (100${uiIcon('gem', 'xs')} = ₩1,000) · 웹 미리보기에서는 테스트 결제로 보석이 지급됩니다.`
        );
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
    if (pack.isGoldPass) {
      const sp = ensureSeasonPass();
      sp.goldUnlocked = true;
      addSeasonPassXp(300);
    } else {
      save.gems = (save.gems || 0) + pack.gems;
    }
    persistSave();
    pendingGemPack = null;
    if (el.iapOverlay) el.iapOverlay.classList.add('hidden');
    refreshAllMenus();
    if (pack.isGoldPass) {
      showToast('시즌 1 골드 패스 활성화 완료 (+300 XP · 무지개 프리즘 닉네임 해금)');
    } else {
      showToast(`${pack.name} (₩${pack.krwPrice.toLocaleString('ko-KR')}) 결제 완료 (+${pack.gems.toLocaleString('ko-KR')} 보석 지급)`);
    }
  }

  // ===================== WEEKLY TOP 1/2/3 CHAMPION AUTOMATIC PAYOUT =====================
  let pendingChampionReward = null;

  async function checkAndAwardWeeklyChampion() {
    if (!ONLINE || !save.auth || !save.auth.loggedIn) return;
    const reward = await ONLINE.checkWeeklyChampionPayout(save);
    if (!reward || !reward.won) return;
    pendingChampionReward = reward;
    const rankNum = reward.rank || 1;
    const nick = (save.auth && save.auth.nickname) || '날씨러너';
    const prof = ensureSaveProfile();
    if (el.weeklyChampTitle) el.weeklyChampTitle.textContent = `주간 랭킹 ${rankNum}위 달성!`;
    if (el.weeklyChampWeek) el.weeklyChampWeek.textContent = `${reward.weekLabel} 주간 최종 ${rankNum}위!`;
    if (el.weeklyChampScore) el.weeklyChampScore.textContent = `달성 점수 ${reward.score.toLocaleString('ko-KR')}점`;
    if (el.weeklyChampGems) el.weeklyChampGems.innerHTML = `+${reward.gems.toLocaleString('ko-KR')} ${uiIcon('gem', 'sm')} 보석 지급!`;
    if (el.weeklyChampFramePreview) {
      if (reward.frameId) {
        el.weeklyChampFramePreview.innerHTML = `${renderNameplateHtml(nick, reward.frameId, prof.nameColor, 'md')}<span class="champ-frame-note">${reward.frameName} 해금! (30일)</span>`;
        el.weeklyChampFramePreview.classList.remove('hidden');
      } else {
        el.weeklyChampFramePreview.classList.add('hidden');
      }
    }
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
    const prof = ensureSaveProfile();
    if (rw.frameId) {
      if (!prof.unlockedFrames.includes(rw.frameId)) {
        prof.unlockedFrames.push(rw.frameId);
      }
      prof.frameExpires[rw.frameId] = Date.now() + RANK_FRAME_DURATION_MS;
      if (!prof.nameFrame || prof.nameFrame === 'none') {
        prof.nameFrame = rw.frameId;
      }
    }
    save.weeklyRank = save.weeklyRank || { weekKey: getWeekKey(), bestScore: 0, bestDist: 0, bestYear: 1, history: {}, claimedWeeks: [] };
    if (!Array.isArray(save.weeklyRank.claimedWeeks)) save.weeklyRank.claimedWeeks = [];
    if (!save.weeklyRank.claimedWeeks.includes(rw.weekKey)) {
      save.weeklyRank.claimedWeeks.push(rw.weekKey);
    }
    syncProfileOnlineIfLinked();
    if (el.weeklyChampOverlay) el.weeklyChampOverlay.classList.add('hidden');
    SFX.chestJackpot();
    refreshAllMenus();
    const frameMsg = rw.frameName ? ` + ${rw.frameName}` : '';
    showToast(`${rw.weekLabel} 주간 ${rw.rank || 1}위 보상 보석 ${rw.gems.toLocaleString('ko-KR')}${frameMsg} 수령 완료!`);
  }

  function buildMyBoardProfileMeta(myChar, mySkin) {
    const prof = ensureSaveProfile();
    const validFrame = (prof.nameFrame && prof.unlockedFrames.includes(prof.nameFrame)) ? prof.nameFrame : 'none';
    return {
      profileCharId: prof.avatarCharId || myChar.id,
      profileSkinId: prof.avatarCharId ? (prof.avatarSkinId || null) : (mySkin ? mySkin.id : null),
      nameColor: prof.nameColor || '#ffffff',
      nameFrame: validFrame
    };
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
      ...buildMyBoardProfileMeta(myChar, mySkin),
      score: weeklyBest,
      dist: save.weeklyRank.bestDist || save.bestDistanceM || 0,
      year: save.weeklyRank.bestYear || save.bestYear || 1
    });
  }

  async function syncMyDailyWeatherScore() {
    if (!ONLINE || !ONLINE.submitDailyWeatherScore || !save.auth || !save.auth.uid) return;
    const dayInfo = ensureDailyWeatherRankToday();
    const myChar = getCharDef(save.selectedChar);
    const mySkin = getEquippedSkin(myChar.id);
    const dr = save.dailyWeatherRank || {};
    const dailyBest = Math.max(dr.bestScore || 0, 0);
    if (dailyBest <= 0) return;
    await ONLINE.submitDailyWeatherScore({
      dateKey: dayInfo.dateKey,
      uid: save.auth.uid,
      nickname: save.auth.nickname || '날씨러너',
      provider: save.auth.provider || 'guest',
      charId: myChar.id,
      skinId: mySkin ? mySkin.id : null,
      ...buildMyBoardProfileMeta(myChar, mySkin),
      cityName: dr.cityName || (liveWeatherSnapshot && liveWeatherSnapshot.cityName) || '서울',
      weatherTag: dr.weatherTag || '',
      score: dailyBest,
      dist: dr.bestDist || 0,
      year: dr.bestYear || 1
    });
  }

  // ===================== LIVE KMA WEATHER STATE, MODE SELECT MODAL & WEATHER MODAL =====================
  let selectedGameMode = 'normal'; // 'normal' | 'today_weather'
  let rankModeTab = 'normal'; // 'normal' | 'today_weather'
  let liveWeatherSnapshot = LIVE_WEATHER ? (LIVE_WEATHER.getCachedWeather() || LIVE_WEATHER.buildFallbackSnapshot(LIVE_WEATHER.getSelectedCityId())) : null;
  let liveWeatherMods = LIVE_WEATHER ? LIVE_WEATHER.computeWeatherModifiers(liveWeatherSnapshot) : null;
  let liveWeatherLoading = false;

  function getActiveLiveWeatherMods() {
    if (!LIVE_WEATHER) return null;
    if (!liveWeatherMods) {
      liveWeatherSnapshot = LIVE_WEATHER.getCachedWeather() || LIVE_WEATHER.buildFallbackSnapshot(LIVE_WEATHER.getSelectedCityId());
      liveWeatherMods = LIVE_WEATHER.computeWeatherModifiers(liveWeatherSnapshot);
    }
    return liveWeatherMods;
  }

  function updateHomeWeatherMiniSummary() {
    const mods = getActiveLiveWeatherMods();
    if (!mods) return;
    const snap = mods.snapshot;
    if (el.homeWeatherBtnIco) el.homeWeatherBtnIco.innerHTML = getWeatherHeroSvg(mods);
    if (el.homeWeatherBtnTemp) el.homeWeatherBtnTemp.textContent = `${Math.round(snap.tempC)}°C`;
    if (el.modeSelectOverlay && !el.modeSelectOverlay.classList.contains('hidden')) {
      renderModeSelectModal();
    }
  }

  function renderModeSelectModal() {
    ensureWeeklyRankCurrentWeek();
    ensureDailyWeatherRankToday();

    const wkBest = (save.weeklyRank && save.weeklyRank.bestScore) || 0;
    const dayBest = (save.dailyWeatherRank && save.dailyWeatherRank.bestScore) || 0;
    if (el.modeNormalBestRow) {
      el.modeNormalBestRow.textContent = `주간 최고 ${wkBest.toLocaleString('ko-KR')}점`;
    }
    if (el.modeTodayBestRow) {
      el.modeTodayBestRow.textContent = `오늘 최고 ${dayBest.toLocaleString('ko-KR')}점`;
    }

    const mods = getActiveLiveWeatherMods();
    if (!mods) return;
    const snap = mods.snapshot;
    if (el.modeCardWeatherLine) {
      el.modeCardWeatherLine.textContent = `${snap.cityName} ${Math.round(snap.tempC)}°C · ${mods.desc.label}`;
    }
  }

  function openModeSelectModal() {
    SFX.click();
    renderModeSelectModal();
    if (el.modeSelectOverlay) el.modeSelectOverlay.classList.remove('hidden');
    refreshLiveWeatherUI(false);
  }

  function closeModeSelectModal() {
    if (el.modeSelectOverlay) el.modeSelectOverlay.classList.add('hidden');
  }

  function openWeatherModal() {
    SFX.click();
    renderHomeWeatherTab();
    if (el.weatherOverlay) el.weatherOverlay.classList.remove('hidden');
    refreshLiveWeatherUI(false);
  }

  function closeWeatherModal() {
    if (el.weatherOverlay) el.weatherOverlay.classList.add('hidden');
  }

  function getWeatherHeroSvg(mods) {
    const lbl = (mods && mods.desc && mods.desc.label) || '';
    const pw = (mods && mods.primaryWeather) || '';
    if (lbl.includes('눈') || lbl.includes('폭설') || pw === 'snow' || pw === 'ice_road') {
      return '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" fill="none" stroke="#9ee8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (lbl.includes('비') || lbl.includes('폭우') || lbl.includes('뇌우') || pw === 'rain') {
      return '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M6.5 14.5h10.2a3.3 3.3 0 0 0 .4-6.56A4.8 4.8 0 0 0 7.7 6.6 3.9 3.9 0 0 0 6.5 14.5z" fill="#d8eeff" stroke="#071022" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3" stroke="#62d2ff" stroke-width="2.1" stroke-linecap="round"/></svg>';
    }
    if (lbl.includes('안개') || pw === 'dust') {
      return '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M4 8.5h14a2.5 2.5 0 1 0-2.2-3.7M3 13h17a2.5 2.5 0 1 1-2.2 3.7M5 17.5h10" fill="none" stroke="#c8e2ff" stroke-width="2.2" stroke-linecap="round"/></svg>';
    }
    if (lbl.includes('흐림') || lbl.includes('구름')) {
      return '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><circle cx="15.5" cy="8.5" r="3.6" fill="#ffe14a" stroke="#071022" stroke-width="1.5"/><path d="M6.2 17.8h10.6a3.4 3.4 0 0 0 .4-6.76A4.8 4.8 0 0 0 7.5 9.8a3.9 3.9 0 0 0-1.3 8z" fill="#ffffff" stroke="#071022" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#ffe14a" stroke="#071022" stroke-width="1.6"/><path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" stroke="#ffe14a" stroke-width="2.1" stroke-linecap="round"/></svg>';
  }

  function renderHomeWeatherTab() {
    if (!LIVE_WEATHER) return;
    const mods = getActiveLiveWeatherMods();
    if (!mods) return;
    const snap = mods.snapshot;

    updateHomeWeatherMiniSummary();

    if (el.weatherHeroIcon) el.weatherHeroIcon.innerHTML = getWeatherHeroSvg(mods);
    if (el.weatherHeroCity) el.weatherHeroCity.textContent = snap.cityName;
    if (el.weatherHeroSeason) el.weatherHeroSeason.textContent = mods.season.name;
    if (el.weatherHeroLiveTag) {
      el.weatherHeroLiveTag.textContent = liveWeatherLoading
        ? '동기화 중'
        : (snap.source === 'kma_live' ? 'LIVE' : '추정');
      el.weatherHeroLiveTag.classList.toggle('offline', snap.source !== 'kma_live');
    }
    if (el.weatherHeroTemp) el.weatherHeroTemp.textContent = `${snap.tempC.toFixed(1)}°C`;
    if (el.weatherHeroDesc) el.weatherHeroDesc.textContent = `${mods.desc.label} · 대기 ${mods.airGrade.grade}`;
    if (el.weatherHeroMeta) {
      el.weatherHeroMeta.textContent = `습도 ${snap.humidity}% · 바람 ${snap.windMs.toFixed(1)}m/s`;
    }

    if (el.weatherBuffGrid) {
      el.weatherBuffGrid.innerHTML = '';
      mods.factors.slice(0, 4).forEach((f) => {
        const card = document.createElement('div');
        card.className = `weather-factor-card is-${f.kind}`;
        card.innerHTML = `
          <div class="wfc-top">
            <strong class="wfc-lbl">${f.label}</strong>
            <span class="wfc-badge ${f.kind}">${f.badge}</span>
          </div>
          <div class="wfc-eff">${f.effectText}</div>
        `;
        el.weatherBuffGrid.appendChild(card);
      });
    }

    if (el.weatherModSummary) {
      const pills = [
        `<span class="wmod-pill score">점수 ×${mods.scoreMult.toFixed(2)}</span>`,
        `<span class="wmod-pill gold">골드 ×${mods.goldMult.toFixed(2)}</span>`
      ];
      if (mods.extraHp > 0) pills.push(`<span class="wmod-pill bonus">체력 +${mods.extraHp}</span>`);
      if (mods.feverGainMult > 1.01) pills.push(`<span class="wmod-pill bonus">피버 ×${mods.feverGainMult.toFixed(2)}</span>`);
      if (mods.magnetBonus > 0) pills.push(`<span class="wmod-pill bonus">자석 +${mods.magnetBonus}</span>`);
      el.weatherModSummary.innerHTML = pills.join('');
    }

    if (el.btnWeatherPlayToday) {
      el.btnWeatherPlayToday.textContent = '오늘의 날씨 플레이';
    }
  }

  async function refreshLiveWeatherUI(forceRefresh = false) {
    if (!LIVE_WEATHER) return null;
    const cityId = LIVE_WEATHER.getSelectedCityId();
    liveWeatherLoading = true;
    if (el.weatherOverlay && !el.weatherOverlay.classList.contains('hidden')) renderHomeWeatherTab();
    try {
      const snap = await LIVE_WEATHER.fetchLiveWeather(cityId, forceRefresh);
      if (snap && LIVE_WEATHER.getSelectedCityId() === cityId) {
        liveWeatherSnapshot = snap;
        liveWeatherMods = LIVE_WEATHER.computeWeatherModifiers(snap);
      }
    } catch {}
    liveWeatherLoading = false;
    updateHomeWeatherMiniSummary();
    if (el.weatherOverlay && !el.weatherOverlay.classList.contains('hidden')) renderHomeWeatherTab();
    if (el.modeSelectOverlay && !el.modeSelectOverlay.classList.contains('hidden')) renderModeSelectModal();
    return liveWeatherMods;
  }

  function applyControlLayout() {
    if (!el.mobileControls) return;
    const lay = normalizeControlLayout(save && save.controlLayout);
    const btnMap = {
      jump: el.btnJump,
      slide: el.btnSlide,
      umbrella: el.btnToggleUmbrella,
      mask: el.btnToggleMask
    };
    el.mobileControls.classList.toggle('custom-layout', lay.customized);
    CTRL_LAYOUT_KEYS.forEach((k) => {
      const btn = btnMap[k];
      if (!btn) return;
      if (!lay.customized) {
        btn.style.left = '';
        btn.style.top = '';
        btn.style.removeProperty('--btn-scale');
      } else {
        const cfg = lay[k];
        btn.style.left = cfg.x + '%';
        btn.style.top = cfg.y + '%';
        btn.style.setProperty('--btn-scale', String(cfg.scale));
      }
    });
  }

  // ===================== HOME / MISSIONS / ATTENDANCE / CHARS / SHOP UI RENDER =====================
  function refreshAllMenus() {
    applyControlLayout();
    ensureTodayMissions();
    ensureWeeklyRankCurrentWeek();
    el.uiGold.textContent = save.gold.toLocaleString('ko-KR');
    el.uiGems.textContent = (save.gems || 0).toLocaleString('ko-KR');
    el.headerBestScore.textContent = save.bestScore.toLocaleString('ko-KR');

    renderProfileUI();
    updateNavMissionDot();
    updateHomeSeasonPassUI();

    // Render ONLY the currently visible tab (eliminates hidden-tab DOM churn, image downloads & extra Firebase fetches!)
    if (currentTab === 'home') {
      updateHomeWeatherMiniSummary();
      renderHomeCharStage();
    }
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
    if (el.seasonPassOverlay && !el.seasonPassOverlay.classList.contains('hidden')) renderSeasonPassModal();
    if (el.vaultOverlay && !el.vaultOverlay.classList.contains('hidden')) renderVaultModal();
    if (el.weatherOverlay && !el.weatherOverlay.classList.contains('hidden')) renderHomeWeatherTab();
    if (el.modeSelectOverlay && !el.modeSelectOverlay.classList.contains('hidden')) renderModeSelectModal();
    if (el.skinExchangeOverlay && !el.skinExchangeOverlay.classList.contains('hidden')) renderSkinExchangeModal();
    if (el.charSkinsOverlay && !el.charSkinsOverlay.classList.contains('hidden')) renderCharSkinsModal();
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
    if (el.qdotDaily) el.qdotDaily.classList.toggle('hidden', !hasDaily);
    if (el.qdotWeekly) el.qdotWeekly.classList.toggle('hidden', !hasWeekly);
    if (el.qdotAch) el.qdotAch.classList.toggle('hidden', !hasAch);
    if (el.qdotAtt) el.qdotAtt.classList.toggle('hidden', !hasAtt);
    if (el.navMissionDot) {
      el.navMissionDot.classList.toggle('hidden', !(hasDaily || hasWeekly || hasAch || hasAtt));
    }
  }

  let rankRenderSeq = 0;

  function setRankModeTab(mode) {
    rankModeTab = mode === 'today_weather' ? 'today_weather' : 'normal';
    const isToday = rankModeTab === 'today_weather';
    if (el.btnRankModeNormal) {
      el.btnRankModeNormal.classList.toggle('active', !isToday);
      el.btnRankModeNormal.setAttribute('aria-selected', String(!isToday));
    }
    if (el.btnRankModeToday) {
      el.btnRankModeToday.classList.toggle('active', isToday);
      el.btnRankModeToday.setAttribute('aria-selected', String(isToday));
    }
    renderRankingTab();
  }

  function updateWeeklyRankCountdownUI() {
    if (!ONLINE) return;
    if (rankModeTab === 'today_weather' && ONLINE.getKstDayInfo) {
      const dayInfo = ONLINE.getKstDayInfo();
      if (el.rankWeekCountdown) el.rankWeekCountdown.textContent = dayInfo.countdownText;
    } else {
      const info = ONLINE.getWeekInfo();
      if (el.rankWeekCountdown) el.rankWeekCountdown.textContent = info.countdownText;
    }
  }

  function renderRankPodium(board) {
    if (!el.rankPodiumStage) return;
    el.rankPodiumStage.classList.remove('hidden');
    const slotsHtml = [2, 1, 3].map((posRank) => {
      const entry = board[posRank - 1];
      if (!entry) {
        return `
          <div class="podium-slot pos-${posRank} empty">
            <div class="podium-empty-hint">${posRank}위 도전!</div>
          </div>
        `;
      }
      const avInfo = getProfileAvatarInfo(
        {
          avatarCharId: entry.profileCharId || entry.charId,
          avatarSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : entry.skinId
        },
        entry.charId,
        entry.skinId,
        false
      );
      const nameHtml = renderNameplateHtml(entry.nickname, entry.nameFrame, entry.nameColor, 'md', 'podium-plain-name');
      return `
        <div class="podium-slot pos-${posRank}">
          <div class="podium-badge-plate">
            ${nameHtml}
            <span class="podium-score-chip">${(entry.score || 0).toLocaleString('ko-KR')}점</span>
          </div>
          <div class="podium-char-wrap">
            <span class="podium-char-aura" aria-hidden="true"></span>
            <span class="podium-sparkle sp1" aria-hidden="true"></span>
            <span class="podium-sparkle sp2" aria-hidden="true"></span>
            <span class="podium-sparkle sp3" aria-hidden="true"></span>
            <span class="podium-sparkle sp4" aria-hidden="true"></span>
            <img src="${avInfo.src}" alt="${escapeNickHtml(entry.nickname)}" class="podium-char-img" style="${avInfo.filter ? `filter:${avInfo.filter};` : ''}" />
          </div>
        </div>
      `;
    }).join('');

    el.rankPodiumStage.innerHTML = `
      <div class="rank-podium-inner">
        <img src="assets/ui/rank_podium.png?v=${RANK_ART_VER}" alt="명예의 시상대" class="rank-podium-img" />
        ${slotsHtml}
      </div>
    `;
  }

  async function renderRankingTab() {
    const seq = ++rankRenderSeq;
    const isTodayMode = rankModeTab === 'today_weather';
    const weekInfo = ensureWeeklyRankCurrentWeek();
    const dayInfo = ensureDailyWeatherRankToday();
    updateWeeklyRankCountdownUI();

    if (el.btnRankModeNormal) {
      el.btnRankModeNormal.classList.toggle('active', !isTodayMode);
      el.btnRankModeNormal.setAttribute('aria-selected', String(!isTodayMode));
    }
    if (el.btnRankModeToday) {
      el.btnRankModeToday.classList.toggle('active', isTodayMode);
      el.btnRankModeToday.setAttribute('aria-selected', String(isTodayMode));
    }
    if (el.rankScreenTitle) {
      el.rankScreenTitle.textContent = isTodayMode ? '오늘의 날씨 랭킹' : '일반모드 주간 랭킹';
    }
    if (el.rankPrizeCrown) {
      el.rankPrizeCrown.classList.toggle('hidden', isTodayMode);
    }
    if (el.rankPrizeInlineText) {
      if (isTodayMode) {
        const mods = getActiveLiveWeatherMods();
        const wTag = mods ? `${mods.snapshot.cityName} ${mods.desc.icon}${Math.round(mods.snapshot.tempC)}°C` : '기상청 실시간';
        el.rankPrizeInlineText.innerHTML = `<strong>${dayInfo.dateLabel}</strong> (${wTag}) · 매일 00:00 초기화`;
      } else {
        el.rankPrizeInlineText.innerHTML = `${weekInfo.weekLabel} 1위 <strong>5,000${uiIcon('gem', 'xs')}</strong> · 2위 <strong>3,000</strong> · 3위 <strong>1,000</strong>`;
      }
    }
    if (el.rankMyTitleLabel) {
      el.rankMyTitleLabel.textContent = isTodayMode ? '오늘 내 순위' : '이번 주 내 순위';
    }

    const myChar = getCharDef(save.selectedChar);
    const mySkin = getEquippedSkin(myChar.id);
    const myAuth = save.auth || { provider: 'guest', uid: '', nickname: '게스트' };
    const isLinkedUser = Boolean(ONLINE && ONLINE.isRankedProvider(myAuth.provider));
    const myUid = myAuth.uid || '';
    const myNick = myAuth.nickname || `나 (${myChar.name})`;
    const weeklyBest = save.weeklyRank ? (save.weeklyRank.bestScore || 0) : 0;
    const dailyBest = save.dailyWeatherRank ? (save.dailyWeatherRank.bestScore || 0) : 0;
    const myModeBest = isTodayMode ? dailyBest : weeklyBest;

    if (el.rankGuestBanner) {
      el.rankGuestBanner.classList.toggle('hidden', isLinkedUser);
    }

    const myAvInfo = getProfileAvatarInfo(ensureSaveProfile(), myChar.id, mySkin ? mySkin.id : null, true);
    el.rankMyAvatar.src = myAvInfo.src;
    el.rankMyAvatar.style.filter = myAvInfo.filter;
    if (isTodayMode) {
      const dr = save.dailyWeatherRank || {};
      el.rankMyScoreLine.textContent = isLinkedUser
        ? `오늘 최고 ${dailyBest.toLocaleString('ko-KR')}점 · 오늘 최장 ${(dr.bestDist || 0).toLocaleString('ko-KR')}m`
        : `오늘 최고 ${dailyBest.toLocaleString('ko-KR')}점 (Google 연동 시 랭킹 등록)`;
    } else {
      el.rankMyScoreLine.textContent = isLinkedUser
        ? `주간 ${weeklyBest.toLocaleString('ko-KR')}점 · 최고 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · 최장 ${(save.bestDistanceM || 0).toLocaleString('ko-KR')}m`
        : `최고 ${(save.bestScore || 0).toLocaleString('ko-KR')}점 · 최장 ${(save.bestDistanceM || 0).toLocaleString('ko-KR')}m`;
    }
    el.rankStatYear.textContent = `${save.bestYear || 1}년 차`;
    el.rankStatCoins.textContent = `${(save.totalCoinsEver || 0).toLocaleString('ko-KR')}개`;
    el.rankStatCombo.textContent = `${save.maxDodgeComboEver || 0}연속`;
    el.rankStatDex.textContent = `${save.unlockedChars.length}/${DATA.CHARACTERS.length}`;

    if (!ONLINE) {
      renderRankPodium([]);
      return;
    }
    let curRes = null;
    let prevRes = null;
    try {
      if (isTodayMode && ONLINE.fetchDailyWeatherBoard) {
        curRes = await ONLINE.fetchDailyWeatherBoard(dayInfo.dateKey, isLinkedUser ? myUid : null);
      } else {
        [curRes, prevRes] = await Promise.all([
          ONLINE.fetchWeeklyBoard(weekInfo.weekKey, isLinkedUser ? myUid : null),
          ONLINE.fetchWeeklyBoard(weekInfo.prevWeekKey, isLinkedUser ? myUid : null)
        ]);
      }
    } catch {
      return;
    }
    if (seq !== rankRenderSeq || !curRes) return;

    // STRICT: Only linked Google/Apple real users appear on the leaderboard (NEVER guests!)
    let board = curRes.board.slice();
    if (isLinkedUser && myModeBest > 0 && myUid && !board.some((r) => r.isMe)) {
      const dr = save.dailyWeatherRank || {};
      board.push({
        uid: myUid,
        nickname: myNick,
        provider: myAuth.provider,
        charId: myChar.id,
        skinId: mySkin ? mySkin.id : null,
        ...buildMyBoardProfileMeta(myChar, mySkin),
        cityName: isTodayMode ? (dr.cityName || '서울') : '',
        weatherTag: isTodayMode ? (dr.weatherTag || '') : '',
        score: myModeBest,
        dist: isTodayMode ? (dr.bestDist || 0) : (save.weeklyRank.bestDist || 0),
        year: isTodayMode ? (dr.bestYear || 1) : (save.weeklyRank.bestYear || 1),
        isMe: true
      });
      board.sort((a, b) => b.score - a.score);
      board = board.map((e, i) => ({ ...e, rank: i + 1 }));
    }

    const myEntry = isLinkedUser ? board.find((r) => r.isMe) : null;
    el.rankMyPos.textContent = !isLinkedUser ? '미등록' : (myEntry ? `${myEntry.rank}위` : '미참여');

    if (el.rankLivePill) {
      if (curRes.syncedOnline) {
        el.rankLivePill.className = 'rank-live-pill';
        el.rankLivePill.innerHTML = '<span class="live-dot"></span>LIVE';
      } else {
        el.rankLivePill.className = 'rank-live-pill local';
        el.rankLivePill.innerHTML = '오프라인';
      }
    }
    if (el.rankOnlineCount) {
      const showOnlineCnt = board.length >= 10;
      el.rankOnlineCount.classList.toggle('hidden', !showOnlineCnt);
      if (showOnlineCnt) {
        el.rankOnlineCount.textContent = `참여 ${board.length.toLocaleString('ko-KR')}명`;
      }
    }
    if (el.rankLastWinner) {
      const lastChamp = !isTodayMode && (weekInfo.prevSeasonWeekNo || 0) >= 1 && prevRes && prevRes.board && prevRes.board[0];
      el.rankLastWinner.classList.toggle('hidden', !lastChamp);
      if (lastChamp) {
        el.rankLastWinner.innerHTML = uiText(`${weekInfo.prevWeekLabel || '지난주'} 1위 ${lastChamp.nickname}`, 'xs');
      }
    }

    renderRankPodium(board);

    el.rankBoardList.innerHTML = '';
    if (board.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rank-empty-card';
      empty.innerHTML = isTodayMode
        ? `
          <div class="rank-empty-ico" aria-hidden="true">${getWeatherHeroSvg(getActiveLiveWeatherMods())}</div>
          <div class="rank-empty-title">오늘의 날씨 첫 1위에 도전해 보세요!</div>
          <div class="rank-empty-sub">실시간 기상청 날씨로 진행되며 매일 자정(00:00)에 랭킹이 초기화됩니다.</div>
        `
        : `
          <div class="rank-empty-ico" aria-hidden="true">${uiIcon('crown', 'xl')}</div>
          <div class="rank-empty-title">이번 주 첫 1위에 도전해 보세요!</div>
          <div class="rank-empty-sub">주간 1위 5,000${uiIcon('gem', 'xs')} · 2위 3,000${uiIcon('gem', 'xs')} · 3위 1,000${uiIcon('gem', 'xs')} + 닉네임 장식 지급!</div>
        `;
      el.rankBoardList.appendChild(empty);
      return;
    }

    const rewardTable = DATA.WEEKLY_TOP_REWARDS || {
      1: { gems: 5000 },
      2: { gems: 3000 },
      3: { gems: 1000 }
    };

    board.forEach((entry) => {
      const rank = entry.rank;
      const avInfo = getProfileAvatarInfo(
        {
          avatarCharId: entry.profileCharId || entry.charId,
          avatarSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : entry.skinId
        },
        entry.charId,
        entry.skinId,
        false
      );
      const prov = ONLINE.getProviderMeta(entry.provider);
      const provHtml = entry.provider === 'google'
        ? `<img src="assets/ui/google_logo.png?v=${ASSET_VER}" alt="Google" class="prov-google-img" />`
        : prov.badge;

      const row = document.createElement('div');
      const topClass = rank === 1 ? ' top1' : (rank === 2 ? ' top2' : (rank === 3 ? ' top3' : ''));
      const medal = String(rank);
      const subMeta = isTodayMode && entry.weatherTag
        ? `${entry.weatherTag} · ${(entry.dist || 0).toLocaleString('ko-KR')}m`
        : `${entry.year || 1}년 차 · ${(entry.dist || 0).toLocaleString('ko-KR')}m`;
      const topRw = rewardTable[rank];
      const topPrizeTag = (!isTodayMode && topRw)
        ? `<span class="rank-top1-prize">${rank === 1 ? uiIcon('crown', 'xs') : ''} ${topRw.gems.toLocaleString('ko-KR')}${uiIcon('gem', 'xs')}</span>`
        : (isTodayMode && rank <= 3 ? `<span class="rank-top1-prize today">오늘 ${rank}위</span>` : '');
      const rowNameHtml = renderNameplateHtml(entry.nickname, entry.nameFrame, entry.nameColor, 'sm');

      row.className = `rank-row${topClass}${entry.isMe ? ' me' : ''}`;
      row.innerHTML = `
        <div class="rank-medal">${medal}</div>
        <img src="${avInfo.src}" alt="" class="rank-row-avatar" style="${avInfo.filter ? `filter:${avInfo.filter};` : ''}" />
        <div class="rank-row-info">
          <div class="rank-row-name">
            <span class="prov-chip mini ${entry.provider || 'guest'}">${provHtml}</span>
            ${rowNameHtml}
            ${entry.isMe ? '<span class="item-badge equipped">ME</span>' : ''}
            ${topPrizeTag}
          </div>
          <div class="rank-row-sub">${subMeta}</div>
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
        <div class="ach-ico">${uiText(ach.icon, 'lg')}</div>
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
        btn.textContent = '수령';
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
        showToast('가로 전체화면 모드! 폰을 가로로 돌려 쾌적하게 즐기세요!');
      }
    } catch {
      showToast('스마트폰을 가로로 돌리면 자동으로 가로 플레이 모드로 전환됩니다!');
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
        ? uiIcon('check', 'md', 'att-day-ico')
        : (chest
          ? `<img src="${chest.icon}?v=${ASSET_VER}" alt="${chest.name}" class="att-chest-thumb" />`
          : uiIcon('coin', 'md', 'att-day-ico'));
      cell.innerHTML = `
        <span class="att-day-num">${rw.day}일차</span>
        ${icoHtml}
        <span class="att-day-val">${uiText(rw.label, 'xs')}</span>
      `;
      el.attDaysGrid.appendChild(cell);
    });

    if (claimable) {
      const rw = DATA.ATTENDANCE_REWARDS[dayIdx];
      el.attModalDesc.innerHTML = uiText(`오늘(${rw.day}일차) 출석 보상: ${rw.label}`, 'sm');
      el.btnClaimAttendance.disabled = false;
      el.btnClaimAttendance.textContent = `${rw.day}일차 출석 상자 열기!`;
    } else {
      el.attModalDesc.textContent = '오늘 출석 보상을 이미 받았습니다! 내일 또 방문해 주세요.';
      el.btnClaimAttendance.disabled = true;
      el.btnClaimAttendance.textContent = '오늘 출석 완료';
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
      showToast(`${rw.day}일차 출석 보상 수령! (${rw.label})`);
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
    if (el.pityGoldChip) el.pityGoldChip.innerHTML = `${uiIcon('crown', 'xs')} 황금 천장 ${gPity}/10`;
    if (el.pityDiamondChip) el.pityDiamondChip.innerHTML = `${uiIcon('gem', 'xs')} 다이아 천장 ${dPity}/15`;

    const grid = el.bsQuestGrid;
    if (!grid) return;
    grid.innerHTML = '';

    if (currentQuestSubtab === 'daily') {
      if (el.questResetLabel) el.questResetLabel.textContent = '일일 퀘스트 · 매일 초기화 · 완료 시 황금 상자';
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
          iconKey: m.iconKey || 'm_play',
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
            showToast(`${chest.name}가 상자 보관함에 저장되었습니다.`);
          }
        }));
      });
    } else if (currentQuestSubtab === 'weekly') {
      if (el.questResetLabel) el.questResetLabel.textContent = '주간 퀘스트 · 매주 월요일 초기화 · 완료 시 다이아 상자';
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
          iconKey: m.iconKey || 'm_play',
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
            showToast(`${chest.name}가 상자 보관함에 저장되었습니다.`);
          }
        }));
      });
    } else if (currentQuestSubtab === 'ach') {
      if (el.questResetLabel) el.questResetLabel.textContent = '영구 업적 · 달성 시 은 / 황금 / 다이아 상자 지급';
      DATA.ACHIEVEMENTS.forEach((a) => {
        const cur = Math.min(a.target, getAchievementMetricValue(a.metric));
        const pct = Math.min(100, (cur / a.target) * 100);
        const isDone = cur >= a.target;
        const isClaimed = Boolean(save.achievementsClaimed && save.achievementsClaimed[a.id]);
        const chest = DATA.CHESTS[a.rewardChest] || DATA.CHESTS.silver;
        grid.appendChild(createBrawlQuestCard({
          tierClass: `tier-ach chest-${a.rewardChest}`,
          tag: '영구 업적',
          iconKey: a.iconKey || 'crown',
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
            showToast(`${chest.name}가 상자 보관함에 저장되었습니다.`);
          }
        }));
      });
    }
  }

  function createBrawlQuestCard({ tierClass, tag, iconKey, title, progText, pct, chest, isDone, isClaimed, onClaim, onStore }) {
    const card = document.createElement('div');
    card.className = `bs-quest-card ${tierClass}${isClaimed ? ' claimed' : (isDone ? ' ready' : '')}`;
    card.innerHTML = `
      <div class="bs-qcard-main">
        <div class="bs-qcard-top">
          <span class="bs-qtag">${tag}</span>
          <span class="bs-qprog-num">${progText}</span>
        </div>
        <div class="bs-qcard-title"><span class="bs-qico">${uiIcon(iconKey || 'm_play', 'sm')}</span><span>${title}</span></div>
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
      <span class="bs-qchest-lbl">${isClaimed ? '완료' : (isDone ? '열기' : chest.name)}</span>
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
      storeBtn.innerHTML = `${uiIcon('chest', 'xs')} 보관`;
      storeBtn.title = '상자 보관함에 저장';
      storeBtn.onclick = onStore;
      actionCol.appendChild(storeBtn);
    }

    card.appendChild(actionCol);
    return card;
  }

  const CHAR_SHORT_SKILL = {
    umbrella_master: '방수 우비',
    raincoat_boy: '방수 우비',
    long_padding: '오토 기어',
    short_sleeve: '쾌청 캔슬',
    iced_americano: '3단·스톰프',
    fashionista: '회피 실드'
  };

  function getCharShortSkill(ch) {
    return (ch && CHAR_SHORT_SKILL[ch.id]) || (ch ? ch.passiveName : '');
  }

  function getCharSpriteVer(animSkin) {
    if (animSkin === 'skier') return '20261121hd67';
    if (animSkin === 'santa') return '20261121hd79';
    if (animSkin === 'ice_emperor') return '20261121hd83';
    return ASSET_VER;
  }

  function renderHomeCharStage() {
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);
    const skin = getEquippedSkin(ch.id);
    const anim = getCharAnimSpec(ch, skin);
    const tierCls = `tier-${ch.auraType || 'basic'}`;

    el.homeHeroStage.className = `bs-home-stage ${tierCls}${unlocked ? '' : ' locked'}`;
    const homePose = (skin && skin.customIdleFrames) ? 'idle' : 'run';
    const charSprVer = getCharSpriteVer(anim.skin);
    const initHomeFrame = `assets/chars/${anim.skin}_${homePose}_0.png?v=${charSprVer}`;
    const readyHomeInit = getPreloadedHomeHeroSrc(initHomeFrame, skin);
    const initialHomeSrc = readyHomeInit || (skin && skin.outfitColor ? getSkinAvatar(ch, skin) : initHomeFrame);
    lastHomeHeroSrc = initialHomeSrc;
    el.homeHeroImg.src = initialHomeSrc;
    el.homeHeroImg.alt = skin ? `${ch.name} (${skin.name})` : ch.name;
    el.homeHeroImg.style.filter = getSkinFilter(skin);
    el.homeHeroImg.style.setProperty('--skin-glow', skin ? skin.glow : '');
    if (el.homeHeroAura) {
      const hasAura = Boolean(unlocked && skin && skin.customAuraPrefix);
      el.homeHeroAura.classList.toggle('hidden', !hasAura);
      if (hasAura) {
        el.homeHeroAura.src = `assets/chars/${skin.customAuraPrefix}_0.png?v=${charSprVer}`;
      }
    }
    el.homeCharLvBadge.textContent = unlocked ? getCharShortSkill(ch) : '잠금';
    el.homeCharTier.textContent = unlocked
      ? (skin ? `${skin.name}` : ch.tier)
      : `${ch.price.toLocaleString('ko-KR')}G`;
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
      el.btnPlaySub.textContent = ch.name;
    } else {
      el.btnPlayStart.disabled = save.gold < ch.price;
      el.btnPlayLabel.textContent = `${ch.price.toLocaleString('ko-KR')}G 해금`;
      el.btnPlaySub.textContent = `${ch.name} 구매 후 플레이`;
    }
  }

  const homeHeroPreloadCache = {};

  function getPreloadedHomeHeroSrc(src, skinDef = null) {
    let img = homeHeroPreloadCache[src];
    if (!img) {
      img = new Image();
      img.src = src;
      homeHeroPreloadCache[src] = img;
    }
    if (!img.complete || img.naturalWidth <= 0) return null;
    if (skinDef && skinDef.outfitColor && Renderer && Renderer.getRecoloredDataUrl) {
      return Renderer.getRecoloredDataUrl(img, skinDef) || src;
    }
    return src;
  }

  function getCharShowcaseFrameSrc(ch, skin, t, forceRun = false) {
    const anim = getCharAnimSpec(ch, skin);
    const useIdle = !forceRun && Boolean(skin && skin.customIdleFrames);
    const frameCnt = useIdle ? skin.customIdleFrames : anim.frames;
    const fps = useIdle ? 6.5 : (frameCnt >= 6 ? 13 : (frameCnt >= 3 ? 9.5 : 7.5));
    const frame = Math.floor(t * fps) % frameCnt;
    const charSprVer = getCharSpriteVer(anim.skin);
    return `assets/chars/${anim.skin}_${useIdle ? 'idle' : 'run'}_${frame}.png?v=${charSprVer}`;
  }

  let lastHomeAnimUpdate = 0;
  function updateHomeRunningHero(t) {
    if (currentTab !== 'home') return;
    if (el.modeSelectOverlay && !el.modeSelectOverlay.classList.contains('hidden')) return;
    if (el.weatherOverlay && !el.weatherOverlay.classList.contains('hidden')) return;
    if (el.introOverlay && !el.introOverlay.classList.contains('hidden')) return;
    if (el.loginOverlay && !el.loginOverlay.classList.contains('hidden')) return;
    if (t - lastHomeAnimUpdate < 0.055) return;
    lastHomeAnimUpdate = t;
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const skin = getEquippedSkin(ch.id);
    const src = getCharShowcaseFrameSrc(ch, skin, t, false);
    const readySrc = getPreloadedHomeHeroSrc(src, skin);
    if (readySrc && readySrc !== lastHomeHeroSrc) {
      lastHomeHeroSrc = readySrc;
      el.homeHeroImg.src = readySrc;
    }
    if (el.homeHeroAura && skin && skin.customAuraPrefix && isCharUnlocked(ch.id)) {
      const af = Math.floor(t * 9) % (skin.customAuraFrames || 6);
      const auraSrc = `assets/chars/${skin.customAuraPrefix}_${af}.png?v=${getCharSpriteVer(getCharAnimSpec(ch, skin).skin)}`;
      const readyAura = getPreloadedHomeHeroSrc(auraSrc);
      if (readyAura && el.homeHeroAura.getAttribute('src') !== readyAura) {
        el.homeHeroAura.src = readyAura;
      }
    }
  }

  let lastDetailHeroSrc = '';
  let lastDetailAnimUpdate = 0;
  function updateDetailRunningHero(t) {
    if (detailCharIdx === null || !el.charDetailOverlay || el.charDetailOverlay.classList.contains('hidden') || !el.detailCharImg) return;
    if (t - lastDetailAnimUpdate < 0.055) return;
    lastDetailAnimUpdate = t;
    const ch = DATA.CHARACTERS[detailCharIdx] || DATA.CHARACTERS[0];
    const skin = getEquippedSkin(ch.id);
    const src = getCharShowcaseFrameSrc(ch, skin, t, true);
    const readySrc = getPreloadedHomeHeroSrc(src, skin);
    if (readySrc && readySrc !== lastDetailHeroSrc) {
      lastDetailHeroSrc = readySrc;
      el.detailCharImg.src = readySrc;
    }
  }

  function openCharDetail(idx) {
    SFX.click();
    detailCharIdx = ((idx % DATA.CHARACTERS.length) + DATA.CHARACTERS.length) % DATA.CHARACTERS.length;
    lastDetailHeroSrc = '';
    renderCharDetailModal();
    el.charDetailOverlay.classList.remove('hidden');
  }

  function closeCharDetail() {
    SFX.click();
    detailCharIdx = null;
    lastDetailHeroSrc = '';
    if (el.charSkinsOverlay) el.charSkinsOverlay.classList.add('hidden');
    el.charDetailOverlay.classList.add('hidden');
  }

  function openCharSkinsModal() {
    if (detailCharIdx === null) return;
    SFX.click();
    renderCharSkinsModal();
    if (el.charSkinsOverlay) el.charSkinsOverlay.classList.remove('hidden');
  }

  function closeCharSkinsModal() {
    SFX.click();
    if (el.charSkinsOverlay) el.charSkinsOverlay.classList.add('hidden');
  }

  function renderCharSkinsModal() {
    if (detailCharIdx === null || !el.charSkinsBody) return;
    const ch = DATA.CHARACTERS[detailCharIdx] || DATA.CHARACTERS[0];
    const equippedSkin = getEquippedSkin(ch.id);
    const rarRank = { mythic: 4, legendary: 3, epic: 2, rare: 1 };
    const charSkins = DATA.getSkinsForChar(ch.id).slice().sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0));
    const ownedCharSkins = charSkins.filter((sk) => save.unlockedSkins.includes(sk.id)).length;

    if (el.charSkinsTitle) el.charSkinsTitle.textContent = `${ch.name} 스킨 선택`;
    if (el.charSkinsCountPill) el.charSkinsCountPill.textContent = `보유 ${ownedCharSkins}/${charSkins.length}`;

    el.charSkinsBody.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'bs-shop-grid skins bs-exchange-grid bs-cskin-grid';

    // 1) Default Appearance Card
    const defCard = document.createElement('div');
    defCard.className = `bs-offer-card skin-card rar-default${!equippedSkin ? ' selected' : ''}`;
    defCard.innerHTML = `
      <div class="bs-offer-ribbon skin-rar-rib rar-default">기본</div>
      <div class="bs-offer-stage">
        <div class="bs-offer-rays"></div>
        <img src="${getSkinAvatar(ch, null)}" alt="${ch.name} 기본 외형" class="bs-offer-img skin" />
      </div>
      <div class="bs-offer-name">기본 외형</div>
      <div class="bs-offer-sub">${ch.name}</div>
    `;
    const defFoot = document.createElement('div');
    defFoot.className = 'bs-offer-foot';
    const defBtn = document.createElement('button');
    defBtn.type = 'button';
    defBtn.className = !equippedSkin ? 'bs-buy-btn done' : 'bs-buy-btn equip';
    defBtn.textContent = !equippedSkin ? '장착 중' : '장착';
    defBtn.disabled = !equippedSkin;
    defBtn.onclick = () => {
      SFX.click();
      delete save.equippedSkins[ch.id];
      persistSave();
      refreshAllMenus();
      showToast(`${ch.name} 기본 외형으로 변경!`);
    };
    defFoot.appendChild(defBtn);
    defCard.appendChild(defFoot);
    grid.appendChild(defCard);

    // 2) Collectible Skins for this Character (Visual Cards!)
    charSkins.forEach((sk) => {
      const owned = save.unlockedSkins.includes(sk.id);
      const isEq = Boolean(equippedSkin && equippedSkin.id === sk.id);
      const rar = DATA.SKIN_RARITIES[sk.rarity] || DATA.SKIN_RARITIES.rare;
      const milPrice = getSkinMileagePrice(sk);
      const isPassEx = Boolean(sk.seasonExclusive) && !DATA.isPassSkinReleased(sk);
      const isReleasedPass = Boolean(sk.seasonExclusive) && DATA.isPassSkinReleased(sk);
      const skAv = getSkinAvatar(ch, sk);
      const skFlt = getSkinFilter(sk);

      const card = document.createElement('div');
      card.className = `bs-offer-card skin-card rar-${sk.rarity}${isEq ? ' selected' : ''}${owned ? '' : ' unowned'}`;
      card.innerHTML = `
        <div class="bs-offer-ribbon skin-rar-rib rar-${sk.rarity}">${rar.name}</div>
        <div class="bs-offer-stage">
          <div class="bs-offer-rays"></div>
          <img src="${skAv}" alt="${sk.name}" class="bs-offer-img skin" style="${skFlt ? `filter:${skFlt};` : ''}" />
        </div>
        <div class="bs-offer-name">${sk.name}</div>
        <div class="bs-offer-sub">${owned ? '보유 중' : (isPassEx ? '골드 패스 80티어' : (isReleasedPass ? '스킨 뽑기 획득' : `마일리지 ${milPrice}M`))}</div>
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
          save.equippedSkins[ch.id] = sk.id;
          persistSave();
          refreshAllMenus();
          showToast(`[${sk.name}] 스킨 장착 완료!`);
        };
      } else if (isPassEx) {
        btn.className = 'bs-buy-btn gold';
        btn.textContent = '패스 80';
        btn.onclick = () => {
          closeCharSkinsModal();
          closeCharDetail();
          openSeasonPassModal();
          showToast(`[${sk.name}]은 시즌 기간 동안 골드 패스 80티어로만 획득할 수 있습니다!`);
        };
      } else if (isReleasedPass) {
        btn.className = 'bs-buy-btn mileage';
        btn.textContent = '뽑기 이동';
        btn.onclick = () => {
          closeCharSkinsModal();
          closeCharDetail();
          currentShopSubtab = 'gacha';
          switchTab('shop');
          showToast(`[${sk.name}]은 스킨 뽑기에서 획득할 수 있습니다!`);
        };
      } else {
        btn.className = 'bs-buy-btn mileage';
        btn.textContent = `${milPrice}M 교환`;
        btn.onclick = () => {
          closeCharSkinsModal();
          closeCharDetail();
          currentShopSubtab = 'gacha';
          switchTab('shop');
          openSkinExchangeModal();
          showToast(`스킨 교환소에서 ${milPrice} 마일리지로 교환하거나 뽑기에서 획득하세요!`);
        };
      }
      foot.appendChild(btn);
      card.appendChild(foot);
      grid.appendChild(card);
    });

    el.charSkinsBody.appendChild(grid);
  }

  function getCharPassiveSvg(charId) {
    if (charId === 'umbrella_master') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9zm0 9v6.5a2.2 2.2 0 0 0 4.4 0" fill="none" stroke="#2a1400" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (charId === 'long_padding') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="3.4" fill="none" stroke="#2a1400" stroke-width="2.3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9" stroke="#2a1400" stroke-width="2.2" stroke-linecap="round"/></svg>';
    }
    if (charId === 'short_sleeve') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="#fff5c0" stroke="#2a1400" stroke-width="2.2"/><path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" stroke="#2a1400" stroke-width="2.1" stroke-linecap="round"/></svg>';
    }
    if (charId === 'iced_americano') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 4L6 10h4v4H6l6 6 6-6h-4v-4h4z" fill="#fff5c0" stroke="#2a1400" stroke-width="2" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.6-3 8.1-7 9.5-4-1.4-7-4.9-7-9.5V6l7-3z" fill="#fff5c0" stroke="#2a1400" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  }

  function renderCharDetailModal() {
    if (detailCharIdx === null) return;
    const ch = DATA.CHARACTERS[detailCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);
    const selected = save.selectedChar === ch.id;
    const stats = getCharStats(ch);
    const equippedSkin = getEquippedSkin(ch.id);
    const anim = getCharAnimSpec(ch, equippedSkin);
    const tierCls = `tier-${ch.auraType || 'basic'}`;
    const charSprVer = getCharSpriteVer(anim.skin);
    const charSkins = DATA.getSkinsForChar(ch.id);
    const ownedCharSkins = charSkins.filter((sk) => save.unlockedSkins.includes(sk.id)).length;

    el.detailHeroStage.className = `bs-char-arena ${tierCls}${unlocked ? '' : ' locked'}`;
    if (el.detailSkinCount) el.detailSkinCount.textContent = `스킨 ${ownedCharSkins}/${charSkins.length}`;
    if (el.detailTopGold) el.detailTopGold.textContent = (save.gold || 0).toLocaleString('ko-KR');
    if (el.detailTopGems) el.detailTopGems.textContent = (save.gems || 0).toLocaleString('ko-KR');
    if (el.detailRibbonIco) el.detailRibbonIco.innerHTML = getCharPassiveSvg(ch.id);

    el.detailCharTier.textContent = equippedSkin ? equippedSkin.name : ch.tier;
    el.detailCharName.textContent = ch.name;
    el.detailEquippedPill.classList.toggle('hidden', !selected);
    const initDetailFrame = `assets/chars/${anim.skin}_run_0.png?v=${charSprVer}`;
    const readyDetailInit = getPreloadedHomeHeroSrc(initDetailFrame, equippedSkin);
    lastDetailHeroSrc = readyDetailInit || (equippedSkin && equippedSkin.outfitColor ? getSkinAvatar(ch, equippedSkin) : initDetailFrame);
    el.detailCharImg.src = lastDetailHeroSrc;
    el.detailCharImg.style.filter = getSkinFilter(equippedSkin);
    el.detailCharDesc.textContent = ch.desc;

    el.detailStatHp.textContent = `${stats.maxHp}칸`;
    el.detailFillHp.style.width = `${Math.min(100, Math.round((stats.maxHp / 5) * 100))}%`;
    el.detailStatGold.textContent = `${Math.round(stats.goldMult * 100)}%`;
    el.detailFillGold.style.width = `${Math.min(100, Math.round(((stats.goldMult - 0.7) / 1.0) * 100))}%`;
    el.detailStatScore.textContent = `${Math.round(stats.scoreMult * 100)}%`;
    el.detailFillScore.style.width = `${Math.min(100, Math.round(((stats.scoreMult - 0.7) / 1.0) * 100))}%`;

    el.detailPassiveIco.innerHTML = getCharPassiveSvg(ch.id);
    el.detailPassiveName.textContent = ch.passiveName;
    el.detailPassiveDesc.textContent = ch.passiveDesc;

    if (unlocked) {
      if (selected) {
        el.btnDetailMain.className = 'item-action-btn done brawl-main-cta';
        el.btnDetailMain.textContent = '장착 중';
        el.btnDetailMain.disabled = true;
        el.btnDetailMain.onclick = null;
      } else {
        el.btnDetailMain.className = 'cr-gold-btn brawl-main-cta';
        el.btnDetailMain.textContent = '선택';
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
      el.btnDetailMain.className = 'cr-gold-btn brawl-main-cta';
      el.btnDetailMain.textContent = `${ch.price.toLocaleString('ko-KR')}G 해금`;
      el.btnDetailMain.disabled = save.gold < ch.price;
      el.btnDetailMain.onclick = () => buyCharacter(ch, detailCharIdx);
    }
  }

  function renderCharList() {
    const ownedCount = save.unlockedChars.length;
    const totalCount = DATA.CHARACTERS.length;
    const ratePct = Math.round((ownedCount / totalCount) * 100);
    const dexBonusPct = Math.max(0, ownedCount - 1) * 3;
    if (el.dexRateText) el.dexRateText.textContent = `${ownedCount} / ${totalCount} (${ratePct}%)`;
    if (el.dexBarFill) el.dexBarFill.style.width = `${ratePct}%`;
    if (el.dexBonusText) el.dexBonusText.textContent = `현재 도감 효과: 전체 점수 +${dexBonusPct}% (캐릭터 추가 해금당 +3%) · 보유 스킨 ${save.unlockedSkins.length}/${DATA.SKINS.length}`;
    if (el.bsRosterCount) el.bsRosterCount.textContent = `캐릭터 ${ownedCount}/${totalCount}`;

    if (!el.charList) return;
    el.charList.innerHTML = '';
    DATA.CHARACTERS.forEach((ch, idx) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;
      const stats = getCharStats(ch);
      const eqSkin = getEquippedSkin(ch.id);
      const tierCls = `tier-${ch.auraType || 'basic'}`;
      const charSkins = DATA.getSkinsForChar(ch.id);
      const ownedCharSkins = charSkins.filter((sk) => save.unlockedSkins.includes(sk.id)).length;
      const hpPct = Math.min(100, Math.round((stats.maxHp / 5) * 100));

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `brawl-card bs-rcard${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.setAttribute('aria-label', `${ch.name} 능력치 상세 보기`);
      card.innerHTML = `
        <div class="bs-rcard-main ${tierCls}">
          <span class="bs-rcard-rays" aria-hidden="true"></span>
          ${selected ? '<span class="bs-rcard-eq">장착</span>' : ''}
          <span class="bs-rcard-skill">${getCharShortSkill(ch)}</span>
          <span class="bs-rcard-podium" aria-hidden="true"></span>
          <img src="${getSkinAvatar(ch, eqSkin)}" alt="${ch.name}" class="bs-rcard-img" style="${getSkinFilter(eqSkin) ? `filter:${getSkinFilter(eqSkin)};` : ''}" />
          <div class="bs-rcard-foot">
            <div class="bs-rcard-meta">
              <span class="bs-rcard-stat">${unlocked ? `${uiIcon('heart', 'xs')} ${stats.maxHp}` : `${uiIcon('coin', 'xs')} ${ch.price.toLocaleString('ko-KR')}`}</span>
              <span class="bs-rcard-bar"><i style="width:${unlocked ? hpPct : 0}%"></i></span>
            </div>
            <span class="bs-rcard-name">${ch.name}</span>
          </div>
        </div>
        <div class="bs-rcard-rail">
          <span class="bs-rcard-lv ${unlocked ? (selected ? 'eq' : 'owned') : 'lock'}">${unlocked ? (selected ? '장착' : '보유') : '잠금'}</span>
          <div class="bs-rcard-pips" aria-hidden="true">
            <span class="bs-pip p-green${unlocked ? ' on' : ''}"></span>
            <span class="bs-pip p-gold${unlocked ? ' on' : ''}"></span>
            <span class="bs-pip p-purple${ownedCharSkins > 0 ? ' on' : ''}"></span>
          </div>
          <span class="bs-rcard-skins">${ownedCharSkins}/${charSkins.length}</span>
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
    showToast(`[${ch.name}] 해금 및 장착 완료!`);
  }

  function openSkinExchangeModal() {
    SFX.click();
    renderSkinExchangeModal();
    if (el.skinExchangeOverlay) el.skinExchangeOverlay.classList.remove('hidden');
  }

  function closeSkinExchangeModal() {
    SFX.click();
    if (el.skinExchangeOverlay) el.skinExchangeOverlay.classList.add('hidden');
  }

  function renderSkinExchangeModal() {
    if (!el.skinExchangeBody) return;
    const curMileage = save.mileage || 0;
    if (el.exchangeMileageVal) el.exchangeMileageVal.textContent = curMileage.toLocaleString('ko-KR');

    el.skinExchangeBody.innerHTML = '';

    const rarRank = { mythic: 4, legendary: 3, epic: 2, rare: 1 };
    const sortedSkins = DATA.SKINS.filter((s) => !s.seasonExclusive).sort((a, b) => (rarRank[b.rarity] || 0) - (rarRank[a.rarity] || 0));
    const mythicSkins = sortedSkins.filter((s) => s.rarity === 'mythic');
    const otherSkins = sortedSkins.filter((s) => s.rarity !== 'mythic');

    // Featured Mythic Skin Banner (200M Exchange)
    if (mythicSkins.length > 0) {
      const featSec = document.createElement('div');
      featSec.className = 'bs-shop-section';
      featSec.innerHTML = `
        <div class="bs-shop-sec-head mythic">
          <span class="bs-shop-sec-title">신화 스페셜 스킨</span>
          <span class="bs-shop-sec-sub">스킨 뽑기 획득 또는 200M 확정 교환</span>
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
              <span class="skin-rar-pill" style="background:#b0165e;color:#fff">신화 MYTHIC</span>
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
          btn.textContent = isEq ? '장착 중' : '장착';
          btn.disabled = isEq;
          btn.onclick = () => {
            SFX.click();
            save.equippedSkins[sk.charId] = sk.id;
            persistSave();
            refreshAllMenus();
            showToast(`[${sk.name}] 스킨 장착 완료!`);
          };
        } else {
          btn.className = 'bs-buy-btn mileage big';
          btn.textContent = `${milPrice}M 교환`;
          btn.onclick = () => {
            if ((save.mileage || 0) < milPrice) {
              closeSkinExchangeModal();
              showToast(`마일리지가 부족합니다! (보유 ${save.mileage || 0}M / 필요 ${milPrice}M) 스킨 뽑기 1회당 +2M!`);
              return;
            }
            SFX.chestJackpot();
            save.mileage -= milPrice;
            save.unlockedSkins.push(sk.id);
            save.equippedSkins[sk.charId] = sk.id;
            persistSave(true);
            refreshAllMenus();
            showToast(`[${sk.name}] 마일리지 교환 및 즉시 장착 완료!`);
          };
        }
        hero.appendChild(btn);
        featSec.appendChild(hero);
      });
      el.skinExchangeBody.appendChild(featSec);
    }

    // Standard Skin Exchange Grid (Rare 10M · Epic 30M · Legendary 50M)
    const gridSec = document.createElement('div');
    gridSec.className = 'bs-shop-section';
    gridSec.innerHTML = `
      <div class="bs-shop-sec-head skins">
        <span class="bs-shop-sec-title">마일리지 교환 목록</span>
        <span class="bs-shop-sec-sub">뽑기 1회 +2M · 중복 +2M 추가</span>
      </div>
    `;
    const grid = document.createElement('div');
    grid.className = 'bs-shop-grid skins bs-exchange-grid';

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
        <div class="bs-offer-ribbon skin-rar-rib rar-${sk.rarity}">${rar.name}</div>
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
          showToast(`[${sk.name}] 스킨 장착 완료!`);
        };
      } else {
        btn.className = 'bs-buy-btn mileage';
        btn.textContent = `${milPrice}M`;
        btn.onclick = () => {
          if ((save.mileage || 0) < milPrice) {
            closeSkinExchangeModal();
            showToast(`마일리지가 부족합니다! (보유 ${save.mileage || 0}M / 필요 ${milPrice}M) 스킨 뽑기를 이용해 보세요!`);
            return;
          }
          SFX.chestJackpot();
          save.mileage -= milPrice;
          save.unlockedSkins.push(sk.id);
          save.equippedSkins[sk.charId] = sk.id;
          persistSave(true);
          refreshAllMenus();
          showToast(`[${sk.name}] 마일리지 교환 및 장착 완료!`);
        };
      }
      foot.appendChild(btn);
      card.appendChild(foot);
      grid.appendChild(card);
    });

    gridSec.appendChild(grid);
    el.skinExchangeBody.appendChild(gridSec);
  }

  function renderShopList() {
    if (!['gacha', 'chests', 'gold', 'gems'].includes(currentShopSubtab)) {
      currentShopSubtab = 'gacha';
    }
    document.querySelectorAll('.subtab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.shoptab === currentShopSubtab);
    });

    el.shopItemsList.innerHTML = '';

    if (currentShopSubtab === 'gacha') {
      // BRAWL STARS STYLE FOUR-SEASONS SKIN GACHA SCREEN (1-PULL / 10-PULL + POPUP SKIN EXCHANGE!)
      const cost1 = computeGachaCost(1);
      const cost10 = computeGachaCost(10);
      const fmtCostHtml = (c) => {
        if (c.useTickets > 0 && c.needGems > 0) {
          return `<span class="gc-cost-line">${ticketIconHtml('btn')} ${c.useTickets} + ${uiIcon('gem', 'btn')} ${c.needGems.toLocaleString('ko-KR')}</span>`;
        }
        if (c.useTickets > 0) {
          return `<span class="gc-cost-line">${ticketIconHtml('btn')} ${c.useTickets}</span>`;
        }
        return `<span class="gc-cost-line">${uiIcon('gem', 'btn')} ${c.needGems.toLocaleString('ko-KR')}</span>`;
      };

      const stage = document.createElement('div');
      stage.className = 'gacha-screen weather-gacha bs-gacha-screen';
      stage.innerHTML = `
        <aside class="gacha-sidebar">
          <div class="gacha-side-title">기상 소환</div>
          <button type="button" class="gacha-banner-thumb active" data-gaction="stay">
            <span class="gacha-pickup-tag">기상특보</span>
            <img src="assets/chars/port_hades.png?v=${ASSET_VER}" alt="사계절 기상 소환" class="gacha-thumb-art" />
            <div class="gacha-thumb-txt">
              <strong>사계절 스킨 뽑기</strong>
              <span>봄·여름·가을·겨울</span>
            </div>
          </button>
          <button type="button" class="gacha-banner-thumb exchange" data-gaction="exchange">
            <img src="assets/chars/port_catgirl.png?v=${ASSET_VER}" alt="마일리지 스킨 교환" class="gacha-thumb-art" />
            <div class="gacha-thumb-txt">
              <strong>스킨 교환소</strong>
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
          <div class="gacha-weather-clouds" aria-hidden="true"></div>
          <div class="gacha-weather-sunbeam" aria-hidden="true"></div>

          <div class="gacha-top-row">
            <button type="button" class="gacha-pill-btn" data-gaction="history">소환 내역</button>
            <div class="gacha-cur-bar">
              <button type="button" class="gacha-cur-chip mileage" data-gaction="exchange" title="스킨 교환소 열기">
                <span class="gc-m-tag">M</span><strong>${(save.mileage || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
              <button type="button" class="gacha-cur-chip ticket" data-gaction="vault" title="상자 보관함에서 뽑기권 교환">
                ${ticketIconHtml('lg')}<strong>${(save.gachaTickets || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
              <button type="button" class="gacha-cur-chip gem" data-gaction="gems" title="보석 상점">
                ${uiIcon('gem', 'sm')}<strong>${(save.gems || 0).toLocaleString('ko-KR')}</strong><em class="gc-plus">+</em>
              </button>
            </div>
          </div>

          <div class="gacha-hero-zone">
            <div class="gacha-title-col">
              <div class="gacha-season-kicker">봄 · 여름 · 가을 · 겨울</div>
              <div class="gacha-main-title">사계절 기상 스킨 소환</div>
              <div class="gacha-sub-strip">
                <span>1회 소환 <strong>+2M</strong> · 중복 시 <strong>+2M 추가</strong> · 전 등급 스킨 출현</span>
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
            <button type="button" class="gacha-pill-btn prob" data-gaction="prob">상세 확률</button>
            <div class="gacha-pull-group">
              <div class="gacha-pull-note">${ticketIconHtml('xs')} 뽑기권 우선 사용 · 부족 시 ${uiIcon('gem', 'xs')} 200 보석 / 1회</div>
              <div class="gacha-pull-btns">
                <button type="button" class="gacha-green-btn pull-1" data-gaction="pull1">
                  ${fmtCostHtml(cost1)}
                  <span class="gc-pull-lbl">1회 소환</span>
                </button>
                <button type="button" class="gacha-green-btn pull-10" data-gaction="pull10">
                  ${fmtCostHtml(cost10)}
                  <span class="gc-pull-lbl">10회 연속 소환</span>
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
          else if (act === 'exchange') openSkinExchangeModal();
          else if (act === 'vault') openVaultModal();
          else if (act === 'gems') {
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
          <span class="bs-shop-sec-title">상자 상점</span>
          <span class="bs-shop-sec-sub">${uiText('나무·은 상자는 골드, 황금(40보석)·다이아(100보석)는 보석 구매 · 보관함에서 뽑기권 교환 가능', 'xs')}</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid four';

      DATA.CHEST_ORDER.forEach((tierId) => {
        const chest = DATA.CHESTS[tierId];
        const pityInfo = tierId === 'gold'
          ? `${uiIcon('crown', 'xs')} 영웅+ 천장 ${save.pity.gold || 0}/10`
          : (tierId === 'diamond'
            ? `${uiIcon('gem', 'xs')} 전설 천장 ${save.pity.diamond || 0}/15`
            : `${uiIcon('coin', 'xs')} ${chest.goldRange[0]}~${chest.goldRange[1]}G`);
        const rateSummary = tierId === 'wood'
          ? `희귀 23% · 영웅 1.5% · ${uiIcon('gem', 'xs')} 0.5%`
          : (tierId === 'silver'
            ? `희귀 30% · 영웅 3% · ${uiIcon('gem', 'xs')} 2%`
            : (tierId === 'gold'
              ? '희귀 25% · 영웅 17% · 전설 3%'
              : `영웅 30% · 전설 25% · ${uiIcon('gem', 'xs')} 10%`));

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
          gBtn.innerHTML = `${uiIcon('coin', 'btn')} ${chest.shopGold.toLocaleString('ko-KR')}`;
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
          dBtn.innerHTML = `${uiIcon('gem', 'btn')} ${chest.shopGems}`;
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
    } else if (currentShopSubtab === 'gold') {
      // BRAWL STARS GOLD PACKS (BOUGHT WITH GEMS!)
      const sec = document.createElement('div');
      sec.className = 'bs-shop-section';
      sec.innerHTML = `
        <div class="bs-shop-sec-head gold">
          <span class="bs-shop-sec-title">${uiIcon('coin', 'sm')} 골드 상점</span>
          <span class="bs-shop-sec-sub">${uiIcon('gem', 'xs')} 보석으로 골드를 즉시 교환하세요!</span>
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
        btn.innerHTML = `${uiIcon('gem', 'btn')} ${pk.gemCost.toLocaleString('ko-KR')}`;
        btn.onclick = () => {
          if ((save.gems || 0) < pk.gemCost) {
            SFX.click();
            currentShopSubtab = 'gems';
            renderShopList();
            showToast('보석이 부족합니다! 보석 상점에서 충전할 수 있어요.');
            return;
          }
          SFX.buy();
          save.gems -= pk.gemCost;
          save.gold += pk.gold;
          persistSave();
          refreshAllMenus();
          showToast(`${pk.gold.toLocaleString('ko-KR')} 골드 구매 완료!`);
        };
        foot.appendChild(btn);
        card.appendChild(foot);
        grid.appendChild(card);
      });

      sec.appendChild(grid);
      el.shopItemsList.appendChild(sec);
    } else if (currentShopSubtab === 'gems') {
      // BRAWL STARS REAL-MONEY GEM SHOP (EXACT 100보석 = ₩1,000!)
      const sec = document.createElement('div');
      sec.className = 'bs-shop-section';
      sec.innerHTML = `
        <div class="bs-shop-sec-head gems">
          <span class="bs-shop-sec-title">${uiIcon('gem', 'sm')} 보석 상점</span>
          <span class="bs-shop-sec-sub">${uiText('100보석 = ₩1,000 정가 · 스킨 뽑기(200보석) · 골드 · 황금/다이아 상자 구매에 사용!', 'xs')}</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'bs-shop-grid four';

      (DATA.GEM_PACKS || []).forEach((pk) => {
        const card = document.createElement('div');
        card.className = `bs-offer-card gem-pack tier-${pk.tier}`;
        const gemCount = pk.tier === 'xl' ? 3 : (pk.tier === 'lg' ? 2 : 1);
        let gemPileHtml = '';
        for (let gi = 0; gi < gemCount; gi++) gemPileHtml += uiIcon('gem', 'xl');
        card.innerHTML = `
          <div class="bs-offer-ribbon gem-rib" style="background:${pk.accent};color:#08162c">${pk.badge}</div>
          <div class="bs-offer-stage gem-stage">
            <div class="bs-offer-rays"></div>
            <div class="bs-gem-pile ${pk.tier}" aria-hidden="true">${gemPileHtml}</div>
          </div>
          <div class="bs-offer-bigval gem">${pk.gems.toLocaleString('ko-KR')} ${uiIcon('gem', 'md')}</div>
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
    }
  }

  function setDynamicDockCollapsed(collapsed) {
    const next = currentTab === 'home' ? false : Boolean(collapsed);
    dockCollapsed = next;
    if (el.bottomNav) el.bottomNav.classList.toggle('dock-collapsed', next);
  }

  function switchTab(tab) {
    SFX.click();
    currentTab = tab;
    if (dockAutoHideTimer) {
      clearTimeout(dockAutoHideTimer);
      dockAutoHideTimer = null;
    }
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${tab}`).classList.add('active');
    const appShell = document.getElementById('mobile-app');
    if (appShell) appShell.classList.toggle('is-home-bg', tab === 'home');
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (el.tabContainer) {
      el.tabContainer.scrollTop = 0;
      lastTabScrollTop = 0;
    }
    setDynamicDockCollapsed(false);
    refreshAllMenus();
  }

  // ===================== RUNNER ENGINE (WEATHER PHYSICS + GEAR + CORONA EVENT) =====================
  const GEAR_DURATION = 10.0;
  const MASK_PARRY_WINDOW = 3.5;
  const UMBRELLA_PARRY_WINDOW = 3.5;
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

    const sp = ensureSeasonPass();
    const dmProg = sp.dailyMissions.progress;
    dmProg.runs = (dmProg.runs || 0) + 1;
    dmProg.dist = (dmProg.dist || 0) + dist;
    dmProg.coins = (dmProg.coins || 0) + coins;
    dmProg.jumps = (dmProg.jumps || 0) + jumps;
    dmProg.dodges = (dmProg.dodges || 0) + dodges;
    persistSave();
  }

  function activateFeverMode(ch, showBanner = true) {
    if (!run || run.feverTimer > 0) return;
    run.feverTimer = 4.5;
    run.winPoseTimer = 0.7;
    SFX.feverStart();
    let canceledWeather = false;
    const hadTwHazard = Boolean(
      run.todayWeather && run.todayWeather.hazards &&
      (run.todayWeather.hazards.rainActive || run.todayWeather.hazards.floodActive || run.todayWeather.hazards.dustActive || run.todayWeather.hazards.heatActive)
    );
    if (
      ch && ch.clearSkyCancel &&
      (run.weatherEvent !== 'clear' || run.pendingWeather || run.hailAttack || run.covidAttack || hadTwHazard)
    ) {
      run.weatherEvent = 'clear';
      run.pendingWeather = null;
      run.weatherPrepTimer = 0;
      run.weatherEventTimer = 6.5;
      run.clearSkyTimer = 6.5;
      run.hailAttack = null;
      run.covidAttack = null;
      run.heatGauge = 0;
      run.mudBlindTimer = 0;
      run.rainExposeTimer = 0;
      run.dustExposeTimer = 0;
      run.gustExposeTimer = 0;
      canceledWeather = true;
      SFX.setWeatherAmbient('clear');
      hideWeatherCenterAlert();
    }
    if (canceledWeather) {
      Renderer.spawnFloater('쾌청 캔슬! 악천후 소거!', '#ffe866', run.playerX + 12, run.playerY - 56);
    } else if (showBanner) {
      Renderer.spawnFloater('FEVER! 무적 질주!', '#ffe85c', run.playerX + 16, run.playerY - 48);
    }
  }

  function startRun(opts = {}) {
    const isTutorial = Boolean(opts && opts.isTutorial);
    const gameMode = isTutorial ? 'normal' : ((opts && opts.mode) || selectedGameMode || 'normal');
    const twMods = (gameMode === 'today_weather') ? getActiveLiveWeatherMods() : null;
    const ch = getCharDef(save.selectedChar);
    const stats = getCharStats(ch);
    const skinDef = getEquippedSkin(ch.id);
    const maxHp = stats.maxHp + (twMods ? (twMods.extraHp || 0) : 0);
    const initSeasonIdx = twMods ? twMods.seasonIdx : 0;
    const initSeasonId = twMods ? twMods.seasonId : 'spring';
    const initWeatherEv = twMods ? twMods.primaryWeather : 'clear';

    let hasShield = false;
    let startFever = 0;
    if (!isTutorial) {
      if (save.boosters.shield > 0) { save.boosters.shield -= 1; hasShield = true; }
      if (save.boosters.boost > 0) { save.boosters.boost -= 1; startFever = 4.5; }
      persistSave();
    }

    paused = false;
    if (dockAutoHideTimer) {
      clearTimeout(dockAutoHideTimer);
      dockAutoHideTimer = null;
    }
    releaseAllControlButtons();
    Renderer.clearFloaters();

    run = {
      isTutorial,
      gameMode,
      todayWeather: twMods,
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
      goldMult: stats.goldMult * (twMods ? (twMods.goldMult || 1) : 1),
      scoreMult: stats.scoreMult * (twMods ? (twMods.scoreMult || 1) : 1),
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
      nearMissGauge: 0,
      elapsed: 0,
      year: 1,
      seasonIdx: initSeasonIdx,
      seasonId: initSeasonId,
      prevSeasonId: null,
      seasonTransition: 1,
      seasonTime: { spring: 0, summer: 0, autumn: 0, winter: 0 },
      stageMilestonesEarned: [],
      lastHeartCount: -1,
      scroll: 0,
      baseSpeed: isTutorial ? 186 : 196,
      speed: isTutorial ? 186 : 196,

      // Player physics (16:9 Cookie Run widescreen framing · clear of left thumb controls!)
      basePlayerX: 144,
      playerX: 144,
      playerY: Renderer.GROUND_Y,
      currentFloorY: Renderer.GROUND_Y,
      onPlatform: false,
      petY: Renderer.GROUND_Y,
      vy: 0,
      jumpsLeft: ch.tripleJumpStomp ? 3 : 2,
      stomping: false,
      clearSkyTimer: 0,
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
      umbrellaParryTimer: 0,
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
      shieldFromBooster: hasShield,
      shieldTimer: 0,
      shieldMaxTimer: 10.0,
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
      weatherEvent: initWeatherEv,
      weatherEventTimer: 3.5,
      pendingWeather: null,
      weatherPrepTimer: 0,

      // Street Features, Passing Car & Corona Virus / Hail Attack Events
      features: [],
      featureCd: 2.2,
      convStoreCd: 13.0,
      passingCar: null,
      passingCarCd: 5.5,
      covidAttack: null,
      covidAttackCd: 0,
      hailAttack: null,
      hailAttackCd: 3.2,

      // Obstacles & Collectibles
      obstacleCd: 0.55,
      itemCd: 1.35,
      obstacles: [],
      items: [],
      lastHitCause: '극한 한국 날씨에 체력이 다했습니다!'
    };

    if (Renderer && Renderer.preloadForRun) Renderer.preloadForRun(ch, skinDef, initSeasonId);
    el.runPortraitImg.src = getSkinAvatar(ch, skinDef);
    el.runPortraitImg.style.filter = getSkinFilter(skinDef);
    el.runCanvasWrap.classList.toggle('fever-active', startFever > 0);
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    el.gameoverOverlay.classList.add('hidden');
    if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.add('hidden');
    el.pauseOverlay.classList.add('hidden');
    el.viewRun.classList.remove('hidden');
    applyControlLayout();
    if (Renderer && Renderer.syncViewport) Renderer.syncViewport(el.runCanvas);
    else if (Renderer && Renderer.invalidateCanvasSize) Renderer.invalidateCanvasSize();

    // Seed immediate opening coins & first entering obstacle so mobile wide screens have lively objects from Frame 1!
    if (!isTutorial) {
      const openPool = (DATA.OBSTACLES_BY_SEASON && DATA.OBSTACLES_BY_SEASON[initSeasonId]) || [];
      const lowPool = openPool.filter((p) => p.lane === 'low');
      const firstPreset = (lowPool.length ? lowPool : openPool)[Math.floor(Math.random() * (lowPool.length || openPool.length || 1))];
      const coinStartX = run.playerX + 150;
      for (let ci = 0; ci < 4; ci++) {
        run.items.push({ kind: 'coin', x: coinStartX + ci * 28, y: Renderer.GROUND_Y - 22 });
      }
      if (firstPreset) {
        const firstX = Math.min(getSpawnRight() - 6, Math.max(run.playerX + 340, 480));
        const firstY = firstPreset.lane === 'air'
          ? (Renderer.GROUND_Y - 34 - firstPreset.h)
          : (Renderer.GROUND_Y - firstPreset.h);
        run.obstacles.push({
          ...firstPreset,
          x: firstX,
          y: firstY,
          passed: false,
          nearMissed: false,
          stepSeed: Math.random() * Math.PI * 2,
          extraSpeed: 0
        });
        const obsCx = firstX + firstPreset.w / 2;
        const peakY = Math.min(Renderer.GROUND_Y - firstPreset.h - 28, Renderer.GROUND_Y - 80);
        const sideY = Math.min(Renderer.GROUND_Y - 46, peakY + 32);
        pushSafeItem({ kind: 'coin', x: obsCx - 44, y: sideY }, 18, 16, 22);
        pushSafeItem({ kind: 'coin', x: obsCx, y: peakY }, 18, 16, 22);
        pushSafeItem({ kind: 'coin', x: obsCx + 44, y: sideY }, 18, 16, 22);
      }
    }
    resetHudCache();
    updateTutorialHudUI();

    SFX.startBgm();
    SFX.setBgmMode(startFever > 0 ? 'fever' : 'run');
    SFX.setAmbientPaused(false);
    SFX.setWeatherAmbient(initWeatherEv);
    SFX.seasonUp();
    if (!isTutorial) {
      if (twMods) {
        const snap = twMods.snapshot;
        showRunBanner(`${snap.cityName} ${Math.round(snap.tempC)}°C · ${twMods.desc.label} · 점수 ×${twMods.scoreMult.toFixed(2)}`, 2600, 'sky', '오늘의 날씨');
        if (initWeatherEv !== 'clear') {
          showWeatherCenterAlert(initWeatherEv);
        }
      } else {
        showRunBanner(`${ch.name} 출발`, 2200, 'gold', '1년 차 봄');
      }
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
        Renderer.spawnFloater(`${ms.label} +${ms.rewardGold}G!`, '#ffe866', run.playerX + 26, run.playerY - 62);
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

    const hailIncoming = Boolean(
      run.hailAttack &&
      (run.hailAttack.phase === 'warn' || run.hailAttack.phase === 'fall') &&
      !run.hailAttack.checked
    );

    if (hailIncoming && run.weatherEvent !== 'gust') {
      // 우박 낙하 중 우산 버튼을 누르면 실수로 접히지 않고 우박 타이밍 방어를 장전!
      run.umbrellaOn = true;
      run.umbrellaActiveTimer = GEAR_DURATION;
      run.umbrellaParryTimer = UMBRELLA_PARRY_WINDOW;
      run.rainExposeTimer = 0;
      SFX.umbrellaToggle(true);
      haptic(14);
      Renderer.spawnFloater('우박 방어 준비!', '#8ce0ff', run.playerX + 12, run.playerY - 46);
    } else if (run.umbrellaOn) {
      const foldedForGust = run.weatherEvent === 'gust';
      run.umbrellaOn = false;
      run.umbrellaActiveTimer = 0;
      run.umbrellaParryTimer = 0;
      run.gustExposeTimer = 0;
      run.umbrellaCooldown = 0;
      if (foldedForGust) {
        run.score += Math.round(50 * run.scoreMult);
        SFX.guard();
        haptic(14);
        Renderer.spawnFloater('태풍 대비! 우산 접기 성공 +50', '#7ef6ff', run.playerX + 12, run.playerY - 44);
      } else {
        SFX.umbrellaToggle(false);
        haptic(10);
        Renderer.spawnFloater('우산 접기', '#8ce0ff', run.playerX + 10, run.playerY - 42);
      }
    } else {
      run.umbrellaOn = true;
      run.umbrellaActiveTimer = GEAR_DURATION;
      run.umbrellaParryTimer = UMBRELLA_PARRY_WINDOW;
      run.rainExposeTimer = 0;
      run.gustExposeTimer = 0;
      SFX.umbrellaToggle(true);
      haptic(14);
      if (run.weatherEvent === 'gust') {
        run.gustExposeTimer = 0.05;
        Renderer.spawnFloater('태풍 중! 빨리 우산을 접으세요!', '#ff9b54', run.playerX + 12, run.playerY - 44);
      } else {
        Renderer.spawnFloater(`우산 ON! (${GEAR_DURATION}초 자동 해제)`, '#8ce0ff', run.playerX + 10, run.playerY - 42);
      }
    }
    updateRunHud();
  }

  function breakUmbrellaByGust() {
    run.umbrellaOn = false;
    run.umbrellaActiveTimer = 0;
    run.umbrellaParryTimer = 0;
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
    Renderer.spawnFloater(`강풍에 우산 파손! (${UMBRELLA_BROKEN_CD}초 불가)`, '#ff5c5c', run.playerX + 16, run.playerY - 48);
    showRunBanner(`${UMBRELLA_BROKEN_CD}초간 사용 불가 · 체력 -1`, 2200, 'danger', '우산 파손');
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
      Renderer.spawnFloater('마스크 타이밍 장전! 차단 준비!', '#5effbe', run.playerX + 12, run.playerY - 46);
    } else if (run.maskOn) {
      run.maskOn = false;
      run.maskActiveTimer = 0;
      run.maskParryTimer = 0;
      run.maskCooldown = 0;
      SFX.maskToggle(false);
      haptic(10);
      Renderer.spawnFloater('마스크 해제', '#a6ffcf', run.playerX + 10, run.playerY - 42);
    } else {
      run.maskOn = true;
      run.maskActiveTimer = GEAR_DURATION;
      run.maskParryTimer = MASK_PARRY_WINDOW;
      run.maskCooldown = 0;
      run.dustExposeTimer = 0;
      SFX.maskToggle(true);
      haptic(14);
      Renderer.spawnFloater(`KF94 마스크 ON! (${GEAR_DURATION}초 자동 해제)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
    }
    updateRunHud();
  }

  function executeJump(isGroundJump) {
    const ch = getCharDef(run.charId);
    const inFloodWater = run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2;
    const floodFactor = inFloodWater ? (ch.floodResist ? 0.94 : 0.78) : 1.0;
    const twJumpFactor = (run.todayWeather && run.todayWeather.jumpMult) ? run.todayWeather.jumpMult : 1.0;

    run.sliding = false;
    run.stomping = false;
    run.iceSlideInertia = 0;
    run.jumpBufferTimer = 0;
    run.coyoteTimer = 0;
    run.springLaunchTimer = 0;
    run.onPlatform = false;
    run.jumpCount += 1;

    if (isGroundJump) {
      run.vy = -384 * floodFactor * twJumpFactor;
      run.jumpsLeft = ch.tripleJumpStomp ? 2 : 1;
      run.squashX = 0.84;
      run.squashY = 1.18;
      Renderer.spawnLandDust(run.playerX, run.playerY);
      SFX.jump();
      haptic(10);
      if (inFloodWater && !ch.floodResist) Renderer.spawnFloater('침수 저항!', '#75c4ff', run.playerX, run.playerY - 36);
    } else {
      run.vy = -342 * floodFactor * twJumpFactor;
      run.jumpsLeft = Math.max(0, run.jumpsLeft - 1);
      run.squashX = 0.86;
      run.squashY = 1.15;
      Renderer.spawnDust(run.playerX, run.playerY - 6, true);
      SFX.doubleJump();
      haptic(12);
      const airLabel = (ch.tripleJumpStomp && run.jumpsLeft === 0) ? '3단 점프!' : '2단 점프!';
      Renderer.spawnFloater(airLabel, ch.tripleJumpStomp && run.jumpsLeft === 0 ? '#7ceeff' : '#9be6ff', run.playerX, run.playerY - 40);
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
    const ch = getCharDef(run.charId);
    run.slideInputHeld = true;
    const inAirNow = run.playerY < run.currentFloorY - 2;
    if (inAirNow) {
      if (ch.tripleJumpStomp) {
        // 스키어: 공중 슬라이드 입력 시 즉시 바닥으로 초고속 급강하 (스톰프)!
        run.vy = Math.max(run.vy, 920);
        run.stomping = true;
        run.squashX = 0.82;
        run.squashY = 1.22;
        SFX.fastFall();
        haptic(12);
        Renderer.spawnFloater('급강하 스톰프!', '#7ceeff', run.playerX + 8, run.playerY - 38);
      } else {
        // Snappy Fast-Fall Dive into instant Slide!
        run.vy = Math.max(run.vy, 470);
        run.squashX = 0.86;
        run.squashY = 1.16;
        SFX.fastFall();
        haptic(8);
      }
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
    run.slideInputHeld = false;
    if (run.isTutorial && run.tut && run.tut.autoSlideTimer > 0) {
      return; // Smoothly finish gliding underneath the tutorial cloud even after a quick mobile tap!
    }
    if (run.weatherEvent === 'ice_road') {
      // Ice inertia keeps sliding slightly longer!
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
      const subTxt = run.umbrellaOn ? '제한 시간 안에 우산을 접으세요!' : '맞바람 주의! 슬라이드로 돌파!';
      showWeatherCenterAlert('gust', subTxt);
    } else if (nextW !== 'clear') {
      showWeatherCenterAlert(nextW);
    } else {
      showRunBanner('잠시 숨 고르기', 1800, 'sky', '맑음');
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
      return { spawned: false, retryCd: 0.35 };
    }

    const pool = isCovid
      ? [COVID_WALKER_PRESET]
      : DATA.OBSTACLES_BY_SEASON[run.seasonId];
    let preset = pool[Math.floor(Math.random() * pool.length)];

    // During flood, favor air/tall obstacles over low ground obstacles without stalling spawn cadence!
    if (run.weatherEvent === 'flood' && preset.lane === 'low' && Math.random() < 0.55) {
      const nonLow = pool.filter((p) => p.lane !== 'low');
      if (nonLow.length) {
        preset = nonLow[Math.floor(Math.random() * nonLow.length)];
      } else {
        return { spawned: false, retryCd: 0.22 };
      }
    }

    let startX = getSpawnRight() + (preset.warn ? 44 : 18);
    // 스프링 패드 · 침수 차량 지붕 등 지형 오브젝트와 절대 겹치지 않게 회피!
    if (isRectBlockedByFeature(startX, preset.w, 38)) {
      return { spawned: false, retryCd: 0.24 };
    }
    // 기존 장애물과도 최소 안전 간격 유지!
    if (isRectBlockedByObstacle(startX, preset.w, 82)) {
      return { spawned: false, retryCd: 0.22 };
    }

    const AIR_SLIDE_CLEARANCE = 34;
    let y = Renderer.GROUND_Y - preset.h;
    const extra = {};

    if (preset.lane === 'air') {
      y = Renderer.GROUND_Y - AIR_SLIDE_CLEARANCE - preset.h;
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
        const sy2 = second.lane === 'air' ? Renderer.GROUND_Y - AIR_SLIDE_CLEARANCE - second.h : Renderer.GROUND_Y - second.h;
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
            const sy3 = third.lane === 'air' ? Renderer.GROUND_Y - AIR_SLIDE_CLEARANCE - third.h : Renderer.GROUND_Y - third.h;
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

    return {
      spawned: true,
      extraCd: (comboExtraWidth / Math.max(190, run.speed || 196)) + (isCovid ? 0.35 : 0)
    };
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

      if (run.gameMode === 'today_weather' && run.todayWeather) {
        // Today's Weather Mode: NO season passing or year-cycling — locked strictly to live Seoul weather & season!
        run.year = 1;
        run.seasonIdx = run.todayWeather.seasonIdx;
        run.seasonId = run.todayWeather.seasonId;
        run.prevSeasonId = null;
        run.seasonTransition = 1;
        run.weatherEvent = run.todayWeather.primaryWeather;
        run.pendingWeather = null;
        run.weatherPrepTimer = 0;
      } else {
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
          showRunBanner(`속도 ×${nextDiff.speedMult.toFixed(2)} UP · +${yearGoldBonus}G`, 3000, 'fire', `${run.year}년 차 돌파`);
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
          showRunBanner(`속도 ×${nextDiff.speedMult.toFixed(2)} UP · ${sObj.weatherLabel}`, 2400, 'gold', `${run.year}년 차 ${sObj.name}`);
          Renderer.spawnFloater(`속도 ×${nextDiff.speedMult.toFixed(2)} UP`, '#ffe259', run.playerX + 36, run.playerY - 50);
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
      }
    } else {
      updateTutorialStep(dt);
    }

    // Timers
    if (run.invulnTimer > 0) run.invulnTimer = Math.max(0, run.invulnTimer - dt);
    if (run.magnetTimer > 0) run.magnetTimer = Math.max(0, run.magnetTimer - dt);
    if (run.speedBoostTimer > 0) {
      run.speedBoostTimer = Math.max(0, run.speedBoostTimer - dt);
      if (run.speedBoostTimer <= 0) {
        run.invulnTimer = Math.max(run.invulnTimer || 0, 1.8);
        Renderer.spawnFloater('광속 질주 종료 · 잠시 무적!', '#7ceeff', run.playerX + 10, run.playerY - 46);
      }
    }
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
      if (run.feverTimer <= 0) {
        run.invulnTimer = Math.max(run.invulnTimer || 0, 1.8);
        Renderer.spawnFloater('무적질주 종료 · 잠시 무적!', '#ffe866', run.playerX + 10, run.playerY - 46);
      }
    }

    // In-run shield item expires cleanly after 4.5 seconds with brief grace invincibility
    if (run.shield && !run.shieldFromBooster) {
      run.shieldTimer = Math.max(0, (run.shieldTimer || 0) - dt);
      if (run.shieldTimer <= 0) {
        run.shield = false;
        run.invulnTimer = Math.max(run.invulnTimer || 0, 0.8);
        SFX.umbrellaToggle(false);
        Renderer.spawnFloater('보호막 종료', '#9fd9ff', run.playerX + 10, run.playerY - 42);
      }
    }

    // Umbrella & Mask: Zero Cooldown · Auto-Turn-Off every 10 seconds!
    run.umbrellaCooldown = 0;
    run.maskCooldown = 0;
    if (run.maskParryTimer > 0) run.maskParryTimer = Math.max(0, run.maskParryTimer - dt);
    if (run.umbrellaParryTimer > 0) run.umbrellaParryTimer = Math.max(0, run.umbrellaParryTimer - dt);

    if (run.umbrellaOn) {
      run.umbrellaActiveTimer = Math.max(0, run.umbrellaActiveTimer - dt);
      if (run.umbrellaActiveTimer <= 0) {
        run.umbrellaOn = false;
        run.umbrellaParryTimer = 0;
        run.gustExposeTimer = 0;
        SFX.umbrellaToggle(false);
        Renderer.spawnFloater('우산 자동 해제 (10초 경과)', '#9fd9ff', run.playerX + 10, run.playerY - 42);
      }
    }

    if (run.maskOn) {
      run.maskActiveTimer = Math.max(0, run.maskActiveTimer - dt);
      if (run.maskActiveTimer <= 0) {
        run.maskOn = false;
        run.maskParryTimer = 0;
        SFX.maskToggle(false);
        Renderer.spawnFloater('마스크 자동 해제 (10초 경과)', '#a6ffcf', run.playerX + 10, run.playerY - 42);
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
    let weatherSpeedMult = (run.todayWeather && run.todayWeather.speedMult) ? run.todayWeather.speedMult : 1.0;
    let iceScoreBonus = 1.0;
    if (run.umbrellaOn) weatherSpeedMult *= 0.84; // Umbrella air drag slows runner!
    if (run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2) {
      weatherSpeedMult *= ch.floodResist ? 0.92 : 0.72; // 우비 소년 mitigates flood drag!
    }
    if (run.weatherEvent === 'ice_road' && run.sliding) {
      weatherSpeedMult *= 1.38; // Fast slippery ice slide!
    }
    if (run.weatherEvent === 'gust' && run.sliding) {
      weatherSpeedMult *= 1.12; // Aerodynamic crouch cuts headwind!
    }

    run.speed = run.baseSpeed * diff.speedMult * feverBoost * weatherSpeedMult;
    run.scroll += run.speed * dt;
    run.distanceM = Math.floor(run.scroll / 14);
    run.score += run.speed * dt * 0.16 * run.scoreMult * diff.scoreMult * boostScoreMult;

    // Gust Headwind Horizontal Push-Back vs Slide Push-Forward!
    if (run.weatherEvent === 'gust' && run.feverTimer <= 0) {
      if (run.sliding) {
        run.playerX = Math.min(run.basePlayerX + 10, run.playerX + 72 * dt);
      } else if (run.playerY < run.currentFloorY - 2) {
        run.playerX = Math.max(66, run.playerX - 58 * dt); // Blown back in midair!
      } else {
        run.playerX = Math.max(78, run.playerX - 18 * dt);
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
      run.jumpsLeft = ch.tripleJumpStomp ? 3 : 2;
      run.coyoteTimer = 0.095;
      run.gliding = false;
      run.onPlatform = landedPlatform;
      if (wasAir) {
        if (run.stomping) {
          run.stomping = false;
          triggerCameraShake(3.8, 0.14);
        }
        run.squashX = 1.18;
        run.squashY = 0.84;
        Renderer.spawnLandDust(run.playerX, floorY);
        SFX.land();
        if (run.weatherEvent === 'ice_road' && !landedPlatform) {
          run.iceSlipTimer = 0.28; // Slippery landing on winter ice!
        }
        // Consume 130ms Jump Input Buffer on exact frame-1 landing!
        if (run.jumpBufferTimer > 0) {
          executeJump(true);
        }
      } else {
        run.stomping = false;
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
        run.jumpsLeft = ch.tripleJumpStomp ? 2 : 1;
        run.stomping = false;
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
    if (run.clearSkyTimer > 0) run.clearSkyTimer = Math.max(0, run.clearSkyTimer - dt);
    const twHaz = (run.todayWeather && run.todayWeather.hazards && !(run.clearSkyTimer > 0)) ? run.todayWeather.hazards : null;
    const rainExposeLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustExposeLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    const isRainingNow = run.weatherEvent === 'rain' || run.weatherEvent === 'flood' || Boolean(twHaz && (twHaz.rainActive || twHaz.floodActive));
    const isDustNow = run.weatherEvent === 'dust' || Boolean(twHaz && twHaz.dustActive);
    const isHeatNow = run.weatherEvent === 'heat' || Boolean(twHaz && twHaz.heatActive);

    if (ch.autoGear && !run.isTutorial) {
      const hailIncoming = Boolean(run.hailAttack && (run.hailAttack.phase === 'warn' || run.hailAttack.phase === 'fall'));
      if (run.pendingWeather === 'gust' || run.weatherEvent === 'gust') {
        if (run.umbrellaOn) {
          run.umbrellaOn = false;
          run.umbrellaActiveTimer = 0;
          run.umbrellaParryTimer = 0;
          run.gustExposeTimer = 0;
          SFX.umbrellaToggle(false);
          Renderer.spawnFloater('오토 기어: 우산 자동 접힘!', '#ffcf6e', run.playerX + 8, run.playerY - 46);
        }
      } else if ((isRainingNow || hailIncoming) && !run.umbrellaOn && run.umbrellaBrokenTimer <= 0) {
        run.umbrellaOn = true;
        run.umbrellaActiveTimer = GEAR_DURATION;
        run.umbrellaParryTimer = UMBRELLA_PARRY_WINDOW;
        run.umbrellaCooldown = 0;
        run.rainExposeTimer = 0;
        SFX.umbrellaToggle(true);
        Renderer.spawnFloater('오토 기어: 우산 자동 펼침!', '#8ce0ff', run.playerX + 8, run.playerY - 46);
      }
    }

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
          Renderer.spawnFloater('비 노출! -1 HP (우산 펴기!)', '#6ec6ff', run.playerX + 8, run.playerY - 46);
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
          Renderer.spawnFloater('황사 노출! -1 HP (마스크 착용!)', '#ffd966', run.playerX + 8, run.playerY - 46);
        }
      } else {
        run.dustExposeTimer = 0;
      }

      // 3. Summer Heatwave (폭염): Open Umbrella(양산) to stay cool! Without Umbrella, heat builds -> -1 Heart!
      if (isHeatNow) {
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
            Renderer.spawnFloater('폭염 열사병! -1 HP (우산 펴기!)', '#ff8052', run.playerX + 8, run.playerY - 46);
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
          if (run.playerY < Renderer.GROUND_Y - 18 || run.feverTimer > 0 || run.invulnTimer > 0) {
            if (run.invulnTimer <= 0) {
              run.score += 130;
              SFX.guard();
              Renderer.spawnFloater('물벼락 점프 회피! +130', '#7affb3', run.playerX + 12, run.playerY - 46);
            }
          } else if (run.shield) {
            consumeShieldHit('보호막 물벼락 방어! 잠시 무적!');
          } else {
            run.mudBlindTimer = 2.8;
            SFX.splash();
            run.hp = Math.max(0, run.hp - 1);
            run.hitPoseTimer = 0.45;
            run.hitFlashTimer = 0.25;
            triggerCameraShake(5, 0.22);
            run.lastHitCause = `${run.year}년 차 장마철, 지나가는 차의 흙탕물 물벼락을 맞고 쓰러졌습니다!`;
            Renderer.spawnFloater('물벼락 적중! -1 HP', '#ff9452', run.playerX + 10, run.playerY - 44);
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
            Renderer.spawnFloater('피버! 코로나 격파 +250', '#ffe866', run.playerX + 14, run.playerY - 50);
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
              activateFeverMode(ch, false);
            } else {
              SFX.guard();
            }
            haptic(16);
            Renderer.spawnPickupEffect(run.playerX + 16, run.playerY - 30, '#5effbe', true);
            Renderer.spawnFloater(
              isPerfect ? `완벽 타이밍 차단! +${bonusPts}` : `코로나 차단 성공! +${bonusPts}`,
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
            Renderer.spawnFloater('마스크 방어! (돌진 시 새로 누르면 보너스!)', '#a6ffcf', run.playerX + 14, run.playerY - 48);
          } else if (run.shield) {
            consumeShieldHit('보호막 코로나 방어! 잠시 무적!');
            atk.phase = 'deflected';
            atk.deflectTimer = 0.55;
            atk.vx = 260;
            atk.vy = -240;
          } else if (run.isTutorial) {
            run.hitPoseTimer = 0.3;
            run.hitFlashTimer = 0.2;
            SFX.hit();
            Renderer.spawnFloater('괜찮아요! 마스크 타이밍 다시 한번!', '#ffe866', run.playerX + 14, run.playerY - 48);
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
            Renderer.spawnFloater('코로나 감염! -1 HP (마스크 착용!)', '#ff5c7c', run.playerX + 14, run.playerY - 48);
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

    // ---- SKY HAILSTONE DROP EVENT (BLOCKED BY UMBRELLA!) ----
    if (run.hailAttack) {
      const hAtk = run.hailAttack;
      if (hAtk.phase === 'warn') {
        hAtk.timer -= dt;
        const targetX = run.playerX + 6;
        hAtk.x += (targetX - hAtk.x) * Math.min(1, dt * 8);
        if (hAtk.timer <= 0) {
          hAtk.phase = 'fall';
          hAtk.vy = 430 + run.speed * 0.28;
          hAtk.vx = 0;
          hAtk.checked = false;
          SFX.hailDrop();
        }
      } else if (hAtk.phase === 'fall') {
        hAtk.vy = (hAtk.vy || 430) + 420 * dt;
        hAtk.y += hAtk.vy * dt;
        hAtk.x += (run.playerX + 4 - hAtk.x) * Math.min(1, dt * 4.5);
        if (!hAtk.checked && hAtk.y >= run.playerY - 44) {
          hAtk.checked = true;
          if (run.feverTimer > 0) {
            hAtk.phase = 'deflected';
            hAtk.deflectTimer = 0.55;
            hAtk.vx = 200;
            hAtk.vy = -250;
            run.score += Math.round(250 * run.scoreMult);
            SFX.hailBlock();
            Renderer.spawnPickupEffect(run.playerX + 10, run.playerY - 42, '#ffe866', true);
            Renderer.spawnFloater('피버! 우박 격파 +250', '#ffe866', run.playerX + 10, run.playerY - 56);
          } else if (run.umbrellaOn && run.umbrellaParryTimer > 0) {
            const isPerfect = run.umbrellaParryTimer >= 1.65;
            const bonusPts = isPerfect ? 320 : 240;
            const feverGain = isPerfect ? 14 : 10;
            const twFevMult = (run.todayWeather && run.todayWeather.feverGainMult) ? run.todayWeather.feverGainMult : 1.0;
            hAtk.phase = 'deflected';
            hAtk.deflectTimer = 0.55;
            hAtk.vx = 210;
            hAtk.vy = -260;
            run.score += Math.round(bonusPts * run.scoreMult);
            run.feverCharge = Math.min(100, run.feverCharge + feverGain * twFevMult);
            if (run.feverCharge >= 100 && run.feverTimer <= 0) {
              activateFeverMode(ch, false);
            } else {
              SFX.hailBlock();
            }
            haptic(16);
            Renderer.spawnPickupEffect(run.playerX + 10, run.playerY - 44, '#6beeff', true);
            Renderer.spawnFloater(
              isPerfect ? `우박 완벽 방어! +${bonusPts}` : `우박 차단 성공! +${bonusPts}`,
              '#6beeff',
              run.playerX + 10,
              run.playerY - 56
            );
          } else if (run.umbrellaOn) {
            hAtk.phase = 'deflected';
            hAtk.deflectTimer = 0.5;
            hAtk.vx = 180;
            hAtk.vy = -220;
            run.score += Math.round(120 * run.scoreMult);
            SFX.hailBlock();
            haptic(12);
            Renderer.spawnPickupEffect(run.playerX + 10, run.playerY - 44, '#9beeff', false);
            Renderer.spawnFloater('우박 방어! +120', '#9beeff', run.playerX + 10, run.playerY - 54);
          } else if (run.shield) {
            consumeShieldHit('보호막 우박 방어! 잠시 무적!');
            hAtk.phase = 'deflected';
            hAtk.deflectTimer = 0.55;
            hAtk.vx = 190;
            hAtk.vy = -240;
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
            run.lastHitCause = '하늘에서 떨어진 우박을 우산으로 막지 못해 쓰러졌습니다!';
            Renderer.spawnPickupEffect(run.playerX + 8, run.playerY - 34, '#8be4ff', false);
            Renderer.spawnFloater('우박 적중! -1 HP (우산 펴기!)', '#7ae4ff', run.playerX + 10, run.playerY - 54);
            hAtk.phase = 'deflected';
            hAtk.deflectTimer = 0.35;
            hAtk.vx = -90;
            hAtk.vy = -120;
          }
        }
        if (hAtk.y > Renderer.GROUND_Y + 28) run.hailAttack = null;
      } else if (hAtk.phase === 'deflected') {
        hAtk.x += (hAtk.vx || 200) * dt;
        hAtk.y += (hAtk.vy || -240) * dt;
        hAtk.vy = (hAtk.vy || -240) + 560 * dt;
        hAtk.deflectTimer -= dt;
        if (hAtk.deflectTimer <= 0 || hAtk.y > Renderer.GROUND_Y + 28) {
          run.hailAttack = null;
        }
      }
    } else if (!run.isTutorial && run.seasonId === 'winter' && (run.year || 1) >= 3 && !run.covidAttack && run.weatherEvent !== 'gust' && run.weatherEvent !== 'covid') {
      run.hailAttackCd -= dt;
      if (run.hailAttackCd <= 0) {
        const warnDur = Math.max(1.55, 2.0 / Math.min(1.25, diff.weatherPaceMult));
        run.hailAttackCd = Math.max(5.5, (7.5 + Math.random() * 2.5) / Math.min(1.3, diff.weatherPaceMult));
        run.hailAttack = {
          phase: 'warn',
          timer: warnDur,
          maxTimer: warnDur,
          x: run.playerX + 8,
          y: 28,
          vx: 0,
          vy: 0,
          checked: false,
          stones: [
            { dx: 0, dy: 0, r: 12, spin: 1.0 },
            { dx: -16, dy: -12, r: 9, spin: -1.4 },
            { dx: 15, dy: -10, r: 9, spin: 1.3 }
          ]
        };
        SFX.playWeatherCue('hail');
        showWeatherCenterAlert('hail');
      }
    } else {
      run.hailAttackCd = Math.min(run.hailAttackCd, 3.2);
    }

    // ---- SPAWN TIMERS ----
    if (!run.isTutorial) {
      run.obstacleCd -= dt;
      if (run.obstacleCd <= 0) {
        const waveRes = spawnObstacleWave();
        if (!waveRes || !waveRes.spawned) {
          run.obstacleCd = (waveRes && waveRes.retryCd) || 0.22;
        } else {
          const baseInterval = (run.weatherEvent === 'covid' ? 1.75 : 1.34) / diff.spawnRateMult;
          run.obstacleCd = Math.max(0.48, baseInterval + (Math.random() - 0.35) * 0.22) + (waveRes.extraCd || 0) * 0.68;
        }
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
      const feverMult = (run.todayWeather && run.todayWeather.feverGainMult) ? run.todayWeather.feverGainMult : 1.0;
      run.feverCharge = Math.min(100, run.feverCharge + amount * feverMult);
      if (run.feverCharge >= 100) {
        activateFeverMode(ch, true);
      }
    }

    const hasSuperMagnet = run.feverTimer > 0 || run.magnetTimer > 0;
    const twMagnetBonus = (run.todayWeather && run.todayWeather.magnetBonus) ? run.todayWeather.magnetBonus : 0;
    const magnetRadius = (hasSuperMagnet ? 145 : 24) + twMagnetBonus;

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
          Renderer.spawnFloater('스피드 부스트! (4초 무적 질주)', '#66f2ff', run.playerX + 16, run.playerY - 46);
        } else if (it.kind === 'shield_item') {
          run.shield = true;
          run.shieldFromBooster = false;
          run.shieldTimer = 4.5;
          run.shieldMaxTimer = 4.5;
          run.itemPoseTimer = 0.45;
          SFX.shieldUp();
          Renderer.spawnPickupEffect(it.x, it.y, '#7ad8ff', true);
          Renderer.spawnFloater('보호막 획득! (4.5초)', '#8ce2ff', run.playerX + 12, run.playerY - 44);
        } else if (it.kind === 'chest_wood' || it.kind === 'chest_silver' || it.kind === 'chest_gold' || it.kind === 'chest_diamond') {
          const tierId = it.kind.replace('chest_', '');
          const chestDef = DATA.CHESTS[tierId] || DATA.CHESTS.wood;
          save.chestBag = save.chestBag || { wood: 0, silver: 0, gold: 0, diamond: 0 };
          save.chestBag[tierId] = (save.chestBag[tierId] || 0) + 1;
          persistSave();
          const tierIco = '';
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
          const bonusSc = 120;
          const feverGain = 6;
          run.heatGauge = Math.max(0, run.heatGauge - 25);
          run.score += Math.round(bonusSc * run.scoreMult);
          addFeverCharge(feverGain);
          run.itemPoseTimer = 0.55;
          SFX.heal();
          Renderer.spawnPickupEffect(it.x, it.y, '#70f59b', true);
          Renderer.spawnFloater(
            `이온음료! +${bonusSc} · 피버+${feverGain}%`,
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

      // For higher slide-under aerial obstacles, standing upper-body hitbox still catches non-sliding players cleanly while sliding clears effortlessly!
      const hitPBox = (!run.sliding && ob.lane === 'air')
        ? { x: pBox.x, y: run.playerY - 44, w: pBox.w, h: 40 }
        : pBox;
      const overlap =
        !isHarmlessTelegraph &&
        hitPBox.x < oBox.x + oBox.w &&
        hitPBox.x + hitPBox.w > oBox.x &&
        hitPBox.y < oBox.y + oBox.h &&
        hitPBox.y + hitPBox.h > oBox.y;

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
        if (ch.nearMissShield && !ob.nearMissed && ob.x + ob.w < pBox.x) {
          ob.nearMissed = true;
          const vertDist = Math.min(Math.abs(pBox.y - (oBox.y + oBox.h)), Math.abs((pBox.y + pBox.h) - oBox.y));
          if (vertDist < 34) {
            run.nearMissGauge = (run.nearMissGauge || 0) + 1;
            if (run.nearMissGauge >= 5) {
              run.nearMissGauge = 0;
              run.shield = true;
              run.shieldFromBooster = false;
              run.shieldTimer = 4.5;
              run.shieldMaxTimer = 4.5;
              SFX.guard();
              Renderer.spawnPickupEffect(run.playerX + 12, run.playerY - 30, '#ffe27a', true);
              Renderer.spawnFloater('아슬아슬 보호막 발동! (4.5초)', '#ffe27a', run.playerX + 12, run.playerY - 48);
            } else {
              SFX.coin();
              Renderer.spawnFloater(`회피 게이지 ${run.nearMissGauge}/5`, '#ffe27a', run.playerX + 10, run.playerY - 44);
            }
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
    run.umbrellaParryTimer = 0;
    run.maskOn = false;
    run.maskParryTimer = 0;
    run.covidAttack = null;
    run.hailAttack = null;
    releaseAllControlButtons();
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    if (el.runWeatherBar) el.runWeatherBar.classList.add('hidden');
    if (el.ctrlCenterOrbs) el.ctrlCenterOrbs.classList.add('hidden');
    el.runCanvasWrap.classList.remove('fever-active');
    SFX.setWeatherAmbient('clear');
    SFX.setAmbientPaused(false);
    SFX.setBgmMode('menu');
    SFX.fail();
    triggerCameraShake(8, 0.3);
  }

  function consumeShieldHit(msg = '보호막 방어! 잠시 무적') {
    if (!run || !run.shield) return false;
    run.shield = false;
    run.shieldFromBooster = false;
    run.shieldTimer = 0;
    run.invulnTimer = Math.max(run.invulnTimer || 0, 1.2);
    run.hitStopTimer = 0.04;
    SFX.guard();
    haptic(18);
    Renderer.spawnPickupEffect(run.playerX + 14, run.playerY - 30, '#82e2ff', true);
    Renderer.spawnFloater(msg, '#82e2ff', run.playerX + 12, run.playerY - 46);
    return true;
  }

  function handleObstacleHit(ob, ch) {
    if (run.isTutorial) {
      run.invulnTimer = 0.7;
      run.hitPoseTimer = 0.28;
      run.hitFlashTimer = 0.2;
      run.sliding = false;
      SFX.hit();
      Renderer.spawnFloater('괜찮아요! 다시 한번 해봐요!', '#ffe866', run.playerX + 14, run.playerY - 48);
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
      consumeShieldHit('보호막 방어! 잠시 무적!');
      return;
    }

    // Every obstacle hit deducts 1 heart (no score deduction!)
    run.hp = Math.max(0, run.hp - 1);
    run.invulnTimer = 1.5;
    run.hitPoseTimer = 0.45;
    run.hitFlashTimer = 0.3;
    run.hitStopTimer = 0.055;
    run.squashX = 1.24;
    run.squashY = 0.78;
    run.dodgeCombo = 0;
    run.nearMissGauge = 0;
    triggerCameraShake(7, 0.28);
    haptic(35);

    const seasonName = DATA.SEASONS[run.seasonIdx].name;
    if (run.weatherEvent === 'ice_road') {
      run.lastHitCause = `${run.year}년 차 겨울 빙판에서 미끄러져 '${ob.name}'에 부딪혔습니다!`;
    } else {
      run.lastHitCause = `${run.year}년 차 ${seasonName}, '${ob.name}'에 부딪혀 쓰러졌습니다!`;
    }

    SFX.hit();
    Renderer.spawnFloater('-1 HP', '#ff5c5c', run.playerX, run.playerY - 44);
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

  function hudHtml(key, node, rawKey, htmlStr) {
    if (!node || hudCache[key] === rawKey) return;
    hudCache[key] = rawKey;
    node.innerHTML = htmlStr;
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

    const isTodayWeather = run.gameMode === 'today_weather' && Boolean(run.todayWeather);
    if (isTodayWeather) {
      hudText('yr', el.runYearNum, 'LIVE');
      hudClass('yrCls', el.runYearNum, 'portrait-yr-badge yr-live');
    } else {
      hudText('yr', el.runYearNum, `${run.year}Y`);
      const yrTier = run.year >= 4 ? 'yr-4' : (run.year === 3 ? 'yr-3' : (run.year === 2 ? 'yr-2' : 'yr-1'));
      hudClass('yrCls', el.runYearNum, `portrait-yr-badge ${yrTier}`);
    }
    hudToggle('seasonBarHide', el.runSeasonExpWrap, 'hidden', isTodayWeather);
    if (doSlow) {
      let seasonLbl;
      if (run.isTutorial) {
        seasonLbl = '실전 튜토리얼';
      } else if (isTodayWeather) {
        const snap = run.todayWeather.snapshot;
        seasonLbl = `${snap.cityName} ${Math.round(snap.tempC)}°C · ${run.todayWeather.desc.label} · ×${diff.speedMult.toFixed(2)}`;
      } else {
        seasonLbl = `${run.year}년 차 ${seasonObj.name} · ×${diff.speedMult.toFixed(2)}`;
      }
      hudText('seasonLbl', el.runSeasonLabel, seasonLbl);
      const scoreInt = Math.floor(run.score);
      const scoreKey = `${run.distanceM}|${scoreInt}`;
      if (hudCache._scoreKey !== scoreKey) {
        hudCache._scoreKey = scoreKey;
        el.runScoreText.innerHTML = `<span class="bs-score-dist">${run.distanceM.toLocaleString('ko-KR')}m</span><span class="bs-score-sep" aria-hidden="true"></span><span class="bs-score-pts">${scoreInt.toLocaleString('ko-KR')}점</span>`;
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
        heartHtml += uiIcon('heart', 'heart', i < curHp ? 'heart-unit' : 'heart-unit empty');
      }
      el.runHearts.innerHTML = heartHtml;
    }

    // Rainbow FEVER & Year Progress Gauges (throttled ~15Hz to skip per-frame layout reflow!)
    if (doSlow) {
      const feverPct = Math.max(0, Math.min(100, run.feverCharge));
      hudWidth('fevW', el.runFeverFill, `${feverPct.toFixed(1)}%`);
      hudText(
        'fevT',
        el.runFeverText,
        run.feverTimer > 0 ? `FEVER! ${run.feverTimer.toFixed(1)}s` : `FEVER ${Math.floor(feverPct)}%`
      );
      if (!isTodayWeather) {
        const yearPct = ((run.elapsed % DATA.YEAR_DURATION) / DATA.YEAR_DURATION) * 100;
        hudWidth('yrW', el.runYearFill, `${yearPct.toFixed(1)}%`);
      }
    }

    // Colored Screen-Edge Vignette + Minimal Non-Duplicate Action Chip (No long competing prose!)
    const rainLimit = Math.max(1.8, (run.weatherEvent === 'flood' ? 4.0 : 3.0) - diff.exposureGracePenalty) + (ch.rainGraceBonus || 0);
    const dustLimit = Math.max(1.8, 3.0 - diff.exposureGracePenalty);
    const gustLimit = Math.max(1.8, 2.8 - diff.exposureGracePenalty);

    const activeEv = run.weatherEvent || 'clear';
    const twHazHud = (run.todayWeather && run.todayWeather.hazards && !(run.clearSkyTimer > 0)) ? run.todayWeather.hazards : null;
    const incomingEv = (run.pendingWeather && run.pendingWeather !== 'clear') ? run.pendingWeather : null;
    const covidUrgent = Boolean(
      run.covidAttack &&
      (run.covidAttack.phase === 'warn' || run.covidAttack.phase === 'charge') &&
      !run.covidAttack.checked &&
      run.feverTimer <= 0
    );
    const hailUrgent = Boolean(
      run.hailAttack &&
      (run.hailAttack.phase === 'warn' || run.hailAttack.phase === 'fall') &&
      !run.hailAttack.checked &&
      run.feverTimer <= 0
    );
    const needCovidMask = covidUrgent && !(run.maskOn && run.maskParryTimer > 0);
    const needHailUmb = hailUrgent && !run.umbrellaOn;
    const needFoldUmb = activeEv === 'gust' && run.umbrellaOn && run.feverTimer <= 0;
    const hudRainNow = activeEv === 'rain' || activeEv === 'flood' || Boolean(twHazHud && (twHazHud.rainActive || twHazHud.floodActive));
    const hudHeatNow = activeEv === 'heat' || Boolean(twHazHud && twHazHud.heatActive);
    const hudDustNow = activeEv === 'dust' || Boolean(twHazHud && twHazHud.dustActive);
    const needOpenUmb = needHailUmb || ((hudRainNow || hudHeatNow) && !run.umbrellaOn && run.feverTimer <= 0);
    const needOpenMask = hudDustNow && !run.maskOn && run.feverTimer <= 0;

    // 1. Colored Screen-Edge Vignette (instant peripheral weather cue!)
    if (el.weatherEdgeVignette) {
      const vigEv = covidUrgent ? 'covid_rush' : (hailUrgent ? 'hail' : (activeEv !== 'clear' ? activeEv : ''));
      const vigUrgent = needCovidMask || needHailUmb || needFoldUmb || needOpenUmb || needOpenMask || (activeEv === 'heat' && run.heatGauge >= 60);
      const vigCls = vigEv
        ? `weather-edge-vignette ev-${vigEv}${vigUrgent ? ' urgent' : ''}`
        : 'weather-edge-vignette hidden';
      hudClass('wVigCls', el.weatherEdgeVignette, vigCls);
    }

    // 2. Compact Top Action Timer Chip (hidden while center icon alert is flashing — zero duplication!)
    if (el.runWeatherBar) {
      let chipBadge = '';
      let chipTimer = '';
      let chipUrgent = false;

      if (covidUrgent) {
        chipBadge = needCovidMask ? `${uiIcon('mask', 'sm')} 마스크!` : `${uiIcon('check', 'sm')} 차단 완료`;
        chipTimer = needCovidMask
          ? (run.covidAttack.phase === 'warn' ? `${Math.max(0, run.covidAttack.timer).toFixed(1)}s` : 'NOW!')
          : '';
        chipUrgent = needCovidMask;
      } else if (hailUrgent) {
        chipBadge = needHailUmb ? `${uiIcon('umbrella', 'sm')} 우박 · 우산!` : `${uiIcon('check', 'sm')} 우박 방어 완료`;
        chipTimer = needHailUmb
          ? (run.hailAttack.phase === 'warn' ? `${Math.max(0, run.hailAttack.timer).toFixed(1)}s` : 'NOW!')
          : '';
        chipUrgent = needHailUmb;
      } else if (needFoldUmb) {
        const rem = Math.max(0, gustLimit - (run.gustExposeTimer || 0));
        chipBadge = `${uiIcon('umbrella', 'sm')} 강풍 · 우산 접기!`;
        chipTimer = `${rem.toFixed(1)}s`;
        chipUrgent = true;
      } else if (needOpenUmb && hudRainNow) {
        const rem = Math.max(0, rainLimit - (run.rainExposeTimer || 0));
        chipBadge = `${uiIcon('umbrella', 'sm')} 우산!`;
        chipTimer = `${rem.toFixed(1)}s`;
        chipUrgent = rem <= 1.4;
      } else if (needOpenMask) {
        const rem = Math.max(0, dustLimit - (run.dustExposeTimer || 0));
        chipBadge = `${uiIcon('mask', 'sm')} 마스크!`;
        chipTimer = `${rem.toFixed(1)}s`;
        chipUrgent = rem <= 1.4;
      } else if (hudHeatNow && !run.umbrellaOn) {
        chipBadge = `${uiIcon('umbrella', 'sm')} 폭염 · 우산!`;
        chipTimer = `${Math.round(run.heatGauge)}%`;
        chipUrgent = run.heatGauge >= 60;
      } else if (run.heatGauge > 15 && !run.umbrellaOn) {
        chipBadge = '열기 주의';
        chipTimer = `${Math.round(run.heatGauge)}%`;
        chipUrgent = run.heatGauge >= 75;
      } else if (incomingEv && activeEv === 'clear') {
        const nextMeta = WEATHER_ALERT_META[incomingEv];
        const sec = Math.max(0.1, run.weatherPrepTimer || 0).toFixed(1);
        const ico = nextMeta && nextMeta.iconKey ? `${uiIcon(nextMeta.iconKey, 'sm')} ` : '';
        chipBadge = nextMeta ? `${ico}${nextMeta.title}` : '기상 주의';
        chipTimer = `${sec}s`;
      }

      if ((weatherAlertActive || chipUrgent) && runBannerActive) {
        runBannerActive = false;
        if (el.runBanner) el.runBanner.classList.add('hidden');
      }
      const showChip = Boolean(chipBadge) && !weatherAlertActive && (!runBannerActive || chipUrgent);
      const barJustShown = showChip && hudCache.wBarHide !== false;
      hudToggle('wBarHide', el.runWeatherBar, 'hidden', !showChip);
      hudToggle('wBarUrg', el.runWeatherBar, 'urgent-danger', chipUrgent);
      if (showChip && (barJustShown || doSlow || covidUrgent || hailUrgent || needFoldUmb || hudCache.wBadge !== chipBadge)) {
        hudHtml('wBadge', el.weatherStatusBadge, chipBadge, chipBadge);
        hudToggle('fcHide', el.fcHeatPill, 'hidden', !chipTimer);
        hudToggle('fcUrg', el.fcHeatPill, 'urgent', chipUrgent);
        if (chipTimer) hudText('fcTxt', el.fcHeatPill, chipTimer);
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

    // Dynamic Active-Only Bottom Buff Bar with Live Remaining-Time Gauges (hidden when no buff is active!)
    const fevActive = run.feverTimer > 0;
    const spdActive = run.speedBoostTimer > 0;
    const magActive = run.magnetTimer > 0 || fevActive;
    const shdActive = Boolean(run.shield);
    const anyBuff = fevActive || spdActive || magActive || shdActive;

    hudToggle('orbsHide', el.ctrlCenterOrbs, 'hidden', !anyBuff);
    hudToggle('orbFev', el.orbUiFever, 'active', fevActive);
    hudToggle('orbSpd', el.orbUiSpeed, 'active', spdActive);
    hudToggle('orbMag', el.orbUiMagnet, 'active', magActive);
    hudToggle('orbShd', el.orbUiShield, 'active', shdActive);
    if (anyBuff && doSlow) {
      if (fevActive) {
        hudWidth('orbBarFev', el.orbBarFever, `${Math.max(0, Math.min(100, (run.feverTimer / 4.5) * 100)).toFixed(1)}%`);
      }
      if (spdActive) {
        hudWidth('orbBarSpd', el.orbBarSpeed, `${Math.max(0, Math.min(100, (run.speedBoostTimer / 4.0) * 100)).toFixed(1)}%`);
      }
      if (magActive) {
        const magPct = Math.max(
          run.magnetTimer > 0 ? (run.magnetTimer / 6.0) * 100 : 0,
          fevActive ? (run.feverTimer / 4.5) * 100 : 0
        );
        hudWidth('orbBarMag', el.orbBarMagnet, `${Math.max(0, Math.min(100, magPct)).toFixed(1)}%`);
      }
      if (shdActive) {
        const shdPct = (!run.shieldFromBooster && run.shieldTimer > 0)
          ? Math.max(0, Math.min(100, (run.shieldTimer / (run.shieldMaxTimer || 4.5)) * 100))
          : 100;
        hudWidth('orbBarShd', el.orbBarShield, `${shdPct.toFixed(1)}%`);
      }
    }
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
    if (el.runWeatherBar) el.runWeatherBar.classList.add('hidden');
    if (el.ctrlCenterOrbs) el.ctrlCenterOrbs.classList.add('hidden');
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

    const isTodayWeatherRun = run.gameMode === 'today_weather';
    const prevBest = save.bestScore || 0;
    const isOverallNewBest = !isTodayWeatherRun && finalScore > prevBest;
    if (isOverallNewBest) save.bestScore = finalScore;
    if (!isTodayWeatherRun && finalDist > (save.bestDistanceM || 0)) save.bestDistanceM = finalDist;
    if (!isTodayWeatherRun && run.year > save.bestYear) save.bestYear = run.year;
    save.totalCoinsEver = (save.totalCoinsEver || 0) + (run.coinsCollected || 0);
    if ((run.maxDodgeCombo || 0) > (save.maxDodgeComboEver || 0)) {
      save.maxDodgeComboEver = run.maxDodgeCombo;
    }
    save.gold += totalGoldEarned;
    save.playCount += 1;

    // Split Online Ranking Submission: 일반모드 (주간) vs 오늘의 날씨모드 (일간)
    let displayBest = save.bestScore || 0;
    let displayNewBest = isOverallNewBest;
    if (isTodayWeatherRun) {
      ensureDailyWeatherRankToday();
      const prevDailyBest = (save.dailyWeatherRank && save.dailyWeatherRank.bestScore) || 0;
      displayNewBest = finalScore > prevDailyBest;
      if (displayNewBest) {
        const snap = run.todayWeather && run.todayWeather.snapshot;
        const desc = run.todayWeather && run.todayWeather.desc;
        save.dailyWeatherRank.bestScore = finalScore;
        save.dailyWeatherRank.bestDist = finalDist;
        save.dailyWeatherRank.bestYear = run.year || 1;
        save.dailyWeatherRank.cityName = snap ? snap.cityName : '서울';
        save.dailyWeatherRank.weatherTag = (snap && desc) ? `${snap.cityName} ${desc.icon}${Math.round(snap.tempC)}°C` : '서울';
      }
      displayBest = save.dailyWeatherRank.bestScore || finalScore;
    } else {
      ensureWeeklyRankCurrentWeek();
      if (finalScore > (save.weeklyRank.bestScore || 0)) {
        save.weeklyRank.bestScore = finalScore;
        save.weeklyRank.bestDist = finalDist;
        save.weeklyRank.bestYear = run.year || 1;
      }
    }

    // Normal Play Wood Chest Acquisition Path: 400m+ grants 1 Wood Chest into Vault (up to 3/day)
    let gotWoodChest = false;
    if (finalDist >= 400 && (save.dailyWoodChestDrops.count || 0) < 3) {
      save.dailyWoodChestDrops.count = (save.dailyWoodChestDrops.count || 0) + 1;
      save.chestBag.wood = (save.chestBag.wood || 0) + 1;
      gotWoodChest = true;
    }

    persistSave(true);
    if (isTodayWeatherRun) {
      syncMyDailyWeatherScore();
    } else {
      syncMyWeeklyScore();
    }

    if (el.resBestScore) {
      el.resBestScore.textContent = `${displayBest.toLocaleString('ko-KR')}점`;
    }
    if (el.resNewBest) {
      el.resNewBest.classList.toggle('hidden', !displayNewBest);
    }
    el.resScore.textContent = `${finalScore.toLocaleString('ko-KR')}점`;
    el.gameoverOverlay.classList.remove('hidden');

    if (gotWoodChest) {
      showToast(`400m 돌파! 나무 상자를 획득했습니다! (보관함 · 오늘 ${save.dailyWoodChestDrops.count}/3)`);
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
    if (dockAutoHideTimer) {
      clearTimeout(dockAutoHideTimer);
      dockAutoHideTimer = null;
    }
    releaseAllControlButtons();
    clearTutorialHighlights();
    if (el.tutRunHud) el.tutRunHud.classList.add('hidden');
    if (el.tutCompleteOverlay) el.tutCompleteOverlay.classList.add('hidden');
    el.mudOverlay.classList.add('hidden');
    hideWeatherCenterAlert();
    if (el.runWeatherBar) el.runWeatherBar.classList.add('hidden');
    if (el.ctrlCenterOrbs) el.ctrlCenterOrbs.classList.add('hidden');
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
            showToast(`렌더 복구: ${(err && err.message) || '스킨 로드 중'}`);
          }
        }
      }
    } else {
      if (currentTab === 'home') updateHomeRunningHero(t);
      updateDetailRunningHero(t);
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
      el.btnHeaderProfile.addEventListener('click', openProfileEditModal);
    }
    if (el.btnHeaderProfileName) {
      el.btnHeaderProfileName.addEventListener('click', openProfileEditModal);
    }
    if (el.btnCloseProfileEdit) {
      el.btnCloseProfileEdit.addEventListener('click', () => {
        SFX.click();
        if (el.profileEditOverlay) el.profileEditOverlay.classList.add('hidden');
      });
    }
    if (el.profileEditOverlay) {
      el.profileEditOverlay.addEventListener('click', (e) => {
        if (e.target === el.profileEditOverlay) el.profileEditOverlay.classList.add('hidden');
      });
    }
    document.querySelectorAll('.prof-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        currentProfileTab = btn.dataset.proftab || 'icons';
        renderProfileEditModal();
      });
    });
    if (el.btnProfSaveNick) {
      el.btnProfSaveNick.addEventListener('click', () => {
        if (el.profNicknameInput) saveNicknameValue(el.profNicknameInput.value);
      });
    }
    if (el.btnProfOpenAccount) {
      el.btnProfOpenAccount.addEventListener('click', () => {
        SFX.click();
        if (el.profileEditOverlay) el.profileEditOverlay.classList.add('hidden');
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
    if (el.btnHomeSeasonPass) {
      el.btnHomeSeasonPass.addEventListener('click', openSeasonPassModal);
    }
    if (el.btnCloseSeasonPass) {
      el.btnCloseSeasonPass.addEventListener('click', () => {
        SFX.click();
        closeSeasonPassSkipModal();
        if (el.seasonPassOverlay) el.seasonPassOverlay.classList.add('hidden');
      });
    }
    if (el.seasonPassOverlay) {
      el.seasonPassOverlay.addEventListener('click', (e) => {
        if (e.target === el.seasonPassOverlay) {
          closeSeasonPassSkipModal();
          el.seasonPassOverlay.classList.add('hidden');
        }
      });
    }
    if (el.btnSpClaimAll) {
      el.btnSpClaimAll.addEventListener('click', claimAllSeasonPassRewards);
    }
    if (el.btnSpSkipTier) {
      el.btnSpSkipTier.addEventListener('click', () => {
        SFX.click();
        skipSeasonPassTier();
      });
    }
    if (el.btnCloseSpSkip) {
      el.btnCloseSpSkip.addEventListener('click', () => {
        SFX.click();
        closeSeasonPassSkipModal();
      });
    }
    if (el.btnSpSkipCancel) {
      el.btnSpSkipCancel.addEventListener('click', () => {
        SFX.click();
        closeSeasonPassSkipModal();
      });
    }
    if (el.btnSpSkipConfirm) {
      el.btnSpSkipConfirm.addEventListener('click', confirmSeasonPassSkip);
    }
    if (el.spSkipOverlay) {
      el.spSkipOverlay.addEventListener('click', (e) => {
        if (e.target === el.spSkipOverlay) closeSeasonPassSkipModal();
      });
    }
    if (el.spTrack) {
      el.spTrack.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.spTrack.scrollWidth > el.spTrack.clientWidth) {
          e.preventDefault();
          el.spTrack.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
    if (el.btnSpTabRewards) {
      el.btnSpTabRewards.addEventListener('click', () => {
        if (currentSpTab === 'rewards') return;
        SFX.click();
        currentSpTab = 'rewards';
        renderSeasonPassModal();
      });
    }
    if (el.btnSpTabMissions) {
      el.btnSpTabMissions.addEventListener('click', () => {
        if (currentSpTab === 'missions') return;
        SFX.click();
        currentSpTab = 'missions';
        renderSeasonPassModal();
      });
    }
    if (el.btnBuyGoldPass) {
      el.btnBuyGoldPass.addEventListener('click', openGoldPassPurchase);
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

    // Online Live Ranking Refresh + Mode Switch + Live Countdown + Auto Poll
    if (el.btnRankModeNormal) {
      el.btnRankModeNormal.addEventListener('click', () => {
        SFX.click();
        setRankModeTab('normal');
      });
    }
    if (el.btnRankModeToday) {
      el.btnRankModeToday.addEventListener('click', () => {
        SFX.click();
        setRankModeTab('today_weather');
      });
    }
    if (el.btnRankRefresh) {
      el.btnRankRefresh.addEventListener('click', async () => {
        SFX.click();
        if (rankModeTab === 'today_weather') await syncMyDailyWeatherScore();
        else await syncMyWeeklyScore();
        await renderRankingTab();
        showToast('온라인 실시간 랭킹이 갱신되었습니다!');
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

    // Brawl Stars Right-Dock Weather Button (below Settings) + Weather Modal + Mode Select Modal
    if (el.btnHomeWeather) {
      el.btnHomeWeather.addEventListener('click', openWeatherModal);
    }
    if (el.btnCloseWeather) {
      el.btnCloseWeather.addEventListener('click', () => {
        SFX.click();
        closeWeatherModal();
      });
    }
    if (el.weatherOverlay) {
      el.weatherOverlay.addEventListener('click', (e) => {
        if (e.target === el.weatherOverlay) closeWeatherModal();
      });
    }
    if (el.btnWeatherRefresh) {
      el.btnWeatherRefresh.addEventListener('click', async () => {
        SFX.click();
        await refreshLiveWeatherUI(true);
        showToast('기상청 실시간 날씨가 갱신되었습니다!');
      });
    }
    if (el.btnWeatherPlayToday) {
      el.btnWeatherPlayToday.addEventListener('click', () => {
        SFX.click();
        closeWeatherModal();
        selectedGameMode = 'today_weather';
        const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
        if (isCharUnlocked(ch.id)) {
          save.selectedChar = ch.id;
          persistSave();
        }
        startRun({ mode: 'today_weather' });
      });
    }

    if (el.btnCloseModeSelect) {
      el.btnCloseModeSelect.addEventListener('click', () => {
        SFX.click();
        closeModeSelectModal();
      });
    }
    if (el.modeSelectOverlay) {
      el.modeSelectOverlay.addEventListener('click', (e) => {
        if (e.target === el.modeSelectOverlay) closeModeSelectModal();
      });
    }
    if (el.btnSelectModeNormal) {
      el.btnSelectModeNormal.addEventListener('click', () => {
        SFX.click();
        try { tryAutoLockLandscape(true); } catch {}
        closeModeSelectModal();
        selectedGameMode = 'normal';
        startRun({ mode: 'normal' });
      });
    }
    if (el.btnSelectModeToday) {
      el.btnSelectModeToday.addEventListener('click', () => {
        SFX.click();
        try { tryAutoLockLandscape(true); } catch {}
        closeModeSelectModal();
        selectedGameMode = 'today_weather';
        startRun({ mode: 'today_weather' });
      });
    }
    if (el.btnModeOpenRank) {
      el.btnModeOpenRank.addEventListener('click', () => {
        SFX.click();
        closeModeSelectModal();
        rankModeTab = 'normal';
        switchTab('rank');
      });
    }
    if (el.btnModeOpenWeather) {
      el.btnModeOpenWeather.addEventListener('click', () => {
        closeModeSelectModal();
        openWeatherModal();
      });
    }

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
    if (el.btnVaultOpenAll) {
      el.btnVaultOpenAll.addEventListener('click', () => {
        openVaultChestsBatch('all');
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
    const closeVaultBatch = () => {
      SFX.click();
      if (el.vaultBatchOverlay) el.vaultBatchOverlay.classList.add('hidden');
    };
    if (el.btnVaultBatchClose) el.btnVaultBatchClose.addEventListener('click', closeVaultBatch);
    if (el.btnVaultBatchX) el.btnVaultBatchX.addEventListener('click', closeVaultBatch);
    if (el.vaultBatchOverlay) {
      el.vaultBatchOverlay.addEventListener('click', (e) => {
        if (e.target === el.vaultBatchOverlay) closeVaultBatch();
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
    if (el.btnCloseSkinExchange) {
      el.btnCloseSkinExchange.addEventListener('click', closeSkinExchangeModal);
    }
    if (el.skinExchangeOverlay) {
      el.skinExchangeOverlay.addEventListener('click', (e) => {
        if (e.target === el.skinExchangeOverlay) closeSkinExchangeModal();
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
    if (el.btnDetailSkins) {
      el.btnDetailSkins.addEventListener('click', openCharSkinsModal);
    }
    if (el.btnCloseCharSkins) {
      el.btnCloseCharSkins.addEventListener('click', closeCharSkinsModal);
    }
    if (el.charSkinsOverlay) {
      el.charSkinsOverlay.addEventListener('click', (e) => {
        if (e.target === el.charSkinsOverlay) closeCharSkinsModal();
      });
    }
    if (el.btnDetailHome) {
      el.btnDetailHome.addEventListener('click', () => {
        closeCharDetail();
        switchTab('home');
      });
    }
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

    // Brawl Stars Style Control Layout Editor (Jump / Slide / Umbrella / Mask Size & Position)
    let ctrlEdDraft = null;
    let ctrlEdSelected = 'jump';
    let ctrlEdReturnSettings = false;
    let ctrlEdDrag = null;
    const ctrlEdNodes = el.ctrlEdStage ? Array.from(el.ctrlEdStage.querySelectorAll('.ctrl-ed-node')) : [];

    function selectCtrlEdButton(id) {
      if (!CTRL_LAYOUT_KEYS.includes(id)) id = 'jump';
      ctrlEdSelected = id;
      ctrlEdNodes.forEach((node) => {
        node.classList.toggle('selected', node.dataset.ctrlId === id);
      });
      if (el.ctrlEdSelectedName) {
        el.ctrlEdSelectedName.textContent = CTRL_LAYOUT_LABELS[id] || id;
      }
      if (ctrlEdDraft && ctrlEdDraft[id]) {
        const pct = Math.round(clampCtrlVal(ctrlEdDraft[id].scale, 0.6, 1.5, 1) * 100);
        if (el.rngCtrlSize) el.rngCtrlSize.value = String(pct);
        if (el.lblCtrlSize) el.lblCtrlSize.textContent = pct + '%';
      }
    }

    function renderCtrlEdNodes() {
      if (!ctrlEdDraft) return;
      ctrlEdNodes.forEach((node) => {
        const id = node.dataset.ctrlId;
        const cfg = ctrlEdDraft[id];
        if (!cfg) return;
        node.style.left = cfg.x + '%';
        node.style.top = cfg.y + '%';
        node.style.setProperty('--btn-scale', String(cfg.scale));
      });
      selectCtrlEdButton(ctrlEdSelected);
    }

    function openControlEditor() {
      if (!el.ctrlEditorOverlay) return;
      ctrlEdDraft = normalizeControlLayout(save.controlLayout);
      ctrlEdReturnSettings = Boolean(el.settingsOverlay && !el.settingsOverlay.classList.contains('hidden'));
      if (el.settingsOverlay) el.settingsOverlay.classList.add('hidden');
      el.ctrlEditorOverlay.classList.remove('hidden');
      renderCtrlEdNodes();
    }

    function closeControlEditor(reopenSettings) {
      ctrlEdDrag = null;
      if (el.ctrlEditorOverlay) el.ctrlEditorOverlay.classList.add('hidden');
      if (reopenSettings && ctrlEdReturnSettings && el.settingsOverlay) {
        renderSettingsUI();
        el.settingsOverlay.classList.remove('hidden');
      }
    }

    if (el.btnOpenCtrlEditor) {
      el.btnOpenCtrlEditor.addEventListener('click', () => {
        SFX.click();
        openControlEditor();
      });
    }

    ctrlEdNodes.forEach((node) => {
      const id = node.dataset.ctrlId;
      node.addEventListener('pointerdown', (e) => {
        if (!ctrlEdDraft || !el.ctrlEdStage) return;
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        selectCtrlEdButton(id);
        const rect = el.ctrlEdStage.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        const cfg = ctrlEdDraft[id] || DEFAULT_CONTROL_LAYOUT[id];
        const centerX = rect.left + (cfg.x / 100) * rect.width;
        const centerY = rect.top + (cfg.y / 100) * rect.height;
        ctrlEdDrag = {
          id,
          pointerId: e.pointerId,
          offsetX: e.clientX - centerX,
          offsetY: e.clientY - centerY
        };
        try { node.setPointerCapture(e.pointerId); } catch {}
      });

      node.addEventListener('pointermove', (e) => {
        if (!ctrlEdDrag || ctrlEdDrag.id !== id || ctrlEdDrag.pointerId !== e.pointerId || !ctrlEdDraft || !el.ctrlEdStage) return;
        e.preventDefault();
        const rect = el.ctrlEdStage.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        const cx = e.clientX - ctrlEdDrag.offsetX;
        const cy = e.clientY - ctrlEdDrag.offsetY;
        const xPct = Math.round(Math.max(6, Math.min(94, ((cx - rect.left) / rect.width) * 100)) * 10) / 10;
        const yPct = Math.round(Math.max(22, Math.min(92, ((cy - rect.top) / rect.height) * 100)) * 10) / 10;
        ctrlEdDraft.customized = true;
        ctrlEdDraft[id].x = xPct;
        ctrlEdDraft[id].y = yPct;
        node.style.left = xPct + '%';
        node.style.top = yPct + '%';
      });

      const endCtrlDrag = (e) => {
        if (!ctrlEdDrag || ctrlEdDrag.pointerId !== e.pointerId) return;
        ctrlEdDrag = null;
        try { node.releasePointerCapture(e.pointerId); } catch {}
      };
      node.addEventListener('pointerup', endCtrlDrag);
      node.addEventListener('pointercancel', endCtrlDrag);
    });

    if (el.rngCtrlSize) {
      el.rngCtrlSize.addEventListener('input', () => {
        if (!ctrlEdDraft || !ctrlEdDraft[ctrlEdSelected]) return;
        const scale = clampCtrlVal(Number(el.rngCtrlSize.value) / 100, 0.6, 1.5, 1);
        const pct = Math.round(scale * 100);
        ctrlEdDraft.customized = true;
        ctrlEdDraft[ctrlEdSelected].scale = scale;
        if (el.lblCtrlSize) el.lblCtrlSize.textContent = pct + '%';
        const activeNode = ctrlEdNodes.find((n) => n.dataset.ctrlId === ctrlEdSelected);
        if (activeNode) activeNode.style.setProperty('--btn-scale', String(scale));
      });
    }

    if (el.btnCtrlEdReset) {
      el.btnCtrlEdReset.addEventListener('click', () => {
        SFX.click();
        ctrlEdDraft = normalizeControlLayout(null);
        renderCtrlEdNodes();
        showToast('기본 위치와 크기로 초기화했습니다.');
      });
    }

    if (el.btnCtrlEdCancel) {
      el.btnCtrlEdCancel.addEventListener('click', () => {
        SFX.click();
        closeControlEditor(true);
      });
    }

    if (el.btnCtrlEdSave) {
      el.btnCtrlEdSave.addEventListener('click', () => {
        SFX.click();
        save.controlLayout = normalizeControlLayout(ctrlEdDraft);
        persistSave();
        applyControlLayout();
        closeControlEditor(true);
        showToast('조작 버튼 설정이 저장되었습니다.');
      });
    }

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

    // Hardware Landscape Lock Guard & Event Hooks
    syncRotateGuardCopy();
    if (el.btnRotateLock) {
      el.btnRotateLock.addEventListener('click', () => {
        SFX.click();
        if (isAppleTouchDevice()) {
          showToast('아이폰은 기기를 가로로 돌리면 자동으로 가로 화면으로 전환됩니다!');
          return;
        }
        tryAutoLockLandscape(true);
      });
    }
    window.addEventListener('orientationchange', () => {
      try { tryAutoLockLandscape(false); } catch {}
    });

    // iPhone App Style Dynamic Bottom Menu Bar (Home fixed; non-home hides on scroll down, shows on scroll up / bottom-edge swipe or tap)
    if (el.tabContainer) {
      const scrollTopMap = new WeakMap();
      let touchStartY = 0;
      let touchStartX = 0;
      let touchTracking = false;

      // Capture-phase scroll catches inner scrollable panes (.bs-shop-stage, .tab-view, lists) just like iOS UIScrollView!
      el.tabContainer.addEventListener('scroll', (e) => {
        if (currentTab === 'home') return;
        const target = e.target;
        if (!target || typeof target.scrollTop !== 'number') return;
        const st = target.scrollTop;
        const prev = scrollTopMap.has(target) ? scrollTopMap.get(target) : st;
        const delta = st - prev;
        scrollTopMap.set(target, st);
        if (st <= 8) {
          setDynamicDockCollapsed(false);
        } else if (delta > 6 && st > 16) {
          setDynamicDockCollapsed(true);
        } else if (delta < -6) {
          setDynamicDockCollapsed(false);
        }
      }, { capture: true, passive: true });

      document.addEventListener('touchstart', (e) => {
        if (currentTab === 'home' || !e || !e.touches || !e.touches.length) return;
        const t = e.touches[0];
        touchStartY = t.clientY;
        touchStartX = t.clientX;
        touchTracking = true;
        // Tapping near the bottom edge while bar is collapsed brings it back like iOS Safari
        if (dockCollapsed && touchStartY >= window.innerHeight - 36) {
          setDynamicDockCollapsed(false);
          touchTracking = false;
        }
      }, { passive: true });

      document.addEventListener('touchmove', (e) => {
        if (!touchTracking || currentTab === 'home' || !e || !e.touches || !e.touches.length) return;
        const t = e.touches[0];
        const dy = t.clientY - touchStartY;
        const dx = Math.abs(t.clientX - touchStartX);
        if (dx > Math.abs(dy) * 1.25) return; // ignore horizontal swipes (e.g. horizontal carousels)
        const fromBottomEdge = touchStartY >= window.innerHeight - 68;
        if (dy > 20 || (fromBottomEdge && dy < -18)) {
          setDynamicDockCollapsed(false);
          touchTracking = false;
        } else if (dy < -24 && !fromBottomEdge) {
          setDynamicDockCollapsed(true);
          touchTracking = false;
        }
      }, { passive: true });

      el.tabContainer.addEventListener('wheel', (e) => {
        if (currentTab === 'home' || !e) return;
        if (e.deltaY > 10) {
          setDynamicDockCollapsed(true);
        } else if (e.deltaY < -10) {
          setDynamicDockCollapsed(false);
        }
      }, { passive: true });
    }

    // Auto-pause active run + keepalive cloud save flush on leave + auto cloud pull & landscape re-lock on return!
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
      } else {
        try { tryAutoLockLandscape(false); } catch {}
        if (!run || !run.active) {
          // Returning from another device/tab -> pull latest cloud progress automatically!
          if (ONLINE && save && save.auth && save.auth.loggedIn && ONLINE.isRankedProvider(save.auth.provider) && save.auth.uid) {
            syncAccountWithCloud(save.auth, { minIntervalMs: 8000 });
          }
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
        try { tryAutoLockLandscape(true); } catch {}
        const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
        if (!isCharUnlocked(ch.id)) {
          buyCharacter(ch, previewCharIdx);
          return;
        }
        save.selectedChar = ch.id;
        persistSave();
        openModeSelectModal();
      } catch (err) {
        showToast(`시작 오류: ${(err && err.message) || '다시 시도해주세요'}`);
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
    let bgmUnlocked = false;
    function unlockBgmOnGesture() {
      if (bgmUnlocked) return;
      if (window.StudioIntro && window.StudioIntro.isActive()) return;
      if (el.introOverlay && !el.introOverlay.classList.contains('hidden')) return;
      bgmUnlocked = true;
      window.removeEventListener('pointerdown', unlockBgmOnGesture);
      try {
        SFX.startBgm();
        if (!run || !run.active) SFX.setBgmMode('menu');
      } catch {}
    }
    let firstGestureLandscapeTried = false;
    function onFirstPointerGesture() {
      if (!firstGestureLandscapeTried) {
        firstGestureLandscapeTried = true;
        window.removeEventListener('pointerdown', onFirstPointerGesture);
        try { tryAutoLockLandscape(true); } catch {}
      }
    }
    window.addEventListener('pointerdown', onFirstPointerGesture, { passive: true });
    window.addEventListener('pointerdown', unlockBgmOnGesture);

    // Desktop Keyboard Controls (Space/↑ Jump, ↓ Slide, Q Umbrella, E Mask, Esc Pause)
    window.addEventListener('keydown', (e) => {
      if (window.StudioIntro && window.StudioIntro.isActive()) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          e.preventDefault();
        }
        return;
      }
      if (el.ctrlEditorOverlay && !el.ctrlEditorOverlay.classList.contains('hidden')) {
        if (e.code === 'Escape') {
          e.preventDefault();
          closeControlEditor(true);
        }
        return;
      }
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
      if (ev && ev.message) showToast(`오류: ${ev.message}`);
    } catch {}
  });
  setupEvents();
  refreshAllMenus();
  renderIntroAuthState();
  refreshLiveWeatherUI(false);
  if (window.StudioIntro && typeof window.StudioIntro.play === 'function') {
    window.StudioIntro.play(() => {
      // If OAuth redirect already bypassed title screen into lobby, start menu BGM cleanly after studio splash ends
      if (el.introOverlay && el.introOverlay.classList.contains('hidden') && (!run || !run.active)) {
        try {
          SFX.startBgm();
          SFX.setBgmMode('menu');
        } catch {}
      }
    });
  }

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
          if (window.StudioIntro && window.StudioIntro.isActive()) window.StudioIntro.skip();
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
