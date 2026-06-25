import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawObjective, mapObjective, objectiveSchema } from './schemas.js';

export const listObjectives = defineTool({
  name: 'list_objectives',
  displayName: 'List Objectives',
  description: 'List all objectives in the workspace. Objectives are high-level goals that epics work toward.',
  summary: 'List all objectives',
  icon: 'target',
  group: 'Objectives',
  input: z.object({}),
  output: z.object({ objectives: z.array(objectiveSchema).describe('All objectives') }),
  handle: async () => {
    const data = await api<RawObjective[]>('/objectives');
    return { objectives: (data ?? []).map(mapObjective) };
  },
});
