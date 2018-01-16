const originalUrl = new URL(window.location);
const search = originalUrl.searchParams;
const redirectUrl = decodeURIComponent(search.get("url"));
const tabId = parseInt(search.get("tabId"));
const windowId = parseInt(search.get("windowId"));
var assignedGroup = null;

async function loadData() {
  const redirectUrlElement = document.getElementById("redirect-url");
  redirectUrlElement.textContent = redirectUrl;

  // add favicon stuff
  const origin = new URL(redirectUrl).origin;
  const faviconUrl = `${origin}/favicon.ico`;
  let icon = document.createElement("img");
  icon.className = "tab-icon";
  icon.src = faviconUrl || "/icons/favicon.svg";
  icon.addEventListener("error", () => {
    icon.src = "/icons/favicon.svg";
  });

  redirectUrlElement.prepend(icon);

  // replace the group name stubs with the actual group name
  const assignedGroupId = search.get("groupId");
  const groups = await browser.storage.local.get("groups");

  // as a pre-requisite, we should have access to groups here
  // if we don't, then something went horribly wrong
  assignedGroup = groups.groups.find((g) => g.uuid === assignedGroupId);
  if(!assignedGroup) {
    // wtf
    return;
  }

  for(let el of document.querySelectorAll(".group-name")) {
    el.textContent = assignedGroup.name;
  }

  // process the actual form
  document.getElementById("redirect-form").addEventListener("submit", (e) => {
    e.preventDefault();
    switch(e.explicitOriginalTarget.id) {
    case "confirm":
      confirm();
      break;
    case "deny":
      deny();
      break;
    }
  });
}

function confirm() {
  const neverAsk = document.getElementById("never-ask").checked;
  if(neverAsk) {
    browser.runtime.sendMessage({
      method: "neverAsk",
      neverAsk: true,
      hostname: new URL(redirectUrl).hostname
    });
  }

  browser.runtime.sendMessage({
    method: "redirectTab",
    tabId: tabId,
    windowId: windowId,
    redirectUrl: redirectUrl,
    originalUrl: originalUrl.href,
    exempt: false,
    groupId: search.get("groupId")
  }).then((m) => console.log('done'), (e) => console.log(`error: ${e}`));
}

function deny() {
  browser.runtime.sendMessage({
    method: "redirectTab",
    tabId: tabId,
    windowId: windowId,
    redirectUrl: redirectUrl,
    originalUrl: originalUrl.href,
    exempt: true
  });
}

loadData();
