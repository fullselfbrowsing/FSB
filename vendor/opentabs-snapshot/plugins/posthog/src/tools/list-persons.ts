import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawPerson,
  mapPerson,
  paginationInput,
  paginationOutput,
  personSchema,
} from './schemas.js';

export const listPersons = defineTool({
  name: 'list_persons',
  displayName: 'List Persons',
  description:
    'List persons (users) tracked in the current PostHog project. Supports search by name, email, or distinct ID.',
  summary: 'List tracked persons',
  icon: 'users',
  group: 'Persons',
  input: paginationInput.extend({
    search: z.string().optional().describe('Search by name, email, or distinct ID'),
    distinct_id: z.string().optional().describe('Filter by exact distinct ID'),
  }),
  output: paginationOutput.extend({
    persons: z.array(personSchema).describe('List of persons'),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawPerson>>(`/api/environments/${getTeamId()}/persons/`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        search: params.search,
        distinct_id: params.distinct_id,
      },
    });

    return {
      persons: (data.results ?? []).map(mapPerson),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
