// =========================================================
// PrepPro - Firebase Authentication & Cloud Sync
// Firebase project: prepyproo
// =========================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================
// Firebase Configuration
// Keep the original firebase-auth.js project details.
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyCLK-qHTuh1nwCwyVdBpeJF7-8HGLZDshw",
    authDomain: "prepyproo.firebaseapp.com",
    projectId: "prepyproo",
    storageBucket: "prepyproo.firebasestorage.app",
    messagingSenderId: "94747453911",
    appId: "1:94747453911:web:e2dbfd6b1fad2f126ec392",
    measurementId: "G-N0R12V9Y2K"
};

// =========================================================
// Initialize Firebase Services
// =========================================================

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// =========================================================
// Application State
// =========================================================

let currentUser = null;
let saveQueue = Promise.resolve();
let authRequestId = 0;

const DEFAULT_DATA = {
    subjects: [],
    xp: 0
};

const copyDefaultData = () => structuredClone(DEFAULT_DATA);

const userDocument = (uid) => doc(db, "users", uid);

const localKey = (uid) => `prepProData_v12_${uid}`;

// =========================================================
// Status and View Helpers
// =========================================================

function setStatus(message) {
    const el = document.getElementById("auth-status");

    if (el) {
        el.textContent = message;
    }
}

function showLogin() {
    document.getElementById("login-view")
        ?.classList.remove("hidden");

    document.getElementById("app-view")
        ?.classList.add("hidden");
}

function showApp() {
    document.getElementById("login-view")
        ?.classList.add("hidden");

    document.getElementById("app-view")
        ?.classList.remove("hidden");
}

function showToast(message, type = "error") {
    if (window.app && typeof window.app.showToast === "function") {
        window.app.showToast(message, type);
    } else {
        console.error(message);
    }
}

// =========================================================
// User Profile Rendering
// =========================================================

function renderUser(user) {
    const area = document.getElementById("user-auth-area");

    if (!area) return;

    area.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center gap-3 px-2 w-full";

    const avatar = document.createElement("img");
    avatar.className =
        "w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm";
    avatar.alt = "Profile picture";

    if (user.photoURL) {
        avatar.src = user.photoURL;
    } else {
        avatar.classList.add("hidden");
    }

    const details = document.createElement("div");
    details.className = "flex flex-col flex-1 overflow-hidden";

    const name = document.createElement("span");
    name.className = "text-sm font-bold text-white truncate";
    name.textContent = user.displayName || user.email || "User";

    const email = document.createElement("span");
    email.className = "text-xs text-slate-400 truncate";
    email.textContent = user.email || "";

    const logout = document.createElement("button");
    logout.type = "button";
    logout.className =
        "text-xs font-bold text-red-400 text-left hover:underline w-max";
    logout.textContent = "Log Out";
    logout.addEventListener("click", window.logoutUser);

    details.append(name, email, logout);
    wrapper.append(avatar, details);
    area.append(wrapper);
}

// =========================================================
// User Data Loading
// =========================================================

async function loadUserData(user) {
    const snapshot = await getDoc(userDocument(user.uid));

    if (snapshot.exists()) {
        const cloudData = snapshot.data();

        if (
            !cloudData ||
            !Array.isArray(cloudData.subjects) ||
            typeof cloudData.xp !== "number" ||
            !Number.isFinite(cloudData.xp)
        ) {
            throw new Error(
                "Your saved data has an unexpected format."
            );
        }

        return cloudData;
    }

    // A new account starts with clean data.
    // Never import another account's local cache automatically.
    const initialData = copyDefaultData();

    await setDoc(userDocument(user.uid), initialData);

    return initialData;
}

// =========================================================
// Local Cache Helpers
// =========================================================

function cacheUserData(uid, userData) {
    try {
        localStorage.setItem(
            localKey(uid),
            JSON.stringify(userData)
        );
    } catch (error) {
        // Cloud data remains the primary persistent copy.
        console.warn("Unable to update local cache:", error);
    }
}

// =========================================================
// Save Data to Firestore
// Called by app.js whenever learning data changes.
// =========================================================

window.saveUserData = function (updatedData) {
    if (!currentUser) {
        console.error("Save skipped: no authenticated user.");

        return Promise.reject(
            new Error("You are not signed in.")
        );
    }

    if (
        !updatedData ||
        !Array.isArray(updatedData.subjects) ||
        typeof updatedData.xp !== "number" ||
        !Number.isFinite(updatedData.xp)
    ) {
        return Promise.reject(
            new Error("The data being saved has an invalid format.")
        );
    }

    const uid = currentUser.uid;
    const snapshot = structuredClone(updatedData);

    // Queue writes so an older save cannot overtake a newer save.
    saveQueue = saveQueue
        .catch(() => {
            // Let subsequent saves proceed after an earlier failure.
        })
        .then(async () => {
            // Prevent writes to an account that is no longer active.
            if (!currentUser || currentUser.uid !== uid) {
                throw new Error(
                    "Account changed before saving."
                );
            }

            // Save to Firestore first.
            await setDoc(userDocument(uid), snapshot);

            // Update the matching user's local cache.
            cacheUserData(uid, snapshot);
        });

    return saveQueue.catch((error) => {
        console.error(
            "Failed to save PrepPro data:",
            error
        );

        if (currentUser && currentUser.uid === uid) {
            showToast(
                "Cloud save failed. Check your connection and Firebase rules.",
                "error"
            );
        }

        throw error;
    });
};

// =========================================================
// Optional Compatibility Function
// Supports older code that calls syncToCloud(data).
// =========================================================

window.syncToCloud = function (localData) {
    return window.saveUserData(localData);
};

// =========================================================
// Google Sign-In
// =========================================================

window.loginWithGoogle = async function () {
    setStatus("Opening sign-in window...");

    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged handles loading the user's data.
    } catch (error) {
        console.error("Google sign-in failed:", error);

        if (error.code === "auth/popup-closed-by-user") {
            setStatus("Sign-in cancelled.");
        } else {
            setStatus(
                "Sign-in failed: " +
                (error.message || "Please try again.")
            );
        }
    }
};

// =========================================================
// Logout
// =========================================================

window.logoutUser = async function () {
    try {
        await signOut(auth);

        // Keep the user's own cache and cloud data.
        // The auth-state listener resets in-memory data.
    } catch (error) {
        console.error("Logout failed:", error);
        showToast("Unable to log out. Please try again.", "error");
    }
};

// =========================================================
// Authentication State Listener
// =========================================================

onAuthStateChanged(auth, async (user) => {
    const requestId = ++authRequestId;

    if (!user) {
        currentUser = null;

        // Reset in-memory application data on logout.
        data = copyDefaultData();

        document.getElementById("user-auth-area")
            ?.replaceChildren();

        showLogin();
        setStatus("");

        return;
    }

    currentUser = user;

    // Keep the dashboard hidden until the correct account's
    // Firestore data has loaded successfully.
    showLogin();
    setStatus("Loading your cloud data...");

    try {
        const loadedData = await loadUserData(user);

        // Ignore stale results if the authentication state changed.
        if (
            requestId !== authRequestId ||
            !currentUser ||
            currentUser.uid !== user.uid
        ) {
            return;
        }

        // Update the app's in-memory state.
        data = loadedData;

        // Update only this account's cache.
        cacheUserData(user.uid, loadedData);

        renderUser(user);
        showApp();
        setStatus("");

        if (
            typeof app !== "undefined" &&
            typeof app.init === "function"
        ) {
            app.init();
        } else {
            throw new Error(
                "PrepPro app is not initialized. Check app.js loading order."
            );
        }
    } catch (error) {
        console.error(
            "Could not load PrepPro data:",
            error
        );

        // Do not let an old request sign out a newer session.
        if (
            requestId !== authRequestId ||
            !currentUser ||
            currentUser.uid !== user.uid
        ) {
            return;
        }

        currentUser = null;

        await signOut(auth).catch((signOutError) => {
            console.error(
                "Sign-out after loading failure failed:",
                signOutError
            );
        });

        showLogin();

        setStatus(
            "Could not load your data. Check Firebase setup and Firestore rules, then sign in again."
        );
    }
});
