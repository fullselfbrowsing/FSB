import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { mapSearchResult, searchResultSchema } from './schemas.js';
import type { RawSearchEntity } from './schemas.js';

const QUERY = `query GlobalSearch($query: String!, $limit: Int!, $appIds: [String!], $isArchived: Boolean, $isGenerated: Boolean, $isOfficial: Boolean, $isTemplate: Boolean, $lastModifiedAfter: Float, $lastViewedBefore: Float, $owners: [String!], $searchContentTypes: [String!]!, $sortDirection: SortDirection, $sortOrder: SortOrder, $spaceIds: [String!], $chartTypes: [String!]) {
  unisearchContentSearch(
    query: $query limit: $limit appIds: $appIds isArchived: $isArchived
    isGenerated: $isGenerated isOfficial: $isOfficial isTemplate: $isTemplate
    lastModifiedAfter: $lastModifiedAfter lastViewedBefore: $lastViewedBefore
    owners: $owners searchContentTypes: $searchContentTypes
    sortDirection: $sortDirection sortOrder: $sortOrder
    spaceIds: $spaceIds chartTypes: $chartTypes
  ) {
    results {
      entity {
        entityId name description type chartType chartCount nudgeType
        owners isOfficial isTemplate appIds lastModifiedAt lastViewedAt
        isArchived location { locationId } viewCount
      }
      scoreComponents
    }
    totalHits
  }
}`;

export const searchContent = defineTool({
  name: 'search_content',
  displayName: 'Search Content',
  description:
    'Search across all Amplitude content including charts, dashboards, cohorts, notebooks, and nudges. Filter by content type, owner, space, and more. Results are sorted by relevance by default.',
  summary: 'Search charts, dashboards, cohorts, and more',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search text (empty string for recent items)'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results to return (default 30)'),
    content_types: z
      .array(z.string())
      .optional()
      .describe('Filter by content types: CHART, DASHBOARD, COHORT, NOTEBOOK, NUDGE, SPACE (default: all)'),
    owners: z.array(z.string()).optional().describe('Filter by owner login IDs'),
    is_archived: z.boolean().optional().describe('Include archived content (default false)'),
    sort_order: z
      .enum(['RELEVANCE', 'LAST_MODIFIED', 'LAST_VIEWED', 'VIEW_COUNT'])
      .optional()
      .describe('Sort order (default RELEVANCE)'),
    sort_direction: z.enum(['ASC', 'DESC']).optional().describe('Sort direction (default DESC)'),
  }),
  output: z.object({
    results: z.array(searchResultSchema).describe('Search results'),
    total_hits: z.number().int().describe('Total number of matching results'),
  }),
  handle: async params => {
    const data = await gql<{
      unisearchContentSearch: {
        results: Array<{ entity: RawSearchEntity }>;
        totalHits: number;
      };
    }>('GlobalSearch', QUERY, {
      query: params.query,
      limit: params.limit ?? 30,
      appIds: [],
      isArchived: params.is_archived ?? false,
      isGenerated: false,
      isOfficial: false,
      isTemplate: false,
      lastModifiedAfter: 0,
      searchContentTypes: params.content_types ?? [],
      sortDirection: params.sort_direction ?? 'DESC',
      sortOrder: params.sort_order ?? 'RELEVANCE',
      spaceIds: [],
      owners: params.owners ?? [],
    });
    const search = data.unisearchContentSearch ?? {
      results: [],
      totalHits: 0,
    };
    return {
      results: search.results.map(mapSearchResult),
      total_hits: search.totalHits ?? 0,
    };
  },
});
