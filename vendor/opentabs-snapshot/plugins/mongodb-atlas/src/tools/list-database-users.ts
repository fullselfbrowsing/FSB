import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawDbUser, dbUserSchema, mapDbUser } from './schemas.js';

export const listDatabaseUsers = defineTool({
  name: 'list_database_users',
  displayName: 'List Database Users',
  description:
    'List all database users in the current MongoDB Atlas project with their roles, scopes, and authentication type.',
  summary: 'List database users in the project',
  icon: 'user-cog',
  group: 'Database Access',
  input: z.object({}),
  output: z.object({ users: z.array(dbUserSchema).describe('Database users') }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawDbUser[]>(`/nds/${groupId}/users`);
    return { users: (raw ?? []).map(mapDbUser) };
  },
});
