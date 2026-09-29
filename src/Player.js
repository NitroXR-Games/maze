import GameState from './GameState.js';

export class Player {
  // Half-width of the avatar in cells (measured from the GLB: 0.704 x 0.712).
  // Slightly under the visual radius so the mesh never sinks into a wall.
  static WALL_MARGIN = 0.35;

  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.position = { x: 1, z: 1 };
    // Face away from the chase camera (camera sits at +z looking -z).
    this.rotation = Math.PI;

    this.entity = null;
    // Post-catch invulnerability. Without it, a sentinel sitting near the
    // spawn cell re-caught the player every frame and the run became
    // unwinnable with no feedback.
    this.grace = 0;
    // Live Scene.createEntity is async; callers await player.ready.
    this.ready = this._spawn();
  }

  grantGrace(seconds) {
    this.grace = seconds;
  }

  get isInvulnerable() {
    return this.grace > 0;
  }

  // Driven by frame deltaTime, not wall clock, so the grace survives a
  // backgrounded tab (rAF stops) instead of expiring while you are away.
  updateGrace(deltaTime) {
    if (this.grace > 0) this.grace = Math.max(0, this.grace - (deltaTime ?? 0.016));
  }

  // Scene.clear() (level change) detaches every mesh, so the player body has
  // to be re-created or the avatar silently disappears after level 1.
  async _spawn() {
    this.entity = await this.scene.createEntity('player', {
      position: [this.position.x, 0.5, this.position.z],
      model: 'nitro_player_avatar'
    });
    // Game-owned collision (checkCollision below); the SDK physics must
    // not also resolve this body or mesh and logic positions diverge.
    if (this.entity.physics) this.entity.physics.isStatic = true;
    this.applyTransform();
    return this.entity;
  }

  async respawn() {
    await this._spawn();
  }

  // The SDK entity has no rotation API, so drive the mesh yaw directly.
  applyTransform() {
    if (!this.entity) return;
    this.entity.setPosition([this.position.x, 0.5, this.position.z]);
    if (this.entity.mesh?.rotation) this.entity.mesh.rotation.y = this.rotation;
  }

  // v2 scheme: moveX/moveZ translate relative to facing (strafe included),
  // turnLeft/turnRight rotate. Analog magnitudes double as variable speed.
  update(input, walls) {
    if (GameState.isGameOver() || !this.entity) return;

    // Frame-rate independent: speeds are defined per 60fps frame.
    const s = (input.deltaTime ?? 0.016) * 60;
    const clamp1 = (n) => Math.max(-1, Math.min(1, n ?? 0));

    let fwd, strafe, turn;
    if (input.moveX !== undefined || input.moveZ !== undefined) {
      fwd = -clamp1(input.moveZ);
      strafe = clamp1(input.moveX);
      turn = clamp1(input.turn ?? ((input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0)));
    } else {
      // Legacy boolean-only input (e.g. scripted tests).
      fwd = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    }

    const fx = Math.sin(this.rotation);
    const fz = Math.cos(this.rotation);
    // Right-hand basis: right = up x forward. These were briefly "corrected" to
    // (fz, -fx), which is the left vector and inverted A/D — the chase camera
    // had been mis-rotated at the same time, which hid it.
    const rx = -fz;
    const rz = fx;

    const nextX = this.position.x + (fx * fwd + rx * strafe) * this.config.playerSpeed * s;
    const nextZ = this.position.z + (fz * fwd + rz * strafe) * this.config.playerSpeed * s;
    this.rotation += turn * this.config.rotationSpeed * s;

    if (!this.checkCollision(nextX, nextZ, walls)) {
      this.position.x = nextX;
      this.position.z = nextZ;
      this.applyTransform();
    } else if (turn !== 0) {
      // Turning in place must still spin the avatar.
      this.applyTransform();
    }
  }

  // The player was a collision *point* (radius 0) while the avatar mesh is
  // ~0.71 wide, so the body visibly overlapped walls — worst inside corners
  // where it pressed against two of them. WALL_MARGIN keeps the logical body
  // inside the visual one without changing solvability: corridors are 1.0 wide
  // and 2*0.35 = 0.7 still fits, so every generated maze stays traversable.
  checkCollision(x, z, walls) {
    const r = this.constructor.WALL_MARGIN;
    return walls.some(wall => {
      return x > wall.x - 0.5 - r && x < wall.x + 0.5 + r &&
             z > wall.z - 0.5 - r && z < wall.z + 0.5 + r;
    });
  }
}
