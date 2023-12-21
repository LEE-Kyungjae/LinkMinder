chrome.storage.local.get(["nonce"], (result) => {
  const nonce = result.nonce;

  const script = document.createElement("script");
  script.setAttribute("nonce", nonce);
  script.textContent = 'console.log("Hello from content script!");';

  document.head.appendChild(script);
});
