# Action loop plugin for Sigma

Send a large batch of records to an API through a Sigma API connector, as a series of short calls from one click.

## The problem

A workbook needs to send many records to a downstream system. One API connector call can't carry them all. The request runs past the connector's timeout, or the response is too large, or the downstream system only takes one message at a time.

Splitting the batch into pages fixes the size of each call. But a **Call API** action runs once per trigger, so without help a person clicks once per page. Sigma has no built-in loop for this today.

## What this plugin does

It reads one column from a table, splits the values into pages, and for each page:

1. writes the page to a control as JSON,
2. triggers an action in your workbook that calls your API connector,
3. waits for the action to confirm it finished,
4. moves to the next page.

If a page doesn't confirm, it stops there and offers **Resume from page N**.

The plugin never calls your API. Your API connector does, from Sigma, with the credentials stored in Sigma. The plugin only presses the button, in order.

## Why it's easy to review

- **About 240 lines** of JavaScript in `app.js`, plus a small page and stylesheet.
- **No network requests.** `index.html` sets a Content Security Policy with `connect-src 'none'`, so the browser blocks any attempt. The plugin talks to Sigma only through the plugin SDK.
- **No credentials.** Nothing secret is configured in, or passed through, the plugin.
- **No CDN.** React 18.3.1 and `@sigmacomputing/plugin` 1.3.2 are bundled in `vendor/`. `vendor/VERSIONS.txt` has the npm integrity hashes so you can verify them.
- **Safe encoding.** The batch is written with `JSON.stringify`, so values can't break out of the JSON in your request body.

## Set it up

### 1. Host the files

The plugin is a static site. Any host that serves these files over HTTPS at a URL your users' browsers can reach will work, including an internal web server.

To use GitHub Pages: fork this repository, open **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. Your URL will look like `https://<your-account>.github.io/<repository>/`.

### 2. Register the plugin

An admin registers it in Sigma: open the Admin Portal, go to the **Account** page, find **Custom Plugins**, select **Add**, and enter a name and the **Production URL** from step 1. See [Register a plugin with your Sigma organization](https://help.sigmacomputing.com/docs/register-a-plugin-with-your-sigma-organization).

### 3. Add 4 text controls to the workbook

| Control | Holds |
|---|---|
| Page number | The page being sent |
| Page size | Records per page |
| Batch | The current page, as a JSON array |
| Confirmation log | A value that changes after each page succeeds |

Put them somewhere users won't edit them, such as a hidden page.

### 4. Create the API connector

Add dynamic values for the page number, page size, and batch. With a raw JSON body, for example:

```json
{"page": {{page}}, "pageSize": {{pageSize}}, "records": {{batch}}}
```

Review the connector's governance settings before the first run: **Request timeout** (defaults to 30 seconds), **Maximum retries** (defaults to 0), and **Maximum requests per minute** (defaults to 60). See [Configure API credentials and connectors](https://help.sigmacomputing.com/docs/configure-api-credentials-and-connectors-in-sigma).

### 5. Add the plugin to a page and bind it

Add a **Plugin** element, pick this plugin, and fill in the editor panel:

| Field | Bind to |
|---|---|
| Source table | The table that holds the records |
| Column to send | The column to put in each batch |
| Page number control | Your page number control |
| Page size control | Your page size control |
| Batch (JSON) control | Your batch control |
| Confirmation log control | Your confirmation log control |
| Action to run per page | The action sequence in step 6 |

### 6. Build the action sequence

In the plugin element's **Actions** tab, build this sequence on **Action to run per page**, in this order:

1. **Call API**, using your connector. Map its dynamic values to the page number, page size, and batch controls. See [Create actions that call API endpoints](https://help.sigmacomputing.com/docs/create-actions-that-call-api-endpoints).
2. **Set control value** on the confirmation log control, to its current value plus the page number. For example, with a control ID of `PublishLog` and a page number control ID of `PageNo`:

   ```
   Concat(Coalesce([PublishLog], ""), "|", [PageNo])
   ```

**The order matters.** The plugin can't tell when an action finishes, so it watches the confirmation log for a change. The log has to change only after the API call succeeds. If the call fails, the sequence should stop before step 2, so the log doesn't change and the plugin stops at that page. Confirm this in step 7.

### 7. Try a small run first

Set **Records per page** to 1 or 2 and point the connector at a test endpoint. Check what your API receives. Then point the connector at an endpoint that returns an error and confirm the plugin stops at the first page. Then run the full batch.

## Things to know

- **It runs in the browser.** Closing the tab or navigating away stops the loop partway. Make the receiving system accept repeats, then resume.
- **A timeout doesn't mean the page failed.** If a page confirms late, the receiving system may have processed it already. Resuming sends it again.
- **Check the record count.** The summary shows how many records the plugin received. Compare it with your table before you run, because the plugin can only send what Sigma passes to it.
- **It pages the records it sends.** It doesn't follow a next-page token that an API returns in its response. If you need that, see `AGENTS.md`.
- **One run at a time.** Controls lock while a run is in progress. Use **Stop** to end after the current page.
- **Pacing.** **Minimum seconds per page** (default 1.2) keeps you under a 60-requests-per-minute connector limit. Lower it only if you raise the limit.
- **Maximum wait per page** (default 150 seconds) should be longer than your connector's request timeout.

## Troubleshooting

- **"The Sigma plugin SDK did not load."** React has to load before the SDK, and the SDK's global is `window.SigmaPlugin`. Keep the script order in `index.html`.
- **A toast says a control wasn't found.** Variable and action fields take the ID of the bound control or action, not the name of the field. `app.js` reads the bound ID from the config for you.
- **The plugin reports a change every poll.** `getVariable` returns an object, not a string. Compare the unwrapped value, as `readLog` does.
- **Pages go missing when you fire and forget.** The SDK's `triggerAction` returns nothing, so it can't be awaited, and firing without waiting races. Waiting on the confirmation log is what keeps pages in order.

## Change it

`AGENTS.md` describes the design and the rules to keep, so you can extend the plugin with an AI coding assistant. Run any change through your usual review.

## License

MIT. See `LICENSE` and `THIRD-PARTY-NOTICES.md`.
