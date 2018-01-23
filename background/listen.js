class TabInfo {
  constructor(lastAccessed, groupId) {
    this.lastAccessed = lastAccessed;
    this.groupId = groupId;

    // set([hostname]) temporarily exempt
    // note: we late bind the set to save memory
    this._exempt = null;
  }

  exempt(domainName) {
    if(this._exempt === null) {
      this._exempt = new Set([domainName]);
    }
    else {
      this._exempt.add(domainName);
    }
  }

  isExempt(domainName) {
    return this._exempt && this._exempt.has(domainName);
  }
}

// tabId -> tabInfo 
var _tabInfo = new Map();

// windowId -> port
var _ports = new Map();
var _openSidebarOnClick = false;
var _groups = [];

function postMessage(msg) {
  for(let port of _ports.values()) {
    port.postMessage(msg);
  }
}

function encodeURL(url) {
  return encodeURIComponent(url).replace(/[!'()*]/g, (c) => {
    const charCode = c.charCodeAt(0).toString(16);
    return `%${charCode}`;
  });
}

async function setActiveGroupIcon(tabId, groupId) {
  let group = _groups.find((g) => g.uuid == groupId);
  if(!group) {
    return;
  }

  await browser.browserAction.setBadgeBackgroundColor({
    tabId: tabId,
    color: group.colour + '80' // 50% opacity
  });

  let text = String.fromCodePoint(group.name.codePointAt(0));
  await browser.browserAction.setBadgeText({
    tabId: tabId,
    text: text
  });

  await browser.browserAction.setTitle({
    title: `Active Group: ${group.name}`,
    tabId: tabId
  });
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

  let tabInfo = _tabInfo.get(tab.id);

  if(tabInfo && tabInfo.isExempt(domainName)) {
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
    let url = `${extURL}?url=${encodeURL(options.url)}&groupId=${settings.group}&tabId=${tab.id}&windowId=${tab.windowId}`
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

async function redirectTab(message) {
  let tab = await browser.tabs.update(message.tabId, {
    loadReplace: true,
    url: message.redirectUrl
  });
  await browser.history.deleteUrl({ url: message.originalUrl });
}

async function moveTabToGroup(message) {
  await browser.sessions.setTabValue(message.tabId, "group-id", message.groupId);
  await browser.sessions.setWindowValue(message.windowId, "active-group-id", message.groupId);
  await redirectTab(message);

  let groupInfo = _tabInfo.get(message.tabId);
  if(groupInfo) {
    groupInfo.groupId = message.groupId;
  }

  postMessage({
    method: "moveTabGroup",
    tabId: message.tabId,
    groupId: message.groupId
  });
  await setActiveGroupIcon(message.tabId, message.groupId);
}

function onPortMessage(message) {
  if(message.method == "invalidateExempt") {
    _exemptTabs.delete(message.tabId);
  }
  else if(message.method == "activeSync") {
    let tabInfo = _tabInfo.get(message.tabId);
    if(tabInfo) {
      tabInfo.groupId = message.groupId;
    }
    browser.sessions.setWindowValue(message.windowId, "active-group-id", message.groupId);
    setActiveGroupIcon(message.tabId, message.groupId);
  }
  else if(message.method == "syncTabs") {
    for(let tabId of message.tabIds) {
      let obj = _tabInfo.get(tabId);
      if(obj) {
        obj.groupId = message.groupId;
      }
      setActiveGroupIcon(tabId, message.groupId);
    }
    browser.sessions.setWindowValue(message.windowId, "active-group-id", message.groupId);
  }
}

function portConnected(port) {
  _ports.set(parseInt(port.name), port);
  port.onMessage.addListener(onPortMessage);
  port.postMessage({method: "connected"});
}

function onMessage(message) {
  if(message.method == "neverAsk") {
    toggleNeverAsk(message.hostname, message.neverAsk);
  }
  else if(message.method == "redirectTab") {
    if(message.exempt) {
      let domainName = new URL(message.redirectUrl).hostname;
      let tabInfo = _tabInfo.get(message.tabId);
      if(tabInfo) {
        tabInfo.exempt(domainName);
      }
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
  if(_openSidebarOnClick) {
    browser.sidebarAction.open();
  }
  browser.browserAction.setPopup({
    popup: "/popup/main.html"
  });
  browser.browserAction.openPopup();
  browser.browserAction.setPopup({
    popup: ""
  });
}

async function ensureDefaultSettings() {
  let groups = await browser.storage.local.get("groups");
  if(groups.hasOwnProperty("groups")) {
    _groups = groups.groups;
  }

  const settings = {
    reverseTabDisplay: false,
    openSidebarOnClick: false
  };

  let keys = Object.keys(settings);
  let before = await browser.storage.local.get(keys);

  // fresh install, can just add the default settings right away
  if(Object.keys(before).length === 0) {
    await browser.storage.local.set(settings);
    return;
  }

  for(let key of keys) {
    if(before.hasOwnProperty(key)) {
      // already set explicitly so ignore it
      continue;
    }

    before[key] = settings[key];
  }

  _openSidebarOnClick = before.openSidebarOnClick;
  await browser.storage.local.set(before);
}

async function prepare() {
  let tabs = await browser.tabs.query({});
  for(let tab of tabs) {
    let groupId = await browser.sessions.getTabValue(tab.id, "group-id");
    if(groupId) {
      if(tab.active) {
        await browser.sessions.setWindowValue(tab.windowId, "active-group-id", groupId);
        await setActiveGroupIcon(tab.id, groupId);
      }
      _tabInfo.set(tab.id, new TabInfo(tab.lastAccessed, groupId));
    }
  }
}

async function onTabCreated(tabInfo) {
  let groupId = await browser.sessions.getWindowValue(tabInfo.windowId, "active-group-id");
  await browser.sessions.setTabValue(tabInfo.id, "group-id", groupId);
  _tabInfo.set(tabInfo.id, new TabInfo(tabInfo.lastAccessed, groupId));
  await setActiveGroupIcon(tabInfo.id, groupId);
}

function _upsertTab(tabId, groupId) {
  let tabInfo = _tabInfo.get(tabId);
  if(tabInfo) {
    tabInfo.lastAccessed = new Date().getTime();
    tabInfo.groupId = groupId;
  }
  else {
    _tabInfo.set(tabId, new TabInfo(new Date().getTime(), groupId));
  }
}

async function onTabActive(activeInfo) {
  let groupId = await browser.sessions.getTabValue(activeInfo.tabId, "group-id");
  let activeGroupId = await browser.sessions.getWindowValue(activeInfo.windowId, "active-group-id");
  if(groupId !== activeGroupId) {
    await browser.sessions.setWindowValue(activeInfo.windowId, "active-group-id", groupId);
  }

  await setActiveGroupIcon(activeInfo.tabId, groupId);
  _upsertTab(activeInfo.tabId, groupId);
}

function onTabRemoved(tabId, removeInfo) {
  _tabInfo.delete(tabId);
}

async function onTabAttach(tabId, attachInfo) {
  let activeGroupId = await browser.sessions.getWindowValue(attachInfo.newWindowId, "active-group-id");
  await browser.sessions.setTabValue(tabId, "group-id", activeGroupId);
  _upsertTab(tabId, groupId);
  await setActiveGroupIcon(tabId, activeGroupId);
}

function onTabUpdate(tabId, changeInfo, tabInfo) {
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1430620
  if(tabInfo.active) {
    let groupInfo = _tabInfo.get(tabId);
    if(groupInfo) {
      let groupId = groupInfo.groupId;
      setActiveGroupIcon(tabId, groupId);
    }
  }
}

function onWindowRemoved(windowId) {
  _ports.delete(windowId);
}

function onSettingChange(changes, area) {
  if(changes.hasOwnProperty("openSidebarOnClick")) {
    _openSidebarOnClick = changes.openSidebarOnClick.newValue;
  }

  if(changes.hasOwnProperty("groups")) {
    _groups = changes.groups.newValue;
    browser.tabs.query({active: true}).then((tabs) => {
      tabs.forEach((t) => setActiveGroupIcon(t.id, _tabInfo.get(t.id).groupId))
    });
  }
}

ensureDefaultSettings();
prepare();
browser.runtime.onConnect.addListener(portConnected);
browser.runtime.onMessage.addListener(onMessage);
browser.tabs.onCreated.addListener(onTabCreated);
browser.tabs.onRemoved.addListener(onTabRemoved);
browser.tabs.onAttached.addListener(onTabAttach);
browser.tabs.onActivated.addListener(onTabActive);
browser.tabs.onUpdated.addListener(onTabUpdate);
browser.windows.onRemoved.addListener(onWindowRemoved);
browser.browserAction.onClicked.addListener(onClicked);
browser.storage.onChanged.addListener(onSettingChange);
browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"])
