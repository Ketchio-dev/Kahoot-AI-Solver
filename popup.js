const SLOTS = ['slot1', 'slot2', 'slot3'];

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const openaiInput = document.getElementById('openaiApiKey');
  const baseUrlInput = document.getElementById('openaiBaseUrl');
  let loadGeneration = 0;
  const saveBtn = document.getElementById('saveBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const status = document.getElementById('status');
  const modelStatus = document.getElementById('modelStatus');
  const solveStatus = document.getElementById('solveStatus');
  let listedModels = [];
  let solving = false;

  function updateSolveButtons() {
    SLOTS.forEach((slot, index) => {
      document.getElementById(`solveSlot${index + 1}`).disabled =
        solving || !document.getElementById(slot).value;
    });
  }

  function renderSlots(saved) {
    for (const slot of SLOTS) {
      const select = document.getElementById(slot);
      select.replaceChildren();
      const current = saved[slot];
      const models = listedModels.slice();
      if (current && !models.some(model => model.provider === current.provider && model.id === current.id)) {
        models.push({ ...current, label: `${current.id} (saved)` });
      }

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = models.length ? 'Choose a model…' : 'No models available';
      select.appendChild(placeholder);
      for (const model of models) {
        const option = document.createElement('option');
        option.value = `${model.provider}:${model.id}`;
        option.textContent = `${model.provider === 'openai' ? 'OpenAI' : 'Gemini'} · ${model.label}`;
        select.appendChild(option);
      }
      select.value = current ? `${current.provider}:${current.id}` : '';
      select.disabled = !models.length;
    }
    updateSolveButtons();
  }

  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'openaiBaseUrl', 'displayMode', ...SLOTS], (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    if (result.openaiApiKey) openaiInput.value = result.openaiApiKey;
    baseUrlInput.value = result.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL;
    document.getElementById('displayMode').value = result.displayMode === 'stealth' ? 'stealth' : 'normal';
    renderSlots(result);
    if (result.geminiApiKey || result.openaiApiKey) loadModels();
    else modelStatus.textContent = 'Save an API key to load models.';
  });

  function loadModels() {
    const generation = ++loadGeneration;
    modelStatus.textContent = 'Loading models…';
    chrome.runtime.sendMessage({ action: 'list_models' }, (response) => {
      const connectionError = chrome.runtime.lastError;
      if (generation !== loadGeneration) return;
      if (connectionError || !response) {
        modelStatus.textContent = 'Could not load models. Check the extension and try Refresh model list.';
        return;
      }
      const { models, errors } = response;
      chrome.storage.local.get(SLOTS, (saved) => {
        if (generation !== loadGeneration) return;
        listedModels = models;
        renderSlots(saved);
        const summary = models.length ? `${models.length} models available` : '';
        modelStatus.textContent = [summary, ...errors].filter(Boolean).join(' · ') ||
          'No image-capable models found. Check your API settings.';
      });
    });
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const openaiBaseUrl = normalizeOpenAIBaseUrl(baseUrlInput.value.trim());
      ++loadGeneration;
      // Start persistence before requesting permission: Chrome can close the
      // popup while displaying its native permission prompt.
      const saved = chrome.storage.local.set({
        geminiApiKey: apiKeyInput.value.trim(),
        openaiApiKey: openaiInput.value.trim(),
        openaiBaseUrl
      });
      if (openaiInput.value.trim() && openaiBaseUrl !== DEFAULT_OPENAI_BASE_URL) {
        const origin = `${new URL(openaiBaseUrl).origin}/*`;
        const granted = await chrome.permissions.request({ origins: [origin] });
        await saved;
        if (!granted) throw new Error('Settings saved, but server access was denied. Save again to grant access.');
      } else {
        await saved;
      }
      baseUrlInput.value = openaiBaseUrl;
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 2000);
      loadModels();
    } catch (error) {
      modelStatus.textContent = error.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('displayMode').addEventListener('change', async (event) => {
    await chrome.storage.local.set({ displayMode: event.target.value });
  });

  refreshBtn.addEventListener('click', loadModels);

  SLOTS.forEach((slot, index) => {
    const select = document.getElementById(slot);
    select.addEventListener('change', async () => {
      const selected = select.value;
      const solveBtn = document.getElementById(`solveSlot${index + 1}`);
      solveBtn.disabled = true;
      try {
        if (selected) {
          const separator = selected.indexOf(':');
          const provider = selected.slice(0, separator);
          const id = selected.slice(separator + 1);
          await chrome.storage.local.set({ [slot]: { provider, id } });
        } else {
          await chrome.storage.local.remove(slot);
        }
        if (select.value === selected) solveBtn.disabled = solving || !selected;
      } catch {
        solveStatus.textContent = 'Could not save the model selection. Reopen the popup and try again.';
      }
    });

    document.getElementById(`solveSlot${index + 1}`).addEventListener('click', async () => {
      if (solving) return;
      solving = true;
      updateSolveButtons();
      solveStatus.textContent = 'Capturing the active tab…';
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'manual_solve', slot, mediaContext: document.getElementById('mediaContext').value.trim()
        });
        if (!response?.ok) throw new Error(response?.error || 'The extension did not start the request.');
        window.close();
      } catch (error) {
        solveStatus.textContent = error.message;
        solving = false;
        updateSolveButtons();
      }
    });
  });

  const toggleBtn = document.getElementById('toggleViewBtn');
  const homeView = document.getElementById('home-view');
  const settingsView = document.getElementById('settings-view');

  toggleBtn.addEventListener('click', () => {
    const showSettings = settingsView.style.display === 'none';
    settingsView.style.display = showSettings ? 'block' : 'none';
    homeView.style.display = showSettings ? 'none' : 'block';
    toggleBtn.textContent = showSettings ? 'Back' : 'Settings';
    toggleBtn.setAttribute('aria-label', showSettings ? 'Back to home' : 'Open AI settings');
    toggleBtn.setAttribute('aria-expanded', String(showSettings));
  });
});
