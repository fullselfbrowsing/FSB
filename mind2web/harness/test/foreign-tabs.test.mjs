import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnedTaskSession } from '../owned-task-session.mjs';
import { foreignOwnershipText } from '../manual-recording-proxy.mjs';
import { closeChromeTabs } from '../chrome-tabs.mjs';

const inventory = ids => ({ content: [{ type: 'text', text: JSON.stringify({ success: true, tabs: ids.map(id => ({ id })) }) }] });
const native = 'Detected: Tab ownership\nWhy: Tab 22 is owned by agent_96fe8174-fad0-43ea-8ef3-ae7ca3923891, not the calling agent.\nNext action: Use a tab owned by this agent.';

test('a foreign-owned listed popup is never re-adopted, targeted or closed, but may be read', () => {
  const session = new OwnedTaskSession();
  session.registerOpenedTab(11); session.syncOwnedChildren(inventory([11, 22]));
  assert.deepEqual([...session.tabs.keys()], [11, 22]);
  session.selectTab(22); session.markForeign(22, native);
  assert.equal(session.selectedTabId, 11, 'selection falls back to the primary tab');
  assert.deepEqual(session.syncOwnedChildren(inventory([11, 22])).map(tab => tab.id), [11]);
  assert.throws(() => session.resolveTarget({ tab_id: 22 }), error => error.code === 'PUBLIC_TAB_NOT_CONTROLLABLE' && /agent_96fe8174/.test(error.message));
  assert.throws(() => session.assertCanClose(22), error => error.code === 'PUBLIC_TAB_NOT_CONTROLLABLE');
  assert.equal(session.resolveTarget({ tab_id: 22 }, { allowForeign: true }), 22);
  assert.throws(() => session.assertCanClose(11), error => error.code === 'LAST_WORKING_TAB');
});

test('only the public cross-agent ownership refusal is recognized as foreign', () => {
  assert.equal(foreignOwnershipText({ isError: true, content: [{ type: 'text', text: native }] }), native);
  assert.equal(foreignOwnershipText({ isError: true, content: [{ type: 'text', text: 'Detected: Page navigation\nWhy: Element not found' }] }), null);
  assert.equal(foreignOwnershipText({ isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, code: 'TAB_NOT_OWNED' }) }] }), null);
});

test('Chrome tab closure passes only exact positive integer IDs and reports what it closed', async () => {
  const calls = [];
  const run = async (command, args) => { calls.push({ command, args }); return { code: 0, stdout: '22\n', stderr: '' }; };
  const result = await closeChromeTabs([22, 22, -1, 1.5, 33], { run });
  assert.deepEqual(calls[0].args.slice(2), ['22', '33']);
  assert.equal(calls[0].command, '/usr/bin/osascript');
  assert.deepEqual(result, { ok: true, closed: [22], missing: [33], method: 'osascript_exact_tab_ids' });
  assert.deepEqual(await closeChromeTabs([], { run }), { ok: true, closed: [], missing: [] });
  const failed = await closeChromeTabs([44], { run: async () => ({ code: 1, stdout: '', stderr: 'Not authorized' }) });
  assert.equal(failed.ok, false); assert.deepEqual(failed.missing, [44]); assert.match(failed.error, /Not authorized/);
});
