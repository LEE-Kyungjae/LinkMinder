function getMetaContent(name) {
  const element = document.querySelector(`meta[name="${name}"]`) ?? document.querySelector(`meta[property="og:${name}"]`);
  return element?.getAttribute("content") ?? "";
}

function getKeywords() {
  const keywords = getMetaContent("keywords");
  if (!keywords) {
    return [];
  }
  return keywords
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSelectionText() {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }
  return selection.toString().trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "page:collect") {
    return;
  }

  const payload = {
    description: getMetaContent("description"),
    selectionText: getSelectionText(),
    keywords: getKeywords()
  };

  sendResponse({ ok: true, payload });
});

console.info("LinkMinder content script initialised.");
