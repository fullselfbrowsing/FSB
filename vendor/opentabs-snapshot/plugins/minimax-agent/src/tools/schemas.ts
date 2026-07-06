import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  user_id: z.string().describe('User ID'),
  real_user_id: z.string().describe('Real (numeric) user ID'),
  name: z.string().describe('Display name'),
  email: z.string().describe('Email address'),
  avatar: z.string().describe('Avatar URL'),
  description: z.string().describe('User bio/description'),
  is_login: z.boolean().describe('Whether the user is logged in'),
});

export interface RawUser {
  userID?: string;
  realUserID?: string;
  name?: string;
  email?: string;
  avatar?: string;
  description?: string;
  isLogin?: boolean;
  avatarInfo?: { small?: string; medium?: string; large?: string };
  vipInfo?: { type?: number; expireTime?: number };
  phone?: string;
}

export const mapUser = (u: RawUser) => ({
  user_id: u.userID ?? '',
  real_user_id: u.realUserID ?? '',
  name: u.name ?? '',
  email: u.email ?? '',
  avatar: u.avatarInfo?.large ?? u.avatar ?? '',
  description: u.description ?? '',
  is_login: u.isLogin ?? false,
});

// --- Membership ---

export const membershipSchema = z.object({
  plan_type: z.number().int().describe('Plan type (1=Free, 2=Pro, etc.)'),
  plan_name: z.string().describe('Plan name (e.g., "Free", "Pro")'),
  total_credits: z.number().int().describe('Total remaining credits'),
  pending_credits: z.number().int().describe('Pending credits'),
  will_renewal: z.boolean().describe('Whether the plan auto-renews'),
  expires_at: z.number().describe('Plan expiration timestamp (0 if not applicable)'),
  is_pro_builder: z.boolean().describe('Whether the user is a Pro Builder'),
  daily_gift_credits: z.number().int().describe('Daily login gift credits remaining'),
});

export interface RawMembership {
  plan_type?: number;
  plan_name?: string;
  total_remains_credit?: number;
  pending_credit?: number;
  will_renewal?: boolean;
  expires_at?: number;
  is_pro_builder?: boolean;
  daily_login_gift_credit_remaining?: number;
}

export const mapMembership = (m: RawMembership) => ({
  plan_type: m.plan_type ?? 0,
  plan_name: m.plan_name ?? '',
  total_credits: m.total_remains_credit ?? 0,
  pending_credits: m.pending_credit ?? 0,
  will_renewal: m.will_renewal ?? false,
  expires_at: m.expires_at ?? 0,
  is_pro_builder: m.is_pro_builder ?? false,
  daily_gift_credits: m.daily_login_gift_credit_remaining ?? 0,
});

// --- Credit Record ---

export const creditRecordSchema = z.object({
  credit_type: z.string().describe('Credit type identifier'),
  amount: z.number().describe('Credit amount (positive=earned, negative=spent)'),
  create_time: z.number().describe('Record creation timestamp in ms'),
  description: z.string().describe('Human-readable description of the credit event'),
});

export interface RawCreditRecord {
  credit_type?: string;
  amount?: number;
  create_time?: number;
  description?: string;
}

export const mapCreditRecord = (r: RawCreditRecord) => ({
  credit_type: r.credit_type ?? '',
  amount: r.amount ?? 0,
  create_time: r.create_time ?? 0,
  description: r.description ?? '',
});

// --- Chat ---

export const chatSchema = z.object({
  chat_id: z.number().describe('Chat/conversation ID'),
  name: z.string().describe('Chat name/title'),
  chat_type: z.number().int().describe('Chat type (0=normal, 2=agent)'),
  create_time: z.number().describe('Creation timestamp in ms'),
  update_time: z.number().describe('Last update timestamp in ms'),
  expert_id: z.number().describe('Associated expert ID (0 if none)'),
  is_shared: z.boolean().describe('Whether the chat is shared publicly'),
});

export interface RawChat {
  chatID?: number;
  name?: string;
  chatType?: number;
  createTime?: number;
  updateTime?: number;
  expertId?: number;
  isShared?: boolean;
}

export const mapChat = (c: RawChat) => ({
  chat_id: c.chatID ?? 0,
  name: c.name ?? '',
  chat_type: c.chatType ?? 0,
  create_time: c.createTime ?? 0,
  update_time: c.updateTime ?? 0,
  expert_id: c.expertId ?? 0,
  is_shared: c.isShared ?? false,
});

// --- Chat Message ---

export const messageSchema = z.object({
  message_id: z.string().describe('Message ID'),
  role: z.string().describe('Message role (user, assistant, system)'),
  content: z.string().describe('Message text content'),
  create_time: z.number().describe('Creation timestamp in ms'),
});

export interface RawMessage {
  id?: string;
  msgID?: string;
  role?: string;
  content?: string;
  text?: string;
  createTime?: number;
  create_time?: number;
}

export const mapMessage = (m: RawMessage) => ({
  message_id: m.id ?? m.msgID ?? '',
  role: m.role ?? '',
  content: m.content ?? m.text ?? '',
  create_time: m.createTime ?? m.create_time ?? 0,
});

// --- Expert ---

export const expertSchema = z.object({
  id: z.number().describe('Expert ID'),
  chat_id: z.number().describe('Associated chat ID'),
  name: z.string().describe('Expert name'),
  description: z.string().describe('Expert description'),
  creator_name: z.string().describe('Creator display name'),
  icon_url: z.string().describe('Expert icon URL'),
  cover_url: z.string().describe('Expert cover image URL'),
  view_count: z.number().int().describe('Number of views'),
  up_vote_count: z.number().int().describe('Number of upvotes'),
  vote_status: z.number().int().describe('Current user vote status (0=none, 1=upvoted)'),
  is_pinned: z.boolean().describe('Whether pinned by the current user'),
  publish_status: z.number().int().describe('Publish status (0=draft, 1=published)'),
  create_time: z.number().describe('Creation timestamp in ms'),
  update_time: z.number().describe('Last update timestamp in ms'),
});

export interface RawExpert {
  id?: number;
  chat_id?: number;
  name?: string;
  description?: string;
  creator_name?: string;
  creator_id?: string;
  icon_url?: string;
  cover_url?: string;
  view_count?: number;
  up_vote_count?: number;
  vote_status?: number;
  is_pinned?: boolean;
  publish_status?: number;
  type?: number;
  instructions_text?: string;
  need_supabase?: boolean;
  preview_urls?: string[];
  popular_score?: number;
  parent_id?: number;
  create_timestamp?: number;
  update_timestamp?: number;
}

export const mapExpert = (e: RawExpert) => ({
  id: e.id ?? 0,
  chat_id: e.chat_id ?? 0,
  name: e.name ?? '',
  description: e.description ?? '',
  creator_name: e.creator_name ?? '',
  icon_url: e.icon_url ?? '',
  cover_url: e.cover_url ?? '',
  view_count: e.view_count ?? 0,
  up_vote_count: e.up_vote_count ?? 0,
  vote_status: e.vote_status ?? 0,
  is_pinned: e.is_pinned ?? false,
  publish_status: e.publish_status ?? 0,
  create_time: e.create_timestamp ?? 0,
  update_time: e.update_timestamp ?? 0,
});

// --- Gallery ---

export const galleryCategorySchema = z.object({
  category: z.string().describe('Category name'),
  sub_categories: z.array(z.string()).describe('Sub-category names'),
});

export interface RawGalleryCategory {
  category?: string;
  sub_category?: string[];
}

export const mapGalleryCategory = (c: RawGalleryCategory) => ({
  category: c.category ?? '',
  sub_categories: c.sub_category ?? [],
});

export const galleryItemSchema = z.object({
  id: z.number().describe('Gallery item ID'),
  chat_id: z.number().describe('Source chat ID'),
  title: z.string().describe('Gallery item title'),
  description: z.string().describe('Gallery item description'),
  category: z.string().describe('Category name'),
  cover_url: z.string().describe('Cover image URL'),
  creator_name: z.string().describe('Creator display name'),
  view_count: z.number().int().describe('View count'),
  remix_count: z.number().int().describe('Remix count'),
});

export interface RawGalleryItem {
  id?: number;
  chat_id?: number;
  title?: string;
  description?: string;
  category?: string;
  cover_url?: string;
  creator_name?: string;
  view_count?: number;
  remix_count?: number;
}

export const mapGalleryItem = (g: RawGalleryItem) => ({
  id: g.id ?? 0,
  chat_id: g.chat_id ?? 0,
  title: g.title ?? '',
  description: g.description ?? '',
  category: g.category ?? '',
  cover_url: g.cover_url ?? '',
  creator_name: g.creator_name ?? '',
  view_count: g.view_count ?? 0,
  remix_count: g.remix_count ?? 0,
});

// --- Cron Job ---

export const cronJobSchema = z.object({
  id: z.string().describe('Cron job ID'),
  name: z.string().describe('Job name'),
  prompt: z.string().describe('Prompt/instructions for the job'),
  cron_expression: z.string().describe('Cron expression (e.g., "0 9 * * *")'),
  status: z.number().int().describe('Job status (0=paused, 1=active)'),
  chat_id: z.number().describe('Associated chat ID'),
  create_time: z.number().describe('Creation timestamp in ms'),
  update_time: z.number().describe('Last update timestamp in ms'),
});

export interface RawCronJob {
  job_id?: number;
  job_title?: string;
  job_instruction?: string;
  cron_expression?: string;
  status?: number;
  notification?: boolean;
  created_at?: number;
  updated_at?: number;
  next_run_at?: number;
}

export const mapCronJob = (j: RawCronJob) => ({
  id: String(j.job_id ?? ''),
  name: j.job_title ?? '',
  prompt: j.job_instruction ?? '',
  cron_expression: j.cron_expression ?? '',
  status: j.status ?? 0,
  chat_id: 0,
  create_time: j.created_at ?? 0,
  update_time: j.updated_at ?? 0,
});

// --- Cron Execution ---

export const cronExecutionSchema = z.object({
  id: z.string().describe('Execution ID'),
  job_id: z.string().describe('Parent job ID'),
  status: z.number().int().describe('Execution status'),
  chat_id: z.number().describe('Chat ID where execution ran'),
  start_time: z.number().describe('Start timestamp in ms'),
  end_time: z.number().describe('End timestamp in ms'),
});

export interface RawCronExecution {
  id?: string;
  job_id?: string;
  status?: number;
  chat_id?: number;
  start_time?: number;
  end_time?: number;
}

export const mapCronExecution = (e: RawCronExecution) => ({
  id: e.id ?? '',
  job_id: e.job_id ?? '',
  status: e.status ?? 0,
  chat_id: e.chat_id ?? 0,
  start_time: e.start_time ?? 0,
  end_time: e.end_time ?? 0,
});

// --- Expert Tag ---

export const expertTagSchema = z.object({
  id: z.string().describe('Tag ID'),
  name: z.string().describe('Tag display name'),
});

export interface RawExpertTag {
  id?: string;
  name?: string;
}

export const mapExpertTag = (t: RawExpertTag) => ({
  id: t.id ?? '',
  name: t.name ?? '',
});

// --- Workspace Member ---

export const workspaceMemberSchema = z.object({
  user_id: z.string().describe('Member user ID'),
  name: z.string().describe('Member display name'),
  email: z.string().describe('Member email'),
  role: z.string().describe('Member role'),
  avatar: z.string().describe('Member avatar URL'),
});

export interface RawWorkspaceMember {
  user_id?: string;
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
}

export const mapWorkspaceMember = (m: RawWorkspaceMember) => ({
  user_id: m.user_id ?? '',
  name: m.name ?? '',
  email: m.email ?? '',
  role: m.role ?? '',
  avatar: m.avatar ?? '',
});
