import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MousePointerClick,
  History,
  Trash2,
  Globe,
  Layers,
  Check,
  Clock,
  X,
  GripHorizontal
} from 'lucide-react';
import {
  getHistory,
  deleteHistoryItem,
  clearHistory,
  HistoryItem
} from '../utils/storage';
import { startPicker, stopPicker, initPicker, extractWholePage } from '../content/selector';
import { compileHTMLAndCSS } from '../content/extractor';

export default function App() {
  const [active, setActive] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  // Floating widget states
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ startX: number; startY: number; mouseX: number; mouseY: number } | null>(null);
  const clickPreventRef = useRef<boolean>(false);

  // Synchronize parent container size dynamically to prevent blocking page elements, and handle positioning
  useEffect(() => {
    const container = document.getElementById('pm-picker-floating-root')
      ?.shadowRoot?.getElementById('pm-picker-floating-container');
    if (!container) return;
    
    const width = isCollapsed ? 104 : 360;
    const height = isCollapsed ? 32 : 620;

    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = 'fixed';
    container.style.transform = 'none';

    if (position === null) {
      // Default: bottom-right lock
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.left = 'auto';
      container.style.top = 'auto';
    } else {
      // Custom coordinates with boundary clamp check
      const maxLeft = window.innerWidth - width;
      const maxTop = window.innerHeight - height;
      const clampedX = Math.max(0, Math.min(position.x, maxLeft));
      const clampedY = Math.max(0, Math.min(position.y, maxTop));
      
      container.style.left = `${clampedX}px`;
      container.style.top = `${clampedY}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';

      if (clampedX !== position.x || clampedY !== position.y) {
        setPosition({ x: clampedX, y: clampedY });
      }
    }
  }, [isCollapsed, position]);

  // Handle global ESC to close panel or exit preview modal
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedItem) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedItem(null);
          return;
        }
        if (!active) {
          handleClosePanel();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [active, selectedItem]);

  // Handle panel dragging move and release
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      
      const { startX, startY, mouseX, mouseY } = dragStartRef.current;
      const deltaX = e.clientX - mouseX;
      const deltaY = e.clientY - mouseY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        clickPreventRef.current = true;
      }

      let newX = startX + deltaX;
      let newY = startY + deltaY;

      const width = isCollapsed ? 104 : 360;
      const height = isCollapsed ? 32 : 620;
      const maxLeft = window.innerWidth - width;
      const maxTop = window.innerHeight - height;

      newX = Math.max(0, Math.min(newX, maxLeft));
      newY = Math.max(0, Math.min(newY, maxTop));

      const container = document.getElementById('pm-picker-floating-root')
        ?.shadowRoot?.getElementById('pm-picker-floating-container');
      if (container) {
        container.style.left = `${newX}px`;
        container.style.top = `${newY}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      
      const container = document.getElementById('pm-picker-floating-root')
        ?.shadowRoot?.getElementById('pm-picker-floating-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        setPosition({ x: rect.left, y: rect.top });
      }

      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [isDragging, isCollapsed]);

  // Load history and initialize picker callback directly on mount
  useEffect(() => {
    loadHistory();

    // Directly bind selector events without message passing
    initPicker(
      ({ node, thumbnail }) => {
        const host = window.location.hostname;
        const pageTitle = document.title || '无标题页面';
        
        const { html, css } = compileHTMLAndCSS(node, 'inline');
        
        const countNodes = (n: typeof node): number => {
          return 1 + n.children.reduce((acc, child) => acc + countNodes(child), 0);
        };
        
        const componentCount = countNodes(node);
        
        // Save locally
        getHistory().then((hist) => {
          const newItem: HistoryItem = {
            id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: window.location.href,
            title: `${pageTitle} - ${node.tagName.toLowerCase()}`,
            componentCount,
            timestamp: Date.now(),
            thumbnail,
            componentsData: JSON.stringify({
              node,
              html,
              css,
              host,
              exportedAt: new Date().toISOString()
            })
          };
          const newHistory = [newItem, ...hist].slice(0, 50);
          chrome.storage.local.set({ history: newHistory }, () => {
            setHistory(newHistory);
            setActive(false);
            setIsCollapsed(false); // Auto expand to show history card!
            showToast('组件提取成功！已保存至历史记录');
          });
        }).catch((err) => {
          console.error('Error saving history item:', err);
          showToast('提取失败，保存数据出错');
        });
      },
      () => {
        // Cancel handler: stop picking and expand panel back
        setActive(false);
        setIsCollapsed(false);
      }
    );
  }, []);

  const loadHistory = () => {
    getHistory().then(setHistory);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  const triggerCopyFeedback = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1500);
  };

  const handleLocatorClick = (e: React.MouseEvent) => {
    if (clickPreventRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setIsCollapsed(false);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const container = document.getElementById('pm-picker-floating-root')
      ?.shadowRoot?.getElementById('pm-picker-floating-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    
    dragStartRef.current = {
      startX: rect.left,
      startY: rect.top,
      mouseX: e.clientX,
      mouseY: e.clientY
    };

    setIsDragging(true);
    clickPreventRef.current = false;

    e.preventDefault();
    e.stopPropagation();
  };

  const handleClosePanel = () => {
    if (active) {
      stopPicker();
      setActive(false);
    }
    const container = document.getElementById('pm-picker-floating-root')
      ?.shadowRoot?.getElementById('pm-picker-floating-container');
    if (container) {
      container.style.display = 'none';
    }
  };

  const handleTogglePicker = () => {
    const nextState = !active;
    if (nextState) {
      startPicker();
      setActive(true);
      setIsCollapsed(true); // Automatically collapse into bubble to prevent blocking elements
    } else {
      stopPicker();
      setActive(false);
    }
  };

  const handleExtractWholePage = async () => {
    setErrorMsg(null);
    try {
      await extractWholePage();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, using fallback:', err);
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      return false;
    }
  };

  const handleCopyHTML = (item: HistoryItem) => {
    try {
      const data = JSON.parse(item.componentsData);
      copyToClipboard(data.html || '').then((success) => {
        if (success) {
          triggerCopyFeedback(`${item.id}_html`);
          showToast('HTML已复制到剪贴板！');
        } else {
          showToast('复制失败，请重试');
        }
      });
    } catch (e) {
      showToast('复制失败，数据已损坏');
    }
  };

  const handleCopyCSS = (item: HistoryItem) => {
    try {
      const data = JSON.parse(item.componentsData);
      copyToClipboard(data.css || '').then((success) => {
        if (success) {
          triggerCopyFeedback(`${item.id}_css`);
          showToast('CSS已复制到剪贴板！');
        } else {
          showToast('复制失败，请重试');
        }
      });
    } catch (e) {
      showToast('复制失败，数据已损坏');
    }
  };

  const handleCopyXPath = (item: HistoryItem) => {
    try {
      const data = JSON.parse(item.componentsData);
      const xpath = data.node?.xpath;
      if (!xpath) {
        showToast('复制失败：记录中无 XPath 信息，请重新提取！');
        return;
      }
      copyToClipboard(xpath).then((success) => {
        if (success) {
          triggerCopyFeedback(`${item.id}_xpath`);
          showToast('XPath已复制到剪贴板！');
        } else {
          showToast('复制失败，请重试');
        }
      });
    } catch (e) {
      showToast('复制失败，数据已损坏');
    }
  };

  const handleDownloadJSON = (item: HistoryItem) => {
    try {
      const data = JSON.parse(item.componentsData);
      const jsonString = JSON.stringify(data.node, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/\s+/g, '_')}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerCopyFeedback(`${item.id}_json`);
      showToast('JSON下载完成');
    } catch (e) {
      showToast('下载失败');
    }
  };

  const handleModalCopy = (text: string, key: string, successMsg: string) => {
    copyToClipboard(text).then((success) => {
      if (success) {
        triggerCopyFeedback(key);
        showToast(successMsg);
      } else {
        showToast('复制失败');
      }
    });
  };

  const handleDeleteItem = async (id: string) => {
    const updated = await deleteHistoryItem(id);
    setHistory(updated);
    showToast('已删除记录');
  };

  const handleClearAll = async () => {
    if (window.confirm('确定要清除所有拾取历史吗？')) {
      await clearHistory();
      setHistory([]);
      showToast('历史记录已清空');
    }
  };

  // Render Collapsed Locator Widget
  if (isCollapsed) {
    return (
      <div 
        className={`collapsed-locator-panel ${active ? 'picking' : ''}`}
        onMouseDown={handleDragStart}
        onClick={handleLocatorClick}
        title="PM原型拾取器 - 按住拖动，点击展开"
      >
        <span className={`status-dot ${active ? 'active' : ''}`}></span>
        <MousePointerClick size={12} className="locator-icon" />
        <span className="locator-text">{active ? '拾取中...' : '原型拾取器'}</span>
      </div>
    );
  }

  // Render Expanded Full Control Panel
  return (
    <div className="widget-layout-wrapper">
      {/* Brand Header */}
      <div className="header">
        <div className="brand" style={{ display: 'flex', alignItems: 'center' }}>
          <button 
            className="ctrl-action-btn drag-handle-btn" 
            onMouseDown={handleDragStart} 
            title="按住拖动面板"
            style={{ cursor: 'move', marginRight: '6px' }}
          >
            <GripHorizontal size={10} />
          </button>
          <div className="brand-icon">
            <MousePointerClick size={16} />
          </div>
          <span className="brand-title">PM Prototype</span>
        </div>
        
        {/* Window controls */}
        <div className="widget-controls">
          <button className="ctrl-action-btn" onClick={() => setIsCollapsed(true)} title="折叠为小球">
            —
          </button>
          <button className="ctrl-action-btn close-btn" onClick={handleClosePanel} title="关闭面板">
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Main Switchers */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={handleTogglePicker}
          disabled={!!errorMsg && !active}
          className={`picker-btn ${active ? 'stop' : 'start'}`}
          style={{ flex: 1, marginBottom: 0 }}
        >
          <MousePointerClick size={14} />
          {active ? '停止拾取' : '自由拾取'}
        </button>
        <button
          onClick={handleExtractWholePage}
          disabled={!!errorMsg || active}
          className="picker-btn page-btn"
          style={{ flex: 1, marginBottom: 0 }}
        >
          <Layers size={14} />
          抓取整页
        </button>
      </div>

      {/* Shortcut instructions */}
      <div className="shortcut-tip">
        <span>快捷键:</span>
        <span className="kbd">Ctrl</span>
        <span>+</span>
        <span className="kbd">Shift</span>
        <span>+</span>
        <span className="kbd">E</span>
        <span style={{ marginLeft: '4px' }}>面板唤醒</span>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div className="glass-panel error-panel" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <Check size={12} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: '10.5px', color: '#fca5a5', lineHeight: 1.3 }}>{errorMsg}</span>
        </div>
      )}

      {/* History panel */}
      <div className="glass-panel" style={{ flexGrow: 1, marginBottom: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="history-header">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <History size={12} />
            <span>历史记录 ({history.length})</span>
          </div>
          {history.length > 0 && (
            <button onClick={handleClearAll} className="clear-btn">
              清空
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <History size={24} className="empty-icon" />
            <span>暂无拾取记录</span>
            <span style={{ fontSize: '9.5px', opacity: 0.5 }}>开启拾取模式或点击整页抓取进行提取</span>
          </div>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-card" onClick={() => setSelectedItem(item)}>
                <div className="card-thumb">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.title} />
                  ) : (
                    <div className="card-thumb-placeholder">
                      {item.title.split('-').pop()?.trim().substring(0, 3) || 'DOM'}
                    </div>
                  )}
                </div>
                <div className="card-info">
                  <div className="card-title" title={item.title}>
                    {item.title}
                  </div>
                  <div className="card-meta">
                    <span className="meta-item">
                      <Globe size={9} />
                      {item.url ? new URL(item.url).hostname : 'Local'}
                    </span>
                    <span className="meta-item">
                      <Layers size={9} />
                      {item.componentCount} 节点
                    </span>
                    <span className="meta-item" title={`捕获时间: ${new Date(item.timestamp).toLocaleString()}`}>
                      <Clock size={9} />
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button 
                      className={`action-icon-btn ${copiedKey === `${item.id}_html` ? 'copied' : ''}`} 
                      onClick={() => handleCopyHTML(item)}
                    >
                      {copiedKey === `${item.id}_html` ? <Check size={8} /> : null}
                      {copiedKey === `${item.id}_html` ? '已复制' : 'HTML'}
                    </button>
                    <button 
                      className={`action-icon-btn ${copiedKey === `${item.id}_css` ? 'copied' : ''}`} 
                      onClick={() => handleCopyCSS(item)}
                    >
                      {copiedKey === `${item.id}_css` ? <Check size={8} /> : null}
                      {copiedKey === `${item.id}_css` ? '已复制' : 'CSS'}
                    </button>
                    <button 
                      className={`action-icon-btn ${copiedKey === `${item.id}_xpath` ? 'copied' : ''}`} 
                      onClick={() => handleCopyXPath(item)}
                    >
                      {copiedKey === `${item.id}_xpath` ? <Check size={8} /> : null}
                      {copiedKey === `${item.id}_xpath` ? '已复制' : 'XPath'}
                    </button>
                    <button 
                      className={`action-icon-btn ${copiedKey === `${item.id}_json` ? 'copied' : ''}`} 
                      onClick={() => handleDownloadJSON(item)}
                    >
                      {copiedKey === `${item.id}_json` ? <Check size={8} /> : null}
                      {copiedKey === `${item.id}_json` ? '已下载' : 'JSON'}
                    </button>
                    <button className="action-icon-btn delete" onClick={() => handleDeleteItem(item.id)}>
                      <Trash2 size={8} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Component Sandbox Preview Modal (rendered at the Shadow DOM root via portal to cover the entire screen) */}
      {selectedItem && (() => {
        let data: any = {};
        try {
          data = JSON.parse(selectedItem.componentsData);
        } catch (e) {
          console.error('Error parsing component data:', e);
        }
        
        const shadowRoot = document.getElementById('pm-picker-floating-root')?.shadowRoot;
        if (!shadowRoot) return null;

        const capturedTimeStr = new Date(selectedItem.timestamp).toLocaleString();
        
        return createPortal(
          <div className="modal-overlay" onClick={() => setSelectedItem(null)} onMouseDown={(e) => e.stopPropagation()}>
            <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title" title={selectedItem.title}>{selectedItem.title}</span>
                <button className="modal-close-btn" onClick={() => setSelectedItem(null)}>×</button>
              </div>

              {/* Sandbox iframe render */}
              <div className="iframe-container">
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <meta charset="UTF-8">
                        <style>
                          body {
                            margin: 0;
                            padding: 24px;
                            background: transparent;
                            color: #f8fafc;
                            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            box-sizing: border-box;
                            user-select: text !important;
                            -webkit-user-select: text !important;
                          }
                          /* Sleek custom scrollbars for iframe */
                          ::-webkit-scrollbar {
                            width: 6px;
                            height: 6px;
                          }
                          ::-webkit-scrollbar-track {
                            background: transparent;
                          }
                          ::-webkit-scrollbar-thumb {
                            background: rgba(99, 102, 241, 0.25);
                            border-radius: 3px;
                          }
                          ::-webkit-scrollbar-thumb:hover {
                            background: rgba(99, 102, 241, 0.45);
                          }
                          ${data.css || ''}
                        </style>
                      </head>
                      <body>
                        ${data.html || ''}
                      </body>
                    </html>
                  `}
                  title="Component Sandbox Preview"
                  className="preview-iframe"
                  sandbox="allow-scripts"
                />
              </div>

              {/* Specs & info grid */}
              <div className="modal-info-panel">
                <div className="info-row">
                  <span className="info-label">元素 XPath 定位器</span>
                  <div className="xpath-copy-box">
                    <input
                      type="text"
                      readOnly
                      value={data.node?.xpath || ''}
                      className="xpath-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      className={`modal-xpath-copy-btn ${copiedKey === `${selectedItem.id}_xpath_modal` ? 'copied' : ''}`}
                      onClick={() => handleModalCopy(data.node?.xpath || '', `${selectedItem.id}_xpath_modal`, 'XPath已复制！')}
                    >
                      {copiedKey === `${selectedItem.id}_xpath_modal` ? <Check size={10} /> : null}
                      {copiedKey === `${selectedItem.id}_xpath_modal` ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>

                <div className="specs-grid">
                  {data.node?.bounds && (() => {
                    const b = data.node.bounds;
                    const w = Math.round(b.width);
                    const h = Math.round(b.height);
                    const x = Math.round(b.x);
                    const y = Math.round(b.y);
                    const cx = Math.round(x + w / 2);
                    const cy = Math.round(y + h / 2);

                    return (
                      <div className="spec-card" style={{ gridColumn: 'span 3', padding: '12px 14px' }}>
                        <div className="info-label" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>元素多点定位坐标与尺寸大小</span>
                          <span style={{ color: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace', textTransform: 'none', fontSize: '9.5px' }}>
                            尺寸: {w}px × {h}px
                          </span>
                        </div>
                        
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1.2fr 1fr',
                          gridTemplateRows: 'auto auto auto',
                          gap: '8px 10px',
                          position: 'relative',
                          padding: '10px 6px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.02)'
                        }}>
                          {/* Dashed visual bounding box */}
                          <div style={{
                            gridColumn: '1 / 4',
                            gridRow: '1 / 4',
                            border: '1.2px dashed rgba(99, 102, 241, 0.25)',
                            borderRadius: '6px',
                            margin: '6px 12px',
                            pointerEvents: 'none',
                            zIndex: 1
                          }} />

                          {/* Top Left */}
                          <div style={{ gridColumn: '1', gridRow: '1', textAlign: 'left', zIndex: 2 }}>
                            <div style={{ fontSize: '8.5px', color: '#94a3b8', fontWeight: 600 }}>左上 (TL)</div>
                            <div style={{ fontSize: '10.5px', color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {x}, {y}
                            </div>
                          </div>

                          {/* Top Right */}
                          <div style={{ gridColumn: '3', gridRow: '1', textAlign: 'right', zIndex: 2 }}>
                            <div style={{ fontSize: '8.5px', color: '#94a3b8', fontWeight: 600 }}>右上 (TR)</div>
                            <div style={{ fontSize: '10.5px', color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {x + w}, {y}
                            </div>
                          </div>

                          {/* Center */}
                          <div style={{ gridColumn: '2', gridRow: '2', textAlign: 'center', zIndex: 2 }}>
                            <div style={{ fontSize: '8.5px', color: '#818cf8', fontWeight: 700 }}>居中 (Center)</div>
                            <div style={{ fontSize: '11px', color: '#c7d2fe', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {cx}, {cy}
                            </div>
                          </div>

                          {/* Bottom Left */}
                          <div style={{ gridColumn: '1', gridRow: '3', textAlign: 'left', zIndex: 2 }}>
                            <div style={{ fontSize: '8.5px', color: '#94a3b8', fontWeight: 600 }}>左下 (BL)</div>
                            <div style={{ fontSize: '10.5px', color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {x}, {y + h}
                            </div>
                          </div>

                          {/* Bottom Right */}
                          <div style={{ gridColumn: '3', gridRow: '3', textAlign: 'right', zIndex: 2 }}>
                            <div style={{ fontSize: '8.5px', color: '#94a3b8', fontWeight: 600 }}>右下 (BR)</div>
                            <div style={{ fontSize: '10.5px', color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                              {x + w}, {y + h}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="spec-card">
                    <span className="info-label">子级节点 (Nodes)</span>
                    <span className="info-val">{selectedItem.componentCount} 个元素</span>
                  </div>
                  <div className="spec-card" style={{ gridColumn: 'span 2' }}>
                    <span className="info-label">捕获时间 (Captured At)</span>
                    <span className="info-val" style={{ fontSize: '12px' }}>{capturedTimeStr}</span>
                  </div>
                </div>

                <div className="spec-card url-card">
                  <span className="info-label">源网页地址 (Source URL)</span>
                  <a 
                    href={selectedItem.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="info-val link-val"
                  >
                    <Globe size={10} />
                    <span>{selectedItem.url}</span>
                  </a>
                </div>
              </div>

              {/* Modal footer actions */}
              <div className="modal-footer">
                <button
                  className={`footer-action-btn ${copiedKey === `${selectedItem.id}_html_modal` ? 'copied' : ''}`}
                  onClick={() => handleModalCopy(data.html || '', `${selectedItem.id}_html_modal`, 'HTML已复制到剪贴板！')}
                >
                  {copiedKey === `${selectedItem.id}_html_modal` ? <Check size={11} /> : null}
                  复制 HTML
                </button>
                <button
                  className={`footer-action-btn ${copiedKey === `${selectedItem.id}_css_modal` ? 'copied' : ''}`}
                  onClick={() => handleModalCopy(data.css || '', `${selectedItem.id}_css_modal`, 'CSS已复制到剪贴板！')}
                >
                  {copiedKey === `${selectedItem.id}_css_modal` ? <Check size={11} /> : null}
                  复制 CSS
                </button>
              </div>
            </div>
          </div>,
          shadowRoot
        );
      })()}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={13} />
            <span>{toastMsg}</span>
          </div>
          <button className="toast-close" onClick={() => setToastMsg(null)}>×</button>
        </div>
      )}

      {isDragging && createPortal(
        <div className="drag-mask" onMouseDown={(e) => e.stopPropagation()} />,
        document.getElementById('pm-picker-floating-root')!.shadowRoot!
      )}
    </div>
  );
}
