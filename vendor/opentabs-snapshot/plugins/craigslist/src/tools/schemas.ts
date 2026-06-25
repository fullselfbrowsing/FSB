import { z } from 'zod';

// --- Chat conversation schema ---

export const chatConversationSchema = z.object({
  conversationId: z.number().describe('Unique conversation ID'),
  postingId: z.number().describe('Posting ID the conversation is about'),
  postingTitle: z.string().describe('Title of the posting'),
  otherPartyName: z.string().describe('Display name of the other party'),
  lastMessageDate: z.string().describe('ISO 8601 timestamp of the last message'),
  lastMessagePreview: z.string().describe('Preview text of the last message'),
  unreadCount: z.number().describe('Number of unread messages'),
  isArchived: z.boolean().describe('Whether the conversation is archived'),
});

export interface RawChatConversation {
  conversationId?: number;
  postingId?: number;
  postingTitle?: string;
  otherPartyName?: string;
  lastMessageDate?: string;
  lastMessageText?: string;
  unreadCount?: number;
  archived?: boolean;
}

export const mapChatConversation = (c: RawChatConversation) => ({
  conversationId: c.conversationId ?? 0,
  postingId: c.postingId ?? 0,
  postingTitle: c.postingTitle ?? '',
  otherPartyName: c.otherPartyName ?? '',
  lastMessageDate: c.lastMessageDate ?? '',
  lastMessagePreview: c.lastMessageText ?? '',
  unreadCount: c.unreadCount ?? 0,
  isArchived: c.archived ?? false,
});

// --- Chat message schema ---

export const chatMessageSchema = z.object({
  messageId: z.number().describe('Unique message ID'),
  conversationId: z.number().describe('Conversation ID'),
  senderName: z.string().describe('Display name of the sender'),
  text: z.string().describe('Message text content'),
  date: z.string().describe('ISO 8601 timestamp'),
  isFromMe: z.boolean().describe('Whether the message was sent by the current user'),
});

export interface RawChatMessage {
  messageId?: number;
  conversationId?: number;
  senderName?: string;
  text?: string;
  date?: string;
  isFromMe?: boolean;
}

export const mapChatMessage = (m: RawChatMessage) => ({
  messageId: m.messageId ?? 0,
  conversationId: m.conversationId ?? 0,
  senderName: m.senderName ?? '',
  text: m.text ?? '',
  date: m.date ?? '',
  isFromMe: m.isFromMe ?? false,
});

// --- Payment card schema ---

export const paymentCardSchema = z.object({
  id: z.string().describe('Card ID'),
  cardVendorName: z.string().describe('Card vendor (e.g., Visa, MasterCard, American Express)'),
  cardNumberLastFour: z.string().describe('Last 4 digits of card number'),
  cardExpireDate: z.string().describe('Expiration date (MMYY format)'),
  firstName: z.string().describe('Cardholder first name'),
  lastName: z.string().describe('Cardholder last name'),
  address: z.string().describe('Billing address'),
  city: z.string().describe('Billing city'),
  subnational: z.string().describe('Billing state or province'),
  postalCode: z.string().describe('Billing postal code'),
  country: z.string().describe('Billing country code'),
  isDefault: z.boolean().describe('Whether this card is the default payment method'),
  isExpired: z.boolean().describe('Whether the card is expired'),
});

export interface RawPaymentCard {
  id?: string;
  card_vendor_name?: string;
  card_number_last_four?: string;
  card_expire_date?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  subnational?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
  is_expired?: boolean;
}

export const mapPaymentCard = (c: RawPaymentCard) => ({
  id: c.id ?? '',
  cardVendorName: c.card_vendor_name ?? '',
  cardNumberLastFour: c.card_number_last_four ?? '',
  cardExpireDate: c.card_expire_date ?? '',
  firstName: c.first_name ?? '',
  lastName: c.last_name ?? '',
  address: c.address ?? '',
  city: c.city ?? '',
  subnational: c.subnational ?? '',
  postalCode: c.postal_code ?? '',
  country: c.country ?? '',
  isDefault: c.is_default ?? false,
  isExpired: c.is_expired ?? false,
});

// --- Saved search count schema ---

export const savedSearchCountSchema = z.object({
  id: z.number().describe('Saved search ID'),
  count: z.number().describe('Number of new results for this saved search'),
});

export interface RawSavedSearchCount {
  id?: number;
  count?: number;
}

export const mapSavedSearchCount = (s: RawSavedSearchCount) => ({
  id: s.id ?? 0,
  count: s.count ?? 0,
});
