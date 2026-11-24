(function () {
  'use strict';

  const ASSET_ROOT = '../assets/onboarding';
  const VERSION = chrome.runtime.getManifest().version;
  const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server@latest install';
  const ROTATE_MS = 1800;
  const KEY_ACCEPT_MS = 520;
  const NUDGE_MS = 2200;
  const AGENTS_PAGE_URL = 'https://full-selfbrowsing.com/agents';
  const CLAWHUB_SKILL_URL = 'https://clawhub.ai/lakshmanturlapati/full-selfbrowsing';

  // Every step is a plane in the room, in the order the planes sit on the z axis.
  // 'setup' is only a placeholder on the route before a path is chosen; it has no plane.
  const STEPS = ['welcome', 'path', 'mcp', 'provider', 'apikey', 'pin', 'done'];
  // Steps of the two setup tracks. Switching between them is a sidestep, not a flight:
  // Agent lives to the left, in-browser to the right, as the two cards sit on the path step.
  const TRACK_STEPS = ['mcp', 'provider', 'apikey'];

  const PROVIDER_KEY_FIELDS = {
    xai: 'apiKey',
    gemini: 'geminiApiKey',
    openai: 'openaiApiKey',
    anthropic: 'anthropicApiKey',
    openrouter: 'openrouterApiKey'
  };

  const PROVIDER_MODELS = {
    xai: 'grok-4-1-fast',
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-6',
    openrouter: 'openai/gpt-4o',
    lmstudio: ''
  };

  const PROVIDERS = [
    { id: 'xai', name: 'xAI Grok', logo: 'xai.png', tag: 'Recommended', tagClass: 'ob-tag-rec', keyUrl: 'https://x.ai/api', urlName: 'x.ai/api', keyPrefix: 'xai-' },
    { id: 'anthropic', name: 'Anthropic', logo: 'anthropic.webp', keyUrl: 'https://console.anthropic.com/account/keys', urlName: 'Anthropic Console', keyPrefix: 'sk-ant-' },
    { id: 'openai', name: 'OpenAI', logo: 'openai.svg', keyUrl: 'https://platform.openai.com/api-keys', urlName: 'OpenAI Platform', keyPrefix: 'sk-' },
    { id: 'gemini', name: 'Google Gemini', logo: 'google.png', tag: 'Free Tier', tagClass: 'ob-tag-free', keyUrl: 'https://aistudio.google.com/app/apikey', urlName: 'Google AI Studio', keyPrefix: 'AIza' },
    { id: 'openrouter', name: 'OpenRouter', logo: 'openrouter.svg', noInvert: true, keyUrl: 'https://openrouter.ai/keys', urlName: 'OpenRouter', keyPrefix: 'sk-or-' },
    { id: 'lmstudio', name: 'LM Studio', icon: 'fa-solid fa-cube', tag: 'Local / No Key', tagClass: 'ob-tag-local', local: true }
  ];

  // `logo` names an .ob-lg-* mask class in onboarding.css. The first half fans up from
  // the copy button, the second half fans down.
  const INSTALL_CLIENTS = [
    { id: 'claude-code', name: 'Claude Code', logo: 'claude', flag: '--claude-code', cmd: 'npx -y fsb-mcp-server@latest install --claude-code' },
    { id: 'claude-desktop', name: 'Claude Desktop', logo: 'claude', flag: '--claude-desktop', cmd: 'npx -y fsb-mcp-server@latest install --claude-desktop' },
    { id: 'cursor', name: 'Cursor', logo: 'cursor', flag: '--cursor', cmd: 'npx -y fsb-mcp-server@latest install --cursor' },
    { id: 'vscode', name: 'VS Code', logo: 'vscode', flag: '--vscode', cmd: 'npx -y fsb-mcp-server@latest install --vscode' },
    { id: 'antigravity', name: 'Antigravity', logo: 'antigravity', flag: '--antigravity', cmd: 'npx -y fsb-mcp-server@latest install --antigravity' },
    { id: 'codex', name: 'Codex', logo: 'openai', flag: '--codex', cmd: 'npx -y fsb-mcp-server@latest install --codex' },
    { id: 'opencode', name: 'OpenCode', logo: 'opencode', flag: '--opencode', cmd: 'npx -y fsb-mcp-server@latest install --opencode' },
    { id: 'cline', name: 'Cline', logo: 'cline', flag: '--cline', cmd: 'npx -y fsb-mcp-server@latest install --cline' },
    { id: 'gemini', name: 'Gemini CLI', logo: 'gemini', flag: '--gemini', cmd: 'npx -y fsb-mcp-server@latest install --gemini' },
    { id: 'all', name: 'All Clients', logo: 'all', flag: '--all', cmd: 'npx -y fsb-mcp-server@latest install --all' }
  ];

  // The clients the install bar cycles through, in the order it shows them.
  const ROLL_CLIENTS = ['claude-code', 'claude-desktop', 'cursor', 'vscode', 'antigravity', 'codex', 'gemini', 'opencode', 'cline']
    .map((id) => INSTALL_CLIENTS.find((client) => client.id === id));
  const ALL_INSTALL_CLIENT_IDS = [
    'claude-code',
    'claude-desktop',
    'cursor',
    'vscode',
    'antigravity',
    'codex',
    'opencode',
    'cline',
    'gemini'
  ];
  // The always-on agents the Agents page leads with: Grok Bot, Muse, Dots, OpenClaw, Hermes.
  const AGENT_MARKS = ['grokbot', 'meta', 'openai', 'openclaw', 'hermes'];
  const FSB_AGENT_PROVIDERS_STORAGE_KEY = 'fsbAgentProviders';
  function ob(key, english, subs) {
    const locale = globalThis.fsbUiLocale;
    if (locale && typeof locale.text === 'function') return locale.text(key, english, subs);
    if (!subs || typeof english !== 'string') return english;
    return english.replace(/\$([A-Za-z0-9_]+)\$/g, (all, name) => {
      if (subs[name] != null) return String(subs[name]);
      const lower = name.toLowerCase();
      return subs[lower] != null ? String(subs[lower]) : all;
    });
  }

  function obExact(english, subs) {
    const locale = globalThis.fsbUiLocale;
    if (locale && typeof locale.line === 'function') return locale.line(english, subs);
    if (!subs || typeof english !== 'string') return english;
    return english.replace(/\$([A-Za-z0-9_]+)\$/g, (all, name) => {
      if (subs[name] != null) return String(subs[name]);
      const lower = name.toLowerCase();
      return subs[lower] != null ? String(subs[lower]) : all;
    });
  }

  function stepLabel(step) {
    const labels = {
      welcome: ['entry_label_welcome', 'Welcome'],
      path: ['entry_label_path', 'Path'],
      mcp: ['entry_label_mcp', 'MCP'],
      provider: ['entry_label_provider', 'Provider'],
      apikey: ['entry_label_apikey', 'API Key'],
      setup: ['entry_label_setup', 'Setup'],
      pin: ['entry_label_pin', 'Pin'],
      done: ['entry_label_done', 'Done']
    };
    const pair = labels[step];
    return pair ? ob(pair[0], pair[1]) : step;
  }

  const state = {
    theme: 'dark',
    screen: 'welcome',
    path: null,
    provider: 'xai',
    apiKey: '',
    lmstudioBaseUrl: 'http://localhost:1234',
    lmstudioModel: '',
    lmstudioModels: [],
    lmstudioDiscoveryStatus: 'idle',
    lmstudioDiscoveryMessage: '',
    lmstudioDiscoveredBaseUrl: '',
    revealed: false,
    keyStatus: 'idle',
    keyMessage: '',
    validating: false,
    pinned: false,
    iconIndex: 0,
    token: '--claude-code',
    morphing: false,
    paused: false,
    fanOpen: false,
    copied: null,
    // What the last step opened: 'panel' (control panel), 'fsb' (side panel) or false.
    opened: false,
    skipped: false,
    toast: '',
    nudge: ''
  };

  const els = {};
  // step -> { el: its <section>, html: the markup last patched into it }
  const planes = {};
  const handlers = [];
  let depth = null;
  let seen = null;
  let railHtml = '';
  let rollTimer = null;
  let rafId = null;
  let copiedTimer = null;
  let toastTimer = null;
  let fanCloseTimer = null;
  let hoverTimer = null;
  let nudgeTimer = null;
  let acceptTimer = null;
  let currentWindowId = null;
  let copyClickMutationTail = Promise.resolve();
  let lmstudioDiscoveryGeneration = 0;
  let lmstudioDiscoveryTimer = null;
  let keyCheckGeneration = 0;

  globalThis.FSB_ONBOARDING_PROVIDER_KEY_FIELDS = PROVIDER_KEY_FIELDS;
  globalThis.FSB_ONBOARDING_INSTALL_CLIENTS = INSTALL_CLIENTS;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    els.root = document.querySelector('.ob');
    els.screen = document.getElementById('obStage');
    els.nodes = document.getElementById('obNodes');
    els.trackFill = document.getElementById('obTrackFill');
    els.cue = document.getElementById('obCue');
    els.cueText = document.getElementById('obCueText');
    els.stepLabel = document.getElementById('obStepLabel');
    els.toast = document.getElementById('obToast');
    els.toastMsg = document.getElementById('obToastMsg');

    buildPlanes();
    bindInteractions();
    listen();
    setupTheme();
    await loadInitialState();
    // Resolve a concrete window id now (async is safe here, well before the
    // Open FSB click) so openFsb() can call sidePanel.open synchronously
    // inside the user gesture. WINDOW_ID_CURRENT (-2) is rejected by the API.
    try {
      if (chrome.windows && typeof chrome.windows.getCurrent === 'function') {
        const win = await chrome.windows.getCurrent();
        if (win && typeof win.id === 'number') currentWindowId = win.id;
      }
    } catch (_e) { /* fall back to no-windowId open in openFsb() */ }
    render();
    startDepth();
    if (globalThis.fsbUiLocale && typeof fsbUiLocale.boot === 'function') {
      if (typeof fsbUiLocale.onChange === 'function') fsbUiLocale.onChange(() => render());
      fsbUiLocale.boot().then(() => {
        if (typeof fsbUiLocale.apply === 'function') fsbUiLocale.apply(document);
        render();
      });
    }
    rollTimer = setInterval(advanceInstallClient, ROTATE_MS);
  }

  function setupTheme() {
    const media = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    state.theme = media && media.matches ? 'dark' : 'light';
    if (media) {
      media.addEventListener('change', (e) => {
        state.theme = e.matches ? 'dark' : 'light';
        render();
      });
    }
  }

  async function loadInitialState() {
    try {
      const data = await storageGet(['modelProvider', 'modelName', 'lmstudioBaseUrl']);
      if (data.modelProvider && PROVIDER_MODELS[data.modelProvider] !== undefined) {
        state.provider = data.modelProvider;
      }
      if (data.lmstudioBaseUrl) {
        state.lmstudioBaseUrl = data.lmstudioBaseUrl;
      }
      if (data.modelProvider === 'lmstudio' && typeof data.modelName === 'string') {
        state.lmstudioModel = data.modelName.trim();
      }
    } catch (_error) {
      // Onboarding should stay usable even if storage is temporarily unavailable.
    }
  }

  function route(path = state.path) {
    if (path === 'mcp') return ['welcome', 'path', 'mcp', 'pin', 'done'];
    if (path === 'byok') return ['welcome', 'path', 'provider', 'apikey', 'pin', 'done'];
    return ['welcome', 'path', 'setup', 'pin', 'done'];
  }

  // ---- the room ----

  function buildPlanes() {
    STEPS.forEach((step) => {
      const section = document.createElement('section');
      section.className = 'ob3-layer';
      section.dataset.step = step;
      if (step === 'done') section.setAttribute('data-end', '');
      els.screen.appendChild(section);
      planes[step] = { el: section, html: '' };
    });
  }

  function startDepth() {
    const engine = globalThis.FSBOnboardingDepth;
    if (!engine || typeof engine.create !== 'function') return;
    depth = engine.create(els.root, { canStep, step: stepBy, nudge });
    seen = { screen: state.screen, path: state.path };
    if (depth) depth.set(targets(), 0, true);
    setProgress();
  }

  // Each step's distance from the one in focus; steps off the route get none.
  function targets() {
    const r = route();
    const current = r.indexOf(state.screen);
    const out = {};
    STEPS.forEach((step) => {
      const index = r.indexOf(step);
      out[step] = index < 0 ? null : index - current;
    });
    return out;
  }

  // How far through the route: the glow drifts across the room with it.
  function setProgress() {
    if (!els.root || !els.root.style || typeof els.root.style.setProperty !== 'function') return;
    const r = route();
    const index = Math.max(0, r.indexOf(state.screen));
    els.root.style.setProperty('--prog', String(r.length > 1 ? Math.round((index / (r.length - 1)) * 1000) / 1000 : 0));
  }

  // After a render: if the step or the route changed, fly the camera there.
  function syncDepth() {
    if (!depth || !seen) return;
    const prev = seen;
    if (prev.screen === state.screen && prev.path === state.path) return;
    seen = { screen: state.screen, path: state.path };
    setProgress();
    const was = route(prev.path).indexOf(prev.screen);
    const now = route().indexOf(state.screen);
    const dir = now > was ? 1 : now < was ? -1 : prev.screen !== state.screen ? 1 : 0;
    const switchedTrack = prev.path && state.path && prev.path !== state.path
      && TRACK_STEPS.includes(prev.screen) && TRACK_STEPS.includes(state.screen);
    const side = switchedTrack ? (state.path === 'byok' ? 1 : -1) : 0;
    depth.set(targets(), dir, false, side);
    // The control that was pressed now sits on a plane that has left; keep the keyboard on the stage.
    if (prev.screen !== state.screen) {
      const active = document.activeElement;
      if (!active || active === document.body || (active.closest && active.closest('.ob3-layer[inert]'))) depth.focus();
    }
  }

  // A step that cannot be left going forward until it is answered.
  function stepNeedsAnswer(step) {
    if (step === 'path') return !state.path;
    if (step === 'apikey') return state.keyStatus !== 'valid';
    return false;
  }

  // Whether a swipe, an arrow key or Next may move on from this step.
  function canStep(dir) {
    const r = route();
    const index = r.indexOf(state.screen);
    if (dir < 0) return stepBefore(r, index) !== null;
    if (index < 0 || index >= r.length - 1) return false;
    return !stepNeedsAnswer(state.screen);
  }

  // The later steps a rail press may jump to: on along the route, up to the first
  // step that still needs an answer, as Next and the arrow keys would go.
  function reachableAhead(r, index) {
    const ahead = new Set();
    if (index < 0) return ahead;
    for (let i = index; i < r.length - 1; i++) {
      if (stepNeedsAnswer(r[i])) break;
      if (STEPS.includes(r[i + 1])) ahead.add(r[i + 1]);
    }
    return ahead;
  }

  // Where a rail press on this step may go, read from the live state: 'back' to an earlier
  // step on the route, 'forward' to a later one Next would reach, or '' when it may not go.
  // The rail draws itself from this and a press asks it again, so the two never disagree,
  // even when a key edit has reset the status in place without a render.
  function railMove(step, r = route()) {
    const here = r.indexOf(state.screen);
    const currentIndex = Math.max(0, here);
    const index = r.indexOf(step);
    if (index < 0 || !STEPS.includes(step)) return '';
    if (index < currentIndex) return 'back';
    if (index > currentIndex && reachableAhead(r, here).has(step)) return 'forward';
    return '';
  }

  function stepBy(dir) {
    if (dir > 0) goNext();
    else goBack();
  }

  // A step that still needs an answer says so in the cue.
  function nudge() {
    let message = '';
    if (state.screen === 'path') message = ob('entry_nudge_path', 'Pick a path to continue');
    else if (state.screen === 'apikey') {
      message = currentProvider().local
        ? ob('entry_nudge_local', 'Start LM Studio, or skip to MCP')
        : ob('entry_nudge_key', 'Add a key, or skip to MCP');
    }
    if (!message) return;
    clearTimeout(nudgeTimer);
    state.nudge = message;
    render();
    nudgeTimer = setTimeout(() => {
      state.nudge = '';
      render();
    }, NUDGE_MS);
  }

  // The nearest earlier step that has a plane to land on.
  function stepBefore(r, index) {
    for (let i = index - 1; i >= 0; i--) {
      if (STEPS.includes(r[i])) return r[i];
    }
    return null;
  }

  // ---- rendering ----

  function render() {
    els.root.dataset.theme = state.theme;

    renderStepper();
    STEPS.forEach((step) => {
      const plane = planes[step];
      if (!plane) return;
      const label = planeLabel(step);
      if (plane.el.getAttribute('aria-label') !== label) plane.el.setAttribute('aria-label', label);
      const html = planeHtml(step);
      if (html === plane.html) return;
      plane.html = html;
      morph(plane.el, html);
    });
    syncDoneGrid();

    renderToast();
    syncDepth();
    // Arriving on the LM Studio step starts model discovery once.
    if (state.screen === 'apikey'
        && currentProvider().local
        && state.lmstudioDiscoveryStatus === 'idle'
        && lmstudioDiscoveryTimer === null) {
      void discoverLmStudioModels();
    }
  }

  function planeHtml(step) {
    if (step === 'welcome') return welcomeHtml();
    if (step === 'path') return pathHtml();
    if (step === 'mcp') return mcpHtml();
    if (step === 'provider') return providerHtml();
    if (step === 'apikey') return apiKeyHtml();
    if (step === 'pin') return pinHtml();
    return doneHtml();
  }

  function planeLabel(step) {
    if (step === 'welcome') return stepLabel('welcome');
    if (step === 'path') return ob('entry_pick_path', 'Pick Your Path');
    if (step === 'mcp') return ob('entry_install_h', 'Install the FSB MCP server');
    if (step === 'provider') return ob('entry_choose_provider', 'Choose your AI provider');
    if (step === 'apikey') return keyHeading(currentProvider());
    if (step === 'pin') return ob('entry_pin_h', "Pin FSB so it's one click away");
    return ob('entry_all_set', "You're all set.");
  }

  function renderStepper() {
    const r = route();
    const currentIndex = Math.max(0, r.indexOf(state.screen));
    els.stepLabel.textContent = ob('entry_step', 'Step $CURRENT$ of $TOTAL$', { current: currentIndex + 1, total: r.length });
    els.trackFill.style.width = r.length > 1 ? `${Math.round((currentIndex / (r.length - 1)) * 100)}%` : '0%';
    if (els.cue) els.cue.classList.toggle('is-nudge', !!state.nudge);
    if (els.cueText) {
      els.cueText.textContent = state.nudge
        || (state.screen === 'welcome' ? ob('entry_cue_begin', 'Begin') : stepLabel(state.screen));
    }
    const html = r.map((step, index) => {
      const done = index < currentIndex;
      const current = index === currentIndex;
      const move = railMove(step, r);
      const back = move === 'back';
      const forward = move === 'forward';
      const reachable = back || forward;
      const label = stepLabel(step);
      const cls = done ? ' is-done' : current ? ' is-active' : '';
      const aria = back
        ? ob('entry_rail_back', 'Back to $STEP$', { step: label })
        : forward
          ? ob('entry_rail_go', 'Go to $STEP$', { step: label })
          : current
            ? ob('entry_rail_current', '$STEP$, current step', { step: label })
            : done ? label : ob('entry_rail_ahead', '$STEP$, not reached yet', { step: label });
      return `<button class="fsb-depth-go${cls}" type="button" data-step="${escapeAttr(step)}" aria-label="${escapeAttr(aria)}"${current ? ' aria-current="step"' : ''}${reachable ? '' : ' disabled'}><span class="fsb-depth-lbl">${escapeHtml(label)}</span><span class="fsb-depth-tick" aria-hidden="true"></span></button>`;
    }).join('');
    if (html !== railHtml) {
      railHtml = html;
      morph(els.nodes, html);
    }
  }

  function welcomeHtml() {
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-welcome">
          <h1 data-di="0">${escapeHtml(ob('entry_future_lead', 'The future of'))} <span class="highlight">${escapeHtml(ob('entry_future_word', 'autonomous'))}</span> ${escapeHtml(ob('entry_future_tail', 'browsing.'))}</h1>
          <p class="ob-sub" data-di="0.3">${escapeHtml(ob('entry_welcome_sub', "You made the right call. Your agents are about to experience the best autonomous browsing engine of their lifetime. Pure DOM precision, no vision, no guessing. They'll never go back to clicking blind."))}</p>
          <div class="ob-feat-row">
            <div class="ob-feat" data-di="0.5"><i class="fa-solid fa-bolt"></i><b>${escapeHtml(ob('entry_feat_api', 'Direct API'))}</b><span>${escapeHtml(ob('entry_feat_api_sub', 'Talks to apps, not just clicks'))}</span></div>
            <div class="ob-feat" data-di="0.58"><i class="fa-solid fa-compass"></i><b>${escapeHtml(ob('entry_feat_guides', '130+ guides'))}</b><span>${escapeHtml(ob('entry_feat_guides_sub', 'Across 17 categories'))}</span></div>
            <div class="ob-feat" data-di="0.66"><i class="fa-solid fa-plug"></i><b>${escapeHtml(ob('entry_feat_tools', '69 MCP tools'))}</b><span>${escapeHtml(ob('entry_feat_tools_sub', 'From your agent'))}</span></div>
          </div>
          <div class="ob-nav ob-nav-center" data-di="0.8"><button class="ob-btn ob-btn-primary ob-btn-wide" id="obGetStarted" type="button" data-door="primary">${escapeHtml(ob('entry_get_started', 'Get started'))} <i class="fa-solid fa-arrow-right"></i></button></div>
          <button class="ob-skip ob-skip-center" id="obWelcomeSkip" type="button" data-di="0.9">${escapeHtml(ob('entry_skip_setup', 'Skip setup for now'))}</button>
          <div class="ob-welcome-ver" data-di="1"><span class="version-tag" translate="no">v${escapeHtml(VERSION)}</span></div>
        </div>
      </div>
    `;
  }

  function pathHtml() {
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-path">
          <div class="ob-eyebrow" data-di="0">${escapeHtml(ob('entry_pick_path', 'Pick Your Path'))}</div>
          <h2 class="ob-h" data-di="0.08">${escapeHtml(ob('entry_how_run', 'How do you want to run FSB?'))}</h2>
          <p class="ob-sub" data-di="0.2">${escapeHtml(ob('entry_two_ways', 'Two ways in. Set up one now and add the other anytime in Settings.'))}</p>
          <div class="ob-paths${state.path ? ' has-sel' : ''}">
            <button class="ob-path${state.path === 'mcp' ? ' sel' : ''}" type="button" id="obPickMcp" data-door="always" data-di="0.35" aria-pressed="${state.path === 'mcp'}">
              <div class="ob-path-ic"><i class="fa-solid fa-plug"></i></div>
              <div class="ob-path-body">
                <div class="ob-path-head"><span class="ob-path-name">${escapeHtml(ob('entry_agent', 'Agent'))}</span><span class="ob-badge">${escapeHtml(ob('entry_recommended', 'Recommended'))}</span></div>
                <div class="ob-path-desc">${escapeHtml(ob('entry_agent_desc', 'Give Grok Bot, Muse, Dots, OpenClaw, Hermes or your coding agent a real browser over MCP. No API key, nothing to configure in the browser.'))}</div>
              </div>
              <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
            </button>
            <button class="ob-path${state.path === 'byok' ? ' sel' : ''}" type="button" id="obPickByok" data-door="always" data-di="0.47" aria-pressed="${state.path === 'byok'}">
              <div class="ob-path-ic"><i class="fa-solid fa-comments"></i></div>
              <div class="ob-path-body">
                <div class="ob-path-head"><span class="ob-path-name">${escapeHtml(ob('entry_in_browser', 'In this browser'))}</span><span class="ob-badge-soft">${escapeHtml(ob('entry_byok', 'BYOK'))}</span></div>
                <div class="ob-path-desc">${escapeHtml(ob('entry_byok_desc', 'Chat with FSB in the side panel. Bring your own key from xAI, Anthropic or Google, or run a local model with no key at all.'))}</div>
              </div>
              <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
            </button>
          </div>
          <div class="ob-note" data-di="0.6"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(ob('entry_most_people', 'Most people start with MCP, the fastest and cheapest way to use FSB.'))}</div>
          ${navHtml({ di: '0.75', nextDisabled: !state.path, skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obSkipPath' })}
        </div>
      </div>
    `;
  }

  function mcpHtml() {
    const current = ROLL_CLIENTS[state.iconIndex];
    const half = Math.ceil(INSTALL_CLIENTS.length / 2);
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-mcp">
          <div class="ob-eyebrow" data-di="0">${escapeHtml(ob('entry_mcp_eyebrow', 'Recommended Path / MCP'))}</div>
          <h2 class="ob-h" data-di="0.08">${escapeHtml(ob('entry_install_h', 'Install the FSB MCP server'))}</h2>
          <p class="ob-sub" data-di="0.2">${escapeHtml(ob('entry_one_command', 'One command. Pick your agent. FSB registers itself automatically. No API key needed.'))}</p>
          <div class="install-widget" id="obInstallWidget" data-di="0.35" style="margin-top:26px">
            <div class="install-label">${escapeHtml(ob('entry_one_command_short', 'One command. Pick your agent.'))}</div>
            <div class="install-bar">
              <span class="install-mark${state.morphing ? ' is-morphing' : ''}"><span class="install-glyph ob-lg-${current.logo}" role="img" aria-label="${escapeAttr(current.name)}"></span></span>
              <button class="install-cmd" type="button" id="obCopyCurrent" title="${escapeAttr(ob('entry_copy_command', 'Copy command'))}">
                <span class="install-base" translate="no">${BASE_INSTALL_COMMAND}</span>
                <span class="install-flag${state.morphing ? ' is-morphing' : ''}" translate="no">${escapeHtml(state.token)}</span>
              </button>
              <div class="install-copy-wrap" id="obCopyWrap" data-depth-own>
                <button class="install-copy${state.copied === 'current' ? ' copied' : ''}" type="button" id="obCopyIcon" aria-label="${escapeAttr(ob('entry_copy_install', 'Copy install command'))}"><i class="${state.copied === 'current' ? 'fa-solid fa-check' : 'fa-regular fa-copy'}"></i></button>
                ${fanHtml(INSTALL_CLIENTS.slice(0, half), 'install-fan-up', -1)}
                ${fanHtml(INSTALL_CLIENTS.slice(half), 'install-fan-down', 1)}
              </div>
            </div>
          </div>
          <div class="ob-mcp-steps">
            <div class="ob-mcp-step" data-di="0.5"><span class="n">1</span><span>${escapeHtml(ob('entry_mcp_1a', 'Run the command in your terminal.'))} <b>${escapeHtml(ob('entry_mcp_1b', 'Hover copy'))}</b> ${escapeHtml(ob('entry_mcp_1c', 'to pick a specific client.'))}</span></div>
            <div class="ob-mcp-step" data-di="0.57"><span class="n">2</span><span>${escapeHtml(ob('entry_mcp_2a', "FSB writes itself into your agent's MCP config."))} <b>${escapeHtml(ob('entry_mcp_2b', '69 tools'))}</b>${escapeHtml(ob('entry_mcp_2c', ', zero manual JSON.'))}</span></div>
            <div class="ob-mcp-step" data-di="0.64"><span class="n">3</span><span>${escapeHtml(ob('entry_mcp_3', "Ask your agent to browse. It drives FSB's DOM engine for you."))}</span></div>
          </div>
          <a class="ob-claw" href="${AGENTS_PAGE_URL}" target="_blank" rel="noopener" data-di="0.72">
            <span class="ob3-agents-marks" aria-hidden="true">${AGENT_MARKS.map((logo) => `<span class="ob3-agents-mark"><span class="install-glyph ob-lg-${logo}"></span></span>`).join('')}</span>
            <span class="ob-claw-body"><span class="ob-claw-name">${escapeHtml(ob('entry_agents_card_name', 'Running an always-on agent?'))}</span><span class="ob-claw-desc">${escapeHtml(ob('entry_agents_card_desc', 'Grok Bot, Muse, Dots, OpenClaw and Hermes drive FSB over MCP too. See how on the Agents page.'))}</span></span>
            <i class="fa-solid fa-arrow-up-right-from-square ob-claw-go"></i>
          </a>
          <div class="ob-note ob3-skill" data-di="0.77"><i class="fa-solid fa-circle-info"></i><span>${escapeHtml(ob('entry_clawhub_lead', 'On OpenClaw or Hermes? The fastest route is the'))} <a href="${CLAWHUB_SKILL_URL}" target="_blank" rel="noopener">${escapeHtml(ob('entry_clawhub_link', 'FSB Skill on ClawHub'))}</a>.</span></div>
          ${navHtml({ di: '0.82', skipLabel: ob('entry_prefer_key', 'Prefer your own key?'), skipId: 'obUseByok', skipArrow: true })}
        </div>
      </div>
    `;
  }

  function providerHtml() {
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-provider">
          <div class="ob-eyebrow" data-di="0">${escapeHtml(ob('entry_byok_eyebrow', 'In-Browser / BYOK'))}</div>
          <h2 class="ob-h" data-di="0.08">${escapeHtml(ob('entry_choose_provider', 'Choose your AI provider'))}</h2>
          <div class="ob-hint" data-di="0.2"><i class="fa-solid fa-wand-magic-sparkles"></i><div class="ob-hint-body"><b>${escapeHtml(ob('entry_dont_need', "You don't actually need this."))}</b> ${escapeHtml(ob('entry_best_way', 'The best way to run FSB is through MCP. No key, no cost ceiling.'))} <button class="ob-link" type="button" id="obUseMcpFromProvider">${escapeHtml(ob('entry_setup_mcp', 'Set up MCP instead'))}</button></div></div>
          <div class="ob-providers">
            ${PROVIDERS.map(providerButtonHtml).join('')}
            <div class="ob-prov-note" data-di="0.62"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(ob('entry_once_key', 'Once your key is set, FSB lists every available text model automatically.'))}</div>
          </div>
          ${navHtml({ di: '0.75', skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obUseMcpFromProviderSkip' })}
        </div>
      </div>
    `;
  }

  function apiKeyHtml() {
    const provider = currentProvider();
    const local = !!provider.local;
    const localSelectionReady = !local || (
      state.lmstudioDiscoveryStatus === 'ready'
      && !!state.lmstudioModel
    );
    // A key that fails recoils; one that passes comes forward before the step moves on.
    const busy = state.validating || (local && state.lmstudioDiscoveryStatus === 'loading');
    const bad = state.keyStatus === 'invalid' || (local && state.lmstudioDiscoveryStatus === 'error');
    const fieldState = busy ? '' : bad ? ' is-bad' : state.keyStatus === 'valid' ? ' is-ok' : '';
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-apikey">
          <div class="ob-eyebrow" data-di="0">${escapeHtml(ob('entry_byok_eyebrow', 'In-Browser / BYOK'))}</div>
          <h2 class="ob-h" data-di="0.08">${escapeHtml(keyHeading(provider))}</h2>
          <div class="ob-optional-card" data-di="0.2"><i class="fa-solid fa-circle-info oc-ic"></i><div class="oc-body"><b>${escapeHtml(ob('entry_optional', 'This step is optional.'))}</b> ${escapeHtml(ob('entry_shines', 'FSB shines brightest through MCP, so you can skip the key entirely.'))} <button class="ob-link" type="button" id="obUseMcpFromKey">${escapeHtml(ob('entry_skip_use_mcp', 'Skip and use MCP'))}</button></div></div>
          <div class="ob3-field${fieldState}" data-di="0.38">
            ${local ? localFieldHtml() : apiKeyFieldHtml(provider)}
          </div>
          ${navHtml({ di: '0.6', nextLabel: state.validating ? ob('entry_checking', 'Checking...') : ob('entry_continue', 'Continue'), nextDisabled: state.validating || !localSelectionReady, skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obUseMcpFromKeySkip' })}
        </div>
      </div>
    `;
  }

  function keyHeading(provider) {
    return provider.local
      ? ob('entry_connect_heading', 'Connect $NAME$', { name: provider.name })
      : ob('entry_key_heading', 'Add your $NAME$ key', { name: provider.name });
  }

  function pinHtml() {
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-pin">
          <div class="ob-eyebrow" data-di="0">${escapeHtml(ob('entry_almost', 'Almost There'))}</div>
          <h2 class="ob-h" data-di="0.08">${escapeHtml(ob('entry_pin_h', "Pin FSB so it's one click away"))}</h2>
          <p class="ob-sub" data-di="0.2">${escapeHtml(ob('entry_pin_sub', "That's the only step. FSB's permissions switch on automatically the moment Chrome installs it. Nothing for you to toggle."))}</p>
          <div class="ob3-pinstage" data-di="0.38">
            <div class="ob-toolbar">
              <div class="ob-tb-dots"><span></span><span></span><span></span></div>
              <div class="ob-tb-omni"><i class="fa-solid fa-lock"></i> full-selfbrowsing.com</div>
              <span class="ob3-tb-fsb${state.pinned ? ' on' : ''}" aria-hidden="true"><img src="${ASSET_ROOT}/icon48.png" alt="" width="18" height="18"></span>
              <div class="ob-tb-puzzle${state.pinned ? '' : ' pulse'}">
                <i class="fa-solid fa-puzzle-piece"></i>
                <div class="ob-pin-pop">
                  <div class="ob-pin-row hl"><img class="pi" src="${ASSET_ROOT}/icon48.png" alt="FSB" width="20" height="20"><span class="pn" translate="no">FSB</span><i class="fa-solid fa-thumbtack pp${state.pinned ? ' on' : ''}"></i></div>
                  <div class="ob-pin-row"><span class="pi"></span><span class="pn" style="color:var(--text-muted)">${escapeHtml(ob('entry_other_ext', 'Other extension'))}</span></div>
                </div>
              </div>
            </div>
          </div>
          <button class="ob-confirm${state.pinned ? ' done' : ''}" type="button" id="obPinned" data-di="0.55" aria-pressed="${state.pinned}"><i class="fa-solid fa-thumbtack"></i> ${escapeHtml(state.pinned ? ob('entry_pinned', 'FSB pinned') : ob('entry_ive_pinned', "I've pinned FSB"))}</button>
          ${navHtml({ di: '0.7', skipLabel: ob('entry_skip_step', 'Skip this step'), skipId: 'obSkipPin' })}
        </div>
      </div>
    `;
  }

  // The end of the tunnel: the wordmark sits far back, the setup floats in front of it.
  function doneHtml() {
    const summary = getSummary();
    // Agent setups have nothing to open in the browser, so the last step leads into the
    // control panel instead. Every other setup opens the side panel.
    const explore = state.path === 'mcp';
    const isOpen = state.opened === (explore ? 'panel' : 'fsb');
    const openIcon = explore ? 'fa-solid fa-compass' : 'fa-solid fa-arrow-up-right-from-square';
    const openLabel = explore
      ? (isOpen ? ob('entry_panel_opened', 'Control panel opened') : ob('entry_explore', 'Explore FSB'))
      : (isOpen ? ob('entry_running', 'FSB is running') : ob('entry_open', 'Open FSB'));
    const more = explore
      ? `<span>${escapeHtml(ob('entry_more_panel', "There's always much more to discover about FSB. It all lives in the control panel."))}</span>`
      : `<span>${escapeHtml(ob('entry_more', "There's always much more to discover about FSB. Check it out in the"))} <button class="ob-link" type="button" id="obOpenPanel">${escapeHtml(ob('entry_control_panel', 'Control Panel'))}</button>.</span>`;
    return `
      <div class="ob3-fit">
        <div class="ob3-col ob3-end">
          <div class="ob3-end-top">
            <div class="ob-done-badge" data-di="0"><i class="fa-solid fa-check"></i></div>
            <h2 class="ob-h" data-di="0.1">${escapeHtml(ob('entry_all_set', "You're all set."))}</h2>
            <p class="ob-sub" data-di="0.2">${escapeHtml(ob('entry_ready_sub', "FSB is ready. Here's your setup. Change anything later in Settings."))}</p>
          </div>
          <div class="ob3-end-groups" style="--n:${summary.length}">
            ${summary.map((row, index) => `<div class="ob3-end-group" data-di="${Math.round((0.3 + index * 0.07) * 100) / 100}"><div><div class="ob3-end-label">${escapeHtml(row.k)}</div><span class="ob3-end-line" aria-hidden="true"></span><div class="ob3-end-v${row.mono ? ' mono' : ''}">${row.ok ? '<i class="fa-solid fa-circle-check vok"></i>' : ''}${escapeHtml(row.v)}</div></div></div>`).join('')}
          </div>
          <div class="ob3-end-cta" data-di="0.55"><button class="ob-btn ob-btn-primary${isOpen ? ' done' : ''}" id="obOpenFsb" type="button"><i class="${openIcon}"></i> ${escapeHtml(openLabel)}</button></div>
          <div class="ob-done-more" data-di="0.62"><i class="fa-solid fa-sliders"></i> ${more}</div>
        </div>
      </div>
      <div class="ob3-end-mark${isOpen ? ' is-live' : ''}" aria-hidden="true" data-di="0.7"><div><span class="fsb-mark" translate="no"><span class="fsb-row"><span class="fsb-f">F</span><span class="fsb-s">S</span><svg class="fsb-b" viewBox="-3 -3 78 103" aria-hidden="true"><path d="M0 0 L40 0 C58 0 70 10 70 26 C70 38 62 46 50 49 C64 51 72 60 72 74 C72 90 60 100 40 100 L0 100 Z"></path></svg></span></span></div></div>
      <div class="ob3-end-meta" data-di="0.5">
        <span class="version-tag" translate="no">v${escapeHtml(VERSION)}</span>
        <div class="ob-done-links">
          <a href="https://github.com/fullselfbrowsing/FSB" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>
          <a href="https://discord.gg/fullselfbrowsing" target="_blank" rel="noopener"><i class="fa-brands fa-discord"></i> Discord</a>
          <a href="https://full-selfbrowsing.com" target="_blank" rel="noopener"><i class="fa-solid fa-book"></i> ${escapeHtml(ob('entry_docs', 'Docs'))}</a>
        </div>
      </div>
    `;
  }

  // morph() leaves style attributes alone, so the summary's column count is set here.
  function syncDoneGrid() {
    const plane = planes.done;
    const grid = plane && plane.el.querySelector('.ob3-end-groups');
    if (grid) grid.style.setProperty('--n', String(getSummary().length));
  }

  function navHtml(options = {}) {
    const nextLabel = options.nextLabel || ob('entry_continue', 'Continue');
    const skipLabel = options.skipLabel || '';
    const skip = skipLabel ? `<button class="ob-skip" type="button" id="${escapeAttr(options.skipId)}">${escapeHtml(skipLabel)}${options.skipArrow ? ' &rarr;' : ''}</button>` : '';
    return `
      <div class="ob-nav" data-di="${escapeAttr(options.di || '0.75')}">
        <button class="ob-back" type="button" data-nav="back"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(ob('entry_back', 'Back'))}</button>
        <div class="ob-nav-r">
          ${skip}
          <button class="ob-btn ob-btn-primary" type="button" data-nav="next" data-door="primary" ${options.nextDisabled ? 'disabled' : ''}>${escapeHtml(nextLabel)} <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    `;
  }

  function fanHtml(clients, placementClass, direction) {
    return `<div class="install-fan ${placementClass}${state.fanOpen ? ' open' : ''}" role="menu">
      ${clients.map((client, index) => {
        const t = clients.length > 1 ? index / (clients.length - 1) : 0;
        const dx = -Math.round((1 - Math.cos(t * (Math.PI * 0.42))) * 60);
        const rot = (direction * t * 6).toFixed(1);
        return `
          <button class="install-fan-item${state.copied === client.id ? ' copied' : ''}" type="button" role="menuitem" data-copy-client="${escapeAttr(client.id)}" style="--dx:${dx}px;--rot:${rot}deg">
            <span class="install-fan-icon"><span class="install-glyph ob-lg-${client.logo}" role="img" aria-label="${escapeAttr(client.name)}"></span></span>
            <span class="install-fan-name" translate="no">${escapeHtml(client.name)}</span>
            <span class="install-fan-flag" translate="no">${escapeHtml(client.flag)}</span>
            <i class="install-fan-copyicon ${state.copied === client.id ? 'fa-solid fa-check' : 'fa-regular fa-copy'}"></i>
          </button>
        `;
      }).join('')}
    </div>`;
  }

  function providerButtonHtml(provider, index) {
    const selected = state.provider === provider.id;
    const icon = provider.icon
      ? `<i class="${provider.icon}"></i>`
      : `<img class="${provider.noInvert ? 'no-inv' : ''}" src="${ASSET_ROOT}/providers/${escapeAttr(provider.logo)}" alt="${escapeAttr(provider.name)}" width="20" height="20">`;
    const tagLabel = provider.tag === 'Recommended'
      ? ob('entry_recommended', 'Recommended')
      : provider.tag === 'Free Tier'
        ? ob('entry_free_tier', 'Free Tier')
        : provider.tag === 'Local / No Key'
          ? ob('entry_local_nokey', 'Local / No Key')
          : provider.tag;
    const tag = provider.tag ? `<span class="ob-prov-tag ${provider.tagClass || ''}">${escapeHtml(tagLabel)}</span>` : '';
    return `
      <button class="ob-prov${selected ? ' sel' : ''}" type="button" id="obProvider-${escapeAttr(provider.id)}" data-provider="${escapeAttr(provider.id)}" data-door="next" data-di="${Math.round((0.3 + index * 0.05) * 100) / 100}" aria-pressed="${selected}">
        <div class="ob-prov-ic">${icon}</div>
        <div class="ob-prov-body"><div class="ob-prov-name" translate="no">${escapeHtml(provider.name)}</div></div>
        ${tag}
        <div class="ob-prov-radio"></div>
      </button>
    `;
  }

  function localFieldHtml() {
    const discovering = state.lmstudioDiscoveryStatus === 'loading';
    const discoveryFailed = state.lmstudioDiscoveryStatus === 'error';
    const statusIcon = state.validating || discovering
      ? '<i class="fa-solid fa-spinner spin"></i>'
      : state.keyStatus === 'valid'
        ? '<i class="fa-solid fa-circle-check ok"></i>'
        : state.keyStatus === 'invalid' || discoveryFailed
          ? '<i class="fa-solid fa-circle-xmark bad"></i>'
          : state.lmstudioDiscoveryStatus === 'ready'
            ? '<i class="fa-solid fa-circle-check ok"></i>'
            : '';
    const statusClass = state.keyStatus === 'invalid' || discoveryFailed ? 'bad' : 'ok';
    const msg = state.keyMessage || state.lmstudioDiscoveryMessage || ob('entry_discovering', 'Discovering loaded chat models...');
    const modelOptions = state.lmstudioModels.length > 0
      ? `${state.lmstudioModels.length > 1 && !state.lmstudioModel
          ? `<option value="" disabled selected>${escapeHtml(ob('entry_choose_model', 'Choose a loaded model...'))}</option>`
          : ''}${state.lmstudioModels.map(model => `
          <option value="${escapeAttr(model.id)}" ${model.id === state.lmstudioModel ? 'selected' : ''}>${escapeHtml(model.displayName)}</option>
        `).join('')}`
      : `<option value="">${discovering ? escapeHtml(ob('entry_discovering_models', 'Discovering models...')) : escapeHtml(ob('entry_no_models', 'No compatible models available'))}</option>`;
    return `
      <div class="ob-field">
        <div class="ob-input-row">
          <div class="ob-input-wrap"><input class="ob-input" id="obLocalUrlInput" value="${escapeAttr(state.lmstudioBaseUrl)}" spellcheck="false" aria-label="${escapeAttr(ob('entry_lm_url_aria', 'LM Studio server URL'))}"></div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <label class="ob-model-label" for="obLocalModelSelect">${escapeHtml(ob('entry_loaded_model', 'Loaded chat model'))}</label>
        <select class="ob-input ob-model-select" id="obLocalModelSelect" data-depth-own ${state.lmstudioModels.length === 0 || discovering ? 'disabled' : ''}>
          ${modelOptions}
        </select>
        <div class="ob-status-msg ${statusClass}">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  function apiKeyFieldHtml(provider) {
    const statusIcon = state.validating ? '<i class="fa-solid fa-spinner spin"></i>' : state.keyStatus === 'valid' ? '<i class="fa-solid fa-circle-check ok"></i>' : state.keyStatus === 'invalid' ? '<i class="fa-solid fa-circle-xmark bad"></i>' : '';
    const statusClass = state.keyStatus === 'valid' ? 'ok' : state.keyStatus === 'invalid' ? 'bad' : '';
    const last4 = state.apiKey.slice(-4);
    const msg = state.keyMessage || (state.keyStatus === 'valid' && last4 ? ob('entry_key_valid', 'Key ending in $LAST$ is valid', { last: last4 }) : '');
    return `
      <div class="ob-field">
        <div class="ob-input-row">
          <div class="ob-input-wrap">
            <input class="ob-input" id="obKeyInput" type="${state.revealed ? 'text' : 'password'}" value="${escapeAttr(state.apiKey)}" placeholder="${escapeAttr(ob('entry_paste_key', 'Paste your $NAME$ API key', { name: provider.name }))}" spellcheck="false" autocomplete="off" aria-label="${escapeAttr(ob('entry_key_aria', '$NAME$ API key', { name: provider.name }))}">
            <button class="ob-eye" type="button" id="obRevealKey" aria-label="${escapeAttr(ob('entry_toggle_key', 'Toggle key visibility'))}"><i class="${state.revealed ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"></i></button>
          </div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <div class="ob-status-msg ${statusClass}">${escapeHtml(msg)}</div>
        <div class="ob-help">${escapeHtml(ob('entry_get_key', 'Get your key from'))} <a href="${escapeAttr(provider.keyUrl)}" target="_blank" rel="noopener">${escapeHtml(provider.urlName)}</a> - ${escapeHtml(ob('entry_stored_locally', 'stored locally in your browser.'))} <button class="ob-mini" type="button" id="obPasteKey">${escapeHtml(ob('entry_paste_clip', 'Paste from clipboard'))}</button></div>
      </div>
    `;
  }

  /* Patch `target` so its children match `html`, keeping every node whose tag is unchanged.
     The planes must keep their nodes: the depth engine holds them and writes their inline
     styles, CSS transitions (a chosen card coming forward, the pinned icon landing) need the
     node that had the old class, and an input keeps its caret. So existing nodes get their
     attributes and text updated in place, and only a node whose tag changed is replaced.
     The style attribute of an existing node is never written: those styles belong to the
     depth engine. */
  function morph(target, html) {
    if (typeof document.createElement !== 'function' || !target.childNodes) {
      target.innerHTML = html;
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    morphChildren(target, template.content);
  }

  function morphChildren(from, to) {
    let current = from.firstChild;
    Array.from(to.childNodes).forEach((next) => {
      if (!current) {
        from.appendChild(next);
        return;
      }
      const following = current.nextSibling;
      if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
        from.replaceChild(next, current);
      } else if (current.nodeType === 1) {
        morphAttributes(current, next);
        morphChildren(current, next);
        syncFormValue(current, next);
      } else if (current.nodeValue !== next.nodeValue) {
        current.nodeValue = next.nodeValue;
      }
      current = following;
    });
    while (current) {
      const following = current.nextSibling;
      from.removeChild(current);
      current = following;
    }
  }

  function morphAttributes(el, next) {
    Array.from(el.attributes).forEach(({ name }) => {
      if (name !== 'style' && !next.hasAttribute(name)) el.removeAttribute(name);
    });
    Array.from(next.attributes).forEach(({ name, value }) => {
      if (name !== 'style' && el.getAttribute(name) !== value) el.setAttribute(name, value);
    });
  }

  // A value attribute stops driving an input once it has been edited; carry state across,
  // except into the control that has focus (that one is the source of the state).
  function syncFormValue(el, next) {
    if (el === document.activeElement) return;
    if (el.tagName === 'INPUT') {
      const value = next.getAttribute('value') || '';
      if (el.value !== value) el.value = value;
    } else if (el.tagName === 'SELECT') {
      const selected = next.querySelector('option[selected]');
      if (selected && el.value !== selected.value) el.value = selected.value;
    }
  }

  // ---- interaction ----

  // Handlers are registered once and dispatched from the page root, because the planes
  // keep their nodes across renders and per-node listeners would pile up.
  function bind(selector, eventName, handler) {
    handlers.push({ selector, eventName, handler });
  }

  function listen() {
    const types = [];
    handlers.forEach(({ eventName }) => { if (!types.includes(eventName)) types.push(eventName); });
    types.forEach((type) => {
      // mouseenter/mouseleave do not bubble: catch them on the way down and match the element itself.
      const exact = type === 'mouseenter' || type === 'mouseleave';
      els.root.addEventListener(type, (event) => {
        const target = event.target;
        if (!target || target.nodeType !== 1) return;
        handlers.forEach(({ selector, eventName, handler }) => {
          if (eventName !== type) return;
          const el = exact ? (target.matches(selector) ? target : null) : target.closest(selector);
          if (el && els.root.contains(el)) handler(event, el);
        });
      }, exact);
    });
  }

  function bindInteractions() {
    bind('[data-nav="back"]', 'click', goBack);
    bind('[data-nav="next"]', 'click', () => {
      if (state.screen === 'apikey') continueFromKey();
      else goNext();
    });
    // Ask the live state, not the button's disabled flag, which can be out of date.
    bind('.fsb-depth-go[data-step]', 'click', (event, button) => {
      if (railMove(button.dataset.step)) goTo(button.dataset.step);
    });

    bind('#obGetStarted', 'click', goNext);
    bind('#obWelcomeSkip', 'click', () => finishOnboarding({ skipped: true, path: null }));

    bind('#obPickMcp', 'click', () => { state.path = 'mcp'; state.nudge = ''; render(); });
    bind('#obPickByok', 'click', () => { state.path = 'byok'; state.nudge = ''; render(); });
    bind('#obSkipPath', 'click', useMcp);

    bind('#obCopyCurrent', 'click', () => {
      const current = ROLL_CLIENTS[state.iconIndex];
      copyCommand(BASE_INSTALL_COMMAND + ' ' + current.flag, 'current');
    });
    bind('#obCopyIcon', 'click', () => {
      const current = ROLL_CLIENTS[state.iconIndex];
      copyCommand(BASE_INSTALL_COMMAND + ' ' + current.flag, 'current');
    });
    bind('#obInstallWidget', 'mouseenter', () => { state.paused = true; });
    bind('#obInstallWidget', 'mouseleave', () => { state.paused = false; });
    bind('#obCopyWrap', 'mouseenter', () => {
      clearTimeout(hoverTimer);
      clearTimeout(fanCloseTimer);
      hoverTimer = setTimeout(() => { state.fanOpen = true; render(); }, 420);
    });
    bind('#obCopyWrap', 'mouseleave', () => {
      clearTimeout(hoverTimer);
      clearTimeout(fanCloseTimer);
      fanCloseTimer = setTimeout(() => { state.fanOpen = false; render(); }, 260);
    });
    bind('[data-copy-client]', 'click', (event, button) => {
      const client = INSTALL_CLIENTS.find((item) => item.id === button.dataset.copyClient);
      if (client) copyCommand(client.cmd, client.id);
    });
    bind('#obUseByok', 'click', () => { state.path = 'byok'; state.screen = 'provider'; state.nudge = ''; render(); });

    bind('[data-provider]', 'click', (event, button) => selectProvider(button.dataset.provider));
    bind('#obUseMcpFromProvider', 'click', useMcp);
    bind('#obUseMcpFromProviderSkip', 'click', useMcp);

    bind('#obUseMcpFromKey', 'click', useMcp);
    bind('#obUseMcpFromKeySkip', 'click', useMcp);
    bind('#obKeyInput', 'input', (event) => {
      state.apiKey = event.target.value;
      resetKeyStatusIdle();
    });
    bind('#obLocalUrlInput', 'input', (event) => {
      state.lmstudioBaseUrl = event.target.value;
      state.lmstudioModel = '';
      state.lmstudioModels = [];
      state.lmstudioDiscoveryStatus = 'idle';
      state.lmstudioDiscoveryMessage = ob('entry_waiting_url', 'Waiting for the server URL to settle...');
      lmstudioDiscoveryGeneration += 1;
      resetKeyStatusIdle();
      scheduleLmStudioDiscovery();
    });
    bind('#obLocalModelSelect', 'change', (event) => {
      state.lmstudioModel = String(event.target.value || '');
      state.keyStatus = 'idle';
      state.keyMessage = '';
      const nextButton = planes.apikey && planes.apikey.el.querySelector('[data-nav="next"]');
      if (nextButton) nextButton.disabled = !state.lmstudioModel;
      if (planes.apikey) planes.apikey.html = '';
      renderStepper();
    });
    bind('#obRevealKey', 'click', () => { state.revealed = !state.revealed; render(); });
    bind('#obPasteKey', 'click', pasteFromClipboard);

    bind('#obPinned', 'click', () => { state.pinned = !state.pinned; render(); });
    bind('#obSkipPin', 'click', goNext);

    bind('#obOpenFsb', 'click', () => {
      if (state.path === 'mcp') exploreFsb();
      else openFsb();
    });
    bind('#obOpenPanel', 'click', () => openInternalPage('ui/control_panel.html'));
  }

  function scheduleLmStudioDiscovery() {
    if (lmstudioDiscoveryTimer !== null) clearTimeout(lmstudioDiscoveryTimer);
    lmstudioDiscoveryTimer = setTimeout(() => {
      lmstudioDiscoveryTimer = null;
      void discoverLmStudioModels({ force: true });
    }, 500);
  }

  async function discoverLmStudioModels(options = {}) {
    const baseUrl = normalizeBaseUrl(state.lmstudioBaseUrl);
    if (!options.force
        && state.lmstudioDiscoveryStatus === 'ready'
        && state.lmstudioDiscoveredBaseUrl === baseUrl) {
      return true;
    }

    const generation = lmstudioDiscoveryGeneration + 1;
    lmstudioDiscoveryGeneration = generation;
    state.lmstudioDiscoveryStatus = 'loading';
    state.lmstudioDiscoveryMessage = ob('entry_discovering', 'Discovering loaded chat models...');
    state.keyStatus = 'idle';
    state.keyMessage = '';
    render();

    const discovery = globalThis.FSBModelDiscovery;
    if (!discovery || typeof discovery.discoverModels !== 'function') {
      if (generation !== lmstudioDiscoveryGeneration) return false;
      state.lmstudioDiscoveryStatus = 'error';
      state.lmstudioDiscoveryMessage = obExact('LM Studio model discovery is unavailable');
      state.lmstudioModels = [];
      state.lmstudioModel = '';
      render();
      return false;
    }

    let result;
    try {
      result = await discovery.discoverModels('lmstudio', '', {
        baseUrl,
        timeoutMs: 5000
      });
    } catch (error) {
      result = {
        ok: false,
        reason: 'network-failed',
        message: error && error.message ? error.message : obExact('Could not connect to LM Studio')
      };
    }
    if (generation !== lmstudioDiscoveryGeneration) return false;

    if (!result || result.ok !== true || !Array.isArray(result.models) || result.models.length === 0) {
      state.lmstudioDiscoveryStatus = 'error';
      state.lmstudioDiscoveryMessage = result && result.reason === 'empty-response'
        ? obExact('No compatible chat models are loaded in LM Studio')
        : ((result && result.message) || obExact('Could not connect to LM Studio'));
      state.lmstudioModels = [];
      state.lmstudioModel = '';
      state.lmstudioDiscoveredBaseUrl = baseUrl;
      render();
      return false;
    }

    state.lmstudioModels = result.models.map(model => ({
      id: String(model.id || ''),
      displayName: String(model.displayName || model.id || '')
    })).filter(model => !!model.id);
    const selectedStillAvailable = state.lmstudioModels.some(model => model.id === state.lmstudioModel);
    if (!selectedStillAvailable) {
      state.lmstudioModel = state.lmstudioModels.length === 1
        ? state.lmstudioModels[0].id
        : '';
    }
    state.lmstudioDiscoveryStatus = 'ready';
    state.lmstudioDiscoveryMessage = state.lmstudioModels.length === 1
      ? 'Loaded model: ' + state.lmstudioModel
      : state.lmstudioModels.length + ' chat models found — choose one';
    state.lmstudioDiscoveredBaseUrl = baseUrl;
    state.lmstudioBaseUrl = baseUrl;
    render();
    return true;
  }

  // In-place status reset for the key/URL inputs, so a keystroke never re-renders.
  // Only the status icon, message and the field's recoil/accept state depend on it,
  // plus the rail: a key that is no longer valid closes the ticks past this step.
  // The plane's cached markup no longer matches, so the next render patches it in full.
  function resetKeyStatusIdle() {
    state.keyStatus = 'idle';
    state.keyMessage = '';
    if (planes.apikey) planes.apikey.html = '';
    // The stepper never touches a plane or the focus, so the caret stays in the field.
    renderStepper();
    const provider = currentProvider();
    const field = els.screen.querySelector('.ob3-field');
    const icon = els.screen.querySelector('.ob-status');
    const msgEl = els.screen.querySelector('.ob-status-msg');
    if (field) field.classList.remove('is-bad', 'is-ok');
    if (provider.local) {
      const loading = state.lmstudioDiscoveryStatus === 'loading';
      const failed = state.lmstudioDiscoveryStatus === 'error';
      if (icon) {
        icon.innerHTML = loading
          ? '<i class="fa-solid fa-spinner spin"></i>'
          : failed
            ? '<i class="fa-solid fa-circle-xmark bad"></i>'
            : '';
      }
      if (msgEl) {
        msgEl.className = 'ob-status-msg ' + (failed ? 'bad' : '');
        msgEl.textContent = state.lmstudioDiscoveryMessage || ob('entry_discovering', 'Discovering loaded chat models...');
      }
    } else {
      // Mirrors apiKeyFieldHtml()'s idle branch.
      if (icon) icon.innerHTML = '';
      if (msgEl) {
        msgEl.className = 'ob-status-msg';
        msgEl.textContent = '';
      }
    }
  }

  function goNext() {
    const r = route();
    const index = r.indexOf(state.screen);
    if (index >= 0 && index < r.length - 1) {
      state.screen = r[index + 1];
      state.nudge = '';
      if (state.screen === 'done') {
        finishOnboarding({ skipped: false, path: state.path }, { renderDone: false });
      }
      render();
    }
  }

  function goBack() {
    const r = route();
    const previous = stepBefore(r, r.indexOf(state.screen));
    if (previous) goTo(previous);
  }

  function goTo(step) {
    if (!STEPS.includes(step) || step === state.screen) return;
    state.screen = step;
    state.nudge = '';
    // A rail jump to the end finishes onboarding exactly as Next does.
    if (step === 'done') {
      finishOnboarding({ skipped: false, path: state.path }, { renderDone: false });
    }
    render();
  }

  // Provider choices stay in onboarding state until the key validates. Persisting the
  // provider before its model is known creates an invalid provider/model pair if the
  // user closes onboarding midway through setup.
  function selectProvider(providerId) {
    state.provider = providerId;
    state.apiKey = '';
    state.keyStatus = 'idle';
    state.keyMessage = '';
    if (providerId === 'lmstudio') {
      state.lmstudioDiscoveryStatus = 'idle';
      state.lmstudioDiscoveryMessage = '';
    }
    render();
  }

  // The key is acknowledged first (it comes forward), then the camera moves on.
  async function continueFromKey() {
    if (state.keyStatus === 'valid') {
      goNext();
      return;
    }
    const ok = await validateAndContinue();
    if (!ok) return;
    render();
    clearTimeout(acceptTimer);
    acceptTimer = setTimeout(() => {
      if (state.screen === 'apikey' && state.keyStatus === 'valid') goNext();
    }, KEY_ACCEPT_MS);
  }

  async function validateAndContinue() {
    const provider = currentProvider();
    const key = state.apiKey.trim();
    const baseUrl = normalizeBaseUrl(state.lmstudioBaseUrl);

    if (!provider.local && !key) {
      state.keyStatus = 'invalid';
      state.keyMessage = ob('entry_key_required', '$NAME$ API key is required', { name: provider.name });
      render();
      return false;
    }

    if (provider.local) {
      const discovered = await discoverLmStudioModels({ force: true });
      if (!discovered) return false;
      // Another provider picked while discovery ran owns the step now.
      if (currentProvider().id !== provider.id) return false;
      if (!state.lmstudioModel
          || !state.lmstudioModels.some(model => model.id === state.lmstudioModel)) {
        state.keyStatus = 'invalid';
        state.keyMessage = obExact('Select a loaded LM Studio chat model');
        render();
        return false;
      }
    }

    // This check holds the busy state from here until its answer, unless a newer one starts.
    // No return comes before the try below, so the latest check always ends it.
    const generation = keyCheckGeneration + 1;
    keyCheckGeneration = generation;
    state.validating = true;
    state.keyStatus = 'validating';
    state.keyMessage = '';
    render();

    const patch = {
      modelProvider: provider.id,
      modelName: provider.local ? state.lmstudioModel : (PROVIDER_MODELS[provider.id] || '')
    };
    if (provider.local) {
      patch.lmstudioBaseUrl = baseUrl;
      state.lmstudioBaseUrl = baseUrl;
    } else {
      patch[PROVIDER_KEY_FIELDS[provider.id]] = key;
    }
    const target = keyCheckTarget();

    try {
      await validateProvider(provider.id, {
        apiKey: provider.local ? '' : key,
        model: provider.local ? state.lmstudioModel : (PROVIDER_MODELS[provider.id] || ''),
        baseUrl: getValidationBaseUrl(provider.id, baseUrl)
      });
      if (keyCheckLapsed(generation, target)) return false;
      await storageSet(patch);
      if (keyCheckLapsed(generation, target)) return false;
      state.validating = false;
      state.keyStatus = 'valid';
      state.keyMessage = provider.local ? obExact('LM Studio responded successfully') : ob('entry_key_valid', 'Key ending in $LAST$ is valid', { last: key.slice(-4) });
      return true;
    } catch (error) {
      if (keyCheckLapsed(generation, target)) return false;
      state.validating = false;
      state.keyStatus = 'invalid';
      state.keyMessage = error && error.message ? error.message : obExact('Connection test failed');
      render();
      return false;
    }
  }

  // What a connection test checks: the provider and its key, or the LM Studio server and model.
  // An answer only counts while the wizard still holds the same ones. Going back to pick another
  // provider, or editing the key, URL or model while the test runs, makes it an answer for
  // something no longer on screen.
  function keyCheckTarget() {
    const provider = currentProvider();
    return provider.local
      ? [provider.id, normalizeBaseUrl(state.lmstudioBaseUrl), state.lmstudioModel].join('\n')
      : [provider.id, state.apiKey.trim()].join('\n');
  }

  // Only the latest check may answer. An older one says nothing: the newer check holds the
  // spinner and Continue until its own answer comes, and an old failure must not undo a newer
  // success. The latest check, when the key, URL or model changed under it, only ends the
  // busy state.
  function keyCheckLapsed(generation, target) {
    if (generation !== keyCheckGeneration) return true;
    if (keyCheckTarget() === target) return false;
    settleStaleKeyCheck();
    return true;
  }

  // A stale answer only ends the busy state. The edit that made it stale already reset the
  // status, so the step's current key still waits for its own test, and Continue is free again.
  function settleStaleKeyCheck() {
    state.validating = false;
    if (state.keyStatus === 'validating') state.keyStatus = 'idle';
    render();
    return false;
  }

  function validateProvider(provider, config) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'lattice-test-connection', provider, config }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || obExact('Connection test failed')));
          return;
        }
        resolve(response);
      });
    });
  }

  async function finishOnboarding(options, renderOptions = {}) {
    state.skipped = !!options.skipped;
    state.path = options.path || state.path;
    state.screen = 'done';
    state.nudge = '';
    await storageSet({
      fsbOnboardingCompleted: true,
      fsbOnboardingPath: state.path || '',
      fsbOnboardingSkipped: !!options.skipped,
      fsbOnboardingCompletedAt: new Date().toISOString()
    });
    if (renderOptions.renderDone !== false) render();
  }

  function useMcp() {
    state.path = 'mcp';
    state.screen = 'mcp';
    state.nudge = '';
    render();
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      state.apiKey = (text || '').trim();
      state.keyStatus = state.apiKey ? 'idle' : 'invalid';
      state.keyMessage = state.apiKey ? '' : obExact('Clipboard did not contain an API key');
    } catch (error) {
      state.keyStatus = 'invalid';
      state.keyMessage = error && error.message ? error.message : obExact('Clipboard read failed');
    }
    render();
  }

  function openFsb() {
    let openPromise = null;
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        const windowId = (typeof currentWindowId === 'number') ? currentWindowId : undefined;
        openPromise = chrome.sidePanel.open(windowId !== undefined ? { windowId } : {});
      }
    } catch (error) {
      openPromise = Promise.reject(error);
    }

    state.opened = 'fsb';
    showToast(ob('entry_toast_ready', 'FSB is ready. Opening the side panel'));
    render();

    Promise.resolve(openPromise || Promise.reject(new Error('chrome.sidePanel.open unavailable')))
      .then(() => {
        showToast(ob('entry_toast_opened', 'FSB side panel opened'));
      })
      .catch(() => {
        openPopupFallback();
      });
  }

  function exploreFsb() {
    state.opened = 'panel';
    showToast(ob('entry_toast_panel', 'Opening the control panel'));
    render();
    openInternalPage('ui/control_panel.html');
  }

  function openPopupFallback() {
    showToast(ob('entry_toast_popup', 'Opening FSB in a popup window'));
    if (chrome.windows && chrome.windows.create) {
      chrome.windows.create({
        url: chrome.runtime.getURL('ui/popup.html'),
        type: 'popup',
        width: 400,
        height: 600
      });
      return;
    }
    openInternalPage('ui/popup.html');
  }

  function openInternalPage(path) {
    const url = chrome.runtime.getURL(path);
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url, active: true });
      return;
    }
    window.location.href = url;
  }

  function getSummary() {
    if (state.path === 'mcp') {
      return [
        { k: ob('entry_sum_setup', 'Setup'), v: ob('entry_sum_mcp', 'MCP server') },
        { k: ob('entry_sum_command', 'Command'), v: 'fsb-mcp-server', mono: true },
        { k: ob('entry_sum_tools', 'Tools'), v: ob('entry_sum_68', '69 available') },
        { k: ob('entry_sum_access', 'Access'), v: ob('entry_sum_granted', 'Granted on install'), ok: true },
        { k: ob('entry_sum_version', 'Version'), v: `v${VERSION}`, mono: true }
      ];
    }
    if (state.path === 'byok') {
      const provider = currentProvider();
      const keyText = provider.local
        ? 'Local endpoint'
        : state.keyStatus === 'valid' && state.apiKey ? `****${state.apiKey.slice(-4)}` : obExact('Skipped for now');
      return [
        { k: ob('entry_sum_setup', 'Setup'), v: ob('entry_sum_byok', 'In-browser BYOK') },
        { k: ob('entry_sum_provider', 'Provider'), v: provider.name },
        { k: ob('entry_sum_apikey', 'API Key'), v: keyText, ok: state.keyStatus === 'valid' },
        { k: ob('entry_sum_access', 'Access'), v: ob('entry_sum_granted', 'Granted on install'), ok: true }
      ];
    }
    return [
      { k: ob('entry_sum_setup', 'Setup'), v: ob('entry_sum_none', 'Not configured') },
      { k: ob('entry_sum_tip', 'Tip'), v: ob('entry_sum_finish', 'Finish setup in Settings') },
      { k: ob('entry_sum_version', 'Version'), v: `v${VERSION}`, mono: true }
    ];
  }

  function advanceInstallClient() {
    if (state.screen !== 'mcp' || state.paused || state.fanOpen || state.morphing) return;
    const next = (state.iconIndex + 1) % ROLL_CLIENTS.length;
    scrambleInstallFlag(next);
  }

  function scrambleInstallFlag(targetIndex) {
    const target = ROLL_CLIENTS[targetIndex].flag;
    state.morphing = true;
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-_/';
    const duration = 560;
    const lockTimes = [];
    for (let i = 0; i < target.length; i++) {
      lockTimes.push(((i + 1) / target.length) * (duration * 0.82));
    }
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed >= duration) {
        rafId = null;
        state.token = target;
        state.iconIndex = targetIndex;
        state.morphing = false;
        render();
        return;
      }
      let frame = '';
      for (let i = 0; i < target.length; i++) {
        frame += elapsed >= lockTimes[i] ? target[i] : alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      state.token = frame;
      render();
      rafId = requestAnimationFrame(tick);
    };
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function copyCommand(text, key) {
    const clientId = key === 'current' ? ROLL_CLIENTS[state.iconIndex].id : key;
    const source = key === 'current' ? 'base' : (key === 'all' ? 'all' : 'fan');
    writeClipboard(text);
    persistCopyClick(clientId, source).catch(() => {});
    clearTimeout(copiedTimer);
    state.copied = key;
    copiedTimer = setTimeout(() => {
      state.copied = null;
      render();
    }, 1600);
    showToast(ob('entry_toast_copied', 'Install command copied'));
    render();
  }

  async function persistCopyClick(clientId, source) {
    const targetIds = clientId === 'all' ? ALL_INSTALL_CLIENT_IDS : [clientId];
    if (
      targetIds.some((id) => typeof id !== 'string' || !id) ||
      (source !== 'base' && source !== 'fan' && source !== 'all')
    ) {
      return;
    }

    const mutate = async () => {
      const stored = await storageGet([FSB_AGENT_PROVIDERS_STORAGE_KEY]);
      const existing = stored && stored[FSB_AGENT_PROVIDERS_STORAGE_KEY];
      const envelope = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? Object.assign({}, existing)
        : {};
      const clicked = envelope.clicked && typeof envelope.clicked === 'object' && !Array.isArray(envelope.clicked)
        ? Object.assign({}, envelope.clicked)
        : {};

      envelope.clicked = clicked;
      envelope.connected = envelope.connected && typeof envelope.connected === 'object' && !Array.isArray(envelope.connected)
        ? Object.assign({}, envelope.connected)
        : {};
      envelope.installed = envelope.installed && typeof envelope.installed === 'object' && !Array.isArray(envelope.installed)
        ? Object.assign({}, envelope.installed)
        : {};

      const now = Date.now();
      targetIds.forEach((id) => {
        const previous = clicked[id] && typeof clicked[id] === 'object' && !Array.isArray(clicked[id])
          ? clicked[id]
          : {};
        const previousCount = Number.isFinite(previous.count) ? previous.count : 0;
        const firstClickedAt = Number.isFinite(previous.firstClickedAt) && previous.firstClickedAt
          ? previous.firstClickedAt
          : now;
        clicked[id] = {
          count: previousCount + 1,
          firstClickedAt,
          lastClickedAt: now,
          source
        };
      });

      await storageSet({ [FSB_AGENT_PROVIDERS_STORAGE_KEY]: envelope });
    };

    const result = copyClickMutationTail.then(mutate, mutate);
    copyClickMutationTail = result.catch(() => {});
    return result;
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (_error) {
      // Clipboard failure is non-fatal; the visible command remains selectable.
    }
    document.body.removeChild(textarea);
  }

  function currentProvider() {
    return PROVIDERS.find((provider) => provider.id === state.provider) || PROVIDERS[0];
  }

  function getValidationBaseUrl(provider, localBaseUrl) {
    if (provider === 'openai') return 'https://api.openai.com/v1';
    if (provider === 'lmstudio') return `${localBaseUrl.replace(/\/+$/, '')}/v1`;
    return undefined;
  }

  function normalizeBaseUrl(value) {
    const discovery = globalThis.FSBModelDiscovery;
    if (discovery && typeof discovery.normalizeLmStudioBaseUrl === 'function') {
      return discovery.normalizeLmStudioBaseUrl(value);
    }
    let url = (value || 'http://localhost:1234').trim();
    url = url.replace(/\/v1\/chat\/completions\/?$/i, '');
    url = url.replace(/\/v1\/?$/i, '');
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url || 'http://localhost:1234';
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    state.toast = message;
    renderToast();
    toastTimer = setTimeout(() => {
      state.toast = '';
      renderToast();
    }, 2600);
  }

  function renderToast() {
    if (!els.toast || !els.toastMsg) return;
    els.toastMsg.textContent = state.toast;
    els.toast.classList.toggle('show', !!state.toast);
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = chrome.storage.local.get(keys, (result) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve(result || {});
        });
        if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(patch) {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = chrome.storage.local.set(patch, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
        if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  window.addEventListener('pagehide', () => {
    clearInterval(rollTimer);
    clearTimeout(copiedTimer);
    clearTimeout(toastTimer);
    clearTimeout(fanCloseTimer);
    clearTimeout(hoverTimer);
    clearTimeout(nudgeTimer);
    clearTimeout(acceptTimer);
    if (rafId) cancelAnimationFrame(rafId);
    if (depth) depth.destroy();
  });
})();
