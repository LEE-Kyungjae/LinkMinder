import { MESSAGE_TYPES } from "../common/constants.js";
import {
  deleteLink,
  getCustomRules,
  getLinks,
  toggleArchive,
  updateLinkNote,
  upsertCustomRule,
  upsertLink,
  deleteCustomRule,
  togglePrivate,
  getPrivatePin,
  setPrivatePin,
  verifyPrivatePin,
  exportLinks,
  importLinks
} from "./storage.js";
import { classifyLink } from "./classifier.js";
import { assignCluster } from "./topics.js";
import { generateId, getDomain, normalizeUrl, toIsoString } from "./utils.js";

const CONTEXT_MENU_ID_SAVE = "linkminder.save-link";

async function queryActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function collectPageContext(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "page:collect" });
    if (response && response.ok) {
      return response.payload;
    }
    return {};
  } catch (error) {
    if (chrome.runtime.lastError) {
      console.debug("No content script response", chrome.runtime.lastError.message);
    } else {
      console.debug("Content script not available", error);
    }
    return {};
  }
}

async function buildLinkRecord({ tab, trigger, existingLinks = [] }) {
  const now = toIsoString(new Date());
  const tabUrl = normalizeUrl(tab.url);
  const pageContext = (await collectPageContext(tab.id)) ?? {};

  const candidate = {
    url: tabUrl,
    title: tab.title ?? "",
    description: pageContext.description ?? "",
    selectionText: trigger?.selectionText ?? pageContext.selectionText ?? "",
    keywords: pageContext.keywords ?? []
  };

  const customRules = await getCustomRules();
  const classification = classifyLink(candidate, customRules);
  const cluster = assignCluster(
    {
      ...candidate,
      category: classification.category
    },
    existingLinks
  );

  const record = {
    id: generateId(),
    url: tabUrl,
    title: tab.title ?? getDomain(tabUrl) ?? tabUrl,
    category: classification.category,
    tags: classification.tags,
    archived: false,
    private: trigger?.makePrivate ?? false,
    note: "",
    confidence: classification.confidence,
    ruleId: classification.ruleId,
    evidence: classification.evidence,
    classifierVersion: classification.version,
    cluster,
    createdAt: now,
    updatedAt: now,
    meta: {
      description: candidate.description,
      selectionText: candidate.selectionText,
      keywords: candidate.keywords,
      domain: getDomain(tabUrl),
      favicon: tab.favIconUrl ?? "",
      title: tab.title ?? ""
    },
    source: {
      trigger: trigger?.reason ?? "manual",
      tabId: tab.id,
      windowId: tab.windowId,
      savedAt: now
    }
  };

  return record;
}

async function handleSaveActiveTab(trigger) {
  const tab = trigger?.tab ?? (trigger?.tabId ? await chrome.tabs.get(trigger.tabId) : await queryActiveTab());

  if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
    throw new Error("저장할 수 있는 탭을 찾지 못했습니다.");
  }

  const existingLinks = await getLinks();
  const record = await buildLinkRecord({ tab, trigger, existingLinks });
  const links = await upsertLink(record);
  return { record, links };
}

async function handleListLinks() {
  const links = await getLinks();
  return links;
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID_SAVE,
      title: "LinkMinder에 저장",
      contexts: ["page", "selection", "link"]
    });
  });
}

function registerEventListeners() {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID_SAVE) {
      return;
    }
    try {
      const { record } = await handleSaveActiveTab({
        tab,
        selectionText: info.selectionText ?? "",
        reason: "context-menu"
      });
      console.info("Link saved via context menu", record.url);
    } catch (error) {
      console.error("Failed to save link from context menu", error);
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "save-current-tab") {
      return;
    }
    try {
      await handleSaveActiveTab({ reason: "shortcut" });
    } catch (error) {
      console.error("Failed to save via shortcut", error);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message ?? {};

    const respond = (result) => sendResponse({ ok: true, data: result });
    const respondError = (error) => {
      console.error("LinkMinder handler error", type, error);
      sendResponse({ ok: false, error: error.message ?? String(error) });
    };

    switch (type) {
      case MESSAGE_TYPES.LIST_LINKS:
        handleListLinks().then(respond).catch(respondError);
        return true;
      case MESSAGE_TYPES.SAVE_ACTIVE:
        handleSaveActiveTab({ reason: "popup", makePrivate: Boolean(payload?.makePrivate) })
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.DELETE_LINK:
        deleteLink(payload?.id)
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.TOGGLE_ARCHIVE:
        toggleArchive(payload?.id)
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.TOGGLE_PRIVATE:
        togglePrivate(payload?.id)
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.UPDATE_NOTE:
        updateLinkNote(payload?.id, payload?.note ?? "")
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.LIST_RULES:
        getCustomRules()
          .then((rules) => respond({ custom: rules }))
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.UPSERT_RULE:
        upsertCustomRule(payload)
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.DELETE_RULE:
        deleteCustomRule(payload?.id)
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.PIN_STATUS:
        getPrivatePin()
          .then((pin) => respond({ hasPin: Boolean(pin) }))
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.SET_PIN:
        setPrivatePin(payload?.pin ?? "")
          .then(() => respond({ ok: true }))
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.VERIFY_PIN:
        verifyPrivatePin(payload?.pin ?? "")
          .then((match) => respond({ match }))
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.EXPORT_LINKS:
        exportLinks({ privateOnly: Boolean(payload?.privateOnly) })
          .then(respond)
          .catch(respondError);
        return true;
      case MESSAGE_TYPES.IMPORT_LINKS:
        importLinks(Array.isArray(payload?.items) ? payload.items : [], {
          targetPrivate: Boolean(payload?.targetPrivate)
        })
          .then(respond)
          .catch(respondError);
        return true;
      default:
        return false;
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

registerEventListeners();
