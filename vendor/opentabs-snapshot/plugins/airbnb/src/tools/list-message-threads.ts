import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES, getCurrentUserId } from '../airbnb-api.js';
import { messageThreadSchema, mapThread } from './schemas.js';

export const listMessageThreads = defineTool({
  name: 'list_message_threads',
  displayName: 'List Message Threads',
  description: "List message threads from the user's inbox. Supports filtering by category (all, traveling, support).",
  summary: 'List message threads from inbox',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of threads to return (default 15)'),
    filter: z.enum(['all', 'traveling', 'support']).optional().describe('Inbox filter category (default all)'),
  }),
  output: z.object({
    threads: z.array(messageThreadSchema).describe('List of message threads'),
    has_next_page: z.boolean().describe('Whether more threads are available'),
  }),
  handle: async params => {
    const limit = params.limit ?? 15;
    const filter = params.filter ?? 'all';
    const userId = getCurrentUserId();
    const viewerId = btoa(`Viewer:${userId}`);

    const data = await graphql<{
      node: {
        messagingInbox: {
          threads: {
            edges: Array<{ node: Record<string, unknown> }>;
            pageInfo?: { hasNextPage?: boolean };
          };
        };
      };
    }>('ViaductInboxData', QUERY_HASHES.ViaductInboxData, {
      getParticipants: true,
      numRequestedThreads: limit,
      useUserThreadTag: true,
      userId: viewerId,
      originType: 'USER_INBOX',
      threadVisibility: 'UNARCHIVED',
      threadTagFilters: filter === 'all' ? [] : [filter],
      query: null,
      getLastReads: false,
      getThreadState: false,
      getInboxFields: true,
      getInboxOnlyFields: true,
      getMessageFields: false,
      getThreadOnlyFields: false,
      skipOldMessagePreviewFields: false,
    });

    const edges = data.node.messagingInbox.threads.edges ?? [];
    const hasNextPage = data.node.messagingInbox.threads.pageInfo?.hasNextPage ?? false;

    return {
      threads: edges.map(edge => mapThread(edge.node)),
      has_next_page: hasNextPage,
    };
  },
});
