'use strict';

/**
 * Phase 11 Wave 0 smoke -- placeholder scaffold.
 *
 * Parts 1 + 2 filled by Plan 11-01 (FINT-19 owner-chip friendly label).
 * Parts 3 + 4 filled by Plan 11-02 (FINT-20 foreign-owned input lockout).
 * Parts 5 + 6 filled by Plan 11-03 (FINT-21 per-tab chat history).
 * Part 7 filled by Plan 11-04 (INV-04 + INV-06 byte-freeze regression).
 *
 * Wave 0 baseline emits one PASS per Part (7 PASS / 0 FAIL) so the
 * existing `npm test` &&-chain stays green.
 *
 * Real-runtime test discipline per CLAUDE.md MEMORY (no static-text grep
 * for presence; load + invoke the modules). The extension host globals
 * (tabs + storage.session + runtime) are mocked at module-top BEFORE
 * requiring extension/ui modules.
 *
 * Run: node tests/sidepanel-tab-aware-smoke.test.js
 *
 * ASCII only. No emojis.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { validatePublicLatticePin } = require('./helpers/lattice-public-pin.js');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// --- Chrome API mocks (installed BEFORE any extension/ui module is required) ---
let _sessionStore = {};
let _localStore = {};
let _onActivatedListeners = [];
let _onRemovedListeners = [];
let _onDiscardedListeners = [];
let _onChangedListeners = [];
let _activeTab = { id: 1, active: true, currentWindow: true };

globalThis.chrome = {
  runtime: {
    id: 'fsb-phase-11-test',
    lastError: null,
    sendMessage: function (msg, cb) { if (typeof cb === 'function') cb({}); },
    onMessage: { addListener: function () {} }
  },
  tabs: {
    onActivated: { addListener: function (fn) { _onActivatedListeners.push(fn); } },
    onRemoved: { addListener: function (fn) { _onRemovedListeners.push(fn); } },
    onDiscarded: { addListener: function (fn) { _onDiscardedListeners.push(fn); } },
    query: function (filter, cb) {
      const result = [_activeTab];
      if (typeof cb === 'function') { cb(result); return; }
      return Promise.resolve(result);
    }
  },
  storage: {
    session: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string') {
          if (_sessionStore[keys] !== undefined) bag[keys] = _sessionStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) if (_sessionStore[k] !== undefined) bag[k] = _sessionStore[k];
        } else if (keys === null) {
          Object.assign(bag, _sessionStore);
        } else if (typeof keys === 'object' && keys) {
          for (const k of Object.keys(keys)) bag[k] = _sessionStore[k] !== undefined ? _sessionStore[k] : keys[k];
        }
        if (typeof cb === 'function') { cb(bag); return; }
        return Promise.resolve(bag);
      },
      set: function (payload, cb) {
        Object.assign(_sessionStore, payload);
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      },
      remove: function (key, cb) {
        if (Array.isArray(key)) { for (const k of key) delete _sessionStore[k]; }
        else delete _sessionStore[key];
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      }
    },
    local: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string' && _localStore[keys] !== undefined) bag[keys] = _localStore[keys];
        if (typeof cb === 'function') { cb(bag); return; }
        return Promise.resolve(bag);
      },
      set: function (payload, cb) {
        Object.assign(_localStore, payload);
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      }
    },
    onChanged: { addListener: function (fn) { _onChangedListeners.push(fn); } }
  }
};

// --- Module loads (sidecar + owner-chip; Plan 11-01+ will require additional modules) ---
const TabConvStore = require('../extension/ui/sidepanel-tab-conv-store.js');
require('../extension/ui/owner-chip.js'); // registers globalThis.FSBOwnerChip

// --- DOM stub helpers (forward-compat for Plan 11-02 lockout assertions) ---
function createButtonStub() {
  const attrs = {};
  const classes = new Set();
  return {
    tagName: 'BUTTON',
    disabled: false,
    setAttribute: function (k, v) { attrs[k] = v; },
    removeAttribute: function (k) { delete attrs[k]; },
    getAttribute: function (k) { return attrs[k]; },
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); }
    },
    _attrs: function () { return attrs; },
    _classes: function () { return Array.from(classes); }
  };
}
function createDivStub() {
  const stub = createButtonStub();
  stub.tagName = 'DIV';
  delete stub.disabled;
  return stub;
}
function installDomStub(idMap) {
  globalThis.document = {
    getElementById: function (id) { return idMap[id] || null; }
  };
}

(async function main() {
  console.log('\n--- Phase 11 Wave 0 smoke (placeholder scaffold) ---');

  console.log('\n--- Part 1: lookupClientLabel happy + null paths (FILLED in Plan 11-01) ---');

  // Part 1.1-1.8: lookupClientLabel unit tests (Plan 11-01 FINT-19)
  const ownerChipMod = require('../extension/ui/owner-chip.js');
  const lcl1 = ownerChipMod.lookupClientLabel;

  // 1.1 happy path
  {
    const fakeRead = async (k) => {
      const bag = {};
      bag[k] = { tabId: 42, agentId: 'a', client: 'OpenClaw', isFinal: false };
      return bag;
    };
    const result = await lcl1(42, fakeRead);
    ok(result === 'OpenClaw', 'Part 1.1 -- happy path returns entry.client');
  }

  // 1.2 trim semantics
  {
    const fakeRead = async (k) => ({ [k]: { client: '  FSB Autopilot  ' } });
    const result = await lcl1(42, fakeRead);
    ok(result === 'FSB Autopilot', 'Part 1.2 -- trim semantics on entry.client');
  }

  // 1.3 missing entry
  {
    const result = await lcl1(42, async () => ({}));
    ok(result === null, 'Part 1.3 -- missing entry returns null');
  }

  // 1.4 malformed entry (non-object)
  {
    const fakeRead = async (k) => ({ [k]: 42 });
    const result = await lcl1(42, fakeRead);
    ok(result === null, 'Part 1.4 -- malformed entry (non-object) returns null');
  }

  // 1.5 missing client field
  {
    const fakeRead = async (k) => ({ [k]: { agentId: 'x', tabId: 42 } });
    const result = await lcl1(42, fakeRead);
    ok(result === null, 'Part 1.5 -- missing client field returns null');
  }

  // 1.6 invalid tabId (negative)
  {
    let readCalled = false;
    const fakeRead = async () => { readCalled = true; return {}; };
    const result = await lcl1(-1, fakeRead);
    ok(result === null && readCalled === false,
       'Part 1.6 -- negative tabId returns null without storage read');
  }

  // 1.7 non-function storageReadFn
  {
    const result = await lcl1(42, null);
    ok(result === null, 'Part 1.7 -- null storageReadFn returns null');
  }

  // 1.8 thrown storage read
  {
    const result = await lcl1(42, async () => { throw new Error('boom'); });
    ok(result === null, 'Part 1.8 -- thrown storage read returns null (best-effort)');
  }

  console.log('\n--- Part 2: refreshOwnerChip three-tier resolution + sidepanel/popup wiring (FILLED in Plan 11-01) ---');

  // Part 2.1-2.7: source-level three-tier wiring + export contracts
  const sidepanelSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
  const popupSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/popup.js'), 'utf8');

  // 2.1 sidepanel.js wires lookupClientLabel
  const sidepanelLookupCount = (sidepanelSrc.match(/FSBOwnerChip\.lookupClientLabel/g) || []).length;
  ok(sidepanelLookupCount === 1,
     'Part 2.1 -- sidepanel.js references FSBOwnerChip.lookupClientLabel exactly once');

  // 2.2 sidepanel.js carries Phase 11 FINT-19 marker
  ok(/Phase 11 FINT-19/.test(sidepanelSrc),
     'Part 2.2 -- sidepanel.js carries Phase 11 FINT-19 marker');

  // 2.3 popup.js wires lookupClientLabel
  const popupLookupCount = (popupSrc.match(/FSBOwnerChip\.lookupClientLabel/g) || []).length;
  ok(popupLookupCount === 1,
     'Part 2.3 -- popup.js references FSBOwnerChip.lookupClientLabel exactly once');

  // 2.4 popup.js carries Phase 11 FINT-19 marker
  ok(/Phase 11 FINT-19/.test(popupSrc),
     'Part 2.4 -- popup.js carries Phase 11 FINT-19 marker');

  // 2.5 Tier 1 short-circuit comes BEFORE Tier 2 (sidepanel.js)
  const sidepanelTier1Idx = sidepanelSrc.search(/ownerAgentId\.indexOf\(['"]legacy:['"]\)\s*===\s*0/);
  const sidepanelTier2Idx = sidepanelSrc.indexOf('FSBOwnerChip.lookupClientLabel');
  ok(sidepanelTier1Idx > 0 && sidepanelTier2Idx > sidepanelTier1Idx,
     'Part 2.5 -- sidepanel.js Tier 1 conditional appears before Tier 2 call');

  // 2.6 module.exports.lookupClientLabel is a function
  ok(typeof ownerChipMod.lookupClientLabel === 'function',
     'Part 2.6 -- module.exports.lookupClientLabel is a function');

  // 2.7 globalThis.FSBOwnerChip.lookupClientLabel is also a function (dual-export)
  ok(typeof globalThis.FSBOwnerChip === 'object'
     && typeof globalThis.FSBOwnerChip.lookupClientLabel === 'function',
     'Part 2.7 -- globalThis.FSBOwnerChip.lookupClientLabel function (dual-export)');

  console.log('\n--- Part 3: applyInputLockout DOM mutation on 4 controls (FILLED in Plan 11-02) ---');

  // Part 3.1-3.4: applyInputLockout DOM mutation via in-sandbox eval.
  // applyInputLockout is a function defined inside sidepanel.js classic-
  // script body (NOT exported). The smoke cannot require sidepanel.js as
  // a module (it depends on chrome APIs being installed AND on DOM globals
  // being set up beforehand). Instead, extract the function body via regex,
  // eval it inside this Node scope with a DOM stub + no-op
  // updateSendButtonState stub, and exercise it directly.
  const sidepanelSrcForP3 = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
  const applyMatch = sidepanelSrcForP3.match(/function applyInputLockout\(foreignOwned\)\s*\{[\s\S]*?^\}/m);
  ok(applyMatch !== null, 'Part 3.0 -- applyInputLockout function body extractable');

  if (applyMatch) {
    // Build DOM stub + sandbox + eval the function body
    const chatInputStub = createDivStub();
    const sendBtnStub = createButtonStub();
    const stopBtnStub = createButtonStub();
    const micBtnStub = createButtonStub();
    installDomStub({
      chatInput: chatInputStub,
      sendBtn: sendBtnStub,
      stopBtn: stopBtnStub,
      micBtn: micBtnStub
    });
    globalThis.updateSendButtonState = function () {}; // no-op stub

    // Eval the function definition into the global scope. Use indirect
    // eval ((0, eval)(...)) so the function declaration creates a global
    // binding even though this file runs in strict mode (the eval'd code
    // executes in non-strict global scope).
    (0, eval)(applyMatch[0]);
    const applyInputLockoutFn = globalThis.applyInputLockout;

    // 3.1 lockout state: BUTTON elements have disabled=true
    applyInputLockoutFn(true);
    ok(sendBtnStub.disabled === true && stopBtnStub.disabled === true && micBtnStub.disabled === true,
       'Part 3.1 -- applyInputLockout(true) sets disabled on 3 BUTTON controls');

    // 3.2 lockout state: chatInput DIV has contenteditable='false'
    ok(chatInputStub._attrs()['contenteditable'] === 'false',
       'Part 3.2 -- applyInputLockout(true) sets contenteditable=false on chatInput DIV');

    // 3.3 lockout state: all 4 controls get aria-disabled + aria-describedby + class
    const allFour = [chatInputStub, sendBtnStub, stopBtnStub, micBtnStub];
    const allHaveAria = allFour.every(el => el._attrs()['aria-disabled'] === 'true');
    const allHaveDesc = allFour.every(el => el._attrs()['aria-describedby'] === 'fsb-lockout-aria-description');
    const allHaveClass = allFour.every(el => el._classes().indexOf('fsb-foreign-owned-disabled') !== -1);
    ok(allHaveAria && allHaveDesc && allHaveClass,
       'Part 3.3 -- applyInputLockout(true) sets aria-disabled + aria-describedby + .fsb-foreign-owned-disabled on all 4 controls');

    // 3.4 unlock state: aria-disabled + aria-describedby + class cleared.
    // Seed the owner tooltip the way refreshOwnerChip's lock path does after
    // applyInputLockout(true) -- title is a reflected attribute, so the
    // attribute-level stub mirrors `chatInput.title = ...` on a real DOM.
    chatInputStub.setAttribute('title', 'Disabled while tab is owned by X');
    applyInputLockoutFn(false);
    const noneHaveAria = allFour.every(el => el._attrs()['aria-disabled'] === undefined);
    const noneHaveDesc = allFour.every(el => el._attrs()['aria-describedby'] === undefined);
    const noneHaveClass = allFour.every(el => el._classes().indexOf('fsb-foreign-owned-disabled') === -1);
    const chatRestored = chatInputStub._attrs()['contenteditable'] === 'true';
    ok(noneHaveAria && noneHaveDesc && noneHaveClass && chatRestored,
       'Part 3.4 -- applyInputLockout(false) clears aria-* + class + restores chatInput contenteditable');

    // 3.5 (debug-phase-11-tab-swap-stale regression pin) -- unlock state must
    // restore disabled=false on stopBtn + micBtn. sendBtn is governed by
    // isRunning via updateSendButtonState (the no-op stub at line ~273
    // leaves sendBtn.disabled untouched on this test path, which is fine --
    // sendBtn's disabled-on-isRunning contract is asserted indirectly by
    // the lockout NOT clobbering it). Pre-fix the unlock branch only
    // removed aria-disabled, leaving el.disabled=true forever for stopBtn
    // and micBtn -- the visible UAT-11 "input controls stay disabled after
    // tab swap" symptom.
    ok(stopBtnStub.disabled === false && micBtnStub.disabled === false,
       'Part 3.5 -- applyInputLockout(false) restores disabled=false on stopBtn + micBtn (regression pin for debug-phase-11-tab-swap-stale)');

    // 3.6 (issue #13 regression pin) -- unlock must clear the "Disabled
    // while tab is owned by ..." tooltip. The v0.9.90 reconciliation merge
    // replaced main's inline chatInput.removeAttribute('title') unlock code
    // with applyInputLockout(false), which left the stale tooltip behind.
    ok(chatInputStub._attrs()['title'] === undefined,
       'Part 3.6 -- applyInputLockout(false) clears the owner tooltip on chatInput (regression pin for issue #13)');
  } else {
    ok(false, 'Part 3.0 -- could not extract applyInputLockout function body; skipping 3.1-3.6');
  }

  console.log('\n--- Part 4: handleSendMessage runtime gate + .fsb-foreign-owned-disabled CSS class (FILLED in Plan 11-02) ---');

  // Part 4.1-4.5: source-level wiring verification
  const sidepanelSrcForP4 = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
  const sidepanelCssSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.css'), 'utf8');
  const sidepanelHtmlSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.html'), 'utf8');

  // 4.1 sidepanel.js carries applyInputLockout(true) inside refreshOwnerChip
  const refreshChipBodyMatch = sidepanelSrcForP4.match(/async function refreshOwnerChip\(\)\s*\{[\s\S]*?^\}/m);
  ok(refreshChipBodyMatch && refreshChipBodyMatch[0].indexOf('applyInputLockout(true)') !== -1,
     'Part 4.1 -- refreshOwnerChip body contains applyInputLockout(true)');

  // 4.2 sidepanel.js carries applyInputLockout(false) inside refreshOwnerChip
  ok(refreshChipBodyMatch && refreshChipBodyMatch[0].indexOf('applyInputLockout(false)') !== -1,
     'Part 4.2 -- refreshOwnerChip body contains applyInputLockout(false)');

  // 4.3 sidepanel.js carries the runtime gate inside handleSendMessage
  const handleSendBodyMatch = sidepanelSrcForP4.match(/async function handleSendMessage\(\)\s*\{[\s\S]*?^\}/m);
  ok(handleSendBodyMatch && /if \(await _isActiveTabForeignOwned\(\)\) return;/.test(handleSendBodyMatch[0]),
     'Part 4.3 -- handleSendMessage body contains _isActiveTabForeignOwned runtime gate');

  // 4.4 sidepanel.css carries .fsb-foreign-owned-disabled rule
  ok(/\.fsb-foreign-owned-disabled\s*\{[^}]*opacity:\s*0\.45[^}]*pointer-events:\s*none/s.test(sidepanelCssSrc),
     'Part 4.4 -- sidepanel.css carries .fsb-foreign-owned-disabled rule with opacity 0.45 + pointer-events none');

  // 4.5 sidepanel.html carries the aria-describedby description span
  ok(/<span\s+id=\"fsb-lockout-aria-description\"\s+class=\"sr-only\">/.test(sidepanelHtmlSrc),
     'Part 4.5 -- sidepanel.html carries fsb-lockout-aria-description sr-only span');

  console.log('\n--- Part 5: envelope CRUD + LRU eviction (FILLED in Plan 11-03) ---');

  // Part 5.1-5.6: envelope CRUD + LRU eviction unit tests
  // 5.1 emptyEnvelope shape
  {
    const env = TabConvStore.emptyEnvelope();
    ok(env.v === 1 && typeof env.byTab === 'object' && Array.isArray(env.lru)
       && env.lru.length === 0 && Object.keys(env.byTab).length === 0,
       'Part 5.1 -- emptyEnvelope() returns {v:1, byTab:{}, lru:[]}');
  }

  // 5.2 ensureTabConversation mints + populates
  {
    const env = TabConvStore.emptyEnvelope();
    const convId = TabConvStore.ensureTabConversation(env, 42);
    ok(typeof convId === 'string' && convId.indexOf('conv_') === 0
       && env.byTab['42'] && env.byTab['42'].conversationId === convId
       && env.lru[0] === '42',
       'Part 5.2 -- ensureTabConversation mints + populates byTab + lru head');
  }

  // 5.3 ensureTabConversation idempotent (same id on repeat)
  {
    const env = TabConvStore.emptyEnvelope();
    const c1 = TabConvStore.ensureTabConversation(env, 42);
    const c2 = TabConvStore.ensureTabConversation(env, 42);
    ok(c1 === c2 && Object.keys(env.byTab).length === 1,
       'Part 5.3 -- ensureTabConversation second call returns SAME id (touch only)');
  }

  // 5.4 getTabConversation peek-only
  {
    const env = TabConvStore.emptyEnvelope();
    const convId = TabConvStore.ensureTabConversation(env, 42);
    TabConvStore.ensureTabConversation(env, 99); // make 99 the MRU
    const peeked = TabConvStore.getTabConversation(env, 42);
    ok(peeked === convId && env.lru[0] === '99',
       'Part 5.4 -- getTabConversation peek does not touch LRU (99 stays MRU)');
  }

  // 5.5 LRU eviction at cap=50: write 51 entries, 50 retained, oldest evicted
  {
    const env = TabConvStore.emptyEnvelope();
    const ids = [];
    for (let i = 0; i < 51; i++) {
      ids.push(TabConvStore.ensureTabConversation(env, i + 1)); // tabIds 1..51
    }
    const byTabSize = Object.keys(env.byTab).length;
    const lruSize = env.lru.length;
    const firstWrittenGone = env.byTab['1'] === undefined;
    const lastWrittenPresent = env.byTab['51'] !== undefined;
    ok(byTabSize === 50 && lruSize === 50 && firstWrittenGone && lastWrittenPresent,
       'Part 5.5 -- LRU eviction: 51 writes produce 50 retained; first-written (tab 1) gone; 51st present');
  }

  // 5.6 dropTabConversation idempotent
  {
    const env = TabConvStore.emptyEnvelope();
    TabConvStore.ensureTabConversation(env, 42);
    TabConvStore.dropTabConversation(env, 42);
    const goneOnce = env.byTab['42'] === undefined && env.lru.indexOf('42') === -1;
    TabConvStore.dropTabConversation(env, 42); // second call must be no-op
    const goneTwice = env.byTab['42'] === undefined && env.lru.indexOf('42') === -1;
    ok(goneOnce && goneTwice,
       'Part 5.6 -- dropTabConversation idempotent (no throw on missing entry)');
  }

  console.log('\n--- Part 6: migrateLegacyConversationKey + sidepanel boot wiring (FILLED in Plan 11-03) ---');

  // Part 6.1-6.4: migration + source-level wiring verification
  // 6.1 migrateLegacyConversationKey happy path
  {
    // Reset session store for clean test surface
    _sessionStore = {};
    _sessionStore['fsbSidepanelConversationId'] = 'conv_legacy_abcd';
    const readFn = async (keys) => {
      const bag = {};
      if (Array.isArray(keys)) {
        for (const k of keys) if (_sessionStore[k] !== undefined) bag[k] = _sessionStore[k];
      } else if (typeof keys === 'string') {
        if (_sessionStore[keys] !== undefined) bag[keys] = _sessionStore[keys];
      }
      return bag;
    };
    const writeFn = async (payload) => { Object.assign(_sessionStore, payload); };
    const removeFn = async (key) => { delete _sessionStore[key]; };
    const env = await TabConvStore.migrateLegacyConversationKey(readFn, writeFn, removeFn, 42);
    const entry = env.byTab['42'];
    ok(entry && entry.conversationId === 'conv_legacy_abcd'
       && _sessionStore['fsbSidepanelConversationId'] === undefined
       && _sessionStore['fsbSidepanelTabConversations'] !== undefined,
       'Part 6.1 -- migrateLegacyConversationKey binds legacy convId to active tab + deletes legacy key');
  }

  // 6.2 migrateLegacyConversationKey idempotent on second boot
  {
    // _sessionStore still carries the migrated envelope from 6.1; legacy key absent
    const readFn = async (keys) => {
      const bag = {};
      if (Array.isArray(keys)) for (const k of keys) if (_sessionStore[k] !== undefined) bag[k] = _sessionStore[k];
      return bag;
    };
    const writeFn = async (payload) => { Object.assign(_sessionStore, payload); };
    const removeFn = async (key) => { delete _sessionStore[key]; };
    const beforeKeys = JSON.stringify(_sessionStore['fsbSidepanelTabConversations']);
    const env = await TabConvStore.migrateLegacyConversationKey(readFn, writeFn, removeFn, 42);
    const afterKeys = JSON.stringify(_sessionStore['fsbSidepanelTabConversations']);
    ok(env.byTab['42'] && env.byTab['42'].conversationId === 'conv_legacy_abcd'
       && beforeKeys === afterKeys,
       'Part 6.2 -- migrateLegacyConversationKey idempotent (legacy absent + envelope preserved)');
  }

  // 6.3 sidepanel.js source-level wiring grep
  {
    const sidepanelSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
    const hasInit = /async function initTabConversationStore\(\)/.test(sidepanelSrc);
    const hasSwap = /async function swapToTabConversation\(tabId\)/.test(sidepanelSrc);
    const hasDrop = /async function dropTabConversation\(tabId\)/.test(sidepanelSrc);
    const hasEnsure = /async function ensureTabConversationForActiveTab\(overwrite\)/.test(sidepanelSrc);
    const hasOnRemoved = /chrome\.tabs\.onRemoved\.addListener/.test(sidepanelSrc);
    const initCalled = /await initTabConversationStore\(\)/.test(sidepanelSrc);
    ok(hasInit && hasSwap && hasDrop && hasEnsure && hasOnRemoved && initCalled,
       'Part 6.3 -- sidepanel.js wires all 4 helpers + onRemoved listener + DOMContentLoaded init call');
  }

  // 6.4 sidepanel.js does NOT register onDiscarded listener (D-15 compliance)
  {
    const sidepanelSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
    const onDiscardedAbsent = !/chrome\.tabs\.onDiscarded\.addListener/.test(sidepanelSrc);
    ok(onDiscardedAbsent,
       'Part 6.4 -- sidepanel.js does NOT register chrome.tabs.onDiscarded (D-15 preserve)');
  }

  // 6.5 (debug-phase-11-tab-swap-stale defense-in-depth pin) -- sidepanel.js
  // registers chrome.windows.onFocusChanged as a backstop for the primary
  // chrome.tabs.onActivated listener. When focus shifts to a real Chrome
  // window the backstop re-resolves the chip + chat surface against the
  // user's active tab. Source-level grep is sufficient: a regression that
  // removed this backstop would re-introduce the brand-new-tab edge case
  // where chip + lockout state stay frozen on the previous tab.
  {
    const sidepanelSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');
    const hasFocusChanged = /chrome\.windows\.onFocusChanged\.addListener/.test(sidepanelSrc);
    ok(hasFocusChanged,
       'Part 6.5 -- sidepanel.js registers chrome.windows.onFocusChanged backstop (debug-phase-11-tab-swap-stale defense-in-depth)');
  }

  console.log('\n--- Part 7: INV-04 + INV-06 byte-freeze regression (FILLED in Plan 11-04) ---');

  // Part 7.1-7.4: INV byte-freeze regression assertions
  const agentLoopPath = path.resolve(__dirname, '../extension/ai/agent-loop.js');
  const agentLoopSrc = fs.readFileSync(agentLoopPath, 'utf8');

  // 7.1 setTimeout total count = 8
  const setTimeoutMatches = agentLoopSrc.match(/setTimeout/g) || [];
  ok(setTimeoutMatches.length === 8,
     'Part 7.1 -- INV-04 setTimeout count = 8 in agent-loop.js (got ' + setTimeoutMatches.length + ')');

  // 7.2 4 iterator patterns intact
  const iteratorMatches = agentLoopSrc.match(/session\._nextIterationTimer\s*=\s*setTimeout/g) || [];
  ok(iteratorMatches.length === 4,
     'Part 7.2 -- INV-04 4 iterator patterns intact (got ' + iteratorMatches.length + ')');

  // 7.3 awk-equivalent scan: NO Phase 11 token inside setTimeout lambda body
  const forbiddenTokens = /lookupClientLabel|applyInputLockout|ensureTabConversation|swapToTabConversation|dropTabConversation|initTabConversationStore|_isActiveTabForeignOwned/;
  const lines = agentLoopSrc.split('\n');
  let phase11InsideLambda = false;
  let foundLambdaWithToken = null;
  for (let i = 0; i < lines.length; i++) {
    if (/setTimeout\s*\(\s*function/.test(lines[i])) {
      // Scan ahead until the closing `}, N)` pattern
      for (let j = i; j < Math.min(i + 50, lines.length); j++) {
        if (forbiddenTokens.test(lines[j])) {
          phase11InsideLambda = true;
          foundLambdaWithToken = 'line ' + (j + 1) + ': ' + lines[j].trim();
          break;
        }
        if (/^\s*\}\s*,\s*\d+\s*\)/.test(lines[j])) break; // end of lambda
      }
    }
    if (phase11InsideLambda) break;
  }
  ok(!phase11InsideLambda,
     'Part 7.3 -- INV-04 awk-scan: NO Phase 11 token inside any setTimeout lambda body'
     + (foundLambdaWithToken ? ' (violation at ' + foundLambdaWithToken + ')' : ''));

  // 7.4 LATTICE-PIN.md public package pin (INV-06)
  const latticePinPath = path.resolve(__dirname, '../.planning/LATTICE-PIN.md');
  const latticePinSrc = fs.readFileSync(latticePinPath, 'utf8');
  const publicPin = validatePublicLatticePin(path.resolve(__dirname, '..'));
  ok(publicPin.ok && /current_lattice_source:\s*npm/.test(latticePinSrc),
     'Part 7.4 -- INV-06 LATTICE-PIN public package pin is coherent'
     + (publicPin.ok ? '' : ' (' + publicPin.errors.join('; ') + ')'));

  // Module references used to keep require side-effect alive across the
  // smoke and demonstrate downstream availability for Plan 11-01+ fills.
  assert.ok(TabConvStore && typeof TabConvStore.emptyEnvelope === 'function',
    'TabConvStore sidecar require side-effect');
  void createButtonStub;
  void createDivStub;
  void installDomStub;

  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
})();
