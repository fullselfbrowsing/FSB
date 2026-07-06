import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getResponseClass, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const deleteDatabaseUser = defineTool({
  name: 'delete_database_user',
  displayName: 'Delete SQL User',
  description: 'Delete a SQL database user from a CockroachDB cluster.',
  summary: 'Delete a SQL user from a cluster',
  icon: 'user-minus',
  group: 'Databases',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
    name: z.string().describe('Username of the SQL user to delete'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the user was deleted') }),
  handle: async params => {
    await grpc('DeleteDatabaseUser', getResponseClass('Empty'), () => {
      const req = newRequest('DeleteDatabaseUserRequest');
      setField(req, 'setClusterId', params.cluster_id);
      setField(req, 'setUsername', params.name);
      return req;
    });
    return { success: true };
  },
});
