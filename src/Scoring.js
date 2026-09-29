// Scoring. Extracted because the old formula was inline in main.js and wrong:
//
//   score = steps + elapsedSeconds
//
// Two problems, both shipped:
//  1. steps and seconds are incommensurable - adding them produces a number
//     that means nothing.
//  2. The leaderboard sorts DESCENDING (highest wins), so the formula ranked
//     DAWLING HIGHER. A player who wandered for three extra minutes beat a
//     player who sprinted.
//
// A time trial has exactly one natural ordering: fewer seconds wins. So the
// score IS the elapsed run time, and the board is read ascending. Steps are
// kept as a separate stat for display, never mixed into the ranking value.
export class Scoring {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.stoppedAt = null;
  }

  // The clock starts on the first playable frame, not at module load. The old
  // code used `new Date()` in a constructor, so the timer ran through boot,
  // asset fetches and level generation - all of which the player cannot
  // influence and which vary with network speed.
  start(now = Date.now()) {
    if (this.startedAt === null) this.startedAt = now;
    return this.startedAt;
  }

  stop(now = Date.now()) {
    if (this.startedAt === null) return 0;
    if (this.stoppedAt === null) this.stoppedAt = now;
    return this.elapsedSeconds(now);
  }

  get running() {
    return this.startedAt !== null && this.stoppedAt === null;
  }

  // Whole seconds, monotonic, never negative. Clamped because a caller may
  // pass a clock that has been stepped backwards (NTP, tab restore).
  elapsedSeconds(now = Date.now()) {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? now;
    return Math.max(0, Math.floor((end - this.startedAt) / 1000));
  }

  // The single ranking value. Lower is better; the board is read ascending.
  // Frozen at stop() so a slow upload cannot inflate the recorded time.
  finalSeconds(now = Date.now()) {
    return this.stop(now);
  }

  // Shape sent to /submit. `value` is what ranks; steps ride along as
  // metadata so a leaderboard can display them without re-deriving them.
  toSubmission(userId, steps, gameId = 'maze', now = Date.now()) {
    return {
      userId,
      gameId,
      value: this.finalSeconds(now),
      steps,
      at: new Date(now).toISOString()
    };
  }
}
