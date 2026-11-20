// Which browser a call goes to.
//
// One hub can hold several browsers at once: Chrome and Safari today. Every
// MCP session decides the browser for each of its calls here, before it
// registers an agent identity or sends anything, because an identity and its
// tab ownership belong to one browser.
//
// The rule that matters most: once a call or a session is tied to a browser,
// that browser being away is an error. It is never quietly replaced by another
// one, or an agent would act on the wrong browser's tabs.

import type { BrowserRosterEntry } from './types.js';

export const BROWSER_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export type BrowserRouteErrorCode =
  | 'BROWSER_NOT_CONNECTED'
  | 'AMBIGUOUS_TAB_BROWSER'
  | 'BROWSER_CHOICE_UNAVAILABLE';

export type BrowserRoute =
  // `browser` is null when there is nothing to choose between: a hub from
  // before the roster, or no browser attached yet. The call is then sent as it
  // always was.
  | { ok: true; browser: string | null }
  | {
      ok: false;
      code: BrowserRouteErrorCode;
      browser: string | null;
      connectedBrowsers: string[];
      tabId?: number;
      candidates?: string[];
    };

export interface BrowserCall {
  /** The attached browsers, or null from a hub that predates the roster. */
  roster: readonly BrowserRosterEntry[] | null;
  /** The browser the call itself names. */
  named?: unknown;
  /** The tab the call names, if any. */
  tabId?: number | null;
  /** Browsers this session has seen that tab in. */
  seenIn?: readonly string[];
  /** The browser this session's last call used. */
  current?: string | null;
  /** The browser this client was configured to start in (FSB_BROWSER). */
  configured?: string | null;
}

/** A browser name as a caller may write it: trimmed and lower-cased, or null. */
export function normalizeBrowserName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return name ? name.slice(0, 64) : null;
}

/**
 * The browser a call lands in when nothing has tied it to one: the most
 * recently focused, then Chrome, then whichever attached first. Never by
 * connect time alone, or a service-worker restart would move the default to
 * the browser that happened to reconnect last.
 *
 * Focus is compared only when every attached browser reports it. An extension
 * from before the report sends none, and would otherwise lose the default to
 * any browser that does: agents that have always driven Chrome would be moved
 * to Safari the day Safari attached.
 */
export function pickDefaultBrowser(roster: readonly BrowserRosterEntry[]): string | null {
  if (roster.length === 0) return null;
  if (roster.every((entry) => entry.focusedAt !== null)) {
    return roster.reduce((latest, entry) => (
      (entry.focusedAt as number) > (latest.focusedAt as number) ? entry : latest
    )).key;
  }
  if (roster.some((entry) => entry.key === 'chrome')) return 'chrome';
  return roster[0].key;
}

export function resolveBrowser(call: BrowserCall): BrowserRoute {
  const named = normalizeBrowserName(call.named);
  const current = normalizeBrowserName(call.current);
  const configured = normalizeBrowserName(call.configured);

  if (call.roster === null) {
    // A hub from before the roster serves one browser and takes no choice.
    // That browser is always a Chromium one: such a hub refuses Safari.
    const wanted = named ?? current ?? configured;
    if (wanted && wanted !== 'chrome') {
      return { ok: false, code: 'BROWSER_CHOICE_UNAVAILABLE', browser: wanted, connectedBrowsers: [] };
    }
    return { ok: true, browser: null };
  }

  const connected = call.roster.map((entry) => entry.key);
  // Nothing attached: the bridge's own not-connected error is the right one.
  if (connected.length === 0) return { ok: true, browser: null };

  const decided = (browser: string): BrowserRoute => connected.includes(browser)
    ? { ok: true, browser }
    : { ok: false, code: 'BROWSER_NOT_CONNECTED', browser, connectedBrowsers: connected };

  // 1. The browser the call names.
  if (named) return decided(named);

  // 2. The browser the call's tab lives in, as far as this session has seen.
  const tabId = typeof call.tabId === 'number' && Number.isFinite(call.tabId) ? call.tabId : null;
  if (tabId !== null) {
    const seenIn = [...new Set(call.seenIn ?? [])];
    if (seenIn.length === 1) return decided(seenIn[0]);
    if (seenIn.length > 1) {
      if (current && seenIn.includes(current)) return decided(current);
      return {
        ok: false,
        code: 'AMBIGUOUS_TAB_BROWSER',
        browser: null,
        connectedBrowsers: connected,
        tabId,
        candidates: seenIn,
      };
    }
  }

  // 3. Where this session already is.
  if (current) return decided(current);

  // 4. Where this client was configured to start.
  if (configured) return decided(configured);

  // 5. Nothing ties the call to a browser.
  return { ok: true, browser: pickDefaultBrowser(call.roster) };
}

/** The result a tool returns when a call could not be given a browser. */
export function browserRouteFailure(route: Extract<BrowserRoute, { ok: false }>): Record<string, unknown> {
  const failure: Record<string, unknown> = {
    success: false,
    error: route.code.toLowerCase(),
    code: route.code,
    errorCode: route.code,
    browser: route.browser,
    connectedBrowsers: route.connectedBrowsers,
  };
  if (route.tabId !== undefined) failure.tabId = route.tabId;
  if (route.candidates) failure.candidates = route.candidates;
  return failure;
}

/** Tab ids a result mentions, so a later call that names one can be routed. */
export function tabIdsIn(result: Record<string, unknown> | null | undefined): number[] {
  if (!result || typeof result !== 'object') return [];
  const ids = new Set<number>();
  const add = (value: unknown): void => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ids.add(value);
  };
  add(result.tabId);
  add(result.activeTabId);
  const tab = result.tab;
  if (tab && typeof tab === 'object') add((tab as Record<string, unknown>).id);
  if (Array.isArray(result.tabs)) {
    for (const entry of result.tabs.slice(0, 2000)) {
      if (!entry || typeof entry !== 'object') continue;
      add((entry as Record<string, unknown>).id);
      add((entry as Record<string, unknown>).tabId);
    }
  }
  return [...ids];
}
