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
    if (ADMIN_EMAILS.includes(user.email)) return 'admin';
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) return userDoc.data().role || 'employee';
    } catch (e) {
        console.error('Error fetching role:', e);
    }
    return 'employee';
}

// Global Config (Firestore Settings)
async function getGlobalConfig() {
    try {
        const doc = await db.collection('settings').doc('global_config').get();
        if (!doc.exists) {
            // Initialize if missing
            const init = { tax_rate: 1.75, counters: {} };
            await db.collection('settings').doc('global_config').set(init);
            return init;
        }
        return doc.data();
    } catch (e) {
        console.error('Error fetching config:', e);
        return { tax_rate: 1.75, counters: {} };
    }
}

async function updateGlobalConfig(data) {
    try {
        await db.collection('settings').doc('global_config').update(data);
    } catch (e) {
        console.error('Error updating config:', e);
    }
}

// Global Firestore instance
const db = firebase.firestore();
const auth = firebase.auth();
