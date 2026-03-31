const {
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
  loadSettings,
  storageSet,
  withDefaults,
} = window.HTC;

let ENABLED = DEFAULT_SETTINGS.enabled;
let SETTINGS = {
  mode: DEFAULT_SETTINGS.mode,
  includeRegexes: DEFAULT_SETTINGS.includeRegexes,
  excludeRegexes: DEFAULT_SETTINGS.excludeRegexes,
};
let INCLUDE_REGEXES = [];
let EXCLUDE_REGEXES = [];

function applySettings(values) {
  const next = withDefaults(values);
  SETTINGS.mode = next.mode;
  SETTINGS.includeRegexes = next.includeRegexes;
  SETTINGS.excludeRegexes = next.excludeRegexes;
  ENABLED = next.enabled;
  INCLUDE_REGEXES = compileFilterRegexes(next.includeRegexes);
  EXCLUDE_REGEXES = compileFilterRegexes(next.excludeRegexes);
}

async function refreshSettings() {
  try {
    const values = await loadSettings();
    applySettings(values);
  } catch (_err) {
    applySettings(DEFAULT_SETTINGS);
  }
}

const SIMPLE_REGEX = /#(?:[0-9a-f]{3,8})\b|\b[a-zA-Z-]+\b/gi;
const IGNORED_TAGS = ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"];
const CLASS_HIGHLIGHT = "ext-highlight-text-color-avasay-sayava__hl";
const CLASS_HOVER = "ext-highlight-text-color-avasay-sayava__hl--hover";
const CLASS_TOOLTIP = "ext-highlight-text-color-avasay-sayava__tt";
const DATA_HIGHLIGHTED_ATTR = "data-ext-highlight-text-color-avasay-sayava-highlighted";
const OWNED_SELECTOR =
  '.ext-highlight-text-color-avasay-sayava__hl, .ext-highlight-text-color-avasay-sayava__tt, [data-ext-highlight-text-color-avasay-sayava-highlighted="1"]';

function isInsideOwnedNode(node) {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return !!(el && el.closest(OWNED_SELECTOR));
}

function extractFunctions(text) {
  const results = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf("(", i);
    if (start === -1) break;

    let depth = 1;
    let end = start + 1;

    while (end < text.length && depth > 0) {
      if (text[end] === "(") depth++;
      else if (text[end] === ")") depth--;
      end++;
    }

    const before = text.slice(0, start);
    const fnNameMatch = before.match(/([a-zA-Z-]+)$/);

    if (fnNameMatch) {
      const fnName = fnNameMatch[1];
      const full = fnName + text.slice(start, end);
      results.push({ value: full, start: start - fnName.length, end });
    }

    i = end;
  }

  return results;
}

function isGradientValue(value) {
  return /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(value);
}

function getValueKind(value) {
  const candidate = value.trim();

  if (CSS.supports("color", candidate)) {
    return "color";
  }

  if (
    isGradientValue(candidate) &&
    CSS.supports("background-image", candidate)
  ) {
    return "gradient";
  }

  return null;
}

function getComputedColor(value) {
  const el = document.createElement("span");
  el.style.color = value;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  return computed;
}

function parseComputedColorToRgba(computedColor) {
  const match = computedColor.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const body = match[1].trim();
  let channels = [];
  let alpha = 1;

  if (body.includes(",")) {
    const parts = body.split(",").map((part) => part.trim());
    channels = parts.slice(0, 3).map((part) => Number.parseFloat(part));
    if (parts[3] != null) {
      alpha = parts[3].endsWith("%")
        ? Number.parseFloat(parts[3]) / 100
        : Number.parseFloat(parts[3]);
    }
  } else {
    const [beforeSlash, alphaPart] = body.split("/").map((part) => part.trim());
    channels = beforeSlash
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => Number.parseFloat(part));

    if (alphaPart) {
      alpha = alphaPart.endsWith("%")
        ? Number.parseFloat(alphaPart) / 100
        : Number.parseFloat(alphaPart);
    }
  }

  if (
    channels.length < 3 ||
    channels.some((channel) => !Number.isFinite(channel))
  ) {
    return null;
  }

  if (!Number.isFinite(alpha)) alpha = 1;
  alpha = Math.max(0, Math.min(1, alpha));

  const r = Math.round(channels[0]);
  const g = Math.round(channels[1]);
  const b = Math.round(channels[2]);

  return {
    r,
    g,
    b,
    a: alpha,
    rgba: `rgba(${r}, ${g}, ${b}, ${alpha})`,
  };
}

function normalizeColorToRgba(value) {
  const computed = getComputedColor(value);
  return parseComputedColorToRgba(computed);
}

function getContrastFromRgba(rgbaColor) {
  if (!rgbaColor) return "#111";

  const { r, g, b } = rgbaColor;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.5 ? "#000" : "#fff";
}

function applyReadableGradientTextStyles(el) {
  el.style.color = "#fff";
  el.style.textShadow =
    "0 1px 1px rgba(0,0,0,0.95), 0 -1px 1px rgba(0,0,0,0.95), 1px 0 1px rgba(0,0,0,0.95), -1px 0 1px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)";
}

function shouldIgnoreNonGradientColor(rawValue, rgbaColor) {
  const raw = rawValue.trim().toLowerCase();
  if (raw === "transparent" || raw === "currentcolor") return true;
  if (!rgbaColor) return true;

  return rgbaColor.a === 0;
}

function compileFilterRegexes(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const compiled = [];
  for (const line of lines) {
    try {
      const anchorWhole = (pattern) => {
        if (!pattern) return "^(?:)$";
        return `^(?:${pattern})$`;
      };

      const slashMatch = line.match(/^\/(.*)\/([a-z]*)$/i);
      if (slashMatch) {
        compiled.push(new RegExp(anchorWhole(slashMatch[1]), slashMatch[2]));
      } else {
        compiled.push(new RegExp(anchorWhole(line), "i"));
      }
    } catch (_err) {}
  }

  return compiled;
}

function passesUserFilters(value) {
  const included =
    !INCLUDE_REGEXES.length ||
    INCLUDE_REGEXES.some((regex) => {
      regex.lastIndex = 0;
      return regex.test(value);
    });

  if (!included) return false;

  const excluded = EXCLUDE_REGEXES.some((regex) => {
    regex.lastIndex = 0;
    return regex.test(value);
  });

  return !excluded;
}

function isParsableColorToken(token) {
  if (
    !token ||
    /^(?:inherit|initial|unset|revert|revert-layer|none|transparent|currentcolor)$/i.test(
      token,
    )
  ) {
    return false;
  }

  return CSS.supports("color", token);
}

function configureInteractiveSpan(span, previewValue, label, isGradient) {
  span.className = CLASS_HIGHLIGHT;
  span.classList.toggle(CLASS_HOVER, SETTINGS.mode !== "highlight");

  if (SETTINGS.mode === "highlight") {
    if (isGradient) {
      span.style.backgroundImage = previewValue;
      applyReadableGradientTextStyles(span);
    } else {
      const rgbaColor = normalizeColorToRgba(previewValue);
      if (!rgbaColor) return false;
      span.style.backgroundColor = rgbaColor.rgba;
      span.style.color = getContrastFromRgba(rgbaColor);
    }
    return true;
  }

  span.addEventListener("mouseenter", (e) =>
    showTooltip(e, previewValue, label, isGradient),
  );
  span.addEventListener("mouseleave", hideTooltip);
  return true;
}

function processTextNode(node) {
  if (!ENABLED) return;
  if (isInsideOwnedNode(node)) return;

  const text = node.nodeValue;
  if (!text.trim()) return;

  let matches = [];

  matches.push(...extractFunctions(text));

  SIMPLE_REGEX.lastIndex = 0;
  let m;
  while ((m = SIMPLE_REGEX.exec(text)) !== null) {
    const token = m[0];
    const isHex = token.startsWith("#");
    if (!isHex && !isParsableColorToken(token)) continue;

    matches.push({
      value: token,
      start: m.index,
      end: SIMPLE_REGEX.lastIndex,
    });
  }

  matches.sort((a, b) => a.start - b.start);
  const filtered = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      filtered.push(match);
      lastEnd = match.end;
    }
  }

  const fragment = document.createDocumentFragment();
  let last = 0;
  let changed = false;

  for (const match of filtered) {
    const val = match.value;
    if (!passesUserFilters(val)) continue;

    const kind = getValueKind(val);
    if (!kind) continue;

    fragment.appendChild(
      document.createTextNode(text.slice(last, match.start)),
    );

    const span = document.createElement("span");
    span.textContent = val;
    span.setAttribute(DATA_HIGHLIGHTED_ATTR, "1");

    if (kind === "color") {
      const rgbaColor = normalizeColorToRgba(val);
      if (shouldIgnoreNonGradientColor(val, rgbaColor)) {
        fragment.appendChild(
          document.createTextNode(text.slice(match.start, match.end)),
        );
        last = match.end;
        continue;
      }

      const normalized = rgbaColor.rgba;
      if (!configureInteractiveSpan(span, normalized, val, false)) {
        fragment.appendChild(document.createTextNode(val));
        last = match.end;
        continue;
      }
    } else {
      configureInteractiveSpan(span, val, val, true);
    }

    fragment.appendChild(span);

    last = match.end;
    changed = true;
  }

  if (!changed) return;

  fragment.appendChild(document.createTextNode(text.slice(last)));
  node.replaceWith(fragment);
}

let tooltip;

function updateTooltipPosition(e) {
  if (tooltip) {
    const left = e.pageX - tooltip.offsetWidth / 2;
    tooltip.style.left = left + "px";
    tooltip.style.top = e.pageY + 10 + "px";
  }
}

function showTooltip(
  e,
  previewValue,
  label = previewValue,
  isGradient = false,
) {
  tooltip = document.createElement("div");
  tooltip.className = CLASS_TOOLTIP;
  tooltip.textContent = label;

  tooltip.style.background = previewValue;
  if (isGradient) {
    applyReadableGradientTextStyles(tooltip);
  } else {
    tooltip.style.textShadow = "";
    tooltip.style.color = getContrastFromRgba(
      normalizeColorToRgba(previewValue),
    );
  }

  document.body.appendChild(tooltip);

  updateTooltipPosition(e);

  document.addEventListener("mousemove", updateTooltipPosition);
}

function hideTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
  document.removeEventListener("mousemove", updateTooltipPosition);
}

function processNodeRecursive(node) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    if (
      node.parentElement &&
      !IGNORED_TAGS.includes(node.parentElement.tagName) &&
      !isInsideOwnedNode(node)
    ) {
      processTextNode(node);
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName;
  if (IGNORED_TAGS.includes(tag)) return;
  if (node.matches(OWNED_SELECTOR)) return;

  const children = Array.from(node.childNodes);
  for (const child of children) {
    processNodeRecursive(child);
  }
}

function processPage(root = document.body) {
  processNodeRecursive(root);
}

function clearHighlights() {
  document.querySelectorAll(`.${CLASS_HIGHLIGHT}`).forEach((el) => {
    const textNode = document.createTextNode(el.textContent);
    el.replaceWith(textNode);
  });
}

function rerender() {
  clearHighlights();

  if (ENABLED) {
    processPage();
  }
}

let timeout;
let observing = false;
const observer = new MutationObserver((mutations) => {
  if (!ENABLED) return;

  clearTimeout(timeout);
  timeout = setTimeout(() => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (!isInsideOwnedNode(n)) {
          processPage(n);
        }
      });
    }
  }, 100);
});

function startObserver() {
  if (observing || !document.body) return;

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  observing = true;
}

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === MESSAGE_TYPES.TOGGLE) {
    ENABLED = msg.enabled;
    storageSet({ enabled: ENABLED });
    rerender();
  } else if (msg.type === MESSAGE_TYPES.RELOAD_SETTINGS) {
    await refreshSettings();
    rerender();
  }
});

async function initialize() {
  startObserver();
  await refreshSettings();

  if (ENABLED) {
    processPage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
