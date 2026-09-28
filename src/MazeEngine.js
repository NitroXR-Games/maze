import GameState from './GameState.js';
import { Sentinel } from './Sentinel.js';

export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.sentinels = [];
    this.goal = { x: 0, z: 0 };
    this.currentTheme = 'standard';
    this.themes = {
      standard: { wall: 'maze_wall_concrete', goal: 'maze_goal_portal', floor: 'maze_floor_tile' },
      neon: { wall: 'nitro_neon_blue', goal: 'nitro_neon_pink', floor: 'nitro_black_reflective' },
      ruins: { wall: 'nitro_stone_moss', goal: 'nitro_ancient_torch', floor: 'nitro_dirt_path' }
    };
    // Only `standard` resolves against the live registry today; neon/ruins
    // fall back to primitives until their assets are generated (see ASSETS.md).
  }

  setTheme(themeId) {
    this.currentTheme = themeId;
    const theme = this.themes[themeId];
    this.walls.forEach(wall => {
      this.scene.getEntity(`wall_${wall.x}_${wall.z}`).update({ material: theme.wall });
    });
    this.scene.getEntity('goal').update({ material: theme.goal });
  }

  async generateGoal() {
    this.goal = { x: this.config.mazeWidth - 2, z: this.config.mazeHeight - 2 };
    await this.scene.createEntity('goal', {
      position: [this.goal.x, 0.5, this.goal.z],
      model: this.themes[this.currentTheme].goal
    });
  }

  async generate(seed = null) {
    this.walls = [];
    this.sentinels = [];
    
    // Use seed for deterministic generation if provided
    if (seed !== null) {
      this.currentSeed = seed;
      Math.random = this.mulberry32(seed);
    } else {
      this.currentSeed = null;
      Math.random = Math.random; 
    }

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

    // Walls resolve cloud assets in parallel; the resolver cache dedups IDs.
    const builds = [];
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < height; z++) {
        if (grid[x][z]) {
          builds.push(this.addWall(x, z));
        }
      }
    }
    await Promise.all(builds);

    await this.generateGoal();

    if (GameState.currentLevel > 1) {
      const sentinelCount = GameState.currentLevel;
      for (let i = 0; i < sentinelCount; i++) {
        const startX = Math.floor(Math.random() * (width - 2)) + 1;
        const startZ = Math.floor(Math.random() * (height - 2)) + 1;
        if (!grid[startX][startZ]) {
          const patrol = [
            { x: startX, z: startZ },
            { x: Math.floor(Math.random() * (width - 2)) + 1, z: Math.floor(Math.random() * (height - 2)) + 1 }
          ];
          this.sentinels.push(await Sentinel.create(this.scene, { x: startX, z: startZ }, patrol));
        }
      }
    }
  }

  mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  async addWall(x, z) {
    this.walls.push({ x, z });
    await this.scene.createEntity(`wall_${x}_${z}`, {
      position: [x, 0.5, z],
      model: this.themes[this.currentTheme].wall,
      physics: { isStatic: true }
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
