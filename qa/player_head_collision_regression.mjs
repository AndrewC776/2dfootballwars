import assert from 'node:assert/strict';
import { FootballGame, GOAL_GEOMETRY, PLAYER_HALF_WIDTH, getPlayerRenderPose } from '../engine.js';

const STEP = 1 / 120;
const FLOOR_Y = 830;
const BALL_RADIUS = 32;

function makeGame() {
  const game = new FootballGame();
  game.start({ matchType: 'local', duration: 60 });
  return game;
}

for (const side of ['blue', 'red']) {
  for (const stance of ['standing', 'jumping']) {
    for (const shot of [
      { name: 'X', vx: 760, vy: -660 },
      { name: 'Cannon', vx: 1040, vy: -840 },
    ]) {
      const game = makeGame();
      const playerIndex = side === 'blue' ? 0 : 1;
      const player = game.state.players[playerIndex];
      const other = game.state.players[1 - playerIndex];
      const direction = side === 'blue' ? 1 : -1;
      player.x = 800;
      player.y = stance === 'standing' ? FLOOR_Y : 700;
      player.facing = direction;
      player.charge = 1;
      player.vx = 0;
      player.vy = stance === 'standing' ? 0 : -420;
      other.x = 200;
      other.y = FLOOR_Y;
      const head = getPlayerRenderPose(player, game.state.elapsed).headWorld;
      const ball = game.state.ball;
      const verticalSpeedAtStep = shot.vy + 1050 * STEP;
      Object.assign(ball, {
        x: head.x - direction * (Math.max(head.rx, head.ry) + BALL_RADIUS + 6),
        y: head.y - verticalSpeedAtStep * STEP,
        vx: direction * shot.vx,
        vy: shot.vy,
        ignoredPlayer: -1,
        ignorePlayerTime: 0,
      });

      game.updateBall(STEP);

      assert.equal(game.state.lastTouch, side,
        `${side} ${stance} visible head must contact the ${shot.name} path: ${JSON.stringify({ head, ball, lastTouch: game.state.lastTouch })}`);
    }
  }
}

for (const wall of ['left', 'right']) {
  const game = makeGame();
  const [blue, red] = game.state.players;
  blue.x = red.x = wall === 'left' ? 90 : 1510;
  blue.y = red.y = FLOOR_Y;
  blue.facing = wall === 'left' ? 1 : -1;
  red.facing = -blue.facing;
  blue.charge = red.charge = 1;
  game.step(STEP, {}, {}, {});

  const blueHead = getPlayerRenderPose(blue, game.state.elapsed).headWorld;
  const redHead = getPlayerRenderPose(red, game.state.elapsed).headWorld;
  const headGap = Math.abs(redHead.x - blueHead.x);
  assert.ok(headGap >= blueHead.rx + redHead.rx,
    `${wall} wall separation must prevent rendered head overlap after one step: ${JSON.stringify({ blueHead, redHead, headGap })}`);
}

for (const platform of ['left', 'right']) {
  const game = makeGame();
  const [blue, red] = game.state.players;
  const platformWall = platform === 'left'
    ? GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
    : GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH;
  blue.x = red.x = platform === 'left' ? platformWall - 1 : platformWall + 1;
  blue.y = red.y = GOAL_GEOMETRY.bottomY;
  blue.facing = platform === 'left' ? 1 : -1;
  red.facing = -blue.facing;
  blue.charge = red.charge = 1;
  game.step(STEP, {}, {}, {});

  const blueHead = getPlayerRenderPose(blue, game.state.elapsed).headWorld;
  const redHead = getPlayerRenderPose(red, game.state.elapsed).headWorld;
  const headGap = Math.abs(redHead.x - blueHead.x);
  assert.ok(headGap >= blueHead.rx + redHead.rx,
    `${platform} goal platform separation must prevent rendered head overlap: ${JSON.stringify({ blue, red, blueHead, redHead, headGap })}`);
  const remainOutsideBrick = platform === 'left'
    ? [blue, red].every((player) => player.y <= GOAL_GEOMETRY.bottomY + 0.01 || player.x >= platformWall)
    : [blue, red].every((player) => player.y <= GOAL_GEOMETRY.bottomY + 0.01 || player.x <= platformWall);
  assert.ok(remainOutsideBrick,
    `${platform} goal platform sidewall must keep players out of the brick: ${JSON.stringify({ blue, red })}`);

  const platformTop = makeGame();
  const [standing, distant] = platformTop.state.players;
  standing.x = platform === 'left' ? GOAL_GEOMETRY.leftLineX : GOAL_GEOMETRY.rightLineX;
  standing.y = GOAL_GEOMETRY.bottomY;
  distant.x = platform === 'left' ? 900 : 700;
  platformTop.step(STEP, {}, {}, {});
  assert.equal(standing.y, GOAL_GEOMETRY.bottomY, `${platform} raised top remains standable`);
}

console.log(JSON.stringify({ result: 'PASS', headCases: 8, wallCases: 2, platformCases: 2 }));
