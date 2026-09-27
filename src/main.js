import config from '../config.json' assert { type: 'json' };
import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import GameState from './GameState.js';

const scene = new NitroXR.Scene();
const maze = new MazeEngine(scene, config);
const player = new Player(scene, config);

maze.generate();

function gameLoop(input) {
  player.update(input, maze.walls);
  
  if (maze.checkGoal(player.position)) {
    GameState.setVictory();
  }
  
  scene.render();
}

// NitroXR runtime entry point
NitroXR.onUpdate((input) => gameLoop(input));
