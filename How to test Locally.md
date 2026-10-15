# PrepPro — How to Test Locally on Windows

Follow these steps in order to run the \`Khem's-test\` branch of PrepPro on your computer using the Firebase Emulator Suite. Local Auth and Firestore emulator data are separate from production data.

> [!IMPORTANT]
> For local testing, always use the \`demo-prepyproo\` project ID and the local URL \`http://127.0.0.1:5000\`. Do **not** run \`firebase deploy\` as part of this workflow.

## Step 1 — Open PowerShell in your project folder

Open PowerShell or the VS Code terminal and run:

\`\`\`powershell
cd C:\Users\bhati\prepyproo
\`\`\`

## Step 2 — Check your Git status

Run:

\`\`\`powershell
git status
\`\`\`

If you have uncommitted changes or untracked files, back them up before switching branches. To temporarily save tracked and untracked changes in a Git stash, run:

\`\`\`powershell
git stash push -u -m "Backup before local testing"
\`\`\`

If Git reports that there is nothing to stash, continue.

## Step 3 — Download the latest changes from GitHub

Fetch the latest branch information:

\`\`\`powershell
git fetch origin
\`\`\`

Switch to the testing branch:

\`\`\`powershell
git switch "Khem's-test"
\`\`\`

If Git says the branch does not exist locally, run this instead:

\`\`\`powershell
git switch --track "origin/Khem's-test"
\`\`\`

Pull the latest changes:

\`\`\`powershell
git pull origin "Khem's-test"
\`\`\`

## Step 4 — Check that Java 21 or newer is installed

Run:

\`\`\`powershell
java -version
\`\`\`

The Firebase emulators require Java 21 or newer.

If Java is missing or the version is older than 21, install Java 21:

\`\`\`powershell
winget install Microsoft.OpenJDK.21
\`\`\`

After installation, close PowerShell, open it again, and verify the version:

\`\`\`powershell
java -version
\`\`\`

## Step 5 — Check Node.js and npm

Run:

\`\`\`powershell
node --version
npm --version
\`\`\`

If either command is not recognized, install Node.js LTS from [nodejs.org](https://nodejs.org/), then reopen PowerShell.

## Step 6 — Install the Firebase CLI

Run:

\`\`\`powershell
npm install -g firebase-tools
\`\`\`

If it is already installed, this installs or updates the Firebase CLI as needed.

Verify the installation:

\`\`\`powershell
firebase --version
\`\`\`

## Step 7 — Start the local website and Firebase emulators

Make sure you are in the project root:

\`\`\`powershell
cd C:\Users\bhati\prepyproo
\`\`\`

Start Firebase Hosting, Authentication, and Firestore emulators with the demo project ID:

\`\`\`powershell
firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
\`\`\`

Wait for the emulators to finish starting. **Keep this terminal open while testing.**

Do not run \`firebase deploy\`. Deployment is not needed for local testing.

## Step 8 — Open PrepPro locally

Open this address in Chrome:

**[http://127.0.0.1:5000](http://127.0.0.1:5000)**

This is the local PrepPro website. Use this address to test the application; do not use the production website or the emulator dashboard to test the app itself.

The Firebase Emulator dashboard is available at:

**[http://127.0.0.1:4000](http://127.0.0.1:4000)**

## Step 9 — Sign in for local testing

If PrepPro displays its login screen, use the local Firebase Authentication emulator's sign-in flow.

Your production account data is **not** automatically imported into the emulator. Create separate test data locally instead.

## Step 10 — Stop the local application when finished

When you finish testing, return to the PowerShell terminal running the emulators.

Press:

\`\`\`text
Ctrl+C
\`\`\`

Wait for the emulators to stop.

---

## Quick reference

| Item | Value |
| --- | --- |
| Git branch | \`Khem's-test\` |
| Local PrepPro website | [http://127.0.0.1:5000](http://127.0.0.1:5000) |
| Emulator dashboard | [http://127.0.0.1:4000](http://127.0.0.1:4000) |
| Auth emulator port | \`9099\` |
| Firestore emulator port | \`8080\` |
| Local emulator project ID | \`demo-prepyproo\` |

> [!CAUTION]
> Emulator data is separate from production, but it may be lost when emulators stop unless you configure data export/import. Image uploads still use the external ImgBB service and therefore require an internet connection.
