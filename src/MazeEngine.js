export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.goal = { x: config.mazeWidth - 1, z: config.mazeHeight - 1 };
  }

  generate() {
    this.walls = [];
    const { mazeWidth, mazeHeight } = this.config;
    const grid = Array.from({ length: mazeWidth }, () => Array(mazeHeight).fill(true));

    const carve = (x, z) => {
      grid[x][z] = false;
      const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (nx > 0 && nx < mazeWidth - 1 && nz > 0 && nz < mazeHeight - 1 && grid[nx][nz]) {
          grid[x + dx / 2][z + dz / 2] = false;
          carve(nx, nz);
        }
      }
    };

    carve(1, 1);

    for (let x = 0; x < mazeWidth; x++) {
      for (let z = 0; z < mazeHeight; z++) {
        if (grid[x][z]) {
          this.addWall(x, z);
        }
      }
    }
    
    this.scene.createEntity('goal', {
      position: [mazeWidth - 2, 0.5, mazeHeight - 2],
      model: 'cube',
      material: 'nitro_gold_glow'
    });
    this.goal = { x: mazeWidth - 2, z: mazeHeight - 2 };
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
