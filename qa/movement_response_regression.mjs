import assert from 'node:assert/strict';
import { FootballGame, GOAL_GEOMETRY, PLAYER_HALF_WIDTH } from '../engine.js';

const STEP = 1 / 120;
const FRAMES_100MS = 12;

function makeFixture() {
  const game = new FootballGame();
  game.start({ matchType: 'local', duration: 60 });
  const [blue, red] = game.state.players;
  blue.x = 800;
  blue.y = 830;
  blue.vx = 0;
  blue.vy = 0;
  red.x = 1450;
  red.y = 830;
  game.state.ball.x = 1200;
  game.state.ball.y = 300;
  return { game, blue, red };
}

function runPlayer(game, player, command, frames) {
  for (let frame = 0; frame < frames; frame += 1) game.updatePlayer(player, command, 0, STEP);
}

{
  const { game, blue } = makeFixture();
  const startX = blue.x;
  runPlayer(game, blue, { right: true }, FRAMES_100MS);
  assert.ok(blue.x - startX >= 12, `100 ms move should be immediately visible; dx=${blue.x - startX}, vx=${blue.vx}`);
  assert.ok(blue.vx >= 230, `100 ms move should build useful velocity; vx=${blue.vx}`);
  runPlayer(game, blue, { right: true }, 108);
  assert.ok(blue.x - startX >= 450 && blue.x - startX <= 540,
    `normal one-second travel should remain agile without sprint; dx=${blue.x - startX}, vx=${blue.vx}`);
}

{
  const { game, blue } = makeFixture();
  runPlayer(game, blue, { right: true }, 120);
  assert.ok(blue.vx > 500, `normal run should reach the intended speed band; vx=${blue.vx}`);
  runPlayer(game, blue, { left: true }, FRAMES_100MS);
  assert.ok(blue.vx < 0, `opposite input should reverse velocity within 100 ms; vx=${blue.vx}`);
}

{
  const { game, blue } = makeFixture();
  runPlayer(game, blue, { right: true }, 120);
  const releaseX = blue.x;
  runPlayer(game, blue, {}, FRAMES_100MS);
  assert.ok(Math.abs(blue.vx) < 1, `released movement should stop within 100 ms; vx=${blue.vx}`);
  assert.ok(blue.x - releaseX <= 25, `release drift should stay within 25 px; dx=${blue.x - releaseX}`);
}

{
  const { game, blue } = makeFixture();
  runPlayer(game, blue, { slide: true }, 1);
  const slideStartX = blue.x;
  assert.ok(blue.slideTime > 0.4 && Math.abs(blue.vx) >= 250, `slide should start with a coast window; time=${blue.slideTime}, vx=${blue.vx}`);
  runPlayer(game, blue, {}, 6);
  assert.ok(blue.slideTime > 0.35 && Math.abs(blue.vx) > 230 && Math.abs(blue.x - slideStartX) >= 11,
    `released slide should retain visible momentum; time=${blue.slideTime}, vx=${blue.vx}, dx=${blue.x - slideStartX}`);
  while (blue.slideTime > 0) game.updatePlayer(blue, {}, 0, STEP);
  runPlayer(game, blue, {}, FRAMES_100MS);
  assert.ok(Math.abs(blue.vx) < 1, `movement should stop promptly after slide ends; vx=${blue.vx}`);

  const body = makeFixture();
  body.blue.x = 800;
  body.red.x = 910;
  body.blue.facing = 1;
  for (let frame = 0; frame < 30; frame += 1) body.game.step(STEP, { blueSlide: true }, {}, {});
  assert.ok(Math.abs(body.red.x - body.blue.x) >= 74 - 0.1,
    `slide must not pass through the opponent; blue=${body.blue.x}, red=${body.red.x}`);

  const wall = makeFixture();
  wall.blue.x = 110;
  wall.blue.facing = -1;
  wall.game.updatePlayer(wall.blue, { slide: true }, 0, STEP);
  runPlayer(wall.game, wall.blue, {}, 70);
  assert.ok(wall.blue.x >= 90 && wall.blue.x <= 1510,
    `slide must stay inside the world bounds; x=${wall.blue.x}`);
}

{
  const normal = makeFixture();
  runPlayer(normal.game, normal.blue, { right: true }, 120);
  const normalTravel = normal.blue.x - 800;

  const sprint = makeFixture();
  runPlayer(sprint.game, sprint.blue, { right: true, sprint: true }, 120);
  const sprintTravel = sprint.blue.x - 800;
  assert.ok(sprintTravel > normalTravel * 1.1, `sprint should remain meaningfully faster; normal=${normalTravel}, sprint=${sprintTravel}`);
  assert.ok(sprint.blue.stamina < 85, `sprint should retain its stamina cost; stamina=${sprint.blue.stamina}`);
}

{
  const ground = makeFixture();
  runPlayer(ground.game, ground.blue, { right: true }, FRAMES_100MS);
  const air = makeFixture();
  air.blue.y = 700;
  air.blue.vy = -80;
  runPlayer(air.game, air.blue, { right: true }, FRAMES_100MS);
  assert.ok(Math.abs((air.blue.x - 800) - (ground.blue.x - 800)) < 0.1,
    `air steering should remain responsive; ground=${ground.blue.x - 800}, air=${air.blue.x - 800}`);
}

{
  const { game, blue } = makeFixture();
  game.state.ball.x = blue.x + 55;
  game.state.ball.y = blue.y - 32;
  for (let frame = 0; frame < 120; frame += 1) game.step(STEP, { blueRight: true }, {}, {});
  assert.ok(blue.x - 800 >= 450, `carrying the ball should not slow normal movement; dx=${blue.x - 800}, vx=${blue.vx}`);
  assert.ok(game.state.ball.x - blue.x >= 30 && game.state.ball.x - blue.x <= 65,
    `carried ball should stay near the player's foot; gap=${game.state.ball.x - blue.x}`);
}

{
  const { game, blue, red } = makeFixture();
  red.x = blue.x + 150;
  game.state.ball.x = 1200;
  for (let frame = 0; frame < 120; frame += 1) game.step(STEP, { blueRight: true }, {}, {});
  assert.ok(Math.abs(red.x - blue.x) >= 74 - 0.1, `players must remain physically separated; blue=${blue.x}, red=${red.x}`);
  assert.ok(blue.vx > 450, `body contact must not drain velocity while input remains held; vx=${blue.vx}`);
  const contactX = blue.x;
  for (let frame = 0; frame < FRAMES_100MS; frame += 1) game.step(STEP, { blueLeft: true }, {}, {});
  assert.ok(blue.vx < 0, `opposite input should let a player disengage after contact; vx=${blue.vx}`);
  for (let frame = 0; frame < FRAMES_100MS; frame += 1) game.step(STEP, { blueLeft: true }, {}, {});
  assert.ok(blue.x < contactX, `player should move away from contact promptly; before=${contactX}, after=${blue.x}`);
}

for (const side of ['left', 'right']) {
  const world = makeFixture();
  world.blue.x = side === 'left' ? 92 : 1508;
  runPlayer(world.game, world.blue, { left: side === 'left', right: side === 'right' }, 60);
  assert.ok(world.blue.x >= 90 && world.blue.x <= 1510, `${side} world edge must remain solid; x=${world.blue.x}`);
  assert.equal(world.blue.vx, side === 'left' ? 0 : 0, `${side} world edge should absorb outward velocity`);

  const platform = makeFixture();
  const wall = side === 'left'
    ? GOAL_GEOMETRY.leftLineX + PLAYER_HALF_WIDTH
    : GOAL_GEOMETRY.rightLineX - PLAYER_HALF_WIDTH;
  platform.blue.y = GOAL_GEOMETRY.bottomY + 50;
  platform.blue.x = side === 'left' ? wall + 14 : wall - 14;
  runPlayer(platform.game, platform.blue, { left: side === 'left', right: side === 'right' }, 30);
  assert.equal(platform.blue.x, wall, `${side} raised platform sidewall should constrain movement`);
}

function rollBall(step, frames) {
  const game = new FootballGame();
  game.start({ matchType: 'local', duration: 60 });
  for (const player of game.state.players) player.active = false;
  const ball = game.state.ball;
  ball.x = 800;
  ball.y = 830 - 32;
  ball.vx = 500;
  ball.vy = 0;
  for (let frame = 0; frame < frames; frame += 1) game.updateBall(step);
  return { travel: ball.x - 800, speed: ball.vx };
}

{
  const at120Hz = rollBall(1 / 120, 120);
  const at60Hz = rollBall(1 / 60, 60);
  assert.ok(at120Hz.travel >= 250 && at120Hz.travel <= 400,
    `ground ball should keep rolling after one second; travel=${at120Hz.travel}, speed=${at120Hz.speed}`);
  assert.ok(at120Hz.speed >= 125 && at120Hz.speed <= 200,
    `ground friction should retain 25-40% speed after one second; speed=${at120Hz.speed}`);
  assert.ok(Math.abs(at120Hz.speed - at60Hz.speed) < 5,
    `rolling friction should be time-step independent; 120Hz=${at120Hz.speed}, 60Hz=${at60Hz.speed}`);
}

{
  const { game, blue, red } = makeFixture();
  red.x = 800;
  red.vx = 0;
  for (let frame = 0; frame < FRAMES_100MS; frame += 1) {
    game.step(STEP, { blueRight: true, redLeft: true }, {}, {});
  }
  assert.ok(blue.vx > 0 && red.vx < 0, `local players must retain independent opposite controls; blue=${blue.vx}, red=${red.vx}`);
}

console.log(JSON.stringify({ result: 'PASS', scenarios: 11 }));
