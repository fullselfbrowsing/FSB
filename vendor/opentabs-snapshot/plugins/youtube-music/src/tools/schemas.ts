import { z } from 'zod';

// --- InnerTube response envelope types ---
// YouTube Music's InnerTube API returns deeply nested JSON with music-specific renderers.

/** Generic record for untyped InnerTube nodes. */
type N = Record<string, unknown>;

// --- Search ---

export interface SearchResponse {
  contents?: {
    tabbedSearchResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: { contents?: SearchSection[] };
          };
        };
      }[];
    };
  };
}

interface SearchSection {
  musicShelfRenderer?: {
    title?: { runs?: TextRun[] };
    contents?: MusicListItem[];
  };
  musicCardShelfRenderer?: N;
}

interface MusicListItem {
  musicResponsiveListItemRenderer?: RawMusicItem;
}

// --- Browse ---

export interface BrowseResponse {
  contents?: {
    singleColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: { contents?: BrowseSection[] };
          };
        };
      }[];
    };
    twoColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: { contents?: BrowseSection[] };
          };
        };
      }[];
      secondaryContents?: {
        sectionListRenderer?: { contents?: BrowseSection[] };
      };
    };
  };
  header?: {
    musicImmersiveHeaderRenderer?: RawArtistHeader;
    musicDetailHeaderRenderer?: N;
  };
  microformat?: {
    microformatDataRenderer?: { urlCanonical?: string };
  };
}

interface BrowseSection {
  musicCarouselShelfRenderer?: {
    header?: {
      musicCarouselShelfBasicHeaderRenderer?: { title?: { runs?: TextRun[] } };
    };
    contents?: CarouselItem[];
  };
  musicShelfRenderer?: {
    title?: { runs?: TextRun[] };
    contents?: MusicListItem[];
  };
  musicResponsiveHeaderRenderer?: RawAlbumHeader;
  gridRenderer?: {
    header?: { gridHeaderRenderer?: { title?: { runs?: TextRun[] } } };
    items?: GridItem[];
  };
  musicDescriptionShelfRenderer?: {
    description?: { runs?: TextRun[] };
  };
}

interface CarouselItem {
  musicTwoRowItemRenderer?: RawTwoRowItem;
  musicResponsiveListItemRenderer?: RawMusicItem;
}

interface GridItem {
  musicTwoRowItemRenderer?: RawTwoRowItem;
}

// --- Player ---

export interface PlayerResponse {
  videoDetails?: RawVideoDetails;
  microformat?: {
    microformatDataRenderer?: {
      urlCanonical?: string;
      publishDate?: string;
    };
  };
}

// --- Playlist list ---

export interface PlaylistListResponse {
  contents?: {
    addToPlaylistRenderer?: {
      playlists?: { playlistAddToOptionRenderer?: RawPlaylistOption }[];
    };
  }[];
}

export interface CreatePlaylistResponse {
  playlistId?: string;
}

// --- Raw types ---

interface TextRun {
  text?: string;
  navigationEndpoint?: {
    browseEndpoint?: {
      browseId?: string;
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
    watchEndpoint?: { videoId?: string };
    searchEndpoint?: { query?: string };
  };
}

export interface RawMusicItem {
  playlistItemData?: { videoId?: string };
  navigationEndpoint?: {
    browseEndpoint?: {
      browseId?: string;
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
    watchEndpoint?: { videoId?: string };
  };
  flexColumns?: {
    musicResponsiveListItemFlexColumnRenderer?: {
      text?: { runs?: TextRun[] };
    };
  }[];
  fixedColumns?: {
    musicResponsiveListItemFixedColumnRenderer?: {
      text?: { runs?: TextRun[] };
    };
  }[];
  thumbnail?: {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
    };
  };
  overlay?: N;
}

export interface RawTwoRowItem {
  title?: { runs?: TextRun[] };
  subtitle?: { runs?: TextRun[] };
  navigationEndpoint?: {
    browseEndpoint?: {
      browseId?: string;
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
    watchEndpoint?: { videoId?: string };
    watchPlaylistEndpoint?: { playlistId?: string };
  };
  thumbnailRenderer?: {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
    };
  };
  menu?: N;
}

interface RawVideoDetails {
  videoId?: string;
  title?: string;
  channelId?: string;
  author?: string;
  lengthSeconds?: string;
  viewCount?: string;
  thumbnail?: { thumbnails?: { url?: string }[] };
  musicVideoType?: string;
}

interface RawArtistHeader {
  title?: { runs?: TextRun[] };
  subtitle?: { runs?: TextRun[] };
  description?: {
    musicDescriptionShelfRenderer?: { description?: { runs?: TextRun[] } };
  };
  thumbnail?: {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: { url?: string }[] };
    };
  };
  subscriptionButton?: { subscribeButtonRenderer?: { channelId?: string; subscribed?: boolean } };
}

export interface RawAlbumHeader {
  title?: { runs?: TextRun[] };
  subtitle?: { runs?: TextRun[] };
  straplineTextOne?: {
    runs?: TextRun[];
  };
  thumbnail?: {
    musicThumbnailRenderer?: {
      thumbnail?: { thumbnails?: { url?: string }[] };
    };
  };
  menu?: N;
}

interface RawPlaylistOption {
  playlistId?: string;
  title?: { simpleText?: string; runs?: { text?: string }[] };
  privacy?: string;
}

// --- Output schemas ---

export const songSchema = z.object({
  video_id: z.string().describe('YouTube Music video/song ID'),
  title: z.string().describe('Song title'),
  artist: z.string().describe('Artist name'),
  artist_id: z.string().describe('Artist browse ID'),
  album: z.string().describe('Album name'),
  album_id: z.string().describe('Album browse ID'),
  duration: z.string().describe('Duration text (e.g., "3:44")'),
  plays: z.string().describe('Play count text (e.g., "2.9B plays")'),
  thumbnail_url: z.string().describe('Thumbnail image URL'),
});

export const songDetailsSchema = z.object({
  video_id: z.string().describe('YouTube Music video/song ID'),
  title: z.string().describe('Song title'),
  artist: z.string().describe('Artist name'),
  artist_id: z.string().describe('Artist channel ID'),
  duration_seconds: z.string().describe('Duration in seconds'),
  view_count: z.string().describe('Numeric view count'),
  thumbnail_url: z.string().describe('High-resolution thumbnail URL'),
  music_video_type: z.string().describe('Music video type (e.g., MUSIC_VIDEO_TYPE_ATV for audio)'),
});

export const albumSchema = z.object({
  browse_id: z.string().describe('Album browse ID (MPRE...)'),
  title: z.string().describe('Album title'),
  artist: z.string().describe('Artist name'),
  artist_id: z.string().describe('Artist browse ID'),
  year: z.string().describe('Release year'),
  thumbnail_url: z.string().describe('Album art URL'),
  track_count: z.number().int().describe('Number of tracks in the album'),
});

export const artistSchema = z.object({
  browse_id: z.string().describe('Artist browse ID (channel ID)'),
  name: z.string().describe('Artist name'),
  subscribers: z.string().describe('Subscriber count text'),
  thumbnail_url: z.string().describe('Artist image URL'),
  description: z.string().describe('Artist description snippet'),
});

export const playlistSchema = z.object({
  playlist_id: z.string().describe('Playlist ID'),
  title: z.string().describe('Playlist title'),
  privacy: z.string().describe('Privacy status (PRIVATE, PUBLIC, UNLISTED)'),
});

export const shelfSchema = z.object({
  title: z.string().describe('Shelf/section title'),
  items: z.array(
    z.object({
      title: z.string().describe('Item title'),
      subtitle: z.string().describe('Item subtitle (artist, description, etc.)'),
      browse_id: z.string().describe('Browse ID for navigation'),
      video_id: z.string().describe('Video ID if this is a playable item'),
      thumbnail_url: z.string().describe('Thumbnail URL'),
      page_type: z.string().describe('Page type (MUSIC_PAGE_TYPE_ALBUM, MUSIC_PAGE_TYPE_ARTIST, etc.)'),
    }),
  ),
});

export const searchSuggestionSchema = z.object({
  text: z.string().describe('Suggestion text'),
  query: z.string().describe('Search query to use'),
});

// --- Mapper functions ---

/** Extract song data from a musicResponsiveListItemRenderer (search results, shelves, playlists). */
export const mapSong = (item: RawMusicItem) => {
  const cols = item.flexColumns ?? [];
  const titleRuns = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const metaRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const playsRuns = cols[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const durationRuns = item.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs;

  // Meta column format: "Artist • Album • Duration" separated by " • "
  const artistRun = metaRuns?.[0];
  const albumRun = metaRuns?.find(
    r =>
      r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType === 'MUSIC_PAGE_TYPE_ALBUM',
  );

  // For non-song results (artists, albums, playlists), the browse ID is on the
  // top-level navigationEndpoint rather than inside flex column runs.
  const itemBrowseId = item.navigationEndpoint?.browseEndpoint?.browseId ?? '';

  return {
    video_id:
      item.playlistItemData?.videoId ??
      titleRuns?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ??
      item.navigationEndpoint?.watchEndpoint?.videoId ??
      '',
    title: titleRuns?.map(r => r.text).join('') ?? '',
    artist: artistRun?.text ?? '',
    artist_id: artistRun?.navigationEndpoint?.browseEndpoint?.browseId ?? itemBrowseId,
    album: albumRun?.text ?? '',
    album_id: albumRun?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
    duration: durationRuns?.map(r => r.text).join('') ?? metaRuns?.at(-1)?.text ?? '',
    plays: playsRuns?.map(r => r.text).join('') ?? '',
    thumbnail_url: item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  };
};

/** Extract item data from a musicTwoRowItemRenderer (carousels, grids). */
export const mapTwoRowItem = (item: RawTwoRowItem) => {
  const browseEp = item.navigationEndpoint?.browseEndpoint;
  const watchEp = item.navigationEndpoint?.watchEndpoint;

  return {
    title: item.title?.runs?.map(r => r.text).join('') ?? '',
    subtitle: item.subtitle?.runs?.map(r => r.text).join('') ?? '',
    browse_id: browseEp?.browseId ?? '',
    video_id: watchEp?.videoId ?? '',
    thumbnail_url: item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url ?? '',
    page_type: browseEp?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? '',
  };
};

/** Extract song details from a player response. */
export const mapSongDetails = (v: RawVideoDetails) => ({
  video_id: v.videoId ?? '',
  title: v.title ?? '',
  artist: v.author ?? '',
  artist_id: v.channelId ?? '',
  duration_seconds: v.lengthSeconds ?? '0',
  view_count: v.viewCount ?? '0',
  thumbnail_url: v.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  music_video_type: v.musicVideoType ?? '',
});

/** Extract album info from a musicResponsiveHeaderRenderer. */
export const mapAlbumHeader = (header: RawAlbumHeader, trackCount: number) => {
  const subtitleRuns = header.subtitle?.runs ?? [];
  const yearRun = subtitleRuns.find(r => /^\d{4}$/.test(r.text ?? ''));
  const artistRun = header.straplineTextOne?.runs?.[0];

  return {
    browse_id: '',
    title: header.title?.runs?.map(r => r.text).join('') ?? '',
    artist: artistRun?.text ?? '',
    artist_id: artistRun?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
    year: yearRun?.text ?? '',
    thumbnail_url: header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url ?? '',
    track_count: trackCount,
  };
};

/** Extract artist info from an immersive header. */
export const mapArtistHeader = (header: RawArtistHeader) => ({
  browse_id: header.subscriptionButton?.subscribeButtonRenderer?.channelId ?? '',
  name: header.title?.runs?.map(r => r.text).join('') ?? '',
  subscribers: header.subtitle?.runs?.map(r => r.text).join('') ?? '',
  thumbnail_url: header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  description: header.description?.musicDescriptionShelfRenderer?.description?.runs?.map(r => r.text).join('') ?? '',
});

/** Extract playlist from addToPlaylistRenderer. */
export const mapPlaylist = (p: RawPlaylistOption) => ({
  playlist_id: p.playlistId ?? '',
  title: p.title?.simpleText ?? p.title?.runs?.map(r => r.text).join('') ?? '',
  privacy: p.privacy ?? '',
});
