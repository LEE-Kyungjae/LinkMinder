/**
 * Generate a stable identifier.
 */
export function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalize a URL so duplicate saves get collapsed.
 * @param {string} url
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.protocol === "http:") {
      parsed.port = parsed.port === "80" ? "" : parsed.port;
    }
    if (parsed.protocol === "https:") {
      parsed.port = parsed.port === "443" ? "" : parsed.port;
    }
    return parsed.toString();
  } catch (error) {
    console.warn("normalizeUrl failed for", url, error);
    return url;
  }
}

/**
 * Extract a domain-friendly label.
 */
export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

/**
 * Format ISO date string.
 */
export function toIsoString(date = new Date()) {
  return date.toISOString();
}

/**
 * Convert string safe to display.
 */
export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
