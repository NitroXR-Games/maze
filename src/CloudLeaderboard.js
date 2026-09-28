import { NitroXR, GAME_ID } from './nitroxr.js';

export class CloudLeaderboard {
  static async submitScore(userId, score) {
    console.log(`Submitting score ${score} for user ${userId} to NitroXR Cloud...`);
    try {
      const response = await NitroXR.Cloud.submitScore(userId, score, GAME_ID);
      return !!response.success;
    } catch (e) {
      console.error('Cloud submission failed', e);
      return false;
    }
  }

  static async getTopScores(limit = 10) {
    try {
      const board = await NitroXR.Cloud.getLeaderboard(GAME_ID, limit);
      return Array.isArray(board.scores) ? board.scores : [];
    } catch (e) {
      console.error('Leaderboard fetch failed', e);
      return [];
    }
  }
}
