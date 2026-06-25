import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawPreconfiguredMeal, mapPreconfiguredMeal, preconfiguredMealSchema } from './schemas.js';

export const getPreconfiguredMeals = defineTool({
  name: 'get_preconfigured_meals',
  displayName: 'Get Preconfigured Meals',
  description:
    'Get pre-built meal options for a Chipotle restaurant including Build-Your-Own and featured meals with their customization descriptions.',
  summary: 'Get preconfigured meal options for a restaurant',
  icon: 'chef-hat',
  group: 'Menu',
  input: z.object({
    restaurant_id: z.number().int().describe('Restaurant ID (from find_restaurants)'),
  }),
  output: z.object({
    meals: z.array(preconfiguredMealSchema).describe('Preconfigured meal options'),
  }),
  handle: async params => {
    const data = await api<RawPreconfiguredMeal[]>(
      `/menuinnovation/v1/restaurants/${params.restaurant_id}/onlinemeals`,
      {
        query: { includeUnavailableItems: true },
      },
    );
    return { meals: (data ?? []).map(mapPreconfiguredMeal) };
  },
});
