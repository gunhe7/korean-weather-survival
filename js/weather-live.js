window.LiveWeather = (function () {
  const CACHE_KEY = 'kweather_live_kma_v1';
  const CITY_KEY = 'kweather_live_city_v1';
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

  const CITIES = [
    { id: 'seoul',   name: '서울', region: '수도권', lat: 37.5665, lon: 126.9780 },
    { id: 'incheon', name: '인천', region: '수도권', lat: 37.4563, lon: 126.7052 },
    { id: 'busan',   name: '부산', region: '영남권', lat: 35.1796, lon: 129.0756 },
    { id: 'daegu',   name: '대구', region: '영남권', lat: 35.8714, lon: 128.6014 },
    { id: 'daejeon', name: '대전', region: '충청권', lat: 36.3504, lon: 127.3845 },
    { id: 'gwangju', name: '광주', region: '호남권', lat: 35.1595, lon: 126.8526 },
    { id: 'jeju',    name: '제주', region: '제주권', lat: 33.4996, lon: 126.5312 }
  ];

  const SEASON_META = {
    spring: { id: 'spring', idx: 0, name: '봄',   icon: '🌸', bonusLabel: '봄 계절 버프', bonusEffect: '피버 충전 +10%' },
    summer: { id: 'summer', idx: 1, name: '여름', icon: '☀️', bonusLabel: '여름 계절 버프', bonusEffect: '골드 획득 +10%' },
    autumn: { id: 'autumn', idx: 2, name: '가을', icon: '🍁', bonusLabel: '가을 계절 버프', bonusEffect: '점수 획득 +10%' },
    winter: { id: 'winter', idx: 3, name: '겨울', icon: '❄️', bonusLabel: '겨울 계절 버프', bonusEffect: '자석 범위 +30' }
  };

  function getCityById(cityId) {
    return CITIES.find((c) => c.id === cityId) || CITIES[0];
  }

  function getSelectedCityId() {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (saved && CITIES.some((c) => c.id === saved)) return saved;
    } catch {}
    return 'seoul';
  }

  function setSelectedCityId(cityId) {
    const city = getCityById(cityId);
    try { localStorage.setItem(CITY_KEY, city.id); } catch {}
    return city;
  }

  function getCurrentKstSeasonInfo(nowMs = Date.now()) {
    const kst = new Date(nowMs + KST_OFFSET_MS);
    const month = kst.getUTCMonth() + 1;
    let id = 'spring';
    if (month >= 3 && month <= 5) id = 'spring';
    else if (month >= 6 && month <= 8) id = 'summer';
    else if (month >= 9 && month <= 11) id = 'autumn';
    else id = 'winter';
    return { ...SEASON_META[id], month };
  }

  function getCurrentKstSeasonId(nowMs = Date.now()) {
    return getCurrentKstSeasonInfo(nowMs).id;
  }

  function getWeatherDesc(code, precipMm = 0, snowCm = 0) {
    const c = Number(code);
    if (snowCm >= 1.5 || c === 75 || c === 86) return { label: '폭설', icon: '❄️' };
    if (snowCm >= 0.2 || c === 71 || c === 73 || c === 77 || c === 85) return { label: '눈', icon: '🌨️' };
    if (c === 95 || c === 96 || c === 99) return { label: '뇌우·폭우', icon: '⛈️' };
    if (precipMm >= 5 || c === 65 || c === 82) return { label: '폭우', icon: '⛈️' };
    if (precipMm >= 0.2 || (c >= 61 && c <= 67) || c === 80 || c === 81) return { label: '비', icon: '🌧️' };
    if (c >= 51 && c <= 57) return { label: '이슬비', icon: '🌦️' };
    if (c === 45 || c === 48) return { label: '안개', icon: '🌫️' };
    if (c === 3) return { label: '흐림', icon: '☁️' };
    if (c === 1 || c === 2) return { label: '구름 조금', icon: '⛅' };
    return { label: '맑음', icon: '☀️' };
  }

  function getAirGrade(pm10, pm25) {
    if (pm10 >= 151 || pm25 >= 76) return { grade: '매우나쁨', level: 3, icon: '😷' };
    if (pm10 >= 81 || pm25 >= 36) return { grade: '나쁨', level: 2, icon: '😷' };
    if (pm10 <= 30 && pm25 <= 15) return { grade: '좋음', level: 0, icon: '🍃' };
    return { grade: '보통', level: 1, icon: '🙂' };
  }

  function readAllCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeCityCache(cityId, snapshot) {
    try {
      const all = readAllCache();
      all[cityId] = snapshot;
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch {}
  }

  function getCachedWeather(cityId = null) {
    const cid = getCityById(cityId || getSelectedCityId()).id;
    const snap = readAllCache()[cid] || null;
    if (!snap || typeof snap !== 'object') return null;
    return snap;
  }

  function buildFallbackSnapshot(cityId) {
    const city = getCityById(cityId);
    const season = getCurrentKstSeasonInfo();
    const defaultsBySeason = {
      spring: { tempC: 15, feelsLikeC: 14, humidity: 52, precipMm: 0, snowCm: 0, weatherCode: 1, cloudCover: 28, windMs: 3.1, gustMs: 5.2, pm10: 42, pm25: 20 },
      summer: { tempC: 29, feelsLikeC: 31, humidity: 72, precipMm: 0.4, snowCm: 0, weatherCode: 80, cloudCover: 64, windMs: 3.4, gustMs: 6.1, pm10: 26, pm25: 13 },
      autumn: { tempC: 16, feelsLikeC: 15, humidity: 54, precipMm: 0, snowCm: 0, weatherCode: 0, cloudCover: 20, windMs: 3.6, gustMs: 5.8, pm10: 28, pm25: 14 },
      winter: { tempC: 1,  feelsLikeC: -2, humidity: 48, precipMm: 0, snowCm: 0, weatherCode: 2, cloudCover: 35, windMs: 4.2, gustMs: 7.0, pm10: 34, pm25: 18 }
    };
    const d = defaultsBySeason[season.id] || defaultsBySeason.spring;
    return {
      cityId: city.id,
      cityName: city.name,
      region: city.region,
      ...d,
      seasonId: season.id,
      source: 'fallback',
      sourceLabel: '기상청 오프라인 추정',
      fetchedAt: Date.now()
    };
  }

  async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs) : null;
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let inflightMap = {};

  async function fetchLiveWeather(cityId = null, forceRefresh = false) {
    const city = getCityById(cityId || getSelectedCityId());
    const cached = getCachedWeather(city.id);
    if (!forceRefresh && cached && cached.source === 'kma_live' && (Date.now() - (cached.fetchedAt || 0)) < CACHE_TTL_MS) {
      return cached;
    }
    if (inflightMap[city.id] && !forceRefresh) {
      return inflightMap[city.id];
    }

    const req = (async () => {
      const currentFields = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m';
      const kmaUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=${currentFields}&models=kma_seamless&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=1`;
      const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=${currentFields}&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=1`;
      const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;

      const [kmaData, airData] = await Promise.all([
        fetchJsonWithTimeout(kmaUrl, 8000),
        fetchJsonWithTimeout(airUrl, 7000)
      ]);

      let weatherData = kmaData;
      let usedModel = 'kma_live';
      if (!weatherData || !weatherData.current || weatherData.current.temperature_2m == null) {
        weatherData = await fetchJsonWithTimeout(fallbackUrl, 7000);
        usedModel = (weatherData && weatherData.current && weatherData.current.temperature_2m != null) ? 'kma_live' : 'fallback';
      }

      if (!weatherData || !weatherData.current || weatherData.current.temperature_2m == null) {
        return cached || buildFallbackSnapshot(city.id);
      }

      const cur = weatherData.current;
      const airCur = (airData && airData.current) ? airData.current : {};
      const season = getCurrentKstSeasonInfo();

      const num = (v, fb = 0) => (typeof v === 'number' && Number.isFinite(v)) ? v : fb;
      const precipRaw = Math.max(
        num(cur.precipitation, 0),
        num(cur.rain, 0) + num(cur.showers, 0)
      );

      const snapshot = {
        cityId: city.id,
        cityName: city.name,
        region: city.region,
        tempC: Math.round(num(cur.temperature_2m, 15) * 10) / 10,
        feelsLikeC: Math.round(num(cur.apparent_temperature, num(cur.temperature_2m, 15)) * 10) / 10,
        humidity: Math.round(num(cur.relative_humidity_2m, 50)),
        precipMm: Math.round(precipRaw * 10) / 10,
        snowCm: Math.round(num(cur.snowfall, 0) * 10) / 10,
        weatherCode: Math.round(num(cur.weather_code, 0)),
        cloudCover: Math.round(num(cur.cloud_cover, 0)),
        windMs: Math.round(num(cur.wind_speed_10m, 2) * 10) / 10,
        gustMs: Math.round(num(cur.wind_gusts_10m, num(cur.wind_speed_10m, 2)) * 10) / 10,
        pm10: Math.round(num(airCur.pm10, 32)),
        pm25: Math.round(num(airCur.pm2_5, 16)),
        seasonId: season.id,
        observedAt: cur.time || '',
        source: usedModel,
        sourceLabel: '기상청(KMA) 실시간 연동',
        fetchedAt: Date.now()
      };

      writeCityCache(city.id, snapshot);
      return snapshot;
    })();

    inflightMap[city.id] = req;
    try {
      return await req;
    } finally {
      if (inflightMap[city.id] === req) delete inflightMap[city.id];
    }
  }

  function computeWeatherModifiers(rawSnapshot = null) {
    const snap = rawSnapshot || getCachedWeather() || buildFallbackSnapshot(getSelectedCityId());
    const season = getCurrentKstSeasonInfo();
    const desc = getWeatherDesc(snap.weatherCode, snap.precipMm, snap.snowCm);
    const airGrade = getAirGrade(snap.pm10, snap.pm25);

    let scoreMult = 1.0;
    let goldMult = 1.0;
    let feverGainMult = 1.0;
    let speedMult = 1.0;
    let jumpMult = 1.0;
    let extraHp = 0;
    let magnetBonus = 0;

    let rainActive = false;
    let floodActive = false;
    let dustActive = false;
    let heatActive = false;
    let gustActive = false;
    let iceActive = false;
    let snowActive = false;

    const factors = [];

    // 1. 기온 (Temperature)
    const t = Number(snap.tempC) || 0;
    if (t >= 30) {
      heatActive = true;
      scoreMult *= 1.25;
      factors.push({
        id: 'temp',
        icon: '🔥',
        label: '기온 · 폭염',
        valueText: `${t.toFixed(1)}°C (체감 ${Number(snap.feelsLikeC || t).toFixed(0)}°C)`,
        kind: 'debuff',
        badge: '디버프 · 고보상',
        effectText: '폭염 열기 지속 · 점수 +25%'
      });
    } else if (t <= 0) {
      iceActive = true;
      speedMult *= 1.07;
      scoreMult *= 1.20;
      factors.push({
        id: 'temp',
        icon: '🥶',
        label: '기온 · 한파',
        valueText: `${t.toFixed(1)}°C (체감 ${Number(snap.feelsLikeC || t).toFixed(0)}°C)`,
        kind: 'debuff',
        badge: '디버프 · 고보상',
        effectText: '빙판 미끄러움 · 속도 +7% · 점수 +20%'
      });
    } else if (t >= 13 && t <= 24) {
      extraHp += 1;
      feverGainMult *= 1.20;
      factors.push({
        id: 'temp',
        icon: '🌡️',
        label: '기온 · 쾌적',
        valueText: `${t.toFixed(1)}°C (습도 ${snap.humidity}%)`,
        kind: 'buff',
        badge: '쾌적 버프',
        effectText: '최대 체력 +1 · 피버 충전 +20%'
      });
    } else if (t > 24) {
      goldMult *= 1.15;
      factors.push({
        id: 'temp',
        icon: '☀️',
        label: '기온 · 따뜻함',
        valueText: `${t.toFixed(1)}°C (습도 ${snap.humidity}%)`,
        kind: 'buff',
        badge: '따뜻 버프',
        effectText: '골드 획득 +15%'
      });
    } else {
      jumpMult *= 1.05;
      scoreMult *= 1.10;
      factors.push({
        id: 'temp',
        icon: '🧥',
        label: '기온 · 선선함',
        valueText: `${t.toFixed(1)}°C (체감 ${Number(snap.feelsLikeC || t).toFixed(0)}°C)`,
        kind: 'buff',
        badge: '선선 버프',
        effectText: '점프력 +5% · 점수 +10%'
      });
    }

    // 2. 강수 (Precipitation / Snow)
    const precip = Number(snap.precipMm) || 0;
    const snow = Number(snap.snowCm) || 0;
    const wc = Number(snap.weatherCode) || 0;
    const isHeavyRain = precip >= 5.0 || wc === 65 || wc === 82 || wc === 95 || wc === 96 || wc === 99;
    const isSnow = snow >= 0.2 || wc === 71 || wc === 73 || wc === 75 || wc === 77 || wc === 85 || wc === 86;
    const isRain = !isSnow && (precip >= 0.2 || (wc >= 51 && wc <= 67) || wc === 80 || wc === 81);

    if (isHeavyRain) {
      floodActive = true;
      rainActive = true;
      scoreMult *= 1.30;
      goldMult *= 1.20;
      factors.push({
        id: 'precip',
        icon: '⛈️',
        label: '강수 · 폭우',
        valueText: `${precip.toFixed(1)}mm/h`,
        kind: 'debuff',
        badge: '폭우 디버프',
        effectText: '폭우·침수 경보 (우산 필수) · 점수 +30% · 골드 +20%'
      });
    } else if (isRain) {
      rainActive = true;
      scoreMult *= 1.15;
      goldMult *= 1.15;
      factors.push({
        id: 'precip',
        icon: '🌧️',
        label: '강수 · 비',
        valueText: `${precip.toFixed(1)}mm/h`,
        kind: 'debuff',
        badge: '강수 디버프',
        effectText: '빗물 경보 (우산 방어) · 점수·골드 +15%'
      });
    } else if (isSnow) {
      snowActive = true;
      iceActive = true;
      scoreMult *= 1.20;
      goldMult *= 1.15;
      factors.push({
        id: 'precip',
        icon: '🌨️',
        label: '강수 · 눈',
        valueText: `적설 ${snow.toFixed(1)}cm`,
        kind: 'debuff',
        badge: '강설 디버프',
        effectText: '눈보라·빙판 주의 · 점수 +20% · 골드 +15%'
      });
    } else {
      goldMult *= 1.10;
      speedMult *= 0.96;
      factors.push({
        id: 'precip',
        icon: desc.icon,
        label: `강수 · ${desc.label}`,
        valueText: `강수 없음 (구름 ${snap.cloudCover}%)`,
        kind: 'buff',
        badge: '쾌청 버프',
        effectText: '안정 주행(-4% 속도) · 골드 +10%'
      });
    }

    // 3. 대기질 (Air Quality PM10 / PM2.5)
    const pm10 = Number(snap.pm10) || 0;
    const pm25 = Number(snap.pm25) || 0;
    if (airGrade.level >= 2) {
      dustActive = true;
      scoreMult *= 1.25;
      factors.push({
        id: 'air',
        icon: '😷',
        label: `대기질 · ${airGrade.grade}`,
        valueText: `PM10 ${pm10} · PM2.5 ${pm25}㎍/㎥`,
        kind: 'debuff',
        badge: '황사 디버프',
        effectText: '미세먼지 경보 (마스크 필수) · 점수 +25%'
      });
    } else if (airGrade.level === 0) {
      magnetBonus += 65;
      feverGainMult *= 1.15;
      factors.push({
        id: 'air',
        icon: '🍃',
        label: '대기질 · 좋음',
        valueText: `PM10 ${pm10} · PM2.5 ${pm25}㎍/㎥`,
        kind: 'buff',
        badge: '청정 버프',
        effectText: '자석 범위 +65 · 피버 충전 +15%'
      });
    } else {
      goldMult *= 1.08;
      factors.push({
        id: 'air',
        icon: '🙂',
        label: '대기질 · 보통',
        valueText: `PM10 ${pm10} · PM2.5 ${pm25}㎍/㎥`,
        kind: 'buff',
        badge: '안정 버프',
        effectText: '골드 획득 +8%'
      });
    }

    // 4. 바람 (Wind / Gust)
    const wind = Number(snap.windMs) || 0;
    const gust = Number(snap.gustMs) || wind;
    if (wind >= 8.5 || gust >= 13.0) {
      gustActive = true;
      speedMult *= 1.10;
      scoreMult *= 1.20;
      factors.push({
        id: 'wind',
        icon: '💨',
        label: '바람 · 강풍',
        valueText: `${wind.toFixed(1)}m/s (돌풍 ${gust.toFixed(0)}m/s)`,
        kind: 'debuff',
        badge: '강풍 디버프',
        effectText: '강풍 경보 (우산 접기!) · 속도 +10% · 점수 +20%'
      });
    } else if (wind >= 4.0) {
      speedMult *= 1.04;
      scoreMult *= 1.10;
      factors.push({
        id: 'wind',
        icon: '🍃',
        label: '바람 · 산들바람',
        valueText: `${wind.toFixed(1)}m/s`,
        kind: 'buff',
        badge: '순풍 버프',
        effectText: '순풍 가속 +4% · 점수 +10%'
      });
    } else {
      jumpMult *= 1.06;
      magnetBonus += 35;
      factors.push({
        id: 'wind',
        icon: '✨',
        label: '바람 · 잔잔함',
        valueText: `${wind.toFixed(1)}m/s`,
        kind: 'buff',
        badge: '잔잔 버프',
        effectText: '점프력 +6% · 자석 범위 +35'
      });
    }

    // 5. 실제 계절 보너스 (Season Bonus)
    if (season.id === 'spring') feverGainMult *= 1.10;
    else if (season.id === 'summer') goldMult *= 1.10;
    else if (season.id === 'autumn') scoreMult *= 1.10;
    else if (season.id === 'winter') magnetBonus += 30;

    // Primary active canvas weather effect
    let primaryWeather = 'clear';
    if (floodActive) primaryWeather = 'flood';
    else if (rainActive) primaryWeather = 'rain';
    else if (gustActive) primaryWeather = 'gust';
    else if (dustActive) primaryWeather = 'dust';
    else if (heatActive) primaryWeather = 'heat';
    else if (iceActive) primaryWeather = 'ice_road';

    const buffCount = factors.filter((f) => f.kind === 'buff').length;
    const debuffCount = factors.filter((f) => f.kind === 'debuff').length;

    return {
      snapshot: snap,
      season,
      seasonId: season.id,
      seasonIdx: season.idx,
      desc,
      airGrade,
      primaryWeather,
      hazards: {
        rainActive,
        floodActive,
        dustActive,
        heatActive,
        gustActive,
        iceActive,
        snowActive
      },
      scoreMult: Math.round(scoreMult * 100) / 100,
      goldMult: Math.round(goldMult * 100) / 100,
      feverGainMult: Math.round(feverGainMult * 100) / 100,
      speedMult: Math.round(speedMult * 100) / 100,
      jumpMult: Math.round(jumpMult * 100) / 100,
      extraHp,
      magnetBonus,
      buffCount,
      debuffCount,
      factors
    };
  }

  return {
    CITIES,
    SEASON_META,
    getCityById,
    getSelectedCityId,
    setSelectedCityId,
    getCurrentKstSeasonInfo,
    getCurrentKstSeasonId,
    getWeatherDesc,
    getAirGrade,
    getCachedWeather,
    buildFallbackSnapshot,
    fetchLiveWeather,
    computeWeatherModifiers
  };
})();
