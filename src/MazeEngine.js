import GameState from './GameState.js';
import { Sentinel } from './Sentinel.js';

export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.sentinels = [];
    this.goal = null;
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
    if (!this.themes[themeId]) return false;
    this.currentTheme = themeId;
    const theme = this.themes[themeId];
    // Entities can be missing (scene cleared by the editor), so guard lookups.
    this.walls.forEach(wall => {
      this.scene.getEntity(`wall_${wall.x}_${wall.z}`)?.update({ material: theme.wall });
    });
    this.scene.getEntity('goal')?.update({ material: theme.goal });
    return true;
  }

  async generateGoal() {
    // this.goal is set by generate() to an open cell; fall back to the
    // legacy default only when unset (e.g. editor-loaded layouts).
    if (!this.goal) {
      this.goal = { x: this.config.mazeWidth - 2, z: this.config.mazeHeight - 2 };
    }
    await this.scene.createEntity('goal', {
      position: [this.goal.x, 0.5, this.goal.z],
      model: this.themes[this.currentTheme].goal
    });
  }

  // Farthest open odd cell from spawn: carver only opens odd cells, so an
  // even-coordinate goal would sit inside a wall (unreachable, invisible).
  findGoalCell(grid, width, height) {
    for (let x = width - 2; x > 0; x--) {
      for (let z = height - 2; z > 0; z--) {
        if (!grid[x][z] && x % 2 === 1 && z % 2 === 1 && !(x === 1 && z === 1)) {
          return { x, z };
        }
      }
    }
    return { x: 1, z: 1 }; // unreachable in practice: spawn cell is open
  }

  async generate(seed = null) {
    this.walls = [];
    this.sentinels = [];

    // Scoped PRNG: seeding must not hijack the global Math.random, which used
    // to leak into every later "random" decision (sentinels, next level, ids).
    const rand = seed !== null ? this.mulberry32(seed) : Math.random;
    this.currentSeed = seed;

    const width = this.config.mazeWidth + (GameState.currentLevel * 2);
    const height = this.config.mazeHeight + (GameState.currentLevel * 2);
    this.width = width;
    this.height = height;
    const grid = Array.from({ length: width }, () => Array(height).fill(true));

    const carve = (x, z) => {
      grid[x][z] = false;
      const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => rand() - 0.5);
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

    this.goal = this.findGoalCell(grid, width, height);
    await this.generateGoal();

    if (GameState.currentLevel > 1) {
      const sentinelCount = GameState.currentLevel;
      for (let i = 0; i < sentinelCount; i++) {
        const startX = Math.floor(rand() * (width - 2)) + 1;
        const startZ = Math.floor(rand() * (height - 2)) + 1;
        if (!grid[startX][startZ]) {
          const patrol = [
            { x: startX, z: startZ },
            { x: Math.floor(rand() * (width - 2)) + 1, z: Math.floor(rand() * (height - 2)) + 1 }
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

  // World-space bounds of the current maze; the overhead camera frames these.
  getExtents() {
    const width = this.width ?? (this.config.mazeWidth + GameState.currentLevel * 2);
    const height = this.height ?? (this.config.mazeHeight + GameState.currentLevel * 2);
    return { width, height, cx: (width - 1) / 2, cz: (height - 1) / 2 };
  }

  checkGoal(playerPos) {
    const dist = Math.sqrt(
      Math.pow(playerPos.x - this.goal.x, 2) + 
      Math.pow(playerPos.z - this.goal.z, 2)
    );
    return dist < 0.5;
  }
}
