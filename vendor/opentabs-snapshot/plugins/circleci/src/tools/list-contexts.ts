import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawContext, contextSchema, mapContext } from './schemas.js';

export const listContexts = defineTool({
  name: 'list_contexts',
  displayName: 'List Contexts',
  description: 'List contexts for an organization. Contexts store shared environment variables.',
  summary: 'List organization contexts',
  icon: 'lock',
  group: 'Contexts',
  input: z.object({
    owner_id: z.string().describe('Organization UUID'),
    owner_type: z.enum(['account', 'organization']).optional().describe('Owner type (default "organization")'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    contexts: z.array(contextSchema).describe('List of contexts'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async ({ owner_id, owner_type, page_token }) => {
    const data = await api<Paginated<RawContext>>('/context', {
      query: {
        'owner-id': owner_id,
        'owner-type': owner_type,
        'page-token': page_token,
      },
    });
    return {
      contexts: (data.items ?? []).map(mapContext),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
