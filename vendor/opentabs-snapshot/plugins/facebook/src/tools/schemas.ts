import { z } from 'zod';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string().describe('Facebook user ID'),
  name: z.string().describe('Full display name'),
  short_name: z.string().describe('Short name (first name)'),
});

// ---------------------------------------------------------------------------
// Profile (extended user info from ProfileCometHeaderQuery)
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  id: z.string().describe('Facebook user ID'),
  name: z.string().describe('Full display name'),
  url: z.string().describe('Profile URL'),
  gender: z.string().describe('Gender (MALE, FEMALE, or empty)'),
  is_viewer_friend: z.boolean().describe('Whether the viewer is friends with this user'),
  profile_picture_url: z.string().describe('Profile picture URL'),
  cover_photo_url: z.string().describe('Cover photo URL'),
  bio: z.string().describe('User bio text'),
  friend_count: z.number().int().describe('Number of friends'),
});

export interface RawProfile {
  user?: {
    profile_header_renderer?: {
      user?: {
        name?: string;
        url?: string;
        gender?: string;
        is_viewer_friend?: boolean;
        id?: string;
        profile_picture_for_sticky_bar?: { uri?: string };
        cover_photo?: { photo?: { image?: { uri?: string } } };
        bio_text?: { text?: string };
        friends?: { count?: number };
      };
    };
  };
}

export const mapProfile = (data: RawProfile) => {
  const u = data.user?.profile_header_renderer?.user;
  return {
    id: u?.id ?? '',
    name: u?.name ?? '',
    url: u?.url ?? '',
    gender: u?.gender ?? '',
    is_viewer_friend: u?.is_viewer_friend ?? false,
    profile_picture_url: u?.profile_picture_for_sticky_bar?.uri ?? '',
    cover_photo_url: u?.cover_photo?.photo?.image?.uri ?? '',
    bio: u?.bio_text?.text ?? '',
    friend_count: u?.friends?.count ?? 0,
  };
};

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export const notificationSchema = z.object({
  id: z.string().describe('Notification node ID'),
  notif_id: z.string().describe('Numeric notification ID'),
  title: z.string().describe('Notification text'),
  seen_state: z.string().describe('SEEN, SEEN_BUT_UNREAD, or UNSEEN'),
  timestamp: z.number().int().describe('Unix timestamp of the notification'),
  url: z.string().describe('URL the notification links to'),
  icon_url: z.string().describe('Notification icon image URL'),
  actors: z.array(z.string()).describe('Names of users involved'),
});

export interface RawNotificationEdge {
  node?: {
    __typename?: string;
    row_type?: string;
    notif?: {
      id?: string;
      notif_id?: string;
      body?: { text?: string; ranges?: Array<{ entity?: { short_name?: string } }> };
      seen_state?: string;
      creation_time?: { timestamp?: number };
      url?: string;
      notif_image?: { uri?: string };
      notif_type?: string;
    };
    title?: { text?: string };
    bucket_type?: string;
  };
  cursor?: string;
}

export const mapNotification = (edge: RawNotificationEdge) => {
  const n = edge.node?.notif;
  const actors = (n?.body?.ranges ?? []).map(r => r.entity?.short_name ?? '').filter(Boolean);
  return {
    id: n?.id ?? '',
    notif_id: n?.notif_id ?? '',
    title: n?.body?.text ?? '',
    seen_state: n?.seen_state ?? '',
    timestamp: n?.creation_time?.timestamp ?? 0,
    url: n?.url ?? '',
    icon_url: n?.notif_image?.uri ?? '',
    actors,
  };
};

// ---------------------------------------------------------------------------
// Post (from timeline feed)
// ---------------------------------------------------------------------------

export const postSchema = z.object({
  id: z.string().describe('Post story ID'),
  post_id: z.string().describe('Numeric post ID'),
  message: z.string().describe('Post text content'),
  created_time: z.number().int().describe('Unix timestamp when the post was created'),
  author_name: z.string().describe('Name of the post author'),
  author_id: z.string().describe('User ID of the post author'),
  feedback_id: z.string().describe('Feedback ID for reactions/comments'),
  attachment_url: z.string().describe('URL of the first attachment (photo/link), empty if none'),
  attachment_type: z.string().describe('Attachment type (e.g., photo, link, video, or empty)'),
});

export interface RawPostEdge {
  node?: {
    id?: string;
    post_id?: string;
    cache_id?: string;
    comet_sections?: {
      content?: {
        story?: {
          message?: { text?: string };
          creation_time?: number;
          attachments?: Array<{
            media?: { __typename?: string; image?: { uri?: string } };
            url?: string;
          }>;
        };
      };
    };
    feedback?: {
      id?: string;
      owning_profile?: { name?: string; id?: string };
    };
  };
}

export const mapPost = (edge: RawPostEdge) => {
  const n = edge.node;
  const story = n?.comet_sections?.content?.story;
  const attachment = story?.attachments?.[0];
  return {
    id: n?.id ?? '',
    post_id: n?.post_id ?? '',
    message: story?.message?.text ?? '',
    created_time: story?.creation_time ?? 0,
    author_name: n?.feedback?.owning_profile?.name ?? '',
    author_id: n?.feedback?.owning_profile?.id ?? '',
    feedback_id: n?.feedback?.id ?? '',
    attachment_url: attachment?.media?.image?.uri ?? attachment?.url ?? '',
    attachment_type: attachment?.media?.__typename ?? '',
  };
};

// ---------------------------------------------------------------------------
// Search result
// ---------------------------------------------------------------------------

export const searchResultSchema = z.object({
  entity_id: z.string().describe('Entity ID of the search result'),
  entity_type: z.string().describe('Type of result (user, page, group, etc.)'),
  title: z.string().describe('Display title'),
  subtitle: z.string().describe('Subtitle or snippet text'),
  image_url: z.string().describe('Thumbnail image URL'),
  url: z.string().describe('Link URL to the result'),
});

export interface RawSearchResult {
  uid?: string | number;
  type?: string;
  text?: string;
  subtext?: string;
  photo?: string;
  path?: string;
}

export const mapSearchResult = (r: RawSearchResult) => ({
  entity_id: String(r.uid ?? ''),
  entity_type: r.type ?? '',
  title: r.text ?? '',
  subtitle: r.subtext ?? '',
  image_url: r.photo ?? '',
  url: r.path ? `https://www.facebook.com${r.path}` : '',
});

// ---------------------------------------------------------------------------
// Search keyword suggestion (from CometSearchBootstrapKeywordsDataSourceQuery)
// ---------------------------------------------------------------------------

export const searchSuggestionSchema = z.object({
  keyword: z.string().describe('Search keyword text'),
  entity_id: z.string().describe('Direct nav entity ID'),
  entity_type: z.string().describe('Entity type (user, page, shortcut, etc.)'),
  title: z.string().describe('Entity display title'),
  snippet: z.string().describe('Short description (e.g., "Friend", "Page")'),
  image_url: z.string().describe('Thumbnail image URL'),
  url: z.string().describe('Direct link URL'),
});

export interface RawSearchSuggestionEdge {
  node?: {
    keyword_text?: string;
    sts_info?: {
      direct_nav_result?: {
        ent_id?: string;
        entity_type?: string;
        title?: string;
        snippet?: string;
        img_url?: string;
        link_url?: string;
      };
    };
  };
}

export const mapSearchSuggestion = (edge: RawSearchSuggestionEdge) => {
  const nav = edge.node?.sts_info?.direct_nav_result;
  return {
    keyword: edge.node?.keyword_text ?? '',
    entity_id: nav?.ent_id ?? '',
    entity_type: nav?.entity_type ?? '',
    title: nav?.title ?? '',
    snippet: nav?.snippet ?? '',
    image_url: nav?.img_url ?? '',
    url: nav?.link_url ?? '',
  };
};

// ---------------------------------------------------------------------------
// Marketplace listing
// ---------------------------------------------------------------------------

export const marketplaceListingSchema = z.object({
  id: z.string().describe('Marketplace listing ID'),
  title: z.string().describe('Listing title'),
  price: z.string().describe('Formatted price (e.g., "$80")'),
  price_amount: z.string().describe('Numeric price amount (e.g., "80.00")'),
  location: z.string().describe('City and state of the listing'),
  seller_name: z.string().describe('Seller display name'),
  image_url: z.string().describe('Primary listing photo URL'),
  is_sold: z.boolean().describe('Whether the item has been sold'),
  category_id: z.string().describe('Marketplace category ID'),
});

export interface RawMarketplaceListingEdge {
  node?: {
    listing?: {
      id?: string;
      marketplace_listing_title?: string;
      listing_price?: { formatted_amount?: string; amount?: string };
      location?: { reverse_geocode?: { city?: string; state?: string } };
      marketplace_listing_seller?: { name?: string };
      primary_listing_photo?: { image?: { uri?: string } };
      is_sold?: boolean;
      marketplace_listing_category_id?: string;
    };
  };
}

export const mapMarketplaceListing = (edge: RawMarketplaceListingEdge) => {
  const l = edge.node?.listing;
  const geo = l?.location?.reverse_geocode;
  return {
    id: l?.id ?? '',
    title: l?.marketplace_listing_title ?? '',
    price: l?.listing_price?.formatted_amount ?? '',
    price_amount: l?.listing_price?.amount ?? '',
    location: [geo?.city, geo?.state].filter(Boolean).join(', '),
    seller_name: l?.marketplace_listing_seller?.name ?? '',
    image_url: l?.primary_listing_photo?.image?.uri ?? '',
    is_sold: l?.is_sold ?? false,
    category_id: l?.marketplace_listing_category_id ?? '',
  };
};

// ---------------------------------------------------------------------------
// Friend request
// ---------------------------------------------------------------------------

export const friendRequestSchema = z.object({
  id: z.string().describe('User ID of the requester'),
  name: z.string().describe('Display name'),
  profile_picture_url: z.string().describe('Profile picture URL'),
  friendship_status: z.string().describe('Friendship status (INCOMING_REQUEST, etc.)'),
  mutual_friends: z.string().describe('Mutual friends text (e.g., "3 mutual friends")'),
});

export interface RawFriendRequestEdge {
  node?: {
    id?: string;
    name?: string;
    friendship_status?: string;
    profile_picture?: { uri?: string };
    social_context?: { text?: string };
  };
}

export const mapFriendRequest = (edge: RawFriendRequestEdge) => {
  const n = edge.node;
  return {
    id: n?.id ?? '',
    name: n?.name ?? '',
    profile_picture_url: n?.profile_picture?.uri ?? '',
    friendship_status: n?.friendship_status ?? '',
    mutual_friends: n?.social_context?.text ?? '',
  };
};

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const eventSchema = z.object({
  id: z.string().describe('Event ID'),
  name: z.string().describe('Event name'),
  start_timestamp: z.number().int().describe('Event start time as Unix timestamp'),
  end_timestamp: z.number().int().describe('Event end time as Unix timestamp'),
  location: z.string().describe('Event location name'),
  cover_photo_url: z.string().describe('Event cover photo URL'),
  going_count: z.number().int().describe('Number of people going'),
  interested_count: z.number().int().describe('Number of people interested'),
  event_url: z.string().describe('URL to the event page'),
});

export interface RawEvent {
  id?: string;
  name?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  event_place?: { name?: string };
  cover_photo?: { photo?: { image?: { uri?: string } } };
  event_members_going?: { count?: number };
  event_interested_members?: { count?: number };
  url?: string;
}

export const mapEvent = (e: RawEvent) => ({
  id: e.id ?? '',
  name: e.name ?? '',
  start_timestamp: e.start_timestamp ?? 0,
  end_timestamp: e.end_timestamp ?? 0,
  location: e.event_place?.name ?? '',
  cover_photo_url: e.cover_photo?.photo?.image?.uri ?? '',
  going_count: e.event_members_going?.count ?? 0,
  interested_count: e.event_interested_members?.count ?? 0,
  event_url: e.url ?? (e.id ? `https://www.facebook.com/events/${e.id}` : ''),
});
