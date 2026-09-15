const ATPF_MODULE_ID = "adventurers-tome";

/**
 * Adventurer's Tome Foundry platform boundary.
 *
 * Policy:
 * - Tome Core remains RPG-system agnostic.
 * - Foundry platform APIs are accessed through modern namespaced APIs.
 * - v14 semantics are preferred; v13 compatibility is retained where the same
 *   namespaced API exists.
 * - Deprecated global compatibility getters are never used here.
 * - If v13/v14 diverge in future, the version branch belongs here rather than
 *   inside campaign/domain features.
 */

export function foundryGeneration() {
  const releaseGeneration = Number(globalThis.game?.release?.generation || 0);
  if (Number.isFinite(releaseGeneration) && releaseGeneration > 0) return releaseGeneration;
  const major = Number(String(globalThis.game?.version || "").split(".")[0] || 0);
  return Number.isFinite(major) ? major : 0;
}

export function foundryPlatformInfo() {
  return Object.freeze({
    generation: foundryGeneration(),
    version: String(globalThis.game?.version || globalThis.game?.release?.version || "unknown"),
    policy: "v14-first-v13-compatible"
  });
}

export function filePickerClass() {
  const api = globalThis.foundry?.applications?.apps?.FilePicker || null;
  const implementation = api?.implementation || null;

  // V13/V14 expose the modern FilePicker through the namespaced apps API.
  // Prefer the implementation class when available, otherwise the namespaced
  // class itself. Never fall back to the deprecated global FilePicker getter.
  if (implementation) return implementation;
  if (api) return api;
  return null;
}

export function textEditorImplementation() {
  const api = globalThis.foundry?.applications?.ux?.TextEditor || null;
  return api?.implementation || api || null;
}

export function applicationV2Class() {
  return globalThis.foundry?.applications?.api?.ApplicationV2 || null;
}

export function dialogV2Class() {
  return globalThis.foundry?.applications?.api?.DialogV2 || null;
}

export function assertPlatformCapability(name, value) {
  if (value) return value;
  const info = foundryPlatformInfo();
  throw new Error(`${ATPF_MODULE_ID} | Foundry platform capability '${name}' is unavailable on ${info.version}.`);
}
