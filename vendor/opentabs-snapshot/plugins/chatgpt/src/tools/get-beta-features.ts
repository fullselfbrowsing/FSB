import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const getBetaFeatures = defineTool({
  name: 'get_beta_features',
  displayName: 'Get Beta Features',
  description:
    'Get the status of all ChatGPT beta features and settings. Returns a map of feature names to their enabled/disabled status.',
  summary: 'Get beta feature flags',
  icon: 'flask-conical',
  group: 'Settings',
  input: z.object({}),
  output: z.object({
    features: z.record(z.string(), z.boolean()).describe('Map of feature name to enabled status'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/settings/beta_features');
    const features: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'boolean') {
        features[key] = value;
      }
    }
    return { features };
  },
});
