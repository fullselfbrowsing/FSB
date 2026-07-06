import { defineTool, fetchJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface FeaturedResponse {
  tfa?: { title?: string; extract?: string; thumbnail?: { source?: string } };
  mostread?: {
    articles?: Array<{
      title?: string;
      extract?: string;
      views?: number;
      thumbnail?: { source?: string };
    }>;
  };
  onthisday?: Array<{
    text?: string;
    year?: number;
    pages?: Array<{ title?: string }>;
  }>;
}

export const getFeaturedContent = defineTool({
  name: 'get_featured_content',
  displayName: 'Get Featured Content',
  description:
    "Get Wikipedia's featured content for a specific date: Today's Featured Article, most-read articles, and On This Day events. Uses the Wikimedia REST API.",
  summary: "Get today's featured content",
  icon: 'star',
  group: 'Activity',
  input: z.object({
    date: z.string().optional().describe('Date in YYYY/MM/DD format (e.g., "2026/03/09"). Defaults to today.'),
  }),
  output: z.object({
    featured_article: z
      .object({
        title: z.string().describe('Article title'),
        extract: z.string().describe('Article summary'),
        thumbnail: z.string().describe('Thumbnail URL (empty if none)'),
      })
      .describe("Today's Featured Article"),
    most_read: z
      .array(
        z.object({
          title: z.string().describe('Article title'),
          extract: z.string().describe('Article summary'),
          views: z.number().int().describe('View count'),
          thumbnail: z.string().describe('Thumbnail URL (empty if none)'),
        }),
      )
      .describe('Most-read articles (up to 10)'),
    on_this_day: z
      .array(
        z.object({
          text: z.string().describe('Event description'),
          year: z.number().int().describe('Year the event occurred'),
        }),
      )
      .describe('Historical events on this date (up to 5)'),
  }),
  handle: async params => {
    const dateStr = params.date ?? new Date().toISOString().split('T')[0]?.replace(/-/g, '/') ?? '';
    const url = `/api/rest_v1/feed/featured/${dateStr}`;

    const data = await fetchJSON<FeaturedResponse>(url);

    const featured_article = {
      title: data?.tfa?.title ?? '',
      extract: data?.tfa?.extract ?? '',
      thumbnail: data?.tfa?.thumbnail?.source ?? '',
    };

    const most_read = (data?.mostread?.articles ?? []).slice(0, 10).map(a => ({
      title: a.title ?? '',
      extract: a.extract ?? '',
      views: a.views ?? 0,
      thumbnail: a.thumbnail?.source ?? '',
    }));

    const on_this_day = (data?.onthisday ?? []).slice(0, 5).map(e => ({
      text: e.text ?? '',
      year: e.year ?? 0,
    }));

    return { featured_article, most_read, on_this_day };
  },
});
