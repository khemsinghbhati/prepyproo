# PrepPro code architecture

PrepPro is a static vanilla-JavaScript app hosted from `public/`. The split preserves the existing DOM, global `window.app` API, inline HTML event handlers, and deployment setup. Firebase Authentication provides sign-in. IndexedDB keeps a local copy for fast saves and offline use, while Firestore automatically syncs the latest user-data snapshot across devices signed in with the same account. JSON export/import remains available for backup and recovery.

## Module ownership

| File | Responsibility | Best-fit task owner |
| --- | --- | --- |
| `public/index.html` | App shell, fixed layout, and script loading order | UI shell changes; coordinate before changing script order |
| `public/app-state.js` | Shared app state, IDs, default values, expansion state, and initial `window.app` object | State/schema changes only; keep changes small |
| `public/app-core.js` | Initialization, global navigation, generic UI helpers, modal/toast behavior, normalization, and saving | Shared navigation and generic UI behavior |
| `public/app-learning-path.js` | Subject/topic/subtopic operations, hierarchy lookup, drag-and-drop ordering, image upload, and learning-path dashboard | Learning-path and creator-mode features |
| `public/app-content-editor.js` | Subtopic editor and question-set management | Content editor and question-set list UI |
| `public/app-flashcards.js` | Flashcard form, edit, save, and ordering operations | Flashcard authoring features |
| `public/app-questions.js` | Question form, question-type fields, and question saving | MCQ/MSQ/numerical authoring features |
| `public/app-study-session.js` | Flashcard viewer, quiz player, answer evaluation, scoring, and per-question timing | Learner/study experience |
| `public/app-analytics.js` | Statistics, charts, attempt history, analytics expansion, and detailed attempt review | Analytics and reporting |
| `public/app-events.js` | Document-level event listeners, currently image-paste handling | Global browser event wiring |
| `public/firebase-auth.js` | Firebase Authentication, IndexedDB persistence, windowed Firestore snapshot sync, and JSON import/export | Authentication and persistence; coordinate if changing data shape |
| `public/styles/base.css` | Theme variables, global reset, typography, form controls, and focus styles | App-wide foundational styling; coordinate before changing tokens |
| `public/styles/flashcards.css` | 3D flashcard flip transforms | Flashcard visual behavior |
| `public/styles/scrollbars.css` | Scrollbar themes and hide-scrollbar utility | Scrollbar and overflow visuals |
| `public/styles/learning-path.css` | Learning-path connector line and its breakpoint adjustment | Learning-path styling |
| `public/styles/animations.css` | Shared pop, fade, and slide animations | Motion/transition styling |
| `public/styles/overlays.css` | Modal backdrop/content and toast notification sizing | Modals and notifications |
| `public/styles/responsive.css` | Small-screen overrides and reduced-motion accessibility | Responsive and motion accessibility tweaks |
| `firebase.json` | Firebase Hosting and local emulator ports | Hosting/emulator configuration |

## Dependency and change rules

1. Load scripts in the order listed in `public/index.html`: `app-state.js`, core, feature modules, events, and finally the Firebase module. Feature files extend the existing `window.app` object with `Object.assign`; they must not replace it.
2. The app uses classic scripts for UI modules. Shared top-level bindings in `app-state.js` are available to those scripts. Do not add another top-level `let`/`const` with an existing name in another classic script.
3. Keep authentication and persistence in `firebase-auth.js`. UI features should use `window.saveUserData` through `app.save()`; they must not write directly to IndexedDB or Firestore. Saves go to IndexedDB first, then a debounced Firestore write synchronizes the latest user snapshot to other signed-in devices.
4. Keep each feature's behavior in its matching module. When a change genuinely needs shared state, discuss it first and make the smallest required update to `app-state.js`.
5. Preserve existing data fields and normalization unless the task explicitly includes a migration. Avoid renaming IDs, storage keys, global handlers, or DOM IDs as part of unrelated refactors. IndexedDB is the per-device offline cache; Firestore syncs snapshots across the same authenticated account. Export/import JSON remains available as a manual backup or recovery path.
6. CSS is split into files under `public/styles/` and linked in `index.html` in cascade order. Keep each change in the closest matching stylesheet; avoid moving rules between files unless you verify that the visual cascade is unchanged. Avoid editing `index.html` for feature-only work. It should normally change only when adding/removing a script or stylesheet, changing the app shell, or adjusting shared markup.
7. Do not put credentials or private keys in the frontend. Firebase web configuration in the client is public configuration; privileged credentials belong in GitHub/Firebase secrets.

## Parallel collaboration workflow

- Assign one person per feature module, with a clear acceptance criterion and a separate branch. Examples: flashcards → `app-flashcards.js`; quiz authoring → `app-questions.js`; learner quiz flow → `app-study-session.js`; analytics → `app-analytics.js`.
- Keep pull requests narrow and avoid having multiple collaborators edit `app-state.js`, `index.html`, or `firebase-auth.js) at the same time. For visual tasks, assign one stylesheet owner (for example, `styles/flashcards.css` or `styles/learning-path.css`) and coordinate changes to `styles/base.css`.
- Before opening a pull request, run the app locally with the Firebase emulators using the commands in [How to test Locally.md](../How%20to%20test%20Locally.md). Verify both Creator and Learner flows related to the change.
- Open a pull request instead of committing directly to `main). Check the Firebase Hosting preview and manually test the changed feature before merging. A preview deploy is not the production deployment; the workflow that deploys live is triggered by a push to `main`.

## Local-first storage and automatic cloud sync

`public/firebase-auth.js` writes to IndexedDB first, then debounces a full snapshot upload. It serializes the snapshot to UTF-8 and splits the bytes into approximately 300 KiB chunks; each Base64-encoded chunk is about 400 KiB and stored in a separate document under `users/{uid}/syncSnapshots/{snapshotId}/chunks/{index}`. Upload is strictly sequential: it awaits Firestore's acknowledgement of one chunk before writing the next. The compact manifest at `users/{uid}/syncState/current` is published only after all chunks are uploaded and the SHA-256 hash is recorded. All cloud data remains under the same `users/{uid}` parent and Firebase Auth UID; `syncState` and `syncSnapshots` are subcollections for the manifest and chunks, not separate user types. If no new manifest exists, the same account's legacy root document is used as a migration source. After the selected local/cloud data is successfully uploaded and the new manifest is committed, the old `users/{uid}` root document is deleted. If cleanup fails, the new snapshot remains active and the save-status area reports the cleanup issue. Receivers read the manifest, fetch and validate one chunk at a time before fetching the next, verify the complete byte count and hash, parse the complete snapshot, then save it locally. A partial snapshot is never applied. There is no fixed 100 MiB app-level cap; practical limits are browser memory, serialization/typed-array capacity, Firestore quotas, and available network resources. The three newest snapshot generations are retained to give readers already in flight time to finish; older generations are cleaned up after a successful manifest switch.

An account-scoped listener watches for manifest changes from other devices. Remote changes are applied automatically when the app is in a safe view; if a quiz or editor is active, the update is held until the app can refresh without interrupting that work. Offline saves remain local and sync when connectivity returns. The current sync status is shown in the app's save-status area.

IndexedDB can still be cleared by the user, removed by browser policy, or become unavailable, so users should export backups periodically. JSON imports are accepted only when the signed-in Firebase Auth UID matches the export and replace the current local workspace. The included `firestore.rules` lets each authenticated UID access only its own `users/{uid}` document and sync subcollections. Firebase Security Rules deploy separately from Hosting; merge these rules with any existing production rules and deploy them using `firebase deploy --only firestore:rules` before expecting chunked cloud sync to work in a production-hosted preview. Local development uses the Auth and Firestore emulators with the `demo-prepyproo` project ID. Deployed previews use the configured Firebase project, so test-data changes made on a preview can affect that project's account data even though the website code is not deployed to `main`.

## Why not ES modules yet?

The app currently relies on global `window.app`, inline HTML event handlers, and shared top-level state. Splitting responsibilities into ordered files provides independent editing without simultaneously rewriting those contracts. A future migration to ES modules should be a separate change with its own tests, not mixed into feature development.
