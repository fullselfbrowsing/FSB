import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

interface RawCampaign {
  id?: string;
  name?: string;
  description?: string;
  imageUri?: string;
}

interface RawGroupCampaign {
  id?: string;
  name?: string;
  description?: string;
  campaigns?: RawCampaign[];
}

interface RawExtrasCampaignsResponse {
  campaigns?: RawCampaign[];
  groupCampaigns?: RawGroupCampaign[];
}

const campaignSchema = z.object({
  id: z.string().describe('Campaign ID'),
  name: z.string().describe('Campaign name'),
  description: z.string().describe('Campaign description'),
  image_url: z.string().describe('Campaign image URL'),
});

const groupCampaignSchema = z.object({
  id: z.string().describe('Group campaign ID'),
  name: z.string().describe('Group campaign name'),
  description: z.string().describe('Group campaign description'),
  campaigns: z.array(campaignSchema).describe('Campaigns in this group'),
});

const mapCampaign = (c: RawCampaign) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  description: c.description ?? '',
  image_url: c.imageUri ?? '',
});

export const getExtrasCampaigns = defineTool({
  name: 'get_extras_campaigns',
  displayName: 'Get Extras Campaigns',
  description:
    'Get Chipotle Extras campaigns — bonus reward opportunities and promotional challenges from the loyalty program.',
  summary: 'Get Extras bonus reward campaigns',
  icon: 'sparkles',
  group: 'Rewards',
  input: z.object({}),
  output: z.object({
    campaigns: z.array(campaignSchema).describe('Individual campaigns'),
    group_campaigns: z.array(groupCampaignSchema).describe('Grouped campaigns'),
  }),
  handle: async () => {
    const data = await api<RawExtrasCampaignsResponse>('/rewardstore/v2/rewardstore/extrasCampaigns');
    return {
      campaigns: (data.campaigns ?? []).map(mapCampaign),
      group_campaigns: (data.groupCampaigns ?? []).map(g => ({
        id: g.id ?? '',
        name: g.name ?? '',
        description: g.description ?? '',
        campaigns: (g.campaigns ?? []).map(mapCampaign),
      })),
    };
  },
});
