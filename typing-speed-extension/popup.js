const STORAGE_KEY = "typingStatsByTab";
const IDLE_AFTER_MS = 2500;
let activeTabId = null;
let currentStats = null;
let pageIsAvailable = false;

const elements = {
  liveWpm: document.getElementById("live-wpm"),
  averageWpm: document.getElementById("average-wpm"),
  peakWpm: document.getElementById("peak-wpm"),
  totalCharacters: document.getElementById("total-characters"),
  accuracy: document.getElementById("accuracy"),
  duration: document.getElementById("session-duration"),
  status: document.getElementById("live-status"),
  statusLabel: document.getElementById("status-label"),
  notice: document.getElementById("notice"),
  meter: document.querySelector(".meter"),
  meterFill: document.getElementById("meter-fill"),
  reset: document.getElementById("reset-button"),
};

function setNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("is-error", isError);
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function roundWpm(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function render() {
  if (!currentStats) return;

  const now = Date.now();
  const startedAt = currentStats.sessionStartedAt;
  const lastActivityAt = currentStats.lastActivityAt;
  const hasSession = Number.isFinite(startedAt);
  const duration = hasSession ? Math.max(0, now - startedAt) : 0;
  const active = Number.isFinite(lastActivityAt) && now - lastActivityAt <= IDLE_AFTER_MS;
  const liveWpm = active ? currentStats.liveWpm || 0 : 0;
  const averageWpm = duration > 0
    ? (currentStats.totalCharacters || 0) / 5 / (duration / 60000)
    : 0;

  elements.liveWpm.textContent = String(roundWpm(liveWpm));
  elements.averageWpm.textContent = String(roundWpm(averageWpm));
  elements.peakWpm.textContent = String(roundWpm(currentStats.peakWpm || 0));
  elements.totalCharacters.textContent = String(currentStats.totalCharacters || 0);
  elements.accuracy.textContent = String(roundWpm(currentStats.accuracy ?? 100));
  elements.duration.textContent = formatDuration(duration);
  elements.status.classList.toggle("is-active", active);
  elements.statusLabel.textContent = active ? "Typing" : hasSession ? "Paused" : "Ready";

  const progress = Math.min(100, Math.max(0, (liveWpm / 200) * 100));
  elements.meterFill.style.width = `${progress}%`;
  elements.meter.setAttribute("aria-valuenow", String(Math.min(200, roundWpm(liveWpm))));

  if (active) {
    setNotice("Typing activity detected on this page.");
  } else if (!hasSession && pageIsAvailable) {
    setNotice("Ready when you are. Type in a text field on this page.");
  } else if (!hasSession) {
    setNotice("Open this popup on a regular webpage to start tracking.", true);
  } else {
    setNotice("Session saved on this device. Type again to continue.");
  }
}

async function getStats(tabId) {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATS", tabId });
  if (!response?.ok) throw new Error(response?.error || "Couldn't load session stats.");
  return response.stats;
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setNotice("No active browser tab is available.", true);
    return;
  }

  activeTabId = tab.id;
  try {
    // activeTab grants access to this page after the user opens the extension.
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["content.js"],
    });
    pageIsAvailable = true;
  } catch {
    pageIsAvailable = false;
    currentStats = {
      sessionStartedAt: null,
      lastActivityAt: null,
      totalCharacters: 0,
      backspaces: 0,
      liveWpm: 0,
      averageWpm: 0,
      peakWpm: 0,
      accuracy: 100,
    };
    render();
    setNotice("Chrome doesn't allow extensions on this page. Try a regular website.", true);
    return;
  }

  try {
    currentStats = await getStats(activeTabId);
    render();
  } catch {
    setNotice("Couldn't read saved stats. Close and reopen the popup to retry.", true);
  }
}

elements.reset.addEventListener("click", async () => {
  if (activeTabId === null) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "RESET_STATS",
      tabId: activeTabId,
    });
    if (!response?.ok) throw new Error("Reset failed.");
    currentStats = response.stats;
    render();
  } catch {
    setNotice("Couldn't reset stats. Please try again.", true);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY] || activeTabId === null) return;
  const allStats = changes[STORAGE_KEY].newValue || {};
  currentStats = allStats[String(activeTabId)] || {
    sessionStartedAt: null,
    lastActivityAt: null,
    totalCharacters: 0,
    backspaces: 0,
    liveWpm: 0,
    averageWpm: 0,
    peakWpm: 0,
    accuracy: 100,
  };
  render();
});

// Refresh duration and change the live display to zero after typing stops.
window.setInterval(render, 500);
initialize();
