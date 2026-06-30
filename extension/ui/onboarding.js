(function () {
  'use strict';

  const ASSET_ROOT = '../assets/onboarding';
  const VERSION = chrome.runtime.getManifest().version;
  const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server install';
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
    { id: 'claude-code', name: 'Claude Code', logo: 'claude.svg', flag: '--claude-code', cmd: 'npx -y fsb-mcp-server install --claude-code' },
    { id: 'claude-desktop', name: 'Claude Desktop', logo: 'claude.svg', flag: '--claude-desktop', cmd: 'npx -y fsb-mcp-server install --claude-desktop' },
    { id: 'cursor', name: 'Cursor', logo: 'cursor.svg', flag: '--cursor', cmd: 'npx -y fsb-mcp-server install --cursor' },
    { id: 'vscode', name: 'VS Code', logo: 'vscode.svg', flag: '--vscode', cmd: 'npx -y fsb-mcp-server install --vscode' },
    { id: 'windsurf', name: 'Windsurf', logo: 'windsurf.svg', flag: '--windsurf', cmd: 'npx -y fsb-mcp-server install --windsurf' },
    { id: 'codex', name: 'Codex', logo: 'openai.svg', flag: '--codex', cmd: 'npx -y fsb-mcp-server install --codex' },
    { id: 'opencode', name: 'OpenCode', logo: 'opencode.svg', flag: '--opencode', cmd: 'npx -y fsb-mcp-server install --opencode' },
    { id: 'openclaw', name: 'OpenClaw', logo: 'openclaw.svg', flag: '', cmd: 'npx -y fsb-mcp-server' },
    { id: 'all', name: 'All Clients', logo: 'all.svg', flag: '--all', cmd: 'npx -y fsb-mcp-server install --all' }
  ];

  const ROLL_CLIENTS = INSTALL_CLIENTS.slice(0, 7);
  const STEP_LABELS = { welcome: 'Welcome', path: 'Path', mcp: 'MCP', provider: 'Provider', apikey: 'API Key', setup: 'Setup', pin: 'Pin', done: 'Done' };

  const state = {
    theme: 'dark',
    screen: 'welcome',
    path: null,
    provider: 'xai',
    apiKey: '',
    lmstudioBaseUrl: 'http://localhost:1234',
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

  globalThis.FSB_ONBOARDING_PROVIDER_KEY_FIELDS = PROVIDER_KEY_FIELDS;
  globalThis.FSB_ONBOARDING_INSTALL_CLIENTS = INSTALL_CLIENTS;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    els.root = document.querySelector('.ob');
    els.screen = document.getElementById('obScreen');
    els.nodes = document.getElementById('obNodes');
    els.trackFill = document.getElementById('obTrackFill');
    els.stepLabel = document.getElementById('obStepLabel');
    els.themeToggle = document.getElementById('obThemeToggle');
    els.toast = document.getElementById('obToast');
    els.toastMsg = document.getElementById('obToastMsg');

    await loadInitialState();
    els.themeToggle.addEventListener('click', toggleTheme);
    render();
    rollTimer = setInterval(advanceInstallClient, ROTATE_MS);
  }

  async function loadInitialState() {
    try {
      const data = await storageGet(['modelProvider', 'lmstudioBaseUrl', 'fsbOnboardingTheme']);
      if (data.fsbOnboardingTheme === 'light' || data.fsbOnboardingTheme === 'dark') {
        state.theme = data.fsbOnboardingTheme;
      }
      if (data.modelProvider && PROVIDER_MODELS[data.modelProvider] !== undefined) {
        state.provider = data.modelProvider;
      }
      if (data.lmstudioBaseUrl) {
        state.lmstudioBaseUrl = data.lmstudioBaseUrl;
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
    els.themeToggle.innerHTML = `<i class="${state.theme === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon'}"></i>`;

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
    els.stepLabel.textContent = `Step ${currentIndex + 1} of ${r.length}`;
    els.trackFill.style.width = r.length > 1 ? `${Math.round((currentIndex / (r.length - 1)) * 100)}%` : '0%';
    els.nodes.innerHTML = r.map((step, index) => {
      const done = index < currentIndex;
      const cls = done ? 'done click' : index === currentIndex ? 'active' : '';
      const content = done ? '<i class="fa-solid fa-check"></i>' : String(index + 1);
      return `<button class="ob-node ${cls}" type="button" data-step="${escapeAttr(step)}" ${done ? '' : 'disabled'}>${content}<span class="ob-node-lab">${STEP_LABELS[step]}</span></button>`;
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
        <h1>The future of <span class="highlight">autonomous</span> browsing.</h1>
        <p class="ob-sub">You made the right call. Your agents are about to experience the best autonomous browsing engine of their lifetime. Pure DOM precision, no vision, no guessing. They'll never go back to clicking blind.</p>
        <div class="ob-feat-row">
          <div class="ob-feat"><i class="fa-solid fa-bolt"></i><b>Direct API</b><span>Talks to apps, not just clicks</span></div>
          <div class="ob-feat"><i class="fa-solid fa-compass"></i><b>130+ guides</b><span>Across 17 categories</span></div>
          <div class="ob-feat"><i class="fa-solid fa-plug"></i><b>66 MCP tools</b><span>From your coding agent</span></div>
        </div>
        <div class="ob-nav ob-nav-center"><button class="ob-btn ob-btn-primary ob-btn-wide" id="obGetStarted" type="button">Get started <i class="fa-solid fa-arrow-right"></i></button></div>
        <button class="ob-skip ob-skip-center" id="obWelcomeSkip" type="button">Skip setup for now</button>
        <div class="ob-welcome-ver"><span class="version-tag" translate="no">v${escapeHtml(VERSION)}</span></div>
      </div>
    `;
    bind('#obGetStarted', 'click', goNext);
    bind('#obWelcomeSkip', 'click', () => finishOnboarding({ skipped: true, path: null }));
  }

  function renderPath() {
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">Pick Your Path</div>
        <h2 class="ob-h">How do you want to run FSB?</h2>
        <p class="ob-sub">Two ways in. Set up one now and add the other anytime in Settings.</p>
        <div class="ob-paths">
          <button class="ob-path ${state.path === 'mcp' ? 'sel' : ''}" type="button" id="obPickMcp">
            <div class="ob-path-ic"><i class="fa-solid fa-plug"></i></div>
            <div class="ob-path-body">
              <div class="ob-path-head"><span class="ob-path-name">Agent</span><span class="ob-badge">Recommended</span></div>
              <div class="ob-path-desc">Use FSB as an MCP server in Claude Code, Cursor, VS Code, OpenClaw and more. 66 tools, no API key, nothing to configure in the browser.</div>
            </div>
            <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
          </button>
          <button class="ob-path ${state.path === 'byok' ? 'sel' : ''}" type="button" id="obPickByok">
            <div class="ob-path-ic"><i class="fa-solid fa-comments"></i></div>
            <div class="ob-path-body">
              <div class="ob-path-head"><span class="ob-path-name">In this browser</span><span class="ob-badge-soft">BYOK</span></div>
              <div class="ob-path-desc">Chat with FSB in the side panel. Bring your own key from xAI, Anthropic or Google, or run a local model with no key at all.</div>
            </div>
            <div class="ob-path-check"><i class="fa-solid fa-check"></i></div>
          </button>
        </div>
        <div class="ob-note"><i class="fa-solid fa-circle-info"></i> Most people start with MCP, the fastest and cheapest way to use FSB.</div>
        ${navHtml({ nextDisabled: !state.path, skipLabel: 'Skip to MCP', skipId: 'obSkipPath' })}
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
        <div class="ob-eyebrow">Recommended Path / MCP</div>
        <h2 class="ob-h">Install the FSB MCP server</h2>
        <p class="ob-sub">One command. Pick your agent. FSB registers itself automatically. No API key needed.</p>
        <div class="install-widget" id="obInstallWidget" style="margin-top:18px">
          <div class="install-label">One command. Pick your agent.</div>
          <div class="install-bar">
            <span class="install-mark ${state.morphing ? 'is-morphing' : ''}"><span class="install-glyph" role="img" aria-label="${escapeAttr(current.name)}" style="${maskStyle(current.logo)}"></span></span>
            <button class="install-cmd" type="button" id="obCopyCurrent" title="Copy command">
              <span class="install-base" translate="no">${BASE_INSTALL_COMMAND}</span>
              <span class="install-flag ${state.morphing ? 'is-morphing' : ''}" translate="no">${escapeHtml(state.token)}</span>
            </button>
            <div class="install-copy-wrap" id="obCopyWrap">
              <button class="install-copy ${state.copied === 'current' ? 'copied' : ''}" type="button" id="obCopyIcon" aria-label="Copy install command"><i class="${state.copied === 'current' ? 'fa-solid fa-check' : 'fa-regular fa-copy'}"></i></button>
              ${fanHtml(INSTALL_CLIENTS.slice(0, half), 'install-fan-up', -1)}
              ${fanHtml(INSTALL_CLIENTS.slice(half), 'install-fan-down', 1)}
            </div>
          </div>
        </div>
        <div class="ob-mcp-steps">
          <div class="ob-mcp-step"><span class="n">1</span><span>Run the command in your terminal. <b>Hover copy</b> to pick a specific client.</span></div>
          <div class="ob-mcp-step"><span class="n">2</span><span>FSB writes itself into your agent's MCP config. <b>66 tools</b>, zero manual JSON.</span></div>
          <div class="ob-mcp-step"><span class="n">3</span><span>Ask your agent to browse. It drives FSB's DOM engine for you.</span></div>
        </div>
        <a class="ob-claw" href="#" id="obOpenClaw">
          <span class="ob-claw-ic"><span class="install-glyph" role="img" aria-label="OpenClaw" style="${maskStyle('openclaw.svg')}"></span></span>
          <span class="ob-claw-body"><span class="ob-claw-name">Set it up for your Claw</span><span class="ob-claw-desc">Guided OpenClaw install in the control panel</span></span>
          <i class="fa-solid fa-arrow-up-right-from-square ob-claw-go"></i>
        </a>
        ${navHtml({ skipLabel: 'Prefer your own key?', skipId: 'obUseByok', skipArrow: true })}
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
        <div class="ob-eyebrow">In-Browser / BYOK</div>
        <h2 class="ob-h">Choose your AI provider</h2>
        <div class="ob-hint"><i class="fa-solid fa-wand-magic-sparkles"></i><div class="ob-hint-body"><b>You don't actually need this.</b> The best way to run FSB is through MCP. No key, no cost ceiling. <button class="ob-link" type="button" id="obUseMcpFromProvider">Set up MCP instead</button></div></div>
        <div class="ob-providers">
          ${PROVIDERS.map(providerButtonHtml).join('')}
          <div class="ob-prov-note"><i class="fa-solid fa-circle-info"></i> Once your key is set, FSB lists every available text model automatically.</div>
        </div>
        ${navHtml({ skipLabel: 'Skip to MCP', skipId: 'obUseMcpFromProviderSkip' })}
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
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">In-Browser / BYOK</div>
        <h2 class="ob-h">Add your <span translate="no">${escapeHtml(provider.name)}</span> key</h2>
        <div class="ob-optional-card"><i class="fa-solid fa-circle-info oc-ic"></i><div class="oc-body"><b>This step is optional.</b> FSB shines brightest through MCP, so you can skip the key entirely. <button class="ob-link" type="button" id="obUseMcpFromKey">Skip and use MCP</button></div></div>
        ${local ? localFieldHtml() : apiKeyFieldHtml(provider)}
        ${navHtml({ nextLabel: state.validating ? 'Checking...' : 'Continue', nextDisabled: state.validating, skipLabel: 'Skip to MCP', skipId: 'obUseMcpFromKeySkip' })}
      </div>
    `;
    bind('#obUseMcpFromKey', 'click', useMcp);
    bind('#obUseMcpFromKeySkip', 'click', useMcp);
    bind('#obKeyInput', 'input', (event) => {
      state.apiKey = event.target.value;
      state.keyStatus = 'idle';
      state.keyMessage = '';
      render();
    });
    bind('#obLocalUrlInput', 'input', (event) => {
      state.lmstudioBaseUrl = event.target.value;
      state.keyStatus = 'idle';
      state.keyMessage = '';
      render();
    });
    bind('#obRevealKey', 'click', () => { state.revealed = !state.revealed; render(); });
    bind('#obPasteKey', 'click', pasteFromClipboard);
    bindNav({ beforeNext: validateAndContinue });
  }

  function renderPin() {
    els.screen.innerHTML = `
      <div class="ob-screen">
        <div class="ob-eyebrow">Almost There</div>
        <h2 class="ob-h">Pin FSB so it's one click away</h2>
        <p class="ob-sub">That's the only step. FSB's permissions switch on automatically the moment Chrome installs it. Nothing for you to toggle.</p>
        <div class="ob-toolbar">
          <div class="ob-tb-dots"><span></span><span></span><span></span></div>
          <div class="ob-tb-omni"><i class="fa-solid fa-lock"></i> full-selfbrowsing.com</div>
          <div class="ob-tb-puzzle ${state.pinned ? '' : 'pulse'}">
            <i class="fa-solid fa-puzzle-piece"></i>
            <div class="ob-pin-pop">
              <div class="ob-pin-row hl"><img class="pi" src="${ASSET_ROOT}/icon48.png" alt="FSB" width="20" height="20"><span class="pn" translate="no">FSB</span><i class="fa-solid fa-thumbtack pp ${state.pinned ? 'on' : ''}"></i></div>
              <div class="ob-pin-row"><span class="pi"></span><span class="pn" style="color:var(--text-muted)">Other extension</span></div>
            </div>
          </div>
        </div>
        <button class="ob-confirm ${state.pinned ? 'done' : ''}" type="button" id="obPinned"><i class="fa-solid fa-thumbtack"></i> ${state.pinned ? 'FSB pinned' : "I've pinned FSB"}</button>
        ${navHtml({ skipLabel: 'Skip this step', skipId: 'obSkipPin' })}
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
          <h2 class="ob-h" style="margin-bottom:0">You're all set.</h2>
          <p class="ob-sub">FSB is ready. Here's your setup. Change anything later in Settings.</p>
        </div>
        <div class="ob-summary">
          ${summary.map((row) => `<div class="ob-sum-row"><span class="ob-sum-k">${escapeHtml(row.k)}</span><span class="ob-sum-v ${row.mono ? 'mono' : ''}">${row.ok ? '<i class="fa-solid fa-circle-check vok"></i>' : ''}${escapeHtml(row.v)}</span></div>`).join('')}
        </div>
        <button class="ob-btn ob-btn-primary ob-btn-block ${state.opened ? 'done' : ''}" id="obOpenFsb" type="button"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${state.opened ? 'FSB is running' : 'Open FSB'}</button>
        <div class="ob-done-more"><i class="fa-solid fa-sliders"></i> There's always much more to discover about FSB. Check it out in the <button class="ob-link" type="button" id="obOpenPanel">Control Panel</button>.</div>
        <div class="ob-done-links">
          <a href="https://github.com/fullselfbrowsing/FSB" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub</a>
          <a href="https://discord.gg/fullselfbrowsing" target="_blank" rel="noopener"><i class="fa-brands fa-discord"></i> Discord</a>
          <a href="https://full-selfbrowsing.com" target="_blank" rel="noopener"><i class="fa-solid fa-book"></i> Docs</a>
        </div>
      </div>
    `;
    bind('#obOpenFsb', 'click', openFsb);
    bind('#obOpenPanel', 'click', () => openInternalPage('ui/control_panel.html'));
  }

  function navHtml(options = {}) {
    const nextLabel = options.nextLabel || 'Continue';
    const skipLabel = options.skipLabel || '';
    const skip = skipLabel ? `<button class="ob-skip" type="button" id="${escapeAttr(options.skipId)}">${escapeHtml(skipLabel)}${options.skipArrow ? ' &rarr;' : ''}</button>` : '';
    return `
      <div class="ob-nav">
        <button class="ob-back" type="button" id="obBack"><i class="fa-solid fa-arrow-left"></i> Back</button>
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
    const tag = provider.tag ? `<span class="ob-prov-tag ${provider.tagClass || ''}">${escapeHtml(provider.tag)}</span>` : '';
    return `
      <button class="ob-prov ${selected}" type="button" id="obProvider-${escapeAttr(provider.id)}">
        <div class="ob-prov-ic">${icon}</div>
        <div class="ob-prov-body"><div class="ob-prov-name" translate="no">${escapeHtml(provider.name)}</div></div>
        ${tag}
        <div class="ob-prov-radio"></div>
      </button>
    `;
  }

  function localFieldHtml() {
    const statusIcon = state.validating ? '<i class="fa-solid fa-spinner spin"></i>' : state.keyStatus === 'valid' ? '<i class="fa-solid fa-circle-check ok"></i>' : state.keyStatus === 'invalid' ? '<i class="fa-solid fa-circle-xmark bad"></i>' : '<i class="fa-solid fa-circle-check ok"></i>';
    const statusClass = state.keyStatus === 'invalid' ? 'bad' : 'ok';
    const msg = state.keyMessage || 'No API key required. Models load live from /v1/models';
    return `
      <div class="ob-field">
        <div class="ob-input-row">
          <div class="ob-input-wrap"><input class="ob-input" id="obLocalUrlInput" value="${escapeAttr(state.lmstudioBaseUrl)}" spellcheck="false"></div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <div class="ob-status-msg ${statusClass}">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  function apiKeyFieldHtml(provider) {
    const statusIcon = state.validating ? '<i class="fa-solid fa-spinner spin"></i>' : state.keyStatus === 'valid' ? '<i class="fa-solid fa-circle-check ok"></i>' : state.keyStatus === 'invalid' ? '<i class="fa-solid fa-circle-xmark bad"></i>' : '';
    const statusClass = state.keyStatus === 'valid' ? 'ok' : state.keyStatus === 'invalid' ? 'bad' : '';
    const last4 = state.apiKey.slice(-4);
    const msg = state.keyMessage || (state.keyStatus === 'valid' && last4 ? `Key ending in ${last4} is valid` : '');
    return `
      <div class="ob-field">
        <div class="ob-input-row">
          <div class="ob-input-wrap">
            <input class="ob-input" id="obKeyInput" type="${state.revealed ? 'text' : 'password'}" value="${escapeAttr(state.apiKey)}" placeholder="Paste your ${escapeAttr(provider.name)} API key" spellcheck="false" autocomplete="off">
            <button class="ob-eye" type="button" id="obRevealKey" aria-label="Toggle key visibility"><i class="${state.revealed ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}"></i></button>
          </div>
          <div class="ob-status">${statusIcon}</div>
        </div>
        <div class="ob-status-msg ${statusClass}">${escapeHtml(msg)}</div>
        <div class="ob-help">Get your key from <a href="${escapeAttr(provider.keyUrl)}" target="_blank" rel="noopener">${escapeHtml(provider.urlName)}</a> - stored locally in your browser. <button class="ob-mini" type="button" id="obPasteKey">Paste from clipboard</button></div>
      </div>
    `;
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
      hoverTimer = setTimeout(() => { state.fanOpen = true; render(); }, 420);
    });
    bind('#obCopyWrap', 'mouseleave', () => {
      clearTimeout(hoverTimer);
      clearTimeout(fanCloseTimer);
      fanCloseTimer = setTimeout(() => { state.fanOpen = false; render(); }, 260);
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
    await persistProviderSelection();
    render();
  }

  async function persistProviderSelection() {
    const provider = currentProvider();
    const patch = {
      modelProvider: provider.id,
      modelName: PROVIDER_MODELS[provider.id] || ''
    };
    if (provider.id === 'lmstudio') {
      patch.lmstudioBaseUrl = normalizeBaseUrl(state.lmstudioBaseUrl);
    }
    await storageSet(patch);
    return true;
  }

  async function validateAndContinue() {
    const provider = currentProvider();
    const key = state.apiKey.trim();
    const baseUrl = normalizeBaseUrl(state.lmstudioBaseUrl);

    if (!provider.local && !key) {
      state.keyStatus = 'invalid';
      state.keyMessage = `${provider.name} API key is required`;
      render();
      return false;
    }

    state.validating = true;
    state.keyStatus = 'validating';
    state.keyMessage = '';
    render();

    const patch = {
      modelProvider: provider.id,
      modelName: PROVIDER_MODELS[provider.id] || ''
    };
    if (provider.local) {
      patch.lmstudioBaseUrl = baseUrl;
      state.lmstudioBaseUrl = baseUrl;
    } else {
      patch[PROVIDER_KEY_FIELDS[provider.id]] = key;
    }

    try {
      await storageSet(patch);
      await validateProvider(provider.id, {
        apiKey: provider.local ? '' : key,
        model: PROVIDER_MODELS[provider.id] || '',
        baseUrl: getValidationBaseUrl(provider.id, baseUrl)
      });
      state.validating = false;
      state.keyStatus = 'valid';
      state.keyMessage = provider.local ? 'LM Studio responded successfully' : `Key ending in ${key.slice(-4)} is valid`;
      return true;
    } catch (error) {
      state.validating = false;
      state.keyStatus = 'invalid';
      state.keyMessage = error && error.message ? error.message : 'Connection test failed';
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
          reject(new Error((response && response.error) || 'Connection test failed'));
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
      state.keyMessage = state.apiKey ? '' : 'Clipboard did not contain an API key';
    } catch (error) {
      state.keyStatus = 'invalid';
      state.keyMessage = error && error.message ? error.message : 'Clipboard read failed';
    }
    render();
  }

  function openFsb() {
    let openPromise = null;
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        const windowId = chrome.windows && typeof chrome.windows.WINDOW_ID_CURRENT === 'number'
          ? chrome.windows.WINDOW_ID_CURRENT
          : undefined;
        openPromise = chrome.sidePanel.open(windowId !== undefined ? { windowId } : {});
      }
    } catch (error) {
      openPromise = Promise.reject(error);
    }

    state.opened = true;
    showToast('FSB is ready. Opening the side panel');
    render();

    Promise.resolve(openPromise || Promise.reject(new Error('chrome.sidePanel.open unavailable')))
      .then(() => {
        showToast('FSB side panel opened');
      })
      .catch(() => {
        openPopupFallback();
      });
  }

  function openPopupFallback() {
    showToast('Opening FSB in a popup window');
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
        { k: 'Setup', v: 'MCP server' },
        { k: 'Command', v: 'fsb-mcp-server', mono: true },
        { k: 'Tools', v: '66 available' },
        { k: 'Access', v: 'Granted on install', ok: true },
        { k: 'Version', v: `v${VERSION}`, mono: true }
      ];
    }
    if (state.path === 'byok') {
      const provider = currentProvider();
      const keyText = provider.local
        ? 'Local endpoint'
        : state.keyStatus === 'valid' && state.apiKey ? `****${state.apiKey.slice(-4)}` : 'Skipped for now';
      return [
        { k: 'Setup', v: 'In-browser BYOK' },
        { k: 'Provider', v: provider.name },
        { k: 'API Key', v: keyText, ok: state.keyStatus === 'valid' },
        { k: 'Access', v: 'Granted on install', ok: true }
      ];
    }
    return [
      { k: 'Setup', v: 'Not configured' },
      { k: 'Tip', v: 'Finish setup in Settings' },
      { k: 'Version', v: `v${VERSION}`, mono: true }
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
    writeClipboard(text);
    clearTimeout(copiedTimer);
    state.copied = key;
    copiedTimer = setTimeout(() => {
      state.copied = null;
      render();
    }, 1600);
    showToast('Install command copied');
    render();
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

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    storageSet({ fsbOnboardingTheme: state.theme }).catch(() => {});
    render();
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
    return (value || 'http://localhost:1234').trim().replace(/\/+$/, '') || 'http://localhost:1234';
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
