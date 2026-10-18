// PrepPro authentication, local-first storage, and automatic cross-device sync.
// IndexedDB keeps the app usable offline; Firestore syncs the latest snapshot between devices.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
    connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
    collection, getDocs, deleteDoc, query, orderBy, startAfter, limit
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
let cloudBaselineKnown = false;
let receivedInitialCloudSnapshot = false;
let cloudSnapshotReadSerial = 0;
let remoteApplyInProgress = false;

const CLOUD_UPDATED_AT_FIELD = "_prepProCloudUpdatedAt";
const CLOUD_SCHEMA_FIELD = "_prepProCloudSyncSchema";
const CLOUD_SNAPSHOT_ID_FIELD = "_prepProCloudSnapshotId";
const CLOUD_CHUNK_COUNT_FIELD = "_prepProCloudChunkCount";
const CLOUD_TOTAL_BYTES_FIELD = "_prepProCloudTotalBytes";
const CLOUD_SHA256_FIELD = "_prepProCloudSha256";
const CLOUD_SNAPSHOT_HISTORY_FIELD = "_prepProCloudSnapshotHistory";
const CLOUD_SYNC_DEBOUNCE_MS = 750;
const CLOUD_CHUNK_RAW_BYTES = 300 * 1024;
const CLOUD_TRANSFER_WINDOW_SIZE = 4;
const CLOUD_MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const CLOUD_CHUNK_COLLECTION = "chunks";
const CLOUD_SNAPSHOT_COLLECTION = "syncSnapshots";
const DEFAULT_DATA = { subjects: [], xp: 0 };
const LOCAL_DB_NAME = "preppro-local-data";
const LOCAL_DB_VERSION = 1;
const LOCAL_STORE_NAME = "users";
const LEGACY_MIGRATION_MARKER = "_prepProLocalOnlyMigrationAt";
const OLD_LOCAL_KEY = (uid) => `prepProData_v12_${uid}`;
const OLD_PENDING_KEY = (uid) => `prepProPending_v1_${uid}`;
const copyDefaultData = () => structuredClone(DEFAULT_DATA);
const legacyUserDocument = (uid) => doc(legacyDb, "users", uid);
const cloudManifestDocument = (uid) => doc(legacyDb, "users", uid, "syncState", "current");

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
    delete clean[CLOUD_SNAPSHOT_ID_FIELD];
    delete clean[CLOUD_CHUNK_COUNT_FIELD];
    delete clean[CLOUD_TOTAL_BYTES_FIELD];
    delete clean[CLOUD_SHA256_FIELD];
    delete clean[CLOUD_SNAPSHOT_HISTORY_FIELD];
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


function isChunkedCloudManifest(value) {
    return Number(value?.[CLOUD_SCHEMA_FIELD]) >= 2 &&
        typeof value?.[CLOUD_SNAPSHOT_ID_FIELD] === "string" &&
        Number.isInteger(value?.[CLOUD_CHUNK_COUNT_FIELD]) &&
        Number.isInteger(value?.[CLOUD_TOTAL_BYTES_FIELD]) &&
        typeof value?.[CLOUD_SHA256_FIELD] === "string";
}

function bytesToBase64(bytes) {
    let binary = "";
    const blockSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += blockSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + blockSize, bytes.length)));
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

async function sha256Hex(bytes) {
    if (!crypto?.subtle?.digest) {
        throw new Error("This browser cannot verify cloud snapshots. Open PrepPro in a current browser over HTTPS.");
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function cloudSnapshotParent(uid, snapshotId) {
    return doc(legacyDb, "users", uid, CLOUD_SNAPSHOT_COLLECTION, snapshotId);
}

function cloudSnapshotChunk(uid, snapshotId, index) {
    const chunkId = String(index).padStart(8, "0");
    return doc(legacyDb, "users", uid, CLOUD_SNAPSHOT_COLLECTION, snapshotId, CLOUD_CHUNK_COLLECTION, chunkId);
}

async function readCloudUserData(uid, cloudDocument) {
    if (!cloudDocument || typeof cloudDocument !== "object") return null;
    const cloudSchemaVersion = Number(cloudDocument[CLOUD_SCHEMA_FIELD] || 0);
    if (cloudSchemaVersion >= 2 && !isChunkedCloudManifest(cloudDocument)) {
        throw new Error("The cloud snapshot manifest is malformed. The local copy was kept.");
    }
    if (!isChunkedCloudManifest(cloudDocument)) {
        return extractCloudUserData(cloudDocument);
    }

    const snapshotId = cloudDocument[CLOUD_SNAPSHOT_ID_FIELD];
    const chunkCount = cloudDocument[CLOUD_CHUNK_COUNT_FIELD];
    const totalBytes = cloudDocument[CLOUD_TOTAL_BYTES_FIELD];
    const expectedHash = cloudDocument[CLOUD_SHA256_FIELD];

    if (!/^[A-Za-z0-9_-]{8,100}$/.test(snapshotId) ||
        chunkCount < 1 ||
        chunkCount > Math.ceil(CLOUD_MAX_SNAPSHOT_BYTES / CLOUD_CHUNK_RAW_BYTES) ||
        totalBytes < 1 || totalBytes > CLOUD_MAX_SNAPSHOT_BYTES) {
        throw new Error("The cloud snapshot manifest is invalid or exceeds the supported transfer size.");
    }

    const chunkBytes = new Array(chunkCount);
    for (let windowStart = 0; windowStart < chunkCount; windowStart += CLOUD_TRANSFER_WINDOW_SIZE) {
        const windowEnd = Math.min(windowStart + CLOUD_TRANSFER_WINDOW_SIZE, chunkCount);
        const windowResults = await Promise.all(
            Array.from({ length: windowEnd - windowStart }, (_, offset) => windowStart + offset)
                .map(async index => {
                    const snapshot = await getDoc(cloudSnapshotChunk(uid, snapshotId, index));
                    if (!snapshot.exists()) {
                        throw new Error("A cloud data chunk is missing. The complete snapshot was not applied; retry sync.");
                    }
                    const record = snapshot.data();
                    if (record.snapshotId !== snapshotId || record.index !== index ||
                        typeof record.payload !== "string" || record.payload.length > 420 * 1024) {
                        throw new Error("A cloud data chunk failed validation.");
                    }
                    const bytes = base64ToBytes(record.payload);
                    if (bytes.length > CLOUD_CHUNK_RAW_BYTES ||
                        (index < chunkCount - 1 && bytes.length !== CLOUD_CHUNK_RAW_BYTES)) {
                        throw new Error("A cloud data chunk has an invalid size.");
                    }
                    return { index, bytes };
                })
        );
        windowResults.forEach(result => { chunkBytes[result.index] = result.bytes; });
        setSaveStatus("Downloading cloud snapshot · received " + windowEnd + " of " + chunkCount + " chunks");
    }

    const assembled = new Uint8Array(totalBytes);
    let offset = 0;
    for (const bytes of chunkBytes) {
        if (!bytes || offset + bytes.length > totalBytes) {
            throw new Error("The cloud snapshot length does not match its manifest.");
        }
        assembled.set(bytes, offset);
        offset += bytes.length;
    }
    if (offset !== totalBytes) {
        throw new Error("The cloud snapshot is incomplete. The local copy was kept.");
    }
    const actualHash = await sha256Hex(assembled);
    if (actualHash !== expectedHash) {
        throw new Error("The cloud snapshot failed its integrity check. The local copy was kept.");
    }

    let parsed;
    try {
        parsed = JSON.parse(new TextDecoder().decode(assembled));
    } catch {
        throw new Error("The cloud snapshot is not valid JSON. The local copy was kept.");
    }
    const clean = extractCloudUserData(parsed);
    if (!isValidData(clean)) throw new Error("The cloud snapshot does not contain valid PrepPro data.");
    return clean;
}

async function cleanupCloudSnapshot(uid, snapshotId) {
    if (!snapshotId || !currentUser || currentUser.uid !== uid) return;
    try {
        const chunksRef = collection(legacyDb, "users", uid, CLOUD_SNAPSHOT_COLLECTION, snapshotId, CLOUD_CHUNK_COLLECTION);
        let cursor = null;
        while (true) {
            const pageQuery = cursor
                ? query(chunksRef, orderBy("index"), startAfter(cursor), limit(40))
                : query(chunksRef, orderBy("index"), limit(40));
            const page = await getDocs(pageQuery);
            if (page.empty) break;
            await Promise.all(page.docs.map(chunk => deleteDoc(chunk.ref)));
            cursor = page.docs[page.docs.length - 1];
            if (page.docs.length < 40) break;
        }
        await deleteDoc(cloudSnapshotParent(uid, snapshotId));
    } catch (error) {
        console.warn("Could not remove an old PrepPro cloud snapshot:", snapshotId, error);
    }
}

async function writeCloudUserSnapshot(uid, userData) {
    const serialized = JSON.stringify(extractCloudUserData(userData));
    const bytes = new TextEncoder().encode(serialized);
    if (bytes.byteLength < 1 || bytes.byteLength > CLOUD_MAX_SNAPSHOT_BYTES) {
        throw new Error("This PrepPro snapshot is larger than the 100 MiB cloud-sync limit. Your local copy is safe; use Export data for a backup.");
    }

    const snapshotId = "s_" + (crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const chunkCount = Math.ceil(bytes.byteLength / CLOUD_CHUNK_RAW_BYTES);
    const sha256 = await sha256Hex(bytes);
    const rootRef = cloudManifestDocument(uid);
    const parentRef = cloudSnapshotParent(uid, snapshotId);

    let previousRoot = null;
    try {
        const previousSnapshot = await getDoc(rootRef);
        if (previousSnapshot.exists()) previousRoot = previousSnapshot.data();
    } catch (error) {
        throw new Error("Could not read the current cloud manifest before syncing: " + (error.message || "network error"));
    }

    const previousIds = Array.isArray(previousRoot?.[CLOUD_SNAPSHOT_HISTORY_FIELD])
        ? previousRoot[CLOUD_SNAPSHOT_HISTORY_FIELD].filter(id => typeof id === "string")
        : [];
    const previousCurrentId = isChunkedCloudManifest(previousRoot)
        ? previousRoot[CLOUD_SNAPSHOT_ID_FIELD]
        : null;
    const oldHistory = [...new Set([previousCurrentId, ...previousIds].filter(id => id && id !== snapshotId))];
    const nextHistory = [snapshotId, ...oldHistory].slice(0, 3);
    const obsoleteSnapshots = oldHistory.filter(id => !nextHistory.includes(id));

    await setDoc(parentRef, {
        snapshotId, chunkCount, totalBytes: bytes.byteLength, sha256,
        status: "uploading", createdAt: serverTimestamp()
    });

    try {
        for (let windowStart = 0; windowStart < chunkCount; windowStart += CLOUD_TRANSFER_WINDOW_SIZE) {
            const windowEnd = Math.min(windowStart + CLOUD_TRANSFER_WINDOW_SIZE, chunkCount);
            const windowWrites = await Promise.allSettled(
                Array.from({ length: windowEnd - windowStart }, (_, offset) => windowStart + offset)
                    .map(async index => {
                        const start = index * CLOUD_CHUNK_RAW_BYTES;
                        const chunk = bytes.subarray(start, Math.min(start + CLOUD_CHUNK_RAW_BYTES, bytes.byteLength));
                        await setDoc(cloudSnapshotChunk(uid, snapshotId, index), {
                            snapshotId,
                            index,
                            payload: bytesToBase64(chunk)
                        });
                    })
            );
            const failedWrite = windowWrites.find(result => result.status === "rejected");
            if (failedWrite) throw failedWrite.reason;
            setSaveStatus("Uploading cloud snapshot · sent " + windowEnd + " of " + chunkCount + " chunks");
            if (currentUser?.uid !== uid) throw new Error("Account changed during cloud sync.");
        }

        await setDoc(parentRef, {
            snapshotId, chunkCount, totalBytes: bytes.byteLength, sha256,
            status: "ready", createdAt: serverTimestamp()
        });

        // Switch the active snapshot only after every chunk is uploaded and marked ready.
        await setDoc(rootRef, {
            [CLOUD_SCHEMA_FIELD]: 2,
            [CLOUD_SNAPSHOT_ID_FIELD]: snapshotId,
            [CLOUD_CHUNK_COUNT_FIELD]: chunkCount,
            [CLOUD_TOTAL_BYTES_FIELD]: bytes.byteLength,
            [CLOUD_SHA256_FIELD]: sha256,
            [CLOUD_SNAPSHOT_HISTORY_FIELD]: nextHistory,
            [CLOUD_UPDATED_AT_FIELD]: serverTimestamp(),
            [LEGACY_MIGRATION_MARKER]: previousRoot?.[LEGACY_MIGRATION_MARKER] || new Date().toISOString()
        });

        // Retain the latest three generations so readers already downloading an older
        // snapshot are unlikely to lose their chunks during a newer upload.
        for (const obsoleteId of obsoleteSnapshots) {
            cleanupCloudSnapshot(uid, obsoleteId);
        }
    } catch (error) {
        cleanupCloudSnapshot(uid, snapshotId);
        throw error;
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
        await writeCloudUserSnapshot(item.uid, item.data);
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

    if (!pending.legacyRemote && !sameUserData(localData, pending.data) &&
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
    receivedInitialCloudSnapshot = false;
    pendingCloudRemote = null;

    cloudUnsubscribe = onSnapshot(cloudManifestDocument(uid), { includeMetadataChanges: true }, async snapshot => {
        if (!currentUser || currentUser.uid !== uid || snapshot.metadata.fromCache ||
            snapshot.metadata.hasPendingWrites) return;
        const readSerial = ++cloudSnapshotReadSerial;
        const isInitialAuthoritativeSnapshot = !receivedInitialCloudSnapshot;
        const hadCloudBaseline = cloudBaselineKnown;
        const previousCloudVersion = lastAppliedCloudAt;
        receivedInitialCloudSnapshot = true;

        if (!snapshot.exists()) {
            cloudBaselineKnown = true;
            lastAppliedCloudAt = 0;
            const localRecord = await readLocalUserData(uid).catch(() => null);
            if (localRecord && currentUser?.uid === uid) {
                scheduleCloudSync(uid, localRecord.data, 100);
            }
            return;
        }

        const rawCloudData = snapshot.data();
        const remoteUpdatedAt = cloudUpdatedAtMillis(rawCloudData);
        let remoteData;
        try {
            remoteData = await readCloudUserData(uid, rawCloudData);
        } catch (error) {
            console.error("Could not download the complete cloud snapshot:", error);
            setSaveStatus("Saved locally · cloud snapshot download failed; retrying on next update");
            return;
        }
        if (readSerial !== cloudSnapshotReadSerial || !currentUser || currentUser.uid !== uid) return;
        if (!isValidData(remoteData)) {
            cloudBaselineKnown = true;
            lastAppliedCloudAt = remoteUpdatedAt;
            setSaveStatus("Saved locally · cloud data format needs attention");
            return;
        }
        if (remoteUpdatedAt && remoteUpdatedAt < lastAppliedCloudAt) return;

        const localData = window.app?.normalizeData
            ? window.app.normalizeData(structuredClone(data))
            : structuredClone(data);

        if (sameUserData(localData, remoteData)) {
            cloudBaselineKnown = true;
            lastAppliedCloudAt = Math.max(lastAppliedCloudAt, remoteUpdatedAt);
            if (!remoteUpdatedAt) scheduleCloudSync(uid, localData, 100);
            else if (!queuedCloudWrite && !cloudWriteInProgress) setSaveStatus("Saved & synced across devices");
            return;
        }

        // Local edits waiting to upload take precedence over an incoming snapshot.
        if (queuedCloudWrite || cloudSyncTimer || cloudWriteInProgress) return;

        const knownVersion = hadCloudBaseline ? previousCloudVersion : (latestLocalSaveAt || 0);
        const remoteIsNewer = (hasUserContent(remoteData) && !hasUserContent(localData)) ||
            (remoteUpdatedAt > knownVersion) ||
            (!remoteUpdatedAt && !isInitialAuthoritativeSnapshot);
        cloudBaselineKnown = true;
        if (remoteIsNewer) {
            pendingCloudRemote = {
                uid, data: remoteData, updatedAt: remoteUpdatedAt,
                legacyRemote: !remoteUpdatedAt && !isInitialAuthoritativeSnapshot
            };
            if (canApplyRemoteDataNow()) {
                await tryApplyPendingCloudRemote();
            } else {
                setSaveStatus("Update available from another device · return to dashboard to apply");
            }
        } else {
            lastAppliedCloudAt = Math.max(lastAppliedCloudAt, remoteUpdatedAt);
            scheduleCloudSync(uid, localData, 150);
        }
    }, error => {
        console.error("PrepPro cloud listener failed:", error);
        if (currentUser?.uid === uid) setSaveStatus("Saved locally · cloud sync unavailable");
    });
}

window.addEventListener("focus", () => tryApplyPendingCloudRemote());
document.addEventListener("click", () => {
    if (pendingCloudRemote) setTimeout(() => tryApplyPendingCloudRemote(), 350);
});
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
        showToast("Backup exported. Keep this JSON somewhere safe for recovery.", "success");
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
        showToast("Backup imported locally; cloud sync has been queued.", "success");
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
        // New sync manifests live separately from the legacy root user document, so
        // a preview/new client does not overwrite data used by the currently live app.
        const manifestSnapshot = await getDoc(cloudManifestDocument(uid));
        cloudSnapshot = manifestSnapshot.exists()
            ? manifestSnapshot
            : await getDoc(legacyUserDocument(uid));
    } catch (error) {
        cloudReadFailed = true;
        console.warn("Cloud data could not be checked; the local copy will remain usable:", error);
    }

    const cloudIsCached = !!cloudSnapshot?.metadata?.fromCache;
    const cloudExists = !!cloudSnapshot?.exists?.();
    const rawCloudData = cloudExists ? cloudSnapshot.data() : null;
    const remoteUpdatedAt = cloudUpdatedAtMillis(rawCloudData);
    let remoteData = null;
    if (rawCloudData && !cloudReadFailed && !cloudIsCached) {
        try {
            remoteData = await readCloudUserData(uid, rawCloudData);
        } catch (error) {
            cloudReadFailed = true;
            console.error("Could not download the complete cloud snapshot:", error);
            loadNotice = "The cloud snapshot could not be downloaded completely. Your local data will be kept; sync needs attention.";
        }
    }
    if (remoteData && !isValidData(remoteData)) remoteData = null;
    if (remoteData && window.app?.normalizeData) {
        remoteData = window.app.normalizeData(structuredClone(remoteData));
    }
    cloudBaselineKnown = !cloudReadFailed && !cloudIsCached;
    if (cloudBaselineKnown) lastAppliedCloudAt = remoteUpdatedAt;

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

    if (cloudReadFailed && !localData) {
        throw new Error("PrepPro could not check its saved cloud data. No blank workspace was created. Check the connection and Firestore access, then reload.");
    }
    if (cloudReadFailed && cloudExists && !localData) {
        throw new Error("The saved cloud snapshot could not be downloaded completely. No blank workspace was created. Check the connection and Firestore access, then reload.");
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
    cloudSnapshotReadSerial += 1;
    cloudBaselineKnown = false;
    lastAppliedCloudAt = 0;
    if (cloudUnsubscribe) cloudUnsubscribe();
    cloudUnsubscribe = null;
    pendingCloudRemote = null;
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
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