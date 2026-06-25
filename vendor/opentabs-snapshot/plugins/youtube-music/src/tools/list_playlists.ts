import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { playlistSchema, mapPlaylist } from './schemas.js';
import type { PlaylistListResponse } from './schemas.js';

export const list_playlists = defineTool({
  name: 'list_playlists',
  displayName: 'List Playlists',
  description: "List the user's playlists from YouTube Music",
  summary: "List user's playlists",
  icon: 'list',
  group: 'Playlists',
  input: z.object({
    video_id: z.string().optional().describe('Video ID for playlist add context'),
  }),
  output: z.object({
    playlists: z.array(playlistSchema).describe('List of user playlists'),
  }),
  async handle(params) {
    const videoIds = params.video_id ? [params.video_id] : ['dQw4w9WgXcQ'];
    const data = await api<PlaylistListResponse>('playlist/get_add_to_playlist', {
      videoIds,
    });

    const contents = data.contents?.[0]?.addToPlaylistRenderer?.playlists ?? [];

    const playlists = contents
      .map(entry => {
        const renderer = entry.playlistAddToOptionRenderer;
        if (!renderer) return null;
        return mapPlaylist(renderer);
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { playlists };
  },
});
