// Bundled PhantomStream capture bridge for classic MV3 content-script injection.
//
// `content/dom-stream.js` is injected through chrome.scripting.executeScript({ files })
// as a classic script. This entry lets esbuild bundle the ESM PhantomStream
// package into an IIFE that exposes the exact symbols the FSB adapter needs.

import { createCapture } from '@full-self-browsing/phantom-stream/capture';
import {
  CONTROL,
  DIFF_OP,
  READY_PROBE_BUDGET_MS,
  READY_PROBE_INTERVAL_MS,
  STREAM,
} from '@full-self-browsing/phantom-stream/protocol';

globalThis.FSBPhantomStreamCapture = Object.freeze({
  createCapture,
  protocol: Object.freeze({
    CONTROL,
    DIFF_OP,
    READY_PROBE_BUDGET_MS,
    READY_PROBE_INTERVAL_MS,
    STREAM,
  }),
});
