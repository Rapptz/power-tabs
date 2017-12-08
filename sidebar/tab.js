class TabEntry {
  constructor(tabInfo) {
    this.id = tabInfo.id;
    this.title = tabInfo.title;
    this.favIconUrl = tabInfo.favIconUrl;
    this.url = tabInfo.url;
    this.pinned = tabInfo.pinned;
    this.mutedInfo = tabInfo.mutedInfo;
    this.audible = tabInfo.audible;
    this.sessionId = tabInfo.sessionId;
    this.index = tabInfo.index;
    this.active = tabInfo.active;
    this.discarded = tabInfo.discarded;
    this.visible = true; /* maybe */
    this.group = null;
    this.aboutToClose = false;
    this.buildView();
  }

  buildView() {
    let tab = document.createElement("div");
    tab.classList.add("tab-entry");
    tab.draggable = true;
    tab.setAttribute("data-tab-id", this.id);
    if(this.discarded) {
      tab.classList.add("discarded-tab");
    }

    tab.addEventListener("click", (e) => {
      // if we have any modifier keys or other buttons then do nothing
      if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      // don't change tab if we're closing the tab
      if(this.aboutToClose) {
        return;
      }

      this.changeTab()
    });

    tab.title = this.title;

    this.view = tab;

    let icon = document.createElement("div");
    icon.className = "tab-icon";
    this._iconView = icon;
    this.updateIcon(this.favIconUrl);

    let titleView = document.createElement("span");
    titleView.className = "tab-title";

    titleView.innerText = this.title;
    this._titleView = titleView;

    let closeButton = document.createElement("div");
    closeButton.className = "tab-close-button";
    closeButton.title = "Close Tab";

    closeButton.addEventListener("click", () => this.close());

    let audibleIcon = document.createElement("div");
    audibleIcon.className = "tab-audible-icon";
    audibleIcon.addEventListener("click", (e) => {
      this.muted ? this.unmute() : this.mute();
    });

    this._audibleIcon = audibleIcon;

    if(!this.audible) {
      audibleIcon.style.display = "none";
    }

    if(this.muted) {
      audibleIcon.classList.add("muted");
    }

    tab.appendChild(icon);
    tab.appendChild(closeButton);
    tab.appendChild(audibleIcon);
    tab.appendChild(titleView);
  }

  get muted() {
    return this.mutedInfo.muted;
  }

  static tabIdFromEvent(e) {
    let el = e.target;
    while(el) {
      if(el.nodeType == 1 && el.hasAttribute("data-tab-id")) {
        return parseInt(el.getAttribute("data-tab-id"));
      }
      el = el.parentNode;
    }
    return null;
  }

  get tabIndex() {
    if(!this.group) {
      return -1;
    }
    return this.group.tabIndex(this.id);
  }

  getContextMenuItems(groupList) {
    let items = [];

    items.push({
      name: "Reload Tab",
      onClick: (e) => this.reload()
    });

    if(this.muted) {
      items.push({
        name: "Unmute Tab",
        onClick: (e) => this.unmute()
      });
    }
    else {
      items.push({
        name: "Mute Tab",
        onClick: (e) => this.mute()
      });
    }

    items.push({name: "separator"});
    if(this.pinned) {
      items.push({
        name: "Unpin Tab",
        onClick: (e) => this.unpin()
      });
    }
    else {
      items.push({
        name: "Pin Tab",
        onClick: (e) => this.pin()
      });
    }

    items.push({
      name: "Duplicate Tab",
      onClick: (e) => this.duplicate()
    });

    items.push({
      name: "Move To",
      items: [
        {
          name: "New Window",
          onClick: (e) => this.moveToNewWindow()
        },
        {
          name: "separator"
        }
      ].concat(groupList.groups.map((x) => {
        let g = x;
        return {
          name: g.name,
          isEnabled: () => this.group.uuid !== g.uuid,
          onClick: (e) => this.attachToNewGroup(g)
        };
      }))
    });

    items.push({name: "separator"});

    items.push({
      name: "Close Tabs Above",
      isEnabled: () => this.tabIndex > 0,
      onClick: (e) => this.group.closeAbove(this.tabIndex)
    });

    items.push({
      name: "Close Tabs Below",
      isEnabled: () => this.tabIndex !== (this.group.tabs.length - 1),
      onClick: (e) => this.group.closeBelow(this.tabIndex)
    });

    items.push({
      name: "Close Other Tabs",
      isEnabled: () => this.group.tabs.length >= 2,
      onClick: (e) => this.group.closeExcept(this.tabIndex)
    });

    items.push({name: "separator"});
    items.push({
      name: "Undo Close Tab",
      isEnabled: () => false,
      onClick: (e) => {}
    });

    items.push({
      name: "Close Tab",
      onClick: (e) => this.close()
    });

    return items;
  }

  /* these functions are for the context menu */

  reload() {
    return browser.tabs.reload(this.id);
  }

  mute() {
    return browser.tabs.update(this.id, {muted: true});
  }

  unmute() {
    return browser.tabs.update(this.id, {muted: false});
  }

  pin() {
    return browser.tabs.update(this.id, {pinned: true});
  }

  unpin() {
    return browser.tabs.update(this.id, {pinned: false});
  }

  duplicate() {
    return browser.tabs.duplicate(this.id);
  }

  close() {
    this.aboutToClose = true;
    return browser.tabs.remove(this.id);
  }

  moveToNewWindow() {
    return browser.windows.create({ tabId: this.id });
  }

  attachToNewGroup(group) {
    this.detach();
    let relativeTab = group.getRightBefore(this.index);
    group.addTab(this, relativeTab);
  }

  /* end context menu functions */

  hide() {
    this.visible = false;
    this.view.classList.add("hidden");
  }

  show() {
    this.visible = true;
    this.view.classList.remove("hidden");
  }

  toggleVisibility(value) {
    value ? this.show() : this.hide();
  }

  toggleActive(value) {
    this.active = value;
    if(this.group) {
      this.group.toggleActive(this, value);
    }
    if(value) {
      this.scrollTo();
    }
  }

  scrollTo() {
    if(!isElementInViewport(this.view)) {
      this.view.scrollIntoView({block: "center", inline: "nearest"});
    }
  }

  matchesTitle(substring) {
    return this.title.search(new RegExp(escapeRegex(substring), "i")) !== -1;
  }

  shouldHide(query) {
    let regex = new RegExp(escapeRegex(query), "i");
    return this.title.search(regex) !== -1 || this.url.search(regex) !== -1;
  }

  changeTab() {
    browser.tabs.update(this.id, { active: true });
  }

  update(changeInfo) {
    if(changeInfo.hasOwnProperty("status")) {
      this._iconView.classList.toggle("loading", changeInfo.status === "loading");
    }

    if(changeInfo.hasOwnProperty("pinned")) {
      this.pinned = changeInfo.pinned;
    }

    if(changeInfo.hasOwnProperty("favIconUrl")) {
      this.updateIcon(changeInfo.favIconUrl);
    }

    if(changeInfo.hasOwnProperty("title")) {
      this.updateTitle(changeInfo.title);
    }

    if(changeInfo.hasOwnProperty("url")) {
      this.url = changeInfo.url;
    }

    if(changeInfo.hasOwnProperty("audible")) {
      this.audible = changeInfo.audible;
      this._audibleIcon.style.display = changeInfo.audible ? "initial" : "none";
    }

    if(changeInfo.hasOwnProperty("mutedInfo")) {
      this.mutedInfo = changeInfo.mutedInfo;
      this._audibleIcon.classList.toggle("muted", this.muted);
    }

    if(changeInfo.hasOwnProperty("discarded")) {
      this.discarded = changeInfo.discarded;
      this.view.classList.toggle("discarded-tab", changeInfo.discarded);
    }

    if(changeInfo.hasOwnProperty("index")) {
      this.index = changeInfo.index;
    }
  }

  detach() {
    if(this.group) {
      this.group.removeTab(this);
    }
  }

  updateTitle(title) {
    this.title = title;
    this._titleView.innerText = title;
  }

  updateIcon(icon) {
    let url = icon || "../icons/favicon.svg";
    this._iconView.style.backgroundImage = `url("${url}")`;
  }
}

function isElementInViewport(el) {
  let rect = el.getBoundingClientRect();
  let width = window.innerWidth || document.documentElement.clientWidth;
  let height = window.innerHeight || document.documentElement.clientHeight;
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= height && rect.right <= width;
}
