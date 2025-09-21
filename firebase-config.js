// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔁 Pegá tu config:
const firebaseConfig = {
  apiKey: "AIzaSyAGo5Ws1IiIUuO7rENTW0ysKTQw2BSBbGU",
  authDomain: "seguimientoproductivo.firebaseapp.com",
  projectId: "seguimientoproductivo",
  storageBucket: "seguimientoproductivo.firebasestorage.app",
  messagingSenderId: "23972978729",
  appId: "1:23972978729:web:b999ef05f66a79a0acfc38"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Login anónimo
signInAnonymously(auth);

// Callback cuando hay usuario
export function onReadyAuth(cb){
  onAuthStateChanged(auth, (user) => { if (user) cb(user); });
}
