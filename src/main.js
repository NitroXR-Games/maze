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
import { dailySeed } from './DailyChallenge.js';
import { NitroXR, getPlayerId, AudioManager } from './nitroxr.js';

let config;
let scene, maze, player, hud, ghosts, avatars, editor, camRig, audio;
const playerId = getPlayerId();

// Audio helper - module level so both start() and gameLoop() can access it.
// A registry entry is not proof a binary exists: the seed listed four audio
// assets whose R2 objects 404, so every level-up paid a failed fetch and a
// decode attempt on an HTML error page. Remember misses and never retry.
const AUDIO_UNAVAILABLE = new Set();

const playMusicTrack = async (assetId, options = {}) => {
  if (AUDIO_UNAVAILABLE.has(assetId)) return false;
  try {
    const { metadata } = await scene.assetResolver.resolve(assetId);
    if (!metadata.audio_url) throw new Error('no audio_url');
    const buf = await audio.loadAudio(metadata.audio_url);
    if (!buf) throw new Error('empty buffer');
    audio.crossfade(buf, options);
    return true;
  } catch (e) {
    AUDIO_UNAVAILABLE.add(assetId);
    console.warn(`Audio unavailable, not retrying: ${assetId} (${e.message})`);
    return false;
  }
}

// Seconds of post-catch invulnerability.
const CAUGHT_GRACE = 2;

// Daily Challenge. The seeded generator existed but nothing ever called it,
// so the Mission Script's "same date, same maze" criterion was unreachable.
let dailyActive = false;

async function startDailyChallenge() {
  const seed = dailySeed();
  dailyActive = true;
  GameState.currentLevel = 1;
  GameState.hasWon = false;
  await initLevel(seed);
  if (hud) hud.flash(`Daily Challenge — day ${seed}`);
  console.log(`Daily Challenge: seed ${seed}`);
}

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
  
  await playMusicTrack('maze_awareness', { category: 'music', volume: 0.35, fade: 2 });

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

  // N starts the Daily Challenge (shared seed for the UTC day).
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyN' || e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    startDailyChallenge().catch(err => console.error('Daily challenge failed:', err));
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
  // Edge-detected here: a held key would otherwise re-save 60x a second.
  const savePressed = input.saveLayout && !gameLoop._prevSave;
  const loadPressed = input.loadLayout && !gameLoop._prevLoad;
  gameLoop._prevToggle = input.toggleEditor;
  gameLoop._prevAvatar = input.changeAvatar;
  gameLoop._prevSave = input.saveLayout;
  gameLoop._prevLoad = input.loadLayout;

  if (togglePressed) {
    editor.toggleEditMode();
    hud.setEditMode(editor.isEditMode);
  }

  // Layout save/load are allowed outside edit mode too: a layout is worth
  // keeping even if the player never entered the editor.
  if (savePressed || loadPressed) {
    const layoutId = editor.defaultLayoutId || 'default';
    const result = savePressed
      ? await editor.saveLayout(layoutId)
      : await editor.loadLayout(layoutId);
    if (!result.ok) {
      hud.flash(`Layout ${savePressed ? 'save' : 'load'} failed: ${result.reason}`);
    } else if (savePressed) {
      hud.flash(result.cloud
        ? `Layout "${layoutId}" saved to Cloud`
        : `Layout "${layoutId}" saved locally (Cloud unavailable)`);
    } else {
      hud.flash(`Layout "${layoutId}" loaded from ${result.source}`);
    }
  }

  if (editor.isEditMode) {
    if (await editor.handleInput(input, player.position)) {
      hud.flash('Cell edited');
    }
  } else if (!camRig.blocksMovement) {
    // In XR, translate along the headset's heading so W moves where you are
    // looking, not where the avatar points. Desktop keeps the avatar basis.
    const heading = scene.isPresentingXR?.() ? scene.getViewYaw() : null;
    player.update(input, maze.walls, heading);
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
      // No per-level themes are registered yet, so keep the one track that
      // actually resolves. Re-add level themes here once their audio exists.
      await playMusicTrack('maze_awareness', { category: 'music', volume: 0.35, fade: 2 });
      await initLevel();
    } else if (!GameState.isGameOver()) {
      GameState.setVictory();
      hud.showVictory();
      // No victory stinger is registered yet; `loop:false` on an existing
      // track would also stop the music when the stinger ends.
      await playMusicTrack('maze_awareness', { category: 'music', volume: 0.35, fade: 1 });
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
