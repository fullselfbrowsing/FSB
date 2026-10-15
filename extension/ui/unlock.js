// Unlock script for credential vault PIN entry

const unlockBtn = document.getElementById('unlockBtn');
const errorMsg = document.getElementById('errorMsg');
const setupLink = document.getElementById('setupLink');
const pinContainer = document.getElementById('pinContainer');

function unlockText(key, english) {
  if (globalThis.fsbUiLocale && typeof fsbUiLocale.text === 'function') return fsbUiLocale.text(key, english);
  return english;
}

let pinInput = null;
let submitting = false;

async function submitUnlock(pin) {
  if (submitting) return;
  submitting = true;
  unlockBtn.disabled = true;
  unlockBtn.textContent = unlockText('entry_unlocking', 'Unlocking...');
  errorMsg.style.display = 'none';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'unlockCredentialVault',
      passphrase: pin
    });

    if (response && response.success) {
      window.close();
    } else {
      const msg = (response && response.error) || unlockText('entry_unlock_failed', 'Unlock failed');
      errorMsg.textContent = msg.includes('not configured')
        ? unlockText('entry_no_vault', 'No vault configured. Please run setup first.')
        : unlockText('entry_bad_pin', 'Incorrect PIN');
      errorMsg.style.display = 'block';
      if (pinInput) pinInput.clear();
    }
  } catch (error) {
    errorMsg.textContent = unlockText('entry_comm_error', 'Communication error. Please try again.');
    errorMsg.style.display = 'block';
    if (pinInput) pinInput.clear();
  } finally {
    submitting = false;
    unlockBtn.disabled = false;
    unlockBtn.textContent = unlockText('entry_unlock', 'Unlock');
  }
}

// Button fallback (auto-submit fires on last digit)
unlockBtn.addEventListener('click', () => {
  if (!pinInput) return;
  const pin = pinInput.getValue();
  if (!pin || !/^\d+$/.test(pin)) return;
  submitUnlock(pin);
});

// Setup link
setupLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Initialize: query vault status for PIN length, then render
chrome.runtime.sendMessage({ action: 'getCredentialVaultStatus' }).then(response => {
  if (response && response.unlocked) {
    window.close();
    return;
  }
  if (response && response.configured) {
    const pinLen = response.pinLength || 6;
    pinInput = createPinInput(pinContainer, pinLen, {
      onComplete: (pin) => submitUnlock(pin)
    });
    pinInput.focus();
  } else {
    // No vault configured
    errorMsg.textContent = unlockText('entry_no_vault', 'No vault configured. Please run setup first.');
    errorMsg.style.display = 'block';
  }
}).catch(() => {
  // Fallback: render 6-digit input
  pinInput = createPinInput(pinContainer, 6, {
    onComplete: (pin) => submitUnlock(pin)
  });
  pinInput.focus();
});
