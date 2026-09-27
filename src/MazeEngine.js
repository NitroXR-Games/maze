export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.goal = { x: config.mazeWidth - 1, z: config.mazeHeight - 1 };
  }

  generate() {
    this.walls = [];
    const width = this.config.mazeWidth + (GameState.currentLevel * 2);
    const height = this.config.mazeHeight + (GameState.currentLevel * 2);
    const grid = Array.from({ length: width }, () => Array(height).fill(true));

    const carve = (x, z) => {
      grid[x][z] = false;
      const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (nx > 0 && nx < width - 1 && nz > 0 && nz < height - 1 && grid[nx][nz]) {
          grid[x + dx / 2][z + dz / 2] = false;
          carve(nx, nz);
        }
      }
    };

    carve(1, 1);

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < height; z++) {
        if (grid[x][z]) {
          this.addWall(x, z);
        }
      }
    }
    
    this.goal = { x: width - 2, z: height - 2 };
    this.scene.createEntity('goal', {
      position: [this.goal.x, 0.5, this.goal.z],
      model: 'cube',
      material: 'nitro_gold_glow'
    });
  }

  addWall(x, z) {
    this.walls.push({ x, z });
    this.scene.createEntity(`wall_${x}_${z}`, {
      position: [x, 0.5, z],
      model: 'cube',
      material: 'nitro_concrete_wall'
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
