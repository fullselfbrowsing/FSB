import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type BrowseResponse, mapVideo, videoSchema } from './schemas.js';

export const getPlaylist = defineTool({
  name: 'get_playlist',
  displayName: 'Get Playlist',
  description:
    'Get videos in a YouTube playlist. Returns the playlist title and its video contents. Use "WL" for Watch Later or "LL" for Liked Videos.',
  summary: 'Get playlist videos',
  icon: 'list-video',
  group: 'Playlists',
  input: z.object({
    playlist_id: z.string().describe('Playlist ID (use "WL" for Watch Later, "LL" for Liked Videos)'),
  }),
  output: z.object({
    title: z.string().describe('Playlist title'),
    videos: z.array(videoSchema).describe('Videos in the playlist'),
  }),
  handle: async params => {
    // InnerTube browse uses "VL" prefix for playlist browse IDs
    const browseId = params.playlist_id.startsWith('VL') ? params.playlist_id : `VL${params.playlist_id}`;

    const data = await api<BrowseResponse>('browse', {
      browseId,
    });

    // Extract title from header
    const header = data.header;
    const title = header?.playlistHeaderRenderer?.title?.simpleText ?? header?.pageHeaderRenderer?.pageTitle ?? '';

    // Extract videos — playlist items use playlistVideoRenderer
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const sectionList = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
    const sections = sectionList?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

    const videos = (items ?? []).flatMap(item => {
      const r = item.playlistVideoRenderer;
      if (!r) return [];
      return [
        mapVideo({
          videoId: r.videoId,
          title: r.title,
          shortBylineText: r.shortBylineText,
          viewCountText: undefined,
          publishedTimeText: undefined,
          lengthText: r.lengthText,
          thumbnail: r.thumbnail,
        }),
      ];
    });

    return { title, videos };
  },
});
