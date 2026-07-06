import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawLabel, labelSchema, mapLabel } from './schemas.js';

export const listLabels = defineTool({
  name: 'list_labels',
  displayName: 'List Labels',
  description: 'List all labels in the workspace. Labels are used to categorize stories and epics.',
  summary: 'List all labels',
  icon: 'tag',
  group: 'Labels',
  input: z.object({}),
  output: z.object({ labels: z.array(labelSchema).describe('All labels') }),
  handle: async () => {
    const data = await api<RawLabel[]>('/labels');
    return { labels: (data ?? []).map(mapLabel) };
  },
});
