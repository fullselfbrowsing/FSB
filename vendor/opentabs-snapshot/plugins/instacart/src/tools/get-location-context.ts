import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getLocationContext } from '../instacart-api.js';
import { locationContextSchema } from './schemas.js';

export const getLocationContextTool = defineTool({
  name: 'get_location_context',
  displayName: 'Get Location Context',
  description:
    'Get the current delivery location context including zone ID, postal code, and coordinates. This context is needed for search and store queries. The data comes from the active session — no API call is made.',
  summary: 'Get current delivery location info',
  icon: 'map',
  group: 'Account',
  input: z.object({}),
  output: z.object({ location: locationContextSchema }),
  handle: async () => {
    const loc = getLocationContext();
    if (!loc) {
      throw ToolError.validation(
        'No delivery location set. The user needs to set a delivery address on Instacart first.',
      );
    }
    return {
      location: {
        zone_id: loc.zoneId,
        postal_code: loc.postalCode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        retailer_count: loc.retailerIds.length,
      },
    };
  },
});
