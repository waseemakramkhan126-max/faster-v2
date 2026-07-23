console.log("🚀 Chat Room Script Loaded Successfully!");
// =========================================================
// CHAT LOGIC - FULL UPGRADED VERSION
// =========================================================

// 1. Supabase Initialization
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// 2. User Info from LocalStorage
const myPhone = localStorage.getItem('faster_phone');
const myId = localStorage.getItem('faster_customer_id') || myPhone;
const myName = localStorage.getItem('faster_name') || "Me";

// 3. Get Conversation ID from URL
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get('conversation_id');

if (!conversationId) {
    alert("Invalid chat room.");
    history.back();
}

// =========================================================
// GLOBAL VARIABLES
// =========================================================
let otherUserId = null;
let otherUserName = "User";
let isTyping = false;
let typingTimeout = null;
let messageContainer = document.getElementById('messagesContainer');
let page = 0;
const LIMIT = 30;
let isLoadingMore = false;
let hasMoreMessages = true;
let audioRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceSeconds = 0;

// =========================================================
// DOM REFS
// =========================================================
const headerName = document.getElementById('headerName');
const headerStatus = document.getElementById('headerStatus');
const headerAvatar = document.getElementById('headerAvatar');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendMsgBtn');
const typingIndicator = document.getElementById('typingIndicator');
const loadMoreLoader = document.getElementById('loadMoreLoader');

// =========================================================
// AUDIO NOTIFICATION
// =========================================================
const sound = document.getElementById('notifSound');
function ring() {
    if(!sound) return;
    sound.currentTime = 0;
    sound.play().catch(e => console.warn("Auto-play blocked:", e));
}

// =========================================================
// 1. FETCH OTHER USER INFO
// =========================================================
async function fetchOtherUser() {
    const { data: participants, error } = await _supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', myId);

    if (error || !participants || participants.length === 0) {
        console.warn("⚠️ other user not found, but chat will still work.");
        headerName.textContent = "Unknown User";
        headerAvatar.textContent = "?";
        return;
    }

    otherUserId = participants[0].user_id;

    const { data: userData, error: uErr } = await _supabase
        .from('customers')
        .select('name, phone')
        .eq('customer_id', otherUserId)
        .maybeSingle();

    if (uErr || !userData) {
        otherUserName = "Unknown";
    } else {
        otherUserName = userData.name || "User";
        headerStatus.textContent = `+${userData.phone}`;
    }

    headerName.textContent = otherUserName;
    headerAvatar.textContent = otherUserName.charAt(0).toUpperCase();
}

// =========================================================
// 2. DATE FORMATTER
// =========================================================
function getDateLabel(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
    const d = new Date(dateStr);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

// =========================================================
// 3. RENDER MESSAGES (WITH DATE GROUPING)
// =========================================================
function renderMessages(messages, appendAtTop = false) {
    if (!messages || messages.length === 0) return;

    let lastDate = '';
    const fragment = document.createDocumentFragment();

    messages.forEach((msg, index) => {
        const msgDate = getDateLabel(msg.created_at);
        
        if (msgDate !== lastDate) {
            lastDate = msgDate;
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.innerHTML = `<span>${msgDate}</span>`;
            fragment.appendChild(div);
        }

        const isMe = msg.sender_id === myId || msg.sender_id === myPhone;
        const bubble = document.createElement('div');
        bubble.className = `bubble ${isMe ? 'bubble-sent' : 'bubble-received'} animate-pop`;

        let contentHTML = '';
        if (msg.type === 'text') {
            contentHTML = `<p class="whitespace-pre-wrap">${msg.content}</p>`;
        } else if (msg.type === 'image') {
            contentHTML = `
                <img src="${msg.file_url}" class="max-w-full max-h-64 rounded-lg object-contain cursor-pointer mt-1" onclick="openMediaViewer('${msg.file_url}', 'image')">
                ${msg.content ? `<p class="mt-1 text-sm whitespace-pre-wrap">${msg.content}</p>` : ''}
            `;
        } else if (msg.type === 'video') {
            contentHTML = `
                <video src="${msg.file_url}" controls class="max-w-full max-h-64 rounded-lg mt-1"></video>
            `;
        } else if (msg.type === 'voice') {
            contentHTML = `
                <div class="voice-player-container flex items-center gap-2 bg-[#0077b9] px-3 h-10 rounded-full shadow-sm max-w-[320px] my-1" style="border-radius: 50px 50px 0px 50px;">
                    <button class="play-btn-custom flex items-center justify-center w-7 h-7 bg-[#e0532b] rounded-full text-white active:scale-95 transition-transform">
                        <i class="fas fa-play text-[10px] ml-0.5 pointer-events-none"></i>
                    </button>
                    <div class="flex items-center flex-grow gap-[3px] opacity-70 px-1">
                        <div class="w-[3px] h-3 bg-white rounded-full"></div>
                        <div class="w-[3px] h-5 bg-white rounded-full"></div>
                        <div class="w-[3px] h-3 bg-white rounded-full"></div>
                        <div class="w-[3px] h-6 bg-white rounded-full"></div>
                        <div class="w-[3px] h-3 bg-white rounded-full"></div>
                        <div class="w-[3px] h-5 bg-white rounded-full"></div>
                        <div class="w-[3px] h-3 bg-white rounded-full"></div>
                    </div>
                    <div class="text-[10px] text-white font-medium min-w-[35px] text-right">
                        <span class="time-current">0:00</span>
                    </div>
                    <audio src="${msg.file_url}" playsinline preload="auto" style="display:none;"></audio>
                    <div class="text-white pl-1">
                        <i class="fas fa-microphone text-sm"></i>
                    </div>
                </div>
            `;
        }

        bubble.innerHTML = contentHTML;

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';
        meta.innerHTML = `
            <span>${formatTime(msg.created_at)}</span>
            ${isMe ? `<i class="fas ${msg.read_at ? 'fa-check-double read-receipt' : 'fa-check read-receipt unread'}"></i>` : ''}
        `;
        bubble.appendChild(meta);

        fragment.appendChild(bubble);
    });

    if (appendAtTop) {
        messageContainer.prepend(fragment);
    } else {
        messageContainer.appendChild(fragment);
    }
}

// =========================================================
// 4. LOAD MESSAGES (WITH INFINITE SCROLL)
// =========================================================
async function loadMessages(loadMore = false) {
    if (isLoadingMore || (!loadMore && !hasMoreMessages)) return;
    isLoadingMore = true;
    if (loadMore) {
        loadMoreLoader.classList.remove('hidden');
        page++;
    } else {
        page = 0;
        messageContainer.innerHTML = '';
        hasMoreMessages = true;
    }

    const from = page * LIMIT;
    const to = from + LIMIT - 1;

    const { data, error } = await _supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(from, to);

    isLoadingMore = false;
    loadMoreLoader.classList.add('hidden');

    if (error) {
        console.error("Error loading messages:", error);
        return;
    }

    if (!data || data.length === 0) {
        if (loadMore) hasMoreMessages = false;
        return;
    }

    const messages = data.reverse();

    if (loadMore) {
        renderMessages(messages, true);
    } else {
        renderMessages(messages, false);
        scrollToBottom();
        markMessagesAsRead(messages);
    }
}

// =========================================================
// 5. MARK MESSAGES AS READ
// =========================================================
async function markMessagesAsRead(messages) {
    const unreadIds = messages
        .filter(msg => msg.sender_id !== myId && !msg.read_at)
        .map(msg => msg.id);

    if (unreadIds.length === 0) return;

    await _supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
}

// =========================================================
// 6. SCROLL HELPER
// =========================================================
function scrollToBottom() {
    setTimeout(() => {
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }, 100);
}

// =========================================================
// 7. REALTIME SUBSCRIPTION
// =========================================================
function subscribeToChat() {
    const channel = _supabase.channel(`room-${conversationId}`);

    channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
        const msg = payload.new;
        if (msg.sender_id === myId || msg.sender_id === myPhone) return;

        renderMessages([msg], false);
        scrollToBottom();
        ring();
    }).subscribe();

    const typingChannel = _supabase.channel(`typing-${conversationId}`);
    typingChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.sender !== myId && payload.sender !== myPhone) {
            showTypingIndicator(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => showTypingIndicator(false), 3000);
        }
    }).subscribe();
}

// =========================================================
// 8. SEND MESSAGE
// =========================================================
async function sendMessage(text, fileUrl = null, msgType = 'text') {
    if (!text && !fileUrl) return;

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin text-sm"></i>`;

    const newMsg = {
        conversation_id: conversationId,
        sender_id: myId,
        type: msgType,
        content: text || '',
        file_url: fileUrl || null
    };

    const { error } = await _supabase.from('messages').insert([newMsg]);

    sendBtn.innerHTML = `<i class="fas fa-paper-plane text-sm"></i>`;
    sendBtn.disabled = false;

    if (error) {
        console.error("Send error:", error);
        alert("Message send nahi hua. Internet check karein.");
        return;
    }

    newMsg.created_at = new Date().toISOString();
    renderMessages([newMsg], false);
    scrollToBottom();
    msgInput.value = '';
    msgInput.style.height = 'auto';
}

// =========================================================
// 9. TYPING INDICATOR
// =========================================================
function showTypingIndicator(show) {
    if (show) {
        typingIndicator.classList.remove('hidden');
        typingIndicator.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
    } else {
        typingIndicator.classList.add('hidden');
    }
}

// =========================================================
// 10. MEDIA UPLOAD & PREVIEW
// =========================================================
async function uploadChatFile(file) {

    let extension = "bin";

    if (file.name) {
        extension = file.name.split(".").pop();
    } else {
        const type = file.type || "";

        if (type.includes("image")) extension = "jpg";
        else if (type.includes("video")) extension = "mp4";
        else if (type.includes("audio")) extension = "webm";
    }

    const fileName =
        `chat_${Date.now()}_${Math.random().toString(36).substring(2,6)}.${extension}`;

    const { error } = await _supabase
        .storage
        .from("order-files")
        .upload(fileName, file);

    if (error) throw error;

    return _supabase
        .storage
        .from("order-files")
        .getPublicUrl(fileName)
        .data.publicUrl;
}

// =========================================================
// 11. VOICE RECORDING (SAME AS NEW-ORDER)
// =========================================================
async function startVoiceRecording() {
    if (!navigator.mediaDevices) return alert("Microphone access blocked.");
    try {
        const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let options = {};
        if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
        else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
        else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };

        audioRecorder = new MediaRecorder(aStream, options);
        audioChunks = [];
        audioRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };
        
        audioRecorder.onstop = async () => {
    const finalMime = audioRecorder.mimeType || "audio/webm";
    const audioBlob = new Blob(audioChunks, { type: finalMime });
    aStream.getTracks().forEach(track => track.stop());
    stopVoiceTimer();          // UI hide, timer band
    const micIcon = document.getElementById("micIcon");
    micIcon.className = "fas fa-microphone text-white";
    const vBtn = document.getElementById("chatVoiceBtn");
    vBtn.classList.remove("voice-active");
    window.recordedVoiceBlob = audioBlob;
};
        
        audioRecorder.start();
        startVoiceTimer();
        return true;
    } catch (e) {
        alert("Please allow microphone permission.");
        return false;
    }
}

function stopVoiceRecording() {
    if (audioRecorder && audioRecorder.state !== 'inactive') {
        audioRecorder.stop();
    }
}

// =========================================================
// 12. EVENT LISTENERS
// =========================================================

// Send on Enter (Shift+Enter for new line)
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// Typing broadcast
msgInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        const typingChannel = _supabase.channel(`typing-${conversationId}`);
        typingChannel.send({ type: 'broadcast', event: 'typing', payload: { sender: myId } });
        setTimeout(() => { isTyping = false; }, 2000);
    }
});

// Auto-resize textarea
msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 112) + 'px';
});

// Infinite Scroll
messageContainer.addEventListener('scroll', () => {
    if (messageContainer.scrollTop === 0 && hasMoreMessages) {
        loadMessages(true);
    }
});

// =========================================================
// 13. MEDIA VIEWER
// =========================================================
function openMediaViewer(src, type) {
    const viewer = document.getElementById('mediaViewer');
    const content = document.getElementById('mediaViewerContent');
    viewer.classList.remove('hidden');
    viewer.classList.add('flex');
    if (type === 'image') {
        content.innerHTML = `<img src="${src}" class="max-w-full max-h-[85vh] rounded object-contain">`;
    } else {
        content.innerHTML = `<video src="${src}" controls autoplay playsinline class="max-w-full max-h-[85vh] rounded"></video>`;
    }
}

function closeMediaViewer() {
    document.getElementById('mediaViewer').classList.add('hidden');
    document.getElementById('mediaViewer').classList.remove('flex');
}

// =========================================================
// 14. FIXED INITIALIZATION
// =========================================================
async function init() {
    window.addEventListener('offline', () => document.getElementById('offlineBanner').style.top = '0');
    window.addEventListener('online', () => {
        document.getElementById('offlineBanner').style.top = '-50px';
        loadMessages(false);
    });

    try {
        await fetchOtherUser();
    } catch (e) {
        console.warn("Other user info fetch nahi hui, lekin chat continue karegi:", e);
    }

    await loadMessages(false);
    subscribeToChat();
}
init();

function updateChatHeight() {
    document.body.style.height = window.innerHeight + "px";
}

window.addEventListener("resize", updateChatHeight);
window.addEventListener("orientationchange", updateChatHeight);

updateChatHeight();

// =========================================================
// NEW CHAT FUNCTIONS FOR THE FOOTER
// =========================================================

// 1. Chat Send Function (HTML footer click ke liye)
function sendChatMessage() {
    const text = msgInput.value.trim();
    if (text) sendMessage(text);
}

// 2. Chat Voice Function (HTML footer mic click ke liye)
function handleChatVoice() {
    const vBtn = document.getElementById('chatVoiceBtn');
    const micIcon = document.getElementById('micIcon');
    
    if (audioRecorder && audioRecorder.state === 'recording') {
    stopVoiceRecording();
    stopVoiceTimer();   // ✅ ye line add karo
    vBtn.classList.remove('voice-active');
    micIcon.className = 'fas fa-microphone text-white';
}
    else {
        startVoiceRecording();
        vBtn.classList.add('voice-active');
        micIcon.className = 'fas fa-stop text-red-500';
    }
}

// =========================================================
// MEDIA PREVIEW (WhatsApp Style)
// =========================================================
let pendingMediaFile = null;
let pendingMediaType = 'image';

// 1. Preview open karne ka function
async function previewChatMedia(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    pendingMediaFile = file;
    pendingMediaType = file.type.startsWith('video') ? 'video' : 'image';

    // UI dikhao
    const ui = document.getElementById('mediaPreviewUI');
    const img = document.getElementById('mediaPreviewImg');
    const vid = document.getElementById('mediaPreviewVideo');
    const captionInput = document.getElementById('mediaCaptionInput');
    captionInput.value = ''; // Purana caption clear karo

    const url = URL.createObjectURL(file);
    if (pendingMediaType === 'image') {
        img.src = url;
        img.classList.remove('hidden');
        vid.classList.add('hidden');
    } else {
    vid.src = url;            // ✅ ye line add karo
    vid.classList.remove('hidden');
    img.classList.add('hidden');
}

    ui.classList.remove('hidden');
    input.value = ''; // Input reset
}

// 2. Send button dabaane par upload aur send (کیپشن ڈبل رکنے کے لیے)
async function sendCaptionedMedia() {
    if (!pendingMediaFile) return;
    
    // 🟢 کیپشن اور UI کو فوراً ری سیٹ کریں (تاکہ ڈبل میسج نہ بھیجے)
    const caption = document.getElementById('mediaCaptionInput').value.trim();
    const ui = document.getElementById('mediaPreviewUI');
    
    // یہ لائن ڈبل کلک کو روکتی ہے
    const file = pendingMediaFile;
    pendingMediaFile = null; 
    
    // UI چھپائیں اور انپٹ خالی کریں
    ui.classList.add('hidden');
    document.getElementById('mediaCaptionInput').value = ''; 

    try {
        const fileUrl = await uploadChatFile(file);
        await sendMessage(caption || '', fileUrl, pendingMediaType);
    } catch (err) {
        alert("Media upload fail hogya. Try again.");
        console.error(err);
    } finally {
        const img = document.getElementById('mediaPreviewImg');
        if (img.src) URL.revokeObjectURL(img.src);
    }
}

// 3. Close/Cancel button
function closeMediaPreview() {
    const ui = document.getElementById('mediaPreviewUI');
    ui.classList.add('hidden');
    pendingMediaFile = null;
    // Video/Image URL revoke
    const img = document.getElementById('mediaPreviewImg');
    if (img.src) URL.revokeObjectURL(img.src);
}

// =========================================================
// NEW VOICE RECORDING UI (WhatsApp Style)
// =========================================================
const voiceRecorderUI = document.getElementById('voiceRecorderUI');
const voiceTimerDisplay = document.getElementById('voiceTimerDisplay');
const voiceWaveform = document.getElementById('voiceWaveform');
const voicePauseBtn = document.getElementById('voicePauseBtn');
const voicePauseIcon = document.getElementById('voicePauseIcon');
const voicePauseText = document.getElementById('voicePauseText');

let isVoicePaused = false;

// 1. Start Voice Recording & Show UI (سیف ورژن)
function startVoiceTimer() {
    if (!voiceRecorderUI) return;
    voiceSeconds = 0;
    voiceRecorderUI.style.display = 'flex';
    voiceRecorderUI.style.transform = 'translateY(0)';
    voiceTimerDisplay.textContent = '00:00';
    isVoicePaused = false;
    voicePauseIcon.className = 'fas fa-pause text-sm';
    voicePauseText.textContent = 'Pause';
    
    // 🟢 Waveform bars create karo
    voiceWaveform.innerHTML = '';
    for (let i = 0; i < 40; i++) {
        const bar = document.createElement('div');
        bar.className = 'w-[2px] bg-white rounded-full';
        bar.style.height = '3px';
        bar.style.animationDelay = (i * 0.05) + 's';
        voiceWaveform.appendChild(bar);
    }
    voiceWaveform.classList.add('recording');

    if (voiceTimerInterval) clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(() => {
        voiceSeconds++;
        const mins = Math.floor(voiceSeconds / 60).toString().padStart(2, '0');
        const secs = (voiceSeconds % 60).toString().padStart(2, '0');
        voiceTimerDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
}

// 2. Stop Timer & Hide UI
function stopVoiceTimer() {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
    voiceSeconds = 0;
    voiceWaveform.classList.remove('recording');
    // Inline style hatao taaki 'hidden' class kaam kare
    voiceRecorderUI.style.display = '';
    voiceRecorderUI.style.transform = '';
    voiceRecorderUI.classList.add('hidden');
}

// 3. Cancel Recording (Delete Voice)
function cancelVoiceRecording() {
    if (audioRecorder) {
        // Stop and discard chunks
        audioRecorder.onstop = null; 
        audioRecorder.stop();
        audioRecorder = null;
        audioChunks = [];
    }
    stopVoiceTimer();
    // Reset mic icon in footer
    const micIcon = document.getElementById('micIcon');
    micIcon.className = 'fas fa-microphone text-white';
    const vBtn = document.getElementById('chatVoiceBtn');
    vBtn.classList.remove('voice-active');
    window.recordedVoiceBlob = null;
}

// 4. Toggle Pause/Resume
function toggleVoicePause() {
    if (!audioRecorder) return;

    if (audioRecorder.state === 'recording') {
        // Pause recording
        audioRecorder.pause();
        isVoicePaused = true;
        voicePauseIcon.className = 'fas fa-play text-sm';
        voicePauseText.textContent = 'Resume';
    } else if (audioRecorder.state === 'paused') {
        // Resume recording
        audioRecorder.resume();
        isVoicePaused = false;
        voicePauseIcon.className = 'fas fa-pause text-sm';
        voicePauseText.textContent = 'Pause';
    }
}

// 5. Send the Recorded Voice (triggers upload & send)
async function sendRecordedVoice() {
    // Agar recording abhi chal rahi hai, pehle use roko aur blob ka wait karo
    if (audioRecorder && audioRecorder.state !== 'inactive') {
        // onstop event already blob set kar dega, hum promise se wait karenge
        const blobPromise = new Promise(resolve => {
            const originalOnStop = audioRecorder.onstop;
            audioRecorder.onstop = async (e) => {
                if (originalOnStop) await originalOnStop.call(audioRecorder, e);
                resolve(window.recordedVoiceBlob);
            };
        });
        audioRecorder.stop();
        await blobPromise; // blob ready hone tak ruko
        // ab automatically send call karo, return nahi karna
    }

    if (!window.recordedVoiceBlob) return;

    try {
        const fileUrl = await uploadChatFile(window.recordedVoiceBlob);
        await sendMessage('', fileUrl, 'voice');
    } catch (e) {
        alert('Voice upload failed.');
    }

    // Cleanup
    window.recordedVoiceBlob = null;
    stopVoiceTimer();
    const micIcon = document.getElementById('micIcon');
    micIcon.className = 'fas fa-microphone text-white';
    const vBtn = document.getElementById('chatVoiceBtn');
    vBtn.classList.remove('voice-active');
}

function toggleAttachMenu() {

    const input = document.createElement("input");

    input.type = "file";

    input.accept = "image/*,video/*";

    input.onchange = () => previewChatMedia(input);

    input.click();

}

document.addEventListener("click", function (e) {

    const btn = e.target.closest(".play-btn-custom");

    if (!btn) return;

    const container = btn.closest(".voice-player-container");

    const audio = container.querySelector("audio");

    const icon = btn.querySelector("i");

    const timer = container.querySelector(".time-current");

    document.querySelectorAll(".voice-player-container audio").forEach(a => {

        if (a !== audio) {

            a.pause();

            a.currentTime = 0;

            const c = a.closest(".voice-player-container");

            c.querySelector(".play-btn-custom i").className =
                "fas fa-play text-[10px] ml-0.5";

            c.querySelector(".time-current").textContent = "0:00";

        }

    });

    if (audio.paused) {

        audio.play();

        icon.className = "fas fa-pause text-[10px]";

    } else {

        audio.pause();

        icon.className = "fas fa-play text-[10px] ml-0.5";

    }

    audio.ontimeupdate = () => {

        const m = Math.floor(audio.currentTime / 60);

        const s = Math.floor(audio.currentTime % 60);

        timer.textContent =
            `${m}:${String(s).padStart(2,"0")}`;

    };

    audio.onended = () => {

        icon.className = "fas fa-play text-[10px] ml-0.5";

        timer.textContent = "0:00";

    };

});
