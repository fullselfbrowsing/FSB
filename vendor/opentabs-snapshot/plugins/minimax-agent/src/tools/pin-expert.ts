import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const pinExpert = defineTool({
  name: 'pin_expert',
  displayName: 'Pin Expert',
  description: 'Pin or unpin an AI expert/agent. Pinned experts appear at the top of the list.',
  summary: 'Pin or unpin an expert',
  icon: 'pin',
  group: 'Experts',
  input: z.object({
    id: z.number().describe('Expert ID'),
    is_pinned: z.boolean().describe('Whether to pin (true) or unpin (false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation was successful'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/expert/pin', { id: params.id, is_pinned: params.is_pinned });
    return { success: true };
  },
});
