'use strict';

/**
 * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- bundled-head handler
 * unit suite (CAT-02). Covers the three T1a imperative handler modules under
 * catalog/handlers/ (github.js, slack.js, notion.js) and the Reddit T1b recipe +
 * the four new descriptors. The router-level T1a dispatch + origin-pin contract is
 * proven separately in tests/capability-router.test.js (with stub handlers); THIS
 * file is the per-handler behavioral gate:
 *
 *   - CAT-02 each T1a handler exposes its declared slugs with tier:'T1a', its
 *     web app's OWN first-party origin (github.com / app.slack.com / app.notion.com),
 *     a sideEffectClass, and an async handle(args, ctx).
 *   - CAT-02 handle(args, ctx) builds a bound spec pinned to the handler origin and
 *     calls ctx.executeBoundSpec EXACTLY ONCE for a single-call read, returning its
 *     result -- it NEVER calls chrome.scripting itself (the origin-pin lives inside
 *     executeBoundSpec; the handler is not a bypass). A stub ctx.executeBoundSpec
 *     records the spec(s) it receives.
 *   - SECURITY (T-29-07): no handler source references a separate-origin API host
 *     (api.github.com / oauth.reddit.com / api.notion.com / slack.com/api on a
 *     non-app origin) and no handler references chrome.scripting/chrome.tabs.
 *   - SECURITY (T-29-08): the Slack handler places the scraped xoxc token in the
 *     request BODY (not a header) and never console-logs a token-bearing variable;
 *     if xoxc is missing it fails closed before POST. The GitHub create handler
 *     fails closed to DOM fallback while its mutation body remains unverified.
 *   - CAT-03 the Reddit T1b recipe (catalog/recipes/reddit-inbox.json) is schema-
 *     valid: origin www.reddit.com, endpoint /message/unread.json, GET,
 *     same-origin-cookie; no oauth.reddit.com host anywhere.
 *   - the four new descriptors are valid JSON carrying the descriptor keys.
 *
 * Zero-framework FSB convention (tests/capability-fetch.test.js +
 * tests/capability-router.test.js): module-level passed/failed counters,
 * synchronous check(cond,msg), process.exit(failed>0?1:0).
 *
 * Run: node tests/capability-head-handlers.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');
const EXT_HANDLERS_DIR = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers');
const RECIPES_DIR = path.join(REPO_ROOT, 'catalog', 'recipes');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function readSource(p) {
  return fs.readFileSync(p, 'utf8');
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseSpecBody(spec) {
  if (!spec || spec.body === undefined || spec.body === null) { return {}; }
  if (typeof spec.body === 'string') {
    try { return JSON.parse(spec.body); } catch (e) { return {}; }
  }
  return spec.body;
}

function hackernewsStoryPageHtml() {
  return [
    '<html><body><table>',
    '<tr class="athing" id="123"><td class="title"><span class="titleline"><a href="https://example.com/story">Example &amp; Story</a><span class="sitebit comhead"> (<a href="from?site=example.com"><span class="sitestr">example.com</span></a>)</span></span></td></tr>',
    '<tr><td class="subtext"><span class="score">42 points</span> by <a class="hnuser" href="user?id=alice">alice</a> <span class="age" title="2026-06-30T12:00:00"><a href="item?id=123">1 hour ago</a></span> | <a href="item?id=123">7 comments</a></td></tr>',
    '<tr class="athing comtr" id="456"><td class="ind"><img src="s.gif" height="1" width="40"></td><td><div class="comment"><span class="comhead"><a class="hnuser" href="user?id=bob">bob</a> <span class="age" title="2026-06-30T12:30:00"><a href="item?id=456">30 minutes ago</a></span></span><div class="commtext">Comment <p>body</p></div></div></td></tr>',
    '<tr class="athing comtr" id="789"><td class="ind"><img src="s.gif" height="1" width="0"></td><td><div class="comment"><span class="comhead"><a class="hnuser" href="user?id=carol">carol</a> <span class="age" title="2026-06-30T12:45:00"><a href="item?id=789">15 minutes ago</a></span></span><div class="commtext">Top-level comment</div></div></td></tr>',
    '</table><a class="morelink" href="news?p=2">More</a></body></html>'
  ].join('');
}

function hackernewsUserPageHtml(username) {
  const u = username || 'pg';
  return [
    '<html><body><table>',
    '<tr><td valign="top">user:</td><td><a href="user?id=' + u + '">' + u + '</a></td></tr>',
    '<tr><td valign="top">created:</td><td>January 1, 2007</td></tr>',
    '<tr><td valign="top">karma:</td><td>12345</td></tr>',
    '<tr><td valign="top">about:</td><td><p>HN profile</p></td></tr>',
    '</table></body></html>'
  ].join('');
}

function defaultHackernewsHtml(url) {
  if (url.indexOf('/user?id=') !== -1) {
    let username = 'pg';
    try { username = new URL(url).searchParams.get('id') || 'pg'; } catch (e) { username = 'pg'; }
    return hackernewsUserPageHtml(username);
  }
  return hackernewsStoryPageHtml();
}

function redditListing(children, after) {
  return {
    kind: 'Listing',
    data: {
      after: after === undefined ? null : after,
      before: null,
      dist: children.length,
      children: children
    }
  };
}

function redditPostData() {
  return {
    id: 'abc123',
    name: 't3_abc123',
    title: 'Reddit T1 fixture',
    author: 'reddit_user',
    subreddit: 'javascript',
    score: 42,
    upvote_ratio: 0.98,
    num_comments: 2,
    url: 'https://www.reddit.com/r/javascript/comments/abc123/reddit_t1_fixture/',
    permalink: '/r/javascript/comments/abc123/reddit_t1_fixture/',
    selftext: 'Fixture body',
    is_self: true,
    created_utc: 1782864000,
    over_18: false,
    stickied: false,
    link_flair_text: 'Discussion'
  };
}

function redditCommentData(id, body, depth) {
  return {
    id: id,
    name: 't1_' + id,
    author: 'commenter_' + id,
    body: body,
    score: 7,
    created_utc: 1782864100,
    parent_id: 't3_abc123',
    depth: depth || 0,
    is_submitter: false,
    stickied: false,
    replies: ''
  };
}

function redditSubredditData(name) {
  return {
    display_name: name || 'javascript',
    title: 'JavaScript',
    public_description: 'JavaScript news and discussion',
    description: 'A fixture subreddit',
    subscribers: 123456,
    active_user_count: 321,
    created_utc: 1200000000,
    over18: false,
    url: '/r/javascript/',
    subreddit_type: 'public'
  };
}

function redditUserData(name) {
  return {
    name: name || 'reddit_user',
    id: 'user-test',
    total_karma: 1234,
    link_karma: 800,
    comment_karma: 434,
    has_verified_email: true,
    is_gold: false,
    is_mod: true,
    created_utc: 1200000000,
    icon_img: 'https://www.redditstatic.com/avatar.png',
    subreddit: { public_description: 'Fixture profile' }
  };
}

function defaultRedditData(url) {
  if (url.indexOf('/comments/') !== -1) {
    const target = redditCommentData('def456', 'Focused comment', 0);
    target.replies = {
      kind: 'Listing',
      data: {
        children: [{ kind: 't1', data: redditCommentData('ghi789', 'Nested reply', 1) }]
      }
    };
    return [
      redditListing([{ kind: 't3', data: redditPostData() }], null),
      redditListing([{ kind: 't1', data: target }], null)
    ];
  }
  if (url.indexOf('/user/me/about.json') !== -1) {
    return { kind: 't2', data: redditUserData('reddit_user') };
  }
  if (url.indexOf('/user/') !== -1 && url.indexOf('/about.json') !== -1) {
    return { kind: 't2', data: redditUserData('spez') };
  }
  if (url.indexOf('/user/') !== -1) {
    return redditListing([{ kind: 't3', data: redditPostData() }], null);
  }
  if (url.indexOf('/about.json') !== -1) {
    return { kind: 't5', data: redditSubredditData('javascript') };
  }
  if (url.indexOf('/api/link_flair_v2.json') !== -1) {
    return [{ id: 'flair-test', text: 'Discussion', text_editable: false }];
  }
  if (url.indexOf('/subreddits/') !== -1) {
    return redditListing([{ kind: 't5', data: redditSubredditData('javascript') }], 'next-subreddit');
  }
  if (url.indexOf('/message/inbox.json') !== -1) {
    return redditListing([{
      kind: 't4',
      data: {
        id: 'msg1',
        name: 't4_msg1',
        author: 'sender',
        subject: 'Hello',
        body: 'Message body',
        dest: 'reddit_user',
        created_utc: 1782864200,
        was_comment: false,
        new: true
      }
    }], null);
  }
  return redditListing([{ kind: 't3', data: redditPostData() }], 'next-post');
}

function xTweetPageHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="FSB Test (@fsb_test) on X: &quot;A public T1 tweet fixture&quot;">',
    '<meta property="og:description" content="A public T1 tweet fixture">',
    '<meta property="og:url" content="https://x.com/fsb_test/status/1234567890">',
    '<meta property="og:image" content="https://pbs.twimg.com/media/test.jpg">',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      url: 'https://x.com/fsb_test/status/1234567890',
      articleBody: 'A public T1 tweet fixture',
      datePublished: '2026-06-30T12:00:00.000Z',
      author: { '@type': 'Person', name: 'FSB Test', alternateName: '@fsb_test' }
    }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function xProfilePageHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="FSB Test (@fsb_test) / X">',
    '<meta property="og:description" content="Public profile fixture for T1 readiness">',
    '<meta property="og:url" content="https://x.com/fsb_test">',
    '<meta property="og:image" content="https://pbs.twimg.com/profile_images/test.jpg">',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'FSB Test',
      alternateName: '@fsb_test',
      description: 'Public profile fixture for T1 readiness',
      url: 'https://x.com/fsb_test'
    }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function defaultXHtml(url) {
  if (/\/status\//.test(url)) return xTweetPageHtml();
  return xProfilePageHtml();
}

function instagramProfilePageHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="FSB Test (@fsb_test) • Instagram photos and videos">',
    '<meta property="og:description" content="1,234 Followers, 56 Following, 78 Posts - Public profile fixture for T1 readiness">',
    '<meta property="og:url" content="https://www.instagram.com/fsb_test/">',
    '<meta property="og:image" content="https://instagram.com/profile.jpg">',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'FSB Test',
      alternateName: '@fsb_test',
      description: 'Public profile fixture for T1 readiness',
      url: 'https://www.instagram.com/fsb_test/'
    }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function instagramPostPageHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="FSB Test on Instagram">',
    '<meta property="og:description" content="42 likes, 7 comments - fsb_test on June 30, 2026: &quot;A public Instagram post fixture&quot;">',
    '<meta property="og:url" content="https://www.instagram.com/p/B/">',
    '<meta property="og:image" content="https://instagram.com/post.jpg">',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      articleBody: 'A public Instagram post fixture',
      author: { '@type': 'Person', name: 'FSB Test', alternateName: '@fsb_test' }
    }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function defaultInstagramHtml(url) {
  if (/\/p\//.test(url)) return instagramPostPageHtml();
  return instagramProfilePageHtml();
}

function tiktokUniversalHtml(scope) {
  return [
    '<html><head>',
    '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">',
    JSON.stringify({ __DEFAULT_SCOPE__: scope }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function tiktokProfilePageHtml() {
  return tiktokUniversalHtml({
    'webapp.user-detail': {
      userInfo: {
        user: {
          id: 'user-test',
          uniqueId: 'fsb_test',
          nickname: 'FSB Test',
          signature: 'Public TikTok profile fixture',
          verified: true,
          avatarLarger: 'https://p16-sign.tiktokcdn-us.com/avatar.jpg',
          privateAccount: false,
          isOrganization: 1,
          secUid: 'SEC_UID_PUBLIC_FIXTURE',
          bioLink: { link: 'https://example.com/fsb' },
          createTime: '1782864000'
        },
        stats: {
          followerCount: 1234,
          followingCount: 56,
          heart: 7890,
          videoCount: 12,
          diggCount: 34,
          friendCount: 5
        }
      }
    }
  });
}

function tiktokVideoPageHtml() {
  return tiktokUniversalHtml({
    'webapp.video-detail': {
      itemInfo: {
        itemStruct: {
          id: '7123456789012345678',
          desc: 'A public TikTok video fixture',
          createTime: '1782864100',
          author: {
            uniqueId: 'fsb_test',
            nickname: 'FSB Test',
            verified: true
          },
          video: {
            duration: 17,
            originCover: 'https://p16-sign.tiktokcdn-us.com/cover.jpg'
          },
          stats: {
            playCount: '1000',
            diggCount: '200',
            commentCount: '30',
            shareCount: '4',
            collectCount: '5'
          },
          music: {
            title: 'Fixture sound',
            authorName: 'Fixture Artist'
          }
        }
      }
    }
  });
}

function defaultTiktokHtml(url) {
  if (/\/video\//.test(url)) return tiktokVideoPageHtml();
  return tiktokProfilePageHtml();
}

function instagramTopsearchData() {
  return {
    users: [{
      user: {
        pk: '100',
        username: 'fsb_test',
        full_name: 'FSB Test',
        profile_pic_url: 'https://instagram.com/profile.jpg',
        is_verified: true
      }
    }],
    hashtags: [{
      hashtag: {
        name: 'fsb',
        media_count: 1234
      }
    }],
    places: [{
      place: {
        location: { pk: '200' },
        title: 'Louisville',
        subtitle: 'Kentucky',
        slug: 'louisville'
      }
    }]
  };
}

function instagramUserSummary() {
  return {
    pk: '100',
    username: 'fsb_test',
    full_name: 'FSB Test',
    profile_pic_url: 'https://instagram.com/profile.jpg',
    is_verified: true,
    is_private: false
  };
}

function instagramUser() {
  return {
    pk: '100',
    username: 'fsb_test',
    full_name: 'FSB Test',
    biography: 'Public profile fixture for T1 readiness',
    profile_pic_url: 'https://instagram.com/profile.jpg',
    follower_count: 1234,
    following_count: 56,
    media_count: 78,
    external_url: 'https://example.com',
    is_verified: true,
    is_private: false
  };
}

function instagramMedia() {
  return {
    pk: '3849123669892697076',
    id: '3849123669892697076_100',
    code: 'B',
    media_type: 1,
    caption: { text: 'A public Instagram post fixture' },
    like_count: 42,
    comment_count: 7,
    taken_at: 1782864000,
    user: instagramUserSummary(),
    image_versions2: { candidates: [{ url: 'https://instagram.com/post.jpg' }] }
  };
}

function facebookHomePageHtml() {
  return [
    '<html><head><title>Test User | Facebook</title></head><body>',
    '<script type="application/json">',
    JSON.stringify({
      require: [['CurrentUserInitialData', [], {
        USER_ID: '123456789',
        NAME: 'Test User',
        SHORT_NAME: 'Test',
        fb_dtsg: 'TOKEN_SHOULD_NOT_LEAK',
        lsd: 'LSD_SHOULD_NOT_LEAK'
      }]]
    }),
    '</script>',
    '</body></html>'
  ].join('');
}

function facebookMarketplaceHtml() {
  return [
    '<html><head><title>Marketplace Search</title></head><body>',
    '<script type="application/json">',
    JSON.stringify({
      marker: 'MarketplaceSearchContentContainer',
      __bbox: {
        result: {
          data: {
            marketplace_search: {
              feed_units: {
                edges: [{
                  node: {
                    listing: {
                      id: 'listing-test',
                      marketplace_listing_title: 'Vintage Desk',
                      listing_price: { formatted_amount: '$80', amount: '80.00' },
                      location: { reverse_geocode: { city: 'Louisville', state: 'KY' } },
                      marketplace_listing_seller: { name: 'Seller Test' },
                      primary_listing_photo: { image: { uri: 'https://scontent.example/desk.jpg' } },
                      is_sold: false,
                      marketplace_listing_category_id: 'furniture'
                    }
                  }
                }]
              }
            }
          }
        }
      }
    }),
    '</script>',
    '</body></html>'
  ].join('');
}

function defaultFacebookHtml(url) {
  if (url.indexOf('/marketplace/search/') !== -1) return facebookMarketplaceHtml();
  return facebookHomePageHtml();
}

function threadsThreadPageHtml() {
  return [
    '<html><head>',
    '<link rel="canonical" href="https://www.threads.net/threads/thread-test">',
    '<meta property="og:title" content="FSB Test (@threads_user) on Threads">',
    '<meta property="og:description" content="A public Threads post fixture">',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      url: 'https://www.threads.net/threads/thread-test',
      articleBody: 'A public Threads post fixture',
      author: { '@type': 'Person', name: 'FSB Test', alternateName: '@threads_user' }
    }),
    '</script>',
    '</head><body></body></html>'
  ].join('');
}

function defaultThreadsData() {
  return {
    thread: {
      id: 'thread-test',
      text: 'A public Threads post fixture',
      author: { username: 'threads_user' },
      replies: [{
        id: 'reply-test',
        text: 'Fixture reply',
        author: { username: 'reply_user' }
      }]
    }
  };
}

function stackoverflowQuestionPageHtml() {
  return [
    '<html itemscope itemtype="https://schema.org/QAPage"><head>',
    '<link rel="canonical" href="https://stackoverflow.com/questions/11227809/branch-prediction-fixture">',
    '<meta name="twitter:title" property="og:title" content="Why is branch prediction faster?">',
    '<meta name="twitter:description" property="og:description" content="Question excerpt">',
    '</head><body>',
    '<div id="question" class="question js-question" data-questionid="11227809" data-score="42" data-author-username="Alice">',
    '<div class="s-prose js-post-body" itemprop="text"><p>Question <code>body</code></p></div>',
    '<a href="/questions/tagged/c%2b%2b" rel="tag">c++</a>',
    '<a href="/questions/tagged/performance" rel="tag">performance</a>',
    '</div>',
    '<div id="answers"><h2 data-answercount="2"><span itemprop="answerCount">2</span></h2></div>',
    '<div id="answer-11227902" class="answer js-answer accepted-answer" data-answerid="11227902" data-parentid="11227809" data-score="99">',
    '<div class="s-prose js-post-body" itemprop="text"><p>Accepted answer body</p></div>',
    '<div itemprop="author"><span itemprop="name">Bob</span></div>',
    '</div>',
    '<div id="answer-11227877" class="answer js-answer" data-answerid="11227877" data-parentid="11227809" data-score="7">',
    '<div class="s-prose js-post-body" itemprop="text"><p>Second answer body</p></div>',
    '<div itemprop="author"><span itemprop="name">Carol</span></div>',
    '</div>',
    '</body></html>'
  ].join('');
}

function stackoverflowQuestionListHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="Newest questions - Stack Overflow">',
    '<meta name="description" content="Public question list fixture">',
    '</head><body>',
    '<div id="question-summary-79971883" class="s-post-summary js-post-summary" data-post-id="79971883">',
    '<span class="s-post-summary--stats-item-number" itemprop="upvoteCount">3</span>',
    '<span class="s-post-summary--stats-item-number" itemprop="answerCount">1</span>',
    '<h3 class="s-post-summary--content-title"><a href="/questions/79971883/example-one">Example question one</a></h3>',
    '<div class="s-post-summary--content-excerpt" itemprop="text">Question one excerpt</div>',
    '<a href="/questions/tagged/javascript" rel="tag">javascript</a>',
    '<div itemprop="author"><span itemprop="name">Dana</span></div>',
    '</div>',
    '<div id="question-summary-79971861" class="s-post-summary js-post-summary has-accepted-answer" data-post-id="79971861">',
    '<span class="s-post-summary--stats-item-number" itemprop="upvoteCount">5</span>',
    '<span class="s-post-summary--stats-item-number" itemprop="answerCount">2</span>',
    '<h3 class="s-post-summary--content-title"><a href="/questions/79971861/example-two">Example question two</a></h3>',
    '<div class="s-post-summary--content-excerpt" itemprop="text">Question two excerpt</div>',
    '<a href="/questions/tagged/node.js" rel="tag">node.js</a>',
    '<div itemprop="author"><span itemprop="name">Evan</span></div>',
    '</div>',
    '<a rel="next" href="/questions?page=2">next</a>',
    '</body></html>'
  ].join('');
}

function stackoverflowTagsHtml() {
  return [
    '<html><head>',
    '<meta property="og:title" content="Tags - Stack Overflow">',
    '<meta name="description" content="Tag browser fixture">',
    '</head><body>',
    '<div id="tags-browser">',
    '<div class="grid--item s-card js-tag-cell d-flex fd-column">',
    '<a href="/questions/tagged/javascript" class="s-tag post-tag" rel="tag">javascript</a>',
    '<div class="flex--item fc-black-500 mb12">Questions about JavaScript.</div>',
    '<div class="flex--item">2,530,830 questions</div>',
    '</div>',
    '<div class="grid--item s-card js-tag-cell d-flex fd-column">',
    '<a href="/questions/tagged/python" class="s-tag post-tag" rel="tag">python</a>',
    '<div class="flex--item fc-black-500 mb12">Questions about Python.</div>',
    '<div class="flex--item">2,201,111 questions</div>',
    '</div>',
    '</div>',
    '</body></html>'
  ].join('');
}

function defaultStackoverflowHtml(url) {
  if (url.indexOf('/tags') !== -1) return stackoverflowTagsHtml();
  if (/\/questions\/\d+/.test(url) || /\/a\/\d+/.test(url)) return stackoverflowQuestionPageHtml();
  return stackoverflowQuestionListHtml();
}

function yelpPageHtml(props) {
  return [
    '<html><body><script>',
    'window.yelp = window.yelp || {}; window.yelp.react_root_props = ',
    JSON.stringify(props || {}),
    '; window.yelp.__ready = true;',
    '</script></body></html>'
  ].join('');
}

function yelpSearchPageHtml() {
  return yelpPageHtml({
    legacyProps: {
      searchAppProps: {
        searchPageProps: {
          mainContentComponentsListProps: {
            'biz-1': {
              bizId: 'biz-id-1',
              searchResultBusiness: {
                alias: 'a-slice-of-new-york-san-jose',
                name: 'A Slice of New York',
                businessUrl: '/biz/a-slice-of-new-york-san-jose',
                rating: 4.5,
                reviewCount: 123,
                phone: '+14085550123',
                priceRange: '$$',
                categories: [{ title: 'Pizza' }],
                neighborhoods: ['North San Jose'],
                formattedAddress: '3443 Stevens Creek Blvd, San Jose, CA',
                isAd: false,
                ranking: 1
              }
            }
          },
          searchContext: {
            totalResults: 1,
            startResult: 0,
            resultsPerPage: 10
          }
        }
      }
    }
  });
}

function yelpBusinessPageHtml() {
  return yelpPageHtml({
    legacyProps: {
      bizDetailsProps: {
        bizDetailsPageProps: {
          businessId: 'biz-id-1',
          businessName: 'A Slice of New York'
        },
        bizDetailsMetaProps: {
          businessId: 'biz-id-1',
          staticUrl: '/biz/a-slice-of-new-york-san-jose'
        }
      }
    }
  });
}

function tripadvisorSsrHtml(entries, ldJson) {
  const results = {};
  let i = 0;
  Object.keys(entries || {}).forEach(function(operationName) {
    const wrapper = {};
    wrapper[operationName] = entries[operationName];
    results[String(++i)] = { data: JSON.stringify(wrapper) };
  });
  const bootstrap = { urqlSsrData: { results: results } };
  const jsonArg = JSON.stringify(bootstrap).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const encoded = encodeURIComponent('window.__WEB_CONTEXT__=JSON.parse("' + jsonArg + '"))');
  const structured = (ldJson || []).map(function(obj) {
    return '<script type="application/ld+json">' + JSON.stringify(obj) + '</script>';
  }).join('');
  return '<html><head>' + structured + '<script src="data:text/javascript,' + encoded + '"></script></head><body></body></html>';
}

function tripadvisorDetailHtml() {
  const ldJson = [
    {
      '@type': 'Restaurant',
      locationId: 123,
      name: 'The Test Bistro',
      url: '/Restaurant_Review-test',
      address: {
        streetAddress: '1 Main St',
        addressLocality: 'Louisville',
        addressRegion: 'KY',
        postalCode: '40202',
        addressCountry: { name: 'United States' }
      },
      geo: { latitude: 38.2527, longitude: -85.7585 },
      telephone: '+15025550123',
      aggregateRating: { ratingValue: 4.7, reviewCount: 88 },
      priceRange: '$$',
      servesCuisine: ['Italian'],
      image: 'https://example.com/restaurant.jpg'
    },
    {
      '@type': 'Hotel',
      locationId: 456,
      name: 'Fixture Hotel',
      url: '/Hotel_Review-test',
      address: { addressLocality: 'Louisville', addressRegion: 'KY' },
      aggregateRating: { ratingValue: 4.4, reviewCount: 44 }
    },
    {
      '@type': 'TouristAttraction',
      locationId: 789,
      name: 'Fixture Attraction',
      url: '/Attraction_Review-test',
      address: { addressLocality: 'Louisville', addressRegion: 'KY' },
      aggregateRating: { ratingValue: 4.8, reviewCount: 55 }
    }
  ];
  return tripadvisorSsrHtml({
    locations: [{
      locationId: 123,
      name: 'The Test Bistro',
      addressObj: { street1: '1 Main St', city: 'Louisville', state: 'KY', postalcode: '40202', country: 'United States' },
      latitude: 38.2527,
      longitude: -85.7585,
      phone: '+15025550123',
      rating: 4.7,
      numReviews: 88,
      priceLevel: '$$',
      cuisine: [{ name: 'Italian' }]
    }],
    reviewSummaryInfo: [{ responseData: { rating: 4.7, count: 88 } }],
    ReviewsProxy_getAiReviewSummaryWeb: [{ summary: 'Guests like the pasta.', positiveThemes: ['service'], negativeThemes: [] }],
    keywords: [{ responseData: { keywords: [{ keyword: 'pasta' }] } }],
    isSaved: [false],
    Opf_getOnPageFactorsForLocale: [{ factors: [{ key: 'MASTHEAD_H1', value: '#1 of 10 Restaurants in Louisville' }] }],
    restaurantSubratingsData: { restaurants: [{ sub_ratings: { food: 4.5, service: 4.6, value: 4.4, atmosphere: 4.3 } }] },
    breadcrumbsData: { breadcrumbs: [{ localizedText: 'Kentucky', url: '/Tourism-g28938-Kentucky-Vacations.html' }] },
    RestaurantPresentation_getBestNearby: { neighborhood: { name: 'Downtown', description: 'Central neighborhood', route: { url: '/Neighborhood-test' } } },
    ReviewsProxy_getReviewListPageForLocation: [{
      totalCount: 1,
      reviews: [{
        id: 901,
        title: 'Excellent',
        text: 'Great meal',
        rating: 5,
        userProfile: { displayName: 'Taylor', hometown: { locationName: 'Chicago' } },
        publishedDate: '2026-06-01'
      }]
    }],
    AttractionsPresentation_searchAttractions: {
      attractions: [{
        locationId: 789,
        name: 'Fixture Attraction',
        route: { webLinkUrl: '/Attraction_Review-test' },
        rating: 4.8,
        reviewCount: 55
      }]
    },
    HotelListPresentation_hotel: {
      hotels: [{
        locationId: 456,
        name: 'Fixture Hotel',
        route: { webLinkUrl: '/Hotel_Review-test' },
        rating: 4.4,
        reviewCount: 44
      }]
    },
    RestaurantShelf_getCoverpageShelvesV3: {
      shelves: [{
        shelves: [{
          items: [{
            locationId: 123,
            name: 'The Test Bistro',
            detailPageRoute: { webLinkUrl: '/Restaurant_Review-test' },
            reviewSummary: { rating: 4.7, count: 88 }
          }]
        }]
      }]
    }
  }, ldJson);
}

function zillowSearchResponse(total) {
  const count = total === undefined ? 42 : total;
  return {
    cat1: {
      searchResults: {
        totalResultCount: count,
        listResults: [{
          zpid: '123456',
          detailUrl: '/homedetails/123456_zpid/',
          statusType: 'FOR_SALE',
          statusText: 'House for sale',
          price: '$525,000',
          unformattedPrice: 525000,
          address: '123 Main St, Louisville, KY 40202',
          addressStreet: '123 Main St',
          addressCity: 'Louisville',
          addressState: 'KY',
          addressZipcode: '40202',
          beds: 3,
          baths: 2,
          area: 1800,
          latLong: { latitude: 38.2527, longitude: -85.7585 },
          imgSrc: 'https://photos.zillowstatic.com/fp/test.jpg',
          zestimate: 530000,
          isSaved: true,
          has3DModel: true,
          hdpData: {
            homeInfo: {
              zpid: 123456,
              homeType: 'SINGLE_FAMILY',
              homeStatus: 'FOR_SALE',
              daysOnZillow: 5,
              rentZestimate: 2600,
              taxAssessedValue: 410000
            }
          }
        }]
      }
    },
    categoryTotals: { cat1: { totalResultCount: count } }
  };
}

function redfinEnvelope(payload, resultCode) {
  return {
    version: 1,
    errorMessage: resultCode ? 'fixture error' : '',
    resultCode: resultCode || 0,
    payload: payload
  };
}

function redfinDefaultData(url) {
  if (url.indexOf('/api-get-header-user-menu') !== -1) {
    return redfinEnvelope({ data: { loginId: 77, firstName: 'Redfin', userPhotoUrl: 'https://www.redfin.com/user.png' } });
  }
  if (url.indexOf('/api-get-favorites') !== -1) {
    return redfinEnvelope({
      onMarket: [{
        property: { id: 1001 },
        address_data: { display: '123 Main St', city: 'Louisville', state: 'KY', zip: '40202' },
        price: 525000,
        beds: 3,
        baths: 2,
        sqft: 1800,
        year_built: 1920,
        URL: '/KY/Louisville/123-Main-St/home/1001',
        favoriteDate: '2026-06-30'
      }],
      offMarket: [{
        id: 1002,
        address_data: { streetAddress: '456 Market St', city: 'Louisville', state: 'KY', zip: '40202' },
        listing: { price: 410000 },
        beds: 2,
        baths: 1,
        sqft: 1200,
        year_built: 1910,
        URL: '/KY/Louisville/456-Market-St/home/1002',
        favoriteDate: '2026-06-29'
      }]
    });
  }
  if (url.indexOf('/location-autocomplete') !== -1) {
    return redfinEnvelope({
      exactMatch: { id: '2_17151', name: 'Louisville', subName: 'Louisville, KY, USA', type: '2', url: '/city/12262/KY/Louisville', active: true },
      sections: [{ rows: [{ id: '6_40202', name: '40202', subName: 'Louisville, KY, USA', type: '6', url: '/zipcode/40202', active: true }] }]
    });
  }
  if (url.indexOf('/api/gis') !== -1) {
    return redfinEnvelope({
      homes: [{
        propertyId: 1001,
        listingId: 2001,
        mlsId: { value: 'MLS-1' },
        streetLine: { value: '123 Main St' },
        city: 'Louisville',
        state: 'KY',
        postalCode: { value: '40202' },
        price: { value: 525000 },
        beds: 3,
        baths: 2,
        sqFt: { value: 1800 },
        lotSize: { value: 5000 },
        yearBuilt: { value: 1920 },
        hoa: { value: 0 },
        pricePerSqFt: { value: 292 },
        dom: { value: 5 },
        propertyType: 6,
        latLong: { value: { latitude: 38.2527, longitude: -85.7585 } },
        url: '/KY/Louisville/123-Main-St/home/1001',
        listingRemarks: 'Fixture listing remarks',
        isHot: true,
        isNewConstruction: false,
        hasVirtualTour: true,
        searchStatus: 9
      }],
      searchMedian: { homePrice: 450000, sqFt: 1700, dom: 8 }
    });
  }
  if (url.indexOf('/aboveTheFold') !== -1) {
    return redfinEnvelope({
      addressSectionInfo: {
        streetAddress: { assembledAddress: '123 Main St' },
        city: 'Louisville',
        state: 'KY',
        zip: '40202',
        beds: 3,
        baths: 2,
        sqFt: { value: 1800 },
        lotSize: 5000,
        yearBuilt: 1920,
        propertyType: 6,
        priceInfo: { label: 'List Price', amount: 525000 },
        avmInfo: { predictedValue: 530000 },
        latLong: { latitude: 38.2527, longitude: -85.7585 },
        url: '/KY/Louisville/123-Main-St/home/1001',
        homeStatusLabel: 'For Sale'
      },
      mediaBrowserInfo: { photos: [{ id: 'photo-1' }, { id: 'photo-2' }] }
    });
  }
  if (url.indexOf('/avm') !== -1) {
    return redfinEnvelope({
      predictedValue: 530000,
      numBeds: 3,
      numBaths: 2,
      sqFt: { value: 1800 },
      streetAddress: { assembledAddress: '123 Main St' },
      comparables: [{ propertyId: 1003, streetAddress: { assembledAddress: '789 Oak St' }, beds: 3, baths: 2, sqFt: { value: 1750 }, lastSoldPrice: { value: 515000 }, predictedValue: 520000 }]
    });
  }
  if (url.indexOf('/belowTheFold') !== -1) {
    return redfinEnvelope({
      amenitiesInfo: {
        totalAmenities: 2,
        superGroups: [{ titleString: 'Interior Features', amenityGroups: [{ groupTitle: 'Rooms', amenityEntries: [{ amenityName: 'Flooring', amenityValues: ['Hardwood'] }] }] }]
      },
      propertyHistoryInfo: { hasPropertyHistory: true, events: [{ eventDateString: 'Jun 30, 2026', eventDescription: 'Listed', price: 525000, priceDisplayLevel: 1, source: 'MLS' }] },
      schoolsAndDistrictsInfo: { totalSchoolsServiced: 1, servingThisHomeSchools: [{ name: 'Fixture Elementary', rating: 8, gradeRanges: 'K-5', schoolType: 'Public', distanceInMiles: 0.4 }] },
      riskFactorData: {
        floodData: { floodFactor: 1, expandableHeading: 'Minimal', expandableSummary: { value: 'Low flood risk' } },
        fireData: { fireFactor: 2, expandableHeading: 'Minor', expandableSummary: { value: 'Low fire risk' } }
      }
    });
  }
  if (url.indexOf('/propertyParcelInfo') !== -1) {
    return redfinEnvelope({ fipsCode: '21111', apn: 'APN-1', latLong: { latitude: 38.2527, longitude: -85.7585 }, timeZone: 'America/Kentucky/Louisville' });
  }
  if (url.indexOf('/comparable-rentals') !== -1) {
    return redfinEnvelope({
      homes: [{ homeData: { propertyId: 'rent-1', url: '/rentals/rent-1', addressInfo: { formattedStreetLine: '321 Rental Ave', city: 'Louisville', state: 'KY', zip: '40202' } }, rentalExtension: { bedRange: { min: 2, max: 3 }, bathRange: { min: 1, max: 2 }, rentPriceRange: { min: 1800, max: 2400 }, description: 'Rental fixture' } }],
      numMatchedHomes: 1
    });
  }
  return redfinEnvelope({});
}

function defaultNotionRecordValue(request) {
  const id = request && request.id ? request.id : 'record-test';
  const table = request && request.table ? request.table : 'block';
  if (table === 'collection') {
    return {
      id: id,
      name: [['Verified database']],
      parent_id: 'collection-view-page-test',
      schema: {
        title: { name: 'Name', type: 'title' },
        status: { name: 'Status', type: 'text' },
        choice: { name: 'Choice', type: 'select', options: [{ id: 'opt-a', value: 'Ready' }] }
      }
    };
  }
  return {
    id: id,
    type: 'page',
    properties: { title: [['Verified title']] },
    content: []
  };
}

function pinterestPinFixture() {
  return {
    id: 'pin-test',
    title: 'Pinned test',
    description: 'Pinterest pin fixture',
    link: 'https://example.invalid/pin',
    images: { orig: { url: 'https://i.pinimg.com/originals/test.jpg' } },
    dominant_color: '#ffffff',
    is_video: false,
    repin_count: 7,
    comment_count: 2,
    pinner: { username: 'fsb_test' },
    board: { name: 'Fixture board' },
    created_at: '2026-06-30T00:00:00Z'
  };
}

function pinterestBoardFixture() {
  return {
    id: 'board-test',
    name: 'Fixture board',
    description: 'Pinterest board fixture',
    url: '/fsb_test/fixture-board/',
    pin_count: 3,
    follower_count: 4,
    section_count: 1,
    privacy: 'public',
    is_collaborative: false,
    created_at: '2026-06-30T00:00:00Z',
    image_cover_url: 'https://i.pinimg.com/board/test.jpg',
    owner: { username: 'fsb_test' }
  };
}

function pinterestUserFixture() {
  return {
    id: 'user-test',
    username: 'fsb_test',
    full_name: 'FSB Test',
    image_xlarge_url: 'https://i.pinimg.com/user/test.jpg',
    follower_count: 123,
    following_count: 45,
    pin_count: 67,
    board_count: 8,
    is_partner: false,
    email: 'fsb@example.invalid',
    country: 'US',
    created_at: '2026-06-30T00:00:00Z'
  };
}

function pinterestResourceEnvelope(payload, bookmark) {
  return {
    resource_response: {
      status: 'success',
      http_status: 200,
      data: payload,
      bookmark: bookmark || 'next-bookmark'
    },
    resource: {
      options: { bookmarks: [bookmark || 'next-bookmark'] }
    }
  };
}

function defaultPinterestData(url, spec) {
  if (url.indexOf('/resource/ApiSResource/create/') !== -1) {
    return {
      resource_response: { status: 'success', http_status: 200, data: null },
      client_context: { user: pinterestUserFixture(), is_authenticated: true }
    };
  }
  if (url.indexOf('/resource/BaseSearchResource/get/') !== -1) {
    let scope = 'pins';
    try {
      const parsed = new URL(url);
      const body = JSON.parse(parsed.searchParams.get('data') || '{}');
      scope = body.options && body.options.scope ? body.options.scope : scope;
    } catch (e) {
      scope = 'pins';
    }
    return pinterestResourceEnvelope({
      results: scope === 'boards' ? [pinterestBoardFixture()] : [pinterestPinFixture()]
    });
  }
  if (url.indexOf('/resource/BoardsResource/get/') !== -1) {
    return pinterestResourceEnvelope([pinterestBoardFixture()]);
  }
  if (url.indexOf('/resource/BoardSectionsResource/get/') !== -1) {
    return pinterestResourceEnvelope([{ id: 'section-test', title: 'Section', pin_count: 2, slug: 'section' }]);
  }
  if (url.indexOf('/resource/UserResource/get/') !== -1) {
    return pinterestResourceEnvelope(pinterestUserFixture());
  }
  if (url.indexOf('/resource/NewsHubBadgeResource/get/') !== -1) {
    return pinterestResourceEnvelope({ total: 1, news: 1, messages: 0 });
  }
  if (url.indexOf('/resource/PinResource/get/') !== -1) {
    return pinterestResourceEnvelope(pinterestPinFixture());
  }
  return pinterestResourceEnvelope([pinterestPinFixture()]);
}

function mediumUserFixture() {
  return {
    id: 'medium-user',
    name: 'Medium User',
    username: 'medium_user',
    bio: 'Medium fixture profile',
    imageId: 'image-test',
    mediumMemberAt: 1782864000000,
    twitterScreenName: 'medium_user',
    membership: { tier: 'MEMBER', id: 'member-test' },
    viewerEdge: { id: 'edge-test', createdAt: 1782864000000 },
    socialStats: { followerCount: 12, followingCount: 5 }
  };
}

function mediumPostFixture() {
  return {
    id: 'post-test',
    title: 'Medium T1 fixture',
    uniqueSlug: 'medium-t1-fixture-post-test',
    mediumUrl: 'https://medium.com/@medium_user/medium-t1-fixture-post-test',
    firstPublishedAt: 1782864000000,
    latestPublishedAt: 1782867600000,
    readingTime: 4.5,
    clapCount: 42,
    voterCount: 7,
    responsesCount: 1,
    isLocked: false,
    visibility: 'PUBLIC',
    creator: { id: 'medium-user', name: 'Medium User', username: 'medium_user', imageId: 'image-test' },
    collection: { id: 'collection-test', name: 'Medium Collection', slug: 'medium-collection' },
    tags: [{ id: 'tag-test', displayTitle: 'JavaScript', normalizedTagSlug: 'javascript' }],
    extendedPreviewContent: { subtitle: 'A fixture subtitle' }
  };
}

function mediumCollectionFixture() {
  return {
    id: 'collection-test',
    name: 'Medium Collection',
    slug: 'medium-collection',
    description: 'Collection fixture',
    subscriberCount: 123,
    domain: '',
    shortDescription: 'Short collection fixture',
    creator: { id: 'medium-user', name: 'Medium User', username: 'medium_user' }
  };
}

function mediumTagFixture() {
  return {
    id: 'tag-test',
    displayTitle: 'JavaScript',
    normalizedTagSlug: 'javascript',
    postCount: 99
  };
}

function defaultMediumData(spec) {
  const body = parseSpecBody(spec);
  const req = Array.isArray(body) ? (body[0] || {}) : body;
  const op = req.operationName || '';
  let data;
  if (op === 'ViewerIdQuery' || op === 'ViewerQuery') {
    data = { viewer: mediumUserFixture() };
  } else if (op === 'UnreadNotificationCount') {
    data = { notificationStatus: { unreadNotificationCount: 3 } };
  } else if (op === 'PostQuery') {
    data = { post: mediumPostFixture() };
  } else if (op === 'PostResponsesQuery') {
    data = {
      post: {
        id: 'post-test',
        postResponses: { count: 1 },
        threadedPostResponses: {
          posts: [mediumPostFixture()],
          pagingInfo: { next: null }
        }
      }
    };
  } else if (op === 'CollectionQuery') {
    data = { collection: mediumCollectionFixture() };
  } else if (op === 'ReadingListQuery') {
    data = {
      getPredefinedCatalog: {
        id: 'catalog-test',
        itemsConnection: {
          items: [{ catalogItemId: 'catalog-item-test', entity: mediumPostFixture() }],
          paging: { count: 1 }
        }
      }
    };
  } else if (op === 'RecommendedPublishersQuery') {
    data = {
      recommendedPublishers: {
        edges: [{ node: mediumUserFixture(), cursor: 'cursor-test' }],
        pageInfo: { hasNextPage: false, endCursor: '' }
      }
    };
  } else if (op === 'TagFeedQuery') {
    data = {
      personalisedTagFeed: {
        items: [{ feedId: 'feed-test', post: mediumPostFixture() }],
        pagingInfo: { next: null }
      }
    };
  } else if (op === 'UserByUsername') {
    data = { userResult: mediumUserFixture() };
  } else if (op === 'FollowersQuery') {
    data = {
      user: {
        id: 'medium-user',
        followersUserConnection: {
          users: [mediumUserFixture()],
          pagingInfo: { next: null }
        }
      }
    };
  } else if (op === 'FollowingQuery') {
    data = {
      user: {
        id: 'medium-user',
        followingUserConnection: {
          users: [mediumUserFixture()],
          pagingInfo: { next: null }
        }
      }
    };
  } else if (op === 'RecommendedTagsQuery') {
    data = { recommendedTags: { edges: [{ node: mediumTagFixture() }] } };
  } else if (op === 'SearchCollectionsQuery') {
    data = { search: { collections: { items: [mediumCollectionFixture()], pagingInfo: { next: null } } } };
  } else if (op === 'SearchTagsQuery') {
    data = { search: { tags: { items: [mediumTagFixture()], pagingInfo: { next: null } } } };
  } else {
    data = { search: { posts: { items: [mediumPostFixture()], pagingInfo: { next: null } } } };
  }
  return [{ data: data }];
}

function defaultDominosData(url, spec) {
  const body = parseSpecBody(spec);
  const op = body.operationName || '';
  if (op === 'PlaceIdByAddress') {
    return {
      data: {
        getPlaceIdByAddress: {
          suggestions: [{
            placeId: 'place-test',
            mainText: '123 Main St',
            secondaryText: 'Louisville, KY'
          }]
        }
      }
    };
  }
  if (op === 'StoresByPlaceId') {
    return {
      data: {
        storesByPlaceId: {
          customerLocation: {
            streetAddress: '123 Main St',
            zipCode: '40202',
            city: 'Louisville',
            state: 'KY'
          },
          stores: [{
            id: '8290',
            storeName: "Domino's Louisville",
            street: '123 Pizza Ave',
            city: 'Louisville',
            region: 'KY',
            postalCode: '40202',
            phone: '502-555-0100',
            latitude: 38.25,
            longitude: -85.75,
            etaMinutes: '25-35',
            estimatedWaitMinutes: '10-15',
            distance: '1.2',
            isOpen: true,
            openLabel: 'Open',
            allowCarsideDelivery: true,
            allowDeliveryOrders: true
          }]
        }
      }
    };
  }
  if (op === 'CategoryV2') {
    return {
      data: {
        categoriesV2: [{
          id: 'Specialty',
          image: 'https://cache.dominos.com/category.jpg',
          isNew: false,
          name: 'Specialty Pizzas'
        }]
      }
    };
  }
  if (op === 'Products') {
    return {
      data: {
        category: {
          name: 'Specialty Pizzas',
          products: [{
            description: 'Handmade pan pizza',
            productType: 'Pizza',
            code: 'S_PIZSC',
            price: 12.99,
            size: 'Medium',
            id: 'prod-test',
            image: 'https://cache.dominos.com/product.jpg',
            isPopular: true,
            name: 'Pacific Veggie',
            maxQuantity: 10,
            isBuildYourOwn: false
          }]
        }
      }
    };
  }
  if (op === 'Product') {
    return {
      data: {
        product: {
          description: 'Handmade pan pizza',
          name: 'Pacific Veggie',
          productType: 'Pizza',
          minQuantity: 1,
          maxQuantity: 10,
          selectedSize: 'Medium',
          sizeLabel: '12" Medium'
        }
      }
    };
  }
  if (op === 'Deal') {
    return {
      data: {
        deal: {
          code: 'DEAL',
          name: 'Mix & Match',
          description: 'Two or more qualifying items',
          image: 'https://cache.dominos.com/deal.jpg',
          visualDescription: 'Two or more'
        }
      }
    };
  }
  return { data: { ok: true } };
}

function defaultAmplitudeData(spec) {
  const body = parseSpecBody(spec);
  const q = String(body.query || '');
  if (q.indexOf('currentUser') !== -1 && q.indexOf('org {') === -1) {
    return { currentUser: { loginId: 'amp@example.invalid', email: 'amp@example.invalid', fullName: 'Amplitude User', orgRole: 4 } };
  }
  if (q.indexOf('org {') !== -1) {
    return {
      apps: [{ id: '101', name: 'Analytics App' }],
      currentUser: { loginId: 'amp@example.invalid', email: 'amp@example.invalid', fullName: 'Amplitude User', orgRole: 4 },
      org: { orgId: '12345', name: 'Amplitude Org', url: 'amplitude-org', plan: 'growth', createdAt: '2026-06-30T00:00:00Z' },
      orgHasAppWithData: true,
      orgCount: 1,
      planInfo: { plan: 'Growth', planType: 'paid' }
    };
  }
  if (q.indexOf('allColorPalettes') !== -1) {
    return { allColorPalettes: [{ id: 'palette-test', name: 'Default', lightModeColors: [], darkModeColors: [], isAmplitudeDefault: true }] };
  }
  if (q.indexOf('getActiveOrgEntitlements') !== -1) {
    return { getActiveOrgEntitlements: [{ type: 'event-volume', source: 'plan', quota: 1000, quotaType: 'monthly' }] };
  }
  if (q.indexOf('orgEventVolumesByMonth') !== -1) {
    return { orgEventVolumesByMonth: [{ intervalStart: '2026-06-01', intervalEnd: '2026-06-30', month: '2026-06', totalEvents: 42 }] };
  }
  if (q.indexOf('orgMTUVolumesByMonth') !== -1) {
    return { orgMTUVolumesByMonth: [{ intervalStart: '2026-06-01', intervalEnd: '2026-06-30', month: '2026-06', totalMTUs: 7 }] };
  }
  if (q.indexOf('orgSessionReplayVolumesByMonth') !== -1) {
    return { orgSessionReplayVolumesByMonth: [{ month: '2026-06', totalSessionReplays: 3, billedSessionReplays: 3 }] };
  }
  if (q.indexOf('personalSpace') !== -1) {
    return { personalSpace: { id: 'space-personal', spaceId: 'space-personal', orgId: '12345', type: 'personal', name: 'Personal', itemCount: 1 } };
  }
  if (q.indexOf('teamSpaces') !== -1) {
    return { teamSpaces: [{ id: 'space-team', spaceId: 'space-team', orgId: '12345', type: 'team', name: 'Team Space', itemCount: 2 }] };
  }
  if (q.indexOf('canAddReport') !== -1) {
    return { canAddReport: true, canSaveChart: true, dashboardCount: 2, savedChartCount: 3, spaceCount: 1, maximumReports: 100 };
  }
  if (q.indexOf('eventProperties') !== -1) {
    return { eventProperties: ['country', 'plan'] };
  }
  if (q.indexOf('orgs') !== -1) {
    return { orgs: [{ id: '12345', name: 'Amplitude Org' }] };
  }
  if (q.indexOf('users') !== -1) {
    return { users: [{ id: 'user-test', loginId: 'amp@example.invalid', email: 'amp@example.invalid', firstName: 'Amplitude', fullName: 'Amplitude User', orgRole: 4 }] };
  }
  if (q.indexOf('unisearchContentSearch') !== -1) {
    return {
      unisearchContentSearch: {
        results: [{
          entity: {
            entityId: '101_chart',
            name: 'Activation',
            type: 'CHART',
            owners: ['amp@example.invalid'],
            isOfficial: false,
            isTemplate: false,
            isArchived: false,
            lastModifiedAt: 1782864000,
            viewCount: 7
          }
        }],
        totalHits: 1
      }
    };
  }
  return { ok: true };
}

function defaultChipotleData(url) {
  if (url.indexOf('/onlineorderingstatus') !== -1) {
    return {
      isOnlineOrderingAvailable: true,
      isDeliveryAvailable: true,
      isGroupOrderAvailable: false,
      isCateringAvailable: true
    };
  }
  if (url.indexOf('/restaurant/v3/restaurant/') !== -1) {
    return {
      restaurantNumber: 1234,
      restaurantName: 'Chipotle Louisville',
      restaurantStatus: 'OPEN',
      distance: 0,
      addresses: [{
        addressType: 'MAIN',
        addressLine1: '123 Burrito Ave',
        addressLine2: '',
        locality: 'Louisville',
        administrativeArea: 'KY',
        postalCode: '40202',
        countryCode: 'US',
        latitude: 38.2527,
        longitude: -85.7585
      }],
      phoneNumber: '502-555-0111',
      onlineOrdering: { onlineOrderingEnabled: true },
      chipotlane: { chipotlanePickupEnabled: true },
      realHours: [{
        dayOfWeek: 'Monday',
        openDateTime: '10:45',
        closeDateTime: '22:00'
      }]
    };
  }
  if (url.indexOf('/onlinemenu') !== -1) {
    return {
      restaurantId: 1234,
      entrees: [{
        itemId: 'CMG-1',
        itemName: 'Chicken Bowl',
        itemType: 'Bowl',
        unitPrice: 10.75,
        baseCalories: 430,
        maxCalories: 750,
        thumbnailUrl: 'https://services.chipotle.com/menu/chicken-bowl.jpg',
        isItemAvailable: true
      }]
    };
  }
  if (url.indexOf('/onlinemeals') !== -1) {
    return [{
      mealId: 'meal-1',
      mealName: 'Build-Your-Own Chicken',
      mealType: 'BuildYourOwn',
      description: 'Choose rice, beans, salsa, and toppings'
    }];
  }
  return {};
}

function defaultPandaExpressData(url) {
  if (url.indexOf('/restaurants/near') !== -1) {
    return {
      restaurants: [{
        id: 4226,
        name: 'Panda Express Louisville',
        slug: 'louisville-hurstbourne-px',
        streetaddress: '123 Wok Ave',
        city: 'Louisville',
        state: 'KY',
        zip: '40202',
        telephone: '502-555-0199',
        latitude: 38.2527,
        longitude: -85.7585,
        distance: 1.25,
        isavailable: true,
        isopen: true,
        candeliver: false,
        canpickup: true,
        deliveryfee: '0',
        extref: '4226'
      }]
    };
  }
  if (url.indexOf('/restaurants/byslug/') !== -1) {
    return {
      id: 4226,
      name: 'Panda Express Louisville',
      slug: 'louisville-hurstbourne-px',
      streetaddress: '123 Wok Ave',
      city: 'Louisville',
      state: 'KY',
      zip: '40202',
      telephone: '502-555-0199',
      latitude: 38.2527,
      longitude: -85.7585,
      distance: 0,
      isavailable: true,
      isopen: true,
      candeliver: false,
      canpickup: true,
      deliveryfee: '0',
      extref: '4226'
    };
  }
  if (url.indexOf('/restaurants/byref/') !== -1) {
    return {
      restaurants: [{
        id: 4226,
        name: 'Panda Express Louisville',
        slug: 'louisville-hurstbourne-px',
        city: 'Louisville',
        extref: '4226',
        isavailable: true,
        isopen: true,
        canpickup: true
      }]
    };
  }
  if (url.indexOf('/restaurants/4226/menu') !== -1) {
    return {
      imagepath: 'https://www.pandaexpress.com/images/menu/',
      categories: [{
        id: 11,
        name: 'Bigger Plates',
        description: 'Two entrees and a side',
        products: [{
          id: 901,
          name: 'Orange Chicken Bowl',
          description: 'Crispy chicken tossed in orange sauce',
          cost: 10.5,
          basecalories: '490',
          maxcalories: '980',
          images: [{ filename: 'orange-chicken.jpg' }]
        }]
      }]
    };
  }
  if (url.indexOf('/products/901/modifiers') !== -1) {
    return {
      optiongroups: [{
        id: 51,
        description: 'Step 1',
        mandatory: true,
        options: [{
          id: 710,
          name: 'Chow Mein',
          cost: 0,
          isdefault: true
        }]
      }]
    };
  }
  return {};
}

function defaultGrubhubData(url) {
  if (url.indexOf('/v1/restaurants/') !== -1) {
    return {
      restaurant: {
        id: 'rest-test',
        name: 'Grubhub Fixture Kitchen',
        cuisine: 'Pizza',
        rating: 4.6,
        delivery_fee: '$2.99',
        delivery_estimate: '25-35 min',
        is_open: true,
        menu: [{
          id: 'item-test',
          name: 'Fixture Slice',
          price: 12.5,
          description: 'A test menu item'
        }]
      }
    };
  }
  if (url.indexOf('/v1/orders') !== -1) {
    return {
      orders: [{
        id: 'order-test',
        status: 'active',
        restaurant_name: 'Grubhub Fixture Kitchen',
        total: 24.75,
        placed_at: '2026-07-01T12:00:00Z'
      }]
    };
  }
  if (url.indexOf('/v1/restaurants') !== -1) {
    return {
      restaurants: [{
        id: 'rest-test',
        name: 'Grubhub Fixture Kitchen',
        cuisine: 'Pizza',
        rating: 4.6,
        delivery_fee: '$2.99',
        delivery_estimate: '25-35 min',
        is_open: true
      }]
    };
  }
  return {};
}

function defaultLucidData(url) {
  if (url.indexOf('/users/lucid-user/permissions') !== -1) {
    return { permissions: ['document.read'] };
  }
  if (url.indexOf('/accounts/lucid-account/userList') !== -1) {
    return ['https://users.lucid.app/users/lucid-user'];
  }
  if (url.indexOf('/accounts/lucid-account') !== -1) {
    return {
      uri: 'https://users.lucid.app/accounts/lucid-account',
      name: 'Lucid Account',
      size: 1,
      created: '2026-06-30T00:00:00Z'
    };
  }
  if (url.indexOf('/groups') !== -1) {
    return [{ id: 1, name: 'Diagram Team', users: ['lucid-user'] }];
  }
  if (url.indexOf('/documentList') !== -1) {
    return {
      documents: [{
        id: 'doc-test',
        Document: { id: 'doc-test', title: 'Roadmap', product_id: 0, pages: 2 },
        Creator: { email: 'lucid@example.invalid' },
        starred: true
      }]
    };
  }
  if (url.indexOf('/documents/doc-test/pages') !== -1) {
    return [{ id: '0_0', index: 0, title: 'Page 1' }];
  }
  if (url.indexOf('/documents/doc-test/role') !== -1) {
    return 'editor';
  }
  if (url.indexOf('/documents/doc-test/status') !== -1) {
    return { documentId: 'doc-test', statusDefinitionId: 0, actionHistoryLength: 2 };
  }
  if (url.indexOf('/documents/doc-test') !== -1) {
    return {
      uri: 'https://documents.lucid.app/documents/doc-test',
      title: 'Roadmap',
      product: 'chart',
      pages: 2
    };
  }
  if (url.indexOf('/users/lucid-user/documents/chart/count') !== -1) {
    return { count: 3 };
  }
  if (url.indexOf('/users/lucid-user/documents/chart') !== -1) {
    return [{ uri: 'https://documents.lucid.app/documents/doc-test', title: 'Roadmap' }];
  }
  if (url.indexOf('/users/lucid-user/folderEntries/entry-test') !== -1) {
    return { id: 7, name: 'Team Docs', entryType: 'folder' };
  }
  if (url.indexOf('/users/lucid-user/folderEntries/chart') !== -1) {
    return [{ id: 7, name: 'Team Docs', entryType: 'folder' }];
  }
  if (url.indexOf('/users/lucid-user') !== -1) {
    return {
      uri: 'https://users.lucid.app/users/lucid-user',
      email: 'lucid@example.invalid',
      firstName: 'Lucid',
      lastName: 'User',
      active: true
    };
  }
  return { id: 'lucid-test' };
}

function targetRawProduct(tcin, title) {
  const id = tcin || '85978618';
  const name = title || 'Target T1 Fixture Product';
  return {
    tcin: id,
    item: {
      product_description: {
        title: name,
        downstream_description: '<p>Fixture product description</p>',
        bullet_descriptions: ['<B>Feature one</B>', 'Feature two']
      },
      primary_brand: { name: 'Target Fixture Brand' },
      enrichment: { images: { primary_image_url: 'https://target.scene7.com/fixture.jpg' } }
    },
    price: { formatted_current_price: '$19.99' },
    ratings_and_reviews: {
      statistics: {
        rating: { average: 4.7, count: 321 },
        review_count: 321
      }
    }
  };
}

function targetPageData() {
  return {
    props: {
      pageProps: {
        data: {
          search: {
            products: [
              targetRawProduct('85978618', 'Target T1 Fixture Product'),
              targetRawProduct('11112222', 'Second Target Fixture Product')
            ],
            search_response: {
              typed_metadata: { total_results: 2 }
            }
          },
          product: targetRawProduct('85978618', 'Target T1 Fixture Product')
        }
      }
    }
  };
}

function defaultTargetHtml() {
  return '<html><body><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify(targetPageData()) +
    '</script></body></html>';
}

function walmartSearchItem(usItemId, name) {
  return {
    usItemId: usItemId || '13943258180',
    name: name || 'Walmart T1 Fixture Product',
    brand: 'Walmart Fixture Brand',
    priceInfo: {
      linePriceDisplay: '$24.98',
      currentPrice: { price: 24.98, priceString: '$24.98' },
      wasPrice: '$29.98'
    },
    averageRating: 4.5,
    numberOfReviews: 123,
    imageInfo: { thumbnailUrl: 'https://i5.walmartimages.com/fixture.jpg' },
    canonicalUrl: '/ip/item/' + (usItemId || '13943258180'),
    availabilityStatusV2: { value: 'IN_STOCK', display: 'In stock' },
    fulfillmentBadge: '2-day shipping',
    sellerName: 'Walmart.com',
    snapEligible: true
  };
}

function walmartProductPageData() {
  return {
    props: {
      pageProps: {
        initialData: {
          searchResult: {
            count: 2,
            paginationV2: { maxPage: 4 },
            itemStacks: [{
              items: [
                walmartSearchItem('13943258180', 'Walmart T1 Fixture Product'),
                walmartSearchItem('222333444', 'Second Walmart Fixture Product')
              ]
            }]
          },
          data: {
            product: {
              usItemId: '13943258180',
              name: 'Walmart T1 Fixture Product',
              brand: 'Walmart Fixture Brand',
              shortDescription: '<p>Short fixture description</p>',
              canonicalUrl: '/ip/item/13943258180',
              priceInfo: {
                currentPrice: { price: 24.98, priceString: '$24.98' },
                wasPrice: '$29.98'
              },
              averageRating: 4.5,
              numberOfReviews: 123,
              imageInfo: {
                thumbnailUrl: 'https://i5.walmartimages.com/fixture.jpg',
                allImages: [{ url: 'https://i5.walmartimages.com/fixture-large.jpg' }]
              },
              availabilityStatusV2: { value: 'IN_STOCK' },
              sellerDisplayName: 'Walmart.com',
              sellerId: '0',
              type: 'REGULAR',
              upc: '123456789012',
              category: { path: [{ name: 'Home' }, { name: 'Paper' }] },
              fulfillmentLabel: [{ message: 'Pickup today' }, { message: 'Delivery tomorrow' }],
              snapEligible: true,
              returnPolicy: { returnPolicyText: 'Free 90-day returns' }
            },
            idml: {
              longDescription: '<p>Long fixture description</p>',
              specifications: [{ name: 'Count', value: '<b>12</b>' }],
              productHighlights: [{ name: 'Feature', value: 'Strong' }]
            },
            reviews: {
              roundedAverageOverallRating: 4.5,
              totalReviewCount: 123,
              recommendedPercentage: 88,
              ratingValueFiveCount: 90,
              ratingValueFourCount: 20,
              ratingValueThreeCount: 8,
              ratingValueTwoCount: 3,
              ratingValueOneCount: 2,
              customerReviews: [{
                reviewTitle: 'Useful',
                reviewText: 'Works well',
                rating: 5,
                userNickname: 'fixture_user',
                reviewSubmissionTime: '2026-07-01',
                positiveFeedback: 7,
                negativeFeedback: 1
              }]
            }
          },
          initialDataNodeDetail: {
            data: {
              nodeDetail: {
                id: '5435',
                displayName: 'Walmart Supercenter Fixture',
                name: 'Walmart Supercenter',
                phoneNumber: '555-0100',
                open24Hours: false,
                address: {
                  addressLineOne: '123 Fixture Ave',
                  city: 'Louisville',
                  state: 'KY',
                  postalCode: '40202'
                },
                operationalHours: [
                  { day: 'MONDAY', start: '06:00', end: '23:00', closed: false },
                  { day: 'SUNDAY', closed: true }
                ],
                services: [{ name: 'PHARMACY', displayName: 'Pharmacy', phone: '555-0101' }]
              }
            }
          }
        }
      }
    }
  };
}

function defaultWalmartHtml() {
  return '<html><body><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify(walmartProductPageData()) +
    '</script></body></html>';
}

function costcoCatalogData(itemNumber, name) {
  const item = itemNumber || '4000369340';
  return {
    itemNumber: item,
    itemId: 'item-' + item,
    buyable: 1,
    programTypes: 'ShipIt,InWarehouse',
    priceData: { price: '1299.99000', listPrice: '1499.99000' },
    attributes: [{ key: 'Brand', value: 'Costco Fixture Brand' }],
    description: {
      shortDescription: name || ('Costco Fixture Product ' + item),
      marketingStatement: '$200 OFF',
      promotionalStatement: '<p>Member savings</p>',
      auxDescription2: '<ul><li>Feature one</li></ul>'
    },
    additionalFieldData: {
      rating: '4.6',
      numberOfRating: 217,
      membershipReqd: 1,
      maxItemOrderQty: '5'
    },
    fieldData: { mfName: 'Costco Fixture Brand', imageName: 'fixture-image.jpg' }
  };
}

function costcoFulfillmentData(itemNumber) {
  return {
    itemNumber: itemNumber || '4000369340',
    warehouseNumber: '847',
    channel: 'ShipIt',
    currency: 'USD',
    price: 1199.99,
    listPrice: 1499.99,
    shippingInfo: { fulfillmentMethods: ['ShipIt'], externalCarrier: 1 }
  };
}

function costcoInventoryData(itemNumber) {
  return {
    itemNumber: itemNumber || '4000369340',
    programTypes: {
      siteControlledInventory: { availability: 'INSTOCK', fulfillmentCenter: 'fc-test' },
      inWarehouse: { availability: 'LOWSTOCK', fulfillmentCenter: 'wh-test' },
      useWarehouseInventory: {
        availability: 'INSTOCK',
        buyable: true,
        orderCutOff: '2026-07-01T20:00:00Z',
        orderPickup: '2026-07-02T10:00:00Z',
        maxUnitsAvailable: 4
      },
      '3rdPartyDelivery': { availability: 'NOSTOCK', fulfillmentCenter: 'tp-test' }
    }
  };
}

function defaultCostcoData(url, spec) {
  if (url === 'https://ecom-api.costco.com/ebusiness/product/v1/products/graphql') {
    const body = parseSpecBody(spec);
    const query = String(body.query || '');
    const itemMatch = query.match(/itemNumbers:\s*\[([^\]]*)\]/);
    const itemNumbers = itemMatch
      ? itemMatch[1].split(',').map((s) => s.replace(/["\s]/g, '')).filter(Boolean)
      : ['4000369340'];
    return {
      data: {
        products: {
          catalogData: itemNumbers.map((item) => costcoCatalogData(item)),
          fulfillmentData: itemNumbers.map((item) => costcoFulfillmentData(item))
        }
      }
    };
  }
  if (url === 'https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch') {
    const body = parseSpecBody(spec);
    const itemNumbers = Array.isArray(body.itemNumbers) && body.itemNumbers.length
      ? body.itemNumbers
      : ['4000369340'];
    return itemNumbers.map((item) => costcoInventoryData(item));
  }
  return {};
}

function instacartVariables(url) {
  try {
    const raw = new URL(url).searchParams.get('variables') || '{}';
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function instacartCart(id) {
  const cartId = id || 'cart-test';
  return {
    id: cartId,
    itemCount: 2,
    cartType: 'grocery',
    updatedAt: '2026-07-01T12:00:00Z',
    retailer: { id: 'retailer-test', name: 'Instacart Fixture Market' },
    shop: { id: 'shop-test' },
    cartItemCollection: {
      cartItems: [{
        id: 'cart-item-test',
        quantity: 2,
        quantityType: 'each',
        basketProduct: {
          id: 'items_shop-test-product-test',
          productId: 'product-test',
          v4ItemId: 'items_shop-test-product-test',
          name: 'Fixture Bananas',
          thumbnailImageUrl: 'https://www.instacart.com/image/banana.jpg',
          viewSection: { primaryImage: { url: 'https://www.instacart.com/image/banana-primary.jpg' } }
        }
      }]
    }
  };
}

function instacartOrder(id) {
  return {
    id: id || 'order-test',
    status: 'delivered',
    retailer: { name: 'Instacart Fixture Market' },
    createdAt: '2026-06-30T12:00:00Z',
    viewSection: { totalString: '$42.17', itemCountString: '3 items' },
    orderItems: { totalCount: 3 }
  };
}

function defaultInstacartData(url) {
  const vars = instacartVariables(url);
  if (url.indexOf('operationName=CurrentUser') !== -1) {
    return {
      data: {
        currentUser: {
          id: 'user-test',
          email: 'instacart@example.invalid',
          firstName: 'Insta',
          lastName: 'Cart',
          fullName: 'Insta Cart',
          guest: false,
          ordersCount: 7,
          viewSection: {
            avatarImage: { url: 'https://www.instacart.com/avatar.jpg' },
            customerSinceString: 'Customer since April 2020'
          }
        }
      }
    };
  }
  if (url.indexOf('operationName=UserAddresses') !== -1) {
    return {
      data: {
        userAddresses: [{
          id: 'address-test',
          streetAddress: '123 Market St',
          apartmentNumber: 'Unit 4',
          postalCode: '94105',
          coordinates: { latitude: 37.789, longitude: -122.394 },
          instructions: 'Leave at door',
          viewSection: { cityStateString: 'San Francisco, CA' }
        }]
      }
    };
  }
  if (url.indexOf('operationName=PersonalActiveCarts') !== -1) {
    return { data: { userCarts: { carts: [instacartCart('cart-test')] } } };
  }
  if (url.indexOf('operationName=CartData') !== -1) {
    return { data: { userCart: instacartCart(vars.id || 'cart-test') } };
  }
  if (url.indexOf('operationName=OrderDeliveriesConnection') !== -1) {
    return {
      data: {
        orderDeliveriesConnection: {
          nodes: [instacartOrder('order-test')],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-next' }
        }
      }
    };
  }
  if (url.indexOf('operationName=OrderDelivery') !== -1) {
    return { data: { orderDelivery: instacartOrder(vars.id || 'order-test') } };
  }
  return { data: {} };
}

function defaultUbereatsData(url) {
  if (url.indexOf('/eats/v1/restaurants/') !== -1 && url.indexOf('/menu') !== -1) {
    return {
      menu: [{
        item_id: 'item-test',
        name: 'Fixture Burger',
        price: 12.5,
        description: 'Burger fixture',
        image_url: 'https://www.ubereats.com/image/burger.jpg',
        category: 'Entrees'
      }]
    };
  }
  if (url.indexOf('/eats/v1/orders') !== -1) {
    return {
      orders: [{
        id: 'order-test',
        status: 'completed',
        restaurant_name: 'Uber Eats Fixture Kitchen',
        total: '$24.50',
        total_value: 24.5,
        created_at: '2026-06-30T12:00:00Z',
        item_count: 2
      }]
    };
  }
  if (url.indexOf('/eats/v1/restaurants') !== -1) {
    return {
      restaurants: [{
        id: 'restaurant-test',
        name: 'Uber Eats Fixture Kitchen',
        cuisine: 'Burgers',
        rating: 4.7,
        delivery_time: '25-35 min',
        delivery_fee: '$2.49',
        image_url: 'https://www.ubereats.com/image/restaurant.jpg'
      }]
    };
  }
  return {};
}

function doordashOrder(id) {
  return {
    id: id || 'order-test',
    orderUuid: 'uuid-' + (id || 'order-test'),
    deliveryUuid: 'delivery-test',
    createdAt: '2026-06-30T12:00:00Z',
    submittedAt: '2026-06-30T12:05:00Z',
    cancelledAt: null,
    fulfilledAt: '2026-06-30T12:45:00Z',
    isGroup: false,
    isGift: false,
    isPickup: false,
    isRetail: false,
    fulfillmentType: 'delivery',
    isReorderable: true,
    creator: { id: 'consumer-test', firstName: 'Door', lastName: 'Dash' },
    deliveryAddress: { id: 'address-test', formattedAddress: '123 Market St' },
    store: { id: 'store-test', name: 'DoorDash Fixture Kitchen', business: { id: 'business-test', name: 'Fixture Foods' }, phoneNumber: '502-555-0100' },
    orders: [{
      id: 'suborder-test',
      items: [{
        id: 'item-test',
        name: 'Fixture Bowl',
        quantity: 2,
        specialInstructions: 'No onions',
        originalItemPrice: 1299,
        purchaseQuantity: { discreteQuantity: { quantity: 2, unit: 'item' } }
      }]
    }],
    paymentCard: { id: 'card-test', last4: '4242', type: 'Visa' },
    grandTotal: { unitAmount: 2788, currency: 'USD', displayString: '$27.88' }
  };
}

function defaultDoorDashData(spec) {
  const body = parseSpecBody(spec);
  const op = body.operationName || '';
  if (op === 'consumer') {
    return {
      data: {
        consumer: {
          id: 'consumer-test',
          userId: 'user-test',
          firstName: 'Door',
          lastName: 'Dash',
          email: 'doordash@example.invalid',
          phoneNumber: '+15025550100',
          timezone: 'America/New_York',
          defaultCountry: 'US',
          isGuest: false,
          defaultAddress: {
            id: 'address-test',
            addressId: 'address-id-test',
            street: '123 Market St',
            city: 'Louisville',
            state: 'KY',
            zipCode: '40202',
            printableAddress: '123 Market St, Louisville, KY 40202',
            shortname: 'Home'
          }
        }
      }
    };
  }
  if (op === 'getAvailableAddresses') {
    return {
      data: {
        getAvailableAddresses: [{
          id: 'address-test',
          addressId: 'address-id-test',
          street: '123 Market St',
          city: 'Louisville',
          subpremise: 'Apt 2',
          state: 'KY',
          zipCode: '40202',
          country: 'United States',
          countryCode: 'US',
          lat: 38.25,
          lng: -85.75,
          timezone: 'America/New_York',
          shortname: 'Home',
          printableAddress: '123 Market St, Louisville, KY 40202',
          driverInstructions: 'Leave at door'
        }]
      }
    };
  }
  if (op === 'getConsumerOrdersWithDetails') {
    return { data: { getConsumerOrdersWithDetails: [doordashOrder('order-test')] } };
  }
  if (op === 'getPaymentMethodList') {
    return {
      data: {
        getPaymentMethodList: [{
          id: 'payment-test',
          isDefault: true,
          type: 'Visa',
          last4: '4242',
          expYear: '2030',
          expMonth: '12',
          metadata: { isDashCard: false, isHsaFsaCard: false, paypalAccount: null }
        }]
      }
    };
  }
  if (op === 'getHasNewNotifications') {
    return {
      data: {
        getHasNewNotifications: {
          hasNewNotifications: true,
          numUnreadNotifications: 3
        }
      }
    };
  }
  return { data: {} };
}

function homeDepotOperation(spec) {
  const body = parseSpecBody(spec);
  return body.operationName || '';
}

function homeDepotProduct(itemId) {
  const id = itemId || '312610058';
  return {
    itemId: id,
    identifiers: {
      itemId: id,
      productLabel: 'Home Depot Fixture Drill ' + id,
      brandName: 'Fixture Brand',
      modelNumber: 'HD-' + id,
      storeSkuNumber: '1000' + id,
      parentId: 'parent-' + id,
      canonicalUrl: '/p/fixture-product/' + id
    },
    details: { description: 'Cordless drill fixture description' },
    media: { images: [{ url: 'https://images.homedepot-static.com/fixture.jpg' }] },
    pricing: { value: 79.97, original: 99.97, unitOfMeasure: 'each' },
    reviews: { ratingsReviews: { averageRating: '4.6', totalReviews: '128' } },
    availabilityType: { type: 'Online', discontinued: false },
    fulfillment: { fulfillmentOptions: [{ type: 'pickup' }, { type: 'delivery' }] }
  };
}

function homeDepotStore() {
  return {
    storeId: '121',
    storeName: 'Fixture Home Depot',
    phone: '555-0100',
    address: {
      street: '123 Orange Ave',
      city: 'Louisville',
      state: 'KY',
      postalCode: '40202'
    },
    storeHours: {
      monday: { open: '06:00', close: '22:00' }
    }
  };
}

function homeDepotCartItem() {
  return {
    id: 'cart-line-test',
    quantity: 2,
    fulfillmentType: 'BOPIS',
    product: {
      itemId: '312610058',
      identifiers: {
        productLabel: 'Home Depot Fixture Drill',
        brandName: 'Fixture Brand',
        canonicalUrl: '/p/fixture-product/312610058'
      },
      pricing: { value: 79.97, total: 159.94 },
      media: { images: [{ url: 'https://images.homedepot-static.com/cart.jpg' }] }
    }
  };
}

function defaultHomeDepotData(url, spec) {
  const op = homeDepotOperation(spec);
  if (op === 'searchModel') {
    return {
      data: {
        searchModel: {
          searchReport: { totalProducts: 2, keyword: 'cordless drill' },
          products: [homeDepotProduct('312610058'), homeDepotProduct('205440279')]
        }
      }
    };
  }
  if (op === 'productClientOnlyProduct') {
    return { data: { product: homeDepotProduct('312610058') } };
  }
  if (op === 'storeSearch') {
    return { data: { storeSearch: [homeDepotStore()] } };
  }
  if (op === 'getCart') {
    const body = parseSpecBody(spec);
    if (String(body.query || '').indexOf('items {') !== -1) {
      return { data: { cartInfo: { items: [homeDepotCartItem()] } } };
    }
    return {
      data: {
        cartInfo: {
          cartId: 'cart-test',
          itemCount: 1,
          totals: {
            total: 159.94,
            totalWithNoDiscount: 179.94,
            totalDiscount: 20,
            deliveryCharge: 0
          },
          localization: {
            primaryStoreId: '121',
            deliveryZip: '40202',
            deliveryStateCode: 'KY'
          }
        }
      }
    };
  }
  if (op === 'getAllSaveForLaterItems') {
    return {
      data: {
        saveForLaterList: {
          itemCount: 1,
          items: [{
            quantity: 1,
            product: {
              media: { images: [{ url: 'https://images.homedepot-static.com/saved.jpg' }] },
              identifiers: {
                itemId: '205440279',
                canonicalUrl: '/p/saved-product/205440279',
                brandName: 'DEWALT',
                productLabel: 'Saved Fixture Drill',
                modelNumber: 'DCD771C2',
                storeSkuNumber: '100005440',
                productType: 'MERCHANDISE'
              },
              pricing: { original: 129, value: 99, total: 99 }
            }
          }]
        }
      }
    };
  }
  return { data: {} };
}

function defaultHomeDepotHtml() {
  return '<html><script>window.__EXPERIENCE_CONTEXT__={"store":{"storeId":"121","storeName":"Fixture Home Depot","storeZip":"40202"},"deliveryZip":"40203"};</script></html>';
}

function defaultChatgptData(url) {
  if (url.indexOf('/backend-api/conversations/search') !== -1) {
    return {
      items: [{
        conversation_id: 'conversation-test',
        title: 'ChatGPT Search Result',
        update_time: 1782864000,
        is_archived: false,
        is_starred: true,
        payload: { snippet: 'Search snippet' }
      }],
      cursor: 'cursor-next'
    };
  }
  if (url.indexOf('/backend-api/conversations') !== -1) {
    return {
      items: [{
        id: 'conversation-test',
        title: 'ChatGPT T1 Fixture',
        create_time: '2026-06-30T00:00:00.000Z',
        update_time: '2026-06-30T00:10:00.000Z',
        is_archived: false,
        is_starred: true,
        gizmo_id: 'g-test',
        snippet: 'Fixture snippet'
      }],
      total: 1
    };
  }
  if (url.indexOf('/backend-api/conversation/') !== -1) {
    return {
      conversation_id: 'conversation-test',
      title: 'ChatGPT T1 Fixture',
      create_time: 1782864000,
      update_time: 1782864600,
      is_archived: false,
      is_starred: true,
      default_model_slug: 'gpt-5',
      current_node: 'msg-2',
      mapping: {
        root: { children: ['msg-1'] },
        'msg-1': {
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            content: { content_type: 'text', parts: ['Hello'] },
            metadata: { model_slug: '' },
            create_time: 1782864000
          },
          children: ['msg-2']
        },
        'msg-2': {
          message: {
            id: 'msg-2',
            author: { role: 'assistant' },
            content: { content_type: 'text', parts: ['Hi from ChatGPT'] },
            metadata: { model_slug: 'gpt-5' },
            create_time: 1782864300
          },
          children: []
        }
      }
    };
  }
  if (url.indexOf('/backend-api/models') !== -1) {
    return {
      models: [{ slug: 'gpt-5', title: 'GPT-5', max_tokens: 128000, tags: ['chat'], enabled_tools: ['python'] }],
      default_model_slug: 'gpt-5'
    };
  }
  if (url.indexOf('/backend-api/accounts/check/') !== -1) {
    return {
      accounts: {
        'account-test': {
          entitlement: { subscription_plan: 'chatgptplusplan' },
          features: ['memory'],
          is_paid: true
        }
      },
      account_ordering: ['account-test']
    };
  }
  if (url.indexOf('/backend-api/settings/beta_features') !== -1) {
    return { beta_tool: true, disabled_tool: false };
  }
  if (url.indexOf('/backend-api/user_system_messages') !== -1) {
    return {
      enabled: true,
      about_user_message: 'Likes concise answers',
      about_model_message: 'Be direct'
    };
  }
  if (url.indexOf('/backend-api/gizmos/discovery') !== -1) {
    return {
      cuts: [{
        info: { title: 'Featured' },
        list: { items: [{ resource: { gizmo: { id: 'g-test', display: { name: 'Test GPT', description: 'Fixture GPT' }, short_url: 'https://chatgpt.com/g/g-test', author: { display_name: 'OpenAI' }, num_interactions: 10, tags: ['productivity'], created_at: '2026-06-30T00:00:00Z', updated_at: '2026-06-30T00:00:00Z' } } }] }
      }]
    };
  }
  if (url.indexOf('/backend-api/gizmos/') !== -1) {
    return {
      gizmo: {
        id: 'g-test',
        display: { name: 'Test GPT', description: 'Fixture GPT' },
        short_url: 'https://chatgpt.com/g/g-test',
        author: { display_name: 'OpenAI' },
        num_interactions: 10,
        tags: ['productivity'],
        created_at: '2026-06-30T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z'
      }
    };
  }
  if (url.indexOf('/backend-api/memories') !== -1) {
    return {
      memories: [{ id: 'memory-test', content: 'Remembered item', created_at: 1782864000, updated_at: 1782864600 }],
      memory_max_tokens: 1200,
      memory_num_tokens: 32
    };
  }
  if (url.indexOf('/backend-api/prompt_library/') !== -1) {
    return {
      items: [{ id: 'prompt-test', title: 'Summarize', description: 'Summarize text', prompt: 'Summarize this', category: 'Writing' }]
    };
  }
  if (url.indexOf('/backend-api/shared_conversations') !== -1) {
    return {
      items: [{ id: 'shared-test', title: 'Shared Chat', create_time: '2026-06-30T00:00:00.000Z', update_time: '2026-06-30T00:10:00.000Z' }],
      total: 1
    };
  }
  if (url.indexOf('/backend-api/me') !== -1) {
    return {
      id: 'user-test',
      email: 'chatgpt@example.invalid',
      name: 'ChatGPT User',
      picture: 'https://chatgpt.com/avatar.png',
      country: 'US',
      created: 1782864000
    };
  }
  return {};
}

function starbucksBootstrapState() {
  return {
    user: {
      accountProfile: {
        data: {
          firstName: 'Star',
          lastName: 'Bucks',
          email: 'starbucks@example.invalid',
          exId: 'external-test',
          subMarket: 'US',
          birthMonth: 9,
          birthDay: 29,
          loyaltyProgram: {
            cardHolderSince: '2020-01-01',
            progress: { starBalance: 125, starsToNextGoal: 25 },
            programName: 'MSR5_USA'
          }
        }
      }
    },
    svcCards: {
      data: [{
        cardId: 'card-test',
        cardNumber: '4111111111111111',
        nickname: 'Primary',
        balance: { amount: 12.34, currency: 'USD' },
        isPrimary: true,
        isDigital: true,
        cardImageUrl: 'https://www.starbucks.com/card.png'
      }]
    },
    ordering: {
      cart: {
        current: {
          '34833/iced:Grande': {
            product: { name: 'Latte', productNumber: 34833, formCode: 'iced', imageURL: 'https://www.starbucks.com/latte.png' },
            size: { name: 'Grande', sku: 'sku-test' },
            sizeCode: 'Grande',
            quantity: 2
          }
        }
      }
    },
    wallet: {
      data: {
        paymentInstruments: [{
          paymentType: 'VISA',
          paymentInstrumentId: 'pm-test',
          nickname: 'Visa',
          accountNumberLastFour: '1111',
          cardIssuer: 'VISA',
          instrumentStatusCode: 'Active'
        }]
      }
    },
    rewards: {
      loyaltyProfile: {
        data: {
          progress: { starBalance: 125, starsToNextGoal: 25 },
          cardHolderSince: '2020-01-01',
          rewards: [{ code: '25', description: 'Customize a drink', totalStarsToEarn: 25, available: true }]
        }
      }
    },
    accrualEarnRates: {
      data: {
        SVC: { standardEarnRate: 2, employeeEarnRate: 3 },
        VISA: { standardEarnRate: 1, employeeEarnRate: 1 }
      }
    }
  };
}

function defaultStarbucksData(url, spec) {
  if (url.indexOf('/apiproxy/v1/locations') !== -1) {
    return [{
      distance: 1.2,
      isFavorite: true,
      store: {
        id: 'store-id-test',
        storeNumber: '53646-283069',
        name: 'Starbucks Louisville',
        phoneNumber: '502-555-0100',
        open: true,
        openStatusFormatted: 'Open',
        hoursStatusFormatted: 'Open today',
        address: { singleLine: '123 Coffee St, Louisville, KY', city: 'Louisville', countrySubdivisionCode: 'KY', postalCode: '40202' },
        coordinates: { latitude: 38.25, longitude: -85.75 },
        ownershipTypeCode: 'CO',
        amenities: [{ name: 'Mobile Order and Pay' }],
        mobileOrdering: { availability: 'READY' }
      }
    }];
  }
  if (url.indexOf('/apiproxy/v1/ordering/menu') !== -1) {
    return { menus: [{ id: 'drinks', name: 'Drinks', children: [{ id: 'espresso', name: 'Espresso', products: [{ productNumber: 34833 }] }] }] };
  }
  if (url.indexOf('/apiproxy/v1/ordering/') !== -1) {
    return { products: [{ productNumber: 34833, name: 'Iced Latte', formCode: 'iced', description: 'Espresso and milk', imageURL: 'https://www.starbucks.com/latte.png', starCost: 200, productType: 'beverage' }] };
  }
  if (url.indexOf('/apiproxy/v1/stream-items') !== -1) {
    return {
      paging: { total: 1 },
      streamItems: [{
        streamItemId: 'stream-test',
        streamItemType: 'Information',
        startDate: '2026-06-30',
        endDate: '2026-07-01',
        rank: 1,
        content: { item: { title: 'Summer drink', body: 'Try this', image: 'https://www.starbucks.com/drink.png', calltoactiontext: 'Order', calltoactionlink: '/menu' } }
      }]
    };
  }
  if (url.indexOf('/apiproxy/v1/orchestra/') !== -1) {
    const body = parseSpecBody(spec);
    const op = body.operationId || '';
    if (op === 'get-favorite-products') {
      return { data: { favoriteProducts: [{ id: 'fav-test', productNumber: 34833, name: 'Iced Latte', formCode: 'iced', sizeCode: 'Grande' }] } };
    }
    if (op === 'get-previous-orders') {
      return { data: { previousOrders: [{ orderId: 'order-test', storeName: 'Starbucks Louisville', storeNumber: '53646-283069', orderDate: '2026-06-30', orderTotal: '$6.25', basket: { items: [{ name: 'Iced Latte', quantity: 1 }] } }] } };
    }
    if (op === 'get-store-time-slots') {
      return { data: { storeByNumber: { scheduledOrdering: { slots: [{ time: '2026-06-30T15:00:00Z', display: '3:00 PM', available: true }], mobileOrderAvailability: 'READY' } } } };
    }
    if (op === 'price-order') {
      return {
        data: {
          priceOrder: {
            cart: { items: [{ label: 'Iced Latte', quantity: 1, priceLabel: '$6.25', price: 6.25, calories: '150 Calories', masterImageUrl: 'https://www.starbucks.com/latte.png' }] },
            summary: { priceLabel: '$6.25', lineItems: [{ key: 'subtotal', priceLabel: '$6.25' }, { key: 'tax', priceLabel: '$0.00' }] },
            orderId: 'price-order-test',
            expiresIn: 300
          }
        }
      };
    }
  }
  return starbucksBootstrapState();
}

function bookingSearchHtml() {
  const property = {
    basicPropertyData: {
      id: 4242,
      accommodationTypeId: 204,
      pageName: 'galt-house-hotel',
      location: {
        address: '140 N Fourth St',
        city: 'Louisville',
        countryCode: 'us',
        latitude: 38.257,
        longitude: -85.755
      },
      photos: {
        main: {
          highResUrl: { relativeUrl: '/images/hotel/galt-house.jpg' }
        }
      },
      reviews: {
        totalScore: 8.6,
        reviewsCount: 1234,
        totalScoreTextTag: { translation: 'Excellent' }
      },
      starRating: { value: 4 }
    },
    displayName: { text: 'Galt House Hotel' },
    location: {
      displayLocation: 'Downtown Louisville',
      mainDistance: '0.2 miles from center'
    },
    geniusInfo: { discount: true },
    priceDisplayInfoIrene: {
      displayPrice: {
        amountPerStay: {
          amount: '$250',
          currency: 'USD'
        }
      }
    }
  };
  const cache = {
    ROOT_QUERY: {
      autoCompleteSuggestions: {
        __typename: 'AutoCompleteSuggestions',
        results: [{
          destId: '20025329',
          destType: 'CITY',
          label: 'Louisville, Kentucky, United States',
          city: 'Louisville',
          country: 'United States',
          region: 'Kentucky',
          imageUrl: 'https://q-xx.bstatic.com/louisville.jpg'
        }]
      },
      searchQueries: {
        'search({"ss":"Louisville"})': {
          results: [property],
          pagination: { nbResultsTotal: 1, nbResultsPerPage: 25 },
          breadcrumbs: [
            { destId: 'us', destType: 'COUNTRY', name: 'United States' },
            { destId: 'ky', destType: 'REGION', name: 'Kentucky' },
            { destId: '20025329', destType: 'CITY', name: 'Louisville' }
          ],
          destinationLocation: {
            destId: '20025329',
            destType: 'CITY',
            name: 'Louisville'
          }
        }
      }
    }
  };
  return '<html><head><title>Booking fixture</title></head><body><script type="application/json">' +
    JSON.stringify(cache) +
    '</script></body></html>';
}

function defaultStubhubData(url) {
  if (url.indexOf('/search/catalog/events') !== -1) {
    return {
      events: [{
        id: 'event-1',
        name: 'Louisville Cardinals Football',
        eventDate: '2026-09-05',
        venue: { name: 'L and N Stadium', city: 'Louisville' },
        lowestPrice: { amount: 42.5, currency: 'USD' },
        url: '/event/louisville-cardinals-football/event-1'
      }]
    };
  }
  if (url.indexOf('/inventory/listings/') !== -1) {
    return {
      listing: {
        id: 'listing-1',
        price: { amount: 42.5, currency: 'USD' },
        section: '101',
        row: 'A',
        quantity: 2,
        event: { id: 'event-1', name: 'Louisville Cardinals Football' },
        url: '/listing/listing-1'
      }
    };
  }
  if (url.indexOf('/orders') !== -1) {
    return {
      orders: [{
        id: 'order-1',
        status: 'upcoming',
        event: { id: 'event-1', name: 'Louisville Cardinals Football' },
        listing: { id: 'listing-1' },
        quantity: 2,
        total: { amount: 85, currency: 'USD' },
        orderDate: '2026-07-01T00:00:00Z'
      }]
    };
  }
  return {};
}

function defaultNewrelicData(spec) {
  const body = parseSpecBody(spec);
  const op = body.operationName || '';
  if (op === 'NewRelicCurrentUser') {
    return {
      actor: {
        user: { id: 101, name: 'New Relic User', email: 'nr@example.invalid' },
        accounts: [{ id: 123, name: 'Production' }],
        organization: { id: 'org-test', name: 'Example Org' }
      }
    };
  }
  if (op === 'NewRelicOrganization') {
    return { actor: { organization: { id: 'org-test', name: 'Example Org' } } };
  }
  if (op === 'NewRelicListAccounts') {
    return { currentUser: { accounts: [{ id: 123, name: 'Production' }] } };
  }
  if (op === 'SearchEntities') {
    return {
      actor: {
        entitySearch: {
          count: 1,
          results: {
            nextCursor: null,
            entities: [{
              guid: 'entity-guid',
              name: 'Checkout Service',
              type: 'APPLICATION',
              domain: 'APM',
              entityType: 'APM_APPLICATION_ENTITY',
              alertSeverity: 'NOT_ALERTING',
              reporting: true,
              permalink: 'https://one.newrelic.com/entity/entity-guid',
              tags: [{ key: 'team', values: ['platform'] }]
            }]
          }
        }
      }
    };
  }
  if (op === 'GetEntity') {
    return {
      actor: {
        entity: {
          guid: 'entity-guid',
          name: 'Checkout Service',
          type: 'APPLICATION',
          domain: 'APM',
          entityType: 'APM_APPLICATION_ENTITY',
          tags: [{ key: 'team', values: ['platform'] }]
        }
      }
    };
  }
  if (op === 'GetDashboard') {
    return {
      actor: {
        entity: {
          guid: 'dashboard-guid',
          name: 'Service Health',
          description: 'Dashboard fixture',
          permissions: 'PUBLIC_READ_ONLY',
          owner: { email: 'owner@example.invalid' },
          createdAt: '2026-06-30T00:00:00Z',
          updatedAt: '2026-06-30T01:00:00Z',
          pages: [{ guid: 'page-guid', name: 'Overview', widgets: [{ id: 'widget-1', title: 'Latency', visualization: { id: 'viz.line' } }] }]
        }
      }
    };
  }
  if (op === 'ListDashboards') {
    return {
      actor: {
        entitySearch: {
          results: {
            nextCursor: null,
            entities: [{
              guid: 'dashboard-guid',
              name: 'Service Health',
              permissions: 'PUBLIC_READ_ONLY',
              owner: { email: 'owner@example.invalid' },
              dashboardParentGuid: null,
              tags: []
            }]
          }
        }
      }
    };
  }
  if (op === 'ListPolicies') {
    return {
      actor: {
        account: {
          alerts: {
            policiesSearch: {
              policies: [{ id: 'policy-1', name: 'Production alerts', incidentPreference: 'PER_POLICY' }],
              totalCount: 1,
              nextCursor: null
            }
          }
        }
      }
    };
  }
  if (op === 'ListNrqlConditions') {
    return {
      actor: {
        account: {
          alerts: {
            nrqlConditionsSearch: {
              nrqlConditions: [{
                id: 'condition-1',
                name: 'High error rate',
                enabled: true,
                policyId: 'policy-1',
                nrql: { query: 'SELECT count(*) FROM Transaction' },
                signal: { aggregationWindow: 60 }
              }],
              nextCursor: null
            }
          }
        }
      }
    };
  }
  if (op === 'ListEntityTags') {
    return { actor: { entity: { tags: [{ key: 'team', values: ['platform'] }] } } };
  }
  if (op === 'ListEventTypes') {
    return { actor: { account: { nrql: { results: [{ eventType: 'Transaction' }, { eventType: 'PageView' }] } } } };
  }
  if (op === 'RunNrql') {
    return {
      actor: {
        account: {
          nrql: {
            results: [{ count: 42 }],
            metadata: { facets: [], timeWindow: { begin: 1782864000000, end: 1782867600000 } }
          }
        }
      }
    };
  }
  return { actor: {} };
}

function defaultGrafanaData(url) {
  if (url.indexOf('/api/search') !== -1) {
    return {
      dashboards: [{
        uid: 'dash-test',
        title: 'Service Health',
        uri: 'db/service-health',
        type: 'dash-db',
        tags: ['platform']
      }]
    };
  }
  if (url.indexOf('/api/dashboards/uid/') !== -1) {
    return {
      dashboard: {
        uid: 'dash-test',
        title: 'Service Health',
        panels: [{ id: 1, title: 'Latency' }],
        templating: { list: [] }
      },
      meta: { canSave: false, folderTitle: 'Observability' }
    };
  }
  if (url.indexOf('/api/ds/query') !== -1) {
    return {
      series: [{
        metric: 'http_requests_total',
        points: 12
      }]
    };
  }
  return { ok: true };
}

function defaultPosthogData(url) {
  if (url.indexOf('/api/users/@me/') !== -1) {
    return { id: 101, uuid: 'user-uuid', email: 'posthog@example.invalid', first_name: 'Post', last_name: 'Hog' };
  }
  if (url.indexOf('/api/organizations/@current/') !== -1) {
    return { id: 'org-test', name: 'PostHog Org', created_at: '2026-07-01T00:00:00Z', membership_level: 15 };
  }
  if (/\/api\/organizations\/[^/]+\/projects\/\d+\//.test(url)) {
    return { id: 42, uuid: 'project-uuid', name: 'Production', api_token: 'phc_TEST', timezone: 'UTC', is_demo: false };
  }
  if (/\/api\/organizations\/[^/]+\/projects\//.test(url)) {
    return { results: [{ id: 42, uuid: 'project-uuid', name: 'Production' }], count: 1, next: null };
  }
  if (url.indexOf('/dashboards/77/') !== -1) {
    return { id: 77, name: 'Growth Dashboard', description: 'Fixture', tiles: [], tags: ['growth'] };
  }
  if (url.indexOf('/feature_flags/88/') !== -1) {
    return { id: 88, key: 'checkout-test', name: 'Checkout Test', active: true };
  }
  if (url.indexOf('/events/') !== -1) {
    return { results: [{ id: 'event-test', event: '$pageview', timestamp: '2026-07-01T00:00:00Z' }], count: 1, next: null };
  }
  if (url.indexOf('/persons/123/') !== -1) {
    return { id: 123, name: 'Visitor', distinct_ids: ['visitor-1'], properties: {} };
  }
  if (url.indexOf('/property_definitions/') !== -1) {
    return { results: [{ id: 'prop-test', name: '$browser', type: 'String' }], count: 1, next: null };
  }
  if (url.indexOf('/event_definitions/') !== -1) {
    return { results: [{ id: 'event-def-test', name: '$pageview', volume_30_day: 10 }], count: 1, next: null };
  }
  return { results: [{ id: 1, name: 'PostHog Item' }], count: 1, next: null };
}

function notebooklmFixtureNotebook() {
  return [null, null, 'notebook-1', 'Launch Notes', null, [1, null, true, null, null, [1782864100], 2, null, [1782864000]]];
}

function notebooklmFixtureProject() {
  return [null, [[['source-1'], 'Source Title', [null, null, null, null, null, null, null, null, 321], [null, 1]]], 'notebook-1', 'Launch Notes', null, [1, null, true, null, null, [1782864100], 2, null, [1782864000]]];
}

function notebooklmBatch(data) {
  return ")]}'\n\n" + JSON.stringify([['wrb.fr', null, JSON.stringify(data), null, null, null]]) + '\n';
}

function defaultNotebooklmBatchText(spec) {
  let rpcid = '';
  try { rpcid = new URL(spec.url).searchParams.get('rpcids') || ''; } catch (e) { rpcid = ''; }
  if (rpcid === 'wXbhsf') {
    return notebooklmBatch([[notebooklmFixtureNotebook()]]);
  }
  if (rpcid === 'rLM1Ne') {
    return notebooklmBatch([notebooklmFixtureProject()]);
  }
  if (rpcid === 'cFji9') {
    return notebooklmBatch([[['outer', ['note-1', 'Note body', [null, null, [1782864200]]]]], [1782864000]]);
  }
  if (rpcid === 'VfAZjd') {
    return notebooklmBatch([[['Fixture summary'], [[['What is covered?', 'Summarize the source']]]], 'guide-1']);
  }
  if (rpcid === 'JFMDGd') {
    return notebooklmBatch([[['notebook@example.invalid', null, null, ['Notebook User', 'https://avatar.example/img.png']]], null, 100, true]);
  }
  if (rpcid === 'hPTbtc') {
    return notebooklmBatch([[['session-1']]]);
  }
  return notebooklmBatch([[]]);
}

// A recording stub ctx.executeBoundSpec: captures the spec(s) a handler builds,
// returns a canned logged-in 200. The handler must never call chrome.* -- it only
// touches this ctx member (the real pin lives in the real executeBoundSpec, proven
// in capability-router.test.js). A GET probe (the from:'response' token scrape) is
// answered with a canned token payload so the SUBSEQUENT mutation/POST spec actually
// carries the scraped token -- this exercises the real body-placement path (the
// handler only embeds a token it successfully scraped). The token strings here are
// synthetic test fixtures, NOT real credentials.
function makeCtx(origin, tabId, opts) {
  const calls = [];
  const options = opts || {};
  const ctxUrl = Object.prototype.hasOwnProperty.call(options, 'url') ? options.url : (origin + '/workspace-test');
  return {
    calls,
    ctx: {
      origin: origin,
      tabId: tabId,
      url: ctxUrl,
      async executeBoundSpec(spec, tid) {
        calls.push({ spec: spec, tabId: tid });
        // Answer a read-only GET probe with a canned token payload (the scrape
        // source) so the handler's next spec carries the token it read. The
        // slack/github GET on their OWN origin is a from:'response' token probe;
        // the gitlab GET on /api/v4 is a real REST read (NOT a probe) -- it must
        // receive a logged-in body so the gitlab logged-out shape guard sees real
        // data (an array for list_*, an id-bearing object for get_*).
        const url = (spec && typeof spec.url === 'string') ? spec.url : '';
        const isGet = spec && spec.method === 'GET';
        const isGitlabRest = isGet && url.indexOf('https://gitlab.com/api/v4') === 0;
        const isNetlifyRest = isGet && url.indexOf('https://app.netlify.com/access-control/bb-api/api/v1') === 0;
        const isBitbucketRest = isGet && url.indexOf('https://bitbucket.org/!api/2.0') === 0;
        const isCircleciRest = isGet && url.indexOf('https://app.circleci.com/api/v2') === 0;
        const isVercelRest = isGet && url.indexOf('https://vercel.com/api') === 0;
        const isRetoolRest = isGet && url.indexOf('https://retool.com/api') === 0;
        const isAsanaRest = isGet && url.indexOf('https://app.asana.com/api/1.0') === 0;
        const isShortcutSlugInfo = isGet && url.indexOf('https://app.shortcut.com/backend/api/private/user/slug-info/') === 0;
        const isShortcutApi = isGet && url.indexOf('https://app.shortcut.com/backend/api/v3') === 0;
        const isShortcutRest = isShortcutSlugInfo || isShortcutApi;
        const isLeetcodeGraphql = spec && spec.method === 'POST' && url === 'https://leetcode.com/graphql/';
        const isMeticulousGraphql = spec && spec.method === 'POST' && url === 'https://app.meticulous.ai/api/graphql';
        const isWikipediaApi = isGet && url.indexOf('https://en.wikipedia.org/w/api.php') === 0;
        const isWikipediaRest = isGet && url.indexOf('https://en.wikipedia.org/api/rest_v1') === 0;
        const isWikipediaRead = isWikipediaApi || isWikipediaRest;
        const isHackernewsHtml = isGet && url.indexOf('https://news.ycombinator.com') === 0;
        const isNpmSpiferack = isGet && url.indexOf('https://www.npmjs.com') === 0;
        const isYelpRead = isGet && url.indexOf('https://www.yelp.com') === 0;
        const isTripadvisorGraphql = spec && spec.method === 'POST' && url === 'https://www.tripadvisor.com/data/graphql/ids';
        const isTripadvisorHtml = isGet && url.indexOf('https://www.tripadvisor.com') === 0;
        const isTripadvisorRead = isTripadvisorGraphql || isTripadvisorHtml;
        const isZillowSearch = spec && spec.method === 'PUT' && url === 'https://www.zillow.com/async-create-search-page-state';
        const isRedfinRead = isGet && url.indexOf('https://www.redfin.com/stingray/') === 0;
        const isBskyAppView = isGet && url.indexOf('https://api.bsky.app/xrpc/') === 0;
        const isXHtml = isGet && url.indexOf('https://x.com') === 0;
        const isInstagramOrigin = isGet && url.indexOf('https://www.instagram.com') === 0;
        const isInstagramSearch = isInstagramOrigin && url.indexOf('/web/search/topsearch/') !== -1;
        const isInstagramHtml = isInstagramOrigin && !isInstagramSearch;
        const isTiktokHtml = isGet && url.indexOf('https://www.tiktok.com') === 0;
        const isFacebookHtml = isGet && url.indexOf('https://www.facebook.com') === 0;
        const isThreadsRead = isGet && url.indexOf('https://www.threads.net') === 0;
        const isStackoverflowHtml = isGet && url.indexOf('https://stackoverflow.com') === 0;
        const isRedditJson = isGet && url.indexOf('https://www.reddit.com') === 0;
        const isStripeOrigin = url.indexOf('https://dashboard.stripe.com') === 0;
        const isStripeApi = isGet && url.indexOf('https://dashboard.stripe.com/v1/') === 0;
        const isStripeBootstrap = isGet && isStripeOrigin && !isStripeApi;
        const isStripeRead = isStripeBootstrap || isStripeApi;
        const isCloudflareOrigin = url.indexOf('https://dash.cloudflare.com') === 0;
        const isCloudflareApi = isCloudflareOrigin && url.indexOf('https://dash.cloudflare.com/api/v4') === 0;
        const isCloudflareGraphql = spec && spec.method === 'POST' && url === 'https://dash.cloudflare.com/api/v4/graphql';
        const isCloudflareBootstrap = isGet && isCloudflareOrigin && !isCloudflareApi;
        const isCloudflareRead = isCloudflareBootstrap || isCloudflareApi || isCloudflareGraphql;
        const isTwilioProjectInfo = isGet && url === 'https://www.twilio.com/console/api/v2/projects/info';
        const isTumblrOrigin = url.indexOf('https://www.tumblr.com') === 0;
        const isTumblrApi = isGet && url.indexOf('https://www.tumblr.com/api/v2') === 0;
        const isTumblrBootstrap = isGet && isTumblrOrigin && !isTumblrApi;
        const isTumblrRead = isTumblrBootstrap || isTumblrApi;
        const isPricelineRead = isGet && url.indexOf('https://www.priceline.com') === 0;
        const isExpediaRead = isGet && url.indexOf('https://www.expedia.com') === 0;
        const isBookingRead = isGet && url.indexOf('https://www.booking.com') === 0;
        const isStubhubRead = isGet && url.indexOf('https://www.stubhub.com') === 0;
        const isMongodbOrigin = url.indexOf('https://cloud.mongodb.com') === 0;
        const isMongodbApi = isGet && /^https:\/\/cloud\.mongodb\.com\/(billing|nds|automation|orgs|activity|user)\//.test(url);
        const isMongodbBootstrap = isGet && isMongodbOrigin && !isMongodbApi;
        const isMongodbRead = isMongodbBootstrap || isMongodbApi;
        const isPinterestResource = url.indexOf('https://www.pinterest.com/resource/') === 0;
        const isStarbucksOrigin = url.indexOf('https://www.starbucks.com') === 0;
        const isStarbucksRead = isStarbucksOrigin && (isGet || spec.method === 'POST');
        const isMediumGraphql = spec && spec.method === 'POST' && url === 'https://medium.com/_/graphql';
        const isDominosGraphql = spec && spec.method === 'POST' && url === 'https://www.dominos.com/api/web-bff/graphql';
        const isChipotleServices = isGet && url.indexOf('https://services.chipotle.com/') === 0;
        const isPandaExpressOlo = isGet && url.indexOf('https://www.pandaexpress.com/') === 0;
        const isGrubhubApi = isGet && url.indexOf('https://www.grubhub.com/v1/') === 0;
        const isLucidBootstrap = isGet && url === 'https://lucid.app/documents';
        const isLucidApi = isGet && (
          url.indexOf('https://users.lucid.app/') === 0 ||
          url.indexOf('https://documents.lucid.app/') === 0 ||
          url.indexOf('https://userdocslist.lucid.app/') === 0
        );
        const isLucidRead = isLucidBootstrap || isLucidApi;
        const isTargetHtml = isGet && url.indexOf('https://www.target.com') === 0;
        const isWalmartHtml = isGet && url.indexOf('https://www.walmart.com') === 0;
        const isCostcoProductApi = spec && spec.method === 'POST' &&
          url === 'https://ecom-api.costco.com/ebusiness/product/v1/products/graphql';
        const isCostcoInventoryApi = spec && spec.method === 'POST' &&
          url === 'https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch';
        const isCostcoEcom = isCostcoProductApi || isCostcoInventoryApi;
        const isInstacartGraphql = isGet && url.indexOf('https://www.instacart.com/graphql') === 0;
        const isUbereatsApi = isGet && url.indexOf('https://www.ubereats.com/eats/v1/') === 0;
        const isHomeDepotGraphql = spec && spec.method === 'POST' &&
          url.indexOf('https://apionline.homedepot.com/federation-gateway/graphql') === 0;
        const isHomeDepotBootstrap = isGet && url.indexOf('https://www.homedepot.com') === 0;
        const isDoorDashGraphql = spec && spec.method === 'POST' && url.indexOf('https://www.doordash.com/graphql/') === 0;
        const isChatgptSession = isGet && url === 'https://chatgpt.com/api/auth/session';
        const isChatgptBackend = isGet && url.indexOf('https://chatgpt.com/backend-api/') === 0;
        const isAmplitudeOrigin = url.indexOf('https://app.amplitude.com') === 0;
        const isAmplitudeGraphql = spec && spec.method === 'POST' && url.indexOf('https://app.amplitude.com/t/graphql/org/') === 0;
        const isAmplitudeBootstrap = isGet && isAmplitudeOrigin && !isAmplitudeGraphql;
        const isAmplitudeRead = isAmplitudeBootstrap || isAmplitudeGraphql;
        const isNewrelicGraphql = spec && spec.method === 'POST' && url === 'https://one.newrelic.com/graphql';
        const isPosthogOrigin = url.indexOf('https://us.posthog.com') === 0;
        const isPosthogApi = isGet && isPosthogOrigin && url.indexOf('/api/') !== -1;
        const isPosthogBootstrap = isGet && isPosthogOrigin && !isPosthogApi;
        const isPosthogRead = isPosthogBootstrap || isPosthogApi;
        const isGrafanaApi = isGet && url.indexOf('https://grafana.com/api/') === 0;
        const isDiscordApi = isGet && url.indexOf('https://discord.com/api/v9') === 0;
        const isNotebooklmOrigin = url.indexOf('https://notebooklm.google.com') === 0;
        const isNotebooklmRpc = spec && spec.method === 'POST' && url.indexOf('https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute') === 0;
        const isNotebooklmRead = isNotebooklmOrigin && (isGet || isNotebooklmRpc);
        const isProbe = isGet && !isGitlabRest && !isNetlifyRest && !isBitbucketRest && !isCircleciRest && !isVercelRest && !isRetoolRest && !isAsanaRest && !isShortcutRest && !isLeetcodeGraphql && !isWikipediaRead && !isHackernewsHtml && !isNpmSpiferack && !isYelpRead && !isTripadvisorRead && !isZillowSearch && !isRedfinRead && !isBskyAppView && !isXHtml && !isInstagramOrigin && !isTiktokHtml && !isFacebookHtml && !isThreadsRead && !isStackoverflowHtml && !isRedditJson && !isStripeRead && !isCloudflareRead && !isTwilioProjectInfo && !isTumblrRead && !isPricelineRead && !isExpediaRead && !isBookingRead && !isStubhubRead && !isMongodbRead && !isPinterestResource && !isStarbucksRead && !isMediumGraphql && !isDominosGraphql && !isChipotleServices && !isPandaExpressOlo && !isGrubhubApi && !isLucidRead && !isTargetHtml && !isWalmartHtml && !isCostcoEcom && !isInstacartGraphql && !isUbereatsApi && !isHomeDepotGraphql && !isHomeDepotBootstrap && !isDoorDashGraphql && !isChatgptSession && !isChatgptBackend && !isAmplitudeRead && !isNewrelicGraphql && !isPosthogRead && !isGrafanaApi && !isDiscordApi && !isNotebooklmRead;
        let text = null;
        if (isProbe && url.indexOf('app.slack.com') !== -1) {
          text = Object.prototype.hasOwnProperty.call(options, 'slackProbeText')
            ? options.slackProbeText
            : '<html><script>window.boot = {"xoxc":"xoxc-TEST-SYNTHETIC"};</script></html>';
        } else if (isProbe && url.indexOf('github.com') !== -1) {
          text = Object.prototype.hasOwnProperty.call(options, 'githubProbeText')
            ? options.githubProbeText
            : '<html><head><meta name="csrf-token" content="csrf-TEST-SYNTHETIC"></head></html>';
        }
        let data;
        let status = 200;
        if (isProbe) {
          data = null;
        } else if (isMongodbBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'mongodbBootstrapText')
            ? options.mongodbBootstrapText
            : '<html><script>window.PARAMS={"appUser":{"id":"user-test","firstName":"Mongo","lastName":"User","emailAddress":"mongo@example.invalid"},"currentGroup":{"id":"group-test"},"currentOrganization":{"id":"org-test"}};</script></html>';
        } else if (isMongodbApi) {
          if (Object.prototype.hasOwnProperty.call(options, 'mongodbData')) {
            data = options.mongodbData;
          } else if (url.indexOf('/billing/plan/') !== -1) {
            data = { planType: 'NDS', planName: 'Atlas', isPaid: true };
          } else if (url.indexOf('/automation/deploymentStatus/') !== -1) {
            data = { isInGoalState: true, automationStatus: { processes: [] } };
          } else if (/\/orgs\/[^/]+\/(users|groups|teams)$/.test(url)) {
            data = [{ id: 'mongo-list-item', name: 'MongoDB List Item' }];
          } else if (/\/orgs\/[^/]+$/.test(url)) {
            data = { id: 'org-test', name: 'MongoDB Org', planType: 'NDS' };
          } else if (/\/nds\/clusters\/[^/]+\/[^/]+$/.test(url)) {
            data = { id: 'cluster-test', name: 'Cluster0', stateName: 'IDLE' };
          } else if (/\/nds\/[^/]+$/.test(url)) {
            data = { id: 'group-test', groupName: 'MongoDB Project', state: 'ACTIVE' };
          } else if (/\/nds\/[^/]+\/userSecurity$/.test(url)) {
            data = { ldap: { authenticationEnabled: false, authorizationEnabled: false }, customerX509: { cas: '' } };
          } else {
            data = [{ id: 'mongo-list-item', name: 'MongoDB List Item' }];
          }
        } else if (isPinterestResource) {
          data = Object.prototype.hasOwnProperty.call(options, 'pinterestData')
            ? options.pinterestData
            : defaultPinterestData(url, spec);
        } else if (isStarbucksRead) {
          data = Object.prototype.hasOwnProperty.call(options, 'starbucksData')
            ? options.starbucksData
            : defaultStarbucksData(url, spec);
        } else if (isMediumGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'mediumData')
            ? options.mediumData
            : defaultMediumData(spec);
        } else if (isDominosGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'dominosData')
            ? options.dominosData
            : defaultDominosData(url, spec);
        } else if (isAmplitudeBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'amplitudeBootstrapText')
            ? options.amplitudeBootstrapText
            : '<html><script>window.intercomSettings={"org_id":"12345"};</script></html>';
        } else if (isAmplitudeGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'amplitudeData')
            ? options.amplitudeData
            : defaultAmplitudeData(spec);
        } else if (isNewrelicGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'newrelicData')
            ? options.newrelicData
            : defaultNewrelicData(spec);
        } else if (isPosthogBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'posthogBootstrapText')
            ? options.posthogBootstrapText
            : '<html><script>window.POSTHOG_APP_CONTEXT={"current_team":{"id":42},"current_project":{"organization_id":"org-test"}};</script></html>';
        } else if (isPosthogApi) {
          data = Object.prototype.hasOwnProperty.call(options, 'posthogData')
            ? options.posthogData
            : defaultPosthogData(url);
        } else if (isGrafanaApi) {
          data = Object.prototype.hasOwnProperty.call(options, 'grafanaData')
            ? options.grafanaData
            : defaultGrafanaData(url);
        } else if (isChipotleServices) {
          data = Object.prototype.hasOwnProperty.call(options, 'chipotleData')
            ? options.chipotleData
            : defaultChipotleData(url);
        } else if (isPandaExpressOlo) {
          data = Object.prototype.hasOwnProperty.call(options, 'pandaexpressData')
            ? options.pandaexpressData
            : defaultPandaExpressData(url);
        } else if (isGrubhubApi) {
          data = Object.prototype.hasOwnProperty.call(options, 'grubhubData')
            ? options.grubhubData
            : defaultGrubhubData(url);
        } else if (isLucidBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'lucidBootstrapText')
            ? options.lucidBootstrapText
            : '<html><script>window.__LUCID_BOOT__={"userId":"lucid-user","accountId":"lucid-account"};</script></html>';
        } else if (isLucidApi) {
          data = Object.prototype.hasOwnProperty.call(options, 'lucidData')
            ? options.lucidData
            : defaultLucidData(url);
        } else if (isTargetHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'targetText')
            ? options.targetText
            : defaultTargetHtml(url);
        } else if (isWalmartHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'walmartText')
            ? options.walmartText
            : defaultWalmartHtml(url);
        } else if (isCostcoEcom) {
          data = Object.prototype.hasOwnProperty.call(options, 'costcoData')
            ? options.costcoData
            : defaultCostcoData(url, spec);
        } else if (isInstacartGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'instacartData')
            ? options.instacartData
            : defaultInstacartData(url);
        } else if (isUbereatsApi) {
          data = Object.prototype.hasOwnProperty.call(options, 'ubereatsData')
            ? options.ubereatsData
            : defaultUbereatsData(url);
        } else if (isHomeDepotGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'homedepotData')
            ? options.homedepotData
            : defaultHomeDepotData(url, spec);
        } else if (isHomeDepotBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'homedepotText')
            ? options.homedepotText
            : defaultHomeDepotHtml();
        } else if (isDoorDashGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'doordashData')
            ? options.doordashData
            : defaultDoorDashData(spec);
        } else if (isDiscordApi) {
          if (Object.prototype.hasOwnProperty.call(options, 'discordData')) {
            data = options.discordData;
          } else if (url.indexOf('/messages/search') !== -1) {
            data = { total_results: 1, messages: [[{ id: 'message-test', content: 'hello from search' }]] };
          } else if (url.indexOf('/messages') !== -1) {
            data = [{ id: 'message-test', content: 'hello from discord' }];
          } else if (url.indexOf('/users/@me/guilds') !== -1) {
            data = [{ id: 'guild-test', name: 'FSB Test Server' }];
          } else if (url.indexOf('/users/@me/channels') !== -1) {
            data = [{ id: 'dm-test', type: 1, recipients: [] }];
          } else if (url.indexOf('/users/') !== -1) {
            data = { id: 'user-test', username: 'discord_user' };
          } else if (url.indexOf('/guilds/') !== -1 && url.indexOf('/channels') !== -1) {
            data = [{ id: 'channel-test', name: 'general' }];
          } else if (url.indexOf('/roles') !== -1) {
            data = [{ id: 'role-test', name: 'Admin' }];
          } else if (url.indexOf('/channels') !== -1 && url.indexOf('/pins') !== -1) {
            data = [{ id: 'message-test', pinned: true }];
          } else if (url.indexOf('/channels') !== -1) {
            data = { id: 'channel-test', name: 'general' };
          } else if (url.indexOf('/guilds/') !== -1) {
            data = { id: 'guild-test', name: 'FSB Test Server' };
          } else {
            data = { id: 'discord-test' };
          }
        } else if (isChatgptSession) {
          data = Object.prototype.hasOwnProperty.call(options, 'chatgptSessionData')
            ? options.chatgptSessionData
            : { accessToken: 'chatgpt-token-synthetic' };
        } else if (isChatgptBackend) {
          data = Object.prototype.hasOwnProperty.call(options, 'chatgptData')
            ? options.chatgptData
            : defaultChatgptData(url);
        } else if (isNotebooklmOrigin && isGet) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'notebooklmBootstrapText')
            ? options.notebooklmBootstrapText
            : '<html><script>var WIZ_global_data = {"SNlM0e":"notebook-at","cfb2h":"notebook-bl","S06Grb":"user-1","oPEP7c":"notebook@example.invalid","FdrFJe":"sid-1"};</script></html>';
        } else if (isNotebooklmRpc) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'notebooklmRpcText')
            ? options.notebooklmRpcText
            : defaultNotebooklmBatchText(spec);
        } else if (isPricelineRead) {
          if (Object.prototype.hasOwnProperty.call(options, 'pricelineData')) {
            data = options.pricelineData;
          } else if (url.indexOf('/svcs/ac/index/flights/') !== -1) {
            data = {
              resultCode: 200,
              searchItems: [{
                id: 'SDF',
                subType: 'AIRPORT',
                displayName: 'Louisville, KY - Louisville Muhammad Ali International Airport (SDF)',
                cityName: 'Louisville',
                stateCode: 'KY',
                countryCode: 'US',
                lat: 38.174,
                lon: -85.736,
                timeZoneName: 'America/Kentucky/Louisville'
              }]
            };
          } else if (url.indexOf('topPOIByCityIdOrCityName') !== -1) {
            data = {
              resultCode: 200,
              searchItems: [{
                id: 'poi-1',
                itemName: 'Churchill Downs',
                type: 'POI',
                cityName: 'Louisville',
                stateCode: 'KY',
                countryCode: 'US',
                countryName: 'United States',
                lat: 38.202,
                lon: -85.771,
                displayLine1: 'Churchill Downs',
                displayLine2: 'Louisville, KY'
              }]
            };
          } else {
            data = {
              resultCode: 200,
              searchItems: [{
                id: '3000035821',
                itemName: 'Louisville',
                type: 'CITY',
                cityName: 'Louisville',
                stateCode: 'KY',
                countryCode: 'US',
                countryName: 'United States',
                lat: 38.254,
                lon: -85.76,
                displayLine1: 'Louisville, KY',
                displayLine2: 'United States'
              }]
            };
          }
        } else if (isExpediaRead) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'expediaText')
            ? options.expediaText
            : '<html><head><title>Expedia search fixture</title></head><body>Search results</body></html>';
        } else if (isBookingRead) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'bookingText')
            ? options.bookingText
            : bookingSearchHtml();
        } else if (isStubhubRead) {
          data = Object.prototype.hasOwnProperty.call(options, 'stubhubData')
            ? options.stubhubData
            : defaultStubhubData(url);
        } else if (isShortcutSlugInfo) {
          data = Object.prototype.hasOwnProperty.call(options, 'shortcutSlugInfoData')
            ? options.shortcutSlugInfoData
            : { id: 'workspace-test', organization2: { id: 'org-test' } };
        } else if (isShortcutApi) {
          const pathOnly = url.split('?')[0];
          if (Object.prototype.hasOwnProperty.call(options, 'shortcutApiData')) {
            data = options.shortcutApiData;
          } else if (pathOnly.indexOf('/member') !== -1) {
            data = { id: 'member-test', name: 'Shortcut User', mention_name: 'shortcut', role: 'admin', workspace2: { url_slug: 'workspace-test' } };
          } else {
            data = [{ id: 1, name: 'Shortcut Item' }];
          }
        } else if (isLeetcodeGraphql) {
          if (Object.prototype.hasOwnProperty.call(options, 'leetcodeData')) {
            data = options.leetcodeData;
          } else {
            const body = parseSpecBody(spec);
            const q = String(body.query || '');
            if (q.indexOf('userStatus') !== -1) {
              data = { userStatus: { userId: 1, username: 'leetcode-user', isSignedIn: true, isPremium: false, notificationStatus: { numUnread: 0 } } };
            } else if (q.indexOf('questionList') !== -1) {
              data = { problemsetQuestionList: { totalNum: 1, data: [{ title: 'Two Sum', titleSlug: 'two-sum' }] } };
            } else if (q.indexOf('questionTopicTags') !== -1) {
              data = { questionTopicTags: { edges: [{ node: { name: 'Array', slug: 'array' } }] } };
            } else if (q.indexOf('favoritesLists') !== -1) {
              data = { favoritesLists: { allFavorites: [{ idHash: 'fav-test', name: 'Favorites', questions: [] }] } };
            } else {
              data = { question: { title: 'Two Sum', titleSlug: 'two-sum' } };
            }
          }
        } else if (isMeticulousGraphql) {
          if (Object.prototype.hasOwnProperty.call(options, 'meticulousData')) {
            data = options.meticulousData;
          } else {
            const body = parseSpecBody(spec);
            const q = String(body.query || '');
            if (q.indexOf('authInfo') !== -1) {
              data = { authInfo: { isSignedIn: true, user: { id: 'user-test', email: 'user@example.invalid', firstName: 'Meticulous', lastName: 'User', isAdmin: false } } };
            } else if (q.indexOf('organizationMemberships') !== -1) {
              data = { organizationMemberships: [{ id: 'membership-test', role: 'admin', createdAt: '2026-06-30T00:00:00Z', user: { id: 'user-test', email: 'user@example.invalid' } }] };
            } else if (q.indexOf('gitHubRepositories') !== -1) {
              data = { gitHubRepositories: [{ id: 'repo-test', name: 'fsb', owner: 'org', url: 'https://github.com/org/fsb', fullName: 'org/fsb' }] };
            } else if (q.indexOf('organizations') !== -1 && q.indexOf('organizationMemberships') === -1) {
              data = { organizations: [{ id: 'org-test', name: 'org', createdAt: '2026-06-30T00:00:00Z' }] };
            } else if (q.indexOf('project(input') !== -1) {
              data = { project: { id: 'project-test', name: 'project', status: 'active', organization: { id: 'org-test', name: 'org' }, pullRequest: { id: 'pr-test', approvalState: 'pending', latestTestRunId: 'run-test' } } };
            } else if (q.indexOf('projects') !== -1) {
              data = { projects: [{ id: 'project-test', name: 'project', status: 'active', organization: { id: 'org-test', name: 'org' } }] };
            } else if (q.indexOf('testRun') !== -1) {
              data = { testRun: { id: 'run-test', status: 'passed', project: { id: 'project-test', name: 'project', organization: { id: 'org-test', name: 'org' } }, stats: { totalScreenshots: 1, totalSessions: 1 }, replayDiffs: [], testCaseResults: [], coverage: { screenshotsComparedWithDiffs: [], screenshotsComparedButWithoutDiffs: [], screenshotsNotCompared: [], numUnmappedFiles: 0 }, pullRequest: { id: 'pr-test' }, sourceCode: 'export default 1;' } };
            } else if (q.indexOf('replaysForProject') !== -1) {
              data = { replaysForProject: [{ id: 'replay-test', status: 'passed', project: { name: 'project', organization: { name: 'org' } } }] };
            } else if (q.indexOf('replay(id') !== -1) {
              data = { replay: { id: 'replay-test', status: 'passed', project: { name: 'project', organization: { name: 'org' } }, screenshotsData: [] } };
            } else if (q.indexOf('sessionsForProject') !== -1) {
              data = { sessionsForProject: [{ id: 'session-test', project: { id: 'project-test', name: 'project', organization: { id: 'org-test', name: 'org' } } }] };
            } else if (q.indexOf('sessionsBySearch') !== -1) {
              data = { sessionsBySearch: [{ id: 'session-test', project: { id: 'project-test', name: 'project', organization: { id: 'org-test', name: 'org' } } }] };
            } else if (q.indexOf('session(id') !== -1) {
              data = { session: { id: 'session-test', project: { id: 'project-test', name: 'project', organization: { id: 'org-test', name: 'org' } }, data: { userEvents: [] } } };
            } else {
              data = { ok: true };
            }
          }
        } else if (isWikipediaRead) {
          if (Object.prototype.hasOwnProperty.call(options, 'wikipediaData')) {
            data = options.wikipediaData;
          } else if (url.indexOf('/api/rest_v1/feed/featured/') !== -1) {
            data = { tfa: { title: 'Featured Article', extract: 'Featured' }, mostread: { articles: [] }, onthisday: [] };
          } else if (url.indexOf('/api/rest_v1/page/summary/') !== -1) {
            data = { title: 'JavaScript', pageid: 123, extract: 'JavaScript summary' };
          } else if (url.indexOf('action=opensearch') !== -1) {
            data = ['Java', ['JavaScript'], [''], ['https://en.wikipedia.org/wiki/JavaScript']];
          } else if (url.indexOf('action=compare') !== -1) {
            data = { compare: { fromtitle: 'JavaScript', totitle: 'JavaScript', body: '<td class="diff-context">text</td>' } };
          } else if (url.indexOf('action=parse') !== -1) {
            data = { parse: { title: 'JavaScript', sections: [{ index: '1', line: 'History' }], text: '<p>Text</p>' } };
          } else if (url.indexOf('list=backlinks') !== -1) {
            data = { query: { backlinks: [{ pageid: 1, title: 'ECMAScript' }] } };
          } else if (url.indexOf('list=categorymembers') !== -1) {
            data = { query: { categorymembers: [{ pageid: 2, title: 'Programming languages' }] } };
          } else if (url.indexOf('list=random') !== -1) {
            data = { query: { random: [{ id: 3, title: 'Random article' }] } };
          } else if (url.indexOf('list=recentchanges') !== -1) {
            data = { query: { recentchanges: [{ title: 'JavaScript', user: 'Editor' }] } };
          } else if (url.indexOf('list=usercontribs') !== -1) {
            data = { query: { usercontribs: [{ title: 'JavaScript', revid: 10 }] } };
          } else if (url.indexOf('list=search') !== -1) {
            data = { query: { search: [{ pageid: 123, title: 'JavaScript' }], searchinfo: { totalhits: 1 } } };
          } else {
            data = { query: { pages: [{ pageid: 123, title: 'JavaScript', categories: [], langlinks: [], links: [], revisions: [] }] } };
          }
        } else if (isHackernewsHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'hackernewsText')
            ? options.hackernewsText
            : defaultHackernewsHtml(url);
        } else if (isRedditJson) {
          data = Object.prototype.hasOwnProperty.call(options, 'redditData')
            ? options.redditData
            : defaultRedditData(url);
        } else if (isNpmSpiferack) {
          if (Object.prototype.hasOwnProperty.call(options, 'npmData')) {
            data = options.npmData;
          } else if (url.indexOf('/search') !== -1) {
            data = {
              objects: [{ name: 'express', version: '5.1.0', description: 'Fast web framework' }],
              total: 1
            };
          } else if (url.indexOf('/org/') !== -1) {
            data = {
              scope: { parent: { name: 'openai', description: 'OpenAI packages', created: '2026-01-01T00:00:00.000Z', tfa_enforced: true } },
              packages: { total: 1, objects: [{ name: '@openai/test', version: '1.0.0', description: 'Test package', date: { rel: 'today' } }] }
            };
          } else if (url.indexOf('/~') !== -1) {
            data = {
              scope: { type: 'user', name: 'sindresorhus', parent: { name: 'sindresorhus', avatars: { large: '/avatar.png' } } },
              packages: { total: 1, objects: [{ name: 'ky', version: '1.0.0', description: 'HTTP client', date: { rel: 'today' } }] },
              orgs: { objects: [{ name: 'avajs' }] }
            };
          } else {
            data = {
              packageVersion: {
                name: '@types/node',
                version: '24.0.0',
                description: 'Node types',
                dependencies: { undici_types: '~7.8.0' },
                devDependencies: { typescript: '^5.8.0' }
              },
              capsule: {
                name: '@types/node',
                description: 'Node types',
                'dist-tags': { latest: '24.0.0' },
                lastPublish: { maintainer: 'types', time: '2026-06-30T00:00:00.000Z' }
              },
              packument: {
                versions: [{ version: '24.0.0' }],
                'dist-tags': { latest: '24.0.0' }
              },
              downloads: [{ downloads: 1000, label: '2026-06-23 to 2026-06-30' }],
              dependents: { dependentsCount: '100', dependentsTruncated: ['fixture'] },
              readme: '<p>README</p>'
            };
          }
        } else if (isYelpRead) {
          if (Object.prototype.hasOwnProperty.call(options, 'yelpData')) {
            data = options.yelpData;
          } else if (Object.prototype.hasOwnProperty.call(options, 'yelpText')) {
            data = null;
            text = options.yelpText;
          } else if (url.indexOf('/search_suggest/v2/prefetch') !== -1) {
            data = {
              response: [{
                prefix: 'pizza',
                suggestions: [{
                  query: 'pizza',
                  title: 'Pizza',
                  subtitle: 'Restaurants',
                  type: 'find_desc',
                  redirect_url: '/search?find_desc=pizza',
                  thumbnail: '/thumbnail.jpg'
                }]
              }]
            };
          } else if (url.indexOf('/biz/') !== -1) {
            data = null;
            text = yelpBusinessPageHtml();
          } else {
            data = null;
            text = yelpSearchPageHtml();
          }
        } else if (isTripadvisorGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'tripadvisorGraphqlData')
            ? options.tripadvisorGraphqlData
            : [{
              data: {
                RestaurantAwards_getRestaurantAwards: [{
                  awards: [{ award_name: 'Travelers Choice', award_title: 'Best of the Best', yearOfAward: '2026', description: 'Fixture award' }],
                  summaries: [{ text: 'Award summary', externalUrl: 'https://example.com/award' }]
                }]
              }
            }];
        } else if (isTripadvisorHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'tripadvisorText')
            ? options.tripadvisorText
            : tripadvisorDetailHtml();
        } else if (isZillowSearch) {
          if (Object.prototype.hasOwnProperty.call(options, 'zillowData')) {
            data = options.zillowData;
          } else {
            const body = parseSpecBody(spec);
            const filters = (body.searchQueryState && body.searchQueryState.filterState) || {};
            let total = 42;
            if (filters.isForRent && filters.isForRent.value === true) total = 7;
            else if (filters.isRecentlySold && filters.isRecentlySold.value === true) total = 12;
            else if (filters.isOpenHousesOnly && filters.isOpenHousesOnly.value === true) total = 3;
            else if (filters.isForSaleForeclosure && filters.isForSaleForeclosure.value === true) total = 4;
            else if (filters.isNewConstruction && filters.isNewConstruction.value === true) total = 5;
            else if (filters.isForSaleByOwner && filters.isForSaleByOwner.value === true) total = 6;
            data = zillowSearchResponse(total);
          }
        } else if (isRedfinRead) {
          if (Object.prototype.hasOwnProperty.call(options, 'redfinText')) {
            data = null;
            text = options.redfinText;
          } else {
            data = Object.prototype.hasOwnProperty.call(options, 'redfinData')
              ? options.redfinData
              : redfinDefaultData(url);
          }
        } else if (isBskyAppView) {
          if (Object.prototype.hasOwnProperty.call(options, 'bskyData')) {
            data = options.bskyData;
          } else if (url.indexOf('app.bsky.actor.getProfiles') !== -1) {
            data = { profiles: [{ did: 'did:plc:test', handle: 'bsky.app' }, { did: 'did:plc:second', handle: 'alice.test' }] };
          } else if (url.indexOf('app.bsky.actor.getProfile') !== -1) {
            data = { did: 'did:plc:test', handle: 'bsky.app', displayName: 'Bluesky' };
          } else if (url.indexOf('app.bsky.actor.searchActorsTypeahead') !== -1 || url.indexOf('app.bsky.actor.searchActors') !== -1) {
            data = { actors: [{ did: 'did:plc:test', handle: 'bsky.app', displayName: 'Bluesky' }], cursor: 'next' };
          } else if (url.indexOf('app.bsky.graph.getFollowers') !== -1) {
            data = { followers: [{ did: 'did:plc:follower', handle: 'follower.test' }], cursor: 'next' };
          } else if (url.indexOf('app.bsky.graph.getFollows') !== -1) {
            data = { follows: [{ did: 'did:plc:follow', handle: 'follow.test' }], cursor: 'next' };
          } else if (url.indexOf('app.bsky.feed.getPostThread') !== -1) {
            data = { thread: { post: { uri: 'at://did:plc:test/app.bsky.feed.post/1', cid: 'cid-test', author: { handle: 'bsky.app' } } } };
          } else if (url.indexOf('app.bsky.feed.getPosts') !== -1 || url.indexOf('app.bsky.feed.searchPosts') !== -1) {
            data = { posts: [{ uri: 'at://did:plc:test/app.bsky.feed.post/1', cid: 'cid-test', author: { handle: 'bsky.app' } }], cursor: 'next' };
          } else if (url.indexOf('app.bsky.feed.getAuthorFeed') !== -1 || url.indexOf('app.bsky.feed.getFeed') !== -1 || url.indexOf('app.bsky.feed.getListFeed') !== -1) {
            data = { feed: [{ post: { uri: 'at://did:plc:test/app.bsky.feed.post/1', cid: 'cid-test', author: { handle: 'bsky.app' } } }], cursor: 'next' };
          } else {
            data = { ok: true };
          }
        } else if (isXHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'xText')
            ? options.xText
            : defaultXHtml(url);
        } else if (isStackoverflowHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'stackoverflowText')
            ? options.stackoverflowText
            : defaultStackoverflowHtml(url);
        } else if (isFacebookHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'facebookText')
            ? options.facebookText
            : defaultFacebookHtml(url);
        } else if (isThreadsRead) {
          if (Object.prototype.hasOwnProperty.call(options, 'threadsText')) {
            data = null;
            text = options.threadsText;
          } else {
            data = Object.prototype.hasOwnProperty.call(options, 'threadsData')
              ? options.threadsData
              : defaultThreadsData();
          }
        } else if (isInstagramSearch) {
          data = Object.prototype.hasOwnProperty.call(options, 'instagramData')
            ? options.instagramData
            : instagramTopsearchData();
        } else if (isInstagramHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'instagramText')
            ? options.instagramText
            : defaultInstagramHtml(url);
        } else if (isTiktokHtml) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'tiktokText')
            ? options.tiktokText
            : defaultTiktokHtml(url);
        } else if (isStripeBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'stripeBootstrapText')
            ? options.stripeBootstrapText
            : '<html><script>window.PRELOADED={"merchant":{"id":"acct_TEST"},"csrf_token":"csrf-TEST-SYNTHETIC","session_api_key":"sk_test_SYNTHETIC"}; window.STRIPE_VERSION="2025-06-30.basil";</script></html>';
        } else if (isStripeApi) {
          if (Object.prototype.hasOwnProperty.call(options, 'stripeData')) {
            data = options.stripeData;
          } else if (url.indexOf('/v1/balance') !== -1) {
            data = { object: 'balance', available: [], pending: [] };
          } else if (url.indexOf('/search') !== -1 || /\/v1\/(customers|events|invoices|payment_intents|prices|products|subscriptions|balance_transactions)(\?|$)/.test(url)) {
            data = { object: 'list', data: [{ id: 'stripe-list-item' }], has_more: false };
          } else if (url.indexOf('/v1/account') !== -1) {
            data = { id: 'acct_TEST', object: 'account' };
          } else {
            data = { id: 'stripe-object-test', object: 'stripe_object' };
          }
        } else if (isCloudflareBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'cloudflareBootstrapText')
            ? options.cloudflareBootstrapText
            : '<html><script>window.bootstrap={"atok":"atok-TEST-SYNTHETIC"};</script></html>';
        } else if (isCloudflareGraphql) {
          data = Object.prototype.hasOwnProperty.call(options, 'cloudflareGraphqlData')
            ? options.cloudflareGraphqlData
            : { data: { viewer: { zones: [] } }, errors: null };
        } else if (isCloudflareApi) {
          if (Object.prototype.hasOwnProperty.call(options, 'cloudflareData')) {
            data = options.cloudflareData;
          } else {
            const pathOnly = url.split('?')[0];
            const isObjectResult = /\/user$/.test(pathOnly)
              || /\/zones\/[^/]+$/.test(pathOnly)
              || /\/rulesets\/[^/]+$/.test(pathOnly);
            data = {
              success: true,
              errors: [],
              messages: [],
              result: isObjectResult
                ? { id: 'cf-object-test', name: 'Cloudflare Fixture' }
                : [{ id: 'cf-list-test', name: 'Cloudflare List Fixture' }],
              result_info: { page: 1, per_page: 20, count: 1, total_count: 1, total_pages: 1 }
            };
          }
        } else if (isTwilioProjectInfo) {
          data = Object.prototype.hasOwnProperty.call(options, 'twilioProjectInfoData')
            ? options.twilioProjectInfoData
            : { projectSid: 'ACtwiliofixture0000000000000000000000', authToken: 'SECRET_AUTH_TOKEN_SHOULD_NOT_LEAK' };
        } else if (isTumblrBootstrap) {
          data = null;
          text = Object.prototype.hasOwnProperty.call(options, 'tumblrBootstrapText')
            ? options.tumblrBootstrapText
            : '<html><script id="___INITIAL_STATE___">{"apiFetchStore":{"API_TOKEN":"tumblr-token-TEST-SYNTHETIC"},"csrfToken":"csrf-TEST-SYNTHETIC"}</script></html>';
        } else if (isTumblrApi) {
          if (Object.prototype.hasOwnProperty.call(options, 'tumblrData')) {
            data = options.tumblrData;
          } else if (url.indexOf('/user/info') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { user: { name: 'tumblr-user', following: 2, likes: 3, blogs: [] } } };
          } else if (url.indexOf('/blog/staff/info') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { blog: { name: 'staff', title: 'Tumblr Staff', posts: 100 } } };
          } else if (url.indexOf('/tagged') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: [{ idString: 'post-1', blogName: 'staff', type: 'text' }] };
          } else if (url.indexOf('/filtered_tags') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { filteredTags: ['spoilers'] } };
          } else if (url.indexOf('/limits') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { posts: { description: 'Daily posts', limit: 250, remaining: 249, resetAt: 1700000000 } } };
          } else if (url.indexOf('/notes') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { notes: [{ type: 'like', blogName: 'alice' }], total_notes: 1 } };
          } else if (url.indexOf('/followers') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { users: [{ name: 'follower', url: 'https://follower.tumblr.com' }], totalUsers: 1 } };
          } else if (url.indexOf('/following') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { blogs: [{ name: 'followed', title: 'Followed' }], totalBlogs: 1, total_blogs: 1 } };
          } else if (url.indexOf('/likes') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { likedPosts: [{ idString: 'liked-1', blogName: 'staff' }], likedCount: 1, liked_posts: [{ idString: 'liked-1', blogName: 'staff' }], liked_count: 1 } };
          } else if (url.indexOf('/notifications') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { notifications: [{ type: 'like', fromTumblelogName: 'alice' }] } };
          } else if (url.indexOf('/blocks') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { blockedTumblelogs: [{ name: 'blocked', title: 'Blocked' }] } };
          } else if (url.indexOf('/recommended/blogs') !== -1) {
            data = { meta: { status: 200, msg: 'OK' }, response: { blogs: [{ name: 'recommended', title: 'Recommended' }] } };
          } else if (url.indexOf('/posts/') !== -1 && !/\/posts\/(draft|queue|submission)/.test(url)) {
            data = { meta: { status: 200, msg: 'OK' }, response: { idString: 'post-1', blogName: 'staff', type: 'text' } };
          } else {
            data = { meta: { status: 200, msg: 'OK' }, response: { posts: [{ idString: 'post-1', blogName: 'staff', type: 'text' }], totalPosts: 1 } };
          }
        } else if (Object.prototype.hasOwnProperty.call(options, 'readText')) {
          // TEXT-path override: a non-JSON body. executeBoundSpec parity is
          // data:null with the raw body on result.text (the retool plain-text
          // recovery seam reads exactly this shape).
          data = null;
          text = options.readText;
        } else if (Object.prototype.hasOwnProperty.call(options, 'readData')) {
          // NEGATIVE-path override (IN-01): the caller drives the actual read/RPC
          // response body (NOT the probe -- the probe still answers with its canned
          // token text so the slack handler proceeds to the guarded POST). Lets a
          // test feed a logged-out body (a gitlab error envelope / null / { ok:false })
          // so the per-app shape guard's FAIL branch is exercised. `readData:null` is
          // honored (hasOwnProperty presence check, not a truthiness test).
          data = options.readData;
        } else if (isGitlabRest) {
          // A logged-in GitLab REST read: list_* endpoints return arrays, resource
          // reads return objects, and trace returns raw text.
          const tail = url.split('?')[0].replace(/\/+$/, '');
          const lastSeg = tail.substring(tail.lastIndexOf('/') + 1);
          const looksLikeId = /^\d+$/.test(lastSeg) || /%2F/i.test(lastSeg) || (/^[0-9]+$/.test(decodeURIComponent(lastSeg)));
          if (tail.indexOf('/trace') !== -1) {
            data = null;
            text = 'Running with gitlab-runner fixture\nJob succeeded\n';
          } else if (tail.indexOf('/repository/files/') !== -1) {
            data = { file_path: 'src/index.ts', content: 'ZXhwb3J0IGNvbnN0IGZpeHR1cmUgPSB0cnVlOwo=', encoding: 'base64' };
          } else if (tail.indexOf('/changes') !== -1) {
            data = { changes: [{ old_path: 'old.txt', new_path: 'new.txt', diff: '@@ fixture @@' }] };
          } else if (/\/users$/.test(tail)) {
            data = [{ id: 1, username: 'gitlab-user' }];
          } else if (/\/user$/.test(tail)) {
            data = { id: 1, username: 'gitlab-user' };
          } else {
            data = looksLikeId ? { id: 1, iid: 1 } : [{ id: 1 }];
          }
        } else if (url.indexOf('https://app.notion.com/api/v3/') === 0) {
          const op = url.substring(url.lastIndexOf('/') + 1);
          if (op === 'getSpaces' || op === 'getSpacesInitial') {
            if (Object.prototype.hasOwnProperty.call(options, 'notionSessionText')) {
              data = null;
              text = options.notionSessionText;
            } else {
              data = options.notionNoSession ? {} : { 'user-test': { space: { 'space-test': {} } } };
            }
          } else if (op === 'saveTransactions') {
            status = Object.prototype.hasOwnProperty.call(options, 'notionSaveStatus')
              ? options.notionSaveStatus
              : 200;
            data = Object.prototype.hasOwnProperty.call(options, 'notionSaveData')
              ? options.notionSaveData
              : { ok: true };
          } else if (op === 'getRecordValues') {
            const body = parseSpecBody(spec);
            const requests = Array.isArray(body.requests) ? body.requests : [];
            data = { results: requests.map(function (request) {
              return { value: defaultNotionRecordValue(request) };
            }) };
          } else {
            data = { ok: true };
          }
        } else if (url.indexOf('https://app.netlify.com/access-control/bb-api/api/v1') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/deploys') !== -1 || pathOnly.indexOf('/forms') !== -1 || /\/sites$/.test(pathOnly)) {
            data = [{ id: 'netlify-test', name: 'Test site' }];
          } else {
            data = { id: 'netlify-test', name: 'Test site' };
          }
        } else if (url.indexOf('https://bitbucket.org/!api/2.0') === 0) {
          const pathOnly = url.split('?')[0];
          const repoSegs = pathOnly.split('/repositories/')[1];
          if (pathOnly.indexOf('/src/') !== -1) {
            data = null;
            text = 'export const bitbucketFixture = true;\n';
          } else if (pathOnly.indexOf('/diff') !== -1) {
            data = null;
            text = 'diff --git a/file.txt b/file.txt\n';
          } else if (pathOnly.indexOf('/workspaces') !== -1
              || pathOnly.indexOf('/refs/branches') !== -1
              || pathOnly.indexOf('/refs/tags') !== -1
              || pathOnly.indexOf('/commits') !== -1
              || pathOnly.indexOf('/steps') !== -1
              || pathOnly.indexOf('/comments') !== -1
              || /\/pipelines\/?$/.test(pathOnly)
              || /\/pullrequests\/?$/.test(pathOnly)
              || pathOnly.indexOf('/search/code') !== -1
              || (repoSegs && repoSegs.split('/').length < 2)) {
            data = { values: [{ uuid: '{workspace-test}', slug: 'workspace-test', name: 'Workspace test' }] };
          } else {
            data = { uuid: '{repo-test}', slug: 'repo-test', name: 'Repository test' };
          }
        } else if (url.indexOf('https://app.circleci.com/api/v2') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/insights/') !== -1) {
            data = { items: [{ name: 'build', status: 'success', total_runs: 1 }] };
          } else if (pathOnly.indexOf('/context/') !== -1 && pathOnly.indexOf('/environment-variable') !== -1) {
            data = { items: [{ variable: 'NODE_ENV', context_id: 'context-123' }] };
          } else if (pathOnly === 'https://app.circleci.com/api/v2/context') {
            data = { items: [{ id: 'context-test', name: 'Production' }] };
          } else if (pathOnly.indexOf('/context/') !== -1) {
            data = { id: 'context-test', name: 'Production' };
          } else if (pathOnly.indexOf('/envvar') !== -1) {
            data = { items: [{ name: 'NODE_ENV', value: 'xxxx' }] };
          } else if (pathOnly.indexOf('/schedule') !== -1) {
            data = { items: [{ id: 'schedule-test', name: 'Nightly' }] };
          } else if (pathOnly.indexOf('/pipeline/') !== -1 && /\/workflow$/.test(pathOnly)) {
            data = { items: [{ id: 'workflow-test', name: 'build', status: 'success' }] };
          } else if (pathOnly.indexOf('/pipeline/') !== -1) {
            data = { id: 'pipeline-test', number: 1, project_slug: 'gh/org/repo' };
          } else if (pathOnly.indexOf('/workflow/') !== -1 && /\/job$/.test(pathOnly)) {
            data = { items: [{ id: 'job-test', name: 'build', status: 'success', job_number: 42 }] };
          } else if (pathOnly.indexOf('/workflow/') !== -1) {
            data = { id: 'workflow-test', name: 'build', status: 'success' };
          } else if (pathOnly.indexOf('/artifacts') !== -1) {
            data = { items: [{ path: 'artifact.txt', url: 'https://example.invalid/artifact.txt' }] };
          } else if (pathOnly.indexOf('/tests') !== -1) {
            data = { items: [{ name: 'test passes', result: 'success' }] };
          } else if (pathOnly.indexOf('/project/') !== -1 && pathOnly.indexOf('/job/') !== -1) {
            data = { id: 'job-test', name: 'build', status: 'success', job_number: 42 };
          } else if (pathOnly.indexOf('/pipeline') !== -1) {
            data = { items: [{ id: 'pipeline-test', number: 1, project_slug: 'gh/org/repo' }] };
          } else if (url.indexOf('/me') !== -1) {
            data = { id: 'user-test', login: 'circle-user', name: 'Circle User' };
          } else {
            data = { id: 'project-test', slug: 'gh/org/repo', name: 'repo' };
          }
        } else if (url.indexOf('https://vercel.com/api') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/www/user') !== -1) {
            data = { user: { uid: 'user-test', email: 'user@example.invalid', username: 'vercel-user' } };
          } else if (pathOnly.indexOf('/v2/teams') !== -1) {
            data = { teams: [{ id: 'team-test', slug: 'team-test', name: 'Team Test' }] };
          } else if (pathOnly.indexOf('/v9/projects/') !== -1 && /\/domains$/.test(pathOnly)) {
            data = { domains: [{ name: 'example.invalid', configured: true }] };
          } else if (pathOnly.indexOf('/v9/projects/') !== -1) {
            data = { id: 'prj-test', name: 'project-test' };
          } else if (pathOnly.indexOf('/v9/projects') !== -1) {
            data = { projects: [{ id: 'prj-test', name: 'project-test' }], pagination: { count: 1, next: null } };
          } else if (pathOnly.indexOf('/v6/deployments') !== -1) {
            data = { deployments: [{ uid: 'dpl-test', name: 'project-test', url: 'project-test.vercel.app' }], pagination: { count: 1, next: null } };
          } else if (pathOnly.indexOf('/v13/deployments/') !== -1) {
            data = { uid: 'dpl-test', name: 'project-test', url: 'project-test.vercel.app' };
          } else {
            data = { ok: true };
          }
        } else if (url.indexOf('https://retool.com/api') === 0) {
          const pathOnly = url.split('?')[0];
          const retoolAppState = JSON.stringify([
            null,
            ['v', [
              null,
              'plugins',
              ['~#iOM', [
                'text1',
                ['~#iR', ['v', [
                  null,
                  'type', 'widget',
                  'subtype', 'TextWidget',
                  'container', 'canvas',
                  'position2', ['~#iR', ['v', [null, 'row', 1, 'col', 2, 'width', 3, 'height', 4]]],
                  'template', ['~#iOM', ['text', 'Hello']]
                ]]]
              ]]
            ]]
          ]);
          if (pathOnly.indexOf('/user') !== -1) {
            data = { user: { id: 1, email: 'user@example.invalid', name: 'Retool User' } };
          } else if (pathOnly.indexOf('/organization/userSpaces') !== -1) {
            data = { userSpaces: [{ id: 1, name: 'Default space' }] };
          } else if (pathOnly.indexOf('/organization') !== -1) {
            data = { org: { id: 1, name: 'Retool Org', subdomain: 'fsb-test' } };
          } else if (pathOnly.indexOf('/sourceControl/settings') !== -1) {
            data = { settings: { enabled: false } };
          } else if (pathOnly.indexOf('/workflowRun/getCountByWorkflow') !== -1) {
            data = { workflowRunsCountByWorkflow: { wf_1: { workflowId: 'wf_1', count: 2 } } };
          } else if (pathOnly.indexOf('/workflow/workflowsConfiguration') !== -1) {
            data = { temporalEnabled: true, codeExecutorVersion: 'test' };
          } else if (pathOnly.indexOf('/workflowRun/getLog') !== -1) {
            data = { status: 'success', logs: [{ message: 'ok', timestamp: 1 }] };
          } else if (pathOnly.indexOf('/workflowRun/') !== -1) {
            data = { id: 'run-1', workflowId: 'wf_1', status: 'success' };
          } else if (pathOnly.indexOf('/workflowTrigger') !== -1) {
            data = { deployedTriggers: [{ id: 'trigger-1' }], latestSavedTriggers: [] };
          } else if (pathOnly.indexOf('/agents') !== -1) {
            data = { agents: [{ id: 'agent-1', name: 'Agent' }] };
          } else if (pathOnly.indexOf('/pages/uuids/') !== -1 && pathOnly.indexOf('/documentation') !== -1) {
            data = { documentation: 'Retool app docs' };
          } else if (pathOnly.indexOf('/pages/uuids/') !== -1 && pathOnly.indexOf('/tags') !== -1) {
            data = { tags: [{ name: 'v1' }] };
          } else if (pathOnly.indexOf('/pages/uuids/') !== -1 && pathOnly.indexOf('/saves') !== -1) {
            data = { saves: [{ id: 1, createdAt: '2026-06-30T00:00:00.000Z' }] };
          } else if (pathOnly.indexOf('/pages/uuids/') !== -1) {
            data = { page: { id: 1, pageId: 2, uuid: 'page-1', data: { appState: retoolAppState } } };
          } else if (pathOnly.indexOf('/pages') !== -1) {
            data = { pages: [{ uuid: 'page-1', name: 'App' }], folders: [] };
          } else if (pathOnly.indexOf('/branches') !== -1) {
            data = { branches: [{ name: 'main' }] };
          } else if (pathOnly.indexOf('/environments') !== -1) {
            data = { environments: [{ id: 1, name: 'production' }] };
          } else if (pathOnly.indexOf('/experiments') !== -1) {
            data = { featureA: true };
          } else if (pathOnly.indexOf('/grid') !== -1) {
            data = [{ id: 'grid-1', name: 'Grid' }];
          } else if (pathOnly.indexOf('/editor/pageNames') !== -1) {
            data = { pageNames: [{ uuid: 'page-1', name: 'App' }] };
          } else if (pathOnly.indexOf('/playground') !== -1) {
            data = { userQueries: [{ id: 'query-1', name: 'Query' }], orgQueries: [] };
          } else if (pathOnly.indexOf('/resources') !== -1) {
            data = { resources: [{ id: 1, name: 'Resource' }] };
          } else if (pathOnly.indexOf('/workflow/') !== -1 && pathOnly.indexOf('/releases') !== -1) {
            data = [{ id: 'release-1', workflowId: 'wf_1' }];
          } else if (pathOnly.indexOf('/workflow/') !== -1) {
            data = pathOnly === 'https://retool.com/api/workflow/'
              ? { workflowsMetadata: [{ id: 'wf_1', name: 'Workflow' }], workflowFolders: [] }
              : { id: 'wf_1', name: 'Workflow' };
          } else {
            data = { ok: true };
          }
        } else if (url.indexOf('https://app.asana.com/api/1.0') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/users/me') !== -1) {
            data = { data: { gid: 'user-test', name: 'Asana User', email: 'user@example.invalid', workspaces: [{ gid: 'workspace-test', name: 'Workspace' }] } };
          } else if (/\/(projects|tasks|users)\/[^/]+$/.test(pathOnly)) {
            data = { data: { gid: 'object-test', name: 'Asana Object' } };
          } else {
            data = { data: [{ gid: 'item-test', name: 'Asana Item' }], next_page: null };
          }
        } else {
          data = { ok: true };
        }
        return {
          success: true,
          status: status,
          finalUrl: (spec && spec.url) || null,
          redirected: false,
          data: data,
          text: text
        };
      },
      interpretRecipe() { throw new Error('handler must not call interpretRecipe for a code-built spec'); }
    }
  };
}

// ---- Load the recipe-schema validator (for the Reddit T1b recipe assertion) ----
vm.runInThisContext(readSource(CFWORKER_PATH));
const Schema = require(SCHEMA_PATH);

(async function run() {
  // =========================================================================
  // GitHub head -- catalog/handlers/github.js (issues T1a)
  // =========================================================================
  const githubPath = path.join(HANDLERS_DIR, 'github.js');
  check(fs.existsSync(githubPath), 'catalog/handlers/github.js exists');
  if (fs.existsSync(githubPath)) {
    const gh = require(githubPath);
    const ghSrc = readSource(githubPath);

    check(gh['github.issues.list'] && gh['github.issues.list'].tier === 'T1a'
      && typeof gh['github.issues.list'].handle === 'function',
      'github.issues.list is a tier:T1a entry with an async handle');
    check(gh['github.issues.list'] && gh['github.issues.list'].origin === 'https://github.com',
      'github.issues.list targets the first-party origin https://github.com');
    check(gh['github.issues.create'] && gh['github.issues.create'].tier === 'T1a'
      && gh['github.issues.create'].sideEffectClass === 'write',
      'github.issues.create is a tier:T1a WRITE entry (the mutating slug)');
    check(gh['github.issues.create'] && gh['github.issues.create'].origin === 'https://github.com',
      'github.issues.create targets https://github.com (NOT api.github.com)');
    check(gh['github.issues.create'] && gh['github.issues.create'].params
      && Array.isArray(gh['github.issues.create'].params.required)
      && gh['github.issues.create'].params.required.indexOf('repositoryId') !== -1
      && gh['github.issues.create'].params.required.indexOf('title') !== -1,
      'github.issues.create exposes a params schema requiring repositoryId + title');

    // SECURITY T-29-07: no separate-origin API host, no chrome.* in the handler.
    check(ghSrc.indexOf('api.github.com') === -1,
      'github.js references NO separate-origin api.github.com (origin-pin correctness, T-29-07)');
    check(!/chrome\.(scripting|tabs)/.test(ghSrc),
      'github.js references NO chrome.scripting/chrome.tabs (the pin lives in executeBoundSpec)');

    // The read handler builds a github.com-pinned spec and calls executeBoundSpec once.
    const ghRead = makeCtx('https://github.com', 11);
    const ghOut = await gh['github.issues.list'].handle({}, ghRead.ctx);
    check(ghRead.calls.length === 1,
      'github.issues.list.handle calls ctx.executeBoundSpec exactly once');
    check(ghRead.calls.length === 1 && ghRead.calls[0].spec
      && ghRead.calls[0].spec.origin === 'https://github.com',
      'github.issues.list builds a spec pinned to origin https://github.com');
    check(ghOut && ghOut.success === true,
      'github.issues.list.handle returns the executeBoundSpec result');
    const ghReadQuery = makeCtx('https://github.com', 11);
    await gh['github.issues.list'].handle({ query: 'is:open label:bug' }, ghReadQuery.ctx);
    check(ghReadQuery.calls.length === 1 && ghReadQuery.calls[0].spec
      && ghReadQuery.calls[0].spec.url === 'https://github.com/issues?q=is%3Aopen%20label%3Abug',
      'github.issues.list folds args.query into the concrete /issues URL');

    // The create handler is intentionally fail-closed while GitHub's internal
    // mutation body remains unverified. It must not scrape CSRF or call /_graphql.
    const ghWrite = makeCtx('https://github.com', 11);
    const ghCreate = await gh['github.issues.create'].handle(
      { repositoryId: 'R_x', title: 't', body: 'b' }, ghWrite.ctx);
    check(ghWrite.calls.length === 0,
      'github.issues.create.handle makes no recipe calls while mutation body is unverified');
    check(ghCreate && ghCreate.success === false
      && ghCreate.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghCreate.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghCreate.error === 'RECIPE_DOM_FALLBACK_PENDING',
      'github.issues.create returns the dual-field RECIPE_DOM_FALLBACK_PENDING failure');
    check(ghCreate && ghCreate.slug === 'github.issues.create'
      && ghCreate.reason === 'unverified-github-create-mutation'
      && ghCreate.fellBackToDom === true,
      'github.issues.create fallback carries slug, reason, and fellBackToDom marker');
    // No literal console-log of a CSRF-token-bearing identifier.
    check(!/console\.\w+\([^)]*\b(csrf|token)\b/i.test(ghSrc),
      'github.js does NOT console-log a csrf/token-bearing variable (T-29-08, redactForLog discipline)');
  }

  // =========================================================================
  // Slack head -- catalog/handlers/slack.js (T1a split-token)
  // =========================================================================
  const slackPath = path.join(HANDLERS_DIR, 'slack.js');
  check(fs.existsSync(slackPath), 'catalog/handlers/slack.js exists');
  if (fs.existsSync(slackPath)) {
    const sl = require(slackPath);
    const slSrc = readSource(slackPath);

    check(sl['slack.conversations.list'] && sl['slack.conversations.list'].tier === 'T1a'
      && typeof sl['slack.conversations.list'].handle === 'function',
      'slack.conversations.list is a tier:T1a entry with an async handle');
    check(sl['slack.conversations.list'] && sl['slack.conversations.list'].origin === 'https://app.slack.com',
      'slack.conversations.list targets the first-party origin https://app.slack.com');
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].tier === 'T1a'
      && sl['slack.chat.postMessage'].sideEffectClass === 'write',
      'slack.chat.postMessage is a tier:T1a WRITE entry');
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].origin === 'https://app.slack.com',
      'slack.chat.postMessage targets https://app.slack.com');
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].params
      && Array.isArray(sl['slack.chat.postMessage'].params.required)
      && sl['slack.chat.postMessage'].params.required.indexOf('channel') !== -1
      && sl['slack.chat.postMessage'].params.required.indexOf('text') !== -1,
      'slack.chat.postMessage exposes a params schema requiring channel + text');

    check(!/chrome\.(scripting|tabs)/.test(slSrc),
      'slack.js references NO chrome.scripting/chrome.tabs');

    // SECURITY T-29-08: the xoxc token goes in the BODY, not a header, and is never
    // console-logged. A source-level assertion: no console call names xoxc/xoxd/token.
    check(!/console\.\w+\([^)]*\b(xoxc|xoxd|token)\b/i.test(slSrc),
      'slack.js does NOT console-log an xoxc/xoxd/token-bearing variable (T-29-08)');

    // The read handler scrapes xoxc (from:'response'), places it in the BODY, and
    // calls executeBoundSpec. The xoxd cookie rides same-origin (no header set).
    const slRead = makeCtx('https://app.slack.com', 21);
    const slOut = await sl['slack.conversations.list'].handle({}, slRead.ctx);
    check(slRead.calls.length >= 1,
      'slack.conversations.list.handle calls ctx.executeBoundSpec at least once');
    const postSlack = slRead.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!postSlack, 'slack.conversations.list issues a POST spec (Slack web API is POST)');
    check(postSlack && postSlack.spec.origin === 'https://app.slack.com',
      'slack POST spec is pinned to https://app.slack.com');
    // xoxc must be in the body, not a header. The body may be a string (form-encoded)
    // or an object; assert the token rides the body and NOT any header value.
    var bodyStr = '';
    if (postSlack && postSlack.spec) {
      bodyStr = (typeof postSlack.spec.body === 'string')
        ? postSlack.spec.body
        : JSON.stringify(postSlack.spec.body || {});
    }
    check(bodyStr.indexOf('xoxc') !== -1 || bodyStr.indexOf('token') !== -1,
      'slack places the xoxc token in the request BODY (not a header)');
    var headerStr = JSON.stringify((postSlack && postSlack.spec && postSlack.spec.headers) || {});
    check(headerStr.indexOf('xoxc') === -1,
      'slack does NOT place xoxc in a request header (split-token: body-only)');
    check(slOut && slOut.success === true,
      'slack.conversations.list.handle returns the executeBoundSpec result');

    const slMissingToken = makeCtx('https://app.slack.com', 21, {
      slackProbeText: '<html><script>window.boot = {"ok":true};</script></html>'
    });
    const slMissingOut = await sl['slack.conversations.list'].handle({}, slMissingToken.ctx);
    check(slMissingToken.calls.length === 1,
      'slack.conversations.list missing-token path performs only the probe');
    const missingTokenPost = slMissingToken.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!missingTokenPost,
      'slack.conversations.list missing-token path does not issue the Slack API POST');
    check(slMissingOut && slMissingOut.success === false
      && slMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && slMissingOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && slMissingOut.error === 'RECIPE_DOM_FALLBACK_PENDING',
      'slack.conversations.list missing-token path returns the dual-field RECIPE_DOM_FALLBACK_PENDING failure');
    check(slMissingOut && slMissingOut.slug === 'slack.conversations.list'
      && slMissingOut.method === 'conversations.list'
      && slMissingOut.reason === 'missing-slack-xoxc'
      && slMissingOut.fellBackToDom === true,
      'slack.conversations.list missing-token fallback carries slug, method, reason, and fellBackToDom marker');
  }

  // =========================================================================
  // Notion head -- catalog/handlers/notion.js (T1a /api/v3 RPC)
  // =========================================================================
  const notionPath = path.join(HANDLERS_DIR, 'notion.js');
  check(fs.existsSync(notionPath), 'catalog/handlers/notion.js exists');
  if (fs.existsSync(notionPath)) {
    const nt = require(notionPath);
    const ntSrc = readSource(notionPath);

    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].tier === 'T1a'
      && typeof nt['notion.getSpaces'].handle === 'function',
      'notion.getSpaces is a tier:T1a entry with an async handle');
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].origin === 'https://app.notion.com',
      'notion.getSpaces targets the first-party origin https://app.notion.com');
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].sideEffectClass === 'read',
      'notion.getSpaces is a READ slug');
    check(nt['notion.loadPage'] && nt['notion.loadPage'].params
      && Array.isArray(nt['notion.loadPage'].params.required)
      && nt['notion.loadPage'].params.required.indexOf('pageId') !== -1,
      'notion.loadPage exposes a params schema requiring pageId');

    check(ntSrc.indexOf('api.notion.com') === -1,
      'notion.js references NO separate-origin api.notion.com (T-29-07)');
    check(!/chrome\.(scripting|tabs)/.test(ntSrc),
      'notion.js references NO chrome.scripting/chrome.tabs');

    const ntCtx = makeCtx('https://app.notion.com', 31);
    const ntOut = await nt['notion.getSpaces'].handle({}, ntCtx.ctx);
    check(ntCtx.calls.length >= 1,
      'notion.getSpaces.handle calls ctx.executeBoundSpec at least once');
    const ntPost = ntCtx.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!ntPost, 'notion.getSpaces issues a POST spec (/api/v3 is POST-only RPC)');
    check(ntPost && typeof ntPost.spec.url === 'string' && ntPost.spec.url.indexOf('/api/v3') !== -1,
      'notion.getSpaces POSTs the same-origin /api/v3 RPC endpoint');
    check(ntPost && ntPost.spec.origin === 'https://app.notion.com',
      'notion.getSpaces POST spec is pinned to https://app.notion.com');
    check(ntOut && ntOut.success === true,
      'notion.getSpaces.handle returns the executeBoundSpec result');

    const ntCreate = makeCtx('https://app.notion.com', 31);
    const ntCreateOut = await nt['notion.create_page'].handle({
      title: 'Created page',
      content: 'Created body',
      icon: 'T'
    }, ntCreate.ctx);
    const ntCreateSave = ntCreate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntCreateVerify = ntCreate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/getRecordValues';
    });
    const ntCreateBody = parseSpecBody(ntCreateSave && ntCreateSave.spec);
    const ntCreateOps = ntCreateBody.transactions && ntCreateBody.transactions[0]
      ? ntCreateBody.transactions[0].operations
      : [];
    const ntCreateTitleOp = ntCreateOps.find(function (op) {
      return op.command === 'set' && JSON.stringify(op.path) === JSON.stringify(['properties', 'title']);
    });
    check(!!ntCreateSave,
      'notion.create_page calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntCreateSave && ntCreateSave.spec.headers
      && ntCreateSave.spec.headers['x-notion-active-user-header'] === 'user-test'
      && ntCreateSave.spec.headers['x-notion-space-id'] === 'space-test',
      'notion.create_page sends active user and space headers only inside the bound spec');
    check(ntCreateTitleOp && JSON.stringify(ntCreateTitleOp.args) === JSON.stringify([['Created page']]),
      'notion.create_page uses command:set for properties.title with the Notion title array');
    check(!!ntCreateVerify,
      'notion.create_page verifies the created page with getRecordValues');
    check(ntCreateOut && ntCreateOut.success === true && ntCreateOut.data && ntCreateOut.data.pageUrl
      && ntCreateOut.data.pageUrl.indexOf('https://app.notion.com/') === 0,
      'notion.create_page returns a success payload pinned to app.notion.com');

    const ntTextSession = makeCtx('https://app.notion.com', 31, {
      notionSessionText: '{"11111111-1111-4111-8111-111111111111":{"__version__":3,"notion_user":{"11111111-1111-4111-8111-111111111111":{}},"space":{"22222222-2222-4222-8222-222222222222":{}}'
    });
    await nt['notion.create_page'].handle({ title: 'Text session page' }, ntTextSession.ctx);
    const ntTextSessionSave = ntTextSession.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    check(ntTextSessionSave && ntTextSessionSave.spec.headers
      && ntTextSessionSave.spec.headers['x-notion-active-user-header'] === '11111111-1111-4111-8111-111111111111'
      && ntTextSessionSave.spec.headers['x-notion-space-id'] === '22222222-2222-4222-8222-222222222222',
      'notion.create_page resolves session ids from capped getSpaces text when parsed data is null');

    const ntUpdate = makeCtx('https://app.notion.com', 31);
    const ntUpdateOut = await nt['notion.update_page'].handle({
      page_id: 'page-test',
      title: 'Updated page',
      icon: 'U',
      cover: '/images/cover.png'
    }, ntUpdate.ctx);
    const ntUpdateSave = ntUpdate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntUpdateBody = parseSpecBody(ntUpdateSave && ntUpdateSave.spec);
    const ntUpdateOps = ntUpdateBody.transactions && ntUpdateBody.transactions[0]
      ? ntUpdateBody.transactions[0].operations
      : [];
    const ntUpdateSetPaths = ntUpdateOps.filter(function (op) { return op.command === 'set'; })
      .map(function (op) { return JSON.stringify(op.path); }).sort();
    check(!!ntUpdateSave,
      'notion.update_page calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntUpdateSetPaths.indexOf(JSON.stringify(['properties', 'title'])) !== -1
      && ntUpdateSetPaths.indexOf(JSON.stringify(['format', 'page_icon'])) !== -1
      && ntUpdateSetPaths.indexOf(JSON.stringify(['format', 'page_cover'])) !== -1,
      'notion.update_page uses command:set for title, icon, and cover paths');
    check(ntUpdateOps.some(function (op) { return op.command === 'update' && JSON.stringify(op.path) === '[]'; }),
      'notion.update_page keeps command:update scoped to object-shaped metadata');
    check(ntUpdateOut && ntUpdateOut.success === true,
      'notion.update_page verifies and returns success');

    const ntDb = makeCtx('https://app.notion.com', 31);
    const ntDbOut = await nt['notion.create_database'].handle({
      parent_page_id: 'page-parent',
      title: 'Created database',
      properties: { Status: 'text' }
    }, ntDb.ctx);
    const ntDbSave = ntDb.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntDbBody = parseSpecBody(ntDbSave && ntDbSave.spec);
    const ntDbOps = ntDbBody.transactions && ntDbBody.transactions[0]
      ? ntDbBody.transactions[0].operations
      : [];
    check(!!ntDbSave,
      'notion.create_database calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntDbOps.some(function (op) { return op.pointer && op.pointer.table === 'collection' && op.command === 'set'; })
      && ntDbOps.some(function (op) { return op.pointer && op.pointer.table === 'collection_view' && op.command === 'set'; })
      && ntDbOps.some(function (op) { return op.args && op.args.type === 'collection_view_page' && op.command === 'set'; }),
      'notion.create_database creates collection, collection_view_page, and collection_view records');
    check(ntDbOut && ntDbOut.success === true && ntDbOut.data && ntDbOut.data.databaseId,
      'notion.create_database verifies the collection and returns a database id');

    const ntItem = makeCtx('https://app.notion.com', 31);
    const ntItemOut = await nt['notion.create_database_item'].handle({
      database_id: 'database-test',
      title: 'Created row',
      properties: { Status: 'Ready' }
    }, ntItem.ctx);
    const ntItemSave = ntItem.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntItemBody = parseSpecBody(ntItemSave && ntItemSave.spec);
    const ntItemOps = ntItemBody.transactions && ntItemBody.transactions[0]
      ? ntItemBody.transactions[0].operations
      : [];
    const ntItemBlock = ntItemOps.find(function (op) { return op.pointer && op.pointer.table === 'block' && op.command === 'set'; });
    check(!!ntItemSave,
      'notion.create_database_item calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntItemBlock && ntItemBlock.args && ntItemBlock.args.properties
      && JSON.stringify(ntItemBlock.args.properties.status) === JSON.stringify([['Ready']]),
      'notion.create_database_item maps property names through the collection schema');
    check(ntItemOut && ntItemOut.success === true && ntItemOut.data && ntItemOut.data.itemId,
      'notion.create_database_item verifies the row and returns an item id');

    const ntNoSession = makeCtx('https://app.notion.com', 31, { notionNoSession: true });
    const ntNoSessionOut = await nt['notion.create_page'].handle({ title: 'No session' }, ntNoSession.ctx);
    check(ntNoSessionOut && ntNoSessionOut.success === false
      && ntNoSessionOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ntNoSessionOut.reason === 'notion-session-unavailable',
      'notion.create_page returns a typed fallback when session/space resolution fails');
    check(!ntNoSession.calls.some(function (c) { return c.spec && c.spec.url.indexOf('/api/v3/saveTransactions') !== -1; }),
      'notion.create_page missing-session path does not call saveTransactions');

    const ntSaveErr = makeCtx('https://app.notion.com', 31, {
      notionSaveStatus: 400,
      notionSaveData: { name: 'ValidationError', message: 'secret-id-redacted-by-handler-test' }
    });
    const ntSaveErrOut = await nt['notion.create_page'].handle({ title: 'Save error' }, ntSaveErr.ctx);
    check(ntSaveErrOut && ntSaveErrOut.success === false
      && ntSaveErrOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ntSaveErrOut.reason === 'notion-save-transactions-failed'
      && ntSaveErrOut.status === 400
      && JSON.stringify(ntSaveErrOut).indexOf('secret-id-redacted-by-handler-test') === -1,
      'notion saveTransactions error envelopes return typed fallback without exposing Notion error details');
  }

  // =========================================================================
  // GitLab head module -- catalog/handlers/gitlab.js
  // (16 READ T1a slugs on first-party https://gitlab.com/api/v4; 6 guarded writes).
  // Scaffolded in 40-01 so 40-02 edits ONLY catalog/handlers/gitlab.js. RED until
  // gitlab.js lands (existsSync-guarded so the suite does not crash pre-40-02).
  // =========================================================================
  const gitlabPath = path.join(HANDLERS_DIR, 'gitlab.js');
  check(fs.existsSync(gitlabPath), 'catalog/handlers/gitlab.js exists (Phase 40-02)');
  if (fs.existsSync(gitlabPath)) {
    const gl = require(gitlabPath);
    const glSrc = readSource(gitlabPath);

    const glReadCases = [
      ['gitlab.get_file_content', { project: 'group/project', file_path: 'src/index.ts', ref: 'main' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/repository/files/src%2Findex.ts?ref=main'],
      ['gitlab.get_issue', { project: 'group/project', issue_iid: 7 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/issues/7'],
      ['gitlab.get_job_log', { project: 'group/project', job_id: 42 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/jobs/42/trace'],
      ['gitlab.get_merge_request', { project: 'group/project', merge_request_iid: 8 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/merge_requests/8'],
      ['gitlab.get_merge_request_diff', { project: 'group/project', merge_request_iid: 8 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/merge_requests/8/changes'],
      ['gitlab.get_project', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject'],
      ['gitlab.get_user_profile', { username: 'alice' },
        'https://gitlab.com/api/v4/users?username=alice'],
      ['gitlab.list_branches', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/repository/branches'],
      ['gitlab.list_commits', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/repository/commits'],
      ['gitlab.list_issues', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/issues'],
      ['gitlab.list_merge_requests', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/merge_requests'],
      ['gitlab.list_notes', { project: 'group/project', noteable_type: 'issues', noteable_iid: 7 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/issues/7/notes'],
      ['gitlab.list_pipeline_jobs', { project: 'group/project', pipeline_id: 99 },
        'https://gitlab.com/api/v4/projects/group%2Fproject/pipelines/99/jobs'],
      ['gitlab.list_pipelines', { project: 'group/project' },
        'https://gitlab.com/api/v4/projects/group%2Fproject/pipelines'],
      ['gitlab.list_projects', {},
        'https://gitlab.com/api/v4/projects'],
      ['gitlab.search_projects', { search: 'fsb' },
        'https://gitlab.com/api/v4/projects?search=fsb']
    ];
    const glGuardedSlugs = [
      'gitlab.create_issue',
      'gitlab.create_merge_request',
      'gitlab.create_note',
      'gitlab.merge_merge_request',
      'gitlab.update_issue',
      'gitlab.update_merge_request'
    ];

    check(glReadCases.every(function (item) {
      const entry = gl[item[0]];
      return entry && entry.tier === 'T1a' && entry.origin === 'https://gitlab.com'
        && entry.sideEffectClass === 'read' && typeof entry.handle === 'function';
    }), 'all gitlab read slugs are tier:T1a READ entries on https://gitlab.com');
    check(glGuardedSlugs.every(function (slug) {
      const entry = gl[slug];
      return entry && entry.tier === 'T1a' && entry.origin === 'https://gitlab.com'
        && entry.sideEffectClass === 'write' && typeof entry.handle === 'function';
    }), 'all gitlab write slugs are registered as guarded T1a entries');
    check(gl['gitlab.get_issue'] && gl['gitlab.get_issue'].params
      && Array.isArray(gl['gitlab.get_issue'].params.required)
      && gl['gitlab.get_issue'].params.required.indexOf('project') !== -1
      && gl['gitlab.get_issue'].params.required.indexOf('issue_iid') !== -1,
      'gitlab.get_issue exposes a params schema requiring project + issue_iid');

    // SECURITY: same-origin /api/v4 only; NO separate api.gitlab.com host; no chrome.*.
    check(glSrc.indexOf('/api/v4') !== -1,
      'gitlab.js targets the same-origin /api/v4 path');
    check(glSrc.indexOf('api.gitlab.com') === -1,
      'gitlab.js references NO separate-origin api.gitlab.com (origin-pin correctness)');
    check(!/chrome\.(scripting|tabs)/.test(glSrc),
      'gitlab.js references NO chrome.scripting/chrome.tabs (the pin lives in executeBoundSpec)');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf)\b/i.test(glSrc),
      'gitlab.js does NOT console-log a token/cookie/csrf-bearing variable');

    for (let i = 0; i < glReadCases.length; i++) {
      const row = glReadCases[i];
      const glRead = makeCtx('https://gitlab.com', 41);
      const out = await gl[row[0]].handle(row[1], glRead.ctx);
      check(glRead.calls.length === 1 && glRead.calls[0].spec.method === 'GET',
        row[0] + ' builds one GET spec');
      check(glRead.calls.length === 1 && glRead.calls[0].spec.origin === 'https://gitlab.com',
        row[0] + ' pins the spec to gitlab.com');
      check(glRead.calls.length === 1 && glRead.calls[0].spec.url === row[2],
        row[0] + ' targets the expected /api/v4 path');
      check(out && out.success === true,
        row[0] + ' accepts a logged-in GitLab response shape');
    }

    // NEGATIVE (IN-01): a logged-out /api/v4 read answers 200 with a non-array
    // (a sign-in/redirect body parsed to an object) -> guardShape(wantArray=true)
    // must reject it with the dual-field RECIPE_DOM_FALLBACK_PENDING (NOT success),
    // proving the wrong-shape branch actually fires. readData drives the REST body.
    const glListNeg = makeCtx('https://gitlab.com', 41, { readData: { ok: false } });
    const glListNegOut = await gl['gitlab.list_projects'].handle({}, glListNeg.ctx);
    check(glListNegOut && glListNegOut.success === false
      && glListNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.fellBackToDom === true,
      'gitlab.list_projects rejects a non-array logged-out body -> RECIPE_DOM_FALLBACK_PENDING');

    // NEGATIVE (IN-02): a GitLab error envelope that coincidentally carries an `id`
    // ({ id, message:"404 ..." }) must STILL be rejected by the tightened get_*
    // guard (looksLikeGitlabError) -> RECIPE_DOM_FALLBACK_PENDING, not a false success.
    const glGetNeg = makeCtx('https://gitlab.com', 41, {
      readData: { id: 7, message: '404 Project Not Found' }
    });
    const glGetNegOut = await gl['gitlab.get_project'].handle({ project: 'g/p' }, glGetNeg.ctx);
    check(glGetNegOut && glGetNegOut.success === false
      && glGetNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && glGetNegOut.fellBackToDom === true,
      'gitlab.get_project rejects an id-bearing GitLab error envelope -> RECIPE_DOM_FALLBACK_PENDING');

    for (let i = 0; i < glGuardedSlugs.length; i++) {
      const rec = makeCtx('https://gitlab.com', 41);
      const out = await gl[glGuardedSlugs[i]].handle({}, rec.ctx);
      check(out && out.success === false && out.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && out.errorCode === out.code && out.error === out.code && out.fellBackToDom === true,
        glGuardedSlugs[i] + ' returns the dual-field guarded fallback');
      check(rec.calls.length === 0,
        glGuardedSlugs[i] + ' does not call executeBoundSpec while guarded');
    }
  }

  // =========================================================================
  // Phase 46 (T1R-06) -- first same-origin read batch: Netlify, Bitbucket,
  // CircleCI. These are GET-only, cookie-backed first-party relative API ports.
  // =========================================================================
  const netlifyPath = path.join(HANDLERS_DIR, 'netlify.js');
  check(fs.existsSync(netlifyPath), 'catalog/handlers/netlify.js exists (Phase 46)');
  if (fs.existsSync(netlifyPath)) {
    const nf = require(netlifyPath);
    const nfSrc = readSource(netlifyPath);

    check(nf['netlify.list_sites'] && nf['netlify.list_sites'].tier === 'T1a'
      && nf['netlify.list_sites'].sideEffectClass === 'read'
      && typeof nf['netlify.list_sites'].handle === 'function',
      'netlify.list_sites is a tier:T1a READ entry with an async handle');
    check(nf['netlify.get_site'] && nf['netlify.get_site'].origin === 'https://app.netlify.com',
      'netlify.get_site targets the first-party origin https://app.netlify.com');
    check(nf['netlify.list_sites'] && nf['netlify.list_sites'].params
      && Array.isArray(nf['netlify.list_sites'].params.required)
      && nf['netlify.list_sites'].params.required.indexOf('account_slug') !== -1,
      'netlify.list_sites exposes a params schema requiring account_slug');
    check(!/chrome\.(scripting|tabs)/.test(nfSrc),
      'netlify.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(nfSrc),
      'netlify.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(nfSrc),
      'netlify.js does NOT console-log a secret-bearing variable');

    const nfList = makeCtx('https://app.netlify.com', 46);
    const nfListOut = await nf['netlify.list_sites'].handle({
      account_slug: 'team-test',
      page: 2,
      per_page: 50,
      name: 'docs'
    }, nfList.ctx);
    check(nfList.calls.length === 1 && nfList.calls[0].spec.method === 'GET',
      'netlify.list_sites builds one GET spec');
    check(nfList.calls.length === 1 && nfList.calls[0].spec.origin === 'https://app.netlify.com',
      'netlify.list_sites pins the spec to app.netlify.com');
    check(nfList.calls.length === 1 && nfList.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/team-test/sites?page=2&per_page=50&name=docs',
      'netlify.list_sites targets the vendored same-origin account sites path with query filters');
    check(nfListOut && nfListOut.success === true,
      'netlify.list_sites accepts a logged-in array body');

    const nfGet = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.get_site'].handle({ site_id: 'site-123' }, nfGet.ctx);
    check(nfGet.calls.length === 1 && nfGet.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123',
      'netlify.get_site targets /sites/:site_id');

    const nfDeploys = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.list_deploys'].handle({ site_id: 'site-123', page: 3, per_page: 10 }, nfDeploys.ctx);
    check(nfDeploys.calls.length === 1 && nfDeploys.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123/deploys?page=3&per_page=10',
      'netlify.list_deploys targets /sites/:site_id/deploys with pagination');

    const nfForms = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.list_forms'].handle({ site_id: 'site-123' }, nfForms.ctx);
    check(nfForms.calls.length === 1 && nfForms.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123/forms',
      'netlify.list_forms targets /sites/:site_id/forms');

    const nfNeg = makeCtx('https://app.netlify.com', 46, { readData: { ok: false } });
    const nfNegOut = await nf['netlify.list_sites'].handle({ account_slug: 'team-test' }, nfNeg.ctx);
    check(nfNegOut && nfNegOut.success === false
      && nfNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nfNegOut.fellBackToDom === true,
      'netlify.list_sites rejects a non-array logged-out body -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const bitbucketPath = path.join(HANDLERS_DIR, 'bitbucket.js');
  check(fs.existsSync(bitbucketPath), 'catalog/handlers/bitbucket.js exists (Phase 46)');
  if (fs.existsSync(bitbucketPath)) {
    const bb = require(bitbucketPath);
    const bbSrc = readSource(bitbucketPath);

    const bbReadCases = [
      ['bitbucket.get_commit', { workspace: 'team-test', repo_slug: 'fsb', commit_hash: 'abc123' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/commit/abc123'],
      ['bitbucket.get_file_content', { workspace: 'team-test', repo_slug: 'fsb', path: 'src/index.js', ref: 'main' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/src/main/src/index.js'],
      ['bitbucket.get_pipeline', { workspace: 'team-test', repo_slug: 'fsb', pipeline_uuid: 'pipe-uuid' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pipelines/pipe-uuid'],
      ['bitbucket.get_pull_request', { workspace: 'team-test', repo_slug: 'fsb', pull_request_id: 7 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pullrequests/7'],
      ['bitbucket.get_pull_request_diff', { workspace: 'team-test', repo_slug: 'fsb', pull_request_id: 7 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pullrequests/7/diff'],
      ['bitbucket.get_repository', { workspace: 'team-test', repo_slug: 'fsb' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb'],
      ['bitbucket.get_user_profile', {},
        'https://bitbucket.org/!api/2.0/user'],
      ['bitbucket.list_branches', { workspace: 'team-test', repo_slug: 'fsb', page: 2, pagelen: 25, query: 'name ~ "main"' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/refs/branches?page=2&pagelen=25&q=name%20~%20%22main%22'],
      ['bitbucket.list_commits', { workspace: 'team-test', repo_slug: 'fsb', page: 2, pagelen: 25, branch: 'main' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/commits?page=2&pagelen=25&include=main'],
      ['bitbucket.list_pipeline_steps', { workspace: 'team-test', repo_slug: 'fsb', pipeline_uuid: 'pipe-uuid', page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pipelines/pipe-uuid/steps/?page=2&pagelen=25'],
      ['bitbucket.list_pipelines', { workspace: 'team-test', repo_slug: 'fsb', page: 2, pagelen: 25, sort: '-created_on' },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pipelines/?page=2&pagelen=25&sort=-created_on'],
      ['bitbucket.list_pr_comments', { workspace: 'team-test', repo_slug: 'fsb', pull_request_id: 7, page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pullrequests/7/comments?page=2&pagelen=25'],
      ['bitbucket.list_pull_requests', { workspace: 'team-test', repo_slug: 'fsb', state: 'OPEN', page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/pullrequests?state=OPEN&page=2&pagelen=25'],
      ['bitbucket.list_repositories', { workspace: 'team-test', page: 1, pagelen: 10, query: 'name ~ "fsb"' },
        'https://bitbucket.org/!api/2.0/repositories/team-test?page=1&pagelen=10&q=name%20~%20%22fsb%22'],
      ['bitbucket.list_tags', { workspace: 'team-test', repo_slug: 'fsb', page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/repositories/team-test/fsb/refs/tags?page=2&pagelen=25'],
      ['bitbucket.list_workspace_members', { workspace: 'team-test', page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/workspaces/team-test/members?page=2&pagelen=25'],
      ['bitbucket.list_workspaces', { page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/workspaces?page=2&pagelen=25'],
      ['bitbucket.search_code', { workspace: 'team-test', search_query: 'TODO', page: 2, pagelen: 25 },
        'https://bitbucket.org/!api/2.0/workspaces/team-test/search/code?search_query=TODO&page=2&pagelen=25']
    ];
    const bbGuardedSlugs = [
      'bitbucket.approve_pull_request',
      'bitbucket.create_branch',
      'bitbucket.create_pr_comment',
      'bitbucket.create_pull_request',
      'bitbucket.create_repository',
      'bitbucket.decline_pull_request',
      'bitbucket.delete_branch',
      'bitbucket.merge_pull_request',
      'bitbucket.update_pull_request'
    ];

    check(bbReadCases.every(function (item) {
      const entry = bb[item[0]];
      return entry && entry.tier === 'T1a' && entry.origin === 'https://bitbucket.org'
        && entry.sideEffectClass === 'read' && typeof entry.handle === 'function';
    }), 'all bitbucket read slugs are tier:T1a READ entries on https://bitbucket.org');
    check(bbGuardedSlugs.every(function (slug) {
      const entry = bb[slug];
      return entry && entry.tier === 'T1a' && entry.origin === 'https://bitbucket.org'
        && (entry.sideEffectClass === 'write' || entry.sideEffectClass === 'destructive')
        && typeof entry.handle === 'function';
    }), 'all bitbucket write/destructive slugs are registered as guarded T1a entries');
    check(bb['bitbucket.get_repository'] && bb['bitbucket.get_repository'].params
      && Array.isArray(bb['bitbucket.get_repository'].params.required)
      && bb['bitbucket.get_repository'].params.required.indexOf('workspace') !== -1
      && bb['bitbucket.get_repository'].params.required.indexOf('repo_slug') !== -1,
      'bitbucket.get_repository exposes a params schema requiring workspace + repo_slug');
    check(!/chrome\.(scripting|tabs)/.test(bbSrc),
      'bitbucket.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(bbSrc),
      'bitbucket.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(bbSrc),
      'bitbucket.js does NOT console-log a secret-bearing variable');

    for (let i = 0; i < bbReadCases.length; i++) {
      const row = bbReadCases[i];
      const bbRead = makeCtx('https://bitbucket.org', 47);
      const out = await bb[row[0]].handle(row[1], bbRead.ctx);
      check(bbRead.calls.length === 1 && bbRead.calls[0].spec.method === 'GET',
        row[0] + ' builds one GET spec');
      check(bbRead.calls.length === 1 && bbRead.calls[0].spec.origin === 'https://bitbucket.org',
        row[0] + ' pins the spec to bitbucket.org');
      check(bbRead.calls.length === 1 && bbRead.calls[0].spec.url === row[2],
        row[0] + ' targets the expected /!api/2.0 path');
      check(out && out.success === true,
        row[0] + ' accepts a logged-in Bitbucket response shape');
    }

    const bbNeg = makeCtx('https://bitbucket.org', 47, { readData: { type: 'error', error: { message: 'no auth' } } });
    const bbNegOut = await bb['bitbucket.get_repository'].handle({ workspace: 'team-test', repo_slug: 'fsb' }, bbNeg.ctx);
    check(bbNegOut && bbNegOut.success === false
      && bbNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && bbNegOut.fellBackToDom === true,
      'bitbucket.get_repository rejects a Bitbucket error envelope -> RECIPE_DOM_FALLBACK_PENDING');

    for (let i = 0; i < bbGuardedSlugs.length; i++) {
      const rec = makeCtx('https://bitbucket.org', 47);
      const out = await bb[bbGuardedSlugs[i]].handle({}, rec.ctx);
      check(out && out.success === false && out.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && out.errorCode === out.code && out.error === out.code && out.fellBackToDom === true,
        bbGuardedSlugs[i] + ' returns the dual-field guarded fallback');
      check(rec.calls.length === 0,
        bbGuardedSlugs[i] + ' does not call executeBoundSpec while guarded');
    }
  }

  const circleciPath = path.join(HANDLERS_DIR, 'circleci.js');
  check(fs.existsSync(circleciPath), 'catalog/handlers/circleci.js exists (Phase 46)');
  if (fs.existsSync(circleciPath)) {
    const cc = require(circleciPath);
    const ccSrc = readSource(circleciPath);

    check(cc['circleci.get_current_user'] && cc['circleci.get_current_user'].tier === 'T1a'
      && cc['circleci.get_current_user'].sideEffectClass === 'read'
      && typeof cc['circleci.get_current_user'].handle === 'function',
      'circleci.get_current_user is a tier:T1a READ entry with an async handle');
    check(cc['circleci.list_pipelines'] && cc['circleci.list_pipelines'].origin === 'https://app.circleci.com',
      'circleci.list_pipelines targets the first-party origin https://app.circleci.com');
    check(cc['circleci.list_pipelines'] && cc['circleci.list_pipelines'].params
      && Array.isArray(cc['circleci.list_pipelines'].params.required)
      && cc['circleci.list_pipelines'].params.required.indexOf('project_slug') !== -1,
      'circleci.list_pipelines exposes a params schema requiring project_slug');
    check(!/chrome\.(scripting|tabs)/.test(ccSrc),
      'circleci.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(ccSrc),
      'circleci.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(ccSrc),
      'circleci.js does NOT console-log a secret-bearing variable');

    const ccMe = makeCtx('https://app.circleci.com', 48);
    const ccMeOut = await cc['circleci.get_current_user'].handle({}, ccMe.ctx);
    check(ccMe.calls.length === 1 && ccMe.calls[0].spec.method === 'GET',
      'circleci.get_current_user builds one GET spec');
    check(ccMe.calls.length === 1 && ccMe.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/me',
      'circleci.get_current_user targets /api/v2/me');
    check(ccMeOut && ccMeOut.success === true,
      'circleci.get_current_user accepts a logged-in user object');

    const ccPipes = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.list_pipelines'].handle({
      project_slug: 'gh/org/repo',
      branch: 'main',
      mine: true,
      page_token: 'next-token'
    }, ccPipes.ctx);
    check(ccPipes.calls.length === 1 && ccPipes.calls[0].spec.origin === 'https://app.circleci.com',
      'circleci.list_pipelines pins the spec to app.circleci.com');
    check(ccPipes.calls.length === 1 && ccPipes.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/pipeline?branch=main&mine=true&page-token=next-token',
      'circleci.list_pipelines preserves project_slug path segments and maps page_token to page-token');

    const ccProject = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_project'].handle({ project_slug: 'gh/org/repo' }, ccProject.ctx);
    check(ccProject.calls.length === 1 && ccProject.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo',
      'circleci.get_project targets /api/v2/project/:project_slug');

    check(cc['circleci.get_pipeline'] && cc['circleci.get_pipeline'].tier === 'T1a'
      && cc['circleci.get_pipeline'].sideEffectClass === 'read'
      && typeof cc['circleci.get_pipeline'].handle === 'function',
      'circleci.get_pipeline is a tier:T1a READ entry with an async handle');
    check(cc['circleci.get_job_tests'] && cc['circleci.get_job_tests'].tier === 'T1a'
      && cc['circleci.get_job_tests'].sideEffectClass === 'read'
      && typeof cc['circleci.get_job_tests'].handle === 'function',
      'circleci.get_job_tests is a tier:T1a READ entry with an async handle');

    const ccPipeline = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_pipeline'].handle({ pipeline_id: 'pipeline-123' }, ccPipeline.ctx);
    check(ccPipeline.calls.length === 1 && ccPipeline.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/pipeline/pipeline-123',
      'circleci.get_pipeline targets /api/v2/pipeline/:pipeline_id');

    const ccPipelineWorkflows = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_pipeline_workflows'].handle({ pipeline_id: 'pipeline-123', page_token: 'next-token' }, ccPipelineWorkflows.ctx);
    check(ccPipelineWorkflows.calls.length === 1 && ccPipelineWorkflows.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/pipeline/pipeline-123/workflow?page-token=next-token',
      'circleci.get_pipeline_workflows targets /api/v2/pipeline/:pipeline_id/workflow with page-token');

    const ccWorkflow = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_workflow'].handle({ workflow_id: 'workflow-123' }, ccWorkflow.ctx);
    check(ccWorkflow.calls.length === 1 && ccWorkflow.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/workflow/workflow-123',
      'circleci.get_workflow targets /api/v2/workflow/:workflow_id');

    const ccWorkflowJobs = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_workflow_jobs'].handle({ workflow_id: 'workflow-123', page_token: 'job-token' }, ccWorkflowJobs.ctx);
    check(ccWorkflowJobs.calls.length === 1 && ccWorkflowJobs.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/workflow/workflow-123/job?page-token=job-token',
      'circleci.get_workflow_jobs targets /api/v2/workflow/:workflow_id/job with page-token');

    const ccJob = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccJob.ctx);
    check(ccJob.calls.length === 1 && ccJob.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/job/42',
      'circleci.get_job targets /api/v2/project/:project_slug/job/:job_number');

    const ccArtifacts = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job_artifacts'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccArtifacts.ctx);
    check(ccArtifacts.calls.length === 1 && ccArtifacts.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/42/artifacts',
      'circleci.get_job_artifacts targets /api/v2/project/:project_slug/:job_number/artifacts');

    const ccTests = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job_tests'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccTests.ctx);
    check(ccTests.calls.length === 1 && ccTests.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/42/tests',
      'circleci.get_job_tests targets /api/v2/project/:project_slug/:job_number/tests');

    const ccPipelineConfig = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_pipeline_config'].handle({ pipeline_id: 'pipeline-123' }, ccPipelineConfig.ctx);
    check(ccPipelineConfig.calls.length === 1 && ccPipelineConfig.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/pipeline/pipeline-123/config',
      'circleci.get_pipeline_config targets /api/v2/pipeline/:pipeline_id/config');

    const ccProjectMetrics = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_project_workflow_metrics'].handle({
      project_slug: 'gh/org/repo',
      branch: 'main',
      reporting_window: 'last-30-days',
      page_token: 'metrics-token'
    }, ccProjectMetrics.ctx);
    check(ccProjectMetrics.calls.length === 1 && ccProjectMetrics.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/insights/gh/org/repo/workflows?branch=main&reporting-window=last-30-days&page-token=metrics-token',
      'circleci.get_project_workflow_metrics maps reporting_window and page_token query keys');

    const ccWorkflowMetrics = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_workflow_job_metrics'].handle({
      project_slug: 'gh/org/repo',
      workflow_name: 'build test',
      reporting_window: 'last-7-days',
      page_token: 'job-metrics-token'
    }, ccWorkflowMetrics.ctx);
    check(ccWorkflowMetrics.calls.length === 1 && ccWorkflowMetrics.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/insights/gh/org/repo/workflows/build%20test/jobs?reporting-window=last-7-days&page-token=job-metrics-token',
      'circleci.get_workflow_job_metrics encodes workflow_name and query keys');

    const ccContextVars = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.list_context_env_vars'].handle({ context_id: 'context-123', page_token: 'vars-token' }, ccContextVars.ctx);
    check(ccContextVars.calls.length === 1 && ccContextVars.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/context/context-123/environment-variable?page-token=vars-token',
      'circleci.list_context_env_vars targets /context/:id/environment-variable with page-token');

    const ccContexts = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.list_contexts'].handle({ owner_id: 'org-123', owner_type: 'organization', page_token: 'context-token' }, ccContexts.ctx);
    check(ccContexts.calls.length === 1 && ccContexts.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/context?owner-id=org-123&owner-type=organization&page-token=context-token',
      'circleci.list_contexts maps owner and page token query keys');

    const ccSchedules = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.list_schedules'].handle({ project_slug: 'gh/org/repo', page_token: 'schedule-token' }, ccSchedules.ctx);
    check(ccSchedules.calls.length === 1 && ccSchedules.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/schedule?page-token=schedule-token',
      'circleci.list_schedules targets /project/:project_slug/schedule with page-token');

    const ccGuard = makeCtx('https://app.circleci.com', 48);
    const ccGuardOut = await cc['circleci.trigger_pipeline'].handle({ project_slug: 'gh/org/repo' }, ccGuard.ctx);
    check(ccGuardOut && ccGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ccGuardOut.errorCode === ccGuardOut.code
      && ccGuardOut.error === ccGuardOut.code
      && ccGuardOut.fellBackToDom === true
      && ccGuard.calls.length === 0,
      'circleci.trigger_pipeline is guarded fail-closed and does not call executeBoundSpec');

    const ccNeg = makeCtx('https://app.circleci.com', 48, { readData: { message: 'not authenticated' } });
    const ccNegOut = await cc['circleci.get_current_user'].handle({}, ccNeg.ctx);
    check(ccNegOut && ccNegOut.success === false
      && ccNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ccNegOut.fellBackToDom === true,
      'circleci.get_current_user rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const vercelPath = path.join(HANDLERS_DIR, 'vercel.js');
  check(fs.existsSync(vercelPath), 'catalog/handlers/vercel.js exists (Phase 48)');
  if (fs.existsSync(vercelPath)) {
    const vc = require(vercelPath);
    const vcSrc = readSource(vercelPath);

    check(vc['vercel.list_projects'] && vc['vercel.list_projects'].tier === 'T1a'
      && vc['vercel.list_projects'].sideEffectClass === 'read'
      && typeof vc['vercel.list_projects'].handle === 'function',
      'vercel.list_projects is a tier:T1a READ entry with an async handle');
    check(vc['vercel.get_project'] && vc['vercel.get_project'].origin === 'https://vercel.com',
      'vercel.get_project targets the first-party origin https://vercel.com');
    check(vc['vercel.get_project'] && vc['vercel.get_project'].params
      && Array.isArray(vc['vercel.get_project'].params.required)
      && vc['vercel.get_project'].params.required.indexOf('project') !== -1,
      'vercel.get_project exposes a params schema requiring project');
    check(!/chrome\.(scripting|tabs)/.test(vcSrc),
      'vercel.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(vcSrc),
      'vercel.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(vcSrc),
      'vercel.js does NOT console-log a secret-bearing variable');

    const vcUser = makeCtx('https://vercel.com', 49);
    const vcUserOut = await vc['vercel.get_user'].handle({}, vcUser.ctx);
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.method === 'GET',
      'vercel.get_user builds one GET spec');
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.origin === 'https://vercel.com',
      'vercel.get_user pins the spec to vercel.com');
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.url ===
      'https://vercel.com/api/www/user',
      'vercel.get_user targets /api/www/user');
    check(vcUserOut && vcUserOut.success === true,
      'vercel.get_user accepts a logged-in user payload');

    const vcTeams = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_teams'].handle({ limit: 10, since: 'cursor-1' }, vcTeams.ctx);
    check(vcTeams.calls.length === 1 && vcTeams.calls[0].spec.url ===
      'https://vercel.com/api/v2/teams?limit=10&since=cursor-1',
      'vercel.list_teams targets /api/v2/teams with pagination');

    const vcProjects = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_projects'].handle({ limit: 25, from: 'cursor-2', search: 'docs' }, vcProjects.ctx);
    check(vcProjects.calls.length === 1 && vcProjects.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects?limit=25&from=cursor-2&search=docs',
      'vercel.list_projects targets /api/v9/projects with filters');

    const vcProject = makeCtx('https://vercel.com', 49);
    await vc['vercel.get_project'].handle({ project: 'project-test' }, vcProject.ctx);
    check(vcProject.calls.length === 1 && vcProject.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects/project-test',
      'vercel.get_project targets /api/v9/projects/:project');

    const vcDeployments = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_deployments'].handle({
      limit: 20,
      from: '1700000000000',
      project: 'project-test',
      target: 'production',
      state: 'READY'
    }, vcDeployments.ctx);
    check(vcDeployments.calls.length === 1 && vcDeployments.calls[0].spec.url ===
      'https://vercel.com/api/v6/deployments?limit=20&from=1700000000000&projectId=project-test&target=production&state=READY',
      'vercel.list_deployments maps project to projectId and targets /api/v6/deployments');

    const vcDeployment = makeCtx('https://vercel.com', 49);
    await vc['vercel.get_deployment'].handle({ deployment_id: 'dpl_123' }, vcDeployment.ctx);
    check(vcDeployment.calls.length === 1 && vcDeployment.calls[0].spec.url ===
      'https://vercel.com/api/v13/deployments/dpl_123',
      'vercel.get_deployment targets /api/v13/deployments/:deployment_id');

    const vcDomains = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_domains'].handle({ project: 'project-test' }, vcDomains.ctx);
    check(vcDomains.calls.length === 1 && vcDomains.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects/project-test/domains',
      'vercel.list_domains targets /api/v9/projects/:project/domains');

    const vcNeg = makeCtx('https://vercel.com', 49, { readData: { error: { message: 'not authenticated' } } });
    const vcNegOut = await vc['vercel.list_projects'].handle({}, vcNeg.ctx);
    check(vcNegOut && vcNegOut.success === false
      && vcNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && vcNegOut.fellBackToDom === true,
      'vercel.list_projects rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const retoolPath = path.join(HANDLERS_DIR, 'retool.js');
  check(fs.existsSync(retoolPath), 'catalog/handlers/retool.js exists (Phase 51)');
  if (fs.existsSync(retoolPath)) {
    const rt = require(retoolPath);
    const rtSrc = readSource(retoolPath);
    const expectedRetoolSlugs = [
      'retool.get_app',
      'retool.get_app_docs',
      'retool.get_app_state',
      'retool.get_current_user',
      'retool.get_organization',
      'retool.get_resource',
      'retool.get_source_control_settings',
      'retool.get_workflow',
      'retool.get_workflow_releases',
      'retool.get_workflow_run',
      'retool.get_workflow_run_count',
      'retool.get_workflow_run_log',
      'retool.get_workflows_config',
      'retool.list_agents',
      'retool.list_app_tags',
      'retool.list_apps',
      'retool.list_branches',
      'retool.list_components',
      'retool.list_environments',
      'retool.list_experiments',
      'retool.list_grids',
      'retool.list_page_names',
      'retool.list_page_saves',
      'retool.list_playground_queries',
      'retool.list_resources',
      'retool.list_user_spaces',
      'retool.list_workflow_triggers',
      'retool.list_workflows'
    ];
    const guardedRetoolSlugs = [
      'retool.add_component',
      'retool.add_query',
      'retool.change_user_name',
      'retool.clone_app',
      'retool.create_app',
      'retool.create_app_from_toolscript_archive',
      'retool.create_folder',
      'retool.create_resource',
      'retool.create_resource_folder',
      'retool.delete_app',
      'retool.delete_folder',
      'retool.delete_resource_folder',
      'retool.export_toolscript_archive',
      'retool.force_editor_save',
      'retool.list_workflow_runs',
      'retool.lookup_app',
      'retool.move_resource_to_folder',
      'retool.rename_folder',
      'retool.run_grpc',
      'retool.run_query',
      'retool.save_page',
      'retool.update_app_from_toolscript_archive'
    ];

    check(expectedRetoolSlugs.every(function (slug) {
      return rt[slug] && rt[slug].tier === 'T1a'
        && rt[slug].sideEffectClass === 'read'
        && rt[slug].origin === 'https://retool.com'
        && rt[slug].params
        && rt[slug].params.type === 'object'
        && typeof rt[slug].handle === 'function';
    }), 'all 28 Retool same-origin reads are tier:T1a READ entries pinned to https://retool.com');
    check(guardedRetoolSlugs.every(function (slug) {
      return rt[slug] && rt[slug].tier === 'T1a'
        && (rt[slug].sideEffectClass === 'write' || rt[slug].sideEffectClass === 'destructive')
        && rt[slug].origin === 'https://retool.com'
        && rt[slug].params
        && rt[slug].params.type === 'object'
        && typeof rt[slug].handle === 'function';
    }), 'all 22 Retool mutation/save/query rows are registered as guarded non-read entries');
    check(!/chrome\.(scripting|tabs)/.test(rtSrc),
      'retool.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(rtSrc),
      'retool.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|xsrf)\b/i.test(rtSrc),
      'retool.js does NOT console-log a secret-bearing variable');

    const rtUser = makeCtx('https://retool.com', 51);
    const rtUserOut = await rt['retool.get_current_user'].handle({}, rtUser.ctx);
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.method === 'GET',
      'retool.get_current_user builds one GET spec');
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.origin === 'https://retool.com',
      'retool.get_current_user pins the spec to retool.com');
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.url === 'https://retool.com/api/user',
      'retool.get_current_user targets /api/user');
    check(rtUser.calls.length === 1
      && rtUser.calls[0].spec.csrfSource
      && rtUser.calls[0].spec.csrfSource.from === 'cookie'
      && rtUser.calls[0].spec.csrfSource.selector === 'xsrfToken'
      && rtUser.calls[0].spec.csrfSource.header === 'X-Xsrf-Token',
      'retool.get_current_user uses the cookie csrfSource for X-Xsrf-Token');
    check(rtUserOut && rtUserOut.success === true,
      'retool.get_current_user accepts a logged-in user envelope');

    const rtApps = makeCtx('https://retool.com', 51);
    const rtAppsOut = await rt['retool.list_apps'].handle({}, rtApps.ctx);
    check(rtApps.calls.length === 1 && rtApps.calls[0].spec.url === 'https://retool.com/api/pages',
      'retool.list_apps targets /api/pages');
    check(rtAppsOut && rtAppsOut.success === true,
      'retool.list_apps accepts a pages/folders envelope');

    // Plain-text recovery: executeBoundSpec answers a non-JSON body as
    // { success:true, data:null, text:'...' }. dataFromResult must recover the
    // text (data == null, not the dead data === undefined) so the text-tolerant
    // get_app_docs guard accepts a text/plain documentation body instead of
    // falling back with retool-api-shape-mismatch.
    const rtDocsText = makeCtx('https://retool.com', 51, { readText: 'Plain-text app documentation body' });
    const rtDocsTextOut = await rt['retool.get_app_docs'].handle({ page_uuid: 'page-1' }, rtDocsText.ctx);
    check(rtDocsText.calls.length === 1
      && rtDocsText.calls[0].spec.url === 'https://retool.com/api/pages/uuids/page-1/documentation',
      'retool.get_app_docs targets /documentation');
    check(rtDocsTextOut && rtDocsTextOut.success === true && rtDocsTextOut.code !== 'RECIPE_DOM_FALLBACK_PENDING',
      'retool.get_app_docs accepts a text/plain body via the result.text recovery (data:null no longer shape-mismatches)');

    const rtGrids = makeCtx('https://retool.com', 51);
    const rtGridsOut = await rt['retool.list_grids'].handle({}, rtGrids.ctx);
    check(rtGrids.calls.length === 1 && rtGrids.calls[0].spec.url === 'https://retool.com/api/grid',
      'retool.list_grids targets /api/grid');
    check(rtGridsOut && rtGridsOut.success === true,
      'retool.list_grids accepts an array body');

    const rtWorkflows = makeCtx('https://retool.com', 51);
    const rtWorkflowsOut = await rt['retool.list_workflows'].handle({}, rtWorkflows.ctx);
    check(rtWorkflows.calls.length === 1 && rtWorkflows.calls[0].spec.url === 'https://retool.com/api/workflow/',
      'retool.list_workflows targets /api/workflow/');
    check(rtWorkflowsOut && rtWorkflowsOut.success === true,
      'retool.list_workflows accepts a workflows/folders envelope');

    const rtResources = makeCtx('https://retool.com', 51);
    await rt['retool.list_resources'].handle({}, rtResources.ctx);
    check(rtResources.calls.length === 1 && rtResources.calls[0].spec.url === 'https://retool.com/api/resources',
      'retool.list_resources targets /api/resources');

    const rtApp = makeCtx('https://retool.com', 51);
    const rtAppOut = await rt['retool.get_app_state'].handle({ page_uuid: 'page-1' }, rtApp.ctx);
    check(rtApp.calls.length === 1 && rtApp.calls[0].spec.url === 'https://retool.com/api/pages/uuids/page-1',
      'retool.get_app_state targets /api/pages/uuids/:page_uuid');
    check(rtAppOut && rtAppOut.success === true,
      'retool.get_app_state accepts an app state envelope');

    const rtComponents = makeCtx('https://retool.com', 51);
    const rtComponentsOut = await rt['retool.list_components'].handle({ page_uuid: 'page-1' }, rtComponents.ctx);
    check(rtComponents.calls.length === 1 && rtComponents.calls[0].spec.url === 'https://retool.com/api/pages/uuids/page-1',
      'retool.list_components reads app state from /api/pages/uuids/:page_uuid');
    check(rtComponentsOut && rtComponentsOut.success === true
      && rtComponentsOut.data && Array.isArray(rtComponentsOut.data.components),
      'retool.list_components maps Transit app state to a component array');

    const rtWorkflow = makeCtx('https://retool.com', 51);
    await rt['retool.get_workflow'].handle({ workflow_id: 'wf_1', branch_name: 'main' }, rtWorkflow.ctx);
    check(rtWorkflow.calls.length === 1 && rtWorkflow.calls[0].spec.url === 'https://retool.com/api/workflow/wf_1?branchName=main',
      'retool.get_workflow targets /api/workflow/:workflow_id with branchName');

    const rtRunLog = makeCtx('https://retool.com', 51);
    await rt['retool.get_workflow_run_log'].handle({ run_id: 'run-1' }, rtRunLog.ctx);
    check(rtRunLog.calls.length === 1 && rtRunLog.calls[0].spec.url === 'https://retool.com/api/workflowRun/getLog?runId=run-1',
      'retool.get_workflow_run_log targets /api/workflowRun/getLog');

    const rtTriggers = makeCtx('https://retool.com', 51);
    await rt['retool.list_workflow_triggers'].handle({ workflow_id: 'wf_1' }, rtTriggers.ctx);
    check(rtTriggers.calls.length === 1 && rtTriggers.calls[0].spec.url === 'https://retool.com/api/workflowTrigger?workflowId=wf_1',
      'retool.list_workflow_triggers targets /api/workflowTrigger');

    const rtGuardCtx = makeCtx('https://retool.com', 51);
    const rtGuardOut = await rt['retool.save_page'].handle({ page_uuid: 'page-1', app_state: '{}' }, rtGuardCtx.ctx);
    check(rtGuardOut && rtGuardOut.success === false
      && rtGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtGuardOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtGuardOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtGuardOut.fellBackToDom === true,
      'retool.save_page is guarded fail-closed');
    check(rtGuardCtx.calls.length === 0,
      'retool.save_page does not call executeBoundSpec while guarded');

    const rtNeg = makeCtx('https://retool.com', 51, { readData: { error: 'not authenticated' } });
    const rtNegOut = await rt['retool.list_apps'].handle({}, rtNeg.ctx);
    check(rtNegOut && rtNegOut.success === false
      && rtNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.fellBackToDom === true,
      'retool.list_apps rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const asanaPath = path.join(HANDLERS_DIR, 'asana.js');
  check(fs.existsSync(asanaPath), 'catalog/handlers/asana.js exists (Phase 51)');
  if (fs.existsSync(asanaPath)) {
    const as = require(asanaPath);
    const asSrc = readSource(asanaPath);
    const expectedAsanaSlugs = [
      'asana.get_current_user',
      'asana.get_project',
      'asana.get_stories_for_task',
      'asana.get_subtasks',
      'asana.get_task',
      'asana.get_tasks_for_project',
      'asana.get_tasks_for_section',
      'asana.get_user',
      'asana.list_projects',
      'asana.list_sections',
      'asana.list_tags',
      'asana.list_teams',
      'asana.list_users_for_workspace',
      'asana.list_workspaces',
      'asana.search_tasks'
    ];

    check(expectedAsanaSlugs.every(function (slug) {
      return as[slug] && as[slug].tier === 'T1a'
        && as[slug].sideEffectClass === 'read'
        && as[slug].origin === 'https://app.asana.com'
        && as[slug].params
        && as[slug].params.type === 'object'
        && typeof as[slug].handle === 'function';
    }), 'all 15 Asana selected reads are tier:T1a READ entries pinned to https://app.asana.com');
    check(!/chrome\.(scripting|tabs)/.test(asSrc),
      'asana.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(asSrc),
      'asana.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|auth_token)\b/i.test(asSrc),
      'asana.js does NOT console-log a secret-bearing variable');

    const asUser = makeCtx('https://app.asana.com', 51);
    const asUserOut = await as['asana.get_current_user'].handle({}, asUser.ctx);
    check(asUser.calls.length === 1 && asUser.calls[0].spec.method === 'GET',
      'asana.get_current_user builds one GET spec');
    check(asUser.calls.length === 1 && asUser.calls[0].spec.origin === 'https://app.asana.com',
      'asana.get_current_user pins the spec to app.asana.com');
    check(asUser.calls.length === 1 && asUser.calls[0].spec.url.indexOf('https://app.asana.com/api/1.0/users/me?') === 0,
      'asana.get_current_user targets /api/1.0/users/me');
    check(asUserOut && asUserOut.success === true,
      'asana.get_current_user accepts a logged-in Asana data envelope');

    const asWorkspaces = makeCtx('https://app.asana.com', 51);
    const asWorkspacesOut = await as['asana.list_workspaces'].handle({}, asWorkspaces.ctx);
    check(asWorkspaces.calls.length === 1 && asWorkspaces.calls[0].spec.url === 'https://app.asana.com/api/1.0/workspaces',
      'asana.list_workspaces targets /api/1.0/workspaces');
    check(asWorkspacesOut && asWorkspacesOut.success === true,
      'asana.list_workspaces accepts an array data envelope');

    const asProjects = makeCtx('https://app.asana.com', 51);
    await as['asana.list_projects'].handle({ workspace_gid: 'workspace-test', archived: false, limit: 10, offset: 'next-page' }, asProjects.ctx);
    check(asProjects.calls.length === 1
      && asProjects.calls[0].spec.url.indexOf('https://app.asana.com/api/1.0/projects?') === 0
      && asProjects.calls[0].spec.url.indexOf('workspace=workspace-test') !== -1
      && asProjects.calls[0].spec.url.indexOf('archived=false') !== -1
      && asProjects.calls[0].spec.url.indexOf('limit=10') !== -1
      && asProjects.calls[0].spec.url.indexOf('offset=next-page') !== -1,
      'asana.list_projects maps workspace, archived, limit, and offset query params');

    const asTask = makeCtx('https://app.asana.com', 51);
    await as['asana.get_task'].handle({ task_gid: 'task test', opt_fields: 'gid,name' }, asTask.ctx);
    check(asTask.calls.length === 1
      && asTask.calls[0].spec.url.indexOf('https://app.asana.com/api/1.0/tasks/task%20test?') === 0
      && asTask.calls[0].spec.url.indexOf('opt_fields=gid%2Cname') !== -1,
      'asana.get_task encodes task_gid and caller opt_fields');

    const asSearch = makeCtx('https://app.asana.com', 51);
    await as['asana.search_tasks'].handle({
      workspace_gid: 'workspace-test',
      text: 'bug fix',
      assignee_gid: 'user-test',
      completed: false,
      projects_any: 'project-a,project-b',
      limit: 5
    }, asSearch.ctx);
    check(asSearch.calls.length === 1
      && asSearch.calls[0].spec.url.indexOf('https://app.asana.com/api/1.0/workspaces/workspace-test/tasks/search?') === 0
      && asSearch.calls[0].spec.url.indexOf('text=bug%20fix') !== -1
      && asSearch.calls[0].spec.url.indexOf('assignee.any=user-test') !== -1
      && asSearch.calls[0].spec.url.indexOf('completed=false') !== -1
      && asSearch.calls[0].spec.url.indexOf('projects.any=project-a%2Cproject-b') !== -1,
      'asana.search_tasks maps filtered search query params');

    const asNeg = makeCtx('https://app.asana.com', 51, { readData: { errors: [{ message: 'not authenticated' }] } });
    const asNegOut = await as['asana.list_workspaces'].handle({}, asNeg.ctx);
    check(asNegOut && asNegOut.success === false
      && asNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && asNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && asNegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && asNegOut.fellBackToDom === true,
      'asana.list_workspaces rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  // =========================================================================
  // Shortcut head -- catalog/handlers/shortcut.js (tenant-header same-origin reads)
  // =========================================================================
  const shortcutPath = path.join(HANDLERS_DIR, 'shortcut.js');
  check(fs.existsSync(shortcutPath), 'catalog/handlers/shortcut.js exists');
  if (fs.existsSync(shortcutPath)) {
    const sc = require(shortcutPath);
    const scSrc = readSource(shortcutPath);

    check(sc['shortcut.get_current_user'] && sc['shortcut.get_current_user'].tier === 'T1a'
      && typeof sc['shortcut.get_current_user'].handle === 'function',
      'shortcut.get_current_user is a tier:T1a entry with an async handle');
    check(sc['shortcut.get_current_user'] && sc['shortcut.get_current_user'].origin === 'https://app.shortcut.com',
      'shortcut.get_current_user targets the first-party origin https://app.shortcut.com');
    check(sc['shortcut.list_workflows'] && sc['shortcut.list_workflows'].params
      && sc['shortcut.list_workflows'].params.additionalProperties === false,
      'shortcut no-param reads expose closed empty params schemas');
    check(!/chrome\.(scripting|tabs)/.test(scSrc),
      'shortcut.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(scSrc),
      'shortcut.js performs NO direct fetch/XMLHttpRequest; it only builds bound specs');

    const scUser = makeCtx('https://app.shortcut.com', 81, {
      url: 'https://app.shortcut.com/workspace-test/stories'
    });
    const scUserOut = await sc['shortcut.get_current_user'].handle({}, scUser.ctx);
    check(scUser.calls.length === 2,
      'shortcut.get_current_user bootstraps tenant ids then calls the member endpoint');
    check(scUser.calls.length === 2
      && scUser.calls[0].spec.url === 'https://app.shortcut.com/backend/api/private/user/slug-info/workspace-test',
      'shortcut.get_current_user derives the workspace slug from ctx.url for slug-info bootstrap');
    check(scUser.calls.length === 2
      && scUser.calls[1].spec.url === 'https://app.shortcut.com/backend/api/v3/member',
      'shortcut.get_current_user calls the same-origin /backend/api/v3/member endpoint');
    check(scUser.calls.length === 2
      && scUser.calls[1].spec.headers
      && scUser.calls[1].spec.headers['Tenant-Organization2'] === 'org-test'
      && scUser.calls[1].spec.headers['Tenant-Workspace2'] === 'workspace-test',
      'shortcut API specs include tenant organization/workspace headers inside the bound spec');
    check(scUserOut && scUserOut.success === true,
      'shortcut.get_current_user succeeds with a valid member response');

    const scList = makeCtx('https://app.shortcut.com', 82, {
      url: 'https://app.shortcut.com/workspace-test/epics'
    });
    const scListOut = await sc['shortcut.list_epics'].handle({}, scList.ctx);
    check(scList.calls.length === 2
      && scList.calls[1].spec.url === 'https://app.shortcut.com/backend/api/v3/epics',
      'shortcut.list_epics calls the same-origin /backend/api/v3/epics endpoint after bootstrap');
    check(scListOut && scListOut.success === true && Array.isArray(scListOut.data),
      'shortcut.list_epics succeeds only on an array response');

    const scNoSlug = makeCtx('https://app.shortcut.com', 83, {
      url: 'https://app.shortcut.com/login'
    });
    const scNoSlugOut = await sc['shortcut.list_epics'].handle({}, scNoSlug.ctx);
    check(scNoSlug.calls.length === 0,
      'shortcut missing-workspace path makes no credentialed API calls');
    check(scNoSlugOut && scNoSlugOut.success === false
      && scNoSlugOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && scNoSlugOut.reason === 'shortcut-workspace-slug-unavailable',
      'shortcut missing-workspace path returns the dual-field DOM fallback reason');

    const scBadBootstrap = makeCtx('https://app.shortcut.com', 84, {
      url: 'https://app.shortcut.com/workspace-test/stories',
      shortcutSlugInfoData: { id: 'workspace-test' }
    });
    const scBadBootstrapOut = await sc['shortcut.list_epics'].handle({}, scBadBootstrap.ctx);
    check(scBadBootstrap.calls.length === 1,
      'shortcut bad-bootstrap path stops before the tenant API call');
    check(scBadBootstrapOut && scBadBootstrapOut.success === false
      && scBadBootstrapOut.reason === 'shortcut-auth-bootstrap-unavailable',
      'shortcut bad-bootstrap shape returns a DOM fallback reason');

    const scBadShape = makeCtx('https://app.shortcut.com', 85, {
      url: 'https://app.shortcut.com/workspace-test/epics',
      shortcutApiData: { ok: true }
    });
    const scBadShapeOut = await sc['shortcut.list_epics'].handle({}, scBadShape.ctx);
    check(scBadShape.calls.length === 2,
      'shortcut bad-list-shape path reaches the tenant API call');
    check(scBadShapeOut && scBadShapeOut.success === false
      && scBadShapeOut.reason === 'shortcut-logged-out-or-rot',
      'shortcut bad-list-shape returns a DOM fallback reason');
  }

  // =========================================================================
  // LeetCode head -- catalog/handlers/leetcode.js (same-origin GraphQL reads)
  // =========================================================================
  const leetcodePath = path.join(HANDLERS_DIR, 'leetcode.js');
  check(fs.existsSync(leetcodePath), 'catalog/handlers/leetcode.js exists');
  if (fs.existsSync(leetcodePath)) {
    const lc = require(leetcodePath);
    const lcSrc = readSource(leetcodePath);
    const lcSlugs = [
      'leetcode.get_code_snippets',
      'leetcode.get_contest_history',
      'leetcode.get_contest_ranking',
      'leetcode.get_current_user',
      'leetcode.get_daily_challenge',
      'leetcode.get_problem',
      'leetcode.get_problem_hints',
      'leetcode.get_problem_solution',
      'leetcode.get_problem_stats',
      'leetcode.get_similar_problems',
      'leetcode.get_submission',
      'leetcode.get_user_badges',
      'leetcode.get_user_calendar',
      'leetcode.get_user_language_stats',
      'leetcode.get_user_profile',
      'leetcode.get_user_progress',
      'leetcode.get_user_skill_stats',
      'leetcode.get_user_submit_stats',
      'leetcode.list_discussions',
      'leetcode.list_favorites',
      'leetcode.list_problems',
      'leetcode.list_recent_submissions',
      'leetcode.list_submissions',
      'leetcode.list_topic_tags'
    ];

    check(lcSlugs.every(function(slug) {
      return lc[slug] && lc[slug].tier === 'T1a'
        && lc[slug].sideEffectClass === 'read'
        && lc[slug].origin === 'https://leetcode.com'
        && lc[slug].params
        && lc[slug].params.additionalProperties === false
        && typeof lc[slug].handle === 'function';
    }), 'all 24 LeetCode query-only descriptors are tier:T1a READ entries pinned to https://leetcode.com');
    check(!lc['leetcode.run_code'] && !lc['leetcode.submit_code'],
      'leetcode run_code/submit_code are intentionally not activated by the read-only GraphQL head');
    check(!/chrome\.(scripting|tabs)/.test(lcSrc),
      'leetcode.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(lcSrc),
      'leetcode.js performs NO direct network call');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(lcSrc),
      'leetcode.js does NOT console-log a secret-bearing variable');

    const lcUser = makeCtx('https://leetcode.com', 91);
    const lcUserOut = await lc['leetcode.get_current_user'].handle({}, lcUser.ctx);
    check(lcUser.calls.length === 1,
      'leetcode.get_current_user builds one GraphQL bound spec');
    check(lcUser.calls.length === 1
      && lcUser.calls[0].spec.url === 'https://leetcode.com/graphql/'
      && lcUser.calls[0].spec.origin === 'https://leetcode.com'
      && lcUser.calls[0].spec.method === 'POST',
      'leetcode.get_current_user pins a POST spec to https://leetcode.com/graphql/');
    check(lcUser.calls.length === 1
      && lcUser.calls[0].spec.csrfSource
      && lcUser.calls[0].spec.csrfSource.from === 'cookie'
      && lcUser.calls[0].spec.csrfSource.selector === 'csrftoken'
      && lcUser.calls[0].spec.csrfSource.header === 'x-csrftoken',
      'leetcode GraphQL specs use the csrftoken cookie csrfSource');
    check(lcUserOut && lcUserOut.success === true && lcUserOut.data.userStatus.username === 'leetcode-user',
      'leetcode.get_current_user accepts a signed-in userStatus response');

    const lcProblem = makeCtx('https://leetcode.com', 92);
    await lc['leetcode.get_problem'].handle({ titleSlug: 'two-sum' }, lcProblem.ctx);
    const problemBody = lcProblem.calls.length === 1 ? parseSpecBody(lcProblem.calls[0].spec) : {};
    check(problemBody.variables && problemBody.variables.titleSlug === 'two-sum'
      && String(problemBody.query || '').indexOf('questionData') !== -1,
      'leetcode.get_problem sends titleSlug through the GraphQL variables body');

    const lcList = makeCtx('https://leetcode.com', 93);
    await lc['leetcode.list_problems'].handle({ difficulty: 'EASY', tags: ['array'], limit: 5 }, lcList.ctx);
    const listBody = lcList.calls.length === 1 ? parseSpecBody(lcList.calls[0].spec) : {};
    check(listBody.variables && listBody.variables.limit === 5
      && listBody.variables.filters
      && listBody.variables.filters.difficulty === 'EASY'
      && Array.isArray(listBody.variables.filters.tags)
      && listBody.variables.filters.tags[0] === 'array',
      'leetcode.list_problems maps optional filters into GraphQL variables');

    const lcLoggedOut = makeCtx('https://leetcode.com', 94, {
      leetcodeData: { userStatus: { isSignedIn: false } }
    });
    const lcLoggedOutResult = await lc['leetcode.get_current_user'].handle({}, lcLoggedOut.ctx);
    check(lcLoggedOutResult && lcLoggedOutResult.success === false
      && lcLoggedOutResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && lcLoggedOutResult.reason === 'leetcode-user-not-signed-in',
      'leetcode.get_current_user rejects signed-out userStatus');

    const lcBadShape = makeCtx('https://leetcode.com', 95, {
      leetcodeData: { ok: true }
    });
    const lcBadShapeResult = await lc['leetcode.list_topic_tags'].handle({}, lcBadShape.ctx);
    check(lcBadShapeResult && lcBadShapeResult.success === false
      && lcBadShapeResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && lcBadShapeResult.reason === 'leetcode-graphql-shape-mismatch',
      'leetcode.list_topic_tags rejects a non-GraphQL data shape');
  }

  // =========================================================================
  // Wikipedia head -- catalog/handlers/wikipedia.js (public same-origin reads)
  // =========================================================================
  const wikipediaPath = path.join(HANDLERS_DIR, 'wikipedia.js');
  check(fs.existsSync(wikipediaPath), 'catalog/handlers/wikipedia.js exists');
  if (fs.existsSync(wikipediaPath)) {
    const wp = require(wikipediaPath);
    const wpSrc = readSource(wikipediaPath);
    const wpSlugs = [
      'wikipedia.compare_revisions',
      'wikipedia.get_article',
      'wikipedia.get_article_categories',
      'wikipedia.get_article_languages',
      'wikipedia.get_article_links',
      'wikipedia.get_article_sections',
      'wikipedia.get_backlinks',
      'wikipedia.get_category_members',
      'wikipedia.get_featured_content',
      'wikipedia.get_page_summary',
      'wikipedia.get_random_articles',
      'wikipedia.get_recent_changes',
      'wikipedia.get_revisions',
      'wikipedia.get_section_content',
      'wikipedia.get_user_contributions',
      'wikipedia.opensearch',
      'wikipedia.search_articles'
    ];

    check(wpSlugs.every(function(slug) {
      return wp[slug] && wp[slug].tier === 'T1a'
        && wp[slug].sideEffectClass === 'read'
        && wp[slug].origin === 'https://en.wikipedia.org'
        && wp[slug].params
        && wp[slug].params.additionalProperties === false
        && typeof wp[slug].handle === 'function';
    }), 'all 17 Wikipedia public reads are tier:T1a READ entries pinned to https://en.wikipedia.org');
    check(!wp['wikipedia.get_current_user'] && !wp['wikipedia.get_page_views'],
      'wikipedia get_current_user/page_views remain unactivated because they need page-global auth or cross-origin wikimedia.org');
    check(!/chrome\.(scripting|tabs)/.test(wpSrc),
      'wikipedia.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(wpSrc),
      'wikipedia.js performs NO direct network call');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(wpSrc),
      'wikipedia.js does NOT console-log a secret-bearing variable');

    const wpSearch = makeCtx('https://en.wikipedia.org', 96);
    const wpSearchOut = await wp['wikipedia.search_articles'].handle({ query: 'JavaScript', limit: 5, offset: 10 }, wpSearch.ctx);
    check(wpSearch.calls.length === 1,
      'wikipedia.search_articles builds one MediaWiki bound spec');
    check(wpSearch.calls.length === 1
      && wpSearch.calls[0].spec.url.indexOf('https://en.wikipedia.org/w/api.php?') === 0
      && wpSearch.calls[0].spec.origin === 'https://en.wikipedia.org'
      && wpSearch.calls[0].spec.method === 'GET'
      && wpSearch.calls[0].spec.authStrategy === 'same-origin-cookie',
      'wikipedia.search_articles pins a same-origin-cookie GET spec to en.wikipedia.org/w/api.php');
    check(wpSearch.calls.length === 1
      && wpSearch.calls[0].spec.url.indexOf('action=query') !== -1
      && wpSearch.calls[0].spec.url.indexOf('list=search') !== -1
      && wpSearch.calls[0].spec.url.indexOf('srsearch=JavaScript') !== -1
      && wpSearch.calls[0].spec.url.indexOf('srlimit=5') !== -1
      && wpSearch.calls[0].spec.url.indexOf('sroffset=10') !== -1,
      'wikipedia.search_articles maps query, limit, and offset into MediaWiki params');
    check(wpSearchOut && wpSearchOut.success === true && wpSearchOut.data.query.search[0].title === 'JavaScript',
      'wikipedia.search_articles accepts a MediaWiki search envelope');

    const wpSummary = makeCtx('https://en.wikipedia.org', 97);
    await wp['wikipedia.get_page_summary'].handle({ title: 'Albert Einstein' }, wpSummary.ctx);
    check(wpSummary.calls.length === 1
      && wpSummary.calls[0].spec.url === 'https://en.wikipedia.org/api/rest_v1/page/summary/Albert_Einstein',
      'wikipedia.get_page_summary targets the same-origin REST summary endpoint with encoded title');

    const wpOpen = makeCtx('https://en.wikipedia.org', 98);
    const wpOpenOut = await wp['wikipedia.opensearch'].handle({ query: 'Java', limit: 3 }, wpOpen.ctx);
    check(wpOpenOut && wpOpenOut.success === true && Array.isArray(wpOpenOut.data[1]),
      'wikipedia.opensearch accepts the MediaWiki opensearch array envelope');

    const wpBadShape = makeCtx('https://en.wikipedia.org', 99, {
      wikipediaData: { ok: true }
    });
    const wpBadShapeResult = await wp['wikipedia.search_articles'].handle({ query: 'JavaScript' }, wpBadShape.ctx);
    check(wpBadShapeResult && wpBadShapeResult.success === false
      && wpBadShapeResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && wpBadShapeResult.reason === 'wikipedia-api-shape-mismatch',
      'wikipedia.search_articles rejects a non-MediaWiki data shape');
  }

  // =========================================================================
  // Hacker News head -- catalog/handlers/hackernews.js (public same-origin HTML reads)
  // =========================================================================
  const hackernewsPath = path.join(HANDLERS_DIR, 'hackernews.js');
  check(fs.existsSync(hackernewsPath), 'catalog/handlers/hackernews.js exists');
  if (fs.existsSync(hackernewsPath)) {
    const hn = require(hackernewsPath);
    const hnSrc = readSource(hackernewsPath);
    const hnSlugs = [
      'hackernews.get_item',
      'hackernews.get_story_comments',
      'hackernews.get_user',
      'hackernews.list_ask_stories',
      'hackernews.list_best_stories',
      'hackernews.list_job_stories',
      'hackernews.list_new_stories',
      'hackernews.list_show_stories',
      'hackernews.list_top_stories'
    ];

    check(hnSlugs.every(function(slug) {
      return hn[slug] && hn[slug].tier === 'T1a'
        && hn[slug].sideEffectClass === 'read'
        && hn[slug].origin === 'https://news.ycombinator.com'
        && hn[slug].params
        && hn[slug].params.additionalProperties === false
        && typeof hn[slug].handle === 'function';
    }), 'all 9 Hacker News public HTML reads are tier:T1a READ entries pinned to https://news.ycombinator.com');
    check(!hn['hackernews.submit_comment'],
      'hackernews.submit_comment remains unactivated because vendored code posts an HMAC-backed form');
    check(!/chrome\.(scripting|tabs)/.test(hnSrc),
      'hackernews.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(hnSrc),
      'hackernews.js performs NO direct network call');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|hmac|authorization|bearer)\b/i.test(hnSrc),
      'hackernews.js does NOT console-log a secret-bearing variable');

    const hnTop = makeCtx('https://news.ycombinator.com', 101);
    const hnTopOut = await hn['hackernews.list_top_stories'].handle({ page: 2 }, hnTop.ctx);
    check(hnTop.calls.length === 1,
      'hackernews.list_top_stories builds one same-origin HTML bound spec');
    check(hnTop.calls.length === 1
      && hnTop.calls[0].spec.url === 'https://news.ycombinator.com/news?p=2'
      && hnTop.calls[0].spec.origin === 'https://news.ycombinator.com'
      && hnTop.calls[0].spec.method === 'GET'
      && hnTop.calls[0].spec.authStrategy === 'same-origin-cookie'
      && hnTop.calls[0].spec.headers.Accept === 'text/html',
      'hackernews.list_top_stories pins a text/html GET spec to news.ycombinator.com/news?p=2');
    check(hnTopOut && hnTopOut.success === true
      && hnTopOut.data.stories[0].title === 'Example & Story'
      && hnTopOut.data.stories[0].descendants === 7
      && hnTopOut.data.has_more === true,
      'hackernews.list_top_stories parses HN story rows and has_more');

    const hnItem = makeCtx('https://news.ycombinator.com', 102);
    const hnItemOut = await hn['hackernews.get_item'].handle({ id: 123 }, hnItem.ctx);
    check(hnItem.calls.length === 1
      && hnItem.calls[0].spec.url === 'https://news.ycombinator.com/item?id=123',
      'hackernews.get_item targets /item?id=:id');
    check(hnItemOut && hnItemOut.success === true
      && hnItemOut.data.item.id === 123
      && hnItemOut.data.item.type === 'story'
      && hnItemOut.data.item.by === 'alice',
      'hackernews.get_item parses the primary item row');

    const hnComments = makeCtx('https://news.ycombinator.com', 103);
    const hnCommentsOut = await hn['hackernews.get_story_comments'].handle({ story_id: 123, page: 2 }, hnComments.ctx);
    check(hnComments.calls.length === 1
      && hnComments.calls[0].spec.url === 'https://news.ycombinator.com/item?id=123&p=2',
      'hackernews.get_story_comments targets /item?id=:story_id&p=:page');
    check(hnCommentsOut && hnCommentsOut.success === true
      && hnCommentsOut.data.total === 7
      && hnCommentsOut.data.comments.length === 2
      && hnCommentsOut.data.comments[0].indent === 1
      && hnCommentsOut.data.comments[0].by === 'bob',
      'hackernews.get_story_comments parses comment rows, total count, and indent');

    const hnUser = makeCtx('https://news.ycombinator.com', 104);
    const hnUserOut = await hn['hackernews.get_user'].handle({ username: 'pg' }, hnUser.ctx);
    check(hnUser.calls.length === 1
      && hnUser.calls[0].spec.url === 'https://news.ycombinator.com/user?id=pg',
      'hackernews.get_user targets /user?id=:username');
    check(hnUserOut && hnUserOut.success === true
      && hnUserOut.data.user.username === 'pg'
      && hnUserOut.data.user.karma === 12345,
      'hackernews.get_user parses the HN user profile table');

    const hnBadShape = makeCtx('https://news.ycombinator.com', 105, {
      hackernewsText: '<html><body>No Hacker News rows here</body></html>'
    });
    const hnBadShapeOut = await hn['hackernews.list_best_stories'].handle({}, hnBadShape.ctx);
    check(hnBadShapeOut && hnBadShapeOut.success === false
      && hnBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && hnBadShapeOut.reason === 'hackernews-html-shape-mismatch',
      'hackernews.list_best_stories rejects an unexpected HTML shape');
  }

  // =========================================================================
  // Reddit same-origin .json GET read head -- catalog/handlers/reddit.js
  // =========================================================================
  const redditPath = path.join(HANDLERS_DIR, 'reddit.js');
  check(fs.existsSync(redditPath), 'catalog/handlers/reddit.js exists');
  if (fs.existsSync(redditPath)) {
    const rd = require(redditPath);
    const rdSrc = readSource(redditPath);
    const redditSlugs = [
      'reddit.get_comment_thread',
      'reddit.get_me',
      'reddit.get_post',
      'reddit.get_subreddit',
      'reddit.get_user',
      'reddit.list_flairs',
      'reddit.list_popular_subreddits',
      'reddit.list_posts',
      'reddit.list_subscriptions',
      'reddit.list_user_content',
      'reddit.read_inbox',
      'reddit.search_posts',
      'reddit.search_subreddits'
    ];

    check(redditSlugs.every(function(slug) {
      return rd[slug] && rd[slug].tier === 'T1a'
        && rd[slug].sideEffectClass === 'read'
        && rd[slug].origin === 'https://www.reddit.com'
        && rd[slug].params
        && rd[slug].params.additionalProperties === false
        && typeof rd[slug].handle === 'function';
    }), 'all 13 Reddit .json GET reads are tier:T1a READ entries pinned to https://www.reddit.com');
    check(!rd['reddit.hide'] && !rd['reddit.save'] && !rd['reddit.report']
      && !rd['reddit.submit_comment'] && !rd['reddit.submit_post'] && !rd['reddit.subscribe']
      && !rd['reddit.vote'] && !rd['reddit.edit_text'] && !rd['reddit.delete']
      && !rd['reddit.send_message'],
      'Reddit mutation, modhash, and OAuth/bearer-token rows are not registered in the GET read head');

    check(!/chrome\.(scripting|tabs)/.test(rdSrc),
      'reddit.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(rdSrc),
      'reddit.js performs NO direct network call');
    check(!/oauth\.reddit\.com|X-Modhash|Authorization\s*:|Bearer|svc\/shreddit\/token|method\s*:\s*['"]POST['"]/.test(rdSrc),
      'reddit.js does not use OAuth, modhash, bearer headers, token endpoints, or POST specs');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|modhash|authorization|bearer)\b/i.test(rdSrc),
      'reddit.js does NOT console-log a secret-bearing variable');

    const redditList = makeCtx('https://www.reddit.com', 106);
    const redditListOut = await rd['reddit.list_posts'].handle({
      subreddit: 'javascript',
      sort: 'top',
      t: 'week',
      limit: 10,
      after: 't3_prev'
    }, redditList.ctx);
    check(redditList.calls.length === 1
      && redditList.calls[0].spec.url === 'https://www.reddit.com/r/javascript/top.json?limit=10&t=week&after=t3_prev'
      && redditList.calls[0].spec.origin === 'https://www.reddit.com'
      && redditList.calls[0].spec.method === 'GET'
      && redditList.calls[0].spec.authStrategy === 'same-origin-cookie'
      && redditList.calls[0].spec.headers.Accept === 'application/json',
      'reddit.list_posts pins a GET .json bound spec to www.reddit.com');
    check(redditListOut && redditListOut.success === true
      && redditListOut.data.posts[0].title === 'Reddit T1 fixture'
      && redditListOut.data.after === 'next-post',
      'reddit.list_posts parses listing posts and pagination');

    const redditPost = makeCtx('https://www.reddit.com', 107);
    const redditPostOut = await rd['reddit.get_post'].handle({
      subreddit: 'javascript',
      post_id: 'abc123',
      comment_limit: 5,
      comment_depth: 2,
      sort: 'top'
    }, redditPost.ctx);
    check(redditPost.calls.length === 1
      && redditPost.calls[0].spec.url === 'https://www.reddit.com/r/javascript/comments/abc123.json?limit=5&depth=2&sort=top',
      'reddit.get_post targets /r/{subreddit}/comments/{post_id}.json');
    check(redditPostOut && redditPostOut.success === true
      && redditPostOut.data.post.title === 'Reddit T1 fixture'
      && redditPostOut.data.comments.length === 2
      && redditPostOut.data.comments[0].id === 'def456',
      'reddit.get_post parses post and flattened comments');

    const redditThread = makeCtx('https://www.reddit.com', 108);
    const redditThreadOut = await rd['reddit.get_comment_thread'].handle({
      subreddit: 'javascript',
      post_id: 'abc123',
      comment_id: 'def456',
      depth: 2,
      limit: 4
    }, redditThread.ctx);
    check(redditThread.calls.length === 1
      && redditThread.calls[0].spec.url === 'https://www.reddit.com/r/javascript/comments/abc123.json?comment=def456&depth=3&limit=4',
      'reddit.get_comment_thread targets the focused comment query');
    check(redditThreadOut && redditThreadOut.success === true
      && redditThreadOut.data.comment.id === 'def456'
      && redditThreadOut.data.replies[0].id === 'ghi789',
      'reddit.get_comment_thread parses target comment and replies');

    const redditMe = makeCtx('https://www.reddit.com', 109);
    const redditMeOut = await rd['reddit.get_me'].handle({}, redditMe.ctx);
    check(redditMe.calls.length === 1
      && redditMe.calls[0].spec.url === 'https://www.reddit.com/user/me/about.json',
      'reddit.get_me targets /user/me/about.json');
    check(redditMeOut && redditMeOut.success === true
      && redditMeOut.data.me.name === 'reddit_user'
      && redditMeOut.data.me.total_karma === 1234,
      'reddit.get_me parses authenticated profile data');

    const redditSearch = makeCtx('https://www.reddit.com', 110);
    const redditSearchOut = await rd['reddit.search_subreddits'].handle({ query: 'javascript', limit: 5 }, redditSearch.ctx);
    check(redditSearch.calls.length === 1
      && redditSearch.calls[0].spec.url === 'https://www.reddit.com/subreddits/search.json?q=javascript&limit=5',
      'reddit.search_subreddits builds a same-origin subreddit search URL');
    check(redditSearchOut && redditSearchOut.success === true
      && redditSearchOut.data.subreddits[0].display_name === 'javascript',
      'reddit.search_subreddits parses subreddit listing results');

    const redditBadShape = makeCtx('https://www.reddit.com', 111, { redditData: { ok: true } });
    const redditBadShapeOut = await rd['reddit.list_posts'].handle({ subreddit: 'javascript' }, redditBadShape.ctx);
    check(redditBadShapeOut && redditBadShapeOut.success === false
      && redditBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && redditBadShapeOut.reason === 'reddit-json-shape-mismatch',
      'reddit.list_posts rejects an unexpected JSON shape');
  }

  // =========================================================================
  // npm public same-origin Spiferack read head -- catalog/handlers/npm.js
  // =========================================================================
  const npmPath = path.join(HANDLERS_DIR, 'npm.js');
  check(fs.existsSync(npmPath), 'catalog/handlers/npm.js exists');
  if (fs.existsSync(npmPath)) {
    const np = require(npmPath);
    const npSrc = readSource(npmPath);

    check(np['npm.get_package'] && np['npm.get_package'].tier === 'T1a'
      && np['npm.get_package'].sideEffectClass === 'read'
      && typeof np['npm.get_package'].handle === 'function',
      'npm.get_package is a tier:T1a READ entry with an async handle');
    check(np['npm.get_package'] && np['npm.get_package'].origin === 'https://www.npmjs.com',
      'npm.get_package targets the first-party origin https://www.npmjs.com');
    check(np['npm.search_packages'] && np['npm.search_packages'].params
      && Array.isArray(np['npm.search_packages'].params.required)
      && np['npm.search_packages'].params.required.indexOf('query') !== -1,
      'npm.search_packages exposes a params schema requiring query');
    check(!np['npm.get_current_user'] && !np['npm.list_tokens'] && !np['npm.list_user_packages'],
      'npm auth-only current-user/tokens/private-settings rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(npSrc),
      'npm.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(npSrc),
      'npm.js performs no direct network call');
    check(!/getPageGlobal|Authorization|Bearer/.test(npSrc),
      'npm.js does not read page globals or inject Authorization headers');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(npSrc),
      'npm.js does NOT console-log a secret-bearing variable');

    const npmPkg = makeCtx('https://www.npmjs.com', 106);
    const npmPkgOut = await np['npm.get_package'].handle({ name: '@types/node' }, npmPkg.ctx);
    check(npmPkg.calls.length === 1 && npmPkg.calls[0].spec.method === 'GET',
      'npm.get_package builds one GET spec');
    check(npmPkg.calls.length === 1 && npmPkg.calls[0].spec.origin === 'https://www.npmjs.com',
      'npm.get_package pins the spec to www.npmjs.com');
    check(npmPkg.calls.length === 1 && npmPkg.calls[0].spec.url ===
      'https://www.npmjs.com/package/%40types/node',
      'npm.get_package targets the npm package page with safe scoped-package path encoding');
    check(npmPkg.calls.length === 1 && npmPkg.calls[0].spec.headers
      && npmPkg.calls[0].spec.headers['x-spiferack'] === '1',
      'npm.get_package sends the first-party x-spiferack JSON header');
    check(npmPkgOut && npmPkgOut.success === true,
      'npm.get_package accepts a public package Spiferack body');

    const npmVersions = makeCtx('https://www.npmjs.com', 106);
    await np['npm.get_package_versions'].handle({ name: 'express' }, npmVersions.ctx);
    check(npmVersions.calls.length === 1 && npmVersions.calls[0].spec.url ===
      'https://www.npmjs.com/package/express?activeTab=versions',
      'npm.get_package_versions targets the package page versions tab');

    const npmOrg = makeCtx('https://www.npmjs.com', 106);
    await np['npm.get_organization'].handle({ name: 'openai', page: 2 }, npmOrg.ctx);
    check(npmOrg.calls.length === 1 && npmOrg.calls[0].spec.url ===
      'https://www.npmjs.com/org/openai?page=2',
      'npm.get_organization targets /org/:name with page query');

    const npmSearch = makeCtx('https://www.npmjs.com', 106);
    await np['npm.search_packages'].handle({ query: 'react', page: 0 }, npmSearch.ctx);
    check(npmSearch.calls.length === 1 && npmSearch.calls[0].spec.url ===
      'https://www.npmjs.com/search?q=react&page=0',
      'npm.search_packages targets /search with q and page query');

    const npmBadShape = makeCtx('https://www.npmjs.com', 106, { npmData: { error: 'not found' } });
    const npmBadShapeOut = await np['npm.get_package'].handle({ name: 'missing-package' }, npmBadShape.ctx);
    check(npmBadShapeOut && npmBadShapeOut.success === false
      && npmBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && npmBadShapeOut.reason === 'npm-spiferack-shape-mismatch',
      'npm.get_package rejects an error-shaped Spiferack body');
  }

  // =========================================================================
  // Yelp public same-origin page/autocomplete read head -- catalog/handlers/yelp.js
  // =========================================================================
  const yelpPath = path.join(HANDLERS_DIR, 'yelp.js');
  check(fs.existsSync(yelpPath), 'catalog/handlers/yelp.js exists');
  if (fs.existsSync(yelpPath)) {
    const yp = require(yelpPath);
    const ypSrc = readSource(yelpPath);

    check(yp['yelp.search_businesses'] && yp['yelp.search_businesses'].tier === 'T1a'
      && yp['yelp.search_businesses'].sideEffectClass === 'read'
      && typeof yp['yelp.search_businesses'].handle === 'function',
      'yelp.search_businesses is a tier:T1a READ entry with an async handle');
    check(yp['yelp.search_businesses'] && yp['yelp.search_businesses'].origin === 'https://www.yelp.com',
      'yelp.search_businesses targets the first-party origin https://www.yelp.com');
    check(yp['yelp.autocomplete'] && yp['yelp.autocomplete'].params
      && Array.isArray(yp['yelp.autocomplete'].params.required)
      && yp['yelp.autocomplete'].params.required.indexOf('prefix') !== -1
      && yp['yelp.autocomplete'].params.required.indexOf('location') !== -1,
      'yelp.autocomplete exposes a params schema requiring prefix + location');
    check(!yp['yelp.get_current_user'] && !yp['yelp.get_current_page_businesses']
      && !yp['yelp.navigate_to_business'] && !yp['yelp.navigate_to_search'],
      'Yelp page-global and navigation rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(ypSrc),
      'yelp.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(ypSrc),
      'yelp.js performs no direct network call');
    check(!/getPageGlobal|Authorization|Bearer/.test(ypSrc),
      'yelp.js does not read page globals or inject Authorization headers');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(ypSrc),
      'yelp.js does NOT console-log a secret-bearing variable');

    const yelpSearch = makeCtx('https://www.yelp.com', 107);
    const yelpSearchOut = await yp['yelp.search_businesses'].handle({
      query: 'pizza',
      location: 'San Jose, CA',
      start: 0,
      sort_by: 'rating',
      price: '1,2',
      open_now: true
    }, yelpSearch.ctx);
    check(yelpSearch.calls.length === 1 && yelpSearch.calls[0].spec.method === 'GET',
      'yelp.search_businesses builds one GET spec');
    check(yelpSearch.calls.length === 1 && yelpSearch.calls[0].spec.origin === 'https://www.yelp.com',
      'yelp.search_businesses pins the spec to www.yelp.com');
    check(yelpSearch.calls.length === 1 && yelpSearch.calls[0].spec.url ===
      'https://www.yelp.com/search?find_desc=pizza&find_loc=San%20Jose%2C%20CA&start=0&sortby=rating&attrs=RestaurantsPriceRange2.1%2C2&open_now=true',
      'yelp.search_businesses targets /search with encoded search filters');
    check(yelpSearchOut && yelpSearchOut.success === true
      && yelpSearchOut.data.businesses.length === 1
      && yelpSearchOut.data.businesses[0].name === 'A Slice of New York',
      'yelp.search_businesses parses embedded react_root_props search results');

    const yelpBiz = makeCtx('https://www.yelp.com', 108);
    const yelpBizOut = await yp['yelp.get_business'].handle({ alias: 'a-slice-of-new-york-san-jose' }, yelpBiz.ctx);
    check(yelpBiz.calls.length === 1 && yelpBiz.calls[0].spec.url ===
      'https://www.yelp.com/biz/a-slice-of-new-york-san-jose',
      'yelp.get_business targets /biz/:alias');
    check(yelpBizOut && yelpBizOut.success === true
      && yelpBizOut.data.business.id === 'biz-id-1'
      && yelpBizOut.data.business.name === 'A Slice of New York',
      'yelp.get_business parses embedded business detail props');

    const yelpAutocomplete = makeCtx('https://www.yelp.com', 109);
    const yelpAutocompleteOut = await yp['yelp.autocomplete'].handle({
      prefix: 'piz',
      location: 'San Jose, CA'
    }, yelpAutocomplete.ctx);
    check(yelpAutocomplete.calls.length === 1 && yelpAutocomplete.calls[0].spec.url ===
      'https://www.yelp.com/search_suggest/v2/prefetch?prefix=piz&loc=San%20Jose%2C%20CA',
      'yelp.autocomplete targets /search_suggest/v2/prefetch with prefix + loc');
    check(yelpAutocompleteOut && yelpAutocompleteOut.success === true
      && yelpAutocompleteOut.data.suggestions.length === 1
      && yelpAutocompleteOut.data.suggestions[0].title === 'Pizza',
      'yelp.autocomplete accepts the public autocomplete JSON body');

    const yelpBadShape = makeCtx('https://www.yelp.com', 110, {
      yelpText: '<html><body>No react root props here</body></html>'
    });
    const yelpBadShapeOut = await yp['yelp.search_businesses'].handle({
      query: 'pizza',
      location: 'San Jose, CA'
    }, yelpBadShape.ctx);
    check(yelpBadShapeOut && yelpBadShapeOut.success === false
      && yelpBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && yelpBadShapeOut.reason === 'yelp-public-read-shape-mismatch',
      'yelp.search_businesses rejects an unexpected HTML shape');
  }

  // =========================================================================
  // TripAdvisor public same-origin SSR/GraphQL read head -- catalog/handlers/tripadvisor.js
  // =========================================================================
  const tripadvisorPath = path.join(HANDLERS_DIR, 'tripadvisor.js');
  check(fs.existsSync(tripadvisorPath), 'catalog/handlers/tripadvisor.js exists');
  if (fs.existsSync(tripadvisorPath)) {
    const ta = require(tripadvisorPath);
    const taSrc = readSource(tripadvisorPath);
    const taSlugs = [
      'tripadvisor.get_attraction',
      'tripadvisor.get_breadcrumbs',
      'tripadvisor.get_hotel',
      'tripadvisor.get_neighborhood',
      'tripadvisor.get_restaurant',
      'tripadvisor.get_restaurant_awards',
      'tripadvisor.get_reviews',
      'tripadvisor.list_attractions',
      'tripadvisor.list_hotels',
      'tripadvisor.list_restaurants'
    ];

    check(taSlugs.every(function(slug) {
      return ta[slug] && ta[slug].tier === 'T1a'
        && ta[slug].sideEffectClass === 'read'
        && ta[slug].origin === 'https://www.tripadvisor.com'
        && typeof ta[slug].handle === 'function';
    }), 'TripAdvisor public read slugs are tier:T1a READ entries pinned to www.tripadvisor.com');
    check(!ta['tripadvisor.check_saved'] && !ta['tripadvisor.get_current_user'],
      'TripAdvisor saved/current-user rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(taSrc),
      'tripadvisor.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(taSrc),
      'tripadvisor.js performs no direct network call');
    check(!/getCookie|getAuth|Authorization|Bearer/.test(taSrc),
      'tripadvisor.js does not scrape auth helpers or inject Authorization headers');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(taSrc),
      'tripadvisor.js does NOT console-log a secret-bearing variable');

    const taRestaurant = makeCtx('https://www.tripadvisor.com', 111);
    const taRestaurantOut = await ta['tripadvisor.get_restaurant'].handle({
      url: '/Restaurant_Review-test'
    }, taRestaurant.ctx);
    check(taRestaurant.calls.length === 1 && taRestaurant.calls[0].spec.method === 'GET',
      'tripadvisor.get_restaurant builds one GET spec');
    check(taRestaurant.calls.length === 1 && taRestaurant.calls[0].spec.origin === 'https://www.tripadvisor.com',
      'tripadvisor.get_restaurant pins the spec to www.tripadvisor.com');
    check(taRestaurant.calls.length === 1 && taRestaurant.calls[0].spec.url ===
      'https://www.tripadvisor.com/Restaurant_Review-test',
      'tripadvisor.get_restaurant targets the supplied same-origin page path');
    check(taRestaurantOut && taRestaurantOut.success === true
      && taRestaurantOut.data.restaurant.name === 'The Test Bistro'
      && taRestaurantOut.data.subratings.food === 4.5
      && taRestaurantOut.data.keywords[0] === 'pasta',
      'tripadvisor.get_restaurant parses SSR + LD+JSON restaurant data');

    const taRestaurants = makeCtx('https://www.tripadvisor.com', 112);
    const taRestaurantsOut = await ta['tripadvisor.list_restaurants'].handle({
      url: '/Restaurants-test'
    }, taRestaurants.ctx);
    check(taRestaurants.calls.length === 1 && taRestaurants.calls[0].spec.url ===
      'https://www.tripadvisor.com/Restaurants-test',
      'tripadvisor.list_restaurants targets the supplied same-origin list path');
    check(taRestaurantsOut && taRestaurantsOut.success === true
      && taRestaurantsOut.data.restaurants.length === 1
      && taRestaurantsOut.data.restaurants[0].name === 'The Test Bistro',
      'tripadvisor.list_restaurants parses SSR restaurant shelf data');

    const taReviews = makeCtx('https://www.tripadvisor.com', 113);
    const taReviewsOut = await ta['tripadvisor.get_reviews'].handle({
      url: '/Restaurant_Review-test#REVIEWS'
    }, taReviews.ctx);
    check(taReviewsOut && taReviewsOut.success === true
      && taReviewsOut.data.reviews.length === 1
      && taReviewsOut.data.reviews[0].author === 'Taylor',
      'tripadvisor.get_reviews parses SSR review-list data');

    const taAwards = makeCtx('https://www.tripadvisor.com', 114);
    const taAwardsOut = await ta['tripadvisor.get_restaurant_awards'].handle({
      location_id: 123
    }, taAwards.ctx);
    const awardsBody = taAwards.calls.length ? parseSpecBody(taAwards.calls[0].spec) : [];
    check(taAwards.calls.length === 1 && taAwards.calls[0].spec.method === 'POST'
      && taAwards.calls[0].spec.url === 'https://www.tripadvisor.com/data/graphql/ids',
      'tripadvisor.get_restaurant_awards posts to the same-origin GraphQL ids endpoint');
    check(Array.isArray(awardsBody) && awardsBody[0]
      && awardsBody[0].extensions
      && awardsBody[0].extensions.preRegisteredQueryId === '496720f897546a4e'
      && awardsBody[0].variables
      && awardsBody[0].variables.ids[0] === 123,
      'tripadvisor.get_restaurant_awards sends the reviewed pre-registered query ID with location ID');
    check(taAwardsOut && taAwardsOut.success === true
      && taAwardsOut.data.awards.length === 1
      && taAwardsOut.data.awards[0].award_name === 'Travelers Choice',
      'tripadvisor.get_restaurant_awards accepts the public GraphQL award body');

    const taBadShape = makeCtx('https://www.tripadvisor.com', 115, {
      tripadvisorText: '<html><body>No SSR bootstrap here</body></html>'
    });
    const taBadShapeOut = await ta['tripadvisor.get_restaurant'].handle({
      url: '/Restaurant_Review-test'
    }, taBadShape.ctx);
    check(taBadShapeOut && taBadShapeOut.success === false
      && taBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && taBadShapeOut.reason === 'tripadvisor-public-read-shape-mismatch',
      'tripadvisor.get_restaurant rejects an unexpected HTML shape');
  }

  // =========================================================================
  // Zillow public same-origin search-state read head -- catalog/handlers/zillow.js
  // =========================================================================
  const zillowPath = path.join(HANDLERS_DIR, 'zillow.js');
  check(fs.existsSync(zillowPath), 'catalog/handlers/zillow.js exists');
  if (fs.existsSync(zillowPath)) {
    const zw = require(zillowPath);
    const zwSrc = readSource(zillowPath);
    const zillowSlugs = [
      'zillow.get_market_overview',
      'zillow.search_by_owner',
      'zillow.search_for_rent',
      'zillow.search_for_sale',
      'zillow.search_foreclosures',
      'zillow.search_new_construction',
      'zillow.search_open_houses',
      'zillow.search_recently_sold'
    ];

    check(zillowSlugs.every(function(slug) {
      return zw[slug] && zw[slug].tier === 'T1a'
        && zw[slug].sideEffectClass === 'read'
        && zw[slug].origin === 'https://www.zillow.com'
        && typeof zw[slug].handle === 'function';
    }), 'Zillow public search-state slugs are tier:T1a READ entries pinned to www.zillow.com');
    check(!zw['zillow.get_current_user'] && !zw['zillow.get_saved_homes']
      && !zw['zillow.search_locations'] && !zw['zillow.search_by_address'],
      'Zillow user-specific and zillowstatic autocomplete rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(zwSrc),
      'zillow.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(zwSrc),
      'zillow.js performs no direct network call');
    check(!/getPageGlobal|getAuth|Authorization|Bearer|zillowstatic\.com/.test(zwSrc),
      'zillow.js does not scrape auth helpers, inject Authorization headers, or target zillowstatic.com');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(zwSrc),
      'zillow.js does NOT console-log a secret-bearing variable');

    const zwSale = makeCtx('https://www.zillow.com', 116);
    const zwSaleOut = await zw['zillow.search_for_sale'].handle({
      region_id: 123,
      region_type: 'city',
      min_price: 400000,
      max_beds: 4,
      home_type: 'single_family',
      page: 2
    }, zwSale.ctx);
    const zwSaleBody = zwSale.calls.length ? parseSpecBody(zwSale.calls[0].spec) : {};
    check(zwSale.calls.length === 1 && zwSale.calls[0].spec.method === 'PUT'
      && zwSale.calls[0].spec.url === 'https://www.zillow.com/async-create-search-page-state',
      'zillow.search_for_sale builds one same-origin PUT spec to async-create-search-page-state');
    check(zwSale.calls.length === 1 && zwSale.calls[0].spec.origin === 'https://www.zillow.com',
      'zillow.search_for_sale pins the spec to www.zillow.com');
    check(zwSaleBody.searchQueryState
      && zwSaleBody.searchQueryState.regionSelection[0].regionId === 123
      && zwSaleBody.searchQueryState.regionSelection[0].regionType === 6
      && zwSaleBody.searchQueryState.pagination.currentPage === 2
      && zwSaleBody.searchQueryState.filterState.price.min === 400000
      && zwSaleBody.searchQueryState.filterState.beds.max === 4
      && zwSaleBody.searchQueryState.filterState.isSingleFamily.value === true,
      'zillow.search_for_sale maps region, pagination, price, beds, and home type into the search-state body');
    check(zwSaleOut && zwSaleOut.success === true
      && zwSaleOut.data.total === 42
      && zwSaleOut.data.listings.length === 1
      && zwSaleOut.data.listings[0].address === '123 Main St, Louisville, KY 40202'
      && zwSaleOut.data.listings[0].is_saved === false,
      'zillow.search_for_sale parses listing data and does not expose user saved-state');

    const zwRent = makeCtx('https://www.zillow.com', 117);
    await zw['zillow.search_for_rent'].handle({
      map_bounds: { west: -86, east: -85, south: 38, north: 39 },
      min_baths: 2
    }, zwRent.ctx);
    const zwRentBody = zwRent.calls.length ? parseSpecBody(zwRent.calls[0].spec) : {};
    check(zwRent.calls.length === 1
      && zwRentBody.searchQueryState.filterState.isForRent.value === true
      && zwRentBody.searchQueryState.filterState.isForSaleByAgent.value === false
      && zwRentBody.searchQueryState.filterState.baths.min === 2,
      'zillow.search_for_rent maps rental-only filters into the search-state body');

    const zwMarket = makeCtx('https://www.zillow.com', 118);
    const zwMarketOut = await zw['zillow.get_market_overview'].handle({
      region_id: 321,
      region_type: 'zipcode'
    }, zwMarket.ctx);
    check(zwMarket.calls.length === 3
      && zwMarket.calls.every(function(call) { return call.spec.method === 'PUT' && call.spec.origin === 'https://www.zillow.com'; }),
      'zillow.get_market_overview makes three same-origin count reads');
    check(zwMarketOut && zwMarketOut.success === true
      && zwMarketOut.data.for_sale_total === 42
      && zwMarketOut.data.for_rent_total === 7
      && zwMarketOut.data.recently_sold_total === 12,
      'zillow.get_market_overview parses for-sale, rental, and recently-sold totals');

    const zwBadShape = makeCtx('https://www.zillow.com', 119, { zillowData: { ok: true } });
    const zwBadShapeOut = await zw['zillow.search_for_sale'].handle({
      region_id: 123
    }, zwBadShape.ctx);
    check(zwBadShapeOut && zwBadShapeOut.success === false
      && zwBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && zwBadShapeOut.reason === 'zillow-search-shape-mismatch',
      'zillow.search_for_sale rejects an unexpected search-state body shape');
  }

  // =========================================================================
  // Redfin same-origin Stingray read head -- catalog/handlers/redfin.js
  // =========================================================================
  const redfinPath = path.join(HANDLERS_DIR, 'redfin.js');
  check(fs.existsSync(redfinPath), 'catalog/handlers/redfin.js exists');
  if (fs.existsSync(redfinPath)) {
    const rf = require(redfinPath);
    const rfSrc = readSource(redfinPath);
    const redfinSlugs = [
      'redfin.get_comparable_rentals',
      'redfin.get_current_user',
      'redfin.get_favorites',
      'redfin.get_property_amenities',
      'redfin.get_property_details',
      'redfin.get_property_estimate',
      'redfin.get_property_history',
      'redfin.get_property_parcel_info',
      'redfin.get_property_risk_factors',
      'redfin.get_property_schools',
      'redfin.search_locations',
      'redfin.search_properties'
    ];

    check(redfinSlugs.every(function(slug) {
      return rf[slug] && rf[slug].tier === 'T1a'
        && rf[slug].sideEffectClass === 'read'
        && rf[slug].origin === 'https://www.redfin.com'
        && typeof rf[slug].handle === 'function';
    }), 'Redfin Stingray slugs are tier:T1a READ entries pinned to www.redfin.com');

    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(rfSrc),
      'redfin.js references no chrome execution or credential APIs directly');
    check(!/\bfetch\s*\(/.test(rfSrc),
      'redfin.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|getCookie|getAuthCache|setAuthCache/.test(rfSrc),
      'redfin.js does not directly read cookies/storage or replay bearer credentials');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|RF_AUTH)\b/i.test(rfSrc),
      'redfin.js does NOT console-log a secret-bearing variable');

    const rfSearch = makeCtx('https://www.redfin.com', 120);
    const rfSearchOut = await rf['redfin.search_properties'].handle({
      region_id: 17151,
      region_type: 2,
      num_homes: 5,
      max_price: 600000,
      min_beds: 3
    }, rfSearch.ctx);
    const rfSearchUrl = rfSearch.calls[0] && rfSearch.calls[0].spec.url;
    check(rfSearch.calls.length === 1
      && rfSearch.calls[0].spec.method === 'GET'
      && rfSearchUrl.indexOf('https://www.redfin.com/stingray/api/gis?') === 0,
      'redfin.search_properties builds one same-origin GET spec to /stingray/api/gis');
    check(rfSearch.calls.length === 1
      && rfSearch.calls[0].spec.origin === 'https://www.redfin.com'
      && rfSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && rfSearch.calls[0].spec.csrfSource
      && rfSearch.calls[0].spec.csrfSource.from === 'cookie'
      && rfSearch.calls[0].spec.csrfSource.selector === 'RF_AUTH'
      && rfSearch.calls[0].spec.csrfSource.header === 'x-rf-secure',
      'redfin.search_properties declares same-origin cookies plus RF_AUTH -> x-rf-secure csrfSource');
    check(rfSearchUrl.indexOf('region_id=17151') !== -1
      && rfSearchUrl.indexOf('region_type=2') !== -1
      && rfSearchUrl.indexOf('num_homes=5') !== -1
      && rfSearchUrl.indexOf('status=9') !== -1
      && rfSearchUrl.indexOf('sf=1%2C2%2C3%2C4%2C5%2C6%2C7') !== -1
      && rfSearchUrl.indexOf('max_price=600000') !== -1
      && rfSearchUrl.indexOf('min_beds=3') !== -1,
      'redfin.search_properties maps region, default status/property types, and filters into the query string');
    check(rfSearchOut && rfSearchOut.success === true
      && rfSearchOut.data.properties.length === 1
      && rfSearchOut.data.properties[0].property_id === 1001
      && rfSearchOut.data.properties[0].street_line === '123 Main St'
      && rfSearchOut.data.properties[0].is_hot === true
      && rfSearchOut.data.median_price === 450000,
      'redfin.search_properties parses GIS listings and medians');

    const rfUserEnvelope = redfinEnvelope({ data: { loginId: 88, firstName: 'Ada', userPhotoUrl: 'https://www.redfin.com/ada.png' } });
    const rfUser = makeCtx('https://www.redfin.com', 121, {
      redfinText: '{}&&' + JSON.stringify(rfUserEnvelope)
    });
    const rfUserOut = await rf['redfin.get_current_user'].handle({}, rfUser.ctx);
    check(rfUser.calls.length === 1
      && rfUser.calls[0].spec.url === 'https://www.redfin.com/stingray/do/api-get-header-user-menu',
      'redfin.get_current_user targets the header user-menu Stingray endpoint');
    check(rfUserOut && rfUserOut.success === true
      && rfUserOut.data.user.login_id === 88
      && rfUserOut.data.user.first_name === 'Ada',
      'redfin.get_current_user strips the Redfin JSON prefix and maps the user profile');

    const rfDetails = makeCtx('https://www.redfin.com', 122);
    const rfDetailsOut = await rf['redfin.get_property_details'].handle({ property_id: 1001 }, rfDetails.ctx);
    check(rfDetails.calls.length === 1
      && rfDetails.calls[0].spec.url === 'https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=1001&accessLevel=3',
      'redfin.get_property_details targets aboveTheFold with propertyId and accessLevel');
    check(rfDetailsOut && rfDetailsOut.success === true
      && rfDetailsOut.data.property.street_address === '123 Main St'
      && rfDetailsOut.data.property.photo_count === 2,
      'redfin.get_property_details maps address, price, status, coordinates, and photo count');

    const rfLocations = makeCtx('https://www.redfin.com', 123);
    const rfLocationsOut = await rf['redfin.search_locations'].handle({ query: 'Louisville', count: 2 }, rfLocations.ctx);
    check(rfLocations.calls.length === 1
      && rfLocations.calls[0].spec.url === 'https://www.redfin.com/stingray/do/location-autocomplete?location=Louisville&v=2&count=2'
      && rfLocationsOut.data.locations.length === 2
      && rfLocationsOut.data.locations[0].id === '2_17151',
      'redfin.search_locations targets location-autocomplete and merges exact/section rows');

    const rfBadShape = makeCtx('https://www.redfin.com', 124, { redfinData: { ok: true } });
    const rfBadShapeOut = await rf['redfin.search_locations'].handle({ query: 'Louisville' }, rfBadShape.ctx);
    check(rfBadShapeOut && rfBadShapeOut.success === false
      && rfBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && rfBadShapeOut.reason === 'redfin-stingray-shape-mismatch',
      'redfin.search_locations rejects a non-Stingray response envelope');

    const rfAuthFail = makeCtx('https://www.redfin.com', 125, { redfinData: redfinEnvelope({}, 4) });
    const rfAuthFailOut = await rf['redfin.get_favorites'].handle({}, rfAuthFail.ctx);
    check(rfAuthFailOut && rfAuthFailOut.success === false
      && rfAuthFailOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && rfAuthFailOut.reason === 'redfin-auth-required',
      'redfin.get_favorites fails closed on Redfin auth resultCode 4');
  }

  // =========================================================================
  // Bluesky public AppView read head -- catalog/handlers/bsky.js
  // =========================================================================
  const bskyPath = path.join(HANDLERS_DIR, 'bsky.js');
  check(fs.existsSync(bskyPath), 'catalog/handlers/bsky.js exists');
  if (fs.existsSync(bskyPath)) {
    const bs = require(bskyPath);
    const bsSrc = readSource(bskyPath);
    const bskyReadSlugs = [
      'bsky.get_author_feed',
      'bsky.get_feed',
      'bsky.get_followers',
      'bsky.get_follows',
      'bsky.get_list_feed',
      'bsky.get_post_thread',
      'bsky.get_posts',
      'bsky.get_user_profile',
      'bsky.get_user_profiles',
      'bsky.search_posts',
      'bsky.search_users',
      'bsky.search_users_typeahead'
    ];

    check(bskyReadSlugs.every(function(slug) {
      return bs[slug] && bs[slug].tier === 'T1a'
        && bs[slug].sideEffectClass === 'read'
        && bs[slug].origin === 'https://bsky.app'
        && typeof bs[slug].handle === 'function';
    }), 'Bluesky public AppView slugs are tier:T1a READ entries pinned to bsky.app');
    check(!bs['bsky.get_current_user'] && !bs['bsky.get_blocks']
      && !bs['bsky.get_timeline'] && !bs['bsky.get_unread_count']
      && !bs['bsky.list_notifications'] && !bs['bsky.list_conversations']
      && !bs['bsky.get_conversation'] && !bs['bsky.get_messages']
      && !bs['bsky.create_post'] && !bs['bsky.delete_post']
      && !bs['bsky.like_post'] && !bs['bsky.send_message'],
      'Bluesky auth/private/chat/write rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(bsSrc),
      'bsky.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(bsSrc),
      'bsky.js performs no direct network call');
    check(!/Authorization|Bearer|localStorage|BSKY_STORAGE|chat\.bsky|atproto-proxy|accessJwt|refreshJwt/.test(bsSrc),
      'bsky.js does not read Bluesky session state or inject auth/chat/proxy credentials');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(bsSrc),
      'bsky.js does NOT console-log a secret-bearing variable');

    const bsProfile = makeCtx('https://bsky.app', 120);
    const bsProfileOut = await bs['bsky.get_user_profile'].handle({ actor: 'bsky.app' }, bsProfile.ctx);
    check(bsProfile.calls.length === 1 && bsProfile.calls[0].spec.method === 'GET'
      && bsProfile.calls[0].spec.url === 'https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app',
      'bsky.get_user_profile builds one public AppView getProfile GET spec');
    check(bsProfile.calls.length === 1
      && bsProfile.calls[0].spec.origin === 'https://bsky.app'
      && bsProfile.calls[0].spec.authStrategy === 'none',
      'bsky.get_user_profile pins the active tab to bsky.app and uses no auth strategy');
    check(bsProfileOut && bsProfileOut.success === true
      && bsProfileOut.data.handle === 'bsky.app',
      'bsky.get_user_profile accepts a public profile body');

    const bsProfiles = makeCtx('https://bsky.app', 121);
    const bsProfilesOut = await bs['bsky.get_user_profiles'].handle({
      actors: ['bsky.app', 'did:plc:second']
    }, bsProfiles.ctx);
    check(bsProfiles.calls.length === 1
      && bsProfiles.calls[0].spec.url.indexOf('https://api.bsky.app/xrpc/app.bsky.actor.getProfiles?') === 0
      && bsProfiles.calls[0].spec.url.indexOf('actors=bsky.app') !== -1
      && bsProfiles.calls[0].spec.url.indexOf('actors=did%3Aplc%3Asecond') !== -1,
      'bsky.get_user_profiles repeats actors query params for the public AppView call');
    check(bsProfilesOut && bsProfilesOut.success === true
      && Array.isArray(bsProfilesOut.data.profiles)
      && bsProfilesOut.data.profiles.length === 2,
      'bsky.get_user_profiles accepts the public profiles array');

    const bsAuthorFeed = makeCtx('https://bsky.app', 122);
    await bs['bsky.get_author_feed'].handle({
      actor: 'bsky.app',
      filter: 'posts_no_replies',
      limit: 2,
      cursor: 'cursor-test'
    }, bsAuthorFeed.ctx);
    check(bsAuthorFeed.calls.length === 1
      && bsAuthorFeed.calls[0].spec.url.indexOf('app.bsky.feed.getAuthorFeed') !== -1
      && bsAuthorFeed.calls[0].spec.url.indexOf('filter=posts_no_replies') !== -1
      && bsAuthorFeed.calls[0].spec.url.indexOf('limit=2') !== -1
      && bsAuthorFeed.calls[0].spec.origin === 'https://bsky.app',
      'bsky.get_author_feed maps actor/feed pagination filters into a public AppView GET');

    const bsSearchPosts = makeCtx('https://bsky.app', 123);
    await bs['bsky.search_posts'].handle({ q: 'hello world', sort: 'latest', limit: 3 }, bsSearchPosts.ctx);
    check(bsSearchPosts.calls.length === 1
      && bsSearchPosts.calls[0].spec.url.indexOf('app.bsky.feed.searchPosts') !== -1
      && bsSearchPosts.calls[0].spec.url.indexOf('q=hello%20world') !== -1
      && bsSearchPosts.calls[0].spec.url.indexOf('sort=latest') !== -1,
      'bsky.search_posts maps query and sort into a public AppView searchPosts GET');

    const bsBadShape = makeCtx('https://bsky.app', 124, { bskyData: { error: 'AuthMissing' } });
    const bsBadShapeOut = await bs['bsky.get_user_profile'].handle({ actor: 'bsky.app' }, bsBadShape.ctx);
    check(bsBadShapeOut && bsBadShapeOut.success === false
      && bsBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && bsBadShapeOut.reason === 'bsky-public-appview-shape-mismatch',
      'bsky.get_user_profile rejects AppView error envelopes');
  }

  // =========================================================================
  // Meticulous same-origin GraphQL read head -- catalog/handlers/meticulous.js
  // =========================================================================
  const meticulousPath = path.join(HANDLERS_DIR, 'meticulous.js');
  check(fs.existsSync(meticulousPath), 'catalog/handlers/meticulous.js exists');
  if (fs.existsSync(meticulousPath)) {
    const mt = require(meticulousPath);
    const mtSrc = readSource(meticulousPath);
    const meticulousReadSlugs = [
      'meticulous.get_current_user',
      'meticulous.get_project',
      'meticulous.get_project_pull_request',
      'meticulous.get_replay',
      'meticulous.get_replay_screenshots',
      'meticulous.get_session',
      'meticulous.get_session_events',
      'meticulous.get_test_run',
      'meticulous.get_test_run_coverage',
      'meticulous.get_test_run_diffs',
      'meticulous.get_test_run_pr_description',
      'meticulous.get_test_run_screenshots',
      'meticulous.get_test_run_source_code',
      'meticulous.get_test_run_test_cases',
      'meticulous.list_github_repositories',
      'meticulous.list_organization_members',
      'meticulous.list_organizations',
      'meticulous.list_projects',
      'meticulous.list_replays',
      'meticulous.list_sessions',
      'meticulous.search_sessions'
    ];

    check(meticulousReadSlugs.every(function(slug) {
      return mt[slug] && mt[slug].tier === 'T1a'
        && mt[slug].sideEffectClass === 'read'
        && mt[slug].origin === 'https://app.meticulous.ai'
        && mt[slug].params
        && mt[slug].params.type === 'object'
        && typeof mt[slug].handle === 'function';
    }), 'all 21 Meticulous read descriptors are tier:T1a READ entries pinned to app.meticulous.ai');
    check(!mt['meticulous.accept_all_diffs'] && !mt['meticulous.check_for_flakes']
      && !mt['meticulous.compare_replays'] && !mt['meticulous.create_label_action']
      && !mt['meticulous.upsert_diff_approval'],
      'Meticulous write rows remain unregistered pending live mutation-body UAT');
    check(!/chrome\.(scripting|tabs)/.test(mtSrc),
      'meticulous.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(mtSrc),
      'meticulous.js performs no direct network call');
    check(!/\blocalStorage\b|getLocalStorage|Authorization|Bearer|recordingToken|apiToken/.test(mtSrc),
      'meticulous.js does not read localStorage, add bearer headers, or request project token fields');
    check(!/console\.\w+\([^)]*\b(token|cookie|authorization|bearer|meticulous_auth)\b/i.test(mtSrc),
      'meticulous.js does NOT console-log a secret-bearing variable');

    const mtUser = makeCtx('https://app.meticulous.ai', 120);
    const mtUserOut = await mt['meticulous.get_current_user'].handle({}, mtUser.ctx);
    const mtUserBody = mtUser.calls.length ? parseSpecBody(mtUser.calls[0].spec) : {};
    check(mtUser.calls.length === 1 && mtUser.calls[0].spec.method === 'POST'
      && mtUser.calls[0].spec.url === 'https://app.meticulous.ai/api/graphql',
      'meticulous.get_current_user builds one same-origin GraphQL POST spec');
    check(mtUser.calls.length === 1
      && mtUser.calls[0].spec.origin === 'https://app.meticulous.ai'
      && mtUser.calls[0].spec.authStrategy === 'same-origin-cookie'
      && mtUser.calls[0].spec.extract === 'data',
      'meticulous.get_current_user pins same-origin-cookie GraphQL execution and extracts data');
    check(typeof mtUserBody.query === 'string'
      && mtUserBody.query.indexOf('authInfo') !== -1
      && mtUserBody.query.indexOf('mutation') === -1,
      'meticulous.get_current_user request body contains a query, not a mutation');
    check(mtUserOut && mtUserOut.success === true && mtUserOut.data.authInfo.user.email === 'user@example.invalid',
      'meticulous.get_current_user accepts a signed-in authInfo response');

    const mtProject = makeCtx('https://app.meticulous.ai', 121);
    await mt['meticulous.get_project'].handle({ organization_name: 'org', project_name: 'project' }, mtProject.ctx);
    const mtProjectBody = mtProject.calls.length ? parseSpecBody(mtProject.calls[0].spec) : {};
    check(mtProjectBody.variables
      && mtProjectBody.variables.organizationName === 'org'
      && mtProjectBody.variables.projectName === 'project',
      'meticulous.get_project maps organization_name and project_name into GraphQL variables');
    check(typeof mtProjectBody.query === 'string'
      && mtProjectBody.query.indexOf('recordingToken') === -1
      && mtProjectBody.query.indexOf('apiToken') === -1,
      'meticulous.get_project deliberately omits credential-like project token fields');

    const mtSearch = makeCtx('https://app.meticulous.ai', 122);
    await mt['meticulous.search_sessions'].handle({ project_id: 'project-test', query: 'checkout' }, mtSearch.ctx);
    const mtSearchBody = mtSearch.calls.length ? parseSpecBody(mtSearch.calls[0].spec) : {};
    check(mtSearchBody.variables
      && mtSearchBody.variables.projectId === 'project-test'
      && mtSearchBody.variables.searchQuery === 'checkout'
      && mtSearchBody.variables.n === 50
      && mtSearchBody.variables.offset === 0
      && mtSearchBody.variables.includeEmptySessions === false
      && mtSearchBody.variables.includeAutomatedSessions === false,
      'meticulous.search_sessions maps search args and default pagination/session flags');

    const mtLoggedOut = makeCtx('https://app.meticulous.ai', 123, {
      meticulousData: { authInfo: { isSignedIn: false, user: null } }
    });
    const mtLoggedOutResult = await mt['meticulous.get_current_user'].handle({}, mtLoggedOut.ctx);
    check(mtLoggedOutResult && mtLoggedOutResult.success === false
      && mtLoggedOutResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mtLoggedOutResult.reason === 'meticulous-user-not-signed-in',
      'meticulous.get_current_user rejects signed-out authInfo');

    const mtBadShape = makeCtx('https://app.meticulous.ai', 124, {
      meticulousData: { errors: [{ message: 'not authenticated' }] }
    });
    const mtBadShapeResult = await mt['meticulous.list_projects'].handle({}, mtBadShape.ctx);
    check(mtBadShapeResult && mtBadShapeResult.success === false
      && mtBadShapeResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mtBadShapeResult.reason === 'meticulous-graphql-shape-mismatch',
      'meticulous.list_projects rejects a GraphQL error envelope');
  }

  // =========================================================================
  // Stripe Dashboard same-origin read head -- catalog/handlers/stripe.js
  // =========================================================================
  const stripePath = path.join(HANDLERS_DIR, 'stripe.js');
  check(fs.existsSync(stripePath), 'catalog/handlers/stripe.js exists');
  if (fs.existsSync(stripePath)) {
    const st = require(stripePath);
    const stSrc = readSource(stripePath);
    const stripeReadSlugs = [
      'stripe.get_account',
      'stripe.get_balance',
      'stripe.get_customer',
      'stripe.get_event',
      'stripe.get_invoice',
      'stripe.get_payment_intent',
      'stripe.get_price',
      'stripe.get_product',
      'stripe.get_subscription',
      'stripe.list_balance_transactions',
      'stripe.list_customers',
      'stripe.list_events',
      'stripe.list_invoices',
      'stripe.list_payment_intents',
      'stripe.list_prices',
      'stripe.list_products',
      'stripe.list_subscriptions',
      'stripe.search_customers',
      'stripe.search_invoices',
      'stripe.search_payment_intents',
      'stripe.search_subscriptions'
    ];

    check(stripeReadSlugs.every(function(slug) {
      return st[slug] && st[slug].tier === 'T1a'
        && st[slug].sideEffectClass === 'read'
        && st[slug].origin === 'https://dashboard.stripe.com'
        && typeof st[slug].handle === 'function';
    }), 'all 21 Stripe read descriptors are tier:T1a READ entries pinned to dashboard.stripe.com');
    check(!st['stripe.create_customer'] && !st['stripe.create_invoice']
      && !st['stripe.create_price'] && !st['stripe.create_product']
      && !st['stripe.finalize_invoice'] && !st['stripe.update_customer']
      && !st['stripe.update_product'] && !st['stripe.delete_customer']
      && !st['stripe.void_invoice'],
      'Stripe write/destructive rows remain unregistered pending live mutation-body UAT');

    check(!/chrome\.(scripting|tabs)/.test(stSrc),
      'stripe.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(stSrc),
      'stripe.js performs no direct network call');
    check(stSrc.indexOf('api.stripe.com') === -1,
      'stripe.js does not target separate-origin api.stripe.com');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session_api_key)\b/i.test(stSrc),
      'stripe.js does NOT console-log a secret-bearing variable');

    const stCustomer = makeCtx('https://dashboard.stripe.com', 125, {
      url: 'https://dashboard.stripe.com/test/customers'
    });
    const stCustomerOut = await st['stripe.get_customer'].handle({ customer_id: 'cus_TEST' }, stCustomer.ctx);
    check(stCustomer.calls.length === 2
      && stCustomer.calls[0].spec.method === 'GET'
      && stCustomer.calls[0].spec.url === 'https://dashboard.stripe.com/test/customers',
      'stripe.get_customer first performs a same-origin dashboard bootstrap read');
    check(stCustomer.calls.length === 2
      && stCustomer.calls[1].spec.method === 'GET'
      && stCustomer.calls[1].spec.url === 'https://dashboard.stripe.com/v1/customers/cus_TEST'
      && stCustomer.calls[1].spec.origin === 'https://dashboard.stripe.com',
      'stripe.get_customer then builds one same-origin /v1 customer GET spec');
    check(stCustomer.calls[1].spec.headers
      && stCustomer.calls[1].spec.headers.Authorization === 'Bearer sk_test_SYNTHETIC'
      && stCustomer.calls[1].spec.headers['Stripe-Account'] === 'acct_TEST'
      && stCustomer.calls[1].spec.headers['Stripe-Livemode'] === 'false'
      && stCustomer.calls[1].spec.headers['x-stripe-csrf-token'] === 'csrf-TEST-SYNTHETIC',
      'stripe.get_customer puts synthetic dashboard auth carriers only inside the bound spec headers');
    check(stCustomerOut && stCustomerOut.success === true
      && stCustomerOut.data.id === 'stripe-object-test',
      'stripe.get_customer accepts an id-bearing Stripe object response');

    const stList = makeCtx('https://dashboard.stripe.com', 126);
    await st['stripe.list_customers'].handle({ limit: 2, email: 'test@example.invalid' }, stList.ctx);
    check(stList.calls.length === 2
      && stList.calls[1].spec.url.indexOf('https://dashboard.stripe.com/v1/customers?') === 0
      && stList.calls[1].spec.url.indexOf('limit=2') !== -1
      && stList.calls[1].spec.url.indexOf('email=test%40example.invalid') !== -1,
      'stripe.list_customers maps pagination and email filters into a /v1 query string');

    const stSearch = makeCtx('https://dashboard.stripe.com', 127);
    await st['stripe.search_payment_intents'].handle({ query: "status:'succeeded'", limit: 3 }, stSearch.ctx);
    const stSearchUrl = stSearch.calls[1] && stSearch.calls[1].spec
      ? new URL(stSearch.calls[1].spec.url)
      : null;
    check(stSearch.calls.length === 2
      && stSearchUrl
      && stSearchUrl.origin + stSearchUrl.pathname === 'https://dashboard.stripe.com/v1/payment_intents/search'
      && stSearchUrl.searchParams.get('query') === "status:'succeeded'"
      && stSearchUrl.searchParams.get('limit') === '3',
      'stripe.search_payment_intents maps Stripe search syntax into a /v1 search query');

    const stMissingBootstrap = makeCtx('https://dashboard.stripe.com', 128, { stripeBootstrapText: '<html></html>' });
    const stMissingOut = await st['stripe.get_balance'].handle({}, stMissingBootstrap.ctx);
    check(stMissingBootstrap.calls.length === 1
      && stMissingOut && stMissingOut.success === false
      && stMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && stMissingOut.reason === 'stripe-bootstrap-auth-unavailable',
      'stripe.get_balance fails closed when dashboard bootstrap auth carriers are unavailable');

    const stBadShape = makeCtx('https://dashboard.stripe.com', 129, { stripeData: { error: { message: 'not authenticated' } } });
    const stBadOut = await st['stripe.list_products'].handle({}, stBadShape.ctx);
    check(stBadOut && stBadOut.success === false
      && stBadOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && stBadOut.reason === 'stripe-api-logged-out-or-shape-mismatch',
      'stripe.list_products rejects Stripe API error envelopes');
  }

  // =========================================================================
  // X public same-origin HTML read head -- catalog/handlers/x.js
  // =========================================================================
  const xPath = path.join(HANDLERS_DIR, 'x.js');
  check(fs.existsSync(xPath), 'catalog/handlers/x.js exists');
  if (fs.existsSync(xPath)) {
    const xh = require(xPath);
    const xSrc = readSource(xPath);
    const xSlugs = ['x.get_tweet', 'x.get_user_profile'];

    check(xSlugs.every(function(slug) {
      return xh[slug] && xh[slug].tier === 'T1a'
        && xh[slug].sideEffectClass === 'read'
        && xh[slug].origin === 'https://x.com'
        && typeof xh[slug].handle === 'function';
    }), 'X public HTML slugs are tier:T1a READ entries pinned to x.com');
    check(!xh['x.search_tweets'] && !xh['x.get_home_timeline']
      && !xh['x.get_bookmarks'] && !xh['x.like_tweet'] && !xh['x.create_tweet'],
      'X authenticated timelines/search/bookmarks and mutation-like rows are not registered in the public read head');

    check(!/chrome\.(scripting|tabs)/.test(xSrc),
      'x.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(xSrc),
      'x.js performs no direct network call');
    check(!/GRAPHQL_BASE|authorization\s*:|Bearer|getCookie|ct0|x-csrf-token|x-client-transaction-id/i.test(xSrc),
      'x.js does not use X GraphQL auth headers, CSRF cookies, or transaction signing');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(xSrc),
      'x.js does NOT console-log a secret-bearing variable');

    const xTweet = makeCtx('https://x.com', 120);
    const xTweetOut = await xh['x.get_tweet'].handle({ tweet_id: '1234567890' }, xTweet.ctx);
    check(xTweet.calls.length === 1 && xTweet.calls[0].spec.method === 'GET'
      && xTweet.calls[0].spec.url === 'https://x.com/i/status/1234567890',
      'x.get_tweet builds one same-origin GET spec to /i/status/{tweet_id}');
    check(xTweet.calls.length === 1 && xTweet.calls[0].spec.origin === 'https://x.com',
      'x.get_tweet pins the spec to x.com');
    check(xTweetOut && xTweetOut.success === true
      && xTweetOut.data.tweet.id === '1234567890'
      && xTweetOut.data.tweet.text === 'A public T1 tweet fixture'
      && xTweetOut.data.tweet.author.screen_name === 'fsb_test',
      'x.get_tweet parses public tweet metadata from the x.com page');

    const xProfile = makeCtx('https://x.com', 121);
    const xProfileOut = await xh['x.get_user_profile'].handle({ screen_name: '@fsb_test' }, xProfile.ctx);
    check(xProfile.calls.length === 1 && xProfile.calls[0].spec.method === 'GET'
      && xProfile.calls[0].spec.url === 'https://x.com/fsb_test',
      'x.get_user_profile builds one same-origin GET spec to /{screen_name}');
    check(xProfileOut && xProfileOut.success === true
      && xProfileOut.data.user.screen_name === 'fsb_test'
      && xProfileOut.data.user.name === 'FSB Test'
      && xProfileOut.data.user.description === 'Public profile fixture for T1 readiness',
      'x.get_user_profile parses public profile metadata from the x.com page');

    const xBadShape = makeCtx('https://x.com', 122, { xText: '<html><head><title>X</title></head><body></body></html>' });
    const xBadShapeOut = await xh['x.get_tweet'].handle({ tweet_id: '1234567890' }, xBadShape.ctx);
    check(xBadShapeOut && xBadShapeOut.success === false
      && xBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && xBadShapeOut.reason === 'x-public-html-shape-mismatch',
      'x.get_tweet rejects an unexpected public HTML shape');
  }

  // =========================================================================
  // TikTok public same-origin SSR read + guarded signed/API rows -- catalog/handlers/tiktok.js
  // =========================================================================
  const tiktokPath = path.join(HANDLERS_DIR, 'tiktok.js');
  check(fs.existsSync(tiktokPath), 'catalog/handlers/tiktok.js exists');
  if (fs.existsSync(tiktokPath)) {
    const tk = require(tiktokPath);
    const tkSrc = readSource(tiktokPath);
    const tiktokReadSlugs = [
      'tiktok.get_user_profile',
      'tiktok.get_video'
    ];
    const tiktokGuardedSlugs = [
      'tiktok.get_current_user',
      'tiktok.get_followers',
      'tiktok.get_following',
      'tiktok.get_for_you_feed',
      'tiktok.get_notifications',
      'tiktok.search_users',
      'tiktok.search_videos'
    ];

    check(tiktokReadSlugs.every(function(slug) {
      return tk[slug] && tk[slug].tier === 'T1a'
        && tk[slug].sideEffectClass === 'read'
        && tk[slug].origin === 'https://www.tiktok.com'
        && typeof tk[slug].handle === 'function';
    }), 'TikTok public profile/video reads are T1a READ entries pinned to www.tiktok.com');
    check(tiktokGuardedSlugs.every(function(slug) {
      return tk[slug] && tk[slug].tier === 'T1a'
        && tk[slug].sideEffectClass === 'read'
        && tk[slug].origin === 'https://www.tiktok.com'
        && typeof tk[slug].handle === 'function';
    }), 'TikTok private/signed API rows are registered as guarded read handlers');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(tkSrc),
      'tiktok.js references no extension browser APIs or direct network calls');
    check(!/frontierSign|X-Bogus|getCookie|getPageGlobal|tt_csrf_token|byted_acrawler|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(tkSrc),
      'tiktok.js avoids signed TikTok API helpers, cookies/storage, and bearer auth');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|secUid)\b/i.test(tkSrc),
      'tiktok.js does NOT console-log secret-bearing values');

    const tkProfile = makeCtx('https://www.tiktok.com', 140);
    const tkProfileOut = await tk['tiktok.get_user_profile'].handle({ username: '@fsb_test' }, tkProfile.ctx);
    check(tkProfile.calls.length === 1
      && tkProfile.calls[0].spec.method === 'GET'
      && tkProfile.calls[0].spec.url === 'https://www.tiktok.com/@fsb_test'
      && tkProfile.calls[0].spec.origin === 'https://www.tiktok.com'
      && tkProfile.calls[0].spec.authStrategy === 'same-origin-cookie'
      && tkProfile.calls[0].spec.headers.Accept === 'text/html',
      'tiktok.get_user_profile builds one same-origin SSR page GET spec');
    check(tkProfileOut && tkProfileOut.success === true
      && tkProfileOut.data.user.id === 'user-test'
      && tkProfileOut.data.user.unique_id === 'fsb_test'
      && tkProfileOut.data.user.nickname === 'FSB Test'
      && tkProfileOut.data.stats.follower_count === 1234
      && tkProfileOut.data.stats.heart_count === 7890,
      'tiktok.get_user_profile parses public SSR user and stats fields');

    const tkVideo = makeCtx('https://www.tiktok.com', 141);
    const tkVideoOut = await tk['tiktok.get_video'].handle({ username: 'fsb_test', video_id: '7123456789012345678' }, tkVideo.ctx);
    check(tkVideo.calls.length === 1
      && tkVideo.calls[0].spec.method === 'GET'
      && tkVideo.calls[0].spec.url === 'https://www.tiktok.com/@fsb_test/video/7123456789012345678'
      && tkVideo.calls[0].spec.origin === 'https://www.tiktok.com',
      'tiktok.get_video builds one same-origin SSR video-page GET spec');
    check(tkVideoOut && tkVideoOut.success === true
      && tkVideoOut.data.video.id === '7123456789012345678'
      && tkVideoOut.data.video.description === 'A public TikTok video fixture'
      && tkVideoOut.data.video.author_unique_id === 'fsb_test'
      && tkVideoOut.data.video.play_count === 1000
      && tkVideoOut.data.video.web_url === 'https://www.tiktok.com/@fsb_test/video/7123456789012345678',
      'tiktok.get_video parses public SSR video fields');

    const tkBadShape = makeCtx('https://www.tiktok.com', 142, {
      tiktokText: '<html><head><title>TikTok</title></head><body></body></html>'
    });
    const tkBadShapeOut = await tk['tiktok.get_user_profile'].handle({ username: 'fsb_test' }, tkBadShape.ctx);
    check(tkBadShapeOut && tkBadShapeOut.success === false
      && tkBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tkBadShapeOut.reason === 'tiktok-public-ssr-shape-mismatch',
      'tiktok.get_user_profile fails closed on missing SSR rehydration data');

    const tkGuardCalls = [];
    const tkGuardCtx = {
      origin: 'https://www.tiktok.com',
      tabId: 143,
      async executeBoundSpec() { tkGuardCalls.push('spec'); },
      async executeBoundPageRead() { tkGuardCalls.push('page'); }
    };
    const tkGuardedOut = await Promise.all(tiktokGuardedSlugs.map(function(slug) {
      return tk[slug].handle({ query: 'cats', username: 'fsb_test', sec_uid: 'SEC_UID_PUBLIC_FIXTURE' }, tkGuardCtx);
    }));
    check(tkGuardedOut.every(function(out) {
      return out && out.success === false
        && out.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && out.errorCode === out.code
        && out.error === out.code
        && out.fellBackToDom === true;
    }) && tkGuardCalls.length === 0,
      'TikTok guarded signed/private rows fail closed and call no execution primitive');
  }

  // =========================================================================
  // Facebook conservative same-origin HTML read + guarded mutation head -- catalog/handlers/facebook.js
  // =========================================================================
  const facebookPath = path.join(HANDLERS_DIR, 'facebook.js');
  check(fs.existsSync(facebookPath), 'catalog/handlers/facebook.js exists');
  if (fs.existsSync(facebookPath)) {
    const fb = require(facebookPath);
    const fbSrc = readSource(facebookPath);
    const facebookReadSlugs = [
      'facebook.get_current_user',
      'facebook.search_marketplace'
    ];
    const facebookGuardedSlugs = [
      'facebook.confirm_friend_request',
      'facebook.delete_friend_request',
      'facebook.react_to_post'
    ];

    check(facebookReadSlugs.every(function(slug) {
      return fb[slug] && fb[slug].tier === 'T1a'
        && fb[slug].sideEffectClass === 'read'
        && fb[slug].origin === 'https://www.facebook.com'
        && fb[slug].params
        && fb[slug].params.type === 'object'
        && typeof fb[slug].handle === 'function';
    }), 'Facebook current-user and Marketplace reads are T1a READ entries pinned to www.facebook.com');
    check(facebookGuardedSlugs.every(function(slug) {
      return fb[slug] && fb[slug].tier === 'T1a'
        && fb[slug].origin === 'https://www.facebook.com'
        && fb[slug].sideEffectClass !== 'read'
        && typeof fb[slug].handle === 'function';
    }), 'Facebook friend/reaction mutations are registered as guarded non-read handlers');
    check(!fb['facebook.get_user_profile'] && !fb['facebook.get_user_posts']
      && !fb['facebook.get_reactions'] && !fb['facebook.list_events']
      && !fb['facebook.list_friend_requests'] && !fb['facebook.list_groups']
      && !fb['facebook.list_notifications'] && !fb['facebook.list_saved']
      && !fb['facebook.search'],
      'Facebook Relay/private social read tail remains unregistered');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(fbSrc),
      'facebook.js references no extension browser APIs or direct network calls');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|\/api\/graphql\/|fb_dtsg|lsd|doc_id/i.test(fbSrc),
      'facebook.js avoids cookies/storage/bearer auth and private Relay/doc-id token paths');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|fb_dtsg|lsd)\b/i.test(fbSrc),
      'facebook.js does NOT console-log secret-bearing values');

    const fbCurrent = makeCtx('https://www.facebook.com', 144);
    const fbCurrentOut = await fb['facebook.get_current_user'].handle({}, fbCurrent.ctx);
    check(fbCurrent.calls.length === 1
      && fbCurrent.calls[0].spec.method === 'GET'
      && fbCurrent.calls[0].spec.url === 'https://www.facebook.com/'
      && fbCurrent.calls[0].spec.origin === 'https://www.facebook.com'
      && fbCurrent.calls[0].spec.authStrategy === 'same-origin-cookie'
      && fbCurrent.calls[0].spec.headers.Accept === 'text/html',
      'facebook.get_current_user builds one same-origin HTML GET spec to facebook.com/');
    check(fbCurrentOut && fbCurrentOut.success === true
      && fbCurrentOut.data.user.id === '123456789'
      && fbCurrentOut.data.user.name === 'Test User'
      && fbCurrentOut.data.user.short_name === 'Test',
      'facebook.get_current_user extracts only current-user identity fields');
    check(JSON.stringify(fbCurrentOut.data).indexOf('TOKEN_SHOULD_NOT_LEAK') === -1
      && JSON.stringify(fbCurrentOut.data).indexOf('LSD_SHOULD_NOT_LEAK') === -1,
      'facebook.get_current_user does not return CSRF-shaped fixture values');

    const fbMarketplace = makeCtx('https://www.facebook.com', 145);
    const fbMarketplaceOut = await fb['facebook.search_marketplace'].handle({ query: 'desk lamp' }, fbMarketplace.ctx);
    check(fbMarketplace.calls.length === 1
      && fbMarketplace.calls[0].spec.method === 'GET'
      && fbMarketplace.calls[0].spec.url === 'https://www.facebook.com/marketplace/search/?query=desk%20lamp'
      && fbMarketplace.calls[0].spec.origin === 'https://www.facebook.com',
      'facebook.search_marketplace builds one same-origin Marketplace search GET spec');
    check(fbMarketplaceOut && fbMarketplaceOut.success === true
      && fbMarketplaceOut.data.search_url === 'https://www.facebook.com/marketplace/search/?query=desk%20lamp'
      && fbMarketplaceOut.data.listings[0].id === 'listing-test'
      && fbMarketplaceOut.data.listings[0].title === 'Vintage Desk'
      && fbMarketplaceOut.data.listings[0].price === '$80'
      && fbMarketplaceOut.data.listings[0].location === 'Louisville, KY',
      'facebook.search_marketplace parses Marketplace SSR listing fields');

    const fbBadShape = makeCtx('https://www.facebook.com', 146, {
      facebookText: '<html><head><title>Facebook</title></head><body></body></html>'
    });
    const fbBadShapeOut = await fb['facebook.get_current_user'].handle({}, fbBadShape.ctx);
    check(fbBadShapeOut && fbBadShapeOut.success === false
      && fbBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && fbBadShapeOut.reason === 'facebook-public-html-shape-mismatch',
      'facebook.get_current_user fails closed on missing current-user HTML shape');

    const fbGuardCalls = [];
    const fbGuardCtx = {
      origin: 'https://www.facebook.com',
      tabId: 147,
      async executeBoundSpec() { fbGuardCalls.push('spec'); },
      async executeBoundPageRead() { fbGuardCalls.push('page'); }
    };
    const fbConfirmOut = await fb['facebook.confirm_friend_request'].handle({ user_id: '123' }, fbGuardCtx);
    const fbDeleteOut = await fb['facebook.delete_friend_request'].handle({ user_id: '123' }, fbGuardCtx);
    const fbReactOut = await fb['facebook.react_to_post'].handle({ feedback_id: 'feedback-test', reaction: 'LIKE' }, fbGuardCtx);
    check([fbConfirmOut, fbDeleteOut, fbReactOut].every(function(out) {
      return out && out.success === false
        && out.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && out.errorCode === out.code
        && out.error === out.code
        && out.fellBackToDom === true;
    }) && fbGuardCalls.length === 0,
      'Facebook guarded mutations fail closed and call no execution primitive');
	  }

  // =========================================================================
  // Threads conservative same-origin read + guarded mutation head -- catalog/handlers/threads.js
  // =========================================================================
  const threadsPath = path.join(HANDLERS_DIR, 'threads.js');
  check(fs.existsSync(threadsPath), 'catalog/handlers/threads.js exists');
  if (fs.existsSync(threadsPath)) {
    const threads = require(threadsPath);
    const threadsSrc = readSource(threadsPath);

    check(threads['threads.get_thread']
      && threads['threads.get_thread'].tier === 'T1a'
      && threads['threads.get_thread'].sideEffectClass === 'read'
      && threads['threads.get_thread'].origin === 'https://www.threads.net'
      && threads['threads.get_thread'].params
      && threads['threads.get_thread'].params.type === 'object'
      && typeof threads['threads.get_thread'].handle === 'function',
      'threads.get_thread is a T1a READ entry pinned to www.threads.net');
    check(threads['threads.create_thread']
      && threads['threads.create_thread'].tier === 'T1a'
      && threads['threads.create_thread'].sideEffectClass === 'write'
      && threads['threads.create_thread'].origin === 'https://www.threads.net'
      && threads['threads.create_thread'].params
      && threads['threads.create_thread'].params.type === 'object'
      && typeof threads['threads.create_thread'].handle === 'function',
      'threads.create_thread is registered as a guarded write handler');
    check(!threads['threads.list_timeline'],
      'Threads authenticated timeline remains unregistered pending live feed-shape UAT');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(threadsSrc),
      'threads.js references no extension browser APIs or direct network calls');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|x-csrf-token/i.test(threadsSrc),
      'threads.js avoids cookies/storage/bearer auth and CSRF header paths');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(threadsSrc),
      'threads.js does NOT console-log secret-bearing values');

    const threadsJson = makeCtx('https://www.threads.net', 148);
    const threadsJsonOut = await threads['threads.get_thread'].handle({ thread_id: 'thread-test' }, threadsJson.ctx);
    check(threadsJson.calls.length === 1
      && threadsJson.calls[0].spec.method === 'GET'
      && threadsJson.calls[0].spec.url === 'https://www.threads.net/threads/thread-test'
      && threadsJson.calls[0].spec.origin === 'https://www.threads.net'
      && threadsJson.calls[0].spec.authStrategy === 'same-origin-cookie'
      && threadsJson.calls[0].spec.headers.Accept === 'application/json,text/html',
      'threads.get_thread builds one same-origin thread GET spec');
    check(threadsJsonOut && threadsJsonOut.success === true
      && threadsJsonOut.data.thread.id === 'thread-test'
      && threadsJsonOut.data.thread.text === 'A public Threads post fixture'
      && threadsJsonOut.data.thread.author === 'threads_user'
      && threadsJsonOut.data.thread.replies[0].id === 'reply-test'
      && threadsJsonOut.data.thread.replies[0].author === 'reply_user',
      'threads.get_thread normalizes public JSON thread and reply fields');

    const threadsHtml = makeCtx('https://www.threads.net', 149, { threadsText: threadsThreadPageHtml() });
    const threadsHtmlOut = await threads['threads.get_thread'].handle({ thread_id: 'thread-test' }, threadsHtml.ctx);
    check(threadsHtmlOut && threadsHtmlOut.success === true
      && threadsHtmlOut.data.thread.id === 'thread-test'
      && threadsHtmlOut.data.thread.text === 'A public Threads post fixture'
      && threadsHtmlOut.data.thread.author === 'threads_user',
      'threads.get_thread parses public HTML metadata when JSON is unavailable');

    const threadsBadShape = makeCtx('https://www.threads.net', 150, {
      threadsText: '<html><head><title>Threads</title></head><body></body></html>'
    });
    const threadsBadShapeOut = await threads['threads.get_thread'].handle({ thread_id: 'thread-test' }, threadsBadShape.ctx);
    check(threadsBadShapeOut && threadsBadShapeOut.success === false
      && threadsBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && threadsBadShapeOut.reason === 'threads-shape-mismatch',
      'threads.get_thread fails closed on missing public thread shape');

    const threadsGuardCalls = [];
    const threadsGuardCtx = {
      origin: 'https://www.threads.net',
      tabId: 151,
      async executeBoundSpec() { threadsGuardCalls.push('spec'); },
      async executeBoundPageRead() { threadsGuardCalls.push('page'); }
    };
    const threadsCreateOut = await threads['threads.create_thread'].handle({ text: 'draft' }, threadsGuardCtx);
    check(threadsCreateOut && threadsCreateOut.success === false
      && threadsCreateOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && threadsCreateOut.errorCode === threadsCreateOut.code
      && threadsCreateOut.error === threadsCreateOut.code
      && threadsCreateOut.fellBackToDom === true
      && threadsGuardCalls.length === 0,
      'Threads guarded create_thread fails closed and calls no execution primitive');
  }

  // =========================================================================
  // Stack Overflow public same-origin HTML read head -- catalog/handlers/stackoverflow.js
  // =========================================================================
  const stackoverflowPath = path.join(HANDLERS_DIR, 'stackoverflow.js');
  check(fs.existsSync(stackoverflowPath), 'catalog/handlers/stackoverflow.js exists');
  if (fs.existsSync(stackoverflowPath)) {
    const so = require(stackoverflowPath);
    const soSrc = readSource(stackoverflowPath);
    const stackoverflowSlugs = [
      'stackoverflow.get_answer',
      'stackoverflow.get_question',
      'stackoverflow.get_question_answers',
      'stackoverflow.get_similar_questions',
      'stackoverflow.get_tag_info',
      'stackoverflow.list_questions',
      'stackoverflow.list_tags',
      'stackoverflow.list_unanswered_questions',
      'stackoverflow.search_questions'
    ];

    check(stackoverflowSlugs.every(function(slug) {
      return so[slug] && so[slug].tier === 'T1a'
        && so[slug].sideEffectClass === 'read'
        && so[slug].origin === 'https://stackoverflow.com'
        && so[slug].params
        && so[slug].params.type === 'object'
        && typeof so[slug].handle === 'function';
    }), 'Stack Overflow public HTML slugs are tier:T1a READ entries pinned to stackoverflow.com');
    check(!so['stackoverflow.get_my_profile'] && !so['stackoverflow.get_user']
      && !so['stackoverflow.search_users'] && !so['stackoverflow.get_answer_comments']
      && !so['stackoverflow.get_question_comments'] && !so['stackoverflow.get_user_answers']
      && !so['stackoverflow.get_user_questions'] && !so['stackoverflow.list_featured_questions']
      && !so['stackoverflow.list_linked_questions'] && !so['stackoverflow.list_related_questions']
      && !so['stackoverflow.search_excerpts'],
      'Stack Overflow user/profile/comment/API-dependent rows are not registered in the public HTML read head');

    check(!/chrome\.(scripting|tabs)/.test(soSrc),
      'stackoverflow.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(soSrc),
      'stackoverflow.js performs no direct network call');
    check(!/api\.stackexchange\.com|Authorization|Bearer|getPageGlobal|localStorage|sessionStorage/.test(soSrc),
      'stackoverflow.js stays on stackoverflow.com public HTML and does not read storage or bearer credentials');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(soSrc),
      'stackoverflow.js does NOT console-log a secret-bearing variable');

    const soQuestion = makeCtx('https://stackoverflow.com', 134);
    const soQuestionOut = await so['stackoverflow.get_question'].handle({ question_id: 11227809 }, soQuestion.ctx);
    check(soQuestion.calls.length === 1 && soQuestion.calls[0].spec.method === 'GET'
      && soQuestion.calls[0].spec.url === 'https://stackoverflow.com/questions/11227809',
      'stackoverflow.get_question builds one same-origin GET spec to /questions/{question_id}');
    check(soQuestion.calls.length === 1
      && soQuestion.calls[0].spec.origin === 'https://stackoverflow.com'
      && soQuestion.calls[0].spec.headers.Accept === 'text/html',
      'stackoverflow.get_question pins the spec to stackoverflow.com public HTML');
    check(soQuestionOut && soQuestionOut.success === true
      && soQuestionOut.data.question.question_id === 11227809
      && soQuestionOut.data.question.title === 'Why is branch prediction faster?'
      && soQuestionOut.data.question.answer_count === 2
      && soQuestionOut.data.question.tags.indexOf('c++') !== -1,
      'stackoverflow.get_question parses public question metadata and tags');

    const soAnswers = makeCtx('https://stackoverflow.com', 135);
    const soAnswersOut = await so['stackoverflow.get_question_answers'].handle({ question_id: 11227809, sort: 'votes' }, soAnswers.ctx);
    check(soAnswers.calls.length === 1 && soAnswers.calls[0].spec.url ===
      'https://stackoverflow.com/questions/11227809?answertab=votes',
      'stackoverflow.get_question_answers targets /questions/{question_id}?answertab=votes');
    check(soAnswersOut && soAnswersOut.success === true
      && soAnswersOut.data.answers.length === 2
      && soAnswersOut.data.answers[0].answer_id === 11227902
      && soAnswersOut.data.answers[0].is_accepted === true,
      'stackoverflow.get_question_answers parses public answer cards');

    const soAnswer = makeCtx('https://stackoverflow.com', 136);
    const soAnswerOut = await so['stackoverflow.get_answer'].handle({ answer_id: 11227902 }, soAnswer.ctx);
    check(soAnswer.calls.length === 1 && soAnswer.calls[0].spec.url === 'https://stackoverflow.com/a/11227902',
      'stackoverflow.get_answer targets /a/{answer_id}');
    check(soAnswerOut && soAnswerOut.success === true
      && soAnswerOut.data.answer.answer_id === 11227902
      && soAnswerOut.data.answer.body.indexOf('Accepted answer body') !== -1,
      'stackoverflow.get_answer parses a specific public answer from the page');

    const soList = makeCtx('https://stackoverflow.com', 137);
    const soListOut = await so['stackoverflow.list_questions'].handle({
      tagged: 'javascript',
      sort: 'creation',
      page: 2
    }, soList.ctx);
    check(soList.calls.length === 1 && soList.calls[0].spec.url ===
      'https://stackoverflow.com/questions/tagged/javascript?tab=Newest&page=2',
      'stackoverflow.list_questions maps tag, sort, and page to the public questions URL');
    check(soListOut && soListOut.success === true
      && soListOut.data.questions[0].question_id === 79971883
      && soListOut.data.questions[0].title === 'Example question one',
      'stackoverflow.list_questions parses public question summary cards');

    const soSearch = makeCtx('https://stackoverflow.com', 138);
    const soSearchOut = await so['stackoverflow.search_questions'].handle({
      q: 'react hooks',
      tagged: 'javascript',
      accepted: true
    }, soSearch.ctx);
    const soSearchUrl = soSearch.calls.length ? new URL(soSearch.calls[0].spec.url) : null;
    check(soSearchUrl
      && soSearchUrl.origin + soSearchUrl.pathname === 'https://stackoverflow.com/search'
      && soSearchUrl.searchParams.get('q').indexOf('[javascript]') !== -1
      && soSearchUrl.searchParams.get('q').indexOf('hasaccepted:yes') !== -1
      && soSearchUrl.searchParams.get('q').indexOf('react hooks') !== -1,
      'stackoverflow.search_questions maps query filters into Stack Overflow advanced search syntax');
    check(soSearchOut && soSearchOut.success === true
      && soSearchOut.data.questions.length > 0,
      'stackoverflow.search_questions parses public search result cards');

    const soSimilar = makeCtx('https://stackoverflow.com', 139);
    await so['stackoverflow.get_similar_questions'].handle({ title: 'branch prediction', tagged: 'c++' }, soSimilar.ctx);
    const soSimilarUrl = soSimilar.calls.length ? new URL(soSimilar.calls[0].spec.url) : null;
    check(soSimilarUrl && soSimilarUrl.searchParams.get('q').indexOf('branch prediction') !== -1
      && soSimilarUrl.searchParams.get('q').indexOf('[c++]') !== -1,
      'stackoverflow.get_similar_questions uses public search with title and tag filters');

    const soUnanswered = makeCtx('https://stackoverflow.com', 140);
    await so['stackoverflow.list_unanswered_questions'].handle({ tagged: 'javascript', sort: 'votes' }, soUnanswered.ctx);
    check(soUnanswered.calls.length === 1 && soUnanswered.calls[0].spec.url ===
      'https://stackoverflow.com/unanswered/tagged/javascript?tab=Votes',
      'stackoverflow.list_unanswered_questions targets the public unanswered questions URL');

    const soTags = makeCtx('https://stackoverflow.com', 141);
    const soTagsOut = await so['stackoverflow.list_tags'].handle({ inname: 'java' }, soTags.ctx);
    check(soTags.calls.length === 1 && soTags.calls[0].spec.url ===
      'https://stackoverflow.com/tags?tab=popular&filter=java',
      'stackoverflow.list_tags maps inname to the public tags filter URL');
    check(soTagsOut && soTagsOut.success === true
      && soTagsOut.data.tags[0].name === 'javascript'
      && soTagsOut.data.tags[0].count === 2530830,
      'stackoverflow.list_tags parses public tag cards');

    const soTag = makeCtx('https://stackoverflow.com', 142);
    const soTagOut = await so['stackoverflow.get_tag_info'].handle({ tag: 'javascript' }, soTag.ctx);
    check(soTag.calls.length === 1 && soTag.calls[0].spec.url === 'https://stackoverflow.com/questions/tagged/javascript',
      'stackoverflow.get_tag_info targets the public tag page');
    check(soTagOut && soTagOut.success === true
      && soTagOut.data.tag.name === 'javascript'
      && soTagOut.data.tag.excerpt === 'Public question list fixture',
      'stackoverflow.get_tag_info parses public tag page metadata');

    const soBadShape = makeCtx('https://stackoverflow.com', 143, {
      stackoverflowText: '<html><head><title>Human verification - Stack Overflow</title></head><body></body></html>'
    });
    const soBadShapeOut = await so['stackoverflow.get_question'].handle({ question_id: 11227809 }, soBadShape.ctx);
    check(soBadShapeOut && soBadShapeOut.success === false
      && soBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && soBadShapeOut.reason === 'stackoverflow-human-verification',
      'stackoverflow.get_question rejects human-verification HTML instead of returning a false success');
  }

  // =========================================================================
  // Cloudflare same-origin dashboard API read head -- catalog/handlers/cloudflare.js
  // =========================================================================
  const cloudflarePath = path.join(HANDLERS_DIR, 'cloudflare.js');
  check(fs.existsSync(cloudflarePath), 'catalog/handlers/cloudflare.js exists');
  if (fs.existsSync(cloudflarePath)) {
    const cf = require(cloudflarePath);
    const cfSrc = readSource(cloudflarePath);
    const cloudflareReadSlugs = [
      'cloudflare.get_ruleset',
      'cloudflare.get_user',
      'cloudflare.get_zone',
      'cloudflare.get_zone_settings',
      'cloudflare.graphql_query',
      'cloudflare.list_ai_models',
      'cloudflare.list_alerting_policies',
      'cloudflare.list_d1_databases',
      'cloudflare.list_dns_records',
      'cloudflare.list_email_addresses',
      'cloudflare.list_email_routing_rules',
      'cloudflare.list_firewall_rules',
      'cloudflare.list_kv_namespaces',
      'cloudflare.list_page_rules',
      'cloudflare.list_pages_projects',
      'cloudflare.list_queues',
      'cloudflare.list_rules_lists',
      'cloudflare.list_rulesets',
      'cloudflare.list_ssl_certificates',
      'cloudflare.list_tunnels',
      'cloudflare.list_vectorize_indexes',
      'cloudflare.list_waiting_rooms',
      'cloudflare.list_worker_routes',
      'cloudflare.list_workers',
      'cloudflare.list_zones'
    ];

    check(cloudflareReadSlugs.every(function(slug) {
      return cf[slug] && cf[slug].tier === 'T1a'
        && cf[slug].sideEffectClass === 'read'
        && cf[slug].origin === 'https://dash.cloudflare.com'
        && cf[slug].params
        && cf[slug].params.type === 'object'
        && typeof cf[slug].handle === 'function';
    }), 'all 25 Cloudflare read descriptors are tier:T1a READ entries pinned to dash.cloudflare.com');
    check(!cf['cloudflare.create_dns_record'] && !cf['cloudflare.delete_dns_record']
      && !cf['cloudflare.purge_cache'] && !cf['cloudflare.update_dns_record']
      && !cf['cloudflare.update_zone_setting'],
      'Cloudflare write/destructive rows remain unregistered pending live mutation-body UAT');

    check(!/chrome\.(scripting|tabs)/.test(cfSrc),
      'cloudflare.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(cfSrc),
      'cloudflare.js performs no direct network call');
    check(!/api\.cloudflare\.com|Authorization|Bearer|getCookie|localStorage|sessionStorage/.test(cfSrc),
      'cloudflare.js stays on dash.cloudflare.com and does not read storage or bearer credentials');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|atok)\b/i.test(cfSrc),
      'cloudflare.js does NOT console-log a credential-bearing variable');

    const cfAccountUrl = 'https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers-and-pages';
    const cfZones = makeCtx('https://dash.cloudflare.com', 123, { url: cfAccountUrl });
    const cfZonesOut = await cf['cloudflare.list_zones'].handle({ name: 'example.com', page: 2 }, cfZones.ctx);
    check(cfZones.calls.length === 2
      && cfZones.calls[0].spec.method === 'GET'
      && cfZones.calls[0].spec.headers.Accept === 'text/html'
      && cfZones.calls[1].spec.method === 'GET'
      && cfZones.calls[1].spec.url === 'https://dash.cloudflare.com/api/v4/zones?name=example.com&page=2&per_page=20',
      'cloudflare.list_zones probes dashboard bootstrap then calls same-origin /api/v4/zones with defaults');
    check(cfZones.calls[1].spec.origin === 'https://dash.cloudflare.com'
      && cfZones.calls[1].spec.authStrategy === 'same-origin-cookie'
      && cfZones.calls[1].spec.headers['x-atok'] === 'atok-TEST-SYNTHETIC',
      'cloudflare.list_zones pins dashboard origin and places x-atok only inside the bound spec header');
    check(cfZonesOut && cfZonesOut.success === true
      && Array.isArray(cfZonesOut.data.result)
      && cfZonesOut.data.result[0].id === 'cf-list-test',
      'cloudflare.list_zones accepts the Cloudflare API envelope result array');

    const cfWorkers = makeCtx('https://dash.cloudflare.com', 124, { url: cfAccountUrl });
    await cf['cloudflare.list_workers'].handle({}, cfWorkers.ctx);
    check(cfWorkers.calls.length === 2
      && cfWorkers.calls[1].spec.url === 'https://dash.cloudflare.com/api/v4/accounts/0123456789abcdef0123456789abcdef/workers/scripts',
      'cloudflare.list_workers derives account ID from the active dashboard URL');

    const cfGraphql = makeCtx('https://dash.cloudflare.com', 125, { url: cfAccountUrl });
    await cf['cloudflare.graphql_query'].handle({ query: '{ viewer { zones { name } } }' }, cfGraphql.ctx);
    const cfGraphqlBody = cfGraphql.calls.length > 1 ? parseSpecBody(cfGraphql.calls[1].spec) : {};
    check(cfGraphql.calls.length === 2
      && cfGraphql.calls[1].spec.method === 'POST'
      && cfGraphql.calls[1].spec.url === 'https://dash.cloudflare.com/api/v4/graphql'
      && cfGraphql.calls[1].spec.origin === 'https://dash.cloudflare.com'
      && cfGraphqlBody.query === '{ viewer { zones { name } } }',
      'cloudflare.graphql_query posts a read query to the same-origin dashboard GraphQL endpoint');

    const cfMissingAccount = makeCtx('https://dash.cloudflare.com', 126, {
      url: 'https://dash.cloudflare.com/'
    });
    const cfMissingAccountOut = await cf['cloudflare.list_workers'].handle({}, cfMissingAccount.ctx);
    check(cfMissingAccountOut && cfMissingAccountOut.success === false
      && cfMissingAccountOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cfMissingAccountOut.reason === 'cloudflare-account-id-unavailable'
      && cfMissingAccount.calls.length === 0,
      'cloudflare.list_workers fails closed before bootstrap/API when account ID is unavailable');

    const cfBadShape = makeCtx('https://dash.cloudflare.com', 127, {
      url: cfAccountUrl,
      cloudflareData: { ok: true }
    });
    const cfBadShapeOut = await cf['cloudflare.list_zones'].handle({}, cfBadShape.ctx);
    check(cfBadShapeOut && cfBadShapeOut.success === false
      && cfBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cfBadShapeOut.reason === 'cloudflare-envelope-shape-mismatch',
      'cloudflare.list_zones rejects a non-Cloudflare API envelope');
  }

  // =========================================================================
  // Phase 40 (DEPTH-01) -- Slack EXTEND -- catalog/handlers/slack.js
  // (3 new READ T1a slugs via callSlackMethod; token in BODY never logged).
  // Scaffolded in 40-01 so 40-03 edits ONLY catalog/handlers/slack.js. RED until
  // the new slugs land.
  // =========================================================================
  if (fs.existsSync(slackPath)) {
    const sl40 = require(slackPath);
    const sl40Src = readSource(slackPath);

    check(sl40['slack.list_channels'] && sl40['slack.list_channels'].tier === 'T1a'
      && sl40['slack.list_channels'].sideEffectClass === 'read'
      && typeof sl40['slack.list_channels'].handle === 'function',
      'slack.list_channels is a tier:T1a READ entry with an async handle');
    check(sl40['slack.list_channels'] && sl40['slack.list_channels'].origin === 'https://app.slack.com',
      'slack.list_channels targets the first-party origin https://app.slack.com');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].tier === 'T1a'
      && sl40['slack.get_channel_info'].sideEffectClass === 'read'
      && typeof sl40['slack.get_channel_info'].handle === 'function',
      'slack.get_channel_info is a tier:T1a READ entry with an async handle');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].origin === 'https://app.slack.com',
      'slack.get_channel_info targets https://app.slack.com');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].params
      && Array.isArray(sl40['slack.get_channel_info'].params.required)
      && sl40['slack.get_channel_info'].params.required.indexOf('channel') !== -1,
      'slack.get_channel_info exposes a params schema requiring channel');

    // Token-in-body discipline still holds for the new slugs (no console name).
    check(!/console\.\w+\([^)]*\b(xoxc|xoxd|token)\b/i.test(sl40Src),
      'slack.js does NOT console-log an xoxc/xoxd/token-bearing variable (extends safe)');

    // list_channels: scrape xoxc, POST same-origin /api with the token in the BODY.
    // Guarded by slug presence so the suite REDs cleanly pre-40-03 (no FATAL crash
    // from invoking an undefined handle).
    if (sl40['slack.list_channels'] && typeof sl40['slack.list_channels'].handle === 'function') {
      const sl40Read = makeCtx('https://app.slack.com', 42);
      const sl40Out = await sl40['slack.list_channels'].handle({}, sl40Read.ctx);
      const sl40Post = sl40Read.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!sl40Post, 'slack.list_channels issues a POST spec (Slack web API is POST)');
      check(sl40Post && sl40Post.spec.origin === 'https://app.slack.com',
        'slack.list_channels POST spec is pinned to https://app.slack.com');
      var sl40Body = '';
      if (sl40Post && sl40Post.spec) {
        sl40Body = (typeof sl40Post.spec.body === 'string') ? sl40Post.spec.body : JSON.stringify(sl40Post.spec.body || {});
      }
      check(sl40Body.indexOf('xoxc') !== -1 || sl40Body.indexOf('token') !== -1,
        'slack.list_channels places the xoxc token in the request BODY (not a header)');
      var sl40Headers = JSON.stringify((sl40Post && sl40Post.spec && sl40Post.spec.headers) || {});
      check(sl40Headers.indexOf('xoxc') === -1,
        'slack.list_channels does NOT place xoxc in a request header (body-only)');
      check(sl40Out && sl40Out.success === true,
        'slack.list_channels.handle returns the executeBoundSpec result');

      // NEGATIVE (IN-01 + WR-01): the xoxc probe still succeeds (a token is scraped),
      // but the web-API POST returns Slack's HTTP-200 auth-failure envelope
      // { ok:false } (a logged-out / stale-token response). guardSlackShape must
      // convert that masquerading "success" into the dual-field
      // RECIPE_DOM_FALLBACK_PENDING so DOM serves -- proving the WR-01 guard fires.
      const sl40Neg = makeCtx('https://app.slack.com', 42, { readData: { ok: false, error: 'not_authed' } });
      const sl40NegOut = await sl40['slack.list_channels'].handle({}, sl40Neg.ctx);
      const sl40NegPost = sl40Neg.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!sl40NegPost,
        'slack.list_channels still issues the POST (the guard runs on its result, not before)');
      check(sl40NegOut && sl40NegOut.success === false
        && sl40NegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.fellBackToDom === true,
        'slack.list_channels rejects an { ok:false } logged-out 200 -> RECIPE_DOM_FALLBACK_PENDING');
    } else {
      check(false, 'slack.list_channels.handle is invocable (Phase 40-03 -- behavioral checks pending)');
    }

    // The WRITE op carries the SAME envelope guard: Slack answers a stale/missing
    // token chat.postMessage with HTTP-200 { ok:false } -- without guardSlackShape
    // that masquerades as a successful send even though nothing was posted.
    if (sl40['slack.chat.postMessage'] && typeof sl40['slack.chat.postMessage'].handle === 'function') {
      const slPostOk = makeCtx('https://app.slack.com', 42);
      const slPostOkOut = await sl40['slack.chat.postMessage'].handle({ channel: 'C123', text: 'hi' }, slPostOk.ctx);
      check(slPostOkOut && slPostOkOut.success === true,
        'slack.chat.postMessage still returns the executeBoundSpec result on an ok envelope');

      const slPostNeg = makeCtx('https://app.slack.com', 42, { readData: { ok: false, error: 'not_authed' } });
      const slPostNegOut = await sl40['slack.chat.postMessage'].handle({ channel: 'C123', text: 'hi' }, slPostNeg.ctx);
      check(slPostNegOut && slPostNegOut.success === false
        && slPostNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && slPostNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
        && slPostNegOut.fellBackToDom === true,
        'slack.chat.postMessage rejects an { ok:false } HTTP-200 envelope -> RECIPE_DOM_FALLBACK_PENDING (never reports a failed send as success)');
    } else {
      check(false, 'slack.chat.postMessage.handle is invocable (guardSlackShape write coverage)');
    }

    const slackReadSlugs = [
      'slack.conversations.list',
      'slack.get_channel_info',
      'slack.get_user_profile',
      'slack.list_channels',
      'slack.list_files',
      'slack.list_members',
      'slack.list_users',
      'slack.read_messages',
      'slack.read_thread',
      'slack.search_messages'
    ];
    const slackGuardedSlugs = [
      'slack.add_reaction',
      'slack.create_channel',
      'slack.delete_message',
      'slack.edit_message',
      'slack.invite_to_channel',
      'slack.open_dm',
      'slack.pin_message',
      'slack.remove_reaction',
      'slack.send_message',
      'slack.set_channel_purpose',
      'slack.set_channel_topic',
      'slack.unpin_message',
      'slack.upload_file'
    ];
    check(slackReadSlugs.every(function(slug) {
      return sl40[slug] && sl40[slug].tier === 'T1a'
        && sl40[slug].origin === 'https://app.slack.com'
        && sl40[slug].sideEffectClass === 'read'
        && typeof sl40[slug].handle === 'function';
    }), 'Slack read descriptors are T1a reads pinned to app.slack.com');
    check(slackGuardedSlugs.every(function(slug) {
      return sl40[slug] && sl40[slug].tier === 'T1a'
        && sl40[slug].origin === 'https://app.slack.com'
        && sl40[slug].sideEffectClass !== 'read'
        && typeof sl40[slug].handle === 'function';
    }), 'Slack mutation descriptors are registered as guarded non-read handlers');

    const slReadMessages = makeCtx('https://app.slack.com', 43);
    const slReadMessagesOut = await sl40['slack.read_messages'].handle({ channel: 'C123', limit: 2 }, slReadMessages.ctx);
    const slReadMessagesPost = slReadMessages.calls.find(function(c) {
      return c.spec && c.spec.method === 'POST' && c.spec.url === 'https://app.slack.com/api/conversations.history';
    });
    check(!!slReadMessagesPost
      && slReadMessagesPost.spec.origin === 'https://app.slack.com'
      && String(slReadMessagesPost.spec.body || '').indexOf('channel=C123') !== -1
      && String(slReadMessagesPost.spec.body || '').indexOf('limit=2') !== -1,
      'slack.read_messages builds a pinned conversations.history POST with explicit channel and limit');
    check(slReadMessagesOut && slReadMessagesOut.success === true,
      'slack.read_messages accepts the logged-in Slack API envelope');

    const slGuardCalls = [];
    const slGuardOut = await sl40['slack.add_reaction'].handle({
      channel: 'C123',
      ts: '1234567890.123456',
      name: 'thumbsup'
    }, {
      origin: 'https://app.slack.com',
      tabId: 44,
      async executeBoundSpec() { slGuardCalls.push('spec'); },
      async executeBoundPageRead() { slGuardCalls.push('page'); }
    });
    check(slGuardOut && slGuardOut.success === false
      && slGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && slGuardOut.fellBackToDom === true
      && slGuardCalls.length === 0,
      'slack.add_reaction is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Phase 40 (DEPTH-01) -- Notion EXTEND -- catalog/handlers/notion.js
  // (2 new READ T1a slugs via buildRpcSpec; same-origin /api/v3 POST).
  // Scaffolded in 40-01 so 40-04 edits ONLY catalog/handlers/notion.js. RED until
  // the new slugs land.
  // =========================================================================
  if (fs.existsSync(notionPath)) {
    const nt40 = require(notionPath);
    const nt40Src = readSource(notionPath);

    check(nt40['notion.search'] && nt40['notion.search'].tier === 'T1a'
      && nt40['notion.search'].sideEffectClass === 'read'
      && typeof nt40['notion.search'].handle === 'function',
      'notion.search is a tier:T1a READ entry with an async handle');
    check(nt40['notion.search'] && nt40['notion.search'].origin === 'https://app.notion.com',
      'notion.search targets the first-party origin https://app.notion.com');
    check(nt40['notion.search'] && nt40['notion.search'].params
      && Array.isArray(nt40['notion.search'].params.required)
      && nt40['notion.search'].params.required.indexOf('query') !== -1,
      'notion.search exposes a params schema requiring query');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].tier === 'T1a'
      && nt40['notion.get_database'].sideEffectClass === 'read'
      && typeof nt40['notion.get_database'].handle === 'function',
      'notion.get_database is a tier:T1a READ entry with an async handle');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].origin === 'https://app.notion.com',
      'notion.get_database targets https://app.notion.com');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].params
      && Array.isArray(nt40['notion.get_database'].params.required)
      && nt40['notion.get_database'].params.required.indexOf('database_id') !== -1,
      'notion.get_database exposes a params schema requiring database_id');

    check(nt40Src.indexOf('api.notion.com') === -1,
      'notion.js references NO separate-origin api.notion.com (extends safe)');

    // search: a single same-origin POST to /api/v3 pinned to app.notion.com.
    // Guarded by slug presence so the suite REDs cleanly pre-40-04 (no FATAL crash).
    if (nt40['notion.search'] && typeof nt40['notion.search'].handle === 'function') {
      const nt40Ctx = makeCtx('https://app.notion.com', 43);
      const nt40Out = await nt40['notion.search'].handle({ query: 'roadmap' }, nt40Ctx.ctx);
      const nt40Post = nt40Ctx.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!nt40Post, 'notion.search issues a POST spec (/api/v3 is POST-only RPC)');
      check(nt40Post && typeof nt40Post.spec.url === 'string' && nt40Post.spec.url.indexOf('/api/v3') !== -1,
        'notion.search POSTs the same-origin /api/v3 RPC endpoint');
      check(nt40Post && nt40Post.spec.origin === 'https://app.notion.com',
        'notion.search POST spec is pinned to https://app.notion.com');
      check(nt40Out && nt40Out.success === true,
        'notion.search.handle returns the executeBoundSpec result');

      // NEGATIVE (IN-01): a logged-out app.notion.com /api/v3 RPC answers 200 with a
      // sign-in/redirect body that parses to null (not the expected recordMap/results
      // object) -> guardRpcShape must reject it with the dual-field
      // RECIPE_DOM_FALLBACK_PENDING (NOT success), proving the wrong-shape branch fires.
      const nt40Neg = makeCtx('https://app.notion.com', 43, { readData: null });
      const nt40NegOut = await nt40['notion.search'].handle({ query: 'roadmap' }, nt40Neg.ctx);
      check(nt40NegOut && nt40NegOut.success === false
        && nt40NegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.fellBackToDom === true,
        'notion.search rejects a null logged-out RPC body -> RECIPE_DOM_FALLBACK_PENDING');
    } else {
      check(false, 'notion.search.handle is invocable (Phase 40-04 -- behavioral checks pending)');
    }
  }

  // =========================================================================
  // Twilio Console guarded read/mutation head -- catalog/handlers/twilio.js
  // =========================================================================
  const twilioPath = path.join(HANDLERS_DIR, 'twilio.js');
  check(fs.existsSync(twilioPath), 'catalog/handlers/twilio.js exists');
  if (fs.existsSync(twilioPath)) {
    const tw = require(twilioPath);
    const twSrc = readSource(twilioPath);
    const twilioGuardedSlugs = [
      'twilio.create_api_key',
      'twilio.create_application',
      'twilio.create_call',
      'twilio.create_messaging_service',
      'twilio.create_verify_service',
      'twilio.delete_api_key',
      'twilio.delete_message',
      'twilio.delete_recording',
      'twilio.send_message',
      'twilio.update_call',
      'twilio.update_phone_number'
    ];

    check(tw['twilio.get_current_user'] && tw['twilio.get_current_user'].tier === 'T1a'
      && tw['twilio.get_current_user'].sideEffectClass === 'read'
      && tw['twilio.get_current_user'].origin === 'https://www.twilio.com'
      && typeof tw['twilio.get_current_user'].handle === 'function',
      'twilio.get_current_user is a tier:T1a READ entry pinned to www.twilio.com');
    check(twilioGuardedSlugs.every(function(slug) {
      return tw[slug] && tw[slug].tier === 'T1a'
        && (tw[slug].sideEffectClass === 'write' || tw[slug].sideEffectClass === 'destructive')
        && tw[slug].origin === 'https://www.twilio.com'
        && tw[slug].params
        && typeof tw[slug].handle === 'function';
    }), 'Twilio write/destructive descriptors are registered as guarded T1a entries');
    check(!tw['twilio.list_messages'] && !tw['twilio.get_balance'] && !tw['twilio.list_api_keys'],
      'Twilio REST API reads that require token replay remain unregistered');

    check(!/chrome\.(scripting|tabs)/.test(twSrc),
      'twilio.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(twSrc),
      'twilio.js performs no direct network call');
    check(!/api\.twilio\.com|monitor\.twilio\.com|messaging\.twilio\.com|verify\.twilio\.com|Authorization|Basic|btoa/.test(twSrc),
      'twilio.js does not replay Twilio REST auth tokens to separate API origins');
    check(!/console\.\w+\([^)]*\b(authToken|token|cookie|authorization|basic)\b/i.test(twSrc),
      'twilio.js does NOT console-log a secret-bearing variable');

    const twUser = makeCtx('https://www.twilio.com', 130);
    const twUserOut = await tw['twilio.get_current_user'].handle({}, twUser.ctx);
    check(twUser.calls.length === 1 && twUser.calls[0].spec.method === 'GET'
      && twUser.calls[0].spec.url === 'https://www.twilio.com/console/api/v2/projects/info',
      'twilio.get_current_user builds one source-proven project-info GET spec');
    check(twUser.calls.length === 1
      && twUser.calls[0].spec.origin === 'https://www.twilio.com'
      && twUser.calls[0].spec.authStrategy === 'same-origin-cookie',
      'twilio.get_current_user pins execution to www.twilio.com');
    check(twUserOut && twUserOut.success === true
      && twUserOut.data.accountSid === 'ACtwiliofixture0000000000000000000000'
      && JSON.stringify(twUserOut).indexOf('SECRET_AUTH_TOKEN_SHOULD_NOT_LEAK') === -1,
      'twilio.get_current_user sanitizes project info and does not return authToken');

    const twBadShape = makeCtx('https://www.twilio.com', 131, { twilioProjectInfoData: { authToken: 'SECRET_ONLY' } });
    const twBadShapeOut = await tw['twilio.get_current_user'].handle({}, twBadShape.ctx);
    check(twBadShapeOut && twBadShapeOut.success === false
      && twBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && twBadShapeOut.reason === 'twilio-project-info-shape-mismatch',
      'twilio.get_current_user rejects project-info bodies without an account SID');

    const twWrite = makeCtx('https://www.twilio.com', 132);
    const twWriteOut = await tw['twilio.send_message'].handle({ to: '+15551234567', from: '+15557654321', body: 'hello' }, twWrite.ctx);
    check(twWrite.calls.length === 0
      && twWriteOut && twWriteOut.success === false
      && twWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && twWriteOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && twWriteOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && twWriteOut.fellBackToDom === true,
      'twilio.send_message is guarded fail-closed and does not call executeBoundSpec');

    const twDelete = makeCtx('https://www.twilio.com', 133);
    const twDeleteOut = await tw['twilio.delete_message'].handle({ sid: 'SMfixture' }, twDelete.ctx);
    check(twDelete.calls.length === 0
      && twDeleteOut && twDeleteOut.success === false
      && twDeleteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && twDeleteOut.fellBackToDom === true,
      'twilio.delete_message is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // Tumblr same-origin /api/v2 read/guarded write head -- catalog/handlers/tumblr.js
  // =========================================================================
  const tumblrPath = path.join(HANDLERS_DIR, 'tumblr.js');
  check(fs.existsSync(tumblrPath), 'catalog/handlers/tumblr.js exists');
  if (fs.existsSync(tumblrPath)) {
    const tu = require(tumblrPath);
    const tuSrc = readSource(tumblrPath);
    const tumblrReadSlugs = [
      'tumblr.get_blocks',
      'tumblr.get_blog_followers',
      'tumblr.get_blog_following',
      'tumblr.get_blog_info',
      'tumblr.get_blog_likes',
      'tumblr.get_blog_notifications',
      'tumblr.get_blog_posts',
      'tumblr.get_current_user',
      'tumblr.get_dashboard',
      'tumblr.get_draft_posts',
      'tumblr.get_filtered_tags',
      'tumblr.get_post',
      'tumblr.get_post_notes',
      'tumblr.get_queued_posts',
      'tumblr.get_recommended_blogs',
      'tumblr.get_submissions',
      'tumblr.get_user_following',
      'tumblr.get_user_likes',
      'tumblr.get_user_limits',
      'tumblr.search_tagged'
    ];
    const tumblrGuardedSlugs = [
      'tumblr.add_filtered_tag',
      'tumblr.block_blog',
      'tumblr.create_post',
      'tumblr.delete_post',
      'tumblr.edit_post',
      'tumblr.follow_blog',
      'tumblr.like_post',
      'tumblr.reblog_post',
      'tumblr.remove_filtered_tag',
      'tumblr.unblock_blog',
      'tumblr.unfollow_blog',
      'tumblr.unlike_post'
    ];

    check(tumblrReadSlugs.every(function(slug) {
      return tu[slug] && tu[slug].tier === 'T1a'
        && tu[slug].sideEffectClass === 'read'
        && tu[slug].origin === 'https://www.tumblr.com'
        && tu[slug].params
        && tu[slug].params.type === 'object'
        && typeof tu[slug].handle === 'function';
    }), 'all 20 Tumblr read descriptors are tier:T1a READ entries pinned to www.tumblr.com');
    check(tumblrGuardedSlugs.every(function(slug) {
      return tu[slug] && tu[slug].tier === 'T1a'
        && (tu[slug].sideEffectClass === 'write' || tu[slug].sideEffectClass === 'destructive')
        && tu[slug].origin === 'https://www.tumblr.com'
        && tu[slug].params
        && typeof tu[slug].handle === 'function';
    }), 'Tumblr write/destructive descriptors are registered as guarded T1a entries');

    check(!/chrome\.(scripting|tabs)/.test(tuSrc),
      'tumblr.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(tuSrc),
      'tumblr.js performs no direct network call');
    check(!/api\.tumblr\.com|oauth|localStorage|sessionStorage/.test(tuSrc),
      'tumblr.js stays on www.tumblr.com and does not use separate API or storage credential paths');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(tuSrc),
      'tumblr.js does NOT console-log a credential-bearing variable');

    const tuUser = makeCtx('https://www.tumblr.com', 134, { url: 'https://www.tumblr.com/dashboard' });
    const tuUserOut = await tu['tumblr.get_current_user'].handle({}, tuUser.ctx);
    check(tuUser.calls.length === 2
      && tuUser.calls[0].spec.method === 'GET'
      && tuUser.calls[0].spec.url === 'https://www.tumblr.com/dashboard'
      && tuUser.calls[1].spec.method === 'GET'
      && tuUser.calls[1].spec.url === 'https://www.tumblr.com/api/v2/user/info',
      'tumblr.get_current_user probes bootstrap then calls same-origin /api/v2/user/info');
    check(tuUser.calls[1].spec.origin === 'https://www.tumblr.com'
      && tuUser.calls[1].spec.authStrategy === 'same-origin-cookie'
      && tuUser.calls[1].spec.headers.Authorization === 'Bearer tumblr-token-TEST-SYNTHETIC'
      && tuUser.calls[1].spec.headers['X-Version'] === 'redpop/3/0//redpop/',
      'tumblr.get_current_user pins www.tumblr.com and puts the API token only inside the bound spec');
    check(tuUserOut && tuUserOut.success === true
      && tuUserOut.data.user.name === 'tumblr-user'
      && JSON.stringify(tuUserOut).indexOf('tumblr-token-TEST-SYNTHETIC') === -1,
      'tumblr.get_current_user unwraps the response envelope without returning the API token');

    const tuBlog = makeCtx('https://www.tumblr.com', 135, { url: 'https://www.tumblr.com/dashboard' });
    await tu['tumblr.get_blog_info'].handle({ blog_name: 'staff' }, tuBlog.ctx);
    check(tuBlog.calls.length === 2
      && tuBlog.calls[1].spec.url === 'https://www.tumblr.com/api/v2/blog/staff/info',
      'tumblr.get_blog_info targets /api/v2/blog/{blog_name}/info');

    const tuTagged = makeCtx('https://www.tumblr.com', 136, { url: 'https://www.tumblr.com/dashboard' });
    const tuTaggedOut = await tu['tumblr.search_tagged'].handle({ tag: 'art', limit: 5 }, tuTagged.ctx);
    check(tuTagged.calls.length === 2
      && tuTagged.calls[1].spec.url === 'https://www.tumblr.com/api/v2/tagged?tag=art&limit=5&npf=true'
      && tuTaggedOut && tuTaggedOut.success === true
      && Array.isArray(tuTaggedOut.data),
      'tumblr.search_tagged maps query params and accepts an array response');

    const tuNoToken = makeCtx('https://www.tumblr.com', 137, {
      url: 'https://www.tumblr.com/dashboard',
      tumblrBootstrapText: '<html><script id="___INITIAL_STATE___">{"apiFetchStore":{}}</script></html>'
    });
    const tuNoTokenOut = await tu['tumblr.get_current_user'].handle({}, tuNoToken.ctx);
    check(tuNoTokenOut && tuNoTokenOut.success === false
      && tuNoTokenOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tuNoTokenOut.reason === 'tumblr-bootstrap-token-unavailable'
      && tuNoToken.calls.length === 1,
      'tumblr.get_current_user fails closed when bootstrap API token is unavailable');

    const tuBadShape = makeCtx('https://www.tumblr.com', 138, {
      url: 'https://www.tumblr.com/dashboard',
      tumblrData: { meta: { status: 200, msg: 'OK' }, response: { ok: true } }
    });
    const tuBadShapeOut = await tu['tumblr.get_current_user'].handle({}, tuBadShape.ctx);
    check(tuBadShapeOut && tuBadShapeOut.success === false
      && tuBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tuBadShapeOut.reason === 'tumblr-api-shape-mismatch',
      'tumblr.get_current_user rejects a response envelope without user shape');

    const tuWrite = makeCtx('https://www.tumblr.com', 139);
    const tuWriteOut = await tu['tumblr.create_post'].handle({ blog_name: 'staff', content: 'hello' }, tuWrite.ctx);
    check(tuWrite.calls.length === 0
      && tuWriteOut && tuWriteOut.success === false
      && tuWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tuWriteOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && tuWriteOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && tuWriteOut.fellBackToDom === true,
      'tumblr.create_post is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // Priceline public same-origin search read head -- catalog/handlers/priceline.js
  // =========================================================================
  const pricelinePath = path.join(HANDLERS_DIR, 'priceline.js');
  check(fs.existsSync(pricelinePath), 'catalog/handlers/priceline.js exists');
  if (fs.existsSync(pricelinePath)) {
    const pl = require(pricelinePath);
    const plSrc = readSource(pricelinePath);
    const pricelineSlugs = [
      'priceline.search_airports',
      'priceline.search_locations',
      'priceline.search_points_of_interest'
    ];

    check(pricelineSlugs.every(function(slug) {
      return pl[slug] && pl[slug].tier === 'T1a'
        && pl[slug].sideEffectClass === 'read'
        && pl[slug].origin === 'https://www.priceline.com'
        && pl[slug].params
        && typeof pl[slug].handle === 'function';
    }), 'Priceline public search slugs are tier:T1a READ entries pinned to www.priceline.com');
    check(!pl['priceline.search_hotels'] && !pl['priceline.get_customer_profile']
      && !pl['priceline.get_customer_coupons'] && !pl['priceline.get_favorite_hotels']
      && !pl['priceline.list_flight_price_watches']
      && !pl['priceline.navigate_to_search'] && !pl['priceline.navigate_to_hotel']
      && !pl['priceline.navigate_to_flight_search'],
      'Priceline auth-token GraphQL and browser-navigation rows stay in the discovery tail');

    check(!/chrome\.(scripting|tabs)/.test(plSrc),
      'priceline.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(plSrc),
      'priceline.js performs no direct network call');
    check(!/Authorization|Bearer|getAuthToken|getAuth|getCookie|localStorage|location\.href/.test(plSrc),
      'priceline.js does not scrape auth helpers, inject Authorization headers, or navigate the page');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(plSrc),
      'priceline.js does NOT console-log a secret-bearing variable');

    const plLocations = makeCtx('https://www.priceline.com', 140);
    const plLocationsOut = await pl['priceline.search_locations'].handle({ keyword: 'Louisville' }, plLocations.ctx);
    check(plLocations.calls.length === 1
      && plLocations.calls[0].spec.method === 'GET'
      && plLocations.calls[0].spec.url === 'https://www.priceline.com/pws/v0/index/relax/search/autoSuggest?keyword=Louisville'
      && plLocations.calls[0].spec.origin === 'https://www.priceline.com'
      && plLocations.calls[0].spec.authStrategy === 'same-origin-cookie',
      'priceline.search_locations builds one first-party autosuggest GET spec');
    check(plLocationsOut && plLocationsOut.success === true
      && plLocationsOut.data.locations.length === 1
      && plLocationsOut.data.locations[0].name === 'Louisville'
      && plLocationsOut.data.locations[0].type === 'CITY',
      'priceline.search_locations maps autosuggest city results');

    const plAirports = makeCtx('https://www.priceline.com', 141);
    const plAirportsOut = await pl['priceline.search_airports'].handle({ keyword: 'Louisville' }, plAirports.ctx);
    check(plAirports.calls.length === 1
      && plAirports.calls[0].spec.url === 'https://www.priceline.com/svcs/ac/index/flights/Louisville/0/9/0/0'
      && plAirports.calls[0].spec.origin === 'https://www.priceline.com',
      'priceline.search_airports targets the first-party flight autocomplete endpoint');
    check(plAirportsOut && plAirportsOut.success === true
      && plAirportsOut.data.airports[0].id === 'SDF'
      && plAirportsOut.data.airports[0].timezone === 'America/Kentucky/Louisville',
      'priceline.search_airports maps flight autocomplete results');

    const plPoi = makeCtx('https://www.priceline.com', 142);
    const plPoiOut = await pl['priceline.search_points_of_interest'].handle({
      city_name: 'Louisville',
      limit: 5
    }, plPoi.ctx);
    check(plPoi.calls.length === 1
      && plPoi.calls[0].spec.url === 'https://www.priceline.com/pws/v0/index/relax/search/topPOIByCityIdOrCityName?numGenAiPOIs=5&cityName=Louisville',
      'priceline.search_points_of_interest targets topPOIByCityIdOrCityName with city_name and limit');
    check(plPoiOut && plPoiOut.success === true
      && plPoiOut.data.points_of_interest[0].name === 'Churchill Downs'
      && plPoiOut.data.points_of_interest[0].display_line_2 === 'Louisville, KY',
      'priceline.search_points_of_interest maps public POI results');

    const plBadShape = makeCtx('https://www.priceline.com', 143, { pricelineData: { ok: true } });
    const plBadShapeOut = await pl['priceline.search_locations'].handle({ keyword: 'Louisville' }, plBadShape.ctx);
    check(plBadShapeOut && plBadShapeOut.success === false
      && plBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && plBadShapeOut.reason === 'priceline-public-read-items-missing',
      'priceline.search_locations rejects an unexpected public JSON shape');
  }

  // =========================================================================
  // Airbnb same-origin GraphQL/page-state read head -- catalog/handlers/airbnb.js
  // =========================================================================
  const airbnbPath = path.join(HANDLERS_DIR, 'airbnb.js');
  check(fs.existsSync(airbnbPath), 'catalog/handlers/airbnb.js exists');
  if (fs.existsSync(airbnbPath)) {
    const abnb = require(airbnbPath);
    const abnbSrc = readSource(airbnbPath);
    const airbnbReadSlugs = [
      'airbnb.get_current_user',
      'airbnb.get_header_info',
      'airbnb.get_inbox_filters',
      'airbnb.get_listing_from_page',
      'airbnb.get_map_viewport_info',
      'airbnb.get_message_thread',
      'airbnb.get_search_results',
      'airbnb.get_user_thumbnail',
      'airbnb.get_wishlist_items',
      'airbnb.is_host',
      'airbnb.list_message_threads',
      'airbnb.list_wishlists',
      'airbnb.search_suggestions'
    ];

    check(airbnbReadSlugs.every(function(slug) {
      return abnb[slug] && abnb[slug].tier === 'T1a'
        && abnb[slug].sideEffectClass === 'read'
        && abnb[slug].origin === 'https://www.airbnb.com'
        && abnb[slug].params
        && typeof abnb[slug].handle === 'function';
    }), 'Airbnb reviewed read slugs are tier:T1a entries pinned to www.airbnb.com');
    check(!abnb['airbnb.remove_from_wishlist']
      && abnbSrc.indexOf("'airbnb.remove_from_wishlist'") === -1
      && abnbSrc.indexOf('"airbnb.remove_from_wishlist"') === -1,
      'Airbnb destructive wishlist removal stays in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(abnbSrc),
      'airbnb.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(abnbSrc),
      'airbnb.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(abnbSrc),
      'airbnb.js does not scrape cookies/storage or inject bearer auth directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(abnbSrc),
      'airbnb.js does NOT console-log a secret-bearing variable');

    const abnbGraphCalls = [];
    const abnbGraphCtx = {
      origin: 'https://www.airbnb.com',
      tabId: 181,
      async executeBoundSpec(spec, tabId) {
        abnbGraphCalls.push({ spec: spec, tabId: tabId });
        return {
          success: true,
          status: 200,
          data: {
            data: {
              presentation: {
                autoSuggestions: {
                  staysAutoSuggestionResults: [{
                    items: [{
                      __typename: 'LocationSuggestionItem',
                      title: 'Louisville',
                      subtitle: 'Kentucky, United States',
                      iconUrl: 'https://a0.muscache.com/test.jpg'
                    }]
                  }]
                }
              }
            }
          }
        };
      }
    };
    const abnbSuggestionsOut = await abnb['airbnb.search_suggestions'].handle({ query: 'Louisville' }, abnbGraphCtx);
    check(abnbGraphCalls.length === 1
      && abnbGraphCalls[0].spec.method === 'GET'
      && abnbGraphCalls[0].spec.url.indexOf('https://www.airbnb.com/api/v3/AutoSuggestionsQuery/840ae28ff24af2a4729bd74fb5b98eadcd3412e3a28fea5c9ae18e5a216e6aca?') === 0
      && abnbGraphCalls[0].spec.url.indexOf('operationName=AutoSuggestionsQuery') !== -1
      && abnbGraphCalls[0].spec.origin === 'https://www.airbnb.com'
      && abnbGraphCalls[0].spec.authStrategy === 'same-origin-cookie'
      && abnbGraphCalls[0].spec.headers['X-Airbnb-API-Key'] === 'd306zoyjsyarp7ifhu67rjxn52tv0t20',
      'airbnb.search_suggestions builds one first-party persisted GraphQL GET spec');
    check(abnbSuggestionsOut && abnbSuggestionsOut.success === true
      && abnbSuggestionsOut.data.suggestions.length === 1
      && abnbSuggestionsOut.data.suggestions[0].display_name === 'Louisville'
      && abnbSuggestionsOut.data.suggestions[0].type === 'Kentucky, United States',
      'airbnb.search_suggestions maps location suggestion rows');

    const abnbPageCalls = [];
    const abnbPageOut = await abnb['airbnb.get_search_results'].handle({}, {
      origin: 'https://www.airbnb.com',
      tabId: 182,
      async executeBoundPageRead(request, tabId) {
        abnbPageCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: {
          results: [{ id: '123', name: 'Airbnb fixture', listing_url: 'https://www.airbnb.com/rooms/123' }],
          result_count: 1,
          page_url: 'https://www.airbnb.com/s/Louisville/homes'
        } };
      }
    });
    check(abnbPageCalls.length === 1
      && abnbPageCalls[0].request.namespace === 'airbnb'
      && abnbPageCalls[0].request.origin === 'https://www.airbnb.com'
      && abnbPageCalls[0].request.action === 'get_search_results'
      && abnbPageCalls[0].tabId === 182
      && abnbPageOut.success === true
      && abnbPageOut.data.result_count === 1,
      'airbnb.get_search_results routes through the fixed origin-pinned page-read primitive');

    const abnbThreadCalls = [];
    const abnbThreadPageCalls = [];
    const abnbThreadOut = await abnb['airbnb.list_message_threads'].handle({ limit: 3, filter: 'traveling' }, {
      origin: 'https://www.airbnb.com',
      tabId: 183,
      async executeBoundPageRead(request, tabId) {
        abnbThreadPageCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { id: '123', currency: 'USD' } };
      },
      async executeBoundSpec(spec, tabId) {
        abnbThreadCalls.push({ spec: spec, tabId: tabId });
        return { success: true, status: 200, data: { data: {
          node: {
            messagingInbox: {
              threads: {
                edges: [{
                  node: {
                    id: 'thread-1',
                    messageThreadType: 'RESERVATION',
                    inboxTitle: { components: [{ text: 'Reservation' }] },
                    inboxDescription: { components: [{ text: 'Latest message' }] },
                    userThreadTags: [{ userThreadTagName: 'unread' }],
                    mostRecentInboxActivityAtMsFromROS: '1782864000000',
                    participants: { edges: [{ node: { enrichedParticipantInfo: { name: 'Host' } } }] },
                    inboxListingImageUrl: 'https://a0.muscache.com/listing.jpg'
                  }
                }],
                pageInfo: { hasNextPage: false }
              }
            }
          }
        } } };
      }
    });
    const threadVarsMatch = abnbThreadCalls[0] && abnbThreadCalls[0].spec.url.match(/[?&]variables=([^&]+)/);
    const threadVars = threadVarsMatch ? JSON.parse(decodeURIComponent(threadVarsMatch[1])) : {};
    check(abnbThreadPageCalls.length === 1
      && abnbThreadPageCalls[0].request.action === 'get_user_attributes'
      && abnbThreadCalls.length === 1
      && threadVars.userId === Buffer.from('Viewer:123', 'utf8').toString('base64')
      && threadVars.numRequestedThreads === 3
      && threadVars.threadTagFilters[0] === 'traveling',
      'airbnb.list_message_threads reads the viewer id through page-read then builds the inbox GraphQL query');
    check(abnbThreadOut && abnbThreadOut.success === true
      && abnbThreadOut.data.threads.length === 1
      && abnbThreadOut.data.threads[0].title === 'Reservation'
      && abnbThreadOut.data.threads[0].is_unread === true,
      'airbnb.list_message_threads maps thread rows');

    const abnbBadShapeCalls = [];
    const abnbBadShapeOut = await abnb['airbnb.is_host'].handle({}, {
      origin: 'https://www.airbnb.com',
      tabId: 184,
      async executeBoundSpec(spec, tabId) {
        abnbBadShapeCalls.push({ spec: spec, tabId: tabId });
        return { success: true, status: 200, data: { data: {} } };
      }
    });
    check(abnbBadShapeCalls.length === 1
      && abnbBadShapeOut && abnbBadShapeOut.success === false
      && abnbBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && abnbBadShapeOut.reason === 'airbnb-graphql-shape-mismatch',
      'airbnb.is_host rejects unexpected GraphQL shapes');

    const abnbNoPagePrimitive = await abnb['airbnb.get_listing_from_page'].handle({}, {
      origin: 'https://www.airbnb.com',
      tabId: 185
    });
    check(abnbNoPagePrimitive && abnbNoPagePrimitive.success === false
      && abnbNoPagePrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && abnbNoPagePrimitive.reason === 'airbnb-execute-bound-page-read-unavailable',
      'airbnb.get_listing_from_page fails closed when executeBoundPageRead is unavailable');
  }

  // =========================================================================
  // Expedia public same-origin search-page read head -- catalog/handlers/expedia.js
  // =========================================================================
  const expediaPath = path.join(HANDLERS_DIR, 'expedia.js');
  check(fs.existsSync(expediaPath), 'catalog/handlers/expedia.js exists');
  if (fs.existsSync(expediaPath)) {
    const ex = require(expediaPath);
    const exSrc = readSource(expediaPath);
    const expediaSlugs = [
      'expedia.navigate_to_hotel',
      'expedia.search_activities',
      'expedia.search_car_rentals',
      'expedia.search_cruises',
      'expedia.search_flights',
      'expedia.search_packages'
    ];

    check(expediaSlugs.every(function(slug) {
      return ex[slug] && ex[slug].tier === 'T1a'
        && ex[slug].sideEffectClass === 'read'
        && ex[slug].origin === 'https://www.expedia.com'
        && ex[slug].params
        && typeof ex[slug].handle === 'function';
    }), 'Expedia public search-page slugs are tier:T1a READ entries pinned to www.expedia.com');
    check(!ex['expedia.get_current_user'] && !ex['expedia.list_trips']
      && !ex['expedia.navigate_to_account'] && !ex['expedia.navigate_to_trips']
      && !ex['expedia.search_hotels'] && !ex['expedia.search_locations'],
      'Expedia account/trips/typeahead/GraphQL rows stay in the discovery tail');

    check(!/chrome\.(scripting|tabs)/.test(exSrc),
      'expedia.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(exSrc),
      'expedia.js performs no direct network call');
    check(!/Authorization|Bearer|getAuthCache|getPageGlobal|document\.cookie|localStorage|sessionStorage|window\.location/.test(exSrc),
      'expedia.js does not scrape auth/page-state helpers, inject Authorization headers, or navigate the page');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(exSrc),
      'expedia.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(path.join(EXT_HANDLERS_DIR, 'expedia.js'))
      && readSource(path.join(EXT_HANDLERS_DIR, 'expedia.js')) === exSrc,
      'extension/catalog/handlers/expedia.js matches catalog/handlers/expedia.js byte-for-byte');

    const exFlights = makeCtx('https://www.expedia.com', 144);
    const exFlightsOut = await ex['expedia.search_flights'].handle({
      origin: 'SFO',
      destination: 'JFK',
      departure_date: '2026-08-20',
      return_date: '2026-08-27',
      adults: 2,
      cabin_class: 'business'
    }, exFlights.ctx);
    check(exFlights.calls.length === 1
      && exFlights.calls[0].spec.method === 'GET'
      && exFlights.calls[0].spec.url === 'https://www.expedia.com/Flights-Search?trip=roundtrip&leg1=from:SFO,to:JFK,departure:08%2F20%2F2026&leg2=from:JFK,to:SFO,departure:08%2F27%2F2026&passengers=adults:2&class=business&mode=search'
      && exFlights.calls[0].spec.origin === 'https://www.expedia.com'
      && exFlights.calls[0].spec.authStrategy === 'same-origin-cookie'
      && exFlights.calls[0].spec.headers.Accept === 'text/html',
      'expedia.search_flights builds one first-party flight search HTML GET spec');
    check(exFlightsOut && exFlightsOut.success === true
      && exFlightsOut.data.search_url === exFlights.calls[0].spec.url
      && exFlightsOut.data.navigated === false,
      'expedia.search_flights returns the proven search URL without navigating the page');

    const exCars = makeCtx('https://www.expedia.com', 145);
    await ex['expedia.search_car_rentals'].handle({
      pickup_location: 'LAX',
      pickup_date: '2026-09-01',
      dropoff_date: '2026-09-05'
    }, exCars.ctx);
    check(exCars.calls.length === 1
      && exCars.calls[0].spec.url === 'https://www.expedia.com/Cars-Search?loc=LAX&date1=09%2F01%2F2026&date2=09%2F05%2F2026&time1=10%3A00&time2=10%3A00',
      'expedia.search_car_rentals defaults pickup/dropoff times and formats dates');

    const exHotel = makeCtx('https://www.expedia.com', 146);
    await ex['expedia.navigate_to_hotel'].handle({
      hotel_name: 'Galt House',
      region_id: '553248635976433193',
      check_in_date: '2026-10-10',
      check_out_date: '2026-10-12',
      adults: 3
    }, exHotel.ctx);
    check(exHotel.calls.length === 1
      && exHotel.calls[0].spec.url === 'https://www.expedia.com/Hotel-Search?destination=Galt%20House&regionId=553248635976433193&startDate=10%2F10%2F2026&endDate=10%2F12%2F2026&rooms=1&adults=3',
      'expedia.navigate_to_hotel builds the first-party hotel search page URL');

    const exPackages = makeCtx('https://www.expedia.com', 147);
    await ex['expedia.search_packages'].handle({
      origin: 'SFO',
      destination: 'CUN',
      departure_date: '2026-11-01',
      return_date: '2026-11-08'
    }, exPackages.ctx);
    check(exPackages.calls.length === 1
      && exPackages.calls[0].spec.url === 'https://www.expedia.com/Vacation-Packages-Search?origin=SFO&destination=CUN&d1=11%2F01%2F2026&d2=11%2F08%2F2026&adults=2',
      'expedia.search_packages defaults adults and targets vacation package search');

    const exActivities = makeCtx('https://www.expedia.com', 148);
    await ex['expedia.search_activities'].handle({
      destination: 'Louisville',
      start_date: '2026-07-10',
      end_date: '2026-07-11'
    }, exActivities.ctx);
    check(exActivities.calls.length === 1
      && exActivities.calls[0].spec.url === 'https://www.expedia.com/Activities-Search?location=Louisville&startDate=07%2F10%2F2026&endDate=07%2F11%2F2026',
      'expedia.search_activities targets the first-party activities search page');

    const exCruises = makeCtx('https://www.expedia.com', 149);
    await ex['expedia.search_cruises'].handle({ destination: 'Caribbean', departure_month: '2026-12' }, exCruises.ctx);
    check(exCruises.calls.length === 1
      && exCruises.calls[0].spec.url === 'https://www.expedia.com/Cruise-Search?destination=Caribbean&departureMonth=2026-12',
      'expedia.search_cruises targets the first-party cruise search page');

    const exBadShape = makeCtx('https://www.expedia.com', 150, { expediaText: '{"ok":true}' });
    const exBadShapeOut = await ex['expedia.search_flights'].handle({
      origin: 'SFO',
      destination: 'JFK',
      departure_date: '2026-08-20'
    }, exBadShape.ctx);
    check(exBadShapeOut && exBadShapeOut.success === false
      && exBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && exBadShapeOut.reason === 'expedia-public-search-html-missing',
      'expedia.search_flights rejects an unexpected non-HTML search response');
	  }

  // =========================================================================
  // Booking.com public same-origin HTML read head -- catalog/handlers/booking.js
  // =========================================================================
  const bookingPath = path.join(HANDLERS_DIR, 'booking.js');
  check(fs.existsSync(bookingPath), 'catalog/handlers/booking.js exists');
  if (fs.existsSync(bookingPath)) {
    const booking = require(bookingPath);
    const bookingSrc = readSource(bookingPath);
    const bookingSlugs = [
      'booking.get_property',
      'booking.get_property_reviews',
      'booking.navigate_to_property',
      'booking.navigate_to_search',
      'booking.search_destinations',
      'booking.search_properties'
    ];

    check(bookingSlugs.every(function(slug) {
      return booking[slug] && booking[slug].tier === 'T1a'
        && booking[slug].sideEffectClass === 'read'
        && booking[slug].origin === 'https://www.booking.com'
        && booking[slug].params
        && typeof booking[slug].handle === 'function';
    }), 'Booking public search/property slugs are tier:T1a READ entries pinned to www.booking.com');
    check(!booking['booking.get_current_user'] && !booking['booking.get_genius_status']
      && !booking['booking.list_trips'] && !booking['booking.list_wishlists'],
      'Booking account/Genius/trips/wishlist rows stay in the discovery tail');

    check(!/chrome\.(scripting|tabs)/.test(bookingSrc),
      'booking.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(bookingSrc),
      'booking.js performs no direct network call');
    check(!/Authorization|Bearer|getAuthCache|getPageGlobal|document\.cookie|localStorage|sessionStorage|window\.location|x-booking-csrf-token/.test(bookingSrc),
      'booking.js does not scrape auth/page-state helpers, inject Authorization headers, or navigate the page');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(bookingSrc),
      'booking.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(path.join(EXT_HANDLERS_DIR, 'booking.js'))
      && readSource(path.join(EXT_HANDLERS_DIR, 'booking.js')) === bookingSrc,
      'extension/catalog/handlers/booking.js matches catalog/handlers/booking.js byte-for-byte');

    const bookingSearch = makeCtx('https://www.booking.com', 151);
    const bookingSearchOut = await booking['booking.search_properties'].handle({
      destination: 'Louisville',
      checkin: '2026-08-20',
      checkout: '2026-08-22',
      adults: 2,
      rooms: 1
    }, bookingSearch.ctx);
    check(bookingSearch.calls.length === 1
      && bookingSearch.calls[0].spec.method === 'GET'
      && bookingSearch.calls[0].spec.url === 'https://www.booking.com/searchresults.html?ss=Louisville&checkin=2026-08-20&checkout=2026-08-22&group_adults=2&group_children=0&no_rooms=1'
      && bookingSearch.calls[0].spec.origin === 'https://www.booking.com'
      && bookingSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && bookingSearch.calls[0].spec.headers.Accept === 'text/html',
      'booking.search_properties builds one first-party search HTML GET spec');
    check(bookingSearchOut && bookingSearchOut.success === true
      && bookingSearchOut.data.properties.length === 1
      && bookingSearchOut.data.properties[0].name === 'Galt House Hotel'
      && bookingSearchOut.data.properties[0].url === 'https://www.booking.com/hotel/us/galt-house-hotel.html'
      && bookingSearchOut.data.destination_name === 'Louisville',
      'booking.search_properties maps Apollo search results into property output');

    const bookingDestinations = makeCtx('https://www.booking.com', 152);
    const bookingDestinationsOut = await booking['booking.search_destinations'].handle({
      query: 'Louisville'
    }, bookingDestinations.ctx);
    check(bookingDestinations.calls.length === 1
      && bookingDestinations.calls[0].spec.url === 'https://www.booking.com/searchresults.html?ss=Louisville&group_adults=2&no_rooms=1'
      && bookingDestinationsOut && bookingDestinationsOut.success === true
      && bookingDestinationsOut.data.destinations.some(function(item) {
        return item.dest_id === '20025329' && item.label === 'Louisville, Kentucky, United States';
      }),
      'booking.search_destinations maps public destination suggestions from the same-origin page');

    const bookingProperty = makeCtx('https://www.booking.com', 153);
    const bookingPropertyOut = await booking['booking.get_property'].handle({
      property_name: 'Galt House',
      city: 'Louisville',
      checkin: '2026-08-20',
      checkout: '2026-08-22'
    }, bookingProperty.ctx);
    check(bookingProperty.calls.length === 1
      && bookingProperty.calls[0].spec.url === 'https://www.booking.com/searchresults.html?ss=Galt%20House%20Louisville&checkin=2026-08-20&checkout=2026-08-22&group_adults=2&group_children=0&no_rooms=1'
      && bookingPropertyOut && bookingPropertyOut.success === true
      && bookingPropertyOut.data.property.review_score === 8.6
      && bookingPropertyOut.data.property.price_text === '$250',
      'booking.get_property finds the best public search match and maps details');

    const bookingReviews = makeCtx('https://www.booking.com', 154);
    const bookingReviewsOut = await booking['booking.get_property_reviews'].handle({
      property_name: 'Galt House',
      city: 'Louisville',
      checkin: '2026-08-20',
      checkout: '2026-08-22'
    }, bookingReviews.ctx);
    check(bookingReviewsOut && bookingReviewsOut.success === true
      && bookingReviewsOut.data.property_name === 'Galt House Hotel'
      && bookingReviewsOut.data.review_score === 8.6
      && bookingReviewsOut.data.review_count === 1234
      && bookingReviewsOut.data.star_rating === 4,
      'booking.get_property_reviews returns review summary from the mapped public result');

    const bookingNavigateSearch = makeCtx('https://www.booking.com', 155);
    const bookingNavigateSearchOut = await booking['booking.navigate_to_search'].handle({
      destination: 'Louisville',
      checkin: '2026-08-20',
      checkout: '2026-08-22',
      adults: 3,
      rooms: 2
    }, bookingNavigateSearch.ctx);
    check(bookingNavigateSearch.calls.length === 1
      && bookingNavigateSearch.calls[0].spec.url === 'https://www.booking.com/searchresults.html?ss=Louisville&checkin=2026-08-20&checkout=2026-08-22&group_adults=3&group_children=0&no_rooms=2'
      && bookingNavigateSearchOut.data.url === bookingNavigateSearch.calls[0].spec.url
      && bookingNavigateSearchOut.data.navigated === false,
      'booking.navigate_to_search returns the proven search URL without navigating the page');

    const bookingNavigateProperty = makeCtx('https://www.booking.com', 156);
    const bookingNavigatePropertyOut = await booking['booking.navigate_to_property'].handle({
      page_name: 'galt-house-hotel',
      country_code: 'US',
      checkin: '2026-08-20',
      checkout: '2026-08-22'
    }, bookingNavigateProperty.ctx);
    check(bookingNavigateProperty.calls.length === 1
      && bookingNavigateProperty.calls[0].spec.url === 'https://www.booking.com/hotel/us/galt-house-hotel.html?checkin=2026-08-20&checkout=2026-08-22'
      && bookingNavigatePropertyOut.data.url === bookingNavigateProperty.calls[0].spec.url
      && bookingNavigatePropertyOut.data.navigated === false,
      'booking.navigate_to_property returns the proven property URL without navigating the page');

    const bookingBadShape = makeCtx('https://www.booking.com', 157, {
      bookingText: '<html><body>No Apollo cache</body></html>'
    });
    const bookingBadShapeOut = await booking['booking.search_properties'].handle({
      destination: 'Louisville',
      checkin: '2026-08-20',
      checkout: '2026-08-22'
    }, bookingBadShape.ctx);
    check(bookingBadShapeOut && bookingBadShapeOut.success === false
      && bookingBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && bookingBadShapeOut.reason === 'booking-apollo-cache-missing',
      'booking.search_properties rejects missing Apollo cache shape');
  }

  // =========================================================================
  // StubHub same-origin JSON read head -- catalog/handlers/stubhub.js
  // =========================================================================
  const stubhubPath = path.join(HANDLERS_DIR, 'stubhub.js');
  check(fs.existsSync(stubhubPath), 'catalog/handlers/stubhub.js exists');
  if (fs.existsSync(stubhubPath)) {
    const stubhub = require(stubhubPath);
    const stubhubSrc = readSource(stubhubPath);
    const stubhubReadSlugs = [
      'stubhub.search_events',
      'stubhub.get_listing',
      'stubhub.list_orders'
    ];

    check(stubhubReadSlugs.every(function(slug) {
      return stubhub[slug] && stubhub[slug].tier === 'T1a'
        && stubhub[slug].sideEffectClass === 'read'
        && stubhub[slug].origin === 'https://www.stubhub.com'
        && stubhub[slug].params
        && typeof stubhub[slug].handle === 'function';
    }), 'StubHub reviewed GET read slugs are tier:T1a READ entries pinned to www.stubhub.com');
    check(!stubhub['stubhub.buy_tickets']
        && stubhubSrc.indexOf('stubhub.buy_tickets') === -1
        && stubhubSrc.indexOf('"stubhub.buy_tickets"') === -1,
      'StubHub buy_tickets stays DOM-backed and is absent from the handler head');

    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(stubhubSrc),
      'stubhub.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(stubhubSrc),
      'stubhub.js performs no direct network call');
    check(!/method:\s*['"]POST['"]/.test(stubhubSrc),
      'stubhub.js exposes no POST-bound money-moving spec');
    check(!/Authorization|Bearer|document\.cookie|localStorage|sessionStorage|window\.location|getAuthCache|getPageGlobal|csrfSource/.test(stubhubSrc),
      'stubhub.js does not scrape auth helpers, inject bearer auth, or navigate the page');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(stubhubSrc),
      'stubhub.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(path.join(EXT_HANDLERS_DIR, 'stubhub.js'))
      && readSource(path.join(EXT_HANDLERS_DIR, 'stubhub.js')) === stubhubSrc,
      'extension/catalog/handlers/stubhub.js matches catalog/handlers/stubhub.js byte-for-byte');

    const stubhubDescriptorBacking = {
      'opentabs__stubhub__search_events.json': 'handler',
      'opentabs__stubhub__get_listing.json': 'handler',
      'opentabs__stubhub__list_orders.json': 'handler',
      'opentabs__stubhub__buy_tickets.json': 'dom'
    };
    Object.keys(stubhubDescriptorBacking).forEach(function(name) {
      const descriptor = readJson(path.join(DESCRIPTORS_DIR, name));
      check(descriptor.backing === stubhubDescriptorBacking[name],
        'catalog/descriptors/' + name + ' keeps StubHub backing=' + stubhubDescriptorBacking[name]);
    });

    const stubhubSearch = makeCtx('https://www.stubhub.com', 186);
    const stubhubSearchOut = await stubhub['stubhub.search_events'].handle({
      keyword: 'Louisville',
      city: 'Louisville',
      start_date: '2026-09-01',
      end_date: '2026-09-30'
    }, stubhubSearch.ctx);
    check(stubhubSearch.calls.length === 1
      && stubhubSearch.calls[0].spec.method === 'GET'
      && stubhubSearch.calls[0].spec.url === 'https://www.stubhub.com/search/catalog/events?q=Louisville&city=Louisville&dateStart=2026-09-01&dateEnd=2026-09-30'
      && stubhubSearch.calls[0].spec.origin === 'https://www.stubhub.com'
      && stubhubSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && stubhubSearch.calls[0].spec.headers.Accept === 'application/json',
      'stubhub.search_events builds one first-party catalog event GET spec');
    check(stubhubSearchOut && stubhubSearchOut.success === true
      && stubhubSearchOut.data.events.length === 1
      && stubhubSearchOut.data.events[0].id === 'event-1'
      && stubhubSearchOut.data.events[0].venue === 'L and N Stadium'
      && stubhubSearchOut.data.events[0].lowest_price === 'USD 42.50',
      'stubhub.search_events maps StubHub event JSON into stable read output');

    const stubhubListing = makeCtx('https://www.stubhub.com', 187);
    const stubhubListingOut = await stubhub['stubhub.get_listing'].handle({
      listing_id: 'listing-1'
    }, stubhubListing.ctx);
    check(stubhubListing.calls.length === 1
      && stubhubListing.calls[0].spec.url === 'https://www.stubhub.com/inventory/listings/listing-1'
      && stubhubListing.calls[0].spec.method === 'GET',
      'stubhub.get_listing builds one first-party listing GET spec');
    check(stubhubListingOut && stubhubListingOut.success === true
      && stubhubListingOut.data.listing.id === 'listing-1'
      && stubhubListingOut.data.listing.price === 'USD 42.50'
      && stubhubListingOut.data.listing.section === '101'
      && stubhubListingOut.data.listing.row === 'A'
      && stubhubListingOut.data.listing.quantity === 2,
      'stubhub.get_listing maps price, section, row, and quantity');

    const stubhubOrders = makeCtx('https://www.stubhub.com', 188);
    const stubhubOrdersOut = await stubhub['stubhub.list_orders'].handle({
      status: 'upcoming',
      limit: 2
    }, stubhubOrders.ctx);
    check(stubhubOrders.calls.length === 1
      && stubhubOrders.calls[0].spec.url === 'https://www.stubhub.com/orders?status=upcoming&limit=2'
      && stubhubOrders.calls[0].spec.method === 'GET',
      'stubhub.list_orders builds one first-party orders GET spec');
    check(stubhubOrdersOut && stubhubOrdersOut.success === true
      && stubhubOrdersOut.data.orders.length === 1
      && stubhubOrdersOut.data.orders[0].status === 'upcoming'
      && stubhubOrdersOut.data.orders[0].listing_id === 'listing-1'
      && stubhubOrdersOut.data.orders[0].total === 'USD 85.00',
      'stubhub.list_orders maps order status, listing, and total');

    const stubhubBadShape = makeCtx('https://www.stubhub.com', 189, { stubhubData: { ok: true } });
    const stubhubBadShapeOut = await stubhub['stubhub.search_events'].handle({
      keyword: 'Louisville'
    }, stubhubBadShape.ctx);
    check(stubhubBadShapeOut && stubhubBadShapeOut.success === false
      && stubhubBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && stubhubBadShapeOut.reason === 'stubhub-json-items-missing',
      'stubhub.search_events rejects JSON responses that lack event arrays');

    const stubhubNoPrimitive = await stubhub['stubhub.list_orders'].handle({}, {
      origin: 'https://www.stubhub.com',
      tabId: 190
    });
    check(stubhubNoPrimitive && stubhubNoPrimitive.success === false
      && stubhubNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && stubhubNoPrimitive.reason === 'stubhub-execute-bound-spec-unavailable',
      'stubhub.list_orders fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Kayak same-origin read + guarded price-alert write head -- catalog/handlers/kayak.js
  // =========================================================================
  const kayakPath = path.join(HANDLERS_DIR, 'kayak.js');
  check(fs.existsSync(kayakPath), 'catalog/handlers/kayak.js exists');
  if (fs.existsSync(kayakPath)) {
    const kayak = require(kayakPath);
    const kayakSrc = readSource(kayakPath);
    const kayakReadSlugs = [
      'kayak.search_flights',
      'kayak.search_hotels',
      'kayak.get_price_alert'
    ];
    check(kayakReadSlugs.every(function(slug) {
      return kayak[slug] && kayak[slug].tier === 'T1a'
        && kayak[slug].sideEffectClass === 'read'
        && kayak[slug].origin === 'https://www.kayak.com'
        && kayak[slug].params
        && typeof kayak[slug].handle === 'function';
    }), 'Kayak read slugs are tier:T1a entries pinned to www.kayak.com');
    check(kayak['kayak.create_price_alert']
      && kayak['kayak.create_price_alert'].sideEffectClass === 'write'
      && typeof kayak['kayak.create_price_alert'].handle === 'function',
      'Kayak create_price_alert is present only as a guarded write handler');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(kayakSrc),
      'kayak.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(kayakSrc),
      'kayak.js performs no direct network call');
    check(!/Authorization|Bearer|document\.cookie|localStorage|sessionStorage|window\.location/.test(kayakSrc),
      'kayak.js does not scrape auth helpers, inject bearer auth, or navigate the page');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(kayakSrc),
      'kayak.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(path.join(EXT_HANDLERS_DIR, 'kayak.js'))
      && readSource(path.join(EXT_HANDLERS_DIR, 'kayak.js')) === kayakSrc,
      'extension/catalog/handlers/kayak.js matches catalog/handlers/kayak.js byte-for-byte');

    function makeKayakCtx(data, tabId) {
      const calls = [];
      return {
        calls: calls,
        ctx: {
          origin: 'https://www.kayak.com',
          tabId: tabId,
          async executeBoundSpec(spec, calledTabId) {
            calls.push({ spec: spec, tabId: calledTabId });
            return { success: true, status: 200, data: data };
          }
        }
      };
    }

    const kayakFlights = makeKayakCtx({
      flights: [{ id: 'f1', carrier: 'Delta', fare: 321.5 }]
    }, 186);
    const kayakFlightsOut = await kayak['kayak.search_flights'].handle({
      origin: 'SFO',
      destination: 'JFK',
      depart_date: '2026-08-20',
      return_date: '2026-08-27',
      passengers: 2
    }, kayakFlights.ctx);
    check(kayakFlights.calls.length === 1
      && kayakFlights.calls[0].spec.method === 'GET'
      && kayakFlights.calls[0].spec.url === 'https://www.kayak.com/v1/flights/search?origin=SFO&destination=JFK&depart_date=2026-08-20&return_date=2026-08-27&passengers=2'
      && kayakFlights.calls[0].spec.origin === 'https://www.kayak.com'
      && kayakFlights.calls[0].spec.authStrategy === 'same-origin-cookie'
      && kayakFlights.calls[0].spec.headers.Accept === 'application/json',
      'kayak.search_flights builds one first-party flight search GET spec');
    check(kayakFlightsOut && kayakFlightsOut.success === true
      && kayakFlightsOut.data.flights.length === 1
      && kayakFlightsOut.data.flights[0].carrier === 'Delta'
      && kayakFlightsOut.data.flights[0].fare === 321.5,
      'kayak.search_flights maps flight fare rows');

    const kayakHotels = makeKayakCtx({
      hotels: [{ id: 'h1', name: 'Galt House Hotel', price: 250 }]
    }, 187);
    const kayakHotelsOut = await kayak['kayak.search_hotels'].handle({
      destination: 'Louisville',
      check_in: '2026-08-20',
      check_out: '2026-08-22',
      guests: 2
    }, kayakHotels.ctx);
    check(kayakHotels.calls.length === 1
      && kayakHotels.calls[0].spec.url === 'https://www.kayak.com/v1/hotels/search?destination=Louisville&check_in=2026-08-20&check_out=2026-08-22&guests=2'
      && kayakHotelsOut && kayakHotelsOut.success === true
      && kayakHotelsOut.data.hotels[0].name === 'Galt House Hotel',
      'kayak.search_hotels targets the first-party hotel search endpoint and maps rows');

    const kayakAlert = makeKayakCtx({
      alert: { id: 'alert-1', route: 'SFO-JFK', current_price: 199 }
    }, 188);
    const kayakAlertOut = await kayak['kayak.get_price_alert'].handle({ alert_id: 'alert-1' }, kayakAlert.ctx);
    check(kayakAlert.calls.length === 1
      && kayakAlert.calls[0].spec.url === 'https://www.kayak.com/v1/price-alerts/alert-1'
      && kayakAlertOut && kayakAlertOut.success === true
      && kayakAlertOut.data.alert.current_price === 199,
      'kayak.get_price_alert targets the first-party price alert endpoint and maps the alert');

    const kayakBadShape = makeKayakCtx({ ok: true }, 189);
    const kayakBadShapeOut = await kayak['kayak.search_flights'].handle({
      origin: 'SFO',
      destination: 'JFK',
      depart_date: '2026-08-20'
    }, kayakBadShape.ctx);
    check(kayakBadShapeOut && kayakBadShapeOut.success === false
      && kayakBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && kayakBadShapeOut.reason === 'kayak-flights-missing',
      'kayak.search_flights rejects unexpected JSON shapes');

    const guardedCalls = [];
    const guardedOut = await kayak['kayak.create_price_alert'].handle({
      kind: 'flight',
      origin: 'SFO',
      destination: 'JFK'
    }, {
      origin: 'https://www.kayak.com',
      tabId: 190,
      async executeBoundSpec(spec, tabId) {
        guardedCalls.push({ spec: spec, tabId: tabId });
        return { success: true };
      }
    });
    check(guardedOut && guardedOut.success === false
      && guardedOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guardedOut.errorCode === guardedOut.code
      && guardedOut.error === guardedOut.code
      && guardedCalls.length === 0,
      'kayak.create_price_alert is guarded fail-closed and fires no mutation request');
  }

  // =========================================================================
  // MongoDB Atlas same-origin read + guarded mutation head -- catalog/handlers/mongodb.js
  // =========================================================================
  const mongodbPath = path.join(HANDLERS_DIR, 'mongodb.js');
  check(fs.existsSync(mongodbPath), 'catalog/handlers/mongodb.js exists');
  if (fs.existsSync(mongodbPath)) {
    const mongo = require(mongodbPath);
    const mongoSrc = readSource(mongodbPath);
    const mongoReadSlugs = [
      'mongodb.get_billing_plan',
      'mongodb.get_cluster',
      'mongodb.get_current_user',
      'mongodb.get_deployment_status',
      'mongodb.get_organization',
      'mongodb.get_project',
      'mongodb.get_user_security',
      'mongodb.list_alert_configs',
      'mongodb.list_alerts',
      'mongodb.list_clusters',
      'mongodb.list_database_users',
      'mongodb.list_ip_access_list',
      'mongodb.list_network_peering',
      'mongodb.list_organization_members',
      'mongodb.list_organization_projects',
      'mongodb.list_organization_teams'
    ];
    const mongoGuardedSlugs = [
      'mongodb.add_ip_access_entry',
      'mongodb.create_database_user',
      'mongodb.delete_database_user',
      'mongodb.delete_ip_access_entry'
    ];

    check(mongoReadSlugs.every(function(slug) {
      return mongo[slug] && mongo[slug].tier === 'T1a'
        && mongo[slug].sideEffectClass === 'read'
        && mongo[slug].origin === 'https://cloud.mongodb.com'
        && mongo[slug].params
        && typeof mongo[slug].handle === 'function';
    }), 'MongoDB read descriptors are registered as T1a reads pinned to cloud.mongodb.com');
    check(mongoGuardedSlugs.every(function(slug) {
      return mongo[slug] && mongo[slug].tier === 'T1a'
        && (mongo[slug].sideEffectClass === 'write' || mongo[slug].sideEffectClass === 'destructive')
        && mongo[slug].origin === 'https://cloud.mongodb.com'
        && mongo[slug].params
        && typeof mongo[slug].handle === 'function';
    }), 'MongoDB write/destructive descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs)/.test(mongoSrc),
      'mongodb.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(mongoSrc),
      'mongodb.js performs no direct network call');
    check(!/api\.mongodb\.com|cloud-dev\.mongodb\.com|Authorization|Bearer/.test(mongoSrc),
      'mongodb.js stays on the first-party cloud.mongodb.com browser surface');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(mongoSrc),
      'mongodb.js does NOT console-log a secret-bearing variable');

    const mongoUser = makeCtx('https://cloud.mongodb.com', 150, { url: 'https://cloud.mongodb.com/v2/group-test/clusters' });
    const mongoUserOut = await mongo['mongodb.get_current_user'].handle({}, mongoUser.ctx);
    check(mongoUser.calls.length === 1
      && mongoUser.calls[0].spec.url === 'https://cloud.mongodb.com/v2/group-test/clusters'
      && mongoUser.calls[0].spec.origin === 'https://cloud.mongodb.com',
      'mongodb.get_current_user reads the active Atlas page as a same-origin bootstrap probe');
    check(mongoUserOut && mongoUserOut.success === true
      && mongoUserOut.data.user.email === 'mongo@example.invalid',
      'mongodb.get_current_user maps appUser from Atlas bootstrap context');

    const mongoClusters = makeCtx('https://cloud.mongodb.com', 151, { url: 'https://cloud.mongodb.com/v2/group-test/clusters' });
    const mongoClustersOut = await mongo['mongodb.list_clusters'].handle({}, mongoClusters.ctx);
    check(mongoClusters.calls.length === 2
      && mongoClusters.calls[1].spec.url === 'https://cloud.mongodb.com/nds/clusters/group-test'
      && mongoClusters.calls[1].spec.origin === 'https://cloud.mongodb.com'
      && mongoClusters.calls[1].spec.authStrategy === 'same-origin-cookie',
      'mongodb.list_clusters builds a project-scoped first-party Atlas GET spec');
    check(mongoClustersOut && mongoClustersOut.success === true
      && Array.isArray(mongoClustersOut.data)
      && mongoClustersOut.data[0].id === 'mongo-list-item',
      'mongodb.list_clusters accepts an array Atlas API response');

    const mongoCluster = makeCtx('https://cloud.mongodb.com', 152, { url: 'https://cloud.mongodb.com/v2/group-test/clusters' });
    const mongoClusterOut = await mongo['mongodb.get_cluster'].handle({ cluster_name: 'Cluster0' }, mongoCluster.ctx);
    check(mongoCluster.calls.length === 2
      && mongoCluster.calls[1].spec.url === 'https://cloud.mongodb.com/nds/clusters/group-test/Cluster0',
      'mongodb.get_cluster URL-joins group id and cluster_name under cloud.mongodb.com');
    check(mongoClusterOut && mongoClusterOut.success === true
      && mongoClusterOut.data.name === 'Cluster0',
      'mongodb.get_cluster accepts an object Atlas API response');

    const mongoBadShape = makeCtx('https://cloud.mongodb.com', 153, { mongodbData: { error: 'logged out' } });
    const mongoBadShapeOut = await mongo['mongodb.list_database_users'].handle({}, mongoBadShape.ctx);
    check(mongoBadShapeOut && mongoBadShapeOut.success === false
      && mongoBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mongoBadShapeOut.reason === 'mongodb-logged-out-or-shape-mismatch',
      'mongodb.list_database_users rejects logged-out/error envelopes');

    const mongoWrite = makeCtx('https://cloud.mongodb.com', 154);
    const mongoWriteOut = await mongo['mongodb.create_database_user'].handle({
      username: 'fixture',
      password: 'not-real',
      roles: [{ role_name: 'readWrite', database_name: 'admin' }]
    }, mongoWrite.ctx);
    check(mongoWrite.calls.length === 0
      && mongoWriteOut && mongoWriteOut.success === false
      && mongoWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mongoWriteOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && mongoWriteOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && mongoWriteOut.fellBackToDom === true,
      'mongodb.create_database_user is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // CockroachDB Cloud same-origin gRPC page-read + guarded mutation head -- catalog/handlers/cockroachdb.js
  // =========================================================================
  const cockroachPath = path.join(HANDLERS_DIR, 'cockroachdb.js');
  check(fs.existsSync(cockroachPath), 'catalog/handlers/cockroachdb.js exists');
  if (fs.existsSync(cockroachPath)) {
    const crdb = require(cockroachPath);
    const crdbSrc = readSource(cockroachPath);
    const crdbReadSlugs = [
      'cockroachdb.get_cluster',
      'cockroachdb.get_cluster_usage',
      'cockroachdb.get_credit_trial_status',
      'cockroachdb.get_networking_config',
      'cockroachdb.get_organization',
      'cockroachdb.get_resource_count',
      'cockroachdb.get_user_profile',
      'cockroachdb.list_cluster_nodes',
      'cockroachdb.list_clusters',
      'cockroachdb.list_database_names',
      'cockroachdb.list_database_users',
      'cockroachdb.list_invoices',
      'cockroachdb.list_org_users'
    ];
    const crdbGuardedSlugs = [
      'cockroachdb.create_database_user',
      'cockroachdb.delete_cluster',
      'cockroachdb.delete_database_user',
      'cockroachdb.execute_sql',
      'cockroachdb.set_delete_protection'
    ];

    check(crdbReadSlugs.every(function(slug) {
      return crdb[slug] && crdb[slug].tier === 'T1a'
        && crdb[slug].sideEffectClass === 'read'
        && crdb[slug].origin === 'https://cockroachlabs.cloud'
        && crdb[slug].params
        && typeof crdb[slug].handle === 'function';
    }), 'CockroachDB read descriptors are registered as T1a reads pinned to cockroachlabs.cloud');
    check(crdbGuardedSlugs.every(function(slug) {
      return crdb[slug] && crdb[slug].tier === 'T1a'
        && (crdb[slug].sideEffectClass === 'write' || crdb[slug].sideEffectClass === 'destructive')
        && crdb[slug].origin === 'https://cockroachlabs.cloud'
        && crdb[slug].params
        && typeof crdb[slug].handle === 'function';
    }), 'CockroachDB write/destructive descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs)/.test(crdbSrc),
      'cockroachdb.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(crdbSrc),
      'cockroachdb.js performs no direct network call');
    check(!/Authorization|Bearer|document\.cookie|localStorage|sessionStorage/.test(crdbSrc),
      'cockroachdb.js does not read credentials or storage directly');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(crdbSrc),
      'cockroachdb.js does NOT console-log a secret-bearing variable');

    const crdbCalls = [];
    const crdbCtx = {
      origin: 'https://cockroachlabs.cloud',
      tabId: 155,
      async executeBoundPageRead(request, tabId) {
        crdbCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('CockroachDB reads must not call executeBoundSpec');
      }
    };
    const crdbListOut = await crdb['cockroachdb.list_clusters'].handle({}, crdbCtx);
    check(crdbCalls.length === 1
      && crdbCalls[0].tabId === 155
      && crdbCalls[0].request.origin === 'https://cockroachlabs.cloud'
      && crdbCalls[0].request.namespace === 'cockroachdb'
      && crdbCalls[0].request.action === 'list_clusters',
      'cockroachdb.list_clusters dispatches a bounded CockroachDB page-read request');
    check(crdbListOut && crdbListOut.success === true && crdbListOut.data.action === 'list_clusters',
      'cockroachdb.list_clusters returns the bounded page-read result');

    const crdbClusterOut = await crdb['cockroachdb.get_cluster'].handle({ cluster_id: 'cluster-test' }, crdbCtx);
    check(crdbCalls.length === 2
      && crdbCalls[1].request.action === 'get_cluster'
      && crdbCalls[1].request.args.cluster_id === 'cluster-test',
      'cockroachdb.get_cluster forwards cluster_id inside the page-read request args');
    check(crdbClusterOut && crdbClusterOut.success === true && crdbClusterOut.data.action === 'get_cluster',
      'cockroachdb.get_cluster returns the bounded page-read result');

    const crdbNoPrimitive = await crdb['cockroachdb.get_organization'].handle({}, {
      origin: 'https://cockroachlabs.cloud',
      tabId: 156
    });
    check(crdbNoPrimitive && crdbNoPrimitive.success === false
      && crdbNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && crdbNoPrimitive.reason === 'cockroachdb-page-read-primitive-unavailable',
      'cockroachdb.get_organization fails closed when the page-read primitive is unavailable');

    const crdbGuardCalls = [];
    const crdbSqlOut = await crdb['cockroachdb.execute_sql'].handle({
      cluster_id: 'cluster-test',
      statements: ['SELECT 1']
    }, {
      origin: 'https://cockroachlabs.cloud',
      tabId: 157,
      async executeBoundSpec() { crdbGuardCalls.push('spec'); },
      async executeBoundPageRead() { crdbGuardCalls.push('page'); }
    });
    check(crdbSqlOut && crdbSqlOut.success === false
      && crdbSqlOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && crdbSqlOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && crdbSqlOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && crdbSqlOut.fellBackToDom === true
      && crdbGuardCalls.length === 0,
      'cockroachdb.execute_sql is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // ClickHouse Cloud same-origin page-read head -- catalog/handlers/clickhouse.js
  // =========================================================================
  const clickhousePath = path.join(HANDLERS_DIR, 'clickhouse.js');
  check(fs.existsSync(clickhousePath), 'catalog/handlers/clickhouse.js exists');
  if (fs.existsSync(clickhousePath)) {
    const ch = require(clickhousePath);
    const chSrc = readSource(clickhousePath);
    const clickhouseReadSlugs = [
      'clickhouse.get_organization',
      'clickhouse.get_private_endpoint_config',
      'clickhouse.get_scaling_limits',
      'clickhouse.get_service',
      'clickhouse.get_status',
      'clickhouse.list_backups',
      'clickhouse.list_organization_members',
      'clickhouse.list_services',
      'clickhouse.query_metrics'
    ];

    check(clickhouseReadSlugs.every(function(slug) {
      return ch[slug] && ch[slug].tier === 'T1a'
        && ch[slug].sideEffectClass === 'read'
        && ch[slug].origin === 'https://console.clickhouse.cloud'
        && ch[slug].params
        && typeof ch[slug].handle === 'function';
    }), 'ClickHouse read descriptors are registered as T1a reads pinned to console.clickhouse.cloud');
    check(!/chrome\.(scripting|tabs)/.test(chSrc),
      'clickhouse.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(chSrc),
      'clickhouse.js performs no direct network call');
    check(!/Authorization|Bearer|document\.cookie|localStorage|sessionStorage/.test(chSrc),
      'clickhouse.js does not read credentials or storage directly');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|auth0)\b/i.test(chSrc),
      'clickhouse.js does NOT console-log a secret-bearing variable');

    const chCalls = [];
    const chCtx = {
      origin: 'https://console.clickhouse.cloud',
      tabId: 158,
      async executeBoundPageRead(request, tabId) {
        chCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('ClickHouse reads must not call executeBoundSpec');
      }
    };
    const chListOut = await ch['clickhouse.list_services'].handle({}, chCtx);
    check(chCalls.length === 1
      && chCalls[0].tabId === 158
      && chCalls[0].request.origin === 'https://console.clickhouse.cloud'
      && chCalls[0].request.namespace === 'clickhouse'
      && chCalls[0].request.action === 'list_services',
      'clickhouse.list_services dispatches a bounded ClickHouse page-read request');
    check(chListOut && chListOut.success === true && chListOut.data.action === 'list_services',
      'clickhouse.list_services returns the bounded page-read result');

    const chMetricsOut = await ch['clickhouse.query_metrics'].handle({
      service_id: 'svc-test',
      metric_type: 'CPU_USAGE',
      time_period: 'LAST_HOUR'
    }, chCtx);
    check(chCalls.length === 2
      && chCalls[1].request.action === 'query_metrics'
      && chCalls[1].request.args.service_id === 'svc-test'
      && chCalls[1].request.args.metric_type === 'CPU_USAGE',
      'clickhouse.query_metrics forwards service_id and metric_type inside the page-read request args');
    check(chMetricsOut && chMetricsOut.success === true && chMetricsOut.data.action === 'query_metrics',
      'clickhouse.query_metrics returns the bounded page-read result');

    const chNoPrimitive = await ch['clickhouse.get_organization'].handle({}, {
      origin: 'https://console.clickhouse.cloud',
      tabId: 159
    });
    check(chNoPrimitive && chNoPrimitive.success === false
      && chNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && chNoPrimitive.reason === 'clickhouse-page-read-primitive-unavailable',
      'clickhouse.get_organization fails closed when the page-read primitive is unavailable');
  }

  // =========================================================================
  // Temporal Cloud same-origin page-read head -- catalog/handlers/temporal.js
  // =========================================================================
  const temporalPath = path.join(HANDLERS_DIR, 'temporal.js');
  check(fs.existsSync(temporalPath), 'catalog/handlers/temporal.js exists');
  if (fs.existsSync(temporalPath)) {
    const temporal = require(temporalPath);
    const temporalSrc = readSource(temporalPath);
    const temporalReadSlugs = [
      'temporal.count_workflows',
      'temporal.get_schedule',
      'temporal.get_settings',
      'temporal.get_task_queue',
      'temporal.get_workflow',
      'temporal.get_workflow_history',
      'temporal.list_schedules',
      'temporal.list_workflows'
    ];

    check(temporalReadSlugs.every(function(slug) {
      return temporal[slug] && temporal[slug].tier === 'T1a'
        && temporal[slug].sideEffectClass === 'read'
        && temporal[slug].origin === 'https://cloud.temporal.io'
        && temporal[slug].params
        && typeof temporal[slug].handle === 'function';
    }), 'Temporal read descriptors are registered as T1a reads pinned to cloud.temporal.io');
    check(!/chrome\.(scripting|tabs)/.test(temporalSrc),
      'temporal.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(temporalSrc),
      'temporal.js performs no direct network call');
    check(!/Authorization|Bearer|document\.cookie|localStorage|sessionStorage/.test(temporalSrc),
      'temporal.js does not read credentials or storage directly');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|auth0)\b/i.test(temporalSrc),
      'temporal.js does NOT console-log a secret-bearing variable');

    const temporalCalls = [];
    const temporalCtx = {
      origin: 'https://prod-us-west-2.web.tmprl.cloud',
      tabId: 166,
      async executeBoundPageRead(request, tabId) {
        temporalCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Temporal reads must not call executeBoundSpec');
      }
    };
    const temporalListOut = await temporal['temporal.list_workflows'].handle({
      namespace: 'prod-us-west-2.abc123',
      query: 'ExecutionStatus="Running"'
    }, temporalCtx);
    check(temporalCalls.length === 1
      && temporalCalls[0].tabId === 166
      && temporalCalls[0].request.origin === 'https://prod-us-west-2.web.tmprl.cloud'
      && temporalCalls[0].request.namespace === 'temporal'
      && temporalCalls[0].request.action === 'list_workflows'
      && temporalCalls[0].request.args.query === 'ExecutionStatus="Running"',
      'temporal.list_workflows dispatches a bounded Temporal page-read request');
    check(temporalListOut && temporalListOut.success === true && temporalListOut.data.action === 'list_workflows',
      'temporal.list_workflows returns the bounded page-read result');

    const temporalNoPrimitive = await temporal['temporal.get_settings'].handle({}, {
      origin: 'https://cloud.temporal.io',
      tabId: 167
    });
    check(temporalNoPrimitive && temporalNoPrimitive.success === false
      && temporalNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && temporalNoPrimitive.reason === 'temporal-page-read-primitive-unavailable',
      'temporal.get_settings fails closed when the page-read primitive is unavailable');
  }

  // =========================================================================
  // Snowflake same-origin read head -- catalog/handlers/snowflake.js
  // =========================================================================
  const snowflakePath = path.join(HANDLERS_DIR, 'snowflake.js');
  check(fs.existsSync(snowflakePath), 'catalog/handlers/snowflake.js exists');
  if (fs.existsSync(snowflakePath)) {
    const sf = require(snowflakePath);
    const sfSrc = readSource(snowflakePath);
    const snowflakeReadSlugs = [
      'snowflake.browse_data',
      'snowflake.diagnose',
      'snowflake.get_object_details',
      'snowflake.get_query',
      'snowflake.get_session',
      'snowflake.list_dashboards',
      'snowflake.list_folders',
      'snowflake.list_schemas',
      'snowflake.list_shared_objects',
      'snowflake.list_tables',
      'snowflake.list_warehouses',
      'snowflake.list_worksheets',
      'snowflake.run_query',
      'snowflake.search_data'
    ];

    check(snowflakeReadSlugs.every(function(slug) {
      return sf[slug] && sf[slug].tier === 'T1a'
        && sf[slug].sideEffectClass === 'read'
        && sf[slug].origin === 'https://app.snowflake.com'
        && sf[slug].params
        && typeof sf[slug].handle === 'function';
    }), 'all 14 Snowflake descriptors are T1a reads pinned to app.snowflake.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(sfSrc),
      'snowflake.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(sfSrc),
      'snowflake.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(sfSrc),
      'snowflake.js does not console-log secret-bearing values');

    function makeSnowflakeCtx() {
      const specCalls = [];
      const pageCalls = [];
      return {
        specCalls,
        pageCalls,
        ctx: {
          origin: 'https://app.snowflake.com',
          tabId: 180,
          url: 'https://app.snowflake.com/acme/us-east-1/#/worksheets',
          async executeBoundPageRead(request, tabId) {
            pageCalls.push({ request, tabId });
            if (request.action === 'get_context') {
              return { success: true, status: 200, data: {
                appServerUrl: 'https://acme.snowflakecomputing.com',
                decodedUserKey: 'snowflake-context-key',
                role: 'ACCOUNTADMIN',
                userEmail: 'snow@example.invalid',
                orgId: '42',
                orgShortName: 'ACME'
              } };
            }
            if (request.action === 'list_entities') {
              return { success: true, status: 200, data: {
                entities: [
                  {
                    entityId: 'worksheet-1',
                    entityType: request.args.types[0],
                    info: {
                      name: 'Revenue worksheet',
                      created: '2026-06-30T00:00:00Z',
                      modified: '2026-06-30T01:00:00Z',
                      queryLanguage: 'sql',
                      role: 'ACCOUNTADMIN',
                      url: '/worksheets/worksheet-1',
                      visibility: 'private',
                      folderId: null
                    }
                  }
                ],
                next: 'cursor-next'
              } };
            }
            return { success: true, status: 200, data: {
              available: true,
              hasRequestContext: true,
              appServerUrl: 'https://acme.snowflakecomputing.com',
              role: 'ACCOUNTADMIN',
              hasUser: true,
              orgId: '42',
              storeKeys: ['organization', 'entity'],
              hasNufetch: true
            } };
          },
          async executeBoundSpec(spec, tabId) {
            specCalls.push({ spec, tabId });
            const body = parseSpecBody(spec);
            const isSelect = String(body.sqlText || '').indexOf('SELECT') === 0;
            return { success: true, status: 200, data: {
              queryId: 'query-1',
              status: {
                summary: 'SUCCESS',
                totalDuration: 12,
                warehouseName: 'WH_XS'
              },
              result: {
                resultColumnMetadata: isSelect
                  ? [{ name: 'ONE', typeName: 'NUMBER', nullable: false }]
                  : [],
                firstChunkData: isSelect
                  ? '[["1"]]'
                  : '[["2026-06-30","ANALYTICS","","","","ACCOUNTADMIN","","0","","STANDARD"]]',
                firstChunkRowCount: 1,
                chunkFileCount: 1,
                statementType: isSelect ? 'SELECT' : 'SHOW'
              }
            } };
          }
        }
      };
    }

    const sfSession = makeSnowflakeCtx();
    const sfSessionOut = await sf['snowflake.get_session'].handle({}, sfSession.ctx);
    check(sfSession.pageCalls.length === 1
      && sfSession.pageCalls[0].request.namespace === 'snowflake'
      && sfSession.pageCalls[0].request.action === 'get_context'
      && sfSession.pageCalls[0].request.origin === 'https://app.snowflake.com'
      && sfSessionOut.success === true
      && sfSessionOut.data.userEmail === 'snow@example.invalid',
      'snowflake.get_session dispatches a bounded Snowflake page-context read');

    const sfBrowse = makeSnowflakeCtx();
    const sfBrowseOut = await sf['snowflake.browse_data'].handle({}, sfBrowse.ctx);
    const sfBrowseBody = sfBrowse.specCalls.length ? parseSpecBody(sfBrowse.specCalls[0].spec) : {};
    check(sfBrowse.pageCalls.length === 1
      && sfBrowse.specCalls.length === 1
      && sfBrowse.specCalls[0].spec.url === 'https://acme.snowflakecomputing.com/v1/queries'
      && sfBrowse.specCalls[0].spec.origin === 'https://app.snowflake.com'
      && sfBrowse.specCalls[0].spec.method === 'POST'
      && sfBrowse.specCalls[0].spec.headers['x-snowflake-context'] === 'snowflake-context-key'
      && sfBrowseBody.sqlText === 'SHOW DATABASES',
      'snowflake.browse_data posts a same-origin-pinned Snowflake query spec');
    check(sfBrowseOut && sfBrowseOut.success === true
      && sfBrowseOut.data.databases[0].name === 'ANALYTICS'
      && sfBrowseOut.data.databases[0].owner === 'ACCOUNTADMIN',
      'snowflake.browse_data maps SHOW DATABASES rows');

    const sfRun = makeSnowflakeCtx();
    const sfRunOut = await sf['snowflake.run_query'].handle({ query: 'SELECT 1', maxRows: 5 }, sfRun.ctx);
    check(sfRun.specCalls.length === 1
      && parseSpecBody(sfRun.specCalls[0].spec).sqlText === 'SELECT 1'
      && sfRunOut && sfRunOut.success === true
      && sfRunOut.data.columns[0].name === 'ONE'
      && sfRunOut.data.rows[0].ONE === '1',
      'snowflake.run_query allows read-only SELECT queries and maps named rows');

    const sfUnsafe = makeSnowflakeCtx();
    const sfUnsafeOut = await sf['snowflake.run_query'].handle({ query: 'DELETE FROM USERS' }, sfUnsafe.ctx);
    check(sfUnsafe.pageCalls.length === 0
      && sfUnsafe.specCalls.length === 0
      && sfUnsafeOut && sfUnsafeOut.success === false
      && sfUnsafeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sfUnsafeOut.reason === 'snowflake-read-only-sql-required',
      'snowflake.run_query rejects non-read SQL before any execution primitive call');

    const sfWorksheets = makeSnowflakeCtx();
    const sfWorksheetsOut = await sf['snowflake.list_worksheets'].handle({ limit: 10 }, sfWorksheets.ctx);
    check(sfWorksheets.pageCalls.length === 1
      && sfWorksheets.pageCalls[0].request.action === 'list_entities'
      && sfWorksheets.pageCalls[0].request.args.location === 'worksheets'
      && sfWorksheets.pageCalls[0].request.args.types[0] === 'query'
      && sfWorksheetsOut && sfWorksheetsOut.success === true
      && sfWorksheetsOut.data.worksheets[0].name === 'Revenue worksheet',
      'snowflake.list_worksheets uses bounded page-state entity reads');
  }

  // =========================================================================
  // Pinterest same-origin /resource read + guarded mutation head -- catalog/handlers/pinterest.js
  // =========================================================================
  const pinterestPath = path.join(HANDLERS_DIR, 'pinterest.js');
  check(fs.existsSync(pinterestPath), 'catalog/handlers/pinterest.js exists');
  if (fs.existsSync(pinterestPath)) {
    const pi = require(pinterestPath);
    const piSrc = readSource(pinterestPath);
    const pinterestReadSlugs = [
      'pinterest.get_board_pins',
      'pinterest.get_board_sections',
      'pinterest.get_current_user',
      'pinterest.get_home_feed',
      'pinterest.get_notification_counts',
      'pinterest.get_pin',
      'pinterest.get_related_pins',
      'pinterest.get_user_pins',
      'pinterest.get_user_profile',
      'pinterest.list_boards',
      'pinterest.list_followers',
      'pinterest.list_following',
      'pinterest.search_boards',
      'pinterest.search_pins'
    ];
    const pinterestGuardedSlugs = [
      'pinterest.create_board',
      'pinterest.create_board_section',
      'pinterest.create_pin',
      'pinterest.delete_board',
      'pinterest.delete_board_section',
      'pinterest.delete_pin',
      'pinterest.follow_user',
      'pinterest.save_pin',
      'pinterest.unfollow_user',
      'pinterest.update_board'
    ];

    check(pinterestReadSlugs.every(function(slug) {
      return pi[slug] && pi[slug].tier === 'T1a'
        && pi[slug].sideEffectClass === 'read'
        && pi[slug].origin === 'https://www.pinterest.com'
        && pi[slug].params
        && typeof pi[slug].handle === 'function';
    }), 'all 14 Pinterest resource read descriptors are tier:T1a READ entries pinned to www.pinterest.com');
    check(pinterestGuardedSlugs.every(function(slug) {
      return pi[slug] && pi[slug].tier === 'T1a'
        && (pi[slug].sideEffectClass === 'write' || pi[slug].sideEffectClass === 'destructive')
        && pi[slug].origin === 'https://www.pinterest.com'
        && pi[slug].params
        && typeof pi[slug].handle === 'function';
    }), 'all 10 Pinterest write/destructive descriptors are guarded T1a entries');

    check(!/chrome\.(scripting|tabs)/.test(piSrc),
      'pinterest.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(piSrc),
      'pinterest.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer/.test(piSrc),
      'pinterest.js does not read cookies/storage or replay bearer credentials directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|csrftoken)\b/i.test(piSrc),
      'pinterest.js does NOT console-log a secret-bearing variable');

    const piSearch = makeCtx('https://www.pinterest.com', 155);
    const piSearchOut = await pi['pinterest.search_pins'].handle({ query: 'design', page_size: 2, bookmark: 'cursor' }, piSearch.ctx);
    const piSearchUrl = piSearch.calls.length ? new URL(piSearch.calls[0].spec.url) : null;
    const piSearchData = piSearchUrl ? JSON.parse(piSearchUrl.searchParams.get('data') || '{}') : {};
    check(piSearch.calls.length === 1
      && piSearch.calls[0].spec.method === 'GET'
      && piSearch.calls[0].spec.url.indexOf('https://www.pinterest.com/resource/BaseSearchResource/get/') === 0
      && piSearch.calls[0].spec.origin === 'https://www.pinterest.com'
      && piSearch.calls[0].spec.authStrategy === 'same-origin-cookie',
      'pinterest.search_pins builds one first-party BaseSearchResource GET spec');
    check(piSearch.calls.length === 1
      && piSearch.calls[0].spec.csrfSource
      && piSearch.calls[0].spec.csrfSource.from === 'cookie'
      && piSearch.calls[0].spec.csrfSource.selector === 'csrftoken'
      && piSearch.calls[0].spec.csrfSource.header === 'X-CSRFToken'
      && piSearch.calls[0].spec.headers['X-Pinterest-Source-Url'] === '/search/pins/?q=design',
      'pinterest.search_pins uses csrftoken cookie csrfSource and Pinterest web headers');
    check(piSearchUrl
      && piSearchUrl.searchParams.get('source_url') === '/search/pins/?q=design'
      && piSearchData.options
      && piSearchData.options.query === 'design'
      && piSearchData.options.scope === 'pins'
      && piSearchData.options.page_size === 2
      && Array.isArray(piSearchData.options.bookmarks)
      && piSearchData.options.bookmarks[0] === 'cursor',
      'pinterest.search_pins encodes source_url, options, and bookmark in the resource query');
    check(piSearchOut && piSearchOut.success === true
      && piSearchOut.data.pins[0].id === 'pin-test'
      && piSearchOut.data.bookmark === 'next-bookmark',
      'pinterest.search_pins maps resource results and bookmark');

    const piCurrent = makeCtx('https://www.pinterest.com', 156);
    const piCurrentOut = await pi['pinterest.get_current_user'].handle({}, piCurrent.ctx);
    const piCurrentBody = new URLSearchParams(piCurrent.calls[0] && piCurrent.calls[0].spec
      ? String(piCurrent.calls[0].spec.body || '')
      : '');
    const piCurrentData = JSON.parse(piCurrentBody.get('data') || '{}');
    check(piCurrent.calls.length === 1
      && piCurrent.calls[0].spec.method === 'POST'
      && piCurrent.calls[0].spec.url === 'https://www.pinterest.com/resource/ApiSResource/create/'
      && piCurrent.calls[0].spec.headers['Content-Type'] === 'application/x-www-form-urlencoded'
      && piCurrent.calls[0].spec.origin === 'https://www.pinterest.com',
      'pinterest.get_current_user builds one same-origin ApiSResource POST spec');
    check(piCurrent.calls[0].spec.csrfSource
      && piCurrent.calls[0].spec.csrfSource.selector === 'csrftoken'
      && piCurrentData.options
      && piCurrentData.options.source === 'browser'
      && piCurrentData.options.keepAlive === false,
      'pinterest.get_current_user uses cookie CSRF and the source-proven ApiSResource payload');
    check(piCurrentOut && piCurrentOut.success === true
      && piCurrentOut.data.user.id === 'user-test'
      && piCurrentOut.data.user.email === 'fsb@example.invalid',
      'pinterest.get_current_user maps client_context.user');

    const piBoardPins = makeCtx('https://www.pinterest.com', 157);
    await pi['pinterest.get_board_pins'].handle({
      board_id: 'board-test',
      board_url: '/fsb_test/fixture-board/',
      page_size: 3
    }, piBoardPins.ctx);
    const piBoardUrl = piBoardPins.calls.length ? new URL(piBoardPins.calls[0].spec.url) : null;
    const piBoardData = piBoardUrl ? JSON.parse(piBoardUrl.searchParams.get('data') || '{}') : {};
    check(piBoardPins.calls.length === 1
      && piBoardPins.calls[0].spec.url.indexOf('https://www.pinterest.com/resource/BoardFeedResource/get/') === 0
      && piBoardUrl.searchParams.get('source_url') === '/fsb_test/fixture-board/'
      && piBoardData.options.board_id === 'board-test'
      && piBoardData.options.field_set_key === 'react_grid_pin',
      'pinterest.get_board_pins maps board source URL and resource options');

    const piBadShape = makeCtx('https://www.pinterest.com', 158, {
      pinterestData: { resource_response: { error: { http_status: 401, message: 'login required' }, data: {} } }
    });
    const piBadShapeOut = await pi['pinterest.search_pins'].handle({ query: 'design' }, piBadShape.ctx);
    check(piBadShapeOut && piBadShapeOut.success === false
      && piBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && piBadShapeOut.reason === 'pinterest-resource-error-envelope',
      'pinterest.search_pins rejects resource error envelopes');

    const piWrite = makeCtx('https://www.pinterest.com', 159);
    const piWriteOut = await pi['pinterest.save_pin'].handle({ pin_id: 'pin-test', board_id: 'board-test' }, piWrite.ctx);
    check(piWrite.calls.length === 0
      && piWriteOut && piWriteOut.success === false
      && piWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && piWriteOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && piWriteOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && piWriteOut.fellBackToDom === true,
      'pinterest.save_pin is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // Starbucks same-origin /apiproxy read + guarded mutation head -- catalog/handlers/starbucks.js
  // =========================================================================
  const starbucksPath = path.join(HANDLERS_DIR, 'starbucks.js');
  check(fs.existsSync(starbucksPath), 'catalog/handlers/starbucks.js exists');
  if (fs.existsSync(starbucksPath)) {
    const sbx = require(starbucksPath);
    const sbxSrc = readSource(starbucksPath);
    const starbucksReadSlugs = [
      'starbucks.find_stores',
      'starbucks.get_cards',
      'starbucks.get_cart',
      'starbucks.get_current_user',
      'starbucks.get_earn_rates',
      'starbucks.get_favorite_products',
      'starbucks.get_feed',
      'starbucks.get_payment_methods',
      'starbucks.get_previous_orders',
      'starbucks.get_product',
      'starbucks.get_rewards',
      'starbucks.get_store_menu',
      'starbucks.get_store_time_slots',
      'starbucks.navigate_to_checkout',
      'starbucks.price_order'
    ];
    const starbucksGuardedSlugs = [
      'starbucks.add_favorite_product',
      'starbucks.add_product_to_cart',
      'starbucks.delete_favorite_product',
      'starbucks.toggle_favorite_store',
      'starbucks.update_product_quantity'
    ];

    check(starbucksReadSlugs.every(function(slug) {
      return sbx[slug] && sbx[slug].tier === 'T1a'
        && sbx[slug].sideEffectClass === 'read'
        && sbx[slug].origin === 'https://www.starbucks.com'
        && typeof sbx[slug].handle === 'function';
    }), 'all 15 Starbucks read descriptors are tier:T1a READ entries pinned to www.starbucks.com');
    check(starbucksGuardedSlugs.every(function(slug) {
      return sbx[slug] && sbx[slug].tier === 'T1a'
        && (sbx[slug].sideEffectClass === 'write' || sbx[slug].sideEffectClass === 'destructive')
        && sbx[slug].origin === 'https://www.starbucks.com'
        && typeof sbx[slug].handle === 'function';
    }), 'all 5 Starbucks write/destructive descriptors are guarded T1a entries');
    check(!/chrome\.(scripting|tabs)/.test(sbxSrc),
      'starbucks.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|XMLHttpRequest/.test(sbxSrc),
      'starbucks.js performs no direct network call');
    check(!/(browser|chrome)\.(cookies|storage)|Authorization|Bearer/.test(sbxSrc),
      'starbucks.js does not read cookies/storage or replay bearer credentials directly');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(sbxSrc),
      'starbucks.js does NOT console-log a secret-bearing variable');

    const sbxStores = makeCtx('https://www.starbucks.com', 160);
    const sbxStoresOut = await sbx['starbucks.find_stores'].handle({ lat: 38.25, lng: -85.75, limit: 3 }, sbxStores.ctx);
    const sbxStoresUrl = sbxStores.calls.length ? new URL(sbxStores.calls[0].spec.url) : null;
    check(sbxStores.calls.length === 1
      && sbxStores.calls[0].spec.method === 'GET'
      && sbxStores.calls[0].spec.url.indexOf('https://www.starbucks.com/apiproxy/v1/locations') === 0
      && sbxStores.calls[0].spec.origin === 'https://www.starbucks.com'
      && sbxStores.calls[0].spec.authStrategy === 'same-origin-cookie'
      && sbxStoresUrl.searchParams.get('lat') === '38.25'
      && sbxStoresUrl.searchParams.get('lng') === '-85.75'
      && sbxStoresUrl.searchParams.get('limit') === '3',
      'starbucks.find_stores builds one first-party /locations GET spec');
    check(sbxStoresOut && sbxStoresOut.success === true
      && sbxStoresOut.data.stores[0].store_number === '53646-283069'
      && sbxStoresOut.data.stores[0].mobile_ordering_available === true,
      'starbucks.find_stores maps store rows');

    const sbxUser = makeCtx('https://www.starbucks.com', 161, { url: 'https://www.starbucks.com/account/for-you' });
    const sbxUserOut = await sbx['starbucks.get_current_user'].handle({}, sbxUser.ctx);
    check(sbxUser.calls.length === 1
      && sbxUser.calls[0].spec.url === 'https://www.starbucks.com/account/for-you'
      && sbxUser.calls[0].spec.origin === 'https://www.starbucks.com',
      'starbucks.get_current_user reads the active Starbucks page as a same-origin bootstrap probe');
    check(sbxUserOut && sbxUserOut.success === true
      && sbxUserOut.data.user.email === 'starbucks@example.invalid'
      && sbxUserOut.data.user.star_balance === 125,
      'starbucks.get_current_user maps account profile bootstrap state');

    const sbxPrice = makeCtx('https://www.starbucks.com', 162);
    const sbxPriceOut = await sbx['starbucks.price_order'].handle({
      store_number: '53646-283069',
      items: [{ sku: 'sku-test', quantity: 1, child_skus: ['milk-test'] }]
    }, sbxPrice.ctx);
    const sbxPriceBody = parseSpecBody(sbxPrice.calls[0] && sbxPrice.calls[0].spec);
    check(sbxPrice.calls.length === 1
      && sbxPrice.calls[0].spec.method === 'POST'
      && sbxPrice.calls[0].spec.url === 'https://www.starbucks.com/apiproxy/v1/orchestra/price-order'
      && sbxPrice.calls[0].spec.headers['Content-Type'] === 'application/json'
      && sbxPrice.calls[0].spec.origin === 'https://www.starbucks.com'
      && sbxPriceBody.operationId === 'price-order'
      && sbxPriceBody.variables.order.storeNumber === '53646-283069',
      'starbucks.price_order builds one first-party orchestra pricing POST spec');
    check(sbxPriceOut && sbxPriceOut.success === true
      && sbxPriceOut.data.total === '$6.25'
      && sbxPriceOut.data.order_id === 'price-order-test',
      'starbucks.price_order maps pricing summary');

    const sbxBadShape = makeCtx('https://www.starbucks.com', 163, { starbucksData: { error: 'logged out' } });
    const sbxBadShapeOut = await sbx['starbucks.get_store_menu'].handle({ store_number: '53646-283069' }, sbxBadShape.ctx);
    check(sbxBadShapeOut && sbxBadShapeOut.success === false
      && sbxBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sbxBadShapeOut.reason === 'starbucks-menu-shape-mismatch',
      'starbucks.get_store_menu rejects unexpected menu envelopes');

    const sbxWrite = makeCtx('https://www.starbucks.com', 164);
    const sbxWriteOut = await sbx['starbucks.add_product_to_cart'].handle({
      product_number: 34833,
      form: 'iced',
      store_number: '53646-283069'
    }, sbxWrite.ctx);
    check(sbxWrite.calls.length === 0
      && sbxWriteOut && sbxWriteOut.success === false
      && sbxWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sbxWriteOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && sbxWriteOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && sbxWriteOut.fellBackToDom === true,
      'starbucks.add_product_to_cart is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // Domino's same-origin GraphQL read head -- catalog/handlers/dominos.js
  // =========================================================================
  const dominosPath = path.join(HANDLERS_DIR, 'dominos.js');
  check(fs.existsSync(dominosPath), 'catalog/handlers/dominos.js exists');
  if (fs.existsSync(dominosPath)) {
    const dpz = require(dominosPath);
    const dpzSrc = readSource(dominosPath);
    const dominosReadSlugs = [
      'dominos.search_address',
      'dominos.find_stores_by_address',
      'dominos.get_menu_categories',
      'dominos.get_category_products',
      'dominos.get_product',
      'dominos.get_deal'
    ];

    check(dominosReadSlugs.every(function(slug) {
      return dpz[slug] && dpz[slug].tier === 'T1a'
        && dpz[slug].sideEffectClass === 'read'
        && dpz[slug].origin === 'https://www.dominos.com'
        && dpz[slug].params
        && typeof dpz[slug].handle === 'function';
    }), "Domino's explicit-input GraphQL read descriptors are T1a reads pinned to www.dominos.com");
    check(!dpz['dominos.create_cart'] && !dpz['dominos.add_product_to_cart']
      && !dpz['dominos.add_deal_to_cart'] && !dpz['dominos.update_product_quantity']
      && !dpz['dominos.remove_deal_from_cart'] && !dpz['dominos.navigate_to_checkout']
      && !dpz['dominos.place_order_cash'] && !dpz['dominos.get_saved_cards']
      && !dpz['dominos.get_saved_addresses'] && !dpz['dominos.get_customer']
      && !dpz['dominos.get_cart'] && !dpz['dominos.get_checkout_summary']
      && !dpz['dominos.get_loyalty_points'] && !dpz['dominos.get_loyalty_rewards'],
      "Domino's mutations, order placement, navigation, active-cart, payment-card, and account rows stay in the discovery tail");

    check(!/chrome\.(scripting|tabs)/.test(dpzSrc),
      'dominos.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(dpzSrc),
      'dominos.js performs no direct network call');
    check(!/document\.cookie|getCookie|localStorage|sessionStorage|Authorization|Bearer|window\.location|location\.href/.test(dpzSrc),
      'dominos.js does not read cookies/storage, inject bearer credentials, or navigate the page');
    check(!/mutation\s+(?:AddDealToCart|QuickAddProductMenu|CreateCart|RemoveDeal|UpdateProductQuantity)/.test(dpzSrc),
      'dominos.js does not include cart mutation or order-placement GraphQL operations');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(dpzSrc),
      'dominos.js does NOT console-log a secret-bearing variable');

    const dpzAddress = makeCtx('https://www.dominos.com', 160);
    const dpzAddressOut = await dpz['dominos.search_address'].handle({
      address: '123 Main St',
      service_method: 'CARRYOUT'
    }, dpzAddress.ctx);
    const dpzAddressBody = dpzAddress.calls.length ? parseSpecBody(dpzAddress.calls[0].spec) : {};
    check(dpzAddress.calls.length === 1
      && dpzAddress.calls[0].spec.method === 'POST'
      && dpzAddress.calls[0].spec.url === 'https://www.dominos.com/api/web-bff/graphql'
      && dpzAddress.calls[0].spec.origin === 'https://www.dominos.com'
      && dpzAddress.calls[0].spec.authStrategy === 'same-origin-cookie'
      && dpzAddress.calls[0].spec.headers['x-dpz-api'] === 'PlaceIdByAddress'
      && dpzAddressBody.operationName === 'PlaceIdByAddress'
      && dpzAddressBody.variables.address === '123 Main St'
      && dpzAddressBody.variables.serviceMethod === 'CARRYOUT',
      "dominos.search_address builds one first-party GraphQL PlaceIdByAddress POST spec");
    check(dpzAddressOut && dpzAddressOut.success === true
      && dpzAddressOut.data.suggestions.length === 1
      && dpzAddressOut.data.suggestions[0].place_id === 'place-test'
      && dpzAddressOut.data.suggestions[0].main_text === '123 Main St',
      'dominos.search_address maps address suggestions');

    const dpzStores = makeCtx('https://www.dominos.com', 161);
    const dpzStoresOut = await dpz['dominos.find_stores_by_address'].handle({
      place_id: 'place-test',
      service_method: 'DELIVERY'
    }, dpzStores.ctx);
    const dpzStoresBody = dpzStores.calls.length ? parseSpecBody(dpzStores.calls[0].spec) : {};
    check(dpzStores.calls.length === 1
      && dpzStoresBody.operationName === 'StoresByPlaceId'
      && dpzStoresBody.variables.placeId === 'place-test'
      && dpzStoresBody.variables.serviceMethod === 'DELIVERY',
      'dominos.find_stores_by_address posts StoresByPlaceId with explicit place/service inputs');
    check(dpzStoresOut && dpzStoresOut.success === true
      && dpzStoresOut.data.stores[0].id === '8290'
      && dpzStoresOut.data.stores[0].allows_delivery === true
      && dpzStoresOut.data.customer_location.city === 'Louisville',
      'dominos.find_stores_by_address maps stores and customer location');

    const dpzMenu = makeCtx('https://www.dominos.com', 162);
    const dpzMenuOut = await dpz['dominos.get_menu_categories'].handle({ store_id: '8290' }, dpzMenu.ctx);
    check(dpzMenu.calls.length === 1
      && parseSpecBody(dpzMenu.calls[0].spec).operationName === 'CategoryV2',
      'dominos.get_menu_categories posts CategoryV2');
    check(dpzMenuOut && dpzMenuOut.success === true
      && dpzMenuOut.data.categories[0].id === 'Specialty',
      'dominos.get_menu_categories maps category rows');

    const dpzProducts = makeCtx('https://www.dominos.com', 163);
    const dpzProductsOut = await dpz['dominos.get_category_products'].handle({
      category_id: 'Specialty',
      store_id: '8290'
    }, dpzProducts.ctx);
    check(dpzProducts.calls.length === 1
      && parseSpecBody(dpzProducts.calls[0].spec).operationName === 'Products',
      'dominos.get_category_products posts Products');
    check(dpzProductsOut && dpzProductsOut.success === true
      && dpzProductsOut.data.category_name === 'Specialty Pizzas'
      && dpzProductsOut.data.products[0].code === 'S_PIZSC',
      'dominos.get_category_products maps product rows');

    const dpzProduct = makeCtx('https://www.dominos.com', 164);
    const dpzProductOut = await dpz['dominos.get_product'].handle({
      product_code: 'S_PIZSC',
      store_id: '8290'
    }, dpzProduct.ctx);
    check(dpzProduct.calls.length === 1
      && parseSpecBody(dpzProduct.calls[0].spec).operationName === 'Product',
      'dominos.get_product posts Product');
    check(dpzProductOut && dpzProductOut.success === true
      && dpzProductOut.data.name === 'Pacific Veggie'
      && dpzProductOut.data.max_quantity === 10,
      'dominos.get_product maps product builder detail');

    const dpzDeal = makeCtx('https://www.dominos.com', 165);
    const dpzDealOut = await dpz['dominos.get_deal'].handle({
      deal_code: 'DEAL',
      store_id: '8290',
      cart_id: 'cart-test'
    }, dpzDeal.ctx);
    check(dpzDeal.calls.length === 1
      && parseSpecBody(dpzDeal.calls[0].spec).operationName === 'Deal',
      'dominos.get_deal posts Deal');
    check(dpzDealOut && dpzDealOut.success === true
      && dpzDealOut.data.deal.code === 'DEAL'
      && dpzDealOut.data.deal.name === 'Mix & Match',
      'dominos.get_deal maps deal detail');

    const dpzBadShape = makeCtx('https://www.dominos.com', 166, { dominosData: { data: { category: { name: 'Missing products' } } } });
    const dpzBadShapeOut = await dpz['dominos.get_category_products'].handle({ category_id: 'Specialty' }, dpzBadShape.ctx);
    check(dpzBadShapeOut && dpzBadShapeOut.success === false
      && dpzBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dpzBadShapeOut.reason === 'dominos-graphql-shape-mismatch',
      'dominos.get_category_products rejects unexpected GraphQL shapes');

    const dpzErrors = makeCtx('https://www.dominos.com', 167, { dominosData: { errors: [{ message: 'login required' }] } });
    const dpzErrorsOut = await dpz['dominos.search_address'].handle({
      address: '123 Main St',
      service_method: 'CARRYOUT'
    }, dpzErrors.ctx);
    check(dpzErrorsOut && dpzErrorsOut.success === false
      && dpzErrorsOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dpzErrorsOut.reason === 'dominos-graphql-errors',
      "dominos.search_address fails closed on Domino's GraphQL error envelopes");
  }

  // =========================================================================
  // Chipotle public services read head -- catalog/handlers/chipotle.js
  // =========================================================================
  const chipotlePath = path.join(HANDLERS_DIR, 'chipotle.js');
  check(fs.existsSync(chipotlePath), 'catalog/handlers/chipotle.js exists');
  if (fs.existsSync(chipotlePath)) {
    const cmg = require(chipotlePath);
    const cmgSrc = readSource(chipotlePath);
    const chipotleReadSlugs = [
      'chipotle.get_ordering_status',
      'chipotle.get_restaurant',
      'chipotle.get_menu',
      'chipotle.get_preconfigured_meals'
    ];
    const chipotleExcludedSlugs = [
      'chipotle.get_current_user',
      'chipotle.get_extras_campaigns',
      'chipotle.get_favorites',
      'chipotle.get_last_restaurant',
      'chipotle.get_loyalty_points',
      'chipotle.get_menu_groups',
      'chipotle.get_payment_methods',
      'chipotle.get_promotions',
      'chipotle.get_recent_orders',
      'chipotle.get_reward_categories',
      'chipotle.get_rewards',
      'chipotle.find_restaurants'
    ];

    check(chipotleReadSlugs.every(function(slug) {
      return cmg[slug] && cmg[slug].tier === 'T1a'
        && cmg[slug].sideEffectClass === 'read'
        && cmg[slug].origin === 'https://www.chipotle.com'
        && cmg[slug].params
        && typeof cmg[slug].handle === 'function';
    }), 'Chipotle public restaurant/menu/status descriptors are T1a reads pinned to www.chipotle.com');
    check(chipotleExcludedSlugs.every(function(slug) {
      return !cmg[slug] && cmgSrc.indexOf("'" + slug + "'") === -1 && cmgSrc.indexOf('"' + slug + '"') === -1;
    }), 'Chipotle customer, payment, rewards, order-history, local page-state, and POST search rows stay in the discovery tail');

    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(cmgSrc),
      'chipotle.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(cmgSrc),
      'chipotle.js performs no direct network call');
    check(!/localStorage|sessionStorage|getLocalStorage|cmg-vuex|document\.cookie|csrfSource|Authorization|Bearer/.test(cmgSrc),
      'chipotle.js does not read page storage, cookies, or inject private credentials');

    const cmgStatus = makeCtx('https://www.chipotle.com', 168);
    const cmgStatusOut = await cmg['chipotle.get_ordering_status'].handle({ country: 'CA' }, cmgStatus.ctx);
    check(cmgStatus.calls.length === 1
      && cmgStatus.calls[0].spec.method === 'GET'
      && cmgStatus.calls[0].spec.url === 'https://services.chipotle.com/onlineorderingstatus?country=CA'
      && cmgStatus.calls[0].spec.origin === 'https://www.chipotle.com'
      && cmgStatus.calls[0].spec.authStrategy === 'none'
      && cmgStatus.calls[0].spec.credentials === 'omit'
      && cmgStatus.calls[0].spec.headers['Ocp-Apim-Subscription-Key'],
      'chipotle.get_ordering_status builds one credential-free public services GET spec');
    check(cmgStatusOut && cmgStatusOut.success === true
      && cmgStatusOut.data.online_ordering === true
      && cmgStatusOut.data.delivery === true
      && cmgStatusOut.data.group_order === false
      && cmgStatusOut.data.catering === true,
      'chipotle.get_ordering_status maps availability flags');

    const cmgRestaurant = makeCtx('https://www.chipotle.com', 169);
    const cmgRestaurantOut = await cmg['chipotle.get_restaurant'].handle({ restaurant_id: 1234 }, cmgRestaurant.ctx);
    check(cmgRestaurant.calls.length === 1
      && cmgRestaurant.calls[0].spec.url === 'https://services.chipotle.com/restaurant/v3/restaurant/1234?embed=addresses%2CrealHours%2ConlineOrdering%2Cchipotlane%2Csustainability'
      && cmgRestaurant.calls[0].spec.authStrategy === 'none'
      && cmgRestaurant.calls[0].spec.credentials === 'omit',
      'chipotle.get_restaurant targets the public restaurant details endpoint');
    check(cmgRestaurantOut && cmgRestaurantOut.success === true
      && cmgRestaurantOut.data.restaurant.id === 1234
      && cmgRestaurantOut.data.restaurant.name === 'Chipotle Louisville'
      && cmgRestaurantOut.data.restaurant.addresses[0].city === 'Louisville'
      && cmgRestaurantOut.data.hours[0].day_of_week === 'Monday',
      'chipotle.get_restaurant maps restaurant details and hours');

    const cmgMenu = makeCtx('https://www.chipotle.com', 170);
    const cmgMenuOut = await cmg['chipotle.get_menu'].handle({ restaurant_id: 1234 }, cmgMenu.ctx);
    check(cmgMenu.calls.length === 1
      && cmgMenu.calls[0].spec.url === 'https://services.chipotle.com/menuinnovation/v1/restaurants/1234/onlinemenu?channelId=web&includeUnavailableItems=true'
      && cmgMenu.calls[0].spec.authStrategy === 'none'
      && cmgMenu.calls[0].spec.credentials === 'omit',
      'chipotle.get_menu targets the public online menu endpoint');
    check(cmgMenuOut && cmgMenuOut.success === true
      && cmgMenuOut.data.restaurant_id === 1234
      && cmgMenuOut.data.items[0].id === 'CMG-1'
      && cmgMenuOut.data.items[0].calories === '430-750',
      'chipotle.get_menu maps entree rows');

    const cmgMeals = makeCtx('https://www.chipotle.com', 171);
    const cmgMealsOut = await cmg['chipotle.get_preconfigured_meals'].handle({ restaurant_id: 1234 }, cmgMeals.ctx);
    check(cmgMeals.calls.length === 1
      && cmgMeals.calls[0].spec.url === 'https://services.chipotle.com/menuinnovation/v1/restaurants/1234/onlinemeals?includeUnavailableItems=true',
      'chipotle.get_preconfigured_meals targets the public online meals endpoint');
    check(cmgMealsOut && cmgMealsOut.success === true
      && cmgMealsOut.data.meals[0].id === 'meal-1'
      && cmgMealsOut.data.meals[0].type === 'BuildYourOwn',
      'chipotle.get_preconfigured_meals maps meal options');

    const cmgBadShape = makeCtx('https://www.chipotle.com', 172, { chipotleData: { restaurantId: 1234 } });
    const cmgBadShapeOut = await cmg['chipotle.get_menu'].handle({ restaurant_id: 1234 }, cmgBadShape.ctx);
    check(cmgBadShapeOut && cmgBadShapeOut.success === false
      && cmgBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cmgBadShapeOut.reason === 'chipotle-services-shape-mismatch',
      'chipotle.get_menu rejects unexpected public services shapes');
  }

  // =========================================================================
  // Panda Express public same-origin Olo read head -- catalog/handlers/pandaexpress.js
  // =========================================================================
  const pandaPath = path.join(HANDLERS_DIR, 'pandaexpress.js');
  check(fs.existsSync(pandaPath), 'catalog/handlers/pandaexpress.js exists');
  if (fs.existsSync(pandaPath)) {
    const pex = require(pandaPath);
    const pexSrc = readSource(pandaPath);
    const pandaReadSlugs = [
      'pandaexpress.find_restaurants',
      'pandaexpress.get_restaurant',
      'pandaexpress.get_restaurant_menu',
      'pandaexpress.get_product_modifiers'
    ];
    const pandaExcludedSlugs = [
      'pandaexpress.add_product_to_basket',
      'pandaexpress.apply_coupon',
      'pandaexpress.cancel_order',
      'pandaexpress.create_basket',
      'pandaexpress.get_basket',
      'pandaexpress.get_billing_accounts',
      'pandaexpress.get_checkout_summary',
      'pandaexpress.get_favorites',
      'pandaexpress.get_loyalty_rewards',
      'pandaexpress.get_recent_orders',
      'pandaexpress.get_user_profile',
      'pandaexpress.navigate_to_checkout',
      'pandaexpress.remove_coupon',
      'pandaexpress.update_product_quantity'
    ];

    check(pandaReadSlugs.every(function(slug) {
      return pex[slug] && pex[slug].tier === 'T1a'
        && pex[slug].sideEffectClass === 'read'
        && pex[slug].origin === 'https://www.pandaexpress.com'
        && pex[slug].params
        && typeof pex[slug].handle === 'function';
    }), 'Panda Express public restaurant/menu/modifier descriptors are T1a reads pinned to www.pandaexpress.com');
    check(pandaExcludedSlugs.every(function(slug) {
      return !pex[slug] && pexSrc.indexOf("'" + slug + "'") === -1 && pexSrc.indexOf('"' + slug + '"') === -1;
    }), 'Panda Express basket, checkout, coupon, profile, billing, loyalty, recent-order, navigation, and mutation rows stay in the discovery tail');

    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(pexSrc),
      'pandaexpress.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(pexSrc),
      'pandaexpress.js performs no direct network call');
    check(!/localStorage|sessionStorage|getLocalStorage|persist:root|document\.cookie|csrfSource|Authorization|Bearer|window\.location|location\.href/.test(pexSrc),
      'pandaexpress.js does not read page storage, cookies, navigation state, or inject private credentials');

    const pxRestaurants = makeCtx('https://www.pandaexpress.com', 173);
    const pxRestaurantsOut = await pex['pandaexpress.find_restaurants'].handle({
      latitude: 38.25,
      longitude: -85.75,
      radius: 5,
      limit: 2
    }, pxRestaurants.ctx);
    const pxRestaurantsUrl = pxRestaurants.calls.length ? new URL(pxRestaurants.calls[0].spec.url) : null;
    check(pxRestaurants.calls.length === 1
      && pxRestaurants.calls[0].spec.method === 'GET'
      && pxRestaurants.calls[0].spec.url.indexOf('https://www.pandaexpress.com/restaurants/near') === 0
      && pxRestaurants.calls[0].spec.origin === 'https://www.pandaexpress.com'
      && pxRestaurants.calls[0].spec.authStrategy === 'none'
      && pxRestaurants.calls[0].spec.credentials === 'omit'
      && pxRestaurantsUrl.searchParams.get('lat') === '38.25'
      && pxRestaurantsUrl.searchParams.get('long') === '-85.75'
      && pxRestaurantsUrl.searchParams.get('radius') === '5'
      && pxRestaurantsUrl.searchParams.get('limit') === '2',
      'pandaexpress.find_restaurants builds one credential-free same-origin Olo restaurant search spec');
    check(pxRestaurantsOut && pxRestaurantsOut.success === true
      && pxRestaurantsOut.data.restaurants[0].id === 4226
      && pxRestaurantsOut.data.restaurants[0].name === 'Panda Express Louisville'
      && pxRestaurantsOut.data.restaurants[0].can_pickup === true,
      'pandaexpress.find_restaurants maps restaurant rows');

    const pxRestaurant = makeCtx('https://www.pandaexpress.com', 174);
    const pxRestaurantOut = await pex['pandaexpress.get_restaurant'].handle({
      slug: 'louisville-hurstbourne-px'
    }, pxRestaurant.ctx);
    check(pxRestaurant.calls.length === 1
      && pxRestaurant.calls[0].spec.url === 'https://www.pandaexpress.com/restaurants/byslug/louisville-hurstbourne-px'
      && pxRestaurant.calls[0].spec.authStrategy === 'none'
      && pxRestaurant.calls[0].spec.credentials === 'omit',
      'pandaexpress.get_restaurant targets the public byslug endpoint');
    check(pxRestaurantOut && pxRestaurantOut.success === true
      && pxRestaurantOut.data.restaurant.ext_ref === '4226'
      && pxRestaurantOut.data.restaurant.city === 'Louisville',
      'pandaexpress.get_restaurant maps restaurant details');

    const pxMenu = makeCtx('https://www.pandaexpress.com', 175);
    const pxMenuOut = await pex['pandaexpress.get_restaurant_menu'].handle({
      restaurant_id: 4226
    }, pxMenu.ctx);
    check(pxMenu.calls.length === 1
      && pxMenu.calls[0].spec.url === 'https://www.pandaexpress.com/restaurants/4226/menu'
      && pxMenu.calls[0].spec.authStrategy === 'none'
      && pxMenu.calls[0].spec.credentials === 'omit',
      'pandaexpress.get_restaurant_menu targets the public menu endpoint');
    check(pxMenuOut && pxMenuOut.success === true
      && pxMenuOut.data.categories[0].name === 'Bigger Plates'
      && pxMenuOut.data.products[0].id === 901
      && pxMenuOut.data.products[0].image_url === 'https://www.pandaexpress.com/images/menu/orange-chicken.jpg',
      'pandaexpress.get_restaurant_menu maps categories and products');

    const pxModifiers = makeCtx('https://www.pandaexpress.com', 176);
    const pxModifiersOut = await pex['pandaexpress.get_product_modifiers'].handle({
      product_id: 901
    }, pxModifiers.ctx);
    check(pxModifiers.calls.length === 1
      && pxModifiers.calls[0].spec.url === 'https://www.pandaexpress.com/products/901/modifiers',
      'pandaexpress.get_product_modifiers targets the public modifiers endpoint');
    check(pxModifiersOut && pxModifiersOut.success === true
      && pxModifiersOut.data.groups[0].id === 51
      && pxModifiersOut.data.groups[0].options[0].name === 'Chow Mein',
      'pandaexpress.get_product_modifiers maps modifier groups and options');

    const pxMissing = makeCtx('https://www.pandaexpress.com', 177);
    const pxMissingOut = await pex['pandaexpress.get_restaurant'].handle({}, pxMissing.ctx);
    check(pxMissing.calls.length === 0
      && pxMissingOut && pxMissingOut.success === false
      && pxMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && pxMissingOut.reason === 'pandaexpress-required-input-missing',
      'pandaexpress.get_restaurant fails closed without slug or ext_ref and does not execute');

    const pxBadShape = makeCtx('https://www.pandaexpress.com', 178, { pandaexpressData: { categories: null } });
    const pxBadShapeOut = await pex['pandaexpress.get_restaurant_menu'].handle({ restaurant_id: 4226 }, pxBadShape.ctx);
    check(pxBadShapeOut && pxBadShapeOut.success === false
      && pxBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && pxBadShapeOut.reason === 'pandaexpress-public-olo-shape-mismatch',
      'pandaexpress.get_restaurant_menu rejects unexpected public Olo shapes');
  }

  // =========================================================================
  // Grubhub same-origin read + guarded paid-order head -- catalog/handlers/grubhub.js
  // =========================================================================
  const grubhubPath = path.join(HANDLERS_DIR, 'grubhub.js');
  const grubhubExtPath = path.join(EXT_HANDLERS_DIR, 'grubhub.js');
  check(fs.existsSync(grubhubPath), 'catalog/handlers/grubhub.js exists');
  if (fs.existsSync(grubhubPath)) {
    const gh = require(grubhubPath);
    const ghSrc = readSource(grubhubPath);
    const grubhubReadSlugs = [
      'grubhub.list_restaurants',
      'grubhub.get_restaurant',
      'grubhub.list_orders'
    ];
    const grubhubGuardedSlugs = [
      'grubhub.place_order',
      'grubhub.cancel_order'
    ];

    check(grubhubReadSlugs.every(function(slug) {
      return gh[slug] && gh[slug].tier === 'T1a'
        && gh[slug].sideEffectClass === 'read'
        && gh[slug].origin === 'https://www.grubhub.com'
        && gh[slug].params
        && typeof gh[slug].handle === 'function';
    }), 'Grubhub restaurant/order reads are T1a reads pinned to www.grubhub.com');
    check(grubhubGuardedSlugs.every(function(slug) {
      return gh[slug] && gh[slug].tier === 'T1a'
        && (gh[slug].sideEffectClass === 'write' || gh[slug].sideEffectClass === 'destructive')
        && gh[slug].origin === 'https://www.grubhub.com'
        && gh[slug].params
        && typeof gh[slug].handle === 'function';
    }), 'Grubhub paid-order and cancellation rows are registered as guarded handlers');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(ghSrc),
      'grubhub.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(ghSrc),
      'grubhub.js performs no direct network call');
    check(!/localStorage|sessionStorage|getLocalStorage|document\.cookie|csrfSource|Authorization|Bearer|window\.location|location\.href/.test(ghSrc),
      'grubhub.js does not read page storage, cookies, navigation state, or inject private credentials');
    check(fs.existsSync(grubhubExtPath) ? readSource(grubhubExtPath) === ghSrc : true,
      'extension/catalog/handlers/grubhub.js matches catalog/handlers/grubhub.js when present');

    const ghRestaurants = makeCtx('https://www.grubhub.com', 179);
    const ghRestaurantsOut = await gh['grubhub.list_restaurants'].handle({
      address: '123 Market St',
      query: 'pizza',
      limit: 3
    }, ghRestaurants.ctx);
    const ghRestaurantsUrl = ghRestaurants.calls.length ? new URL(ghRestaurants.calls[0].spec.url) : null;
    check(ghRestaurants.calls.length === 1
      && ghRestaurants.calls[0].spec.method === 'GET'
      && ghRestaurants.calls[0].spec.url.indexOf('https://www.grubhub.com/v1/restaurants') === 0
      && ghRestaurants.calls[0].spec.origin === 'https://www.grubhub.com'
      && ghRestaurants.calls[0].spec.authStrategy === 'same-origin-cookie'
      && ghRestaurantsUrl.searchParams.get('address') === '123 Market St'
      && ghRestaurantsUrl.searchParams.get('query') === 'pizza'
      && ghRestaurantsUrl.searchParams.get('limit') === '3',
      'grubhub.list_restaurants builds one same-origin restaurant GET spec');
    check(ghRestaurantsOut && ghRestaurantsOut.success === true
      && ghRestaurantsOut.data.restaurants[0].id === 'rest-test'
      && ghRestaurantsOut.data.restaurants[0].name === 'Grubhub Fixture Kitchen'
      && ghRestaurantsOut.data.restaurants[0].is_open === true,
      'grubhub.list_restaurants maps restaurant rows');

    const ghRestaurant = makeCtx('https://www.grubhub.com', 180);
    const ghRestaurantOut = await gh['grubhub.get_restaurant'].handle({ restaurant_id: 'rest-test' }, ghRestaurant.ctx);
    check(ghRestaurant.calls.length === 1
      && ghRestaurant.calls[0].spec.url === 'https://www.grubhub.com/v1/restaurants/rest-test'
      && ghRestaurant.calls[0].spec.authStrategy === 'same-origin-cookie',
      'grubhub.get_restaurant targets the requested restaurant');
    check(ghRestaurantOut && ghRestaurantOut.success === true
      && ghRestaurantOut.data.restaurant.menu[0].id === 'item-test'
      && ghRestaurantOut.data.restaurant.menu[0].price === 12.5,
      'grubhub.get_restaurant maps restaurant menu detail');

    const ghOrders = makeCtx('https://www.grubhub.com', 181);
    const ghOrdersOut = await gh['grubhub.list_orders'].handle({ status: 'active', limit: 5 }, ghOrders.ctx);
    const ghOrdersUrl = ghOrders.calls.length ? new URL(ghOrders.calls[0].spec.url) : null;
    check(ghOrders.calls.length === 1
      && ghOrders.calls[0].spec.url.indexOf('https://www.grubhub.com/v1/orders') === 0
      && ghOrdersUrl.searchParams.get('status') === 'active'
      && ghOrdersUrl.searchParams.get('limit') === '5',
      'grubhub.list_orders targets the orders endpoint with filters');
    check(ghOrdersOut && ghOrdersOut.success === true
      && ghOrdersOut.data.orders[0].id === 'order-test'
      && ghOrdersOut.data.orders[0].total === 24.75,
      'grubhub.list_orders maps order rows');

    const ghBadShape = makeCtx('https://www.grubhub.com', 182, { grubhubData: { restaurants: null } });
    const ghBadShapeOut = await gh['grubhub.list_restaurants'].handle({}, ghBadShape.ctx);
    check(ghBadShapeOut && ghBadShapeOut.success === false
      && ghBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghBadShapeOut.reason === 'grubhub-shape-mismatch',
      'grubhub.list_restaurants rejects unexpected response shapes');

    const ghGuardedPlace = makeCtx('https://www.grubhub.com', 183);
    const ghGuardedPlaceOut = await gh['grubhub.place_order'].handle({
      restaurant_id: 'rest-test',
      items: [{ item_id: 'item-test', quantity: 1 }],
      delivery_address: '123 Market St'
    }, ghGuardedPlace.ctx);
    check(ghGuardedPlace.calls.length === 0
      && ghGuardedPlaceOut && ghGuardedPlaceOut.success === false
      && ghGuardedPlaceOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghGuardedPlaceOut.reason === 'unverified-grubhub-paid-order-mutation',
      'grubhub.place_order is guarded fail-closed and does not execute');

    const ghGuardedCancel = makeCtx('https://www.grubhub.com', 184);
    const ghGuardedCancelOut = await gh['grubhub.cancel_order'].handle({ order_id: 'order-test' }, ghGuardedCancel.ctx);
    check(ghGuardedCancel.calls.length === 0
      && ghGuardedCancelOut && ghGuardedCancelOut.success === false
      && ghGuardedCancelOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghGuardedCancelOut.reason === 'unverified-grubhub-cancel-order-mutation',
      'grubhub.cancel_order is guarded fail-closed and does not execute');
  }

  // =========================================================================
  // Lucid first-party authenticated read + guarded mutation head -- catalog/handlers/lucid.js
  // =========================================================================
  const lucidPath = path.join(HANDLERS_DIR, 'lucid.js');
  check(fs.existsSync(lucidPath), 'catalog/handlers/lucid.js exists');
  if (fs.existsSync(lucidPath)) {
    const lucid = require(lucidPath);
    const lucidSrc = readSource(lucidPath);
    const lucidReadSlugs = [
      'lucid.get_account',
      'lucid.get_current_user',
      'lucid.get_document',
      'lucid.get_document_count',
      'lucid.get_document_pages',
      'lucid.get_document_role',
      'lucid.get_document_status',
      'lucid.get_folder_entry',
      'lucid.get_user_permissions',
      'lucid.list_account_users',
      'lucid.list_documents',
      'lucid.list_folder_entries',
      'lucid.list_groups',
      'lucid.search_documents'
    ];
    const lucidGuardedSlugs = [
      'lucid.create_document',
      'lucid.create_folder',
      'lucid.delete_folder',
      'lucid.move_document_to_folder',
      'lucid.rename_folder',
      'lucid.trash_document'
    ];

    check(lucidReadSlugs.every(function(slug) {
      return lucid[slug] && lucid[slug].tier === 'T1a'
        && lucid[slug].sideEffectClass === 'read'
        && lucid[slug].origin === 'https://lucid.app'
        && lucid[slug].params
        && typeof lucid[slug].handle === 'function';
    }), 'Lucid read descriptors are T1a reads pinned to lucid.app');
    check(lucidGuardedSlugs.every(function(slug) {
      return lucid[slug] && lucid[slug].tier === 'T1a'
        && lucid[slug].origin === 'https://lucid.app'
        && lucid[slug].sideEffectClass !== 'read'
        && lucid[slug].params
        && typeof lucid[slug].handle === 'function';
    }), 'Lucid mutation descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(lucidSrc),
      'lucid.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(lucidSrc),
      'lucid.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource/i.test(lucidSrc),
      'lucid.js does not directly read cookies/storage or replay credential headers');
    const lucidGuardBody = (lucidSrc.match(/function guarded[\s\S]*?function productOrChart/) || [''])[0];
    check(lucidGuardBody && lucidGuardBody.indexOf('executeBoundSpec') === -1,
      'Lucid guarded mutations do not call executeBoundSpec');

    const lucidList = makeCtx('https://lucid.app', 180);
    const lucidListOut = await lucid['lucid.list_documents'].handle({
      product: 'chart',
      search: 'roadmap'
    }, lucidList.ctx);
    check(lucidList.calls.length === 2
      && lucidList.calls[0].spec.method === 'GET'
      && lucidList.calls[0].spec.url === 'https://lucid.app/documents'
      && lucidList.calls[0].spec.origin === 'https://lucid.app'
      && lucidList.calls[0].spec.authStrategy === 'same-origin-cookie'
      && lucidList.calls[1].spec.url === 'https://documents.lucid.app/users/lucid-user/documents/chart?search=roadmap'
      && lucidList.calls[1].spec.origin === 'https://lucid.app'
      && lucidList.calls[1].spec.authStrategy === 'same-origin-cookie',
      'lucid.list_documents bootstraps ids then builds a pinned documents API GET spec');
    check(lucidListOut && lucidListOut.success === true
      && Array.isArray(lucidListOut.data)
      && lucidListOut.data[0].title === 'Roadmap',
      'lucid.list_documents accepts expected document-list response shape');

    const lucidAccount = makeCtx('https://lucid.app', 181);
    const lucidAccountOut = await lucid['lucid.get_account'].handle({}, lucidAccount.ctx);
    check(lucidAccount.calls.length === 2
      && lucidAccount.calls[1].spec.url === 'https://users.lucid.app/accounts/lucid-account',
      'lucid.get_account calls the bootstrapped users account endpoint');
    check(lucidAccountOut && lucidAccountOut.success === true
      && lucidAccountOut.data.name === 'Lucid Account',
      'lucid.get_account accepts expected account object shape');

    const lucidSearch = makeCtx('https://lucid.app', 182);
    const lucidSearchOut = await lucid['lucid.search_documents'].handle({
      query: 'roadmap',
      count: 5,
      product: 'chart'
    }, lucidSearch.ctx);
    check(lucidSearch.calls.length === 2
      && lucidSearch.calls[1].spec.url === 'https://userdocslist.lucid.app/users/lucid-user/documentList?search=roadmap&count=5&product=chart',
      'lucid.search_documents targets the first-party userdocslist search endpoint');
    check(lucidSearchOut && lucidSearchOut.success === true
      && Array.isArray(lucidSearchOut.data.documents)
      && lucidSearchOut.data.documents[0].Document.title === 'Roadmap',
      'lucid.search_documents accepts expected search envelope shape');

    const lucidRole = makeCtx('https://lucid.app', 183);
    const lucidRoleOut = await lucid['lucid.get_document_role'].handle({ document_id: 'doc-test' }, lucidRole.ctx);
    check(lucidRole.calls.length === 1
      && lucidRole.calls[0].spec.url === 'https://documents.lucid.app/documents/doc-test/role',
      'lucid.get_document_role can run without auth bootstrap when document id is explicit');
    check(lucidRoleOut && lucidRoleOut.success === true
      && lucidRoleOut.data.role === 'editor',
      'lucid.get_document_role normalizes text role responses');

    const lucidMissing = makeCtx('https://lucid.app', 184, { lucidBootstrapText: '<html></html>' });
    const lucidMissingOut = await lucid['lucid.list_groups'].handle({}, lucidMissing.ctx);
    check(lucidMissing.calls.length === 1
      && lucidMissingOut && lucidMissingOut.success === false
      && lucidMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && lucidMissingOut.reason === 'lucid-auth-bootstrap-missing',
      'lucid.list_groups fails closed when bootstrap ids are unavailable');

    const lucidBadShape = makeCtx('https://lucid.app', 185, { lucidData: { error: 'not authenticated' } });
    const lucidBadShapeOut = await lucid['lucid.get_document'].handle({ document_id: 'doc-test' }, lucidBadShape.ctx);
    check(lucidBadShapeOut && lucidBadShapeOut.success === false
      && lucidBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && lucidBadShapeOut.reason === 'lucid-api-shape-mismatch',
      'lucid.get_document rejects Lucid API error envelopes');

    const lucidGuardCalls = [];
    const lucidGuardOut = await lucid['lucid.create_document'].handle({ title: 'Fixture' }, {
      origin: 'https://lucid.app',
      tabId: 186,
      async executeBoundSpec() { lucidGuardCalls.push('spec'); },
      async executeBoundPageRead() { lucidGuardCalls.push('page'); }
    });
    check(lucidGuardOut && lucidGuardOut.success === false
      && lucidGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && lucidGuardOut.fellBackToDom === true
      && lucidGuardCalls.length === 0,
      'lucid.create_document is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Linear first-party authenticated GraphQL read + guarded mutation head
  // =========================================================================
  const linearPath = path.join(HANDLERS_DIR, 'linear.js');
  check(fs.existsSync(linearPath), 'catalog/handlers/linear.js exists');
  if (fs.existsSync(linearPath)) {
    const linear = require(linearPath);
    const linearSrc = readSource(linearPath);
    const linearKeys = Object.keys(linear);
    const linearReadSlugs = linearKeys.filter(function(slug) {
      return linear[slug] && linear[slug].sideEffectClass === 'read';
    });
    const linearGuardedSlugs = linearKeys.filter(function(slug) {
      return linear[slug] && linear[slug].sideEffectClass !== 'read';
    });

    check(linearKeys.length === 59
      && linearReadSlugs.length === 28
      && linearGuardedSlugs.length === 31,
      'Linear exposes all 59 descriptor slugs as 28 reads plus 31 guarded mutation rows');
    check(linearReadSlugs.indexOf('linear.get_viewer') !== -1
      && linearReadSlugs.indexOf('linear.search_issues') !== -1
      && linearGuardedSlugs.indexOf('linear.create_issue') !== -1
      && linearGuardedSlugs.indexOf('linear.delete_issue') !== -1,
      'Linear includes representative read and guarded mutation slugs');
    check(linearKeys.every(function(slug) {
      return linear[slug] && linear[slug].tier === 'T1a'
        && linear[slug].origin === 'https://linear.app'
        && linear[slug].params
        && typeof linear[slug].handle === 'function';
    }), 'Linear handlers are T1a and pinned to linear.app');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(linearSrc),
      'linear.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(linearSrc),
      'linear.js performs no direct network call');
    check(!/document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer|csrfSource/.test(linearSrc),
      'linear.js does not directly read cookies/storage or replay credential headers');

    const linearViewerCalls = [];
    const linearViewerOut = await linear['linear.get_viewer'].handle({}, {
      origin: 'https://linear.app',
      tabId: 290,
      async executeBoundSpec(spec, tid) {
        linearViewerCalls.push({ spec: spec, tabId: tid });
        return {
          success: true,
          status: 200,
          data: {
            data: {
              viewer: {
                id: 'user-linear',
                name: 'Linear User',
                email: 'linear@example.test',
                displayName: 'Linear User',
                active: true,
                admin: false,
                organization: { name: 'Linear Org', urlKey: 'linear-org' }
              }
            }
          }
        };
      }
    });
    check(linearViewerCalls.length === 1
      && linearViewerCalls[0].tabId === 290
      && linearViewerCalls[0].spec.url === 'https://client-api.linear.app/graphql'
      && linearViewerCalls[0].spec.method === 'POST'
      && linearViewerCalls[0].spec.origin === 'https://linear.app'
      && linearViewerCalls[0].spec.credentials === 'include'
      && linearViewerCalls[0].spec._authNeed.tokenKey === 'ApplicationStore'
      && linearViewerCalls[0].spec._authNeed.header === 'useraccount'
      && linearViewerCalls[0].spec.body.query.indexOf('query GetViewer') !== -1,
      'linear.get_viewer builds a pinned first-party GraphQL POST spec with page-owned auth header markers');
    check(linearViewerOut && linearViewerOut.success === true
      && linearViewerOut.data.user.id === 'user-linear'
      && linearViewerOut.data.organization_name === 'Linear Org',
      'linear.get_viewer maps the authenticated viewer GraphQL envelope');

    const linearSearchCalls = [];
    await linear['linear.search_issues'].handle({ query: 'bug', team_key: 'ENG', limit: 5 }, {
      origin: 'https://linear.app',
      tabId: 291,
      async executeBoundSpec(spec, tid) {
        linearSearchCalls.push({ spec: spec, tabId: tid });
        return {
          success: true,
          status: 200,
          data: {
            data: {
              searchIssues: {
                nodes: [{
                  id: 'issue-1',
                  identifier: 'ENG-1',
                  title: 'Bug',
                  state: { name: 'Todo', type: 'unstarted' },
                  team: { key: 'ENG', name: 'Engineering' },
                  labels: { nodes: [{ name: 'bug' }] }
                }],
                pageInfo: { hasNextPage: false, endCursor: '' },
                totalCount: 1
              }
            }
          }
        };
      }
    });
    check(linearSearchCalls.length === 1
      && linearSearchCalls[0].spec.body.variables.query === 'bug'
      && linearSearchCalls[0].spec.body.variables.first === 5
      && linearSearchCalls[0].spec.body.variables.filter.team.key.eq === 'ENG',
      'linear.search_issues carries filters as GraphQL variables');

    const linearGuardCalls = [];
    const linearGuardOut = await linear['linear.create_issue'].handle({ team_id: 'team-1', title: 'No fire' }, {
      origin: 'https://linear.app',
      tabId: 292,
      async executeBoundSpec() { linearGuardCalls.push('spec'); }
    });
    check(linearGuardOut && linearGuardOut.success === false
      && linearGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && linearGuardOut.reason === 'linear-live-mutation-uat-required'
      && linearGuardCalls.length === 0,
      'linear.create_issue is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Target public same-origin HTML read head -- catalog/handlers/target.js
  // =========================================================================
  const targetPath = path.join(HANDLERS_DIR, 'target.js');
  check(fs.existsSync(targetPath), 'catalog/handlers/target.js exists');
  if (fs.existsSync(targetPath)) {
    const tgt = require(targetPath);
    const tgtSrc = readSource(targetPath);
    const targetReadSlugs = [
      'target.search_products',
      'target.get_product'
    ];
    const targetExcludedSlugs = [
      'target.add_to_cart',
      'target.apply_promo_code',
      'target.find_nearby_stores',
      'target.get_cart',
      'target.get_current_user',
      'target.get_loyalty_details',
      'target.get_order',
      'target.get_savings_summary',
      'target.get_shopping_list',
      'target.get_store',
      'target.list_favorites',
      'target.list_orders',
      'target.list_shopping_lists',
      'target.navigate_to_checkout',
      'target.remove_cart_item',
      'target.update_cart_item_quantity'
    ];

    check(targetReadSlugs.every(function(slug) {
      return tgt[slug] && tgt[slug].tier === 'T1a'
        && tgt[slug].sideEffectClass === 'read'
        && tgt[slug].origin === 'https://www.target.com'
        && tgt[slug].params
        && typeof tgt[slug].handle === 'function';
    }), 'Target product search/detail descriptors are T1a reads pinned to www.target.com');
    check(targetExcludedSlugs.every(function(slug) {
      return !tgt[slug] && tgtSrc.indexOf("'" + slug + "'") === -1 && tgtSrc.indexOf('"' + slug + '"') === -1;
    }), 'Target cart, account, store, order, shopping-list, checkout, and mutation rows stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(tgtSrc),
      'target.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(tgtSrc),
      'target.js performs no direct network call');
    check(!/api\.target\.com|redsky\.target\.com|carts\.target\.com|typeahead\.target\.com|x-api-key|visitorId|getCookie|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource/i.test(tgtSrc),
      'target.js does not use Target API hosts, page-token helpers, storage, or credential headers');

    const tgtSearch = makeCtx('https://www.target.com', 173);
    const tgtSearchOut = await tgt['target.search_products'].handle({ keyword: 'paper towels', count: 1 }, tgtSearch.ctx);
    check(tgtSearch.calls.length === 1
      && tgtSearch.calls[0].spec.method === 'GET'
      && tgtSearch.calls[0].spec.url === 'https://www.target.com/s?searchTerm=paper%20towels&Nao=0'
      && tgtSearch.calls[0].spec.origin === 'https://www.target.com'
      && tgtSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && tgtSearch.calls[0].spec.headers.Accept === 'text/html',
      'target.search_products builds one same-origin public search page GET spec');
    check(tgtSearchOut && tgtSearchOut.success === true
      && tgtSearchOut.data.total_results === 2
      && tgtSearchOut.data.products.length === 1
      && tgtSearchOut.data.products[0].tcin === '85978618'
      && tgtSearchOut.data.products[0].title === 'Target T1 Fixture Product'
      && tgtSearchOut.data.products[0].price === '$19.99',
      'target.search_products maps product summaries from page data');

    const tgtProduct = makeCtx('https://www.target.com', 174);
    const tgtProductOut = await tgt['target.get_product'].handle({ tcin: '85978618' }, tgtProduct.ctx);
    check(tgtProduct.calls.length === 1
      && tgtProduct.calls[0].spec.url === 'https://www.target.com/p/-/A-85978618'
      && tgtProduct.calls[0].spec.origin === 'https://www.target.com'
      && tgtProduct.calls[0].spec.authStrategy === 'same-origin-cookie',
      'target.get_product targets the first-party product page');
    check(tgtProductOut && tgtProductOut.success === true
      && tgtProductOut.data.product.tcin === '85978618'
      && tgtProductOut.data.product.description === 'Fixture product description'
      && tgtProductOut.data.product.bullet_descriptions[0] === 'Feature one',
      'target.get_product maps product detail fields and strips HTML');

    const tgtBadShape = makeCtx('https://www.target.com', 175, { targetText: '<html><body>No page data</body></html>' });
    const tgtBadShapeOut = await tgt['target.search_products'].handle({ keyword: 'missing' }, tgtBadShape.ctx);
    check(tgtBadShapeOut && tgtBadShapeOut.success === false
      && tgtBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tgtBadShapeOut.reason === 'target-public-html-shape-mismatch',
      'target.search_products rejects unexpected public page shapes');

    const tgtNoPrimitive = await tgt['target.get_product'].handle({ tcin: '85978618' }, {
      origin: 'https://www.target.com',
      tabId: 176
    });
    check(tgtNoPrimitive && tgtNoPrimitive.success === false
      && tgtNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tgtNoPrimitive.reason === 'target-execute-bound-spec-unavailable',
      'target.get_product fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Walmart public same-origin HTML read head -- catalog/handlers/walmart.js
  // =========================================================================
  const walmartPath = path.join(HANDLERS_DIR, 'walmart.js');
  const walmartExtPath = path.join(EXT_HANDLERS_DIR, 'walmart.js');
  check(fs.existsSync(walmartPath), 'catalog/handlers/walmart.js exists');
  if (fs.existsSync(walmartPath)) {
    const wm = require(walmartPath);
    const wmSrc = readSource(walmartPath);
    const walmartReadSlugs = [
      'walmart.search_products',
      'walmart.get_product',
      'walmart.get_product_reviews',
      'walmart.get_store'
    ];
    const walmartExcludedSlugs = [
      'walmart.get_cart',
      'walmart.get_current_user',
      'walmart.list_orders',
      'walmart.navigate_to_checkout',
      'walmart.navigate_to_product',
      'walmart.navigate_to_search'
    ];

    check(walmartReadSlugs.every(function(slug) {
      return wm[slug] && wm[slug].tier === 'T1a'
        && wm[slug].sideEffectClass === 'read'
        && wm[slug].origin === 'https://www.walmart.com'
        && wm[slug].params
        && typeof wm[slug].handle === 'function';
    }), 'Walmart search/product/review/store descriptors are T1a reads pinned to www.walmart.com');
    check(walmartExcludedSlugs.every(function(slug) {
      return !wm[slug] && wmSrc.indexOf("'" + slug + "'") === -1 && wmSrc.indexOf('"' + slug + '"') === -1;
    }), 'Walmart cart, account, order, checkout, and navigation rows stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(wmSrc),
      'walmart.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(wmSrc),
      'walmart.js performs no direct network call');
    check(!/orchestra\/api|bootstrapData|fetchBootstrapData|getCustomerInfo|isAuthenticated|getAuthCache|setAuthCache|waitUntil|getCookie|hasCID|ceid|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|window\.location|document\.querySelector/i.test(wmSrc),
      'walmart.js does not use auth helpers, bootstrap account/cart data, storage, cookies, credential headers, DOM APIs, or browser navigation');
    check(fs.existsSync(walmartExtPath) ? readSource(walmartExtPath) === wmSrc : true,
      'extension/catalog/handlers/walmart.js matches catalog/handlers/walmart.js when present');
    check(walmartReadSlugs.every(function(slug) {
      const descriptorName = 'opentabs__' + slug.replace('.', '__') + '.json';
      return readJson(path.join(DESCRIPTORS_DIR, descriptorName)).backing === 'handler';
    }), 'promoted Walmart descriptors are handler-backed');

    const wmSearch = makeCtx('https://www.walmart.com', 182);
    const wmSearchOut = await wm['walmart.search_products'].handle({
      query: 'paper towels',
      page: 2,
      sort: 'price_low'
    }, wmSearch.ctx);
    check(wmSearch.calls.length === 1
      && wmSearch.calls[0].spec.method === 'GET'
      && wmSearch.calls[0].spec.url === 'https://www.walmart.com/search?q=paper%20towels&page=2&sort=price_asc'
      && wmSearch.calls[0].spec.origin === 'https://www.walmart.com'
      && wmSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && wmSearch.calls[0].spec.headers.Accept === 'text/html',
      'walmart.search_products builds one same-origin public search page GET spec');
    check(wmSearchOut && wmSearchOut.success === true
      && wmSearchOut.data.total_results === 2
      && wmSearchOut.data.max_page === 4
      && wmSearchOut.data.current_page === 2
      && wmSearchOut.data.items.length === 2
      && wmSearchOut.data.items[0].us_item_id === '13943258180'
      && wmSearchOut.data.items[0].price === '$24.98',
      'walmart.search_products maps product summaries from page data');

    const wmProduct = makeCtx('https://www.walmart.com', 183);
    const wmProductOut = await wm['walmart.get_product'].handle({ us_item_id: '13943258180' }, wmProduct.ctx);
    check(wmProduct.calls.length === 1
      && wmProduct.calls[0].spec.url === 'https://www.walmart.com/ip/item/13943258180'
      && wmProduct.calls[0].spec.origin === 'https://www.walmart.com'
      && wmProduct.calls[0].spec.authStrategy === 'same-origin-cookie',
      'walmart.get_product targets the first-party product page');
    check(wmProductOut && wmProductOut.success === true
      && wmProductOut.data.product.us_item_id === '13943258180'
      && wmProductOut.data.product.long_description === 'Long fixture description'
      && wmProductOut.data.product.specifications[0].value === '12'
      && wmProductOut.data.product.fulfillment_summary[0] === 'Pickup today',
      'walmart.get_product maps product detail fields and strips HTML');

    const wmReviews = makeCtx('https://www.walmart.com', 184);
    const wmReviewsOut = await wm['walmart.get_product_reviews'].handle({ us_item_id: '13943258180' }, wmReviews.ctx);
    check(wmReviews.calls.length === 1
      && wmReviews.calls[0].spec.url === 'https://www.walmart.com/ip/item/13943258180',
      'walmart.get_product_reviews reads the first-party product page');
    check(wmReviewsOut && wmReviewsOut.success === true
      && wmReviewsOut.data.summary.average_rating === 4.5
      && wmReviewsOut.data.summary.total_reviews === 123
      && wmReviewsOut.data.reviews[0].title === 'Useful'
      && wmReviewsOut.data.reviews[0].positive_feedback === 7,
      'walmart.get_product_reviews maps review summary and review rows');

    const wmStore = makeCtx('https://www.walmart.com', 185);
    const wmStoreOut = await wm['walmart.get_store'].handle({ store_id: '5435-san-jose-ca' }, wmStore.ctx);
    check(wmStore.calls.length === 1
      && wmStore.calls[0].spec.url === 'https://www.walmart.com/store/5435-san-jose-ca',
      'walmart.get_store targets the first-party store page');
    check(wmStoreOut && wmStoreOut.success === true
      && wmStoreOut.data.store.store_id === '5435'
      && wmStoreOut.data.store.city === 'Louisville'
      && wmStoreOut.data.store.hours.length === 1
      && wmStoreOut.data.store.services[0].display_name === 'Pharmacy',
      'walmart.get_store maps public store detail fields');

    const wmInvalid = makeCtx('https://www.walmart.com', 186);
    const wmInvalidOut = await wm['walmart.get_product'].handle({ us_item_id: 'abc-123' }, wmInvalid.ctx);
    check(wmInvalid.calls.length === 0
      && wmInvalidOut && wmInvalidOut.success === false
      && wmInvalidOut.reason === 'walmart-invalid-us-item-id',
      'walmart.get_product fails closed without executing on invalid item IDs');

    const wmBadShape = makeCtx('https://www.walmart.com', 187, { walmartText: '<html><body>No page data</body></html>' });
    const wmBadShapeOut = await wm['walmart.search_products'].handle({ query: 'missing' }, wmBadShape.ctx);
    check(wmBadShapeOut && wmBadShapeOut.success === false
      && wmBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && wmBadShapeOut.reason === 'walmart-public-html-shape-mismatch',
      'walmart.search_products rejects unexpected public page shapes');

    const wmNoPrimitive = await wm['walmart.get_store'].handle({ store_id: '5435' }, {
      origin: 'https://www.walmart.com',
      tabId: 188
    });
    check(wmNoPrimitive && wmNoPrimitive.success === false
      && wmNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && wmNoPrimitive.reason === 'walmart-execute-bound-spec-unavailable',
      'walmart.get_store fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Home Depot first-party read and guarded-write head -- catalog/handlers/homedepot.js
  // =========================================================================
  const homeDepotPath = path.join(HANDLERS_DIR, 'homedepot.js');
  const homeDepotExtPath = path.join(EXT_HANDLERS_DIR, 'homedepot.js');
  check(fs.existsSync(homeDepotPath), 'catalog/handlers/homedepot.js exists');
  if (fs.existsSync(homeDepotPath)) {
    const hd = require(homeDepotPath);
    const hdSrc = readSource(homeDepotPath);
    const homeDepotReadSlugs = [
      'homedepot.search_products',
      'homedepot.get_product',
      'homedepot.search_stores',
      'homedepot.get_cart',
      'homedepot.get_saved_items',
      'homedepot.get_store_context'
    ];
    const homeDepotGuardedSlugs = [
      'homedepot.add_to_cart'
    ];
    const homeDepotExcludedSlugs = [
      'homedepot.get_current_user',
      'homedepot.navigate_to_checkout',
      'homedepot.navigate_to_product'
    ];
    const homeDepotPromotedSlugs = homeDepotReadSlugs.concat(homeDepotGuardedSlugs);

    check(homeDepotReadSlugs.every(function(slug) {
      return hd[slug] && hd[slug].tier === 'T1a'
        && hd[slug].sideEffectClass === 'read'
        && hd[slug].origin === 'https://www.homedepot.com'
        && hd[slug].params
        && typeof hd[slug].handle === 'function';
    }), 'Home Depot reviewed read descriptors are T1a reads pinned to www.homedepot.com');
    check(homeDepotGuardedSlugs.every(function(slug) {
      return hd[slug] && hd[slug].tier === 'T1a'
        && hd[slug].sideEffectClass === 'write'
        && hd[slug].origin === 'https://www.homedepot.com'
        && hd[slug].params
        && typeof hd[slug].handle === 'function';
    }), 'Home Depot add-to-cart is registered only as a guarded write');
    check(homeDepotExcludedSlugs.every(function(slug) {
      return !hd[slug] && hdSrc.indexOf("'" + slug + "'") === -1 && hdSrc.indexOf('"' + slug + '"') === -1;
    }), 'Home Depot current-user and browser-navigation rows stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(hdSrc),
      'homedepot.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(hdSrc),
      'homedepot.js performs no direct network call');
    check(!/getCookie|getPageGlobal|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|window\.location|location\.href|document\.querySelector|THD_CUSTOMER|THD_PERSIST|csrfSource/i.test(hdSrc),
      'homedepot.js does not use page globals, customer cookies, storage, credential headers, DOM APIs, or browser navigation');
    check(fs.existsSync(homeDepotExtPath) ? readSource(homeDepotExtPath) === hdSrc : true,
      'extension/catalog/handlers/homedepot.js matches catalog/handlers/homedepot.js when present');
    check(homeDepotPromotedSlugs.every(function(slug) {
      const descriptorName = 'opentabs__' + slug.replace('.', '__') + '.json';
      return readJson(path.join(DESCRIPTORS_DIR, descriptorName)).backing === 'handler';
    }), 'promoted Home Depot descriptors are handler-backed');

    const hdSearch = makeCtx('https://www.homedepot.com', 189);
    const hdSearchOut = await hd['homedepot.search_products'].handle({
      keyword: 'cordless drill',
      store_id: '121'
    }, hdSearch.ctx);
    const hdSearchBody = hdSearch.calls.length ? parseSpecBody(hdSearch.calls[0].spec) : {};
    check(hdSearch.calls.length === 1
      && hdSearch.calls[0].spec.method === 'POST'
      && hdSearch.calls[0].spec.url.indexOf('https://apionline.homedepot.com/federation-gateway/graphql?opname=searchModel') === 0
      && hdSearch.calls[0].spec.origin === 'https://www.homedepot.com'
      && hdSearch.calls[0].spec.authStrategy === 'same-origin-cookie'
      && hdSearch.calls[0].spec.headers['x-experience-name'] === 'general-merchandise'
      && hdSearchBody.operationName === 'searchModel'
      && hdSearchBody.variables.keyword === 'cordless drill'
      && hdSearchBody.variables.storeId === '121',
      'homedepot.search_products builds one first-party GraphQL search spec');
    check(hdSearchOut && hdSearchOut.success === true
      && hdSearchOut.data.total_products === 2
      && hdSearchOut.data.products[0].item_id === '312610058'
      && hdSearchOut.data.products[0].price === 79.97
      && hdSearchOut.data.products[0].brand === 'Fixture Brand',
      'homedepot.search_products maps product summaries');

    const hdProduct = makeCtx('https://www.homedepot.com', 190);
    const hdProductOut = await hd['homedepot.get_product'].handle({
      item_id: '312610058',
      store_id: '121'
    }, hdProduct.ctx);
    const hdProductBody = hdProduct.calls.length ? parseSpecBody(hdProduct.calls[0].spec) : {};
    check(hdProduct.calls.length === 1
      && hdProductBody.operationName === 'productClientOnlyProduct'
      && hdProductBody.variables.itemId === '312610058'
      && hdProductBody.variables.storeId === '121',
      'homedepot.get_product targets productClientOnlyProduct with item and store');
    check(hdProductOut && hdProductOut.success === true
      && hdProductOut.data.product.item_id === '312610058'
      && hdProductOut.data.product.description === 'Cordless drill fixture description'
      && hdProductOut.data.product.fulfillment_options[0] === 'pickup',
      'homedepot.get_product maps product detail fields');

    const hdStores = makeCtx('https://www.homedepot.com', 191);
    const hdStoresOut = await hd['homedepot.search_stores'].handle({ zip_code: '40202', radius: 10 }, hdStores.ctx);
    const hdStoresBody = hdStores.calls.length ? parseSpecBody(hdStores.calls[0].spec) : {};
    check(hdStores.calls.length === 1
      && hdStoresBody.operationName === 'storeSearch'
      && hdStoresBody.variables.zipCode === '40202'
      && hdStoresBody.variables.radius === 10,
      'homedepot.search_stores targets storeSearch with bounded inputs');
    check(hdStoresOut && hdStoresOut.success === true
      && hdStoresOut.data.stores[0].store_id === '121'
      && hdStoresOut.data.stores[0].city === 'Louisville'
      && hdStoresOut.data.stores[0].hours.monday === '06:00-22:00',
      'homedepot.search_stores maps store fields');

    const hdCart = makeCtx('https://www.homedepot.com', 192);
    const hdCartOut = await hd['homedepot.get_cart'].handle({}, hdCart.ctx);
    check(hdCart.calls.length === 2
      && parseSpecBody(hdCart.calls[0].spec).operationName === 'getCart'
      && parseSpecBody(hdCart.calls[1].spec).operationName === 'getCart'
      && parseSpecBody(hdCart.calls[1].spec).query.indexOf('items {') !== -1,
      'homedepot.get_cart reads summary then item details when cart has items');
    check(hdCartOut && hdCartOut.success === true
      && hdCartOut.data.cart_id === 'cart-test'
      && hdCartOut.data.item_count === 1
      && hdCartOut.data.items[0].item_id === '312610058'
      && hdCartOut.data.totals.total === 159.94,
      'homedepot.get_cart maps cart summary and item details');

    const hdSaved = makeCtx('https://www.homedepot.com', 193);
    const hdSavedOut = await hd['homedepot.get_saved_items'].handle({}, hdSaved.ctx);
    check(hdSaved.calls.length === 1
      && parseSpecBody(hdSaved.calls[0].spec).operationName === 'getAllSaveForLaterItems'
      && hdSaved.calls[0].spec.headers['x-experience-name'] === 'my-cart',
      'homedepot.get_saved_items targets save-for-later GraphQL with my-cart experience');
    check(hdSavedOut && hdSavedOut.success === true
      && hdSavedOut.data.item_count === 1
      && hdSavedOut.data.items[0].item_id === '205440279'
      && hdSavedOut.data.items[0].name === 'Saved Fixture Drill',
      'homedepot.get_saved_items maps saved item fields');

    const hdContext = makeCtx('https://www.homedepot.com', 194);
    const hdContextOut = await hd['homedepot.get_store_context'].handle({}, hdContext.ctx);
    check(hdContext.calls.length === 1
      && hdContext.calls[0].spec.method === 'GET'
      && hdContext.calls[0].spec.url === 'https://www.homedepot.com/'
      && hdContext.calls[0].spec.origin === 'https://www.homedepot.com'
      && hdContext.calls[0].spec.authStrategy === 'same-origin-cookie',
      'homedepot.get_store_context reads the first-party bootstrap page');
    check(hdContextOut && hdContextOut.success === true
      && hdContextOut.data.store_id === '121'
      && hdContextOut.data.store_name === 'Fixture Home Depot'
      && hdContextOut.data.delivery_zip === '40203',
      'homedepot.get_store_context maps bootstrap store context');

    const hdWrite = makeCtx('https://www.homedepot.com', 195);
    const hdWriteOut = await hd['homedepot.add_to_cart'].handle({ item_id: '312610058', quantity: 1 }, hdWrite.ctx);
    check(hdWrite.calls.length === 0
      && hdWriteOut && hdWriteOut.success === false
      && hdWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && hdWriteOut.errorCode === hdWriteOut.code
      && hdWriteOut.error === hdWriteOut.code
      && hdWriteOut.fellBackToDom === true,
      'homedepot.add_to_cart is guarded fail-closed and calls no execution primitive');

    const hdInvalid = makeCtx('https://www.homedepot.com', 196);
    const hdInvalidOut = await hd['homedepot.search_products'].handle({ keyword: '' }, hdInvalid.ctx);
    check(hdInvalid.calls.length === 0
      && hdInvalidOut && hdInvalidOut.success === false
      && hdInvalidOut.reason === 'homedepot-invalid-keyword',
      'homedepot.search_products fails closed without executing on invalid keyword');

    const hdBadShape = makeCtx('https://www.homedepot.com', 197, { homedepotData: { data: { searchModel: {} } } });
    const hdBadShapeOut = await hd['homedepot.search_products'].handle({ keyword: 'missing' }, hdBadShape.ctx);
    check(hdBadShapeOut && hdBadShapeOut.success === false
      && hdBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && hdBadShapeOut.reason === 'homedepot-graphql-shape-mismatch',
      'homedepot.search_products rejects unexpected GraphQL shapes');

    const hdNoPrimitive = await hd['homedepot.search_stores'].handle({ zip_code: '40202' }, {
      origin: 'https://www.homedepot.com',
      tabId: 198
    });
    check(hdNoPrimitive && hdNoPrimitive.success === false
      && hdNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && hdNoPrimitive.reason === 'homedepot-execute-bound-spec-unavailable',
      'homedepot.search_stores fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Costco public ecom read head -- catalog/handlers/costco.js
  // =========================================================================
  const costcoPath = path.join(HANDLERS_DIR, 'costco.js');
  const costcoExtPath = path.join(EXT_HANDLERS_DIR, 'costco.js');
  check(fs.existsSync(costcoPath), 'catalog/handlers/costco.js exists');
  if (fs.existsSync(costcoPath)) {
    const cc = require(costcoPath);
    const ccSrc = readSource(costcoPath);
    const costcoReadSlugs = [
      'costco.get_product',
      'costco.get_products',
      'costco.get_product_availability'
    ];
    const costcoExcludedSlugs = [
      'costco.add_to_list',
      'costco.create_list',
      'costco.delete_list',
      'costco.geocode_location',
      'costco.get_current_user',
      'costco.get_list_items',
      'costco.get_lists',
      'costco.navigate_to_cart',
      'costco.navigate_to_checkout',
      'costco.navigate_to_product',
      'costco.navigate_to_search',
      'costco.remove_list_item',
      'costco.search_products'
    ];

    check(costcoReadSlugs.every(function(slug) {
      return cc[slug] && cc[slug].tier === 'T1a'
        && cc[slug].sideEffectClass === 'read'
        && cc[slug].origin === 'https://www.costco.com'
        && cc[slug].params
        && typeof cc[slug].handle === 'function';
    }), 'Costco public product/inventory descriptors are T1a reads pinned to www.costco.com');
    check(costcoExcludedSlugs.every(function(slug) {
      return !cc[slug] && ccSrc.indexOf("'" + slug + "'") === -1 && ccSrc.indexOf('"' + slug + '"') === -1;
    }), 'Costco account/list/cart/checkout/navigation/search/geocode/write rows stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(ccSrc),
      'costco.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(ccSrc),
      'costco.js performs no direct network call');
    check(!/api\.digital\.costco\.com|Authorization|Bearer|getAuth|getCookie|getSessionStorage|setAuthCache|hashedUserId|memberNumber|document\.cookie|localStorage|sessionStorage|window\.location|document\.querySelector|csrfSource/i.test(ccSrc),
      'costco.js does not use digital account APIs, page state, bearer auth, storage, cookies, or navigation');
    check(fs.existsSync(costcoExtPath) ? readSource(costcoExtPath) === ccSrc : true,
      'extension/catalog/handlers/costco.js matches catalog/handlers/costco.js when present');

    const ccProduct = makeCtx('https://www.costco.com', 177);
    const ccProductOut = await cc['costco.get_product'].handle({
      item_number: '4000369340',
      warehouse_number: '847'
    }, ccProduct.ctx);
    const ccProductBody = ccProduct.calls.length ? parseSpecBody(ccProduct.calls[0].spec) : {};
    check(ccProduct.calls.length === 1
      && ccProduct.calls[0].spec.method === 'POST'
      && ccProduct.calls[0].spec.url === 'https://ecom-api.costco.com/ebusiness/product/v1/products/graphql'
      && ccProduct.calls[0].spec.origin === 'https://www.costco.com'
      && ccProduct.calls[0].spec.authStrategy === 'none'
      && ccProduct.calls[0].spec.credentials === 'omit'
      && ccProduct.calls[0].spec.headers['client-identifier'] === '4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf'
      && ccProductBody.query.indexOf('itemNumbers: ["4000369340"]') !== -1
      && ccProductBody.query.indexOf('warehouseNumber: "847"') !== -1,
      'costco.get_product builds one credential-free public ecom GraphQL spec');
    check(ccProductOut && ccProductOut.success === true
      && ccProductOut.data.product.item_number === '4000369340'
      && ccProductOut.data.product.name === 'Costco Fixture Product 4000369340'
      && ccProductOut.data.product.price === '1199.99'
      && ccProductOut.data.product.membership_required === true,
      'costco.get_product maps product detail fields from the public ecom response');

    const ccProducts = makeCtx('https://www.costco.com', 178);
    const ccProductsOut = await cc['costco.get_products'].handle({
      item_numbers: ['4000369340', '1234567']
    }, ccProducts.ctx);
    const ccProductsBody = ccProducts.calls.length ? parseSpecBody(ccProducts.calls[0].spec) : {};
    check(ccProducts.calls.length === 1
      && ccProductsBody.query.indexOf('itemNumbers: ["4000369340","1234567"]') !== -1,
      'costco.get_products sends up to 25 numeric item numbers in one GraphQL request');
    check(ccProductsOut && ccProductsOut.success === true
      && ccProductsOut.data.products.length === 2
      && ccProductsOut.data.products[1].item_number === '1234567',
      'costco.get_products maps multiple products');

    const ccAvailability = makeCtx('https://www.costco.com', 179);
    const ccAvailabilityOut = await cc['costco.get_product_availability'].handle({
      item_numbers: ['4000369340']
    }, ccAvailability.ctx);
    const ccAvailabilityBody = ccAvailability.calls.length ? parseSpecBody(ccAvailability.calls[0].spec) : {};
    check(ccAvailability.calls.length === 1
      && ccAvailability.calls[0].spec.method === 'POST'
      && ccAvailability.calls[0].spec.url === 'https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch'
      && ccAvailability.calls[0].spec.authStrategy === 'none'
      && ccAvailability.calls[0].spec.credentials === 'omit'
      && ccAvailability.calls[0].spec.headers['client-identifier'] === '481b1aec-aa3b-454b-b81b-48187e28f205'
      && ccAvailabilityBody.selectedWarehouse === '847-wh'
      && Array.isArray(ccAvailabilityBody.distributionCenters)
      && ccAvailabilityBody.distributionCenters.length === 0
      && ccAvailabilityBody.itemNumbers[0] === '4000369340',
      'costco.get_product_availability builds one credential-free inventory spec');
    check(ccAvailabilityOut && ccAvailabilityOut.success === true
      && ccAvailabilityOut.data.items[0].online_available === true
      && ccAvailabilityOut.data.items[0].pickup_available === true
      && ccAvailabilityOut.data.items[0].third_party_delivery === false,
      'costco.get_product_availability maps inventory availability fields');

    const ccInvalid = makeCtx('https://www.costco.com', 180);
    const ccInvalidOut = await cc['costco.get_product'].handle({ item_number: 'abc-123' }, ccInvalid.ctx);
    check(ccInvalid.calls.length === 0
      && ccInvalidOut && ccInvalidOut.success === false
      && ccInvalidOut.reason === 'costco-invalid-item-number',
      'costco.get_product fails closed without executing on invalid item numbers');

    const ccBadShape = makeCtx('https://www.costco.com', 181, { costcoData: { data: { products: {} } } });
    const ccBadShapeOut = await cc['costco.get_products'].handle({ item_numbers: ['4000369340'] }, ccBadShape.ctx);
    check(ccBadShapeOut && ccBadShapeOut.success === false
      && ccBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ccBadShapeOut.reason === 'costco-product-shape-mismatch',
      'costco.get_products rejects unexpected product API shapes');
  }

  // =========================================================================
  // Instacart same-origin GraphQL read head -- catalog/handlers/instacart.js
  // =========================================================================
  const instacartPath = path.join(HANDLERS_DIR, 'instacart.js');
  const instacartExtPath = path.join(EXT_HANDLERS_DIR, 'instacart.js');
  check(fs.existsSync(instacartPath), 'catalog/handlers/instacart.js exists');
  if (fs.existsSync(instacartPath)) {
    const ic = require(instacartPath);
    const icSrc = readSource(instacartPath);
    const instacartReadSlugs = [
      'instacart.get_current_user',
      'instacart.list_addresses',
      'instacart.list_active_carts',
      'instacart.get_cart',
      'instacart.list_orders',
      'instacart.get_order'
    ];
    const instacartExcludedSlugs = [
      'instacart.delete_cart',
      'instacart.get_location_context',
      'instacart.get_product',
      'instacart.navigate_to_checkout',
      'instacart.search_products',
      'instacart.update_cart_items'
    ];

    check(instacartReadSlugs.every(function(slug) {
      return ic[slug] && ic[slug].tier === 'T1a'
        && ic[slug].sideEffectClass === 'read'
        && ic[slug].origin === 'https://www.instacart.com'
        && ic[slug].params
        && typeof ic[slug].handle === 'function';
    }), 'Instacart account/cart/order descriptors are T1a reads pinned to www.instacart.com');
    check(instacartExcludedSlugs.every(function(slug) {
      return !ic[slug] && icSrc.indexOf("'" + slug + "'") === -1 && icSrc.indexOf('"' + slug + '"') === -1;
    }), 'Instacart location/product-search/product-detail/checkout/write/destructive rows stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(icSrc),
      'instacart.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(icSrc),
      'instacart.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|getPageGlobal|document\.querySelector|window\.location|location\.href|UpdateCartItems|DeleteCart|crypto\.randomUUID/i.test(icSrc),
      'instacart.js does not use page globals, storage, credential headers, checkout navigation, or mutation operations');
    check(fs.existsSync(instacartExtPath) ? readSource(instacartExtPath) === icSrc : true,
      'extension/catalog/handlers/instacart.js matches catalog/handlers/instacart.js when present');

    const icUser = makeCtx('https://www.instacart.com', 182);
    const icUserOut = await ic['instacart.get_current_user'].handle({}, icUser.ctx);
    check(icUser.calls.length === 1
      && icUser.calls[0].spec.method === 'GET'
      && icUser.calls[0].spec.url.indexOf('https://www.instacart.com/graphql?') === 0
      && icUser.calls[0].spec.url.indexOf('operationName=CurrentUser') !== -1
      && icUser.calls[0].spec.origin === 'https://www.instacart.com'
      && icUser.calls[0].spec.authStrategy === 'same-origin-cookie'
      && icUser.calls[0].spec.headers['x-client-identifier'] === 'web',
      'instacart.get_current_user builds one same-origin persisted GraphQL spec');
    check(icUserOut && icUserOut.success === true
      && icUserOut.data.user.id === 'user-test'
      && icUserOut.data.user.email === 'instacart@example.invalid'
      && icUserOut.data.user.orders_count === 7,
      'instacart.get_current_user maps user profile fields');

    const icAddresses = makeCtx('https://www.instacart.com', 183);
    const icAddressesOut = await ic['instacart.list_addresses'].handle({}, icAddresses.ctx);
    check(icAddresses.calls.length === 1
      && icAddresses.calls[0].spec.url.indexOf('operationName=UserAddresses') !== -1,
      'instacart.list_addresses targets UserAddresses');
    check(icAddressesOut && icAddressesOut.success === true
      && icAddressesOut.data.addresses[0].street_address === '123 Market St'
      && icAddressesOut.data.addresses[0].postal_code === '94105',
      'instacart.list_addresses maps saved addresses');

    const icCarts = makeCtx('https://www.instacart.com', 184);
    const icCartsOut = await ic['instacart.list_active_carts'].handle({}, icCarts.ctx);
    check(icCarts.calls.length === 1
      && icCarts.calls[0].spec.url.indexOf('operationName=PersonalActiveCarts') !== -1,
      'instacart.list_active_carts targets PersonalActiveCarts');
    check(icCartsOut && icCartsOut.success === true
      && icCartsOut.data.carts[0].id === 'cart-test'
      && icCartsOut.data.carts[0].retailer_name === 'Instacart Fixture Market',
      'instacart.list_active_carts maps active cart summaries');

    const icCart = makeCtx('https://www.instacart.com', 185);
    const icCartOut = await ic['instacart.get_cart'].handle({ cart_id: 'cart-test' }, icCart.ctx);
    const icCartVars = icCart.calls.length ? instacartVariables(icCart.calls[0].spec.url) : {};
    check(icCart.calls.length === 1
      && icCart.calls[0].spec.url.indexOf('operationName=CartData') !== -1
      && icCartVars.id === 'cart-test',
      'instacart.get_cart targets CartData with the requested cart ID');
    check(icCartOut && icCartOut.success === true
      && icCartOut.data.cart.id === 'cart-test'
      && icCartOut.data.cart.items[0].name === 'Fixture Bananas',
      'instacart.get_cart maps cart detail and cart items');

    const icOrders = makeCtx('https://www.instacart.com', 186);
    const icOrdersOut = await ic['instacart.list_orders'].handle({ first: 5, after: 'cursor-prev' }, icOrders.ctx);
    const icOrdersVars = icOrders.calls.length ? instacartVariables(icOrders.calls[0].spec.url) : {};
    check(icOrders.calls.length === 1
      && icOrders.calls[0].spec.url.indexOf('operationName=OrderDeliveriesConnection') !== -1
      && icOrdersVars.first === 5
      && icOrdersVars.after === 'cursor-prev',
      'instacart.list_orders targets OrderDeliveriesConnection with bounded pagination variables');
    check(icOrdersOut && icOrdersOut.success === true
      && icOrdersOut.data.orders[0].id === 'order-test'
      && icOrdersOut.data.has_next_page === true
      && icOrdersOut.data.end_cursor === 'cursor-next',
      'instacart.list_orders maps order summaries and pagination');

    const icOrder = makeCtx('https://www.instacart.com', 187);
    const icOrderOut = await ic['instacart.get_order'].handle({ order_id: 'order-test' }, icOrder.ctx);
    const icOrderVars = icOrder.calls.length ? instacartVariables(icOrder.calls[0].spec.url) : {};
    check(icOrder.calls.length === 1
      && icOrder.calls[0].spec.url.indexOf('operationName=OrderDelivery') !== -1
      && icOrderVars.id === 'order-test',
      'instacart.get_order targets OrderDelivery with the requested order ID');
    check(icOrderOut && icOrderOut.success === true
      && icOrderOut.data.order.total === '$42.17'
      && icOrderOut.data.order.item_count === 3,
      'instacart.get_order maps order detail fields');

    const icBadShape = makeCtx('https://www.instacart.com', 188, { instacartData: { data: { userCarts: {} } } });
    const icBadShapeOut = await ic['instacart.list_active_carts'].handle({}, icBadShape.ctx);
    check(icBadShapeOut && icBadShapeOut.success === false
      && icBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && icBadShapeOut.reason === 'instacart-graphql-shape-mismatch',
      'instacart.list_active_carts rejects unexpected GraphQL shapes');

    const icNoPrimitive = await ic['instacart.get_order'].handle({ order_id: 'order-test' }, {
      origin: 'https://www.instacart.com',
      tabId: 189
    });
    check(icNoPrimitive && icNoPrimitive.success === false
      && icNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && icNoPrimitive.reason === 'instacart-execute-bound-spec-unavailable',
      'instacart.get_order fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Uber Eats same-origin read + guarded payment head -- catalog/handlers/ubereats.js
  // =========================================================================
  const ubereatsPath = path.join(HANDLERS_DIR, 'ubereats.js');
  const ubereatsExtPath = path.join(EXT_HANDLERS_DIR, 'ubereats.js');
  check(fs.existsSync(ubereatsPath), 'catalog/handlers/ubereats.js exists');
  if (fs.existsSync(ubereatsPath)) {
    const ue = require(ubereatsPath);
    const ueSrc = readSource(ubereatsPath);
    const ubereatsReadSlugs = [
      'ubereats.list_restaurants',
      'ubereats.get_menu',
      'ubereats.list_orders'
    ];
    const ubereatsGuardedSlugs = [
      'ubereats.place_order',
      'ubereats.cancel_order'
    ];

    check(ubereatsReadSlugs.every(function(slug) {
      return ue[slug] && ue[slug].tier === 'T1a'
        && ue[slug].sideEffectClass === 'read'
        && ue[slug].origin === 'https://www.ubereats.com'
        && ue[slug].params
        && typeof ue[slug].handle === 'function';
    }), 'Uber Eats restaurant/menu/order descriptors are T1a reads pinned to www.ubereats.com');
    check(ubereatsGuardedSlugs.every(function(slug) {
      return ue[slug] && ue[slug].tier === 'T1a'
        && ue[slug].origin === 'https://www.ubereats.com'
        && ue[slug].sideEffectClass !== 'read'
        && ue[slug].params
        && typeof ue[slug].handle === 'function';
    }), 'Uber Eats payment and cancellation descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(ueSrc),
      'ubereats.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(ueSrc),
      'ubereats.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|document\.querySelector|window\.location|location\.href/i.test(ueSrc),
      'ubereats.js does not use page globals, storage, credential headers, or browser navigation');
    check(fs.existsSync(ubereatsExtPath) ? readSource(ubereatsExtPath) === ueSrc : true,
      'extension/catalog/handlers/ubereats.js matches catalog/handlers/ubereats.js when present');

    const ueRestaurants = makeCtx('https://www.ubereats.com', 190);
    const ueRestaurantsOut = await ue['ubereats.list_restaurants'].handle({
      address: '123 Main St',
      query: 'burger',
      limit: 5
    }, ueRestaurants.ctx);
    check(ueRestaurants.calls.length === 1
      && ueRestaurants.calls[0].spec.method === 'GET'
      && ueRestaurants.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/restaurants?address=123%20Main%20St&query=burger&limit=5'
      && ueRestaurants.calls[0].spec.origin === 'https://www.ubereats.com'
      && ueRestaurants.calls[0].spec.authStrategy === 'same-origin-cookie',
      'ubereats.list_restaurants builds one same-origin restaurants GET spec');
    check(ueRestaurantsOut && ueRestaurantsOut.success === true
      && ueRestaurantsOut.data.restaurants[0].id === 'restaurant-test'
      && ueRestaurantsOut.data.restaurants[0].name === 'Uber Eats Fixture Kitchen',
      'ubereats.list_restaurants maps restaurant summaries');

    const ueMenu = makeCtx('https://www.ubereats.com', 191);
    const ueMenuOut = await ue['ubereats.get_menu'].handle({ restaurant_id: 'restaurant-test' }, ueMenu.ctx);
    check(ueMenu.calls.length === 1
      && ueMenu.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/restaurants/restaurant-test/menu',
      'ubereats.get_menu targets the first-party restaurant menu path');
    check(ueMenuOut && ueMenuOut.success === true
      && ueMenuOut.data.menu[0].item_id === 'item-test'
      && ueMenuOut.data.menu[0].price === 12.5,
      'ubereats.get_menu maps menu item fields');

    const ueOrders = makeCtx('https://www.ubereats.com', 192);
    const ueOrdersOut = await ue['ubereats.list_orders'].handle({ status: 'completed', limit: 3 }, ueOrders.ctx);
    check(ueOrders.calls.length === 1
      && ueOrders.calls[0].spec.url === 'https://www.ubereats.com/eats/v1/orders?status=completed&limit=3',
      'ubereats.list_orders targets the first-party orders path with filters');
    check(ueOrdersOut && ueOrdersOut.success === true
      && ueOrdersOut.data.orders[0].id === 'order-test'
      && ueOrdersOut.data.orders[0].total === '$24.50',
      'ubereats.list_orders maps order summaries');

    const ueBadShape = makeCtx('https://www.ubereats.com', 193, { ubereatsData: { restaurants: [] } });
    const ueBadShapeOut = await ue['ubereats.list_restaurants'].handle({ query: 'missing' }, ueBadShape.ctx);
    check(ueBadShapeOut && ueBadShapeOut.success === false
      && ueBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ueBadShapeOut.reason === 'ubereats-api-shape-mismatch',
      'ubereats.list_restaurants rejects unexpected API shapes');

    const ueNoPrimitive = await ue['ubereats.get_menu'].handle({ restaurant_id: 'restaurant-test' }, {
      origin: 'https://www.ubereats.com',
      tabId: 194
    });
    check(ueNoPrimitive && ueNoPrimitive.success === false
      && ueNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ueNoPrimitive.reason === 'ubereats-execute-bound-spec-unavailable',
      'ubereats.get_menu fails closed when executeBoundSpec is unavailable');

    const ueGuardCalls = [];
    const uePlaceOut = await ue['ubereats.place_order'].handle({
      restaurant_id: 'restaurant-test',
      items: [{ item_id: 'item-test', quantity: 1 }],
      delivery_address: '123 Main St'
    }, {
      origin: 'https://www.ubereats.com',
      tabId: 195,
      async executeBoundSpec() { ueGuardCalls.push('spec'); }
    });
    const ueCancelOut = await ue['ubereats.cancel_order'].handle({ order_id: 'order-test' }, {
      origin: 'https://www.ubereats.com',
      tabId: 196,
      async executeBoundSpec() { ueGuardCalls.push('spec'); }
    });
    check(uePlaceOut && uePlaceOut.success === false
      && uePlaceOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && uePlaceOut.errorCode === uePlaceOut.code
      && uePlaceOut.fellBackToDom === true
      && ueCancelOut && ueCancelOut.success === false
      && ueCancelOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ueCancelOut.errorCode === ueCancelOut.code
      && ueGuardCalls.length === 0,
      'Uber Eats payment and cancellation handlers are guarded fail-closed and call no execution primitive');
  }

  // =========================================================================
  // DoorDash same-origin GraphQL read head -- catalog/handlers/doordash.js
  // =========================================================================
  const doordashPath = path.join(HANDLERS_DIR, 'doordash.js');
  const doordashExtPath = path.join(EXT_HANDLERS_DIR, 'doordash.js');
  check(fs.existsSync(doordashPath), 'catalog/handlers/doordash.js exists');
  if (fs.existsSync(doordashPath)) {
    const dd = require(doordashPath);
    const ddSrc = readSource(doordashPath);
    const doordashReadSlugs = [
      'doordash.get_current_user',
      'doordash.list_addresses',
      'doordash.list_orders',
      'doordash.get_order',
      'doordash.list_payment_methods',
      'doordash.get_notifications'
    ];
    const doordashExcludedSlugs = [
      'doordash.bookmark_store',
      'doordash.mark_notifications_read',
      'doordash.unbookmark_store',
      'doordash.update_default_address',
      'doordash.update_profile'
    ];

    check(doordashReadSlugs.every(function(slug) {
      return dd[slug] && dd[slug].tier === 'T1a'
        && dd[slug].sideEffectClass === 'read'
        && dd[slug].origin === 'https://www.doordash.com'
        && dd[slug].params
        && typeof dd[slug].handle === 'function';
    }), 'DoorDash account/order/payment/notification descriptors are T1a reads pinned to www.doordash.com');
    check(doordashExcludedSlugs.every(function(slug) {
      return !dd[slug] && ddSrc.indexOf("'" + slug + "'") === -1 && ddSrc.indexOf('"' + slug + '"') === -1;
    }), 'DoorDash favorite/profile/default-address/notification mutations stay in the discovery tail');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(ddSrc),
      'doordash.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(ddSrc),
      'doordash.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage|getCookie|getLocalStorage|Authorization|Bearer|window\.location|location\.href|bookmarkStore|unbookmarkStore|updateConsumerDefaultAddressV2|updateConsumerProfileInformation|updateNotificationReadStatus/i.test(ddSrc),
      'doordash.js does not use page storage, credential headers, navigation, or mutation operations');
    check(fs.existsSync(doordashExtPath) ? readSource(doordashExtPath) === ddSrc : true,
      'extension/catalog/handlers/doordash.js matches catalog/handlers/doordash.js when present');
    check(doordashReadSlugs.every(function(slug) {
      const descriptorName = 'opentabs__' + slug.replace('.', '__') + '.json';
      return readJson(path.join(DESCRIPTORS_DIR, descriptorName)).backing === 'handler';
    }), 'promoted DoorDash descriptors are handler-backed');

    const ddUser = makeCtx('https://www.doordash.com', 190);
    const ddUserOut = await dd['doordash.get_current_user'].handle({}, ddUser.ctx);
    const ddUserBody = ddUser.calls.length ? parseSpecBody(ddUser.calls[0].spec) : {};
    check(ddUser.calls.length === 1
      && ddUser.calls[0].spec.method === 'POST'
      && ddUser.calls[0].spec.url === 'https://www.doordash.com/graphql/consumer'
      && ddUser.calls[0].spec.origin === 'https://www.doordash.com'
      && ddUser.calls[0].spec.authStrategy === 'same-origin-cookie'
      && ddUser.calls[0].spec.csrfSource
      && ddUser.calls[0].spec.csrfSource.selector === 'csrf_token'
      && ddUser.calls[0].spec.csrfSource.header === 'x-csrftoken'
      && ddUser.calls[0].spec.headers['x-channel-id'] === 'marketplace'
      && ddUser.calls[0].spec.headers['x-experience-id'] === 'doordash'
      && ddUserBody.operationName === 'consumer',
      'doordash.get_current_user builds one same-origin GraphQL spec with CSRF metadata');
    check(ddUserOut && ddUserOut.success === true
      && ddUserOut.data.consumer.id === 'consumer-test'
      && ddUserOut.data.consumer.email === 'doordash@example.invalid'
      && ddUserOut.data.consumer.default_address.zip_code === '40202',
      'doordash.get_current_user maps consumer profile fields');

    const ddAddresses = makeCtx('https://www.doordash.com', 191);
    const ddAddressesOut = await dd['doordash.list_addresses'].handle({}, ddAddresses.ctx);
    const ddAddressBody = ddAddresses.calls.length ? parseSpecBody(ddAddresses.calls[0].spec) : {};
    check(ddAddresses.calls.length === 1
      && ddAddresses.calls[0].spec.url === 'https://www.doordash.com/graphql/getAvailableAddresses'
      && ddAddressBody.operationName === 'getAvailableAddresses',
      'doordash.list_addresses targets getAvailableAddresses');
    check(ddAddressesOut && ddAddressesOut.success === true
      && ddAddressesOut.data.addresses[0].address_id === 'address-id-test'
      && ddAddressesOut.data.addresses[0].driver_instructions === 'Leave at door',
      'doordash.list_addresses maps saved addresses');

    const ddOrders = makeCtx('https://www.doordash.com', 192);
    const ddOrdersOut = await dd['doordash.list_orders'].handle({
      offset: 2,
      limit: 5,
      include_cancelled: false
    }, ddOrders.ctx);
    const ddOrdersBody = ddOrders.calls.length ? parseSpecBody(ddOrders.calls[0].spec) : {};
    check(ddOrders.calls.length === 1
      && ddOrders.calls[0].spec.url === 'https://www.doordash.com/graphql/getConsumerOrdersWithDetails'
      && ddOrdersBody.operationName === 'getConsumerOrdersWithDetails'
      && ddOrdersBody.variables.offset === 2
      && ddOrdersBody.variables.limit === 5
      && ddOrdersBody.variables.includeCancelled === false,
      'doordash.list_orders targets getConsumerOrdersWithDetails with bounded pagination variables');
    check(ddOrdersOut && ddOrdersOut.success === true
      && ddOrdersOut.data.orders[0].id === 'order-test'
      && ddOrdersOut.data.orders[0].items[0].name === 'Fixture Bowl'
      && ddOrdersOut.data.orders[0].grand_total_display === '$27.88',
      'doordash.list_orders maps order history fields');

    const ddOrder = makeCtx('https://www.doordash.com', 193);
    const ddOrderOut = await dd['doordash.get_order'].handle({ order_id: 'order-test' }, ddOrder.ctx);
    const ddOrderBody = ddOrder.calls.length ? parseSpecBody(ddOrder.calls[0].spec) : {};
    check(ddOrder.calls.length === 1
      && ddOrder.calls[0].spec.url === 'https://www.doordash.com/graphql/getConsumerOrdersWithDetails'
      && ddOrderBody.variables.offset === 0
      && ddOrderBody.variables.limit === 20
      && ddOrderBody.variables.includeCancelled === true,
      'doordash.get_order searches recent order history through the same-origin GraphQL read');
    check(ddOrderOut && ddOrderOut.success === true
      && ddOrderOut.data.order.id === 'order-test'
      && ddOrderOut.data.order.store_name === 'DoorDash Fixture Kitchen',
      'doordash.get_order maps the matching order detail');

    const ddPayments = makeCtx('https://www.doordash.com', 194);
    const ddPaymentsOut = await dd['doordash.list_payment_methods'].handle({}, ddPayments.ctx);
    check(ddPayments.calls.length === 1
      && parseSpecBody(ddPayments.calls[0].spec).operationName === 'getPaymentMethodList',
      'doordash.list_payment_methods targets getPaymentMethodList');
    check(ddPaymentsOut && ddPaymentsOut.success === true
      && ddPaymentsOut.data.payment_methods[0].id === 'payment-test'
      && ddPaymentsOut.data.payment_methods[0].last4 === '4242',
      'doordash.list_payment_methods maps saved payment methods');

    const ddNotifications = makeCtx('https://www.doordash.com', 195);
    const ddNotificationsOut = await dd['doordash.get_notifications'].handle({}, ddNotifications.ctx);
    check(ddNotifications.calls.length === 1
      && parseSpecBody(ddNotifications.calls[0].spec).operationName === 'getHasNewNotifications',
      'doordash.get_notifications targets getHasNewNotifications');
    check(ddNotificationsOut && ddNotificationsOut.success === true
      && ddNotificationsOut.data.status.has_new_notifications === true
      && ddNotificationsOut.data.status.num_unread_notifications === 3,
      'doordash.get_notifications maps notification status');

    const ddBadShape = makeCtx('https://www.doordash.com', 196, { doordashData: { data: { consumer: null } } });
    const ddBadShapeOut = await dd['doordash.get_current_user'].handle({}, ddBadShape.ctx);
    check(ddBadShapeOut && ddBadShapeOut.success === false
      && ddBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ddBadShapeOut.reason === 'doordash-graphql-shape-mismatch',
      'doordash.get_current_user rejects unexpected GraphQL shapes');

    const ddNoPrimitive = await dd['doordash.get_order'].handle({ order_id: 'order-test' }, {
      origin: 'https://www.doordash.com',
      tabId: 197
    });
    check(ddNoPrimitive && ddNoPrimitive.success === false
      && ddNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ddNoPrimitive.reason === 'doordash-execute-bound-spec-unavailable',
      'doordash.get_order fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Hack2Hire storage-bearer read head -- catalog/handlers/hack2hire.js
  // =========================================================================
  const hack2hirePath = path.join(HANDLERS_DIR, 'hack2hire.js');
  check(fs.existsSync(hack2hirePath), 'catalog/handlers/hack2hire.js exists');
  if (fs.existsSync(hack2hirePath)) {
    const h2h = require(hack2hirePath);
    const h2hSrc = readSource(hack2hirePath);
    const hack2hireReadSlugs = [
      'hack2hire.get_comment',
      'hack2hire.get_company_question_stats',
      'hack2hire.get_completed_question_count',
      'hack2hire.get_current_user',
      'hack2hire.get_question',
      'hack2hire.get_question_neighbors',
      'hack2hire.get_subscription',
      'hack2hire.list_comment_replies',
      'hack2hire.list_companies',
      'hack2hire.list_my_bookmarks',
      'hack2hire.list_my_visits',
      'hack2hire.list_question_coding_problems',
      'hack2hire.list_question_comments',
      'hack2hire.list_questions'
    ];

    check(hack2hireReadSlugs.every(function(slug) {
      return h2h[slug] && h2h[slug].tier === 'T1a'
        && h2h[slug].sideEffectClass === 'read'
        && h2h[slug].origin === 'https://www.hack2hire.com'
        && h2h[slug].params
        && typeof h2h[slug].handle === 'function';
    }), 'all 14 Hack2Hire descriptors are tier:T1a READ entries pinned to www.hack2hire.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(h2hSrc),
      'hack2hire.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(h2hSrc),
      'hack2hire.js performs no direct network call');
    check(!/document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(h2hSrc),
      'hack2hire.js does not directly read cookies or page storage');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|user[-_]?id)\b/i.test(h2hSrc),
      'hack2hire.js does NOT console-log a secret-bearing variable');

    const h2hCalls = [];
    const h2hCtx = {
      origin: 'https://www.hack2hire.com',
      tabId: 178,
      async executeBoundSpec(spec, tabId) {
        h2hCalls.push({ spec: spec, tabId: tabId });
        return {
          success: true,
          status: 200,
          data: {
            data: { data: [], total: 0, page: 2, perPage: 5 },
            status: { code: 200, message: 'OK' }
          }
        };
      }
    };
    const h2hListOut = await h2h['hack2hire.list_questions'].handle({
      companyTags: 'AMAZON',
      page: 2,
      perPage: 5
    }, h2hCtx);
    const h2hListUrl = h2hCalls.length ? new URL(h2hCalls[0].spec.url) : null;
    check(h2hCalls.length === 1
      && h2hCalls[0].tabId === 178
      && h2hCalls[0].spec.method === 'GET'
      && h2hCalls[0].spec.origin === 'https://www.hack2hire.com'
      && h2hCalls[0].spec.url.indexOf('https://api.hack2hire.com/algro/v1/post/filter') === 0
      && h2hCalls[0].spec.credentials === 'omit'
      && h2hCalls[0].spec.authStrategy === 'none'
      && h2hCalls[0].spec._authNeed
      && h2hCalls[0].spec._authNeed.kind === 'bearer'
      && h2hCalls[0].spec._authNeed.tokenKey === 'ALGRO_TOKEN'
      && h2hCalls[0].spec._authNeed.extraHeaders[0].storageKey === 'USER_ID',
      'hack2hire.list_questions builds one storage-bearer GET spec pinned to www.hack2hire.com');
    check(h2hListUrl
      && h2hListUrl.searchParams.get('companyTags') === 'AMAZON'
      && h2hListUrl.searchParams.get('page') === '2'
      && h2hListUrl.searchParams.get('perPage') === '5',
      'hack2hire.list_questions maps filters and pagination into the API query string');
    check(h2hListOut && h2hListOut.success === true
      && h2hListOut.status === 200
      && h2hListOut.data.total === 0
      && h2hListOut.data.page === 2
      && h2hListOut.data.perPage === 5,
      'hack2hire.list_questions unwraps the Hack2Hire envelope data');

    const h2hNoPrimitive = await h2h['hack2hire.get_current_user'].handle({}, {
      origin: 'https://www.hack2hire.com',
      tabId: 179
    });
    check(h2hNoPrimitive && h2hNoPrimitive.success === false
      && h2hNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && h2hNoPrimitive.reason === 'hack2hire-execute-bound-spec-unavailable',
      'hack2hire.get_current_user fails closed when executeBoundSpec is unavailable');

    const h2hCommentCalls = [];
    const h2hCommentOut = await h2h['hack2hire.list_question_comments'].handle({}, {
      origin: 'https://www.hack2hire.com',
      tabId: 180,
      async executeBoundSpec(spec, tabId) {
        h2hCommentCalls.push({ spec: spec, tabId: tabId });
        return { success: true, status: 200, data: { data: [], status: { code: 200 } } };
      }
    });
    check(h2hCommentCalls.length === 0
      && h2hCommentOut && h2hCommentOut.success === false
      && h2hCommentOut.reason === 'hack2hire-comment-target-required',
      'hack2hire.list_question_comments requires a postId or codingQuestionId before dispatch');
  }

  // =========================================================================
  // ChatGPT same-origin backend-api read head -- catalog/handlers/chatgpt.js
  // =========================================================================
  const chatgptPath = path.join(HANDLERS_DIR, 'chatgpt.js');
  check(fs.existsSync(chatgptPath), 'catalog/handlers/chatgpt.js exists');
  if (fs.existsSync(chatgptPath)) {
    const cgpt = require(chatgptPath);
    const cgptSrc = readSource(chatgptPath);
    const chatgptReadSlugs = [
      'chatgpt.discover_gpts',
      'chatgpt.get_account_info',
      'chatgpt.get_beta_features',
      'chatgpt.get_conversation',
      'chatgpt.get_current_user',
      'chatgpt.get_custom_instructions',
      'chatgpt.get_gpt',
      'chatgpt.get_memories',
      'chatgpt.get_prompt_library',
      'chatgpt.list_conversations',
      'chatgpt.list_models',
      'chatgpt.list_shared_conversations',
      'chatgpt.search_conversations'
    ];
    const chatgptExcludedSlugs = [
      'chatgpt.archive_conversation',
      'chatgpt.delete_conversation',
      'chatgpt.rename_conversation',
      'chatgpt.star_conversation',
      'chatgpt.unarchive_conversation',
      'chatgpt.unstar_conversation',
      'chatgpt.update_custom_instructions'
    ];

    check(chatgptReadSlugs.every(function(slug) {
      return cgpt[slug] && cgpt[slug].tier === 'T1a'
        && cgpt[slug].sideEffectClass === 'read'
        && cgpt[slug].origin === 'https://chatgpt.com'
        && cgpt[slug].params
        && typeof cgpt[slug].handle === 'function';
    }), 'ChatGPT GET descriptors are T1a reads pinned to chatgpt.com');
    check(chatgptExcludedSlugs.every(function(slug) {
      return !cgpt[slug] && cgptSrc.indexOf("'" + slug + "'") === -1 && cgptSrc.indexOf('"' + slug + '"') === -1;
    }), 'ChatGPT conversation and custom-instruction mutations stay out of the active T1 head');

    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(cgptSrc),
      'chatgpt.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(cgptSrc),
      'chatgpt.js performs no direct network call');
    check(!/console\.\w+\([^)]*(accessToken|Authorization|Bearer|token|secret|cookie)/i.test(cgptSrc),
      'chatgpt.js does not console-log token-bearing values');

    const cgptList = makeCtx('https://chatgpt.com', 173);
    const cgptListOut = await cgpt['chatgpt.list_conversations'].handle({
      offset: 5,
      limit: 3,
      order: 'created'
    }, cgptList.ctx);
    check(cgptList.calls.length === 2
      && cgptList.calls[0].spec.url === 'https://chatgpt.com/api/auth/session'
      && cgptList.calls[0].spec.origin === 'https://chatgpt.com'
      && cgptList.calls[1].spec.url === 'https://chatgpt.com/backend-api/conversations?offset=5&limit=3&order=created'
      && cgptList.calls[1].spec.origin === 'https://chatgpt.com'
      && cgptList.calls[1].spec.headers.Authorization === 'Bearer chatgpt-token-synthetic',
      'chatgpt.list_conversations fetches same-origin session token then calls backend-api with a pinned spec');
    check(cgptListOut && cgptListOut.success === true
      && cgptListOut.data.total === 1
      && cgptListOut.data.conversations[0].id === 'conversation-test'
      && cgptListOut.data.conversations[0].is_starred === true,
      'chatgpt.list_conversations maps conversation list rows');

    const cgptConversation = makeCtx('https://chatgpt.com', 174);
    const cgptConversationOut = await cgpt['chatgpt.get_conversation'].handle({
      conversation_id: 'conversation-test'
    }, cgptConversation.ctx);
    check(cgptConversation.calls.length === 2
      && cgptConversation.calls[1].spec.url === 'https://chatgpt.com/backend-api/conversation/conversation-test',
      'chatgpt.get_conversation targets the backend conversation endpoint');
    check(cgptConversationOut && cgptConversationOut.success === true
      && cgptConversationOut.data.conversation.id === 'conversation-test'
      && cgptConversationOut.data.conversation.messages.length === 2
      && cgptConversationOut.data.conversation.messages[1].text === 'Hi from ChatGPT',
      'chatgpt.get_conversation maps the active conversation branch');

    const cgptSearch = makeCtx('https://chatgpt.com', 175);
    const cgptSearchOut = await cgpt['chatgpt.search_conversations'].handle({
      query: 'fixture',
      limit: 2
    }, cgptSearch.ctx);
    check(cgptSearch.calls.length === 2
      && cgptSearch.calls[1].spec.url === 'https://chatgpt.com/backend-api/conversations/search?query=fixture&limit=2',
      'chatgpt.search_conversations builds a bounded search endpoint URL');
    check(cgptSearchOut && cgptSearchOut.success === true
      && cgptSearchOut.data.cursor === 'cursor-next'
      && cgptSearchOut.data.conversations[0].snippet === 'Search snippet',
      'chatgpt.search_conversations maps search result snippets');

    const cgptNoSession = makeCtx('https://chatgpt.com', 176, { chatgptSessionData: {} });
    const cgptNoSessionOut = await cgpt['chatgpt.list_models'].handle({}, cgptNoSession.ctx);
    check(cgptNoSessionOut && cgptNoSessionOut.success === false
      && cgptNoSessionOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cgptNoSessionOut.reason === 'chatgpt-not-authenticated'
      && cgptNoSession.calls.length === 1,
      'chatgpt.list_models fails closed when the same-origin session endpoint lacks an access token');

    const cgptBadShape = makeCtx('https://chatgpt.com', 177, { chatgptData: { models: null } });
    const cgptBadShapeOut = await cgpt['chatgpt.list_models'].handle({}, cgptBadShape.ctx);
    check(cgptBadShapeOut && cgptBadShapeOut.success === false
      && cgptBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cgptBadShapeOut.reason === 'chatgpt-backend-shape-mismatch',
      'chatgpt.list_models rejects unexpected backend-api shapes');
  }

  // =========================================================================
  // Claude same-origin API read + guarded mutation head -- catalog/handlers/claude.js
  // =========================================================================
  const claudePath = path.join(HANDLERS_DIR, 'claude.js');
  check(fs.existsSync(claudePath), 'catalog/handlers/claude.js exists');
  if (fs.existsSync(claudePath)) {
    try { delete require.cache[require.resolve(claudePath)]; } catch (e) { /* not cached */ }
    const claude = require(claudePath);
    const claudeSrc = readSource(claudePath);
    const claudeReadSlugs = [
      'claude.get_conversation',
      'claude.get_current_user',
      'claude.get_project',
      'claude.list_conversations',
      'claude.list_models',
      'claude.list_organizations',
      'claude.list_projects'
    ];
    const claudeGuardedSlugs = [
      'claude.create_conversation',
      'claude.create_project',
      'claude.delete_conversation',
      'claude.delete_project',
      'claude.send_message',
      'claude.update_conversation',
      'claude.update_project'
    ];

    check(claudeReadSlugs.every(function(slug) {
      return claude[slug] && claude[slug].tier === 'T1a'
        && claude[slug].sideEffectClass === 'read'
        && claude[slug].origin === 'https://claude.ai'
        && claude[slug].params
        && typeof claude[slug].handle === 'function';
    }), 'Claude read descriptors are T1a reads pinned to claude.ai');
    check(claudeGuardedSlugs.every(function(slug) {
      return claude[slug] && claude[slug].tier === 'T1a'
        && (claude[slug].sideEffectClass === 'write' || claude[slug].sideEffectClass === 'destructive')
        && claude[slug].origin === 'https://claude.ai'
        && claude[slug].params
        && typeof claude[slug].handle === 'function';
    }), 'Claude mutation/destructive descriptors are guarded T1a entries pinned to claude.ai');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(claudeSrc),
      'claude.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(claudeSrc),
      'claude.js performs no direct network call');
    check(!/document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(claudeSrc),
      'claude.js does not directly read cookies or page storage');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer|user[-_]?id)/i.test(claudeSrc),
      'claude.js does not console-log token-bearing values');

    function makeClaudeCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        ctx: {
          origin: 'https://claude.ai',
          tabId: options.tabId || 181,
          async executeBoundSpec(spec, tabId) {
            calls.push({ spec: spec, tabId: tabId });
            if (spec.url === 'https://claude.ai/api/organizations') {
              if (options.badOrganizations) {
                return { success: true, status: 200, data: { organizations: [] } };
              }
              return {
                success: true,
                status: 200,
                data: [{
                  uuid: 'org-1',
                  name: 'Acme',
                  billing_type: 'team',
                  capabilities: ['chat'],
                  rate_limit_tier: 'standard',
                  created_at: '2026-01-01T00:00:00Z'
                }]
              };
            }
            if (spec.url === 'https://claude.ai/api/bootstrap/org-1/app_start') {
              return {
                success: true,
                status: 200,
                data: {
                  account: {
                    uuid: 'acct-1',
                    email_address: 'ada@example.com',
                    full_name: 'Ada Lovelace',
                    display_name: 'Ada',
                    created_at: '2026-01-02T00:00:00Z',
                    is_verified: true,
                    memberships: [{
                      organization: {
                        uuid: 'org-1',
                        claude_ai_bootstrap_models_config: [
                          { model: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Fast model' }
                        ]
                      }
                    }]
                  }
                }
              };
            }
            if (spec.url === 'https://claude.ai/api/organizations/org-1/chat_conversations') {
              return { success: true, status: 200, data: [{ uuid: 'convo-1', name: 'Launch', model: 'claude-sonnet-4-6', is_starred: true }] };
            }
            if (spec.url === 'https://claude.ai/api/organizations/org-1/chat_conversations/convo-1?tree=True&rendering_mode=messages') {
              return {
                success: true,
                status: 200,
                data: {
                  uuid: 'convo-1',
                  name: 'Launch',
                  model: 'claude-sonnet-4-6',
                  chat_messages: [
                    { uuid: 'msg-1', sender: 'human', index: 0, text: 'Hello' },
                    { uuid: 'msg-2', sender: 'assistant', index: 1, content: [{ type: 'text', text: 'Hi from Claude' }] }
                  ]
                }
              };
            }
            if (spec.url === 'https://claude.ai/api/organizations/org-1/projects') {
              return { success: true, status: 200, data: [{ uuid: 'project-1', name: 'Research', docs_count: 2, files_count: 1 }] };
            }
            if (spec.url === 'https://claude.ai/api/organizations/org-1/projects/project-1') {
              return { success: true, status: 200, data: { uuid: 'project-1', name: 'Research', description: 'Notes', docs_count: 2, files_count: 1 } };
            }
            return { success: true, status: 200, data: {} };
          }
        }
      };
    }

    const claudeList = makeClaudeCtx({ tabId: 182 });
    const claudeListOut = await claude['claude.list_conversations'].handle({}, claudeList.ctx);
    check(claudeList.calls.length === 2
      && claudeList.calls[0].spec.url === 'https://claude.ai/api/organizations'
      && claudeList.calls[0].spec.authStrategy === 'same-origin-cookie'
      && claudeList.calls[0].spec.origin === 'https://claude.ai'
      && claudeList.calls[1].spec.url === 'https://claude.ai/api/organizations/org-1/chat_conversations'
      && claudeList.calls[1].tabId === 182,
      'claude.list_conversations resolves the organization and calls the first-party conversations endpoint');
    check(claudeListOut && claudeListOut.success === true
      && claudeListOut.data.conversations[0].uuid === 'convo-1'
      && claudeListOut.data.conversations[0].is_starred === true,
      'claude.list_conversations maps conversation list rows');

    const claudeConversation = makeClaudeCtx({ tabId: 183 });
    const claudeConversationOut = await claude['claude.get_conversation'].handle({ conversation_uuid: 'convo-1' }, claudeConversation.ctx);
    check(claudeConversation.calls.length === 2
      && claudeConversation.calls[1].spec.url === 'https://claude.ai/api/organizations/org-1/chat_conversations/convo-1?tree=True&rendering_mode=messages',
      'claude.get_conversation targets the org-scoped conversation messages endpoint');
    check(claudeConversationOut && claudeConversationOut.success === true
      && claudeConversationOut.data.uuid === 'convo-1'
      && claudeConversationOut.data.messages[1].text === 'Hi from Claude',
      'claude.get_conversation maps conversation messages');

    const claudeModels = makeClaudeCtx({ tabId: 184 });
    const claudeModelsOut = await claude['claude.list_models'].handle({}, claudeModels.ctx);
    check(claudeModels.calls.length === 2
      && claudeModels.calls[1].spec.url === 'https://claude.ai/api/bootstrap/org-1/app_start'
      && claudeModelsOut && claudeModelsOut.success === true
      && claudeModelsOut.data.models[0].model === 'claude-sonnet-4-6',
      'claude.list_models reads bootstrap model config for the selected organization');

    const claudeProject = makeClaudeCtx({ tabId: 185 });
    const claudeProjectOut = await claude['claude.get_project'].handle({ project_uuid: 'project-1' }, claudeProject.ctx);
    check(claudeProject.calls.length === 2
      && claudeProject.calls[1].spec.url === 'https://claude.ai/api/organizations/org-1/projects/project-1'
      && claudeProjectOut && claudeProjectOut.success === true
      && claudeProjectOut.data.project.uuid === 'project-1',
      'claude.get_project maps the org-scoped project endpoint');

    const claudeNoPrimitive = await claude['claude.list_projects'].handle({}, {});
    check(claudeNoPrimitive && claudeNoPrimitive.success === false
      && claudeNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && claudeNoPrimitive.reason === 'claude-execute-bound-spec-unavailable',
      'claude.list_projects fails closed when executeBoundSpec is unavailable');

    const claudeBadOrg = makeClaudeCtx({ badOrganizations: true });
    const claudeBadOrgOut = await claude['claude.list_conversations'].handle({}, claudeBadOrg.ctx);
    check(claudeBadOrgOut && claudeBadOrgOut.success === false
      && claudeBadOrgOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && claudeBadOrgOut.reason === 'claude-organizations-shape-mismatch',
      'claude org-scoped reads fail closed when organizations shape is unexpected');

    const claudeGuardCalls = [];
    const claudeGuard = await claude['claude.send_message'].handle({ conversation_uuid: 'convo-1', message: 'Hello' }, {
      tabId: 186,
      async executeBoundSpec() { claudeGuardCalls.push('spec'); }
    });
    check(claudeGuard && claudeGuard.success === false
      && claudeGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && claudeGuard.errorCode === claudeGuard.code
      && claudeGuard.fellBackToDom === true
      && claudeGuardCalls.length === 0,
      'claude.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Excel Online Microsoft Graph read + guarded mutation head -- catalog/handlers/excel.js
  // =========================================================================
  const excelPath = path.join(HANDLERS_DIR, 'excel.js');
  check(fs.existsSync(excelPath), 'catalog/handlers/excel.js exists');
  if (fs.existsSync(excelPath)) {
    const excel = require(excelPath);
    const excelSrc = readSource(excelPath);
    const excelReadSlugs = [
      'excel.get_current_user',
      'excel.get_range',
      'excel.get_table_columns',
      'excel.get_table_rows',
      'excel.get_used_range',
      'excel.get_workbook_info',
      'excel.list_charts',
      'excel.list_named_items',
      'excel.list_tables',
      'excel.list_worksheets'
    ];
    const excelGuardedSlugs = [
      'excel.add_named_item',
      'excel.add_table_column',
      'excel.add_table_row',
      'excel.add_worksheet',
      'excel.calculate_workbook',
      'excel.clear_range',
      'excel.create_chart',
      'excel.create_table',
      'excel.delete_chart',
      'excel.delete_range',
      'excel.delete_table',
      'excel.delete_table_row',
      'excel.delete_worksheet',
      'excel.evaluate_formula',
      'excel.insert_range',
      'excel.reauthenticate',
      'excel.sort_range',
      'excel.update_range',
      'excel.update_worksheet'
    ];

    check(excelReadSlugs.every(function(slug) {
      return excel[slug] && excel[slug].tier === 'T1a'
        && excel[slug].sideEffectClass === 'read'
        && excel[slug].origin === 'https://excel.cloud.microsoft'
        && excel[slug].params
        && typeof excel[slug].handle === 'function';
    }), 'Excel read descriptors are T1a reads pinned to excel.cloud.microsoft');
    check(excelGuardedSlugs.every(function(slug) {
      return excel[slug] && excel[slug].tier === 'T1a'
        && (excel[slug].sideEffectClass === 'write' || excel[slug].sideEffectClass === 'destructive')
        && excel[slug].origin === 'https://excel.cloud.microsoft'
        && excel[slug].params
        && typeof excel[slug].handle === 'function';
    }), 'Excel write/destructive/auth-cache descriptors are registered as guarded T1a entries');
    check(excel['excel.reauthenticate'].sideEffectClass === 'write',
      'excel.reauthenticate is side-effecting because it clears auth cache and reloads the tab');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(excelSrc),
      'excel.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(excelSrc),
      'excel.js performs no direct network call');
    check(!/localStorage|sessionStorage|document\.cookie/.test(excelSrc),
      'excel.js does not read page storage or cookies directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(excelSrc),
      'excel.js does NOT console-log a secret-bearing variable');

    function makeExcelCtx(origin, pageData) {
      const pageCalls = [];
      const specCalls = [];
      return {
        pageCalls,
        specCalls,
        ctx: {
          origin: origin || 'https://excel.cloud.microsoft',
          tabId: 187,
          async executeBoundPageRead(request, tabId) {
            pageCalls.push({ request: request, tabId: tabId });
            return { success: true, status: 200, data: pageData || {
              graph_token: 'excel-token-TEST-SYNTHETIC',
              drive_id: 'drive-TEST',
              item_id: 'item-TEST'
            } };
          },
          async executeBoundSpec(spec, tabId) {
            specCalls.push({ spec: spec, tabId: tabId });
            const url = spec && typeof spec.url === 'string' ? spec.url : '';
            if (url.indexOf('https://graph.microsoft.com/v1.0/me') === 0) {
              return { success: true, status: 200, data: {
                id: 'excel-user',
                displayName: 'Excel User',
                mail: 'excel@example.invalid',
                userPrincipalName: 'fallback@example.invalid'
              } };
            }
            if (url.indexOf('/range(') !== -1) {
              return { success: true, status: 200, data: {
                address: 'Sheet1!A1:B2',
                rowCount: 2,
                columnCount: 2,
                values: [[1, 2], [3, 4]],
                formulas: [['', ''], ['', '']],
                text: [['1', '2'], ['3', '4']],
                numberFormat: [['0', '0'], ['0', '0']]
              } };
            }
            if (url.indexOf('/tables(') !== -1 && url.indexOf('/rows') !== -1) {
              return { success: true, status: 200, data: { value: [{ index: 0, values: [['A', 'B']] }] } };
            }
            if (url.indexOf('/shares/') !== -1) {
              return { success: true, status: 200, data: {
                id: 'item-SP',
                name: 'Shared.xlsx',
                parentReference: { driveId: 'drive-SP' }
              } };
            }
            if (url.indexOf('/worksheets') !== -1) {
              return { success: true, status: 200, data: { value: [{
                id: 'sheet-1',
                name: 'Sheet1',
                position: 0,
                visibility: 'Visible'
              }] } };
            }
            return { success: true, status: 200, data: { id: 'item-TEST', name: 'Book.xlsx', parentReference: { driveId: 'drive-TEST' } } };
          }
        }
      };
    }

    const excelUser = makeExcelCtx();
    const excelUserOut = await excel['excel.get_current_user'].handle({}, excelUser.ctx);
    check(excelUser.pageCalls.length === 1
      && excelUser.pageCalls[0].request.origin === 'https://excel.cloud.microsoft'
      && excelUser.pageCalls[0].request.namespace === 'excel'
      && excelUser.pageCalls[0].request.action === 'auth_context',
      'excel.get_current_user obtains auth only through bounded Excel page-read');
    check(excelUser.specCalls.length === 1
      && excelUser.specCalls[0].spec.method === 'GET'
      && excelUser.specCalls[0].spec.origin === 'https://excel.cloud.microsoft'
      && excelUser.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/me') === 0
      && excelUser.specCalls[0].spec.headers.Authorization === 'Bearer excel-token-TEST-SYNTHETIC'
      && excelUser.specCalls[0].spec.authStrategy === 'none'
      && excelUser.specCalls[0].spec.credentials === 'omit',
      'excel.get_current_user builds a read-only Microsoft Graph GET spec pinned to the Excel page origin');
    check(excelUserOut && excelUserOut.success === true
      && excelUserOut.data.user.id === 'excel-user'
      && excelUserOut.data.user.display_name === 'Excel User'
      && excelUserOut.data.user.email === 'excel@example.invalid'
      && JSON.stringify(excelUserOut).indexOf('excel-token-TEST-SYNTHETIC') === -1,
      'excel.get_current_user maps user data without returning token material');

    const excelRange = makeExcelCtx();
    const excelRangeOut = await excel['excel.get_range'].handle({ worksheet: 'Sheet1', address: 'A1:B2' }, excelRange.ctx);
    const excelRangeUrl = excelRange.specCalls.length ? new URL(excelRange.specCalls[0].spec.url) : null;
    check(excelRange.specCalls.length === 1
      && excelRangeUrl
      && excelRangeUrl.pathname === "/v1.0/drives/drive-TEST/items/item-TEST/workbook/worksheets('Sheet1')/range(address='A1%3AB2')",
      'excel.get_range targets the workbook range endpoint with encoded worksheet and A1 address');
    check(excelRangeOut && excelRangeOut.success === true
      && excelRangeOut.data.range.address === 'Sheet1!A1:B2'
      && excelRangeOut.data.range.values[1][1] === 4
      && excelRangeOut.data.range.number_format[0][0] === '0',
      'excel.get_range maps range values, text, formulas, and number formats');

    const excelRows = makeExcelCtx();
    const excelRowsOut = await excel['excel.get_table_rows'].handle({ table: 'Table1' }, excelRows.ctx);
    check(excelRows.specCalls.length === 1
      && excelRows.specCalls[0].spec.url.indexOf("/workbook/tables('Table1')/rows") !== -1
      && excelRowsOut && excelRowsOut.success === true
      && excelRowsOut.data.rows[0].values[0][0] === 'A',
      'excel.get_table_rows targets the table rows endpoint and maps rows');

    const excelShare = makeExcelCtx('https://tenant.sharepoint.com', {
      graph_token: 'excel-token-TEST-SYNTHETIC',
      sharing_url: 'https://tenant.sharepoint.com/:x:/r/sites/team/Shared%20Documents/Book.xlsx'
    });
    const excelShareOut = await excel['excel.list_worksheets'].handle({}, excelShare.ctx);
    check(excelShare.pageCalls.length === 1
      && excelShare.pageCalls[0].request.origin === 'https://tenant.sharepoint.com'
      && excelShare.specCalls.length === 2
      && excelShare.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/shares/u!') === 0
      && excelShare.specCalls[0].spec.origin === 'https://tenant.sharepoint.com'
      && excelShare.specCalls[1].spec.url.indexOf('/drives/drive-SP/items/item-SP/workbook/worksheets') !== -1
      && excelShare.specCalls[1].spec.origin === 'https://tenant.sharepoint.com',
      'excel.list_worksheets resolves SharePoint workbook context then pins Graph GETs to the active SharePoint origin');
    check(excelShareOut && excelShareOut.success === true
      && excelShareOut.data.worksheets[0].name === 'Sheet1',
      'excel.list_worksheets maps worksheet rows after SharePoint context resolution');

    const excelBadShape = makeExcelCtx('https://excel.cloud.microsoft', {
      graph_token: 'excel-token-TEST-SYNTHETIC',
      drive_id: 'drive-TEST',
      item_id: 'item-TEST'
    });
    excelBadShape.ctx.executeBoundSpec = async function(spec, tabId) {
      excelBadShape.specCalls.push({ spec: spec, tabId: tabId });
      return { success: true, status: 200, data: { error: { message: 'login required' } } };
    };
    const excelBadShapeOut = await excel['excel.list_worksheets'].handle({}, excelBadShape.ctx);
    check(excelBadShapeOut && excelBadShapeOut.success === false
      && excelBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && excelBadShapeOut.reason === 'excel-graph-shape-mismatch',
      'excel.list_worksheets rejects Graph error envelopes');

    const excelGuard = makeExcelCtx();
    const excelGuardOut = await excel['excel.update_range'].handle({
      worksheet: 'Sheet1',
      address: 'A1',
      values: [['x']]
    }, excelGuard.ctx);
    const excelReauthOut = await excel['excel.reauthenticate'].handle({}, excelGuard.ctx);
    check(excelGuard.pageCalls.length === 0
      && excelGuard.specCalls.length === 0
      && excelGuardOut && excelGuardOut.success === false
      && excelGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && excelGuardOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && excelGuardOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && excelGuardOut.fellBackToDom === true
      && excelReauthOut && excelReauthOut.reason === 'unverified-excel-reauthenticate-cache-clear-reload',
      'excel.update_range and excel.reauthenticate are guarded fail-closed and call no execution primitive');
  }

  // =========================================================================
  // PowerPoint Microsoft Graph read + guarded mutation head -- catalog/handlers/powerpoint.js
  // =========================================================================
  const powerpointPath = path.join(HANDLERS_DIR, 'powerpoint.js');
  check(fs.existsSync(powerpointPath), 'catalog/handlers/powerpoint.js exists');
  if (fs.existsSync(powerpointPath)) {
    const ppt = require(powerpointPath);
    const pptSrc = readSource(powerpointPath);
    const powerpointReadSlugs = [
      'powerpoint.get_current_user',
      'powerpoint.get_download_url',
      'powerpoint.get_drive',
      'powerpoint.get_item',
      'powerpoint.get_slide_content',
      'powerpoint.get_slide_notes',
      'powerpoint.get_slides',
      'powerpoint.get_thumbnails',
      'powerpoint.list_children',
      'powerpoint.list_permissions',
      'powerpoint.list_recent',
      'powerpoint.list_shared_with_me',
      'powerpoint.list_versions',
      'powerpoint.search_files'
    ];
    const powerpointGuardedSlugs = [
      'powerpoint.copy_item',
      'powerpoint.create_folder',
      'powerpoint.create_presentation',
      'powerpoint.create_sharing_link',
      'powerpoint.delete_item',
      'powerpoint.delete_permission',
      'powerpoint.delete_slide',
      'powerpoint.get_preview_url',
      'powerpoint.move_item',
      'powerpoint.rename_item',
      'powerpoint.update_slide_notes',
      'powerpoint.update_slide_text'
    ];

    check(powerpointReadSlugs.every(function(slug) {
      return ppt[slug] && ppt[slug].tier === 'T1a'
        && ppt[slug].sideEffectClass === 'read'
        && ppt[slug].origin === 'https://powerpoint.cloud.microsoft'
        && ppt[slug].params
        && typeof ppt[slug].handle === 'function';
    }), 'PowerPoint read descriptors are T1a reads pinned to powerpoint.cloud.microsoft');
    check(powerpointGuardedSlugs.every(function(slug) {
      return ppt[slug] && ppt[slug].tier === 'T1a'
        && (ppt[slug].sideEffectClass === 'write' || ppt[slug].sideEffectClass === 'destructive')
        && ppt[slug].origin === 'https://powerpoint.cloud.microsoft'
        && ppt[slug].params
        && typeof ppt[slug].handle === 'function';
    }), 'PowerPoint write/destructive descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(pptSrc),
      'powerpoint.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(pptSrc),
      'powerpoint.js performs no direct network call');
    check(!/localStorage|sessionStorage|document\.cookie/.test(pptSrc),
      'powerpoint.js does not read page storage or cookies directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(pptSrc),
      'powerpoint.js does NOT console-log a secret-bearing variable');

    function makePowerpointCtx() {
      const pageCalls = [];
      const specCalls = [];
      return {
        pageCalls,
        specCalls,
        ctx: {
          origin: 'https://powerpoint.cloud.microsoft',
          tabId: 181,
          async executeBoundPageRead(request, tabId) {
            pageCalls.push({ request: request, tabId: tabId });
            return { success: true, status: 200, data: {
              graph_token: 'powerpoint-token-TEST-SYNTHETIC',
              drive_id: 'drive-TEST',
              item_id: 'item-TEST'
            } };
          },
          async executeBoundSpec(spec, tabId) {
            specCalls.push({ spec: spec, tabId: tabId });
            const url = spec && typeof spec.url === 'string' ? spec.url : '';
            if (url.indexOf('https://graph.microsoft.com/v1.0/me') === 0) {
              return { success: true, status: 200, data: {
                id: 'user-test',
                displayName: 'PowerPoint User',
                mail: 'powerpoint@example.invalid',
                userPrincipalName: 'fallback@example.invalid'
              } };
            }
            if (url.indexOf('/children') !== -1) {
              return { success: true, status: 200, data: { value: [{
                id: 'item-child',
                name: 'Deck.pptx',
                size: 2048,
                webUrl: 'https://powerpoint.cloud.microsoft/deck',
                file: { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
                createdBy: { user: { displayName: 'Creator' } },
                lastModifiedBy: { user: { displayName: 'Editor' } },
                createdDateTime: '2026-06-30T00:00:00Z',
                lastModifiedDateTime: '2026-06-30T01:00:00Z'
              }] } };
            }
            return { success: true, status: 200, data: { id: 'item-TEST', name: 'Deck.pptx' } };
          }
        }
      };
    }

    const pptUser = makePowerpointCtx();
    const pptUserOut = await ppt['powerpoint.get_current_user'].handle({}, pptUser.ctx);
    check(pptUser.pageCalls.length === 1
      && pptUser.pageCalls[0].request.origin === 'https://powerpoint.cloud.microsoft'
      && pptUser.pageCalls[0].request.namespace === 'powerpoint'
      && pptUser.pageCalls[0].request.action === 'auth_context',
      'powerpoint.get_current_user obtains auth only through bounded PowerPoint page-read');
    check(pptUser.specCalls.length === 1
      && pptUser.specCalls[0].spec.method === 'GET'
      && pptUser.specCalls[0].spec.origin === 'https://powerpoint.cloud.microsoft'
      && pptUser.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/me') === 0
      && pptUser.specCalls[0].spec.headers.Authorization === 'Bearer powerpoint-token-TEST-SYNTHETIC'
      && pptUser.specCalls[0].spec.authStrategy === 'none'
      && pptUser.specCalls[0].spec.credentials === 'omit',
      'powerpoint.get_current_user builds a read-only Microsoft Graph GET spec pinned to the PowerPoint page origin');
    check(pptUserOut && pptUserOut.success === true
      && pptUserOut.data.user.id === 'user-test'
      && pptUserOut.data.user.display_name === 'PowerPoint User'
      && pptUserOut.data.user.email === 'powerpoint@example.invalid'
      && JSON.stringify(pptUserOut).indexOf('powerpoint-token-TEST-SYNTHETIC') === -1,
      'powerpoint.get_current_user maps user data without returning token material');

    const pptChildren = makePowerpointCtx();
    const pptChildrenOut = await ppt['powerpoint.list_children'].handle({ top: 2 }, pptChildren.ctx);
    const pptChildrenUrl = pptChildren.specCalls.length ? new URL(pptChildren.specCalls[0].spec.url) : null;
    check(pptChildren.specCalls.length === 1
      && pptChildrenUrl
      && pptChildrenUrl.pathname === '/v1.0/drives/drive-TEST/root/children'
      && pptChildrenUrl.searchParams.get('$top') === '2'
      && pptChildrenUrl.searchParams.get('$select'),
      'powerpoint.list_children targets the drive root children endpoint with bounded top/select query');
    check(pptChildrenOut && pptChildrenOut.success === true
      && pptChildrenOut.data.items[0].id === 'item-child'
      && pptChildrenOut.data.items[0].name === 'Deck.pptx'
      && pptChildrenOut.data.items[0].created_by === 'Creator',
      'powerpoint.list_children maps Graph drive item rows');

    const pptSlides = makePowerpointCtx();
    const pptSlidesOut = await ppt['powerpoint.get_slides'].handle({ item_id: 'item-TEST' }, pptSlides.ctx);
    check(pptSlides.pageCalls.length === 0
      && pptSlides.specCalls.length === 0
      && pptSlidesOut && pptSlidesOut.success === false
      && pptSlidesOut.reason === 'powerpoint-pptx-binary-parser-unavailable',
      'powerpoint.get_slides fails closed until PPTX binary parsing is available');

    const pptGuard = makePowerpointCtx();
    const pptGuardOut = await ppt['powerpoint.create_presentation'].handle({ name: 'Deck.pptx' }, pptGuard.ctx);
    check(pptGuard.pageCalls.length === 0
      && pptGuard.specCalls.length === 0
      && pptGuardOut && pptGuardOut.success === false
      && pptGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && pptGuardOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && pptGuardOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && pptGuardOut.fellBackToDom === true,
      'powerpoint.create_presentation is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Outlook Microsoft Graph read + guarded mutation head -- catalog/handlers/outlook.js
  // =========================================================================
  const outlookPath = path.join(HANDLERS_DIR, 'outlook.js');
  check(fs.existsSync(outlookPath), 'catalog/handlers/outlook.js exists');
  if (fs.existsSync(outlookPath)) {
    const outlook = require(outlookPath);
    const outlookSrc = readSource(outlookPath);
    const outlookReadSlugs = [
      'outlook.download_attachment',
      'outlook.get_attachment_content',
      'outlook.get_calendar_view',
      'outlook.get_current_user',
      'outlook.get_event',
      'outlook.get_message',
      'outlook.list_attachments',
      'outlook.list_calendars',
      'outlook.list_events',
      'outlook.list_folders',
      'outlook.list_messages',
      'outlook.search_messages'
    ];
    const outlookGuardedSlugs = [
      'outlook.create_draft',
      'outlook.create_event',
      'outlook.delete_event',
      'outlook.delete_message',
      'outlook.forward_message',
      'outlook.get_schedule',
      'outlook.move_message',
      'outlook.reply_to_message',
      'outlook.respond_to_event',
      'outlook.send_message',
      'outlook.update_event',
      'outlook.update_message'
    ];

    check(outlookReadSlugs.every(function(slug) {
      return outlook[slug] && outlook[slug].tier === 'T1a'
        && outlook[slug].sideEffectClass === 'read'
        && outlook[slug].origin === 'https://outlook.cloud.microsoft'
        && outlook[slug].params
        && typeof outlook[slug].handle === 'function';
    }), 'Outlook read descriptors are T1a reads pinned to outlook.cloud.microsoft');
    check(outlookGuardedSlugs.every(function(slug) {
      return outlook[slug] && outlook[slug].tier === 'T1a'
        && (outlook[slug].sideEffectClass === 'write' || outlook[slug].sideEffectClass === 'destructive')
        && outlook[slug].origin === 'https://outlook.cloud.microsoft'
        && outlook[slug].params
        && typeof outlook[slug].handle === 'function';
    }), 'Outlook write/destructive descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(outlookSrc),
      'outlook.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(outlookSrc),
      'outlook.js performs no direct network call');
    check(!/localStorage|sessionStorage|document\.cookie/.test(outlookSrc),
      'outlook.js does not read page storage or cookies directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(outlookSrc),
      'outlook.js does NOT console-log a secret-bearing variable');

    function makeOutlookCtx(withPageRead) {
      const pageCalls = [];
      const specCalls = [];
      const ctx = {
        origin: 'https://outlook.cloud.microsoft',
        tabId: 182,
        async executeBoundSpec(spec, tabId) {
          specCalls.push({ spec: spec, tabId: tabId });
          const url = spec && typeof spec.url === 'string' ? spec.url : '';
          if (url.indexOf('/mailFolders/Inbox/messages') !== -1) {
            return { success: true, status: 200, data: { '@odata.count': 1, value: [{
              id: 'message-test',
              subject: 'Quarterly close',
              from: { emailAddress: { name: 'Sender', address: 'sender@example.invalid' } },
              toRecipients: [{ emailAddress: { name: 'Reader', address: 'reader@example.invalid' } }],
              receivedDateTime: '2026-06-30T01:00:00Z',
              isRead: false,
              hasAttachments: true,
              importance: 'normal',
              bodyPreview: 'Preview text'
            }] } };
          }
          if (url.indexOf('https://graph.microsoft.com/v1.0/me') === 0) {
            return { success: true, status: 200, data: {
              id: 'outlook-user-test',
              displayName: 'Outlook User',
              mail: 'outlook@example.invalid',
              userPrincipalName: 'fallback@example.invalid'
            } };
          }
          return { success: true, status: 200, data: { id: 'ok' } };
        }
      };
      if (withPageRead !== false) {
        ctx.executeBoundPageRead = async function(request, tabId) {
          pageCalls.push({ request: request, tabId: tabId });
          return { success: true, status: 200, data: {
            graph_tokens: ['outlook-token-TEST-SYNTHETIC']
          } };
        };
      }
      return { pageCalls, specCalls, ctx };
    }

    const outlookUser = makeOutlookCtx();
    const outlookUserOut = await outlook['outlook.get_current_user'].handle({}, outlookUser.ctx);
    check(outlookUser.pageCalls.length === 1
      && outlookUser.pageCalls[0].request.origin === 'https://outlook.cloud.microsoft'
      && outlookUser.pageCalls[0].request.namespace === 'outlook'
      && outlookUser.pageCalls[0].request.action === 'auth_context',
      'outlook.get_current_user obtains auth only through bounded Outlook page-read');
    check(outlookUser.specCalls.length === 1
      && outlookUser.specCalls[0].spec.method === 'GET'
      && outlookUser.specCalls[0].spec.origin === 'https://outlook.cloud.microsoft'
      && outlookUser.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/me') === 0
      && outlookUser.specCalls[0].spec.headers.Authorization === 'Bearer outlook-token-TEST-SYNTHETIC'
      && outlookUser.specCalls[0].spec.authStrategy === 'none'
      && outlookUser.specCalls[0].spec.credentials === 'omit',
      'outlook.get_current_user builds a read-only Microsoft Graph GET spec pinned to the Outlook page origin');
    check(outlookUserOut && outlookUserOut.success === true
      && outlookUserOut.data.user.id === 'outlook-user-test'
      && outlookUserOut.data.user.display_name === 'Outlook User'
      && outlookUserOut.data.user.email === 'outlook@example.invalid'
      && JSON.stringify(outlookUserOut).indexOf('outlook-token-TEST-SYNTHETIC') === -1,
      'outlook.get_current_user maps user data without returning token material');

    const outlookMessages = makeOutlookCtx();
    const outlookMessagesOut = await outlook['outlook.list_messages'].handle({ limit: 2 }, outlookMessages.ctx);
    const outlookMessagesUrl = outlookMessages.specCalls.length ? new URL(outlookMessages.specCalls[0].spec.url) : null;
    check(outlookMessages.specCalls.length === 1
      && outlookMessagesUrl
      && outlookMessagesUrl.pathname === '/v1.0/me/mailFolders/Inbox/messages'
      && outlookMessagesUrl.searchParams.get('$top') === '2'
      && outlookMessagesUrl.searchParams.get('$select'),
      'outlook.list_messages targets the Inbox messages endpoint with bounded top/select query');
    check(outlookMessagesOut && outlookMessagesOut.success === true
      && outlookMessagesOut.data.messages[0].id === 'message-test'
      && outlookMessagesOut.data.messages[0].subject === 'Quarterly close'
      && outlookMessagesOut.data.messages[0].from.address === 'sender@example.invalid'
      && outlookMessagesOut.data.total_count === 1,
      'outlook.list_messages maps Graph message rows');

    const outlookNoPageRead = makeOutlookCtx(false);
    const outlookNoPageReadOut = await outlook['outlook.get_current_user'].handle({}, outlookNoPageRead.ctx);
    check(outlookNoPageRead.pageCalls.length === 0
      && outlookNoPageRead.specCalls.length === 0
      && outlookNoPageReadOut && outlookNoPageReadOut.success === false
      && outlookNoPageReadOut.reason === 'outlook-page-read-primitive-unavailable',
      'outlook.get_current_user fails closed when the page-read primitive is unavailable');

    const outlookGuard = makeOutlookCtx();
    const outlookGuardOut = await outlook['outlook.send_message'].handle({ to: ['a@example.invalid'], subject: 'Hi', body: 'Hello' }, outlookGuard.ctx);
    check(outlookGuard.pageCalls.length === 0
      && outlookGuard.specCalls.length === 0
      && outlookGuardOut && outlookGuardOut.success === false
      && outlookGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && outlookGuardOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && outlookGuardOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && outlookGuardOut.fellBackToDom === true,
      'outlook.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // OneNote Microsoft Graph read + guarded mutation head -- catalog/handlers/onenote.js
  // =========================================================================
  const onenotePath = path.join(HANDLERS_DIR, 'onenote.js');
  check(fs.existsSync(onenotePath), 'catalog/handlers/onenote.js exists');
  if (fs.existsSync(onenotePath)) {
    const onenote = require(onenotePath);
    const onenoteSrc = readSource(onenotePath);
    const onenoteReadSlugs = [
      'onenote.get_current_user',
      'onenote.get_notebook',
      'onenote.get_recent_notebooks',
      'onenote.get_section',
      'onenote.get_section_group',
      'onenote.list_notebooks',
      'onenote.list_section_groups',
      'onenote.list_sections'
    ];
    const onenoteGuardedSlugs = [
      'onenote.create_notebook',
      'onenote.create_page',
      'onenote.create_section',
      'onenote.create_section_group'
    ];

    check(onenoteReadSlugs.every(function(slug) {
      return onenote[slug] && onenote[slug].tier === 'T1a'
        && onenote[slug].sideEffectClass === 'read'
        && onenote[slug].origin === 'https://onenote.cloud.microsoft'
        && onenote[slug].params
        && typeof onenote[slug].handle === 'function';
    }), 'OneNote read descriptors are T1a reads pinned to onenote.cloud.microsoft');
    check(onenoteGuardedSlugs.every(function(slug) {
      return onenote[slug] && onenote[slug].tier === 'T1a'
        && onenote[slug].sideEffectClass === 'write'
        && onenote[slug].origin === 'https://onenote.cloud.microsoft'
        && onenote[slug].params
        && typeof onenote[slug].handle === 'function';
    }), 'OneNote create descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(onenoteSrc),
      'onenote.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(onenoteSrc),
      'onenote.js performs no direct network call');
    check(!/localStorage|sessionStorage|document\.cookie/.test(onenoteSrc),
      'onenote.js does not read page storage or cookies directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(onenoteSrc),
      'onenote.js does NOT console-log a secret-bearing variable');

    function makeOneNoteCtx(withPageRead) {
      const pageCalls = [];
      const specCalls = [];
      const ctx = {
        origin: 'https://onenote.cloud.microsoft',
        tabId: 183,
        async executeBoundSpec(spec, tabId) {
          specCalls.push({ spec: spec, tabId: tabId });
          const url = spec && typeof spec.url === 'string' ? spec.url : '';
          if (url.indexOf('https://graph.microsoft.com/v1.0/me?') === 0) {
            return { success: true, status: 200, data: {
              id: 'onenote-user-test',
              displayName: 'OneNote User',
              mail: 'onenote@example.invalid',
              userPrincipalName: 'fallback@example.invalid',
              givenName: 'One',
              surname: 'Note',
              preferredLanguage: 'en-US'
            } };
          }
          if (url.indexOf('/onenote/notebooks/getRecentNotebooks') !== -1) {
            return { success: true, status: 200, data: { value: [{
              displayName: 'Recent Notebook',
              lastAccessedTime: '2026-06-30T03:00:00Z',
              sourceService: 'OneDriveForBusiness',
              links: { oneNoteWebUrl: { href: 'https://onenote.cloud.microsoft/recent' } }
            }] } };
          }
          if (url.indexOf('/onenote/sections') !== -1 || url.indexOf('/sections') !== -1) {
            return { success: true, status: 200, data: { value: [{
              id: 'section-test',
              displayName: 'Planning',
              createdDateTime: '2026-06-30T00:00:00Z',
              lastModifiedDateTime: '2026-06-30T02:00:00Z',
              isDefault: false,
              pagesUrl: 'https://graph.microsoft.com/v1.0/me/onenote/sections/section-test/pages',
              parentNotebook: { id: 'notebook-test', displayName: 'Engineering Notes' },
              createdBy: { user: { id: 'creator-test', displayName: 'Creator' } },
              lastModifiedBy: { user: { id: 'editor-test', displayName: 'Editor' } }
            }] } };
          }
          if (url.indexOf('/onenote/notebooks') !== -1) {
            return { success: true, status: 200, data: { value: [{
              id: 'notebook-test',
              displayName: 'Engineering Notes',
              createdDateTime: '2026-06-30T00:00:00Z',
              lastModifiedDateTime: '2026-06-30T02:00:00Z',
              isDefault: true,
              isShared: false,
              userRole: 'Owner',
              sectionsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/notebook-test/sections',
              sectionGroupsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/notebook-test/sectionGroups',
              createdBy: { user: { id: 'creator-test', displayName: 'Creator' } },
              lastModifiedBy: { user: { id: 'editor-test', displayName: 'Editor' } },
              links: { oneNoteWebUrl: { href: 'https://onenote.cloud.microsoft/notebook' } }
            }] } };
          }
          return { success: true, status: 200, data: { id: 'ok' } };
        }
      };
      if (withPageRead !== false) {
        ctx.executeBoundPageRead = async function(request, tabId) {
          pageCalls.push({ request: request, tabId: tabId });
          return { success: true, status: 200, data: {
            graph_token: 'onenote-token-TEST-SYNTHETIC'
          } };
        };
      }
      return { pageCalls, specCalls, ctx };
    }

    const onenoteUser = makeOneNoteCtx();
    const onenoteUserOut = await onenote['onenote.get_current_user'].handle({}, onenoteUser.ctx);
    check(onenoteUser.pageCalls.length === 1
      && onenoteUser.pageCalls[0].request.origin === 'https://onenote.cloud.microsoft'
      && onenoteUser.pageCalls[0].request.namespace === 'onenote'
      && onenoteUser.pageCalls[0].request.action === 'auth_context',
      'onenote.get_current_user obtains auth only through bounded OneNote page-read');
    check(onenoteUser.specCalls.length === 1
      && onenoteUser.specCalls[0].spec.method === 'GET'
      && onenoteUser.specCalls[0].spec.origin === 'https://onenote.cloud.microsoft'
      && onenoteUser.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/me') === 0
      && onenoteUser.specCalls[0].spec.headers.Authorization === 'Bearer onenote-token-TEST-SYNTHETIC'
      && onenoteUser.specCalls[0].spec.authStrategy === 'none'
      && onenoteUser.specCalls[0].spec.credentials === 'omit',
      'onenote.get_current_user builds a read-only Microsoft Graph GET spec pinned to the OneNote page origin');
    check(onenoteUserOut && onenoteUserOut.success === true
      && onenoteUserOut.data.user.id === 'onenote-user-test'
      && onenoteUserOut.data.user.display_name === 'OneNote User'
      && onenoteUserOut.data.user.email === 'onenote@example.invalid'
      && onenoteUserOut.data.user.preferred_language === 'en-US'
      && JSON.stringify(onenoteUserOut).indexOf('onenote-token-TEST-SYNTHETIC') === -1,
      'onenote.get_current_user maps user data without returning token material');

    const onenoteNotebooks = makeOneNoteCtx();
    const onenoteNotebooksOut = await onenote['onenote.list_notebooks'].handle({ top: 2 }, onenoteNotebooks.ctx);
    const onenoteNotebooksUrl = onenoteNotebooks.specCalls.length ? new URL(onenoteNotebooks.specCalls[0].spec.url) : null;
    check(onenoteNotebooks.specCalls.length === 1
      && onenoteNotebooksUrl
      && onenoteNotebooksUrl.pathname === '/v1.0/me/onenote/notebooks'
      && onenoteNotebooksUrl.searchParams.get('$top') === '2'
      && onenoteNotebooksUrl.searchParams.get('$orderby') === 'lastModifiedDateTime desc',
      'onenote.list_notebooks targets the notebooks endpoint with bounded top/order query');
    check(onenoteNotebooksOut && onenoteNotebooksOut.success === true
      && onenoteNotebooksOut.data.notebooks[0].id === 'notebook-test'
      && onenoteNotebooksOut.data.notebooks[0].display_name === 'Engineering Notes'
      && onenoteNotebooksOut.data.notebooks[0].created_by.display_name === 'Creator',
      'onenote.list_notebooks maps Graph notebook rows');

    const onenoteSections = makeOneNoteCtx();
    const onenoteSectionsOut = await onenote['onenote.list_sections'].handle({ notebook_id: 'notebook-test', top: 3 }, onenoteSections.ctx);
    const onenoteSectionsUrl = onenoteSections.specCalls.length ? new URL(onenoteSections.specCalls[0].spec.url) : null;
    check(onenoteSections.specCalls.length === 1
      && onenoteSectionsUrl
      && onenoteSectionsUrl.pathname === '/v1.0/me/onenote/notebooks/notebook-test/sections'
      && onenoteSectionsUrl.searchParams.get('$top') === '3',
      'onenote.list_sections targets notebook-scoped sections with bounded top query');
    check(onenoteSectionsOut && onenoteSectionsOut.success === true
      && onenoteSectionsOut.data.sections[0].id === 'section-test'
      && onenoteSectionsOut.data.sections[0].parent_notebook_name === 'Engineering Notes',
      'onenote.list_sections maps Graph section rows');

    const onenoteRecent = makeOneNoteCtx();
    await onenote['onenote.get_recent_notebooks'].handle({ include_personal: false }, onenoteRecent.ctx);
    check(onenoteRecent.specCalls.length === 1
      && onenoteRecent.specCalls[0].spec.url.indexOf('/getRecentNotebooks(includePersonalNotebooks=false)') !== -1,
      'onenote.get_recent_notebooks carries include_personal=false in the Graph function path');

    const onenoteBadShape = makeOneNoteCtx();
    onenoteBadShape.ctx.executeBoundSpec = async function(spec, tabId) {
      onenoteBadShape.specCalls.push({ spec: spec, tabId: tabId });
      return { success: true, status: 200, data: { error: { message: 'login required' } } };
    };
    const onenoteBadShapeOut = await onenote['onenote.list_notebooks'].handle({}, onenoteBadShape.ctx);
    check(onenoteBadShapeOut && onenoteBadShapeOut.success === false
      && onenoteBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && onenoteBadShapeOut.reason === 'onenote-graph-shape-mismatch',
      'onenote.list_notebooks rejects Graph error envelopes');

    const onenoteNoPageRead = makeOneNoteCtx(false);
    const onenoteNoPageReadOut = await onenote['onenote.get_current_user'].handle({}, onenoteNoPageRead.ctx);
    check(onenoteNoPageRead.pageCalls.length === 0
      && onenoteNoPageRead.specCalls.length === 0
      && onenoteNoPageReadOut && onenoteNoPageReadOut.success === false
      && onenoteNoPageReadOut.reason === 'onenote-page-read-primitive-unavailable',
      'onenote.get_current_user fails closed when the page-read primitive is unavailable');

    const onenoteGuard = makeOneNoteCtx();
    const onenoteGuardOut = await onenote['onenote.create_page'].handle({ section_id: 'section-test', html: '<html></html>' }, onenoteGuard.ctx);
    check(onenoteGuard.pageCalls.length === 0
      && onenoteGuard.specCalls.length === 0
      && onenoteGuardOut && onenoteGuardOut.success === false
      && onenoteGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && onenoteGuardOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && onenoteGuardOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && onenoteGuardOut.fellBackToDom === true,
      'onenote.create_page is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Medium same-origin GraphQL read + guarded mutation head -- catalog/handlers/medium.js
  // =========================================================================
  const mediumPath = path.join(HANDLERS_DIR, 'medium.js');
  check(fs.existsSync(mediumPath), 'catalog/handlers/medium.js exists');
  if (fs.existsSync(mediumPath)) {
    const md = require(mediumPath);
    const mdSrc = readSource(mediumPath);
    const mediumReadSlugs = [
      'medium.get_collection',
      'medium.get_current_user',
      'medium.get_notification_count',
      'medium.get_post',
      'medium.get_post_responses',
      'medium.get_reading_list',
      'medium.get_recommended_publishers',
      'medium.get_tag_feed',
      'medium.get_user_profile',
      'medium.list_followers',
      'medium.list_following',
      'medium.list_recommended_tags',
      'medium.search_collections',
      'medium.search_posts',
      'medium.search_tags'
    ];
    const mediumGuardedSlugs = [
      'medium.clap_post',
      'medium.follow_tag',
      'medium.follow_user',
      'medium.unfollow_tag',
      'medium.unfollow_user'
    ];

    check(mediumReadSlugs.every(function(slug) {
      return md[slug] && md[slug].tier === 'T1a'
        && md[slug].sideEffectClass === 'read'
        && md[slug].origin === 'https://medium.com'
        && md[slug].params
        && typeof md[slug].handle === 'function';
    }), 'all 15 Medium GraphQL read descriptors are tier:T1a READ entries pinned to medium.com');
    check(mediumGuardedSlugs.every(function(slug) {
      return md[slug] && md[slug].tier === 'T1a'
        && md[slug].sideEffectClass === 'write'
        && md[slug].origin === 'https://medium.com'
        && md[slug].params
        && typeof md[slug].handle === 'function';
    }), 'all 5 Medium mutation descriptors are guarded T1a entries');
    check(!/chrome\.(scripting|tabs)/.test(mdSrc),
      'medium.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(mdSrc),
      'medium.js performs no direct network call');
    check(!/document\.cookie|getCookie|localStorage|sessionStorage|Authorization|Bearer|window\.location|location\.href/.test(mdSrc),
      'medium.js does not read cookies/storage, inject bearer credentials, or navigate the page');
    check(!/mutation\s+(?:Clap|Follow|Unfollow)/.test(mdSrc),
      'medium.js does not include Medium mutation GraphQL operations');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(mdSrc),
      'medium.js does NOT console-log a secret-bearing variable');

    const mdPost = makeCtx('https://medium.com', 168);
    const mdPostOut = await md['medium.get_post'].handle({ post_id: 'post-test' }, mdPost.ctx);
    const mdPostBody = mdPost.calls.length ? parseSpecBody(mdPost.calls[0].spec) : {};
    const mdPostReq = Array.isArray(mdPostBody) ? mdPostBody[0] : mdPostBody;
    check(mdPost.calls.length === 1
      && mdPost.calls[0].spec.method === 'POST'
      && mdPost.calls[0].spec.url === 'https://medium.com/_/graphql'
      && mdPost.calls[0].spec.origin === 'https://medium.com'
      && mdPost.calls[0].spec.authStrategy === 'same-origin-cookie'
      && mdPost.calls[0].spec.headers['graphql-operation'] === 'PostQuery'
      && mdPostReq.operationName === 'PostQuery'
      && mdPostReq.variables.id === 'post-test',
      'medium.get_post builds one first-party GraphQL PostQuery POST spec');
    check(mdPostOut && mdPostOut.success === true
      && mdPostOut.data.post.id === 'post-test'
      && mdPostOut.data.post.title === 'Medium T1 fixture',
      'medium.get_post unwraps Medium batched GraphQL data');

    const mdSearch = makeCtx('https://medium.com', 169);
    const mdSearchOut = await md['medium.search_posts'].handle({ query: 'browser automation', limit: 5, page: 2 }, mdSearch.ctx);
    const mdSearchBody = mdSearch.calls.length ? parseSpecBody(mdSearch.calls[0].spec) : {};
    const mdSearchReq = Array.isArray(mdSearchBody) ? mdSearchBody[0] : mdSearchBody;
    check(mdSearch.calls.length === 1
      && mdSearchReq.operationName === 'SearchQuery'
      && mdSearchReq.variables.query === 'browser automation'
      && mdSearchReq.variables.pagingOptions.limit === 5
      && mdSearchReq.variables.pagingOptions.page === 2,
      'medium.search_posts posts SearchQuery with query and paging variables');
    check(mdSearchOut && mdSearchOut.success === true
      && mdSearchOut.data.search.posts.items[0].id === 'post-test',
      'medium.search_posts accepts expected search result shape');

    const mdReading = makeCtx('https://medium.com', 170);
    const mdReadingOut = await md['medium.get_reading_list'].handle({ limit: 3 }, mdReading.ctx);
    const mdReadingFirst = mdReading.calls.length ? parseSpecBody(mdReading.calls[0].spec) : {};
    const mdReadingSecond = mdReading.calls.length > 1 ? parseSpecBody(mdReading.calls[1].spec) : {};
    const mdReadingFirstReq = Array.isArray(mdReadingFirst) ? mdReadingFirst[0] : mdReadingFirst;
    const mdReadingSecondReq = Array.isArray(mdReadingSecond) ? mdReadingSecond[0] : mdReadingSecond;
    check(mdReading.calls.length === 2
      && mdReadingFirstReq.operationName === 'ViewerIdQuery'
      && mdReadingSecondReq.operationName === 'ReadingListQuery'
      && mdReadingSecondReq.variables.viewerId === 'medium-user'
      && mdReadingSecondReq.variables.limit === 3,
      'medium.get_reading_list resolves viewer ID then posts ReadingListQuery');
    check(mdReadingOut && mdReadingOut.success === true
      && mdReadingOut.data.getPredefinedCatalog.itemsConnection.items[0].entity.id === 'post-test',
      'medium.get_reading_list accepts expected reading-list shape');

    const mdBadShape = makeCtx('https://medium.com', 171, { mediumData: [{ data: { userResult: {} } }] });
    const mdBadShapeOut = await md['medium.get_user_profile'].handle({ username: 'missing' }, mdBadShape.ctx);
    check(mdBadShapeOut && mdBadShapeOut.success === false
      && mdBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mdBadShapeOut.reason === 'medium-graphql-shape-mismatch',
      'medium.get_user_profile rejects empty userResult objects');

    const mdErrors = makeCtx('https://medium.com', 172, { mediumData: [{ errors: [{ message: 'login required' }] }] });
    const mdErrorsOut = await md['medium.search_posts'].handle({ query: 'test' }, mdErrors.ctx);
    check(mdErrorsOut && mdErrorsOut.success === false
      && mdErrorsOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mdErrorsOut.reason === 'medium-graphql-error',
      'medium.search_posts fails closed on Medium GraphQL error envelopes');

    const mdWrite = makeCtx('https://medium.com', 173);
    const mdWriteOut = await md['medium.clap_post'].handle({ post_id: 'post-test', count: 1 }, mdWrite.ctx);
    check(mdWriteOut && mdWriteOut.success === false
      && mdWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mdWriteOut.errorCode === mdWriteOut.code
      && mdWriteOut.error === mdWriteOut.code
      && mdWriteOut.fellBackToDom === true
      && mdWrite.calls.length === 0,
      'medium.clap_post is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // Amplitude same-origin GraphQL read head -- catalog/handlers/amplitude.js
  // =========================================================================
  const amplitudePath = path.join(HANDLERS_DIR, 'amplitude.js');
  check(fs.existsSync(amplitudePath), 'catalog/handlers/amplitude.js exists');
  if (fs.existsSync(amplitudePath)) {
    const amp = require(amplitudePath);
    const ampSrc = readSource(amplitudePath);
    const amplitudeReadSlugs = [
      'amplitude.get_color_palettes',
      'amplitude.get_current_user',
      'amplitude.get_entitlements',
      'amplitude.get_event_volumes',
      'amplitude.get_mtu_volumes',
      'amplitude.get_org_data',
      'amplitude.get_personal_space',
      'amplitude.get_report_quota',
      'amplitude.get_session_replay_volumes',
      'amplitude.list_events',
      'amplitude.list_orgs',
      'amplitude.list_spaces',
      'amplitude.list_users',
      'amplitude.search_content'
    ];

    check(amplitudeReadSlugs.every(function(slug) {
      return amp[slug] && amp[slug].tier === 'T1a'
        && amp[slug].sideEffectClass === 'read'
        && amp[slug].origin === 'https://app.amplitude.com'
        && amp[slug].params
        && amp[slug].params.type === 'object'
        && typeof amp[slug].handle === 'function';
    }), 'all 14 Amplitude read descriptors are tier:T1a READ entries pinned to app.amplitude.com');
    check(!amp['amplitude.check_permissions'],
      'Amplitude write-classified check_permissions remains unregistered pending write evidence/reclassification');
    check(!/chrome\.(scripting|tabs)/.test(ampSrc),
      'amplitude.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(ampSrc),
      'amplitude.js performs no direct network call');
    check(!/Authorization|Bearer|getCookie|document\.cookie|localStorage|sessionStorage/.test(ampSrc),
      'amplitude.js does not read cookies/storage or replay bearer credentials directly');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|org_id)\b/i.test(ampSrc),
      'amplitude.js does NOT console-log a secret-bearing variable');

    const ampOrg = makeCtx('https://app.amplitude.com', 170, { url: 'https://app.amplitude.com/analytics/demo-org/home' });
    const ampOrgOut = await amp['amplitude.get_org_data'].handle({}, ampOrg.ctx);
    const ampOrgBody = ampOrg.calls.length > 1 ? parseSpecBody(ampOrg.calls[1].spec) : {};
    check(ampOrg.calls.length === 2
      && ampOrg.calls[0].spec.method === 'GET'
      && ampOrg.calls[0].spec.url === 'https://app.amplitude.com/analytics/demo-org/home'
      && ampOrg.calls[0].spec.authStrategy === 'same-origin-cookie',
      'amplitude.get_org_data first performs a same-origin bootstrap read');
    check(ampOrg.calls.length === 2
      && ampOrg.calls[1].spec.method === 'POST'
      && ampOrg.calls[1].spec.url === 'https://app.amplitude.com/t/graphql/org/12345?q=OrgData'
      && ampOrg.calls[1].spec.origin === 'https://app.amplitude.com'
      && ampOrg.calls[1].spec.authStrategy === 'same-origin-cookie'
      && ampOrg.calls[1].spec.headers['X-Org'] === '12345',
      'amplitude.get_org_data posts same-origin GraphQL to the bootstrapped org path');
    check(typeof ampOrgBody.query === 'string'
      && ampOrgBody.query.indexOf('OrgData') !== -1
      && ampOrgBody.query.indexOf('mutation') === -1
      && ampOrgBody.variables.product === 'analytics',
      'amplitude.get_org_data GraphQL body is a query and maps analytics product');
    check(ampOrgOut && ampOrgOut.success === true && ampOrgOut.data.org.orgId === '12345',
      'amplitude.get_org_data accepts the org GraphQL shape');

    const ampEvents = makeCtx('https://app.amplitude.com', 171);
    await amp['amplitude.list_events'].handle({ app_id: '101', event_type: 'Signup' }, ampEvents.ctx);
    const ampEventsBody = ampEvents.calls.length > 1 ? parseSpecBody(ampEvents.calls[1].spec) : {};
    check(ampEventsBody.variables.appId === '101' && ampEventsBody.variables.eventType === 'Signup',
      'amplitude.list_events maps app_id and event_type to GraphQL variables');

    const ampSearch = makeCtx('https://app.amplitude.com', 172);
    await amp['amplitude.search_content'].handle({
      query: 'activation',
      limit: 5,
      content_types: ['CHART'],
      owners: ['amp@example.invalid']
    }, ampSearch.ctx);
    const ampSearchBody = ampSearch.calls.length > 1 ? parseSpecBody(ampSearch.calls[1].spec) : {};
    check(ampSearchBody.variables.query === 'activation'
      && ampSearchBody.variables.limit === 5
      && ampSearchBody.variables.searchContentTypes[0] === 'CHART'
      && ampSearchBody.variables.owners[0] === 'amp@example.invalid',
      'amplitude.search_content maps search filters to GraphQL variables');

    const ampMissing = makeCtx('https://app.amplitude.com', 173, { amplitudeBootstrapText: '<html></html>' });
    const ampMissingOut = await amp['amplitude.list_orgs'].handle({}, ampMissing.ctx);
    check(ampMissing.calls.length === 1
      && ampMissingOut && ampMissingOut.success === false
      && ampMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ampMissingOut.reason === 'amplitude-bootstrap-org-unavailable',
      'amplitude.list_orgs fails closed when the org bootstrap id is unavailable');

    const ampBadShape = makeCtx('https://app.amplitude.com', 174, { amplitudeData: { errors: [{ message: 'not authenticated' }] } });
    const ampBadOut = await amp['amplitude.list_users'].handle({}, ampBadShape.ctx);
    check(ampBadOut && ampBadOut.success === false
      && ampBadOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ampBadOut.reason === 'amplitude-graphql-shape-mismatch',
      'amplitude.list_users rejects GraphQL error envelopes');
  }

  // =========================================================================
  // New Relic same-origin NerdGraph read head -- catalog/handlers/newrelic.js
  // =========================================================================
  const newrelicPath = path.join(HANDLERS_DIR, 'newrelic.js');
  check(fs.existsSync(newrelicPath), 'catalog/handlers/newrelic.js exists');
  if (fs.existsSync(newrelicPath)) {
    const nr = require(newrelicPath);
    const nrSrc = readSource(newrelicPath);
    const newrelicReadSlugs = [
      'newrelic.get_current_user',
      'newrelic.get_dashboard',
      'newrelic.get_entity',
      'newrelic.get_organization',
      'newrelic.list_accounts',
      'newrelic.list_alert_policies',
      'newrelic.list_dashboards',
      'newrelic.list_entity_tags',
      'newrelic.list_event_types',
      'newrelic.list_nrql_conditions',
      'newrelic.run_nrql_query',
      'newrelic.search_entities'
    ];
    const newrelicMutationSlugs = [
      'newrelic.add_entity_tags',
      'newrelic.create_alert_policy',
      'newrelic.create_dashboard',
      'newrelic.create_nrql_condition',
      'newrelic.delete_alert_policy',
      'newrelic.delete_dashboard',
      'newrelic.delete_entity_tags',
      'newrelic.delete_nrql_condition',
      'newrelic.update_dashboard',
      'newrelic.update_nrql_condition'
    ];

    check(newrelicReadSlugs.every(function(slug) {
      return nr[slug] && nr[slug].tier === 'T1a'
        && nr[slug].sideEffectClass === 'read'
        && nr[slug].origin === 'https://one.newrelic.com'
        && nr[slug].params
        && nr[slug].params.type === 'object'
        && typeof nr[slug].handle === 'function';
    }), 'all 12 New Relic read/query descriptors are tier:T1a READ entries pinned to one.newrelic.com');
    check(newrelicMutationSlugs.every(function(slug) { return !nr[slug]; }),
      'New Relic mutation/destructive descriptors remain unregistered pending live body evidence');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(nrSrc),
      'newrelic.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(nrSrc),
      'newrelic.js performs no direct network call');
    check(!/Authorization|Bearer|getCookie|document\.cookie|localStorage|sessionStorage|getPageGlobal/.test(nrSrc),
      'newrelic.js does not read cookies/storage/page globals or replay bearer credentials directly');
    check(!/\bmutation\b/.test(nrSrc),
      'newrelic.js includes no NerdGraph mutation operations');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|apiKey)\b/i.test(nrSrc),
      'newrelic.js does NOT console-log secret-bearing values');

    const nrUser = makeCtx('https://one.newrelic.com', 175);
    const nrUserOut = await nr['newrelic.get_current_user'].handle({}, nrUser.ctx);
    const nrUserBody = nrUser.calls.length ? parseSpecBody(nrUser.calls[0].spec) : {};
    check(nrUser.calls.length === 1
      && nrUser.calls[0].spec.method === 'POST'
      && nrUser.calls[0].spec.url === 'https://one.newrelic.com/graphql'
      && nrUser.calls[0].spec.origin === 'https://one.newrelic.com'
      && nrUser.calls[0].spec.authStrategy === 'same-origin-cookie'
      && nrUser.calls[0].spec.extract === 'data'
      && nrUser.calls[0].spec.headers['newrelic-requesting-services'] === 'platform|nr1-ui'
      && nrUser.calls[0].spec.headers['x-requested-with'] === 'XMLHttpRequest'
      && nrUserBody.operationName === 'NewRelicCurrentUser'
      && String(nrUserBody.query || '').indexOf('mutation') === -1,
      'newrelic.get_current_user builds one same-origin NerdGraph POST spec');
    check(nrUserOut && nrUserOut.success === true
      && nrUserOut.data.actor.user.email === 'nr@example.invalid',
      'newrelic.get_current_user accepts the current-user GraphQL shape');

    const nrPolicies = makeCtx('https://one.newrelic.com', 176);
    await nr['newrelic.list_alert_policies'].handle({ account_id: 123, cursor: 'cursor-1' }, nrPolicies.ctx);
    const nrPoliciesBody = nrPolicies.calls.length ? parseSpecBody(nrPolicies.calls[0].spec) : {};
    check(nrPolicies.calls.length === 1
      && nrPoliciesBody.operationName === 'ListPolicies'
      && nrPoliciesBody.variables.accountId === 123
      && nrPoliciesBody.variables.cursor === 'cursor-1'
      && String(nrPoliciesBody.query || '').indexOf('policiesSearch') !== -1,
      'newrelic.list_alert_policies maps account_id/cursor to NerdGraph variables');

    const nrSearch = makeCtx('https://one.newrelic.com', 177);
    await nr['newrelic.search_entities'].handle({ query: "name LIKE 'checkout'", cursor: 'next-1' }, nrSearch.ctx);
    const nrSearchBody = nrSearch.calls.length ? parseSpecBody(nrSearch.calls[0].spec) : {};
    check(nrSearchBody.operationName === 'SearchEntities'
      && nrSearchBody.variables.query === "name LIKE 'checkout'"
      && nrSearchBody.variables.cursor === 'next-1',
      'newrelic.search_entities maps search query and cursor variables');

    const nrRun = makeCtx('https://one.newrelic.com', 178);
    const nrRunOut = await nr['newrelic.run_nrql_query'].handle({
      account_id: 123,
      query: 'SELECT count(*) FROM Transaction SINCE 1 hour ago',
      timeout: 30
    }, nrRun.ctx);
    const nrRunBody = nrRun.calls.length ? parseSpecBody(nrRun.calls[0].spec) : {};
    check(nrRun.calls.length === 1
      && nrRunBody.operationName === 'RunNrql'
      && nrRunBody.variables.accountId === 123
      && nrRunBody.variables.query === 'SELECT count(*) FROM Transaction SINCE 1 hour ago'
      && nrRunBody.variables.timeout === 30
      && nrRunOut && nrRunOut.success === true
      && nrRunOut.data.actor.account.nrql.results[0].count === 42,
      'newrelic.run_nrql_query executes read-only SELECT NRQL through NerdGraph');

    const nrUnsafe = makeCtx('https://one.newrelic.com', 179);
    const nrUnsafeOut = await nr['newrelic.run_nrql_query'].handle({
      account_id: 123,
      query: 'DELETE FROM Transaction'
    }, nrUnsafe.ctx);
    check(nrUnsafe.calls.length === 0
      && nrUnsafeOut && nrUnsafeOut.success === false
      && nrUnsafeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nrUnsafeOut.reason === 'newrelic-read-only-nrql-required',
      'newrelic.run_nrql_query rejects non-read NRQL before any execution primitive call');

    const nrBadShape = makeCtx('https://one.newrelic.com', 180, { newrelicData: { actor: {} } });
    const nrBadShapeOut = await nr['newrelic.list_accounts'].handle({}, nrBadShape.ctx);
    check(nrBadShapeOut && nrBadShapeOut.success === false
      && nrBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nrBadShapeOut.reason === 'newrelic-graphql-shape-mismatch',
      'newrelic.list_accounts rejects missing account envelopes');

    const nrErrors = makeCtx('https://one.newrelic.com', 181, { newrelicData: { errors: [{ message: 'login required' }] } });
    const nrErrorsOut = await nr['newrelic.search_entities'].handle({ query: "name LIKE 'x'" }, nrErrors.ctx);
    check(nrErrorsOut && nrErrorsOut.success === false
      && nrErrorsOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nrErrorsOut.errorCode === nrErrorsOut.code
      && nrErrorsOut.error === nrErrorsOut.code
      && nrErrorsOut.reason === 'newrelic-graphql-errors',
      'newrelic.search_entities fails closed on GraphQL error envelopes');
  }

  // =========================================================================
  // PostHog same-origin API read + guarded write head -- catalog/handlers/posthog.js
  // =========================================================================
  const posthogPath = path.join(HANDLERS_DIR, 'posthog.js');
  check(fs.existsSync(posthogPath), 'catalog/handlers/posthog.js exists');
  if (fs.existsSync(posthogPath)) {
    const ph = require(posthogPath);
    const phSrc = readSource(posthogPath);
    const posthogReadSlugs = [
      'posthog.get_current_user',
      'posthog.get_organization',
      'posthog.list_projects',
      'posthog.get_project',
      'posthog.list_dashboards',
      'posthog.get_dashboard',
      'posthog.list_insights',
      'posthog.get_insight',
      'posthog.list_feature_flags',
      'posthog.get_feature_flag',
      'posthog.list_experiments',
      'posthog.get_experiment',
      'posthog.list_annotations',
      'posthog.list_persons',
      'posthog.get_person',
      'posthog.list_cohorts',
      'posthog.get_cohort',
      'posthog.list_surveys',
      'posthog.get_survey',
      'posthog.list_actions',
      'posthog.get_action',
      'posthog.list_events',
      'posthog.list_event_definitions',
      'posthog.list_property_definitions'
    ];
    const posthogGuardedSlugs = [
      'posthog.create_annotation',
      'posthog.create_dashboard',
      'posthog.create_experiment',
      'posthog.create_feature_flag',
      'posthog.create_insight',
      'posthog.run_query',
      'posthog.run_trends_query',
      'posthog.update_dashboard',
      'posthog.update_feature_flag',
      'posthog.update_insight',
      'posthog.delete_annotation',
      'posthog.delete_dashboard',
      'posthog.delete_feature_flag',
      'posthog.delete_insight'
    ];

    check(posthogReadSlugs.every(function(slug) {
      return ph[slug] && ph[slug].tier === 'T1a'
        && ph[slug].sideEffectClass === 'read'
        && ph[slug].origin === 'https://us.posthog.com'
        && ph[slug].params
        && ph[slug].params.type === 'object'
        && typeof ph[slug].handle === 'function';
    }), 'all 24 PostHog read descriptors are tier:T1a READ entries pinned to us.posthog.com');
    check(posthogGuardedSlugs.every(function(slug) {
      return ph[slug] && ph[slug].tier === 'T1a'
        && (ph[slug].sideEffectClass === 'write' || ph[slug].sideEffectClass === 'destructive')
        && ph[slug].origin === 'https://us.posthog.com'
        && ph[slug].params
        && ph[slug].params.type === 'object'
        && typeof ph[slug].handle === 'function';
    }), 'PostHog write/query/destructive descriptors are registered as guarded T1a entries');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(phSrc),
      'posthog.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(phSrc),
      'posthog.js performs no direct network call');
    check(!/Authorization|Bearer|getCookie|document\.cookie|localStorage|sessionStorage|getPageGlobal/.test(phSrc),
      'posthog.js does not read credentials/storage/page globals directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|apiKey)\b/i.test(phSrc),
      'posthog.js does NOT console-log secret-bearing values');

    const phDash = makeCtx('https://us.posthog.com', 187, { url: 'https://us.posthog.com/project/42/dashboard' });
    const phDashOut = await ph['posthog.get_dashboard'].handle({ dashboard_id: 77 }, phDash.ctx);
    check(phDash.calls.length === 2
      && phDash.calls[0].spec.method === 'GET'
      && phDash.calls[0].spec.url === 'https://us.posthog.com/project/42/dashboard'
      && phDash.calls[0].spec.authStrategy === 'same-origin-cookie',
      'posthog.get_dashboard first performs same-origin bootstrap read');
    check(phDash.calls.length === 2
      && phDash.calls[1].spec.method === 'GET'
      && phDash.calls[1].spec.url === 'https://us.posthog.com/api/environments/42/dashboards/77/'
      && phDash.calls[1].spec.origin === 'https://us.posthog.com'
      && phDash.calls[1].spec.authStrategy === 'same-origin-cookie'
      && phDash.calls[1].spec.extract === '@'
      && phDashOut && phDashOut.success === true
      && phDashOut.data.id === 77,
      'posthog.get_dashboard builds same-origin dashboard API GET');

    const phList = makeCtx('https://us.posthog.com', 188);
    await ph['posthog.list_events'].handle({ event: '$pageview', after: '2026-07-01T00:00:00Z', limit: 5 }, phList.ctx);
    check(phList.calls.length === 2
      && phList.calls[1].spec.url.indexOf('/api/environments/42/events/?') !== -1
      && phList.calls[1].spec.url.indexOf('event=%24pageview') !== -1
      && phList.calls[1].spec.url.indexOf('after=2026-07-01T00%3A00%3A00Z') !== -1
      && phList.calls[1].spec.url.indexOf('limit=5') !== -1,
      'posthog.list_events maps filters to query params');

    const phProjects = makeCtx('https://us.posthog.com', 189);
    await ph['posthog.list_projects'].handle({ limit: 25, offset: 10 }, phProjects.ctx);
    check(phProjects.calls.length === 2
      && phProjects.calls[1].spec.url === 'https://us.posthog.com/api/organizations/org-test/projects/?limit=25&offset=10',
      'posthog.list_projects uses bootstrapped organization id');

    const phMissing = makeCtx('https://us.posthog.com', 190, { posthogBootstrapText: '<html></html>' });
    const phMissingOut = await ph['posthog.list_dashboards'].handle({}, phMissing.ctx);
    check(phMissing.calls.length === 1
      && phMissingOut && phMissingOut.success === false
      && phMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && phMissingOut.reason === 'posthog-bootstrap-team-unavailable',
      'posthog.list_dashboards fails closed when team bootstrap is unavailable');

    const phBadShape = makeCtx('https://us.posthog.com', 191, { posthogData: { errors: [{ message: 'login required' }] } });
    const phBadOut = await ph['posthog.get_current_user'].handle({}, phBadShape.ctx);
    check(phBadOut && phBadOut.success === false
      && phBadOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && phBadOut.reason === 'posthog-api-error-envelope',
      'posthog.get_current_user rejects API error envelopes');

    const phWrite = makeCtx('https://us.posthog.com', 192);
    const phWriteOut = await ph['posthog.create_feature_flag'].handle({ key: 'checkout-test' }, phWrite.ctx);
    check(phWrite.calls.length === 0
      && phWriteOut && phWriteOut.success === false
      && phWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && phWriteOut.reason === 'unverified-posthog-create_feature_flag-body',
      'posthog.create_feature_flag is guarded fail-closed');
  }

  // =========================================================================
  // Grafana same-origin dashboard/metrics read head -- catalog/handlers/grafana.js
  // =========================================================================
  const grafanaPath = path.join(HANDLERS_DIR, 'grafana.js');
  check(fs.existsSync(grafanaPath), 'catalog/handlers/grafana.js exists');
  if (fs.existsSync(grafanaPath)) {
    const gr = require(grafanaPath);
    const grSrc = readSource(grafanaPath);
    const grafanaReadSlugs = [
      'grafana.get_dashboard',
      'grafana.list_dashboards',
      'grafana.query_metrics'
    ];

    check(grafanaReadSlugs.every(function(slug) {
      return gr[slug] && gr[slug].tier === 'T1a'
        && gr[slug].sideEffectClass === 'read'
        && gr[slug].origin === 'https://grafana.com'
        && gr[slug].params
        && gr[slug].params.type === 'object'
        && typeof gr[slug].handle === 'function';
    }), 'all 3 Grafana descriptors are tier:T1a READ entries pinned to grafana.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(grSrc),
      'grafana.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(grSrc),
      'grafana.js performs no direct network call');
    check(!/Authorization|Bearer|getCookie|document\.cookie|localStorage|sessionStorage|getPageGlobal/.test(grSrc),
      'grafana.js does not read cookies/storage/page globals or replay bearer credentials directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|apiKey)\b/i.test(grSrc),
      'grafana.js does NOT console-log secret-bearing values');

    const grList = makeCtx('https://grafana.com', 182);
    const grListOut = await gr['grafana.list_dashboards'].handle({
      folder: 'Observability',
      tag: 'platform',
      limit: 10
    }, grList.ctx);
    check(grList.calls.length === 1
      && grList.calls[0].spec.method === 'GET'
      && grList.calls[0].spec.url === 'https://grafana.com/api/search?folder=Observability&tag=platform&limit=10'
      && grList.calls[0].spec.origin === 'https://grafana.com'
      && grList.calls[0].spec.authStrategy === 'same-origin-cookie'
      && grList.calls[0].spec.extract === '@'
      && grListOut && grListOut.success === true
      && grListOut.data.dashboards[0].uid === 'dash-test',
      'grafana.list_dashboards builds one same-origin /api/search GET spec');

    const grGet = makeCtx('https://grafana.com', 183);
    const grGetOut = await gr['grafana.get_dashboard'].handle({ uid: 'dash/test' }, grGet.ctx);
    check(grGet.calls.length === 1
      && grGet.calls[0].spec.url === 'https://grafana.com/api/dashboards/uid/dash%2Ftest'
      && grGetOut && grGetOut.success === true
      && grGetOut.data.dashboard.panels.length === 1,
      'grafana.get_dashboard path-encodes dashboard UID and accepts dashboard envelopes');

    const grMetrics = makeCtx('https://grafana.com', 184);
    const grMetricsOut = await gr['grafana.query_metrics'].handle({
      datasource: 'prometheus',
      query: 'rate(http_requests_total[5m])',
      from: 'now-1h',
      to: 'now'
    }, grMetrics.ctx);
    check(grMetrics.calls.length === 1
      && grMetrics.calls[0].spec.url === 'https://grafana.com/api/ds/query?datasource=prometheus&query=rate(http_requests_total%5B5m%5D)&from=now-1h&to=now'
      && grMetricsOut && grMetricsOut.success === true
      && grMetricsOut.data.series[0].points === 12,
      'grafana.query_metrics builds one same-origin metrics GET spec');

    const grUnsafe = makeCtx('https://grafana.com', 185);
    const grUnsafeOut = await gr['grafana.query_metrics'].handle({
      datasource: 'sql',
      query: 'DROP TABLE dashboards'
    }, grUnsafe.ctx);
    check(grUnsafe.calls.length === 0
      && grUnsafeOut && grUnsafeOut.success === false
      && grUnsafeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && grUnsafeOut.reason === 'grafana-read-only-query-required',
      'grafana.query_metrics rejects mutation-shaped queries before any execution primitive call');

    const grBadShape = makeCtx('https://grafana.com', 186, { grafanaData: { ok: true } });
    const grBadShapeOut = await gr['grafana.get_dashboard'].handle({ uid: 'dash-test' }, grBadShape.ctx);
    check(grBadShapeOut && grBadShapeOut.success === false
      && grBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && grBadShapeOut.errorCode === grBadShapeOut.code
      && grBadShapeOut.error === grBadShapeOut.code
      && grBadShapeOut.reason === 'grafana-api-shape-mismatch',
      'grafana.get_dashboard rejects missing dashboard envelopes');
  }

  // =========================================================================
  // WhatsApp Web page-state read + guarded mutation head -- catalog/handlers/whatsapp.js
  // =========================================================================
  const whatsappPath = path.join(HANDLERS_DIR, 'whatsapp.js');
  check(fs.existsSync(whatsappPath), 'catalog/handlers/whatsapp.js exists');
  if (fs.existsSync(whatsappPath)) {
    const wa = require(whatsappPath);
    const waSrc = readSource(whatsappPath);
    const whatsappReadSlugs = [
      'whatsapp.get_current_user',
      'whatsapp.get_chat',
      'whatsapp.get_contact',
      'whatsapp.get_group_invite_link',
      'whatsapp.list_chats',
      'whatsapp.list_contacts',
      'whatsapp.list_messages'
    ];
    const whatsappGuardedSlugs = [
      'whatsapp.archive_chat',
      'whatsapp.block_contact',
      'whatsapp.clear_chat',
      'whatsapp.create_group',
      'whatsapp.delete_chat',
      'whatsapp.delete_message',
      'whatsapp.mark_chat_read',
      'whatsapp.mute_chat',
      'whatsapp.pin_chat',
      'whatsapp.revoke_group_invite_link',
      'whatsapp.revoke_message',
      'whatsapp.send_message',
      'whatsapp.star_message',
      'whatsapp.unblock_contact'
    ];
    check(whatsappReadSlugs.every(function(slug) {
      return wa[slug] && wa[slug].tier === 'T1a'
        && wa[slug].origin === 'https://web.whatsapp.com'
        && wa[slug].sideEffectClass === 'read'
        && typeof wa[slug].handle === 'function';
    }), 'WhatsApp page-state read descriptors are T1a reads pinned to web.whatsapp.com');
    check(whatsappGuardedSlugs.every(function(slug) {
      return wa[slug] && wa[slug].tier === 'T1a'
        && wa[slug].origin === 'https://web.whatsapp.com'
        && wa[slug].sideEffectClass !== 'read'
        && typeof wa[slug].handle === 'function';
    }), 'WhatsApp mutation descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs)/.test(waSrc),
      'whatsapp.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(waSrc) && !/\bXMLHttpRequest\s*\(/.test(waSrc),
      'whatsapp.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(waSrc),
      'whatsapp.js does not read cookies/storage directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(waSrc),
      'whatsapp.js does NOT console-log a secret-bearing variable');

    const waCalls = [];
    const waCtx = {
      origin: 'https://web.whatsapp.com',
      tabId: 168,
      async executeBoundPageRead(request, tabId) {
        waCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('WhatsApp reads must not call executeBoundSpec');
      }
    };
    const waListOut = await wa['whatsapp.list_chats'].handle({ limit: 2 }, waCtx);
    check(waCalls.length === 1
      && waCalls[0].tabId === 168
      && waCalls[0].request.origin === 'https://web.whatsapp.com'
      && waCalls[0].request.namespace === 'whatsapp'
      && waCalls[0].request.action === 'list_chats'
      && waCalls[0].request.args.limit === 2,
      'whatsapp.list_chats dispatches a bounded WhatsApp page-read request');
    check(waListOut && waListOut.success === true && waListOut.data.action === 'list_chats',
      'whatsapp.list_chats returns the bounded page-read result');

    const waNoPrimitive = await wa['whatsapp.get_current_user'].handle({}, {
      origin: 'https://web.whatsapp.com',
      tabId: 169
    });
    check(waNoPrimitive && waNoPrimitive.success === false
      && waNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && waNoPrimitive.reason === 'whatsapp-page-read-primitive-unavailable',
      'whatsapp.get_current_user fails closed when the page-read primitive is unavailable');

    const waGuardCalls = [];
    const waGuardOut = await wa['whatsapp.send_message'].handle({
      chat_id: '15551234567@c.us',
      text: 'hello'
    }, {
      origin: 'https://web.whatsapp.com',
      tabId: 170,
      async executeBoundSpec() { waGuardCalls.push('spec'); },
      async executeBoundPageRead() { waGuardCalls.push('page'); }
    });
    check(waGuardOut && waGuardOut.success === false
      && waGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && waGuardOut.fellBackToDom === true
      && waGuardCalls.length === 0,
      'whatsapp.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Telegram Web page-state read + guarded mutation head -- catalog/handlers/telegram.js
  // =========================================================================
  const telegramPath = path.join(HANDLERS_DIR, 'telegram.js');
  check(fs.existsSync(telegramPath), 'catalog/handlers/telegram.js exists');
  if (fs.existsSync(telegramPath)) {
    const tg = require(telegramPath);
    const tgSrc = readSource(telegramPath);
    const telegramReadSlugs = [
      'telegram.get_chat_info',
      'telegram.get_chat_members',
      'telegram.get_conversation',
      'telegram.get_current_user',
      'telegram.get_messages',
      'telegram.get_user',
      'telegram.get_user_profile',
      'telegram.list_contacts',
      'telegram.list_conversations',
      'telegram.resolve_username',
      'telegram.search_contacts',
      'telegram.search_messages'
    ];
    const telegramGuardedSlugs = [
      'telegram.add_contact',
      'telegram.create_group',
      'telegram.delete_contact',
      'telegram.delete_messages',
      'telegram.edit_message',
      'telegram.forward_messages',
      'telegram.mark_conversation_read',
      'telegram.pin_message',
      'telegram.send_message',
      'telegram.set_typing',
      'telegram.unpin_message'
    ];
    check(telegramReadSlugs.every(function(slug) {
      return tg[slug] && tg[slug].tier === 'T1a'
        && tg[slug].origin === 'https://web.telegram.org'
        && tg[slug].sideEffectClass === 'read'
        && typeof tg[slug].handle === 'function';
    }), 'Telegram page-state read descriptors are T1a reads pinned to web.telegram.org');
    check(telegramGuardedSlugs.every(function(slug) {
      return tg[slug] && tg[slug].tier === 'T1a'
        && tg[slug].origin === 'https://web.telegram.org'
        && tg[slug].sideEffectClass !== 'read'
        && typeof tg[slug].handle === 'function';
    }), 'Telegram mutation descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs)/.test(tgSrc),
      'telegram.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(tgSrc) && !/\bXMLHttpRequest\s*\(/.test(tgSrc),
      'telegram.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(tgSrc),
      'telegram.js does not read cookies/storage directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(tgSrc),
      'telegram.js does NOT console-log a secret-bearing variable');

    const tgCalls = [];
    const tgCtx = {
      origin: 'https://web.telegram.org',
      tabId: 181,
      async executeBoundPageRead(request, tabId) {
        tgCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Telegram reads must not call executeBoundSpec');
      }
    };
    const tgListOut = await tg['telegram.list_conversations'].handle({ limit: 2 }, tgCtx);
    check(tgCalls.length === 1
      && tgCalls[0].tabId === 181
      && tgCalls[0].request.origin === 'https://web.telegram.org'
      && tgCalls[0].request.namespace === 'telegram'
      && tgCalls[0].request.action === 'list_conversations'
      && tgCalls[0].request.args.limit === 2,
      'telegram.list_conversations dispatches a bounded Telegram page-read request');
    check(tgListOut && tgListOut.success === true && tgListOut.data.action === 'list_conversations',
      'telegram.list_conversations returns the bounded page-read result');

    const tgNoPrimitive = await tg['telegram.get_current_user'].handle({}, {
      origin: 'https://web.telegram.org',
      tabId: 182
    });
    check(tgNoPrimitive && tgNoPrimitive.success === false
      && tgNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tgNoPrimitive.reason === 'telegram-page-read-primitive-unavailable',
      'telegram.get_current_user fails closed when the page-read primitive is unavailable');

    const tgGuardCalls = [];
    const tgGuardOut = await tg['telegram.send_message'].handle({
      peer_id: 123,
      text: 'hello'
    }, {
      origin: 'https://web.telegram.org',
      tabId: 183,
      async executeBoundSpec() { tgGuardCalls.push('spec'); },
      async executeBoundPageRead() { tgGuardCalls.push('page'); }
    });
    check(tgGuardOut && tgGuardOut.success === false
      && tgGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && tgGuardOut.errorCode === tgGuardOut.code
      && tgGuardOut.error === tgGuardOut.code
      && tgGuardOut.fellBackToDom === true
      && tgGuardCalls.length === 0,
      'telegram.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Microsoft Word Microsoft Graph read head + guarded mutation head -- catalog/handlers/msword.js
  // =========================================================================
  const mswordPath = path.join(HANDLERS_DIR, 'msword.js');
  check(fs.existsSync(mswordPath), 'catalog/handlers/msword.js exists');
  if (fs.existsSync(mswordPath)) {
    const msw = require(mswordPath);
    const mswSrc = readSource(mswordPath);
    const mswordGuardedSlugs = [
      'msword.append_to_document',
      'msword.copy_item',
      'msword.create_document',
      'msword.create_folder',
      'msword.create_sharing_link',
      'msword.delete_item',
      'msword.delete_permission',
      'msword.get_preview_url',
      'msword.move_item',
      'msword.rename_item',
      'msword.replace_text_in_document',
      'msword.restore_version',
      'msword.update_document',
      'msword.update_file_content',
      'msword.upload_file'
    ];
    const mswordReadSlugs = [
      'msword.get_active_document',
      'msword.get_current_user',
      'msword.get_document_text',
      'msword.get_drive',
      'msword.get_file_content',
      'msword.get_item',
      'msword.list_children',
      'msword.list_permissions',
      'msword.list_recent_documents',
      'msword.list_shared_with_me',
      'msword.list_versions',
      'msword.search_files'
    ];

    check(mswordGuardedSlugs.every(function(slug) {
      return msw[slug] && msw[slug].tier === 'T1a'
        && (msw[slug].sideEffectClass === 'write' || msw[slug].sideEffectClass === 'destructive')
        && msw[slug].origin === 'https://word.cloud.microsoft'
        && msw[slug].params
        && typeof msw[slug].handle === 'function';
    }), 'all 15 MSWord mutation descriptors are guarded T1a entries pinned to word.cloud.microsoft');
    check(mswordReadSlugs.every(function(slug) {
      return msw[slug] && msw[slug].tier === 'T1a'
        && msw[slug].sideEffectClass === 'read'
        && msw[slug].origin === 'https://word.cloud.microsoft'
        && msw[slug].params
        && typeof msw[slug].handle === 'function';
    }), 'all 12 MSWord Microsoft Graph reads are T1a entries pinned to word.cloud.microsoft');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(mswSrc),
      'msword.js references NO privileged chrome execution/cookie APIs');
    check(!/\bfetch\s*\(|\bXMLHttpRequest\s*\(/.test(mswSrc),
      'msword.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(mswSrc),
      'msword.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(mswSrc),
      'msword.js does NOT console-log a secret-bearing variable');

    function makeMswordCtx() {
      const pageCalls = [];
      const specCalls = [];
      return {
        pageCalls,
        specCalls,
        ctx: {
          origin: 'https://word.cloud.microsoft',
          tabId: 174,
          async executeBoundPageRead(request, tabId) {
            pageCalls.push({ request: request, tabId: tabId });
            return {
              success: true,
              status: 200,
              data: {
                graph_token: 'msword-token-TEST-SYNTHETIC',
                drive_id: 'drive-TEST',
                item_id: 'item-TEST'
              }
            };
          },
          async executeBoundSpec(spec, tabId) {
            specCalls.push({ spec: spec, tabId: tabId });
            const url = new URL(spec.url);
            if (url.pathname === '/v1.0/me') {
              return {
                success: true,
                status: 200,
                data: {
                  id: 'user-TEST',
                  displayName: 'Word User',
                  mail: 'word@example.invalid',
                  userPrincipalName: 'word-upn@example.invalid'
                }
              };
            }
            if (url.pathname === '/v1.0/me/drive/root/children') {
              return {
                success: true,
                status: 200,
                data: {
                  value: [{
                    id: 'item-child-TEST',
                    name: 'Document.docx',
                    size: 1234,
                    file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
                    webUrl: 'https://word.cloud.microsoft/document',
                    createdDateTime: '2026-07-01T00:00:00Z',
                    lastModifiedDateTime: '2026-07-01T01:00:00Z',
                    parentReference: { id: 'root', path: '/drive/root:' }
                  }]
                }
              };
            }
            return {
              success: true,
              status: 200,
              data: {
                id: 'item-TEST',
                name: 'Document.docx',
                size: 1234,
                file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
                webUrl: 'https://word.cloud.microsoft/document',
                parentReference: { driveId: 'drive-TEST', id: 'root', path: '/drive/root:' }
              }
            };
          }
        }
      };
    }

    const mswUser = makeMswordCtx();
    const mswUserOut = await msw['msword.get_current_user'].handle({}, mswUser.ctx);
    check(mswUser.pageCalls.length === 1
      && mswUser.pageCalls[0].tabId === 174
      && mswUser.pageCalls[0].request.origin === 'https://word.cloud.microsoft'
      && mswUser.pageCalls[0].request.namespace === 'microsoft-word'
      && mswUser.pageCalls[0].request.action === 'auth_context',
      'msword.get_current_user requests the bounded Microsoft Word auth_context page read');
    check(mswUser.specCalls.length === 1
      && mswUser.specCalls[0].spec.method === 'GET'
      && mswUser.specCalls[0].spec.origin === 'https://word.cloud.microsoft'
      && mswUser.specCalls[0].spec.url.indexOf('https://graph.microsoft.com/v1.0/me') === 0
      && mswUser.specCalls[0].spec.headers.Authorization === 'Bearer msword-token-TEST-SYNTHETIC'
      && mswUser.specCalls[0].spec.authStrategy === 'none'
      && mswUser.specCalls[0].spec.credentials === 'omit',
      'msword.get_current_user builds one pinned Microsoft Graph GET using the page bearer token');
    check(mswUserOut && mswUserOut.success === true
      && mswUserOut.data && mswUserOut.data.user && mswUserOut.data.user.id === 'user-TEST'
      && mswUserOut.data.user.display_name === 'Word User'
      && JSON.stringify(mswUserOut).indexOf('msword-token-TEST-SYNTHETIC') === -1,
      'msword.get_current_user maps the Graph user shape without echoing bearer material');

    const mswChildren = makeMswordCtx();
    const mswChildrenOut = await msw['msword.list_children'].handle({ top: 2 }, mswChildren.ctx);
    const mswChildrenUrl = mswChildren.specCalls[0] ? new URL(mswChildren.specCalls[0].spec.url) : null;
    check(mswChildren.specCalls.length === 1
      && mswChildrenUrl && mswChildrenUrl.pathname === '/v1.0/me/drive/root/children'
      && mswChildrenUrl.searchParams.get('$top') === '2'
      && mswChildrenUrl.searchParams.get('$select'),
      'msword.list_children builds the Microsoft Graph root children GET with top/select query params');
    check(mswChildrenOut && mswChildrenOut.success === true
      && mswChildrenOut.data && Array.isArray(mswChildrenOut.data.items)
      && mswChildrenOut.data.items[0].id === 'item-child-TEST'
      && mswChildrenOut.data.items[0].mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'msword.list_children maps Graph driveItem values into item summaries');

    const mswDocText = makeMswordCtx();
    const mswDocTextOut = await msw['msword.get_document_text'].handle({ item_id: 'item-TEST' }, mswDocText.ctx);
    check(mswDocTextOut && mswDocTextOut.success === false
      && mswDocTextOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mswDocTextOut.reason === 'msword-docx-binary-parser-unavailable'
      && mswDocText.pageCalls.length === 0
      && mswDocText.specCalls.length === 0,
      'msword.get_document_text remains fail-closed until a reviewed docx parser is available');

    const mswAppendCalls = [];
    const mswAppendOut = await msw['msword.append_to_document'].handle({
      item_id: 'doc-test',
      paragraphs: ['hello']
    }, {
      tabId: 174,
      async executeBoundSpec() { mswAppendCalls.push('spec'); },
      async executeBoundPageRead() { mswAppendCalls.push('page'); }
    });
    check(mswAppendOut && mswAppendOut.success === false
      && mswAppendOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mswAppendOut.errorCode === mswAppendOut.code
      && mswAppendOut.error === mswAppendOut.code
      && mswAppendOut.fellBackToDom === true
      && mswAppendCalls.length === 0,
      'msword.append_to_document is guarded fail-closed and calls no execution primitive');

    const mswDeleteCalls = [];
    const mswDeleteOut = await msw['msword.delete_item'].handle({ item_id: 'doc-test' }, {
      tabId: 175,
      async executeBoundSpec() { mswDeleteCalls.push('spec'); },
      async executeBoundPageRead() { mswDeleteCalls.push('page'); }
    });
    check(mswDeleteOut && mswDeleteOut.success === false
      && mswDeleteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && mswDeleteOut.errorCode === mswDeleteOut.code
      && mswDeleteOut.error === mswDeleteOut.code
      && mswDeleteOut.fellBackToDom === true
      && mswDeleteCalls.length === 0,
      'msword.delete_item is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Discord same-origin API read + guarded mutation head -- catalog/handlers/discord.js
  // =========================================================================
  const discordPath = path.join(HANDLERS_DIR, 'discord.js');
  check(fs.existsSync(discordPath), 'catalog/handlers/discord.js exists');
  if (fs.existsSync(discordPath)) {
    const dc = require(discordPath);
    const dcSrc = readSource(discordPath);
    const discordReadSlugs = [
      'discord.get_channel_info',
      'discord.get_guild_info',
      'discord.get_message',
      'discord.get_user_profile',
      'discord.list_channels',
      'discord.list_dms',
      'discord.list_guilds',
      'discord.list_members',
      'discord.list_pinned_messages',
      'discord.list_roles',
      'discord.read_messages',
      'discord.read_thread',
      'discord.search_messages'
    ];
    const discordGuardedSlugs = [
      'discord.add_reaction',
      'discord.create_channel',
      'discord.create_thread',
      'discord.delete_channel',
      'discord.delete_message',
      'discord.edit_channel',
      'discord.edit_message',
      'discord.open_dm',
      'discord.pin_message',
      'discord.remove_reaction',
      'discord.send_message',
      'discord.unpin_message',
      'discord.upload_file'
    ];
    check(discordReadSlugs.every(function(slug) {
      return dc[slug] && dc[slug].tier === 'T1a'
        && dc[slug].origin === 'https://discord.com'
        && dc[slug].sideEffectClass === 'read'
        && typeof dc[slug].handle === 'function';
    }), 'Discord read descriptors are T1a reads pinned to discord.com');
    check(discordGuardedSlugs.every(function(slug) {
      return dc[slug] && dc[slug].tier === 'T1a'
        && dc[slug].origin === 'https://discord.com'
        && dc[slug].sideEffectClass !== 'read'
        && typeof dc[slug].handle === 'function';
    }), 'Discord mutation descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs)/.test(dcSrc),
      'discord.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(dcSrc) && !/\bXMLHttpRequest\s*\(/.test(dcSrc),
      'discord.js performs no direct network call');
    check(!/localStorage|sessionStorage|document\.cookie/.test(dcSrc),
      'discord.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(dcSrc),
      'discord.js does NOT console-log a secret-bearing variable');

    const dcGuilds = makeCtx('https://discord.com', 171);
    const dcGuildsOut = await dc['discord.list_guilds'].handle({ limit: 5 }, dcGuilds.ctx);
    check(dcGuilds.calls.length === 1
      && dcGuilds.calls[0].tabId === 171
      && dcGuilds.calls[0].spec.url === 'https://discord.com/api/v9/users/@me/guilds?limit=5'
      && dcGuilds.calls[0].spec.origin === 'https://discord.com'
      && dcGuilds.calls[0].spec.authSource
      && dcGuilds.calls[0].spec.authSource.from === 'discord-webpack-token'
      && dcGuilds.calls[0].spec.authSource.header === 'Authorization',
      'discord.list_guilds builds one pinned Discord API GET spec with the Discord auth-source hook');
    check(dcGuildsOut && dcGuildsOut.success === true
      && Array.isArray(dcGuildsOut.data) && dcGuildsOut.data[0].id === 'guild-test',
      'discord.list_guilds accepts expected guild-array response shape');

    const dcMessage = makeCtx('https://discord.com', 172);
    const dcMessageOut = await dc['discord.get_message'].handle({ channel: 'channel-test', message_id: 'message-test' }, dcMessage.ctx);
    check(dcMessage.calls.length === 1
      && dcMessage.calls[0].spec.url === 'https://discord.com/api/v9/channels/channel-test/messages?around=message-test&limit=3',
      'discord.get_message uses the around+limit messages endpoint');
    check(dcMessageOut && dcMessageOut.success === true
      && dcMessageOut.data && dcMessageOut.data.message && dcMessageOut.data.message.id === 'message-test',
      'discord.get_message selects the requested message from the around response');

    const dcBadShape = makeCtx('https://discord.com', 173, { discordData: { message: '401: Unauthorized', code: 0 } });
    const dcBadShapeOut = await dc['discord.read_messages'].handle({ channel: 'channel-test' }, dcBadShape.ctx);
    check(dcBadShapeOut && dcBadShapeOut.success === false
      && dcBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dcBadShapeOut.reason === 'discord-api-auth-or-rot',
      'discord.read_messages fails closed on Discord error envelopes');

    const dcGuardCalls = [];
    const dcGuardOut = await dc['discord.send_message'].handle({
      channel: 'channel-test',
      content: 'hello'
    }, {
      origin: 'https://discord.com',
      tabId: 174,
      async executeBoundSpec() { dcGuardCalls.push('spec'); },
      async executeBoundPageRead() { dcGuardCalls.push('page'); }
    });
    check(dcGuardOut && dcGuardOut.success === false
      && dcGuardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dcGuardOut.fellBackToDom === true
      && dcGuardCalls.length === 0,
      'discord.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Webflow same-origin /api read head -- catalog/handlers/webflow.js
  // =========================================================================
  const webflowPath = path.join(HANDLERS_DIR, 'webflow.js');
  check(fs.existsSync(webflowPath), 'catalog/handlers/webflow.js exists');
  if (fs.existsSync(webflowPath)) {
    const wf = require(webflowPath);
    const wfSrc = readSource(webflowPath);
    const webflowReadSlugs = [
      'webflow.get_current_user',
      'webflow.get_site',
      'webflow.get_site_domains',
      'webflow.get_site_hosting',
      'webflow.get_site_pages',
      'webflow.get_site_permissions',
      'webflow.get_workspace',
      'webflow.get_workspace_billing',
      'webflow.get_workspace_entitlements',
      'webflow.get_workspace_permissions',
      'webflow.list_folders',
      'webflow.list_site_forms',
      'webflow.list_sites',
      'webflow.list_workspace_members',
      'webflow.list_workspaces'
    ];

    check(webflowReadSlugs.every(function(slug) {
      return wf[slug] && wf[slug].tier === 'T1a'
        && wf[slug].origin === 'https://webflow.com'
        && wf[slug].sideEffectClass === 'read'
        && wf[slug].params
        && typeof wf[slug].handle === 'function';
    }), 'Webflow read descriptors are T1a reads pinned to webflow.com');
    check(!/chrome\.(scripting|tabs)/.test(wfSrc),
      'webflow.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(wfSrc) && !/\bXMLHttpRequest\s*\(/.test(wfSrc),
      'webflow.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(wfSrc),
      'webflow.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(wfSrc),
      'webflow.js does NOT console-log a secret-bearing variable');

    const wfCalls = [];
    const wfCtx = {
      tabId: 176,
      async executeBoundSpec(spec, tabId) {
        wfCalls.push({ spec: spec, tabId: tabId });
        if (spec.url === 'https://webflow.com/api/workspaces') {
          return {
            success: true,
            status: 200,
            data: {
              workspaces: [{
                _id: 'workspace-test',
                name: 'FSB Workspace',
                slug: 'workspace-test',
                role: 'owner',
                siteCount: 2,
                usedSeats: 1,
                totalSeats: 3,
                createdOn: '2026-06-30T00:00:00.000Z'
              }]
            }
          };
        }
        if (spec.url === 'https://webflow.com/api/workspaces/workspace-test/sites?page=2') {
          return {
            success: true,
            status: 200,
            data: {
              sites: [{
                _id: 'site-test',
                name: 'FSB Site',
                shortName: 'fsb-site',
                archived: false,
                createdOn: '2026-06-30T00:00:00.000Z',
                lastUpdated: '2026-06-30T01:00:00.000Z',
                lastPublished: null,
                previewUrl: 'https://preview.example.invalid/site.png',
                workspace: 'workspace-test'
              }],
              paginationMetadata: {
                page: 2,
                pageSize: 20,
                totalCount: 21,
                totalPages: 2
              }
            }
          };
        }
        if (spec.url === 'https://webflow.com/api/sites/site-test/domains') {
          return {
            success: true,
            status: 200,
            data: {
              site: {
                _id: 'site-test',
                name: 'FSB Site',
                shortName: 'fsb-site',
                timezone: 'America/Chicago',
                sslHosting: true,
                formSubmissions: 7,
                styleCount: 11,
                assetSize: 1234
              },
              domains: [],
              subdomain: {
                _id: 'subdomain-test',
                name: 'fsb-site.webflow.io',
                stage: 'staging',
                hasValidSSL: true
              }
            }
          };
        }
        return { success: true, status: 200, data: { unexpected: true } };
      }
    };

    const wfWorkspaces = await wf['webflow.list_workspaces'].handle({}, wfCtx);
    check(wfCalls.length === 1
      && wfCalls[0].tabId === 176
      && wfCalls[0].spec.url === 'https://webflow.com/api/workspaces'
      && wfCalls[0].spec.method === 'GET'
      && wfCalls[0].spec.origin === 'https://webflow.com'
      && wfCalls[0].spec.authStrategy === 'same-origin-cookie',
      'webflow.list_workspaces builds one pinned Webflow /api GET spec');
    check(wfWorkspaces && wfWorkspaces.success === true
      && wfWorkspaces.data.workspaces[0].slug === 'workspace-test'
      && wfWorkspaces.data.workspaces[0].site_count === 2,
      'webflow.list_workspaces maps workspace response data');

    const wfSites = await wf['webflow.list_sites'].handle({ workspace_slug: 'workspace-test', page: 2 }, wfCtx);
    check(wfCalls.length === 2
      && wfCalls[1].spec.url === 'https://webflow.com/api/workspaces/workspace-test/sites?page=2',
      'webflow.list_sites includes workspace slug and page query in the bound spec');
    check(wfSites && wfSites.success === true
      && wfSites.data.sites[0].short_name === 'fsb-site'
      && wfSites.data.total_count === 21
      && wfSites.data.page === 2,
      'webflow.list_sites maps paginated site response data');

    const wfSite = await wf['webflow.get_site'].handle({ site_short_name: 'site-test' }, wfCtx);
    check(wfCalls.length === 3
      && wfCalls[2].spec.url === 'https://webflow.com/api/sites/site-test/domains',
      'webflow.get_site uses the reviewed domains endpoint that carries site details');
    check(wfSite && wfSite.success === true
      && wfSite.data.site.short_name === 'fsb-site'
      && wfSite.data.site.ssl_hosting === true,
      'webflow.get_site maps site detail response data');

    const wfBadShapeOut = await wf['webflow.list_folders'].handle({ workspace_slug: 'workspace-test' }, wfCtx);
    check(wfBadShapeOut && wfBadShapeOut.success === false
      && wfBadShapeOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && wfBadShapeOut.reason === 'webflow-shape-mismatch',
      'webflow.list_folders fails closed on unexpected Webflow response shape');

    const wfNoPrimitive = await wf['webflow.get_current_user'].handle({}, { tabId: 177 });
    check(wfNoPrimitive && wfNoPrimitive.success === false
      && wfNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && wfNoPrimitive.reason === 'webflow-execute-bound-spec-unavailable',
      'webflow.get_current_user fails closed when executeBoundSpec is unavailable');
  }

  // =========================================================================
  // Calendly same-origin internal API read head -- catalog/handlers/calendly.js
  // =========================================================================
  const calendlyPath = path.join(HANDLERS_DIR, 'calendly.js');
  const calendlyExtPath = path.join(EXT_HANDLERS_DIR, 'calendly.js');
  check(fs.existsSync(calendlyPath), 'catalog/handlers/calendly.js exists');
  if (fs.existsSync(calendlyPath)) {
    const calendly = require(calendlyPath);
    const calendlySrc = readSource(calendlyPath);
    const calendlyOrigin = 'https://calendly.com';
    const calendlyReadSlugs = [
      'calendly.get_current_user',
      'calendly.get_event_type',
      'calendly.get_organization',
      'calendly.get_organization_statistics',
      'calendly.get_user_busy_times',
      'calendly.get_user_permissions',
      'calendly.list_calendar_accounts',
      'calendly.list_event_types',
      'calendly.list_scheduled_events'
    ];
    const calendlyGuardedSlugs = [
      'calendly.activate_event_type',
      'calendly.clone_event_type',
      'calendly.create_event_type',
      'calendly.deactivate_event_type',
      'calendly.delete_event_type',
      'calendly.update_event_type'
    ];

    check(calendlyReadSlugs.every(function(slug) {
      return calendly[slug] && calendly[slug].tier === 'T1a'
        && calendly[slug].origin === calendlyOrigin
        && calendly[slug].sideEffectClass === 'read'
        && calendly[slug].params
        && typeof calendly[slug].handle === 'function';
    }), 'Calendly read descriptors are T1a reads pinned to calendly.com');
    check(calendlyGuardedSlugs.every(function(slug) {
      return calendly[slug] && calendly[slug].tier === 'T1a'
        && calendly[slug].origin === calendlyOrigin
        && calendly[slug].sideEffectClass !== 'read'
        && calendly[slug].params
        && typeof calendly[slug].handle === 'function';
    }), 'Calendly event-type mutations are guarded T1a write/destructive rows pinned to calendly.com');
    check(calendly['calendly.delete_event_type'].sideEffectClass === 'destructive',
      'calendly.delete_event_type is classified as a guarded destructive row');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(calendlySrc),
      'calendly.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(calendlySrc) && !/\bXMLHttpRequest\s*\(/.test(calendlySrc),
      'calendly.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(calendlySrc),
      'calendly.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer|session)/i.test(calendlySrc),
      'calendly.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(calendlyExtPath) ? readSource(calendlyExtPath) === calendlySrc : true,
      'extension/catalog/handlers/calendly.js matches catalog/handlers/calendly.js when present');

    function calendlyEventType(id) {
      return {
        id: id || 123,
        uuid: 'event-type-uuid',
        name: 'Discovery Call',
        slug: 'discovery-call',
        description: 'Introductory meeting',
        duration_minutes: 30,
        kind: 'solo',
        type: 'StandardEventType',
        color: '#0069ff',
        active: true,
        public: true,
        booking_url: 'https://calendly.com/fsb/discovery-call',
        location_configurations: [{ id: 1, kind: 'zoom', position: 0, location: 'Zoom' }],
        custom_fields: [{ id: 2, name: 'Company', format: 'string', required: true, enabled: true, position: 1 }],
        invitees_limit: 1,
        owning_user_name: 'Calendly User'
      };
    }

    function makeCalendlyCtx(options) {
      const calls = [];
      const opts = options || {};
      return {
        calls,
        ctx: {
          tabId: 178,
          async executeBoundSpec(spec, tabId) {
            calls.push({ spec: spec, tabId: tabId });
            if (spec.url === 'https://calendly.com/') {
              return {
                success: true,
                status: 200,
                text: opts.missingCsrf
                  ? '<html><head></head></html>'
                  : '<html><head><meta name="csrf-token" content="csrf-fixture"></head></html>'
              };
            }
            if (spec.url === 'https://calendly.com/api/user') {
              return {
                success: true,
                status: 200,
                data: {
                  id: 7,
                  uuid: 'user-uuid',
                  name: 'Calendly User',
                  email: 'calendly@example.invalid',
                  booking_url: 'https://calendly.com/fsb',
                  avatar_url: 'https://calendly.com/avatar.png',
                  timezone: 'America/Chicago',
                  locale: 'en',
                  country_code: 'US',
                  created_at: '2026-07-01T00:00:00.000Z',
                  date_notation: 'MM/DD/YYYY',
                  time_notation: '12h',
                  events_count: 3,
                  is_branded: true
                }
              };
            }
            if (spec.url.indexOf('https://calendly.com/api/users/me/event_types') === 0
                && spec.url.indexOf('/api/users/me/event_types/') === -1) {
              return {
                success: true,
                status: 200,
                data: {
                  results: [{ event_types: [calendlyEventType(123)] }],
                  pagination: { total_count: 1, current_page: 2, total_pages: 2, next_page: null }
                }
              };
            }
            if (spec.url === 'https://calendly.com/api/users/me/event_types/123') {
              return { success: true, status: 200, data: calendlyEventType(123) };
            }
            if (spec.url.indexOf('https://calendly.com/api/scheduled_events/events') === 0) {
              return {
                success: true,
                status: 200,
                data: {
                  results: [{
                    events: [{
                      id: 88,
                      uuid: 'scheduled-event-uuid',
                      name: 'Discovery Call',
                      cancelled: false,
                      start_time: '2026-07-02T15:00:00.000Z',
                      end_time: '2026-07-02T15:30:00.000Z',
                      location_type: 'zoom',
                      external_location: { join_url: 'https://zoom.example.invalid/j/1' },
                      event_type: { id: 123, name: 'Discovery Call' },
                      invitee: { name: 'Invitee One', email: 'invitee@example.invalid' },
                      scheduled_at: '2026-07-01T10:00:00.000Z'
                    }]
                  }],
                  pagination: { total_count: 1, current_page: 1, total_pages: 1, next_page: null }
                }
              };
            }
            if (spec.url === 'https://calendly.com/api/policy') {
              return { success: true, status: 200, data: { can_create_team: true, can_manage_sso: false } };
            }
            if (spec.url === 'https://calendly.com/api/calendar_accounts') {
              return { success: true, status: 200, data: [{ uuid: 'cal-uuid', kind: 'google', name: 'Work', email: 'cal@example.invalid', pull_enabled: true, push_enabled: false, calendars: [] }] };
            }
            if (spec.url.indexOf('https://calendly.com/api/user_busy_times') === 0) {
              return { success: true, status: 200, data: [{ type: 'busy', start_time: '2026-07-02T15:00:00.000Z', end_time: '2026-07-02T15:30:00.000Z' }] };
            }
            return { success: false, status: 404, data: { error: 'unexpected fixture URL ' + spec.url } };
          }
        }
      };
    }

    const calEventsCtx = makeCalendlyCtx();
    const calEventTypes = await calendly['calendly.list_event_types'].handle({ page: 2 }, calEventsCtx.ctx);
    check(calEventsCtx.calls.length === 2
      && calEventsCtx.calls[0].spec.url === 'https://calendly.com/'
      && calEventsCtx.calls[0].spec.method === 'GET'
      && calEventsCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && calEventsCtx.calls[1].spec.url === 'https://calendly.com/api/users/me/event_types?scope=my_calendly&page=2'
      && calEventsCtx.calls[1].spec.headers['X-CSRF-Token'] === 'csrf-fixture'
      && calEventsCtx.calls[1].spec.headers['X-Requested-With'] === 'XMLHttpRequest'
      && calEventsCtx.calls[1].spec.origin === calendlyOrigin
      && calEventsCtx.calls[1].tabId === 178,
      'calendly.list_event_types bootstraps CSRF then builds one pinned /api event-types GET spec');
    check(calEventTypes && calEventTypes.success === true
      && calEventTypes.data.event_types[0].slug === 'discovery-call'
      && calEventTypes.data.event_types[0].duration_minutes === 30
      && calEventTypes.data.pagination.current_page === 2,
      'calendly.list_event_types maps event type and pagination data');

    const calUserCtx = makeCalendlyCtx();
    const calUser = await calendly['calendly.get_current_user'].handle({}, calUserCtx.ctx);
    check(calUserCtx.calls.length === 2
      && calUserCtx.calls[1].spec.url === 'https://calendly.com/api/user'
      && calUser && calUser.success === true
      && calUser.data.user.email === 'calendly@example.invalid',
      'calendly.get_current_user maps authenticated user profile fields');

    const calScheduledCtx = makeCalendlyCtx();
    const calScheduled = await calendly['calendly.list_scheduled_events'].handle({ status: 'active', page: 1 }, calScheduledCtx.ctx);
    check(calScheduledCtx.calls.length === 2
      && calScheduledCtx.calls[1].spec.url === 'https://calendly.com/api/scheduled_events/events?status=active&page=1'
      && calScheduled && calScheduled.success === true
      && calScheduled.data.events[0].invitee_email === 'invitee@example.invalid',
      'calendly.list_scheduled_events builds status/page query and maps scheduled event data');

    const calMissingCsrfCtx = makeCalendlyCtx({ missingCsrf: true });
    const calMissingCsrf = await calendly['calendly.get_event_type'].handle({ event_type_id: 123 }, calMissingCsrfCtx.ctx);
    check(calMissingCsrfCtx.calls.length === 1
      && calMissingCsrf && calMissingCsrf.success === false
      && calMissingCsrf.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && calMissingCsrf.reason === 'calendly-bootstrap-csrf-missing',
      'calendly.get_event_type fails closed after bootstrap when CSRF meta is absent');

    const calGuardCalls = [];
    const calGuarded = await calendly['calendly.create_event_type'].handle({ name: 'Demo', slug: 'demo' }, {
      tabId: 179,
      async executeBoundSpec() { calGuardCalls.push('spec'); }
    });
    check(calGuardCalls.length === 0
      && calGuarded && calGuarded.success === false
      && calGuarded.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && calGuarded.reason === 'unverified-calendly-create-event-type-mutation',
      'calendly.create_event_type is guarded fail-closed and does not call executeBoundSpec');
  }

  // =========================================================================
  // YNAB same-origin internal API read head -- catalog/handlers/ynab.js
  // =========================================================================
  const ynabPath = path.join(HANDLERS_DIR, 'ynab.js');
  check(fs.existsSync(ynabPath), 'catalog/handlers/ynab.js exists');
  if (fs.existsSync(ynabPath)) {
    const ynab = require(ynabPath);
    const ynabSrc = readSource(ynabPath);
    const ynabOrigin = 'https://app.ynab.com';
    const ynabPlanId = '11111111-2222-3333-4444-555555555555';
    const ynabReadSlugs = [
      'ynab.get_account',
      'ynab.get_current_user',
      'ynab.get_month',
      'ynab.get_plan',
      'ynab.get_transaction',
      'ynab.list_accounts',
      'ynab.list_categories',
      'ynab.list_months',
      'ynab.list_payees',
      'ynab.list_scheduled_transactions',
      'ynab.list_transactions'
    ];
    const ynabGuardedSlugs = [
      'ynab.create_category',
      'ynab.create_category_group',
      'ynab.create_transaction',
      'ynab.delete_category',
      'ynab.delete_category_group',
      'ynab.delete_transaction',
      'ynab.move_category_budget',
      'ynab.snooze_category_goal',
      'ynab.update_category',
      'ynab.update_category_budget',
      'ynab.update_transaction'
    ];

    check(ynabReadSlugs.every(function(slug) {
      return ynab[slug] && ynab[slug].tier === 'T1a'
        && ynab[slug].origin === ynabOrigin
        && ynab[slug].sideEffectClass === 'read'
        && ynab[slug].params
        && typeof ynab[slug].handle === 'function';
    }), 'YNAB read descriptors are T1a reads pinned to app.ynab.com');
    check(ynabGuardedSlugs.every(function(slug) {
      return ynab[slug] && ynab[slug].tier === 'T1a'
        && ynab[slug].origin === ynabOrigin
        && ynab[slug].sideEffectClass !== 'read'
        && ynab[slug].params
        && typeof ynab[slug].handle === 'function';
    }), 'YNAB mutation descriptors are guarded T1a write/destructive rows pinned to app.ynab.com');
    check(ynab['ynab.snooze_category_goal'].sideEffectClass === 'write',
      'ynab.snooze_category_goal is classified as a guarded write');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(ynabSrc),
      'ynab.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(ynabSrc) && !/\bXMLHttpRequest\s*\(/.test(ynabSrc),
      'ynab.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(ynabSrc),
      'ynab.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(ynabSrc),
      'ynab.js does NOT console-log a secret-bearing variable');

    function ynabEntities() {
      return {
        be_accounts: [{
          id: 'account-1',
          account_name: 'Checking',
          account_type: 'checking',
          on_budget: true,
          is_closed: false,
          note: 'Primary'
        }],
        be_account_calculations: [{
          entities_account_id: 'account-1',
          cleared_balance: 123450,
          uncleared_balance: 550
        }],
        be_master_categories: [{ id: 'group-1', name: 'Everyday', is_hidden: false }],
        be_subcategories: [{
          id: 'cat-1',
          entities_master_category_id: 'group-1',
          name: 'Groceries',
          is_hidden: false,
          budgeted: 100000,
          activity: -25000,
          balance: 75000,
          goal_type: 'MF',
          monthly_funding: 200000,
          goal_percentage_complete: 50
        }],
        be_monthly_budgets: [{ id: 'budget/2026-06', month: '2026-06-01' }],
        be_monthly_budget_calculations: [{
          entities_monthly_budget_id: 'budget/2026-06',
          immediate_income: 5000000,
          budgeted: 100000,
          cash_outflows: -25000,
          credit_outflows: 0,
          available_to_budget: 4900000,
          age_of_money: 20
        }],
        be_monthly_subcategory_budgets: [{ id: 'budget/2026-06/cat-1', budgeted: 100000 }],
        be_monthly_subcategory_budget_calculations: [{
          entities_monthly_subcategory_budget_id: 'budget/2026-06/cat-1',
          cash_outflows: -25000,
          credit_outflows: 0,
          balance: 75000,
          goal_percentage_complete: 50
        }],
        be_payees: [{ id: 'payee-1', name: 'Grocery Store', entities_account_id: '' }],
        be_transactions: [{
          id: 'tx-1',
          date: '2026-06-30',
          amount: -25000,
          memo: 'fixture transaction',
          cleared: 'Cleared',
          accepted: true,
          flag: 'Blue',
          entities_account_id: 'account-1',
          entities_payee_id: 'payee-1',
          entities_subcategory_id: 'cat-1',
          imported_payee: '',
          original_imported_payee: '',
          imported_date: '2026-06-30',
          ynab_id: 'ynab-tx-1',
          source: 'manual'
        }],
        be_subtransactions: [{
          id: 'sub-1',
          entities_transaction_id: 'tx-1',
          amount: -5000,
          memo: 'split',
          entities_payee_id: 'payee-1',
          entities_subcategory_id: 'cat-1'
        }],
        be_scheduled_transactions: [{
          id: 'scheduled-1',
          date: '2026-07-01',
          upcoming_instances: ['2026-07-01'],
          frequency: 'monthly',
          amount: -10000,
          memo: 'scheduled',
          flag: 'Green',
          entities_account_id: 'account-1',
          entities_payee_id: 'payee-1',
          entities_subcategory_id: 'cat-1'
        }]
      };
    }

    function makeYnabCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        tabId: opts.tabId || 181,
        currentUrl: ynabOrigin + '/' + ynabPlanId + '/budget',
        calls: calls,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (spec.url === ynabOrigin + '/' + ynabPlanId + '/budget') {
            const meta = opts.missingSessionToken ? '' : '<meta name="session-token" content="session-token-fixture">';
            return {
              success: true,
              status: 200,
              text: '<html><head>' + meta + '<script>window.YNAB_APP_VERSION="2026.6.30"</script></head></html>'
            };
          }
          if (spec.url === ynabOrigin + '/api/v2/user') {
            return {
              success: true,
              status: 200,
              data: { id: 'user-1', first_name: 'Ada', email: 'ada@example.invalid' }
            };
          }
          if (spec.url === ynabOrigin + '/api/v1/catalog') {
            const body = new URLSearchParams(spec.body || '');
            const operation = body.get('operation_name');
            if (operation === 'syncBudgetData') {
              return { success: true, status: 200, data: { changed_entities: ynabEntities() } };
            }
            if (operation === 'getInitialUserData') {
              return {
                success: true,
                status: 200,
                data: {
                  budget_version: {
                    id: ynabPlanId,
                    budget_id: 'budget-id',
                    budget_name: 'FSB Budget',
                    date_format: JSON.stringify({ format: 'MM/DD/YYYY' }),
                    currency_format: JSON.stringify({ currency_symbol: '$', iso_code: 'USD' })
                  }
                }
              };
            }
          }
          return { success: true, status: 200, data: { unexpected: true } };
        }
      };
    }

    const ynabAccountsCtx = makeYnabCtx();
    const ynabAccounts = await ynab['ynab.list_accounts'].handle({}, ynabAccountsCtx);
    const ynabBudgetBody = new URLSearchParams(ynabAccountsCtx.calls[1] && ynabAccountsCtx.calls[1].spec.body || '');
    const ynabBudgetRequest = JSON.parse(ynabBudgetBody.get('request_data') || '{}');
    check(ynabAccountsCtx.calls.length === 2
      && ynabAccountsCtx.calls[0].tabId === 181
      && ynabAccountsCtx.calls[0].spec.url === ynabOrigin + '/' + ynabPlanId + '/budget'
      && ynabAccountsCtx.calls[0].spec.method === 'GET'
      && ynabAccountsCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && ynabAccountsCtx.calls[1].spec.url === ynabOrigin + '/api/v1/catalog'
      && ynabAccountsCtx.calls[1].spec.method === 'POST'
      && ynabAccountsCtx.calls[1].spec.headers['X-Session-Token'] === 'session-token-fixture'
      && ynabBudgetBody.get('operation_name') === 'syncBudgetData'
      && ynabBudgetRequest.budget_version_id === ynabPlanId,
      'ynab.list_accounts bootstraps auth and builds one pinned syncBudgetData POST spec');
    check(ynabAccounts && ynabAccounts.success === true
      && ynabAccounts.data.accounts[0].id === 'account-1'
      && ynabAccounts.data.accounts[0].balance === '124.00',
      'ynab.list_accounts maps account and balance response data');

    const ynabUserCtx = makeYnabCtx({ tabId: 182 });
    const ynabUser = await ynab['ynab.get_current_user'].handle({}, ynabUserCtx);
    check(ynabUserCtx.calls.length === 2
      && ynabUserCtx.calls[1].spec.url === ynabOrigin + '/api/v2/user'
      && ynabUserCtx.calls[1].spec.method === 'GET'
      && ynabUserCtx.calls[1].spec.origin === ynabOrigin,
      'ynab.get_current_user builds one pinned /api/v2/user GET after bootstrap');
    check(ynabUser && ynabUser.success === true
      && ynabUser.data.user.id === 'user-1'
      && ynabUser.data.user.email === 'ada@example.invalid',
      'ynab.get_current_user maps user response data');

    const ynabTxCtx = makeYnabCtx({ tabId: 183 });
    const ynabTx = await ynab['ynab.get_transaction'].handle({ transaction_id: 'tx-1' }, ynabTxCtx);
    check(ynabTx && ynabTx.success === true
      && ynabTx.data.transaction.id === 'tx-1'
      && ynabTx.data.transaction.account_name === 'Checking'
      && ynabTx.data.transaction.amount === '-25.00'
      && ynabTx.data.subtransactions[0].amount === '-5.00',
      'ynab.get_transaction maps transaction, lookups, and split response data');

    const ynabPlanCtx = makeYnabCtx({ tabId: 184 });
    const ynabPlan = await ynab['ynab.get_plan'].handle({}, ynabPlanCtx);
    const ynabPlanBody = new URLSearchParams(ynabPlanCtx.calls[1] && ynabPlanCtx.calls[1].spec.body || '');
    check(ynabPlanBody.get('operation_name') === 'getInitialUserData'
      && ynabPlan && ynabPlan.success === true
      && ynabPlan.data.plan.name === 'FSB Budget',
      'ynab.get_plan uses getInitialUserData and maps plan metadata');

    const ynabBadCtx = makeYnabCtx({ missingSessionToken: true, tabId: 185 });
    const ynabBad = await ynab['ynab.list_accounts'].handle({}, ynabBadCtx);
    check(ynabBad && ynabBad.success === false
      && ynabBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ynabBad.reason === 'ynab-bootstrap-auth-incomplete'
      && ynabBadCtx.calls.length === 1,
      'ynab.list_accounts fails closed when the session token bootstrap is incomplete');

    const ynabGuardCalls = [];
    const ynabGuard = await ynab['ynab.snooze_category_goal'].handle({ category_id: 'cat-1', month: '2026-06' }, {
      tabId: 186,
      async executeBoundSpec() { ynabGuardCalls.push('spec'); }
    });
    check(ynabGuard && ynabGuard.success === false
      && ynabGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ynabGuard.fellBackToDom === true
      && ynabGuard.reason === 'unverified-ynab-snooze-category-goal-mutation'
      && ynabGuardCalls.length === 0,
      'ynab.snooze_category_goal is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Coinbase same-origin GraphQL read head -- catalog/handlers/coinbase.js
  // =========================================================================
  const coinbasePath = path.join(HANDLERS_DIR, 'coinbase.js');
  check(fs.existsSync(coinbasePath), 'catalog/handlers/coinbase.js exists');
  if (fs.existsSync(coinbasePath)) {
    const coinbase = require(coinbasePath);
    const coinbaseSrc = readSource(coinbasePath);
    const coinbaseOrigin = 'https://www.coinbase.com';
    const coinbaseReadSlugs = [
      'coinbase.compare_asset_prices',
      'coinbase.get_asset_by_slug',
      'coinbase.get_asset_by_symbol',
      'coinbase.get_asset_by_uuid',
      'coinbase.get_asset_categories',
      'coinbase.get_asset_networks',
      'coinbase.get_asset_price',
      'coinbase.get_current_user',
      'coinbase.list_portfolios',
      'coinbase.list_price_alerts',
      'coinbase.list_watchlists'
    ];
    const coinbaseGuardedSlugs = [
      'coinbase.add_watchlist_item',
      'coinbase.create_price_alert',
      'coinbase.create_watchlist',
      'coinbase.delete_price_alert',
      'coinbase.delete_watchlist',
      'coinbase.remove_watchlist_item'
    ];

    check(coinbaseReadSlugs.every(function(slug) {
      return coinbase[slug] && coinbase[slug].tier === 'T1a'
        && coinbase[slug].origin === coinbaseOrigin
        && coinbase[slug].sideEffectClass === 'read'
        && coinbase[slug].params
        && typeof coinbase[slug].handle === 'function';
    }), 'Coinbase read descriptors are T1a reads pinned to www.coinbase.com');
    check(coinbaseGuardedSlugs.every(function(slug) {
      return coinbase[slug] && coinbase[slug].tier === 'T1a'
        && coinbase[slug].origin === coinbaseOrigin
        && coinbase[slug].sideEffectClass !== 'read'
        && coinbase[slug].params
        && typeof coinbase[slug].handle === 'function';
    }), 'Coinbase mutation descriptors are guarded T1a write/destructive rows pinned to www.coinbase.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(coinbaseSrc),
      'coinbase.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(coinbaseSrc) && !/\bXMLHttpRequest\s*\(/.test(coinbaseSrc),
      'coinbase.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(coinbaseSrc),
      'coinbase.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(coinbaseSrc),
      'coinbase.js does NOT console-log a secret-bearing variable');

    function makeCoinbaseCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        tabId: opts.tabId || 190,
        calls: calls,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (opts.badShape) {
            return { success: true, status: 200, data: { data: {} } };
          }
          const body = JSON.parse(spec.body || '{}');
          if (body.operationName === 'GetAssetByUuid') {
            return {
              success: true,
              status: 200,
              data: {
                data: {
                  assetByUuid: {
                    uuid: 'asset-btc',
                    name: 'Bitcoin',
                    symbol: 'BTC',
                    slug: 'bitcoin',
                    description: 'Fixture asset',
                    color: '#f7931a',
                    imageUrl: 'https://example.invalid/btc.png',
                    circulatingSupply: '19700000',
                    maxSupply: '21000000',
                    marketCap: '1000000000',
                    volume24h: '50000000',
                    allTimeHigh: '123456.78',
                    unitPriceScale: 2,
                    latestPrice: { price: '65000.00', timestamp: '2026-07-01T00:00:00Z', quoteCurrency: 'USD' },
                    categories: [{ uuid: 'cat-1', name: 'Currencies', slug: 'currencies', description: 'Currency assets' }],
                    networks: [{ displayName: 'Bitcoin', chainId: null, contractAddress: null }]
                  }
                }
              }
            };
          }
          if (body.operationName === 'CompareAssetPrices') {
            return {
              success: true,
              status: 200,
              data: {
                data: {
                  a0: { uuid: 'asset-btc', name: 'Bitcoin', symbol: 'BTC', latestPrice: { price: '65000.00', timestamp: '2026-07-01T00:00:00Z', quoteCurrency: 'USD' } },
                  a1: { uuid: 'asset-eth', name: 'Ethereum', symbol: 'ETH', latestPrice: { price: '3500.00', timestamp: '2026-07-01T00:00:00Z', quoteCurrency: 'USD' } }
                }
              }
            };
          }
          if (body.operationName === 'ListWatchlists') {
            return {
              success: true,
              status: 200,
              data: {
                data: {
                  viewer: {
                    watchlists: {
                      edges: [{
                        node: {
                          uuid: 'watch-1',
                          name: 'Main',
                          description: 'Primary watchlist',
                          items: [{ uuid: 'watch-item-1', type: 'WATCHLIST_ITEM_TYPE_ASSET', createdAt: '2026-07-01T00:00:00Z' }]
                        }
                      }]
                    }
                  }
                }
              }
            };
          }
          return { success: true, status: 200, data: { data: { unexpected: true } } };
        }
      };
    }

    const cbAssetCtx = makeCoinbaseCtx();
    const cbAsset = await coinbase['coinbase.get_asset_by_uuid'].handle({ uuid: 'asset-btc' }, cbAssetCtx);
    const cbAssetBody = JSON.parse(cbAssetCtx.calls[0] && cbAssetCtx.calls[0].spec.body || '{}');
    check(cbAssetCtx.calls.length === 1
      && cbAssetCtx.calls[0].tabId === 190
      && cbAssetCtx.calls[0].spec.url === coinbaseOrigin + '/graphql/query'
      && cbAssetCtx.calls[0].spec.method === 'POST'
      && cbAssetCtx.calls[0].spec.origin === coinbaseOrigin
      && cbAssetCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && cbAssetCtx.calls[0].spec.headers['CB-CLIENT'] === 'CoinbaseWeb'
      && cbAssetBody.operationName === 'GetAssetByUuid'
      && cbAssetBody.variables.uuid === 'asset-btc',
      'coinbase.get_asset_by_uuid builds one pinned /graphql/query POST spec');
    check(cbAsset && cbAsset.success === true
      && cbAsset.data.asset.uuid === 'asset-btc'
      && cbAsset.data.latest_price.price === '65000.00'
      && cbAsset.data.categories[0].slug === 'currencies'
      && cbAsset.data.networks[0].display_name === 'Bitcoin',
      'coinbase.get_asset_by_uuid maps asset, price, categories, and networks');

    const cbCompareCtx = makeCoinbaseCtx({ tabId: 191 });
    const cbCompare = await coinbase['coinbase.compare_asset_prices'].handle({
      uuids: ['asset-btc', 'asset-eth'],
      quote_currency: 'USD'
    }, cbCompareCtx);
    const cbCompareBody = JSON.parse(cbCompareCtx.calls[0] && cbCompareCtx.calls[0].spec.body || '{}');
    check(cbCompareBody.operationName === 'CompareAssetPrices'
      && cbCompareBody.variables.uuid0 === 'asset-btc'
      && cbCompareBody.variables.uuid1 === 'asset-eth'
      && cbCompare && cbCompare.success === true
      && cbCompare.data.assets.length === 2
      && cbCompare.data.assets[1].symbol === 'ETH',
      'coinbase.compare_asset_prices is a read and maps aliased asset price results');

    const cbWatchCtx = makeCoinbaseCtx({ tabId: 192 });
    const cbWatch = await coinbase['coinbase.list_watchlists'].handle({}, cbWatchCtx);
    check(cbWatch && cbWatch.success === true
      && cbWatch.data.watchlists[0].uuid === 'watch-1'
      && cbWatch.data.watchlists[0].items[0].uuid === 'watch-item-1',
      'coinbase.list_watchlists maps watchlist edges and items');

    const cbBad = await coinbase['coinbase.get_asset_price'].handle({ uuid: 'asset-btc' }, makeCoinbaseCtx({ badShape: true }));
    check(cbBad && cbBad.success === false
      && cbBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cbBad.reason === 'coinbase-graphql-map-failed',
      'coinbase.get_asset_price fails closed on unexpected GraphQL response shape');

    const cbNoPrimitive = await coinbase['coinbase.get_current_user'].handle({}, { tabId: 193 });
    check(cbNoPrimitive && cbNoPrimitive.success === false
      && cbNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cbNoPrimitive.reason === 'coinbase-execute-bound-spec-unavailable',
      'coinbase.get_current_user fails closed when executeBoundSpec is unavailable');

    const cbGuardCalls = [];
    const cbGuard = await coinbase['coinbase.create_watchlist'].handle({ name: 'Watch' }, {
      tabId: 194,
      async executeBoundSpec() { cbGuardCalls.push('spec'); }
    });
    check(cbGuard && cbGuard.success === false
      && cbGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cbGuard.fellBackToDom === true
      && cbGuard.reason === 'unverified-coinbase-create-watchlist-mutation'
      && cbGuardCalls.length === 0,
      'coinbase.create_watchlist is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Docker Hub T1a handler -- same-origin /auth/profile + /v2 reads
  // =========================================================================
  const dockerhubPath = path.join(HANDLERS_DIR, 'dockerhub.js');
  check(fs.existsSync(dockerhubPath), 'catalog/handlers/dockerhub.js exists');
  if (fs.existsSync(dockerhubPath)) {
    const dockerhub = require(dockerhubPath);
    const dockerhubSrc = readSource(dockerhubPath);
    const expectedDockerhubSlugs = [
      'dockerhub.get_current_user',
      'dockerhub.get_repository',
      'dockerhub.get_tag',
      'dockerhub.get_user_profile',
      'dockerhub.list_organizations',
      'dockerhub.list_repositories',
      'dockerhub.list_tags',
      'dockerhub.search_catalog',
      'dockerhub.search_repositories',
      'dockerhub.create_repository',
      'dockerhub.update_repository',
      'dockerhub.delete_repository'
    ];
    expectedDockerhubSlugs.forEach(function(slug) {
      check(dockerhub[slug] && dockerhub[slug].tier === 'T1a'
        && dockerhub[slug].origin === 'https://hub.docker.com'
        && typeof dockerhub[slug].handle === 'function',
        'dockerhub handler exposes ' + slug + ' as T1a on hub.docker.com');
    });
    check(dockerhubSrc.indexOf('chrome.scripting') === -1 && dockerhubSrc.indexOf('chrome.tabs') === -1,
      'dockerhub.js references NO chrome.scripting/chrome.tabs');
    check(dockerhubSrc.indexOf('registry-1.docker.io') === -1 && dockerhubSrc.indexOf('api.docker.com') === -1,
      'dockerhub.js stays on hub.docker.com and avoids separate Docker API origins');

    function makeDockerhubCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        tabId: options.tabId || 261,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (options.badProfile && spec.url.indexOf('/auth/profile') !== -1) {
            return { success: true, status: 200, data: { profile: {} } };
          }
          if (spec.url.indexOf('/auth/profile') !== -1) {
            return { success: true, status: 200, data: { token: 'dh-token', profile: { username: 'octo' } } };
          }
          if (spec.url.indexOf('/v2/users/octo') !== -1) {
            return { success: true, status: 200, data: { id: 'u1', username: 'octo', full_name: 'Octo User' } };
          }
          if (spec.url.indexOf('/v2/users/docker') !== -1) {
            return { success: true, status: 200, data: { uuid: 'u2', username: 'docker', type: 'Organization' } };
          }
          if (spec.url.indexOf('/v2/namespaces/octo/repositories') !== -1) {
            return { success: true, status: 200, data: { count: 1, results: [{ name: 'fsb', namespace: 'octo', pull_count: 42, content_types: ['image'] }] } };
          }
          if (spec.url.indexOf('/v2/namespaces/library/repositories/nginx/tags/latest') !== -1) {
            return { success: true, status: 200, data: { name: 'latest', digest: 'sha256:abc', full_size: 123, images: [{ architecture: 'amd64', os: 'linux', size: 100, status: 'active' }] } };
          }
          if (spec.url.indexOf('/api/search/v3/catalog/search') !== -1) {
            return { success: true, status: 200, data: { total: 1, results: [{ name: 'nginx', slug: 'library/nginx', type: 'image', source: 'official', categories: [{ name: 'web' }] }] } };
          }
          if (spec.url.indexOf('/v2/search/repositories') !== -1) {
            return { success: true, status: 200, data: { count: 1, results: [{ repo_name: 'library/nginx', pull_count: 99, is_official: true }] } };
          }
          return { success: true, status: 200, data: {} };
        }
      };
    }

    const dhListCtx = makeDockerhubCtx({ tabId: 262 });
    const dhList = await dockerhub['dockerhub.list_repositories'].handle({}, dhListCtx);
    check(dhList && dhList.success === true
      && dhList.data.repositories[0].name === 'fsb'
      && dhListCtx.calls.length === 2
      && dhListCtx.calls[1].spec.origin === 'https://hub.docker.com'
      && dhListCtx.calls[1].spec.headers.Authorization === 'Bearer dh-token'
      && dhListCtx.calls[1].spec.url.indexOf('/v2/namespaces/octo/repositories') !== -1,
      'dockerhub.list_repositories bootstraps auth and uses the authenticated username default');

    const dhTagCtx = makeDockerhubCtx({ tabId: 263 });
    const dhTag = await dockerhub['dockerhub.get_tag'].handle({ namespace: 'library', repository: 'nginx', tag: 'latest' }, dhTagCtx);
    check(dhTag && dhTag.success === true
      && dhTag.data.tag.digest === 'sha256:abc'
      && dhTag.data.tag.images[0].architecture === 'amd64',
      'dockerhub.get_tag maps Docker Hub tag details and platform images');

    const dhCatalogCtx = makeDockerhubCtx({ tabId: 264 });
    const dhCatalog = await dockerhub['dockerhub.search_catalog'].handle({ query: 'nginx', source: 'official' }, dhCatalogCtx);
    check(dhCatalog && dhCatalog.success === true
      && dhCatalog.data.total === 1
      && dhCatalog.data.results[0].slug === 'library/nginx'
      && dhCatalogCtx.calls[1].spec.url.indexOf('source=official') !== -1,
      'dockerhub.search_catalog maps catalog results and preserves filters');

    const dhBad = await dockerhub['dockerhub.get_current_user'].handle({}, makeDockerhubCtx({ badProfile: true }));
    check(dhBad && dhBad.success === false
      && dhBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dhBad.reason === 'dockerhub-profile-auth-incomplete',
      'dockerhub.get_current_user fails closed when /auth/profile lacks session material');

    const dhGuardCalls = [];
    const dhGuard = await dockerhub['dockerhub.create_repository'].handle({ name: 'fsb' }, {
      tabId: 265,
      async executeBoundSpec() { dhGuardCalls.push('spec'); }
    });
    check(dhGuard && dhGuard.success === false
      && dhGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && dhGuard.errorCode === dhGuard.code
      && dhGuard.fellBackToDom === true
      && dhGuardCalls.length === 0,
      'dockerhub.create_repository is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Sentry T1a handler -- same-origin /api/0 reads with guarded mutations
  // =========================================================================
  const sentryPath = path.join(HANDLERS_DIR, 'sentry.js');
  const sentryExtPath = path.join(EXT_HANDLERS_DIR, 'sentry.js');
  check(fs.existsSync(sentryPath), 'catalog/handlers/sentry.js exists');
  if (fs.existsSync(sentryPath)) {
    const sentry = require(sentryPath);
    const sentrySrc = readSource(sentryPath);
    const sentryReadSlugs = [
      'sentry.get_event',
      'sentry.get_issue',
      'sentry.get_organization',
      'sentry.get_project',
      'sentry.get_project_keys',
      'sentry.get_release',
      'sentry.list_alerts',
      'sentry.list_comments',
      'sentry.list_issue_events',
      'sentry.list_issue_tags',
      'sentry.list_members',
      'sentry.list_monitors',
      'sentry.list_organizations',
      'sentry.list_project_environments',
      'sentry.list_projects',
      'sentry.list_releases',
      'sentry.list_replays',
      'sentry.list_teams',
      'sentry.search_issues'
    ];
    const sentryGuardedSlugs = [
      'sentry.create_comment',
      'sentry.update_issue'
    ];

    check(sentryReadSlugs.every(function(slug) {
      return sentry[slug] && sentry[slug].tier === 'T1a'
        && sentry[slug].origin === 'https://sentry.io'
        && sentry[slug].sideEffectClass === 'read'
        && sentry[slug].params
        && typeof sentry[slug].handle === 'function';
    }), 'Sentry read descriptors are T1a reads pinned to sentry.io');
    check(sentryGuardedSlugs.every(function(slug) {
      return sentry[slug] && sentry[slug].tier === 'T1a'
        && sentry[slug].origin === 'https://sentry.io'
        && sentry[slug].sideEffectClass !== 'read'
        && sentry[slug].params
        && typeof sentry[slug].handle === 'function';
    }), 'Sentry mutation descriptors are guarded T1a write rows pinned to sentry.io');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(sentrySrc),
      'sentry.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(sentrySrc) && !/\bXMLHttpRequest\s*\(/.test(sentrySrc),
      'sentry.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(sentrySrc),
      'sentry.js does not read browser storage or cookies directly');
    check(sentrySrc.indexOf('api.sentry.io') === -1,
      'sentry.js stays on the Sentry web app origin and avoids api.sentry.io');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(sentrySrc),
      'sentry.js does NOT console-log a secret-bearing variable');
    if (fs.existsSync(sentryExtPath)) {
      check(readSource(sentryExtPath) === sentrySrc,
        'extension/catalog/handlers/sentry.js matches catalog/handlers/sentry.js when present');
    }

    function makeSentryCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        tabId: opts.tabId || 270,
        url: opts.url || 'https://sentry.io/organizations/acme/issues/',
        calls: calls,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          const parsed = new URL(spec.url);
          const pathAndSearch = parsed.pathname + parsed.search;
          const pageHeaders = {
            Link: '<https://sentry.io/api/0/organizations/acme/projects/?cursor=next-cursor>; rel="next"; results="true"'
          };
          if (pathAndSearch.indexOf('/api/0/organizations/acme/projects/') === 0) {
            return { success: true, status: 200, headers: pageHeaders, data: [{
              id: '123',
              name: 'Web',
              slug: 'web',
              platform: 'javascript',
              dateCreated: '2026-07-01T00:00:00Z',
              isBookmarked: true,
              hasAccess: true,
              status: 'active'
            }] };
          }
          if (pathAndSearch.indexOf('/api/0/organizations/acme/issues/') === 0 && pathAndSearch.indexOf('/comments/') === -1) {
            return { success: true, status: 200, data: [{
              id: 'issue-1',
              shortId: 'ACME-1',
              title: 'Fixture issue',
              culprit: 'app.js',
              level: 'error',
              status: 'unresolved',
              priority: 'high',
              count: '4',
              userCount: 2,
              project: { id: '123', name: 'Web', slug: 'web' }
            }] };
          }
          if (pathAndSearch === '/api/0/projects/acme/web/events/event-1/') {
            return { success: true, status: 200, data: {
              id: 'event-1',
              eventID: 'event-1',
              title: 'Fixture event',
              message: 'Error fixture',
              platform: 'javascript',
              dateCreated: '2026-07-01T00:01:00Z',
              tags: [{ key: 'environment', value: 'production' }]
            } };
          }
          if (pathAndSearch === '/api/0/organizations/') {
            return { success: true, status: 200, data: [{ id: '1', name: 'Acme', slug: 'acme' }] };
          }
          if (pathAndSearch === '/api/0/organizations/acme/issues/issue-1/comments/') {
            return { success: true, status: 200, data: [{ id: 'comment-1', text: 'Looks bad', user: { name: 'Dana' } }] };
          }
          if (pathAndSearch.indexOf('/api/0/organizations/acme/replays/') === 0) {
            return { success: true, status: 200, data: { data: [{ id: 'replay-1', title: 'Checkout replay', duration: 12 }] } };
          }
          return { success: true, status: 404, data: { detail: 'not found' } };
        }
      };
    }

    const sentryProjectsCtx = makeSentryCtx({ tabId: 271 });
    const sentryProjects = await sentry['sentry.list_projects'].handle({ cursor: 'prev-cursor' }, sentryProjectsCtx);
    check(sentryProjects && sentryProjects.success === true
      && sentryProjectsCtx.calls.length === 1
      && sentryProjectsCtx.calls[0].tabId === 271
      && sentryProjectsCtx.calls[0].spec.url === 'https://sentry.io/api/0/organizations/acme/projects/?cursor=prev-cursor'
      && sentryProjectsCtx.calls[0].spec.method === 'GET'
      && sentryProjectsCtx.calls[0].spec.origin === 'https://sentry.io'
      && sentryProjectsCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && sentryProjects.data.projects[0].slug === 'web'
      && sentryProjects.data.projects[0].has_access === true
      && sentryProjects.data.cursor === 'next-cursor',
      'sentry.list_projects builds one pinned /api/0 organization GET spec and maps projects');

    const sentrySearchCtx = makeSentryCtx({ tabId: 272 });
    const sentrySearch = await sentry['sentry.search_issues'].handle({
      project: [123],
      environment: ['production']
    }, sentrySearchCtx);
    const sentrySearchUrl = sentrySearchCtx.calls[0] && sentrySearchCtx.calls[0].spec.url;
    check(sentrySearch && sentrySearch.success === true
      && sentrySearchUrl.indexOf('/api/0/organizations/acme/issues/?') !== -1
      && sentrySearchUrl.indexOf('query=is%3Aunresolved') !== -1
      && sentrySearchUrl.indexOf('limit=25') !== -1
      && sentrySearchUrl.indexOf('project=123') !== -1
      && sentrySearchUrl.indexOf('environment=production') !== -1
      && sentrySearch.data.issues[0].title === 'Fixture issue',
      'sentry.search_issues applies safe defaults, filters, and maps issue rows');

    const sentryEventCtx = makeSentryCtx({ tabId: 273, url: 'https://acme.sentry.io/issues/' });
    const sentryEvent = await sentry['sentry.get_event'].handle({ project_slug: 'web', event_id: 'event-1' }, sentryEventCtx);
    check(sentryEvent && sentryEvent.success === true
      && sentryEventCtx.calls[0].spec.origin === 'https://acme.sentry.io'
      && sentryEventCtx.calls[0].spec.url === 'https://acme.sentry.io/api/0/projects/acme/web/events/event-1/'
      && sentryEvent.data.event.event_id === 'event-1',
      'sentry.get_event extracts org from sentry.io subdomain and preserves the active origin');

    const sentryMissingOrgCtx = makeSentryCtx({ url: 'https://sentry.io/', tabId: 274 });
    const sentryMissingOrg = await sentry['sentry.get_organization'].handle({}, sentryMissingOrgCtx);
    check(sentryMissingOrg && sentryMissingOrg.success === false
      && sentryMissingOrg.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sentryMissingOrg.reason === 'sentry-org-slug-unavailable'
      && sentryMissingOrgCtx.calls.length === 0,
      'sentry.get_organization fails closed before execution when no org slug is available');

    const sentryGuardCalls = [];
    const sentryCommentGuard = await sentry['sentry.create_comment'].handle({ issue_id: 'issue-1', text: 'hi' }, {
      tabId: 275,
      async executeBoundSpec() { sentryGuardCalls.push('spec'); }
    });
    const sentryUpdateGuard = await sentry['sentry.update_issue'].handle({ issue_id: 'issue-1', status: 'resolved' }, {
      tabId: 276,
      async executeBoundSpec() { sentryGuardCalls.push('spec'); }
    });
    check(sentryCommentGuard && sentryUpdateGuard
      && sentryCommentGuard.success === false
      && sentryUpdateGuard.success === false
      && sentryCommentGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sentryUpdateGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && sentryCommentGuard.fellBackToDom === true
      && sentryUpdateGuard.fellBackToDom === true
      && sentryCommentGuard.reason === 'unverified-sentry-create_comment-mutation'
      && sentryUpdateGuard.reason === 'unverified-sentry-update_issue-mutation'
      && sentryGuardCalls.length === 0,
      'sentry.create_comment and sentry.update_issue are guarded fail-closed and call no execution primitive');
  }

  // =========================================================================
  // Zendesk T1a handler -- same-origin tenant /api/v2 reads + guarded mutations
  // =========================================================================
  const zendeskPath = path.join(HANDLERS_DIR, 'zendesk.js');
  const zendeskExtPath = path.join(EXT_HANDLERS_DIR, 'zendesk.js');
  check(fs.existsSync(zendeskPath), 'catalog/handlers/zendesk.js exists');
  if (fs.existsSync(zendeskPath)) {
    try { delete require.cache[require.resolve(zendeskPath)]; } catch (e) { /* not cached */ }
    const zendesk = require(zendeskPath);
    const zendeskSrc = readSource(zendeskPath);
    const zendeskReadSlugs = [
      'zendesk.get_current_user',
      'zendesk.get_organization',
      'zendesk.get_ticket',
      'zendesk.get_user',
      'zendesk.get_view_tickets',
      'zendesk.list_groups',
      'zendesk.list_organizations',
      'zendesk.list_tags',
      'zendesk.list_ticket_comments',
      'zendesk.list_tickets',
      'zendesk.list_users',
      'zendesk.list_views',
      'zendesk.search'
    ];
    const zendeskGuardedSlugs = [
      'zendesk.add_ticket_comment',
      'zendesk.create_ticket',
      'zendesk.delete_ticket',
      'zendesk.update_ticket'
    ];

    check(zendeskReadSlugs.every(function(slug) {
      return zendesk[slug] && zendesk[slug].tier === 'T1a'
        && zendesk[slug].origin === 'https://zendesk.com'
        && zendesk[slug].sideEffectClass === 'read'
        && zendesk[slug].params
        && typeof zendesk[slug].handle === 'function';
    }), 'Zendesk read descriptors are T1a reads registered on zendesk.com');
    check(zendeskGuardedSlugs.every(function(slug) {
      return zendesk[slug] && zendesk[slug].tier === 'T1a'
        && zendesk[slug].origin === 'https://zendesk.com'
        && zendesk[slug].sideEffectClass !== 'read'
        && zendesk[slug].params
        && typeof zendesk[slug].handle === 'function';
    }), 'Zendesk ticket mutations are guarded T1a write/destructive rows');
    check(zendesk['zendesk.delete_ticket'].sideEffectClass === 'destructive',
      'zendesk.delete_ticket is classified as a guarded destructive row');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(zendeskSrc),
      'zendesk.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(zendeskSrc),
      'zendesk.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(zendeskSrc),
      'zendesk.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(zendeskSrc),
      'zendesk.js does NOT console-log a secret-bearing variable');

    function makeZendeskCtx(origin) {
      const calls = [];
      return {
        calls: calls,
        ctx: {
          origin: origin || 'https://acme.zendesk.com',
          tabId: 281,
          async executeBoundSpec(spec, tabId) {
            calls.push({ spec: spec, tabId: tabId });
            if (spec.url.indexOf('/api/v2/users/me.json') !== -1) {
              return { success: true, status: 200, data: { user: { id: 7, name: 'Agent One', email: 'agent@example.com', role: 'admin', active: true } } };
            }
            if (spec.url.indexOf('/api/v2/tickets.json') !== -1) {
              return { success: true, status: 200, data: { tickets: [{ id: 42, subject: 'T1', status: 'open', tags: ['fsb'] }], count: 1 } };
            }
            if (spec.url.indexOf('/api/v2/tickets/42/comments.json') !== -1) {
              return { success: true, status: 200, data: { comments: [{ id: 9, body: 'ok', author_id: 7, public: false }] } };
            }
            return { success: true, status: 200, data: {} };
          }
        }
      };
    }

    const zdListCtx = makeZendeskCtx('https://acme.zendesk.com');
    const zdList = await zendesk['zendesk.list_tickets'].handle({
      page: 2,
      per_page: 10,
      sort_by: 'updated_at',
      sort_order: 'desc'
    }, zdListCtx.ctx);
    check(zdListCtx.calls.length === 1
      && zdListCtx.calls[0].spec.method === 'GET'
      && zdListCtx.calls[0].spec.origin === 'https://acme.zendesk.com'
      && zdListCtx.calls[0].spec.url === 'https://acme.zendesk.com/api/v2/tickets.json?page=2&per_page=10&sort_by=updated_at&sort_order=desc'
      && zdListCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && zdList.data.tickets[0].id === 42,
      'zendesk.list_tickets binds the /api/v2 read to the active Zendesk tenant origin');

    const zdUserCtx = makeZendeskCtx('https://support.zendesk.com');
    const zdUser = await zendesk['zendesk.get_current_user'].handle({}, zdUserCtx.ctx);
    check(zdUser && zdUser.success === true && zdUser.data.user.email === 'agent@example.com',
      'zendesk.get_current_user maps the Zendesk user response');

    const zdNoPrimitive = await zendesk['zendesk.get_current_user'].handle({}, { tabId: 282 });
    check(zdNoPrimitive && zdNoPrimitive.success === false
      && zdNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && zdNoPrimitive.reason === 'zendesk-execute-bound-spec-unavailable',
      'zendesk.get_current_user fails closed when executeBoundSpec is unavailable');

    const zdGuardCalls = [];
    const zdGuard = await zendesk['zendesk.create_ticket'].handle({ subject: 'T1', body: 'body' }, {
      tabId: 283,
      async executeBoundSpec() { zdGuardCalls.push('spec'); }
    });
    check(zdGuard && zdGuard.success === false
      && zdGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && zdGuard.errorCode === zdGuard.code
      && zdGuard.fellBackToDom === true
      && zdGuardCalls.length === 0,
      'zendesk.create_ticket is guarded fail-closed and calls no execution primitive');
    check(fs.existsSync(zendeskExtPath) ? readSource(zendeskExtPath) === zendeskSrc : true,
      'extension/catalog/handlers/zendesk.js matches catalog/handlers/zendesk.js when present');
  }

  // =========================================================================
  // Eventbrite T1a handler -- same-origin /v3 reads + guarded paid registration
  // =========================================================================
  const eventbritePath = path.join(HANDLERS_DIR, 'eventbrite.js');
  const eventbriteExtPath = path.join(EXT_HANDLERS_DIR, 'eventbrite.js');
  check(fs.existsSync(eventbritePath), 'catalog/handlers/eventbrite.js exists');
  if (fs.existsSync(eventbritePath)) {
    try { delete require.cache[require.resolve(eventbritePath)]; } catch (e) { /* not cached */ }
    const eventbrite = require(eventbritePath);
    const eventbriteSrc = readSource(eventbritePath);
    const eventbriteReadSlugs = [
      'eventbrite.search_events',
      'eventbrite.get_event',
      'eventbrite.list_orders'
    ];

    eventbriteReadSlugs.forEach(function(slug) {
      check(eventbrite[slug] && eventbrite[slug].tier === 'T1a'
        && eventbrite[slug].origin === 'https://www.eventbrite.com'
        && eventbrite[slug].sideEffectClass === 'read'
        && eventbrite[slug].params
        && typeof eventbrite[slug].handle === 'function',
        'eventbrite handler exposes ' + slug + ' as a T1a read on www.eventbrite.com');
    });
    check(eventbrite['eventbrite.register_for_event']
      && eventbrite['eventbrite.register_for_event'].tier === 'T1a'
      && eventbrite['eventbrite.register_for_event'].origin === 'https://www.eventbrite.com'
      && eventbrite['eventbrite.register_for_event'].sideEffectClass === 'write'
      && typeof eventbrite['eventbrite.register_for_event'].handle === 'function',
      'eventbrite.register_for_event is a guarded T1a write on www.eventbrite.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(eventbriteSrc),
      'eventbrite.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(eventbriteSrc) && !/\bXMLHttpRequest\s*\(/.test(eventbriteSrc),
      'eventbrite.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(eventbriteSrc),
      'eventbrite.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer|session)/i.test(eventbriteSrc),
      'eventbrite.js does not console-log potentially credential-bearing state');

    function eventbriteEvent(id) {
      return {
        id: id || 'evt-1',
        name: { text: 'Indie Night' },
        description: { text: 'Live music' },
        summary: 'A local show',
        url: 'https://www.eventbrite.com/e/evt-1',
        status: 'live',
        currency: 'USD',
        online_event: false,
        listed: true,
        start: { utc: '2026-07-10T01:00:00Z', local: '2026-07-09T20:00:00', timezone: 'America/Chicago' },
        end: { utc: '2026-07-10T03:00:00Z', local: '2026-07-09T22:00:00', timezone: 'America/Chicago' },
        logo: { id: 'logo-1', url: 'https://img.evbuc.com/logo.jpg', width: 640, height: 320 },
        venue: { id: 'venue-1', name: 'Mercury Ballroom', address: { city: 'Louisville', region: 'KY', country: 'US' } },
        organizer: { id: 'org-1', name: 'FSB Presents', description: { text: 'Shows' }, url: 'https://www.eventbrite.com/o/fsb' },
        ticket_classes: [{ id: 'tc-1', name: 'General Admission', free: false, cost: { display: '$20.00', value: 2000, currency: 'USD' } }]
      };
    }

    function makeEventbriteCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        calls: calls,
        tabId: opts.tabId || 291,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (opts.badShape) {
            return { success: true, status: 200, data: { unexpected: true } };
          }
          if (spec.url.indexOf('/v3/events/search/') !== -1) {
            return { success: true, status: 200, data: { events: [eventbriteEvent('evt-1')], pagination: { object_count: 1, page_number: 1, page_size: 50 } } };
          }
          if (spec.url.indexOf('/v3/events/evt-1/') !== -1) {
            return { success: true, status: 200, data: eventbriteEvent('evt-1') };
          }
          if (spec.url.indexOf('/v3/users/me/orders/') !== -1) {
            return {
              success: true,
              status: 200,
              data: {
                orders: [{ id: 'order-1', status: 'placed', event_id: 'evt-1', event: eventbriteEvent('evt-1'), quantity: 2, costs: { gross: { display: '$40.00', value: 4000, currency: 'USD' } } }],
                pagination: { object_count: 1, page_number: 1, page_size: 2 }
              }
            };
          }
          return { success: true, status: 200, data: {} };
        }
      };
    }

    const ebSearchCtx = makeEventbriteCtx({ tabId: 292 });
    const ebSearch = await eventbrite['eventbrite.search_events'].handle({ keyword: 'music', city: 'Louisville' }, ebSearchCtx);
    check(ebSearch && ebSearch.success === true
      && ebSearch.data.events[0].id === 'evt-1'
      && ebSearch.data.events[0].venue.city === 'Louisville'
      && ebSearchCtx.calls.length === 1
      && ebSearchCtx.calls[0].tabId === 292
      && ebSearchCtx.calls[0].spec.url === 'https://www.eventbrite.com/v3/events/search/?q=music&location.address=Louisville&expand=venue%2Corganizer%2Cticket_classes'
      && ebSearchCtx.calls[0].spec.method === 'GET'
      && ebSearchCtx.calls[0].spec.origin === 'https://www.eventbrite.com'
      && ebSearchCtx.calls[0].spec.authStrategy === 'same-origin-cookie',
      'eventbrite.search_events builds one pinned first-party /v3 events search GET and maps events');

    const ebEventCtx = makeEventbriteCtx({ tabId: 293 });
    const ebEvent = await eventbrite['eventbrite.get_event'].handle({ event_id: 'evt-1' }, ebEventCtx);
    check(ebEvent && ebEvent.success === true
      && ebEvent.data.event.id === 'evt-1'
      && ebEvent.data.event.ticket_classes[0].id === 'tc-1'
      && ebEventCtx.calls[0].spec.url === 'https://www.eventbrite.com/v3/events/evt-1/?expand=venue%2Corganizer%2Cticket_classes',
      'eventbrite.get_event maps event details and expanded ticket classes');

    const ebOrdersCtx = makeEventbriteCtx({ tabId: 294 });
    const ebOrders = await eventbrite['eventbrite.list_orders'].handle({ status: 'upcoming', limit: 2 }, ebOrdersCtx);
    check(ebOrders && ebOrders.success === true
      && ebOrders.data.orders[0].id === 'order-1'
      && ebOrders.data.orders[0].status === 'placed'
      && ebOrdersCtx.calls[0].spec.url === 'https://www.eventbrite.com/v3/users/me/orders/?status=upcoming&page_size=2&expand=event',
      'eventbrite.list_orders maps authenticated user orders and preserves filters');

    const ebBad = await eventbrite['eventbrite.search_events'].handle({ keyword: 'music' }, makeEventbriteCtx({ badShape: true }));
    check(ebBad && ebBad.success === false
      && ebBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ebBad.reason === 'eventbrite-api-shape-mismatch',
      'eventbrite.search_events fails closed on unexpected API shape');

    const ebNoPrimitive = await eventbrite['eventbrite.get_event'].handle({ event_id: 'evt-1' }, { tabId: 295 });
    check(ebNoPrimitive && ebNoPrimitive.success === false
      && ebNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ebNoPrimitive.reason === 'eventbrite-execute-bound-spec-unavailable',
      'eventbrite.get_event fails closed when executeBoundSpec is unavailable');

    const ebGuardCalls = [];
    const ebGuard = await eventbrite['eventbrite.register_for_event'].handle({ event_id: 'evt-1', ticket_type_id: 'tc-1', quantity: 1 }, {
      tabId: 296,
      async executeBoundSpec() { ebGuardCalls.push('spec'); }
    });
    check(ebGuard && ebGuard.success === false
      && ebGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ebGuard.errorCode === ebGuard.code
      && ebGuard.fellBackToDom === true
      && ebGuard.reason === 'unverified-eventbrite-register-for-event-payment-mutation'
      && ebGuardCalls.length === 0,
      'eventbrite.register_for_event is guarded fail-closed and calls no execution primitive');
    check(fs.existsSync(eventbriteExtPath) ? readSource(eventbriteExtPath) === eventbriteSrc : true,
      'extension/catalog/handlers/eventbrite.js matches catalog/handlers/eventbrite.js when present');
  }

  // =========================================================================
  // NotebookLM T1a handler -- same-origin batchexecute reads + guarded mutations
  // =========================================================================
  const notebooklmPath = path.join(HANDLERS_DIR, 'notebooklm.js');
  const notebooklmExtPath = path.join(EXT_HANDLERS_DIR, 'notebooklm.js');
  check(fs.existsSync(notebooklmPath), 'catalog/handlers/notebooklm.js exists');
  if (fs.existsSync(notebooklmPath)) {
    try { delete require.cache[require.resolve(notebooklmPath)]; } catch (e) { /* not cached */ }
    const notebooklm = require(notebooklmPath);
    const notebooklmSrc = readSource(notebooklmPath);
    const notebooklmReadSlugs = [
      'notebooklm.get_current_user',
      'notebooklm.get_notebook',
      'notebooklm.get_notebook_guide',
      'notebooklm.get_notes',
      'notebooklm.get_project_details',
      'notebooklm.list_chat_sessions',
      'notebooklm.list_notebooks',
      'notebooklm.list_sources',
      'notebooklm.navigate_to_notebook'
    ];
    const notebooklmGuardedSlugs = {
      'notebooklm.add_source_text': 'write',
      'notebooklm.add_source_url': 'write',
      'notebooklm.copy_notebook': 'write',
      'notebooklm.create_note': 'write',
      'notebooklm.create_notebook': 'write',
      'notebooklm.rename_notebook': 'write',
      'notebooklm.update_note': 'write',
      'notebooklm.delete_notebook': 'destructive',
      'notebooklm.delete_notes': 'destructive',
      'notebooklm.delete_sources': 'destructive'
    };
    notebooklmReadSlugs.forEach(function(slug) {
      check(notebooklm[slug] && notebooklm[slug].tier === 'T1a'
        && notebooklm[slug].origin === 'https://notebooklm.google.com'
        && notebooklm[slug].sideEffectClass === 'read'
        && typeof notebooklm[slug].handle === 'function',
        'notebooklm handler exposes ' + slug + ' as T1a read on notebooklm.google.com');
    });
    Object.keys(notebooklmGuardedSlugs).forEach(function(slug) {
      check(notebooklm[slug] && notebooklm[slug].tier === 'T1a'
        && notebooklm[slug].origin === 'https://notebooklm.google.com'
        && notebooklm[slug].sideEffectClass === notebooklmGuardedSlugs[slug]
        && typeof notebooklm[slug].handle === 'function',
        'notebooklm handler exposes ' + slug + ' as guarded T1a ' + notebooklmGuardedSlugs[slug]);
    });
    check(notebooklmSrc.indexOf('chrome.scripting') === -1 && notebooklmSrc.indexOf('chrome.tabs') === -1
      && notebooklmSrc.indexOf('chrome.cookies') === -1 && notebooklmSrc.indexOf('chrome.webRequest') === -1,
      'notebooklm.js references NO privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(notebooklmSrc) === false && notebooklmSrc.indexOf('XMLHttpRequest') === -1,
      'notebooklm.js performs no direct fetch/XMLHttpRequest calls');
    check(notebooklmSrc.indexOf('document.cookie') === -1 && notebooklmSrc.indexOf('localStorage') === -1
      && notebooklmSrc.indexOf('sessionStorage') === -1,
      'notebooklm.js reads no document.cookie/localStorage/sessionStorage material');
    check(/console\.(log|debug|info|warn|error)/.test(notebooklmSrc) === false,
      'notebooklm.js does not console-log potentially credential-bearing state');
    check(fs.existsSync(notebooklmExtPath) && readSource(notebooklmExtPath) === notebooklmSrc,
      'extension/catalog/handlers/notebooklm.js is byte-for-byte identical to catalog handler');

    const nlmListRec = makeCtx('https://notebooklm.google.com', 281);
    const nlmList = await notebooklm['notebooklm.list_notebooks'].handle({}, nlmListRec.ctx);
    const nlmListRpc = nlmListRec.calls[1] && nlmListRec.calls[1].spec;
    const nlmListBody = new URLSearchParams((nlmListRpc && nlmListRpc.body) || '');
    check(nlmList && nlmList.success === true
      && nlmList.data.notebooks[0].id === 'notebook-1'
      && nlmList.data.notebooks[0].title === 'Launch Notes'
      && nlmListRec.calls.length === 2
      && nlmListRec.calls[0].spec.url === 'https://notebooklm.google.com/'
      && nlmListRpc.method === 'POST'
      && nlmListRpc.origin === 'https://notebooklm.google.com'
      && nlmListRpc.authStrategy === 'same-origin-cookie'
      && new URL(nlmListRpc.url).searchParams.get('rpcids') === 'wXbhsf'
      && nlmListBody.get('at') === 'notebook-at'
      && nlmListBody.get('f.req').indexOf('wXbhsf') !== -1,
      'notebooklm.list_notebooks bootstraps WIZ auth and posts same-origin wXbhsf batchexecute');

    const nlmSourcesRec = makeCtx('https://notebooklm.google.com', 282);
    const nlmSources = await notebooklm['notebooklm.list_sources'].handle({ notebook_id: 'notebook-1' }, nlmSourcesRec.ctx);
    check(nlmSources && nlmSources.success === true
      && nlmSources.data.sources[0].id === 'source-1'
      && nlmSources.data.sources[0].type === 'website'
      && new URL(nlmSourcesRec.calls[1].spec.url).searchParams.get('rpcids') === 'rLM1Ne'
      && new URL(nlmSourcesRec.calls[1].spec.url).searchParams.get('source-path') === '/notebook/notebook-1',
      'notebooklm.list_sources maps same-origin rLM1Ne source payloads');

    const nlmNotesRec = makeCtx('https://notebooklm.google.com', 283);
    const nlmNotes = await notebooklm['notebooklm.get_notes'].handle({ notebook_id: 'notebook-1' }, nlmNotesRec.ctx);
    check(nlmNotes && nlmNotes.success === true
      && nlmNotes.data.notes[0].id === 'note-1'
      && nlmNotes.data.sync_token_seconds === 1782864000
      && new URL(nlmNotesRec.calls[1].spec.url).searchParams.get('rpcids') === 'cFji9',
      'notebooklm.get_notes maps cFji9 notes and sync token');

    const nlmGuide = await notebooklm['notebooklm.get_notebook_guide'].handle(
      { notebook_id: 'notebook-1' },
      makeCtx('https://notebooklm.google.com', 284).ctx
    );
    check(nlmGuide && nlmGuide.success === true
      && nlmGuide.data.summary === 'Fixture summary'
      && nlmGuide.data.suggested_questions[0].question === 'What is covered?'
      && nlmGuide.data.guide_id === 'guide-1',
      'notebooklm.get_notebook_guide maps summary, questions, and guide id');

    const nlmUser = await notebooklm['notebooklm.get_current_user'].handle({}, makeCtx('https://notebooklm.google.com', 285).ctx);
    check(nlmUser && nlmUser.success === true
      && nlmUser.data.user.user_id === 'user-1'
      && nlmUser.data.user.email === 'notebook@example.invalid',
      'notebooklm.get_current_user maps WIZ bootstrap identity fields');

    const nlmNavRec = makeCtx('https://notebooklm.google.com', 286);
    const nlmNav = await notebooklm['notebooklm.navigate_to_notebook'].handle({ notebook_id: 'notebook-1' }, nlmNavRec.ctx);
    check(nlmNav && nlmNav.success === true
      && nlmNav.data.url === 'https://notebooklm.google.com/notebook/notebook-1'
      && nlmNav.data.navigated === false
      && nlmNavRec.calls.length === 1
      && nlmNavRec.calls[0].spec.url === 'https://notebooklm.google.com/notebook/notebook-1',
      'notebooklm.navigate_to_notebook proves target URL without direct navigation side effects');

    const nlmNoAuthRec = makeCtx('https://notebooklm.google.com', 287, { notebooklmBootstrapText: '<html></html>' });
    const nlmNoAuth = await notebooklm['notebooklm.list_notebooks'].handle({}, nlmNoAuthRec.ctx);
    check(nlmNoAuth && nlmNoAuth.success === false
      && nlmNoAuth.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nlmNoAuth.reason === 'notebooklm-bootstrap-auth-missing'
      && nlmNoAuthRec.calls.length === 1,
      'notebooklm.list_notebooks fails closed when bootstrap auth fields are absent');

    const nlmBadRpc = await notebooklm['notebooklm.get_notes'].handle(
      { notebook_id: 'notebook-1' },
      makeCtx('https://notebooklm.google.com', 288, { notebooklmRpcText: ")]}'\n\n[]\n" }).ctx
    );
    check(nlmBadRpc && nlmBadRpc.success === false
      && nlmBadRpc.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nlmBadRpc.reason === 'notebooklm-rpc-response-parse-failed',
      'notebooklm.get_notes fails closed on unparseable batch response envelopes');

    const nlmGuardCalls = [];
    const nlmGuard = await notebooklm['notebooklm.create_notebook'].handle({ title: 'Draft' }, {
      tabId: 289,
      async executeBoundSpec() { nlmGuardCalls.push('spec'); }
    });
    check(nlmGuard && nlmGuard.success === false
      && nlmGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nlmGuard.errorCode === nlmGuard.code
      && nlmGuard.fellBackToDom === true
      && nlmGuard.reason === 'unverified-notebooklm-create_notebook-mutation'
      && nlmGuardCalls.length === 0,
      'notebooklm.create_notebook is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Shopify Admin T1a handler -- same-origin catalog/order reads + guarded mutations
  // =========================================================================
  const shopifyPath = path.join(HANDLERS_DIR, 'shopify.js');
  const shopifyExtPath = path.join(EXT_HANDLERS_DIR, 'shopify.js');
  check(fs.existsSync(shopifyPath), 'catalog/handlers/shopify.js exists');
  if (fs.existsSync(shopifyPath)) {
    try { delete require.cache[require.resolve(shopifyPath)]; } catch (e) { /* not cached */ }
    const shopify = require(shopifyPath);
    const shopifySrc = readSource(shopifyPath);
    const shopifyReadSlugs = [
      'shopify.list_products',
      'shopify.get_product',
      'shopify.list_orders'
    ];
    const shopifyGuardedSlugs = [
      'shopify.create_order',
      'shopify.cancel_order'
    ];
    shopifyReadSlugs.forEach(function (slug) {
      check(shopify[slug] && shopify[slug].tier === 'T1a'
        && shopify[slug].origin === 'https://admin.shopify.com'
        && shopify[slug].sideEffectClass === 'read'
        && typeof shopify[slug].handle === 'function',
        'shopify handler exposes ' + slug + ' as T1a read on admin.shopify.com');
    });
    shopifyGuardedSlugs.forEach(function (slug) {
      check(shopify[slug] && shopify[slug].tier === 'T1a'
        && shopify[slug].origin === 'https://admin.shopify.com'
        && shopify[slug].sideEffectClass !== 'read'
        && typeof shopify[slug].handle === 'function',
        'shopify handler exposes ' + slug + ' as guarded T1a write/destructive on admin.shopify.com');
    });
    check(shopify['shopify.create_order'].sideEffectClass === 'write'
      && shopify['shopify.cancel_order'].sideEffectClass === 'destructive',
      'shopify create/cancel order sideEffectClass values preserve payment/destructive policy');
    check(shopifySrc.indexOf('chrome.scripting') === -1 && shopifySrc.indexOf('chrome.tabs') === -1
      && shopifySrc.indexOf('chrome.cookies') === -1 && shopifySrc.indexOf('chrome.webRequest') === -1,
      'shopify.js references NO privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(shopifySrc) === false && shopifySrc.indexOf('XMLHttpRequest') === -1,
      'shopify.js performs no direct fetch/XMLHttpRequest calls');
    check(shopifySrc.indexOf('document.cookie') === -1 && shopifySrc.indexOf('localStorage') === -1
      && shopifySrc.indexOf('sessionStorage') === -1,
      'shopify.js reads no document.cookie/localStorage/sessionStorage material');
    check(/console\.(log|debug|info|warn|error)/.test(shopifySrc) === false,
      'shopify.js does not console-log potentially credential-bearing state');
    check(fs.existsSync(shopifyExtPath) ? readSource(shopifyExtPath) === shopifySrc : true,
      'extension/catalog/handlers/shopify.js matches catalog/handlers/shopify.js when present');

    function makeShopifyCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        calls: calls,
        ctx: {
          tabId: opts.tabId || 281,
          async executeBoundSpec(spec, tabId) {
            calls.push({ spec: spec, tabId: tabId });
            if (opts.badShape) {
              return { success: true, status: 200, data: { unexpected: true } };
            }
            if (spec.url.indexOf('/admin/api/products?') !== -1) {
              return {
                success: true,
                status: 200,
                data: {
                  products: [{
                    id: 'p1',
                    title: 'Sneaker',
                    handle: 'sneaker',
                    vendor: 'Acme',
                    product_type: 'Shoes',
                    status: 'active',
                    tags: 'featured, shoes',
                    variants: [{ id: 'v1', title: 'Default', sku: 'SKU-1', price: '19.99', inventory_quantity: 3, available: true }]
                  }]
                }
              };
            }
            if (spec.url.indexOf('/admin/api/products/p1') !== -1) {
              return {
                success: true,
                status: 200,
                data: { product: { id: 'p1', title: 'Sneaker', variants: [{ id: 'v1', price: '19.99', inventory_quantity: 3 }] } }
              };
            }
            if (spec.url.indexOf('/admin/api/orders?') !== -1) {
              return {
                success: true,
                status: 200,
                data: {
                  orders: [{
                    id: 'o1',
                    name: '#1001',
                    order_number: 1001,
                    financial_status: 'paid',
                    fulfillment_status: 'unfulfilled',
                    total_price: '42.50',
                    currency: 'USD',
                    email: 'customer@example.invalid',
                    line_items: [{ id: 'li1' }]
                  }]
                }
              };
            }
            return { success: true, status: 200, data: {} };
          }
        }
      };
    }

    const shopifyProductsCtx = makeShopifyCtx({ tabId: 282 });
    const shopifyProducts = await shopify['shopify.list_products'].handle({ query: 'shoe', limit: 2 }, shopifyProductsCtx.ctx);
    check(shopifyProducts && shopifyProducts.success === true
      && shopifyProducts.data.products[0].id === 'p1'
      && shopifyProducts.data.products[0].price === 19.99
      && shopifyProducts.data.products[0].in_stock === true
      && shopifyProductsCtx.calls.length === 1
      && shopifyProductsCtx.calls[0].spec.url === 'https://admin.shopify.com/admin/api/products?query=shoe&limit=2'
      && shopifyProductsCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && shopifyProductsCtx.calls[0].spec.origin === 'https://admin.shopify.com',
      'shopify.list_products builds a pinned Shopify Admin product GET and maps products');

    const shopifyProductCtx = makeShopifyCtx({ tabId: 283 });
    const shopifyProduct = await shopify['shopify.get_product'].handle({ product_id: 'p1' }, shopifyProductCtx.ctx);
    check(shopifyProduct && shopifyProduct.success === true
      && shopifyProduct.data.product.id === 'p1'
      && shopifyProductCtx.calls[0].spec.url === 'https://admin.shopify.com/admin/api/products/p1',
      'shopify.get_product builds product detail path and maps product data');

    const shopifyOrdersCtx = makeShopifyCtx({ tabId: 284 });
    const shopifyOrders = await shopify['shopify.list_orders'].handle({ status: 'open', limit: 1 }, shopifyOrdersCtx.ctx);
    check(shopifyOrders && shopifyOrders.success === true
      && shopifyOrders.data.orders[0].id === 'o1'
      && shopifyOrders.data.orders[0].total_price === 42.5
      && shopifyOrders.data.orders[0].line_item_count === 1
      && shopifyOrdersCtx.calls[0].spec.url === 'https://admin.shopify.com/admin/api/orders?status=open&limit=1',
      'shopify.list_orders builds status/limit query and maps order data');

    const shopifyBad = await shopify['shopify.list_products'].handle({}, makeShopifyCtx({ badShape: true }).ctx);
    check(shopifyBad && shopifyBad.success === false
      && shopifyBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && shopifyBad.reason === 'shopify-api-shape-mismatch',
      'shopify.list_products fails closed on unexpected response shape');

    const shopifyGuardCalls = [];
    const shopifyGuard = await shopify['shopify.create_order'].handle({ line_items: [{ variant_id: 'v1', quantity: 1 }], shipping_address: 'redacted' }, {
      tabId: 285,
      async executeBoundSpec() { shopifyGuardCalls.push('spec'); }
    });
    check(shopifyGuard && shopifyGuard.success === false
      && shopifyGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && shopifyGuard.errorCode === shopifyGuard.code
      && shopifyGuard.fellBackToDom === true
      && shopifyGuard.reason === 'unverified-shopify-create-order-payment-mutation'
      && shopifyGuardCalls.length === 0,
      'shopify.create_order is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Airtable T1a handler -- same-origin /v0.3 reads + guarded mutations
  // =========================================================================
  const airtablePath = path.join(HANDLERS_DIR, 'airtable.js');
  const airtableExtPath = path.join(EXT_HANDLERS_DIR, 'airtable.js');
  check(fs.existsSync(airtablePath), 'catalog/handlers/airtable.js exists');
  if (fs.existsSync(airtablePath)) {
    const airtable = require(airtablePath);
    const airtableSrc = readSource(airtablePath);
    const airtableReadSlugs = [
      'airtable.get_base_schema',
      'airtable.get_field_choices',
      'airtable.get_record',
      'airtable.get_record_activity',
      'airtable.list_records',
      'airtable.list_workspaces'
    ];
    const airtableGuardedSlugs = [
      'airtable.create_comment',
      'airtable.update_cell'
    ];
    check(airtableReadSlugs.every(function(slug) {
      return airtable[slug] && airtable[slug].tier === 'T1a'
        && airtable[slug].origin === 'https://airtable.com'
        && airtable[slug].sideEffectClass === 'read'
        && typeof airtable[slug].handle === 'function';
    }), 'Airtable read descriptors are T1a reads pinned to airtable.com');
    check(airtableGuardedSlugs.every(function(slug) {
      return airtable[slug] && airtable[slug].tier === 'T1a'
        && airtable[slug].origin === 'https://airtable.com'
        && airtable[slug].sideEffectClass === 'write'
        && typeof airtable[slug].handle === 'function';
    }), 'Airtable mutation descriptors are guarded T1a writes pinned to airtable.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(airtableSrc),
      'airtable.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(/.test(airtableSrc) && !/\bXMLHttpRequest\s*\(/.test(airtableSrc),
      'airtable.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(airtableSrc),
      'airtable.js does not read browser storage or cookies directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer|session)/i.test(airtableSrc),
      'airtable.js does NOT console-log a secret-bearing variable');
    check(fs.existsSync(airtableExtPath) ? readSource(airtableExtPath) === airtableSrc : true,
      'extension/catalog/handlers/airtable.js matches catalog/handlers/airtable.js when present');

    function makeAirtableCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        tabId: options.tabId || 266,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (spec.url === 'https://airtable.com/') {
            return { success: true, status: 200, text: '{"sessionUserId":"usrTest"}' };
          }
          if (spec.url.indexOf('/v0.3/user/usrTest/listApplicationsAndPageBundlesForDisplay') !== -1) {
            return {
              success: true,
              status: 200,
              data: {
                workspaceRecordById: { wsp1: { name: 'Workspace', visibleApplicationOrder: ['app1'] } },
                applicationRecordById: { app1: { name: 'Base', color: 'blue' } }
              }
            };
          }
          if (spec.url.indexOf('/v0.3/application/app1/read') !== -1) {
            return {
              success: true,
              status: 200,
              data: {
                tableDatas: [{
                  id: 'tbl1',
                  rows: [{ id: 'rec1', createdTime: '2026-07-01T00:00:00.000Z', cellValuesByColumnId: { fld1: 'Alpha' } }]
                }],
                tableSchemas: [{
                  id: 'tbl1',
                  name: 'Table',
                  columns: [{ id: 'fld1', name: 'Name', type: 'singleLineText' }],
                  views: [{ id: 'viw1', name: 'Grid', type: 'grid' }]
                }]
              }
            };
          }
          return { success: true, status: 200, data: {} };
        }
      };
    }

    const atListCtx = makeAirtableCtx({ tabId: 267 });
    const atList = await airtable['airtable.list_records'].handle({ base_id: 'app1', table_id: 'tbl1' }, atListCtx);
    check(atList && atList.success === true
      && atList.data.records[0].id === 'rec1'
      && atListCtx.calls.length === 1
      && atListCtx.calls[0].spec.origin === 'https://airtable.com'
      && atListCtx.calls[0].spec.url.indexOf('https://airtable.com/v0.3/application/app1/read?') === 0
      && atListCtx.calls[0].spec.url.indexOf('stringifiedObjectParams=') !== -1
      && atListCtx.calls[0].spec.headers['x-airtable-application-id'] === 'app1',
      'airtable.list_records builds one pinned /v0.3 read spec and maps records');

    const atWorkspacesCtx = makeAirtableCtx({ tabId: 268 });
    const atWorkspaces = await airtable['airtable.list_workspaces'].handle({}, atWorkspacesCtx);
    check(atWorkspaces && atWorkspaces.success === true
      && atWorkspaces.data.workspaces[0].id === 'wsp1'
      && atWorkspaces.data.bases[0].id === 'app1'
      && atWorkspacesCtx.calls.length === 2
      && atWorkspacesCtx.calls[0].spec.url === 'https://airtable.com/'
      && atWorkspacesCtx.calls[1].spec.url.indexOf('/v0.3/user/usrTest/listApplicationsAndPageBundlesForDisplay') !== -1,
      'airtable.list_workspaces bootstraps the page user id then reads workspace/base metadata');

    const atGuardCalls = [];
    const atGuard = await airtable['airtable.update_cell'].handle({ base_id: 'app1', table_id: 'tbl1', record_id: 'rec1', field_id: 'fld1', value: 'Beta' }, {
      tabId: 269,
      async executeBoundSpec() { atGuardCalls.push('spec'); }
    });
    check(atGuard && atGuard.success === false
      && atGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && atGuard.errorCode === atGuard.code
      && atGuard.fellBackToDom === true
      && atGuardCalls.length === 0,
      'airtable.update_cell is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Craigslist first-party API read + guarded mutation head -- catalog/handlers/craigslist.js
  // =========================================================================
  const craigslistPath = path.join(HANDLERS_DIR, 'craigslist.js');
  const craigslistExtPath = path.join(EXT_HANDLERS_DIR, 'craigslist.js');
  check(fs.existsSync(craigslistPath), 'catalog/handlers/craigslist.js exists');
  if (fs.existsSync(craigslistPath)) {
    try { delete require.cache[require.resolve(craigslistPath)]; } catch (e) { /* not cached */ }
    const craigslist = require(craigslistPath);
    const craigslistSrc = readSource(craigslistPath);
    const craigslistReadSlugs = [
      'craigslist.get_current_user',
      'craigslist.get_saved_search_counts',
      'craigslist.list_renewable_postings',
      'craigslist.list_payment_cards',
      'craigslist.list_chat_conversations',
      'craigslist.get_chat_messages'
    ];
    const craigslistWriteSlugs = [
      'craigslist.renew_all_postings',
      'craigslist.set_default_payment_card',
      'craigslist.delete_payment_card'
    ];
    craigslistReadSlugs.forEach(function(slug) {
      check(craigslist[slug] && craigslist[slug].tier === 'T1a'
        && craigslist[slug].origin === 'https://accounts.craigslist.org'
        && craigslist[slug].sideEffectClass === 'read'
        && typeof craigslist[slug].handle === 'function',
        'craigslist handler exposes ' + slug + ' as T1a read on accounts.craigslist.org');
    });
    craigslistWriteSlugs.forEach(function(slug) {
      check(craigslist[slug] && craigslist[slug].tier === 'T1a'
        && craigslist[slug].origin === 'https://accounts.craigslist.org'
        && (craigslist[slug].sideEffectClass === 'write' || craigslist[slug].sideEffectClass === 'destructive')
        && typeof craigslist[slug].handle === 'function',
        'craigslist handler exposes ' + slug + ' as guarded T1a mutation on accounts.craigslist.org');
    });
    check(craigslistSrc.indexOf('chrome.scripting') === -1 && craigslistSrc.indexOf('chrome.tabs') === -1
      && craigslistSrc.indexOf('chrome.cookies') === -1 && craigslistSrc.indexOf('chrome.webRequest') === -1,
      'craigslist.js references NO privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(craigslistSrc) === false && craigslistSrc.indexOf('XMLHttpRequest') === -1,
      'craigslist.js performs no direct fetch/XMLHttpRequest calls');
    check(craigslistSrc.indexOf('document.cookie') === -1 && craigslistSrc.indexOf('localStorage') === -1
      && craigslistSrc.indexOf('sessionStorage') === -1,
      'craigslist.js reads no document.cookie/localStorage/sessionStorage material');

    function makeCraigslistCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        tabId: options.tabId || 281,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (options.badShape) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [] } };
          }
          if (spec.url.indexOf('/user/info') !== -1) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: { userId: 'user-1', userEmail: 'ada@example.com', defaultAreaId: 42 } } };
          }
          if (spec.url.indexOf('/savesearch/counts') !== -1) {
            return { success: true, status: 200, data: [{ id: 7, count: 3 }] };
          }
          if (spec.url.indexOf('/postings/bulk-action/renew/list') !== -1) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: { ids: [11], uuids: ['post-uuid'] } } };
          }
          if (spec.url.indexOf('/user/billing/payment-cards') !== -1) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: { items: [{ id: 'card-1', card_vendor_name: 'Visa', card_number_last_four: '4242', is_default: true }], can_bulk_post: true } } };
          }
          if (spec.url.indexOf('/chat/123') !== -1) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: { items: [{ messageId: 9, conversationId: 123, senderName: 'Ada', text: 'hello', isFromMe: true }] } } };
          }
          if (spec.url.indexOf('/chat') !== -1) {
            return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: { items: [{ conversationId: 123, postingId: 456, postingTitle: 'Desk', unreadCount: 2 }], postingCount: 1 } } };
          }
          return { success: true, status: 200, data: { apiVersion: 8, errors: [], data: {} } };
        }
      };
    }

    const clUserCtx = makeCraigslistCtx({ tabId: 282 });
    const clUser = await craigslist['craigslist.get_current_user'].handle({}, clUserCtx);
    check(clUser && clUser.success === true
      && clUser.data.email === 'ada@example.com'
      && clUser.data.defaultAreaId === 42
      && clUserCtx.calls[0].spec.origin === 'https://accounts.craigslist.org'
      && clUserCtx.calls[0].spec.url.indexOf('https://wapi.craigslist.org/web/v8/user/info?lang=en') === 0,
      'craigslist.get_current_user reads the first-party WAPI profile through executeBoundSpec');

    const clSearch = await craigslist['craigslist.get_saved_search_counts'].handle({}, makeCraigslistCtx({ tabId: 283 }));
    check(clSearch && clSearch.success === true
      && clSearch.data.searches[0].id === 7
      && clSearch.data.searches[0].count === 3,
      'craigslist.get_saved_search_counts maps accounts saved-search counts');

    const clCards = await craigslist['craigslist.list_payment_cards'].handle({}, makeCraigslistCtx({ tabId: 284 }));
    check(clCards && clCards.success === true
      && clCards.data.cards[0].id === 'card-1'
      && clCards.data.cards[0].cardNumberLastFour === '4242'
      && clCards.data.canBulkPost === true,
      'craigslist.list_payment_cards maps billing card metadata');

    const clMessages = await craigslist['craigslist.get_chat_messages'].handle({ conversation_id: 123 }, makeCraigslistCtx({ tabId: 285 }));
    check(clMessages && clMessages.success === true
      && clMessages.data.messages[0].messageId === 9
      && clMessages.data.messages[0].isFromMe === true,
      'craigslist.get_chat_messages maps chat messages from CAPI');

    const clBad = await craigslist['craigslist.get_current_user'].handle({}, makeCraigslistCtx({ badShape: true }));
    check(clBad && clBad.success === false
      && clBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && clBad.reason === 'craigslist-api-data-missing',
      'craigslist.get_current_user fails closed on unexpected API envelope');

    const clGuardCalls = [];
    const clGuard = await craigslist['craigslist.set_default_payment_card'].handle({ card_id: 'card-1' }, {
      tabId: 286,
      async executeBoundSpec() { clGuardCalls.push('spec'); }
    });
    check(clGuard && clGuard.success === false
      && clGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && clGuard.errorCode === clGuard.code
      && clGuard.fellBackToDom === true
      && clGuardCalls.length === 0,
      'craigslist.set_default_payment_card is guarded fail-closed and calls no execution primitive');

    check(fs.existsSync(craigslistExtPath) && readSource(craigslistExtPath) === craigslistSrc,
      'extension/catalog/handlers/craigslist.js matches catalog/handlers/craigslist.js byte-for-byte');
  }

  // =========================================================================
  // Gemini same-origin read + guarded mutation head -- catalog/handlers/gemini.js
  // =========================================================================
  const geminiPath = path.join(HANDLERS_DIR, 'gemini.js');
  const geminiExtPath = path.join(EXT_HANDLERS_DIR, 'gemini.js');
  check(fs.existsSync(geminiPath), 'catalog/handlers/gemini.js exists');
  if (fs.existsSync(geminiPath)) {
    try { delete require.cache[require.resolve(geminiPath)]; } catch (e) { /* not cached */ }
    const gemini = require(geminiPath);
    const geminiSrc = readSource(geminiPath);
    const geminiReadSlugs = [
      'gemini.get_current_user',
      'gemini.list_models',
      'gemini.list_conversations',
      'gemini.get_conversation'
    ];
    const geminiWriteSlugs = [
      'gemini.create_conversation',
      'gemini.send_message'
    ];

    check(geminiReadSlugs.every(function(slug) {
      return gemini[slug] && gemini[slug].tier === 'T1a'
        && gemini[slug].origin === 'https://gemini.google.com'
        && gemini[slug].sideEffectClass === 'read'
        && gemini[slug].params
        && typeof gemini[slug].handle === 'function';
    }), 'Gemini read descriptors are T1a reads pinned to gemini.google.com');
    check(geminiWriteSlugs.every(function(slug) {
      return gemini[slug] && gemini[slug].tier === 'T1a'
        && gemini[slug].origin === 'https://gemini.google.com'
        && gemini[slug].sideEffectClass === 'write'
        && gemini[slug].params
        && typeof gemini[slug].handle === 'function';
    }), 'Gemini conversation mutation descriptors are guarded T1a writes pinned to gemini.google.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(geminiSrc),
      'gemini.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(geminiSrc),
      'gemini.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(geminiSrc),
      'gemini.js does not directly read cookies or page storage');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer|SNlM0e|FdrFJe)/i.test(geminiSrc),
      'gemini.js does not console-log token-bearing values');
    check(fs.existsSync(geminiExtPath), 'extension/catalog/handlers/gemini.js exists for unpacked dev loads');
    check(fs.existsSync(geminiExtPath) ? readSource(geminiExtPath) === geminiSrc : true,
      'extension/catalog/handlers/gemini.js matches catalog/handlers/gemini.js');

    function geminiBootstrapHtml() {
      return [
        '<html><head><script>',
        'window.WIZ_global_data={"SNlM0e":"at-token","cfb2h":"boq-gemini-web","FdrFJe":"fsid-1","oPEP7c":"ada@example.com","S06Grb":"user-1"};',
        '</script></head><body>',
        '<a data-test-id="conversation" href="/app/c_ab3da395ea4fb30b">Launch plan</a>',
        '<div data-test-id="user-message">Hello Gemini</div>',
        '<div data-test-id="model-response">Hi from Gemini</div>',
        '</body></html>'
      ].join('');
    }

    function geminiModelsText() {
      var payload = [];
      payload[15] = [
        ['fbb127bbb056c959', 'Fast', 'Fast everyday model'],
        ['model-pro', 'Pro', 'Reasoning model']
      ];
      return ")]}'\n\n" + JSON.stringify([[null, 'otAQ7b', JSON.stringify(payload)]]) + '\n';
    }

    function makeGeminiCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        tabId: options.tabId || 276,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (options.missingBootstrap) {
            return { success: true, status: 200, text: '<html></html>' };
          }
          if (spec.url.indexOf('https://gemini.google.com/_/BardChatUi/data/batchexecute') === 0) {
            return { success: true, status: 200, text: geminiModelsText() };
          }
          return {
            success: true,
            status: 200,
            finalUrl: spec.url,
            text: geminiBootstrapHtml()
          };
        }
      };
    }

    const geminiUserCtx = makeGeminiCtx({ tabId: 276 });
    const geminiUser = await gemini['gemini.get_current_user'].handle({}, geminiUserCtx);
    check(geminiUser && geminiUser.success === true
      && geminiUser.data.user.email === 'ada@example.com'
      && geminiUser.data.user.user_id === 'user-1'
      && geminiUserCtx.calls.length === 1
      && geminiUserCtx.calls[0].spec.url === 'https://gemini.google.com/app'
      && geminiUserCtx.calls[0].spec.method === 'GET'
      && geminiUserCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && geminiUserCtx.calls[0].spec.origin === 'https://gemini.google.com',
      'gemini.get_current_user reads same-origin bootstrap state and maps the user identity');

    const geminiModelsCtx = makeGeminiCtx({ tabId: 277 });
    const geminiModels = await gemini['gemini.list_models'].handle({}, geminiModelsCtx);
    check(geminiModels && geminiModels.success === true
      && geminiModels.data.models.length === 2
      && geminiModels.data.models[0].id === 'fbb127bbb056c959'
      && geminiModels.data.models[0].is_default === true
      && geminiModelsCtx.calls.length === 2
      && geminiModelsCtx.calls[1].spec.method === 'POST'
      && geminiModelsCtx.calls[1].spec.url.indexOf('https://gemini.google.com/_/BardChatUi/data/batchexecute?') === 0
      && geminiModelsCtx.calls[1].spec.body.indexOf('at=at-token') !== -1
      && geminiModelsCtx.calls[1].spec.origin === 'https://gemini.google.com',
      'gemini.list_models bootstraps Wiz tokens and calls the first-party read RPC');

    const geminiListCtx = makeGeminiCtx({ tabId: 278 });
    const geminiList = await gemini['gemini.list_conversations'].handle({}, geminiListCtx);
    check(geminiList && geminiList.success === true
      && geminiList.data.conversations[0].id === 'c_ab3da395ea4fb30b'
      && geminiList.data.conversations[0].title === 'Launch plan'
      && geminiListCtx.calls.length === 1
      && geminiListCtx.calls[0].spec.url === 'https://gemini.google.com/app',
      'gemini.list_conversations parses conversation links from the same-origin app page');

    const geminiConversationCtx = makeGeminiCtx({ tabId: 279 });
    const geminiConversation = await gemini['gemini.get_conversation'].handle({ conversation_id: 'c_ab3da395ea4fb30b' }, geminiConversationCtx);
    check(geminiConversation && geminiConversation.success === true
      && geminiConversation.data.conversation_id === 'c_ab3da395ea4fb30b'
      && geminiConversation.data.messages[0].prompt === 'Hello Gemini'
      && geminiConversation.data.messages[0].response === 'Hi from Gemini'
      && geminiConversationCtx.calls[0].spec.url === 'https://gemini.google.com/app/c_ab3da395ea4fb30b',
      'gemini.get_conversation reads the first-party conversation page and maps visible turns');

    const geminiMissing = await gemini['gemini.list_models'].handle({}, makeGeminiCtx({ missingBootstrap: true }));
    check(geminiMissing && geminiMissing.success === false
      && geminiMissing.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && geminiMissing.reason === 'gemini-rpc-bootstrap-missing',
      'gemini.list_models fails closed when bootstrap tokens are absent');

    const geminiGuardCalls = [];
    const geminiGuard = await gemini['gemini.send_message'].handle({ text: 'Hello' }, {
      tabId: 280,
      async executeBoundSpec() { geminiGuardCalls.push('spec'); }
    });
    check(geminiGuard && geminiGuard.success === false
      && geminiGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && geminiGuard.errorCode === geminiGuard.code
      && geminiGuard.fellBackToDom === true
      && geminiGuardCalls.length === 0,
      'gemini.send_message is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Figma same-origin API read + guarded mutation head -- catalog/handlers/figma.js
  // =========================================================================
  const figmaPath = path.join(HANDLERS_DIR, 'figma.js');
  check(fs.existsSync(figmaPath), 'catalog/handlers/figma.js exists');
  if (fs.existsSync(figmaPath)) {
    try { delete require.cache[require.resolve(figmaPath)]; } catch (e) { /* not cached */ }
    const figma = require(figmaPath);
    const figmaSrc = readSource(figmaPath);
    const figmaReadSlugs = [
      'figma.get_current_user',
      'figma.get_file',
      'figma.get_file_components',
      'figma.get_team_info',
      'figma.list_comments',
      'figma.list_file_versions',
      'figma.list_files',
      'figma.list_recent_files',
      'figma.list_team_projects',
      'figma.list_teams'
    ];
    const figmaWriteSlugs = [
      'figma.create_file',
      'figma.update_file',
      'figma.trash_file',
      'figma.post_comment'
    ];
    figmaReadSlugs.forEach(function (slug) {
      check(figma[slug] && figma[slug].tier === 'T1a'
        && figma[slug].origin === 'https://www.figma.com'
        && figma[slug].sideEffectClass === 'read'
        && typeof figma[slug].handle === 'function',
        'figma handler exposes ' + slug + ' as T1a read on www.figma.com');
    });
    figmaWriteSlugs.forEach(function (slug) {
      check(figma[slug] && figma[slug].tier === 'T1a'
        && figma[slug].origin === 'https://www.figma.com'
        && figma[slug].sideEffectClass === 'write'
        && typeof figma[slug].handle === 'function',
        'figma handler exposes ' + slug + ' as guarded T1a write on www.figma.com');
    });
    check(figmaSrc.indexOf('chrome.scripting') === -1 && figmaSrc.indexOf('chrome.tabs') === -1
      && figmaSrc.indexOf('chrome.cookies') === -1 && figmaSrc.indexOf('chrome.webRequest') === -1,
      'figma.js references NO privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(figmaSrc) === false && figmaSrc.indexOf('XMLHttpRequest') === -1,
      'figma.js performs no direct fetch/XMLHttpRequest calls');
    check(figmaSrc.indexOf('document.cookie') === -1 && figmaSrc.indexOf('localStorage') === -1
      && figmaSrc.indexOf('sessionStorage') === -1,
      'figma.js reads no document.cookie/localStorage/sessionStorage material');
    check(figmaSrc.indexOf('api.figma.com') === -1,
      'figma.js avoids the separate api.figma.com origin');
    check(/console\.(log|debug|info|warn|error)/.test(figmaSrc) === false,
      'figma.js does not console-log potentially credential-bearing state');

    function makeFigmaCtx(opts) {
      const options = opts || {};
      const calls = [];
      return {
        calls: calls,
        tabId: options.tabId || 271,
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (options.badShape && spec.url.indexOf('/files/file-1/meta') !== -1) {
            return { success: true, status: 200, data: { message: 'not allowed' } };
          }
          if (spec.url.indexOf('/api/session/state') !== -1) {
            return {
              success: true,
              status: 200,
              data: {
                meta: {
                  users: [{ id: 'user-1', name: 'Ada', handle: 'ada', email: 'ada@example.com' }],
                  teams: [{ id: 'team-1', name: 'Design', editors: 3, is_paid: true }]
                }
              }
            };
          }
          if (spec.url.indexOf('/api/user/state') !== -1) {
            return { success: true, status: 200, data: { meta: { teams: [{ id: 'team-1', name: 'Design', is_paid: true }] } } };
          }
          if (spec.url.indexOf('/api/teams/team-1/projects') !== -1) {
            return { success: true, status: 200, data: { meta: { projects: [{ id: 'folder-1', name: 'Product' }] } } };
          }
          if (spec.url.indexOf('/api/folders/folder-1/files') !== -1) {
            return { success: true, status: 200, data: { meta: { files: [{ key: 'file-1', name: 'Launch', editor_type: 'design', team_id: 'team-1' }] } } };
          }
          if (spec.url.indexOf('/api/files/file-1/meta') !== -1) {
            return { success: true, status: 200, data: { meta: { key: 'file-1', name: 'Launch', editor_type: 'design', team_id: 'team-1' } } };
          }
          if (spec.url.indexOf('/api/files/file-1/components') !== -1) {
            return { success: true, status: 200, data: { meta: { components: [{ key: 'cmp-1', name: 'Button', node_id: '1:2' }] } } };
          }
          if (spec.url.indexOf('/api/files/file-1/versions') !== -1) {
            return { success: true, status: 200, data: { meta: { versions: [{ id: 'ver-1', label: 'Initial', user: { handle: 'ada' } }] } } };
          }
          if (spec.url.indexOf('/api/file/file-1/comments') !== -1) {
            return { success: true, status: 200, data: [{ id: 'comment-1', message: 'Looks good', user: { id: 'user-1', handle: 'ada' } }] };
          }
          if (spec.url.indexOf('/api/recent_prototypes') !== -1) {
            return { success: true, status: 200, data: { meta: { recent_prototypes: [{ id: 'recent-1', name: 'Prototype', fig_file: { key: 'file-1', name: 'Launch' } }] } } };
          }
          return { success: true, status: 200, data: { meta: {} } };
        }
      };
    }

    const figmaUserCtx = makeFigmaCtx({ tabId: 272 });
    const figmaUser = await figma['figma.get_current_user'].handle({}, figmaUserCtx);
    check(figmaUser && figmaUser.success === true
      && figmaUser.data.user.id === 'user-1'
      && figmaUserCtx.calls.length === 1
      && figmaUserCtx.calls[0].spec.url === 'https://www.figma.com/api/session/state'
      && figmaUserCtx.calls[0].spec.method === 'GET'
      && figmaUserCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && figmaUserCtx.calls[0].spec.origin === 'https://www.figma.com',
      'figma.get_current_user uses same-origin session state and maps the authenticated user');

    const figmaFilesCtx = makeFigmaCtx({ tabId: 273 });
    const figmaFiles = await figma['figma.list_files'].handle({ folder_id: 'folder-1' }, figmaFilesCtx);
    check(figmaFiles && figmaFiles.success === true
      && figmaFiles.data.files[0].key === 'file-1'
      && figmaFilesCtx.calls.length === 2
      && figmaFilesCtx.calls[1].spec.url === 'https://www.figma.com/api/folders/folder-1/files?fuid=user-1',
      'figma.list_files bootstraps fuid and calls the first-party folder files endpoint');

    const figmaCommentsCtx = makeFigmaCtx({ tabId: 274 });
    const figmaComments = await figma['figma.list_comments'].handle({ file_key: 'file-1' }, figmaCommentsCtx);
    check(figmaComments && figmaComments.success === true
      && figmaComments.data.comments[0].id === 'comment-1'
      && figmaCommentsCtx.calls.length === 1
      && figmaCommentsCtx.calls[0].spec.url === 'https://www.figma.com/api/file/file-1/comments',
      'figma.list_comments maps first-party file comments without a bootstrap call');

    const figmaBad = await figma['figma.get_file'].handle({ file_key: 'file-1' }, makeFigmaCtx({ badShape: true }));
    check(figmaBad && figmaBad.success === false
      && figmaBad.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && figmaBad.reason === 'figma-api-error-envelope',
      'figma.get_file fails closed on Figma error-shaped API envelopes');

    const figmaNoPrimitive = await figma['figma.list_teams'].handle({}, {});
    check(figmaNoPrimitive && figmaNoPrimitive.success === false
      && figmaNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && figmaNoPrimitive.reason === 'figma-execute-bound-spec-unavailable',
      'figma.list_teams fails closed when executeBoundSpec is unavailable');

    const figmaGuardCalls = [];
    const figmaGuard = await figma['figma.post_comment'].handle({ file_key: 'file-1', message: 'Ship it' }, {
      tabId: 275,
      async executeBoundSpec() { figmaGuardCalls.push('spec'); }
    });
    check(figmaGuard && figmaGuard.success === false
      && figmaGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && figmaGuard.errorCode === figmaGuard.code
      && figmaGuard.fellBackToDom === true
      && figmaGuardCalls.length === 0,
      'figma.post_comment is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Google Calendar gapi-bridge read + guarded mutation head -- catalog/handlers/gcal.js
  // =========================================================================
  const gcalPath = path.join(HANDLERS_DIR, 'gcal.js');
  check(fs.existsSync(gcalPath), 'catalog/handlers/gcal.js exists');
  if (fs.existsSync(gcalPath)) {
    const gcal = require(gcalPath);
    const gcalSrc = readSource(gcalPath);
    const gcalReadSlugs = [
      'gcal.get_calendar',
      'gcal.get_colors',
      'gcal.get_event',
      'gcal.get_setting',
      'gcal.list_calendars',
      'gcal.list_event_instances',
      'gcal.list_events',
      'gcal.list_settings',
      'gcal.search_events'
    ];
    const gcalGuardedSlugs = [
      'gcal.create_calendar',
      'gcal.create_event',
      'gcal.delete_calendar',
      'gcal.delete_event',
      'gcal.move_event',
      'gcal.query_freebusy',
      'gcal.quick_add_event',
      'gcal.update_calendar',
      'gcal.update_event'
    ];
    check(gcalReadSlugs.every(function(slug) {
      return gcal[slug] && gcal[slug].tier === 'T1a'
        && gcal[slug].origin === 'https://calendar.google.com'
        && gcal[slug].sideEffectClass === 'read'
        && gcal[slug].params
        && typeof gcal[slug].handle === 'function';
    }), 'Google Calendar read descriptors are T1a reads pinned to calendar.google.com');
    check(gcalGuardedSlugs.every(function(slug) {
      return gcal[slug] && gcal[slug].tier === 'T1a'
        && gcal[slug].origin === 'https://calendar.google.com'
        && gcal[slug].sideEffectClass !== 'read'
        && gcal[slug].params
        && typeof gcal[slug].handle === 'function';
    }), 'Google Calendar write/destructive descriptors are registered as guarded non-read handlers');
    check(!/chrome\.(scripting|tabs)/.test(gcalSrc),
      'gcal.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(gcalSrc) && !/\bXMLHttpRequest\s*\(/.test(gcalSrc),
      'gcal.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(gcalSrc),
      'gcal.js does not read cookies/storage directly');
    check(!/console\.\w+\([^)]*(token|secret|cookie|csrf|authorization|bearer)/i.test(gcalSrc),
      'gcal.js does NOT console-log a secret-bearing variable');

    const gcalCalls = [];
    const gcalOut = await gcal['gcal.list_events'].handle({
      calendar_id: 'primary',
      time_min: '2026-07-01T00:00:00-05:00',
      time_max: '2026-07-02T00:00:00-05:00'
    }, {
      origin: 'https://calendar.google.com',
      tabId: 276,
      async executeBoundPageRead(request, tabId) {
        gcalCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Google Calendar reads must not call executeBoundSpec');
      }
    });
    check(gcalCalls.length === 1
      && gcalCalls[0].tabId === 276
      && gcalCalls[0].request.origin === 'https://calendar.google.com'
      && gcalCalls[0].request.namespace === 'gcal'
      && gcalCalls[0].request.action === 'list_events'
      && gcalCalls[0].request.args.calendar_id === 'primary',
      'gcal.list_events dispatches a bounded Calendar page-read request');
    check(gcalOut && gcalOut.success === true && gcalOut.data.action === 'list_events',
      'gcal.list_events returns the bounded page-read result');

    const gcalNoPrimitive = await gcal['gcal.get_colors'].handle({}, {
      origin: 'https://calendar.google.com',
      tabId: 277
    });
    check(gcalNoPrimitive && gcalNoPrimitive.success === false
      && gcalNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gcalNoPrimitive.reason === 'gcal-page-read-primitive-unavailable',
      'gcal.get_colors fails closed when the page-read primitive is unavailable');

    const gcalGuardCalls = [];
    const gcalGuard = await gcal['gcal.create_event'].handle({ summary: 'Planning' }, {
      tabId: 278,
      async executeBoundSpec() { gcalGuardCalls.push('spec'); },
      async executeBoundPageRead() { gcalGuardCalls.push('page'); }
    });
    check(gcalGuard && gcalGuard.success === false
      && gcalGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gcalGuard.errorCode === gcalGuard.code
      && gcalGuard.error === gcalGuard.code
      && gcalGuard.fellBackToDom === true
      && gcalGuardCalls.length === 0,
      'gcal.create_event is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Google Cloud Console page-owned GAPI read head -- catalog/handlers/gcloud.js
  // =========================================================================
  const gcloudPath = path.join(HANDLERS_DIR, 'gcloud.js');
  check(fs.existsSync(gcloudPath), 'catalog/handlers/gcloud.js exists');
  if (fs.existsSync(gcloudPath)) {
    const gcloud = require(gcloudPath);
    const gcloudSrc = readSource(gcloudPath);
    const gcloudReadSlugs = [
      'gcloud.get_billing_info',
      'gcloud.get_bucket',
      'gcloud.get_cloud_run_service',
      'gcloud.get_cluster',
      'gcloud.get_current_project',
      'gcloud.get_function',
      'gcloud.get_instance',
      'gcloud.get_project',
      'gcloud.get_sql_instance',
      'gcloud.list_billing_accounts',
      'gcloud.list_buckets',
      'gcloud.list_cloud_run_services',
      'gcloud.list_clusters',
      'gcloud.list_disks',
      'gcloud.list_enabled_services',
      'gcloud.list_firewalls',
      'gcloud.list_functions',
      'gcloud.list_iam_roles',
      'gcloud.list_instances',
      'gcloud.list_networks',
      'gcloud.list_objects',
      'gcloud.list_projects',
      'gcloud.list_service_accounts',
      'gcloud.list_sql_instances'
    ];
    const gcloudGuardedSlugs = [
      'gcloud.disable_service',
      'gcloud.enable_service',
      'gcloud.get_iam_policy',
      'gcloud.list_log_entries',
      'gcloud.start_instance',
      'gcloud.stop_instance'
    ];

    check(gcloudReadSlugs.every(function(slug) {
      return gcloud[slug] && gcloud[slug].tier === 'T1a'
        && gcloud[slug].sideEffectClass === 'read'
        && gcloud[slug].origin === 'https://console.cloud.google.com'
        && gcloud[slug].params
        && typeof gcloud[slug].handle === 'function';
    }), 'all 24 Google Cloud read descriptors are tier:T1a READ entries pinned to console.cloud.google.com');
    check(gcloudGuardedSlugs.every(function(slug) {
      return gcloud[slug] && gcloud[slug].tier === 'T1a'
        && gcloud[slug].sideEffectClass === 'write'
        && gcloud[slug].origin === 'https://console.cloud.google.com'
        && gcloud[slug].params
        && typeof gcloud[slug].handle === 'function';
    }), 'all 6 Google Cloud write-classified descriptors are guarded T1a entries');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(gcloudSrc),
      'gcloud.js references NO chrome execution or cookie APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(gcloudSrc),
      'gcloud.js performs no direct network call');
    check(!/document\.cookie|localStorage|sessionStorage/.test(gcloudSrc),
      'gcloud.js does not read cookies or browser storage');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|sapisid)\b/i.test(gcloudSrc),
      'gcloud.js does NOT console-log a secret-bearing variable');

    const gcloudProjectCalls = [];
    const gcloudProjects = await gcloud['gcloud.list_projects'].handle({ page_size: 7, page_token: 'next' }, {
      origin: 'https://console.cloud.google.com',
      tabId: 279,
      async executeBoundPageRead(request, tabId) {
        gcloudProjectCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Google Cloud reads must not call executeBoundSpec');
      }
    });
    check(gcloudProjectCalls.length === 1
      && gcloudProjectCalls[0].tabId === 279
      && gcloudProjectCalls[0].request.origin === 'https://console.cloud.google.com'
      && gcloudProjectCalls[0].request.namespace === 'gcloud'
      && gcloudProjectCalls[0].request.action === 'list_projects'
      && gcloudProjectCalls[0].request.args.page_size === 7
      && gcloudProjectCalls[0].request.args.page_token === 'next',
      'gcloud.list_projects dispatches a bounded Google Cloud page-read request');
    check(gcloudProjects && gcloudProjects.success === true && gcloudProjects.data.action === 'list_projects',
      'gcloud.list_projects returns the bounded page-read result');

    const gcloudInstanceCalls = [];
    await gcloud['gcloud.get_instance'].handle({
      project_id: 'project-test',
      zone: 'us-central1-a',
      instance_name: 'vm-test'
    }, {
      origin: 'https://console.cloud.google.com',
      tabId: 280,
      async executeBoundPageRead(request, tabId) {
        gcloudInstanceCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { instance: { name: 'vm-test' } } };
      },
      async executeBoundSpec() {
        throw new Error('Google Cloud reads must not call executeBoundSpec');
      }
    });
    check(gcloudInstanceCalls.length === 1
      && gcloudInstanceCalls[0].request.action === 'get_instance'
      && gcloudInstanceCalls[0].request.args.project_id === 'project-test'
      && gcloudInstanceCalls[0].request.args.zone === 'us-central1-a'
      && gcloudInstanceCalls[0].request.args.instance_name === 'vm-test',
      'gcloud.get_instance forwards project, zone, and instance name to the page-read primitive');

    const gcloudNoPrimitive = await gcloud['gcloud.get_bucket'].handle({ bucket_name: 'bucket-test' }, {
      origin: 'https://console.cloud.google.com',
      tabId: 281
    });
    check(gcloudNoPrimitive && gcloudNoPrimitive.success === false
      && gcloudNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gcloudNoPrimitive.reason === 'gcloud-page-read-primitive-unavailable',
      'gcloud.get_bucket fails closed when the page-read primitive is unavailable');

    const gcloudGuardCalls = [];
    const gcloudGuard = await gcloud['gcloud.start_instance'].handle({
      project_id: 'project-test',
      zone: 'us-central1-a',
      instance_name: 'vm-test'
    }, {
      tabId: 282,
      async executeBoundSpec() { gcloudGuardCalls.push('spec'); },
      async executeBoundPageRead() { gcloudGuardCalls.push('page'); }
    });
    check(gcloudGuard && gcloudGuard.success === false
      && gcloudGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gcloudGuard.errorCode === gcloudGuard.code
      && gcloudGuard.error === gcloudGuard.code
      && gcloudGuard.fellBackToDom === true
      && gcloudGuardCalls.length === 0,
      'gcloud.start_instance is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // AWS Console T1a handler -- console metadata reads + guarded SigV4-pending rows
  // =========================================================================
  const awsPath = path.join(HANDLERS_DIR, 'aws.js');
  const awsExtPath = path.join(EXT_HANDLERS_DIR, 'aws.js');
  check(fs.existsSync(awsPath), 'catalog/handlers/aws.js exists');
  if (fs.existsSync(awsPath)) {
    const aws = require(awsPath);
    const awsSrc = readSource(awsPath);
    const awsReadSlugs = [
      'aws.describe_instance',
      'aws.get_current_user',
      'aws.get_function',
      'aws.list_alarms',
      'aws.list_functions',
      'aws.list_iam_roles',
      'aws.list_iam_users',
      'aws.list_instances',
      'aws.list_log_groups',
      'aws.list_regions',
      'aws.list_security_groups',
      'aws.list_subnets',
      'aws.list_vpcs'
    ];
    const awsWriteSlugs = [
      'aws.invoke_function',
      'aws.start_instance',
      'aws.stop_instance'
    ];
    check(awsReadSlugs.every(function (slug) {
      return aws[slug] && aws[slug].tier === 'T1a'
        && aws[slug].origin === 'https://console.aws.amazon.com'
        && aws[slug].sideEffectClass === 'read'
        && typeof aws[slug].handle === 'function';
    }), 'AWS read descriptors are T1a reads pinned to console.aws.amazon.com');
    check(awsWriteSlugs.every(function (slug) {
      return aws[slug] && aws[slug].tier === 'T1a'
        && aws[slug].origin === 'https://console.aws.amazon.com'
        && aws[slug].sideEffectClass === 'write'
        && typeof aws[slug].handle === 'function';
    }), 'AWS mutation descriptors are guarded T1a writes pinned to console.aws.amazon.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(awsSrc),
      'aws.js references no privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(awsSrc) === false && awsSrc.indexOf('XMLHttpRequest') === -1,
      'aws.js performs no direct fetch/XMLHttpRequest calls');
    check(awsSrc.indexOf('document.cookie') === -1 && awsSrc.indexOf('localStorage') === -1
      && awsSrc.indexOf('sessionStorage') === -1,
      'aws.js reads no browser storage or cookies directly');
    check(awsSrc.indexOf('amazonaws.com') === -1,
      'aws.js does not target separate AWS service API origins');
    check(/Authorization|Bearer|secretAccessKey|sessionToken|AKIA|ASIA/.test(awsSrc) === false,
      'aws.js contains no credential-header or AWS access-key handling');
    check(/console\.(log|debug|info|warn|error)/.test(awsSrc) === false,
      'aws.js does not console-log potentially credential-bearing state');
    check(fs.existsSync(awsExtPath) ? readSource(awsExtPath) === awsSrc : true,
      'extension/catalog/handlers/aws.js matches catalog/handlers/aws.js when present');

    const awsHtml = '<!doctype html>'
      + '<meta name="awsc-session-data" content="{&quot;accountId&quot;:&quot;123456789012&quot;,&quot;displayName&quot;:&quot;FSB Role&quot;,&quot;sessionARN&quot;:&quot;arn:aws:sts::123456789012:assumed-role/Fsb/Test&quot;,&quot;infrastructureRegion&quot;:&quot;us-east-1&quot;}">'
      + '<meta name="awsc-mezz-region" content="us-west-2">'
      + '<meta name="awsc-mezz-data" content="{&quot;regions&quot;:[{&quot;id&quot;:&quot;us-east-1&quot;,&quot;name&quot;:&quot;United States&quot;,&quot;location&quot;:&quot;N. Virginia&quot;,&quot;optIn&quot;:true}]}">';
    function makeAwsCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        calls: calls,
        tabId: opts.tabId || 291,
        currentUrl: opts.currentUrl || 'https://console.aws.amazon.com/ec2/home?region=us-west-2#Instances:',
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          return { success: true, status: 200, data: opts.html || awsHtml };
        }
      };
    }

    const awsUserCtx = makeAwsCtx({ tabId: 292 });
    const awsUser = await aws['aws.get_current_user'].handle({}, awsUserCtx);
    check(awsUser && awsUser.success === true
      && awsUser.data.user.account_id === '123456789012'
      && awsUser.data.user.username === 'FSB Role'
      && awsUser.data.user.session_arn.indexOf('assumed-role/Fsb/Test') !== -1
      && awsUserCtx.calls.length === 1
      && awsUserCtx.calls[0].tabId === 292
      && awsUserCtx.calls[0].spec.url === awsUserCtx.currentUrl
      && awsUserCtx.calls[0].spec.origin === 'https://console.aws.amazon.com'
      && awsUserCtx.calls[0].spec.authStrategy === 'same-origin-cookie'
      && awsUserCtx.calls[0].spec.extract === '@',
      'aws.get_current_user reads same-origin console metadata and maps identity fields');

    const awsRegionsCtx = makeAwsCtx({ tabId: 293 });
    const awsRegions = await aws['aws.list_regions'].handle({}, awsRegionsCtx);
    check(awsRegions && awsRegions.success === true
      && awsRegions.data.current_region === 'us-west-2'
      && awsRegions.data.regions[0].id === 'us-east-1'
      && awsRegions.data.regions[0].opt_in === true
      && awsRegionsCtx.calls.length === 1,
      'aws.list_regions maps console region metadata from the same-origin page');

    const awsReadCalls = [];
    const awsReadFallback = await aws['aws.list_instances'].handle({}, {
      tabId: 294,
      async executeBoundSpec() { awsReadCalls.push('spec'); }
    });
    check(awsReadFallback && awsReadFallback.success === false
      && awsReadFallback.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && awsReadFallback.errorCode === awsReadFallback.code
      && awsReadFallback.reason === 'aws-sigv4-bridge-unapproved'
      && awsReadCalls.length === 0,
      'aws.list_instances stays fail-closed pending the approved SigV4 bridge');

    const awsGuardCalls = [];
    const awsGuard = await aws['aws.invoke_function'].handle({ function_name: 'fn' }, {
      tabId: 295,
      async executeBoundSpec() { awsGuardCalls.push('spec'); }
    });
    check(awsGuard && awsGuard.success === false
      && awsGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && awsGuard.errorCode === awsGuard.code
      && awsGuard.error === awsGuard.code
      && awsGuard.fellBackToDom === true
      && awsGuard.reason === 'unverified-aws-lambda-invoke-mutation'
      && awsGuardCalls.length === 0,
      'aws.invoke_function is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Google Docs same-origin Drive API read + guarded mutation head -- catalog/handlers/gdocs.js
  // =========================================================================
  const gdocsPath = path.join(HANDLERS_DIR, 'gdocs.js');
  check(fs.existsSync(gdocsPath), 'catalog/handlers/gdocs.js exists');
  if (fs.existsSync(gdocsPath)) {
    try { delete require.cache[require.resolve(gdocsPath)]; } catch (e) { /* not cached */ }
    const gdocs = require(gdocsPath);
    const gdocsSrc = readSource(gdocsPath);
    const gdocsReadSlugs = [
      'gdocs.get_current_document',
      'gdocs.get_current_user',
      'gdocs.get_document',
      'gdocs.get_document_text',
      'gdocs.list_comments',
      'gdocs.list_recent_documents',
      'gdocs.search_documents'
    ];
    const gdocsGuardedSlugs = [
      'gdocs.copy_document',
      'gdocs.create_comment',
      'gdocs.create_document',
      'gdocs.delete_comment',
      'gdocs.delete_document',
      'gdocs.delete_reply',
      'gdocs.reopen_comment',
      'gdocs.reply_to_comment',
      'gdocs.resolve_comment',
      'gdocs.restore_document',
      'gdocs.trash_document',
      'gdocs.update_document_title'
    ];
    gdocsReadSlugs.forEach(function (slug) {
      check(gdocs[slug] && gdocs[slug].tier === 'T1a'
        && gdocs[slug].origin === 'https://docs.google.com'
        && gdocs[slug].sideEffectClass === 'read'
        && typeof gdocs[slug].handle === 'function',
        'gdocs handler exposes ' + slug + ' as T1a read on docs.google.com');
    });
    gdocsGuardedSlugs.forEach(function (slug) {
      check(gdocs[slug] && gdocs[slug].tier === 'T1a'
        && gdocs[slug].origin === 'https://docs.google.com'
        && (gdocs[slug].sideEffectClass === 'write' || gdocs[slug].sideEffectClass === 'destructive')
        && typeof gdocs[slug].handle === 'function',
        'gdocs handler exposes ' + slug + ' as guarded T1a write/destructive on docs.google.com');
    });
    check(gdocsSrc.indexOf('chrome.scripting') === -1 && gdocsSrc.indexOf('chrome.tabs') === -1
      && gdocsSrc.indexOf('chrome.cookies') === -1 && gdocsSrc.indexOf('chrome.webRequest') === -1,
      'gdocs.js references NO privileged chrome execution/cookie APIs');
    check(/\bfetch\s*\(/.test(gdocsSrc) === false && gdocsSrc.indexOf('XMLHttpRequest') === -1,
      'gdocs.js performs no direct fetch/XMLHttpRequest calls');
    check(gdocsSrc.indexOf('document.cookie') === -1 && gdocsSrc.indexOf('localStorage') === -1
      && gdocsSrc.indexOf('sessionStorage') === -1,
      'gdocs.js reads no document.cookie/localStorage/sessionStorage material');
    check(gdocsSrc.indexOf('gapi.client') === -1 && gdocsSrc.indexOf('content.googleapis.com') === -1,
      'gdocs.js avoids the unapproved client-side GAPI bridge and separate Google API origin');

    function makeGdocsCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        calls: calls,
        tabId: opts.tabId || 291,
        url: opts.url || 'https://docs.google.com/document/d/doc-1/edit?tab=t.1',
        async executeBoundSpec(spec, tabId) {
          calls.push({ spec: spec, tabId: tabId });
          if (spec.url.indexOf('/drive/v3/about') !== -1) {
            return { success: true, status: 200, data: {
              user: {
                displayName: 'Docs User',
                emailAddress: 'docs@example.invalid',
                permissionId: 'perm-1',
                photoLink: 'https://example.invalid/photo.png'
              },
              storageQuota: {
                limit: '100',
                usage: '20',
                usageInDrive: '10',
                usageInDriveTrash: '1'
              }
            } };
          }
          if (spec.url.indexOf('/drive/v3/files/doc-1/comments') !== -1) {
            return { success: true, status: 200, data: {
              comments: [
                { id: 'c-open', content: 'Open', resolved: false, author: { displayName: 'Ada', emailAddress: 'ada@example.invalid' }, replies: [] },
                { id: 'c-resolved', content: 'Done', resolved: true, author: { displayName: 'Grace', emailAddress: 'grace@example.invalid' }, replies: [{ id: 'r-1', content: 'Resolved', action: 'resolve' }] }
              ],
              nextPageToken: 'next-1'
            } };
          }
          if (spec.url.indexOf('/document/d/doc-1/export?format=txt') !== -1) {
            return { success: true, status: 200, text: 'Line 1\nLine 2', data: null };
          }
          if (spec.url.indexOf('/drive/v3/files/doc-1') !== -1) {
            return { success: true, status: 200, data: {
              id: 'doc-1',
              name: 'Launch Notes',
              mimeType: 'application/vnd.google-apps.document',
              createdTime: '2026-01-01T00:00:00Z',
              modifiedTime: '2026-01-02T00:00:00Z',
              trashed: false,
              starred: true,
              shared: true,
              ownedByMe: true,
              webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
              owners: [{ displayName: 'Docs User', emailAddress: 'docs@example.invalid' }],
              lastModifyingUser: { displayName: 'Ada' }
            } };
          }
          if (spec.url.indexOf('/drive/v3/files?') !== -1) {
            return { success: true, status: 200, data: {
              files: [{ id: 'doc-1', name: 'Launch Notes', mimeType: 'application/vnd.google-apps.document' }],
              nextPageToken: ''
            } };
          }
          return { success: true, status: 200, data: {} };
        }
      };
    }

    const gdocsUserCtx = makeGdocsCtx({ tabId: 292 });
    const gdocsUser = await gdocs['gdocs.get_current_user'].handle({}, gdocsUserCtx);
    check(gdocsUser && gdocsUser.success === true
      && gdocsUser.data.user.email === 'docs@example.invalid'
      && gdocsUser.data.storage_quota.usage_bytes === '20'
      && gdocsUserCtx.calls.length === 1
      && gdocsUserCtx.calls[0].spec.url.indexOf('https://docs.google.com/drive/v3/about?') === 0
      && gdocsUserCtx.calls[0].spec.origin === 'https://docs.google.com'
      && gdocsUserCtx.calls[0].spec.authStrategy === 'same-origin-cookie',
      'gdocs.get_current_user uses same-origin Drive about and maps user/quota data');

    const gdocsCurrentCtx = makeGdocsCtx({ tabId: 293 });
    const gdocsCurrent = await gdocs['gdocs.get_current_document'].handle({}, gdocsCurrentCtx);
    check(gdocsCurrent && gdocsCurrent.success === true
      && gdocsCurrent.data.document.title === 'Launch Notes'
      && gdocsCurrent.data.active_tab.id === 't.1'
      && gdocsCurrentCtx.calls[0].spec.url.indexOf('/drive/v3/files/doc-1?') !== -1,
      'gdocs.get_current_document derives the active document ID from ctx.url and reads Drive metadata');

    const gdocsTextCtx = makeGdocsCtx({ tabId: 294 });
    const gdocsText = await gdocs['gdocs.get_document_text'].handle({ document_id: 'doc-1' }, gdocsTextCtx);
    check(gdocsText && gdocsText.success === true
      && gdocsText.data.title === 'Launch Notes'
      && gdocsText.data.text === 'Line 1\nLine 2'
      && gdocsTextCtx.calls.length === 2
      && gdocsTextCtx.calls[1].spec.url === 'https://docs.google.com/document/d/doc-1/export?format=txt',
      'gdocs.get_document_text reads metadata then same-origin text export');

    const gdocsCommentsCtx = makeGdocsCtx({ tabId: 295 });
    const gdocsComments = await gdocs['gdocs.list_comments'].handle({ document_id: 'doc-1', status: 'open', page_size: 25 }, gdocsCommentsCtx);
    check(gdocsComments && gdocsComments.success === true
      && gdocsComments.data.comments.length === 1
      && gdocsComments.data.comments[0].id === 'c-open'
      && gdocsCommentsCtx.calls[0].spec.url.indexOf('/drive/v3/files/doc-1/comments?') !== -1,
      'gdocs.list_comments uses Drive comments and filters open threads');

    const gdocsSearchCtx = makeGdocsCtx({ tabId: 296 });
    const gdocsSearch = await gdocs['gdocs.search_documents'].handle({ query: 'launch', page_size: 5 }, gdocsSearchCtx);
    check(gdocsSearch && gdocsSearch.success === true
      && gdocsSearch.data.documents[0].id === 'doc-1'
      && decodeURIComponent(gdocsSearchCtx.calls[0].spec.url).indexOf("fullText contains 'launch'") !== -1,
      'gdocs.search_documents builds a constrained Drive files search query');

    const gdocsNoPrimitive = await gdocs['gdocs.get_current_user'].handle({}, {});
    check(gdocsNoPrimitive && gdocsNoPrimitive.success === false
      && gdocsNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gdocsNoPrimitive.reason === 'gdocs-execute-bound-spec-unavailable',
      'gdocs.get_current_user fails closed when executeBoundSpec is unavailable');

    const gdocsGuardCalls = [];
    const gdocsGuard = await gdocs['gdocs.update_document_title'].handle({ document_id: 'doc-1', title: 'New' }, {
      tabId: 297,
      async executeBoundSpec() { gdocsGuardCalls.push('spec'); }
    });
    check(gdocsGuard && gdocsGuard.success === false
      && gdocsGuard.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gdocsGuard.errorCode === gdocsGuard.code
      && gdocsGuard.fellBackToDom === true
      && gdocsGuardCalls.length === 0,
      'gdocs.update_document_title is guarded fail-closed and calls no execution primitive');
  }

  // =========================================================================
  // Datadog same-origin GET read head -- catalog/handlers/datadog.js
  // =========================================================================
  const datadogPath = path.join(HANDLERS_DIR, 'datadog.js');
  const datadogExtPath = path.join(EXT_HANDLERS_DIR, 'datadog.js');
  check(fs.existsSync(datadogPath), 'catalog/handlers/datadog.js exists');
  if (fs.existsSync(datadogPath)) {
    const datadog = require(datadogPath);
    const datadogSrc = readSource(datadogPath);
    const datadogReadSlugs = [
      'datadog.get_current_user',
      'datadog.get_dashboard',
      'datadog.get_downtime',
      'datadog.get_host_info',
      'datadog.get_host_totals',
      'datadog.get_incident',
      'datadog.get_metric_metadata',
      'datadog.get_monitor',
      'datadog.get_monitor_groups',
      'datadog.get_notebook',
      'datadog.get_org_config',
      'datadog.get_permissions',
      'datadog.get_service_definition',
      'datadog.get_service_dependencies',
      'datadog.get_slo',
      'datadog.get_slo_history',
      'datadog.get_synthetics_results',
      'datadog.get_synthetics_test',
      'datadog.get_trace',
      'datadog.get_usage_summary',
      'datadog.get_user',
      'datadog.list_api_keys',
      'datadog.list_dashboards',
      'datadog.list_downtimes',
      'datadog.list_host_tags',
      'datadog.list_hosts',
      'datadog.list_incidents',
      'datadog.list_metric_tags',
      'datadog.list_metrics',
      'datadog.list_monitor_downtimes',
      'datadog.list_monitor_tags',
      'datadog.list_monitors',
      'datadog.list_notebooks',
      'datadog.list_services',
      'datadog.list_slo_corrections',
      'datadog.list_slos',
      'datadog.list_synthetics_tests',
      'datadog.list_teams',
      'datadog.list_users',
      'datadog.query_metrics',
      'datadog.search_dashboards',
      'datadog.search_dashboards_advanced',
      'datadog.search_monitors',
      'datadog.search_notebooks',
      'datadog.search_services',
      'datadog.search_slos'
    ];
    const datadogExcludedSlugs = [
      'datadog.clone_dashboard',
      'datadog.clone_monitor',
      'datadog.get_monitor_state_history',
      'datadog.query_timeseries',
      'datadog.search_logs',
      'datadog.aggregate_rum_events',
      'datadog.aggregate_spans',
      'datadog.cancel_downtime',
      'datadog.create_downtime',
      'datadog.create_monitor',
      'datadog.create_notebook',
      'datadog.delete_dashboard',
      'datadog.delete_monitor',
      'datadog.delete_notebook',
      'datadog.mute_host',
      'datadog.mute_monitor',
      'datadog.pause_synthetics_test',
      'datadog.search_rum_events',
      'datadog.search_security_signals',
      'datadog.search_spans',
      'datadog.trigger_synthetics_test',
      'datadog.unmute_host',
      'datadog.unmute_monitor',
      'datadog.update_monitor',
      'datadog.update_notebook'
    ];

    function makeDatadogCtx(options) {
      const opts = options || {};
      const calls = [];
      return {
        calls,
        ctx: {
          tabId: opts.tabId || 301,
          async executeBoundSpec(spec, tabId) {
            calls.push({ spec, tabId });
            if (opts.result) { return opts.result; }
            return { success: true, status: 200, data: opts.data || { data: {}, dashboards: [], monitors: [] } };
          }
        }
      };
    }

    check(datadogReadSlugs.every(function(slug) {
      return datadog[slug] && datadog[slug].tier === 'T1a'
        && datadog[slug].sideEffectClass === 'read'
        && datadog[slug].origin === 'https://app.datadoghq.com'
        && datadog[slug].params
        && typeof datadog[slug].handle === 'function';
    }), 'Datadog GET-backed read descriptors are T1a reads pinned to app.datadoghq.com');
    check(Object.keys(datadog).length === datadogReadSlugs.length,
      'Datadog handler exposes only the reviewed GET read set');
    check(datadogExcludedSlugs.every(function(slug) {
      return !datadog[slug] && datadogSrc.indexOf("'" + slug + "'") === -1 && datadogSrc.indexOf('"' + slug + '"') === -1;
    }), 'Datadog clone/POST-search/write/destructive descriptors stay out of the active head');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(datadogSrc),
      'datadog.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(datadogSrc),
      'datadog.js performs no direct network call');
    check(!/document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(datadogSrc),
      'datadog.js does not use storage token reads, credential headers, or mutation methods');
    check(fs.existsSync(datadogExtPath) ? readSource(datadogExtPath) === datadogSrc : true,
      'extension/catalog/handlers/datadog.js matches catalog/handlers/datadog.js when present');

    const ddDash = makeDatadogCtx({ tabId: 302, data: { id: 'dash-1', title: 'Datadog Fixture' } });
    const ddDashOut = await datadog['datadog.get_dashboard'].handle({ dashboard_id: 'dash/1' }, ddDash.ctx);
    check(ddDashOut && ddDashOut.success === true
      && ddDash.calls.length === 1
      && ddDash.calls[0].tabId === 302
      && ddDash.calls[0].spec.method === 'GET'
      && ddDash.calls[0].spec.url === 'https://app.datadoghq.com/api/v1/dashboard/dash%2F1'
      && ddDash.calls[0].spec.origin === 'https://app.datadoghq.com'
      && ddDash.calls[0].spec.authStrategy === 'same-origin-cookie'
      && ddDash.calls[0].spec.extract === '@',
      'datadog.get_dashboard builds one same-origin GET spec with encoded path params');

    const ddMonitorSearch = makeDatadogCtx({ data: { monitors: [], metadata: { total_count: 0 } } });
    await datadog['datadog.search_monitors'].handle({ query: 'status:Alert tag:env:prod', per_page: 5, page: 2 }, ddMonitorSearch.ctx);
    check(ddMonitorSearch.calls.length === 1
      && ddMonitorSearch.calls[0].spec.url.indexOf('https://app.datadoghq.com/api/v1/monitor/search?') === 0
      && ddMonitorSearch.calls[0].spec.url.indexOf('query=status%3AAlert%20tag%3Aenv%3Aprod') !== -1
      && ddMonitorSearch.calls[0].spec.url.indexOf('per_page=5') !== -1
      && ddMonitorSearch.calls[0].spec.url.indexOf('page=2') !== -1,
      'datadog.search_monitors maps query and pagination to Datadog monitor search GET params');

    const ddMetrics = makeDatadogCtx({ data: { series: [] } });
    await datadog['datadog.query_metrics'].handle({ query: 'avg:system.cpu.user{*}', from: 10, to: 20 }, ddMetrics.ctx);
    check(ddMetrics.calls.length === 1
      && ddMetrics.calls[0].spec.url.indexOf('https://app.datadoghq.com/api/v1/query?') === 0
      && ddMetrics.calls[0].spec.url.indexOf('from=10') !== -1
      && ddMetrics.calls[0].spec.url.indexOf('to=20') !== -1
      && ddMetrics.calls[0].spec.url.indexOf('query=avg%3Asystem.cpu.user%7B*%7D') !== -1,
      'datadog.query_metrics maps metric query and time range to /api/v1/query');

    const ddTrace = makeDatadogCtx({ data: { trace: {}, orphaned: [], is_truncated: false } });
    await datadog['datadog.get_trace'].handle({ trace_id: '000000000000000f' }, ddTrace.ctx);
    check(ddTrace.calls.length === 1
      && ddTrace.calls[0].spec.url === 'https://app.datadoghq.com/api/v1/trace/15',
      'datadog.get_trace converts hex trace IDs to decimal path IDs');

    const ddNoPrimitive = await datadog['datadog.list_dashboards'].handle({}, { tabId: 303 });
    check(ddNoPrimitive && ddNoPrimitive.success === false
      && ddNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ddNoPrimitive.errorCode === ddNoPrimitive.code
      && ddNoPrimitive.reason === 'datadog-execute-bound-spec-unavailable',
      'datadog.list_dashboards fails closed when executeBoundSpec is unavailable');

    const ddError = makeDatadogCtx({ result: { success: true, status: 200, data: { errors: [{ title: 'login required' }] } } });
    const ddErrorOut = await datadog['datadog.list_users'].handle({}, ddError.ctx);
    check(ddErrorOut && ddErrorOut.success === false
      && ddErrorOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ddErrorOut.reason === 'datadog-api-error-envelope',
      'datadog.list_users fails closed on Datadog error envelopes');
  }

  // =========================================================================
  // Google Analytics GAPI page-bridge read head -- catalog/handlers/ganalytics.js
  // =========================================================================
  const ganalyticsPath = path.join(HANDLERS_DIR, 'ganalytics.js');
  check(fs.existsSync(ganalyticsPath), 'catalog/handlers/ganalytics.js exists');
  if (fs.existsSync(ganalyticsPath)) {
    const ga = require(ganalyticsPath);
    const gaSrc = readSource(ganalyticsPath);
    const gaReadSlugs = [
      'ganalytics.check_compatibility',
      'ganalytics.get_active_property',
      'ganalytics.get_current_user',
      'ganalytics.get_metadata',
      'ganalytics.list_accounts',
      'ganalytics.run_batch_report',
      'ganalytics.run_realtime_report',
      'ganalytics.run_report'
    ];

    check(gaReadSlugs.every(function(slug) {
      return ga[slug] && ga[slug].tier === 'T1a'
        && ga[slug].sideEffectClass === 'read'
        && ga[slug].origin === 'https://analytics.google.com'
        && ga[slug].params
        && ga[slug].params.type === 'object'
        && typeof ga[slug].handle === 'function';
    }), 'Google Analytics read descriptors are T1a reads pinned to analytics.google.com');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(gaSrc),
      'ganalytics.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(gaSrc),
      'ganalytics.js performs no direct network call');
    check(!/Authorization|Bearer|getCookie|SAPISID|document\.cookie|localStorage|sessionStorage/.test(gaSrc),
      'ganalytics.js does not read cookies/storage or replay bearer credentials directly');
    check(!/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|sapisid)\b/i.test(gaSrc),
      'ganalytics.js does NOT console-log secret-bearing values');

    const gaCalls = [];
    const gaCtx = {
      origin: 'https://analytics.google.com',
      tabId: 298,
      async executeBoundPageRead(request, tabId) {
        gaCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Google Analytics reads must not call executeBoundSpec');
      }
    };
    const gaReportOut = await ga['ganalytics.run_report'].handle({
      property_id: '123',
      metrics: ['activeUsers'],
      dimensions: ['country'],
      start_date: '7daysAgo',
      end_date: 'today',
      limit: 10
    }, gaCtx);
    check(gaCalls.length === 1
      && gaCalls[0].tabId === 298
      && gaCalls[0].request.origin === 'https://analytics.google.com'
      && gaCalls[0].request.namespace === 'ganalytics'
      && gaCalls[0].request.action === 'run_report'
      && gaCalls[0].request.args.property_id === '123'
      && gaCalls[0].request.args.metrics[0] === 'activeUsers',
      'ganalytics.run_report dispatches a bounded Google Analytics page-read request');
    check(gaReportOut && gaReportOut.success === true && gaReportOut.data.action === 'run_report',
      'ganalytics.run_report returns the bounded page-read result');

    await ga['ganalytics.get_current_user'].handle({}, gaCtx);
    check(gaCalls.length === 2
      && gaCalls[1].request.action === 'get_current_user'
      && gaCalls[1].request.namespace === 'ganalytics',
      'ganalytics.get_current_user obtains page-owned GAPI/preload data only through bounded page-read');

    const gaNoPrimitive = await ga['ganalytics.get_metadata'].handle({ property_id: '123' }, {
      origin: 'https://analytics.google.com',
      tabId: 299
    });
    check(gaNoPrimitive && gaNoPrimitive.success === false
      && gaNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && gaNoPrimitive.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && gaNoPrimitive.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && gaNoPrimitive.fellBackToDom === true
      && gaNoPrimitive.reason === 'ganalytics-page-read-primitive-unavailable',
      'ganalytics.get_metadata fails closed when the page-read primitive is unavailable');

    const ganalyticsExtPath = path.join(EXT_HANDLERS_DIR, 'ganalytics.js');
    check(fs.existsSync(ganalyticsExtPath),
      'extension/catalog/handlers/ganalytics.js exists for unpacked dev loads');
    if (fs.existsSync(ganalyticsExtPath)) {
      check(readSource(ganalyticsPath) === readSource(ganalyticsExtPath),
        'extension/catalog/handlers/ganalytics.js matches catalog/handlers/ganalytics.js byte-for-byte');
    }
  }

  // =========================================================================
  // Steam same-origin Store read + guarded mutation head -- catalog/handlers/steam.js
  // =========================================================================
  const steamPath = path.join(HANDLERS_DIR, 'steam.js');
  check(fs.existsSync(steamPath), 'catalog/handlers/steam.js exists');
  if (fs.existsSync(steamPath)) {
    const steam = require(steamPath);
    const steamSrc = readSource(steamPath);
    const steamExtPath = path.join(EXT_HANDLERS_DIR, 'steam.js');
    const steamReadSlugs = [
      'steam.search_store',
      'steam.get_app_details',
      'steam.get_app_reviews',
      'steam.get_app_user_details',
      'steam.get_current_user',
      'steam.get_featured',
      'steam.get_featured_categories',
      'steam.get_popular_tags',
      'steam.get_user_data'
    ];
    const steamGuardedClasses = {
      // generate_discovery_queue / ignore_app / unignore_app all POST to
      // store.steampowered.com and mutate server-side account state (the
      // ignored-apps list, the discovery queue). They ship as guarded-write
      // fail-closed rather than read now that the importer classifier surfaces
      // per-plugin storePost() as a write-shaped transport helper.
      'steam.generate_discovery_queue': 'write',
      'steam.add_to_wishlist': 'write',
      'steam.follow_app': 'write',
      'steam.ignore_app': 'write',
      'steam.unignore_app': 'write',
      'steam.remove_from_wishlist': 'destructive'
    };

    check(steamReadSlugs.every(function(slug) {
      return steam[slug] && steam[slug].tier === 'T1a'
        && steam[slug].sideEffectClass === 'read'
        && steam[slug].origin === 'https://store.steampowered.com'
        && steam[slug].params
        && steam[slug].params.type === 'object'
        && typeof steam[slug].handle === 'function';
    }), 'Steam read descriptors are T1a reads pinned to store.steampowered.com');
    check(Object.keys(steamGuardedClasses).every(function(slug) {
      return steam[slug] && steam[slug].tier === 'T1a'
        && steam[slug].sideEffectClass === steamGuardedClasses[slug]
        && steam[slug].origin === 'https://store.steampowered.com'
        && steam[slug].params
        && typeof steam[slug].handle === 'function';
    }), 'Steam POST/session-bound descriptors are present but guarded fail-closed');
    check(Object.keys(steam).length === steamReadSlugs.length + Object.keys(steamGuardedClasses).length,
      'Steam handler exposes only the reviewed read set plus guarded POST/session-bound rows');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(steamSrc),
      'steam.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(steamSrc),
      'steam.js performs no direct network call');
    check(!/Authorization|document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(steamSrc),
      'steam.js does not read storage cookies or set credential headers directly');

    const steamCalls = [];
    const steamCtx = {
      origin: 'https://store.steampowered.com',
      tabId: 306,
      async executeBoundSpec(spec, tabId) {
        steamCalls.push({ spec: spec, tabId: tabId });
        if (spec.url.indexOf('/api/storesearch/') !== -1) {
          return { success: true, status: 200, data: { total: 1, items: [{ id: 620, name: 'Portal 2', type: 'app', price: { currency: 'USD', final: 999 } }] } };
        }
        if (spec.url.indexOf('/api/appdetails') !== -1) {
          return { success: true, status: 200, data: { '620': { success: true, data: { steam_appid: 620, name: 'Portal 2', type: 'game', is_free: false, platforms: { windows: true, mac: true, linux: true } } } } };
        }
        if (spec.url.indexOf('/appreviews/') !== -1) {
          return { success: true, status: 200, data: { query_summary: { total_reviews: 10, total_positive: 9, total_negative: 1, review_score_desc: 'Very Positive' }, reviews: [{ recommendationid: '1', review: 'ok', voted_up: true, author: { steamid: '76561197960265851' } }], cursor: '*' } };
        }
        if (spec.url.indexOf('/dynamicstore/userdata/') !== -1) {
          return { success: true, status: 200, data: { rgWishlist: [620], rgOwnedApps: [400], rgOwnedPackages: [1], rgFollowedApps: [620], rgIgnoredApps: { '10': 1 }, rgRecommendedTags: [{ tagid: 19, name: 'Action', count: 2 }], nCartLineItemCount: 0 } };
        }
        return { success: true, status: 200, data: {} };
      },
      async executeBoundPageRead(request, tabId) {
        steamCalls.push({ pageRead: request, tabId: tabId });
        return { success: true, status: 200, data: { account_id: 123, steam_id64: '76561197960265851' } };
      }
    };

    const steamSearchOut = await steam['steam.search_store'].handle({ term: 'portal', count: 1 }, steamCtx);
    check(steamSearchOut && steamSearchOut.success === true
      && steamSearchOut.data && steamSearchOut.data.items && steamSearchOut.data.items[0].id === 620
      && steamCalls[0].spec.url.indexOf('/api/storesearch/') !== -1
      && steamCalls[0].spec.url.indexOf('term=portal') !== -1
      && steamCalls[0].spec.origin === 'https://store.steampowered.com'
      && steamCalls[0].spec.method === 'GET',
      'steam.search_store executes one bounded same-origin Store GET spec');

    const steamDetailsOut = await steam['steam.get_app_details'].handle({ appid: 620 }, steamCtx);
    check(steamDetailsOut && steamDetailsOut.success === true
      && steamDetailsOut.data && steamDetailsOut.data.app && steamDetailsOut.data.app.name === 'Portal 2',
      'steam.get_app_details maps the reviewed appdetails JSON envelope');

    const steamReviewsOut = await steam['steam.get_app_reviews'].handle({ appid: 620 }, steamCtx);
    check(steamReviewsOut && steamReviewsOut.success === true
      && steamReviewsOut.data && steamReviewsOut.data.summary.total_reviews === 10
      && steamReviewsOut.data.reviews && steamReviewsOut.data.reviews[0].voted_up === true,
      'steam.get_app_reviews maps review summary and review rows');

    const steamCurrentUserOut = await steam['steam.get_current_user'].handle({}, steamCtx);
    check(steamCurrentUserOut && steamCurrentUserOut.success === true
      && steamCalls[steamCalls.length - 1].pageRead
      && steamCalls[steamCalls.length - 1].pageRead.origin === 'https://store.steampowered.com'
      && steamCalls[steamCalls.length - 1].pageRead.namespace === 'steam'
      && steamCalls[steamCalls.length - 1].pageRead.action === 'get_current_user',
      'steam.get_current_user dispatches one bounded Steam page-read request');

    const guardedStart = steamCalls.length;
    const steamAddOut = await steam['steam.add_to_wishlist'].handle({ appid: 620 }, steamCtx);
    const steamQueueOut = await steam['steam.generate_discovery_queue'].handle({ queue_type: 0 }, steamCtx);
    check(steamAddOut && steamAddOut.success === false
      && steamAddOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && steamAddOut.slug === 'steam.add_to_wishlist'
      && steamAddOut.reason === 'unverified-steam-add-to-wishlist-mutation'
      && steamQueueOut && steamQueueOut.success === false
      && steamQueueOut.slug === 'steam.generate_discovery_queue'
      && steamQueueOut.reason === 'unverified-steam-generate-discovery-queue-mutation'
      && steamCalls.length === guardedStart,
      'Steam guarded rows fail closed and call no execution primitive');

    check(fs.existsSync(steamExtPath),
      'extension/catalog/handlers/steam.js exists for unpacked dev loads');
    if (fs.existsSync(steamExtPath)) {
      check(readSource(steamPath) === readSource(steamExtPath),
        'extension/catalog/handlers/steam.js matches catalog/handlers/steam.js byte-for-byte');
    }
  }

  // =========================================================================
  // Spotify page-bearer read head -- catalog/handlers/spotify.js
  // =========================================================================
  const spotifyPath = path.join(HANDLERS_DIR, 'spotify.js');
  check(fs.existsSync(spotifyPath), 'catalog/handlers/spotify.js exists');
  if (fs.existsSync(spotifyPath)) {
    const spotify = require(spotifyPath);
    const spotifySrc = readSource(spotifyPath);
    const spotifyExtPath = path.join(EXT_HANDLERS_DIR, 'spotify.js');
    const spotifyReadSlugs = [
      'spotify.get_album',
      'spotify.get_artist',
      'spotify.get_available_devices',
      'spotify.get_current_user',
      'spotify.get_currently_playing',
      'spotify.get_playback_state',
      'spotify.get_playlist',
      'spotify.get_queue',
      'spotify.get_recently_played',
      'spotify.get_saved_tracks',
      'spotify.search'
    ];
    const spotifyGuardedSlugs = [
      'spotify.add_to_queue',
      'spotify.pause_playback',
      'spotify.seek_to_position',
      'spotify.set_repeat_mode',
      'spotify.set_volume',
      'spotify.skip_to_next',
      'spotify.skip_to_previous',
      'spotify.start_playback',
      'spotify.toggle_shuffle',
      'spotify.transfer_playback'
    ];

    check(spotifyReadSlugs.every(function(slug) {
      return spotify[slug] && spotify[slug].tier === 'T1a'
        && spotify[slug].sideEffectClass === 'read'
        && spotify[slug].origin === 'https://open.spotify.com'
        && spotify[slug].params
        && spotify[slug].params.type === 'object'
        && typeof spotify[slug].handle === 'function';
    }), 'Spotify read descriptors are T1a reads pinned to open.spotify.com');
    check(spotifyGuardedSlugs.every(function(slug) {
      return spotify[slug] && spotify[slug].tier === 'T1a'
        && spotify[slug].sideEffectClass === 'write'
        && spotify[slug].origin === 'https://open.spotify.com'
        && spotify[slug].params
        && typeof spotify[slug].handle === 'function';
    }), 'Spotify playback write descriptors are present but guarded fail-closed');
    check(Object.keys(spotify).length === spotifyReadSlugs.length + spotifyGuardedSlugs.length,
      'Spotify handler exposes only the reviewed read set plus guarded playback writes');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(spotifySrc),
      'spotify.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(spotifySrc),
      'spotify.js performs no direct network call');
    check(!/Authorization|document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(spotifySrc),
      'spotify.js does not read storage cookies or set credential headers directly');

    const spotifyCalls = [];
    const spotifyCtx = {
      origin: 'https://open.spotify.com',
      tabId: 304,
      async executeBoundPageRead(request, tabId) {
        spotifyCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Spotify reads must not call executeBoundSpec');
      }
    };
    const spotifySearchOut = await spotify['spotify.search'].handle({ query: 'Miles Davis', limit: 5 }, spotifyCtx);
    check(spotifySearchOut && spotifySearchOut.success === true
      && spotifyCalls.length === 1
      && spotifyCalls[0].tabId === 304
      && spotifyCalls[0].request.origin === 'https://open.spotify.com'
      && spotifyCalls[0].request.namespace === 'spotify'
      && spotifyCalls[0].request.action === 'search'
      && spotifyCalls[0].request.args.query === 'Miles Davis',
      'spotify.search dispatches one bounded Spotify page-bearer read request');

    const spotifyNoPrimitive = await spotify['spotify.get_album'].handle({ uri: 'spotify:album:test' }, {
      origin: 'https://open.spotify.com',
      tabId: 305
    });
    check(spotifyNoPrimitive && spotifyNoPrimitive.success === false
      && spotifyNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && spotifyNoPrimitive.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && spotifyNoPrimitive.fellBackToDom === true
      && spotifyNoPrimitive.reason === 'spotify-page-read-primitive-unavailable',
      'spotify.get_album fails closed when the page-read primitive is unavailable');

    const spotifyWriteOut = await spotify['spotify.set_volume'].handle({ volume_percent: 25 }, spotifyCtx);
    check(spotifyWriteOut && spotifyWriteOut.success === false
      && spotifyWriteOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && spotifyWriteOut.slug === 'spotify.set_volume'
      && spotifyWriteOut.reason === 'unverified-spotify-set-volume-mutation',
      'spotify.set_volume remains guarded fail-closed until live request-shape UAT promotes it');

    check(fs.existsSync(spotifyExtPath),
      'extension/catalog/handlers/spotify.js exists for unpacked dev loads');
    if (fs.existsSync(spotifyExtPath)) {
      check(readSource(spotifyPath) === readSource(spotifyExtPath),
        'extension/catalog/handlers/spotify.js matches catalog/handlers/spotify.js byte-for-byte');
    }
  }

  // =========================================================================
  // Twitch GraphQL page-bearer read head -- catalog/handlers/twitch.js
  // =========================================================================
  const twitchPath = path.join(HANDLERS_DIR, 'twitch.js');
  check(fs.existsSync(twitchPath), 'catalog/handlers/twitch.js exists');
  if (fs.existsSync(twitchPath)) {
    const twitch = require(twitchPath);
    const twitchSrc = readSource(twitchPath);
    const twitchExtPath = path.join(EXT_HANDLERS_DIR, 'twitch.js');
    const twitchReadSlugs = [
      'twitch.get_channel_emotes',
      'twitch.get_current_user',
      'twitch.get_game',
      'twitch.get_game_clips',
      'twitch.get_stream',
      'twitch.get_streams_by_game',
      'twitch.get_top_games',
      'twitch.get_top_streams',
      'twitch.get_user_clips',
      'twitch.get_user_profile',
      'twitch.get_user_videos',
      'twitch.get_video',
      'twitch.search_categories',
      'twitch.search_channels'
    ];

    check(twitchReadSlugs.every(function(slug) {
      return twitch[slug] && twitch[slug].tier === 'T1a'
        && twitch[slug].sideEffectClass === 'read'
        && twitch[slug].origin === 'https://www.twitch.tv'
        && twitch[slug].params
        && twitch[slug].params.type === 'object'
        && typeof twitch[slug].handle === 'function';
    }), 'Twitch read descriptors are T1a reads pinned to www.twitch.tv');
    check(Object.keys(twitch).length === twitchReadSlugs.length,
      'Twitch handler exposes only the reviewed read set');
    check(!/chrome\.(scripting|tabs|cookies|webRequest)/.test(twitchSrc),
      'twitch.js references no extension credential/navigation APIs');
    check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/.test(twitchSrc),
      'twitch.js performs no direct network call');
    check(!/Authorization|document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(twitchSrc),
      'twitch.js does not read storage cookies or set credential headers directly');

    const twitchCalls = [];
    const twitchCtx = {
      origin: 'https://www.twitch.tv',
      tabId: 307,
      async executeBoundPageRead(request, tabId) {
        twitchCalls.push({ request: request, tabId: tabId });
        return { success: true, status: 200, data: { action: request.action, args: request.args } };
      },
      async executeBoundSpec() {
        throw new Error('Twitch reads must not call executeBoundSpec');
      }
    };
    const twitchSearchOut = await twitch['twitch.search_channels'].handle({ query: 'music' }, twitchCtx);
    check(twitchSearchOut && twitchSearchOut.success === true
      && twitchCalls.length === 1
      && twitchCalls[0].tabId === 307
      && twitchCalls[0].request.origin === 'https://www.twitch.tv'
      && twitchCalls[0].request.namespace === 'twitch'
      && twitchCalls[0].request.action === 'search_channels'
      && twitchCalls[0].request.args.query === 'music',
      'twitch.search_channels dispatches one bounded Twitch GraphQL page-bearer read request');

    const twitchNoPrimitive = await twitch['twitch.get_current_user'].handle({}, {
      origin: 'https://www.twitch.tv',
      tabId: 308
    });
    check(twitchNoPrimitive && twitchNoPrimitive.success === false
      && twitchNoPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && twitchNoPrimitive.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && twitchNoPrimitive.fellBackToDom === true
      && twitchNoPrimitive.reason === 'twitch-page-read-primitive-unavailable',
      'twitch.get_current_user fails closed when the page-read primitive is unavailable');

    check(fs.existsSync(twitchExtPath),
      'extension/catalog/handlers/twitch.js exists for unpacked dev loads');
    if (fs.existsSync(twitchExtPath)) {
      check(readSource(twitchPath) === readSource(twitchExtPath),
        'extension/catalog/handlers/twitch.js matches catalog/handlers/twitch.js byte-for-byte');
    }
  }

  // =========================================================================
  // Reddit T1b recipe -- catalog/recipes/reddit-inbox.json
  // =========================================================================
  const redditRecipePath = path.join(RECIPES_DIR, 'reddit-inbox.json');
  check(fs.existsSync(redditRecipePath), 'catalog/recipes/reddit-inbox.json exists');
  if (fs.existsSync(redditRecipePath)) {
    const recipe = readJson(redditRecipePath);
    const recipeSrc = readSource(redditRecipePath);
    check(recipe.origin === 'https://www.reddit.com',
      'reddit-inbox.json origin is the first-party https://www.reddit.com');
    check(recipe.endpoint === '/message/unread.json',
      'reddit-inbox.json endpoint is /message/unread.json');
    check(recipe.method === 'GET' && recipe.authStrategy === 'same-origin-cookie',
      'reddit-inbox.json is a GET with same-origin-cookie auth');
    check(recipeSrc.indexOf('oauth.reddit.com') === -1,
      'reddit-inbox.json references NO separate-origin oauth.reddit.com (T-29-07)');
    const v = Schema.validateRecipe(recipe);
    check(v && v.success === true,
      'reddit-inbox.json validates against the closed recipe schema (got '
      + JSON.stringify(v) + ')');
  }

  // =========================================================================
  // Descriptors -- the handler/search descriptors are valid JSON and carry schemas
  // =========================================================================
  const descriptorFiles = [
    'github-issues.json',
    'github-issues-create.json',
    'slack-message.json',
    'slack-conversations-list.json',
    'notion-load-page.json',
    'notion-spaces.json',
    'reddit-inbox.json'
  ];
  descriptorFiles.forEach(function (name) {
    const p = path.join(DESCRIPTORS_DIR, name);
    check(fs.existsSync(p), 'catalog/descriptors/' + name + ' exists');
    if (fs.existsSync(p)) {
      var d = null;
      try { d = readJson(p); } catch (e) { d = null; }
      check(d && typeof d.slug === 'string' && typeof d.service === 'string'
        && typeof d.sideEffectClass === 'string',
        'catalog/descriptors/' + name + ' carries slug/service/sideEffectClass');
      if (name !== 'reddit-inbox.json') {
        check(d && d.params && d.params.type === 'object',
          'catalog/descriptors/' + name + ' carries a params schema for search/invoke');
      }
    }
  });

  ['github.js', 'slack.js', 'notion.js', 'gitlab.js', 'netlify.js', 'bitbucket.js', 'circleci.js', 'vercel.js', 'retool.js', 'asana.js', 'shortcut.js', 'leetcode.js', 'wikipedia.js', 'hackernews.js', 'reddit.js', 'npm.js', 'yelp.js', 'tripadvisor.js', 'zillow.js', 'redfin.js', 'bsky.js', 'meticulous.js', 'stripe.js', 'coinbase.js', 'x.js', 'instagram.js', 'facebook.js', 'stackoverflow.js', 'cloudflare.js', 'terraform.js', 'twilio.js', 'tumblr.js', 'priceline.js', 'airbnb.js', 'airtable.js', 'aws.js', 'gcloud.js', 'expedia.js', 'booking.js', 'stubhub.js', 'kayak.js', 'mongodb.js', 'cockroachdb.js', 'clickhouse.js', 'temporal.js', 'snowflake.js', 'msword.js', 'excel.js', 'pinterest.js', 'starbucks.js', 'medium.js', 'dominos.js', 'amplitude.js', 'newrelic.js', 'grafana.js', 'datadog.js', 'posthog.js', 'whatsapp.js', 'telegram.js', 'chipotle.js', 'pandaexpress.js', 'grubhub.js', 'costco.js', 'instacart.js', 'doordash.js', 'linear.js', 'target.js', 'homedepot.js', 'hack2hire.js', 'chatgpt.js', 'claude.js', 'ganalytics.js', 'discord.js', 'figma.js', 'gdocs.js', 'powerpoint.js', 'outlook.js', 'webflow.js', 'ynab.js', 'dockerhub.js', 'notebooklm.js', 'sentry.js', 'zendesk.js', 'eventbrite.js', 'shopify.js', 'gcal.js', 'craigslist.js', 'spotify.js', 'twitch.js', 'steam.js'].forEach(function (name) {
    const src = path.join(HANDLERS_DIR, name);
    const ext = path.join(EXT_HANDLERS_DIR, name);
    check(fs.existsSync(ext), 'extension/catalog/handlers/' + name + ' exists for unpacked dev loads');
    if (fs.existsSync(src) && fs.existsSync(ext)) {
      check(readSource(src) === readSource(ext),
        'extension/catalog/handlers/' + name + ' matches catalog/handlers/' + name);
    }
  });

  ['ubereats.js'].forEach(function (name) {
    const src = path.join(HANDLERS_DIR, name);
    const ext = path.join(EXT_HANDLERS_DIR, name);
    check(fs.existsSync(ext), 'extension/catalog/handlers/' + name + ' exists for unpacked dev loads');
    if (fs.existsSync(src) && fs.existsSync(ext)) {
      check(readSource(src) === readSource(ext),
        'extension/catalog/handlers/' + name + ' matches catalog/handlers/' + name);
    }
  });

  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL (capability-head-handlers):', err && err.stack ? err.stack : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
