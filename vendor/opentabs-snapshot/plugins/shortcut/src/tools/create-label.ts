import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawLabel, labelSchema, mapLabel } from './schemas.js';

export const createLabel = defineTool({
  name: 'create_label',
  displayName: 'Create Label',
  description: 'Create a new label in the workspace.',
  summary: 'Create a new label',
  icon: 'tag',
  group: 'Labels',
  input: z.object({
    name: z.string().describe('Label name'),
    color: z.string().optional().describe('Hex color code (e.g., "#ff0000")'),
    description: z.string().optional().describe('Label description'),
  }),
  output: z.object({ label: labelSchema }),
  handle: async params => {
    const body = stripUndefined({
      name: params.name,
      color: params.color,
      description: params.description,
    });
    const data = await api<RawLabel>('/labels', { method: 'POST', body });
    return { label: mapLabel(data) };
  },
});
