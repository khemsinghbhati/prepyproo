# PrepPro code architecture

PrepPro is a static vanilla-JavaScript app hosted from `public/`. The split is intentionally conservative: it preserves the existing DOM, global `window.app` API, HTML inline handlers, Firebase persistence contract, and deployment setup. It does not introduce a bundler or change the saved data format.

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
| `public/firebase-auth.js` | Firebase initialization, authentication, local cache, pending saves, and Firestore synchronization | Authentication and persistence; coordinate if changing the data contract |
| `public/style.css` | Custom styles | Styling-only changes |
| `firebase.json` | Firebase Hosting and local emulator ports | Hosting/emulator configuration |

## Dependency and change rules

1. Load scripts in the order listed in `public/index.html`: `app-state.js`, core, feature modules, events, and finally the Firebase module. Feature files extend the existing `window.app` object with `Object.assign`; they must not replace it.
2. The app uses classic scripts for UI modules. Shared top-level bindings in `app-state.js` are available to those scripts. Do not add another top-level `let`/`const` with an existing name in another classic script.
3. Keep authentication and cloud persistence in `firebase-auth.js`. UI features should use the existing `window.saveUserData` integration through `app.save()` and must not write directly to Firestore.
4. Keep each feature's behavior in its matching module. When a change genuinely needs shared state, discuss it first and make the smallest required update to `app-state.js`.
5. Preserve existing data fields and normalization unless the task explicitly includes a migration. Avoid renaming IDs, storage keys, global handlers, or DOM IDs as part of unrelated refactors.
6. Avoid editing `index.html` for feature-only work. It should normally change only when adding/removing a script, changing the app shell, or adjusting shared markup.
7. Do not put credentials or private keys in the frontend. Firebase web configuration in the client is public configuration; privileged credentials belong in GitHub/Firebase secrets.

## Parallel collaboration workflow

- Assign one person per feature module, with a clear acceptance criterion and a separate branch. Examples: flashcards → `app-flashcards.js`; quiz authoring → `app-questions.js`; learner quiz flow → `app-study-session.js`; analytics → `app-analytics.js`.
- Keep pull requests narrow and avoid having multiple collaborators edit `app-state.js`, `index.html`, or `firebase-auth.js) at the same time.
- Before opening a pull request, run the app locally with the Firebase emulators using the commands in [How to test Locally.md](../How%20to%20test%20Locally.md). Verify both Creator and Learner flows related to the change.
- Open a pull request instead of committing directly to `main). Check the Firebase Hosting preview and manually test the changed feature before merging. A preview deploy is not the production deployment; the workflow that deploys live is triggered by a push to `main`.

## Why not ES modules yet?

The app currently relies on global `window.app`, inline HTML event handlers, and shared top-level state. Splitting responsibilities into ordered files provides independent editing without simultaneously rewriting those contracts. A future migration to ES modules should be a separate change with its own tests, not mixed into feature development.
