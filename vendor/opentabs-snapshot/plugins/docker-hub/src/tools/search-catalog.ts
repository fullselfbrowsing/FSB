import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { searchApi } from '../docker-hub-api.js';
import { catalogResultSchema, mapCatalogResult } from './schemas.js';
import type { RawCatalogResult } from './schemas.js';

interface CatalogSearchResponse {
  total?: number;
  results?: RawCatalogResult[];
}

export const searchCatalog = defineTool({
  name: 'search_catalog',
  displayName: 'Search Catalog',
  description:
    'Search the Docker Hub catalog for images, extensions, and models. Returns rich metadata including categories, source type (official, verified publisher, community), and content types. This is the newer, more comprehensive search API.',
  summary: 'Search Docker Hub catalog (images, models, extensions)',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Search query'),
    from: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    size: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 25, max 100)'),
    type: z.enum(['image', 'model', 'extension']).optional().describe('Filter by content type'),
    source: z.enum(['official', 'verified_publisher', 'community']).optional().describe('Filter by source type'),
  }),
  output: z.object({
    total: z.number().describe('Total number of matching results'),
    results: z.array(catalogResultSchema),
  }),
  handle: async params => {
    const data = await searchApi<CatalogSearchResponse>({
      query: params.query,
      from: params.from ?? 0,
      size: params.size ?? 25,
      type: params.type,
      source: params.source,
    });
    return {
      total: data.total ?? 0,
      results: (data.results ?? []).map(mapCatalogResult),
    };
  },
});
