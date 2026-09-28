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
      return entity;
    });
  }

  update(input, walls) {
    if (GameState.isGameOver() || !this.entity) return;

    // Frame-rate independent: speeds are defined per 60fps frame.
    const s = (input.deltaTime ?? 0.016) * 60;

    let nextX = this.position.x;
    let nextZ = this.position.z;

    if (input.forward) {
      nextX += Math.sin(this.rotation) * this.config.playerSpeed * s;
      nextZ += Math.cos(this.rotation) * this.config.playerSpeed * s;
    }
    if (input.backward) {
      nextX -= Math.sin(this.rotation) * this.config.playerSpeed * s;
      nextZ -= Math.cos(this.rotation) * this.config.playerSpeed * s;
    }
    if (input.left) this.rotation -= this.config.rotationSpeed * s;
    if (input.right) this.rotation += this.config.rotationSpeed * s;

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
