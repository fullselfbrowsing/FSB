import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../yelp-api.js';
import type { BizDetailsPageData } from '../yelp-api.js';

const businessDetailSchema = z.object({
  id: z.string().describe('Yelp encrypted business ID'),
  name: z.string().describe('Business name'),
  url: z.string().describe('Canonical URL of the business page'),
});

export const getBusiness = defineTool({
  name: 'get_business',
  displayName: 'Get Business',
  description:
    'Get details about a specific Yelp business by its URL alias (e.g., "a-slice-of-new-york-san-jose"). Returns the business ID, name, and canonical URL. Use search_businesses to find business aliases.',
  summary: 'Get business details by alias',
  icon: 'store',
  group: 'Businesses',
  input: z.object({
    alias: z
      .string()
      .describe(
        'Business URL alias (e.g., "a-slice-of-new-york-san-jose"). Found in business URLs: yelp.com/biz/{alias}',
      ),
  }),
  output: z.object({ business: businessDetailSchema }),
  handle: async params => {
    const data = await fetchPageData<BizDetailsPageData>(`/biz/${params.alias}`);

    const details = data.legacyProps?.bizDetailsProps;
    const pageProps = details?.bizDetailsPageProps;
    const metaProps = details?.bizDetailsMetaProps;

    return {
      business: {
        id: pageProps?.businessId ?? metaProps?.businessId ?? '',
        name: pageProps?.businessName ?? '',
        url: metaProps?.staticUrl ?? `/biz/${params.alias}`,
      },
    };
  },
});
