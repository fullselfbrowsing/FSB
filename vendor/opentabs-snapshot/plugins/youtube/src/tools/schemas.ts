import { z } from 'zod';

// --- InnerTube response envelope types ---
// YouTube's InnerTube API returns deeply nested JSON. These types model the
// response structures we traverse in tool handlers, eliminating `as any` casts.

/** Generic record with optional nested fields. Used for untyped InnerTube nodes. */
type N = Record<string, unknown>;

/** A browse response (FEwhat_to_watch, FEsubscriptions, FEhistory, channels, playlists). */
export interface BrowseResponse {
  contents?: {
    twoColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            richGridRenderer?: { contents?: RichGridItem[] };
            sectionListRenderer?: { contents?: SectionItem[] };
          };
        };
      }[];
    };
  };
  header?: {
    pageHeaderRenderer?: {
      pageTitle?: string;
      content?: { pageHeaderViewModel?: RawChannelHeader['pageHeaderViewModel'] };
    };
    playlistHeaderRenderer?: { title?: { simpleText?: string } };
  };
  metadata?: { channelMetadataRenderer?: RawChannelMetadata };
  alerts?: N[];
}

interface RichGridItem {
  richItemRenderer?: {
    content?: {
      videoRenderer?: RawVideoRenderer;
      lockupViewModel?: RawLockupViewModel;
    };
  };
  richSectionRenderer?: N;
  continuationItemRenderer?: N;
}

interface SectionItem {
  itemSectionRenderer?: {
    sectionIdentifier?: string;
    contents?: SectionContent[];
  };
}

interface SectionContent {
  videoRenderer?: RawVideoRenderer;
  lockupViewModel?: RawLockupViewModel;
  shelfRenderer?: {
    content?: {
      expandedShelfContentsRenderer?: { items?: ShelfItem[] };
    };
  };
  playlistVideoListRenderer?: { contents?: PlaylistVideoItem[] };
  continuationItemRenderer?: {
    continuationEndpoint?: {
      continuationCommand?: { token?: string };
    };
  };
  commentThreadRenderer?: N;
}

interface ShelfItem {
  videoRenderer?: RawVideoRenderer;
}

interface PlaylistVideoItem {
  playlistVideoRenderer?: RawVideoRenderer;
}

/** Search response. */
export interface SearchResponse {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: { contents?: SearchSection[] };
      };
    };
  };
}

interface SearchSection {
  itemSectionRenderer?: {
    contents?: SearchItem[];
  };
}

interface SearchItem {
  videoRenderer?: RawVideoRenderer;
}

/** Player response (video metadata). */
export interface PlayerResponse {
  videoDetails?: RawVideoDetails;
}

/** Next response (watch page data: comments, related videos, primary/secondary info). */
export interface NextResponse {
  contents?: {
    twoColumnWatchNextResults?: {
      results?: {
        results?: {
          contents?: WatchContent[];
        };
      };
    };
  };
  onResponseReceivedEndpoints?: CommentContinuationAction[];
  frameworkUpdates?: {
    entityBatchUpdate?: {
      mutations?: CommentMutation[];
    };
  };
}

interface CommentMutation {
  payload?: {
    commentEntityPayload?: RawCommentEntity;
  };
}

export interface RawCommentEntity {
  properties?: {
    commentId?: string;
    content?: { content?: string };
    publishedTime?: string;
  };
  author?: {
    displayName?: string;
    channelId?: string;
  };
  toolbar?: {
    likeCountA11y?: string;
    replyCount?: string;
  };
}

interface WatchContent {
  videoPrimaryInfoRenderer?: {
    title?: { runs?: { text?: string }[] };
    viewCount?: { videoViewCountRenderer?: { viewCount?: { simpleText?: string } } };
    dateText?: { simpleText?: string };
  };
  videoSecondaryInfoRenderer?: {
    owner?: RawVideoOwner;
    attributedDescription?: { content?: string };
  };
  itemSectionRenderer?: {
    sectionIdentifier?: string;
    contents?: SectionContent[];
  };
}

interface CommentContinuationAction {
  reloadContinuationItemsCommand?: { continuationItems?: SectionContent[] };
  appendContinuationItemsAction?: { continuationItems?: SectionContent[] };
}

/** Notification menu response. */
export interface NotificationResponse {
  actions?: {
    openPopupAction?: {
      popup?: {
        multiPageMenuRenderer?: {
          sections?: {
            multiPageMenuNotificationSectionRenderer?: {
              items?: NotificationItem[];
            };
          }[];
        };
      };
    };
  }[];
}

interface NotificationItem {
  notificationRenderer?: RawNotification;
}

/** Playlist list response (get_add_to_playlist). */
export interface PlaylistListResponse {
  contents?: {
    addToPlaylistRenderer?: {
      playlists?: { playlistAddToOptionRenderer?: RawPlaylist }[];
    };
  }[];
}

/** Create playlist response. */
export interface CreatePlaylistResponse {
  playlistId?: string;
}

// --- Video ---

export const videoSchema = z.object({
  video_id: z.string().describe('YouTube video ID'),
  title: z.string().describe('Video title'),
  channel_name: z.string().describe('Channel name'),
  channel_id: z.string().describe('Channel ID'),
  view_count: z.string().describe('View count text (e.g., "1,234,567 views")'),
  published_time: z.string().describe('Relative publish time (e.g., "3 days ago")'),
  duration: z.string().describe('Duration text (e.g., "12:34")'),
  thumbnail_url: z.string().describe('Thumbnail URL'),
  description_snippet: z.string().describe('Short description snippet'),
});

interface RawVideoRenderer {
  videoId?: string;
  title?: { runs?: { text?: string }[]; simpleText?: string };
  ownerText?: {
    runs?: { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[];
  };
  shortBylineText?: {
    runs?: { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[];
  };
  viewCountText?: { simpleText?: string; runs?: { text?: string }[] };
  publishedTimeText?: { simpleText?: string };
  lengthText?: { simpleText?: string; accessibility?: { accessibilityData?: { label?: string } } };
  thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
  detailedMetadataSnippets?: { snippetText?: { runs?: { text?: string }[] } }[];
  descriptionSnippet?: { runs?: { text?: string }[] };
}

export const mapVideo = (v: RawVideoRenderer) => ({
  video_id: v.videoId ?? '',
  title: v.title?.runs?.[0]?.text ?? v.title?.simpleText ?? '',
  channel_name: v.ownerText?.runs?.[0]?.text ?? v.shortBylineText?.runs?.[0]?.text ?? '',
  channel_id:
    v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ??
    v.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ??
    '',
  view_count: v.viewCountText?.simpleText ?? v.viewCountText?.runs?.map(r => r.text).join('') ?? '',
  published_time: v.publishedTimeText?.simpleText ?? '',
  duration: v.lengthText?.simpleText ?? '',
  thumbnail_url: v.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  description_snippet:
    v.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join('') ??
    v.descriptionSnippet?.runs?.map(r => r.text).join('') ??
    '',
});

// --- Video Details ---

export const videoDetailsSchema = z.object({
  video_id: z.string().describe('YouTube video ID'),
  title: z.string().describe('Video title'),
  description: z.string().describe('Full video description'),
  channel_name: z.string().describe('Channel name'),
  channel_id: z.string().describe('Channel ID'),
  duration_seconds: z.string().describe('Duration in seconds'),
  view_count: z.string().describe('Numeric view count'),
  is_live: z.boolean().describe('Whether the video is live content'),
  is_private: z.boolean().describe('Whether the video is private'),
  thumbnail_url: z.string().describe('High-resolution thumbnail URL'),
  keywords: z.array(z.string()).describe('Video keywords/tags'),
  publish_date: z.string().describe('Publish date text'),
  subscriber_count: z.string().describe('Channel subscriber count text'),
});

interface RawVideoDetails {
  videoId?: string;
  title?: string;
  shortDescription?: string;
  channelId?: string;
  author?: string;
  lengthSeconds?: string;
  viewCount?: string;
  isLiveContent?: boolean;
  isPrivate?: boolean;
  thumbnail?: { thumbnails?: { url?: string }[] };
  keywords?: string[];
}

interface RawVideoOwner {
  videoOwnerRenderer?: {
    title?: { runs?: { text?: string }[] };
    subscriberCountText?: { simpleText?: string };
    navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
  };
}

export const mapVideoDetails = (v: RawVideoDetails, owner?: RawVideoOwner, dateText?: string) => ({
  video_id: v.videoId ?? '',
  title: v.title ?? '',
  description: v.shortDescription ?? '',
  channel_name: v.author ?? owner?.videoOwnerRenderer?.title?.runs?.[0]?.text ?? '',
  channel_id: v.channelId ?? '',
  duration_seconds: v.lengthSeconds ?? '0',
  view_count: v.viewCount ?? '0',
  is_live: v.isLiveContent ?? false,
  is_private: v.isPrivate ?? false,
  thumbnail_url: v.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  keywords: v.keywords ?? [],
  publish_date: dateText ?? '',
  subscriber_count: owner?.videoOwnerRenderer?.subscriberCountText?.simpleText ?? '',
});

// --- Channel ---

export const channelSchema = z.object({
  channel_id: z.string().describe('Channel ID'),
  title: z.string().describe('Channel name'),
  description: z.string().describe('Channel description'),
  handle: z.string().describe('Channel handle (e.g., @username)'),
  subscriber_count: z.string().describe('Subscriber count text'),
  video_count: z.string().describe('Video count text'),
  channel_url: z.string().describe('Channel URL'),
  banner_url: z.string().describe('Channel banner image URL'),
  avatar_url: z.string().describe('Channel avatar URL'),
});

interface RawChannelMetadata {
  title?: string;
  description?: string;
  channelUrl?: string;
  externalId?: string;
  vanityChannelUrl?: string;
  avatar?: { thumbnails?: { url?: string }[] };
}

interface RawChannelHeader {
  pageHeaderViewModel?: {
    title?: { dynamicTextViewModel?: { text?: { content?: string } } };
    banner?: { imageBannerViewModel?: { image?: { sources?: { url?: string }[] } } };
    image?: {
      decoratedAvatarViewModel?: { avatar?: { avatarViewModel?: { image?: { sources?: { url?: string }[] } } } };
    };
    metadata?: {
      contentMetadataViewModel?: {
        metadataRows?: {
          metadataParts?: { text?: { content?: string } }[];
        }[];
      };
    };
  };
}

export const mapChannel = (meta: RawChannelMetadata, header?: RawChannelHeader) => {
  const hvm = header?.pageHeaderViewModel;
  const metadataRows = hvm?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const handleRow = metadataRows[0]?.metadataParts?.[0]?.text?.content ?? '';
  const statsRow = metadataRows[1]?.metadataParts?.map(p => p.text?.content).join(' ') ?? '';
  const parts = statsRow.split(' ');
  const subIdx = parts.findIndex(p => p?.toLowerCase().includes('subscriber'));
  const vidIdx = parts.findIndex(p => p?.toLowerCase().includes('video'));

  return {
    channel_id: meta.externalId ?? '',
    title: meta.title ?? '',
    description: meta.description ?? '',
    handle: handleRow,
    subscriber_count: subIdx > 0 ? parts.slice(0, subIdx).join(' ') : '',
    video_count: vidIdx > 0 ? (parts[vidIdx - 1] ?? '') : '',
    channel_url: meta.channelUrl ?? '',
    banner_url: hvm?.banner?.imageBannerViewModel?.image?.sources?.at(-1)?.url ?? '',
    avatar_url:
      hvm?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources?.at(-1)?.url ??
      meta.avatar?.thumbnails?.at(-1)?.url ??
      '',
  };
};

// --- Playlist ---

export const playlistSchema = z.object({
  playlist_id: z.string().describe('Playlist ID'),
  title: z.string().describe('Playlist title'),
  privacy: z.string().describe('Privacy status (PRIVATE, PUBLIC, UNLISTED)'),
});

interface RawPlaylist {
  playlistId?: string;
  title?: { simpleText?: string };
  privacy?: string;
}

export const mapPlaylist = (p: RawPlaylist) => ({
  playlist_id: p.playlistId ?? '',
  title: p.title?.simpleText ?? '',
  privacy: p.privacy ?? '',
});

// --- Comment ---

export const commentSchema = z.object({
  comment_id: z.string().describe('Comment ID'),
  text: z.string().describe('Comment text'),
  author: z.string().describe('Comment author name'),
  author_channel_id: z.string().describe('Author channel ID'),
  like_count: z.string().describe('Number of likes'),
  published_time: z.string().describe('Published time text'),
  reply_count: z.number().int().describe('Number of replies'),
});

// Comment data is extracted from frameworkUpdates.entityBatchUpdate.mutations
// via RawCommentEntity (defined in the InnerTube response types above).
// The mapping is done inline in get-video-comments.ts.

// --- Notification ---

export const notificationSchema = z.object({
  notification_id: z.string().describe('Notification ID'),
  message: z.string().describe('Notification message text'),
  sent_time: z.string().describe('When the notification was sent'),
  thumbnail_url: z.string().describe('Thumbnail URL'),
  read: z.boolean().describe('Whether the notification has been read'),
  video_id: z.string().describe('Related video ID (if applicable)'),
});

interface RawNotification {
  notificationId?: string;
  shortMessage?: { simpleText?: string; runs?: { text?: string }[] };
  sentTimeText?: { simpleText?: string };
  thumbnail?: { thumbnails?: { url?: string }[] };
  read?: boolean;
  navigationEndpoint?: {
    watchEndpoint?: { videoId?: string };
  };
}

export const mapNotification = (n: RawNotification) => ({
  notification_id: n.notificationId ?? '',
  message: n.shortMessage?.simpleText ?? n.shortMessage?.runs?.map(r => r.text).join('') ?? '',
  sent_time: n.sentTimeText?.simpleText ?? '',
  thumbnail_url: n.thumbnail?.thumbnails?.at(-1)?.url ?? '',
  read: n.read ?? false,
  video_id: n.navigationEndpoint?.watchEndpoint?.videoId ?? '',
});

// --- History item (lockupViewModel) ---

export const historyItemSchema = z.object({
  video_id: z.string().describe('Video ID'),
  title: z.string().describe('Video title'),
  metadata: z.string().describe('Metadata text (channel, views, etc.)'),
});

export interface RawLockupViewModel {
  contentId?: string;
  contentType?: string;
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: {
            metadataParts?: { text?: { content?: string } }[];
          }[];
        };
      };
    };
  };
}

/** Convert a lockupViewModel to the videoSchema shape with partial data. */
export const mapLockupToVideo = (item: RawLockupViewModel) => {
  const h = mapHistoryItem(item);
  return {
    video_id: h.video_id,
    title: h.title,
    channel_name: '',
    channel_id: '',
    view_count: h.metadata,
    published_time: '',
    duration: '',
    thumbnail_url: '',
    description_snippet: '',
  };
};

export const mapHistoryItem = (item: RawLockupViewModel) => ({
  video_id: item.contentId ?? '',
  title: item.metadata?.lockupMetadataViewModel?.title?.content ?? '',
  metadata:
    item.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows
      ?.map(r => r.metadataParts?.map(p => p.text?.content).join(' · '))
      .join(' | ') ?? '',
});
