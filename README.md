# Exterstellar

A quality-of-life browser extension for [Stardance](https://stardance.hackclub.com/). It adds a plugin system (similar to Vencord) system with many plugins to choose from! This includes: custom themes, sidebar tweaks, a markdown toolbar, hotkeys, and many more!

## Installation

Exterstellar is currently on [Firefox](https://addons.mozilla.org/en-US/firefox/addon/exterstellar/) and [Chrome](https://chromewebstore.google.com/detail/exterstellar/pnepneldglohbplepnlhfcojeehakcgd) web stores.

### From the latest build (recommended)

Download the latest build from the [workflow](https://github.com/Team-Exterstellar/Exterstellar/actions/workflows/build-extension-zip.yml) and extract it to a desired location on your device. Take a note of where you extracted it.

### Building from source

```bash
cd your/path/to/your/extracted/folder
cd extension
npm install
npm run build
```

Then copy the static files to the newly created `dist/` folder:
- **Windows**: `copy manifest.json dist\ && copy popup.html dist\ && copy popup.css dist\ && copy importer.html dist\ && xcopy images dist\images\ /E /I /Y`
- **Mac/Linux**: `cp manifest.json popup.html popup.css importer.html dist/ && cp -r images dist/`

### Chrome / Chromium

1. Go to [chrome://extensions](chrome://extensions)
2. Enable **Developer Mode** (top-right toggle)
3. If using the workflow build: unzip the downloaded file twice (also unzip the inner `use-this...zip`). You should end up with a folder.
4. If building from source: use the `extension/dist/` folder directly.
5. Click **Load unpacked** and select the folder.

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`.
2. If using the workflow build: unzip the downloaded file once, then click **Load Temporary Add-on...** and select the inner `use-this...zip` file directly.
3. If building from source: click **Load Temporary Add-on...** and select any file inside `extension/dist/` (e.g. `manifest.json`).

> **Note:** Firefox temporary add-ons are removed when the browser closes. For a persistent install, you must install the extension via the Firefox Add-ons store.

## Plugins

Plugins are the features you can toggle on and off for Exterstellar. There are many built-in ones you can choose from. The list of all the plugins is available below:

| Plugin Type  | No. of Plugins |
|--------------|----------------|
| **All**      | **16**         |
| Official     | 14             |
| Community    | 2              |

### Better GOI

**[Community Plugin] Made by Gizzy**

The GOI dash you always wanted! Cuz well you know it sucks

### Better Sidebar

**[Official Plugin] Made by Sabio**

Redesigns the sidebar to look visually better.

### Custom Font

**[Official Plugin] Made by Sabio**

Apply a custom font across Stardance!

### Devlog Changelog

**[Official Plugin] Made by Sabio**

Adds an 'add changelog' button that inserts your GitHub/GitLab commit history for that devlog.

TODO: add the missing ones here
