import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack } from '../npm-api.js';
import { searchPackageSchema, mapSearchPackage } from './schemas.js';
import type { RawSearchObject } from './schemas.js';

interface SearchResponse {
  objects?: RawSearchObject[];
  total?: number;
}

export const search_packages = defineTool({
  name: 'search_packages',
  displayName: 'Search Packages',
  description:
    'Search for npm packages by keyword. Supports special qualifiers: author:name, maintainer:name, scope:name, keywords:term (use , for OR, + for AND), not:unstable, not:insecure, is:unstable, is:insecure. Returns packages with scores and metadata.',
  summary: 'Search the npm registry for packages',
  icon: 'search',
  group: 'Packages',
  input: z.object({
    query: z.string().describe('Search query text with optional qualifiers (e.g., "react", "author:sindresorhus")'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (default 0)'),
  }),
  output: z.object({
    packages: z.array(searchPackageSchema).describe('Matching packages'),
    total: z.number().describe('Total number of matching packages'),
  }),
  handle: async params => {
    const page = params.page ?? 0;
    const data = await spiferack<SearchResponse>('/search', {
      query: { q: params.query, page },
    });
    return {
      packages: (data.objects ?? []).map(mapSearchPackage),
      total: data.total ?? 0,
    };
  },
});
