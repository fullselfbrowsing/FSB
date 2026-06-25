import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawRecording, mapRecording, recordingSchema } from './schemas.js';

export const getRecording = defineTool({
  name: 'get_recording',
  displayName: 'Get Recording',
  description: 'Get a specific call recording by its SID.',
  summary: 'Get Recording',
  icon: 'mic',
  group: 'Recordings',
  input: z.object({
    sid: z.string().describe('Recording SID (e.g., RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: recordingSchema,
  handle: async params => {
    const data = await api<RawRecording>(`/Recordings/${params.sid}.json`);
    return mapRecording(data);
  },
});
