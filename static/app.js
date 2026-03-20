const API = "/api";

let activePane = 0;
const paneState = [
  { bucket: "", prefix: "", objects: [], buckets: null },
  { bucket: "", prefix: "", objects: [], buckets: null },
];

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + type;
}

function parsePath(pathStr) {
  const m = pathStr.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  if (!m) return null;
  return { bucket: m[1], prefix: (m[2] || "").replace(/\/$/, "") };
}

function formatPath(bucket, prefix) {
  return "s3://" + bucket + (prefix ? "/" + prefix : "");
}

async function fetchBuckets() {
  const res = await fetch(API + "/buckets");
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.buckets;
}

async function fetchObjects(bucket, prefix) {
  const params = new URLSearchParams({ bucket, prefix });
  const res = await fetch(API + "/objects?" + params);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderPane(paneIdx) {
  const state = paneState[paneIdx];
  const tbody = document.querySelector(`tbody[data-rows="${paneIdx}"]`);
  const pathInput = document.querySelector(`.path-input[data-path="${paneIdx}"]`);
  const selectAll = document.querySelector(`.select-all[data-pane="${paneIdx}"]`);

  pathInput.value = state.bucket ? formatPath(state.bucket, state.prefix) : "s3://";

  tbody.innerHTML = "";
  if (!state.bucket && !state.buckets) {
    tbody.innerHTML = "<tr><td colspan='4'>Loading buckets...</td></tr>";
    return;
  }

  if (!state.bucket && state.buckets !== null) {
    if (state.buckets.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4'>No buckets or error loading</td></tr>";
      return;
    }
    for (const b of state.buckets) {
      const tr = document.createElement("tr");
      tr.dataset.bucket = b.name;
      tr.innerHTML = `
        <td></td>
        <td class="prefix name-cell">${ICON_FOLDER}${escapeHtml(b.name)}/</td>
        <td class="size"></td>
        <td class="modified">${escapeHtml(new Date(b.created).toLocaleDateString())}</td>
      `;
      tr.addEventListener("click", () => {
        state.bucket = b.name;
        state.prefix = "";
        state.buckets = null;
        loadPane(paneIdx);
      });
      tbody.appendChild(tr);
    }
    return;
  }

  if (state.objects.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
    return;
  }

  if (!state.prefix) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td></td>
      <td class="prefix name-cell">${ICON_FOLDER}..</td>
      <td class="size"></td>
      <td class="modified"></td>
    `;
    tr.addEventListener("click", () => {
      state.bucket = "";
      state.prefix = "";
      loadPane(paneIdx);
    });
    tbody.appendChild(tr);
  }

  for (const obj of state.objects) {
    const tr = document.createElement("tr");
    tr.dataset.key = obj.key;
    tr.dataset.isPrefix = obj.is_prefix ? "1" : "0";

    const name = obj.key === ".." ? ".." : obj.key.split("/").filter(Boolean).pop() + (obj.is_prefix ? "/" : "");
    const size = obj.is_prefix ? "" : formatSize(obj.size);
    const modified = obj.last_modified ? new Date(obj.last_modified).toLocaleString() : "";

    const icon = obj.is_prefix ? ICON_FOLDER : ICON_FILE;
    const nameClass = obj.is_prefix ? "prefix name-cell" : "name-cell";
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check" data-key="${escapeAttr(obj.key)}" data-is-prefix="${obj.is_prefix ? "1" : "0"}"></td>
      <td class="${nameClass}">${icon}${escapeHtml(name)}</td>
      <td class="size">${escapeHtml(size)}</td>
      <td class="modified">${escapeHtml(modified)}</td>
    `;

    tr.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      if (obj.is_prefix && obj.key === "..") {
        const parts = state.prefix.split("/").filter(Boolean);
        parts.pop();
        state.prefix = parts.join("/");
        loadPane(paneIdx);
      } else if (obj.is_prefix) {
        state.prefix = state.prefix ? state.prefix + "/" + name.replace(/\/$/, "") : name.replace(/\/$/, "");
        loadPane(paneIdx);
      }
    });

    tr.addEventListener("dblclick", (e) => {
      if (e.target.type === "checkbox") return;
      if (obj.is_prefix && obj.key !== "..") {
        state.prefix = state.prefix ? state.prefix + "/" + name.replace(/\/$/, "") : name.replace(/\/$/, "");
        loadPane(paneIdx);
      }
    });

    tbody.appendChild(tr);
  }

  selectAll.checked = false;
  selectAll.indeterminate = false;
}

const ICON_FOLDER = '<span class="icon icon-folder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>';
const ICON_FILE = '<span class="icon icon-file" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>';

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return s.replace(/"/g, "&quot;");
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function loadPane(paneIdx) {
  const state = paneState[paneIdx];
  if (!state.bucket) {
    state.objects = [];
    state.buckets = null;
    try {
      state.buckets = await fetchBuckets();
    } catch (err) {
      setStatus("Error: " + err.message, "error");
      state.buckets = [];
    }
    renderPane(paneIdx);
    return;
  }
  state.buckets = null;
  try {
    const data = await fetchObjects(state.bucket, state.prefix);
    state.objects = data.objects;
    renderPane(paneIdx);
    setStatus("");
  } catch (err) {
    setStatus("Error: " + err.message, "error");
    state.objects = [];
    renderPane(paneIdx);
  }
}

function getSelectedKeys(paneIdx) {
  const state = paneState[paneIdx];
  const checks = document.querySelectorAll(`tbody[data-rows="${paneIdx}"] .row-check:checked`);
  return Array.from(checks).map((c) => c.dataset.key);
}

function getTargetPane() {
  return activePane === 0 ? 1 : 0;
}

function formatItemSummary(keys) {
  const filtered = keys.filter((k) => k !== "..");
  if (filtered.length === 0) return "";
  if (filtered.length === 1) {
    const name = filtered[0].split("/").filter(Boolean).pop();
    return name || filtered[0];
  }
  return filtered.length + " items";
}

async function doCopy() {
  const src = paneState[activePane];
  const dst = paneState[getTargetPane()];
  const keys = getSelectedKeys(activePane);
  if (!keys.length) {
    setStatus("Select items to copy", "error");
    return;
  }
  if (!dst.bucket) {
    setStatus("Set destination path in the other pane", "error");
    return;
  }
  const srcPath = formatPath(src.bucket, src.prefix);
  const dstPath = formatPath(dst.bucket, dst.prefix);
  const itemSummary = formatItemSummary(keys);
  try {
    setStatus("Copying " + itemSummary + " from " + srcPath + " → " + dstPath);
    const res = await fetch(API + "/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        src_bucket: src.bucket,
        src_keys: keys,
        dst_bucket: dst.bucket,
        dst_prefix: dst.prefix,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus("Copied " + itemSummary + " to " + dstPath, "success");
    loadPane(activePane);
    loadPane(getTargetPane());
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  }
}

async function doMove() {
  const src = paneState[activePane];
  const dst = paneState[getTargetPane()];
  const keys = getSelectedKeys(activePane);
  if (!keys.length) {
    setStatus("Select items to move", "error");
    return;
  }
  if (!dst.bucket) {
    setStatus("Set destination path in the other pane", "error");
    return;
  }
  const srcPath = formatPath(src.bucket, src.prefix);
  const dstPath = formatPath(dst.bucket, dst.prefix);
  const itemSummary = formatItemSummary(keys);
  try {
    setStatus("Moving " + itemSummary + " from " + srcPath + " → " + dstPath);
    const res = await fetch(API + "/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        src_bucket: src.bucket,
        src_keys: keys,
        dst_bucket: dst.bucket,
        dst_prefix: dst.prefix,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus("Moved " + itemSummary + " to " + dstPath, "success");
    loadPane(activePane);
    loadPane(getTargetPane());
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  }
}

async function doDelete() {
  const state = paneState[activePane];
  const keys = getSelectedKeys(activePane);
  if (!keys.length) {
    setStatus("Select items to delete", "error");
    return;
  }
  if (!confirm("Delete " + keys.length + " item(s)?")) return;
  const srcPath = formatPath(state.bucket, state.prefix);
  const itemSummary = formatItemSummary(keys);
  try {
    setStatus("Deleting " + itemSummary + " from " + srcPath);
    for (const key of keys) {
      if (key === "..") continue;
      const res = await fetch(API + "/object?bucket=" + encodeURIComponent(state.bucket) + "&key=" + encodeURIComponent(key), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
    }
    setStatus("Deleted " + itemSummary + " from " + srcPath, "success");
    loadPane(activePane);
  } catch (err) {
    setStatus("Error: " + err.message, "error");
  }
}

function setActivePane(idx) {
  activePane = idx;
  document.querySelectorAll(".pane").forEach((p, i) => p.classList.toggle("active", i === idx));
}

function init() {
  document.querySelectorAll(".pane").forEach((pane, idx) => {
    pane.addEventListener("click", () => setActivePane(idx));

    const pathInput = document.querySelector(`.path-input[data-path="${idx}"]`);
    const btnGo = document.querySelector(`.btn-go[data-go="${idx}"]`);

    const goToPath = () => {
      const val = pathInput.value.trim();
      if (val === "s3://" || val === "s3:") {
        paneState[idx].bucket = "";
        paneState[idx].prefix = "";
        loadPane(idx);
        return;
      }
      const parsed = parsePath(val);
      if (parsed) {
        paneState[idx].bucket = parsed.bucket;
        paneState[idx].prefix = parsed.prefix;
        loadPane(idx);
      } else {
        setStatus("Invalid path. Use s3://bucket/prefix/", "error");
      }
    };

    pathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") goToPath();
    });

    btnGo.addEventListener("click", goToPath);
  });

  document.getElementById("btn-copy").addEventListener("click", doCopy);
  document.getElementById("btn-move").addEventListener("click", doMove);
  document.getElementById("btn-delete").addEventListener("click", doDelete);
  document.getElementById("btn-refresh").addEventListener("click", () => {
    loadPane(0);
    loadPane(1);
  });

  const themeKey = "s3-commander-theme";
  const btnTheme = document.getElementById("btn-theme");
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    btnTheme.textContent = "Dark";
  }

  btnTheme.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    document.documentElement.setAttribute("data-theme", isLight ? "" : "light");
    btnTheme.textContent = isLight ? "Light" : "Dark";
    localStorage.setItem(themeKey, isLight ? "dark" : "light");
  });

  document.querySelectorAll(".select-all").forEach((cb, idx) => {
    cb.addEventListener("change", () => {
      document.querySelectorAll(`tbody[data-rows="${idx}"] .row-check`).forEach((r) => {
        r.checked = cb.checked;
      });
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "F5") {
      e.preventDefault();
      doCopy();
    } else if (e.key === "F6") {
      e.preventDefault();
      doMove();
    } else if (e.key === "F8") {
      e.preventDefault();
      doDelete();
    }
  });

  setActivePane(0);
  setStatus("Loading buckets...");
  loadPane(0);
  loadPane(1);
}

init();
