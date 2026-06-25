import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type NextResponse, type PlayerResponse, mapVideoDetails, videoDetailsSchema } from './schemas.js';

export const getVideo = defineTool({
  name: 'get_video',
  displayName: 'Get Video',
  description:
    'Get detailed information about a YouTube video including title, description, view count, duration, channel info, keywords, and publish date.',
  summary: 'Get video details by ID',
  icon: 'play',
  group: 'Videos',
  input: z.object({
    video_id: z.string().describe('YouTube video ID (e.g., "dQw4w9WgXcQ")'),
  }),
  output: z.object({
    video: videoDetailsSchema.describe('Video details'),
  }),
  handle: async params => {
    // Use player endpoint for core metadata
    const playerData = await api<PlayerResponse>('player', {
      videoId: params.video_id,
    });

    const videoDetails = playerData.videoDetails;

    // Use next endpoint for supplementary data (owner info, publish date)
    const nextData = await api<NextResponse>('next', {
      videoId: params.video_id,
    });

    const watchContents = nextData.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    const secondaryInfo = watchContents?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
    const owner = secondaryInfo?.owner;
    const primaryInfo = watchContents?.find(c => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
    const dateText = primaryInfo?.dateText?.simpleText;

    return {
      video: mapVideoDetails(videoDetails ?? {}, owner, dateText),
    };
  },
});
