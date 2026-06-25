import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';
import { messageSchema, mapMessage } from './schemas.js';

interface RawThreadData {
  id?: string;
  messageThreadType?: string;
  inboxTitle?: { components?: Array<{ text?: string }> };
  messages?: {
    edges?: Array<{ node: Record<string, unknown> }>;
  };
  participants?: {
    edges?: Array<{
      node?: {
        accountId?: string;
        accountType?: string;
        enrichedParticipantInfo?: { name?: string };
      };
    }>;
  };
  orderedParticipants?: Array<{
    accountId?: string;
    enrichedParticipantInfo?: { name?: string };
  }>;
}

export const getMessageThread = defineTool({
  name: 'get_message_thread',
  displayName: 'Get Message Thread',
  description:
    'Get the full message history of a thread including all messages and participants. Use the thread_id from list_message_threads.',
  summary: 'Get messages in a thread by thread ID',
  icon: 'messages-square',
  group: 'Messages',
  input: z.object({
    thread_id: z.string().min(1).describe('Base64-encoded thread ID (e.g., TWVzc2FnZVRocmVhZDoxNTI5NDg4NDAz)'),
  }),
  output: z.object({
    thread_id: z.string().describe('Thread ID'),
    thread_type: z.string().describe('Thread type'),
    title: z.string().describe('Thread title'),
    messages: z.array(messageSchema).describe('Messages in the thread'),
  }),
  handle: async params => {
    const data = await graphql<{ threadData: RawThreadData }>(
      'ViaductGetThreadAndDataQuery',
      QUERY_HASHES.ViaductGetThreadAndDataQuery,
      {
        numRequestedMessages: 50,
        getThreadState: true,
        getParticipants: true,
        mockThreadIdentifier: null,
        mockMessageTestIdentifier: null,
        getLastReads: true,
        forceUgcTranslation: false,
        isNovaLite: false,
        globalThreadId: params.thread_id,
        mockListFooterSlot: null,
        forceReturnAllReadReceipts: false,
        originType: 'USER_INBOX',
        getInboxFields: true,
        getInboxOnlyFields: false,
        getMessageFields: true,
        getThreadOnlyFields: true,
        skipOldMessagePreviewFields: false,
      },
    );

    const thread = data.threadData;

    const participantMap = new Map<string, string>();
    for (const edge of thread.participants?.edges ?? []) {
      const accountId = edge.node?.accountId;
      const name = edge.node?.enrichedParticipantInfo?.name;
      if (accountId && name) {
        participantMap.set(accountId, name);
      }
    }
    for (const p of thread.orderedParticipants ?? []) {
      const accountId = p.accountId;
      const name = p.enrichedParticipantInfo?.name;
      if (accountId && name) {
        participantMap.set(accountId, name);
      }
    }

    const messages = (thread.messages?.edges ?? []).map(edge => mapMessage(edge.node, participantMap));

    return {
      thread_id: thread.id ?? params.thread_id,
      thread_type: thread.messageThreadType ?? '',
      title: thread.inboxTitle?.components?.map(c => c.text).join('') ?? '',
      messages,
    };
  },
});
