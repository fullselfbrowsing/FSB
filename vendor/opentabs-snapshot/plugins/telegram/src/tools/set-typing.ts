import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputPeer, invokeApi } from '../telegram-api.js';

export const setTyping = defineTool({
  name: 'set_typing',
  displayName: 'Set Typing',
  description:
    'Send a typing indicator to a conversation. The indicator automatically disappears after a few seconds or when a message is sent.',
  summary: 'Show typing indicator in a chat',
  icon: 'keyboard',
  group: 'Conversations',
  input: z.object({
    peer_id: z.number().describe('Peer ID of the conversation'),
    action: z
      .string()
      .optional()
      .describe('Typing action type: "typing" (default), "cancel", "recordAudio", "uploadPhoto", "uploadDocument"'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the typing indicator was sent'),
  }),
  handle: async params => {
    const peer = await getInputPeer(params.peer_id);
    const actionType = params.action ?? 'typing';

    const actionMap: Record<string, string> = {
      typing: 'sendMessageTypingAction',
      cancel: 'sendMessageCancelAction',
      recordAudio: 'sendMessageRecordAudioAction',
      uploadPhoto: 'sendMessageUploadPhotoAction',
      uploadDocument: 'sendMessageUploadDocumentAction',
    };

    await invokeApi<TLObject>('messages.setTyping', {
      peer,
      action: { _: actionMap[actionType] ?? 'sendMessageTypingAction' },
    });

    return { success: true };
  },
});
