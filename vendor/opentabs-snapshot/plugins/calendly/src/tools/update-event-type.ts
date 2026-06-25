import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { eventTypeSchema, mapEventType } from './schemas.js';

export const updateEventType = defineTool({
  name: 'update_event_type',
  displayName: 'Update Event Type',
  description:
    'Update an existing event type. Only specified fields are changed; omitted fields remain unchanged. Returns the updated event type.',
  summary: 'Update an event type',
  icon: 'calendar-cog',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID to update'),
    name: z.string().optional().describe('New display name'),
    slug: z.string().optional().describe('New URL-safe slug'),
    duration: z.number().int().min(1).optional().describe('New duration in minutes'),
    description: z.string().optional().describe('New description'),
    color: z.string().optional().describe('New display color hex code'),
  }),
  output: z.object({ event_type: eventTypeSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.slug !== undefined) body.slug = params.slug;
    if (params.duration !== undefined) body.duration = params.duration;
    if (params.description !== undefined) body.description = params.description;
    if (params.color !== undefined) body.color = params.color;

    const data = await api<Record<string, unknown>>(`/users/me/event_types/${params.event_type_id}`, {
      method: 'PUT',
      body,
    });
    return { event_type: mapEventType(data) };
  },
});
