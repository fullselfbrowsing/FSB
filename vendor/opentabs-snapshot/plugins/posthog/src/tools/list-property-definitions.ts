import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawPropertyDefinition,
  propertyDefinitionSchema,
  mapPropertyDefinition,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listPropertyDefinitions = defineTool({
  name: 'list_property_definitions',
  displayName: 'List Property Definitions',
  description:
    'List all property definitions (event properties, person properties, or group properties) in the current PostHog project. Returns property names and types. Use type filter to scope: "event" for event properties, "person" for person properties.',
  summary: 'List tracked property definitions',
  icon: 'tag',
  group: 'Data Management',
  input: z.object({
    ...paginationInput.shape,
    type: z
      .enum(['event', 'person', 'group'])
      .optional()
      .describe('Property type filter: "event" (default), "person", or "group"'),
    search: z.string().optional().describe('Search property names by substring'),
  }),
  output: z.object({
    property_definitions: z.array(propertyDefinitionSchema).describe('List of property definitions'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const teamId = getTeamId();
    const data = await api<PaginatedResponse<RawPropertyDefinition>>(`/api/projects/${teamId}/property_definitions/`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        type: params.type ?? 'event',
        search: params.search,
      },
    });
    return {
      property_definitions: (data.results ?? []).map(mapPropertyDefinition),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
