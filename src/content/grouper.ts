/**
 * Smart Grouper Engine
 * Implements heuristics to group elements and suggest structural hierarchy
 */

export interface GroupConfig {
  maxDepth: number;
  enableSemanticTag: boolean;
}

/**
 * Searches upward through the DOM to find elements that act as semantic or structural containers.
 */
export function findParentContainers(
  element: HTMLElement,
  config: GroupConfig = { maxDepth: 4, enableSemanticTag: true }
): HTMLElement[] {
  const containers: HTMLElement[] = [];
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;

  const semanticTags = ['NAV', 'HEADER', 'FOOTER', 'MAIN', 'SECTION', 'ARTICLE', 'FORM', 'ASIDE', 'DETAILS'];
  const containerKeywords = [
    'container', 'wrapper', 'card', 'panel', 'modal', 'dialog', 'header', 
    'footer', 'sidebar', 'content', 'main', 'menu', 'nav', 'list', 'grid', 'row',
    'box', 'banner', 'tab', 'item', 'group', 'btn-group', 'button-group', 'section',
    'navbar', 'widget', 'inner', 'outer', 'page', 'block', 'tile'
  ];

  while (current && depth < config.maxDepth && current.tagName !== 'HTML') {
    let isContainer = false;

    // 1. Check semantic tag
    if (config.enableSemanticTag && semanticTags.includes(current.tagName)) {
      isContainer = true;
    }

    // 2. Check role attribute
    const role = current.getAttribute('role');
    if (role && ['navigation', 'banner', 'main', 'form', 'contentinfo', 'dialog', 'grid', 'list', 'tabpanel', 'group'].includes(role)) {
      isContainer = true;
    }

    // 3. Check class names
    if (current.className && typeof current.className === 'string') {
      const lowerClass = current.className.toLowerCase();
      if (containerKeywords.some(keyword => lowerClass.includes(keyword))) {
        isContainer = true;
      }
    }

    if (isContainer) {
      containers.push(current);
    }

    current = current.parentElement;
    depth++;
  }

  // Fallback: If no containers found, just add the immediate parent if valid
  if (containers.length === 0 && element.parentElement && element.parentElement.tagName !== 'HTML') {
    containers.push(element.parentElement);
  }

  // Ensure document.body is always the ultimate parent choice
  if (element !== document.body && !containers.includes(document.body)) {
    containers.push(document.body);
  }

  return containers;
}

/**
 * Finds sibling elements of the same tag name and similar classes.
 * Useful for selecting "all items in list" or "all cards in a row".
 */
export function findSimilarSiblings(element: HTMLElement): HTMLElement[] {
  const parent = element.parentElement;
  if (!parent) return [];

  const siblings = Array.from(parent.children) as HTMLElement[];
  const targetTag = element.tagName;
  const targetClasses = Array.from(element.classList);

  return siblings.filter(sibling => {
    // Keep it, but we can filter target itself if we want.
    // Let's include the target itself or exclude it based on context.
    // Usually, "Select Siblings" selects other elements, so we exclude target here.
    if (sibling === element) return false;
    if (sibling.tagName !== targetTag) return false;

    // If both have no classes and same tag, they are similar
    if (targetClasses.length === 0 && sibling.classList.length === 0) {
      return true;
    }

    const siblingClasses = Array.from(sibling.classList);
    const intersection = targetClasses.filter(c => siblingClasses.includes(c));

    // Similarity threshold: they should share at least one class, or have high class overlap
    return intersection.length > 0;
  });
}
