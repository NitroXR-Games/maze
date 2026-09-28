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
      this.root.appendChild(this.stepEl);
      this.root.appendChild(this.timerEl);
      document.body.appendChild(this.root);

      this.victoryEl = document.createElement('div');
      this.victoryEl.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);z-index:11;display:none;font-family:monospace;font-size:2rem;color:gold;background:rgba(0,0,0,0.75);padding:24px 48px;border:2px solid gold;border-radius:12px;';
      this.victoryEl.textContent = 'MAZE COMPLETE!';
      document.body.appendChild(this.victoryEl);
    }
    this.update();
  }

  update() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    if (!this.isDOM) return;
    this.stepEl.textContent = `Steps: ${this.steps}`;
    this.timerEl.textContent = `Time: ${elapsed}s`;
  }

  incrementSteps() {
    this.steps++;
  }

  showVictory() {
    if (this.isDOM) this.victoryEl.style.display = 'block';
  }
}
