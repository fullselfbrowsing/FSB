import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawEpic, epicSchema, mapEpic } from './schemas.js';

export const updateEpic = defineTool({
  name: 'update_epic',
  displayName: 'Update Epic',
  description: 'Update an existing epic. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an epic',
  icon: 'pencil',
  group: 'Epics',
  input: z.object({
    epic_id: z.number().int().describe('Epic numeric ID'),
    name: z.string().optional().describe('New epic name'),
    description: z.string().optional().describe('New description in Markdown'),
    epic_state_id: z.number().int().optional().describe('New epic state ID'),
    deadline: z.string().nullable().optional().describe('Deadline in ISO 8601, or null to clear'),
    owner_ids: z.array(z.string()).optional().describe('Replace all owners with these member UUIDs'),
    label_ids: z.array(z.number().int()).optional().describe('Replace all labels with these IDs'),
    archived: z.boolean().optional().describe('Whether to archive the epic'),
  }),
  output: z.object({ epic: epicSchema }),
  handle: async params => {
    const body = stripUndefined({
      name: params.name,
      description: params.description,
      epic_state_id: params.epic_state_id,
      deadline: params.deadline,
      owner_ids: params.owner_ids,
      labels: params.label_ids?.map(id => ({ id })),
      archived: params.archived,
    });
    const data = await api<RawEpic>(`/epics/${params.epic_id}`, { method: 'PUT', body });
    return { epic: mapEpic(data) };
  },
});
