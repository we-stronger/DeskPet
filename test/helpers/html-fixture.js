const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

function isWhitespace(character) {
  return /\s/.test(character);
}

function isTagNameStart(character) {
  return Boolean(character) && /[A-Za-z]/.test(character);
}

function isTagNameCharacter(character) {
  return Boolean(character) && /[\w:-]/.test(character);
}

function skipWhitespace(html, index) {
  while (index < html.length && isWhitespace(html[index])) index += 1;
  return index;
}

function skipThroughTagEnd(html, index) {
  let quote = null;
  while (index < html.length) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
    index += 1;
  }
  return html.length;
}

function parseOpeningTag(html, startIndex) {
  let index = startIndex + 1;
  const nameStart = index;
  while (isTagNameCharacter(html[index])) index += 1;
  const tagName = html.slice(nameStart, index).toLowerCase();
  const attributes = Object.create(null);
  let selfClosing = false;

  while (index < html.length) {
    index = skipWhitespace(html, index);
    if (html[index] === ">") {
      index += 1;
      break;
    }
    if (html[index] === "/" && html[index + 1] === ">") {
      selfClosing = true;
      index += 2;
      break;
    }

    const attributeStart = index;
    while (
      index < html.length
      && !isWhitespace(html[index])
      && html[index] !== "="
      && html[index] !== ">"
      && html[index] !== "/"
    ) {
      index += 1;
    }
    if (attributeStart === index) {
      index += 1;
      continue;
    }

    const attributeName = html.slice(attributeStart, index).toLowerCase();
    index = skipWhitespace(html, index);
    let value = "";
    if (html[index] === "=") {
      index = skipWhitespace(html, index + 1);
      const quote = html[index] === '"' || html[index] === "'" ? html[index] : null;
      if (quote) {
        const valueStart = index + 1;
        index = valueStart;
        while (index < html.length && html[index] !== quote) index += 1;
        value = html.slice(valueStart, index);
        if (html[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (
          index < html.length
          && !isWhitespace(html[index])
          && html[index] !== ">"
          && !(html[index] === "/" && html[index + 1] === ">")
        ) {
          index += 1;
        }
        value = html.slice(valueStart, index);
      }
    }
    attributes[attributeName] = value;
  }

  return {
    index,
    node: { type: "element", tagName, attributes, children: [] },
    selfClosing,
  };
}

function parseHtml(html) {
  const root = { type: "root", children: [] };
  const stack = [root];
  let index = 0;

  while (index < html.length) {
    const current = stack[stack.length - 1];
    if (current.type === "element" && RAW_TEXT_ELEMENTS.has(current.tagName)) {
      const closeIndex = html.toLowerCase().indexOf(`</${current.tagName}`, index);
      if (closeIndex === -1) break;
      index = closeIndex;
    }

    if (html[index] !== "<") {
      index += 1;
      continue;
    }
    if (html.startsWith("<!--", index)) {
      const commentEnd = html.indexOf("-->", index + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }
    if (html[index + 1] === "!" || html[index + 1] === "?") {
      index = skipThroughTagEnd(html, index + 2);
      continue;
    }
    if (html[index + 1] === "/") {
      let nameIndex = skipWhitespace(html, index + 2);
      const nameStart = nameIndex;
      while (isTagNameCharacter(html[nameIndex])) nameIndex += 1;
      const tagName = html.slice(nameStart, nameIndex).toLowerCase();
      const matchingIndex = stack.findLastIndex(
        (node) => node.type === "element" && node.tagName === tagName
      );
      if (matchingIndex > 0) stack.length = matchingIndex;
      index = skipThroughTagEnd(html, nameIndex);
      continue;
    }
    if (!isTagNameStart(html[index + 1])) {
      index += 1;
      continue;
    }

    const parsed = parseOpeningTag(html, index);
    stack[stack.length - 1].children.push(parsed.node);
    if (!parsed.selfClosing && !VOID_ELEMENTS.has(parsed.node.tagName)) {
      stack.push(parsed.node);
    }
    index = parsed.index;
  }

  return root;
}

function attributeValue(node, name) {
  if (!node || node.type !== "element") return null;
  const normalizedName = name.toLowerCase();
  return Object.hasOwn(node.attributes, normalizedName) ? node.attributes[normalizedName] : null;
}

function hasAttribute(node, name) {
  return attributeValue(node, name) !== null;
}

function hasClass(node, className) {
  return (attributeValue(node, "class") || "").split(/\s+/).includes(className);
}

function matches(node, criteria) {
  if (criteria.tagName && node.tagName !== criteria.tagName.toLowerCase()) return false;
  return Object.entries(criteria.attributes || {}).every(
    ([name, value]) => attributeValue(node, name) === value
  );
}

function elements(root, criteria = {}) {
  const matchesFound = [];
  const visit = (node) => {
    for (const child of node?.children || []) {
      if (matches(child, criteria)) matchesFound.push(child);
      visit(child);
    }
  };
  visit(root);
  return matchesFound;
}

function section(root, attributeName, expectedValue) {
  return elements(root, { attributes: { [attributeName]: expectedValue } })[0] || null;
}

module.exports = {
  attributeValue,
  elements,
  hasAttribute,
  hasClass,
  parseHtml,
  section,
};
