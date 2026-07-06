import { z } from 'zod';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.number().describe('Numeric user ID'),
  name: z.string().describe('Display name'),
  username: z.string().describe('Username (URL slug)'),
  about: z.string().describe('Bio / about text'),
  avatar: z.string().describe('Avatar image URL'),
  is_verified: z.boolean().describe('Whether the account is verified'),
  is_performer: z.boolean().describe('Whether the user is a content creator'),
  posts_count: z.number().int().describe('Total number of posts'),
  photos_count: z.number().int().describe('Total number of photos'),
  videos_count: z.number().int().describe('Total number of videos'),
  subscribers_count: z.number().int().describe('Number of subscribers'),
  subscribe_price: z.number().describe('Subscription price (0 = free)'),
  join_date: z.string().describe('Account creation date (ISO 8601)'),
  location: z.string().describe('Location if set'),
  website: z.string().describe('Website URL if set'),
});

export interface RawUser {
  id?: number;
  name?: string;
  username?: string;
  about?: string;
  avatar?: string | null;
  avatarThumbs?: { c144?: string; c50?: string } | null;
  isVerified?: boolean;
  isPerformer?: boolean;
  isRealPerformer?: boolean;
  postsCount?: number;
  photosCount?: number;
  videosCount?: number;
  subscribersCount?: number;
  subscribePrice?: number;
  joinDate?: string;
  location?: string | null;
  website?: string | null;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  name: u.name ?? '',
  username: u.username ?? '',
  about: u.about ?? '',
  avatar: u.avatar ?? u.avatarThumbs?.c144 ?? '',
  is_verified: u.isVerified ?? false,
  is_performer: u.isPerformer ?? u.isRealPerformer ?? false,
  posts_count: u.postsCount ?? 0,
  photos_count: u.photosCount ?? 0,
  videos_count: u.videosCount ?? 0,
  subscribers_count: u.subscribersCount ?? 0,
  subscribe_price: u.subscribePrice ?? 0,
  join_date: u.joinDate ?? '',
  location: u.location ?? '',
  website: u.website ?? '',
});

// ---------------------------------------------------------------------------
// Current user (extends user with account fields)
// ---------------------------------------------------------------------------

export const currentUserSchema = userSchema.extend({
  email: z.string().describe('Account email address'),
  is_email_checked: z.boolean().describe('Whether the email is verified'),
  subscribes_count: z.number().int().describe('Number of active subscriptions'),
  favorites_count: z.number().int().describe('Number of favorited posts'),
  credit_balance: z.number().describe('Credit balance'),
  has_new_alerts: z.boolean().describe('Whether there are new alerts'),
  notifications_count: z.number().int().describe('Unread notification count'),
  chat_messages_count: z.number().int().describe('Unread chat message count'),
  can_earn: z.boolean().describe('Whether the account can earn money'),
});

export interface RawCurrentUser extends RawUser {
  email?: string;
  isEmailChecked?: boolean;
  subscribesCount?: number;
  favoritesCount?: number;
  creditBalance?: number;
  hasNewAlerts?: boolean;
  notificationsCount?: number;
  chatMessagesCount?: number;
  canEarn?: boolean;
}

export const mapCurrentUser = (u: RawCurrentUser) => ({
  ...mapUser(u),
  email: u.email ?? '',
  is_email_checked: u.isEmailChecked ?? false,
  subscribes_count: u.subscribesCount ?? 0,
  favorites_count: u.favoritesCount ?? 0,
  credit_balance: u.creditBalance ?? 0,
  has_new_alerts: u.hasNewAlerts ?? false,
  notifications_count: u.notificationsCount ?? 0,
  chat_messages_count: u.chatMessagesCount ?? 0,
  can_earn: u.canEarn ?? false,
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const mediaSchema = z.object({
  id: z.number().describe('Media ID'),
  type: z.string().describe('Media type (photo, video, audio, gif)'),
  can_view: z.boolean().describe('Whether the current user can view this media'),
  full_url: z.string().describe('Full-resolution media URL'),
  preview_url: z.string().describe('Preview/thumbnail URL'),
  duration: z.number().describe('Duration in seconds (video/audio only, 0 for images)'),
});

export interface RawMedia {
  id?: number;
  type?: string;
  canView?: boolean;
  files?: {
    full?: { url?: string };
    preview?: { url?: string };
    thumb?: { url?: string };
  };
  duration?: number;
}

export const mapMedia = (m: RawMedia) => ({
  id: m.id ?? 0,
  type: m.type ?? '',
  can_view: m.canView ?? false,
  full_url: m.files?.full?.url ?? '',
  preview_url: m.files?.preview?.url ?? m.files?.thumb?.url ?? '',
  duration: m.duration ?? 0,
});

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

export const postSchema = z.object({
  id: z.number().describe('Post ID'),
  text: z.string().describe('Post text content (may contain HTML)'),
  posted_at: z.string().describe('Publication timestamp (ISO 8601)'),
  author_id: z.number().describe('Author user ID'),
  favorites_count: z.number().int().describe('Number of likes/favorites'),
  media_count: z.number().int().describe('Number of attached media items'),
  is_opened: z.boolean().describe('Whether the post content is unlocked'),
  can_view_media: z.boolean().describe('Whether the current user can view media'),
  has_url: z.boolean().describe('Whether the post contains URLs'),
  media: z.array(mediaSchema).describe('Attached media items'),
});

export interface RawPost {
  id?: number;
  text?: string;
  postedAt?: string;
  author?: { id?: number } | null;
  favoritesCount?: number;
  mediaCount?: number;
  isOpened?: boolean;
  canViewMedia?: boolean;
  hasUrl?: boolean;
  media?: RawMedia[];
}

export const mapPost = (p: RawPost) => ({
  id: p.id ?? 0,
  text: p.text ?? '',
  posted_at: p.postedAt ?? '',
  author_id: p.author?.id ?? 0,
  favorites_count: p.favoritesCount ?? 0,
  media_count: p.mediaCount ?? 0,
  is_opened: p.isOpened ?? false,
  can_view_media: p.canViewMedia ?? false,
  has_url: p.hasUrl ?? false,
  media: (p.media ?? []).map(mapMedia),
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatSchema = z.object({
  id: z.number().describe('Chat ID'),
  with_user_id: z.number().describe('ID of the other user in the chat'),
  last_message_text: z.string().describe('Preview of the last message'),
  last_message_date: z.string().describe('Timestamp of the last message'),
  unread_count: z.number().int().describe('Number of unread messages'),
  can_send_message: z.boolean().describe('Whether you can send messages'),
});

export interface RawChat {
  id?: number;
  withUser?: { id?: number } | null;
  lastMessage?: { text?: string; createdAt?: string } | null;
  unreadMessagesCount?: number;
  canSendMessage?: boolean;
}

export const mapChat = (c: RawChat) => ({
  id: c.id ?? 0,
  with_user_id: c.withUser?.id ?? 0,
  last_message_text: c.lastMessage?.text ?? '',
  last_message_date: c.lastMessage?.createdAt ?? '',
  unread_count: c.unreadMessagesCount ?? 0,
  can_send_message: c.canSendMessage ?? false,
});

// ---------------------------------------------------------------------------
// Chat message
// ---------------------------------------------------------------------------

export const chatMessageSchema = z.object({
  id: z.number().describe('Message ID'),
  text: z.string().describe('Message text'),
  from_user_id: z.number().describe('Sender user ID'),
  created_at: z.string().describe('Message timestamp (ISO 8601)'),
  is_from_me: z.boolean().describe('Whether the message was sent by the current user'),
  media: z.array(mediaSchema).describe('Attached media items'),
});

export interface RawChatMessage {
  id?: number;
  text?: string;
  fromUser?: { id?: number } | null;
  createdAt?: string;
  isMine?: boolean;
  media?: RawMedia[];
}

export const mapChatMessage = (m: RawChatMessage) => ({
  id: m.id ?? 0,
  text: m.text ?? '',
  from_user_id: m.fromUser?.id ?? 0,
  created_at: m.createdAt ?? '',
  is_from_me: m.isMine ?? false,
  media: (m.media ?? []).map(mapMedia),
});

// ---------------------------------------------------------------------------
// User list
// ---------------------------------------------------------------------------

export const userListSchema = z.object({
  id: z.string().describe('List ID (string, e.g. "fans" or numeric)'),
  name: z.string().describe('List name'),
  type: z.string().describe('List type (e.g. fans, following, custom)'),
  users_count: z.number().int().describe('Number of users in the list'),
  can_delete: z.boolean().describe('Whether the list can be deleted'),
});

export interface RawUserList {
  id?: string | number;
  name?: string;
  type?: string;
  usersCount?: number;
  canDelete?: boolean;
}

export const mapUserList = (l: RawUserList) => ({
  id: String(l.id ?? ''),
  name: l.name ?? '',
  type: l.type ?? '',
  users_count: l.usersCount ?? 0,
  can_delete: l.canDelete ?? false,
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export const subscriptionSchema = z.object({
  user_id: z.number().describe('Subscribed user ID'),
  username: z.string().describe('Subscribed username'),
  name: z.string().describe('Subscribed display name'),
  price: z.number().describe('Subscription price'),
  subscribed_at: z.string().describe('Subscription start date'),
  expires_at: z.string().describe('Subscription expiry date'),
  is_active: z.boolean().describe('Whether the subscription is currently active'),
});

export interface RawSubscription {
  subscribedBy?: boolean;
  subscribedByExpire?: boolean;
  subscribedByExpireDate?: string | null;
  subscribedOn?: boolean;
  subscribedOnDuration?: string | null;
  currentSubscribePrice?: number | null;
  subscribePrice?: number;
  id?: number;
  username?: string;
  name?: string;
}

export const mapSubscription = (s: RawSubscription) => ({
  user_id: s.id ?? 0,
  username: s.username ?? '',
  name: s.name ?? '',
  price: s.currentSubscribePrice ?? s.subscribePrice ?? 0,
  subscribed_at: '',
  expires_at: s.subscribedByExpireDate ?? '',
  is_active: s.subscribedBy ?? s.subscribedOn ?? false,
});

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const storySchema = z.object({
  user_id: z.number().describe('Creator user ID'),
  stories_count: z.number().int().describe('Number of stories'),
  last_updated_at: z.string().describe('Last story update timestamp'),
  has_not_viewed: z.boolean().describe('Whether there are unviewed stories'),
});

export interface RawStoryMapEntry {
  userId?: number;
  storiesCount?: number;
  lastUpdatedAt?: string;
  hasNotViewedStory?: boolean;
}

export const mapStoryEntry = (s: RawStoryMapEntry) => ({
  user_id: s.userId ?? 0,
  stories_count: s.storiesCount ?? 0,
  last_updated_at: s.lastUpdatedAt ?? '',
  has_not_viewed: s.hasNotViewedStory ?? false,
});
