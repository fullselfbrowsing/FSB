import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PROFILE_ID = 'browser-manual-v2';
export const PUBLIC_PROFILE_ID = 'browser-manual-public-v1';

const verbs = {
  check_box: 'CHECK_BOX', clear_input: 'CLEAR', click: 'CLICK', click_and_hold: 'HOLD', click_at: 'CLICK_AT',
  close_tab: 'CLOSE_TAB', double_click: 'DOUBLE_CLICK', double_click_at: 'DOUBLE_CLICK_AT', drag: 'DRAG',
  drag_drop: 'DRAG_DROP', drag_variable_speed: 'DRAG_VARIABLE_SPEED', execute_js: 'EXECUTE_JS', fill_sheet: 'FILL_SHEET',
  focus: 'FOCUS', go_back: 'GO_BACK', go_forward: 'GO_FORWARD', hover: 'HOVER', insert_text: 'INSERT_TEXT',
  navigate: 'NAVIGATE', open_tab: 'OPEN_TAB', press_enter: 'PRESS_KEY', press_key: 'PRESS_KEY', refresh: 'REFRESH',
  right_click: 'RIGHT_CLICK', scroll: 'SCROLL', scroll_at: 'SCROLL_AT', scroll_to_bottom: 'SCROLL',
  scroll_to_element: 'SCROLL', scroll_to_top: 'SCROLL', search: 'SEARCH', select_option: 'SELECT',
  select_text_range: 'SELECT_TEXT_RANGE', set_attribute: 'SET_ATTRIBUTE', switch_tab: 'SWITCH_TAB', type_text: 'TYPE',
  read_sheet: 'READ_SHEET',
};

export const PROFILE = Object.freeze({
  version: 2, id: PROFILE_ID,
  actions: Object.fromEntries(Object.entries(verbs).map(([name, verb]) => [name, { verb }])),
  reads: ['get_attribute', 'get_dom_snapshot', 'get_page_snapshot', 'get_site_guide', 'get_text', 'list_tabs',
    'read_page', 'wait_for_element', 'wait_for_stable', 'capture_screenshot'],
  bootstrap: { open_tab: true, capture_screenshot: true },
  exclusions: ['upload_file', 'drop_file', 'search_memory', 'vault', 'capability', 'autopilot', 'trigger', 'lifecycle', 'global resources'],
  javascript_policy: 'Synchronous rendered DOM/UI work only; no direct network/API calls, credentials, fabricated uploads or deferred actions. This is a usage policy, not a sandbox.',
});

export const ALLOWED_TOOLS = Object.freeze([...Object.keys(PROFILE.actions), ...PROFILE.reads]);
export const PUBLIC_PROFILE = Object.freeze({
  ...PROFILE, version: 1, id: PUBLIC_PROFILE_ID, public_release: true,
  actions: { ...PROFILE.actions, read_page: { verb: 'READ_PAGE' } },
  reads: PROFILE.reads.filter(name => !['read_page', 'wait_for_element', 'wait_for_stable'].includes(name)),
  potential_ui_reads: ['read_page'],
  public_behavior: { search_google_fallback: 'Public default is preserved; search may use the browser Google fallback',
    read_page: 'Public read_page can dismiss consent UI; every attempt consumes the UI budget and runs under the foreground lease',
    missing_tools: ['wait_for_element', 'wait_for_stable'] },
});
export const PUBLIC_ALLOWED_TOOLS = Object.freeze([...Object.keys(PUBLIC_PROFILE.actions), ...PUBLIC_PROFILE.reads]);
export const profileFor = publicRelease => publicRelease ? PUBLIC_PROFILE : PROFILE;
export const toolsForProfile = profile => [...Object.keys(profile.actions), ...profile.reads];

export function publicCatalogReceipt(catalog) {
  const tools = Array.isArray(catalog) ? catalog : catalog?.tools;
  if (!Array.isArray(tools) || tools.some(tool => !tool || typeof tool.name !== 'string')
      || new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error('Public tools/list must be a complete, unique catalog');
  for (const name of PUBLIC_ALLOWED_TOOLS) if (!tools.some(tool => tool.name === name)) throw new Error(`Public FSB is missing frozen profile tool ${name}`);
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const selected = tools.filter(tool => PUBLIC_ALLOWED_TOOLS.includes(tool.name));
  return { profile: PUBLIC_PROFILE_ID, registered_tool_count: tools.length, tool_count: selected.length,
    tools: selected.map(tool => tool.name), source_catalog_sha256: hash(tools),
    actor_catalog_sha256: hash(selected.map(tool => actorToolSchema(tool, PUBLIC_PROFILE))),
    missing_legacy_waits: ['wait_for_element', 'wait_for_stable'].filter(name => !tools.some(tool => tool.name === name)) };
}

export async function loadPublicCatalog({ publicPins, publicCatalog } = {}) {
  const descriptor = publicPins?.catalog;
  if (descriptor) {
    if (typeof descriptor.path !== 'string' || !descriptor.path || !Number.isSafeInteger(descriptor.bytes)
        || descriptor.bytes <= 0 || !/^[a-f0-9]{64}$/.test(descriptor.sha256 ?? ''))
      throw new Error('Public catalog requires a path, byte length and SHA256 descriptor');
    const bytes = await readFile(path.resolve(descriptor.path));
    if (bytes.length !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256)
      throw new Error('Pinned public tools/list catalog bytes changed');
    const frozen = JSON.parse(bytes);
    const expected = publicCatalogReceipt(frozen);
    if (publicCatalog && publicCatalogReceipt(publicCatalog).source_catalog_sha256 !== expected.source_catalog_sha256)
      throw new Error('Explicit public catalog differs from pinned tools/list');
    return frozen;
  }
  if (!publicCatalog) throw new Error('Public release requires a pinned tools/list catalog');
  publicCatalogReceipt(publicCatalog);
  return publicCatalog;
}

export function actorPrompt(text, publicRelease = false, family = 'claude') {
  if (family === 'claude') {
    // Claude Code transcodes large screenshots to at most 2000px before the model sees them.
    text = text.replace('use only the latest image for that target tab.',
      "use only the latest image for that target tab. Images may be downscaled before you see them; map image positions to CSS viewport coordinates with the observation's css_rect width and height.");
  }
  if (!publicRelease) return text;
  // The public release rejects some advertised targeting forms, so the prompt
  // defers to the tool descriptions instead of prescribing one form.
  return text.replace('Use snapshot eN refs directly in selector fields. If a ref is stale, get a fresh snapshot.',
    'Target elements with any selector, text, element ref or coordinate form the tool descriptions accept; if one form fails, switch to another rather than repeating it.')
    .replace("The search tool uses the current site's UI and will not fall back to Google.",
    "The unmodified public search tool may fall back to Google in the browser; its public behavior is preserved.")
    .replace('Use wait_for_element/wait_for_stable for waits.',
      'The public release does not register wait_for_element or wait_for_stable; use the available page observation tools to inspect readiness.')
    + '\nPublic-release profile:44 discovered browser tools. read_page can click consent UI in this public product, so every read_page attempt, including failures, counts toward the120 UI-call budget and runs under the browser lease. Product errors remain part of the observation.\n';
}
export const RESEARCH_TOOLS = new Set(['list_tabs', 'get_site_guide']);
export const COORDINATE_TOOLS = new Set(['click_at', 'double_click_at', 'scroll_at', 'drag', 'click_and_hold', 'drag_variable_speed']);
export const SHEET_TOOLS = new Set(['fill_sheet', 'read_sheet']);

export function classifyTool(name, profile = PROFILE) {
  if (!toolsForProfile(profile).includes(name)) throw Object.assign(new Error(`Tool ${name} is disabled in ${profile.id}`), { code: 'TOOL_DISABLED' });
  if (name === 'capture_screenshot') return 'capture';
  if (RESEARCH_TOOLS.has(name)) return 'research_read';
  if (profile.actions[name]) return ['open_tab', 'close_tab', 'switch_tab'].includes(name) ? 'tab_control' : 'mutation';
  return 'page_read';
}

export function checkJavascriptPolicy(code) {
  if (typeof code !== 'string' || !code.trim()) return 'JavaScript code is required';
  // This catches common accidental shortcuts; it is deliberately not a security sandbox.
  if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|setTimeout|setInterval|requestAnimationFrame|queueMicrotask|Promise|async|await|File|FileReader|Blob)\b/.test(code))
    return 'Use synchronous DOM/UI operations and the wait tools; direct network, uploads and deferred scripts are excluded';
  if (/document\s*\.\s*cookie|\b(localStorage|sessionStorage|indexedDB)\b|\b(chrome|browser)\s*\.|\beval\s*\(|\bnew\s+Function\b/.test(code))
    return 'Credential/session extraction and browser/internal API access are excluded';
  return null;
}

export function actorToolSchema(tool, profile = PROFILE) {
  const copy = structuredClone(tool);
  delete copy.inputSchema.properties?.client;
  copy.inputSchema.required = (copy.inputSchema.required ?? []).filter(key => key !== 'client');
  if (COORDINATE_TOOLS.has(tool.name)) {
    copy.inputSchema.properties.frame_id = { type: 'string', description: 'frame_id of the latest emitted viewport image for the target owned tab. Coordinates are CSS viewport pixels.' };
    copy.inputSchema.required.push('frame_id');
  }
  if (tool.name === 'capture_screenshot') {
    copy.description += ' This benchmark captures the current viewport without device emulation. The returned frame_id grounds coordinate actions.';
    for (const key of Object.keys(copy.inputSchema.properties)) if (!['tab_id', 'wait_ms'].includes(key)) delete copy.inputSchema.properties[key];
  }
  if (tool.name === 'search') copy.description += profile.public_release
    ? ' The public browser Google fallback is preserved.' : ' This profile disables automatic Google fallback.';
  if (tool.name === 'read_page' && profile.public_release) copy.description += ' Public read_page may click consent UI; each attempt consumes the mutating/UI budget.';
  if (tool.name === 'execute_js') copy.description += ' ' + profile.javascript_policy;
  return copy;
}
