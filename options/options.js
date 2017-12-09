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
    this._header = document.createElement("h2");
    this._header.className = "header";
    this._header.innerText = this.name;

    let form = document.createElement("div");
    form.className = "options";

    /*
      <div class="options">
        <div class="group-name-container">
          <span class="group-name-label">Group Name</span>
          <input type="text">
          <button>Save</button>
        </div>
        <h3>Filters</h3>
        <div class="add-filter">
          <input type="text">
          <button>Add Filter</button>
        </div>

        <div class="filters">
          <div class="filter">
            <input type="text" disabled="true">
            <div class="filter-close"></div>
          </div>
          ...
        </div>
      </div>
    */

    let groupNameContainer = document.createElement("div");
    groupNameContainer.className = "group-name-container";

    let label = document.createElement("span");
    label.className = "group-name-label";
    label.innerText = "Group Name";

    let nameEdit = document.createElement("input");
    nameEdit.type = "text";
    nameEdit.value = this.name;
    this._nameEdit = nameEdit;

    let saveButton = document.createElement("button");
    saveButton.innerText = "Save";

    saveButton.addEventListener("click", (e) => {
      let newText = this._nameEdit.value.trim();
      if(newText && this.name !== newText) {
        this._nameEdit.classList.remove("invalid");
        this.data.name = newText;
        this._header.innerText = newText;
        this.save();
      }
      else {
        this._nameEdit.classList.add("invalid");
      }
    });

    groupNameContainer.appendChild(label);
    groupNameContainer.appendChild(nameEdit);
    groupNameContainer.appendChild(saveButton);

    // filter stuff

    let filterHeader = document.createElement("h3");
    filterHeader.innerText = "Filters";

    let addFilter = document.createElement("div");
    addFilter.className = "add-filter";

    let addFilterText = document.createElement("input");
    addFilterText.type = "text";

    let addFilterButton = document.createElement("button");
    addFilterButton.innerText = "Add Filter";

    addFilter.appendChild(addFilterText);
    addFilter.appendChild(addFilterButton);

    form.appendChild(groupNameContainer);
    form.appendChild(filterHeader);
    form.appendChild(addFilter);

    this.view = form;
  }

  addView(parent) {
    parent.appendChild(this._header);
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
