// DOM-overlay HUD. The live SDK has no 3D text primitives, so the HUD renders
// as an HTML overlay in browsers and silently no-ops headless (tests).
// Remembered across reloads, and shared by the HUD overlay and the page's
// debug chrome (header, console mirror, key readout) so H is one switch
// rather than several that can disagree.
const VIS_KEY = 'nitro_maze_hud_visible';

export class HUD {
  constructor() {
    this.steps = 0;
    this.startTime = Date.now();
    this.isDOM = typeof document !== 'undefined';
    // Hiding the HUD is a presentation choice and must never affect scoring:
    // recordStep() is called from the game loop, not from update().
    this.visible = this._readPreference();

    if (this.isDOM) {
      this.root = document.createElement('div');
      this.root.id = 'nitro-hud';
      this.root.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10;font-family:monospace;color:#00ff41;background:rgba(0,0,0,0.6);padding:8px 12px;border:1px solid #00ff41;border-radius:6px;';
      this.stepEl = document.createElement('div');
      this.timerEl = document.createElement('div');
      this.helpEl = document.createElement('div');
      this.helpEl.style.cssText = 'margin-top:6px;font-size:0.75rem;opacity:0.8;';
      // Player-facing only. Editor/avatar tools are shown separately so the
      // help line describes the game instead of debug affordances.
      this.helpEl.textContent = 'Move: WASD/arrows · Turn: Q/E · View: V · Daily: N · Log: L · Hide UI: H';
      this.teleEl = document.createElement('div');
      this.teleEl.style.cssText = 'margin-top:6px;font-size:0.75rem;opacity:0.8;';
      this.viewEl = document.createElement('div');
      this.viewEl.style.cssText = 'margin-top:2px;font-size:0.85rem;color:#7dfcff;';
      // Editor banner: entering edit mode used to be signalled only by a
      // console line in a now-collapsed drawer, so it looked like nothing happened.
      this.editEl = document.createElement('div');
      this.editEl.style.cssText = 'display:none;margin-top:4px;font-size:0.8rem;color:#ffd75f;';
      this.editEl.textContent = 'EDIT MODE — E add/remove wall · K save layout · O load layout · T exit';
      this.root.appendChild(this.stepEl);
      this.root.appendChild(this.timerEl);
      this.root.appendChild(this.viewEl);
      this.root.appendChild(this.editEl);
      this.root.appendChild(this.helpEl);
      this.root.appendChild(this.teleEl);
      document.body.appendChild(this.root);

      this.victoryEl = document.createElement('div');
      this.victoryEl.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);z-index:11;display:none;font-family:monospace;font-size:2rem;color:gold;background:rgba(0,0,0,0.75);padding:24px 48px;border:2px solid gold;border-radius:12px;';
      this.victoryEl.textContent = 'MAZE COMPLETE!';
      document.body.appendChild(this.victoryEl);

      // Honour a previously hidden HUD on load.
      this._applyVisibility();

      // Catch feedback: previously the player was silently teleported to the
      // start with no explanation of what happened.
      this.caughtEl = document.createElement('div');
      this.caughtEl.style.cssText = 'position:fixed;top:26%;left:50%;transform:translateX(-50%);z-index:15;display:none;font-family:monospace;font-size:1.1rem;color:#ff6b6b;background:rgba(0,0,0,0.7);padding:10px 22px;border:1px solid #ff6b6b;border-radius:8px;white-space:nowrap;';
      document.body.appendChild(this.caughtEl);
    }
    this.update();
    this._lastFrame = 0;
    this._fps = 0;
  }

  showCaught(seconds) {
    this.caught = true;
    if (!this.isDOM) return;
    this.caughtEl.textContent = `CAUGHT! — back to the start · ${seconds}s safe`;
    this.caughtEl.style.display = 'block';
    clearTimeout(this._caughtTimer);
    this._caughtTimer = setTimeout(() => {
      this.caughtEl.style.display = 'none';
    }, seconds * 1000);
  }

  setEditMode(on) {
    this.editMode = on;
    if (this.isDOM) this.editEl.style.display = on ? 'block' : 'none';
  }

  // Transient confirmation, so editor edits are visible without the console.
  flash(text) {
    if (!this.isDOM) return;
    this.editEl.textContent = text;
    this.editEl.style.display = 'block';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.editEl.style.display = this.editMode ? 'block' : 'none';
      if (this.editMode) {
        this.editEl.textContent = 'EDIT MODE — E add/remove wall · K save layout · O load layout · T exit';
      }
    }, 1200);
  }

  setView(label) {
    this.viewLabel = label;
    if (this.isDOM) this.viewEl.textContent = `View: ${label}`;
  }

  // update(input, pos, rot) — telemetry args optional; HUD never throws.
  update(input = null, pos = null, rot = 0) {
    const now = Date.now();
    if (this._lastFrame) {
      const dt = (now - this._lastFrame) / 1000;
      if (dt > 0) this._fps = this._fps * 0.9 + (1 / dt) * 0.1;
    }
    this._lastFrame = now;
    const elapsed = Math.floor((now - this.startTime) / 1000);
    if (!this.isDOM) return;
    // Skipping the writes keeps a hidden HUD off the render path. `_lastFrame`
    // and `_fps` above still update, so re-showing does not report a bogus FPS.
    if (!this.visible) return;
    this.stepEl.textContent = `Steps: ${this.steps}`;
    this.timerEl.textContent = `Time: ${elapsed}s`;
    try {
      const keys = input
        ? [['W', 'forward'], ['A', 'left'], ['S', 'backward'], ['D', 'right']]
          .map(([k, f]) => `${k}:${input[f] ? 1 : 0}`).join(' ')
        : 'no-input';
      const p = pos ? `p(${pos.x.toFixed(2)},${pos.z.toFixed(2)}) r(${(rot * 180 / Math.PI).toFixed(0)}°)` : 'no-pos';
      const mv = input ? `mv(${Number(input.moveX || 0).toFixed(2)},${Number(input.moveZ || 0).toFixed(2)})` : '';
      this.teleEl.textContent = `${p} | ${keys} ${mv} | ${Math.round(this._fps)}fps`;
    } catch {
      // Telemetry must never break the loop.
    }
  }

  incrementSteps() {
    this.steps++;
  }

  // Frame-rate independent step accounting: a step is a whole cell travelled,
  // not a frame with movement. Counting frames made the leaderboard score
  // depend on the player's refresh rate. Teleports (sentinel catch, level
  // change) re-baseline instead of counting as distance.
  recordStep(pos) {
    if (this._lastPos) {
      const d = Math.hypot(pos.x - this._lastPos.x, pos.z - this._lastPos.z);
      if (d > 1) {
        this._lastPos = { x: pos.x, z: pos.z };
        return;
      }
      this._carry = (this._carry ?? 0) + d;
      while (this._carry >= 1) {
        this.steps++;
        this._carry -= 1;
      }
    }
    this._lastPos = { x: pos.x, z: pos.z };
  }

  // localStorage is absent headless and can throw in private modes, so every
  // access is guarded - a broken preference store must not break the game.
  _readPreference() {
    try {
      return localStorage.getItem(VIS_KEY) !== '0';
    } catch {
      return true; // default to visible
    }
  }

  _writePreference() {
    try {
      localStorage.setItem(VIS_KEY, this.visible ? '1' : '0');
    } catch {
      /* preference simply will not persist */
    }
  }

  // The page's debug chrome lives in index.html, outside this class. Toggling a
  // body class keeps the two in sync with one source of truth.
  _applyVisibility() {
    if (!this.isDOM) return;
    this.root.style.display = this.visible ? 'block' : 'none';
    document.body?.classList.toggle('hud-hidden', !this.visible);
  }

  // Returns the new visibility. Not edge-detected here: the caller owns that,
  // matching toggleEditor.
  setVisible(on) {
    this.visible = !!on;
    this._writePreference();
    this._applyVisibility();
    return this.visible;
  }

  toggleVisible() {
    return this.setVisible(!this.visible);
  }

  // Victory is a game state, not debug chrome, so it survives hiding the HUD.

  showVictory() {
    if (this.isDOM) this.victoryEl.style.display = 'block';
  }
}
