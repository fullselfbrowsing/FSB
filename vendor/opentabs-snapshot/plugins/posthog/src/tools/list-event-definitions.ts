import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawEventDefinition,
  eventDefinitionSchema,
  mapEventDefinition,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listEventDefinitions = defineTool({
  name: 'list_event_definitions',
  displayName: 'List Event Definitions',
  description:
    'List all event types that have been sent to the current PostHog project. Returns event names with 30-day volume and last-seen timestamps. Useful for discovering what events are being tracked before querying them.',
  summary: 'List tracked event types',
  icon: 'list',
  group: 'Data Management',
  input: z.object({
    ...paginationInput.shape,
    search: z.string().optional().describe('Search event names by substring'),
  }),
  output: z.object({
    event_definitions: z.array(eventDefinitionSchema).describe('List of event definitions'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const teamId = getTeamId();
    const data = await api<PaginatedResponse<RawEventDefinition>>(`/api/projects/${teamId}/event_definitions/`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        search: params.search,
      },
    });
    return {
      event_definitions: (data.results ?? []).map(mapEventDefinition),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
