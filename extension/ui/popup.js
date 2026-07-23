// Modern Chat Interface Script for FSB v0.9.91

// Phase 243 plan 03 (UI-02): the popup's surface id (matches the legacy:popup
// agent synthesized by ensureLegacyPopupAgent below). When the active tab is
// owned by THIS surface, the "owned by ..." chip stays hidden -- per CONTEXT
// D-05, a surface does not announce ownership of its own tab.
const MY_SURFACE = 'legacy:popup';

let currentSessionId = null;
let conversationId = null;
let isRunning = false;
let stopRequested = false;

// Quick task 260524-7n9 -- chip-owned lock: true while the active tab is owned
// by a non-self agent and the read-only "owned by <ClientName>" chip is showing.
// Composes with updateSendButtonState's existing hasContent / isRunning gating;
// it is an ADDITIONAL gate, never a replacement. Set/cleared exclusively by
// refreshOwnerChip below (no automation-lifecycle setter writes this flag --
// ownership is independent of the running / idle / error state machine).
let _chatLockedByOwnerChip = false;

// Phase 240 D-02: synthesize legacy:popup agentId once per popup load.
// The popup is short-lived (recreated each time the user clicks the icon),
// so we cache the agentId in module scope for the lifetime of THIS popup
// view. Plan 01's getOrRegisterLegacyAgent is idempotent on the 'popup'
// surface (returns the SAME 'legacy:popup' agentId every time), so the
// registry never grows. ownershipToken is null until bindTab fires inside
// handleStartAutomation (D-08 4th site).
let _legacyPopupAgent = null;
async function ensureLegacyPopupAgent() {
  if (_legacyPopupAgent && _legacyPopupAgent.agentId) return _legacyPopupAgent;
  try {
    _legacyPopupAgent = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'ensureLegacyAgent', surface: 'popup' },
        (resp) => resolve(resp || {})
      );
    });
  } catch (_e) {
    _legacyPopupAgent = null;
  }
  if (!_legacyPopupAgent || !_legacyPopupAgent.success) {
    _legacyPopupAgent = { agentId: null, ownershipToken: null };
  }
  return _legacyPopupAgent;
}

// Initialize or restore conversation ID for session continuity
async function initConversationId() {
  try {
    const stored = await chrome.storage.session.get(['fsbPopupConversationId']);
    if (stored.fsbPopupConversationId) {
      conversationId = stored.fsbPopupConversationId;
    } else {
      conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await chrome.storage.session.set({ fsbPopupConversationId: conversationId });
    }
  } catch (e) {
    // Fallback: generate without persistence
    conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

// DOM elements - updated for new chat interface
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const testBtn = document.getElementById('testBtn');
const settingsBtn = document.getElementById('settingsBtn');
const pinBtn = document.getElementById('pinBtn');
const chatMessages = document.getElementById('chatMessages');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

// Apply theme based on settings. Preference is 'system' | 'dark' | 'light'
// (set by the options page's Advanced Settings); 'system' resolves live from
// the OS via matchMedia instead of hardening into 'light'/'dark' on first run.
function resolveEffectiveTheme(preference) {
  if (preference === 'system') {
    return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme() {
  let preference = localStorage.getItem('fsb-theme');
  if (!['system', 'dark', 'light'].includes(preference)) {
    preference = 'system';
  }
  document.documentElement.setAttribute('data-theme', resolveEffectiveTheme(preference));
}

// Listen for theme changes from options page
window.addEventListener('storage', (e) => {
  if (e.key === 'fsb-theme') {
    applyTheme();
  }
});

// Live-follow OS theme changes while the preference is 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

// Initialize analytics for popup context
let popupAnalytics = null;

function initializePopupAnalytics() {
  try {
    // Create analytics instance for popup
    popupAnalytics = new FSBAnalytics();
    console.log('Popup analytics initialized');
  } catch (error) {
    console.error('Failed to initialize popup analytics:', error);
  }
}

// Listen for analytics updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYTICS_UPDATE' && popupAnalytics) {
    // Reload analytics data when updated
    popupAnalytics.loadStoredData().then(() => {
      console.log('Popup analytics data refreshed');
    });
  }
});

// Quick task 260524-8qv -- Codex PR #78 Finding 3 (P2). Mirrors the
// sidepanel.js:224..241 listener so an ownership flip mid-popup re-renders
// the chip without waiting for the user to close + reopen the popup. The
// popup is short-lived (recreated each click) BUT can stay open for many
// seconds during an automation; an MCP agent claiming the active tab during
// that window currently leaves the chip stale until close/reopen.
//
// Refresh on EITHER:
//   - fsbAgentRegistry (Phase 237 D-03 envelope mutation -- ownership
//     claimed / released / transferred for the active tab);
//   - fsbAgentClientLabels (Quick task 260524-7n9 canonical MCP client name
//     landed for the owning agent -- chip text should flip from
//     "owned by agent_<hex>" to "owned by Claude").
//
// Both keys live in the session namespace (write site:
// extension/ws/mcp-tool-dispatcher.js _persistAgentClientLabel; envelope
// write site: extension/utils/agent-registry.js).
//
// Defensive guards (outer try + chrome-availability checks) so popup boot is
// NEVER poisoned even on test environments that throw on
// chrome.storage.onChanged access. refreshOwnerChip already wraps its own
// body in try/catch (popup.js:117..204), so the arrow body itself does not
// need a second try.
try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged
      && typeof chrome.storage.onChanged.addListener === 'function') {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes && (changes.fsbAgentRegistry || changes.fsbAgentClientLabels)) {
        refreshOwnerChip();
      }
    });
  }
} catch (_e) { /* listener best-effort -- never poison popup boot */ }

// Phase 243 plan 03 (UI-02): refresh the read-only "owned by Agent X" chip.
// Reads the persisted registry envelope from chrome.storage.session (Phase 237
// D-03 write-through) and the active tab; uses the FSBOwnerChip pure helpers
// to decide visibility and label format. Bypasses background.js entirely so
// this plan stays Wave-1 zero-overlap with Plan 02's webNavigation listener.
async function refreshOwnerChip() {
  try {
    const chipEl = document.getElementById('fsb-owner-chip');
    if (!chipEl) return;
    if (typeof FSBOwnerChip === 'undefined') {
      chipEl.style.display = 'none';
      // Quick task 260524-7n9: helper-unload race -- if we previously locked
      // the input, release it so the user is not stranded with a disabled
      // input forever just because the chip helper went away.
      if (_chatLockedByOwnerChip) {
        _chatLockedByOwnerChip = false;
        chatInput.setAttribute('contenteditable', 'true');
        chatInput.removeAttribute('title');
        updateSendButtonState();
      }
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      chipEl.style.display = 'none';
      // Quick task 260524-7n9: no active tab -- release any lock to avoid
      // stranding the input disabled across an empty tab query.
      if (_chatLockedByOwnerChip) {
        _chatLockedByOwnerChip = false;
        chatInput.setAttribute('contenteditable', 'true');
        chatInput.removeAttribute('title');
        updateSendButtonState();
      }
      return;
    }

    // Quick task 260524-7n9: read both the registry envelope AND the per-agent
    // canonical client-label map in a single round-trip. The label map is
    // written by mcp-tool-dispatcher.js _persistAgentClientLabel and lets the
    // chip show "owned by Claude" instead of "owned by agent_<hex>".
    const stored = await chrome.storage.session.get(['fsbAgentRegistry', 'fsbAgentClientLabels']);
    const envelope = stored && stored.fsbAgentRegistry;
    const labelsMap = stored && stored.fsbAgentClientLabels;
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);

    if (!FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)) {
      chipEl.textContent = '';
      chipEl.style.display = 'none';
      // Quick task 260524-7n9: chip is hidden -- release the chat-input lock
      // if we previously set it (ownership released, agent disconnected, or
      // user switched to an unowned tab).
      if (_chatLockedByOwnerChip) {
        _chatLockedByOwnerChip = false;
        chatInput.setAttribute('contenteditable', 'true');
        chatInput.removeAttribute('title');
        updateSendButtonState();
      }
      return;
    }

    // Merged client-label resolution (Phase 11 FINT-19 three-tier + Quick task
    // 260524-7n9 canonical MCP client name). In priority order:
    // Tier 1: legacy:* literal (e.g., legacy:sidepanel, legacy:autopilot).
    // Tier 2: canonical MCP client name (Claude, Codex, Cursor, ...) from the
    //         dispatcher-written fsbAgentClientLabels map, keyed by ownerAgentId.
    // Tier 3: friendly client name from the visual-session lifecycle entry
    //         (Phase 10 D-01 allowlist; e.g., OpenClaw, Claude, FSB Autopilot).
    // Tier 4: formatAgentIdForDisplay short-prefix fallback for raw-FSB-tool
    //         agents that never tick the visual-session pipeline.
    // The clientLabelFor existence check is a forward-compatibility guard in case
    // the helper has not been re-loaded after a hot extension reload.
    let label;
    if (ownerAgentId.indexOf('legacy:') === 0) {
      label = ownerAgentId;
    } else {
      const clientLabel = (typeof FSBOwnerChip.clientLabelFor === 'function')
        ? FSBOwnerChip.clientLabelFor(ownerAgentId, labelsMap)
        : null;
      if (clientLabel) {
        label = clientLabel;
      } else {
        const friendly = await FSBOwnerChip.lookupClientLabel(
          tab.id,
          (key) => chrome.storage.session.get(key)
        );
        if (friendly) {
          label = friendly;
        } else {
          const formatter = (typeof FsbAgentRegistry !== 'undefined'
            && typeof FsbAgentRegistry.formatAgentIdForDisplay === 'function')
            ? FsbAgentRegistry.formatAgentIdForDisplay
            : null;
          label = FSBOwnerChip.ownerLabelFor(ownerAgentId, formatter);
        }
      }
    }
    chipEl.textContent = FSBOwnerChip.buildChipText(label);
    chipEl.style.display = 'inline-flex';
    // Quick task 260524-7n9: chip is visible -- lock the chat input + send
    // button so the user cannot type into / submit on a tab being actively
    // driven by an external agent. The send button is gated through
    // updateSendButtonState (the new _chatLockedByOwnerChip flag composes
    // into its OR chain). The chat input is a contenteditable div, so
    // setAttribute('contenteditable', 'false') is the correct lock -- the
    // `.disabled` property does NOT block typing on contenteditable elements.
    _chatLockedByOwnerChip = true;
    chatInput.setAttribute('contenteditable', 'false');
    chatInput.title = 'Disabled while tab is owned by ' + label;
    updateSendButtonState();
  } catch (_e) {
    // Chip is best-effort -- never poison popup boot.
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme first
  applyTheme();

  // Initialize conversation ID for session continuity
  await initConversationId();

  // Initialize analytics
  initializePopupAnalytics();
  
  // Check if extension is locked (using encrypted config)
  const hasEncryptedConfig = await checkEncryptedConfig();
  
  if (hasEncryptedConfig) {
    // Check if already unlocked in this session
    const session = await chrome.storage.session.get('masterPassword');
    
    if (!session.masterPassword) {
      // Need to unlock - open unlock page
      chrome.windows.create({
        url: chrome.runtime.getURL('ui/unlock.html'),
        type: 'popup',
        width: 400,
        height: 500
      });
      window.close();
      return;
    }
  }
  
  // Load saved task if any and restore it to input
  chrome.storage.local.get(['lastTask'], (data) => {
    if (data.lastTask && data.lastTask.trim()) {
      chatInput.textContent = data.lastTask;
      updateSendButtonState();
    }
  });
  
  // Check current status
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response && response.activeSessions > 0) {
      setRunningState();
      // Recover sessionId from background if UI lost it (e.g., after service worker restart)
      if (!currentSessionId && response.currentSessionId) {
        currentSessionId = response.currentSessionId;
        console.log('FSB: Recovered sessionId from background:', currentSessionId);
      }
    }
  });
  
  // Check window mode
  await checkWindowMode();
  
  // Add welcome message
  addMessage('Welcome to FSB. How can I help?', 'system');

  // Phase 243 plan 03 (UI-02): render the read-only owner chip on load. The
  // popup is short-lived; no chrome.tabs.onActivated subscription needed --
  // the user closes/reopens the popup to "refresh" naturally. Sidepanel does
  // subscribe (it is persistent across tab switches).
  refreshOwnerChip();

  // Focus the input
  chatInput.focus();
});

// Check if using encrypted configuration
async function checkEncryptedConfig() {
  const stored = await chrome.storage.local.get(['apiKey', 'captchaApiKey']);
  
  // Check if any key looks encrypted
  for (const value of Object.values(stored)) {
    if (value && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed.encrypted && parsed.salt && parsed.iv) {
          return true;
        }
      } catch {
        // Not JSON, so not encrypted
      }
    }
  }
  
  return false;
}

// Event listeners
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', stopAutomation);
testBtn.addEventListener('click', testAPI);
settingsBtn.addEventListener('click', openSettings);
pinBtn.addEventListener('click', togglePinWindow);

// PERF: Debounced storage save to avoid writes on every keystroke
let _saveTaskTimer = null;
function debouncedSaveTask() {
  clearTimeout(_saveTaskTimer);
  _saveTaskTimer = setTimeout(() => {
    chrome.storage.local.set({ lastTask: chatInput.textContent.trim() });
  }, 500);
}

// Chat input event handlers
chatInput.addEventListener('input', () => {
  updateSendButtonState();
  debouncedSaveTask();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// Handle paste events to maintain plain text
chatInput.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
});

// Update send button state based on input content
// Quick task 260524-7n9: composes the chip-owned chat lock into the existing
// gating chain via OR -- hasContent governs the empty-input case, isRunning
// governs in-flight automation, _chatLockedByOwnerChip is the external-agent
// ownership gate. NO normal lifecycle transition leaves the input enabled
// while the chip is showing; refreshOwnerChip is the sole writer of the flag.
function updateSendButtonState() {
  const hasContent = chatInput.textContent.trim().length > 0;
  sendBtn.disabled = !hasContent || isRunning || _chatLockedByOwnerChip;
}

// Handle sending a message
async function handleSendMessage() {
  const message = chatInput.textContent.trim();

  if (!message || isRunning) {
    return;
  }

  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  // Handle /agent slash commands
  // if (message.startsWith('/agent')) {
  //   chatInput.textContent = '';
  //   updateSendButtonState();
  //   addMessage(message, 'user');
  //   handleAgentCommand(message);
  //   return;
  // }

  try {
    // Add user message to chat
    addMessage(message, 'user');

    // Clear input
    chatInput.textContent = '';
    updateSendButtonState();
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Note: Restriction checking is now handled by background script with smart navigation
    
    // Phase 240 D-02: ensure legacy:popup agentId is synthesized BEFORE
    // dispatching startAutomation. The agentId + ownershipToken are
    // threaded into the envelope so handleStartAutomation can bindTab the
    // target tab under legacy:popup (D-08 4th site). On error we still
    // dispatch with null fields; handleStartAutomation will fall back to
    // legacy:autopilot synthesis.
    const legacy = await ensureLegacyPopupAgent();

    // Send start command to background
    chrome.runtime.sendMessage({
      action: 'startAutomation',
      task: message,
      tabId: tab.id,
      conversationId: conversationId,
      agentId: legacy && legacy.agentId,
      ownershipToken: legacy && legacy.ownershipToken
    }, (response) => {
      if (response.success) {
        currentSessionId = response.sessionId;
        setRunningState();
        addStatusMessage(response.continued ? 'Continuing...' : 'Starting automation...');
      } else {
        if (response.isChromePage) {
          // Show Chrome page error as plain text, not in a bubble
          showChromepageError(response.error);
        } else {
          addMessage(`I encountered an error: ${response.error}`, 'error');
        }
        setIdleState();
      }
    });
    
  } catch (error) {
    addMessage(`Something went wrong: ${error.message}`, 'error');
    setIdleState();
  }
}

// Stop automation
function stopAutomation() {
  console.log('Stop button clicked');
  console.log('Current session ID:', currentSessionId);
  console.log('Is running:', isRunning);
  
  if (!currentSessionId) {
    console.log('No active session to stop');
    addMessage('No active automation to stop.', 'system');
    return;
  }
  
  stopRequested = true;
  
  console.log('Sending stop message to background script');
  chrome.runtime.sendMessage({
    action: 'stopAutomation',
    sessionId: currentSessionId
  }, (response) => {
    console.log('Stop automation response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      addMessage(`Error communicating with background script: ${chrome.runtime.lastError.message}`, 'error');
      stopRequested = false;
      return;
    }
    
    if (response && response.success) {
      // Complete any active status message before setting idle state
      if (currentStatusMessage) {
        completeStatusMessage('Automation stopped', 'system');
      }
      setIdleState();
      addMessage('Automation stopped. Let me know if you need help with anything else!', 'system');
      currentSessionId = null;
      stopRequested = false;
      console.log('Automation stopped successfully');
    } else {
      const errorMsg = response ? response.error : 'Unknown error';
      addMessage(`Error stopping automation: ${errorMsg}`, 'error');
      console.error('Stop automation failed:', errorMsg);
      stopRequested = false;
    }
  });
}

// Test API connection
async function testAPI() {
  // Read current provider for display
  const stored = await chrome.storage.local.get(['modelProvider']);
  const provider = stored.modelProvider || 'xai';
  const providerNames = {
    xai: 'xAI',
    gemini: 'Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
    lmstudio: 'LM Studio',
    custom: 'Custom'
  };
  const displayName = providerNames[provider] || provider;

  addMessage(`Testing ${displayName} API connection...`, 'system');

  const testIcon = testBtn.querySelector('i');
  if (testIcon) {
    testIcon.className = 'fa fa-spinner fa-spin';
  }

  chrome.runtime.sendMessage({
    action: 'testAPI'
  }, (response) => {
    if (testIcon) {
      testIcon.className = 'fa fa-wrench';
    }

    if (response.success) {
      addMessage(`${displayName} API connection is working.`, 'system');
      if (response.result && response.result.data) {
        addMessage(`Connected to model: ${response.result.model || 'unknown'}`, 'ai');
      }
    } else {
      addMessage(`${displayName} API connection failed. Please check your settings.`, 'error');
      if (response.result) {
        addMessage(`Status: ${response.result.status} - ${response.result.statusText}`, 'error');
        if (response.result.error) {
          addMessage(`Details: ${response.result.error}`, 'error');
        }
      } else if (response.error) {
        addMessage(`Error details: ${response.error}`, 'error');
      }
    }
  });
}

// Update UI for running state
function setRunningState() {
  isRunning = true;
  stopRequested = false; // Reset stop flag when starting new automation
  // Quick task 260524-7n9: sendBtn.disabled is re-derived by
  // updateSendButtonState() below; that call honours _chatLockedByOwnerChip
  // so this bare assignment is safe (isRunning=true also keeps it disabled).
  sendBtn.disabled = true;
  stopBtn.classList.remove('hidden');
  statusDot.classList.add('running');
  statusText.textContent = 'Working';
  updateSendButtonState();
}

// Update UI for idle state
function setIdleState() {
  isRunning = false;
  // Quick task 260524-7n9: sendBtn.disabled is re-derived by
  // updateSendButtonState() below; that call honours _chatLockedByOwnerChip
  // so this bare assignment is safe.
  sendBtn.disabled = false;
  stopBtn.classList.add('hidden');
  statusDot.classList.remove('running', 'error');
  statusText.textContent = 'Ready';

  // Clean up any remaining status message with loader
  if (currentStatusMessage) {
    const loaderDots = currentStatusMessage.querySelector('.typing-dots');
    if (loaderDots) {
      loaderDots.remove();
    }
    currentStatusMessage = null;
  }

  // Reset action message tracking
  actionMessageQueue = [];

  updateSendButtonState();
}

// Update UI for error state
function setErrorState() {
  isRunning = false;
  // Quick task 260524-7n9: sendBtn.disabled is re-derived by
  // updateSendButtonState() below; that call honours _chatLockedByOwnerChip
  // so this bare assignment is safe.
  sendBtn.disabled = false;
  stopBtn.classList.add('hidden');
  statusDot.classList.add('error');
  statusText.textContent = 'Error';
  updateSendButtonState();
}

// Global reference to current status message
let currentStatusMessage = null;

// Action message tracking for auto-collapse
let actionMessageQueue = [];
const MAX_VISIBLE_ACTIONS = 2;

function addActionMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message action-compact new';
  msgDiv.textContent = text;
  chatMessages.appendChild(msgDiv);
  setTimeout(() => msgDiv.classList.remove('new'), 400);
  actionMessageQueue.push(msgDiv);
  collapseOldActions();
  scrollToBottom();
}

function collapseOldActions() {
  if (actionMessageQueue.length <= MAX_VISIBLE_ACTIONS) return;

  // Find or create the summary group
  let group = chatMessages.querySelector('.action-summary-group');
  if (!group) {
    group = document.createElement('div');
    group.className = 'action-summary-group';
    const header = document.createElement('div');
    header.className = 'action-summary-header';
    header.innerHTML = '<span class="action-chevron">></span><span class="action-summary-count"></span>';
    header.addEventListener('click', () => {
      const list = group.querySelector('.action-summary-list');
      const chevron = group.querySelector('.action-chevron');
      if (list.classList.contains('collapsed')) {
        list.classList.remove('collapsed');
        chevron.classList.add('expanded');
      } else {
        list.classList.add('collapsed');
        chevron.classList.remove('expanded');
      }
    });
    const list = document.createElement('div');
    list.className = 'action-summary-list collapsed';
    group.appendChild(header);
    group.appendChild(list);
    // Insert before the first action message
    const firstAction = actionMessageQueue[0];
    if (firstAction && firstAction.parentNode) {
      firstAction.parentNode.insertBefore(group, firstAction);
    } else {
      chatMessages.appendChild(group);
    }
  }

  const list = group.querySelector('.action-summary-list');
  // Move older action messages into the summary group
  while (actionMessageQueue.length > MAX_VISIBLE_ACTIONS) {
    const oldMsg = actionMessageQueue.shift();
    if (oldMsg.parentNode) oldMsg.remove();
    const collapsed = document.createElement('div');
    collapsed.className = 'collapsed-action';
    collapsed.textContent = oldMsg.textContent;
    list.appendChild(collapsed);
  }

  // Update count label
  const countEl = group.querySelector('.action-summary-count');
  if (countEl) {
    countEl.textContent = `${list.children.length} actions completed`;
  }
}

// Add dynamic status message with integrated loader
function addStatusMessage(text, type = 'ai') {
  // Remove any existing status message
  if (currentStatusMessage) {
    currentStatusMessage.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type} status-message new`;
  
  // Create message content with integrated loader
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  // Create loader dots
  const loaderDots = document.createElement('div');
  loaderDots.className = 'typing-dots';
  loaderDots.innerHTML = '<span></span><span></span><span></span>';
  
  // Create status text
  const statusText = document.createElement('span');
  statusText.className = 'status-text';
  statusText.textContent = text;
  
  // Progress container (hidden until progress data arrives)
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-container hidden';
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressBar.appendChild(progressFill);
  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressLabel);

  // Assemble the message
  messageContent.appendChild(loaderDots);
  messageContent.appendChild(statusText);
  messageDiv.appendChild(messageContent);
  messageDiv.appendChild(progressContainer);

  chatMessages.appendChild(messageDiv);

  // Store reference for updates
  currentStatusMessage = messageDiv;

  // Remove the 'new' class after animation
  setTimeout(() => {
    messageDiv.classList.remove('new');
  }, 400);

  scrollToBottom();
  return messageDiv;
}

// Update existing status message with optional progress data
function updateStatusMessage(text, progressData) {
  if (currentStatusMessage) {
    const statusText = currentStatusMessage.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = text;
    }
    if (progressData && progressData.iteration != null) {
      const container = currentStatusMessage.querySelector('.progress-container');
      const fill = currentStatusMessage.querySelector('.progress-fill');
      const label = currentStatusMessage.querySelector('.progress-label');
      if (container && fill && label) {
        container.classList.remove('hidden');
        fill.style.width = (progressData.progressPercent || 0) + '%';
        label.textContent = `Step ${progressData.iteration}/${progressData.maxIterations || 100}`;
      }
    }
  }
}

// Complete status message (remove loader, show brief label)
// Full result is shown in a separate completion bubble below
function completeStatusMessage(text, type = 'ai') {
  if (currentStatusMessage) {
    // Remove loader dots
    const loaderDots = currentStatusMessage.querySelector('.typing-dots');
    if (loaderDots) {
      loaderDots.remove();
    }

    // Set a brief label on the status bubble
    const briefLabel = type === 'error' ? 'Error occurred'
      : type === 'system' ? text
      : type === 'partial' ? 'Task partially completed'
      : 'Task completed';
    const statusTextEl = currentStatusMessage.querySelector('.status-text');
    if (statusTextEl) {
      statusTextEl.textContent = briefLabel;
    }

    // Style as completed
    currentStatusMessage.className = `message ${type === 'error' ? 'error' : 'ai'} completed`;

    // Clear reference
    currentStatusMessage = null;

    // Show full result in a separate bubble (skip for system messages like "Automation stopped")
    if (type === 'partial') {
      addCompletionMessage(text, 'ai', true);
    } else if (type !== 'system') {
      addCompletionMessage(text, type);
    }
  }
}

// Add a separate completion message bubble with markdown support
function addCompletionMessage(text, type = 'ai', isPartial = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ai-completion new`;

  if (isPartial) {
    messageDiv.classList.add('partial-result');
    const label = document.createElement('div');
    label.className = 'partial-result-label';
    label.textContent = 'Partial result';
    messageDiv.appendChild(label);
  }

  if (type === 'error') {
    messageDiv.className = `message error new`;
    messageDiv.textContent = text;
  } else {
    // Use markdown rendering if available, plain text fallback
    const contentDiv = document.createElement('div');
    if (typeof FSBMarkdown !== 'undefined') {
      FSBMarkdown.applyToElement(contentDiv, text);
    } else {
      contentDiv.textContent = text;
    }
    messageDiv.appendChild(contentDiv);
  }

  chatMessages.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.classList.remove('new');
  }, 400);

  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  scrollToBottom();
}

// Show Chrome page error as plain text without bubble
function showChromepageError(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chrome-page-error';
  messageDiv.textContent = text;
  
  // Add simple styling
  messageDiv.style.cssText = `
    color: #666;
    font-size: 14px;
    padding: 10px 15px;
    margin: 10px 0;
    text-align: center;
    font-style: italic;
    border-radius: 8px;
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
  `;
  
  const messagesContainer = document.getElementById('messages');
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add message to chat with modern bubble styling
function addMessage(text, type = 'system') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type} new`;

  // Handle different message types
  if (type === 'action') {
    // Format action messages nicely
    const actionText = text.replace(/Executed: (\w+)\((.*)\)/, (match, tool, params) => {
      try {
        const parsedParams = JSON.parse(params);
        const formattedParams = Object.entries(parsedParams)
          .map(([key, value]) => `${key}: "${value}"`)
          .join(', ');
        return `${tool}(${formattedParams})`;
      } catch {
        return `${tool}(${params})`;
      }
    });
    messageDiv.textContent = actionText;
  } else {
    messageDiv.textContent = text;
  }

  // Add dismiss button for error messages
  if (type === 'error') {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'message-dismiss';
    dismissBtn.textContent = 'X';
    dismissBtn.addEventListener('click', () => {
      messageDiv.classList.add('collapsing');
      setTimeout(() => messageDiv.remove(), 300);
    });
    messageDiv.appendChild(dismissBtn);
    // Auto-collapse error after 30 seconds
    setTimeout(() => {
      if (messageDiv.parentNode && !messageDiv.classList.contains('collapsing')) {
        messageDiv.classList.add('auto-collapsed');
      }
    }, 30000);
  }

  chatMessages.appendChild(messageDiv);

  // Remove the 'new' class after animation
  setTimeout(() => {
    messageDiv.classList.remove('new');
  }, 400);

  // Limit messages to prevent overflow
  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  scrollToBottom();
}

// Smooth scroll to bottom
function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 50);
}

// Toggle pin window functionality
async function togglePinWindow() {
  console.log('Pin button clicked');
  
  // Get current preference
  const { windowMode } = await chrome.storage.local.get(['windowMode']);
  const isCurrentlyPinned = windowMode === 'pinned';
  
  if (isCurrentlyPinned) {
    // Switch back to popup mode
    await chrome.storage.local.set({ windowMode: 'popup' });
    pinBtn.classList.remove('pinned');
    addMessage('Switched to popup mode. Extension will close when clicked outside.', 'system');
  } else {
    // Switch to persistent window mode
    await chrome.storage.local.set({ windowMode: 'pinned' });
    
    // Create persistent window
    const currentWindow = await chrome.windows.getCurrent();
    chrome.windows.create({
      url: chrome.runtime.getURL('ui/popup.html'),
      type: 'popup',
      width: 400,
      height: 600,
      left: currentWindow.left + 50,
      top: currentWindow.top + 50
    });
    
    // Close current popup
    window.close();
  }
}

// Check window mode on startup
async function checkWindowMode() {
  const { windowMode } = await chrome.storage.local.get(['windowMode']);
  if (windowMode === 'pinned') {
    pinBtn.classList.add('pinned');
    addMessage('Running in persistent window mode.', 'system');
  }
}


// Open settings
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'automationComplete':
      if (!isRunning) return; // Already idle, ignore duplicate
      if (request.sessionId === currentSessionId) {
        // AI must always provide a meaningful completion message
        const completionMessage = request.result || 'The automation completed but no summary was provided. Please try again if the task wasn\'t completed as expected.';
        const isPartial = request.partial === true;

        if (currentStatusMessage) {
          completeStatusMessage(completionMessage, isPartial ? 'partial' : undefined);
        } else {
          addCompletionMessage(completionMessage, 'ai', isPartial);
        }

        setIdleState();
      }
      break;
      
    case 'statusUpdate':
      if (request.sessionId === currentSessionId && !stopRequested) {
        // Snapshot previous status as completed action message
        const prevText = currentStatusMessage?.querySelector('.status-text')?.textContent;
        const skipTexts = ['Starting automation...', 'Connecting to page...', 'Connected. Analyzing page...', 'Analyzing page...'];
        if (prevText && !skipTexts.includes(prevText)) {
          addActionMessage(prevText);
        }
        updateStatusMessage(request.message, {
          iteration: request.iteration,
          maxIterations: request.maxIterations,
          progressPercent: request.progressPercent
        });
      }
      break;
      
    case 'automationError':
      if (!isRunning) return; // Already idle, ignore duplicate
      if (request.sessionId === currentSessionId) {
        setErrorState();
        completeStatusMessage(`Error: ${request.error}`, 'error');
        // Add retry button if task is available
        if (request.task) {
          const retryDiv = document.createElement('div');
          retryDiv.className = 'message system new';
          retryDiv.textContent = 'Would you like to try again? ';
          const retryBtn = document.createElement('button');
          retryBtn.className = 'retry-btn';
          retryBtn.textContent = 'Retry';
          retryBtn.addEventListener('click', () => {
            retryDiv.remove();
            chatInput.textContent = request.task;
            handleSendMessage();
          });
          retryDiv.appendChild(retryBtn);
          chatMessages.appendChild(retryDiv);
          scrollToBottom();
        } else {
          addMessage('Let me know if you\'d like to try again or need help with something else.', 'system');
        }
      }
      break;
      
  }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + Enter to send message
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isRunning) {
    handleSendMessage();
  }
  // Escape to stop automation
  else if (e.key === 'Escape' && isRunning) {
    stopAutomation();
  }
});

// Auto-resize chat input based on content
function adjustInputHeight() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

// Initialize input height adjustment
chatInput.addEventListener('input', adjustInputHeight);

// Prevent default drag and drop behavior
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

console.log(`FSB v${chrome.runtime.getManifest().version} chat interface loaded`);

// ==========================================
// /agent Slash Command Handler
// ==========================================

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function handleAgentCommand(message) {
//   const parts = message.split(/\s+/);
//   const subCommand = parts[1] || '';
// 
//   if (subCommand === 'list') {
//     showAgentList();
//   } else if (subCommand === 'stop') {
//     const agentName = parts.slice(2).join(' ');
//     stopAgentByName(agentName);
//   } else {
//     startAgentWizard();
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function showAgentList() {
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//     });
// 
//     const agents = response?.agents || [];
//     if (agents.length === 0) {
//       addMessage('No background agents configured. Use /agent to create one.', 'system');
//       return;
//     }
// 
//     let listText = 'Background Agents:\n';
//     for (const agent of agents) {
//       const status = agent.enabled ? '[ON]' : '[OFF]';
//       const lastRun = agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleString() : 'Never';
//       listText += `\n${status} ${agent.name} - ${formatScheduleShort(agent.schedule)} - Last: ${lastRun}`;
//     }
//     addMessage(listText, 'system');
//   } catch (error) {
//     addMessage('Failed to load agents: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function stopAgentByName(name) {
//   if (!name) {
//     addMessage('Usage: /agent stop <agent name>', 'system');
//     return;
//   }
// 
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//     });
// 
//     const agents = response?.agents || [];
//     const agent = agents.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
// 
//     if (!agent) {
//       addMessage('Agent not found: "' + name + '"', 'error');
//       return;
//     }
// 
//     if (!agent.enabled) {
//       addMessage('Agent "' + agent.name + '" is already disabled.', 'system');
//       return;
//     }
// 
//     const toggleResp = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'toggleAgent', agentId: agent.agentId }, resolve);
//     });
// 
//     if (toggleResp.success) {
//       addMessage('Agent "' + agent.name + '" has been disabled.', 'system');
//     } else {
//       addMessage('Failed to stop agent: ' + (toggleResp.error || 'Unknown error'), 'error');
//     }
//   } catch (error) {
//     addMessage('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function startAgentWizard() {
//   chrome.runtime.openOptionsPage();
//   setTimeout(() => {
//     chrome.runtime.sendMessage({ action: 'openAgentForm' });
//   }, 500);
//   addMessage('Opening agent settings... Use the form in the options page to create your agent.', 'system');
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function formatScheduleShort(schedule) {
//   if (!schedule) return 'Not set';
//   switch (schedule.type) {
//     case 'interval':
//       return 'Every ' + (schedule.intervalMinutes || 1) + ' min';
//     case 'daily':
//       return 'Daily at ' + (schedule.dailyTime || '09:00');
//     case 'once':
//       return 'Run once';
//     default:
//       return schedule.type;
//   }
// }
