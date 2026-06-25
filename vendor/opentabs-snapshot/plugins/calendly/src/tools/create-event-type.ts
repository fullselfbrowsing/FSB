import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const createEventType = defineTool({
  name: 'create_event_type',
  displayName: 'Create Event Type',
  description:
    'Create a new event type (scheduling template). Requires a name and a URL-safe slug. Returns the new event type ID and edit path.',
  summary: 'Create a new scheduling event type',
  icon: 'calendar-plus',
  group: 'Event Types',
  input: z.object({
    name: z.string().describe('Event type display name (e.g. "Discovery Call")'),
    slug: z
      .string()
      .describe('URL-safe slug using lowercase a-z, 0-9, hyphens, or underscores (e.g. "discovery-call")'),
    duration: z.number().int().min(1).optional().describe('Duration in minutes (default 30)'),
    description: z.string().optional().describe('Description shown to invitees'),
    color: z.string().optional().describe('Display color hex code (e.g. "#0069ff")'),
  }),
  output: z.object({
    id: z.number().describe('Newly created event type ID'),
    edit_path: z.string().describe('Path to edit the event type in the Calendly UI'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      slug: params.slug,
    };
    if (params.duration !== undefined) body.duration = params.duration;
    if (params.description !== undefined) body.description = params.description;
    if (params.color !== undefined) body.color = params.color;

    const data = await api<{ id?: number; edit_path?: string }>('/users/me/event_types', {
      method: 'POST',
      body,
    });

    return {
      id: data.id ?? 0,
      edit_path: data.edit_path ?? '',
    };
  },
});
