import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { workspaceMemberSchema, mapWorkspaceMember } from './schemas.js';
import type { RawWorkspaceMember } from './schemas.js';

export const listWorkspaceMembers = defineTool({
  name: 'list_workspace_members',
  displayName: 'List Workspace Members',
  description: 'List all members of the current MiniMax Agent workspace including their roles and contact information.',
  summary: 'List workspace members',
  icon: 'users',
  group: 'Workspace',
  input: z.object({}),
  output: z.object({
    members: z.array(workspaceMemberSchema).describe('List of workspace members'),
  }),
  handle: async () => {
    const data = await apiPost<{
      members?: RawWorkspaceMember[];
      base_resp: unknown;
    }>('/matrix/api/v1/workspace/list_members', {});
    return {
      members: (data.members ?? []).map(mapWorkspaceMember),
    };
  },
});
