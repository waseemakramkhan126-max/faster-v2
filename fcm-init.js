// =========================================================
// fcm-init.js - Push Notification Setup (Firebase Cloud Messaging)
//
// ⚠️ ZAROORI: Neeche wali firebaseConfig aur VAPID_KEY ko apni Firebase
// project ki asal values se replace karna hoga - neeche instructions hain.
// =========================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const VAPID_KEY = "YOUR_VAPID_KEY"; // Firebase Console > Project Settings > Cloud Messaging > Web Push certificates

async function initPushNotifications() {
  // Sirf tab chalao jab customer login ho chuka ho (myId available ho)
  const customerId = localStorage.getItem('faster_customer_id');
  if (!customerId) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Yeh browser push notifications support nahi karta.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Customer ne notification permission nahi di.');
      return;
    }

    // Firebase SDK load karo (CDN se, dynamically)
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');
    }

    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    const registration = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

    if (token) {
      await saveFcmTokenToSupabase(customerId, token);
    }

    // App KHULI hui ho (foreground) tab bhi message aaye to yahan handle hota hai
    messaging.onMessage((payload) => {
      const sound = document.getElementById('notifSound');
      if (sound) { sound.currentTime = 0; sound.play().catch(() => {}); }
    });
  } catch (err) {
    console.error('Push notification setup fail:', err);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function saveFcmTokenToSupabase(customerId, token) {
  try {
    await _supabase.from('customers').update({ fcm_token: token }).eq('customer_id', customerId);
  } catch (err) {
    console.error('FCM token save nahi hua:', err);
  }
}

// Service worker register karo (agar pehle se nahi hua)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => initPushNotifications())
      .catch(err => console.error('Service worker register nahi hua:', err));
  });
}
