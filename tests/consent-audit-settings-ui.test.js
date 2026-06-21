'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-07) -- Consent & Audit settings-UI RED contract.
 *
 * Wave 0 RED test: the "Consent & Audit" control-panel section + its options.js
 * wiring do NOT exist yet (Plan 04 adds them per 30-UI-SPEC.md). This reads
 * extension/ui/control_panel.html and extension/ui/options.js as TEXT and asserts
 * the full 30-UI-SPEC Acceptance Criteria surface, the change-report-settings-ui.
 * test.js idiom. It fails loudly today (the section markup is absent) and turns
 * GREEN only when Plan 04 ships the section to this exact contract. Never silently
 * passes.
 *
 * Asserts (30-UI-SPEC Acceptance Criteria, verbatim load-bearing strings):
 *   - nav + section shell (data-section="consent-audit", id="consent-audit", h2),
 *   - per-origin consent (consentOriginList, Off/Ask/Auto data-mode in a radiogroup,
 *     the mutating toggle, Sensitive/Blocked/Per-Origin Consent strings, empty copy),
 *   - pending-Ask (pendingRequestList, Pending Requests/Grant/Deny, .control-btn.danger),
 *   - audit log (auditLogTable as a table+thead, the SEVEN column headers,
 *     auditExportBtn/auditClearBtn with Export Log/Clear Log, NO secret column),
 *   - wiring (cacheElements ids, click handlers on export+clear, storage.onChanged),
 *   - legal (Legal & Service Policy, LEGAL.md, privacy.html, blocked services),
 *   - no emoji anywhere in the new surface.
 *
 * Run: node tests/consent-audit-settings-ui.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- GOV-07 Consent & Audit settings UI (RED until Plan 04) ---');

  const htmlPath = path.resolve(__dirname, '..', 'extension', 'ui', 'control_panel.html');
  const optsPath = path.resolve(__dirname, '..', 'extension', 'ui', 'options.js');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const opts = fs.readFileSync(optsPath, 'utf8');

  // ---- Nav + section ----
  ok(/data-section=["']consent-audit["']/.test(html), 'nav contains data-section="consent-audit"');
  ok(/<section[^>]*id=["']consent-audit["']/.test(html), 'a <section id="consent-audit"> exists');
  ok(/<h2[^>]*>\s*Consent &amp; Audit\s*<\/h2>/.test(html) || /<h2[^>]*>\s*Consent & Audit\s*<\/h2>/.test(html),
    'section header <h2>Consent & Audit</h2> present');
  ok(/<span[^>]*>\s*Consent & Audit\s*<\/span>/.test(html) || /Consent &amp; Audit/.test(html),
    'nav span text "Consent & Audit" present');

  // ---- Per-origin consent ----
  ok(/id=["']consentOriginList["']/.test(html), 'element id="consentOriginList" exists');
  ok(/data-mode=["']off["']/.test(html) && /data-mode=["']ask["']/.test(html) && /data-mode=["']auto["']/.test(html),
    'Off/Ask/Auto control present as three data-mode buttons (off/ask/auto)');
  ok(/role=["']radiogroup["']/.test(html), 'the mode control is wrapped in a role="radiogroup"');
  ok(/Allow mutating \(write\) calls/.test(html), 'the "Allow mutating (write) calls" toggle label is present');
  ok(/Per-Origin Consent/.test(html), 'string "Per-Origin Consent" present');
  ok(/Sensitive/.test(html), 'string "Sensitive" present (sensitive badge)');
  ok(/Blocked/.test(html), 'string "Blocked" present (denylisted badge)');
  ok(/No origins seen yet\./.test(html), 'per-origin empty-state copy "No origins seen yet." present');

  // ---- Pending-Ask ----
  ok(/id=["']pendingRequestList["']/.test(html), 'element id="pendingRequestList" exists');
  ok(/Pending Requests/.test(html), 'string "Pending Requests" present');
  ok(/>\s*Grant\s*</.test(html) || /Grant/.test(html), 'string "Grant" present');
  ok(/>\s*Deny\s*</.test(html) || /Deny/.test(html), 'string "Deny" present');
  ok(/class=["'][^"']*control-btn[^"']*danger[^"']*["']/.test(html) || /class=["'][^"']*overflow-item[^"']*danger[^"']*["']/.test(html),
    'a .control-btn.danger (or .overflow-item.danger) is used for Deny');
  ok(/No pending requests\./.test(html), 'pending empty-state copy "No pending requests." present');

  // ---- Audit log ----
  ok(/id=["']auditLogTable["']/.test(html), 'element id="auditLogTable" exists');
  ok(/<table[\s\S]*?<thead/.test(html), 'audit log rendered as a <table> with a <thead>');
  for (const col of ['Time', 'Origin', 'Capability', 'Method', 'Side Effect', 'Consent', 'Outcome']) {
    ok(new RegExp('>\\s*' + col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<').test(html),
      'audit column header "' + col + '" present');
  }
  ok(/id=["']auditExportBtn["']/.test(html), 'button id="auditExportBtn" exists');
  ok(/id=["']auditClearBtn["']/.test(html), 'button id="auditClearBtn" exists');
  ok(/Export Log/.test(html), 'export label "Export Log" present');
  ok(/Clear Log/.test(html), 'clear label "Clear Log" present');
  ok(/No audit entries yet\./.test(html), 'audit empty-state copy "No audit entries yet." present');

  // ---- NO secret column/template field at the UI layer (GOV-06 string-absence) ----
  // The audit section markup must not introduce a column header or template field
  // named for any auth artifact. We assert the audit TABLE region contains none of
  // these as a header cell. (A broad page grep would false-positive on the privacy
  // copy elsewhere; restrict to the audit table block.)
  const tableMatch = html.match(/<table[^>]*id=["']auditLogTable["'][\s\S]*?<\/table>/);
  const auditBlock = tableMatch ? tableMatch[0] : '';
  for (const secret of ['args', 'body', 'cookie', 'token', 'csrf', 'authorization', 'bearer']) {
    ok(!new RegExp('<th[^>]*>\\s*' + secret + '\\s*<\\/th>', 'i').test(auditBlock),
      'audit table has NO "' + secret + '" column header (GOV-06 UI guard)');
  }

  // ---- Wiring (options.js) ----
  ok(/elements\.consentOriginList\s*=\s*document\.getElementById\(['"]consentOriginList['"]\)/.test(opts),
    'cacheElements wires elements.consentOriginList');
  ok(/elements\.pendingRequestList\s*=\s*document\.getElementById\(['"]pendingRequestList['"]\)/.test(opts),
    'cacheElements wires elements.pendingRequestList');
  ok(/elements\.auditLogTable\s*=\s*document\.getElementById\(['"]auditLogTable['"]\)/.test(opts),
    'cacheElements wires elements.auditLogTable');
  ok(/elements\.auditExportBtn\s*=\s*document\.getElementById\(['"]auditExportBtn['"]\)/.test(opts),
    'cacheElements wires elements.auditExportBtn');
  ok(/elements\.auditClearBtn\s*=\s*document\.getElementById\(['"]auditClearBtn['"]\)/.test(opts),
    'cacheElements wires elements.auditClearBtn');
  ok(/elements\.auditExportBtn[\s\S]{0,200}addEventListener\(['"]click['"]/.test(opts),
    'setupEventListeners attaches a click handler to auditExportBtn');
  ok(/elements\.auditClearBtn[\s\S]{0,200}addEventListener\(['"]click['"]/.test(opts),
    'setupEventListeners attaches a click handler to auditClearBtn');
  ok(/chrome\.storage\.onChanged/.test(opts),
    'a render/refresh path subscribes to chrome.storage.onChanged (consent + audit stores)');

  // ---- Legal ----
  ok(/Legal & Service Policy/.test(html), 'string "Legal & Service Policy" present');
  ok(/LEGAL\.md/.test(html), 'a LEGAL.md reference is present');
  ok(/privacy\.html/.test(html), 'a privacy.html link is present');
  ok(/service-denylist\.json/.test(html) || /blocked services/i.test(html) || /View blocked services/.test(html),
    'a blocked-services (service-denylist.json / deniedOrigins) reference is present');

  // ---- No emoji anywhere in the NEW consent-audit section markup ----
  // Extract the consent-audit <section> block and assert it carries no emoji.
  const sectionMatch = html.match(/<section[^>]*id=["']consent-audit["'][\s\S]*?<\/section>/);
  const sectionBlock = sectionMatch ? sectionMatch[0] : '';
  // Emoji range scan (covers the common pictographic + symbol blocks).
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/u;
  ok(sectionBlock.length === 0 || !EMOJI_RE.test(sectionBlock),
    'no emoji characters in the consent-audit section markup');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-audit-settings-ui.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
