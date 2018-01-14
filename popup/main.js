let cache = new Map();
var currentTab = null;
var currentGroup = null;
var searchBar = document.getElementById("search");
var cancelSearch = document.getElementById("cancel-search-icon");
var groupContainer = document.getElementById("group-container");
var NEW_TAB_PAGES = new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
]);

function createIcon(favIconUrl) {
  let icon = document.createElement("div");
  icon.className = "tab-icon";
  let iconURL = favIconUrl || "/icons/favicon.svg";
  icon.style.backgroundImage = `url("${iconURL}")`;

  icon.addEventListener("error", () => {
    icon.style.backgroundImage = 'url("/icons/favicon.svg")';
  });
  return icon;
}

class Tab {
  constructor(data) {
    this.data = data;

    let tab = document.createElement("div");
    tab.classList.add("tab");
    tab.classList.add("hidden");

    this.view = tab;

    let icon = createIcon(data.hasOwnProperty('favIconUrl') ? data.favIconUrl : null);
    let name = document.createElement("div");
    name.classList.add("tab-name");
    name.classList.add("truncate-text");
    name.textContent = data.title;
    name.title = data.title;

    tab.appendChild(icon);
    tab.appendChild(name);

    tab.addEventListener("click", (e) => {
      e.preventDefault();
      browser.tabs.update(this.id, {active: true});
      e.stopPropagation();
    });
  }

  get lastAccessed() {
    return this.data.lastAccessed;
  }

  get id() {
    return this.data.id;
  }

  hide() {
    this.view.classList.add("hidden");
  }

  show() {
    this.view.classList.remove("hidden");
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
    this.tabs.push(new Tab(tab));
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

  checkSubstring(substring) {
    if(substring.length == 0) {
      return;
    }

    let filtered = 0;
    for(let tab of this.tabs) {
      if(tab.matches(substring)) {
        tab.show();
        ++filtered;
      }
    }
    this.setTabCount(filtered);
  }

  hideAll() {
    this.tabs.forEach((t) => t.hide());
    this.setTabCount(this.tabs.length);
  }

  setTabCount(c) {
    if(c == 1) {
      this._tabCount.textContent = "1 Tab";
    }
    else {
      this._tabCount.textContent = `${c} Tabs`;
    }
  }

  buildView() {
    this.view = document.createElement("div");
    this.view.className = "group";

    let groupName = document.createElement("div");
    groupName.className = "group-name";
    groupName.textContent = this.name;

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
        browser.tabs.update(tab.id, {active: true}).then((after) => {
          currentTab = after;
          currentGroup = this;
          updateTabDisplay();
        });
      }
    });

    for(let tab of this.tabs) {
      this._tabView.appendChild(tab.view);
    }
  }
};

searchBar.addEventListener("keyup", (e) => {
  cancelSearch.classList.toggle("hidden", searchBar.value.length == 0);
  for(let g of cache.values()) {
    g.hideAll();
    g.checkSubstring(searchBar.value);
  }
});

cancelSearch.addEventListener("click", (e) => {
  searchBar.value = "";
  for(let g of cache.values()) {
    g.hideAll();
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
}

var checkbox = document.getElementById("always-open");

checkbox.addEventListener("click", (e) => {
  setDomainAssignment(checkbox.checked);
});

document.getElementById("new-group-button").addEventListener("click", async (e) => {
  let storage = await browser.storage.local.get("groups");
  if(!storage.hasOwnProperty("groups")) {
    return; // ?
  }

  let newGroup = new Group({
    name: "untitled",
    uuid: null,
    open: false,
    active: false,
    colour: null
  });

  cache.set(newGroup.uuid, newGroup);
  storage.groups.push(newGroup.toJSON());
  await browser.storage.local.set(storage);
  updateGroupDisplay();
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
