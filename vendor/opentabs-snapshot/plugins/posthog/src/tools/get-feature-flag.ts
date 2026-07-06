import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawFeatureFlag, featureFlagSchema, mapFeatureFlag } from './schemas.js';

export const getFeatureFlag = defineTool({
  name: 'get_feature_flag',
  displayName: 'Get Feature Flag',
  description:
    'Get detailed information about a specific feature flag including its key, rollout configuration, and tags.',
  summary: 'Get feature flag details',
  icon: 'flag',
  group: 'Feature Flags',
  input: z.object({
    flag_id: z.number().int().describe('Feature flag ID'),
  }),
  output: z.object({
    feature_flag: featureFlagSchema.describe('The feature flag details'),
  }),
  handle: async params => {
    const data = await api<RawFeatureFlag>(`/api/projects/${getTeamId()}/feature_flags/${params.flag_id}/`);

    return { feature_flag: mapFeatureFlag(data) };
  },
});
