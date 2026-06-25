import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPerseusProps, normalizeFiverrUsername } from '../fiverr-api.js';
import { mapSellerProfile, type RawSellerProfile, sellerProfileSchema } from './schemas.js';

export const getSellerProfile = defineTool({
  name: 'get_seller_profile',
  displayName: 'Get Seller Profile',
  description:
    'Get a Fiverr seller’s public profile: display name, level, Pro status, country, join date, bio, ' +
    'overall rating, review count, and the gigs listed on their profile. Pass the seller’s username ' +
    '(the first path segment of a gig URL, or the value of `seller_name` from a search result).',
  summary: 'Get a seller’s public profile',
  icon: 'user-round',
  group: 'Sellers',
  input: z.object({
    username: z.string().min(1).describe('Seller username (e.g., "janedoe")'),
  }),
  output: z.object({ seller: sellerProfileSchema }),
  handle: async params => {
    const username = normalizeFiverrUsername(params.username);
    const props = (await fetchPerseusProps(`/${encodeURIComponent(username)}`)) as RawSellerProfile;
    if (!props.seller?.user?.name) {
      throw ToolError.notFound(`No seller profile found for "${username}".`);
    }
    return { seller: mapSellerProfile(props) };
  },
});
