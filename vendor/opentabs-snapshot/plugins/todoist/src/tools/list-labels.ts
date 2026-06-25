import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawLabel, type TodoistList, labelSchema, mapLabel } from './schemas.js';

export const listLabels = defineTool({
  name: 'list_labels',
  displayName: 'List Labels',
  description: 'List all personal labels in the Todoist workspace.',
  summary: 'List all labels',
  icon: 'tag',
  group: 'Labels',
  input: z.object({}),
  output: z.object({
    labels: z.array(labelSchema).describe('List of all personal labels'),
  }),
  handle: async () => {
    const data = await api<TodoistList<RawLabel>>('/labels');
    return { labels: data.results.map(mapLabel) };
  },
});
