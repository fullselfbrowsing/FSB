import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPerseusProps } from '../fiverr-api.js';
import { gigDetailSchema, mapGigDetail, type RawGigDetail } from './schemas.js';

export const getGigDetails = defineTool({
  name: 'get_gig_details',
  displayName: 'Get Gig Details',
  description:
    'Get full details for a single Fiverr gig: title, description, category, packages (with prices, ' +
    'delivery times, revisions, and features), rating, orders in queue, seller summary, and recent ' +
    'reviews. Pass the gig path from a `search_gigs` result (e.g., "/username/gig-slug"). Reads the ' +
    'gig’s server-rendered page.',
  summary: 'Get full details for a gig',
  icon: 'package',
  group: 'Gigs',
  input: z.object({
    gig_url: z
      .string()
      .min(1)
      .describe('Gig page path or full URL (e.g., "/username/do-something-great" or the absolute URL)'),
  }),
  output: z.object({ gig: gigDetailSchema }),
  handle: async params => {
    const path = params.gig_url.replace(/^https?:\/\/[^/]+/, '');
    if (!path.startsWith('/')) {
      throw ToolError.validation('gig_url must be a Fiverr gig path (starting with "/") or a full Fiverr URL.');
    }
    const props = (await fetchPerseusProps(path)) as RawGigDetail;
    if (!props.general?.gigId) {
      throw ToolError.notFound(`No gig found at ${path}.`);
    }
    return { gig: mapGigDetail(props) };
  },
});
