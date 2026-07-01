// Import Firebase SDK compat scripts from the CDN
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyDGalWLupQvsDa2kvR0GTncPAmwU7s5zlg",
  authDomain: "lyricastudios-2026.firebaseapp.com",
  projectId: "lyricastudios-2026",
  storageBucket: "lyricastudios-2026.firebasestorage.app",
  messagingSenderId: "400849594802",
  appId: "1:400849594802:web:89bad36c93838bd9fe9cab",
  measurementId: "G-N7K1G5TBMB"
});

// Retrieve Firebase Cloud Messaging instance
const messaging = firebase.messaging();

// Customize background notification handling
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Explicitly trigger a notification display for mobile browsers (e.g. iOS Safari PWA)
  if (payload.notification) {
    const notificationTitle = payload.notification.title || "New Notification";
    const notificationOptions = {
      body: payload.notification.body || "",
      icon: "/Logo/Lyrica Favicon.svg",
      badge: "/Logo/Lyrica Favicon.svg",
      data: payload.data
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

// Standard Service Worker lifecycle event listeners to satisfy PWA criteria
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing Service Worker...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating Service Worker...');
  return self.clients.claim();
});

// Basic fetch listener to meet installable PWA requirements
self.addEventListener('fetch', (event) => {
  // Let the browser handle standard requests; we don't cache pages for this admin app
});
