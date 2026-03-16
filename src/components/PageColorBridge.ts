/**
 * PageColorBridge
 *
 * Roam injects dynamic `<style>` tags for user-configured page colors
 * and theme rules (aliases, block refs, inline code). Their selectors
 * may be scoped under a parent container (e.g.
 * `.roam-body-main .rm-page-ref[data-link-title="X"] .rm-page-ref--link`
 * or `.roam-body-main .rm-alias`) which means our dialog portal —
 * mounted outside `.roam-body-main` — never matches them.
 *
 * This module scans all stylesheets for rules targeting page-ref colors,
 * alias links, block references, and inline code, then re-injects them
 * in an unscoped `<style>` element so they apply everywhere in the DOM
 * including our overlay.
 */

const PAGE_COLOR_BRIDGE_STYLE_ID = "gtd-page-color-bridge";
let pendingBridgeSyncId: number | null = null;

/**
 * Selector patterns for rules we want to bridge into the dialog portal.
 * Each regex matches a CSS selector fragment worth capturing.
 */
const BRIDGE_SELECTOR_PATTERNS: Array<RegExp> = [
  /\.rm-page-ref\[data-link-title[^\]]*\]/, // page colors
  /\.rm-alias/, // alias styles (page, block, external variants)
  /\.rm-block-ref/, // block ref styles
  /\bcode\b/, // inline code styles
];

function isBridgeableRule(selectorText: string): boolean {
  return BRIDGE_SELECTOR_PATTERNS.some((pattern) => pattern.test(selectorText));
}

/**
 * Extract the core selector from a potentially scoped selector.
 *
 * For page-ref rules:
 *   `.roam-body-main .rm-page-ref[data-link-title="Foo"] .rm-page-ref--link`
 *   → `.rm-page-ref[data-link-title="Foo"] .rm-page-ref--link`
 *
 * For theme rules scoped under `.roam-body-main`:
 *   `.roam-body-main .rm-alias` → `.rm-alias`
 *   `.roam-body-main code` → `code`
 *
 * Returns null for selectors that are already unscoped (caller uses original).
 */
function extractUnscopedSelector(selector: string): string | null {
  // For page-ref data-link-title rules, strip everything before .rm-page-ref
  const pageRefIdx = selector.indexOf(".rm-page-ref[data-link-title");
  if (pageRefIdx > 0) {
    return selector.slice(pageRefIdx).trim();
  }
  // For rules scoped under .roam-body-main, strip that prefix
  const bodyMainIdx = selector.indexOf(".roam-body-main");
  if (bodyMainIdx >= 0) {
    const afterBodyMain = selector.slice(bodyMainIdx + ".roam-body-main".length).trim();
    return afterBodyMain || null;
  }
  // Already unscoped
  return null;
}

/**
 * Walk all stylesheets and collect bridgeable rules (page colors, aliases,
 * block refs, inline code).
 * Returns a Map from unscoped selector → cssText of the declarations.
 */
function collectBridgeableRules(): Map<string, string> {
  const result = new Map<string, string>();

  for (const sheet of document.styleSheets) {
    const ownerNode = (sheet as StyleSheet & { ownerNode?: Node | null }).ownerNode;
    const ownerElement =
      ownerNode && ownerNode.nodeType === Node.ELEMENT_NODE ? (ownerNode as Element) : null;
    if (ownerElement?.id === PAGE_COLOR_BRIDGE_STYLE_ID) {
      continue;
    }

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin sheets throw SecurityError — skip them.
      continue;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as CSSRule & { selectorText?: string; style?: CSSStyleDeclaration };
      if (typeof rule.selectorText !== "string" || rule.style == null) {
        continue;
      }
      if (!isBridgeableRule(rule.selectorText)) {
        continue;
      }
      if (rule.style.length === 0) {
        continue;
      }

      // A selector list may contain multiple comma-separated selectors.
      // Process each one independently.
      const parts = rule.selectorText.split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (!isBridgeableRule(trimmed)) {
          continue;
        }
        // Unscope if needed, or use as-is if already unscoped
        const unscoped = extractUnscopedSelector(trimmed) ?? trimmed;
        // Collect ALL declarations (not just color)
        const declarations: Array<string> = [];
        for (let j = 0; j < rule.style.length; j++) {
          const prop = rule.style[j];
          const value = rule.style.getPropertyValue(prop);
          const priority = rule.style.getPropertyPriority(prop);
          declarations.push(`${prop}: ${value}${priority ? " !" + priority : ""};`);
        }
        if (declarations.length > 0) {
          // Later rules override earlier ones for the same selector —
          // append to preserve cascade order
          const existing = result.get(unscoped);
          if (existing) {
            result.set(unscoped, existing + " " + declarations.join(" "));
          } else {
            result.set(unscoped, declarations.join(" "));
          }
        }
      }
    }
  }

  return result;
}

function buildStyleContent(rules: Map<string, string>): string {
  const lines: Array<string> = [];
  for (const [selector, declarations] of rules) {
    lines.push(`${selector} { ${declarations} }`);
  }
  return lines.join("\n");
}

/**
 * Scan Roam's stylesheets for bridgeable rules and mirror them in an
 * unscoped `<style>` element. Safe to call multiple times — it replaces
 * the previous bridge content.
 */
function applyPageColorBridge(): void {
  const rules = collectBridgeableRules();

  let styleEl = document.getElementById(PAGE_COLOR_BRIDGE_STYLE_ID) as HTMLStyleElement | null;
  if (rules.size === 0) {
    // No bridgeable rules found — remove bridge if it exists.
    styleEl?.remove();
    return;
  }

  const content = buildStyleContent(rules);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = PAGE_COLOR_BRIDGE_STYLE_ID;
    document.head.append(styleEl);
  }
  styleEl.textContent = content;
}

export function syncPageColorBridge(): void {
  if (pendingBridgeSyncId !== null) {
    return;
  }
  pendingBridgeSyncId = window.requestAnimationFrame(() => {
    pendingBridgeSyncId = null;
    applyPageColorBridge();
  });
}

/**
 * Remove the bridge style element. Called on extension unload.
 */
export function removePageColorBridge(): void {
  if (pendingBridgeSyncId !== null) {
    window.cancelAnimationFrame(pendingBridgeSyncId);
    pendingBridgeSyncId = null;
  }
  document.getElementById(PAGE_COLOR_BRIDGE_STYLE_ID)?.remove();
}
