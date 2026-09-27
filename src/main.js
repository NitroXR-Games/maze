import config from '../config.json' assert { type: 'json' };
import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import { GhostManager } from './GhostManager.js';
import { AvatarSystem } from './AvatarSystem.js';
import { LevelEditor } from './LevelEditor.js';
import GameState from './GameState.js';

const scene = new NitroXR.Scene();
const maze = new MazeEngine(scene, config);
const player = new Player(scene, config);
const hud = new HUD(scene);
const ghosts = new GhostManager(scene);
const avatars = new AvatarSystem(player);
const editor = new LevelEditor(scene, maze);

function initLevel(seed = null) {
  scene.clear();
  maze.generate(seed);
  player.position = { x: 1, z: 1 };
  player.entity.setPosition([1, 0.5, 1]);
  
  CloudLeaderboard.getTopScores().then(async scores => {
    if (scores.length > 0) {
      await ghosts.loadGhost(scores[0].userId);
    }
  });
}

// Handle Daily Challenge input
function startDailyChallenge() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seed = parseInt(today);
  console.log(`Launching Daily Challenge for seed: ${seed}`);
  initLevel(seed);
}

// Initial start
initLevel();

async function gameLoop(input) {
  const prevPos = { ...player.position };
  
  // Editor Logic
  if (input.toggleEditor) {
    editor.toggleEditMode();
  }
  
  if (editor.isEditMode) {
    if (input.interact) {
      // In a real XR app, we'd raycast to find the cell
      const cellX = Math.round(player.position.x);
      const cellZ = Math.round(player.position.z);
      editor.handleCellInteraction(cellX, cellZ);
    }
  } else {
    player.update(input, maze.walls);
  }
  
  if (prevPos.x !== player.position.x || prevPos.z !== player.position.z) {
    hud.incrementSteps();
  }
  
  // Update Hazards
  maze.sentinels.forEach(sentinel => {
    sentinel.update(player.position);
    if (sentinel.checkCollision(player.position)) {
      player.position = { x: 1, z: 1 };
      player.entity.setPosition([1, 0.5, 1]);
    }
  });
  ghosts.update();
  
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

