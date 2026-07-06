import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawTag, mapTag, tagSchema } from './schemas.js';

export const listTags = defineTool({
  name: 'list_tags',
  displayName: 'List Tags',
  description: 'List all tags in a workspace.',
  summary: 'List tags in a workspace',
  icon: 'tag',
  group: 'Tags',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to list tags for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of tags to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  }),
  output: z.object({
    tags: z.array(tagSchema).describe('List of tags in the workspace'),
    next_page: z.string().nullable().describe('Offset token for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawTag>>(`/workspaces/${params.workspace_gid}/tags`, {
      query: {
        opt_fields: 'name,color',
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      tags: (data.data ?? []).map(mapTag),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
