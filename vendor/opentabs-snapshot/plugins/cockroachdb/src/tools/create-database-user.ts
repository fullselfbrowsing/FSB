import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getResponseClass, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const createDatabaseUser = defineTool({
  name: 'create_database_user',
  displayName: 'Create SQL User',
  description: 'Create a new SQL database user in a CockroachDB cluster with the specified password.',
  summary: 'Create a SQL user in a cluster',
  icon: 'user-plus',
  group: 'Databases',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
    name: z.string().describe('Username for the new SQL user'),
    password: z.string().describe('Password for the new SQL user'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the user was created') }),
  handle: async params => {
    await grpc('CreateDatabaseUser', getResponseClass('Empty'), () => {
      const req = newRequest('CreateDatabaseUserRequest');
      setField(req, 'setClusterId', params.cluster_id);
      setField(req, 'setUsername', params.name);
      setField(req, 'setPassword', params.password);
      return req;
    });
    return { success: true };
  },
});
