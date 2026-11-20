window.RUN_DATA = (function () {
  const SEASON_DURATION = 15; // 봄 15초, 여름 15초, 가을 15초, 겨울 15초 (동일 비율, 1년 = 60초)
  const YEAR_DURATION = SEASON_DURATION * 4;
  const MAX_CHAR_LEVEL = 5;

  const SEASONS = [
    {
      id: 'spring',
      name: '봄',
      icon: '🌸',
      weatherLabel: '황사 · 미세먼지 · 꽃샘추위',
      hazards: '황사 구름 · 미세먼지 스모그 · 꽃샘 강풍 · 그루터기 · 라바콘',
      tip: '황사·미세먼지 경보 시 마스크(E)를 착용하세요!',
      drainBonus: 0,
      sky: ['#639ef2', '#99c9ff', '#e4f2ff'],
      mountain: '#7ea2d6',
      groundBase: '#57392c',
      tile: 'sp_spring_tile',
      tree: 'sp_cherry_tree',
      treeAlt: 'sp_cherry_tree',
      bush: 'sp_flower_bush',
      prop: 'sp_flower_patch',
      accent: '#ff8fb8'
    },
    {
      id: 'summer',
      name: '여름',
      icon: '☀️',
      weatherLabel: '폭염 · 장마 폭우 · 침수',
      hazards: '폭염 열기 · 침수 파도 · 침수 바리케이드 · 날아오는 우산 · 번개구름',
      tip: '폭우엔 우산(Q), 폭염엔 파라솔·나무 그늘, 침수엔 차 지붕을 밟으세요!',
      drainBonus: 0.45,
      sky: ['#3e84e6', '#72b6ff', '#d4ecff'],
      mountain: '#6a96cc',
      groundBase: '#4f3a2e',
      tile: 'sp_spring_tile',
      tree: 'sp_summer_tree',
      treeAlt: 'sp_palm_tree',
      bush: 'sp_green_bush',
      prop: 'sp_parasol',
      accent: '#3bc972'
    },
    {
      id: 'autumn',
      name: '가을',
      icon: '🍁',
      weatherLabel: '가을 태풍 · 강풍 · 단풍',
      hazards: '태풍 소용돌이 · 쓰러진 나무 · 낙엽 더미 · 도로 표지판 · 강풍',
      tip: '강풍이 불 땐 우산을 접고 슬라이드로 맞바람을 돌파하세요!',
      drainBonus: 0.15,
      sky: ['#537cd6', '#8eb4f0', '#ffe3bd'],
      mountain: '#7b8ab8',
      groundBase: '#4a4559',
      tile: 'sp_metal_box',
      tree: 'sp_autumn_tree',
      treeAlt: 'sp_autumn_tree',
      bush: 'sp_rock',
      prop: 'sp_tilted_lamp',
      accent: '#ff9638'
    },
    {
      id: 'winter',
      name: '겨울',
      icon: '❄️',
      weatherLabel: '북극한파 · 폭설 · 빙판길',
      hazards: '얼음 가시 · 폭설 눈더미 · 눈사람 · 고드름 낙하 · 눈보라',
      tip: '빙판길에선 착지·슬라이드 미끄러짐에 주의하세요!',
      drainBonus: 0.55,
      sky: ['#5e83d4', '#92b6f5', '#dceaff'],
      mountain: '#89a7db',
      groundBase: '#3d5078',
      tile: 'sp_ice_tile',
      tree: 'sp_winter_tree',
      treeAlt: 'sp_winter_tree',
      bush: 'sp_snow_rock',
      prop: 'sp_tilted_lamp',
      accent: '#63beff'
    }
  ];

  // 5종 K-날씨 캐릭터 (하트 체력제 + 7단계 풀 애니메이션 + 고유 패시브 + 레벨 성장)
  const CHARACTERS = [
    {
      id: 'umbrella_master',
      name: '우비 소년',
      tier: '장마 특화',
      icon: '☂️',
      spriteKey: 'yellow_idle_0',
      animSkin: 'yellow',
      animFrames: 3,
      avatar: 'assets/chars/port_yellow.png?v=20261121v2',
      auraType: 'raincoat',
      price: 0,
      baseHp: 5,
      goldMult: 1.15,
      scoreMult: 1.12,
      rainGraceBonus: 1.5,
      floodResist: true,
      canGlide: true,
      passiveName: '방수 우비 & 우산 활강',
      passiveDesc: '빗물 내성(+1.5초 여유), 침수 물저항 완화, 공중 점프 꾹 눌러 우산 활강!',
      desc: '노란 우비를 쓴 기본 생존 러너! 장마와 폭우에 강하고 공중에서 우산으로 활강합니다.',
      tag: '기본 · 빗물 내성 · 침수 특화 · 활강',
      colors: { top: '#f2c738', outer: '#e0ad1f', pants: '#2b3d57', shoes: '#f2c738', hat: null, umbrella: true }
    },
    {
      id: 'long_padding',
      name: '패딩 대원',
      tier: '한파 탱커',
      icon: '🧥',
      spriteKey: 'blue_idle_0',
      animSkin: 'blue',
      animFrames: 2,
      avatar: 'assets/chars/port_blue.png?v=20261121v2',
      auraType: 'padding',
      price: 350,
      baseHp: 6,
      goldMult: 1.05,
      scoreMult: 1.1,
      extraInvuln: 0.45,
      passiveName: '중무장 방한 탱커',
      passiveDesc: '기본 체력 6하트(+1하트) & 피격 후 무적 시간 +0.45초 연장!',
      desc: '중무장 파란 패딩 탱커! 더 많은 하트와 긴 무적 시간으로 안정적인 생존력을 자랑합니다.',
      tag: '기본 6하트 · 무적 시간 +0.45초',
      colors: { top: '#2d74e0', outer: '#1c52ad', pants: '#1a243b', shoes: '#3c5070', hat: '#2d74e0' }
    },
    {
      id: 'short_sleeve',
      name: '한복 소년',
      tier: '점수 특화',
      icon: '🎩',
      spriteKey: 'hanbok_idle_0',
      animSkin: 'hanbok',
      animFrames: 2,
      avatar: 'assets/chars/port_hanbok.png?v=20261121v2',
      auraType: 'hanbok',
      price: 650,
      baseHp: 5,
      goldMult: 1.15,
      scoreMult: 1.25,
      summerImmune: true,
      passiveName: '풍류 점수 보너스',
      passiveDesc: '모든 점수 획득 +25% & 여름 폭염 열사병(열기 게이지) 완전 면역!',
      desc: '통풍 최강 한복 + 반팔충 기질! 여름 폭염을 무시하며 고득점 랭킹에 도전하세요.',
      tag: '점수 +25% · 여름 열사병 면역',
      colors: { top: '#ffffff', outer: '#7ab3f0', pants: '#3b5998', shoes: '#5ec9f2', hat: null }
    },
    {
      id: 'iced_americano',
      name: '스키어 (얼죽아)',
      tier: '빙판 특화',
      icon: '🧊',
      spriteKey: 'skier_idle_0',
      animSkin: 'skier',
      animFrames: 2,
      avatar: 'assets/chars/port_skier.png?v=20261121v2',
      auraType: 'skier',
      price: 950,
      baseHp: 5,
      goldMult: 1.12,
      scoreMult: 1.18,
      iceMastery: true,
      icedBonus: true,
      passiveName: '빙판길 마스터 & 얼죽아',
      passiveDesc: '빙판 미끄러짐 완전 제어 + 빙판 구간 이동/점수 +20%, 음료 아이템 점수·피버 대폭 증가!',
      desc: '영하 15도에도 아아 한 잔! 겨울 빙판길에서 오히려 최고의 기동력을 발휘합니다.',
      tag: '빙판 제어 & 가속 · 피버 특화',
      colors: { top: '#2b70d4', outer: '#1d54a8', pants: '#232c3d', shoes: '#d9e3f0', hat: null, coffeeCup: true }
    },
    {
      id: 'fashionista',
      name: '산타복',
      tier: '코인 특화',
      icon: '🎅',
      spriteKey: 'santa_idle_0',
      animSkin: 'santa',
      animFrames: 2,
      avatar: 'assets/chars/port_santa.png?v=20261121v2',
      auraType: 'santa',
      price: 1350,
      baseHp: 5,
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
      desc: (lv) => `최대 체력(하트) +${lv + 1}칸 (현재 +${lv}칸)`
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
      name: '기상 대응력 강화',
      icon: 'assets/design/ui_chest.png',
      maxLv: 5,
      basePrice: 160,
      priceStep: 130,
      desc: (lv) => `우산·마스크 쿨타임 -${((lv + 1) * 0.35).toFixed(1)}초 & 피격 무적 +${((lv + 1) * 0.2).toFixed(1)}초`
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
    { id: 'chars_6', icon: '👑', title: 'K-날씨 올컬렉터', desc: '캐릭터 5종 전체 수집 완료', metric: 'unlockedCount', target: 5, rewardGold: 800 }
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
      id: 'dust', label: '황사 · 미세먼지 경보!', kmaFake: '미세먼지 좋음 · 나들이 최적',
      norwayWarn: '황사 습격! [마스크 ON 필수]', color: '#e6c24c'
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

  // 계절별 한국 날씨 특화 장애물 (100% 업로드된 도트 시트 스프라이트만 사용!)
  // lane: 'low' (1단 점프), 'tall' (2단 점프), 'air' (슬라이드 통과!), 'icicle' (상단 고드름 낙하)
  const OBSTACLES_BY_SEASON = {
    spring: [
      { id: 'spring_dust_cloud', name: '황사 모래구름', lane: 'air', w: 50, h: 36, tag: 'dust', sprite: 'sp_dust_cloud', speedBonus: 36, warn: true },
      { id: 'spring_smog_cloud', name: '미세먼지 스모그', lane: 'air', w: 48, h: 40, tag: 'dust', sprite: 'sp_smog_cloud', speedBonus: 40, warn: true },
      { id: 'spring_gust', name: '꽃샘 강풍 돌풍', lane: 'air', w: 48, h: 32, tag: 'wind', sprite: 'sp_gust_wind', speedBonus: 54, warn: true },
      { id: 'spring_stump', name: '새싹 그루터기', lane: 'low', w: 34, h: 36, tag: 'wind', sprite: 'sp_stump' },
      { id: 'spring_cone', name: '도로 라바콘', lane: 'low', w: 32, h: 34, tag: 'wind', sprite: 'sp_traffic_cone' },
      { id: 'spring_sign', name: '강풍 위험 표지판', lane: 'low', w: 36, h: 34, tag: 'dust', sprite: 'sp_warning_sign' },
      { id: 'spring_barricade', name: '강풍 통제 바리케이드', lane: 'tall', w: 46, h: 44, tag: 'wind', sprite: 'sp_barricade' }
    ],
    summer: [
      { id: 'summer_heat_waves', name: '폭염 아스팔트 열기', lane: 'low', w: 36, h: 38, tag: 'heat', sprite: 'sp_heat_waves' },
      { id: 'summer_heat_mound', name: '불타는 폭염 도로', lane: 'low', w: 46, h: 34, tag: 'heat', sprite: 'sp_heat_mound' },
      { id: 'summer_puddle', name: '장마 빗물 웅덩이', lane: 'low', w: 42, h: 30, tag: 'rain', sprite: 'sp_puddle' },
      { id: 'summer_flood_wave', name: '거센 침수 파도', lane: 'low', w: 46, h: 34, tag: 'rain', sprite: 'sp_flood_wave1' },
      { id: 'summer_flood_barricade', name: '침수 도로 바리케이드', lane: 'tall', w: 48, h: 42, tag: 'rain', sprite: 'sp_flood_barricade' },
      { id: 'summer_cactus', name: '폭염 사막 선인장', lane: 'tall', w: 40, h: 46, tag: 'heat', sprite: 'sp_cactus' },
      { id: 'summer_barrel', name: '폭염 고압 드럼통', lane: 'low', w: 34, h: 38, tag: 'heat', sprite: 'sp_hazard_barrel' },
      { id: 'summer_umbrella', name: '강풍에 날아오는 우산', lane: 'air', w: 44, h: 36, tag: 'wind', sprite: 'sp_red_umbrella', speedBonus: 56, warn: true },
      { id: 'summer_thunder', name: '장마 번개구름', lane: 'air', w: 48, h: 44, tag: 'rain', sprite: 'sp_thunder_cloud', speedBonus: 44, warn: true },
      { id: 'summer_raincloud', name: '국지성 폭우 구름', lane: 'air', w: 46, h: 42, tag: 'rain', sprite: 'sp_rain_cloud', speedBonus: 38, warn: true }
    ],
    autumn: [
      { id: 'autumn_leaf_pile', name: '붉은 낙엽 더미', lane: 'low', w: 46, h: 32, tag: 'wind', sprite: 'sp_leaf_pile' },
      { id: 'autumn_fallen_tree', name: '쓰러진 가을 나무', lane: 'low', w: 52, h: 34, tag: 'wind', sprite: 'sp_fallen_tree' },
      { id: 'autumn_fence', name: '강풍 나무 울타리', lane: 'low', w: 44, h: 34, tag: 'wind', sprite: 'sp_fence' },
      { id: 'autumn_crate', name: '태풍에 날린 상자', lane: 'low', w: 38, h: 36, tag: 'wind', sprite: 'sp_crate' },
      { id: 'autumn_road_sign', name: '기울어진 도로 표지판', lane: 'tall', w: 42, h: 46, tag: 'wind', sprite: 'sp_road_sign' },
      { id: 'autumn_tornado', name: '가을 태풍 소용돌이', lane: 'tall', w: 46, h: 48, tag: 'wind', sprite: 'sp_tornado' },
      { id: 'autumn_siren', name: '태풍 경보 경광등', lane: 'tall', w: 30, h: 46, tag: 'wind', sprite: 'sp_siren_post' },
      { id: 'autumn_leaves_air', name: '날아오는 단풍 돌풍', lane: 'air', w: 44, h: 36, tag: 'wind', sprite: 'sp_falling_leaves', speedBonus: 50, warn: true },
      { id: 'autumn_gust', name: '가을 태풍 강풍', lane: 'air', w: 48, h: 34, tag: 'wind', sprite: 'sp_gust_wind', speedBonus: 58, warn: true },
      { id: 'autumn_mace', name: '강풍 낙하 철퇴', lane: 'air', w: 42, h: 42, tag: 'wind', sprite: 'sp_mace', speedBonus: 62, warn: true }
    ],
    winter: [
      { id: 'winter_ice_spikes', name: '북극한파 얼음 가시', lane: 'low', w: 46, h: 36, tag: 'cold', sprite: 'sp_ice_spikes' },
      { id: 'winter_snow_pile', name: '폭설 눈더미', lane: 'low', w: 48, h: 32, tag: 'cold', sprite: 'sp_snow_pile' },
      { id: 'winter_snow_rock', name: '눈 덮인 바위', lane: 'low', w: 42, h: 34, tag: 'cold', sprite: 'sp_snow_rock' },
      { id: 'winter_spike_strip', name: '빙판 가시 함정', lane: 'low', w: 48, h: 28, tag: 'cold', sprite: 'sp_spike_strip' },
      { id: 'winter_spike_stump', name: '얼어붙은 가시 그루터기', lane: 'low', w: 44, h: 34, tag: 'cold', sprite: 'sp_spike_stump' },
      { id: 'winter_snowman', name: '폭설 모자 눈사람', lane: 'tall', w: 42, h: 48, tag: 'cold', sprite: 'sp_snowman' },
      { id: 'winter_ice_crystal', name: '거대 빙하 수정', lane: 'tall', w: 36, h: 48, tag: 'cold', sprite: 'sp_ice_crystal' },
      { id: 'winter_icicle', name: '고드름 낙하', lane: 'icicle', w: 44, h: 38, tag: 'cold', sprite: 'sp_icicles', warn: true },
      { id: 'winter_snowflake', name: '눈보라 거대 눈결정', lane: 'air', w: 40, h: 40, tag: 'cold', sprite: 'sp_snowflake', speedBonus: 56, warn: true },
      { id: 'winter_snow_cloud', name: '폭설 눈구름', lane: 'air', w: 48, h: 34, tag: 'cold', sprite: 'sp_snow_cloud', speedBonus: 44, warn: true }
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
    const lvHeartBonus = (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0);
    const hpUpgrade = upgrades && upgrades.hp ? upgrades.hp : 0;
    const dexScoreBonus = Math.max(0, unlockedCount - 1) * 0.03; // 도감 수집 보너스: 추가 해금당 점수 +3%!
    return {
      level: lv,
      maxHp: charDef.baseHp + lvHeartBonus + hpUpgrade,
      goldMult: Number((charDef.goldMult + lvExtra * 0.05).toFixed(2)),
      scoreMult: Number((charDef.scoreMult + lvExtra * 0.05 + dexScoreBonus).toFixed(2)),
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
