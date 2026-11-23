# Kahoot AI Solver

Chrome extension for asking a Gemini, OpenAI or compatible model about the quiz question visible on the active tab. It shows an answer suggestion in the corner of the page. You submit your own answer.

[Project site](https://ketchio-dev.github.io/Kahoot-AI-Solver/) · [Privacy policy](https://ketchio-dev.github.io/Kahoot-AI-Solver/privacy.html) · [Chrome Web Store](https://chromewebstore.google.com/detail/fgpbceoplppnfodmjcengikbefngpjfp)

## Install 2.0.1

Download and unzip [the 2.0.1 package](https://ketchio-dev.github.io/Kahoot-AI-Solver/downloads/kahoot-ai-solver-2.0.1.zip) or use the repository checkout containing `manifest.json`. In Chrome open `chrome://extensions/`, turn on **Developer mode**, select **Load unpacked**, and choose that folder. Disable the store copy if both are installed so they do not compete for shortcuts.

As of November 23, 2026, the Chrome Web Store serves **v1.4.0**. Its popup opens with an old “Youtube Ad Blocker” cover. In that version select **···** to reach AI settings. The unpacked 2.0.1 opens directly to **Kahoot AI Solver**.

## Connect a provider and solve

1. Open **Settings** and enter a key from [Gemini API](https://aistudio.google.com/apikey) or the [OpenAI API](https://platform.openai.com/api-keys). For an OpenAI-compatible server, expand **Custom OpenAI-compatible server**, enter the full API base URL including `/v1`, and grant access when Chrome asks. Use the server's HTTPS URL when available.
2. Click **Save keys & load models**. Select an image-capable model in any slot. The first slot is enough to get started. Chrome keeps your selection, provider settings and display preference in this browser profile.
3. Bring a tab that shows the question **and** its answer choices to the front. Click **Solve** next to your model on the popup home screen, or press its assigned keyboard shortcut. The reply appears in the bottom-right corner.

The default shortcuts for slots 1–3 are **Alt+Z**, **Alt+X**, and **Alt+C** (Option on macOS). The popup shows Chrome's actual bindings. If a slot shows **Unassigned**, set a shortcut at `chrome://extensions/shortcuts` or use its Solve button.

When a live Kahoot participant tab shows only colored buttons, the host can turn on **Show questions & answers on participants’ devices**. [Kahoot setup guide](https://support.kahoot.com/hc/en-us/articles/115003197928-How-to-enable-See-questions-on-participant-s-screen-in-Kahoot-live-games)

Use the **Audio or video context** field to provide a transcript or notes with a popup solve. Context is cleared when the popup closes. The extension captures the visible portion of the tab and records no audio or video. It can suggest single or multiple choices, typed answers, orderings and slider numbers. Review the suggestion before answering.

## How model selection works

| Provider | Model discovery | Answer request |
| --- | --- | --- |
| Gemini | `GET /v1beta/models`, filtered to models offering `generateContent` | `POST /v1beta/models/{model}:generateContent` |
| OpenAI | `GET /v1/models`, excluding known non-vision model families | `POST /v1/responses` |
| OpenAI-compatible | `GET {base}/models`, excluding models that explicitly declare `capabilities.vision: false` | `POST {base}/chat/completions` |

The extension uses the model ID you pick. When discovery cannot confirm image support, the dropdown marks the entry **check image support**. A saved model remains usable from the home screen while the list refreshes. If you change the OpenAI-compatible URL, choose the models again for that server.

## Troubleshooting

- **No model list** — check the API key and the server address. For a custom server, grant Chrome access and confirm it supports `/models` and image input through `/chat/completions`.
- **HTTP 401 or 403** — check the API key and its permissions. **HTTP 429** means the provider has limited the request. Check its quota, rate limit or billing.
- **Request timed out** — the answer request stops after 25 seconds. Choose a faster image-capable model for timed quizzes.
- **Chrome blocks the page** — switch to the quiz tab. Browser settings and other restricted pages cannot show an answer overlay.

## Development and packaging

```bash
node --test tests/regression.cjs tests/landing.cjs
python3 tools/package-extension.py
```

The packaging script creates and checks `store-assets/kahoot-ai-solver-<version>.zip`. The ZIP contains just the ten files Chrome needs.

With `playwright-core` installed, run `E2E_CHROME_PATH=/path/to/chrome node tests/local-e2e.cjs` to test the unpacked extension against a local mock API. The test opens Chrome’s native toolbar popup with no preset viewport. It checks first-run and configured layouts, long model IDs, both themes, expandable controls and answer feedback. The temporary test copy pre-grants permissions. Set `E2E_UI_ARTIFACTS` to a directory to save popup screenshots. Native permission prompts and live provider accounts require separate testing.

For the optional real-provider test, also supply `E2E_API_KEY`, `E2E_BASE_URL`, `E2E_MODEL_ID` and `E2E_SECOND_MODEL_ID`, then run `node tests/e2e.cjs`. Use an OpenAI-compatible server with two available image-capable models. The test sends screenshots of synthetic questions to that server.

The [project site](https://ketchio-dev.github.io/Kahoot-AI-Solver/) is built from `docs/`. The site and popup include [Lucide Static icons](https://lucide.dev/) with their [license](docs/assets/lucide-LICENSE.txt). To regenerate the icons, social image and privacy page, install `@resvg/resvg-js` and run `node tools/build-site.cjs`.
