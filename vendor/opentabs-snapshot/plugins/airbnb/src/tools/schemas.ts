import { z } from 'zod';

// --- Wishlist schemas ---

export const wishlistSchema = z.object({
  id: z.string().describe('Wishlist ID (base64-encoded)'),
  name: z.string().describe('Wishlist name'),
  is_private: z.boolean().describe('Whether the wishlist is private'),
  is_collaborative: z.boolean().describe('Whether the wishlist allows collaborators'),
  guest_count: z.number().int().describe('Number of guests configured'),
  guest_description: z.string().describe('Human-readable guest count description'),
  check_in: z.string().nullable().describe('Check-in date if set (YYYY-MM-DD)'),
  check_out: z.string().nullable().describe('Check-out date if set (YYYY-MM-DD)'),
  cover_image_url: z.string().nullable().describe('URL of the wishlist cover image'),
  listing_count: z.number().int().describe('Number of stay listings in this wishlist'),
  owner_name: z.string().describe('Display name of the wishlist owner'),
  collaborator_names: z.array(z.string()).describe('Display names of collaborators'),
});

interface RawWishlist {
  id?: string;
  name?: string;
  isPrivate?: boolean;
  isCollaborative?: boolean;
  guestCount?: number;
  guestDetails?: { description?: { localizedString?: string } };
  dateRangeDetails?: { checkIn?: string | null; checkOut?: string | null };
  xlImageUrl?: string | null;
  pictures?: Array<{ largePicture?: string }>;
  productIds?: { stayIds?: string[] };
  wishlistUser?: { contextualUser?: { displayFirstName?: string } };
  collaboratorUsers?: Array<{ contextualUser?: { displayFirstName?: string } }>;
}

export const mapWishlist = (w: RawWishlist) => ({
  id: w.id ?? '',
  name: w.name ?? '',
  is_private: w.isPrivate ?? false,
  is_collaborative: w.isCollaborative ?? false,
  guest_count: w.guestCount ?? 0,
  guest_description: w.guestDetails?.description?.localizedString ?? '',
  check_in: w.dateRangeDetails?.checkIn ?? null,
  check_out: w.dateRangeDetails?.checkOut ?? null,
  cover_image_url: w.xlImageUrl ?? w.pictures?.[0]?.largePicture ?? null,
  listing_count: w.productIds?.stayIds?.length ?? 0,
  owner_name: w.wishlistUser?.contextualUser?.displayFirstName ?? '',
  collaborator_names: w.collaboratorUsers?.map(c => c.contextualUser?.displayFirstName ?? '').filter(Boolean) ?? [],
});

// --- Message thread schemas ---

export const messageThreadSchema = z.object({
  id: z.string().describe('Message thread ID (base64-encoded)'),
  thread_type: z.string().describe('Thread type (e.g., WELCOME_ANNOUNCEMENT, RESERVATION)'),
  title: z.string().describe('Thread title shown in inbox'),
  description: z.string().describe('Latest message preview'),
  is_unread: z.boolean().describe('Whether the thread has unread messages'),
  updated_at_ms: z.string().describe('Timestamp of most recent activity in milliseconds'),
  participants: z.array(z.string()).describe('Display names of thread participants'),
  listing_image_url: z.string().nullable().describe('URL of listing image associated with thread'),
});

interface RawThread {
  id?: string;
  messageThreadType?: string;
  inboxTitle?: { components?: Array<{ text?: string }> };
  inboxDescription?: { components?: Array<{ text?: string }> };
  userThreadTags?: Array<{ userThreadTagName?: string }>;
  mostRecentInboxActivityAtMsFromROS?: string;
  participants?: {
    edges?: Array<{
      node?: { enrichedParticipantInfo?: { name?: string }; isRealUser?: boolean };
    }>;
  };
  inboxListingImageUrl?: string | null;
}

export const mapThread = (t: RawThread) => ({
  id: t.id ?? '',
  thread_type: t.messageThreadType ?? '',
  title: t.inboxTitle?.components?.map(c => c.text).join('') ?? '',
  description: t.inboxDescription?.components?.map(c => c.text).join('') ?? '',
  is_unread: t.userThreadTags?.some(tag => tag.userThreadTagName === 'unread') ?? false,
  updated_at_ms: t.mostRecentInboxActivityAtMsFromROS ?? '',
  participants: t.participants?.edges?.map(e => e.node?.enrichedParticipantInfo?.name ?? '').filter(Boolean) ?? [],
  listing_image_url: t.inboxListingImageUrl ?? null,
});

// --- Message schemas ---

export const messageSchema = z.object({
  id: z.string().describe('Message ID (base64-encoded)'),
  content: z.string().describe('Message text content'),
  sender_name: z.string().describe('Display name of the message sender'),
  sender_id: z.string().describe('Account ID of the sender'),
  sender_type: z.string().describe('Account type (e.g., USER, EXTERNAL_SERVICE)'),
  created_at_ms: z.string().describe('Message creation timestamp in milliseconds'),
  is_deleted: z.boolean().describe('Whether the message has been deleted'),
});

interface RawMessage {
  id?: string;
  createdAtMs?: string;
  deletedAtMs?: string | null;
  account?: { accountId?: string; accountType?: string };
  contentPreview?: { content?: string };
  content?: { text?: string };
  sender?: { enrichedParticipantInfo?: { name?: string } };
}

export const mapMessage = (m: RawMessage, participantMap?: Map<string, string>) => ({
  id: m.id ?? '',
  content: m.content?.text ?? m.contentPreview?.content ?? '',
  sender_name: m.sender?.enrichedParticipantInfo?.name ?? participantMap?.get(m.account?.accountId ?? '') ?? '',
  sender_id: m.account?.accountId ?? '',
  sender_type: m.account?.accountType ?? '',
  created_at_ms: m.createdAtMs ?? '',
  is_deleted: m.deletedAtMs !== null && m.deletedAtMs !== undefined,
});

// --- Header / user schemas ---

export const headerMenuItemSchema = z.object({
  id: z.string().describe('Menu item ID (e.g., TRIPS, MESSAGES, PROFILE)'),
  text: z.string().describe('Menu item display text'),
  url: z.string().nullable().describe('Menu item URL path'),
  badge_count: z.number().int().nullable().describe('Notification badge count (e.g., unread messages)'),
  has_badge: z.boolean().describe('Whether the item has a notification badge'),
  icon: z.string().describe('Icon identifier'),
});

interface RawHeaderItem {
  itemId?: string;
  text?: string;
  url?: string | null;
  badgeCount?: number | null;
  hasBadge?: boolean | null;
  icon?: string | null;
}

export const mapHeaderItem = (i: RawHeaderItem) => ({
  id: i.itemId ?? '',
  text: i.text ?? '',
  url: i.url ?? null,
  badge_count: i.badgeCount ?? null,
  has_badge: i.hasBadge ?? false,
  icon: i.icon ?? '',
});

// --- Search suggestion schemas ---

export const searchSuggestionSchema = z.object({
  display_name: z.string().describe('Display name of the suggestion (e.g., "San Diego, CA")'),
  type: z.string().describe('Suggestion context (e.g., "For sights like Balboa Park")'),
  image_url: z.string().nullable().describe('URL of suggestion icon image'),
});

// --- Inbox filter schemas ---

export const inboxFilterSchema = z.object({
  id: z.string().describe('Filter ID (e.g., all, traveling, support)'),
  title: z.string().describe('Filter display title'),
  unread_count: z.string().describe('Number of unread messages in this filter'),
});

interface RawInboxFilter {
  id?: string;
  title?: string;
  unreadCount?: string;
}

export const mapInboxFilter = (f: RawInboxFilter) => ({
  id: f.id ?? '',
  title: f.title ?? '',
  unread_count: f.unreadCount ?? '0',
});
