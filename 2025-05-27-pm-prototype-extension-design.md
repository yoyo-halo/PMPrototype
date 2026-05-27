# PM原型拾取器 — 浏览器扩展设计文档

> 版本：v1.0 | 日期：2025-05-27 | 状态：设计确认

---

## 一、项目概述

### 1.1 产品定位

一个浏览器扩展插件（Chrome/Edge），用于从任意网页提取UI设计信息，支持结构化JSON和HTML/CSS双模式导出，便于导入Axure、Sketch、墨刀、Figma等原型工具。

### 1.2 核心价值

- **打通网页→原型工具链路**：一键提取、一键导入
- **智能组件识别**：DOM结构+视觉聚类双引擎，自动识别UI组件边界
- **双模式输出**：JSON适合程序化处理，HTML/CSS适合直接粘贴使用
- **可扩展架构**：预留原生格式导出（.fig/.rp）接入点

### 1.3 分发方式

- 团队内部侧载使用（初期）
- GitHub开源发布
- 上架Chrome Web Store / Edge Add-ons

---

## 二、整体架构

```
┌─────────────────────────────────────────────────┐
│             Browser Extension (Manifest V3)       │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   Popup Panel     │  │    Content Script     │  │
│  │   (React)         │  │    (纯TypeScript)     │  │
│  │                   │  │                       │  │
│  │  · 导出格式选择    │  │  · 元素选择器引擎      │  │
│  │  · 智能识别开关    │  │  · 视觉聚类分析       │  │
│  │  · 快捷键配置      │  │  · DOM/样式提取器     │  │
│  │  · 历史记录        │  │  · 高亮/标注渲染层    │  │
│  │  · 预览面板        │  │  · 截图模块          │  │
│  └──────────────────┘  └──────────────────────┘  │
│              │                    │               │
│              └────────┬───────────┘               │
│                       ▼                           │
│  ┌──────────────────────────────────────────────┐ │
│  │       Background Service Worker               │ │
│  │  · 消息路由中枢                                │ │
│  │  · 导出任务调度                                │ │
│  │  · 存储管理（用户偏好/历史记录/缓存）           │ │
│  └──────────────────────────────────────────────┘ │
│                       │                           │
│                       ▼                           │
│  ┌──────────────────────────────────────────────┐ │
│  │            Exporter Pipeline                  │ │
│  │  ┌───────────┐ ┌───────────┐ ┌────────────┐  │ │
│  │  │   JSON    │ │ HTML/CSS  │ │  Native    │  │ │
│  │  │  Exporter │ │  Exporter │ │  Exporter  │  │ │
│  │  │           │ │           │ │  (预留)     │  │ │
│  │  └───────────┘ └───────────┘ └────────────┘  │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 2.1 技术栈

| 层 | 技术选型 | 说明 |
|---|---|---|
| 构建工具 | Vite + @crxjs/vite-plugin | Chrome扩展热更新开发 |
| Popup UI | React 18 + TypeScript | 设置面板/历史记录 |
| 状态管理 | Zustand | 轻量，适合扩展场景 |
| 样式 | CSS Modules + clsx | 无运行时开销 |
| Content Script | 纯TypeScript | 最小化页面侵入 |
| 截图 | dom-to-image | 元素级截图 |
| CSS解析 | css-tree | 提取/优化关键样式 |
| 存储 | chrome.storage + IndexedDB | 偏好设置+历史缓存 |

### 2.2 构建产物

```
dist/
├── manifest.json
├── popup/
│   └── index.html
├── content/
│   └── content-script.js
├── background/
│   └── service-worker.js
└── assets/
    ├── icons/
    └── styles/
```

---

## 三、模块设计

### 3.1 元素选择器引擎 (Selector Engine)

**交互流程**：

```
用户点击工具栏图标 → 激活选择模式 → hover高亮元素
    → 点击选中 → 智能分组建议（可选）
    → 确认/调整选择范围 → 提取
```

**状态机**：

```
IDLE → ACTIVE（选择模式）
     → SELECTED（已选中）
     → GROUPING（智能分组）
     → EXPORT（导出中）
     → IDLE
```

**页面内覆盖层**：

- Hover状态：浅蓝半透明遮罩 + 白色虚线边框
- 选中状态：蓝色实线边框 + 顶部浮动标签（组件名 + 尺寸）
- 工具栏浮层：[完成选择] [全选同层] [展开父级] [取消]

### 3.2 智能分组引擎 (Smart Grouper)

**算法策略**（混合D策略）：

```
阶段1: DOM结构分析
    ├── 向上查找语义化标签 (nav/header/main/form/section)
    ├── 匹配常见组件类名模式 (container/card/panel/modal/wrapper)
    └── 分析aria-role/role属性

阶段2: 视觉聚类
    ├── 计算兄弟元素间距 (< 20px视为相邻)
    ├── 样式相似度比较 (> 0.7视为同类)
    └── 布局类型推断 (grid/flex/absolute)

阶段3: 结果排序
    └── 按置信度排序，优先推荐高置信度分组
```

**可配置参数**：

| 参数 | 默认值 | 说明 |
|---|---|---|
| maxDepth | 3 | DOM向上追溯层级 |
| positionThreshold | 20px | 相邻判定阈值 |
| styleSimilarityThreshold | 0.8 | 样式相似度阈值 |
| enableSemanticTag | true | 语义标签优先 |
| enableVisualCluster | false | 视觉边界辅助（默认关闭，可开） |

### 3.3 样式提取器 (Style Extractor)

**提取策略**：

1. **关键属性优先**：只提取 `display`、`position`、`flex`、`grid`、`width`、`height`、`margin`、`padding`、`border`、`background`、`color`、`font` 等布局/视觉相关属性
2. **差异化提取**：仅保留与浏览器默认样式不同的属性值
3. **外部样式内联**：解析相关样式表，匹配选中的元素规则，合并为内联样式
4. **伪类/伪元素**：记录但不展开到内联中，在导出描述中标注

### 3.4 导出管道 (Export Pipeline)

**导出接口定义**：

```typescript
interface ExportPipeline {
  exportJSON(components: ComponentNode[], options?: JSONExportOptions): Blob;
  exportHTML(components: ComponentNode[], options?: HTMLExportOptions): {html: string; css: string};
  exportScreenshot(components: ComponentNode[]): Promise<Blob>;
  exportToNative?(components: ComponentNode[], format: 'figma' | 'axure' | 'sketch'): Promise<Blob>; // 预留
}
```

**JSON输出结构**：

```json
{
  "version": "1.0",
  "metadata": {
    "exportedAt": "2025-05-27T14:20:00Z",
    "url": "https://example.com/page",
    "title": "Example Page",
    "viewport": {"width": 1920, "height": 1080}
  },
  "components": [
    {
      "id": "comp_001",
      "type": "navigation",
      "label": "Main Navigation",
      "tagName": "nav",
      "className": "main-nav",
      "bounds": {"x": 0, "y": 0, "width": 1920, "height": 60},
      "computedStyles": {
        "display": "flex",
        "justifyContent": "space-between",
        "backgroundColor": "#ffffff",
        "boxShadow": "0 2px 4px rgba(0,0,0,0.1)"
      },
      "html": "<nav class=\"main-nav\">...</nav>",
      "criticalCSS": ".main-nav { display: flex; ... }",
      "screenshot": "data:image/png;base64,...",
      "children": [...]
    }
  ]
}
```

### 3.5 快捷键系统

| 快捷键 | 功能 | 说明 |
|---|---|---|
| `Ctrl+Shift+E` | 激活/取消插件 | 切换选择模式 |
| `Ctrl+Shift+S` | 智能选择 | 自动选择当前hover区域的组件 |
| `Ctrl+Shift+X` | 导出 | 导出当前选中组件 |
| `Ctrl+Shift+C` | 复制到剪贴板 | 复制HTML/CSS到剪贴板 |
| `Esc` | 取消/退出 | 退出选择模式，回到IDLE |

### 3.6 存储设计

```
chrome.storage.sync:
  ├── preferences (用户偏好)
  │   ├── defaultExportFormat: 'json' | 'html'
  │   ├── smartGroupEnabled: boolean
  │   └── shortcuts: Record<string, string>

chrome.storage.local:
  └── history (最多50条)
      └── [{id, url, title, componentCount, timestamp, thumbnail}]

IndexedDB:
  └── componentCache (已提取组件的样式/截图缓存，支持离线访问)
```

---

## 四、导出格式规范

### 4.1 JSON Schema

```typescript
interface PageExport {
  version: string;
  metadata: {
    exportedAt: string;   // ISO 8601
    url: string;
    title: string;
    viewport: {width: number; height: number};
  };
  components: ComponentNode[];
}

interface ComponentNode {
  id: string;
  type?: string;          // 智能识别的组件类型
  label?: string;         // 用户自定义/自动生成的标签
  tagName: string;
  className: string;
  bounds: {x: number; y: number; width: number; height: number};
  computedStyles: Record<string, string>;
  html: string;
  criticalCSS: string;
  screenshot?: string;    // base64
  children: ComponentNode[];
  aria?: Record<string, string>;
}
```

### 4.2 HTML/CSS 输出

HTML片段 + 内联关键样式 + 独立的 `<style>` 块，可直接粘贴到原型工具的HTML组件中。

---

## 五、开发阶段划分

### Phase 1：核心验证（MVP）

- [ ] 项目初始化（Vite + CRXJS + TypeScript）
- [ ] Content Script 选择器引擎（hover高亮 + 点击选中）
- [ ] 基础JSON导出
- [ ] Popup面板基础UI

### Phase 2：智能识别

- [ ] DOM结构分析引擎
- [ ] 视觉聚类算法
- [ ] 智能分组UI交互（推荐/确认/调整）
- [ ] HTML/CSS导出

### Phase 3：体验完善

- [ ] 快捷键系统
- [ ] 截图模块
- [ ] 历史记录
- [ ] 复制到剪贴板
- [ ] 自定义配置持久化

### Phase 4：扩展能力

- [ ] 原生格式导出（.fig / .rp）
- [ ] 批量导出
- [ ] 组件库收藏管理
- [ ] 上架商店

---

## 六、非功能需求

### 6.1 性能

- Content Script注入 < 50ms
- Hover高亮响应 < 16ms（60fps）
- 中等页面（<500元素）提取 < 1s

### 6.2 兼容性

- Chrome 110+
- Edge 110+
- Manifest V3

### 6.3 安全

- 不请求远程服务器（MVP阶段）
- 不收集用户数据
- 最小化权限申请（activeTab、storage、clipboardWrite）

---

## 七、待定事项

1. 原生格式导出（.fig/.rp）的技术方案需进一步调研各平台SDK/API
2. 机器学习模型的引入时机和方案
3. 是否需要团队协作功能（导出分享链接）