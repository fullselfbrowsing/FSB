// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../discord-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description: 'Permanently delete a message from a Discord channel by its ID. This action cannot be undone.',
  summary: 'delete a discord message permanently',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    channel_id: z.string().min(1).describe('The channel ID the message lives in'),
    message_id: z.string().min(1).describe('The message ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was successfully deleted'),
  }),
  handle: async (params: { channel_id: string; message_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /channels/:id/messages/:id
    // (delete -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/channels/${params.channel_id}/messages/${params.message_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
