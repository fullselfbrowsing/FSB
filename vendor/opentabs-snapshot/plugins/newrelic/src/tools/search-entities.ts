import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { entitySchema, mapEntity } from './schemas.js';
import type { RawEntity } from './schemas.js';

export const searchEntities = defineTool({
  name: 'search_entities',
  displayName: 'Search Entities',
  description:
    "Search for monitored entities (applications, hosts, dashboards, synthetic monitors, etc.) by query. Use domain filters like \"domain IN ('APM', 'INFRA', 'BROWSER')\" or type filters like \"type = 'APPLICATION'\". Combine with name search: \"name LIKE 'my-app'\".",
  summary: 'Search monitored entities',
  icon: 'search',
  group: 'Entities',
  input: z.object({
    query: z
      .string()
      .describe("Entity search query using NRQL-like syntax (e.g., \"name LIKE 'my-app' AND domain = 'APM'\")"),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    entities: z.array(entitySchema).describe('Matching entities'),
    count: z.number().describe('Total number of matching entities'),
    next_cursor: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        entitySearch: {
          count: number;
          results: { entities: RawEntity[]; nextCursor: string | null };
        };
      };
    }>(
      `query SearchEntities($query: String!, $cursor: String) {
        actor {
          entitySearch(query: $query) {
            count
            results(cursor: $cursor) {
              entities {
                guid name type domain entityType alertSeverity reporting permalink
                tags { key values }
              }
              nextCursor
            }
          }
        }
      }`,
      { query: params.query, cursor: params.cursor },
    );
    const search = data.actor.entitySearch;
    return {
      entities: (search?.results?.entities ?? []).map(mapEntity),
      count: search?.count ?? 0,
      next_cursor: search?.results?.nextCursor ?? '',
    };
  },
});
