import { ToolError, fetchJSON, fetchFromPage, buildQueryString, waitUntil } from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Terraform Cloud uses HttpOnly session cookies + CSRF token for writes.
// Auth is detected by successfully fetching the account details endpoint.
// The CSRF token is read from a hidden input field in the page.

const getCsrfToken = (): string | null => {
  const input = document.querySelector<HTMLInputElement>('input[name="authenticity_token"]');
  return input?.value ?? null;
};

const isLoggedIn = (): boolean => {
  // The #tfe-app element is always present, but the auth form only exists when logged in
  // A more reliable check: presence of the silent auth refresh iframe or the org picker
  return !!document.querySelector('[data-test-sidebar-menu-global]');
};

export const isAuthenticated = (): boolean => isLoggedIn();

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

// --- JSON:API response types ---

export interface JsonApiResource<T = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: T;
  relationships?: Record<
    string,
    {
      data?: { id: string; type: string } | { id: string; type: string }[] | null;
      links?: Record<string, string>;
    }
  >;
  links?: Record<string, string>;
}

export interface JsonApiResponse<T = Record<string, unknown>> {
  data: JsonApiResource<T>;
}

export interface JsonApiListResponse<T = Record<string, unknown>> {
  data: JsonApiResource<T>[];
  meta?: {
    pagination?: {
      'current-page': number;
      'next-page': number | null;
      'prev-page': number | null;
      'total-pages': number;
      'total-count': number;
    };
  };
}

// --- API caller ---

const API_BASE = '/api/v2';

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth('Not authenticated — please log in to HCP Terraform.');
  }

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.api+json',
  };

  // Writes require CSRF token
  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  if (method === 'DELETE') {
    // DELETE returns 204 with no body — use fetchFromPage directly
    const response = await fetchFromPage(url, init);
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  const data = await fetchJSON<T>(url, init);
  return data as T;
};
