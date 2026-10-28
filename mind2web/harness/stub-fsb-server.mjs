import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { encodeSolidPng } from './png.mjs';

const allowlist = JSON.parse(readFileSync(new URL('../config/tool-allowlist.json', import.meta.url)));
let url = 'https://store.example/';
let captures = 0;
const shot = process.env.OM2W_STUB_SCREENSHOT ? readFileSync(process.env.OM2W_STUB_SCREENSHOT) : encodeSolidPng(320, 200, [235, 240, 245]);
const names = [...Object.keys(allowlist.actions), ...allowlist.reads, 'open_tab', 'close_tab', 'capture_screenshot', 'execute_js', 'run_task'];
function text(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }] }; }
async function handle(method, params) {
  if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'synthetic-fsb', version: '1' } };
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: names.map(name => ({ name, description: `Synthetic ${name}`, inputSchema: {
    type: 'object', properties: Object.fromEntries((allowlist.params[name]?.properties ?? []).map(p => [p, { type: ['active', 'full', 'clear_first', 'is_final'].includes(p) ? 'boolean' : ['tab_id', 'amount'].includes(p) ? 'number' : 'string' }])),
    required: allowlist.params[name]?.required ?? [],
  } })) };
  if (method !== 'tools/call') throw new Error('Unsupported method');
  const { name, arguments: args = {} } = params;
  if (process.env.OM2W_STUB_EXIT_TOOL === name) process.exit(3);
  if (process.env.OM2W_STUB_FAIL_TOOL === name) return { ...text({ success: false, error: 'Synthetic tool failure' }), isError: true };
  if (name === 'capture_screenshot' && captures++ < Number(process.env.OM2W_STUB_TRANSIENT_CAPTURES ?? 0)) return { ...text({ success: false, error: 'Frame with ID 0 was removed.' }), isError: true };
  if (name === 'capture_screenshot') return { content: [
    { type: 'text', text: JSON.stringify({ source_url: url, width: 800, height: 480 }) },
    { type: 'image', data: shot.toString('base64'), mimeType: 'image/png' },
  ] };
  if (name === 'open_tab' || name === 'navigate') url = args.url;
  if (allowlist.reads.includes(name)) return text({ success: true, url, text: 'Widget Store. Blue Widget. Price: $19.99. In stock. Buy button.', elements: [{ selector: '#blue-widget', text: 'Blue Widget — $19.99' }] });
  if (!names.includes(name)) return { ...text({ error: 'Unknown tool' }), isError: true };
  return text({ success: true, tabId: 17, url });
}
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  let msg;
  try { msg = JSON.parse(line); } catch { continue; }
  if (msg.id === undefined) continue;
  try { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: await handle(msg.method, msg.params ?? {}) })}\n`); }
  catch (err) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } })}\n`); }
}
