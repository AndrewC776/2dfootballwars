const WIDTH = 1600;
const HEIGHT = 900;
const FLOOR_Y = 830;
const BALL_RADIUS = 32;
export const PLAYER_HALF_WIDTH = 46;
export const PLAYER_RENDER_SCALE = 1.24;
const FIXED_STEP = 1 / 120;
const REPLAY_SECONDS = 2;
const REPLAY_SAMPLE_STEP = 1 / 30;
const PLAYER_MOVE_SPEED = 520;
const PLAYER_MOVE_ACCEL = 2500;
const PLAYER_TURN_ACCEL = 8000;
const PLAYER_STOP_DECEL = 6000;
const PLAYER_SLIDE_STOP_DECEL = 185;
const BALL_GROUND_FRICTION = 0.985;
let MATCH_SEQUENCE = 0;

export const GOAL_GEOMETRY = Object.freeze({
  topY: 210,
  bottomY: 650,
  depth: 220,
  leftLineX: 220,
  rightLineX: WIDTH - 220,
});

const CROSSBAR_Y = GOAL_GEOMETRY.topY;
const GOAL_BALL_TOP = GOAL_GEOMETRY.topY + BALL_RADIUS;
const GOAL_BALL_BOTTOM = GOAL_GEOMETRY.bottomY - BALL_RADIUS;

export const POWER_DEFINITIONS = [
  { id: 1, name: 'Cannon Shot', cost: 35, cooldown: 8, duration: 7, range: 220, description: 'Fire a powered shot now, or arm your next kick.' },
  { id: 2, name: 'Magnet', cost: 20, cooldown: 11, duration: 2.5, range: 520, description: 'Pull the ball toward you.' },
  { id: 3, name: 'Sky Jump', cost: 15, cooldown: 9, duration: 5, range: null, description: 'Leap upward and gain an extra air jump.' },
  { id: 4, name: 'Freeze', cost: 25, cooldown: 14, duration: 2, range: 500, description: 'Freeze a nearby opponent.' },
  { id: 5, name: 'Heal', cost: 20, cooldown: 15, duration: 0, range: null, description: 'Restore health and stamina.' },
];

const INPUT_KEYS = [
  'blueLeft', 'blueRight', 'blueJump', 'blueKick', 'bluePower',
  'blueQuickKick',
  'redLeft', 'redRight', 'redJump', 'redKick', 'redPower',
  'redQuickKick',
  'blueSprint', 'blueSlide', 'blueBrace', 'blueJab', 'blueLeg', 'blueUppercut', 'blueSweep',
  'redSprint', 'redSlide', 'redBrace', 'redJab', 'redLeg', 'redUppercut', 'redSweep',
  'bluePower1', 'bluePower2', 'bluePower3', 'bluePower4', 'bluePower5',
  'redPower1', 'redPower2', 'redPower3', 'redPower4', 'redPower5',
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value < target
  ? Math.min(value + amount, target)
  : Math.max(value - amount, target);

export function getPlayerRenderPose(player, elapsed = 0) {
  const facing = player.facing ?? 1;
  const speed = Math.min(1, Math.abs(player.vx ?? 0) / 360);
  const airborne = clamp((FLOOR_Y - player.y) / 135, 0, 1);
  const phase = elapsed * (player.sprint ? 11 : 8) + (player.number ?? 0);
  const kickT = player.kick > 0 ? 1 - player.kick / 0.34 : 0;
  const kickPhase = Math.sin(Math.min(1, kickT * 1.45) * Math.PI / 2);
  const lean = -(player.charge ?? 0) * 10
    + (player.kick > 0 ? facing * 19 : Math.sin(phase) * speed * 5);
  const localShiftX = -facing * lean;
  const headLocal = { x: 0, y: -173 + airborne * 7, rx: 26, ry: 31 };
  const torsoLocal = { x: 0, y: -103.5 + airborne * 3, halfWidth: 34, halfHeight: 44.5 };
  const renderX = player.x + localShiftX * PLAYER_RENDER_SCALE;
  const headWorld = {
    x: renderX + headLocal.x * PLAYER_RENDER_SCALE,
    y: player.y + headLocal.y * PLAYER_RENDER_SCALE,
    rx: headLocal.rx * PLAYER_RENDER_SCALE,
    ry: headLocal.ry * PLAYER_RENDER_SCALE,
  };
  const torsoWorld = {
    x: renderX + torsoLocal.x * PLAYER_RENDER_SCALE,
    y: player.y + torsoLocal.y * PLAYER_RENDER_SCALE,
    halfWidth: torsoLocal.halfWidth * PLAYER_RENDER_SCALE,
    halfHeight: torsoLocal.halfHeight * PLAYER_RENDER_SCALE,
  };
  return { scale: PLAYER_RENDER_SCALE, airborne, lean, localShiftX, headLocal, headWorld, torsoLocal, torsoWorld };
}

function shotFitsGoal(ball, distance, horizontalSpeed, verticalSpeed) {
  if (horizontalSpeed <= 0) return false;
  const travelTime = distance / horizontalSpeed;
  if (travelTime > 2.2) return false;
  const y = ball.y + Math.min(ball.vy, verticalSpeed) * travelTime + 525 * travelTime ** 2;
  return y >= GOAL_BALL_TOP && y <= GOAL_BALL_BOTTOM;
}

function minimumAICharge(ball, distance, horizontalBonus = 0, verticalBonus = 0) {
  for (let charge = 0; charge <= 1.001; charge += 0.025) {
    const normalizedCharge = Math.min(1, charge);
    const speed = 500 + 370 * normalizedCharge + horizontalBonus;
    const vertical = -540 - 220 * normalizedCharge - verticalBonus;
    if (shotFitsGoal(ball, distance, speed, vertical)) return normalizedCharge;
  }
  return null;
}

function playerHorizontalBounds(player) {
  const onGoalPlatform = player.y > GOAL_GEOMETRY.bottomY + 0.01;
  return {
    minX: onGoalPlatform && player.x < GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
      ? GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
      : 90,
    maxX: onGoalPlatform && player.x > GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH
      ? GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH
      : WIDTH - 90,
  };
}

function freshPlayer(x, facing, number) {
  return {
    x,
    y: FLOOR_Y,
    active: true,
    vx: 0,
    vy: 0,
    facing,
    kick: 0,
    jump: 0,
    power: 35,
    super: 0,
    cannonTime: 0,
    number,
    kickCooldown: 0,
    wasGrounded: true,
    health: 100,
    stamina: 100,
    jumpsUsed: 0,
    charge: 0,
    attack: { type: '', time: 0 },
    downTime: 0,
    brace: false,
    sprint: false,
    slideTime: 0,
    freezeTime: 0,
    shieldTime: 0,
    magnetTime: 0,
    superJumpTime: 0,
    hurtCooldown: 0,
    attackCooldown: 0,
    aiRepositionAfterBlock: false,
    aiRetreatTargetX: null,
    aiJumpCooldown: 0,
    aiLastQuickBlockId: 0,
    abilities: [0, 0, 0, 0, 0],
  };
}

function cloneFrame(state) {
  return {
    players: state.players.map((player) => ({ ...player, attack: { ...player.attack }, abilities: [...player.abilities] })),
    ball: { ...state.ball },
    particles: state.particles.map((particle) => ({ ...particle })),
  };
}

export class FootballGame {
  constructor({ onEvent } = {}) {
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.options = { matchType: 'ai', difficulty: 'normal', duration: 60 };
    this.matchId = this.createMatchId();
    this.pauseMode = 'playing';
    this.accumulator = 0;
    this.replayFrames = [];
    this.replaySampleClock = 0;
    this.pendingEdges = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
    this.pendingReleases = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
    this.previousInput = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
    this.state = this.makeInitialState();
  }

  makeInitialState() {
    const localRedKickoff = this.options.matchType === 'local' && MATCH_SEQUENCE % 2 === 0;
    const blueX = 470;
    const redX = 1130;
    const ballX = localRedKickoff ? WIDTH - 540 : 540;
    return {
      matchId: this.matchId,
      mode: 'ready',
      matchType: this.options.matchType,
      difficulty: this.options.difficulty,
      duration: this.options.duration,
      remaining: this.options.duration,
      elapsed: 0,
      score: [0, 0],
      players: [freshPlayer(blueX, localRedKickoff ? -1 : 1, 1), freshPlayer(redX, localRedKickoff ? 1 : -1, 2)],
      ball: { x: ballX, y: FLOOR_Y - BALL_RADIUS, vx: 0, vy: 0, spin: 0, ignoredPlayer: -1, ignorePlayerTime: 0, scrumTime: 0, scrumCooldown: 0, scrumReleaseCount: 0, kickSequence: 0, blockedKickId: 0 },
      aiKickoffDelay: this.options.matchType === 'ai' ? 0.85 : 0,
      particles: [],
      coordinates: { width: WIDTH, height: HEIGHT, origin: 'top-left', xAxis: 'right', yAxis: 'down', floorY: FLOOR_Y, crossbarY: CROSSBAR_Y, goal: { ...GOAL_GEOMETRY } },
      powerReady: [false, false],
      replayFrames: [],
      replayIndex: 0,
      replayProgress: 0,
      renderState: null,
      lastGoal: null,
      endReason: null,
      rules: this.options.rules ?? 'classic',
      arena: this.options.arena ?? 'classic',
      goldenGoal: false,
      overtime: false,
      winner: null,
      resultReason: null,
      trial: { points: 0, targets: [] },
      chaosForce: 0,
      chaosClock: 0,
    };
  }

  emit(type, detail = {}) {
    this.onEvent({ type, matchId: this.matchId, ...detail });
  }

  createMatchId() {
    MATCH_SEQUENCE += 1;
    return `${Date.now().toString(36)}-${MATCH_SEQUENCE.toString(36)}`;
  }

  start({ matchType = 'ai', difficulty = 'normal', duration = 60, rules = 'classic', arena = 'classic' } = {}) {
    this.matchId = this.createMatchId();
    this.options = {
      matchType: matchType === 'local' ? 'local' : 'ai',
      difficulty: ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal',
      duration: clamp(Number(duration) || 60, 10, 300),
      rules: ['classic', 'chaos', 'trials', 'ghost'].includes(rules) ? rules : 'classic',
      arena: typeof arena === 'string' ? arena : 'classic',
    };
    this.state = this.makeInitialState();
    this.state.mode = 'playing';
    this.state.rules = this.options.rules;
    this.state.arena = this.options.arena;
    if (this.options.rules === 'trials') {
      this.state.matchType = 'local';
      this.state.players[1].active = false;
      this.state.trial.targets = [this.makeTrialTarget(0)];
    } else if (this.options.rules === 'ghost') {
      this.state.matchType = 'ai';
    }
    this.accumulator = 0;
    this.clearInputEdges();
    this.replayFrames = [];
    this.replaySampleClock = 0;
    this.recordReplayFrame(true);
    this.emit('start', { matchType: this.options.matchType, difficulty: this.options.difficulty, duration: this.options.duration });
  }

  clearInputEdges() {
    this.pendingEdges = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
    this.pendingReleases = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
    this.previousInput = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
  }

  cancelInput() {
    this.clearInputEdges();
    this.state.players.forEach((player) => { player.charge = 0; });
  }

  togglePause() {
    if (this.state.mode === 'paused') {
      this.clearInputEdges();
      this.state.players.forEach((player) => { player.charge = 0; });
      this.state.mode = this.pauseMode;
    } else if (['playing', 'goal', 'replay'].includes(this.state.mode)) {
      this.pauseMode = this.state.mode;
      this.clearInputEdges();
      this.state.players.forEach((player) => { player.charge = 0; });
      this.state.mode = 'paused';
    }
  }

  restart() {
    this.start({ ...this.options });
  }

  update(dt, input = {}) {
    if (this.state.mode === 'paused' || this.state.mode === 'ready' || this.state.mode === 'finished') {
      this.clearInputEdges();
      return;
    }
    const elapsed = clamp(Number(dt) || 0, 0, 0.25);
    const current = Object.fromEntries(INPUT_KEYS.map((key) => [key, Boolean(input[key])]));
    for (const key of INPUT_KEYS) {
      if (current[key] && !this.previousInput[key]) this.pendingEdges[key] = true;
      if (!current[key] && this.previousInput[key]) this.pendingReleases[key] = true;
    }
    const priorInput = this.previousInput;
    this.previousInput = current;
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < 32) {
      this.step(FIXED_STEP, current, this.pendingEdges, this.pendingReleases, priorInput);
      this.pendingEdges = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
      this.pendingReleases = Object.fromEntries(INPUT_KEYS.map((key) => [key, false]));
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
  }

  step(dt, input, edges, releases) {
    const state = this.state;
    if (state.mode === 'goal') {
      state.goalTimer -= dt;
      if (state.goalTimer <= 0) this.beginReplay();
      return;
    }
    if (state.mode === 'replay') {
      this.advanceReplay(dt);
      return;
    }
    if (state.mode !== 'playing') return;

    state.elapsed += dt;
    state.remaining = Math.max(0, state.remaining - dt);
    this.replaySampleClock += dt;
    if (this.replaySampleClock >= REPLAY_SAMPLE_STEP) {
      this.replaySampleClock %= REPLAY_SAMPLE_STEP;
      this.recordReplayFrame();
    }

    const commands = [
      this.readCommand(input, edges, releases, 'blue'),
      this.readCommand(input, edges, releases, 'red'),
    ];
    if (state.rules === 'trials') commands[1] = { left: false, right: false, jump: false, kick: false, quickKick: false, power: false };
    else if (state.matchType === 'ai' || state.rules === 'ghost') {
      if (state.aiKickoffDelay > 0) {
        state.aiKickoffDelay = Math.max(0, state.aiKickoffDelay - dt);
        commands[1] = { left: false, right: false, jump: false, kick: false, quickKick: false, charging: false, sprint: false, jab: false };
      } else commands[1] = this.getAICommand(dt);
    }

    for (let i = 0; i < 2; i += 1) {
      this.updatePlayer(state.players[i], commands[i], i, dt);
      if (state.mode !== 'playing') return;
    }
    this.separatePlayers();
    this.updateBall(dt);
    this.updateParticles(dt);
    this.updatePowerReadiness();
    if (state.rules === 'chaos') {
      state.chaosClock += dt;
      state.chaosForce = Math.sin(state.chaosClock * 2.7) * 190;
    }
    if (state.rules === 'trials') this.checkTrialTarget();

    if (this.checkGoal()) return;
    if (state.remaining <= 0) {
      if (state.rules === 'trials') {
        this.finishMatch('trial');
      } else if (!state.goldenGoal) {
        if (state.score[0] === state.score[1]) {
          state.goldenGoal = true;
          state.overtime = true;
        } else {
          this.finishMatch('time');
        }
      }
    }
  }

  readCommand(input, edges, releases, side) {
    const prefix = side === 'blue' ? 'blue' : 'red';
    return {
      left: input[`${prefix}Left`], right: input[`${prefix}Right`],
      jump: edges[`${prefix}Jump`], kick: releases[`${prefix}Kick`], quickKick: edges[`${prefix}QuickKick`],
      charging: input[`${prefix}Kick`], power: input[`${prefix}Power`],
      sprint: input[`${prefix}Sprint`], slide: edges[`${prefix}Slide`], brace: input[`${prefix}Brace`],
      jab: edges[`${prefix}Jab`], leg: edges[`${prefix}Leg`], uppercut: edges[`${prefix}Uppercut`], sweep: edges[`${prefix}Sweep`],
      powers: [1, 2, 3, 4, 5].map((n) => edges[`${prefix}Power${n}`]),
    };
  }

  getAICommand(dt) {
    const ai = this.state.players[1];
    const ball = this.state.ball;
    const difficulty = this.state.difficulty;
    const reaction = difficulty === 'easy' ? 0.3 : difficulty === 'hard' ? 0.16 : 0.22;
    const speed = difficulty === 'easy' ? 0.76 : difficulty === 'hard' ? 0.94 : 0.84;
    const attackDirection = -1;
    const predictedBallX = clamp(ball.x + ball.vx * reaction, 150, WIDTH - 150);
    const goalThreat = ball.x > WIDTH * 0.58 && ball.vx > 80;
    const behindBallX = predictedBallX - attackDirection * 62;
    const opponent = this.state.players[0];
    const opponentBlocksLane = opponent.x < ball.x && opponent.x > 100
      && ball.x - opponent.x < 420 && Math.abs(opponent.y - ball.y) < 155;
    const blockerGap = ball.x - opponent.x;
    const unservedBlock = ball.blockedKickId === ball.kickSequence
      && ball.kickSequence > 0 && ai.aiLastQuickBlockId !== ball.kickSequence;
    const distanceToGoal = Math.max(0, ball.x - (GOAL_GEOMETRY.leftLineX - BALL_RADIUS));
    const poweredChargeBonus = ai.power >= 80 && ai.super <= 0;
    const normalCharge = minimumAICharge(ball, distanceToGoal, poweredChargeBonus ? 280 : 0, poweredChargeBonus ? 130 : 0);
    const canCannon = ai.power >= POWER_DEFINITIONS[0].cost && ai.abilities[0] <= 0;
    const quickShotFits = shotFitsGoal(ball, distanceToGoal, 760 + ai.vx * 0.25, -660);
    const aerialOpportunity = ball.y < FLOOR_Y - 130 && this.kickContact(ai, true).reachable
      && unservedBlock && (!opponentBlocksLane || blockerGap >= 90)
      && ball.vx > -180 && quickShotFits && ai.kickCooldown <= 0 && ai.downTime <= 0;
    if (ai.aiRepositionAfterBlock && ai.x >= (ai.aiRetreatTargetX ?? ai.x + 1) - 20) {
      ai.aiRepositionAfterBlock = false;
      ai.aiRetreatTargetX = null;
    }
    const needsSpaceAfterBlock = ai.aiRepositionAfterBlock && !aerialOpportunity;
    const guardX = clamp(ball.x + Math.min(110, Math.max(0, ball.vx * 0.18)),
      GOAL_GEOMETRY.rightLineX - 250, GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH);
    const targetX = goalThreat ? guardX : aerialOpportunity ? ai.x : needsSpaceAfterBlock ? ai.aiRetreatTargetX : behindBallX;
    const dx = targetX - ai.x;
    const inKickReach = this.kickContact(ai, false).reachable && ai.facing === attackDirection && ball.x < ai.x;
    const ballReachable = ball.y > FLOOR_Y - 205 || (ball.vy > 0 && ball.y < FLOOR_Y - 205);
    const opponentInPath = Math.abs(opponent.x - ai.x) < 112 && Math.abs(opponent.y - ai.y) < 150;
    const keeperDistance = ball.vx > 80 ? (GOAL_GEOMETRY.rightLineX - BALL_RADIUS - ball.x) / ball.vx : Infinity;
    const keeperBallY = ball.y + ball.vy * keeperDistance + 525 * keeperDistance ** 2;
    const keeperCanReach = goalThreat && keeperDistance > 0.06 && keeperDistance < 1.35
      && keeperBallY >= GOAL_BALL_TOP && keeperBallY <= GOAL_BALL_BOTTOM
      && keeperBallY >= ai.y - 430 && Math.abs(ai.x - guardX) < 115;
    const keeperJump = keeperCanReach && keeperBallY < ai.y - 188 && ai.aiJumpCooldown <= 0;
    const attackJump = !goalThreat && ballReachable
      && (ball.y < ai.y - 88 || (opponentInPath && opponentBlocksLane && !needsSpaceAfterBlock))
      && Math.abs(ball.x - ai.x) < (needsSpaceAfterBlock ? 230 : 142) && ai.vy >= -120 && ai.aiJumpCooldown <= 0;
    const jump = ai.jumpsUsed < 2 && ai.jump <= 0 && ai.vy >= -120 && (attackJump || keeperJump);
    const hasShootingSpace = !opponentBlocksLane || blockerGap >= 90 || aerialOpportunity;
    const canShoot = inKickReach && !aerialOpportunity && !needsSpaceAfterBlock && hasShootingSpace && ai.kickCooldown <= 0 && ai.downTime <= 0;
    const quickKick = aerialOpportunity && hasShootingSpace && ai.kickCooldown <= 0 && ai.downTime <= 0;
    const requiredCharge = Math.max(opponentBlocksLane && !aerialOpportunity ? 0.84 : 0, normalCharge ?? 1);
    const useCannon = canShoot && normalCharge === null && canCannon && ai.charge >= 0.98;
    const releaseCharge = canShoot && !useCannon
      && ((normalCharge !== null && ai.charge >= requiredCharge) || (normalCharge === null && !canCannon && ai.charge >= 1));
    return {
      left: dx < -10,
      right: dx > 10,
      jump,
      quickKick,
      charging: canShoot && !releaseCharge && !useCannon,
      kick: releaseCharge,
      speed,
      sprint: Math.abs(dx) > 240 && ai.stamina > 20,
      jab: false,
      facing: attackDirection,
      powers: [useCannon, false, false, false, false],
    };
  }

  updatePlayer(player, command, index, dt) {
    if (!player.active) return;
    const state = this.state;
    let direction = (command.right ? 1 : 0) - (command.left ? 1 : 0);
    const directionToBall = state.ball.x >= player.x ? 1 : -1;
    if (player.freezeTime > 0) {
      player.freezeTime = Math.max(0, player.freezeTime - dt);
      command = { ...command, left: false, right: false, jump: false, charging: false, kick: false, sprint: false, slide: false, jab: false, leg: false, uppercut: false, sweep: false, powers: [] };
      direction = 0;
    }
    player.abilities = player.abilities.map((cooldown) => Math.max(0, cooldown - dt));
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
    player.aiJumpCooldown = Math.max(0, player.aiJumpCooldown - dt);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.downTime = Math.max(0, player.downTime - dt);
    player.shieldTime = Math.max(0, player.shieldTime - dt);
    player.magnetTime = Math.max(0, player.magnetTime - dt);
    player.superJumpTime = Math.max(0, player.superJumpTime - dt);
    player.cannonTime = Math.max(0, player.cannonTime - dt);
    player.slideTime = Math.max(0, player.slideTime - dt);
    player.attack.time = Math.max(0, player.attack.time - dt);
    if (player.attack.time === 0) player.attack.type = '';
    player.brace = Boolean(command.brace && player.stamina > 1 && player.downTime <= 0);
    player.sprint = Boolean(command.sprint && player.stamina > 0 && player.downTime <= 0);
    const sprintScale = player.sprint ? 1.38 : 1;
    player.stamina = clamp(player.stamina + (command.charging ? 0 : player.sprint || player.brace ? -20 : 17) * dt, 0, 100);
    if (command.facing === -1 || command.facing === 1) player.facing = command.facing;
    else if (direction) player.facing = direction;
    const speedScale = command.speed ?? 1;
    const opposingDirection = direction !== 0 && player.vx !== 0 && Math.sign(player.vx) !== direction;
    const acceleration = opposingDirection ? PLAYER_TURN_ACCEL : PLAYER_MOVE_ACCEL;
    const maximumSpeed = PLAYER_MOVE_SPEED * speedScale * sprintScale;
    player.vx = clamp(player.vx + direction * acceleration * speedScale * sprintScale * dt, -maximumSpeed, maximumSpeed);
    if (!direction) {
      const stopDeceleration = player.slideTime > 0 ? PLAYER_SLIDE_STOP_DECEL : PLAYER_STOP_DECEL;
      player.vx = approach(player.vx, 0, stopDeceleration * dt);
    }
    player.x = clamp(player.x + player.vx * dt, 90, WIDTH - 90);
    if ((player.x <= 90 && player.vx < 0) || (player.x >= WIDTH - 90 && player.vx > 0)) player.vx = 0;

    const horizontalBounds = playerHorizontalBounds(player);
    if (player.x < horizontalBounds.minX) {
      player.x = horizontalBounds.minX;
      player.vx = Math.max(0, player.vx);
    } else if (player.x > horizontalBounds.maxX) {
      player.x = horizontalBounds.maxX;
      player.vx = Math.min(0, player.vx);
    }

    const onGoalPlatform = Math.abs(player.y - GOAL_GEOMETRY.bottomY) < 0.01
      && (player.x < GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
        || player.x > GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH);
    const grounded = player.y >= FLOOR_Y - 0.01 || onGoalPlatform;
    if (grounded) player.jumpsUsed = 0;
    if (command.jump && player.downTime <= 0 && (grounded || player.jumpsUsed < 2)) {
      const jumpBoost = player.superJumpTime > 0 ? 1.42 : 1;
      player.vy = grounded ? -690 * jumpBoost : -610 * jumpBoost;
      player.jumpsUsed += 1;
      player.jump = 0.24;
      if (index === 1) player.aiJumpCooldown = 0.75;
      this.emit('jump', { player: index === 0 ? 'blue' : 'red' });
    }
    const previousY = player.y;
    player.vy += 1750 * dt;
    player.y += player.vy * dt;
    const overlapsGoalPlatform = player.x < GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
      || player.x > GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH;
    if (player.vy > 0 && previousY <= GOAL_GEOMETRY.bottomY && player.y >= GOAL_GEOMETRY.bottomY && overlapsGoalPlatform) {
      player.y = GOAL_GEOMETRY.bottomY;
      player.vy = 0;
    } else if (player.y > FLOOR_Y) {
      player.y = FLOOR_Y;
      player.vy = 0;
    }
    player.jump = Math.max(0, player.jump - dt);
    player.kick = Math.max(0, player.kick - dt);
    player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    player.super = Math.max(0, player.super - dt);
    player.power = clamp(player.power + 8 * dt, 0, 100);
    if (command.charging && player.stamina > 0 && player.downTime <= 0) {
      player.charge = Math.min(1, player.charge + dt / 0.9);
      player.stamina = Math.max(0, player.stamina - 7 * dt);
    }
    if ((command.kick || command.quickKick) && player.kickCooldown <= 0 && player.downTime <= 0) {
      player.facing = command.facing || direction || directionToBall;
      const previousSequence = this.state.ball.kickSequence || 0;
      const kicked = this.tryKick(player, index, command.quickKick);
      if (kicked && index === 1) {
        player.aiRepositionAfterBlock = false;
        player.aiRetreatTargetX = null;
        if (command.quickKick) player.aiLastQuickBlockId = previousSequence;
      }
    }
    if (command.slide && grounded && player.stamina >= 12 && player.downTime <= 0) {
      player.stamina -= 12;
      player.slideTime = 0.48;
      player.vx += player.facing * 255;
      this.applyAttack(player, index, 'slide', 120, 0, 18, 0.7);
    }
    if (command.jab) this.applyAttack(player, index, 'jab', 82, 8, 8, 0.22);
    if (command.leg) this.applyAttack(player, index, 'leg', 110, 22, 13, 0.38);
    if (command.uppercut) this.applyAttack(player, index, 'uppercut', 88, 26, 21, 0.56);
    if (command.sweep) this.applyAttack(player, index, 'sweep', 116, 18, 16, 0.58);
    command.powers?.forEach((pressed, powerIndex) => {
      if (pressed) this.activatePower(player, index, powerIndex);
    });
  }

  tryKick(player, index, quick = false) {
    const ball = this.state.ball;
    const maxReach = quick ? 145 : player.cannonTime > 0 ? POWER_DEFINITIONS[0].range : 112;
    const contact = this.kickContact(player, quick, maxReach);
    if (!contact.reachable || contact.distance > maxReach) {
      player.charge = 0;
      player.kickCooldown = Math.max(player.kickCooldown, 0.14);
      return false;
    }

    this.state.lastTouch = index === 0 ? 'blue' : 'red';
    const charge = quick ? Math.max(0.15, player.charge) : player.charge;
    const cannonShot = player.cannonTime > 0;
    const chipShot = !quick && !cannonShot && charge >= 0.8;
    const powered = cannonShot || (player.power >= 80 && player.super <= 0);
    const impulse = (quick ? 760 : 500 + 370 * charge) + (powered ? 280 : 0);
    const vertical = cannonShot ? -840 : quick ? -660 : -540 - 220 * charge - (powered ? 130 : 0);
    ball.kickSequence = (ball.kickSequence || 0) + 1;
    ball.blockedKickId = 0;
    ball.lastKickerSide = index === 0 ? 'blue' : 'red';
    ball.lastKickDirection = player.facing;
    ball.lastKickStyle = cannonShot ? 'cannon' : chipShot ? 'chip' : quick ? 'quick' : 'charged';
    ball.kickerIndex = index;
    ball.ignoredPlayer = index;
    ball.ignorePlayerTime = 0.08;
    ball.vx = player.facing * impulse + player.vx * 0.25;
    ball.vy = Math.min(ball.vy, vertical);
    ball.spin += player.facing * (powered ? 15 : 8);
    player.kick = 0.34;
    player.kickCooldown = powered ? 0.48 : 0.3;
    player.charge = 0;
    if (powered) {
      if (cannonShot) player.cannonTime = 0;
      else {
        player.power = Math.max(0, player.power - 58);
        player.super = 1.15;
        this.emit('super_shot', { player: index, name: 'Charged Shot', cost: 58, energy: player.power });
      }
      this.spawnBurst(ball.x, ball.y, player.facing, '#ffe578', 12);
    }
    this.spawnBurst(ball.x, ball.y, player.facing, powered ? '#ffe578' : '#f6fbff', powered ? 22 : quick ? 14 : 9);
    player.power = clamp(player.power + 8, 0, 100);
    this.emit('kick', {
      player: index === 0 ? 'blue' : 'red',
      powered,
      powerId: cannonShot ? 1 : null,
      powerName: cannonShot ? POWER_DEFINITIONS[0].name : null,
      skillPower: cannonShot ? 'cannon' : null,
      quick,
      lofted: chipShot,
      strength: charge,
    });
    return true;
  }

  kickContact(player, quick = false, maxReach = quick ? 145 : 112) {
    const ball = this.state.ball;
    const inFront = (ball.x - player.x) * player.facing >= -14;
    if (!inFront) return { reachable: false, distance: Infinity };
    const footDistance = Math.hypot(ball.x - (player.x + player.facing * 50), ball.y - (player.y - 35));
    const headDistance = Math.hypot(ball.x - (player.x + player.facing * 26), ball.y - (player.y - 125));
    const distance = Math.min(footDistance, headDistance);
    return { reachable: distance <= maxReach, distance };
  }

  applyAttack(player, index, type, reach, staminaCost, damage, cooldown) {
    if (player.attackCooldown > 0 || player.downTime > 0 || player.stamina < staminaCost) return;
    const opponent = this.state.players[1 - index];
    const dx = opponent.x - player.x;
    if (Math.sign(dx || player.facing) !== player.facing || Math.abs(dx) > reach || Math.abs(opponent.y - player.y) > 145) return;
    player.stamina -= staminaCost;
    player.attackCooldown = cooldown;
    player.attack = { type, time: 0.28 };
    const protectedByBrace = opponent.brace ? 0.25 : 1;
    const shielded = opponent.shieldTime > 0 ? 0.15 : 1;
    const actualDamage = Math.max(1, Math.round(damage * protectedByBrace * shielded));
    opponent.health = Math.max(0, opponent.health - actualDamage);
    opponent.vx += player.facing * (type === 'uppercut' ? 360 : type === 'slide' ? 300 : 145);
    if (type === 'uppercut') opponent.vy = Math.min(opponent.vy, -520);
    if ((type === 'sweep' || type === 'slide') && !opponent.brace) opponent.downTime = Math.max(opponent.downTime, 0.7);
    this.emit('hit', { attacker: index === 0 ? 'blue' : 'red', target: index === 0 ? 'red' : 'blue', attack: type, damage: actualDamage, health: opponent.health });
    if (opponent.health <= 0) this.finishMatch('knockout', index === 0 ? 'blue' : 'red');
  }

  activatePower(player, index, powerIndex) {
    const opponent = this.state.players[1 - index];
    const definition = POWER_DEFINITIONS[powerIndex];
    if (!definition) return;
    const detail = { player: index, power: definition.id, name: definition.name };
    if (player.downTime > 0 || player.health <= 0) {
      this.emit('power_denied', { ...detail, reason: 'down', remaining: player.downTime });
      return;
    }
    if (player.abilities[powerIndex] > 0) {
      this.emit('power_denied', { ...detail, reason: 'cooldown', remaining: player.abilities[powerIndex], cost: definition.cost });
      return;
    }
    if (player.power < definition.cost) {
      this.emit('power_denied', { ...detail, reason: 'energy', cost: definition.cost, energy: player.power });
      return;
    }
    const distance = Math.hypot(opponent.x - player.x, opponent.y - player.y);
    if (powerIndex === 3 && distance > definition.range) {
      this.emit('power_denied', { ...detail, reason: 'range', requiredRange: definition.range, distance, cost: definition.cost });
      return;
    }
    if (powerIndex === 4 && player.health >= 100 && player.stamina >= 100) {
      this.emit('power_denied', { ...detail, reason: 'full_health', health: player.health, stamina: player.stamina, cost: definition.cost });
      return;
    }

    player.power -= definition.cost;
    player.abilities[powerIndex] = definition.cooldown;
    let duration = definition.duration;
    let armed = false;
    if (powerIndex === 0) {
      player.cannonTime = definition.duration;
      if (this.ballInKickRange(player)) armed = !this.tryKick(player, index, false);
      else armed = true;
    } else if (powerIndex === 1) {
      player.magnetTime = definition.duration;
    } else if (powerIndex === 2) {
      player.superJumpTime = definition.duration;
      player.vy = Math.min(player.vy, -760);
      player.jumpsUsed = 1;
      player.y = Math.min(player.y, FLOOR_Y - 1);
      player.jump = Math.max(player.jump, 0.28);
      this.emit('jump', { player: index === 0 ? 'blue' : 'red', power: definition.id });
      this.spawnBurst(player.x, player.y - 35, player.facing, index === 0 ? '#78d3ff' : '#ff8c88', 18);
    } else if (powerIndex === 3) {
      opponent.freezeTime = Math.max(opponent.freezeTime, definition.duration);
    } else {
      const oldHealth = player.health;
      const oldStamina = player.stamina;
      player.health = Math.min(100, player.health + 30);
      player.stamina = Math.min(100, player.stamina + 25);
      duration = 0;
      this.emit('heal', { player: index, health: player.health, healthRestored: player.health - oldHealth, stamina: player.stamina, staminaRestored: player.stamina - oldStamina });
    }
    player.power = clamp(player.power, 0, 100);
    this.emit('power', { ...detail, duration, cost: definition.cost, energy: player.power, health: player.health, stamina: player.stamina, cooldown: player.abilities[powerIndex], armed });
  }

  ballInKickRange(player) {
    return this.kickContact(player, false, POWER_DEFINITIONS[0].range).reachable;
  }

  separatePlayers() {
    if (this.state.rules === 'trials') return;
    const [blue, red] = this.state.players;
    if (Math.abs(blue.y - red.y) > 110) return;
    const gap = red.x - blue.x;
    const direction = gap >= 0 ? 1 : -1;
    const bluePose = getPlayerRenderPose(blue, this.state.elapsed ?? 0);
    const redPose = getPlayerRenderPose(red, this.state.elapsed ?? 0);
    const headsOverlapVertically = Math.abs(bluePose.headWorld.y - redPose.headWorld.y)
      < bluePose.headWorld.ry + redPose.headWorld.ry;
    const headSeparation = headsOverlapVertically
      ? bluePose.headWorld.rx + redPose.headWorld.rx + 1
        + direction * PLAYER_RENDER_SCALE * (bluePose.localShiftX - redPose.localShiftX)
      : 0;
    const minimum = Math.max(74, headSeparation);
    if (Math.abs(gap) < minimum) {
      const overlap = (minimum - Math.abs(gap)) / 2;
      const blueBounds = playerHorizontalBounds(blue);
      const redBounds = playerHorizontalBounds(red);
      let blueX = clamp(blue.x - direction * overlap, blueBounds.minX, blueBounds.maxX);
      let redX = clamp(red.x + direction * overlap, redBounds.minX, redBounds.maxX);
      if (Math.abs(redX - blueX) < minimum) {
        if (direction > 0) {
          redX = Math.max(redX, Math.min(redBounds.maxX, blueX + minimum));
          if (redX - blueX < minimum) blueX = Math.max(blueBounds.minX, redX - minimum);
        } else {
          redX = Math.min(redX, Math.max(redBounds.minX, blueX - minimum));
          if (blueX - redX < minimum) blueX = Math.min(blueBounds.maxX, redX + minimum);
        }
      }
      blue.x = blueX;
      red.x = redX;
    }
  }

  updateBall(dt) {
    const ball = this.state.ball;
    ball.ignorePlayerTime = Math.max(0, (ball.ignorePlayerTime || 0) - dt);
    if (ball.ignorePlayerTime === 0) ball.ignoredPlayer = -1;
    ball.vy += 1050 * dt;
    if (this.state.rules === 'chaos') ball.vx += this.state.chaosForce * dt;
    for (const player of this.state.players) {
      if (player.magnetTime <= 0) continue;
      const dx = player.x - ball.x;
      const dy = player.y - 82 - ball.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 520 || distance < 1) continue;
      const pull = 460 * (1 - distance / 520) * dt;
      ball.vx += dx / distance * pull;
      ball.vy += dy / distance * pull;
    }
    ball.vx *= Math.pow(0.998, dt * 60);
    ball.spin *= Math.pow(0.985, dt * 60);
    const previousX = ball.x;
    const previousY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y + BALL_RADIUS > FLOOR_Y) {
      ball.y = FLOOR_Y - BALL_RADIUS;
      if (Math.abs(ball.vy) > 95) ball.vy *= -0.57;
      else ball.vy = 0;
      ball.vx *= Math.pow(BALL_GROUND_FRICTION, dt * 60);
    }
    const insideLeftDepth = ball.x >= 0 && ball.x < GOAL_GEOMETRY.leftLineX;
    const insideRightDepth = ball.x > GOAL_GEOMETRY.rightLineX && ball.x <= WIDTH;
    const wholeBallFits = ball.y - BALL_RADIUS >= GOAL_GEOMETRY.topY
      && ball.y + BALL_RADIUS <= GOAL_GEOMETRY.bottomY;
    const leftEntryX = GOAL_GEOMETRY.leftLineX + BALL_RADIUS;
    const rightEntryX = GOAL_GEOMETRY.rightLineX - BALL_RADIUS;
    const crossedLeftFace = ball.vx < 0 && previousX > leftEntryX && ball.x <= leftEntryX;
    const crossedRightFace = ball.vx > 0 && previousX < rightEntryX && ball.x >= rightEntryX;

    if (ball.vx < 0 && (crossedLeftFace || ball.x < leftEntryX) && !wholeBallFits) {
      ball.x = leftEntryX;
      ball.vx = Math.abs(ball.vx) * 0.62;
    }
    if (ball.vx > 0 && (crossedRightFace || ball.x > rightEntryX) && !wholeBallFits) {
      ball.x = rightEntryX;
      ball.vx = -Math.abs(ball.vx) * 0.62;
    }

    if (insideLeftDepth && ball.y + BALL_RADIUS > GOAL_GEOMETRY.bottomY && ball.vy > 0) {
      ball.y = GOAL_BALL_BOTTOM;
      ball.vy = -Math.max(95, Math.abs(ball.vy)) * 0.52;
      ball.vx *= 0.91;
    } else if (insideRightDepth && ball.y + BALL_RADIUS > GOAL_GEOMETRY.bottomY && ball.vy > 0) {
      ball.y = GOAL_BALL_BOTTOM;
      ball.vy = -Math.max(95, Math.abs(ball.vy)) * 0.52;
      ball.vx *= 0.91;
    }

    const insideGoalDepth = insideLeftDepth || insideRightDepth;
    if (insideGoalDepth && ball.y - BALL_RADIUS < GOAL_GEOMETRY.topY) {
      ball.y = GOAL_BALL_TOP;
      ball.vy = previousY < GOAL_BALL_TOP ? -Math.abs(ball.vy) * 0.52 : Math.abs(ball.vy) * 0.52;
    }

    if (ball.x < 0) {
      ball.x = BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.62;
    }
    if (ball.x > WIDTH) {
      ball.x = WIDTH - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.62;
    }
    if (this.state.rules === 'trials') {
      if (ball.x < BALL_RADIUS || ball.x > WIDTH - BALL_RADIUS) {
        ball.x = clamp(ball.x, BALL_RADIUS, WIDTH - BALL_RADIUS);
        ball.vx *= -0.62;
      }
    }

    for (let i = 0; i < this.state.players.length; i += 1) {
      if (!this.state.players[i].active) continue;
      this.collideBallWithPlayer(this.state.players[i], i);
    }
    this.applyGroundDribble();
    this.releasePlayerScrum(dt);
  }

  releasePlayerScrum(dt) {
    const ball = this.state.ball;
    const [blue, red] = this.state.players;
    const contested = blue.active && red.active
      && Math.abs(blue.x - red.x) < 150
      && Math.hypot(ball.x - blue.x, ball.y - (blue.y - 62)) < 112
      && Math.hypot(ball.x - red.x, ball.y - (red.y - 62)) < 112
      && ball.y > FLOOR_Y - 120
      && Math.hypot(ball.vx, ball.vy) < 180;
    ball.scrumCooldown = Math.max(0, (ball.scrumCooldown || 0) - dt);
    ball.scrumTime = contested ? (ball.scrumTime || 0) + dt : 0;
    if (ball.scrumTime < 0.2 || ball.scrumCooldown > 0) return;
    const midpoint = (blue.x + red.x) / 2;
    const direction = Math.abs(ball.x - midpoint) > 2
      ? Math.sign(ball.x - midpoint)
      : (ball.scrumReleaseCount % 2 === 0 ? -1 : 1);
    const playerOrder = Math.sign(red.x - blue.x) || 1;
    blue.x = clamp(blue.x - playerOrder * 26, 90, WIDTH - 90);
    red.x = clamp(red.x + playerOrder * 26, 90, WIDTH - 90);
    ball.vx = direction * Math.min(280, Math.max(220, Math.abs(ball.vx)));
    ball.vy = Math.min(ball.vy, -520);
    ball.scrumReleaseCount = (ball.scrumReleaseCount || 0) + 1;
    ball.scrumTime = 0;
    ball.scrumCooldown = 0.55;
  }

  applyGroundDribble() {
    const ball = this.state.ball;
    if ((ball.scrumCooldown || 0) > 0 || ball.y < FLOOR_Y - 112 || Math.hypot(ball.vx, ball.vy) > 540) return;
    const contested = this.state.players[0].active && this.state.players[1].active
      && Math.abs(this.state.players[0].x - this.state.players[1].x) < 142
      && Math.abs(this.state.players[0].y - this.state.players[1].y) < 150;
    if (contested) return;
    const candidates = this.state.players.filter((player) => player.active && player.y >= FLOOR_Y - 1)
      .map((player) => ({ player, side: this.state.players.indexOf(player), targetX: player.x + player.facing * 56, distance: Math.hypot(ball.x - (player.x + player.facing * 48), ball.y - (player.y - 32)) }))
      .filter((entry) => entry.distance < 100)
      .sort((a, b) => a.distance - b.distance);
    const touch = candidates[0];
    if (!touch) return;
    const player = touch.player;
    const carrySpeed = clamp(player.vx + player.facing * 42, -460, 460);
    ball.vx += (carrySpeed - ball.vx) * 0.18;
    ball.y += ((FLOOR_Y - BALL_RADIUS) - ball.y) * 0.16;
    ball.vy = Math.min(ball.vy, 0);
    ball.spin += player.vx * 0.0018;
    this.state.lastTouch = touch.side === 0 ? 'blue' : 'red';
  }

  collideBallWithPlayer(player, index) {
    const ball = this.state.ball;
    if (ball.ignoredPlayer === index && ball.ignorePlayerTime > 0) return;
    const pose = getPlayerRenderPose(player, this.state.elapsed ?? 0);
    const parts = [
      { x: player.x, y: player.y - 62, radius: 37, factor: 0.52 },
      { x: player.x, y: player.y - 126, radius: 30, factor: 0.78 },
      { x: pose.headWorld.x, y: pose.headWorld.y, radius: Math.max(pose.headWorld.rx, pose.headWorld.ry), factor: 0.78 },
    ];
    for (const part of parts) {
      const dx = ball.x - part.x;
      const dy = ball.y - part.y;
      const distance = Math.hypot(dx, dy);
      const minimum = BALL_RADIUS + part.radius;
      if (distance >= minimum || distance === 0) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minimum - distance;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const relativeSpeed = (ball.vx - player.vx * 0.35) * nx + (ball.vy - player.vy * 0.24) * ny;
      if (relativeSpeed < 0 || (relativeSpeed < 36 && overlap > 2)) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 670 && player.hurtCooldown <= 0) {
          const damage = Math.min(9, Math.round((speed - 570) / 105));
          this.damageFromBall(player, index, damage);
          player.hurtCooldown = 0.72;
          if (this.state.mode === 'finished') return;
        }
        const activeKick = player.kick > 0;
        const impulse = activeKick ? 445 : speed > 600 ? 82 : relativeSpeed < 0 ? 265 : 205;
        ball.vx += nx * impulse * part.factor + player.vx * 0.3;
        ball.vy += ny * impulse * part.factor - (activeKick ? 135 : relativeSpeed < 0 ? 30 : 55);
        if (activeKick) ball.vx += player.facing * 160;
        if (index !== ball.kickerIndex && ball.lastKickerSide === 'red' && index === 0
          && ball.blockedKickId !== ball.kickSequence && relativeSpeed < 0 && speed > 250) {
          ball.blockedKickId = ball.kickSequence;
          this.state.players[1].aiRepositionAfterBlock = true;
          this.state.players[1].aiRetreatTargetX = clamp(this.state.players[1].x + 230, 170, WIDTH - 120);
        }
        ball.spin += nx * player.vx * 0.028;
      }
      if (part.factor > 0.7 && ball.y > player.y - 146) {
        ball.vy = Math.min(ball.vy, -80);
      }
      this.state.lastTouch = index === 0 ? 'blue' : 'red';
    }
  }

  checkGoal() {
    if (this.state.rules === 'trials' || this.state.mode !== 'playing') return false;
    const ball = this.state.ball;
    const wholeBallFits = ball.y - BALL_RADIUS >= GOAL_GEOMETRY.topY
      && ball.y + BALL_RADIUS <= GOAL_GEOMETRY.bottomY;
    const crossedRight = ball.x - BALL_RADIUS >= GOAL_GEOMETRY.rightLineX && ball.vx > 0 && wholeBallFits;
    const crossedLeft = ball.x + BALL_RADIUS <= GOAL_GEOMETRY.leftLineX && ball.vx < 0 && wholeBallFits;
    if (!crossedRight && !crossedLeft) return false;

    const scorer = crossedRight ? 'blue' : 'red';
    const scorerIndex = scorer === 'blue' ? 0 : 1;
    this.state.players[scorerIndex].power = clamp(this.state.players[scorerIndex].power + 10, 0, 100);
    this.state.score[scorer === 'blue' ? 0 : 1] += 1;
    const ownGoal = crossedRight
      ? this.state.ball.lastKickerSide === 'red' && this.state.ball.lastKickDirection > 0
      : this.state.ball.lastKickerSide === 'blue' && this.state.ball.lastKickDirection < 0;
    this.state.lastGoal = { scorer, ownGoal, x: ball.x, y: ball.y };
    this.state.mode = 'goal';
    this.state.goalTimer = 0.72;
    this.state.renderState = null;
    this.emit('goal', { scorer, ownGoal, score: [...this.state.score] });
    this.spawnBurst(ball.x, ball.y, crossedRight ? 1 : -1, scorer === 'blue' ? '#46baff' : '#ff5e62', 26);
    return true;
  }

  beginReplay() {
    const frames = this.replayFrames.slice(-Math.ceil(REPLAY_SECONDS / REPLAY_SAMPLE_STEP));
    this.state.replayFrames = frames;
    this.state.mode = 'replay';
    this.state.replayIndex = 0;
    this.state.replayProgress = 0;
    this.state.renderState = frames.length ? cloneFrame(frames[0]) : cloneFrame(this.state);
  }

  advanceReplay(dt) {
    const frames = this.state.replayFrames;
    if (!frames.length) {
      this.finishGoalSequence();
      return;
    }
    this.state.replayProgress = Math.min(1, this.state.replayProgress + dt / REPLAY_SECONDS);
    this.state.replayIndex = Math.min(frames.length - 1, Math.floor(this.state.replayProgress * (frames.length - 1)));
    this.state.renderState = cloneFrame(frames[this.state.replayIndex]);
    if (this.state.replayProgress >= 1) this.finishGoalSequence();
  }

  finishGoalSequence() {
    const { score, remaining } = this.state;
    if (this.state.goldenGoal) {
      this.finishMatch('golden_goal', score[0] > score[1] ? 'blue' : 'red');
      return;
    }
    if (remaining <= 0) {
      if (score[0] === score[1]) {
        this.state.goldenGoal = true;
        this.state.overtime = true;
        this.state.mode = 'playing';
        const next = [freshPlayer(470, 1, 1), freshPlayer(1130, -1, 2)];
        next[0].power = this.state.players[0].power;
        next[1].power = this.state.players[1].power;
        this.state.players = next;
        this.state.ball = { x: 800, y: FLOOR_Y - BALL_RADIUS, vx: 0, vy: 0, spin: 0 };
        this.state.particles = [];
        this.state.renderState = null;
        this.state.replayFrames = [];
        this.state.replayIndex = 0;
        this.state.replayProgress = 0;
        this.replayFrames = [];
        this.replaySampleClock = 0;
        this.recordReplayFrame(true);
      } else {
        this.finishMatch('time');
      }
      return;
    }
    const next = [freshPlayer(470, 1, 1), freshPlayer(1130, -1, 2)];
    next[0].power = this.state.players[0].power;
    next[1].power = this.state.players[1].power;
    this.state.players = next;
    this.state.ball = { x: 800, y: FLOOR_Y - BALL_RADIUS, vx: 0, vy: 0, spin: 0 };
    this.state.particles = [];
    this.state.renderState = null;
    this.state.replayFrames = [];
    this.state.replayIndex = 0;
    this.state.replayProgress = 0;
    this.replayFrames = [];
    this.replaySampleClock = 0;
    this.recordReplayFrame(true);
    this.state.mode = 'playing';
  }

  recordReplayFrame(force = false) {
    if (!force && this.state.mode !== 'playing') return;
    this.replayFrames.push(cloneFrame(this.state));
    const maxFrames = Math.ceil(REPLAY_SECONDS / REPLAY_SAMPLE_STEP) + 2;
    if (this.replayFrames.length > maxFrames) this.replayFrames.splice(0, this.replayFrames.length - maxFrames);
  }

  spawnBurst(x, y, direction, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.random() * 1.15 - 0.57) + (direction > 0 ? Math.PI : 0);
      const speed = 75 + Math.random() * 300;
      this.state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 70, life: 0.32 + Math.random() * 0.55, color, size: 3 + Math.random() * 6 });
    }
  }

  updateParticles(dt) {
    this.state.particles = this.state.particles.filter((particle) => {
      particle.life -= dt;
      particle.vy += 500 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      return particle.life > 0;
    });
  }

  updatePowerReadiness() {
    this.state.powerReady = this.state.players.map((player) => player.power >= 80 && player.super <= 0);
  }

  getWinner() {
    const [blue, red] = this.state.score;
    return blue === red ? 'draw' : blue > red ? 'blue' : 'red';
  }

  finishMatch(reason, winnerSide = null) {
    if (this.state.mode === 'finished') return;
    const side = winnerSide ?? (this.state.score[0] === this.state.score[1] ? null : this.state.score[0] > this.state.score[1] ? 'blue' : 'red');
    this.state.mode = 'finished';
    this.state.endReason = reason;
    this.state.resultReason = reason;
    this.state.winnerSide = side;
    this.state.winner = side === 'blue' ? 0 : side === 'red' ? 1 : null;
    this.state.renderState = null;
    this.emit('end', {
      winner: this.state.winner,
      winnerSide: side,
      score: [...this.state.score],
      reason,
      resultReason: reason,
      duration: this.state.duration,
      remaining: this.state.remaining,
      stats: {
        health: this.state.players.map((player) => player.health),
        stamina: this.state.players.map((player) => player.stamina),
        trialPoints: this.state.trial.points,
      },
    });
  }

  damageFromBall(player, index, damage) {
    if (damage <= 0) return;
    const protection = (player.brace ? 0.25 : 1) * (player.shieldTime > 0 ? 0.15 : 1);
    const actual = Math.max(1, Math.round(damage * protection));
    player.health = Math.max(0, player.health - actual);
    this.emit('hit', { attacker: 'ball', target: index === 0 ? 'blue' : 'red', attack: 'ball', damage: actual, health: player.health });
    if (player.health <= 0) this.finishMatch('knockout', index === 0 ? 'red' : 'blue');
  }

  makeTrialTarget(index) {
    const positions = [
      { x: 410, y: 570 }, { x: 800, y: 430 }, { x: 1190, y: 570 },
      { x: 570, y: 340 }, { x: 1030, y: 335 },
    ];
    const base = positions[index % positions.length];
    return { x: base.x, y: base.y, radius: this.state.difficulty === 'hard' ? 42 : 58, id: index + 1 };
  }

  checkTrialTarget() {
    const target = this.state.trial.targets[0];
    if (!target) return;
    const ball = this.state.ball;
    if (Math.hypot(ball.x - target.x, ball.y - target.y) > target.radius + BALL_RADIUS) return;
    this.state.trial.points += 1;
    this.state.trial.targets = [this.makeTrialTarget(this.state.trial.points)];
    this.emit('target', { points: this.state.trial.points, target: { ...this.state.trial.targets[0] } });
    this.spawnBurst(target.x, target.y, 1, '#9df0cd', 16);
    this.state.ball = { x: 800, y: FLOOR_Y - BALL_RADIUS, vx: 0, vy: 0, spin: 0 };
  }

  getSnapshot() {
    const players = this.state.players.map((player, index) => ({
      ...player,
      abilities: [...player.abilities],
      powerCooldowns: [...player.abilities],
      cannonReady: player.cannonTime > 0,
      powerActive: [player.cannonTime, player.magnetTime, player.superJumpTime, this.state.players[1 - index].freezeTime, 0],
    }));
    return JSON.parse(JSON.stringify({
      ...this.state,
      players,
      powerDefinitions: POWER_DEFINITIONS,
      options: { ...this.options },
      powerReady: this.state.players.map((player) => player.power >= 80 && player.super <= 0),
      winner: this.state.winner,
      winnerSide: this.state.winnerSide,
    }));
  }
}
