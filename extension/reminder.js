const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const bodyEl = document.getElementById("body");
const closeBtn = document.getElementById("close");

closeBtn.addEventListener("click", () => {
  window.close();
});

const { pendingReminder } = await chrome.storage.local.get("pendingReminder");
if (pendingReminder && typeof pendingReminder === "object") {
  titleEl.textContent = pendingReminder.title || "Reminder";
  metaEl.textContent = [
    pendingReminder.firedAt ? `Scheduled: ${pendingReminder.firedAt}` : null,
    pendingReminder.id ? `ID: ${pendingReminder.id}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  bodyEl.textContent = pendingReminder.content || "(empty)";
  await chrome.storage.local.remove("pendingReminder");
} else {
  titleEl.textContent = "No reminder";
  metaEl.textContent = "";
  bodyEl.textContent = "Open this window from the background worker or use “Poll for due reminders now” in the extension popup.";
}
