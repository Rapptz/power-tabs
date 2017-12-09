class GroupSetting {
  constructor(allGroups, index) {
    let data = allGroups[index];
    this.name = data.name;
    this.uuid = data.uuid;
    this.filters = data.filters;
    this.index = index;
    this.allGroups = allGroups
    this.buildView();
  }

  get data() {
    return this.allGroups[this.index];
  }

  save() {
    browser.storage.local.set({groups: this.allGroups});
  }

  buildView() {
    var templ = document.getElementById("group-template").content.cloneNode(true);

    this._header = templ.getElementById("groupHeader");
    this._header.id = "";
    this._header.innerText = this.name;

    let nameEdit = templ.getElementById("groupName");
    nameEdit.id = "";
    nameEdit.value = this.name;
    this._nameEdit = nameEdit;

    let saveButton = templ.getElementById("saveName");
    saveButton.id = "";

    saveButton.addEventListener("click", (e) => {
      let newText = this._nameEdit.value.trim();
      if(newText && this.name !== newText) {
        this._nameEdit.classList.remove("invalid");
        this.data.name = newText;
        this.name = newText;
        this._header.innerText = newText;
        this.save();
      }
      else {
        this._nameEdit.classList.add("invalid");
      }
    });

    this.view = templ;
  }

  addView(parent) {
    // parent.appendChild(this._header);
    parent.appendChild(this.view);
  }
}

async function loadSettings() {
  var groupSettings = document.getElementById("group-settings");

  let data = await browser.storage.local.get("groups");
  if(!data.hasOwnProperty("groups")) {
    let el = document.createElement("p");
    el.innerText = "Seems we don't have anything here...";
    groupSettings.appendChild(el);
    return;
  }

  for(let index = 0; index < data.groups.length; ++index) {
    let setting = new GroupSetting(data.groups, index);
    setting.addView(groupSettings);
  }
}

document.addEventListener("DOMContentLoaded", loadSettings);
