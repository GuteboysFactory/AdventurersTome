// External integrations share Foundry's client trust boundary. This facade owns
// adapter lifetimes; it grants no extra document or private-data permissions.
const ATI_ID = "adventurers-tome";
const ATI_CONTRACT = "adventurers-tome-integration-api";
const ATI_VERSION = 1;
const ATI_OWNERS = new Map();
const ATI_SUBMISSION_WRITES = new Set();
let atiCoreReady = false;
let atiAnnounced = false;

function atiAdapters() {
  return game.modules.get(ATI_ID)?.api?.adapters;
}

function atiReady() {
  const adapters = atiAdapters();
  return atiCoreReady && adapters?.contract === "adventurers-tome-adapter-api" && adapters.version === 1 && typeof adapters.registerHandle === "function";
}

function atiSnapshot(row) {
  return Object.freeze({
    moduleId: row.moduleId,
    label: row.label,
    apiVersion: ATI_VERSION,
    active: game.modules.get(row.moduleId)?.active === true,
    adapters: Object.freeze([...row.adapters].filter(([, saved]) => saved.isCurrent()).map(([id]) => id).sort())
  });
}

function atiEmit(name, payload) {
  try { Hooks.callAll(name, payload); }
  catch (error) { console.warn(`Adventurer's Tome | Integration hook ${name} failed`, error); }
}

function atiCompatibility(request = {}) {
  const compatible = request.apiVersion === ATI_VERSION;
  return Object.freeze({
    contract: ATI_CONTRACT,
    version: ATI_VERSION,
    adapterContract: "adventurers-tome-adapter-api",
    adapterVersion: 1,
    compatible,
    ready: atiReady(),
    reason: compatible ? (atiReady() ? "ready" : "not-ready") : "unsupported-api-version"
  });
}

function atiSubmissions(row, assertCurrent) {
  const pending = new Map();
  const ttl = 5 * 60 * 1000;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const result = (status, reason = "") => Object.freeze({ status, applied: status === "applied", reason });
  const api = () => game.modules.get(ATI_ID)?.api;
  function user(id = "") {
    assertCurrent();
    const current = String(game.user?.id || "");
    if (!current || (id && current !== id)) throw new Error("The reviewing user changed. Prepare a new submission.");
    return current;
  }
  function prune() { for (const [id, draft] of pending) if (Date.now() >= draft.expires) pending.delete(id); }
  async function target(uuid) {
    let source;
    try { source = await fromUuid(uuid); } catch (_error) {}
    if (!source || source.uuid !== uuid || api()?.canView?.(source, game.user) !== true) throw new Error("The submission target is unavailable to this user.");
    return source;
  }
  return Object.freeze({
    async prepareSubmission(request = {}) {
      const userId = user(); prune();
      if (!request || Object.keys(request).some(key => !["targetUuid", "text"].includes(key))) throw new Error("Unsupported submission field.");
      const { targetUuid, text } = request;
      if (typeof targetUuid !== "string" || !/^(Actor|JournalEntry)\.[a-zA-Z0-9_-]{1,64}$/.test(targetUuid)) throw new Error("Choose a canonical world Actor or Journal UUID.");
      if (typeof text !== "string" || !text.trim() || text.length > 10000) throw new Error("A plain-text addition of 1–10000 characters is required.");
      if (pending.size >= 20) throw new Error("Review or cancel pending submissions first.");
      const backend = api()?.semantic;
      if (backend?.contract !== "adventurers-tome-universal-semantic-layer" || backend.version !== 1 || !backend.planWrite || !backend.executeWrite) throw new Error("Semantic write review is unavailable.");
      const source = await target(targetUuid); user(userId);
      const before = await backend.planWrite(source, "notes.public", ""); user(userId);
      if (before?.allowed !== true || before.visibility !== "player-visible" || before.authority !== "tome" || before.targetUuid !== targetUuid || typeof before.currentValue !== "string") throw new Error("This user cannot submit public information to that target.");
      const addition = text.trim();
      const plain = before.targetPath === `flags.${ATI_ID}.profile.biography`;
      if (!plain && ![`flags.${ATI_ID}.knownInformation`, `flags.${ATI_ID}.knownInformation.html`].includes(before.targetPath)) throw new Error("Unsupported public information storage.");
      const proposed = plain ? `${before.currentValue}\n\n${addition}` : `${before.currentValue}\n<p>${escape(addition).replace(/\r?\n/g, "<br>")}</p>`;
      const plan = await backend.planWrite(source, "notes.public", proposed, { expectedCurrentValue: before.currentValue }); user(userId);
      if (plan?.allowed !== true || plan.conflict || plan.semantic !== "notes.public" || plan.visibility !== "player-visible" || plan.authority !== "tome" || plan.targetUuid !== targetUuid || plan.targetPath !== before.targetPath || plan.currentValue !== before.currentValue) throw new Error("The target changed or is not writable. Prepare a new submission.");
      prune(); if (pending.size >= 20) throw new Error("Review or cancel pending submissions first.");
      const ticket = foundry.utils.randomID(24);
      if (pending.has(ticket)) throw new Error("Submission ticket collision. Retry preparation.");
      pending.set(ticket, { userId, source, backend, plan: JSON.parse(JSON.stringify(plan)), addition, expires: Date.now() + ttl, state: "pending" });
      return Object.freeze({ ticket, moduleId: row.moduleId, targetUuid, status: "pending-review" });
    },
    async reviewSubmission(ticket) {
      user(); prune();
      const draft = pending.get(ticket);
      if (!draft || draft.state !== "pending") throw new Error("This submission is unavailable, expired or already being reviewed.");
      user(draft.userId);
      if (!foundry.applications?.api?.DialogV2?.confirm) throw new Error("Tome's review dialog is unavailable.");
      draft.state = "reviewing";
      try {
        const source = await target(draft.source.uuid); user(draft.userId);
        if (source !== draft.source || api().semantic !== draft.backend) throw new Error("The target or write provider changed. Prepare a new submission.");
        const accepted = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Review integration suggestion" }, position: { width: 560 },
          content: `<p><strong>${escape(row.label)}</strong> proposes adding information to <strong>${escape(source.name)}</strong>.</p><p>Existing information will be retained. This addition goes into the target's known-information field; who can see it follows the target's existing permissions.</p><blockquote>${escape(draft.addition).replace(/\r?\n/g, "<br>")}</blockquote>`,
          yes: { label: "Approve addition" }, no: { label: "Cancel", default: true }, rejectClose: false
        });
        if (accepted !== true || pending.get(ticket) !== draft) return result("cancelled");
        user(draft.userId);
        if (Date.now() >= draft.expires) return result("rejected", "expired");
        const current = await target(source.uuid); user(draft.userId);
        if (pending.get(ticket) !== draft) return result("cancelled");
        if (current !== source || api().semantic !== draft.backend) return result("rejected", "target-changed");
        if (ATI_SUBMISSION_WRITES.has(source.uuid)) return result("rejected", "target-busy");
        draft.state = "applying";
        ATI_SUBMISSION_WRITES.add(source.uuid);
        try {
          const applied = await draft.backend.executeWrite(current, draft.plan);
          return applied?.applied === true ? result("applied") : result("rejected", "revalidation-failed");
        } finally { ATI_SUBMISSION_WRITES.delete(source.uuid); }
      } finally { pending.delete(ticket); }
    },
    cancelSubmission(ticket) {
      user(); const draft = pending.get(ticket);
      if (!draft || draft.state === "applying") return false;
      user(draft.userId); return pending.delete(ticket);
    },
    dispose: () => pending.clear()
  });
}

function atiPrivateNotes(row, assertCurrent) {
  const grants = new Map();
  let requesting = false;
  const api = () => game.modules.get(ATI_ID)?.api;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function gm(id = "") {
    assertCurrent();
    if (game.user?.isGM !== true || !game.user.id || (id && game.user.id !== id)) throw new Error("Private-note access requires the same approving GM.");
    return game.user.id;
  }
  function provider() {
    const vault = api()?.contextualPrivateVault;
    if (vault?.schema !== "adventurers-tome.private-vault" || vault.version !== 2 || typeof vault.getNotes !== "function") throw new Error("Private context notes are unavailable.");
    return vault;
  }
  async function target(uuid) {
    let source;
    try { source = await fromUuid(uuid); } catch (_error) {}
    if (!source || source.uuid !== uuid || api()?.canView?.(source, game.user) !== true) throw new Error("The private-note target is unavailable.");
    return source;
  }
  function prune() { for (const [token, grant] of grants) if (Date.now() >= grant.expires) grants.delete(token); }
  return Object.freeze({
    async requestPrivateNotesAccess(request = {}) {
      const gmId = gm(); prune();
      if (!request || Object.keys(request).some(key => !["targetUuid", "purpose"].includes(key))) throw new Error("Unsupported private-note access field.");
      const {targetUuid, purpose} = request;
      if (typeof targetUuid !== "string" || !/^(Actor|JournalEntry)\.[a-zA-Z0-9_-]{1,64}$/.test(targetUuid)) throw new Error("Choose a canonical world Actor or Journal UUID.");
      if (typeof purpose !== "string" || !purpose.trim() || purpose.length > 240) throw new Error("Explain the requested use in 1–240 plain-text characters.");
      if (grants.size >= 10) throw new Error("Revoke outstanding private-note permissions first.");
      if (requesting) throw new Error("Finish the current private-note permission request first.");
      requesting = true;
      try {
        const vault = provider(), read = vault.getNotes;
        const source = await target(targetUuid); gm(gmId);
        if (!foundry.applications?.api?.DialogV2?.confirm) throw new Error("Tome's authorization dialog is unavailable.");
        const accepted = await foundry.applications.api.DialogV2.confirm({
          window: {title: "Allow access to private GM notes?"}, position: {width: 560},
          content: `<p><strong>${escape(row.label)}</strong> requests one read of <strong>your private context notes</strong> for <strong>${escape(source.name)}</strong>.</p><p><strong>Purpose:</strong> ${escape(purpose.trim())}</p><p>This permission expires after one minute and allows no changes. Other entries, private facts and other GMs' notes are excluded. The integration can process or transmit notes it receives; approve only if you want to give this module that information.</p>`,
          yes: {label: "Allow one read"}, no: {label: "Deny", default: true}, rejectClose: false
        });
        if (accepted !== true) return null;
        gm(gmId);
        const current = await target(targetUuid); gm(gmId);
        if (current !== source || provider() !== vault || vault.getNotes !== read) throw new Error("The target or private-note provider changed. Request permission again.");
        prune(); if (grants.size >= 10) throw new Error("Revoke outstanding private-note permissions first.");
        const token = foundry.utils.randomID(24), expires = Date.now() + 60000;
        if (grants.has(token)) throw new Error("Private-note permission collision. Request permission again.");
        grants.set(token, {gmId, source, vault, read, expires, state: "ready"});
        return Object.freeze({token, targetUuid, moduleId: row.moduleId, scope: "private-context-notes", expiresAt: expires});
      } finally { requesting = false; }
    },
    async readPrivateNotes(token) {
      const gmId = gm(); prune();
      const grant = grants.get(token);
      if (!grant || grant.gmId !== gmId || grant.state !== "ready") throw new Error("This private-note permission is unavailable or expired.");
      grant.state = "reading";
      try {
        const source = await target(grant.source.uuid); gm(gmId);
        if (grants.get(token) !== grant || Date.now() >= grant.expires || source !== grant.source || provider() !== grant.vault || grant.vault.getNotes !== grant.read) throw new Error("Private-note permission is stale. Request permission again.");
        const notes = grant.read.call(grant.vault, source);
        if (!Array.isArray(notes)) throw new Error("Private context notes returned an unsupported result.");
        return Object.freeze({
          targetUuid: source.uuid,
          scope: "private-context-notes",
          notes: Object.freeze(notes.map(note => Object.freeze({
            id: String(note.id || ""), title: String(note.title || ""), body: String(note.body || ""),
            type: String(note.type || ""), status: String(note.status || "")
          })))
        });
      } finally { grants.delete(token); }
    },
    revokePrivateNotesAccess(token) {
      const gmId = gm(); const grant = grants.get(token);
      return grant?.gmId === gmId ? grants.delete(token) : false;
    },
    dispose: () => grants.clear()
  });
}

function atiRegister(request = {}) {
  if (!atiReady()) throw new Error("Tome Integration API is not ready.");
  if (request.apiVersion !== ATI_VERSION) throw new Error("Unsupported Tome Integration API version.");
  const moduleId = typeof request.moduleId === "string" ? request.moduleId.trim() : "";
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(moduleId) || moduleId === ATI_ID) throw new Error("An external Foundry module id is required.");
  const owner = game.modules.get(moduleId);
  if (owner?.active !== true) throw new Error("The integrating Foundry module must be active.");
  if (ATI_OWNERS.has(moduleId)) throw new Error(`Tome integration already registered: ${moduleId}`);
  const row = { moduleId, label: String(owner.title || moduleId), adapters: new Map() };
  ATI_OWNERS.set(moduleId, row);

  function assertCurrent() {
    if (ATI_OWNERS.get(moduleId) !== row) throw new Error("This Tome integration handle was disposed.");
    if (game.modules.get(moduleId)?.active !== true) throw new Error("The integrating Foundry module is inactive.");
    if (!atiReady()) throw new Error("Tome Integration API is not ready.");
  }

  function adapterId(localId) {
    if (typeof localId !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(localId)) throw new Error("A local adapter id using letters, digits, underscores or hyphens is required.");
    return `${moduleId}.${localId}`;
  }

  function unregisterOwned(fullId) {
    const saved = row.adapters.get(fullId);
    if (!saved) return false;
    row.adapters.delete(fullId);
    return saved.unregister();
  }

  const submissions = atiSubmissions(row, assertCurrent);
  const privateNotes = atiPrivateNotes(row, assertCurrent);

  const handle = Object.freeze({
    moduleId,
    prepareSubmission: submissions.prepareSubmission,
    reviewSubmission: submissions.reviewSubmission,
    cancelSubmission: submissions.cancelSubmission,
    requestPrivateNotesAccess: privateNotes.requestPrivateNotesAccess,
    readPrivateNotes: privateNotes.readPrivateNotes,
    revokePrivateNotesAccess: privateNotes.revokePrivateNotesAccess,
    registerAdapter(adapter = {}) {
      assertCurrent();
      const id = adapterId(adapter.id);
      if (row.adapters.has(id)) throw new Error(`Adapter already owned by this integration: ${id}`);
      const registry = atiAdapters();
      if (adapter.apiVersion != null && adapter.apiVersion !== 1) throw new Error("Unsupported Tome Adapter API version.");
      const matches = adapter.matches;
      const receipt = registry.registerHandle({
        ...adapter, id, apiVersion: 1,
        matches(context) {
          if (ATI_OWNERS.get(moduleId) !== row || game.modules.get(moduleId)?.active !== true) return false;
          return typeof matches === "function" ? matches.call(this, context) : true;
        }
      });
      // Registration hooks may synchronously dispose or deactivate the owner.
      try { assertCurrent(); }
      catch (error) { receipt.unregister(); throw error; }
      row.adapters.set(id, receipt);
      return id;
    },
    unregisterAdapter(localId) {
      assertCurrent();
      return unregisterOwned(adapterId(localId));
    },
    listAdapters() { assertCurrent(); return atiSnapshot(row).adapters; },
    dispose() {
      if (ATI_OWNERS.get(moduleId) !== row) return false;
      // Cleanup remains available after a module has been deactivated.
      for (const id of [...row.adapters.keys()]) unregisterOwned(id);
      submissions.dispose();
      privateNotes.dispose();
      ATI_OWNERS.delete(moduleId);
      atiEmit("adventurersTomeIntegrationUnregistered", Object.freeze({ moduleId, apiVersion: ATI_VERSION }));
      return true;
    }
  });
  atiEmit("adventurersTomeIntegrationRegistered", atiSnapshot(row));
  return handle;
}

const ATI_PUBLIC = Object.freeze({
  contract: ATI_CONTRACT,
  version: ATI_VERSION,
  isReady: atiReady,
  compatibility: atiCompatibility,
  register: atiRegister,
  list: () => Object.freeze([...ATI_OWNERS.values()].map(atiSnapshot).sort((a, b) => a.moduleId.localeCompare(b.moduleId)))
});

function atiAttach() {
  const module = game.modules.get(ATI_ID);
  if (!module) return;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.integrations = ATI_PUBLIC;
  if (!atiAnnounced && atiReady()) {
    atiAnnounced = true;
    atiEmit("adventurersTomeIntegrationReady", atiCompatibility({ apiVersion: ATI_VERSION }));
  }
}

Hooks.once("adventurersTomeCoreApiReady", () => { atiCoreReady = true; atiAttach(); });
Hooks.once("ready", atiAttach);
