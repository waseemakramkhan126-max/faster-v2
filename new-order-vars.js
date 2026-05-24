// ==========================================
// 1. SUPABASE INITIALIZATION & VARIABLES
// ==========================================

const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Data store karne wale variables
let draftData = { texts: [], images: [], voices: [], videos: [], docs: [] };
let deliveryCharges = 150; 
let selectedItems = []; 
let userPhone = localStorage.getItem('faster_phone');
let fullSavedAddress = ""; 

// Camera & Video Variables
let stream = null;
let currentFacingMode = "environment";
let cameraMode = "photo";
let isRecording = false;
let camMediaRecorder;
let videoChunks = [];
let camTimerInterval;

// Voice Variables
let audioRecorder;
let audioChunks = [];
let voiceTimerInterval;
let voiceSeconds = 0;

// ==========================================
// NOTIFICATIONS & DEEP LINKING
// ==========================================
const sound = document.getElementById('notifSound');

function ring() { 
    if(!sound) return;
    sound.currentTime = 0; 
    let playPromise = sound.play();
    if (playPromise !== undefined) { 
        playPromise.catch(error => { console.warn("Auto-play blocked:", error); }); 
    }
    if (navigator.vibrate) { navigator.vibrate([200, 100, 200]); }
}

function gonative_onesignal_notification_opened(jsonData) {
    try {
        if(jsonData && jsonData.additionalData) {
            if (jsonData.additionalData.type === 'chat' && jsonData.additionalData.order_id) { 
                window.location.href = 'chat.html?order_id=' + jsonData.additionalData.order_id; 
            } else if (jsonData.additionalData.target_url) { 
                window.location.href = jsonData.additionalData.target_url; 
            } else { 
                window.location.href = 'active-orders.html'; 
            }
        } else { 
            window.location.href = 'active-orders.html'; 
        }
    } catch(e) { console.error("Deep link failed:", e); }
}

function setupRealtime() {
    if(!userPhone) return;
    _supabase.removeAllChannels(); 
    _supabase.channel('new-order-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_chats' }, (payload) => { 
            if(payload.new && payload.new.sender_phone !== userPhone) { ring(); }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => { 
            if(payload.new && payload.new.customer_phone === userPhone) { ring(); }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => { 
            if(payload.new && payload.new.receiver_id === userPhone) { ring(); }
        })
        .subscribe();
}
