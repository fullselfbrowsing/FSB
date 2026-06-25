import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { modelSchema, mapModel } from './schemas.js';

export const listModels = defineTool({
  name: 'list_models',
  displayName: 'List Models',
  description:
    'List available ChatGPT models with their capabilities, token limits, and enabled tools. Returns the default model slug.',
  summary: 'List available AI models',
  icon: 'cpu',
  group: 'Models',
  input: z.object({}),
  output: z.object({
    models: z.array(modelSchema).describe('Available models'),
    default_model: z.string().describe('Default model slug'),
  }),
  handle: async () => {
    const data = await api<{
      models?: { slug?: string; title?: string; max_tokens?: number; tags?: string[]; enabled_tools?: string[] }[];
      default_model_slug?: string;
    }>('/models', { query: { history_and_training_disabled: false } });
    return {
      models: (data.models ?? []).map(mapModel),
      default_model: data.default_model_slug ?? '',
    };
  },
});
