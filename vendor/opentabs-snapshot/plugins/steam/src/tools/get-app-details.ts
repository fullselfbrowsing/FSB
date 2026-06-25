import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawAppDetails, appDetailsSchema, mapAppDetails } from './schemas.js';

interface AppDetailsResponse {
  [appid: string]: {
    success: boolean;
    data?: RawAppDetails;
  };
}

export const getAppDetails = defineTool({
  name: 'get_app_details',
  displayName: 'Get App Details',
  description:
    'Get detailed information about a Steam app by its ID. Returns name, description, price, platforms, genres, categories, release date, metacritic score, and more. Prices are in cents.',
  summary: 'Get detailed info about a Steam app',
  icon: 'gamepad-2',
  group: 'Store',
  input: z.object({
    appid: z.number().int().describe('Steam app ID (e.g., 730 for Counter-Strike 2)'),
  }),
  output: z.object({
    app: appDetailsSchema,
  }),
  handle: async params => {
    const data = await storeGet<AppDetailsResponse>('/api/appdetails', {
      appids: params.appid,
    });
    const entry = data[String(params.appid)];
    if (!entry?.success || !entry.data) {
      throw ToolError.notFound(`App ${params.appid} not found.`);
    }
    return { app: mapAppDetails(entry.data) };
  },
});
