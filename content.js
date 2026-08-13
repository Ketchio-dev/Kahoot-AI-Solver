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

function removeIndicator() {
    const existing = document.getElementById(INDICATOR_ID);
    if (existing) existing.remove();
}

function createIndicator() {
    removeIndicator();
    const indicator = document.createElement('div');
    indicator.id = INDICATOR_ID;
    indicator.className = 'kahoot-stealth-indicator';
    document.body.appendChild(indicator);
    return indicator;
}

function showProcessing() {
    const indicator = createIndicator();
    indicator.classList.add('kahoot-stealth-indicator--pending');
    indicator.textContent = '';
}

function showAnswer(answer) {
    const key = Object.keys(ANSWER_STYLES).find((k) => answer.toLowerCase().includes(k));
    const style = key ? ANSWER_STYLES[key] : { color: '#333333', icon: '?' };

    const indicator = createIndicator();
    indicator.style.backgroundColor = style.color;
    indicator.textContent = style.icon;

    setTimeout(removeIndicator, 2500);
}

function showError(message) {
    console.warn('Kahoot AI error:', message);
    const indicator = createIndicator();
    indicator.style.backgroundColor = '#000000';
    indicator.textContent = '!';
    indicator.title = message;

    setTimeout(removeIndicator, 4000);
}

chrome.runtime.onMessage.addListener((request) => {
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
