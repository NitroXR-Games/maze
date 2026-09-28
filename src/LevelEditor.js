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
  handleInput(input, playerPos) {
    const held = !!input.interact;
    const pressed = held && !this._prevInteract;
    this._prevInteract = held;
    if (!this.isEditMode || !pressed) return false;
    return this.handleCellInteraction(Math.round(playerPos.x), Math.round(playerPos.z));
  }

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

  // Lap 7 will move layouts server-side; until then layouts persist locally.
  // (The live Cloud has no layout endpoints yet, so no Cloud calls here.)
  layoutKey(layoutId) {
    return `nitro_maze_layout_${layoutId}`;
  }

  async saveLayout(layoutId) {
    const layout = this.mazeEngine.walls.map(w => ({ x: w.x, z: w.z }));
    console.log(`Saving layout ${layoutId} locally...`);
    try {
      localStorage.setItem(this.layoutKey(layoutId), JSON.stringify(layout));
      return true;
    } catch (e) {
      console.error('Layout save failed', e);
      return false;
    }
  }

  async loadLayout(layoutId) {
    console.log(`Loading layout ${layoutId}...`);
    let layout = null;
    try {
      const raw = localStorage.getItem(this.layoutKey(layoutId));
      if (raw) layout = JSON.parse(raw);
    } catch (e) {
      console.error('Layout load failed', e);
      return false;
    }
    if (!layout) return false;

    this.mazeEngine.walls = [];
    this.scene.clear(); // Clear current maze

    for (const w of layout) {
      await this.mazeEngine.addWall(w.x, w.z);
    }

    // Re-add goal
    await this.mazeEngine.generateGoal();
    // scene.clear() detached the player; without this the avatar vanishes.
    if (this.player) await this.player.respawn();
    return true;
  }
}
