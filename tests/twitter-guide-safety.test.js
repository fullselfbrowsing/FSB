'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/site-guides/social/twitter.js'), 'utf8');
let guide;
vm.runInNewContext(source, { registerSiteGuide(value) { guide = value; } });

test('X guide only matches real X and Twitter hosts', () => {
  for (const url of ['https://x.com/user', 'https://www.x.com/user', 'https://mobile.twitter.com/user']) {
    assert.equal(guide.patterns.some(pattern => pattern.test(url)), true, url);
  }
  for (const url of ['https://x.com.evil.test', 'https://notx.com', 'https://evil.test/x.com',
    'https://twitter.com.attacker.org', 'https://example.org/?next=https://x.com']) {
    assert.equal(guide.patterns.some(pattern => pattern.test(url)), false, url);
  }
});

test('task keyword fallback cannot apply the X guide to a lookalike host', () => {
  const index = fs.readFileSync(path.join(__dirname, '../extension/site-guides/index.js'), 'utf8');
  const context = {};
  vm.runInNewContext(`${index}\n${source}\nthis.lookup = getGuideForTask;`, context);
  assert.equal(context.lookup('tweet post reply', 'https://x.com.evil.test/thread'), null);
  assert.equal(context.lookup('tweet post reply', 'https://x.com/thread').site, 'Twitter/X');
});

test('compose guidance names both button contexts and account/reply checks', () => {
  assert.equal(guide.selectors.tweetButton, '[data-testid="tweetButtonInline"]');
  assert.equal(guide.selectors.modalTweetButton, '[data-testid="tweetButton"]');
  assert.match(guide.workflows.createPost.join(' '), /AccountSwitcher/);
  assert.match(guide.workflows.replyToPost.join(' '), /permalink/);
  assert.match(guide.workflows.replyToPost.join(' '), /only once/);
});

// On the home timeline, tweetButtonInline publishes a new post. A reply dialog
// sits over that composer, so its controls must be scoped to the dialog.
test('reply guidance separates the post page from the reply dialog', () => {
  assert.equal(guide.selectors.replyButton, '[data-testid="tweetButtonInline"]');
  assert.equal(guide.selectors.replyDialogInput, '[role="dialog"] [data-testid="tweetTextarea_0"]');
  assert.equal(guide.selectors.replyDialogButton, '[role="dialog"] [data-testid="tweetButton"]');
  const reply = guide.workflows.replyToPost.join(' ');
  assert.match(reply, /tweetButtonInline/);
  assert.match(reply, /\[role="dialog"\] \[data-testid="tweetButton"\]/);
  assert.match(guide.guidance, /\[role="dialog"\] \[data-testid="tweetButton"\]/);
});

test('autopilot forwards bounded guide workflows and warnings', () => {
  const agentLoop = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');
  const start = agentLoop.indexOf("} else if (call.name === 'get_site_guide') {");
  const end = agentLoop.indexOf("} else if (call.name === 'complete_task') {", start);
  const branch = agentLoop.slice(start, end);
  assert.match(branch, /replyToPost: guide\.workflows/);
  assert.match(branch, /guide\.warnings\.slice\(0, 6\)/);
  assert.match(branch, /\.slice\(0, 5000\)/);
});
