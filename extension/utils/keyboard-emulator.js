// keyboard-emulator.js - Chrome DevTools Protocol Keyboard Emulation
// Provides comprehensive keyboard input emulation using Chrome Debugger API

/**
 * Comprehensive keyboard key mappings for Chrome DevTools Protocol Input.dispatchKeyEvent
 * Based on Windows Virtual Key Codes and DOM Key Values
 */
const KEY_MAPPINGS = {
  // Letters
  'a': { code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 },
  'b': { code: 'KeyB', key: 'b', windowsVirtualKeyCode: 66, nativeVirtualKeyCode: 66 },
  'c': { code: 'KeyC', key: 'c', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 },
  'd': { code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 },
  'e': { code: 'KeyE', key: 'e', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 },
  'f': { code: 'KeyF', key: 'f', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 },
  'g': { code: 'KeyG', key: 'g', windowsVirtualKeyCode: 71, nativeVirtualKeyCode: 71 },
  'h': { code: 'KeyH', key: 'h', windowsVirtualKeyCode: 72, nativeVirtualKeyCode: 72 },
  'i': { code: 'KeyI', key: 'i', windowsVirtualKeyCode: 73, nativeVirtualKeyCode: 73 },
  'j': { code: 'KeyJ', key: 'j', windowsVirtualKeyCode: 74, nativeVirtualKeyCode: 74 },
  'k': { code: 'KeyK', key: 'k', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75 },
  'l': { code: 'KeyL', key: 'l', windowsVirtualKeyCode: 76, nativeVirtualKeyCode: 76 },
  'm': { code: 'KeyM', key: 'm', windowsVirtualKeyCode: 77, nativeVirtualKeyCode: 77 },
  'n': { code: 'KeyN', key: 'n', windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78 },
  'o': { code: 'KeyO', key: 'o', windowsVirtualKeyCode: 79, nativeVirtualKeyCode: 79 },
  'p': { code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 },
  'q': { code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81 },
  'r': { code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82, nativeVirtualKeyCode: 82 },
  's': { code: 'KeyS', key: 's', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 },
  't': { code: 'KeyT', key: 't', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84 },
  'u': { code: 'KeyU', key: 'u', windowsVirtualKeyCode: 85, nativeVirtualKeyCode: 85 },
  'v': { code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 },
  'w': { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 },
  'x': { code: 'KeyX', key: 'x', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 },
  'y': { code: 'KeyY', key: 'y', windowsVirtualKeyCode: 89, nativeVirtualKeyCode: 89 },
  'z': { code: 'KeyZ', key: 'z', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 },

  // Numbers
  '0': { code: 'Digit0', key: '0', windowsVirtualKeyCode: 48, nativeVirtualKeyCode: 48 },
  '1': { code: 'Digit1', key: '1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49 },
  '2': { code: 'Digit2', key: '2', windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50 },
  '3': { code: 'Digit3', key: '3', windowsVirtualKeyCode: 51, nativeVirtualKeyCode: 51 },
  '4': { code: 'Digit4', key: '4', windowsVirtualKeyCode: 52, nativeVirtualKeyCode: 52 },
  '5': { code: 'Digit5', key: '5', windowsVirtualKeyCode: 53, nativeVirtualKeyCode: 53 },
  '6': { code: 'Digit6', key: '6', windowsVirtualKeyCode: 54, nativeVirtualKeyCode: 54 },
  '7': { code: 'Digit7', key: '7', windowsVirtualKeyCode: 55, nativeVirtualKeyCode: 55 },
  '8': { code: 'Digit8', key: '8', windowsVirtualKeyCode: 56, nativeVirtualKeyCode: 56 },
  '9': { code: 'Digit9', key: '9', windowsVirtualKeyCode: 57, nativeVirtualKeyCode: 57 },

  // Function Keys
  'F1': { code: 'F1', key: 'F1', windowsVirtualKeyCode: 112, nativeVirtualKeyCode: 112 },
  'F2': { code: 'F2', key: 'F2', windowsVirtualKeyCode: 113, nativeVirtualKeyCode: 113 },
  'F3': { code: 'F3', key: 'F3', windowsVirtualKeyCode: 114, nativeVirtualKeyCode: 114 },
  'F4': { code: 'F4', key: 'F4', windowsVirtualKeyCode: 115, nativeVirtualKeyCode: 115 },
  'F5': { code: 'F5', key: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 },
  'F6': { code: 'F6', key: 'F6', windowsVirtualKeyCode: 117, nativeVirtualKeyCode: 117 },
  'F7': { code: 'F7', key: 'F7', windowsVirtualKeyCode: 118, nativeVirtualKeyCode: 118 },
  'F8': { code: 'F8', key: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119 },
  'F9': { code: 'F9', key: 'F9', windowsVirtualKeyCode: 120, nativeVirtualKeyCode: 120 },
  'F10': { code: 'F10', key: 'F10', windowsVirtualKeyCode: 121, nativeVirtualKeyCode: 121 },
  'F11': { code: 'F11', key: 'F11', windowsVirtualKeyCode: 122, nativeVirtualKeyCode: 122 },
  'F12': { code: 'F12', key: 'F12', windowsVirtualKeyCode: 123, nativeVirtualKeyCode: 123 },
  'F13': { code: 'F13', key: 'F13', windowsVirtualKeyCode: 124, nativeVirtualKeyCode: 124 },
  'F14': { code: 'F14', key: 'F14', windowsVirtualKeyCode: 125, nativeVirtualKeyCode: 125 },
  'F15': { code: 'F15', key: 'F15', windowsVirtualKeyCode: 126, nativeVirtualKeyCode: 126 },
  'F16': { code: 'F16', key: 'F16', windowsVirtualKeyCode: 127, nativeVirtualKeyCode: 127 },
  'F17': { code: 'F17', key: 'F17', windowsVirtualKeyCode: 128, nativeVirtualKeyCode: 128 },
  'F18': { code: 'F18', key: 'F18', windowsVirtualKeyCode: 129, nativeVirtualKeyCode: 129 },
  'F19': { code: 'F19', key: 'F19', windowsVirtualKeyCode: 130, nativeVirtualKeyCode: 130 },
  'F20': { code: 'F20', key: 'F20', windowsVirtualKeyCode: 131, nativeVirtualKeyCode: 131 },
  'F21': { code: 'F21', key: 'F21', windowsVirtualKeyCode: 132, nativeVirtualKeyCode: 132 },
  'F22': { code: 'F22', key: 'F22', windowsVirtualKeyCode: 133, nativeVirtualKeyCode: 133 },
  'F23': { code: 'F23', key: 'F23', windowsVirtualKeyCode: 134, nativeVirtualKeyCode: 134 },
  'F24': { code: 'F24', key: 'F24', windowsVirtualKeyCode: 135, nativeVirtualKeyCode: 135 },

  // Arrow Keys
  'ArrowUp': { code: 'ArrowUp', key: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
  'ArrowDown': { code: 'ArrowDown', key: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
  'ArrowLeft': { code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
  'ArrowRight': { code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },

  // Navigation Keys
  'Home': { code: 'Home', key: 'Home', windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36 },
  'End': { code: 'End', key: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 },
  'PageUp': { code: 'PageUp', key: 'PageUp', windowsVirtualKeyCode: 33, nativeVirtualKeyCode: 33 },
  'PageDown': { code: 'PageDown', key: 'PageDown', windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 },

  // Editing Keys
  'Insert': { code: 'Insert', key: 'Insert', windowsVirtualKeyCode: 45, nativeVirtualKeyCode: 45 },
  'Delete': { code: 'Delete', key: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 },
  'Backspace': { code: 'Backspace', key: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },

  // Special Keys
  'Enter': { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
  'Tab': { code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  'Escape': { code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
  'Space': { code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },

  // Modifier Keys
  'Shift': { code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 },
  'Control': { code: 'ControlLeft', key: 'Control', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 },
  'Alt': { code: 'AltLeft', key: 'Alt', windowsVirtualKeyCode: 18, nativeVirtualKeyCode: 18 },
  'Meta': { code: 'MetaLeft', key: 'Meta', windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91 },

  // Symbols (commonly used)
  '`': { code: 'Backquote', key: '`', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192 },
  '-': { code: 'Minus', key: '-', windowsVirtualKeyCode: 189, nativeVirtualKeyCode: 189 },
  '=': { code: 'Equal', key: '=', windowsVirtualKeyCode: 187, nativeVirtualKeyCode: 187 },
  '[': { code: 'BracketLeft', key: '[', windowsVirtualKeyCode: 219, nativeVirtualKeyCode: 219 },
  ']': { code: 'BracketRight', key: ']', windowsVirtualKeyCode: 221, nativeVirtualKeyCode: 221 },
  '\\': { code: 'Backslash', key: '\\', windowsVirtualKeyCode: 220, nativeVirtualKeyCode: 220 },
  ';': { code: 'Semicolon', key: ';', windowsVirtualKeyCode: 186, nativeVirtualKeyCode: 186 },
  "'": { code: 'Quote', key: "'", windowsVirtualKeyCode: 222, nativeVirtualKeyCode: 222 },
  ',': { code: 'Comma', key: ',', windowsVirtualKeyCode: 188, nativeVirtualKeyCode: 188 },
  '.': { code: 'Period', key: '.', windowsVirtualKeyCode: 190, nativeVirtualKeyCode: 190 },
  '/': { code: 'Slash', key: '/', windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191 },

  // Numpad Keys
  'Numpad0': { code: 'Numpad0', key: '0', windowsVirtualKeyCode: 96, nativeVirtualKeyCode: 96 },
  'Numpad1': { code: 'Numpad1', key: '1', windowsVirtualKeyCode: 97, nativeVirtualKeyCode: 97 },
  'Numpad2': { code: 'Numpad2', key: '2', windowsVirtualKeyCode: 98, nativeVirtualKeyCode: 98 },
  'Numpad3': { code: 'Numpad3', key: '3', windowsVirtualKeyCode: 99, nativeVirtualKeyCode: 99 },
  'Numpad4': { code: 'Numpad4', key: '4', windowsVirtualKeyCode: 100, nativeVirtualKeyCode: 100 },
  'Numpad5': { code: 'Numpad5', key: '5', windowsVirtualKeyCode: 101, nativeVirtualKeyCode: 101 },
  'Numpad6': { code: 'Numpad6', key: '6', windowsVirtualKeyCode: 102, nativeVirtualKeyCode: 102 },
  'Numpad7': { code: 'Numpad7', key: '7', windowsVirtualKeyCode: 103, nativeVirtualKeyCode: 103 },
  'Numpad8': { code: 'Numpad8', key: '8', windowsVirtualKeyCode: 104, nativeVirtualKeyCode: 104 },
  'Numpad9': { code: 'Numpad9', key: '9', windowsVirtualKeyCode: 105, nativeVirtualKeyCode: 105 },
  'NumpadMultiply': { code: 'NumpadMultiply', key: '*', windowsVirtualKeyCode: 106, nativeVirtualKeyCode: 106 },
  'NumpadAdd': { code: 'NumpadAdd', key: '+', windowsVirtualKeyCode: 107, nativeVirtualKeyCode: 107 },
  'NumpadSubtract': { code: 'NumpadSubtract', key: '-', windowsVirtualKeyCode: 109, nativeVirtualKeyCode: 109 },
  'NumpadDecimal': { code: 'NumpadDecimal', key: '.', windowsVirtualKeyCode: 110, nativeVirtualKeyCode: 110 },
  'NumpadDivide': { code: 'NumpadDivide', key: '/', windowsVirtualKeyCode: 111, nativeVirtualKeyCode: 111 },
  'NumpadEnter': { code: 'NumpadEnter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },

  // Additional Keys
  'CapsLock': { code: 'CapsLock', key: 'CapsLock', windowsVirtualKeyCode: 20, nativeVirtualKeyCode: 20 },
  'NumLock': { code: 'NumLock', key: 'NumLock', windowsVirtualKeyCode: 144, nativeVirtualKeyCode: 144 },
  'ScrollLock': { code: 'ScrollLock', key: 'ScrollLock', windowsVirtualKeyCode: 145, nativeVirtualKeyCode: 145 },
  'PrintScreen': { code: 'PrintScreen', key: 'PrintScreen', windowsVirtualKeyCode: 44, nativeVirtualKeyCode: 44 },
  'Pause': { code: 'Pause', key: 'Pause', windowsVirtualKeyCode: 19, nativeVirtualKeyCode: 19 }
};

/**
 * Modifier key bit masks for Chrome DevTools Protocol
 */
const MODIFIER_MASKS = {
  Alt: 1,
  Control: 2,
  Meta: 4,  // Command/Windows key
  Shift: 8
};

/**
 * Determines if a key should include text parameter for Chrome DevTools Protocol
 * @param {string} key - The key identifier
 * @returns {boolean} True if key should include text parameter
 */
function isPrintableKey(key) {
  // Letters and numbers are printable
  if (/^[a-zA-Z0-9]$/.test(key)) {
    return true;
  }
  
  // Space is printable
  if (key === ' ' || key === 'Space') {
    return true;
  }
  
  // Common symbols are printable
  const printableSymbols = [
    '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/',
    '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+',
    '{', '}', '|', ':', '"', '<', '>', '?'
  ];
  
  if (printableSymbols.includes(key)) {
    return true;
  }
  
  // Everything else is non-printable (arrows, function keys, control keys, etc.)
  return false;
}

/**
 * Chrome DevTools Protocol Keyboard Emulator
 */
class KeyboardEmulator {
  constructor() {
    this.debuggerAttached = false;
    this.attachedTabId = null;
    this.attachPromise = null;
  }

  /**
   * Attach Chrome Debugger to the specified tab.
   * If already attached to a different tab, detach first.
   * @param {number} tabId - Tab ID to attach debugger to
   * @returns {Promise<boolean>} Success status
   */
  async attachDebugger(tabId) {
    // If already attached to THIS tab, reuse
    if (this.debuggerAttached && this.attachedTabId === tabId) {
      return true;
    }

    // If attached to a DIFFERENT tab, detach first
    if (this.debuggerAttached && this.attachedTabId !== null && this.attachedTabId !== tabId) {
      console.log(`[FSB KeyboardEmulator] Detaching from tab ${this.attachedTabId} before attaching to tab ${tabId}`);
      await this.detachDebugger(this.attachedTabId);
    }

    if (this.attachPromise) {
      return await this.attachPromise;
    }

    this.attachPromise = new Promise(async (resolve) => {
      // Bounded retry for transient navigation races. The force-detach-and-retry
      // on "Another debugger is already attached" counts as its own recovery; this
      // backoff is only for transient attach failures during navigation. Never an
      // unbounded loop, and we never hold the debugger persistently.
      const MAX_ATTEMPTS = 3;
      let lastError = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // Mirror background.js cdpInsertText/cdpMouseClick: if a stale debugger is
          // already attached, force-detach (swallowing errors -- the other debugger
          // may not be ours) then retry the attach once.
          try {
            await chrome.debugger.attach({ tabId }, '1.3');
          } catch (attachErr) {
            if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
              console.log(`[FSB KeyboardEmulator] Stale debugger detected on tab ${tabId}, force-detaching and retrying`);
              try {
                await chrome.debugger.detach({ tabId });
              } catch (forceDetachErr) {
                // Ignore -- the "other debugger" may not be ours
              }
              await chrome.debugger.attach({ tabId }, '1.3');
            } else {
              throw attachErr;
            }
          }
          this.debuggerAttached = true;
          this.attachedTabId = tabId;
          console.log(`[FSB KeyboardEmulator] Debugger attached to tab ${tabId}`);
          resolve(true);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < MAX_ATTEMPTS) {
            // Short backoff between transient attempts.
            await new Promise((r) => setTimeout(r, 150));
          }
        }
      }

      // All attempts exhausted -- clear the memoized promise so the NEXT keystroke
      // retries a real attach instead of returning this cached false forever.
      console.error('[FSB KeyboardEmulator] Failed to attach debugger:', lastError);
      this.debuggerAttached = false;
      this.attachedTabId = null;
      this.attachPromise = null;
      resolve(false);
    });

    return await this.attachPromise;
  }

  /**
   * Detach Chrome Debugger from the specified tab (or the currently attached tab)
   * @param {number} [tabId] - Tab ID to detach debugger from. If omitted, detaches from currently attached tab.
   */
  async detachDebugger(tabId) {
    const targetTabId = tabId || this.attachedTabId;
    if (!this.debuggerAttached || !targetTabId) return;

    try {
      await chrome.debugger.detach({ tabId: targetTabId });
      console.log(`[FSB KeyboardEmulator] Debugger detached from tab ${targetTabId}`);
    } catch (error) {
      // Debugger may already be detached (e.g., tab navigated or closed)
      console.log('[FSB KeyboardEmulator] Detach cleanup (may already be detached):', error.message);
    }
    this.debuggerAttached = false;
    this.attachedTabId = null;
    this.attachPromise = null;
  }

  /**
   * Check if the debugger is currently attached to a specific tab
   * @param {number} tabId - Tab ID to check
   * @returns {boolean} True if debugger is attached to this tab
   */
  isAttachedTo(tabId) {
    return this.debuggerAttached && this.attachedTabId === tabId;
  }

  /**
   * Reconcile internal state after a Chrome-initiated debugger detach (navigation,
   * canceled_by_user banner dismissal, target crash/close) on our attached tab.
   * Called from a background.js chrome.debugger.onDetach listener so a detach we did
   * not initiate does not leave stale debuggerAttached/attachedTabId/attachPromise
   * that would poison the next attach. No-op when the detach is for a different tab.
   * @param {number} tabId - Tab ID that Chrome detached the debugger from
   * @returns {boolean} True if this emulator's state was reset for tabId
   */
  handleExternalDetach(tabId) {
    if (this.attachedTabId !== tabId) {
      return false;
    }
    console.log(`[FSB KeyboardEmulator] External detach on tab ${tabId}, resetting state`);
    this.debuggerAttached = false;
    this.attachedTabId = null;
    this.attachPromise = null;
    return true;
  }

  /**
   * Calculate modifier mask from modifier flags
   * @param {Object} modifiers - Modifier key states
   * @returns {number} Modifier bit mask
   */
  calculateModifierMask(modifiers = {}) {
    let mask = 0;
    if (modifiers.alt) mask |= MODIFIER_MASKS.Alt;
    if (modifiers.ctrl || modifiers.control) mask |= MODIFIER_MASKS.Control;
    if (modifiers.meta || modifiers.cmd || modifiers.command) mask |= MODIFIER_MASKS.Meta;
    if (modifiers.shift) mask |= MODIFIER_MASKS.Shift;
    return mask;
  }

  /**
   * Send a single key event using Chrome DevTools Protocol
   * @param {number} tabId - Tab ID
   * @param {string} type - Event type: 'keyDown', 'keyUp', 'rawKeyDown', 'char'
   * @param {string} key - Key identifier
   * @param {Object} modifiers - Modifier key states
   * @returns {Promise<Object>} Result object
   */
  async sendKeyEvent(tabId, type, key, modifiers = {}) {
    try {
      const attached = await this.attachDebugger(tabId);
      if (!attached) {
        return { success: false, error: 'Failed to attach debugger' };
      }

      const keyData = KEY_MAPPINGS[key] || KEY_MAPPINGS[key.toLowerCase()];
      if (!keyData) {
        return { success: false, error: `Unknown key: ${key}` };
      }

      const modifierMask = this.calculateModifierMask(modifiers);

      const params = {
        type,
        modifiers: modifierMask,
        windowsVirtualKeyCode: keyData.windowsVirtualKeyCode,
        nativeVirtualKeyCode: keyData.nativeVirtualKeyCode,
        key: keyData.key,
        code: keyData.code
      };

      // Add text parameter only for printable keys WITHOUT modifier shortcuts.
      // When Ctrl/Meta/Alt modifiers are active, the key event is a shortcut (e.g. Cmd+V = paste),
      // NOT a character insertion. Including 'text' causes Chrome to treat it as character input
      // instead of firing the shortcut action.
      const hasShortcutModifier = modifiers.ctrl || modifiers.control || modifiers.meta || modifiers.cmd || modifiers.command || modifiers.alt;
      if ((type === 'char' || type === 'keyDown') && isPrintableKey(keyData.key) && !hasShortcutModifier) {
        if (modifiers.shift) {
          // Shift+letter: uppercase
          const isLetter = /^[a-z]$/.test(keyData.key);
          if (isLetter) {
            params.text = keyData.key.toUpperCase();
          } else {
            // Shift+number/symbol: produce the shifted character
            // e.g., shift+9 = '(', shift+7 = '&', shift+1 = '!'
            const SHIFT_CHAR_MAP = {
              '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
              '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
              '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|',
              ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~'
            };
            params.text = SHIFT_CHAR_MAP[keyData.key] || keyData.key;
          }
        } else {
          params.text = keyData.key;
        }
      }

      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', params);

      return { 
        success: true, 
        key,
        type,
        modifiers: modifierMask,
        params
      };

    } catch (error) {
      console.error('[FSB KeyboardEmulator] Key event failed:', error);
      return { 
        success: false, 
        error: error.message || 'Key event dispatch failed',
        key,
        type
      };
    }
  }

  /**
   * Press a key (keyDown + keyUp sequence)
   * @param {number} tabId - Tab ID
   * @param {string} key - Key to press
   * @param {Object} modifiers - Modifier key states
   * @returns {Promise<Object>} Result object
   */
  async pressKey(tabId, key, modifiers = {}) {
    try {
      // Send keyDown event
      const downResult = await this.sendKeyEvent(tabId, 'keyDown', key, modifiers);
      if (!downResult.success) {
        return downResult;
      }

      // Small delay between down and up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Send keyUp event
      const upResult = await this.sendKeyEvent(tabId, 'keyUp', key, modifiers);
      if (!upResult.success) {
        return upResult;
      }

      return {
        success: true,
        action: 'pressKey',
        key,
        modifiers,
        events: ['keyDown', 'keyUp']
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Key press failed',
        key,
        modifiers
      };
    }
  }

  /**
   * Press a sequence of keys (useful for shortcuts like Ctrl+C)
   * @param {number} tabId - Tab ID
   * @param {Array<string>} keys - Array of keys to press
   * @param {Object} modifiers - Modifier key states
   * @param {number} delay - Delay between key presses in ms
   * @returns {Promise<Object>} Result object
   */
  async pressKeySequence(tabId, keys, modifiers = {}, delay = 50) {
    const results = [];
    
    try {
      for (const key of keys) {
        const result = await this.pressKey(tabId, key, modifiers);
        results.push(result);
        
        if (!result.success) {
          return {
            success: false,
            error: `Failed at key: ${key}`,
            completedKeys: results.length - 1,
            results
          };
        }

        if (delay > 0 && keys.indexOf(key) < keys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      return {
        success: true,
        action: 'pressKeySequence',
        keys,
        modifiers,
        delay,
        results
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Key sequence failed',
        keys,
        modifiers,
        results
      };
    }
  }

  /**
   * Type text using individual key events (more reliable than setting values)
   * @param {number} tabId - Tab ID
   * @param {string} text - Text to type
   * @param {number} delay - Delay between characters in ms
   * @returns {Promise<Object>} Result object
   */
  async typeText(tabId, text, delay = 30) {
    const results = [];
    
    try {
      for (const char of text) {
        let key = char;
        let modifiers = {};

        // Handle uppercase letters
        if (char >= 'A' && char <= 'Z') {
          key = char.toLowerCase();
          modifiers.shift = true;
        }

        // Handle special characters that require shift
        const shiftChars = {
          '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
          '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
          '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\',
          ':': ';', '"': "'", '<': ',', '>': '.', '?': '/'
        };

        if (shiftChars[char]) {
          key = shiftChars[char];
          modifiers.shift = true;
        }

        // Map space character to 'Space' key name for KEY_MAPPINGS lookup
        if (key === ' ') {
          key = 'Space';
        }

        const result = await this.pressKey(tabId, key, modifiers);
        results.push({ char, key, modifiers, result });

        if (!result.success) {
          // Fallback: use Input.insertText for characters not in KEY_MAPPINGS (Unicode, special symbols)
          // This handles middle-dot ·, em-dash —, smart quotes "", etc.
          try {
            const attached = await this.attachDebugger(tabId);
            if (attached) {
              await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: char });
              results[results.length - 1].result = { success: true, method: 'insertText', char };
            } else {
              return {
                success: false,
                error: `Failed at character: ${char}`,
                completedChars: results.length - 1,
                results
              };
            }
          } catch (insertErr) {
            return {
              success: false,
              error: `Failed at character: ${char} (insertText fallback also failed: ${insertErr.message})`,
              completedChars: results.length - 1,
              results
            };
          }
        }

        if (delay > 0 && text.indexOf(char) < text.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      return {
        success: true,
        action: 'typeText',
        text,
        delay,
        characterCount: text.length,
        results
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Text typing failed',
        text,
        results
      };
    }
  }

  /**
   * Send special function keys or complex key combinations
   * @param {number} tabId - Tab ID
   * @param {string} specialKey - Special key name (e.g., 'F5', 'Ctrl+C', 'Alt+Tab')
   * @returns {Promise<Object>} Result object
   */
  async sendSpecialKey(tabId, specialKey) {
    try {
      // Parse key combination (e.g., 'Ctrl+C', 'Alt+F4')
      const parts = specialKey.split('+').map(part => part.trim());
      const modifiers = {};
      let targetKey = parts[parts.length - 1]; // Last part is the main key

      // Extract modifiers
      for (let i = 0; i < parts.length - 1; i++) {
        const modifier = parts[i].toLowerCase();
        if (modifier === 'ctrl' || modifier === 'control') {
          modifiers.ctrl = true;
        } else if (modifier === 'alt') {
          modifiers.alt = true;
        } else if (modifier === 'shift') {
          modifiers.shift = true;
        } else if (modifier === 'meta' || modifier === 'cmd' || modifier === 'command') {
          modifiers.meta = true;
        }
      }

      const result = await this.pressKey(tabId, targetKey, modifiers);

      return {
        success: result.success,
        action: 'sendSpecialKey',
        specialKey,
        parsedKey: targetKey,
        parsedModifiers: modifiers,
        result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Special key send failed',
        specialKey
      };
    }
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KeyboardEmulator, KEY_MAPPINGS, MODIFIER_MASKS };
}

// Make available globally for background script
if (typeof window !== 'undefined') {
  window.KeyboardEmulator = KeyboardEmulator;
  window.KEY_MAPPINGS = KEY_MAPPINGS;
  window.MODIFIER_MASKS = MODIFIER_MASKS;
}