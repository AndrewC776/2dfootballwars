const STORAGE_KEY = 'football-wars-career-v1';
const LEVEL_STEP = 150;
const LEVEL_GROWTH = 50;
const COSMETICS = {
  kits: [
    { id: 'starter', name: 'Starter kit', level: 1 },
    { id: 'comet', name: 'Comet', level: 2 },
    { id: 'volt', name: 'Volt', level: 4 },
    { id: 'royal', name: 'Royal', level: 7 },
  ],
  balls: [
    { id: 'classic', name: 'Classic ball', level: 1 },
    { id: 'ember', name: 'Ember ball', level: 3 },
    { id: 'prism', name: 'Prism ball', level: 6 },
  ],
  trails: [
    { id: 'none', name: 'No trail', level: 1 },
    { id: 'spark', name: 'Spark trail', level: 3 },
    { id: 'comet-tail', name: 'Comet tail', level: 5 },
  ],
  celebrations: [
    { id: 'fist-pump', name: 'Fist pump', level: 1 },
    { id: 'backflip', name: 'Backflip', level: 4 },
    { id: 'lightning', name: 'Lightning pose', level: 8 },
  ],
};

const DEFAULT_SETTINGS = { difficulty: 'normal', matchDuration: 60, soundVolume: 0.65, motion: true };
const DEFAULT_COSMETIC = { kit: 'starter', ball: 'classic', trail: 'none', celebration: 'fist-pump' };
const localDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const validId = (value, list) => list.some((item) => item.id === value);

function defaultData() {
  return {
    version: 1,
    xp: 0,
    coins: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matches: 0,
    goals: 0,
    settings: { ...DEFAULT_SETTINGS },
    cosmetic: { ...DEFAULT_COSMETIC },
    tutorialSeen: false,
    processedMatches: [],
    daily: { date: '', progress: { matches: 0, goals: 0, wins: 0 }, claimed: [], streak: 0, lastClaimDate: '' },
    series: null,
  };
}

function cleanData(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const finiteInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const cosmetic = raw.cosmetic && typeof raw.cosmetic === 'object' ? raw.cosmetic : {};
  const daily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
  const progress = daily.progress && typeof daily.progress === 'object' ? daily.progress : {};
  base.xp = finiteInt(raw.xp);
  base.coins = finiteInt(raw.coins);
  base.wins = finiteInt(raw.wins);
  base.losses = finiteInt(raw.losses);
  base.draws = finiteInt(raw.draws);
  base.matches = finiteInt(raw.matches);
  base.goals = finiteInt(raw.goals);
  base.settings = {
    difficulty: ['easy', 'normal', 'hard'].includes(settings.difficulty) ? settings.difficulty : DEFAULT_SETTINGS.difficulty,
    matchDuration: [60, 90].includes(Number(settings.matchDuration)) ? Number(settings.matchDuration) : DEFAULT_SETTINGS.matchDuration,
    soundVolume: Math.max(0, Math.min(1, Number.isFinite(Number(settings.soundVolume)) ? Number(settings.soundVolume) : DEFAULT_SETTINGS.soundVolume)),
    motion: settings.motion !== false,
  };
  base.cosmetic = {
    kit: validId(cosmetic.kit, COSMETICS.kits) ? cosmetic.kit : 'starter',
    ball: validId(cosmetic.ball, COSMETICS.balls) ? cosmetic.ball : 'classic',
    trail: validId(cosmetic.trail, COSMETICS.trails) ? cosmetic.trail : 'none',
    celebration: validId(cosmetic.celebration, COSMETICS.celebrations) ? cosmetic.celebration : 'fist-pump',
  };
  base.tutorialSeen = Boolean(raw.tutorialSeen);
  base.processedMatches = Array.isArray(raw.processedMatches) ? raw.processedMatches.filter((id) => typeof id === 'string').slice(-100) : [];
  base.daily = {
    date: typeof daily.date === 'string' ? daily.date : '',
    progress: { matches: finiteInt(progress.matches), goals: finiteInt(progress.goals), wins: finiteInt(progress.wins) },
    claimed: Array.isArray(daily.claimed) ? daily.claimed.filter((id) => ['matches', 'goals', 'wins'].includes(id)) : [],
    streak: finiteInt(daily.streak),
    lastClaimDate: typeof daily.lastClaimDate === 'string' ? daily.lastClaimDate : '',
  };
  base.series = raw.series && typeof raw.series === 'object' ? raw.series : null;
  return base;
}

export function createCareer() {
  let memoryRaw = null;
  try { memoryRaw = localStorage.getItem(STORAGE_KEY); } catch { /* Storage can be blocked in private contexts. */ }
  let data;
  try { data = cleanData(memoryRaw ? JSON.parse(memoryRaw) : null); } catch { data = defaultData(); }
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* Keep this session playable without storage. */ }
  };
  const levelForXp = (xp) => {
    let level = 1;
    let remaining = xp;
    let threshold = LEVEL_STEP;
    while (remaining >= threshold) {
      remaining -= threshold;
      level += 1;
      threshold += LEVEL_GROWTH;
    }
    return { level, withinLevel: remaining, nextThreshold: threshold };
  };
  const levelInfo = () => levelForXp(data.xp);
  const getProfile = () => {
    const { level, withinLevel, nextThreshold } = levelInfo();
    return { ...structuredClone(data), level, xpInLevel: withinLevel, nextLevelXp: nextThreshold, cosmetics: structuredClone(COSMETICS) };
  };
  const ensureDaily = () => {
    const today = localDate();
    if (data.daily.date !== today) {
      data.daily = { ...data.daily, date: today, progress: { matches: 0, goals: 0, wins: 0 }, claimed: [] };
      save();
    }
    return data.daily;
  };
  const taskGoal = { matches: 3, goals: 2, wins: 1 };
  const taskLabel = { matches: 'Play 3 matches', goals: 'Score 2 goals', wins: 'Win a match' };
  const dailyState = () => {
    const daily = ensureDaily();
    return Object.keys(taskGoal).map((id) => ({
      id,
      label: taskLabel[id],
      progress: Math.min(daily.progress[id], taskGoal[id]),
      goal: taskGoal[id],
      complete: daily.progress[id] >= taskGoal[id],
      claimed: daily.claimed.includes(id),
      reward: { xp: 60, coins: 20 },
    }));
  };
  const updateSettings = (patch) => {
    const next = { ...data.settings, ...patch };
    data.settings = cleanData({ settings: next }).settings;
    save();
    return structuredClone(data.settings);
  };
  const equip = (category, id) => {
    const field = category === 'celebrations' ? 'celebration' : category.slice(0, -1);
    const item = COSMETICS[category]?.find((entry) => entry.id === id);
    if (!item || item.level > levelInfo().level) return false;
    data.cosmetic[field] = id;
    save();
    return true;
  };
  const record = (event, matchId) => {
    const id = String(matchId || event?.resultId || event?.matchId || '');
    if (!id || data.processedMatches.includes(id)) return { duplicate: true, profile: getProfile() };
    data.processedMatches.push(id);
    data.processedMatches = data.processedMatches.slice(-100);
    const score = Array.isArray(event?.score) ? event.score.map((n) => Number(n) || 0) : [0, 0];
    const winner = event?.winner === 0 ? 'blue' : event?.winner === 1 ? 'red' : event?.winner;
    const isTrial = event?.rules === 'trials' || event?.mode === 'trials' || event?.endReason === 'trial';
    const isWin = winner === 'blue' || (isTrial && Number(event?.trial?.points || event?.points) > 0);
    const isDraw = winner === 'draw' || winner === null || winner === undefined && score[0] === score[1];
    const xpEarned = isTrial ? Math.max(20, Number(event?.trial?.points || event?.points || 0) * 15) : 50 + (isWin ? 50 : 0) + Math.min(60, score[0] * 10);
    const coinsEarned = isWin ? 30 : 10;
    const oldLevel = levelInfo().level;
    data.xp += xpEarned;
    data.coins += coinsEarned;
    data.matches += 1;
    data.goals += score[0];
    if (isWin) data.wins += 1;
    else if (isDraw) data.draws += 1;
    else data.losses += 1;
    const daily = ensureDaily();
    daily.progress.matches += 1;
    daily.progress.goals += score[0];
    daily.progress.wins += isWin ? 1 : 0;
    save();
    const unlocked = Object.values(COSMETICS).flat().filter((item) => item.level > oldLevel && item.level <= levelInfo().level).map((item) => item.name);
    return { duplicate: false, xpEarned, coinsEarned, level: levelInfo().level, unlocked, profile: getProfile(), daily: dailyState() };
  };
  const claimDaily = (id) => {
    const daily = ensureDaily();
    const task = dailyState().find((entry) => entry.id === id);
    if (!task?.complete || task.claimed) return false;
    daily.claimed.push(id);
    data.xp += task.reward.xp;
    data.coins += task.reward.coins;
    if (daily.claimed.length === Object.keys(taskGoal).length) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = localDate(yesterday);
      daily.streak = daily.lastClaimDate === yesterdayKey ? daily.streak + 1 : daily.lastClaimDate === localDate() ? daily.streak : 1;
      daily.lastClaimDate = localDate();
    }
    save();
    return true;
  };
  const setTutorialSeen = () => { data.tutorialSeen = true; save(); };
  const reset = () => { data = defaultData(); save(); };
  const setSeries = (series) => { data.series = series ? structuredClone(series) : null; save(); };
  return { getProfile, getSettings: () => structuredClone(data.settings), getCosmetic: () => structuredClone(data.cosmetic), updateSettings, equip, record, dailyState, claimDaily, setTutorialSeen, reset, getSeries: () => structuredClone(data.series), setSeries, levelInfo };
}

export { COSMETICS, localDate };
