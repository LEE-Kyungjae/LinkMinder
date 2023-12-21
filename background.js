const nonce = btoa(Math.random().toString());

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ nonce: nonce });
});