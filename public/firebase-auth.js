// PrepPro authentication, local-first storage, and automatic cross-device sync.
// IndexedDB keeps the app usable offline; Firestore syncs the latest snapshot between devices.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
    connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, onSnapshot, serverTimestamp
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

// Firestore is the cloud sync layer; IndexedDB remains the local cache/offline copy.
const legacyDb = getFirestore(firebaseApp);
if (useFirebaseEmulators) connectFirestoreEmulator(legacyDb, "127.0.0.1", 8080);

const provider = new GoogleAuthProvider();
let currentUser = null;
let authRequestId = 0;
let loadNotice = "";
let idbPromise = null;
let latestLocalSaveAt = 0;
let cloudUnsubscribe = null;
let cloudSyncTimer = null;
let cloudWriteInProgress = false;
let queuedCloudWrite = null;
let pendingCloudRemote = null;
let lastAppliedCloudAt = 0;
let remoteApplyInProgress = false;

const CLOUD_UPDATED_AT_FIELD = "_prepProCloudUpdatedAt";
const CLOUD_SCHEMA_FIELD = "_prepProCloudSyncSchema";
const CLOUD_SYNC_DEBOUNCE_MS = 750;
const DEFAULT_DATA = { subjects: [], xp: 0 };
const LOCAL_DB_NAME = "preppro-local-data";
const LOCAL_DB_VERSION = 1;
const LOCAL_STORE_NAME = "users";
const LEGACY_MIGRATION_MARKER = "_prepProLocalOnlyMigrationAt";
const OLD_LOCAL_KEY = (uid) => `prepProData_v12_${uid}`;
const OLD_PENDING_KEY = (uid) => `prepProPending_v1_${uid}`;
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

function extractCloudUserData(value) {
    if (!value || typeof value !== "object") return value;
    const clean = structuredClone(value);
    delete clean[CLOUD_UPDATED_AT_FIELD];
    delete clean[CLOUD_SCHEMA_FIELD];
    delete clean[LEGACY_MIGRATION_MARKER];
    return clean;
}

function cloudUpdatedAtMillis(value) {
    const stamp = value?.[CLOUD_UPDATED_AT_FIELD];
    if (stamp && typeof stamp.toMillis === "function") return stamp.toMillis();
    const numeric = Number(stamp || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function hasUserContent(value) {
    return !!value && ((Array.isArray(value.subjects) && value.subjects.length > 0) ||
        (Number(value.xp) || 0) > 0);
}

function sameUserData(first, second) {
    try {
        const left = window.app?.normalizeData
            ? window.app.normalizeData(structuredClone(first))
            : first;
        const right = window.app?.normalizeData
            ? window.app.normalizeData(structuredClone(second))
            : second;
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
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
            if (!persisted) console.warn("The browser may clear inactive local storage.");
        }
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = Number(estimate.usage || 0);
            const quota = Number(estimate.quota || 0);
            if (quota > 0) {
                console.info("PrepPro browser storage:", (usage / (1024 * 1024)).toFixed(1) +
                    " MB used of about " + (quota / (1024 * 1024)).toFixed(0) + " MB estimated.");
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

    const syncLabel = document.createElement("p");
    syncLabel.className = "px-2 text-[10px] uppercase tracking-widest font-black text-slate-500";
    syncLabel.textContent = "Automatic cloud sync · Same account on every device";
    wrapper.append(syncLabel);

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

function scheduleCloudSync(uid, userData, delay = CLOUD_SYNC_DEBOUNCE_MS) {
    if (!currentUser || currentUser.uid !== uid || !isValidData(userData)) return;
    queuedCloudWrite = {
        uid,
        data: structuredClone(userData),
        localUpdatedAt: latestLocalSaveAt || Date.now()
    };
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;

    if (!navigator.onLine) {
        setSaveStatus("Saved locally · waiting for internet to sync");
        return;
    }
    setSaveStatus("Saved locally · syncing across devices…");
    cloudSyncTimer = setTimeout(() => {
        cloudSyncTimer = null;
        flushCloudSync();
    }, delay);
}

async function flushCloudSync() {
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    if (cloudWriteInProgress || !queuedCloudWrite || !navigator.onLine || !currentUser) return;

    const item = queuedCloudWrite;
    queuedCloudWrite = null;
    if (item.uid !== currentUser.uid) return;
    cloudWriteInProgress = true;
    let failed = false;
    try {
        const payload = extractCloudUserData(item.data);
        payload[CLOUD_UPDATED_AT_FIELD] = serverTimestamp();
        payload[CLOUD_SCHEMA_FIELD] = 1;
        await setDoc(legacyUserDocument(item.uid), payload);
        if (currentUser?.uid === item.uid && !queuedCloudWrite &&
            latestLocalSaveAt <= item.localUpdatedAt) {
            setSaveStatus("Saved & synced across devices");
        }
    } catch (error) {
        failed = true;
        console.error("PrepPro cloud sync failed:", error);
        if (!queuedCloudWrite) queuedCloudWrite = item;
        setSaveStatus("Saved locally · cloud sync failed; will retry");
    } finally {
        cloudWriteInProgress = false;
        if (!failed && queuedCloudWrite && navigator.onLine && currentUser?.uid === queuedCloudWrite.uid) {
            cloudSyncTimer = setTimeout(() => {
                cloudSyncTimer = null;
                flushCloudSync();
            }, 200);
        }
    }
}

function canApplyRemoteDataNow() {
    if (!window.app) return false;
    return typeof window.app.canRefreshFromCloud !== "function" ||
        window.app.canRefreshFromCloud();
}

async function tryApplyPendingCloudRemote() {
    if (!pendingCloudRemote || remoteApplyInProgress || !currentUser ||
        currentUser.uid !== pendingCloudRemote.uid || !canApplyRemoteDataNow() ||
        queuedCloudWrite || cloudSyncTimer || cloudWriteInProgress) return;

    const pending = pendingCloudRemote;
    const localData = window.app?.normalizeData
        ? window.app.normalizeData(structuredClone(data))
        : structuredClone(data);

    if (!sameUserData(localData, pending.data) &&
        latestLocalSaveAt > pending.updatedAt && hasUserContent(localData)) {
        pendingCloudRemote = null;
        scheduleCloudSync(currentUser.uid, localData, 120);
        return;
    }

    remoteApplyInProgress = true;
    try {
        if (!currentUser || currentUser.uid !== pending.uid) return;
        const normalized = window.app?.normalizeData
            ? window.app.normalizeData(structuredClone(pending.data))
            : structuredClone(pending.data);
        await writeLocalUserData(pending.uid, normalized);
        data = normalized;
        lastAppliedCloudAt = Math.max(lastAppliedCloudAt, pending.updatedAt || 0);
        pendingCloudRemote = null;
        window.app?.refreshCurrentView?.();
        setSaveStatus("Synced updates from another device");
    } catch (error) {
        console.error("Could not apply cloud updates:", error);
        setSaveStatus("Saved locally · could not apply cloud updates");
    } finally {
        remoteApplyInProgress = false;
    }
}

function startCloudSync(uid) {
    if (cloudUnsubscribe) cloudUnsubscribe();
    cloudUnsubscribe = null;
    lastAppliedCloudAt = 0;
    pendingCloudRemote = null;

    cloudUnsubscribe = onSnapshot(legacyUserDocument(uid), { includeMetadataChanges: true }, async snapshot => {
        if (!currentUser || currentUser.uid !== uid || snapshot.metadata.fromCache ||
            snapshot.metadata.hasPendingWrites) return;

        if (!snapshot.exists()) {
            const localRecord = await readLocalUserData(uid).catch(() => null);
            if (localRecord && currentUser?.uid === uid) {
                scheduleCloudSync(uid, localRecord.data, 100);
            }
            return;
        }

        const rawCloudData = snapshot.data();
        const remoteUpdatedAt = cloudUpdatedAtMillis(rawCloudData);
        const remoteData = extractCloudUserData(rawCloudData);
        if (!isValidData(remoteData)) {
            setSaveStatus("Saved locally · cloud data format needs attention");
            return;
        }
        if (remoteUpdatedAt && remoteUpdatedAt < lastAppliedCloudAt) return;

        const localData = window.app?.normalizeData
            ? window.app.normalizeData(structuredClone(data))
            : structuredClone(data);

        if (sameUserData(localData, remoteData)) {
            lastAppliedCloudAt = Math.max(lastAppliedCloudAt, remoteUpdatedAt);
            if (!remoteUpdatedAt) scheduleCloudSync(uid, localData, 100);
            else if (!queuedCloudWrite && !cloudWriteInProgress) setSaveStatus("Saved & synced across devices");
            return;
        }

        // Local edits waiting to upload take precedence over an incoming snapshot.
        if (queuedCloudWrite || cloudSyncTimer || cloudWriteInProgress) return;

        const remoteIsNewer = (hasUserContent(remoteData) && !hasUserContent(localData)) ||
            (remoteUpdatedAt > (latestLocalSaveAt || 0));
        if (remoteIsNewer) {
            pendingCloudRemote = { uid, data: remoteData, updatedAt: remoteUpdatedAt };
            if (canApplyRemoteDataNow()) {
                await tryApplyPendingCloudRemote();
            } else {
                setSaveStatus("Update available from another device · return to dashboard to apply");
            }
        } else {
            scheduleCloudSync(uid, localData, 150);
        }
    }, error => {
        console.error("PrepPro cloud listener failed:", error);
        if (currentUser?.uid === uid) setSaveStatus("Saved locally · cloud sync unavailable");
    });
}

window.addEventListener("focus", () => tryApplyPendingCloudRemote());
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryApplyPendingCloudRemote();
});

window.saveUserData = async function (updatedData) {
    if (!currentUser) throw new Error("You are not signed in.");
    try {
        const record = await writeLocalUserData(currentUser.uid, updatedData);
        scheduleCloudSync(currentUser.uid, updatedData);
        return record;
    } catch (error) {
        console.error("Local PrepPro save failed:", error);
        setSaveStatus("Local save failed");
        showToast("Could not save locally. Check browser storage space and permissions.", "error");
        throw error;
    }
};

// Preserve the prior public function name for existing feature code.
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
        await window.saveUserData(normalized);
        data = normalized;
        window.app?.init?.();
        await requestPersistentStorage();
        showToast("Data imported and saved on this device.", "success");
    } catch (error) {
        console.error(error);
        showToast("Import failed: " + error.message, "error");
    }
};

function readPreviousLocalSnapshot(uid) {
    // Upgrade path for the previous release's localStorage cache/pending queue.
    // A pending snapshot is the most recent unsynced version and takes precedence.
    for (const key of [OLD_PENDING_KEY(uid), OLD_LOCAL_KEY(uid)]) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const candidate = key === OLD_PENDING_KEY(uid) ? parsed?.data : parsed;
            if (isValidData(candidate)) return candidate;
        } catch (error) {
            console.warn("Could not migrate previous local cache:", error);
        }
    }
    return null;
}

async function loadUserData(user) {
    const uid = user.uid;
    loadNotice = "";
    let localRecord = await readLocalUserData(uid);
    let localData = localRecord?.data || null;

    // Upgrade any localStorage-era copy before comparing it with the cloud.
    if (!localData) {
        const previousLocalSnapshot = readPreviousLocalSnapshot(uid);
        if (previousLocalSnapshot) {
            localRecord = await writeLocalUserData(uid, previousLocalSnapshot);
            localData = localRecord.data;
        }
    }

    let cloudSnapshot = null;
    let cloudReadFailed = false;
    try {
        cloudSnapshot = await getDoc(legacyUserDocument(uid));
    } catch (error) {
        cloudReadFailed = true;
        console.warn("Cloud data could not be checked; the local copy will remain usable:", error);
    }

    const cloudIsCached = !!cloudSnapshot?.metadata?.fromCache;
    const cloudExists = !!cloudSnapshot?.exists?.();
    const rawCloudData = cloudExists ? cloudSnapshot.data() : null;
    const remoteUpdatedAt = cloudUpdatedAtMillis(rawCloudData);
    let remoteData = rawCloudData ? extractCloudUserData(rawCloudData) : null;
    if (remoteData && !isValidData(remoteData)) remoteData = null;
    if (remoteData && window.app?.normalizeData) {
        remoteData = window.app.normalizeData(structuredClone(remoteData));
    }

    if (localData) {
        latestLocalSaveAt = Number(localRecord?.updatedAt || Date.now());

        if (cloudReadFailed || cloudIsCached) {
            loadNotice = "Your local data is ready. Cloud sync will resume when a current connection is available.";
            return localData;
        }

        if (remoteData) {
            if (sameUserData(localData, remoteData)) {
                lastAppliedCloudAt = remoteUpdatedAt;
                if (!remoteUpdatedAt) scheduleCloudSync(uid, localData, 120);
                return localData;
            }

            const remoteShouldWin = (hasUserContent(remoteData) && !hasUserContent(localData)) ||
                (remoteUpdatedAt > latestLocalSaveAt);
            if (remoteShouldWin) {
                const saved = await writeLocalUserData(uid, remoteData);
                latestLocalSaveAt = saved.updatedAt;
                lastAppliedCloudAt = remoteUpdatedAt;
                if (!remoteUpdatedAt) scheduleCloudSync(uid, remoteData, 120);
                loadNotice = "Loaded the latest cloud copy. Changes will now sync automatically across your devices.";
                return remoteData;
            }

            scheduleCloudSync(uid, localData, 120);
            loadNotice = "Your local copy was kept and will sync automatically across your devices.";
            return localData;
        }

        if (cloudExists) {
            loadNotice = "Your local copy is safe, but the cloud copy has an unexpected format. It was not overwritten.";
            return localData;
        }

        // A server-confirmed missing cloud record can be initialized from this device.
        scheduleCloudSync(uid, localData, 120);
        return localData;
    }

    if (remoteData) {
        const saved = await writeLocalUserData(uid, remoteData);
        latestLocalSaveAt = saved.updatedAt;
        lastAppliedCloudAt = remoteUpdatedAt;
        if (!cloudReadFailed && !cloudIsCached && !remoteUpdatedAt) {
            scheduleCloudSync(uid, remoteData, 120);
        }
        loadNotice = "Your data is available on this device and will sync automatically when online.";
        return remoteData;
    }

    const initialData = copyDefaultData();
    await writeLocalUserData(uid, initialData);
    if (cloudReadFailed || cloudIsCached) {
        loadNotice = "A local workspace is ready. PrepPro will check for your cloud data when the connection is available.";
    } else if (cloudExists) {
        loadNotice = "The cloud copy could not be validated. Your new local workspace was not uploaded automatically.";
    } else {
        scheduleCloudSync(uid, initialData, 300);
        loadNotice = "New workspace created. Changes now sync automatically across devices using this account.";
    }
    return initialData;
}

let deviceTransfer = null;
const TRANSFER_LABEL = "PrepPro";
const TRANSFER_MAX_CHARS = 100 * 1024 * 1024;
const TRANSFER_CHUNK_CHARS = 12000;

function transferEscape(value) {
    return window.app?.escapeHTML
        ? window.app.escapeHTML(value)
        : String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function transferNonce() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function updateTransferStatus(message) {
    const status = document.getElementById("device-transfer-status");
    if (status) status.textContent = message;
}

function closeDeviceTransfer() {
    if (!deviceTransfer) return;
    try { deviceTransfer.channel?.close(); } catch {}
    try { deviceTransfer.pc?.close(); } catch {}
    deviceTransfer = null;
}

function waitForIceGathering(pc) {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", onChange);
        };
        const onChange = () => {
            if (pc.iceGatheringState === "complete") {
                cleanup();
                resolve();
            }
        };
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Network setup timed out while preparing the device connection. Try again."));
        }, 20000);
        pc.addEventListener("icegatheringstatechange", onChange);
    });
}

function makeDevicePeerConnection() {
    if (!("RTCPeerConnection" in window)) {
        throw new Error("This browser does not support direct device transfer. Use Export/Import data instead.");
    }
    return new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
}

function sendTransferJson(channel, payload) {
    return new Promise((resolve, reject) => {
        const send = () => {
            if (channel.readyState !== "open") {
                reject(new Error("The device connection closed."));
                return;
            }
            try {
                channel.send(JSON.stringify(payload));
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        if (channel.bufferedAmount < 512 * 1024) {
            send();
            return;
        }
        const onLow = () => {
            channel.removeEventListener("close", onClose);
            send();
        };
        const onClose = () => {
            channel.removeEventListener("bufferedamountlow", onLow);
            reject(new Error("The device connection closed."));
        };
        channel.addEventListener("bufferedamountlow", onLow, { once: true });
        channel.addEventListener("close", onClose, { once: true });
    });
}

async function sendCurrentDeviceData(session) {
    if (!currentUser || !session || session !== deviceTransfer || session.role !== "send") return;
    const normalized = window.app?.normalizeData ? window.app.normalizeData(structuredClone(data)) : structuredClone(data);
    const payload = {
        app: TRANSFER_LABEL,
        formatVersion: 1,
        userId: currentUser.uid,
        exportedAt: new Date().toISOString(),
        data: normalized
    };
    const serialized = JSON.stringify(payload);
    if (serialized.length > TRANSFER_MAX_CHARS) {
        showToast("This data set is too large for direct transfer. Use Export/Import data instead.", "error");
        return;
    }
    const totalParts = Math.ceil(serialized.length / TRANSFER_CHUNK_CHARS);
    try {
        await sendTransferJson(session.channel, {
            type: "start", userId: currentUser.uid, nonce: session.nonce,
            totalParts, totalChars: serialized.length
        });
        for (let index = 0; index < totalParts; index += 1) {
            await sendTransferJson(session.channel, {
                type: "chunk", index,
                content: serialized.slice(index * TRANSFER_CHUNK_CHARS, (index + 1) * TRANSFER_CHUNK_CHARS)
            });
            if (index % 50 === 0 || index === totalParts - 1) {
                updateTransferStatus("Sending data… " +
                    Math.min(serialized.length, (index + 1) * TRANSFER_CHUNK_CHARS).toLocaleString() +
                    " / " + serialized.length.toLocaleString() + " characters");
            }
        }
        await sendTransferJson(session.channel, { type: "finish", userId: currentUser.uid, nonce: session.nonce });
        updateTransferStatus("Transfer sent. Confirm the replacement on the receiving device.");
    } catch (error) {
        console.error("Device transfer send failed:", error);
        updateTransferStatus("Transfer failed: " + error.message);
        showToast("Device transfer failed. You can use Export/Import data instead.", "error");
    }
}

function setDeviceTransferChannel(channel, session) {
    session.channel = channel;
    channel.bufferedAmountLowThreshold = 128 * 1024;
    channel.onopen = () => {
        if (session.role === "send") {
            updateTransferStatus("Connected. Sending the latest local data…");
            sendCurrentDeviceData(session);
        } else {
            updateTransferStatus("Connected. Waiting for the other device to send its data…");
        }
    };
    channel.onclose = () => {
        if (session === deviceTransfer) updateTransferStatus("Device connection closed.");
    };
    channel.onerror = () => {
        if (session === deviceTransfer) updateTransferStatus("The device connection encountered an error.");
    };
    channel.onmessage = event => handleDeviceTransferMessage(event, session);
}

function showDeviceTransferSendModal(offerCode) {
    const html =
        '<div class="space-y-4">' +
        '<p class="text-sm text-slate-300 leading-relaxed">Keep this device online. Copy the offer code, open PrepPro on your other device, choose <strong>Receive from device</strong>, and paste the code. Then paste the answer code from that device below.</p>' +
        '<label class="block text-xs text-slate-400 font-bold mb-2">Offer code</label>' +
        '<textarea id="device-transfer-offer-code" rows="5" readonly class="w-full p-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono">' + transferEscape(offerCode) + '</textarea>' +
        '<button type="button" onclick="window.copyPrepProTransferCode(\'device-transfer-offer-code\')" class="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold">Copy offer code</button>' +
        '<label class="block text-xs text-slate-400 font-bold mb-2">Answer code from the receiving device</label>' +
        '<textarea id="device-transfer-answer-code" rows="5" placeholder="Paste the answer code here…" class="w-full p-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"></textarea>' +
        '<button type="button" onclick="window.completePrepProDeviceSend()" class="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black">Connect and send latest data</button>' +
        '<p id="device-transfer-status" role="status" class="text-xs text-slate-400">Waiting for the receiving device.</p>' +
        '</div>';
    window.app.showModal("Send data to another device", html);
}

window.copyPrepProTransferCode = async function (elementId) {
    const field = document.getElementById(elementId);
    if (!field) return;
    try {
        await navigator.clipboard.writeText(field.value);
        showToast("Device-transfer code copied.", "success");
    } catch (error) {
        field.focus();
        field.select();
        try {
            const copied = document.execCommand("copy");
            if (copied) showToast("Device-transfer code copied.", "success");
            else showToast("Copy failed. Select the code and copy it manually.", "error");
        } catch {
            showToast("Select the code and copy it manually.", "error");
        }
    }
};

window.startPrepProDeviceSend = async function () {
    if (!currentUser) return showToast("Sign in before transferring data.", "error");
    try {
        closeDeviceTransfer();
        const pc = makeDevicePeerConnection();
        const session = { role: "send", pc, channel: null, nonce: transferNonce() };
        deviceTransfer = session;
        const channel = pc.createDataChannel("preppro-transfer", { ordered: true });
        setDeviceTransferChannel(channel, session);
        pc.onconnectionstatechange = () => {
            if (session !== deviceTransfer) return;
            if (["failed", "disconnected"].includes(pc.connectionState)) {
                updateTransferStatus("Connection failed. Your network may block direct connections; use Export/Import as a fallback.");
            }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);
        if (session !== deviceTransfer) return;
        const code = JSON.stringify({
            app: TRANSFER_LABEL,
            formatVersion: 1,
            kind: "offer",
            userId: currentUser.uid,
            nonce: session.nonce,
            sdp: pc.localDescription.sdp
        });
        showDeviceTransferSendModal(code);
    } catch (error) {
        console.error(error);
        closeDeviceTransfer();
        showToast("Could not prepare device transfer: " + error.message, "error");
    }
};

window.completePrepProDeviceSend = async function () {
    const session = deviceTransfer;
    if (!session || session.role !== "send" || !currentUser) return showToast("Start a new device transfer first.", "error");
    try {
        const raw = document.getElementById("device-transfer-answer-code")?.value || "";
        const answer = JSON.parse(raw);
        if (answer.app !== TRANSFER_LABEL || answer.formatVersion !== 1 ||
            answer.kind !== "answer" || answer.userId !== currentUser.uid ||
            answer.nonce !== session.nonce || typeof answer.sdp !== "string") {
            throw new Error("The answer code is invalid or belongs to a different account/transfer.");
        }
        await session.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        updateTransferStatus("Answer accepted. Connecting to the receiving device…");
    } catch (error) {
        showToast("Could not connect: " + error.message, "error");
    }
};

window.startPrepProDeviceReceive = function () {
    if (!currentUser) return showToast("Sign in before receiving data.", "error");
    const html =
        '<div class="space-y-4">' +
        '<p class="text-sm text-slate-300 leading-relaxed">Keep this device online. On the source device, choose <strong>Send to device</strong> and paste the offer code below. This transfer goes directly between browsers; both devices must stay open until it finishes.</p>' +
        '<label class="block text-xs text-slate-400 font-bold mb-2">Offer code from the source device</label>' +
        '<textarea id="device-transfer-receive-offer" rows="6" placeholder="Paste the offer code here…" class="w-full p-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"></textarea>' +
        '<button type="button" onclick="window.preparePrepProDeviceAnswer()" class="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black">Create answer code</button>' +
        '<p id="device-transfer-status" role="status" class="text-xs text-slate-400">Waiting for an offer code.</p>' +
        '</div>';
    window.app.showModal("Receive data from another device", html);
};

window.preparePrepProDeviceAnswer = async function () {
    if (!currentUser) return showToast("Sign in before receiving data.", "error");
    try {
        const raw = document.getElementById("device-transfer-receive-offer")?.value || "";
        const offer = JSON.parse(raw);
        if (offer.app !== TRANSFER_LABEL || offer.formatVersion !== 1 ||
            offer.kind !== "offer" || offer.userId !== currentUser.uid ||
            typeof offer.nonce !== "string" || typeof offer.sdp !== "string") {
            throw new Error("The offer code is invalid or belongs to a different account.");
        }
        closeDeviceTransfer();
        const pc = makeDevicePeerConnection();
        const session = {
            role: "receive", pc, channel: null, nonce: offer.nonce,
            receiveState: null, pendingPayload: null
        };
        deviceTransfer = session;
        pc.ondatachannel = event => setDeviceTransferChannel(event.channel, session);
        pc.onconnectionstatechange = () => {
            if (session !== deviceTransfer) return;
            if (["failed", "disconnected"].includes(pc.connectionState)) {
                updateTransferStatus("Connection failed. Your network may block direct connections; use Export/Import as a fallback.");
            }
        };
        await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);
        if (session !== deviceTransfer) return;
        const answerCode = JSON.stringify({
            app: TRANSFER_LABEL,
            formatVersion: 1,
            kind: "answer",
            userId: currentUser.uid,
            nonce: session.nonce,
            sdp: pc.localDescription.sdp
        });
        const html =
            '<div class="space-y-4">' +
            '<p class="text-sm text-slate-300 leading-relaxed">Copy this answer code and send it back to the source device. Paste it there and choose <strong>Connect and send latest data</strong>. Keep this page open while the data transfers.</p>' +
            '<label class="block text-xs text-slate-400 font-bold mb-2">Answer code</label>' +
            '<textarea id="device-transfer-answer-code-out" rows="6" readonly class="w-full p-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono">' + transferEscape(answerCode) + '</textarea>' +
            '<button type="button" onclick="window.copyPrepProTransferCode(\'device-transfer-answer-code-out\')" class="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold">Copy answer code</button>' +
            '<p id="device-transfer-status" role="status" class="text-xs text-slate-400">Waiting for the source device to connect…</p>' +
            '</div>';
        window.app.showModal("Answer code ready", html);
    } catch (error) {
        console.error("Could not prepare device transfer answer:", error);
        showToast("Could not prepare the transfer: " + error.message, "error");
    }
};

async function handleDeviceTransferMessage(event, session) {
    if (session !== deviceTransfer) return;
    let message;
    try {
        message = JSON.parse(String(event.data || ""));
    } catch {
        showToast("Received an invalid device-transfer message.", "error");
        return;
    }

    if (session.role === "send") {
        if (message.type === "accepted") {
            updateTransferStatus("The receiving device saved the transferred data.");
            showToast("Device transfer completed.", "success");
            setTimeout(() => {
                if (deviceTransfer === session) closeDeviceTransfer();
            }, 1200);
        } else if (message.type === "rejected") {
            updateTransferStatus("The receiving device cancelled the transfer.");
            showToast("The receiving device cancelled the transfer.", "info");
        }
        return;
    }

    if (session.role !== "receive") return;
    if (message.type === "start") {
        const validParts = Number.isInteger(message.totalParts) &&
            message.totalParts > 0 &&
            message.totalParts <= Math.ceil(TRANSFER_MAX_CHARS / TRANSFER_CHUNK_CHARS);
        const validLength = Number.isInteger(message.totalChars) &&
            message.totalChars > 0 && message.totalChars <= TRANSFER_MAX_CHARS;
        if (message.userId !== currentUser?.uid || message.nonce !== session.nonce ||
            !validParts || !validLength ||
            message.totalParts !== Math.ceil(message.totalChars / TRANSFER_CHUNK_CHARS)) {
            showToast("The incoming transfer metadata is invalid.", "error");
            return;
        }
        session.receiveState = {
            parts: new Array(message.totalParts),
            totalParts: message.totalParts,
            totalChars: message.totalChars,
            receivedParts: 0,
            receivedChars: 0
        };
        updateTransferStatus("Receiving data… 0 / " + message.totalChars.toLocaleString() + " characters");
        return;
    }

    if (message.type === "chunk") {
        const state = session.receiveState;
        if (!state || !Number.isInteger(message.index) || message.index < 0 ||
            message.index >= state.totalParts || typeof message.content !== "string" ||
            message.content.length > TRANSFER_CHUNK_CHARS) {
            showToast("Received an invalid data chunk.", "error");
            return;
        }
        if (state.parts[message.index] === undefined) {
            state.parts[message.index] = message.content;
            state.receivedParts += 1;
            state.receivedChars += message.content.length;
        }
        updateTransferStatus("Receiving data… " + state.receivedChars.toLocaleString() +
            " / " + state.totalChars.toLocaleString() + " characters");
        return;
    }

    if (message.type === "finish") {
        const state = session.receiveState;
        if (!state || message.userId !== currentUser?.uid || message.nonce !== session.nonce ||
            state.receivedParts !== state.totalParts || state.receivedChars !== state.totalChars ||
            state.parts.some(part => typeof part !== "string")) {
            showToast("The transferred data is incomplete. Please retry.", "error");
            return;
        }
        try {
            const envelope = JSON.parse(state.parts.join(""));
            if (envelope.app !== TRANSFER_LABEL || envelope.formatVersion !== 1 ||
                envelope.userId !== currentUser.uid || !isValidData(envelope.data)) {
                throw new Error("The data does not match the signed-in PrepPro account.");
            }
            session.pendingPayload = envelope;
            const subjectCount = envelope.data.subjects.length;
            let topicCount = 0;
            let subtopicCount = 0;
            let pageCount = 0;
            envelope.data.subjects.forEach(subject => {
                (subject.topics || []).forEach(topic => {
                    topicCount += 1;
                    (topic.subtopics || []).forEach(subtopic => {
                        subtopicCount += 1;
                        pageCount += Array.isArray(subtopic.notes) ? subtopic.notes.length : 0;
                    });
                });
            });
            const dateLabel = envelope.exportedAt ? new Date(envelope.exportedAt).toLocaleString() : "Unknown";
            const html =
                '<div class="space-y-4">' +
                '<p class="text-sm text-slate-300">Received a data snapshot from your other device. Review it, then choose whether to replace this device’s local data.</p>' +
                '<div class="grid grid-cols-2 gap-3 text-sm">' +
                '<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><span class="block text-xs text-slate-500">Subjects</span><strong class="text-white text-xl">' + subjectCount + '</strong></div>' +
                '<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><span class="block text-xs text-slate-500">Topics</span><strong class="text-white text-xl">' + topicCount + '</strong></div>' +
                '<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><span class="block text-xs text-slate-500">Subtopics</span><strong class="text-white text-xl">' + subtopicCount + '</strong></div>' +
                '<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><span class="block text-xs text-slate-500">Notes pages</span><strong class="text-white text-xl">' + pageCount + '</strong></div>' +
                '</div><p class="text-xs text-slate-500">Snapshot timestamp: ' + transferEscape(dateLabel) + '</p>' +
                '<p class="text-xs text-amber-300">Replacing data cannot be undone on this device. The source device is not changed.</p>' +
                '<div class="grid grid-cols-2 gap-2"><button type="button" onclick="window.rejectPrepProDeviceTransfer()" class="px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 font-bold">Cancel</button>' +
                '<button type="button" onclick="window.acceptPrepProDeviceTransfer()" class="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black">Replace local data</button></div>' +
                '</div>';
            window.app.showModal("Confirm device transfer", html);
        } catch (error) {
            console.error("Could not parse transferred PrepPro data:", error);
            showToast("Transfer could not be validated: " + error.message, "error");
        }
    }
}

window.acceptPrepProDeviceTransfer = async function () {
    const session = deviceTransfer;
    const envelope = session?.pendingPayload;
    if (!currentUser || !session || session.role !== "receive" || !envelope) {
        return showToast("There is no completed transfer to accept.", "error");
    }
    try {
        const normalized = window.app?.normalizeData ? window.app.normalizeData(envelope.data) : envelope.data;
        await window.saveUserData(normalized);
        data = normalized;
        try { await sendTransferJson(session.channel, { type: "accepted", userId: currentUser.uid, nonce: session.nonce }); } catch {}
        window.app?.closeModal?.();
        window.app?.init?.();
        showToast("Latest data received and saved on this device.", "success");
        setTimeout(() => {
            if (deviceTransfer === session) closeDeviceTransfer();
        }, 1200);
    } catch (error) {
        console.error("Could not save received data:", error);
        showToast("Could not save the received data: " + error.message, "error");
    }
};

window.rejectPrepProDeviceTransfer = async function () {
    const session = deviceTransfer;
    if (session?.channel?.readyState === "open") {
        try { await sendTransferJson(session.channel, { type: "rejected", userId: currentUser?.uid, nonce: session.nonce }); } catch {}
    }
    window.app?.closeModal?.();
    closeDeviceTransfer();
    showToast("Device transfer cancelled.", "info");
};

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
    if (!currentUser) return;
    setSaveStatus("Online · syncing PrepPro…");
    if (queuedCloudWrite && !cloudWriteInProgress) {
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        cloudSyncTimer = setTimeout(() => {
            cloudSyncTimer = null;
            flushCloudSync();
        }, 150);
    }
    tryApplyPendingCloudRemote();
});
window.addEventListener("offline", () => {
    if (currentUser) setSaveStatus("Offline · saved locally; cloud sync will resume when online");
});

onAuthStateChanged(auth, async (user) => {
    const requestId = ++authRequestId;
    if (cloudUnsubscribe) cloudUnsubscribe();
    cloudUnsubscribe = null;
    pendingCloudRemote = null;
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    if (deviceTransfer && (!user || (currentUser && currentUser.uid !== user.uid))) closeDeviceTransfer();
    if (!user) {
        currentUser = null;
        queuedCloudWrite = null;
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
        startCloudSync(user.uid);
        if (loadNotice) showToast(loadNotice, "info");
        setSaveStatus(navigator.onLine ? "Connected · checking cloud sync…" : "Offline · saved locally");
        await requestPersistentStorage();
    } catch (error) {
        console.error("Could not load PrepPro data:", error);
        if (requestId !== authRequestId || !currentUser || currentUser.uid !== user.uid) return;
        showLogin();
        setStatus(error.message || "Could not open your local data. Check storage and retry.");
    }
});