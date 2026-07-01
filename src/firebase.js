// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getMessaging } from "firebase/messaging";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDGalWLupQvsDa2kvR0GTncPAmwU7s5zlg",
  authDomain: "lyricastudios-2026.firebaseapp.com",
  projectId: "lyricastudios-2026",
  storageBucket: "lyricastudios-2026.firebasestorage.app",
  messagingSenderId: "400849594802",
  appId: "1:400849594802:web:89bad36c93838bd9fe9cab",
  measurementId: "G-N7K1G5TBMB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (err) {
  console.warn("Firebase Analytics failed to initialize:", err);
}
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const messaging = getMessaging(app);

export { app, analytics, db, auth, functions, messaging };
