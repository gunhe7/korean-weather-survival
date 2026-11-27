window.OnlineService = (function () {
  const BOARD_STORE_KEY = 'kr_weather_online_board_v5_live';
  const DAILY_BOARD_STORE_KEY = 'kr_weather_daily_weather_board_v1';
  const RTDB_BOARD_ROOT = '/weekly_boards';
  const RTDB_SAVES_ROOT = '/user_saves';
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  // Launch season anchor: Monday 2026-11-23 00:00:00 KST = 1주차
  const RANK_WEEK1_MON_KST_UTC = Date.UTC(2026, 10, 23, 0, 0, 0, 0);
  const WEEKLY_REWARD_GEMS = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP1_GEMS) || 5000;

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
    const daysSinceMon = dayOfWeek === 0 ? 6 : (dayOfWeek - 1);
    const curMonKstUtc = Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() - daysSinceMon,
      0, 0, 0, 0
    );
    const rawSeasonWeekNo = Math.floor((curMonKstUtc - RANK_WEEK1_MON_KST_UTC) / (7 * 86400000)) + 1;
    const seasonWeekNo = Math.max(1, rawSeasonWeekNo);
    const prevSeasonWeekNo = rawSeasonWeekNo - 1;

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
      seasonWeekNo,
      prevSeasonWeekNo,
      weekLabel: `${seasonWeekNo}주차`,
      prevWeekKey: prev.key,
      prevWeekLabel: prevSeasonWeekNo >= 1 ? `${prevSeasonWeekNo}주차` : '',
      msRemaining,
      countdownText
    };
  }

  // ===================== KST DAILY CYCLE (RESETS EVERY DAY 00:00 KST — TODAY'S WEATHER MODE) =====================
  function formatKstDateKey(kstDate) {
    const y = kstDate.getUTCFullYear();
    const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getKstDayInfo(nowMs = Date.now()) {
    const kstNow = new Date(nowMs + KST_OFFSET_MS);
    const prevKst = new Date(nowMs - 86400000 + KST_OFFSET_MS);
    const dateKey = formatKstDateKey(kstNow);
    const prevDateKey = formatKstDateKey(prevKst);
    const dateLabel = `${kstNow.getUTCMonth() + 1}월 ${kstNow.getUTCDate()}일`;

    const nextMidnightKstUtc = Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() + 1,
      0, 0, 0, 0
    );
    const nextResetMs = nextMidnightKstUtc - KST_OFFSET_MS;
    const msRemaining = Math.max(0, nextResetMs - nowMs);

    const totalSec = Math.floor(msRemaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');

    return {
      dateKey,
      dateLabel,
      prevDateKey,
      msRemaining,
      countdownText: `${pad(h)}:${pad(m)}:${pad(s)}`
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
      profileCharId: entry.profileCharId || entry.charId || 'umbrella_master',
      profileSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : (entry.skinId || null),
      nameColor: typeof entry.nameColor === 'string' ? entry.nameColor.slice(0, 24) : '#ffffff',
      nameFrame: typeof entry.nameFrame === 'string' ? entry.nameFrame.slice(0, 16) : 'none',
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
        profileCharId: cleanEntry.profileCharId,
        profileSkinId: cleanEntry.profileSkinId,
        nameColor: cleanEntry.nameColor,
        nameFrame: cleanEntry.nameFrame,
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

  // ===================== DAILY TODAY'S WEATHER LEADERBOARD (RESETS DAILY 00:00 KST) =====================
  function readLocalDailyBoards() {
    try {
      const raw = localStorage.getItem(DAILY_BOARD_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalDailyBoards(all) {
    try {
      localStorage.setItem(DAILY_BOARD_STORE_KEY, JSON.stringify(all));
    } catch {}
  }

  async function submitDailyWeatherScore(entry) {
    if (!entry || !entry.uid) return null;
    if (!isRankedProvider(entry.provider) || isLegacyUnverifiedUid(entry.uid)) return null;

    const scoreVal = Math.max(0, Math.floor(Number(entry.score) || 0));
    if (scoreVal <= 0) return null;

    const dayInfo = getKstDayInfo();
    const dateKey = entry.dateKey || dayInfo.dateKey;
    const remoteBucket = `daily_${dateKey}`;
    const cleanEntry = {
      uid: String(entry.uid),
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider,
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      profileCharId: entry.profileCharId || entry.charId || 'umbrella_master',
      profileSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : (entry.skinId || null),
      nameColor: typeof entry.nameColor === 'string' ? entry.nameColor.slice(0, 24) : '#ffffff',
      nameFrame: typeof entry.nameFrame === 'string' ? entry.nameFrame.slice(0, 16) : 'none',
      cityName: String(entry.cityName || '서울').slice(0, 8),
      weatherTag: String(entry.weatherTag || '').slice(0, 20),
      score: scoreVal,
      dist: Math.max(0, Math.floor(Number(entry.dist) || 0)),
      year: Math.max(1, Math.floor(Number(entry.year) || 1)),
      updatedAt: Date.now()
    };

    const all = readLocalDailyBoards();
    const dk = all[dateKey] || {};
    const prev = dk[cleanEntry.uid];
    if (!prev || cleanEntry.score >= (prev.score || 0)) {
      dk[cleanEntry.uid] = cleanEntry;
    } else {
      dk[cleanEntry.uid] = {
        ...prev,
        nickname: cleanEntry.nickname,
        provider: cleanEntry.provider,
        charId: cleanEntry.charId,
        skinId: cleanEntry.skinId,
        profileCharId: cleanEntry.profileCharId,
        profileSkinId: cleanEntry.profileSkinId,
        nameColor: cleanEntry.nameColor,
        nameFrame: cleanEntry.nameFrame,
        updatedAt: Date.now()
      };
    }
    all[dateKey] = dk;
    // Prune older local daily entries beyond last 7 days
    const keys = Object.keys(all).sort();
    while (keys.length > 7) {
      delete all[keys.shift()];
    }
    writeLocalDailyBoards(all);

    if (hasRemoteDb()) {
      const bodyStr = JSON.stringify(dk[cleanEntry.uid]);
      const targets = [
        `${RTDB_BOARD_ROOT}/${encodeURIComponent(remoteBucket)}/${encodeURIComponent(cleanEntry.uid)}.json`,
        `/weekly_boards_v2/${encodeURIComponent(remoteBucket)}/${encodeURIComponent(cleanEntry.uid)}.json`
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
      try { channel.postMessage({ type: 'board_update', mode: 'today_weather', dateKey, uid: cleanEntry.uid }); } catch {}
    }
    notifyListeners({ type: 'board_update', mode: 'today_weather', dateKey, uid: cleanEntry.uid });
    return dk[cleanEntry.uid];
  }

  async function fetchDailyWeatherBoard(dateKey = null, myUid = null) {
    const dayInfo = getKstDayInfo();
    const targetDate = dateKey || dayInfo.dateKey;
    const remoteBucket = `daily_${targetDate}`;

    let remoteEntries = [];
    let syncedOnline = false;

    if (hasRemoteDb()) {
      const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
      for (const root of roots) {
        try {
          const url = `${getDbUrl()}${root}/${encodeURIComponent(remoteBucket)}.json`;
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

    const localDayObj = readLocalDailyBoards()[targetDate] || {};
    const localEntries = Object.values(localDayObj).filter(
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
      dateKey: targetDate,
      dayInfo,
      board,
      syncedOnline,
      hasRemoteConfig: hasRemoteDb(),
      totalParticipants: allSorted.length,
      fetchedAt: Date.now()
    };
  }

  // ===================== 8-PLAYER COMPETITIVE TROPHY BOARD & REALTIME ROOMS =====================
  const TROPHY_BOARD_STORE_KEY = 'kr_weather_trophy_board_v1';
  const RTDB_TROPHY_PATH = `${RTDB_BOARD_ROOT}/trophy_season_v1`;
  const RTDB_COMP_ROOMS_PATH = `${RTDB_BOARD_ROOT}/comp_rooms`;

  function readLocalTrophyBoard() {
    try {
      const raw = localStorage.getItem(TROPHY_BOARD_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalTrophyBoard(obj) {
    try {
      localStorage.setItem(TROPHY_BOARD_STORE_KEY, JSON.stringify(obj || {}));
    } catch {}
  }

  async function submitTrophyProfile(entry) {
    if (!entry || !entry.uid) return null;
    const clean = {
      uid: String(entry.uid),
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider || 'guest',
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      profileCharId: entry.profileCharId || entry.charId || 'umbrella_master',
      profileSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : (entry.skinId || null),
      nameColor: typeof entry.nameColor === 'string' ? entry.nameColor.slice(0, 24) : '#ffffff',
      nameFrame: typeof entry.nameFrame === 'string' ? entry.nameFrame.slice(0, 16) : 'none',
      trophies: Math.max(0, Math.floor(Number(entry.trophies) || 0)),
      wins: Math.max(0, Math.floor(Number(entry.wins) || 0)),
      matches: Math.max(0, Math.floor(Number(entry.matches) || 0)),
      bestCompScore: Math.max(0, Math.floor(Number(entry.bestCompScore) || 0)),
      updatedAt: Date.now()
    };

    const local = readLocalTrophyBoard();
    local[clean.uid] = clean;
    writeLocalTrophyBoard(local);

    if (hasRemoteDb() && isRankedProvider(clean.provider) && !isLegacyUnverifiedUid(clean.uid)) {
      try {
        const path = `${RTDB_TROPHY_PATH}/${encodeURIComponent(clean.uid)}.json`;
        const { url } = await buildAuthedUrl(path, false, true);
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean)
        });
      } catch {}
    }
    return clean;
  }

  async function fetchTrophyBoard(myUid = null) {
    let remoteEntries = [];
    let syncedOnline = false;
    if (hasRemoteDb()) {
      try {
        const res = await fetch(`${getDbUrl()}${RTDB_TROPHY_PATH}.json`, { cache: 'no-store' });
        if (res && res.ok) {
          syncedOnline = true;
          const data = await res.json();
          if (data && typeof data === 'object') {
            remoteEntries = Object.values(data).filter(
              (x) => x && x.uid && typeof x.trophies === 'number'
            );
          }
        }
      } catch {}
    }

    const localEntries = Object.values(readLocalTrophyBoard()).filter(
      (x) => x && x.uid && typeof x.trophies === 'number'
    );
    const map = new Map();
    localEntries.forEach((e) => map.set(e.uid, e));
    remoteEntries.forEach((e) => {
      const prev = map.get(e.uid);
      if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(e.uid, e);
    });

    const sorted = Array.from(map.values()).sort(
      (a, b) => (b.trophies - a.trophies) || ((b.wins || 0) - (a.wins || 0)) || ((b.bestCompScore || 0) - (a.bestCompScore || 0))
    );
    const board = sorted.slice(0, 100).map((e, i) => ({
      ...e,
      rank: i + 1,
      isMe: Boolean(myUid && e.uid === myUid)
    }));
    return { board, syncedOnline, totalParticipants: sorted.length, fetchedAt: Date.now() };
  }

  // ===================== CROSS-PLATFORM 8-PLAYER COMPETITIVE QUEUE & MATCH ROOMS =====================
  // Uses strict-rule-safe 2-level paths (/weekly_boards/{bucket}/{uid}.json) + Firebase server timestamps
  // so PC (Windows/Mac), Android, iPhone, and iPad players match seamlessly with zero clock skew!
  const RTDB_COMP_QUEUE_BUCKET = 'comp_queue_v2';
  const COMP_QUEUE_REV_CACHE = {};
  const COMP_ROOM_META_CACHE = {};
  let compServerClockOffsetMs = 0;
  let compServerClockSynced = false;

  function detectClientPlatform() {
    try {
      const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
      const plat = String((typeof navigator !== 'undefined' && navigator.platform) || '');
      const touchPts = (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints)) || 0;
      if (/iPad/i.test(ua) || (plat === 'MacIntel' && touchPts > 1)) {
        return { id: 'ipad', label: 'iPad' };
      }
      if (/iPhone|iPod/i.test(ua)) {
        return { id: 'ios', label: 'iOS' };
      }
      if (/Android/i.test(ua)) {
        return { id: 'android', label: 'Android' };
      }
      return { id: 'pc', label: 'PC' };
    } catch {
      return { id: 'pc', label: 'PC' };
    }
  }

  function getCompServerNow() {
    return Date.now() + (compServerClockSynced ? compServerClockOffsetMs : 0);
  }

  function calibrateServerClock(serverTs) {
    const num = Number(serverTs);
    if (Number.isFinite(num) && num > 1700000000000) {
      compServerClockOffsetMs = num - Date.now();
      compServerClockSynced = true;
    }
  }

  async function fetchBoardNodeRemote(bucket, uid) {
    if (!bucket || !uid || !hasRemoteDb()) return null;
    const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
    let best = null;
    for (const root of roots) {
      try {
        const res = await fetch(`${getDbUrl()}${root}/${encodeURIComponent(bucket)}/${encodeURIComponent(uid)}.json`, { cache: 'no-store' });
        if (res && res.ok) {
          const d = await res.json();
          if (d && typeof d === 'object' && (!best || (Number(d.score) || 0) >= (Number(best.score) || 0))) {
            best = d;
          }
        }
      } catch {}
    }
    return best;
  }

  async function writeCompBoardNode(bucket, uid, payloadBuilder, opts = {}) {
    if (!bucket || !uid || !hasRemoteDb()) return { ok: false, data: null, status: 0 };
    const cacheKey = `${bucket}:${uid}`;
    let curScore = Math.max(Number(COMP_QUEUE_REV_CACHE[cacheKey]) || 0, Number(opts.minScore) || 0);
    if (curScore <= 0 && !opts.keepalive) {
      const prev = await fetchBoardNodeRemote(bucket, uid);
      if (prev && Number(prev.score) > 0) curScore = Number(prev.score);
    }

    const targets = [
      `${RTDB_BOARD_ROOT}/${encodeURIComponent(bucket)}/${encodeURIComponent(uid)}.json`,
      `/weekly_boards_v2/${encodeURIComponent(bucket)}/${encodeURIComponent(uid)}.json`
    ];

    const maxAttempts = opts.keepalive ? 1 : 2;
    let lastStatus = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nextScore = opts.exactMinScore
        ? Math.min(4999990, Math.max(1, curScore, Math.floor(opts.exactMinScore)))
        : Math.min(4999990, Math.max(1, curScore + 1));
      const payload = {
        ...payloadBuilder(nextScore),
        uid: String(uid),
        score: nextScore,
        updatedAt: { '.sv': 'timestamp' }
      };
      const bodyStr = JSON.stringify(payload);

      // Fast keepalive path for pagehide/cancel/finish so mobile browsers never drop the write
      if (opts.keepalive && cachedIdToken && cachedIdTokenUid === uid && (Date.now() - cachedIdTokenAt) < 50 * 60 * 1000) {
        try {
          const fastUrl = `${getDbUrl()}${targets[0]}?auth=${encodeURIComponent(cachedIdToken)}`;
          fetch(fastUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
            keepalive: true
          }).catch(() => {});
          COMP_QUEUE_REV_CACHE[cacheKey] = nextScore;
          return { ok: true, data: payload, status: 200 };
        } catch {}
      }

      for (const path of targets) {
        try {
          const { url, hasToken } = await buildAuthedUrl(path, attempt === 1, !opts.keepalive);
          if (!hasToken) continue;
          const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
            keepalive: Boolean(opts.keepalive)
          });
          lastStatus = res ? res.status : 0;
          if (res && res.ok) {
            let written = null;
            try { written = await res.json(); } catch {}
            COMP_QUEUE_REV_CACHE[cacheKey] = nextScore;
            if (written && written.updatedAt) calibrateServerClock(written.updatedAt);
            return { ok: true, data: written || payload, status: res.status };
          }
        } catch {}
      }

      if (attempt === 0 && !opts.keepalive) {
        const remotePrev = await fetchBoardNodeRemote(bucket, uid);
        if (remotePrev && Number(remotePrev.score) >= curScore) {
          curScore = Number(remotePrev.score);
        } else {
          curScore = nextScore;
        }
      }
    }
    return { ok: false, data: null, status: lastStatus };
  }

  function getCompTierBand(trophies) {
    const tr = Math.max(0, Math.floor(Number(trophies) || 0));
    return tr < 3000 ? 'bs' : (tr < 6000 ? 'gp' : 'dm');
  }

  async function pollCompQueue() {
    if (!hasRemoteDb()) return { online: false, serverNow: getCompServerNow(), entries: [] };
    const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
    let online = false;
    const byUid = {};

    for (const root of roots) {
      try {
        const res = await fetch(`${getDbUrl()}${root}/${RTDB_COMP_QUEUE_BUCKET}.json`, { cache: 'no-store' });
        if (res && res.ok) {
          online = true;
          const data = await res.json();
          if (data && typeof data === 'object') {
            Object.values(data).forEach((p) => {
              if (!p || !p.uid || !isRankedProvider(p.provider) || isLegacyUnverifiedUid(p.uid)) return;
              const prev = byUid[p.uid];
              if (!prev || (Number(p.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                byUid[p.uid] = p;
              }
            });
          }
          break;
        }
      } catch {}
    }

    const serverNow = getCompServerNow();
    // Prune stale entries (>28s without heartbeat) and cancelled entries
    const entries = Object.values(byUid).filter((p) => {
      if (!p || p.state === 'cancelled') return false;
      const ts = Number(p.updatedAt) || 0;
      if (!ts) return false;
      const age = serverNow - ts;
      return age <= 28000 && age >= -30000;
    });

    return { online, serverNow, entries };
  }

  async function joinCompQueue(playerInfo) {
    if (!playerInfo || !playerInfo.uid || !isRankedProvider(playerInfo.provider) || isLegacyUnverifiedUid(playerInfo.uid)) {
      return { rejected: 'google_required', online: false, uid: null, entries: [] };
    }
    const uid = String(playerInfo.uid);
    const plat = detectClientPlatform();
    const tr = Math.max(0, Math.floor(Number(playerInfo.trophies) || 0));
    const tierBand = getCompTierBand(tr);
    const nick = sanitizeNickname(playerInfo.nickname, '날씨러너');
    const compMode = playerInfo.compMode === '2v2' ? '2v2' : '1v1';
    const partyId = compMode === '2v2' ? String(playerInfo.partyId || '') : '';
    const partnerUid = compMode === '2v2' ? String(playerInfo.partnerUid || '') : '';

    const buildPayload = (queuedAtVal) => ({
      provider: playerInfo.provider,
      nickname: nick,
      charId: playerInfo.charId || 'umbrella_master',
      skinId: playerInfo.skinId || null,
      profileCharId: playerInfo.profileCharId || playerInfo.charId || 'umbrella_master',
      profileSkinId: playerInfo.profileSkinId !== undefined ? playerInfo.profileSkinId : (playerInfo.skinId || null),
      trophies: tr,
      tierBand,
      compMode,
      partyId,
      partnerUid,
      platform: plat.id,
      platformLabel: plat.label,
      state: 'searching',
      queuedAt: queuedAtVal,
      matchRoomId: '',
      rosterUids: [],
      teamMap: {},
      launchAt: 0
    });

    const writeRes = await writeCompBoardNode(RTDB_COMP_QUEUE_BUCKET, uid, () => buildPayload(0));
    const serverNow = (writeRes && writeRes.data && Number(writeRes.data.updatedAt)) || getCompServerNow();
    const queuedAt = serverNow;
    if (writeRes && writeRes.ok) {
      await writeCompBoardNode(RTDB_COMP_QUEUE_BUCKET, uid, () => buildPayload(queuedAt));
    }

    const polled = await pollCompQueue();
    return {
      rejected: null,
      online: Boolean(writeRes && writeRes.ok),
      uid,
      compMode,
      partyId,
      partnerUid,
      tierBand,
      platform: plat,
      queuedAt,
      serverNow: polled.serverNow,
      entries: polled.entries
    };
  }

  async function heartbeatCompQueue(playerInfo, statePatch = {}) {
    if (!playerInfo || !playerInfo.uid || !isRankedProvider(playerInfo.provider) || isLegacyUnverifiedUid(playerInfo.uid)) {
      return { ok: false };
    }
    const uid = String(playerInfo.uid);
    const plat = playerInfo.platform || detectClientPlatform();
    const tr = Math.max(0, Math.floor(Number(playerInfo.trophies) || 0));
    const tierBand = playerInfo.tierBand || getCompTierBand(tr);
    const nick = sanitizeNickname(playerInfo.nickname, '날씨러너');
    const compMode = (statePatch.compMode || playerInfo.compMode) === '2v2' ? '2v2' : '1v1';
    const partyId = compMode === '2v2' ? String(statePatch.partyId !== undefined ? statePatch.partyId : (playerInfo.partyId || '')) : '';
    const partnerUid = compMode === '2v2' ? String(statePatch.partnerUid !== undefined ? statePatch.partnerUid : (playerInfo.partnerUid || '')) : '';

    return writeCompBoardNode(RTDB_COMP_QUEUE_BUCKET, uid, () => ({
      provider: playerInfo.provider,
      nickname: nick,
      charId: playerInfo.charId || 'umbrella_master',
      skinId: playerInfo.skinId || null,
      profileCharId: playerInfo.profileCharId || playerInfo.charId || 'umbrella_master',
      profileSkinId: playerInfo.profileSkinId !== undefined ? playerInfo.profileSkinId : (playerInfo.skinId || null),
      trophies: tr,
      tierBand,
      compMode,
      partyId,
      partnerUid,
      platform: plat.id || 'pc',
      platformLabel: plat.label || 'PC',
      state: statePatch.state || 'searching',
      queuedAt: Number(playerInfo.queuedAt) || getCompServerNow(),
      matchRoomId: statePatch.matchRoomId || '',
      rosterUids: Array.isArray(statePatch.rosterUids) ? statePatch.rosterUids : [],
      teamMap: (statePatch.teamMap && typeof statePatch.teamMap === 'object') ? statePatch.teamMap : {},
      launchAt: Number(statePatch.launchAt) || 0
    }), { keepalive: Boolean(statePatch.keepalive) });
  }

  async function leaveCompQueue(playerInfo) {
    if (!playerInfo || !playerInfo.uid || !isRankedProvider(playerInfo.provider) || isLegacyUnverifiedUid(playerInfo.uid)) {
      return false;
    }
    const res = await heartbeatCompQueue(playerInfo, { state: 'cancelled', keepalive: true });
    return Boolean(res && res.ok);
  }

  // ===================== 2v2 FRIEND DUO PARTY SYNC (/weekly_boards/comp_duo_v1/{uid}.json) =====================
  const RTDB_COMP_DUO_BUCKET = 'comp_duo_v1';

  function makeCompDuoPartyId(uidA, uidB) {
    const pair = [String(uidA || ''), String(uidB || '')].sort();
    return `duo_${pair[0].slice(0, 8)}_${pair[1].slice(0, 8)}`;
  }

  async function publishCompDuoState(playerInfo, duoPatch = {}) {
    if (!playerInfo || !playerInfo.uid || !isRankedProvider(playerInfo.provider) || isLegacyUnverifiedUid(playerInfo.uid)) {
      return { ok: false };
    }
    const uid = String(playerInfo.uid);
    const plat = playerInfo.platform || detectClientPlatform();
    const nick = sanitizeNickname(playerInfo.nickname, '날씨러너');
    return writeCompBoardNode(RTDB_COMP_DUO_BUCKET, uid, () => ({
      provider: playerInfo.provider,
      nickname: nick,
      charId: playerInfo.charId || 'umbrella_master',
      skinId: playerInfo.skinId || null,
      profileCharId: playerInfo.profileCharId || playerInfo.charId || 'umbrella_master',
      profileSkinId: playerInfo.profileSkinId !== undefined ? playerInfo.profileSkinId : (playerInfo.skinId || null),
      trophies: Math.max(0, Math.floor(Number(playerInfo.trophies) || 0)),
      platform: plat.id || 'pc',
      platformLabel: plat.label || 'PC',
      status: duoPatch.status || 'idle', // 'idle' | 'inviting' | 'ready' | 'queueing' | 'declined'
      targetUid: String(duoPatch.targetUid || ''),
      partyId: String(duoPatch.partyId || ''),
      updatedClientAt: Date.now()
    }), { keepalive: Boolean(duoPatch.keepalive) });
  }

  async function pollCompDuoDirectory() {
    if (!hasRemoteDb()) return { online: false, serverNow: getCompServerNow(), byUid: {}, entries: [] };
    const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
    let online = false;
    const byUid = {};
    for (const root of roots) {
      try {
        const res = await fetch(`${getDbUrl()}${root}/${RTDB_COMP_DUO_BUCKET}.json`, { cache: 'no-store' });
        if (res && res.ok) {
          online = true;
          const data = await res.json();
          if (data && typeof data === 'object') {
            Object.values(data).forEach((p) => {
              if (!p || !p.uid || !isRankedProvider(p.provider) || isLegacyUnverifiedUid(p.uid)) return;
              const prev = byUid[p.uid];
              if (!prev || (Number(p.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) {
                byUid[p.uid] = p;
              }
            });
          }
          break;
        }
      } catch {}
    }
    const serverNow = getCompServerNow();
    const freshByUid = {};
    const entries = Object.values(byUid).filter((p) => {
      if (!p || !p.status || p.status === 'idle') return false;
      const ts = Number(p.updatedAt) || 0;
      if (!ts) return false;
      const age = serverNow - ts;
      const ok = age <= 90000 && age >= -30000;
      if (ok) freshByUid[p.uid] = p;
      return ok;
    });
    return { online, serverNow, byUid: freshByUid, entries };
  }

  async function joinCompActiveRoom(roomId, playerInfo) {
    if (!roomId || roomId.startsWith('local_') || !playerInfo || !playerInfo.uid) return false;
    if (!isRankedProvider(playerInfo.provider) || isLegacyUnverifiedUid(playerInfo.uid)) return false;
    const uid = String(playerInfo.uid);
    const nick = sanitizeNickname(playerInfo.nickname, '날씨러너');
    const plat = playerInfo.platform || detectClientPlatform();
    const meta = {
      uid,
      provider: playerInfo.provider,
      nickname: nick,
      charId: playerInfo.charId || 'umbrella_master',
      skinId: playerInfo.skinId || null,
      trophies: Math.max(0, Math.floor(Number(playerInfo.trophies) || 0)),
      platform: plat.id || 'pc',
      platformLabel: plat.label || 'PC',
      team: Number(playerInfo.team) === 1 ? 1 : 0
    };
    COMP_ROOM_META_CACHE[`${roomId}:${uid}`] = meta;
    const res = await writeCompBoardNode(roomId, uid, () => ({
      ...meta,
      realScore: 0,
      finished: false,
      pose: { y: 258, vy: 0, sl: 0, um: 0, mk: 0, ht: 0, dd: 0, fv: 0, distM: 0 }
    }), { exactMinScore: 1 });
    return Boolean(res && res.ok);
  }

  async function pollCompMatchRoom(roomId) {
    if (!roomId || roomId.startsWith('local_') || !hasRemoteDb()) return null;
    const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
    for (const root of roots) {
      try {
        const res = await fetch(`${getDbUrl()}${root}/${encodeURIComponent(roomId)}.json`, { cache: 'no-store' });
        if (!res || !res.ok) continue;
        const data = await res.json();
        if (!data || typeof data !== 'object') return [];
        return Object.values(data)
          .filter((p) => p && p.uid && !p.cancelled && isRankedProvider(p.provider))
          .map((p) => ({
            ...p,
            score: typeof p.realScore === 'number'
              ? Math.max(0, Math.floor(p.realScore))
              : Math.max(0, Math.floor(Number(p.score) || 0)),
            pose: (p.pose && typeof p.pose === 'object') ? p.pose : null
          }))
          .slice(0, 4);
      } catch {}
    }
    return null;
  }

  async function pushCompLiveScore(roomId, uid, score, finished = false, playerMeta = null, livePose = null) {
    if (!roomId || roomId.startsWith('local_') || !uid || !hasRemoteDb()) return false;
    const cleanUid = String(uid);
    const cached = COMP_ROOM_META_CACHE[`${roomId}:${cleanUid}`] || {};
    const meta = {
      provider: (playerMeta && playerMeta.provider) || cached.provider || 'google',
      nickname: sanitizeNickname((playerMeta && playerMeta.nickname) || cached.nickname || '날씨러너', '날씨러너'),
      charId: (playerMeta && playerMeta.charId) || cached.charId || 'umbrella_master',
      skinId: (playerMeta && playerMeta.skinId !== undefined) ? playerMeta.skinId : (cached.skinId || null),
      trophies: Math.max(0, Math.floor(Number((playerMeta && playerMeta.trophies) ?? cached.trophies) || 0)),
      platform: (playerMeta && playerMeta.platform) || cached.platform || detectClientPlatform().id,
      platformLabel: (playerMeta && playerMeta.platformLabel) || cached.platformLabel || detectClientPlatform().label,
      team: (playerMeta && playerMeta.team !== undefined) ? (Number(playerMeta.team) === 1 ? 1 : 0) : (cached.team || 0)
    };
    COMP_ROOM_META_CACHE[`${roomId}:${cleanUid}`] = { uid: cleanUid, ...meta };
    const cleanScore = Math.max(0, Math.floor(Number(score) || 0));
    const cleanPose = livePose && typeof livePose === 'object' ? {
      y: Math.round(Number(livePose.y) || 258),
      vy: Math.round(Number(livePose.vy) || 0),
      sl: livePose.sl ? 1 : 0,
      um: livePose.um ? 1 : 0,
      mk: livePose.mk ? 1 : 0,
      ht: livePose.ht ? 1 : 0,
      dd: livePose.dd ? 1 : 0,
      fv: livePose.fv ? 1 : 0,
      distM: Math.max(0, Math.floor(Number(livePose.distM) || 0))
    } : null;
    const res = await writeCompBoardNode(roomId, cleanUid, () => ({
      ...meta,
      realScore: cleanScore,
      finished: Boolean(finished),
      ...(cleanPose ? { pose: cleanPose } : {})
    }), {
      exactMinScore: Math.max(1, Math.min(4999990, cleanScore)),
      keepalive: Boolean(finished)
    });
    return Boolean(res && res.ok);
  }

  // Backward-compatible shims for any legacy callers
  async function joinCompMatchRoom(playerInfo) {
    const q = await joinCompQueue(playerInfo);
    return { rejected: q.rejected, roomId: RTDB_COMP_QUEUE_BUCKET, safeUid: q.uid, players: q.entries, online: q.online };
  }
  async function leaveCompMatchRoom(_roomId, uid, playerInfo) {
    return leaveCompQueue(playerInfo || { uid, provider: 'google', nickname: '날씨러너' });
  }

  // ===================== WEEKLY TOP 1/2/3 CHAMPION REWARD PAYOUT (LINKED USERS ONLY) =====================
  async function checkWeeklyChampionPayout(save) {
    if (!save || !save.auth || !save.auth.uid) return null;
    if (!isRankedProvider(save.auth.provider) || isLegacyUnverifiedUid(save.auth.uid)) return null;

    const info = getWeekInfo();
    if ((info.prevSeasonWeekNo || 0) < 1) return null;
    const prevKey = info.prevWeekKey;
    const wr = save.weeklyRank || {};
    const claimed = Array.isArray(wr.claimedWeeks) ? wr.claimedWeeks : [];
    if (claimed.includes(prevKey)) return null;

    const histScore = wr.history && wr.history[prevKey] ? wr.history[prevKey].score : 0;
    const localPrev = (readLocalBoards()[prevKey] || {})[save.auth.uid];
    const myPrevScore = Math.max(histScore || 0, (localPrev && localPrev.score) || 0);
    if (myPrevScore <= 0) return null;

    const prevRes = await fetchWeeklyBoard(prevKey, save.auth.uid);
    const top3 = (prevRes && Array.isArray(prevRes.board)) ? prevRes.board.slice(0, 3) : [];
    const rankIdx = top3.findIndex((entry) => entry && entry.uid === save.auth.uid);
    if (rankIdx >= 0) {
      const rank = rankIdx + 1;
      const rewardTable = (window.RUN_DATA && window.RUN_DATA.WEEKLY_TOP_REWARDS) || {
        1: { rank: 1, gems: 5000, frameId: 'rank_1', frameName: '1위 닉네임 장식' },
        2: { rank: 2, gems: 3000, frameId: 'rank_2', frameName: '2위 닉네임 장식' },
        3: { rank: 3, gems: 1000, frameId: 'rank_3', frameName: '3위 닉네임 장식' }
      };
      const rw = rewardTable[rank] || rewardTable[1];
      return {
        won: true,
        rank,
        weekKey: prevKey,
        weekLabel: info.prevWeekLabel,
        score: top3[rankIdx].score,
        gems: rw.gems,
        frameId: rw.frameId,
        frameName: rw.frameName
      };
    }
    return null;
  }

  // ===================== OVERWATCH-STYLE BATTLETAG KEYS & ONLINE FRIENDS SYSTEM =====================
  const FRIENDS_DIR_STORE_KEY = 'kr_weather_friends_dir_v1';
  const RTDB_FRIENDS_BUCKET = 'friends_v1';
  const FRIEND_KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  function fnv1a32(str, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function generateFriendKey(uid) {
    const cleanUid = String(uid || 'guest_local').trim() || 'guest_local';
    let h1 = fnv1a32(`KWS_BT1:${cleanUid}`, 0x811c9dc5);
    let h2 = fnv1a32(`KWS_BT2:${cleanUid}`, 0x9e3779b1);
    let out = '';
    for (let i = 0; i < 3; i++) {
      out += FRIEND_KEY_ALPHABET[h1 & 31];
      h1 >>>= 5;
    }
    for (let i = 0; i < 3; i++) {
      out += FRIEND_KEY_ALPHABET[h2 & 31];
      h2 >>>= 5;
    }
    return out;
  }

  function formatBattleTag(nickname, friendKey) {
    const nick = sanitizeNickname(nickname, '날씨러너');
    const key = String(friendKey || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return key ? `${nick}#${key}` : nick;
  }

  function parseFriendSearchInput(raw) {
    let str = String(raw || '').trim();
    if (!str) return { raw: '', key: '', nickPart: '' };
    // Support pasting a full invite URL (?addFriend=KEY) directly into the input box!
    const urlMatch = str.match(/[?&#]addFriend=([^&#\s]+)/i);
    if (urlMatch && urlMatch[1]) {
      try {
        str = decodeURIComponent(urlMatch[1]).trim();
      } catch {
        str = urlMatch[1].trim();
      }
    }
    const hashIdx = str.lastIndexOf('#');
    if (hashIdx >= 0) {
      const nickPart = str.slice(0, hashIdx).trim();
      const keyPart = str.slice(hashIdx + 1).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      return { raw: str, key: keyPart, nickPart };
    }
    const compact = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isPureKey = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(compact) && compact.length === str.replace(/\s+/g, '').length;
    return {
      raw: str,
      key: isPureKey ? compact : '',
      nickPart: isPureKey ? '' : str
    };
  }

  function sanitizeFriendLinks(rawLinks) {
    const out = {};
    if (!rawLinks || typeof rawLinks !== 'object') return out;
    Object.keys(rawLinks).forEach((k) => {
      const v = rawLinks[k];
      if (!v || typeof v !== 'object') return;
      const st = v.s === 'acc' || v.s === 'del' ? v.s : (v.s === 'req' ? 'req' : '');
      const ts = Math.max(0, Math.floor(Number(v.t) || 0));
      if (st && ts > 0) out[String(k)] = { s: st, t: ts };
    });
    return out;
  }

  function mergeFriendLinks(a, b) {
    const ca = sanitizeFriendLinks(a);
    const cb = sanitizeFriendLinks(b);
    const out = { ...ca };
    Object.keys(cb).forEach((uid) => {
      if (!out[uid] || cb[uid].t >= out[uid].t) {
        out[uid] = cb[uid];
      }
    });
    return out;
  }

  function deriveFriendRelation(myLinks, theirLinks, myUid, otherUid) {
    if (!myUid || !otherUid || myUid === otherUid) return 'self';
    const m = myLinks && myLinks[otherUid];
    const o = theirLinks && theirLinks[myUid];
    const mActive = Boolean(m && (m.s === 'req' || m.s === 'acc'));
    const oActive = Boolean(o && (o.s === 'req' || o.s === 'acc'));

    if (m && m.s === 'del') {
      if (o && o.s === 'req' && o.t > m.t) return 'incoming';
      return 'none';
    }
    if (o && o.s === 'del') {
      if (m && m.s === 'req' && m.t > o.t) return 'outgoing';
      return 'none';
    }
    if (mActive && oActive) return 'friend';
    if (o && o.s === 'req') return 'incoming';
    if (m && m.s === 'req') return 'outgoing';
    return 'none';
  }

  function readLocalFriendsDir() {
    try {
      const raw = localStorage.getItem(FRIENDS_DIR_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalFriendsDir(mapObj) {
    try {
      localStorage.setItem(FRIENDS_DIR_STORE_KEY, JSON.stringify(mapObj || {}));
    } catch {}
  }

  function normalizeFriendNode(raw) {
    if (!raw || typeof raw !== 'object' || !raw.uid) return null;
    const uid = String(raw.uid);
    const friendKey = String(raw.friendKey || generateFriendKey(uid)).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || generateFriendKey(uid);
    const nickname = sanitizeNickname(raw.nickname, '날씨러너');
    return {
      uid,
      friendKey,
      battleTag: formatBattleTag(nickname, friendKey),
      nickname,
      provider: raw.provider || 'google',
      score: Math.max(1, Math.floor(Number(raw.score) || 1)),
      bestScore: Math.max(0, Math.floor(Number(raw.bestScore) || 0)),
      trophies: Math.max(0, Math.floor(Number(raw.trophies) || 0)),
      wins: Math.max(0, Math.floor(Number(raw.wins) || 0)),
      charId: raw.charId || 'umbrella_master',
      skinId: raw.skinId || null,
      profileCharId: raw.profileCharId || raw.charId || 'umbrella_master',
      profileSkinId: raw.profileSkinId !== undefined ? raw.profileSkinId : (raw.skinId || null),
      nameColor: typeof raw.nameColor === 'string' ? raw.nameColor.slice(0, 24) : '#ffffff',
      nameFrame: typeof raw.nameFrame === 'string' ? raw.nameFrame.slice(0, 16) : 'none',
      links: sanitizeFriendLinks(raw.links),
      updatedAt: Math.max(0, Math.floor(Number(raw.updatedAt) || 0))
    };
  }

  async function fetchSingleFriendNodeRemote(uid) {
    if (!uid || !hasRemoteDb()) return null;
    const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
    let best = null;
    for (const root of roots) {
      try {
        const res = await fetch(`${getDbUrl()}${root}/${RTDB_FRIENDS_BUCKET}/${encodeURIComponent(uid)}.json`, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const norm = normalizeFriendNode(raw);
          if (norm && (!best || norm.score >= best.score)) best = norm;
        }
      } catch {}
    }
    return best;
  }

  async function fetchFriendsDirectory() {
    const localMap = readLocalFriendsDir();
    const merged = {};
    Object.values(localMap).forEach((raw) => {
      const n = normalizeFriendNode(raw);
      if (n && isRankedProvider(n.provider) && !isLegacyUnverifiedUid(n.uid)) {
        merged[n.uid] = n;
      }
    });

    let syncedOnline = false;
    if (hasRemoteDb()) {
      const roots = [RTDB_BOARD_ROOT, '/weekly_boards_v2'];
      for (const root of roots) {
        try {
          const res = await fetch(`${getDbUrl()}${root}/${RTDB_FRIENDS_BUCKET}.json`, { cache: 'no-store' });
          if (res && res.ok) {
            syncedOnline = true;
            const data = await res.json();
            if (data && typeof data === 'object') {
              Object.values(data).forEach((raw) => {
                const n = normalizeFriendNode(raw);
                if (!n || !isRankedProvider(n.provider) || isLegacyUnverifiedUid(n.uid)) return;
                const prev = merged[n.uid];
                if (!prev || n.score > prev.score || (n.score === prev.score && n.updatedAt >= prev.updatedAt)) {
                  merged[n.uid] = {
                    ...n,
                    links: mergeFriendLinks(prev ? prev.links : null, n.links)
                  };
                }
              });
            }
          }
        } catch {}
      }
    }

    writeLocalFriendsDir(merged);
    const byUid = merged;
    const byKey = {};
    const list = Object.values(merged);
    list.forEach((n) => {
      if (n.friendKey) byKey[n.friendKey] = n;
    });
    return { byUid, byKey, list, syncedOnline, fetchedAt: Date.now() };
  }

  async function publishFriendProfile(entry) {
    if (!entry || !entry.uid) return { ok: false, syncedOnline: false, reason: 'missing_uid' };
    const uid = String(entry.uid);
    const friendKey = entry.friendKey || generateFriendKey(uid);
    const localDir = readLocalFriendsDir();
    const cachedSelf = normalizeFriendNode(localDir[uid]);
    let mergedLinks = mergeFriendLinks(cachedSelf ? cachedSelf.links : null, entry.links);
    let baseRev = Math.max(
      Number(entry.rev) || 0,
      cachedSelf ? cachedSelf.score : 0
    );

    const canRemote = hasRemoteDb() && isRankedProvider(entry.provider) && !isLegacyUnverifiedUid(uid);
    if (canRemote && (baseRev <= 0 || entry.pullBeforeWrite)) {
      const remoteSelf = await fetchSingleFriendNodeRemote(uid);
      if (remoteSelf) {
        baseRev = Math.max(baseRev, remoteSelf.score || 0);
        mergedLinks = mergeFriendLinks(remoteSelf.links, mergedLinks);
      }
    }

    const buildNode = (revScore) => ({
      uid,
      friendKey,
      nickname: sanitizeNickname(entry.nickname, '날씨러너'),
      provider: entry.provider || 'guest',
      score: Math.min(4999990, Math.max(1, Math.floor(revScore))),
      bestScore: Math.max(0, Math.floor(Number(entry.bestScore) || 0)),
      trophies: Math.max(0, Math.floor(Number(entry.trophies) || 0)),
      wins: Math.max(0, Math.floor(Number(entry.wins) || 0)),
      charId: entry.charId || 'umbrella_master',
      skinId: entry.skinId || null,
      profileCharId: entry.profileCharId || entry.charId || 'umbrella_master',
      profileSkinId: entry.profileSkinId !== undefined ? entry.profileSkinId : (entry.skinId || null),
      nameColor: typeof entry.nameColor === 'string' ? entry.nameColor.slice(0, 24) : '#ffffff',
      nameFrame: typeof entry.nameFrame === 'string' ? entry.nameFrame.slice(0, 16) : 'none',
      links: mergedLinks,
      updatedAt: Date.now()
    });

    let node = buildNode(baseRev + 1);
    if (isRankedProvider(node.provider) && !isLegacyUnverifiedUid(uid)) {
      localDir[uid] = normalizeFriendNode(node);
      writeLocalFriendsDir(localDir);
    }

    if (!canRemote) {
      return { ok: true, syncedOnline: false, node: normalizeFriendNode(node), rev: node.score, reason: 'local_only' };
    }

    const targets = [
      `${RTDB_BOARD_ROOT}/${RTDB_FRIENDS_BUCKET}/${encodeURIComponent(uid)}.json`,
      `/weekly_boards_v2/${RTDB_FRIENDS_BUCKET}/${encodeURIComponent(uid)}.json`
    ];

    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const bodyStr = JSON.stringify(node);
      let wrote = false;
      for (const path of targets) {
        try {
          const { url, hasToken } = await buildAuthedUrl(path, attempt === 1, true);
          if (!hasToken) continue;
          const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          });
          lastStatus = res ? res.status : 0;
          if (res && res.ok) {
            wrote = true;
            break;
          }
        } catch {}
      }
      if (wrote) {
        const norm = normalizeFriendNode(node);
        localDir[uid] = norm;
        writeLocalFriendsDir(localDir);
        return { ok: true, syncedOnline: true, node: norm, rev: norm.score, status: 200 };
      }
      // On conflict/403 (e.g. another device had higher monotonic rev score), refresh server node once and bump rev!
      if (attempt === 0) {
        const remoteSelf = await fetchSingleFriendNodeRemote(uid);
        if (remoteSelf) {
          mergedLinks = mergeFriendLinks(remoteSelf.links, mergedLinks);
          node = buildNode(Math.max(node.score, remoteSelf.score || 0) + 1);
        }
      }
    }
    return { ok: false, syncedOnline: false, node: normalizeFriendNode(node), rev: node.score, status: lastStatus };
  }

  function findUserInFriendsDir(rawInput, dir) {
    const parsed = parseFriendSearchInput(rawInput);
    if (!parsed.raw) return { found: null, parsed, reason: 'empty' };
    const list = (dir && Array.isArray(dir.list)) ? dir.list : [];
    const byKey = (dir && dir.byKey) || {};

    // 1. Exact unique BattleTag key match (e.g. #7K4M9P or 닉네임#7K4M9P or 7K4M9P)
    if (parsed.key && byKey[parsed.key]) {
      return { found: byKey[parsed.key], parsed, matchType: 'key' };
    }
    // 2. Fallback scan by key suffix / full battleTag case-insensitive
    const lowRaw = parsed.raw.toLowerCase().replace(/\s+/g, '');
    const exactTag = list.find((u) => u && u.battleTag && u.battleTag.toLowerCase().replace(/\s+/g, '') === lowRaw);
    if (exactTag) return { found: exactTag, parsed, matchType: 'battleTag' };

    if (parsed.key) {
      const keyHit = list.find((u) => u && u.friendKey === parsed.key);
      if (keyHit) return { found: keyHit, parsed, matchType: 'key' };
      return { found: null, parsed, reason: 'not_found' };
    }

    // 3. Nickname-only lookup (works cleanly when unique; prompts for #KEY if duplicate nicknames exist!)
    const lowNick = parsed.nickPart.toLowerCase();
    const nickMatches = list.filter((u) => u && u.nickname && u.nickname.toLowerCase() === lowNick);
    if (nickMatches.length === 1) {
      return { found: nickMatches[0], parsed, matchType: 'nickname' };
    }
    if (nickMatches.length > 1) {
      return { found: null, parsed, reason: 'ambiguous', matches: nickMatches };
    }
    return { found: null, parsed, reason: 'not_found' };
  }

  function computeFriendLists(myUid, myLocalLinks, dir) {
    const byUid = (dir && dir.byUid) || {};
    const remoteSelf = myUid ? byUid[myUid] : null;
    const mergedMyLinks = mergeFriendLinks(remoteSelf ? remoteSelf.links : null, myLocalLinks);
    const friends = [];
    const incoming = [];
    const outgoing = [];

    Object.values(byUid).forEach((u) => {
      if (!u || !u.uid || u.uid === myUid) return;
      const rel = deriveFriendRelation(mergedMyLinks, u.links, myUid, u.uid);
      if (rel === 'friend') {
        const myT = (mergedMyLinks[u.uid] && mergedMyLinks[u.uid].t) || 0;
        const thT = (u.links && u.links[myUid] && u.links[myUid].t) || 0;
        friends.push({ ...u, relation: 'friend', sinceAt: Math.max(myT, thT) });
      } else if (rel === 'incoming') {
        const reqAt = (u.links && u.links[myUid] && u.links[myUid].t) || u.updatedAt || 0;
        incoming.push({ ...u, relation: 'incoming', requestAt: reqAt });
      } else if (rel === 'outgoing') {
        const reqAt = (mergedMyLinks[u.uid] && mergedMyLinks[u.uid].t) || 0;
        outgoing.push({ ...u, relation: 'outgoing', requestAt: reqAt });
      }
    });

    const now = Date.now();
    const isRecent = (u) => (now - (u.updatedAt || 0)) < 10 * 60 * 1000;
    friends.sort((a, b) => (Number(isRecent(b)) - Number(isRecent(a))) || ((b.trophies || 0) - (a.trophies || 0)) || ((b.bestScore || 0) - (a.bestScore || 0)));
    incoming.sort((a, b) => (b.requestAt || 0) - (a.requestAt || 0));
    outgoing.sort((a, b) => (b.requestAt || 0) - (a.requestAt || 0));

    return { friends, incoming, outgoing, mergedMyLinks, remoteRev: remoteSelf ? (remoteSelf.score || 0) : 0 };
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
    getKstDayInfo,
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
    submitDailyWeatherScore,
    fetchDailyWeatherBoard,
    submitTrophyProfile,
    fetchTrophyBoard,
    detectClientPlatform,
    getCompServerNow,
    getCompTierBand,
    joinCompQueue,
    heartbeatCompQueue,
    pollCompQueue,
    leaveCompQueue,
    makeCompDuoPartyId,
    publishCompDuoState,
    pollCompDuoDirectory,
    joinCompActiveRoom,
    joinCompMatchRoom,
    pollCompMatchRoom,
    leaveCompMatchRoom,
    pushCompLiveScore,
    checkWeeklyChampionPayout,
    generateFriendKey,
    formatBattleTag,
    parseFriendSearchInput,
    sanitizeFriendLinks,
    mergeFriendLinks,
    deriveFriendRelation,
    fetchFriendsDirectory,
    publishFriendProfile,
    findUserInFriendsDir,
    computeFriendLists,
    onBoardUpdate
  };
})();
