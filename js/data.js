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
      avatar: 'assets/chars/port_yellow.png?v=20261121hd8',
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
      avatar: 'assets/chars/port_blue.png?v=20261121hd8',
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
      avatar: 'assets/chars/port_hanbok.png?v=20261121hd8',
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
      avatar: 'assets/chars/port_skier.png?v=20261121hd8',
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
      avatar: 'assets/chars/port_santa.png?v=20261121hd8',
      auraType: 'santa',
      price: 1350,
      baseHp: 5,
      goldMult: 1.45,
      scoreMult: 1.2,
      nearMissBonus: true,
      passiveName: '산타의 선물 보따리',
      passiveDesc: '코인·골드 획득 +45% & 장애물 아슬아슬 회피 시 NEAR MISS +2G 보너스!',
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
      icon: 'assets/design/orb_potion.png?v=20261121hd8',
      maxLv: 5,
      basePrice: 120,
      priceStep: 110,
      desc: (lv) => `최대 체력(하트) +${lv + 1}칸 (현재 +${lv}칸)`
    },
    {
      id: 'magnet',
      name: '골드 자석 강화',
      icon: 'assets/design/orb_magnet.png?v=20261121hd8',
      maxLv: 5,
      basePrice: 140,
      priceStep: 120,
      desc: (lv) => `코인 자동 흡수 범위 대폭 확대 (현재 Lv.${lv})`
    },
    {
      id: 'defense',
      name: '기상 대응력 강화',
      icon: 'assets/design/ui_chest.png?v=20261121hd8',
      maxLv: 5,
      basePrice: 160,
      priceStep: 130,
      desc: (lv) => `우산·마스크 쿨타임 -${((lv + 1) * 0.35).toFixed(1)}초 & 피격 무적 +${((lv + 1) * 0.2).toFixed(1)}초`
    },
    {
      id: 'score',
      name: '생존 점수 배율',
      icon: 'assets/design/orb_star.png?v=20261121hd8',
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
      icon: 'assets/design/orb_star.png?v=20261121hd8',
      price: 90,
      desc: '구라청 훼이크 완전 제거! 다가올 폭우·돌풍·빙판·미세먼지를 3초 전 100% 정확히 예고합니다!'
    },
    {
      id: 'shield',
      name: '기상 보호막',
      icon: 'assets/atlas/spr_shield.png?v=20261121hd8',
      price: 80,
      desc: '다음 달리기에서 첫 장애물 충돌 1회를 피해 없이 완전 방어합니다!'
    },
    {
      id: 'boost',
      name: 'FEVER! 쾌속 출발',
      icon: 'assets/design/orb_bolt.png?v=20261121hd8',
      price: 100,
      desc: '시작 후 4.5초간 FEVER 무적 질주 + 코인 자석 자동 발동!'
    }
  ];

  // 일일 퀘스트 (매일 초기화 · 완료 시 황금 상자 1개!)
  const DAILY_MISSIONS = [
    { id: 'daily_dist', metric: 'dist', title: '800m 달리기', icon: '🏃', target: 800, unit: 'm', rewardChest: 'gold' },
    { id: 'daily_jumps', metric: 'jumps', title: '점프 35회 성공', icon: '⬆️', target: 35, unit: '회', rewardChest: 'gold' },
    { id: 'daily_dodges', metric: 'dodges', title: '장애물 18회 회피', icon: '⚡', target: 18, unit: '회', rewardChest: 'gold' },
    { id: 'daily_coins', metric: 'coins', title: '코인 30개 획득', icon: '🪙', target: 30, unit: '개', rewardChest: 'gold' }
  ];

  // 주간 퀘스트 (매주 월요일 초기화 · 완료 시 다이아 상자 1개!)
  const WEEKLY_MISSIONS = [
    { id: 'weekly_dist', metric: 'dist', title: '5,000m 누적 달리기', icon: '🌍', target: 5000, unit: 'm', rewardChest: 'diamond' },
    { id: 'weekly_runs', metric: 'runs', title: '생존 도전 6회 플레이', icon: '🎮', target: 6, unit: '회', rewardChest: 'diamond' },
    { id: 'weekly_dodges', metric: 'dodges', title: '장애물 90회 회피', icon: '💨', target: 90, unit: '회', rewardChest: 'diamond' },
    { id: 'weekly_year2', metric: 'year2Runs', title: '2년 차 이상 생존 3회', icon: '🔥', target: 3, unit: '회', rewardChest: 'diamond' }
  ];

  // 스킨 등급 정의 (중복 시 골드 보상 투명 공개!)
  const SKIN_RARITIES = {
    common:    { id: 'common',    name: '일반', color: '#a3c8eb', bg: '#2c4469', dupGold: 120 },
    rare:      { id: 'rare',      name: '희귀', color: '#47c8ff', bg: '#18548a', dupGold: 300 },
    epic:      { id: 'epic',      name: '에픽', color: '#d084ff', bg: '#5a238a', dupGold: 650 },
    legendary: { id: 'legendary', name: '전설', color: '#ffca42', bg: '#8f5200', dupGold: 1200 },
    mythic:    { id: 'mythic',    name: '신화', color: '#ff5ea8', bg: '#8a144d', dupGold: 2500 }
  };

  // 20종 수집형 스킨 (일반 5 · 희귀 5 · 에픽 4 · 전설 4 · 신화 2)
  // 각 스킨은 캐릭터 외형 색상 변형 + 전용 오라/잔상으로 인게임 및 홈화면 즉시 반영!
  const SKINS = [
    // 일반 (5)
    { id: 'mint_rain',      name: '민트 우비',     rarity: 'common',    charId: 'umbrella_master', filter: 'hue-rotate(92deg) saturate(1.15)', glow: '#5ef5c8', trail: ['#5ef5c8', '#ffffff'] },
    { id: 'coral_rain',     name: '코랄 우비',     rarity: 'common',    charId: 'umbrella_master', filter: 'hue-rotate(-28deg) saturate(1.25)', glow: '#ff8a6b', trail: ['#ff8a6b', '#ffe0b5'] },
    { id: 'teal_pad',       name: '청록 패딩',     rarity: 'common',    charId: 'long_padding',    filter: 'hue-rotate(-38deg) saturate(1.15)', glow: '#4ce0d2', trail: ['#4ce0d2', '#c8fff9'] },
    { id: 'jade_hanbok',    name: '비취 한복',     rarity: 'common',    charId: 'short_sleeve',    filter: 'hue-rotate(78deg) saturate(1.15)',  glow: '#78ebb4', trail: ['#78ebb4', '#e0fff0'] },
    { id: 'pine_santa',     name: '숲속 산타',     rarity: 'common',    charId: 'fashionista',     filter: 'hue-rotate(112deg) saturate(1.1)',  glow: '#5cd67d', trail: ['#5cd67d', '#ffe86b'] },
    // 희귀 (5)
    { id: 'cherry_rain',    name: '벚꽃 우비',     rarity: 'rare',      charId: 'umbrella_master', filter: 'hue-rotate(-68deg) saturate(1.3) brightness(1.06)', glow: '#ff8ec7', trail: ['#ff8ec7', '#ffe6f2'] },
    { id: 'crimson_pad',    name: '크림슨 패딩',   rarity: 'rare',      charId: 'long_padding',    filter: 'hue-rotate(138deg) saturate(1.35)', glow: '#ff5e78', trail: ['#ff5e78', '#ffd1d9'] },
    { id: 'royal_hanbok',   name: '어사 한복',     rarity: 'rare',      charId: 'short_sleeve',    filter: 'hue-rotate(-45deg) saturate(1.35) brightness(1.04)', glow: '#ffd659', trail: ['#ffd659', '#ff9944'] },
    { id: 'aurora_skier',   name: '오로라 스키어', rarity: 'rare',      charId: 'iced_americano',  filter: 'hue-rotate(64deg) saturate(1.35)',  glow: '#6bffd8', trail: ['#6bffd8', '#78aaff'] },
    { id: 'gold_santa',     name: '황금 산타',     rarity: 'rare',      charId: 'fashionista',     filter: 'hue-rotate(42deg) saturate(1.45) brightness(1.08)', glow: '#ffdf4d', trail: ['#ffdf4d', '#ffffff'] },
    // 에픽 (4)
    { id: 'thunder_rain',   name: '뇌우 폭풍 우비', rarity: 'epic',      charId: 'umbrella_master', filter: 'hue-rotate(175deg) saturate(1.4) contrast(1.06)', glow: '#78c4ff', trail: ['#78c4ff', '#ffe959'], gemPrice: 28 },
    { id: 'glacier_pad',    name: '빙하 수호대원',  rarity: 'epic',      charId: 'long_padding',    filter: 'hue-rotate(-18deg) saturate(1.3) brightness(1.14)', glow: '#8cf4ff', trail: ['#8cf4ff', '#ffffff'] },
    { id: 'eclipse_hanbok', name: '월식 선비',      rarity: 'epic',      charId: 'short_sleeve',    filter: 'hue-rotate(195deg) saturate(1.45)', glow: '#c87aff', trail: ['#c87aff', '#75d8ff'] },
    { id: 'cyber_skier',    name: '사이버 스키어',  rarity: 'epic',      charId: 'iced_americano',  filter: 'hue-rotate(115deg) saturate(1.55) contrast(1.06)', glow: '#ff6be6', trail: ['#ff6be6', '#5ef2ff'], gemPrice: 32 },
    // 전설 (4)
    { id: 'solar_rain',     name: '태양신 우비',    rarity: 'legendary', charId: 'umbrella_master', filter: 'hue-rotate(-14deg) saturate(1.55) brightness(1.12)', glow: '#ffbb29', trail: ['#fff078', '#ff7b29'] },
    { id: 'phoenix_pad',    name: '불사조 패딩',    rarity: 'legendary', charId: 'long_padding',    filter: 'hue-rotate(162deg) saturate(1.65) brightness(1.1)', glow: '#ff6b2b', trail: ['#ff6b2b', '#ffe852'], gemPrice: 55 },
    { id: 'dragon_hanbok',  name: '청룡 도령',      rarity: 'legendary', charId: 'short_sleeve',    filter: 'hue-rotate(148deg) saturate(1.5) brightness(1.1)', glow: '#38e8ff', trail: ['#38e8ff', '#ffe259'] },
    { id: 'frost_santa',    name: '겨울왕국 산타',  rarity: 'legendary', charId: 'fashionista',     filter: 'hue-rotate(198deg) saturate(1.45) brightness(1.12)', glow: '#75e6ff', trail: ['#75e6ff', '#ffffff'] },
    // 신화 (3 — 초희귀 다이아 상자 & 보석 스페셜 스킨!)
    {
      id: 'catgirl_hoodie',
      name: '화이트 냥이 후드',
      rarity: 'mythic',
      charId: 'umbrella_master',
      filter: 'none',
      customAnimSkin: 'catgirl',
      customAnimFrames: 4,
      customAvatar: 'assets/chars/port_catgirl.png?v=20261121hd8',
      customShieldVfx: 'catgirl_fx_paw',
      gemPrice: 45,
      glow: '#ff96dc',
      trail: ['#ff96dc', '#ffffff', '#ffc4ee'],
      desc: '4× HD 전용 풀애니메이션(달리기·점프·슬라이드·유령) & 핑크 냥이 발바닥 오라!'
    },
    { id: 'mythic_typhoon',   name: '태풍의 지배자',   rarity: 'mythic', charId: 'umbrella_master', filter: 'hue-rotate(225deg) saturate(1.75) brightness(1.12)', glow: '#ff52b8', trail: ['#ff52b8', '#5ef5ff', '#ffe859'] },
    { id: 'mythic_celestial', name: '천상의 기상술사', rarity: 'mythic', charId: 'iced_americano',  filter: 'hue-rotate(265deg) saturate(1.7) brightness(1.14)',  glow: '#c96bff', trail: ['#c96bff', '#ffe866', '#66f2ff'] }
  ];

  // 4종 상자 정의 (정확한 보상 확률 + 골드/다이아 지급 범위 + 천장 설정!)
  const CHESTS = {
    wood: {
      id: 'wood',
      name: '나무 상자',
      icon: 'assets/chests/chest_wood_0.png',
      accent: '#e09a42',
      glow: 'rgba(255, 198, 92, 0.55)',
      source: '일반 플레이 (400m+ 일일 최대 3회) · 출석 보상',
      shopGold: 300,
      shopGems: null,
      goldRange: [100, 250],
      gemRange: [1, 2],
      pityTarget: null,
      pityMinRarity: null,
      rates: { gold: 75, common: 18, rare: 5, epic: 1.5, legendary: 0, mythic: 0, diamond: 0.5 }
    },
    silver: {
      id: 'silver',
      name: '은 상자',
      icon: 'assets/chests/chest_silver_0.png',
      accent: '#82c8ff',
      glow: 'rgba(112, 206, 255, 0.6)',
      source: '연속 출석 · 업적 보상 · 상점',
      shopGold: 700,
      shopGems: null,
      goldRange: [250, 500],
      gemRange: [2, 4],
      pityTarget: null,
      pityMinRarity: null,
      rates: { gold: 65, common: 15, rare: 15, epic: 3, legendary: 0, mythic: 0, diamond: 2 }
    },
    gold: {
      id: 'gold',
      name: '황금 상자',
      icon: 'assets/chests/chest_gold_0.png',
      accent: '#ffd845',
      glow: 'rgba(255, 214, 62, 0.72)',
      source: '일일 퀘스트 완료 · 고득점 업적 · 상점',
      shopGold: 1500,
      shopGems: 15,
      goldRange: [500, 1000],
      gemRange: [5, 10],
      pityTarget: 10,
      pityMinRarity: 'epic',
      rates: { gold: 50, common: 0, rare: 25, epic: 17, legendary: 3, mythic: 0, diamond: 5 }
    },
    diamond: {
      id: 'diamond',
      name: '다이아 상자',
      icon: 'assets/chests/chest_diamond_0.png',
      accent: '#78e6ff',
      glow: 'rgba(148, 128, 255, 0.78)',
      source: '주간 퀘스트 완료 · 고난도 업적 · 7일 출석 · 상점',
      shopGold: null,
      shopGems: 35,
      goldRange: [1000, 2000],
      gemRange: [10, 20],
      pityTarget: 15,
      pityMinRarity: 'legendary',
      rates: { gold: 25, common: 0, rare: 10, epic: 30, legendary: 22, mythic: 3, diamond: 10 }
    }
  };
  const CHEST_ORDER = ['wood', 'silver', 'gold', 'diamond'];

  // 7일 연속 출석 보상 (나무 → 은 → 황금 → 7일차 다이아 상자!)
  const ATTENDANCE_REWARDS = [
    { day: 1, label: '나무 상자', chest: 'wood', gold: 0, gems: 0, booster: null },
    { day: 2, label: '은 상자', chest: 'silver', gold: 0, gems: 0, booster: null },
    { day: 3, label: '나무 상자 + 100G', chest: 'wood', gold: 100, gems: 0, booster: null },
    { day: 4, label: '황금 상자', chest: 'gold', gold: 0, gems: 0, booster: null },
    { day: 5, label: '은 상자 + 2💎', chest: 'silver', gold: 0, gems: 2, booster: null },
    { day: 6, label: '황금 상자 + 3💎', chest: 'gold', gold: 0, gems: 3, booster: null },
    { day: 7, label: '다이아 상자', chest: 'diamond', gold: 0, gems: 0, booster: null }
  ];

  // 업적 시스템 (10종 — 난이도별 은 / 황금 / 다이아 상자 지급!)
  const ACHIEVEMENTS = [
    { id: 'dist_500', icon: '🏃', title: '첫 걸음마', desc: '단일 주행 500m 도달', metric: 'bestDistanceM', target: 500, rewardChest: 'silver' },
    { id: 'dist_1500', icon: '🏙️', title: '도심 마라토너', desc: '단일 주행 1,500m 도달', metric: 'bestDistanceM', target: 1500, rewardChest: 'gold' },
    { id: 'dist_3000', icon: '🇰🇷', title: '대한민국 종주', desc: '단일 주행 3,000m 도달', metric: 'bestDistanceM', target: 3000, rewardChest: 'diamond' },
    { id: 'coins_200', icon: '🪙', title: '코인 수집가', desc: '누적 코인 80개 획득', metric: 'totalCoinsEver', target: 80, rewardChest: 'silver' },
    { id: 'coins_1000', icon: '💰', title: '황금 만능주의', desc: '누적 코인 300개 획득', metric: 'totalCoinsEver', target: 300, rewardChest: 'gold' },
    { id: 'year_2', icon: '🗓️', title: '사계절 정복자', desc: '2년 차 이상 생존 돌파', metric: 'bestYear', target: 2, rewardChest: 'gold' },
    { id: 'year_3', icon: '🔥', title: '기후 생존왕', desc: '3년 차 이상 생존 돌파', metric: 'bestYear', target: 3, rewardChest: 'diamond' },
    { id: 'dodge_10', icon: '⚡', title: '회피의 달인', desc: '장애물 10연속 회피 성공', metric: 'maxDodgeComboEver', target: 10, rewardChest: 'gold' },
    { id: 'chars_3', icon: '👥', title: '동료 수집가', desc: '캐릭터 3종 이상 해금', metric: 'unlockedCount', target: 3, rewardChest: 'gold' },
    { id: 'chars_6', icon: '👑', title: 'K-날씨 올컬렉터', desc: '캐릭터 5종 전체 수집 완료', metric: 'unlockedCount', target: 5, rewardChest: 'diamond' }
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

  // 1년이 지날수록 체감되는 확실한 연도별 난이도 상승 곡선!
  function getYearDifficulty(year) {
    const extra = Math.max(0, year - 1);
    return {
      year,
      speedMult: Math.min(2.35, 1 + extra * 0.17),
      spawnRateMult: Math.min(2.15, 1 + extra * 0.16),
      extraObsSpeedMult: Math.min(2.2, 1 + extra * 0.18),
      weatherPaceMult: Math.min(1.85, 1 + extra * 0.14),
      exposureGracePenalty: Math.min(1.15, extra * 0.25),
      heatRateMult: Math.min(1.9, 1 + extra * 0.15),
      doubleWaveChance: extra <= 0 ? 0 : Math.min(0.45, 0.14 + (extra - 1) * 0.09),
      dmgMult: 1 + extra * 0.15,
      scoreMult: 1 + extra * 0.25,
      goldBonus: Math.floor(extra / 2)
    };
  }

  function getSkinById(id) {
    if (!id) return null;
    return SKINS.find((s) => s.id === id) || null;
  }

  function getSkinsForChar(charId) {
    return SKINS.filter((s) => s.charId === charId);
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
    WEEKLY_MISSIONS,
    SKIN_RARITIES,
    SKINS,
    CHESTS,
    CHEST_ORDER,
    ATTENDANCE_REWARDS,
    ACHIEVEMENTS,
    STAGE_MILESTONES,
    WEATHER_EVENTS,
    SEASON_WEATHER_POOL,
    OBSTACLES_BY_SEASON,
    getYearDifficulty,
    getUpgradePrice,
    getCharLevelPrice,
    getCharEffectiveStats,
    getSkinById,
    getSkinsForChar
  };
})();
