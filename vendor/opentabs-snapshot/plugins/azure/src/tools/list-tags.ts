import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawTag, mapTag, tagSchema } from './schemas.js';

export const listTags = defineTool({
  name: 'list_tags',
  displayName: 'List Tags',
  description:
    'List all tag names and values used in a subscription. Shows how many resources use each tag name and value combination.',
  summary: 'List all tags in a subscription',
  icon: 'tags',
  group: 'Tags',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
  }),
  output: z.object({
    tags: z.array(tagSchema).describe('List of tags with their values and counts'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawTag>>(`/subscriptions/${params.subscription_id}/tagNames`, {
      apiVersion: '2021-04-01',
    });
    return { tags: (data.value ?? []).map(mapTag) };
  },
});
