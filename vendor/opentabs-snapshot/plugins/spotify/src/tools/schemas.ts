import { z } from 'zod';

// ============================================================================
// Schemas and mappers for Spotify's internal GraphQL API responses.
// These match the shapes returned by api-partner.spotify.com/pathfinder/v2/query.
// ============================================================================

// --- Image source (shared across all GraphQL responses) ---

export const imageSourceSchema = z.object({
  url: z.string().describe('Image URL'),
  width: z.number().describe('Image width in pixels'),
  height: z.number().describe('Image height in pixels'),
});

export interface RawImageSource {
  url?: string;
  width?: number | null;
  height?: number | null;
}

export const mapImageSource = (s: RawImageSource) => ({
  url: s.url ?? '',
  width: s.width ?? 0,
  height: s.height ?? 0,
});

// --- Artist reference (lightweight, appears in track/album listings) ---

export const artistRefSchema = z.object({
  uri: z.string().describe('Spotify URI (e.g., spotify:artist:xxx)'),
  name: z.string().describe('Artist name'),
});

export interface RawArtistRef {
  uri?: string;
  profile?: { name?: string };
}

export const mapArtistRef = (a: RawArtistRef) => ({
  uri: a.uri ?? '',
  name: a.profile?.name ?? '',
});

// --- Track (from GraphQL search, album, playlist, and library responses) ---

export const trackSchema = z.object({
  uri: z.string().describe('Spotify URI (e.g., spotify:track:xxx)'),
  name: z.string().describe('Track name'),
  duration_ms: z.number().int().describe('Track duration in milliseconds'),
  artists: z.array(artistRefSchema).describe('Track artists'),
  album_name: z.string().describe('Album name'),
  album_uri: z.string().describe('Album URI'),
  album_cover_url: z.string().describe('Album cover image URL'),
});

export interface RawGqlTrack {
  uri?: string;
  id?: string;
  name?: string;
  duration?: { totalMilliseconds?: number };
  playcount?: string;
  trackNumber?: number;
  artists?: { items?: RawArtistRef[] };
  albumOfTrack?: {
    uri?: string;
    name?: string;
    coverArt?: { sources?: RawImageSource[] };
  };
}

export const mapGqlTrack = (t: RawGqlTrack) => ({
  uri: t.uri ?? '',
  name: t.name ?? '',
  duration_ms: t.duration?.totalMilliseconds ?? 0,
  artists: (t.artists?.items ?? []).map(mapArtistRef),
  album_name: t.albumOfTrack?.name ?? '',
  album_uri: t.albumOfTrack?.uri ?? '',
  album_cover_url: t.albumOfTrack?.coverArt?.sources?.[0]?.url ?? '',
});

// --- Full artist (from queryArtistOverview) ---

export const artistTopTrackSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Track name'),
  duration_ms: z.number().int().describe('Duration in milliseconds'),
  playcount: z.string().describe('Total play count'),
  artists: z.array(artistRefSchema).describe('Track artists'),
  album_name: z.string().describe('Album name'),
  album_uri: z.string().describe('Album URI'),
  album_cover_url: z.string().describe('Album cover image URL'),
});

export const artistSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Artist name'),
  biography: z.string().describe('Artist biography text'),
  followers: z.number().int().describe('Total follower count'),
  monthly_listeners: z.number().int().describe('Monthly listener count'),
  avatar_url: z.string().describe('Artist avatar image URL'),
  header_url: z.string().describe('Artist header image URL'),
  top_tracks: z.array(artistTopTrackSchema).describe("Artist's top tracks"),
});

export interface RawArtistOverview {
  artistUnion?: {
    uri?: string;
    profile?: { name?: string; biography?: { text?: string } };
    visuals?: {
      avatarImage?: { sources?: RawImageSource[] };
      headerImage?: { sources?: RawImageSource[] };
    };
    discography?: {
      topTracks?: {
        items?: Array<{
          track?: RawGqlTrack;
        }>;
      };
    };
    stats?: { followers?: number; monthlyListeners?: number };
  };
}

export const mapArtistOverview = (data: RawArtistOverview) => {
  const a = data.artistUnion;
  return {
    uri: a?.uri ?? '',
    name: a?.profile?.name ?? '',
    biography: a?.profile?.biography?.text ?? '',
    followers: a?.stats?.followers ?? 0,
    monthly_listeners: a?.stats?.monthlyListeners ?? 0,
    avatar_url: a?.visuals?.avatarImage?.sources?.[0]?.url ?? '',
    header_url: a?.visuals?.headerImage?.sources?.[0]?.url ?? '',
    top_tracks: (a?.discography?.topTracks?.items ?? []).map(item => {
      const t = item.track;
      return {
        uri: t?.uri ?? '',
        name: t?.name ?? '',
        duration_ms: t?.duration?.totalMilliseconds ?? 0,
        playcount: t?.playcount ?? '0',
        artists: (t?.artists?.items ?? []).map(mapArtistRef),
        album_name: t?.albumOfTrack?.name ?? '',
        album_uri: t?.albumOfTrack?.uri ?? '',
        album_cover_url: t?.albumOfTrack?.coverArt?.sources?.[0]?.url ?? '',
      };
    }),
  };
};

// --- Album (from getAlbum) ---

export const albumTrackSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Track name'),
  track_number: z.number().int().describe('Track number on the album'),
  duration_ms: z.number().int().describe('Duration in milliseconds'),
  playcount: z.string().describe('Total play count'),
  artists: z.array(artistRefSchema).describe('Track artists'),
});

export const albumSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Album name'),
  type: z.string().describe('Album type (ALBUM, SINGLE, COMPILATION)'),
  release_date: z.string().describe('Release date (ISO string or year)'),
  label: z.string().describe('Record label'),
  total_tracks: z.number().int().describe('Total number of tracks'),
  artists: z.array(artistRefSchema).describe('Album artists'),
  cover_url: z.string().describe('Album cover image URL'),
  copyrights: z.array(z.string()).describe('Copyright notices'),
  tracks: z.array(albumTrackSchema).describe('Album tracks'),
});

interface RawAlbumArtist {
  uri?: string;
  profile?: { name?: string };
  id?: string;
}

export interface RawAlbumResponse {
  albumUnion?: {
    uri?: string;
    name?: string;
    type?: string;
    date?: { isoString?: string; year?: number };
    label?: string;
    copyright?: { items?: Array<{ type?: string; text?: string }> };
    artists?: { items?: RawAlbumArtist[] };
    coverArt?: { sources?: RawImageSource[] };
    tracksV2?: {
      totalCount?: number;
      items?: Array<{
        track?: {
          uri?: string;
          id?: string;
          name?: string;
          trackNumber?: number;
          duration?: { totalMilliseconds?: number };
          playcount?: string;
          artists?: { items?: RawArtistRef[] };
        };
      }>;
    };
  };
}

export const mapAlbum = (data: RawAlbumResponse) => {
  const a = data.albumUnion;
  return {
    uri: a?.uri ?? '',
    name: a?.name ?? '',
    type: a?.type ?? '',
    release_date: a?.date?.isoString ?? String(a?.date?.year ?? ''),
    label: a?.label ?? '',
    total_tracks: a?.tracksV2?.totalCount ?? 0,
    artists: (a?.artists?.items ?? []).map(art => ({
      uri: art.uri ?? '',
      name: art.profile?.name ?? '',
    })),
    cover_url: a?.coverArt?.sources?.[0]?.url ?? '',
    copyrights: (a?.copyright?.items ?? []).map(c => c.text ?? ''),
    tracks: (a?.tracksV2?.items ?? []).map(item => {
      const t = item.track;
      return {
        uri: t?.uri ?? '',
        name: t?.name ?? '',
        track_number: t?.trackNumber ?? 0,
        duration_ms: t?.duration?.totalMilliseconds ?? 0,
        playcount: t?.playcount ?? '0',
        artists: (t?.artists?.items ?? []).map(mapArtistRef),
      };
    }),
  };
};

// --- Playlist (from fetchPlaylist) ---

export const playlistTrackSchema = z.object({
  added_at: z.string().describe('ISO 8601 timestamp when the track was added'),
  added_by_uri: z.string().describe('URI of the user who added the track'),
  added_by_name: z.string().describe('Name of the user who added the track'),
  track: trackSchema.describe('Track details'),
});

export const playlistSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Playlist name'),
  description: z.string().describe('Playlist description'),
  owner_name: z.string().describe('Owner display name'),
  owner_uri: z.string().describe('Owner URI'),
  total_tracks: z.number().int().describe('Total number of tracks'),
  images: z.array(imageSourceSchema).describe('Playlist cover images'),
  tracks: z.array(playlistTrackSchema).describe('Playlist tracks (paginated)'),
});

interface RawPlaylistTrackItemV2 {
  data?: {
    __typename?: string;
    uri?: string;
    name?: string;
    duration?: { totalMilliseconds?: number };
    artists?: { items?: RawArtistRef[] };
    albumOfTrack?: {
      uri?: string;
      name?: string;
      coverArt?: { sources?: RawImageSource[] };
    };
  };
}

interface RawPlaylistContentItem {
  uid?: string;
  addedAt?: { isoString?: string };
  addedBy?: { data?: { uri?: string; name?: string } };
  itemV2?: RawPlaylistTrackItemV2;
}

export interface RawPlaylistResponse {
  playlistV2?: {
    uri?: string;
    name?: string;
    description?: string;
    ownerV2?: { data?: { name?: string; uri?: string } };
    images?: { items?: Array<{ sources?: RawImageSource[] }> };
    content?: {
      totalCount?: number;
      items?: RawPlaylistContentItem[];
    };
  };
}

export const mapPlaylist = (data: RawPlaylistResponse) => {
  const p = data.playlistV2;
  return {
    uri: p?.uri ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    owner_name: p?.ownerV2?.data?.name ?? '',
    owner_uri: p?.ownerV2?.data?.uri ?? '',
    total_tracks: p?.content?.totalCount ?? 0,
    images: (p?.images?.items ?? []).flatMap(img => (img.sources ?? []).map(mapImageSource)),
    tracks: (p?.content?.items ?? []).map(item => {
      const td = item.itemV2?.data;
      return {
        added_at: item.addedAt?.isoString ?? '',
        added_by_uri: item.addedBy?.data?.uri ?? '',
        added_by_name: item.addedBy?.data?.name ?? '',
        track: {
          uri: td?.uri ?? '',
          name: td?.name ?? '',
          duration_ms: td?.duration?.totalMilliseconds ?? 0,
          artists: (td?.artists?.items ?? []).map(mapArtistRef),
          album_name: td?.albumOfTrack?.name ?? '',
          album_uri: td?.albumOfTrack?.uri ?? '',
          album_cover_url: td?.albumOfTrack?.coverArt?.sources?.[0]?.url ?? '',
        },
      };
    }),
  };
};

// --- Library tracks (from fetchLibraryTracks) ---

export const savedTrackSchema = z.object({
  added_at: z.string().describe('ISO 8601 timestamp when the track was saved'),
  track: trackSchema.describe('Track details'),
});

interface RawLibraryTrackItem {
  addedAt?: { isoString?: string };
  track?: {
    _uri?: string;
    data?: {
      __typename?: string;
      uri?: string;
      name?: string;
      id?: string;
      duration?: { totalMilliseconds?: number };
      artists?: { items?: RawArtistRef[] };
      albumOfTrack?: {
        uri?: string;
        name?: string;
        coverArt?: { sources?: RawImageSource[] };
      };
    };
  };
}

export interface RawLibraryTracksResponse {
  me?: {
    library?: {
      tracks?: {
        totalCount?: number;
        items?: RawLibraryTrackItem[];
      };
    };
  };
}

export const mapLibraryTracks = (data: RawLibraryTracksResponse) => {
  const lib = data.me?.library?.tracks;
  return {
    total: lib?.totalCount ?? 0,
    items: (lib?.items ?? []).map(item => {
      const td = item.track?.data;
      return {
        added_at: item.addedAt?.isoString ?? '',
        track: {
          uri: item.track?._uri ?? td?.uri ?? '',
          name: td?.name ?? '',
          duration_ms: td?.duration?.totalMilliseconds ?? 0,
          artists: (td?.artists?.items ?? []).map(mapArtistRef),
          album_name: td?.albumOfTrack?.name ?? '',
          album_uri: td?.albumOfTrack?.uri ?? '',
          album_cover_url: td?.albumOfTrack?.coverArt?.sources?.[0]?.url ?? '',
        },
      };
    }),
  };
};

// --- User profile (from profileAttributes + accountAttributes) ---

export const userSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  username: z.string().describe('Spotify username'),
  display_name: z.string().describe('Display name'),
  country: z.string().describe('ISO 3166-1 alpha-2 country code'),
  product: z.string().describe('Subscription type (premium, free)'),
});

export interface RawProfileAttributes {
  me?: {
    profile?: {
      uri?: string;
      username?: string;
      name?: string;
      avatar?: string | null;
      avatarBackgroundColor?: number;
    };
  };
}

export interface RawAccountAttributes {
  me?: {
    account?: {
      country?: string;
      product?: string;
      attributes?: Record<string, unknown>;
    };
  };
}

export const mapUser = (profile: RawProfileAttributes, account: RawAccountAttributes) => ({
  uri: profile.me?.profile?.uri ?? '',
  username: profile.me?.profile?.username ?? '',
  display_name: profile.me?.profile?.name ?? '',
  country: account.me?.account?.country ?? '',
  product: account.me?.account?.product ?? '',
});

// --- Search results (from searchDesktop) ---

export const searchTrackSchema = trackSchema;

export const searchArtistSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Artist name'),
  avatar_url: z.string().describe('Artist avatar image URL'),
});

export const searchAlbumSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Album name'),
  artists: z.array(artistRefSchema).describe('Album artists'),
  cover_url: z.string().describe('Album cover image URL'),
});

export const searchPlaylistSchema = z.object({
  uri: z.string().describe('Spotify URI'),
  name: z.string().describe('Playlist name'),
  description: z.string().describe('Playlist description'),
  owner_name: z.string().describe('Owner name'),
  image_url: z.string().describe('Playlist cover image URL'),
});

interface RawSearchTrackItem {
  item?: { data?: RawGqlTrack };
}

interface RawSearchArtistItem {
  data?: {
    uri?: string;
    profile?: { name?: string };
    visuals?: { avatarImage?: { sources?: RawImageSource[] } };
  };
}

interface RawSearchAlbumItem {
  data?: {
    uri?: string;
    name?: string;
    artists?: { items?: RawArtistRef[] };
    coverArt?: { sources?: RawImageSource[] };
  };
}

interface RawSearchPlaylistItem {
  data?: {
    uri?: string;
    name?: string;
    description?: string;
    owner?: { name?: string };
    images?: { items?: Array<{ sources?: RawImageSource[] }> };
  };
}

export interface RawSearchResponse {
  searchV2?: {
    tracksV2?: { items?: RawSearchTrackItem[] };
    artists?: { items?: RawSearchArtistItem[] };
    albums?: { items?: RawSearchAlbumItem[] };
    playlists?: { items?: RawSearchPlaylistItem[] };
  };
}

export const mapSearchResults = (data: RawSearchResponse) => {
  const s = data.searchV2;
  return {
    tracks: (s?.tracksV2?.items ?? []).map(item => mapGqlTrack(item.item?.data ?? {})),
    artists: (s?.artists?.items ?? []).map(item => ({
      uri: item.data?.uri ?? '',
      name: item.data?.profile?.name ?? '',
      avatar_url: item.data?.visuals?.avatarImage?.sources?.[0]?.url ?? '',
    })),
    albums: (s?.albums?.items ?? []).map(item => ({
      uri: item.data?.uri ?? '',
      name: item.data?.name ?? '',
      artists: (item.data?.artists?.items ?? []).map(mapArtistRef),
      cover_url: item.data?.coverArt?.sources?.[0]?.url ?? '',
    })),
    playlists: (s?.playlists?.items ?? []).map(item => ({
      uri: item.data?.uri ?? '',
      name: item.data?.name ?? '',
      description: item.data?.description ?? '',
      owner_name: item.data?.owner?.name ?? '',
      image_url: item.data?.images?.items?.[0]?.sources?.[0]?.url ?? '',
    })),
  };
};

// --- Playback schemas (unchanged — these use the public API) ---

export const deviceSchema = z.object({
  id: z.string().describe('Device ID'),
  name: z.string().describe('Device name'),
  type: z.string().describe('Device type (Computer, Smartphone, Speaker, etc.)'),
  is_active: z.boolean().describe('Whether the device is currently active'),
  volume_percent: z.number().describe('Volume percentage (0-100)'),
});

export interface RawDevice {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
  volume_percent?: number | null;
}

export const mapDevice = (d: RawDevice) => ({
  id: d.id ?? '',
  name: d.name ?? '',
  type: d.type ?? '',
  is_active: d.is_active ?? false,
  volume_percent: d.volume_percent ?? 0,
});

// Public API track schema (for playback state / currently playing responses)

export const publicTrackSchema = z.object({
  id: z.string().describe('Spotify track ID'),
  name: z.string().describe('Track name'),
  uri: z.string().describe('Spotify URI'),
  duration_ms: z.number().int().describe('Track duration in milliseconds'),
  artists: z.array(z.object({ name: z.string(), uri: z.string() })).describe('Track artists'),
  album_name: z.string().describe('Album name'),
});

interface RawPublicArtist {
  name?: string;
  uri?: string;
}

export interface RawPublicTrack {
  id?: string;
  name?: string;
  uri?: string;
  duration_ms?: number;
  artists?: RawPublicArtist[];
  album?: { name?: string };
}

export const mapPublicTrack = (t: RawPublicTrack) => ({
  id: t.id ?? '',
  name: t.name ?? '',
  uri: t.uri ?? '',
  duration_ms: t.duration_ms ?? 0,
  artists: (t.artists ?? []).map(a => ({ name: a.name ?? '', uri: a.uri ?? '' })),
  album_name: t.album?.name ?? '',
});

export const playbackStateSchema = z.object({
  is_playing: z.boolean().describe('Whether audio is currently playing'),
  device: deviceSchema.describe('Current device'),
  shuffle_state: z.boolean().describe('Whether shuffle is enabled'),
  repeat_state: z.string().describe('Repeat mode (off, context, track)'),
  progress_ms: z.number().int().describe('Playback progress in milliseconds'),
  track: publicTrackSchema.describe('Currently playing track'),
  context_uri: z.string().describe('Spotify URI of the context (album, playlist, artist)'),
});

export interface RawPlaybackState {
  is_playing?: boolean;
  device?: RawDevice;
  shuffle_state?: boolean;
  repeat_state?: string;
  progress_ms?: number | null;
  item?: RawPublicTrack;
  context?: { uri?: string };
}

export const mapPlaybackState = (s: RawPlaybackState) => ({
  is_playing: s.is_playing ?? false,
  device: mapDevice(s.device ?? {}),
  shuffle_state: s.shuffle_state ?? false,
  repeat_state: s.repeat_state ?? 'off',
  progress_ms: s.progress_ms ?? 0,
  track: mapPublicTrack(s.item ?? {}),
  context_uri: s.context?.uri ?? '',
});

export interface RawQueue {
  currently_playing?: RawPublicTrack | null;
  queue?: RawPublicTrack[];
}

export const mapQueue = (q: RawQueue) => ({
  currently_playing: mapPublicTrack(q.currently_playing ?? {}),
  queue: (q.queue ?? []).map(mapPublicTrack),
});

export const playHistorySchema = z.object({
  played_at: z.string().describe('ISO 8601 timestamp when the track was played'),
  track: publicTrackSchema.describe('Track details'),
  context_uri: z.string().describe('Spotify URI of the context (album, playlist, artist)'),
});

export interface RawPlayHistory {
  played_at?: string;
  track?: RawPublicTrack;
  context?: { uri?: string };
}

export const mapPlayHistory = (ph: RawPlayHistory) => ({
  played_at: ph.played_at ?? '',
  track: mapPublicTrack(ph.track ?? {}),
  context_uri: ph.context?.uri ?? '',
});
