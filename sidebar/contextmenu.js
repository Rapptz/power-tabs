class ContextMenu {
  /**
   * items must be an array of objects with the
   * following keys:
   *
   * - name: The name of the item.
   * - isEnabled: A function that checks if it's enabled.
   * - onClick: A function that is called on click.
   *
   * The special item "separator" is used to define a separator.
   */
  constructor(event, items) {
    this.clientX = event.clientX;
    this.clientY = event.clientY;
    this.target = event.target;
    this.items = items;
    this._displayed = false;
    this._subMenu = null;
    this.buildView();
  }

  buildView() {
    let main = document.createElement("div");
    main.className = "context-menu";
    this._updateViewFromItems(main, this.items);
    this.view = main;
  }

  _updateViewFromItems(el, items) {
    for(let item of items) {
      let div = document.createElement("div");
      div.title = "";
      if(item.name === "separator") {
        div.className = "context-menu-separator";
        el.appendChild(div);
        continue;
      }

      div.className = "context-menu-item";
      if(item.hasOwnProperty("isEnabled") && !item.isEnabled()) {
        div.classList.add("disabled");
      }
      else if(item.hasOwnProperty("items")) {
        div.classList.add("sub-context-menu-item");
        div.addEventListener("click", (e) => {
          e.preventDefault();
          this.showSubMenu(item);
          e.stopPropagation();
        });

        let child = document.createElement("div");
        child.className = "sub-context-menu-item-title";
        child.innerText = item.name;
        let icon = document.createElement("div");
        icon.className = "sub-context-menu-item-icon";
        div.appendChild(child);
        div.appendChild(icon);
        el.appendChild(div);
        continue;
      }
      else {
        div.addEventListener("mouseup", (e) => {
          e.preventDefault();
          item.onClick(e);
        });
      }

      div.innerText = item.name;
      el.appendChild(div);
    }
  }

  static isContextMenuEvent(e) {
    let el = e.target.parentNode;
    return el && el.className === "context-menu";
  }

  show() {
    if(!this._displayed) {
      document.body.appendChild(this.view);
      this._positionMenu(this.view);
      this._displayed = true;
    }
  }

  hide() {
    this.hideSubMenu();
    if(this._displayed) {
      document.body.removeChild(this.view);
      this._displayed = false;
    }
  }

  showSubMenu(item) {
    this.hideSubMenu();
    let minHeight = this.view.offsetHeight + 4;
    this.view.classList.add("hidden");

    let el = document.createElement("div");
    el.className = "context-menu";
    this._subMenu = el;

    let header = document.createElement("div");
    header.classList.add("context-menu-item");
    header.classList.add("sub-context-menu-header");
    header.addEventListener("click", (e) => {
      e.preventDefault();
      this.hideSubMenu();
      this.view.classList.remove("hidden");
      e.stopPropagation();
    });

    let title = document.createElement("div");
    title.className = "sub-context-menu-header-title";
    title.innerText = item.name;
    let icon = document.createElement("div");
    icon.className = "sub-context-menu-header-icon";
    header.appendChild(title);
    header.appendChild(icon);

    el.appendChild(header);
    let items = item.items.concat();
    items.splice(0, 0, { name: "separator" });
    this._updateViewFromItems(el, items);

    document.body.appendChild(el);
    this._positionMenu(this._subMenu, minHeight);
  }

  hideSubMenu() {
    if(this._subMenu) {
      document.body.removeChild(this._subMenu);
      this._subMenu = null;
    }
  }

  _positionMenu(el, minHeight) {
    const menuWidth = el.offsetWidth + 4;
    const menuHeight = el.offsetHeight + 4;

    const top = this.clientY + menuHeight > window.innerHeight ?
                window.innerHeight - menuHeight : this.clientY;

    const left = this.clientX + menuWidth > window.innerWidth ?
                 window.innerWidth - menuWidth : this.clientX;

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    if(minHeight) {
      el.style.minHeight = `${minHeight}px`;
    }
  }
}
