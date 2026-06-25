import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawFeatureFlag, featureFlagSchema, mapFeatureFlag } from './schemas.js';

export const updateFeatureFlag = defineTool({
  name: 'update_feature_flag',
  displayName: 'Update Feature Flag',
  description: 'Update an existing feature flag. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a feature flag',
  icon: 'pencil',
  group: 'Feature Flags',
  input: z.object({
    flag_id: z.number().int().describe('Feature flag ID'),
    name: z.string().optional().describe('New name'),
    active: z.boolean().optional().describe('Active status'),
    rollout_percentage: z.number().int().min(0).max(100).optional().describe('Rollout percentage'),
    ensure_experience_continuity: z.boolean().optional().describe('Persist flag value per user'),
  }),
  output: z.object({
    feature_flag: featureFlagSchema.describe('The updated feature flag'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.active !== undefined) body.active = params.active;
    if (params.ensure_experience_continuity !== undefined)
      body.ensure_experience_continuity = params.ensure_experience_continuity;
    if (params.rollout_percentage !== undefined) {
      body.filters = {
        groups: [{ rollout_percentage: params.rollout_percentage, properties: [] }],
      };
    }

    const data = await api<RawFeatureFlag>(`/api/projects/${getTeamId()}/feature_flags/${params.flag_id}/`, {
      method: 'PATCH',
      body,
    });

    return { feature_flag: mapFeatureFlag(data) };
  },
});
