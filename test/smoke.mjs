// Headless smoke test: game logic + live cloud wiring, no GPU required.
// Run: npm test
import GameState from '../src/GameState.js';
import { NitroXR, GAME_ID } from '../src/nitroxr.js';
import { compressPath, decompressPath } from '@nitroxr/runtime';

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

await check('GameState level flow', () => {
  assert(GameState.currentLevel === 1, 'starts at level 1');
  assert(GameState.nextLevel() === true && GameState.currentLevel === 2, 'advances');
});

await check('SDK points at production cloud', () => {
  assert(NitroXR.Cloud.endpoint === 'https://cloud.nitroxr.com', `endpoint ${NitroXR.Cloud.endpoint}`);
  assert(GAME_ID === 'maze', 'game id');
});

await check('live registry resolves maze wall', async () => {
  const asset = await NitroXR.Cloud.resolveAsset('maze_wall_concrete');
  assert(asset.org === 'nitroxr-games' && asset.game === 'maze', 'namespace');
  assert(asset.glb_url.includes('/nitroxr-games/maze/'), `url ${asset.glb_url}`);
});

await check('ghost payload roundtrips', () => {
  const pts = [{ x: 1, y: 0.5, z: 1, t: 0 }, { x: 2, y: 0.5, z: 1, t: 500 }];
  const back = decompressPath(compressPath(pts));
  assert(back.length === 2 && Math.abs(back[1].x - 2) < 0.001, 'roundtrip');
});

await check('live leaderboard reachable', async () => {
  const board = await NitroXR.Cloud.getLeaderboard('maze', 5);
  assert(Array.isArray(board.scores), 'scores array');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
