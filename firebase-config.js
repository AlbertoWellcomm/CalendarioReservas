// firebase-config.js — Firebase init (loaded AFTER Firebase CDN scripts)
const firebaseConfig = {
  apiKey: "AIzaSyCpVk1T-PbZXyMm2tikWbFY790Foiy1y5c",
  authDomain: "calres.firebaseapp.com",
  projectId: "calres",
  storageBucket: "calres.firebasestorage.app",
  messagingSenderId: "694044576348",
  appId: "1:694044576348:web:dfd2914a77279bb947b499",
  measurementId: "G-CDGD87WXXW"
};

if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Global Firestore instance used by app.js
const db = firebase.firestore();
