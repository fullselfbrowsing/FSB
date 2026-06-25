import { ToolError, fetchFromPage, getPageGlobal, httpStatusToToolError, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Fiverr renders a `window.initialData.FiverrContext` object on every page. For
// logged-in users it carries a positive numeric `userId` plus a `csrfToken` used
// for write operations. Logged-out visitors get `userId: 0`. The actual API auth
// relies on HttpOnly session cookies sent automatically via `credentials: 'include'`.

interface FiverrContext {
  userId: number;
  userGuid: string;
  csrfToken: string;
  currency: string;
  countryCode: string;
  locale: string;
  isPro: boolean;
}

const getContext = (): FiverrContext | null => {
  const userId = getPageGlobal('initialData.FiverrContext.userId') as number | undefined;
  if (!userId || userId <= 0) return null;
  return {
    userId,
    userGuid: (getPageGlobal('initialData.FiverrContext.userGuid') as string | undefined) ?? '',
    csrfToken: (getPageGlobal('initialData.FiverrContext.csrfToken') as string | undefined) ?? '',
    currency: (getPageGlobal('initialData.FiverrContext.currency') as string | undefined) ?? 'USD',
    countryCode: (getPageGlobal('initialData.FiverrContext.countryCode') as string | undefined) ?? '',
    locale: (getPageGlobal('initialData.FiverrContext.locale') as string | undefined) ?? '',
    isPro: (getPageGlobal('initialData.FiverrContext.isPro') as boolean | undefined) ?? false,
  };
};

/** The logged-in user's Fiverr username, sourced from page globals (not in FiverrContext). */
export const getUsername = (): string =>
  (getPageGlobal('initialData.UserActivationMessage.username') as string | undefined) ??
  (getPageGlobal('initialData.FloatingChat.currentUsername') as string | undefined) ??
  '';

export const isAuthenticated = (): boolean => getContext() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const requireContext = (): FiverrContext => {
  const ctx = getContext();
  if (!ctx) throw ToolError.auth('Not authenticated — please log in to Fiverr.');
  return ctx;
};

export const normalizeFiverrUsername = (value: string, fieldName = 'username'): string => {
  const username = value.trim().replace(/^[@/]+/, '');
  if (!username) throw ToolError.validation(`${fieldName} is required.`);
  if (username.includes('/')) {
    throw ToolError.validation(`${fieldName} must be a single Fiverr username with no slashes.`);
  }
  return username;
};

// --- SSR data-island extraction ---
// Fiverr pages (search, gig, seller profile) are server-rendered React apps. The
// page data is embedded in a `<script id="perseus-initial-props" type="application/json">`
// island. Attribute order varies in the raw HTML, so the matcher is order-agnostic.
// This is the only reliable way to read these pages — Fiverr's JSON APIs for them
// are protected by PerimeterX bot detection and reject adapter-originated fetches.

const PERSEUS_ISLAND_RE = /<script[^>]*id="perseus-initial-props"[^>]*>([\s\S]*?)<\/script>/;

export const fetchPerseusProps = async (path: string): Promise<Record<string, unknown>> => {
  requireContext();

  const response = await fetchFromPage(path, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw httpStatusToToolError(response, `Failed to load ${path}`);

  const html = await response.text();
  const match = html.match(PERSEUS_ISLAND_RE);
  if (!match?.[1]) throw ToolError.notFound(`No page data found at ${path} — it may not exist or require login.`);

  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    throw ToolError.internal(`Failed to parse page data at ${path}`);
  }
};

// --- Inbox JSON API ---
// Fiverr's messaging endpoints under `/inbox/*` return JSON and are reachable from
// adapter fetches (they are not behind the bot-detection layer that guards the
// gig/seller JSON APIs).

export const fetchInboxJson = async <T>(path: string): Promise<T | null> => {
  requireContext();

  const response = await fetchFromPage(path, {
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!response.ok) throw httpStatusToToolError(response, `Failed to load ${path}`);
  if (response.status === 204) return null;
  return (await response.json()) as T;
};

// --- Sending messages ---
// Fiverr's inbox composer posts new messages to /inbox/conversations/messages as
// JSON. The body wraps the text in a content_blocks array and identifies the thread
// by the recipient's username. Auth is the session cookie; the page CSRF token is
// sent as a header for the write.
const SEND_MESSAGE_PATH = '/inbox/conversations/messages';

interface RawSendResponse {
  id?: string;
  message?: { id?: string };
}

export interface SendMessageResult {
  messageId: string;
}

export const sendInboxMessage = async (recipientUsername: string, body: string): Promise<SendMessageResult> => {
  const ctx = requireContext();

  const response = await fetchFromPage(SEND_MESSAGE_PATH, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': ctx.csrfToken,
    },
    body: JSON.stringify({
      content_blocks: [{ type: 'text', plain_text: body, plain_text_format: null }],
      content_type: 'text',
      participants_usernames: [recipientUsername],
      channel_id: null,
      pending_attachment_ids: [],
    }),
  });
  if (!response.ok) throw httpStatusToToolError(response, 'Failed to send message');
  if (response.status === 204) return { messageId: '' };

  const data = (await response.json()) as RawSendResponse;
  return { messageId: data.id ?? data.message?.id ?? '' };
};
