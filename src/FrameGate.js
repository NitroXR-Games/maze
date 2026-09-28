// Scene.startLoop calls its callback without awaiting (runtime index.js:89).
// An async game frame that awaits a level transition would therefore overlap
// the next frame and run game logic against a half-rebuilt maze. FrameGate
// admits one frame at a time and drops the overlap.
export class FrameGate {
  constructor() {
    this.busy = false;
    this.skipped = 0;
  }

  run(fn) {
    if (this.busy) {
      this.skipped++;
      return false;
    }
    this.busy = true;
    Promise.resolve()
      .then(fn)
      .catch(e => console.error('Game frame failed:', e))
      .finally(() => { this.busy = false; });
    return true;
  }
}
