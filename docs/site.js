// This is a display preview, not a solve. No API calls or screenshots are made.
const preview = document.getElementById('quiz-preview');
const result = document.getElementById('demo-result');
const duration = document.getElementById('mode-duration');
const note = document.getElementById('demo-note');
const modeButtons = document.querySelectorAll('[data-mode]');

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const compact = button.dataset.mode === 'stealth';
    preview.dataset.display = compact ? 'stealth' : 'normal';
    result.textContent = compact ? '■' : '■ GREEN';
    duration.textContent = compact ? 'Shown for 8 s' : 'Shown for 15 s';
    note.textContent = compact
      ? 'Stealth still shows up in screenshots and screen sharing. This demo makes no AI requests.'
      : 'This only shows how answers are displayed. It makes no AI requests and captures no screen.';
    for (const modeButton of modeButtons) {
      modeButton.setAttribute('aria-pressed', String(modeButton === button));
    }
  });
}
