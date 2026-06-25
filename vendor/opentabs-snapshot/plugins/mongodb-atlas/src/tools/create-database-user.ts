import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawDbUser, dbUserSchema, mapDbUser } from './schemas.js';

export const createDatabaseUser = defineTool({
  name: 'create_database_user',
  displayName: 'Create Database User',
  description:
    'Create a new database user in the current MongoDB Atlas project with specified roles and optional cluster scopes.',
  summary: 'Create a database user',
  icon: 'user-plus',
  group: 'Database Access',
  input: z.object({
    username: z.string().describe('Username for the new database user'),
    password: z.string().describe('Password for the new database user'),
    roles: z
      .array(
        z.object({
          role_name: z.string().describe('Role name (e.g., readWriteAnyDatabase, atlasAdmin, readWrite)'),
          database_name: z.string().describe('Database the role applies to (e.g., admin, mydb)'),
        }),
      )
      .describe('Roles to assign to the user'),
    scopes: z
      .array(
        z.object({
          name: z.string().describe('Scope name (cluster name)'),
          type: z.string().describe('Scope type (CLUSTER)'),
        }),
      )
      .optional()
      .describe('Optional cluster scopes to restrict access'),
  }),
  output: z.object({ user: dbUserSchema.describe('The created database user') }),
  handle: async params => {
    const groupId = getGroupId();
    const body = {
      user: params.username,
      password: params.password,
      groupId,
      roles: params.roles.map(r => ({
        roleName: r.role_name,
        databaseName: r.database_name,
      })),
      scopes: (params.scopes ?? []).map(s => ({
        name: s.name,
        type: s.type,
      })),
      awsIAMType: 'NONE',
      x509Type: 'NONE',
      ldapAuthType: 'NONE',
    };
    const raw = await api<RawDbUser>(`/nds/${groupId}/users`, {
      method: 'POST',
      body,
    });
    return { user: mapDbUser(raw) };
  },
});
