import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type BrowseResponse, channelSchema, mapChannel } from './schemas.js';

export const getChannel = defineTool({
  name: 'get_channel',
  displayName: 'Get Channel',
  description:
    'Get detailed information about a YouTube channel including name, description, subscriber count, video count, and banner/avatar images.',
  summary: 'Get channel details by ID',
  icon: 'tv',
  group: 'Channels',
  input: z.object({
    channel_id: z.string().describe('YouTube channel ID (starts with "UC")'),
  }),
  output: z.object({
    channel: channelSchema.describe('Channel details'),
  }),
  handle: async params => {
    const data = await api<BrowseResponse>('browse', {
      browseId: params.channel_id,
    });

    const metadata = data.metadata?.channelMetadataRenderer;
    const pageHeader = data.header?.pageHeaderRenderer;

    return {
      channel: mapChannel(
        metadata ?? {},
        pageHeader
          ? {
              pageHeaderViewModel: pageHeader.content?.pageHeaderViewModel,
            }
          : undefined,
      ),
    };
  },
});
