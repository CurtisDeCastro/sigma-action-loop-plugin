# Notes for AI coding assistants

This repository is a small Sigma plugin. Read this before changing it.

## What it is

A static page (`index.html`, `app.js`, `style.css`) plus 2 vendored libraries. It reads a column from a Sigma table, splits it into pages, and runs a workbook action once per page, waiting for a confirmation signal between pages. It never calls an API itself.

## Rules to keep

1. **No network access.** Don't add `fetch`, `XMLHttpRequest`, WebSockets, or analytics. `index.html` sets `connect-src 'none'` on purpose. Don't loosen the Content Security Policy.
2. **No credentials or secrets** in the code, the config, or the controls.
3. **No CDN or remote scripts.** Dependencies are vendored in `vendor/` at pinned versions. If you update one, replace the file and update `vendor/VERSIONS.txt` with the new npm integrity hash.
4. **Build the batch with `JSON.stringify`.** The API connector inserts the batch into a raw request body, so hand-built strings could break the JSON.
5. **Render with `textContent`,** not `innerHTML`, for anything that comes from the workbook.
6. **Stop on the first unconfirmed page.** Don't skip ahead. Resume starts at the failed page.

## Sigma SDK facts that cost time

- Load React before the SDK. The UMD global is `window.SigmaPlugin`, and it reads `window.React`.
- Everything is under `client.config.*`: `configureEditorPanel`, `subscribe`, `getVariable`, `setVariable`, `triggerAction`. Element data is `client.elements.subscribeToElementData`.
- `triggerAction` returns nothing. The plugin can't await it, so it watches the confirmation log control for a change.
- `getVariable` returns a descriptor such as `{ name, defaultValue: { type, value } }`. Unwrap it before comparing.
- Use the ID that the config returns for a bound control, not the name of the editor panel field.
- Firing actions without waiting loses iterations. Pace each page on the confirmation.

## How to test

There's no build step. Serve the folder with any static server, register the URL as a plugin in a test Sigma org, and run the setup in `README.md` with a small page size against a test endpoint. Check a clean run, a page that never confirms, **Resume**, and **Stop**.

## Ideas that fit

- A configurable per-page retry before stopping.
- Showing the last response status in the page table. This needs the action to write it to a control.
- Resuming automatically after a reload by reading the confirmation log.
