// All on-page feedback is deliberately small and corner-anchored so it stays
// unobtrusive on a shared screen.

const ANSWER_STYLES = {
    red: { color: '#C0392B', icon: '▲' },
    triangle: { color: '#C0392B', icon: '▲' },
    blue: { color: '#2980B9', icon: '◆' },
    diamond: { color: '#2980B9', icon: '◆' },
    yellow: { color: '#F1C40F', icon: '●' },
    circle: { color: '#F1C40F', icon: '●' },
    green: { color: '#27AE60', icon: '■' },
    square: { color: '#27AE60', icon: '■' }
};

const INDICATOR_ID = 'kahoot-stealth-indicator';
let indicatorTimer;
let displayMode = 'normal';

function removeIndicator() {
    clearTimeout(indicatorTimer);
    const existing = document.getElementById(INDICATOR_ID);
    if (existing) existing.remove();
}

function createIndicator() {
    removeIndicator();
    const indicator = document.createElement('div');
    indicator.id = INDICATOR_ID;
    indicator.className = displayMode === 'stealth' ? 'kahoot-stealth-indicator' : 'kahoot-normal-panel';
    document.body.appendChild(indicator);
    return indicator;
}

function showProcessing() {
    const indicator = createIndicator();
    indicator.classList.add('kahoot-stealth-indicator--pending');
    indicator.textContent = displayMode === 'stealth' ? '' : 'Analyzing question…';
}

function showAnswer(answer) {
    const indicator = createIndicator();
    let text;
    if (typeof answer === 'string') {
        const style = ANSWER_STYLES[answer.trim().toLowerCase()];
        if (!style) return showError('Invalid answer.');
        indicator.style.backgroundColor = style.color;
        text = displayMode === 'stealth' ? style.icon : `${style.icon} ${answer.toUpperCase()}`;
    } else if (answer.type === 'multiple') {
        text = answer.colors.map(color => ANSWER_STYLES[color]?.icon || '?').join(' ');
        if (displayMode !== 'stealth') text = `Select all: ${text}\n${answer.colors.join(', ')}`;
    } else if (answer.type === 'text') {
        text = answer.text;
    } else if (answer.type === 'number') {
        text = String(answer.value);
    } else if (answer.type === 'order') {
        text = answer.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
    } else {
        text = `Cannot determine: ${answer.message || 'Missing information'}`;
    }
    indicator.textContent = text;
    if (displayMode === 'stealth' && typeof answer !== 'string') indicator.classList.add('kahoot-stealth-detail');
    indicatorTimer = setTimeout(removeIndicator, displayMode === 'stealth' ? 8000 : 15000);
}

function showError(message) {
    console.warn('Kahoot AI error:', message);
    const indicator = createIndicator();
    indicator.style.backgroundColor = '#000000';
    indicator.textContent = displayMode === 'stealth' ? '!' : `Error: ${message}`;
    indicator.title = message;

    indicatorTimer = setTimeout(removeIndicator, 4000);
}

chrome.runtime.onMessage.addListener((request) => {
    // Messages from older workers/tests without a mode retain compact feedback.
    displayMode = request.mode === 'normal' ? 'normal' : 'stealth';
    if (request.action === 'show_processing') {
        showProcessing();
    } else if (request.action === 'highlight_answer') {
        if (request.answer) {
            showAnswer(request.answer);
        } else {
            showError('The AI could not identify the answer.');
        }
    } else if (request.action === 'error') {
        showError(request.message);
    }
});
