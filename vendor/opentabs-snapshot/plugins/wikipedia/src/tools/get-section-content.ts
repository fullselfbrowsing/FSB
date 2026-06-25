import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';

interface ParseResponse {
  parse?: {
    title?: string;
    text?: string;
  };
  error?: { code?: string; info?: string };
}

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const getSectionContent = defineTool({
  name: 'get_section_content',
  displayName: 'Get Section Content',
  description:
    'Get the plain text content of a specific section of a Wikipedia article. Use get_article_sections first to find section indexes. Section 0 returns the article introduction.',
  summary: 'Read a specific section of an article',
  icon: 'file-text',
  group: 'Articles',
  input: z.object({
    title: z.string().describe('Article title (e.g., "JavaScript")'),
    section: z
      .number()
      .int()
      .min(0)
      .describe('Section index (0 for intro, use get_article_sections to find other indexes)'),
  }),
  output: z.object({
    title: z.string().describe('Canonical article title'),
    section: z.number().int().describe('Section index that was requested'),
    content: z.string().describe('Plain text content of the section'),
  }),
  handle: async params => {
    const data = await api<ParseResponse>({
      action: 'parse',
      page: params.title,
      prop: 'text',
      section: params.section,
      disableeditsection: 1,
      disabletoc: 1,
    });

    if (data.error?.code === 'missingtitle') {
      throw ToolError.notFound(`Article "${params.title}" not found`);
    }
    if (data.error?.code === 'invalidsection') {
      throw ToolError.validation(`Section ${params.section} does not exist in "${params.title}"`);
    }

    const html = data.parse?.text ?? '';
    return {
      title: data.parse?.title ?? params.title,
      section: params.section,
      content: stripHtml(html),
    };
  },
});
