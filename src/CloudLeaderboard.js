export class CloudLeaderboard {
  static async submitScore(userId, score) {
    console.log(`Submitting score ${score} for user ${userId} to NitroXR Cloud...`);
    try {
      const response = await NitroXR.Cloud.submit({
        gameId: 'maze-competitive',
        userId: userId,
        value: score,
        timestamp: Date.now()
      });
      return response.success;
    } catch (e) {
      console.error("Cloud submission failed", e);
      return false;
    }
  }

  static async getTopScores() {
    return await NitroXR.Cloud.getTop(10, { gameId: 'maze-competitive' });
  }
}
