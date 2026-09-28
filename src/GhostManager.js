import { NitroXR, GAME_ID, GhostRecorder, GhostPlayer } from './nitroxr.js';

export class GhostManager {
  constructor(scene) {
    this.scene = scene;
    this.players = [];
    this.recorder = new GhostRecorder({ hz: 10 });
  }

  recordPosition(pos) {
    this.recorder.sample([pos.x, 0.5, pos.z]);
  }

  async loadGhost(userId) {
    console.log(`Fetching ghost data for ${userId}...`);
    let data;
    try {
      data = await NitroXR.Cloud.getGhost(userId, GAME_ID);
    } catch (e) {
      console.error('Ghost fetch failed', e);
      return null;
    }
    if (!data) return null;

    const entity = await this.scene.createEntity(`ghost_${userId}`, {
      model: 'maze_ghost',
      position: [1, 0.5, 1]
    });
    const player = new GhostPlayer(entity, { loop: true });
    player.load(data);
    player.play();
    this.players.push(player);
    return player;
  }

  update(nowMs = Date.now()) {
    this.players.forEach(p => p.update(nowMs));
  }

  reset() {
    this.players = [];
    this.recorder.reset();
  }

  async uploadGhost(userId) {
    return NitroXR.Cloud.submitGhost(userId, this.recorder.toPayload(), GAME_ID);
  }

  getRecording() {
    return this.recorder.points;
  }
}
