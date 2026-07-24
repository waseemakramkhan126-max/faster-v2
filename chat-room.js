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
    // Check if it's a location message with Google Maps link
const urlMatch = msg.content.match(/https:\/\/maps\.google\.com\/maps\?q=[^\s]+/);
if (urlMatch) {
    const url = urlMatch[0];
    const textWithoutUrl = msg.content.replace(url, '');
    
    // Extract lat/lng from URL for static map preview
    const latLngMatch = url.match(/q=([-\d.]+),([-\d.]+)/);
    let mapImageHTML = '';
    if (latLngMatch) {
        const lat = latLngMatch[1];
        const lng = latLngMatch[2];
        const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=600x300&markers=${lat},${lng},red-pushpin`;
        mapImageHTML = `
            <div class="mt-2 rounded-xl overflow-hidden shadow-md" style="max-width:280px;">
                <img src="${staticMapUrl}" class="w-full h-36 object-cover" alt="Location Map" 
                     onerror="this.style.display='none'">
            </div>`;
    }
    
    contentHTML = `
        <div class="cursor-pointer" onclick="event.stopPropagation(); window.open('${url}', '_blank')">
            <p class="whitespace-pre-wrap">${textWithoutUrl}</p>
            ${mapImageHTML}
            <div class="mt-2 bg-blue-600/20 border border-blue-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                <i class="fas fa-map-marker-alt text-blue-400"></i>
                <span class="text-blue-300 text-xs font-medium">📍 Tap to open in Maps</span>
            </div>
        </div>
    `;
} else {
    contentHTML = `<p class="whitespace-pre-wrap">${msg.content}</p>`;
}
} else if (msg.type === 'image') {
    contentHTML = `
        <img src="${msg.file_url}" class="max-w-full max-h-64 rounded-lg object-contain cursor-pointer mt-1" onclick="openMediaViewer('${msg.file_url}', 'image')">
        ${msg.content ? `<p class="mt-1 text-sm whitespace-pre-wrap">${msg.content}</p>` : ''}
    `;
} else if (msg.type === 'video') {
    contentHTML = `
        <video src="${msg.file_url}" controls class="max-w-full max-h-64 rounded-lg mt-1"></video>
    `;
} else if (msg.type === 'document') {
    contentHTML = `
        <div class="flex items-center gap-3 bg-white/10 rounded-xl p-3 cursor-pointer" onclick="window.open('${msg.file_url}', '_blank')">
            <div class="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-file-alt text-white"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold truncate">${msg.content || 'Document'}</p>
                <p class="text-[10px] opacity-70">Tap to download</p>
            </div>
        </div>
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

// Upload with progress + local preview
async function sendMessageWithProgress(text, file, msgType) {
    if (!text && !file) return;

    // Create local blob URL for immediate preview
    let localUrl = null;
    if (file) {
        localUrl = URL.createObjectURL(file);
    }

    // Create temporary message with spinner
    const tempMsg = {
        conversation_id: conversationId,
        sender_id: myId,
        type: msgType,
        content: text || '',
        file_url: localUrl || null,
        created_at: new Date().toISOString(),
        isTemp: true,
        uploadProgress: 0
    };

    // Render temp message with spinner
    const tempBubble = renderTempMessage(tempMsg);
    scrollToBottom();

    try {
        // Upload file
        let fileUrl = null;
        if (file) {
            fileUrl = await uploadChatFileWithProgress(file, (progress) => {
                tempMsg.uploadProgress = progress;
                updateProgressBar(tempBubble, progress);
            });
        }

        // Save to database
        const newMsg = {
            conversation_id: conversationId,
            sender_id: myId,
            type: msgType,
            content: text || '',
            file_url: fileUrl || null
        };

        const { error } = await _supabase.from('messages').insert([newMsg]);
        
        if (error) throw error;

        // Replace temp message with real one
        tempBubble.remove();
        newMsg.created_at = new Date().toISOString();
        renderMessages([newMsg], false);
        scrollToBottom();
        
    } catch (err) {
        const spinner = tempBubble?.querySelector('.upload-spinner');
if (spinner) {
    spinner.innerHTML = '<i class="fas fa-exclamation-circle text-red-500"></i> Failed';
}
    }

    msgInput.value = '';
    msgInput.style.height = 'auto';
}

function renderTempMessage(msg) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble-sent animate-pop';
    
    let contentHTML = '';
    if (msg.type === 'image') {
        contentHTML = `
            <div class="relative">
                <img src="${msg.file_url}" class="max-w-full max-h-48 rounded-lg object-contain opacity-60 blur-sm">
                <div class="upload-spinner absolute inset-0 flex items-center justify-center">
                    <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                        <i class="fas fa-spinner fa-spin text-white text-lg"></i>
                    </div>
                </div>
                <div class="upload-progress-bar absolute bottom-0 left-0 h-1 bg-[#0077b9] rounded-full" style="width:0%"></div>
            </div>
            ${msg.content ? `<p class="mt-1 text-sm whitespace-pre-wrap">${msg.content}</p>` : ''}
        `;
    } else if (msg.type === 'voice') {
        contentHTML = `
            <div class="flex items-center gap-2">
                <div class="upload-spinner w-6 h-6 rounded-full bg-black/30 flex items-center justify-center">
                    <i class="fas fa-spinner fa-spin text-white text-xs"></i>
                </div>
                <span class="text-white text-xs">Uploading voice...</span>
            </div>
        `;
    }
    
    bubble.innerHTML = contentHTML;
    messageContainer.appendChild(bubble);
    return bubble;
}

function updateProgressBar(bubble, progress) {
    const bar = bubble.querySelector('.upload-progress-bar');
    if (bar) {
        bar.style.width = progress + '%';
    }
    if (progress === 100) {
        const spinner = bubble.querySelector('.upload-spinner');
        if (spinner) {
            spinner.innerHTML = '<i class="fas fa-check text-green-400 text-lg"></i>';
        }
    }
}

async function uploadChatFileWithProgress(file, onProgress) {
    let extension = "bin";
    if (file.name) {
        extension = file.name.split(".").pop();
    } else {
        const type = file.type || "";
        if (type.includes("image")) extension = "jpg";
        else if (type.includes("video")) extension = "mp4";
        else if (type.includes("audio")) extension = "webm";
    }

    const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2,6)}.${extension}`;

    // Simulate progress (Supabase upload doesn't provide real progress events easily)
    onProgress(10);
    
    const { error } = await _supabase.storage.from("order-files").upload(fileName, file);
    
    if (error) throw error;
    
    onProgress(90);
    
    const publicUrl = _supabase.storage.from("order-files").getPublicUrl(fileName).data.publicUrl;
    
    onProgress(100);
    
    return publicUrl;
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
// ADVANCED MEDIA PREVIEW (Draw + Crop + Send)
// =========================================================
let pendingMediaFile = null;
let pendingMediaType = 'image';
let canvasImage = null; // Original image object
let canvas = null;
let ctx = null;

// Drawing state
let isDrawingMode = false;
let isDrawing = false;
let currentTool = 'pen';
let drawColor = '#ff0000';
let startX, startY;
let drawings = []; // Array of drawing actions (for undo)

// Crop state
let isCropMode = false;
let cropBox = null;
let cropOverlay = null;
let isDraggingCrop = false;
let isResizingCrop = false;
let cropStartX, cropStartY;
let cropBoxStartLeft, cropBoxStartTop, cropBoxStartWidth, cropBoxStartHeight;

// 1. Preview open karne ka function (Canvas setup)
async function previewChatMedia(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    pendingMediaFile = file;
    pendingMediaType = file.type.startsWith('video') ? 'video' : 'image';

    const ui = document.getElementById('mediaPreviewUI');
    const captionInput = document.getElementById('mediaCaptionInput');
    captionInput.value = '';

    const url = URL.createObjectURL(file);
    
    if (pendingMediaType === 'image') {
        canvasImage = new Image();
        canvasImage.onload = () => {
            setupCanvas(canvasImage);
            ui.classList.remove('hidden');
            resetEditorState();
        };
        canvasImage.src = url;
    } else {
    // Video ke liye simple preview (drawing support nahi)
    const vid = document.getElementById('mediaPreviewVideo');
    vid.src = url;
    vid.classList.remove('hidden');
    document.getElementById('mediaPreviewImg').classList.add('hidden'); // ✅ Add this
    document.getElementById('imageCanvas').classList.add('hidden');
    document.getElementById('toggleDrawBtn').classList.add('hidden');
    document.getElementById('toggleCropBtn').classList.add('hidden');
    document.getElementById('drawingTools').classList.add('hidden'); // ✅ Add this
    document.getElementById('captionBar').classList.remove('hidden'); // ✅ Add this
    ui.classList.remove('hidden');
}

    input.value = '';
}

// Setup Canvas with Image
function setupCanvas(img) {
    canvas = document.getElementById('imageCanvas');
    ctx = canvas.getContext('2d');
    canvas.classList.remove('hidden');
    
    // Calculate canvas size (fit screen)
    const maxWidth = window.innerWidth - 16;
    const maxHeight = window.innerHeight - 200;
    let width = img.width;
    let height = img.height;
    
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width *= ratio;
    height *= ratio;
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    // 🟢 Ab event listeners add karo (canvas ab null nahi hai)
    setupCanvasEvents();
}

// 🟢 Naya function jo event listeners setup karta hai
function setupCanvasEvents() {
    // Purane listeners hatane ke liye (agar dobara setup ho)
    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;
    
    // Mouse Events
    canvas.addEventListener('mousedown', (e) => {
        if (!isDrawingMode || isCropMode) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        startX = (e.clientX - rect.left) * (canvas.width / rect.width);
        startY = (e.clientY - rect.top) * (canvas.height / rect.height);
        drawings.push({ tool: currentTool, color: drawColor, startX, startY, endX: startX, endY: startY });
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || isCropMode) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        drawings[drawings.length - 1].endX = x;
        drawings[drawings.length - 1].endY = y;
        redrawCanvas();
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDrawing = false;
    });

    // Touch Events for Mobile
    canvas.addEventListener('touchstart', (e) => {
        if (!isDrawingMode || isCropMode) return;
        e.preventDefault();
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        startX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        startY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        drawings.push({ tool: currentTool, color: drawColor, startX, startY, endX: startX, endY: startY });
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!isDrawing || isCropMode) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        drawings[drawings.length - 1].endX = x;
        drawings[drawings.length - 1].endY = y;
        redrawCanvas();
    });

    canvas.addEventListener('touchend', () => {
        isDrawing = false;
    });
}

// Reset all editor states
function resetEditorState() {
    isDrawingMode = false;
    isCropMode = false;
    drawings = [];
    document.getElementById('drawingTools').classList.add('hidden');
    document.getElementById('toggleDrawBtn').classList.remove('bg-[#0077b9]');
    document.getElementById('toggleDrawBtn').classList.add('bg-white/10');
    document.getElementById('toggleCropBtn').classList.remove('bg-[#0077b9]');
    document.getElementById('toggleCropBtn').classList.add('bg-white/10');
    document.getElementById('applyCropBtn').classList.add('hidden');
    document.getElementById('captionBar').classList.remove('hidden');
    cropBox = document.getElementById('cropBox');
    cropOverlay = document.getElementById('cropOverlay');
    cropBox.classList.add('hidden');
    cropOverlay.classList.add('hidden');
    setupCropBoxEvents();
    document.getElementById('imageCanvas').classList.remove('drawing-mode');
}

// 🟢 Naya function
function setupCropBoxEvents() {
    cropBox.onmousedown = null; // Purana listener hatao
    
    cropBox.addEventListener('mousedown', (e) => {
        if (!isCropMode) return;
        e.stopPropagation();
        cropDragState = {
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            startLeft: cropBox.offsetLeft,
            startTop: cropBox.offsetTop
        };
    });
}
// ==================== DRAWING FUNCTIONS ====================

function toggleDrawingMode() {
    if (isCropMode) toggleCropMode(); // Close crop first
    
    isDrawingMode = !isDrawingMode;
    const tools = document.getElementById('drawingTools');
    const btn = document.getElementById('toggleDrawBtn');
    
    if (isDrawingMode) {
        tools.classList.remove('hidden');
        btn.classList.add('bg-[#0077b9]');
        btn.classList.remove('bg-white/10');
        canvas.classList.add('drawing-mode');
        document.getElementById('captionBar').classList.add('hidden');
        setDrawingTool('pen');
    } else {
        tools.classList.add('hidden');
        btn.classList.remove('bg-[#0077b9]');
        btn.classList.add('bg-white/10');
        canvas.classList.remove('drawing-mode');
        document.getElementById('captionBar').classList.remove('hidden');
    }
}

function setDrawingTool(tool) {
    currentTool = tool;
    document.querySelectorAll('#drawingTools button[id$="Tool"]').forEach(btn => {
        btn.classList.add('bg-white/10');
        btn.classList.remove('bg-[#0077b9]');
    });
    document.getElementById(tool + 'Tool').classList.add('bg-[#0077b9]');
    document.getElementById(tool + 'Tool').classList.remove('bg-white/10');
}

function setDrawingColor() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'];
    const current = document.getElementById('currentColor');
    const idx = colors.indexOf(drawColor);
    drawColor = colors[(idx + 1) % colors.length];
    current.style.backgroundColor = drawColor;
}

function redrawCanvas() {
    if (!ctx || !canvasImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvasImage, 0, 0, canvas.width, canvas.height);
    
    drawings.forEach(d => {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 3;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        
        if (d.tool === 'pen') {
            ctx.moveTo(d.startX, d.startY);
            ctx.lineTo(d.endX, d.endY);
        } else if (d.tool === 'circle') {
            const radius = Math.sqrt(Math.pow(d.endX - d.startX, 2) + Math.pow(d.endY - d.startY, 2));
            ctx.ellipse(d.startX, d.startY, radius, radius, 0, 0, 2 * Math.PI);
        } else if (d.tool === 'arrow') {
            const angle = Math.atan2(d.endY - d.startY, d.endX - d.startX);
            ctx.moveTo(d.startX, d.startY);
            ctx.lineTo(d.endX, d.endY);
            ctx.lineTo(
                d.endX - 10 * Math.cos(angle - Math.PI / 6),
                d.endY - 10 * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(d.endX, d.endY);
            ctx.lineTo(
                d.endX - 10 * Math.cos(angle + Math.PI / 6),
                d.endY - 10 * Math.sin(angle + Math.PI / 6)
            );
        }
        ctx.stroke();
    });
}

function undoDrawing() {
    drawings.pop();
    redrawCanvas();
}

// ==================== CROP FUNCTIONS ====================

function toggleCropMode() {
    if (isDrawingMode) toggleDrawingMode(); // Close drawing first
    
    isCropMode = !isCropMode;
    cropBox = document.getElementById('cropBox');
    cropOverlay = document.getElementById('cropOverlay');
    const btn = document.getElementById('toggleCropBtn');
    const applyBtn = document.getElementById('applyCropBtn');
    
    if (isCropMode) {
        btn.classList.add('bg-[#0077b9]');
        btn.classList.remove('bg-white/10');
        applyBtn.classList.remove('hidden');
        cropOverlay.classList.remove('hidden');
        cropBox.classList.remove('hidden');
        document.getElementById('captionBar').classList.add('hidden');
        document.getElementById('toggleDrawBtn').classList.add('hidden');
    } else {
        btn.classList.remove('bg-[#0077b9]');
        btn.classList.add('bg-white/10');
        applyBtn.classList.add('hidden');
        cropOverlay.classList.add('hidden');
        cropBox.classList.add('hidden');
        document.getElementById('captionBar').classList.remove('hidden');
        document.getElementById('toggleDrawBtn').classList.remove('hidden');
    }
}

// Crop box dragging logic (simplified - production mein aur detailed hoga)
let cropDragState = null;

document.addEventListener('mousemove', (e) => {
    if (!cropDragState) return;
    const dx = e.clientX - cropDragState.startX;
    const dy = e.clientY - cropDragState.startY;
    cropBox.style.left = (cropDragState.startLeft + dx) + 'px';
    cropBox.style.top = (cropDragState.startTop + dy) + 'px';
    cropBox.style.transform = 'none';
});

document.addEventListener('mouseup', () => {
    cropDragState = null;
});

function applyCrop() {
    if (!isCropMode || !canvasImage) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();
    
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    
    const sx = (boxRect.left - canvasRect.left) * scaleX;
    const sy = (boxRect.top - canvasRect.top) * scaleY;
    const sw = boxRect.width * scaleX;
    const sh = boxRect.height * scaleY;
    
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(canvasImage, sx, sy, sw, sh, 0, 0, sw, sh);
    
    // Update canvasImage to cropped version
    canvasImage = new Image();
    canvasImage.src = canvas.toDataURL();
    
    toggleCropMode();
}

// ==================== SEND FUNCTIONS ====================

function closeMediaPreview() {
    const ui = document.getElementById('mediaPreviewUI');
    ui.classList.add('hidden');
    pendingMediaFile = null;
    canvasImage = null;
    drawings = [];
    if (canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.classList.add('hidden');
    }
    document.getElementById('mediaCaptionInput').value = '';
    resetEditorState();
}

async function sendCaptionedMedia() {
    if (!canvasImage && !pendingMediaFile) return;
    
    const caption = document.getElementById('mediaCaptionInput').value.trim();
    const ui = document.getElementById('mediaPreviewUI');
    
    let fileToUpload;
    
    if (pendingMediaType === 'image' && canvasImage) {
        // Canvas se edited image lo
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        fileToUpload = new File([blob], 'edited_' + Date.now() + '.jpg', { type: 'image/jpeg' });
    } else if (pendingMediaType === 'document') {
        fileToUpload = pendingMediaFile;
        const docName = pendingMediaFile.name;
        const captionWithName = caption ? `${caption}\n📄 ${docName}` : `📄 ${docName}`;
        
        pendingMediaFile = null;
        ui.classList.add('hidden');
        document.getElementById('mediaCaptionInput').value = '';
        
        await sendMessageWithProgress(captionWithName, fileToUpload, 'document');
        closeMediaPreview();
        return;
    } else if (pendingMediaType === 'video') {
        // 🟢 VIDEO CASE — direct file with caption
        fileToUpload = pendingMediaFile;
        const videoCaption = caption || '';
        
        pendingMediaFile = null;
        ui.classList.add('hidden');
        document.getElementById('mediaCaptionInput').value = '';
        
        await sendMessageWithProgress(videoCaption, fileToUpload, 'video');
        closeMediaPreview();
        return;
    } else if (pendingMediaType === 'audio') {
        // 🟢 AUDIO CASE — direct file with caption
        fileToUpload = pendingMediaFile;
        const audioCaption = caption || '';
        
        pendingMediaFile = null;
        ui.classList.add('hidden');
        document.getElementById('mediaCaptionInput').value = '';
        
        await sendMessageWithProgress(audioCaption, fileToUpload, 'audio');
        closeMediaPreview();
        return;
    } else {
        fileToUpload = pendingMediaFile;
    }
    
    pendingMediaFile = null;
    ui.classList.add('hidden');
    document.getElementById('mediaCaptionInput').value = '';

    await sendMessageWithProgress(caption || '', fileToUpload, pendingMediaType);
    
    closeMediaPreview();
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

        // 🛑 Timer interval rok do
        if (voiceTimerInterval) {
            clearInterval(voiceTimerInterval);
            voiceTimerInterval = null;
        }
    } else if (audioRecorder.state === 'paused') {
        // Resume recording
        audioRecorder.resume();
        isVoicePaused = false;
        voicePauseIcon.className = 'fas fa-pause text-sm';
        voicePauseText.textContent = 'Pause';

        // ▶️ Timer interval dobara shuru karo
        if (voiceTimerInterval) clearInterval(voiceTimerInterval); // safety
        voiceTimerInterval = setInterval(() => {
            voiceSeconds++;
            const mins = Math.floor(voiceSeconds / 60).toString().padStart(2, '0');
            const secs = (voiceSeconds % 60).toString().padStart(2, '0');
            voiceTimerDisplay.textContent = `${mins}:${secs}`;
        }, 1000);
    }
}
// 5. Send the Recorded Voice (triggers upload & send)
async function sendRecordedVoice() {
    // Agar recording abhi chal rahi hai, pehle use roko aur blob ka wait karo
    if (audioRecorder && audioRecorder.state !== 'inactive') {
        const blobPromise = new Promise(resolve => {
            const originalOnStop = audioRecorder.onstop;
            audioRecorder.onstop = async (e) => {
                if (originalOnStop) await originalOnStop.call(audioRecorder, e);
                resolve(window.recordedVoiceBlob);
            };
        });
        audioRecorder.stop();
        await blobPromise;
    }

    if (!window.recordedVoiceBlob) return;

    try {
        // 🟢 Blob ko File object mein convert karo
        const voiceFile = new File([window.recordedVoiceBlob], 'voice_' + Date.now() + '.webm', { type: 'audio/webm' });
        await sendMessageWithProgress('', voiceFile, 'voice');
    } catch (e) {
        alert('Voice upload failed.');
    }

    window.recordedVoiceBlob = null;
    stopVoiceTimer();
    const micIcon = document.getElementById('micIcon');
    micIcon.className = 'fas fa-microphone text-white';
    const vBtn = document.getElementById('chatVoiceBtn');
    vBtn.classList.remove('voice-active');
}

// =========================================================
// ATTACHMENT POPUP MENU FUNCTIONS
// =========================================================

// Open popup
function toggleAttachMenu() {
    const popup = document.getElementById('attachPopup');
    const overlay = document.getElementById('attachPopupOverlay');
    popup.classList.remove('hidden');
    overlay.classList.remove('hidden');
    // Force reflow for animation
    void popup.offsetWidth;
    popup.style.transform = 'translateY(0)';
}

// Close popup
function closeAttachPopup() {
    const popup = document.getElementById('attachPopup');
    const overlay = document.getElementById('attachPopupOverlay');
    popup.style.transform = 'translateY(100%)';
    setTimeout(() => {
        popup.classList.add('hidden');
        overlay.classList.add('hidden');
    }, 300);
}

// 1. Gallery
function openGallery() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenGalleryInput').click();
    }, 350);
}

// 2. Camera
function openCamera() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenCameraInput').click();
    }, 350);
}
// =========================================================
// LOCATION FUNCTIONS (FULL SCREEN - REVAMPED)
// =========================================================

let selectedLat = null;
let selectedLng = null;
let selectedLocName = '';
let selectedLocAddress = '';
let locationMap = null;
let locationMarker = null;
let liveLocationDuration = 15;

// Open full screen location
function shareLocation() {
    closeAttachPopup();
    setTimeout(() => {
        const popup = document.getElementById('locationPopup');
        const overlay = document.getElementById('locationPopupOverlay');
        popup.classList.remove('hidden');
        overlay.classList.remove('hidden');
        popup.style.display = 'flex';
        
                        // Reset
        selectedLat = null;
        selectedLng = null;
        var sendBtn = document.getElementById('sendLocationBtn');
        if (sendBtn) sendBtn.disabled = true;
        var selCard = document.getElementById('locationSelectedCard');
        if (selCard) selCard.classList.add('hidden');
        var searchRes = document.getElementById('locationSearchResults');
        if (searchRes) searchRes.classList.add('hidden');
        var searchInp = document.getElementById('locationSearchInput');
        if (searchInp) searchInp.value = '';
        
        // Init map
        setTimeout(() => initLocationMap(), 300);
    }, 350);
}
// Close location
function closeLocationPopup() {
    const popup = document.getElementById('locationPopup');
    const overlay = document.getElementById('locationPopupOverlay');
    popup.classList.add('hidden');
    overlay.classList.add('hidden');
    popup.style.display = '';
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
}

// Initialize Map
function initLocationMap() {
    const container = document.getElementById('locationMap');
    if (!container) return;
    
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
    
    const defaultLat = 30.3753;
    const defaultLng = 69.3451;
    
    locationMap = L.map('locationMap', {
        center: [defaultLat, defaultLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(locationMap);
    
    // 🟢🟢🟢 FIX MAP SIZE — YEH LINE ADD KARO 🟢🟢🟢
    setTimeout(() => {
        locationMap.invalidateSize();
    }, 500);
    
    // Update location on map move
    locationMap.on('moveend', function() {
        const center = locationMap.getCenter();
        updateLocationInfo(center.lat, center.lng);
    });
    
    // Get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
                updateLocationInfo(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
                updateLocationInfo(defaultLat, defaultLng);
            }
        );
    }
}

// Go to my location
function goToMyLocation() {
    if (!locationMap) return;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
            },
            () => alert("Location access denied.")
        );
    }
}

// Update location info
function updateLocationInfo(lat, lng) {
    selectedLat = lat;
    selectedLng = lng;
    
    const card = document.getElementById('locationSelectedCard');
    const nameEl = document.getElementById('locationCardName');
    const addrEl = document.getElementById('locationCardAddress');
    const sendBtn = document.getElementById('sendLocationBtn');
    
    nameEl.textContent = 'Selected Location';
    addrEl.textContent = '';
    card.classList.remove('hidden');
    sendBtn.disabled = false;
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.display_name) {
                selectedLocName = data.display_name.split(',')[0] || 'Selected Location';
                selectedLocAddress = data.display_name;
            } else {
                selectedLocName = 'Selected Location';
                selectedLocAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
            nameEl.textContent = selectedLocName;
            addrEl.textContent = selectedLocAddress;
        })
        .catch(() => {
            selectedLocName = 'Selected Location';
            selectedLocAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            nameEl.textContent = selectedLocName;
            addrEl.textContent = selectedLocAddress;
        });
}

// Search location
async function searchLocation() {
    const query = document.getElementById('locationSearchInput').value.trim();
    if (!query) return;
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        const container = document.getElementById('locationSearchResults');
        
        if (data && data.length > 0) {
            container.classList.remove('hidden');
            container.innerHTML = data.map((place, i) => `
                <div onclick="selectLocationResult(${place.lat}, ${place.lon}, '${escapeHTML(place.display_name)}')"
                     class="loc-result-item px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <p class="text-gray-900 text-sm font-medium">${escapeHTML(place.display_name.split(',')[0])}</p>
                    <p class="text-gray-500 text-xs mt-0.5 truncate">${escapeHTML(place.display_name)}</p>
                </div>
            `).join('');
        } else {
            container.classList.add('hidden');
            alert("Location not found.");
        }
    } catch (err) {
        alert("Search failed.");
    }
}

// Select search result
function selectLocationResult(lat, lng, name) {
    document.getElementById('locationSearchResults').classList.add('hidden');
    document.getElementById('locationSearchInput').value = name.split(',')[0];
    
    if (locationMap) {
        locationMap.setView([parseFloat(lat), parseFloat(lng)], 16);
    }
}

// Confirm and send location
async function confirmLocation() {
    if (!selectedLat || !selectedLng) {
        alert("Select a location first.");
        return;
    }
    const comment = document.getElementById('locationComment').value.trim();
    const mapUrl = `https://maps.google.com/maps?q=${selectedLat},${selectedLng}`;
    const msg = `📍 ${selectedLocName}${comment ? '\n' + comment : ''}\n${mapUrl}`;
    closeLocationPopup();
    await sendMessage(msg);
}

// Smart Back Button Handling
function handleLocationBack() {
    closeLocationPopup();
}

// Override back button
document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.querySelector('#locationTopBar button');
    if (backBtn) {
        backBtn.onclick = handleLocationBack;
    }
});

// Handle back button
let isLocationOpen = false;

const origShareLoc = shareLocation;
shareLocation = function() {
    isLocationOpen = true;
    history.pushState({ popup: 'location' }, '');
    origShareLoc();
};

const origCloseLoc = closeLocationPopup;
closeLocationPopup = function() {
    if (isLocationOpen) {
        isLocationOpen = false;
        history.back();
    }
    origCloseLoc();
};

window.addEventListener('popstate', function(e) {
    if (isLocationOpen) {
        isLocationOpen = false;
        origCloseLoc();
    }
});

// 4. Contacts (Fixed - No Double Send)
async function shareContact() {
    closeAttachPopup();
    
    if ('contacts' in navigator && 'select' in navigator.contacts) {
        try {
            const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const name = contact.name || 'Unknown';
                const phone = contact.tel || '';
                
                // 🟢 Fix: Sirf EK BAAR send karo
                const contactMsg = `👤 Contact: ${name}\n📞 ${phone}`;
                await sendMessage(contactMsg);
                // ❌ Doosri bar call mat karo — yahi galti thi!
            }
        } catch (err) {
            console.error("Contact selection failed:", err);
            alert("Contact access denied.");
        }
    } else {
        // Manual contact share prompt
        const name = prompt("Enter contact name:");
        if (!name) return;
        const phone = prompt("Enter phone number:");
        if (!phone) return;
        const contactMsg = `👤 Contact: ${name}\n📞 ${phone}`;
        await sendMessage(contactMsg);
    }
}

// 5. Documents
function openDocuments() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenDocumentInput').click();
    }, 350);
}

// 6. Audio
function openAudio() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenAudioInput').click();
    }, 350);
}

// =========================================================
// FILE HANDLERS FOR DIFFERENT TYPES
// =========================================================

// Gallery & Camera Picks (Images + Videos)
async function handleGalleryPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    
    if (file.type.startsWith('image/')) {
        // Image → Preview with editor
        await previewChatMedia(input);
    } else if (file.type.startsWith('video/')) {
    // Video → Preview with video player + caption
    pendingMediaFile = file;
    pendingMediaType = 'video';
    
    const ui = document.getElementById('mediaPreviewUI');
    const vid = document.getElementById('mediaPreviewVideo');
    const img = document.getElementById('mediaPreviewImg');
    const captionInput = document.getElementById('mediaCaptionInput');
    
    captionInput.value = '';
    const url = URL.createObjectURL(file);
    vid.src = url;
    vid.classList.remove('hidden');
    img.classList.add('hidden');
    
    // Hide drawing/crop tools for video
    document.getElementById('imageCanvas').classList.add('hidden');
    document.getElementById('toggleDrawBtn').classList.add('hidden');
    document.getElementById('toggleCropBtn').classList.add('hidden');
    document.getElementById('applyCropBtn').classList.add('hidden');
    document.getElementById('drawingTools').classList.add('hidden');
    document.getElementById('captionBar').classList.remove('hidden');
    
    // 🟢 Ensure top bar and caption bar are visible
    document.getElementById('editorTopBar').style.display = 'flex';
    document.getElementById('captionBar').style.display = 'block';
    
    // 🟢 Clear canvas container for video
    document.getElementById('canvasContainer').innerHTML = '';
    document.getElementById('canvasContainer').appendChild(vid);
    
    ui.classList.remove('hidden');
    input.value = '';
    console.log("🎬 Video preview opened:", file.name); // Debug
}
}

// Document Pick (With Preview + Caption + Spinner// Document Pick (With Preview + Caption + Spinner)
async function handleDocumentPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    console.log("📄 Document picked:", file.name);
    
    pendingMediaFile = file;
    pendingMediaType = 'document';
    
    const ui = document.getElementById('mediaPreviewUI');
    if (!ui) { console.error("❌ mediaPreviewUI not found!"); return; }
    
    const captionInput = document.getElementById('mediaCaptionInput');
    if (captionInput) captionInput.value = '';
    
    // 🟢 SAFELY hide elements that exist
    const safeHide = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    };
    
    safeHide('mediaPreviewImg');
    safeHide('mediaPreviewVideo');
    safeHide('imageCanvas');
    safeHide('toggleDrawBtn');
    safeHide('toggleCropBtn');
    safeHide('applyCropBtn');
    safeHide('drawingTools');
    
    // Show caption bar
    const captionBar = document.getElementById('captionBar');
    if (captionBar) captionBar.classList.remove('hidden');
    
    // Show editor top bar
    const editorTopBar = document.getElementById('editorTopBar');
    if (editorTopBar) editorTopBar.style.display = 'flex';
    
    // 🟢 Set document preview content
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 24px;">
                <div style="width:96px;height:96px;border-radius:16px;background:#ea580c;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                    <i class="fas fa-file-alt" style="font-size:48px;color:white;"></i>
                </div>
                <div style="text-align:center;">
                    <p style="color:white;font-weight:bold;font-size:16px;margin-bottom:4px;">${escapeHTML(file.name)}</p>
                    <p style="color:#9ca3af;font-size:14px;">${formatFileSize(file.size)}</p>
                    <p style="color:#6b7280;font-size:12px;margin-top:4px;">${file.type || 'Unknown type'}</p>
                </div>
                <p style="color:#9ca3af;font-size:12px;margin-top:8px;">Add a caption below and tap send</p>
            </div>
        `;
    }
    
    // 🟢 Force show UI
    ui.classList.remove('hidden');
    ui.style.display = 'flex';
    console.log("✅ Document preview opened:", file.name);
    
    input.value = '';
}

// Helper: Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Helper: Escape HTML
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Audio Pick (With Preview + Caption + Spinner)
async function handleAudioPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    console.log("🎵 Audio picked:", file.name);
    
    pendingMediaFile = file;
    pendingMediaType = 'audio';
    
    const ui = document.getElementById('mediaPreviewUI');
    if (!ui) { console.error("❌ mediaPreviewUI not found!"); return; }
    
    const captionInput = document.getElementById('mediaCaptionInput');
    if (captionInput) captionInput.value = '';
    
    const safeHide = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    };
    
    safeHide('mediaPreviewImg');
    safeHide('mediaPreviewVideo');
    safeHide('imageCanvas');
    safeHide('toggleDrawBtn');
    safeHide('toggleCropBtn');
    safeHide('applyCropBtn');
    safeHide('drawingTools');
    
    const captionBar = document.getElementById('captionBar');
    if (captionBar) captionBar.classList.remove('hidden');
    
    const editorTopBar = document.getElementById('editorTopBar');
    if (editorTopBar) editorTopBar.style.display = 'flex';
    
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 24px;">
                <div style="width:96px;height:96px;border-radius:16px;background:#dc2626;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                    <i class="fas fa-music" style="font-size:48px;color:white;"></i>
                </div>
                <div style="text-align:center;">
                    <p style="color:white;font-weight:bold;font-size:16px;margin-bottom:4px;">${escapeHTML(file.name)}</p>
                    <p style="color:#9ca3af;font-size:14px;">${formatFileSize(file.size)}</p>
                    <p style="color:#6b7280;font-size:12px;margin-top:4px;">Audio File</p>
                </div>
                <p style="color:#9ca3af;font-size:12px;margin-top:8px;">Add a caption below and tap send</p>
            </div>
        `;
    }
    
    ui.classList.remove('hidden');
    ui.style.display = 'flex';
    console.log("✅ Audio preview opened:", file.name);
    
    input.value = '';
}
// =========================================================
// LONG PRESS TO COPY CONTACT NUMBER
// =========================================================
let longPressTimer;
let longPressTarget;

document.addEventListener('touchstart', function(e) {
    const contactBubble = e.target.closest('.bubble-sent, .bubble-received');
    if (!contactBubble) return;
    
    const text = contactBubble.textContent || '';
    
    // Check if it contains a phone number (simple pattern)
    const phoneMatch = text.match(/📞\s*([+\d\s-]+)/);
    if (!phoneMatch) return;
    
    longPressTarget = phoneMatch[1].replace(/\s+/g, '');
    
    longPressTimer = setTimeout(() => {
        if (longPressTarget) {
            copyToClipboard(longPressTarget);
            showCopyToast(contactBubble);
        }
    }, 800); // 800ms long press
});

document.addEventListener('touchend', function() {
    clearTimeout(longPressTimer);
    longPressTarget = null;
});

document.addEventListener('touchmove', function() {
    clearTimeout(longPressTimer);
    longPressTarget = null;
});

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            console.log("📋 Copied:", text);
        }).catch(err => {
            console.error("Copy failed:", err);
        });
    } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showCopyToast(element) {
    const toast = document.createElement('div');
    toast.className = 'fixed bg-black/80 text-white text-xs px-3 py-2 rounded-full z-[100000] animate-pop';
    toast.textContent = '📋 Phone number copied!';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.bottom = '100px';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 2000);
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
