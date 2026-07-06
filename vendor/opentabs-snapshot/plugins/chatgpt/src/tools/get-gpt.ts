import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { gptSchema, mapGpt } from './schemas.js';

export const getGpt = defineTool({
  name: 'get_gpt',
  displayName: 'Get GPT',
  description:
    'Get detailed information about a specific custom GPT by its ID (e.g., "g-alKfVrz9K"). Returns the GPT name, description, author, and interaction count.',
  summary: 'Get details about a custom GPT',
  icon: 'bot',
  group: 'GPTs',
  input: z.object({
    gpt_id: z.string().describe('GPT ID (e.g., "g-alKfVrz9K")'),
  }),
  output: z.object({ gpt: gptSchema }),
  handle: async params => {
    const data = await api<{ gizmo?: Record<string, unknown> }>(`/gizmos/${params.gpt_id}`);
    return { gpt: mapGpt((data.gizmo ?? {}) as Parameters<typeof mapGpt>[0]) };
  },
});
