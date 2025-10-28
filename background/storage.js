import { STORAGE_KEYS } from "../common/constants.js";
import { generateId, normalizeUrl } from "./utils.js";

async function getFromStorage(key, fallback) {
  const result = await chrome.storage.local.get({ [key]: fallback });
  return result[key];
}

async function setToStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export async function getLinks() {
  return getFromStorage(STORAGE_KEYS.LINKS, []);
}

export async function saveLinks(links) {
  return setToStorage(STORAGE_KEYS.LINKS, links);
}

export async function upsertLink(nextLink) {
  const links = await getLinks();
  const normalisedUrl = normalizeUrl(nextLink.url);

  const index = links.findIndex((item) => normalizeUrl(item.url) === normalisedUrl);
  if (index >= 0) {
    const existing = links[index];
    const updated = {
      ...existing,
      ...nextLink,
      id: existing.id,
      createdAt: existing.createdAt ?? nextLink.createdAt,
      archived: existing.archived ?? nextLink.archived ?? false,
      private: existing.private ?? nextLink.private ?? false,
      url: normalisedUrl,
      updatedAt: nextLink.updatedAt
    };
    links.splice(index, 1, updated);
  } else {
    links.unshift({ ...nextLink, url: normalisedUrl, private: nextLink.private ?? false });
  }

  await saveLinks(links);
  return links;
}

export async function deleteLink(linkId) {
  const links = await getLinks();
  const filtered = links.filter((item) => item.id !== linkId);
  await saveLinks(filtered);
  return filtered;
}

export async function toggleArchive(linkId) {
  const links = await getLinks();
  const updated = links.map((item) =>
    item.id === linkId ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() } : item
  );
  await saveLinks(updated);
  return updated;
}

export async function updateLinkNote(linkId, note) {
  const links = await getLinks();
  const updated = links.map((item) =>
    item.id === linkId ? { ...item, note, updatedAt: new Date().toISOString() } : item
  );
  await saveLinks(updated);
  return updated;
}

export async function togglePrivate(linkId) {
  const links = await getLinks();
  const updated = links.map((item) =>
    item.id === linkId
      ? {
          ...item,
          private: !item.private,
          updatedAt: new Date().toISOString()
        }
      : item
  );
  await saveLinks(updated);
  return updated;
}

export async function exportLinks({ privateOnly = false } = {}) {
  const links = await getLinks();
  if (!privateOnly) {
    return links.filter((item) => !item.private);
  }
  return links.filter((item) => Boolean(item.private));
}

export async function importLinks(items = [], { targetPrivate = false } = {}) {
  const links = await getLinks();
  const now = new Date();
  const existingByUrl = new Map(
    links.map((item) => [normalizeUrl(item.url), item])
  );

  for (const raw of items) {
    if (!raw || !raw.url) {
      continue;
    }
    const incoming = {
      id: raw.id ?? generateId(),
      url: raw.url,
      title: raw.title ?? raw.url,
      category: raw.category ?? "기타",
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      archived: Boolean(raw.archived),
      private: targetPrivate,
      note: raw.note ?? "",
      confidence: Number.isFinite(raw.confidence) ? raw.confidence : 0,
      ruleId: raw.ruleId ?? null,
      evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
      classifierVersion: raw.classifierVersion ?? 1,
      cluster: raw.cluster ?? null,
      createdAt: raw.createdAt ?? now.toISOString(),
      updatedAt: raw.updatedAt ?? now.toISOString(),
      meta: raw.meta ?? {},
      source: raw.source ?? { trigger: "import", savedAt: now.toISOString() }
    };

    const normalisedUrl = normalizeUrl(incoming.url);
    if (existingByUrl.has(normalisedUrl)) {
      const existing = existingByUrl.get(normalisedUrl);
      Object.assign(existing, {
        ...incoming,
        id: existing.id,
        url: normalisedUrl,
        private: targetPrivate,
        updatedAt: now.toISOString()
      });
    } else {
      links.unshift({ ...incoming, url: normalisedUrl, private: targetPrivate });
      existingByUrl.set(normalisedUrl, links[0]);
    }
  }

  await saveLinks(links);
  return links;
}

export async function getCustomRules() {
  return getFromStorage(STORAGE_KEYS.RULES, []);
}

export async function saveCustomRules(rules) {
  await setToStorage(STORAGE_KEYS.RULES, rules);
  return rules;
}

export async function upsertCustomRule(rule) {
  const payload = {
    ...rule,
    id: rule.id ?? generateId()
  };
  const rules = await getCustomRules();
  const index = rules.findIndex((item) => item.id === payload.id);
  if (index >= 0) {
    rules.splice(index, 1, { ...rules[index], ...payload });
  } else {
    rules.push(payload);
  }
  await saveCustomRules(rules);
  return rules;
}

export async function deleteCustomRule(ruleId) {
  const rules = await getCustomRules();
  const filtered = rules.filter((rule) => rule.id !== ruleId);
  await saveCustomRules(filtered);
  return filtered;
}

export async function getPrivatePin() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.PRIVATE_PIN]: null });
  return result[STORAGE_KEYS.PRIVATE_PIN];
}

export async function setPrivatePin(pin) {
  await chrome.storage.local.set({ [STORAGE_KEYS.PRIVATE_PIN]: pin });
  return pin;
}

export async function verifyPrivatePin(pin) {
  const stored = await getPrivatePin();
  if (!stored) {
    return false;
  }
  return stored === pin;
}
