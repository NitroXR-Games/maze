import config from '../config.json' assert { type: 'json' };
import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import { GhostManager } from './GhostManager.js';
import { AvatarSystem } from './AvatarSystem.js';
import GameState from './GameState.js';

const scene = new NitroXR.Scene();
const maze = new MazeEngine(scene, config);
const player = new Player(scene, config);
const hud = new HUD(scene);
const ghosts = new GhostManager(scene);
const avatars = new AvatarSystem(player);

function initLevel() {
  scene.clear();
  maze.generate();
  player.position = { x: 1, z: 1 };
  player.entity.setPosition([1, 0.5, 1]);
  
  // Load top ghost for the level
  CloudLeaderboard.getTopScores().then(async scores => {
    if (scores.length > 0) {
      await ghosts.loadGhost(scores[0].userId);
    }
  });
}

initLevel();

async function gameLoop(input) {
  const prevPos = { ...player.position };
  player.update(input, maze.walls);
  
  // Record ghost path
  ghosts.recordPosition(player.position);
  
  if (prevPos.x !== player.position.x || prevPos.z !== player.position.z) {
    hud.incrementSteps();
  }
  
  // Update Hazards & Ghosts
  maze.sentinels.forEach(sentinel => {
    sentinel.update();
    if (sentinel.checkCollision(player.position)) {
      player.position = { x: 1, z: 1 };
      player.entity.setPosition([1, 0.5, 1]);
    }
  });
  ghosts.update();
  
  // Avatar toggle via input 'C' (hypothetical)
  if (input.changeAvatar) {
    avatars.cycleAvatar();
  }
  
  hud.update();
  
  if (maze.checkGoal(player.position)) {
    if (GameState.nextLevel()) {
      initLevel();
    } else {
      if (!GameState.isGameOver()) {
        GameState.setVictory();
        hud.showVictory();
        
        const finalScore = hud.steps + Math.floor((Date.now() - GameState.startTime) / 1000);
        const ghostData = { userId: NitroXR.User.id, path: ghosts.getRecording() };
        
        await Promise.all([
          CloudLeaderboard.submitScore(NitroXR.User.id, finalScore),
          NitroXR.Cloud.submitGhost(ghostData)
        ]);
      }
    }
  }
  
  scene.render();
}

NitroXR.onUpdate((input) => gameLoop(input));
