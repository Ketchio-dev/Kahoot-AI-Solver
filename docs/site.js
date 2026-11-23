// The preview uses local examples and never captures the screen.
(() => {
  const stage = document.getElementById('stage');
  const topic = document.getElementById('quiz-topic');
  const question = document.getElementById('quiz-question');
  const answers = [...stage.querySelectorAll('.ans')];
  const overlay = document.getElementById('overlay');
  const run = document.getElementById('run');
  const next = document.getElementById('next');
  const status = document.getElementById('stage-status');
  const modeGroup = document.querySelector('.seg');
  const controls = document.querySelector('.stage-controls');
  const modes = modeGroup.querySelectorAll('button');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const examples = [
    { topic: 'Astronomy', question: 'Which planet is known as the Red Planet?', options: ['Earth', 'Venus', 'Jupiter', 'Mars'], answer: 3 },
    { topic: 'Geography', question: 'Which city is the capital of Canada?', options: ['Toronto', 'Ottawa', 'Montréal', 'Vancouver'], answer: 1 },
    { topic: 'Science', question: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Helium', 'Carbon dioxide', 'Hydrogen'], answer: 2 }
  ];
  const colors = ['red', 'blue', 'yellow', 'green'];
  const shapes = ['▲', '◆', '●', '■'];
  let index = 0;
  let mode = 'normal';
  let state = 'idle';
  let timer;

  function render() {
    const example = examples[index];
    const color = colors[example.answer];
    const shape = shapes[example.answer];
    const compact = mode === 'stealth';
    topic.textContent = example.topic;
    question.textContent = example.question;
    for (const [optionIndex, element] of answers.entries()) {
      element.querySelector('span').textContent = example.options[optionIndex];
      element.toggleAttribute('data-highlight', state === 'shown' && !compact && example.answer === optionIndex);
    }

    stage.dataset.mode = mode;
    overlay.hidden = state === 'idle';
    overlay.className = state === 'shown'
      ? `ovl ovl-${mode} ovl-${color}`
      : 'ovl';
    overlay.textContent = state === 'pending'
      ? 'Analyzing example…'
      : compact ? shape : `${shape} ${color.toUpperCase()} · ${example.options[example.answer]}`;
    run.disabled = state === 'pending';
  }

  function showAnswer() {
    state = 'shown';
    render();
    const example = examples[index];
    status.textContent = `Example suggestion: ${colors[example.answer]}, ${example.options[example.answer]}.`;
  }

  run.addEventListener('click', () => {
    status.textContent = '';
    if (reduceMotion.matches) {
      showAnswer();
      return;
    }
    state = 'pending';
    status.textContent = 'Analyzing example.';
    render();
    timer = setTimeout(showAnswer, 500);
  });

  next.addEventListener('click', () => {
    clearTimeout(timer);
    state = 'idle';
    index = (index + 1) % examples.length;
    render();
    status.textContent = examples[index].question;
  });

  for (const button of modes) {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      for (const other of modes) other.setAttribute('aria-pressed', String(other === button));
      render();
    });
  }

  controls.hidden = false;
  modeGroup.hidden = false;
  render();
})();
