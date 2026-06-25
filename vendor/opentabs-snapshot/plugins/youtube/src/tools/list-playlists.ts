import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type PlaylistListResponse, mapPlaylist, playlistSchema } from './schemas.js';

export const listPlaylists = defineTool({
  name: 'list_playlists',
  displayName: 'List Playlists',
  description:
    "List the authenticated user's playlists including Watch Later, Liked Videos, and custom playlists. Each playlist includes its ID, title, and privacy status.",
  summary: 'List your playlists',
  icon: 'list-video',
  group: 'Playlists',
  input: z.object({}),
  output: z.object({
    playlists: z.array(playlistSchema).describe('List of user playlists'),
  }),
  handle: async () => {
    // The get_add_to_playlist endpoint returns all user playlists
    // We use a dummy video ID — the playlists returned are the same regardless
    const data = await api<PlaylistListResponse>('playlist/get_add_to_playlist', {
      videoIds: ['dQw4w9WgXcQ'],
    });

    const playlistContents = data.contents?.[0]?.addToPlaylistRenderer?.playlists;
    const playlists = (playlistContents ?? []).flatMap(p =>
      p.playlistAddToOptionRenderer ? [p.playlistAddToOptionRenderer] : [],
    );

    return { playlists: playlists.map(mapPlaylist) };
  },
});
