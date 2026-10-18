# 🎓 PrepPro — Gamified Learning & Quiz Platform

![HTML5](https://img.shields.io/badge/HTML5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-%23039BE5.svg?style=for-the-badge&logo=firebase&logoColor=white)

**[Live : Play PrepPro Here](https://prepyproo.web.app)**

PrepPro is a serverless, single-page learning app that helps students organize study material, practise with flashcards and quizzes, and review their progress. It combines a nested learning path, creator and learner modes, question-level timing, attempt history, analytics, and an XP-based reward system.

## ✨ Features

### Learning path and content management

- **Nested learning structure:** Organize material into subjects, topics, and subtopics.
- **Collapsible sections:** Expand or collapse subjects and topics in the Learning Path.
- **Creator Mode:** Create, rename, reorder, and delete learning content.
- **Flashcards:** Add front/back text and images to study cards.
- **Question sets:** Create Multiple Choice (MCQ), Multiple Select (MSQ), and Numerical questions.
- **Image attachments:** Upload images for flashcards and quiz questions through ImgBB, or provide an HTTP/HTTPS image URL.
- **Multi-page Notes:** Create pages at subtopic level, draw and erase, add movable text boxes with the T tool, upload image pages, reorder pages, and apply classic or custom backgrounds.

### Learner experience

- **Interactive flashcards:** Flip cards to reveal the back and review attached images.
- **Quizzes with feedback:** Answer questions, check responses, and see correct/incorrect feedback before continuing.
- **Scrollable quiz screen:** Long questions and option lists can be scrolled without losing access to the question flow. The **Check** or **Continue** action appears after the question content rather than in a fixed browser-bottom overlay.
- **Question-level timing:** Record the time spent on each question for new attempts.
- **Total quiz time:** The attempt review totals the recorded question durations.
- **Progress tracking:** Mark subtopics complete and view completion progress.

### Analytics and review

- **Performance overview:** Review XP, questions solved, and flashcard revisions.
- **Expandable Analytics sections:** Collapse or expand the selected subject and its topic/subtopic sections to make longer reports easier to navigate.
- **Attempt history:** Open a question set's history to review previous results, accuracy, and dates.
- **Detailed attempt review:** Inspect selected answers, correct answers, the total time taken, and the time recorded for each question.
- **Charts:** View performance trends and attempt history using the app's analytics charts.

### Cloud and account integration

- **Authentication:** Firebase Authentication with Google sign-in, as configured for the deployed app.
- **Automatic cross-device sync:** Study content, attempt history, and Notes metadata are saved locally in IndexedDB and synced through Firestore when online. Large snapshots are split into small chunks; a compact manifest is stored at `users/{uid}/syncState/current` and payload chunks are separate documents. For existing test accounts, the old `users/{uid}` root document is deleted only after the selected data has been successfully written to the new chunked snapshot model. The same Firebase Auth UID is retained; no separate user account or user type is created. Sign in with the same account on each device; no transfer codes are needed.
- **Offline use:** Local saves continue in IndexedDB without an internet connection and sync when connectivity returns.
- **Backups:** Export/Import data remains available for a manual JSON backup or recovery; importing replaces the current local workspace.
- **Hosting:** The live app is hosted on Firebase Hosting.

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Styling | Tailwind CSS via CDN |
| Icons | Phosphor Icons |
| Authentication | Firebase Authentication |
| Data persistence | IndexedDB local cache plus windowed Firestore snapshot sync |
| Image hosting | ImgBB uploads and HTTP/HTTPS image URLs |
| Deployment | Firebase Hosting |

## 📖 How to Use PrepPro

### 1. Creator Mode — Build your learning path

1. Open the app in **Creator Mode**. If you are in Learner Mode, use the mode switch in the lower-left sidebar.
2. Create a subject, then add topics within it and subtopics within each topic.
3. Use the arrows beside subject and topic headings to collapse or expand sections. Expand a subtopic card to preview its flashcards and question sets.
4. Open a subtopic to manage its content.
5. Add flashcards with front/back text and, optionally, an image.
6. Create and reorder multi-page Notes at subtopic level. Draw on the page, insert movable text boxes with the T tool, upload image pages, and customize backgrounds.
7. Create a question set and add MCQ, MSQ, or Numerical questions. Select the correct answer(s) before saving.

### 2. Learner Mode — Study and practise

1. Switch to **Learner Mode** using the mode switch in the sidebar.
2. Open a subtopic to see its study options.
3. Choose **Master Flashcards** to flip through the cards.
4. Choose a question set to start a quiz. Select or enter an answer, then select **Check**. Review the feedback and choose **Continue** to move to the next question.
5. Scroll through long questions and their options as needed; the action button follows the question content.
6. Mark mastered subtopics complete using the checkbox on the subtopic card.

### 3. Analytics — Review performance

1. Open **Analytics** in the sidebar.
2. Choose a subject and expand or collapse its report sections as needed.
3. Review the performance overview and charts.
4. Open a question set's history to inspect an attempt, including the score, chosen answers, total time, and recorded time per question.

> **Timing note:** Question-level times are recorded for new attempts. Older attempts created before per-question timing was saved may not contain individual durations; the app reports those values as not recorded rather than estimating them.

## 🧱 Code Structure

The frontend is separated into feature-focused JavaScript files and responsibility-focused CSS files so collaborators can work in parallel. CSS modules live under `public/styles/`. See [the architecture and collaboration guide](docs/ARCHITECTURE.md) for module ownership, dependency rules, and the recommended pull-request workflow.

## 🧪 Local Testing with Firebase Emulators

For the complete step-by-step setup and testing instructions, see [How to test Locally.md](How%20to%20test%20Locally.md).


Localhost automatically uses a separate demo Firebase project with the Auth and Firestore emulators. Firebase Authentication is used for sign-in. IndexedDB stores a local copy so the app can continue saving offline; Firestore synchronizes the latest data snapshot across devices signed in with the same account. The deployed site uses the configured production Firebase project.

### Start the local app

1. Install [Node.js](https://nodejs.org/) and the Firebase CLI once:

   ```bash
   npm install -g firebase-tools
   ```

2. From the repository root, start the local website and both emulators:

   ```bash
   firebase emulators:start --only hosting,auth,firestore --project demo-prepyproo
   ```

3. Open the local app at **http://127.0.0.1:5000**. The Emulator UI is at **http://127.0.0.1:4000**.

### Important notes

- The local app uses the Auth emulator on port **9099** and Firestore emulator on port **8080**. Firestore is required to test automatic cross-device sync locally; these ports are configured in `firebase.json`. The configured `firestore.rules` file permits each signed-in user to read and write only their own user document and its sync snapshot/chunk subcollections.
- Data saves locally first, then uploads one snapshot chunk at a time. Each chunk is about 300 KiB before Base64 encoding (roughly 400 KiB in Firestore); PrepPro awaits Firestore's acknowledgement before uploading the next chunk. Receiving devices download and validate one chunk before requesting the next, then verify the complete snapshot's size and SHA-256 hash before applying it. There is no fixed 100 MiB application cap; practical limits are browser memory, serialization/typed-array capacity, Firestore quotas, and network reliability. Very large workspaces can still exceed a browser's available memory. **Export data** and **Import data** are retained as manual backup/recovery tools; importing replaces the destination's local data.
- Local sign-in is simulated by the Auth emulator; it does not authenticate against the production Google sign-in service.
- The `demo-prepyproo` project ID keeps emulator traffic separate from the real `prepyproo` Firebase project. Do not replace it with the production project ID when running local tests.
- Emulator data is for testing only. It is separate from production data and may be lost when emulators stop unless you configure emulator data export/import.
- The repository now includes `firestore.rules`, and `firebase.json` configures the emulator to use it. Production Firestore rules are deployed separately from Hosting; review and merge these owner-only rules with any existing production rules before deploying them with `firebase deploy --only firestore:rules`. Do not deploy them blindly if your project has other collections/rules that need to be retained.
- When the app is opened on a non-localhost domain, it uses the existing production Firebase configuration. Do not use a production-hosted deployment for testing destructive actions.

## 📄 License

© 2026 Khem Singh & Avneel Singh. All rights reserved.

This repository and its contents are not open-source. You may view the code for educational and portfolio evaluation purposes, but you may not copy, modify, distribute, or use it for commercial purposes without explicit permission.

**Project Contributors:** [Avneel Singh](https://github.com/avneelsingh) | [Khem Singh](https://github.com/khemsinghbhati)
