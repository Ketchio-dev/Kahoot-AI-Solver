const SLOTS = ['slot1', 'slot2', 'slot3'];

document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);
  const geminiKey = el('apiKey');
  const openaiKey = el('openaiApiKey');
  const baseUrl = el('openaiBaseUrl');
  const toggle = el('toggleViewBtn');
  const modelStatus = el('modelStatus');
  const solveStatus = el('solveStatus');
  let saved = {};
  let listedModels = [];
  let loaded = false;
  let loading = false;
  let solving = false;
  let saving = false;
  let listRequest = 0;
  const pendingSlots = new Set();

  const providerName = provider => provider === 'gemini' ? 'Gemini' : 'OpenAI';
  const keyFor = provider => provider === 'gemini' ? saved.geminiApiKey : saved.openaiApiKey;
  const hasProvider = () => Boolean(saved.geminiApiKey || saved.openaiApiKey);

  function renderHome() {
    let ready = false;
    SLOTS.forEach((slot, index) => {
      const model = saved[slot];
      const configured = Boolean(model?.id && keyFor(model.provider));
      el(`slotCard${index + 1}`).setAttribute('data-featured', String(configured && !ready));
      ready ||= configured;
      const modelLabel = el(`model${index + 1}`);
      modelLabel.textContent = model?.id
        ? `${providerName(model.provider)} · ${model.id}`
        : 'No model selected';
      modelLabel.title = modelLabel.textContent;
      el(`solveSlot${index + 1}`).disabled = !configured || solving || saving || pendingSlots.has(slot);
    });
    el('homeStatus').textContent = ready ? 'Keep the question and choices visible in the active tab.'
      : 'Add an API key and choose a model to start.';
    el('setupAction').hidden = ready;
    el('setupActionLabel').textContent = hasProvider() ? 'Choose a model' : 'Connect a provider';
  }

  function renderSlots() {
    for (const slot of SLOTS) {
      const select = el(slot);
      const current = saved[slot];
      const models = listedModels.slice();
      if (current?.id && !models.some(model => model.provider === current.provider && model.id === current.id)) {
        models.push({ ...current, label: `${current.id} (saved)`, savedOnly: true });
      }
      select.replaceChildren(new Option('Choose a model…', ''));
      for (const model of models) {
        const label = `${providerName(model.provider)} · ${model.label}`;
        const hint = model.verifiedVision || model.savedOnly ? '' : ' · check image support';
        select.add(new Option(label + hint, `${model.provider}:${model.id}`));
      }
      select.value = current?.id ? `${current.provider}:${current.id}` : '';
      select.disabled = !models.length || saving || pendingSlots.has(slot);
    }
    el('refreshBtn').disabled = !hasProvider() || saving || loading;
    renderHome();
  }

  async function loadModels() {
    if (!hasProvider()) {
      modelStatus.textContent = 'Add an API key first.';
      return;
    }
    const request = ++listRequest;
    loading = true;
    el('refreshBtn').disabled = true;
    modelStatus.textContent = 'Loading models…';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'list_models' });
      if (request !== listRequest) return;
      if (!response) throw new Error('The extension did not respond.');
      listedModels = response.models;
      const count = listedModels.length;
      const summary = count ? `${count} ${count === 1 ? 'model' : 'models'} available` : 'No models found';
      modelStatus.textContent = [summary, ...response.errors].join(' · ');
    } catch (error) {
      if (request === listRequest) modelStatus.textContent = `Could not load models. ${error.message}`;
    } finally {
      if (request === listRequest) {
        loading = false;
        renderSlots();
      }
    }
  }

  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'openaiBaseUrl', 'displayMode', ...SLOTS], result => {
    if (chrome.runtime.lastError) {
      el('homeStatus').textContent = 'Could not read settings. Try reopening the extension.';
      return;
    }
    saved = result;
    loaded = true;
    geminiKey.value = saved.geminiApiKey || '';
    openaiKey.value = saved.openaiApiKey || '';
    baseUrl.value = saved.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL;
    el('customEndpoint').open = baseUrl.value !== DEFAULT_OPENAI_BASE_URL;
    el('displayMode').value = saved.displayMode === 'stealth' ? 'stealth' : 'normal';
    renderSlots();
    if (toggle.getAttribute('aria-expanded') === 'true') void loadModels();
  });

  chrome.commands.getAll().then(commands => {
    const shortcuts = new Map(commands.map(command => [command.name, command.shortcut]));
    SLOTS.forEach((_, index) => {
      const shortcut = el(`shortcut${index + 1}`);
      shortcut.textContent = shortcuts.get(`solve-slot-${index + 1}`) || 'Unassigned';
      shortcut.title = 'Manage keyboard shortcuts at chrome://extensions/shortcuts';
    });
  }).catch(() => {});

  el('saveBtn').addEventListener('click', async () => {
    if (!loaded || saving || pendingSlots.size) return;
    saving = true;
    el('saveBtn').disabled = true;
    try {
      const openaiBaseUrl = normalizeOpenAIBaseUrl(baseUrl.value.trim());
      const changes = { geminiApiKey: geminiKey.value.trim(), openaiApiKey: openaiKey.value.trim(), openaiBaseUrl };
      const serverChanged = openaiBaseUrl !== (saved.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL);
      for (const slot of SLOTS) {
        const provider = saved[slot]?.provider;
        if ((provider === 'openai' && (serverChanged || !changes.openaiApiKey)) ||
            (provider === 'gemini' && !changes.geminiApiKey)) changes[slot] = null;
      }
      ++listRequest;
      loading = false;
      renderSlots();
      // Persist before Chrome's optional origin prompt can close the popup.
      const stored = chrome.storage.local.set(changes).then(() => {
        Object.assign(saved, changes);
        listedModels = [];
        baseUrl.value = openaiBaseUrl;
      });
      const custom = changes.openaiApiKey && openaiBaseUrl !== DEFAULT_OPENAI_BASE_URL;
      const access = custom
        ? chrome.permissions.request({ origins: [`${new URL(openaiBaseUrl).origin}/*`] })
        : Promise.resolve(true);
      const [, granted] = await Promise.all([stored, access]);
      if (!granted) throw new Error('Settings saved. Save again to grant access to the custom server.');
      void loadModels();
    } catch (error) {
      modelStatus.textContent = error.message;
    } finally {
      saving = false;
      el('saveBtn').disabled = false;
      renderSlots();
    }
  });

  el('refreshBtn').addEventListener('click', loadModels);
  el('displayMode').addEventListener('change', async event => {
    try {
      await chrome.storage.local.set({ displayMode: event.target.value });
    } catch {
      modelStatus.textContent = 'Could not save the display preference.';
    }
  });

  SLOTS.forEach((slot, index) => {
    el(slot).addEventListener('change', async event => {
      const selected = event.target.value;
      const separator = selected.indexOf(':');
      const model = selected ? { provider: selected.slice(0, separator), id: selected.slice(separator + 1) } : null;
      pendingSlots.add(slot);
      el('saveBtn').disabled = true;
      renderSlots();
      try {
        await chrome.storage.local.set({ [slot]: model });
        saved[slot] = model;
      } catch {
        modelStatus.textContent = 'Could not save the model selection. Try again.';
      } finally {
        pendingSlots.delete(slot);
        el('saveBtn').disabled = saving || pendingSlots.size > 0;
        renderSlots();
      }
    });

    el(`solveSlot${index + 1}`).addEventListener('click', async () => {
      solving = true;
      renderHome();
      solveStatus.textContent = 'Capturing the active tab…';
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'manual_solve', slot, mediaContext: el('mediaContext').value.trim()
        });
        if (!response?.ok) throw new Error(response?.error || 'The extension did not start the request.');
        window.close();
      } catch (error) {
        solveStatus.textContent = error.message;
        solving = false;
        renderHome();
      }
    });
  });

  function showSettings(show) {
    el('settings-view').style.display = show ? 'block' : 'none';
    el('home-view').style.display = show ? 'none' : 'block';
    el('toggleViewLabel').textContent = show ? 'Back' : 'Settings';
    toggle.setAttribute('aria-label', show ? 'Back to home' : 'Open AI settings');
    toggle.setAttribute('aria-expanded', String(show));
    if (show && loaded && !listRequest) void loadModels();
  }

  toggle.addEventListener('click', () => showSettings(el('settings-view').style.display === 'none'));
  el('setupAction').addEventListener('click', () => {
    showSettings(true);
    (hasProvider() && !el('slot1').disabled ? el('slot1') : geminiKey).focus();
  });
});
