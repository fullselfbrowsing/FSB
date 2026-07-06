import { z } from 'zod';

// --- Blog schemas ---

export const blogSchema = z.object({
  name: z.string().describe('Blog name (URL slug)'),
  title: z.string().describe('Blog title'),
  description: z.string().describe('Blog description'),
  url: z.string().describe('Blog URL'),
  posts: z.number().describe('Total number of posts'),
  followers: z.number().describe('Number of followers'),
  is_adult: z.boolean().describe('Whether the blog is marked as adult'),
  ask: z.boolean().describe('Whether the blog accepts asks'),
  followed: z.boolean().describe('Whether the current user follows this blog'),
  avatar_url: z.string().describe('Avatar image URL'),
});

export interface RawBlog {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  blogViewUrl?: string;
  posts?: number;
  followers?: number;
  isAdult?: boolean;
  ask?: boolean;
  followed?: boolean;
  avatar?: { url?: string }[];
}

export const mapBlog = (b: RawBlog) => ({
  name: b.name ?? '',
  title: b.title ?? '',
  description: b.description ?? '',
  url: b.url ?? b.blogViewUrl ?? '',
  posts: b.posts ?? 0,
  followers: b.followers ?? 0,
  is_adult: b.isAdult ?? false,
  ask: b.ask ?? false,
  followed: b.followed ?? false,
  avatar_url: b.avatar?.[0]?.url ?? '',
});

// --- Post schemas ---

export const postSchema = z.object({
  id: z.string().describe('Post ID (string for 64-bit safety)'),
  type: z.string().describe('Post type (e.g., text, photo, quote, link, chat, audio, video)'),
  blog_name: z.string().describe('Name of the blog that published this post'),
  post_url: z.string().describe('Full URL to the post'),
  short_url: z.string().describe('Short URL'),
  timestamp: z.number().describe('Unix timestamp of publication'),
  date: z.string().describe('Human-readable date string'),
  state: z.string().describe('Post state (published, draft, queue, private)'),
  tags: z.array(z.string()).describe('Post tags'),
  summary: z.string().describe('Plain text summary of the post content'),
  note_count: z.number().describe('Total number of notes (likes + reblogs + replies)'),
  reblog_key: z.string().describe('Key required for reblogging this post'),
  liked: z.boolean().describe('Whether the current user has liked this post'),
  followed: z.boolean().describe('Whether the current user follows the post author'),
  can_like: z.boolean().describe('Whether the current user can like this post'),
  can_reblog: z.boolean().describe('Whether the current user can reblog this post'),
  can_reply: z.boolean().describe('Whether the current user can reply to this post'),
  content_text: z.string().describe('Extracted text content from NPF content blocks'),
});

interface RawContentBlock {
  type?: string;
  text?: string;
  subtype?: string;
  url?: string;
  media?: { url?: string }[];
  title?: string;
  description?: string;
}

export interface RawPost {
  id?: number;
  idString?: string;
  type?: string;
  originalType?: string;
  blogName?: string;
  blog?: RawBlog;
  postUrl?: string;
  shortUrl?: string;
  timestamp?: number;
  date?: string;
  state?: string;
  tags?: string[];
  summary?: string;
  noteCount?: number;
  reblogKey?: string;
  liked?: boolean;
  followed?: boolean;
  canLike?: boolean;
  canReblog?: boolean;
  canReply?: boolean;
  content?: RawContentBlock[];
  trail?: unknown[];
  slug?: string;
}

const extractContentText = (content?: RawContentBlock[]): string => {
  if (!content?.length) return '';
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text)
    .join('\n');
};

export const mapPost = (p: RawPost) => ({
  id: p.idString ?? String(p.id ?? ''),
  type: p.type ?? p.originalType ?? '',
  blog_name: p.blogName ?? '',
  post_url: p.postUrl ?? '',
  short_url: p.shortUrl ?? '',
  timestamp: p.timestamp ?? 0,
  date: p.date ?? '',
  state: p.state ?? 'published',
  tags: p.tags ?? [],
  summary: p.summary ?? '',
  note_count: p.noteCount ?? 0,
  reblog_key: p.reblogKey ?? '',
  liked: p.liked ?? false,
  followed: p.followed ?? false,
  can_like: p.canLike ?? false,
  can_reblog: p.canReblog ?? false,
  can_reply: p.canReply ?? false,
  content_text: extractContentText(p.content),
});

// --- Note schemas ---

export const noteSchema = z.object({
  type: z.string().describe('Note type (like, reblog, reply, posted)'),
  blog_name: z.string().describe('Blog name of the user who left this note'),
  blog_url: z.string().describe('URL of the blog'),
  avatar_url: z.string().describe('Avatar URL'),
  timestamp: z.number().describe('Unix timestamp'),
  reply_text: z.string().describe('Reply text (for reply notes only)'),
  reblog_parent_blog_name: z.string().describe('Parent blog name (for reblog notes only)'),
  added_text: z.string().describe('Text added in reblog (for reblog notes)'),
});

export interface RawNote {
  type?: string;
  blogName?: string;
  blogUrl?: string;
  blogUuid?: string;
  avatarShape?: string;
  timestamp?: number;
  replyText?: string;
  reblogParentBlogName?: string;
  addedText?: string;
  avatar?: { url?: string }[];
}

export const mapNote = (n: RawNote) => ({
  type: n.type ?? '',
  blog_name: n.blogName ?? '',
  blog_url: n.blogUrl ?? '',
  avatar_url: n.avatar?.[0]?.url ?? '',
  timestamp: n.timestamp ?? 0,
  reply_text: n.replyText ?? '',
  reblog_parent_blog_name: n.reblogParentBlogName ?? '',
  added_text: n.addedText ?? '',
});

// --- Notification schemas ---

export const notificationSchema = z.object({
  type: z.string().describe('Notification type (e.g., like, reblog, reply, follow, ask)'),
  timestamp: z.number().describe('Unix timestamp'),
  from_blog_name: z.string().describe('Name of the blog that triggered the notification'),
  target_post_id: z.string().describe('ID of the related post (if applicable)'),
  summary: z.string().describe('Human-readable summary text'),
});

export interface RawNotification {
  type?: string;
  timestamp?: number;
  fromTumblelogName?: string;
  targetPostId?: string;
  targetPostIdString?: string;
  targetPostSummary?: string;
  addedText?: string;
  mediaUrl?: string;
}

export const mapNotification = (n: RawNotification) => ({
  type: n.type ?? '',
  timestamp: n.timestamp ?? 0,
  from_blog_name: n.fromTumblelogName ?? '',
  target_post_id: n.targetPostIdString ?? String(n.targetPostId ?? ''),
  summary: n.targetPostSummary ?? n.addedText ?? '',
});

// --- User schemas ---

export const userSchema = z.object({
  name: z.string().describe('Username'),
  following: z.number().describe('Number of blogs the user follows'),
  likes: z.number().describe('Number of posts the user has liked'),
  default_post_format: z.string().describe('Default post format (html or markdown)'),
  blogs: z.array(blogSchema).describe('Blogs owned by this user'),
});

export interface RawUser {
  name?: string;
  following?: number;
  likes?: number;
  defaultPostFormat?: string;
  blogs?: RawBlog[];
}

export const mapUser = (u: RawUser) => ({
  name: u.name ?? '',
  following: u.following ?? 0,
  likes: u.likes ?? 0,
  default_post_format: u.defaultPostFormat ?? 'html',
  blogs: (u.blogs ?? []).map(mapBlog),
});

// --- Limit schemas ---

export const limitSchema = z.object({
  description: z.string().describe('Description of the limit'),
  limit: z.number().describe('Maximum allowed'),
  remaining: z.number().describe('Remaining quota'),
  reset_at: z.number().describe('Unix timestamp when the limit resets'),
});

export interface RawLimit {
  description?: string;
  limit?: number;
  remaining?: number;
  resetAt?: number;
}

export const mapLimit = (l: RawLimit) => ({
  description: l.description ?? '',
  limit: l.limit ?? 0,
  remaining: l.remaining ?? 0,
  reset_at: l.resetAt ?? 0,
});

// --- Follower schemas ---

export const followerSchema = z.object({
  name: z.string().describe('Blog name'),
  url: z.string().describe('Blog URL'),
  following: z.boolean().describe('Whether you follow this blog back'),
  updated: z.number().describe('Last updated timestamp'),
});

export interface RawFollower {
  name?: string;
  url?: string;
  following?: boolean;
  updated?: number;
}

export const mapFollower = (f: RawFollower) => ({
  name: f.name ?? '',
  url: f.url ?? '',
  following: f.following ?? false,
  updated: f.updated ?? 0,
});
