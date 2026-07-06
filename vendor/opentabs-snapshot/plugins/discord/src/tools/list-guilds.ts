import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { discordApi } from '../discord-api.js';
import { guildSchema, mapGuild } from './schemas.js';

export const listGuilds = defineTool({
  name: 'list_guilds',
  displayName: 'List Guilds',
  description: 'List all Discord guilds (servers) the authenticated user is a member of',
  summary: 'List servers the user belongs to',
  icon: 'server',
  group: 'Servers',
  input: z.object({
    limit: z.number().int().min(1).max(200).optional().describe('Max guilds to return (default 200)'),
    before: z.string().optional().describe('Get guilds before this guild ID (for pagination)'),
    after: z.string().optional().describe('Get guilds after this guild ID'),
  }),
  output: z.object({
    guilds: z.array(guildSchema).describe('List of guilds'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      limit: params.limit ?? 200,
      with_counts: true,
    };
    if (params.before) query.before = params.before;
    if (params.after) query.after = params.after;

    const data = await discordApi<Record<string, unknown>>('/users/@me/guilds', { query });
    const guilds = Array.isArray(data) ? (data as Record<string, unknown>[]).map(g => mapGuild(g)) : [];
    return { guilds };
  },
});
