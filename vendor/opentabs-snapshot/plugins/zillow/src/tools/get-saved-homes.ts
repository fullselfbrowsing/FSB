import { defineTool, ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserFromSearchResponse } from '../zillow-api.js';

export const getSavedHomes = defineTool({
  name: 'get_saved_homes',
  displayName: 'Get Saved Homes',
  description:
    'Get the list of Zillow property IDs (zpids) that the current user has saved to their favorites. Returns the zpid list and total count. Use search_by_address or search_for_sale with specific zpids to get full property details for saved homes.',
  summary: 'Get saved/favorited home zpids',
  icon: 'heart',
  group: 'Saved Homes',
  input: z.object({}),
  output: z.object({
    saved_home_zpids: z.array(z.string()).describe('Zillow property IDs of saved homes'),
    total: z.number().describe('Total number of saved homes'),
  }),
  handle: async () => {
    const user = await getUserFromSearchResponse();

    if (!user.isLoggedIn) {
      throw ToolError.auth('Not logged in — please log in to Zillow to view saved homes.');
    }

    // savedHomeIds is only available from the full page __NEXT_DATA__, not from the search API response
    const pageUser = getPageGlobal('__NEXT_DATA__.props.pageProps.searchPageState.user') as
      | { savedHomeIds?: string[] }
      | undefined;
    const zpids = pageUser?.savedHomeIds ?? [];

    return {
      saved_home_zpids: zpids,
      total: user.savedHomesCount ?? zpids.length,
    };
  },
});
