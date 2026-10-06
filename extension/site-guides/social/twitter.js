/**
 * Site Guide: Twitter/X
 * Per-site guide for Twitter (X) social media platform.
 *
 * Includes infinite scroll post extraction workflow for counting and extracting
 * the Nth post from a Twitter/X feed. Twitter uses virtualized DOM rendering
 * where post elements are recycled during scroll -- posts must be counted
 * incrementally across multiple DOM snapshots, not via a single snapshot.
 *
 * Created for Phase 67, SCROLL-01 edge case validation.
 * Target: extract text of the 150th post via scroll-and-count strategy.
 */

registerSiteGuide({
  site: 'Twitter/X',
  category: 'Social Media',
  patterns: [
    /^https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)(?::\d+)?(?:[/?#]|$)/i
  ],
  guidance: `AUTOPILOT STRATEGY HINTS (from v0.9.7 diagnostic SCROLL-01):
- [scroll] Track tweets by permalink href Set -- virtualized DOM recycles ~20-40 elements
- [scroll] Scroll 800px with 500-1000ms wait; expect ~10-15 new tweets per cycle
- [scroll] Break on 3 consecutive empty scrolls -- feed ended or auth wall appeared
- [scroll] Extract tweet text DURING scroll, not after -- recycled elements are gone
- [scroll] Filter ads via [data-testid="placementTracking"] before counting

X/TWITTER-SPECIFIC INTELLIGENCE:

COMMON PATTERNS:
  # compose and post
  click e5    # compose area
  type e5 "post content here"
  click e10   # Post button
  # search for a topic
  click e15   # Explore tab
  type e18 "trending topic"
  enter
  scroll down

SEARCH:
- Search query box: [aria-label="Search query"] or [role="combobox"] (on Explore page)
- Search page input: [data-testid="SearchBox_Search_Input"]
- Explore tab: [data-testid="AppTabBar_Explore_Link"] or [aria-label="Search and explore"]

COMPOSING POSTS:
- Post text area: [data-testid="tweetTextarea_0"]
- Post/Tweet button (inline): [data-testid="tweetButtonInline"]
- Post/Tweet button (modal composer): [data-testid="tweetButton"]
- New post button (sidebar): [data-testid="SideNav_NewTweet_Button"] or [aria-label="Post"]
- Before posting, inspect the account switcher and confirm the intended account is active.
- Before replying, open the intended post and verify its author and permalink in the reply context.
- Reply on the post's own page: type in [data-testid="tweetTextarea_0"], then click its Reply button [data-testid="tweetButtonInline"].
- Reply dialog (opened from a timeline reply icon): scope both to the dialog -- [role="dialog"] [data-testid="tweetTextarea_0"] and [role="dialog"] [data-testid="tweetButton"]. The timeline composer behind it uses the same text area test id, and its inline button publishes a new post, not a reply.
- Schedule post: [data-testid="scheduleOption"] or [aria-label="Schedule post"]
- Grok AI enhancement: [data-testid="grokImgGen"] or [aria-label="Enhance your post with Grok"]
- Add GIF: [data-testid="gifSearchButton"]
- Add poll: [data-testid="createPollButton"]

NAVIGATION TABS:
- Home: [data-testid="AppTabBar_Home_Link"]
- Explore: [data-testid="AppTabBar_Explore_Link"]
- Notifications: [data-testid="AppTabBar_Notifications_Link"]
- Messages: [data-testid="AppTabBar_DirectMessage_Link"]
- Profile: [data-testid="AppTabBar_Profile_Link"]
- More menu: [data-testid="AppTabBar_More_Menu"]

ACCOUNT & SETTINGS:
- Account switcher: [data-testid="SideNav_AccountSwitcher_Button"]
- Grok nav: [aria-label="Grok"]
- Bookmarks: [aria-label="Bookmarks"]
- Premium signup: [data-testid="premium-signup-tab"]

UI FRAMEWORK NOTES:
- CSS class names are hashed/obfuscated (css-175oi2r, r-sdzlij) -- NEVER use them as selectors
- ID-based selectors are dynamically generated (id__<random>) -- do NOT rely on them
- Prefer data-testid selectors over aria-label for consistency
- Navigation uses AppTabBar data-testid pattern -- more reliable than aria-label which can include notification counts

INFINITE SCROLL & POST EXTRACTION:

VIRTUALIZED DOM BEHAVIOR:
- X/Twitter uses virtualized rendering (DOM recycling) for the feed timeline
- As you scroll down, older tweets are REMOVED from the DOM and new tweets are ADDED
- At any given time, only ~20-40 tweets exist in the DOM regardless of how far you scrolled
- You CANNOT get all 150 posts in a single DOM snapshot
- Strategy: scroll repeatedly, count NEW posts each snapshot, track running total across snapshots

POST ELEMENT SELECTORS:
- Individual tweet/post: [data-testid="tweet"] (each post is wrapped in this)
- Tweet text content: [data-testid="tweetText"] (the text body of the post)
- Tweet article: article[data-testid="tweet"] (full tweet article element)
- Tweet link/permalink: a[href*="/status/"] inside [data-testid="tweet"] (link to individual post)
- User display name: [data-testid="User-Name"] inside [data-testid="tweet"]
- Timeline container: [data-testid="primaryColumn"] section (main feed area)
- Cell inner div: [data-testid="cellInnerDiv"] (wrapper around each timeline item including tweets, ads, suggestions)

COUNTING POSTS DURING INFINITE SCROLL:
- Each [data-testid="cellInnerDiv"] in the timeline may be a tweet, ad, or suggestion module
- Only count elements that contain [data-testid="tweet"] as actual posts
- Filter out ads: skip [data-testid="cellInnerDiv"] elements containing "Ad" label or [data-testid="placementTracking"]
- Filter out "Who to follow" and "Subscribe to Premium" suggestion modules
- Use tweet permalink href (contains "/status/") as unique identifier to avoid double-counting when DOM recycles
- Maintain a Set of seen permalink hrefs to track unique posts across scroll cycles

METHOD: SCROLL-AND-COUNT TO Nth POST (target: 150th post):
Steps:
1. Navigate to target X/Twitter profile page (e.g., x.com/{username}) or feed
2. Dismiss any cookie/consent banners or login prompts if present
3. Use get_dom_snapshot to capture initial visible tweets
4. For each [data-testid="tweet"] element, extract:
   - The tweet permalink (a[href*="/status/"]) as unique ID
   - The tweet text from [data-testid="tweetText"]
   - Store in running list: [{permalink, text, position}]
5. Scroll down using scroll(direction="down", amount=800) to load more posts
6. Wait for new content: use waitForDOMStable or short delay (500ms-1000ms) for new tweets to render
7. Use get_dom_snapshot again, extract NEW tweets (permalink not in seen set)
8. Add new tweets to running list, increment running count
9. Repeat steps 5-8 until running count >= 150
10. The 150th entry in the list is the target post
11. Extract and return the text content of the 150th post via read_page or getText on that element
12. Verify: the returned text is non-empty and corresponds to a real tweet

FALLBACK FOR PUBLIC PROFILE PAGES:
- If x.com requires auth for the home feed, use a public profile page instead
- Public profiles (e.g., x.com/elonmusk, x.com/NASA) show posts without login
- Profile pages use the same [data-testid="tweet"] selectors as the home feed
- Some profiles may have fewer than 150 posts -- switch to a high-volume account if needed

AUTH DETECTION:
- If page shows login/signup wall, classify as skip-auth outcome
- Login wall indicators: [data-testid="loginButton"], "Log in" text in primary content area, redirect to x.com/i/flow/login
- Some pages show partial content with a login prompt overlay -- try scrolling past it

SCROLL TIMING:
- Allow 500ms-1000ms between scrolls for new content to load
- Twitter lazy-loads tweets as the user scrolls
- If no new tweets appear after 3 consecutive scrolls, the feed may have ended or rate-limited
- Use waitForDOMStable after each scroll to detect when new content has rendered
- Typical rate: ~10-15 new tweets per scroll of 800px`,

  selectors: {
    searchBox: 'input[data-testid="SearchBox_Search_Input"]',
    tweetCompose: '[data-testid="tweetTextarea_0"]',
    tweetButton: '[data-testid="tweetButtonInline"]',
    modalTweetButton: '[data-testid="tweetButton"]',
    replyInput: '[data-testid="tweetTextarea_0"]',
    replyButton: '[data-testid="tweetButtonInline"]',
    replyDialogInput: '[role="dialog"] [data-testid="tweetTextarea_0"]',
    replyDialogButton: '[role="dialog"] [data-testid="tweetButton"]',
    likeButton: '[data-testid="like"]',
    retweetButton: '[data-testid="retweet"]',
    dmButton: '[data-testid="sendDMFromProfile"]',
    feed: '[data-testid="primaryColumn"]',
    homeTab: '[data-testid="AppTabBar_Home_Link"]',
    exploreTab: '[data-testid="AppTabBar_Explore_Link"]',
    notificationsTab: '[data-testid="AppTabBar_Notifications_Link"]',
    messagesTab: '[data-testid="AppTabBar_DirectMessage_Link"]',
    profileTab: '[data-testid="AppTabBar_Profile_Link"]',
    postButton: '[data-testid="SideNav_NewTweet_Button"]',
    accountMenu: '[data-testid="SideNav_AccountSwitcher_Button"]',
    moreMenu: '[data-testid="AppTabBar_More_Menu"]',
    schedulePost: '[data-testid="scheduleOption"]',
    grokButton: '[data-testid="grokImgGen"]',
    gifButton: '[data-testid="gifSearchButton"]',
    pollButton: '[data-testid="createPollButton"]',
    editProfile: '[data-testid="editProfileButton"]',
    tweetItem: '[data-testid="tweet"]',
    trendItem: '[data-testid="trend"]',
    settingsBar: '[data-testid="settingsAppBar"]',
    backButton: '[data-testid="app-bar-back"]',
    closeButton: '[data-testid="app-bar-close"]',
    // Infinite scroll post extraction selectors
    tweetText: '[data-testid="tweetText"]',
    tweetArticle: 'article[data-testid="tweet"]',
    tweetPermalink: '[data-testid="tweet"] a[href*="/status/"]',
    userName: '[data-testid="User-Name"]',
    cellInnerDiv: '[data-testid="cellInnerDiv"]',
    adIndicator: '[data-testid="placementTracking"]',
    loginWall: '[data-testid="loginButton"]',
    timelineSection: '[data-testid="primaryColumn"] section'
  },
  workflows: {
    createPost: [
      'Check [data-testid="SideNav_AccountSwitcher_Button"] and confirm the intended account',
      'Click the compose area or new post button',
      'Wait for editor to load',
      'Type the post content in [data-testid="tweetTextarea_0"]',
      'Use [data-testid="tweetButtonInline"] for inline compose or [data-testid="tweetButton"] for the modal composer',
      'Verify post was created'
    ],
    replyToPost: [
      'Open the intended post and verify its author and /status/ permalink',
      'Confirm the active account in [data-testid="SideNav_AccountSwitcher_Button"]',
      'On the post page, type in [data-testid="tweetTextarea_0"] and click Reply [data-testid="tweetButtonInline"] only once',
      'In a reply dialog, use [role="dialog"] [data-testid="tweetTextarea_0"] and [role="dialog"] [data-testid="tweetButton"] instead -- the timeline composer behind it publishes a new post',
      'Verify the reply appears under the intended post before trying again'
    ],
    sendMessage: [
      'Click Messages tab [data-testid="AppTabBar_DirectMessage_Link"]',
      'Open new message or find existing conversation',
      'Type the recipient name and select from suggestions',
      'Type the message in the message input',
      'Click Send button',
      'Verify message was sent'
    ],
    scrollAndCountPosts: [
      'Navigate to X/Twitter profile page (public, no auth required)',
      'Dismiss cookie/consent banners if present',
      'Get initial DOM snapshot, identify [data-testid="tweet"] elements',
      'Extract permalink (a[href*="/status/"]) and text ([data-testid="tweetText"]) for each tweet',
      'Store in running list with unique permalink Set for deduplication',
      'Scroll down (scroll direction=down amount=800)',
      'Wait for DOM to stabilize (waitForDOMStable or 500ms delay)',
      'Re-snapshot DOM, extract NEW tweets not in seen set',
      'Increment running count, repeat scroll+snapshot until count >= 150',
      'Extract text of 150th post from running list',
      'Verify extracted text is non-empty tweet content'
    ],
    extractNthPost: [
      'Navigate to target profile page',
      'Initialize empty post list and seen-permalinks Set',
      'Loop: snapshot DOM, collect new tweets, scroll, wait, repeat',
      'When N posts collected, return Nth post text',
      'Handle auth walls by switching to public profile fallback'
    ]
  },
  warnings: [
    'Check the active account before posting, replying, liking, or sending a message',
    'Check the author and permalink of the parent post before replying',
    'Twitter/X rate-limits actions -- avoid rapid clicking',
    'X/Twitter now has Grok AI integration for post enhancement via [data-testid="grokImgGen"]',
    'X/Twitter navigation uses AppTabBar data-testid pattern -- more reliable than aria-label which can include notification counts',
    'CSS class names on X/Twitter are hashed/obfuscated (css-175oi2r, r-sdzlij) -- never use them as selectors',
    'ID-based selectors on X/Twitter are dynamically generated (id__<random>) -- do not rely on them',
    'Prefer data-testid selectors over aria-label on X/Twitter for consistency',
    'Account menu on X/Twitter shows username text but use [data-testid="SideNav_AccountSwitcher_Button"] to target it',
    'X/Twitter uses virtualized DOM -- at most ~20-40 tweets exist in DOM at once, scroll incrementally to count',
    'Use tweet permalink hrefs as unique IDs to avoid double-counting recycled DOM elements',
    'Filter out ads ([data-testid="placementTracking"]) and suggestion modules when counting posts',
    'Allow 500ms-1000ms between scrolls for lazy-loaded tweets to render',
    'Public profile pages (x.com/{username}) may not require auth; home feed usually does',
    'If no new tweets load after 3 scrolls, the profile may have fewer posts than target count'
  ],
  toolPreferences: ['click', 'type', 'scroll', 'getText', 'waitForElement', 'hover', 'focus', 'pressEnter', 'navigate', 'get_dom_snapshot', 'read_page', 'waitForDOMStable']
});
