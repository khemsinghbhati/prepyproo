# PrepPro — Local setup and test plan (Windows)

This guide runs PrepPro from the repository with local Firebase emulators. The local app uses IndexedDB in each browser and the Firestore/Auth emulators for account sign-in and cross-device synchronization. Emulator data is separate from the deployed Firebase project.

> **Safety rule:** Use `demo-prepyproo` and `http://127.0.0.1:5000` for local testing. Do not run `firebase deploy` during this workflow. A Hosting preview is not the same as an emulator: the preview frontend points at the Firebase project configured in the client code.

## 1. Open PowerShell in the repository

Use the folder where you cloned PrepPro. For example:

```powershell
cd C:\Users\bhati\prepyproo
```

Check the current branch and working tree:

```powershell
git status
git branch --show-current
```

If there are uncommitted changes, commit or back them up before switching branches. If you need to stash both tracked and untracked changes:

```powershell
git stash push -u -m "Backup before PrepPro local test"
```

Fetch the latest branch from GitHub and switch to the branch being tested:

```powershell
git fetch origin
git switch feature/add-notes-pages
git pull origin feature/add-notes-pages
```

If the branch is not present locally, create a tracking branch:

```powershell
git switch --track origin/feature/add-notes-pages
```

You can apply the same process to another feature branch by changing the branch name.

## 2. Install prerequisites

### Java

The Firebase emulators require Java 21 or newer. Check the installed version:

```powershell
java -version
```

If Java is missing or too old, install Microsoft OpenJDK 21:

```powershell
winget install Microsoft.OpenJDK.21
```

Open a new PowerShell window and run `java -version` again after installation.

### Node.js and npm

Check whether Node.js and npm are available:

```powershell
node --version
npm --version
```

Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/) if either command is unavailable.

### Firebase CLI

Install or update the Firebase CLI:

```powershell
npm install -g firebase-tools
firebase --version
```

## 3. Start the local website and emulators

From the repository root, run:

```powershell
firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
```

Keep this terminal open while testing. The configured endpoints are:

| Service | Local address |
| --- | --- |
| PrepPro website | `http://127.0.0.1:5000` |
| Firebase Emulator UI | `http://127.0.0.1:4000` |
| Authentication emulator | `127.0.0.1:9099` |
| Firestore emulator | `127.0.0.1:8080` |

Open **http://127.0.0.1:5000** to use PrepPro. The Emulator UI is for inspecting local Auth/Firestore data, not the app itself.

On loopback hosts the client uses project ID `demo-prepyproo` and connects to the Auth and Firestore emulators. Do not switch local tests to the production project ID.

## 4. Understand the sync data model before testing

The cloud layout used by the current code is:

```text
users/{uid}                                            Active snapshot manifest
└── syncSnapshots/{snapshotId}                         Snapshot status and metadata
    └── chunks/{chunkId}                               Serialized workspace chunk
```

- `users/{uid}` contains only the manifest metadata: schema version, active snapshot ID, chunk count, total byte count, SHA-256 hash, snapshot history, and server update time.
- `syncSnapshots/{snapshotId}` records the snapshot's metadata and status (`uploading` or `ready`).
- Each `chunks/{chunkId}` document contains the snapshot ID, chunk index, and Base64 payload.
- The entire application workspace is serialized and split into raw chunks of approximately 300 KiB. Upload is sequential: the next chunk is not sent until Firestore acknowledges the previous write.
- The root manifest points to the new snapshot only after all chunks are uploaded and the snapshot is marked ready.
- A receiving device downloads chunks one at a time, validates their order/size, verifies the total byte count and SHA-256, parses the complete JSON, then saves the validated data to local IndexedDB.
- Notes/flashcards/questions/analytics metadata are part of the workspace snapshot. Image bytes are uploaded to ImgBB; the corresponding URLs are stored in the workspace and synced.

## 5. Sign in and confirm first sync

1. Open PrepPro at **http://127.0.0.1:5000**.
2. Complete sign-in through the local Firebase Authentication emulator flow.
3. For a new test UID with no local data and no manifest, the app creates a default workspace locally and schedules the initial cloud snapshot.
4. Add a test subject, topic, and subtopic, then create a flashcard or question and save it.
5. Wait for the save-status area to report **Saved & synced across devices**.
6. In the Emulator UI, open Firestore and confirm a root document at `users/{uid}` containing manifest fields, plus a ready snapshot under `users/{uid}/syncSnapshots/{snapshotId}` and chunk documents beneath it.

If sign-in succeeds but the app reports a Firestore permission error, check the emulator logs and confirm the emulator is loading the owner-only rules from `firestore.rules`. Production rules are not automatically the rules used by the local emulator.

## 6. Test cross-device synchronization

Use two separate browser profiles (or two independent browsers) on the same computer. Both tabs must sign in as the **same test account in the Auth emulator**.

1. Create or edit a flashcard in browser A.
2. Wait for the save status to report the cloud sync succeeded.
3. Verify browser B receives the change without refreshing manually. The remote listener may defer applying a change while an active quiz or editor cannot safely refresh.
4. Edit a different field or add a question in browser B.
5. Verify browser A receives the update.
6. Keep the account UID the same in both profiles. Separate UIDs have separate workspaces.

No direct connection between browsers is needed. The sending browser waits for Firestore's server write acknowledgement; a receiving browser reads the published manifest and fetches the finished snapshot when it is online.

## 7. Test chunking with a workspace larger than 1 MiB

Create a sizable text-only dataset, such as a large batch of questions or flashcards, until the exported/serialized workspace exceeds 1 MiB. Save it, then inspect Firestore Emulator UI.

Verify:

1. The root `users/{uid}` document remains a compact manifest rather than containing the complete workspace JSON.
2. The current `syncSnapshots/{snapshotId}` parent has status `ready`.
3. The expected number of chunk documents exists under `users/{uid}/syncSnapshots/{snapshotId}/chunks/`.
4. Chunk IDs are zero-padded indices, and payloads contain the expected snapshot ID/index and Base64 strings.
5. The save status advances one acknowledged chunk at a time; a later chunk should not be written by the sequential uploader until the prior `setDoc` resolves.
6. The second browser applies the dataset only after the complete snapshot is retrieved, its byte count matches the manifest, and the SHA-256 verification succeeds.

There is no fixed 100 MiB application cap, but very large workspaces can exceed browser memory, JSON serialization/typed-array capacity, Firestore quotas, or device resources. Use moderate test data and avoid stress testing on production accounts.

## 8. Test interruption and offline recovery

- **Offline save:** Disconnect one browser from the network, make a small change, and verify the local save status indicates the data is stored on the device.
- **Reconnect:** Restore connectivity and verify the queued snapshot syncs.
- **Incomplete transfer:** During a test upload, simulate a network interruption. The currently active root manifest should continue to reference the last completed snapshot; an incomplete generation must not become active.
- **Incomplete download:** Verify that a missing or malformed chunk results in an error and that the incomplete snapshot is not applied to the local workspace.
- **Cloud read error:** If there is no local workspace and Firestore cannot be checked, PrepPro should show an error rather than silently create and upload blank data.
- **Browser restart:** Close/reopen the browser and sign in as the same UID. Validate that local data remains available and that the current cloud manifest is checked.

## 9. Test feature regressions

### Notes

- Create a blank page and draw strokes.
- Use **T Add text** to insert a text box, edit it, move it using its Move handle, and change the text colour/size.
- Save and reopen the page; verify the drawing layer and composed page render.
- Test erase/clear strokes, image pages, custom backgrounds, background scopes, page-size presets/custom dimensions, page insertion, page reordering, and page deletion.
- Verify the page image URLs and Notes metadata remain present after syncing to the second browser. Uploaded ImgBB images are external assets; deleting a page inside PrepPro does not delete the image already uploaded there.

### Flashcards, quizzes, analytics, and backups

- Test flashcard creation, editing, and reorder controls.
- Test MCQ, MSQ, and numerical question forms and answers.
- Finish a quiz and verify scoring, XP, and attempt history.
- Open Analytics and review the summary, charts, and attempt detail view.
- Export a JSON backup. If testing Import, use an export from the same UID and confirm the prompt before replacing local workspace data.
- Confirm local saves and cloud syncing continue to work after these actions.

## 10. Rules and deployment safety

- `firebase.json` configures the Firestore emulator to load `firestore.rules`.
- The checked-in rules allow a signed-in user to access only that UID's root manifest and snapshot metadata/chunks.
- Firestore Rules deployment is separate from Firebase Hosting deployment. Do not run a deployment command as part of the local test steps.
- A GitHub pull-request preview isolates the preview website from `main`, but the frontend on a non-localhost domain uses the Firebase project configured in its client code. Preview actions may affect that project's Auth/Firestore data. Use emulators for destructive data resets, large-volume tests, and debugging.
- Never paste Firebase service-account credentials or other privileged secrets into frontend code.

## 11. Stop the emulators

Return to the PowerShell terminal running the emulators and press:

```text
Ctrl+C
```

Wait for the emulators to stop. Local emulator data is for testing and may not persist between runs unless you explicitly configure emulator data export/import.
