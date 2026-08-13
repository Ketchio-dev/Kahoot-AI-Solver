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

1. Click the extension icon, then the ⚙️ button in the top-right corner to reveal the settings view.
2. Paste a **Gemini API key**, an **OpenAI API key**, or both, and click **Save Keys & Reload Models**.
3. The three dropdowns fill with every model your keys can actually reach, fetched live at that moment.
4. Assign a model to each slot. Your choice is stored locally and used by the matching shortcut.

Get keys from [Google AI Studio](https://aistudio.google.com/apikey) and the [OpenAI platform](https://platform.openai.com/api-keys).

## Usage

| Shortcut | Action |
| --- | --- |
| `Alt+Z` | Solve with model slot 1 |
| `Alt+X` | Solve with model slot 2 |
| `Alt+C` | Solve with model slot 3 |

You can also press the buttons next to each dropdown in the popup.

While a request is running, a faint dot pulses in the bottom-right corner. When the answer arrives, that dot turns into the shape and color of the correct option for a couple of seconds, and the extension icon flashes the same color:

| Color | Kahoot shape | Indicator |
| --- | --- | --- |
| Red | Triangle | ▲ |
| Blue | Diamond | ◆ |
| Yellow | Circle | ● |
| Green | Square | ■ |

Errors surface as a black `!` dot in the same corner rather than a popup dialog, with the message in its tooltip and the browser console. The indicator is 14px and click-through, so it never blocks the page.

Holding a shortcut down will not stack requests: while one solve is in flight, further triggers are ignored so you are not billed for duplicate calls.

## How live model loading works

`models.js` calls:

- `GET https://generativelanguage.googleapis.com/v1beta/models` — paginated, keeping only models that advertise `generateContent`
- `GET https://api.openai.com/v1/models` — the response carries no modality metadata, so speech, image-generation, embedding, moderation and legacy completion models are filtered out by id pattern

Results are merged into a single provider-tagged list. If a slot has no saved selection, the first available model is used automatically, so a new install works as soon as a key is saved. Nothing is cached between popup openings — hitting **Refresh model list** always re-queries the APIs, so newly released models appear without an extension update.

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

## Disclaimer

Built for learning and research. Using it to cheat in a graded or competitive setting is on you.
