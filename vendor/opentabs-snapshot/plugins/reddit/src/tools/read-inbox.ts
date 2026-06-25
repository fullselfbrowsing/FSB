import type { RedditListing } from '../reddit-api.js';
import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface InboxMessage {
  id: string;
  name: string;
  author: string;
  subject: string;
  body: string;
  dest: string;
  created_utc: number;
  was_comment: boolean;
  new: boolean;
  context: string;
  subreddit: string | null;
  parent_id: string | null;
}

export const readInbox = defineTool({
  name: 'read_inbox',
  displayName: 'Read Inbox',
  description: "Read messages from the authenticated user's inbox. Includes private messages and comment replies.",
  summary: 'Read inbox messages',
  icon: 'inbox',
  group: 'Messages',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of messages (default 25, max 100)'),
    after: z.string().optional().describe('Pagination cursor for the next page'),
  }),
  output: z.object({
    messages: z
      .array(
        z.object({
          id: z.string().describe('Message ID'),
          name: z.string().describe('Message fullname'),
          author: z.string().describe('Sender username'),
          subject: z.string().describe('Message subject'),
          body: z.string().describe('Message body (markdown)'),
          dest: z.string().describe('Recipient username'),
          created_utc: z.number().describe('Send time as Unix timestamp'),
          was_comment: z.boolean().describe('Whether this is a comment reply notification'),
          new: z.boolean().describe('Whether the message is unread'),
        }),
      )
      .describe('Inbox messages'),
    after: z.string().nullable().describe('Pagination cursor for next page'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      limit: String(params.limit ?? 25),
    };
    if (params.after) queryParams.after = params.after;

    const data = await redditGet<RedditListing<InboxMessage>>('/message/inbox.json', queryParams);

    return {
      messages: data.data.children.map(child => ({
        id: child.data.id,
        name: child.data.name,
        author: child.data.author ?? '',
        subject: child.data.subject,
        body: child.data.body,
        dest: child.data.dest,
        created_utc: child.data.created_utc,
        was_comment: child.data.was_comment,
        new: child.data.new,
      })),
      after: data.data.after ?? null,
    };
  },
});
