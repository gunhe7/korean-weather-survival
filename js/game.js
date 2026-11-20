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

  function createDefaultCharLevels() {
    const lv = {};
    DATA.CHARACTERS.forEach((c) => { lv[c.id] = 1; });
    return lv;
  }

  // ===================== PERSISTENT SAVE DATA (SAFE MIGRATION + BACKUP) =====================
  function loadSave() {
    const today = getTodayKey();
    const def = {
      gold: 150,
      unlockedChars: ['umbrella_master'],
      selectedChar: 'umbrella_master',
      charLevels: createDefaultCharLevels(),
      upgrades: { hp: 0, magnet: 0, defense: 0, score: 0 },
      boosters: { norway: 0, shield: 0, boost: 0 },
      bestScore: 0,
      bestYear: 1,
      bestDistanceM: 0,
      totalCoinsEver: 0,
      maxDodgeComboEver: 0,
      playCount: 0,
      attendance: { lastClaimDate: '', streak: 0 },
      dailyMissions: { date: today, progress: { dist: 0, coins: 0, jumps: 0 }, claimed: {} },
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

    const rawMissions = raw.dailyMissions && raw.dailyMissions.date === today ? raw.dailyMissions : def.dailyMissions;

    return {
      ...def,
      ...raw,
      gold: typeof raw.gold === 'number' && Number.isFinite(raw.gold) ? Math.max(0, Math.floor(raw.gold)) : def.gold,
      unlockedChars: rawUnlocked,
      selectedChar: migratedSelected,
      charLevels: mergedLevels,
      upgrades: { ...def.upgrades, ...(raw.upgrades || {}) },
      boosters: { ...def.boosters, ...(raw.boosters || {}) },
      bestDistanceM: typeof raw.bestDistanceM === 'number' ? raw.bestDistanceM : 0,
      totalCoinsEver: typeof raw.totalCoinsEver === 'number' ? raw.totalCoinsEver : 0,
      maxDodgeComboEver: typeof raw.maxDodgeComboEver === 'number' ? raw.maxDodgeComboEver : 0,
      attendance: { ...def.attendance, ...(raw.attendance || {}) },
      dailyMissions: {
        date: today,
        progress: { dist: 0, coins: 0, jumps: 0, ...(rawMissions.progress || {}) },
        claimed: { ...(rawMissions.claimed || {}) }
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
        progress: { dist: 0, coins: 0, jumps: 0 },
        claimed: {}
      };
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
  let currentShopSubtab = 'upgrades';
  let previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));
  let detailCharIdx = null;

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
    btnOpenSettings: document.getElementById('btn-open-settings'),

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
    tabMissionList: document.getElementById('tab-mission-list'),
    tabAchSummary: document.getElementById('tab-ach-summary'),
    tabAchList: document.getElementById('tab-ach-list'),

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
    resScore: document.getElementById('res-score'),
    btnResultHome: document.getElementById('btn-result-home'),

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
    el.headerBestScore.textContent = save.bestScore.toLocaleString('ko-KR');

    renderAttendanceUI();
    renderAchievementsUI();
    renderSettingsUI();
    renderHomeCharStage();
    renderDailyMissions();
    renderCharList();
    renderShopList();
    renderRankingTab();
    updateNavMissionDot();
    if (detailCharIdx !== null) renderCharDetailModal();
  }

  function updateNavMissionDot() {
    ensureTodayMissions();
    const prog = save.dailyMissions.progress || {};
    const claimed = save.dailyMissions.claimed || {};
    const hasMissionClaim = DATA.DAILY_MISSIONS.some((m) => (prog[m.metric] || 0) >= m.target && !claimed[m.id]);
    const hasAchClaim = DATA.ACHIEVEMENTS.some((a) => getAchievementMetricValue(a.metric) >= a.target && !(save.achievementsClaimed && save.achievementsClaimed[a.id]));
    const hasAtt = canClaimAttendanceToday();
    el.navMissionDot.classList.toggle('hidden', !(hasMissionClaim || hasAchClaim || hasAtt));
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

    el.rankMyAvatar.src = myChar.avatar;
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
    const containers = [el.achList, el.tabAchList].filter(Boolean);
    containers.forEach((c) => { c.innerHTML = ''; });

    DATA.ACHIEVEMENTS.forEach((ach) => {
      const val = getAchievementMetricValue(ach.metric);
      const isDone = val >= ach.target;
      const isClaimed = Boolean(save.achievementsClaimed && save.achievementsClaimed[ach.id]);
      if (isDone) unlockedCount += 1;
      if (isDone && !isClaimed) claimableCount += 1;

      const pct = Math.min(100, (val / ach.target) * 100);
      containers.forEach((container) => {
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
          btn.textContent = `+${ach.rewardGold}G`;
          btn.onclick = () => {
            save.achievementsClaimed[ach.id] = true;
            save.gold += ach.rewardGold;
            SFX.reward();
            persistSave();
            refreshAllMenus();
            showToast(`🏅 업적 [${ach.title}] 보상 +${ach.rewardGold}G 획득!`);
          };
        } else {
          btn.className = 'mission-claim-btn pending';
          btn.textContent = `+${ach.rewardGold}G`;
          btn.disabled = true;
        }
        card.appendChild(btn);
        container.appendChild(card);
      });
    });

    el.achModalSummary.textContent = `달성 현황: ${unlockedCount} / ${DATA.ACHIEVEMENTS.length} (미수령 ${claimableCount}개)`;
    if (el.tabAchSummary) {
      el.tabAchSummary.textContent = `${unlockedCount} / ${DATA.ACHIEVEMENTS.length}`;
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
      cell.className = `att-day-cell${idx === 6 ? ' day7' : ''}${isClaimed ? ' claimed' : ''}${isToday ? ' today' : ''}`;
      const ico = isClaimed ? '✅' : (rw.booster === 'norway' ? '🇳🇴' : rw.booster === 'shield' ? '🛡️' : rw.booster === 'boost' ? '⚡' : '🪙');
      cell.innerHTML = `
        <span class="att-day-num">${rw.day}일차</span>
        <span class="att-day-ico">${ico}</span>
        <span class="att-day-val">${rw.label}</span>
      `;
      el.attDaysGrid.appendChild(cell);
    });

    if (claimable) {
      const rw = DATA.ATTENDANCE_REWARDS[dayIdx];
      el.attModalDesc.textContent = `오늘(${rw.day}일차) 출석 보상: ${rw.label} (+${rw.gold}G)`;
      el.btnClaimAttendance.disabled = false;
      el.btnClaimAttendance.textContent = `🎁 ${rw.day}일차 출석 보상 받기!`;
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
    save.gold += rw.gold;
    if (rw.booster) {
      save.boosters[rw.booster] = (save.boosters[rw.booster] || 0) + 1;
    }
    save.attendance = {
      lastClaimDate: getTodayKey(),
      streak: ((save.attendance && save.attendance.streak) || 0) + 1
    };
    SFX.reward();
    persistSave();
    refreshAllMenus();
    showToast(`🎁 ${rw.day}일차 출석 보상 수령! (${rw.label})`);
  }

  function renderDailyMissions() {
    ensureTodayMissions();
    const prog = save.dailyMissions.progress || {};
    const claimed = save.dailyMissions.claimed || {};
    const container = el.tabMissionList;
    if (!container) return;
    container.innerHTML = '';

    DATA.DAILY_MISSIONS.forEach((m) => {
      const cur = Math.min(m.target, Math.floor(prog[m.metric] || 0));
      const pct = Math.min(100, (cur / m.target) * 100);
      const isDone = cur >= m.target;
      const isClaimed = Boolean(claimed[m.id]);

      const row = document.createElement('div');
      row.className = 'mission-row';
      row.innerHTML = `
        <div class="mission-row-info">
          <div class="mission-row-top">
            <span>${m.title}</span>
            <span class="mission-row-prog">${cur.toLocaleString('ko-KR')}/${m.target.toLocaleString('ko-KR')}${m.unit}</span>
          </div>
          <div class="mission-mini-track">
            <div class="mission-mini-fill" style="width: ${pct.toFixed(1)}%"></div>
          </div>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (isClaimed) {
        btn.className = 'mission-claim-btn done';
        btn.textContent = '완료 ✓';
        btn.disabled = true;
      } else if (isDone) {
        btn.className = 'mission-claim-btn ready';
        btn.textContent = `수령 +${m.rewardGold}G`;
        btn.onclick = () => {
          save.dailyMissions.claimed[m.id] = true;
          save.gold += m.rewardGold;
          SFX.reward();
          persistSave();
          refreshAllMenus();
          showToast(`🎉 미션 완료! +${m.rewardGold}G 획득!`);
        };
      } else {
        btn.className = 'mission-claim-btn pending';
        btn.textContent = `+${m.rewardGold}G`;
        btn.disabled = true;
      }

      row.appendChild(btn);
      container.appendChild(row);
    });
  }

  function renderHomeCharStage() {
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);
    const stats = getCharStats(ch);
    const tierCls = `tier-${ch.auraType || 'basic'}`;

    el.homeHeroStage.className = `bs-home-stage ${tierCls}${unlocked ? '' : ' locked'}`;
    el.homeHeroImg.src = ch.avatar;
    el.homeHeroImg.alt = ch.name;
    el.homeCharLvBadge.textContent = unlocked ? `POWER ${stats.level}` : '잠금';
    el.homeCharTier.textContent = unlocked ? ch.tier : `🔒 ${ch.price.toLocaleString('ko-KR')}G`;
    el.homeCharName.textContent = ch.name;

    // Brawl Stars Bottom-Left Character Switcher Badge
    el.homeBrawlerMini.src = ch.avatar;
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
    const isMaxLv = stats.level >= DATA.MAX_CHAR_LEVEL;
    const lvPrice = DATA.getCharLevelPrice(stats.level);
    const tierCls = `tier-${ch.auraType || 'basic'}`;

    el.detailHeroStage.className = `brawl-hero-stage ${tierCls}`;
    el.detailCharTier.textContent = ch.tier;
    el.detailCharName.textContent = ch.name;
    el.detailCharLv.textContent = unlocked
      ? `POWER Lv.${stats.level} / ${DATA.MAX_CHAR_LEVEL}`
      : `🔒 ${ch.price.toLocaleString('ko-KR')}G 필요`;
    el.detailEquippedPill.classList.toggle('hidden', !selected);
    el.detailCharImg.src = ch.avatar;
    el.detailCharDesc.textContent = ch.desc;

    el.detailStatHp.textContent = `${stats.maxHp}칸`;
    el.detailFillHp.style.width = `${Math.min(100, Math.round((stats.maxHp / 12) * 100))}%`;
    el.detailStatGold.textContent = `${Math.round(stats.goldMult * 100)}%`;
    el.detailFillGold.style.width = `${Math.min(100, Math.round(((stats.goldMult - 0.7) / 1.0) * 100))}%`;
    el.detailStatScore.textContent = `${Math.round(stats.scoreMult * 100)}%`;
    el.detailFillScore.style.width = `${Math.min(100, Math.round(((stats.scoreMult - 0.7) / 1.0) * 100))}%`;

    el.detailPassiveIco.textContent = ch.icon || '★';
    el.detailPassiveName.textContent = ch.passiveName;
    el.detailPassiveDesc.textContent = ch.passiveDesc;

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
    el.dexBonusText.textContent = `현재 도감 효과: 전체 점수 +${dexBonusPct}% (캐릭터 추가 해금당 +3%)`;

    el.charList.innerHTML = '';
    DATA.CHARACTERS.forEach((ch, idx) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;
      const stats = getCharStats(ch);
      const tierCls = `tier-${ch.auraType || 'basic'}`;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `brawl-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.setAttribute('aria-label', `${ch.name} 능력치 상세 보기`);
      card.innerHTML = `
        <div class="brawl-card-stage ${tierCls}">
          <span class="brawl-lv-chip">${unlocked ? `Lv.${stats.level}` : `🔒 ${ch.price}G`}</span>
          ${selected ? '<span class="brawl-eq-chip">장착 중</span>' : ''}
          <img src="${ch.avatar}" alt="${ch.name}" class="brawl-card-img" />
          <span class="brawl-tap-hint">터치해 능력 보기</span>
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

    if (currentShopSubtab === 'upgrades') {
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
    save.dailyMissions.progress.dist = (save.dailyMissions.progress.dist || 0) + (run.distanceM || 0);
    save.dailyMissions.progress.coins = (save.dailyMissions.progress.coins || 0) + (run.coinsCollected || 0);
    save.dailyMissions.progress.jumps = (save.dailyMissions.progress.jumps || 0) + (run.jumpCount || 0);
    persistSave();
  }

  function startRun() {
    const ch = getCharDef(save.selectedChar);
    const stats = getCharStats(ch);
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
      sliding: false,
      slideInputHeld: false,
      iceSlideInertia: 0,
      iceSlipTimer: 0,
      gliding: false,

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

    el.runPortraitImg.src = ch.avatar;
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
      Renderer.spawnFloater(`우산 접기 (쿨타임 ${cd}초)`, '#8ce0ff', run.playerX + 10, run.playerY - 42);
    } else {
      run.umbrellaOn = true;
      run.umbrellaActiveTimer = GEAR_DURATION;
      run.rainExposeTimer = 0;
      SFX.click();
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
    run.dodgeCombo = 0;
    triggerCameraShake(7, 0.28);
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
      Renderer.spawnFloater(`마스크 벗기 (쿨타임 ${cd}초)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
    } else {
      run.maskOn = true;
      run.maskActiveTimer = GEAR_DURATION;
      run.dustExposeTimer = 0;
      SFX.click();
      Renderer.spawnFloater(`KF94 마스크 ON! (${GEAR_DURATION}초 지속)`, '#a6ffcf', run.playerX + 10, run.playerY - 42);
    }
    updateRunHud();
  }

  function doJumpPress() {
    if (!run || !run.active || paused) return;
    run.jumpHeld = true;
    if (run.sliding && !run.slideInputHeld) run.sliding = false;

    if (run.jumpsLeft > 0) {
      const ch = getCharDef(run.charId);
      const isSecond = run.jumpsLeft === 1;
      // Flood drag weakens ground jump height unless jumping off a dry car roof / bench (우비 소년 mitigates!)
      const inFloodWater = run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2;
      const floodFactor = inFloodWater ? (ch.floodResist ? 0.94 : 0.78) : 1.0;

      run.vy = (isSecond ? -338 : -380) * floodFactor;
      run.jumpsLeft -= 1;
      run.jumpCount += 1;
      run.onPlatform = false;
      if (isSecond) {
        SFX.doubleJump();
        Renderer.spawnFloater('2단 점프!', '#9be6ff', run.playerX, run.playerY - 40);
      } else {
        SFX.jump();
        if (inFloodWater && !ch.floodResist) Renderer.spawnFloater('침수 저항!', '#75c4ff', run.playerX, run.playerY - 36);
      }
    }
  }

  function doJumpRelease() {
    if (!run) return;
    run.jumpHeld = false;
    run.gliding = false;
  }

  function doSlideStart() {
    if (!run || !run.active || paused) return;
    run.slideInputHeld = true;
    if (!run.sliding) SFX.slide();
    run.sliding = true;
    if (run.playerY < run.currentFloorY) {
      run.vy = Math.max(run.vy, 340);
    }
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
    const pool = DATA.SEASON_WEATHER_POOL[run.seasonId] || ['rain', 'gust', 'dust'];
    const candidates = pool.filter((w) => w !== run.weatherEvent);
    const nextW = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];

    run.pendingWeather = nextW;
    run.forecastCountdown = 3.0;
    // KMA gives a fake forecast 62% of the time unless Norway Yr.no is active!
    run.forecastIsFake = !hasNorwayForecast() && nextW !== 'clear' && Math.random() < 0.65;
  }

  function activatePendingWeather() {
    const nextW = run.pendingWeather || 'clear';
    const wasFake = run.forecastIsFake && !hasNorwayForecast();

    run.weatherEvent = nextW;
    run.pendingWeather = null;
    run.weatherEventTimer = 8.5 + Math.random() * 2.5;
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
      extraSpeed: (preset.speedBonus || 0) * diff.speedMult
    });

    const coinX0 = startX - 24;
    if (preset.lane === 'low') {
      for (let i = 0; i < 5; i++) {
        const arc = Math.sin((i / 4) * Math.PI) * 52;
        run.items.push({ kind: 'coin', x: coinX0 + i * 24, y: Renderer.GROUND_Y - 16 - arc });
      }
    } else if (preset.lane === 'tall') {
      for (let i = 0; i < 5; i++) {
        const arc = Math.sin((i / 4) * Math.PI) * 86;
        run.items.push({ kind: i === 2 ? 'big_coin' : 'coin', x: coinX0 + i * 24, y: Renderer.GROUND_Y - 18 - arc });
      }
    } else if (preset.lane === 'air') {
      for (let i = 0; i < 5; i++) {
        run.items.push({ kind: 'coin', x: startX - 10 + i * 22, y: Renderer.GROUND_Y - 11 });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        run.items.push({ kind: 'coin', x: startX + 36 + i * 22, y: Renderer.GROUND_Y - 22 });
      }
    }
  }

  function spawnUtilityPickup() {
    const r = Math.random();
    const y = Renderer.GROUND_Y - (Math.random() < 0.5 ? 28 : 74);
    if (r < 0.18) {
      run.items.push({ kind: 'norway', x: Renderer.W + 24, y });
    } else if (r < 0.38) {
      run.items.push({ kind: 'coffee', x: Renderer.W + 24, y });
    } else if (r < 0.54) {
      run.items.push({ kind: 'star', x: Renderer.W + 24, y });
    } else if (r < 0.67) {
      run.items.push({ kind: 'magnet', x: Renderer.W + 24, y });
    } else if (r < 0.80) {
      run.items.push({ kind: 'speed_boost', x: Renderer.W + 24, y });
    } else if (r < 0.88) {
      run.items.push({ kind: 'shield_item', x: Renderer.W + 24, y });
    } else if (r < 0.94) {
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
      for (let i = 0; i < 3; i++) {
        run.items.push({ kind: 'coin', x: Renderer.W + 42 + i * 22, y: platformY - 16 });
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
      for (let i = 0; i < 5; i++) {
        const arc = Math.sin((i / 4) * Math.PI) * 95;
        run.items.push({ kind: i === 2 ? 'big_coin' : 'coin', x: Renderer.W + 64 + i * 24, y: Renderer.GROUND_Y - 36 - arc });
      }
    } else {
      run.features.push({ kind: 'cool_spot', x: Renderer.W + 40, w: 78, triggered: false, isShade: true });
    }
  }

  // ===================== MAIN RUN UPDATE =====================
  function updateRun(dt) {
    if (!run || !run.active || paused) return;

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
      const yearGoldBonus = 45 + run.year * 10;
      run.score += Math.round(600 * run.year * run.scoreMult);
      run.gold += yearGoldBonus;
      run.winPoseTimer = 0.9;
      SFX.yearUp();
      showRunBanner(`🔥 ${run.year}년 차 진입! 기후 위기 상승! (+${yearGoldBonus}G)`, 2800);
      Renderer.spawnFloater(`${run.year}년 차 돌파!`, '#ffe55c', run.playerX + 40, run.playerY - 52);
      checkStageMilestone(run.year, 0);
    } else if (newSeasonIdx !== run.seasonIdx) {
      run.prevSeasonId = run.seasonId;
      run.seasonTransition = 0;
      run.seasonIdx = newSeasonIdx;
      const sObj = DATA.SEASONS[run.seasonIdx];
      run.seasonId = sObj.id;
      run.score += Math.round(200 * run.year * run.scoreMult);
      run.gold += 15;
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

    // Vertical Physics + One-Way Elevated Street Platforms (Car Roof / Bench / Bus Stop Roof)
    const prevY = run.playerY;
    const gravity = (run.weatherEvent === 'gust' && run.vy < 180) ? 740 : 1080; // Longer hangtime in typhoon gust!
    run.vy += gravity * dt;

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
      run.gliding = false;
      run.onPlatform = landedPlatform;
      if (wasAir && run.weatherEvent === 'ice_road' && !landedPlatform && !ch.iceMastery) {
        run.iceSlipTimer = 0.28; // Slippery landing on winter ice (Skier has full control!)
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
        run.jumpsLeft = 1;
        run.onPlatform = false;
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
    const rainExposeLimit = (run.weatherEvent === 'flood' ? 4.0 : 3.0) + (ch.rainGraceBonus || 0);
    const dustExposeLimit = 3.0;
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

      // 3. Summer Heat Gauge (only builds in active heatwave outside shade)
      if (run.weatherEvent === 'heat' && !ch.summerImmune) {
        if (inShade) {
          run.heatGauge = Math.max(0, run.heatGauge - 46 * dt);
          if (run.shadeScoreCd <= 0) {
            run.shadeScoreCd = 1.1;
            run.score += Math.round(60 * upgradeScoreMult);
            Renderer.spawnFloater('그늘 밟기! 냉각', '#7ae8ff', run.playerX + 8, run.playerY - 42);
          }
        } else {
          run.heatGauge = Math.min(100, run.heatGauge + 15 * dt);
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
        run.passingCarCd = 6.5 + Math.random() * 3.0;
        run.passingCar = { phase: 'warn', timer: 1.15, x: Renderer.W + 30 };
        SFX.fakeAlert();
      }
    }

    // ---- SPAWN TIMERS ----
    run.obstacleCd -= dt;
    if (run.obstacleCd <= 0) {
      spawnObstacleWave();
      const baseInterval = 1.72 / diff.spawnRateMult;
      run.obstacleCd = Math.max(0.86, baseInterval + (Math.random() - 0.35) * 0.36);
    }

    run.itemCd -= dt;
    if (run.itemCd <= 0) {
      spawnUtilityPickup();
      run.itemCd = 3.6 + Math.random() * 1.8;
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
    const magnetRadius = hasSuperMagnet ? 155 : 34 + save.upgrades.magnet * 22;

    for (let i = run.items.length - 1; i >= 0; i--) {
      const it = run.items[i];
      it.x -= run.speed * dt;

      const pcx = pBox.x + pBox.w / 2;
      const pcy = pBox.y + pBox.h / 2;
      const dist = Math.hypot(it.x - pcx, it.y - pcy);

      if ((it.kind === 'coin' || it.kind === 'big_coin' || it.kind === 'star') && dist < magnetRadius && dist > 16) {
        const pull = (hasSuperMagnet ? 430 : 250) * dt;
        it.x += ((pcx - it.x) / dist) * pull;
        it.y += ((pcy - it.y) / dist) * pull;
      }

      if (dist < 25) {
        run.items.splice(i, 1);
        if (it.kind === 'coin' || it.kind === 'big_coin') {
          const baseG = (it.kind === 'big_coin' ? 12 : 3) + diff.goldBonus;
          const gainedG = Math.max(1, Math.round(baseG * run.goldMult));
          const gainedS = Math.round((it.kind === 'big_coin' ? 120 : 30) * run.scoreMult * upgradeScoreMult);
          run.gold += gainedG;
          run.coinsCollected += it.kind === 'big_coin' ? 3 : 1;
          run.score += gainedS;
          addFeverCharge(it.kind === 'big_coin' ? 10 : 2.5);
          Renderer.spawnPickupEffect(it.x, it.y, '#ffe55c', it.kind === 'big_coin');
          if (it.kind === 'big_coin') {
            SFX.bigCoin();
            Renderer.spawnFloater(`+${gainedG}G!`, '#ffea59', it.x, it.y - 10);
          } else {
            SFX.coin();
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
          const bonusG = Math.round(32 * run.goldMult);
          run.gold += bonusG;
          run.coinsCollected += 10;
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
            run.gold += 5;
            SFX.coin();
            Renderer.spawnFloater('NEAR MISS +5G!', '#ff9ce6', run.playerX + 10, run.playerY - 45);
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
    run.dodgeCombo = 0;
    triggerCameraShake(7, 0.28);

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
    const seasonObj = DATA.SEASONS[run.seasonIdx];

    el.runYearNum.textContent = `${run.year}Y`;
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
    const rainLimit = (run.weatherEvent === 'flood' ? 4.0 : 3.0) + (ch.rainGraceBonus || 0);
    const dustLimit = 3.0;
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
    const distGoldBonus = Math.floor(run.elapsed * 0.7);
    const totalGoldEarned = run.gold + distGoldBonus;

    if (finalScore > (save.bestScore || 0)) save.bestScore = finalScore;
    if (finalDist > (save.bestDistanceM || 0)) save.bestDistanceM = finalDist;
    if (run.year > save.bestYear) save.bestYear = run.year;
    save.totalCoinsEver = (save.totalCoinsEver || 0) + (run.coinsCollected || 0);
    if ((run.maxDodgeCombo || 0) > (save.maxDodgeComboEver || 0)) {
      save.maxDodgeComboEver = run.maxDodgeCombo;
    }
    save.gold += totalGoldEarned;
    save.playCount += 1;
    persistSave();

    el.resScore.textContent = `${finalScore.toLocaleString('ko-KR')}점`;
    el.gameoverOverlay.classList.remove('hidden');
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
    el.btnHomeCharInfo.addEventListener('click', () => openCharDetail(previewCharIdx));
    el.btnHomeBrawlers.addEventListener('click', () => switchTab('chars'));

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
