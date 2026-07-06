import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawLabel, labelSchema, mapLabel } from './schemas.js';

export const getLabel = defineTool({
  name: 'get_label',
  displayName: 'Get Label',
  description: 'Get a specific label by its ID.',
  summary: 'Get a label by ID',
  icon: 'tag',
  group: 'Labels',
  input: z.object({
    label_id: z.string().describe('The ID of the label to retrieve'),
  }),
  output: z.object({
    label: labelSchema.describe('The requested label'),
  }),
  handle: async params => {
    const data = await api<RawLabel>(`/labels/${params.label_id}`);
    return { label: mapLabel(data) };
  },
});
