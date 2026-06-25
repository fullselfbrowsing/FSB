import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';

interface RawCurrentUser {
  id?: string;
  name?: string;
  mention_name?: string;
  role?: string;
  workspace2?: { name?: string; url_slug?: string };
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Shortcut user including name, role, and workspace info.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    id: z.string().describe('Member UUID'),
    name: z.string().describe('Display name'),
    mention_name: z.string().describe('@mention handle'),
    role: z.string().describe('Workspace role'),
    workspace_name: z.string().describe('Current workspace name'),
    workspace_slug: z.string().describe('Current workspace URL slug'),
  }),
  handle: async () => {
    const data = await api<RawCurrentUser>('/member');
    return {
      id: data.id ?? '',
      name: data.name ?? '',
      mention_name: data.mention_name ?? '',
      role: data.role ?? '',
      workspace_name: data.workspace2?.name ?? '',
      workspace_slug: data.workspace2?.url_slug ?? '',
    };
  },
});
