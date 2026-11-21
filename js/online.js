window.OnlineService = (function () {
  const BOARD_STORE_KEY = 'kr_weather_online_board_v1';
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const WEEKLY_REWARD_GEMS = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP1_GEMS) || 500;

  // Optional real backend config (fill firebaseDbUrl to sync live players globally via Firebase Realtime DB REST)
  // Example: window.KWEATHER_ONLINE_CONFIG = { firebaseDbUrl: 'https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app' };
  const CONFIG = Object.assign({
    firebaseDbUrl: '',
    pollIntervalMs: 5000
  }, window.KWEATHER_ONLINE_CONFIG || {});

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kweather_live_rank_v1');
    }
  } catch {}

  const listeners = new Set();

  function notifyListeners(payload) {
    listeners.forEach((fn) => {
      try { fn(payload); } catch {}
    });
  }

  if (channel) {
    channel.onmessage = (ev) => {
      if (ev && ev.data && ev.data.type === 'board_update') {
        notifyListeners(ev.data);
      }
    };
  }

  function onBoardUpdate(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ===================== KST WEEKLY CYCLE (RESETS EVERY MONDAY 00:00 KST) =====================
  function getIsoWeekKeyFromKstDate(kstDate) {
    const tmp = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return {
      key: `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
      year: tmp.getUTCFullYear(),
      weekNo
    };
  }

  function getWeekInfo(nowMs = Date.now()) {
    const kstNow = new Date(nowMs + KST_OFFSET_MS);
    const cur = getIsoWeekKeyFromKstDate(kstNow);
    const prevKst = new Date(nowMs - 7 * 86400000 + KST_OFFSET_MS);
    const prev = getIsoWeekKeyFromKstDate(prevKst);

    // Next Monday 00:00:00 KST
    const dayOfWeek = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonKstUtc = Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() + daysUntilMon,
      0, 0, 0, 0
    );
    const weekStartKstUtc = nextMonKstUtc - 7 * 86400000;
    const nextResetMs = nextMonKstUtc - KST_OFFSET_MS;
    const msRemaining = Math.max(0, nextResetMs - nowMs);
    const elapsedRatio = Math.max(0.05, Math.min(1, ((nowMs + KST_OFFSET_MS) - weekStartKstUtc) / (7 * 86400000)));

    const totalSec = Math.floor(msRemaining / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const countdownText = d > 0
      ? `${d}일 ${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(h)}:${pad(m)}:${pad(s)}`;

    return {
      weekKey: cur.key,
      weekLabel: `${cur.year}년 ${cur.weekNo}주차`,
      prevWeekKey: prev.key,
      prevWeekLabel: `${prev.year}년 ${prev.weekNo}주차`,
      msRemaining,
      countdownText,
      elapsedRatio
    };
  }

  // ===================== AUTHENTICATION (GUEST / GOOGLE / APPLE ID) =====================
  function generateUid(prefix = 'u') {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    const ts = Date.now().toString(36).slice(-4).toUpperCase();
    return `${prefix}_${ts}${rnd}`;
  }

  function sanitizeNickname(raw, fallback = '날씨러너') {
    const clean = String(raw || '').trim().replace(/[<>]/g, '').slice(0, 12);
    return clean || fallback;
  }

  function getProviderMeta(provider) {
    if (provider === 'google') return { id: 'google', label: 'Google', badge: 'G', color: '#4285F4' };
    if (provider === 'apple') return { id: 'apple', label: 'Apple ID', badge: '', color: '#111827' };
    return { id: 'guest', label: '게스트', badge: 'GUEST', color: '#607d9e' };
  }

  async function signIn(provider, opts = {}) {
    const prov = provider === 'google' || provider === 'apple' ? provider : 'guest';
    const existingUid = opts.existingUid;

    // Optional real Firebase Auth hook if configured on window.KWEATHER_ONLINE_CONFIG
    if (CONFIG.customAuthHandler && typeof CONFIG.customAuthHandler === 'function') {
      const res = await CONFIG.customAuthHandler(prov, opts);
      if (res && res.uid) return res;
    }

    const defaultNick = prov === 'google'
      ? (opts.email ? opts.email.split('@')[0] : '구글러너')
      : (prov === 'apple'
        ? (opts.email ? opts.email.split('@')[0] : '애플러너')
        : `게스트_${Math.floor(1000 + Math.random() * 9000)}`);

    const nickname = sanitizeNickname(opts.nickname, defaultNick);
    const email = String(opts.email || '').trim().slice(0, 60);
    return {
      loggedIn: true,
      provider: prov,
      uid: existingUid || generateUid(prov === 'guest' ? 'gst' : prov.slice(0, 3)),
      nickname,
      email,
      loggedInAt: Date.now()
    };
  }

  // ===================== DETERMINISTIC LIVE WEEKLY SEASON RIVALS =====================
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const SEASON_POOL = [
    { name: '한파뚫는패딩왕', charId: 'long_padding', skinId: 'glacier_pad', provider: 'google', baseScore: 14800, dist: 2150, year: 4 },
    { name: '화이트냥이마스터', charId: 'umbrella_master', skinId: 'catgirl_hoodie', provider: 'apple', baseScore: 12400, dist: 1840, year: 3 },
    { name: '얼죽아스키장인', charId: 'iced_americano', skinId: 'aurora_skier', provider: 'google', baseScore: 9850, dist: 1520, year: 3 },
    { name: '구라청저격수', charId: 'fashionista', skinId: 'frost_santa', provider: 'apple', baseScore: 7600, dist: 1240, year: 2 },
    { name: '장마폭우서퍼', charId: 'umbrella_master', skinId: 'thunder_rain', provider: 'google', baseScore: 5900, dist: 980, year: 2 },
    { name: '황사철벽마스크', charId: 'short_sleeve', skinId: 'dragon_hanbok', provider: 'guest', baseScore: 4350, dist: 760, year: 2 },
    { name: '벚꽃질주러너', charId: 'umbrella_master', skinId: 'cherry_rain', provider: 'apple', baseScore: 3100, dist: 560, year: 1 },
    { name: '폭염양산지존', charId: 'short_sleeve', skinId: 'royal_hanbok', provider: 'google', baseScore: 2150, dist: 410, year: 1 },
    { name: '태풍회피장인', charId: 'long_padding', skinId: 'crimson_pad', provider: 'guest', baseScore: 1280, dist: 260, year: 1 },
    { name: '우비소년새싹', charId: 'umbrella_master', skinId: null, provider: 'guest', baseScore: 620, dist: 135, year: 1 }
  ];

  function buildWeeklySeedRivals(weekKey, elapsedRatio) {
    const seed = hashStr(weekKey);
    // Live gentle pulse every 30s so active season board feels alive
    const pulseSlot = Math.floor(Date.now() / 30000);
    return SEASON_POOL.map((r, idx) => {
      const jitter = ((seed >> (idx % 16)) & 0xFF) / 255; // 0..1
      const scale = 0.72 + elapsedRatio * 0.34 + jitter * 0.14;
      const liveTick = idx < 4 ? ((hashStr(`${weekKey}_${idx}_${pulseSlot}`) % 18) * 5) : 0;
      const score = Math.round((r.baseScore * scale + liveTick) / 10) * 10;
      const dist = Math.round(r.dist * (0.78 + elapsedRatio * 0.28 + jitter * 0.1));
      return {
        uid: `season_${weekKey}_${idx}`,
        nickname: r.name,
        provider: r.provider,
        charId: r.charId,
        skinId: r.skinId,
        score,
        dist,
        year: r.year,
        updatedAt: Date.now() - ((idx + 1) * 38000),
        isBot: true
      };
    });
  }

  // ===================== SHARED BOARD STORAGE + OPTIONAL FIREBASE RTDB SYNC =====================
  function readLocalBoards() {
    try {
      const raw = localStorage.getItem(BOARD_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalBoards(all) {
    try {
      localStorage.setItem(BOARD_STORE_KEY, JSON.stringify(all));
    } catch {}
  }

  function hasRemoteDb() {
    return Boolean(CONFIG.firebaseDbUrl && /^https?:\/\//i.test(CONFIG.firebaseDbUrl));
  }

  function getRemoteWeekUrl(weekKey, uid = null) {
    const base = CONFIG.firebaseDbUrl.replace(/\/+$/, '');
    return uid
      ? `${base}/weekly_boards/${encodeURIComponent(weekKey)}/${encodeURIComponent(uid)}.json`
      : `${base}/weekly_boards/${encodeURIComponent(weekKey)}.json`;
  }

  async function submitWeeklyScore(entry) {
    if (!entry || !entry.uid) return null;
    const info = getWeekInfo();
    const weekKey = entry.weekKey || info.weekKey;
    const cleanEntry = {
      uid: String(entry.uid),
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider || 'guest',
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      score: Math.max(0, Math.floor(Number(entry.score) || 0)),
      dist: Math.max(0, Math.floor(Number(entry.dist) || 0)),
      year: Math.max(1, Math.floor(Number(entry.year) || 1)),
      updatedAt: Date.now()
    };

    // 1. Update local shared weekly board (keep highest weekly score per uid)
    const all = readLocalBoards();
    const wk = all[weekKey] || {};
    const prev = wk[cleanEntry.uid];
    if (!prev || cleanEntry.score >= (prev.score || 0)) {
      wk[cleanEntry.uid] = cleanEntry;
    } else {
      // Still update profile metadata (nickname/skin/provider) while preserving weekly high score!
      wk[cleanEntry.uid] = {
        ...prev,
        nickname: cleanEntry.nickname,
        provider: cleanEntry.provider,
        charId: cleanEntry.charId,
        skinId: cleanEntry.skinId,
        updatedAt: Date.now()
      };
    }
    all[weekKey] = wk;
    writeLocalBoards(all);

    // 2. Sync to remote Firebase RTDB if configured
    if (hasRemoteDb()) {
      try {
        await fetch(getRemoteWeekUrl(weekKey, cleanEntry.uid), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wk[cleanEntry.uid])
        });
      } catch {}
    }

    if (channel) {
      try { channel.postMessage({ type: 'board_update', weekKey, uid: cleanEntry.uid }); } catch {}
    }
    notifyListeners({ type: 'board_update', weekKey, uid: cleanEntry.uid });
    return wk[cleanEntry.uid];
  }

  async function fetchWeeklyBoard(weekKey = null, myUid = null) {
    const info = getWeekInfo();
    const targetWeek = weekKey || info.weekKey;
    const isCurrentWeek = targetWeek === info.weekKey;
    const elapsed = isCurrentWeek ? info.elapsedRatio : 1.0;

    let remoteEntries = [];
    let syncedOnline = false;

    if (hasRemoteDb()) {
      try {
        const res = await fetch(getRemoteWeekUrl(targetWeek), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            remoteEntries = Object.values(data).filter((x) => x && typeof x.score === 'number');
          }
          syncedOnline = true;
        }
      } catch {}
    }

    const localWeekObj = readLocalBoards()[targetWeek] || {};
    const localEntries = Object.values(localWeekObj);
    const seedRivals = buildWeeklySeedRivals(targetWeek, elapsed);

    // Merge unique by uid (remote > local > seed)
    const map = new Map();
    seedRivals.forEach((e) => map.set(e.uid, e));
    localEntries.forEach((e) => {
      const prev = map.get(e.uid);
      if (!prev || (e.score || 0) >= (prev.score || 0)) map.set(e.uid, e);
    });
    remoteEntries.forEach((e) => {
      const prev = map.get(e.uid);
      if (!prev || (e.score || 0) >= (prev.score || 0)) map.set(e.uid, e);
    });

    const board = Array.from(map.values())
      .sort((a, b) => (b.score - a.score) || ((a.updatedAt || 0) - (b.updatedAt || 0)))
      .slice(0, 50)
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        isMe: Boolean(myUid && entry.uid === myUid)
      }));

    // Live online runner counter
    const baseOnline = 18 + (hashStr(`${targetWeek}_${Math.floor(Date.now() / 15000)}`) % 27);
    const onlineCount = syncedOnline ? Math.max(remoteEntries.length, 1) : baseOnline;

    return {
      weekKey: targetWeek,
      weekInfo: info,
      board,
      syncedOnline,
      onlineCount,
      fetchedAt: Date.now()
    };
  }

  // ===================== WEEKLY #1 CHAMPION 500 GEM PAYOUT CHECK =====================
  async function checkWeeklyChampionPayout(save) {
    if (!save || !save.auth || !save.auth.uid) return null;
    const info = getWeekInfo();
    const prevKey = info.prevWeekKey;
    const wr = save.weeklyRank || {};
    const claimed = Array.isArray(wr.claimedWeeks) ? wr.claimedWeeks : [];
    if (claimed.includes(prevKey)) return null;

    // Check if the player had a score recorded in prevWeekKey
    const histScore = wr.history && wr.history[prevKey] ? wr.history[prevKey].score : 0;
    const localPrev = (readLocalBoards()[prevKey] || {})[save.auth.uid];
    const myPrevScore = Math.max(histScore || 0, (localPrev && localPrev.score) || 0);
    if (myPrevScore <= 0) return null;

    const prevRes = await fetchWeeklyBoard(prevKey, save.auth.uid);
    const top1 = prevRes.board[0];
    if (top1 && top1.uid === save.auth.uid) {
      return {
        won: true,
        weekKey: prevKey,
        weekLabel: info.prevWeekLabel,
        score: top1.score,
        gems: WEEKLY_REWARD_GEMS
      };
    }
    return null;
  }

  return {
    WEEKLY_REWARD_GEMS,
    getWeekInfo,
    getProviderMeta,
    sanitizeNickname,
    signIn,
    submitWeeklyScore,
    fetchWeeklyBoard,
    checkWeeklyChampionPayout,
    onBoardUpdate,
    hasRemoteDb
  };
})();
