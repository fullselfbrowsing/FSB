import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawMember, mapMember, memberSchema } from './schemas.js';

export const listMembers = defineTool({
  name: 'list_members',
  displayName: 'List Members',
  description: 'List all members in the workspace including their name, role, email, and mention handle.',
  summary: 'List workspace members',
  icon: 'users',
  group: 'Members',
  input: z.object({}),
  output: z.object({ members: z.array(memberSchema).describe('All workspace members') }),
  handle: async () => {
    const data = await api<RawMember[]>('/members');
    return { members: (data ?? []).map(mapMember) };
  },
});
