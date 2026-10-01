import { FootballGame, POWER_DEFINITIONS, getPlayerRenderPose } from './engine.js';
import { createMenu } from './menu.js';
import { applyLocale, getLocale, setLocale, subscribeLocale, t } from './i18n.js';
import './menu.css';
import './styles.css';

const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const $ = (selector) => document.querySelector(selector);
const game = new FootballGame({ onEvent: handleGameEvent });
const POWER_LOCALE_KEYS=['power.cannon','power.magnet','power.superJump','power.freeze','power.heal'];
const input = Object.create(null);
const heldKeyActions = new Map();
const heldActionCodes = new Map();
const edgePulses = Object.create(null);
const actionDownAt = Object.create(null);
let previousFrame = 0;
let soundEnabled = false;
let soundVolume = 0;
let audioContext;
let eventTimer;
let skillNoticeUntil = 0;
let healNoticeUntil = 0;
let manualStepping = false;
let animationId;
let matchStarted = false;
let arenaName = 'classic';
let rulesName = 'classic';
let touchCombatMode = false;
let menuMatchId = null;
let ghostPlayback = null;
let ghostRecording = [];
let ghostClock = 0;
let ghostSampleClock = 0;
let hitStopUntil = 0;
let lastImpactAt = 0;
let impactStrength = 0;
let sceneTime = 0;
let cannonTrailUntil = 0;
let cannonTrailSide = 'blue';
let stadiumSlogans = [];
let stadiumSloganLocale = '';
const menu = createMenu({ onPlay: startGame, onSettings: applySettings, onCosmetic: applyCosmetic });
const initialProfile=menu.getProfile();
if(initialProfile.matches===0&&!initialProfile.tutorialSeen&&initialProfile.settings.difficulty==='normal')menu.setSetting('difficulty','easy');

function handleGameEvent(event) {
  const shotLabel = event?.type === 'kick'
    ? event.skillPower === 'cannon' ? t('event.cannon') : event.quick ? t('event.loft') : event.lofted ? t('event.highVolley') : event.powered ? t('event.powerShot') : t('event.curveShot')
    : null;
  const powerName=t(POWER_LOCALE_KEYS[(event?.power??1)-1]??'menu.tab.powers');
  const powerLabel = event?.power === 1 ? (event.armed ? t('event.cannonArmed') : t('event.cannon')) : t('event.powerActivated',{name:powerName});
  const labels = { goal: event?.ownGoal ? t('event.ownGoal') : t('event.goal'), power: powerLabel, power_denied: powerDeniedLabel(event), heal: t('event.heal',{health:event?.healthRestored??0,stamina:event?.staminaRestored??0}), end: event?.winnerSide === 'blue' ? t('event.blueWins') : event?.winnerSide === 'red' ? t('event.redWins') : t('event.fullTime') };
  if (shotLabel) labels.kick = shotLabel;
  const skillNotice=event?.type==='power'&&event.power>=1&&event.power<=5||event?.type==='power_denied'||event?.type==='heal';
  if(skillNotice)skillNoticeUntil=performance.now()+1400;
  if(event?.type==='heal')healNoticeUntil=performance.now()+900;
  const priorityOverride=event?.type==='goal'||event?.type==='end';
  const ordinaryKickDuringSkillNotice=event?.type==='kick'&&event.skillPower!=='cannon'&&performance.now()<skillNoticeUntil;
  const healActivationEcho=event?.type==='power'&&event.power===5&&performance.now()<healNoticeUntil;
  if (labels[event?.type]&&!ordinaryKickDuringSkillNotice&&!healActivationEcho) {
    if(priorityOverride)skillNoticeUntil=0;
    const message=$('#match-message');
    message.textContent = labels[event.type];
    const cannonFeedback=event.type==='kick'&&event.skillPower==='cannon'||event.type==='power'&&event.power===1;
    const loftFeedback=event.type==='kick'&&event.quick;
    message.style.color=cannonFeedback?'#ffe47b':loftFeedback?'#a8ecff':'';
    message.style.borderColor=cannonFeedback?'#f5bc4e':loftFeedback?'#73d9f4':'';
    message.style.boxShadow=cannonFeedback?'0 0 22px #ffbb4745':loftFeedback?'0 0 18px #5fdafa30':'';
    message.classList.add('visible');
    clearTimeout(eventTimer);
    const skillMessage=skillNotice||event?.type==='kick'&&event.skillPower==='cannon';
    eventTimer = setTimeout(() => {message.classList.remove('visible');message.style.color='';message.style.borderColor='';message.style.boxShadow='';}, event.type === 'goal' ? 1800 : event.type === 'kick' ? 900 : skillMessage ? 1400 : 850);
  }
  if (event?.type === 'kick' || event?.type === 'goal' || event?.type === 'hit') {
    const now=performance.now();
    impactStrength=event.type==='goal'?10:event.type==='kick'?(event.powered?8:5):3;
    lastImpactAt=now;hitStopUntil=Math.max(hitStopUntil,now+(event.type==='goal'?95:event.powered?72:48));
  }
  if(event?.type==='kick'&&event.skillPower==='cannon'){
    cannonTrailUntil=performance.now()+760;
    cannonTrailSide=event.player??'blue';
  }
  if (event?.type === 'end') {
    clearInput();
    const result = menu.recordMatch({ ...event, matchId: menuMatchId, rules: rulesName, points: snapshot().trial?.points }, { ghostTrack: ghostRecording });
    menu.showResultSummary?.(result);
    menu.show?.();
    $('#game-root').hidden = true;
    matchStarted = false;
  }
  if (event?.type === 'power' || event?.type === 'power_denied' || event?.type === 'heal') syncSkillBar(snapshot());
  if (soundEnabled) playSound(event?.type);
}

function powerDeniedLabel(event) {
  const name=t(POWER_LOCALE_KEYS[(event?.power??1)-1]??'menu.tab.powers');
  const reason = event?.reason;
  if (reason === 'energy') return `${name} · ${t('hud.needEnergy',{cost:event.cost??0,energy:Math.floor(event.energy??0)})}`;
  if (reason === 'range') return `${name} · ${t('hud.needRange',{range:Math.round(event.requiredRange??0)})}`;
  if (reason === 'cooldown') return `${name} · ${t('hud.cooldownReason',{seconds:Math.ceil(event.remaining??0)})}`;
  if (reason === 'full_health') return `${name} · ${t('hud.healthStaminaFull')}`;
  if (reason === 'down') return `${name} · ${t('hud.waitToStand')}`;
  return `${name} · ${t('hud.unavailable')}`;
}

function playSound(type) {
  const frequencies = { kick: 175, jump: 280, goal: 520, power: 390, start: 340, end: 220 };
  const frequency = frequencies[type];
  if (!frequency) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type === 'goal' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, audioContext.currentTime + 0.12);
    gain.gain.setValueAtTime(0.045 * soundVolume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.16);
  } catch { /* Audio is optional when unavailable or blocked. */ }
}

function snapshot() {
  return game.getSnapshot?.() ?? game.state;
}

function syncHUD(state) {
  const scores = state.score ?? [0, 0];
  $('#blue-score').textContent = scores[0] ?? 0;
  $('#red-score').textContent = scores[1] ?? 0;
  const remaining = Math.max(0, Math.ceil(state.remaining ?? 60));
  $('#clock').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  $('#match-label').textContent = state.mode === 'replay' ? t('game.replay') : state.overtime ? t('game.goldenGoal') : (state.rules === 'trials' ? t('game.skillTrial') : state.matchType === 'local' ? t('game.twoPlayerMatch') : t('game.quickMatch'));
  const pause = $('#pause-btn');
  pause.setAttribute('aria-label', t(state.mode === 'paused' ? 'game.resumeAria' : 'game.pause'));
  pause.title = t(state.mode === 'paused' ? 'game.resumeAria' : 'game.pause');
  pause.querySelector('span').textContent = state.mode === 'paused' ? '▶' : 'Ⅱ';
  $('#start-btn').innerHTML = state.mode === 'paused' ? `<span aria-hidden="true">▶</span> ${t('game.resume')}` : `<span aria-hidden="true">●</span> ${t('game.matchLive')}`;
  const players = state.players ?? [];
  ['blue','red'].forEach((side,index)=>{
    const player=players[index]??{};
    const health=Math.max(0,Math.min(100,player.health??100));
    const stamina=Math.max(0,Math.min(100,player.stamina??100));
    $(`#${side}-health`).style.width=`${health}%`;
    $(`#${side}-stamina`).style.width=`${stamina}%`;
    $(`#${side}-player-name`).textContent=player.number??(index+1);
    const flags=[];
    if(player.downTime>0)flags.push(t('hud.down'));
    else if(player.brace)flags.push(t('hud.brace'));
    else if(player.sprint)flags.push(t('hud.sprint'));
    if(player.charge>0.05)flags.push(t('hud.charge',{percent:Math.round(player.charge*100)}));
    $(`#${side}-state`).textContent=flags.join(' · ');
  });
  const arenaLabels={classic:'game.classicStadium',night:'game.nightMatch',neon:'game.neonArena'};
  const ruleLabels={classic:'game.quickMatch',chaos:'game.chaos',trials:'game.skillTrial',ghost:'game.ghostRun'};
  $('#arena-mode-label').textContent=`${t(arenaLabels[state.arena??arenaName]??'game.classicStadium')} · ${t(ruleLabels[state.rules]??'game.quickMatch')}${state.goldenGoal?' · '+t('game.goldenGoal'):''}`;
  const localMatch=state.matchType==='local'&&state.rules!=='trials';
  $('#match-summary').textContent=localMatch?t('game.bluePlayer'):t('game.blueVsCpu',{difficulty:t(`difficulty.${state.difficulty??'normal'}`)});
  $('#controls-primary').innerHTML=localMatch?`<kbd>A</kbd>/<kbd>D</kbd> ${t('game.blue')} · <kbd>W</kbd> ${t('controls.jump')}`:`<kbd>←</kbd>/<kbd>→</kbd> ${t('controls.move')} · <kbd>↑</kbd> ${t('controls.jump')} · <kbd>↓</kbd> ${t('controls.slide')}`;
  $('#controls-shot').innerHTML=localMatch?`<kbd>SPACE</kbd> ${t('controls.quick')} · <kbd>E</kbd> ${t('controls.charge')}`:`<kbd>X</kbd>/<kbd>SPACE</kbd> ${t('controls.loft')} · <kbd>E</kbd>/<kbd>ENTER</kbd> ${t('controls.charge')}`;
  $('#controls-skill').innerHTML=localMatch?`<kbd>1</kbd>–<kbd>5</kbd> ${t('game.blue')} ${t('controls.abilities')}`:`<kbd>Z</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>B</kbd> <kbd>N</kbd> ${t('controls.abilities')}`;
  $('#controls-extra').innerHTML=localMatch?`<kbd>SHIFT</kbd> ${t('controls.sprint')} · <kbd>S</kbd> ${t('controls.slide')} · <kbd>Q</kbd> ${t('controls.brace')}`:`<kbd>SHIFT</kbd> ${t('controls.sprint')} · <kbd>Q</kbd> ${t('controls.brace')}`;
  const secondary=$('#controls-secondary');
  secondary.hidden=!localMatch;
  secondary.innerHTML=`<i></i><kbd>←</kbd>/<kbd>→</kbd> ${t('game.red')} ${t('controls.move')} · <kbd>↑</kbd>${t('controls.jump')} · <kbd>↓</kbd>${t('controls.slide')} · <kbd>ENTER</kbd>${t('controls.shoot')} · <kbd>/</kbd>${t('controls.brace')} · <kbd>6</kbd>–<kbd>0</kbd>${t('controls.abilities')}`;
  syncSkillBar(state);
  if (state.mode === 'paused') { clearInput(); $('#match-message').textContent=t('game.paused'); $('#match-message').classList.add('visible'); }
  else if ($('#match-message').textContent === t('game.paused')) $('#match-message').classList.remove('visible');
}

function syncHelpDialog() {
  const localMatch=snapshot().matchType==='local'&&snapshot().rules!=='trials';
  $('#help-eyebrow').textContent=t('help.onPitch');
  $('#help-title').textContent=t('help.title');
  $('[data-close-dialog]').setAttribute('aria-label',t('controls.close'));
  const columns=$('#help-columns');
  columns.innerHTML=localMatch
    ? `<div><h3>${t('help.bluePlayer')}</h3><p><kbd>A</kbd> <kbd>D</kbd> ${t('controls.move')} <kbd>W</kbd> ${t('controls.jump')}</p><p><kbd>SPACE</kbd> ${t('controls.quick')} · ${t('help.holdRelease')} <kbd>E</kbd> ${t('controls.charge')}</p><p><kbd>SHIFT</kbd> ${t('controls.sprint')} <kbd>S</kbd> ${t('controls.slide')} <kbd>Q</kbd> ${t('controls.brace')}</p><p><kbd>1</kbd>–<kbd>5</kbd> ${t('controls.abilities')}</p><p><kbd>Z</kbd>/<kbd>X</kbd>/<kbd>C</kbd>/<kbd>V</kbd> ${t('help.strikes')}</p></div><div><h3>${t('help.redPlayer')}</h3><p><kbd>←</kbd> <kbd>→</kbd> ${t('controls.move')} <kbd>↑</kbd> ${t('controls.jump')}</p><p><kbd>ENTER</kbd> ${t('help.holdRelease')} ${t('controls.shoot')}</p><p><kbd>RIGHT SHIFT</kbd> ${t('controls.sprint')} <kbd>↓</kbd> ${t('controls.slide')} <kbd>/</kbd> ${t('controls.brace')}</p><p><kbd>6</kbd>–<kbd>0</kbd> ${t('controls.abilities')}</p><p><kbd>I</kbd> <kbd>O</kbd> <kbd>K</kbd> <kbd>L</kbd> ${t('help.strikes')}</p></div>`
    : `<div><h3>${t('help.bluePlayer')}</h3><p><kbd>←</kbd> <kbd>→</kbd> ${t('controls.move')} <kbd>↑</kbd> ${t('controls.jump')} · <kbd>↓</kbd> ${t('controls.slide')}</p><p><kbd>X</kbd> / <kbd>SPACE</kbd> ${t('controls.loft')} · ${t('help.nearGoalShot')}</p><p><kbd>E</kbd> ${t('help.holdRelease')} ${t('controls.charge')}</p><p><kbd>SHIFT</kbd> ${t('controls.sprint')} <kbd>Q</kbd> ${t('controls.brace')}</p><p><kbd>Z</kbd> ${t('power.cannon')} · <kbd>C</kbd> ${t('power.magnet')} · <kbd>V</kbd> ${t('power.superJump')} · <kbd>B</kbd> ${t('power.freeze')} · <kbd>N</kbd> ${t('power.heal')}</p></div><div><h3>${t('controls.pause')}</h3><p><kbd>P</kbd> ${t('controls.pause')} <kbd>R</kbd> ${t('game.restart')} <kbd>F</kbd> ${t('game.fullscreen')}</p><p>${t('controls.loft')} · ${t('help.nearGoalShot')}</p><p><kbd>1</kbd>–<kbd>5</kbd> ${t('controls.abilities')}</p></div>`;
  $('#help-note').innerHTML=`<kbd>P</kbd> ${t('controls.pause')} · <kbd>R</kbd> ${t('game.restart')} · <kbd>F</kbd> ${t('game.fullscreen')}`;
}

function syncLocaleChrome() {
  refreshStadiumSlogans();
  const localeButton=$('#locale-btn');
  const targetLocale=getLocale()==='en'?'zh-CN':'en';
  localeButton.textContent=targetLocale==='zh-CN'?'中文':'EN';
  localeButton.setAttribute('aria-label',t('menu.localeToggle'));
  localeButton.title=t('language.label');
  syncTouchLabels();
  syncHelpDialog();
  skillBarSignature='';
  syncHUD(snapshot());
}

function refreshStadiumSlogans() {
  const locale=getLocale();
  if(locale===stadiumSloganLocale)return;
  stadiumSlogans=[t('canvas.goalSlogan'),t('canvas.sloganClassic'),t('canvas.kickHeadWin'),t('canvas.powerUp'),t('canvas.sloganWars')];
  stadiumSloganLocale=locale;
}

function syncTouchLabels() {
  const labels={
    blueLeft:['touch.left',null],blueRight:['touch.right',null],blueJump:['touch.jump',null],
    blueBrace:['touch.brace','touch.braceShort'],blueSlide:['touch.slide','touch.slideShort'],blueSprint:['touch.sprint','touch.sprintShort'],blueKick:['touch.shoot','touch.shootShort'],
    blueJab:['touch.jab','touch.jabShort'],blueLeg:['touch.leg','touch.legShort'],blueUppercut:['touch.uppercut','touch.uppercutShort'],blueSweep:['touch.sweep','touch.sweepShort'],
    bluePower1:['touch.cannon','touch.cannonShort'],bluePower2:['touch.magnet','touch.magnetShort'],bluePower3:['touch.superJump','touch.jumpShort'],bluePower4:['touch.freeze','touch.freezeShort'],bluePower5:['touch.heal','touch.healShort'],
  };
  Object.entries(labels).forEach(([control,[ariaKey,textKey]])=>{
    const button=$(`[data-control="${control}"]`);
    if(!button)return;
    button.setAttribute('aria-label',t(ariaKey));
    if(textKey)button.textContent=t(textKey);
  });
  const modeButton=$('#touch-mode-btn');
  modeButton.textContent=touchCombatMode?t('touch.ball'):'⚡';
  modeButton.setAttribute('aria-label',t(touchCombatMode?'touch.backFootball':'touch.showCombat'));
}

let skillBarSignature='';
let skillEnergySignature='';
function syncSkillBar(state) {
  const player=state.players?.[0];
  if(!player)return;
  const energy=Math.max(0,Math.min(100,player.power??0));
  const energyValue=$('#skill-energy-value');
  const energyFill=$('#skill-energy-fill');
  const localMatch=state.matchType==='local'&&state.rules!=='trials';
  const skillBar=$('.skill-bar');
  skillBar.dataset.matchType=localMatch?'local':'ai';
  $('.skill-bar-hint').textContent=t(localMatch?'hud.localSkillHint':'hud.soloSkillHint');
  $('.skill-bar-title').textContent=t('hud.skillTitle');
  $('.skill-energy-label').textContent=t('hud.skillEnergy');
  const energySignature=`${Math.round(energy)}`;
  if(energySignature!==skillEnergySignature){
    skillEnergySignature=energySignature;
    energyValue.textContent=`${energySignature} / 100`;
    energyFill.style.width=`${energy}%`;
  }
  const activeDurations=player.powerActive??[];
  const names=POWER_DEFINITIONS??[];
  const opponent=state.players?.[1];
  const freezeDistance=opponent?Math.hypot((opponent.x??0)-(player.x??0),(opponent.y??0)-(player.y??0)):Infinity;
  const signature=[Math.round(energy),state.mode,state.matchType,...names.map((definition,index)=>{
    const cooldown=player.powerCooldowns?.[index]??player.abilities?.[index]??0;
    const active=activeDurations[index]??0;
    const special=index===0?(player.cannonTime??0):index===1?(player.magnetTime??0):index===2?(player.superJumpTime??0):index===3?(state.players?.[1]?.freezeTime??0):(player.shieldTime??0);
    const gate=index===3?freezeDistance<=definition.range:index===4?player.health<100||player.stamina<100:true;
    return `${Math.ceil(cooldown*10)/10}:${Math.ceil(Math.max(active,special)*10)/10}:${gate}`;
  })].join('|');
  names.forEach((definition)=>{
    const cost=$(`[data-skill="${definition.id}"] .skill-cost`);
    const label=t('hud.skillCost',{cost:definition.cost});
    if(cost&&cost.textContent!==label)cost.textContent=label;
  });
  if(signature===skillBarSignature)return;
  skillBarSignature=signature;
  names.forEach((definition,index)=>{
    const button=$(`[data-skill="${definition.id}"]`);
    if(!button)return;
    const mainKey=button.querySelector('.skill-key-main');
    const alternate=button.querySelector('.skill-key small');
    if(mainKey)mainKey.textContent=localMatch?String(definition.id):(['Z','C','V','B','N'][index]);
    if(alternate)alternate.hidden=localMatch;
    const cooldown=player.powerCooldowns?.[index]??player.abilities?.[index]??0;
    const active=Math.max(activeDurations[index]??0,index===0?(player.cannonTime??0):index===1?(player.magnetTime??0):index===2?(player.superJumpTime??0):index===3?(state.players?.[1]?.freezeTime??0):(player.shieldTime??0));
    let stateText=t('hud.skillReady');
    if(index===0&&(player.cannonTime??0)>0)stateText=t('hud.armedShort',{seconds:player.cannonTime.toFixed(1)});
    else if(active>0)stateText=t('hud.activeSeconds',{seconds:active.toFixed(1)});
    else if(cooldown>0)stateText=t('hud.coolingSeconds',{seconds:cooldown.toFixed(cooldown<10?1:0)});
    else if(energy<definition.cost)stateText=t('hud.needMoreEnergy',{amount:Math.ceil(definition.cost-energy)});
    else if(definition.id===4&&freezeDistance>definition.range)stateText=t('hud.opponentFarShort');
    else if(definition.id===5&&player.health>=100&&player.stamina>=100)stateText=t('hud.healthFullShort');
    button.querySelector('.skill-status').textContent=stateText;
    const skillName=t(POWER_LOCALE_KEYS[index]);
    button.setAttribute('aria-label',`${skillName}, ${t('hud.skillCost',{cost:definition.cost})}, ${stateText}`);
    button.title=`${skillName} · ${t(`power.${['cannonCopy','magnetCopy','superJumpCopy','freezeCopy','healCopy'][index]}`)} · ${t('hud.skillCost',{cost:definition.cost})} · ${stateText}`;
    button.dataset.cooldown=cooldown>0?'true':'false';
    button.dataset.active=active>0?'true':'false';
    button.dataset.waiting=energy<definition.cost||definition.id===4&&freezeDistance>definition.range||definition.id===5&&player.health>=100&&player.stamina>=100?'true':'false';
  });
}

function drawStadium(state) {
  refreshStadiumSlogans();
  const w = canvas.width, h = canvas.height;
  const horizon = 260, railY = 490, fieldY = 520, floorY = state.coordinates?.floorY ?? 830;
  const goal=state.coordinates?.goal;
  const arena=state.arena??arenaName;
  const palette={night:{sky1:'#182345',sky2:'#42517d',far:'#28375e',near:'#202d50',stands:'#303649',rail:'#070a15',turf1:'#285c6a',turf2:'#183b56',turf3:'#101e37'},neon:{sky1:'#241b54',sky2:'#483575',far:'#3e3378',near:'#2e285d',stands:'#34334c',rail:'#100f23',turf1:'#25765e',turf2:'#145246',turf3:'#0b363b'}};
  const colors=palette[arena]??{sky1:'#70b8ec',sky2:'#c6e8ff',far:'#92afd0',near:'#7f9ebf',stands:'#737b89',rail:'#070c15',turf1:'#278846',turf2:'#147335',turf3:'#0d592e'};
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, colors.sky1); sky.addColorStop(1, colors.sky2);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
  drawCloud(300, 74, 92, 22); drawCloud(1020, 132, 145, 32); drawCloud(1370, 63, 88, 18);
  ctx.fillStyle = colors.far;
  ctx.beginPath(); ctx.moveTo(0, 205); ctx.lineTo(175, 135); ctx.lineTo(348, 212); ctx.lineTo(575, 130); ctx.lineTo(790, 221); ctx.lineTo(1005, 147); ctx.lineTo(1247, 218); ctx.lineTo(1465, 155); ctx.lineTo(1600, 208); ctx.lineTo(1600, 274); ctx.lineTo(0, 274); ctx.fill();
  ctx.fillStyle = colors.near; ctx.beginPath(); ctx.moveTo(0, 248); ctx.lineTo(197, 188); ctx.lineTo(411, 258); ctx.lineTo(634, 177); ctx.lineTo(874, 260); ctx.lineTo(1108, 194); ctx.lineTo(1306, 261); ctx.lineTo(1501, 202); ctx.lineTo(1600, 238); ctx.lineTo(1600, 280); ctx.lineTo(0, 280); ctx.fill();
  drawCrowd(0, 258, w, railY - 258, arena === 'neon' ? 3 : arena === 'night' ? 1 : 0, colors.stands);
  ctx.fillStyle = '#414754'; ctx.fillRect(0, railY - 10, w, 12);
  ctx.fillStyle = colors.rail; ctx.fillRect(0, railY, w, 34);
  ctx.font = '900 22px system-ui, sans-serif'; ctx.fillStyle = arena === 'neon' ? '#7dffc3' : '#31bf79'; ctx.textBaseline = 'middle';
  const positions = [110, 390, 705, 1040, 1320];
  stadiumSlogans.forEach((word, i) => ctx.fillText(word, positions[i], railY + 17));

  const turf = ctx.createLinearGradient(0, fieldY, 0, h);
  turf.addColorStop(0, colors.turf1); turf.addColorStop(.48, colors.turf2); turf.addColorStop(1, colors.turf3);
  ctx.fillStyle = turf; ctx.fillRect(0, fieldY + 34, w, h - fieldY);
  for (let x = 0; x < w; x += 22) { ctx.fillStyle = x % 44 ? '#ffffff08' : arena === 'neon' ? '#99ffdd17' : '#8aff3b0b'; ctx.fillRect(x, fieldY + 34, 11, h - fieldY); }
  ctx.strokeStyle = '#f3f7f0aa'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(w, floorY); ctx.moveTo(w/2, fieldY + 34); ctx.lineTo(w/2, floorY); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w/2, floorY - 28, 106, 42, 0, 0, Math.PI*2); ctx.stroke();
  if(goal){drawGoal(goal,floorY,'left');drawGoal(goal,floorY,'right');}

  const players = state.players ?? [];
  players.forEach((player,index)=>{
    if((player.magnetTime??0)>0&&state.ball)drawMagnetField(player,state.ball,index);
  });
  drawPlayer(players[0], '#287cf0', '#0f53bd', '1');
  drawPlayer(players[1], '#f34455', '#c7223a', '2');
  if (state.ball) drawBall(state.ball);
  if (state.particles?.length) state.particles.slice(0, 90).forEach(drawParticle);
}

function drawMagnetField(player,ball,index) {
  const dx=ball.x-player.x,dy=ball.y-(player.y-82),distance=Math.hypot(dx,dy);
  if(distance>545||distance<1)return;
  const strength=Math.max(.15,1-distance/545),direction=Math.atan2(dy,dx),pulse=.5+.5*Math.sin(sceneTime*9+index);
  ctx.save();ctx.globalAlpha=.2+strength*.25;ctx.strokeStyle=index===0?'#77f0dc':'#ffc66f';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(player.x,player.y-82,34+pulse*7,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=.22+strength*.35;ctx.setLineDash([9,11]);ctx.lineDashOffset=-sceneTime*34;
  ctx.beginPath();ctx.moveTo(player.x,player.y-82);ctx.quadraticCurveTo((player.x+ball.x)/2+Math.sin(sceneTime*3+index)*24,(player.y-82+ball.y)/2-48,ball.x,ball.y);ctx.stroke();
  ctx.setLineDash([]);ctx.fillStyle=index===0?'#8bffdf':'#ffdb87';ctx.globalAlpha=.7;
  for(let i=0;i<3;i++){const t=(sceneTime*1.3+i/3)%1;const x=player.x+dx*t,y=player.y-82+dy*t;ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

function drawCloud(x, y, width, height) {
  ctx.fillStyle = '#ffffff45';
  ctx.beginPath(); ctx.ellipse(x, y, width * .53, height, 0, 0, Math.PI*2); ctx.ellipse(x + width*.36, y+3, width*.4, height*.85, 0, 0, Math.PI*2); ctx.ellipse(x-width*.28,y+5,width*.32,height*.72,0,0,Math.PI*2);ctx.fill();
}

function drawCrowd(x, y, width, height, seed, base='#737b89') {
  const colors = ['#f0d94b','#f2f4ec','#2d9bdd','#34bb78','#e14a3e','#944aaa','#111722'];
  ctx.fillStyle = base; ctx.fillRect(x, y, width, height);
  const rowCount=Math.max(1,Math.floor(height/22));
  for (let row = 0; row < rowCount; row++) {
    const rowY = y + 8 + row * 22;
    ctx.fillStyle = row % 4 === 3 ? '#5a626f' : '#838b97'; ctx.fillRect(x, rowY + 14, width, 4);
    const shift = row % 2 ? 10 : 0;
    for (let col = 0; col < 114; col++) {
      const hash = (col * 71 + row * 113 + seed * 13) % 17;
      const cx = x + col * 15 + shift;
      ctx.fillStyle = colors[(col * 13 + row * 7 + hash) % colors.length];
      ctx.fillRect(cx, rowY + hash % 3, 5 + hash % 3, 7 + hash % 5);
      ctx.fillStyle = '#242c38'; ctx.fillRect(cx + 1, rowY - 3, 4, 3);
    }
  }
}

function drawGoal(geometry,floorY,side) {
  const {topY,bottomY,depth,leftLineX,rightLineX}=geometry;
  const left=side==='left';
  const lineX=left?leftLineX:rightLineX;
  const backX=left?Math.max(0,lineX-depth):Math.min(canvas.width,lineX+depth);
  const x=Math.min(lineX,backX),width=Math.abs(lineX-backX),height=bottomY-topY;
  if(width<=0||height<=0||floorY<=bottomY)return;
  ctx.save();
  ctx.lineJoin='round';ctx.lineCap='square';
  const frameHalf=8.5;
  const frameTop=topY-frameHalf,frameBottom=bottomY+frameHalf;
  const mouthFrameX=lineX+(left?frameHalf:-frameHalf);

  const netFill=ctx.createLinearGradient(x,topY,x+width,bottomY);
  netFill.addColorStop(0,'#071219ba');netFill.addColorStop(1,'#152a30a8');
  ctx.fillStyle=netFill;ctx.fillRect(x,topY,width,height);
  ctx.strokeStyle='#dff9f252';ctx.lineWidth=2;
  for(let i=1;i<7;i++){
    const strandX=x+width*i/7;
    ctx.beginPath();ctx.moveTo(strandX,topY+4);ctx.lineTo(strandX,bottomY-4);ctx.stroke();
  }
  for(let i=1;i<12;i++){
    const strandY=topY+height*i/12;
    ctx.beginPath();ctx.moveTo(x+3,strandY);ctx.lineTo(lineX,strandY);ctx.stroke();
  }
  ctx.strokeStyle='#efffff4d';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x,topY+6);ctx.lineTo(lineX,topY+20);ctx.moveTo(x,bottomY-5);ctx.lineTo(lineX,bottomY-20);ctx.stroke();

  const platformHeight=floorY-bottomY;
  const platform=ctx.createLinearGradient(0,bottomY,0,floorY);
  platform.addColorStop(0,'#348b49');platform.addColorStop(.16,'#28763e');platform.addColorStop(1,'#174b35');
  ctx.fillStyle=platform;ctx.fillRect(x,bottomY,width,platformHeight);
  ctx.fillStyle='#a6ef69';ctx.fillRect(x,bottomY,width,3);
  ctx.fillStyle='#4fbe62';ctx.fillRect(x,bottomY+3,width,7);
  ctx.strokeStyle='#b7dc865e';ctx.lineWidth=2;
  for(let row=1;row<Math.ceil(platformHeight/26);row++){
    const brickY=bottomY+8+row*26;
    if(brickY>=floorY)break;
    ctx.beginPath();ctx.moveTo(x,brickY);ctx.lineTo(x+width,brickY);ctx.stroke();
    const shift=row%2?width*.25:0;
    for(let col=0;col<4;col++){
      const brickX=x+shift+col*width/4;
      if(brickX>x&&brickX<x+width){ctx.beginPath();ctx.moveTo(brickX,brickY-25);ctx.lineTo(brickX,brickY);ctx.stroke();}
    }
  }
  ctx.fillStyle='#102d2b';ctx.fillRect(x,floorY-8,width,8);

  ctx.strokeStyle='#17252c';ctx.lineWidth=17;
  ctx.beginPath();ctx.moveTo(x,frameTop);ctx.lineTo(mouthFrameX,frameTop);ctx.lineTo(mouthFrameX,frameBottom);ctx.lineTo(x,frameBottom);ctx.closePath();ctx.stroke();
  ctx.strokeStyle='#f4f7fb';ctx.lineWidth=10;
  ctx.beginPath();ctx.moveTo(x,frameTop);ctx.lineTo(mouthFrameX,frameTop);ctx.lineTo(mouthFrameX,frameBottom);ctx.lineTo(x,frameBottom);ctx.closePath();ctx.stroke();
  ctx.strokeStyle='#aeeaff';ctx.lineWidth=2;
  const frontAccentX=mouthFrameX+(left?-1:1);
  ctx.beginPath();ctx.moveTo(x,frameTop+1);ctx.lineTo(frontAccentX,frameTop+1);ctx.lineTo(frontAccentX,frameBottom-1);ctx.stroke();
  ctx.fillStyle='#fff';
  for(const [jointX,jointY] of [[x,frameTop],[mouthFrameX,frameTop],[mouthFrameX,frameBottom],[x,frameBottom]]){
    ctx.beginPath();ctx.arc(jointX,jointY,7,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#30434c';ctx.lineWidth=2;ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(player, cap, shirt, fallbackNumber) {
  if (!player || player.active === false) return;
  const x = player.x, feet = player.y, facing = player.facing ?? 1;
  const pose=getPlayerRenderPose(player,sceneTime);
  const {airborne,lean,localShiftX}=pose;
  const head=pose.headLocal;
  const now=sceneTime*1000, speed=Math.min(1,Math.abs(player.vx??0)/360), phase=sceneTime*(player.sprint?11:8)+(player.number??0);
  const kickT=player.kick>0?1-player.kick/.34:0, kickPhase=Math.sin(Math.min(1,kickT*1.45)*Math.PI/2), kickLift=kickPhase*30, kickReach=kickPhase*52;
  const skin='#e9ad83', dark='#182235', boot='#f3f6f8';
  ctx.save(); ctx.translate(x, feet); ctx.scale(pose.scale,pose.scale);
  ctx.fillStyle='#071a1688'; ctx.beginPath(); ctx.ellipse(0, 2, 39*(1-airborne*.28), 8, 0, 0, Math.PI*2); ctx.fill();
  ctx.translate(localShiftX,0);

  if((player.superJumpTime??0)>0&&airborne>.05){
    ctx.save();ctx.globalAlpha=.11+.1*Math.sin(now/45);ctx.fillStyle=cap;
    [-1,-2,-3].forEach((trail)=>{const offset=trail*13;ctx.beginPath();ctx.roundRect(-31,-143+airborne*3+offset,62,79,17);ctx.fill();ctx.beginPath();ctx.ellipse(head.x,head.y+offset,23,28,0,0,Math.PI*2);ctx.fill();});ctx.restore();
  }

  const stride=Math.sin(phase)*speed*(1-airborne*.55);
  ctx.lineCap='round';
  const kickPose=player.kick>0;
  const legs=kickPose
    ? [
        { hipX:-facing*11, kneeX:-facing*18, kneeY:-34, ankleX:-facing*22, ankleY:-5, shoeAngle:-.12 },
        { hipX:facing*10, kneeX:facing*(18+kickReach*.28), kneeY:-35-kickLift*.18, ankleX:facing*(34+kickReach*.34), ankleY:-14-kickLift*.66, shoeAngle:facing*(-.04-kickPhase*.12) },
      ]
    : [
        { hipX:-12, kneeX:-17+stride*17-airborne*4, kneeY:-34-airborne*9, ankleX:-19+stride*27-airborne*10, ankleY:-5-airborne*18, shoeAngle:-.12-stride*.12 },
        { hipX:12, kneeX:17-stride*17+airborne*4, kneeY:-34-airborne*9, ankleX:19-stride*27+airborne*10, ankleY:-5-airborne*18, shoeAngle:.12+stride*.12 },
      ];
  legs.forEach((leg) => {
    const drawLeg=(stroke,width)=>{ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(leg.hipX,-58);ctx.lineTo(leg.kneeX,leg.kneeY);ctx.lineTo(leg.ankleX,leg.ankleY);ctx.stroke();};
    drawLeg(dark,20);drawLeg(shirt,13);
    ctx.save();ctx.translate(leg.ankleX,leg.ankleY+3);ctx.rotate(leg.shoeAngle);ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(0,0,14,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=boot;ctx.beginPath();ctx.ellipse(1,-1,11,6,0,0,Math.PI*2);ctx.fill();ctx.restore();
  });

  ctx.fillStyle=dark;ctx.beginPath();ctx.roundRect(-37,-145+airborne*3,74,92,20);ctx.fill();
  ctx.fillStyle=shirt;ctx.beginPath();ctx.roundRect(-34,-148+airborne*3,68,89,18);ctx.fill();
  ctx.fillStyle=cap;ctx.fillRect(-29,-143+airborne*3,8,67);ctx.fillRect(21,-143+airborne*3,8,67);
  ctx.fillStyle='#ffffffee';ctx.font='900 35px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(player.number ?? fallbackNumber,0,-107+airborne*3);
  const chargePose=(player.charge??0)>.05;
  const drawArms=(stroke,width)=>{
    ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();
    if(kickPose){ctx.moveTo(-28,-128);ctx.lineTo(-38,-100-kickPhase*16);ctx.lineTo(-49,-89-kickPhase*16);ctx.moveTo(28,-128);ctx.lineTo(38,-100-kickPhase*8);ctx.lineTo(49,-87-kickPhase*8);}
    else if(player.brace){ctx.moveTo(-28,-128);ctx.lineTo(-23,-105);ctx.lineTo(-5,-117);ctx.moveTo(28,-128);ctx.lineTo(23,-105);ctx.lineTo(5,-117);}
    else if(chargePose){ctx.moveTo(-28,-128);ctx.lineTo(-42,-146-player.charge*12);ctx.lineTo(-48,-154-player.charge*16);ctx.moveTo(28,-128);ctx.lineTo(42,-146-player.charge*12);ctx.lineTo(48,-154-player.charge*16);}
    else{ctx.moveTo(-28,-128);ctx.lineTo(-38+stride*15,-100);ctx.lineTo(-32+stride*20,-74);ctx.moveTo(28,-128);ctx.lineTo(38-stride*15,-100);ctx.lineTo(32-stride*20,-74);}
    ctx.stroke();
  };
  drawArms(dark,19);drawArms(skin,13);

  ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(head.x,head.y,head.rx,head.ry,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(head.x-24,head.y-11);ctx.quadraticCurveTo(head.x-27,head.y-39,head.x+2,head.y-36);ctx.quadraticCurveTo(head.x+29,head.y-32,head.x+27,head.y-5);ctx.lineTo(head.x+20,head.y-17);ctx.lineTo(head.x+12,head.y-7);ctx.lineTo(head.x+6,head.y-22);ctx.lineTo(head.x-3,head.y-7);ctx.lineTo(head.x-12,head.y-21);ctx.lineTo(head.x-19,head.y-4);ctx.closePath();ctx.fill();
  ctx.fillStyle=cap;ctx.fillRect(head.x-25,head.y-8,50,7);
  const eyeX=head.x+facing*10;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(eyeX,head.y+2,7,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#192335';ctx.beginPath();ctx.arc(eyeX+facing*2,head.y+3,3.4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=dark;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(eyeX-7,head.y-11);ctx.lineTo(eyeX+8,head.y-14);ctx.stroke();
  ctx.strokeStyle='#874f40';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(head.x+facing*7,head.y+20);ctx.lineTo(head.x+facing*17,head.y+18);ctx.stroke();
  if (player.charge > 0.05 || player.super > 0 || player.shieldTime > 0 || player.cannonTime > 0 || player.magnetTime > 0 || player.superJumpTime > 0) { const glow=player.shieldTime>0?'#68e789':player.cannonTime>0?'#ffe57a':player.magnetTime>0?'#74eee0':'#c6ff6b';ctx.strokeStyle=glow;ctx.lineWidth=4;ctx.globalAlpha=.82;ctx.beginPath();ctx.arc(0,-103,53+Math.sin(now/65)*5,0,Math.PI*2);ctx.stroke();ctx.fillStyle=glow;ctx.globalAlpha=.95;ctx.fillRect(-34,-225,68,6);ctx.fillStyle='#111722';ctx.fillRect(-33,-224,66,4);ctx.fillStyle=glow;ctx.fillRect(-33,-224,66*Math.max(player.charge??0,(player.super>0||player.shieldTime>0||player.cannonTime>0||player.magnetTime>0||player.superJumpTime>0)?.25:0),4);}
  if(player.freezeTime>0){ctx.save();ctx.globalAlpha=.78;ctx.strokeStyle='#9cecff';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(-39,-152+airborne*3,78,101,21);ctx.stroke();ctx.fillStyle='#b8f1ff';[[-32,-151],[31,-145],[-34,-65],[34,-58]].forEach(([cx,cy])=>{ctx.beginPath();ctx.moveTo(cx,cy-8);ctx.lineTo(cx+7,cy);ctx.lineTo(cx,cy+8);ctx.lineTo(cx-7,cy);ctx.closePath();ctx.fill();});ctx.restore();}
  if(player.shieldTime>0){ctx.save();ctx.globalAlpha=.9;ctx.fillStyle='#a0ffb6';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.fillText('+',0,-230);ctx.restore();}
  if(player.downTime>0){ctx.globalAlpha=.8;ctx.fillStyle='#18202b';ctx.fillRect(-22,-128,44,8);ctx.fillStyle='#fff';ctx.fillText('DOWN',0,-173);}
  ctx.restore();
}

function drawBall(ball) {
  const speed=Math.hypot(ball.vx??0,ball.vy??0);
  ctx.save();ctx.translate(ball.x,ball.y);
  if(performance.now()<cannonTrailUntil&&speed>20){
    const angle=Math.atan2(ball.vy??0,ball.vx??0),length=Math.min(128,42+speed*.12),hot=cannonTrailSide==='blue'?'#62e8ff':'#ffc05f';
    ctx.save();ctx.rotate(angle);ctx.globalCompositeOperation='lighter';
    const flame=ctx.createLinearGradient(-length,0,8,0);flame.addColorStop(0,'#78dfff00');flame.addColorStop(.42,hot+'aa');flame.addColorStop(.82,'#fff1a8');flame.addColorStop(1,'#ffffff');
    ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(-length,-4);ctx.quadraticCurveTo(-length*.62,-15,-15,-9);ctx.lineTo(7,0);ctx.lineTo(-15,9);ctx.quadraticCurveTo(-length*.62,15,-length,-4);ctx.fill();
    ctx.strokeStyle=hot;ctx.globalAlpha=.9;ctx.lineWidth=3;for(let i=0;i<3;i++){const y=-9+i*9;ctx.beginPath();ctx.moveTo(-length*.78,y);ctx.lineTo(-15,y+(i-1)*5);ctx.stroke();}ctx.restore();
  }
  if(speed>240){ctx.save();ctx.rotate(Math.atan2(ball.vy??0,ball.vx??0)+Math.PI);ctx.globalAlpha=Math.min(.72,(speed-180)/800);for(let i=0;i<4;i++){ctx.strokeStyle=i%2?'#e4fbff':'#ffffff';ctx.lineWidth=3-i*.4;ctx.beginPath();ctx.moveTo(22,-16+i*10);ctx.lineTo(58+i*15,-16+i*16);ctx.stroke();}ctx.restore();}
  if(speed>420){ctx.globalAlpha=.17;for(let i=3;i>=1;i--){ctx.fillStyle='#f5fbff';ctx.beginPath();ctx.arc(-ball.vx*.022*i,-ball.vy*.022*i,25-i*3,0,Math.PI*2);ctx.fill();}}
  ctx.globalAlpha=1;ctx.rotate(ball.spin ?? 0);
  ctx.fillStyle='#090e1788';ctx.beginPath();ctx.ellipse(4,35,34,10,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(0,0,32,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c7d1dc';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#202735';
  const pentagon=(cx,cy,r,rotation)=>{ctx.beginPath();for(let i=0;i<5;i++){const angle=rotation+i*Math.PI*2/5;const px=cx+Math.cos(angle)*r,py=cy+Math.sin(angle)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fill();};
  pentagon(0,0,10,-Math.PI/2);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5-.8;pentagon(Math.cos(a)*21,Math.sin(a)*21,7,a);}
  ctx.restore();
}

function recordGhostFrame(dt, state) {
  if (!matchStarted || state.mode !== 'playing') return;
  ghostClock += dt;
  ghostSampleClock += dt;
  if (ghostSampleClock < 0.1) return;
  ghostSampleClock %= 0.1;
  const players=(state.players??[]).map(({x,y,facing})=>({x,y,facing}));
  ghostRecording.push({time:ghostClock,players,ball:{x:state.ball.x,y:state.ball.y}});
}

function ghostAt(time) {
  if (!ghostPlayback?.length) return null;
  const track=ghostPlayback;
  let nextIndex=track.findIndex(frame=>frame.time>=time);
  if(nextIndex<0)nextIndex=track.length-1;
  const next=track[nextIndex],prior=track[Math.max(0,nextIndex-1)];
  const span=Math.max(.001,next.time-prior.time),t=Math.max(0,Math.min(1,(time-prior.time)/span));
  const lerp=(a,b)=>a+(b-a)*t;
  return {players:next.players.map((player,index)=>({...player,x:lerp(prior.players[index]?.x??player.x,player.x),y:lerp(prior.players[index]?.y??player.y,player.y)})),ball:{x:lerp(prior.ball?.x??next.ball.x,next.ball.x),y:lerp(prior.ball?.y??next.ball.y,next.ball.y)}};
}

function drawParticle(particle) {
  ctx.globalAlpha = Math.max(0, particle.life ?? 0.6);ctx.fillStyle=particle.color ?? '#d8ff69';ctx.fillRect(particle.x-3,particle.y-3,6,6);ctx.globalAlpha=1;
}

function render() {
  const state = snapshot();
  sceneTime=state.elapsed??sceneTime;
  const scene=state.mode==='replay'&&state.renderState?{...state,...state.renderState}:state;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#71889e';ctx.fillRect(0,0,canvas.width,canvas.height);
  const shakeAge=(performance.now()-lastImpactAt)/1000;
  const shake=shakeAge>=.14?0:Math.sin(shakeAge*120)*impactStrength*(1-shakeAge/.14);
  ctx.save();ctx.translate(shake,Math.sin(shakeAge*87)*shake*.32);ctx.translate(0,-46);ctx.scale(1,1.12);
  drawStadium(scene);
  if(rulesName==='ghost'&&ghostPlayback?.length&&matchStarted){const elapsed=(state.duration??60)-(state.remaining??60);const ghost=ghostAt(elapsed);if(ghost){ctx.save();ctx.globalAlpha=.38;drawPlayer(ghost.players[0],'#ecfaff','#cad9e9','G');ctx.globalAlpha=.52;drawBall({...ghost.ball,spin:0});ctx.restore();}}
  if(state.rules==='trials'&&state.trial?.targets?.length){const target=state.trial.targets[0];ctx.save();ctx.strokeStyle='#c4ff72';ctx.lineWidth=5;ctx.beginPath();ctx.arc(target.x,target.y,target.radius,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#eaffd4';ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.fillText(`${state.trial.points??0}`,target.x,target.y+7);ctx.restore();}
  ctx.beginPath();
  ctx.restore();
  syncHUD(state);
}

function frame(now) {
  if (!manualStepping) {
    const dt = previousFrame ? Math.min((now - previousFrame) / 1000, 0.04) : 0;
    previousFrame = now;
    if (dt > 0 && !document.hidden && matchStarted && now >= hitStopUntil) tickGame(dt);
  }
  render();
  animationId = requestAnimationFrame(frame);
}

function startOrResume() {
  const state = snapshot();
  if (state.mode === 'paused') { clearInput(); game.togglePause(); }
}

function restart() {
  clearInput();
  manualStepping=false;previousFrame=0;hitStopUntil=0;lastImpactAt=0;impactStrength=0;cannonTrailUntil=0;ghostRecording=[];ghostClock=0;ghostSampleClock=0;
  if (matchStarted) game.restart();
}

const soloKeyMap = {
  KeyA: 'blueLeft', ArrowLeft: 'blueLeft', KeyD: 'blueRight', ArrowRight: 'blueRight',
  KeyW: 'blueJump', ArrowUp: 'blueJump', KeyS: 'blueSlide', ArrowDown: 'blueSlide',
  Space: 'blueQuickKick', KeyX: 'blueQuickKick', KeyE: 'blueKick', Enter: 'blueKick',
  KeyQ: 'blueBrace', ShiftLeft: 'blueSprint',
  Numpad6: 'blueJab', Numpad7: 'blueLeg', Numpad8: 'blueUppercut', Numpad9: 'blueSweep',
  Digit1: 'bluePower1', Digit2: 'bluePower2', Digit3: 'bluePower3', Digit4: 'bluePower4', Digit5: 'bluePower5',
  KeyZ: 'bluePower1', KeyC: 'bluePower2', KeyV: 'bluePower3', KeyB: 'bluePower4', KeyN: 'bluePower5'
};
const localKeyMap = {
  KeyA: 'blueLeft', ArrowLeft: 'redLeft', KeyD: 'blueRight', ArrowRight: 'redRight',
  KeyW: 'blueJump', ArrowUp: 'redJump', Space: 'blueQuickKick', KeyE: 'blueKick', Enter: 'redKick',
  KeyQ: 'blueBrace', Slash: 'redBrace', ShiftLeft: 'blueSprint', ShiftRight: 'redSprint',
  KeyS: 'blueSlide', ArrowDown: 'redSlide',
  Numpad6: 'blueJab', Numpad7: 'blueLeg', Numpad8: 'blueUppercut', Numpad9: 'blueSweep',
  KeyZ: 'blueJab', KeyX: 'blueLeg', KeyC: 'blueUppercut', KeyV: 'blueSweep',
  KeyI: 'redJab', KeyO: 'redLeg', KeyK: 'redUppercut', KeyL: 'redSweep',
  Digit1: 'bluePower1', Digit2: 'bluePower2', Digit3: 'bluePower3', Digit4: 'bluePower4', Digit5: 'bluePower5',
  Digit6: 'redPower1', Digit7: 'redPower2', Digit8: 'redPower3', Digit9: 'redPower4', Digit0: 'redPower5'
};

function shouldLeaveKeyboardToPage(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return true;
  const control = target.closest('button, a[href], [role="button"]');
  if (!control) return false;
  return !control.closest('#game-root') || event.code === 'Enter' || event.code === 'Space';
}

function getKeyboardAction(code, state = snapshot()) {
  if (!matchStarted || state.mode !== 'playing') return null;
  const localMatch = state.matchType === 'local' && state.rules !== 'trials';
  return (localMatch ? localKeyMap : soloKeyMap)[code] ?? null;
}

function holdKeyboardAction(code, action) {
  if (heldKeyActions.has(code)) return false;
  heldKeyActions.set(code, action);
  if (!heldActionCodes.has(action)) heldActionCodes.set(action, new Set());
  const codes = heldActionCodes.get(action);
  if (!codes.size) actionDownAt[action] = performance.now();
  codes.add(code);
  input[action] = true;
  return true;
}

function releaseKeyboardAction(code) {
  const action = heldKeyActions.get(code);
  if (!action) return;
  heldKeyActions.delete(code);
  const codes = heldActionCodes.get(action);
  codes?.delete(code);
  if (!codes?.size) {
    input[action] = false;
    heldActionCodes.delete(action);
    if ((action === 'blueKick' || action === 'redKick') && performance.now() - (actionDownAt[action] ?? 0) < 160) {
      edgePulses[action === 'blueKick' ? 'blueQuickKick' : 'redQuickKick'] = true;
    }
    delete actionDownAt[action];
  }
}

window.addEventListener('keydown', (event) => {
  if (shouldLeaveKeyboardToPage(event)) return;
  const mapped = getKeyboardAction(event.code);
  if (mapped) {
    event.preventDefault();
    const firstPress = holdKeyboardAction(event.code, mapped);
    if (firstPress && !event.repeat) {
      edgePulses[mapped] = true;
    }
    manualStepping = false;
    previousFrame = 0;
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (snapshot().mode === 'playing' || snapshot().mode === 'paused') { event.preventDefault(); clearInput(); game.togglePause(); }
  }
  if (event.code === 'KeyR' && matchStarted) { event.preventDefault(); restart(); }
  if (event.code === 'KeyF' && matchStarted) { event.preventDefault(); toggleFullscreen(); }
});
window.addEventListener('keyup', (event) => {
  const action = heldKeyActions.get(event.code);
  if (action) { if (!shouldLeaveKeyboardToPage(event)) event.preventDefault(); releaseKeyboardAction(event.code); }
});
$('#game-root').addEventListener('click', (event) => {
  if (event.detail <= 0) return;
  const gameControl = event.target instanceof Element ? event.target.closest('.skill-button, #pause-btn, #restart-btn') : null;
  if (gameControl) requestAnimationFrame(() => gameControl.blur());
});
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); previousFrame=0; } });
function clearInput(){Object.keys(input).forEach((key)=>input[key]=false);Object.keys(edgePulses).forEach((key)=>edgePulses[key]=false);Object.keys(actionDownAt).forEach((key)=>delete actionDownAt[key]);heldKeyActions.clear();heldActionCodes.clear();game.cancelInput();document.querySelectorAll('.touch-button.active').forEach((button)=>button.classList.remove('active'));}

document.querySelectorAll('[data-control]').forEach((button) => {
  const control = button.dataset.control;
  let pointerStarted=0;
  const release = (event) => { event.preventDefault(); input[control] = false;if(control==='blueKick'&&performance.now()-pointerStarted<160)edgePulses.blueQuickKick=true;button.classList.remove('active'); };
  button.addEventListener('pointerdown', (event) => { event.preventDefault();pointerStarted=performance.now();manualStepping=false;button.setPointerCapture?.(event.pointerId);input[control]=true;edgePulses[control]=true;button.classList.add('active'); });
  button.addEventListener('pointerup', release);button.addEventListener('pointercancel', release);button.addEventListener('lostpointercapture', release);
});
$('#start-btn').addEventListener('click', startOrResume);
$('#pause-btn').addEventListener('click', () => { if (snapshot().mode === 'playing' || snapshot().mode === 'paused') { clearInput();game.togglePause(); } });
$('#restart-btn').addEventListener('click', restart);
$('#sound-btn').addEventListener('click', () => { menu.setSetting('soundVolume', soundVolume > 0 ? 0 : 0.65); if (soundEnabled) playSound('start'); });
$('#controls-btn').addEventListener('click', () => { clearInput(); $('#help-dialog').showModal(); });
document.querySelector('[data-close-dialog]').addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', (event) => { if (event.target === $('#help-dialog')) $('#help-dialog').close(); });
$('#fullscreen-btn').addEventListener('click', toggleFullscreen);
$('#menu-btn').addEventListener('click', () => { clearInput();if(snapshot().mode==='playing')game.togglePause();$('#game-root').hidden=true;menu.show();matchStarted=false; });
$('#touch-mode-btn').addEventListener('click', () => { touchCombatMode=!touchCombatMode;const controls=$('.action-cluster');controls.classList.toggle('combat-mode',touchCombatMode);$('.touch-controls').dataset.mode=touchCombatMode?'combat':'basic';const button=$('#touch-mode-btn');button.textContent=touchCombatMode?t('touch.ball'):'⚡';button.setAttribute('aria-label',t(touchCombatMode?'touch.backFootball':'touch.showCombat')); });
$('#locale-btn').addEventListener('click', () => setLocale(getLocale()==='en'?'zh-CN':'en'));
function toggleFullscreen(){ if(document.fullscreenElement)document.exitFullscreen?.();else document.querySelector('.game-shell').requestFullscreen?.(); }
document.addEventListener('fullscreenchange', () => { const full=Boolean(document.fullscreenElement);$('#fullscreen-btn').setAttribute('aria-label',t(full?'game.exitFullscreen':'game.enterFullscreen'));$('#fullscreen-btn').title=t(full?'game.exitFullscreen':'game.fullscreen'); });

function startGame(options={}) {
  const settings=menu.getSettings?.()??{};
  const matchOptions={matchType:'ai',difficulty:'normal',duration:60,rules:'classic',arena:'classic',...options};
  arenaName=matchOptions.arena;rulesName=matchOptions.rules;soundVolume=settings.soundVolume??0;soundEnabled=soundVolume>0;
  menuMatchId=matchOptions.matchId??null;ghostPlayback=matchOptions.rules==='ghost'?menu.getGhostTrack?.():null;ghostRecording=[];ghostClock=0;ghostSampleClock=0;
  cannonTrailUntil=0;
  syncSoundControl();
  clearInput();manualStepping=false;previousFrame=0;
  menu.hide();$('#game-root').hidden=false;matchStarted=true;
  game.start(matchOptions);
  const startHint=t(matchOptions.matchType==='local'?'startHint.local':'startHint.solo');
  const message=$('#match-message');message.textContent=startHint;message.style.color='';message.style.borderColor='';message.style.boxShadow='';message.classList.add('visible');clearTimeout(eventTimer);eventTimer=setTimeout(()=>message.classList.remove('visible'),2400);
}
function applySettings(settings={}) {
  soundVolume=settings.soundVolume??0;soundEnabled=soundVolume>0;
  syncSoundControl();
}
function syncSoundControl(){ $('#sound-btn').setAttribute('aria-label',t(soundEnabled?'game.soundOff':'game.soundOn'));$('#sound-btn').title=t(soundEnabled?'game.soundEnabled':'game.soundDisabled');$('#sound-btn').style.color=soundEnabled?'#c6ff6b':''; }
function applyCosmetic(cosmetic={}) { window.__footballCosmetic=cosmetic; }

window.render_game_to_text = () => JSON.stringify({ coordinateSystem: 'origin top-left; x increases right, y increases down', ...snapshot() });
window.advanceTime = (ms) => {
  manualStepping = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let step=0; step<steps; step++) tickGame(1/60);
  render();
};
function tickGame(dt){const frameInput={...input};for(const [key,pressed]of Object.entries(edgePulses))if(pressed)frameInput[key]=true;game.update(dt,frameInput);Object.keys(edgePulses).forEach((key)=>edgePulses[key]=false);recordGhostFrame(dt,snapshot());}
window.__footballGame = game;
applyLocale(document);
syncLocaleChrome();
menu.show();
render();
subscribeLocale(() => {
  applyLocale(document);
  syncLocaleChrome();
  const localeButton=$('#locale-btn');
  localeButton.textContent=getLocale()==='en'?'中文':'EN';
  localeButton.setAttribute('aria-label',t('menu.localeToggle'));
});
animationId = requestAnimationFrame(frame);
