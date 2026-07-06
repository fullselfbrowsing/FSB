import { z } from 'zod';

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('Display name'),
  screen_name: z.string().describe('Username / handle (without @)'),
  description: z.string().describe('Bio text'),
  followers_count: z.int().describe('Number of followers'),
  following_count: z.int().describe('Number of accounts this user follows'),
  tweet_count: z.int().describe('Total number of tweets'),
  verified: z.boolean().describe('Whether the user has a blue verified badge'),
  profile_image_url: z.string().describe('Profile picture URL'),
  profile_banner_url: z.string().describe('Profile banner URL'),
  created_at: z.string().describe('Account creation date'),
  location: z.string().describe('User-specified location'),
  url: z.string().describe('User-specified URL'),
});

export const tweetSchema = z.object({
  id: z.string().describe('Tweet ID'),
  text: z.string().describe('Tweet text content'),
  author_id: z.string().describe('Author user ID'),
  author_name: z.string().describe('Author display name'),
  author_screen_name: z.string().describe('Author username / handle'),
  created_at: z.string().describe('Tweet creation timestamp'),
  reply_count: z.int().describe('Number of replies'),
  retweet_count: z.int().describe('Number of retweets'),
  like_count: z.int().describe('Number of likes'),
  quote_count: z.int().describe('Number of quote tweets'),
  bookmark_count: z.int().describe('Number of bookmarks'),
  view_count: z.string().describe('Number of views (string from API)'),
  lang: z.string().describe('Language code (e.g., "en")'),
  is_reply: z.boolean().describe('Whether this is a reply to another tweet'),
  in_reply_to_user_id: z.string().describe('User ID being replied to, if a reply'),
  conversation_id: z.string().describe('Conversation thread ID'),
});

export const trendSchema = z.object({
  name: z.string().describe('Trend name or hashtag'),
  domain_context: z.string().describe('Category (e.g., "Politics · Trending")'),
  url: z.string().describe('Search URL for this trend'),
});

export const listSchema = z.object({
  id: z.string().describe('List ID'),
  name: z.string().describe('List name'),
  description: z.string().describe('List description'),
  member_count: z.int().describe('Number of members'),
  subscriber_count: z.int().describe('Number of subscribers'),
  is_private: z.boolean().describe('Whether the list is private'),
  created_at: z.string().describe('List creation timestamp'),
});

// ---------------------------------------------------------------------------
// Raw API types
// ---------------------------------------------------------------------------

interface RawUserLegacy {
  followers_count?: number;
  friends_count?: number;
  statuses_count?: number;
  profile_banner_url?: string;
  description?: string;
  url?: string;
  /** Older API versions place these in legacy; newer versions use core/avatar/profile_bio. */
  name?: string;
  screen_name?: string;
  created_at?: string;
  profile_image_url_https?: string;
  location?: string;
}

export interface RawUserResult {
  rest_id?: string;
  legacy?: RawUserLegacy;
  is_blue_verified?: boolean;
  /** Newer API: core contains name, screen_name, created_at. */
  core?: { name?: string; screen_name?: string; created_at?: string };
  /** Newer API: avatar contains image_url. */
  avatar?: { image_url?: string };
  /** Newer API: profile_bio contains description. */
  profile_bio?: { description?: string };
  /** Newer API: location object. */
  location?: { location?: string };
}

interface RawTweetLegacy {
  full_text?: string;
  reply_count?: number;
  retweet_count?: number;
  favorite_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  lang?: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  conversation_id_str?: string;
  created_at?: string;
}

interface RawTweetViews {
  count?: string;
}

interface RawTweetCore {
  user_results?: { result?: RawUserResult };
}

export interface RawTweetResult {
  rest_id?: string;
  core?: RawTweetCore;
  legacy?: RawTweetLegacy;
  views?: RawTweetViews;
  __typename?: string;
}

interface RawListLegacy {
  name?: string;
  description?: string;
  member_count?: number;
  subscriber_count?: number;
  mode?: string;
  created_at?: string;
}

export interface RawListResult {
  id_str?: string;
  legacy?: RawListLegacy;
}

interface RawTrendContent {
  name?: string;
  trend_metadata?: { domain_context?: string; url?: { url?: string } };
  trend_url?: { url?: string };
}

export interface RawTrendItem {
  item?: { itemContent?: RawTrendContent };
}

// ---------------------------------------------------------------------------
// Defensive mappers
// ---------------------------------------------------------------------------

export const mapUser = (u: RawUserResult): z.output<typeof userSchema> => ({
  id: u.rest_id ?? '',
  name: u.core?.name ?? u.legacy?.name ?? '',
  screen_name: u.core?.screen_name ?? u.legacy?.screen_name ?? '',
  description: u.profile_bio?.description ?? u.legacy?.description ?? '',
  followers_count: u.legacy?.followers_count ?? 0,
  following_count: u.legacy?.friends_count ?? 0,
  tweet_count: u.legacy?.statuses_count ?? 0,
  verified: u.is_blue_verified ?? false,
  profile_image_url: u.avatar?.image_url ?? u.legacy?.profile_image_url_https ?? '',
  profile_banner_url: u.legacy?.profile_banner_url ?? '',
  created_at: u.core?.created_at ?? u.legacy?.created_at ?? '',
  location: (typeof u.location === 'object' ? u.location?.location : undefined) ?? u.legacy?.location ?? '',
  url: u.legacy?.url ?? '',
});

export const mapTweet = (t: RawTweetResult): z.output<typeof tweetSchema> => {
  const author = t.core?.user_results?.result;
  return {
    id: t.rest_id ?? '',
    text: t.legacy?.full_text ?? '',
    author_id: author?.rest_id ?? '',
    author_name: author?.core?.name ?? author?.legacy?.name ?? '',
    author_screen_name: author?.core?.screen_name ?? author?.legacy?.screen_name ?? '',
    created_at: t.legacy?.created_at ?? '',
    reply_count: t.legacy?.reply_count ?? 0,
    retweet_count: t.legacy?.retweet_count ?? 0,
    like_count: t.legacy?.favorite_count ?? 0,
    quote_count: t.legacy?.quote_count ?? 0,
    bookmark_count: t.legacy?.bookmark_count ?? 0,
    view_count: t.views?.count ?? '',
    lang: t.legacy?.lang ?? '',
    is_reply: Boolean(t.legacy?.in_reply_to_status_id_str),
    in_reply_to_user_id: t.legacy?.in_reply_to_user_id_str ?? '',
    conversation_id: t.legacy?.conversation_id_str ?? '',
  };
};

export const mapTrend = (t: RawTrendItem): z.output<typeof trendSchema> => {
  const content = t.item?.itemContent;
  const rawUrl = content?.trend_url?.url ?? content?.trend_metadata?.url?.url ?? '';
  const searchQuery = rawUrl.match(/query=([^&]+)/)?.[1];
  return {
    name: content?.name ?? '',
    domain_context: content?.trend_metadata?.domain_context ?? '',
    url: searchQuery ? `https://x.com/search?q=${searchQuery}` : '',
  };
};

export const mapList = (l: RawListResult): z.output<typeof listSchema> => ({
  id: l.id_str ?? '',
  name: l.legacy?.name ?? '',
  description: l.legacy?.description ?? '',
  member_count: l.legacy?.member_count ?? 0,
  subscriber_count: l.legacy?.subscriber_count ?? 0,
  is_private: l.legacy?.mode === 'Private',
  created_at: l.legacy?.created_at ?? '',
});

// ---------------------------------------------------------------------------
// Timeline extraction helpers
// ---------------------------------------------------------------------------

/** Extract tweet results from X's URT (Unified Rich Timeline) response format. */
export const extractTweetsFromTimeline = (data: Record<string, unknown>, path: string[]): RawTweetResult[] => {
  let current: unknown = data;
  for (const key of path) {
    current = (current as Record<string, unknown>)?.[key];
  }

  const instructions = (current as { instructions?: Array<Record<string, unknown>> })?.instructions;
  if (!Array.isArray(instructions)) return [];

  const tweets: RawTweetResult[] = [];
  for (const instruction of instructions) {
    const entries = (instruction as { entries?: Array<Record<string, unknown>> }).entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const content = entry.content as Record<string, unknown> | undefined;
      if (!content) continue;

      // Single tweet entry
      const itemContent = content.itemContent as Record<string, unknown> | undefined;
      const tweetResult = (itemContent?.tweet_results as Record<string, unknown>)?.result as RawTweetResult | undefined;
      if (tweetResult?.legacy) {
        const inner = unwrapTweet(tweetResult);
        if (inner) tweets.push(inner);
      }

      // Module entries (e.g., conversation threads)
      const items = content.items as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          const innerItem = (item.item as Record<string, unknown>)?.itemContent as Record<string, unknown> | undefined;
          const innerTweet = (innerItem?.tweet_results as Record<string, unknown>)?.result as
            | RawTweetResult
            | undefined;
          if (innerTweet?.legacy) {
            const inner = unwrapTweet(innerTweet);
            if (inner) tweets.push(inner);
          }
        }
      }
    }
  }
  return tweets;
};

/** Unwrap TweetWithVisibilityResults wrapper if present. */
const unwrapTweet = (result: RawTweetResult): RawTweetResult | null => {
  if (result.__typename === 'TweetWithVisibilityResults') {
    return (result as unknown as { tweet?: RawTweetResult }).tweet ?? null;
  }
  return result;
};

/** Extract the bottom cursor from a URT timeline for pagination. */
export const extractCursor = (
  data: Record<string, unknown>,
  path: string[],
  direction: 'Bottom' | 'Top' = 'Bottom',
): string | undefined => {
  let current: unknown = data;
  for (const key of path) {
    current = (current as Record<string, unknown>)?.[key];
  }

  const instructions = (current as { instructions?: Array<Record<string, unknown>> })?.instructions;
  if (!Array.isArray(instructions)) return undefined;

  for (const instruction of instructions) {
    const entries = (instruction as { entries?: Array<Record<string, unknown>> }).entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const content = entry.content as Record<string, unknown> | undefined;
      if (content?.cursorType === direction) {
        return content.value as string | undefined;
      }
    }
  }
  return undefined;
};

/** Extract users from a URT timeline (for followers/following lists). */
export const extractUsersFromTimeline = (data: Record<string, unknown>, path: string[]): RawUserResult[] => {
  let current: unknown = data;
  for (const key of path) {
    current = (current as Record<string, unknown>)?.[key];
  }

  const instructions = (current as { instructions?: Array<Record<string, unknown>> })?.instructions;
  if (!Array.isArray(instructions)) return [];

  const users: RawUserResult[] = [];
  for (const instruction of instructions) {
    const entries = (instruction as { entries?: Array<Record<string, unknown>> }).entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const content = entry.content as Record<string, unknown> | undefined;
      const itemContent = content?.itemContent as Record<string, unknown> | undefined;
      const userResults = itemContent?.user_results as Record<string, unknown> | undefined;
      const result = userResults?.result as RawUserResult | undefined;
      if (result?.rest_id) users.push(result);
    }
  }
  return users;
};
