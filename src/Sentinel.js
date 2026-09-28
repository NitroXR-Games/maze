export class Sentinel {
  constructor(scene, startPos, patrolPoints) {
    this.scene = scene;
    this.position = { ...startPos };
    this.patrolPoints = patrolPoints;
    this.currentPointIndex = 0;
    this.speed = 0.02;
    this.state = 'PATROL'; // PATROL, CHASE, RETURN
    this.targetPlayer = null;
    
    this.entity = null;
    this.ready = scene.createEntity(`sentinel_${Math.random().toString(36).substr(2, 9)}`, {
      position: [this.position.x, 0.5, this.position.z],
      model: 'sphere'
    }).then(entity => {
      this.entity = entity;
      // Sentinels path through walls by design; keep the SDK physics from
      // fighting their scripted positions (see Player).
      if (entity.physics) entity.physics.isStatic = true;
      return entity;
    });
  }

  static async create(scene, startPos, patrolPoints) {
    const sentinel = new Sentinel(scene, startPos, patrolPoints);
    await sentinel.ready;
    return sentinel;
  }

  update(playerPos) {
    const distToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.position.x, 2) + 
      Math.pow(playerPos.z - this.position.z, 2)
    );

    // Basic Behavior Tree Logic
    if (distToPlayer < 3.0) {
      this.state = 'CHASE';
      this.targetPlayer = playerPos;
    } else if (this.state === 'CHASE' && distToPlayer > 5.0) {
      this.state = 'RETURN';
    } else if (this.state === 'RETURN' && distToPlayer > 6.0) {
      this.state = 'PATROL';
    }

    if (this.state === 'CHASE') {
      this.moveTowards(this.targetPlayer.x, this.targetPlayer.z);
    } else if (this.state === 'RETURN') {
      this.moveTowards(this.patrolPoints[this.currentPointIndex].x, this.patrolPoints[this.currentPointIndex].z);
      if (this.getDist(this.position, this.patrolPoints[this.currentPointIndex]) < 0.1) {
        this.state = 'PATROL';
      }
    } else {
      this.patrol();
    }
  }

  patrol() {
    const target = this.patrolPoints[this.currentPointIndex];
    this.moveTowards(target.x, target.z);
    if (this.getDist(this.position, target) < 0.1) {
      this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
    }
  }

  moveTowards(tx, tz) {
    if (!this.entity) return;
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0) {
      this.position.x += (dx / dist) * this.speed;
      this.position.z += (dz / dist) * this.speed;
    }
    this.entity.setPosition([this.position.x, 0.5, this.position.z]);
  }

  getDist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.z - p2.z, 2));
  }

  checkCollision(playerPos) {
    return this.getDist(playerPos, this.position) < 0.6;
  }
}
