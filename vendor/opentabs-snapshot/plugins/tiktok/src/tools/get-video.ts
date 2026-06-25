import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSSRData, normalizeUsername } from '../tiktok-api.js';
import { videoSchema, mapVideo } from './schemas.js';
import type { RawVideoItem } from './schemas.js';

export const getVideo = defineTool({
  name: 'get_video',
  displayName: 'Get Video',
  description:
    'Get detailed information about a TikTok video by its ID. Returns video description, author info, play/like/comment/share counts, music details, and cover image. Requires the author username and video ID.',
  summary: 'Get video details by ID',
  icon: 'play',
  group: 'Videos',
  input: z.object({
    username: z.string().describe('Author username without @ prefix (e.g., "charlidamelio")'),
    video_id: z.string().describe('Video ID (numeric string)'),
  }),
  output: z.object({
    video: videoSchema.describe('Video details including engagement stats'),
  }),
  handle: async params => {
    const username = normalizeUsername(params.username);
    const scope = await fetchSSRData(`/@${username}/video/${params.video_id}`);

    const detail = scope['webapp.video-detail'] as
      | {
          itemInfo?: { itemStruct?: RawVideoItem };
          statusCode?: number;
        }
      | undefined;

    if (!detail?.itemInfo?.itemStruct?.id) {
      throw ToolError.notFound(`Video ${params.video_id} by @${username} not found.`);
    }

    return {
      video: mapVideo(detail.itemInfo.itemStruct),
    };
  },
});
