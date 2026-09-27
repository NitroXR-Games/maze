import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import { GhostManager } from './GhostManager.js';
import { AvatarSystem } from './AvatarSystem.js';
import { LevelEditor } from './LevelEditor.js';
import GameState from './GameState.js';

let config;
const scene = new NitroXR.Scene();
let maze, player, hud, ghosts, avatars, editor;

async function start() {
  try {
    const response = await fetch('../config.json');
    config = await response.json();
  } catch (e) {
    console.error("Failed to load config:", e);
    config = { mazeWidth: 10, mazeHeight: 10, playerSpeed: 0.05, rotationSpeed: 0.03 };
  }

  maze = new MazeEngine(scene, config);
  player = new Player(scene, config);
  hud = new HUD(scene);
  ghosts = new GhostManager(scene);
  avatars = new AvatarSystem(player);
  editor = new LevelEditor(scene, maze);

  initLevel();
}

function initLevel(seed = null) {
  scene.clear();
  maze.generate(seed);
  player.position = { x: 1, z: 1 };
  player.entity.setPosition([1, 0.5, 1]);
  
  CloudLeaderboard.getTopScores().then(async scores => {
    if (scores && scores.length > 0) {
      await ghosts.loadGhost(scores[0].userId);
    }
  });
}

async function gameLoop(input) {
  if (!config) return;
  const prevPos = { ...player.position };
  
  if (input.toggleEditor) {
    editor.toggleEditMode();
  }
  
  if (editor.isEditMode) {
    if (input.interact) {
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
        await CloudLeaderboard.submitScore(NitroXR.User.id, finalScore);
      }
    }
  }
  
  scene.render();
}

start().then(() => {
  NitroXR.onUpdate((input) => gameLoop(input));
});
