import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';

const breadcrumbSchema = z.object({
  text: z.string().describe('Breadcrumb display text'),
  url: z.string().describe('Breadcrumb link URL path'),
});

export const getBreadcrumbs = defineTool({
  name: 'get_breadcrumbs',
  displayName: 'Get Breadcrumbs',
  description:
    'Get the location hierarchy (breadcrumbs) for any TripAdvisor page. Returns the trail from country → state → city → location. Useful for discovering parent geo URLs for listing pages.',
  summary: 'Get location hierarchy',
  icon: 'navigation',
  group: 'Navigation',
  input: z.object({
    url: z.string().describe('Any TripAdvisor page URL path (restaurant, hotel, attraction, or city)'),
  }),
  output: z.object({
    breadcrumbs: z.array(breadcrumbSchema).describe('Location hierarchy from root to current'),
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    const breadcrumbsData = findSsrOperation(ssrData, 'breadcrumbsData') as {
      breadcrumbs?: Array<{
        text?: string;
        localizedText?: string;
        url?: string;
      }>;
    } | null;

    const breadcrumbs =
      breadcrumbsData?.breadcrumbs?.map(b => ({
        text: b.localizedText ?? b.text ?? '',
        url: b.url ?? '',
      })) ?? [];

    return { breadcrumbs };
  },
});
