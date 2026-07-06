import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const updateCustomInstructions = defineTool({
  name: 'update_custom_instructions',
  displayName: 'Update Custom Instructions',
  description:
    'Update ChatGPT custom instructions. Set what ChatGPT should know about you and how it should respond. Pass empty strings to clear instructions.',
  summary: 'Update your custom instructions',
  icon: 'pencil',
  group: 'Settings',
  input: z.object({
    about_user: z.string().describe('What you want ChatGPT to know about you'),
    about_model: z.string().describe('How you want ChatGPT to respond'),
    enabled: z.boolean().optional().describe('Whether to enable custom instructions (default true)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api('/user_system_messages', {
      method: 'POST',
      body: {
        about_user_message: params.about_user,
        about_model_message: params.about_model,
        enabled: params.enabled ?? true,
      },
    });
    return { success: true };
  },
});
