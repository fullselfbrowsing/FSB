import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

const workspaceSchema = z.object({
  id: z.string().describe('Workspace ID'),
  name: z.string().describe('Workspace name'),
  member_count: z.number().int().describe('Number of workspace members'),
  create_time: z.number().describe('Creation timestamp in ms'),
});

interface RawWorkspace {
  id?: string;
  name?: string;
  member_count?: number;
  create_time?: number;
}

export const getWorkspace = defineTool({
  name: 'get_workspace',
  displayName: 'Get Workspace',
  description: 'Get details about the current MiniMax Agent workspace including name, ID, and member count.',
  summary: 'Get workspace details',
  icon: 'building',
  group: 'Workspace',
  input: z.object({}),
  output: z.object({
    workspace: workspaceSchema.describe('Workspace details'),
  }),
  handle: async () => {
    const data = await apiPost<{
      workspace?: RawWorkspace;
      base_resp: unknown;
    }>('/matrix/api/v1/workspace/detail', {});
    const w = data.workspace ?? {};
    return {
      workspace: {
        id: w.id ?? '',
        name: w.name ?? '',
        member_count: w.member_count ?? 0,
        create_time: w.create_time ?? 0,
      },
    };
  },
});
