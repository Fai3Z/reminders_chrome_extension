// const DEFAULT_API_BASE = "http://127.0.0.1:8765";
const DEFAULT_API_BASE = "https://reminders-chrome-extension.onrender.com";

const apiBaseEl = document.getElementById("apiBase");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const pollNowBtn = document.getElementById("pollNow");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

async function loadSettings() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  apiBaseEl.value = apiBase || DEFAULT_API_BASE;
}

saveBtn.addEventListener("click", async () => {
  const v = apiBaseEl.value.trim() || DEFAULT_API_BASE;
  await chrome.storage.sync.set({ apiBase: v });
  setStatus("Saved.", "ok");
});

testBtn.addEventListener("click", async () => {
  const base = (apiBaseEl.value.trim() || DEFAULT_API_BASE).replace(/\/$/, "");
  setStatus("Testing…", "");
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(`OK — ${data.data_dir ?? "backend reachable"}`, "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Request failed", "err");
  }
});

pollNowBtn.addEventListener("click", async () => {
  const base = (apiBaseEl.value.trim() || DEFAULT_API_BASE).replace(/\/$/, "");
  setStatus("Polling…", "");
  try {
    const res = await fetch(`${base}/api/reminders/due`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
      setStatus("No reminders due for this minute.", "ok");
      return;
    }
    const first = list[0];
    await chrome.storage.local.set({
      pendingReminder: {
        id: first.id,
        title: first.title,
        content: first.content,
        firedAt: first.fired_at_time,
        fetchedAt: new Date().toISOString(),
      },
    });
    const url = chrome.runtime.getURL("reminder.html");
    await chrome.windows.create({ url, type: "popup", width: 420, height: 360, focused: true });
    setStatus(`Opened reminder: ${first.title}`, "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Request failed", "err");
  }
});

void loadSettings();
