import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawFeatureFlag, featureFlagSchema, mapFeatureFlag } from './schemas.js';

export const createFeatureFlag = defineTool({
  name: 'create_feature_flag',
  displayName: 'Create Feature Flag',
  description:
    'Create a new boolean feature flag. The key must be unique within the project and is used in code to check the flag.',
  summary: 'Create a new feature flag',
  icon: 'plus',
  group: 'Feature Flags',
  input: z.object({
    key: z.string().describe('Unique flag key (used in code)'),
    name: z.string().optional().describe('Human-readable name'),
    active: z.boolean().optional().describe('Whether to activate immediately (default false)'),
    rollout_percentage: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe('Percentage of users to roll out to (0-100)'),
    ensure_experience_continuity: z.boolean().optional().describe('Persist flag value per user'),
  }),
  output: z.object({
    feature_flag: featureFlagSchema.describe('The newly created feature flag'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = { key: params.key };
    if (params.name !== undefined) body.name = params.name;
    if (params.active !== undefined) body.active = params.active;
    if (params.ensure_experience_continuity !== undefined)
      body.ensure_experience_continuity = params.ensure_experience_continuity;
    if (params.rollout_percentage !== undefined) {
      body.filters = {
        groups: [{ rollout_percentage: params.rollout_percentage, properties: [] }],
      };
    }

    const data = await api<RawFeatureFlag>(`/api/projects/${getTeamId()}/feature_flags/`, { method: 'POST', body });

    return { feature_flag: mapFeatureFlag(data) };
  },
});
