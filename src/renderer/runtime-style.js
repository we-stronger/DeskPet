(function attachRuntimeStyle(root) {
  function toCssProperty(name) {
    return String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function findStylesheet(documentRef) {
    if (!documentRef) return null;
    let stylesheets;
    try {
      stylesheets = Array.from(documentRef.styleSheets || []);
    } catch {
      return null;
    }
    return stylesheets.find((sheet) => {
      try {
        return /\/styles\/(?:base|pet|widgets|settings|music|chat)\.css(?:\?|$)/i.test(String(sheet.href || ""));
      } catch {
        return false;
      }
    }) || stylesheets[0] || null;
  }

  function sanitizeValue(value) {
    const text = String(value == null ? "" : value);
    if (/[{};]/.test(text)) throw new Error("Invalid runtime style value");
    return text;
  }

  function declarationsToCss(declarations) {
    return Object.entries(declarations || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([name, value]) => `${toCssProperty(name)}:${sanitizeValue(value)}`)
      .join(";");
  }

  function createRuntimeStyleManager(documentRef) {
    const sheet = findStylesheet(documentRef);
    function readRules() {
      if (!sheet) return null;
      try {
        return Array.from(sheet.cssRules || []);
      } catch {
        return null;
      }
    }
    function findRuleIndex(rules, id) {
      const selector = `[data-runtime-style-${id}]`;
      return rules.findIndex((rule) => String(rule.cssText || "").includes(selector));
    }

    function apply(element, id, declarations) {
      if (!element || !id || !sheet || typeof sheet.insertRule !== "function") return false;
      const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "-");
      const css = declarationsToCss(declarations);
      if (!css) return clear(element);
      const attribute = `data-runtime-style-${safeId}`;
      const elementId = element && typeof element.id === "string"
        ? element.id.trim().replace(/[^a-zA-Z0-9_-]/g, "")
        : "";
      const selector = elementId ? `#${elementId}[${attribute}]` : `[${attribute}]`;
      const rules = readRules();
      if (rules === null) return false;
      const existingIndex = findRuleIndex(rules, safeId);
      try {
        sheet.insertRule(`${selector}{${css}}`, rules.length);
      } catch {
        return false;
      }
      element.setAttribute(attribute, "true");
      if (existingIndex >= 0 && typeof sheet.deleteRule === "function") {
        try {
          sheet.deleteRule(existingIndex);
        } catch {
          // The newly inserted rule remains later in the cascade and stays effective.
        }
      }
      return true;
    }

    function clear(element, requestedId = "") {
      if (!element || !sheet) return false;
      const rules = readRules();
      if (rules === null) return false;
      const attributes = element.getAttributeNames
        ? element.getAttributeNames().filter((name) => name.startsWith("data-runtime-style-"))
        : [];
      const ids = attributes
        .map((name) => name.slice("data-runtime-style-".length))
        .filter((id) => !requestedId || id === String(requestedId));
      if (typeof sheet.deleteRule === "function") {
        for (const id of ids) {
          const ruleIndex = findRuleIndex(rules, id);
          if (ruleIndex < 0) continue;
          try {
            sheet.deleteRule(ruleIndex);
            rules.splice(ruleIndex, 1);
          } catch {
            // Removing the data attribute below still disables the matching rule.
          }
        }
      }
      if (typeof element.removeAttribute === "function") {
        for (const attribute of attributes) {
          const id = attribute.slice("data-runtime-style-".length);
          if (!requestedId || id === String(requestedId)) element.removeAttribute(attribute);
        }
      }
      return true;
    }

    return { apply, clear };
  }

  const api = { createRuntimeStyleManager, declarationsToCss };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DeskpetRuntimeStyle = api;
})(typeof window !== "undefined" ? window : globalThis);
