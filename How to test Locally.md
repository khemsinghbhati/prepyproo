# PrepPro — How to Test Locally on Windows

Follow these steps in order to run a PrepPro branch locally. Firebase Authentication uses the Auth emulator on localhost, while ongoing app data is saved in browser IndexedDB. The Firestore emulator is retained only for testing the one-time migration path from older versions. All local emulator data is separate from production data.

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

## Step 10 — Test Notes and local-first saves

1. In Creator Mode, open a subtopic and choose Notes.
2. Create a blank page, draw a few strokes, choose **T Add text**, click on the page to place a text box, enter text, move the box by its **Move** handle, change its colour/size, and confirm the page.
3. Reopen the page and verify the strokes and text positions persist. Verify ImgBB contains the current transparent strokes PNG and the current flattened page PNG (old uploads are expected to remain).
4. Test erasing, clearing all strokes, uploading an image page, custom background images, background scopes, resizing, page insertion, reordering, deletion, and Learner Mode reading.
5. Close/reopen the browser and sign back in with the same account; data should still be present in IndexedDB on that browser.
6. For cross-device transfer, open the deployed PR preview on two devices/browsers signed in with the same account. Choose **Send to device** on the source and **Receive from device** on the destination, exchange the offer/answer codes, keep both online, and confirm replacement on the destination. Both browsers must stay open during the transfer. If the network blocks WebRTC, use Export/Import JSON.
7. Verify existing Flashcards, Quizzes, Analytics, and XP still work.

## Step 11 — Stop the local application when finished

When you finish testing, return to the PowerShell terminal running the emulators.

Press:

```text
Ctrl+C
```

Wait for the emulators to stop.

---

