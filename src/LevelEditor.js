import { NitroXR } from './nitroxr.js';

export class LevelEditor {
  constructor(scene, mazeEngine, player = null) {
    this.scene = scene;
    this.mazeEngine = mazeEngine;
    // Held so a rebuild that clears the scene can restore the player body.
    this.player = player;
    this.isEditMode = false;
    this.selectedCell = null;
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this._prevInteract = false;
    console.log(`Edit Mode: ${this.isEditMode ? 'ON' : 'OFF'}`);
    return this.isEditMode;
  }

  // One press paints one cell. This used to be level-triggered in the game
  // loop, so holding the key toggled the same wall ~60x a second (strobing
  // it on and off). Returns true when a cell was actually toggled.
  async handleInput(input, playerPos) {
    const held = !!input.interact;
    const pressed = held && !this._prevInteract;
    this._prevInteract = held;
    if (!this.isEditMode || !pressed) return false;
    return this.handleCellInteraction(Math.round(playerPos.x), Math.round(playerPos.z));
  }

  async handleCellInteraction(x, z) {
    if (!this.isEditMode) return false;

    const wallIndex = this.mazeEngine.walls.findIndex(w => w.x === x && w.z === z);
    if (wallIndex !== -1) {
      // Remove wall
      const wall = this.mazeEngine.walls[wallIndex];
      this.scene.removeEntity(`wall_${wall.x}_${wall.z}`);
      this.mazeEngine.walls.splice(wallIndex, 1);
      console.log(`Wall removed at ${x}, ${z}`);
    } else {
      // Add wall
      await this.mazeEngine.addWall(x, z);
      console.log(`Wall added at ${x}, ${z}`);
    }
    return true;
  }

  // Lap 7: layouts live in the Cloud so they outlive the browser profile that
  // made them. localStorage is kept as an offline cache and fallback, because
  // "your maze vanished because the network blinked" is not an acceptable
  // outcome for authored work.
  layoutKey(layoutId) {
    return `nitro_maze_layout_${layoutId}`;
  }

  get gameId() {
    return this.game || 'maze';
  }

  currentCells() {
    return this.mazeEngine.walls.map(w => ({ x: w.x, z: w.z }));
  }

  // Defensive: the Worker validates too, but a layout is replayed into
  // addWall(x, z) and a stray float would offset the mesh off-grid forever.
  static sanitiseCells(cells) {
    if (!Array.isArray(cells)) return null;
    const out = [];
    const seen = new Set();
    for (const c of cells) {
      if (!c || typeof c !== 'object') return null;
      const { x, z } = c;
      if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
      if (x < 0 || x > 255 || z < 0 || z > 255) return null;
      const k = `${x},${z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x, z });
    }
    return out.length ? out : null;
  }

  // Accepts both the new cloud record and the legacy bare-array local format.
  static extractCells(payload) {
    if (Array.isArray(payload)) return LevelEditor.sanitiseCells(payload);
    if (payload && Array.isArray(payload.cells)) return LevelEditor.sanitiseCells(payload.cells);
    return null;
  }

  _writeLocal(layoutId, cells) {
    try {
      localStorage.setItem(this.layoutKey(layoutId), JSON.stringify(cells));
      return true;
    } catch (e) {
      console.warn('Local layout cache write failed', e);
      return false;
    }
  }

  _readLocal(layoutId) {
    try {
      const raw = localStorage.getItem(this.layoutKey(layoutId));
      return raw ? LevelEditor.extractCells(JSON.parse(raw)) : null;
    } catch (e) {
      console.warn('Local layout cache read failed', e);
      return null;
    }
  }

  // Always writes the local cache. `cloud` reports where the copy the player
  // will reload from actually landed, so the HUD can say "saved locally only".
  async saveLayout(layoutId) {
    const cells = this.currentCells();
    if (!cells.length) {
      return { ok: false, cloud: false, reason: 'A layout needs at least one wall' };
    }
    let cloud = false;
    let reason = null;
    try {
      await NitroXR.Cloud.saveLayout(layoutId, cells, this.gameId);
      cloud = true;
    } catch (e) {
      reason = e.message;
      console.warn(`Layout ${layoutId} not saved to Cloud:`, e);
    }
    const local = this._writeLocal(layoutId, cells);
    if (!cloud && !local) return { ok: false, cloud: false, reason: reason || 'Save failed' };
    return { ok: true, cloud, local, reason };
  }

  // Cloud first, local cache second. Returns where the cells came from so the
  // player is told the truth about which copy they are playing.
  async loadLayout(layoutId) {
    let cells = null;
    let source = null;
    let cloudError = null;
    try {
      cells = LevelEditor.extractCells(await NitroXR.Cloud.getLayout(layoutId, this.gameId));
      if (cells) source = 'cloud';
    } catch (e) {
      cloudError = e.message;
      console.warn(`Layout ${layoutId} unreachable:`, e);
    }
    if (!cells) {
      cells = this._readLocal(layoutId);
      if (cells) source = 'local';
    }
    if (!cells) return { ok: false, source: null, reason: cloudError || `No layout called "${layoutId}"` };

    this.mazeEngine.walls = [];
    this.scene.clear(); // Clear current maze

    for (const w of cells) {
      await this.mazeEngine.addWall(w.x, w.z);
    }

    // Re-add goal
    await this.mazeEngine.generateGoal();
    // scene.clear() detached the player; without this the avatar vanishes.
    if (this.player) await this.player.respawn();
    // Keep the cache warm so a later offline load still works.
    this._writeLocal(layoutId, cells);
    // Carry the cloud error through even on success: a local fallback is only
    // honest if the player is told the cloud copy was unavailable.
    return { ok: true, source, cells: cells.length, reason: cloudError || undefined };
  }

  async deleteLayout(layoutId) {
    const result = { cloud: false, local: false, reason: null };
    try {
      await NitroXR.Cloud.deleteLayout(layoutId, this.gameId);
      result.cloud = true;
    } catch (e) {
      result.reason = e.message;
    }
    try {
      localStorage.removeItem(this.layoutKey(layoutId));
      result.local = true;
    } catch (e) {
      console.warn('Local layout delete failed', e);
    }
    return result;
  }

  async listLayouts() {
    try {
      const { layouts } = await NitroXR.Cloud.listLayouts(this.gameId);
      return Array.isArray(layouts) ? layouts : [];
    } catch (e) {
      return [];
    }
  }
}
