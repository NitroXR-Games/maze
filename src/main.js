import config from '../config.json' assert { type: 'json' };
import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import GameState from './GameState.js';

const scene = new NitroXR.Scene();
const maze = new MazeEngine(scene, config);
const player = new Player(scene, config);
const hud = new HUD(scene);

function initLevel() {
  scene.clear();
  maze.generate();
  player.position = { x: 1, z: 1 };
  player.entity.setPosition([1, 0.5, 1]);
}

initLevel();

async function gameLoop(input) {
  const prevPos = { ...player.position };
  player.update(input, maze.walls);
  
  if (prevPos.x !== player.position.x || prevPos.z !== player.position.z) {
    hud.incrementSteps();
  }
  
  // Update Hazards
  maze.sentinels.forEach(sentinel => {
    sentinel.update();
    if (sentinel.checkCollision(player.position)) {
      console.log("SENTRY COLLISION: Resetting to start!");
      player.position = { x: 1, z: 1 };
      player.entity.setPosition([1, 0.5, 1]);
    }
  });
  
  hud.update();
  
  if (maze.checkGoal(player.position)) {
    if (GameState.nextLevel()) {
      console.log(`Level ${GameState.currentLevel - 1} Complete! Moving to Level ${GameState.currentLevel}`);
      initLevel();
    } else {
      if (!GameState.isGameOver()) {
        GameState.setVictory();
        hud.showVictory();
        
        const finalScore = hud.steps + Math.floor((Date.now() - GameState.startTime) / 1000);
        await CloudLeaderboard.submitScore(NitroXR.User.id, finalScore);
      }
    }
  }
  
  scene.render();
}

NitroXR.onUpdate((input) => gameLoop(input));
