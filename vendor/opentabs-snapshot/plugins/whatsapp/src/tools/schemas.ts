import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod output schemas only — serialization logic lives in whatsapp-api.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatSchema = z.object({
  id: z.string().describe('Chat ID (e.g., "15551234567@c.us" for users, "120363...@g.us" for groups)'),
  name: z.string().describe('Chat display name (contact name, group subject, or phone number)'),
  is_group: z.boolean().describe('Whether this is a group chat'),
  unread_count: z.number().int().describe('Number of unread messages (-1 means chat is marked as unread)'),
  marked_unread: z.boolean().describe('Whether the chat has been explicitly marked as unread'),
  timestamp: z.number().int().describe('Last message timestamp (Unix seconds)'),
  archived: z.boolean().describe('Whether the chat is archived'),
  pinned: z.boolean().describe('Whether the chat is pinned'),
  muted: z.boolean().describe('Whether the chat is muted'),
  is_read_only: z.boolean().describe('Whether the chat is read-only'),
});

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export const messageSchema = z.object({
  id: z.string().describe('Message ID'),
  from_me: z.boolean().describe('Whether the message was sent by the current user'),
  type: z.string().describe('Message type (e.g., "chat", "image", "video", "ptt", "document")'),
  body: z.string().describe('Message text content'),
  timestamp: z.number().int().describe('Message timestamp (Unix seconds)'),
  ack: z.number().int().describe('Delivery status (0=pending, 1=sent, 2=delivered, 3=read)'),
  starred: z.boolean().describe('Whether the message is starred'),
  from: z.string().describe('Sender ID'),
  to: z.string().describe('Recipient ID'),
  author: z.string().describe('Author ID (relevant in group chats)'),
  is_forwarded: z.boolean().describe('Whether the message was forwarded'),
  has_media: z.boolean().describe('Whether the message contains media'),
  quoted_message_id: z.string().describe('ID of the quoted message, if any'),
});

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  id: z.string().describe('Contact ID (e.g., "15551234567@c.us")'),
  name: z.string().describe('Contact name (from address book)'),
  short_name: z.string().describe('Short display name'),
  push_name: z.string().describe('Name set by the contact themselves'),
  is_business: z.boolean().describe('Whether the contact is a business account'),
  is_me: z.boolean().describe('Whether this is the current user'),
  type: z.string().describe('Contact type (e.g., "in" for saved contacts)'),
});

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

export const currentUserSchema = z.object({
  id: z.string().describe('User phone number ID (e.g., "15551234567@c.us")'),
  lid: z.string().describe('User LID (linked device ID)'),
  display_name: z.string().describe('User display name (pushname)'),
  platform: z.string().describe('Primary phone platform (e.g., "iphone", "android")'),
});
