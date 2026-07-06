import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { expertSchema, mapExpert } from './schemas.js';
import type { RawExpert } from './schemas.js';

export const getExpert = defineTool({
  name: 'get_expert',
  displayName: 'Get Expert',
  description: 'Get detailed information about a specific AI expert/agent by ID.',
  summary: 'Get expert details',
  icon: 'bot',
  group: 'Experts',
  input: z.object({
    id: z.number().describe('Expert ID'),
  }),
  output: expertSchema,
  handle: async params => {
    const data = await apiPost<{ expert: RawExpert }>('/matrix/api/v1/expert/get', { id: params.id });
    return mapExpert(data.expert);
  },
});
