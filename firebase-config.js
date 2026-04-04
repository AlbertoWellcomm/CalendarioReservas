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

// Admin Emails (Super Admins)
const ADMIN_EMAILS = ['mmiravitllas@gmail.com'];

// Helper to determine the user's role
async function getUserRole(user) {
    if (!user) return 'guest';
    // 1. Check if email is in the hardcoded admin list
    if (ADMIN_EMAILS.includes(user.email)) return 'admin';

    // 2. Fallback: check Firestore for a specific user role (if implemented later)
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            return userDoc.data().role || 'employee';
        }
    } catch (e) {
        console.error('Error fetching role:', e);
    }
    
    // Default to employee for any other authenticated user
    return 'employee';
}

// Global Firestore instance used by app.js
const db = firebase.firestore();
const auth = firebase.auth();
