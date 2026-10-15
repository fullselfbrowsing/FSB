(function () {
  'use strict';

  const ASSET_ROOT = '../assets/onboarding';
  const VERSION = chrome.runtime.getManifest().version;
  const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server@latest install';
  const ROTATE_MS = 1800;

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

  const INSTALL_CLIENTS = [
    { id: 'claude-code', name: 'Claude Code', logo: 'claude.svg', flag: '--claude-code', cmd: 'npx -y fsb-mcp-server@latest install --claude-code' },
    { id: 'claude-desktop', name: 'Claude Desktop', logo: 'claude.svg', flag: '--claude-desktop', cmd: 'npx -y fsb-mcp-server@latest install --claude-desktop' },
    { id: 'cursor', name: 'Cursor', logo: 'cursor.svg', flag: '--cursor', cmd: 'npx -y fsb-mcp-server@latest install --cursor' },
    { id: 'vscode', name: 'VS Code', logo: 'vscode.svg', flag: '--vscode', cmd: 'npx -y fsb-mcp-server@latest install --vscode' },
    { id: 'windsurf', name: 'Windsurf', logo: 'windsurf.svg', flag: '--windsurf', cmd: 'npx -y fsb-mcp-server@latest install --windsurf' },
    { id: 'codex', name: 'Codex', logo: 'openai.svg', flag: '--codex', cmd: 'npx -y fsb-mcp-server@latest install --codex' },
    { id: 'opencode', name: 'OpenCode', logo: 'opencode.svg', flag: '--opencode', cmd: 'npx -y fsb-mcp-server@latest install --opencode' },
    { id: 'openclaw', name: 'OpenClaw', logo: 'openclaw.svg', flag: '', cmd: 'npx -y fsb-mcp-server@latest' },
    { id: 'all', name: 'All Clients', logo: 'all.svg', flag: '--all', cmd: 'npx -y fsb-mcp-server@latest install --all' }
  ];

  const ROLL_CLIENTS = INSTALL_CLIENTS.slice(0, 7);
  const ALL_INSTALL_CLIENT_IDS = [
    'claude-code',
    'claude-desktop',
    'cursor',
    'vscode',
    'windsurf',
    'codex',
    'opencode'
  ];
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
    opened: false,
    skipped: false,
    toast: ''
  };

  const els = {};
  let rollTimer = null;
  let rafId = null;
  let copiedTimer = null;
  let toastTimer = null;
  let fanCloseTimer = null;
  let hoverTimer = null;
  let currentWindowId = null;
  let copyClickMutationTail = Promise.resolve();
  let lmstudioDiscoveryGeneration = 0;
  let lmstudioDiscoveryTimer = null;

  globalThis.FSB_ONBOARDING_PROVIDER_KEY_FIELDS = PROVIDER_KEY_FIELDS;
  globalThis.FSB_ONBOARDING_INSTALL_CLIENTS = INSTALL_CLIENTS;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    els.root = document.querySelector('.ob');
    els.screen = document.getElementById('obScreen');
    els.nodes = document.getElementById('obNodes');
    els.trackFill = document.getElementById('obTrackFill');
    els.stepLabel = document.getElementById('obStepLabel');
    els.toast = document.getElementById('obToast');
    els.toastMsg = document.getElementById('obToastMsg');

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

  function route() {
    if (state.path === 'mcp') return ['welcome', 'path', 'mcp', 'pin', 'done'];
    if (state.path === 'byok') return ['welcome', 'path', 'provider', 'apikey', 'pin', 'done'];
    return ['welcome', 'path', 'setup', 'pin', 'done'];
  }

  function render() {
    els.root.dataset.theme = state.theme;

    renderStepper();
    if (state.screen === 'welcome') renderWelcome();
    else if (state.screen === 'path') renderPath();
    else if (state.screen === 'mcp') renderMcp();
    else if (state.screen === 'provider') renderProvider();
    else if (state.screen === 'apikey') renderApiKey();
    else if (state.screen === 'pin') renderPin();
    else renderDone();

    renderToast();
  }

  function renderStepper() {
    const r = route();
    const currentIndex = Math.max(0, r.indexOf(state.screen));
    els.stepLabel.textContent = ob('entry_step', 'Step $CURRENT$ of $TOTAL$', { current: currentIndex + 1, total: r.length });
    els.trackFill.style.width = r.length > 1 ? `${Math.round((currentIndex / (r.length - 1)) * 100)}%` : '0%';
    els.nodes.innerHTML = r.map((step, index) => {
      const done = index < currentIndex;
      const cls = done ? 'done click' : index === currentIndex ? 'active' : '';
      const content = done ? '<i class="fa-solid fa-check"></i>' : String(index + 1);
      return `<button class="ob-node ${cls}" type="button" data-step="${escapeAttr(step)}" ${done ? '' : 'disabled'}>${content}<span class="ob-node-lab">${escapeHtml(stepLabel(step))}</span></button>`;
    }).join('');
    els.nodes.querySelectorAll('.ob-node.click').forEach((button) => {
      button.addEventListener('click', () => {
        state.screen = button.dataset.step;
        render();
      });
    });
  }

  function renderWelcome() {
    els.screen.innerHTML = `
      <div class="ob-screen ob-welcome">
        <h1>${escapeHtml(ob('entry_future_lead', 'The future of'))} <span class="highlight">${escapeHtml(ob('entry_future_word', 'autonomous'))}</span> ${escapeHtml(ob('entry_future_tail', 'browsing.'))}</h1>
        <p class="ob-sub">${escapeHtml(ob('entry_welcome_sub', "You made the right call. Your agents are about to experience the best autonomous browsing engine of their lifetime. Pure DOM precision, no vision, no guessing. They'll never go back to clicking blind."))}</p>
        <div class="ob-feat-row">
          <div class="ob-feat"><i class="fa-solid fa-bolt"></i><b>${escapeHtml(ob('entry_feat_api', 'Direct API'))}</b><span>${escapeHtml(ob('entry_feat_api_sub', 'Talks to apps, not just clicks'))}</span></div>
          <div class="ob-feat"><i class="fa-solid fa-compass"></i><b>${escapeHtml(ob('entry_feat_guides', '130+ guides'))}</b><span>${escapeHtml(ob('entry_feat_guides_sub', 'Across 17 categories'))}</span></div>
          <div class="ob-feat"><i class="fa-solid fa-plug"></i><b>${escapeHtml(ob('entry_feat_tools', '68 MCP tools'))}</b><span>${escapeHtml(ob('entry_feat_tools_sub', 'From your coding agent'))}</span></div>
        </div>
        <div class="ob-nav ob-nav-center"><button class="ob-btn ob-btn-primary ob-btn-wide" id="obGetStarted" type="button">${escapeHtml(ob('entry_get_started', 'Get started'))} <i class="fa-solid fa-arrow-right"></i></button></div>
        <button class="ob-skip ob-skip-center" id="obWelcomeSkip" type="button">${escapeHtml(ob('entry_skip_setup', 'Skip setup for now'))}</button>
        <div class="ob-welcome-ver"><span class="version-tag" translate="no">v${escapeHtml(VERSION)}</span></div>
      </div>
    `;
    bind('#obGetStarted', 'click', goNext);
    bind('#obWelcomeSkip', 'click', () => finishOnboarding({ skipped: true, path: null }));
  }

  function renderPath() {
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">${escapeHtml(ob('entry_pick_path', 'Pick Your Path'))}</div>
        <h2 class="ob-h">${escapeHtml(ob('entry_how_run', 'How do you want to run FSB?'))}</h2>
        <p class="ob-sub">${escapeHtml(ob('entry_two_ways', 'Two ways in. Set up one now and add the other anytime in Settings.'))}</p>
        <div class="ob-paths">
          <button class="ob-path ${state.path === 'mcp' ? 'sel' : ''}" type="button" id="obPickMcp">
            <div class="ob-path-ic"><i class="fa-solid fa-plug"></i></div>
            <div class="ob-path-body">
              <div class="ob-path-head"><span class="ob-path-name">${escapeHtml(ob('entry_agent', 'Agent'))}</span><span class="ob-badge">${escapeHtml(ob('entry_recommended', 'Recommended'))}</span></div>
              <div class="ob-path-desc">${escapeHtml(ob('entry_agent_desc', 'Use FSB as an MCP server in Claude Code, Cursor, VS Code, OpenClaw and more. 68 tools, no API key, nothing to configure in the browser.'))}</div>
            </div>
            <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
          </button>
          <button class="ob-path ${state.path === 'byok' ? 'sel' : ''}" type="button" id="obPickByok">
            <div class="ob-path-ic"><i class="fa-solid fa-comments"></i></div>
            <div class="ob-path-body">
              <div class="ob-path-head"><span class="ob-path-name">${escapeHtml(ob('entry_in_browser', 'In this browser'))}</span><span class="ob-badge-soft">${escapeHtml(ob('entry_byok', 'BYOK'))}</span></div>
              <div class="ob-path-desc">${escapeHtml(ob('entry_byok_desc', 'Chat with FSB in the side panel. Bring your own key from xAI, Anthropic or Google, or run a local model with no key at all.'))}</div>
            </div>
            <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
          </button>
        </div>
        <div class="ob-note"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(ob('entry_most_people', 'Most people start with MCP, the fastest and cheapest way to use FSB.'))}</div>
        ${navHtml({ nextDisabled: !state.path, skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obSkipPath' })}
      </div>
    `;
    bind('#obPickMcp', 'click', () => { state.path = 'mcp'; render(); });
    bind('#obPickByok', 'click', () => { state.path = 'byok'; render(); });
    bindNav();
    bind('#obSkipPath', 'click', () => { state.path = 'mcp'; state.screen = 'mcp'; render(); });
  }

  function renderMcp() {
    const current = ROLL_CLIENTS[state.iconIndex];
    const half = Math.ceil(INSTALL_CLIENTS.length / 2);
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">${escapeHtml(ob('entry_mcp_eyebrow', 'Recommended Path / MCP'))}</div>
        <h2 class="ob-h">${escapeHtml(ob('entry_install_h', 'Install the FSB MCP server'))}</h2>
        <p class="ob-sub">${escapeHtml(ob('entry_one_command', 'One command. Pick your agent. FSB registers itself automatically. No API key needed.'))}</p>
        <div class="install-widget" id="obInstallWidget" style="margin-top:18px">
          <div class="install-label">${escapeHtml(ob('entry_one_command_short', 'One command. Pick your agent.'))}</div>
          <div class="install-bar">
            <span class="install-mark ${state.morphing ? 'is-morphing' : ''}"><span class="install-glyph" role="img" aria-label="${escapeAttr(current.name)}" style="${maskStyle(current.logo)}"></span></span>
            <button class="install-cmd" type="button" id="obCopyCurrent" title="${escapeAttr(ob('entry_copy_command', 'Copy command'))}">
              <span class="install-base" translate="no">${BASE_INSTALL_COMMAND}</span>
              <span class="install-flag ${state.morphing ? 'is-morphing' : ''}" translate="no">${escapeHtml(state.token)}</span>
            </button>
            <div class="install-copy-wrap" id="obCopyWrap">
              <button class="install-copy ${state.copied === 'current' ? 'copied' : ''}" type="button" id="obCopyIcon" aria-label="${escapeAttr(ob('entry_copy_install', 'Copy install command'))}"><i class="${state.copied === 'current' ? 'fa-solid fa-check' : 'fa-regular fa-copy'}"></i></button>
              ${fanHtml(INSTALL_CLIENTS.slice(0, half), 'install-fan-up', -1)}
              ${fanHtml(INSTALL_CLIENTS.slice(half), 'install-fan-down', 1)}
            </div>
          </div>
        </div>
        <div class="ob-mcp-steps">
          <div class="ob-mcp-step"><span class="n">1</span><span>${escapeHtml(ob('entry_mcp_1a', 'Run the command in your terminal.'))} <b>${escapeHtml(ob('entry_mcp_1b', 'Hover copy'))}</b> ${escapeHtml(ob('entry_mcp_1c', 'to pick a specific client.'))}</span></div>
          <div class="ob-mcp-step"><span class="n">2</span><span>${escapeHtml(ob('entry_mcp_2a', "FSB writes itself into your agent's MCP config."))} <b>${escapeHtml(ob('entry_mcp_2b', '68 tools'))}</b>${escapeHtml(ob('entry_mcp_2c', ', zero manual JSON.'))}</span></div>
          <div class="ob-mcp-step"><span class="n">3</span><span>${escapeHtml(ob('entry_mcp_3', "Ask your agent to browse. It drives FSB's DOM engine for you."))}</span></div>
        </div>
        <a class="ob-claw" href="#" id="obOpenClaw">
          <span class="ob-claw-ic"><span class="install-glyph" role="img" aria-label="OpenClaw" style="${maskStyle('openclaw.svg')}"></span></span>
          <span class="ob-claw-body"><span class="ob-claw-name">${escapeHtml(ob('entry_claw_name', 'Set it up for your Claw'))}</span><span class="ob-claw-desc">${escapeHtml(ob('entry_claw_desc', 'Guided OpenClaw install in the control panel'))}</span></span>
          <i class="fa-solid fa-arrow-up-right-from-square ob-claw-go"></i>
        </a>
        ${navHtml({ skipLabel: ob('entry_prefer_key', 'Prefer your own key?'), skipId: 'obUseByok', skipArrow: true })}
      </div>
    `;
    bindMcpInteractions();
    bindNav();
    bind('#obUseByok', 'click', () => { state.path = 'byok'; state.screen = 'provider'; render(); });
    bind('#obOpenClaw', 'click', (event) => {
      event.preventDefault();
      openInternalPage('ui/control_panel.html#sync');
    });
  }

  function renderProvider() {
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">${escapeHtml(ob('entry_byok_eyebrow', 'In-Browser / BYOK'))}</div>
        <h2 class="ob-h">${escapeHtml(ob('entry_choose_provider', 'Choose your AI provider'))}</h2>
        <div class="ob-hint"><i class="fa-solid fa-wand-magic-sparkles"></i><div class="ob-hint-body"><b>${escapeHtml(ob('entry_dont_need', "You don't actually need this."))}</b> ${escapeHtml(ob('entry_best_way', 'The best way to run FSB is through MCP. No key, no cost ceiling.'))} <button class="ob-link" type="button" id="obUseMcpFromProvider">${escapeHtml(ob('entry_setup_mcp', 'Set up MCP instead'))}</button></div></div>
        <div class="ob-providers">
          ${PROVIDERS.map(providerButtonHtml).join('')}
          <div class="ob-prov-note"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(ob('entry_once_key', 'Once your key is set, FSB lists every available text model automatically.'))}</div>
        </div>
        ${navHtml({ skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obUseMcpFromProviderSkip' })}
      </div>
    `;
    PROVIDERS.forEach((provider) => {
      bind(`#obProvider-${provider.id}`, 'click', () => selectProvider(provider.id));
    });
    bind('#obUseMcpFromProvider', 'click', useMcp);
    bind('#obUseMcpFromProviderSkip', 'click', useMcp);
    bindNav({ beforeNext: persistProviderSelection });
  }

  function renderApiKey() {
    const provider = currentProvider();
    const local = !!provider.local;
    const localSelectionReady = !local || (
      state.lmstudioDiscoveryStatus === 'ready'
      && !!state.lmstudioModel
    );
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">${escapeHtml(ob('entry_byok_eyebrow', 'In-Browser / BYOK'))}</div>
        <h2 class="ob-h">${escapeHtml(ob('entry_key_heading', 'Add your $NAME$ key', { name: provider.name }))}</h2>
        <div class="ob-optional-card"><i class="fa-solid fa-circle-info oc-ic"></i><div class="oc-body"><b>${escapeHtml(ob('entry_optional', 'This step is optional.'))}</b> ${escapeHtml(ob('entry_shines', 'FSB shines brightest through MCP, so you can skip the key entirely.'))} <button class="ob-link" type="button" id="obUseMcpFromKey">${escapeHtml(ob('entry_skip_use_mcp', 'Skip and use MCP'))}</button></div></div>
        ${local ? localFieldHtml() : apiKeyFieldHtml(provider)}
        ${navHtml({ nextLabel: state.validating ? ob('entry_checking', 'Checking...') : ob('entry_continue', 'Continue'), nextDisabled: state.validating || !localSelectionReady, skipLabel: ob('entry_skip_mcp', 'Skip to MCP'), skipId: 'obUseMcpFromKeySkip' })}
      </div>
    `;
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
      const nextButton = els.screen.querySelector('#obNext');
      if (nextButton) nextButton.disabled = !state.lmstudioModel;
    });
    bind('#obRevealKey', 'click', () => { state.revealed = !state.revealed; render(); });
    bind('#obPasteKey', 'click', pasteFromClipboard);
    bindNav({ beforeNext: validateAndContinue });
    if (local && state.lmstudioDiscoveryStatus === 'idle' && lmstudioDiscoveryTimer === null) {
      void discoverLmStudioModels();
    }
  }

  function renderPin() {
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">${escapeHtml(ob('entry_almost', 'Almost There'))}</div>
        <h2 class="ob-h">${escapeHtml(ob('entry_pin_h', "Pin FSB so it's one click away"))}</h2>
        <p class="ob-sub">${escapeHtml(ob('entry_pin_sub', "That's the only step. FSB's permissions switch on automatically the moment Chrome installs it. Nothing for you to toggle."))}</p>
        <div class="ob-toolbar">
          <div class="ob-tb-dots"><span></span><span></span><span></span></div>
          <div class="ob-tb-omni"><i class="fa-solid fa-lock"></i> full-selfbrowsing.com</div>
          <div class="ob-tb-puzzle ${state.pinned ? '' : 'pulse'}">
            <i class="fa-solid fa-puzzle-piece"></i>
            <div class="ob-pin-pop">
              <div class="ob-pin-row hl"><img class="pi" src="${ASSET_ROOT}/icon48.png" alt="FSB" width="20" height="20"><span class="pn" translate="no">FSB</span><i class="fa-solid fa-thumbtack pp ${state.pinned ? 'on' : ''}"></i></div>
              <div class="ob-pin-row"><span class="pi"></span><span class="pn" style="color:var(--text-muted)">${escapeHtml(ob('entry_other_ext', 'Other extension'))}</span></div>
            </div>
          </div>
        </div>
        <button class="ob-confirm ${state.pinned ? 'done' : ''}" type="button" id="obPinned"><i class="fa-solid fa-thumbtack"></i> ${escapeHtml(state.pinned ? ob('entry_pinned', 'FSB pinned') : ob('entry_ive_pinned', "I've pinned FSB"))}</button>
        ${navHtml({ skipLabel: ob('entry_skip_step', 'Skip this step'), skipId: 'obSkipPin' })}
      </div>
    `;
    bind('#obPinned', 'click', () => { state.pinned = !state.pinned; render(); });
    bind('#obSkipPin', 'click', goNext);
    bindNav();
  }

  function renderDone() {
    const summary = getSummary();
    els.screen.innerHTML = `
      <div class="ob-screen ob-done">
        <div class="ob-done-top">
          <div class="ob-done-badge"><i class="fa-solid fa-check"></i></div>
          <h2 class="ob-h" style="margin-bottom:0">${escapeHtml(ob('entry_all_set', "You're all set."))}</h2>
          <p class="ob-sub">${escapeHtml(ob('entry_ready_sub', "FSB is ready. Here's your setup. Change anything later in Settings."))}</p>
        </div>
        <div class="ob-summary">
          ${summary.map((row) => `<div class="ob-sum-row"><span class="ob-sum-k">${escapeHtml(row.k)}</span><span class="ob-sum-v ${row.mono ? 'mono' : ''}">${row.ok ? '<i class="fa-solid fa-circle-check vok"></i>' : ''}${escapeHtml(row.v)}</span></div>`).join('')}
        </div>
        <button class="ob-btn ob-btn-primary ob-btn-block ${state.opened ? 'done' : ''}" id="obOpenFsb" type="button"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(state.opened ? ob('entry_running', 'FSB is running') : ob('entry_open', 'Open FSB'))}</button>
        <div class="ob-done-more"><i class="fa-solid fa-sliders"></i> ${escapeHtml(ob('entry_more', "There's always much more to discover about FSB. Check it out in the"))} <button class="ob-link" type="button" id="obOpenPanel">${escapeHtml(ob('entry_control_panel', 'Control Panel'))}</button>.</div>
        <div class="ob-done-links">
          <a href="https://github.com/fullselfbrowsing/FSB" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>
          <a href="https://discord.gg/fullselfbrowsing" target="_blank" rel="noopener"><i class="fa-brands fa-discord"></i> Discord</a>
          <a href="https://full-selfbrowsing.com" target="_blank" rel="noopener"><i class="fa-solid fa-book"></i> ${escapeHtml(ob('entry_docs', 'Docs'))}</a>
        </div>
      </div>
    `;
    bind('#obOpenFsb', 'click', openFsb);
    bind('#obOpenPanel', 'click', () => openInternalPage('ui/control_panel.html'));
  }

  function navHtml(options = {}) {
    const nextLabel = options.nextLabel || ob('entry_continue', 'Continue');
    const skipLabel = options.skipLabel || '';
    const skip = skipLabel ? `<button class="ob-skip" type="button" id="${escapeAttr(options.skipId)}">${escapeHtml(skipLabel)}${options.skipArrow ? ' &rarr;' : ''}</button>` : '';
    return `
      <div class="ob-nav">
        <button class="ob-back" type="button" id="obBack"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(ob('entry_back', 'Back'))}</button>
        <div class="ob-nav-r">
          ${skip}
          <button class="ob-btn ob-btn-primary" type="button" id="obNext" ${options.nextDisabled ? 'disabled' : ''}>${escapeHtml(nextLabel)} <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    `;
  }

  function bindNav(options = {}) {
    bind('#obBack', 'click', goBack);
    bind('#obNext', 'click', async () => {
      if (options.beforeNext) {
        const ok = await options.beforeNext();
        if (ok === false) return;
      }
      goNext();
    });
  }

  function fanHtml(clients, placementClass, direction) {
    return `<div class="install-fan ${placementClass} ${state.fanOpen ? 'open' : ''}" role="menu">
      ${clients.map((client, index) => {
        const t = clients.length > 1 ? index / (clients.length - 1) : 0;
        const dx = -Math.round((1 - Math.cos(t * (Math.PI * 0.42))) * 60);
        const rot = (direction * t * 6).toFixed(1);
        return `
          <button class="install-fan-item ${state.copied === client.id ? 'copied' : ''}" type="button" role="menuitem" data-copy-client="${escapeAttr(client.id)}" style="--dx:${dx}px;--rot:${rot}deg">
            <span class="install-fan-icon"><span class="install-glyph" role="img" aria-label="${escapeAttr(client.name)}" style="${maskStyle(client.logo)}"></span></span>
            <span class="install-fan-name" translate="no">${escapeHtml(client.name)}</span>
            <span class="install-fan-flag" translate="no">${escapeHtml(client.flag || 'manual')}</span>
            <i class="install-fan-copyicon ${state.copied === client.id ? 'fa-solid fa-check' : 'fa-regular fa-copy'}"></i>
          </button>
        `;
      }).join('')}
    </div>`;
  }

  function providerButtonHtml(provider) {
    const selected = state.provider === provider.id ? 'sel' : '';
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
      <button class="ob-prov ${selected}" type="button" id="obProvider-${escapeAttr(provider.id)}">
        <div class="ob-prov-ic">${icon}</div>
        <div class="ob-prov-body"><div class="ob-prov-name" translate="no">${escapeHtml(provider.name)}</div></div>
        ${tag}
        <div class="ob-prov-radio"></div>
      </button>
    `;
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

  // In-place status reset for the key/URL inputs. A full render() on every
  // keystroke rebuilds els.screen.innerHTML, destroying the focused input --
  // the caret jumps out after each character. Only the status icon + message
  // depend on keystrokes (Continue's disabled state keys on state.validating
  // alone), so update those two nodes surgically and leave the input alone.
  function resetKeyStatusIdle() {
    state.keyStatus = 'idle';
    state.keyMessage = '';
    const provider = currentProvider();
    const icon = els.screen.querySelector('.ob-status');
    const msgEl = els.screen.querySelector('.ob-status-msg');
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
          <div class="ob-input-wrap"><input class="ob-input" id="obLocalUrlInput" value="${escapeAttr(state.lmstudioBaseUrl)}" spellcheck="false"></div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <label class="ob-model-label" for="obLocalModelSelect">${escapeHtml(ob('entry_loaded_model', 'Loaded chat model'))}</label>
        <select class="ob-input ob-model-select" id="obLocalModelSelect" ${state.lmstudioModels.length === 0 || discovering ? 'disabled' : ''}>
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
            <input class="ob-input" id="obKeyInput" type="${state.revealed ? 'text' : 'password'}" value="${escapeAttr(state.apiKey)}" placeholder="${escapeAttr(ob('entry_paste_key', 'Paste your $NAME$ API key', { name: provider.name }))}" spellcheck="false" autocomplete="off">
            <button class="ob-eye" type="button" id="obRevealKey" aria-label="${escapeAttr(ob('entry_toggle_key', 'Toggle key visibility'))}"><i class="${state.revealed ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"></i></button>
          </div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <div class="ob-status-msg ${statusClass}">${escapeHtml(msg)}</div>
        <div class="ob-help">${escapeHtml(ob('entry_get_key', 'Get your key from'))} <a href="${escapeAttr(provider.keyUrl)}" target="_blank" rel="noopener">${escapeHtml(provider.urlName)}</a> - ${escapeHtml(ob('entry_stored_locally', 'stored locally in your browser.'))} <button class="ob-mini" type="button" id="obPasteKey">${escapeHtml(ob('entry_paste_clip', 'Paste from clipboard'))}</button></div>
      </div>
    `;
  }

  // Surgical open/close for the install-fan menu. A full render() on hover
  // rebuilds els.screen.innerHTML, replacing the .install-fan nodes with new
  // ones that already have (or lack) the "open" class from first paint --
  // the CSS transition never sees a "before" frame, so it snaps instead of
  // animating. Toggle the class on the existing nodes instead so the
  // transition has something to interpolate from.
  function setFanOpen(open) {
    els.screen.querySelectorAll('.install-fan').forEach((fan) => fan.classList.toggle('open', open));
  }

  function bindMcpInteractions() {
    const current = ROLL_CLIENTS[state.iconIndex];
    bind('#obCopyCurrent', 'click', () => copyCommand(BASE_INSTALL_COMMAND + ' ' + current.flag, 'current'));
    bind('#obCopyIcon', 'click', () => copyCommand(BASE_INSTALL_COMMAND + ' ' + current.flag, 'current'));
    bind('#obInstallWidget', 'mouseenter', () => { state.paused = true; });
    bind('#obInstallWidget', 'mouseleave', () => { state.paused = false; });
    bind('#obCopyWrap', 'mouseenter', () => {
      clearTimeout(hoverTimer);
      clearTimeout(fanCloseTimer);
      hoverTimer = setTimeout(() => { state.fanOpen = true; setFanOpen(true); }, 420);
    });
    bind('#obCopyWrap', 'mouseleave', () => {
      clearTimeout(hoverTimer);
      clearTimeout(fanCloseTimer);
      fanCloseTimer = setTimeout(() => { state.fanOpen = false; setFanOpen(false); }, 260);
    });
    els.screen.querySelectorAll('[data-copy-client]').forEach((button) => {
      button.addEventListener('click', () => {
        const client = INSTALL_CLIENTS.find((item) => item.id === button.dataset.copyClient);
        if (client) copyCommand(client.cmd, client.id);
      });
    });
  }

  function goNext() {
    const r = route();
    const index = r.indexOf(state.screen);
    if (index >= 0 && index < r.length - 1) {
      state.screen = r[index + 1];
      if (state.screen === 'done') {
        finishOnboarding({ skipped: false, path: state.path }, { renderDone: false });
      }
      render();
    }
  }

  function goBack() {
    const r = route();
    const index = r.indexOf(state.screen);
    if (index > 0) {
      state.screen = r[index - 1];
      render();
    }
  }

  async function selectProvider(providerId) {
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

  async function persistProviderSelection() {
    // Provider choices are staged in onboarding state. Persisting the provider
    // before its model is discovered creates an invalid provider/model pair if
    // the user closes onboarding midway through setup.
    return true;
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
      if (!state.lmstudioModel
          || !state.lmstudioModels.some(model => model.id === state.lmstudioModel)) {
        state.keyStatus = 'invalid';
        state.keyMessage = obExact('Select a loaded LM Studio chat model');
        render();
        return false;
      }
    }

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

    try {
      await validateProvider(provider.id, {
        apiKey: provider.local ? '' : key,
        model: provider.local ? state.lmstudioModel : (PROVIDER_MODELS[provider.id] || ''),
        baseUrl: getValidationBaseUrl(provider.id, baseUrl)
      });
      await storageSet(patch);
      state.validating = false;
      state.keyStatus = 'valid';
      state.keyMessage = provider.local ? obExact('LM Studio responded successfully') : ob('entry_key_valid', 'Key ending in $LAST$ is valid', { last: key.slice(-4) });
      return true;
    } catch (error) {
      state.validating = false;
      state.keyStatus = 'invalid';
      state.keyMessage = error && error.message ? error.message : obExact('Connection test failed');
      render();
      return false;
    }
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

    state.opened = true;
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
        { k: ob('entry_sum_tools', 'Tools'), v: ob('entry_sum_68', '68 available') },
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

  function maskStyle(fileName) {
    const url = `${ASSET_ROOT}/providers/${fileName}`;
    return `-webkit-mask-image:url('${url}');mask-image:url('${url}')`;
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

  function bind(selector, eventName, handler) {
    const el = els.screen.querySelector(selector) || document.querySelector(selector);
    if (el) el.addEventListener(eventName, handler);
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
    if (rafId) cancelAnimationFrame(rafId);
  });
})();
