// Bundled playback kit for ui/recording-player.html.
//
// Extension pages load classic scripts only, so esbuild bundles the PhantomStream
// player and recording helpers into an IIFE (dist/ui/recording-player-kit.js) that
// exposes one frozen global. Playback runs through the PhantomStream viewer: a
// sandboxed, script-free mirror that never sends anything back to a site.

import { createPlayer, PLAYER_MIN_SPEED, PLAYER_MAX_SPEED } from '@full-self-browsing/phantom-stream/player';
import {
  createRecording,
  validateRecording,
  RECORDING_FORMAT,
  HOST_MARK_TYPE,
} from '@full-self-browsing/phantom-stream/recorder';
import { STREAM } from '@full-self-browsing/phantom-stream/protocol';

globalThis.FsbRecordingPlayerKit = Object.freeze({
  createPlayer,
  createRecording,
  validateRecording,
  RECORDING_FORMAT,
  HOST_MARK_TYPE,
  PLAYER_MIN_SPEED,
  PLAYER_MAX_SPEED,
  STREAM: Object.freeze({ ...STREAM }),
});
