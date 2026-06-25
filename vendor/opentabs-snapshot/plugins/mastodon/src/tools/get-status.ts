// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../mastodon-api.js';

export const getStatus = defineTool({
  name: 'get_status',
  displayName: 'Get Status',
  description: 'Get a single Mastodon status (toot) by its ID, including content and engagement counts.',
  summary: 'open a mastodon status',
  icon: 'message-square',
  group: 'Timeline',
  input: z.object({
    status_id: z.string().min(1).describe('Status ID to retrieve'),
  }),
  output: z.object({
    status: z.object({
      id: z.string(),
      content: z.string(),
      account: z.string(),
      favourites_count: z.number().optional(),
      reblogs_count: z.number().optional(),
    }).describe('The status'),
  }),
  handle: async (params: { status_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /api/v1/statuses/:id (default method).
    const data = await api<{ status: { id: string; content: string; account: string; favourites_count?: number; reblogs_count?: number } }>(
      `/api/v1/statuses/${encodeURIComponent(params.status_id)}`
    );
    return { status: data.status };
  },
});
