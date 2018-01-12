var currentTab = null;
var currentGroup = null;
var NEW_TAB_PAGES = new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
]);

browser.tabs.query({active: true, windowId: browser.windows.WINDOW_ID_CURRENT}).then((tabs) => {
  if(tabs.length > 0) {
    currentTab = tabs[0];
    updateTabDisplay();
  }
});

var checkbox = document.getElementById("always-open");

checkbox.addEventListener("click", (e) => {
  setDomainAssignment(checkbox.checked);
});

async function updateTabDisplay() {
  let tabInfo = document.getElementById("tab-info");

  let icon = document.createElement("div");
  icon.className = "tab-icon";
  let iconURL = currentTab.favIconUrl || "../icons/favicon.svg";
  icon.style.backgroundImage = `url("${iconURL}")`;

  icon.addEventListener("error", () => {
    icon.style.backgroundImage = 'url("/icons/favicon.svg")';
  });

  let name = document.createElement("div");
  name.textContent = currentTab.title;
  name.title = currentTab.title;
  name.classList.add("tab-title");
  name.classList.add("truncate-text");

  tabInfo.appendChild(icon);
  tabInfo.appendChild(name);

  let label = document.getElementById("always-open-label");

  // to get the group name we need to first get the group ID associated
  // with the tab and then look up that group ID in our localStorage

  let groupId = await browser.sessions.getTabValue(currentTab.id, "group-id");
  let storage = await browser.storage.local.get("groups");
  if(!storage.hasOwnProperty("groups")) {
    return;
  }

  let groupNameLabel = document.getElementById("group-name");

  currentGroup = storage.groups.find((g) => g.uuid === groupId);
  if(currentGroup === null) {
    // not sure how this happened
    label.textContent = "Unable to find group...";
    groupNameLabel.textContent = "?";
    return;
  }

  let domainName = new URL(currentTab.url).hostname;
  if(!domainName || NEW_TAB_PAGES.has(currentTab.url)) {
    label.textContent = "Cannot assign to this page.";
    groupNameLabel.textContent = currentGroup.name;
    return;
  }


  let key = `page:${domainName}`;
  let assignedToGroup = await browser.storage.local.get(key);
  if(assignedToGroup.hasOwnProperty(key)) {
    checkbox.checked = assignedToGroup[key].group === groupId;
  }

  let text = `Always open ${domainName} in ${currentGroup.name}`;
  label.textContent = text;
  label.title = text;
  groupNameLabel.textContent = currentGroup.name;
  checkbox.removeAttribute("disabled");
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
