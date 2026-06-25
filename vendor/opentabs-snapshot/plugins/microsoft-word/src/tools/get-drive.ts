import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDrive, driveSchema, mapDrive } from './schemas.js';

export const getDrive = defineTool({
  name: 'get_drive',
  displayName: 'Get Drive',
  description: "Get the current user's OneDrive information including storage quota and drive type.",
  summary: 'Get OneDrive details',
  icon: 'hard-drive',
  group: 'Drive',
  input: z.object({}),
  output: z.object({ drive: driveSchema }),
  handle: async () => {
    const data = await api<RawDrive>('/me/drive');
    return { drive: mapDrive(data) };
  },
});
