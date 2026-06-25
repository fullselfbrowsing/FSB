import { z } from 'zod';

// --- Shared helpers ---

/** Prefix a Fiverr-relative path with the origin to produce an absolute URL. */
const absoluteUrl = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://www.fiverr.com${path.startsWith('/') ? '' : '/'}${path}`;
};

// --- Gig search result ---

export const gigSummarySchema = z.object({
  gig_id: z.number().describe('Numeric gig ID'),
  title: z.string().describe('Gig title'),
  url: z.string().describe('Absolute URL to the gig page'),
  seller_name: z.string().describe('Seller username'),
  seller_display_name: z.string().describe('Seller display name'),
  seller_level: z.string().describe('Seller level (e.g., "level_one", "level_two", "top_rated_seller", or empty)'),
  seller_country: z.string().describe('Seller country name'),
  is_pro: z.boolean().describe('Whether the seller is a Fiverr Pro seller'),
  rating: z.number().describe('Average buyer review rating (0–5)'),
  ratings_count: z.number().describe('Number of buyer reviews'),
  price: z.number().describe('Starting ("from") price in the smallest currency unit (e.g., cents; 4000 means $40.00)'),
  currency: z.string().describe('ISO currency code for the price (e.g., "USD")'),
  num_packages: z.number().describe('Number of packages offered'),
  image: z.string().describe('Primary gig image URL, empty if none'),
});

export interface RawGigSummary {
  gigId?: number;
  gig_id?: number;
  title?: string;
  gig_url?: string;
  seller_name?: string;
  seller_display_name?: string;
  seller_level?: string;
  seller_country?: string;
  is_pro?: boolean;
  buying_review_rating?: number;
  buying_review_rating_count?: number;
  price_i?: number;
  num_of_packages?: number;
  assets?: Array<{ cloud_img_main_gig?: string; type?: string }>;
}

export const mapGigSummary = (g: RawGigSummary, currency: string) => ({
  gig_id: g.gigId ?? g.gig_id ?? 0,
  title: g.title ?? '',
  url: absoluteUrl(g.gig_url ?? ''),
  seller_name: g.seller_name ?? '',
  seller_display_name: g.seller_display_name ?? '',
  seller_level: g.seller_level ?? '',
  seller_country: g.seller_country ?? '',
  is_pro: g.is_pro ?? false,
  rating: g.buying_review_rating ?? 0,
  ratings_count: g.buying_review_rating_count ?? 0,
  price: g.price_i ?? 0,
  currency,
  num_packages: g.num_of_packages ?? 0,
  image: g.assets?.[0]?.cloud_img_main_gig ?? '',
});

// --- Gig detail ---

export const gigPackageSchema = z.object({
  id: z.number().describe('Package ID'),
  title: z.string().describe('Package title (e.g., "Basic", "Standard", "Premium")'),
  description: z.string().describe('Package description'),
  price: z.number().describe('Package price in the smallest currency unit (e.g., cents — 4000 means $40.00)'),
  duration: z.number().describe('Delivery time in hours'),
  revisions: z.number().describe('Number of revisions included (-1 means unlimited)'),
  extra_fast: z.boolean().describe('Whether an extra-fast delivery option is offered'),
  features: z.array(z.string()).describe('Included feature labels'),
});

export const gigReviewSchema = z.object({
  id: z.string().describe('Review ID'),
  reviewer: z.string().describe('Reviewer username'),
  reviewer_country: z.string().describe('Reviewer country name'),
  rating: z.number().describe('Review score (0–5)'),
  comment: z.string().describe('Review text'),
  created_at: z.string().describe('Review creation timestamp (ISO 8601 or epoch ms as returned by Fiverr)'),
});

export const gigDetailSchema = z.object({
  gig_id: z.number().describe('Numeric gig ID'),
  title: z.string().describe('Gig title'),
  status: z.string().describe('Gig status (e.g., "approved")'),
  category: z.string().describe('Category name'),
  subcategory: z.string().describe('Subcategory name'),
  is_pro: z.boolean().describe('Whether this is a Fiverr Pro gig'),
  description: z.string().describe('Full gig description (plain text)'),
  rating: z.number().describe('Average rating (0–5)'),
  ratings_count: z.number().describe('Number of ratings'),
  orders_in_queue: z.number().describe('Number of orders currently in the seller queue'),
  seller_name: z.string().describe('Seller username'),
  seller_one_liner: z.string().describe('Seller tagline'),
  seller_country: z.string().describe('Seller country code'),
  seller_member_since: z.string().describe('Seller join date as returned by Fiverr'),
  seller_response_time: z.string().describe('Seller average response time label'),
  packages: z.array(gigPackageSchema).describe('Offered packages'),
  reviews: z.array(gigReviewSchema).describe('Recent reviews (subset returned by the page)'),
});

interface RawPackage {
  id?: number;
  title?: string;
  description?: string;
  price?: number;
  duration?: number;
  // Fiverr returns these as nested option objects, not primitives.
  revisions?: { value?: number; included?: boolean };
  extraFast?: { included?: boolean; duration?: number };
  features?: Array<{ label?: string; name?: string } | string>;
}

interface RawReview {
  id?: number | string;
  username?: string;
  reviewer_country?: string;
  value?: number;
  score?: number;
  comment?: string;
  created_at?: string | number;
}

const mapPackage = (p: RawPackage) => ({
  id: p.id ?? 0,
  title: p.title ?? '',
  description: p.description ?? '',
  price: p.price ?? 0,
  duration: p.duration ?? 0,
  revisions: p.revisions?.value ?? 0,
  extra_fast: p.extraFast?.included ?? false,
  features: (p.features ?? [])
    .map(f => (typeof f === 'string' ? f : (f.label ?? f.name ?? '')))
    .filter(label => label.length > 0),
});

const mapReview = (r: RawReview) => ({
  id: String(r.id ?? ''),
  reviewer: r.username ?? '',
  reviewer_country: r.reviewer_country ?? '',
  rating: r.value ?? r.score ?? 0,
  comment: r.comment ?? '',
  created_at: String(r.created_at ?? ''),
});

export interface RawGigDetail {
  general?: {
    gigId?: number;
    gigTitle?: string;
    gigStatus?: string;
    categoryName?: string;
    subCategoryName?: string;
    isPro?: boolean;
  };
  overview?: { gig?: { rating?: number; ratingsCount?: number; ordersInQueue?: number } };
  description?: { content?: string };
  sellerCard?: {
    oneLiner?: string;
    countryCode?: string;
    memberSince?: string | number;
    responseTime?: string;
  };
  packages?: { packageList?: RawPackage[] };
  reviews?: { reviews?: RawReview[] };
  seller?: { user?: { name?: string } };
}

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const mapGigDetail = (d: RawGigDetail) => {
  const general = d.general ?? {};
  const overviewGig = d.overview?.gig ?? {};
  const sellerCard = d.sellerCard ?? {};
  return {
    gig_id: general.gigId ?? 0,
    title: general.gigTitle ?? '',
    status: general.gigStatus ?? '',
    category: general.categoryName ?? '',
    subcategory: general.subCategoryName ?? '',
    is_pro: general.isPro ?? false,
    description: stripHtml(d.description?.content ?? ''),
    rating: overviewGig.rating ?? 0,
    ratings_count: overviewGig.ratingsCount ?? 0,
    orders_in_queue: overviewGig.ordersInQueue ?? 0,
    seller_name: d.seller?.user?.name ?? '',
    seller_one_liner: sellerCard.oneLiner ?? '',
    seller_country: sellerCard.countryCode ?? '',
    seller_member_since: String(sellerCard.memberSince ?? ''),
    seller_response_time: sellerCard.responseTime ?? '',
    packages: (d.packages?.packageList ?? []).map(mapPackage),
    reviews: (d.reviews?.reviews ?? []).map(mapReview),
  };
};

// --- Seller profile ---

export const sellerProfileSchema = z.object({
  username: z.string().describe('Seller username'),
  display_name: z.string().describe('Seller display name'),
  joined_at: z.string().describe('Account join date as returned by Fiverr'),
  is_pro: z.boolean().describe('Whether the seller is a Fiverr Pro seller'),
  is_verified: z.boolean().describe('Whether the seller’s identity is verified'),
  level: z.string().describe('Seller level (e.g., "LEVEL_ONE", "LEVEL_TWO", "TOP_RATED_SELLER", or empty)'),
  country: z.string().describe('Seller country name'),
  one_liner: z.string().describe('Seller tagline / one-line title'),
  description: z.string().describe('Seller profile description / bio'),
  rating: z.number().describe('Overall seller rating (0–5)'),
  ratings_count: z.number().describe('Total number of seller reviews'),
  approved_gigs_count: z.number().describe('Number of active (approved) gigs the seller offers'),
});

export interface RawSellerProfile {
  seller?: {
    user?: {
      name?: string;
      joinedAt?: string | number;
      profile?: { displayName?: string };
      address?: { countryName?: string; countryCode?: string };
    };
    isPro?: boolean;
    isVerified?: boolean;
    sellerLevel?: string;
    oneLinerTitle?: string;
    description?: string;
    rating?: { score?: number; count?: number };
    approvedGigsCount?: number;
  };
}

export const mapSellerProfile = (d: RawSellerProfile) => {
  const seller = d.seller ?? {};
  const user = seller.user ?? {};
  const rating = seller.rating ?? {};
  return {
    username: user.name ?? '',
    display_name: user.profile?.displayName ?? user.name ?? '',
    joined_at: String(user.joinedAt ?? ''),
    is_pro: seller.isPro ?? false,
    is_verified: seller.isVerified ?? false,
    level: seller.sellerLevel ?? '',
    country: user.address?.countryName ?? '',
    one_liner: seller.oneLinerTitle ?? '',
    description: stripHtml(seller.description ?? ''),
    rating: rating.score ?? 0,
    ratings_count: rating.count ?? 0,
    approved_gigs_count: seller.approvedGigsCount ?? 0,
  };
};

// --- Inbox: conversations and messages ---

export const conversationSummarySchema = z.object({
  username: z.string().describe('The other participant’s username'),
  display_name: z.string().describe('The other participant’s display name'),
  user_id: z.number().describe('The other participant’s numeric user ID'),
  conversation_id: z.string().describe('Conversation ID, used to reference the thread'),
  unread_count: z.number().describe('Number of unread messages in this conversation'),
  excerpt: z.string().describe('Preview of the most recent message'),
  recent_message_date: z.string().describe('Timestamp of the most recent message (epoch ms as returned by Fiverr)'),
  online: z.boolean().describe('Whether the participant is currently online'),
  archived: z.boolean().describe('Whether the conversation is archived'),
  starred: z.boolean().describe('Whether the conversation is starred'),
});

export interface RawContact {
  username?: string;
  displayName?: string;
  userId?: number;
  conversationId?: string;
  unreadCount?: number;
  excerpt?: string;
  recentMessageDate?: number | string;
  online?: boolean;
  archived?: boolean;
  starred?: boolean;
}

export const mapConversationSummary = (c: RawContact) => ({
  username: c.username ?? '',
  display_name: c.displayName ?? c.username ?? '',
  user_id: c.userId ?? 0,
  conversation_id: c.conversationId ?? '',
  unread_count: c.unreadCount ?? 0,
  excerpt: c.excerpt ?? '',
  recent_message_date: String(c.recentMessageDate ?? ''),
  online: c.online ?? false,
  archived: c.archived ?? false,
  starred: c.starred ?? false,
});

export const messageSchema = z.object({
  id: z.string().describe('Message ID'),
  sender: z.string().describe('Sender username'),
  recipient: z.string().describe('Recipient username'),
  body: z.string().describe('Message text (plain text)'),
  created_at: z.string().describe('Send timestamp (epoch ms as returned by Fiverr)'),
  type: z.string().describe('Message type (e.g., "text")'),
  attachment_count: z.number().describe('Number of attachments on the message'),
});

interface RawMessage {
  id?: number | string;
  sender?: string;
  recipient?: string;
  body?: string;
  bodyUnformatted?: string;
  createdAt?: number | string;
  type?: string;
  attachments?: unknown[];
}

const mapMessage = (m: RawMessage) => ({
  id: String(m.id ?? ''),
  sender: m.sender ?? '',
  recipient: m.recipient ?? '',
  body: stripHtml(m.bodyUnformatted ?? m.body ?? ''),
  created_at: String(m.createdAt ?? ''),
  type: m.type ?? '',
  attachment_count: Array.isArray(m.attachments) ? m.attachments.length : 0,
});

export const conversationSchema = z.object({
  username: z.string().describe('The other participant’s username'),
  display_name: z.string().describe('The other participant’s display name'),
  conversation_id: z.string().describe('Conversation ID'),
  unread_count: z.number().describe('Number of unread messages'),
  last_page: z.boolean().describe('True if these are the oldest messages (no earlier page exists)'),
  messages: z.array(messageSchema).describe('Messages in the conversation, oldest first'),
});

export interface RawConversation {
  username?: string;
  displayName?: string;
  conversationId?: string;
  unreadCount?: number;
  lastPage?: boolean;
  messages?: RawMessage[];
}

export const mapConversation = (c: RawConversation) => ({
  username: c.username ?? '',
  display_name: c.displayName ?? c.username ?? '',
  conversation_id: c.conversationId ?? '',
  unread_count: c.unreadCount ?? 0,
  last_page: c.lastPage ?? false,
  messages: (c.messages ?? []).map(mapMessage),
});
