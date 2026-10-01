import { createCareer, COSMETICS } from './career.js';
import { getLocale, localizeTree, setLocale, subscribeLocale, t } from './i18n.js';

const TABS = [
  ['play', '⚽', 'Play'], ['daily', '🗓', 'Daily'], ['modes', '🎯', 'Modes'], ['arenas', '🏟', 'Arenas'],
  ['powers', '⚡', 'Powers'], ['career', '📊', 'Career'], ['controls', '🎮', 'Controls'], ['settings', '⚙', 'Settings'],
];
const TUTORIAL = [
  { icon: '⚽', eyebrow: 'THE POINT', title: 'Score more. Or knock them out.', intro: 'Score more goals before full time, or empty the opponent health bar for an instant knockout.', rows: [['🥅', 'Goals', 'Most goals when the whistle goes wins.'], ['🥊', 'Knockout', 'Drop your opponent and the match ends on the spot.'], ['🥇', 'Golden goal', 'Level at full time? Next goal takes it.'], ['🤖', 'Two players', 'Play against the CPU or invite a friend in supported match modes.']] },
  { icon: '🎮', eyebrow: 'CONTROLS', title: 'Run, jump, and hit it hard.', intro: 'In solo matches, either WASD or the arrow keys control Blue. In 2 Player, arrows control Red.', rows: [['A / D · ← / →', 'Move', 'Use either pair to run left or right.'], ['W · ↑', 'Jump', 'Tap again in the air for a second jump.'], ['S · ↓', 'Slide tackle', 'Steal the ball; mistime it and you leave yourself flat.'], ['Solo X · Space', 'Loft shot', 'Lift the ball toward the raised goal; jump close to the line, then shoot for an aerial strike.'], ['E · Enter', 'Charged shot', 'Hold to charge, then release for a stronger shot.'], ['Solo Z / C / V / B / N', 'Skills', 'Z fires Cannon in range or arms your next kick; C/V/B/N use other skills. In 2 Player, X/Z are strikes and powers use 1–5.'], ['Left Shift · Q', 'Sprint · brace', 'Sprint and shoulder-charge, or brace against a hit.']] },
  { icon: '🥊', eyebrow: 'FIGHTING', title: 'The ball is not your only weapon.', intro: 'Strike with the number pad. A football hit hard enough to connect also deals damage.', rows: [['Num 6', 'Jab', 'Fast hand strike with low recovery.'], ['Num 7', 'Leg kick', 'Long-range body shot that drains stamina.'], ['Num 8', 'Uppercut', 'Slow, heavy strike that launches.'], ['Num 9', 'Sweep', 'Low strike that knocks them down.'], ['Q', 'Brace', 'Cuts incoming damage and keeps you standing.']] },
  { icon: '🏆', eyebrow: "WHAT'S NEXT", title: 'Every match feeds the career.', intro: 'Earn XP, level up, and unlock kits, balls, trails, and celebrations.', rows: [['📅', 'Daily', 'Three objectives refresh on your local calendar day.'], ['☠️', 'Gauntlet', 'Three escalating matches. One defeat ends the run.'], ['⭐', 'Trials', 'A solo target challenge scored by your best run.'], ['👻', 'Ghost', 'Race your saved best run; your first run creates it.'], ['Esc / P', 'Pause', 'Pause a match, or return to the menu.']] },
];
const MODES = [
  { id: 'classic', name: 'Classic', icon: '⚽', copy: 'Quick match against the CPU.', rules: 'classic', series: 'quick' },
  { id: 'gauntlet', name: 'Gauntlet', icon: '☠️', copy: 'Win three escalating matches. One loss ends the run.', rules: 'classic', series: 'gauntlet' },
  { id: 'trials', name: 'Trials', icon: '⭐', copy: 'Solo target challenge. The score comes from targets hit.', rules: 'trials', series: 'quick' },
  { id: 'chaos', name: 'Chaos', icon: '🎲', copy: 'Changing field forces alter each match.', rules: 'chaos', series: 'quick' },
  { id: 'tournament', name: 'Tournament', icon: '🏆', copy: 'A three-round local bracket. Win each round to lift the cup.', rules: 'classic', series: 'tournament' },
  { id: 'local', name: '2 Player', icon: '👥', copy: 'Play a friend on one keyboard.', rules: 'classic', series: 'quick', matchType: 'local' },
  { id: 'ghost', name: 'Ghost', icon: '👻', copy: 'Race your saved best run. Your first attempt records the ghost.', rules: 'ghost', series: 'quick' },
];
const ARENAS = [
  { id: 'classic', name: 'Training Ground', description: 'Daylight and a clear pitch.' },
  { id: 'night', name: 'Night Match', description: 'Floodlights over a dark pitch.' },
  { id: 'neon', name: 'Neon Arena', description: 'Bright lines and a charged crowd.' },
];
const POWER_INFO = [
  ['1', 'Cannon shot', 'Fire a fast, heavy shot.'], ['2', 'Magnet', 'Pull the ball toward you.'], ['3', 'Super jump', 'Leap high for five seconds.'],
  ['4', 'Freeze', 'Freeze a nearby opponent briefly.'], ['5', 'Heal', 'Restore health and gain a short shield.'],
];

const COSMETIC_MESSAGE_KEYS = {
  starter: 'cosmetic.starter', comet: 'cosmetic.comet', volt: 'cosmetic.volt', royal: 'cosmetic.royal',
  classic: 'cosmetic.classicBall', ember: 'cosmetic.ember', prism: 'cosmetic.prism',
  none: 'cosmetic.none', spark: 'cosmetic.spark', 'comet-tail': 'cosmetic.cometTail',
  'fist-pump': 'cosmetic.fistPump', backflip: 'cosmetic.backflip', lightning: 'cosmetic.lightning',
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cosmeticName = (value) => {
  const item = typeof value === 'string' ? Object.values(COSMETICS).flat().find((entry) => entry.name === value) : value;
  const key = item && COSMETIC_MESSAGE_KEYS[item.id];
  return key ? t(key) : typeof value === 'string' ? value : item?.name || '';
};

export function createMenu({ onPlay = () => {}, onSettings = () => {}, onCosmetic = () => {} } = {}) {
  const root = document.querySelector('#menu-root');
  if (!root) throw new Error('createMenu requires #menu-root');
  const career = createCareer();
  let tab = 'play';
  let mode = 'classic';
  let arena = 'classic';
  let tutorialPage = 0;
  let tutorialOpen = false;
  let activeRun = null;
  let result = null;
  let focusBeforeModal = null;
  let settingsConfirm = false;
  const sessionSeen = new WeakSet();
  const matchToken = () => `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  function setTab(next) { tab = TABS.some(([id]) => id === next) ? next : 'play'; render(); }
  function modeOptions(selected = mode, { next = false } = {}) {
    const item = MODES.find((entry) => entry.id === selected) || MODES[0];
    const profile = career.getProfile();
    const currentSeries = next ? career.getSeries() : null;
    const series = currentSeries || (item.series === 'quick' ? null : { type: item.series, round: 1, wins: 0, losses: 0 });
    let difficulty = profile.settings.difficulty;
    if (series?.type === 'gauntlet') difficulty = ['easy', 'normal', 'hard'][series.round - 1] || 'hard';
    return {
      matchType: item.matchType || 'ai', difficulty, duration: profile.settings.matchDuration,
      rules: item.rules, arena, series: series?.type || 'quick', seriesRound: series?.round || 1,
      seriesWins: series?.wins || 0, matchId: matchToken(),
    };
  }
  function startMatch(selected = mode, { next = false } = {}) {
    mode = selected;
    const options = modeOptions(selected, { next });
    activeRun = { matchId: options.matchId, options, recorded: false };
    result = null;
    career.setSeries(options.series === 'quick' ? null : { type: options.series, round: options.seriesRound, wins: options.seriesWins, losses: 0 });
    hide();
    onPlay(options);
  }
  function seriesResult(event) {
    const current = career.getSeries();
    if (!current) return { seriesComplete: true, nextMatch: null, summary: '' };
    const winner = event?.winner === 0 ? 'blue' : event?.winner === 1 ? 'red' : event?.winner;
    const won = winner === 'blue' || (event?.rules === 'trials' && Number(event?.points || event?.trial?.points) > 0);
    const draw = winner === 'draw' || winner == null;
    if (!won || draw) {
      career.setSeries(null);
      const summaryKey = current.type === 'gauntlet' ? 'series.gauntletEnded' : 'series.tournamentEnded';
      const summaryParts = [
        { key: summaryKey, args: { round: current.round } },
        { key: draw ? 'series.draw' : 'series.runOver', args: {} },
      ];
      return { seriesComplete: true, nextMatch: null, summary: summaryParts.map((part) => t(part.key, part.args)).join(' '), summaryParts };
    }
    if (current.round >= 3) {
      career.setSeries(null);
      const summaryKey = current.type === 'gauntlet' ? 'series.gauntletCleared' : 'series.tournamentWon';
      const summaryParts = [{ key: summaryKey, args: {} }];
      return { seriesComplete: true, nextMatch: null, summary: t(summaryKey), summaryParts };
    }
    const next = { ...current, round: current.round + 1, wins: current.wins + 1 };
    career.setSeries(next);
    const summaryKey = current.type === 'gauntlet' ? 'series.gauntletRoundWon' : 'series.tournamentRoundWon';
    const summaryArgs = { round: current.round, next: next.round };
    const summaryParts = [{ key: summaryKey, args: summaryArgs }];
    return { seriesComplete: false, nextMatch: modeOptions(mode, { next: true }), summary: t(summaryKey, summaryArgs), summaryParts };
  }
  function recordMatch(event = {}, metadata = {}) {
    if (event && typeof event === 'object' && sessionSeen.has(event)) return activeRun?.lastResult || result;
    if (event && typeof event === 'object') sessionSeen.add(event);
    const id = String(event.matchId || activeRun?.matchId || event.resultId || matchToken());
    if (!activeRun) activeRun = { matchId: id, options: {}, recorded: false };
    if (activeRun.recorded || (event.matchId && activeRun.matchId !== event.matchId)) return activeRun.lastResult || result;
    activeRun.recorded = true;
    const normalized = { ...event, matchId: id, rules: event.rules || activeRun.options?.rules, series: event.series || activeRun.options?.series };
    const reward = career.record(normalized, id);
    const series = seriesResult(normalized);
    if (metadata.ghostTrack) saveGhostTrack(metadata.ghostTrack, normalized);
    const outcome = {
      ...reward,
      seriesComplete: series.seriesComplete,
      nextMatch: series.nextMatch,
      summary: series.summary,
      summaryParts: series.summaryParts,
      winner: normalized.winner ?? null,
      winnerSide: normalized.winnerSide || (normalized.winner === 0 ? 'blue' : normalized.winner === 1 ? 'red' : null),
      matchType: activeRun.options?.matchType || 'ai',
      score: Array.isArray(normalized.score) ? normalized.score.slice(0, 2) : [0, 0],
      reason: normalized.resultReason || normalized.endReason || normalized.reason || 'time',
    };
    activeRun.lastResult = outcome;
    result = outcome;
    render();
    return outcome;
  }
  function saveGhostTrack(track, event) {
    if (!Array.isArray(track) || !track.length) return;
    try {
      const previous = JSON.parse(localStorage.getItem('football-wars-ghost-v1') || 'null');
      const duration = Number(event.duration || activeRun?.options?.duration || 60);
      if (!previous || track.length > (previous.track?.length || 0)) localStorage.setItem('football-wars-ghost-v1', JSON.stringify({ track, duration, savedAt: Date.now() }));
    } catch { /* Ghost recording is optional when storage is blocked. */ }
  }
  function getGhostTrack() {
    try { return JSON.parse(localStorage.getItem('football-wars-ghost-v1') || 'null')?.track || null; } catch { return null; }
  }
  function renderHeader() {
    const profile = career.getProfile();
    const pct = Math.max(0, Math.min(100, profile.xpInLevel / profile.nextLevelXp * 100));
    const nextUnlock = Object.values(COSMETICS).flat().find((item) => item.level > profile.level);
    const nextUnlockName = nextUnlock ? cosmeticName(nextUnlock) : '';
    return `<header class="fw-header">
      <button class="fw-locale-toggle" data-action="toggle-locale" type="button" aria-label="${escapeHtml(t('menu.localeToggle'))}">${getLocale() === 'en' ? '中文' : 'EN'}</button>
      <div class="fw-brand"><div class="fw-wordmark">2D FOOTBALL <span>⚡</span> WARS</div><div class="fw-tagline">TWO PLAYERS · ONE BALL · TOTAL WAR</div></div>
      <div class="fw-level" aria-label="${escapeHtml(t('menu.levelAria',{level:profile.level,xp:profile.xpInLevel,nextXp:profile.nextLevelXp}))}">
        <div class="fw-level-badge"><strong>${profile.level}</strong><small>LVL</small></div>
        <div class="fw-progress"><div class="fw-xp-line"><span>${escapeHtml(t('menu.xpToLevel',{xp:profile.xpInLevel,nextXp:profile.nextLevelXp}))}</span><b>${escapeHtml(nextUnlock ? t('menu.nextUnlock',{name:nextUnlockName,level:nextUnlock.level}) : t('menu.allUnlocked'))}</b></div><div class="fw-progress-track"><span style="width:${pct}%"></span></div></div>
      </div>
      <nav class="fw-tabs" aria-label="Main menu">${TABS.map(([id, icon, label]) => `<button class="fw-tab ${tab === id ? 'is-active' : ''}" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}"><span>${icon}</span><b>${label}</b>${id === 'daily' && career.dailyState().some((task) => task.complete && !task.claimed) ? '<i class="fw-notice" aria-label="Reward ready"></i>' : ''}</button>`).join('')}</nav>
    </header>`;
  }
  function renderPlay() {
    const selected = MODES.find((entry) => entry.id === mode) || MODES[0];
    const profile = career.getProfile();
    const practiceTip = t(mode === 'local' ? 'menu.practiceLocal' : 'menu.practiceSolo');
    const modeCards = ['classic', 'gauntlet', 'trials', 'chaos', 'tournament', 'local'].map((id) => {
      const item = MODES.find((entry) => entry.id === id);
      return `<button class="fw-mode-button ${mode === id ? 'is-selected' : ''}" data-mode="${id}" aria-pressed="${mode === id}"><span>${item.icon}</span>${item.name}</button>`;
    }).join('');
    return `<section class="fw-view fw-play-view"><div class="fw-section-heading"><span>PLAY</span><span class="fw-subtle">${escapeHtml(ARENAS.find((entry) => entry.id === arena)?.name || 'Training Ground')}</span></div>
      <div class="fw-play-content">
        <div class="fw-play-summary"><div class="fw-tip"><span class="fw-tip-icon">💡</span><div><b>Practice tip</b><p>${practiceTip}</p></div></div>
          <div class="fw-match-settings"><label>CPU difficulty<select data-setting="difficulty"><option value="easy" ${profile.settings.difficulty === 'easy' ? 'selected' : ''}>Easy</option><option value="normal" ${profile.settings.difficulty === 'normal' ? 'selected' : ''}>Normal</option><option value="hard" ${profile.settings.difficulty === 'hard' ? 'selected' : ''}>Hard</option></select></label><label>Match length<select data-setting="matchDuration"><option value="60" ${profile.settings.matchDuration === 60 ? 'selected' : ''}>60 seconds</option><option value="90" ${profile.settings.matchDuration === 90 ? 'selected' : ''}>90 seconds</option></select></label></div>
        </div>
        <div class="fw-launch"><div class="fw-selected-mode"><span>${selected.icon}</span><div><b>${selected.name}</b><small>${selected.copy}</small></div></div><button class="fw-play-now" data-action="play"><span>⚽</span><span><b>PLAY NOW</b><small>${mode === 'local' ? 'Local 2 player' : selected.name === 'Trials' ? 'Solo target challenge' : selected.name === 'Ghost' ? 'Race your best run' : 'Quick match vs CPU'}</small></span></button>
          <div class="fw-mode-grid">${modeCards}<button class="fw-mode-button ${mode === 'ghost' ? 'is-selected' : ''}" data-mode="ghost" aria-pressed="${mode === 'ghost'}"><span>👻</span>Ghost</button></div>
        </div>
      </div>
    </section>`;
  }
  function renderDaily() {
    const tasks = career.dailyState();
    const profile = career.getProfile();
    return `<section class="fw-view"><div class="fw-section-heading"><span>DAILY CHALLENGES</span><span class="fw-subtle">${new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full' }).format(new Date())}</span></div><div class="fw-daily-layout"><div class="fw-daily-list">${tasks.map((task) => `<div class="fw-task"><div class="fw-task-main"><span class="fw-task-check ${task.complete ? 'is-done' : ''}">${task.complete ? '✓' : '•'}</span><div><b>${task.label}</b><small>${escapeHtml(t('daily.remaining', { progress: task.progress, goal: task.goal }))}</small></div></div><div class="fw-task-reward"><span>+${task.reward.xp} XP</span><span>+${task.reward.coins} 🪙</span><button class="fw-small-button" data-claim="${task.id}" ${!task.complete || task.claimed ? 'disabled' : ''}>${task.claimed ? 'Claimed' : 'Claim'}</button></div><div class="fw-task-progress"><span style="width:${Math.min(100, task.progress / task.goal * 100)}%"></span></div></div>`).join('')}</div><aside class="fw-daily-note"><b>Daily reset</b><p>Objectives reset at midnight using your device's local date.</p><div class="fw-streak"><span>🔥</span><div><strong>${profile.daily.streak}</strong><small>day streak</small></div></div><span class="fw-subtle">A streak advances when you complete and claim all three tasks.</span></aside></div></section>`;
  }
  function renderModes() {
    const selected = MODES.find((item) => item.id === mode) || MODES[0];
    return `<section class="fw-view"><div class="fw-section-heading"><span>GAME MODES</span><span class="fw-subtle">One keyboard, two players, or the CPU</span></div><div class="fw-mode-list">${MODES.map((item) => `<button class="fw-mode-row ${mode === item.id ? 'is-selected' : ''}" data-mode="${item.id}"><span class="fw-mode-icon">${item.icon}</span><span class="fw-mode-description"><b>${item.name}</b><small>${item.copy}</small></span><span class="fw-mode-arrow">${mode === item.id ? 'SELECTED' : 'CHOOSE'}</span></button>`).join('')}</div><div class="fw-view-actions"><button class="fw-primary-button" data-action="play">${escapeHtml(t('menu.playAction'))} <span>${escapeHtml(selected.name)}</span></button></div></section>`;
  }
  function renderArenas() {
    const selected = ARENAS.find((item) => item.id === arena) || ARENAS[0];
    return `<section class="fw-view"><div class="fw-section-heading"><span>ARENAS</span><span class="fw-subtle">Choose the pitch for your next match</span></div><div class="fw-arena-list">${ARENAS.map((item) => `<button class="fw-arena-row arena-${item.id} ${arena === item.id ? 'is-selected' : ''}" data-arena="${item.id}" aria-pressed="${arena === item.id}"><span class="fw-arena-mark">${arena === item.id ? '✓' : '○'}</span><span><b>${item.name}</b><small>${item.description}</small></span><span class="fw-arena-swatch"></span></button>`).join('')}</div><div class="fw-view-actions"><button class="fw-primary-button" data-action="play">${escapeHtml(t('menu.playIn'))} <span>${escapeHtml(selected.name)}</span></button></div></section>`;
  }
  function renderPowers() {
    return `<section class="fw-view"><div class="fw-section-heading"><span>POWERS</span><span class="fw-subtle">Earn power during play, then activate a charged ability</span></div><div class="fw-power-list">${POWER_INFO.map(([key, name, copy], index) => `<div class="fw-power-row"><kbd>${key}</kbd><span class="fw-power-symbol">${['💥', '🧲', '⬆️', '❄️', '💚'][index]}</span><div><b>${name}</b><small>${copy}</small></div></div>`).join('')}</div><p class="fw-inline-note">Power charge builds as you play. Abilities are available to both players.</p></section>`;
  }
  function renderCareer() {
    const profile = career.getProfile();
    const cosmetics = Object.entries(COSMETICS).map(([category, list]) => {
      const key = category === 'celebrations' ? 'celebration' : category.slice(0, -1);
      return `<div class="fw-cosmetic-group"><h3>${category === 'kits' ? 'Kits' : category === 'balls' ? 'Balls' : category === 'trails' ? 'Trails' : 'Goal celebrations'}</h3><div class="fw-cosmetic-options">${list.map((item) => {
        const locked = item.level > profile.level;
        const equipped = profile.cosmetic[key] === item.id;
        return `<button class="fw-cosmetic ${equipped ? 'is-equipped' : ''} ${locked ? 'is-locked' : ''}" data-cosmetic-category="${category}" data-cosmetic="${item.id}" ${locked || equipped ? 'disabled' : ''}><span>${locked ? '🔒' : equipped ? '✓' : '＋'}</span><b>${escapeHtml(cosmeticName(item))}</b><small>${locked ? escapeHtml(t('menu.level',{level:item.level})) : equipped ? escapeHtml(t('menu.equipped')) : escapeHtml(t('menu.equip'))}</small></button>`;
      }).join('')}</div></div>`;
    }).join('');
    return `<section class="fw-view"><div class="fw-section-heading"><span>CAREER</span><span class="fw-subtle">Local profile · saved on this device</span></div><div class="fw-career-top"><div class="fw-career-level"><strong>${escapeHtml(t('menu.level',{level:profile.level}))}</strong><span>${profile.xp} ${escapeHtml(t('menu.totalXp'))}</span><div class="fw-progress-track"><span style="width:${Math.min(100, profile.xpInLevel / profile.nextLevelXp * 100)}%"></span></div><small>${escapeHtml(t('menu.xpToLevel',{xp:profile.xpInLevel,nextXp:profile.nextLevelXp}))}</small></div><div class="fw-career-stats"><div><b>${profile.matches}</b><small>Matches</small></div><div><b>${profile.wins}</b><small>Wins</small></div><div><b>${profile.goals}</b><small>Goals</small></div><div><b>${profile.coins}</b><small>Coins</small></div></div></div><div class="fw-cosmetics">${cosmetics}</div><div class="fw-view-actions"><button class="fw-secondary-button" data-action="reset-career">Reset local career</button></div></section>`;
  }
  function renderControls() {
    if (mode === 'local') {
      const blue = [['A / D', 'Move left / right'], ['W', 'Jump · tap again in the air'], ['S', 'Slide tackle'], ['Space', 'Quick shot'], ['E', 'Hold to charge · release to shoot'], ['1 – 5', 'Activate powers'], ['Left Shift · Q', 'Sprint · brace'], ['Num 6 – 9 · Z / X / C / V', 'Jab · leg kick · uppercut · sweep']];
      const red = [['← / →', 'Move left / right'], ['↑', 'Jump · tap again in the air'], ['↓', 'Slide tackle'], ['Enter', 'Hold to charge · release to shoot'], ['6 – 0', 'Activate powers'], ['Right Shift · /', 'Sprint · brace'], ['I / O / K / L', 'Jab · leg kick · uppercut · sweep']];
      return `<section class="fw-view"><div class="fw-section-heading"><span>CONTROLS</span><span class="fw-subtle">Two players · one keyboard</span></div><div class="fw-controls-grid"><div><h3>Player 1 · Blue</h3>${blue.map(([key, text]) => `<div class="fw-control-row"><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div><div><h3>Player 2 · Red</h3>${red.map(([key, text]) => `<div class="fw-control-row"><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div></div></section>`;
    }
    const actions = [['← / → · A / D', 'Move left / right'], ['↑ · W', 'Jump · tap again in the air'], ['↓ · S', 'Slide tackle'], ['X · Space', 'Loft shot toward raised goal'], ['E · Enter', 'Hold to charge · release to shoot'], ['Left Shift · Q', 'Sprint · brace'], ['Num 6 – 9', 'Jab · leg kick · uppercut · sweep']];
    const skills = [['Z', 'Cannon: fire in range or arm next kick'], ['C', 'Magnet'], ['V', 'High jump'], ['B', 'Freeze'], ['N', 'Heal'], ['1 – 5', 'Same five skills'], ['P / Esc', 'Pause or resume'], ['R / F', 'Restart · fullscreen']];
    return `<section class="fw-view"><div class="fw-section-heading"><span>CONTROLS</span><span class="fw-subtle">Single player · Blue · WASD and arrows both work</span></div><div class="fw-controls-grid"><div><h3>Move and shoot</h3>${actions.map(([key, text]) => `<div class="fw-control-row"><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div><div><h3>Skills</h3>${skills.map(([key, text]) => `<div class="fw-control-row"><kbd>${key}</kbd><span>${text}</span></div>`).join('')}</div></div></section>`;
  }
  function renderSettings() {
    const settings = career.getSettings();
    return `<section class="fw-view"><div class="fw-section-heading"><span>SETTINGS</span><span class="fw-subtle">Saved locally</span></div><div class="fw-settings-list"><label class="fw-setting-row"><span><b>CPU difficulty</b><small>Default opponent strength</small></span><select data-setting="difficulty"><option value="easy" ${settings.difficulty === 'easy' ? 'selected' : ''}>Easy</option><option value="normal" ${settings.difficulty === 'normal' ? 'selected' : ''}>Normal</option><option value="hard" ${settings.difficulty === 'hard' ? 'selected' : ''}>Hard</option></select></label><label class="fw-setting-row"><span><b>Match length</b><small>Duration before golden goal</small></span><select data-setting="matchDuration"><option value="60" ${settings.matchDuration === 60 ? 'selected' : ''}>60 seconds</option><option value="90" ${settings.matchDuration === 90 ? 'selected' : ''}>90 seconds</option></select></label><label class="fw-setting-row"><span><b>Sound volume</b><small>Game sound level</small></span><input type="range" min="0" max="1" step="0.05" value="${settings.soundVolume}" data-setting="soundVolume" aria-label="Sound volume"><output>${Math.round(settings.soundVolume * 100)}%</output></label><label class="fw-setting-row"><span><b>Menu motion</b><small>Enable interface movement effects</small></span><input type="checkbox" data-setting="motion" ${settings.motion ? 'checked' : ''}></label><div class="fw-setting-row"><span><b>Full screen</b><small>Use the whole browser window</small></span><button class="fw-secondary-button" data-action="fullscreen">Toggle</button></div><div class="fw-setting-row"><span><b>First match tutorial</b><small>Review the four intro pages</small></span><button class="fw-secondary-button" data-action="tutorial">Open tutorial</button></div></div></section>`;
  }
  function viewMarkup() {
    return ({ play: renderPlay, daily: renderDaily, modes: renderModes, arenas: renderArenas, powers: renderPowers, career: renderCareer, controls: renderControls, settings: renderSettings }[tab] || renderPlay)();
  }
  function resultMarkup() {
    if (!result) return '';
    const blue = result.winnerSide === 'blue' || result.winner === 'blue' || result.winner === 0;
    const draw = result.winner === 'draw' || result.winner == null;
    const title = t(draw ? 'result.draw' : result.matchType === 'local' ? (blue ? 'result.blueWins' : 'result.redWins') : blue ? 'result.youWin' : 'result.cpuWins');
    const finishKey = result.reason !== 'knockout' ? null : result.matchType === 'local' ? (blue ? 'result.redKnocked' : 'result.blueKnocked') : blue ? 'result.opponentKnocked' : 'result.youKnocked';
    const finish = finishKey ? t(finishKey) : null;
    const summary = result.summaryParts
      ? result.summaryParts.map((part) => t(part.key, part.args)).join(' ')
      : result.summary || t('result.rewardsAdded');
    const unlockedNames = (result.unlocked || []).map(cosmeticName);
    const unlocked = unlockedNames.length ? t('result.unlocked',{items:unlockedNames.join(', ')}) : '';
    return `<div class="fw-result-scrim" role="presentation"><section class="fw-result" role="dialog" aria-modal="true" aria-labelledby="fw-result-title"><span class="fw-result-icon">${draw ? '🤝' : blue ? '🏆' : '⚽'}</span><h2 id="fw-result-title">${escapeHtml(title)}</h2><div class="fw-result-score"><strong>${result.score[0]}</strong><span>–</span><strong>${result.score[1]}</strong></div>${finish ? `<p class="fw-result-finish">${escapeHtml(finish)}</p>` : ''}<p>${escapeHtml(summary)}</p><div class="fw-result-rewards"><span>+${result.xpEarned || 0} ${escapeHtml(t('result.xp'))}</span><span>+${result.coinsEarned || 0} ${escapeHtml(t('result.coins'))}</span>${result.level ? `<span>${escapeHtml(t('result.level',{level:result.level}))}</span>` : ''}</div>${unlocked ? `<p class="fw-unlocked">${escapeHtml(unlocked)}</p>` : ''}<div class="fw-result-actions">${result.nextMatch ? `<button class="fw-primary-button" data-action="next-match">${escapeHtml(t('result.nextMatch'))}</button>` : `<button class="fw-primary-button" data-action="dismiss-result">${escapeHtml(t('result.continue'))}</button>`}<button class="fw-secondary-button" data-action="dismiss-result">${escapeHtml(t('result.menu'))}</button></div></section></div>`;
  }
  function tutorialMarkup() {
    if (!tutorialOpen) return '';
    const page = TUTORIAL[tutorialPage];
    return `<div class="fw-tutorial-scrim"><section class="fw-tutorial" role="dialog" aria-modal="true" aria-labelledby="fw-tutorial-title" aria-describedby="fw-tutorial-intro"><div class="fw-tutorial-content"><div class="fw-tutorial-icon">${page.icon}</div><div class="fw-eyebrow">${page.eyebrow}</div><h2 id="fw-tutorial-title" tabindex="-1">${page.title}</h2><p id="fw-tutorial-intro" class="fw-tutorial-intro">${page.intro}</p><div class="fw-tutorial-rows">${page.rows.map(([icon, label, copy]) => `<div class="fw-tutorial-row"><strong>${escapeHtml(icon)}</strong><b>${escapeHtml(label)}</b><span>${escapeHtml(copy)}</span></div>`).join('')}</div></div><footer class="fw-tutorial-footer"><button class="fw-secondary-button" data-tutorial="skip">Skip</button><div class="fw-dots" aria-label="${escapeHtml(t('tutorial.pages',{page:tutorialPage+1}))}">${TUTORIAL.map((_, index) => `<button aria-label="${escapeHtml(t('tutorial.goToPage',{page:index+1}))}" aria-current="${index === tutorialPage ? 'step' : 'false'}" class="${index === tutorialPage ? 'is-current' : ''}" data-tutorial-page="${index}"></button>`).join('')}</div><div class="fw-tutorial-nav"><button class="fw-secondary-button" data-tutorial="back" ${tutorialPage === 0 ? 'disabled' : ''}>← <span>Back</span></button><button class="fw-primary-button" data-tutorial="next">${tutorialPage === TUTORIAL.length - 1 ? '⚽ Start playing' : 'Next →'}</button></div></footer></section></div>`;
  }
  function render() {
    const wasOpen = root.classList.contains('is-visible');
    root.dataset.motion = career.getSettings().motion ? 'on' : 'off';
    root.innerHTML = `<div class="fw-shell">${renderHeader()}<main class="fw-main">${viewMarkup()}</main><footer class="fw-footer"><span>LOCAL CAREER · NO NETWORK REQUIRED</span><button data-action="tutorial">How to play</button></footer>${tutorialMarkup()}${resultMarkup()}</div>`;
    root.classList.toggle('is-visible', wasOpen);
    localizeTree(root);
  }
  function show() { root.hidden = false; root.classList.add('is-visible'); render(); }
  function hide() { root.classList.remove('is-visible'); root.hidden = true; }
  function finishTutorial() {
    tutorialOpen = false;
    career.setTutorialSeen();
    render();
    if (focusBeforeModal?.isConnected) focusBeforeModal.focus();
  }
  function showTutorial() {
    root.hidden = false;
    root.classList.add('is-visible');
    focusBeforeModal = document.activeElement;
    tutorialPage = 0;
    tutorialOpen = true;
    render();
    root.querySelector('#fw-tutorial-title')?.focus();
  }
  function showResultSummary(outcome) { result = outcome; show(); render(); root.querySelector('.fw-result button')?.focus(); }
  function getNextMatch() { return result?.nextMatch || null; }
  function updateSetting(target) {
    const key = target.dataset.setting;
    const value = target.type === 'checkbox' ? target.checked : key === 'matchDuration' ? Number(target.value) : key === 'soundVolume' ? Number(target.value) : target.value;
    const updated = career.updateSettings({ [key]: value });
    onSettings(updated);
    if (key === 'soundVolume') {
      const output = target.parentElement.querySelector('output');
      if (output) output.value = `${Math.round(updated.soundVolume * 100)}%`;
    }
    if (key !== 'soundVolume') render();
  }
  function setSetting(key, value) {
    const updated = career.updateSettings({ [key]: value });
    onSettings(updated);
    render();
    return updated;
  }
  function onClick(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.tab) { setTab(target.dataset.tab); return; }
    if (target.dataset.mode) { mode = target.dataset.mode; result = null; render(); return; }
    if (target.dataset.arena) { arena = target.dataset.arena; render(); return; }
    if (target.dataset.claim) { career.claimDaily(target.dataset.claim); render(); return; }
    if (target.dataset.cosmetic) {
      const category = target.dataset.cosmeticCategory;
      if (career.equip(category, target.dataset.cosmetic)) onCosmetic(career.getCosmetic());
      render(); return;
    }
    if (target.dataset.tutorial) {
      const action = target.dataset.tutorial;
      if (action === 'skip') finishTutorial();
      else if (action === 'back') { tutorialPage = Math.max(0, tutorialPage - 1); render(); root.querySelector('#fw-tutorial-title')?.focus(); }
      else if (action === 'next') {
        if (tutorialPage === TUTORIAL.length - 1) finishTutorial();
        else { tutorialPage += 1; render(); root.querySelector('#fw-tutorial-title')?.focus(); }
      }
      return;
    }
    if (target.dataset.tutorialPage !== undefined) { tutorialPage = Number(target.dataset.tutorialPage); render(); root.querySelector('#fw-tutorial-title')?.focus(); return; }
    const action = target.dataset.action;
    if (action === 'toggle-locale') setLocale(getLocale() === 'en' ? 'zh-CN' : 'en');
    else if (action === 'play') startMatch(mode);
    else if (action === 'next-match' && result?.nextMatch) startMatch(mode, { next: true });
    else if (action === 'dismiss-result') { result = null; show(); render(); }
    else if (action === 'tutorial') showTutorial();
    else if (action === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.();
    } else if (action === 'reset-career') {
      if (settingsConfirm) { career.reset(); result = null; settingsConfirm = false; onSettings(career.getSettings()); onCosmetic(career.getCosmetic()); render(); }
      else { settingsConfirm = true; target.textContent = t('menu.resetConfirm'); setTimeout(() => { settingsConfirm = false; render(); }, 5000); }
    }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', (event) => { if (event.target.matches('[data-setting]')) updateSetting(event.target); });
  root.addEventListener('input', (event) => { if (event.target.matches('[data-setting="soundVolume"]')) updateSetting(event.target); });
  root.addEventListener('keydown', (event) => {
    if (!tutorialOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); finishTutorial(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); root.querySelector('[data-tutorial="next"]')?.click(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); root.querySelector('[data-tutorial="back"]:not(:disabled)')?.click(); }
    if (event.key === 'Tab') {
      const dialog = root.querySelector('.fw-tutorial');
      const focusable = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  subscribeLocale(() => render());

  render();
  onSettings(career.getSettings());
  onCosmetic(career.getCosmetic());
  if (!career.getProfile().tutorialSeen) showTutorial();

  return {
    show, hide, recordMatch, getProfile: career.getProfile, getSettings: career.getSettings, getCosmetic: career.getCosmetic,
    showTutorial, showResultSummary, getNextMatch, getGhostTrack, getSelectedMode: () => mode, getArena: () => arena,
    getDaily: career.dailyState, claimDaily: career.claimDaily, setSetting,
  };
}
