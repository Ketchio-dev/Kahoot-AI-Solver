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

  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'openaiBaseUrl'], (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    if (result.openaiApiKey) openaiInput.value = result.openaiApiKey;
    baseUrlInput.value = result.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL;
    loadModels();
  });

  function loadModels() {
    const generation = ++loadGeneration;
    modelStatus.textContent = 'Loading models...';
    SLOTS.forEach((slot, index) => {
      document.getElementById(slot).disabled = true;
      document.getElementById(`solveSlot${index + 1}`).disabled = true;
    });
    chrome.runtime.sendMessage({ action: 'list_models' }, (response) => {
      if (generation !== loadGeneration) return;
      if (chrome.runtime.lastError) {
        modelStatus.textContent = chrome.runtime.lastError.message;
        return;
      }
      const models = (response && response.models) || [];
      const errors = (response && response.errors) || [];

      chrome.storage.local.get(SLOTS, (saved) => {
        if (generation !== loadGeneration) return;

        for (const slot of SLOTS) {
          const select = document.getElementById(slot);
          select.innerHTML = '';
          document.getElementById(`solveSlot${SLOTS.indexOf(slot) + 1}`).disabled = true;

          if (!models.length) {
            const option = document.createElement('option');
            option.textContent = 'No models available';
            select.appendChild(option);
            select.disabled = true;
            continue;
          }

          select.disabled = false;
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Choose a model…';
          select.appendChild(placeholder);
          for (const model of models) {
            const option = document.createElement('option');
            option.value = `${model.provider}:${model.id}`;
            option.textContent = `${model.provider === 'openai' ? 'OpenAI' : 'Gemini'} · ${model.label}`;
            select.appendChild(option);
          }

          const current = saved[slot];
          if (current) select.value = `${current.provider}:${current.id}`;
          if (!select.value) select.value = '';
          const solveBtn = document.getElementById(`solveSlot${SLOTS.indexOf(slot) + 1}`);
          solveBtn.disabled = !select.value;
          select.onchange = async () => {
            solveBtn.disabled = true;
            if (!select.value) {
              await chrome.storage.local.remove(slot);
              return;
            }
            const [provider, ...rest] = select.value.split(':');
            await chrome.storage.local.set({ [slot]: { provider, id: rest.join(':') } });
            solveBtn.disabled = false;
          };
        }

        if (!models.length) {
          modelStatus.textContent = errors.length ? errors.join(' | ') : 'Save an API key to load models.';
        } else {
          modelStatus.textContent = `${models.length} models available${errors.length ? ` (${errors.join(' | ')})` : ''}`;
        }
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

  refreshBtn.addEventListener('click', loadModels);

  SLOTS.forEach((slot, index) => {
    document.getElementById(`solveSlot${index + 1}`).addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'manual_solve', slot });
      window.close();
    });
  });

  const toggleBtn = document.getElementById('toggleViewBtn');
  const fakeView = document.getElementById('fake-view');
  const realView = document.getElementById('real-view');

  toggleBtn.addEventListener('click', () => {
    const showReal = realView.style.display === 'none';
    realView.style.display = showReal ? 'block' : 'none';
    fakeView.style.display = showReal ? 'none' : 'block';
  });
});
