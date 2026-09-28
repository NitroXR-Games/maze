// Single entry point to the live NitroXR runtime. Every game module imports
// the SDK through here so the endpoint and game id stay configured in one place.
import { NitroXR, GhostRecorder, GhostPlayer } from '@nitroxr/runtime';

NitroXR.Cloud.setEndpoint('https://cloud.nitroxr.com');

export { NitroXR, GhostRecorder, GhostPlayer };

export const GAME_ID = 'maze';

// The live SDK has no User object (that was a mock-era helper), so the game
// owns a stable local player id persisted across sessions.
export function getPlayerId() {
  try {
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem('nitro_player_id');
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `player_${Date.now().toString(36)}`;
        localStorage.setItem('nitro_player_id', id);
      }
      return id;
    }
  } catch {
    // Headless / private mode: fall through to an ephemeral id.
  }
  return 'headless_player';
}
