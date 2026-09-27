import GameState from './GameState.js';

export class Player {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.position = { x: 1, z: 1 };
    this.rotation = 0;
    
    this.entity = scene.createEntity('player', {
      position: [this.position.x, 0.5, this.position.z],
      model: 'sphere'
    });
  }

  update(input, walls) {
    if (GameState.isGameOver()) return;

    let nextX = this.position.x;
    let nextZ = this.position.z;

    if (input.forward) {
      nextX += Math.sin(this.rotation) * this.config.playerSpeed;
      nextZ += Math.cos(this.rotation) * this.config.playerSpeed;
    }
    if (input.backward) {
      nextX -= Math.sin(this.rotation) * this.config.playerSpeed;
      nextZ -= Math.cos(this.rotation) * this.config.playerSpeed;
    }
    if (input.left) this.rotation -= this.config.rotationSpeed;
    if (input.right) this.rotation += this.config.rotationSpeed;

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
