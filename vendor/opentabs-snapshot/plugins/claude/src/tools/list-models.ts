import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../claude-api.js';

const modelSchema = z.object({
  model: z.string().describe('Model ID (e.g., "claude-sonnet-4-6")'),
  name: z.string().describe('Display name (e.g., "Claude Sonnet 4.6")'),
  description: z.string().describe('Model description'),
});

interface RawModel {
  model?: string;
  name?: string;
  description?: string;
}

interface RawBootstrapModels {
  account?: {
    memberships?: {
      organization?: {
        claude_ai_bootstrap_models_config?: RawModel[];
      };
    }[];
  };
}

export const listModels = defineTool({
  name: 'list_models',
  displayName: 'List Models',
  description:
    'List all available Claude AI models for the current organization including model IDs, display names, and descriptions.',
  summary: 'List available Claude models',
  icon: 'cpu',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    models: z.array(modelSchema).describe('List of available models'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await api<RawBootstrapModels>(`/bootstrap/${orgId}/app_start`);

    const rawModels = data.account?.memberships?.[0]?.organization?.claude_ai_bootstrap_models_config ?? [];

    const models = rawModels.map(m => ({
      model: m.model ?? '',
      name: m.name ?? '',
      description: m.description ?? '',
    }));

    return { models };
  },
});
