import { NitroXR, GAME_ID } from './nitroxr.js';

export class CloudLeaderboard {
  // `steps` is display-only metadata. It must never be added into `score`:
  // the board ranks on elapsed time, where lower wins.
  static async submitScore(userId, score, gameId = GAME_ID, steps = undefined) {
    console.log(`Submitting time ${score}s (${steps ?? '?'} steps) for user ${userId} to NitroXR Cloud...`);
    try {
      const response = await NitroXR.Cloud.submitScore(userId, score, gameId, steps);
      return !!response.success;
    } catch (e) {
      console.error('Cloud submission failed', e);
      return false;
    }
  }

  // Ascending: this game is a time trial, so the fastest run is rank 1.
  static async getTopScores(limit = 10) {
    try {
      const board = await NitroXR.Cloud.getLeaderboard(GAME_ID, limit, 'asc');
      return Array.isArray(board.scores) ? board.scores : [];
    } catch (e) {
      console.error('Leaderboard fetch failed', e);
      return [];
    }
  }
}
