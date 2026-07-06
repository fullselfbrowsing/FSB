import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawHashtag, hashtagSchema, mapHashtag } from './schemas.js';

interface HashtagSearchResponse {
  results?: RawHashtag[];
}

export const searchHashtags = defineTool({
  name: 'search_hashtags',
  displayName: 'Search Hashtags',
  description: 'Search for Instagram hashtags by keyword. Returns matching hashtags with post counts.',
  summary: 'Search for hashtags',
  icon: 'hash',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Hashtag search query (without #)'),
    count: z.number().int().min(1).max(50).optional().describe('Number of results to return (default 20)'),
  }),
  output: z.object({
    hashtags: z.array(hashtagSchema).describe('Matching hashtags'),
  }),
  handle: async params => {
    const data = await api<HashtagSearchResponse>('/tags/search/', {
      query: { q: params.query, count: params.count ?? 20 },
    });
    return {
      hashtags: (data.results ?? []).map(mapHashtag),
    };
  },
});
