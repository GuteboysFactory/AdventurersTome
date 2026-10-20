# Reviewed integration submissions — Tome 2.0.0

This contract provides a narrow, permission-checked submission flow to the Integration API v1 handle. It appends plain text to an existing world Actor or JournalEntry's known-information field, after the current user reviews and approves a native Foundry dialog. Existing content is retained. It does not create entities, links, accounts, macros or files, and never writes private GM stores.

## Registered-handle methods

```js
const draft = await handle.prepareSubmission({
  targetUuid: "Actor.existingWorldActorId",
  text: "The gatekeeper remembers the party from last winter."
});
// Read-only so far. The returned receipt contains no existing campaign text.
const result = await handle.reviewSubmission(draft.ticket);
// Opens a native review dialog. Cancel/close does not write.
```

| Method | Result |
| --- | --- |
| `prepareSubmission({targetUuid,text})` | Frozen `{ticket,moduleId,targetUuid,status:"pending-review"}` after read-only permission/write planning |
| `reviewSubmission(ticket)` | Frozen `{status,applied,reason}` after native review and revalidation |
| `cancelSubmission(ticket)` | Removes an uncommitted draft; returns whether it existed and could be cancelled |

`status` is `applied`, `cancelled` or `rejected`. Rejection reasons include `expired`, `target-changed`, `target-busy` and `revalidation-failed`. Invalid calls or unavailable permissions/providers may throw; callers should handle errors and show appropriate feedback. There is no `confirm:true` or unattended execute option.

The review shows the integrating module, the target and the exact proposed plain-text addition. It explains that existing content is retained and visibility continues to follow the target's permissions. Cancel is the default action. Proposed markup is rendered as literal text; native HTML known-information storage receives escaped paragraphs, while character biography storage receives plain text.

## Authorization and concurrency

- The actual `game.user` is authoritative. Caller-supplied users, permissions, field paths, semantics, HTML or callbacks are rejected.
- `api.canView` checks Tome visibility; the existing semantic layer plans only `notes.public` and enforces GM/OWNER permission. Observers cannot write. Owning players may approve additions to their permitted target; this is not a way to submit to a different GM client.
- Only canonical world Actor/JournalEntry UUIDs are accepted. Compendia, embedded documents and arbitrary URLs are excluded.
- Private vaults, private facts, GM notes and transfer APIs are never accessed by this flow. The known-information field can still belong to a hidden document; approval does not reveal that document or change its ownership/access flags.
- Current user, active integration, source identity, visibility and semantic provider are checked again around asynchronous review. The existing semantic executor revalidates permissions, current value and target storage immediately before applying.
- Changes made while the dialog is open reject the old proposal. Prepare a fresh draft to review the updated target. Concurrent applications to the same target on this client are blocked; there is no distributed multi-client transaction or lock.
- Tickets are integration-handle/user scoped, held only in client memory, expire after five minutes and are consumed after review. There are at most 20 pending drafts per handle. Cancelling and disposal release them. No content is sent in lifecycle hooks or persisted to settings.
- Replaying a consumed ticket cannot apply twice. Preparing a new ticket or reconnecting after reload is a new proposal, not a durable exactly-once delivery mechanism. A write already handed to Foundry after approval cannot be recalled by cancelling/disposal.

All Foundry modules share a trusted JavaScript client. This API is a disciplined review path, not a security sandbox against malicious enabled modules. Native Foundry permission checks remain the persistence boundary.

## Optional QA fixture

Install `tome-example-integration` from the supplied optional fixture ZIP and enable it alongside the Tome QA build. Startup remains read-only. In a test world, copy an existing Actor UUID and use:

```js
const demo = game.modules.get("tome-example-integration").api;
const draft = await demo.prepareAddition("Actor.REPLACE_WITH_TEST_ACTOR_ID", "QA addition: the guard recognizes the party.");
await demo.reviewAddition(draft.ticket);
```

First cancel: no addition should appear. Prepare a new draft, approve it, then reopen the target's known information/biography: the existing text and the one new addition should be present. Test a plain-text PC biography as well as HTML known information. An observer player should be denied; an owning player can approve their own permitted target.

The fixture's public submission helpers are explicit preparation/review/cancellation methods. qa.3 additionally exposes separate private-note authorization helpers, described in INTEGRATION_PRIVATE_NOTES.md. It does not auto-submit, request private access or display prompts on startup. Disable it when finished. No new campaign migration is needed.

Automated tests exercise the real semantic planner/executor, including cancel/close, HTML escaping, plain biography formatting, denied/changed permissions, impersonation fields, stale content/provider/storage, ticket scoping/expiry/replay, quota and simultaneous approvals. Use the documented runtime fixture when validating a new integration.
