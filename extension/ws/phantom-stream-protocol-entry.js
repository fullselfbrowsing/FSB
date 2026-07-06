import {
  CONTROL,
  DIFF_OP,
  NID_ATTR,
  REMOTE_CONTROL,
  REMOTE_CONTROL_STATE,
  STREAM,
  classifyManifest,
  createRemoteControlStateEvent,
  createStreamSessionId,
  decodeEnvelope,
  encodeEnvelope,
  isCompressedEnvelope,
  isCurrentStream,
  isRemoteControlType,
  summarizeRemoteControlAction,
  validateRemoteControlMessage,
} from '@full-self-browsing/phantom-stream/protocol';

globalThis.FSBPhantomStreamProtocol = Object.freeze({
  CONTROL,
  DIFF_OP,
  NID_ATTR,
  REMOTE_CONTROL,
  REMOTE_CONTROL_STATE,
  STREAM,
  // Phase 33 (MEDIA): pure adaptive-manifest classifier (HLS/DASH) used by the
  // deferred chrome.webRequest MEDIA_HINT discovery path. STREAM.MEDIA /
  // STREAM.MEDIA_HINT ride the STREAM object above (additive, no new wire shape).
  classifyManifest,
  createRemoteControlStateEvent,
  createStreamSessionId,
  decodeEnvelope,
  encodeEnvelope,
  isCompressedEnvelope,
  isCurrentStream,
  isRemoteControlType,
  summarizeRemoteControlAction,
  validateRemoteControlMessage,
});
