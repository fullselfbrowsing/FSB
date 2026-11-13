// Skopeo's page-owned primitive shell.
// Classic-script IIFE with a CommonJS test export; no host-page dependency.
(function () {
  'use strict';

  const PRIMITIVES = Object.freeze(['anchor', 'chip', 'halo', 'rail', 'ghost', 'gate']);
  const ATTENTION = Object.freeze({
    AMBIENT: 'ambient',
    ANCHORED: 'anchored',
    FOCUSED: 'focused',
    INTERSTITIAL: 'interstitial'
  });
  const ATTENTION_POLICY = Object.freeze({
    ambient: Object.freeze(['rail']),
    anchored: Object.freeze(['anchor', 'chip', 'rail', 'halo']),
    focused: Object.freeze(['anchor', 'chip', 'ghost']),
    interstitial: Object.freeze(['gate'])
  });
  const RESOURCE_CATEGORIES = Object.freeze([
    'roots',
    'listeners',
    'observers',
    'timeouts',
    'intervals',
    'animationFrames',
    'animations',
    'focusHooks',
    'pointerSurfaces',
    'pendingRenders',
    'popoverTopLayer'
  ]);
  const RESOURCE_CATEGORY_SET = new Set(RESOURCE_CATEGORIES);
  const INTERACTIVE_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="menuitem"]'
  ].join(', ');
  const CORNERS = Object.freeze(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
  const FULL_LENS = Object.freeze({ mode: 'full', width: 240, height: 40 });
  const COMPACT_LENS = Object.freeze({ mode: 'compact', width: 88, height: 40 });
  const VIEWPORT_INSET = 16;
  const HOST_CLEARANCE = 8;
  const LIVE_CADENCE_MS = 500;
  const DOUBLE_ESCAPE_MS = 600;
  const SEMANTIC_MARK_SIZE = 8;
  const ADAPTIVE_MODEL_VERSION = 1;
  const ADAPTIVE_ATOMS = Object.freeze([
    'section-heading',
    'status-row',
    'capability-row',
    'fact-list',
    'item-list',
    'compact-table',
    'timeline',
    'diff',
    'notice'
  ]);
  const ADAPTIVE_ATOM_SET = new Set(ADAPTIVE_ATOMS);
  const ADAPTIVE_ATOM_LIMIT = 12;
  const ADAPTIVE_ITEM_LIMIT = 50;
  const ADAPTIVE_COLUMN_LIMIT = 8;
  const ADAPTIVE_TEXT_LIMIT = 512;
  const CORPUS_MODEL_VERSION = 1;
  const CORPUS_ENROLL_COPY = 'Enroll this folder';
  const CONTRACT_MODEL_VERSION = 'skopeo-contract-view/1';
  const ASK_MODEL_VERSION = 'skopeo-contract-ask/1';
  const CONFIRMATION_MODEL_VERSION = 'skopeo-contract-confirmation/1';
  const CONTRACT_CLOSED_COPY =
    'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.';
  const CONTRACT_ACTION_ERROR =
    'Skopeo couldn’t open the governing source. Reopen this contract view and try again.';
  const CONTRACT_PAGE_SIZE = 8;
  const CONTRACT_WIDTH = 384;
  const CONTRACT_VERTICAL_INSET = 64;
  const CONTRACT_BREAKPOINT = 480;

  function sharedConsequenceBounds() {
    let authority = globalThis.FsbSkopeoActionAuthority;
    if (!authority && typeof require === 'function') {
      try { authority = require('../utils/skopeo-action-authority.js'); } catch (_error) { authority = null; }
    }
    const bounds = authority && authority.CONSEQUENCE_BOUNDS;
    return bounds && Number.isSafeInteger(bounds.aggregateRender) && bounds.aggregateRender > 0 &&
      Number.isSafeInteger(bounds.composedBody) && bounds.composedBody >= bounds.aggregateRender
      ? bounds
      : null;
  }

  const CONSEQUENCE_BOUNDS = sharedConsequenceBounds();

  const PROJECTION_STATUS = Object.freeze({
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported',
    NO_TARGET: 'no-target'
  });
  const PROJECTION_CONTEXT_KINDS = Object.freeze([
    'configured-corpus',
    'vendor-folder',
    'agreement-reading',
    'focused-ask'
  ]);
  const PROJECTION_IDENTITY_KINDS = Object.freeze([
    'drive-folder',
    'drive-file',
    'docs-document',
    'opaque-target'
  ]);
  const PROJECTION_UNCERTAIN_REASONS = Object.freeze([
    'context-evidence-missing',
    'context-evidence-conflict'
  ]);
  const PROJECTION_UNSUPPORTED_REASONS = Object.freeze([
    'context-kind-unsupported',
    'origin-unsupported',
    'route-malformed',
    'router-disposed'
  ]);
  const PROJECTION_WITHDRAW_REASONS = Object.freeze([
    'manual',
    'rebind',
    'context-changed',
    'navigation',
    'semantic-mismatch',
    'disconnected',
    'geometry-unsafe',
    'invalid-candidate',
    'callback-error',
    'disposed'
  ]);

  const COPY = Object.freeze({
    ambient: 'Skopeo · Ambient',
    turnOff: 'Turn off Skopeo',
    anchor: 'Anchor demo',
    entity: 'Example entity · 1 note',
    anomaly: 'Anomaly demo · unusual change',
    focusedTitle: 'Focused Skopeo demo',
    focusedBody: 'This controlled preview demonstrates temporary ghosting. It does not read or change the page.',
    emptyTitle: 'No page context available',
    emptyBody: 'Skopeo will stay in ambient mode and leave the page unchanged.',
    unsafeView: 'Skopeo can’t open this view without covering the current page control.',
    backAmbient: 'Back to ambient Skopeo',
    backAnchored: 'Back to anchored view',
    backFocused: 'Back to focused view',
    demoOnly: 'Demo only',
    gateTitle: 'Consequence preview',
    gateBody: 'Continuing closes this preview. Skopeo will not act on the page.',
    gateReturn: 'Return to focused demo',
    gateContinue: 'Continue demo',
    ambientAnnouncement: 'Skopeo on. Ambient view.',
    focusedAnnouncement: 'Focused view on. Press Escape to restore the page.',
    fixtureAction: 'Open consequence preview',
    universalKill: 'Turn off Skopeo in this tab'
  });
  const PROJECTION_COPY = Object.freeze({
    recognized: Object.freeze({
      'configured-corpus': Object.freeze({
        visible: 'Skopeo · Corpus context',
        announcement: 'Skopeo verified the corpus context.'
      }),
      'vendor-folder': Object.freeze({
        visible: 'Skopeo · Vendor folder',
        announcement: 'Skopeo verified the vendor folder context.'
      }),
      'agreement-reading': Object.freeze({
        visible: 'Skopeo · Agreement view',
        announcement: 'Skopeo verified the agreement reading context.'
      }),
      'focused-ask': Object.freeze({
        visible: 'Skopeo · Focused ask',
        announcement: 'Skopeo verified the focused ask context.'
      })
    }),
    uncertain: Object.freeze({
      visible: 'Skopeo can’t verify this context.',
      announcement: 'Skopeo can’t verify this context. The page was left unchanged.'
    }),
    unsupported: Object.freeze({
      visible: 'Skopeo doesn’t support this context.',
      announcement: 'Skopeo doesn’t support this context. The page was left unchanged.'
    }),
    withdrawn: Object.freeze({
      visible: 'Skopeo can’t verify this target.',
      announcement: 'Skopeo removed the annotation because it could not verify the target.'
    }),
    noTarget: Object.freeze({
      visible: 'No verified target requested',
      announcement: 'Skopeo is staying ambient because no verified target was requested.'
    })
  });

  const SHELL_CSS = [
    ':host {',
    '  all: initial !important;',
    '  display: block !important;',
    '  position: fixed !important;',
    '  inset: 0 !important;',
    '  z-index: 2147483647 !important;',
    '  pointer-events: none !important;',
    '  margin: 0 !important;',
    '  padding: 0 !important;',
    '  border: 0 !important;',
    '  background: transparent !important;',
    '}',
    '* { box-sizing: border-box; }',
    '.skopeo-envelope {',
    '  position: fixed;',
    '  inset: 0;',
    '  pointer-events: none;',
    '  color: #f6efe9;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;',
    '  font-size: 14px;',
    '  font-weight: 400;',
    '  line-height: 20px;',
    '}',
    '.skopeo-surface { position: fixed; inset: 0; pointer-events: none; }',
    '.skopeo-lens {',
    '  position: fixed;',
    '  height: 40px;',
    '  max-width: calc(100vw - 32px);',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  padding: 4px 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #0d0a09;',
    '  color: #f6efe9;',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38);',
    '  pointer-events: none;',
    '  transition: opacity 120ms ease-out, top 120ms ease-out, right 120ms ease-out, bottom 120ms ease-out, left 120ms ease-out;',
    '}',
    '.skopeo-active-glyph {',
    '  width: 8px;',
    '  height: 8px;',
    '  flex: 0 0 8px;',
    '  background: #ff6b35;',
    '  border-radius: 999px;',
    '  pointer-events: none;',
    '}',
    '.skopeo-lens-label {',
    '  min-width: 0;',
    '  flex: 1;',
    '  color: #f6efe9;',
    '  font-size: 14px;',
    '  font-weight: 700;',
    '  line-height: 20px;',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '}',
    '.skopeo-lens-meta {',
    '  color: #a99283;',
    '  font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace;',
    '  font-size: 12px;',
    '  font-weight: 400;',
    '  line-height: 16px;',
    '  white-space: nowrap;',
    '}',
    '.skopeo-control {',
    '  min-width: 32px;',
    '  min-height: 32px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #1a1513;',
    '  color: #d2c1b4;',
    '  font: 400 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  pointer-events: auto;',
    '  cursor: pointer;',
    '}',
    '.skopeo-control:hover { background: #26201d; color: #f6efe9; }',
    '.skopeo-control:focus-visible,',
    '.skopeo-argument-control:focus-visible,',
    '.skopeo-focused-title:focus-visible {',
    '  outline: 2px solid #ff6b35;',
    '  outline-offset: 2px;',
    '}',
    '.skopeo-close { width: 32px; height: 32px; flex: 0 0 32px; }',
    '.skopeo-rail {',
    '  position: fixed;',
    '  width: 4px;',
    '  min-height: 64px;',
    '  top: 64px;',
    '  bottom: 64px;',
    '  border-radius: 999px;',
    '  background: rgba(255, 241, 232, 0.10);',
    '  pointer-events: none;',
    '}',
    '.skopeo-rail-line { position: absolute; inset: 0; border-radius: 999px; background: #d2c1b4; opacity: 0.32; }',
    '.skopeo-rail-ticks {',
    '  position: absolute;',
    '  top: 16px;',
    '  left: -2px;',
    '  width: 8px;',
    '  height: 8px;',
    '  border-radius: 999px;',
    '  background: #ff6b35;',
    '}',
    '.skopeo-fixture-row {',
    '  position: fixed;',
    '  top: 64px;',
    '  left: 16px;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  max-width: calc(100vw - 32px);',
    '  pointer-events: none;',
    '}',
    '.skopeo-anchor {',
    '  width: 32px;',
    '  height: 32px;',
    '  padding: 4px;',
    '  border: 2px solid #ff6b35;',
    '  border-radius: 4px;',
    '  background: #1a1513;',
    '  color: #f6efe9;',
    '  pointer-events: auto;',
    '}',
    '.skopeo-semantic-anchor {',
    '  position: fixed;',
    '  width: 8px;',
    '  height: 8px;',
    '  border: 2px solid #ff6b35;',
    '  background: #ff6b35;',
    '  pointer-events: none;',
    '  transition: opacity 120ms ease-out;',
    '}',
    '.skopeo-chip {',
    '  min-height: 32px;',
    '  max-width: 240px;',
    '  padding: 4px 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 999px;',
    '  background: #1a1513;',
    '  color: #f6efe9;',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '  pointer-events: auto;',
    '}',
    '.skopeo-halo {',
    '  width: 32px;',
    '  height: 32px;',
    '  border: 2px solid #ff6b35;',
    '  border-radius: 12px;',
    '  box-shadow: 0 0 16px rgba(255, 107, 53, 0.38);',
    '  pointer-events: none;',
    '}',
    '.skopeo-anomaly-payload {',
    '  min-height: 32px;',
    '  padding: 4px 8px;',
    '  border: 1px solid rgba(255, 107, 53, 0.38);',
    '  border-radius: 12px;',
    '  background: #1a1513;',
    '  color: #d2c1b4;',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '  pointer-events: none;',
    '}',
    '.skopeo-back-row { position: fixed; top: 16px; left: 16px; display: flex; gap: 8px; pointer-events: none; }',
    '.skopeo-ghost {',
    '  position: fixed;',
    '  inset: 0;',
    '  background: rgba(13, 10, 9, 0.16);',
    '  pointer-events: none;',
    '  transition: opacity 120ms linear;',
    '}',
    '.skopeo-focused-card, .skopeo-gate {',
    '  position: fixed;',
    '  top: 64px;',
    '  left: 50%;',
    '  width: 320px;',
    '  max-width: calc(100vw - 32px);',
    '  max-height: calc(100dvh - 32px);',
    '  padding: 16px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #0d0a09;',
    '  color: #f6efe9;',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38);',
    '  overflow: auto;',
    '  pointer-events: auto;',
    '  transform: translateX(-50%);',
    '  transition: opacity 120ms ease-out;',
    '}',
    '.skopeo-gate { width: 360px; border-color: #ff6b35; }',
    '.skopeo-focused-title, .skopeo-gate-title {',
    '  margin: 0 0 8px;',
    '  color: #f6efe9;',
    '  font-size: 16px;',
    '  font-weight: 700;',
    '  line-height: 24px;',
    '}',
    '.skopeo-focused-body, .skopeo-gate-body { margin: 0 0 16px; color: #d2c1b4; font-size: 14px; line-height: 20px; }',
    '.skopeo-eyebrow {',
    '  margin: 0 0 4px;',
    '  color: #ff6b35;',
    '  font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace;',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  line-height: 16px;',
    '  letter-spacing: 0.08em;',
    '  text-transform: uppercase;',
    '}',
    '.skopeo-lens-open {',
    '  min-width: 0;',
    '  flex: 1;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  padding: 4px;',
    '  border: 0;',
    '  background: transparent;',
    '  text-align: left;',
    '}',
    '.skopeo-adaptive-entity-row {',
    '  position: fixed;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  max-width: calc(100vw - 32px);',
    '  pointer-events: none;',
    '}',
    '.skopeo-adaptive-anchor {',
    '  width: 8px;',
    '  height: 8px;',
    '  flex: 0 0 8px;',
    '  border: 2px solid #ff6b35;',
    '  background: #ff6b35;',
    '  pointer-events: none;',
    '}',
    '.skopeo-adaptive-halo {',
    '  width: 32px;',
    '  height: 32px;',
    '  border: 2px solid #ff6b35;',
    '  border-radius: 12px;',
    '  box-shadow: 0 0 16px rgba(255, 107, 53, 0.38);',
    '  pointer-events: none;',
    '}',
    '.skopeo-focused-tools { display: flex; gap: 8px; margin: 0 0 16px; pointer-events: none; }',
    '.skopeo-capability-group, .skopeo-unavailable, .skopeo-result-region {',
    '  margin: 0 0 16px;',
    '  padding: 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.10);',
    '  border-radius: 12px;',
    '  background: #1a1513;',
    '}',
    '.skopeo-risk-group { margin-top: 16px; border-top-color: rgba(255, 241, 232, 0.18); }',
    '.skopeo-section-heading, .skopeo-group-heading, .skopeo-atom-heading {',
    '  margin: 0 0 8px;',
    '  color: #f6efe9;',
    '  font-size: 14px;',
    '  font-weight: 700;',
    '  line-height: 20px;',
    '}',
    '.skopeo-capability-row, .skopeo-status-row, .skopeo-atom-row {',
    '  width: 100%;',
    '  min-height: 40px;',
    '  display: grid;',
    '  grid-template-columns: minmax(0, 1fr) auto;',
    '  gap: 8px;',
    '  align-items: center;',
    '  margin: 0 0 8px;',
    '  padding: 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.10);',
    '  border-radius: 12px;',
    '  background: #26201d;',
    '  color: #d2c1b4;',
    '}',
    '.skopeo-capability-row { text-align: left; pointer-events: auto; }',
    '.skopeo-ready-primary { background: #ff6b35; color: #0d0a09; border-color: #ff6b35; }',
    '.skopeo-row-label, .skopeo-atom-value { min-width: 0; overflow-wrap: anywhere; }',
    '.skopeo-row-status, .skopeo-atom-meta {',
    '  color: #a99283;',
    '  font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace;',
    '  font-size: 12px;',
    '  font-weight: 400;',
    '  line-height: 16px;',
    '}',
    '.skopeo-row-detail { grid-column: 1 / -1; color: #a99283; font-size: 12px; line-height: 16px; }',
    '.skopeo-argument-form {',
    '  display: grid;',
    '  gap: 12px;',
    '  margin: 0 0 16px;',
    '  padding: 12px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #1a1513;',
    '  pointer-events: auto;',
    '}',
    '.skopeo-argument-field { display: grid; gap: 4px; }',
    '.skopeo-argument-field-checkbox { grid-template-columns: auto minmax(0, 1fr); align-items: center; }',
    '.skopeo-argument-label { color: #f6efe9; font-size: 14px; font-weight: 700; line-height: 20px; }',
    '.skopeo-argument-control {',
    '  min-width: 0;',
    '  min-height: 40px;',
    '  padding: 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 8px;',
    '  background: #26201d;',
    '  color: #f6efe9;',
    '  font: 400 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '}',
    '.skopeo-argument-control[type="checkbox"] { min-height: 20px; width: 20px; padding: 0; }',
    '.skopeo-argument-control[aria-invalid="true"] { border-color: #dc2626; }',
    '.skopeo-argument-error { margin: 0; color: #fca5a5; font-size: 12px; line-height: 16px; }',
    '.skopeo-empty-heading { margin: 0 0 8px; font-size: 16px; font-weight: 700; line-height: 24px; }',
    '.skopeo-empty-body, .skopeo-result-message { margin: 0 0 16px; color: #d2c1b4; }',
    '.skopeo-atom { margin: 0 0 16px; }',
    '.skopeo-fact-list, .skopeo-item-list, .skopeo-timeline { margin: 0; padding: 0; list-style: none; }',
    '.skopeo-fact-list li, .skopeo-item-list li, .skopeo-timeline li { margin: 0 0 8px; }',
    '.skopeo-compact-table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    '.skopeo-compact-table th, .skopeo-compact-table td {',
    '  padding: 8px;',
    '  border-bottom: 1px solid rgba(255, 241, 232, 0.10);',
    '  text-align: left;',
    '  overflow-wrap: anywhere;',
    '}',
    '.skopeo-diff { display: grid; gap: 8px; }',
    '.skopeo-notice { padding: 8px; border-left: 2px solid #d2c1b4; }',
    '.skopeo-notice-error { border-left-color: #dc2626; color: #fca5a5; }',
    '.skopeo-actions { display: flex; gap: 8px; pointer-events: none; }',
    '.skopeo-actions .skopeo-control { min-height: 40px; padding: 4px 8px; }',
    '.skopeo-danger-token { color: #fca5a5; border-color: #dc2626; }',
    '.skopeo-corpus-region {',
    '  position: fixed;',
    '  width: 280px;',
    '  max-width: calc(100vw - 32px);',
    '  max-height: min(50dvh, 360px);',
    '  padding: 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #0d0a09;',
    '  color: #f6efe9;',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38);',
    '  overflow: auto;',
    '  pointer-events: none;',
    '}',
    '.skopeo-corpus-heading { margin: 0 0 8px; font-size: 14px; font-weight: 700; line-height: 20px; }',
    '.skopeo-corpus-source { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }',
    '.skopeo-corpus-source-label, .skopeo-corpus-row-label { min-width: 0; overflow-wrap: anywhere; }',
    '.skopeo-corpus-source-state, .skopeo-corpus-row-state, .skopeo-corpus-aggregate, .skopeo-corpus-closed {',
    '  margin: 0;',
    '  color: #a99283;',
    '  font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace;',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '}',
    '.skopeo-corpus-list { margin: 0; padding: 0; list-style: none; }',
    '.skopeo-corpus-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; }',
    '.skopeo-corpus-aggregate { margin-top: 8px; }',
    '.skopeo-corpus-enroll { width: 100%; min-height: 40px; padding: 4px 8px; }',
    '.skopeo-contract-region {',
    '  position: fixed;',
    '  width: 384px;',
    '  max-width: calc(100vw - 32px);',
    '  max-height: calc(100dvh - 128px);',
    '  padding: 16px;',
    '  border: 1px solid rgba(255, 241, 232, 0.18);',
    '  border-radius: 12px;',
    '  background: #0d0a09;',
    '  color: #f6efe9;',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38);',
    '  overflow-x: hidden;',
    '  overflow-y: auto;',
    '  overscroll-behavior: contain;',
    '  pointer-events: auto;',
    '  opacity: 1;',
    '  transform: translateY(0);',
    '  transition: opacity 120ms ease-out, transform 120ms ease-out;',
    '}',
    '.skopeo-contract-region:focus-visible { outline: 2px solid #ff6b35; outline-offset: 2px; }',
    '.skopeo-contract-header, .skopeo-contract-reading-banner {',
    '  position: sticky;',
    '  top: -16px;',
    '  z-index: 1;',
    '  margin: -16px -16px 16px;',
    '  padding: 16px;',
    '  border-bottom: 1px solid rgba(255, 241, 232, 0.18);',
    '  background: #0d0a09;',
    '}',
    '.skopeo-contract-reading-banner[data-emphasis="true"] { border-left: 2px solid #ff6b35; }',
    '.skopeo-contract-title-row { display: flex; align-items: start; gap: 8px; }',
    '.skopeo-contract-heading { flex: 1; margin: 0; font-size: 16px; font-weight: 700; line-height: 24px; }',
    '.skopeo-contract-hide, .skopeo-contract-pager button, .skopeo-contract-citation {',
    '  min-height: 40px;',
    '  padding: 8px;',
    '}',
    '.skopeo-contract-section { margin: 0 0 16px; }',
    '.skopeo-contract-section-heading { margin: 0 0 8px; font-size: 14px; font-weight: 700; line-height: 20px; }',
    '.skopeo-contract-metadata, .skopeo-contract-state-label, .skopeo-contract-page-state,',
    '.skopeo-contract-fact-meta, .skopeo-contract-action-status, .skopeo-contract-overflow {',
    '  margin: 0;',
    '  color: #a99283;',
    '  font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace;',
    '  font-size: 12px;',
    '  font-weight: 400;',
    '  line-height: 16px;',
    '  overflow-wrap: anywhere;',
    '}',
    '.skopeo-contract-state-label { text-transform: uppercase; letter-spacing: 0.08em; }',
    '.skopeo-contract-document-title { margin: 8px 0; font-size: 16px; font-weight: 700; line-height: 24px; overflow-wrap: anywhere; }',
    '.skopeo-contract-explanation, .skopeo-contract-empty p, .skopeo-contract-blocker p { margin: 0 0 8px; }',
    '.skopeo-contract-list, .skopeo-contract-vendors, .skopeo-contract-gaps { margin: 0; padding: 0; list-style: none; }',
    '.skopeo-contract-summary-row, .skopeo-contract-fact, .skopeo-contract-gap {',
    '  margin: 0 0 8px;',
    '  padding: 8px;',
    '  border: 1px solid rgba(255, 241, 232, 0.10);',
    '  border-radius: 12px;',
    '  background: #1a1513;',
    '  overflow-wrap: anywhere;',
    '}',
    '.skopeo-contract-date-type, .skopeo-contract-slot-label { display: block; color: #a99283; }',
    '.skopeo-contract-date { font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace; font-size: 12px; line-height: 16px; }',
    '.skopeo-contract-consequence { margin: 8px 0 0; }',
    '.skopeo-contract-vendor { margin: 0 0 16px; padding: 16px; border: 1px solid rgba(255, 241, 232, 0.18); border-radius: 12px; background: #1a1513; }',
    '.skopeo-contract-vendor-heading { margin: 0 0 8px; font-size: 16px; font-weight: 700; line-height: 24px; overflow-wrap: anywhere; }',
    '.skopeo-contract-slots { display: grid; grid-template-columns: minmax(112px, auto) minmax(0, 1fr); gap: 4px 8px; margin: 0; }',
    '.skopeo-contract-slots dt, .skopeo-contract-slots dd { margin: 0; padding: 4px 0; overflow-wrap: anywhere; }',
    '.skopeo-contract-slots dt { color: #a99283; font-weight: 700; }',
    '.skopeo-contract-pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.skopeo-contract-page-state { flex: 1; text-align: center; }',
    '.skopeo-contract-citation { width: 100%; margin-top: 8px; }',
    '.skopeo-contract-citation-primary { background: #ff6b35; border-color: #ff6b35; color: #0d0a09; }',
    '.skopeo-contract-blocker { padding: 16px; border: 1px solid rgba(255, 241, 232, 0.18); border-radius: 12px; background: #1a1513; }',
    '.skopeo-contract-blocker h3, .skopeo-contract-empty h3 { margin: 0 0 8px; font-size: 16px; line-height: 24px; }',
    '.skopeo-contract-ask-entry { width: 100%; min-height: 40px; margin-top: 8px; padding: 8px; }',
    '.skopeo-ask-eyebrow { margin: 0 0 4px; color: #ff9a72; font-family: "Space Mono", "SF Mono", Monaco, Consolas, monospace; font-size: 12px; line-height: 16px; letter-spacing: 0.08em; }',
    '.skopeo-ask-scope { margin: 0 0 16px; padding: 8px; border: 1px solid rgba(255, 241, 232, 0.18); border-radius: 12px; background: #1a1513; overflow-wrap: anywhere; }',
    '.skopeo-ask-label { display: block; margin-bottom: 8px; font-weight: 700; }',
    '.skopeo-ask-question { box-sizing: border-box; width: 100%; min-height: 88px; resize: vertical; padding: 8px; border: 1px solid rgba(255, 241, 232, 0.32); border-radius: 8px; background: #1a1513; color: #f6efe9; font: inherit; line-height: 20px; }',
    '.skopeo-ask-helper, .skopeo-ask-count, .skopeo-ask-privacy, .skopeo-answer-meta { margin: 8px 0 0; color: #a99283; font-size: 12px; line-height: 16px; overflow-wrap: anywhere; }',
    '.skopeo-ask-count { text-align: right; }',
    '.skopeo-ask-scope-choices { margin: 16px 0; padding: 0; border: 0; }',
    '.skopeo-ask-scope-choices legend { margin-bottom: 8px; font-weight: 700; }',
    '.skopeo-ask-scope-choice { display: flex; align-items: start; gap: 8px; min-height: 40px; padding: 8px 0; }',
    '.skopeo-ask-scope-choice input { width: 20px; height: 20px; margin: 0; flex: 0 0 auto; }',
    '.skopeo-ask-actions, .skopeo-answer-result-actions, .skopeo-confirmation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }',
    '.skopeo-ask-actions .skopeo-control, .skopeo-answer-result-actions .skopeo-control, .skopeo-confirmation-actions .skopeo-control, .skopeo-answer-policy-action { min-height: 40px; padding: 8px; }',
    '.skopeo-ask-primary, .skopeo-confirmation-confirm { background: #ff6b35; border-color: #ff6b35; color: #0d0a09; }',
    '.skopeo-ask-status { margin: 16px 0 0; padding: 8px; border-left: 2px solid #ff6b35; }',
    '.skopeo-ask-error { margin: 16px 0 0; padding: 8px; border-left: 2px solid #dc2626; color: #fca5a5; }',
    '.skopeo-answer-banner { margin: -16px -16px 16px; padding: 16px; border-bottom: 1px solid rgba(255, 241, 232, 0.18); background: #0d0a09; }',
    '.skopeo-answer-banner[data-outcome="review-required"], .skopeo-answer-banner[data-outcome="abstained"] { border-left: 2px solid #ff6b35; }',
    '.skopeo-answer-question { margin: 0 0 16px; padding: 8px; border-left: 2px solid rgba(255, 241, 232, 0.32); overflow-wrap: anywhere; }',
    '.skopeo-answer-conclusion { margin: 0; font-size: 16px; line-height: 24px; overflow-wrap: anywhere; }',
    '.skopeo-answer-trust { display: inline-block; margin: 8px 0 0; padding: 4px 8px; border: 1px solid currentColor; border-radius: 999px; font-weight: 700; }',
    '.skopeo-answer-detail, .skopeo-answer-evidence, .skopeo-answer-source, .skopeo-answer-policy { margin: 0 0 8px; padding: 8px; border: 1px solid rgba(255, 241, 232, 0.10); border-radius: 12px; background: #1a1513; overflow-wrap: anywhere; }',
    '.skopeo-answer-evidence strong, .skopeo-answer-source strong { display: block; }',
    '.skopeo-answer-policy-status { margin: 0 0 8px; font-weight: 700; }',
    '.skopeo-answer-policy-list, .skopeo-answer-list { margin: 0; padding: 0; list-style: none; }',
    '.skopeo-answer-empty { margin-bottom: 16px; padding: 16px; border: 1px solid rgba(255, 241, 232, 0.18); border-radius: 12px; }',
    '.skopeo-answer-empty h3 { margin: 0 0 8px; }',
    '.skopeo-confirmation-region { border-color: #ff6b35; }',
    '.skopeo-confirmation-body { margin: 16px 0; overflow-wrap: anywhere; }',
    '.skopeo-live {',
    '  position: fixed;',
    '  width: 1px;',
    '  height: 1px;',
    '  overflow: hidden;',
    '  clip-path: inset(50%);',
    '  white-space: nowrap;',
    '  pointer-events: none;',
    '}',
    '@media (max-width: 479px) {',
    '  .skopeo-lens-meta { display: none; }',
    '  .skopeo-focused-card, .skopeo-gate { width: auto; left: 16px; right: 16px; transform: none; }',
    '  .skopeo-actions, .skopeo-actions-stacked { flex-direction: column; }',
    '  .skopeo-capability-row, .skopeo-status-row, .skopeo-atom-row { grid-template-columns: 1fr; }',
    '}',
    '@media (max-width: 480px) {',
    '  .skopeo-corpus-region { left: 16px !important; right: 16px !important; width: auto; }',
    '  .skopeo-corpus-row, .skopeo-corpus-source { grid-template-columns: 1fr; }',
    '  .skopeo-contract-region { left: 16px !important; right: 16px !important; width: auto; }',
    '  .skopeo-contract-slots { grid-template-columns: 1fr; gap: 0; }',
    '  .skopeo-contract-pager { display: grid; grid-template-columns: 1fr; }',
    '  .skopeo-ask-actions, .skopeo-answer-result-actions, .skopeo-confirmation-actions { display: grid; grid-template-columns: 1fr; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  *, *::before, *::after {',
    '    transition-duration: 0ms !important;',
    '    animation-duration: 0ms !important;',
    '  }',
    '  .skopeo-halo, .skopeo-adaptive-halo { box-shadow: none; }',
    '}',
    '@media (prefers-contrast: more) {',
    '  .skopeo-rail { background: rgba(255, 241, 232, 0.18); }',
    '}',
    '@media (forced-colors: active) {',
    '  .skopeo-lens, .skopeo-focused-card, .skopeo-gate, .skopeo-chip, .skopeo-anomaly-payload, .skopeo-capability-group, .skopeo-unavailable, .skopeo-result-region, .skopeo-corpus-region, .skopeo-contract-region, .skopeo-contract-header, .skopeo-contract-reading-banner, .skopeo-contract-vendor, .skopeo-contract-summary-row, .skopeo-contract-fact, .skopeo-contract-gap, .skopeo-contract-blocker, .skopeo-ask-scope, .skopeo-ask-question, .skopeo-answer-banner, .skopeo-answer-detail, .skopeo-answer-evidence, .skopeo-answer-source, .skopeo-answer-policy, .skopeo-answer-empty {',
    '    background: Canvas;',
    '    color: CanvasText;',
    '    border-color: CanvasText;',
    '    box-shadow: none;',
    '  }',
    '  .skopeo-control { background: ButtonFace; color: ButtonText; border-color: ButtonText; }',
    '  .skopeo-contract-reading-banner[data-emphasis="true"] { border-left-color: Highlight; }',
    '  .skopeo-ask-status, .skopeo-ask-error, .skopeo-answer-banner[data-outcome="review-required"], .skopeo-answer-banner[data-outcome="abstained"] { border-left-color: Highlight; }',
    '  .skopeo-semantic-anchor, .skopeo-adaptive-anchor { background: Canvas; border: 2px solid Highlight; box-shadow: none; }',
    '  .skopeo-rail, .skopeo-rail-line { background: CanvasText; }',
    '  .skopeo-control:focus-visible, .skopeo-focused-title:focus-visible, .skopeo-active-glyph, .skopeo-rail-ticks, .skopeo-halo, .skopeo-adaptive-halo {',
    '    outline-color: Highlight;',
    '    background: Highlight;',
    '    border-color: Highlight;',
    '    box-shadow: none;',
    '  }',
    '  .skopeo-ghost { background: transparent; }',
    '}'
  ].join('\n');

  function zeroSnapshot() {
    const snapshot = {};
    for (const category of RESOURCE_CATEGORIES) snapshot[category] = 0;
    return Object.freeze(snapshot);
  }

  class LocalResourceLedger {
    constructor() {
      this._nextId = 1;
      this._handles = new Map();
    }

    acquire(category, cleanup) {
      if (!RESOURCE_CATEGORY_SET.has(category)) throw new TypeError('Unknown Skopeo resource category');
      const handle = Object.freeze({ id: this._nextId++, category: category });
      this._handles.set(handle, { cleanup: typeof cleanup === 'function' ? cleanup : null, released: false });
      return handle;
    }

    release(handle, options) {
      const entry = this._handles.get(handle);
      if (!entry) throw new TypeError('Unknown Skopeo resource handle');
      if (entry.released) throw new Error('Skopeo resource already released');
      entry.released = true;
      if ((!options || options.cleanup !== false) && entry.cleanup) {
        try {
          entry.cleanup();
        } catch (error) {
          if (!options || options.suppressCleanupError !== true) throw error;
        }
      }
      return true;
    }

    snapshot() {
      const snapshot = {};
      for (const category of RESOURCE_CATEGORIES) snapshot[category] = 0;
      for (const pair of this._handles) {
        const handle = pair[0];
        const entry = pair[1];
        if (!entry.released) snapshot[handle.category] += 1;
      }
      return Object.freeze(snapshot);
    }
  }

  function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function hasExactOwnKeys(value, expectedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Reflect.ownKeys(value);
    if (actual.length !== expectedKeys.length || actual.some(function (key) { return typeof key !== 'string'; })) {
      return false;
    }
    const sortedActual = actual.slice().sort();
    const sortedExpected = expectedKeys.slice().sort();
    return sortedActual.every(function (key, index) { return key === sortedExpected[index]; });
  }

  // FSB's own HUD copy follows the FSB language; everything else is data.
  // Copy reaches the shell in English: composer models and runtime and
  // service-worker messages stay English because their validators compare
  // exact strings. A sink translates a copy() source when it writes it. A
  // plain string (a catalog label, a Drive or document name, an extracted
  // value, a model answer, a typed question) is written as given.
  const COPY_SOURCE = Symbol('skopeoCopy');
  const COPY_WRITES = new WeakMap();
  const COPY_TOKEN = /\$([A-Z][A-Z0-9_]*)\$/g;

  function copy(english, subs) {
    const source = { english: String(english), subs: subs || null };
    source[COPY_SOURCE] = true;
    return Object.freeze(source);
  }

  function isCopy(value) {
    return !!value && typeof value === 'object' && value[COPY_SOURCE] === true;
  }

  function hudLocale() {
    const locale = globalThis.fsbUiLocale;
    return locale && typeof locale.line === 'function' && typeof locale.current === 'function'
      ? locale
      : null;
  }

  // A civil date (YYYY-MM-DD) the shell shows, on its own or inside copy.
  // With no FSB language, or English, it is written exactly as the service
  // worker wrote it (english); in any other language it is formatted for that
  // language, so month names never need catalog keys.
  const CIVIL_DATE_SOURCE = Symbol('skopeoCivilDate');
  const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function civilDate(iso, english) {
    const source = { iso: String(iso), english: String(english) };
    source[CIVIL_DATE_SOURCE] = true;
    return Object.freeze(source);
  }

  function isCivilDate(value) {
    return !!value && typeof value === 'object' && value[CIVIL_DATE_SOURCE] === true;
  }

  function formatCivilDate(iso, code, month) {
    const parts = CIVIL_DATE.exec(iso);
    if (!parts) return null;
    try {
      const shown = new Intl.DateTimeFormat(code, {
        year: 'numeric', month: month || 'long', day: 'numeric', timeZone: 'UTC'
      }).format(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
      return typeof shown === 'string' && shown ? shown : null;
    } catch (_error) {
      return null;
    }
  }

  function shownCivilDate(value) {
    const locale = hudLocale();
    let code = null;
    try { code = locale ? locale.current() : null; } catch (_error) { code = null; }
    if (typeof code !== 'string' || !code || code === 'en') return value.english;
    return formatCivilDate(value.iso, code) || value.english;
  }

  // The English an alert-engine date reads as ("March 1, 2027"), used only to
  // confirm that a sentence or label names its own civil date.
  function englishCivilDate(iso, month) {
    return formatCivilDate(iso, 'en-US', month);
  }

  // The English a copy() source stands for, nested sources filled in: the
  // exact string the shell wrote before it translated anything.
  function englishOf(value) {
    if (isCivilDate(value)) return value.english;
    if (!isCopy(value)) return value == null ? '' : String(value);
    if (!value.subs) return value.english;
    const subs = value.subs;
    return value.english.replace(COPY_TOKEN, function (match, name) {
      return Object.prototype.hasOwnProperty.call(subs, name) ? englishOf(subs[name]) : match;
    });
  }

  // ui-locale translates a nested { english, subs } substitution and shows
  // every other value as given.
  function lineSubs(subs) {
    if (!subs) return undefined;
    const out = {};
    for (const name of Object.keys(subs)) {
      const value = subs[name];
      out[name] = isCopy(value)
        ? { english: value.english, subs: lineSubs(value.subs) }
        : isCivilDate(value) ? shownCivilDate(value) : (value == null ? '' : String(value));
    }
    return out;
  }

  function localized(value) {
    if (isCivilDate(value)) return shownCivilDate(value);
    if (!isCopy(value)) return value == null ? '' : String(value);
    const locale = hudLocale();
    if (!locale) return englishOf(value);
    try {
      const shown = locale.line(value.english, lineSubs(value.subs));
      return typeof shown === 'string' ? shown : englishOf(value);
    } catch (_error) {
      return englishOf(value);
    }
  }

  function recordCopy(node, slot, value, shown) {
    let record = COPY_WRITES.get(node);
    if (!isCopy(value) && !isCivilDate(value)) {
      if (record) delete record[slot];
      return;
    }
    if (!record) {
      record = Object.create(null);
      COPY_WRITES.set(node, record);
    }
    record[slot] = { source: value, shown: shown };
  }

  // Rewrites the copy this shell wrote under root in the active language. A
  // node or attribute is rewritten only while it still shows what was
  // written, so anything that changed since is left alone.
  function relocalizeTree(root) {
    const stack = root ? [root] : [];
    while (stack.length) {
      const node = stack.pop();
      const record = COPY_WRITES.get(node);
      if (record) {
        for (const slot of Object.keys(record)) {
          const entry = record[slot];
          const attribute = slot === 'text' ? null : slot.slice(1);
          const current = attribute ? node.getAttribute(attribute) : node.textContent;
          if (current !== entry.shown) {
            delete record[slot];
            continue;
          }
          const next = localized(entry.source);
          if (next !== entry.shown) {
            if (attribute) node.setAttribute(attribute, next);
            else node.textContent = next;
          }
          entry.shown = next;
        }
      }
      const children = node.childNodes;
      if (children) {
        for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
      }
    }
  }

  // The control under root whose aria-label this shell wrote from the given
  // copy and still shows, in whatever language that is.
  function copyLabelled(root, english) {
    const nodes = root && typeof root.querySelectorAll === 'function' ? root.querySelectorAll('[aria-label]') : [];
    for (const node of Array.from(nodes)) {
      const record = COPY_WRITES.get(node);
      const entry = record && record['@aria-label'];
      if (entry && isCopy(entry.source) && englishOf(entry.source) === english &&
          node.getAttribute('aria-label') === entry.shown) return node;
    }
    return null;
  }

  function text(node, value) {
    const shown = localized(value);
    node.textContent = shown;
    recordCopy(node, 'text', value, shown);
    return node;
  }

  // Live-region text is translated when it is announced but never rewritten
  // later, so a language change does not announce it again.
  function announcementText(node, value) {
    node.textContent = localized(value);
    recordCopy(node, 'text', undefined);
    return node;
  }

  function setAttributes(node, attributes) {
    for (const key of Object.keys(attributes || {})) {
      const value = attributes[key];
      if (value === undefined || value === null) continue;
      const shown = localized(value);
      node.setAttribute(key, shown);
      recordCopy(node, '@' + key, value, shown);
    }
    return node;
  }

  function createElement(documentRef, tagName, className, attributes, value) {
    const node = documentRef.createElement(tagName);
    if (className) node.className = className;
    setAttributes(node, attributes);
    if (value !== undefined) text(node, value);
    return node;
  }

  function adaptiveComposerApi() {
    if (globalThis.FSBSkopeoAdaptiveComposer &&
        typeof globalThis.FSBSkopeoAdaptiveComposer.validateRenderModel === 'function') {
      return globalThis.FSBSkopeoAdaptiveComposer;
    }
    if (typeof require === 'function') {
      try {
        const api = require('./skopeo-adaptive-composer.js');
        if (api && typeof api.validateRenderModel === 'function') return api;
      } catch (_error) {
        return null;
      }
    }
    return null;
  }

  function adaptiveText(value, optional) {
    if (optional && value === null) return true;
    return typeof value === 'string' && value.length > 0 && value.length <= ADAPTIVE_TEXT_LIMIT &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
  }

  function adaptiveArray(value, maximum) {
    return Array.isArray(value) && value.length <= maximum;
  }

  function validAdaptiveAtom(atom) {
    if (!atom || !ADAPTIVE_ATOM_SET.has(atom.type)) return false;
    if (atom.type === 'section-heading') {
      return hasExactOwnKeys(atom, ['type', 'text']) && adaptiveText(atom.text);
    }
    if (atom.type === 'status-row' || atom.type === 'capability-row') {
      return hasExactOwnKeys(atom, ['type', 'label', 'status', 'detail']) &&
        adaptiveText(atom.label) && adaptiveText(atom.status) && adaptiveText(atom.detail, true);
    }
    if (atom.type === 'fact-list') {
      return hasExactOwnKeys(atom, ['type', 'heading', 'items']) && adaptiveText(atom.heading) &&
        adaptiveArray(atom.items, ADAPTIVE_ITEM_LIMIT) && atom.items.every(function (item) {
          return hasExactOwnKeys(item, ['label', 'value']) && adaptiveText(item.label) && adaptiveText(item.value);
        });
    }
    if (atom.type === 'item-list') {
      return hasExactOwnKeys(atom, ['type', 'heading', 'items']) && adaptiveText(atom.heading) &&
        adaptiveArray(atom.items, ADAPTIVE_ITEM_LIMIT) && atom.items.every(function (item) {
          return hasExactOwnKeys(item, ['text', 'metadata']) && adaptiveText(item.text) &&
            adaptiveText(item.metadata, true);
        });
    }
    if (atom.type === 'compact-table') {
      return hasExactOwnKeys(atom, ['type', 'heading', 'columns', 'rows']) && adaptiveText(atom.heading) &&
        adaptiveArray(atom.columns, ADAPTIVE_COLUMN_LIMIT) && atom.columns.length > 0 &&
        atom.columns.every(function (column) { return adaptiveText(column); }) &&
        adaptiveArray(atom.rows, ADAPTIVE_ITEM_LIMIT) && atom.rows.every(function (row) {
          return adaptiveArray(row, ADAPTIVE_COLUMN_LIMIT) && row.length === atom.columns.length &&
            row.every(function (cell) { return adaptiveText(cell); });
        });
    }
    if (atom.type === 'timeline') {
      return hasExactOwnKeys(atom, ['type', 'heading', 'events']) && adaptiveText(atom.heading) &&
        adaptiveArray(atom.events, ADAPTIVE_ITEM_LIMIT) && atom.events.every(function (event) {
          return hasExactOwnKeys(event, ['time', 'text']) && adaptiveText(event.time) && adaptiveText(event.text);
        });
    }
    if (atom.type === 'diff') {
      return hasExactOwnKeys(atom, [
        'type', 'heading', 'beforeLabel', 'before', 'afterLabel', 'after'
      ]) && adaptiveText(atom.heading) && adaptiveText(atom.beforeLabel) && adaptiveText(atom.before) &&
        adaptiveText(atom.afterLabel) && adaptiveText(atom.after);
    }
    return hasExactOwnKeys(atom, ['type', 'tone', 'heading', 'message', 'nextStep']) &&
      ['info', 'warning', 'error'].includes(atom.tone) && adaptiveText(atom.heading) &&
      adaptiveText(atom.message) && adaptiveText(atom.nextStep);
  }

  function validateAdaptiveAtoms(model, renderedAtoms) {
    if (!adaptiveArray(renderedAtoms, ADAPTIVE_ATOM_LIMIT)) return false;
    const requested = model && model.rendererRequest && model.rendererRequest.requestedAtoms;
    if (!Array.isArray(requested)) return false;
    return renderedAtoms.every(function (atom) {
      return validAdaptiveAtom(atom) && requested.includes(atom.type);
    });
  }

  function adaptiveEntityKey(entity) {
    return entity ? entity.kind + '\u0000' + entity.id + '\u0000' + entity.contextEpoch : null;
  }

  function adaptiveAuthoritySnapshot(model) {
    return Object.freeze({
      generation: model.authority.generation,
      exactOrigin: model.authority.exactOrigin,
      profileId: model.authority.profileId,
      profileVersion: model.authority.profileVersion,
      contextEpoch: model.authority.contextEpoch,
      entityKey: adaptiveEntityKey(model.entity)
    });
  }

  function sameAdaptiveAuthority(left, right) {
    return !!left && !!right && left.generation === right.generation &&
      left.exactOrigin === right.exactOrigin && left.profileId === right.profileId &&
      left.profileVersion === right.profileVersion && left.contextEpoch === right.contextEpoch &&
      left.entityKey === right.entityKey;
  }

  function corpusAuthoritySnapshot(model) {
    return Object.freeze({
      generation: model.authority.generation,
      exactOrigin: model.authority.exactOrigin,
      profileId: model.authority.profileId,
      profileVersion: model.authority.profileVersion,
      contextEpoch: model.authority.contextEpoch,
      semanticEntityToken: model.semanticEntityToken,
      actionToken: model.actionToken
    });
  }

  function sameCorpusAuthority(left, right) {
    return !!left && !!right && left.generation === right.generation &&
      left.exactOrigin === right.exactOrigin && left.profileId === right.profileId &&
      left.profileVersion === right.profileVersion && left.contextEpoch === right.contextEpoch &&
      left.semanticEntityToken === right.semanticEntityToken && left.actionToken === right.actionToken;
  }

  function contractAuthoritySnapshot(model) {
    if (!model || !model.authority) return null;
    return Object.freeze({
      generation: model.authority.generation,
      exactOrigin: model.authority.exactOrigin,
      profileVersion: model.authority.profileVersion,
      contextEpoch: model.authority.contextEpoch,
      semanticEntityToken: model.authority.semanticEntityToken,
      requestActionToken: model.authority.requestActionToken,
      projectionToken: model.authority.projectionToken
    });
  }

  function sameContractAuthority(left, right) {
    return !!left && !!right && left.generation === right.generation &&
      left.exactOrigin === right.exactOrigin && left.profileVersion === right.profileVersion &&
      left.contextEpoch === right.contextEpoch &&
      left.semanticEntityToken === right.semanticEntityToken &&
      left.requestActionToken === right.requestActionToken &&
      left.projectionToken === right.projectionToken;
  }

  function exactAdaptiveOrigin(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 320) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
        parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function adaptiveModelTextSafe(value, path, seen) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
    if (typeof value === 'string') {
      if (path === 'authority.exactOrigin') return exactAdaptiveOrigin(value);
      const bounded = path === 'consequence.body' && CONSEQUENCE_BOUNDS
        ? value.length > 0 && value.length <= CONSEQUENCE_BOUNDS.composedBody &&
          !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)
        : adaptiveText(value);
      return bounded &&
        !/[<>]|(?:https?:[/][/])|(?:data:)|(?:javascript:)|(?:on[a-z]+\s*=)|[{}]/i.test(value);
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const nextPath = path ? path + '.' + key : String(key);
      if (typeof key !== 'string' || !descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          !adaptiveModelTextSafe(descriptor.value, nextPath, seen)) return false;
    }
    return true;
  }

  function adaptiveModelMatchesShellPolicy(model) {
    if (!hasExactOwnKeys(model, [
      'modelVersion', 'authority', 'attention', 'primitives', 'lens', 'entity', 'readyGroups',
      'unavailableSummary', 'argumentCollection', 'rendererRequest', 'consequence'
    ]) || model.modelVersion !== ADAPTIVE_MODEL_VERSION ||
        !hasExactOwnKeys(model.authority, [
          'generation', 'exactOrigin', 'profileId', 'profileVersion', 'contextEpoch'
        ]) || !isPositiveSafeInteger(model.authority.generation) ||
        !isPositiveSafeInteger(model.authority.contextEpoch) || !exactAdaptiveOrigin(model.authority.exactOrigin) ||
        !ATTENTION_POLICY[model.attention] || !Array.isArray(model.primitives) ||
        model.primitives.some(function (primitive, index) {
          return !ATTENTION_POLICY[model.attention].includes(primitive) || model.primitives.indexOf(primitive) !== index;
        }) || !model.unavailableSummary || model.unavailableSummary.heading !== 'Unavailable actions' ||
        !model.rendererRequest || model.rendererRequest.narrowBreakpoint !== 480 ||
        !adaptiveModelTextSafe(model, '', new Set())) return false;
    if (model.attention === ATTENTION.AMBIENT && model.primitives.join('|') !== 'rail') return false;
    if (model.attention === ATTENTION.ANCHORED && (!model.entity ||
        !['anchor|chip|rail', 'anchor|chip|rail|halo'].includes(model.primitives.join('|')))) return false;
    if (model.attention === ATTENTION.FOCUSED) {
      const expected = model.entity ? ['anchor|chip', 'anchor|chip|ghost'] : [''];
      if (!expected.includes(model.primitives.join('|'))) return false;
    }
    if (model.attention === ATTENTION.INTERSTITIAL &&
        (model.primitives.join('|') !== 'gate' || !model.consequence ||
          model.consequence.safeLabel !== 'Keep reviewing')) return false;
    return model.attention === ATTENTION.INTERSTITIAL ? model.consequence !== null : model.consequence === null;
  }

  // Adaptive HUD copy. The composer builds its sentences in English from a
  // few structured parts (the app name, the page noun, the entity noun and
  // label, counts). These helpers rebuild each sentence as a copy() source
  // from the same parts. A rebuilt source is used only while its English is
  // exactly the model's string; otherwise the model's string is written as
  // given, so a composer change can never show a wrong translation.
  function rebuilt(shown, source) {
    return source && englishOf(source) === shown ? source : shown;
  }

  function titleCaseNoun(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // One full template per composer entity noun, so no translation has to
  // agree with a noun spliced into it.
  const ENTITY_NOUN_COPY = Object.freeze({
    document: Object.freeze({
      chip: 'Document: $LABEL$',
      accessibleName: 'Open actions for document $LABEL$',
      withdrawn: 'Skopeo can’t verify this document anymore. Entity actions were removed.',
      description: 'Verified document actions and capability readiness.'
    }),
    message: Object.freeze({
      chip: 'Message: $LABEL$',
      accessibleName: 'Open actions for message $LABEL$',
      withdrawn: 'Skopeo can’t verify this message anymore. Entity actions were removed.',
      description: 'Verified message actions and capability readiness.'
    }),
    record: Object.freeze({
      chip: 'Record: $LABEL$',
      accessibleName: 'Open actions for record $LABEL$',
      withdrawn: 'Skopeo can’t verify this record anymore. Entity actions were removed.',
      description: 'Verified record actions and capability readiness.'
    }),
    item: Object.freeze({
      chip: 'Item: $LABEL$',
      accessibleName: 'Open actions for item $LABEL$',
      withdrawn: 'Skopeo can’t verify this item anymore. Entity actions were removed.',
      description: 'Verified item actions and capability readiness.'
    }),
    target: Object.freeze({
      chip: 'Target: $LABEL$',
      accessibleName: 'Open actions for target $LABEL$',
      withdrawn: 'Skopeo can’t verify this target anymore. Entity actions were removed.',
      description: 'Verified target actions and capability readiness.'
    })
  });
  // The adaptive lens, and so its rail, renders only in Ambient and Anchored.
  const ADAPTIVE_RAIL_COPY = Object.freeze({
    ambient: 'Skopeo ambient status',
    anchored: 'Skopeo anchored status'
  });
  // Group labels that Skopeo itself supplies when a catalog group has none:
  // the composer's fallback and the capability projector's two groups.
  const ADAPTIVE_FALLBACK_GROUPS = new Set(['Actions', 'Capabilities', 'Other']);
  const ADAPTIVE_RECOVERY_COPY = Object.freeze([
    'Review the target and try the action again.',
    'Skopeo could not display a complete confirmation. Review the action and try again.'
  ]);
  // Typed-result atoms carry router data, apart from the fixed strings the
  // service worker, the runtime and the renderer registry put in them.
  const RESULT_HEADING_COPY = new Set([
    'Result details', 'Results', 'Read complete', 'Action complete', 'Action not completed'
  ]);
  const RESULT_NOTICE_COPY = new Set([
    'The selected read completed through the capability router.',
    'The confirmed action completed through the capability router.',
    'The action didn’t finish. Review the target and try the action again.',
    'Review the result and keep working in the current view.',
    'Review the service and continue in the current view.',
    'Review the target and try again.'
  ]);

  function adaptiveEntityCopy(entity) {
    if (!entity) return null;
    const forms = Object.prototype.hasOwnProperty.call(ENTITY_NOUN_COPY, entity.noun)
      ? ENTITY_NOUN_COPY[entity.noun]
      : null;
    if (!forms) {
      return {
        chip: entity.chipLabel,
        accessibleName: entity.chipAccessibleName,
        withdrawn: entity.withdrawnText,
        description: null
      };
    }
    return {
      chip: rebuilt(entity.chipLabel, copy(forms.chip, { LABEL: entity.label })),
      accessibleName: rebuilt(entity.chipAccessibleName, copy(forms.accessibleName, { LABEL: entity.label })),
      withdrawn: rebuilt(entity.withdrawnText, copy(forms.withdrawn)),
      description: copy(forms.description)
    };
  }

  // "<action> didn’t finish. <recovery>" from the composer and the renderer
  // registry; the action is a catalog label or slug and stays data.
  function unfinishedActionCopy(message) {
    const fixed = 'The action didn’t finish. Review the target and try the action again.';
    if (message === fixed) return copy(fixed);
    for (const recovery of ADAPTIVE_RECOVERY_COPY) {
      const tail = ' didn’t finish. ' + recovery;
      if (message.length > tail.length && message.endsWith(tail)) {
        return rebuilt(message, copy('$ACTION$ didn’t finish. $RECOVERY$', {
          ACTION: message.slice(0, message.length - tail.length),
          RECOVERY: copy(recovery)
        }));
      }
    }
    return message;
  }

  // The composer's result message, decided by the result status.
  function adaptiveResultMessage(model, entity) {
    const message = model.rendererRequest.copy.resultMessage;
    if (typeof message !== 'string') return message;
    const status = model.rendererRequest.resultStatus;
    if (status === 'uncertain') {
      return rebuilt(message, copy(
        'Skopeo can’t verify this view. The page was left unchanged. Open another view or turn off Skopeo.'
      ));
    }
    if (status === 'unsupported') {
      return rebuilt(message, copy(
        'Skopeo doesn’t support this app yet. Nothing was added to the page. Turn off Skopeo or open a supported app.'
      ));
    }
    if (status === 'target-withdrawn') {
      return rebuilt(message, entity ? entity.withdrawn
        : copy('Skopeo can’t verify this target anymore. Entity actions were removed.'));
    }
    if (status === 'pending') {
      const fixed = 'The selected action is pending.';
      if (message === fixed) return copy(fixed);
      const tail = ' is pending.';
      return message.length > tail.length && message.endsWith(tail)
        ? rebuilt(message, copy('$ACTION$ is pending.', { ACTION: message.slice(0, message.length - tail.length) }))
        : message;
    }
    return status === 'error' ? unfinishedActionCopy(message) : message;
  }

  const ADAPTIVE_COPY_CACHE = new WeakMap();

  // The copy sources for one validated adaptive model.
  function adaptiveCopy(model) {
    const cached = ADAPTIVE_COPY_CACHE.get(model);
    if (cached) return cached;
    const lens = model.lens;
    const pageCopy = model.rendererRequest.copy;
    // The composer labels the lens just 'Skopeo' only when the app has no
    // display name; appDisplayName then falls back to 'Skopeo' too.
    const named = lens.label !== 'Skopeo';
    const name = named ? lens.appDisplayName : copy('Skopeo');
    const page = copy(lens.pageNoun);
    const readyCount = model.readyGroups.reduce(function (total, group) { return total + group.rows.length; }, 0);
    const entity = adaptiveEntityCopy(model.entity);
    const lensLabel = rebuilt(lens.label, named ? copy('Skopeo · $NAME$', { NAME: name }) : copy('Skopeo'));
    const focusedTitle = rebuilt(pageCopy.focusedTitle, entity ? entity.chip
      : named ? copy('$NAME$ actions', { NAME: name }) : copy('Skopeo actions'));
    const sources = Object.freeze({
      entity: entity,
      lensLabel: lensLabel,
      metadata: rebuilt(lens.metadata, copy('$NOUN$ · $COUNT$ ready', {
        NOUN: copy(titleCaseNoun(lens.pageNoun)),
        COUNT: String(readyCount)
      })),
      actionLabel: rebuilt(lens.actionLabel, named
        ? copy('Open $NAME$ actions', { NAME: name }) : copy('Open Skopeo actions')),
      regionLabel: rebuilt(lens.regionLabel, named
        ? copy('Skopeo for $NAME$', { NAME: name }) : copy('Skopeo actions')),
      eyebrow: rebuilt(lens.appDisplayName + ' · ' + lens.pageNoun, copy('$NAME$ · $NOUN$', {
        NAME: name,
        NOUN: page
      })),
      focusedTitle: focusedTitle,
      contextDescription: rebuilt(pageCopy.contextDescription, entity ? entity.description
        : copy('Verified actions and capability readiness for this $NOUN$.', { NOUN: page })),
      emptyHeading: rebuilt(pageCopy.emptyHeading, copy('No verified actions here')),
      emptyBody: rebuilt(pageCopy.emptyBody, copy(
        'Skopeo found no ready capabilities for this $NOUN$. Change the task lens or open another supported view.',
        { NOUN: page }
      )),
      resultMessage: adaptiveResultMessage(model, entity),
      backLabel: rebuilt(pageCopy.backLabel, named
        ? copy('Back to $NAME$ overview', { NAME: name }) : copy('Back to Skopeo overview')),
      turnOffLabel: rebuilt(pageCopy.turnOffLabel, copy(COPY.universalKill)),
      initialAnnouncement: rebuilt(lens.label + ' on.', copy('$LABEL$ on.', { LABEL: lensLabel })),
      overviewAnnouncement: rebuilt(lens.label + ' overview.', copy('$LABEL$ overview.', { LABEL: lensLabel })),
      openAnnouncement: rebuilt(pageCopy.focusedTitle + ' open.', copy('$TITLE$ open.', { TITLE: focusedTitle }))
    });
    ADAPTIVE_COPY_CACHE.set(model, sources);
    return sources;
  }

  // The composer appends a fixed side-effect suffix to the catalog group
  // label; the label itself is data unless it is one of Skopeo's fallbacks.
  function adaptiveGroupHeading(group) {
    const label = group.label;
    const template = group.sideEffectClass === 'write' ? '$GROUP$ · Changes data'
      : group.sideEffectClass === 'destructive' ? '$GROUP$ · Destructive' : null;
    let base = label;
    if (template) {
      const suffix = template.slice('$GROUP$'.length);
      if (label.length <= suffix.length || !label.endsWith(suffix)) return label;
      base = label.slice(0, label.length - suffix.length);
    }
    const baseSource = ADAPTIVE_FALLBACK_GROUPS.has(base) ? copy(base) : base;
    return template ? rebuilt(label, copy(template, { GROUP: baseSource })) : baseSource;
  }

  function adaptiveParameterSummary(summary) {
    const match = /^(\d+) parameters?$/.exec(summary);
    if (!match) return summary;
    return rebuilt(summary, copy(match[1] === '1' ? '$COUNT$ parameter' : '$COUNT$ parameters', {
      COUNT: match[1]
    }));
  }

  // Effect, target and parameter text come from the catalog's consequence
  // contract and stay data; only the sentence frame is Skopeo's.
  function adaptiveConsequenceBody(consequence) {
    const body = consequence.body;
    const destructive = consequence.sideEffectClass === 'destructive';
    const template = destructive
      ? 'This action may remove service data. $EFFECT$ Target: $TARGET$. $PARAMETERS$'
      : '$EFFECT$ Target: $TARGET$. $PARAMETERS$';
    const warning = template.slice(0, template.indexOf('$EFFECT$'));
    if (!body.startsWith(warning)) return body;
    const rest = body.slice(warning.length);
    const marker = ' Target: ';
    const at = rest.indexOf(marker);
    if (at <= 0) return body;
    const after = rest.slice(at + marker.length);
    const end = after.indexOf('. ');
    if (end <= 0 || end + 2 >= after.length) return body;
    return rebuilt(body, copy(template, {
      EFFECT: rest.slice(0, at),
      TARGET: after.slice(0, end),
      PARAMETERS: after.slice(end + 2)
    }));
  }

  function resultHeading(value) {
    if (RESULT_HEADING_COPY.has(value)) return copy(value);
    // The renderer registry splits a table on a narrow viewport.
    const row = / · Row (\d+)$/.exec(value);
    if (row && RESULT_HEADING_COPY.has(value.slice(0, row.index))) {
      return rebuilt(value, copy('$HEADING$ · Row $N$', { HEADING: copy(value.slice(0, row.index)), N: row[1] }));
    }
    return value;
  }

  function resultNoticeText(value) {
    return RESULT_NOTICE_COPY.has(value) ? copy(value) : value;
  }

  // Fact labels the service worker writes for a single value ('Result') or a
  // list of plain values ('Item 1', 'Item 2', ...); other labels are data.
  function resultFactItems(atom) {
    const items = atom.items;
    if (atom.heading !== 'Result details') return items;
    if (items.length === 1 && items[0].label === 'Result') {
      return [{ label: copy('Result'), value: items[0].value }];
    }
    const listed = items.length > 0 && items.every(function (item, index) {
      return item.label === 'Item ' + String(index + 1);
    });
    return listed ? items.map(function (item, index) {
      return { label: copy('Item $N$', { N: String(index + 1) }), value: item.value };
    }) : items;
  }

  // A single value in a list-shaped result shows as "Result: <value>".
  function resultListText(atom, item) {
    const prefix = 'Result: ';
    if (atom.heading !== 'Results' || atom.items.length !== 1 || item.metadata !== null ||
        item.text.length <= prefix.length || !item.text.startsWith(prefix)) return item.text;
    return rebuilt(item.text, copy('Result: $VALUE$', { VALUE: item.text.slice(prefix.length) }));
  }

  function resultNoticeMessage(atom) {
    if (atom.tone === 'error' && atom.heading === 'Action not completed') return unfinishedActionCopy(atom.message);
    return resultNoticeText(atom.message);
  }

  // Corpus and contract-view copy. The composer fills these models from its
  // own state tables, so most fields are FSB copy. The data in them is Drive
  // folder and document names, citation labels, extracted fact values, owner
  // names and accepted consequence text. A field that can hold either is
  // decided by its state or type enum, and a sentence the composer assembles
  // is rebuilt from the model's counts and enums, then used only while its
  // English is exactly the model's string.

  // While the current source is pending, inaccessible or missing the service
  // worker sends no Drive name for it; in every other state the label may be
  // that name.
  const CORPUS_UNNAMED_SOURCE_STATES = new Set(['pending', 'inaccessible', 'missing']);

  function corpusSourceLabel(source) {
    return CORPUS_UNNAMED_SOURCE_STATES.has(source.state)
      ? rebuilt(source.label, copy('Current source'))
      : source.label;
  }

  // A corpus row without a Drive name is numbered by its position.
  function corpusRowLabel(row, index) {
    return rebuilt(row.label, copy('Source $N$', { N: String(index + 1) }));
  }

  function corpusAggregateLabel(model) {
    const count = model.rows.length;
    return rebuilt(model.aggregate.label, copy(count === 1 ? '$COUNT$ source' : '$COUNT$ sources', {
      COUNT: String(count)
    }));
  }

  function joinedCopy(parts) {
    return parts.reduce(function (list, item) {
      return list === null ? item : copy('$LIST$ · $ITEM$', { LIST: list, ITEM: item });
    }, null);
  }

  const DOCUMENT_COUNT_COPY = Object.freeze([
    Object.freeze(['ready', '$COUNT$ ready']),
    Object.freeze(['pending', '$COUNT$ pending']),
    Object.freeze(['unreadable', '$COUNT$ unreadable']),
    Object.freeze(['downloadBlocked', '$COUNT$ download blocked']),
    Object.freeze(['inaccessible', '$COUNT$ inaccessible']),
    Object.freeze(['missing', '$COUNT$ missing'])
  ]);

  // "N authorized sources · <index state> · N ready · ...", from the counts.
  function contractDocumentsValue(slot) {
    const parts = [
      copy(slot.total === 1 ? '$COUNT$ authorized source' : '$COUNT$ authorized sources', {
        COUNT: String(slot.total)
      }),
      copy(slot.indexLabel)
    ];
    for (const entry of DOCUMENT_COUNT_COPY) {
      if (slot[entry[0]] > 0) parts.push(copy(entry[1], { COUNT: String(slot[entry[0]]) }));
    }
    return rebuilt(slot.value, joinedCopy(parts));
  }

  // An assigned owner's value is the owner's name.
  function contractOwnerValue(slot) {
    return slot.state === 'assigned' ? slot.value : copy(slot.value);
  }

  // An accepted consequence is document text, except the sentence the
  // service worker writes itself for a material date of each type.
  const MATERIAL_DATE_CONSEQUENCE_COPY = Object.freeze({
    'notice-deadline': 'Notice must be given by this date',
    termination: 'Agreement terminates on this date',
    expiration: 'Agreement expires on this date',
    renewal: 'Renewal is measured from this date'
  });

  function contractConsequenceValue(state, value, dateType) {
    if (state !== 'accepted') return copy(value);
    const fixed = typeof dateType === 'string' &&
      Object.prototype.hasOwnProperty.call(MATERIAL_DATE_CONSEQUENCE_COPY, dateType)
      ? MATERIAL_DATE_CONSEQUENCE_COPY[dateType]
      : null;
    return fixed ? rebuilt(value, copy(fixed)) : value;
  }

  // A material date's label is its civil date, written as ISO by the service
  // worker or in English words by a fixture; any other label is kept as is.
  function contractDateLabel(dateLabel, iso) {
    if (!CIVIL_DATE.test(iso)) return dateLabel;
    const names = dateLabel === iso || dateLabel === englishCivilDate(iso) ||
      dateLabel === englishCivilDate(iso, 'short');
    return names ? civilDate(iso, dateLabel) : dateLabel;
  }

  // The scheduled and delivered alert details name the alert date in English
  // words; they are rebuilt around that civil date. Every other detail is a
  // fixed service-worker sentence.
  const ALERT_DETAIL_COPY = Object.freeze({
    scheduled: 'For $DATE$ · 90 days before the governing notice deadline.',
    delivered: 'Delivered to this Chrome user on $DATE$.'
  });

  function contractAlertDetail(slot) {
    const detail = slot.detail;
    if (!Object.prototype.hasOwnProperty.call(ALERT_DETAIL_COPY, slot.state)) return copy(detail);
    const template = ALERT_DETAIL_COPY[slot.state];
    const at = template.indexOf('$DATE$');
    const head = template.slice(0, at);
    const tail = template.slice(at + '$DATE$'.length);
    if (!slot.alertCivilDate || detail.length <= head.length + tail.length ||
        !detail.startsWith(head) || !detail.endsWith(tail)) return detail;
    const english = detail.slice(head.length, detail.length - tail.length);
    if (english !== englishCivilDate(slot.alertCivilDate)) return detail;
    return rebuilt(detail, copy(template, { DATE: civilDate(slot.alertCivilDate, english) }));
  }

  // A "+N ..." overflow line, rebuilt from the count the model carries with it.
  function overflowCopy(line, template, count) {
    return line ? rebuilt(line, copy(template, { COUNT: String(count) })) : line;
  }

  function folderOverflowText(overflow) {
    return rebuilt(overflow.text, copy(
      'Showing $SHOWN$ of $TOTAL$ accessible vendors. $COUNT$ additional vendors are outside this bounded view.',
      {
        SHOWN: String(overflow.projectedVendorCount),
        TOTAL: String(overflow.vendorCount),
        COUNT: String(overflow.vendorOverflow)
      }
    ));
  }

  // The ask entry for a vendor names the vendor's Drive folder (data).
  function contractAskEntryLabel(entry) {
    const label = entry.action.label;
    if (entry.kind === 'agreement') return rebuilt(label, copy('Ask about this agreement'));
    if (entry.kind === 'corpus') return rebuilt(label, copy('Ask enrolled corpus'));
    return rebuilt(label, copy('Ask about $VENDOR$', { VENDOR: entry.label }));
  }

  // Ask and answer copy. The composer fills the ask and answer models from
  // its own tables, apart from the typed question, the provider's conclusion,
  // evidence values, citation and document labels, and a vendor scope's
  // Drive folder name, which are data. The service worker names an
  // agreement or corpus scope itself; a vendor scope that has no readable
  // folder name falls back to 'Vendor folder', which cannot be told apart
  // from a folder with that name and so stays data.
  const ASK_SCOPE_COPY = Object.freeze({
    agreement: 'Current agreement',
    corpus: 'Enrolled accessible corpus'
  });

  function askScopeLabel(kind, label) {
    return Object.prototype.hasOwnProperty.call(ASK_SCOPE_COPY, kind)
      ? rebuilt(label, copy(ASK_SCOPE_COPY[kind]))
      : label;
  }

  // The service worker names a piece of answer evidence by its assertion
  // type with the hyphens removed, or as 'Current contract evidence'; any
  // other claim is shown as given.
  const ANSWER_CLAIM_COPY = new Set([
    'signed date', 'effective date', 'expiration date', 'termination date', 'renewal',
    'notice window', 'notice deadline', 'delivery method', 'written address',
    'Current contract evidence'
  ]);

  function answerClaimLabel(claim) {
    return ANSWER_CLAIM_COPY.has(claim) ? copy(claim) : claim;
  }

  // The ask engine explains each trust state with one fixed sentence.
  const ANSWER_TRUST_EXPLANATION_COPY = Object.freeze({
    accepted: 'The complete current governing evidence supports this conclusion.',
    'review-required': 'Current governing evidence contains a conflict requiring human review.',
    ambiguous: 'The current evidence does not completely support a material conclusion.'
  });

  function answerTrustExplanation(trust) {
    return Object.prototype.hasOwnProperty.call(ANSWER_TRUST_EXPLANATION_COPY, trust.state)
      ? rebuilt(trust.explanation, copy(ANSWER_TRUST_EXPLANATION_COPY[trust.state]))
      : trust.explanation;
  }

  // The conflict and gap details the service worker and the ask engine
  // write themselves, by the label the composer gives their type.
  const ANSWER_DETAIL_TEXT_COPY = Object.freeze({
    'Evidence conflict': 'Current governing evidence contains a conflict requiring review.',
    'Source inaccessible': 'One or more relevant current sources could not be certified for this answer.',
    'Incomplete evidence': 'The current evidence does not completely support a material conclusion.'
  });

  function answerDetailText(row) {
    return Object.prototype.hasOwnProperty.call(ANSWER_DETAIL_TEXT_COPY, row.label)
      ? rebuilt(row.detail, copy(ANSWER_DETAIL_TEXT_COPY[row.label]))
      : row.detail;
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return Object.freeze({
      left: left,
      top: top,
      width: width,
      height: height,
      right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width,
      bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height
    });
  }

  function normalizeProjectionRect(rect) {
    if (!rect || typeof rect !== 'object' || Array.isArray(rect)) return null;
    const keys = Reflect.ownKeys(rect);
    const allowedFour = ['height', 'left', 'top', 'width'];
    const allowedSix = ['bottom', 'height', 'left', 'right', 'top', 'width'];
    const sorted = keys.slice().sort();
    const matchesFour = sorted.length === allowedFour.length &&
      sorted.every(function (key, index) { return key === allowedFour[index]; });
    const matchesSix = sorted.length === allowedSix.length &&
      sorted.every(function (key, index) { return key === allowedSix[index]; });
    if (keys.some(function (key) { return typeof key !== 'string'; }) || (!matchesFour && !matchesSix)) {
      return null;
    }
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    const right = left + width;
    const bottom = top + height;
    if (![left, top, width, height, right, bottom].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return Object.freeze({ left: left, top: top, width: width, height: height, right: right, bottom: bottom });
  }

  function normalizeSemanticIdentity(value) {
    if (!hasExactOwnKeys(value, ['kind', 'id']) || !PROJECTION_IDENTITY_KINDS.includes(value.kind) ||
        typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 512) {
      return null;
    }
    return Object.freeze({ kind: value.kind, id: value.id });
  }

  function sameSemanticIdentity(left, right) {
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  function freezeProjectionSnapshot(value) {
    return Object.freeze({
      generation: value.generation,
      contextEpoch: value.contextEpoch,
      bindingEpoch: value.bindingEpoch,
      status: value.status,
      contextKind: value.contextKind,
      reason: value.reason,
      semanticIdentity: value.semanticIdentity,
      targetRect: value.targetRect,
      markRect: value.markRect,
      anchored: value.anchored === true,
      disposed: value.disposed === true
    });
  }

  function intersects(left, right, clearance) {
    const amount = Number(clearance) || 0;
    return left.left < right.right + amount &&
      left.right > right.left - amount &&
      left.top < right.bottom + amount &&
      left.bottom > right.top - amount;
  }

  function isVisibleControl(windowRef, element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const rect = normalizeRect(element.getBoundingClientRect());
    if (!rect) return false;
    if (element.hidden || element.disabled) return false;
    if (typeof windowRef.getComputedStyle === 'function') {
      const style = windowRef.getComputedStyle(element);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  function candidateRect(viewport, lens, corner) {
    const left = corner.endsWith('right')
      ? viewport.width - VIEWPORT_INSET - lens.width
      : VIEWPORT_INSET;
    const top = corner.startsWith('bottom')
      ? viewport.height - VIEWPORT_INSET - lens.height
      : VIEWPORT_INSET;
    return Object.freeze({
      left: left,
      top: top,
      width: lens.width,
      height: lens.height,
      right: left + lens.width,
      bottom: top + lens.height
    });
  }

  function isFocusable(windowRef, element) {
    if (!element || !element.isConnected || element.disabled || element.hidden) return false;
    if (typeof element.focus !== 'function') return false;
    if (typeof windowRef.getComputedStyle === 'function') {
      const style = windowRef.getComputedStyle(element);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  class SkopeoShell {
    constructor(options) {
      const settings = options || {};
      if (!settings.document || typeof settings.document.createElement !== 'function') {
        throw new TypeError('createShell requires an injected document');
      }
      if (!settings.window || typeof settings.window.addEventListener !== 'function') {
        throw new TypeError('createShell requires an injected window');
      }
      if (!isPositiveInteger(settings.generation)) {
        throw new TypeError('createShell requires a positive generation');
      }

      this.document = settings.document;
      this.window = settings.window;
      this.generation = settings.generation;
      this.onRequestClose = typeof settings.onRequestClose === 'function' ? settings.onRequestClose : function () {};
      this.onRequestKill = typeof settings.onRequestKill === 'function' ? settings.onRequestKill : function () {};
      this.onContractWithdraw = typeof settings.onContractWithdraw === 'function'
        ? settings.onContractWithdraw
        : null;
      this.onEscapeConsumed = typeof settings.onEscapeConsumed === 'function' ? settings.onEscapeConsumed : function () {};
      this.onAdaptiveAction = typeof settings.onAdaptiveAction === 'function'
        ? settings.onAdaptiveAction
        : function () {};
      this.onCorpusAction = typeof settings.onCorpusAction === 'function'
        ? settings.onCorpusAction
        : function () {};
      this.ledger = settings.resourceLedger &&
        typeof settings.resourceLedger.acquire === 'function' &&
        typeof settings.resourceLedger.release === 'function' &&
        typeof settings.resourceLedger.snapshot === 'function'
        ? settings.resourceLedger
        : new LocalResourceLedger();

      this._allowControlledFixture = settings.allowControlledFixture === true;
      this._fixtureToken = settings.fixtureToken && typeof settings.fixtureToken === 'object'
        ? settings.fixtureToken
        : null;
      this._fixtureEnabled = false;
      this._disposed = false;
      this._mounted = false;
      this._preparedToken = null;
      this._preparedPlacement = null;
      this._host = null;
      this._shadow = null;
      this._style = null;
      this._envelope = null;
      this._languageHandle = null;
      this._surface = null;
      this._liveRegion = null;
      this._attention = null;
      this._handles = [];
      this._buildingSurfaceScope = null;
      this._activeSurfaceScope = null;
      this._anchoredScope = null;
      this._focusedScope = null;
      this._rootHandle = null;
      this._popoverHandle = null;
      this._announcementTimerHandle = null;
      this._announcementPendingHandle = null;
      this._announcementTimerId = null;
      this._pendingAnnouncement = null;
      this._currentPlacement = null;
      this._geometryInvalidationListener = null;
      this._richGeometryFrameId = null;
      this._richGeometryFrameHandle = null;
      this._unsafeLayoutKillRequested = false;
      this._keydownListener = null;
      this._keydownHandle = null;
      this._ambientFocusOrigin = null;
      this._focusOrigin = null;
      this._focusedOrigin = null;
      this._focusedFallback = null;
      this._gateOrigin = null;
      this._lastEscapeAt = null;
      this._consequenceExitPending = false;
      this._projectionContextEpoch = 0;
      this._projectionBindingEpoch = 0;
      this._projectionState = Object.freeze({ status: 'ambient', contextKind: null, reason: null });
      this._projectionAnnouncementKey = null;
      this._semanticAnchorScope = null;
      this._adaptiveAuthority = null;
      this._adaptiveModel = null;
      this._adaptiveRenderedAtoms = Object.freeze([]);
      this._corpusScope = null;
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._contractAuthority = null;
      this._contractModel = null;
      this._contractOnAction = null;
      this._projectionSnapshot = freezeProjectionSnapshot({
        generation: this.generation,
        contextEpoch: 0,
        bindingEpoch: 0,
        status: 'ambient',
        contextKind: null,
        reason: null,
        semanticIdentity: null,
        targetRect: null,
        markRect: null,
        anchored: false,
        disposed: false
      });
    }

    _acquire(category, cleanup, detail) {
      const handle = this.ledger.acquire(category, cleanup, detail);
      this._handles.push(handle);
      return handle;
    }

    _release(handle, runCleanup) {
      if (!handle) return;
      try {
        this.ledger.release(handle, {
          cleanup: runCleanup !== false,
          suppressCleanupError: true
        });
      } catch (_error) {
        // Teardown is best-effort but continues through every owned category.
      }
      const index = this._handles.indexOf(handle);
      if (index >= 0) this._handles.splice(index, 1);
      if (this._rootHandle === handle) this._rootHandle = null;
      if (this._popoverHandle === handle) this._popoverHandle = null;
      if (this._announcementTimerHandle === handle) this._announcementTimerHandle = null;
      if (this._announcementPendingHandle === handle) this._announcementPendingHandle = null;
      if (this._keydownHandle === handle) this._keydownHandle = null;
      if (this._richGeometryFrameHandle === handle) {
        this._richGeometryFrameHandle = null;
        this._richGeometryFrameId = null;
      }
    }

    _hostControls() {
      const controls = [];
      if (typeof this.document.querySelectorAll === 'function') {
        for (const node of Array.from(this.document.querySelectorAll(INTERACTIVE_SELECTOR) || [])) {
          if (this._host && (node === this._host || (typeof this._host.contains === 'function' && this._host.contains(node)))) {
            continue;
          }
          if (isVisibleControl(this.window, node) && !controls.includes(node)) controls.push(node);
        }
      }
      const active = this.document.activeElement;
      if (active &&
          active !== this.document.body &&
          active !== this.document.documentElement &&
          (!this._host || (active !== this._host && !this._host.contains(active))) &&
          isVisibleControl(this.window, active) &&
          !controls.includes(active)) {
        controls.push(active);
      }
      return controls;
    }

    _choosePlacement() {
      const width = Number(this.window.innerWidth);
      const height = Number(this.window.innerHeight);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      const viewport = { width: width, height: height };
      const controls = this._hostControls().map(function (node) {
        return normalizeRect(node.getBoundingClientRect());
      }).filter(Boolean);
      const lensOptions = width < 480 ? [COMPACT_LENS] : [FULL_LENS, COMPACT_LENS];

      for (const lens of lensOptions) {
        if (lens.width > width - VIEWPORT_INSET * 2 || lens.height > height - VIEWPORT_INSET * 2) continue;
        for (const corner of CORNERS) {
          const rect = candidateRect(viewport, lens, corner);
          const collides = controls.some(function (controlRect) {
            return intersects(rect, controlRect, HOST_CLEARANCE);
          });
          if (!collides) {
            return Object.freeze({
              mode: lens.mode,
              width: lens.width,
              height: lens.height,
              corner: corner,
              rect: rect
            });
          }
        }
      }
      return null;
    }

    prepareAmbient() {
      if (this._disposed || this._mounted) return null;
      const placement = this._choosePlacement();
      if (!placement) {
        this._preparedToken = null;
        this._preparedPlacement = null;
        return null;
      }
      const token = Object.freeze({});
      this._preparedToken = token;
      this._preparedPlacement = placement;
      return token;
    }

    getPreparedPlacementMode(preparedPlacement) {
      if (this._disposed || this._mounted) return null;
      if (!preparedPlacement || preparedPlacement !== this._preparedToken || !this._preparedPlacement) {
        return null;
      }
      const mode = this._preparedPlacement.mode;
      return mode === 'full' || mode === 'compact' ? mode : null;
    }

    mountAmbient(preparedPlacement) {
      if (this._disposed || this._mounted) return false;
      if (!preparedPlacement || preparedPlacement !== this._preparedToken || !this._preparedPlacement) return false;

      this._preparedToken = null;
      this._preparedPlacement = null;

      let placement = null;
      try {
        placement = this._choosePlacement();
      } catch (_error) {
        return false;
      }
      if (!placement) return false;

      const host = createElement(this.document, 'div', '', {
        'data-skopeo-shell-root': 'true',
        'data-skopeo-generation': this.generation,
        'data-attention': ATTENTION.AMBIENT
      });
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.pointerEvents = 'none';
      host.style.zIndex = '2147483647';
      host.style.margin = '0';
      host.style.padding = '0';
      host.style.border = '0';
      host.style.background = 'transparent';

      let shadow;
      try {
        shadow = host.attachShadow({ mode: 'closed' });
      } catch (_error) {
        return false;
      }

      const style = createElement(this.document, 'style', '', {}, SHELL_CSS);
      const envelope = createElement(this.document, 'div', 'skopeo-envelope');
      envelope.style.pointerEvents = 'none';
      const surface = createElement(this.document, 'div', 'skopeo-surface');
      surface.style.pointerEvents = 'none';
      const live = createElement(this.document, 'div', 'skopeo-live', {
        'aria-live': 'polite',
        'aria-atomic': 'true'
      });
      announcementText(live, copy(COPY.ambientAnnouncement));

      envelope.appendChild(surface);
      envelope.appendChild(live);
      shadow.appendChild(style);
      shadow.appendChild(envelope);

      try {
        this.document.documentElement.appendChild(host);
      } catch (_error) {
        return false;
      }

      this._host = host;
      this._shadow = shadow;
      this._style = style;
      this._envelope = envelope;
      this._surface = surface;
      this._liveRegion = live;
      this._mounted = true;
      this._attention = ATTENTION.AMBIENT;
      this._ambientFocusOrigin = this.document.activeElement;
      this._currentPlacement = placement;
      this._rootHandle = this._acquire('roots', function () {
        if (host && typeof host.remove === 'function') host.remove();
      }, 'one Shadow host');

      if (typeof host.showPopover === 'function') {
        try {
          host.setAttribute('popover', 'manual');
          host.showPopover();
          this._popoverHandle = this._acquire('popoverTopLayer', function () {
            if (typeof host.hidePopover === 'function') host.hidePopover();
          }, 'manual popover top layer');
        } catch (_error) {
          host.removeAttribute('popover');
          this._popoverHandle = null;
        }
      }

      const ambientScope = this._buildSurfaceScope(ATTENTION.AMBIENT, placement);
      if (!ambientScope || !this._commitSurfaceScope(ambientScope)) {
        this.destroy('ambient-render-failed');
        return false;
      }
      this._applyPlacement(placement);
      this._installGeometryInvalidationListeners();
      this._installKeyboardListener();
      this._watchLanguage();
      return true;
    }

    // Follows the FSB language: a change rewrites this shell's copy in place,
    // with no render, so focus, scroll, typed text and announcements stay.
    _watchLanguage() {
      const locale = hudLocale();
      if (!locale || this._languageHandle || this._disposed) return;
      const shell = this;
      if (typeof locale.onChange === 'function') {
        const release = locale.onChange(function () { shell._relocalize(); });
        if (typeof release === 'function') {
          this._languageHandle = this._acquire('listeners', release, 'FSB language change');
        }
      }
      this._syncLanguage();
      if (typeof locale.bootOnce === 'function') {
        Promise.resolve().then(function () { return locale.bootOnce(); })
          .then(function () { shell._relocalize(); }, function () {});
      }
    }

    _syncLanguage() {
      const locale = hudLocale();
      if (!locale || !this._envelope) return;
      const code = locale.current();
      if (typeof code === 'string' && code && this._envelope.getAttribute('lang') !== code) {
        this._envelope.setAttribute('lang', code);
      }
    }

    _relocalize() {
      if (this._disposed || !this._shadow) return;
      relocalizeTree(this._shadow);
      this._syncLanguage();
    }

    _installGeometryInvalidationListeners() {
      if (this._geometryInvalidationListener || !this._mounted) return;
      const shell = this;
      const listener = function () {
        if (shell._disposed || !shell._mounted) return;
        shell._revalidateGeometry();
      };
      this._geometryInvalidationListener = listener;

      const register = function (target, type, options, detail) {
        if (!target || typeof target.addEventListener !== 'function' ||
            typeof target.removeEventListener !== 'function') return false;
        target.addEventListener(type, listener, options);
        shell._acquire('listeners', function () {
          target.removeEventListener(type, listener, options);
        }, detail);
        return true;
      };

      register(this.window, 'resize', undefined, 'window resize geometry invalidation');
      register(this.document, 'scroll', true, 'document capture scroll geometry invalidation');
      const visualViewport = this.window.visualViewport;
      register(visualViewport, 'resize', undefined, 'visual viewport resize geometry invalidation');
      register(visualViewport, 'scroll', undefined, 'visual viewport scroll geometry invalidation');
    }

    _installKeyboardListener() {
      if (this._keydownListener || !this._mounted) return;
      const shell = this;
      this._keydownListener = function (event) {
        if (shell._disposed || !shell._mounted || !event) return;
        if (event.key === 'Tab' && shell._attention === ATTENTION.INTERSTITIAL) {
          shell._trapGateTab(event);
          return;
        }
        if (event.key !== 'Escape' || event.repeat || event.isComposing || event.isTrusted !== true) return;

        if (shell._attention === ATTENTION.INTERSTITIAL &&
            shell._activeSurfaceScope && shell._activeSurfaceScope.adaptiveModel &&
            shell._activeSurfaceScope.adaptiveModel.consequence) {
          if (!shell._requestAdaptiveConsequenceCancel(
            shell._activeSurfaceScope.adaptiveModel
          )) return;
          if (typeof event.preventDefault === 'function') event.preventDefault();
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          return;
        }

        const timestamp = shell.window.performance && typeof shell.window.performance.now === 'function'
          ? shell.window.performance.now()
          : Date.now();
        if (shell._lastEscapeAt !== null && timestamp - shell._lastEscapeAt <= DOUBLE_ESCAPE_MS) {
          shell._lastEscapeAt = null;
          if (typeof event.preventDefault === 'function') event.preventDefault();
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          shell.onRequestKill({
            generation: shell.generation,
            reason: 'escape-double',
            state: shell._attention
          });
          return;
        }

        const from = shell._attention;
        if (!shell.back()) return;
        shell._lastEscapeAt = timestamp;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        shell.onEscapeConsumed({
          generation: shell.generation,
          timestamp: timestamp,
          from: from,
          to: shell._attention
        });
      };
      this.window.addEventListener('keydown', this._keydownListener);
      this._keydownHandle = this._acquire('listeners', function () {
        shell.window.removeEventListener('keydown', shell._keydownListener);
        shell._keydownListener = null;
      }, 'single shell keyboard boundary');
    }

    _listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      const shell = this;
      return this._acquireSurface('listeners', function () {
        target.removeEventListener(type, listener, options);
      }, type + ' listener');
    }

    _pointerSurface(node) {
      node.style.pointerEvents = 'auto';
      return this._acquireSurface('pointerSurfaces', undefined, node.className || node.localName || 'control');
    }

    _button(className, label, visibleText, handler) {
      const button = createElement(this.document, 'button', 'skopeo-control ' + className, {
        type: 'button',
        'aria-label': label
      }, visibleText);
      this._pointerSurface(button);
      if (typeof handler === 'function') {
        this._listen(button, 'click', function (event) {
          if (!event || event.isTrusted !== true) return;
          handler(event);
        });
      }
      return button;
    }

    _createSurfaceScope(attention) {
      return {
        attention: attention,
        nodes: [],
        handles: [],
        disposed: false,
        staged: false
      };
    }

    _acquireSurface(category, cleanup, detail, scope) {
      const owner = scope || this._buildingSurfaceScope;
      if (!owner || owner.disposed) throw new Error('Surface resource acquired without a live render scope');
      const handle = this.ledger.acquire(category, cleanup, detail);
      owner.handles.push(handle);
      return handle;
    }

    _releaseSurfaceHandle(handle, runCleanup) {
      if (!handle) return;
      try {
        this.ledger.release(handle, {
          cleanup: runCleanup !== false,
          suppressCleanupError: true
        });
      } catch (_error) {
        // A failed cleanup cannot stop the remainder of a scoped teardown.
      }
    }

    _disposeSurfaceScope(scope) {
      if (!scope || scope.disposed) return false;
      if (this._activeSurfaceScope === scope &&
          (scope.attention === ATTENTION.FOCUSED || scope.attention === ATTENTION.INTERSTITIAL)) {
        this._cancelRichGeometryFrame();
      }
      scope.disposed = true;
      const handles = scope.handles.slice().reverse();
      scope.handles.length = 0;
      for (const handle of handles) this._releaseSurfaceHandle(handle, true);
      for (const node of scope.nodes.slice()) {
        if (node && node.parentNode === this._surface) this._surface.removeChild(node);
      }
      if (this._activeSurfaceScope === scope) this._activeSurfaceScope = null;
      if (this._anchoredScope === scope) this._anchoredScope = null;
      if (this._focusedScope === scope) this._focusedScope = null;
      return true;
    }

    _clearSurface() {
      if (!this._surface) return;
      this._disposeSemanticAnchorScope();
      if (this._activeSurfaceScope) this._disposeSurfaceScope(this._activeSurfaceScope);
      const corpusNode = this._corpusScope && !this._corpusScope.disposed
        ? this._corpusScope.node
        : null;
      for (const node of Array.from(this._surface.childNodes || [])) {
        if (node !== corpusNode) this._surface.removeChild(node);
      }
    }

    _suspendSurfaceScope() {
      const scope = this._activeSurfaceScope;
      if (!this._surface || !scope || scope.disposed) return null;
      for (const node of scope.nodes) {
        if (node.parentNode === this._surface) this._surface.removeChild(node);
      }
      this._activeSurfaceScope = null;
      return scope;
    }

    _restoreSurfaceScope(scope) {
      if (!this._surface || !scope || scope.disposed) return false;
      if ((scope.attention === ATTENTION.AMBIENT || scope.attention === ATTENTION.ANCHORED) &&
          (!this._currentPlacement || !this._applyPlacement(this._currentPlacement, scope))) {
        return this._requestUnsafeLayoutKill();
      }
      this._clearSurface();
      for (const node of scope.nodes) this._surface.appendChild(node);
      if (hudLocale()) for (const node of scope.nodes) relocalizeTree(node);
      this._activeSurfaceScope = scope;
      this._attention = scope.attention;
      this._host.setAttribute('data-attention', scope.attention);
      if (scope.adaptiveModel) {
        this._adaptiveModel = scope.adaptiveModel;
        this._adaptiveRenderedAtoms = scope.renderedAtoms || Object.freeze([]);
      }
      this._syncRichGeometryFrame();
      return true;
    }

    _discardSuspendedScopes() {
      const scopes = [this._focusedScope, this._anchoredScope];
      this._focusedScope = null;
      this._anchoredScope = null;
      for (const scope of scopes) {
        if (scope && scope !== this._activeSurfaceScope) this._disposeSurfaceScope(scope);
      }
    }

    _ownsNode(node) {
      return !!(node && this._host && typeof this._host.contains === 'function' && this._host.contains(node));
    }

    _deepActiveElement() {
      if (this._shadow && this._shadow.activeElement) return this._shadow.activeElement;
      return this.document.activeElement || null;
    }

    _safeFocus(node) {
      if (node === this.document.body || node === this.document.documentElement) return false;
      if (!isFocusable(this.window, node)) return false;
      try {
        node.focus({ preventScroll: true });
        const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
        if (root && 'activeElement' in Object(root)) return root.activeElement === node;
        return this._deepActiveElement() === node;
      } catch (_error) {
        return false;
      }
    }

    _trapGateTab(event) {
      const gate = this._surface && this._surface.querySelector('[data-skopeo-primitive="gate"]');
      if (!gate) return false;
      const controls = Array.from(gate.querySelectorAll('button') || []).filter(function (node) {
        return isFocusable(node.ownerDocument.defaultView, node);
      });
      if (!controls.length) return false;
      const active = this._deepActiveElement();
      const first = controls[0];
      const last = controls[controls.length - 1];
      let destination = null;
      if (event.shiftKey && active === first) destination = last;
      else if (!event.shiftKey && active === last) destination = first;
      else if (!controls.includes(active)) destination = first;
      if (!destination) return false;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      return this._safeFocus(destination);
    }

    _rail(placement) {
      const rail = createElement(this.document, 'div', 'skopeo-rail', {
        'data-skopeo-primitive': 'rail',
        role: 'group',
        'aria-label': copy('Skopeo ambient rail')
      });
      rail.style.pointerEvents = 'none';
      if (placement && placement.corner.endsWith('left')) {
        rail.style.left = '16px';
        rail.style.right = '';
      } else {
        rail.style.right = '16px';
        rail.style.left = '';
      }
      const line = createElement(this.document, 'span', 'skopeo-rail-line', { 'aria-hidden': 'true' });
      const ticks = createElement(this.document, 'span', 'skopeo-rail-ticks', { 'aria-hidden': 'true' });
      rail.appendChild(line);
      rail.appendChild(ticks);
      return rail;
    }

    _applyPlacement(placement, scope) {
      if (!placement || (scope && scope.disposed) || (!scope && !this._surface)) return false;
      const query = scope
        ? selector => this._scopeQuery(scope, selector)
        : selector => this._surface.querySelector(selector);
      let applied = false;
      const lens = query('.skopeo-lens');
      if (lens) {
        lens.setAttribute('data-placement-corner', placement.corner);
        lens.setAttribute('data-placement-mode', placement.mode);
        lens.style.width = String(placement.width) + 'px';
        lens.style.top = '';
        lens.style.right = '';
        lens.style.bottom = '';
        lens.style.left = '';
        if (placement.corner.startsWith('top')) lens.style.top = '16px';
        else lens.style.bottom = '16px';
        if (placement.corner.endsWith('right')) lens.style.right = '16px';
        else lens.style.left = '16px';
        applied = true;
      }

      const rail = query('[data-skopeo-primitive="rail"]');
      if (rail) {
        rail.style.left = '';
        rail.style.right = '';
        if (placement.corner.endsWith('right')) rail.style.right = '16px';
        else rail.style.left = '16px';
        applied = true;
      }
      const entityRow = query('.skopeo-adaptive-entity-row');
      if (entityRow) {
        entityRow.style.top = '';
        entityRow.style.right = '';
        entityRow.style.bottom = '';
        entityRow.style.left = '';
        if (placement.corner.startsWith('top')) entityRow.style.top = '64px';
        else entityRow.style.bottom = '64px';
        if (placement.corner.endsWith('right')) entityRow.style.right = '16px';
        else entityRow.style.left = '16px';
        applied = true;
      }
      if (!scope && this._corpusScope && !this._corpusScope.disposed &&
          this._placeCorpusRegion(this._corpusScope.node)) applied = true;
      return applied;
    }

    _buildSurfaceScope(level, placement) {
      const scope = this._createSurfaceScope(level);
      this._buildingSurfaceScope = scope;
      try {
        let nodes = null;
        if (level === ATTENTION.AMBIENT) nodes = this._renderAmbient(placement || this._currentPlacement);
        else if (level === ATTENTION.ANCHORED) nodes = this._renderAnchored();
        else if (level === ATTENTION.FOCUSED) nodes = this._renderFocused();
        else if (level === ATTENTION.INTERSTITIAL) nodes = this._renderInterstitial();
        if (!Array.isArray(nodes) || !nodes.length) throw new Error('Attention renderer returned no surface nodes');
        scope.nodes = nodes;
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    _scopeQuery(scope, selector) {
      if (!scope || !selector) return null;
      for (const node of scope.nodes) {
        if (node && typeof node.matches === 'function' && node.matches(selector)) return node;
        if (node && typeof node.querySelector === 'function') {
          const match = node.querySelector(selector);
          if (match) return match;
        }
      }
      return null;
    }

    _stageAttention(level) {
      const scope = this._buildSurfaceScope(level, this._currentPlacement);
      if (!scope || !this._surface) return null;
      scope.staged = true;
      for (const node of scope.nodes) {
        node.setAttribute('data-skopeo-staging', 'true');
        node.setAttribute('aria-hidden', 'true');
        node.style.visibility = 'hidden';
        this._surface.appendChild(node);
      }
      const selector = level === ATTENTION.FOCUSED ? '.skopeo-focused-card' : '.skopeo-gate';
      const candidate = this._scopeQuery(scope, selector);
      const requiredControl = this._requiredHostControl();
      return {
        scope: scope,
        candidateRect: candidate ? normalizeRect(candidate.getBoundingClientRect()) : null,
        hostControl: requiredControl,
        hostRect: requiredControl ? normalizeRect(requiredControl.getBoundingClientRect()) : null
      };
    }

    _requiredHostControl() {
      const controls = this._hostControls();
      const eligible = function (node) {
        return !!(node && node.isConnected && controls.includes(node));
      };
      const active = this._deepActiveElement();
      if (!this._ownsNode(active) && eligible(active)) return active;
      if (eligible(this._ambientFocusOrigin)) return this._ambientFocusOrigin;
      return null;
    }

    _candidateIsSafe(candidateRectValue, hostRect) {
      const candidate = normalizeRect(candidateRectValue);
      const width = Number(this.window.innerWidth);
      const height = Number(this.window.innerHeight);
      if (!candidate || !Number.isFinite(width) || !Number.isFinite(height)) return false;
      if (candidate.left < VIEWPORT_INSET || candidate.top < VIEWPORT_INSET ||
          candidate.right > width - VIEWPORT_INSET || candidate.bottom > height - VIEWPORT_INSET) {
        return false;
      }
      return !hostRect || !intersects(candidate, hostRect, HOST_CLEARANCE);
    }

    _currentRichGeometry() {
      let selector = null;
      if (this._attention === ATTENTION.FOCUSED) selector = '.skopeo-focused-card';
      else if (this._attention === ATTENTION.INTERSTITIAL) selector = '.skopeo-gate';
      if (!selector || !this._surface) return null;

      const candidate = this._surface.querySelector(selector);
      const requiredControl = this._requiredHostControl();
      return {
        candidate: candidate,
        candidateRect: candidate ? normalizeRect(candidate.getBoundingClientRect()) : null,
        hostControl: requiredControl,
        hostRect: requiredControl ? normalizeRect(requiredControl.getBoundingClientRect()) : null
      };
    }

    _currentRichGeometryIsSafe() {
      const geometry = this._currentRichGeometry();
      return !!(geometry && this._candidateIsSafe(geometry.candidateRect, geometry.hostRect));
    }

    _isRichAttention() {
      return this._attention === ATTENTION.FOCUSED || this._attention === ATTENTION.INTERSTITIAL;
    }

    _cancelRichGeometryFrame() {
      const frameId = this._richGeometryFrameId;
      const frameHandle = this._richGeometryFrameHandle;
      this._richGeometryFrameId = null;
      this._richGeometryFrameHandle = null;
      if (frameHandle) {
        this._release(frameHandle, true);
        return true;
      }
      if (frameId !== null && typeof this.window.cancelAnimationFrame === 'function') {
        try {
          this.window.cancelAnimationFrame(frameId);
        } catch (_error) {
          // Frame cancellation is best-effort once ownership has been cleared.
        }
        return true;
      }
      return false;
    }

    _syncRichGeometryFrame() {
      if (this._disposed || !this._mounted || this._unsafeLayoutKillRequested || !this._isRichAttention()) {
        this._cancelRichGeometryFrame();
        return false;
      }
      if (this._richGeometryFrameId !== null && this._richGeometryFrameHandle) return true;
      if (typeof this.window.requestAnimationFrame !== 'function' ||
          typeof this.window.cancelAnimationFrame !== 'function') {
        return this._requestUnsafeLayoutKill();
      }

      const shell = this;
      let frameId = null;
      try {
        frameId = this.window.requestAnimationFrame(function () {
          if (shell._richGeometryFrameId !== frameId) return;
          const frameHandle = shell._richGeometryFrameHandle;
          shell._richGeometryFrameId = null;
          shell._richGeometryFrameHandle = null;
          if (frameHandle) shell._release(frameHandle, false);
          if (shell._disposed || !shell._mounted || shell._unsafeLayoutKillRequested ||
              !shell._isRichAttention()) return;
          shell._revalidateGeometry();
          if (!shell._disposed && shell._mounted && !shell._unsafeLayoutKillRequested &&
              shell._isRichAttention()) shell._syncRichGeometryFrame();
        });
      } catch (_error) {
        return this._requestUnsafeLayoutKill();
      }
      if (frameId === null || frameId === undefined) return this._requestUnsafeLayoutKill();

      this._richGeometryFrameId = frameId;
      try {
        this._richGeometryFrameHandle = this._acquire('animationFrames', function () {
          shell.window.cancelAnimationFrame(frameId);
        }, 'rich geometry revalidation frame');
      } catch (_error) {
        this._richGeometryFrameId = null;
        try {
          this.window.cancelAnimationFrame(frameId);
        } catch (_cancelError) {
          // Frame ownership is already cleared before requesting terminal cleanup.
        }
        return this._requestUnsafeLayoutKill();
      }
      return true;
    }

    _requestUnsafeLayoutKill() {
      if (this._unsafeLayoutKillRequested) return false;
      this._unsafeLayoutKillRequested = true;
      this._cancelRichGeometryFrame();
      this.onRequestKill({
        generation: this.generation,
        reason: 'unsafe-layout',
        state: this._attention
      });
      return false;
    }

    _requestContractWithdraw(reason) {
      if (typeof this.onContractWithdraw === 'function') {
        try {
          return this.onContractWithdraw(reason) === true;
        } catch (_error) {
          this.withdrawCorpus();
          return false;
        }
      }
      return this.withdrawCorpus();
    }

    _revalidateGeometry() {
      if (this._disposed || !this._mounted || this._unsafeLayoutKillRequested) return false;

      if (this._corpusScope && this._corpusScope.contract === true &&
          !this._corpusScope.disposed && this._corpusScope.node) {
        const contractCertificate = this._contractGeometryCertificate();
        if (!contractCertificate) this._requestContractWithdraw('unsafe-geometry');
        else this._applyContractGeometry(this._corpusScope.node, contractCertificate);
      }

      let next = null;
      try {
        next = this._choosePlacement();
      } catch (_error) {
        next = null;
      }
      if (!next) return this._requestUnsafeLayoutKill();
      this._currentPlacement = next;

      let unwindCount = 0;
      while (this._attention === ATTENTION.FOCUSED || this._attention === ATTENTION.INTERSTITIAL) {
        if (this._currentRichGeometryIsSafe()) return true;
        if (unwindCount >= 2 || !this.back()) return this._requestUnsafeLayoutKill();
        unwindCount += 1;
      }

      if (this._attention !== ATTENTION.AMBIENT && this._attention !== ATTENTION.ANCHORED) {
        return this._requestUnsafeLayoutKill();
      }
      if (!this._applyPlacement(next)) return this._requestUnsafeLayoutKill();
      return true;
    }

    _commitSurfaceScope(scope) {
      if (!scope || scope.disposed || !this._surface || !this._host) return false;
      for (const node of scope.nodes) {
        if (node.parentNode !== this._surface) this._surface.appendChild(node);
        if (scope.staged) {
          node.removeAttribute('data-skopeo-staging');
          node.removeAttribute('aria-hidden');
          node.style.visibility = '';
        }
      }
      scope.staged = false;
      this._activeSurfaceScope = scope;
      this._attention = scope.attention;
      this._host.setAttribute('data-attention', scope.attention);
      if (scope.adaptiveModel) {
        this._adaptiveModel = scope.adaptiveModel;
        this._adaptiveRenderedAtoms = scope.renderedAtoms || Object.freeze([]);
      }
      this._syncRichGeometryFrame();
      return true;
    }

    _commitStagedAttention(staged) {
      return !!(staged && this._commitSurfaceScope(staged.scope));
    }

    _rejectStagedAttention(staged) {
      if (staged && staged.scope) this._disposeSurfaceScope(staged.scope);
      this._announce(copy(COPY.unsafeView), true);
      return false;
    }

    _renderAmbient(placement) {
      const ambient = createElement(this.document, 'div', 'skopeo-ambient', {
        role: 'region',
        'aria-label': copy('Skopeo ambient HUD')
      });
      const lens = createElement(this.document, 'div', 'skopeo-lens', {
        'data-placement-corner': placement.corner,
        'data-placement-mode': placement.mode
      });
      lens.style.pointerEvents = 'none';
      const glyph = createElement(this.document, 'span', 'skopeo-active-glyph', { 'aria-hidden': 'true' });
      const label = createElement(this.document, 'span', 'skopeo-lens-label', {}, copy(COPY.ambient));
      const metadata = createElement(this.document, 'span', 'skopeo-lens-meta', {}, copy('Esc Esc'));
      const shell = this;
      const close = this._button('skopeo-close', copy(COPY.turnOff), '×', function () {
        shell.onRequestClose({
          generation: shell.generation,
          reason: 'close',
          state: ATTENTION.AMBIENT
        });
      });
      close.style.width = '32px';
      close.style.height = '32px';
      close.style.pointerEvents = 'auto';
      lens.appendChild(glyph);
      lens.appendChild(label);
      lens.appendChild(metadata);
      lens.appendChild(close);
      ambient.appendChild(lens);
      ambient.appendChild(this._rail(placement));
      return [ambient];
    }

    _renderAnchored() {
      const shell = this;
      const row = createElement(this.document, 'div', 'skopeo-fixture-row');
      const anchor = this._button('skopeo-anchor', copy('Open anchor mark demo'), copy(COPY.anchor), function () {
        shell.render(ATTENTION.FOCUSED, {});
      });
      anchor.setAttribute('data-skopeo-primitive', 'anchor');
      const chip = this._button('skopeo-chip skopeo-entity-label', copy('Open entity chip demo'), copy(COPY.entity), function () {
        shell.render(ATTENTION.FOCUSED, {});
      });
      chip.setAttribute('data-skopeo-primitive', 'chip');
      const rail = this._rail(this._currentPlacement);
      const halo = createElement(this.document, 'div', 'skopeo-halo', {
        'data-skopeo-primitive': 'halo',
        'aria-hidden': 'true'
      });
      halo.style.pointerEvents = 'none';
      const anomaly = createElement(this.document, 'div', 'skopeo-anomaly-payload', {
        role: 'group',
        'aria-label': copy('Anomaly signal demo')
      });
      anomaly.appendChild(createElement(this.document, 'span', 'skopeo-anomaly-label', {}, copy(COPY.anomaly)));
      row.appendChild(anchor);
      row.appendChild(chip);
      row.appendChild(rail);
      row.appendChild(halo);
      row.appendChild(anomaly);
      const backRow = createElement(this.document, 'div', 'skopeo-back-row');
      backRow.appendChild(this._button('skopeo-back', copy(COPY.backAmbient), copy(COPY.backAmbient), function () {
        shell.back();
      }));
      return [row, backRow];
    }

    _renderFocused() {
      const shell = this;
      const row = createElement(this.document, 'div', 'skopeo-fixture-row');
      const anchor = this._button('skopeo-anchor', copy('Open anchor mark demo'), copy(COPY.anchor));
      anchor.setAttribute('data-skopeo-primitive', 'anchor');
      const chip = this._button('skopeo-chip', copy('Open entity chip demo'), copy(COPY.entity));
      chip.setAttribute('data-skopeo-primitive', 'chip');
      const ghost = createElement(this.document, 'div', 'skopeo-ghost', {
        'data-skopeo-primitive': 'ghost',
        'aria-hidden': 'true'
      });
      ghost.style.pointerEvents = 'none';
      row.appendChild(anchor);
      row.appendChild(chip);
      row.appendChild(ghost);

      const card = createElement(this.document, 'section', 'skopeo-focused-card', {
        role: 'region',
        'aria-label': copy('Skopeo focused demo')
      });
      const title = createElement(this.document, 'h2', 'skopeo-focused-title', { tabindex: '-1' }, copy(COPY.focusedTitle));
      const body = createElement(this.document, 'p', 'skopeo-focused-body', {}, copy(COPY.focusedBody));
      const actions = createElement(this.document, 'div', 'skopeo-actions');
      actions.appendChild(this._button('skopeo-back', copy(COPY.backAnchored), copy(COPY.backAnchored), function () {
        shell.back();
      }));
      actions.appendChild(this._button('skopeo-fixture-action', copy(COPY.fixtureAction), copy(COPY.fixtureAction), function () {
        shell.render(ATTENTION.INTERSTITIAL, {});
      }));
      actions.appendChild(this._button('skopeo-turn-off', copy(COPY.universalKill), copy(COPY.universalKill), function () {
        shell.onRequestKill({
          generation: shell.generation,
          reason: 'control',
          state: ATTENTION.FOCUSED
        });
      }));
      card.appendChild(title);
      card.appendChild(body);
      card.appendChild(actions);
      return [row, card];
    }

    _renderInterstitial() {
      const shell = this;
      const gate = createElement(this.document, 'section', 'skopeo-gate', {
        'data-skopeo-primitive': 'gate',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': 'skopeo-gate-title',
        'aria-describedby': 'skopeo-gate-description'
      });
      gate.appendChild(createElement(this.document, 'div', 'skopeo-eyebrow skopeo-gate-eyebrow', {}, copy(COPY.demoOnly)));
      gate.appendChild(createElement(this.document, 'h2', 'skopeo-gate-title', {
        id: 'skopeo-gate-title'
      }, copy(COPY.gateTitle)));
      gate.appendChild(createElement(this.document, 'p', 'skopeo-gate-body', {
        id: 'skopeo-gate-description'
      }, copy(COPY.gateBody)));
      const actions = createElement(this.document, 'div', 'skopeo-actions');
      actions.appendChild(this._button('skopeo-gate-return', copy(COPY.gateReturn), copy(COPY.gateReturn), function () {
        shell.back();
      }));
      actions.appendChild(this._button('skopeo-gate-continue', copy(COPY.gateContinue), copy(COPY.gateContinue), function () {
        shell.back();
      }));
      actions.appendChild(this._button('skopeo-back', copy(COPY.backFocused), copy(COPY.backFocused), function () {
        shell.back();
      }));
      gate.appendChild(actions);
      return [gate];
    }

    _adaptiveAction(kind, model, fields) {
      const authority = adaptiveAuthoritySnapshot(model);
      const extra = fields || {};
      const payload = {
        kind: kind,
        generation: authority.generation,
        exactOrigin: authority.exactOrigin,
        profileId: authority.profileId,
        profileVersion: authority.profileVersion,
        contextEpoch: authority.contextEpoch,
        entity: model.entity ? Object.freeze({ kind: model.entity.kind, id: model.entity.id }) : null,
        groupId: extra.groupId || null,
        actionSlug: extra.actionSlug || null,
        sideEffectClass: extra.sideEffectClass || null
      };
      if (kind === 'submit-arguments' || kind === 'cancel-arguments') {
        payload.collectionEpoch = extra.collectionEpoch;
      }
      if (kind === 'submit-arguments') payload.values = extra.values;
      this.onAdaptiveAction(Object.freeze(payload));
      return true;
    }

    _requestAdaptiveConsequenceCancel(model) {
      if (this._disposed || !this._mounted || this._attention !== ATTENTION.INTERSTITIAL ||
          !model || !model.consequence) return false;
      if (this._consequenceExitPending) return true;
      this._consequenceExitPending = true;
      try {
        return this._adaptiveAction('cancel-consequence', model, {
          groupId: model.consequence.groupId,
          actionSlug: model.consequence.actionSlug,
          sideEffectClass: model.consequence.sideEffectClass
        });
      } catch (_error) {
        this._consequenceExitPending = false;
        return false;
      }
    }

    _adaptiveTurnOff(model, state) {
      this.onRequestKill({
        generation: model.authority.generation,
        reason: 'control',
        state: state
      });
    }

    _adaptiveLens(model, placement, attention) {
      const shell = this;
      const sources = adaptiveCopy(model);
      const region = createElement(this.document, 'div', 'skopeo-ambient skopeo-adaptive-lens-region', {
        role: 'region',
        'aria-label': sources.regionLabel,
        'aria-description': sources.metadata,
        'data-adaptive-attention': attention
      });
      const lens = createElement(this.document, 'div', 'skopeo-lens', {
        'data-placement-corner': placement.corner,
        'data-placement-mode': placement.mode
      });
      const open = this._button('skopeo-lens-open', sources.actionLabel, '', function () {
        shell._adaptiveAction('open-actions', model);
      });
      open.appendChild(createElement(this.document, 'span', 'skopeo-active-glyph', { 'aria-hidden': 'true' }));
      open.appendChild(createElement(this.document, 'span', 'skopeo-lens-label', {}, sources.lensLabel));
      lens.appendChild(open);
      lens.appendChild(createElement(this.document, 'span', 'skopeo-lens-meta', {}, sources.metadata));
      const close = this._button('skopeo-close', copy(COPY.turnOff), '×', function () {
        shell.onRequestClose({
          generation: model.authority.generation,
          reason: 'close',
          state: attention
        });
      });
      close.style.width = '32px';
      close.style.height = '32px';
      lens.appendChild(close);
      region.appendChild(lens);

      if (attention === ATTENTION.ANCHORED && model.entity) {
        const entityRow = createElement(this.document, 'div', 'skopeo-adaptive-entity-row');
        const anchor = createElement(this.document, 'span', 'skopeo-adaptive-anchor', {
          'data-skopeo-primitive': 'anchor',
          'aria-hidden': 'true'
        });
        entityRow.appendChild(anchor);
        const chip = this._button('skopeo-chip skopeo-entity-label', sources.entity.accessibleName,
          sources.entity.chip, function () {
            shell._adaptiveAction('open-actions', model);
          });
        chip.setAttribute('data-skopeo-primitive', 'chip');
        entityRow.appendChild(chip);
        if (model.primitives.includes('halo')) {
          entityRow.appendChild(createElement(this.document, 'span', 'skopeo-adaptive-halo', {
            'data-skopeo-primitive': 'halo',
            'aria-hidden': 'true'
          }));
        }
        region.appendChild(entityRow);
      }

      const rail = this._rail(placement);
      if (Object.prototype.hasOwnProperty.call(ADAPTIVE_RAIL_COPY, attention)) {
        setAttributes(rail, { 'aria-label': copy(ADAPTIVE_RAIL_COPY[attention]) });
      }
      region.appendChild(rail);
      return region;
    }

    _adaptivePrimitiveRow(model) {
      if (!model.entity) return null;
      const shell = this;
      const sources = adaptiveCopy(model);
      const row = createElement(this.document, 'div', 'skopeo-fixture-row skopeo-adaptive-focused-primitives');
      if (model.primitives.includes('anchor')) {
        row.appendChild(createElement(this.document, 'span', 'skopeo-adaptive-anchor', {
          'data-skopeo-primitive': 'anchor',
          'aria-hidden': 'true'
        }));
      }
      if (model.primitives.includes('chip')) {
        const chip = this._button('skopeo-chip skopeo-entity-label', sources.entity.accessibleName,
          sources.entity.chip, function () {
            shell._adaptiveAction('open-actions', model);
          });
        chip.setAttribute('data-skopeo-primitive', 'chip');
        row.appendChild(chip);
      }
      if (model.primitives.includes('ghost')) {
        row.appendChild(createElement(this.document, 'div', 'skopeo-ghost', {
          'data-skopeo-primitive': 'ghost',
          'aria-hidden': 'true'
        }));
      }
      return row.childNodes.length ? row : null;
    }

    _adaptiveReadyGroup(model, group, groupIndex) {
      const shell = this;
      const headingId = 'skopeo-adaptive-group-' + model.authority.generation + '-' +
        model.authority.contextEpoch + '-' + groupIndex;
      const section = createElement(this.document, 'section', 'skopeo-capability-group' +
        (group.sideEffectClass === 'read' ? '' : ' skopeo-risk-group'), {
        role: 'group',
        'aria-labelledby': headingId,
        'data-side-effect-class': group.sideEffectClass
      });
      section.appendChild(createElement(this.document, 'h3', 'skopeo-group-heading', {
        id: headingId
      }, adaptiveGroupHeading(group)));
      group.rows.forEach(function (row) {
        const classes = 'skopeo-capability-row' + (row.primary ? ' skopeo-ready-primary' : '');
        const button = shell._button(classes, row.label, '', function () {
          shell._adaptiveAction('select-action', model, {
            groupId: row.sourceGroupId,
            actionSlug: row.slug,
            sideEffectClass: row.sideEffectClass
          });
        });
        button.setAttribute('data-skopeo-capability', row.slug);
        button.setAttribute('data-side-effect-class', row.sideEffectClass);
        button.appendChild(createElement(shell.document, 'span', 'skopeo-row-label', {}, row.label));
        button.appendChild(createElement(shell.document, 'span', 'skopeo-row-status', {}, copy(row.status)));
        if (row.paramSummary) {
          button.appendChild(createElement(shell.document, 'span', 'skopeo-row-detail', {},
            adaptiveParameterSummary(row.paramSummary)));
        }
        section.appendChild(button);
      });
      return section;
    }

    _adaptiveArgumentRow(model, collection) {
      for (const group of model.readyGroups) {
        for (const row of group.rows) {
          if (row.sourceGroupId === collection.groupId && row.slug === collection.actionSlug) return row;
        }
      }
      return null;
    }

    _argumentControlByName(form, name) {
      const controls = form.querySelectorAll('[data-skopeo-argument-control="true"]');
      for (const control of controls) {
        if (control.name === name) return control;
      }
      return null;
    }

    _adaptiveArgumentForm(model) {
      const collection = model.argumentCollection;
      if (!collection || collection.argumentContract.mode !== 'form') return null;
      const row = this._adaptiveArgumentRow(model, collection);
      if (!row || row.argumentContract !== collection.argumentContract &&
          JSON.stringify(row.argumentContract) !== JSON.stringify(collection.argumentContract)) return null;

      const shell = this;
      const formId = 'skopeo-argument-form-' + model.authority.generation + '-' +
        model.authority.contextEpoch + '-' + collection.collectionEpoch;
      const form = createElement(this.document, 'form', 'skopeo-argument-form', {
        id: formId,
        'data-skopeo-argument-form': 'true',
        autocomplete: 'off',
        novalidate: 'novalidate'
      });
      let submitted = false;
      const controls = [];

      collection.argumentContract.fields.forEach(function (field, fieldIndex) {
        const controlId = formId + '-field-' + fieldIndex;
        const wrapper = createElement(shell.document, 'div', 'skopeo-argument-field' +
          (field.kind === 'boolean' ? ' skopeo-argument-field-checkbox' : ''));
        const label = createElement(shell.document, 'label', 'skopeo-argument-label', {
          for: controlId
        }, field.label);
        let control;
        if (field.kind === 'choice') {
          control = createElement(shell.document, 'select', 'skopeo-argument-control', {
            id: controlId,
            name: field.name,
            autocomplete: 'off',
            'data-skopeo-argument-control': 'true'
          });
          const empty = createElement(shell.document, 'option', '', {
            value: '',
            disabled: 'disabled',
            selected: 'selected'
          }, copy('Select'));
          control.appendChild(empty);
          field.choices.forEach(function (choice) {
            control.appendChild(createElement(shell.document, 'option', '', {
              value: String(choice)
            }, String(choice)));
          });
        } else {
          const type = field.kind === 'boolean' ? 'checkbox' :
            (field.kind === 'integer' || field.kind === 'number' ? 'number' : 'text');
          const attributes = {
            id: controlId,
            name: field.name,
            type: type,
            autocomplete: field.kind === 'string' ? 'new-password' : 'off',
            'data-skopeo-argument-control': 'true'
          };
          if (field.kind === 'integer') attributes.step = '1';
          if (field.kind === 'number') attributes.step = 'any';
          if (field.minLength !== null) attributes.minlength = field.minLength;
          if (field.maxLength !== null) attributes.maxlength = field.maxLength;
          if (field.minimum !== null) attributes.min = field.minimum;
          if (field.maximum !== null) attributes.max = field.maximum;
          control = createElement(shell.document, 'input', 'skopeo-argument-control', attributes);
        }
        if (field.required) control.setAttribute('aria-required', 'true');
        if (collection.errorField === field.name) {
          control.setAttribute('aria-invalid', 'true');
          control.setAttribute('aria-describedby', formId + '-error');
        }
        if (field.kind === 'boolean') {
          wrapper.appendChild(control);
          wrapper.appendChild(label);
        } else {
          wrapper.appendChild(label);
          wrapper.appendChild(control);
        }
        controls.push({ field: field, control: control });
        form.appendChild(wrapper);
      });

      if (collection.errorMessage) {
        form.appendChild(createElement(this.document, 'p', 'skopeo-argument-error', {
          id: formId + '-error',
          role: 'status'
        }, copy(collection.errorMessage)));
      }

      const actions = createElement(this.document, 'div', 'skopeo-actions');
      const cancel = this._button('skopeo-argument-cancel', copy(collection.cancelLabel),
        copy(collection.cancelLabel), function () {
          if (submitted) return;
          shell._adaptiveAction('cancel-arguments', model, {
            groupId: collection.groupId,
            actionSlug: collection.actionSlug,
            sideEffectClass: row.sideEffectClass,
            collectionEpoch: collection.collectionEpoch
          });
        });
      const submit = this._button('skopeo-argument-submit', collection.submitLabel,
        collection.submitLabel);
      submit.setAttribute('type', 'submit');
      actions.appendChild(cancel);
      actions.appendChild(submit);
      form.appendChild(actions);

      this._listen(form, 'submit', function (event) {
        if (!event) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (event.isTrusted !== true || submitted) return;
        submitted = true;
        submit.disabled = true;
        const values = {};
        controls.forEach(function (entry) {
          values[entry.field.name] = entry.field.kind === 'boolean'
            ? entry.control.checked === true
            : entry.control.value;
        });
        shell._adaptiveAction('submit-arguments', model, {
          groupId: collection.groupId,
          actionSlug: collection.actionSlug,
          sideEffectClass: row.sideEffectClass,
          collectionEpoch: collection.collectionEpoch,
          values: Object.freeze(values)
        });
      });
      this._listen(form, 'keydown', function (event) {
        if (!event || event.isTrusted !== true || event.key !== 'Escape' || submitted) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        shell._adaptiveAction('cancel-arguments', model, {
          groupId: collection.groupId,
          actionSlug: collection.actionSlug,
          sideEffectClass: row.sideEffectClass,
          collectionEpoch: collection.collectionEpoch
        });
      });
      this._pointerSurface(form);
      this._acquireSurface('pendingRenders', function () {
        submitted = true;
        controls.forEach(function (entry) {
          entry.control.value = '';
          entry.control.checked = false;
        });
      }, 'argument collector values');
      return form;
    }

    _adaptiveUnavailable(model) {
      if (!model.unavailableSummary.count) return null;
      const details = createElement(this.document, 'details', 'skopeo-unavailable');
      const count = String(model.unavailableSummary.count);
      details.appendChild(createElement(this.document, 'summary', 'skopeo-section-heading', {},
        rebuilt(model.unavailableSummary.heading + ' (' + count + ')',
          copy('Unavailable actions ($COUNT$)', { COUNT: count }))));
      model.unavailableSummary.rows.forEach((row) => {
        const status = createElement(this.document, 'div', 'skopeo-status-row', {
          'data-readiness-disposition': row.disposition
        });
        status.appendChild(createElement(this.document, 'span', 'skopeo-row-label', {}, row.label));
        status.appendChild(createElement(this.document, 'span', 'skopeo-row-status', {}, copy(row.status)));
        status.appendChild(createElement(this.document, 'span', 'skopeo-row-detail', {}, copy(row.detail)));
        details.appendChild(status);
      });
      return details;
    }

    _adaptiveFactList(heading, items, className) {
      const section = createElement(this.document, 'section', 'skopeo-atom ' + (className || ''));
      section.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, heading));
      const list = createElement(this.document, 'dl', 'skopeo-fact-list');
      items.forEach((item) => {
        const row = createElement(this.document, 'div', 'skopeo-atom-row');
        row.appendChild(createElement(this.document, 'dt', 'skopeo-row-label', {}, item.label));
        row.appendChild(createElement(this.document, 'dd', 'skopeo-atom-value', {}, item.value));
        list.appendChild(row);
      });
      section.appendChild(list);
      return section;
    }

    _adaptiveTableFacts(atom) {
      const wrapper = createElement(this.document, 'section', 'skopeo-atom');
      wrapper.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
      atom.rows.forEach((row, rowIndex) => {
        const items = atom.columns.map(function (column, columnIndex) {
          return { label: column, value: row[columnIndex] };
        });
        const facts = this._adaptiveFactList(copy('Row $N$', { N: String(rowIndex + 1) }), items,
          'skopeo-table-fact-list');
        wrapper.appendChild(facts);
      });
      return wrapper;
    }

    // Atom text is router data; resultHeading, resultFactItems and the
    // notice helpers pick out the fixed copy that typed results carry.
    _adaptiveAtom(atom, model) {
      if (atom.type === 'section-heading') {
        return createElement(this.document, 'h3', 'skopeo-section-heading skopeo-atom', {}, atom.text);
      }
      if (atom.type === 'status-row' || atom.type === 'capability-row') {
        const row = createElement(this.document, 'div', 'skopeo-atom skopeo-atom-row');
        row.appendChild(createElement(this.document, 'span', 'skopeo-row-label', {}, atom.label));
        row.appendChild(createElement(this.document, 'span', 'skopeo-row-status', {}, atom.status));
        if (atom.detail) row.appendChild(createElement(this.document, 'span', 'skopeo-row-detail', {}, atom.detail));
        return row;
      }
      if (atom.type === 'fact-list') return this._adaptiveFactList(resultHeading(atom.heading), resultFactItems(atom));
      if (atom.type === 'item-list') {
        const section = createElement(this.document, 'section', 'skopeo-atom');
        section.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
        const list = createElement(this.document, 'ul', 'skopeo-item-list');
        atom.items.forEach((item) => {
          const row = createElement(this.document, 'li', 'skopeo-atom-row');
          row.appendChild(createElement(this.document, 'span', 'skopeo-atom-value', {}, resultListText(atom, item)));
          if (item.metadata) row.appendChild(createElement(this.document, 'span', 'skopeo-atom-meta', {}, item.metadata));
          list.appendChild(row);
        });
        section.appendChild(list);
        return section;
      }
      if (atom.type === 'compact-table') {
        if (Number(this.window.innerWidth) < model.rendererRequest.narrowBreakpoint) {
          return this._adaptiveTableFacts(atom);
        }
        const section = createElement(this.document, 'section', 'skopeo-atom');
        section.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
        const table = createElement(this.document, 'table', 'skopeo-compact-table');
        const head = createElement(this.document, 'thead');
        const headRow = createElement(this.document, 'tr');
        atom.columns.forEach((column) => headRow.appendChild(createElement(this.document, 'th', '', {
          scope: 'col'
        }, column)));
        head.appendChild(headRow);
        table.appendChild(head);
        const body = createElement(this.document, 'tbody');
        atom.rows.forEach((cells) => {
          const row = createElement(this.document, 'tr');
          cells.forEach((cell) => row.appendChild(createElement(this.document, 'td', '', {}, cell)));
          body.appendChild(row);
        });
        table.appendChild(body);
        section.appendChild(table);
        return section;
      }
      if (atom.type === 'timeline') {
        const section = createElement(this.document, 'section', 'skopeo-atom');
        section.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
        const list = createElement(this.document, 'ol', 'skopeo-timeline');
        atom.events.forEach((event) => {
          const row = createElement(this.document, 'li', 'skopeo-atom-row');
          row.appendChild(createElement(this.document, 'span', 'skopeo-atom-meta', {}, event.time));
          row.appendChild(createElement(this.document, 'span', 'skopeo-atom-value', {}, event.text));
          list.appendChild(row);
        });
        section.appendChild(list);
        return section;
      }
      if (atom.type === 'diff') {
        const section = createElement(this.document, 'section', 'skopeo-atom skopeo-diff');
        section.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
        [[atom.beforeLabel, atom.before], [atom.afterLabel, atom.after]].forEach((entry) => {
          const row = createElement(this.document, 'div', 'skopeo-atom-row');
          row.appendChild(createElement(this.document, 'span', 'skopeo-row-label', {}, entry[0]));
          row.appendChild(createElement(this.document, 'span', 'skopeo-atom-value', {}, entry[1]));
          section.appendChild(row);
        });
        return section;
      }
      const notice = createElement(this.document, 'section', 'skopeo-atom skopeo-notice' +
        (atom.tone === 'error' ? ' skopeo-notice-error' : ''));
      notice.appendChild(createElement(this.document, 'h3', 'skopeo-atom-heading', {}, resultHeading(atom.heading)));
      notice.appendChild(createElement(this.document, 'p', 'skopeo-atom-value', {}, resultNoticeMessage(atom)));
      notice.appendChild(createElement(this.document, 'p', 'skopeo-atom-meta', {}, resultNoticeText(atom.nextStep)));
      return notice;
    }

    _adaptiveResult(model, renderedAtoms) {
      const message = model.rendererRequest.copy.resultMessage;
      if (!message && !renderedAtoms.length) return null;
      const region = createElement(this.document, 'section', 'skopeo-result-region', {
        role: 'region',
        'aria-label': copy('Skopeo result')
      });
      if (message) {
        region.appendChild(createElement(this.document, 'p', 'skopeo-result-message', {},
          adaptiveCopy(model).resultMessage));
      }
      renderedAtoms.forEach((atom) => region.appendChild(this._adaptiveAtom(atom, model)));
      return region;
    }

    _adaptiveFocused(model, renderedAtoms) {
      const shell = this;
      const nodes = [];
      const primitives = this._adaptivePrimitiveRow(model);
      if (primitives) nodes.push(primitives);
      const sources = adaptiveCopy(model);
      const titleId = 'skopeo-adaptive-title-' + model.authority.generation + '-' + model.authority.contextEpoch;
      const card = createElement(this.document, 'section', 'skopeo-focused-card skopeo-adaptive-card', {
        role: 'region',
        'aria-labelledby': titleId,
        'aria-label': sources.focusedTitle
      });
      const tools = createElement(this.document, 'div', 'skopeo-focused-tools');
      tools.appendChild(this._button('skopeo-back', sources.backLabel,
        sources.backLabel, function () { shell.back(); }));
      card.appendChild(tools);
      card.appendChild(createElement(this.document, 'div', 'skopeo-eyebrow', {}, sources.eyebrow));
      card.appendChild(createElement(this.document, 'h2', 'skopeo-focused-title', {
        id: titleId,
        tabindex: '-1'
      }, sources.focusedTitle));
      card.appendChild(createElement(this.document, 'p', 'skopeo-focused-body', {},
        sources.contextDescription));

      model.readyGroups.forEach(function (group, groupIndex) {
        card.appendChild(shell._adaptiveReadyGroup(model, group, groupIndex));
      });
      const argumentForm = this._adaptiveArgumentForm(model);
      if (argumentForm) card.appendChild(argumentForm);
      const unavailable = this._adaptiveUnavailable(model);
      if (unavailable) card.appendChild(unavailable);
      if (!model.readyGroups.length && !model.unavailableSummary.count) {
        card.appendChild(createElement(this.document, 'h3', 'skopeo-empty-heading', {},
          sources.emptyHeading));
        card.appendChild(createElement(this.document, 'p', 'skopeo-empty-body', {},
          sources.emptyBody));
      }
      const result = this._adaptiveResult(model, renderedAtoms);
      if (result) card.appendChild(result);

      const actions = createElement(this.document, 'div', 'skopeo-actions' +
        (Number(this.window.innerWidth) < model.rendererRequest.narrowBreakpoint ? ' skopeo-actions-stacked' : ''));
      actions.appendChild(this._button('skopeo-turn-off', sources.turnOffLabel,
        sources.turnOffLabel, function () {
          shell._adaptiveTurnOff(model, ATTENTION.FOCUSED);
        }));
      card.appendChild(actions);
      nodes.push(card);
      return nodes;
    }

    _adaptiveGate(model) {
      const shell = this;
      const consequence = model.consequence;
      const titleId = 'skopeo-adaptive-gate-title-' + model.authority.generation + '-' +
        model.authority.contextEpoch;
      const bodyId = 'skopeo-adaptive-gate-body-' + model.authority.generation + '-' +
        model.authority.contextEpoch;
      const gate = createElement(this.document, 'section', 'skopeo-gate' +
        (consequence.sideEffectClass === 'destructive' ? ' skopeo-danger-token' : ''), {
        'data-skopeo-primitive': 'gate',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        'aria-describedby': bodyId
      });
      // The title ('<action>?') and the confirm label are the catalog action
      // label and stay data.
      gate.appendChild(createElement(this.document, 'div', 'skopeo-eyebrow skopeo-gate-eyebrow', {},
        rebuilt(consequence.eyebrow, copy(consequence.sideEffectClass === 'destructive'
          ? 'Destructive action' : 'Changes data'))));
      gate.appendChild(createElement(this.document, 'h2', 'skopeo-gate-title', {
        id: titleId
      }, consequence.title));
      gate.appendChild(createElement(this.document, 'p', 'skopeo-gate-body', {
        id: bodyId
      }, adaptiveConsequenceBody(consequence)));
      const actions = createElement(this.document, 'div', 'skopeo-actions' +
        (Number(this.window.innerWidth) < model.rendererRequest.narrowBreakpoint ? ' skopeo-actions-stacked' : ''));
      let submitted = false;
      const safeLabel = rebuilt(consequence.safeLabel, copy('Keep reviewing'));
      const safe = this._button('skopeo-gate-return', safeLabel, safeLabel, function () {
        shell._requestAdaptiveConsequenceCancel(model);
      });
      const confirm = this._button('skopeo-gate-continue' +
        (consequence.sideEffectClass === 'destructive' ? ' skopeo-danger-token' : ''),
      consequence.confirmLabel, consequence.confirmLabel, function () {
        if (submitted) return;
        submitted = true;
        safe.disabled = true;
        confirm.disabled = true;
        shell._adaptiveAction('confirm-consequence', model, {
          groupId: consequence.groupId,
          actionSlug: consequence.actionSlug,
          sideEffectClass: consequence.sideEffectClass
        });
      });
      const turnOffLabel = adaptiveCopy(model).turnOffLabel;
      const turnOff = this._button('skopeo-turn-off', turnOffLabel, turnOffLabel, function () {
        shell._adaptiveTurnOff(model, ATTENTION.INTERSTITIAL);
      });
      actions.appendChild(safe);
      actions.appendChild(confirm);
      actions.appendChild(turnOff);
      gate.appendChild(actions);
      return [gate];
    }

    _corpusAuthorityCanCommit(candidate) {
      if (!candidate || candidate.generation !== this.generation) return false;
      const current = this._corpusAuthority;
      if (!current) return true;
      if (candidate.generation !== current.generation || candidate.exactOrigin !== current.exactOrigin ||
          candidate.profileId !== current.profileId || candidate.profileVersion !== current.profileVersion ||
          candidate.contextEpoch < current.contextEpoch) return false;
      if (candidate.contextEpoch === current.contextEpoch &&
          candidate.semanticEntityToken !== current.semanticEntityToken) return false;
      return true;
    }

    _disposeCorpusScope() {
      const scope = this._corpusScope;
      if (!scope || scope.disposed) {
        this._corpusScope = null;
        return false;
      }
      if (scope.contract === true) {
        scope.actionEpoch = Number.MAX_SAFE_INTEGER;
        scope.onAction = null;
      }
      this._disposeSurfaceScope(scope);
      this._corpusScope = null;
      return true;
    }

    withdrawCorpus() {
      if (this._disposed) return false;
      const scope = this._corpusScope;
      const active = this._deepActiveElement();
      const restoreLens = !!(scope && scope.contract === true && scope.node && active &&
        typeof scope.node.contains === 'function' && scope.node.contains(active));
      const withdrawn = this._disposeCorpusScope();
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._contractAuthority = null;
      this._contractModel = null;
      this._contractOnAction = null;
      this._cancelAnnouncement();
      if (this._liveRegion) text(this._liveRegion, '');
      if (restoreLens && this._surface) {
        const lensControl = this._surface.querySelector('.skopeo-close, .skopeo-lens-open');
        if (lensControl && lensControl.isConnected) this._safeFocus(lensControl);
      }
      return withdrawn;
    }

    _placeCorpusRegion(region) {
      if (!region) return false;
      if (region.classList && region.classList.contains('skopeo-contract-region')) {
        const certificate = this._contractGeometryCertificate();
        return !!certificate && this._applyContractGeometry(region, certificate);
      }
      if (!this._currentPlacement) return false;
      const corner = this._currentPlacement.corner;
      region.style.top = '';
      region.style.right = '';
      region.style.bottom = '';
      region.style.left = '';
      if (corner.startsWith('top')) region.style.top = '64px';
      else region.style.bottom = '64px';
      if (corner.endsWith('right')) region.style.right = '16px';
      else region.style.left = '16px';
      return true;
    }

    _emitCorpusAction(model, button) {
      const candidate = corpusAuthoritySnapshot(model);
      if (this._disposed || !this._mounted || this._corpusModel !== model ||
          this._corpusActionConsumed || !sameCorpusAuthority(candidate, this._corpusAuthority) ||
          !this._corpusAuthorityCanCommit(candidate)) return false;
      this._corpusActionConsumed = true;
      if (button) {
        button.disabled = true;
        button.setAttribute('disabled', '');
        button.setAttribute('aria-disabled', 'true');
      }
      return this.onCorpusAction(Object.freeze({
        generation: candidate.generation,
        exactOrigin: candidate.exactOrigin,
        profileVersion: candidate.profileVersion,
        contextEpoch: candidate.contextEpoch,
        semanticEntityToken: candidate.semanticEntityToken,
        actionToken: candidate.actionToken
      })) !== false;
    }

    _buildCorpusScope(model) {
      const shell = this;
      const scope = this._createSurfaceScope('corpus');
      this._buildingSurfaceScope = scope;
      try {
        const region = createElement(this.document, 'section', 'skopeo-corpus-region', {
          role: 'region',
          'aria-labelledby': 'skopeo-corpus-heading'
        });
        region.appendChild(createElement(this.document, 'h2', 'skopeo-corpus-heading', {
          id: 'skopeo-corpus-heading'
        }, copy('Corpus')));
        if (model.mode === 'enrollment') {
          let button = null;
          button = this._button(
            'skopeo-corpus-enroll',
            copy(CORPUS_ENROLL_COPY),
            copy(CORPUS_ENROLL_COPY),
            function () { shell._emitCorpusAction(model, button); }
          );
          region.appendChild(button);
        } else if (model.mode === 'current-source') {
          const source = createElement(this.document, 'div', 'skopeo-corpus-source');
          source.appendChild(createElement(
            this.document, 'span', 'skopeo-corpus-source-label', {}, corpusSourceLabel(model.source)
          ));
          source.appendChild(createElement(this.document, 'p', 'skopeo-corpus-source-state', {
            role: 'status',
            'aria-live': 'polite'
          }, copy(model.source.stateLabel)));
          region.appendChild(source);
        } else if (model.mode === 'active-corpus') {
          const list = createElement(this.document, 'ul', 'skopeo-corpus-list', { role: 'list' });
          for (let index = 0; index < model.rows.length; index += 1) {
            const row = model.rows[index];
            const item = createElement(this.document, 'li', 'skopeo-corpus-row', { role: 'listitem' });
            item.appendChild(createElement(
              this.document, 'span', 'skopeo-corpus-row-label', {}, corpusRowLabel(row, index)
            ));
            item.appendChild(createElement(
              this.document, 'span', 'skopeo-corpus-row-state', {}, copy(row.stateLabel)
            ));
            list.appendChild(item);
          }
          region.appendChild(list);
          if (model.aggregate) {
            region.appendChild(createElement(
              this.document, 'p', 'skopeo-corpus-aggregate', {}, corpusAggregateLabel(model)
            ));
          }
        } else {
          region.appendChild(createElement(this.document, 'p', 'skopeo-corpus-closed', {
            role: 'status',
            'aria-live': 'polite'
          }, copy(model.copy)));
        }
        scope.node = region;
        scope.nodes = [region];
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    renderCorpus(model) {
      if (this._disposed || !this._mounted || !this._surface || !model) return false;
      const composer = adaptiveComposerApi();
      if (!composer || typeof composer.validateCorpusModel !== 'function' ||
          !composer.validateCorpusModel(model) || model.corpusModelVersion !== CORPUS_MODEL_VERSION) return false;
      const candidate = corpusAuthoritySnapshot(model);
      if (!this._corpusAuthorityCanCommit(candidate)) return false;
      const scope = this._buildCorpusScope(model);
      if (!scope || this._disposed || !this._mounted ||
          !composer.validateCorpusModel(model) || !this._corpusAuthorityCanCommit(candidate)) {
        if (scope) this._disposeSurfaceScope(scope);
        return false;
      }
      this._disposeCorpusScope();
      this._cancelAnnouncement();
      if (this._liveRegion) text(this._liveRegion, '');
      try {
        this._surface.appendChild(scope.node);
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._corpusScope = scope;
      this._corpusAuthority = candidate;
      this._corpusModel = model;
      this._corpusActionConsumed = false;
      this._placeCorpusRegion(scope.node);
      if (!sameCorpusAuthority(candidate, this._corpusAuthority) || scope.disposed) {
        this.withdrawCorpus();
        return false;
      }
      let announcement = copy('Corpus status updated.');
      if (model.mode === 'enrollment') announcement = copy('Folder enrollment available.');
      else if (model.mode === 'current-source') {
        announcement = copy('$LABEL$. $STATE$.', {
          LABEL: corpusSourceLabel(model.source),
          STATE: copy(model.source.stateLabel)
        });
      } else if (model.mode === 'active-corpus') announcement = copy('Corpus sources updated.');
      else announcement = copy('Corpus unavailable.');
      this._announce(announcement, true);
      return true;
    }

    _contractAuthorityCanCommit(candidate, nextMode) {
      if (!candidate || candidate.generation !== this.generation) return false;
      const current = this._contractAuthority;
      if (!current) return true;
      if (candidate.generation !== current.generation || candidate.exactOrigin !== current.exactOrigin ||
          candidate.profileVersion !== current.profileVersion || candidate.contextEpoch < current.contextEpoch) {
        return false;
      }
      if (candidate.contextEpoch === current.contextEpoch) {
        if (candidate.semanticEntityToken !== current.semanticEntityToken ||
            candidate.requestActionToken !== current.requestActionToken) return false;
        if (candidate.projectionToken === current.projectionToken) return true;
        return nextMode === 'answer' && this._contractModel &&
          ['ask', 'answer'].includes(this._contractModel.mode);
      }
      return true;
    }

    _contractModelMatchesSupportedContext(model) {
      if (!model || !model.authority) return false;
      let parsed;
      try { parsed = new URL(model.authority.exactOrigin); } catch (_error) { return false; }
      if (parsed.protocol !== 'https:' || parsed.port || parsed.pathname !== '/' ||
          parsed.search || parsed.hash) return false;
      const drive = parsed.hostname === 'drive.google.com';
      const docs = parsed.hostname === 'docs.google.com';
      if (model.mode === 'folder') return drive;
      if (model.mode === 'ask' || model.mode === 'answer') {
        if (!model.scope || !['agreement', 'vendor', 'corpus'].includes(model.scope.kind)) return false;
        if (model.scope.kind === 'agreement') return drive || docs;
        return drive;
      }
      return (model.mode === 'reading' || model.mode === 'contract-closed') && (drive || docs);
    }

    _contractGeometryCertificate() {
      const viewportWidth = Number(this.window.innerWidth);
      const viewportHeight = Number(this.window.innerHeight);
      if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) ||
          viewportWidth <= VIEWPORT_INSET * 2 || viewportHeight <= CONTRACT_VERTICAL_INSET * 2) return null;
      const narrow = viewportWidth <= CONTRACT_BREAKPOINT;
      const width = narrow ? viewportWidth - VIEWPORT_INSET * 2 : CONTRACT_WIDTH;
      if (width <= 0 || (!narrow && width > viewportWidth - VIEWPORT_INSET * 2)) return null;
      const rect = Object.freeze({
        left: narrow ? VIEWPORT_INSET : viewportWidth - VIEWPORT_INSET - width,
        top: CONTRACT_VERTICAL_INSET,
        width: width,
        height: viewportHeight - CONTRACT_VERTICAL_INSET * 2,
        right: viewportWidth - VIEWPORT_INSET,
        bottom: viewportHeight - CONTRACT_VERTICAL_INSET
      });
      const controls = this._hostControls();
      for (const control of controls) {
        const controlRect = normalizeRect(control.getBoundingClientRect());
        if (controlRect && intersects(rect, controlRect, HOST_CLEARANCE)) return null;
      }
      return Object.freeze({ rect: rect, narrow: narrow });
    }

    _applyContractGeometry(region, certificate) {
      if (!region || !certificate) return false;
      region.style.position = 'fixed';
      region.style.top = '64px';
      region.style.bottom = '64px';
      region.style.right = '16px';
      region.style.maxHeight = 'calc(100dvh - 128px)';
      region.style.borderRadius = '12px';
      region.style.padding = '16px';
      region.style.overflowX = 'hidden';
      region.style.overflowY = 'auto';
      if (certificate.narrow) {
        region.style.left = '16px';
        region.style.width = 'auto';
        region.setAttribute('data-contract-columns', '1');
      } else {
        region.style.left = '';
        region.style.width = '384px';
        region.setAttribute('data-contract-columns', '2');
      }
      return true;
    }

    _contractSection(key, heading) {
      const section = createElement(this.document, 'section', 'skopeo-contract-section', {
        'data-contract-section': key
      });
      if (heading) {
        section.appendChild(createElement(
          this.document, 'h3', 'skopeo-contract-section-heading', {}, heading
        ));
      }
      return section;
    }

    _contractHide(scope) {
      if (!scope || scope.disposed || this._corpusScope !== scope) return false;
      return this._requestContractWithdraw('hide');
    }

    _contractHeader(scope, model, sectionKey) {
      const shell = this;
      const header = createElement(this.document, 'header',
        model.mode === 'reading' ? 'skopeo-contract-reading-banner' : 'skopeo-contract-header', {
          'data-contract-section': sectionKey
        });
      const titleRow = createElement(this.document, 'div', 'skopeo-contract-title-row');
      const heading = createElement(this.document, 'h2', 'skopeo-contract-heading', {
        id: 'skopeo-contract-heading',
        'aria-label': copy(model.mode === 'folder' ? 'Skopeo vendor agreements' :
          model.mode === 'reading' ? 'Skopeo agreement reading' : 'Skopeo contract view unavailable')
      }, copy(model.title));
      const hide = this._button(
        'skopeo-contract-hide', copy('Hide contract view'), copy('Hide contract view'),
        function () { shell._contractHide(scope); }
      );
      titleRow.appendChild(heading);
      titleRow.appendChild(hide);
      header.appendChild(titleRow);
      return header;
    }

    // Slot labels are FSB copy; the caller decides whether the value is.
    _contractAppendTextSlot(list, slot, value) {
      list.appendChild(createElement(this.document, 'dt', '', {}, copy(slot.label)));
      list.appendChild(createElement(this.document, 'dd', '', {}, value));
    }

    _contractAppendDateSlot(list, slot) {
      list.appendChild(createElement(this.document, 'dt', '', {}, copy(slot.label)));
      const value = createElement(this.document, 'dd');
      if (slot.state === 'accepted') {
        value.appendChild(createElement(
          this.document, 'span', 'skopeo-contract-date-type', {}, copy(slot.typeLabel)
        ));
        value.appendChild(createElement(this.document, 'time', 'skopeo-contract-date', {
          datetime: slot.civilDate
        }, contractDateLabel(slot.dateLabel, slot.civilDate)));
        value.appendChild(createElement(
          this.document, 'span', 'skopeo-contract-metadata', {}, copy(slot.trustLabel)
        ));
      } else {
        text(value, copy(slot.value));
      }
      list.appendChild(value);
    }

    _contractAppendAlertSlot(list, slot, scope, model, onAction) {
      if (!slot) return;
      const shell = this;
      list.appendChild(createElement(this.document, 'dt', '', {}, copy(slot.label)));
      const value = createElement(this.document, 'dd', 'skopeo-contract-alert-status', {
        'data-alert-state': slot.state
      });
      value.appendChild(createElement(this.document, 'strong', '', {}, copy(slot.value)));
      value.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-metadata', {}, contractAlertDetail(slot)
      ));
      // The label sits in its own element so a language change can rewrite it
      // without touching the ISO date beside it.
      const datedLine = function (label, iso) {
        const line = createElement(shell.document, 'p', 'skopeo-contract-metadata');
        line.appendChild(createElement(shell.document, 'span', '', {}, copy(label)));
        line.appendChild(shell.document.createTextNode(' '));
        line.appendChild(createElement(shell.document, 'time', '', { datetime: iso }, iso));
        return line;
      };
      if (slot.alertCivilDate) value.appendChild(datedLine('Alert date', slot.alertCivilDate));
      if (slot.deadlineCivilDate) value.appendChild(datedLine('Deadline', slot.deadlineCivilDate));
      if (slot.action) {
        let consumed = false;
        const actionLabel = copy(slot.action.label);
        const button = this._button(
          'skopeo-contract-alert-action', actionLabel, actionLabel, function () {
            if (consumed || scope.disposed || shell._corpusScope !== scope ||
                shell._contractModel !== model || !model.actionIds.includes(slot.action.actionId) ||
                !sameContractAuthority(contractAuthoritySnapshot(model), shell._contractAuthority)) return;
            consumed = true;
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
            shell._contractLocalAction(scope, model, onAction, Object.freeze({
              kind: 'alert-action', actionId: slot.action.actionId
            }));
          }
        );
        value.appendChild(button);
      }
      list.appendChild(value);
    }

    _contractVendorItem(scope, model, vendor, onAction) {
      const item = createElement(this.document, 'li', 'skopeo-contract-vendor', { role: 'listitem' });
      item.appendChild(createElement(
        this.document, 'h4', 'skopeo-contract-vendor-heading', {}, vendor.label
      ));
      const slots = createElement(this.document, 'dl', 'skopeo-contract-slots');
      this._contractAppendTextSlot(slots, vendor.owner, contractOwnerValue(vendor.owner));
      this._contractAppendTextSlot(slots, vendor.documents, contractDocumentsValue(vendor.documents));
      this._contractAppendTextSlot(slots, vendor.governing, copy(vendor.governing.value));
      this._contractAppendDateSlot(slots, vendor.nextMaterialDate);
      this._contractAppendTextSlot(slots, vendor.consequence, contractConsequenceValue(
        vendor.consequence.state, vendor.consequence.value, vendor.nextMaterialDate.type
      ));
      this._contractAppendTextSlot(slots, vendor.memoEvidence, copy(vendor.memoEvidence.value));
      this._contractAppendTextSlot(slots, vendor.policyDocument, copy(vendor.policyDocument.value));
      this._contractAppendTextSlot(slots, vendor.memoRequirement, copy(vendor.memoRequirement.value));
      this._contractAppendAlertSlot(slots, vendor.notificationDelivery, scope, model, onAction);
      slots.appendChild(createElement(this.document, 'dt', '', {}, copy('Urgent gaps')));
      const gapValue = createElement(this.document, 'dd');
      if (vendor.gaps.length) {
        const gaps = createElement(this.document, 'ul', 'skopeo-contract-gaps', { role: 'list' });
        for (const gap of vendor.gaps) {
          gaps.appendChild(createElement(this.document, 'li', '', { role: 'listitem' }, copy(gap.label)));
        }
        if (vendor.gapOverflowText) {
          gaps.appendChild(createElement(
            this.document, 'li', 'skopeo-contract-overflow', { role: 'listitem' },
            overflowCopy(vendor.gapOverflowText, '+$COUNT$ more gaps', vendor.gapOverflow)
          ));
        }
        gapValue.appendChild(gaps);
      } else {
        text(gapValue, copy(vendor.gapEmptyText));
      }
      slots.appendChild(gapValue);
      item.appendChild(slots);
      return item;
    }

    _contractAskEntries(scope, model, region, onAction) {
      if (!Array.isArray(model.askEntries) || model.askEntries.length === 0) return;
      const shell = this;
      const section = this._contractSection('ask-contract-evidence', copy('Ask contract evidence'));
      section.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-metadata', {},
        copy('Choose an explicit evidence scope. Skopeo will check only currently accessible evidence.')
      ));
      for (const entry of model.askEntries) {
        const entryLabel = contractAskEntryLabel(entry);
        section.appendChild(this._button(
          'skopeo-contract-ask-entry', entryLabel, entryLabel,
          function () {
            if (scope.disposed || shell._corpusScope !== scope || shell._contractModel !== model ||
                !sameContractAuthority(
                  contractAuthoritySnapshot(model), shell._contractAuthority
                ) || typeof onAction !== 'function') return;
            onAction(Object.freeze({ kind: 'ask-entry', scopeToken: entry.scopeToken }));
          }
        ));
      }
      region.appendChild(section);
    }

    _contractFolderScope(scope, model, region, onAction) {
      const shell = this;
      const folder = model.folder;
      const header = this._contractHeader(scope, model, 'header');
      header.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-metadata', {},
        copy('$NAME$ · $COUNT$ vendors', {
          NAME: copy(folder.completeness.label),
          COUNT: String(folder.completeness.vendorCount)
        })
      ));
      region.appendChild(header);

      const vendorsByToken = new Map(folder.vendors.map(function (vendor) {
        return [vendor.vendorToken, vendor];
      }));
      // A date row repeats its vendor's consequence; that slot's state says
      // whether the text is document data.
      const rowConsequence = function (row) {
        const vendor = vendorsByToken.get(row.vendorToken);
        return vendor && vendor.consequence.value === row.consequence
          ? contractConsequenceValue(vendor.consequence.state, row.consequence, row.type)
          : row.consequence;
      };
      const dates = this._contractSection('next-material-dates', copy('Next material dates'));
      const dateList = createElement(this.document, 'ol', 'skopeo-contract-list', { role: 'list' });
      if (folder.nextMaterialDates.length) {
        for (const row of folder.nextMaterialDates) {
          const item = createElement(this.document, 'li', 'skopeo-contract-summary-row', { role: 'listitem' });
          item.appendChild(createElement(
            this.document, 'span', 'skopeo-contract-date-type', {}, copy(row.typeLabel)
          ));
          item.appendChild(createElement(this.document, 'time', 'skopeo-contract-date', {
            datetime: row.civilDate
          }, contractDateLabel(row.dateLabel, row.civilDate)));
          item.appendChild(createElement(this.document, 'div', '', {}, row.vendorLabel));
          const consequence = createElement(this.document, 'p', 'skopeo-contract-consequence');
          consequence.appendChild(createElement(
            this.document, 'span', 'skopeo-contract-slot-label', {}, copy(row.consequenceLabel)
          ));
          consequence.appendChild(createElement(this.document, 'span', '', {}, rowConsequence(row)));
          item.appendChild(consequence);
          item.appendChild(createElement(
            this.document, 'span', 'skopeo-contract-metadata', {}, copy(row.trustLabel)
          ));
          dateList.appendChild(item);
        }
      } else {
        dateList.appendChild(createElement(
          this.document, 'li', 'skopeo-contract-summary-row', { role: 'listitem' },
          copy(folder.completeness.manifestState === 'complete'
            ? 'No material dates proven.' : 'Material dates not evaluated.')
        ));
      }
      if (folder.nextMaterialDateOverflowText) {
        dateList.appendChild(createElement(
          this.document, 'li', 'skopeo-contract-overflow', { role: 'listitem' },
          overflowCopy(folder.nextMaterialDateOverflowText,
            '+$COUNT$ more material dates appear in vendor rows', folder.nextMaterialDateOverflow)
        ));
      }
      dates.appendChild(dateList);
      region.appendChild(dates);

      const urgent = this._contractSection('urgent-gaps', copy('Urgent gaps'));
      const urgentList = createElement(this.document, 'ul', 'skopeo-contract-list', { role: 'list' });
      if (folder.urgentGaps.length) {
        for (const row of folder.urgentGaps) {
          urgentList.appendChild(createElement(
            this.document, 'li', 'skopeo-contract-summary-row', { role: 'listitem' },
            copy('$GAP$ · $VENDOR$', { GAP: copy(row.label), VENDOR: row.vendorLabel })
          ));
        }
      } else {
        urgentList.appendChild(createElement(
          this.document, 'li', 'skopeo-contract-summary-row', { role: 'listitem' },
          copy(folder.completeness.manifestState === 'complete'
            ? 'No urgent gaps proven.' : 'Urgent gaps not evaluated.')
        ));
      }
      if (folder.urgentGapOverflowText) {
        urgentList.appendChild(createElement(
          this.document, 'li', 'skopeo-contract-overflow', { role: 'listitem' },
          overflowCopy(folder.urgentGapOverflowText,
            '+$COUNT$ more gaps appear in vendor rows', folder.urgentGapOverflow)
        ));
      }
      urgent.appendChild(urgentList);
      region.appendChild(urgent);

      const vendors = this._contractSection('vendors', copy('Vendors'));
      const vendorList = createElement(this.document, 'ul', 'skopeo-contract-vendors', { role: 'list' });
      vendors.appendChild(vendorList);
      if (folder.empty.state === 'complete-empty') {
        const empty = createElement(this.document, 'div', 'skopeo-contract-empty');
        empty.appendChild(createElement(this.document, 'h3', '', {}, copy(folder.empty.heading)));
        empty.appendChild(createElement(this.document, 'p', '', {}, copy(folder.empty.body)));
        vendors.appendChild(empty);
      }
      region.appendChild(vendors);

      const pager = this._contractSection('vendor-page-controls');
      pager.classList.add('skopeo-contract-pager');
      const pageState = createElement(this.document, 'span', 'skopeo-contract-page-state');
      let currentPage = folder.paging.initialPage;
      let previous = null;
      let next = null;
      const renderPage = function (focusDirection) {
        vendorList.replaceChildren();
        const start = (currentPage - 1) * CONTRACT_PAGE_SIZE;
        for (const vendor of folder.vendors.slice(start, start + CONTRACT_PAGE_SIZE)) {
          vendorList.appendChild(shell._contractVendorItem(scope, model, vendor, onAction));
        }
        text(pageState, copy('Page $PAGE$ of $TOTAL$', {
          PAGE: String(currentPage),
          TOTAL: String(folder.paging.pageCount)
        }));
        pager.replaceChildren();
        if (currentPage > 1) pager.appendChild(previous);
        pager.appendChild(pageState);
        if (currentPage < folder.paging.pageCount) pager.appendChild(next);
        if (focusDirection) {
          const sameDirection = focusDirection === 'previous' ? previous : next;
          if (!sameDirection || !sameDirection.isConnected || !shell._safeFocus(sameDirection)) {
            shell._safeFocus(region);
          }
          shell._announce(copy('Vendor page $PAGE$ of $TOTAL$.', {
            PAGE: String(currentPage),
            TOTAL: String(folder.paging.pageCount)
          }), true);
        }
      };
      previous = this._button(
        'skopeo-contract-pager-previous', copy('Previous vendor page'), copy('Previous vendors'), function () {
          if (scope.disposed || currentPage <= 1) return;
          currentPage -= 1;
          renderPage('previous');
        }
      );
      next = this._button(
        'skopeo-contract-pager-next', copy('Next vendor page'), copy('Next vendors'), function () {
          if (scope.disposed || currentPage >= folder.paging.pageCount) return;
          currentPage += 1;
          renderPage('next');
        }
      );
      renderPage(null);
      if (folder.paging.pageCount > 1) region.appendChild(pager);
      if (folder.overflow.text) {
        const overflow = this._contractSection('overflow', copy('Some sources aren’t evaluated'));
        overflow.appendChild(createElement(
          this.document, 'p', 'skopeo-contract-overflow', {}, folderOverflowText(folder.overflow)
        ));
        region.appendChild(overflow);
      }
      this._contractAskEntries(scope, model, region, onAction);
    }

    // label is the button's text, a copy() source where the caller knows the
    // action label is FSB copy; it defaults to action.label as given.
    _contractCitationControl(scope, model, action, onAction, label) {
      const shell = this;
      const buttonLabel = label === undefined ? action.label : label;
      const wrapper = createElement(this.document, 'div', 'skopeo-contract-action');
      const sequence = scope.actionSequence++;
      const statusId = 'skopeo-contract-action-status-' + String(sequence);
      const status = createElement(this.document, 'span', 'skopeo-contract-action-status', {
        id: statusId
      });
      let pending = false;
      let button = null;
      const activate = function () {
        if (pending || scope.disposed || shell._corpusScope !== scope ||
            shell._contractModel !== model || !sameContractAuthority(
              contractAuthoritySnapshot(model), shell._contractAuthority
            ) || !model.actionIds.includes(action.actionId) || typeof onAction !== 'function') return;
        pending = true;
        button.disabled = true;
        button.setAttribute('disabled', '');
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-busy', 'true');
        text(status, copy('Opening governing source…'));
        const epoch = scope.actionEpoch;
        let actionResult;
        try {
          actionResult = onAction(action.actionId);
        } catch (_error) {
          actionResult = false;
        }
        Promise.resolve(actionResult).then(function (opened) {
          if (scope.disposed || scope.actionEpoch !== epoch || shell._corpusScope !== scope ||
              shell._contractModel !== model) return;
          pending = false;
          button.removeAttribute('aria-busy');
          if (opened === true) {
            text(status, copy('Governing source opened.'));
            return;
          }
          text(status, copy(CONTRACT_ACTION_ERROR));
          shell._announce(copy(CONTRACT_ACTION_ERROR), true);
        }, function () {
          if (scope.disposed || scope.actionEpoch !== epoch || shell._corpusScope !== scope ||
              shell._contractModel !== model) return;
          pending = false;
          button.removeAttribute('aria-busy');
          text(status, copy(CONTRACT_ACTION_ERROR));
          shell._announce(copy(CONTRACT_ACTION_ERROR), true);
        });
      };
      button = this._button(
        'skopeo-contract-citation' + (action.placement === 'primary' ? ' skopeo-contract-citation-primary' : ''),
        buttonLabel, buttonLabel, activate
      );
      button.setAttribute('aria-describedby', statusId);
      wrapper.appendChild(button);
      wrapper.appendChild(status);
      return wrapper;
    }

    _contractFactItem(scope, model, fact, onAction) {
      const item = createElement(this.document, 'li', 'skopeo-contract-fact', { role: 'listitem' });
      item.appendChild(createElement(this.document, 'strong', '', {}, copy(fact.typeLabel)));
      item.appendChild(createElement(this.document, 'div', '', {}, fact.value));
      item.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-fact-meta', {},
        copy('$EVIDENCE$ · $TRUST$ · $CITATION$', {
          EVIDENCE: copy(fact.evidenceLabel),
          TRUST: copy(fact.trustLabel),
          CITATION: fact.citationLabel
        })
      ));
      if (fact.action) {
        item.appendChild(this._contractCitationControl(scope, model, fact.action, onAction, rebuilt(
          fact.action.label, copy('Open source for $LABEL$', { LABEL: copy(fact.typeLabel) })
        )));
      }
      return item;
    }

    _contractReadingScope(scope, model, region, onAction) {
      const reading = model.reading;
      const banner = this._contractHeader(scope, model, 'banner');
      banner.setAttribute('role', 'status');
      banner.setAttribute('data-definitive', String(reading.banner.definitive));
      banner.setAttribute('data-emphasis', String([
        'historical', 'superseded', 'partially-governing', 'review-required'
      ].includes(reading.banner.state)));
      banner.style.position = 'sticky';
      banner.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-state-label', {}, copy(reading.banner.label)
      ));
      banner.appendChild(createElement(
        this.document, 'h3', 'skopeo-contract-document-title', {}, reading.banner.title
      ));
      banner.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-explanation', {}, copy(reading.banner.explanation)
      ));
      banner.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-metadata', {}, copy(reading.banner.sourceLabel)
      ));
      if (reading.banner.action) {
        banner.appendChild(this._contractCitationControl(
          scope, model, reading.banner.action, onAction, copy(reading.banner.action.label)
        ));
      } else {
        banner.appendChild(createElement(
          this.document, 'p', 'skopeo-contract-action-status', {}, copy(reading.banner.actionStatus)
        ));
      }
      region.appendChild(banner);

      const factSection = function (key, heading, facts) {
        const section = shell._contractSection(key, heading);
        const list = createElement(shell.document, 'ul', 'skopeo-contract-list', { role: 'list' });
        for (const fact of facts) list.appendChild(shell._contractFactItem(scope, model, fact, onAction));
        section.appendChild(list);
        region.appendChild(section);
      };
      const shell = this;
      factSection('governing-facts', copy('Governing facts'), reading.governingFacts);
      if (reading.relevantHistory.length) {
        factSection('relevant-history', copy('Relevant history'), reading.relevantHistory);
      }
      const gapSection = this._contractSection('conflicts-and-gaps', copy('Conflicts and gaps'));
      const gapList = createElement(this.document, 'ul', 'skopeo-contract-list', { role: 'list' });
      if (reading.gaps.length) {
        for (const gap of reading.gaps) {
          gapList.appendChild(createElement(
            this.document, 'li', 'skopeo-contract-gap', { role: 'listitem' }, copy(gap.label)
          ));
        }
      } else {
        gapList.appendChild(createElement(
          this.document, 'li', 'skopeo-contract-gap', { role: 'listitem' }, copy('No conflicts or gaps proven.')
        ));
      }
      gapSection.appendChild(gapList);
      region.appendChild(gapSection);

      const policy = this._contractSection('policy-and-delivery-status', copy('Policy and delivery status'));
      const slots = createElement(this.document, 'dl', 'skopeo-contract-slots');
      for (const slot of reading.policyAndDelivery) {
        if (slot.key === 'notification-delivery') {
          this._contractAppendAlertSlot(slots, slot, scope, model, onAction);
        } else {
          this._contractAppendTextSlot(slots, slot, copy(slot.value));
        }
      }
      policy.appendChild(slots);
      region.appendChild(policy);
      if (reading.empty.state === 'complete-empty') {
        const empty = createElement(this.document, 'div', 'skopeo-contract-empty');
        empty.appendChild(createElement(this.document, 'h3', '', {}, copy(reading.empty.heading)));
        empty.appendChild(createElement(this.document, 'p', '', {}, copy(reading.empty.body)));
        region.appendChild(empty);
      }
      if (reading.factOverflowText || reading.gapOverflowText) {
        const overflow = this._contractSection('overflow', copy('Additional evidence'));
        if (reading.factOverflowText) overflow.appendChild(createElement(
          this.document, 'p', 'skopeo-contract-overflow', {},
          overflowCopy(reading.factOverflowText, '+$COUNT$ cited facts not shown', reading.factOverflow)
        ));
        if (reading.gapOverflowText) overflow.appendChild(createElement(
          this.document, 'p', 'skopeo-contract-overflow', {},
          overflowCopy(reading.gapOverflowText, '+$COUNT$ conflicts or gaps not shown', reading.gapOverflow)
        ));
        region.appendChild(overflow);
      }
      this._contractAskEntries(scope, model, region, onAction);
    }

    _buildContractScope(model, onAction) {
      const scope = this._createSurfaceScope('contract');
      scope.contract = true;
      scope.actionEpoch = 1;
      scope.actionSequence = 1;
      scope.onAction = onAction;
      this._buildingSurfaceScope = scope;
      try {
        const region = createElement(this.document, 'section',
          'skopeo-contract-region skopeo-contract-' + model.mode, {
            role: 'region',
            tabindex: '0',
            'aria-labelledby': 'skopeo-contract-heading',
            'data-contract-mode': model.mode
          });
        if (model.mode === 'folder') this._contractFolderScope(scope, model, region, onAction);
        else if (model.mode === 'reading') this._contractReadingScope(scope, model, region, onAction);
        else {
          const header = this._contractHeader(scope, model, 'blocker');
          const blocker = createElement(this.document, 'div', 'skopeo-contract-blocker', { role: 'status' });
          blocker.appendChild(createElement(this.document, 'h3', '', {}, copy(model.blocker.heading)));
          blocker.appendChild(createElement(this.document, 'p', '', {}, copy(model.blocker.body)));
          header.appendChild(blocker);
          region.appendChild(header);
        }
        scope.node = region;
        scope.nodes = [region];
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    renderContractView(model, onAction) {
      if (this._disposed || !this._mounted || !this._surface || !model ||
          typeof onAction !== 'function') return false;
      const composer = adaptiveComposerApi();
      if (!composer || typeof composer.validateContractViewModel !== 'function' ||
          model.contractModelVersion !== CONTRACT_MODEL_VERSION ||
          composer.validateContractViewModel(model) !== true ||
          !this._contractModelMatchesSupportedContext(model)) return false;
      const candidate = contractAuthoritySnapshot(model);
      if (!this._contractAuthorityCanCommit(candidate)) return false;
      let certificate = this._contractGeometryCertificate();
      if (!certificate) {
        this.withdrawCorpus();
        return false;
      }
      const scope = this._buildContractScope(model, onAction);
      if (!scope || this._disposed || !this._mounted ||
          composer.validateContractViewModel(model) !== true ||
          !sameContractAuthority(candidate, contractAuthoritySnapshot(model)) ||
          !this._contractAuthorityCanCommit(candidate)) {
        if (scope) this._disposeSurfaceScope(scope);
        return false;
      }
      certificate = this._contractGeometryCertificate();
      if (!certificate || !this._applyContractGeometry(scope.node, certificate)) {
        this._disposeSurfaceScope(scope);
        this.withdrawCorpus();
        return false;
      }
      this._disposeCorpusScope();
      this._contractAuthority = null;
      this._contractModel = null;
      this._contractOnAction = null;
      this._cancelAnnouncement();
      if (this._liveRegion) text(this._liveRegion, '');
      certificate = this._contractGeometryCertificate();
      if (!certificate || !this._applyContractGeometry(scope.node, certificate) ||
          composer.validateContractViewModel(model) !== true) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      try {
        this._surface.appendChild(scope.node);
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._corpusScope = scope;
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._contractAuthority = candidate;
      this._contractModel = model;
      this._contractOnAction = onAction;
      if (!sameContractAuthority(candidate, this._contractAuthority) || scope.disposed) {
        this.withdrawCorpus();
        return false;
      }
      if (model.mode === 'folder') this._announce(copy('Vendor agreements updated.'), true);
      else if (model.mode === 'reading') {
        this._announce(copy('Agreement reading updated. $LABEL$.', {
          LABEL: copy(model.reading.banner.label)
        }), true);
      } else {
        this._announce(copy(CONTRACT_CLOSED_COPY), true);
      }
      return true;
    }

    _contractQuestionAdmissible(value, limit) {
      if (typeof value !== 'string' || value.length === 0 || value !== value.trim() ||
          /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/.test(value)) return false;
      return Array.from(value).length <= limit;
    }

    _contractLocalAction(scope, authorityModel, onAction, payload) {
      if (!scope || scope.disposed || this._corpusScope !== scope ||
          this._contractModel !== authorityModel || typeof onAction !== 'function' ||
          !sameContractAuthority(
            contractAuthoritySnapshot(authorityModel), this._contractAuthority
          )) return false;
      try { return onAction(Object.freeze(payload)); } catch (_error) { return false; }
    }

    _contractAskHeader(scope, model, onAction) {
      const header = createElement(this.document, 'header', 'skopeo-contract-header', {
        'data-contract-section': 'heading'
      });
      header.appendChild(createElement(
        this.document, 'p', 'skopeo-ask-eyebrow', {}, copy(model.composer.eyebrow)
      ));
      header.appendChild(createElement(this.document, 'h2', 'skopeo-contract-heading', {
        id: 'skopeo-contract-heading'
      }, copy(model.title)));
      return header;
    }

    _contractAskScope(scope, model, region, onAction) {
      const shell = this;
      const composer = model.composer;
      const back = createElement(this.document, 'nav', '', {
        'data-contract-section': 'back', 'aria-label': copy('Ask navigation')
      });
      const backLabel = copy(composer.backAction.label);
      back.appendChild(this._button(
        'skopeo-contract-hide', backLabel, backLabel,
        function () {
          shell._contractLocalAction(scope, model, onAction, { kind: composer.backAction.kind });
        }
      ));
      region.appendChild(back);
      region.appendChild(this._contractAskHeader(scope, model, onAction));
      region.appendChild(createElement(
        this.document, 'p', 'skopeo-ask-scope', {
          'data-contract-section': 'scope'
        }, copy('Evidence scope · $SCOPE$', {
          SCOPE: askScopeLabel(model.scope.kind, model.scope.summary)
        })
      ));

      const questionSection = this._contractSection('question');
      const fieldId = 'skopeo-contract-question';
      const helperId = 'skopeo-contract-question-helper';
      const countId = 'skopeo-contract-question-count';
      questionSection.appendChild(createElement(
        this.document, 'label', 'skopeo-ask-label', { for: fieldId }, copy(composer.fieldLabel)
      ));
      const question = createElement(this.document, 'textarea', 'skopeo-ask-question', {
        id: fieldId,
        rows: '4',
        'aria-describedby': helperId + ' ' + countId,
        'aria-invalid': String(composer.error !== null),
        readonly: composer.readOnly ? '' : null
      });
      question.value = composer.question || '';
      question.style.minHeight = '88px';
      this._pointerSurface(question);
      const helper = createElement(
        this.document, 'p', 'skopeo-ask-helper', { id: helperId }, copy(composer.helper)
      );
      const count = createElement(this.document, 'p', 'skopeo-ask-count', {
        id: countId,
        'aria-live': 'polite'
      });
      const updateCount = function () {
        const length = Array.from(question.value).length;
        text(count, copy('$COUNT$ of $LIMIT$ characters', {
          COUNT: String(length),
          LIMIT: String(composer.questionLimit)
        }));
        count.hidden = length < 1800;
        if (primary) {
          const disabled = composer.readOnly ||
            !shell._contractQuestionAdmissible(question.value, composer.questionLimit);
          primary.disabled = disabled;
          if (disabled) primary.setAttribute('aria-disabled', 'true');
          else primary.removeAttribute('aria-disabled');
        }
        if (clear) clear.hidden = composer.readOnly || question.value.length === 0;
      };
      questionSection.appendChild(question);
      questionSection.appendChild(helper);
      questionSection.appendChild(count);
      region.appendChild(questionSection);

      const choices = createElement(this.document, 'fieldset', 'skopeo-ask-scope-choices', {
        'data-contract-section': 'scope-choices'
      });
      choices.appendChild(createElement(this.document, 'legend', '', {}, copy('Evidence scope')));
      const choice = createElement(this.document, 'label', 'skopeo-ask-scope-choice');
      const radio = createElement(this.document, 'input', '', {
        type: 'radio', name: 'skopeo-contract-scope', value: model.scope.scopeToken,
        checked: '', disabled: composer.readOnly ? '' : null
      });
      radio.checked = true;
      this._pointerSurface(radio);
      choice.appendChild(radio);
      choice.appendChild(createElement(
        this.document, 'span', '', {}, askScopeLabel(model.scope.kind, model.scope.label)
      ));
      choices.appendChild(choice);
      region.appendChild(choices);

      const actions = createElement(this.document, 'div', 'skopeo-ask-actions', {
        'data-contract-section': 'actions'
      });
      let primary = null;
      let clear = null;
      const dispatch = function () {
        if (!composer.primaryAction ||
            !shell._contractQuestionAdmissible(question.value, composer.questionLimit)) return false;
        return shell._contractLocalAction(scope, model, onAction, {
          kind: composer.primaryAction.kind,
          question: question.value
        });
      };
      if (composer.primaryAction) {
        const primaryLabel = copy(composer.primaryAction.label);
        primary = this._button('skopeo-ask-primary', primaryLabel, primaryLabel, dispatch);
        actions.appendChild(primary);
      }
      if (composer.clearAction) {
        const clearLabel = copy(composer.clearAction.label);
        clear = this._button(
          'skopeo-ask-clear', clearLabel, clearLabel,
          function () {
            shell._contractLocalAction(scope, model, onAction, { kind: composer.clearAction.kind });
          }
        );
        actions.appendChild(clear);
      }
      if (composer.cancelAction) {
        const cancelLabel = copy(composer.cancelAction.label);
        actions.appendChild(this._button(
          'skopeo-ask-cancel', cancelLabel, cancelLabel,
          function () {
            shell._contractLocalAction(scope, model, onAction, { kind: composer.cancelAction.kind });
          }
        ));
      }
      region.appendChild(actions);
      region.appendChild(createElement(
        this.document, 'p', 'skopeo-ask-privacy', {
          'data-contract-section': 'privacy'
        }, copy(composer.privacy)
      ));
      if (composer.status) {
        region.appendChild(createElement(this.document, 'p', 'skopeo-ask-status', {
          role: 'status', 'aria-live': 'polite'
        }, copy(composer.status)));
      }
      if (composer.error) {
        region.appendChild(createElement(this.document, 'p', 'skopeo-ask-error', {
          role: 'alert'
        }, copy(composer.error.message)));
      }

      let composing = false;
      this._listen(question, 'compositionstart', function () { composing = true; });
      this._listen(question, 'compositionend', function () { composing = false; updateCount(); });
      this._listen(question, 'input', updateCount);
      this._listen(question, 'keydown', function (event) {
        if (!event || event.isTrusted !== true || composing || event.isComposing || event.key !== 'Enter' ||
            (!event.metaKey && !event.ctrlKey)) return;
        if (dispatch() === false) return;
        event.preventDefault();
        event.stopPropagation();
      });
      this._listen(region, 'keydown', function (event) {
        if (!event || event.isTrusted !== true || event.defaultPrevented || event.key !== 'Escape' ||
            composing || event.isComposing) return;
        const action = composer.cancelAction || composer.backAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        shell._contractLocalAction(scope, model, onAction, { kind: action.kind });
      });
      updateCount();
      scope.initialFocus = composer.readOnly
        ? region.querySelector('.skopeo-ask-cancel') || region
        : question;
    }

    _contractAnswerEvidence(scope, model, row, onAction) {
      const item = createElement(this.document, 'li', 'skopeo-answer-evidence', { role: 'listitem' });
      const claim = answerClaimLabel(row.claim);
      item.appendChild(createElement(this.document, 'strong', '', {}, claim));
      item.appendChild(createElement(this.document, 'div', '', {}, row.value));
      item.appendChild(createElement(
        this.document, 'p', 'skopeo-answer-meta', {},
        copy('$EVIDENCE$ · $TRUST$ · $CITATION$', {
          EVIDENCE: copy(row.evidenceLabel),
          TRUST: copy(row.trustLabel),
          CITATION: row.citationLabel
        })
      ));
      item.appendChild(this._contractCitationControl(scope, model, row.action, onAction, rebuilt(
        row.action.label, copy('Open source for $LABEL$', { LABEL: claim })
      )));
      return item;
    }

    _contractAnswerAction(scope, model, action, onAction) {
      const shell = this;
      const wrapper = createElement(this.document, 'div', 'skopeo-contract-action');
      const status = createElement(this.document, 'span', 'skopeo-contract-action-status', {
        'aria-live': 'polite'
      });
      let pending = false;
      let button = null;
      const actionLabel = copy(action.label);
      const unavailable = copy('Action unavailable. Reopen this answer and try again.');
      button = this._button(
        'skopeo-answer-policy-action', actionLabel, actionLabel, function () {
          if (pending) return;
          pending = true;
          button.disabled = true;
          button.setAttribute('aria-disabled', 'true');
          text(status, copy(action.requiresConfirmation ? 'Preparing confirmation…' : 'Applying action…'));
          const result = shell._contractLocalAction(scope, model, onAction, {
            kind: 'answer-action', actionId: action.actionId
          });
          Promise.resolve(result).then(function (handled) {
            if (scope.disposed || shell._corpusScope !== scope || shell._contractModel !== model) return;
            pending = false;
            if (handled === true) {
              text(status, copy(action.requiresConfirmation ? 'Confirmation opened.' : 'Action completed.'));
              return;
            }
            button.disabled = false;
            button.removeAttribute('aria-disabled');
            text(status, unavailable);
          }, function () {
            if (scope.disposed || shell._corpusScope !== scope || shell._contractModel !== model) return;
            pending = false;
            button.disabled = false;
            button.removeAttribute('aria-disabled');
            text(status, unavailable);
          });
        }
      );
      wrapper.appendChild(button);
      wrapper.appendChild(status);
      return wrapper;
    }

    _contractAnswerScope(scope, model, region, onAction) {
      const shell = this;
      const answer = model.answer;
      const banner = createElement(this.document, 'header', 'skopeo-answer-banner', {
        'data-contract-section': 'answer-state',
        'data-outcome': answer.banner.outcome
      });
      banner.appendChild(createElement(
        this.document, 'p', 'skopeo-ask-eyebrow', {}, copy('ASK CONTRACT EVIDENCE')
      ));
      banner.appendChild(createElement(this.document, 'h2', 'skopeo-contract-heading', {
        id: 'skopeo-contract-heading'
      }, copy(answer.banner.label)));
      banner.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-explanation', {}, copy(answer.banner.explanation)
      ));
      region.appendChild(banner);
      region.appendChild(createElement(
        this.document, 'p', 'skopeo-answer-question', {},
        copy('Question · $QUESTION$', { QUESTION: answer.question })
      ));

      if (answer.conclusion) {
        const conclusion = this._contractSection('conclusion', copy(answer.conclusion.heading));
        conclusion.appendChild(createElement(
          this.document, 'p', 'skopeo-answer-conclusion', {}, answer.conclusion.text
        ));
        conclusion.appendChild(createElement(
          this.document, 'p', 'skopeo-answer-trust', {
            'data-trust-state': answer.trust.state
          }, copy(answer.trust.label)
        ));
        conclusion.appendChild(createElement(
          this.document, 'p', 'skopeo-answer-meta', {}, answerTrustExplanation(answer.trust)
        ));
        region.appendChild(conclusion);
      } else if (answer.empty) {
        // An abstained answer that still cites evidence has no empty block:
        // its banner explains the abstention and the evidence follows.
        const empty = createElement(this.document, 'div', 'skopeo-answer-empty');
        empty.appendChild(createElement(this.document, 'h3', '', {}, copy(answer.empty.heading)));
        empty.appendChild(createElement(this.document, 'p', '', {}, copy(answer.empty.body)));
        region.appendChild(empty);
      }

      const evidenceSection = function (key, heading, rows) {
        const section = shell._contractSection(key, heading);
        const list = createElement(shell.document, 'ul', 'skopeo-answer-list', { role: 'list' });
        for (const row of rows) list.appendChild(shell._contractAnswerEvidence(scope, model, row, onAction));
        if (rows.length === 0) list.appendChild(createElement(
          shell.document, 'li', 'skopeo-answer-detail', { role: 'listitem' },
          copy('No supported evidence in this section.')
        ));
        section.appendChild(list);
        region.appendChild(section);
      };
      evidenceSection('governing-evidence', copy('Governing evidence'), answer.governingEvidence);
      if (answer.relevantHistory.length) {
        evidenceSection('relevant-history', copy('Relevant history'), answer.relevantHistory);
      }

      const detailSection = this._contractSection('conflicts-and-gaps', copy('Conflicts and gaps'));
      const details = createElement(this.document, 'ul', 'skopeo-answer-list', { role: 'list' });
      if (answer.conflictsAndGaps.length) {
        for (const row of answer.conflictsAndGaps) {
          const item = createElement(this.document, 'li', 'skopeo-answer-detail', { role: 'listitem' });
          item.appendChild(createElement(this.document, 'strong', '', {}, copy(row.label)));
          item.appendChild(createElement(this.document, 'div', '', {}, answerDetailText(row)));
          details.appendChild(item);
        }
      } else {
        details.appendChild(createElement(
          this.document, 'li', 'skopeo-answer-detail', { role: 'listitem' },
          copy('No conflicts or gaps proven.')
        ));
      }
      detailSection.appendChild(details);
      region.appendChild(detailSection);

      const policy = answer.policySafeguards;
      if (policy) {
        const policySection = this._contractSection('policy-safeguards', copy('Policy safeguards'));
        const card = createElement(this.document, 'div', 'skopeo-answer-policy');
        card.appendChild(createElement(
          this.document, 'p', 'skopeo-answer-policy-status', {
            'data-clearance': policy.clearance.state
          }, copy('Decision clearance · $CLEARANCE$', { CLEARANCE: copy(policy.clearance.label) })
        ));
        card.appendChild(createElement(this.document, 'p', '', {}, copy(policy.document10.label)));
        if (Object.prototype.hasOwnProperty.call(policy, 'memo')) {
          card.appendChild(createElement(this.document, 'p', '', {}, copy(policy.memo.label)));
        }
        if (policy.reasons.length) {
          const reasons = createElement(this.document, 'ul', 'skopeo-answer-policy-list', { role: 'list' });
          for (const reason of policy.reasons) {
            reasons.appendChild(createElement(this.document, 'li', '', { role: 'listitem' }, copy(reason)));
          }
          card.appendChild(reasons);
        }
        for (const action of policy.actions) {
          card.appendChild(this._contractAnswerAction(scope, model, action, onAction));
        }
        policySection.appendChild(card);
        region.appendChild(policySection);
      }

      const sourcesSection = this._contractSection('sources', copy('Sources'));
      const sources = createElement(this.document, 'ul', 'skopeo-answer-list', { role: 'list' });
      for (const source of answer.sources) {
        const item = createElement(this.document, 'li', 'skopeo-answer-source', { role: 'listitem' });
        item.appendChild(createElement(this.document, 'strong', '', {}, source.label));
        item.appendChild(createElement(
          this.document, 'p', 'skopeo-answer-meta', {}, copy(source.evidenceLabel)
        ));
        item.appendChild(this._contractCitationControl(scope, model, source.action, onAction, rebuilt(
          source.action.label, copy('Open source for $LABEL$', { LABEL: source.label })
        )));
        sources.appendChild(item);
      }
      if (answer.sources.length === 0) sources.appendChild(createElement(
        this.document, 'li', 'skopeo-answer-source', { role: 'listitem' }, copy('No cited sources available.')
      ));
      sourcesSection.appendChild(sources);
      if (answer.sourceOverflowText) sourcesSection.appendChild(createElement(
        this.document, 'p', 'skopeo-contract-overflow', {},
        overflowCopy(answer.sourceOverflowText, '+$COUNT$ additional sources not shown', answer.sourceOverflow)
      ));
      region.appendChild(sourcesSection);

      const resultActions = createElement(this.document, 'div', 'skopeo-answer-result-actions', {
        'data-contract-section': 'result-actions'
      });
      const askAnotherLabel = copy(answer.resultActions.askAnother.label);
      const backLabel = copy(answer.resultActions.back.label);
      resultActions.appendChild(this._button(
        'skopeo-ask-another', askAnotherLabel, askAnotherLabel, function () {
          shell._contractLocalAction(scope, model, onAction, { kind: answer.resultActions.askAnother.kind });
        }
      ));
      resultActions.appendChild(this._button(
        'skopeo-ask-back', backLabel, backLabel,
        function () {
          shell._contractLocalAction(scope, model, onAction, { kind: answer.resultActions.back.kind });
        }
      ));
      region.appendChild(resultActions);
      this._listen(region, 'keydown', function (event) {
        if (!event || event.isTrusted !== true || event.defaultPrevented || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        shell._contractLocalAction(scope, model, onAction, { kind: answer.resultActions.back.kind });
      });
      scope.initialFocus = region;
    }

    _buildContractAskScope(model, onAction) {
      const scope = this._createSurfaceScope('contract');
      scope.contract = true;
      scope.actionEpoch = 1;
      scope.actionSequence = 1;
      scope.onAction = onAction;
      this._buildingSurfaceScope = scope;
      try {
        const region = createElement(this.document, 'section',
          'skopeo-contract-region skopeo-contract-' + model.mode, {
            role: 'region', tabindex: '-1',
            'aria-labelledby': 'skopeo-contract-heading',
            'data-contract-mode': model.mode
          });
        if (model.mode === 'ask') this._contractAskScope(scope, model, region, onAction);
        else this._contractAnswerScope(scope, model, region, onAction);
        scope.node = region;
        scope.nodes = [region];
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    renderContractAsk(model, onAction) {
      if (this._disposed || !this._mounted || !this._surface || !model ||
          typeof onAction !== 'function') return false;
      const composer = adaptiveComposerApi();
      if (!composer || typeof composer.validateContractAskModel !== 'function' ||
          model.askModelVersion !== ASK_MODEL_VERSION ||
          composer.validateContractAskModel(model) !== true ||
          !this._contractModelMatchesSupportedContext(model)) return false;
      const candidate = contractAuthoritySnapshot(model);
      if (!this._contractAuthorityCanCommit(candidate, model.mode)) return false;
      let certificate = this._contractGeometryCertificate();
      if (!certificate) {
        this.withdrawCorpus();
        return false;
      }
      const scope = this._buildContractAskScope(model, onAction);
      if (!scope || this._disposed || !this._mounted ||
          composer.validateContractAskModel(model) !== true ||
          !sameContractAuthority(candidate, contractAuthoritySnapshot(model)) ||
          !this._contractAuthorityCanCommit(candidate, model.mode)) {
        if (scope) this._disposeSurfaceScope(scope);
        return false;
      }
      certificate = this._contractGeometryCertificate();
      if (!certificate || !this._applyContractGeometry(scope.node, certificate)) {
        this._disposeSurfaceScope(scope);
        this.withdrawCorpus();
        return false;
      }
      this._disposeCorpusScope();
      this._cancelAnnouncement();
      if (this._liveRegion) text(this._liveRegion, '');
      try { this._surface.appendChild(scope.node); } catch (_error) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._corpusScope = scope;
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._contractAuthority = candidate;
      this._contractModel = model;
      this._contractOnAction = onAction;
      if (!sameContractAuthority(candidate, this._contractAuthority) || scope.disposed) {
        this.withdrawCorpus();
        return false;
      }
      if (scope.initialFocus) this._safeFocus(scope.initialFocus);
      if (model.mode === 'answer') {
        this._announce(copy('$LABEL$. Contract evidence updated.', {
          LABEL: copy(model.answer.banner.label)
        }), true);
      } else if (model.composer.state === 'checking') {
        this._announce(copy(model.composer.status), true);
      } else if (model.composer.state === 'error') {
        this._announce(copy(model.composer.error.message), true);
      } else {
        this._announce(copy('Ask contract evidence. $SCOPE$.', {
          SCOPE: askScopeLabel(model.scope.kind, model.scope.label)
        }), true);
      }
      return true;
    }

    _validContractConfirmation(model) {
      if (!hasExactOwnKeys(model, [
        'confirmationModelVersion', 'attention', 'mode', 'eyebrow', 'title', 'body',
        'safeAction', 'confirmAction'
      ]) || model.confirmationModelVersion !== CONFIRMATION_MODEL_VERSION ||
          model.attention !== 'interstitial' || model.mode !== 'confirmation' ||
          !Object.isFrozen(model) || !Object.isFrozen(model.safeAction) ||
          !Object.isFrozen(model.confirmAction) || !adaptiveText(model.eyebrow) ||
          !adaptiveText(model.title) || !adaptiveText(model.body) ||
          !hasExactOwnKeys(model.safeAction, ['kind', 'label']) ||
          model.safeAction.kind !== 'confirmation-cancel' || !adaptiveText(model.safeAction.label) ||
          !hasExactOwnKeys(model.confirmAction, [
            'kind', 'label', 'actionId', 'confirmationToken'
          ]) || !['answer-confirm', 'alert-confirm'].includes(model.confirmAction.kind) ||
          !adaptiveText(model.confirmAction.label) ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(model.confirmAction.actionId) ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(model.confirmAction.confirmationToken)) return false;
      const alertTitle = ['Map current owner', 'Remove current owner mapping'].includes(model.title);
      return ['Configure Document 10', 'Replace Document 10', 'Clear Document 10',
        'Classify as complex', 'Remove complex classification', 'Map current owner',
        'Remove current owner mapping'].includes(model.title) &&
        model.confirmAction.label === model.title &&
        (alertTitle
          ? model.confirmAction.kind === 'alert-confirm'
          : model.confirmAction.kind === 'answer-confirm');
    }

    _buildContractConfirmationScope(model, onAction, authorityModel) {
      const shell = this;
      const scope = this._createSurfaceScope('contract');
      scope.contract = true;
      scope.actionEpoch = 1;
      scope.onAction = onAction;
      this._buildingSurfaceScope = scope;
      try {
        const region = createElement(this.document, 'section',
          'skopeo-contract-region skopeo-confirmation-region', {
            role: 'dialog', tabindex: '-1', 'aria-modal': 'true',
            'aria-labelledby': 'skopeo-contract-heading',
            'aria-describedby': 'skopeo-contract-confirmation-body',
            'data-contract-mode': 'confirmation'
          });
        // The runtime writes the eyebrow, body and safe label from its own
        // literals or the service worker's fixed consequence detail; the
        // title and the confirm label are one of the checked titles.
        region.appendChild(createElement(this.document, 'p', 'skopeo-ask-eyebrow', {}, copy(model.eyebrow)));
        region.appendChild(createElement(this.document, 'h2', 'skopeo-contract-heading', {
          id: 'skopeo-contract-heading'
        }, copy(model.title)));
        region.appendChild(createElement(this.document, 'p', 'skopeo-confirmation-body', {
          id: 'skopeo-contract-confirmation-body'
        }, copy(model.body)));
        const actions = createElement(this.document, 'div', 'skopeo-confirmation-actions');
        let consumed = false;
        const safeLabel = copy(model.safeAction.label);
        const confirmLabel = copy(model.confirmAction.label);
        const safe = this._button(
          'skopeo-confirmation-safe', safeLabel, safeLabel, function () {
            if (consumed) return;
            consumed = true;
            shell._contractLocalAction(scope, authorityModel, onAction, { kind: model.safeAction.kind });
          }
        );
        const confirm = this._button(
          'skopeo-confirmation-confirm', confirmLabel, confirmLabel,
          function () {
            if (consumed) return;
            consumed = true;
            confirm.disabled = true;
            confirm.setAttribute('aria-disabled', 'true');
            shell._contractLocalAction(scope, authorityModel, onAction, {
              kind: model.confirmAction.kind,
              actionId: model.confirmAction.actionId,
              confirmationToken: model.confirmAction.confirmationToken
            });
          }
        );
        actions.appendChild(safe);
        actions.appendChild(confirm);
        region.appendChild(actions);
        this._listen(region, 'keydown', function (event) {
          if (!event || event.isTrusted !== true) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!consumed) {
              consumed = true;
              shell._contractLocalAction(scope, authorityModel, onAction, { kind: model.safeAction.kind });
            }
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = Array.from(region.querySelectorAll(INTERACTIVE_SELECTOR)).filter(function (node) {
            return !node.disabled && !node.hidden;
          });
          if (controls.length === 0) return;
          const active = shell._deepActiveElement();
          if (event.shiftKey && active === controls[0]) {
            event.preventDefault();
            shell._safeFocus(controls[controls.length - 1]);
          } else if (!event.shiftKey && active === controls[controls.length - 1]) {
            event.preventDefault();
            shell._safeFocus(controls[0]);
          }
        });
        scope.node = region;
        scope.nodes = [region];
        scope.initialFocus = safe;
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    renderContractConfirmation(model, onAction) {
      if (this._disposed || !this._mounted || !this._surface ||
          !this._validContractConfirmation(model) || typeof onAction !== 'function' ||
          !this._contractModel || !['answer', 'folder', 'reading'].includes(this._contractModel.mode) ||
          !this._contractModel.actionIds.includes(model.confirmAction.actionId)) return false;
      const authorityModel = this._contractModel;
      const candidate = contractAuthoritySnapshot(authorityModel);
      if (!sameContractAuthority(candidate, this._contractAuthority)) return false;
      let certificate = this._contractGeometryCertificate();
      if (!certificate) {
        this.withdrawCorpus();
        return false;
      }
      const scope = this._buildContractConfirmationScope(model, onAction, authorityModel);
      if (!scope || !this._validContractConfirmation(model) ||
          this._contractModel !== authorityModel ||
          !sameContractAuthority(candidate, this._contractAuthority)) {
        if (scope) this._disposeSurfaceScope(scope);
        return false;
      }
      certificate = this._contractGeometryCertificate();
      if (!certificate || !this._applyContractGeometry(scope.node, certificate)) {
        this._disposeSurfaceScope(scope);
        this.withdrawCorpus();
        return false;
      }
      this._disposeCorpusScope();
      this._cancelAnnouncement();
      if (this._liveRegion) text(this._liveRegion, '');
      try { this._surface.appendChild(scope.node); } catch (_error) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._corpusScope = scope;
      this._contractOnAction = onAction;
      if (scope.initialFocus) this._safeFocus(scope.initialFocus);
      this._announce(copy('Confirmation required. $TITLE$.', { TITLE: copy(model.title) }), true);
      return true;
    }

    _buildAdaptiveSurfaceScope(model, renderedAtoms, attentionOverride) {
      const level = attentionOverride || model.attention;
      const scope = this._createSurfaceScope(level);
      scope.adaptiveModel = model;
      scope.renderedAtoms = Object.freeze(renderedAtoms.slice());
      this._buildingSurfaceScope = scope;
      try {
        let nodes;
        if (level === ATTENTION.AMBIENT || level === ATTENTION.ANCHORED) {
          nodes = [this._adaptiveLens(model, this._currentPlacement, level)];
        } else if (level === ATTENTION.FOCUSED) {
          nodes = this._adaptiveFocused(model, renderedAtoms);
        } else {
          nodes = this._adaptiveGate(model);
        }
        if (!Array.isArray(nodes) || !nodes.length) throw new Error('Adaptive renderer returned no surface nodes');
        scope.nodes = nodes;
        return scope;
      } catch (_error) {
        this._disposeSurfaceScope(scope);
        return null;
      } finally {
        this._buildingSurfaceScope = null;
      }
    }

    _stageAdaptiveAttention(model, renderedAtoms) {
      const scope = this._buildAdaptiveSurfaceScope(model, renderedAtoms);
      if (!scope || !this._surface) return null;
      scope.staged = true;
      for (const node of scope.nodes) {
        node.setAttribute('data-skopeo-staging', 'true');
        node.setAttribute('aria-hidden', 'true');
        node.style.visibility = 'hidden';
        this._surface.appendChild(node);
      }
      const selector = model.attention === ATTENTION.FOCUSED ? '.skopeo-focused-card' : '.skopeo-gate';
      const candidate = this._scopeQuery(scope, selector);
      const requiredControl = this._requiredHostControl();
      return {
        scope: scope,
        candidateRect: candidate ? normalizeRect(candidate.getBoundingClientRect()) : null,
        hostControl: requiredControl,
        hostRect: requiredControl ? normalizeRect(requiredControl.getBoundingClientRect()) : null
      };
    }

    _adaptiveAuthorityCanCommit(candidate) {
      if (!candidate || candidate.generation !== this.generation) return false;
      const current = this._adaptiveAuthority;
      if (!current) return true;
      if (candidate.generation !== current.generation || candidate.exactOrigin !== current.exactOrigin ||
          candidate.profileId !== current.profileId || candidate.profileVersion !== current.profileVersion ||
          candidate.contextEpoch < current.contextEpoch) return false;
      if (candidate.contextEpoch === current.contextEpoch && candidate.entityKey !== current.entityKey) return false;
      return true;
    }

    _adaptiveStillValid(composer, model, renderedAtoms, candidate) {
      return !this._disposed && this._mounted && model.modelVersion === ADAPTIVE_MODEL_VERSION &&
        composer.validateRenderModel(model) && adaptiveModelMatchesShellPolicy(model) &&
        validateAdaptiveAtoms(model, renderedAtoms) &&
        sameAdaptiveAuthority(candidate, adaptiveAuthoritySnapshot(model)) &&
        this._adaptiveAuthorityCanCommit(candidate);
    }

    _rememberAdaptiveCommit(scope, candidate) {
      this._adaptiveAuthority = candidate;
      this._adaptiveModel = scope.adaptiveModel;
      this._adaptiveRenderedAtoms = scope.renderedAtoms;
    }

    _renderAdaptiveInitial(composer, model, renderedAtoms, candidate) {
      const scope = this._buildAdaptiveSurfaceScope(model, renderedAtoms);
      if (!scope || !this._adaptiveStillValid(composer, model, renderedAtoms, candidate)) {
        if (scope) this._disposeSurfaceScope(scope);
        return false;
      }
      this._clearSurface();
      this._discardSuspendedScopes();
      if (!this._commitSurfaceScope(scope)) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._rememberAdaptiveCommit(scope, candidate);
      this._applyPlacement(this._currentPlacement);
      this._announce(adaptiveCopy(model).initialAnnouncement, true);
      return true;
    }

    _renderAdaptiveRich(composer, model, renderedAtoms, candidate) {
      const previous = this._attention;
      const sameLevel = previous === model.attention;
      const requiredPrevious = model.attention === ATTENTION.FOCUSED
        ? [ATTENTION.AMBIENT, ATTENTION.ANCHORED, ATTENTION.FOCUSED]
        : [ATTENTION.FOCUSED, ATTENTION.INTERSTITIAL];
      if (!requiredPrevious.includes(previous)) return false;
      const staged = this._stageAdaptiveAttention(model, renderedAtoms);
      if (!staged || !this._candidateIsSafe(staged.candidateRect, staged.hostRect)) {
        return this._rejectStagedAttention(staged);
      }
      if (!this._adaptiveStillValid(composer, model, renderedAtoms, candidate)) {
        this._disposeSurfaceScope(staged.scope);
        return false;
      }

      const origin = this._deepActiveElement();
      const prior = this._suspendSurfaceScope();
      if (!sameLevel && model.attention === ATTENTION.FOCUSED) {
        if (this._anchoredScope && this._anchoredScope !== prior) this._disposeSurfaceScope(this._anchoredScope);
        this._anchoredScope = prior;
        this._focusedOrigin = origin;
        this._focusOrigin = origin;
        this._focusedFallback = prior && this._scopeQuery(prior, '[data-skopeo-primitive="chip"]');
        this._acquireSurface('focusHooks', undefined, 'Adaptive Focused origin restoration', staged.scope);
      } else if (!sameLevel && model.attention === ATTENTION.INTERSTITIAL) {
        if (this._focusedScope && this._focusedScope !== prior) this._disposeSurfaceScope(this._focusedScope);
        this._focusedScope = prior;
        this._gateOrigin = origin;
        this._acquireSurface('focusHooks', undefined, 'Adaptive Interstitial origin restoration', staged.scope);
      }

      if (!this._commitStagedAttention(staged)) {
        this._disposeSurfaceScope(staged.scope);
        if (prior) this._restoreSurfaceScope(prior);
        return false;
      }
      if (sameLevel && prior) this._disposeSurfaceScope(prior);
      this._rememberAdaptiveCommit(staged.scope, candidate);

      if (model.attention === ATTENTION.FOCUSED) {
        const title = this._surface.querySelector('.skopeo-focused-title');
        const invalidControl = model.argumentCollection && model.argumentCollection.errorField
          ? this._argumentControlByName(this._surface, model.argumentCollection.errorField)
          : null;
        if (invalidControl) {
          this._safeFocus(invalidControl);
        } else if (!sameLevel || model.rendererRequest.resultStatus === 'target-withdrawn' ||
            !isFocusable(this.window, origin)) {
          this._safeFocus(title);
        }
        const sources = adaptiveCopy(model);
        if (model.rendererRequest.copy.resultMessage) this._announce(sources.resultMessage, true);
        else if (renderedAtoms.length) this._announce(copy('Skopeo result updated.'), true);
        else if (!sameLevel) this._announce(sources.openAnnouncement, true);
      } else {
        this._safeFocus(this._surface.querySelector('.skopeo-gate-return'));
      }
      return true;
    }

    renderAdaptive(model, renderedAtoms) {
      if (this._disposed || !this._mounted) return false;
      const composer = adaptiveComposerApi();
      const atoms = Array.isArray(renderedAtoms) ? renderedAtoms : null;
      if (!composer || !model || model.modelVersion !== ADAPTIVE_MODEL_VERSION ||
          !composer.validateRenderModel(model) || !adaptiveModelMatchesShellPolicy(model) ||
          !validateAdaptiveAtoms(model, atoms)) return false;
      const candidate = adaptiveAuthoritySnapshot(model);
      if (!this._adaptiveAuthorityCanCommit(candidate)) return false;
      if (model.attention === ATTENTION.AMBIENT || model.attention === ATTENTION.ANCHORED) {
        return this._renderAdaptiveInitial(composer, model, atoms, candidate);
      }
      return this._renderAdaptiveRich(composer, model, atoms, candidate);
    }

    _backAdaptiveAnchored() {
      if (!this._adaptiveModel) return false;
      const scope = this._buildAdaptiveSurfaceScope(this._adaptiveModel, [], ATTENTION.AMBIENT);
      if (!scope) return false;
      this._clearSurface();
      this._discardSuspendedScopes();
      if (!this._commitSurfaceScope(scope)) {
        this._disposeSurfaceScope(scope);
        return false;
      }
      this._adaptiveModel = scope.adaptiveModel;
      this._adaptiveRenderedAtoms = scope.renderedAtoms;
      this._applyPlacement(this._currentPlacement);
      this._announce(adaptiveCopy(this._adaptiveModel).overviewAnnouncement, true);
      return true;
    }

    _cancelAnnouncement() {
      if (this._announcementTimerHandle) this._release(this._announcementTimerHandle, true);
      else if (this._announcementTimerId !== null) this.window.clearTimeout(this._announcementTimerId);
      if (this._announcementPendingHandle) this._release(this._announcementPendingHandle, false);
      this._announcementTimerId = null;
      this._pendingAnnouncement = null;
    }

    _announce(message, terminal) {
      if (!this._liveRegion || this._disposed) return;
      const value = isCopy(message) ? message : (message == null ? '' : String(message));
      if (terminal) {
        this._cancelAnnouncement();
        announcementText(this._liveRegion, value);
        return;
      }
      this._pendingAnnouncement = value;
      if (this._announcementTimerId !== null) return;
      const shell = this;
      const timerId = this.window.setTimeout(function () {
        const timerHandle = shell._announcementTimerHandle;
        const pendingHandle = shell._announcementPendingHandle;
        shell._announcementTimerId = null;
        shell._announcementTimerHandle = null;
        shell._announcementPendingHandle = null;
        if (timerHandle) shell._release(timerHandle, false);
        if (pendingHandle) shell._release(pendingHandle, false);
        if (shell._disposed || !shell._liveRegion) return;
        announcementText(shell._liveRegion, shell._pendingAnnouncement);
        shell._pendingAnnouncement = null;
      }, LIVE_CADENCE_MS);
      this._announcementTimerId = timerId;
      this._announcementTimerHandle = this._acquire('timeouts', function () {
        shell.window.clearTimeout(timerId);
      }, 'live-region cadence');
      this._announcementPendingHandle = this._acquire('pendingRenders', undefined, 'latest live announcement');
    }

    _projectionRegion() {
      return this._surface && this._surface.querySelector('.skopeo-ambient');
    }

    _projectionLabel() {
      return this._surface && this._surface.querySelector('.skopeo-lens-label');
    }

    _setProjectionSnapshot(fields) {
      const identity = fields.semanticIdentity === undefined
        ? this._projectionSnapshot.semanticIdentity
        : fields.semanticIdentity;
      const targetRect = fields.targetRect === undefined ? this._projectionSnapshot.targetRect : fields.targetRect;
      const markRect = fields.markRect === undefined ? this._projectionSnapshot.markRect : fields.markRect;
      this._projectionSnapshot = freezeProjectionSnapshot({
        generation: this.generation,
        contextEpoch: this._projectionContextEpoch,
        bindingEpoch: this._projectionBindingEpoch,
        status: fields.status === undefined ? this._projectionState.status : fields.status,
        contextKind: fields.contextKind === undefined ? this._projectionState.contextKind : fields.contextKind,
        reason: fields.reason === undefined ? this._projectionState.reason : fields.reason,
        semanticIdentity: identity,
        targetRect: targetRect,
        markRect: markRect,
        anchored: fields.anchored === true,
        disposed: fields.disposed === true
      });
    }

    _announceProjection(key, message) {
      if (key === this._projectionAnnouncementKey) return false;
      this._projectionAnnouncementKey = key;
      this._announce(message, false);
      return true;
    }

    _disposeSemanticAnchorScope() {
      const scope = this._semanticAnchorScope;
      if (!scope || scope.disposed) return false;
      scope.disposed = true;
      if (scope.node && scope.node.parentNode === this._surface) this._surface.removeChild(scope.node);
      this._semanticAnchorScope = null;
      return true;
    }

    _setAmbientProjection(projectionCopy, announcementKey) {
      const label = this._projectionLabel();
      const region = this._projectionRegion();
      if (!label || !region) return false;
      text(label, copy(projectionCopy.visible));
      setAttributes(region, { 'aria-label': copy('Skopeo ambient HUD') });
      this._announceProjection(announcementKey, copy(projectionCopy.announcement));
      return true;
    }

    _contextProjection(model) {
      if (!model || typeof model !== 'object') return null;
      if (model.status === PROJECTION_STATUS.RECOGNIZED &&
          hasExactOwnKeys(model, ['status', 'contextKind', 'contextEpoch']) &&
          PROJECTION_CONTEXT_KINDS.includes(model.contextKind) && isPositiveSafeInteger(model.contextEpoch)) {
        return Object.freeze({
          status: model.status,
          contextKind: model.contextKind,
          contextEpoch: model.contextEpoch,
          reason: null,
          copy: PROJECTION_COPY.recognized[model.contextKind]
        });
      }
      if (model.status === PROJECTION_STATUS.UNCERTAIN &&
          hasExactOwnKeys(model, ['status', 'contextEpoch', 'reason']) &&
          isPositiveSafeInteger(model.contextEpoch) && PROJECTION_UNCERTAIN_REASONS.includes(model.reason)) {
        return Object.freeze({ status: model.status, contextKind: null, contextEpoch: model.contextEpoch, reason: model.reason, copy: PROJECTION_COPY.uncertain });
      }
      if (model.status === PROJECTION_STATUS.UNSUPPORTED &&
          hasExactOwnKeys(model, ['status', 'contextEpoch', 'reason']) &&
          isPositiveSafeInteger(model.contextEpoch) && PROJECTION_UNSUPPORTED_REASONS.includes(model.reason)) {
        return Object.freeze({ status: model.status, contextKind: null, contextEpoch: model.contextEpoch, reason: model.reason, copy: PROJECTION_COPY.unsupported });
      }
      if (model.status === PROJECTION_STATUS.NO_TARGET &&
          hasExactOwnKeys(model, ['status', 'contextEpoch']) && isPositiveSafeInteger(model.contextEpoch)) {
        return Object.freeze({ status: model.status, contextKind: null, contextEpoch: model.contextEpoch, reason: null, copy: PROJECTION_COPY.noTarget });
      }
      return null;
    }

    projectContext(model) {
      if (this._disposed || !this._mounted || this._attention !== ATTENTION.AMBIENT) return false;
      const projection = this._contextProjection(model);
      if (!projection || projection.contextEpoch < this._projectionContextEpoch) return false;
      if (projection.contextEpoch === this._projectionContextEpoch) {
        return projection.status === this._projectionState.status &&
          projection.contextKind === this._projectionState.contextKind &&
          projection.reason === this._projectionState.reason;
      }

      this._projectionBindingEpoch = Math.max(this._projectionBindingEpoch + 1, 1);
      this._disposeSemanticAnchorScope();
      this._projectionContextEpoch = projection.contextEpoch;
      this._projectionBindingEpoch = 0;
      this._projectionState = Object.freeze({
        status: projection.status,
        contextKind: projection.contextKind,
        reason: projection.reason
      });
      if (!this._setAmbientProjection(
        projection.copy,
        ['context', projection.contextEpoch, projection.status, projection.contextKind || '', projection.reason || ''].join(':')
      )) return false;
      this._setProjectionSnapshot({
        status: projection.status,
        contextKind: projection.contextKind,
        reason: projection.reason,
        semanticIdentity: null,
        targetRect: null,
        markRect: null,
        anchored: false
      });
      return true;
    }

    _semanticMarkCandidates(targetRect) {
      return Object.freeze([
        Object.freeze({ corner: 'top-right', left: targetRect.right + HOST_CLEARANCE, top: targetRect.top - HOST_CLEARANCE - SEMANTIC_MARK_SIZE }),
        Object.freeze({ corner: 'top-left', left: targetRect.left - HOST_CLEARANCE - SEMANTIC_MARK_SIZE, top: targetRect.top - HOST_CLEARANCE - SEMANTIC_MARK_SIZE }),
        Object.freeze({ corner: 'bottom-right', left: targetRect.right + HOST_CLEARANCE, top: targetRect.bottom + HOST_CLEARANCE }),
        Object.freeze({ corner: 'bottom-left', left: targetRect.left - HOST_CLEARANCE - SEMANTIC_MARK_SIZE, top: targetRect.bottom + HOST_CLEARANCE })
      ]);
    }

    _semanticMarkRect(candidate) {
      return Object.freeze({
        left: candidate.left,
        top: candidate.top,
        width: SEMANTIC_MARK_SIZE,
        height: SEMANTIC_MARK_SIZE,
        right: candidate.left + SEMANTIC_MARK_SIZE,
        bottom: candidate.top + SEMANTIC_MARK_SIZE
      });
    }

    _semanticMarkIsSafe(markRect, targetRect, controlRects) {
      const width = Number(this.window.innerWidth);
      const height = Number(this.window.innerHeight);
      if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
      if (markRect.left < VIEWPORT_INSET || markRect.top < VIEWPORT_INSET ||
          markRect.right > width - VIEWPORT_INSET || markRect.bottom > height - VIEWPORT_INSET) return false;
      if (intersects(markRect, targetRect, HOST_CLEARANCE)) return false;
      if (controlRects.some(function (rect) { return intersects(markRect, rect, HOST_CLEARANCE); })) return false;
      const documentElement = this.document.documentElement;
      const contentWidth = Number(documentElement && documentElement.clientWidth);
      const contentHeight = Number(documentElement && documentElement.clientHeight);
      if (Number.isFinite(contentWidth) && contentWidth > 0 && contentWidth < width && markRect.right > contentWidth) return false;
      if (Number.isFinite(contentHeight) && contentHeight > 0 && contentHeight < height && markRect.bottom > contentHeight) return false;
      return true;
    }

    _withdrawForUnsafeCommit(bindingEpoch, reason) {
      this._projectionBindingEpoch = Math.max(this._projectionBindingEpoch, bindingEpoch);
      this._disposeSemanticAnchorScope();
      this._setAmbientProjection(PROJECTION_COPY.withdrawn, ['binding', this._projectionContextEpoch, this._projectionBindingEpoch, reason].join(':'));
      this._setProjectionSnapshot({
        status: 'withdrawn-target',
        reason: reason,
        semanticIdentity: null,
        targetRect: null,
        markRect: null,
        anchored: false
      });
      return false;
    }

    commitSemanticAnchor(projection) {
      if (this._disposed || !this._mounted || this._attention !== ATTENTION.AMBIENT ||
          !hasExactOwnKeys(projection, ['generation', 'contextEpoch', 'semanticIdentity', 'bindingEpoch', 'targetRect'])) {
        return false;
      }
      if (projection.generation !== this.generation || projection.contextEpoch !== this._projectionContextEpoch ||
          !isPositiveSafeInteger(projection.bindingEpoch) || this._projectionState.status !== PROJECTION_STATUS.RECOGNIZED) {
        return false;
      }
      const identity = normalizeSemanticIdentity(projection.semanticIdentity);
      const targetRect = normalizeProjectionRect(projection.targetRect);
      if (projection.bindingEpoch < this._projectionBindingEpoch) return false;
      if (!identity) return this._withdrawForUnsafeCommit(projection.bindingEpoch, 'semantic-mismatch');
      if (!targetRect) return this._withdrawForUnsafeCommit(projection.bindingEpoch, 'geometry-unsafe');

      const sameBinding = projection.bindingEpoch === this._projectionBindingEpoch;
      const existing = this._semanticAnchorScope;
      if (sameBinding && (!existing || !sameSemanticIdentity(existing.semanticIdentity, identity))) return false;

      const controlRects = this._hostControls().map(function (node) {
        return normalizeRect(node.getBoundingClientRect());
      }).filter(Boolean);
      let placement = null;
      for (const candidate of this._semanticMarkCandidates(targetRect)) {
        const rect = this._semanticMarkRect(candidate);
        if (this._semanticMarkIsSafe(rect, targetRect, controlRects)) {
          placement = Object.freeze({ corner: candidate.corner, rect: rect });
          break;
        }
      }
      if (!placement) return this._withdrawForUnsafeCommit(projection.bindingEpoch, 'geometry-unsafe');

      if (sameBinding) {
        existing.node.style.left = String(placement.rect.left) + 'px';
        existing.node.style.top = String(placement.rect.top) + 'px';
        existing.node.setAttribute('data-placement-corner', placement.corner);
        existing.targetRect = targetRect;
        existing.markRect = placement.rect;
      } else {
        this._projectionBindingEpoch = projection.bindingEpoch;
        this._disposeSemanticAnchorScope();
        const mark = createElement(this.document, 'span', 'skopeo-semantic-anchor', {
          'data-skopeo-primitive': 'anchor',
          'data-placement-corner': placement.corner,
          'aria-hidden': 'true'
        });
        mark.style.position = 'fixed';
        mark.style.left = String(placement.rect.left) + 'px';
        mark.style.top = String(placement.rect.top) + 'px';
        mark.style.width = '8px';
        mark.style.height = '8px';
        mark.style.pointerEvents = 'none';
        const reducedMotion = typeof this.window.matchMedia === 'function' &&
          this.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        mark.style.transition = reducedMotion ? 'none' : 'opacity 120ms ease-out';
        this._surface.appendChild(mark);
        this._semanticAnchorScope = {
          node: mark,
          semanticIdentity: identity,
          targetRect: targetRect,
          markRect: placement.rect,
          disposed: false
        };
      }

      const region = this._projectionRegion();
      const label = this._projectionLabel();
      const contextCopy = PROJECTION_COPY.recognized[this._projectionState.contextKind];
      if (label && contextCopy) text(label, copy(contextCopy.visible));
      if (region) setAttributes(region, { 'aria-label': copy('Skopeo anchored HUD') });
      if (this._pendingAnnouncement !== null &&
          typeof this._projectionAnnouncementKey === 'string' &&
          this._projectionAnnouncementKey.startsWith('binding:')) {
        this._cancelAnnouncement();
      }
      this._setProjectionSnapshot({
        status: 'anchored',
        contextKind: this._projectionState.contextKind,
        reason: null,
        semanticIdentity: identity,
        targetRect: targetRect,
        markRect: placement.rect,
        anchored: true
      });
      return true;
    }

    withdrawSemanticAnchor(model) {
      if (this._disposed || !this._mounted ||
          !hasExactOwnKeys(model, ['contextEpoch', 'bindingEpoch', 'reason']) ||
          model.contextEpoch !== this._projectionContextEpoch || !isPositiveSafeInteger(model.bindingEpoch) ||
          model.bindingEpoch <= this._projectionBindingEpoch || !PROJECTION_WITHDRAW_REASONS.includes(model.reason) ||
          this._projectionState.status !== PROJECTION_STATUS.RECOGNIZED) {
        return false;
      }
      this._projectionBindingEpoch = model.bindingEpoch;
      this._disposeSemanticAnchorScope();
      if (!this._setAmbientProjection(
        PROJECTION_COPY.withdrawn,
        ['binding', model.contextEpoch, model.bindingEpoch, model.reason].join(':')
      )) return false;
      this._setProjectionSnapshot({
        status: 'withdrawn-target',
        reason: model.reason,
        semanticIdentity: null,
        targetRect: null,
        markRect: null,
        anchored: false
      });
      return true;
    }

    getProjectionSnapshot() {
      return this._projectionSnapshot;
    }

    getControlledTestRoot(token) {
      if (this._disposed || !this._mounted || !this._allowControlledFixture ||
          !this._fixtureToken || token !== this._fixtureToken) return null;
      return this._shadow;
    }

    enableControlledFixture(token) {
      if (this._disposed || !this._mounted || !this._allowControlledFixture) return false;
      if (!this._fixtureToken || token !== this._fixtureToken) return false;
      this._fixtureEnabled = true;
      return true;
    }

    render(level, typedModel) {
      if (this._disposed || !this._mounted || !Object.values(ATTENTION).includes(level)) return false;
      const model = typedModel && typeof typedModel === 'object' ? typedModel : {};
      if (level !== ATTENTION.AMBIENT && !this._fixtureEnabled) return false;

      const previous = this._attention;
      let result = false;
      if (level === ATTENTION.FOCUSED || level === ATTENTION.INTERSTITIAL) {
        const requiredPrevious = level === ATTENTION.FOCUSED ? ATTENTION.ANCHORED : ATTENTION.FOCUSED;
        if (previous !== requiredPrevious) return false;
        const staged = this._stageAttention(level);
        if (!staged || !this._candidateIsSafe(staged.candidateRect, staged.hostRect)) {
          return this._rejectStagedAttention(staged);
        }

        const origin = this._deepActiveElement();
        if (level === ATTENTION.FOCUSED) {
          const fallback = this._scopeQuery(this._activeSurfaceScope, '[data-skopeo-primitive="anchor"]');
          const prior = this._suspendSurfaceScope();
          if (this._anchoredScope && this._anchoredScope !== prior) this._disposeSurfaceScope(this._anchoredScope);
          this._anchoredScope = prior;
          this._focusedOrigin = origin;
          this._focusOrigin = origin;
          this._focusedFallback = fallback;
          this._acquireSurface('focusHooks', undefined, 'Focused origin restoration', staged.scope);
        } else {
          const prior = this._suspendSurfaceScope();
          if (this._focusedScope && this._focusedScope !== prior) this._disposeSurfaceScope(this._focusedScope);
          this._focusedScope = prior;
          this._gateOrigin = origin;
          this._acquireSurface('focusHooks', undefined, 'Interstitial origin restoration', staged.scope);
        }

        result = this._commitStagedAttention(staged);
        if (!result) return this._rejectStagedAttention(staged);
      } else {
        const scope = this._buildSurfaceScope(level, this._currentPlacement);
        if (!scope) return false;
        this._clearSurface();
        this._discardSuspendedScopes();
        result = this._commitSurfaceScope(scope);
        if (result && level === ATTENTION.AMBIENT) this._applyPlacement(this._currentPlacement);
      }

      if (result && level === ATTENTION.FOCUSED) {
        this._announce(copy(COPY.focusedAnnouncement), true);
        if (!this._safeFocus(this._surface.querySelector('.skopeo-focused-title'))) {
          this._safeFocus(this._focusedFallback);
        }
      } else if (result && level === ATTENTION.INTERSTITIAL) {
        if (!this._safeFocus(copyLabelled(this._surface, COPY.gateReturn))) {
          this._safeFocus(copyLabelled(this._surface, COPY.backFocused));
        }
      }

      if (result && Object.prototype.hasOwnProperty.call(model, 'announcement')) {
        this._announce(model.announcement, model.terminal === true);
      }
      return result;
    }

    back() {
      if (this._disposed || !this._mounted) return false;
      if (this._attention === ATTENTION.INTERSTITIAL) {
        const origin = this._gateOrigin;
        const scope = this._focusedScope;
        this._focusedScope = null;
        this._gateOrigin = null;
        this._disposeSurfaceScope(this._activeSurfaceScope);
        const restored = scope ? this._restoreSurfaceScope(scope) : false;
        this._consequenceExitPending = false;
        if (!this._safeFocus(origin)) {
          this._safeFocus(copyLabelled(this._surface, COPY.backAnchored));
        }
        return restored;
      }
      if (this._attention === ATTENTION.FOCUSED) {
        const origin = this._focusedOrigin;
        const fallback = this._focusedFallback;
        const scope = this._anchoredScope;
        this._anchoredScope = null;
        this._focusedOrigin = null;
        this._disposeSurfaceScope(this._activeSurfaceScope);
        const restored = scope ? this._restoreSurfaceScope(scope) : false;
        if (!this._safeFocus(origin)) this._safeFocus(fallback);
        return restored;
      }
      if (this._attention === ATTENTION.ANCHORED) {
        if (this._activeSurfaceScope && this._activeSurfaceScope.adaptiveModel) {
          return this._backAdaptiveAnchored();
        }
        return this.render(ATTENTION.AMBIENT, {});
      }
      if (this._attention === ATTENTION.AMBIENT) {
        this.onRequestClose({
          generation: this.generation,
          reason: 'back',
          state: ATTENTION.AMBIENT
        });
        return true;
      }
      return false;
    }

    getResourceSnapshot() {
      return this.ledger.snapshot();
    }

    _restoreFocusForDestroy() {
      const origin = this._focusOrigin;
      if (origin && !this._ownsNode(origin) && this._safeFocus(origin)) return true;
      const ambientOrigin = this._ambientFocusOrigin;
      if (ambientOrigin && !this._ownsNode(ambientOrigin) && this._safeFocus(ambientOrigin)) return true;

      const fallback = this._focusedFallback;
      if (fallback && fallback.isConnected && this._safeFocus(fallback)) return true;

      const active = this._deepActiveElement();
      if (this._ownsNode(active) && active && typeof active.blur === 'function') active.blur();
      return false;
    }

    destroy(_reason) {
      if (this._disposed) return this.ledger.snapshot();
      this._disposed = true;
      this._cancelRichGeometryFrame();
      this._projectionContextEpoch = Number.MAX_SAFE_INTEGER;
      this._projectionBindingEpoch = Number.MAX_SAFE_INTEGER;
      this._disposeSemanticAnchorScope();
      this._projectionState = Object.freeze({ status: 'disposed', contextKind: null, reason: 'disposed' });
      this._setProjectionSnapshot({
        status: 'disposed',
        contextKind: null,
        reason: 'disposed',
        semanticIdentity: null,
        targetRect: null,
        markRect: null,
        anchored: false,
        disposed: true
      });
      this._preparedToken = null;
      this._preparedPlacement = null;
      this._cancelAnnouncement();
      this._restoreFocusForDestroy();

      this._disposeCorpusScope();
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._disposeSurfaceScope(this._activeSurfaceScope);
      this._disposeSurfaceScope(this._focusedScope);
      this._disposeSurfaceScope(this._anchoredScope);
      this._activeSurfaceScope = null;
      this._focusedScope = null;
      this._anchoredScope = null;

      if (this._popoverHandle) this._release(this._popoverHandle, true);

      const remaining = this._handles.slice().reverse();
      for (const handle of remaining) this._release(handle, true);

      if (this._host && this._host.isConnected && typeof this._host.remove === 'function') {
        this._host.remove();
      }
      this._host = null;
      this._shadow = null;
      this._style = null;
      this._envelope = null;
      this._languageHandle = null;
      this._surface = null;
      this._liveRegion = null;
      this._currentPlacement = null;
      this._geometryInvalidationListener = null;
      this._attention = null;
      this._mounted = false;
      this._fixtureEnabled = false;
      this._fixtureToken = null;
      this._adaptiveAuthority = null;
      this._adaptiveModel = null;
      this._adaptiveRenderedAtoms = Object.freeze([]);
      this._corpusScope = null;
      this._corpusAuthority = null;
      this._corpusModel = null;
      this._corpusActionConsumed = false;
      this._contractAuthority = null;
      this._contractModel = null;
      this._contractOnAction = null;
      this._ambientFocusOrigin = null;
      this._focusOrigin = null;
      this._focusedOrigin = null;
      this._focusedFallback = null;
      this._gateOrigin = null;
      this._buildingSurfaceScope = null;
      this._lastEscapeAt = null;
      this._consequenceExitPending = false;
      return this.ledger.snapshot();
    }
  }

  function createShell(options) {
    return new SkopeoShell(options);
  }

  const api = Object.freeze({
    PRIMITIVES: PRIMITIVES,
    ATTENTION: ATTENTION,
    ATTENTION_POLICY: ATTENTION_POLICY,
    SkopeoShell: SkopeoShell,
    createShell: createShell,
    zeroSnapshot: zeroSnapshot
  });

  globalThis.FSBSkopeoShell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
