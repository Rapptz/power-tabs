// domain names that have been temporarily been exempted
// a mapping of tabId => Set([hostname])
var _exemptTabs = new Map();
var _port;

function encodeURL(url) {
  return encodeURIComponent(url).replace(/[!'()*]/g, (c) => {
    const charCode = c.charCodeAt(0).toString(16);
    return `%${charCode}`;
  });
}

function exemptTab(tabId, domainName) {
  if(!_exemptTabs.has(tabId)) {
    _exemptTabs[tabId] = new Set([domainName]);
  }
  else {
    _exemptTabs[tabId].add(domainName);
  }
}

function isExempt(tabId, domainName) {
  let set = _exemptTabs[tabId];
  return set && set.has(domainName);
}

async function onBeforeRequest(options) {
  if(options.frameId !== 0 || options.tabId === -1) {
    return {};
  }

  let domainName = new URL(options.url).hostname;
  let key = `page:${domainName}`;

  let [tab, settings] = await Promise.all([
    browser.tabs.get(options.tabId),
    browser.storage.local.get(key)
  ]);

  if(isExempt(tab.id, domainName)) {
    return {};
  }

  // note: tab.url contains the *previous* URL before we did the request
  // don't do any processing if we don't have any settings for the page
  if(!settings.hasOwnProperty(key)) {
    return {};
  }

  settings = settings[key];
  if(settings.neverAsk) {
    return {};
  }

  let groupId = await browser.sessions.getTabValue(options.tabId, "group-id");
  if(!groupId) {
    return {};
  }

  if(groupId !== settings.group) {
    const extURL = browser.extension.getURL("/background/confirm.html");
    let url = `${extURL}?url=${encodeURL(options.url)}&groupId=${settings.group}&tabId=${tab.id}`
    return {
      redirectUrl: url
    };
  }

  return {};
}

async function toggleNeverAsk(domainName, value) {
  let key = `page:${domainName}`;
  let settings = await browser.storage.local.get(key);

  if(!settings.hasOwnProperty(key)) {
    // ? perplexing so let's ignore
    return;
  }

  settings[key].neverAsk = value;
  await browser.storage.local.set(settings);
}

function redirectTab(message) {
  browser.tabs.update(message.tabId, {
    loadReplace: true,
    url: message.redirectUrl
  }).then((tab) => {
    browser.history.deleteUrl({url: message.originalUrl });
  });
}

function moveTabToGroup(message) {
  browser.sessions.setTabValue(message.tabId, "group-id", message.groupId);
  redirectTab(message);
  _port.postMessage({
    method: "moveTabGroup",
    tabId: message.tabId,
    groupId: message.groupId
  });
}

function onPortMessage(message) {
  if(message.method == "invalidateExempt") {
    _exemptTabs.delete(message.tabId);
  }
}

function portConnected(port) {
  _port = port;
  _port.onMessage.addListener(onPortMessage);
}

function onMessage(message) {
  if(message.method == "neverAsk") {
    toggleNeverAsk(message.hostname, message.neverAsk);
  }
  else if(message.method == "redirectTab") {
    if(message.exempt) {
      let domainName = new URL(message.redirectUrl).hostname;
      exemptTab(message.tabId, domainName);
    }

    if(message.hasOwnProperty("groupId")) {
      moveTabToGroup(message);
    }
    else {
      redirectTab(message);
    }
  }
}

function onClicked(tab) {
  browser.sidebarAction.open();
  browser.browserAction.setPopup({
    popup: "/popup/main.html"
  });
  browser.browserAction.openPopup();
  browser.browserAction.setPopup({
    popup: ""
  });
}

browser.runtime.onConnect.addListener(portConnected);
browser.runtime.onMessage.addListener(onMessage);
browser.browserAction.onClicked.addListener(onClicked);
browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"])
