const AT_TE_COMPAT_ID = "adventurers-tome";

(() => {
  try {
    const implementation = foundry?.applications?.ux?.TextEditor?.implementation;
    if (!implementation) return;

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
    if (!descriptor?.get || descriptor.configurable !== true) return;

    Object.defineProperty(globalThis, "TextEditor", {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      writable: false,
      value: implementation
    });

    console.debug(`${AT_TE_COMPAT_ID} | Foundry v13 TextEditor compatibility alias installed.`);
  } catch (error) {
    console.warn(`${AT_TE_COMPAT_ID} | TextEditor compatibility alias could not be installed safely.`, error);
  }
})();
