import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { mapTwoRowItem } from './schemas.js';
import type { BrowseResponse, RawTwoRowItem } from './schemas.js';

export const get_library = defineTool({
  name: 'get_library',
  displayName: 'Get Library',
  description: "Get the user's YouTube Music library overview with playlists",
  summary: "Get the user's music library overview",
  icon: 'library',
  group: 'Library',
  input: z.object({}),
  output: z.object({
    playlists: z
      .array(
        z.object({
          title: z.string().describe('Playlist title'),
          subtitle: z.string().describe('Playlist subtitle or description'),
          browse_id: z.string().describe('Browse ID for the playlist'),
          thumbnail_url: z.string().describe('URL of the playlist thumbnail'),
        }),
      )
      .describe('Playlists in the user library'),
  }),
  async handle() {
    const data = await api<BrowseResponse>('browse', {
      browseId: 'FEmusic_liked_playlists',
    });

    const sections =
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents ?? [];

    const items: RawTwoRowItem[] = [];
    for (const section of sections) {
      const grid = section.gridRenderer;
      if (!grid?.items) continue;
      for (const item of grid.items) {
        if (item.musicTwoRowItemRenderer) {
          items.push(item.musicTwoRowItemRenderer);
        }
      }
    }

    const playlists = items
      .map(item => {
        const mapped = mapTwoRowItem(item);
        if (!mapped.browse_id) return null;
        return {
          title: mapped.title,
          subtitle: mapped.subtitle,
          browse_id: mapped.browse_id,
          thumbnail_url: mapped.thumbnail_url,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { playlists };
  },
});
