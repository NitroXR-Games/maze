// Resolves player-vs-sentinel contacts. Extracted from the game loop so the
// grace/recall rules are directly testable: without the invulnerability
// check a sentinel next to the spawn cell re-caught the player every frame.
export function resolveCatches(player, sentinels, { grace = 2, onCatch } = {}) {
  for (const s of sentinels) {
    if (!s.active) continue; // wave system: only active sentinels can catch
    if (player.isInvulnerable || !s.checkCollision(player.position)) continue;
    player.position = { x: 1, z: 1 };
    player.rotation = Math.PI;
    player.applyTransform();
    player.grantGrace(grace);
    s.recall();
    onCatch?.(s, grace);
  }
}

export class Sentinel {
  constructor(scene, startPos, patrolPoints) {
    this.scene = scene;
    this.position = { ...startPos };
    this.patrolPoints = patrolPoints;
    this.currentPointIndex = 0;
    this.speed = 0.02; // cells per 60fps frame
    this.state = 'PATROL'; // PATROL, CHASE, RETURN
    this.targetPlayer = null;
    this.active = false; // wave system: sentinel only hunts when active
    this.despawnTimer = 0;

    this.entity = null;
    this.ready = scene.createEntity(`sentinel_${Math.random().toString(36).substr(2, 9)}`, {
      position: [this.position.x, 0.5, this.position.z],
      model: 'sphere'
    }).then(entity => {
      this.entity = entity;
      // Sentinels are game-scripted; keep the SDK physics from fighting
      // their positions (see Player).
      if (entity.physics) entity.physics.isStatic = true;
      // Start hidden; wave system will show when active
      if (entity.mesh) entity.mesh.visible = false;
      return entity;
    });
  }

  static async create(scene, startPos, patrolPoints) {
    const sentinel = new Sentinel(scene, startPos, patrolPoints);
    await sentinel.ready;
    return sentinel;
  }

  // Wave system: activate for a hunt period, deactivate for a cooldown.
  activate() {
    this.active = true;
    this.state = 'PATROL';
    this.targetPlayer = null;
    if (this.entity && this.entity.mesh) this.entity.mesh.visible = true;
  }

  deactivate() {
    this.active = false;
    this.state = 'DORMANT';
    this.targetPlayer = null;
    if (this.entity && this.entity.mesh) this.entity.mesh.visible = false;
  }

  update(playerPos, walls = [], deltaTime = 0.016) {
    if (!this.active) return;
    const distToPlayer = this.getDist(playerPos, this.position);
    // Never see or catch a player through solid geometry.
    const sees = distToPlayer < 3.0 && this.hasLineOfSight(this.position, playerPos, walls);

    // Basic Behavior Tree Logic
    if (sees) {
      this.state = 'CHASE';
      this.targetPlayer = { ...playerPos };
    } else if (this.state === 'CHASE' && distToPlayer > 5.0) {
      this.state = 'RETURN';
    } else if (this.state === 'RETURN' && distToPlayer > 6.0) {
      this.state = 'PATROL';
    }

    if (this.state === 'CHASE') {
      this.moveTowards(this.targetPlayer.x, this.targetPlayer.z, walls, deltaTime);
    } else if (this.state === 'RETURN') {
      const target = this.patrolPoints[this.currentPointIndex];
      this.moveTowards(target.x, target.z, walls, deltaTime);
      if (this.getDist(this.position, target) < 0.1) {
        this.state = 'PATROL';
      }
    } else {
      this.patrol(walls, deltaTime);
    }
  }

  patrol(walls = [], deltaTime = 0.016) {
    const target = this.patrolPoints[this.currentPointIndex];
    this.moveTowards(target.x, target.z, walls, deltaTime);
    if (this.getDist(this.position, target) < 0.1) {
      this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
    }
  }

  // Wall-aware: try the full step, then slide along one axis. Without this a
  // sentinel walks straight through the maze and grabs the player from the
  // far side of a wall.
  moveTowards(tx, tz, walls = [], deltaTime = 0.016) {
    if (!this.entity) return;
    const s = (deltaTime ?? 0.016) * 60;
    const step = this.speed * s;
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 0) return;

    const ux = (dx / dist) * step;
    const uz = (dz / dist) * step;
    const nx = this.position.x + ux;
    const nz = this.position.z + uz;
    if (!this.isWall(nx, nz, walls)) {
      this.position.x = nx;
      this.position.z = nz;
    } else {
      if (!this.isWall(nx, this.position.z, walls)) this.position.x = nx;
      if (!this.isWall(this.position.x, nz, walls)) this.position.z = nz;
    }
    this.entity.setPosition([this.position.x, 0.5, this.position.z]);
  }

  // Sends the sentinel back to its patrol home. Called when it catches the
  // player so it cannot camp the spawn cell the player is thrown back to.
  recall() {
    const home = this.patrolPoints[0];
    if (home) {
      this.position = { x: home.x, z: home.z };
      this.currentPointIndex = this.patrolPoints.length > 1 ? 1 : 0;
      if (this.entity) this.entity.setPosition([this.position.x, 0.5, this.position.z]);
    }
    this.state = 'PATROL';
    this.targetPlayer = null;
  }

  isWall(x, z, walls) {
    return walls.some(w => x > w.x - 0.5 && x < w.x + 0.5 && z > w.z - 0.5 && z < w.z + 0.5);
  }

  // Samples the segment between two points; any wall cell blocks sight.
  hasLineOfSight(a, b, walls) {
    const dist = this.getDist(a, b);
    const steps = Math.ceil(dist / 0.2);
    if (steps === 0) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isWall(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, walls)) return false;
    }
    return true;
  }

  getDist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.z - p2.z, 2));
  }

  // Catch only if actually adjacent — walls are handled by the caller's
  // line-of-sight state machine.
  checkCollision(playerPos) {
    return this.getDist(playerPos, this.position) < 0.6;
  }
}
