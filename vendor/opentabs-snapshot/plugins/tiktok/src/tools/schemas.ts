import { z } from 'zod';

// --- Helpers ---

const toNum = (v: string | number | undefined): number => {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return v;
  return Number.parseInt(v, 10) || 0;
};

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  unique_id: z.string().describe('Username (handle without @)'),
  nickname: z.string().describe('Display name'),
  signature: z.string().describe('Bio/description'),
  verified: z.boolean().describe('Whether the account is verified'),
  avatar_url: z.string().describe('Avatar image URL'),
  private_account: z.boolean().describe('Whether the account is private'),
  is_organization: z.boolean().describe('Whether this is an organization/brand account'),
  sec_uid: z.string().describe('Secure user ID (used in API calls)'),
  bio_link: z.string().describe('Bio link URL'),
  create_time: z.number().int().describe('Account creation time as Unix timestamp'),
});

export interface RawSSRUser {
  id?: string;
  uniqueId?: string;
  nickname?: string;
  signature?: string;
  verified?: boolean;
  avatarLarger?: string;
  avatarMedium?: string;
  privateAccount?: boolean;
  isOrganization?: number | boolean;
  secUid?: string;
  bioLink?: { link?: string };
  createTime?: number | string;
}

export const mapSSRUser = (u: RawSSRUser) => ({
  id: u.id ?? '',
  unique_id: u.uniqueId ?? '',
  nickname: u.nickname ?? '',
  signature: u.signature ?? '',
  verified: u.verified ?? false,
  avatar_url: u.avatarLarger ?? u.avatarMedium ?? '',
  private_account: u.privateAccount ?? false,
  is_organization: u.isOrganization === 1 || u.isOrganization === true,
  sec_uid: u.secUid ?? '',
  bio_link: u.bioLink?.link ?? '',
  create_time: typeof u.createTime === 'string' ? Number.parseInt(u.createTime, 10) || 0 : (u.createTime ?? 0),
});

// --- User stats ---

export const userStatsSchema = z.object({
  follower_count: z.number().int().describe('Number of followers'),
  following_count: z.number().int().describe('Number of accounts followed'),
  heart_count: z.number().describe('Total likes received'),
  video_count: z.number().int().describe('Number of videos posted'),
  digg_count: z.number().int().describe('Number of videos liked'),
  friend_count: z.number().int().describe('Number of mutual follows'),
});

export interface RawUserStats {
  followerCount?: number;
  followingCount?: number;
  heart?: number;
  heartCount?: number;
  videoCount?: number;
  diggCount?: number;
  friendCount?: number;
}

export const mapUserStats = (s: RawUserStats) => ({
  follower_count: s.followerCount ?? 0,
  following_count: s.followingCount ?? 0,
  // heart can exceed 32-bit int range; prefer the float64 `heart` field over `heartCount`
  heart_count: s.heart ?? (s.heartCount !== undefined && s.heartCount >= 0 ? s.heartCount : 0),
  video_count: s.videoCount ?? 0,
  digg_count: s.diggCount ?? 0,
  friend_count: s.friendCount ?? 0,
});

// --- Video ---

export const videoSchema = z.object({
  id: z.string().describe('Video ID'),
  description: z.string().describe('Video description/caption'),
  create_time: z.number().int().describe('Video creation time as Unix timestamp'),
  author_unique_id: z.string().describe('Author username'),
  author_nickname: z.string().describe('Author display name'),
  author_verified: z.boolean().describe('Whether the author is verified'),
  duration: z.number().int().describe('Video duration in seconds'),
  play_count: z.number().int().describe('Number of views'),
  digg_count: z.number().int().describe('Number of likes'),
  comment_count: z.number().int().describe('Number of comments'),
  share_count: z.number().int().describe('Number of shares'),
  collect_count: z.number().int().describe('Number of saves/bookmarks'),
  music_title: z.string().describe('Sound/music title'),
  music_author: z.string().describe('Sound/music creator'),
  cover_url: z.string().describe('Video cover/thumbnail URL'),
  web_url: z.string().describe('URL to view this video on TikTok'),
});

export interface RawVideoItem {
  id?: string;
  desc?: string;
  createTime?: number | string;
  author?: {
    uniqueId?: string;
    nickname?: string;
    verified?: boolean;
  };
  video?: {
    duration?: number;
    cover?: string;
    originCover?: string;
  };
  stats?: {
    playCount?: number | string;
    diggCount?: number | string;
    commentCount?: number | string;
    shareCount?: number | string;
    collectCount?: number | string;
  };
  music?: {
    title?: string;
    authorName?: string;
  };
}

export const mapVideo = (v: RawVideoItem) => ({
  id: v.id ?? '',
  description: v.desc ?? '',
  create_time: toNum(v.createTime),
  author_unique_id: v.author?.uniqueId ?? '',
  author_nickname: v.author?.nickname ?? '',
  author_verified: v.author?.verified ?? false,
  duration: v.video?.duration ?? 0,
  play_count: toNum(v.stats?.playCount),
  digg_count: toNum(v.stats?.diggCount),
  comment_count: toNum(v.stats?.commentCount),
  share_count: toNum(v.stats?.shareCount),
  collect_count: toNum(v.stats?.collectCount),
  music_title: v.music?.title ?? '',
  music_author: v.music?.authorName ?? '',
  cover_url: v.video?.originCover ?? v.video?.cover ?? '',
  web_url: v.author?.uniqueId && v.id ? `https://www.tiktok.com/@${v.author.uniqueId}/video/${v.id}` : '',
});

// --- Search user result (different shape from SSR) ---

export interface RawSearchUser {
  user_info?: {
    uid?: string;
    unique_id?: string;
    nickname?: string;
    signature?: string;
    avatar_thumb?: { url_list?: string[] };
    follower_count?: number;
    following_count?: number;
    total_favorited?: number;
    custom_verify?: string;
  };
}

export const mapSearchUser = (u: RawSearchUser) => {
  const info = u.user_info;
  return {
    id: info?.uid ?? '',
    unique_id: info?.unique_id ?? '',
    nickname: info?.nickname ?? '',
    signature: info?.signature ?? '',
    verified: (info?.custom_verify ?? '') !== '',
    avatar_url: info?.avatar_thumb?.url_list?.[0] ?? '',
    follower_count: info?.follower_count ?? 0,
    following_count: info?.following_count ?? 0,
    total_favorited: info?.total_favorited ?? 0,
  };
};

export const searchUserSchema = z.object({
  id: z.string().describe('User ID'),
  unique_id: z.string().describe('Username (handle without @)'),
  nickname: z.string().describe('Display name'),
  signature: z.string().describe('Bio/description'),
  verified: z.boolean().describe('Whether the account is verified'),
  avatar_url: z.string().describe('Avatar image URL'),
  follower_count: z.number().int().describe('Number of followers'),
  following_count: z.number().int().describe('Number of accounts followed'),
  total_favorited: z.number().int().describe('Total likes received'),
});

// --- Following/follower list user ---

export interface RawListUserEntry {
  user?: {
    id?: string;
    uniqueId?: string;
    nickname?: string;
    avatarThumb?: string;
    avatarMedium?: string;
    avatarLarger?: string;
    signature?: string;
    verified?: boolean;
    secUid?: string;
    privateAccount?: boolean;
  };
}

export const mapListUser = (entry: RawListUserEntry) => {
  const u = entry.user;
  return {
    id: u?.id ?? '',
    unique_id: u?.uniqueId ?? '',
    nickname: u?.nickname ?? '',
    signature: u?.signature ?? '',
    verified: u?.verified ?? false,
    avatar_url: u?.avatarMedium ?? u?.avatarThumb ?? '',
    sec_uid: u?.secUid ?? '',
    private_account: u?.privateAccount ?? false,
  };
};

export const listUserSchema = z.object({
  id: z.string().describe('User ID'),
  unique_id: z.string().describe('Username (handle without @)'),
  nickname: z.string().describe('Display name'),
  signature: z.string().describe('Bio/description'),
  verified: z.boolean().describe('Whether the account is verified'),
  avatar_url: z.string().describe('Avatar image URL'),
  sec_uid: z.string().describe('Secure user ID'),
  private_account: z.boolean().describe('Whether the account is private'),
});

// --- User list API response (shared by following/followers) ---

export interface UserListResponse {
  statusCode?: number;
  userList?: RawListUserEntry[];
  hasMore?: boolean;
  minCursor?: number;
  maxCursor?: number;
  total?: number;
}

// --- Notification ---

export interface RawNotice {
  notice_id?: string;
  text?: string;
  type?: number;
  time?: number;
  has_read?: boolean;
  user?: {
    uid?: string;
    unique_id?: string;
    nickname?: string;
    avatar_thumb?: { url_list?: string[] };
  };
}

export const mapNotice = (n: RawNotice) => ({
  notice_id: n.notice_id ?? '',
  text: n.text ?? '',
  type: n.type ?? 0,
  time: n.time ?? 0,
  has_read: n.has_read ?? false,
  user_id: n.user?.uid ?? '',
  user_unique_id: n.user?.unique_id ?? '',
  user_nickname: n.user?.nickname ?? '',
});

export const noticeSchema = z.object({
  notice_id: z.string().describe('Notification ID'),
  text: z.string().describe('Notification text content'),
  type: z.number().int().describe('Notification type code'),
  time: z.number().int().describe('Notification time as Unix timestamp'),
  has_read: z.boolean().describe('Whether the notification has been read'),
  user_id: z.string().describe('User ID of the person who triggered the notification'),
  user_unique_id: z.string().describe('Username of the person who triggered the notification'),
  user_nickname: z.string().describe('Display name of the person who triggered the notification'),
});
