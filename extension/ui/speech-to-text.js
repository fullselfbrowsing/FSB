// Speech-to-Text module for FSB
// Browser speech recognition runs directly in the extension side panel so the
// microphone grant belongs to FSB, rather than to whichever website is active.

const FSB_MICROPHONE_PERMISSION_GRANTED = 'fsb:microphone-permission-granted';

class FSBSpeechToText {
  constructor(targetInput, micBtn, sendBtn) {
    this.targetInput = targetInput;
    this.micBtn = micBtn;
    this.sendBtn = sendBtn;

    this.isStarting = false;
    this.isRecording = false;
    this.isTranscribing = false;

    this._directRecognition = null;
    this._pendingRecognitionCancel = null;
    this._micPermissionGranted = false;
    this._permissionStatus = null;
    this._permissionListenerAttached = false;
    this._permissionTabId = null;
    this._pendingPermissionCancel = null;
    this._activeStream = null;
    this._whisperAbortController = null;
    this._startToken = 0;
    this._errorTimer = null;
    this._placeholderBeforeError = null;

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.sttProvider = 'browser'; // 'browser' or 'whisper'
    this.openaiApiKey = null;
    this.voiceInputEnabled = true;
    this._preExistingText = '';
    this._finalTranscript = '';

    this._settingsReady = this._loadSettings();
    this._setupMicButton();
    this._syncMicVisibility();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.voiceInputEnabled) {
        this._applyVoiceInputEnabled(changes.voiceInputEnabled.newValue !== false);
      }
      if (area === 'local' && (changes.sttProvider || changes.openaiApiKey)) {
        this._settingsReady = this._loadSettings();
      }
    });
  }

  async _loadSettings() {
    try {
      const data = await chrome.storage.local.get([
        'sttProvider',
        'openaiApiKey',
        'voiceInputEnabled'
      ]);
      this.openaiApiKey = data.openaiApiKey || null;
      this.sttProvider = data.sttProvider || 'browser';
      this._applyVoiceInputEnabled(data.voiceInputEnabled !== false);
    } catch (e) {
      console.warn('[STT] Failed to load settings:', e);
    }
  }

  _setupMicButton() {
    this.micBtn.addEventListener('click', () => {
      if (this.isRecording) {
        this.stop();
      } else if (!this.isStarting && !this.isTranscribing) {
        void this.start();
      }
    });
  }

  _applyVoiceInputEnabled(enabled) {
    const nextEnabled = enabled !== false;
    const wasEnabled = this.voiceInputEnabled;
    this.voiceInputEnabled = nextEnabled;

    if (!nextEnabled && (wasEnabled || this.isStarting || this.isRecording || this.isTranscribing)) {
      this._cancelVoiceInput();
    }
    this._syncMicVisibility();
  }

  _syncMicVisibility() {
    const hidden = !this.voiceInputEnabled;
    this.micBtn.hidden = hidden;
    this.micBtn.classList.toggle('hidden', hidden);
    if (hidden) this.micBtn.setAttribute?.('aria-hidden', 'true');
    else this.micBtn.removeAttribute?.('aria-hidden');
  }

  _cancelVoiceInput() {
    ++this._startToken;

    const cancelPermissionWait = this._pendingPermissionCancel;
    this._pendingPermissionCancel = null;
    if (cancelPermissionWait) cancelPermissionWait();

    const permissionTabId = this._permissionTabId;
    this._permissionTabId = null;
    if (Number.isInteger(permissionTabId) && chrome.tabs?.remove) {
      void chrome.tabs.remove(permissionTabId).catch(() => {});
    }

    const recognition = this._directRecognition;
    this._directRecognition = null;
    const cancelRecognitionWait = this._pendingRecognitionCancel;
    this._pendingRecognitionCancel = null;
    if (cancelRecognitionWait) cancelRecognitionWait();
    if (recognition) {
      try {
        recognition.abort();
      } catch (_error) {
        // It may already have ended between the storage update and this call.
      }
    }

    const abortController = this._whisperAbortController;
    this._whisperAbortController = null;
    abortController?.abort();

    const stream = this._activeStream;
    this._activeStream = null;
    this._stopStream(stream);

    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    this.audioChunks = [];
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (_error) {
        // The recorder may have stopped while the preference was being saved.
      }
    }

    this._setIdle();
  }

  async start() {
    if (!this.voiceInputEnabled || this.isStarting || this.isRecording || this.isTranscribing) return;

    const startToken = ++this._startToken;
    this._preExistingText = (this.targetInput.textContent || '').trimEnd();
    this._finalTranscript = '';
    this._setStarting();

    let useWhisper = false;
    try {
      await this._settingsReady;
      if (startToken !== this._startToken) return;
      if (!this.voiceInputEnabled) {
        this._setIdle();
        return;
      }

      useWhisper = this.sttProvider === 'whisper' && !!this.openaiApiKey;
      if (useWhisper) {
        await this._startWhisper(startToken);
      } else {
        await this._startBrowser(startToken);
      }
    } catch (e) {
      if (startToken !== this._startToken) return;
      console.warn('[STT] Failed to start:', e?.name || 'Error', e?.message || String(e));
      const message = this._startErrorMessage(e, useWhisper);
      this._setIdle();
      this._showError(message);
    } finally {
      if (startToken === this._startToken && this.isStarting &&
          !this.isRecording && !this.isTranscribing) {
        this._setIdle();
      }
    }
  }

  stop() {
    if (this.isStarting) {
      ++this._startToken;
      if (this._directRecognition) {
        try {
          this._directRecognition.abort();
        } catch (_e) {
          // The recognition instance may not have entered its active state yet.
        }
      }
      this._setIdle();
      return;
    }

    if (!this.isRecording) return;

    if (this._directRecognition) {
      try {
        this._directRecognition.stop(); // onend restores the idle state
      } catch (e) {
        console.warn('[STT] Failed to stop speech recognition:', e);
        this._setIdle();
      }
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop(); // onstop transcribes and restores the UI
      } catch (e) {
        console.warn('[STT] Failed to stop recording:', e);
        this._stopStream(this._activeStream);
        this._activeStream = null;
        this.mediaRecorder = null;
        this._setIdle();
        this._showError('Could not finish the recording');
      }
      return;
    }

    this._setIdle();
  }

  // ── Browser Web Speech API ──

  async _startBrowser(startToken) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      throw this._userError(
        'NotSupportedError',
        'Speech recognition is not supported in this browser'
      );
    }

    await this._ensureMicrophonePermission();
    if (startToken !== this._startToken) return;

    await this._startDirectSR(SR);
  }

  async _ensureMicrophonePermission() {
    if (this._micPermissionGranted) return;

    let status = null;
    if (navigator.permissions?.query) {
      try {
        status = await navigator.permissions.query({ name: 'microphone' });
        this._permissionStatus = status;
        this._watchPermissionStatus(status);

        if (status.state === 'granted') {
          this._micPermissionGranted = true;
          return;
        }
      } catch (e) {
        // The permission page can still make the authoritative request when
        // Permissions API queries are unavailable in a Chromium variant.
      }
    }

    if (!this.voiceInputEnabled) {
      throw this._userError('AbortError', 'Voice input was disabled');
    }

    if (!chrome.tabs?.create || !chrome.runtime?.getURL) {
      throw this._userError(
        'NotSupportedError',
        'Chrome cannot open the FSB microphone permission page'
      );
    }

    // Extension side panels are embedded WebContents. Chrome suppresses new
    // media permission prompts there, even though SpeechRecognition itself is
    // allowed once the extension origin already has a grant. Request the
    // one-time grant in a visible top-level extension tab, then continue here.
    if (status?.state === 'denied') {
      await this._openMicrophonePermissionTab();
      throw this._userError(
        'NotAllowedError',
        'Microphone access is blocked for FSB — follow the instructions in the permission tab'
      );
    }

    await this._requestMicrophonePermissionInTab(status);
  }

  _watchPermissionStatus(status) {
    if (this._permissionListenerAttached || !status?.addEventListener) return;
    this._permissionListenerAttached = true;
    status.addEventListener('change', () => {
      this._micPermissionGranted = status.state === 'granted';
    });
  }

  async _openMicrophonePermissionTab() {
    if (this._permissionTabId !== null && chrome.tabs?.update) {
      try {
        return await chrome.tabs.update(this._permissionTabId, { active: true });
      } catch (_e) {
        this._permissionTabId = null;
      }
    }

    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('ui/microphone-permission.html'),
      active: true
    });
    if (!Number.isInteger(tab?.id)) {
      throw this._userError(
        'NotAllowedError',
        'Chrome could not open the FSB microphone permission page'
      );
    }
    this._permissionTabId = tab.id;
    return tab;
  }

  async _requestMicrophonePermissionInTab(status) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      let cancelWait = null;
      let permissionTabId = null;
      let grantedSenderTabId = null;

      const cleanup = () => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        status?.removeEventListener?.('change', onPermissionChange);
        chrome.tabs.onRemoved?.removeListener?.(onTabRemoved);
        chrome.runtime.onMessage?.removeListener?.(onPermissionMessage);
        if (this._pendingPermissionCancel === cancelWait) {
          this._pendingPermissionCancel = null;
        }
      };

      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          this._micPermissionGranted = true;
          this._permissionTabId = null;
          if (Number.isInteger(permissionTabId) && chrome.tabs?.remove) {
            void chrome.tabs.remove(permissionTabId).catch(() => {});
          }
          resolve();
        }
      };

      const readPermissionState = async (permissionTabClosed = false) => {
        if (settled) return;
        let currentStatus = status;
        if (navigator.permissions?.query) {
          try {
            currentStatus = await navigator.permissions.query({ name: 'microphone' });
            this._permissionStatus = currentStatus;
          } catch (_e) {
            // Closing the helper tab below still gives us a deterministic
            // cancellation path when a query cannot be made.
          }
        }

        if (currentStatus?.state === 'granted') {
          finish();
        } else if (currentStatus?.state === 'denied') {
          finish(this._userError(
            'NotAllowedError',
            'Microphone access is blocked for FSB — follow the instructions in the permission tab'
          ));
        } else if (permissionTabClosed) {
          this._permissionTabId = null;
          finish(this._userError(
            'NotAllowedError',
            'Microphone permission was not enabled — click the mic to try again'
          ));
        }
      };

      const onPermissionChange = () => {
        void readPermissionState();
      };

      const onTabRemoved = (tabId) => {
        if (tabId !== permissionTabId) return;
        this._permissionTabId = null;
        void readPermissionState(true);
      };

      const onPermissionMessage = (message, sender) => {
        if (message?.type !== FSB_MICROPHONE_PERMISSION_GRANTED) return;
        if (sender?.id !== chrome.runtime.id || !Number.isInteger(sender?.tab?.id)) return;
        if (permissionTabId === null) {
          grantedSenderTabId = sender.tab.id;
          return;
        }
        if (sender.tab.id === permissionTabId) finish();
      };

      cancelWait = () => {
        finish(this._userError('AbortError', 'Voice input was disabled'));
      };
      this._pendingPermissionCancel = cancelWait;

      status?.addEventListener?.('change', onPermissionChange);
      chrome.tabs.onRemoved?.addListener?.(onTabRemoved);
      chrome.runtime.onMessage?.addListener?.(onPermissionMessage);

      timeoutId = setTimeout(() => {
        finish(this._userError(
          'NotAllowedError',
          'Microphone permission was not enabled — click the mic to try again'
        ));
      }, 120000);

      void (async () => {
        try {
          const tab = await this._openMicrophonePermissionTab();
          permissionTabId = tab.id;
          if (settled) {
            this._permissionTabId = null;
            if (chrome.tabs?.remove) void chrome.tabs.remove(tab.id).catch(() => {});
            return;
          }
          if (!this.voiceInputEnabled) {
            finish(this._userError('AbortError', 'Voice input was disabled'));
            return;
          }
          if (grantedSenderTabId === permissionTabId) {
            finish();
            return;
          }
          void readPermissionState();
        } catch (error) {
          finish(error);
        }
      })();
    });
  }

  _startDirectSR(SR) {
    return new Promise((resolve, reject) => {
      let recognition;
      let terminalError = false;
      let settled = false;
      let cancelRecognitionWait = null;

      const resolveOnce = () => {
        if (!settled) {
          settled = true;
          if (this._pendingRecognitionCancel === cancelRecognitionWait) {
            this._pendingRecognitionCancel = null;
          }
          resolve();
        }
      };

      cancelRecognitionWait = resolveOnce;
      this._pendingRecognitionCancel = cancelRecognitionWait;

      try {
        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        this._finalTranscript = '';

        recognition.onstart = () => {
          if (this._directRecognition !== recognition) return;
          this._setRecording();
          resolveOnce();
        };

        recognition.onresult = (event) => {
          if (this._directRecognition !== recognition) return;
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              this._finalTranscript += transcript;
            } else {
              interim += transcript;
            }
          }
          this._insertText(this._finalTranscript + interim, !!interim);
        };

        recognition.onend = () => {
          if (terminalError || this._directRecognition !== recognition) {
            resolveOnce();
            return;
          }
          if (this._finalTranscript) {
            this._insertText(this._finalTranscript, false);
          }
          this._setIdle();
          resolveOnce();
        };

        recognition.onerror = (event) => {
          if (this._directRecognition !== recognition) {
            resolveOnce();
            return;
          }
          terminalError = true;
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            this._micPermissionGranted = false;
          }
          const message = this._recognitionErrorMessage(event.error);
          this._setIdle();
          if (message) this._showError(message);
          resolveOnce();
        };

        this._directRecognition = recognition;
        recognition.start();
      } catch (e) {
        if (this._pendingRecognitionCancel === cancelRecognitionWait) {
          this._pendingRecognitionCancel = null;
        }
        if (this._directRecognition === recognition) {
          this._directRecognition = null;
        }
        reject(e);
      }
    });
  }

  // ── OpenAI Whisper API ──

  async _startWhisper(startToken) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw this._userError(
        'NotSupportedError',
        'Microphone access is not supported in this browser'
      );
    }
    if (typeof MediaRecorder === 'undefined') {
      throw this._userError(
        'NotSupportedError',
        'Audio recording is not supported in this browser'
      );
    }

    await this._ensureMicrophonePermission();
    if (startToken !== this._startToken) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._micPermissionGranted = true;

    if (startToken !== this._startToken || !this.voiceInputEnabled) {
      this._stopStream(stream);
      return;
    }

    this._activeStream = stream;
    const recordedChunks = [];
    this.audioChunks = recordedChunks;
    let recorder;
    let recorderFailed = false;

    try {
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (this.mediaRecorder === recorder && this.voiceInputEnabled && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        if (this.mediaRecorder !== recorder) return;
        recorderFailed = true;
        if (this._activeStream === stream) {
          this._stopStream(stream);
          this._activeStream = null;
        }
        this.mediaRecorder = null;
        recordedChunks.length = 0;
        this._setIdle();
        this._showError('Recording failed: ' + (event.error?.message || 'microphone error'));
      };

      recorder.onstop = async () => {
        if (this._activeStream === stream) {
          this._stopStream(stream);
          this._activeStream = null;
        }

        const discardRecording = recorderFailed ||
          this.mediaRecorder !== recorder ||
          startToken !== this._startToken ||
          !this.voiceInputEnabled;
        if (discardRecording) {
          recordedChunks.length = 0;
          if (startToken === this._startToken) this._setIdle();
          return;
        }

        if (recordedChunks.length === 0) {
          if (this.mediaRecorder === recorder) this.mediaRecorder = null;
          this._setIdle();
          return;
        }

        const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
        this._setTranscribing();
        await this._transcribeWithWhisper(audioBlob, recorder, startToken);
      };

      recorder.start(250);
      this._setRecording();
    } catch (e) {
      this._stopStream(stream);
      if (this._activeStream === stream) this._activeStream = null;
      if (this.mediaRecorder === recorder) this.mediaRecorder = null;
      throw e;
    }
  }

  async _transcribeWithWhisper(audioBlob, recorder = this.mediaRecorder, startToken = this._startToken) {
    let errorMessage = '';
    const abortController = typeof AbortController === 'function'
      ? new AbortController()
      : null;
    this._whisperAbortController = abortController;
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');

      const request = {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.openaiApiKey}` },
        body: formData
      };
      if (abortController) request.signal = abortController.signal;
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', request);

      if (startToken !== this._startToken || !this.voiceInputEnabled) return;

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (startToken === this._startToken && this.voiceInputEnabled && data.text) {
        this._insertText(data.text, false);
      }
    } catch (e) {
      const cancelled = e?.name === 'AbortError' ||
        startToken !== this._startToken ||
        !this.voiceInputEnabled;
      if (!cancelled) {
        console.error('[STT] Whisper error:', e);
        errorMessage = 'Whisper failed: ' + e.message;
      }
    } finally {
      if (this._whisperAbortController === abortController) {
        this._whisperAbortController = null;
      }
      if (this.mediaRecorder === recorder) this.mediaRecorder = null;
      if (startToken === this._startToken) {
        this._setIdle();
        if (errorMessage) this._showError(errorMessage);
      }
    }
  }

  // ── UI State ──

  _setStarting() {
    this.isStarting = true;
    this.isRecording = false;
    this.isTranscribing = false;
    this._clearErrorState();
    this.micBtn.classList.remove('recording');
    this.micBtn.classList.add('transcribing');
    this.micBtn.title = 'Preparing voice input...';
    const icon = this.micBtn.querySelector('i');
    if (icon) icon.className = 'fa fa-spinner fa-spin';
    if (this.sendBtn) this.sendBtn.classList.add('hidden');
  }

  _setRecording() {
    this.isStarting = false;
    this.isRecording = true;
    this.isTranscribing = false;
    this._clearErrorState();
    this.micBtn.classList.remove('transcribing');
    this.micBtn.classList.add('recording');
    this.micBtn.title = 'Stop recording';
    const icon = this.micBtn.querySelector('i');
    if (icon) icon.className = 'fa fa-stop';
    if (this.sendBtn) this.sendBtn.classList.add('hidden');
  }

  _setTranscribing() {
    this.isStarting = false;
    this.isRecording = false;
    this.isTranscribing = true;
    this._clearErrorState();
    this.micBtn.classList.remove('recording');
    this.micBtn.classList.add('transcribing');
    this.micBtn.title = 'Transcribing...';
    const icon = this.micBtn.querySelector('i');
    if (icon) icon.className = 'fa fa-spinner fa-spin';
    if (this.sendBtn) this.sendBtn.classList.add('hidden');
  }

  _setIdle() {
    this.isStarting = false;
    this.isRecording = false;
    this.isTranscribing = false;
    this._directRecognition = null;
    this._clearErrorState();
    this.micBtn.classList.remove('recording', 'transcribing');
    this.micBtn.title = 'Voice input';
    const icon = this.micBtn.querySelector('i');
    if (icon) icon.className = 'fa fa-microphone';
    if (this.sendBtn) this.sendBtn.classList.remove('hidden');
    this._syncMicVisibility();
  }

  _insertText(text, _isInterim) {
    if (!text) return;
    const pre = this._preExistingText;
    const separator = pre && !pre.endsWith(' ') ? ' ' : '';
    this.targetInput.textContent = pre + separator + text;
    this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));

    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(this.targetInput);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  _showError(message) {
    console.warn('[STT]', message);
    this._clearErrorState();
    this.micBtn.title = message;
    this.micBtn.classList.add('error');
    const previousPlaceholder = this.targetInput.dataset.placeholder || '';
    this._placeholderBeforeError = previousPlaceholder;
    if (!this.targetInput.textContent) {
      this.targetInput.setAttribute('data-placeholder', message);
    }

    this._errorTimer = setTimeout(() => {
      this._errorTimer = null;
      this.micBtn.classList.remove('error');
      const placeholderToRestore = this._placeholderBeforeError;
      this._placeholderBeforeError = null;
      if (!this.isStarting && !this.isRecording && !this.isTranscribing) {
        this.micBtn.title = 'Voice input';
        if (!this.targetInput.textContent) {
          this.targetInput.setAttribute(
            'data-placeholder',
            placeholderToRestore || 'Ask me to automate something...'
          );
        }
      }
    }, 3000);
  }

  _clearErrorState() {
    if (this._errorTimer) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
    this.micBtn.classList.remove('error');
    if (this._placeholderBeforeError !== null) {
      const placeholderToRestore = this._placeholderBeforeError;
      this._placeholderBeforeError = null;
      if (!this.targetInput.textContent) {
        this.targetInput.setAttribute(
          'data-placeholder',
          placeholderToRestore || 'Ask me to automate something...'
        );
      }
    }
  }

  _stopStream(stream) {
    if (!stream?.getTracks) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (_e) {
        // A track can already be ended when the recorder reports an error.
      }
    }
  }

  _userError(name, message) {
    const error = new Error(message);
    error.name = name;
    error._fsbUserMessage = message;
    return error;
  }

  _startErrorMessage(error, useWhisper) {
    if (error?._fsbUserMessage) return error._fsbUserMessage;

    switch (error?.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
      case 'SecurityError':
        this._micPermissionGranted = false;
        return "Microphone access is blocked for FSB — allow it in Chrome's microphone settings";
      case 'NotFoundError':
      case 'DevicesNotFoundError':
      case 'OverconstrainedError':
        return 'No microphone was found';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'Microphone is unavailable or already in use';
      case 'NotSupportedError':
        return useWhisper
          ? 'Audio recording is not supported in this browser'
          : 'Speech recognition is not supported in this browser';
      default:
        return useWhisper ? 'Could not access microphone' : 'Could not start speech recognition';
    }
  }

  _recognitionErrorMessage(error) {
    switch (error) {
      case 'aborted':
        return '';
      case 'not-allowed':
        return "Microphone access is blocked for FSB — allow it in Chrome's microphone settings";
      case 'service-not-allowed':
        return 'Speech recognition is unavailable in this browser';
      case 'audio-capture':
        return 'No microphone was found, or it is unavailable';
      case 'no-speech':
        return 'No speech was detected';
      case 'network':
        return 'Speech recognition could not reach the speech service';
      case 'language-not-supported':
        return 'The selected speech-recognition language is not supported';
      default:
        return 'Speech recognition failed' + (error ? ': ' + error : '');
    }
  }
}
