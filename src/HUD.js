export class HUD {
  constructor(scene) {
    this.scene = scene;
    this.steps = 0;
    this.startTime = Date.now();
    
    this.uiContainer = scene.createEntity('hud_container', {
      position: [0, 2, -1],
      rotation: [0, 0, 0],
      type: 'ui_panel'
    });
    
    this.stepText = scene.createEntity('step_counter', {
      parent: 'hud_container',
      text: 'Steps: 0',
      position: [-0.5, 0, 0]
    });
    
    this.timerText = scene.createEntity('timer', {
      parent: 'hud_container',
      text: 'Time: 0s',
      position: [0.5, 0, 0]
    });
  }

  update() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    this.stepText.setText(`Steps: ${this.steps}`);
    this.timerText.setText(`Time: ${elapsed}s`);
  }

  incrementSteps() {
    this.steps++;
  }

  showVictory() {
    this.uiContainer.createEntity('victory_msg', {
      text: 'MAZE COMPLETE!',
      color: 'gold',
      scale: [2, 2, 2],
      position: [0, 0, 0]
    });
  }
}
