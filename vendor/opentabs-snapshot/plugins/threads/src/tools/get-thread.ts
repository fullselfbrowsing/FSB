// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../threads-api.js';

export const getThread = defineTool({
  name: 'get_thread',
  displayName: 'Get Thread',
  description: 'Get a single Threads post and its replies by thread ID.',
  summary: 'open a thread on threads',
  icon: 'message-square',
  group: 'Timeline',
  input: z.object({
    thread_id: z.string().min(1).describe('Thread ID to retrieve'),
  }),
  output: z.object({
    thread: z.object({
      id: z.string(),
      text: z.string(),
      author: z.string(),
      replies: z.array(z.object({ id: z.string(), text: z.string() })),
    }).describe('The thread and its replies'),
  }),
  handle: async (params: { thread_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /threads/:id (default method).
    const data = await api<{ thread: { id: string; text: string; author: string; replies: { id: string; text: string }[] } }>(
      `/threads/${encodeURIComponent(params.thread_id)}`
    );
    return { thread: data.thread };
  },
});
