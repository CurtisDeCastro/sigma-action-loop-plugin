// Action loop plugin for Sigma.
// Reads one column from a table, splits it into pages, and runs a workbook action once per page,
// waiting for each page to confirm before it sends the next. See README.md.
(function () {
  "use strict";

  const SDK = window.SigmaPlugin || {};
  const client = SDK.client;
  const root = document.getElementById("app");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  if (!client || !client.config) {
    root.textContent = "The Sigma plugin SDK did not load.";
    return;
  }

  // Editor panel. Each name is also the key the workbook binds to.
  const FIELDS = [
    { name: "source",     type: "element",                         label: "Source table" },
    { name: "valueCol",   type: "column", source: "source",        label: "Column to send" },
    { name: "pageNo",     type: "variable",                        label: "Page number control" },
    { name: "pageSize",   type: "variable",                        label: "Page size control" },
    { name: "batch",      type: "variable",                        label: "Batch (JSON) control" },
    { name: "publishLog", type: "variable",                        label: "Confirmation log control" },
    { name: "onPage",     type: "action-trigger",                  label: "Action to run per page" },
  ];
  client.config.configureEditorPanel(FIELDS);

  let cfg = {};
  let data = {};
  let unsubscribe = null;
  let subscribedTo = "";
  let running = false;
  let stopRequested = false;
  let resumeFrom = 1;
  let lastSize = 0;
  let ui = null;

  // A config value is an id string, or an object that carries one.
  const idOf = (v) => (v && typeof v === "object" ? v.elementId || v.controlId || "" : v || "");
  // Use the id the workbook bound, never the entry name above (the SDK rejects the name).
  const key = (name) => idOf(cfg[name]);

  // getVariable returns a descriptor, not a string, so compare the unwrapped value.
  function unwrap(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v.defaultValue && "value" in v.defaultValue) return String(v.defaultValue.value ?? "");
      if ("value" in v) return String(v.value ?? "");
      return "";
    }
    return String(v);
  }
  function readLog() {
    try { return unwrap(client.config.getVariable(key("publishLog"))); } catch (e) { return ""; }
  }

  const missing = () => FIELDS.filter((f) => !idOf(cfg[f.name])).map((f) => f.label);

  function values() {
    const col = idOf(cfg.valueCol);
    const arr = (col && data[col]) || [];
    return arr.filter((v) => v !== null && v !== undefined);
  }
  function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }
  function clampInt(value, lo, hi, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function field(labelText, input) {
    const label = el("label", null, labelText);
    label.appendChild(input);
    return label;
  }
  function numberInput(value, min, max, step) {
    const input = el("input");
    input.type = "number";
    input.value = value; input.min = min; input.max = max; input.step = step;
    return input;
  }

  function build() {
    root.textContent = "";
    ui = {
      summary: el("p", "hint"),
      size: numberInput(10, 1, 1000, 1),
      pace: numberInput(1.2, 0, 60, 0.1),
      wait: numberInput(150, 5, 600, 5),
      go: el("button", null, "Run"),
      stop: el("button", "ghost", "Stop"),
      clear: el("button", "ghost", "Clear log"),
      fill: el("i"),
      status: el("div", "status", "Ready."),
      tbody: el("tbody"),
    };
    const settings = el("div", "row");
    settings.append(
      field("Records per page", ui.size),
      field("Minimum seconds per page", ui.pace),
      field("Maximum wait per page (s)", ui.wait)
    );
    const buttons = el("div", "row");
    buttons.append(ui.go, ui.stop, ui.clear);
    const bar = el("div", "bar"); bar.appendChild(ui.fill);
    const table = el("table");
    const head = el("thead"); const hr = el("tr");
    ["Page", "Records", "Wait ms", ""].forEach((t) => hr.appendChild(el("th", null, t)));
    head.appendChild(hr); table.append(head, ui.tbody);
    const wrap = el("div", "wrap"); wrap.appendChild(table);
    root.append(ui.summary, settings, buttons, bar, ui.status, wrap);

    ui.stop.disabled = true;
    ui.size.addEventListener("change", paint);
    ui.go.addEventListener("click", () => run(resumeFrom));
    ui.stop.addEventListener("click", () => { stopRequested = true; });
    ui.clear.addEventListener("click", () => {
      if (!running && idOf(cfg.publishLog)) client.config.setVariable(key("publishLog"), "");
      ui.tbody.textContent = ""; ui.fill.style.width = "0"; resumeFrom = 1; paint();
    });
  }

  function setStatus(kind, text) { ui.status.className = "status " + kind; ui.status.textContent = text; }

  function paint() {
    if (!ui) build();
    if (running) return;
    const gaps = missing();
    const vals = values();
    const size = resumeFrom > 1 && lastSize ? lastSize : clampInt(ui.size.value, 1, 1000, 10);
    const pages = Math.ceil(vals.length / size);
    ui.size.disabled = resumeFrom > 1;
    if (gaps.length) {
      ui.summary.textContent = "Finish setup in the editor panel: " + gaps.join(", ") + ".";
      ui.go.disabled = true;
      return;
    }
    ui.summary.textContent = vals.length + " records, " + pages + " pages of " + size +
      ". Check that the record count matches your table before you run.";
    ui.go.disabled = vals.length === 0;
    ui.go.textContent = resumeFrom > 1 ? "Resume from page " + resumeFrom : "Run";
  }

  function setBusy(busy) {
    [ui.go, ui.size, ui.pace, ui.wait, ui.clear].forEach((n) => { n.disabled = busy; });
    ui.stop.disabled = !busy;
  }

  function addRow(page, count, waitedMs, landed) {
    const tr = el("tr");
    [page, count, Math.round(waitedMs), landed ? "confirmed" : "no confirmation"]
      .forEach((t) => tr.appendChild(el("td", null, String(t))));
    ui.tbody.appendChild(tr);
    ui.tbody.parentElement.parentElement.scrollTop = ui.tbody.parentElement.parentElement.scrollHeight;
  }

  function finish(kind, nextPage, total, message) {
    running = false;
    resumeFrom = kind === "done" ? 1 : nextPage;
    setBusy(false);
    setStatus(kind === "done" ? "ok" : "bad", message);
    paint();
  }

  async function run(from) {
    const vals = values();
    const size = from > 1 && lastSize ? lastSize : clampInt(ui.size.value, 1, 1000, 10);
    const paceMs = Math.max(0, parseFloat(ui.pace.value) || 0) * 1000;
    const maxWaitMs = Math.max(5, parseFloat(ui.wait.value) || 150) * 1000;
    const pages = chunk(vals, size);
    lastSize = size;
    running = true; stopRequested = false; setBusy(true);

    if (from === 1) {
      ui.tbody.textContent = ""; ui.fill.style.width = "0";
      client.config.setVariable(key("publishLog"), "");
    }
    client.config.setVariable(key("pageSize"), String(size));
    await sleep(300);
    let previous = readLog();
    const t0 = performance.now();

    for (let p = from - 1; p < pages.length; p++) {
      if (stopRequested) {
        return finish("bad", p + 1, pages.length, "Stopped before page " + (p + 1) + ". Resume when ready.");
      }
      setStatus("", "Sending page " + (p + 1) + " of " + pages.length + "...");
      const started = performance.now();
      client.config.setVariable(key("batch"), JSON.stringify(pages[p]));
      client.config.setVariable(key("pageNo"), String(p + 1));
      await sleep(100);                      // let both controls settle before the action reads them
      client.config.triggerAction(key("onPage"));

      // triggerAction can't be awaited, so wait for the confirmation log to change.
      let landed = false;
      while (performance.now() - started < maxWaitMs) {
        await sleep(100);
        const now = readLog();
        if (now !== previous) { previous = now; landed = true; break; }
      }
      addRow(p + 1, pages[p].length, performance.now() - started, landed);
      if (!landed) {
        return finish("bad", p + 1, pages.length,
          "Page " + (p + 1) + " didn't confirm within " + Math.round(maxWaitMs / 1000) +
          " s. Pages after it weren't sent. Check the action and the connector, then resume. " +
          "The receiving system may have processed page " + (p + 1) + " anyway, so it needs to accept repeats.");
      }
      ui.fill.style.width = (((p + 1) / pages.length) * 100) + "%";
      const rest = paceMs - (performance.now() - started);
      if (rest > 0) await sleep(rest);
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    finish("done", 1, pages.length, from === 1
      ? "All " + vals.length + " records sent in " + pages.length + " calls, " + secs + " s."
      : "Resumed at page " + from + ". All " + vals.length + " records are now sent (" +
        (pages.length - from + 1) + " calls this run, " + secs + " s).");
  }

  client.config.subscribe((c) => {
    cfg = c || {};
    const src = idOf(cfg.source);
    if (src && src !== subscribedTo) {
      if (unsubscribe) unsubscribe();
      subscribedTo = src;
      unsubscribe = client.elements.subscribeToElementData(src, (d) => { data = d || {}; paint(); });
    }
    paint();
  });
})();
