import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-music-api.js';
import { type RawMusicItem, mapSong, songSchema } from './schemas.js';

/** Raw browse response shape for playlists. */
interface PlaylistBrowseResponse {
  contents?: {
    twoColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: {
              contents?: PlaylistSection[];
            };
          };
        };
      }[];
      secondaryContents?: {
        sectionListRenderer?: {
          contents?: PlaylistSecondarySection[];
        };
      };
    };
    singleColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: {
              contents?: PlaylistSection[];
            };
          };
        };
      }[];
    };
  };
  microformat?: {
    microformatDataRenderer?: { title?: string };
  };
}

interface PlaylistSection {
  musicResponsiveHeaderRenderer?: {
    title?: { runs?: { text?: string }[] };
  };
  musicEditablePlaylistDetailHeaderRenderer?: {
    header?: {
      musicResponsiveHeaderRenderer?: {
        title?: { runs?: { text?: string }[] };
      };
    };
  };
  musicShelfRenderer?: {
    contents?: { musicResponsiveListItemRenderer?: RawMusicItem }[];
  };
}

interface PlaylistSecondarySection {
  musicShelfRenderer?: {
    contents?: { musicResponsiveListItemRenderer?: RawMusicItem }[];
  };
  musicPlaylistShelfRenderer?: {
    contents?: { musicResponsiveListItemRenderer?: RawMusicItem }[];
  };
}

export const get_playlist = defineTool({
  name: 'get_playlist',
  displayName: 'Get Playlist',
  description:
    'Get playlist details and tracks. Pass a playlist ID — the "VL" prefix is added automatically. Returns the playlist title and all tracks with song metadata.',
  summary: 'Get playlist tracks',
  icon: 'list-music',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('Playlist ID (with or without "VL" prefix)'),
  }),
  output: z.object({
    title: z.string().describe('Playlist title'),
    tracks: z.array(songSchema).describe('Tracks in the playlist'),
  }),
  async handle(params) {
    const browseId = params.playlist_id.startsWith('VL') ? params.playlist_id : `VL${params.playlist_id}`;

    const data = await api<PlaylistBrowseResponse>('browse', { browseId });

    const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
    const singleCol = data.contents?.singleColumnBrowseResultsRenderer;
    const tabSections =
      twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ??
      singleCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ??
      [];

    // Extract title from various header types
    const firstSection = tabSections[0];
    const title =
      firstSection?.musicResponsiveHeaderRenderer?.title?.runs?.map(r => r.text).join('') ??
      firstSection?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer?.title?.runs
        ?.map(r => r.text)
        .join('') ??
      data.microformat?.microformatDataRenderer?.title ??
      'Unknown Playlist';

    // Extract tracks from secondary contents (preferred) or primary content
    const secondarySections = twoCol?.secondaryContents?.sectionListRenderer?.contents ?? [];
    const secondarySection = secondarySections[0];
    const trackItems =
      secondarySection?.musicPlaylistShelfRenderer?.contents ??
      secondarySection?.musicShelfRenderer?.contents ??
      tabSections.flatMap(s => s.musicShelfRenderer?.contents ?? []);

    const tracks: RawMusicItem[] = trackItems
      .map(entry => entry.musicResponsiveListItemRenderer)
      .filter((r): r is RawMusicItem => r != null);

    return {
      title,
      tracks: tracks.map(mapSong),
    };
  },
});
