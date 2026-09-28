// Controls v2 unit test: strafe movement, turn keys, dt scaling, legacy input.
// Stub scene — no GPU needed. Run: npm test (chains smoke + controls).
import { Player } from '../src/Player.js';

const stubScene = { createEntity: async () => ({ setPosition() {}, physics: { isStatic: false } }) };
const config = { playerSpeed: 0.05, rotationSpeed: 0.03 };
const DT = 0.016;

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`ok: ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL: ${name}: ${e.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(m); }
async function mkPlayer() {
  const p = new Player(stubScene, config);
  await p.ready;
  p.position = { x: 5, z: 5 };
  p.rotation = Math.PI; // facing -z, like spawn
  return p;
}
const input = (over = {}) => ({ moveX: 0, moveZ: 0, deltaTime: DT, ...over });

await check('W walks forward (-z when facing pi)', async () => {
  const p = await mkPlayer();
  p.update(input({ moveZ: -1 }), []);
  assert(p.position.z < 5 && p.position.x === 5, `pos ${p.position.x},${p.position.z}`);
});

await check('D strafes to the camera-right at every heading', async () => {
  // Right-hand basis: right = up x forward. With the player facing -z (the
  // spawn heading) and a chase camera directly behind, that is world +x.
  const p = await mkPlayer();
  p.update(input({ moveX: 1 }), []);
  assert(p.position.x > 5 && p.position.z === 5, `pos ${p.position.x},${p.position.z} should move +x`);
  assert(p.rotation === Math.PI, 'heading unchanged');

  // ...and the sign must hold all the way round, not just at spawn.
  for (const rot of [0, Math.PI / 2, -Math.PI / 2, 2.4]) {
    const q = await mkPlayer();
    q.rotation = rot;
    // World-space right = up x forward = (-cos r, sin r)
    const wantX = -Math.cos(rot);
    const wantZ = Math.sin(rot);
    const before = { ...q.position };
    q.update(input({ moveX: 1 }), []);
    const dx = q.position.x - before.x;
    const dz = q.position.z - before.z;
    const dot = dx * wantX + dz * wantZ;
    assert(dot > 0, `D moved the wrong way at rot ${rot.toFixed(2)}: (${dx.toFixed(3)},${dz.toFixed(3)})`);
  }
});

await check('Q/E turn opposite directions', async () => {
  const p = await mkPlayer();
  p.update(input({ turnLeft: true }), []);
  const afterQ = p.rotation;
  p.update(input({ turnRight: true }), []);
  assert(afterQ < Math.PI && p.rotation === Math.PI, `rot ${afterQ} -> ${p.rotation}`);
});

await check('double dt doubles distance', async () => {
  const a = await mkPlayer();
  const b = await mkPlayer();
  a.update(input({ moveZ: -1, deltaTime: DT }), []);
  b.update(input({ moveZ: -1, deltaTime: DT * 2 }), []);
  const da = 5 - a.position.z;
  const db = 5 - b.position.z;
  assert(Math.abs(db - 2 * da) < 1e-9, `${da} vs ${db}`);
});

await check('legacy boolean input still walks', async () => {
  const p = await mkPlayer();
  p.update({ forward: true, deltaTime: DT }, []);
  assert(p.position.z < 5, `pos ${p.position.z}`);
});

await check('walls block movement', async () => {
  const p = await mkPlayer();
  p.update(input({ moveX: 1 }), [{ x: 5.4, z: 5 }]);
  assert(p.position.x === 5, `moved into wall: ${p.position.x}`);
});

await check('player opts out of SDK physics (game-owned collision)', async () => {
  const p = await mkPlayer();
  assert(p.entity.physics.isStatic === true, 'player body must be static');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
