/*
 * Phase 66 / Plan 01 -- H1 export of the MCP sessions recorded 2026-09-16..21
 * (D-20, D-21).
 *
 * Run it only in the DevTools console of the Web Store FSB control panel
 * (Chrome Profile 2, extension id badgafnfchcihdfnjneklogedcdkmjfk):
 *   chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/ui/control_panel.html
 * Paste the whole file and press Enter. Do it before any other MCP use in that
 * profile: each new MCP session can push an old one out of history.
 *
 * It reads the session index, pages every MCP session that started between
 * local 2026-09-16 00:00 and 2026-09-22 00:00 through the extension's own
 * getSessionDetail runtime message, and downloads one file,
 * fsb-history-2026-09-16_21.json. That file can hold page content, typed
 * values and URLs from real sites. Move it into scripts/bench/.local/
 * (gitignored) and never commit it; only the sanitized metrics that
 * scripts/bench/export-history.mjs derives from it are committed.
 */
(async () => {
  const WEB_STORE_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
  const FILE_NAME = 'fsb-history-2026-09-16_21.json';
  const FROM_MS = Date.parse('2026-09-16T00:00:00'); // local time, inclusive
  const TO_MS = Date.parse('2026-09-22T00:00:00'); // local time, exclusive
  const MAX_PAGES = 200;

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.storage) {
    console.error('FSB history export: run this in the control panel console at chrome-extension://' + WEB_STORE_ID + '/ui/control_panel.html');
    return;
  }
  if (chrome.runtime.id !== WEB_STORE_ID) {
    console.warn('FSB history export: this page belongs to extension ' + chrome.runtime.id + ', not the Web Store build ' + WEB_STORE_ID + '. The export continues and records that.');
  }

  try {
    const stored = await chrome.storage.local.get(['fsbSessionIndex']);
    const fsbSessionIndex = Array.isArray(stored.fsbSessionIndex) ? stored.fsbSessionIndex : [];
    const seenIds = new Set();
    const index = fsbSessionIndex.filter((entry) => {
      if (!entry || entry.mode !== 'mcp-agent' || typeof entry.id !== 'string') return false;
      if (!Number.isFinite(entry.startTime) || entry.startTime < FROM_MS || entry.startTime >= TO_MS) return false;
      if (seenIds.has(entry.id)) return false;
      seenIds.add(entry.id);
      return true;
    });

    const sessions = [];
    let eventCount = 0;
    let failedCount = 0;
    for (const indexEntry of index) {
      const sessionId = indexEntry.id;
      let afterSequence = -1;
      let session = null;
      let events = [];
      let legacy = false;
      let error = null;
      let truncated = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await chrome.runtime.sendMessage({ action: 'getSessionDetail', sessionId, afterSequence, limit: 500 });
        if (!response || response.success !== true) {
          error = response && typeof response.error === 'string' ? response.error : 'no response';
          break;
        }
        if (response.legacy === true) legacy = true;
        if (response.session) session = response.session;
        if (Array.isArray(response.events)) events = events.concat(response.events);
        if (response.hasMore !== true) break;
        if (!Number.isFinite(response.nextSequence) || response.nextSequence <= afterSequence) {
          error = 'paging stopped: no next sequence';
          break;
        }
        afterSequence = response.nextSequence;
        if (page === MAX_PAGES - 1) truncated = true;
      }
      const record = { indexEntry, legacy, session, events };
      if (error) {
        record.error = error;
        failedCount += 1;
      }
      if (truncated) record.truncated = true;
      sessions.push(record);
      eventCount += events.length;
    }

    const exported = {
      schema: 'fsb-history-export',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      window: { from: '2026-09-16', to: '2026-09-21' },
      index,
      sessions
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(exported)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    if (failedCount) {
      console.warn('FSB history export: ' + failedCount + ' session(s) did not load fully; each keeps an error field.');
    }
    console.log('exported ' + sessions.length + ' sessions (' + eventCount + ' events)');
  } catch (err) {
    console.error('FSB history export failed: ' + (err && err.message ? err.message : String(err)));
  }
})();
