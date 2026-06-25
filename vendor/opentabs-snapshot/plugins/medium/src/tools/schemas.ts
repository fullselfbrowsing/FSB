import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('Display name'),
  username: z.string().describe('Username handle'),
  bio: z.string().describe('User bio'),
  image_id: z
    .string()
    .describe('Profile image ID (prefix with https://miro.medium.com/v2/resize:fill:176:176/ for URL)'),
  follower_count: z.number().describe('Number of followers'),
  following_count: z.number().describe('Number of users being followed'),
  is_member: z.boolean().describe('Whether the user has a Medium membership'),
  twitter: z.string().describe('Twitter/X screen name'),
  created_at: z.number().describe('Account creation timestamp in milliseconds'),
});

export interface RawUser {
  id?: string;
  name?: string;
  username?: string;
  bio?: string;
  imageId?: string;
  socialStats?: { followerCount?: number; followingCount?: number };
  mediumMemberAt?: number;
  membership?: { tier?: string } | null;
  twitterScreenName?: string;
  viewerEdge?: { createdAt?: number };
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  name: u.name ?? '',
  username: u.username ?? '',
  bio: u.bio ?? '',
  image_id: u.imageId ?? '',
  follower_count: u.socialStats?.followerCount ?? 0,
  following_count: u.socialStats?.followingCount ?? 0,
  is_member: u.membership !== null && u.membership !== undefined,
  twitter: u.twitterScreenName ?? '',
  created_at: u.viewerEdge?.createdAt ?? 0,
});

export const userSummarySchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('Display name'),
  username: z.string().describe('Username handle'),
  bio: z.string().describe('User bio'),
  image_id: z.string().describe('Profile image ID'),
  follower_count: z.number().describe('Number of followers'),
});

export interface RawUserSummary {
  id?: string;
  name?: string;
  username?: string;
  bio?: string;
  imageId?: string;
  socialStats?: { followerCount?: number };
}

export const mapUserSummary = (u: RawUserSummary) => ({
  id: u.id ?? '',
  name: u.name ?? '',
  username: u.username ?? '',
  bio: u.bio ?? '',
  image_id: u.imageId ?? '',
  follower_count: u.socialStats?.followerCount ?? 0,
});

// --- Post ---

export const postSchema = z.object({
  id: z.string().describe('Post ID'),
  title: z.string().describe('Post title'),
  subtitle: z.string().describe('Post subtitle/excerpt'),
  slug: z.string().describe('Unique URL slug'),
  url: z.string().describe('Full Medium URL'),
  published_at: z.number().describe('First published timestamp in milliseconds'),
  updated_at: z.number().describe('Last updated timestamp in milliseconds'),
  reading_time: z.number().describe('Estimated reading time in minutes'),
  clap_count: z.number().describe('Number of claps'),
  voter_count: z.number().describe('Number of unique voters (clappers)'),
  responses_count: z.number().describe('Number of responses/comments'),
  is_locked: z.boolean().describe('Whether the post is behind the paywall'),
  visibility: z.string().describe('Post visibility: PUBLIC or LOCKED'),
  author_id: z.string().describe('Author user ID'),
  author_name: z.string().describe('Author display name'),
  author_username: z.string().describe('Author username'),
  collection_id: z.string().describe('Collection/publication ID (empty if none)'),
  collection_name: z.string().describe('Collection/publication name (empty if none)'),
  collection_slug: z.string().describe('Collection/publication slug (empty if none)'),
  tags: z.array(z.string()).describe('Tag display titles'),
});

export interface RawPost {
  id?: string;
  title?: string;
  uniqueSlug?: string;
  mediumUrl?: string;
  firstPublishedAt?: number;
  latestPublishedAt?: number;
  readingTime?: number;
  clapCount?: number;
  voterCount?: number;
  responsesCount?: number;
  isLocked?: boolean;
  visibility?: string;
  creator?: { id?: string; name?: string; username?: string; imageId?: string };
  collection?: { id?: string; name?: string; slug?: string } | null;
  tags?: Array<{ id?: string; displayTitle?: string; normalizedTagSlug?: string }>;
  extendedPreviewContent?: { subtitle?: string };
}

export const mapPost = (p: RawPost) => ({
  id: p.id ?? '',
  title: p.title ?? '',
  subtitle: p.extendedPreviewContent?.subtitle ?? '',
  slug: p.uniqueSlug ?? '',
  url: p.mediumUrl ?? '',
  published_at: p.firstPublishedAt ?? 0,
  updated_at: p.latestPublishedAt ?? 0,
  reading_time: Math.round((p.readingTime ?? 0) * 10) / 10,
  clap_count: p.clapCount ?? 0,
  voter_count: p.voterCount ?? 0,
  responses_count: p.responsesCount ?? 0,
  is_locked: p.isLocked ?? false,
  visibility: p.visibility ?? 'PUBLIC',
  author_id: p.creator?.id ?? '',
  author_name: p.creator?.name ?? '',
  author_username: p.creator?.username ?? '',
  collection_id: p.collection?.id ?? '',
  collection_name: p.collection?.name ?? '',
  collection_slug: p.collection?.slug ?? '',
  tags: (p.tags ?? []).map(t => t.displayTitle ?? '').filter(Boolean),
});

// Compact post schema for list/search results (no responses_count, updated_at)
export const postSummarySchema = z.object({
  id: z.string().describe('Post ID'),
  title: z.string().describe('Post title'),
  subtitle: z.string().describe('Post subtitle/excerpt'),
  url: z.string().describe('Full Medium URL'),
  published_at: z.number().describe('First published timestamp in milliseconds'),
  reading_time: z.number().describe('Estimated reading time in minutes'),
  clap_count: z.number().describe('Number of claps'),
  voter_count: z.number().describe('Number of unique voters'),
  is_locked: z.boolean().describe('Whether the post is behind the paywall'),
  author_name: z.string().describe('Author display name'),
  author_username: z.string().describe('Author username'),
  collection_name: z.string().describe('Collection name (empty if none)'),
});

export const mapPostSummary = (p: RawPost) => ({
  id: p.id ?? '',
  title: p.title ?? '',
  subtitle: p.extendedPreviewContent?.subtitle ?? '',
  url: p.mediumUrl ?? '',
  published_at: p.firstPublishedAt ?? 0,
  reading_time: Math.round((p.readingTime ?? 0) * 10) / 10,
  clap_count: p.clapCount ?? 0,
  voter_count: p.voterCount ?? 0,
  is_locked: p.isLocked ?? false,
  author_name: p.creator?.name ?? '',
  author_username: p.creator?.username ?? '',
  collection_name: p.collection?.name ?? '',
});

// --- Tag ---

export const tagSchema = z.object({
  id: z.string().describe('Tag ID/slug'),
  title: z.string().describe('Display title'),
  slug: z.string().describe('Normalized tag slug'),
  post_count: z.number().describe('Number of posts with this tag'),
});

export interface RawTag {
  id?: string;
  displayTitle?: string;
  normalizedTagSlug?: string;
  postCount?: number;
}

export const mapTag = (t: RawTag) => ({
  id: t.id ?? '',
  title: t.displayTitle ?? '',
  slug: t.normalizedTagSlug ?? '',
  post_count: t.postCount ?? 0,
});

// --- Collection/Publication ---

export const collectionSchema = z.object({
  id: z.string().describe('Collection ID'),
  name: z.string().describe('Collection name'),
  slug: z.string().describe('URL slug'),
  description: z.string().describe('Collection description'),
  subscriber_count: z.number().describe('Number of subscribers'),
  domain: z.string().describe('Custom domain (empty if none)'),
  creator_name: z.string().describe('Creator display name'),
  creator_username: z.string().describe('Creator username'),
});

export interface RawCollection {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  subscriberCount?: number;
  domain?: string | null;
  shortDescription?: string;
  creator?: { id?: string; name?: string; username?: string };
  avatar?: { id?: string };
}

export const mapCollection = (c: RawCollection) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  slug: c.slug ?? '',
  description: c.description ?? '',
  subscriber_count: c.subscriberCount ?? 0,
  domain: c.domain ?? '',
  creator_name: c.creator?.name ?? '',
  creator_username: c.creator?.username ?? '',
});

// --- Publisher (can be user or collection) ---

export const publisherSchema = z.object({
  type: z.string().describe('Publisher type: User or Collection'),
  id: z.string().describe('Publisher ID'),
  name: z.string().describe('Publisher display name'),
  bio: z.string().describe('Short bio or description'),
  username: z.string().describe('Username or slug'),
});

export interface RawPublisher {
  __typename?: string;
  id?: string;
  name?: string;
  bio?: string;
  description?: string;
  username?: string;
  slug?: string;
}

export const mapPublisher = (p: RawPublisher) => ({
  type: p.__typename ?? 'Unknown',
  id: p.id ?? '',
  name: p.name ?? '',
  bio: p.__typename === 'Collection' ? (p.description ?? '') : (p.bio ?? ''),
  username: p.__typename === 'Collection' ? (p.slug ?? '') : (p.username ?? ''),
});
