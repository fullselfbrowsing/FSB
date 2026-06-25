import { defineTool, getCookie } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

/** Parse the THD_PERSIST cookie which uses `key=value:;` delimiters */
const parseThdPersist = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const pair of raw.split(':;')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    result[key] = value;
  }
  return result;
};

/** Decode THD_CUSTOMER JWT-like token to extract the payload */
const decodeThdCustomer = (raw: string): Record<string, string> => {
  try {
    const parts = raw.split('.');
    const payload = parts[0];
    if (!payload) return {};
    return JSON.parse(atob(payload)) as Record<string, string>;
  } catch {
    return {};
  }
};

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Current User',
  description:
    'Get the currently authenticated Home Depot user profile including email, name, ZIP code, store info, and customer type.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    email: z.string().describe('User email address'),
    first_name: z.string().describe('User first name'),
    zip_code: z.string().describe('User ZIP code'),
    store_info: z.string().describe('User preferred store info'),
    customer_type: z.string().describe('Customer type (e.g., "B2C")'),
  }),
  handle: async () => {
    const persistRaw = getCookie('THD_PERSIST') ?? '';
    const persist = parseThdPersist(persistRaw);

    const customerRaw = getCookie('THD_CUSTOMER') ?? '';
    const customerPayload = decodeThdCustomer(customerRaw);

    return {
      email: persist.C12 ?? '',
      first_name: persist.C13 ?? '',
      zip_code: persist.C24 ?? '',
      store_info: persist.C4 ?? '',
      customer_type: customerPayload.c ?? '',
    };
  },
});
