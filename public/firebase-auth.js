// PrepPro authentication and local-first storage.
// Firebase Authentication identifies the user. The app's ongoing data is stored in IndexedDB.
// A read-only legacy Firestore path is retained temporarily to migrate existing users' old data.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
    connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
if (useFirebaseEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

// Firestore is used only for the one-time legacy-data migration. It is no longer written
// during ordinary app use and no snapshot listener is installed.
const legacyDb = getFirestore(firebaseApp);
if (useFirebaseEmulators) connectFirestoreEmulator(legacyDb, "127.0.0.1", 8080);

const provider = new GoogleAuthProvider();
let currentUser = null;
let authRequestId = 0;
let loadNotice = "";
let idbPromise = null;
let latestLocalSaveAt = 0;

const DEFAULT_DATA = { subjects: [], xp: 0 };
const LOCAL_DB_NAME = "preppro-local-data";
const LOCAL_DB_VERSION = 1;
const LOCAL_STORE_NAME = "users";
const LEGACY_MIGRATION_MARKER = "_prepProLocalOnlyMigrationAt";
const copyDefaultData = () => structuredClone(DEFAULT_DATA);
const legacyUserDocument = (uid) => doc(legacyDb, "users", uid);

function setStatus(message) {
    const element = document.getElementById("auth-status");
    if (element) element.textContent = message;
}

function setSaveStatus(message) {
    const element = document.getElementById("save-status");
    if (element) element.textContent = message;
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

function isValidData(value) {
    return !!value && Array.isArray(value.subjects) &&
        typeof value.xp === "number" && Number.isFinite(value.xp);
}

function openLocalDatabase() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("This browser does not support IndexedDB. Please use a current browser."));
            return;
        }
        const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
                db.createObjectStore(LOCAL_STORE_NAME, { keyPath: "uid" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open local storage."));
        request.onblocked = () => reject(new Error("Local storage upgrade is blocked by another PrepPro tab. Close other tabs and retry."));
    });
    return idbPromise;
}

async function readLocalUserData(uid) {
    const db = await openLocalDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_STORE_NAME, "readonly");
        const request = transaction.objectStore(LOCAL_STORE_NAME).get(uid);
        request.onsuccess = () => {
            const record = request.result;
            resolve(record && isValidData(record.data) ? record : null);
        };
        request.onerror = () => reject(request.error || new Error("Could not read local PrepPro data."));
        transaction.onabort = () => reject(transaction.error || new Error("Local data read was aborted."));
    });
}

async function writeLocalUserData(uid, userData) {
    if (!currentUser || currentUser.uid !== uid) throw new Error("Account changed before saving.");
    if (!isValidData(userData)) throw new Error("The data being saved has an invalid format.");
    const db = await openLocalDatabase();
    const record = {
        uid,
        data: structuredClone(userData),
        updatedAt: Date.now(),
        schemaVersion: 2
    };
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_STORE_NAME, "readwrite");
        transaction.objectStore(LOCAL_STORE_NAME).put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Could not save local PrepPro data."));
        transaction.onabort = () => reject(transaction.error || new Error("Local data save was aborted."));
    });
    latestLocalSaveAt = record.updatedAt;
    setSaveStatus("Saved on this device");
    return record;
}

async function requestPersistentStorage() {
    try {
        if (navigator.storage?.persist) {
            const persisted = await navigator.storage.persist();
            if (!persisted) setSaveStatus("Saved on this device · Browser may clear inactive storage");
        }
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = Number(estimate.usage || 0);
            const quota = Number(estimate.quota || 0);
            if (quota > 0) {
                const usedMB = (usage / (1024 * 1024)).toFixed(1);
                const quotaMB = (quota / (1024 * 1024)).toFixed(0);
                setSaveStatus("Saved on this device · " + usedMB + " MB used of about " + quotaMB + " MB estimated");
            }
        }
    } catch (error) {
        console.warn("Could not inspect browser storage quota:", error);
    }
}

function renderUser(user) {
    const area = document.getElementById("user-auth-area");
    if (!area) return;
    area.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col gap-3 w-full";
    const identity = document.createElement("div");
    identity.className = "flex items-center gap-3 px-2 w-full";
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
    identity.append(avatar, details);
    wrapper.append(identity);

    const transferLabel = document.createElement("p");
    transferLabel.className = "px-2 text-[10px] uppercase tracking-widest font-black text-slate-500";
    transferLabel.textContent = "Local data · This browser only";
    wrapper.append(transferLabel);

    const actionRow = document.createElement("div");
    actionRow.className = "grid grid-cols-2 gap-2";
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200";
    exportButton.textContent = "Export data";
    exportButton.addEventListener("click", window.exportPrepProData);

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.className = "hidden";
    importInput.id = "preppro-import-data-file";
    importInput.addEventListener("change", window.importPrepProData);
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200";
    importButton.textContent = "Import data";
    importButton.addEventListener("click", () => importInput.click());
    actionRow.append(exportButton, importButton);
    wrapper.append(actionRow, importInput);
    area.append(wrapper);
}

window.saveUserData = async function (updatedData) {
    if (!currentUser) throw new Error("You are not signed in.");
    try {
        const record = await writeLocalUserData(currentUser.uid, updatedData);
        return record;
    } catch (error) {
        console.error("Local PrepPro save failed:", error);
        setSaveStatus("Local save failed");
        showToast("Could not save locally. Check browser storage space and permissions.", "error");
        throw error;
    }
};

// Preserve the prior public function name for any existing feature code.
window.syncToCloud = (localData) => window.saveUserData(localData);

window.exportPrepProData = async function () {
    if (!currentUser) return showToast("Sign in before exporting data.", "error");
    try {
        const normalized = window.app?.normalizeData ? window.app.normalizeData(data) : data;
        const envelope = {
            app: "PrepPro",
            formatVersion: 1,
            userId: currentUser.uid,
            exportedAt: new Date().toISOString(),
            data: normalized
        };
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "PrepPro-data-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast("Data exported. Import this JSON on the other device using the same account.", "success");
    } catch (error) {
        console.error(error);
        showToast("Could not export data: " + error.message, "error");
    }
};

window.importPrepProData = async function (event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file || !currentUser) return;
    if (file.size > 100 * 1024 * 1024) return showToast("This import file is too large (100 MB max).", "error");
    try {
        const envelope = JSON.parse(await file.text());
        if (envelope.app !== "PrepPro" || envelope.formatVersion !== 1 || !isValidData(envelope.data)) {
            throw new Error("This is not a valid PrepPro export file.");
        }
        if (envelope.userId !== currentUser.uid) {
            throw new Error("This export belongs to a different account. Sign in with the account that created it.");
        }
        if (!confirm("Replace the data on this device with the imported PrepPro data? This cannot be undone.")) return;
        const normalized = window.app?.normalizeData ? window.app.normalizeData(envelope.data) : envelope.data;
        await writeLocalUserData(currentUser.uid, normalized);
        data = normalized;
        window.app?.init?.();
        await requestPersistentStorage();
        showToast("Data imported and saved on this device.", "success");
    } catch (error) {
        console.error(error);
        showToast("Import failed: " + error.message, "error");
    }
};

async function loadUserData(user) {
    const uid = user.uid;
    loadNotice = "";
    const localRecord = await readLocalUserData(uid);
    if (localRecord) {
        latestLocalSaveAt = Number(localRecord.updatedAt || 0);
        return localRecord.data;
    }

    // One-time migration path for data created before the local-first release.
    // Once one device is migrated, a small marker prevents another device from silently
    // importing a stale Firestore copy; the user can explicitly transfer the latest export.
    try {
        const snapshot = await getDoc(legacyUserDocument(uid));
        if (snapshot.exists()) {
            const legacyData = snapshot.data();
            if (legacyData[LEGACY_MIGRATION_MARKER]) {
                loadNotice = "No local copy on this device. Import an export from your other device.";
                const initialData = copyDefaultData();
                await writeLocalUserData(uid, initialData);
                return initialData;
            }
            const cleanLegacyData = { ...legacyData };
            delete cleanLegacyData[LEGACY_MIGRATION_MARKER];
            if (!isValidData(cleanLegacyData)) {
                throw new Error("Your previous cloud data has an unexpected format.");
            }
            await writeLocalUserData(uid, cleanLegacyData);
            try {
                await setDoc(legacyUserDocument(uid), {
                    [LEGACY_MIGRATION_MARKER]: new Date().toISOString()
                }, { merge: true });
            } catch (markerError) {
                console.warn("Could not mark legacy migration; this device's local copy was saved.", markerError);
            }
            loadNotice = "Your old cloud data was migrated to this browser. Export it to transfer it to other devices.";
            return cleanLegacyData;
        }
    } catch (error) {
        console.error("Legacy data migration could not be checked:", error);
        throw new Error("Could not load local data or check your previous saved data. Connect to the internet and retry.");
    }

    const initialData = copyDefaultData();
    await writeLocalUserData(uid, initialData);
    loadNotice = "New local workspace created. Export/import transfers data between devices.";
    return initialData;
}

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
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
        showToast("Unable to log out. Please try again.", "error");
    }
};

window.addEventListener("online", () => {
    if (currentUser) setSaveStatus("Online · Local data remains on this device");
});
window.addEventListener("offline", () => {
    if (currentUser) setSaveStatus("Offline · Saving locally on this device");
});

onAuthStateChanged(auth, async (user) => {
    const requestId = ++authRequestId;
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
    setStatus("Loading this device's saved data...");
    try {
        const loadedData = await loadUserData(user);
        if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;
        data = loadedData;
        renderUser(user);
        showApp();
        setStatus("");
        if (typeof app !== "undefined" && typeof app.init === "function") app.init();
        else throw new Error("PrepPro app is not initialized. Check app loading order.");
        if (loadNotice) showToast(loadNotice, "info");
        setSaveStatus("Saved on this device");
        await requestPersistentStorage();
    } catch (error) {
        console.error("Could not load PrepPro data:", error);
        if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;
        showLogin();
        setStatus(error.message || "Could not open your local data. Check storage and retry.");
    }
});