import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getActivePropertyId } from '../ga-api.js';

export const getActiveProperty = defineTool({
  name: 'get_active_property',
  displayName: 'Get Active Property',
  description:
    'Get the GA4 property ID currently selected in the Google Analytics UI. The property ID is extracted from the URL hash. Returns empty if no property is selected (e.g., on the account admin page). Use this property ID with run_report and other Data API tools.',
  summary: 'Get the currently selected GA4 property',
  icon: 'target',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    property_id: z.string().describe('GA4 property ID (numeric string), or empty if no property is active'),
    url_hash: z.string().describe('Current URL hash fragment'),
  }),
  handle: async () => {
    const propertyId = getActivePropertyId() ?? '';
    const urlHash = typeof window !== 'undefined' ? window.location.hash : '';

    return {
      property_id: propertyId,
      url_hash: urlHash,
    };
  },
});
