import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';

export const deleteRecording = defineTool({
  name: 'delete_recording',
  displayName: 'Delete Recording',
  description: 'Delete a recording by its SID. This action is permanent and cannot be undone.',
  summary: 'Delete Recording',
  icon: 'trash-2',
  group: 'Recordings',
  input: z.object({
    sid: z.string().describe('Recording SID to delete (e.g., RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the recording was successfully deleted'),
  }),
  handle: async params => {
    await api<Record<string, never>>(`/Recordings/${params.sid}.json`, { method: 'DELETE' });
    return { success: true };
  },
});
