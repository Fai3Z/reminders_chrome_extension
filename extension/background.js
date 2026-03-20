// const DEFAULT_API_BASE = "http://127.0.0.1:8765";
const DEFAULT_API_BASE = "https://reminders-chrome-extension.onrender.com";
const POLL_ALARM = "reminder_poll";
function dedupeStorageKey(id, day, firedAtTime) {
  return JSON.stringify(["reminderFired", id, day, firedAtTime]);
}

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  const base = typeof apiBase === "string" && apiBase.trim() ? apiBase.trim() : DEFAULT_API_BASE;
  return base.replace(/\/$/, "");
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function alreadyFired(dedupeKey) {
  const { [dedupeKey]: v } = await chrome.storage.local.get(dedupeKey);
  return Boolean(v);
}

async function markFired(dedupeKey) {
  await chrome.storage.local.set({ [dedupeKey]: Date.now() });
  await pruneOldFiredKeys();
}

/** Keep storage small: drop reminder dedupe keys from other calendar days */
async function pruneOldFiredKeys() {
  const t = todayKey();
  const all = await chrome.storage.local.get(null);
  const drop = [];
  for (const k of Object.keys(all)) {
    let parsed;
    try {
      parsed = JSON.parse(k);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || parsed[0] !== "reminderFired") continue;
    const day = parsed[2];
    if (typeof day === "string" && day !== t) drop.push(k);
  }
  if (drop.length) await chrome.storage.local.remove(drop);
}

async function openReminderWindow(payload) {
  await chrome.storage.local.set({ pendingReminder: payload });
  const url = chrome.runtime.getURL("reminder.html");
  await chrome.windows.create({
    url,
    type: "popup",
    width: 420,
    height: 360,
    focused: true,
  });
}

async function pollOnce() {
  await pruneOldFiredKeys();
  const base = await getApiBase();
  let res;
  try {
    res = await fetch(`${base}/api/reminders/due`);
  } catch {
    return;
  }
  if (!res.ok) return;
  /** @type {{ id: string, title: string, content: string, fired_at_time: string }[]} */
  let list;
  try {
    list = await res.json();
  } catch {
    return;
  }
  if (!Array.isArray(list) || !list.length) return;

  const day = todayKey();
  for (const item of list) {
    const dedupeKey = dedupeStorageKey(item.id, day, item.fired_at_time);
    if (await alreadyFired(dedupeKey)) continue;
    await markFired(dedupeKey);
    await openReminderWindow({
      id: item.id,
      title: item.title,
      content: item.content,
      firedAt: item.fired_at_time,
      fetchedAt: new Date().toISOString(),
    });
  }
}

function schedulePoll() {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  schedulePoll();
  const cur = await chrome.storage.sync.get("apiBase");
  if (!cur.apiBase) await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
});

chrome.runtime.onStartup.addListener(() => {
  schedulePoll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void pollOnce();
});
