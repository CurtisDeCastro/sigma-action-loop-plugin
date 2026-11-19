# Using a plugin to run the publish loop: questions and answers

For anyone who needs to explain, review, or approve this approach.

## In short

The plugin runs a Sigma action once per page and waits for each page to confirm. The API connector makes every call, with credentials that stay in Sigma. The plugin has no network access, holds no secrets, and is short enough to review in under an hour. The 2 things to plan for are that someone hosts it and that the receiving system can accept a repeated page.

## Why a plugin?

A **Call API** action runs once per trigger, and Sigma has no built-in way to repeat an action across pages. A plugin can trigger an action, which makes it the only option today that keeps the publish inside the workbook where people already review and approve it.

## What can the plugin see and do?

It reads 1 column from 1 table that you bind, and it reads and writes 5 controls you bind. It triggers 1 action. You can confirm this in `app.js`, which is about 240 lines.

## Where do the credentials live?

In the API connector, in Sigma. The plugin never sees them, and nothing in its configuration is secret. People who trigger the action need the **Trigger API actions** permission and access to the connector, as with any Call API action.

## Can the plugin send data somewhere else?

Not from the browser. `index.html` sets a Content Security Policy with `connect-src 'none'`, so the browser blocks any network request the page tries to make. To check, open the plugin page in a browser and watch the network tab during a run. The only traffic is to the host that serves the plugin files.

## What does it load at runtime?

Only files from its own folder. React 18.3.1 and the Sigma plugin SDK 1.3.2 are bundled in `vendor/`, and `vendor/VERSIONS.txt` lists the npm integrity hashes. To verify, download the npm tarballs and compare the hashes.

## Who can use it?

An admin registers the plugin, so only your organization can use it. To add or edit a plugin element, a person needs the Admin account type or one with the **Manage plugins** permission, plus **Can edit** access to the workbook. Anyone else can run the workbook but can't change the plugin.

## Is it safe to host on GitHub Pages?

The files contain no secrets, so public hosting exposes only the code. For production, host it somewhere your organization owns, such as an internal web server or your own GitHub organization. That puts the hosting under your access controls and change review. Sigma doesn't host plugins, so the code you register is the code your host serves.

## What if the browser tab closes mid-run?

The loop stops at the page in progress, because it runs in the browser. Pages already confirmed stay sent. Reopen the workbook and resume from the page after the last confirmed one. Because the page in progress may have gone through, the receiving system should accept the same page twice without harm.

## What if a page fails or times out?

The plugin stops at that page and sends nothing after it. If the API call fails, the action sequence should stop before it writes the confirmation, so the plugin sees no confirmation and reports the page. Test this once by pointing the connector at an endpoint that returns an error. After you fix the cause, **Resume from page N** continues.

## Will it break a rate limit?

Set **Minimum seconds per page** to match your connector's **Maximum requests per minute**, which defaults to 60. The plugin's default of 1.2 seconds stays under that default. Review the connector's timeout and retry settings before the first run.

## Who maintains it?

Your team owns the code once you host it. It's MIT-licensed, has no build step, and is small enough to change with an AI coding assistant. `AGENTS.md` lists the rules to keep. Put it through your normal code review and vulnerability process.

## What if Sigma adds a native way to repeat an action?

Your connector, credentials, and downstream API would stay the same. You'd replace only the plugin that triggers the repeats.

## What are we still confirming?

- Whether the connector's response size limit applies per call or across a paginated sequence. Sigma is confirming.
- Which IP addresses API connector requests come from, if you plan to restrict your API to Sigma's addresses. Sigma lists egress IPs in the Admin Portal, and is confirming that API connector calls use them.
- The number of rows Sigma passes to a plugin for a table. The plugin shows the record count it received, so you can compare it with your table before each run.

## A 30-minute review checklist

1. Read `app.js` and confirm there's no `fetch`, `XMLHttpRequest`, or WebSocket.
2. Read the Content Security Policy in `index.html`.
3. Check the hashes in `vendor/VERSIONS.txt` against npm.
4. Confirm the action sequence writes the confirmation log only after the Call API step.
5. Run a 2-record page against a test endpoint and check what it receives.
