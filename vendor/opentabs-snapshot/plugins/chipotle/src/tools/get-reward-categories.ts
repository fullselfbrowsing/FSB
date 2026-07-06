import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

interface RawOfferType {
  offerType?: string;
  title?: string;
  description?: string;
  imageUri?: string;
  sortOrder?: number;
}

export const getRewardCategories = defineTool({
  name: 'get_reward_categories',
  displayName: 'Get Reward Categories',
  description:
    'Get reward category types from the Chipotle Rewards store. Each category groups related reward offers with a title, description, and image.',
  summary: 'Get reward store offer categories',
  icon: 'layers',
  group: 'Rewards',
  input: z.object({}),
  output: z.object({
    categories: z
      .array(
        z.object({
          offer_type: z.string().describe('Offer type identifier'),
          title: z.string().describe('Category title'),
          description: z.string().describe('Category description'),
          image_url: z.string().describe('Category image URL'),
          sort_order: z.number().describe('Display sort order'),
        }),
      )
      .describe('Reward offer categories'),
  }),
  handle: async () => {
    const data = await api<RawOfferType[]>('/rewardstore/v2/rewardstore/offerTypes');
    return {
      categories: (data ?? []).map(t => ({
        offer_type: t.offerType ?? '',
        title: t.title ?? '',
        description: t.description ?? '',
        image_url: t.imageUri ?? '',
        sort_order: t.sortOrder ?? 0,
      })),
    };
  },
});
