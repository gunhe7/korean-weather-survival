window.OnlineService = (function () {
  const BOARD_STORE_KEY = 'kr_weather_online_board_v2_real';
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const WEEKLY_REWARD_GEMS = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP1_GEMS) || 500;

  // ===================== REAL ONLINE BACKEND CONFIG (FIREBASE REALTIME DATABASE) =====================
  // 1) Firebase 콘솔(https://console.firebase.google.com)에서 무료 Realtime Database 생성
  // 2) 아래 DEFAULT_FIREBASE_DB_URL에 본인 DB 주소 입력 (예: 'https://my-game-default-rtdb.asia-southeast1.firebasedatabase.app')
  // 3) 자세한 3분 설정 방법은 프로젝트의 ONLINE_RANK_SETUP.md 참고!
  const DEFAULT_FIREBASE_DB_URL = 'https://korean-weather-survival-default-rtdb.asia-southeast1.firebasedatabase.app';

  const CONFIG = Object.assign({
    firebaseDbUrl: DEFAULT_FIREBASE_DB_URL,
    pollIntervalMs: 5000
  }, window.KWEATHER_ONLINE_CONFIG || {});

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kweather_real_rank_v2');
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
    const nextResetMs = nextMonKstUtc - KST_OFFSET_MS;
    const msRemaining = Math.max(0, nextResetMs - nowMs);

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
      countdownText
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

  // ===================== REAL-USER-ONLY BOARD STORAGE & FIREBASE RTDB SYNC =====================
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

  function getDbUrl() {
    const url = (window.KWEATHER_ONLINE_CONFIG && window.KWEATHER_ONLINE_CONFIG.firebaseDbUrl) || CONFIG.firebaseDbUrl || '';
    return String(url).trim().replace(/\/+$/, '');
  }

  function hasRemoteDb() {
    return /^https?:\/\//i.test(getDbUrl());
  }

  function getRemoteWeekUrl(weekKey, uid = null) {
    const base = getDbUrl();
    return uid
      ? `${base}/weekly_boards/${encodeURIComponent(weekKey)}/${encodeURIComponent(uid)}.json`
      : `${base}/weekly_boards/${encodeURIComponent(weekKey)}.json`;
  }

  async function submitWeeklyScore(entry) {
    if (!entry || !entry.uid) return null;
    const scoreVal = Math.max(0, Math.floor(Number(entry.score) || 0));
    // Only register real plays with score > 0 onto the leaderboard!
    if (scoreVal <= 0) return null;

    const info = getWeekInfo();
    const weekKey = entry.weekKey || info.weekKey;
    const cleanEntry = {
      uid: String(entry.uid),
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider || 'guest',
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      score: scoreVal,
      dist: Math.max(0, Math.floor(Number(entry.dist) || 0)),
      year: Math.max(1, Math.floor(Number(entry.year) || 1)),
      updatedAt: Date.now()
    };

    // 1. Update local real-user board (keep highest weekly score per uid)
    const all = readLocalBoards();
    const wk = all[weekKey] || {};
    const prev = wk[cleanEntry.uid];
    if (!prev || cleanEntry.score >= (prev.score || 0)) {
      wk[cleanEntry.uid] = cleanEntry;
    } else {
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

    // 2. Sync to real Firebase Realtime Database if connected
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

    let remoteEntries = [];
    let syncedOnline = false;

    if (hasRemoteDb()) {
      try {
        const res = await fetch(getRemoteWeekUrl(targetWeek), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            remoteEntries = Object.values(data).filter(
              (x) => x && x.uid && typeof x.score === 'number' && x.score > 0
            );
          }
          syncedOnline = true;
        }
      } catch {}
    }

    const localWeekObj = readLocalBoards()[targetWeek] || {};
    const localEntries = Object.values(localWeekObj).filter(
      (x) => x && x.uid && typeof x.score === 'number' && x.score > 0
    );

    // Merge ONLY real users (ZERO bots / ZERO fake rivals!)
    const map = new Map();
    localEntries.forEach((e) => {
      const prev = map.get(e.uid);
      if (!prev || (e.score || 0) >= (prev.score || 0)) map.set(e.uid, e);
    });
    remoteEntries.forEach((e) => {
      const prev = map.get(e.uid);
      if (!prev || (e.score || 0) >= (prev.score || 0)) map.set(e.uid, e);
    });

    const allSorted = Array.from(map.values())
      .sort((a, b) => (b.score - a.score) || ((a.updatedAt || 0) - (b.updatedAt || 0)));

    const totalParticipants = allSorted.length;
    const board = allSorted
      .slice(0, 100)
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        isMe: Boolean(myUid && entry.uid === myUid)
      }));

    return {
      weekKey: targetWeek,
      weekInfo: info,
      board,
      syncedOnline,
      hasRemoteConfig: hasRemoteDb(),
      totalParticipants,
      fetchedAt: Date.now()
    };
  }

  // ===================== WEEKLY #1 CHAMPION 500 GEM PAYOUT CHECK (REAL USERS ONLY) =====================
  async function checkWeeklyChampionPayout(save) {
    if (!save || !save.auth || !save.auth.uid) return null;
    const info = getWeekInfo();
    const prevKey = info.prevWeekKey;
    const wr = save.weeklyRank || {};
    const claimed = Array.isArray(wr.claimedWeeks) ? wr.claimedWeeks : [];
    if (claimed.includes(prevKey)) return null;

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
