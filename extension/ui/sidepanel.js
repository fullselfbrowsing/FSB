// Side Panel Script for FSB v0.9.50 - Persistent UI

// Phase 243 plan 03 (UI-02): the sidepanel's surface id (matches the
// legacy:sidepanel agent synthesized by ensureLegacySidepanelAgent below).
// When the active tab is owned by THIS surface, the "owned by ..." chip
// stays hidden -- per CONTEXT D-05, a surface does not announce ownership
// of its own tab.
const MY_SURFACE = 'legacy:sidepanel';

let currentSessionId = null;
let conversationId = null;
let isRunning = false;
let stopRequested = false;
let livenessInterval = null;
let livenessFailCount = 0;
let isHistoryViewActive = false;
let showSidepanelProgressEnabled = false;

// Phase 240 D-02: synthesize legacy:sidepanel agentId once per side panel
// load. The side panel is longer-lived than the popup but still gets
// recreated by Chrome on certain events; the registry's
// getOrRegisterLegacyAgent is idempotent on the 'sidepanel' surface so the
// constant 'legacy:sidepanel' agentId is reused across reopens. The
// ownershipToken is null until bindTab fires inside handleStartAutomation
// (D-08 4th site).
let _legacySidepanelAgent = null;
async function ensureLegacySidepanelAgent() {
  if (_legacySidepanelAgent && _legacySidepanelAgent.agentId) return _legacySidepanelAgent;
  try {
    _legacySidepanelAgent = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'ensureLegacyAgent', surface: 'sidepanel' },
        (resp) => resolve(resp || {})
      );
    });
  } catch (_e) {
    _legacySidepanelAgent = null;
  }
  if (!_legacySidepanelAgent || !_legacySidepanelAgent.success) {
    _legacySidepanelAgent = { agentId: null, ownershipToken: null };
  }
  return _legacySidepanelAgent;
}

// Initialize or restore conversation ID for session continuity
async function initConversationId() {
  try {
    const stored = await chrome.storage.session.get(['fsbSidepanelConversationId']);
    if (stored.fsbSidepanelConversationId) {
      conversationId = stored.fsbSidepanelConversationId;
    } else {
      conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await chrome.storage.session.set({ fsbSidepanelConversationId: conversationId });
    }
  } catch (e) {
    // Fallback: generate without persistence
    conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

// DOM elements - adapted for side panel
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newChatBtn = document.getElementById('newChatBtn');
const settingsBtn = document.getElementById('settingsBtn');
const chatMessages = document.getElementById('chatMessages');
const historyBtn = document.getElementById('historyBtn');
const micBtn = document.getElementById('micBtn');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

// Apply theme based on settings
function applyTheme() {
  let savedTheme = localStorage.getItem('fsb-theme');
  if (!savedTheme) {
    savedTheme = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    localStorage.setItem('fsb-theme', savedTheme);
  }
  document.documentElement.setAttribute('data-theme', savedTheme);
}

// Listen for theme changes from options page
window.addEventListener('storage', (e) => {
  if (e.key === 'fsb-theme') {
    applyTheme();
  }
});

// Initialize analytics for sidepanel context
let sidepanelAnalytics = null;

function initializeSidepanelAnalytics() {
  try {
    // Create analytics instance for sidepanel
    sidepanelAnalytics = new FSBAnalytics();
    console.log('Sidepanel analytics initialized');
  } catch (error) {
    console.error('Failed to initialize sidepanel analytics:', error);
  }
}

// Listen for analytics updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYTICS_UPDATE' && sidepanelAnalytics) {
    // Reload analytics data when updated
    sidepanelAnalytics.loadStoredData().then(() => {
      console.log('Sidepanel analytics data refreshed');
    });
  }
});

// -- Reconnaissance integration --
let pendingReconTask = null;
// Track multiple recon progress messages keyed by crawlerId
const reconProgressMessages = new Map();

/**
 * Start a reconnaissance crawl from the side panel.
 * Uses a lighter crawl (depth 2, max 15 pages) for speed.
 */
async function startReconFromSidepanel(url, originalTask) {
  pendingReconTask = originalTask;
  const domain = new URL(url).hostname;

  addMessage('Starting reconnaissance on ' + domain + '...', 'system');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startExplorer',
      url: url,
      maxDepth: 2,
      maxPages: 15,
      autoSaveToMemory: true
    });

    if (!response || !response.success) {
      addMessage('Reconnaissance failed to start: ' + (response?.error || 'Unknown error'), 'system');
      pendingReconTask = null;
    }
  } catch (error) {
    addMessage('Reconnaissance failed: ' + error.message, 'system');
    pendingReconTask = null;
  }
}

/**
 * Handle progress updates from Site Explorer during reconnaissance.
 * Supports multiple concurrent crawlers keyed by crawlerId.
 */
function handleReconProgress(data) {
  const crawlerId = data.crawlerId || 'default';
  const domain = data.domain || '?';

  if (data.status === 'crawling') {
    let progressMsg = reconProgressMessages.get(crawlerId);
    if (!progressMsg) {
      progressMsg = document.createElement('div');
      progressMsg.id = 'recon-progress-' + crawlerId;
      progressMsg.className = 'message system recon-progress';
      chatMessages.appendChild(progressMsg);
      reconProgressMessages.set(crawlerId, progressMsg);
    }
    const percent = data.maxPages > 0 ? Math.round((data.pagesCollected / data.maxPages) * 100) : 0;
    progressMsg.textContent = 'Recon [' + domain + ']: ' + data.pagesCollected + '/' + data.maxPages + ' pages (' + percent + '%)';
    scrollToBottom();
  } else if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
    // Remove the progress message for this crawler
    const progressMsg = reconProgressMessages.get(crawlerId);
    if (progressMsg) {
      progressMsg.remove();
      reconProgressMessages.delete(crawlerId);
    }
  }
}

/**
 * Handle reconnaissance completion -- offer retry with original task.
 */
function handleReconComplete(data) {
  // Clean up any remaining progress messages for this domain
  for (const [id, el] of reconProgressMessages) {
    el.remove();
    reconProgressMessages.delete(id);
  }

  addMessage('Reconnaissance complete! Site map saved for ' + (data?.domain || 'this site') + '.', 'system');

  // Offer retry with the original task
  if (pendingReconTask) {
    const retryDiv = document.createElement('div');
    retryDiv.className = 'message system new';
    retryDiv.textContent = 'Site map ready. Retry your task? ';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Retry with Site Map';
    retryBtn.addEventListener('click', () => {
      retryDiv.remove();
      chatInput.textContent = pendingReconTask;
      pendingReconTask = null;
      handleSendMessage();
    });
    retryDiv.appendChild(retryBtn);
    chatMessages.appendChild(retryDiv);
    scrollToBottom();
  }
}

// Listen for explorer status and site map saved messages
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'explorerStatusUpdate') {
    handleReconProgress(message.data);
  }
  if (message.type === 'siteMapSaved') {
    handleReconComplete(message.data);
  }
});

// Keep sidepanel progress setting in sync when changed from options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.showSidepanelProgress != null) {
    showSidepanelProgressEnabled = changes.showSidepanelProgress.newValue ?? false;
  }
  // Phase 243 plan 03 (UI-02) follow-up: refresh chip when registry mutates
  // for the active tab (ownership claimed/released/transferred). The
  // sidepanel persists across tab switches, so without this branch the chip
  // would show stale ownership data when an agent claims or releases the
  // active tab while the user stays on it.
  if (area === 'session' && changes && changes.fsbAgentRegistry) {
    refreshOwnerChip();
  }
});

// Phase 243 plan 03 (UI-02): refresh the read-only "owned by Agent X" chip.
// Reads the persisted registry envelope from chrome.storage.session (Phase 237
// D-03 write-through) and the active tab; uses FSBOwnerChip pure helpers to
// decide visibility and label format. Bypasses background.js entirely so this
// plan stays Wave-1 zero-overlap with Plan 02's webNavigation listener.
//
// Sidepanel-specific: subscribed to chrome.tabs.onActivated below, since the
// sidepanel persists across tab switches (popup is short-lived and skips this).
async function refreshOwnerChip() {
  try {
    const chipEl = document.getElementById('fsb-owner-chip');
    if (!chipEl) return;
    if (typeof FSBOwnerChip === 'undefined') {
      chipEl.style.display = 'none';
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      chipEl.style.display = 'none';
      return;
    }

    const stored = await chrome.storage.session.get('fsbAgentRegistry');
    const envelope = stored && stored.fsbAgentRegistry;
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);

    if (!FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)) {
      chipEl.textContent = '';
      chipEl.style.display = 'none';
      return;
    }

    // Phase 11 FINT-19 -- three-tier resolution (CONTEXT D-07).
    // Tier 1: legacy:* literal (e.g., legacy:popup, legacy:autopilot).
    // Tier 2: friendly client name from visual-session lifecycle entry
    //         (Phase 10 D-01 14-entry allowlist; e.g., OpenClaw, Claude,
    //         FSB Autopilot).
    // Tier 3: fall back to formatAgentIdForDisplay short-prefix (Phase 243
    //         baseline preserved for raw-FSB-tool agents that never tick
    //         the visual-session pipeline).
    let label;
    if (ownerAgentId.indexOf('legacy:') === 0) {
      label = ownerAgentId;
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
    chipEl.textContent = FSBOwnerChip.buildChipText(label);
    chipEl.style.display = 'inline-flex';
  } catch (_e) {
    // Chip is best-effort -- never poison sidepanel boot.
  }
}

// Phase 243 plan 03 (UI-02): refresh on tab switch. The sidepanel is
// persistent, so the active tab can change while the surface is open --
// without this listener the chip would show stale ownership data (Threat
// T-243-03-02). Best-effort registration; if chrome.tabs.onActivated is
// unavailable for any reason the chip simply does not auto-refresh.
try {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated
      && typeof chrome.tabs.onActivated.addListener === 'function') {
    chrome.tabs.onActivated.addListener(() => {
      refreshOwnerChip();
    });
  }
} catch (_e) {
  // swallow: chip auto-refresh is non-critical
}

// Initialize side panel
document.addEventListener('DOMContentLoaded', async () => {
  console.log('FSB v0.9.50 side panel loaded');

  // Apply theme first
  applyTheme();

  // Load sidepanel progress setting
  try {
    const stored = await chrome.storage.local.get(['showSidepanelProgress']);
    showSidepanelProgressEnabled = stored.showSidepanelProgress ?? false;
  } catch (e) {
    showSidepanelProgressEnabled = false;
  }

  // Initialize conversation ID for session continuity
  await initConversationId();

  // Initialize analytics
  initializeSidepanelAnalytics();
  
  // Check if extension is locked (using encrypted config)
  const hasEncryptedConfig = await checkEncryptedConfig();
  
  if (hasEncryptedConfig) {
    // Check if already unlocked in this session
    const session = await chrome.storage.session.get('masterPassword');
    
    if (!session.masterPassword) {
      // Need to unlock - show unlock UI or redirect
      addMessage('Extension is locked. Please unlock it first by opening the popup.', 'error');
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
    if (chrome.runtime.lastError) {
      console.log('Background script not ready yet');
      return;
    }
    if (response && response.activeSessions > 0) {
      setRunningState();
      // Recover sessionId from background if UI lost it (e.g., after service worker restart)
      if (!currentSessionId && response.currentSessionId) {
        currentSessionId = response.currentSessionId;
        console.log('FSB: Recovered sessionId from background:', currentSessionId);
      }
    }
  });
  
  // Set UI mode preference
  await chrome.storage.local.set({ uiMode: 'sidepanel' });

  // Phase 243 plan 03 (UI-02): render the read-only owner chip on load. The
  // chrome.tabs.onActivated subscription registered above keeps the chip in
  // sync as the user switches tabs in the persistent sidepanel.
  refreshOwnerChip();

  // History list event delegation for delete buttons
  const historyListEl = document.getElementById('historyList');
  if (historyListEl) {
    historyListEl.addEventListener('click', async (e) => {
      const replayBtn = e.target.closest('.history-replay-btn');
      if (replayBtn) {
        e.stopPropagation();
        const sessionId = replayBtn.dataset.sessionId;
        if (sessionId) {
          startReplay(sessionId);
        }
        return;
      }

      const deleteBtn = e.target.closest('.history-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const sessionId = deleteBtn.dataset.sessionId;
        if (sessionId) {
          await deleteHistorySession(sessionId);
        }
        return;
      }

      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        const sessionId = historyItem.dataset.sessionId;
        if (sessionId) {
          loadSessionView(sessionId);
        }
      }
    });
  }

  // Clear All button
  const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener('click', clearAllHistorySessions);
  }

  // Initialize speech-to-text for microphone button
  if (micBtn && typeof FSBSpeechToText !== 'undefined') {
    new FSBSpeechToText(chatInput, micBtn, sendBtn);
  }

  // Add welcome message
  addMessage('Welcome to FSB. How can I help?', 'system');

  // Focus the input
  chatInput.focus();
});

// Check if using encrypted configuration
async function checkEncryptedConfig() {
  try {
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
  } catch (error) {
    console.error('Error checking encrypted config:', error);
    return false;
  }
}

// Event listeners
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', stopAutomation);
newChatBtn.addEventListener('click', startNewChat);
settingsBtn.addEventListener('click', openSettings);
historyBtn.addEventListener('click', toggleHistoryView);

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
function updateSendButtonState() {
  const hasContent = chatInput.textContent.trim().length > 0;
  sendBtn.disabled = !hasContent || isRunning;
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
    
    // Phase 240 D-02: ensure legacy:sidepanel agentId is synthesized BEFORE
    // dispatching startAutomation. The agentId + ownershipToken thread into
    // the envelope so handleStartAutomation can bindTab the target tab
    // under legacy:sidepanel (D-08 4th site).
    const legacy = await ensureLegacySidepanelAgent();

    // Send start command to background
    chrome.runtime.sendMessage({
      action: 'startAutomation',
      task: message,
      tabId: tab.id,
      conversationId: conversationId,
      agentId: legacy && legacy.agentId,
      ownershipToken: legacy && legacy.ownershipToken
    }, (response) => {
      if (chrome.runtime.lastError) {
        addMessage(`Error communicating with background script: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }

      if (response && response.success) {
        currentSessionId = response.sessionId;
        setRunningState();
        addStatusMessage(response.continued ? 'Continuing...' : 'Starting automation...');
      } else {
        const errorMsg = response ? response.error : 'Unknown error';
        if (response && response.isChromePage) {
          // Show Chrome page error as plain text, not in a bubble
          showChromepageError(errorMsg);
        } else {
          addMessage(`I encountered an error: ${errorMsg}`, 'error');
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
  console.log('Side panel: Stop button clicked');
  console.log('Side panel: Current session ID:', currentSessionId);
  
  if (!currentSessionId) {
    console.log('Side panel: No active session to stop');
    addMessage('No active automation to stop.', 'system');
    return;
  }
  
  stopRequested = true;
  
  console.log('Side panel: Sending stop message to background script');
  chrome.runtime.sendMessage({
    action: 'stopAutomation',
    sessionId: currentSessionId
  }, (response) => {
    console.log('Side panel: Stop automation response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('Side panel: Chrome runtime error:', chrome.runtime.lastError);
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
      currentSessionId = null;
      stopRequested = false;
      console.log('Side panel: Automation stopped successfully');
    } else {
      const errorMsg = response ? response.error : 'Unknown error';
      addMessage(`Error stopping automation: ${errorMsg}`, 'error');
      stopRequested = false;
      console.error('Side panel: Stop automation failed:', errorMsg);
    }
  });
}

// Start new chat session
function startNewChat() {
  // Switch back to chat view if history is showing
  if (isHistoryViewActive) {
    showChatView();
  }

  // Stop any running automation first
  if (isRunning && currentSessionId) {
    chrome.runtime.sendMessage({
      action: 'stopAutomation',
      sessionId: currentSessionId
    });
  }

  // Reset session state
  currentSessionId = null;
  stopRequested = false;

  // Generate new conversationId for new chat
  conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  chrome.storage.session.set({ fsbSidepanelConversationId: conversationId }).catch(() => {});

  // Clear chat messages
  chatMessages.innerHTML = '';
  
  // Reset UI state
  setIdleState();
  
  // Clear any saved task
  chrome.storage.local.set({ lastTask: '' });
  
  // Clear input field
  chatInput.textContent = '';
  updateSendButtonState();
  
  // Add fresh welcome message
  addMessage('Welcome to FSB. How can I help?', 'system');
  
  // Focus the input
  chatInput.focus();
  
  console.log('New chat session started');
}


// Liveness poll -- detects orphaned running state when all upstream notifications were lost
function checkSessionLiveness() {
  if (!isRunning || !currentSessionId) return;
  chrome.runtime.sendMessage(
    { action: 'checkSessionAlive', sessionId: currentSessionId },
    (response) => {
      if (chrome.runtime.lastError || !response || response.alive === false) {
        livenessFailCount++;
        console.warn('[FSB sidepanel] Liveness check failed', {
          sessionId: currentSessionId,
          failCount: livenessFailCount,
          error: chrome.runtime.lastError?.message || null,
          alive: response?.alive,
          status: response?.status || null
        });
        if (livenessFailCount >= 2) {
          console.warn('[FSB sidepanel] Orphan detected after 2 consecutive failures, recovering');
          addMessage('Session ended unexpectedly. Ready for your next task.', 'error');
          setIdleState();
        }
      } else {
        livenessFailCount = 0;
      }
    }
  );
}

// Update UI for running state
function setRunningState() {
  isRunning = true;
  sendBtn.disabled = true;
  stopBtn.classList.remove('hidden');
  statusDot.classList.add('running');
  statusText.textContent = 'Working';
  updateSendButtonState();
  livenessFailCount = 0;
  if (livenessInterval) clearInterval(livenessInterval);
  livenessInterval = setInterval(checkSessionLiveness, 10000);
}

// Update UI for idle state
function setIdleState() {
  if (livenessInterval) { clearInterval(livenessInterval); livenessInterval = null; }
  livenessFailCount = 0;
  isRunning = false;
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

  // Reset action debug group reference
  currentActionGroup = null;

  updateSendButtonState();
}

// Update UI for error state
function setErrorState() {
  isRunning = false;
  sendBtn.disabled = false;
  stopBtn.classList.add('hidden');
  statusDot.classList.add('error');
  statusText.textContent = 'Error';
  updateSendButtonState();
}

// Global reference to current status message
let currentStatusMessage = null;

// Collapsible debug panel for action steps (lives inside the status message)
let currentActionGroup = null;

function ensureActionGroup() {
  if (currentActionGroup) return currentActionGroup;
  if (!currentStatusMessage) return null;

  const group = document.createElement('div');
  group.className = 'action-summary-group';
  const header = document.createElement('div');
  header.className = 'action-summary-header';
  header.innerHTML = '<span class="action-chevron">></span><span class="action-summary-count">0 actions completed</span>';
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

  // Place directly on the status message div (outside .message-content flex row)
  currentStatusMessage.appendChild(group);

  currentActionGroup = group;
  return group;
}

function addActionMessage(text) {
  if (!showSidepanelProgressEnabled) return;

  const group = ensureActionGroup();
  if (!group) return;

  // Append new action entry into the list
  const list = group.querySelector('.action-summary-list');
  const entry = document.createElement('div');
  entry.className = 'collapsed-action';
  entry.textContent = text;
  list.appendChild(entry);

  // Update count label
  const countEl = group.querySelector('.action-summary-count');
  if (countEl) {
    countEl.textContent = `${list.children.length} action${list.children.length === 1 ? '' : 's'} completed`;
  }

  scrollToBottom();
}

// Add dynamic status message with integrated loader
function addStatusMessage(text, type = 'ai') {
  // Remove any existing status message (and its embedded action group)
  if (currentStatusMessage) {
    currentStatusMessage.remove();
    currentActionGroup = null;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message status-message status-dots-only new`;
  
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
  if (showSidepanelProgressEnabled) {
    messageContent.appendChild(progressContainer);
  }
  messageDiv.appendChild(messageContent);

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
        label.textContent = `${(progressData.progressPercent || 0)}%`;
      }
    }
  }
}


// Complete status message: remove dots-only indicator, show only the result bubble
function completeStatusMessage(text, type = 'ai') {
  if (currentStatusMessage) {
    currentStatusMessage.remove();
    currentStatusMessage = null;
    currentActionGroup = null;

    if (type === 'partial') {
      addCompletionMessage(text, 'ai', true);
    } else if (type !== 'system') {
      addCompletionMessage(text, type);
    } else {
      addMessage(text, 'system');
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

// Open settings
function openSettings() {
  // Open the options page first
  chrome.runtime.openOptionsPage();

  // Then close the side panel
  window.close();
}

async function openControlPanelSection(sectionId) {
  const baseUrl = chrome.runtime.getURL('ui/control_panel.html');
  const targetUrl = sectionId ? `${baseUrl}#${sectionId}` : baseUrl;

  try {
    if (chrome.tabs?.create) {
      await chrome.tabs.create({ url: targetUrl, active: true });
    } else {
      chrome.runtime.openOptionsPage();
    }
    window.close();
  } catch (_error) {
    chrome.runtime.openOptionsPage();
    window.close();
  }
}

function normalizeAutomationOutcome(outcome, status, hasError) {
  var normalizedOutcome = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';
  if (normalizedOutcome === 'error') return 'failure';
  if (normalizedOutcome === 'success' || normalizedOutcome === 'partial' || normalizedOutcome === 'failure' || normalizedOutcome === 'stopped') {
    return normalizedOutcome;
  }

  var normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (normalizedStatus === 'partial') return 'partial';
  if (normalizedStatus === 'stopped') return 'stopped';
  if (normalizedStatus === 'error' || normalizedStatus === 'failed' || normalizedStatus === 'stuck') return 'failure';

  return hasError ? 'failure' : 'success';
}

function getSessionOutcomeDisplay(session) {
  session = session || {};
  var outcomeDetails = session.outcomeDetails && typeof session.outcomeDetails === 'object'
    ? session.outcomeDetails
    : {};
  var outcome = normalizeAutomationOutcome(
    session.outcome || outcomeDetails.outcome,
    session.status || outcomeDetails.outcome,
    Boolean(session.error || outcomeDetails.error)
  );

  return {
    outcome: outcome,
    statusClass: outcome === 'success'
      ? 'completed'
      : outcome === 'partial'
        ? 'partial'
        : outcome === 'stopped'
          ? 'stopped'
          : 'error',
    statusLabel: outcome === 'success'
      ? 'completed'
      : outcome === 'partial'
        ? 'partial'
        : outcome === 'stopped'
          ? 'stopped'
          : 'failed',
    summary: outcomeDetails.summary || session.result || null,
    blocker: outcomeDetails.blocker || session.blocker || null,
    nextStep: outcomeDetails.nextStep || session.nextStep || null,
    resultText: session.completionMessage || outcomeDetails.result || session.result || outcomeDetails.summary || null,
    error: session.error || outcomeDetails.error || null
  };
}

function removeLoginPrompt() {
  const existing = document.getElementById('login-prompt');
  if (existing) {
    existing.remove();
  }
}

function removePaymentPrompt() {
  const existing = document.getElementById('payment-prompt');
  if (existing) {
    existing.remove();
  }
}

function getLatestThreadSessionRecord(sessionIndex, sessionStorage, threadHistorySessionId) {
  if (!threadHistorySessionId) return null;

  var candidates = (sessionIndex || []).filter(function(entry) {
    var entryHistorySessionId = entry?.historySessionId || entry?.id || null;
    return entry?.id === threadHistorySessionId || entryHistorySessionId === threadHistorySessionId;
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(function(a, b) {
    var aTime = a?.endTime || a?.startTime || 0;
    var bTime = b?.endTime || b?.startTime || 0;
    return bTime - aTime;
  });

  var latest = candidates[0];
  return (sessionStorage && latest?.id && sessionStorage[latest.id]) || latest || null;
}

function renderAutomationCompletionPayload(payload) {
  payload = payload || {};

  if (payload.sessionId && lastRenderedTerminalSessionId === payload.sessionId) {
    return;
  }

  if (payload.historySessionId) {
    historySessionId = payload.historySessionId;
  } else if (!historySessionId && payload.sessionId) {
    historySessionId = payload.sessionId;
  }

  if (payload.conversationId) {
    activeConversationId = payload.conversationId;
  }

  persistSidepanelThreadState();
  removeLoginPrompt();

  var outcome = normalizeAutomationOutcome(
    payload.outcome,
    payload.outcomeDetails?.outcome,
    Boolean(payload.error || payload.outcomeDetails?.error)
  );
  var completionMessage = payload.result ||
    payload.outcomeDetails?.result ||
    payload.outcomeDetails?.summary ||
    'The automation completed but no summary was provided. Please try again if the task wasn\'t completed as expected.';

  if (outcome === 'failure') {
    var errorMessage = payload.error || payload.outcomeDetails?.error || completionMessage || 'Automation error';
    setErrorState();
    if (currentStatusMessage) {
      completeStatusMessage('Error: ' + errorMessage, 'error');
    } else {
      addCompletionMessage('Error: ' + errorMessage, 'error');
    }
  } else if (currentStatusMessage) {
    completeStatusMessage(
      completionMessage,
      outcome === 'partial' ? 'partial' : (outcome === 'stopped' ? 'system' : undefined)
    );
  } else if (outcome === 'stopped') {
    addMessage(completionMessage, 'system');
  } else {
    addCompletionMessage(completionMessage, 'ai', outcome === 'partial');
  }

  setIdleState();
  currentSessionId = null;
  lastRenderedTerminalSessionId = payload.sessionId || historySessionId || null;

  if (isHistoryViewActive) {
    loadHistoryList();
  }

  if (outcome === 'partial') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentUrl = tabs[0]?.url;
        if (currentUrl && currentUrl.startsWith('http')) {
          const domain = new URL(currentUrl).hostname;
          const siteMapCheck = await chrome.runtime.sendMessage({
            action: 'checkSiteMap',
            domain
          });

          if (!siteMapCheck || !siteMapCheck.exists) {
            const reconDiv = document.createElement('div');
            reconDiv.className = 'message system new recon-suggestion';
            const textSpan = document.createElement('span');
            textSpan.className = 'recon-suggestion-text';
            textSpan.textContent = 'This site does not have a map yet. Reconnaissance can help FSB learn the site structure for better performance.';
            reconDiv.appendChild(textSpan);

            const reconBtn = document.createElement('button');
            reconBtn.className = 'recon-btn';
            reconBtn.id = 'reconFromSidepanel';
            reconBtn.textContent = 'Run Reconnaissance';
            reconBtn.addEventListener('click', () => {
              startReconFromSidepanel(currentUrl, payload.task || completionMessage);
            });
            reconDiv.appendChild(reconBtn);

            chatMessages.appendChild(reconDiv);
            scrollToBottom();
          }
        }
      } catch (e) {
        console.warn('Recon suggestion check failed:', e.message);
      }
    })();
  }
}

async function recoverLatestThreadTerminalOutcome(options = {}) {
  if (!historySessionId || isHistoryViewActive) {
    return;
  }

  var force = options.force === true;

  try {
    var stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    var sessionStorage = stored.fsbSessionLogs || {};
    var sessionIndex = stored.fsbSessionIndex || [];
    var latestSession = getLatestThreadSessionRecord(sessionIndex, sessionStorage, historySessionId);

    if (!latestSession) {
      return;
    }

    var latestStatus = typeof latestSession.status === 'string'
      ? latestSession.status.trim().toLowerCase()
      : '';
    if (latestStatus === 'running' || latestStatus === 'replaying') {
      return;
    }
    if (!force && lastRenderedTerminalSessionId === latestSession.id) {
      return;
    }
    if (isRunning && currentSessionId && currentSessionId !== latestSession.id) {
      return;
    }

    var outcomeInfo = getSessionOutcomeDisplay(latestSession);
    if (!outcomeInfo.summary && !outcomeInfo.resultText && !outcomeInfo.error) {
      return;
    }

    renderAutomationCompletionPayload({
      sessionId: latestSession.id,
      conversationId: latestSession.conversationId || activeConversationId || null,
      historySessionId: latestSession.historySessionId || historySessionId || latestSession.id,
      outcome: latestSession.outcome || outcomeInfo.outcome,
      outcomeDetails: latestSession.outcomeDetails || null,
      result: latestSession.completionMessage || latestSession.result || null,
      error: latestSession.error || null,
      blocker: latestSession.blocker || null,
      nextStep: latestSession.nextStep || null,
      task: latestSession.task || null
    });
  } catch (error) {
    console.warn('Failed to recover latest thread terminal outcome:', error);
  }
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
        // Refresh history list if history view is active
        if (isHistoryViewActive) {
          loadHistoryList();
        }

        // Check if reconnaissance could help (partial/stuck completions on unmapped sites)
        if (isPartial) {
          (async () => {
            try {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              const currentUrl = tabs[0]?.url;
              if (currentUrl && currentUrl.startsWith('http')) {
                const domain = new URL(currentUrl).hostname;
                const siteMapCheck = await chrome.runtime.sendMessage({
                  action: 'checkSiteMap',
                  domain
                });

                if (!siteMapCheck || !siteMapCheck.exists) {
                  const reconDiv = document.createElement('div');
                  reconDiv.className = 'message system new recon-suggestion';
                  const textSpan = document.createElement('span');
                  textSpan.className = 'recon-suggestion-text';
                  textSpan.textContent = 'This site does not have a map yet. Reconnaissance can help FSB learn the site structure for better performance.';
                  reconDiv.appendChild(textSpan);

                  const reconBtn = document.createElement('button');
                  reconBtn.className = 'recon-btn';
                  reconBtn.id = 'reconFromSidepanel';
                  reconBtn.textContent = 'Run Reconnaissance';
                  reconBtn.addEventListener('click', () => {
                    startReconFromSidepanel(currentUrl, request.task || completionMessage);
                  });
                  reconDiv.appendChild(reconBtn);

                  chatMessages.appendChild(reconDiv);
                  scrollToBottom();
                }
              }
            } catch (e) {
              console.warn('Recon suggestion check failed:', e.message);
            }
          })();
        }
      }
      break;

    case 'statusUpdate':
      if (request.sessionId === currentSessionId) {
        // Auto-switch to chat view if user is on history while automation runs
        if (isHistoryViewActive) {
          showChatView();
        }
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

        // Provide specific guidance for stuck scenarios
        if (request.error && request.error.includes('stuck')) {
          addMessage('The automation got stuck repeating the same actions. Here are some tips:', 'system');
          addMessage('Try being more specific about what you want to achieve', 'system');
          addMessage('Check if the page requires manual steps like CAPTCHA solving', 'system');
          addMessage('Ensure the page has fully loaded before starting', 'system');
        }

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
          addMessage('No worries! The side panel is still here. Try again or ask for help with something else.', 'system');
        }

        // Recon suggestion for stuck errors is handled in automationComplete (partial: true)
        // since stuck sessions send automationComplete with partial flag, not automationError.
      }
      break;

    case 'loginDetected':
      if (request.sessionId === currentSessionId) {
        // Pause the status loader
        if (currentStatusMessage) {
          updateStatusMessage('Login page detected...');
        }
        showLoginPrompt(request.domain, request.fields);
        sendResponse({ received: true });
      }
      return;

    case 'paymentFillConfirmation':
      showPaymentFillConfirmation(request);
      break;

    case 'sessionStateEvent':
      if (request.sessionId !== currentSessionId) break;
      switch (request.eventType) {
        case 'iteration_complete':
          if (currentStatusMessage && isRunning) {
            updateStatusMessage('Step ' + request.iteration + ' complete', {
              iteration: request.iteration,
              maxIterations: 100,
              progressPercent: Math.min(100, Math.round((request.iteration / 100) * 100))
            });
          }
          break;
        case 'session_ended':
          if (!isRunning) break;
          setIdleState();
          if (isHistoryViewActive) {
            loadHistoryList();
          }
          break;
        case 'tool_executed':
          if (showSidepanelProgressEnabled && isRunning) {
            addActionMessage(request.toolName + (request.success ? '' : ' [failed]'));
          }
          break;
        case 'error_occurred':
          console.warn('[FSB] emitter error:', request.error);
          break;
      }
      break;
  }
});

// Show inline login prompt in the chat
function showLoginPrompt(domain, fields) {
  // Prevent duplicate prompts if rapid loginDetected messages arrive
  const existing = document.getElementById('login-prompt');
  if (existing) existing.remove();

  // Complete any active status message
  if (currentStatusMessage) {
    completeStatusMessage('Login required', 'system');
  }

  const container = document.createElement('div');
  container.className = 'message login-prompt new';
  container.id = 'login-prompt';

  const fieldLabel = (fields && fields.usernameType === 'email') ? 'Email' : 'Username / Email';

  // Escape domain for safe HTML insertion
  const safeDomain = (domain || 'this site').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const authPrompt = null;
  const promptDetail = (authPrompt && authPrompt.detail) || 'Submit credentials once to let FSB sign in and resume this same session.';
  const handoffDetail = (authPrompt && authPrompt.handoff) || 'If you skip or the site still needs manual approval, FSB will preserve the completed work and finish with a manual handoff.';
  const allowSave = authPrompt?.allowSave !== false;
  const saveDisabledReason = authPrompt?.saveDisabledReason || 'Saving is unavailable for this session.';
  const safeSubtext = `${promptDetail} ${handoffDetail}`.trim().replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const safeSaveDisabledReason = saveDisabledReason.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

  container.innerHTML = `
    <div class="login-prompt-header">
      <i class="fas fa-lock"></i>
      <span>Login Required</span>
    </div>
    <div class="login-prompt-domain">${safeDomain}</div>
    <div class="login-prompt-subtext">Enter your credentials to sign in. They will be encrypted and saved for future use.</div>
    <div class="login-prompt-form">
      <div class="login-prompt-field">
        <label>${fieldLabel}</label>
        <input type="text" id="loginPromptUsername" placeholder="${fieldLabel}" autocomplete="username">
      </div>
      <div class="login-prompt-field">
        <label>Password</label>
        <div class="login-prompt-password-wrapper">
          <input type="password" id="loginPromptPassword" placeholder="Password" autocomplete="current-password">
          <button type="button" class="login-prompt-eye" id="loginPromptTogglePw">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      </div>
      <label class="login-prompt-save-label">
        <input type="checkbox" id="loginPromptSave" ${allowSave ? 'checked' : ''} ${allowSave ? '' : 'disabled'}>
        <span>Save for future use</span>
      </label>
      ${allowSave ? '' : `<div class="login-prompt-subtext">${safeSaveDisabledReason}</div>`}
      <div class="login-prompt-actions">
        <button class="login-prompt-btn primary" id="loginPromptSubmit">Sign In</button>
        <button class="login-prompt-btn ghost" id="loginPromptSkip">Skip</button>
      </div>
    </div>
  `;

  chatMessages.appendChild(container);
  scrollToBottom();

  // Remove 'new' class after animation
  setTimeout(() => container.classList.remove('new'), 400);

  // Focus username field
  setTimeout(() => {
    const usernameInput = document.getElementById('loginPromptUsername');
    if (usernameInput) usernameInput.focus();
  }, 100);

  // Toggle password visibility
  const toggleBtn = document.getElementById('loginPromptTogglePw');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const pwField = document.getElementById('loginPromptPassword');
      if (pwField) {
        const isPassword = pwField.type === 'password';
        pwField.type = isPassword ? 'text' : 'password';
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Sign In button
  const submitBtn = document.getElementById('loginPromptSubmit');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const username = document.getElementById('loginPromptUsername')?.value?.trim();
      const password = document.getElementById('loginPromptPassword')?.value;
      const save = document.getElementById('loginPromptSave')?.checked ?? true;

      if (!username && !password) {
        return;
      }

      // Send credentials to background
      chrome.runtime.sendMessage({
        action: 'loginFormSubmitted',
        sessionId: currentSessionId,
        domain: domain,
        credentials: { username, password },
        save: save
      });

      // Remove prompt from chat
      container.remove();

      // Add system message
      addMessage('Signing in...', 'system');
      addStatusMessage('Signing in...');
    });
  }

  // Skip button
  const skipBtn = document.getElementById('loginPromptSkip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'loginSkipped',
        sessionId: currentSessionId
      });

      // Remove prompt
      container.remove();
      addMessage('Login skipped. Continuing automation...', 'system');
      addStatusMessage('Continuing...');
    });
  }

  // Handle Enter key in password field
  const pwField = document.getElementById('loginPromptPassword');
  if (pwField) {
    pwField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitBtn?.click();
      }
    });
  }
}

function showPaymentPrompt(domain, paymentPrompt) {
  removePaymentPrompt();

  const methods = Array.isArray(paymentPrompt?.methods) ? paymentPrompt.methods : [];
  const available = paymentPrompt?.available === true && methods.length > 0;
  const state = paymentPrompt?.state || (available ? 'available' : 'unavailable');
  const container = document.createElement('div');
  container.className = 'message payment-prompt new';
  container.id = 'payment-prompt';

  const safeDomain = escapeHtml(domain || 'this checkout');
  const headerText = 'Checkout Detected';
  const detailText = escapeHtml(paymentPrompt?.detail || paymentPrompt?.blockedReason || 'Saved payment methods are not available for this checkout.');
  const stateLabelMap = {
    no_saved_methods: 'No saved cards',
    feature_disabled: 'Payments disabled',
    vault_not_configured: 'Vault setup required',
    vault_locked: 'Vault locked',
    payment_locked: 'Payment access locked'
  };
  const stateLabel = escapeHtml(stateLabelMap[state] || 'Saved payments unavailable');
  const primaryAction = paymentPrompt?.primaryAction || '';
  const primaryActionLabel = escapeHtml(paymentPrompt?.primaryActionLabel || 'Open Payments');

  if (!available) {
    container.innerHTML = `
      <div class="login-prompt-header">
        <i class="fas fa-credit-card"></i>
        <span>${headerText}</span>
      </div>
      <div class="login-prompt-domain">${safeDomain}</div>
      <div class="payment-prompt-state">${stateLabel}</div>
      <div class="login-prompt-subtext">${detailText}</div>
      <div class="login-prompt-actions">
        ${primaryAction ? `<button class="login-prompt-btn primary" id="paymentPromptPrimaryAction">${primaryActionLabel}</button>` : ''}
        <button class="login-prompt-btn ghost" id="paymentPromptDismiss">Dismiss</button>
      </div>
    `;

    chatMessages.appendChild(container);
    scrollToBottom();
    setTimeout(() => container.classList.remove('new'), 400);

    const dismissBtn = document.getElementById('paymentPromptDismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        container.remove();
      });
    }

    const primaryActionBtn = document.getElementById('paymentPromptPrimaryAction');
    if (primaryActionBtn) {
      primaryActionBtn.addEventListener('click', () => {
        if (primaryAction === 'open_payments_section') {
          openControlPanelSection('payments');
        } else if (primaryAction === 'open_passwords_section') {
          openControlPanelSection('passwords');
        }
      });
    }
    return;
  }

  const methodOptions = methods.map((method, index) => {
    const brandLabelMap = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'AmEx',
      discover: 'Discover',
      diners: 'Diners',
      jcb: 'JCB'
    };
    const brandLabel = brandLabelMap[method.cardBrand] || 'Unknown';
    const title = escapeHtml(method.nickname || `${brandLabel} ending in ${method.last4 || '****'}`);
    const subtitle = escapeHtml(`${method.maskedNumber || '****'}${method.expiryMonth && method.expiryYearLast2 ? ` | Exp ${method.expiryMonth}/${method.expiryYearLast2}` : ''}`);
    const billing = escapeHtml(method.billingSummary || 'Billing profile stored');
    const brand = (method.cardBrand || 'unknown').replace(/[^a-z]/gi, '').toLowerCase() || 'unknown';
    return `
      <button class="payment-prompt-option ${index === 0 ? 'selected' : ''}" data-payment-id="${method.id}">
        <div class="payment-prompt-option-top">
          <span class="payment-card-brand ${brand}">${escapeHtml(brandLabel)}</span>
          <span class="payment-prompt-option-title">${title}</span>
        </div>
        <div class="payment-prompt-option-subtitle">${subtitle}</div>
        <div class="payment-prompt-option-billing">${billing}</div>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="login-prompt-header">
      <i class="fas fa-credit-card"></i>
      <span>${headerText}</span>
    </div>
    <div class="login-prompt-domain">${safeDomain}</div>
    <div class="login-prompt-subtext">${detailText}</div>
    <div class="payment-prompt-options">${methodOptions}</div>
    <div class="login-prompt-actions">
      <button class="login-prompt-btn primary" id="paymentPromptFill">Fill Saved Card</button>
      <button class="login-prompt-btn ghost" id="paymentPromptSkip">Skip</button>
    </div>
  `;

  chatMessages.appendChild(container);
  scrollToBottom();
  setTimeout(() => container.classList.remove('new'), 400);

  let selectedPaymentId = methods[0]?.id || null;
  const optionButtons = container.querySelectorAll('.payment-prompt-option');
  optionButtons.forEach((optionBtn) => {
    optionBtn.addEventListener('click', () => {
      optionButtons.forEach(btn => btn.classList.remove('selected'));
      optionBtn.classList.add('selected');
      selectedPaymentId = optionBtn.dataset.paymentId || null;
    });
  });

  const fillBtn = document.getElementById('paymentPromptFill');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      if (!selectedPaymentId) return;
      chrome.runtime.sendMessage({
        action: 'paymentMethodSelected',
        sessionId: currentSessionId,
        paymentMethodId: selectedPaymentId
      });
      container.remove();
      addMessage('Saved payment method selected. FSB will fill the card details, but it will not submit the final payment for you.', 'system');
      addStatusMessage('Filling saved card...');
    });
  }

  const skipBtn = document.getElementById('paymentPromptSkip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'paymentSkipped',
        sessionId: currentSessionId
      });
      container.remove();
      addMessage('Saved payment method skipped. Review the checkout form manually before any final payment step.', 'system');
    });
  }
}


/**
 * Show payment fill confirmation overlay.
 * Called when AI autopilot invokes fill_payment_method -- background sends confirmation
 * request with card brand, last 4, and merchant domain. User must approve or deny.
 */
function showPaymentFillConfirmation(data) {
  const overlay = document.getElementById('paymentFillConfirmOverlay');
  if (!overlay) return;

  const brandLabelMap = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'AmEx',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB'
  };

  const brandEl = document.getElementById('pfcBrand');
  const last4El = document.getElementById('pfcLast4');
  const domainEl = document.getElementById('pfcDomain');

  if (brandEl) brandEl.textContent = brandLabelMap[data.cardBrand] || data.cardBrand || 'Card';
  if (last4El) last4El.textContent = '****' + (data.last4 || '****');
  if (domainEl) domainEl.textContent = 'on ' + (data.merchantDomain || 'this page');

  overlay.classList.remove('hidden');

  // Wire Allow button
  const allowBtn = document.getElementById('pfcAllow');
  const denyBtn = document.getElementById('pfcDeny');

  function cleanup() {
    overlay.classList.add('hidden');
    if (allowBtn) allowBtn.removeEventListener('click', onAllow);
    if (denyBtn) denyBtn.removeEventListener('click', onDeny);
  }

  function onAllow() {
    cleanup();
    chrome.runtime.sendMessage({
      action: 'paymentFillApproved',
      paymentMethodId: data.paymentMethodId
    }).catch(() => {});
  }

  function onDeny() {
    cleanup();
    chrome.runtime.sendMessage({
      action: 'paymentFillDenied',
      paymentMethodId: data.paymentMethodId
    }).catch(() => {});
  }

  if (allowBtn) allowBtn.addEventListener('click', onAllow);
  if (denyBtn) denyBtn.addEventListener('click', onDeny);
}

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

// Handle side panel specific events
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Side panel became visible - refresh status if needed
    console.log('Side panel became visible');
  }
});


// ==========================================
// Session History Functions
// ==========================================

function toggleHistoryView() {
  if (isHistoryViewActive) {
    showChatView();
  } else {
    showHistoryView();
  }
}

function showHistoryView() {
  document.querySelector('.chat-messages-area').classList.add('hidden');
  document.querySelector('.chat-input-area').classList.add('hidden');
  document.getElementById('historyView').classList.remove('hidden');
  historyBtn.classList.add('active');
  isHistoryViewActive = true;
  loadHistoryList();
}

function showChatView() {
  document.querySelector('.chat-messages-area').classList.remove('hidden');
  document.querySelector('.chat-input-area').classList.remove('hidden');
  document.getElementById('historyView').classList.add('hidden');
  historyBtn.classList.remove('active');
  isHistoryViewActive = false;
}

async function loadHistoryList() {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;

  try {
    const stored = await chrome.storage.local.get(['fsbSessionIndex']);
    const sessions = stored.fsbSessionIndex || [];

    if (sessions.length === 0) {
      historyList.innerHTML = '<div class="history-empty-state">' +
        '<i class="fa fa-inbox"></i>' +
        '<p>No sessions yet. Run an automation to see your history here.</p>' +
        '</div>';
      return;
    }

    historyList.innerHTML = sessions.map(function(session) {
      var costDisplay = session.totalCost > 0
        ? '<span class="history-cost">$' + session.totalCost.toFixed(4) + '</span>'
        : '';
      return '<div class="history-item" data-session-id="' + escapeHtml(session.id) + '">' +
        '<div class="history-item-info">' +
          '<div class="history-item-task">' + escapeHtml(session.task || 'Unknown task') + '</div>' +
          '<div class="history-item-meta">' +
            '<span>' + formatSessionDate(session.startTime) + '</span>' +
            '<span>' + (session.actionCount || 0) + ' actions</span>' +
            costDisplay +
            '<span class="history-status ' + (session.status || '') + '">' + escapeHtml(session.status || 'unknown') + '</span>' +
          '</div>' +
        '</div>' +
        (session.actionCount > 0 ?
          '<button class="history-replay-btn" data-session-id="' + escapeHtml(session.id) + '" title="Replay session">' +
            '<i class="fa fa-play"></i>' +
          '</button>' : '') +
        '<button class="history-delete-btn" data-session-id="' + escapeHtml(session.id) + '" title="Delete session">' +
          '<i class="fa fa-trash"></i>' +
        '</button>' +
      '</div>';
    }).join('');
  } catch (error) {
    console.error('Failed to load history list:', error);
    historyList.innerHTML = '<div class="history-empty-state">' +
      '<i class="fa fa-exclamation-triangle"></i>' +
      '<p>Failed to load sessions.</p>' +
      '</div>';
  }
}

async function startReplay(sessionId) {
  if (isRunning) {
    addMessage('Cannot replay while another automation is running. Stop the current task first.', 'system');
    return;
  }

  // Switch to chat view to show replay progress
  if (isHistoryViewActive) {
    showChatView();
  }

  addMessage('Starting replay...', 'system');
  addStatusMessage('Preparing replay...');

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'replaySession',
        sessionId: sessionId
      }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (response && response.success) {
      currentSessionId = response.sessionId;
      setRunningState();
      updateStatusMessage('Replaying...');
    } else {
      completeStatusMessage(response?.error || 'Failed to start replay', 'error');
      addMessage(response?.error || 'Failed to start replay.', 'error');
    }
  } catch (error) {
    completeStatusMessage('Replay error', 'error');
    addMessage('Failed to start replay: ' + error.message, 'error');
  }
}

async function deleteHistorySession(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const sessionIndex = stored.fsbSessionIndex || [];
    delete sessionStorage[sessionId];
    const updatedIndex = sessionIndex.filter(function(s) { return s.id !== sessionId; });
    await chrome.storage.local.set({
      fsbSessionLogs: sessionStorage,
      fsbSessionIndex: updatedIndex
    });
    loadHistoryList();
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

async function loadSessionView(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const session = sessionStorage[sessionId];

    if (!session) {
      addMessage('Session data not found.', 'error');
      return;
    }

    // Switch to chat view and clear existing messages
    showChatView();
    chatMessages.innerHTML = '';

    // Show the original task as a user message
    addMessage(session.task || 'Unknown task', 'user');

    // Show action history entries
    var actions = session.actionHistory || [];
    if (actions.length > 0) {
      addMessage('Session had ' + actions.length + ' action(s):', 'system');
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var tool = action.tool || 'unknown';
        var success = action.result?.success !== false;
        var params = '';
        if (action.params) {
          try {
            params = '(' + Object.entries(action.params)
              .map(function(entry) { return entry[0] + ': "' + String(entry[1]).substring(0, 60) + '"'; })
              .join(', ') + ')';
          } catch (e) {
            params = '';
          }
        }
        var label = (success ? '[OK] ' : '[FAIL] ') + tool + params;
        addMessage(label, 'action');
      }
    } else {
      addMessage('No actions were recorded in this session.', 'system');
    }

    // Show session status footer
    var status = session.status || 'unknown';
    var endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'N/A';
    addMessage('Session ' + status + ' at ' + endTime, 'system');

  } catch (error) {
    console.error('Failed to load session view:', error);
    addMessage('Failed to load session: ' + error.message, 'error');
  }
}

async function clearAllHistorySessions() {
  if (!confirm('Delete all session history? This cannot be undone.')) return;
  try {
    await chrome.storage.local.remove(['fsbSessionLogs', 'fsbSessionIndex']);
    loadHistoryList();
  } catch (error) {
    console.error('Failed to clear all sessions:', error);
  }
}

function formatSessionDate(timestamp) {
  if (!timestamp) return 'Unknown';
  var date = new Date(timestamp);
  var now = new Date();
  var diffMs = now - date;
  var diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) {
    var mins = Math.floor(diffMs / (1000 * 60));
    return mins + 'm ago';
  } else if (diffHours < 24) {
    return Math.floor(diffHours) + 'h ago';
  } else if (diffHours < 48) {
    return 'Yesterday';
  }
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


console.log('FSB v0.9.50 side panel script loaded');

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