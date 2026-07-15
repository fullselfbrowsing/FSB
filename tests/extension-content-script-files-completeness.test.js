'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const wsClientSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'ws-client.js'), 'utf8');

function parseStringArray(source, anchor) {
  const match = source.match(new RegExp(anchor + '\\s*=\\s*\\[([\\s\\S]*?)\\]'));
  assert(match, anchor + ' array exists');
  return match[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]/, '').replace(/['"]$/, ''))
    .filter(Boolean);
}

function assertSafeEntry(entry) {
  assert(!entry.startsWith('/'), entry + ' is not absolute');
  assert(!entry.includes('..'), entry + ' does not traverse directories');
  assert(!entry.includes('\\'), entry + ' uses extension-relative slash paths');
  assert(fs.existsSync(path.join(repoRoot, 'extension', entry)), entry + ' exists on disk');
}

console.log('--- content script injection bundle completeness ---');

const contentScriptFiles = parseStringArray(backgroundSource, 'CONTENT_SCRIPT_FILES');
const required = [
  'utils/diagnostics-ring-buffer.js',
  'utils/redactForLog.js',
  'utils/automation-logger.js',
  'content/init.js',
  'content/utils.js',
  'content/dom-state.js',
  'content/selectors.js',
  'content/badge-combine.js',
  'content/visual-feedback.js',
  'content/accessibility.js',
  'utils/google-sheets-ui.js',
  'content/actions.js',
  'content/dom-analysis.js',
  'content/dom-stream.js',
  'content/messaging.js',
  'content/lifecycle.js'
];

for (const entry of contentScriptFiles) assertSafeEntry(entry);
for (const entry of required) {
  assert(contentScriptFiles.includes(entry), 'CONTENT_SCRIPT_FILES includes ' + entry);
}

const duplicateEntries = contentScriptFiles.filter((entry, index) => contentScriptFiles.indexOf(entry) !== index);
assert(duplicateEntries.length === 0, 'CONTENT_SCRIPT_FILES has no duplicate entries (found: ' + duplicateEntries.join(', ') + ')');

const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
assert(/case 'pingDomStream'/.test(domStreamSource), 'dom-stream.js registers pingDomStream');
assert(/domStreamReady/.test(domStreamSource), 'dom-stream.js emits domStreamReady');

assert(/function _getContentScriptFilesForInjection\(\)/.test(wsClientSource), 'ws-client has injection bundle helper');
const helperBody = wsClientSource.match(/function _getContentScriptFilesForInjection\(\)\s*\{[\s\S]*?\n\}/);
assert(helperBody, '_getContentScriptFilesForInjection body found');
for (const entry of required) {
  assert(helperBody[0].includes("'" + entry + "'"), 'fallback injection bundle includes ' + entry);
}
const helperDomStreamCount = (helperBody[0].match(/'content\/dom-stream\.js'/g) || []).length;
assert(helperDomStreamCount === 1, 'fallback injection bundle lists dom-stream.js exactly once');

console.log('All content script injection bundle checks passed.');
