/**
 * Style Extractor Engine
 * Extracts DOM node structure and critical visual/layout styles.
 */

export interface ComponentNode {
  id: string;
  tagName: string;
  className: string;
  bounds: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  html: string;
  criticalCSS: string;
  xpath: string;
  text?: string;
  children: ComponentNode[];
}

const CRITICAL_PROPERTIES = [
  'display', 'position', 'top', 'left', 'right', 'bottom', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'box-sizing', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'flex-grow', 'flex-shrink', 'flex-basis',
  'grid-template-columns', 'grid-template-rows', 'gap',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-right-width', 'border-right-style', 'border-right-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
  'border-left-width', 'border-left-style', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
  'box-shadow', 'opacity', 'overflow-x', 'overflow-y'
];

const defaultStylesCache: Record<string, Record<string, string>> = {};

/**
 * Gets default browser styles for a given HTML tag.
 * Caches results to optimize subsequent extractions.
 */
function getDefaultStyles(tagName: string): Record<string, string> {
  const normalizedTag = tagName.toUpperCase();
  if (defaultStylesCache[normalizedTag]) {
    return defaultStylesCache[normalizedTag];
  }

  try {
    const temp = document.createElement(normalizedTag);
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(temp);
    }
    
    const styles = window.getComputedStyle(temp);
    const result: Record<string, string> = {};
    
    for (const prop of CRITICAL_PROPERTIES) {
      result[prop] = styles.getPropertyValue(prop);
    }
    
    if (parent) {
      parent.removeChild(temp);
    }
    defaultStylesCache[normalizedTag] = result;
    return result;
  } catch (e) {
    console.warn('Failed to retrieve default browser styles for tag:', tagName, e);
    return {};
  }
}

function propToCamelCase(prop: string): string {
  return prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function camelCaseToKebab(prop: string): string {
  return prop.replace(/([A-Z])/g, (g) => `-${g[0].toLowerCase()}`);
}

export function getElementXPath(element: HTMLElement): string {
  try {
    if (!element) return '';
    if (element === document.body) {
      return '/html/body';
    }
    if (element === document.documentElement) {
      return '/html';
    }

    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) {
      return '/' + tagName;
    }

    const siblings = Array.from(parent.children);
    const sameTagSiblings = siblings.filter(s => s.tagName.toLowerCase() === tagName);
    
    let xpath = '';
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(element) + 1;
      xpath = getElementXPath(parent) + '/' + tagName + '[' + index + ']';
    } else {
      xpath = getElementXPath(parent) + '/' + tagName;
    }
    console.log('Generated XPath:', xpath, 'for Element:', element);
    return xpath;
  } catch (err) {
    console.error('Error generating XPath:', err);
    return '';
  }
}

/**
 * Recursively extracts elements and styles.
 */
export function extractComponent(element: HTMLElement, isRoot = true): ComponentNode {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const tagName = element.tagName.toLowerCase();
  
  const defaults = getDefaultStyles(tagName);
  const customStyles: Record<string, string> = {};
  const inheritanceProperties = ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'background-color'];
  
  for (const prop of CRITICAL_PROPERTIES) {
    const val = computed.getPropertyValue(prop);
    const defVal = defaults[prop];
    
    // Always extract critical inherited styles for the root node to prevent inheriting wrong values inside the sandbox
    const forceExtract = isRoot && inheritanceProperties.includes(prop);
    
    // Ignore if same as default, or empty, unless forceExtract is true
    if (val !== undefined && val !== null && val !== '' && (forceExtract || val !== defVal)) {
      // Clean up font-family lists
      if (prop === 'font-family') {
        customStyles[propToCamelCase(prop)] = val.split(',')[0].replace(/['"]/g, '');
      } else {
        customStyles[propToCamelCase(prop)] = val;
      }
    }
  }

  // Get direct text if it has no child elements or has text nodes
  let text = '';
  const childNodes = Array.from(element.childNodes);
  if (childNodes.length > 0) {
    const textNodes = childNodes.filter(n => n.nodeType === 3 && n.textContent?.trim());
    if (textNodes.length > 0) {
      text = textNodes.map(n => n.textContent?.trim()).join(' ');
    }
  }

  // If input type is text/button/etc, grab value
  if (element instanceof HTMLInputElement && ['text', 'button', 'submit'].includes(element.type)) {
    text = element.value;
  } else if (element instanceof HTMLTextAreaElement) {
    text = element.value;
  }

  const children: ComponentNode[] = [];
  Array.from(element.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      // Skip helper pick overlays
      if (child.hasAttribute('data-pm-picker-ignore') || child.id === 'pm-picker-overlay-root') {
        return;
      }
      children.push(extractComponent(child, false));
    }
  });

  const id = `comp_${Math.random().toString(36).substring(2, 11)}`;

  let cssRules = '';
  const stylePairs = Object.entries(customStyles)
    .map(([k, v]) => `  ${camelCaseToKebab(k)}: ${v};`)
    .join('\n');
  
  if (stylePairs) {
    cssRules = `.${id} {\n${stylePairs}\n}`;
  }

  const node: ComponentNode = {
    id,
    tagName,
    className: element.className || '',
    bounds: {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    computedStyles: customStyles,
    html: '',
    criticalCSS: cssRules,
    xpath: getElementXPath(element),
    text: text || undefined,
    children
  };

  // Populate node's own html representations
  node.html = generateNodeHTML(node, 'inline');

  return node;
}

/**
 * Generates HTML for a node, either inlining styles or leaving it clean.
 */
export function generateNodeHTML(node: ComponentNode, styleMode: 'inline' | 'clean' | 'class'): string {
  const tag = node.tagName;
  
  let styleAttr = '';
  if (styleMode === 'inline') {
    const styles = Object.entries(node.computedStyles)
      .map(([k, v]) => `${camelCaseToKebab(k)}: ${v}`)
      .join('; ');
    styleAttr = styles ? ` style="${styles}"` : '';
  } else if (styleMode === 'class') {
    styleAttr = ` class="${node.id}${node.className ? ' ' + node.className : ''}"`;
  } else {
    styleAttr = node.className ? ` class="${node.className}"` : '';
  }

  const childrenHtml = node.children.map(child => generateNodeHTML(child, styleMode)).join('\n');
  const content = node.text || childrenHtml;

  // Self closing tags
  const selfClosing = ['img', 'input', 'br', 'hr', 'meta', 'link'];
  if (selfClosing.includes(tag)) {
    let extraAttrs = '';
    if (tag === 'img') extraAttrs = ' src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%23ccc\'/></svg>" alt="placeholder"';
    if (tag === 'input') extraAttrs = ' type="text"';
    return `<${tag}${styleAttr}${extraAttrs} />`;
  }

  return `<${tag}${styleAttr}>${content}</${tag}>`;
}

/**
 * Compiles a tree of ComponentNodes into full HTML & CSS strings.
 */
export function compileHTMLAndCSS(node: ComponentNode, styleMode: 'inline' | 'clean' | 'class'): { html: string; css: string } {
  const html = generateNodeHTML(node, styleMode);
  
  let css = '';
  const collectCSS = (n: ComponentNode) => {
    if (n.criticalCSS) {
      css += n.criticalCSS + '\n\n';
    }
    n.children.forEach(collectCSS);
  };
  collectCSS(node);

  return { html, css };
}
