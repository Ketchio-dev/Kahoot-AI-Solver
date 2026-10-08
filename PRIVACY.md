# Privacy policy — Kahoot AI Solver

Last updated: October 7, 2026. Applies to extension versions 1.4.0 and 1.4.1.

Kahoot AI Solver is an independent Chrome extension maintained by Ketchio-dev. It suggests answers to visible quiz questions using the AI API account and model you select. It does not operate a developer backend for processing screenshots or storing your API keys.

## Information the extension handles

- **API credentials and settings:** Gemini and OpenAI API keys you enter, your OpenAI-compatible server URL, model selections and answer display preference. These are stored using `chrome.storage.local` in your browser profile. They are not synced through `chrome.storage.sync`. Browser-local storage is not a claim of additional encryption by the extension.
- **Visible tab screenshots:** When you trigger a solve with a shortcut or popup button, the extension captures the visible portion of the active tab. Anything visible in that screenshot can be included, not just the question. Avoid triggering a solve while private information is visible.
- **Optional media context:** Transcripts, captions or observations you paste into the Audio/video context field. This text accompanies a request only when you click a popup solve button. It is not saved in extension storage and is discarded when the popup closes. Keyboard shortcuts do not include this text.
- **AI responses:** The selected provider's answer is processed in memory and shown on the page. The extension does not save screenshots or an answer history to extension storage. Diagnostic messages, selected model identifiers, answer results and errors may appear in local browser developer consoles; these are not uploaded to a developer analytics service.

The extension does not record microphone or tab audio, upload video, maintain a browsing-history database, or collect payment details. It includes no developer telemetry or advertising SDK.

## Why and where information is sent

API credentials authenticate requests to the provider or compatible server you configure. Model-list requests may run when you open settings, save your keys or refresh the model list. A screenshot and any optional context are sent only when you trigger a solve, to produce the requested quiz answer suggestion.

Depending on your selection, requests go to Google's Gemini API at `generativelanguage.googleapis.com`, OpenAI's API at `api.openai.com`, or the OpenAI-compatible server URL you enter. Your chosen server receives the associated credential, screenshot and any context necessary for that request. These requests go directly from your browser; they are not routed through a developer-operated server.

The extension uses HTTPS for the official Gemini and OpenAI endpoints. A custom server URL can use HTTP; this transmits API credentials and screenshots without transport encryption. Use a trusted HTTPS endpoint when possible. Grant custom-server access only to a server you trust.

Providers and custom-server operators apply their own privacy, retention and account policies. This extension cannot control their retention, logging or use of submitted content. Review your provider's terms and privacy settings before connecting it. API usage may be billed by that provider.

## Use, sharing and retention

The extension uses information only to load your available models, keep your settings, and provide the quiz answer assistance you request. It does not sell user data, use it for advertising, or use it for creditworthiness or lending decisions. The developer does not receive your API keys, screenshots or optional media context through the extension.

The extension's use and transfer of user data are limited to its disclosed quiz-assistance purpose and are intended to follow the Chrome Web Store User Data Policy, including its Limited Use requirements. Necessary transfers to the AI service you select are disclosed above.

Local settings remain until you change or remove them, clear the extension's data, or uninstall the extension. Screenshots, optional context and responses are processed transiently; they are not written to extension storage as an archive. Local browser diagnostics and a provider's records may have different retention periods.

## Your controls

Open AI settings using the extension icon, then the `···` button in v1.4.0 or the **Settings** button in v1.4.1. You can replace or clear API keys and save the changes, change your server URL, change or clear model selections, and choose the answer display mode. You can remove custom-server access through Chrome's extension permissions or uninstall the extension to remove its local stored settings. Revoke API keys through the issuing provider if you no longer want them used.

Deleting local settings or uninstalling does not delete requests already received by an AI provider. Contact the selected provider or server operator for their data access and deletion options.

## Contact and changes

For questions about this extension's data handling, use [the project's issue tracker](https://github.com/Ketchio-dev/Kahoot-AI-Solver/issues). Issues are public; do not include API keys, sensitive screenshots or other private information. This policy will be updated when the extension's data handling changes, with the revision date shown above.
