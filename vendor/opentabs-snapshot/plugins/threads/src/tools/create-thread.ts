// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../threads-api.js';

export const createThread = defineTool({
  name: 'create_thread',
  displayName: 'Create Thread',
  description:
    'Post a new thread to Threads. Publishes the text to your account; this is publicly visible. Optionally reply to an existing thread.',
  summary: 'post a new thread',
  icon: 'plus',
  group: 'Timeline',
  input: z.object({
    text: z.string().min(1).describe('The text content of the thread to post'),
    reply_to_id: z.string().optional().describe('Thread ID to reply to (omit to start a new thread)'),
  }),
  output: z.object({
    thread: z.object({
      id: z.string(),
      text: z.string(),
    }).describe('The created thread'),
  }),
  handle: async (params: { text: string; reply_to_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /threads (create -> WRITE;
    // the {method:'POST'} literal reinforces the write class on both the verb AND method axes).
    const data = await api<{ thread: { id: string; text: string } }>('/threads', {
      method: 'POST',
      body: { text: params.text, reply_to_id: params.reply_to_id },
    });
    return { thread: data.thread };
  },
});
