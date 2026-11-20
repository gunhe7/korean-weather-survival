window.RUN_DATA = (function () {
  const SEASON_DURATION = 15; // 봄 15초, 여름 15초, 가을 15초, 겨울 15초 (동일 비율, 1년 = 60초)
  const YEAR_DURATION = SEASON_DURATION * 4;

  const SEASONS = [
    {
      id: 'spring',
      name: '봄',
      weatherLabel: '미세먼지 · 꽃샘추위',
      drainBonus: 0,
      sky: ['#639ef2', '#99c9ff', '#e4f2ff'],
      tile: 'tile_grass',
      tree: 'tree_green',
      accent: '#ff8fb8'
    },
    {
      id: 'summer',
      name: '여름',
      weatherLabel: '폭염 · 장마 폭우',
      drainBonus: 0.45,
      sky: ['#3e84e6', '#72b6ff', '#d4ecff'],
      tile: 'tile_grass',
      tree: 'tree_green',
      accent: '#3bc972'
    },
    {
      id: 'autumn',
      name: '가을',
      weatherLabel: '가을 태풍 · 돌풍',
      drainBonus: 0.15,
      sky: ['#537cd6', '#8eb4f0', '#ffe3bd'],
      tile: 'tile_stone',
      tree: 'tree_green',
      accent: '#ff9638'
    },
    {
      id: 'winter',
      name: '겨울',
      weatherLabel: '북극한파 · 폭설',
      drainBonus: 0.55,
      sky: ['#5e83d4', '#92b6f5', '#dceaff'],
      tile: 'tile_ice',
      tree: 'tree_snow',
      accent: '#63beff'
    }
  ];

  // 6종 K-날씨 캐릭터 (업로드된 도트 캐릭터 & 스킨 스프라이트 연동)
  const CHARACTERS = [
    {
      id: 'basic',
      name: '기본 모험가',
      tier: '기본',
      icon: '🎒',
      spriteKey: 'basic',
      avatar: 'assets/sprites/motion_idle.png',
      useFullMotions: true,
      price: 0,
      baseHp: 100,
      goldMult: 1.1,
      scoreMult: 1.0,
      desc: '노란 후드를 쓴 한국 날씨 생존 기본 러너! 달리기·점프·피격·아이템 풀 모션 적용, 골드 획득 +10%!',
      tag: '기본 보너스: 골드 +10%',
      colors: { top: '#f5b82e', outer: '#e09a14', pants: '#2c3a54', shoes: '#f0f4fa', hat: null }
    },
    {
      id: 'iced_americano',
      name: '얼죽아 (스키어)',
      tier: '인기',
      icon: '🧊',
      spriteKey: 'skin_skier',
      avatar: 'assets/sprites/skin_skier.png',
      price: 300,
      baseHp: 105,
      goldMult: 1.05,
      scoreMult: 1.1,
      winterResist: 0.35,
      icedBonus: true,
      desc: '영하 15도에도 아이스 아메리카노! 겨울 한파·얼음가시 피해 -35%, 포션/아아 회복·점수 대폭 증가!',
      tag: '겨울 피해 -35% · 회복 특화',
      colors: { top: '#2b70d4', outer: '#1d54a8', pants: '#232c3d', shoes: '#d9e3f0', hat: null, coffeeCup: true }
    },
    {
      id: 'short_sleeve',
      name: '반팔충 (한복 소년)',
      tier: '하이리스크',
      icon: '🎩',
      spriteKey: 'skin_hanbok',
      avatar: 'assets/sprites/skin_hanbok.png',
      price: 500,
      baseHp: 100,
      goldMult: 1.15,
      scoreMult: 1.18,
      summerImmune: true,
      winterWeakness: 1.2,
      desc: '통풍 최강 여름 한복 + 반팔충 기질! 여름 폭염·열기 불꽃 피해 완전 면역 & 점수 +18% (겨울 피해 +20%).',
      tag: '여름 폭염 면역 · 점수 +18%',
      colors: { top: '#ffffff', outer: '#7ab3f0', pants: '#3b5998', shoes: '#5ec9f2', hat: null }
    },
    {
      id: 'long_padding',
      name: '패딩 대원',
      tier: '탱커',
      icon: '🧥',
      spriteKey: 'skin_padding',
      avatar: 'assets/sprites/skin_padding.png',
      price: 800,
      baseHp: 132,
      goldMult: 1.0,
      scoreMult: 1.08,
      guardChance: 0.25,
      desc: '고글과 빨간 중무장 패딩으로 무장! 최대 체력 132 & 충돌 시 25% 확률로 패딩 쿠션 완전 방어!',
      tag: '최대 체력 132 · 25% 쿠션 방어',
      colors: { top: '#c43232', outer: '#992020', pants: '#1a202b', shoes: '#5c4132', hat: '#c43232' }
    },
    {
      id: 'umbrella_master',
      name: '우비 소년',
      tier: '테크닉',
      icon: '☂️',
      spriteKey: 'skin_raincoat',
      avatar: 'assets/sprites/skin_raincoat.png',
      price: 1100,
      baseHp: 112,
      goldMult: 1.15,
      scoreMult: 1.12,
      rainWindResist: 0.5,
      canGlide: true,
      desc: '장마·번개구름·태풍 피해 -50%! 공중에서 점프 버튼을 꾹 누르면 우산을 펼쳐 천천히 활강합니다.',
      tag: '우산 활강 · 폭우/태풍 피해 -50%',
      colors: { top: '#f2c738', outer: '#e0ad1f', pants: '#2b3d57', shoes: '#f2c738', hat: null, umbrella: true }
    },
    {
      id: 'fashionista',
      name: '산타복 (패션 피플)',
      tier: '골드/점수',
      icon: '🎅',
      spriteKey: 'skin_santa',
      avatar: 'assets/sprites/skin_santa.png',
      price: 1500,
      baseHp: 105,
      goldMult: 1.4,
      scoreMult: 1.25,
      nearMissBonus: true,
      desc: '사계절 내내 시선 집중 패셔니스타! 골드 +40%, 점수 +25%, 아슬아슬 회피 시 NEAR MISS 보너스!',
      tag: '골드 +40% · 회피 보너스',
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
      icon: 'assets/design/orb_potion.png',
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

  // 계절별 한국 날씨 장애물 (보내주신 디자인 시트 스프라이트 100% 연동!)
  // lane: 'low' (1단 점프), 'tall' (2단 점프), 'air' (슬라이드 통과!)
  const OBSTACLES_BY_SEASON = {
    spring: [
      { id: 'spring_fence', name: '꽃샘 강풍 울타리', lane: 'low', w: 40, h: 32, dmg: 16, tag: 'wind', sprite: 'obs_fence' },
      { id: 'spring_sign', name: '황사 주의 표지판', lane: 'low', w: 36, h: 36, dmg: 16, tag: 'dust', sprite: 'obs_warning_sign' },
      { id: 'spring_cloud', name: '초미세먼지 번개구름', lane: 'air', w: 54, h: 42, dmg: 18, tag: 'dust', sprite: 'obs_storm_cloud', speedBonus: 40, warn: true },
      { id: 'spring_barricade', name: '강풍 통제 바리케이드', lane: 'tall', w: 46, h: 46, dmg: 19, tag: 'wind', sprite: 'obs_barricade' }
    ],
    summer: [
      { id: 'summer_fire', name: '폭염 아스팔트 열기', lane: 'low', w: 36, h: 42, dmg: 18, tag: 'heat', sprite: 'obs_fire' },
      { id: 'summer_cloud', name: '장마 국지성 번개구름', lane: 'air', w: 56, h: 44, dmg: 20, tag: 'rain', sprite: 'obs_storm_cloud', speedBonus: 48, warn: true },
      { id: 'summer_barricade', name: '침수 도로 바리케이드', lane: 'tall', w: 48, h: 48, dmg: 20, tag: 'rain', sprite: 'obs_barricade' },
      { id: 'summer_meteor', name: '게릴라 우박 낙하물', lane: 'air', w: 38, h: 38, dmg: 19, tag: 'rain', sprite: 'obs_meteor', speedBonus: 68, warn: true }
    ],
    autumn: [
      { id: 'autumn_crate', name: '태풍에 날린 상자', lane: 'low', w: 36, h: 36, dmg: 17, tag: 'wind', sprite: 'obs_crate' },
      { id: 'autumn_sign', name: '태풍 경보 표지판', lane: 'low', w: 36, h: 38, dmg: 17, tag: 'wind', sprite: 'obs_warning_sign' },
      { id: 'autumn_tornado', name: '가을 태풍 소용돌이', lane: 'tall', w: 48, h: 52, dmg: 22, tag: 'wind', sprite: 'obs_tornado' },
      { id: 'autumn_mace', name: '강풍 날아오는 낙하물', lane: 'air', w: 48, h: 42, dmg: 20, tag: 'wind', sprite: 'obs_mace', speedBonus: 65, warn: true }
    ],
    winter: [
      { id: 'winter_ice_spikes', name: '북극한파 얼음 가시', lane: 'low', w: 44, h: 38, dmg: 19, tag: 'cold', sprite: 'obs_ice_spikes' },
      { id: 'winter_snowman', name: '폭설 모자 눈사람', lane: 'tall', w: 44, h: 52, dmg: 20, tag: 'cold', sprite: 'obs_snowman' },
      { id: 'winter_spikes', name: '얼어붙은 빙판 송곳', lane: 'low', w: 48, h: 32, dmg: 19, tag: 'cold', sprite: 'obs_spikes' },
      { id: 'winter_ice_block', name: '북극 빙하 얼음블록', lane: 'low', w: 38, h: 38, dmg: 18, tag: 'cold', sprite: 'obs_ice_block' },
      { id: 'winter_hail', name: '영하 20도 한파 우박', lane: 'air', w: 38, h: 38, dmg: 21, tag: 'cold', sprite: 'obs_meteor', speedBonus: 72, warn: true }
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

  return {
    SEASON_DURATION,
    YEAR_DURATION,
    SEASONS,
    CHARACTERS,
    UPGRADES,
    BOOSTERS,
    WEATHER_EVENTS,
    SEASON_WEATHER_POOL,
    OBSTACLES_BY_SEASON,
    getYearDifficulty,
    getUpgradePrice
  };
})();
