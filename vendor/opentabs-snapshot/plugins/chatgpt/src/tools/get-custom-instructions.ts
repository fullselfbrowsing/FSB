import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const getCustomInstructions = defineTool({
  name: 'get_custom_instructions',
  displayName: 'Get Custom Instructions',
  description:
    'Get the current ChatGPT custom instructions (system messages). These include "What would you like ChatGPT to know about you?" and "How would you like ChatGPT to respond?".',
  summary: 'Get your custom instructions',
  icon: 'scroll-text',
  group: 'Settings',
  input: z.object({}),
  output: z.object({
    enabled: z.boolean().describe('Whether custom instructions are enabled'),
    about_user: z.string().describe('What you want ChatGPT to know about you'),
    about_model: z.string().describe('How you want ChatGPT to respond'),
  }),
  handle: async () => {
    const data = await api<{
      enabled?: boolean;
      about_user_message?: string;
      about_model_message?: string;
    }>('/user_system_messages');
    return {
      enabled: data.enabled ?? false,
      about_user: data.about_user_message ?? '',
      about_model: data.about_model_message ?? '',
    };
  },
});
