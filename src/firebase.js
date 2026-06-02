// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAHCZ1aa8txmP1mjW0_Ic4HfJUI_N5Mo8c",
  authDomain: "kyotosushicatania.firebaseapp.com",
  databaseURL: "https://kyotosushicatania-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kyotosushicatania",
  storageBucket: "kyotosushicatania.firebasestorage.app",
  messagingSenderId: "817479494676",
  appId: "1:817479494676:web:e0885ee69fbf03e39a0b01",
  measurementId: "G-NQBRSK73T0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
