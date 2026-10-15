// Chrome cannot anchor a new media permission prompt to an extension side
// panel. This top-level extension page obtains the one-time origin grant that
// the side panel can then reuse on every tab.

(() => {
  const permissionGrantedMessage = 'fsb:microphone-permission-granted';
  const allowButton = document.getElementById('allowMicBtn');
  const settingsButton = document.getElementById('openSettingsBtn');
  const statusElement = document.getElementById('status');

  function micText(key, english) {
    if (globalThis.fsbUiLocale && typeof fsbUiLocale.text === 'function') return fsbUiLocale.text(key, english);
    return english;
  }

  function setStatus(message, state = '') {
    statusElement.textContent = message;
    statusElement.className = state;
  }

  async function getPermissionState() {
    if (!navigator.permissions?.query) return 'unknown';
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      return status.state;
    } catch (_e) {
      return 'unknown';
    }
  }

  function stopStream(stream) {
    if (!stream?.getTracks) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (_e) {
        // The browser can end a probe track before this page releases it.
      }
    }
  }

  async function closePermissionTab() {
    try {
      const tab = await chrome.tabs.getCurrent();
      if (Number.isInteger(tab?.id)) {
        await chrome.tabs.remove(tab.id);
        return;
      }
    } catch (_e) {
      // window.close() is the fallback for browsers that omit getCurrent().
    }
    window.close();
  }

  function errorMessage(error, permissionState) {
    if (permissionState === 'denied') {
      return micText('entry_mic_blocked', 'Microphone access is blocked for FSB. Open Chrome microphone settings, remove the blocked FSB entry, then try again.');
    }
    switch (error?.name) {
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return micText('entry_mic_none', 'No microphone was found. Connect or enable an input device, then try again.');
      case 'NotReadableError':
      case 'TrackStartError':
        return micText('entry_mic_busy', 'The microphone is busy or unavailable. Close other recording apps, then try again.');
      case 'NotAllowedError':
      case 'PermissionDeniedError':
      case 'SecurityError':
        return micText('entry_mic_macos', 'Chrome could not access the microphone. On macOS, enable Google Chrome in System Settings → Privacy & Security → Microphone, then try again.');
      default:
        return micText('entry_mic_generic', 'FSB could not access the microphone. Check Chrome and macOS microphone settings, then try again.');
    }
  }

  async function requestMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(micText('entry_mic_no_api', 'This Chrome build does not provide microphone access to extensions.'), 'error');
      allowButton.disabled = true;
      return;
    }

    allowButton.disabled = true;
    settingsButton.classList.add('hidden');
    setStatus(micText('entry_mic_waiting', 'Waiting for Chrome’s microphone prompt…'));

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopStream(stream);
      stream = null;
      try {
        await chrome.runtime.sendMessage({ type: permissionGrantedMessage });
      } catch (_e) {
        // The permission remains granted if the side panel closed meanwhile.
      }
      setStatus(micText('entry_mic_enabled', 'Microphone enabled. Returning to FSB…'), 'success');
      setTimeout(() => {
        void closePermissionTab();
      }, 700);
    } catch (error) {
      stopStream(stream);
      const permissionState = await getPermissionState();
      setStatus(errorMessage(error, permissionState), 'error');
      settingsButton.classList.toggle('hidden', permissionState !== 'denied');
      allowButton.disabled = false;
      allowButton.textContent = micText('entry_mic_try', 'Try again');
      console.warn('[STT permission]', error?.name || 'Error', error?.message || '');
    }
  }

  async function openMicrophoneSettings() {
    try {
      await chrome.tabs.create({ url: 'chrome://settings/content/microphone', active: true });
    } catch (_e) {
      setStatus(micText('entry_mic_manual', 'Open chrome://settings/content/microphone in the address bar, then remove the blocked FSB entry.'), 'error');
    }
  }

  allowButton.addEventListener('click', () => {
    void requestMicrophone();
  });
  settingsButton.addEventListener('click', () => {
    void openMicrophoneSettings();
  });

  globalThis.FSBMicrophonePermission = {
    requestMicrophone,
    getPermissionState,
    errorMessage
  };

  void requestMicrophone();
})();
