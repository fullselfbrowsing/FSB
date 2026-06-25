import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawAction,
  actionSchema,
  mapAction,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listActions = defineTool({
  name: 'list_actions',
  displayName: 'List Actions',
  description: 'List actions in the current PostHog project. Actions are groups of events defined by matching rules.',
  summary: 'List actions',
  icon: 'zap',
  group: 'Actions',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    actions: z.array(actionSchema).describe('List of actions'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawAction>>(`/api/projects/${getTeamId()}/actions/`, {
      query: { limit: params.limit, offset: params.offset },
    });
    return {
      actions: (data.results ?? []).map(mapAction),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
