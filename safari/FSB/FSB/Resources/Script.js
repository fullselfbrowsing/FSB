function show(enabled, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "FSB’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-off')[0].innerText = "FSB’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-unknown')[0].innerText = "You can turn on FSB’s extension in the Extensions section of Safari Settings.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);

// --- upload_file folder grants ----------------------------------------------
// Populated from Swift via evaluateJavaScript("showGrants([...])").

function showGrants(roots) {
    const list = document.getElementById('grantList');
    const empty = document.getElementById('grantEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';
    const items = Array.isArray(roots) ? roots : [];
    for (const root of items) {
        const li = document.createElement('li');
        li.textContent = root;
        list.appendChild(li);
    }
    empty.style.display = items.length ? 'none' : '';
    list.style.display = items.length ? '' : 'none';
}

document.querySelector('button.grant-folder')
    .addEventListener('click', () => webkit.messageHandlers.controller.postMessage('grant-folder'));

document.querySelector('button.clear-grants')
    .addEventListener('click', () => webkit.messageHandlers.controller.postMessage('clear-grants'));

showGrants([]);
