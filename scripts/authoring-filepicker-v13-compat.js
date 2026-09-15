const ATFP_MODULE_ID = "adventurers-tome";

/*
 * Foundry V13 keeps a deprecated global FilePicker compatibility getter which
 * logs on every access. authoring-alpha2 predates the namespace migration and
 * still probes globalThis.FilePicker before the V13 implementation.
 *
 * Keep this shim deliberately narrow: only accesses originating from Tome's
 * authoring-alpha2 module are redirected. Other systems/modules continue to
 * see Foundry's original compatibility getter and therefore retain their own
 * deprecation diagnostics instead of being silently masked by Tome.
 */
(() => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");
    const implementation = foundry?.applications?.apps?.FilePicker?.implementation
      || foundry?.applications?.apps?.FilePicker
      || null;

    if (!implementation || !descriptor?.get || descriptor.configurable !== true) return;
    const originalGet = descriptor.get;
    const originalSet = descriptor.set;

    Object.defineProperty(globalThis, "FilePicker", {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      get() {
        const stack = String(new Error().stack || "");
        if (stack.includes("authoring-alpha2.js")) return implementation;
        return originalGet.call(globalThis);
      },
      set: originalSet
        ? function setFilePicker(value) { return originalSet.call(globalThis, value); }
        : undefined
    });

    console.debug(`${ATFP_MODULE_ID} | Foundry V13 FilePicker compatibility shim active for Tome authoring.`);
  } catch (error) {
    console.warn(`${ATFP_MODULE_ID} | Could not install FilePicker compatibility shim safely`, error);
  }
})();
