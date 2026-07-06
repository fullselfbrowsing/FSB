import { defineTool, ToolError, fetchJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SummaryResponse {
  title?: string;
  displaytitle?: string;
  pageid?: number;
  extract?: string;
  extract_html?: string;
  description?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
  originalimage?: { source?: string; width?: number; height?: number };
  content_urls?: {
    desktop?: { page?: string };
    mobile?: { page?: string };
  };
  coordinates?: { lat?: number; lon?: number };
  lang?: string;
  timestamp?: string;
}

export const getPageSummaryRest = defineTool({
  name: 'get_page_summary',
  displayName: 'Get Page Summary',
  description:
    'Get a concise summary of a Wikipedia article using the Wikimedia REST API. Returns a clean extract, description, thumbnail, original image, and desktop/mobile URLs. Lighter than get_article.',
  summary: 'Get a quick article summary',
  icon: 'align-left',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript", "Albert Einstein")'),
  }),
  output: z.object({
    title: z.string().describe('Canonical article title'),
    pageid: z.number().int().describe('Page ID'),
    extract: z.string().describe('Plain text summary of the article'),
    description: z.string().describe('Short Wikidata description'),
    thumbnail: z.string().describe('Thumbnail image URL (empty if none)'),
    original_image: z.string().describe('Full-resolution image URL (empty if none)'),
    url: z.string().describe('Desktop URL'),
    mobile_url: z.string().describe('Mobile URL'),
    timestamp: z.string().describe('Last modification timestamp (ISO 8601)'),
  }),
  handle: async params => {
    const encodedTitle = encodeURIComponent(params.title.replace(/ /g, '_'));
    const url = `/api/rest_v1/page/summary/${encodedTitle}`;

    let data: SummaryResponse | undefined;
    try {
      data = await fetchJSON<SummaryResponse>(url);
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }

    return {
      title: data?.title ?? params.title,
      pageid: data?.pageid ?? 0,
      extract: data?.extract ?? '',
      description: data?.description ?? '',
      thumbnail: data?.thumbnail?.source ?? '',
      original_image: data?.originalimage?.source ?? '',
      url: data?.content_urls?.desktop?.page ?? '',
      mobile_url: data?.content_urls?.mobile?.page ?? '',
      timestamp: data?.timestamp ?? '',
    };
  },
});
