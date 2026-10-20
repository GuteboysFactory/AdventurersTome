// Copy this folder into Data/modules only when testing integrations.
// No writes or private-note reads occur on startup. Helpers require approval.
let tomeExampleHandle = null;

function connectTomeExample() {
  if (tomeExampleHandle) return;
  const api = game.modules.get("adventurers-tome")?.api?.integrations;
  const status = api?.compatibility({ apiVersion: 1 });
  if (!status?.compatible || !status.ready) return;
  const handle = api.register({ moduleId: "tome-example-integration", apiVersion: 1 });
  try {
    handle.registerAdapter({
      id: "public-demo",
      apiVersion: 1,
      documentTypes: ["Actor"],
      capabilities: ["displayFields"],
      matches: ({ source }) => source?.getFlag?.("tome-example-integration", "enabled") === true,
      displayFields: () => [{ id: "integration-demo", label: "Integration", value: "Connected through Tome API v1" }]
    });
    tomeExampleHandle = handle;
    game.modules.get("tome-example-integration").api = Object.freeze({
      prepareAddition: (targetUuid, text) => handle.prepareSubmission({ targetUuid, text }),
      reviewAddition: handle.reviewSubmission,
      cancelAddition: handle.cancelSubmission,
      requestPrivateNotes: (targetUuid, purpose) => handle.requestPrivateNotesAccess({targetUuid, purpose}),
      readPrivateNotes: handle.readPrivateNotes,
      revokePrivateNotes: handle.revokePrivateNotesAccess
    });
  } catch (error) { handle.dispose(); throw error; }
}

Hooks.once("adventurersTomeIntegrationReady", connectTomeExample);
Hooks.once("ready", connectTomeExample);
