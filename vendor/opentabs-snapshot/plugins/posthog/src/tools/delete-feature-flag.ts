import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getTeamId, softDelete } from '../posthog-api.js';

export const deleteFeatureFlag = defineTool({
  name: 'delete_feature_flag',
  displayName: 'Delete Feature Flag',
  description: 'Delete a feature flag by marking it as deleted (soft delete).',
  summary: 'Delete a feature flag',
  icon: 'trash-2',
  group: 'Feature Flags',
  input: z.object({
    flag_id: z.number().int().describe('Feature flag ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await softDelete(`/api/projects/${getTeamId()}/feature_flags/${params.flag_id}/`);
    return { success: true };
  },
});
