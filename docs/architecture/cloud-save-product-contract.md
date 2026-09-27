# Cloud Save Product Contract — Sweat This Account Integration and Secret Robot Backup UX

Status: Accepted as a design/product contract (issue #28). This document defines requirements
for a **future** capability. It does not implement backend storage, does not add game-client
network code, and does not add production web UI. It exists so that separate Backend, Unity
(Secret Robot/Murderlands), and web issues can be scoped against one agreed contract instead of
each guessing independently.

Parent: #20 (Sweat This Multi-Game Web Platform Redesign). Depends on: #25 (Sweat This Account
UX — Shared Identity Dashboard and Per-Game Data Namespacing).

## Audit baseline

This contract was authored/reconciled against:

| Repository | Branch | SHA audited | Notes |
|---|---|---|---|
| `sweat-this/level5frontend` | `dev` | `bb9653f5f23890996930dfd4e8870a300b081c71` | matches current `dev` exactly |
| `sweat-this/murderlands` | `dev` | `7735ba9d24997a2a4e420b29608c722dd2e8f7dd` | current `dev` is `abc6c219e...` (#1036); no commits touched `Assets/_Murderlands/Scripts/Persistence/**` or `PlayerSaveSlots.cs` between the audited SHA and current `dev`, so the save architecture below is current |
| `sweat-this/Level5Backend` | `dev` | `8613c05359e4a2d7cc81a2c8779a4378121157e6` | matches current `dev` exactly |
| `sweat-this/codex` | `dev` | `80b6d6136e869a37d2254d3cba6073d6acced380` | **not resolvable** in `codex`'s current history (272 commits, not shallow, no matching object). Not treated as blocking: `codex` republishes already-authored docs from the other three repos (see its issue #28, "docs: publish Murderlands dialogue architecture") and has no independent save/account/cloud architecture of its own to reconcile against. |

No open PRs existed against any of the four repositories at audit time.

## Current save architecture is authority (not redesigned here)

Secret Robot (Murderlands) already has a complete local save system; this contract layers cloud
sync on top of it and changes none of it:

- Three fixed slot IDs: `slot_001`, `slot_002`, `slot_003` (`PlayerSaveSlotService.SlotIds`,
  `Assets/_Murderlands/Scripts/Application/PlayerSaveSlots.cs`).
- Canonical path: `persistentDataPath/Saves/<slotId>/murderlands.save.json`
  (`GameStateSavePath.BuildSlotCanonicalPath`, `GameStateSaveFileStore.DefaultFileName`).
- Versioned document `GameStateSaveDataV1` with `schemaVersion = 1`
  (`GameStateSaveDataV1.CurrentSchemaVersion`), plus `PlayerSaveSlotMetadataData`
  (`slotId`, `saveVersion`, `createdUtc`, `lastSavedUtc`/`lastPlayedUtc`, `totalPlayTimeSeconds`).
- `GameStateSaveCodec.MaximumPayloadBytes = 8 * 1024 * 1024` (8 MiB), enforced on both write and
  read.
- Atomic local replacement via a staging file + backup suffix (`GameStateSaveFileStore`,
  `.tmp`/`.bak`).
- No pause-menu manual save. Writes come only from New Game, bounded autosaves, and
  **fatal-extraction transactional commits**: `FatalExtractionController` performs two atomic
  commits (first: post-extraction state + `PendingFatalExtraction` marker; second: clears the
  marker after relocation/restore completes), and reload is idempotent by extraction ID
  (`Documentation/development/save-slots-fatal-extraction-integration.md`). Exiting the game does
  not itself create a save.

This contract treats the file this system successfully commits as **one opaque artifact per
slot**. It does not define a second gameplay-state schema, and it does not give the cloud
visibility into `GameStateSaveDataV1`'s internal shape.

## Core product invariants

1. Secret Robot remains local-first. Local save/load/Continue work fully offline.
2. A Sweat This account is required only for cloud backup/sync, never for offline play.
3. Cloud failure (outage, timeout, auth failure) must never make a valid local save unusable.
4. Cloud sync uploads only a save artifact the local codec has already committed successfully —
   never a partial write, never a speculative in-memory state.
5. Exiting the game is not a save event and must never itself create a new cloud revision.
6. Unity/`GameStateSaveCodec` remains the sole authority for serialization, validation, schema
   migration, and restore. The Backend never parses, migrates, or field-merges the payload.
7. Conflict resolution is revision/hash-based, never timestamp-based, and never destroys the
   losing branch outright (see "Sync ancestry and conflict decision model").
8. Level 5 Backend-authoritative correspondence/results (friends, challenges, sealed results) are
   entirely outside this system — see "Level 5 boundary".

## Three kinds of metadata (kept separate)

Conflating these is the most likely source of a bad design later, so the boundary is explicit:

### Gameplay-save metadata — owned by Murderlands, unchanged

Already exists as `PlayerSaveSlotMetadataData`: `slotId`, `saveVersion`, `createdUtc`,
`lastSavedUtc`, `totalPlayTimeSeconds`. This never gains cloud fields.

### Cloud metadata — owned by Backend

Conceptually: `CloudRevision`, `CloudStoredAtUtc`, `PayloadHash`, `PayloadSizeBytes`. This is
server-side state describing what the Backend is holding; it is not embedded in the gameplay
save document.

### Local sync metadata — owned by a future game-client sync adapter, stored separately

Conceptually: account association, `GameKey`, `SlotId`, `LastSyncedCloudRevision`,
`LastSyncedPayloadHash`. This is a sidecar file next to (not inside) `GameStateSaveDataV1`.

**Rule:** loading an older gameplay save must never resurrect stale sync ancestry alongside it.
If a player loads `slot_002` from six months ago, that slot's sync sidecar — not
`GameStateSaveDataV1` — is what determines whether it looks "ahead of," "behind," or "diverged
from" the current cloud head. Embedding ancestry inside the gameplay document would make an old
save carry sync state that no longer describes anything real.

## Stable game namespace (`GameKey`)

No immutable, cross-project machine identifier for "this game" currently exists. Searches of
`Level5Backend`, `level5frontend`, and `murderlands` at the audited SHAs found no `GameKey` (or
equivalent) constant anywhere. The closest existing thing is `level5frontend`'s route slug
`secret-robot` (`src/lib/platform/destinations.ts`) — a **UI label**, not a namespace contract,
and explicitly not suitable to freeze here: a marketing rename, a route restructure (#20/#21), or
a future non-Unity build must not be able to silently orphan cloud saves.

This contract requires only that:

- an immutable `GameKey` is defined before any Backend cloud-save capability accepts uploads;
- it is independent of display title, marketing title, save filename, and route label;
- Backend rejects any `GameKey` it does not recognize (an allowlist, not free-form text).

Freezing the exact value (e.g. `"secret-robot"` vs `"murderlands"` vs a generated ID) is **out of
scope for #28** and is deliberately left as an open decision for whichever issue first needs it
(most likely the Backend cloud-save service issue below).

## Account ownership

Backend V2 already has the right shape to build on: `ICurrentAccountAccessor.GetCurrentAccountId()`
derives `AccountId` server-side from the JWT `sub` claim
(`v2/src/Level5.Api/Security/ICurrentAccountAccessor.cs`) — no endpoint trusts a client-supplied
account identifier. Cloud save must follow the identical pattern:

- No API accepts a client-supplied `AccountId`/`OwnerId`/`UserId` for authorization. Ownership is
  always derived from the authenticated request, exactly as `AccountController` and
  `GetCurrentAccountUseCase` already do for existing account data.
- Every cloud slot is conceptually scoped by `(authenticated account, GameKey, SlotId)`.
- `SlotId` is an identifier passed in a request/response body, never a filesystem path. It is
  never interpolated into a storage path without the same validation
  `GameStateSavePath.BuildSlotCanonicalPath` already applies locally (reject path separators,
  `.`/`..`, invalid filename characters).
- For Secret Robot today, the only valid `SlotId` values are the three existing stable IDs
  (`slot_001`, `slot_002`, `slot_003`).

## Sync ancestry and conflict decision model

Conflict detection is revision/hash-based. Wall-clock timestamps are **never** compared to pick a
winner — they are presentation-only, shown to the player for context, never used by the
algorithm.

Definitions:

```text
L  = current local payload hash
R  = current cloud revision
H  = current cloud payload hash

R0 = last cloud revision this account/device/slot successfully synchronized
H0 = payload hash synchronized at R0
```

Decision table:

| Case | Condition | Action |
|---|---|---|
| Equal | `L == H` | Already identical; record current cloud baseline. No transfer needed. |
| Local only | local exists, cloud absent | Create cloud head from local. |
| Cloud only | local absent, cloud exists | Safe download candidate (fresh device / new install). |
| Local changed only | `R == R0` and `L != H0` | Upload local using `ExpectedCloudRevision = R0`. |
| Cloud changed only | `L == H0` and `R != R0` | Cloud can safely replace local after normal validation (download/apply pipeline below). |
| Diverged | `L != H0` and `R != R0` | Explicit conflict. Surface the conflict UX; do not auto-resolve. |
| First sync, both exist, hashes equal | no baseline, local exists, cloud exists, `L == H` | Establish baseline; no transfer. |
| First sync, both exist, hashes differ | no baseline, local exists, cloud exists, `L != H` | Explicit conflict — this is not a "local changed" case because there is no `R0`/`H0` to compare against. |

## Upload concurrency

Uploads use optimistic concurrency, not locks. A client-side gameplay session never holds a
cross-request lock on a cloud slot.

- Every upload carries `ExpectedCloudRevision`.
- The Backend commits the new revision only if the current head still equals
  `ExpectedCloudRevision`; otherwise it returns `409 Conflict` and commits nothing.
- On `409`, the client re-fetches cloud metadata and re-evaluates against the decision table
  above (the head has moved, so this is now at minimum a "cloud changed" or "diverged" case).

## Upload idempotency

Cloud revision creation is a mutation with a real "ambiguous outcome" failure mode (the exact
failure mode `level5frontend`'s own BFF already treats seriously for Backend V2 refresh calls —
see `docs/architecture/web-authentication.md`, "Refresh outcome classification": a timeout or
dropped connection does not tell the caller whether the server-side effect happened).

- Every upload carries a client-generated `UploadOperationId`/`ClientRequestId`.
- Retrying the same logical upload after a lost response returns the **same** committed result —
  it must not create a second cloud revision.
- No generic automatic retry is added without this idempotency support; a naive retry-on-timeout
  is exactly what would silently double-commit an ambiguous upload.

## Payload integrity

- A cryptographic hash of the payload is required. The server computes or independently verifies
  it — a client-asserted hash alone is never trusted as authoritative, the same way Backend V2
  never trusts client-supplied identity.
- Downloaded bytes are hash-verified before being handed to the local apply pipeline.
- The hash is internal plumbing: never shown to the player as an identity, never used as a
  telemetry dimension (see "Security and privacy").

## Download / local apply order

Cloud content never replaces the canonical local save file before this full sequence completes,
reusing the existing codec/atomic-write path rather than adding a second deserializer:

```text
download bytes
→ verify transport/integrity (payload hash)
→ enforce payload-size limit (GameStateSaveCodec.MaximumPayloadBytes)
→ GameStateSaveCodec.TryDeserialize
→ save-format compatibility check (SaveFormatVersion)
→ semantic prevalidation in current game context
→ preserve the divergent local file as a recovery branch when this is a conflict resolution
→ atomic local replacement (GameStateSaveFileStore's existing staging/backup mechanism)
→ update the local sync sidecar's baseline (R0/H0)
```

No new cloud-specific deserializer is introduced. If any step fails, the canonical local save is
left untouched.

## Save-format compatibility vs. cloud revision

`SaveFormatVersion` (Unity's schema version) and `CloudRevision` (Backend's sequence number) are
unrelated axes and must never be conflated in code or UI. If a cloud save's `SaveFormatVersion`
is newer than the installed game can read:

- do not overwrite the local save;
- do not attempt field-level conversion in the Backend (the Backend cannot parse the payload —
  it is opaque to it);
- show an "Update Required" / incompatible-save state and stop.

Unity owns migration between save-format versions, exactly as it already does for local saves.
The Backend only ever stores and returns bytes.

## Payload limits

The cloud service's initial accepted payload size must be **at least** 8 MiB plus its own
transport/envelope overhead, since `GameStateSaveCodec` already rejects anything larger than
8 MiB locally — a cloud limit smaller than that would reject saves the game itself considers
valid. Beyond that floor, this contract requires the Backend define (without choosing storage
technology):

- a hard payload limit,
- an account/game quota,
- rate limiting.

## Conflict UX

The primary conflict UX belongs in the **Secret Robot game client**, because the web browser has
no access to Unity's local save files or the local sync sidecar (see "Web account UX boundary").

Shown information, deliberately without implying a correct choice via timestamp emphasis:

```text
This Device                       Cloud
SAVE <n>                          SAVE <n>
Last saved                        Save made
Play time                         Backed up
Save format                       Play time
                                   Save format
```

Primary actions: **Keep This Device**, **Use Cloud**, **Cancel**.

- **Keep This Device** — upload local using `ExpectedCloudRevision = R0` (or the just-observed
  head), creating a new cloud revision; the prior cloud head is preserved in bounded history, not
  deleted.
- **Use Cloud** — download the current cloud head, validate through the full apply pipeline
  above, preserve the divergent local file for recovery, atomically replace the canonical local
  save, record the new sync baseline.
- **Cancel** — leave both branches untouched; pause that slot's synchronization rather than
  silently retrying.

If cloud state changes while the dialog is open, the chosen action's upload/download must fail
concurrency validation (the revision moved) and re-evaluate against the decision table, rather
than blindly applying a decision made against stale metadata.

## Web account UX boundary

The web account (`level5frontend`) cannot inspect a player's local save file, `persistentDataPath`,
or local sync sidecar — those exist only on the device running Unity. Per #25's product rule
("Sweat This owns the account. Games own their data."), the future
`/account/games/secret-robot/saves` surface (already reserved as "future only" in #25) may expose
**only** cloud-side/account-side data once real capability exists:

```text
cloud-backed slots
last cloud backup
play time metadata (as recorded in cloud metadata)
save format
backup history
delete/recovery operations
```

Actual local-vs-cloud conflict resolution stays in the game client. #28 does not add this page,
its routes, or any fake state (`Sync Now`, `Cloud Saves`, `0 backups`, `Cloud unavailable`,
`Backup enabled`) to production — #25 already establishes that account UI must not show fake
cloud-save state, and this contract reinforces it explicitly for this feature.

## Secret Robot authentication prerequisite

Audited `murderlands` `dev` has no Sweat This account/network authentication client — no
account/login/auth-related source under `Assets/_Murderlands/Scripts/` beyond incidental
substring matches (e.g. "Authoring" tooling classes). Cloud sync therefore has a hard
prerequisite this contract does not attempt to satisfy: a **separate Secret Robot game-client
authentication issue**, establishing an authenticated game-client session against Backend V2.

Unity/game-client authentication is not routed through the browser BFF (`level5frontend`'s
`docs/architecture/web-authentication.md`) merely because that BFF already has a session model —
the Unity process and the browser are different trust boundaries with different credential
storage, different attack surfaces, and no shared origin. The exact mechanism (direct
device-flow-style auth against Backend V2, a Unity-native token store, etc.) belongs entirely to
that follow-up issue.

## Account switching

- Local saves exist independently of whichever Sweat This account is currently signed in on that
  device.
- Signing into a different account never silently uploads pre-existing local saves — cloud
  association for a slot is a deliberate, explicit action, not an automatic side effect of login.
- Local sync ancestry (`LastSyncedCloudRevision`/`LastSyncedPayloadHash`) is account-scoped: if
  the sidecar's associated account no longer matches the signed-in account, that slot has no
  baseline for the new account and falls into "first sync" handling.
- Signing out: does not delete local saves, disables further cloud sync, and does not convert
  local saves into another account's cloud saves.

## Offline / degraded behavior

- A network or Backend failure must never block local save, local load, or Continue.
- Cloud sync may simply remain pending; there is no requirement that it retry aggressively.
- When connectivity returns, the client re-evaluates via the decision table above before doing
  anything — an offline local save is never assumed to be entitled to overwrite whatever the
  cloud head has become in the meantime.

## Backup history

- The Backend supports a small, bounded, immutable history of successful cloud revisions per
  slot. Exact retention count/duration is left to the Backend implementation issue — no product
  requirement fixes it here.
- Old revisions are immutable; the head revision is always explicit and unambiguous.
- A conflict-resolution upload (the "Keep This Device" path above) preserves the prior head in
  history rather than discarding it.
- Storage-provider implementation (object store, database, etc.) is never exposed to clients.

## Historical restore / save-scumming boundary

Cloud history is disaster-recovery infrastructure, not a routine gameplay-rewind feature. This
matters concretely for Secret Robot because its persistence model is deliberately built around
**no** normal pause-menu manual-save/load loop and transactional fatal-extraction commits
(see "Current save architecture is authority" above) — a generic "load any old backup" feature
would cut directly against that design intent (death rewind, item-loss rewind, world-history
rewind, quest rewind, economy rewind all become implicitly available otherwise).

- #28 does not specify routine "load any old backup" as an initial feature.
- If historical restore is ever supported, it requires an explicit, separate product/game-design
  decision, and restoring an old revision must create a **new** head revision (preserving later
  history), never rewind/decrement the cloud revision counter.

## Security and privacy

Save payloads are private user data — `GameStateSaveDataV1` can carry player-authored content
(e.g. map annotation text via `CartographySaveSection`/`CartographySaveData`), not just structured
game state. Required, consistent with how `level5frontend`'s BFF already treats credentials and
`Level5Backend` already treats auth secrets:

```text
authenticated ownership (server-derived, never client-asserted)
TLS
private storage
size limits
rate limits
quota enforcement
integrity checking (payload hash, verified before apply)
safe deletion policy
```

Never logged: save payload bytes, map annotation text, tokens, `AccountId` as a telemetry
dimension, payload content of any kind. Storage references (blob keys, internal IDs) are never
exposed to clients. At-rest encryption and other storage-provider-specific controls are the
Backend/storage implementation issue's responsibility, not decided here.

## Conceptual Backend capabilities (not endpoint shapes)

The Backend must eventually support these capabilities; #28 deliberately does not freeze HTTP
routes, database tables, or storage technology:

```text
List game cloud slots
Get current slot/head metadata
Upload a new slot revision (ExpectedCloudRevision + UploadOperationId)
Download an exact slot revision
List bounded revision history
Retrieve a historical revision
```

Optional/future: explicit cloud-slot deletion/recovery.

## Conceptual metadata (names/types not frozen)

```text
GameKey
SlotId

CloudRevision
SaveFormatVersion

PayloadHash
PayloadSizeBytes

SaveCreatedAtUtc
LastLocalSavedAtUtc
TotalPlayTimeSeconds

CloudStoredAtUtc
```

Explicit decisions on the recurring ambiguous fields:

- `AccountId` — server-derived from authenticated identity, exactly like
  `ICurrentAccountAccessor` today. Never client authority.
- `BlobReference` — Backend-internal only; never returned to a client.
- `DeviceId` — optional/future; **not** required for conflict detection (the decision table above
  works entirely from revision/hash ancestry, not device identity).
- Timestamps — presentation only, never conflict authority.

## Level 5 boundary

Cloud saves are explicitly separate from Backend-authoritative Level 5 state. A Secret Robot
cloud save/restore must never include or restore: Sweat This account identity, Player Tag,
friends, Level 5 challenge/series state, or Level 5 authoritative results. Restoring a Secret
Robot backup cannot rewind or modify Level 5 correspondence. The first Secret Robot cloud-save
implementation must not be generalized into a mechanism that silently absorbs unrelated
server-authoritative game state — Level 5's competition/correspondence system keeps its own,
already-established authority model untouched.

## Validation walkthrough

For each scenario: local result / cloud result / conflict behavior / data-loss protection /
user-visible state.

| # | Scenario | Local result | Cloud result | Conflict behavior | Data-loss protection | User-visible state |
|---|---|---|---|---|---|---|
| 1 | New local save; no cloud | Save committed normally | Absent | "Local only" → create cloud head | N/A — nothing to lose yet | Normal save flow; cloud catches up silently or on next sync |
| 2 | Cloud save; fresh device, no local file | Absent | Present | "Cloud only" → safe download | N/A | Slot shows as available-to-restore before first local save exists |
| 3 | Local/cloud payloads identical | Unchanged | Unchanged | "Equal" → record baseline only | N/A | No visible action; baseline silently established |
| 4 | Local progressed offline | Newer than last sync | Stale (`R == R0`) | "Local changed only" → upload with `ExpectedCloudRevision = R0` | Old cloud revision retained in history until replaced | Sync completes once online; no prompt needed |
| 5 | Another device progressed cloud | Stale (`L == H0`) | Newer (`R != R0`) | "Cloud changed only" → safe download after full apply pipeline | Local file replaced only after validation; no prompt needed since local has no divergent changes | Save updates transparently (or on next launch) |
| 6 | Both branches progressed independently | `L != H0` | `R != R0` | "Diverged" → explicit conflict UX | Both branches preserved (losing side kept as recovery branch / prior cloud head kept in history) | Conflict dialog: Keep This Device / Use Cloud / Cancel |
| 7 | First sync where both branches already exist | No baseline | No baseline | Hash equal → establish baseline; hash differs → explicit conflict | Same as diverged case when hashes differ | Conflict dialog only if hashes differ |
| 8 | Upload committed but response lost | Unchanged | New revision committed server-side | Retry with same `UploadOperationId` returns the same committed result | No duplicate revision created | No visible error if idempotent retry succeeds transparently |
| 9 | Cloud changes while conflict screen is open | Unchanged until user acts | Head has moved past what the dialog was showing | Chosen action's concurrency check fails (`409`); re-fetch and re-evaluate | Neither branch is overwritten blindly | Dialog re-evaluates/refreshes rather than silently applying a stale decision |
| 10 | Corrupt cloud payload | Unaffected | Hash verification fails on download | Treated as a download failure, not applied | Local save is never touched | Backup/restore reports failure; local play continues unaffected |
| 11 | Cloud save from newer unsupported game version | Unaffected | Present but `SaveFormatVersion` unreadable by installed game | Format-compatibility check fails before apply | Local save is never overwritten; Backend never attempts field-level conversion | "Update Required" / incompatible-save state |
| 12 | Account A signs out, Account B signs in, same device | Unaffected | N/A | Local saves are not re-owned; B's sync sidecar (if any) is separate from A's | A's local saves are never auto-uploaded to B, never deleted | B sees no cloud data for A's local saves unless B explicitly associates them |
| 13 | Backend/cloud unavailable while player saves locally | Save proceeds and commits normally | Unreachable | Sync marked pending; no retry loop blocks gameplay | Local save integrity is entirely unaffected by Backend outage | No blocking error; sync resumes later |
| 14 | Local fatal-extraction save commits while offline | Two-phase atomic commit completes locally per existing fatal-extraction design | Unreachable at commit time | Once online, the fully-committed post-second-commit artifact is evaluated as an ordinary "local changed only"/"diverged" case — cloud sync never observes or participates in the two intermediate commit phases | The existing local atomic-write/pending-marker mechanism already protects this; cloud sync adds no new risk since it only ever sees the final committed file | No special UI; behaves like any other offline local save once connectivity returns |
| 15 | User requests recovery from cloud history | N/A until user acts | A bounded historical revision is retrieved | Restoring history creates a new head revision (never rewinds/decrements); full apply pipeline still applies | Later history is preserved, not discarded, by the restore | Explicit, deliberate user action — not a routine rewind feature (see "Historical restore" boundary) |

## Follow-up issues required for actual implementation

This contract is not implementable on its own. It anticipates:

1. **Backend V2 — Cloud Save Service / Revision API.** Auth ownership derivation, `GameKey`/
   `SlotId` namespace, metadata storage, compare-and-swap revision commits, upload idempotency,
   bounded history, a payload-store abstraction (no provider chosen), quota/rate limits.
2. **Secret Robot — Sweat This Account Authentication.** The authenticated game-client session
   prerequisite described above; nothing cloud-save-related can be built before this exists.
3. **Secret Robot — Cloud Save Sync Adapter.** The local sync sidecar, payload hashing,
   upload/download against the Backend capability above, offline behavior, first-sync handling,
   the conflict UX described here, atomic local apply, and divergent-branch recovery handling.
4. **Web frontend — Secret Robot Cloud Backup Account UI.** Only once (1) and (3) exist;
   cloud-side metadata/history surfaced under `/account/games/secret-robot/saves` per #25, never
   direct local-save inspection.
5. **Certification.** Cross-device/cloud conflict/recovery certification: multi-device sync,
   offline divergence, lost-upload-response idempotency, account switching, unsupported save
   versions, corruption, and Backend outage — mirroring the rigor `level5frontend`'s own
   `web-authentication.md` certification (issues #3/#5) already applies to session/refresh
   concurrency.

## Explicitly unresolved (deliberately, not by oversight)

- The exact `GameKey` value/format.
- Exact backup-history retention count/duration.
- Object storage/database technology for the Backend implementation.
- Exact HTTP route shapes, request/response DTO field names and types.
- The exact Secret Robot game-client authentication mechanism.
- Whether/when historical restore ships as a real feature at all (currently: not in scope).

## Non-goals for #28

- Choosing or implementing an object storage provider or database schema.
- Implementing any upload/download endpoint.
- Any production cloud sync behavior.
- Unity networking/authentication implementation.
- Frontend cloud controls (real or placeholder) in production.
- Field-level save merging.
- Save-format redesign.
- Arbitrary historical rollback as a shipped feature.
- Level 5 persistence redesign or competition-state restore.
