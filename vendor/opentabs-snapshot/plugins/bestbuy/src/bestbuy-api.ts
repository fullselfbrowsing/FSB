import {
  clearAuthCache,
  fetchJSON,
  getAuthCache,
  getCookie,
  getPageGlobal,
  setAuthCache,
  ToolError,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface BestBuyAuth {
  userToken: string;
}

const getAuth = (): BestBuyAuth | null => {
  const cached = getAuthCache<BestBuyAuth>('bestbuy');
  if (cached) return cached;

  const userToken = getCookie('ut');
  if (!userToken) return null;

  const auth: BestBuyAuth = { userToken };
  setAuthCache('bestbuy', auth);
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

// --- Customer info from page global ---

export interface CustomerInfo {
  globalBbyId?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  loyaltyMemberId?: string;
  loyaltyMemberType?: string;
  loyaltyTierCode?: string;
}

export const getCustomerInfo = (): CustomerInfo | null => {
  return (getPageGlobal('initData.customer') as CustomerInfo | undefined) ?? null;
};

// --- API helpers ---

export const api = async <T>(endpoint: string): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth('Not authenticated — please log in to Best Buy.');
  }

  try {
    const data = await fetchJSON<T>(endpoint);
    return data as T;
  } catch (error) {
    if (error instanceof ToolError && error.category === 'auth') {
      clearAuthCache('bestbuy');
    }
    throw error;
  }
};
