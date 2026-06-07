import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "omnibase-grid-99124",
  appId: "1:907119484012:web:f427bab075a34a662d0c49",
  storageBucket: "omnibase-grid-99124.firebasestorage.app",
  apiKey: "AIzaSyBPG4iV-LwF6XcllpqnVfcETVW1nME_FYU",
  authDomain: "omnibase-grid-99124.firebaseapp.com",
  messagingSenderId: "907119484012"
};

// Initialize Firebase client-side safely in Next.js
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
