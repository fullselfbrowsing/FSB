import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';

export const deleteDatabaseUser = defineTool({
  name: 'delete_database_user',
  displayName: 'Delete Database User',
  description: 'Delete a database user from the current MongoDB Atlas project by username and authentication database.',
  summary: 'Delete a database user',
  icon: 'user-minus',
  group: 'Database Access',
  input: z.object({
    username: z.string().describe('Username of the database user to delete'),
    database: z.string().optional().describe('Authentication database (defaults to "admin")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the user was successfully deleted'),
  }),
  handle: async params => {
    const groupId = getGroupId();
    const database = params.database ?? 'admin';
    await api(`/nds/${groupId}/users/${database}/${params.username}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
