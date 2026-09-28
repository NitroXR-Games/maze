// DOM-overlay HUD. The live SDK has no 3D text primitives, so the HUD renders
// as an HTML overlay in browsers and silently no-ops headless (tests).
export class HUD {
  constructor() {
    this.steps = 0;
    this.startTime = Date.now();
    this.isDOM = typeof document !== 'undefined';

    if (this.isDOM) {
      this.root = document.createElement('div');
      this.root.id = 'nitro-hud';
      this.root.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10;font-family:monospace;color:#00ff41;background:rgba(0,0,0,0.6);padding:8px 12px;border:1px solid #00ff41;border-radius:6px;';
      this.stepEl = document.createElement('div');
      this.timerEl = document.createElement('div');
      this.helpEl = document.createElement('div');
      this.helpEl.style.cssText = 'margin-top:6px;font-size:0.75rem;opacity:0.8;';
      this.helpEl.textContent = 'Move: WASD/arrows · Turn: Q/E · Avatar: C · Interact: E/Space · Editor: T · Goal: reach the portal';
      this.teleEl = document.createElement('div');
      this.teleEl.style.cssText = 'margin-top:6px;font-size:0.75rem;opacity:0.8;';
      this.root.appendChild(this.stepEl);
      this.root.appendChild(this.timerEl);
      this.root.appendChild(this.helpEl);
      this.root.appendChild(this.teleEl);
      document.body.appendChild(this.root);

      this.victoryEl = document.createElement('div');
      this.victoryEl.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);z-index:11;display:none;font-family:monospace;font-size:2rem;color:gold;background:rgba(0,0,0,0.75);padding:24px 48px;border:2px solid gold;border-radius:12px;';
      this.victoryEl.textContent = 'MAZE COMPLETE!';
      document.body.appendChild(this.victoryEl);
    }
    this.update();
    this._lastFrame = 0;
    this._fps = 0;
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

  showVictory() {
    if (this.isDOM) this.victoryEl.style.display = 'block';
  }
}
