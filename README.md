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
- **Cloud data:** Study content and attempt history are saved through the app's Cloud Firestore integration.
- **Hosting:** The live app is hosted on Firebase Hosting.

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Styling | Tailwind CSS via CDN |
| Icons | Phosphor Icons |
| Authentication | Firebase Authentication |
| Data persistence | Cloud Firestore integration |
| Image hosting | ImgBB uploads and HTTP/HTTPS image URLs |
| Deployment | Firebase Hosting |

## 📖 How to Use PrepPro

### 1. Creator Mode — Build your learning path

1. Open the app in **Creator Mode**. If you are in Learner Mode, use the mode switch in the lower-left sidebar.
2. Create a subject, then add topics within it and subtopics within each topic.
3. Use the arrows beside subject and topic headings to collapse or expand sections. Expand a subtopic card to preview its flashcards and question sets.
4. Open a subtopic to manage its content.
5. Add flashcards with front/back text and, optionally, an image.
6. Create a question set and add MCQ, MSQ, or Numerical questions. Select the correct answer(s) before saving.

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


Localhost automatically uses a separate demo Firebase project with the Auth and Firestore emulators. The deployed site continues to use the configured production Firebase project.

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

- The local app uses the Auth emulator on port **9099** and Firestore emulator on port **8080**. These ports are configured in `firebase.json`.
- Local sign-in is simulated by the Auth emulator; it does not authenticate against the production Google sign-in service.
- The `demo-prepyproo` project ID keeps emulator traffic separate from the real `prepyproo` Firebase project. Do not replace it with the production project ID when running local tests.
- Emulator data is for testing only. It is separate from production data and may be lost when emulators stop unless you configure emulator data export/import.
- This repository currently has no local Firestore rules file configured, so the Firestore emulator defaults to allowing all reads and writes. This is only for the local demo project; it does **not** test your production security rules. Add the same reviewed rules used by production before relying on local tests for security validation.
- When the app is opened on a non-localhost domain, it uses the existing production Firebase configuration. Do not use a production-hosted deployment for testing destructive actions.

## 📄 License

© 2026 Khem Singh & Avneel Singh. All rights reserved.

This repository and its contents are not open-source. You may view the code for educational and portfolio evaluation purposes, but you may not copy, modify, distribute, or use it for commercial purposes without explicit permission.

**Project Contributors:** [Avneel Singh](https://github.com/avneelsingh) | [Khem Singh](https://github.com/khemsinghbhati)
