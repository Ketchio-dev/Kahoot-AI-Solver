// Display preview only. It makes no network requests, captures no screen and stores nothing.
(() => {
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const run = document.getElementById('run');
  const note = document.getElementById('stage-note');
  const status = document.getElementById('stage-status');
  const controls = document.querySelector('.stage-controls');
  if (!stage || !overlay || !run || !note || !status || !controls) return;

  const modeButtons = controls.querySelectorAll('[data-mode]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const NOTES = {
    normal: 'Simulated display with a sample question. No AI request is made and nothing is captured. In the real extension the panel stays for 15 seconds.',
    stealth: 'Simulated display. Stealth shows a 14 px dot in the corner for single-choice answers, for 8 seconds. It still appears in screenshots and screen sharing.'
  };
  const ANSWER_LABEL = 'Example suggestion shown: green, Mars.';

  let mode = 'normal';
  let timer;

  function paint(state) {
    const stealth = mode === 'stealth';
    const pending = state === 'pending';
    overlay.className = 'ovl ' + (stealth ? 'ovl-stealth' : 'ovl-normal') + (pending ? ' pending' : ' ovl-green');
    overlay.textContent = pending ? (stealth ? '' : 'Analyzing question…') : (stealth ? '■' : '■ GREEN');
    stage.dataset.mode = mode;
  }

  function showAnswer() {
    paint('shown');
    status.textContent = ANSWER_LABEL;
  }

  run.addEventListener('click', () => {
    clearTimeout(timer);
    status.textContent = '';
    if (reduceMotion.matches) {
      showAnswer();
      return;
    }
    paint('pending');
    timer = setTimeout(showAnswer, 900);
  });

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      clearTimeout(timer);
      mode = button.dataset.mode === 'stealth' ? 'stealth' : 'normal';
      for (const other of modeButtons) other.setAttribute('aria-pressed', String(other === button));
      note.textContent = NOTES[mode];
      showAnswer();
    });
  }

  controls.hidden = false;
})();
