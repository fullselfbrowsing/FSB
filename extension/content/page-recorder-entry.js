// Bundled page-capture kit for the session recorder.
//
// content/page-recorder.js is injected through chrome.scripting.executeScript({ files })
// as a classic script. esbuild bundles the PhantomStream capture and recorder modules
// into an IIFE (dist/content/page-recorder-capture.js) that exposes only what the
// recorder needs. A second injection into the same document keeps the first kit.

import { createCapture } from '@full-self-browsing/phantom-stream/capture';
import { createRecorder } from '@full-self-browsing/phantom-stream/recorder';
import { STREAM } from '@full-self-browsing/phantom-stream/protocol';

if (!globalThis.FsbPageCaptureKit) {
  globalThis.FsbPageCaptureKit = Object.freeze({
    createCapture,
    createRecorder,
    STREAM: Object.freeze({ ...STREAM }),
  });
}
