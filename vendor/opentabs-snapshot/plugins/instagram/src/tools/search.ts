import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import {
  type RawHashtag,
  type RawUserSummary,
  hashtagSchema,
  mapHashtag,
  mapUserSummary,
  userSummarySchema,
} from './schemas.js';

interface SearchResponse {
  users?: { user?: RawUserSummary }[];
  hashtags?: { hashtag?: RawHashtag }[];
  places?: {
    place?: {
      title?: string;
      location?: { pk?: number; name?: string; address?: string; city?: string; lat?: number; lng?: number };
    };
  }[];
}

const placeSchema = z.object({
  title: z.string().describe('Place name'),
  address: z.string().describe('Street address'),
  city: z.string().describe('City'),
  lat: z.number().describe('Latitude'),
  lng: z.number().describe('Longitude'),
});

export const search = defineTool({
  name: 'search',
  displayName: 'Search',
  description: 'Search Instagram for users, hashtags, and places. Returns blended results ranked by relevance.',
  summary: 'Search users, hashtags, and places',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query text'),
  }),
  output: z.object({
    users: z.array(userSummarySchema).describe('Matching users'),
    hashtags: z.array(hashtagSchema).describe('Matching hashtags'),
    places: z.array(placeSchema).describe('Matching places'),
  }),
  handle: async params => {
    const data = await api<SearchResponse>('/web/search/topsearch/', {
      query: { context: 'blended', query: params.query, include_reel: 'true' },
    });
    return {
      users: (data.users ?? []).map(u => mapUserSummary(u.user ?? {})),
      hashtags: (data.hashtags ?? []).map(h => mapHashtag(h.hashtag ?? {})),
      places: (data.places ?? []).map(p => ({
        title: p.place?.title ?? '',
        address: p.place?.location?.address ?? '',
        city: p.place?.location?.city ?? '',
        lat: p.place?.location?.lat ?? 0,
        lng: p.place?.location?.lng ?? 0,
      })),
    };
  },
});
