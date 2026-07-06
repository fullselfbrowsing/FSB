// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../mastodon-api.js';

export const deleteStatus = defineTool({
  name: 'delete_status',
  displayName: 'Delete Status',
  description: 'Permanently delete one of your Mastodon statuses (toots) by its ID. This action cannot be undone.',
  summary: 'delete a mastodon status permanently',
  icon: 'trash-2',
  group: 'Timeline',
  input: z.object({
    status_id: z.string().min(1).describe('Status ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the status was successfully deleted'),
  }),
  handle: async (params: { status_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /api/v1/statuses/:id
    // (delete -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/api/v1/statuses/${encodeURIComponent(params.status_id)}`, { method: 'DELETE' });
    return { success: true };
  },
});
