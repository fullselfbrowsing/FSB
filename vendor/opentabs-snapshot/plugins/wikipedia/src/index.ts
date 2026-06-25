import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isPageReady, waitForReady } from './wikipedia-api.js';
import { searchArticles } from './tools/search-articles.js';
import { getArticle } from './tools/get-article.js';
import { getArticleSections } from './tools/get-article-sections.js';
import { getSectionContent } from './tools/get-section-content.js';
import { getArticleCategories } from './tools/get-article-categories.js';
import { getArticleLinks } from './tools/get-article-links.js';
import { getArticleLanguages } from './tools/get-article-languages.js';
import { getRevisions } from './tools/get-revisions.js';
import { compareRevisions } from './tools/compare-revisions.js';
import { getRecentChanges } from './tools/get-recent-changes.js';
import { getRandomArticles } from './tools/get-random-articles.js';
import { opensearch } from './tools/opensearch.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserContributions } from './tools/get-user-contributions.js';
import { getCategoryMembers } from './tools/get-category-members.js';
import { getBacklinks } from './tools/get-backlinks.js';
import { getPageViews } from './tools/get-page-views.js';
import { getFeaturedContent } from './tools/get-featured-content.js';
import { getPageSummaryRest } from './tools/get-page-summary-rest.js';

class WikipediaPlugin extends OpenTabsPlugin {
  readonly name = 'wikipedia';
  readonly description = 'OpenTabs plugin for Wikipedia';
  override readonly displayName = 'Wikipedia';
  readonly urlPatterns = ['*://*.wikipedia.org/*'];
  override readonly homepage = 'https://en.wikipedia.org';
  readonly tools: ToolDefinition[] = [
    searchArticles,
    getArticle,
    getPageSummaryRest,
    getArticleSections,
    getSectionContent,
    getArticleCategories,
    getArticleLinks,
    getArticleLanguages,
    getBacklinks,
    getRevisions,
    compareRevisions,
    getRecentChanges,
    getRandomArticles,
    opensearch,
    getCurrentUser,
    getUserContributions,
    getCategoryMembers,
    getPageViews,
    getFeaturedContent,
  ];

  async isReady(): Promise<boolean> {
    // Wikipedia is server-rendered with MediaWiki. The mw.config object is
    // available once the page scripts have run. Most tools work without login
    // (the MediaWiki API is public), so we only require page readiness.
    if (isPageReady()) return true;
    return waitForReady();
  }
}

export default new WikipediaPlugin();
