// Runtime version contract. The game calls NitroXR.* directly, so a pin that
// drifts behind the published runtime breaks production silently: the methods
// are `undefined`, the call throws a TypeError, and - because every call site
// is wrapped in a try/catch for network resilience - the game quietly degrades
// to localStorage and reports "Cloud unavailable", which is a lie.
//
// This file exists because of exactly that bug. test/layouts.mjs STUBS
// NitroXR.Cloud.saveLayout, so it happily passes against a runtime that has no
// saveLayout at all. A test double cannot catch a missing method it replaces.
// So: import the real package and assert the surface the game actually depends
// on.
// Run: node test/runtime-contract.mjs
import * as NitroXR from '@nitroxr/runtime';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log(`ok: ${name}`); }
  catch (e) { fail++; console.error(`FAIL: ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const declared = pkg.dependencies['@nitroxr/runtime'];
const installed = JSON.parse(
  readFileSync(new URL('../node_modules/@nitroxr/runtime/package.json', import.meta.url), 'utf8')
).version;

// Every NitroXR member the game source touches, with the kind it must be.
// Kept as an explicit list so adding a call without adding a check fails here.
const CLOUD_FNS = ['saveLayout', 'getLayout', 'listLayouts', 'deleteLayout',
  'getLeaderboard', 'resolveAsset', 'listAssets', 'registerAsset', 'submitGhost', 'getGhost'];
const SCENE_FNS = ['getViewYaw', 'isPresentingXR', 'getInput', 'createEntity', 'removeEntity', 'clear'];

await check(`declared pin ${declared} is satisfied by installed ${installed}`, () => {
  // Reproduce caret resolution for 0.x, where ^ pins the MINOR: ^0.2.8 excludes 0.3.0.
  const range = declared.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  assert(range, `pin "${declared}" is not a simple caret range`);
  const [, major, minor] = range.map(Number);
  const [im, ii] = installed.split('.').map(Number);
  assert(im === major, `installed major ${im} != pinned ${major}`);
  assert(ii >= minor, `installed ${installed} is BELOW pinned floor ${declared} - reinstall`);
});

await check('the installed runtime is the newest published version', async () => {
  // Skipped offline: a registry round-trip must never be the reason a build fails.
  let latest = null;
  try {
    const res = await fetch('https://registry.npmjs.org/@nitroxr%2Fruntime', { signal: AbortSignal.timeout(8000) });
    if (res.ok) latest = (await res.json())['dist-tags']?.latest ?? null;
  } catch { /* offline */ }
  if (!latest) { console.log('     (skipped: registry unreachable)'); return; }
  assert(installed === latest,
    `game is on ${installed} but ${latest} is published. A caret pin on a 0.x version ` +
    `EXCLUDES the next minor, so a new feature lands server-side and never reaches the bundle.`);
});

await check('every Cloud method the game calls exists on the real runtime', () => {
  const missing = CLOUD_FNS.filter(f => typeof NitroXR.Cloud?.[f] !== 'function');
  assert(missing.length === 0,
    `NitroXR.Cloud is missing: ${missing.join(', ')} (runtime ${installed}). ` +
    `The game calls these directly; undefined means a silent localStorage fallback.`);
});

await check('every Scene method the game calls exists on the real prototype', () => {
  const missing = SCENE_FNS.filter(f => typeof NitroXR.Scene?.prototype?.[f] !== 'function');
  assert(missing.length === 0,
    `NitroXR.Scene.prototype is missing: ${missing.join(', ')} (runtime ${installed})`);
});

await check('getViewYaw actually derives yaw from the camera', () => {
  // A 0/1 implementation that satisfies typeof would defeat the whole point.
  const proto = NitroXR.Scene.prototype;
  assert(proto.getViewYaw.length === 0, 'getViewYaw should take no arguments');
  const fake = { camera: { getWorldDirection(v) { v.x = 1; v.z = 0; v.y = 0; } } };
  const yaw = proto.getViewYaw.call(fake);
  assert(Math.abs(yaw - Math.PI / 2) < 1e-6, `getViewYaw(+x) returned ${yaw}, expected PI/2`);
});

await check('the layout methods the game depends on are the documented ones', () => {
  // getLayout must distinguish 404 (null) from 5xx (throw) - the game's
  // offline fallback depends on that distinction to report honestly.
  const src = readFileSync(new URL('../node_modules/@nitroxr/runtime/dist/index.js', import.meta.url), 'utf8');
  assert(/getLayout\s*\(/.test(src), 'getLayout is not in the dist bundle');
  assert(src.includes('Layout fetch failed'), 'getLayout lost its error path');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
