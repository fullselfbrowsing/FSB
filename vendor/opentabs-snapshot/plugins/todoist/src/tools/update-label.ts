import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawLabel, labelSchema, mapLabel } from './schemas.js';

export const updateLabel = defineTool({
  name: 'update_label',
  displayName: 'Update Label',
  description: 'Update an existing label. Only the fields provided will be changed.',
  summary: 'Update a label',
  icon: 'tag',
  group: 'Labels',
  input: z.object({
    label_id: z.string().describe('The ID of the label to update'),
    name: z.string().optional().describe('New name for the label'),
    color: z.string().optional().describe('New color name (e.g. "berry_red", "blue", "green")'),
    order: z.number().int().optional().describe('New position among labels'),
    is_favorite: z.boolean().optional().describe('Whether to mark the label as a favorite'),
  }),
  output: z.object({
    label: labelSchema.describe('The updated label'),
  }),
  handle: async params => {
    const { label_id, ...body } = params;
    const data = await api<RawLabel>(`/labels/${label_id}`, {
      method: 'POST',
      body,
    });
    return { label: mapLabel(data) };
  },
});
