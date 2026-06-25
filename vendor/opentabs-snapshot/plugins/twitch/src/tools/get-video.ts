import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { videoSchema, mapVideo } from './schemas.js';
import type { RawVideo } from './schemas.js';

export const getVideo = defineTool({
  name: 'get_video',
  displayName: 'Get Video',
  description:
    'Get details about a specific Twitch video by its ID. Returns title, view count, duration, game, and broadcaster info.',
  summary: 'Get details about a specific video',
  icon: 'video',
  group: 'Videos',
  input: z.object({
    id: z.string().describe('Video ID (e.g., "2717949378")'),
  }),
  output: z.object({
    video: videoSchema.extend({
      broadcaster: z
        .object({
          id: z.string().describe('Broadcaster user ID'),
          login: z.string().describe('Broadcaster login name'),
          displayName: z.string().describe('Broadcaster display name'),
        })
        .describe('Video broadcaster'),
    }),
  }),
  handle: async params => {
    interface RawVideoWithBroadcaster extends RawVideo {
      owner?: { id?: string; login?: string; displayName?: string };
      thumbnailURLs?: string[];
    }
    const data = await gql<{ video: RawVideoWithBroadcaster | null }>(`{
      video(id: "${params.id}") {
        id title viewCount publishedAt lengthSeconds
        game { id name }
        thumbnailURLs(width: 320, height: 180)
        owner { id login displayName }
      }
    }`);
    if (!data.video) throw ToolError.notFound(`Video "${params.id}" not found`);
    const v = data.video;
    return {
      video: {
        ...mapVideo({ ...v, thumbnailURL: v.thumbnailURLs?.[0] ?? '' }),
        broadcaster: {
          id: v.owner?.id ?? '',
          login: v.owner?.login ?? '',
          displayName: v.owner?.displayName ?? '',
        },
      },
    };
  },
});
