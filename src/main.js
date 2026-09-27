import config from '../config.json' assert { type: 'json' };
import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import GameState from './GameState.js';

const scene = new NitroXR.Scene();
const maze = new MazeEngine(scene, config);
const player = new Player(scene, config);
const hud = new HUD(scene);

maze.generate();

function gameLoop(input) {
  const prevPos = { ...player.position };
  player.update(input, maze.walls);
  
  if (prevPos.x !== player.position.x || prevPos.z !== player.position.z) {
    hud.incrementSteps();
  }
  
  hud.update();
  
  if (maze.checkGoal(player.position)) {
    if (!GameState.isGameOver()) {
      GameState.setVictory();
      hud.showVictory();
    }
  }
  
  scene.render();
}

NitroXR.onUpdate((input) => gameLoop(input));
