import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description: 'Get the currently authenticated Cloudflare user profile, including email, name, and account details.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    id: z.string().describe('User ID'),
    email: z.string().describe('User email address'),
    first_name: z.string().nullable().describe('First name'),
    last_name: z.string().nullable().describe('Last name'),
    username: z.string().describe('Username'),
    two_factor_enabled: z.boolean().describe('Whether 2FA is enabled'),
    suspended: z.boolean().describe('Whether the account is suspended'),
    created_on: z.string().describe('ISO 8601 account creation timestamp'),
    modified_on: z.string().describe('ISO 8601 last modification timestamp'),
  }),
  handle: async () => {
    const data = await cloudflareApi<Record<string, unknown>>('/user');
    const u = data.result as Record<string, unknown>;
    return {
      id: (u.id as string) ?? '',
      email: (u.email as string) ?? '',
      first_name: (u.first_name as string) ?? null,
      last_name: (u.last_name as string) ?? null,
      username: (u.username as string) ?? '',
      two_factor_enabled: (u.two_factor_authentication_enabled as boolean) ?? false,
      suspended: (u.suspended as boolean) ?? false,
      created_on: (u.created_on as string) ?? '',
      modified_on: (u.modified_on as string) ?? '',
    };
  },
});
