# prepyproo
A flashcard and quiz platform
# 🎓 PrepPro - Gamified Learning & Quiz Platform

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase)

**[Live : Play PrepPro Here](https://prepyproo.web.app)**

PrepPro is a sleek, serverless single-page web application (SPA) designed to help students organize their learning paths, master flashcards, and track their quiz accuracy over time. It features a gamified XP system, detailed analytics charting, and full cloud synchronization.

## ✨ Features

* **Secure Authentication:** Integrated Google Sign-In using Firebase Auth. Data is strictly locked to individual users.
* **Real-time Cloud Sync:** User data, subjects, and study histories are instantly saved and retrieved from Cloud Firestore.
* **Media Uploads:** Users can upload images for flashcards and quiz questions directly to Firebase Cloud Storage, keeping the database incredibly lightweight.
* **Dual Interface Modes:** 
  * *Creator Mode:* Build nested subjects, topics, and subtopics. Draft flashcards and construct custom MCQ, MSQ, and Numerical quiz sets.
  * *Learner Mode:* Flip through interactive 3D flashcards and take quizzes with immediate dynamic feedback.
* **Gamification & Analytics:** Earn XP for completing study sessions. Track performance history and topic accuracy via dynamic horizontal bar charts.

## 🛠️ Tech Stack

* **Frontend:** HTML5, Vanilla JavaScript (ES6+), CSS3
* **Styling:** Tailwind CSS (via CDN) & Phosphor Icons
* **Backend as a Service (BaaS):** 
  * Firebase Authentication (Google Provider)
  * Cloud Firestore (NoSQL Database)
  * Firebase Cloud Storage (Image Hosting)
* **Hosting:** Firebase Hosting

---

## 📖 How to Use PrepPro

### 1. Creator Mode (Building Content)
By default, you enter the app in **Creator Mode**.
1. **Create a Hierarchy:** Click **+ Add First Subject**. From there, you can add "Topics" inside that subject, and "Subtopics" inside those topics. 
2. **Add Content:** Click on any Subtopic card to open the Editor.
3. **Flashcards:** Add front/back text or upload an image.
4. **Question Sets:** Create a new Set, then add questions. Select between Multiple Choice (MCQ), Multiple Select (MSQ), or Exact Numerical inputs. Check the box next to the correct answer before saving.

### 2. Learner Mode (Studying)
Toggle the **Mode** switch in the bottom left of the sidebar to **Learner**.
1. **Navigate:** Click on any Subtopic card to open the Action Sheet.
2. **Master Flashcards:** Click through your 3D flashcards. Tap to flip them over.
3. **Take a Quiz:** Select a question set. Answer the questions and hit "Check". If you are correct, you will earn XP!
4. **Mark Complete:** Once you have mastered a subtopic, click the checkbox on the subtopic card to turn it green and increase your total Subject Progress bar.

### 3. Analytics
Click the **Analytics** tab in the sidebar to view your performance.
* View total XP, total questions solved, and flashcard revisions.
* Click **View History** on any question set to see a dynamic graph of your past attempts, accuracy percentages, and timestamps.

# License
© 2026 Khem Singh. All Rights Reserved.

This repository and its contents are not open-source. You may view the code for educational and portfolio evaluation purposes, but you may not copy, modify, distribute, or use it for commercial purposes without explicit permission.

