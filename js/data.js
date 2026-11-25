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
      tip: '황사·미세먼지 경보 시 마스크 버튼을 눌러 착용하세요!',
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
      tip: '폭우엔 우산, 폭염엔 파라솔·나무 그늘, 침수엔 차 지붕을 밟으세요!',
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
      runFrames: 8,
      avatar: 'assets/chars/port_yellow.png?v=20261121hd16',
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
      tier: '자동 장비 · 입문',
      icon: '🤖',
      spriteKey: 'blue_idle_0',
      animSkin: 'blue',
      animFrames: 3,
      runFrames: 8,
      avatar: 'assets/chars/port_blue.png?v=20261121hd36',
      auraType: 'padding',
      price: 350,
      baseHp: 3,
      goldMult: 1.08,
      scoreMult: 1.12,
      autoGear: true,
      passiveName: '오토 기어 (자동 장비)',
      passiveDesc: '비가 오면 우산 자동 펼침, 태풍 경고 시 우산 자동 접힘! 수동 조작 실수를 방지합니다. (대신 체력 3칸)',
      desc: '조작이 복잡한 초보자·입문자용 오토 기어 러너! 우산 타이밍을 자동으로 맞춰줍니다.',
      tag: '우산 자동 펼침·접힘 · 체력 3칸',
      colors: { top: '#f4f8ff', outer: '#cfdcf0', pants: '#1a243b', shoes: '#4d82e0', hat: '#ffffff' }
    },
    {
      id: 'short_sleeve',
      name: '한복 소년',
      tier: '날씨 캔슬 · 전략',
      icon: '☀️',
      spriteKey: 'hanbok_idle_0',
      animSkin: 'hanbok',
      animFrames: 3,
      runFrames: 8,
      avatar: 'assets/chars/port_hanbok.png?v=20261121hd46',
      auraType: 'hanbok',
      price: 650,
      baseHp: 5,
      goldMult: 1.15,
      scoreMult: 1.25,
      clearSkyCancel: true,
      passiveName: '쾌청 캔슬 (날씨 지우개)',
      passiveDesc: '피버(FEVER) 발동 시 현재 진행 중인 악천후 기믹(황사·강풍 등)을 일시적으로 맑음으로 강제 전환!',
      desc: '피버 타이밍을 설계해 악천후를 단번에 지워버리는 전략형 러너!',
      tag: '피버 시 악천후 즉시 맑음 전환',
      colors: { top: '#ffffff', outer: '#7ab3f0', pants: '#3b5998', shoes: '#5ec9f2', hat: null }
    },
    {
      id: 'iced_americano',
      name: '스키어',
      tier: '3단 점프 · 숙련',
      icon: '❄️',
      spriteKey: 'skier_idle_0',
      animSkin: 'skier',
      animFrames: 4,
      runFrames: 8,
      avatar: 'assets/chars/port_skier.png?v=20261121hd67',
      auraType: 'skier',
      price: 950,
      baseHp: 5,
      goldMult: 1.12,
      scoreMult: 1.2,
      tripleJumpStomp: true,
      passiveName: '3단 점프 / 급강하',
      passiveDesc: '공중에서 1회 추가 점프(총 3단 점프), 또는 공중에서 슬라이드 입력 시 즉시 바닥으로 급강하(스톰프)!',
      desc: '정밀한 컨트롤을 선호하는 숙련자용 아크로바틱 러너!',
      tag: '공중 3단 점프 · 즉시 급강하 스톰프',
      colors: { top: '#2b70d4', outer: '#1d54a8', pants: '#232c3d', shoes: '#d9e3f0', hat: null }
    },
    {
      id: 'fashionista',
      name: '산타',
      tier: '니어미스 · 생존',
      icon: '🛡️',
      spriteKey: 'santa_idle_0',
      animSkin: 'santa',
      animFrames: 4,
      runFrames: 8,
      avatar: 'assets/chars/port_santa.png?v=20261121hd79',
      auraType: 'santa',
      price: 1350,
      baseHp: 5,
      goldMult: 1.35,
      scoreMult: 1.22,
      nearMissShield: true,
      passiveName: '아슬아슬 보호막',
      passiveDesc: '장애물을 연속 회피(니어미스 5회)할 때마다 게이지가 차고, 달성 시 1회용 보호막 자동 생성!',
      desc: '하이리스크·하이리턴 생존형! 연속 회피로 보호막을 끊임없이 생성합니다.',
      tag: '연속 회피 5회 시 보호막 자동 생성',
      colors: { top: '#d93232', outer: '#b82222', pants: '#2a2a33', shoes: '#362720', hat: null }
    }
  ];

  // 1회용 출발 부스터
  const BOOSTERS = [
    {
      id: 'shield',
      name: '기상 보호막',
      icon: 'assets/atlas/spr_shield.png?v=20261121hd44',
      price: 80,
      desc: '첫 장애물 충돌 1회 완벽 방어 + 방어 직후 잠시 무적 유지!'
    },
    {
      id: 'boost',
      name: 'FEVER! 쾌속 출발',
      icon: 'assets/design/orb_bolt.png?v=20261121hd44',
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

  // 스킨 등급 정의 (오직 4등급: 희귀 · 영웅 · 전설 · 신화! 마일리지 교환 가격 & 중복 골드 보상)
  const SKIN_RARITIES = {
    rare:      { id: 'rare',      name: '희귀', color: '#47c8ff', bg: '#18548a', dupGold: 300,  mileagePrice: 10 },
    epic:      { id: 'epic',      name: '영웅', color: '#d084ff', bg: '#5a238a', dupGold: 650,  mileagePrice: 30 },
    legendary: { id: 'legendary', name: '전설', color: '#ffca42', bg: '#8f5200', dupGold: 1200, mileagePrice: 50 },
    mythic:    { id: 'mythic',    name: '신화', color: '#ff5ea8', bg: '#8a144d', dupGold: 2500, mileagePrice: 200 }
  };
  const SKIN_RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare'];

  // 스킨 전용 뽑기 & 인게임 상자 드랍 설정
  const SKIN_GACHA = {
    gemCostPerPull: 200,
    mileagePerPull: 2,
    dupMileageBonus: 2,
    rates: { rare: 70, epic: 20, legendary: 8, mythic: 2 },
    runChestDropWeights: { wood: 56, silver: 27, gold: 13, diamond: 4 }
  };

  // 22종 수집형 스킨 (희귀 20종 · 신화 2종: 화이트 냥이 후드, 명계의 군주 하데스!)
  const SKINS = [
    // 희귀 (20)
    { id: 'mint_rain',        name: '민트 우비',       rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(92deg) saturate(1.15)', glow: '#5ef5c8', trail: ['#5ef5c8', '#ffffff'] },
    { id: 'coral_rain',       name: '코랄 우비',       rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(-28deg) saturate(1.25)', glow: '#ff8a6b', trail: ['#ff8a6b', '#ffe0b5'] },
    { id: 'teal_pad',         name: '청록 패딩',       rarity: 'rare', charId: 'long_padding',    filter: 'hue-rotate(-38deg) saturate(1.15)', glow: '#4ce0d2', trail: ['#4ce0d2', '#c8fff9'] },
    { id: 'jade_hanbok',      name: '비취 한복',       rarity: 'rare', charId: 'short_sleeve',    filter: 'hue-rotate(78deg) saturate(1.15)',  glow: '#78ebb4', trail: ['#78ebb4', '#e0fff0'] },
    { id: 'pine_santa',       name: '숲속 산타',       rarity: 'rare', charId: 'fashionista',     filter: 'hue-rotate(112deg) saturate(1.1)',  glow: '#5cd67d', trail: ['#5cd67d', '#ffe86b'] },
    { id: 'cherry_rain',      name: '벚꽃 우비',       rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(-68deg) saturate(1.3) brightness(1.06)', glow: '#ff8ec7', trail: ['#ff8ec7', '#ffe6f2'] },
    { id: 'crimson_pad',      name: '크림슨 패딩',     rarity: 'rare', charId: 'long_padding',    filter: 'hue-rotate(138deg) saturate(1.35)', glow: '#ff5e78', trail: ['#ff5e78', '#ffd1d9'] },
    { id: 'royal_hanbok',     name: '어사 한복',       rarity: 'rare', charId: 'short_sleeve',    filter: 'hue-rotate(-45deg) saturate(1.35) brightness(1.04)', glow: '#ffd659', trail: ['#ffd659', '#ff9944'] },
    { id: 'aurora_skier',     name: '오로라 스키어',   rarity: 'rare', charId: 'iced_americano',  filter: 'hue-rotate(64deg) saturate(1.35)',  glow: '#6bffd8', trail: ['#6bffd8', '#78aaff'] },
    { id: 'gold_santa',       name: '황금 산타',       rarity: 'rare', charId: 'fashionista',     filter: 'hue-rotate(42deg) saturate(1.45) brightness(1.08)', glow: '#ffdf4d', trail: ['#ffdf4d', '#ffffff'] },
    { id: 'thunder_rain',     name: '뇌우 폭풍 우비',  rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(175deg) saturate(1.4) contrast(1.06)', glow: '#78c4ff', trail: ['#78c4ff', '#ffe959'] },
    { id: 'glacier_pad',      name: '빙하 수호대원',   rarity: 'rare', charId: 'long_padding',    filter: 'hue-rotate(-18deg) saturate(1.3) brightness(1.14)', glow: '#8cf4ff', trail: ['#8cf4ff', '#ffffff'] },
    { id: 'eclipse_hanbok',   name: '월식 선비',       rarity: 'rare', charId: 'short_sleeve',    filter: 'hue-rotate(195deg) saturate(1.45)', glow: '#c87aff', trail: ['#c87aff', '#75d8ff'] },
    { id: 'cyber_skier',      name: '사이버 스키어',   rarity: 'rare', charId: 'iced_americano',  filter: 'hue-rotate(115deg) saturate(1.55) contrast(1.06)', glow: '#ff6be6', trail: ['#ff6be6', '#5ef2ff'] },
    { id: 'solar_rain',       name: '태양신 우비',     rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(-14deg) saturate(1.55) brightness(1.12)', glow: '#ffbb29', trail: ['#fff078', '#ff7b29'] },
    { id: 'phoenix_pad',      name: '불사조 패딩',     rarity: 'rare', charId: 'long_padding',    filter: 'hue-rotate(162deg) saturate(1.65) brightness(1.1)', glow: '#ff6b2b', trail: ['#ff6b2b', '#ffe852'] },
    { id: 'dragon_hanbok',    name: '청룡 도령',       rarity: 'rare', charId: 'short_sleeve',    filter: 'hue-rotate(148deg) saturate(1.5) brightness(1.1)', glow: '#38e8ff', trail: ['#38e8ff', '#ffe259'] },
    { id: 'frost_santa',      name: '겨울왕국 산타',   rarity: 'rare', charId: 'fashionista',     filter: 'hue-rotate(198deg) saturate(1.45) brightness(1.12)', glow: '#75e6ff', trail: ['#75e6ff', '#ffffff'] },
    { id: 'mythic_typhoon',   name: '태풍의 지배자',   rarity: 'rare', charId: 'umbrella_master', filter: 'hue-rotate(225deg) saturate(1.75) brightness(1.12)', glow: '#ff52b8', trail: ['#ff52b8', '#5ef5ff', '#ffe859'] },
    { id: 'mythic_celestial', name: '천상의 기상술사', rarity: 'rare', charId: 'iced_americano',  filter: 'hue-rotate(265deg) saturate(1.7) brightness(1.14)',  glow: '#c96bff', trail: ['#c96bff', '#ffe866', '#66f2ff'] },
    // 신화 스페셜 스킨 (스킨 뽑기 · 마일리지 200 교환!)
    {
      id: 'catgirl_hoodie',
      name: '화이트 냥이 후드',
      rarity: 'mythic',
      charId: 'umbrella_master',
      filter: 'none',
      customAnimSkin: 'catgirl',
      customAnimFrames: 4,
      customRunFrames: 8,
      customAvatar: 'assets/chars/port_catgirl.png?v=20261121hd32',
      customShieldVfx: 'catgirl_fx_paw',
      glow: '#ff96dc',
      trail: ['#ff96dc', '#ffffff', '#ffc4ee'],
      desc: '8프레임 전용 풀애니메이션(달리기·점프·슬라이드) & 핑크 냥이 발바닥 오라!'
    },
    {
      id: 'hades_mythic',
      name: '명계의 군주 하데스',
      rarity: 'mythic',
      charId: 'umbrella_master',
      filter: 'none',
      customAnimSkin: 'hades',
      customAnimFrames: 3,
      customRunFrames: 4,
      customAvatar: 'assets/chars/port_hades.png?v=20261121hd49',
      customUmbrella: 'hades_umbrella',
      customMask: 'hades_mask',
      customShieldPrefix: 'hades_shield',
      customShieldFrames: 6,
      customBoosterPrefix: 'hades_booster',
      customBoosterFrames: 12,
      customAuraPrefix: 'hades_aura',
      customAuraFrames: 6,
      glow: '#a84cff',
      trail: ['#a84cff', '#d28eff', '#6f2dff'],
      desc: '뒤에서 은은하게 빛나는 명계 오라 · 전용 보라 우산 & 마스크 · 6프레임 보호막 · 12프레임 불꽃 부스터!'
    },
    // 신화 시즌패스 전용 스킨 (시즌 1 골드 패스 80티어 최종 보상 · 산타복 전용!)
    {
      id: 'ice_emperor_mythic',
      name: '얼음황제',
      rarity: 'mythic',
      charId: 'fashionista',
      seasonExclusive: true,
      passSeasonId: 's1',
      filter: 'none',
      customAnimSkin: 'ice_emperor',
      customAnimFrames: 4,
      customRunFrames: 8,
      customAvatar: 'assets/chars/port_ice_emperor.png?v=20261121hd83',
      customUmbrella: 'ice_emperor_umbrella',
      customMask: 'ice_emperor_mask',
      customShieldVfx: 'ice_emperor_shield',
      customBoosterPrefix: 'ice_emperor_booster',
      customBoosterFrames: 4,
      customAuraPrefix: 'ice_emperor_aura',
      customAuraFrames: 6,
      glow: '#62d4ff',
      trail: ['#8ef2ff', '#7a6bff', '#ffffff'],
      desc: '시즌 1 골드 패스 80티어 최종 보상 신화 스킨! 시즌 기간에는 골드 패스로만 획득 · 시즌 종료 후 스킨 뽑기에 출시 · 전용 눈꽃 우산 & 마스크 · 빙결 구체 보호막 · 혜성 부스터!'
    }
  ];

  // 4종 상자 정의 (나무·은: 골드 구매 | 황금 40💎 · 다이아 100💎 | 뽑기권 교환 비율 포함!)
  const CHESTS = {
    wood: {
      id: 'wood',
      name: '나무 상자',
      icon: 'assets/chests/chest_wood_0.png',
      accent: '#e09a42',
      glow: 'rgba(255, 198, 92, 0.55)',
      source: '달리기 중 획득 · 400m+ 일일 최대 3회 · 출석 · 상점',
      shopGold: 300,
      shopGems: null,
      ticketCost: 15,
      goldRange: [100, 250],
      gemRange: [1, 2],
      pityTarget: null,
      pityMinRarity: null,
      rates: { gold: 75, rare: 23, epic: 1.5, legendary: 0, mythic: 0, diamond: 0.5 }
    },
    silver: {
      id: 'silver',
      name: '은 상자',
      icon: 'assets/chests/chest_silver_0.png',
      accent: '#82c8ff',
      glow: 'rgba(112, 206, 255, 0.6)',
      source: '달리기 중 획득 · 연속 출석 · 업적 · 상점',
      shopGold: 700,
      shopGems: null,
      ticketCost: 10,
      goldRange: [250, 500],
      gemRange: [2, 4],
      pityTarget: null,
      pityMinRarity: null,
      rates: { gold: 65, rare: 30, epic: 3, legendary: 0, mythic: 0, diamond: 2 }
    },
    gold: {
      id: 'gold',
      name: '황금 상자',
      icon: 'assets/chests/chest_gold_0.png',
      accent: '#ffd845',
      glow: 'rgba(255, 214, 62, 0.72)',
      source: '달리기 중 획득 · 일일 퀘스트 · 업적 · 보석 상점(40💎)',
      shopGold: null,
      shopGems: 40,
      ticketCost: 5,
      goldRange: [500, 1000],
      gemRange: [5, 10],
      pityTarget: 10,
      pityMinRarity: 'epic',
      rates: { gold: 50, rare: 25, epic: 17, legendary: 3, mythic: 0, diamond: 5 }
    },
    diamond: {
      id: 'diamond',
      name: '다이아 상자',
      icon: 'assets/chests/chest_diamond_0.png',
      accent: '#78e6ff',
      glow: 'rgba(148, 128, 255, 0.78)',
      source: '달리기 중 희귀 등장 · 주간 퀘스트 · 7일 출석 · 보석 상점(100💎)',
      shopGold: null,
      shopGems: 100,
      ticketCost: 2,
      goldRange: [1000, 2000],
      gemRange: [10, 20],
      pityTarget: 15,
      pityMinRarity: 'legendary',
      rates: { gold: 25, rare: 10, epic: 30, legendary: 25, mythic: 0, diamond: 10 }
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
      id: 'clear', icon: '☀️', label: '맑음',
      actionTip: '쾌청한 구간', color: '#63d8ff'
    },
    dust: {
      id: 'dust', icon: '🌫️', label: '황사 · 미세먼지',
      actionTip: '마스크 착용 필수!', color: '#e6c24c'
    },
    gust: {
      id: 'gust', icon: '💨', label: '태풍 · 강풍 돌풍',
      actionTip: '우산 접기 · 슬라이드!', color: '#a6e4ff'
    },
    rain: {
      id: 'rain', icon: '🌧️', label: '국지성 폭우',
      actionTip: '우산 펴기 · 물벼락 주의!', color: '#5cb3ff'
    },
    flood: {
      id: 'flood', icon: '🌊', label: '장마 도로 침수',
      actionTip: '우산 펴기 · 차 지붕 밟기!', color: '#3b82d6'
    },
    heat: {
      id: 'heat', icon: '☀️', label: '폭염 땡볕 경보',
      actionTip: '우산(양산) 펴기!', color: '#ff8a3d'
    },
    ice_road: {
      id: 'ice_road', icon: '🧊', label: '겨울 빙판길',
      actionTip: '미끄럼 · 슬라이드 가속 주의!', color: '#8ee8ff'
    },
    covid: {
      id: 'covid', icon: '🦠', label: '코로나 바이러스 경보',
      actionTip: '돌진 타이밍에 맞춰 마스크 착용!', color: '#ff3b5c'
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

  // 시간이 지날수록(매초 · 매 계절 · 매 연차) 확실하게 빨라지고 콤보가 매서워지는 연속 난이도 곡선!
  function getYearDifficulty(year, elapsedSec = null) {
    const baseExtra = Math.max(0, (year || 1) - 1);
    const effYears = (typeof elapsedSec === 'number' && Number.isFinite(elapsedSec))
      ? Math.max(0, elapsedSec / YEAR_DURATION)
      : baseExtra;
    return {
      year,
      effYears,
      speedMult: Math.min(2.85, 1 + effYears * 0.56),
      spawnRateMult: Math.min(2.75, 1 + effYears * 0.78),
      extraObsSpeedMult: Math.min(2.65, 1 + effYears * 0.58),
      weatherPaceMult: Math.min(2.2, 1 + effYears * 0.38),
      exposureGracePenalty: Math.min(1.35, effYears * 0.38),
      heatRateMult: Math.min(2.3, 1 + effYears * 0.42),
      doubleWaveChance: effYears < 0.22 ? 0 : Math.min(0.78, 0.18 + (effYears - 0.22) * 0.55),
      tripleWaveChance: effYears < 0.72 ? 0 : Math.min(0.42, 0.14 + (effYears - 0.72) * 0.22),
      dmgMult: 1 + effYears * 0.2,
      scoreMult: 1 + effYears * 0.35,
      goldBonus: Math.floor(effYears * 0.6)
    };
  }

  function getSkinById(id) {
    if (!id) return null;
    return SKINS.find((s) => s.id === id) || null;
  }

  function getSkinsForChar(charId) {
    return SKINS.filter((s) => s.charId === charId);
  }

  function getCharLevelPrice(currentLv) {
    return 140 + Math.max(0, currentLv - 1) * 130;
  }

  function getCharEffectiveStats(charDef, _charLv = 1, unlockedCount = 1) {
    const dexScoreBonus = Math.max(0, unlockedCount - 1) * 0.03; // 도감 수집 보너스: 추가 해금당 점수 +3%!
    return {
      level: 1,
      maxHp: charDef.baseHp || 5,
      goldMult: Number((charDef.goldMult || 1).toFixed(2)),
      scoreMult: Number(((charDef.scoreMult || 1) + dexScoreBonus).toFixed(2)),
      dexScorePct: Math.round(dexScoreBonus * 100)
    };
  }

  const WEEKLY_TOP1_GEMS = 5000;
  const WEEKLY_TOP_REWARDS = {
    1: { rank: 1, gems: 5000, frameId: 'rank_1', frameName: '1위 닉네임 장식' },
    2: { rank: 2, gems: 3000, frameId: 'rank_2', frameName: '2위 닉네임 장식' },
    3: { rank: 3, gems: 1000, frameId: 'rank_3', frameName: '3위 닉네임 장식' }
  };
  const PROFILE_NAME_COLORS = [
    { id: '#ffffff', name: '스노우 화이트', color: '#ffffff' },
    { id: '#ffe24a', name: '챔피언 골드', color: '#ffe24a' },
    { id: '#62e8ff', name: '아이스 스카이', color: '#62e8ff' },
    { id: '#62f5a0', name: '에메랄드 민트', color: '#62f5a0' },
    { id: '#ff82cc', name: '체리 핑크', color: '#ff82cc' },
    { id: '#c992ff', name: '네온 퍼플', color: '#c992ff' },
    { id: '#ff7466', name: '선셋 코랄', color: '#ff7466' },
    { id: 'rainbow', name: '무지개 프리즘', color: 'rainbow', requiresGoldPass: true }
  ];
  const PROFILE_NAME_FRAMES = [
    { id: 'none', name: '기본 네임바', img: '', desc: '깔끔한 기본 프로필 닉네임 바' },
    { id: 'rank_1', name: '1위 닉네임 장식', img: 'assets/ui/rank_frame_1.png', desc: '주간 랭킹 1위 보상 · 30일 기간제 (황금 월계관)' },
    { id: 'rank_2', name: '2위 닉네임 장식', img: 'assets/ui/rank_frame_2.png', desc: '주간 랭킹 2위 보상 · 30일 기간제 (겨울 눈꽃)' },
    { id: 'rank_3', name: '3위 닉네임 장식', img: 'assets/ui/rank_frame_3.png', desc: '주간 랭킹 3위 보상 · 30일 기간제 (가을 단풍)' }
  ];
  const SCORE_ROAD_STEP = 1000;

  // 브롤스타즈 트로피 로드 스타일: 1,000점 간격 최고점수 달성 보상 (무한 확장!)
  function getScoreRoadMilestone(scoreVal) {
    const score = Math.max(SCORE_ROAD_STEP, Math.round(scoreVal / SCORE_ROAD_STEP) * SCORE_ROAD_STEP);
    const step = Math.floor(score / SCORE_ROAD_STEP);

    if (step % 20 === 0) {
      return { score, kind: 'chest', chest: 'diamond', amount: 1, label: '다이아 상자 ×1', tier: 'mythic', tag: '대보상' };
    }
    if (step % 10 === 0) {
      return { score, kind: 'chest', chest: 'gold', amount: 1, label: '황금 상자 ×1', tier: 'gold', tag: '특급' };
    }
    if (step === 5) {
      return { score, kind: 'chest', chest: 'silver', amount: 1, label: '실버 상자 ×1', tier: 'silver', tag: '마일스톤' };
    }
    if (step % 5 === 0) {
      return { score, kind: 'chest', chest: 'gold', amount: 1, label: '황금 상자 ×1', tier: 'gold', tag: '마일스톤' };
    }

    const cycle = step % 4;
    if (cycle === 1) {
      const goldAmt = 150 + Math.min(850, Math.floor((step - 1) / 2) * 50);
      return { score, kind: 'gold', amount: goldAmt, label: `${goldAmt.toLocaleString('ko-KR')} G`, tier: 'coin', tag: '골드' };
    }
    if (cycle === 2) {
      if (step <= 4) {
        return { score, kind: 'chest', chest: 'wood', amount: 1, label: '나무 상자 ×1', tier: 'wood', tag: '상자' };
      }
      return { score, kind: 'chest', chest: 'silver', amount: 1, label: '실버 상자 ×1', tier: 'silver', tag: '상자' };
    }
    if (cycle === 3) {
      const gemAmt = 10 + Math.min(40, Math.floor(step / 4) * 5);
      return { score, kind: 'gems', amount: gemAmt, label: `보석 ${gemAmt}개`, tier: 'gem', tag: '보석' };
    }
    // cycle === 0 (4000, 8000, 12000, 16000...)
    if (step === 4) {
      return { score, kind: 'gold', amount: 250, label: '250 G', tier: 'coin', tag: '골드' };
    }
    if (step === 8) {
      return { score, kind: 'chest', chest: 'silver', amount: 1, label: '실버 상자 ×1', tier: 'silver', tag: '상자' };
    }
    return { score, kind: 'chest', chest: 'gold', amount: 1, label: '황금 상자 ×1', tier: 'gold', tag: '상자' };
  }

  // 보석으로 구매하는 골드 패키지 (브롤스타즈 상점 스타일!)
  const GOLD_PACKS = [
    { id: 'gold_pack_1', name: '골드 주머니', gold: 500,   gemCost: 10,  bonusTag: '',          accent: '#ffe047', tier: 'sm' },
    { id: 'gold_pack_2', name: '골드 가방',   gold: 1650,  gemCost: 30,  bonusTag: '+10% 보너스', accent: '#ffcb2b', tier: 'md' },
    { id: 'gold_pack_3', name: '골드 상자',   gold: 4800,  gemCost: 80,  bonusTag: '+20% 인기!',  accent: '#ffae19', tier: 'lg' },
    { id: 'gold_pack_4', name: '골드 금고',   gold: 13000, gemCost: 200, bonusTag: '+30% BEST!',  accent: '#ff8a1f', tier: 'xl' }
  ];

  // 실제 결제 보석 패키지 (100개 = ₩1,000 고정 단가!)
  const GEM_PACKS = [
    { id: 'gem_pack_100',  productId: 'com.gunhe7.kweathersurvival.gems100',  name: '보석 100개',   gems: 100,  krwPrice: 1000,  badge: '스타터',      accent: '#39e38a', tier: 'sm' },
    { id: 'gem_pack_300',  productId: 'com.gunhe7.kweathersurvival.gems300',  name: '보석 300개',   gems: 300,  krwPrice: 3000,  badge: '인기!',       accent: '#2fd8ff', tier: 'md' },
    { id: 'gem_pack_500',  productId: 'com.gunhe7.kweathersurvival.gems500',  name: '보석 500개',   gems: 500,  krwPrice: 5000,  badge: '추천!',       accent: '#a96dff', tier: 'lg' },
    { id: 'gem_pack_1000', productId: 'com.gunhe7.kweathersurvival.gems1000', name: '보석 1,000개', gems: 1000, krwPrice: 10000, badge: '스킨 뽑기 팩', accent: '#ff5ea8', tier: 'xl' }
  ];

  // 브롤스타즈 스타일 시즌 1 패스 (80티어 · 무료 보상: 보석/상자/뽑기권/골드 · 골드패스 ₩9,900 최종 보상: 신화 스킨 얼음황제!)
  const SEASON_PASS = (() => {
    const tiers = [];
    for (let t = 1; t <= 80; t++) {
      let free;
      if (t === 80) {
        free = { kind: 'chest', chest: 'diamond', amount: 3, label: '다이아 상자 ×3' };
      } else if (t === 40 || t === 60) {
        free = { kind: 'chest', chest: 'diamond', amount: 1, label: '다이아 상자 ×1' };
      } else if (t % 10 === 0) {
        free = { kind: 'ticket', amount: 2, label: '뽑기권 ×2' };
      } else if (t % 5 === 0) {
        free = { kind: 'chest', chest: 'gold', amount: 1, label: '황금 상자 ×1' };
      } else if (t % 3 === 0) {
        const g = 10 + Math.floor(t / 6) * 5;
        free = { kind: 'gems', amount: g, label: `보석 ${g}개` };
      } else if (t % 2 === 0) {
        const chestTier = t >= 26 ? 'silver' : 'wood';
        free = { kind: 'chest', chest: chestTier, amount: 1, label: chestTier === 'silver' ? '실버 상자 ×1' : '나무 상자 ×1' };
      } else {
        const coins = 200 + Math.floor(t / 2) * 35;
        free = { kind: 'gold', amount: coins, label: `${coins.toLocaleString('ko-KR')} G` };
      }

      let gold;
      if (t === 80) {
        gold = { kind: 'skin', skinId: 'ice_emperor_mythic', amount: 1, label: '신화 스킨\n얼음황제' };
      } else if (t === 70) {
        gold = { kind: 'chest', chest: 'diamond', amount: 2, label: '다이아 상자 ×2' };
      } else if (t === 15 || t === 30 || t === 45 || t === 60) {
        gold = { kind: 'chest', chest: 'diamond', amount: 1, label: '다이아 상자 ×1' };
      } else if (t % 20 === 0 || t % 10 === 0) {
        const tk = t >= 40 ? 5 : 3;
        gold = { kind: 'ticket', amount: tk, label: `뽑기권 ×${tk}` };
      } else if (t % 4 === 0) {
        const g = 35 + Math.floor(t / 8) * 10;
        gold = { kind: 'gems', amount: g, label: `보석 ${g}개` };
      } else if (t % 3 === 0) {
        gold = { kind: 'chest', chest: 'gold', amount: 1, label: '황금 상자 ×1' };
      } else if (t % 2 === 0) {
        const tk = t >= 50 ? 2 : 1;
        gold = { kind: 'ticket', amount: tk, label: `뽑기권 ×${tk}` };
      } else {
        const coins = 600 + Math.floor(t / 2) * 90;
        gold = { kind: 'gold', amount: coins, label: `${coins.toLocaleString('ko-KR')} G` };
      }

      tiers.push({ tier: t, free, gold });
    }
    return {
      seasonId: 's1',
      title: '시즌 1 : 얼음황제 패스',
      xpPerTier: 100,
      maxTier: 80,
      bonusXpStep: 500,
      bonusReward: { kind: 'chest', chest: 'diamond', amount: 1, label: '다이아 상자 ×1' },
      startsAt: Date.UTC(2026, 10, 20, 15, 0, 0),
      endsAt: Date.UTC(2027, 0, 31, 15, 0, 0),
      skipGemCost: 100,
      goldPriceKrw: 9900,
      productId: 'com.gunhe7.kweathersurvival.goldpass_s1',
      finalSkinId: 'ice_emperor_mythic',
      tiers
    };
  })();

  // 시즌 패스 전용 일일 미션 (매일 초기화 · 완료 시 패스 경험치 +100~150 XP! 플레이 자체 경험치는 없음)
  const PASS_DAILY_MISSIONS = [
    { id: 'pm_runs_2', metric: 'runs', title: '생존 도전 2회 플레이', iconKey: 'm_play', target: 2, unit: '회', xp: 100 },
    { id: 'pm_dist_600', metric: 'dist', title: '누적 600m 달리기', iconKey: 'm_dist', target: 600, unit: 'm', xp: 100 },
    { id: 'pm_coins_60', metric: 'coins', title: '코인 60개 모으기', iconKey: 'coin', target: 60, unit: '개', xp: 100 },
    { id: 'pm_jumps_30', metric: 'jumps', title: '점프 30회 성공', iconKey: 'm_jump', target: 30, unit: '회', xp: 100 },
    { id: 'pm_dodges_15', metric: 'dodges', title: '장애물 15회 회피', iconKey: 'm_dodge', target: 15, unit: '회', xp: 150 }
  ];

  function isPassSkinReleased(sk, nowMs = Date.now()) {
    if (!sk || !sk.seasonExclusive) return true;
    if (!sk.passSeasonId || sk.passSeasonId !== SEASON_PASS.seasonId) return true; // older season skin -> already released
    return nowMs >= (SEASON_PASS.endsAt || Infinity);
  }

  return {
    SEASON_DURATION,
    YEAR_DURATION,
    MAX_CHAR_LEVEL,
    WEEKLY_TOP1_GEMS,
    WEEKLY_TOP_REWARDS,
    PROFILE_NAME_COLORS,
    PROFILE_NAME_FRAMES,
    SCORE_ROAD_STEP,
    getScoreRoadMilestone,
    GOLD_PACKS,
    GEM_PACKS,
    SEASON_PASS,
    PASS_DAILY_MISSIONS,
    isPassSkinReleased,
    SEASONS,
    CHARACTERS,
    BOOSTERS,
    DAILY_MISSIONS,
    WEEKLY_MISSIONS,
    SKIN_RARITIES,
    SKIN_RARITY_ORDER,
    SKIN_GACHA,
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
    getCharLevelPrice,
    getCharEffectiveStats,
    getSkinById,
    getSkinsForChar
  };
})();
