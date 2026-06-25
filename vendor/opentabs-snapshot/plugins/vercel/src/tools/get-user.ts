import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { vercelApi } from '../vercel-api.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Vercel user.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    uid: z.string().describe('User ID'),
    email: z.string().describe('Email address'),
    name: z.string().nullable().describe('Display name'),
    username: z.string().describe('Vercel username'),
    avatar: z.string().nullable().describe('Avatar URL'),
    billing_plan: z.string().describe('Billing plan (hobby, pro, enterprise)'),
    default_team_id: z.string().nullable().describe('Default team ID'),
  }),
  handle: async () => {
    const data = await vercelApi<Record<string, unknown>>('/www/user');
    const user = (data.user as Record<string, unknown>) ?? data;
    const billing = user.billing as Record<string, unknown> | undefined;
    return {
      uid: (user.uid as string) ?? '',
      email: (user.email as string) ?? '',
      name: (user.name as string) ?? null,
      username: (user.username as string) ?? '',
      avatar: (user.avatar as string) ?? null,
      billing_plan: (billing?.plan as string) ?? 'hobby',
      default_team_id: (user.defaultTeamId as string) ?? null,
    };
  },
});
