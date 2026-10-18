# PrepPro — How to Test Locally on Windows

Follow these steps in order to run a PrepPro branch locally. Firebase Authentication and Firestore use local emulators on localhost. IndexedDB stores a local copy in each browser; Firestore syncs data between test browsers signed in with the same emulator account. The Firestore emulator loads the owner-only rules from `firestore.rules`. All emulator data is separate from production data.

> [!IMPORTANT]
> For local testing, always use the `demo-prepyproo` project ID and the local URL `http://127.0.0.1:5000`. Do **not** run `firebase deploy` as part of this workflow.

## Step 1 — Open PowerShell in your project folder

Open PowerShell or the VS Code terminal and run:

```powershell
cd C:\Users\bhati\prepyproo
```

## Step 2 — Check your Git status

Run:

```powershell
git status
```

If you have uncommitted changes or untracked files, back them up before switching branches. To temporarily save tracked and untracked changes in a Git stash, run:

```powershell
git stash push -u -m "Backup before local testing"
```

If Git reports that there is nothing to stash, continue.

## Step 3 — Download the latest changes from GitHub

Fetch the latest branch information:

```powershell
git fetch origin
```

Switch to the testing branch:

```powershell
git switch "Khem's-test"
```

If Git says the branch does not exist locally, run this instead:

```powershell
git switch --track "origin/Khem's-test"
```

Pull the latest changes:

```powershell
git pull origin "Khem's-test"
```

## Step 4 — Check that Java 21 or newer is installed

Run:

```powershell
java -version
```

The Firebase emulators require Java 21 or newer.

If Java is missing or the version is older than 21, install Java 21:

```powershell
winget install Microsoft.OpenJDK.21
```

After installation, close PowerShell, open it again, and verify the version:

```powershell
java -version
```

## Step 5 — Check Node.js and npm

Run:

```powershell
node --version
npm --version
```

If either command is not recognized, install Node.js LTS from [nodejs.org](https://nodejs.org/), then reopen PowerShell.

## Step 6 — Install the Firebase CLI

Run:

```powershell
npm install -g firebase-tools
```

If it is already installed, this installs or updates the Firebase CLI as needed.

Verify the installation:

```powershell
firebase --version
```

## Step 7 — Start the local website and Firebase emulators

Make sure you are in the project root:

```powershell
cd C:\Users\bhati\prepyproo
```

Start Firebase Hosting, Authentication, and Firestore emulators with the demo project ID:

```powershell
firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
```

Wait for the emulators to finish starting. **Keep this terminal open while testing.**

Do not run `firebase deploy`. Deployment is not needed for local testing.

## Step 8 — Open PrepPro locally

Open this address in Chrome:

**[http://127.0.0.1:5000](http://127.0.0.1:5000)**

This is the local PrepPro website. Use this address to test the application; do not use the production website or the emulator dashboard to test the app itself.

The Firebase Emulator dashboard is available at:

**[http://127.0.0.1:4000](http://127.0.0.1:4000)**

## Step 9 — Sign in for local testing

If PrepPro displays its login screen, use the local Firebase Authentication emulator's sign-in flow.

Your production account data is **not** automatically imported into the emulator. Create separate test data locally instead.

## Step 10 — Test Notes, local saves, and automatic sync

1. In Creator Mode, open a subtopic and choose Notes.
2. Create a blank page, draw a few strokes, choose **T Add text**, click on the page to place a text box, enter text, move the box by its **Move** handle, change its colour/size, and confirm the page.
3. Reopen the page and verify the strokes and text positions persist. Verify ImgBB contains the current transparent strokes PNG and the current flattened page PNG (old uploads are expected to remain).
4. Test erasing, clearing all strokes, uploading an image page, custom background images, background scopes, resizing, page insertion, reordering, deletion, and Learner Mode reading.
5. Close/reopen the browser and sign back in with the same account; data should still be present locally.
6. Open PrepPro in two separate browser profiles using the **same test account in the Auth emulator**. Make a change in one window, wait for the save status to report that it synced, and verify the other window receives it automatically. Then edit in the second window and check that the first receives the change. No codes or file transfer should be required.
7. Create a test dataset whose serialized JSON is larger than 1 MiB (for example, a large set of text-only questions/flashcards), then save it. In the Firestore Emulator UI, verify the manifest fields are stored directly in `users/{uid}` and snapshot chunks are separate documents under `users/{uid}/syncSnapshots/{snapshotId}/chunks/`. Confirm all paths belong to the same authenticated UID.
8. Watch the save-status area: it should report one acknowledged chunk at a time. The next chunk must not be sent until the previous Firestore write resolves successfully. Verify the second browser applies the snapshot only after the complete transfer and integrity check. Also verify reloading during an interrupted upload never applies a partial snapshot.
9. Test a dataset larger than 100 MiB only on a test profile/device with sufficient available memory and emulator/project capacity. There is no fixed application-level byte cap, but browser RAM, typed-array allocation limits, Firestore quotas, and network reliability still impose practical limits.
10. Disconnect one browser from the network, make a change, reconnect, and verify the local save syncs when the connection returns.
11. Verify **Export data** and **Import data** still work as manual backup/recovery tools. Import replaces the destination's local workspace.
12. Verify existing Flashcards, Quizzes, Analytics, and XP still work.

## Step 11 — Stop the local application when finished

When you finish testing, return to the PowerShell terminal running the emulators.

Press:

```text
Ctrl+C
```

Wait for the emulators to stop.

---

