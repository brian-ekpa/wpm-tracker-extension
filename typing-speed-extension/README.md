# Typing Speed Tracker

A Manifest V3 Chrome extension that measures typing speed on the current page. It stores session counts and timing in `chrome.storage.local`; it does not read, save, or send the text you type.

## Load into Chrome

1. Save or download the `typing-speed-extension` folder to your computer.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the `typing-speed-extension` folder (the one containing `manifest.json`).
6. Open a regular webpage, select the Typing Speed Tracker extension, then type into a text field, textarea, or editable page area.

The extension uses `activeTab`, so you need to open it once on each newly loaded page before it can track typing there. Chrome blocks extensions from running on internal pages such as `chrome://extensions`, the Chrome Web Store, and some protected pages.

## What the numbers mean

- **Current speed:** rolling speed over the most recent five seconds, using 5 characters per word.
- **Average:** total typed characters divided by five, divided by the session duration.
- **Peak:** highest current speed seen in the session.
- **Est. accuracy:** an estimate that treats backspaces as corrections. It cannot identify mistakes that were not corrected.
- **Characters:** printable characters typed; backspaces are counted separately for the accuracy estimate.

Stats are kept per open tab and remain available when the popup closes. Closing a tab clears that tab's session data. **Reset stats** clears the current tab's session.

## Permissions

- `activeTab`: temporary access to the page where you open the popup.
- `scripting`: injects the tracker into that page after you open the popup.
- `storage`: saves counts and timing locally in Chrome.
