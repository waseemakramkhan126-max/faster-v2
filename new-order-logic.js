// Supabase Initialization
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let draftData = { texts: [], images: [], voices: [], videos: [], docs: [] };
let deliveryCharges = 0; // Default zero, sirf Supabase se fetch hoga
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

// Audio Notification Setup
const sound = document.getElementById('notifSound');

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

// Deep Linking
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

function setupRealtime() {
    if(!userPhone) return;
    _supabase.removeAllChannels(); 
    _supabase.channel('new-order-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_chats' }, (payload) => { 
            if(payload.new && payload.new.sender_phone !== userPhone) ring(); 
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => { 
            if(payload.new && payload.new.customer_phone === userPhone) ring(); 
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, (payload) => { 
            if(payload.new && payload.new.receiver_id === userPhone) ring(); 
        })
        .subscribe();
}

// -----------------------------------------------------
// SCROLL LOGIC TO HIDE/SHOW APPBAR
// -----------------------------------------------------
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

// Custom Camera Logic
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
            addToDraft('image', { file: b, caption: cap });
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

// Custom Dialog System
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

// Page Initialization
async function initPage() {
    if(!userPhone) return window.location.replace('index.html');
    
    document.getElementById('editName').value = localStorage.getItem('faster_name') || "";
    document.getElementById('editAddress').value = localStorage.getItem('faster_address') || "";
    
    setupRealtime();

    try {
        if(navigator.onLine) {
            const { data: settings } = await _supabase.from('app_settings').select('customer_delivery_fee').limit(1);
            if (settings && settings.length > 0) deliveryCharges = settings[0].customer_delivery_fee;

            const { data: { session } } = await _supabase.auth.getSession();
            if(session) {
                const { data: customerData } = await _supabase.from('customers').select('name, address').eq('email', session.user.email).single();
                if (customerData) {
                    if (customerData.name) { 
                        document.getElementById('editName').value = customerData.name; 
                        localStorage.setItem('faster_name', customerData.name); 
                    }
                    if (customerData.address) { 
                        fullSavedAddress = customerData.address; 
                        let displayAddr = customerData.address;
                        if(displayAddr.includes(" | GPS: ")) displayAddr = displayAddr.split(" | GPS: ")[0].trim(); 
                        document.getElementById('editAddress').value = displayAddr; 
                        localStorage.setItem('faster_address', customerData.address); 
                    }
                }
            }
        }
    } catch (e) { console.error("Data fetch error:", e); }
}
initPage();

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

async function previewFile(input, mode) {
    if(!input.files || input.files.length === 0) return;
    for (const file of Array.from(input.files)) {
        const type = file.type.startsWith('video') ? 'video' : (mode === 'doc' ? 'doc' : 'image');
        if(type === 'image') {
            const caption = await Dialog.show("Add Caption", "Would you like to add a message with this picture? (Optional)", "prompt");
            addToDraft('image', { file: file, caption: caption || "" });
        } else { addToDraft(type, file); }
    }
    input.value = ""; 
}

// -----------------------------------------------------
// CLEANED & FIXED ADD TO DRAFT FUNCTION
// -----------------------------------------------------
function addToDraft(type, content) {
    document.getElementById('emptyPlaceholder').style.display = 'none';
    const chat = document.getElementById('chatArea');
    const bId = "b-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    b.className = "bubble customer-bubble animate-pop"; b.id = bId;

    let itemData = content;
    
    if (type === 'text') {
        const val = (typeof content === 'string') ? content : document.getElementById('orderInput').value.trim();
        if(!val) return;
        itemData = val;
        b.innerHTML = `<p class="whitespace-pre-wrap">${val}</p>`;

        if(typeof content !== 'string') {
            document.getElementById('orderInput').value = "";
            handleInput(document.getElementById('orderInput'));
        }
        getAiReply(val); 
    } 
    else if (type === 'image') {
        const objUrl = URL.createObjectURL(content.file);
        b.innerHTML = `
            <img src="${objUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1">
            ${content.caption ? `<p class="mt-1 text-sm whitespace-pre-wrap">${content.caption}</p>` : ''}
        `;
        let promptText = content.caption ? content.caption : "Is tasveer ko dekhein aur isme majood items order mein shamil karein.";
        sendMediaToAI(content.file, promptText);
    } 
    else if (type === 'voice') {
        const objUrl = URL.createObjectURL(content);
        
        b.innerHTML = `
            <div class="voice-player-container flex items-center gap-2 bg-[#0077b9] p-2 rounded-2xl shadow-sm max-w-[280px] my-1" style="border-radius: 18px 18px 0px 18px;">
        <button type="button" class="play-btn-custom flex items-center justify-center w-8 h-8 bg-[#e0532b] rounded-full text-white active:scale-95 transition-transform" style="min-width: 32px; z-index: 10;">
            <i class="fas fa-play text-xs ml-0.5 pointer-events-none"></i>
        </button>
        
        <div class="flex flex-col flex-grow gap-0.5 pointer-events-none">
            <div class="flex items-center gap-[2px] h-3 opacity-60">
                <div class="w-[2px] h-2 bg-white rounded-full"></div>
                <div class="w-[2px] h-3 bg-white rounded-full"></div>
                <div class="w-[2px] h-1.5 bg-white rounded-full"></div>
                <div class="w-[2px] h-3 bg-white rounded-full"></div>
                <div class="w-[2px] h-2 bg-white rounded-full"></div>
                <div class="w-[2px] h-3 bg-white rounded-full"></div>
            </div>
            <div class="flex justify-between items-center text-[10px] text-white font-medium">
                <span class="time-current">0:00</span>
                <i class="fas fa-check-double text-[9px]"></i>
            </div>
        </div>
        
        <audio src="${objUrl}" playsinline preload="auto" style="position: absolute; opacity: 0; pointer-events: none; width: 0px; height: 0px;"></audio>
        
        <div class="text-white pr-1 pointer-events-none">
            <i class="fas fa-microphone text-sm"></i>
        </div>
    </div>
        `;
        
        setTimeout(() => {
            const container = b.querySelector('.voice-player-container');
            const audioEl = b.querySelector('audio');
            const playBtn = b.querySelector('.play-btn-custom');
            const playIcon = playBtn.querySelector('i');
            const timeCurrent = b.querySelector('.time-current');
            
            if (!audioEl || !playBtn || !container) return;

            // Stop click propagation to bubble
            const stopSelect = (e) => e.stopPropagation();
            container.addEventListener('click', stopSelect);
            container.addEventListener('touchstart', stopSelect, { passive: true });
            container.addEventListener('touchend', stopSelect, { passive: true });

            playBtn.addEventListener('click', async (e) => {
                // IMPORTANT FIX: e.preventDefault() HATA DIYA GAYA HAI! Yeh mobile par audio rok raha tha.
                e.stopPropagation();

                if (audioEl.paused) {
                    // Dusri chalne wali audios rokein
                    document.querySelectorAll('audio').forEach(aud => {
                        if(aud !== audioEl && !aud.paused) {
                            aud.pause();
                            const btn = aud.parentElement.querySelector('.play-btn-custom i');
                            if(btn) btn.className = 'fas fa-play text-sm ml-0.5 pointer-events-none';
                        }
                    });

                    try {
                        await audioEl.play();
                        playIcon.className = 'fas fa-pause text-sm pointer-events-none';
                    } catch(err) {
                        console.error("Playback failed:", err);
                    }
                } else {
                    audioEl.pause();
                    playIcon.className = 'fas fa-play text-sm ml-0.5 pointer-events-none';
                }
            });

            const formatTime = (seconds) => {
                if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
                const min = Math.floor(seconds / 60);
                const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
                return `${min}:${sec}`;
            };

            audioEl.addEventListener('loadedmetadata', () => {
                timeCurrent.textContent = formatTime(audioEl.duration);
            });

            audioEl.addEventListener('timeupdate', () => {
                let remDuration = audioEl.duration - audioEl.currentTime;
                if (remDuration < 0) remDuration = 0;
                timeCurrent.textContent = formatTime(remDuration);
            });

            audioEl.addEventListener('ended', () => {
                playIcon.className = 'fas fa-play text-sm ml-0.5 pointer-events-none';
                timeCurrent.textContent = formatTime(audioEl.duration);
            });

        }, 150);

        sendMediaToAI(content, "Mera voice note sunein aur order items nikal kar summary mein add karein.");
    }
    else if (type === 'doc') {
        b.innerHTML = `<div class="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded"><i class="fas fa-file-pdf text-red-500 text-xl"></i> <span>Document File</span></div>`;
        sendMediaToAI(content, "Is document ko read karein aur iski details order mein shamil karein.");
    }
    else if (type === 'video') {
        const objUrl = URL.createObjectURL(content);
        b.innerHTML = `<video controls src="${objUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1"></video>`;
        sendMediaToAI(content, "Is video ko check karein.");
    }

    let pressTimer;
    b.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { toggleSelect(bId, type); if(navigator.vibrate) navigator.vibrate(50); }, 500); });
    b.addEventListener('touchmove', () => clearTimeout(pressTimer)); 
    b.addEventListener('touchend', () => clearTimeout(pressTimer));
    b.addEventListener('click', () => {
        if (selectedItems.length > 0) toggleSelect(bId, type); 
        else if (type === 'image' || type === 'video') openFull({src: type === 'image' ? URL.createObjectURL(content.file) : URL.createObjectURL(content)}, type === 'image' ? 'img' : 'vid');
    });

    const key = type === 'text' ? 'texts' : type + 's';
    draftData[key].push({ id: bId, data: itemData });
    chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
    document.getElementById('confirmBtnRow').classList.remove('hidden');
}

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
        draftData[key] = draftData[key].filter(item => item.id !== sel.id);
        const el = document.getElementById(sel.id); if (el) el.remove();
    });
    cancelSelection();
    if (Object.values(draftData).flat().length === 0) {
        document.getElementById('confirmBtnRow').classList.add('hidden');
        document.getElementById('emptyPlaceholder').style.display = 'flex';
    }
}

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

// -----------------------------------------------------
// FIXED HANDLE VOICE: Mobile browser auto priority 
// -----------------------------------------------------
async function handleVoice() {
    const vBtn = document.getElementById('voiceBtn');
    const micIcon = document.getElementById('micIcon');
    if (!navigator.mediaDevices) return Dialog.show("Error", "Microphone access blocked.", "alert");
    
    try {
        if (!audioRecorder || audioRecorder.state === "inactive") {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // PRIORITY: mp4 pehle check karo (iOS ke liye), phir opus/webm check karo
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                options = { mimeType: 'audio/webm' };
            }
            
            audioRecorder = new MediaRecorder(aStream, options); 
            audioChunks = [];
            
            audioRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };
            
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
            micIcon.className = 'fas fa-microphone text-gray-500';
        }
    } catch (e) { 
        Dialog.show("Error", "Please allow microphone permission.", "alert"); 
    }
}

// =====================================================
// AI FUNCTIONALITY 
// =====================================================

function addAiBubble(text) {
    const chat = document.getElementById('chatArea');
    const bId = "ai-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    
    b.className = "bubble ai-bubble animate-pop bg-gray-100 text-gray-800 p-3 rounded-lg my-2 max-w-[80%] self-start"; 
    b.id = bId;
    b.innerHTML = `<p class="whitespace-pre-wrap"><strong>AI Assistant:</strong><br>${text}</p>`;
    
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight; 
}

async function askAI() {
    const inputField = document.getElementById('orderInput');
    if (!inputField.value.trim()) {
        return Dialog.show("Error", "Pehle kuch type karein.");
    }
    addToDraft('text');
}

// File ko Base64 banakar AI ko bhejne wala function
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

// Function parameters mein fileData aur mimeType add kiya gaya
async function getAiReply(userMessage, fileData = null, mimeType = null) {
    const btn = document.getElementById('sendBtn'); // Input button targeted
    let originalContent = "";
    
    if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    }

    try {
        const chatElements = document.querySelectorAll('#chatArea .bubble');
        let rawHistory = [];

        chatElements.forEach(el => {
            const text = el.innerText.trim();
            if (text && !text.startsWith("⚠️")) { 
                if (el.classList.contains('ai-bubble')) {
                    let cleanText = text.replace(/AI Assistant:/i, "").trim();
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

        const { data, error } = await _supabase.functions.invoke('chat-brain', {
            body: {
                message: userMessage,
                history: safeHistory,
                fileData: fileData, 
                mimeType: mimeType  
            }
        });

        if (error) {
            addAiBubble(`⚠️ Network Error: ${error.message}`);
            return;
        }

        if (data && data.error) {
            addAiBubble(`⚠️ Backend Error: ${data.error}`);
            return;
        }

        if (data && data.reply) {
            addAiBubble(data.reply);
        }

    } catch(err) {
        console.error("AI Error:", err);
        addAiBubble(`⚠️ System Error: ${err.message}`);
    } finally {
        if (btn) btn.innerHTML = originalContent;
    }
}

async function handleConfirmPrompt() {
    if (!navigator.onLine) return Dialog.show("No Internet", "Connect to the internet to submit your order.", "alert");
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) { await Dialog.show("Session Expired", "Please login again."); window.location.replace("index.html"); return; }
    
    const confirmMsg = `The Delivery Charges will be Rs. ${deliveryCharges}. Do you want to proceed?`;
    const userConfirmed = await Dialog.show("Confirm Order", confirmMsg, "confirm");
    if (userConfirmed) finalSubmitOrder(session.user.email);
}

async function finalSubmitOrder(userEmail) {
    const btn = document.getElementById('finalSubmitBtn');
    const name = document.getElementById('editName').value.trim();
    const addr = fullSavedAddress || document.getElementById('editAddress').value.trim(); 
    
    if(!name || !addr) return Dialog.show("Missing Information", "Please setup your Name and Address in profile.");

    btn.disabled = true; btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`; btn.classList.replace('bg-orange-600', 'bg-gray-400');

    try {
        if (userEmail) await _supabase.from('customers').update({ name: name, address: addr }).eq('email', userEmail);

        const uploadAll = async (items, prefix, defaultExt) => {
            const promises = items.map(async (item) => {
                const file = item.data.file || item.data; 
                
                // Mime/Ext bug fix: File ki original extension extract karna 
                let ext = defaultExt;
                if (file.name) {
                    ext = file.name.split('.').pop();
                } else if (file.type) {
                    const mimeExt = file.type.split('/')[1]?.split(';')[0];
                    if (mimeExt) ext = mimeExt;
                }

                const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2,4)}.${ext}`;
                const { error } = await _supabase.storage.from('order-files').upload(fileName, file);
                if(error) throw error;
                return _supabase.storage.from('order-files').getPublicUrl(fileName).data.publicUrl;
            });
            const urls = await Promise.all(promises);
            return urls.join(",");
        };
        
        const [imgURLs, vidURLs, vceURLs, docURLs] = await Promise.all([
            uploadAll(draftData.images, 'img', 'jpg'), uploadAll(draftData.videos, 'vid', 'mp4'),
            uploadAll(draftData.voices, 'voice', 'webm'), uploadAll(draftData.docs, 'doc', 'pdf')
        ]);
        
        // =====================================================
        // ROBUST SUMMARY EXTRACTION LOGIC (Case Insensitive Fix)
        // =====================================================
        const aiBubbles = document.querySelectorAll('.ai-bubble');
        let finalOrderSummary = "";

        if (aiBubbles.length > 0) {
            let lastAiText = aiBubbles[aiBubbles.length - 1].innerText;
            
            // Match in any case (Order summary, ORDER SUMMARY, etc)
            let startMatch = lastAiText.match(/order\s*summary/i) || lastAiText.match(/summary/i);
            let startIndex = startMatch ? startMatch.index : -1;

            let endMatch = lastAiText.match(/aapka order bilkul ready hai/i) || lastAiText.match(/baraye meharbani/i);
            let endIndex = endMatch ? endMatch.index : -1;

            if (startIndex !== -1) {
                if (endIndex !== -1 && endIndex > startIndex) {
                    finalOrderSummary = lastAiText.substring(startIndex, endIndex).trim();
                } else {
                    finalOrderSummary = lastAiText.substring(startIndex).trim();
                }
            } else {
                finalOrderSummary = lastAiText.replace(/AI Assistant:/i, "").trim();
            }
        }
        
        if (finalOrderSummary) {
            finalOrderSummary = finalOrderSummary.replace(/\*\*/g, '').trim();
            // Strict Fallback replace
            finalOrderSummary = finalOrderSummary.split(/Aapka order bilkul ready hai/i)[0].trim(); 
            finalOrderSummary = finalOrderSummary.split(/Baraye meharbani/i)[0].trim();
        }

        if (!finalOrderSummary) {
            const textData = draftData.texts.map(t => t.data);
            const captionData = draftData.images.filter(i => i.data.caption).map(i => "Photo Caption: " + i.data.caption);
            finalOrderSummary = [...textData, ...captionData].join(" | ");
        }
        // =====================================================

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone, customer_name: name, delivery_address: addr, 
            order_details: finalOrderSummary, image_url: imgURLs, video_url: vidURLs, 
            voice_url: vceURLs, doc_url: docURLs, status: 'pending', dc_amount: deliveryCharges 
        }]);
        
        if(error) throw error;
        await Dialog.show("Success", "Your order has been placed successfully! ✅", "alert");
        window.location.href = "home.html";
        
    } catch (err) { 
        await Dialog.show("Error", "Error placing order: " + err.message, "alert"); 
        btn.disabled = false; btn.innerHTML = `Confirm order <i class="fas fa-arrow-right ml-1 text-sm"></i>`; btn.classList.replace('bg-gray-400', 'bg-orange-600');
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
