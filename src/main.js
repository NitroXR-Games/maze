import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import { GhostManager } from './GhostManager.js';
import { AvatarSystem } from './AvatarSystem.js';
import { LevelEditor } from './LevelEditor.js';
import GameState from './GameState.js';
import { NitroXR, getPlayerId } from './nitroxr.js';

let config;
let scene, maze, player, hud, ghosts, avatars, editor;
const playerId = getPlayerId();

async function start() {
  scene = new NitroXR.Scene();
  // Only offer the VR button where WebXR actually exists; on desktop it
  // renders as a scary "VR NOT SUPPORTED" pill.
  try {
    if (await NitroXR.InputBridge.isXRSupported()) {
      await scene.enableVRButton?.();
    }
  } catch {
    // Desktop: no headset, keyboard loop still runs.
  }

  try {
    const response = await fetch('./config.json');
    config = await response.json();
  } catch (e) {
    console.error('Failed to load config:', e);
    config = { mazeWidth: 10, mazeHeight: 10, playerSpeed: 0.05, rotationSpeed: 0.03 };
  }

  maze = new MazeEngine(scene, config);
  player = new Player(scene, config);
  await player.ready;
  hud = new HUD();
  ghosts = new GhostManager(scene);
  avatars = new AvatarSystem(player);
  editor = new LevelEditor(scene, maze);

  await initLevel();
  scene.startLoop((input) => {
    gameLoop(input).catch(e => console.error('Game loop failed:', e));
  });
}

async function initLevel(seed = null) {
  scene.clear();
  ghosts.reset();
  await maze.generate(seed);
  player.position = { x: 1, z: 1 };
  player.rotation = Math.PI; // face away from the chase camera
  player.entity.setPosition([1, 0.5, 1]);
  ghosts.recorder.reset();

  try {
    const scores = await CloudLeaderboard.getTopScores();
    const rival = scores.find(s => s.userId !== playerId);
    if (rival) await ghosts.loadGhost(rival.userId);
  } catch (e) {
    console.error('Ghost load failed:', e);
  }
}

async function gameLoop(input) {
  if (!config) return;
  const prevPos = { ...player.position };

  // Edge-triggered toggles: holding the key must not strobe modes.
  const togglePressed = input.toggleEditor && !gameLoop._prevToggle;
  const avatarPressed = input.changeAvatar && !gameLoop._prevAvatar;
  gameLoop._prevToggle = input.toggleEditor;
  gameLoop._prevAvatar = input.changeAvatar;

  if (togglePressed) {
    editor.toggleEditMode();
  }

  if (editor.isEditMode) {
    if (input.interact) {
      const cellX = Math.round(player.position.x);
      const cellZ = Math.round(player.position.z);
      await editor.handleCellInteraction(cellX, cellZ);
    }
  } else {
    player.update(input, maze.walls);
  }

  if (prevPos.x !== player.position.x || prevPos.z !== player.position.z) {
    hud.incrementSteps();
  }
  ghosts.recordPosition(player.position);

  maze.sentinels.forEach(sentinel => {
    sentinel.update(player.position);
    if (sentinel.checkCollision(player.position)) {
      player.position = { x: 1, z: 1 };
      player.rotation = Math.PI;
      player.entity.setPosition([1, 0.5, 1]);
    }
  });
  ghosts.update();

  if (avatarPressed) {
    avatars.cycleAvatar();
  }

  hud.update();

  if (maze.checkGoal(player.position)) {
    if (GameState.nextLevel()) {
      await initLevel();
    } else if (!GameState.isGameOver()) {
      GameState.setVictory();
      hud.showVictory();
      const finalScore = hud.steps + Math.floor((Date.now() - GameState.startTime) / 1000);
      await CloudLeaderboard.submitScore(playerId, finalScore);
      try {
        await ghosts.uploadGhost(playerId);
      } catch (e) {
        console.error('Ghost upload failed:', e);
      }
    }
  }

  // Third-person follow: the headset owns the camera pose, so locomotion
  // moves the rig. Desktop players get a chase view that tracks the player.
  scene.rig.position.set(player.position.x, 0, player.position.z + 4.5);

  scene.update(input.deltaTime ?? 0.016);
}

start().catch(e => console.error('Boot failed:', e));
