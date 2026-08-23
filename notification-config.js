// =========================================================
// notification-config.js
// SIRF EK JAGAH - poori app ki ringtone yahan se control hoti hai.
// Ringtone badalni ho to SIRF neeche wali ek line badalo, kisi bhi
// .html file ko chhedne ki zaroorat nahi.
// =========================================================

const NOTIFICATION_SOUND_URL = "https://pub-46c1f50284b64647914d7901e1dd5fea.r2.dev/sound_garage-cat-meow-8-fx-306184.mp3";

// Jaise hi page load ho, is page ke <audio id="notifSound"> ka src
// automatically isi URL se set kar deta hai - HTML mein hardcoded
// rakhne ki zaroorat nahi.
document.addEventListener('DOMContentLoaded', () => {
    const sound = document.getElementById('notifSound');
    if (sound) sound.src = NOTIFICATION_SOUND_URL;
});
