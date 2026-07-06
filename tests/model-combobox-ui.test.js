'use strict';

/**
 * UI behavioral tests for FSBModelCombobox — the unified, searchable model
 * picker that replaced the separate search input + native <select>.
 *
 * The combobox renders as a VIEW over the still-present (but visually hidden)
 * <select id="modelName">, which remains the value source of truth that the
 * discovery flow (FSBDiscoveryUI) and the legacy lmstudio/custom flow keep
 * writing into. This suite exercises the real module loaded from
 * extension/ui/options.js against a hand-rolled DOM shim (matching the project
 * convention, cf. tests/model-discovery-ui.test.js) and covers:
 *   - display sync (closed field shows the selected model's label)
 *   - open/close + clean-search-field behaviour
 *   - type-to-filter with orange <mark> highlight on the matched word
 *   - commit semantics (writes select.value + dispatches exactly one 'change';
 *     re-selecting the same value dispatches none)
 *   - keyboard navigation (ArrowDown / Enter / Escape)
 *   - MutationObserver re-sync after discovery repopulates the select
 *   - disabled (loading) and status-only (no models) states
 *
 * Run: node tests/model-combobox-ui.test.js
 */

let passed = 0, failed = 0; const failures = [];
function assert(c, m){ if(c){passed++;console.log('  PASS:',m);} else {failed++;failures.push(m);console.error('  FAIL:',m);} }

// --- Minimal DOM shim -------------------------------------------------------
const OBS = [];
global.MutationObserver = class { constructor(cb){ this.cb = cb; OBS.push(this); } observe(){} disconnect(){} };
function flush(){ OBS.forEach(o => o.cb([], o)); } // simulate the observer firing
if (typeof global.Event === 'undefined') {
  global.Event = class { constructor(type, opts){ this.type = type; Object.assign(this, opts||{}); } };
}

function makeEl(tag){
  const _s = new Set(); // class set — kept in sync with .className (like real DOM)
  const el = {
    tagName: String(tag||'div').toUpperCase(),
    id: '', textContent: '', value: '', disabled: false, hidden: false,
    children: [], parentNode: null, dataset: {}, attributes: {}, _listeners: {},
    style: {},
    classList: {
      add(...n){ n.forEach(x=>_s.add(x)); },
      remove(...n){ n.forEach(x=>_s.delete(x)); },
      contains(x){ return _s.has(x); },
      toggle(x,on){ const want = on===undefined? !_s.has(x): !!on; if(want)_s.add(x); else _s.delete(x); }
    },
    setAttribute(k,v){ this.attributes[k]=String(v); },
    removeAttribute(k){ delete this.attributes[k]; },
    getAttribute(k){ return this.attributes[k]; },
    appendChild(c){ c.parentNode = el; el.children.push(c); if(el.tagName==='SELECT' && c.tagName==='OPTION') el.options.push(c); return c; },
    addEventListener(t,fn){ (this._listeners[t]=this._listeners[t]||[]).push(fn); },
    dispatchEvent(evt){ const t = evt && evt.type; (this._listeners[t]||[]).slice().forEach(fn=>fn(evt)); return true; },
    focus(){},
    closest(sel){ const cls = sel.replace(/^\./,''); let cur = el; while(cur){ if(cur.classList && cur.classList.contains(cls)) return cur; cur = cur.parentNode; } return null; },
    contains(node){ if(node===el) return true; for(const c of el.children){ if(c===node || (c.contains && c.contains(node))) return true; } return false; }
  };
  Object.defineProperty(el, 'className', {
    get(){ return [..._s].join(' '); },
    set(v){ _s.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x=>_s.add(x)); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get(){ return el._html || ''; },
    set(v){ el._html = v; if(v===''){ el.children=[]; if(el.tagName==='SELECT') el.options=[]; } }
  });
  if (el.tagName === 'SELECT') {
    el.options = [];
    let _v = '';
    Object.defineProperty(el, 'value', { get(){ return _v; }, set(v){ _v = String(v); } });
    Object.defineProperty(el, 'selectedIndex', { get(){ return el.options.findIndex(o=>o.value===_v); } });
  }
  return el;
}

const reg = {};
function mk(id, tag){ const e = makeEl(tag); e.id = id; reg[id] = e; return e; }

// Combobox markup (ids match control_panel.html)
const root    = mk('modelCombobox','div');
const input   = mk('modelSearch','input');
mk('modelComboboxToggle','button');
const listbox = mk('modelListbox','ul'); listbox.hidden = true;
const select  = mk('modelName','select');
// Other ids options.js touches at module/helper scope (kept minimal).
mk('modelDiscoveryStatus','div');
mk('refreshModelsBtn','button');
mk('modelProvider','select');
mk('apiKey','input'); mk('geminiApiKey','input'); mk('openaiApiKey','input');
mk('anthropicApiKey','input'); mk('openrouterApiKey','input'); mk('modelDescription','div');

global.document = { getElementById: id=>reg[id]||null, createElement: t=>makeEl(t), addEventListener: ()=>{} };
global.chrome = { storage:{ local:{ get:(_k,cb)=>cb({}), set:(_o,cb)=>cb&&cb() } }, runtime:{ sendMessage:()=>{} } };
const { FALLBACK_MODELS } = require('../extension/ai/model-discovery.js');
global.FALLBACK_MODELS = FALLBACK_MODELS;
global.discoverModels = ()=>Promise.resolve(null);
global.clearDiscoveryCache = ()=>{};
global.config = { availableModels: { xai:[], gemini:[], openai:[], anthropic:[], openrouter:[], lmstudio:[] } };
global.window = global;
global.FSBAnalytics = function(){ return { addEventListener:()=>{}, refreshAnalytics:()=>{}, getStats:()=>({}) }; };

require('../extension/ui/options.js');
const ui = global.FSBDiscoveryUI;
const cb = global.FSBModelCombobox;

function fire(el, type, props){ el.dispatchEvent(Object.assign({ type, target: el, preventDefault(){} }, props||{})); }
function optionEls(){ return listbox.children.filter(c=>c.classList.contains('model-combobox__option')); }
function statusEls(){ return listbox.children.filter(c=>c.classList.contains('model-combobox__status')); }

console.log('\n--- FSBModelCombobox UI contract ---');
assert(typeof cb === 'object' && typeof cb.init==='function' && typeof cb.refresh==='function', 'FSBModelCombobox exposes init + refresh');

// Populate the native select via the REAL discovery render path, then init.
const models = [
  { id:'grok-4-1-fast', displayName:'Grok 4.1 Fast' },
  { id:'grok-4',        displayName:'Grok 4' },
  { id:'grok-3-mini',   displayName:'Grok 3 Mini' }
];
ui.renderModelDropdown(models, 'grok-4-1-fast');
cb.init();

assert(select.value === 'grok-4-1-fast', 'native select has saved selection');
assert(input.value === 'Grok 4.1 Fast', 'closed combobox shows selected model label');
assert(listbox.hidden === true, 'popup closed initially');

// Open
fire(input, 'focus');
assert(listbox.hidden === false, 'focus opens popup');
assert(input.attributes['aria-expanded'] === 'true', 'aria-expanded=true when open');
assert(input.value === '', 'opening clears the field into a clean search box');
assert(optionEls().length === 3, 'all 3 models rendered when not searching');
const selLi = optionEls().find(li=>li.classList.contains('is-selected'));
assert(selLi && selLi.dataset.value === 'grok-4-1-fast', 'selected model marked is-selected');

// Filter + highlight (token present in the visible LABEL, not just the id)
input.value = 'fast';
fire(input, 'input');
const shown = optionEls();
assert(shown.length === 1 && shown[0].dataset.value === 'grok-4-1-fast', 'typing "fast" filters to one match');
assert(/<mark class="model-combobox__hl">Fast<\/mark>/.test(shown[0].innerHTML), 'matched word wrapped in orange highlight <mark> (original case preserved)');
assert(/^Grok 4\.1 <mark/.test(shown[0].innerHTML), 'non-matched text preserved before the highlight');

// No-match path
input.value = 'zzzzz';
fire(input, 'input');
assert(optionEls().length === 0 && statusEls().length === 1 && /no models match/i.test(statusEls()[0].textContent), 'no-match shows status row');

// Commit via click → fires change once + updates value + closes + shows label
input.value = 'grok 3';
fire(input, 'input');
const miniLi = optionEls().find(li=>li.dataset.value==='grok-3-mini');
assert(!!miniLi, 'multi-token "grok 3" matches grok-3-mini');
let changeCount = 0; select.addEventListener('change', ()=>{ changeCount++; });
fire(listbox, 'click', { target: miniLi });
assert(select.value === 'grok-3-mini', 'clicking option commits new value to native select');
assert(changeCount === 1, 'commit dispatched exactly one change event');
assert(listbox.hidden === true, 'commit closes popup');
assert(input.value === 'Grok 3 Mini', 'committed label shown in closed field');

// Re-selecting the SAME value must NOT fire change
fire(input,'focus'); input.value='grok 3 mini'; fire(input,'input');
const sameLi = optionEls().find(li=>li.dataset.value==='grok-3-mini');
changeCount = 0; fire(listbox,'click',{ target: sameLi });
assert(changeCount === 0, 're-selecting same model does not fire change');

// Keyboard: open, ArrowDown, Enter commits active
fire(input,'focus');
fire(input,'keydown',{ key:'ArrowDown' });
fire(input,'keydown',{ key:'ArrowDown' });
const activeLi = optionEls().find(li=>li.classList.contains('is-active'));
assert(!!activeLi, 'ArrowDown sets an active option');
changeCount = 0; fire(input,'keydown',{ key:'Enter' });
assert(changeCount === 1 && listbox.hidden===true, 'Enter commits active option and closes');

// Escape cancels without committing
const before = select.value;
fire(input,'focus'); input.value='grok-4'; fire(input,'input');
changeCount = 0; fire(input,'keydown',{ key:'Escape' });
assert(changeCount === 0 && listbox.hidden===true, 'Escape closes without committing');
assert(select.value === before, 'Escape leaves selection unchanged');
assert(input.value === reg.modelName.options[reg.modelName.selectedIndex].textContent, 'Escape restores committed label');

// MutationObserver sync: discovery repopulates select while closed
ui.renderModelDropdown([{ id:'grok-9', displayName:'Grok 9 Ultra' }], 'grok-9');
flush();
assert(input.value === 'Grok 9 Ultra', 'observer re-sync updates closed field after discovery repopulates');

// Disabled (loading) sync
select.disabled = true; flush();
assert(input.disabled === true && root.classList.contains('is-disabled'), 'disabled select disables combobox input');
fire(input,'focus');
assert(listbox.hidden === true, 'disabled combobox does not open');
select.disabled = false; flush();
assert(input.disabled === false && !root.classList.contains('is-disabled'), 're-enabled select re-enables combobox');

// Status-only state (no real models)
select.innerHTML = '';
const empty = makeEl('option'); empty.value=''; empty.textContent='No models available'; empty.disabled=true; select.appendChild(empty);
select.value=''; flush();
fire(input,'focus');
assert(optionEls().length===0 && statusEls().length===1 && /no models available/i.test(statusEls()[0].textContent), 'empty state shows status row, no selectable options');
fire(input,'keydown',{ key:'Enter' });
assert(true, 'Enter on status-only list is a no-op (no crash)');

console.log('\n=== Results: '+passed+' passed, '+failed+' failed ===');
if (failed){ failures.forEach(f=>console.error('  - '+f)); process.exit(1); }
