(() => {
  // The popup may inject this file more than once on the same page.
  if (window.__typingSpeedTrackerLoaded) return;
  window.__typingSpeedTrackerLoaded = true;

  const WINDOW_MS = 5000;
  const liveCharacters = [];
  let stats = {
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

  function isEditable(target) {
    if (!(target instanceof Element)) return false;

    const field = target.closest("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']");
    if (!field) return false;

    if (field instanceof HTMLInputElement) {
      const type = (field.type || "text").toLowerCase();
      return ["text", "search", "email", "url", "tel", "number"].includes(type);
    }

    return field instanceof HTMLTextAreaElement || field.isContentEditable;
  }

  function startSession(at) {
    if (stats.sessionStartedAt === null) stats.sessionStartedAt = at;
  }

  function calculateStats(now) {
    if (stats.sessionStartedAt === null) {
      stats.liveWpm = 0;
      stats.averageWpm = 0;
      stats.sessionDurationMs = 0;
      stats.accuracy = 100;
      return;
    }

    stats.sessionDurationMs = Math.max(0, now - stats.sessionStartedAt);
    const elapsedMinutes = stats.sessionDurationMs / 60000;
    stats.averageWpm =
      elapsedMinutes > 0
        ? stats.totalCharacters / 5 / elapsedMinutes
        : 0;

    while (liveCharacters.length && now - liveCharacters[0] > WINDOW_MS) {
      liveCharacters.shift();
    }

    if (liveCharacters.length && stats.lastActivityAt && now - stats.lastActivityAt <= WINDOW_MS) {
      // Use the actual elapsed time during the first few seconds, then a rolling 5-second window.
      const windowDuration = Math.max(
        1000,
        Math.min(WINDOW_MS, now - liveCharacters[0] + 1),
      );
      stats.liveWpm = liveCharacters.length / 5 / (windowDuration / 60000);
    } else {
      stats.liveWpm = 0;
    }

    stats.peakWpm = Math.max(stats.peakWpm, stats.liveWpm);
    stats.accuracy =
      stats.totalCharacters > 0
        ? Math.max(0, ((stats.totalCharacters - stats.backspaces) / stats.totalCharacters) * 100)
        : 100;
  }

  function publishStats() {
    calculateStats(Date.now());
    chrome.runtime.sendMessage({ type: "SAVE_STATS", stats }).catch(() => {
      // The worker can be starting up; the next keyboard event will retry.
    });
  }

  function onKeyDown(event) {
    if (!isEditable(event.target) || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const now = Date.now();
    startSession(now);
    stats.lastActivityAt = now;

    if (event.key === "Backspace") {
      stats.backspaces += 1;
    } else if (event.key.length === 1) {
      const characterCount = Array.from(event.key).length;
      stats.totalCharacters += characterCount;
      for (let i = 0; i < characterCount; i += 1) liveCharacters.push(now);
    }

    publishStats();
  }

  function onKeyUp(event) {
    if (!isEditable(event.target) || event.isComposing) return;
    // Listen for keyup to keep the live window fresh, but avoid counting or
    // writing the same keystroke a second time.
    calculateStats(Date.now());
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "RESET_TRACKER") {
      liveCharacters.length = 0;
      stats = {
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
  });

  // Restore this tab's session if the page is refreshed while the tab is open.
  chrome.runtime.sendMessage({ type: "GET_STATS", tabId: null }).then((response) => {
    // Don't overwrite activity if the user starts typing before storage responds.
    if (
      response?.ok &&
      response.stats &&
      stats.sessionStartedAt === null &&
      stats.totalCharacters === 0
    ) {
      stats = { ...stats, ...response.stats };
    }
  }).catch(() => {});

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
})();
