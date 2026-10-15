// =========================================================
// PrepPro - Firebase Authentication, Offline Cache & Cloud Sync
// Firebase project: prepyproo
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
    connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    initializeFirestore, connectFirestoreEmulator, persistentLocalCache,
    persistentMultipleTabManager, doc, setDoc, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase web configuration is public client configuration, not a server secret.
const firebaseConfig = {
    apiKey: "AIzaSyCLK-qHTuh1nwCwyVdBpeJF7-8HGLZDshw",
    authDomain: "prepyproo.firebaseapp.com",
    projectId: "prepyproo",
    storageBucket: "prepyproo.firebasestorage.app",
    messagingSenderId: "94747453911",
    appId: "1:94747453911:web:e2dbfd6b1fad2f126ec392",
    measurementId: "G-N0R12V9Y2K"
};

const useFirebaseEmulators = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname);
const firebaseApp = useFirebaseEmulators
    ? initializeApp({ ...firebaseConfig, projectId: "demo-prepyproo" }, "prepyproo-local")
    : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

if (useFirebaseEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// IndexedDB-backed Firestore persistence; supports multiple tabs.
const db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (useFirebaseEmulators) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.info("PrepPro is using local Firebase Auth and Firestore emulators.");
}

const provider = new GoogleAuthProvider();

let currentUser = null;
let saveQueue = Promise.resolve();
let authRequestId = 0;
let cloudListenerUnsubscribe = null;

const DEFAULT_DATA = { subjects: [], xp: 0 };
const copyDefaultData = () => structuredClone(DEFAULT_DATA);
const userDocument = (uid) => doc(db, "users", uid);
const localKey = (uid) => `prepProData_v12_${uid}`;
const pendingKey = (uid) => `prepProPending_v1_${uid}`;

function setStatus(message) {
    const el = document.getElementById("auth-status");
    if (el) el.textContent = message;
}

function setSaveStatus(message) {
    // Optional UI: add <span id="save-status"></span> to display this status.
    const el = document.getElementById("save-status");
    if (el) el.textContent = message;
    window.dispatchEvent(new CustomEvent("preppro:savestatus", { detail: { message } }));
}

function showLogin() {
    document.getElementById("login-view")?.classList.remove("hidden");
    document.getElementById("app-view")?.classList.add("hidden");
}

function showApp() {
    document.getElementById("login-view")?.classList.add("hidden");
    document.getElementById("app-view")?.classList.remove("hidden");
}

function showToast(message, type = "error") {
    if (window.app && typeof window.app.showToast === "function") window.app.showToast(message, type);
    else console.error(message);
}

function renderUser(user) {
    const area = document.getElementById("user-auth-area");
    if (!area) return;
    area.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center gap-3 px-2 w-full";
    const avatar = document.createElement("img");
    avatar.className = "w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm";
    avatar.alt = "Profile picture";
    if (user.photoURL) avatar.src = user.photoURL;
    else avatar.classList.add("hidden");

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
    logout.className = "text-xs font-bold text-red-400 text-left hover:underline w-max";
    logout.textContent = "Log Out";
    logout.addEventListener("click", window.logoutUser);
    details.append(name, email, logout);
    wrapper.append(avatar, details);
    area.append(wrapper);
}

function isValidData(value) {
    return !!value && Array.isArray(value.subjects) &&
        typeof value.xp === "number" && Number.isFinite(value.xp);
}

function readLocalData(uid) {
    try {
        const raw = localStorage.getItem(localKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isValidData(parsed) ? parsed : null;
    } catch (error) {
        console.warn("Unable to read local cache:", error);
        return null;
    }
}

function cacheUserData(uid, userData) {
    try {
        localStorage.setItem(localKey(uid), JSON.stringify(userData));
        return true;
    } catch (error) {
        console.warn("Unable to update local cache:", error);
        return false;
    }
}

function markPending(uid, userData) {
    try {
        localStorage.setItem(pendingKey(uid), JSON.stringify({ data: userData, updatedAt: Date.now() }));
        return true;
    } catch (error) {
        console.error("Unable to persist pending changes:", error);
        return false;
    }
}

function readPending(uid) {
    try {
        const raw = localStorage.getItem(pendingKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && isValidData(parsed.data) && Number.isFinite(parsed.updatedAt)) return parsed;
    } catch (error) {
        console.warn("Unable to read pending changes:", error);
    }
    return null;
}

function clearPendingIfUnchanged(uid, savedAt) {
    const currentPending = readPending(uid);
    // Do not clear a newer edit that was made while an older write was in flight.
    if (currentPending && currentPending.updatedAt === savedAt) {
        try { localStorage.removeItem(pendingKey(uid)); }
        catch (error) { console.warn("Unable to clear pending marker:", error); }
    }
}

async function syncPendingToCloud(uid) {
    const pending = readPending(uid);
    if (!pending) return;
    if (!currentUser || currentUser.uid !== uid) throw new Error("Account changed before syncing.");

    setSaveStatus(navigator.onLine ? "Saving to cloud..." : "Saved locally Â· Waiting to sync");
    // Firestore queues this write in its persistent local cache while offline.
    // Its promise resolves when the backend acknowledges the write.
    await setDoc(userDocument(uid), pending.data);
    clearPendingIfUnchanged(uid, pending.updatedAt);

    if (currentUser?.uid === uid) {
        setSaveStatus(readPending(uid)
            ? "Saved locally Â· More changes waiting to sync"
            : "Saved to cloud");
    }
}

// Called by app.js whenever dashboard data changes.
window.saveUserData = function (updatedData) {
    if (!currentUser) return Promise.reject(new Error("You are not signed in."));
    if (!isValidData(updatedData)) {
        return Promise.reject(new Error("The data being saved has an invalid format."));
    }

    const uid = currentUser.uid;
    const snapshot = structuredClone(updatedData);
    const cacheOk = cacheUserData(uid, snapshot);
    const pendingOk = markPending(uid, snapshot);

    if (!cacheOk || !pendingOk) {
        setSaveStatus("Local save failed");
        showToast("Could not save a local copy. Check browser storage settings.", "error");
        return Promise.reject(new Error("Could not persist the local copy of your changes."));
    }

    setSaveStatus(navigator.onLine ? "Saving to cloud..." : "Saved locally Â· Waiting to sync");

    // Serialize writes. If offline, the latest pending snapshot remains in localStorage
    // and is retried on reconnect/reload. Firestore also persists queued writes in IndexedDB.
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        if (!currentUser || currentUser.uid !== uid) throw new Error("Account changed before saving.");
        await syncPendingToCloud(uid);
    });

    return saveQueue.catch((error) => {
        console.warn("Cloud save is not yet confirmed:", error);
        if (currentUser?.uid === uid) {
            setSaveStatus(navigator.onLine ? "Saved locally Â· Cloud sync pending" : "Saved locally Â· Waiting to sync");
        }
        throw error;
    });
};

window.syncToCloud = (localData) => window.saveUserData(localData);

async function loadUserData(user) {
    const uid = user.uid;
    const pending = readPending(uid);
    const localData = readLocalData(uid);

    // Pending local edits take priority over a potentially older cloud copy.
    if (pending) return pending.data;

    try {
        const snapshot = await getDoc(userDocument(uid));
        if (snapshot.exists()) {
            const cloudData = snapshot.data();
            if (!isValidData(cloudData)) throw new Error("Your saved data has an unexpected format.");
            return cloudData;
        }

        // Do not silently import a local cache into a new account.
        const initialData = copyDefaultData();
        await setDoc(userDocument(uid), initialData);
        return initialData;
    } catch (error) {
        // Offline fallback is restricted to this authenticated user's UID-specific cache.
        if (localData) {
            setSaveStatus("Offline mode Â· Showing locally cached data");
            return localData;
        }
        throw error;
    }
}

window.addEventListener("online", () => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    saveQueue = saveQueue.catch(() => {}).then(() => syncPendingToCloud(uid)).catch((error) => {
        console.warn("Cloud sync retry did not complete:", error);
        setSaveStatus("Cloud sync pending");
    });
});

window.addEventListener("offline", () => {
    if (currentUser) setSaveStatus("Offline Â· Changes are being saved locally");
});

window.loginWithGoogle = async function () {
    setStatus("Opening sign-in window...");
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google sign-in failed:", error);
        setStatus(error.code === "auth/popup-closed-by-user"
            ? "Sign-in cancelled."
            : "Sign-in failed: " + (error.message || "Please try again."));
    }
};

window.logoutUser = async function () {
    try {
        // Per-user local cache and pending edits are retained for that same UID.
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
        showToast("Unable to log out. Please try again.", "error");
    }
};

onAuthStateChanged(auth, async (user) => {
    const requestId = ++authRequestId;
    if (cloudListenerUnsubscribe) {
        cloudListenerUnsubscribe();
        cloudListenerUnsubscribe = null;
    }

    if (!user) {
        currentUser = null;
        data = copyDefaultData();
        document.getElementById("user-auth-area")?.replaceChildren();
        showLogin();
        setStatus("");
        setSaveStatus("");
        return;
    }

    currentUser = user;
    showLogin();
    setStatus("Loading your data...");

    try {
        const loadedData = await loadUserData(user);
        if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;

        data = loadedData;
        cacheUserData(user.uid, loadedData);
        renderUser(user);
        showApp();
        setStatus("");

        if (typeof app !== "undefined" && typeof app.init === "function") app.init();
        else throw new Error("PrepPro app is not initialized. Check app.js loading order.");

        // Retry pending local edits after app initialization.
        if (readPending(user.uid)) {
            saveQueue = saveQueue.catch(() => {}).then(() => syncPendingToCloud(user.uid)).catch((error) => {
                console.warn("Pending changes remain queued:", error);
                setSaveStatus(navigator.onLine ? "Cloud sync pending" : "Saved locally Â· Waiting to sync");
            });
        } else {
            setSaveStatus(navigator.onLine ? "Connected" : "Offline mode");
        }

        // Listen for changes made on another device. Do not overwrite local pending edits.
        cloudListenerUnsubscribe = onSnapshot(
            userDocument(user.uid),
            { includeMetadataChanges: true },
            (snapshot) => {
                if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;
                if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists()) return;
                if (readPending(user.uid)) return;
                const remoteData = snapshot.data();
                if (!isValidData(remoteData)) return;
                data = remoteData;
                cacheUserData(user.uid, remoteData);
                // Assumes app.init() renders from the global `data` variable, as in the original code.
                if (typeof app !== "undefined" && typeof app.init === "function") app.init();
            },
            (error) => console.warn("Cloud updates listener failed:", error)
        );
    } catch (error) {
        console.error("Could not load PrepPro data:", error);
        if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;

        const localData = readLocalData(user.uid);
        if (localData) {
            data = localData;
            renderUser(user);
            showApp();
            setStatus("");
            setSaveStatus("Offline mode Â· Showing locally cached data");
            if (typeof app !== "undefined" && typeof app.init === "function") app.init();
            return;
        }

        // Don't sign the user out merely because the network is unavailable.
        showLogin();
        setStatus("Could not load your data. Connect to the internet and try again.");
    }
});
