// Daily Challenge: one shared seed per UTC day, so two players on the same
// date get the same maze. Lives in its own module so it is importable (and
// testable) without booting the game.
export function dailySeed(date = new Date()) {
  return Math.floor(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
  ) / 86400000);
}
