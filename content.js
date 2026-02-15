// Cursor SVGs removed for stealth mode (Pixel strategy)

// Helper to show stealth visible indicator
const highlightAnswer = (color) => {
    console.log("Kahoot AI (Stealth): Showing indicator for:", color);

    // Remove previous indicators
    const existingInd = document.getElementById('kahoot-stealth-indicator');
    if (existingInd) existingInd.remove();

    const c = color.toLowerCase().trim();
    let displayIcon = '?';
    // Use muted/darker colors for stealth, or just white on dark bg.
    // Let's use the actual color but small.
    let displayColor = '#333';

    if (c.includes('red') || c.includes('triangle')) {
        displayColor = '#C0392B'; // Darker Red
        displayIcon = '▲';
    }
    else if (c.includes('blue') || c.includes('diamond')) {
        displayColor = '#2980B9'; // Darker Blue
        displayIcon = '◆';
    }
    else if (c.includes('yellow') || c.includes('circle')) {
        displayColor = '#F1C40F'; // Gold/Yellow
        displayIcon = '●';
    }
    else if (c.includes('green') || c.includes('square')) {
        displayColor = '#27AE60'; // Darker Green
        displayIcon = '■';
    }

    // Create a small corner indicator
    const indicator = document.createElement('div');
    indicator.id = 'kahoot-stealth-indicator';
    indicator.className = 'kahoot-stealth-indicator';
    indicator.style.backgroundColor = displayColor; // Optional: background color matches answer
    // OR keep background dark and make text color match? 
    // Let's stick to colored background for quick recognition.

    indicator.innerHTML = displayIcon;

    document.body.appendChild(indicator);

    // Auto-remove after 0.5 seconds (Flash mode)
    setTimeout(() => {
        if (indicator) indicator.remove();
    }, 500);
};

// Initial listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'show_processing') {
        // User requested no visual "AI is thinking" status
    }
    else if (request.action === 'highlight_answer') {
        // User requested no text overlay for answer
        if (request.answer) {
            highlightAnswer(request.answer);
        } else {
            // Optional: still alert on failure? User seemed to want stealth, but errors might still be useful.
            // Let's keep error alert but remove success overlay.
            console.log("AI could not identify the answer.");
            alert("AI가 정답을 찾지 못했습니다. 다시 시도해 주세요.");
        }
    }
    else if (request.action === 'error') {
        const status = document.getElementById('kahoot-ai-status');
        if (status) {
            status.innerText = 'Error: ' + request.message;
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 5000);
        } else {
            alert("오류 발생: " + request.message);
        }
    }
});
