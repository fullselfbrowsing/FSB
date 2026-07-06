import { z } from 'zod';

// --- Shared schemas ---

export const postSchema = z.object({
  uri: z.string().describe('AT URI of the post (e.g., at://did/app.bsky.feed.post/rkey)'),
  cid: z.string().describe('Content hash of the post'),
  author_did: z.string().describe('DID of the post author'),
  author_handle: z.string().describe('Handle of the post author'),
  author_display_name: z.string().describe('Display name of the post author'),
  text: z.string().describe('Post text content'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  reply_count: z.number().describe('Number of replies'),
  repost_count: z.number().describe('Number of reposts'),
  like_count: z.number().describe('Number of likes'),
  quote_count: z.number().describe('Number of quote posts'),
  indexed_at: z.string().describe('Indexed ISO 8601 timestamp from the AppView'),
  has_media: z.boolean().describe('Whether the post has embedded images or video'),
  is_reply: z.boolean().describe('Whether the post is a reply to another post'),
});

export const profileSchema = z.object({
  did: z.string().describe('Decentralized identifier'),
  handle: z.string().describe('User handle (e.g., user.bsky.social)'),
  display_name: z.string().describe('Display name'),
  description: z.string().describe('Profile bio'),
  avatar: z.string().describe('Avatar image URL'),
  banner: z.string().describe('Banner image URL'),
  followers_count: z.number().describe('Number of followers'),
  follows_count: z.number().describe('Number of accounts followed'),
  posts_count: z.number().describe('Number of posts'),
  indexed_at: z.string().describe('Indexed ISO 8601 timestamp'),
  is_following: z.boolean().describe('Whether the viewer is following this user'),
  is_followed_by: z.boolean().describe('Whether this user is following the viewer'),
  is_muted: z.boolean().describe('Whether the viewer has muted this user'),
  is_blocked: z.boolean().describe('Whether the viewer has blocked this user'),
});

export const profileBasicSchema = z.object({
  did: z.string().describe('Decentralized identifier'),
  handle: z.string().describe('User handle'),
  display_name: z.string().describe('Display name'),
  avatar: z.string().describe('Avatar image URL'),
});

export const notificationSchema = z.object({
  uri: z.string().describe('AT URI of the notification subject'),
  cid: z.string().describe('Content hash of the notification subject'),
  author_did: z.string().describe('DID of the notification author'),
  author_handle: z.string().describe('Handle of the notification author'),
  author_display_name: z.string().describe('Display name of the notification author'),
  reason: z.string().describe('Notification reason (e.g., like, repost, follow, mention, reply, quote)'),
  is_read: z.boolean().describe('Whether the notification has been read'),
  indexed_at: z.string().describe('Indexed ISO 8601 timestamp'),
});

export const conversationSchema = z.object({
  id: z.string().describe('Conversation ID'),
  unread_count: z.number().describe('Number of unread messages'),
  last_message_text: z.string().describe('Text of the last message'),
  last_message_sent_at: z.string().describe('ISO 8601 timestamp of the last message'),
  members: z.array(profileBasicSchema).describe('Conversation members'),
  muted: z.boolean().describe('Whether the conversation is muted'),
});

export const messageSchema = z.object({
  id: z.string().describe('Message ID'),
  text: z.string().describe('Message text content'),
  sender_did: z.string().describe('DID of the message sender'),
  sent_at: z.string().describe('Sent ISO 8601 timestamp'),
  revision: z.string().describe('Message revision identifier'),
});

export const threadPostSchema = postSchema.extend({
  reply_parent_uri: z.string().describe('AT URI of the parent post in the reply chain'),
  reply_root_uri: z.string().describe('AT URI of the root post in the thread'),
});

// --- Defensive mappers ---

interface RawAuthor {
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

interface RawRecord {
  text?: string;
  createdAt?: string;
  reply?: {
    root?: { uri?: string };
    parent?: { uri?: string };
  };
}

interface RawEmbed {
  $type?: string;
  images?: unknown[];
  media?: unknown;
}

interface RawPost {
  uri?: string;
  cid?: string;
  author?: RawAuthor;
  record?: RawRecord;
  embed?: RawEmbed;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt?: string;
}

const hasMedia = (embed?: RawEmbed): boolean => {
  if (!embed) return false;
  const type = embed.$type ?? '';
  if (type.includes('images') || type.includes('video')) return true;
  if (type.includes('recordWithMedia')) return true;
  if (embed.images && Array.isArray(embed.images) && embed.images.length > 0) return true;
  if (embed.media) return true;
  return false;
};

export const mapPost = (p: RawPost) => ({
  uri: p.uri ?? '',
  cid: p.cid ?? '',
  author_did: p.author?.did ?? '',
  author_handle: p.author?.handle ?? '',
  author_display_name: p.author?.displayName ?? '',
  text: p.record?.text ?? '',
  created_at: p.record?.createdAt ?? '',
  reply_count: p.replyCount ?? 0,
  repost_count: p.repostCount ?? 0,
  like_count: p.likeCount ?? 0,
  quote_count: p.quoteCount ?? 0,
  indexed_at: p.indexedAt ?? '',
  has_media: hasMedia(p.embed),
  is_reply: p.record?.reply !== undefined && p.record?.reply !== null,
});

interface RawViewer {
  following?: string;
  followedBy?: string;
  muted?: boolean;
  blockedBy?: boolean;
  blocking?: string;
}

interface RawProfile {
  did?: string;
  handle?: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  indexedAt?: string;
  viewer?: RawViewer;
}

export const mapProfile = (p: RawProfile) => ({
  did: p.did ?? '',
  handle: p.handle ?? '',
  display_name: p.displayName ?? '',
  description: p.description ?? '',
  avatar: p.avatar ?? '',
  banner: p.banner ?? '',
  followers_count: p.followersCount ?? 0,
  follows_count: p.followsCount ?? 0,
  posts_count: p.postsCount ?? 0,
  indexed_at: p.indexedAt ?? '',
  is_following: (p.viewer?.following ?? '') !== '',
  is_followed_by: (p.viewer?.followedBy ?? '') !== '',
  is_muted: p.viewer?.muted ?? false,
  is_blocked: (p.viewer?.blocking ?? '') !== '' || (p.viewer?.blockedBy ?? false),
});

interface RawProfileBasic {
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export const mapProfileBasic = (p: RawProfileBasic) => ({
  did: p.did ?? '',
  handle: p.handle ?? '',
  display_name: p.displayName ?? '',
  avatar: p.avatar ?? '',
});

interface RawNotification {
  uri?: string;
  cid?: string;
  author?: RawAuthor;
  reason?: string;
  isRead?: boolean;
  indexedAt?: string;
}

export const mapNotification = (n: RawNotification) => ({
  uri: n.uri ?? '',
  cid: n.cid ?? '',
  author_did: n.author?.did ?? '',
  author_handle: n.author?.handle ?? '',
  author_display_name: n.author?.displayName ?? '',
  reason: n.reason ?? '',
  is_read: n.isRead ?? false,
  indexed_at: n.indexedAt ?? '',
});

interface RawMessageSender {
  did?: string;
}

interface RawLastMessage {
  $type?: string;
  id?: string;
  text?: string;
  sender?: RawMessageSender;
  sentAt?: string;
}

interface RawConversation {
  id?: string;
  unreadCount?: number;
  lastMessage?: RawLastMessage;
  members?: RawProfileBasic[];
  muted?: boolean;
}

export const mapConversation = (c: RawConversation) => ({
  id: c.id ?? '',
  unread_count: c.unreadCount ?? 0,
  last_message_text: c.lastMessage?.text ?? '',
  last_message_sent_at: c.lastMessage?.sentAt ?? '',
  members: (c.members ?? []).map(mapProfileBasic),
  muted: c.muted ?? false,
});

interface RawMessage {
  id?: string;
  text?: string;
  sender?: RawMessageSender;
  sentAt?: string;
  rev?: string;
}

export const mapMessage = (m: RawMessage) => ({
  id: m.id ?? '',
  text: m.text ?? '',
  sender_did: m.sender?.did ?? '',
  sent_at: m.sentAt ?? '',
  revision: m.rev ?? '',
});

export const mapThreadPost = (p: RawPost) => ({
  ...mapPost(p),
  reply_parent_uri: p.record?.reply?.parent?.uri ?? '',
  reply_root_uri: p.record?.reply?.root?.uri ?? '',
});
