// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../discord-api.js';

export const listChannels = defineTool({
  name: 'list_channels',
  displayName: 'List Channels',
  description: 'List the text channels in a Discord server (guild) you are a member of.',
  summary: 'show me the channels in my discord server',
  icon: 'list',
  group: 'Channels',
  input: z.object({
    guild_id: z.string().min(1).describe('The Discord server (guild) ID to list channels for'),
  }),
  output: z.object({
    channels: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.number(),
    })).describe('The text channels in the guild'),
  }),
  handle: async (params: { guild_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /guilds/:id/channels (default method).
    const data = await api<{ channels: unknown[] }>(`/guilds/${params.guild_id}/channels`, {
      query: { guild_id: params.guild_id },
    });
    return { channels: data.channels as { id: string; name: string; type: number }[] };
  },
});
