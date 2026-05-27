import { findParentContainers, findSimilarSiblings } from './grouper';
import { extractComponent, ComponentNode } from './extractor';

export let isPickerActive = false;
let hoveredElement: HTMLElement | null = null;
let selectedElement: HTMLElement | null = null;

// UI elements injected into page
let hoverOverlay: HTMLDivElement | null = null;
let hoverBadge: HTMLDivElement | null = null;
let selectedOverlay: HTMLDivElement | null = null;
let actionToolbar: HTMLDivElement | null = null;
let styleTag: HTMLStyleElement | null = null;

// Track history of smart group parent options
let parentOptions: HTMLElement[] = [];
let currentParentIndex = -1;

// Callback when selection is finalized and data is extracted
type SelectionCallback = (data: {
  node: ComponentNode;
  thumbnail: string;
}) => void;

let onSelectionConfirmed: SelectionCallback | null = null;

const PICKER_STYLE = `
  .pm-picker-element {
    pointer-events: none !important;
    position: absolute !important;
    z-index: 2147483646 !important;
    box-sizing: border-box !important;
    transition: all 0.12s cubic-bezier(0.16, 1, 0.3, 1) !important;
  }
  
  #pm-hover-overlay {
    border: 2px dashed #6366f1 !important;
    background-color: rgba(99, 102, 241, 0.06) !important;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.1) !important;
  }

  #pm-hover-badge {
    position: absolute !important;
    z-index: 2147483647 !important;
    background: rgba(10, 15, 30, 0.9) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    color: #c7d2fe !important;
    font-family: 'JetBrains Mono', monospace, sans-serif !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    padding: 5px 9px !important;
    border-radius: 6px !important;
    border: 1px solid rgba(99, 102, 241, 0.25) !important;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4) !important;
    pointer-events: none !important;
    white-space: nowrap !important;
  }

  #pm-selected-overlay {
    border: 2px solid #6366f1 !important;
    background-color: rgba(99, 102, 241, 0.04) !important;
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.2) !important;
  }

  #pm-action-toolbar {
    position: absolute !important;
    z-index: 2147483647 !important;
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    background: rgba(10, 15, 30, 0.8) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5) !important;
    padding: 5px !important;
    border-radius: 8px !important;
    pointer-events: auto !important;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  }

  .pm-toolbar-btn {
    background: transparent !important;
    color: #94a3b8 !important;
    border: none !important;
    padding: 5px 10px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    border-radius: 5px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    white-space: nowrap !important;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
  }

  .pm-toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.05) !important;
    color: #ffffff !important;
  }

  .pm-toolbar-btn:disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
  }

  .pm-toolbar-btn.confirm {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%) !important;
    color: #ffffff !important;
    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25) !important;
  }

  .pm-toolbar-btn.confirm:hover {
    background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%) !important;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4) !important;
    transform: scale(1.02) !important;
  }

  .pm-toolbar-btn.cancel {
    background: rgba(244, 63, 94, 0.15) !important;
    color: #fda4af !important;
    border: 1px solid rgba(244, 63, 94, 0.1) !important;
  }

  .pm-toolbar-btn.cancel:hover {
    background: rgba(244, 63, 94, 0.25) !important;
    color: #ffffff !important;
    border-color: rgba(244, 63, 94, 0.2) !important;
  }
`;

export let onPickerCancelled: (() => void) | null = null;

export function initPicker(callback: SelectionCallback, onCancel: () => void) {
  onSelectionConfirmed = callback;
  onPickerCancelled = onCancel;
  injectStyles();
}

function injectStyles() {
  if (styleTag) return;
  styleTag = document.createElement('style');
  styleTag.id = 'pm-picker-styles';
  styleTag.textContent = PICKER_STYLE;
  document.head.appendChild(styleTag);
}

export function startPicker() {
  if (isPickerActive) return;
  isPickerActive = true;
  selectedElement = null;
  hoveredElement = null;

  createOverlayElements();

  window.addEventListener('mouseover', handleMouseOver, true);
  window.addEventListener('mouseout', handleMouseOut, true);
  window.addEventListener('click', handlePageClick, true);
  window.addEventListener('keydown', handleKeyDown, true);
}

export function stopPicker() {
  if (!isPickerActive) return;
  isPickerActive = false;
  
  removeOverlayElements();

  window.removeEventListener('mouseover', handleMouseOver, true);
  window.removeEventListener('mouseout', handleMouseOut, true);
  window.removeEventListener('click', handlePageClick, true);
  window.removeEventListener('keydown', handleKeyDown, true);

  selectedElement = null;
  hoveredElement = null;

  onPickerCancelled?.();
}

function createOverlayElements() {
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = 'pm-hover-overlay';
    hoverOverlay.className = 'pm-picker-element';
    hoverOverlay.setAttribute('data-pm-picker-ignore', 'true');
    document.body.appendChild(hoverOverlay);
  }

  if (!hoverBadge) {
    hoverBadge = document.createElement('div');
    hoverBadge.id = 'pm-hover-badge';
    hoverBadge.setAttribute('data-pm-picker-ignore', 'true');
    document.body.appendChild(hoverBadge);
  }

  if (!selectedOverlay) {
    selectedOverlay = document.createElement('div');
    selectedOverlay.id = 'pm-selected-overlay';
    selectedOverlay.className = 'pm-picker-element';
    selectedOverlay.style.display = 'none';
    selectedOverlay.setAttribute('data-pm-picker-ignore', 'true');
    document.body.appendChild(selectedOverlay);
  }
}

function removeOverlayElements() {
  hoverOverlay?.remove();
  hoverOverlay = null;

  hoverBadge?.remove();
  hoverBadge = null;

  selectedOverlay?.remove();
  selectedOverlay = null;

  actionToolbar?.remove();
  actionToolbar = null;
}

function handleMouseOver(e: MouseEvent) {
  if (!isPickerActive || selectedElement) return;

  const target = e.target as HTMLElement;
  if (!target || target === document.documentElement || target === document.body) return;

  // Ignore our own overlay elements
  if (target.hasAttribute('data-pm-picker-ignore') || target.id === 'pm-picker-overlay-root') {
    return;
  }

  hoveredElement = target;
  updateOverlayPosition(hoverOverlay, hoverBadge, hoveredElement);
}

function handleMouseOut(e: MouseEvent) {
  if (!isPickerActive || selectedElement) return;
  const target = e.target as HTMLElement;
  if (target === hoveredElement) {
    hoveredElement = null;
    hideOverlay(hoverOverlay, hoverBadge);
  }
}

function handlePageClick(e: MouseEvent) {
  if (!isPickerActive) return;

  const target = e.target as HTMLElement;
  
  // If clicked inside the toolbar, don't intercept it
  if (actionToolbar?.contains(target)) {
    return;
  }

  // Intercept the click on any page element
  e.preventDefault();
  e.stopPropagation();

  if (target.hasAttribute('data-pm-picker-ignore') || target.id === 'pm-picker-overlay-root') {
    return;
  }

  selectElement(target);
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isPickerActive) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    stopPicker();
    // Dispatch state update to popup
    chrome.runtime.sendMessage({ action: 'PICKER_STATE_CHANGED', active: false });
  }
}

function selectElement(element: HTMLElement) {
  selectedElement = element;
  
  // Hide hover overlay
  hideOverlay(hoverOverlay, hoverBadge);

  // Update selected overlay position
  if (selectedOverlay) {
    selectedOverlay.style.display = 'block';
    updateOverlayPosition(selectedOverlay, null, selectedElement);
  }

  // Reset parent hierarchy suggestions
  parentOptions = findParentContainers(selectedElement);
  currentParentIndex = -1;

  // Show action toolbar
  showActionToolbar();
}

function clearSelection() {
  selectedElement = null;
  if (selectedOverlay) selectedOverlay.style.display = 'none';
  if (actionToolbar) actionToolbar.remove();
  actionToolbar = null;
}

function updateOverlayPosition(
  overlay: HTMLDivElement | null,
  badge: HTMLDivElement | null,
  element: HTMLElement
) {
  if (!overlay) return;

  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  overlay.style.top = `${rect.top + scrollY}px`;
  overlay.style.left = `${rect.left + scrollX}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.display = 'block';

  if (badge) {
    const classes = Array.from(element.classList)
      .filter(c => typeof c === 'string' && c.length < 20)
      .slice(0, 3)
      .map(c => `.${c}`)
      .join('');
    
    badge.textContent = `${element.tagName.toLowerCase()}${classes} [${Math.round(rect.width)} × ${Math.round(rect.height)}]`;
    
    // Position badge above the overlay, or below if not enough room
    const badgeHeight = 24;
    let badgeTop = rect.top + scrollY - badgeHeight - 6;
    if (badgeTop < scrollY + 5) {
      badgeTop = rect.top + scrollY + rect.height + 6;
    }
    
    badge.style.top = `${badgeTop}px`;
    badge.style.left = `${rect.left + scrollX}px`;
    badge.style.display = 'block';
  }
}

function hideOverlay(overlay: HTMLDivElement | null, badge: HTMLDivElement | null) {
  if (overlay) overlay.style.display = 'none';
  if (badge) badge.style.display = 'none';
}

function showActionToolbar() {
  if (actionToolbar) actionToolbar.remove();

  if (!selectedElement) return;

  actionToolbar = document.createElement('div');
  actionToolbar.id = 'pm-action-toolbar';
  actionToolbar.setAttribute('data-pm-picker-ignore', 'true');

  const rect = selectedElement.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Position below element, or above if no space
  let toolbarTop = rect.top + scrollY + rect.height + 8;
  if (toolbarTop + 50 > scrollY + window.innerHeight) {
    toolbarTop = rect.top + scrollY - 48;
  }
  if (toolbarTop < scrollY + 5) toolbarTop = scrollY + 5;

  actionToolbar.style.top = `${toolbarTop}px`;
  actionToolbar.style.left = `${Math.max(scrollX + 10, rect.left + scrollX)}px`;

  // Create buttons
  const btnParent = document.createElement('button');
  btnParent.className = 'pm-toolbar-btn';
  btnParent.innerHTML = '<span>↑</span> 向上层选择';
  btnParent.disabled = parentOptions.length === 0;
  btnParent.addEventListener('click', () => {
    if (parentOptions.length > 0) {
      currentParentIndex = (currentParentIndex + 1) % parentOptions.length;
      const nextParent = parentOptions[currentParentIndex];
      if (nextParent) {
        selectedElement = nextParent;
        if (selectedOverlay) updateOverlayPosition(selectedOverlay, null, selectedElement);
        // Refresh toolbar position
        showActionToolbar();
      }
    }
  });

  const btnSiblings = document.createElement('button');
  btnSiblings.className = 'pm-toolbar-btn';
  btnSiblings.innerHTML = '<span>⧉</span> 选择同类';
  btnSiblings.addEventListener('click', () => {
    if (!selectedElement) return;
    const siblings = findSimilarSiblings(selectedElement);
    if (siblings.length > 0) {
      // In MVP, we expand to group container containing them, or just group them
      // For now, let's wrap them in a temp component collection or just find their immediate parent container
      const parent = selectedElement.parentElement;
      if (parent && parent !== document.body) {
        selectedElement = parent;
        parentOptions = findParentContainers(selectedElement);
        currentParentIndex = -1;
        if (selectedOverlay) updateOverlayPosition(selectedOverlay, null, selectedElement);
        showActionToolbar();
      }
    } else {
      alert('未找到相似的同级元素');
    }
  });

  const btnConfirm = document.createElement('button');
  btnConfirm.className = 'pm-toolbar-btn confirm';
  btnConfirm.innerHTML = '✓ 确认提取';
  btnConfirm.addEventListener('click', handleConfirmExtraction);

  const btnCancel = document.createElement('button');
  btnCancel.className = 'pm-toolbar-btn cancel';
  btnCancel.innerHTML = '✗ 取消';
  btnCancel.addEventListener('click', () => {
    clearSelection();
  });

  actionToolbar.appendChild(btnParent);
  actionToolbar.appendChild(btnSiblings);
  actionToolbar.appendChild(btnConfirm);
  actionToolbar.appendChild(btnCancel);

  document.body.appendChild(actionToolbar);
}

async function handleConfirmExtraction() {
  if (!selectedElement || !onSelectionConfirmed) return;

  const target = selectedElement;
  clearSelection();
  stopPicker();
  
  // Notify popup picker deactivated
  chrome.runtime.sendMessage({ action: 'PICKER_STATE_CHANGED', active: false });

  // 1. Extract DOM details
  const node = extractComponent(target);

  // 2. Capture screenshot & Crop it
  let thumbnail = '';
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_SCREENSHOT' });
    if (response && response.dataUrl) {
      thumbnail = await cropElementImage(target, response.dataUrl);
    }
  } catch (err) {
    console.error('Failed to capture element screenshot:', err);
  }

  // 3. Callback
  onSelectionConfirmed({ node, thumbnail });
}

/**
 * Crops a full viewport screenshot to the dimensions of the selected element
 * and compresses it to a smaller thumbnail.
 */
function cropElementImage(element: HTMLElement, fullScreenshotUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rect = element.getBoundingClientRect();
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Cap thumbnail dimensions for database/localstorage efficiency
      const maxThumbSize = 150;
      let w = rect.width;
      let h = rect.height;
      
      if (w <= 0 || h <= 0) {
        resolve('');
        return;
      }

      // Calculate scale if we need to resize
      let scale = 1;
      if (w > maxThumbSize || h > maxThumbSize) {
        scale = maxThumbSize / Math.max(w, h);
      }

      canvas.width = w * scale;
      canvas.height = h * scale;

      if (ctx) {
        // Crop screenshot based on device pixel ratio (DPR)
        // chrome.tabs.captureVisibleTab is taken at the screen's layout resolution,
        // which matches the viewport coordinates. However, high-DPI screens might be scaled.
        // We will read the natural width/height of the captured image to compute the screen scale.
        const dprScaleX = img.naturalWidth / window.innerWidth;
        const dprScaleY = img.naturalHeight / window.innerHeight;

        // Clip source coords to visible bounds
        const sx = Math.max(0, rect.left * dprScaleX);
        const sy = Math.max(0, rect.top * dprScaleY);
        const sw = Math.min(img.naturalWidth - sx, rect.width * dprScaleX);
        const sh = Math.min(img.naturalHeight - sy, rect.height * dprScaleY);

        ctx.drawImage(
          img,
          sx, sy, sw, sh,     // Source rect
          0, 0, canvas.width, canvas.height // Destination rect
        );

        // Export as compressed JPEG to save storage space
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = fullScreenshotUrl;
  });
}

export async function extractWholePage() {
  const target = document.body;
  const node = extractComponent(target);

  let thumbnail = '';
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CAPTURE_SCREENSHOT' });
    if (response && response.dataUrl) {
      thumbnail = await cropElementImage(target, response.dataUrl);
    }
  } catch (err) {
    console.error('Failed to capture page screenshot:', err);
  }

  if (onSelectionConfirmed) {
    onSelectionConfirmed({ node, thumbnail });
  }
}
