export class Sentinel {
  constructor(scene, startPos, patrolPoints) {
    this.scene = scene;
    this.position = { ...startPos };
    this.patrolPoints = patrolPoints;
    this.currentPointIndex = 0;
    this.speed = 0.02;
    
    this.entity = scene.createEntity(`sentinel_${Math.random().toString(36).substr(2, 9)}`, {
      position: [this.position.x, 0.5, this.position.z],
      model: 'sphere',
      color: 'red',
      material: 'nitro_hazard_glow'
    });
  }

  update() {
    const target = this.patrolPoints[this.currentPointIndex];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < 0.1) {
      this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
    } else {
      this.position.x += (dx / dist) * this.speed;
      this.position.z += (dz / dist) * this.speed;
    }
    
    this.entity.setPosition([this.position.x, 0.5, this.position.z]);
  }

  checkCollision(playerPos) {
    const dist = Math.sqrt(
      Math.pow(playerPos.x - this.position.x, 2) + 
      Math.pow(playerPos.z - this.position.z, 2)
    );
    return dist < 0.6;
  }
}
