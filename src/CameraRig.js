// Desktop camera modes. The runtime Scene owns one PerspectiveCamera parented
// to a rig; the headset owns the camera pose in XR, so every mode here only
// moves the rig and the camera's local transform on desktop. In XR the rig
// still follows the player (locomotion) and the mode is ignored.
export const VIEW_MODES = ['chase', 'topdown', 'firstperson', 'orbit'];

const LABELS = {
  chase: 'Chase',
  topdown: 'Top-down',
  firstperson: 'First-person',
  orbit: 'Orbit (inspect — movement paused)'
};

const EYE_HEIGHT = 1.6;
const CHASE_BACK = 4.5;
const ORBIT_LIMITS = { pitch: [0.15, 1.45], radius: [4, 60] };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export class CameraRig {
  constructor(scene, maze) {
    this.scene = scene;
    this.maze = maze;
    this.mode = 'chase';
    this.orbit = { yaw: 0.7, pitch: 0.85, radius: 18 };
    this._drag = null;
    this._bindOrbitInput();
  }

  get label() {
    return LABELS[this.mode];
  }

  // Orbit is an inspection camera: walking while detached is disorienting.
  get blocksMovement() {
    return this.mode === 'orbit';
  }

  setMode(mode) {
    if (!VIEW_MODES.includes(mode)) return false;
    this.mode = mode;
    this._drag = null;
    return true;
  }

  cycle() {
    const i = VIEW_MODES.indexOf(this.mode);
    this.mode = VIEW_MODES[(i + 1) % VIEW_MODES.length];
    this._drag = null;
    return this.mode;
  }

  isPresenting() {
    return !!this.scene.renderer?.xr?.isPresenting;
  }

  update(playerPos, playerRot) {
    const { rig, camera } = this.scene;

    // Headset owns the camera in XR; the rig still carries locomotion.
    if (this.isPresenting()) {
      rig.position.set(playerPos.x, 0, playerPos.z);
      return;
    }

    switch (this.mode) {
      case 'firstperson':
        rig.position.set(playerPos.x, 0, playerPos.z);
        camera.position.set(0, EYE_HEIGHT, 0);
        // Camera looks along its local -Z; player forward is (sin r, cos r).
        camera.rotation.x = 0;
        camera.rotation.y = playerRot - Math.PI;
        camera.rotation.z = 0;
        break;

      case 'topdown':
        this._applyTopDown();
        break;

      case 'orbit':
        this._applyOrbit();
        break;

      case 'chase':
      default: {
        // Sit BACK along the player's own backward vector, so the camera stays
        // behind them at any heading instead of drifting to world +Z.
        const bx = -Math.sin(playerRot);
        const bz = -Math.cos(playerRot);
        rig.position.set(playerPos.x + bx * CHASE_BACK, 0, playerPos.z + bz * CHASE_BACK);
        // The camera looks along its local -Z, so the rig must be yawed by
        // playerRot + PI for that to line up with the player's forward.
        // (playerRot alone points the camera 180 degrees away — the cause of
        // the "controls are inverted" report.)
        rig.rotation.y = playerRot + Math.PI;
        camera.position.set(0, EYE_HEIGHT, 0);
        camera.rotation.x = 0;
        camera.rotation.y = 0;
        camera.rotation.z = 0;
        break;
      }
    }
  }

  // Frames the whole maze from above, centred, so navigation is unambiguous.
  _applyTopDown() {
    const { rig, camera } = this.scene;
    const { width, height, cx, cz } = this.maze.getExtents();
    const fovY = ((camera.fov ?? 75) * Math.PI) / 180;
    const aspect = camera.aspect || 16 / 9;
    const margin = 2;
    const halfTan = Math.tan(fovY / 2);
    const dist = Math.max(
      (width + margin) / (2 * halfTan * aspect),
      (height + margin) / (2 * halfTan)
    );
    rig.position.set(cx, 0, cz);
    camera.position.set(0, dist, 0);
    camera.rotation.x = -Math.PI / 2; // straight down
    camera.rotation.y = 0;
    camera.rotation.z = 0;
  }

  _applyOrbit() {
    const { rig, camera } = this.scene;
    const { cx, cz } = this.maze.getExtents();
    // Clamp here as well as in the wheel handler so the limits hold however
    // the radius was set.
    const { yaw } = this.orbit;
    const pitch = clamp(this.orbit.pitch, ORBIT_LIMITS.pitch[0], ORBIT_LIMITS.pitch[1]);
    const radius = clamp(this.orbit.radius, ORBIT_LIMITS.radius[0], ORBIT_LIMITS.radius[1]);
    rig.position.set(cx, 0, cz);
    camera.position.set(
      radius * Math.cos(pitch) * Math.sin(yaw),
      radius * Math.sin(pitch),
      radius * Math.cos(pitch) * Math.cos(yaw)
    );
    camera.lookAt(cx, 0, cz);
  }

  _bindOrbitInput() {
    if (typeof window === 'undefined') return;
    const dom = this.scene.renderer?.domElement || window;
    dom.addEventListener?.('pointerdown', e => {
      if (this.mode !== 'orbit') return;
      this._drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', e => {
      if (!this._drag || this.mode !== 'orbit') return;
      this.orbit.yaw -= (e.clientX - this._drag.x) * 0.005;
      this.orbit.pitch = clamp(
        this.orbit.pitch + (e.clientY - this._drag.y) * 0.005,
        ORBIT_LIMITS.pitch[0],
        ORBIT_LIMITS.pitch[1]
      );
      this._drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { this._drag = null; });
    dom.addEventListener?.('wheel', e => {
      if (this.mode !== 'orbit') return;
      e.preventDefault();
      this.orbit.radius = clamp(
        this.orbit.radius * (1 + e.deltaY * 0.001),
        ORBIT_LIMITS.radius[0],
        ORBIT_LIMITS.radius[1]
      );
    }, { passive: false });
  }
}
