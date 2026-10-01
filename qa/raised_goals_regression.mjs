import assert from 'node:assert/strict';
import { FootballGame, GOAL_GEOMETRY } from '../engine.js';

const STEP = 1 / 120;
const WIDTH = 1600;
const FLOOR_Y = 830;
const BALL_RADIUS = 32;
const PLAYER_HALF_WIDTH = 46;
const NEUTRAL = {};
const noEdges = {};
const noReleases = {};

function makeGame() {
  const game = new FootballGame();
  game.start({ matchType: 'local', duration: 60 });
  return game;
}

function placeShot(game, side, { playerX, ballY = 798, charge = 0, power = 35 } = {}) {
  const direction = side === 'left' ? -1 : 1;
  const index = side === 'left' ? 0 : 1;
  const player = game.state.players[index];
  const ball = game.state.ball;
  player.x = playerX;
  player.y = FLOOR_Y;
  player.facing = direction;
  player.charge = charge;
  player.power = power;
  player.vx = 0;
  player.vy = 0;
  player.kickCooldown = 0;
  player.downTime = 0;
  player.health = 100;
  player.abilities = [0, 0, 0, 0, 0];
  player.cannonTime = 0;
  game.state.players[1 - index].x = side === 'left' ? WIDTH - 100 : 100;
  game.state.players[1 - index].y = FLOOR_Y;
  game.state.players[1 - index].vx = 0;
  game.state.players[1 - index].vy = 0;
  ball.x = playerX + direction * 50;
  ball.y = ballY;
  ball.vx = 0;
  ball.vy = 0;
  ball.spin = 0;
  ball.ignoredPlayer = -1;
  ball.ignorePlayerTime = 0;
  ball.scrumTime = 0;
  ball.scrumCooldown = 0;
  ball.kickSequence = 0;
  ball.blockedKickId = 0;
  return { player, ball, index, direction };
}

function fireEdge(game, key) {
  const input = { [key]: true };
  const edges = { [key]: true };
  game.step(STEP, input, edges, noReleases);
  game.step(STEP, NEUTRAL, noEdges, noReleases);
}

function simulateUntilGoal(game, seconds = 2.5) {
  const frames = Math.ceil(seconds / STEP);
  for (let frame = 0; frame < frames && game.state.mode === 'playing'; frame += 1) {
    game.step(STEP, NEUTRAL, noEdges, noReleases);
  }
}

assert.ok(GOAL_GEOMETRY, 'engine should export one authoritative elevated goal geometry');
assert.equal(GOAL_GEOMETRY.topY, 210);
assert.equal(GOAL_GEOMETRY.bottomY, 650);
assert.ok(GOAL_GEOMETRY.depth > 2 * PLAYER_HALF_WIDTH,
  'goals should be high above players with a net pocket deeper than player width');
assert.equal(GOAL_GEOMETRY.leftLineX, GOAL_GEOMETRY.depth);
assert.equal(GOAL_GEOMETRY.rightLineX, WIDTH - GOAL_GEOMETRY.depth);

{
  const game = makeGame();
  assert.deepEqual(game.state.coordinates.goal, GOAL_GEOMETRY, 'renderers should receive the engine goal geometry in state coordinates');
  assert.equal(GOAL_GEOMETRY.bottomY - GOAL_GEOMETRY.topY, 440);
  assert.equal(game.state.coordinates.floorY - GOAL_GEOMETRY.bottomY, 180);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const playerIndex = side === 'left' ? 0 : 1;
  const player = game.state.players[playerIndex];
  player.x = side === 'left' ? GOAL_GEOMETRY.leftLineX + 52 : GOAL_GEOMETRY.rightLineX - 52;
  game.state.players[1 - playerIndex].x = side === 'left' ? 900 : 700;
  const moveKey = side === 'left' ? 'blueLeft' : 'redRight';
  for (let frame = 0; frame < 120; frame += 1) game.step(STEP, { [moveKey]: true }, noEdges, noReleases);
  assert.ok(side === 'left' ? player.x >= GOAL_GEOMETRY.leftLineX + 46
    : player.x <= GOAL_GEOMETRY.rightLineX - 46,
  `${side} walking player must not pass through the raised platform face`);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const playerIndex = side === 'left' ? 0 : 1;
  const player = game.state.players[playerIndex];
  player.x = side === 'left' ? GOAL_GEOMETRY.leftLineX + 46 : GOAL_GEOMETRY.rightLineX - 46;
  game.state.players[1 - playerIndex].x = side === 'left' ? 900 : 700;
  const moveKey = side === 'left' ? 'blueLeft' : 'redRight';
  const jumpKey = side === 'left' ? 'blueJump' : 'redJump';
  game.step(STEP, { [moveKey]: true, [jumpKey]: true }, { [jumpKey]: true }, noReleases);
  for (let frame = 1; frame < 66; frame += 1) game.step(STEP, { [moveKey]: true }, noEdges, noReleases);
  game.step(STEP, { [moveKey]: true, [jumpKey]: true }, { [jumpKey]: true }, noReleases);
  for (let frame = 0; frame < 40 && player.y > GOAL_GEOMETRY.bottomY; frame += 1) {
    game.step(STEP, { [moveKey]: true }, noEdges, noReleases);
  }
  assert.ok(player.y <= GOAL_GEOMETRY.bottomY, `${side} double-jump should rise above the platform before landing`);
  for (let frame = 0; frame < 100 && player.y <= GOAL_GEOMETRY.bottomY; frame += 1) {
    game.step(STEP, { [moveKey]: true }, noEdges, noReleases);
  }
  assert.ok(Math.abs(player.y - GOAL_GEOMETRY.bottomY) < 0.01,
    `${side} double-jump should land on the raised goal platform: ${JSON.stringify({ x: player.x, y: player.y, vy: player.vy })}`);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const { ball } = placeShot(game, side, {
    playerX: side === 'left' ? GOAL_GEOMETRY.leftLineX + 420 : GOAL_GEOMETRY.rightLineX - 420,
  });
  ball.x = side === 'left' ? GOAL_GEOMETRY.leftLineX + 45 : GOAL_GEOMETRY.rightLineX - 45;
  ball.y = 619;
  ball.vx = side === 'left' ? -900 : 900;
  ball.vy = 0;
  for (let frame = 0; frame < 18; frame += 1) game.step(STEP, NEUTRAL, noEdges, noReleases);
  assert.deepEqual(game.state.score, [0, 0], `${side} low rolling ball must hit the raised platform/entrance, not score`);
  assert.ok(side === 'left' ? ball.vx > 0 && ball.x >= GOAL_GEOMETRY.leftLineX + 32
    : ball.vx < 0 && ball.x <= GOAL_GEOMETRY.rightLineX - 32,
  `${side} low ball should rebound on the goal lip: ${JSON.stringify(ball)}`);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const playerX = side === 'left' ? GOAL_GEOMETRY.leftLineX + 420 : GOAL_GEOMETRY.rightLineX - 420;
  const { ball, index } = placeShot(game, side, { playerX });
  fireEdge(game, index === 0 ? 'blueQuickKick' : 'redQuickKick');
  assert.equal(ball.kickSequence, 1, `${side} ordinary X/Space input must create a real shot`);
  simulateUntilGoal(game);
  assert.equal(game.state.mode, 'goal', `${side} medium-distance X/Space shot should clear the raised lip and score; ball=${JSON.stringify(ball)}`);
  assert.equal(game.state.score[side === 'left' ? 1 : 0], 1);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const { player, ball, index } = placeShot(game, side, {
    playerX: side === 'left' ? GOAL_GEOMETRY.leftLineX + 90 : GOAL_GEOMETRY.rightLineX - 90,
    ballY: 520,
  });
  player.y = 710;
  player.vy = -260;
  player.jumpsUsed = 1;
  fireEdge(game, index === 0 ? 'blueQuickKick' : 'redQuickKick');
  assert.equal(ball.kickSequence, 1, `${side} jump shot must use a genuine quick-kick edge`);
  simulateUntilGoal(game);
  assert.equal(game.state.mode, 'goal', `${side} near-distance airborne quick shot should score`);
  assert.equal(game.state.score[side === 'left' ? 1 : 0], 1);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const { player, ball, index } = placeShot(game, side, {
    playerX: side === 'left' ? GOAL_GEOMETRY.leftLineX + 1168 : GOAL_GEOMETRY.rightLineX - 1168,
    charge: 1,
    power: 100,
  });
  fireEdge(game, index === 0 ? 'bluePower1' : 'redPower1');
  assert.equal(ball.kickSequence, 1, `${side} Cannon should fire through the normal contact/kick path`);
  assert.equal(ball.lastKickStyle, 'cannon');
  simulateUntilGoal(game);
  assert.equal(game.state.mode, 'goal', `${side} charged Cannon shot from distance should score through the high mouth`);
  assert.equal(game.state.score[side === 'left' ? 1 : 0], 1);
}

for (const side of ['left', 'right']) {
  for (const y of [GOAL_GEOMETRY.topY + 31, GOAL_GEOMETRY.bottomY - 31]) {
    const game = makeGame();
    const ball = game.state.ball;
    ball.x = side === 'left' ? GOAL_GEOMETRY.leftLineX - 34 : GOAL_GEOMETRY.rightLineX + 34;
    ball.y = y;
    ball.vx = side === 'left' ? -1200 : 1200;
    ball.vy = 0;
    game.step(STEP, NEUTRAL, noEdges, noReleases);
    assert.deepEqual(game.state.score, [0, 0], `${side} whole ball outside ${y < 300 ? 'top' : 'bottom'} of aperture must not score`);
  }
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const defenderIndex = 0;
  const shooterIndex = 1;
  const defender = game.state.players[defenderIndex];
  defender.x = side === 'left'
    ? GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
    : GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH;
  defender.y = FLOOR_Y;
  defender.vx = 0;
  defender.vy = 0;
  const shooter = game.state.players[shooterIndex];
  const direction = side === 'left' ? -1 : 1;
  shooter.x = side === 'left'
    ? GOAL_GEOMETRY.leftLineX + 420
    : GOAL_GEOMETRY.rightLineX - 420;
  shooter.y = FLOOR_Y;
  shooter.facing = direction;
  shooter.charge = 1;
  shooter.power = 100;
  shooter.vx = 0;
  shooter.vy = 0;
  shooter.abilities = [0, 0, 0, 0, 0];
  shooter.cannonTime = 0;
  const ball = game.state.ball;
  ball.x = shooter.x + direction * 50;
  ball.y = 798;
  ball.vx = 0;
  ball.vy = 0;
  ball.spin = 0;
  ball.ignoredPlayer = -1;
  ball.ignorePlayerTime = 0;
  const defenderSide = 'blue';
  const expectedBlockedKickId = ball.kickSequence + 1;
  const input = {
    redPower1: true,
    blueJump: true,
  };
  const edges = { ...input };
  game.step(STEP, input, edges, noReleases);
  for (let frame = 0; frame < 90 && game.state.mode === 'playing'
    && ball.blockedKickId !== expectedBlockedKickId; frame += 1) {
    game.step(STEP, NEUTRAL, noEdges, noReleases);
  }
  assert.equal(ball.kickSequence, expectedBlockedKickId, `${side} defender fixture must receive one real Cannon shot`);
  assert.equal(ball.blockedKickId, expectedBlockedKickId,
    `${side} shot must be marked blocked by player contact, not merely stop or reverse at a wall: ${JSON.stringify(ball)}`);
  assert.equal(game.state.lastTouch, defenderSide,
    `${side} block marker must coincide with the defender being the last player to touch the ball`);
  assert.equal(game.state.score[side === 'left' ? 0 : 1], 0,
    `${side} jumping defender should be able to block the high shot`);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const { ball } = placeShot(game, side, {
    playerX: side === 'left' ? GOAL_GEOMETRY.leftLineX + 420 : GOAL_GEOMETRY.rightLineX - 420,
    charge: 1,
    power: 100,
  });
  const direction = side === 'left' ? -1 : 1;
  ball.x = side === 'left' ? GOAL_GEOMETRY.leftLineX - 31 : GOAL_GEOMETRY.rightLineX + 31;
  ball.y = (GOAL_GEOMETRY.topY + GOAL_GEOMETRY.bottomY) / 2;
  ball.vx = direction * 1200;
  ball.vy = 0;
  game.step(STEP, NEUTRAL, noEdges, noReleases);
  assert.equal(game.state.mode, 'goal', `${side} valid whole-ball line crossing should score`);
  assert.equal(game.state.score[side === 'left' ? 1 : 0], 1);
  for (let frame = 0; frame < 100; frame += 1) game.step(STEP, NEUTRAL, noEdges, noReleases);
  assert.equal(game.state.score[side === 'left' ? 1 : 0], 1, `${side} scoring transition must award only one goal`);
  game.restart();
  assert.deepEqual(game.state.score, [0, 0], `${side} restart should clear score and goal state`);
}

for (const side of ['left', 'right']) {
  const game = makeGame();
  const ball = game.state.ball;
  ball.x = side === 'left' ? -1554.309 : 1600 + 1554.309;
  ball.y = 618;
  ball.vx = side === 'left' ? -0.0503 : 0.0503;
  ball.vy = -2.9934;
  for (let frame = 0; frame < 240; frame += 1) game.step(STEP, NEUTRAL, noEdges, noReleases);
  assert.ok(ball.x >= BALL_RADIUS && ball.x <= WIDTH - BALL_RADIUS, `${side} far-outside ball must be corrected into finite world bounds: ${JSON.stringify(ball)}`);
  assert.deepEqual(game.state.score, [0, 0], `${side} far-outside stale ball must not score`);
}

{
  const game = new FootballGame();
  game.start({ matchType: 'ai', difficulty: 'normal', duration: 60 });
  const ai = game.state.players[1];
  const blue = game.state.players[0];
  ai.x = GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH - 12;
  ai.y = FLOOR_Y;
  ai.facing = -1;
  ai.charge = 1;
  ai.power = 35;
  ai.abilities = [0, 0, 0, 0, 0];
  ai.kickCooldown = 0;
  blue.x = 90;
  blue.y = FLOOR_Y;
  Object.assign(game.state.ball, { x: ai.x - 50, y: FLOOR_Y - BALL_RADIUS, vx: 0, vy: 0, spin: 0 });
  game.state.aiKickoffDelay = 0;
  const command = game.getAICommand(STEP);
  assert.equal(command.powers?.[0], true, `far CPU shot should select its shared Cannon skill when a normal arc cannot reach: ${JSON.stringify(command)}`);
  game.step(STEP, NEUTRAL, noEdges, noReleases);
  assert.equal(game.state.ball.lastKickStyle, 'cannon');
  simulateUntilGoal(game);
  assert.equal(game.state.mode, 'goal', 'CPU Cannon trajectory should reach the elevated mouth from distance');
}

{
  const game = new FootballGame();
  game.start({ matchType: 'ai', difficulty: 'normal', duration: 60 });
  const ai = game.state.players[1];
  ai.x = GOAL_GEOMETRY.rightLineX - 58;
  ai.y = FLOOR_Y;
  ai.aiJumpCooldown = 0;
  Object.assign(game.state.ball, { x: GOAL_GEOMETRY.rightLineX - 80, y: 600, vx: 700, vy: 0, spin: 0 });
  game.state.aiKickoffDelay = 0;
  const command = game.getAICommand(STEP);
  assert.equal(command.jump, true, `CPU keeper should jump when the predicted goal-mouth height is blockable: ${JSON.stringify(command)}`);
}

console.log(JSON.stringify({ result: 'PASS', geometry: GOAL_GEOMETRY, groups: 11 }));
