# Action loop plugin for Sigma

## What it is

A small Sigma plugin that sends a large batch to an API as a series of short calls, from one click. It reads a column from a table, splits the values into pages, and runs a workbook action once per page, waiting for each page to confirm before it sends the next.

Your API connector makes the calls, from Sigma, with the credentials stored in Sigma. The plugin only runs the action, in order.

## The problem it solves

One API connector call has a request timeout and a response size limit. A batch that's too big or too slow for one call can be split into pages, but a **Call API** action runs once per trigger, so a person would click once per page. Sigma has no built-in loop for this today.

## How it works

1. **Read.** The plugin reads one column from a table you choose.
2. **Slice.** It splits the values into pages of a size you set.
3. **Send.** For each page it writes the batch to a control and triggers your action, which calls the API connector.
4. **Confirm.** The action changes a log control after the call succeeds. The plugin waits for that change, then sends the next page.
5. **Stop or resume.** If a page doesn't confirm, the plugin stops there. **Resume from page N** picks up where it left off.

## What makes it reviewable

- About 240 lines of JavaScript.
- No network requests. A Content Security Policy blocks them in the browser.
- No credentials in the plugin.
- No CDN. Both dependencies are bundled, with hashes you can verify.

## Good fits

- Sending a large batch to a system that accepts small messages.
- Calling a rate-limited API without exceeding its limit.
- Bulk updates that run longer than one request allows.
- Any repeated action that has a clear "that worked" signal.

## Build and change plugins with an AI coding assistant

Plugins are small enough for an AI coding assistant to read in one pass. This repository includes `AGENTS.md`, which lists the design, the rules to keep, and the Sigma SDK details that cost time to find, so an assistant can extend the plugin safely. A team that sets up plugin hosting and review once can reuse it for the next plugin. Review every change the way you review any code.

## Get started

1. Read the [README](../README.md) for setup.
2. Host the files over HTTPS. GitHub Pages works, and so does any internal static host.
3. Register the plugin in the Sigma Admin Portal and follow the workbook steps in the README.

See also: [questions and answers for your review](questions-and-answers.md).
