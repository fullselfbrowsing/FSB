'use strict';

/**
 * Dashboard stream fit regression.
 *
 * The stream stage is 16:10, but source browser tabs may be 16:10, 16:9,
 * ultrawide, or tall. The dashboard must use one uniform scale and centered
 * offsets so the stream is never stretched and remote coordinates still map
 * back into the captured browser viewport.
 *
 * Run: node tests/dashboard-preview-fit.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const TS = fs.readFileSync(path.join(ROOT, 'showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'showcase/js/dashboard.js'), 'utf8');
const DOM_STREAM = fs.readFileSync(path.join(ROOT, 'extension/content/dom-stream.js'), 'utf8');

function fit(sourceWidth, sourceHeight, stageWidth, stageHeight) {
  const scale = Math.min(stageWidth / sourceWidth, stageHeight / sourceHeight);
  return {
    scale,
    offsetX: Math.max(0, (stageWidth - sourceWidth * scale) / 2),
    offsetY: Math.max(0, (stageHeight - sourceHeight * scale) / 2),
  };
}

function remotePoint(localX, localY, viewportWidth, viewportHeight, metrics) {
  const x = Math.round((localX - metrics.offsetX) / metrics.scale);
  const y = Math.round((localY - metrics.offsetY) / metrics.scale);
  return {
    x: Math.max(0, Math.min(viewportWidth - 1, x)),
    y: Math.max(0, Math.min(viewportHeight - 1, y)),
  };
}

function near(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.001, label + ': expected ' + expected + ', got ' + actual);
}

console.log('--- preview fit scenarios ---');

let metrics = fit(1600, 1000, 1600, 1000);
near(metrics.scale, 1, '16:10 scale');
near(metrics.offsetX, 0, '16:10 offsetX');
near(metrics.offsetY, 0, '16:10 offsetY');

metrics = fit(1920, 1080, 1600, 1000);
near(metrics.scale, 1600 / 1920, '16:9 scale uses width fit');
near(metrics.offsetX, 0, '16:9 offsetX');
near(metrics.offsetY, 50, '16:9 letterbox offsetY');

metrics = fit(2560, 1080, 1600, 1000);
near(metrics.scale, 1600 / 2560, 'ultrawide scale uses width fit');
near(metrics.offsetX, 0, 'ultrawide offsetX');
near(metrics.offsetY, 162.5, 'ultrawide letterbox offsetY');

metrics = fit(900, 1600, 1600, 1000);
near(metrics.scale, 1000 / 1600, 'tall scale uses height fit');
near(metrics.offsetX, 518.75, 'tall pillarbox offsetX');
near(metrics.offsetY, 0, 'tall offsetY');

metrics = fit(1600, 1000, 1920, 1080);
near(metrics.scale, 1080 / 1000, 'fullscreen 16:9 screen uses viewer height fit');
near(metrics.offsetX, 96, 'fullscreen 16:9 screen pillarboxes 16:10 source');
near(metrics.offsetY, 0, 'fullscreen 16:9 screen offsetY');

console.log('--- remote coordinate mapping ---');

metrics = fit(1920, 1080, 1600, 1000);
assert.deepStrictEqual(
  remotePoint(800, 500, 1920, 1080, metrics),
  { x: 960, y: 540 },
  'center of 16:9 render maps to center of source viewport'
);
assert.deepStrictEqual(
  remotePoint(800, 10, 1920, 1080, metrics),
  { x: 960, y: 0 },
  'click in top letterbox clamps to source top edge'
);

metrics = fit(900, 1600, 1600, 1000);
assert.deepStrictEqual(
  remotePoint(800, 500, 900, 1600, metrics),
  { x: 450, y: 800 },
  'center of tall render maps to source center'
);
assert.deepStrictEqual(
  remotePoint(100, 500, 900, 1600, metrics),
  { x: 0, y: 800 },
  'click in left pillarbox clamps to source left edge'
);

console.log('--- source invariants ---');

assert(/previewOffsetX/.test(TS) && /previewOffsetY/.test(TS), 'Angular stores preview offsets');
assert(/previewOffsetX/.test(JS) && /previewOffsetY/.test(JS), 'vanilla dashboard stores preview offsets');
assert(/Math\.min\(stageWidth \/ pageWidth,\s*stageHeight \/ pageHeight\)/.test(TS), 'Angular uses uniform fit scale');
assert(/Math\.min\(stageWidth \/ pageWidth,\s*stageHeight \/ pageHeight\)/.test(JS), 'vanilla dashboard uses uniform fit scale');
assert(/isScreenPreviewLayout\(\)/.test(TS) && /getScreenPreviewStageSize\(\)/.test(TS), 'Angular has screen-layout sizing helpers');
assert(/isScreenPreviewLayout\(\)/.test(JS) && /getScreenPreviewStageSize\(\)/.test(JS), 'vanilla dashboard has screen-layout sizing helpers');
assert(/this\.previewStage\.style\.width = screenStage\.width \+ 'px'/.test(TS), 'Angular pins screen-mode stage width to viewer surface');
assert(/previewStage\.style\.width = screenStage\.width \+ 'px'/.test(JS), 'vanilla pins screen-mode stage width to viewer surface');
assert(/document\.fullscreenElement === this\.previewContainer/.test(TS), 'Angular recalculates on fullscreen entry');
assert(/document\.fullscreenElement === previewContainer/.test(JS), 'vanilla recalculates on fullscreen entry');
assert(/\(localX - this\.previewOffsetX\) \/ scale/.test(TS), 'Angular remote X subtracts letterbox offset');
assert(/\(localX - previewOffsetX\) \/ scale/.test(JS), 'vanilla remote X subtracts letterbox offset');
assert(/this\.previewOffsetX \+ payload\.glow\.x \* this\.previewScale/.test(TS), 'Angular glow X adds letterbox offset');
assert(/previewOffsetX \+ payload\.glow\.x \* previewScale/.test(JS), 'vanilla glow X adds letterbox offset');
assert(/htmlAttrs: serializeShellAttributes\(document\.documentElement\)/.test(DOM_STREAM), 'DOM stream emits html shell attributes');
assert(/bodyAttrs: serializeShellAttributes\(document\.body\)/.test(DOM_STREAM), 'DOM stream emits body shell attributes');
assert(/bodyStyle: collectComputedStyleText\(document\.body, SHELL_PROPS\)/.test(DOM_STREAM), 'DOM stream emits body shell computed style');
assert(/buildShellAttributeString\(payload\.htmlAttrs, payload\.htmlStyle\)/.test(TS), 'Angular consumes shell metadata');
assert(/buildShellAttributeString\(payload\.htmlAttrs, payload\.htmlStyle\)/.test(JS), 'vanilla dashboard consumes shell metadata');

console.log('\nAll dashboard preview fit assertions passed.');
