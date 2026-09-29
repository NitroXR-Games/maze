// LevelEditor layout persistence. Stubs NitroXR.Cloud and localStorage so the
// cloud/local fallback matrix can be exercised headlessly - that matrix is
// exactly where authored work silently disappears.
// Run: node test/layouts.mjs
import { LevelEditor } from '../src/LevelEditor.js';
import { NitroXR } from '../src/nitroxr.js';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log(`ok: ${name}`); }
  catch (e) { fail++; console.error(`FAIL: ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

function installLocalStorage(initial = {}) {
  const data = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
  return globalThis.localStorage;
}

// A scene/maze pair just real enough for loadLayout's rebuild path.
function harness(walls = [{ x: 1, z: 1 }, { x: 2, z: 2 }]) {
  const built = [];
  const maze = {
    walls: walls.map(w => ({ ...w })),
    async addWall(x, z) { this.walls.push({ x, z }); built.push({ x, z }); },
    async generateGoal() { this.goalGenerated = true; },
  };
  const scene = {
    entities: new Set(),
    async createEntity(id) { this.entities.add(id); },
    async removeEntity(id) { this.entities.delete(id); },
    clear() { this.entities.clear(); },
  };
  let respawns = 0;
  const player = { async respawn() { respawns++; }, get respawns() { return respawns; } };
  const editor = new LevelEditor(scene, maze, player);
  return { editor, maze, scene, built, player };
}

function stubCloud({ save, get, del }) {
  const orig = { save: NitroXR.Cloud.saveLayout, get: NitroXR.Cloud.getLayout, del: NitroXR.Cloud.deleteLayout };
  if (save) NitroXR.Cloud.saveLayout = save;
  if (get) NitroXR.Cloud.getLayout = get;
  if (del) NitroXR.Cloud.deleteLayout = del;
  return () => Object.assign(NitroXR.Cloud, { saveLayout: orig.save, getLayout: orig.get, deleteLayout: orig.del });
}

// ---------------------------------------------------------------- pure guards

await check('sanitiseCells rejects anything that would misplace a wall', () => {
  for (const bad of [null, 'walls', 42, {}, [[1, 2]]]) {
    assert(LevelEditor.sanitiseCells(bad) === null, `accepted ${JSON.stringify(bad)}`);
  }
  assert(LevelEditor.sanitiseCells([{ x: 1.5, z: 2 }]) === null, 'accepted a float');
  assert(LevelEditor.sanitiseCells([{ x: -1, z: 0 }]) === null, 'accepted a negative');
  assert(LevelEditor.sanitiseCells([{ x: 0, z: 256 }]) === null, 'accepted 256');
  assert(LevelEditor.sanitiseCells([{ x: '1', z: 2 }]) === null, 'accepted a string coord');
  assert(LevelEditor.sanitiseCells([]) === null, 'accepted an empty layout');
});

await check('sanitiseCells dedupes and keeps valid cells', () => {
  const out = LevelEditor.sanitiseCells([{ x: 1, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 3 }]);
  assert(out.length === 2, `expected 2 cells, got ${out.length}`);
  assert(out[1].x === 2 && out[1].z === 3, 'wrong cell kept');
});

await check('extractCells understands the legacy bare-array local format', () => {
  const out = LevelEditor.extractCells([{ x: 4, z: 5 }]);
  assert(out && out[0].x === 4, 'legacy array not read');
  assert(LevelEditor.extractCells({ id: 'x' }) === null, 'a record with no cells must be null');
});

// ---------------------------------------------------------------- save

await check('saveLayout writes the cloud when it is reachable', async () => {
  const ls = installLocalStorage();
  const h = harness();
  let sent = null;
  const restore = stubCloud({ save: async (id, cells) => { sent = { id, cells }; return { id }; } });
  try {
    const r = await h.editor.saveLayout('mine');
    assert(r.ok === true, `not ok: ${JSON.stringify(r)}`);
    assert(r.cloud === true, 'did not report a cloud save');
    assert(sent.id === 'mine', `id was ${sent.id}`);
    assert(sent.cells.length === 2, `sent ${sent.cells.length} cells`);
    assert(ls.getItem('nitro_maze_layout_mine'), 'no local cache written');
  } finally { restore(); }
});

await check('a failed cloud save still keeps the work locally and says so', async () => {
  const ls = installLocalStorage();
  const h = harness();
  const restore = stubCloud({ save: async () => { throw new Error('network down'); } });
  try {
    const r = await h.editor.saveLayout('offline');
    assert(r.ok === true, 'the player must not lose the layout');
    assert(r.cloud === false, 'must not claim a cloud save');
    assert(/network down/.test(r.reason || ''), `reason was ${r.reason}`);
    const cached = JSON.parse(ls.getItem('nitro_maze_layout_offline'));
    assert(cached.length === 2, `local cache has ${cached.length} cells`);
  } finally { restore(); }
});

await check('saving an empty layout is refused, not written', async () => {
  installLocalStorage();
  const h = harness([]);
  let called = false;
  const restore = stubCloud({ save: async () => { called = true; return {}; } });
  try {
    const r = await h.editor.saveLayout('empty');
    assert(r.ok === false, 'should refuse an empty layout');
    assert(!called, 'must not hit the cloud');
  } finally { restore(); }
});

// ---------------------------------------------------------------- load

await check('loadLayout prefers the cloud copy', async () => {
  installLocalStorage({ nitro_maze_layout_mine: JSON.stringify([{ x: 9, z: 9 }]) });
  const h = harness();
  const restore = stubCloud({ get: async () => [{ x: 3, z: 4 }] });
  try {
    const r = await h.editor.loadLayout('mine');
    assert(r.ok === true, `not ok: ${JSON.stringify(r)}`);
    assert(r.source === 'cloud', `source was ${r.source}`);
    assert(r.cells === 1, `loaded ${r.cells} cells`);
    assert(h.maze.goalGenerated, 'goal was not regenerated');
    assert(h.player.respawns === 1, 'player was not respawned after scene.clear()');
  } finally { restore(); }
});

await check('loadLayout falls back to the local cache when the cloud has no copy', async () => {
  installLocalStorage({ nitro_maze_layout_mine: JSON.stringify([{ x: 7, z: 8 }]) });
  const h = harness();
  const restore = stubCloud({ get: async () => null });
  try {
    const r = await h.editor.loadLayout('mine');
    assert(r.ok === true, `not ok: ${JSON.stringify(r)}`);
    assert(r.source === 'local', `source was ${r.source}`);
  } finally { restore(); }
});

await check('a cloud outage falls back to local and reports the error', async () => {
  installLocalStorage({ nitro_maze_layout_mine: JSON.stringify([{ x: 6, z: 6 }]) });
  const h = harness();
  const restore = stubCloud({ get: async () => { throw new Error('502'); } });
  try {
    const r = await h.editor.loadLayout('mine');
    assert(r.ok === true, 'offline must not block loading');
    assert(r.source === 'local', `source was ${r.source}`);
    assert(/502/.test(r.reason || ''), `the outage should surface: ${r.reason}`);
  } finally { restore(); }
});

await check('a corrupt local cache does not throw', async () => {
  installLocalStorage({ nitro_maze_layout_broken: '{not json' });
  const h = harness();
  const restore = stubCloud({ get: async () => null });
  try {
    const r = await h.editor.loadLayout('broken');
    assert(r.ok === false, 'a corrupt cache must not load');
    assert(r.reason, 'a reason must be given');
  } finally { restore(); }
});

await check('a cloud record of garbage is rejected, not replayed', async () => {
  installLocalStorage();
  const h = harness();
  const restore = stubCloud({ get: async () => [{ x: 1e9, z: 0 }] });
  try {
    const r = await h.editor.loadLayout('bad');
    assert(r.ok === false, 'out-of-range cells must not be applied');
    assert(h.maze.goalGenerated === undefined, 'nothing should have been rebuilt');
  } finally { restore(); }
});

await check('a loaded layout refreshes the local cache', async () => {
  const ls = installLocalStorage({ nitro_maze_layout_mine: JSON.stringify([{ x: 0, z: 0 }]) });
  const h = harness();
  const restore = stubCloud({ get: async () => [{ x: 5, z: 5 }, { x: 6, z: 6 }] });
  try {
    await h.editor.loadLayout('mine');
    const cached = JSON.parse(ls.getItem('nitro_maze_layout_mine'));
    assert(cached.length === 2, `cache holds ${cached.length} cells`);
  } finally { restore(); }
});

// ---------------------------------------------------------------- delete

await check('deleteLayout clears both copies and tolerates a cloud failure', async () => {
  const ls = installLocalStorage({ nitro_maze_layout_mine: JSON.stringify([{ x: 1, z: 1 }]) });
  const h = harness();
  const restore = stubCloud({ del: async () => { throw new Error('offline'); } });
  try {
    const r = await h.editor.deleteLayout('mine');
    assert(r.cloud === false, 'should report the cloud delete failed');
    assert(r.local === true, 'the local copy should still be cleared');
    assert(!ls.getItem('nitro_maze_layout_mine'), 'local copy survived');
  } finally { restore(); }
});


await check('a missing runtime method is reported as a version problem, not the network', async () => {
  // This is the bug that shipped: runtime 0.2.8 has no Cloud.saveLayout, the
  // call throws a TypeError, and the old code reported it as "Cloud
  // unavailable" - pointing the player at their connection instead of the
  // dependency that was actually stale.
  const msg = LevelEditor.describeFailure(new TypeError('NitroXR.Cloud.saveLayout is not a function'));
  assert(/too old/i.test(msg), `TypeError reported as: ${msg}`);

  const net = LevelEditor.describeFailure(new Error('Failed to fetch'));
  assert(/Failed to fetch/.test(net), `a real network error was swallowed: ${net}`);

  const ls = installLocalStorage();
  const h = harness();
  const orig = NitroXR.Cloud.saveLayout;
  delete NitroXR.Cloud.saveLayout;   // simulate the old bundle
  try {
    const r = await h.editor.saveLayout('stale');
    assert(r.ok === true, 'the work must still be cached locally');
    assert(r.cloud === false, 'must not claim a cloud save');
    assert(/too old/i.test(r.reason || ''), `reason was "${r.reason}"`);
    assert(ls.getItem('nitro_maze_layout_stale'), 'work was lost');
  } finally {
    NitroXR.Cloud.saveLayout = orig;
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
