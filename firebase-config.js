// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 👇 REEMPLAZÁ con tu config pegada desde Firebase Console
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

// Offline cache (si falla por multi-tabs, lo ignoramos sin romper)
enableIndexedDbPersistence(db).catch(()=>{});

// Login anónimo inmediato
signInAnonymously(auth);

// Helper para saber cuándo hay usuario
export function onReadyAuth(cb){
  onAuthStateChanged(auth, (user) => { if (user) cb(user); });
}

