window.RUN_DATA = (function () {
  const SEASON_DURATION = 15; // 봄 15초, 여름 15초, 가을 15초, 겨울 15초 (동일 비율, 1년 = 60초)
  const YEAR_DURATION = SEASON_DURATION * 4;
  const MAX_CHAR_LEVEL = 5;

  const SEASONS = [
    {
      id: 'spring',
      name: '봄',
      icon: '🌸',
      weatherLabel: '미세먼지 · 꽃샘추위',
      hazards: '황사 구름 · 미세먼지 지대 · 꽃샘추위 · 날아오는 나뭇가지',
      tip: '미세먼지 경보 시 마스크(E)를 착용하세요!',
      drainBonus: 0,
      sky: ['#639ef2', '#99c9ff', '#e4f2ff'],
      mountain: '#7ea2d6',
      groundBase: '#57392c',
      tile: 'tile_grass',
      tree: 'tree_green',
      accent: '#ff8fb8'
    },
    {
      id: 'summer',
      name: '여름',
      icon: '☀️',
      weatherLabel: '폭염 · 장마 폭우',
      hazards: '침수 구간 · 낙뢰 · 뜨거운 아스팔트 · 날아오는 우산',
      tip: '폭우엔 우산(Q), 폭염엔 그늘, 침수엔 차 지붕을 밟으세요!',
      drainBonus: 0.45,
      sky: ['#3e84e6', '#72b6ff', '#d4ecff'],
      mountain: '#6a96cc',
      groundBase: '#4f3a2e',
      tile: 'tile_grass',
      tree: 'tree_green',
      accent: '#3bc972'
    },
    {
      id: 'autumn',
      name: '가을',
      icon: '🍁',
      weatherLabel: '가을 태풍 · 돌풍',
      hazards: '강풍 · 날아오는 간판 · 낙엽 더미 · 쓰러지는 나무',
      tip: '강풍이 불 땐 우산을 접고 슬라이드로 맞바람을 돌파하세요!',
      drainBonus: 0.15,
      sky: ['#537cd6', '#8eb4f0', '#ffe3bd'],
      mountain: '#7b8ab8',
      groundBase: '#4a4559',
      tile: 'tile_stone',
      tree: 'tree_green',
      accent: '#ff9638'
    },
    {
      id: 'winter',
      name: '겨울',
      icon: '❄️',
      weatherLabel: '북극한파 · 빙판길',
      hazards: '얼음 가시 · 눈더미 · 미끄러운 빙판 · 고드름 낙하 · 눈보라',
      tip: '빙판길에선 착지·슬라이드 미끄러짐에 주의하세요!',
      drainBonus: 0.55,
      sky: ['#5e83d4', '#92b6f5', '#dceaff'],
      mountain: '#89a7db',
      groundBase: '#3d5078',
      tile: 'tile_ice',
      tree: 'tree_snow',
      accent: '#63beff'
    }
  ];

  // 6종 K-날씨 캐릭터 (고유 패시브 + 레벨 성장 + 전용 오라 애니메이션)
  const CHARACTERS = [
    {
      id: 'basic',
      name: '기본 모험가',
      tier: '밸런스',
      icon: '🎒',
      spriteKey: 'basic',
      avatar: 'assets/atlas/char_idle.png',
      useAtlasRun: true,
      auraType: 'basic',
      price: 0,
      baseHp: 105,
      goldMult: 1.1,
      scoreMult: 1.05,
      passiveName: '균형 잡힌 생존가',
      passiveDesc: '사계절 약점 없이 균형 잡힌 체력·속도! 골드 +10%, 점수 +5% 보너스',
      desc: '노란 후드를 쓴 한국 날씨 생존 기본 러너! 균형 잡힌 능력치와 6프레임 풀 모션 적용.',
      tag: '균형형 · 골드 +10%',
      colors: { top: '#f5b82e', outer: '#e09a14', pants: '#2c3a54', shoes: '#f0f4fa', hat: null }
    },
    {
      id: 'umbrella_master',
      name: '우비 소년',
      tier: '장마 특화',
      icon: '☂️',
      spriteKey: 'skin_raincoat',
      avatar: 'assets/sprites/skin_raincoat.png',
      auraType: 'raincoat',
      price: 350,
      baseHp: 112,
      goldMult: 1.15,
      scoreMult: 1.12,
      rainWindResist: 0.55,
      floodResist: true,
      canGlide: true,
      passiveName: '방수 우비 & 우산 활강',
      passiveDesc: '빗물·침수·낙뢰 피해 -55%, 침수 물저항 완화, 공중 점프 꾹 눌러 우산 활강!',
      desc: '장마와 폭우에 최강! 침수 구간에서도 빠르게 달리고 우산으로 활강합니다.',
      tag: '빗물/침수 피해 -55% · 활강',
      colors: { top: '#f2c738', outer: '#e0ad1f', pants: '#2b3d57', shoes: '#f2c738', hat: null, umbrella: true }
    },
    {
      id: 'long_padding',
      name: '패딩 대원',
      tier: '한파 탱커',
      icon: '🧥',
      spriteKey: 'skin_padding',
      avatar: 'assets/sprites/skin_padding.png',
      auraType: 'padding',
      price: 550,
      baseHp: 132,
      goldMult: 1.05,
      scoreMult: 1.1,
      winterResist: 0.45,
      guardChance: 0.25,
      passiveName: '극한 방한 쿠션',
      passiveDesc: '최대 체력 132 & 한파·얼음 피해 -45%, 충돌 시 25% 확률 완전 방어!',
      desc: '중무장 빨간 패딩 탱커! 겨울 북극한파와 고드름에 압도적인 생존력을 자랑합니다.',
      tag: '한파 피해 -45% · 25% 쿠션 방어',
      colors: { top: '#c43232', outer: '#992020', pants: '#1a202b', shoes: '#5c4132', hat: '#c43232' }
    },
    {
      id: 'short_sleeve',
      name: '한복 소년',
      tier: '점수 특화',
      icon: '🎩',
      spriteKey: 'skin_hanbok',
      avatar: 'assets/sprites/skin_hanbok.png',
      auraType: 'hanbok',
      price: 750,
      baseHp: 102,
      goldMult: 1.15,
      scoreMult: 1.25,
      summerImmune: true,
      winterWeakness: 1.15,
      passiveName: '풍류 점수 보너스',
      passiveDesc: '모든 점수 획득 +25% & 여름 폭염·아스팔트 열기 완전 면역! (겨울 피해 +15%)',
      desc: '통풍 최강 한복 + 반팔충 기질! 고득점 랭킹 도전에 최적화된 하이리스크 러너.',
      tag: '점수 +25% · 여름 폭염 면역',
      colors: { top: '#ffffff', outer: '#7ab3f0', pants: '#3b5998', shoes: '#5ec9f2', hat: null }
    },
    {
      id: 'iced_americano',
      name: '스키어 (얼죽아)',
      tier: '빙판 특화',
      icon: '🧊',
      spriteKey: 'skin_skier',
      avatar: 'assets/sprites/skin_skier.png',
      auraType: 'skier',
      price: 1050,
      baseHp: 110,
      goldMult: 1.12,
      scoreMult: 1.18,
      winterResist: 0.35,
      iceMastery: true,
      icedBonus: true,
      passiveName: '빙판길 마스터 & 얼죽아',
      passiveDesc: '빙판 미끄러짐 완전 제어 + 빙판 구간 이동/점수 +20%, 포션 회복량 대폭 증가!',
      desc: '영하 15도에도 아아 한 잔! 겨울 빙판길에서 오히려 최고의 기동력을 발휘합니다.',
      tag: '빙판 제어 & 가속 · 회복 특화',
      colors: { top: '#2b70d4', outer: '#1d54a8', pants: '#232c3d', shoes: '#d9e3f0', hat: null, coffeeCup: true }
    },
    {
      id: 'fashionista',
      name: '산타복',
      tier: '코인 특화',
      icon: '🎅',
      spriteKey: 'skin_santa',
      avatar: 'assets/sprites/skin_santa.png',
      auraType: 'santa',
      price: 1450,
      baseHp: 108,
      goldMult: 1.45,
      scoreMult: 1.2,
      nearMissBonus: true,
      passiveName: '산타의 선물 보따리',
      passiveDesc: '코인·골드 획득 +45% & 장애물 아슬아슬 회피 시 NEAR MISS +5G 보너스!',
      desc: '사계절 코인 잭팟 러너! 상점 강화와 캐릭터 성장을 위한 골드 파밍 최강자.',
      tag: '코인 +45% · 회피 골드 보너스',
      colors: { top: '#d93232', outer: '#b82222', pants: '#2a2a33', shoes: '#362720', hat: null }
    }
  ];

  // 상점 영구 업그레이드
  const UPGRADES = [
    {
      id: 'hp',
      name: '기초 체력 강화',
      icon: 'assets/design/orb_potion.png',
      maxLv: 5,
      basePrice: 120,
      priceStep: 110,
      desc: (lv) => `최대 체력 +${(lv + 1) * 14} (현재 +${lv * 14})`
    },
    {
      id: 'magnet',
      name: '골드 자석 강화',
      icon: 'assets/design/orb_magnet.png',
      maxLv: 5,
      basePrice: 140,
      priceStep: 120,
      desc: (lv) => `코인 자동 흡수 범위 대폭 확대 (현재 Lv.${lv})`
    },
    {
      id: 'defense',
      name: '기상 방어력 강화',
      icon: 'assets/design/ui_chest.png',
      maxLv: 5,
      basePrice: 160,
      priceStep: 130,
      desc: (lv) => `장애물 충돌 피해 -${(lv + 1) * 7}% 감소 (현재 -${lv * 7}%)`
    },
    {
      id: 'score',
      name: '생존 점수 배율',
      icon: 'assets/design/orb_star.png',
      maxLv: 5,
      basePrice: 180,
      priceStep: 150,
      desc: (lv) => `모든 점수 획득 +${(lv + 1) * 12}% (현재 +${lv * 12}%)`
    }
  ];

  // 1회용 출발 부스터
  const BOOSTERS = [
    {
      id: 'norway',
      name: '노르웨이 기상청 (Yr.no)',
      icon: 'assets/design/orb_star.png',
      price: 90,
      desc: '구라청 훼이크 완전 제거! 다가올 폭우·돌풍·빙판·미세먼지를 3초 전 100% 정확히 예고합니다!'
    },
    {
      id: 'shield',
      name: '기상 보호막',
      icon: 'assets/atlas/spr_shield.png',
      price: 80,
      desc: '다음 달리기에서 첫 장애물 충돌 1회를 피해 없이 완전 방어합니다!'
    },
    {
      id: 'boost',
      name: 'FEVER! 쾌속 출발',
      icon: 'assets/design/orb_bolt.png',
      price: 100,
      desc: '시작 후 4.5초간 FEVER 무적 질주 + 코인 자석 자동 발동!'
    }
  ];

  // 일일 미션 (매일 날짜 기준 리셋, 홈 화면에서 바로 진행도 확인 및 수령!)
  const DAILY_MISSIONS = [
    { id: 'dist_1000', metric: 'dist', title: '1,000m 달리기', target: 1000, unit: 'm', rewardGold: 120 },
    { id: 'coins_100', metric: 'coins', title: '코인 100개 획득', target: 100, unit: '개', rewardGold: 150 },
    { id: 'jumps_30', metric: 'jumps', title: '점프 30회 성공', target: 30, unit: '회', rewardGold: 100 }
  ];

  // 7일 연속 출석 보상
  const ATTENDANCE_REWARDS = [
    { day: 1, label: '100G', gold: 100, booster: null },
    { day: 2, label: '보호막 1개', gold: 60, booster: 'shield' },
    { day: 3, label: '180G', gold: 180, booster: null },
    { day: 4, label: '노르웨이 1개', gold: 80, booster: 'norway' },
    { day: 5, label: '250G', gold: 250, booster: null },
    { day: 6, label: 'FEVER 1개', gold: 100, booster: 'boost' },
    { day: 7, label: '500G + 보호막', gold: 500, booster: 'shield' }
  ];

  // 업적 시스템 (10종 — 거리·코인·연도·회피·캐릭터 수집 보상!)
  const ACHIEVEMENTS = [
    { id: 'dist_500', icon: '🏃', title: '첫 걸음마', desc: '단일 주행 500m 도달', metric: 'bestDistanceM', target: 500, rewardGold: 100 },
    { id: 'dist_1500', icon: '🏙️', title: '도심 마라토너', desc: '단일 주행 1,500m 도달', metric: 'bestDistanceM', target: 1500, rewardGold: 250 },
    { id: 'dist_3000', icon: '🇰🇷', title: '대한민국 종주', desc: '단일 주행 3,000m 도달', metric: 'bestDistanceM', target: 3000, rewardGold: 500 },
    { id: 'coins_200', icon: '🪙', title: '코인 수집가', desc: '누적 코인 200개 획득', metric: 'totalCoinsEver', target: 200, rewardGold: 150 },
    { id: 'coins_1000', icon: '💰', title: '황금 만능주의', desc: '누적 코인 1,000개 획득', metric: 'totalCoinsEver', target: 1000, rewardGold: 400 },
    { id: 'year_2', icon: '🗓️', title: '사계절 정복자', desc: '2년 차 이상 생존 돌파', metric: 'bestYear', target: 2, rewardGold: 250 },
    { id: 'year_3', icon: '🔥', title: '기후 생존왕', desc: '3년 차 이상 생존 돌파', metric: 'bestYear', target: 3, rewardGold: 550 },
    { id: 'dodge_10', icon: '⚡', title: '회피의 달인', desc: '장애물 10연속 회피 성공', metric: 'maxDodgeComboEver', target: 10, rewardGold: 200 },
    { id: 'chars_3', icon: '👥', title: '동료 수집가', desc: '캐릭터 3종 이상 해금', metric: 'unlockedCount', target: 3, rewardGold: 300 },
    { id: 'chars_6', icon: '👑', title: 'K-날씨 올컬렉터', desc: '캐릭터 6종 전체 수집 완료', metric: 'unlockedCount', target: 6, rewardGold: 800 }
  ];

  // 스테이지(연도/계절 최초 도달) 마일스톤 보상
  const STAGE_MILESTONES = [
    { id: 'y1_summer', year: 1, seasonIdx: 1, label: '첫 여름 돌파', rewardGold: 40 },
    { id: 'y1_autumn', year: 1, seasonIdx: 2, label: '첫 가을 돌파', rewardGold: 50 },
    { id: 'y1_winter', year: 1, seasonIdx: 3, label: '첫 겨울 돌파', rewardGold: 70 },
    { id: 'y2_spring', year: 2, seasonIdx: 0, label: '첫 2년 차 진입', rewardGold: 150 },
    { id: 'y3_spring', year: 3, seasonIdx: 0, label: '첫 3년 차 진입', rewardGold: 300 }
  ];

  // 실시간 한국 기상 환경 변수 패턴 (조작감·물리·장비 연동)
  const WEATHER_EVENTS = {
    clear: {
      id: 'clear', label: '맑음 (평온)', kmaFake: '맑음 (강수확률 0%)',
      norwayWarn: '쾌청한 구간 (잠시 휴식)', color: '#63d8ff'
    },
    dust: {
      id: 'dust', label: '초미세먼지 경보!', kmaFake: '미세먼지 좋음 · 나들이 최적',
      norwayWarn: '초미세먼지 습격! [마스크 ON]', color: '#e6c24c'
    },
    gust: {
      id: 'gust', label: '태풍·강풍 맞바람!', kmaFake: '바람 잔잔 (풍속 1m/s)',
      norwayWarn: '강풍 돌풍! [우산 접기 · 슬라이드]', color: '#a6e4ff'
    },
    rain: {
      id: 'rain', label: '국지성 폭우!', kmaFake: '맑음 (강수확률 0%)',
      norwayWarn: '국지성 폭우! [우산 ON · 물벼락 주의]', color: '#5cb3ff'
    },
    flood: {
      id: 'flood', label: '장마 침수 구간!', kmaFake: '약한 이슬비 예상',
      norwayWarn: '도로 침수! [차 지붕·벤치 밟기]', color: '#3b82d6'
    },
    heat: {
      id: 'heat', label: '폭염 땡볕 경보!', kmaFake: '선선한 초여름 날씨',
      norwayWarn: '폭염 땡볕! [그늘·버스정류장 밟기]', color: '#ff8a3d'
    },
    ice_road: {
      id: 'ice_road', label: '겨울 빙판길!', kmaFake: '도로 건조 · 쾌적',
      norwayWarn: '빙판길 결빙! [슬라이드 가속 주의]', color: '#8ee8ff'
    }
  };

  const SEASON_WEATHER_POOL = {
    spring: ['dust', 'gust', 'rain'],
    summer: ['heat', 'rain', 'flood'],
    autumn: ['gust', 'rain', 'clear'],
    winter: ['ice_road', 'gust', 'dust']
  };

  // 계절별 한국 날씨 특화 장애물 (모든 계절 대표 재난 + 고유 패턴 적용!)
  // lane: 'low' (1단 점프), 'tall' (2단 점프), 'air' (슬라이드 통과!), 'lightning' (낙뢰), 'icicle' (고드름 낙하)
  const OBSTACLES_BY_SEASON = {
    spring: [
      { id: 'spring_smog', name: '미세먼지 지대', lane: 'low', w: 46, h: 30, dmg: 15, tag: 'dust', customDraw: 'smog_zone' },
      { id: 'spring_branch', name: '날아오는 나뭇가지', lane: 'air', w: 46, h: 28, dmg: 16, tag: 'wind', customDraw: 'flying_branch', speedBonus: 54, warn: true },
      { id: 'spring_fence', name: '꽃샘추위 빙결 울타리', lane: 'low', w: 40, h: 32, dmg: 16, tag: 'cold', sprite: 'obs_fence' },
      { id: 'spring_cloud', name: '황사 번개구름', lane: 'air', w: 54, h: 40, dmg: 17, tag: 'dust', sprite: 'obs_storm_cloud', speedBonus: 38, warn: true },
      { id: 'spring_barricade', name: '강풍 통제 바리케이드', lane: 'tall', w: 44, h: 44, dmg: 18, tag: 'wind', sprite: 'obs_barricade' }
    ],
    summer: [
      { id: 'summer_asphalt', name: '뜨거운 아스팔트', lane: 'low', w: 46, h: 34, dmg: 17, tag: 'heat', customDraw: 'hot_asphalt' },
      { id: 'summer_lightning', name: '여름 낙뢰', lane: 'lightning', w: 30, h: 120, dmg: 20, tag: 'rain', customDraw: 'lightning_strike', strikeDelay: 0.72, warn: true },
      { id: 'summer_umbrella', name: '강풍에 날아오는 우산', lane: 'air', w: 44, h: 34, dmg: 17, tag: 'wind', customDraw: 'flying_umbrella', speedBonus: 62, warn: true },
      { id: 'summer_cloud', name: '장마 국지성 번개구름', lane: 'air', w: 54, h: 42, dmg: 19, tag: 'rain', sprite: 'obs_storm_cloud', speedBonus: 44, warn: true },
      { id: 'summer_barricade', name: '침수 도로 바리케이드', lane: 'tall', w: 46, h: 46, dmg: 19, tag: 'rain', sprite: 'obs_barricade' }
    ],
    autumn: [
      { id: 'autumn_signboard', name: '태풍에 날아오는 간판', lane: 'air', w: 50, h: 32, dmg: 18, tag: 'wind', customDraw: 'flying_sign', speedBonus: 66, warn: true },
      { id: 'autumn_leaves', name: '젖은 낙엽 더미', lane: 'low', w: 44, h: 30, dmg: 15, tag: 'wind', customDraw: 'leaf_pile' },
      { id: 'autumn_tree', name: '쓰러지는 가로수', lane: 'tall', w: 46, h: 50, dmg: 19, tag: 'wind', customDraw: 'falling_tree' },
      { id: 'autumn_tornado', name: '가을 태풍 소용돌이', lane: 'tall', w: 46, h: 50, dmg: 21, tag: 'wind', sprite: 'obs_tornado' },
      { id: 'autumn_crate', name: '강풍에 날린 상자', lane: 'low', w: 36, h: 36, dmg: 16, tag: 'wind', sprite: 'obs_crate' }
    ],
    winter: [
      { id: 'winter_ice_spikes', name: '북극한파 얼음 가시', lane: 'low', w: 44, h: 36, dmg: 18, tag: 'cold', sprite: 'obs_ice_spikes' },
      { id: 'winter_snowbank', name: '폭설 눈더미', lane: 'low', w: 48, h: 34, dmg: 16, tag: 'cold', customDraw: 'snow_pile' },
      { id: 'winter_icicle', name: '고드름 낙하', lane: 'icicle', w: 28, h: 44, dmg: 19, tag: 'cold', customDraw: 'falling_icicle', warn: true },
      { id: 'winter_snowman', name: '폭설 모자 눈사람', lane: 'tall', w: 44, h: 50, dmg: 19, tag: 'cold', sprite: 'obs_snowman' },
      { id: 'winter_hail', name: '눈보라 한파 우박', lane: 'air', w: 38, h: 36, dmg: 19, tag: 'cold', sprite: 'obs_meteor', speedBonus: 68, warn: true }
    ]
  };

  function getYearDifficulty(year) {
    const extra = Math.max(0, year - 1);
    return {
      year,
      speedMult: Math.min(2.05, 1 + extra * 0.14),
      spawnRateMult: Math.min(1.85, 1 + extra * 0.12),
      dmgMult: 1 + extra * 0.12,
      scoreMult: 1 + extra * 0.2,
      goldBonus: extra * 1
    };
  }

  function getUpgradePrice(upg, currentLv) {
    return upg.basePrice + currentLv * upg.priceStep;
  }

  function getCharLevelPrice(currentLv) {
    return 140 + Math.max(0, currentLv - 1) * 130;
  }

  function getCharEffectiveStats(charDef, charLv = 1, upgrades = {}, unlockedCount = 1) {
    const lv = Math.max(1, Math.min(MAX_CHAR_LEVEL, charLv || 1));
    const lvExtra = lv - 1;
    const hpUpgrade = (upgrades && upgrades.hp ? upgrades.hp : 0) * 14;
    const dexScoreBonus = Math.max(0, unlockedCount - 1) * 0.03; // 도감 수집 보너스: 추가 해금당 점수 +3%!
    return {
      level: lv,
      maxHp: charDef.baseHp + lvExtra * 8 + hpUpgrade,
      goldMult: Number((charDef.goldMult + lvExtra * 0.04).toFixed(2)),
      scoreMult: Number((charDef.scoreMult + lvExtra * 0.04 + dexScoreBonus).toFixed(2)),
      dexScorePct: Math.round(dexScoreBonus * 100)
    };
  }

  return {
    SEASON_DURATION,
    YEAR_DURATION,
    MAX_CHAR_LEVEL,
    SEASONS,
    CHARACTERS,
    UPGRADES,
    BOOSTERS,
    DAILY_MISSIONS,
    ATTENDANCE_REWARDS,
    ACHIEVEMENTS,
    STAGE_MILESTONES,
    WEATHER_EVENTS,
    SEASON_WEATHER_POOL,
    OBSTACLES_BY_SEASON,
    getYearDifficulty,
    getUpgradePrice,
    getCharLevelPrice,
    getCharEffectiveStats
  };
})();
