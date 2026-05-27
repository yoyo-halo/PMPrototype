// Background service worker for PM Prototype Picker extension

// Listen for action click to toggle the floating panel inside the web page
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  
  chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_FLOATING_PANEL' }, () => {
    if (chrome.runtime.lastError) {
      console.warn('Content script not active in target tab. Page refresh might be required.');
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_SCREENSHOT') {
    const windowId = sender.tab?.windowId || chrome.windows.WINDOW_ID_CURRENT;
    
    chrome.tabs.captureVisibleTab(
      windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Screenshot error:', chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl });
        }
      }
    );
    return true; // Keeps the message channel open for asynchronous sendResponse
  }

  if (message.action === 'PING') {
    sendResponse({ pong: true });
    return false;
  }
});
