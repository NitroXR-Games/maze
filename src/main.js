import { MazeEngine } from './MazeEngine.js';
import { Player } from './Player.js';
import { HUD } from './HUD.js';
import { CloudLeaderboard } from './CloudLeaderboard.js';
import { GhostManager } from './GhostManager.js';
import { AvatarSystem } from './AvatarSystem.js';
import { LevelEditor } from './LevelEditor.js';
import GameState from './GameState.js';
import { FrameGate } from './FrameGate.js';
import { CameraRig } from './CameraRig.js';
import { resolveCatches } from './Sentinel.js';
import { NitroXR, getPlayerId, AudioManager } from './nitroxr.js';

let config;
let scene, maze, player, hud, ghosts, avatars, editor, camRig, audio;
const playerId = getPlayerId();

// Seconds of post-catch invulnerability.
const CAUGHT_GRACE = 2;

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
  editor = new LevelEditor(scene, maze, player);
  camRig = new CameraRig(scene, maze);
  hud.setView(camRig.label);
  bindViewToggle();

  // Audio: start background music (will auto-resume on first user gesture)
  audio = new AudioManager();
  audio.ensureInitialized();
  
  async function playMusic(assetId, options = {}) {
    try {
      const { metadata } = await scene.assetResolver.resolve(assetId);
      if (!metadata.audio_url) throw new Error(`No audio_url for ${assetId}`);
      const buf = await audio.loadAudio(metadata.audio_url);
      if (buf) audio.crossfade(buf, options);
    } catch (e) {
      console.warn(`Audio load failed: ${assetId}`, e);
    }
  }
  
  await playMusic('maze_awareness', { category: 'music', volume: 0.35, fade: 2 });

  await initLevel();
  // Scene.startLoop does not await the callback, so an async frame that awaits
  // a level transition would overlap with the next frame and run game logic
  // against a half-rebuilt maze. The gate skips instead of stacking.
  const gate = new FrameGate();
  scene.startLoop(input => gate.run(() => gameLoop(input)));
}

// V cycles the desktop camera. The runtime InputBridge has no view action, so
// the game binds it here; e.repeat guards against held-key cycling.
function bindViewToggle() {
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyV' || e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    camRig.cycle();
    hud.setView(camRig.label);
  });
}

async function initLevel(seed = null) {
  scene.clear();
  ghosts.reset();
  await maze.generate(seed);
  maze.startWaves();
  player.position = { x: 1, z: 1 };
  player.rotation = Math.PI; // face away from the chase camera
  await player.respawn(); // scene.clear() detached the previous player body
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
  if (GameState.isGameOver()) return; // Victory: stop the loop

  // Edge-triggered toggles: holding the key must not strobe modes.
  const togglePressed = input.toggleEditor && !gameLoop._prevToggle;
  const avatarPressed = input.changeAvatar && !gameLoop._prevAvatar;
  gameLoop._prevToggle = input.toggleEditor;
  gameLoop._prevAvatar = input.changeAvatar;

  if (togglePressed) {
    editor.toggleEditMode();
    hud.setEditMode(editor.isEditMode);
  }

  if (editor.isEditMode) {
    if (await editor.handleInput(input, player.position)) {
      hud.flash('Cell edited');
    }
  } else if (!camRig.blocksMovement) {
    player.update(input, maze.walls);
  }

  // Steps are whole cells travelled, not frames (frame-rate independent).
  hud.recordStep(player.position);
  ghosts.recordPosition(player.position);

  player.updateGrace(input.deltaTime ?? 0.016);
  maze.updateWaves(input.deltaTime ?? 0.016);
  maze.sentinels.forEach(sentinel => {
    sentinel.update(player.position, maze.walls, input.deltaTime ?? 0.016);
  });
  // Brief invulnerability plus a recall, so a sentinel that caught the player
  // cannot immediately re-catch them at the spawn cell.
  resolveCatches(player, maze.sentinels, {
    grace: CAUGHT_GRACE,
    onCatch: (_sentinel, grace) => hud.showCaught(grace)
  });
  ghosts.update();

  if (avatarPressed) {
    avatars.cycleAvatar();
  }

  hud.update(input, player.position, player.rotation);

  if (maze.checkGoal(player.position)) {
    if (GameState.nextLevel()) {
      // Crossfade to next level theme
      await playMusic(`maze_theme_level${GameState.currentLevel}`, { category: 'music', volume: 0.35, fade: 2 });
      await initLevel();
    } else if (!GameState.isGameOver()) {
      GameState.setVictory();
      hud.showVictory();
      await playMusic('maze_victory', { category: 'music', volume: 0.6, fade: 1, loop: false });
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
  // moves the rig. Desktop players get the selected camera mode.
  camRig.update(player.position, player.rotation);

  scene.update(input.deltaTime ?? 0.016);
}

start().catch(e => console.error('Boot failed:', e));
