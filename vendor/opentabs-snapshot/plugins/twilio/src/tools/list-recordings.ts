import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawRecording, mapRecording, recordingSchema } from './schemas.js';

export const listRecordings = defineTool({
  name: 'list_recordings',
  displayName: 'List Recordings',
  description: 'List call recordings. Optionally filter by the call SID they belong to.',
  summary: 'List Recordings',
  icon: 'mic',
  group: 'Recordings',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of recordings to return per page (default 20, max 1000)'),
    call_sid: z.string().optional().describe('Filter recordings by call SID'),
  }),
  output: z.object({
    recordings: z.array(recordingSchema).describe('Array of recordings'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.call_sid) query.CallSid = params.call_sid;

    const data = await api<{ recordings: RawRecording[] }>('/Recordings.json', { query });
    return { recordings: (data.recordings ?? []).map(mapRecording) };
  },
});
