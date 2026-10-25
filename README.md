![Quick Translator icon](icons/icon128.png)

<h1 align="center">Quick Translator</h1>

<p align="center">
  A Chrome extension for translating selected text and whole pages.<br>
  A minimalist black interface, Chrome's offline model, and a cloud fallback.
</p>

<p align="center">
  <img alt="Chrome 102+" src="https://img.shields.io/badge/Chrome-102%2B-000000?style=flat-square&logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-000000?style=flat-square">
  <img alt="UI languages" src="https://img.shields.io/badge/UI-RU%20%7C%20UK%20%7C%20EN-000000?style=flat-square">
  <img alt="No API key" src="https://img.shields.io/badge/API%20key-not%20required-000000?style=flat-square">
</p>

---

## Features

- **Selection translation** — a popup next to the selected fragment.
- **Whole-page translation** that preserves the HTML structure and can restore the original.
- **Offline translation** using Chrome 138+'s built-in model after the language pair is downloaded.
- **Cloud fallback** — Google Translate, DeepL, and MyMemory when the offline model is unavailable.
- **Three UI languages**: Russian, Ukrainian, and English.
- **45 translation languages**, including Russian, Ukrainian, English, German, Chinese, and others.
- **Auto-detection** of the source language.
- **Keyboard shortcuts** and a context menu.
- **Configurable auto-translation of the selection**.
- Code, `pre/code` blocks, input fields, and images are not modified during page translation.
- Works without its own server and without an API key.

## UI languages

The UI language is selected in the extension popup and applies to the popup, translation window, notifications, and context menu.

| Language | Code |
| --- | --- |
| Russian | `ru` |
| Ukrainian | `uk` |
| English | `en` |

The UI language does not affect the translation language — the target language is selected separately.

## Installation

1. Open `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Pin the extension to the Chrome toolbar.
6. Refresh already open tabs (`F5`) so the content script attaches.

After changing files, click the reload button on `chrome://extensions/` and reload open tabs.

## Usage

### Translating selected text

1. Select text on a regular web page.
2. If **auto-translate selection** is enabled, the translation window appears immediately.
3. Click **Copy** to copy the result or **Replace** to replace the selected fragment.
4. Close the window with `Esc` or the close button.

If auto-translation of the selection is disabled, no window appears when you select text. In that case, use:

- the `Alt+Shift+S` shortcut;
- the **Translate selected text** context menu item.

This way the translation window appears only on explicit request.

### Translating the whole page

1. Open the extension popup.
2. Choose the target language.
3. Click **Translate page**.
4. Wait for completion — the button changes to **Restore original**.

During translation, you can click the button again to cancel the operation and restore the original text.

### Offline translation

In Chrome 138+, the extension uses the built-in `Translator` and `LanguageDetector`. Once the model is downloaded, text is translated on-device and does not consume online service quotas.

1. On the first translation, a **Download offline** button may appear.
2. Click it and wait for the language model to download.
3. Progress is shown in the translation window or in a page notification.

Chrome stores the model separately for each origin, so a new site may require confirmation again. Downloading never starts automatically — only when the button is clicked.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+S` | Translate selected text |
| `Alt+Shift+T` | Translate or restore the whole page |
| `Esc` | Close the translation window or notification |

Shortcuts can be changed at `chrome://extensions/shortcuts`.

## Context menu

- Right-click selected text → **Translate selected text**.
- Right-click the page → **Translate page / restore original**.

Menu item names are localized together with the interface.

## Settings

The popup provides:

- **UI language** — Russian, Ukrainian, or English;
- **Translation language** — the target language;
- **Auto-translate selection** — show the translation immediately after selecting text;
- management of the current page translation.

Settings are stored in `chrome.storage.sync` and applied to new translations without reloading the extension.

## Limitations

- The extension does not work on `chrome://`, the Chrome Web Store page, and protected browser pages.
- Text inside `iframe`, the PDF viewer, and closed Shadow DOM may not be translated.
- Page translation modifies text nodes. Attributes (`title`, `placeholder`, `alt`, `aria-label`) and input field values are not translated.
- Very large pages are translated partially to avoid overloading the service.
- Some sites re-render content after translation — run the translation again.
- For `file://`, enable **Allow access to file URLs** on `chrome://extensions/`.
- Chrome's offline translator does not support all language pairs; when a pair is unavailable, the cloud is used.
- The built-in translator is only available in Chrome 138+ and in secure contexts (`https://`, `localhost`).
- MyMemory is used as the last fallback and has a small daily limit.
- Translating large pages may take several seconds.

## Privacy

The extension has no server of its own and does not collect statistics.

- With offline translation, text is processed on-device and is never sent anywhere.
- In cloud mode, text is sent to public services: Google Translate → DeepL → MyMemory.
- A temporary translation cache may be kept in service worker memory; no history is stored on disk.

## Technical details

- Manifest V3, minimum Chrome version — 102.
- Offline translation requires Chrome 138+ and a secure context.
- Primary mode — Chrome's built-in `Translator` and `LanguageDetector`.
- Cloud chain: Google (`translate_a/single`) → DeepL JSON-RPC → MyMemory.
- On a 429, 5xx, timeout, or network error, the provider is temporarily excluded from the chain.
- For page translation, text is split into groups, and fragment integrity is verified using service markers.
- If markers are lost, fallback translation per individual text node is enabled.
- `host_permissions: <all_urls>` is required to work on arbitrary sites and to make requests to cloud services.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| The popup says "Unavailable" | Refresh the page (`F5`) or open a regular website |
| No translation appears after installation | Reload the tab — the content script attaches only after that |
| Does not work on a local HTML file | Enable file access in the extension settings |
| Keyboard shortcuts do not work | Check the shortcuts at `chrome://extensions/shortcuts` |
| Service connection error | Check your internet connection and try again |
| Asks to download the offline model again | Chrome stores the model separately for each origin — confirm the download on the new site |
| Offline translation is unavailable for the language pair | Choose another language or use cloud mode |
| Nothing changed after editing the code | Click the reload button on `chrome://extensions/` and reload the tab |

## Built with AI

This project was created with the help of artificial intelligence tools.

## What's new in 1.1.0

- New monochrome icon matching the interface style.
- Russian, Ukrainian, and English UI languages.
- When auto-translation is disabled, selecting text no longer opens the window — translation is triggered only by the keyboard shortcut or from the context menu.
- Notifications, errors, and the context menu are localized.
