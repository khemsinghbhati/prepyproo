# 🎓 PrepPro — Gamified Learning & Quiz Platform

![HTML5](https://img.shields.io/badge/HTML5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white)

**[Open PrepPro](https://prepyproo.web.app)**

PrepPro is a browser-based learning app for organizing study material, practising with flashcards and quizzes, and reviewing learning progress. It includes a hierarchical learning path, Creator and Learner modes, multi-page Notes, question-level timing, attempt history, analytics, and an XP reward system.

## Features

### Learning path and content authoring

- **Hierarchical organization:** Arrange material as subjects → topics → subtopics, with collapsible sections and reorderable items.
- **Creator Mode:** Create, edit, rename, reorder, and delete learning content.
- **Flashcards:** Store front/back text and optional images; edit and reorder cards.
- **Question sets:** Create multiple-choice (MCQ), multiple-select (MSQ), and numerical questions. Questions can include images and configured answer options.
- **Multi-page Notes:** Draw and erase on a page, add individually editable and movable text boxes, upload image pages, insert/reorder/delete pages, customize page dimensions, and configure page backgrounds at different scopes.
- **Image URLs:** Flashcards and questions can use uploaded images or valid HTTP/HTTPS image URLs.

### Learning and review

- **Learner Mode:** Study flashcards and take quizzes without authoring controls.
- **Quiz feedback:** Check answers, review correctness, and continue through the question set.
- **Question timing:** Record time spent on each question for new attempts; review the total attempt time and per-question timing.
- **Progress and XP:** Mark subtopics complete, earn XP, and review activity.
- **Analytics:** Inspect performance summaries, charts, question-set attempt history, accuracy, selected answers, and recorded timing.

### Account and data

- **Google sign-in:** Firebase Authentication identifies the current account.
- **Automatic cloud sync:** IndexedDB keeps a local copy; Firestore syncs snapshots for the same authenticated account across devices.
- **Chunked snapshot transfer:** Large application snapshots are split into small documents and uploaded one at a time, waiting for Firestore to acknowledge each write. Receiving devices validate each chunk and the complete snapshot before applying it.
- **Offline editing:** Changes can be saved locally while offline and queued for cloud sync when connectivity returns.
- **Backup and recovery:** Export and Import provide manual JSON backup/recovery. Import replaces the current workspace after confirmation and requires the matching account UID.

## Architecture overview

PrepPro is a static, single-page app hosted on Firebase Hosting. The frontend uses HTML, CSS, and vanilla JavaScript. UI code is split into ordered feature modules that extend a shared `window.app` object; Firebase Authentication and data persistence are managed in `public/firebase-auth.js`.

The data model has one account identity: the Firebase Authentication UID. All cloud data for an account lives beneath `users/{uid}`. That root document stores the small active-snapshot manifest, while the actual application data is stored in snapshot chunks in subcollections. The root document does **not** contain the complete app dataset.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map, the complete cloud schema, sync lifecycle, integrity checks, security model, and design trade-offs.

## Cloud data model

### Firestore paths

```text
users/{uid}                                           Active snapshot manifest
└── syncSnapshots/{snapshotId}                        Snapshot metadata/status
    └── chunks/{chunkId}                              Base64-encoded payload chunk
```

The UID is the same UID returned by Firebase Authentication. The snapshot and chunk collections are storage for that one account, not separate user types.

The root manifest contains compact metadata such as:

- Sync schema version.
- Active snapshot ID.
- Number of chunks and total unencoded byte count.
- SHA-256 hash of the complete serialized snapshot.
- Recent snapshot IDs retained for safe cleanup.
- Server update timestamp.

Each snapshot metadata document records the snapshot ID, chunk count, total bytes, SHA-256 hash, status, and creation timestamp. Each chunk document records the snapshot ID, its zero-based index, and its Base64 payload.

### Why the payload is chunked

Firestore documents have a 1 MiB document-size limit. PrepPro therefore serializes the complete app data to UTF-8 and divides the bytes into chunks of about **300 KiB each**. Base64 encoding brings a typical full chunk to roughly 400 KiB, leaving room under the document limit. This is not a guarantee of unlimited dataset size: browser memory, JavaScript typed-array/JSON limits, Firestore quotas, network reliability, and device capacity still apply.

### Upload lifecycle

1. The app saves the changed dataset to IndexedDB first.
2. After a short debounce, it serializes the latest complete dataset to JSON and UTF-8 bytes, then calculates SHA-256.
3. It creates a snapshot metadata document with status `uploading`.
4. It uploads chunk 1 and awaits Firestore's write acknowledgement. Only then does it upload chunk 2, continuing sequentially until every chunk is acknowledged.
5. It marks the snapshot `ready`.
6. It updates `users/{uid}` to point to the new snapshot. The manifest is not switched to an incomplete upload.
7. Older snapshot generations outside the retained history are cleaned up after the new manifest is committed.

The acknowledgement is Firestore's server write confirmation. The receiving device does not have to be online during the upload; it observes the new manifest and downloads the complete snapshot when connected.

### Download and validation lifecycle

1. The receiving device reads the root manifest and validates its metadata.
2. It requests one chunk at a time, checking each chunk's snapshot ID, index, encoding, and size before requesting the next.
3. It checks the accumulated byte count against the manifest, assembles the serialized byte array, and calculates SHA-256.
4. It rejects the snapshot if the hash, byte count, chunk structure, or JSON/data validation fails.
5. Only after the complete snapshot passes validation does it save the data in local IndexedDB and allow the app to use it.

Chunk requests are sequential, but the browser still assembles the entire snapshot in memory for hash verification and JSON parsing. Very large workspaces may therefore exceed available RAM even though there is no fixed 100 MiB application-level cap.

## Local persistence, conflicts, and offline behavior

- **Local cache:** IndexedDB database `preppro-local-data`, object store `users`, keyed by Firebase Auth UID. Each record holds the app data and local update metadata.
- **Save order:** UI code calls the shared save path. The local IndexedDB write completes before a cloud write is queued.
- **Debounced cloud writes:** Rapid edits are coalesced; the app uploads the latest full snapshot rather than issuing a separate cloud document for each field edit.
- **Remote updates:** An account-scoped Firestore listener watches `users/{uid}`. When a newer manifest is published, the client downloads and validates the snapshot. Applying an incoming dataset is deferred while the app reports that the current view cannot be safely refreshed, such as during an active quiz or editor.
- **Pending local edits:** A queued local write takes precedence over an incoming snapshot until that upload is resolved.
- **Offline use:** Local changes remain in IndexedDB and cloud sync resumes when the browser comes online. A second device needs network access to download current cloud data.
- **Failure behavior:** Failed or incomplete cloud transfers are reported in the save-status area. A partially downloaded snapshot is not applied. Users should keep periodic JSON exports as a recovery option.

## Images and Notes

Image files are uploaded to ImgBB; application data stores URLs and related Notes metadata in the snapshot. A Notes page may store its uploaded image-page URL, drawing-layer URL, and composed page-image URL. Page settings and scoped backgrounds are also part of the app data and sync across devices. Removing a page from PrepPro does not delete its already-uploaded ImgBB image.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Styling | Tailwind CSS via CDN and modular CSS under `public/styles/` |
| Icons | Phosphor Icons |
| Authentication | Firebase Authentication with Google sign-in in the deployed app |
| Local persistence | IndexedDB |
| Cloud persistence and sync | Cloud Firestore |
| Image hosting | ImgBB and user-provided HTTP/HTTPS image URLs |
| Hosting / preview | Firebase Hosting and GitHub Actions |
| Local testing | Firebase Hosting, Authentication, and Firestore emulators |

## Repository map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | App shell, shared markup, stylesheets, and script load order |
| `public/app-state.js` | Shared global state and initial app object |
| `public/app-core.js` | Initialization, navigation, common UI helpers, data normalization, and save entry point |
| `public/app-learning-path.js` | Subjects, topics, subtopics, learning-path rendering, and image selection/upload |
| `public/app-content-editor.js` | Subtopic content editor and question-set management |
| `public/app-flashcards.js` | Flashcard create/edit/reorder workflows |
| `public/app-questions.js` | Question authoring and MCQ/MSQ/numerical form logic |
| `public/app-study-session.js` | Flashcard learner flow, quiz execution, scoring, XP, and attempt recording |
| `public/app-notes.js` | Notes page data, editor, drawing/text layers, backgrounds, ordering, and ImgBB persistence |
| `public/app-analytics.js` | Analytics, charts, attempt history, and attempt details |
| `public/app-events.js` | Document-level event handlers, including pasted-image handling |
| `public/firebase-auth.js` | Firebase sign-in, IndexedDB persistence, cloud snapshot upload/download, conflict handling, and JSON import/export |
| `public/styles/` | Shared and feature-specific CSS |
| `firebase.json` | Hosting configuration, Firestore rules path, and local emulator ports |
| `firestore.rules` | Owner-only access rules for account data, snapshots, and chunks |
| `.github/workflows/` | Preview deployment for pull requests and live deployment from `main` |

UI feature modules are classic scripts and extend the shared app object. Keep the script order in `public/index.html` stable unless a change specifically requires it. Authentication/persistence logic belongs in `public/firebase-auth.js`; feature modules should use the shared save API rather than writing directly to IndexedDB or Firestore.

## Run PrepPro locally

For complete Windows steps, see [How to test Locally.md](How%20to%20test%20Locally.md).

1. Install Node.js, Java 21 or newer, and the Firebase CLI.
2. From the repository root, run:

   ```bash
   firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
   ```

3. Open **http://127.0.0.1:5000**. The Emulator UI is available at **http://127.0.0.1:4000**.

Localhost is configured to use the `demo-prepyproo` project ID and the Auth/Firestore emulators. Local emulator data is separate from the live Firebase project.

## Deployment and data-safety notes

- Pull-request changes deploy to a Firebase Hosting preview. A push to `main` triggers the live Hosting workflow.
- A preview separates the website code from `main`, but the deployed frontend still uses the Firebase project configured in `public/firebase-auth.js` unless the hostname is localhost. Preview operations can therefore touch the configured project's Auth and Firestore data. Use local emulators for destructive or migration-sensitive tests.
- Firestore Security Rules deploy separately from Hosting. `firestore.rules` is loaded by the Firestore emulator through `firebase.json`; publish corresponding rules in the Firebase project when they change. Do not overwrite unrelated production rules in a project that uses additional collections.
- The root `users/{uid}` document must stay small and contain manifest metadata only. The application data belongs in chunk payload documents.
- Export data periodically. Browser storage can be cleared or become unavailable, and very large datasets can exceed device memory.

## License

© 2026 Khem Singh & Avneel Singh. All rights reserved.

This repository and its contents are not open-source. You may view the code for educational and portfolio evaluation purposes, but you may not copy, modify, distribute, or use it for commercial purposes without explicit permission.

**Project contributors:** [Avneel Singh](https://github.com/avneelsingh) · [Khem Singh](https://github.com/khemsinghbhati)
