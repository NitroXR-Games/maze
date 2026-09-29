// Scoring tests. The formula under test previously shipped broken in two ways
// (incommensurable units, and a descending board that rewarded dawdling), so
// each of those is asserted explicitly rather than implied.
// Run: node test/scoring.mjs
import { Scoring } from '../src/Scoring.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log(`ok: ${name}`); }
  catch (e) { fail++; console.error(`FAIL: ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

await check('the clock does not start until start() is called', () => {
  const s = new Scoring();
  assert(s.elapsedSeconds(1e12) === 0, `idle clock reported ${s.elapsedSeconds(1e12)}`);
  assert(s.running === false, 'a fresh timer must not be running');
});

await check('elapsed time is measured from start, not construction', () => {
  const s = new Scoring();
  s.start(1000);
  assert(s.elapsedSeconds(61000) === 60, `got ${s.elapsedSeconds(61000)}`);
});

await check('a second start() does not restart the clock', () => {
  const s = new Scoring();
  s.start(1000);
  s.start(500000); // e.g. a level transition calling start again
  assert(s.elapsedSeconds(61000) === 60, `restarted: ${s.elapsedSeconds(61000)}`);
});

await check('stop freezes the value against a later clock', () => {
  const s = new Scoring();
  s.start(0);
  assert(s.stop(30_000) === 30, 'wrong stop value');
  assert(s.elapsedSeconds(999_000) === 30, `clock kept running: ${s.elapsedSeconds(999_000)}`);
  assert(s.running === false, 'should not be running after stop');
});

await check('stop is idempotent', () => {
  const s = new Scoring();
  s.start(0);
  assert(s.stop(10_000) === 10, 'first stop');
  assert(s.stop(90_000) === 10, `second stop changed the time to ${s.stop(90_000)}`);
});

await check('a backwards clock never yields a negative score', () => {
  const s = new Scoring();
  s.start(50_000);
  assert(s.elapsedSeconds(10_000) === 0, `negative: ${s.elapsedSeconds(10_000)}`);
});

await check('sub-second runs round down to 0 rather than negative', () => {
  const s = new Scoring();
  s.start(0);
  assert(s.finalSeconds(400) === 0, `got ${s.finalSeconds(400)}`);
});

await check('finalSeconds is stable so a slow upload cannot inflate it', () => {
  const s = new Scoring();
  s.start(0);
  const a = s.finalSeconds(60_000);
  const b = s.finalSeconds(600_000);
  assert(a === b, `score drifted from ${a} to ${b}`);
});

await check('toSubmission ranks on seconds alone, with steps as metadata', () => {
  const s = new Scoring();
  s.start(0);
  const sub = s.toSubmission('alice', 412, 'maze', 90_000);
  assert(sub.value === 90, `value was ${sub.value}, steps leaked into the rank`);
  assert(sub.steps === 412, 'steps missing');
  assert(sub.userId === 'alice' && sub.gameId === 'maze', 'identifiers wrong');
  assert(typeof sub.at === 'string', 'no timestamp');
});

await check('THE REGRESSION: a dawdler must NOT outrank a sprinter', () => {
  // The shipped formula ranked descending, so this is the bug in one line.
  const sprinter = new Scoring();
  sprinter.start(0);
  const sprinterScore = sprinter.finalSeconds(60_000);   // 60s, few steps
  const dawdler = new Scoring();
  dawdler.start(0);
  const dawdlerScore = dawdler.finalSeconds(300_000);    // 300s, many steps
  // Board is read ascending: lower wins.
  assert(dawdlerScore > sprinterScore, 'a dawdler must have the worse (higher) time');
  // And the old formula would have got this backwards when steps dominated.
  const old = (steps, secs) => steps + secs;
  assert(old(900, 300) > old(300, 60), 'precondition: old formula favours the dawdler');
});

await check('stop before start is 0, not NaN', () => {
  const s = new Scoring();
  assert(s.stop() === 0, `got ${s.stop()}`);
  assert(Number.isFinite(s.finalSeconds()), 'produced a non-finite score');
});


await check('the victory path submits seconds, not steps+seconds', () => {
  // Source-level guard. The behaviour is proven by the unit tests above, but
  // nothing else pins the call site, and the original bug lived exactly there.
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const m = src.match(/scoring\.finalSeconds\(\)/);
  assert(m, 'the victory path no longer uses the timer');
  const line = src.split('\n').find(l => l.includes('finalScore ='));
  assert(line, 'no finalScore assignment found');
  assert(!/hud\.steps\s*\+/.test(line),
    `steps are being added into the score again: ${line.trim()}`);
  // Strip comments first: the only remaining mention of the old clock is the
  // comment explaining why it was removed.
  const code = src.replace(/\/\/[^\n]*/g, '');
  assert(!/GameState\.startTime/.test(code),
    'the old module-load clock is still referenced in main.js');
});

await check('the leaderboard is read ascending so the fastest run ranks first', () => {
  const src = readFileSync(new URL('../src/CloudLeaderboard.js', import.meta.url), 'utf8');
  assert(/getLeaderboard\([^)]*'asc'/.test(src),
    'getTopScores must request order=asc, or the fastest run will not rank first');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
