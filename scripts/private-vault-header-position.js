const PVH_MODULE_ID = "adventurers-tome";

function pvhRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function pvhIsTome(app) {
  return app?.id === "adventurers-tome-app" || app?.options?.id === "adventurers-tome-app" || app?.constructor?.name === "AdventurersTomeApp";
}

function pvhMoveSheetVault(app, element) {
  if (!game.user?.isGM || pvhIsTome(app)) return;
  const root = pvhRoot(element);
  if (!root) return;

  const button = root.querySelector("[data-atp-sheet-vault]");
  if (!(button instanceof HTMLElement)) return;

  const header = button.closest(".window-header") || root.querySelector("header.window-header, .window-header");
  if (!(header instanceof HTMLElement)) return;

  const title = header.querySelector(".window-title");
  const children = [...header.children].filter((child) => child !== button);
  const titleIndex = title ? children.indexOf(title) : -1;
  const afterTitle = titleIndex >= 0 ? children.slice(titleIndex + 1) : children;

  const controlsGroup = afterTitle.find((child) => child.matches?.(".window-controls"));
  if (controlsGroup instanceof HTMLElement) {
    controlsGroup.prepend(button);
  } else {
    const firstControl = afterTitle.find((child) => child.matches?.("button, .header-control, [data-action]"));
    if (firstControl instanceof HTMLElement) header.insertBefore(button, firstControl);
    else if (title instanceof HTMLElement) title.insertAdjacentElement("afterend", button);
    else header.append(button);
  }

  button.style.flex = "0 0 auto";
  button.style.marginLeft = "0.25rem";
  button.style.marginRight = "0.15rem";
}

Hooks.on("renderApplicationV2", (app, element) => {
  try {
    pvhMoveSheetVault(app, element);
  } catch (error) {
    console.error(`${PVH_MODULE_ID} | Private Vault header positioning failed safely`, error);
  }
});
