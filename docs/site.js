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
    duration.textContent = compact ? '실제 표시: 8초' : '실제 표시: 15초';
    note.textContent = compact
      ? 'Stealth도 화면 캡처나 화면 공유에 보여요. 이 데모는 실제 AI 요청을 하지 않아요.'
      : '표시 방식만 보여주는 데모예요. 실제 AI 요청이나 화면 캡처는 하지 않아요.';
    for (const modeButton of modeButtons) {
      modeButton.setAttribute('aria-pressed', String(modeButton === button));
    }
  });
}
