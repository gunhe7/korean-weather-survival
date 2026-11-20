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
      boosters: { shield: 0, boost: 0 },
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
    uiGold: document.getElementById('ui-gold'),
    btnSoundGlobal: document.getElementById('btn-sound-global'),
    homeBestScore: document.getElementById('home-best-score'),
    homeBestYear: document.getElementById('home-best-year'),
    homePlayCount: document.getElementById('home-play-count'),
    homePreviewCanvas: document.getElementById('homePreviewCanvas'),
    homeStageTitle: document.getElementById('home-stage-title'),
    homeCharTier: document.getElementById('home-char-tier'),
    homeCharName: document.getElementById('home-char-name'),
    homeCharHp: document.getElementById('home-char-hp'),
    homeCharDesc: document.getElementById('home-char-desc'),
    homeBoosterChips: document.getElementById('home-booster-chips'),
    btnPrevChar: document.getElementById('btn-prev-char'),
    btnNextChar: document.getElementById('btn-next-char'),
    btnPlayStart: document.getElementById('btn-play-start'),

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
    runBanner: document.getElementById('run-banner'),

    orbUiFever: document.getElementById('orb-ui-fever'),
    orbUiMagnet: document.getElementById('orb-ui-magnet'),
    orbUiSpeed: document.getElementById('orb-ui-speed'),
    orbUiShield: document.getElementById('orb-ui-shield'),

    btnJump: document.getElementById('btn-jump'),
    btnSlide: document.getElementById('btn-slide'),
    ctrlCharBadge: document.getElementById('ctrl-char-badge'),
    ctrlSpeedText: document.getElementById('ctrl-speed-text'),
    ctrlWeatherWarn: document.getElementById('ctrl-weather-warn'),
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
    el.homeBestScore.textContent = `${save.bestScore.toLocaleString('ko-KR')}점`;
    el.homeBestYear.textContent = `${save.bestYear}년 차`;
    el.homePlayCount.textContent = `${save.playCount}회`;

    renderHomeCharStage();
    renderCharList();
    renderShopList();
  }

  function renderHomeCharStage() {
    const ch = DATA.CHARACTERS[previewCharIdx] || DATA.CHARACTERS[0];
    const unlocked = isCharUnlocked(ch.id);

    el.homeStageTitle.textContent = unlocked ? '출격 캐릭터' : '미보유 캐릭터 미리보기';
    el.homeCharTier.textContent = ch.tier;
    el.homeCharName.textContent = `${ch.icon} ${ch.name}`;
    el.homeCharHp.textContent = `체력 ${getMaxHp(ch)}`;
    el.homeCharDesc.textContent = ch.desc;

    // Active Boosters bar
    const chips = [];
    if (save.boosters.shield > 0) chips.push(`<span class="booster-chip-on">😷 KF94 보호막 x${save.boosters.shield}</span>`);
    if (save.boosters.boost > 0) chips.push(`<span class="booster-chip-on">🚀 쾌속 출발 x${save.boosters.boost}</span>`);
    el.homeBoosterChips.innerHTML = chips.length ? chips.join('') : '없음 (상점에서 구매 가능)';

    if (unlocked) {
      el.btnPlayStart.disabled = false;
      el.btnPlayStart.textContent = '▶ 달리기 시작!';
    } else {
      el.btnPlayStart.disabled = save.gold < ch.price;
      el.btnPlayStart.textContent = `🔒 ${ch.price.toLocaleString('ko-KR')} G로 [${ch.name}] 해금하기`;
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
      // Characters quick-purchase tab inside Shop
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

  // ===================== RUNNER ENGINE (COOKIE RUN MODE) =====================
  function startRun() {
    const ch = getCharDef(save.selectedChar);
    const maxHp = getMaxHp(ch);

    // Consume 1-run boosters if owned
    let hasShield = false;
    let startFever = 0;
    if (save.boosters.shield > 0) {
      save.boosters.shield -= 1;
      hasShield = true;
    }
    if (save.boosters.boost > 0) {
      save.boosters.boost -= 1;
      startFever = 4.0;
    }
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
      baseSpeed: 190,
      speed: 190,

      // Player physics
      playerX: 98,
      playerY: Renderer.GROUND_Y,
      petY: Renderer.GROUND_Y,
      vy: 0,
      jumpsLeft: 2,
      jumpHeld: false,
      sliding: false,
      gliding: false,
      invulnTimer: 0,
      shield: hasShield,
      feverCharge: startFever > 0 ? 100 : 0,
      feverTimer: startFever,
      magnetTimer: 0,
      hitPoseTimer: 0,
      itemPoseTimer: 0,
      winPoseTimer: 0,

      // Spawners
      obstacleCd: 1.2,
      itemCd: 2.5,
      obstacles: [],
      items: [],
      lastHitCause: '극한 한국 날씨에 체력이 다했습니다!'
    };

    el.runPortraitImg.src = ch.avatar;
    el.gameoverOverlay.classList.add('hidden');
    el.pauseOverlay.classList.add('hidden');
    el.viewRun.classList.remove('hidden');

    el.ctrlCharBadge.textContent = ch.name;
    SFX.seasonUp();
    showRunBanner('🌸 1년 차 봄 출발! 미세먼지를 피하세요!', 2400);
    updateRunHud();
  }

  function doJumpPress() {
    if (!run || !run.active || paused) return;
    run.jumpHeld = true;
    if (run.sliding) run.sliding = false;

    if (run.jumpsLeft > 0) {
      const isSecond = run.jumpsLeft === 1;
      run.vy = isSecond ? -335 : -375;
      run.jumpsLeft -= 1;
      if (isSecond) {
        SFX.doubleJump();
        Renderer.spawnFloater('2단 점프!', '#9be6ff', run.playerX, run.playerY - 40);
      } else {
        SFX.jump();
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
    if (!run.sliding) SFX.slide();
    run.sliding = true;
    // Fast-fall if currently airborne!
    if (run.playerY < Renderer.GROUND_Y) {
      run.vy = Math.max(run.vy, 340);
    }
  }

  function doSlideEnd() {
    if (!run) return;
    run.sliding = false;
  }

  function spawnObstacleWave() {
    const diff = DATA.getYearDifficulty(run.year);
    const pool = DATA.OBSTACLES_BY_SEASON[run.seasonId];
    const preset = pool[Math.floor(Math.random() * pool.length)];

    const startX = Renderer.W + (preset.warn ? 48 : 22);
    let y = Renderer.GROUND_Y - preset.h;
    if (preset.lane === 'air') {
      // Positioned cleanly so standing character (34px) hits, sliding character (16px) clears safely!
      y = Renderer.GROUND_Y - 24 - preset.h;
    }

    const ob = {
      ...preset,
      x: startX,
      y,
      passed: false,
      nearMissed: false,
      extraSpeed: (preset.speedBonus || 0) * diff.speedMult
    };
    run.obstacles.push(ob);

    // Helpful Cookie Run Coin Trail guiding Jump or Slide!
    const coinX0 = startX - 26;
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
      // Low line of coins under aerial obstacle -> teaches SLIDE!
      for (let i = 0; i < 5; i++) {
        run.items.push({ kind: 'coin', x: startX - 10 + i * 22, y: Renderer.GROUND_Y - 11 });
      }
    }
  }

  function spawnUtilityPickup() {
    const r = Math.random();
    const y = Renderer.GROUND_Y - (Math.random() < 0.5 ? 26 : 74);
    if (r < 0.30) {
      run.items.push({ kind: 'coffee', x: Renderer.W + 24, y });
    } else if (r < 0.54) {
      run.items.push({ kind: 'star', x: Renderer.W + 24, y });
    } else if (r < 0.72) {
      run.items.push({ kind: 'magnet', x: Renderer.W + 24, y });
    } else if (r < 0.88) {
      run.items.push({ kind: 'umbrella_fever', x: Renderer.W + 24, y });
    } else {
      run.items.push({ kind: 'chest', x: Renderer.W + 24, y: Renderer.GROUND_Y - 16 });
    }
  }

  function updateRun(dt) {
    if (!run || !run.active || paused) return;

    const ch = getCharDef(run.charId);
    const diff = DATA.getYearDifficulty(run.year);

    run.elapsed += dt;

    // Equal 4-season cycle calculation (15s * 4 = 60s per year)
    const newYear = Math.floor(run.elapsed / DATA.YEAR_DURATION) + 1;
    const yearTime = run.elapsed % DATA.YEAR_DURATION;
    const newSeasonIdx = Math.floor(yearTime / DATA.SEASON_DURATION);

    if (newYear > run.year) {
      run.year = newYear;
      run.seasonIdx = 0;
      run.seasonId = DATA.SEASONS[0].id;
      const yearScoreBonus = Math.round(600 * run.year * ch.scoreMult);
      const yearGoldBonus = 45 + run.year * 10;
      run.score += yearScoreBonus;
      run.gold += yearGoldBonus;
      run.winPoseTimer = 0.9;
      SFX.yearUp();
      showRunBanner(`🔥 ${run.year}년 차 진입! 기후 위기 난이도 상승! (+${yearGoldBonus}G)`, 3000);
      Renderer.spawnFloater(`${run.year}년 차 돌파!`, '#ffe55c', run.playerX + 40, run.playerY - 52);
    } else if (newSeasonIdx !== run.seasonIdx) {
      run.seasonIdx = newSeasonIdx;
      const sObj = DATA.SEASONS[run.seasonIdx];
      run.seasonId = sObj.id;
      const sBonus = Math.round(200 * run.year * ch.scoreMult);
      run.score += sBonus;
      run.gold += 15;
      SFX.seasonUp();
      showRunBanner(`${run.year}년 차 [${sObj.name}] 시작 · ${sObj.weatherLabel}`, 2400);
    }

    const seasonObj = DATA.SEASONS[run.seasonIdx];

    // Speed & Fever
    const feverBoost = run.feverTimer > 0 ? 1.38 : 1.0;
    run.speed = run.baseSpeed * diff.speedMult * feverBoost;
    run.scroll += run.speed * dt;

    // Passive score over distance
    const upgradeScoreMult = 1 + save.upgrades.score * 0.12;
    run.score += run.speed * dt * 0.16 * ch.scoreMult * diff.scoreMult * upgradeScoreMult;

    // Gentle Cookie Run HP energy drain (affected by extreme summer/winter unless character resists)
    let drain = 2.0 + (run.year - 1) * 0.22 + seasonObj.drainBonus;
    if (ch.summerImmune && seasonObj.id === 'summer') drain -= seasonObj.drainBonus;
    if (ch.winterResist && seasonObj.id === 'winter') drain -= seasonObj.drainBonus * ch.winterResist;
    if (run.feverTimer > 0) drain = 0;
    run.hp = Math.max(0, run.hp - drain * dt);

    // Timers
    if (run.invulnTimer > 0) run.invulnTimer = Math.max(0, run.invulnTimer - dt);
    if (run.magnetTimer > 0) run.magnetTimer = Math.max(0, run.magnetTimer - dt);
    if (run.feverTimer > 0) {
      run.feverTimer = Math.max(0, run.feverTimer - dt);
      run.feverCharge = (run.feverTimer / 4.5) * 100;
    }
    if (run.hitPoseTimer > 0) run.hitPoseTimer = Math.max(0, run.hitPoseTimer - dt);
    if (run.itemPoseTimer > 0) run.itemPoseTimer = Math.max(0, run.itemPoseTimer - dt);
    if (run.winPoseTimer > 0) run.winPoseTimer = Math.max(0, run.winPoseTimer - dt);

    // Player Vertical Physics
    const gravity = 1080;
    run.vy += gravity * dt;

    // Umbrella Master Gliding!
    if (ch.canGlide && run.jumpHeld && run.playerY < Renderer.GROUND_Y && run.vy > 45) {
      run.vy = 85;
      run.gliding = true;
    } else {
      run.gliding = false;
    }

    run.playerY += run.vy * dt;
    if (run.playerY >= Renderer.GROUND_Y) {
      run.playerY = Renderer.GROUND_Y;
      run.vy = 0;
      run.jumpsLeft = 2;
      run.gliding = false;
    }

    // Loyal Shiba Puppy smoothly mirrors runner's jump!
    run.petY += (run.playerY - run.petY) * Math.min(1, dt * 11);

    // Spawn obstacles & items
    run.obstacleCd -= dt;
    if (run.obstacleCd <= 0) {
      spawnObstacleWave();
      const baseInterval = 1.48 / diff.spawnRateMult;
      run.obstacleCd = Math.max(0.68, baseInterval + (Math.random() - 0.4) * 0.35);
    }

    run.itemCd -= dt;
    if (run.itemCd <= 0) {
      spawnUtilityPickup();
      run.itemCd = 3.8 + Math.random() * 1.9;
    }

    // Forgiving Player Hurtbox
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

    // Update & Collect Items (with Gold Magnet!)
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

    // Update Obstacles & Collisions
    for (let i = run.obstacles.length - 1; i >= 0; i--) {
      const ob = run.obstacles[i];
      ob.x -= (run.speed + ob.extraSpeed) * dt;

      // Inset obstacle hitbox slightly for crisp Cookie Run fairness
      const oBox = {
        x: ob.x + 4,
        y: ob.y + 4,
        w: Math.max(8, ob.w - 8),
        h: Math.max(8, ob.h - 8)
      };

      const overlap =
        pBox.x < oBox.x + oBox.w &&
        pBox.x + pBox.w > oBox.x &&
        pBox.y < oBox.y + oBox.h &&
        pBox.y + pBox.h > oBox.y;

      if (overlap) {
        if (run.feverTimer > 0) {
          // Fever smashes right through obstacles for bonus points!
          run.obstacles.splice(i, 1);
          run.score += Math.round(150 * ch.scoreMult * upgradeScoreMult);
          SFX.guard();
          Renderer.spawnFloater('돌파 +150!', '#ffe866', ob.x, ob.y);
          continue;
        } else if (run.invulnTimer <= 0) {
          handleObstacleHit(ob, ch, diff);
        }
      } else if (ch.nearMissBonus && !ob.nearMissed && ob.x + ob.w < pBox.x) {
        // Check if obstacle passed closely!
        ob.nearMissed = true;
        const vertDist = Math.min(Math.abs(pBox.y - (oBox.y + oBox.h)), Math.abs((pBox.y + pBox.h) - oBox.y));
        if (vertDist < 28) {
          run.score += Math.round(120 * upgradeScoreMult);
          run.gold += 5;
          SFX.coin();
          Renderer.spawnFloater('NEAR MISS +5G!', '#ff9ce6', run.playerX + 10, run.playerY - 45);
        }
      }

      if (ob.x + ob.w < -40) run.obstacles.splice(i, 1);
    }

    if (run.hp <= 0) {
      finishRunGameOver();
      return;
    }

    updateRunHud();
  }

  function handleObstacleHit(ob, ch, diff) {
    // Character immunity check (반팔충 여름 폭염 면역!)
    if (ch.summerImmune && ob.tag === 'heat') {
      run.invulnTimer = 0.6;
      SFX.guard();
      Renderer.spawnFloater('반팔충 폭염 면역!', '#7aff99', run.playerX + 10, run.playerY - 42);
      return;
    }

    // KF94 Booster Shield check
    if (run.shield) {
      run.shield = false;
      run.invulnTimer = 1.25;
      SFX.guard();
      Renderer.spawnFloater('KF94 보호막 방어!', '#82e2ff', run.playerX + 10, run.playerY - 44);
      return;
    }

    // Long Padding Cushion Guard check
    if (ch.guardChance && Math.random() < ch.guardChance) {
      run.invulnTimer = 1.1;
      SFX.guard();
      Renderer.spawnFloater('롱패딩 쿠션 방어!', '#ffe55c', run.playerX + 10, run.playerY - 44);
      return;
    }

    let dmg = ob.dmg * diff.dmgMult;
    // Upgrade defense reduction
    dmg *= (1 - save.upgrades.defense * 0.07);
    // Character elemental resists / weaknesses
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
    const diff = DATA.getYearDifficulty(run.year);

    el.runYearNum.textContent = `${run.year}Y`;
    el.runSeasonLabel.textContent = `${run.year}년 차 ${seasonObj.name}`;
    el.runScoreText.textContent = `${Math.floor(run.score).toLocaleString('ko-KR')}점`;
    el.runGoldText.textContent = run.gold.toLocaleString('ko-KR');

    // 4 Pixel Hearts matching top mockup!
    const hpRatio = Math.max(0, Math.min(1, run.hp / run.maxHp));
    const filledHearts = run.hp <= 0 ? 0 : Math.max(1, Math.ceil(hpRatio * 4));
    let heartHtml = '';
    for (let i = 0; i < 4; i++) {
      heartHtml += `<span class="heart-unit${i < filledHearts ? '' : ' empty'}">❤️</span>`;
    }
    el.runHearts.innerHTML = heartHtml;
    el.runHpText.textContent = `${Math.ceil(run.hp)}/${run.maxHp}`;

    // Golden FEVER Gauge Bar
    const feverPct = Math.max(0, Math.min(100, run.feverCharge));
    el.runFeverFill.style.width = `${feverPct.toFixed(1)}%`;
    el.runFeverText.textContent = run.feverTimer > 0
      ? `FEVER! ${run.feverTimer.toFixed(1)}s`
      : `FEVER ${Math.floor(feverPct)}%`;

    const yearPct = ((run.elapsed % DATA.YEAR_DURATION) / DATA.YEAR_DURATION) * 100;
    el.runYearFill.style.width = `${yearPct.toFixed(1)}%`;

    el.ctrlSpeedText.textContent = `속도 x${diff.speedMult.toFixed(2)}`;
    el.ctrlWeatherWarn.textContent = seasonObj.weatherLabel;

    // 4 Glowing Skill / Status Orbs (from 버튼 디자인)
    el.orbUiFever.classList.toggle('active', run.feverTimer > 0);
    el.orbUiMagnet.classList.toggle('active', run.magnetTimer > 0 || run.feverTimer > 0);
    el.orbUiSpeed.classList.toggle('active', run.feverTimer > 0 || run.gliding || run.year >= 2);
    el.orbUiShield.classList.toggle('active', Boolean(run.shield));
  }

  function finishRunGameOver() {
    run.active = false;
    run.dead = true;
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
    el.resCharName.textContent = `${ch.icon} ${ch.name}`;
    el.resGoldTotal.textContent = `${save.gold.toLocaleString('ko-KR')} G`;

    el.gameoverOverlay.classList.remove('hidden');
  }

  function exitRunToHome() {
    SFX.click();
    run = null;
    paused = false;
    el.pauseOverlay.classList.add('hidden');
    el.gameoverOverlay.classList.add('hidden');
    el.viewRun.classList.add('hidden');
    switchTab('home');
  }

  // ===================== MAIN ANIMATION LOOP =====================
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
    // Bottom navigation bar
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Shop sub-tabs
    document.querySelectorAll('.subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        SFX.click();
        currentShopSubtab = btn.dataset.shoptab;
        renderShopList();
      });
    });

    // Global Sound Toggle
    el.btnSoundGlobal.addEventListener('click', () => {
      const on = SFX.toggle();
      el.btnSoundGlobal.textContent = on ? '🔊' : '🔇';
    });

    // Home Character Carousel
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

    // Start Run or Unlock directly from Home
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

    // Mobile Ergonomic Thumb Controls
    bindControlButton(el.btnJump, doJumpPress, doJumpRelease);
    bindControlButton(el.btnSlide, doSlideStart, doSlideEnd);

    // Pause / Resume / Home / Retry
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

    // Launch Intro Logo + Sound Interaction
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
        }, 560);
      }, 620);
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

    // Desktop Keyboard Support (Space / Up / W = Jump, Down / S = Slide, Esc = Pause)
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
  // Try playing startup logo jingle immediately if browser permits autoplay
  try { SFX.introJingle(); } catch {}
  requestAnimationFrame(loop);
})();
