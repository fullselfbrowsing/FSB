import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import type { CreatePlaylistResponse } from './schemas.js';

export const create_playlist = defineTool({
  name: 'create_playlist',
  displayName: 'Create Playlist',
  description: 'Create a new playlist on YouTube Music',
  summary: 'Create a new playlist',
  icon: 'list-plus',
  group: 'Playlists',
  input: z.object({
    title: z.string().describe('Name for the new playlist'),
    privacy: z
      .enum(['PRIVATE', 'PUBLIC', 'UNLISTED'])
      .optional()
      .describe('Privacy status for the playlist. Defaults to PRIVATE'),
    video_ids: z.array(z.string()).optional().describe('Video IDs to add to the playlist on creation'),
  }),
  output: z.object({
    playlist_id: z.string().describe('ID of the newly created playlist'),
  }),
  async handle(params) {
    const data = await api<CreatePlaylistResponse>('playlist/create', {
      title: params.title,
      privacyStatus: params.privacy ?? 'PRIVATE',
      videoIds: params.video_ids ?? [],
    });

    return { playlist_id: data.playlistId ?? '' };
  },
});
