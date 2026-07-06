import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { fileSchema, mapFile } from './schemas.js';

export const getFileInfo = defineTool({
  name: 'get_file_info',
  displayName: 'Get File Info',
  description: 'Get detailed information about a Slack file including its metadata, file size, and download URL.',
  summary: 'Get file details',
  icon: 'file-text',
  group: 'Files',
  input: z.object({
    file: z.string().describe('File ID (e.g., F1234567890)'),
  }),
  output: z.object({ file: fileSchema }),
  handle: async params => {
    const data = await slackApi<{ file: Record<string, unknown> }>('files.info', {
      file: params.file,
    });
    return { file: mapFile(data.file) };
  },
});
