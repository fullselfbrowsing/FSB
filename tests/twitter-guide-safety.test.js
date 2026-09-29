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

test('compose guidance names both button contexts and account/reply checks', () => {
  assert.equal(guide.selectors.tweetButton, '[data-testid="tweetButtonInline"]');
  assert.equal(guide.selectors.modalTweetButton, '[data-testid="tweetButton"]');
  assert.match(guide.workflows.createPost.join(' '), /AccountSwitcher/);
  assert.match(guide.workflows.replyToPost.join(' '), /permalink/);
  assert.match(guide.workflows.replyToPost.join(' '), /only once/);
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
