import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import type { TodoistList } from './schemas.js';

export const listSharedLabels = defineTool({
  name: 'list_shared_labels',
  displayName: 'List Shared Labels',
  description: 'List all shared label names across collaborative projects.',
  summary: 'List shared label names',
  icon: 'tags',
  group: 'Labels',
  input: z.object({
    omit_personal: z.boolean().optional().describe('Whether to exclude personal labels from the results'),
  }),
  output: z.object({
    labels: z.array(z.string().describe('Shared label name')).describe('List of shared label names'),
  }),
  handle: async params => {
    const data = await api<TodoistList<string>>('/labels/shared', {
      query: { omit_personal: params.omit_personal },
    });
    return { labels: data.results };
  },
});
