document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved API keys
  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.openaiApiKey) {
      document.getElementById('openaiApiKey').value = result.openaiApiKey;
    }
  });

  // Save API key
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const openaiApiKey = document.getElementById('openaiApiKey').value.trim();

    const data = {};
    if (apiKey) data.geminiApiKey = apiKey;
    if (openaiApiKey) data.openaiApiKey = openaiApiKey;

    if (Object.keys(data).length > 0) {
      chrome.storage.local.set(data, () => {
        status.style.display = 'block';
        setTimeout(() => {
          status.style.display = 'none';
        }, 2000);
      });
    }
  });

  // Manual Solve Trigger
  const solveBtn = document.getElementById('solveBtn');
  if (solveBtn) {
    solveBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "manual_solve", model: 'flash' });
      window.close();
    });
  }

  const solveProBtn = document.getElementById('solveProBtn');
  if (solveProBtn) {
    solveProBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "manual_solve", model: 'pro' });
      window.close();
    });
  }

  const solveGptBtn = document.getElementById('solveGptBtn');
  if (solveGptBtn) {
    solveGptBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "manual_solve", model: 'gpt-5.2' });
      window.close();
    });
  }

  // View Toggling Logic
  const toggleBtn = document.getElementById('toggleViewBtn');
  const fakeView = document.getElementById('fake-view');
  const realView = document.getElementById('real-view');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (realView.style.display === 'none') {
        realView.style.display = 'block';
        fakeView.style.display = 'none';
      } else {
        realView.style.display = 'none';
        fakeView.style.display = 'block';
      }
    });
  }
});
