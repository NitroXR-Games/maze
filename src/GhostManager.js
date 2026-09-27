export class GhostManager {
  constructor(scene) {
    this.scene = scene;
    this.ghosts = [];
    this.recording = [];
  }

  recordPosition(pos) {
    this.recording.push({ ...pos, t: Date.now() });
  }

  async loadGhost(userId) {
    console.log(`Fetching ghost data for ${userId}...`);
    const data = await NitroXR.Cloud.getGhost(userId);
    if (!data) return null;

    const ghostEntity = this.scene.createEntity(`ghost_${userId}`, {
      model: 'sphere',
      material: 'nitro_ghost_transparent',
      position: [data.path[0].x, 0.5, data.path[0].z]
    });

    const ghost = {
      entity: ghostEntity,
      path: data.path,
      startTime: Date.now()
    };
    this.ghosts.push(ghost);
    return ghost;
  }

  update() {
    const now = Date.now();
    this.ghosts.forEach(ghost => {
      const elapsed = now - ghost.startTime;
      const frame = ghost.path.find(p => p.t >= elapsed) || ghost.path[ghost.path.length - 1];
      ghost.entity.setPosition([frame.x, 0.5, frame.z]);
    });
  }

  getRecording() {
    return this.recording;
  }
}
