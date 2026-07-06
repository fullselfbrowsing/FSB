import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawEpic, epicSchema, mapEpic } from './schemas.js';

export const listEpics = defineTool({
  name: 'list_epics',
  displayName: 'List Epics',
  description: 'List all epics in the workspace. Returns epics with name, state, and associated labels.',
  summary: 'List all epics',
  icon: 'layers',
  group: 'Epics',
  input: z.object({}),
  output: z.object({ epics: z.array(epicSchema).describe('All epics') }),
  handle: async () => {
    const data = await api<RawEpic[]>('/epics');
    return { epics: (data ?? []).map(mapEpic) };
  },
});
