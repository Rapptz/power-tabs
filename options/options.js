class GroupSetting {
  constructor(allGroups, index) {
    let data = allGroups[index];
    this.name = data.name;
    this.uuid = data.uuid;
    this.index = index;
    this.allGroups = allGroups;
    this._hasAssignedDomain = false;
    this.buildView();
  }

  get data() {
    return this.allGroups[this.index];
  }

  save() {
    browser.storage.local.set({groups: this.allGroups});
  }

  saveNewName() {
    let newText = this._nameEdit.value.trim();
    if(newText) {
      if(this.name !== newText) {
        this._nameEdit.classList.remove("invalid");
        this.data.name = newText;
        this.name = newText;
        this._header.textContent = `Group Settings – ${newText}`;
        this.save();
      }
    }
    else {
      this._nameEdit.classList.add("invalid");
    }
  }

  buildView() {
    var templ = document.getElementById("group-template").content.cloneNode(true);

    this._header = templ.getElementById("groupHeader");
    this._header.id = "";
    this._header.textContent = `Group Settings – ${this.name}`;

    let nameEdit = templ.getElementById("groupName");
    nameEdit.id = "";
    nameEdit.value = this.name;
    this._nameEdit = nameEdit;

    nameEdit.addEventListener("blur", (e) => {
      this.saveNewName();
    });

    nameEdit.addEventListener("keyup", (e) => {
      e.preventDefault();
      if(e.key == "Enter") {
        this.saveNewName();
      }
    });

    let colourEdit = templ.getElementById("groupColour");
    colourEdit.id = "";
    colourEdit.value = this.data.hasOwnProperty("colour") ? this.data.colour : '#000000';

    colourEdit.addEventListener("change", (e) => {
      this.data.colour = colourEdit.value;
      this.save();
    });

    let assignedDomains = templ.getElementById("assignedDomains");
    assignedDomains.id = "";
    this._assignedDomains = assignedDomains;

    assignedDomains.addEventListener("keydown", (e) => {
      if(e.key === "Delete") {
        let selected = [...assignedDomains.children].filter((n) => n.selected).map((n) => {
          assignedDomains.removeChild(n);
          return n.getAttribute("data-key");
        });
        browser.storage.local.remove(selected);
      }
    });

    this.view = templ;
  }

  addAssignment(domainName) {
    let option = document.createElement("option");
    option.className = "assignment";
    option.textContent = domainName;
    option.setAttribute("data-key", `page:${domainName}`);
    this._assignedDomains.appendChild(option);
  }
}

function loadGroupSettings(data) {
  var groupSettings = document.getElementById("group-settings");
  var lookup = new Map();

  if(!data.hasOwnProperty("groups")) {
    let el = document.createElement("p");
    el.innerText = "Seems we don't have anything here...";
    groupSettings.appendChild(el);
    return;
  }

  for(let index = 0; index < data.groups.length; ++index) {
    let setting = new GroupSetting(data.groups, index);
    lookup.set(data.groups[index].uuid, setting);
    groupSettings.appendChild(setting.view);
  }

  // check for page assignments
  for(let key of Object.keys(data)) {
    if(key.indexOf("page:") !== 0) {
      continue;
    }

    let setting = lookup.get(data[key].group);
    if(setting) {
      setting.addAssignment(key.slice(5));
    }
  }
}

function saveSettings(key, value) {
  let obj = {};
  obj[key] = value;
  browser.storage.local.set(obj);
}

function loadRegularSettings(data) {
  let reverseTabDisplay = document.getElementById("reverseTabDisplay");
  reverseTabDisplay.checked = data.reverseTabDisplay;
  reverseTabDisplay.addEventListener("click", (e) => {
    saveSettings("reverseTabDisplay", reverseTabDisplay.checked);
  });

  let openSidebarOnClick = document.getElementById("openSidebarOnClick");
  openSidebarOnClick.checked = data.openSidebarOnClick;
  openSidebarOnClick.addEventListener("click", (e) => {
    saveSettings("openSidebarOnClick", openSidebarOnClick.checked);
  });

}

async function loadSettings() {
  let data = await browser.storage.local.get();
  loadRegularSettings(data);
  loadGroupSettings(data);
}

document.addEventListener("DOMContentLoaded", loadSettings);
