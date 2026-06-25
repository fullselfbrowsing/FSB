import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User numeric ID (pk)'),
  username: z.string().describe('Username handle'),
  full_name: z.string().describe('Display name'),
  biography: z.string().describe('Bio text'),
  is_private: z.boolean().describe('Whether the account is private'),
  is_verified: z.boolean().describe('Whether the account is verified'),
  profile_pic_url: z.string().describe('Profile picture URL'),
  follower_count: z.number().int().describe('Number of followers'),
  following_count: z.number().int().describe('Number of accounts followed'),
  media_count: z.number().int().describe('Number of posts'),
  external_url: z.string().describe('External website URL'),
});

export interface RawUser {
  pk?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  biography?: string;
  is_private?: boolean;
  is_verified?: boolean;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  follower_count?: number;
  edge_followed_by?: { count?: number };
  following_count?: number;
  edge_follow?: { count?: number };
  media_count?: number;
  edge_owner_to_timeline_media?: { count?: number };
  external_url?: string;
}

export const mapUser = (u: RawUser) => ({
  id: String(u.pk ?? u.id ?? ''),
  username: u.username ?? '',
  full_name: u.full_name ?? '',
  biography: u.biography ?? '',
  is_private: u.is_private ?? false,
  is_verified: u.is_verified ?? false,
  profile_pic_url: u.profile_pic_url_hd ?? u.profile_pic_url ?? '',
  follower_count: u.follower_count ?? u.edge_followed_by?.count ?? 0,
  following_count: u.following_count ?? u.edge_follow?.count ?? 0,
  media_count: u.media_count ?? u.edge_owner_to_timeline_media?.count ?? 0,
  external_url: u.external_url ?? '',
});

// --- User Summary (compact, for lists) ---

export const userSummarySchema = z.object({
  id: z.string().describe('User numeric ID (pk)'),
  username: z.string().describe('Username handle'),
  full_name: z.string().describe('Display name'),
  is_private: z.boolean().describe('Whether the account is private'),
  is_verified: z.boolean().describe('Whether the account is verified'),
  profile_pic_url: z.string().describe('Profile picture URL'),
});

export interface RawUserSummary {
  pk?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  is_private?: boolean;
  is_verified?: boolean;
  profile_pic_url?: string;
}

export const mapUserSummary = (u: RawUserSummary) => ({
  id: String(u.pk ?? u.id ?? ''),
  username: u.username ?? '',
  full_name: u.full_name ?? '',
  is_private: u.is_private ?? false,
  is_verified: u.is_verified ?? false,
  profile_pic_url: u.profile_pic_url ?? '',
});

// --- Media/Post ---

export const mediaSchema = z.object({
  id: z.string().describe('Media ID'),
  shortcode: z.string().describe('Shortcode for the post URL (instagram.com/p/{shortcode})'),
  media_type: z.number().int().describe('Media type: 1=photo, 2=video, 8=carousel'),
  caption: z.string().describe('Post caption text'),
  like_count: z.number().int().describe('Number of likes'),
  comment_count: z.number().int().describe('Number of comments'),
  taken_at: z.number().int().describe('Unix timestamp when the post was created'),
  user: userSummarySchema.describe('Post author'),
  image_url: z.string().describe('Main image or video thumbnail URL'),
});

export interface RawMedia {
  id?: string;
  pk?: string | number;
  code?: string;
  media_type?: number;
  caption?: { text?: string } | null;
  like_count?: number;
  comment_count?: number;
  taken_at?: number;
  user?: RawUserSummary;
  image_versions2?: { candidates?: { url?: string }[] };
  carousel_media?: { image_versions2?: { candidates?: { url?: string }[] } }[];
  video_versions?: { url?: string }[];
}

export const mapMedia = (m: RawMedia) => ({
  id: m.id ?? String(m.pk ?? ''),
  shortcode: m.code ?? '',
  media_type: m.media_type ?? 0,
  caption: m.caption?.text ?? '',
  like_count: m.like_count ?? 0,
  comment_count: m.comment_count ?? 0,
  taken_at: m.taken_at ?? 0,
  user: mapUserSummary(m.user ?? {}),
  image_url:
    m.image_versions2?.candidates?.[0]?.url ?? m.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ?? '',
});

// --- Comment ---

export const commentSchema = z.object({
  id: z.string().describe('Comment ID (pk)'),
  text: z.string().describe('Comment text'),
  created_at: z.number().int().describe('Unix timestamp'),
  user: userSummarySchema.describe('Comment author'),
  like_count: z.number().int().describe('Number of likes on the comment'),
  child_comment_count: z.number().int().describe('Number of replies'),
});

export interface RawComment {
  pk?: string | number;
  text?: string;
  created_at?: number;
  user?: RawUserSummary;
  comment_like_count?: number;
  child_comment_count?: number;
}

export const mapComment = (c: RawComment) => ({
  id: String(c.pk ?? ''),
  text: c.text ?? '',
  created_at: c.created_at ?? 0,
  user: mapUserSummary(c.user ?? {}),
  like_count: c.comment_like_count ?? 0,
  child_comment_count: c.child_comment_count ?? 0,
});

// --- Friendship Status ---

export const friendshipSchema = z.object({
  following: z.boolean().describe('Whether you follow this user'),
  followed_by: z.boolean().describe('Whether this user follows you'),
  blocking: z.boolean().describe('Whether you have blocked this user'),
  muting: z.boolean().describe('Whether you have muted this user'),
  is_private: z.boolean().describe('Whether the user account is private'),
  outgoing_request: z.boolean().describe('Whether you have a pending follow request'),
  incoming_request: z.boolean().describe('Whether they have a pending follow request to you'),
  is_restricted: z.boolean().describe('Whether the user is restricted'),
});

export interface RawFriendship {
  following?: boolean;
  followed_by?: boolean;
  blocking?: boolean;
  muting?: boolean;
  is_private?: boolean;
  outgoing_request?: boolean;
  incoming_request?: boolean;
  is_restricted?: boolean;
}

export const mapFriendship = (f: RawFriendship) => ({
  following: f.following ?? false,
  followed_by: f.followed_by ?? false,
  blocking: f.blocking ?? false,
  muting: f.muting ?? false,
  is_private: f.is_private ?? false,
  outgoing_request: f.outgoing_request ?? false,
  incoming_request: f.incoming_request ?? false,
  is_restricted: f.is_restricted ?? false,
});

// --- Story Item ---

export const storyItemSchema = z.object({
  id: z.string().describe('Story item ID'),
  media_type: z.number().int().describe('Media type: 1=photo, 2=video'),
  taken_at: z.number().int().describe('Unix timestamp'),
  image_url: z.string().describe('Image URL'),
  video_url: z.string().describe('Video URL (empty for photos)'),
  expiring_at: z.number().int().describe('Unix timestamp when story expires'),
});

export interface RawStoryItem {
  id?: string;
  media_type?: number;
  taken_at?: number;
  image_versions2?: { candidates?: { url?: string }[] };
  video_versions?: { url?: string }[];
  expiring_at?: number;
}

export const mapStoryItem = (s: RawStoryItem) => ({
  id: s.id ?? '',
  media_type: s.media_type ?? 0,
  taken_at: s.taken_at ?? 0,
  image_url: s.image_versions2?.candidates?.[0]?.url ?? '',
  video_url: s.video_versions?.[0]?.url ?? '',
  expiring_at: s.expiring_at ?? 0,
});

// --- DM Thread ---

export const threadSchema = z.object({
  thread_id: z.string().describe('Conversation thread ID'),
  thread_title: z.string().describe('Thread title (recipient name for 1:1, group name for groups)'),
  is_group: z.boolean().describe('Whether this is a group conversation'),
  users: z.array(userSummarySchema).describe('Participants in the thread'),
  last_activity_at: z.string().describe('Timestamp of last activity in microseconds'),
});

export interface RawThread {
  thread_id?: string;
  thread_title?: string;
  is_group?: boolean;
  users?: RawUserSummary[];
  last_activity_at?: number;
}

export const mapThread = (t: RawThread) => ({
  thread_id: t.thread_id ?? '',
  thread_title: t.thread_title ?? '',
  is_group: t.is_group ?? false,
  users: (t.users ?? []).map(mapUserSummary),
  last_activity_at: String(t.last_activity_at ?? ''),
});

// --- DM Message ---

export const messageSchema = z.object({
  item_id: z.string().describe('Message ID'),
  item_type: z.string().describe('Message type (text, media_share, reel_share, clip, link, etc.)'),
  text: z.string().describe('Message text content (empty for non-text types)'),
  user_id: z.string().describe('Sender user ID'),
  timestamp: z.string().describe('Message timestamp in microseconds'),
});

export interface RawMessage {
  item_id?: string;
  item_type?: string;
  text?: string;
  user_id?: number | string;
  timestamp?: number | string;
}

export const mapMessage = (m: RawMessage) => ({
  item_id: m.item_id ?? '',
  item_type: m.item_type ?? '',
  text: m.text ?? '',
  user_id: String(m.user_id ?? ''),
  timestamp: String(m.timestamp ?? ''),
});

// --- Hashtag ---

export const hashtagSchema = z.object({
  id: z.string().describe('Hashtag ID'),
  name: z.string().describe('Hashtag name without #'),
  media_count: z.number().int().describe('Number of posts with this hashtag'),
});

export interface RawHashtag {
  id?: string | number;
  name?: string;
  media_count?: number;
}

export const mapHashtag = (h: RawHashtag) => ({
  id: String(h.id ?? ''),
  name: h.name ?? '',
  media_count: h.media_count ?? 0,
});

// --- Collection ---

export const collectionSchema = z.object({
  id: z.string().describe('Collection ID'),
  name: z.string().describe('Collection name'),
  type: z.string().describe('Collection type'),
  media_count: z.number().int().describe('Number of items in the collection'),
});

export interface RawCollection {
  collection_id?: string | number;
  collection_name?: string;
  collection_type?: string;
  collection_media_count?: number;
}

export const mapCollection = (c: RawCollection) => ({
  id: String(c.collection_id ?? ''),
  name: c.collection_name ?? '',
  type: c.collection_type ?? '',
  media_count: c.collection_media_count ?? 0,
});

// --- Stories Tray Entry ---

export const storyTraySchema = z.object({
  user: userSummarySchema.describe('User who posted the story'),
  latest_reel_media: z.number().int().describe('Unix timestamp of most recent story item'),
});

export interface RawStoryTray {
  user?: RawUserSummary;
  latest_reel_media?: number;
}

export const mapStoryTray = (t: RawStoryTray) => ({
  user: mapUserSummary(t.user ?? {}),
  latest_reel_media: t.latest_reel_media ?? 0,
});
