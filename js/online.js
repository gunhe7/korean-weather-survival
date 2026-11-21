window.OnlineService = (function () {
  const BOARD_STORE_KEY = 'kr_weather_online_board_v4_clean';
  const RTDB_BOARD_ROOT = '/weekly_boards_v2';
  const RTDB_SAVES_ROOT = '/user_saves_v2';
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const WEEKLY_REWARD_GEMS = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP1_GEMS) || 500;

  // ===================== FIREBASE PROJECT CONFIG (korean-weather-survival) =====================
  // 실제 Google / Apple 로그인을 활성화하려면 Firebase 콘솔(프로젝트 설정 -> 일반 -> 내 앱 -> 웹 앱)의
  // apiKey(AIza...) 1줄을 아래 apiKey에 입력해 주세요! (자세한 안내: AUTH_SETUP.md)
  const FIREBASE_CONFIG = Object.assign({
    apiKey: 'AIzaSyD7w_0nqhqVcbP5iu4SlAtovLXWumy6h6w',
    authDomain: 'korean-weather-survival.firebaseapp.com',
    databaseURL: 'https://korean-weather-survival-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'korean-weather-survival'
  }, window.KWEATHER_FIREBASE_CONFIG || {});

  let fbApp = null;
  let fbAuth = null;

  function hasFirebaseAuth() {
    return Boolean(
      typeof window !== 'undefined' &&
      window.firebase &&
      FIREBASE_CONFIG.apiKey &&
      String(FIREBASE_CONFIG.apiKey).trim().length > 10 &&
      !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR_')
    );
  }

  function ensureFirebaseAuth() {
    if (!hasFirebaseAuth()) return null;
    if (fbAuth) return fbAuth;
    try {
      fbApp = window.firebase.apps && window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(FIREBASE_CONFIG);
      fbAuth = window.firebase.auth();
      try { fbAuth.languageCode = 'ko'; } catch {}
      return fbAuth;
    } catch {
      return null;
    }
  }

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kweather_real_rank_v3');
    }
  } catch {}

  const listeners = new Set();
  function notifyListeners(payload) {
    listeners.forEach((fn) => { try { fn(payload); } catch {} });
  }
  if (channel) {
    channel.onmessage = (ev) => {
      if (ev && ev.data && ev.data.type === 'board_update') notifyListeners(ev.data);
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

    const dayOfWeek = kstNow.getUTCDay();
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

  // ===================== REAL GOOGLE / APPLE AUTHENTICATION + GUEST =====================
  function isRankedProvider(provider) {
    return provider === 'google' || provider === 'apple';
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

  function detectProviderFromFirebaseUser(fbUser, hintProvider) {
    if (hintProvider === 'google' || hintProvider === 'apple') return hintProvider;
    const pd = (fbUser && Array.isArray(fbUser.providerData) && fbUser.providerData[0]) || null;
    if (pd && pd.providerId === 'apple.com') return 'apple';
    if (pd && pd.providerId === 'google.com') return 'google';
    return 'google';
  }

  function buildProfileFromFirebaseUser(fbUser, hintProvider) {
    const prov = detectProviderFromFirebaseUser(fbUser, hintProvider);
    const email = (fbUser.email || '').trim();
    const rawName = fbUser.displayName || (email ? email.split('@')[0] : (prov === 'apple' ? '애플유저' : '구글유저'));
    return {
      loggedIn: true,
      provider: prov,
      uid: fbUser.uid,
      nickname: sanitizeNickname(rawName, prov === 'apple' ? '애플유저' : '구글유저'),
      email,
      photoURL: fbUser.photoURL || '',
      verifiedOAuth: true,
      loggedInAt: Date.now()
    };
  }

  async function getAuthIdToken() {
    const auth = ensureFirebaseAuth();
    if (!auth || !auth.currentUser) return '';
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return '';
    }
  }

  function isMobileOrInApp() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    return /Android|iPhone|iPad|iPod|Mobile|GSA\/|KAKAOTALK|NAVER|Instagram/i.test(ua);
  }

  async function signInWithOAuth(provider) {
    const prov = provider === 'apple' ? 'apple' : 'google';
    const auth = ensureFirebaseAuth();
    if (!auth) {
      return {
        ok: false,
        needsSetup: true,
        provider: prov,
        message: '실제 Google/Apple 로그인을 활성화하려면 Firebase 웹 apiKey 설정이 필요합니다. (AUTH_SETUP.md 참고)'
      };
    }

    let authProvider = null;
    if (prov === 'google') {
      authProvider = new window.firebase.auth.GoogleAuthProvider();
      authProvider.setCustomParameters({ prompt: 'select_account' });
    } else {
      authProvider = new window.firebase.auth.OAuthProvider('apple.com');
      authProvider.addScope('email');
      authProvider.addScope('name');
      authProvider.setCustomParameters({ locale: 'ko' });
    }

    try {
      const cred = await auth.signInWithPopup(authProvider);
      if (cred && cred.user) {
        return { ok: true, profile: buildProfileFromFirebaseUser(cred.user, prov) };
      }
      return { ok: false, message: '로그인 결과를 확인하지 못했습니다.' };
    } catch (err) {
      const code = (err && err.code) || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { ok: false, cancelled: true, message: '로그인이 취소되었습니다.' };
      }
      // Mobile / popup-blocked fallback -> redirect flow!
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        isMobileOrInApp()
      ) {
        try {
          try { sessionStorage.setItem('kweather_oauth_pending_prov', prov); } catch {}
          await auth.signInWithRedirect(authProvider);
          return { ok: false, redirecting: true, message: '로그인 페이지로 이동 중...' };
        } catch (rErr) {
          return { ok: false, code: rErr && rErr.code, message: formatAuthError(rErr, prov) };
        }
      }
      return { ok: false, code, message: formatAuthError(err, prov) };
    }
  }

  function formatAuthError(err, prov) {
    const code = (err && err.code) || '';
    const label = prov === 'apple' ? 'Apple ID' : 'Google';
    if (code === 'auth/unauthorized-domain') {
      return `Firebase Authentication 승인된 도메인에 ${location.hostname}을 추가해 주세요.`;
    }
    if (code === 'auth/operation-not-allowed') {
      return `Firebase 콘솔 Authentication에서 ${label} 로그인을 사용 설정해 주세요.`;
    }
    if (code === 'auth/invalid-api-key') {
      return 'Firebase 웹 apiKey가 올바르지 않습니다. 프로젝트 설정에서 확인해 주세요.';
    }
    return `${label} 로그인 실패 (${code || (err && err.message) || '네트워크 오류'})`;
  }

  async function checkRedirectLoginResult() {
    const auth = ensureFirebaseAuth();
    if (!auth) return null;
    try {
      const res = await auth.getRedirectResult();
      if (res && res.user) {
        let hint = '';
        try {
          hint = sessionStorage.getItem('kweather_oauth_pending_prov') || '';
          sessionStorage.removeItem('kweather_oauth_pending_prov');
        } catch {}
        return buildProfileFromFirebaseUser(res.user, hint);
      }
    } catch {}
    return null;
  }

  function onAuthStateReady(cb) {
    const auth = ensureFirebaseAuth();
    if (!auth) return () => {};
    return auth.onAuthStateChanged((fbUser) => {
      if (fbUser) {
        cb(buildProfileFromFirebaseUser(fbUser, ''));
      } else {
        cb(null);
      }
    });
  }

  async function signOutOAuth() {
    const auth = ensureFirebaseAuth();
    if (!auth) return;
    try { await auth.signOut(); } catch {}
  }

  function createGuestProfile(existingGuestUid = '') {
    const uid = existingGuestUid && existingGuestUid.startsWith('guest_')
      ? existingGuestUid
      : `guest_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
    return {
      loggedIn: true,
      provider: 'guest',
      uid,
      nickname: '게스트',
      email: '',
      verifiedOAuth: false,
      loggedInAt: Date.now()
    };
  }

  // ===================== FIREBASE REALTIME DB URL HELPERS =====================
  function getDbUrl() {
    const url = (window.KWEATHER_ONLINE_CONFIG && window.KWEATHER_ONLINE_CONFIG.firebaseDbUrl) || FIREBASE_CONFIG.databaseURL || '';
    return String(url).trim().replace(/\/+$/, '');
  }

  function hasRemoteDb() {
    return /^https?:\/\//i.test(getDbUrl());
  }

  async function buildAuthedUrl(path) {
    const base = getDbUrl();
    const token = await getAuthIdToken();
    return token ? `${base}${path}?auth=${encodeURIComponent(token)}` : `${base}${path}`;
  }

  // ===================== PER-USER CLOUD SAVE (/user_saves_v2/{uid}.json) =====================
  async function loadCloudUserSave(uid) {
    if (!uid || !hasRemoteDb()) return null;
    try {
      const url = await buildAuthedUrl(`${RTDB_SAVES_ROOT}/${encodeURIComponent(uid)}.json`);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  async function saveCloudUserSave(uid, saveData) {
    if (!uid || !saveData || !hasRemoteDb()) return false;
    try {
      const payload = { ...saveData, cloudUpdatedAt: Date.now() };
      const url = await buildAuthedUrl(`${RTDB_SAVES_ROOT}/${encodeURIComponent(uid)}.json`);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return Boolean(res && res.ok);
    } catch {
      return false;
    }
  }

  // ===================== LINKED-USERS-ONLY WEEKLY LEADERBOARD (GUESTS EXCLUDED!) =====================
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

  async function submitWeeklyScore(entry) {
    if (!entry || !entry.uid) return null;
    // STRICT RULE: 게스트 유저는 랭킹에 절대 등록/표시되지 않음!
    if (!isRankedProvider(entry.provider)) return null;

    const scoreVal = Math.max(0, Math.floor(Number(entry.score) || 0));
    if (scoreVal <= 0) return null;

    const info = getWeekInfo();
    const weekKey = entry.weekKey || info.weekKey;
    const cleanEntry = {
      uid: String(entry.uid),
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider,
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      score: scoreVal,
      dist: Math.max(0, Math.floor(Number(entry.dist) || 0)),
      year: Math.max(1, Math.floor(Number(entry.year) || 1)),
      updatedAt: Date.now()
    };

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

    if (hasRemoteDb()) {
      try {
        const url = await buildAuthedUrl(`${RTDB_BOARD_ROOT}/${encodeURIComponent(weekKey)}/${encodeURIComponent(cleanEntry.uid)}.json`);
        await fetch(url, {
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
        const url = `${getDbUrl()}${RTDB_BOARD_ROOT}/${encodeURIComponent(targetWeek)}.json`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            // STRICT FILTER: ONLY Google / Apple linked real users (Guests excluded!)
            remoteEntries = Object.values(data).filter(
              (x) => x && x.uid && isRankedProvider(x.provider) && typeof x.score === 'number' && x.score > 0
            );
          }
          syncedOnline = true;
        }
      } catch {}
    }

    const localWeekObj = readLocalBoards()[targetWeek] || {};
    const localEntries = Object.values(localWeekObj).filter(
      (x) => x && x.uid && isRankedProvider(x.provider) && typeof x.score === 'number' && x.score > 0
    );

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
      totalParticipants: allSorted.length,
      fetchedAt: Date.now()
    };
  }

  // ===================== WEEKLY #1 CHAMPION 500 GEM PAYOUT (LINKED USERS ONLY) =====================
  async function checkWeeklyChampionPayout(save) {
    if (!save || !save.auth || !save.auth.uid) return null;
    if (!isRankedProvider(save.auth.provider)) return null;

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
    FIREBASE_CONFIG,
    hasFirebaseAuth,
    hasRemoteDb,
    isRankedProvider,
    getWeekInfo,
    getProviderMeta,
    sanitizeNickname,
    signInWithOAuth,
    checkRedirectLoginResult,
    onAuthStateReady,
    signOutOAuth,
    createGuestProfile,
    loadCloudUserSave,
    saveCloudUserSave,
    submitWeeklyScore,
    fetchWeeklyBoard,
    checkWeeklyChampionPayout,
    onBoardUpdate
  };
})();
