import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../popup/App';
// @ts-ignore
import appStyles from '../popup/App.css?inline';

let containerElement: HTMLDivElement | null = null;
let reactRoot: ReactDOM.Root | null = null;

function createFloatingPanel() {
  if (containerElement) return;

  // 1. Create outer container in host DOM
  containerElement = document.createElement('div');
  containerElement.id = 'pm-picker-floating-root';
  containerElement.style.position = 'fixed';
  containerElement.style.zIndex = '2147483645';
  containerElement.style.top = '0';
  containerElement.style.left = '0';
  containerElement.style.width = '0';
  containerElement.style.height = '0';
  containerElement.style.overflow = 'visible';
  containerElement.style.pointerEvents = 'none'; // Bubbles/panels will override this internally
  
  // 2. Attach Shadow DOM for style isolation
  const shadowRoot = containerElement.attachShadow({ mode: 'open' });
  document.body.appendChild(containerElement);

  // 3. Inject CSS styles into Shadow Root
  const styleTag = document.createElement('style');
  styleTag.textContent = appStyles;
  shadowRoot.appendChild(styleTag);

  // 4. Create React mount point inside Shadow DOM
  const mountPoint = document.createElement('div');
  mountPoint.id = 'pm-picker-floating-container';
  // Position default: bottom-right
  Object.assign(mountPoint.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '360px',
    height: '620px',
    zIndex: '2147483645',
    pointerEvents: 'auto', // Re-enable clicks
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s',
  });
  shadowRoot.appendChild(mountPoint);

  // 5. Render React App
  reactRoot = ReactDOM.createRoot(mountPoint);
  reactRoot.render(React.createElement(App));
}

function toggleFloatingPanel() {
  if (!containerElement) {
    createFloatingPanel();
  } else {
    // Toggle overall visibility of the injected React container
    const shadow = containerElement.shadowRoot;
    const mountPoint = shadow?.getElementById('pm-picker-floating-container');
    if (mountPoint) {
      if (mountPoint.style.display === 'none') {
        mountPoint.style.display = 'flex';
      } else {
        mountPoint.style.display = 'none';
      }
    }
  }
}

// Listen for action click message from background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'TOGGLE_FLOATING_PANEL') {
    toggleFloatingPanel();
    sendResponse({ success: true });
    return false;
  }
});

// Listen for Ctrl+Shift+E hotkey to toggle panel visibility directly
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    toggleFloatingPanel();
  }
}, true);
