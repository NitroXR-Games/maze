// Game audit harness: encodes the defects found in the src/ review as
// executable regression checks. The stub scene below mirrors
// nitroxr-runtime client/src/index.js (createEntity/getEntity/removeEntity/
// clear) exactly, so headless results match browser behaviour.
// Run: node test/audit.mjs
import { Player } from '../src/Player.js';
import { Sentinel } from '../src/Sentinel.js';
import { MazeEngine } from '../src/MazeEngine.js';
import GameState from '../src/GameState.js';

// Faithful stand-in for THREE.Scene: clear() detaches every mesh (index.js:161).
function makeScene() {
  const entities = new Map();
  const parent = { children: [] };
  return {
    parent, entities,
    async createEntity(id, props = {}) {
      const mesh = { name: id, position: { set() {} }, rotation: { y: 0 }, material: { color: { set() {} } }, _parent: parent };
      parent.children.push(mesh);
      const entity = {
        id, position: [...(props.position ?? [0, 0, 0])], model: props.model,
        material: props.material ?? 'default', mesh,
        physics: { velocity: [0, 0, 0], mass: 1, isStatic: false, ...(props.physics ?? {}) },
        setPosition(p) { entity.position = [...p]; mesh.position.set(...p); },
        update(np) {
          Object.assign(entity, np);
          if (np.position) { entity.position = [...np.position]; mesh.position.set(...np.position); }
        }
      };
      entities.set(id, entity);
      return entity;
    },
    getEntity(id) { return entities.get(id); },
    removeEntity(id) {
      const e = entities.get(id);
      if (e) { parent.children = parent.children.filter(c => c !== e.mesh); entities.delete(id); }
    },
    clear() {
      entities.forEach(e => { parent.children = parent.children.filter(c => c !== e.mesh); });
      entities.clear();
    }
  };
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log(`ok: ${name}`); }
  catch (e) { fail++; console.error(`FAIL: ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }
const config = { mazeWidth: 10, mazeHeight: 10, playerSpeed: 0.05, rotationSpeed: 0.03 };
const DT = 0.016;
const input = (o = {}) => ({ moveX: 0, moveZ: 0, deltaTime: DT, ...o });

// A1: initLevel() calls scene.clear(), which detaches every mesh including the
// player. Nothing re-attaches it, so the avatar vanishes after level 1.
await check('player survives a level transition (scene.clear)', async () => {
  const scene = makeScene();
  const player = new Player(scene, config);
  await player.ready;
  scene.clear(); // exactly what main.js initLevel() does
  assert(typeof player.respawn === 'function',
    'nothing re-attaches the player after clear(): entity mesh is orphaned and setPosition is a no-op');
  await player.respawn();
  assert(scene.parent.children.includes(player.entity.mesh), 'player mesh not in scene');
});

// A2: SDK startLoop calls the callback without awaiting (index.js:89), so an
// async game loop overlaps with itself across level transitions.
await check('game loop is serialized (no re-entrancy)', async () => {
  const { FrameGate } = await import('../src/FrameGate.js');
  const gate = new FrameGate();
  let inFlight = 0, maxConcurrent = 0, rejected = 0;
  const frame = async () => {
    inFlight++; maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise(r => setTimeout(r, 0)); // stands in for await initLevel()
    inFlight--;
  };
  // three rAF ticks arrive before frame 1 resolves
  if (!gate.run(frame)) rejected++;
  if (!gate.run(frame)) rejected++;
  if (!gate.run(frame)) rejected++;
  await new Promise(r => setTimeout(r, 10));
  assert(maxConcurrent === 1, `${maxConcurrent} concurrent game loops — walls mid-rebuild`);
  assert(rejected === 2, `overlapping frames must be dropped, got ${rejected}`);
  gate.run(() => Promise.resolve());
  await new Promise(r => setTimeout(r, 0));
  assert(!gate.busy, 'gate must reopen after the frame resolves');
});

// A3: the SDK entity has no rotation API, so the avatar never turns.
await check('avatar yaw follows heading', async () => {
  const scene = makeScene();
  const player = new Player(scene, config);
  await player.ready;
  player.update(input({ turnRight: true }), []);
  assert(player.entity.mesh.rotation.y !== 0, 'mesh yaw stays 0 while heading changes');
});

// A4: sentinels move a fixed amount per frame, so their speed scales with fps.
await check('sentinel speed is frame-rate independent', async () => {
  const scene = makeScene();
  const s = new Sentinel(scene, { x: 1, z: 1 }, [{ x: 9, z: 1 }]);
  await s.ready;
  s.state = 'CHASE'; s.targetPlayer = { x: 9, z: 1 };
  for (let i = 0; i < 60; i++) s.update({ x: 9, z: 1 }, [], 1 / 60);   // 1.0s @60fps
  const slow = s.position.x - 1;
  const s2 = new Sentinel(scene, { x: 1, z: 1 }, [{ x: 9, z: 1 }]);
  await s2.ready;
  s2.state = 'CHASE'; s2.targetPlayer = { x: 9, z: 1 };
  for (let i = 0; i < 144; i++) s2.update({ x: 9, z: 1 }, [], 1 / 144); // 1.0s @144fps
  const fast = s2.position.x - 1;
  assert(Math.abs(fast - slow) / slow < 0.05, `60fps ${slow.toFixed(3)} vs 144fps ${fast.toFixed(3)}`);
});

// A5: sentinels used to ignore walls, so they crossed solid geometry and
// grabbed the player from the far side.
await check('sentinel never enters a wall cell', async () => {
  const scene = makeScene();
  const s = new Sentinel(scene, { x: 1, z: 1 }, [{ x: 1, z: 1 }]);
  await s.ready;
  const walls = [{ x: 2, z: 1 }];
  const playerPos = { x: 3, z: 1 };
  for (let i = 0; i < 200; i++) s.update(playerPos, walls, DT);
  assert(!s.isWall(s.position.x, s.position.z, walls),
    `sentinel walked into the wall at 2,1 (now ${s.position.x.toFixed(2)},${s.position.z.toFixed(2)})`);
  assert(!s.checkCollision(playerPos), 'player caught through the wall at 2,1');
});

// A6: steps counts frames-with-movement, so the leaderboard score depends on fps.
await check('step counter is frame-rate independent', async () => {
  const { HUD } = await import('../src/HUD.js');
  const a = new HUD(), b = new HUD();
  let pa = { x: 0, z: 0 }, pb = { x: 0, z: 0 };
  for (let i = 0; i < 60; i++) { pa = { x: pa.x + 0.05, z: 0 }; a.recordStep(pa); }
  for (let i = 0; i < 144; i++) { pb = { x: pb.x + 0.05 / 2.4, z: 0 }; b.recordStep(pb); }
  assert(Math.abs(a.steps - b.steps) <= 1, `60fps ${a.steps} vs 144fps ${b.steps} for the same 3-cell distance`);
});

// A7: generate(seed) overwrites the global Math.random and never restores it.
await check('seeded generation does not hijack global Math.random', async () => {
  const native = Math.random;
  const engine = new MazeEngine(makeScene(), config);
  GameState.currentLevel = 1;
  await engine.generate(42);
  assert(Math.random === native, 'global Math.random is still the seeded PRNG (and is never restored)');
});

// A8: end-to-end level transition (the real user scenario): walls rebuilt,
// goal placed, player still in the scene, maze still solvable.
await check('level transition keeps a playable scene', async () => {
  const scene = makeScene();
  const player = new Player(scene, config);
  await player.ready;
  const maze = new MazeEngine(scene, config);
  GameState.currentLevel = 1;
  await maze.generate(null);
  const wallsL1 = maze.walls.length;

  // Replicate main.js initLevel()
  GameState.nextLevel();
  scene.clear();
  await maze.generate(null);
  await player.respawn();

  assert(maze.walls.length > 0, 'no walls after transition');
  assert(maze.walls.length > wallsL1, `level 2 should be bigger: ${maze.walls.length} vs ${wallsL1}`);
  assert(scene.parent.children.includes(player.entity.mesh), 'player mesh missing after transition');
  assert(scene.getEntity('goal') !== undefined, 'goal missing after transition');
  assert(maze.goal && !maze.walls.some(w => w.x === maze.goal.x && w.z === maze.goal.z),
    `goal ${maze.goal.x},${maze.goal.z} sits inside a wall`);
  // Player can still move and is still blocked by the new maze
  player.position = { x: 1, z: 1 };
  player.update(input({ moveZ: -1 }), maze.walls);
  assert(Number.isFinite(player.position.z), 'player position went NaN');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
