# Explicit private-note access — Tome 2.0.0

This contract provides a narrow, read-only authorization path for external integrations. A GM can authorize one integration to read that GM's private contextual notes for one existing Actor or JournalEntry. The current user must explicitly approve Tome's native permission dialog. Registration alone does not grant this access.

## Handle methods

```js
const grant = await handle.requestPrivateNotesAccess({
  targetUuid: "Actor.existingWorldActorId",
  purpose: "Prepare a briefing for me."
});
if (grant) {
  const snapshot = await handle.readPrivateNotes(grant.token);
  // Treat this snapshot as private GM data. Do not log or publish its contents.
}
```

| Method | Contract |
| --- | --- |
| `requestPrivateNotesAccess({targetUuid,purpose})` | Opens a native permission dialog; returns `null` on deny/close, or a frozen `{token,targetUuid,moduleId,scope,expiresAt}` grant after approval |
| `readPrivateNotes(token)` | Uses and consumes a grant; returns a detached frozen `{targetUuid,scope,notes}` snapshot |
| `revokePrivateNotesAccess(token)` | Removes an outstanding grant belonging to this handle and GM; returns whether it existed |

The only scope is `private-context-notes`. The token expires **60 seconds after approval** and permits one read attempt. There are at most ten outstanding grants per integration handle, and only one permission request dialog per handle at a time. Expired grants are pruned during access/request checks. There are no configurable durations, wildcard grants or persistent approvals.

The prompt identifies the requesting module, the target, the intended purpose, the one-read/minute limit and the read-only scope. It also explains that an integration can process or transmit information it receives. **Deny is the default.** No private note counts, titles, text or facts are read to build that prompt.

## Authority and scope

- Only the actual current `game.user`, while still a GM, can request or use a grant. Supplied users, permissions, scopes, lifetimes and storage paths are rejected. Players fail before source lookup, dialog or private-vault access.
- The grant is bound to its exact registration handle, approving GM, canonical world Actor/Journal UUID, source object and private-note provider/method. Other GMs and other integrations cannot use it. Old handles cannot use it after disposal/reconnection.
- Read access checks GM identity/role, active module, source visibility/identity, provider identity and expiry again after asynchronous source resolution. Revocation/disposal while source resolution is pending blocks the read. Replays and simultaneous reads cannot return another snapshot.
- Notes come from the existing **user-scoped contextual Private Vault v2** API. This grant does not expose private facts, relationship stores, Chronicle books, other entries, files or other GMs' vaults. Returned note fields are limited to `id`, `title`, `body`, `type` and `status`.
- The provider internally loads its native user-scoped vault, then selects the requested record; only that record's note fields leave the grant API. Neither authorization nor reading writes settings, documents, ownership or visibility metadata.
- Tokens live only in client memory and are removed by revocation, expiry checks, attempted consumption, disposal or page reload. No private data/tokens are added to lifecycle hooks, integration discovery descriptors, diagnostics, logs or persisted settings by this API.
- Returned content is a snapshot from the time it is read. Revocation cannot recall data already delivered to the integration. The API does not constrain downstream processing or network access by enabled module code.

Foundry modules share a trusted JavaScript client. These grants define an explicit permission workflow; they are not a sandbox or authentication system against malicious enabled modules that could bypass existing public APIs. Use only integrations you trust.

## Local QA with dummy notes

Use the optional `tome-example-integration` fixture **in a test world**, with a deliberately invented private contextual note attached to a test Actor. No real campaign secrets are needed. The fixture does not request or read private notes on startup.

```js
const demo = game.modules.get("tome-example-integration").api;
const grant = await demo.requestPrivateNotes("Actor.REPLACE_WITH_TEST_ACTOR_ID", "Check my dummy QA note only.");
if (grant) console.log("Dummy notes returned:", (await demo.readPrivateNotes(grant.token)).notes.length);
```

First deny: the result should be `null`. Request again and approve: one read should succeed. A repeated read with the same token should fail. Also check revoke-before-read and waiting over one minute before reading. As a player, requests must fail without a permission prompt.

With two test GM accounts, each may authorize their own notes but must receive only their own contextual record. Do not paste private note contents or tokens into issue reports. Report only pass/fail and sanitized error messages.

Automated tests use the real Private Vault v2 implementation and user-scoped settings fixture, including deny/close, two-GM isolation, field filtering, expiry, replay, revocation during pending resolution, role/module/source/provider changes, prompt escaping and bounded requests. The previous public submission/adapter suites remain part of regression validation. The first-read/replay-rejection flow has additionally been confirmed in Foundry. Use the runtime fixture when validating a new integration.
