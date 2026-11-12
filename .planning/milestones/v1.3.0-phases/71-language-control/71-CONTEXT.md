# Phase 71 Context

The language control lists the seven native autonyms from hardcoded labels. Those labels are not message keys. An empty value means the browser UI language. The stored key is `fsbUiLocale`. Clearing it removes the key.

`chrome://extensions` still follows the browser language because the manifest name uses `__MSG_`. The control says so. A storage listener refreshes extension documents and overlay shadow roots. It does not translate the host page.
