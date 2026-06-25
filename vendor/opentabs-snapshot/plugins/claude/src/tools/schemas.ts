import { z } from 'zod';

// --- Organization ---

export const organizationSchema = z.object({
  uuid: z.string().describe('Organization UUID'),
  name: z.string().describe('Organization name'),
  billing_type: z.string().nullable().describe('Billing type (null for free)'),
  capabilities: z.array(z.string()).describe('Organization capabilities (e.g., "chat")'),
  rate_limit_tier: z.string().describe('Rate limit tier'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawOrganization {
  uuid?: string;
  name?: string;
  billing_type?: string | null;
  capabilities?: string[];
  rate_limit_tier?: string;
  created_at?: string;
}

export const mapOrganization = (o: RawOrganization) => ({
  uuid: o.uuid ?? '',
  name: o.name ?? '',
  billing_type: o.billing_type ?? null,
  capabilities: o.capabilities ?? [],
  rate_limit_tier: o.rate_limit_tier ?? '',
  created_at: o.created_at ?? '',
});

// --- Account ---

export const accountSchema = z.object({
  uuid: z.string().describe('Account UUID'),
  email_address: z.string().describe('Email address'),
  full_name: z.string().nullable().describe('Full name (may be null)'),
  display_name: z.string().nullable().describe('Display name (may be null)'),
  created_at: z.string().describe('ISO 8601 account creation timestamp'),
  is_verified: z.boolean().describe('Whether the account is verified'),
});

export interface RawAccount {
  uuid?: string;
  email_address?: string;
  full_name?: string | null;
  display_name?: string | null;
  created_at?: string;
  is_verified?: boolean;
}

export const mapAccount = (a: RawAccount) => ({
  uuid: a.uuid ?? '',
  email_address: a.email_address ?? '',
  full_name: a.full_name ?? null,
  display_name: a.display_name ?? null,
  created_at: a.created_at ?? '',
  is_verified: a.is_verified ?? false,
});

// --- Conversation ---

export const conversationSchema = z.object({
  uuid: z.string().describe('Conversation UUID'),
  name: z.string().describe('Conversation name (may be empty for unnamed)'),
  summary: z.string().describe('Conversation summary'),
  model: z.string().describe('Model used (e.g., "claude-sonnet-4-6")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  is_starred: z.boolean().describe('Whether the conversation is starred'),
  project_uuid: z.string().nullable().describe('Associated project UUID, if any'),
});

export interface RawConversation {
  uuid?: string;
  name?: string;
  summary?: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
  is_starred?: boolean;
  project_uuid?: string | null;
}

export const mapConversation = (c: RawConversation) => ({
  uuid: c.uuid ?? '',
  name: c.name ?? '',
  summary: c.summary ?? '',
  model: c.model ?? '',
  created_at: c.created_at ?? '',
  updated_at: c.updated_at ?? '',
  is_starred: c.is_starred ?? false,
  project_uuid: c.project_uuid ?? null,
});

// --- Message ---

export const messageSchema = z.object({
  uuid: z.string().describe('Message UUID'),
  text: z.string().describe('Message text content'),
  sender: z.string().describe('Message sender: "human" or "assistant"'),
  index: z.number().int().describe('Message index in the conversation'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  parent_message_uuid: z.string().describe('Parent message UUID'),
});

export interface RawMessage {
  uuid?: string;
  text?: string;
  content?: { type?: string; text?: string }[];
  sender?: string;
  index?: number;
  created_at?: string;
  parent_message_uuid?: string;
}

export const mapMessage = (m: RawMessage) => ({
  uuid: m.uuid ?? '',
  text: m.text || m.content?.find(c => c.type === 'text')?.text || '',
  sender: m.sender ?? '',
  index: m.index ?? 0,
  created_at: m.created_at ?? '',
  parent_message_uuid: m.parent_message_uuid ?? '',
});

// --- Conversation with messages ---

export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(messageSchema).describe('Messages in the conversation'),
});

// --- Project ---

export const projectSchema = z.object({
  uuid: z.string().describe('Project UUID'),
  name: z.string().describe('Project name'),
  description: z.string().describe('Project description'),
  is_private: z.boolean().describe('Whether the project is private'),
  is_starred: z.boolean().describe('Whether the project is starred'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  archived_at: z.string().nullable().describe('ISO 8601 archive timestamp, null if not archived'),
  docs_count: z.number().int().describe('Number of documents in the project'),
  files_count: z.number().int().describe('Number of files in the project'),
});

export interface RawProject {
  uuid?: string;
  name?: string;
  description?: string;
  is_private?: boolean;
  is_starred?: boolean;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  docs_count?: number;
  files_count?: number;
}

export const mapProject = (p: RawProject) => ({
  uuid: p.uuid ?? '',
  name: p.name ?? '',
  description: p.description ?? '',
  is_private: p.is_private ?? false,
  is_starred: p.is_starred ?? false,
  created_at: p.created_at ?? '',
  updated_at: p.updated_at ?? '',
  archived_at: p.archived_at ?? null,
  docs_count: p.docs_count ?? 0,
  files_count: p.files_count ?? 0,
});
