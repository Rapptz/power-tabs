class TabInfo {
  constructor(lastAccessed, groupId, windowId, discarded, hidden, pinned) {
    this.lastAccessed = lastAccessed;
    this.groupId = groupId;
    this.windowId = windowId;
    this.discarded = discarded || false;
    this.pinned = pinned || false;
    this.hidden = hidden || false;

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
var _groupSwitchTimeout = null;

// windowId -> port
var _ports = new Map();
var _openSidebarOnClick = false;
var _groups = [];
var _discardOnGroupChange = false;
var _hideOnGroupChange = true;
var _freshInstallBaton = null;

// windowId -> groupId for last active group
var _activeGroupCache = new Map();

async function createContextMenus() {
  let parent = await browser.menus.create({
    title: "Move to Group",
    contexts: ["tab"]
  });

  for(let g of _groups) {
    await browser.menus.create({
      id: g.uuid,
      title: g.name,
      parentId: parent,
      contexts: ["tab"]
    });
  }
}

async function changeAllTabVisbility(hide) {
  if(!browser.tabs.hasOwnProperty("hide")) {
    return;
  }

  let operation = hide ? browser.tabs.hide : browser.tabs.show;
  let windows = await browser.windows.getAll({windowTypes: ['normal']});

  let groupIds = new Set();
  for(let windowInfo of windows) {
    let activeGroupId = await browser.sessions.getWindowValue(windowInfo.id, "active-group-id");
    let tabIds = [];
    for(let [tabId, tabInfo] of _tabInfo.entries()) {
      if(tabInfo.windowId !== windowInfo.id) {
        continue;
      }

      // if we're showing a tab, then just add it to the array without discrimination.
      if(!hide) {
        tabIds.push(tabId);
      }
      // if we're hiding a tab then make sure it's part of the active group ID set
      else if(tabInfo.groupId !== activeGroupId) {
        tabIds.push(tabId);
      }
    }

    try {
      await operation(tabIds);
    }
    catch(e) {
      console.log(e);
    }
  }
}

async function onGroupSwitch(tabId, windowId, beforeGroupId, afterGroupId) {
  // don't do anything if the tab we're switching to is pinned
  if(tabId !== null) {
    let tabInfo = await browser.tabs.get(tabId);
    if(tabInfo.pinned) {
      return;
    }
  }

  _activeGroupCache.set(windowId, beforeGroupId);
  await browser.sessions.setWindowValue(windowId, "active-group-id", afterGroupId);
  if(_discardOnGroupChange && browser.tabs.hasOwnProperty("discard")) {
    let tabIds = [];
    for(let [key, value] of _tabInfo.entries()) {
      if(!value.discarded && value.windowId === windowId && value.groupId !== afterGroupId && !value.pinned) {
        tabIds.push(key);
      }
    }
    await browser.tabs.discard(tabIds);
  }

  if(_hideOnGroupChange && browser.tabs.hasOwnProperty("hide")) {
    let toHide = [];
    let toShow = [];
    for(let [key, value] of _tabInfo.entries()) {
      if(value.windowId !== windowId || value.pinned) {
        continue;
      }

      if(value.groupId === afterGroupId) {
        toShow.push(key);
      }
      else {
        toHide.push(key);
      }
    }
    await browser.tabs.hide(toHide);
    await browser.tabs.show(toShow);
  }
}

function postMessage(msg) {
  for(let port of _ports.values()) {
    port.postMessage(msg);
  }
}

function dispatchGroupSwitch(tabId, windowId, beforeGroupId, afterGroupId) {
  if(afterGroupId && beforeGroupId !== afterGroupId) {
    if(_groupSwitchTimeout !== null) {
      clearTimeout(_groupSwitchTimeout);
      _groupSwitchTimeout = null;
    }
    _groupSwitchTimeout = setTimeout(() => {
      onGroupSwitch(tabId, windowId, beforeGroupId, afterGroupId).then(() => {
        _groupSwitchTimeout = null;
      });
    }, 100);
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

async function createTab(windowId, groupId, sendResponse=null) {
  let oldGroupId = await browser.sessions.getWindowValue(windowId, "active-group-id");
  let dispatch = oldGroupId !== groupId;
  if(dispatch) {
    // have to call this first so onTabCreate knows what to do with this tab
    // regardless of the state of the dispatch switch
    await browser.sessions.setWindowValue(windowId, "active-group-id", groupId);
  }

  let port = _ports.get(windowId);
  if(port) {
    try {
      await port.postMessage({
        method: "setGroupBaton",
        groupId: groupId,
        windowId: windowId
      });
    }
    catch(e) {}
  }

  // the onTabCreated event will handle the rest of the state switching here
  let newTab = await browser.tabs.create({active: true, windowId: windowId});
  if(sendResponse) {
    sendResponse(newTab);
  }

  if(dispatch) {
    dispatchGroupSwitch(newTab.id, windowId, oldGroupId, groupId);
  }
}

async function createGroup(windowId, sendResponse=null) {
  let newGroup = {
    name: "untitled",
    uuid: uuid4(),
    open: true,
    active: true,
    colour: '#000000'
  };

  _groups.push(newGroup);
  await browser.storage.local.set({
    groups: _groups
  });

  if(sendResponse) {
    sendResponse(newGroup);
  }
  else {
    await createTab(windowId, newGroup.uuid);
  }
}

async function redirectTab(message) {
  let tab = await browser.tabs.update(message.tabId, {
    loadReplace: true,
    url: message.redirectUrl
  });
  await browser.history.deleteUrl({ url: message.originalUrl });
}

async function forceGroupChange(message) {
  let oldGroupId = await browser.sessions.getWindowValue(message.windowId, "active-group-id");
  await browser.sessions.setWindowValue(message.windowId, "active-group-id", message.groupId);

  // since we update the window value above, onTabUpdate down there won't actually dispatch anything
  // we might have to worry about activeSync though.
  await browser.tabs.update(message.tabId, {active: true});
  dispatchGroupSwitch(null, message.windowId, oldGroupId, message.groupId);
}

async function switchGroup(windowId, groupId) {
  if(!groupId) {
    return;
  }

  let groupTabs = Array.from(_tabInfo.entries()).filter(([tabId, info]) => {
    return info.windowId === windowId && info.groupId === groupId;
  });

  if(groupTabs.length === 0) {
    // if we don't have any tabs in that group then let's create one
    await createTab(windowId, groupId);
  }

  let lastAccessedIndex = groupTabs.reduce((maxIndex, element, index, arr) => {
    return element[1].lastAccessed > arr[maxIndex][1].lastAccessed ? index : maxIndex;
  }, 0);

  let tabId = groupTabs[lastAccessedIndex][0];
  let message = {
    groupId: groupId,
    windowId: windowId,
    tabId: tabId
  };
  await forceGroupChange(message);
}

async function moveTabToGroup(message, redirect=true) {
  let oldGroupId = await browser.sessions.getTabValue(message.tabId, "group-id");
  dispatchGroupSwitch(message.tabId, message.windowId, oldGroupId, message.groupId);
  await browser.sessions.setTabValue(message.tabId, "group-id", message.groupId);

  if(redirect) {
    await redirectTab(message);
  }

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
  console.log(message.method);
  if(message.method == "freshInstall") {
    freshInstall();
  }
  else if(message.method == "invalidateExempt") {
    _exemptTabs.delete(message.tabId);
  }
  else if(message.method == "activeSync") {
    let tabInfo = _tabInfo.get(message.tabId);
    if(tabInfo) {
      tabInfo.groupId = message.groupId;
    }

    browser.sessions.getWindowValue(message.windowId, "active-group-id").then((groupId) => {
      dispatchGroupSwitch(message.tabId, message.windowId, groupId, message.groupId);
    });
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

    browser.sessions.getWindowValue(message.windowId, "active-group-id").then((groupId) => {
      if(message.active) {
        dispatchGroupSwitch(message.activeTabId, message.windowId, groupId, message.groupId);
      }
      else if(_hideOnGroupChange && browser.tabs.hasOwnProperty("hide")) {
        if(message.groupId === groupId) {
          browser.tabs.show(message.tabIds);
        }
        else {
          browser.tabs.hide(message.tabIds);
        }
      }
    });
  }
}

function portConnected(port) {
  let windowId = parseInt(port.name);
  _ports.set(windowId, port);
  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(() => {
    _ports.delete(windowId);
  });
  port.postMessage({method: "connected"});
}

function onMessage(message, sender, sendResponse) {
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
  else if(message.method == "createTab") {
    createTab(message.windowId, message.groupId, sendResponse);
    return true;
  }
  else if(message.method == "forceGroupChange") {
    forceGroupChange(message);
  }
  else if(message.method == "createGroup") {
    createGroup(message.windowId, sendResponse);
    return true;
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
    openSidebarOnClick: false,
    discardOnGroupChange: false,
    hideOnGroupChange: true
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
  _discardOnGroupChange = before.discardOnGroupChange;
  _hideOnGroupChange = before.hideOnGroupChange;
  await browser.storage.local.set(before);

  createContextMenus();
}

async function actualFreshInstall() {
  let newGroup = {
    uuid: uuid4(),
    name: "untitled",
    colour: '#000000',
    active: true,
    open: true
  };

  let tabs = await browser.tabs.query({});
  let activeTabs = [];

  for(let tab of tabs) {
    if(tab.active) {
      await browser.sessions.setWindowValue(tab.windowId, "active-group-id", newGroup.uuid);
      activeTabs.push(tab);
    }
    let hidden = tab.hasOwnProperty("hidden") ? tab.hidden : false;
    _tabInfo.set(tab.id, new TabInfo(tab.lastAccessed, newGroup.uuid, tab.windowId, tab.discarded, hidden, tab.pinned));
    await browser.sessions.setTabValue(tab.id, "group-id", newGroup.uuid);
  }

  postMessage({
    method: "finishedFreshInstall",
    group: newGroup,
    tabs: tabs
  });

  _groups = [newGroup];

  await browser.storage.local.set({
    groups: _groups
  });
}

function freshInstall() {
  if(_freshInstallBaton === null) {
    _freshInstallBaton = false;
    actualFreshInstall();
  }
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
      let hidden = tab.hasOwnProperty("hidden") ? tab.hidden : false;
      _tabInfo.set(tab.id, new TabInfo(tab.lastAccessed, groupId, tab.windowId, tab.discarded, hidden, tab.pinned));
    }
  }
}

async function onTabCreated(tabInfo) {
  let groupId = await browser.sessions.getWindowValue(tabInfo.windowId, "active-group-id");
  await browser.sessions.setTabValue(tabInfo.id, "group-id", groupId);
  _tabInfo.set(tabInfo.id, new TabInfo(tabInfo.lastAccessed, groupId, tabInfo.windowId));
  await setActiveGroupIcon(tabInfo.id, groupId);
  postMessage({
    method: "onTabCreated",
    data: tabInfo
  });
}

function _upsertTab(tabId, groupId, windowId) {
  let tabInfo = _tabInfo.get(tabId);
  if(tabInfo) {
    tabInfo.lastAccessed = new Date().getTime();
    tabInfo.groupId = groupId;
    tabInfo.windowId = windowId;
  }
  else {
    browser.tabs.get(tabId).then((tabInfo) => {
      _tabInfo.set(tabId, new TabInfo(new Date().getTime(), groupId, windowId, tabInfo.discarded, false, tabInfo.pinned));
    });
  }
}

async function onTabActive(activeInfo) {
  let groupId = await browser.sessions.getTabValue(activeInfo.tabId, "group-id");
  let activeGroupId = await browser.sessions.getWindowValue(activeInfo.windowId, "active-group-id");
  if(groupId !== activeGroupId) {
    dispatchGroupSwitch(activeInfo.tabId, activeInfo.windowId, activeGroupId, groupId);
  }

  await setActiveGroupIcon(activeInfo.tabId, groupId);
  _upsertTab(activeInfo.tabId, groupId, activeInfo.windowId);
}

function onTabRemoved(tabId, removeInfo) {
  _tabInfo.delete(tabId);
}

async function onTabAttach(tabId, attachInfo) {
  let activeGroupId = await browser.sessions.getWindowValue(attachInfo.newWindowId, "active-group-id");
  await browser.sessions.setTabValue(tabId, "group-id", activeGroupId);
  _upsertTab(tabId, groupId, attachInfo.newWindowId);
  await setActiveGroupIcon(tabId, activeGroupId);
}

function onTabUpdate(tabId, changeInfo, tabInfo) {
  let groupInfo = _tabInfo.get(tabId);
  if(!groupInfo) {
    return;
  }

  // https://bugzilla.mozilla.org/show_bug.cgi?id=1430620
  if(tabInfo.active) {
    setActiveGroupIcon(tabId, groupInfo.groupId);
  }

  if(changeInfo.hasOwnProperty("discarded")) {
    groupInfo.discarded = changeInfo.discarded;
  }

  if(changeInfo.hasOwnProperty("pinned")) {
    groupInfo.pinned = changeInfo.pinned;
  }

  if(changeInfo.hasOwnProperty("hidden")) {
    groupInfo.hidden = changeInfo.hidden;
  }
}

function onWindowRemoved(windowId) {
  _ports.delete(windowId);
}

function onSettingChange(changes, area) {
  if(changes.hasOwnProperty("openSidebarOnClick")) {
    _openSidebarOnClick = changes.openSidebarOnClick.newValue;
  }

  if(changes.hasOwnProperty("discardOnGroupChange")) {
    _discardOnGroupChange = changes.discardOnGroupChange.newValue;
  }

  if(changes.hasOwnProperty("hideOnGroupChange")) {
    _hideOnGroupChange = changes.hideOnGroupChange.newValue;
    changeAllTabVisbility(_hideOnGroupChange);
  }

  if(changes.hasOwnProperty("groups")) {
    _groups = changes.groups.newValue;
    browser.tabs.query({active: true}).then((tabs) => {
      tabs.forEach((t) => {
        let groupInfo = _tabInfo.get(t.id);
        if(groupInfo) {
          setActiveGroupIcon(t.id, groupInfo.groupId);
        }
      });
    });
    browser.menus.removeAll().then(() => {
      createContextMenus();
    });
  }
}

async function onMenuClicked(info, tab) {
  let oldGroupId = await browser.sessions.getTabValue(tab.id, "group-id");
  if(oldGroupId === info.menuItemId) {
    return;
  }

  await moveTabToGroup({
    tabId: tab.id,
    groupId: info.menuItemId,
    windowId: tab.windowId
  }, false);
}

async function onCommand(command) {
  let windowInfo = await browser.windows.getLastFocused({populate: false, windowTypes: ["normal"]});
  if(command == "new-group") {
    await createGroup(windowInfo.id);
  }
  else if(command == "switch-active") {
    let newGroupId = _activeGroupCache.get(windowInfo.id);
    await switchGroup(windowInfo.id, newGroupId);
  }
  else if(command == "switch-prev" || command == "switch-next") {
    let currentGroupId = await browser.sessions.getWindowValue(windowInfo.id, "active-group-id");
    let index = _groups.findIndex((g) => g.uuid === currentGroupId);
    if(index !== -1) {
      let newIndex = index + (command == "switch-prev" ? -1 : +1);
      let groupId = newIndex >= _groups.length || newIndex < 0 ? null : _groups[newIndex].uuid;
      await switchGroup(windowInfo.id, groupId);
    }
  }
  else {
    // the rest are switch-<number>
    // so just strip off the switch- and parse the number
    let index = parseInt(command.slice(7), 10) - 1;
    let groupId = index >= _groups.length || index < 0 ? null : _groups[index].uuid;
    await switchGroup(windowInfo.id, groupId);
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
browser.menus.onClicked.addListener(onMenuClicked);
browser.windows.onRemoved.addListener(onWindowRemoved);
browser.browserAction.onClicked.addListener(onClicked);
browser.storage.onChanged.addListener(onSettingChange);
browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"])
browser.commands.onCommand.addListener(onCommand);
