export interface Preferences {
  defaultExportFormat: 'json' | 'html';
  smartGroupEnabled: boolean;
  maxDepth: number;
}

export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  componentCount: number;
  timestamp: number;
  thumbnail?: string; // Small compressed Base64 image
  componentsData: string; // JSON serialized string of components
}

const DEFAULT_PREFERENCES: Preferences = {
  defaultExportFormat: 'json',
  smartGroupEnabled: true,
  maxDepth: 3,
};

export async function getPreferences(): Promise<Preferences> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return DEFAULT_PREFERENCES;
  }
  return new Promise((resolve) => {
    chrome.storage.sync.get('preferences', (result) => {
      resolve({ ...DEFAULT_PREFERENCES, ...result.preferences });
    });
  });
}

export async function setPreferences(prefs: Partial<Preferences>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  const current = await getPreferences();
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ preferences: { ...current, ...prefs } }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function getHistory(): Promise<HistoryItem[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return [];
  }
  return new Promise((resolve) => {
    chrome.storage.local.get('history', (result) => {
      resolve(result.history || []);
    });
  });
}

export async function addHistoryItem(item: Omit<HistoryItem, 'id' | 'timestamp'>): Promise<HistoryItem[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return [];
  }
  const history = await getHistory();
  const newItem: HistoryItem = {
    ...item,
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  // Limit history to 50 items
  const newHistory = [newItem, ...history].slice(0, 50);

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ history: newHistory }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(newHistory);
      }
    });
  });
}

export async function deleteHistoryItem(id: string): Promise<HistoryItem[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return [];
  }
  const history = await getHistory();
  const newHistory = history.filter((item) => item.id !== id);

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ history: newHistory }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(newHistory);
      }
    });
  });
}

export async function clearHistory(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ history: [] }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
