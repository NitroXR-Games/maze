// HUD visibility toggle. The critical property is NOT cosmetic: steps feed the
// leaderboard, so hiding the UI must never change what a run is worth. That is
// exactly the kind of thing a "just wrap it in display:none" change gets wrong.
// Run: node test/hud-toggle.mjs
import { HUD } from '../src/HUD.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log(`ok: ${name}`); }
  catch (e) { fail++; console.error(`FAIL: ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// Minimal DOM + storage stand-ins; the HUD only needs these.
function installDOM(pref) {
  const store = pref === undefined ? {} : { nitro_maze_hud_visible: pref };
  const classes = new Set();
  const body = {
    children: [],
    appendChild(el) { this.children.push(el); return el; },
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (n) => classes.has(n),
    },
  };
  globalThis.document = {
    createElement: () => ({ style: {}, appendChild() {} }),
    body,
  };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  return { store, classes, body };
}
function teardown() { delete globalThis.document; delete globalThis.localStorage; }

await check('the HUD is visible by default', () => {
  const d = installDOM();
  try {
    assert(new HUD().visible === true, 'default should be visible');
  } finally { teardown(); }
});

await check('toggleVisible flips visibility and returns the new state', () => {
  installDOM();
  try {
    const h = new HUD();
    assert(h.toggleVisible() === false, 'first toggle should hide');
    assert(h.visible === false, 'did not hide');
    assert(h.toggleVisible() === true, 'second toggle should show');
  } finally { teardown(); }
});

await check('a body class is set so the page debug chrome hides too', () => {
  const d = installDOM();
  try {
    const h = new HUD();
    h.setVisible(false);
    assert(d.classes.has('hud-hidden'), 'hud-hidden class missing after hiding');
    h.setVisible(true);
    assert(!d.classes.has('hud-hidden'), 'hud-hidden class left set after showing');
  } finally { teardown(); }
});

await check('visibility persists across reloads', () => {
  const d = installDOM();
  try {
    new HUD().setVisible(false);
    assert(d.store.nitro_maze_hud_visible === '0', `stored ${d.store.nitro_maze_hud_visible}`);
    // A fresh HUD = a page reload.
    const reloaded = new HUD();
    assert(reloaded.visible === false, 'preference did not survive reload');
    assert(d.classes.has('hud-hidden'), 'chrome not hidden on load');
  } finally { teardown(); }
});

await check('THE IMPORTANT ONE: hiding the HUD does not change the score', () => {
  installDOM();
  try {
    const h = new HUD();
    // recordStep's FIRST sample is a baseline, not distance, so N steps needs
    // N+1 calls. Walk from the origin: 3 cells visible, then 3 more hidden.
    const walk = (h, cells) => { for (const x of cells) h.recordStep({ x, z: 0 }); };
    walk(h, [0, 1, 2, 3]);
    const stepsVisible = h.steps;
    assert(stepsVisible === 3, `precondition: ${stepsVisible} steps`);

    h.setVisible(false);
    walk(h, [4, 5, 6]);
    assert(h.steps === 6, `steps stopped counting while hidden: ${h.steps}`);

    // Same distance, both states, identical result.
    const a = new HUD();
    walk(a, [10, 11]);
    const b = new HUD();
    b.setVisible(false);
    walk(b, [10, 11]);
    assert(a.steps === 1, `precondition: ${a.steps}`);
    assert(a.steps === b.steps,
      `visibility changed the score: ${a.steps} vs ${b.steps}`);
  } finally { teardown(); }
});

await check('update() does not touch the DOM while hidden', () => {
  const d = installDOM();
  try {
    const h = new HUD();
    let writes = 0;
    h.stepEl = { set textContent(v) { writes++; } };
    h.timerEl = { set textContent(v) { writes++; } };
    h.teleEl = { set textContent(v) { writes++; } };

    h.update(null, { x: 1, z: 1 }, 0);
    const visibleWrites = writes;
    assert(visibleWrites > 0, 'precondition: visible HUD should write');

    h.setVisible(false);
    writes = 0;
    h.update(null, { x: 1, z: 1 }, 0);
    assert(writes === 0, `hidden HUD still wrote ${writes} times`);
  } finally { teardown(); }
});

await check('a broken localStorage does not stop the game booting', () => {
  installDOM();
  globalThis.localStorage.getItem = () => { throw new Error('SecurityError'); };
  globalThis.localStorage.setItem = () => { throw new Error('SecurityError'); };
  try {
    const h = new HUD();                 // must not throw
    assert(h.visible === true, 'should default to visible');
    h.setVisible(false);                  // must not throw either
    assert(h.visible === false, 'state should still change in memory');
  } finally { teardown(); }
});

await check('main.js edge-detects H so a held key cannot strobe the UI', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert(/hudPressed\s*=\s*input\.toggleHud\s*&&\s*!gameLoop\._prevHud/.test(src),
    'H is not edge-detected; holding it would toggle every frame');
  assert(/_prevHud\s*=\s*input\.toggleHud/.test(src), 'previous state is never latched');
  assert(!/if \(input\.toggleHud\)\s*\{?\s*hud\.toggleVisible/.test(src),
    'H must not be level-triggered');
});

await check('the help line and the page hint both mention H', () => {
  const hud = readFileSync(new URL('../src/HUD.js', import.meta.url), 'utf8');
  assert(hud.includes('Hide UI: H'), 'the in-game help line does not mention H');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert(html.includes('H — hide UI'), 'the page hint does not mention H');
  assert(html.includes('body.hud-hidden'), 'no CSS to hide the page debug chrome');
  // The class must not swallow the victory banner, which is game state.
  assert(!/hud-hidden[^{]*\{[^}]*victory/i.test(html), 'victory banner must not be hidden');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
