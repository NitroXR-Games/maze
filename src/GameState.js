class GameState {
  constructor() {
    this.hasWon = false;
  }

  setVictory() {
    this.hasWon = true;
    console.log("VICTORY: Goal reached!");
  }

  isGameOver() {
    return this.hasWon;
  }
}

export default new GameState();
