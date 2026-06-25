// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../bluesky-api.js';

export const deletePost = defineTool({
  name: 'delete_post',
  displayName: 'Delete Post',
  description: 'Permanently delete one of your Bluesky posts by its AT-URI. This action cannot be undone.',
  summary: 'delete a bluesky post permanently',
  icon: 'trash-2',
  group: 'Feed',
  input: z.object({
    uri: z.string().min(1).describe('AT-URI of the post to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the post was successfully deleted'),
  }),
  handle: async (params: { uri: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE com.atproto.repo.deleteRecord
    // (delete -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid('/xrpc/com.atproto.repo.deleteRecord', { method: 'DELETE', body: { uri: params.uri } });
    return { success: true };
  },
});
