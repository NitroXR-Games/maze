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

  handleCellInteraction(x, z) {
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
      this.mazeEngine.addWall(x, z);
      console.log(`Wall added at ${x}, ${z}`);
    }
  }

  async saveLayout(layoutId) {
    const layout = this.mazeEngine.walls.map(w => ({ x: w.x, z: w.z }));
    console.log(`Saving layout ${layoutId} to NitroXR Cloud...`);
    return await NitroXR.Cloud.submit({
      gameId: 'maze-editor',
      layoutId: layoutId,
      data: layout
    });
  }

  async loadLayout(layoutId) {
    console.log(`Loading layout ${layoutId}...`);
    const data = await NitroXR.Cloud.getLayout(layoutId);
    if (!data) return false;

    this.mazeEngine.walls = [];
    this.scene.clear(); // Clear current maze
    
    data.layout.forEach(w => {
      this.mazeEngine.addWall(w.x, w.z);
    });
    
    // Re-add goal
    this.mazeEngine.generateGoal(); 
    return true;
  }
}
