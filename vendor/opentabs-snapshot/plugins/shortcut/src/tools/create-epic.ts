import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawEpic, epicSchema, mapEpic } from './schemas.js';

export const createEpic = defineTool({
  name: 'create_epic',
  displayName: 'Create Epic',
  description: 'Create a new epic. Requires a name. Optionally set description, state, deadline, owners, and labels.',
  summary: 'Create a new epic',
  icon: 'layers',
  group: 'Epics',
  input: z.object({
    name: z.string().describe('Epic name'),
    description: z.string().optional().describe('Epic description in Markdown'),
    epic_state_id: z.number().int().optional().describe('Epic state ID (from workspace epic workflow)'),
    deadline: z.string().optional().describe('Deadline in ISO 8601 format'),
    owner_ids: z.array(z.string()).optional().describe('Member UUIDs to set as owners'),
    label_ids: z.array(z.number().int()).optional().describe('Label IDs to attach'),
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
    });
    const data = await api<RawEpic>('/epics', { method: 'POST', body });
    return { epic: mapEpic(data) };
  },
});
