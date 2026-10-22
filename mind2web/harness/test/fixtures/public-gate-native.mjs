// A stdio-only protocol double. It never connects to Chrome or an inference API.
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { PUBLIC_ALLOWED_TOOLS } from '../../browser-manual-profile.mjs';
import { PUBLIC_CLICK_SCRIPT, PUBLIC_STATE_SCRIPT, REF_CASES } from '../../public-live-gate.mjs';
import { encodeSolidPng } from '../../png.mjs';

const tabs = new Map(); let nextTab = process.pid * 100, captures = 0;
const text = (row, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify(row) }] });
const fail = (code, error) => text({ success: false, code, error }, true);
const state = marker => ({ marker, clicks: 0, typed: '', enters: 0, selected: 'red', checked: false,
  hovered: 0, hover_synthetic: 0, hover_trusted: 0, canvas: 0, churn: false });
function open(url) {
  const id = ++nextTab, marker = new URL(url).searchParams.get('marker');
  tabs.set(id, { id, url, state: state(marker), target: null }); return id;
}
function request(method, params = {}) {
  if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'isolated-test-double', version: '1' } };
  if (method === 'tools/list') return { tools: PUBLIC_ALLOWED_TOOLS.map(name => ({ name, description: 'Isolated protocol fixture', inputSchema: { type: 'object', properties: {}, required: [] } })) };
  if (method !== 'tools/call') return {};
  const { name, arguments: args = {} } = params;
  if (name === 'list_tabs') return text({ success: true, tabs: [...tabs.values()].map(({ id }) => ({ id })), totalTabs: tabs.size });
  if (name === 'open_tab') { const id = open(args.url); return text({ success: true, tabId: id, url: args.url }); }
  if (name === 'get_site_guide') return text({ success: true, guide: 'Synthetic site guide' });
  const id = args.tab_id ?? args.tabId, tab = tabs.get(id);
  if (!tab) return fail('TAB_NOT_OWNED', 'Detected: Tab ownership violation');
  if (name === 'switch_tab') return text({ success: true, tabId: id });
  if (name === 'close_tab') { tabs.delete(id); return text({ success: true, closed: true, tabId: id }); }
  if (name === 'navigate') { tab.url = args.url; tab.state = state(new URL(args.url).searchParams.get('marker')); return text({ success: true }); }
  if (name === 'get_page_snapshot') return text({ success: true, snapshot: REF_CASES.map((spec, index) => `\`e${index + 1}: button "${spec.label}"\``).join('\n') });
  if (name === 'get_text' && args.selector === '#gate-state') return text({ success: true, text: JSON.stringify(tab.state) });
  if (name === 'get_text' && args.selector === '#after-svg') return text({ success: true, text: `AFTER_SVG ${tab.state.marker}` });
  if (/^e\d+$/.test(args.selector ?? '')) return fail('ELEMENT_NOT_FOUND', 'Element not found');
  if (name === 'execute_js') {
    if (args.code.includes('visualViewport')) return text({ success: true, result: JSON.stringify({ url: tab.url, x: 0, y: 0, width: 120, height: 100, dpr: 1 }) });
    if (args.code === PUBLIC_CLICK_SCRIPT) tab.state.clicks++;
    else if (args.code === PUBLIC_STATE_SCRIPT) Object.assign(tab.state, { clicks: tab.state.clicks + 1, typed: 'public gate', enters: tab.state.enters + 1,
      selected: 'blue', checked: true, hovered: tab.state.hovered + 1, hover_synthetic: tab.state.hover_synthetic + 1 });
    else if (args.code.includes('getBoundingClientRect')) {
      tab.target = args.code.includes('gate-canvas') ? 'canvas' : 'popup';
      return text({ success: true, result: JSON.stringify({ x: 30, y: 40 }) });
    } else return fail('UNEXPECTED_FIXTURE_SCRIPT', 'Unknown isolated fixture script');
    return text({ success: true, result: 'true' });
  }
  if (name === 'click_at') {
    if (tab.target === 'canvas') tab.state.canvas++;
    else if (tab.target === 'popup') { const url = new URL(tab.url); url.searchParams.set('child', '1'); url.searchParams.set('marker', `${tab.state.marker}-popup`); open(url.href); }
    else return fail('UNGROUNDED_TEST_INPUT', 'No corresponding geometry request');
    return text({ success: true });
  }
  if (name === 'capture_screenshot') {
    if (process.argv.includes('--capture-failure')) return fail('SCREENSHOT_CAPTURE_FAILED', 'Injected local native capture failure');
    const bytes = encodeSolidPng(120, 100, [id % 200, 60, ++captures % 200]);
    return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `test-${id}-${captures}`, source_url: tab.url,
      timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: 120, height: 100 }, output_width: 120, output_height: 100,
      effective_emulation: { device_mode: 'current', device_scale_factor: 1 }, sha256: createHash('sha256').update(bytes).digest('hex'), byte_length: bytes.length }) },
    { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
  }
  return fail('UNEXPECTED_FIXTURE_TOOL', 'Unknown isolated fixture tool');
}
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line); if (message.id === undefined) continue;
  try { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: request(message.method, message.params) }) + '\n'); }
  catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Isolated fixture failed' } }) + '\n'); }
}
