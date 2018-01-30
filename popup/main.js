let cache = new Map();
var currentTab = null;
var currentGroup = null;
var searchBar = document.getElementById("search");
var _selectedElement = searchBar;
var _allTabs = [];
var _lastSearch = "";
var _windowId = null;
var cancelSearch = document.getElementById("cancel-search-icon");
var groupContainer = document.getElementById("group-container");
var NEW_TAB_PAGES = new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
]);

// workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1324255
function stealFocus(e) {
  if(e.target === document) {
    searchBar.focus();
  }
  document.removeEventListener("focus", stealFocus);
}

document.addEventListener("focus", stealFocus);
// end workaround

function createIcon(favIconUrl) {
  let icon = document.createElement("div");
  icon.className = "tab-icon";
  let iconURL = favIconUrl || "/icons/favicon.svg";
  if(iconURL.indexOf("chrome://") === 0) {
    iconURL = "/icons/favicon.svg";
  }

  icon.style.backgroundImage = `url("${iconURL}")`;

  icon.addEventListener("error", () => {
    icon.style.backgroundImage = 'url("/icons/favicon.svg")';
  });
  return icon;
}

class Tab {
  constructor(data, parent) {
    this.data = data;
    this.id = data.id;
    this.url = data.url;
    this.title = data.title;
    this.group = parent;
    this.hidden = true;

    let tab = document.createElement("div");
    tab.classList.add("tab");

    this.view = tab;
    tab.setAttribute("data-selectable", 1);

    let groupBadge = document.createElement("div");
    groupBadge.textContent = String.fromCodePoint(parent.name.codePointAt(0));
    groupBadge.className = "group-badge";
    groupBadge.title = parent.name;
    setDefaultGroupColour(groupBadge, parent.colour);

    let icon = createIcon(data.hasOwnProperty('favIconUrl') ? data.favIconUrl : null);
    let name = document.createElement("div");
    name.classList.add("tab-name");
    name.classList.add("truncate-text");
    name.textContent = data.title;
    name.title = data.title;

    tab.appendChild(icon);
    tab.appendChild(name);
    tab.appendChild(groupBadge);

    tab.addEventListener("click", (e) => {
      e.preventDefault();
      this.setActive();
      e.stopPropagation();
    });
  }

  get lastAccessed() {
    return this.data.lastAccessed;
  }

  hide() {
    if(!this.hidden) {
      this.hidden = true;
      this.group.view.parentNode.removeChild(this.view);
    }
  }

  show() {
    if(this.hidden) {
      this.hidden = false;
      this.group.view.parentNode.appendChild(this.view);
    }
  }

  setActive() {
    browser.runtime.sendMessage({
      method: "forceGroupChange",
      groupId: this.group.uuid,
      tabId: this.id,
      windowId: _windowId
    }).then((after) => {
      currentTab = after;
      currentGroup = this.group;
      updateTabDisplay();
    });
  }

  matches(substr) {
    let regex = new RegExp(escapeRegex(substr), "i");
    return this.data.title.search(regex) !== -1 || this.data.url.search(regex) !== -1;
  }
};

class Group {
  constructor(data) {
    this.uuid = data.uuid || uuid4();
    this.name = data.name;
    this.open = data.open;
    this.active = data.active;
    this.colour = data.colour || '#000000';
    this.tabs = [];
  }

  addTab(tab) {
    this.tabs.push(new Tab(tab, this));
  }

  toJSON() {
    return {
      name: this.name,
      uuid: this.uuid,
      open: this.open,
      active: this.active,
      colour: this.colour
    };
  }

  getLatestTab() {
    if(this.tabs.length === 0) {
      return null;
    }

    if(this.tabs.length === 1) {
      return this.tabs[0];
    }

    let index = this.tabs.reduce((maxIndex, element, index, arr) => {
      return element.lastAccessed > arr[maxIndex].lastAccessed ? index : maxIndex
    }, 0);
    return this.tabs[index];
  }

  getFirstVisibleTab() {
    let foundIndex = this.tabs.findIndex((t) => !t.hidden);
    return foundIndex === -1 ? null : this.tabs[foundIndex];
  }

  hide() {
    this.view.classList.add("hidden");
  }

  show() {
    this.view.classList.remove("hidden");
  }

  setTabCount(c) {
    if(c == 1) {
      this._tabCount.textContent = "1 Tab";
    }
    else {
      this._tabCount.textContent = `${c} Tabs`;
    }
  }

  toggleHover(value) {
    if(value) {
      setHoverGroupColour(this._groupName, this.colour);
    }
    else {
      setDefaultGroupColour(this._groupName, this.colour);
    }
  }

  buildView() {
    this.view = document.createElement("div");
    this.view.className = "group";
    this.view.setAttribute("data-selectable", 1);
    this.view.setAttribute("data-group-id", this.uuid);

    let groupName = document.createElement("div");
    groupName.className = "group-name";
    groupName.textContent = this.name;
    this._groupName = groupName;

    setDefaultGroupColour(groupName, this.colour);
    groupName.addEventListener("mouseenter", (e) => {
      setHoverGroupColour(groupName, this.colour);
    });

    groupName.addEventListener("mouseleave", (e) => {
      setDefaultGroupColour(groupName, this.colour);
    });

    let tabCount = document.createElement("span");
    tabCount.className = "group-tab-count";
    tabCount.textContent = this.tabs.length;
    this._tabCount = tabCount;
    this.setTabCount(this.tabs.length);

    groupName.appendChild(tabCount);
    this._tabView = document.createElement("div");
    this._tabView.className = "tabs";
    this.view.appendChild(groupName);
    this.view.appendChild(this._tabView);

    this.view.addEventListener("click", (e) => {
      let tab = this.getLatestTab();
      if(tab) {
        tab.setActive();
      }
      else {
        browser.runtime.sendMessage({
          method: "createTab",
          windowId: _windowId,
          groupId: this.uuid
        }).then((response) => {
          this.addTab(response);
          this.setTabCount(this.tabs.length);
          currentTab = response;
          currentGroup = this;
          updateTabDisplay();
        });
      }
    });

    // for(let tab of this.tabs) {
    //   this._tabView.appendChild(tab.view);
    // }
  }
};

async function switchToLastActiveTab() {
  let tabs = await browser.tabs.query({windowId: browser.windows.WINDOW_ID_CURRENT, active: false});
  if(tabs.length > 0) {
    tabs.sort((a, b) => a.lastAccessed - b.lastAccessed);
    let tabId = tabs[tabs.length - 1].id;
    await browser.runtime.sendMessage({
      method: "forceGroupChange",
      groupId: await browser.sessions.getTabValue(tabId, "group-id"),
      tabId: tabId,
      windowId: _windowId
    });
    window.close();
  }
}

searchBar.addEventListener("keyup", (e) => {
  if(searchBar.value !== _lastSearch) {
    swapSelectedWith(searchBar);
  }

  _lastSearch = searchBar.value;
  cancelSearch.classList.toggle("hidden", searchBar.value.length == 0);

  let groups = Array.from(cache.values());
  _allTabs.forEach((t) => t.hide());
  groups.forEach((g) => g.show());

  if(searchBar.value.length !== 0) {
    groups.forEach((g) => g.hide());
    let filtered = fuzzyMatchTabObjects(searchBar.value, _allTabs);
    filtered.forEach(t => t.show());
  }

  if(e.key === "Enter") {
    // get the first tab result if we have a filter in place
    let activeTab = document.querySelector(".tab");

    if(activeTab !== null) {
      activeTab.click();
      window.close();
    }

    // if we haven't found a result then we should default to
    // the last accessed tab outside of our current one
    if(searchBar.value.length === 0) {
      switchToLastActiveTab();
    }
  }
});

cancelSearch.addEventListener("click", (e) => {
  searchBar.value = "";
  for(let g of cache.values()) {
    g.show();
    g.tabs.forEach((t) => t.hide());
  }
});

async function prepare() {
 let storage = await browser.storage.local.get("groups");
 if(!storage.hasOwnProperty("groups")) {
  // peculiar
  return;
 }

 for(let group of storage.groups) {
  let g = new Group(group);
  cache.set(g.uuid, g);
 }

  let tabs = await browser.tabs.query({windowId: browser.windows.WINDOW_ID_CURRENT});
  for(let tab of tabs) {
    let groupId = await browser.sessions.getTabValue(tab.id, "group-id");
    let group = cache.get(groupId);
    if(group) {
      group.addTab(tab);
    }
    if(tab.active) {
      currentTab = tab;
      currentGroup = group;
    }
  }

  updateTabDisplay();
  updateGroupDisplay();
  _allTabs = [].concat.apply([], Array.from(cache.values()).map(g => g.tabs));
}

var checkbox = document.getElementById("always-open");

checkbox.addEventListener("click", (e) => {
  setDomainAssignment(checkbox.checked);
});

document.getElementById("new-group-button").addEventListener("click", async (e) => {
  browser.runtime.sendMessage({
    method: "createGroup",
    windowId: _windowId
  }).then((groupInfo) => {
    cache.set(groupInfo.uuid, new Group(groupInfo));
    updateGroupDisplay();
  })
});

document.getElementById("settings-button").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

async function updateTabDisplay() {
  let tabInfo = document.getElementById("tab-info");
  while(tabInfo.lastChild) {
    tabInfo.removeChild(tabInfo.lastChild);
  }
  checkbox.checked = false;
  checkbox.setAttribute("disabled", "1");

  _windowId = currentTab.windowId;
  let name = document.createElement("div");
  name.textContent = currentTab.title;
  name.title = currentTab.title;
  name.classList.add("tab-title");
  name.classList.add("truncate-text");

  let icon = createIcon(currentTab.hasOwnProperty('favIconUrl') ? currentTab.favIconUrl : null);

  tabInfo.appendChild(icon);
  tabInfo.appendChild(name);

  let label = document.getElementById("always-open-label");

  // to get the group name we need to first get the group ID associated
  // with the tab and then look up that group ID in our localStorage
  let groupNameLabel = document.getElementById("group-name");
  let domainName = new URL(currentTab.url).hostname;
  if(!domainName || NEW_TAB_PAGES.has(currentTab.url)) {
    label.textContent = "Cannot assign to this page.";
    groupNameLabel.textContent = currentGroup.name;
    return;
  }


  let key = `page:${domainName}`;
  let assignedToGroup = await browser.storage.local.get(key);
  if(assignedToGroup.hasOwnProperty(key)) {
    checkbox.checked = assignedToGroup[key].group === currentGroup.uuid;
  }

  let text = `Always open ${domainName} in ${currentGroup.name}`;
  label.textContent = text;
  label.title = text;
  groupNameLabel.textContent = currentGroup.name;
  checkbox.removeAttribute("disabled");
}

function updateGroupDisplay() {
  while(groupContainer.lastChild) {
    groupContainer.removeChild(groupContainer.lastChild);
  }

  for(let group of cache.values()) {
    group.buildView();
    groupContainer.appendChild(group.view);
  }
}

async function setDomainAssignment(add) {
  let domainName = new URL(currentTab.url).hostname;
  let key = `page:${domainName}`;
  let previous = await browser.storage.local.get(key);

  if(add) {
    if(previous.hasOwnProperty(key)) {
      // already existed prior so just overwrite the value
      previous[key].group = currentGroup.uuid;
    }
    else {
      previous[key] = { group: currentGroup.uuid };
    }
    await browser.storage.local.set(previous);
  }
  else {
    // only actually delete the key if it existed and it was set to this group
    if(previous.hasOwnProperty(key) && previous[key].group === currentGroup.uuid) {
      await browser.storage.local.remove(key);
    }
  }
}

prepare();

function swapSelectedWith(node) {
  // remove the hover colour from the active group
  if(_selectedElement.hasAttribute("data-group-id")) {
    let group = cache.get(_selectedElement.getAttribute("data-group-id"));
    group.toggleHover(false);
  }


  // add the hover colour to the new active group (if applicable)
  if(node.hasAttribute("data-group-id")) {
    let group = cache.get(node.getAttribute("data-group-id"));
    group.toggleHover(true);
  }

  _selectedElement.classList.remove("selected");
  node.classList.add("selected");
  _selectedElement = node;
}

// allow group and tab browsing with arrow keys and enter
document.addEventListener("keydown", (e) => {
   if(e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") {
    return;
  }

  if(e.key == "Enter" && _selectedElement !== searchBar) {
    // simulate a click and propagate to the proper onclick handler
    _selectedElement.click();
    swapSelectedWith(searchBar);
    window.close();
  }

  let up = e.key == "ArrowUp";
  if(e.target.hasAttribute("data-selectable")){
    e.preventDefault();
    let elements = [...document.querySelectorAll("[data-selectable]:not(.hidden)")];
    let index = elements.indexOf(_selectedElement);
    let newElement = elements[index + (up ? -1 : +1)];
    if(newElement !== undefined) {
      swapSelectedWith(newElement);
      let rect = newElement.getBoundingClientRect();
      if(rect.top < 0 || rect.top > window.innerHeight) {
        window.scrollTo(0, rect.top + document.body.scrollTop);
      }
    }
  }
});

document.addEventListener("click", (e) => {
  swapSelectedWith(searchBar);
});
