# Kahoot AI Solver — Smart Assistant

A Chrome extension that captures the current tab, sends it to a vision-capable AI model, and tells you which Kahoot answer to pick.

Model IDs are **not hardcoded**. The extension queries the Gemini and OpenAI model endpoints with your own API keys and lets you assign any of the returned models to a keyboard shortcut.

## Install

From the Chrome Web Store:

[<img src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/i7Rk01JtQ0qSjgBvdjQm.png" alt="Available in the Chrome Web Store" width="206" height="58">](https://chromewebstore.google.com/detail/fgpbceoplppnfodmjcengikbefngpjfp)

Or load it unpacked:

```bash
git clone https://github.com/Ketchio-dev/Kahoot-AI-Solver.git
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the cloned folder

## Setup

1. Click the extension icon, then the `···` button in the top-right corner to reveal the settings view.
2. Paste a **Gemini API key**, an **OpenAI API key**, or both. For an OpenAI-compatible server, set its API URL including `/v1` (the default is `https://api.openai.com/v1`). Click **Save Keys & Reload Models**, then grant access to that server when Chrome asks.
   - Custom servers must support `/models` and `/chat/completions` with image input. Models with `capabilities.vision: false` are excluded.
   - Prefer HTTPS. HTTP transmits your API key and screenshots without transport encryption; use it only on a trusted network.
3. The three dropdowns fill with candidate image-capable models fetched live. Official OpenAI model metadata does not guarantee image or Chat Completions support; some listed models may still reject the request.
4. Assign a model to each slot. Your choice is stored locally and used by the matching shortcut.

Get keys from [Google AI Studio](https://aistudio.google.com/apikey) and the [OpenAI platform](https://platform.openai.com/api-keys).

## Usage

| Shortcut | Action |
| --- | --- |
| `Alt+Z` | Solve with model slot 1 |
| `Alt+X` | Solve with model slot 2 |
| `Alt+C` | Solve with model slot 3 |

You can also press the buttons next to each dropdown in the popup.

Choose **Normal** or **Stealth** in the settings' Answer display dropdown. Normal (the default) shows a readable answer panel for 15 seconds. Stealth uses a small corner shape for single-choice answers and a compact text box for richer answers (8 seconds). Compact does not mean invisible: both modes can appear in screenshots or screen sharing. Neither mode clicks or submits answers.

Supported answer formats now include single-color options (including visible true/false options), multiple correct colors, typed text, ordered option labels for puzzles, and numeric answers for sliders. If the question, audio/video content or required context is missing, the model is instructed to report that it cannot determine an answer. Surveys and personal preferences are not factual questions to solve. These are screenshot-based suggestions, not guaranteed coverage of every Kahoot format or correct answers.

In Stealth mode, while a request is running, a faint dot pulses in the bottom-right corner. When the answer arrives, that dot turns into the shape and color of the correct option for eight seconds, and the extension icon flashes the same color:

| Color | Kahoot shape | Indicator |
| --- | --- | --- |
| Red | Triangle | ▲ |
| Blue | Diamond | ◆ |
| Yellow | Circle | ● |
| Green | Square | ■ |

In Stealth mode, errors surface as a black `!` dot; Normal mode shows the error message in its panel. Errors are also logged to the browser console. The compact single-answer indicator is 14px and click-through.

Holding a shortcut down will not stack requests: while one solve is in flight, further triggers are ignored so you are not billed for duplicate calls.

## Audio and video questions

The extension does **not** currently record sound or upload video. In settings, paste a transcript, captions or observations into **Audio/video context**, then click the desired solve button. That text is sent with the screenshot, is not saved to disk/storage, and is discarded when the popup closes. Keyboard shortcuts do not include this context. Do not paste sensitive material you do not want sent to the selected provider.

Direct media support requires more than a model capability flag: the chosen server must also accept the exact audio/video request format. A future explicit tab-recording flow should capture tab audio (not the microphone) with a visible recording indicator, provide stop/cancel controls, and use transcription plus sampled video frames or a verified native multimodal endpoint. Missing media content should not be guessed.

## How live model loading works

`models.js` calls:

- `GET https://generativelanguage.googleapis.com/v1beta/models` — paginated, keeping only models that advertise `generateContent`
- `GET {OpenAI API URL}/models` — explicit `capabilities.vision` metadata takes priority when present; otherwise speech, image-generation, embedding, moderation and legacy completion models are filtered out by id pattern

Results are merged into a single provider-tagged list. Each slot starts with **Choose a model…** and requires an explicit selection. No model is automatically assigned. Refresh preserves your selection when it is available; if it disappears, choose another model rather than silently switching to a different paid model. Nothing is cached between popup openings — hitting **Refresh model list** always re-queries the APIs, so newly released models appear without an extension update.

## Files

| File | Purpose |
| --- | --- |
| `models.js` | Live model discovery for both providers |
| `background.js` | Service worker: screenshot capture, model calls, icon feedback |
| `popup.html` / `popup.js` | Settings UI, key storage, slot assignment |
| `content.js` / `styles.css` | Corner indicator for pending, answer and error states |
| `manifest.json` | MV3 manifest, permissions, shortcuts |

## Privacy

API keys and slot selections live in `chrome.storage.local` on your machine. Screenshots go directly from your browser to the provider you chose. There is no backend server.

## Development checks

```bash
node --test tests/regression.cjs tests/landing.cjs
```

`tests/landing.cjs` statically checks the `docs/` site (links, anchors, install URL, shortcuts against the manifest, icon sizes). It needs no network access or API keys. The regression tests cover response validation, custom API routing and model filtering, concurrent solve protection, and indicator timer cleanup. They do not replace testing the unpacked extension in Chrome.

`tests/e2e.cjs` creates a local Kahoot-style quiz and tests model discovery, explicit selection, refresh persistence, model switching, screenshot capture, real API calls and answer indicators for arithmetic, science, geography, multiple correct answers, typed text, ordering, numeric answers and transcript-assisted answers across both display modes. Install `playwright-core` in your test environment and run with `E2E_API_KEY` and `E2E_CHROME_PATH` (an extension-capable Chrome for Testing binary). It uses the test API at `http://100.81.152.90:20128/v1`. Credentials are supplied only by environment variable and temporary profiles are removed afterward. The test pre-grants permissions in a temporary extension copy and invokes the solve entry point directly. Native permission approval, reopening the popup with saved settings, the popup solve button and Option+Z have also been manually exercised in Chrome for Testing on macOS.

## Website and logo

`docs/` holds a static Korean landing page. GitHub Pages can serve it from the `main` branch and `/docs` folder. `docs/assets/logo.svg` is the logo source. `tools/build-site.cjs` renders `icon16.png`, `icon48.png` and `icon128.png` from it and rebuilds `docs/privacy.html` from `PRIVACY.md`:

```bash
npm install --no-save @resvg/resvg-js
node tools/build-site.cjs
```

The icons ship inside the extension package, so a new logo reaches the Chrome Web Store only with the next uploaded version.

## Disclaimer

Built for learning and research. Using it to cheat in a graded or competitive setting is on you.
