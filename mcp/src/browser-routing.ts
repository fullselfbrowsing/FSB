// Which browser a call goes to.
//
// One hub can hold several browsers at once: every Chrome profile that has the
// extension, other Chromium browsers, and Safari. Each one is an "install" (one
// extension in one profile) and has its own key. Every MCP session decides the
// browser for each of its calls here, before it registers an agent identity or
// sends anything, because an identity and its tab ownership belong to one
// browser.
//
// The rule that matters most: once a call or a session is tied to a browser,
// that browser being away is an error. It is never quietly replaced by another
// one, or an agent would act on the wrong profile's tabs.

import type { BrowserKind, BrowserRosterEntry } from './types.js';

export const BROWSER_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

const BROWSER_KINDS: readonly BrowserKind[] = ['chrome', 'safari'];
const INSTALL_ID_MIN_LENGTH = 8;
// How much of an install id a key shows, shortest first. A longer one is used
// only when a shorter one already names a different install.
const KEY_ID_LENGTHS = [8, 12, 16, 24] as const;
const KEY_SUFFIX_LIMIT = 9;

export function isBrowserKind(value: unknown): value is BrowserKind {
  return value === 'chrome' || value === 'safari';
}

/**
 * An install id as a key can carry it: lower-case letters and digits only.
 * Null when there is too little of it to tell two installs apart.
 */
export function compactInstallId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 128) return null;
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact.length >= INSTALL_ID_MIN_LENGTH ? compact : null;
}

/**
 * The keys one install may be known by, in the order to try them.
 *
 * An install that says who it is (every extension since 0.9.92) is named after
 * its install id: "chrome-4187c196". The id is made once per profile and kept
 * in the extension's storage, so the key is the same after a reconnect, a
 * browser restart or a new hub, and can be written into a client's config.
 *
 * A build that never says is named after the extension it is: all of its
 * profiles share "chrome-legacy-badgafnf", so only one of them can be attached.
 */
export function browserKeyCandidates(
  kind: BrowserKind,
  extensionId: string | null,
  installInstanceId: string | null,
): string[] {
  const candidates = browserKeyStems(kind, extensionId, installInstanceId);
  const first = candidates[0];
  for (let suffix = 2; first && suffix <= KEY_SUFFIX_LIMIT; suffix += 1) {
    candidates.push(`${first}-${suffix}`);
  }
  return candidates.filter((candidate) => BROWSER_KEY_PATTERN.test(candidate));
}

/**
 * The keys that can only mean this install: its id at each length. The
 * numbered ones browserKeyCandidates adds are handed out by arrival and say
 * nothing about which install holds them.
 */
export function browserKeyStems(
  kind: BrowserKind,
  extensionId: string | null,
  installInstanceId: string | null,
): string[] {
  const compact = compactInstallId(installInstanceId);
  let stems: string[];
  if (compact) {
    stems = KEY_ID_LENGTHS.map((length) => `${kind}-${compact.slice(0, length)}`);
  } else {
    const extension = kind === 'chrome' && typeof extensionId === 'string'
      ? extensionId.toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
    stems = extension
      ? [8, 16].map((length) => `${kind}-legacy-${extension.slice(0, length)}`)
      : [`${kind}-legacy`];
  }
  return [...new Set(stems)].filter((stem) => BROWSER_KEY_PATTERN.test(stem));
}

export type BrowserRouteErrorCode =
  | 'BROWSER_NOT_CONNECTED'
  | 'AMBIGUOUS_TAB_BROWSER'
  | 'BROWSER_CHOICE_UNAVAILABLE';

export type BrowserRoute =
  // `browser` is null when there is nothing to choose between: a hub from
  // before the roster, or no browser attached yet. The call is then sent as it
  // always was. `scope` is set when such a hub's one browser is known to be
  // the one the call is tied to: the call is sent unnamed, with the identity
  // the session already has in that browser.
  | { ok: true; browser: string | null; scope?: string }
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
  /**
   * With no roster: the one browser the older hub reports serving, if it
   * reports one.
   */
  legacy?: { extensionId?: unknown; installInstanceId?: unknown } | null;
}

/** A browser name as a caller may write it: trimmed and lower-cased, or null. */
export function normalizeBrowserName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return name ? name.slice(0, 64) : null;
}

/**
 * The browser focused most recently, or null unless every one of them reports
 * focus. An extension from before the report sends none, and would otherwise
 * lose to any browser that does.
 */
export function lastFocusedBrowser(roster: readonly BrowserRosterEntry[]): string | null {
  if (roster.length === 0 || !roster.every((entry) => entry.focusedAt !== null)) return null;
  return roster.reduce((latest, entry) => (
    (entry.focusedAt as number) > (latest.focusedAt as number) ? entry : latest
  )).key;
}

/**
 * The browser a call lands in when nothing has tied it to one.
 *
 * A Chromium browser before Safari, whatever either reports. The hub admits
 * one Chromium extension id at a time, so every Chromium browser attached is
 * that extension. A Safari Origin is random and its state frame says what it
 * likes, so the hub cannot tell FSB in Safari from any other Safari extension.
 * If Safari's focus reports could win the default, any Safari extension could
 * claim focus and be handed every call that names no browser. Safari is used
 * when a call names it, or when no Chromium browser is attached. (A paired
 * Safari is not an exception: pairing it closes every Chromium browser.)
 *
 * Among those, the one focused most recently, once every one of them reports
 * focus. Otherwise the choice has to be one that does not move by itself: one
 * with a window open before one without, then the one attached longest.
 * `since` survives a worker restart, so a restart does not hand the default to
 * another profile.
 */
export function pickDefaultBrowser(roster: readonly BrowserRosterEntry[]): string | null {
  if (roster.length === 0) return null;
  const chromium = roster.filter((entry) => entry.kind === 'chrome');
  const ofKind = chromium.length > 0 ? chromium : roster;
  const focused = lastFocusedBrowser(ofKind);
  if (focused) return focused;
  // A count of zero is the only thing that says "no window". Null is a build
  // that has not reported yet, and is not held against it.
  const withWindow = ofKind.filter((entry) => entry.windows !== 0);
  const pool = withWindow.length > 0 ? withWindow : ofKind;
  // The roster is in the order browsers attached, so a tie stays with the earlier one.
  return pool.reduce((first, entry) => (
    (entry.since ?? entry.connectedAt) < (first.since ?? first.connectedAt) ? entry : first
  )).key;
}

/**
 * The browser of one kind the session is in, attached or not. Every key starts
 * with its kind ("chrome-4187c196"), so this needs no roster: a profile that
 * is away for a moment (a worker restart, a reconnect) is still the one meant.
 */
function currentOfKind(name: string, current: string | null): string | null {
  return current && isBrowserKind(name) && current.startsWith(`${name}-`) ? current : null;
}

/**
 * The attached browser a name means, or null if it means none of them.
 *
 * A name is a key from the roster ("chrome-4187c196"), or a kind ("chrome",
 * "safari"). A kind means the browser of that kind the session is already in,
 * and otherwise the default among the browsers of that kind. So "chrome" keeps
 * working as it did when there was one Chrome, and never moves a session that
 * is already in a Chrome profile to another one: while that profile is away,
 * "chrome" means nothing attached.
 */
export function matchBrowser(
  roster: readonly BrowserRosterEntry[],
  name: string,
  current: string | null = null,
): string | null {
  if (roster.some((entry) => entry.key === name)) return name;
  if (!BROWSER_KINDS.includes(name as BrowserKind)) return null;
  const own = currentOfKind(name, current);
  if (own) return roster.some((entry) => entry.key === own) ? own : null;
  return pickDefaultBrowser(roster.filter((entry) => entry.kind === name));
}

export function resolveBrowser(call: BrowserCall): BrowserRoute {
  const named = normalizeBrowserName(call.named);
  const current = normalizeBrowserName(call.current);
  const configured = normalizeBrowserName(call.configured);

  if (call.roster === null) {
    // A hub from before the roster serves one browser and takes no choice.
    // That browser is always a Chromium one: such a hub refuses Safari.
    // Such a hub says which install it holds (every server since the state
    // frame does). Knowing that, the session is placed in that install as a
    // current hub would place it: it keeps one identity there, and stays there
    // when a current server takes the bridge back.
    const legacy = call.legacy;
    const served = legacy && typeof legacy.installInstanceId === 'string'
      ? browserKeyStems(
          'chrome',
          typeof legacy.extensionId === 'string' ? legacy.extensionId : null,
          legacy.installInstanceId,
        )
      : [];
    const wanted = named ?? current ?? configured;
    if (!wanted || wanted === 'chrome') {
      return served.length > 0 ? { ok: true, browser: null, scope: served[0] } : { ok: true, browser: null };
    }
    // A session that was working in a profile must not be stopped because an
    // older server now runs the bridge, nor moved to whatever that server
    // happens to hold. It goes on only if the hub's one browser is that profile.
    if (served.includes(wanted)) return { ok: true, browser: null, scope: wanted };
    return { ok: false, code: 'BROWSER_CHOICE_UNAVAILABLE', browser: wanted, connectedBrowsers: [] };
  }

  const connected = call.roster.map((entry) => entry.key);
  if (connected.length === 0) {
    // Nothing attached, so the bridge's own not-connected error is the right
    // one. A call tied to one browser still carries that browser's name: if
    // another browser attaches before the call is sent, it is refused there
    // and not delivered to the newcomer.
    const seen = [...new Set(call.seenIn ?? [])];
    const tabBrowser = typeof call.tabId === 'number' && Number.isFinite(call.tabId) && seen.length === 1
      ? seen[0]
      : null;
    // A kind the session is already in names that browser, as it does below.
    const own = named ? currentOfKind(named, current) : null;
    const tied = own ?? named ?? tabBrowser ?? current ?? configured;
    return { ok: true, browser: tied && BROWSER_KEY_PATTERN.test(tied) && !isBrowserKind(tied) ? tied : null };
  }

  const roster = call.roster;
  const decided = (name: string): BrowserRoute => {
    const browser = matchBrowser(roster, name, current);
    // A kind that meant the session's own browser is reported as that
    // browser, so the caller is told which profile is away.
    return browser
      ? { ok: true, browser }
      : {
          ok: false,
          code: 'BROWSER_NOT_CONNECTED',
          browser: currentOfKind(name, current) ?? name,
          connectedBrowsers: connected,
        };
  };

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

// The query parameter of the HTTP MCP endpoint that names the browser a
// session starts in. One HTTP server answers many sessions, so it is the only
// way a client without request headers can be started somewhere.
export const START_BROWSER_PARAMETER = 'browser';

/** An MCP endpoint that starts its sessions in one browser. Unchanged when none is named. */
export function endpointStartingIn(endpoint: string, browser: string | null | undefined): string {
  if (!browser) return endpoint;
  const url = new URL(endpoint);
  url.searchParams.set(START_BROWSER_PARAMETER, browser);
  return url.toString();
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
