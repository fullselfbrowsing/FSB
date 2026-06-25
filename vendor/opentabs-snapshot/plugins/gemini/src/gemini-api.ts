import {
  ToolError,
  fetchFromPage,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
} from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface GeminiAuth {
  atToken: string;
  bl: string;
  fsid: string;
  email: string;
  userId: string;
}

interface GeminiModel {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

interface StreamGenerateResponse {
  conversationId: string;
  responseId: string;
  responseChoiceId: string;
  text: string;
}

interface ConversationEntry {
  id: string;
  title: string;
  url: string;
}

// --- Auth ---

const getWizData = (key: string): string | undefined => getPageGlobal(`WIZ_global_data.${key}`) as string | undefined;

const getAuth = (): GeminiAuth | null => {
  const cached = getAuthCache<GeminiAuth>('gemini');
  if (cached?.atToken) return cached;

  const atToken = getWizData('SNlM0e');
  const bl = getWizData('cfb2h');
  const fsid = getWizData('FdrFJe');
  const email = getWizData('oPEP7c');
  const userId = getWizData('S06Grb');

  if (!atToken || !bl || !fsid) return null;

  const auth: GeminiAuth = {
    atToken,
    bl,
    fsid,
    email: email ?? '',
    userId: userId ?? '',
  };
  setAuthCache('gemini', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getUserInfo = (): { email: string; userId: string } => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Google Gemini.');
  return { email: auth.email, userId: auth.userId };
};

// --- RPC caller (batchexecute) ---

const requireAuth = (): GeminiAuth => {
  const auth = getAuth();
  if (!auth) {
    clearAuthCache('gemini');
    throw ToolError.auth('Not authenticated — please log in to Google Gemini.');
  }
  return auth;
};

const RPC_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'X-Same-Domain': '1',
  'x-goog-ext-525001261-jspb': '[1,null,null,null,null,null,null,null,[4]]',
  'x-goog-ext-73010989-jspb': '[0]',
};

/**
 * Parse the multi-line batchexecute response format.
 * Gemini returns: )]}'\n\n<length>\n<json-line>\n...
 */
const parseBatchResponse = <T>(text: string, rpcId: string): T => {
  const cleaned = text.replace(/^\)]\}'\n\n/, '');
  const lines = cleaned.split('\n');
  for (const line of lines) {
    try {
      if (!line.startsWith('[[')) continue;
      const parsed = JSON.parse(line);
      if (parsed[0]?.[1] === rpcId && parsed[0]?.[2]) {
        return JSON.parse(parsed[0][2]) as T;
      }
      if (parsed[0]?.[0] === 'er') {
        const code = parsed[0]?.[5] ?? 500;
        if (code === 401 || code === 403) {
          clearAuthCache('gemini');
          throw ToolError.auth('Authentication expired — please reload Google Gemini.');
        }
        throw ToolError.internal(`Gemini RPC error (${code}) for ${rpcId}`);
      }
    } catch (err) {
      if (err instanceof ToolError) throw err;
    }
  }
  throw ToolError.internal(`Failed to parse Gemini response for ${rpcId}`);
};

const getSourcePath = (): string => {
  const path = window.location.pathname;
  return encodeURIComponent(path);
};

export const callRpc = async <T>(rpcId: string, args: string): Promise<T> => {
  const auth = requireAuth();

  const body = `f.req=${encodeURIComponent(JSON.stringify([[[rpcId, args, null, 'generic']]]))}&at=${encodeURIComponent(auth.atToken)}&`;
  const reqid = Math.floor(Math.random() * 10_000_000);
  const sp = getSourcePath();

  const url = `/_/BardChatUi/data/batchexecute?rpcids=${rpcId}&source-path=${sp}&bl=${auth.bl}&f.sid=${auth.fsid}&hl=en&_reqid=${reqid}&rt=c`;

  const response = await fetchFromPage(url, {
    method: 'POST',
    headers: RPC_HEADERS,
    body,
  });

  const text = await response.text();
  return parseBatchResponse<T>(text, rpcId);
};

// --- StreamGenerate (send message) ---

const STREAM_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'X-Same-Domain': '1',
  'x-goog-ext-73010989-jspb': '[0]',
  'x-goog-ext-73010990-jspb': '[0]',
};

const parseStreamResponse = (text: string): StreamGenerateResponse => {
  const cleaned = text.replace(/^\)]\}'\n\n/, '');
  const lines = cleaned.split('\n');

  let conversationId = '';
  let responseId = '';
  let responseChoiceId = '';
  let responseText = '';

  // Parse all streaming chunks — the last chunk with response text has the full content
  for (const line of lines) {
    try {
      if (!line.startsWith('[[')) continue;
      const parsed = JSON.parse(line);
      if (!Array.isArray(parsed) || parsed[0]?.[0] !== 'wrb.fr') continue;

      const dataStr = parsed[0]?.[2];
      if (!dataStr) continue;

      const data = JSON.parse(dataStr);
      if (!data) continue;

      // Extract conversation ID and response ID
      if (data[1]?.[0]?.startsWith('c_')) {
        conversationId = data[1][0];
      }
      if (data[1]?.[1]?.startsWith('r_')) {
        responseId = data[1][1];
      }

      // Extract response text from candidates
      // Structure: data[4] = [[responseChoiceId, [textContent], ...], ...]
      // Each streaming chunk accumulates the full text, so later chunks have
      // more complete text. Always take the latest.
      const candidateArray = data[4]?.[0];
      if (Array.isArray(candidateArray) && candidateArray[0] && typeof candidateArray[0] === 'string') {
        if (candidateArray[0].startsWith('rc_')) {
          responseChoiceId = candidateArray[0];
        }
        if (Array.isArray(candidateArray[1]) && typeof candidateArray[1][0] === 'string') {
          responseText = candidateArray[1][0];
        }
      }
    } catch {
      // Skip unparseable lines
    }
  }

  if (!conversationId && !responseId) {
    // Check for error responses
    for (const line of lines) {
      try {
        if (!line.startsWith('[[')) continue;
        const parsed = JSON.parse(line);
        if (parsed[0]?.[0] === 'er') {
          const code = parsed[0]?.[5] ?? 500;
          if (code === 401 || code === 403) {
            clearAuthCache('gemini');
            throw ToolError.auth('Authentication expired — please reload Google Gemini.');
          }
          if (code === 429) throw ToolError.rateLimited('Gemini rate limited — please wait.');
          throw ToolError.internal(`Gemini error (${code})`);
        }
      } catch (err) {
        if (err instanceof ToolError) throw err;
      }
    }
    throw ToolError.internal('Failed to parse Gemini response — no conversation data found');
  }

  return { conversationId, responseId, responseChoiceId, text: responseText };
};

export const sendMessage = async (
  prompt: string,
  conversationId?: string,
  responseId?: string,
  responseChoiceId?: string,
  modelId?: string,
): Promise<StreamGenerateResponse> => {
  const auth = requireAuth();

  // Build the inner args array (69 elements matching the app's format)
  const inner: unknown[] = new Array(69).fill(null);

  // [0] = prompt tuple
  inner[0] = [prompt, 0, null, null, null, null, 0];
  // [1] = language
  inner[1] = ['en'];
  // [2] = conversation context (null for new conversation)
  if (conversationId && responseId && responseChoiceId) {
    inner[2] = [conversationId, responseId, responseChoiceId];
  }
  // Known required positions
  inner[6] = [1];
  inner[7] = 1;
  inner[10] = 1;
  inner[11] = 0;
  inner[17] = [[2]];
  inner[18] = 0;
  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [1];
  inner[53] = 0;
  inner[61] = [];
  inner[68] = 2;

  const outerPayload = JSON.stringify([null, JSON.stringify(inner)]);
  const body = `f.req=${encodeURIComponent(outerPayload)}&at=${encodeURIComponent(auth.atToken)}&`;
  const reqid = Math.floor(Math.random() * 10_000_000);

  // Build model header — include model ID if specified
  const resolvedModelId = modelId ?? 'fbb127bbb056c959';
  const modelHeader = `[1,null,null,null,"${resolvedModelId}",null,null,0,[4],null,null,1]`;
  const sessionId = crypto.randomUUID();

  const url = `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${auth.bl}&f.sid=${auth.fsid}&hl=en&_reqid=${reqid}&rt=c`;

  const response = await fetchFromPage(url, {
    method: 'POST',
    headers: {
      ...STREAM_HEADERS,
      'x-goog-ext-525001261-jspb': modelHeader,
      'x-goog-ext-525005358-jspb': `["${sessionId}",1]`,
    },
    body,
  });

  const text = await response.text();
  return parseStreamResponse(text);
};

// --- Model listing ---

export const getModels = async (): Promise<GeminiModel[]> => {
  const data = await callRpc<unknown[]>('otAQ7b', '[]');

  // Models are at data[15] — array of model tuples where each tuple is [id, name, description, ...]
  const rawModels = (data?.[15] as unknown[][] | undefined) ?? [];
  const models: GeminiModel[] = [];

  for (const m of rawModels) {
    if (!Array.isArray(m)) continue;
    models.push({
      id: (m[0] as string) ?? '',
      displayName: (m[1] as string) ?? '',
      description: (m[2] as string) ?? '',
      isDefault: models.length === 0,
    });
  }

  return models;
};

// --- Conversation listing (DOM-based) ---

export const getConversationsFromDOM = (): ConversationEntry[] => {
  const anchors = document.querySelectorAll('a[data-test-id="conversation"]');
  const conversations: ConversationEntry[] = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? '';
    const title = anchor.textContent?.trim() ?? '';
    const id = href.split('/app/')[1] ?? '';
    if (id) {
      conversations.push({ id, title, url: `https://gemini.google.com${href}` });
    }
  }

  return conversations;
};

// --- Conversation details from DOM ---

export const getConversationMessages = (): { prompt: string; response: string }[] => {
  const container = document.querySelector('[data-test-id="chat-history-container"]');
  if (!container) return [];

  const messages: { prompt: string; response: string }[] = [];
  const turns = container.querySelectorAll('.conversation-turn');

  if (turns.length === 0) {
    // Alternative: parse from query/response containers
    const queryContainers = container.querySelectorAll('.query-text, .user-query, [data-test-id="user-message"]');
    const responseContainers = container.querySelectorAll(
      '.model-response-text, .response-container-content, [data-test-id="model-response"]',
    );

    const count = Math.max(queryContainers.length, responseContainers.length);
    for (let i = 0; i < count; i++) {
      messages.push({
        prompt: queryContainers[i]?.textContent?.trim() ?? '',
        response: responseContainers[i]?.textContent?.trim() ?? '',
      });
    }
  }

  return messages;
};

// --- Navigate to conversation ---

export const navigateToConversation = (conversationId: string): void => {
  window.location.href = `https://gemini.google.com/app/${conversationId}`;
};

// --- Get current conversation ID from URL ---

export const getCurrentConversationId = (): string | null => {
  const path = window.location.pathname;
  const match = path.match(/^\/app\/([a-f0-9]+)$/);
  return match?.[1] ?? null;
};
