window.OnlineService = (function () {
  const BOARD_STORE_KEY = 'kr_weather_online_board_v5_live';
  const RTDB_BOARD_ROOT = '/weekly_boards';
  const RTDB_SAVES_ROOT = '/user_saves';
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const WEEKLY_REWARD_GEMS = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP1_GEMS) || 500;

  // ===================== FIREBASE PROJECT CONFIG (korean-weather-survival) =====================
  const FIREBASE_CONFIG = Object.assign({
    apiKey: 'AIzaSyD7w_0nqhqVcbP5iu4SlAtovLXWumy6h6w',
    authDomain: 'korean-weather-survival.firebaseapp.com',
    databaseURL: 'https://korean-weather-survival-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'korean-weather-survival'
  }, window.KWEATHER_FIREBASE_CONFIG || {});

  let fbApp = null;
  let fbAuth = null;
  let authReadyResolved = false;
  let authReadyPromise = null;
  let resolveAuthReady = null;
  let cachedIdToken = '';
  let cachedIdTokenUid = '';
  let cachedIdTokenAt = 0;
  let lastCloudSyncOk = null;
  let lastCloudSyncStatus = 0;
  let lastCloudSyncAt = 0;
  let lastCloudSyncError = '';

  const cloudStatusListeners = new Set();
  function notifyCloudSyncStatus() {
    const snap = getCloudSyncStatus();
    cloudStatusListeners.forEach((fn) => { try { fn(snap); } catch {} });
  }
  function onCloudSyncStatusChange(fn) {
    cloudStatusListeners.add(fn);
    return () => cloudStatusListeners.delete(fn);
  }

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
      try {
        if (window.firebase.auth.Auth && window.firebase.auth.Auth.Persistence) {
          fbAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
        }
      } catch {}
      if (!authReadyPromise) {
        authReadyPromise = new Promise((resolve) => { resolveAuthReady = resolve; });
        fbAuth.onAuthStateChanged((u) => {
          if (!authReadyResolved) {
            authReadyResolved = true;
            if (resolveAuthReady) resolveAuthReady(u || null);
          }
          if (u) {
            u.getIdToken(false).then((tok) => {
              if (tok) {
                cachedIdToken = tok;
                cachedIdTokenUid = u.uid || '';
                cachedIdTokenAt = Date.now();
              }
            }).catch(() => {});
          } else {
            cachedIdToken = '';
            cachedIdTokenUid = '';
            cachedIdTokenAt = 0;
          }
        });
      }
      return fbAuth;
    } catch {
      return null;
    }
  }

  async function waitForAuthReady(timeoutMs = 3500) {
    const auth = ensureFirebaseAuth();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;
    if (authReadyResolved) return auth.currentUser || null;
    if (!authReadyPromise) return auth.currentUser || null;
    return Promise.race([
      authReadyPromise,
      new Promise((resolve) => setTimeout(() => resolve(auth.currentUser || null), timeoutMs))
    ]);
  }

  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kweather_real_rank_v5');
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

  // ===================== REAL GOOGLE & APPLE AUTHENTICATION + GUEST =====================
  function isRankedProvider(provider) {
    return provider === 'google' || provider === 'apple';
  }

  function isLegacyUnverifiedUid(uid) {
    const s = String(uid || '');
    return s.startsWith('gst_') || s.startsWith('goo_') || s.startsWith('app_') || s.startsWith('guest_') || s.startsWith('season_');
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
    const list = (fbUser && Array.isArray(fbUser.providerData)) ? fbUser.providerData : [];
    if (list.some((p) => p && p.providerId === 'apple.com')) return 'apple';
    if (list.some((p) => p && p.providerId === 'google.com')) return 'google';
    if (list.some((p) => p && p.providerId === 'password')) return 'apple';
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

  async function getAuthIdToken(forceRefresh = false, waitAuth = true) {
    const auth = ensureFirebaseAuth();
    if (!auth) return '';
    if (!auth.currentUser && waitAuth) {
      await waitForAuthReady(3500);
    }
    if (!auth.currentUser) return '';
    try {
      const tok = await auth.currentUser.getIdToken(forceRefresh);
      if (tok) {
        cachedIdToken = tok;
        cachedIdTokenUid = auth.currentUser.uid || '';
        cachedIdTokenAt = Date.now();
      }
      return tok;
    } catch {
      return '';
    }
  }

  function formatAuthError(err, prov) {
    const code = (err && err.code) || '';
    const label = prov === 'apple' ? 'Apple ID' : 'Google';
    if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') {
      return `${label} 로그인을 현재 환경에서 사용할 수 없습니다.`;
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return '같은 이메일로 이미 다른 로그인 방식(Google/Apple)이 연결되어 있습니다. 기존 방식으로 로그인해 주세요.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (code === 'auth/weak-password') {
      return '비밀번호는 6자 이상으로 입력해 주세요.';
    }
    if (code === 'auth/invalid-email') {
      return '올바른 이메일 주소를 입력해 주세요.';
    }
    if (code === 'auth/email-already-in-use') {
      return '이미 가입된 이메일입니다. 기존 비밀번호로 로그인해 주세요.';
    }
    return `${label} 로그인 실패 (${code || (err && err.message) || '네트워크 오류'})`;
  }

  // Synchronous-start Popup OAuth (works on Chrome, Safari, iOS, Android without breaking user gesture!)
  async function signInWithOAuth(provider) {
    const prov = provider === 'apple' ? 'apple' : 'google';
    const auth = ensureFirebaseAuth();
    if (!auth) {
      return {
        ok: false,
        needsSetup: true,
        provider: prov,
        message: '로그인 모듈을 불러오지 못했습니다. 네트워크를 확인해 주세요.'
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
      // If Apple Web OAuth isn't configured with an Apple Developer Services ID yet, offer Apple ID Email fallback!
      if (
        prov === 'apple' && (
          code === 'auth/operation-not-allowed' ||
          code === 'auth/invalid-oauth-client-id' ||
          code === 'auth/missing-or-invalid-nonce' ||
          code === 'auth/internal-error' ||
          code === 'auth/invalid-credential'
        )
      ) {
        return {
          ok: false,
          code,
          appleNeedsEmailFallback: true,
          message: formatAuthError(err, prov)
        };
      }
      // Popup strictly blocked -> try redirect fallback
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          try { sessionStorage.setItem('kweather_oauth_pending_prov', prov); } catch {}
          await auth.signInWithRedirect(authProvider);
          return { ok: false, redirecting: true, message: '로그인 페이지로 이동 중...' };
        } catch (rErr) {
          const rCode = (rErr && rErr.code) || '';
          return {
            ok: false,
            code: rCode,
            appleNeedsEmailFallback: prov === 'apple',
            message: formatAuthError(rErr, prov)
          };
        }
      }
      return { ok: false, code, message: formatAuthError(err, prov) };
    }
  }

  // Real Firebase Email/Password Login/Sign-Up for Apple ID Email (100% cross-device Firebase UID!)
  async function signInWithAppleEmail(emailRaw, passwordRaw, nicknameRaw) {
    const auth = ensureFirebaseAuth();
    if (!auth) {
      return { ok: false, message: '로그인 모듈을 초기화하지 못했습니다.' };
    }
    const email = String(emailRaw || '').trim();
    const password = String(passwordRaw || '');
    if (!email || !email.includes('@')) {
      return { ok: false, message: '올바른 Apple ID(이메일) 주소를 입력해 주세요.' };
    }
    if (password.length < 6) {
      return { ok: false, message: '비밀번호는 6자 이상 입력해 주세요.' };
    }

    try {
      // Try signing into existing account first
      const cred = await auth.signInWithEmailAndPassword(email, password);
      if (cred && cred.user) {
        if (nicknameRaw && !cred.user.displayName) {
          try { await cred.user.updateProfile({ displayName: sanitizeNickname(nicknameRaw, '애플유저') }); } catch {}
        }
        return { ok: true, profile: buildProfileFromFirebaseUser(cred.user, 'apple') };
      }
    } catch (err) {
      const code = (err && err.code) || '';
      // If user does not exist yet, auto-register a new real Firebase account!
      if (code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials' || code === 'auth/invalid-credential') {
        try {
          const created = await auth.createUserWithEmailAndPassword(email, password);
          if (created && created.user) {
            const nick = sanitizeNickname(nicknameRaw, email.split('@')[0] || '애플유저');
            try { await created.user.updateProfile({ displayName: nick }); } catch {}
            const prof = buildProfileFromFirebaseUser(created.user, 'apple');
            prof.nickname = nick;
            return { ok: true, isNewAccount: true, profile: prof };
          }
        } catch (cErr) {
          const cCode = (cErr && cErr.code) || '';
          if (cCode === 'auth/email-already-in-use') {
            return { ok: false, code: cCode, message: '이미 가입된 계정입니다. 비밀번호를 다시 확인해 주세요.' };
          }
          return { ok: false, code: cCode, message: formatAuthError(cErr, 'apple') };
        }
      }
      return { ok: false, code, message: formatAuthError(err, 'apple') };
    }
    return { ok: false, message: 'Apple ID 로그인에 실패했습니다.' };
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
    cachedIdToken = '';
    cachedIdTokenUid = '';
    cachedIdTokenAt = 0;
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

  // ===================== FIREBASE REALTIME DB HELPERS =====================
  function getDbUrl() {
    const url = (window.KWEATHER_ONLINE_CONFIG && window.KWEATHER_ONLINE_CONFIG.firebaseDbUrl) || FIREBASE_CONFIG.databaseURL || '';
    return String(url).trim().replace(/\/+$/, '');
  }

  function hasRemoteDb() {
    return /^https?:\/\//i.test(getDbUrl());
  }

  async function buildAuthedUrl(path, forceRefreshToken = false, waitAuth = true) {
    const base = getDbUrl();
    const token = await getAuthIdToken(forceRefreshToken, waitAuth);
    return {
      url: token ? `${base}${path}?auth=${encodeURIComponent(token)}` : `${base}${path}`,
      hasToken: Boolean(token)
    };
  }

  function getCloudSyncStatus() {
    return {
      ok: lastCloudSyncOk,
      status: lastCloudSyncStatus,
      lastSyncAt: lastCloudSyncAt,
      error: lastCloudSyncError
    };
  }

  // ===================== CROSS-DEVICE PER-USER CLOUD SAVE (/user_saves/{uid}.json) =====================
  async function loadCloudUserSave(uid) {
    if (!uid || !hasRemoteDb()) {
      return { ok: false, data: null, status: 0, hasToken: false, error: 'no_db' };
    }
    const path = `${RTDB_SAVES_ROOT}/${encodeURIComponent(uid)}.json`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const forceRefresh = attempt === 1;
        const { url, hasToken } = await buildAuthedUrl(path, forceRefresh, true);
        if (!hasToken) {
          lastCloudSyncOk = false;
          lastCloudSyncStatus = 0;
          lastCloudSyncError = 'no_auth_token';
          notifyCloudSyncStatus();
          return { ok: false, data: null, status: 0, hasToken: false, error: 'no_auth_token' };
        }
        const res = await fetch(url, { cache: 'no-store' });
        lastCloudSyncStatus = res.status;
        if (res.ok) {
          lastCloudSyncOk = true;
          lastCloudSyncAt = Date.now();
          lastCloudSyncError = '';
          const data = await res.json();
          notifyCloudSyncStatus();
          return { ok: true, data: (data && typeof data === 'object') ? data : null, status: res.status, hasToken: true };
        }
        if ((res.status === 401 || res.status === 403) && attempt === 0) {
          continue; // Retry once with freshly refreshed Firebase ID token!
        }
        lastCloudSyncOk = false;
        lastCloudSyncError = res.status === 401 || res.status === 403 ? 'permission_denied' : `http_${res.status}`;
        notifyCloudSyncStatus();
        return { ok: false, data: null, status: res.status, hasToken, error: lastCloudSyncError };
      } catch (err) {
        lastCloudSyncOk = false;
        lastCloudSyncStatus = 0;
        lastCloudSyncError = 'network_error';
        notifyCloudSyncStatus();
        return { ok: false, data: null, status: 0, hasToken: false, error: (err && err.message) || 'network_error' };
      }
    }
    return { ok: false, data: null, status: lastCloudSyncStatus, hasToken: false, error: lastCloudSyncError || 'unknown' };
  }

  async function saveCloudUserSave(uid, saveData, useKeepalive = false) {
    if (!uid || !saveData || !hasRemoteDb()) {
      return { ok: false, status: 0, hasToken: false, error: 'no_db' };
    }
    const updatedAt = Number(saveData.cloudUpdatedAt) || Date.now();
    const payload = JSON.stringify({ ...saveData, cloudUpdatedAt: updatedAt });
    const path = `${RTDB_SAVES_ROOT}/${encodeURIComponent(uid)}.json`;

    // Fast synchronous keepalive path for pagehide / visibilitychange so mobile/desktop browsers never abort before token await!
    if (useKeepalive && cachedIdToken && cachedIdTokenUid === uid && (Date.now() - cachedIdTokenAt) < 50 * 60 * 1000) {
      try {
        const fastUrl = `${getDbUrl()}${path}?auth=${encodeURIComponent(cachedIdToken)}`;
        fetch(fastUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
        return { ok: true, status: 200, hasToken: true, updatedAt, keepalive: true };
      } catch {
        return { ok: false, status: 0, hasToken: true, error: 'keepalive_error' };
      }
    }

    const maxAttempts = useKeepalive ? 1 : 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const forceRefresh = attempt === 1;
        const { url, hasToken } = await buildAuthedUrl(path, forceRefresh, !useKeepalive);
        if (!hasToken) {
          return { ok: false, status: 0, hasToken: false, error: 'no_auth_token' };
        }
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: Boolean(useKeepalive)
        });
        lastCloudSyncStatus = res.status;
        if (res && res.ok) {
          lastCloudSyncOk = true;
          lastCloudSyncAt = Date.now();
          lastCloudSyncError = '';
          notifyCloudSyncStatus();
          return { ok: true, status: res.status, hasToken: true, updatedAt };
        }
        if (res && (res.status === 401 || res.status === 403) && attempt === 0 && !useKeepalive) {
          continue; // Retry once with freshly refreshed Firebase ID token!
        }
        lastCloudSyncOk = false;
        lastCloudSyncError = (res && (res.status === 401 || res.status === 403)) ? 'permission_denied' : `http_${res ? res.status : 0}`;
        notifyCloudSyncStatus();
        return { ok: false, status: res ? res.status : 0, hasToken, error: lastCloudSyncError };
      } catch (err) {
        if (!useKeepalive) {
          lastCloudSyncOk = false;
          lastCloudSyncStatus = 0;
          lastCloudSyncError = 'network_error';
          notifyCloudSyncStatus();
        }
        return { ok: false, status: 0, hasToken: false, error: (err && err.message) || 'network_error' };
      }
    }
    return { ok: false, status: lastCloudSyncStatus, hasToken: false, error: lastCloudSyncError || 'unknown' };
  }

  // ===================== LINKED-USERS-ONLY WEEKLY LEADERBOARD (ALL REAL USERS SHARED LIVE!) =====================
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
    if (!isRankedProvider(entry.provider) || isLegacyUnverifiedUid(entry.uid)) return null;

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
      const bodyStr = JSON.stringify(wk[cleanEntry.uid]);
      const targets = [
        `${RTDB_BOARD_ROOT}/${encodeURIComponent(weekKey)}/${encodeURIComponent(cleanEntry.uid)}.json`,
        `/weekly_boards_v2/${encodeURIComponent(weekKey)}/${encodeURIComponent(cleanEntry.uid)}.json`
      ];
      for (const path of targets) {
        try {
          const { url } = await buildAuthedUrl(path, false, true);
          const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          });
          if (res && res.ok) break;
        } catch {}
      }
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
      // Read BOTH /weekly_boards and /weekly_boards_v2 seamlessly (whichever has active rules!)
      const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
      for (const root of roots) {
        try {
          const url = `${getDbUrl()}${root}/${encodeURIComponent(targetWeek)}.json`;
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) {
            syncedOnline = true;
            const data = await res.json();
            if (data && typeof data === 'object') {
              const valid = Object.values(data).filter(
                (x) => x && x.uid && !isLegacyUnverifiedUid(x.uid) && isRankedProvider(x.provider) && typeof x.score === 'number' && x.score > 0
              );
              remoteEntries = remoteEntries.concat(valid);
            }
          }
        } catch {}
      }
    }

    const localWeekObj = readLocalBoards()[targetWeek] || {};
    const localEntries = Object.values(localWeekObj).filter(
      (x) => x && x.uid && !isLegacyUnverifiedUid(x.uid) && isRankedProvider(x.provider) && typeof x.score === 'number' && x.score > 0
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
    if (!isRankedProvider(save.auth.provider) || isLegacyUnverifiedUid(save.auth.uid)) return null;

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
    getCloudSyncStatus,
    onCloudSyncStatusChange,
    waitForAuthReady,
    getWeekInfo,
    getProviderMeta,
    sanitizeNickname,
    signInWithOAuth,
    signInWithAppleEmail,
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
