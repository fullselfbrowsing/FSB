import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawEpic, epicSchema, mapEpic } from './schemas.js';

export const getEpic = defineTool({
  name: 'get_epic',
  displayName: 'Get Epic',
  description: 'Get detailed information about a specific epic by its numeric ID.',
  summary: 'Get an epic by ID',
  icon: 'layers',
  group: 'Epics',
  input: z.object({
    epic_id: z.number().int().describe('Epic numeric ID'),
  }),
  output: z.object({ epic: epicSchema }),
  handle: async params => {
    const data = await api<RawEpic>(`/epics/${params.epic_id}`);
    return { epic: mapEpic(data) };
  },
});
