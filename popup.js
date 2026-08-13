const SLOTS = ['slot1', 'slot2', 'slot3'];

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const openaiInput = document.getElementById('openaiApiKey');
  const saveBtn = document.getElementById('saveBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const status = document.getElementById('status');
  const modelStatus = document.getElementById('modelStatus');

  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey'], (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    if (result.openaiApiKey) openaiInput.value = result.openaiApiKey;
    loadModels();
  });

  function loadModels() {
    modelStatus.textContent = 'Loading models...';
    chrome.runtime.sendMessage({ action: 'list_models' }, (response) => {
      const models = (response && response.models) || [];
      const errors = (response && response.errors) || [];

      chrome.storage.local.get(SLOTS, (saved) => {
        for (const slot of SLOTS) {
          const select = document.getElementById(slot);
          select.innerHTML = '';

          if (!models.length) {
            const option = document.createElement('option');
            option.textContent = 'No models available';
            select.appendChild(option);
            select.disabled = true;
            continue;
          }

          select.disabled = false;
          for (const model of models) {
            const option = document.createElement('option');
            option.value = `${model.provider}:${model.id}`;
            option.textContent = `${model.provider === 'openai' ? 'OpenAI' : 'Gemini'} · ${model.label}`;
            select.appendChild(option);
          }

          const current = saved[slot];
          if (current) select.value = `${current.provider}:${current.id}`;
          if (!select.value) select.selectedIndex = 0;

          select.addEventListener('change', () => {
            const [provider, ...rest] = select.value.split(':');
            chrome.storage.local.set({ [slot]: { provider, id: rest.join(':') } });
          });
        }

        if (!models.length) {
          modelStatus.textContent = errors.length ? errors.join(' | ') : 'Save an API key to load models.';
        } else {
          modelStatus.textContent = `${models.length} models available${errors.length ? ` (${errors.join(' | ')})` : ''}`;
        }
      });
    });
  }

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      geminiApiKey: apiKeyInput.value.trim(),
      openaiApiKey: openaiInput.value.trim()
    }, () => {
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 2000);
      loadModels();
    });
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
