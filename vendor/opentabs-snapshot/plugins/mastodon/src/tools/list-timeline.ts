// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../mastodon-api.js';

export const listTimeline = defineTool({
  name: 'list_timeline',
  displayName: 'List Timeline',
  description: 'List recent statuses from your Mastodon home timeline. Optionally page through with max_id.',
  summary: 'show me my mastodon timeline',
  icon: 'list',
  group: 'Timeline',
  input: z.object({
    max_id: z.string().optional().describe('Return results older than this status ID'),
    limit: z.number().int().min(1).max(40).optional().describe('Maximum number of statuses to return (max 40)'),
  }),
  output: z.object({
    statuses: z.array(z.object({
      id: z.string(),
      content: z.string(),
      account: z.string(),
    })).describe('Recent home-timeline statuses'),
  }),
  handle: async (params: { max_id?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /api/v1/timelines/home (default method).
    const data = await api<{ statuses: { id: string; content: string; account: string }[] }>('/api/v1/timelines/home', {
      query: { max_id: params.max_id, limit: params.limit },
    });
    return { statuses: data.statuses };
  },
});
