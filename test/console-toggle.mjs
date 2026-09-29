// Extracts the inline script from index.html and exercises it against a
// minimal DOM, proving the key matching logic for the cases that broke
// before: non-US layouts, Firefox-style `/`, and plain letter keys.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const m = html.match(/<script>\s*\(\(\) => \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
if (!m) { console.error('FAIL: could not locate the inline console script'); process.exit(1); }
const body = m[1];

// Minimal DOM stand-in.
function makeEl(id) {
  const el = {
    id, children: [], childElementCount: 0, textContent: '', style: {}, classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }
    },
    appendChild(c) { this.children.push(c); this.childElementCount++; },
    removeChild() { this.children.pop(); this.childElementCount--; },
    addEventListener() {},
    scrollTop: 0, firstElementChild: null
  };
  return el;
}
const els = {
  'console': makeEl('console'),
  'console-toggle': makeEl('console-toggle'),
  'log-count': makeEl('log-count'),
  'key-readout': makeEl('key-readout')
};
// The console starts collapsed, mirroring the class="hidden" in the markup.
els['console'].classList.add('hidden');

const winHandlers = [];
globalThis.window = {
  addEventListener: (t, fn, cap) => { if (t === 'keydown') winHandlers.push({ fn, cap }); }
};
globalThis.document = {
  getElementById: (id) => els[id] || null,
  createElement: () => ({ className: '', innerText: '' })
};
// Keep a handle on the REAL log: the script under test replaces console.log,
// and we still want to report results through the genuine one.
const realLog = console.log.bind(console);
globalThis.console = { log: () => {} };

new Function(body)();

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; realLog(`ok: ${name}`); } else { fail++; realLog(`FAIL: ${name}`); } };

check('registers exactly one keydown listener', winHandlers.length === 1);
check('listener is registered in the capture phase', winHandlers[0].cap === true);

const press = (init) => {
  els['console'].classList.toggle('hidden', false); // start closed each time
  els['console'].classList.add('hidden');
  const e = { repeat: false, target: { tagName: 'BODY' }, preventDefault() { e.defaulted = true; }, ...init };
  winHandlers[0].fn(e);
  return { open: !els['console'].classList.contains('hidden'), e };
};

check('US layout: code=Slash toggles', press({ code: 'Slash', key: '/' }).open);
check('non-US layout: key="/" with an unrelated code toggles',
  press({ code: 'IntlBackslash', key: '/' }).open);
check('backtick toggles', press({ code: 'Backquote', key: '`' }).open);
check('L toggles (no browser steals it)', press({ code: 'KeyL', key: 'l' }).open);
check('L toggles with caps lock (key is uppercase)',
  press({ code: 'KeyL', key: 'L' }).open);
check('toggles closed again on second press', (() => {
  // start from a known-OPEN state, then the next press must close it
  els['console'].classList.remove('hidden');
  winHandlers[0].fn({ code: 'KeyL', key: 'l', repeat: false, target: { tagName: 'BODY' }, preventDefault() {} });
  return els['console'].classList.contains('hidden');
})());

check('game keys do NOT toggle', !press({ code: 'KeyW', key: 'w' }).open);
check('V does NOT toggle', !press({ code: 'KeyV', key: 'v' }).open);
check('typing in a field is ignored', !press({ code: 'KeyL', key: 'l', target: { tagName: 'INPUT' } }).open);
check('preventDefault is called on a toggle key', press({ code: 'Slash', key: '/' }).e.defaulted === true);
check('key readout updates for every key', (() => {
  winHandlers[0].fn({ code: 'KeyQ', key: 'q', repeat: false, target: { tagName: 'BODY' }, preventDefault() {} });
  return els['key-readout'].textContent.includes('KeyQ');
})());
check('key readout marks auto-repeat', (() => {
  winHandlers[0].fn({ code: 'KeyQ', key: 'q', repeat: true, target: { tagName: 'BODY' }, preventDefault() {} });
  return els['key-readout'].textContent.includes('repeat');
})());

realLog(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
