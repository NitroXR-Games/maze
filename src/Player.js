import GameState from './GameState.js';

export class Player {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.position = { x: 1, z: 1 };
    // Face away from the chase camera (camera sits at +z looking -z).
    this.rotation = Math.PI;
    
    this.entity = null;
    // Live Scene.createEntity is async; callers await player.ready.
    this.ready = scene.createEntity('player', {
      position: [this.position.x, 0.5, this.position.z],
      model: 'nitro_player_avatar'
    }).then(entity => {
      this.entity = entity;
      // Game-owned collision (checkCollision below); the SDK physics must
      // not also resolve this body or mesh and logic positions diverge.
      if (entity.physics) entity.physics.isStatic = true;
      return entity;
    });
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
    const rx = -fz;
    const rz = fx;

    const nextX = this.position.x + (fx * fwd + rx * strafe) * this.config.playerSpeed * s;
    const nextZ = this.position.z + (fz * fwd + rz * strafe) * this.config.playerSpeed * s;
    this.rotation += turn * this.config.rotationSpeed * s;

    if (!this.checkCollision(nextX, nextZ, walls)) {
      this.position.x = nextX;
      this.position.z = nextZ;
      this.entity.setPosition([this.position.x, 0.5, this.position.z]);
    }
  }

  checkCollision(x, z, walls) {
    return walls.some(wall => {
      return x > wall.x - 0.5 && x < wall.x + 0.5 &&
             z > wall.z - 0.5 && z < wall.z + 0.5;
    });
  }
}
