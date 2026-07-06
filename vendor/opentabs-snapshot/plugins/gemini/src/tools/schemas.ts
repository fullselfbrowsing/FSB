import { z } from 'zod';

// --- Conversation ---

export const conversationSchema = z.object({
  id: z.string().describe('Conversation ID (hex string)'),
  title: z.string().describe('Conversation title'),
  url: z.string().describe('URL to the conversation on Gemini'),
});

export interface RawConversation {
  id?: string;
  title?: string;
  url?: string;
}

export const mapConversation = (c: RawConversation) => ({
  id: c.id ?? '',
  title: c.title ?? '',
  url: c.url ?? '',
});

// --- Message ---

export const messageSchema = z.object({
  conversation_id: z.string().describe('Conversation ID'),
  response_id: z.string().describe('Response ID for this turn'),
  response_choice_id: z.string().describe('Response choice ID (for response variants)'),
  text: z.string().describe('Response text in Markdown'),
});

export interface RawMessage {
  conversationId?: string;
  responseId?: string;
  responseChoiceId?: string;
  text?: string;
}

export const mapMessage = (m: RawMessage) => ({
  conversation_id: m.conversationId ?? '',
  response_id: m.responseId ?? '',
  response_choice_id: m.responseChoiceId ?? '',
  text: m.text ?? '',
});

// --- Model ---

export const modelSchema = z.object({
  id: z.string().describe('Model ID (internal identifier)'),
  display_name: z.string().describe('Display name (e.g., "Fast", "Pro")'),
  description: z.string().describe('Short description of the model'),
  is_default: z.boolean().describe('Whether this is the default model'),
});

export interface RawModel {
  id?: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
}

export const mapModel = (m: RawModel) => ({
  id: m.id ?? '',
  display_name: m.displayName ?? '',
  description: m.description ?? '',
  is_default: m.isDefault ?? false,
});

// --- User ---

export const userSchema = z.object({
  email: z.string().describe('Google account email address'),
  user_id: z.string().describe('Google user ID'),
});

// --- Conversation turn ---

export const turnSchema = z.object({
  prompt: z.string().describe('User prompt text'),
  response: z.string().describe('Gemini response text'),
});
