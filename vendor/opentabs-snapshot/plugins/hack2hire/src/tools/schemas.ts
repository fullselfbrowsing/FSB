import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums and shared field constraints
// ---------------------------------------------------------------------------

export const POST_TYPES = ['ALGORITHM', 'SD', 'ML_SD', 'BLOG'] as const;
export const STAGES = ['SCREENING', 'OA', 'ONSITE', 'PHONE'] as const;

const difficultyDescription = 'Difficulty level — 1 (Easy), 2 (Medium), or 3 (Hard).';

// ---------------------------------------------------------------------------
// Post (interview question / article)
// ---------------------------------------------------------------------------

export const companyFrequencySchema = z
  .record(z.string(), z.object({ frequency: z.number().int() }))
  .describe('Map of company name to question frequency at that company.');

export const postSummarySchema = z.object({
  id: z.string().describe('Post ID.'),
  type: z.string().describe('Post type — ALGORITHM, SD (system design), ML_SD (ML system design), or BLOG.'),
  title: z.string().describe('Post title.'),
  subtitle: z.string().describe('Post subtitle (empty when not set).'),
  company: companyFrequencySchema,
  algorithmTags: z.array(z.string()).describe('Algorithm/topic tags such as ARRAY, GREEDY, HASH_TABLE.'),
  stages: z.array(z.string()).describe('Interview stages where this question appears (SCREENING, OA, ONSITE, PHONE).'),
  difficulty: z.number().int().describe(difficultyDescription),
  frequency: z.number().int().describe('Aggregate report frequency across all companies.'),
  isLocked: z.boolean().describe('Whether full content is gated behind a paid subscription.'),
  createdDate: z.string().describe('ISO 8601 timestamp when the post was created.'),
  firstPublishedDate: z.string().describe('ISO 8601 timestamp when first published, or empty if unpublished.'),
  lastReportSeenDate: z
    .string()
    .describe('ISO 8601 timestamp of the most recent reported sighting, or empty if unknown.'),
  codingQuestionIds: z
    .array(z.string())
    .describe('IDs of the coding questions associated with this post (used for comments and detail lookups).'),
});

export const postDetailSchema = postSummarySchema.extend({
  contentPreview: z
    .string()
    .describe(
      'Markdown preview of the question statement. For locked posts this is a teaser; for unlocked posts this is the full prompt.',
    ),
  topic: z.string().describe('Topic grouping label, or empty when not set.'),
  estimatedReadingTimeInMinutes: z.number().int().describe('Estimated reading time in minutes, or 0 if unknown.'),
});

interface RawCompanyEntry {
  frequency?: number;
}

export interface RawPost {
  id?: string;
  type?: string;
  title?: string;
  subtitle?: string | null;
  contentPreview?: string;
  company?: Record<string, RawCompanyEntry>;
  algorithmTags?: string[];
  stages?: string[];
  difficulty?: number;
  frequency?: number;
  isLocked?: boolean;
  createdDate?: string;
  firstPublishedDate?: string | null;
  lastReportSeenData?: { lastReportSeenDate?: string | null };
  topic?: string | null;
  estimatedReadingTimeInMinutes?: number | null;
  codingQuestions?: { id?: string }[];
}

const mapCompany = (raw: Record<string, RawCompanyEntry> | undefined): Record<string, { frequency: number }> => {
  const result: Record<string, { frequency: number }> = {};
  for (const [name, entry] of Object.entries(raw ?? {})) {
    result[name] = { frequency: entry.frequency ?? 0 };
  }
  return result;
};

export const mapPostSummary = (p: RawPost) => ({
  id: p.id ?? '',
  type: p.type ?? '',
  title: p.title ?? '',
  subtitle: p.subtitle ?? '',
  company: mapCompany(p.company),
  algorithmTags: p.algorithmTags ?? [],
  stages: p.stages ?? [],
  difficulty: p.difficulty ?? 0,
  frequency: p.frequency ?? 0,
  isLocked: p.isLocked ?? false,
  createdDate: p.createdDate ?? '',
  firstPublishedDate: p.firstPublishedDate ?? '',
  lastReportSeenDate: p.lastReportSeenData?.lastReportSeenDate ?? '',
  codingQuestionIds: (p.codingQuestions ?? []).map(c => c.id ?? '').filter(Boolean),
});

export const mapPostDetail = (p: RawPost) => ({
  ...mapPostSummary(p),
  contentPreview: p.contentPreview ?? '',
  topic: p.topic ?? '',
  estimatedReadingTimeInMinutes: p.estimatedReadingTimeInMinutes ?? 0,
});

// ---------------------------------------------------------------------------
// Company directory
// ---------------------------------------------------------------------------

export const companyDirectoryEntrySchema = z.object({
  key: z.string().describe('Lowercase canonical company key used in URL slugs (e.g., "amazon", "pinterest").'),
  displayName: z.string().describe('Human-readable company name.'),
  aliases: z.array(z.string()).describe('Alternative names that resolve to this company.'),
  priority: z.number().int().describe('Listing priority — higher values surface first.'),
  country: z.string().describe('Two-letter country code (e.g., "US"), or empty if unknown.'),
});

export interface RawCompanyDirectoryEntry {
  key?: string;
  displayName?: string;
  aliases?: string[];
  priority?: number;
  country?: string;
}

export const mapCompanyDirectoryEntry = (c: RawCompanyDirectoryEntry) => ({
  key: c.key ?? '',
  displayName: c.displayName ?? '',
  aliases: c.aliases ?? [],
  priority: c.priority ?? 0,
  country: c.country ?? '',
});

// ---------------------------------------------------------------------------
// Company question statistics
// ---------------------------------------------------------------------------

export const companyStatsSchema = z.object({
  company: z.string().describe('Company name (uppercase, e.g., "AMAZON").'),
  total: z.number().int().describe('Total questions tracked for this company.'),
  postTypeRecords: z
    .array(
      z.object({
        postType: z.string().describe('Post type bucket (ALGORITHM, SD, ML_SD, BLOG).'),
        count: z.number().int().describe('Number of questions in this bucket.'),
      }),
    )
    .describe('Breakdown of question count by post type.'),
  updatedDate: z.string().describe('ISO 8601 timestamp of the last statistics refresh.'),
});

export interface RawCompanyStatsEntry {
  postTypeRecords?: { postType?: string; count?: number }[];
  company?: string;
  total?: number;
  updatedDate?: string;
}

export const mapCompanyStats = (s: RawCompanyStatsEntry) => ({
  company: s.company ?? '',
  total: s.total ?? 0,
  postTypeRecords: (s.postTypeRecords ?? []).map(r => ({
    postType: r.postType ?? '',
    count: r.count ?? 0,
  })),
  updatedDate: s.updatedDate ?? '',
});

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export const userProfileSchema = z.object({
  id: z.string().describe('User ID.'),
  email: z.string().describe('User email address.'),
  alias: z.string().describe('Public username displayed on comments and profile pages.'),
  avatar: z.string().describe('Avatar image URL, or empty if not set.'),
  accountType: z.string().describe('Account ownership type — typically OWNED for self-managed accounts.'),
  premiumExpiredDate: z
    .string()
    .describe('ISO 8601 timestamp when premium access expires, or empty for free accounts.'),
  balance: z.number().describe('Account credit balance.'),
  createdDate: z.string().describe('ISO 8601 timestamp when the account was created.'),
  lastLoginDate: z.string().describe('ISO 8601 timestamp of the last login.'),
});

export interface RawUserProfile {
  id?: string;
  email?: string;
  alias?: string;
  avatar?: string;
  accountType?: string;
  premiumExpiredDate?: string | null;
  balance?: number;
  createdDate?: string;
  lastLoginDate?: string;
}

export const mapUserProfile = (u: RawUserProfile) => ({
  id: u.id ?? '',
  email: u.email ?? '',
  alias: u.alias ?? '',
  avatar: u.avatar ?? '',
  accountType: u.accountType ?? '',
  premiumExpiredDate: u.premiumExpiredDate ?? '',
  balance: u.balance ?? 0,
  createdDate: u.createdDate ?? '',
  lastLoginDate: u.lastLoginDate ?? '',
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export const subscriptionSchema = z.object({
  id: z.string().describe('Subscription ID.'),
  userId: z.string().describe('Owning user ID.'),
  status: z.string().describe('Subscription status — typically ACTIVE, CANCELED, EXPIRED, PENDING, or TRIALING.'),
  paymentType: z.string().describe('Payment method used (e.g., CREDIT_CARD).'),
  planType: z.string().describe('Plan duration code (e.g., MONTHLY, THREE_MONTH, ANNUAL).'),
  currentPeriodStart: z.string().describe('ISO 8601 timestamp marking the start of the current billing period.'),
  currentPeriodEnd: z.string().describe('ISO 8601 timestamp marking the end of the current billing period.'),
  price: z.number().describe('Price charged for the current period, in the plan currency.'),
});

export interface RawSubscription {
  id?: string;
  userId?: string;
  status?: string;
  paymentType?: string;
  planType?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  price?: number;
}

export const mapSubscription = (s: RawSubscription) => ({
  id: s.id ?? '',
  userId: s.userId ?? '',
  status: s.status ?? '',
  paymentType: s.paymentType ?? '',
  planType: s.planType ?? '',
  currentPeriodStart: s.currentPeriodStart ?? '',
  currentPeriodEnd: s.currentPeriodEnd ?? '',
  price: s.price ?? 0,
});

// ---------------------------------------------------------------------------
// User post records (bookmarks and visit history)
// ---------------------------------------------------------------------------

const minimalPostSchema = z.object({
  id: z.string().describe('Post ID.'),
  type: z.string().describe('Post type (ALGORITHM, SD, ML_SD, BLOG).'),
  title: z.string().describe('Post title.'),
  isLocked: z.boolean().describe('Whether the post requires a paid subscription.'),
});

export const visitRecordSchema = z.object({
  id: z.string().describe('Visit record ID.'),
  postId: z.string().describe('Post ID this record refers to.'),
  userId: z.string().describe('Owning user ID.'),
  readingStatus: z.string().describe('Reading status — NEW, READING, or COMPLETED.'),
  isManualSet: z.boolean().describe('Whether the status was set manually by the user.'),
  createdDate: z.string().describe('ISO 8601 timestamp when the record was created.'),
  updatedDate: z.string().describe('ISO 8601 timestamp when the record was last updated.'),
  post: minimalPostSchema.describe('Snapshot of the linked post.'),
});

export const bookmarkRecordSchema = z.object({
  id: z.string().describe('Bookmark record ID.'),
  postId: z.string().describe('Post ID that was bookmarked.'),
  userId: z.string().describe('Owning user ID.'),
  createdDate: z.string().describe('ISO 8601 timestamp when the bookmark was created.'),
  updatedDate: z.string().describe('ISO 8601 timestamp when the bookmark was last updated.'),
  post: minimalPostSchema.describe('Snapshot of the linked post.'),
});

interface RawMinimalPost {
  id?: string;
  type?: string;
  title?: string;
  isLocked?: boolean;
}

export interface RawVisitRecord {
  id?: string;
  postId?: string;
  userId?: string;
  readingStatus?: string;
  isManualSet?: boolean;
  createdDate?: string;
  updatedDate?: string;
  post?: RawMinimalPost;
}

export interface RawBookmarkRecord {
  id?: string;
  postId?: string;
  userId?: string;
  createdDate?: string;
  updatedDate?: string;
  post?: RawMinimalPost;
}

const mapMinimalPost = (p: RawMinimalPost | undefined) => ({
  id: p?.id ?? '',
  type: p?.type ?? '',
  title: p?.title ?? '',
  isLocked: p?.isLocked ?? false,
});

export const mapVisitRecord = (r: RawVisitRecord) => ({
  id: r.id ?? '',
  postId: r.postId ?? '',
  userId: r.userId ?? '',
  readingStatus: r.readingStatus ?? '',
  isManualSet: r.isManualSet ?? false,
  createdDate: r.createdDate ?? '',
  updatedDate: r.updatedDate ?? '',
  post: mapMinimalPost(r.post),
});

export const mapBookmarkRecord = (r: RawBookmarkRecord) => ({
  id: r.id ?? '',
  postId: r.postId ?? '',
  userId: r.userId ?? '',
  createdDate: r.createdDate ?? '',
  updatedDate: r.updatedDate ?? '',
  post: mapMinimalPost(r.post),
});

// ---------------------------------------------------------------------------
// Comments and replies
// ---------------------------------------------------------------------------

const commentUserSchema = z.object({
  alias: z.string().describe('Author username.'),
  avatar: z.string().describe('Author avatar URL, or empty if not set.'),
});

export const commentSchema = z.object({
  id: z.string().describe('Comment ID.'),
  type: z
    .string()
    .describe('Comment type — CODING_QUESTION (anchored to a coding question) or POST (anchored to a post).'),
  title: z.string().describe('Comment title or label, or empty if not set.'),
  language: z.string().describe('Programming language label for code-only comments, or empty.'),
  upvoteCount: z.number().int().describe('Number of upvotes.'),
  downvoteCount: z.number().int().describe('Number of downvotes.'),
  voteScore: z.number().int().describe('Combined vote score (upvotes minus downvotes).'),
  viewCount: z.number().int().describe('View count.'),
  replyCount: z.number().int().describe('Number of replies on this comment.'),
  isAnonymous: z.boolean().describe('Whether the comment was posted anonymously.'),
  postId: z.string().describe('Post ID this comment is attached to, or empty.'),
  codingQuestionId: z.string().describe('Coding question ID this comment is attached to, or empty.'),
  user: commentUserSchema.describe('Author identity.'),
  displayName: z.string().describe('Author display name as shown in the UI.'),
  hasUserUpvoted: z.boolean().describe('Whether the requesting user has upvoted this comment.'),
  hasUserDownvoted: z.boolean().describe('Whether the requesting user has downvoted this comment.'),
  createdDate: z.string().describe('ISO 8601 timestamp when the comment was created.'),
  updatedDate: z.string().describe('ISO 8601 timestamp when the comment was last updated.'),
});

export const commentDetailSchema = commentSchema.extend({
  code: z
    .string()
    .describe('Source code body for code-snippet comments, or empty when the comment is a text discussion.'),
  content: z.string().describe('Markdown text body for prose comments, or empty when the comment is a code snippet.'),
});

export interface RawComment {
  id?: string;
  type?: string;
  title?: string;
  code?: string;
  content?: string;
  extra?: { language?: string };
  upvoteCount?: number;
  downvoteCount?: number;
  voteScore?: number;
  viewCount?: number;
  replyCount?: number;
  isAnonymous?: boolean;
  postId?: string;
  codingQuestionId?: string;
  user?: { alias?: string; avatar?: string };
  displayName?: string;
  hasUserUpvoted?: boolean;
  hasUserDownvoted?: boolean;
  createdDate?: string;
  updatedDate?: string;
}

export const mapComment = (c: RawComment) => ({
  id: c.id ?? '',
  type: c.type ?? '',
  title: c.title ?? '',
  language: c.extra?.language ?? '',
  upvoteCount: c.upvoteCount ?? 0,
  downvoteCount: c.downvoteCount ?? 0,
  voteScore: c.voteScore ?? 0,
  viewCount: c.viewCount ?? 0,
  replyCount: c.replyCount ?? 0,
  isAnonymous: c.isAnonymous ?? false,
  postId: c.postId ?? '',
  codingQuestionId: c.codingQuestionId ?? '',
  user: { alias: c.user?.alias ?? '', avatar: c.user?.avatar ?? '' },
  displayName: c.displayName ?? '',
  hasUserUpvoted: c.hasUserUpvoted ?? false,
  hasUserDownvoted: c.hasUserDownvoted ?? false,
  createdDate: c.createdDate ?? '',
  updatedDate: c.updatedDate ?? '',
});

export const mapCommentDetail = (c: RawComment) => ({
  ...mapComment(c),
  code: c.code ?? '',
  content: c.content ?? '',
});

// ---------------------------------------------------------------------------
// Coding questions (lightweight reference returned by /coding/filter)
// ---------------------------------------------------------------------------

export const codingQuestionRefSchema = z.object({
  id: z.string().describe('Coding question ID.'),
  type: z.string().describe('Coding question type (e.g., SINGLE_STEP, MULTI_STEP).'),
});

export interface RawCodingQuestionRef {
  id?: string;
  type?: string;
}

export const mapCodingQuestionRef = (q: RawCodingQuestionRef) => ({
  id: q.id ?? '',
  type: q.type ?? '',
});
