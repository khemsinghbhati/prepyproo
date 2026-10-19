# PrepPro — Architecture and data model

## 1. System overview

PrepPro is a static, single-page web app served by Firebase Hosting. The frontend uses HTML, CSS, and vanilla JavaScript. Firebase Authentication identifies the signed-in account, IndexedDB stores that account's local workspace, and Cloud Firestore synchronizes complete workspace snapshots across devices.

The app has one account model: a Firebase Authentication UID. Both local and cloud records are scoped to that UID. The cloud model does not create a second type of user or a separate profile for Notes, links, quizzes, or other feature areas.

### Main responsibilities

- **Browser UI:** Renders the learning hierarchy, authoring forms, flashcards, quiz flow, Notes editor, and analytics.
- **Shared app state:** Holds the active workspace in the global `data` object used by the feature modules.
- **Local persistence:** Writes the workspace to IndexedDB so UI changes do not depend on a successful network request.
- **Cloud sync:** Serializes the complete workspace, uploads chunk documents sequentially, and publishes a compact manifest in the account's root Firestore document.
- **Image hosting:** Uploads image content to ImgBB and saves the resulting URLs in workspace data. Firestore synchronizes the URLs and associated metadata, not the image bytes themselves.

## 2. Runtime and module structure

`public/index.html` defines the app shell and loads the UI scripts in a deliberate order. These UI modules are classic scripts and extend the shared `window.app` object; they rely on the existing DOM, global state, and inline event handlers. `public/firebase-auth.js` is loaded last as an ES module and owns sign-in and persistence.

| File | Responsibility |
| --- | --- |
| `public/index.html` | Shared markup, page shell, stylesheet links, and JavaScript load order |
| `public/app-state.js` | Global application state, IDs, default values, view state, and initial `window.app` object |
| `public/app-core.js` | App initialization, navigation, common UI helpers, data normalization, and the shared save entry point |
| `public/app-learning-path.js` | Subject/topic/subtopic operations, learning-path rendering, image selection/upload, and content navigation |
| `public/app-content-editor.js` | Subtopic editor and question-set management |
| `public/app-flashcards.js` | Flashcard authoring, editing, and ordering |
| `public/app-questions.js` | MCQ, MSQ, and numerical-question forms and validation |
| `public/app-study-session.js` | Learner flashcards, quiz execution, scoring, XP, and attempt recording |
| `public/app-notes.js` | Notes pages, drawing canvas, text-box layer, page sizing/ordering, backgrounds, and ImgBB persistence |
| `public/app-analytics.js` | Progress summaries, analytics, charts, attempt history, and attempt details |
| `public/app-events.js` | Document-level event wiring, including image paste handling |
| `public/firebase-auth.js` | Firebase Auth, IndexedDB, Firestore snapshot sync, save status, and JSON export/import |
| `public/styles/` | Base, responsive, overlay, animation, scrollbar, flashcard, learning-path, and Notes styles |
| `firebase.json` | Firebase Hosting configuration, emulator ports, and the rules file used by the Firestore emulator |
| `firestore.rules` | Owner-only access to account documents, snapshot metadata, and snapshot chunks |
| `.github/workflows/` | Pull-request preview deployments and live Hosting deployment from `main` |

### Shared workspace structure

The app data is a single JavaScript object. At the top level it contains the learning `subjects` hierarchy and `xp`, as well as app-level settings and progress fields. Subjects contain topics; topics contain subtopics; subtopics contain flashcards, question sets/questions and Notes pages. Question sets also hold attempt history. Notes page metadata includes image URLs, text boxes, drawing-layer references, dimensions, and background configuration.

Feature modules update the shared state and call the shared save API. They should not write directly to Firestore or IndexedDB; persistence and conflict handling remain centralized in `public/firebase-auth.js`.

## 3. Persistence model

### IndexedDB local workspace

- **Database:** `preppro-local-data`
- **Object store:** `users`
- **Key:** Firebase Authentication UID
- **Record:** UID, complete workspace data, local update time, and local schema version

When the user saves a change, PrepPro commits the current workspace to IndexedDB first. A failed local write is surfaced as a save error; the app does not pretend that a failed local save succeeded.

After a local save completes, cloud sync is scheduled with a short debounce (750 ms). Multiple rapid UI changes can be coalesced into a single upload of the latest complete workspace.

IndexedDB is browser-local. It allows that browser to reopen its local workspace and support offline editing, but it is not itself cross-device storage. Cloud Firestore is responsible for synchronizing data to another browser or device.

### Firestore structure

The current cloud model is:

```text
users/{uid}                                              Compact active-snapshot manifest
└── syncSnapshots/{snapshotId}                           Snapshot metadata and upload status
    └── chunks/{chunkId}                                 Base64-encoded payload chunks
```

All paths belong to the same Firebase Authentication UID.

#### Root manifest: `users/{uid}`

This document stores only the metadata needed to find and validate the active snapshot. Current fields are:

| Field | Purpose |
| --- | --- |
| `_prepProCloudSyncSchema` | Cloud snapshot format version |
| `_prepProCloudSnapshotId` | ID of the active snapshot generation |
| `_prepProCloudChunkCount` | Expected number of chunks |
| `_prepProCloudTotalBytes` | Length of the serialized UTF-8 payload before Base64 encoding |
| `_prepProCloudSha256` | SHA-256 hash of the full serialized payload |
| `_prepProCloudSnapshotHistory` | Recent snapshot IDs retained for safe cleanup |
| `_prepProCloudUpdatedAt` | Firestore server timestamp for the active snapshot |

The root document is intentionally small. Firestore imposes a 1 MiB maximum document size, so the app's complete workspace does not belong in this document.

#### Snapshot metadata: `users/{uid}/syncSnapshots/{snapshotId}`

The parent snapshot document records the snapshot ID, chunk count, byte count, SHA-256 hash, status (`uploading` or `ready`), and creation timestamp. A snapshot can become the active root manifest only after all its chunks have been acknowledged and its status is set to `ready`.

#### Chunk documents: `users/{uid}/syncSnapshots/{snapshotId}/chunks/{chunkId}`

Each chunk document contains its snapshot ID, zero-based index, and Base64-encoded payload. Chunk document IDs are zero-padded numeric indices, such as `00000000`, to keep the order clear.

## 4. Cloud snapshot upload protocol

The uploader is implemented in `writeCloudUserSnapshot` in `public/firebase-auth.js`.

1. The current workspace is copied into a JSON representation, with the reserved sync-metadata fields removed from the app data.
2. `TextEncoder` converts the JSON to UTF-8 bytes. PrepPro computes SHA-256 over the entire byte sequence.
3. The uploader chooses a unique snapshot ID and calculates the number of chunks. Raw chunks are about **300 KiB** each.
4. It creates the parent snapshot document with status `uploading`.
5. It writes chunk 0 and awaits `setDoc` to resolve. Only after Firestore acknowledges that write does it write chunk 1. It repeats this **strictly sequentially** for all chunks and reports progress in the save-status area.
6. After every chunk has been acknowledged, it marks the parent snapshot `ready`.
7. It publishes the new root manifest in `users/{uid}`. This is the point where the new snapshot becomes active.
8. After the root manifest is committed, it schedules cleanup for snapshot generations outside the retained recent history.

Base64 adds overhead, so a 300 KiB raw chunk is roughly 400 KiB when encoded—well below Firestore's 1 MiB per-document limit. Chunking avoids a single oversized Firestore document and bounds each individual write. It does not make total application memory usage constant: the app still serializes the whole workspace before upload.

The acknowledgement used here is Firestore's server write acknowledgement, not an acknowledgement sent directly by the receiving device. Upload can finish while another device is offline; that device reads the new active manifest when it reconnects.

### Interruption safety

The root manifest is not updated while the snapshot is partially uploaded. If a write fails, the app reports a cloud-sync error and leaves the previous active manifest in place. Cleanup of a failed generation is attempted, and readers never discover it through the active manifest.

## 5. Download protocol and integrity validation

The reader is implemented in `readCloudUserData`.

1. It validates the root manifest fields and calculates the expected number of chunks from the total byte count.
2. It fetches a single chunk document and validates the chunk's snapshot ID, index, Base64 payload, and expected size before requesting the next chunk.
3. It confirms the assembled byte count exactly matches the manifest.
4. It assembles the complete byte sequence, recalculates SHA-256, and compares it to the manifest hash.
5. It parses UTF-8 as JSON and validates the essential workspace shape (`subjects` must be an array and `xp` must be finite).
6. The complete validated workspace is then saved to IndexedDB and exposed to the UI.

If a chunk is missing, malformed, mis-sized, or fails the hash check, PrepPro does not apply a partial workspace. It reports the issue and preserves the current local data. Download requests are sequential, but the current implementation retains chunk byte arrays and assembles a full byte array for SHA-256 and JSON parsing. Extremely large workspaces can therefore exceed available browser memory.

## 6. Login, initialization, and device sync

When Firebase Authentication reports a signed-in user:

1. PrepPro reads that UID's local IndexedDB record, if present.
2. It reads the root manifest at `users/{uid}`.
3. If a valid manifest exists, it downloads and validates the referenced snapshot. If no local workspace is present, the cloud snapshot is saved to IndexedDB. If both local and remote workspaces exist, the app compares their contents and timestamps to decide which copy should be retained.
4. If no cloud manifest exists but local data does exist, PrepPro keeps that local workspace and schedules its first cloud snapshot.
5. If neither local data nor a cloud manifest exists and Firestore can be checked successfully, PrepPro creates a default workspace, saves it locally, and schedules its initial upload.
6. If cloud access fails and there is no local workspace to use safely, sign-in loading stops with an error rather than silently creating and uploading a blank workspace.

After initialization, an `onSnapshot` listener watches `users/{uid}` for new active manifests. Remote snapshots are validated before use. An incoming update is deferred while the current app view cannot safely refresh (for example, when a quiz or editing workflow is active). Local edits already queued for upload take precedence over an incoming snapshot until the local write is resolved.

Every device must sign in using the same Firebase Authentication account to share the same UID and workspace. No direct device-to-device connection is involved.

## 7. Offline behavior, save status, and backups

- Local IndexedDB writes happen before cloud upload is queued.
- When the browser is offline, data can remain saved locally and the queued cloud write is retried when connectivity returns.
- Save-status text distinguishes local saving, upload progress, successful sync, download progress, and cloud errors.
- Export creates a JSON envelope that includes the current account UID and workspace data. Import requires the matching UID, validates the envelope, asks for confirmation, then writes the imported workspace locally and queues a cloud update.
- Browser storage may be cleared, unavailable, or insufficient. Users should keep periodic exports if the workspace is valuable.
- There is no fixed application-level 100 MiB cutoff, but browser RAM, JSON serialization, typed-array limits, Firestore quotas, network reliability, and device capacity remain practical limits.

## 8. Notes and external image storage

Notes pages, backgrounds, text boxes, page dimensions, and image URLs are saved as fields within the workspace and are included in the full snapshot. Image bytes themselves are uploaded to ImgBB. A Notes page may store the uploaded source page URL, transparent drawing-layer URL, and composed page-image URL; those URLs are part of the synced workspace. Deleting a Notes page from PrepPro does not delete media already uploaded to ImgBB.

Flashcard/question images are also represented in workspace data as image URLs. Consequently, cross-device sync transfers URL metadata rather than re-uploading every image file.

The current frontend contains the ImgBB upload integration in client-side JavaScript. Anything embedded in browser-delivered code should be treated as visible to users; do not put Firebase service-account credentials or other privileged secrets in frontend files.

## 9. Firestore security rules

`firestore.rules` restricts each account to documents whose `userId` matches the authenticated Firebase UID:

- `users/{userId}` — root manifest
- `users/{userId}/syncSnapshots/{snapshotId}` — snapshot metadata
- `users/{userId}/syncSnapshots/{snapshotId}/chunks/{chunkId}` — payload chunks

Firestore rules apply only when the authenticated owner matches the UID in the path. The Firestore emulator loads the checked-in rules through `firebase.json`. Publishing security rules is separate from deploying the website; when production rules are changed, preserve any unrelated project rules and publish the correct combined rule set.

## 10. Local development and deployment

### Local emulator environment

On `localhost`, `127.0.0.1`, and loopback hosts, `public/firebase-auth.js` initializes Firebase with the `demo-prepyproo` project ID and connects to the Auth emulator on port 9099 and Firestore emulator on port 8080. Hosting is served on port 5000 and the Emulator UI on port 4000. This separates local test data from the deployed project.

Start the local environment from the repository root:

```bash
firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
```

Then open `http://127.0.0.1:5000`. See [How to test Locally.md](../How%20to%20test%20Locally.md) for the Windows walkthrough and test checklist.

### Pull-request previews and live Hosting

- The pull-request workflow deploys the PR branch to a Firebase Hosting preview.
- The live Hosting workflow runs on pushes to `main`.
- A Hosting preview isolates the webpage deployment from `main`, but the client still points to the configured Firebase project on non-localhost hosts. Preview usage can affect that project's Auth/Firestore data. In particular, the current live `main` code writes the complete workspace directly to `users/{uid}`, while this branch uses the same root document for the compact snapshot manifest. Do not use the same account against both builds while those formats differ. Use emulators or a separate Firebase project for preview data until the new code is merged and live.

## 11. Change and testing guidelines

1. Keep UI changes in the module that owns the feature, and preserve the script order in `public/index.html`.
2. Use `app.save()` / `window.saveUserData` for workspace saves. Do not add feature-specific Firestore or IndexedDB writers.
3. Changes to the workspace schema or persistence contract should be coordinated with normalization in `public/app-core.js` and the serialization/validation code in `public/firebase-auth.js`.
4. Test both local saves and remote sync with the Auth and Firestore emulators. Use two browser profiles signed into the same emulator account to exercise cross-device behavior.
5. Test a serialized workspace over 1 MiB so multiple chunks are required; confirm sequential acknowledgements, full-snapshot validation, and no partial application on interruption.
6. Regression-test Notes images and drawing layers, flashcard editing/order, MCQ/MSQ/numerical quizzes, quiz history, XP, Analytics, offline reconnection, and JSON export/import.
7. Review the Hosting preview and emulator tests before merging a pull request. A successful preview deployment alone is not an end-to-end browser test.
