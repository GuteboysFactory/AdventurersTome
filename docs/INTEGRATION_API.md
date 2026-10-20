# Integration API v1 — Tome 2.0.0

This is the stable Integration API contract for Tome 2.0, built on the existing Adapter API v1. qa.1 introduced registration/lifecycle; qa.2 added [reviewed public-note additions](INTEGRATION_SUBMISSIONS.md); qa.3 adds [explicit one-read private-note authorization](INTEGRATION_PRIVATE_NOTES.md). No new migration adapter is introduced.

## Connect without polling

Use `game.modules.get("adventurers-tome")?.api?.integrations`. The facade attaches during Foundry `ready`, but can initially report `isReady() === false` while Tome's async core startup finishes. It announces readiness once both the core and Adapter API are available. It does not imply that every optional provider or campaign index has finished building.

```js
let handle;
function connect() {
  const api = game.modules.get("adventurers-tome")?.api?.integrations;
  const status = api?.compatibility({ apiVersion: 1 });
  if (handle || !status?.compatible || !status.ready) return;
  handle = api.register({ moduleId: "my-module", apiVersion: 1 });
}
Hooks.once("adventurersTomeIntegrationReady", connect);
Hooks.once("ready", connect);
```

The ready fallback supports modules loaded after the custom hook. For code dynamically loaded after Foundry's `ready`, call `connect()` immediately as well. The caller's guard makes connection idempotent. There are no timer or rendering hooks.

## Public facade

| Member | Contract |
| --- | --- |
| `contract` | `adventurers-tome-integration-api` |
| `version` | Integer `1`; independent of Tome's package version |
| `isReady()` | Whether core and Adapter API are available |
| `compatibility({apiVersion:1})` | Frozen metadata: `contract`, `version`, `adapterContract`, `adapterVersion`, `compatible`, `ready`, `reason` |
| `register({moduleId,apiVersion:1})` | Register one active external Foundry module and return its frozen handle |
| `list()` | Frozen sorted metadata snapshots: `moduleId`, Foundry module `label`, `apiVersion`, `active`, `adapters` |

`compatibility` accepts only the exact integer contract version. `reason` is `ready`, `not-ready` or `unsupported-api-version`. Registration rejects inactive, missing, duplicate or malformed module IDs and Tome's own module ID. Exceptions describe invalid calls and leave the registry intact.

## Owned adapters

```js
const fullId = handle.registerAdapter({
  id: "public-summary", // becomes my-module.public-summary
  apiVersion: 1,
  systemId: "my-system", // optional; omit for a system-independent provider
  documentTypes: ["Actor"],
  capabilities: ["enrich"],
  enrich: ({ source }) => ({ bodyHtml: "", summary: "", facts: [] })
});
handle.listAdapters();
handle.unregisterAdapter("public-summary");
handle.dispose();
```

Local adapter IDs use lowercase letters, digits, underscores and hyphens, and must start with a letter or digit. Different modules can reuse the same local ID; full IDs are namespaced. A handle cannot replace adapters. Capability dispatch, matching, priority, system affinity and error containment continue through `api.adapters`; existing direct registrations retain their existing behavior.

`dispose()` removes only the exact records created by that handle, unregisters the integration, and returns `true` once (`false` thereafter). It remains callable after module deactivation. Other handle operations reject inactive or disposed owners. Managed adapters stop matching if their owner becomes inactive. Old handles cannot affect a new registration with the same module ID. Cleanup preserves a later replacement made through the legacy Adapter API, including replacements made synchronously from lifecycle hooks. `listAdapters()` omits replaced or removed records.

The Adapter API gains the additive `registerHandle(...)`, with the same input signature and duplicate/replace rules as `register(...)`. It returns a frozen `{id,isCurrent(),unregister()}` receipt bound to the exact registration. Existing `register(...)` still returns its string ID. Adapter API contract version remains `1`.

## Lifecycle hooks

| Hook | Payload and timing |
| --- | --- |
| `adventurersTomeIntegrationReady` | One frozen compatibility snapshot with requested v1; once after core/adapter readiness |
| `adventurersTomeIntegrationRegistered` | One frozen integration descriptor after the handle is registered, before its adapters are added |
| `adventurersTomeIntegrationUnregistered` | Frozen `{moduleId,apiVersion:1}` after disposal |

The existing `adventurersTomeCoreApiReady`, `adventurersTomeAdapterRegistered` and `adventurersTomeAdapterUnregistered` hooks remain available. The new events contain module/adapter metadata only: no Foundry Documents, campaign content, live API references, UUID inventories or private stores. Consumers should treat hooks as notifications, not authorization or persistence acknowledgements.

## Trust and privacy

All enabled Foundry modules execute in the same JavaScript client. A `moduleId` declares ownership; it cannot authenticate another module's code or sandbox malicious extensions. The discovery facade grants no additional document permissions and exports no private GM data, sockets or remote endpoints. Submission methods live on the registered handle and are restricted to reviewed public-note additions. Private-note access is separately scoped to a GM-approved, short-lived, single-read grant. Existing permission checks and explicit authorization remain required for each data operation. An adapter callback is trusted module code and must respect the current viewer; registration is not approval to read, export or write campaign content.

Broader submissions and broader private-data scopes remain future work. Genesys mechanics and further migration work remain deferred. No system-specific schema is imported into this facade.

## Example and local QA

`examples/tome-example-integration/` is an optional, separately installable developer fixture. Copy its folder into Foundry `Data/modules` and enable it alongside the local Tome QA build. It does not load inside Tome automatically and makes no writes on startup. Its adapter only returns one public display field for Actor sources already marked with its own `enabled` flag. Its explicit `prepareAddition`/`reviewAddition` helpers exercise the separate approved-write flow documented below.

Check in the console:

```js
const api = game.modules.get("adventurers-tome").api;
api.integrations.compatibility({apiVersion:1});
api.integrations.list();
api.adapters.list();
```

Expect one `tome-example-integration` descriptor and `tome-example-integration.public-demo`. No ordinary Actor profile changes without the opt-in flag. With the fixture disabled, Tome must still open normally with its standard adapters and UI.

Automated QA covers both startup orders, duplicate/version failures, two-module isolation, deactivation/disposal, synchronous reentrancy, legacy replacement, receipt safety, exception containment and GM/player metadata boundaries. The one-read authorization path has also been confirmed in Foundry. Further integrations should use the optional runtime QA fixture before deployment.
