import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listWaitingRooms = defineTool({
  name: 'list_waiting_rooms',
  displayName: 'List Waiting Rooms',
  description:
    'List Waiting Rooms for a zone. Waiting Rooms queue visitors during traffic spikes to protect origin servers from overload.',
  summary: 'List Waiting Rooms',
  icon: 'clock',
  group: 'Traffic',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    waiting_rooms: z
      .array(
        z.object({
          id: z.string().describe('Waiting Room ID'),
          name: z.string().describe('Waiting Room name'),
          host: z.string().describe('Hostname the Waiting Room applies to'),
          path: z.string().describe('Path the Waiting Room applies to'),
          total_active_users: z.number().describe('Configured total active users threshold'),
          new_users_per_minute: z.number().describe('Configured new users per minute threshold'),
          description: z.string().describe('Description'),
          suspended: z.boolean().describe('Whether the Waiting Room is suspended'),
        }),
      )
      .describe('List of Waiting Rooms'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/waiting_rooms`,
    );
    const rooms = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      waiting_rooms: rooms.map(r => ({
        id: (r.id as string) ?? '',
        name: (r.name as string) ?? '',
        host: (r.host as string) ?? '',
        path: (r.path as string) ?? '/',
        total_active_users: (r.total_active_users as number) ?? 0,
        new_users_per_minute: (r.new_users_per_minute as number) ?? 0,
        description: (r.description as string) ?? '',
        suspended: (r.suspended as boolean) ?? false,
      })),
    };
  },
});
