import {
  ToolError,
  getLocalStorage,
  getPageGlobal,
  getAuthCache,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Types ---

/** Telegram TL object with polymorphic `_` discriminator */
export interface TLObject {
  _: string;
  [key: string]: unknown;
}

/** Result from messages.getDialogs */
export interface DialogsResult extends TLObject {
  count?: number;
  dialogs: TLObject[];
  messages: TLObject[];
  users: TLObject[];
  chats: TLObject[];
}

/** Result from messages.getHistory / messages.search */
export interface MessagesResult extends TLObject {
  count?: number;
  messages: TLObject[];
  users: TLObject[];
  chats: TLObject[];
  next_rate?: number;
}

/** Result from contacts.getContacts */
export interface ContactsResult extends TLObject {
  contacts: TLObject[];
  users: TLObject[];
}

/** Result from contacts.found */
export interface ContactsFound extends TLObject {
  my_results: TLObject[];
  results: TLObject[];
  users: TLObject[];
  chats: TLObject[];
}

/** Result from contacts.resolvedPeer */
export interface ResolvedPeer extends TLObject {
  peer: TLObject;
  users: TLObject[];
  chats: TLObject[];
}

// --- Auth ---

interface TelegramAuth {
  userId: number;
}

const getAuth = (): TelegramAuth | null => {
  const cached = getAuthCache<TelegramAuth>('telegram');
  if (cached) return cached;

  const userAuthStr = getLocalStorage('user_auth');
  if (!userAuthStr) return null;

  try {
    const userAuth = JSON.parse(userAuthStr) as { id?: number };
    if (!userAuth.id) return null;

    const auth: TelegramAuth = { userId: userAuth.id };
    setAuthCache('telegram', auth);
    return auth;
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  if (getAuth() !== null) return true;
  // Also check page globals — rootScope.myId is set after login
  const myId = getPageGlobal('rootScope.myId') as number | undefined;
  return myId !== undefined && myId > 0;
};

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 8000 });
    return true;
  } catch {
    return false;
  }
};

// --- API helpers ---

/** Get rootScope.managers — the proxy layer that forwards calls to the Web Worker */
const getManagers = (): Record<string, unknown> => {
  const managers = getPageGlobal('rootScope.managers') as Record<string, unknown> | undefined;
  if (!managers) throw ToolError.auth('Telegram not ready — please wait for the app to load.');
  return managers;
};

/**
 * Call a Telegram TL method via the internal apiManager.invokeApi proxy.
 * This routes through the Web Worker's MTProto layer with full auth.
 */
export const invokeApi = async <T extends TLObject>(method: string, params: Record<string, unknown>): Promise<T> => {
  const managers = getManagers();
  const apiManager = managers.apiManager as {
    invokeApi: (method: string, params: Record<string, unknown>) => Promise<T>;
  };

  if (!apiManager?.invokeApi) {
    throw ToolError.auth('Telegram API not available — please reload the page.');
  }

  try {
    return await apiManager.invokeApi(method, params);
  } catch (e: unknown) {
    const err = e as { type?: string; code?: number; message?: string };
    const type = err.type ?? '';
    const code = err.code ?? 0;

    if (type === 'AUTH_KEY_UNREGISTERED' || type === 'SESSION_REVOKED' || code === 401) {
      throw ToolError.auth('Session expired — please log in to Telegram again.');
    }

    if (type === 'FLOOD_WAIT' || type.startsWith('FLOOD_WAIT_') || code === 420) {
      const waitSeconds = Number.parseInt(type.replace('FLOOD_WAIT_', ''), 10) || 30;
      throw ToolError.rateLimited(`Rate limited — wait ${waitSeconds}s.`, waitSeconds * 1000);
    }

    if (type.includes('NOT_FOUND') || type === 'PEER_ID_INVALID' || type === 'MSG_ID_INVALID') {
      throw ToolError.notFound(err.message ?? `Not found: ${type}`);
    }

    if (type === 'CHAT_WRITE_FORBIDDEN' || type === 'CHAT_SEND_PLAIN_FORBIDDEN') {
      throw ToolError.validation(err.message ?? `Write forbidden: ${type}`);
    }

    if (type.includes('INVALID') || type.includes('BAD_REQUEST') || code === 400) {
      throw ToolError.validation(err.message ?? `Invalid request: ${type}`);
    }

    throw ToolError.internal(err.message ?? `Telegram API error: ${type || 'unknown'}`);
  }
};

/**
 * Call a method on a high-level manager (e.g., appUsersManager, appMessagesManager).
 * These are convenience wrappers around invokeApi with caching and state management.
 */
export const callManager = async <T>(managerName: string, methodName: string, ...args: unknown[]): Promise<T> => {
  const managers = getManagers();
  const manager = managers[managerName] as Record<string, (...args: unknown[]) => Promise<T>>;

  if (!manager) {
    throw ToolError.internal(`Manager "${managerName}" not found.`);
  }

  const fn = manager[methodName];
  if (!fn) {
    throw ToolError.internal(`Method "${methodName}" not found on manager "${managerName}".`);
  }

  try {
    return await fn(...args);
  } catch (e: unknown) {
    const err = e as { type?: string; code?: number; message?: string };
    if (err.type === 'PEER_ID_INVALID') {
      throw ToolError.notFound('Peer not found — invalid peer ID.');
    }
    throw ToolError.internal(err.message ?? `Manager call failed: ${managerName}.${methodName}`);
  }
};

/**
 * Resolve a peer ID to an InputPeer object for use in API calls.
 * Handles users, chats, and channels via appPeersManager.
 */
export const getInputPeer = async (peerId: number): Promise<TLObject> => {
  return callManager<TLObject>('appPeersManager', 'getInputPeerById', peerId);
};

/**
 * Resolve a user ID to an InputUser object with proper access_hash.
 * Required for TL methods that take an InputUser parameter (e.g., users.getFullUser).
 */
export const getInputUser = async (userId: number): Promise<TLObject> => {
  return callManager<TLObject>('appUsersManager', 'getUserInput', userId);
};

/**
 * Resolve a channel/supergroup ID to an InputChannel object with proper access_hash.
 * Required for TL methods that take an InputChannel parameter (e.g., channels.getFullChannel).
 */
export const getInputChannel = async (channelId: number): Promise<TLObject> => {
  return callManager<TLObject>('appChatsManager', 'getChannelInput', channelId);
};
