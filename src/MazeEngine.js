import GameState from './GameState.js';
import { Sentinel } from './Sentinel.js';

export class MazeEngine {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.walls = [];
    this.sentinels = [];
    this.goal = null;
    // Asset ids used for the maze. Themes were removed deliberately: the
    // neon/ruins sets point at registry entries that do not exist, and the
    // runtime's entity.update({material}) only assigns a field — it never
    // touches the mesh — so a theme switch would have been a visible no-op.
    // Add real assets first, then reintroduce them here.
    this.wallModel = 'maze_wall_concrete';
    this.goalModel = 'maze_goal_portal';

    // Sentinel wave system: periodic active/inactive cycles so the player
    // gets windows of safety. Durations are in seconds.
    this.wave = {
      active: false,
      timer: 0,
      activeDuration: 20,   // seconds sentinels hunt
      cooldownDuration: 15, // seconds they vanish
    };
  }

  async generateGoal() {
    // this.goal is set by generate() to an open cell; fall back to a safe
    // search if unset (e.g. editor-loaded layouts) to never place the portal
    // inside a wall.
    if (!this.goal || this.walls.some(w => w.x === this.goal.x && w.z === this.goal.z)) {
      this.goal = this.findGoalCell(
        this.walls.reduce((g, w) => { g[w.x] = g[w.x] || []; g[w.x][w.z] = true; return g; }, []),
        this.width || this.config.mazeWidth + GameState.currentLevel * 2,
        this.height || this.config.mazeHeight + GameState.currentLevel * 2
      );
    }
    await this.scene.createEntity('goal', {
      position: [this.goal.x, 0.5, this.goal.z],
      model: this.goalModel
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
    // Sentinels start dormant; startWaves() will activate the first wave.
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
      model: this.wallModel,
      physics: { isStatic: true }
    });
  }

  // World-space bounds of the current maze; the overhead camera frames these.
  getExtents() {
    const width = this.width ?? (this.config.mazeWidth + GameState.currentLevel * 2);
    const height = this.height ?? (this.config.mazeHeight + GameState.currentLevel * 2);
    return { width, height, cx: (width - 1) / 2, cz: (height - 1) / 2 };
  }

  // Start the sentinel wave cycle for this level.
  startWaves() {
    if (GameState.currentLevel <= 1) return; // no sentinels on level 1
    this.wave.active = true;
    this.wave.timer = this.wave.activeDuration;
    this.sentinels.forEach(s => s.activate());
    console.log(`[Wave] Sentinels active for ${this.wave.activeDuration}s`);
  }

  // Update the wave timer; call once per frame with deltaTime.
  updateWaves(deltaTime) {
    if (GameState.currentLevel <= 1) return;
    this.wave.timer -= deltaTime;

    if (this.wave.active) {
      if (this.wave.timer <= 0) {
        // Wave ends -> cooldown
        this.wave.active = false;
        this.wave.timer = this.wave.cooldownDuration;
        this.sentinels.forEach(s => s.deactivate());
        console.log(`[Wave] Cooldown for ${this.wave.cooldownDuration}s`);
      }
    } else {
      if (this.wave.timer <= 0) {
        // Cooldown ends -> new wave
        this.wave.active = true;
        this.wave.timer = this.wave.activeDuration;
        this.sentinels.forEach(s => s.activate());
        console.log(`[Wave] Sentinels active for ${this.wave.activeDuration}s`);
      }
    }
  }

  checkGoal(playerPos) {
    const dist = Math.sqrt(
      Math.pow(playerPos.x - this.goal.x, 2) + 
      Math.pow(playerPos.z - this.goal.z, 2)
    );
    return dist < 0.5;
  }
}
