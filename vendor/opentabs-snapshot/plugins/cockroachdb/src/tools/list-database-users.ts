import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc, newRequest, setField } from '../cockroachdb-api.js';
import type { RawDatabaseUser } from './schemas.js';
import { databaseUserSchema, mapDatabaseUser } from './schemas.js';

export const listDatabaseUsers = defineTool({
  name: 'list_database_users',
  displayName: 'List SQL Users',
  description:
    'List all SQL database users in a CockroachDB cluster. Shows username and whether the user is system-internal.',
  summary: 'List SQL users in a cluster',
  icon: 'users',
  group: 'Databases',
  input: z.object({
    cluster_id: z.string().describe('Cluster UUID'),
  }),
  output: z.object({ users: z.array(databaseUserSchema).describe('List of database users') }),
  handle: async params => {
    const p = getConsoleProto();
    const data = await grpc<{ usersList?: RawDatabaseUser[] }>('ListDatabaseUsers', p.ListDatabaseUsersResponse, () => {
      const req = newRequest('ListDatabaseUsersRequest');
      setField(req, 'setClusterId', params.cluster_id);
      return req;
    });
    return { users: (data.usersList ?? []).map(mapDatabaseUser) };
  },
});
