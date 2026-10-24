const STORAGE_KEY = "typingStatsByTab";
let storageQueue = Promise.resolve();

function enqueueStorageOperation(operation) {
  const result = storageQueue.then(operation);
  storageQueue = result.catch(() => {});
  return result;
}

function emptyStats() {
  return {
    sessionStartedAt: null,
    lastActivityAt: null,
    totalCharacters: 0,
    backspaces: 0,
    liveWpm: 0,
    averageWpm: 0,
    peakWpm: 0,
    sessionDurationMs: 0,
    accuracy: 100,
  };
}

function isValidStats(stats) {
  return (
    stats &&
    typeof stats === "object" &&
    Number.isFinite(stats.totalCharacters) &&
    Number.isFinite(stats.backspaces) &&
    Number.isFinite(stats.liveWpm) &&
    Number.isFinite(stats.averageWpm) &&
    Number.isFinite(stats.peakWpm)
  );
}

// All data is keyed by tab so separate pages don't get mixed together.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_STATS") {
    const tabId = message.tabId == null ? sender.tab?.id : Number(message.tabId);
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "Missing tab." });
      return;
    }

    enqueueStorageOperation(() => chrome.storage.local.get(STORAGE_KEY)).then((data) => {
      const allStats = data[STORAGE_KEY] || {};
      sendResponse({ ok: true, stats: allStats[String(tabId)] || emptyStats() });
    }).catch(() => sendResponse({ ok: false, error: "Couldn't read saved stats." }));
    return true;
  }

  if (message?.type === "SAVE_STATS") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId) || !isValidStats(message.stats)) {
      sendResponse({ ok: false });
      return;
    }

    enqueueStorageOperation(() => chrome.storage.local.get(STORAGE_KEY).then((data) => {
      const allStats = data[STORAGE_KEY] || {};
      allStats[String(tabId)] = message.stats;
      return chrome.storage.local.set({ [STORAGE_KEY]: allStats });
    })).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "Couldn't save stats." }));
    return true;
  }

  if (message?.type === "RESET_STATS") {
    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "Missing tab." });
      return;
    }

    enqueueStorageOperation(() => chrome.storage.local.get(STORAGE_KEY).then((data) => {
      const allStats = data[STORAGE_KEY] || {};
      delete allStats[String(tabId)];
      return chrome.storage.local.set({ [STORAGE_KEY]: allStats });
    })).then(async () => {
      // Reset the in-page timer too, if this page has already been activated.
      try {
        await chrome.tabs.sendMessage(tabId, { type: "RESET_TRACKER" });
      } catch {
        // The page may not have a content script yet; storage is still reset.
      }
      sendResponse({ ok: true, stats: emptyStats() });
    }).catch(() => sendResponse({ ok: false, error: "Couldn't reset stats." }));
    return true;
  }
});

// Remove entries for closed tabs. Stats remain intact when only the popup closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  enqueueStorageOperation(() => chrome.storage.local.get(STORAGE_KEY).then((data) => {
    const allStats = data[STORAGE_KEY] || {};
    if (!(String(tabId) in allStats)) return;
    delete allStats[String(tabId)];
    return chrome.storage.local.set({ [STORAGE_KEY]: allStats });
  })).catch(() => {});
});
