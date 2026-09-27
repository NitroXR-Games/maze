export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.goal = { x: config.mazeWidth - 1, z: config.mazeHeight - 1 };
  }

  generate() {
    // Simplified grid-based maze for prototype
    for (let x = 0; x < this.config.mazeWidth; x++) {
      for (let z = 0; z < this.config.mazeHeight; z++) {
        if (x === 0 || x === this.config.mazeWidth - 1 || z === 0 || z === this.config.mazeHeight - 1) {
          this.addWall(x, z);
        } else if (Math.random() > 0.7 && (x !== 1 || z !== 1)) {
          this.addWall(x, z);
        }
      }
    }
    
    this.scene.createEntity('goal', {
      position: [this.goal.x, 0.5, this.goal.z],
      model: 'cube',
      color: 'green'
    });
  }

  addWall(x, z) {
    this.walls.push({ x, z });
    this.scene.createEntity(`wall_${x}_${z}`, {
      position: [x, 0.5, z],
      model: 'cube',
      color: 'gray'
    });
  }

  checkGoal(playerPos) {
    const dist = Math.sqrt(
      Math.pow(playerPos.x - this.goal.x, 2) + 
      Math.pow(playerPos.z - this.goal.z, 2)
    );
    return dist < 0.5;
  }
}
