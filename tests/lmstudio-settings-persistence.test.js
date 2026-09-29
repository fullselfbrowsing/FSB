'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ui', 'options.js'),
  'utf8'
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, 'source markers exist: ' + startMarker);
  return source.slice(start, end);
}

const loadSettings = between('function loadSettings() {', '// ---------------------------------------------------------------------------\n// Phase 243');
const lmUrlAssignment = loadSettings.indexOf("lmstudioBaseUrl.value = settings.lmstudioBaseUrl || 'http://localhost:1234'");
const discoveryAwait = loadSettings.indexOf('discoveryResult = await setProviderSelection(');
assert(lmUrlAssignment >= 0 && lmUrlAssignment < discoveryAwait, 'saved LM Studio URL is restored before discovery starts');
assert(!/providerSettingsModelLoadTimer\s*=\s*setTimeout/.test(loadSettings), 'model restoration no longer relies on a fixed timer');
assert(/models\.length === 1[\s\S]*chrome\.storage\.local\.set\(\{ modelName: migratedModel \}/.test(loadSettings), 'exactly one discovered model auto-migrates blank or stale storage');
assert(/models\.length > 1[\s\S]*markUnsavedChanges\(\)/.test(loadSettings), 'ambiguous model lists require an explicit save');

const saveSettings = between('function saveSettings() {', 'function discardChanges() {');
const lmGuard = saveSettings.indexOf('validateLmStudioSettingsSelection(normalizedProviderSettings, selectedModelName)');
const storageWrite = saveSettings.indexOf('chrome.storage.local.set(settings');
assert(lmGuard >= 0 && lmGuard < storageWrite, 'blank LM Studio selection is rejected before any settings write');
const validationHelper = between('function validateLmStudioSettingsSelection(', 'function saveSettings() {');
assert(validationHelper.includes("providerSettings.modelProvider !== 'lmstudio'"), 'selection guard is scoped to LM Studio');
assert(validationHelper.includes('FSBModelDiscovery'), 'Settings URL normalization reuses shared LM Studio discovery normalization');
assert(saveSettings.includes("modelName: selectedModelName || persistedProviderSelection.modelName || 'grok-4-1-fast'"), 'hosted fallback prefers the stored model and remains provider-gated by the LM Studio guard');
assert(saveSettings.includes('normalizeLmStudioSettingsBaseUrl(rawLmStudioBaseUrl)'), 'saved LM Studio URL is normalized');

const connectionTest = between('async function checkApiConnection() {', 'function updateConnectionStatus(');
assert(connectionTest.includes("provider === 'lmstudio' && !selectedModelName"), 'connection testing rejects a blank LM Studio model');
assert(connectionTest.includes('model: modelName'), 'connection testing sends the exact selected model');
assert(connectionTest.includes("lmstudioConnectionBaseUrl + '/v1'"), 'connection testing uses the normalized LM Studio URL');

const updateModels = between('function updateModelOptions(provider) {', '// Update model description');
const localBranch = updateModels.slice(updateModels.indexOf("if (provider === 'lmstudio')"));
assert(localBranch.includes("ui.runDiscovery('lmstudio'"), 'legacy LM Studio entry point delegates to shared discovery');
assert(!localBranch.includes('fetch('), 'legacy LM Studio entry point no longer owns an uncancellable fetch race');

console.log('PASS lmstudio-settings-persistence.test.js');
