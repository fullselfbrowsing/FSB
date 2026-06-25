import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawLabel, labelSchema, mapLabel } from './schemas.js';

export const createLabel = defineTool({
  name: 'create_label',
  displayName: 'Create Label',
  description: 'Create a new personal label. Only the name is required.',
  summary: 'Create a new label',
  icon: 'tag',
  group: 'Labels',
  input: z.object({
    name: z.string().describe('Name of the new label'),
    color: z.string().optional().describe('Label color name (e.g. "berry_red", "blue", "green")'),
    order: z.number().int().optional().describe('Position among labels'),
    is_favorite: z.boolean().optional().describe('Whether to mark the label as a favorite'),
  }),
  output: z.object({
    label: labelSchema.describe('The newly created label'),
  }),
  handle: async params => {
    const data = await api<RawLabel>('/labels', {
      method: 'POST',
      body: params,
    });
    return { label: mapLabel(data) };
  },
});
