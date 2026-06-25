import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawFeatureFlag,
  featureFlagSchema,
  mapFeatureFlag,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listFeatureFlags = defineTool({
  name: 'list_feature_flags',
  displayName: 'List Feature Flags',
  description:
    'List feature flags in the current PostHog project. Supports filtering by active status and search query.',
  summary: 'List feature flags',
  icon: 'flag',
  group: 'Feature Flags',
  input: paginationInput.extend({
    active: z.string().optional().describe('Filter by active status: "true", "false", or "STALE"'),
    search: z.string().optional().describe('Search by flag key or name'),
  }),
  output: paginationOutput.extend({
    feature_flags: z.array(featureFlagSchema).describe('List of feature flags'),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawFeatureFlag>>(`/api/projects/${getTeamId()}/feature_flags/`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        active: params.active,
        search: params.search,
      },
    });

    return {
      feature_flags: (data.results ?? []).map(mapFeatureFlag),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
