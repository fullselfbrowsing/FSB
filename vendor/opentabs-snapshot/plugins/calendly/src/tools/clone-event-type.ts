import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const cloneEventType = defineTool({
  name: 'clone_event_type',
  displayName: 'Clone Event Type',
  description:
    'Create a copy of an existing event type with all its settings. The clone is created with " (clone)" appended to the name and a generated slug. Returns the new event type ID and edit path.',
  summary: 'Clone an event type',
  icon: 'copy',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID to clone'),
  }),
  output: z.object({
    id: z.number().describe('Cloned event type ID'),
    edit_path: z.string().describe('Path to edit the cloned event type in the Calendly UI'),
  }),
  handle: async params => {
    const data = await api<{ id?: number; edit_path?: string }>(`/users/me/event_types/${params.event_type_id}/clone`, {
      method: 'POST',
    });
    return {
      id: data.id ?? 0,
      edit_path: data.edit_path ?? '',
    };
  },
});
