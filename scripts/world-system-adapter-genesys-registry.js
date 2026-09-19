const ATGR_ADAPTER_ID = "genesys-vtt-runtime-registry";

function atGrEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function atGrPlain(value) {
  const host = document.createElement("div");
  host.innerHTML = String(value || "");
  return String(host.textContent || "").replace(/\s+/g, " ").trim();
}

function atGrTalentRow(source) {
  if (String(game.system?.id || "") !== "genesys-vtt") return null;
  if (String(source?.documentName || "") !== "Item" || String(source?.type || "") !== "talent") return null;
  const sourceId = String(source?.system?.sourceId || "").trim();
  if (!sourceId) return null;
  let rows = [];
  try { rows = game.genesysContent?.getContent?.("talents") ?? []; } catch (_err) { rows = []; }
  return rows.find((row) => String(row?.id || "") === sourceId || String(row?.sourceId || "") === sourceId) || null;
}

function atGrRegistry() {
  const earlyBridge = globalThis.AdventurersTomeSystemAdapters;
  if (earlyBridge?.register) return earlyBridge;

  const moduleRegistry = globalThis.game?.modules?.get?.("adventurers-tome")?.api?.adapters;
  return moduleRegistry?.register ? moduleRegistry : null;
}

function atGrRegister() {
  const registry = atGrRegistry();
  if (!registry?.register) return false;
  if (registry.list?.().includes(ATGR_ADAPTER_ID)) return true;

  registry.register({
    id: ATGR_ADAPTER_ID,
    label: "Genesys VTT Talent Registry",
    apiVersion: 1,
    systemId: "genesys-vtt",
    priority: 50,
    documentTypes: ["Item"],
    sourceTypes: ["talent"],
    capabilities: ["enrich"],
    matches: ({ source, systemId }) => systemId === "genesys-vtt" && String(source?.documentName || "") === "Item" && String(source?.type || "") === "talent",
    enrich: ({ source }) => {
      const row = atGrTalentRow(source);
      if (!row) return { bodyHtml: "", summary: "", facts: [] };

      const rulesSummary = atGrPlain(row.rulesSummary || row.description || "");
      const sourceReference = atGrPlain(row.sourceReference || "");
      const authority = atGrPlain(row.metadata?.rulesSummaryAuthority || "");
      const body = [];

      if (rulesSummary) body.push(`<p>${atGrEscape(rulesSummary)}</p>`);
      if (sourceReference) body.push(`<p><em>Reference: ${atGrEscape(sourceReference)}</em></p>`);
      if (authority) body.push(`<p><small>${atGrEscape(authority)}</small></p>`);

      return {
        bodyHtml: body.join(""),
        summary: rulesSummary.slice(0, 360),
        facts: []
      };
    }
  });
  return true;
}

if (!atGrRegister()) {
  Hooks.once("ready", () => { atGrRegister(); });
}

Hooks.on("adventurersTomeAdapterRegistered", () => {
  if (!atGrRegistry()?.list?.().includes(ATGR_ADAPTER_ID)) atGrRegister();
});
