import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCLK-qHTuh1nwCwyVdBpeJF7-8HGLZDshw",
    authDomain: "prepyproo.firebaseapp.com",
    projectId: "prepyproo",
    storageBucket: "prepyproo.firebasestorage.app",
    messagingSenderId: "94747453911",
    appId: "1:94747453911:web:e2dbfd6b1fad2f126ec392",
    measurementId: "G-N0R12V9Y2K"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

let currentUser = null;

// Sync local data up to Firestore
window.syncToCloud = async (localData) => {
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), localData);
        } catch(e) {
            console.error("Firestore sync failed:", e);
        }
    }
};

window.loginWithGoogle = () => {
    const statusEl = document.getElementById('auth-status');
    if(statusEl) statusEl.textContent = "Opening sign-in window...";
    signInWithPopup(auth, provider).catch(error => {
        if(statusEl) statusEl.textContent = "";
        app.showToast("Sign in failed: " + error.message, "error");
    });
};

window.logoutUser = () => {
    signOut(auth).then(() => {
        localStorage.removeItem('prepProData_v12');
        data = JSON.parse(JSON.stringify(defaultData)); // Note: defaultData is declared in app.js
        app.showToast("Logged out securely.", "success");
    });
};

onAuthStateChanged(auth, async (user) => {
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const userArea = document.getElementById('user-auth-area');
    const statusEl = document.getElementById('auth-status');

    if (user) {
        currentUser = user;
        if(statusEl) statusEl.textContent = "Loading your data...";
        
        loginView.classList.add('hidden');
        appView.classList.remove('hidden');

        userArea.innerHTML = `
            <div class="flex items-center gap-3 px-2 w-full">
                <img src="${user.photoURL || 'https://api.dicebear.com/7.x/initials/svg?seed=' + user.displayName}" class="w-10 h-10 rounded-full border-2 border-blue-100 shadow-sm">
                <div class="flex flex-col flex-1 overflow-hidden">
                    <span class="text-sm font-bold text-slate-700 truncate">${user.displayName}</span>
                    <button onclick="logoutUser()" class="text-xs font-bold text-red-500 text-left hover:underline w-max">Log Out</button>
                </div>
            </div>
        `;

        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                data = docSnap.data(); // Note: data is declared in app.js
                localStorage.setItem('prepProData_v12', JSON.stringify(data));
            } else {
                data = JSON.parse(JSON.stringify(defaultData));
                await setDoc(doc(db, "users", user.uid), data);
                localStorage.setItem('prepProData_v12', JSON.stringify(data));
            }
        } catch(e) {
            console.error("Firestore read error:", e);
        }
        
        app.init();
    } else {
        currentUser = null;
        loginView.classList.remove('hidden');
        appView.classList.add('hidden');
        if(statusEl) statusEl.textContent = "";
    }
});