import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawFeaturedGame, featuredGameSchema, mapFeaturedGame } from './schemas.js';

interface FeaturedResponse {
  large_capsules?: RawFeaturedGame[];
  featured_win?: RawFeaturedGame[];
  featured_mac?: RawFeaturedGame[];
  featured_linux?: RawFeaturedGame[];
}

export const getFeatured = defineTool({
  name: 'get_featured',
  displayName: 'Get Featured',
  description:
    'Get currently featured games on the Steam store front page. Returns featured games for Windows, Mac, and Linux with pricing info. Prices are in cents.',
  summary: 'Get featured games on the Steam store',
  icon: 'star',
  group: 'Store',
  input: z.object({}),
  output: z.object({
    large_capsules: z.array(featuredGameSchema).describe('Large capsule featured games'),
    featured_win: z.array(featuredGameSchema).describe('Featured Windows games'),
    featured_mac: z.array(featuredGameSchema).describe('Featured macOS games'),
    featured_linux: z.array(featuredGameSchema).describe('Featured Linux games'),
  }),
  handle: async () => {
    const data = await storeGet<FeaturedResponse>('/api/featured/');
    return {
      large_capsules: (data.large_capsules ?? []).map(mapFeaturedGame),
      featured_win: (data.featured_win ?? []).map(mapFeaturedGame),
      featured_mac: (data.featured_mac ?? []).map(mapFeaturedGame),
      featured_linux: (data.featured_linux ?? []).map(mapFeaturedGame),
    };
  },
});
