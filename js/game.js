(function () {
  const DATA = window.RUN_DATA;
  const SFX = window.SFX;
  const Renderer = window.RunRenderer;

  const SAVE_KEY = 'kr_weather_runner_save_v1';

  // ===================== PERSISTENT SAVE DATA =====================
  function loadSave() {
    const def = {
      gold: 150,
      unlockedChars: ['basic'],
      selectedChar: 'basic',
      upgrades: { hp: 0, magnet: 0, defense: 0, score: 0 },
      boosters: { norway: 0, shield: 0, boost: 0 },
      bestScore: 0,
      bestYear: 1,
      playCount: 0
    };
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!raw) return def;
      return {
        ...def,
        ...raw,
        unlockedChars: Array.isArray(raw.unlockedChars) && raw.unlockedChars.length ? raw.unlockedChars : ['basic'],
        upgrades: { ...def.upgrades, ...(raw.upgrades || {}) },
        boosters: { ...def.boosters, ...(raw.boosters || {}) }
      };
    } catch {
      return def;
    }
  }

  let save = loadSave();

  function persistSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // ignore storage errors
    }
  }

  // ===================== APP UI STATE =====================
  let currentTab = 'home';
  let currentShopSubtab = 'upgrades';
  let previewCharIdx = Math.max(0, DATA.CHARACTERS.findIndex((c) => c.id === save.selectedChar));

  // ===================== ACTIVE RUN STATE =====================
  let run = null;
  let paused = false;

  // ===================== DOM REFERENCES =====================
  const el = {
    introOverlay: document.getElementById('intro-overlay'),
    btnIntroEnter: document.getElementById('btn-intro-enter'),
    btnReplayIntro: document.getElementById('btn-replay-intro'),
    headerBestScore: document.getElementById('header-best-score'),
    btnGoldShop: document.getElementById('btn-gold-shop'),
    uiGold: document.getElementById('ui-gold'),
    btnSoundGlobal: document.getElementById('btn-sound-global'),

    homeProfileAvatar: document.getElementById('home-profile-avatar'),
    homeCharName: document.getElementById('home-char-name'),
    homeBestYear: document.getElementById('home-best-year'),
    homeCharHp: document.getElementById('home-char-hp'),
    homePlayCount: document.getElementById('home-play-count'),
    homeBoosterSummary: document.getElementById('home-booster-summary'),
    btnPassShop: document.getElementById('btn-pass-shop'),

    homePreviewCanvas: document.getElementById('homePreviewCanvas'),
    homeCharTier: document.getElementById('home-char-tier'),
    homeCharDesc: document.getElementById('home-char-desc'),
    btnPrevChar: document.getElementById('btn-prev-char'),
    btnNextChar: document.getElementById('btn-next-char'),

    btnDockChars: document.getElementById('btn-dock-chars'),
    dockCharThumb: document.getElementById('dock-char-thumb'),
    dockOwnedCount: document.getElementById('dock-owned-count'),
    btnPlayStart: document.getElementById('btn-play-start'),
    btnPlayLabel: document.getElementById('btn-play-label'),
    btnPlaySub: document.getElementById('btn-play-sub'),
    btnDockShop: document.getElementById('btn-dock-shop'),
    dockBoosterCount: document.getElementById('dock-booster-count'),

    charList: document.getElementById('char-list'),
    shopItemsList: document.getElementById('shop-items-list'),

    viewRun: document.getElementById('view-run'),
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
    gearUmbrellaState: document.getElementById('gear-umbrella-state'),
    btnToggleMask: document.getElementById('btn-toggle-mask'),
    gearMaskState: document.getElementById('gear-mask-state'),
    orbUiFever: document.getElementById('orb-ui-fever'),
    orbUiMagnet: document.getElementById('orb-ui-magnet'),
    orbUiNorway: document.getElementById('orb-ui-norway'),
    orbUiShield: document.getElementById('orb-ui-shield'),
    btnPauseRun: document.getElementById('btn-pause-run'),

    pauseOverlay: document.getElementById('pause-overlay'),
    btnResumeRun: document.getElementById('btn-resume-run'),
    btnQuitHome: document.getElementById('btn-quit-home'),

    gameoverOverlay: document.getElementById('gameover-overlay'),
    resNewBest: document.getElementById('res-new-best'),
    resScore: document.getElementById('res-score'),
    resCause: document.getElementById('res-cause'),
    resSurvived: document.getElementById('res-survived'),
    resGoldEarned: document.getElementById('res-gold-earned'),
    resCharName: document.getElementById('res-char-name'),
    resGoldTotal: document.getElementById('res-gold-total'),
    btnRetryRun: document.getElementById('btn-retry-run'),
    btnResultHome: document.getElementById('btn-result-home'),

    globalToast: document.getElementById('global-toast')
  };

  const homeCtx = el.homePreviewCanvas.getContext('2d');
  const runCtx = el.runCanvas.getContext('2d');

  // ===================== HELPERS =====================
  function getCharDef(id) {
    return DATA.CHARACTERS.find((c) => c.id === id) || DATA.CHARACTERS[0];
  }

  function isCharUnlocked(id) {
    return save.unlockedChars.includes(id);
  }

  function getMaxHp(charDef) {
    return charDef.baseHp + save.upgrades.hp * 14;
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

  // ===================== HOME / CHARS / SHOP UI RENDER =====================
  function refreshAllMenus() {
    el.uiGold.textContent = save.gold.toLocaleString('ko-KR');
    el.headerBestScore.textContent = save.bestScore.toLocaleString('ko-KR');
    el.homeBestYear.textContent = `${save.bestYear}년 차`;
    el.homePlayCount.textContent = `${save.playCount}회`;

    const totalBoosters = (save.boosters.norway || 0) + (save.boosters.shield || 0) + (save.boosters.boost || 0);
    el.dockBoosterCount.textContent = totalBoosters;
    el.dockOwnedCount.textContent = `${save.unlockedChars.length}/${DATA.CHARACTERS.length}`;

    if (save.boosters.norway > 0) el.homeBoosterSummary.textContent = '🇳🇴 노르웨이 ON';
    else if (totalBoosters > 0) el.homeBoosterSummary.textContent = `출발 버프 ${totalBoosters}개`;
    else el.homeBoosterSummary.textContent = '상점에서 준비';

    renderHomeCharStage();
    renderCharList();
    renderShopList();
  }

  function renderHomeCharStage() {
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);

    el.homeProfileAvatar.src = ch.avatar;
    el.dockCharThumb.src = getCharDef(save.selectedChar).avatar;
    el.homeCharTier.textContent = unlocked ? ch.tier : `🔒 ${ch.price}G`;
    el.homeCharName.textContent = ch.name;
    el.homeCharHp.textContent = getMaxHp(ch);
    el.homeCharDesc.textContent = ch.desc;

    if (unlocked) {
      el.btnPlayStart.disabled = false;
      el.btnPlayLabel.textContent = '달리기 시작!';
      el.btnPlaySub.textContent = `${ch.name} · 사계절 무한 생존`;
    } else {
      el.btnPlayStart.disabled = save.gold < ch.price;
      el.btnPlayLabel.textContent = `🔒 ${ch.price.toLocaleString('ko-KR')}G 해금`;
      el.btnPlaySub.textContent = `${ch.name} 즉시 구매`;
    }
  }

  function renderCharList() {
    el.charList.innerHTML = '';
    DATA.CHARACTERS.forEach((ch, idx) => {
      const unlocked = isCharUnlocked(ch.id);
      const selected = save.selectedChar === ch.id;

      const card = document.createElement('div');
      card.className = `item-card${selected ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="item-avatar"><img src="${ch.avatar}" alt="${ch.name}" class="item-avatar-img" /></div>
        <div class="item-meta">
          <div class="item-title-row">
            <span class="item-name">${ch.name}</span>
            <span class="item-badge">${ch.tier}</span>
            ${selected ? '<span class="item-badge equipped">장착 중</span>' : ''}
          </div>
          <div class="item-desc">${ch.desc}</div>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (selected) {
        btn.className = 'item-action-btn done';
        btn.textContent = '장착 완료';
        btn.disabled = true;
      } else if (unlocked) {
        btn.className = 'item-action-btn blue';
        btn.textContent = '선택';
        btn.onclick = () => {
          SFX.click();
          save.selectedChar = ch.id;
          previewCharIdx = idx;
          persistSave();
          refreshAllMenus();
          showToast(`${ch.name} 캐릭터를 장착했습니다!`);
        };
      } else {
        btn.className = 'item-action-btn';
        btn.textContent = `${ch.price} G`;
        btn.disabled = save.gold < ch.price;
        btn.onclick = () => buyCharacter(ch, idx);
      }

      card.appendChild(btn);
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
  function startRun() {
    const ch = getCharDef(save.selectedChar);
    const maxHp = getMaxHp(ch);

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
      dead: false,
      charId: ch.id,
      hp: maxHp,
      maxHp,
      score: 0,
      gold: 0,
      elapsed: 0,
      year: 1,
      seasonIdx: 0,
      seasonId: 'spring',
      scroll: 0,
      baseSpeed: 188,
      speed: 188,

      // Player physics
      basePlayerX: 98,
      playerX: 98,
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

      // Strategic Gear Toggles (3rd Button Gimmick!)
      umbrellaOn: false,
      umbrellaBrokenTimer: 0,
      maskOn: false,

      // Buffs & Timers
      invulnTimer: 0,
      shield: hasShield,
      feverCharge: startFever > 0 ? 100 : 0,
      feverTimer: startFever,
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
      obstacleCd: 1.3,
      itemCd: 2.6,
      obstacles: [],
      items: [],
      lastHitCause: '극한 한국 날씨에 체력이 다했습니다!'
    };

    el.runPortraitImg.src = ch.avatar;
    el.mudOverlay.classList.add('hidden');
    el.gameoverOverlay.classList.add('hidden');
    el.pauseOverlay.classList.add('hidden');
    el.viewRun.classList.remove('hidden');

    SFX.seasonUp();
    showRunBanner('🌸 1년 차 봄 출발! 날씨 예보를 주시하세요!', 2400);
    updateRunHud();
  }

  function hasNorwayForecast() {
    return Boolean(run && (run.norwayPermanent || run.norwayTimer > 0));
  }

  function toggleUmbrella() {
    if (!run || !run.active || paused) return;
    if (run.umbrellaBrokenTimer > 0) {
      SFX.hit();
      Renderer.spawnFloater(`우산 수리 중 (${Math.ceil(run.umbrellaBrokenTimer)}초)`, '#ff9e9e', run.playerX + 10, run.playerY - 42);
      return;
    }
    run.umbrellaOn = !run.umbrellaOn;
    SFX.click();
    Renderer.spawnFloater(run.umbrellaOn ? '우산 펴기! (폭우 방어)' : '우산 접기', '#8ce0ff', run.playerX + 10, run.playerY - 42);

    // Immediate danger if opened during a roaring wind gust!
    if (run.umbrellaOn && run.weatherEvent === 'gust') {
      breakUmbrellaByGust();
    }
    updateRunHud();
  }

  function breakUmbrellaByGust() {
    run.umbrellaOn = false;
    run.umbrellaBrokenTimer = 5.0;
    run.hitPoseTimer = 0.5;
    SFX.umbrellaBreak();
    const dmg = 16;
    run.hp = Math.max(0, run.hp - dmg);
    run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, 강풍 속에 우산을 펴다 뒤집혀 쓰러졌습니다!`;
    Renderer.spawnFloater(`강풍에 우산 파손!! -${dmg}`, '#ff5c5c', run.playerX + 16, run.playerY - 48);
    showRunBanner('💨 돌풍에 우산이 뒤집혔습니다!! (5초 사용 불가)', 2200);
  }

  function toggleMask() {
    if (!run || !run.active || paused) return;
    run.maskOn = !run.maskOn;
    SFX.click();
    Renderer.spawnFloater(run.maskOn ? 'KF94 마스크 ON' : '마스크 OFF', '#a6ffcf', run.playerX + 10, run.playerY - 42);
    updateRunHud();
  }

  function doJumpPress() {
    if (!run || !run.active || paused) return;
    run.jumpHeld = true;
    if (run.sliding && !run.slideInputHeld) run.sliding = false;

    if (run.jumpsLeft > 0) {
      const isSecond = run.jumpsLeft === 1;
      // Flood drag weakens ground jump height unless jumping off a dry car roof / bench!
      const inFloodWater = run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2;
      const floodFactor = inFloodWater ? 0.78 : 1.0;

      run.vy = (isSecond ? -335 : -378) * floodFactor;
      run.jumpsLeft -= 1;
      run.onPlatform = false;
      if (isSecond) {
        SFX.doubleJump();
        Renderer.spawnFloater('2단 점프!', '#9be6ff', run.playerX, run.playerY - 40);
      } else {
        SFX.jump();
        if (inFloodWater) Renderer.spawnFloater('침수 저항!', '#75c4ff', run.playerX, run.playerY - 36);
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
    run.slideInputHeld = false;
    if (run.weatherEvent === 'ice_road') {
      // Ice inertia keeps sliding slightly longer!
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

  // ===================== SPAWNERS (OBSTACLES / ITEMS / K-STREET FEATURES) =====================
  function spawnObstacleWave() {
    const diff = DATA.getYearDifficulty(run.year);
    const pool = DATA.OBSTACLES_BY_SEASON[run.seasonId];
    const preset = pool[Math.floor(Math.random() * pool.length)];

    // During flood, prefer air obstacles & leave ground room for car roof / bench platforming!
    if (run.weatherEvent === 'flood' && preset.lane === 'low' && Math.random() < 0.55) {
      return;
    }

    const startX = Renderer.W + (preset.warn ? 48 : 22);
    let y = Renderer.GROUND_Y - preset.h;
    if (preset.lane === 'air') {
      y = Renderer.GROUND_Y - 24 - preset.h;
    }

    run.obstacles.push({
      ...preset,
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
    } else {
      for (let i = 0; i < 5; i++) {
        run.items.push({ kind: 'coin', x: startX - 10 + i * 22, y: Renderer.GROUND_Y - 11 });
      }
    }
  }

  function spawnUtilityPickup() {
    const r = Math.random();
    const y = Renderer.GROUND_Y - (Math.random() < 0.5 ? 28 : 74);
    if (r < 0.22) {
      run.items.push({ kind: 'norway', x: Renderer.W + 24, y });
    } else if (r < 0.48) {
      run.items.push({ kind: 'coffee', x: Renderer.W + 24, y });
    } else if (r < 0.68) {
      run.items.push({ kind: 'star', x: Renderer.W + 24, y });
    } else if (r < 0.82) {
      run.items.push({ kind: 'magnet', x: Renderer.W + 24, y });
    } else if (r < 0.92) {
      run.items.push({ kind: 'umbrella_fever', x: Renderer.W + 24, y });
    } else {
      run.items.push({ kind: 'chest', x: Renderer.W + 24, y: Renderer.GROUND_Y - 16 });
    }
  }

  function spawnStreetFeature() {
    if (run.weatherEvent === 'flood') {
      // Spawn dry submerged car roof or park bench to hop across!
      const isCar = Math.random() < 0.55;
      const w = isCar ? 82 : 64;
      const platformY = isCar ? Renderer.GROUND_Y - 28 : Renderer.GROUND_Y - 24;
      run.features.push({ kind: isCar ? 'car_roof' : 'bench', x: Renderer.W + 30, w, platformY, isPlatform: true });
      // Guiding coins right above the dry platform!
      for (let i = 0; i < 3; i++) {
        run.items.push({ kind: 'coin', x: Renderer.W + 45 + i * 24, y: platformY - 16 });
      }
    } else if (run.weatherEvent === 'heat') {
      // Summer Shade Hopping: Street Tree Shade -> Bus Stop Roof -> Moving Cargo Truck Shade!
      const r = Math.random();
      if (r < 0.38) {
        run.features.push({ kind: 'shade_tree', x: Renderer.W + 30, w: 76, isShade: true });
      } else if (r < 0.72) {
        run.features.push({ kind: 'bus_stop', x: Renderer.W + 30, w: 86, platformY: Renderer.GROUND_Y - 46, isPlatform: true, isShade: true });
      } else {
        run.features.push({ kind: 'truck_shade', x: Renderer.W + 30, w: 94, extraSpeed: 28, isShade: true });
      }
    }
  }

  function spawnConvenienceStore() {
    run.features.push({ kind: 'conv_store', x: Renderer.W + 40, w: 98, triggered: false });
  }

  // ===================== MAIN RUN UPDATE =====================
  function updateRun(dt) {
    if (!run || !run.active || paused) return;

    const ch = getCharDef(run.charId);
    const diff = DATA.getYearDifficulty(run.year);
    const upgradeScoreMult = 1 + save.upgrades.score * 0.12;

    run.elapsed += dt;

    // Equal 4-season infinite cycle (15s * 4 = 60s per year)
    const newYear = Math.floor(run.elapsed / DATA.YEAR_DURATION) + 1;
    const yearTime = run.elapsed % DATA.YEAR_DURATION;
    const newSeasonIdx = Math.floor(yearTime / DATA.SEASON_DURATION);

    if (newYear > run.year) {
      run.year = newYear;
      run.seasonIdx = 0;
      run.seasonId = DATA.SEASONS[0].id;
      const yearGoldBonus = 45 + run.year * 10;
      run.score += Math.round(600 * run.year * ch.scoreMult);
      run.gold += yearGoldBonus;
      run.winPoseTimer = 0.9;
      SFX.yearUp();
      showRunBanner(`🔥 ${run.year}년 차 진입! 기후 위기 상승! (+${yearGoldBonus}G)`, 2800);
      Renderer.spawnFloater(`${run.year}년 차 돌파!`, '#ffe55c', run.playerX + 40, run.playerY - 52);
    } else if (newSeasonIdx !== run.seasonIdx) {
      run.seasonIdx = newSeasonIdx;
      const sObj = DATA.SEASONS[run.seasonIdx];
      run.seasonId = sObj.id;
      run.score += Math.round(200 * run.year * ch.scoreMult);
      run.gold += 15;
      run.heatGauge = 0;
      SFX.seasonUp();
      showRunBanner(`${run.year}년 차 [${sObj.name}] 시작 · ${sObj.weatherLabel}`, 2300);
      // Immediately queue a forecast for the new season's weather!
      if (!run.pendingWeather) scheduleNextWeatherForecast();
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
    if (run.norwayTimer > 0) run.norwayTimer = Math.max(0, run.norwayTimer - dt);
    if (run.mudBlindTimer > 0) run.mudBlindTimer = Math.max(0, run.mudBlindTimer - dt);
    if (run.umbrellaBrokenTimer > 0) run.umbrellaBrokenTimer = Math.max(0, run.umbrellaBrokenTimer - dt);
    if (run.fakeShockTimer > 0) run.fakeShockTimer = Math.max(0, run.fakeShockTimer - dt);
    if (run.shadeScoreCd > 0) run.shadeScoreCd = Math.max(0, run.shadeScoreCd - dt);
    if (run.hitPoseTimer > 0) run.hitPoseTimer = Math.max(0, run.hitPoseTimer - dt);
    if (run.itemPoseTimer > 0) run.itemPoseTimer = Math.max(0, run.itemPoseTimer - dt);
    if (run.winPoseTimer > 0) run.winPoseTimer = Math.max(0, run.winPoseTimer - dt);
    if (run.feverTimer > 0) {
      run.feverTimer = Math.max(0, run.feverTimer - dt);
      run.feverCharge = (run.feverTimer / 4.5) * 100;
    }

    // Ice Road slide inertia
    if (run.iceSlideInertia > 0) {
      run.iceSlideInertia = Math.max(0, run.iceSlideInertia - dt);
      if (run.iceSlideInertia <= 0 && !run.slideInputHeld) {
        run.sliding = false;
      }
    }

    // ---- MECHANIC 1: WEATHER-DRIVEN MOVEMENT SPEED & PHYSICS ----
    const feverBoost = run.feverTimer > 0 ? 1.36 : 1.0;
    let weatherSpeedMult = 1.0;
    if (run.umbrellaOn) weatherSpeedMult *= 0.84; // Umbrella air drag slows runner!
    if (run.weatherEvent === 'flood' && !run.onPlatform && run.playerY >= Renderer.GROUND_Y - 2) {
      weatherSpeedMult *= 0.72; // Floodwater drag!
    }
    if (run.weatherEvent === 'ice_road' && run.sliding) {
      weatherSpeedMult *= 1.38; // Fast slippery ice slide!
    }
    if (run.weatherEvent === 'gust' && run.sliding) {
      weatherSpeedMult *= 1.12; // Aerodynamic crouch cuts headwind!
    }

    run.speed = run.baseSpeed * diff.speedMult * feverBoost * weatherSpeedMult;
    run.scroll += run.speed * dt;
    run.score += run.speed * dt * 0.16 * ch.scoreMult * diff.scoreMult * upgradeScoreMult;

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
      if (wasAir && run.weatherEvent === 'ice_road' && !landedPlatform) {
        run.iceSlipTimer = 0.28; // Slippery landing on winter ice!
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

      // Convenience Store AC / Heating Chance!
      if (f.kind === 'conv_store' && !f.triggered && run.playerX >= f.x + 25 && run.playerX <= f.x + f.w - 8) {
        f.triggered = true;
        run.heatGauge = Math.max(0, run.heatGauge - 55);
        run.hp = Math.min(run.maxHp, run.hp + 10);
        run.score += Math.round(140 * upgradeScoreMult);
        SFX.acChime();
        const isWin = run.seasonId === 'winter';
        Renderer.spawnFloater(isWin ? '편의점 온풍기! 체력+10' : '편의점 에어컨! 냉각+10', '#70f2ff', run.playerX + 18, run.playerY - 48);
      }

      if (f.isShade && run.playerX >= f.x - 8 && run.playerX <= f.x + f.w + 8) {
        inShade = true;
      }

      if (f.x + f.w < -60) run.features.splice(i, 1);
    }

    // ---- ACTIVE WEATHER DAMAGE & GEAR MITIGATION ----
    const seasonObj = DATA.SEASONS[run.seasonIdx];
    let drain = 1.9 + (run.year - 1) * 0.2 + seasonObj.drainBonus;
    if (ch.summerImmune && seasonObj.id === 'summer') drain -= seasonObj.drainBonus;
    if (ch.winterResist && seasonObj.id === 'winter') drain -= seasonObj.drainBonus * ch.winterResist;

    // Mask stamina drain trade-off (+75% base drain while worn!)
    if (run.maskOn) drain *= 1.75;

    // Weather-specific hazards mitigated by Umbrella / Mask / Shade!
    if (run.feverTimer <= 0) {
      if (run.weatherEvent === 'rain' && !run.umbrellaOn) {
        const rainMult = ch.rainWindResist ? (1 - ch.rainWindResist) : 1;
        drain += 4.2 * rainMult;
      }
      if (run.weatherEvent === 'dust' && !run.maskOn) {
        drain += 4.8;
      }
      if (run.weatherEvent === 'heat' && !ch.summerImmune) {
        if (inShade) {
          run.heatGauge = Math.max(0, run.heatGauge - 46 * dt);
          if (run.shadeScoreCd <= 0) {
            run.shadeScoreCd = 1.1;
            run.score += Math.round(60 * upgradeScoreMult);
            Renderer.spawnFloater('그늘 밟기! 냉각', '#7ae8ff', run.playerX + 8, run.playerY - 42);
          }
        } else {
          run.heatGauge = Math.min(100, run.heatGauge + 17 * dt);
          if (run.heatGauge >= 100) {
            drain += 5.5;
            run.lastHitCause = `${run.year}년 차 여름 폭염, 그늘을 놓쳐 열사병으로 쓰러졌습니다!`;
          }
        }
      } else {
        run.heatGauge = Math.max(0, run.heatGauge - 22 * dt);
      }
    } else {
      drain = 0;
      run.heatGauge = Math.max(0, run.heatGauge - 40 * dt);
    }

    run.hp = Math.max(0, run.hp - drain * dt);

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
            const splashDmg = run.umbrellaOn ? 6 : 14;
            run.hp = Math.max(0, run.hp - splashDmg);
            run.hitPoseTimer = 0.45;
            run.lastHitCause = `${run.year}년 차 장마철, 지나가는 차의 흙탕물 물벼락을 맞고 쓰러졌습니다!`;
            Renderer.spawnFloater(`물벼락 적중! -${splashDmg}`, '#ff9452', run.playerX + 10, run.playerY - 44);
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
      const baseInterval = 1.52 / diff.spawnRateMult;
      run.obstacleCd = Math.max(0.72, baseInterval + (Math.random() - 0.4) * 0.35);
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

    // ---- COLLECTIBLES & OBSTACLE COLLISIONS ----
    const pBox = {
      x: run.playerX - 9,
      y: run.sliding ? run.playerY - 16 : run.playerY - 34,
      w: 18,
      h: run.sliding ? 16 : 34
    };

    function addFeverCharge(amount) {
      if (run.feverTimer > 0) return;
      run.feverCharge = Math.min(100, run.feverCharge + amount);
      if (run.feverCharge >= 100) {
        run.feverTimer = 4.5;
        run.winPoseTimer = 0.7;
        SFX.yearUp();
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

      if (dist < 24) {
        run.items.splice(i, 1);
        if (it.kind === 'coin' || it.kind === 'big_coin') {
          const baseG = (it.kind === 'big_coin' ? 12 : 3) + diff.goldBonus;
          const gainedG = Math.max(1, Math.round(baseG * ch.goldMult));
          const gainedS = Math.round((it.kind === 'big_coin' ? 120 : 30) * ch.scoreMult * upgradeScoreMult);
          run.gold += gainedG;
          run.score += gainedS;
          addFeverCharge(it.kind === 'big_coin' ? 10 : 2.5);
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
          SFX.yearUp();
          Renderer.spawnFloater('노르웨이 기상청 ON! (25초)', '#70e2ff', run.playerX + 16, run.playerY - 46);
          showRunBanner('🇳🇴 노르웨이 기상청 획득! 3초 전 100% 정확 예보!', 2300);
        } else if (it.kind === 'star') {
          run.score += Math.round(160 * ch.scoreMult * upgradeScoreMult);
          addFeverCharge(24);
          SFX.bigCoin();
          Renderer.spawnFloater('FEVER +24%!', '#ffe866', it.x, it.y - 10);
        } else if (it.kind === 'magnet') {
          run.magnetTimer = 6.0;
          run.itemPoseTimer = 0.45;
          SFX.guard();
          Renderer.spawnFloater('자석 발동! (6초)', '#ff7d95', run.playerX + 12, run.playerY - 42);
        } else if (it.kind === 'chest') {
          const bonusG = Math.round(32 * ch.goldMult);
          run.gold += bonusG;
          run.score += Math.round(250 * upgradeScoreMult);
          addFeverCharge(25);
          SFX.yearUp();
          Renderer.spawnFloater(`보물상자 +${bonusG}G!`, '#ffe55c', it.x, it.y - 14);
        } else if (it.kind === 'coffee') {
          const healAmt = ch.icedBonus ? 22 : 14;
          const bonusSc = ch.icedBonus ? 250 : 90;
          run.hp = Math.min(run.maxHp, run.hp + healAmt);
          run.heatGauge = Math.max(0, run.heatGauge - 20);
          run.score += Math.round(bonusSc * upgradeScoreMult);
          run.itemPoseTimer = 0.55;
          SFX.heal();
          Renderer.spawnFloater(ch.icedBonus ? `얼죽아 회복 +${healAmt}!` : `포션 회복 +${healAmt}`, '#70f59b', run.playerX + 10, run.playerY - 40);
        } else if (it.kind === 'umbrella_fever') {
          run.feverCharge = 100;
          run.feverTimer = 4.5;
          run.score += 180;
          run.itemPoseTimer = 0.55;
          SFX.yearUp();
          Renderer.spawnFloater('FEVER! 무적 질주!', '#ffe55c', run.playerX + 12, run.playerY - 44);
        }
        continue;
      }

      if (it.x < -30) run.items.splice(i, 1);
    }

    for (let i = run.obstacles.length - 1; i >= 0; i--) {
      const ob = run.obstacles[i];
      ob.x -= (run.speed + ob.extraSpeed) * dt;

      const oBox = {
        x: ob.x + 5,
        y: ob.y + 5,
        w: Math.max(8, ob.w - 10),
        h: Math.max(8, ob.h - 10)
      };

      const overlap =
        pBox.x < oBox.x + oBox.w &&
        pBox.x + pBox.w > oBox.x &&
        pBox.y < oBox.y + oBox.h &&
        pBox.y + pBox.h > oBox.y;

      if (overlap) {
        if (run.feverTimer > 0) {
          run.obstacles.splice(i, 1);
          run.score += Math.round(150 * ch.scoreMult * upgradeScoreMult);
          SFX.guard();
          Renderer.spawnFloater('돌파 +150!', '#ffe866', ob.x, ob.y);
          continue;
        } else if (run.invulnTimer <= 0) {
          handleObstacleHit(ob, ch, diff);
        }
      } else if (ch.nearMissBonus && !ob.nearMissed && ob.x + ob.w < pBox.x) {
        ob.nearMissed = true;
        const vertDist = Math.min(Math.abs(pBox.y - (oBox.y + oBox.h)), Math.abs((pBox.y + pBox.h) - oBox.y));
        if (vertDist < 28) {
          run.score += Math.round(120 * upgradeScoreMult);
          run.gold += 5;
          SFX.coin();
          Renderer.spawnFloater('NEAR MISS +5G!', '#ff9ce6', run.playerX + 10, run.playerY - 45);
        }
      }

      if (ob.x + ob.w < -45) run.obstacles.splice(i, 1);
    }

    if (run.hp <= 0) {
      finishRunGameOver();
      return;
    }

    updateRunHud();
  }

  function handleObstacleHit(ob, ch, diff) {
    if (ch.summerImmune && ob.tag === 'heat') {
      run.invulnTimer = 0.6;
      SFX.guard();
      Renderer.spawnFloater('반팔충 폭염 면역!', '#7aff99', run.playerX + 10, run.playerY - 42);
      return;
    }

    if (run.shield) {
      run.shield = false;
      run.invulnTimer = 1.25;
      SFX.guard();
      Renderer.spawnFloater('기상 보호막 방어!', '#82e2ff', run.playerX + 10, run.playerY - 44);
      return;
    }

    if (ch.guardChance && Math.random() < ch.guardChance) {
      run.invulnTimer = 1.1;
      SFX.guard();
      Renderer.spawnFloater('패딩 쿠션 방어!', '#ffe55c', run.playerX + 10, run.playerY - 44);
      return;
    }

    let dmg = ob.dmg * diff.dmgMult;
    dmg *= (1 - save.upgrades.defense * 0.07);
    if (ch.winterResist && ob.tag === 'cold') dmg *= (1 - ch.winterResist);
    if (ch.winterWeakness && ob.tag === 'cold') dmg *= ch.winterWeakness;
    if (ch.rainWindResist && (ob.tag === 'rain' || ob.tag === 'wind')) dmg *= (1 - ch.rainWindResist);

    const finalDmg = Math.max(5, Math.round(dmg));
    run.hp = Math.max(0, run.hp - finalDmg);
    run.invulnTimer = 1.15 + save.upgrades.defense * 0.08;
    run.hitPoseTimer = 0.42;
    run.lastHitCause = `${run.year}년 차 ${DATA.SEASONS[run.seasonIdx].name}, '${ob.name}'에 부딪혀 쓰러졌습니다!`;

    SFX.hit();
    Renderer.spawnFloater(`-${finalDmg}`, '#ff5c5c', run.playerX, run.playerY - 42);
  }

  function updateRunHud() {
    if (!run) return;
    const seasonObj = DATA.SEASONS[run.seasonIdx];

    el.runYearNum.textContent = `${run.year}Y`;
    el.runSeasonLabel.textContent = `${run.year}년 차 ${seasonObj.name}`;
    el.runScoreText.textContent = `${Math.floor(run.score).toLocaleString('ko-KR')}점`;
    el.runGoldText.textContent = run.gold.toLocaleString('ko-KR');

    // 4 Pixel Hearts
    const hpRatio = Math.max(0, Math.min(1, run.hp / run.maxHp));
    const filledHearts = run.hp <= 0 ? 0 : Math.max(1, Math.ceil(hpRatio * 4));
    let heartHtml = '';
    for (let i = 0; i < 4; i++) {
      heartHtml += `<span class="heart-unit${i < filledHearts ? '' : ' empty'}">❤️</span>`;
    }
    el.runHearts.innerHTML = heartHtml;
    el.runHpText.textContent = `${Math.ceil(run.hp)}/${run.maxHp}`;

    // Golden FEVER Gauge
    const feverPct = Math.max(0, Math.min(100, run.feverCharge));
    el.runFeverFill.style.width = `${feverPct.toFixed(1)}%`;
    el.runFeverText.textContent = run.feverTimer > 0
      ? `FEVER! ${run.feverTimer.toFixed(1)}s`
      : `FEVER ${Math.floor(feverPct)}%`;

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

    // Summer Heat Meter Pill
    if (run.weatherEvent === 'heat' || run.heatGauge > 5) {
      el.fcHeatPill.classList.remove('hidden');
      el.fcHeatPill.textContent = `🌡️ 열기 ${Math.round(run.heatGauge)}%`;
    } else {
      el.fcHeatPill.classList.add('hidden');
    }

    // Muddy Water Splash Blindness Overlay
    if (run.mudBlindTimer > 0) {
      el.mudOverlay.classList.remove('hidden');
      el.mudOverlay.style.opacity = Math.min(1, run.mudBlindTimer / 1.0).toFixed(2);
    } else {
      el.mudOverlay.classList.add('hidden');
    }

    // 3rd Button Gear Toggle States (Umbrella & Mask)
    el.btnToggleUmbrella.classList.toggle('on', run.umbrellaOn);
    el.btnToggleUmbrella.classList.toggle('broken', run.umbrellaBrokenTimer > 0);
    el.gearUmbrellaState.textContent = run.umbrellaBrokenTimer > 0
      ? `${Math.ceil(run.umbrellaBrokenTimer)}s`
      : (run.umbrellaOn ? 'ON' : 'OFF');

    el.btnToggleMask.classList.toggle('on', run.maskOn);
    el.gearMaskState.textContent = run.maskOn ? 'ON' : 'OFF';

    // 4 Status Orbs
    el.orbUiFever.classList.toggle('active', run.feverTimer > 0);
    el.orbUiMagnet.classList.toggle('active', run.magnetTimer > 0 || run.feverTimer > 0);
    el.orbUiNorway.classList.toggle('active', isNorway);
    el.orbUiShield.classList.toggle('active', Boolean(run.shield));
  }

  function finishRunGameOver() {
    run.active = false;
    run.dead = true;
    el.mudOverlay.classList.add('hidden');
    SFX.fail();

    const ch = getCharDef(run.charId);
    const finalScore = Math.floor(run.score);
    const distGoldBonus = Math.floor(run.elapsed * 0.7);
    const totalGoldEarned = run.gold + distGoldBonus;

    const isNewBest = finalScore > save.bestScore;
    if (isNewBest) save.bestScore = finalScore;
    if (run.year > save.bestYear) save.bestYear = run.year;
    save.gold += totalGoldEarned;
    save.playCount += 1;
    persistSave();

    const seasonName = DATA.SEASONS[run.seasonIdx].name;
    el.resNewBest.classList.toggle('hidden', !isNewBest);
    el.resScore.textContent = `${finalScore.toLocaleString('ko-KR')}점`;
    el.resCause.textContent = run.lastHitCause;
    el.resSurvived.textContent = `${run.year}년 차 ${seasonName} (${Math.floor(run.elapsed)}초)`;
    el.resGoldEarned.textContent = `+${totalGoldEarned.toLocaleString('ko-KR')} G`;
    el.resCharName.textContent = ch.name;
    el.resGoldTotal.textContent = `${save.gold.toLocaleString('ko-KR')} G`;

    el.gameoverOverlay.classList.remove('hidden');
  }

  function exitRunToHome() {
    SFX.click();
    run = null;
    paused = false;
    el.mudOverlay.classList.add('hidden');
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
      }
      if (run) {
        Renderer.renderRunFrame(runCtx, run, getCharDef(run.charId), paused || !run.active ? 0 : dt, t);
      }
    } else if (currentTab === 'home') {
      const previewChar = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
      Renderer.renderHomePreview(homeCtx, previewChar, t);
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
    el.btnPassShop.addEventListener('click', () => {
      currentShopSubtab = 'boosters';
      switchTab('shop');
    });
    el.btnDockChars.addEventListener('click', () => switchTab('chars'));
    el.btnDockShop.addEventListener('click', () => switchTab('shop'));

    el.btnSoundGlobal.addEventListener('click', () => {
      const on = SFX.toggle();
      el.btnSoundGlobal.textContent = on ? '🔊' : '🔇';
    });

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

    // Runner Controls + Gear Toggles (3rd button gimmick!)
    bindControlButton(el.btnJump, doJumpPress, doJumpRelease);
    bindControlButton(el.btnSlide, doSlideStart, doSlideEnd);
    el.btnToggleUmbrella.addEventListener('click', toggleUmbrella);
    el.btnToggleMask.addEventListener('click', toggleMask);

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
    el.btnResultHome.addEventListener('click', exitRunToHome);
    el.btnRetryRun.addEventListener('click', () => {
      SFX.click();
      startRun();
    });

    // Intro Logo + Sound Interaction
    let introLeaving = false;
    function enterFromIntro() {
      if (introLeaving || el.introOverlay.classList.contains('hidden')) return;
      introLeaving = true;
      SFX.introJingle();
      el.introOverlay.classList.add('playing');
      setTimeout(() => {
        el.introOverlay.classList.add('leaving');
        setTimeout(() => {
          el.introOverlay.classList.add('hidden');
          el.introOverlay.classList.remove('playing', 'leaving');
          introLeaving = false;
        }, 540);
      }, 600);
    }

    function replayIntro() {
      if (run && run.active) return;
      introLeaving = false;
      el.introOverlay.classList.remove('hidden', 'playing', 'leaving');
      SFX.introJingle();
    }

    el.introOverlay.addEventListener('click', enterFromIntro);
    el.btnIntroEnter.addEventListener('click', (e) => {
      e.stopPropagation();
      enterFromIntro();
    });
    el.btnReplayIntro.addEventListener('click', replayIntro);

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
        toggleUmbrella();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
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
      }
    });
  }

  // ===================== BOOT =====================
  setupEvents();
  refreshAllMenus();
  try { SFX.introJingle(); } catch {}
  requestAnimationFrame(loop);
})();
