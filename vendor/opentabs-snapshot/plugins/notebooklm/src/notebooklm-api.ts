import {
  ToolError,
  fetchFromPage,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  buildQueryString,
} from '@opentabs-dev/plugin-sdk';

const API_PATH = '/_/LabsTailwindUi/data/batchexecute';

interface WizGlobalData {
  SNlM0e?: string;
  cfb2h?: string;
  S06Grb?: string;
  oPEP7c?: string;
  FdrFJe?: string;
}

interface AuthInfo {
  at: string;
  bl: string;
  userId: string;
  email: string;
  sid: string;
}

const getWizData = (): WizGlobalData | null => {
  const data = getPageGlobal('WIZ_global_data') as WizGlobalData | undefined;
  if (!data?.SNlM0e) return null;
  return data;
};

const getAuth = (): AuthInfo | null => {
  const cached = getAuthCache<AuthInfo>('notebooklm');
  if (cached?.at) return cached;

  const wiz = getWizData();
  if (!wiz?.SNlM0e) return null;

  const auth: AuthInfo = {
    at: wiz.SNlM0e,
    bl: wiz.cfb2h ?? '',
    userId: wiz.S06Grb ?? '',
    email: wiz.oPEP7c ?? '',
    sid: wiz.FdrFJe ?? '',
  };

  setAuthCache('notebooklm', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), {
      interval: 500,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

export const getCurrentUserInfo = (): {
  userId: string;
  email: string;
} => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to NotebookLM.');
  return { userId: auth.userId, email: auth.email };
};

const parseBatchResponse = (text: string): unknown => {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === ")]}'" || /^\d+$/.test(trimmed)) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown[];
      if (!Array.isArray(parsed)) continue;
      const inner = parsed[0];
      if (!Array.isArray(inner)) continue;
      if (inner[0] === 'wrb.fr') {
        const dataStr = inner[2] as string | null;
        if (dataStr === null || dataStr === undefined) {
          const errorCode = inner[5] as number[] | undefined;
          if (errorCode) {
            const code = Array.isArray(errorCode) ? errorCode[0] : errorCode;
            if (code === 3) throw ToolError.validation('Invalid request parameters.');
            if (code === 5) throw ToolError.notFound('Resource not found.');
            if (code === 7) throw ToolError.auth('Not authenticated — please log in to NotebookLM.');
            if (code === 16) throw ToolError.auth('Not authenticated — please log in to NotebookLM.');
            throw ToolError.internal(`RPC error code ${code}`);
          }
          return null;
        }
        return JSON.parse(dataStr);
      }
    } catch (e) {
      if (e instanceof ToolError) throw e;
    }
  }
  throw ToolError.internal('Failed to parse batchexecute response.');
};

export const rpc = async <T>(rpcId: string, params: unknown[], sourcePath?: string): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to NotebookLM.');

  const qs = buildQueryString({
    rpcids: rpcId,
    'source-path': sourcePath ?? '/',
    bl: auth.bl,
    hl: 'en',
  });

  const url = `${API_PATH}?${qs}`;

  const body = new URLSearchParams();
  body.set('f.req', JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]));
  body.set('at', auth.at);

  const resp = await fetchFromPage(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Same-Domain': '1',
    },
    body: body.toString(),
  });

  const text = await resp.text();

  if (resp.status === 401 || resp.status === 403) {
    clearAuthCache('notebooklm');
    throw ToolError.auth('Not authenticated — please log in to NotebookLM.');
  }

  return parseBatchResponse(text) as T;
};

export const FEATURE_FLAGS = [2] as const;
