import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { promptSchema, mapPrompt } from './schemas.js';

export const getPromptLibrary = defineTool({
  name: 'get_prompt_library',
  displayName: 'Get Prompt Library',
  description: 'Get the ChatGPT prompt library — a collection of suggested prompt templates organized by category.',
  summary: 'Get prompt library templates',
  icon: 'book-open',
  group: 'Prompts',
  input: z.object({}),
  output: z.object({
    prompts: z.array(promptSchema).describe('Available prompt templates'),
  }),
  handle: async () => {
    const data = await api<{
      items?: { id?: string; title?: string; description?: string; prompt?: string; category?: string }[];
    }>('/prompt_library/');
    return {
      prompts: (data.items ?? []).map(mapPrompt),
    };
  },
});
