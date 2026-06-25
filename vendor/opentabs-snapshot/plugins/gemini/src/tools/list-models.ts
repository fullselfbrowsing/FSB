import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getModels } from '../gemini-api.js';
import { modelSchema, mapModel } from './schemas.js';

export const listModels = defineTool({
  name: 'list_models',
  displayName: 'List Models',
  description:
    'List all available Gemini AI models. Returns model IDs, display names, descriptions, and which is the default. Use the model ID when sending messages to select a specific model.',
  summary: 'List available Gemini models',
  icon: 'cpu',
  group: 'Models',
  input: z.object({}),
  output: z.object({
    models: z.array(modelSchema).describe('Available Gemini models'),
  }),
  handle: async () => {
    const models = await getModels();
    return { models: models.map(mapModel) };
  },
});
