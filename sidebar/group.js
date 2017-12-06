var _disableEvent = (e) => { e.preventDefault(); e.stopPropagation(); };

class Group {
  constructor(args) {
    if(typeof args === "object") {
      this.name = args.name;
      this.uuid = args.uuid;
      this.open = args.open;
      this.active = args.active;
    }
    else {
      this.name = args;
      this.uuid = uuid4();
      this.open = true;
      this.active = false;
    }

    this.parent = null;
    this.tabs = [];
    this.buildView();
  }

  buildView() {
    let details = document.createElement("details");
    details.open = this.open;
    details.className = "tab-group";
    details.draggable = true;
    details.setAttribute("data-group-id", this.uuid);
    this.view = details;

    details.addEventListener("toggle", () => {
      this.open = details.open;
      this.parent.saveStorage();
    });

    // enable drag and drop of groups
    details.addEventListener("dragstart", (e) => {
      e.dataTransfer.dropEffect = "move";
      let dragData = {
        target_id: e.target.id,
        id: this.uuid
      };
      e.dataTransfer.setData("tab-data-type", "group");
      e.dataTransfer.setData("tab-data", JSON.stringify(dragData));
    });

    let summary = document.createElement("summary");
    summary.className = "tab-group-container";
    this._summaryView = summary;

    let summaryIcon = document.createElement("div");
    summaryIcon.className = "summary-icon";

    let summaryName = document.createElement("span");
    summaryName.className = "tab-group-name";
    summaryName.innerText = this.name;
    this._summaryNameView = summaryName;

    let editGroupName = document.createElement("input");
    editGroupName.type = "text";
    editGroupName.className = "tab-group-name";

    editGroupName.addEventListener("blur", (e) => {
      e.preventDefault();
      this._saveAndReplaceText(editGroupName.value);
    });

    editGroupName.addEventListener("keyup", (e) => {
      e.preventDefault();
      if(e.key == "Enter") {
        this._saveAndReplaceText(editGroupName.value);
        e.stopPropagation();
      }
    });

    this._editNameView = editGroupName;

    // add the add and edit icons
    let editWrapper = document.createElement("div");
    editWrapper.className = "tab-group-button";

    let editGroupButton = document.createElement("div");
    editGroupButton.className = "edit-group-button";
    editGroupButton.title = "Edit Group";
    editGroupButton.addEventListener("click", (e) => {
      e.preventDefault();
      this.showRenameGroup();
    });

    editWrapper.appendChild(editGroupButton);

    let newTabWrapper = document.createElement("div");
    newTabWrapper.className = "tab-group-button";

    let newTabButton = document.createElement("div");
    newTabButton.className = "group-new-tab-button";
    newTabButton.title = "New Tab";
    newTabButton.addEventListener("click", (e) => {
      e.preventDefault();
      this.parent.createTab({group: this});
    });

    newTabWrapper.appendChild(newTabButton);

    summary.appendChild(summaryIcon);
    summary.appendChild(summaryName);
    summary.appendChild(editWrapper);
    summary.appendChild(newTabWrapper);

    let list = document.createElement("div");
    list.className = "tab-group-list";
    this._listView = list;

    details.addEventListener("dragover", (e) => {
      let data = e.dataTransfer.getData("tab-data-type");
      if(!data || data !== "tab") {
        return;
      }

      this.view.classList.add("group-drag-target");
      e.preventDefault();
    });

    details.addEventListener("dragleave", (e) => {
      this.view.classList.remove("group-drag-target");
    });

    details.addEventListener("drop", (e) => {
      let data = JSON.parse(e.dataTransfer.getData("tab-data"));
      if(!data) {
        return;
      }

      let tab = this.parent.getTab(parseInt(data.id));
      if(!tab) {
        return;
      }

      if(tab.group !== this) {
        tab.detach();
        this.addTab(tab);
      }
      this.view.classList.remove("group-drag-target");
      e.preventDefault();
    });

    details.appendChild(summary);
    details.appendChild(list);
  }

  addTab(tabEntry, relativeTo) {
    tabEntry.group = this;
    if(!relativeTo) {
      this.tabs.push(tabEntry);
      this._listView.appendChild(tabEntry.view);
    }
    else {
      // insert right after the relative tab ID
      let relativeIndex = this.tabs.indexOf(relativeTo);
      if(relativeIndex == -1) {
        // weird just insert it to the bottom
        this.tabs.push(tabEntry);
        this._listView.appendChild(tabEntry.view);
      }
      else {
        this.tabs.splice(relativeIndex + 1, 0, tabEntry);
        this._listView.insertBefore(tabEntry.view, relativeTo.view.nextSibling);
      }
    }

    browser.sessions.setTabValue(tabEntry.id, "group-id", this.uuid);
  }

  loadTab(tabEntry) {
    tabEntry.group = this;
    this.tabs.push(tabEntry);
    this._listView.appendChild(tabEntry.view);
  }

  showRenameGroup() {
    this._toggleDetailEvents(true);
    this._editNameView.value = this.name;
    this._summaryView.replaceChild(this._editNameView, this._summaryNameView);
    this._editNameView.select();
  }

  attachTab(tabEntry, newPosition) {
    tabEntry.group = this;

    // get the first tab right after this position
    // sort it by position first
    let tabs = this.tabs.sort((a, b) => a.index - b.index);
    let i = 0;
    for(; i < tabs.length; ++i) {
      if(tabs[i].index >= newPosition) {
        break;
      }
    }

    let relativeTab = tabs[i];
    this.tabs.splice(i, 0, tabEntry);
    this._listView.insertBefore(tabEntry.view, relativeTab ? relativeTab.view : null);
    browser.sessions.setTabValue(tabEntry.id, "group-id", this.uuid);
  }

  repositionTab(tabId, newPosition) {
    let tabIndex = null;
    let toMoveIndex = null;
    this.sortByPosition();
    for(let i = 0; i < this.tabs.length; ++i) {
      if(tabIndex !== null && toMoveIndex !== null) {
        break;
      }

      let entry = this.tabs[i];
      if(tabIndex === null && entry.id == tabId) {
        tabIndex = i;
      }

      if(toMoveIndex === null && entry.index >= newPosition) {
        toMoveIndex = i;
      }
    }

    if(toMoveIndex === null) {
      toMoveIndex = newPosition > this.tabs[this.tabs.length - 1].index ? this.tabs.length : 0;
    }

    if(tabIndex === null) {
      return; // not sure what happened here
    }

    // move tab over to the proper position
    let tab = this.tabs[tabIndex];
    let relativeTab = this.tabs[toMoveIndex];
    this.tabs.splice(toMoveIndex, 0, this.tabs.splice(tabIndex, 1)[0]);

    let relativeNode = null;
    if(relativeTab) {
      if(toMoveIndex > tabIndex) {
        relativeNode = relativeTab.view.nextSibling;
      }
      else {
        relativeNode = relativeTab.view;
      }
    }
    this._listView.insertBefore(tab.view, relativeNode);
  }

  toggleActive(value) {
    this.active = value;
  }

  tabIndex(tabId) {
    return this.tabs.findIndex((t) => t.id === tabId);
  }

  closeAbove(index) {
    let copy = this.tabs.concat();
    for(let i = 0; i < index; ++i) {
      browser.tabs.remove(copy[i].id);
    }
  }

  closeBelow(index) {
    let copy = this.tabs.concat();
    for(let i = index + 1; i < this.tabs.length; ++i) {
      browser.tabs.remove(copy[i].id);
    }
  }

  removeTab(tabEntry) {
    let index = this.tabs.indexOf(tabEntry);
    if(index > -1) {
      this.tabs.splice(index, 1);
    }

    if(this === tabEntry.group) {
      this._listView.removeChild(tabEntry.view);
      // don't do this, it breaks the event flow due to races
      // tabEntry.group = null;
    }
  }

  sortByPosition() {
    this.tabs.sort((a, b) => a.index - b.index);
    for(let tab of this.tabs) {
      this._listView.appendChild(tab.view);
    }
  }

  async sortByKey(keyFunc) {
    let sorter = (lhs, rhs) => {
      let a = keyFunc(lhs);
      let b = keyFunc(rhs);
      if(typeof a === "string") {
        return a.localeCompare(b);
      }
      else {
        return a - b;
      }
    }

    let oldPositions = this.tabs.map((t) => t.index);
    this.tabs.sort(sorter);

    this.parent.beginBatchMove();

    // move the tabs over
    // maybe when we get tab hiding this could be a single function call
    for(let index = 0; index < this.tabs.length; ++index) {
      let tab = this.tabs[index];
      await browser.tabs.move(tab.id, { index: oldPositions[index] });
      tab.index = oldPositions[index];
      this._listView.appendChild(tab.view);
    }

    this.parent.endBatchMove();

    // unfortunately for tabs outside our group their positions might be messed
    // up, so we need to force re-sync with the current state
    await this.parent.resync();

    // the DOM repositioning might have put the active tab of this group out of view
    if(this.parent.activeGroup === this) {
      this.parent.scrollToActiveTab();
    }
  }

  _toggleDetailEvents(disable) {
    let f = disable ? this.view.addEventListener : this.view.removeEventListener;
    // disable all event processing on the <detail> tag
    for(let event of ["click", "keyup"]) {
      f(event, _disableEvent);
    }
  }

  _saveAndReplaceText(newName) {
    this.updateName(newName);
    // re-enable events on the <details> tag
    this._toggleDetailEvents(false);
    // remove the text edit node
    this._summaryView.replaceChild(this._summaryNameView, this._editNameView);
  }

  updateName(newName) {
    // don't update the name if the user input nothing
    if(newName) {
      this.name = newName;
      this._summaryNameView.innerText = newName;
      if(this.parent) {
        this.parent.saveStorage();
      }
    }
  }

  toJSON() {
    return {
      name: this.name,
      uuid: this.uuid,
      open: this.open,
      active: this.active
    };
  }

  static groupIdFromEvent(e) {
    let el = e.target;
    while(el) {
      if(el.nodeType == 1 && el.hasAttribute("data-group-id")) {
        return el.getAttribute("data-group-id");
      }
      el = el.parentNode;
    }
    return null;
  }

  getContextMenuItems(groupList) {

    /**
     * Add Tab
     * ---
     * Bookmark All Tabs
     * Reload All Tabs
     * Sort Tabs By
     * ---
     * Rename
     * Delete
     * ---
     * Options
     */

    let items = [
      {
        name: "Add Tab",
        onClick: (e) => this.parent.createTab({group: this})
      },
      { name: "separator" },
      {
        name: "Bookmark All Tabs",
        isEnabled: () => false,
        onClick: () => {}
      },
      {
        name: "Reload All Tabs",
        isEnabled: () => false,
        onClick: () => {}
      },
      {
        name: "Sort Tabs By",
        items: [
          {
            name: "URL",
            onClick: (e) => this.sortByKey((t) => t.url)
          },
          {
            name: "Title",
            onClick: (e) => this.sortByKey((t) => t.title)
          },
          {
            name: "Shuffle",
            onClick: (e) => this.sortByKey((t) => Math.floor(Math.random() * this.tabs.length * 100))
          }
        ]
      },
      { name: "separator" },
      {
        name: "Rename",
        onClick: (e) => this.showRenameGroup()
      },
      {
        name: "Delete",
        isEnabled: () => groupList.groupCount > 1,
        onClick: (e) => {
          if(this.tabs.length == 0 || window.confirm(`Are you sure? This will close ${this.tabs.length} tabs.`)) {
            groupList.removeGroup(this);
          }
        }
      }
    ];
    return items;
  }
}
