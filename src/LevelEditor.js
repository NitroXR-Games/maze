export class LevelEditor {
  constructor(scene, mazeEngine) {
    this.scene = scene;
    this.mazeEngine = mazeEngine;
    this.isEditMode = false;
    this.selectedCell = null;
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    console.log(`Edit Mode: ${this.isEditMode ? 'ON' : 'OFF'}`);
    return this.isEditMode;
  }

  async handleCellInteraction(x, z) {
    if (!this.isEditMode) return;

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
    return true;
  }
}
