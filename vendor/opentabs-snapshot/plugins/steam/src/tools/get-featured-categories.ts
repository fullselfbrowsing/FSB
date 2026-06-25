import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawFeaturedGame, featuredGameSchema, mapFeaturedGame } from './schemas.js';

interface FeaturedCategoryData {
  id?: string;
  name?: string;
  items?: RawFeaturedGame[];
}

interface FeaturedCategoriesResponse {
  specials?: FeaturedCategoryData;
  coming_soon?: FeaturedCategoryData;
  top_sellers?: FeaturedCategoryData;
  new_releases?: FeaturedCategoryData;
}

const categoryOutputSchema = z.object({
  name: z.string().describe('Category display name'),
  items: z.array(featuredGameSchema).describe('Games in this category'),
});

export const getFeaturedCategories = defineTool({
  name: 'get_featured_categories',
  displayName: 'Get Featured Categories',
  description:
    'Get games from featured store categories: specials (on sale), top sellers, new releases, and coming soon. Each category contains games with pricing info. Prices are in cents.',
  summary: 'Get specials, top sellers, new releases, coming soon',
  icon: 'layout-grid',
  group: 'Store',
  input: z.object({}),
  output: z.object({
    specials: categoryOutputSchema.describe('Games currently on sale'),
    top_sellers: categoryOutputSchema.describe('Current top selling games'),
    new_releases: categoryOutputSchema.describe('Recently released games'),
    coming_soon: categoryOutputSchema.describe('Upcoming games'),
  }),
  handle: async () => {
    const data = await storeGet<FeaturedCategoriesResponse>('/api/featuredcategories/');
    const mapCategory = (c?: FeaturedCategoryData) => ({
      name: c?.name ?? '',
      items: (c?.items ?? []).map(mapFeaturedGame),
    });
    return {
      specials: mapCategory(data.specials),
      top_sellers: mapCategory(data.top_sellers),
      new_releases: mapCategory(data.new_releases),
      coming_soon: mapCategory(data.coming_soon),
    };
  },
});
