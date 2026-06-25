// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message to ChatGPT. Posts the prompt to a conversation and returns the assistant reply; starts a new conversation when no conversation_id is given.',
  summary: 'send a message in chatgpt',
  icon: 'send',
  group: 'Conversations',
  input: z.object({
    message: z.string().min(1).describe('The message text to send to ChatGPT'),
    conversation_id: z.string().optional().describe('Conversation to continue (omit to start a new one)'),
    model: z.string().optional().describe('Model slug to use for the reply'),
  }),
  output: z.object({
    reply: z.object({
      conversation_id: z.string(),
      content: z.string(),
    }).describe('The assistant reply'),
  }),
  handle: async (params: { message: string; conversation_id?: string; model?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /conversation (send -> WRITE;
    // the {method:'POST'} literal reinforces the write class on both the verb AND method axes).
    const data = await api<{ reply: { conversation_id: string; content: string } }>('/conversation', {
      method: 'POST',
      body: { message: params.message, conversation_id: params.conversation_id, model: params.model },
    });
    return { reply: data.reply };
  },
});
