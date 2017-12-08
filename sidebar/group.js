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
    this._selected = [];
    this._previousDrop = null;
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

    details.addEventListener("dragenter", (e) => {
      // e.preventDefault();
      if(e.target !== this._listView && e.target.classList) {
        e.target.classList.add("drop-target");

        // can't use dragleave because it's buggy
        if(this._previousDrop) {
          this._previousDrop.classList.remove("drop-target");
        }
        this._previousDrop = e.target;
      }
    });

    details.addEventListener("drop", (e) => {
      if(this._previousDrop) {
        this._previousDrop.classList.remove("drop-target");
      }
    })

    details.addEventListener("dragleave", (e) => {
      // e.preventDefault();
      if(e.target === this.view) {
        this.view.classList.remove("drop-target");
      }
    });

    details.addEventListener("click", (e) => this.onClick(e));

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
    details.appendChild(summary);
    details.appendChild(list);
  }

  getRightBefore(tabIndex) {
    let i = 0;
    for(; i < this.tabs.length; ++i) {
      if(this.tabs[i].index >= tabIndex) {
        break;
      }
    }
    i = Math.max(i - 1, 0);
    return this.tabs[i] || null;
  }

  _sortSelected() {
    this._selected.sort((a, b) => a.index - b.index);
  }

  get selectedCount() {
    return this._selected.length;
  }

  styleSelectedDragStart(value) {
    for(let e of this._selected) {
      e.view.classList.toggle("drag-target", value);
    }
  }

  popSelected() {
    // transform to a lookup of tab ID for selected tabs
    let toRetrieve = new Set(this._selected.map((t) => t.id));
    this.cleanSelected();

    let toReturn = [];
    this.tabs = this.tabs.filter((t) => {
      if(toRetrieve.has(t.id)) {
        toReturn.push(t);
        this._listView.removeChild(t.view);
        return false;
      }
      return true;
    });
    return toReturn;
  }

  addSelected(tab) {
    this._selected.push(tab);
    tab.view.classList.add("selected-tab");
  }

  removeSelected(tab) {
    let index = this._selected.indexOf(tab);
    if(index !== -1) {
      tab.view.classList.remove("selected-tab");
      this._selected.splice(index, 1);
    }
  }

  isSelected(tab) {
    return tab.active || this._selected.includes(tab);
  }

  clearSelected() {
    for(let tab of this._selected) {
      tab.view.classList.remove("selected-tab");
    }
    this._selected = [];
  }

  cleanSelected() {
    // same as clear except it keeps the active tab as selected if exists
    this.clearSelected();
    let entry = this.tabs.find((t) => t.active);
    if(entry) {
      this.addSelected(entry);
    }
  }

  _selectRange(begin, end) {
    // range is closed [begin, end]

    let trueEnd = Math.min(end + 1, this.tabs.length);
    let selectedTabs = new Set(this._selected.map((t) => t.id));
    for(; begin != trueEnd; ++begin) {
      let tab = this.tabs[begin];
      if(!selectedTabs.has(tab.id)) {
        this.addSelected(tab);
        selectedTabs.add(tab.id);
      }
    }
  }

  onClick(e) {
    let tabId = TabEntry.tabIdFromEvent(e);
    if(!tabId) {
      return;
    }

    if(this !== this.parent.activeGroup) {
      return;
    }

    let ctrlKey = e.ctrlKey || e.metaKey; // for MacOS

    let tabIndex = this.tabs.findIndex((t) => t.id == tabId);
    let tab = this.tabs[tabIndex];

    if(!tab || tab.aboutToClose) {
      return;
    }

    if(ctrlKey && e.shiftKey) {
      if(!this._selected.length) {
        return; // ctrl + shift + click only works if we have something selected
      }

      let anchor = this.tabs.indexOf(this._selected[0]);
      if(tabIndex > anchor) {
        this._selectRange(anchor, tabIndex);
      }
      else {
        this._selectRange(tabIndex, anchor);
      }
    }
    else if(ctrlKey) {
      if(this.isSelected(tab)) {
        this.removeSelected(tab);
      }
      else {
        this.addSelected(tab);
      }
    }
    else if(e.shiftKey) {
      let anchor = 0;
      if(this._selected.length == 0) {
        anchor = Math.max(this.tabs.findIndex((t) => t.active), 0);
      }
      else {
        anchor = this.tabs.indexOf(this._selected[0]);
      }

      this.clearSelected();
      if(tabIndex > anchor) {
        this._selectRange(anchor, tabIndex);
      }
      else if(tabIndex < anchor) {
        this._selectRange(tabIndex, anchor);
      }
      else {
        this.addSelected(tab);
      }
    }
    else {
      this.clearSelected();
      this.addSelected(tab);
    }

    this._sortSelected();
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

  async appendTabs(tabEntries, relativeTo) {
    if(!relativeTo) {
      for(let entry of tabEntries) {
        this.loadTab(entry);
        await browser.sessions.setTabValue(entry.id, "group-id", this.uuid);
      }
      return;
    }

    // get canonical sort order
    let relativeIndex = this.tabs.indexOf(relativeTo);
    let node = relativeTo.view.nextSibling;

    this.parent.beginBatchMove();

    for(let i = 0; i < tabEntries.length; ++i) {
      let entry = tabEntries[i];
      entry.group = this;
      this.tabs.splice(relativeIndex + i + 1, 0, entry);

      if(entry.active) {
        this.addSelected(entry);
      }

      this._listView.insertBefore(entry.view, node);
      node = entry.view.nextSibling;

      await browser.sessions.setTabValue(entry.id, "group-id", this.uuid);
    }

    // bulk move and update tabs to sort by our current position
    await browser.tabs.move(this.tabs.map((t) => t.id), {index: this.tabs[0].index});
    this.parent.endBatchMove();
    await this.parent.resync();
  }

  _getCanonicalOrder(tabEntries, relativeTo) {
    let canonicalOrder = new Map();
    let rollingCount = 0;
    let relativeIndex = this.tabs.indexOf(relativeTo);

    // pre-condition, relativeIndex !=== -1

    for(let i = 0; i <= relativeIndex; ++i) {
      canonicalOrder.set(this.tabs[i].id, rollingCount++);
    }

    for(var i = 0; i < tabEntries.length; ++i) {
      canonicalOrder.set(tabEntries[i].id, rollingCount++);
    }

    for(let i = relativeIndex + 1; i < this.tabs.length; ++i) {
      canonicalOrder.set(this.tabs[i].id, rollingCount++);
    }

    return canonicalOrder;
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

  toggleActive(tab, value) {
    this.active = value;
    tab.view.classList.toggle("active-tab", value);
    if(value) {
      this.addSelected(tab);
    }
    else {
      this.removeSelected(tab);
    }
  }

  tabIndex(tabId) {
    return this.tabs.findIndex((t) => t.id === tabId);
  }

  closeExcept(index) {
    let copy = this.tabs.concat();
    for(let i = 0; i < copy.length; ++i) {
      if(i === index) {
        continue;
      }
      copy[i].close();
    }
  }

  closeAbove(index) {
    let copy = this.tabs.concat();
    for(let i = 0; i < index; ++i) {
      copy[i].close();
    }
  }

  closeBelow(index) {
    let copy = this.tabs.concat();
    for(let i = index + 1; i < this.tabs.length; ++i) {
      copy[i].close();
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
