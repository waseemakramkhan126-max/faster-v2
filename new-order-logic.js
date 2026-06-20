// ===============================
// Supabase Initialization
// ===============================
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// ===============================
// Global State
// ===============================
let draftData = { texts: [], images: [], voices: [], videos: [], docs: [] };
let deliveryCharges = 0;
let selectedItems = [];
let userPhone = localStorage.getItem('faster_phone');
const customerId = localStorage.getItem('faster_customer_id') || '';
let fullSavedAddress = "";
let matchedBlockName = null;

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

// Audio Notification Setup
const sound = document.getElementById('notifSound');

// ===============================
// Audio & Vibration Functions
// ===============================
function ring() {
    if(!sound) return;
    sound.currentTime = 0;
    let playPromise = sound.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { console.warn("Auto-play blocked:", error); });
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function unlockAudio() {
    if(sound) {
        sound.muted = true;
        sound.play().then(() => {
            sound.pause();
            sound.currentTime = 0;
            sound.muted = false;
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        }).catch(e => console.warn(e));
    }
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// ===============================
// Deep Linking
// ===============================
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
    } catch(e) {
        console.error("Deep link failed:", e);
    }
}

// ===============================
// Realtime Subscriptions
// ===============================
function setupRealtime() {
    if(!userPhone) return;
    _supabase.removeAllChannels();
    _supabase.channel('new-order-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_chats' }, (payload) => {
            if(payload.new && payload.new.sender_phone !== userPhone) ring();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            if(payload.new && String(payload.new.customer_id) === customerId) ring();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => {
            if(payload.new && payload.new.receiver_id === userPhone) ring();
        })
        .subscribe();
}

// ===============================
// Scroll Logic for AppBar
// ===============================
const chatArea = document.getElementById('chatArea');
const topAppBar = document.getElementById('topAppBar');
let lastScrollTop = 0;

if(chatArea && topAppBar) {
    chatArea.addEventListener('scroll', function() {
        let scrollTop = chatArea.scrollTop;
        if (Math.abs(scrollTop - lastScrollTop) <= 15) return;

        if (scrollTop > lastScrollTop && scrollTop > 20) {
            topAppBar.style.height = '0px';
            topAppBar.style.paddingTop = '0px';
            topAppBar.style.paddingBottom = '0px';
            topAppBar.style.opacity = '0';
            topAppBar.style.overflow = 'hidden';
        } else {
            topAppBar.style.height = '';
            topAppBar.style.paddingTop = '';
            topAppBar.style.paddingBottom = '';
            topAppBar.style.opacity = '1';
        }
        lastScrollTop = scrollTop;
    });
}

// ===============================
// Custom Camera Logic
// ===============================
async function startCustomCamera() {
    toggleAttachMenu();
    document.getElementById('customCamOverlay').classList.remove('hidden');
    document.getElementById('customCamOverlay').classList.add('flex');
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: true });
        document.getElementById('v').srcObject = stream;
    } catch (e) {
        alert("Camera Access Denied! Please enable camera permissions.");
        stopCustomCamera();
    }
}

function stopCustomCamera() {
    if(stream) stream.getTracks().forEach(t => t.stop());
    document.getElementById('customCamOverlay').classList.add('hidden');
    document.getElementById('customCamOverlay').classList.remove('flex');
}

function switchCamera() {
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    stopCustomCamera();
    startCustomCamera();
}

function setMode(m) {
    cameraMode = m;
    document.getElementById('pTab').className = (m === 'photo') ? 'text-white border-b-2 border-white pb-1' : 'pb-1';
    document.getElementById('vTab').className = (m === 'video') ? 'text-white border-b-2 border-white pb-1' : 'pb-1';
    document.getElementById('camBtn').style.backgroundColor = (m === 'photo') ? 'white' : '#ef4444';
}

function handleCapture() {
    if(cameraMode === 'photo') {
        const v = document.getElementById('v');
        const c = document.getElementById('c');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        c.toBlob(async b => {
            const cap = await Dialog.show("Photo Detail", "Add a caption... (Optional)", "prompt");
            await addToDraft('image', { file: b, caption: cap });
            stopCustomCamera();
        }, 'image/jpeg');
    } else {
        isRecording ? stopVideo() : startVideo();
    }
}

function startVideo() {
    isRecording = true; videoChunks = [];
    camMediaRecorder = new MediaRecorder(stream);
    camMediaRecorder.ondataavailable = e => videoChunks.push(e.data);
    camMediaRecorder.onstop = () => addToDraft('video', new Blob(videoChunks, {type:'video/mp4'}));
    camMediaRecorder.start();

    document.getElementById('camTimerDisplay').classList.remove('hidden');
    document.getElementById('camBtn').classList.add('animate-pulse');

    let s = 0;
    camTimerInterval = setInterval(() => {
        s++; document.getElementById('camTimerDisplay').innerText = `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    }, 1000);
}

function stopVideo() {
    isRecording = false; camMediaRecorder.stop(); clearInterval(camTimerInterval);
    document.getElementById('camBtn').classList.remove('animate-pulse');
    document.getElementById('camTimerDisplay').classList.add('hidden');
    stopCustomCamera();
}

// ===============================
// Custom Dialog System
// ===============================
const Dialog = {
    show: function(title, text, type = 'alert') {
        return new Promise((resolve) => {
            const modal = document.getElementById('customModal');
            const box = document.getElementById('modalBox');
            const tEl = document.getElementById('modalTitle');
            const textEl = document.getElementById('modalText');
            const inp = document.getElementById('modalInput');
            const btns = document.getElementById('modalButtons');

            tEl.innerText = title;
            if(text) { textEl.innerText = text; textEl.classList.remove('hidden'); }
            else { textEl.classList.add('hidden'); }

            modal.classList.remove('hidden'); modal.classList.add('flex');
            setTimeout(() => { box.classList.remove('scale-95', 'opacity-0'); box.classList.add('scale-100', 'opacity-100'); }, 10);

            const close = (val) => {
                box.classList.remove('scale-100', 'opacity-100'); box.classList.add('scale-95', 'opacity-0');
                setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); resolve(val); }, 200);
            };

            btns.innerHTML = '';
            if (type === 'alert') {
                inp.classList.add('hidden');
                btns.innerHTML = `<button class="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm w-full">OK</button>`;
                btns.querySelector('button').onclick = () => close(true);
            } else if (type === 'confirm') {
                inp.classList.add('hidden');
                btns.innerHTML = `
                    <button class="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold text-sm flex-1">Cancel</button>
                    <button class="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex-1 shadow-md">Yes, Proceed</button>
                `;
                btns.querySelectorAll('button')[0].onclick = () => close(false);
                btns.querySelectorAll('button')[1].onclick = () => close(true);
            } else if (type === 'prompt') {
                inp.classList.remove('hidden'); inp.value = '';
                btns.innerHTML = `
                    <button class="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold text-sm">Skip</button>
                    <button class="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex-1 shadow-md">Save</button>
                `;
                btns.querySelectorAll('button')[0].onclick = () => close('');
                btns.querySelectorAll('button')[1].onclick = () => close(inp.value.trim());
                setTimeout(() => inp.focus(), 150);
            }
        });
    }
};

// ===============================
// File Upload Helper
// ===============================
async function uploadFileToStorage(file, folder = 'draft') {
    const ext = file.name ? file.name.split('.').pop() : 'bin';
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2,5)}.${ext}`;
    const { error } = await _supabase.storage.from('order-files').upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = _supabase.storage.from('order-files').getPublicUrl(fileName);
    return { publicUrl: urlData.publicUrl, filePath: fileName };
}

// ===============================
// Page Initialization & Draft Restore
// ===============================
async function initPage() {
    if(!userPhone) return window.location.replace('index.html');

    document.getElementById('editName').value = localStorage.getItem('faster_name') || "";
    document.getElementById('editAddress').value = localStorage.getItem('faster_address') || "";

    setupRealtime();

    // Restore saved draft
    const savedDraft = localStorage.getItem('faster_order_draft');
    if (savedDraft) {
        try {
            draftData = JSON.parse(savedDraft);
            chatArea.innerHTML = '';
            document.getElementById('emptyPlaceholder').style.display = 'none';

            async function restoreItem(type, data) {
                const bId = "b-" + Date.now() + "-" + Math.random().toString(36).substr(2,5);
                const b = document.createElement('div');
                b.className = "bubble customer-bubble animate-pop";
                b.id = bId;

                if (type === 'text') {
                    b.innerHTML = `<p class="whitespace-pre-wrap">${data}</p>`;
                } else if (type === 'image') {
                    b.innerHTML = `<img src="${data.url}" class="max-w-full h-auto rounded-lg mt-1 mb-1">
                                  ${data.caption ? `<p class="mt-1 text-sm whitespace-pre-wrap">${data.caption}</p>` : ''}`;
                } else if (type === 'voice') {
                    b.innerHTML = `
                        <div class="voice-player-container flex items-center gap-2 bg-[#0077b9] px-3 h-10 rounded-full shadow-sm max-w-[320px] my-1" style="border-radius: 50px 50px 0px 50px;">
                            <button type="button" class="play-btn-custom flex items-center justify-center w-7 h-7 bg-[#e0532b] rounded-full text-white active:scale-95 transition-transform" style="min-width: 28px;">
                                <i class="fas fa-play text-[10px] ml-0.5 pointer-events-none"></i>
                            </button>
                            <div class="flex items-center flex-grow gap-[3px] opacity-70 px-1 pointer-events-none">
                                <div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-5 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-6 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-5 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div>
                            </div>
                            <div class="text-[10px] text-white font-medium min-w-[35px] text-right pointer-events-none">
                                <span class="time-current">0:00</span>
                            </div>
                            <audio src="${data.url}" playsinline preload="auto" style="display:none;"></audio>
                            <div class="text-white pl-1 pointer-events-none"><i class="fas fa-microphone text-sm"></i></div>
                        </div>`;
                    // Re-attach voice player events
                    setTimeout(() => {
                        const container = b.querySelector('.voice-player-container');
                        const audioEl = b.querySelector('audio');
                        const playBtn = b.querySelector('.play-btn-custom');
                        const playIcon = playBtn.querySelector('i');
                        const timeCurrent = b.querySelector('.time-current');
                        if (!audioEl || !playBtn || !container) return;
                        const stopSelect = (e) => e.stopPropagation();
                        container.addEventListener('click', stopSelect);
                        container.addEventListener('touchstart', stopSelect, { passive: true });
                        container.addEventListener('touchend', stopSelect, { passive: true });
                        playBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            if (audioEl.paused) {
                                document.querySelectorAll('audio').forEach(aud => { if(aud !== audioEl && !aud.paused) { aud.pause(); const btn = aud.parentElement.querySelector('.play-btn-custom i'); if(btn) btn.className = 'fas fa-play text-sm ml-0.5'; } });
                                try { await audioEl.play(); playIcon.className = 'fas fa-pause text-sm pointer-events-none'; } catch(err) {}
                            } else { audioEl.pause(); playIcon.className = 'fas fa-play text-sm ml-0.5'; }
                        });
                        const formatTime = (sec) => { if(isNaN(sec)||!isFinite(sec)) return "0:00"; const m = Math.floor(sec/60); const s = Math.floor(sec%60).toString().padStart(2,'0'); return `${m}:${s}`; };
                        audioEl.addEventListener('loadedmetadata', () => { timeCurrent.textContent = formatTime(audioEl.duration); });
                        audioEl.addEventListener('timeupdate', () => { let rem = audioEl.duration - audioEl.currentTime; if(rem<0) rem=0; timeCurrent.textContent = formatTime(rem); });
                        audioEl.addEventListener('ended', () => { playIcon.className = 'fas fa-play text-sm ml-0.5'; timeCurrent.textContent = formatTime(audioEl.duration); });
                    }, 150);
                } else if (type === 'video') {
                    b.innerHTML = `<video controls src="${data.url}" class="max-w-full h-auto rounded-lg mt-1 mb-1"></video>`;
                } else if (type === 'doc') {
                    b.innerHTML = `<div class="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded"><i class="fas fa-file-pdf text-red-500 text-xl"></i> <span>Document File</span></div>`;
                }

                let pressTimer;
                b.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { toggleSelect(bId, type); if(navigator.vibrate) navigator.vibrate(50); }, 500); });
                b.addEventListener('touchmove', () => clearTimeout(pressTimer));
                b.addEventListener('touchend', () => clearTimeout(pressTimer));
                b.addEventListener('click', () => {
                    if (selectedItems.length > 0) toggleSelect(bId, type);
                    else if (type === 'image' || type === 'video') openFull({src: type==='image'? data.url : data.url}, type==='image'?'img':'vid');
                });

                chatArea.appendChild(b);
            }

            if (draftData.texts) for (const t of draftData.texts) await restoreItem('text', t.data);
            if (draftData.images) for (const i of draftData.images) await restoreItem('image', i.data);
            if (draftData.voices) for (const v of draftData.voices) await restoreItem('voice', v.data);
            if (draftData.videos) for (const v of draftData.videos) await restoreItem('video', v.data);
            if (draftData.docs) for (const d of draftData.docs) await restoreItem('doc', d.data);

            chatArea.scrollTop = chatArea.scrollHeight;
            if (Object.values(draftData).flat().length > 0) {
                document.getElementById('confirmBtnRow').classList.remove('hidden');
            }
        } catch(e) { console.warn("Draft load failed", e); }
    }

    // Fetch delivery area and customer details
    try {
        if(navigator.onLine) {
            let customerArea = localStorage.getItem('faster_area');
            let customerCity = localStorage.getItem('faster_city');
            deliveryCharges = 0;
            if (customerArea && customerArea !== "Other Area") {
                const { data: areaData, error: dbError } = await _supabase.from('delivery_areas').select('customer_delivery_fee, is_active').ilike('city', customerCity).ilike('area_name', customerArea).maybeSingle();
                if (dbError) { console.error("Area Fetch Error:", dbError); }
                else if (areaData) { deliveryCharges = Number(areaData.customer_delivery_fee) || 0; }
            }

            const { data: { session } } = await _supabase.auth.getSession();
            if(session) {
                const { data: customerData } = await _supabase.from('customers').select('name, address, city, area').eq('email', session.user.email).single();
                if (customerData) {
                    if (customerData.name) { document.getElementById('editName').value = customerData.name; localStorage.setItem('faster_name', customerData.name); }
                    if (customerData.address) {
                        fullSavedAddress = customerData.address;
                        let displayAddr = customerData.address;
                        if(displayAddr.includes(" | GPS: ")) displayAddr = displayAddr.split(" | GPS: ")[0].trim();
                        document.getElementById('editAddress').value = displayAddr;
                        localStorage.setItem('faster_address', customerData.address);
                    }
                    if (customerData.city) localStorage.setItem('faster_city', customerData.city);
                    if (customerData.area) localStorage.setItem('faster_area', customerData.area);
                }
            }
        }
    } catch (e) { console.error("Data fetch error:", e); }
}
initPage();

// ===============================
// Attachment Menu & Input Handling
// ===============================
function toggleAttachMenu() {
    document.getElementById('attachMenu').classList.toggle('active');
    document.getElementById('plusIcon').classList.toggle('rotate-45');
    document.getElementById('plusIcon').classList.toggle('text-orange-500');
}

function handleInput(el) {
    el.style.height = '44px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    const val = el.value.trim();
    document.getElementById('sendBtn').classList.toggle('hidden', val === "");
    document.getElementById('voiceBtn').classList.toggle('hidden', val !== "");
}

// ===============================
// File Preview (Gallery/Docs)
// ===============================
async function previewFile(input, mode) {
    if(!input.files || input.files.length === 0) return;
    for (const file of Array.from(input.files)) {
        const type = file.type.startsWith('video') ? 'video' : (mode === 'doc' ? 'doc' : 'image');
        if(type === 'image') {
            const caption = await Dialog.show("Add Caption", "Would you like to add a message with this picture? (Optional)", "prompt");
            await addToDraft('image', { file: file, caption: caption || "" });
        } else await addToDraft(type, file);
    }
    input.value = "";
}

// ===============================
// ADD TO DRAFT (WITH UPLOAD ON ATTACH)
// ===============================
async function addToDraft(type, content) {
    document.getElementById('emptyPlaceholder').style.display = 'none';
    const chat = chatArea;
    const bId = "b-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    b.className = "bubble customer-bubble animate-pop"; b.id = bId;

    let itemData = content;

    if (type === 'text') {
        const val = (typeof content === 'string') ? content : document.getElementById('orderInput').value.trim();
        if(!val) return;

        let lowerVal = val.toLowerCase().replace(/[^a-z ]/g, '').trim();
        const confirmKeywords = ["ok", "okay", "done", "theek hai", "thek hai", "thk", "theek", "confirm", "confirm order", "order confirm", "done karo", "bhej do", "yes"];
        let totalItems = draftData.texts.length + draftData.images.length + draftData.voices.length + draftData.videos.length + draftData.docs.length;
        if (totalItems > 0 && confirmKeywords.includes(lowerVal)) {
            if(typeof content !== 'string') { document.getElementById('orderInput').value = ""; handleInput(document.getElementById('orderInput')); }
            handleConfirmPrompt();
            return;
        }

        itemData = val;
        b.innerHTML = `<p class="whitespace-pre-wrap">${val}</p>`;
        if(typeof content !== 'string') { document.getElementById('orderInput').value = ""; handleInput(document.getElementById('orderInput')); }
        // AI call disabled
        // getAiReply(val);
    }
    else if (type === 'image') {
        let imgData;
        try {
            const { publicUrl, filePath } = await uploadFileToStorage(content.file, 'images');
            imgData = { url: publicUrl, filePath, caption: content.caption || '' };
            b.innerHTML = `<img src="${publicUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1">${content.caption ? `<p class="mt-1 text-sm whitespace-pre-wrap">${content.caption}</p>` : ''}`;
        } catch(e) { Dialog.show("Error", "Image upload failed."); return; }
        itemData = imgData;
        // AI call disabled
        // sendMediaToAI(content.file, promptText);
    }
    else if (type === 'voice') {
        let voiceData;
        try {
            const { publicUrl, filePath } = await uploadFileToStorage(content, 'voices');
            voiceData = { url: publicUrl, filePath };
            const objUrl = publicUrl;
            b.innerHTML = `
                <div class="voice-player-container flex items-center gap-2 bg-[#0077b9] px-3 h-10 rounded-full shadow-sm max-w-[320px] my-1" style="border-radius: 50px 50px 0px 50px;">
                    <button type="button" class="play-btn-custom flex items-center justify-center w-7 h-7 bg-[#e0532b] rounded-full text-white active:scale-95 transition-transform" style="min-width: 28px;"><i class="fas fa-play text-[10px] ml-0.5 pointer-events-none"></i></button>
                    <div class="flex items-center flex-grow gap-[3px] opacity-70 px-1 pointer-events-none"><div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-5 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-6 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div><div class="w-[3px] h-5 bg-white rounded-full"></div><div class="w-[3px] h-3 bg-white rounded-full"></div></div>
                    <div class="text-[10px] text-white font-medium min-w-[35px] text-right pointer-events-none"><span class="time-current">0:00</span></div>
                    <audio src="${objUrl}" playsinline preload="auto" style="display:none;"></audio>
                    <div class="text-white pl-1 pointer-events-none"><i class="fas fa-microphone text-sm"></i></div>
                </div>`;
            setTimeout(() => {
                const container = b.querySelector('.voice-player-container');
                const audioEl = b.querySelector('audio');
                const playBtn = b.querySelector('.play-btn-custom');
                const playIcon = playBtn.querySelector('i');
                const timeCurrent = b.querySelector('.time-current');
                if (!audioEl || !playBtn || !container) return;
                const stopSelect = (e) => e.stopPropagation();
                container.addEventListener('click', stopSelect);
                container.addEventListener('touchstart', stopSelect, { passive: true });
                container.addEventListener('touchend', stopSelect, { passive: true });
                playBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (audioEl.paused) {
                        document.querySelectorAll('audio').forEach(aud => { if(aud !== audioEl && !aud.paused) { aud.pause(); const btn = aud.parentElement.querySelector('.play-btn-custom i'); if(btn) btn.className = 'fas fa-play text-sm ml-0.5'; } });
                        try { await audioEl.play(); playIcon.className = 'fas fa-pause text-sm pointer-events-none'; } catch(err) {}
                    } else { audioEl.pause(); playIcon.className = 'fas fa-play text-sm ml-0.5'; }
                });
                const formatTime = (sec) => { if(isNaN(sec)||!isFinite(sec)) return "0:00"; const m = Math.floor(sec/60); const s = Math.floor(sec%60).toString().padStart(2,'0'); return `${m}:${s}`; };
                audioEl.addEventListener('loadedmetadata', () => { timeCurrent.textContent = formatTime(audioEl.duration); });
                audioEl.addEventListener('timeupdate', () => { let rem = audioEl.duration - audioEl.currentTime; if(rem<0) rem=0; timeCurrent.textContent = formatTime(rem); });
                audioEl.addEventListener('ended', () => { playIcon.className = 'fas fa-play text-sm ml-0.5'; timeCurrent.textContent = formatTime(audioEl.duration); });
            }, 150);
        } catch(e) { Dialog.show("Error", "Voice upload failed."); return; }
        itemData = voiceData;
        // AI call disabled
        // sendMediaToAI(content, "Mera voice note sunein...");
    }
    else if (type === 'doc') {
        let docData;
        try {
            const { publicUrl, filePath } = await uploadFileToStorage(content, 'docs');
            docData = { url: publicUrl, filePath };
            b.innerHTML = `<div class="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded"><i class="fas fa-file-pdf text-red-500 text-xl"></i> <span>Document File</span></div>`;
        } catch(e) { Dialog.show("Error", "Document upload failed."); return; }
        itemData = docData;
        // AI call disabled
        // sendMediaToAI(content, "Is document ko read karein...");
    }
    else if (type === 'video') {
        let videoData;
        try {
            const { publicUrl, filePath } = await uploadFileToStorage(content, 'videos');
            videoData = { url: publicUrl, filePath };
            b.innerHTML = `<video controls src="${publicUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1"></video>`;
        } catch(e) { Dialog.show("Error", "Video upload failed."); return; }
        itemData = videoData;
        // AI call disabled
        // sendMediaToAI(content, "Is video ko check karein.");
    }

    // Bubble selection & full-view
    let pressTimer;
    b.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { toggleSelect(bId, type); if(navigator.vibrate) navigator.vibrate(50); }, 500); });
    b.addEventListener('touchmove', () => clearTimeout(pressTimer));
    b.addEventListener('touchend', () => clearTimeout(pressTimer));
    b.addEventListener('click', () => {
        if (selectedItems.length > 0) toggleSelect(bId, type);
        else if (type === 'image' || type === 'video') {
            const src = type === 'image' ? (itemData.url || itemData.data.url) : (itemData.url || itemData.data.url);
            openFull({src: src}, type === 'image' ? 'img' : 'vid');
        }
    });

    const key = type === 'text' ? 'texts' : type + 's';
    draftData[key].push({ id: bId, data: itemData });
    chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
    localStorage.setItem('faster_order_draft', JSON.stringify(draftData));
    document.getElementById('confirmBtnRow').classList.remove('hidden');
}

// ===============================
// Selection & Edit Logic
// ===============================
function toggleSelect(id, type) {
    const idx = selectedItems.findIndex(item => item.id === id);
    const el = document.getElementById(id);
    if (idx > -1) { selectedItems.splice(idx, 1); el.classList.remove('bubble-selected'); }
    else { selectedItems.push({ id, type }); el.classList.add('bubble-selected'); }

    if (selectedItems.length > 0) {
        document.getElementById('topAppBar').classList.add('hidden');
        document.getElementById('selectionHeader').classList.remove('hidden');
        document.getElementById('selectionCount').innerText = selectedItems.length;
        const showEdit = (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'image'));
        document.getElementById('editIcon').classList.toggle('hidden', !showEdit);
    } else { cancelSelection(); }
}

function cancelSelection() {
    selectedItems.forEach(item => { const el = document.getElementById(item.id); if (el) el.classList.remove('bubble-selected'); });
    selectedItems = [];
    document.getElementById('selectionHeader').classList.add('hidden');
    document.getElementById('topAppBar').classList.remove('hidden');
}

function editSelected() {
    if(selectedItems.length !== 1) return;
    const sel = selectedItems[0];
    const inp = document.getElementById('orderInput');
    if(sel.type === 'text') inp.value = draftData.texts.find(t => t.id === sel.id).data;
    else if(sel.type === 'image') inp.value = draftData.images.find(i => i.id === sel.id).data.caption;
    confirmDelete(); handleInput(inp); inp.focus();
}

function confirmDelete() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(sel => {
        const key = sel.type === 'text' ? 'texts' : sel.type + 's';
        const deletedItems = draftData[key].filter(item => item.id === sel.id);
        draftData[key] = draftData[key].filter(item => item.id !== sel.id);
        const el = document.getElementById(sel.id); if (el) el.remove();
        // Remove from Supabase Storage
        for (const delItem of deletedItems) {
            if (delItem.data && delItem.data.filePath) {
                _supabase.storage.from('order-files').remove([delItem.data.filePath]).catch(e => console.warn('Storage remove error', e));
            }
        }
    });
    cancelSelection();
    if (Object.values(draftData).flat().length === 0) {
        const paths = [];
        for (const type of ['images','voices','videos','docs']) {
            if (draftData[type]) draftData[type].forEach(item => { if (item.data && item.data.filePath) paths.push(item.data.filePath); });
        }
        if (paths.length > 0) _supabase.storage.from('order-files').remove(paths).catch(e => console.warn('Bulk delete error', e));
        document.getElementById('confirmBtnRow').classList.add('hidden');
        localStorage.removeItem('faster_order_draft');
        document.getElementById('emptyPlaceholder').style.display = 'flex';
    }
}

// ===============================
// Voice Recording Timer
// ===============================
function startVoiceTimer() {
    voiceSeconds = 0; document.getElementById('recordTimer').innerText = "00:00";
    document.getElementById('textInputWrapper').classList.add('hidden');
    document.getElementById('recordingTimerUI').classList.remove('hidden');
    document.getElementById('recordingTimerUI').classList.add('flex');
    voiceTimerInterval = setInterval(() => {
        voiceSeconds++;
        document.getElementById('recordTimer').innerText = `${Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:${(voiceSeconds % 60).toString().padStart(2, '0')}`;
    }, 1000);
}

function stopVoiceTimer() {
    clearInterval(voiceTimerInterval);
    document.getElementById('recordingTimerUI').classList.add('hidden');
    document.getElementById('recordingTimerUI').classList.remove('flex');
    document.getElementById('textInputWrapper').classList.remove('hidden');
}

// ===============================
// Voice Handler (WebRTC)
// ===============================
async function handleVoice() {
    const vBtn = document.getElementById('voiceBtn');
    const micIcon = document.getElementById('micIcon');
    if (!navigator.mediaDevices) return Dialog.show("Error", "Microphone access blocked.", "alert");

    try {
        if (!audioRecorder || audioRecorder.state === "inactive") {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
            else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
            else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };

            audioRecorder = new MediaRecorder(aStream, options);
            audioChunks = [];
            audioRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) audioChunks.push(e.data); };
            audioRecorder.onstop = () => {
                const finalMime = audioRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: finalMime });
                addToDraft('voice', audioBlob);
                aStream.getTracks().forEach(track => track.stop());
                stopVoiceTimer();
            };
            audioRecorder.start();
            startVoiceTimer();
            vBtn.classList.add('voice-active');
            micIcon.className = 'fas fa-stop text-red-500';
        } else {
            audioRecorder.stop();
            vBtn.classList.remove('voice-active');
            micIcon.className = 'fas fa-microphone text-white';
        }
    } catch (e) { Dialog.show("Error", "Please allow microphone permission.", "alert"); }
}

// ===============================
// AI Functionality (Disabled)
// ===============================
function addAiBubble(text) {
    const chat = chatArea;
    const bId = "ai-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    b.className = "bubble ai-bubble animate-pop bg-gray-100 text-gray-800 p-3 rounded-lg my-2 max-w-[80%] self-start";
    b.id = bId;
    b.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <div class="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]"><i class="fas fa-robot"></i></div>
            <strong class="text-xs text-orange-600">Faster AI</strong>
        </div>
        <p class="whitespace-pre-wrap">${text}</p>
    `;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
}
async function askAI() {
    const inputField = document.getElementById('orderInput');
    if (!inputField.value.trim()) return Dialog.show("Error", "Pehle kuch type karein.");
    await addToDraft('text');
}

// =============== DISABLED AI FUNCTIONS =============== //
/*
function sendMediaToAI(file, promptText) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const base64String = reader.result.split(',')[1];
        const mimeType = file.type;
        await getAiReply(promptText, base64String, mimeType);
    };
    reader.onerror = error => {
        console.error("File reading error:", error);
        Dialog.show("Error", "File read nahi ho saki.", "alert");
    };
}

async function getAiReply(userMessage, fileData = null, mimeType = null) {
    const btn = document.getElementById('sendBtn');
    const confirmBtn = document.getElementById('finalSubmitBtn');

    let originalContent = "";

    if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        btn.disabled = true;
    }
    if (confirmBtn) {
        confirmBtn.classList.add('opacity-50', 'pointer-events-none');
        confirmBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Wait...`;
    }

    try {
        const chatElements = document.querySelectorAll('#chatArea .bubble');
        let rawHistory = [];

        chatElements.forEach(el => {
            const text = el.innerText.trim();
            if (text && !text.includes("⚠️")) {
                if (el.classList.contains('ai-bubble')) {
                    let cleanText = text.replace(/Faster AI:/i, "").trim();
                    rawHistory.push({ role: 'model', content: cleanText });
                } else if (el.classList.contains('customer-bubble')) {
                    rawHistory.push({ role: 'user', content: text });
                }
            }
        });

        if (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].content === userMessage) {
            rawHistory.pop();
        }

        let safeHistory = [];
        let expectedRole = 'user';
        for (let msg of rawHistory) {
            if (msg.role === expectedRole) {
                safeHistory.push(msg);
                expectedRole = (expectedRole === 'user') ? 'model' : 'user';
            } else if (safeHistory.length > 0) {
                safeHistory[safeHistory.length - 1].content += " | " + msg.content;
            }
        }
        if (safeHistory.length > 0 && safeHistory[safeHistory.length - 1].role === 'user') {
            let lastUserMsg = safeHistory.pop();
            userMessage = lastUserMsg.content + " | " + userMessage;
        }

        const systemInstruction = `You are a professional order taker.
        Current stage: Drafting/Updating Order.
        - ALWAYS update the order summary if the user adds new items (e.g., "Shimla add karein").
        - NEVER say "Order process ho raha hai" or "Live status check karein" unless the user explicitly confirms. Keep the customer in the order flow.`;

        const { data, error } = await _supabase.functions.invoke('chat-brain', {
            body: { message: userMessage, history: safeHistory, fileData: fileData, mimeType: mimeType, systemInstruction: systemInstruction }
        });

        let hasError = false;
        let errorMsg = "";
        if (error) { hasError = true; errorMsg = error.message || error.toString(); }
        if (data && data.error) { hasError = true; errorMsg = data.error; }

        if (hasError) {
            let lowerError = errorMsg.toLowerCase();
            if (lowerError.includes("limit") || lowerError.includes("quota") || lowerError.includes("exceeded") || lowerError.includes("429")) {
                Dialog.show("Limit Reached", "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", "alert");
            } else {
                addAiBubble(`⚠️ System Error: ${errorMsg}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
            }
            return;
        }

        if (data && data.reply) {
            addAiBubble(data.reply);

            const confirmRegex = /\b(ok|oky|okay|okie|okei|ok\s*g|oky\s*g|okay\s*g|okie\s*g|okei\s*g|done|confirm|theek|theek\s*hai|theek\s*hai\s*g|thk|proceed|process)\b/i;
            let userLatestText = userMessage.split("|").pop().trim().toLowerCase();

            if (confirmRegex.test(userLatestText)) {
                setTimeout(() => { handleConfirmPrompt(); }, 1000);
            }
        }
    } catch(err) {
        console.error("AI Error:", err);
        if (err.message.toLowerCase().includes("limit") || err.message.toLowerCase().includes("quota")) {
            Dialog.show("Limit Reached", "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", "alert");
        } else {
            addAiBubble(`⚠️ System Error: ${err.message}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
        }
    } finally {
        if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
        if (confirmBtn) {
            confirmBtn.innerHTML = `Confirm order <i class="fas fa-arrow-right ml-1 text-sm"></i>`;
            confirmBtn.classList.remove('opacity-50', 'pointer-events-none');
            confirmBtn.disabled = false;
        }
    }
}
*/

// ===============================
// Confirm Order Popup & Summary
// ===============================
async function handleConfirmPrompt() {
    if (!navigator.onLine) return Dialog.show("No Internet", "Connect to the internet to submit your order.", "alert");
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) { await Dialog.show("Session Expired", "Please login again."); window.location.replace("index.html"); return; }

    const city = localStorage.getItem('faster_city') || "Lahore";
    const area = localStorage.getItem('faster_area') || "";
    const block = localStorage.getItem('faster_block') || "";

    document.getElementById('overviewAddress').value = fullSavedAddress || document.getElementById('editAddress').value || "";
    const currentFee = await getFinalDeliveryFee(city, area, block, document.getElementById('overviewAddress').value.trim());

    const customerBubbles = document.querySelectorAll('.customer-bubble');
    let manualSummaryList = [];
    customerBubbles.forEach(bubble => { let text = bubble.innerText.trim(); if (text) manualSummaryList.push("👉 " + text); });
    const captionData = draftData.images.filter(i => i.data.caption).map(i => "🖼️ Photo: " + i.data.caption);
    manualSummaryList = [...manualSummaryList, ...captionData];
    currentExtractedSummary = manualSummaryList.join("\n");
    if (!currentExtractedSummary && draftData.voices.length === 0 && draftData.images.length === 0 && draftData.videos.length === 0) {
        alert("Please enter order details or attach a file first.");
        return;
    }
    if (!currentExtractedSummary) currentExtractedSummary = "Order details are in attached voice notes/images.";

    document.getElementById('overviewName').value = document.getElementById('editName').value || "";
    document.getElementById('overviewAddress').value = fullSavedAddress || document.getElementById('editAddress').value || "";
    document.getElementById('overviewDcAmount').innerText = `Rs. ${currentFee}`;
    const blockDisplay = document.getElementById('overviewBlockDisplay');
    if (matchedBlockName) blockDisplay.innerText = '✅ Block: ' + matchedBlockName;
    else blockDisplay.innerText = '📍 Block: (using area fee)';

    document.getElementById('overviewSummaryText').innerText = currentExtractedSummary;
    document.getElementById('overviewSchedule').value = "";

    const imgContainer = document.getElementById('overviewImages');
    imgContainer.innerHTML = '';
    draftData.images.forEach(imgObj => {
        const objUrl = imgObj.data.url || imgObj.data;
        const cap = (imgObj.data.caption || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
        imgContainer.innerHTML += `
            <div class="relative w-[70px] h-[70px] rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-transform"
                 onclick="openFullWithCaption('${objUrl}', '${cap}')">
                <img src="${objUrl}" class="w-full h-full object-cover">
                ${cap ? `<div class="absolute bottom-0 w-full bg-black/60 text-white text-[8px] p-0.5 text-center truncate">Caption</div>` : ''}
            </div>`;
    });

    const voiceContainer = document.getElementById('overviewVoices');
    voiceContainer.innerHTML = '';
    draftData.voices.forEach((vceObj, index) => {
        voiceContainer.innerHTML += `
            <div class="flex items-center gap-2 bg-blue-100 text-[#0077b9] px-3 py-2 rounded-lg text-xs font-bold border border-blue-200">
                <i class="fas fa-microphone"></i> Voice Note attached (${index + 1})
            </div>`;
    });

    document.getElementById('orderOverviewModal').classList.remove('hidden');
    document.getElementById('orderOverviewModal').classList.add('flex');
}

function closeOrderOverview() {
    document.getElementById('orderOverviewModal').classList.add('hidden');
    document.getElementById('orderOverviewModal').classList.remove('flex');
}

function openFullWithCaption(srcUrl, captionText) {
    const fv = document.getElementById('fullView');
    const fc = document.getElementById('fullCaption');
    fv.style.display = 'flex';
    document.getElementById('fullContent').innerHTML = `<img src="${srcUrl}" class="max-w-full max-h-[85vh] rounded object-contain transition-transform duration-300">`;
    if (captionText) { fc.innerText = captionText; fc.classList.remove('hidden'); }
    else { fc.classList.add('hidden'); }
    fv.onclick = function() { this.style.display = 'none'; fc.classList.add('hidden'); };
}

// ===============================
// FINAL ORDER CONFIRM & SAVE
// ===============================
async function confirmOrderFromOverview() {
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) return;

    const btn = document.getElementById('overviewSubmitBtn');
    function showInlineError(title, message) {
        let existingError = document.getElementById('inlineOrderError');
        if(existingError) existingError.remove();
        const errDiv = document.createElement('div');
        errDiv.id = 'inlineOrderError';
        errDiv.className = 'bg-red-50 border border-red-200 p-3 mb-4 rounded-xl w-full flex gap-3 items-start shadow-sm transition-all';
        errDiv.innerHTML = `
            <i class="fas fa-exclamation-circle text-red-500 text-xl mt-0.5"></i>
            <div>
                <h3 class="text-sm font-extrabold text-red-800">${title}</h3>
                <p class="text-xs font-semibold text-red-600 mt-0.5">${message}</p>
            </div>`;
        btn.parentNode.insertBefore(errDiv, btn);
        setTimeout(() => { let e = document.getElementById('inlineOrderError'); if(e) e.remove(); }, 8000);
    }

    let customerCity = localStorage.getItem('faster_city');
    let customerArea = localStorage.getItem('faster_area');
    if (!customerArea || customerArea === "null" || !customerCity) {
        if (!customerId || customerId.trim() === '' || isNaN(customerId)) {
            if (typeof Dialog !== 'undefined') await Dialog.show("Area Missing 📍", "Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.", "alert");
            else alert("Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.");
            window.location.href = "profile.html";
            return;
        }
        try {
            const { data: custData } = await _supabase.from('customers').select('city, area').eq('customer_id', customerId).single();
            if (custData && custData.area) { customerCity = custData.city; customerArea = custData.area; localStorage.setItem('faster_city', customerCity); localStorage.setItem('faster_area', customerArea); }
            else { window.location.href = "profile.html"; return; }
        } catch(e) { showInlineError("Network Error", "Area fetch nahi ho saka, internet check karein."); return; }
    }

    // ... (area status, time checks - unchanged for brevity, include your existing time checking code) ...

    const name = document.getElementById('overviewName').value.trim();
    const addr = document.getElementById('overviewAddress').value.trim();
    const scheduleTime = document.getElementById('overviewSchedule').value;

    btn.disabled = true; btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`; btn.classList.replace('bg-orange-600', 'bg-gray-400');

    try {
        await _supabase.from('customers').update({ name: name, address: addr }).eq('email', session.user.email);

        // Use draft URLs directly (no re-upload)
        const imgURLs = draftData.images.map(i => i.data.url).join(',');
        const vidURLs = draftData.videos.map(v => v.data.url).join(',');
        const vceURLs = draftData.voices.map(v => v.data.url).join(',');
        const docURLs = draftData.docs.map(d => d.data.url).join(',');

        let finalStatus = 'pending';
        let scheduledAtValue = null;
        if (scheduleTime) { finalStatus = 'scheduled'; scheduledAtValue = new Date(scheduleTime).toISOString(); }

        const userBlock = localStorage.getItem('faster_block') || "";
        const finalFee = await getFinalDeliveryFee(customerCity, customerArea, userBlock, addr);
        const finalCustomerId = (customerId && customerId.trim() !== '' && !isNaN(customerId)) ? customerId : null;

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone,
            ...(finalCustomerId ? { customer_id: finalCustomerId } : {}),
            customer_name: name, delivery_address: addr, area: realDBAreaName,
            order_details: currentExtractedSummary, image_url: imgURLs, video_url: vidURLs,
            voice_url: vceURLs, doc_url: docURLs, status: finalStatus,
            scheduled_at: scheduledAtValue, dc_amount: finalFee
        }]);
        if(error) throw error;

        localStorage.removeItem('faster_order_draft');
        closeOrderOverview();
        await Dialog.show("Success", "Your order has been placed successfully! ✅", "alert");
        window.location.href = "home.html";
    } catch (err) {
        console.error("System Error: ", err);
        showInlineError("System Error", err.message || "Order place nahi ho saka.");
        btn.disabled = false; btn.innerHTML = `Confirm & Place Order <i class="fas fa-check-circle ml-1"></i>`; btn.classList.replace('bg-gray-400', 'bg-orange-600');
    }
}

function openFull(el, type) {
    const fv = document.getElementById('fullView'); fv.style.display = 'flex';
    if (type === 'img') document.getElementById('fullContent').innerHTML = `<img src="${el.src}" class="max-w-full max-h-full rounded object-contain">`;
    else document.getElementById('fullContent').innerHTML = `<video src="${el.src}" controls autoplay playsinline class="max-w-full max-h-full rounded"></video>`;
}

document.addEventListener('click', function(event) {
    const menu = document.getElementById('attachMenu');
    const plusBtn = document.getElementById('plusBtn');
    if (menu && menu.classList.contains('active')) {
        if (!menu.contains(event.target) && !plusBtn.contains(event.target)) toggleAttachMenu();
    }
});

window.addEventListener('offline', () => document.getElementById('offlineBanner').style.top = '0');
window.addEventListener('online', () => { document.getElementById('offlineBanner').style.top = '-50px'; initPage(); });

// ===============================
// Utility Functions
// ===============================
function normalizeString(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\s+/g, '');
}

function levenshtein(a, b) {
    const an = a.length, bn = b.length;
    const matrix = Array.from({ length: an + 1 }, () => Array(bn + 1).fill(0));
    for (let i = 0; i <= an; i++) matrix[i][0] = i;
    for (let j = 0; j <= bn; j++) matrix[0][j] = j;
    for (let i = 1; i <= an; i++) {
        for (let j = 1; j <= bn; j++) {
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return matrix[an][bn];
}

// ===============================
// Hybrid Delivery Fee Calculator
// ===============================
async function getFinalDeliveryFee(cityName, areaName, userInputBlock, addressText = "") {
    const cleanCity = (cityName || "").trim();
    const cleanArea = (areaName || "").trim();

    // Customer override check
    if (customerId && !isNaN(customerId) && typeof userPhone !== 'undefined' && userPhone) {
        try {
            const { data: cust } = await _supabase.from('customers').select('custom_delivery_fee').eq('customer_id', customerId).maybeSingle();
            if (cust && cust.custom_delivery_fee !== null && cust.custom_delivery_fee > 0) {
                console.log("🎯 Customer-specific delivery fee applied:", cust.custom_delivery_fee);
                return Number(cust.custom_delivery_fee);
            }
        } catch (e) { console.warn("Customer override fetch failed, falling back.", e); }
    }

    const cleanText = (text) => (text || "").trim().replace(/[^a-zA-Z\s]/g, ' ').replace(/\bblock\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cleanBlockInput = cleanText(userInputBlock);
    const cleanAddress = cleanText(addressText);
    matchedBlockName = null;

    try {
        const { data: blocks, error: blockError } = await _supabase.from('delivery_blocks').select('block_name, delivery_fee').ilike('area_name', cleanArea);
        if (blockError) console.error("Block fetch error:", blockError);

        if (blocks && blocks.length > 0) {
            const allBlocks = blocks.map(b => ({
                original: b.block_name.trim(),
                tokens: (b.block_name || "").trim().toLowerCase().replace(/\bblock\b/gi, '').trim().split(/\s+/).filter(t => t.length > 0),
                fee: Number(b.delivery_fee) || 0
            })).filter(b => b.fee > 0).sort((a, b) => b.tokens.length - a.tokens.length);

            function normalizeToken(t) {
                if (!t) return '';
                let nt = t.toLowerCase();
                nt = nt.replace(/ee/g, 'i');
                nt = nt.replace(/oo/g, 'u');
                return nt;
            }

            const findBlock = (text, allowSingleLetters = true) => {
                if (!text) return null;
                const inputTokens = text.split(/\s+/).filter(t => t.length > 0);
                const normalizedInput = inputTokens.map(normalizeToken);

                for (const block of allBlocks) {
                    if (!allowSingleLetters && block.tokens.length === 1 && block.tokens[0].length === 1) continue;
                    const normalizedBlock = block.tokens.map(normalizeToken);
                    if (normalizedBlock.every(bt => normalizedInput.includes(bt))) return block;
                    if (block.tokens.every(bt => inputTokens.some(it => {
                        if (it === bt) return true;
                        if (bt.length >= 4 && it.length >= 4 && levenshtein(bt, it) <= 1) return true;
                        return false;
                    }))) return block;
                }
                return null;
            };

            if (cleanBlockInput) {
                const match = findBlock(cleanBlockInput, true);
                if (match) {
                    matchedBlockName = match.original;
                    return match.fee;
                }
            }
            if (cleanAddress) {
                const match = findBlock(cleanAddress, false);
                if (match) {
                    matchedBlockName = match.original;
                    return match.fee;
                }
            }
        }

        const { data: areaData, error: areaError } = await _supabase.from('delivery_areas').select('customer_delivery_fee').ilike('city', cleanCity).ilike('area_name', cleanArea).maybeSingle();
        if (!areaError && areaData) return Number(areaData.customer_delivery_fee) || 0;
        return 0;
    } catch (err) { console.error("Fee calculation error:", err); return 0; }
}
