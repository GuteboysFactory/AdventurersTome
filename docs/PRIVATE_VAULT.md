# Private Vault

Open **Campaign Tools → Private Vault** as GM. Unlock using your existing Vault
passphrase, or configure one on first use. Keep a recovery copy. Remember on
this device stores the local unlock key in a trusted browser profile, without
storing the passphrase as plaintext. HTTPS or localhost is required.

## Notes and categories

Select a source, search notes, filter status or category, and pin important
information. Edit notes with headings, bold/italic, lists, quotations and links.
The same note is used from the Actor and explicitly linked source views.
Create a category in the editor; use Categories in the workspace to rename it.
Source-specific facts and relationships remain separate from shared notes.

## Images and token preview

Attach PNG, JPEG or WebP up to 8 MB and 40 megapixels. Tome prepares the image
to at most 1600 pixels on its longest side and 2 MB for encrypted storage.
Captions and original filenames are not public upload metadata. Choose View
private image to load it and open it again to enlarge/share. The quiet token
preview does not download images automatically and stays out of dragging.

## Deliberate sharing

Select an excerpt in the workspace to send it to public chat or selected users.
Image sharing sends only the chosen image and caption, not the rest of a note.
Public sharing is deliberately public. Tome whispers encrypt content before
ChatMessage storage/transmission, rather than trusting native whisper visibility.
Recipients click Open encrypted whisper. Missing device keys stop the send;
there is no plaintext fallback. Encryption and decryption run in module workers.

Whisper keys belong to the receiving browser profile. Keep that profile: another
profile or clearing site data may make older whispers unreadable. Cross-device
whisper-key recovery is not included. This is separate from Vault passphrase
recovery. Other ordinary clients receive ciphertext, but a malicious module,
compromised browser or manipulated HTTP delivery remains outside this protection.
Use HTTPS for hosted play. This protocol has no independent security audit.

## Incoming GM sections

Each receiving GM opens Private Vault once to prepare GM Inbox. Session/Quest
imports by Trusted Players and Assistant GMs can then preserve GM-only text and
reminders for that inbox, even while its GM is offline. A Trusted Player cannot
reroute those protected sections into Chronicle or skip them. Native Journal
creation permission is required; importing does not grant other GM privileges.

Open GM Inbox and choose Review GM sections on a record. Read it, then explicitly
accept it into Vault. The queue is encrypted, durable and separate from chat.
Unavailable keys or sources retain the incoming record. Updated/stale records
must be reviewed again before approval; retries do not duplicate saved notes.
HTTP-compatible document checksums do not enable remote HTTP Vault unlocking.

## Backup and rollback

Personal Vault export includes private notes, categories and image bytes in a
local decrypted file. Keep it private. Restore creates fresh encrypted image
copies. Portable backup supports 32 images; use a full world backup for larger
Vaults. Review pending incoming sections before making a portable export.
Canceled uploads may leave encrypted files; no automatic file deletion is added.

Older Tome versions cannot read the encrypted Vault records. For a complete
rollback restore both the previous module and corresponding world backup.
Keep the Vault recovery phrase; a remembered browser is not a backup service.

## Verification

The promoted runtime is the user-tested 2.1.1-vault.3 candidate. It passed 49
targeted tests in tests/private-vault and the existing 484-test production gate.
Native copied-world Foundry 13.351 tests covered editor/category controls,
images and restore, offline-GM handoff, role permissions, recipient/nonrecipient
privacy and explicit selected sharing. The release notes state the tested
system/version boundary; this is not a universal compatibility guarantee.
