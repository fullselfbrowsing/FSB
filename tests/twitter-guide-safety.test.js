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
  const context = { URL };
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

test('autopilot forwards valid bounded guide workflows and warnings', () => {
  const agentLoop = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');
  const start = agentLoop.indexOf("} else if (call.name === 'get_site_guide') {");
  const end = agentLoop.indexOf("} else if (call.name === 'complete_task') {", start);
  const branch = agentLoop.slice(start, end);
  const index = fs.readFileSync(path.join(__dirname, '../extension/site-guides/index.js'), 'utf8');
  const context = { URL };
  vm.runInNewContext(`${index}\n${source}\nthis.call = function(call) {
    var result; if (false) { ${branch} } return result;
  };`, context);
  for (const domain of ['x.com', 'https://x.com']) {
    const result = context.call({ name: 'get_site_guide', args: { domain } });
    const payload = JSON.parse(result.result.guidance);
    assert.equal(result.result.site, 'Twitter/X');
    assert.deepEqual(payload.warnings, Array.from(guide.warnings).slice(0, 6));
    assert.deepEqual(payload.workflows.replyToPost, Array.from(guide.workflows.replyToPost));
    assert.ok(result.result.guidance.length <= 5000);
  }
});

test('MCP guide lookup accepts bare X hosts and rejects lookalikes', async () => {
  const index = fs.readFileSync(path.join(__dirname, '../extension/site-guides/index.js'), 'utf8');
  const dispatcher = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-tool-dispatcher.js'), 'utf8');
  const start = dispatcher.indexOf('async function handleGetSiteGuidesRoute(');
  const end = dispatcher.indexOf('\nasync function handleGetDiagnosticsMessageRoute', start);
  const context = { URL };
  vm.runInNewContext(`${index}\n${source}\n${dispatcher.slice(start, end)}\nthis.call = handleGetSiteGuidesRoute;`, context);
  for (const url of ['x.com', 'twitter.com', 'www.x.com', 'mobile.twitter.com', 'https://x.com/user']) {
    assert.equal((await context.call({ payload: { domain: url, url } })).guide.site, 'Twitter/X', url);
  }
  for (const url of ['x.com.evil.test', 'notx.com', 'evil.test/x.com', 'https://example.org/?next=https://x.com']) {
    assert.equal((await context.call({ payload: { domain: url, url } })).guide, null, url);
  }
});

test('large guides retain warnings and guidance without cutting JSON or selectors', () => {
  const index = fs.readFileSync(path.join(__dirname, '../extension/site-guides/index.js'), 'utf8');
  const linkedin = fs.readFileSync(path.join(__dirname, '../extension/site-guides/social/linkedin.js'), 'utf8');
  const context = { URL };
  vm.runInNewContext(`${index}\n${linkedin}\nthis.lookup = getGuideForUrl; this.render = formatSiteGuideForAgent;`, context);
  const original = context.lookup('linkedin.com');
  const rendered = context.render(original);
  const payload = JSON.parse(rendered);
  assert.ok(rendered.length <= 5000);
  assert.deepEqual(payload.warnings, Array.from(original.warnings).slice(0, 6));
  assert.equal(payload.guidance, original.guidance.slice(0, 1600));
  assert.equal(payload.truncated, true);
  assert.ok(Object.keys(payload.selectors).length > 0);
  assert.ok(Object.keys(payload.selectors).length < Object.keys(original.selectors).length);
  for (const [key, value] of Object.entries(payload.selectors)) assert.equal(value, original.selectors[key]);
});

test('guide escaping stays valid at the character boundary', () => {
  const index = fs.readFileSync(path.join(__dirname, '../extension/site-guides/index.js'), 'utf8');
  const context = { URL };
  vm.runInNewContext(`${index}\nthis.render = formatSiteGuideForAgent;`, context);
  const rendered = context.render({ warnings: ['Check account'], guidance: '"\\\n'.repeat(2000),
    selectors: { large: '"'.repeat(3000), small: '#button' } });
  assert.ok(rendered.length <= 5000);
  const payload = JSON.parse(rendered);
  assert.deepEqual(payload.warnings, ['Check account']);
  assert.equal(payload.selectors.large, undefined);
  assert.equal(payload.selectors.small, '#button');
});

test('every bundled guide stays bounded while retaining its first six warnings and relevant workflows', () => {
  const directory = path.join(__dirname, '../extension/site-guides');
  const context = { URL };
  vm.runInNewContext(`${fs.readFileSync(path.join(directory, 'index.js'), 'utf8')}
    this.guides = SITE_GUIDES_REGISTRY; this.render = formatSiteGuideForAgent;`, context);
  const load = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) load(file);
      else if (entry.name.endsWith('.js') && entry.name !== 'index.js') vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    }
  };
  load(directory);
  assert.ok(context.guides.length > 100);
  for (const guide of context.guides) {
    const rendered = context.render(guide);
    const payload = JSON.parse(rendered);
    assert.ok(rendered.length <= 5000, guide.site);
    assert.deepEqual(payload.warnings, Array.from(guide.warnings || []).slice(0, 6), guide.site);
    for (const name of ['createPost', 'replyToPost']) {
      if (guide.workflows?.[name]) assert.deepEqual(payload.workflows[name], JSON.parse(JSON.stringify(guide.workflows[name])), guide.site);
    }
  }
});
