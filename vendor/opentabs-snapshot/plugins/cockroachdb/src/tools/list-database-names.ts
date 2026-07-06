import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';

export const listDatabaseNames = defineTool({
  name: 'list_database_names',
  displayName: 'List Databases',
  description: 'List all database names in a CockroachDB cluster.',
  summary: 'List database names in a cluster',
  icon: 'cylinder',
  group: 'Databases',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({ databases: z.array(z.string()).describe('List of database names') }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<{ namesList?: string[] }>('ListDatabaseNames', p.ListDatabaseNamesResponse, () => {
      const req = newRequest('ListDatabaseNamesRequest');
      setField(req, 'setClusterId', params.cluster_id);
      return req;
    });
    return { databases: data.namesList ?? [] };
  },
});
