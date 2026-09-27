class GameState {
  constructor() {
    this.currentLevel = 1;
    this.maxLevels = 3;
    this.hasWon = false;
    this.totalSteps = 0;
    this.startTime = Date.now();
  }

  nextLevel() {
    if (this.currentLevel < this.maxLevels) {
      this.currentLevel++;
      return true;
    }
    this.hasWon = true;
    return false;
  }

  setVictory() {
    this.hasWon = true;
    console.log("FINAL VICTORY: All levels complete!");
  }

  isGameOver() {
    return this.hasWon;
  }
}

export default new GameState();
