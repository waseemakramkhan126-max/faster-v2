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

// Page Initialization (100% Dynamic Exact Area Matching)
async function initPage() {
    if(!userPhone) return window.location.replace('index.html');
    
    document.getElementById('editName').value = localStorage.getItem('faster_name') || "";
    document.getElementById('editAddress').value = localStorage.getItem('faster_address') || "";
    
    setupRealtime();

    try {
        if(navigator.onLine) {
            let customerArea = localStorage.getItem('faster_area');
            let customerCity = localStorage.getItem('faster_city');
            
            deliveryCharges = 0; 

            if (customerArea && customerArea !== "Other Area") {
                const { data: areaData, error: dbError } = await _supabase
                    .from('delivery_areas')
                    .select('customer_delivery_fee, is_active') 
                    .ilike('city', customerCity)
                    .ilike('area_name', customerArea)
                    .maybeSingle();

                if (dbError) {
                    console.error("Area Fetch Error:", dbError);
                } else if (areaData) {
                    deliveryCharges = Number(areaData.customer_delivery_fee) || 0;
                    console.log(`✅ Exact Area Matched: ${customerArea} | Charges: Rs. ${deliveryCharges}`);
                    
                    if(areaData.is_active === false) {
                        console.warn(`⚠️ Warning: ${customerArea} mein abhi delivery OFF hai.`);
                    }
                }
            }

            // 4. Session & Customer Profile Data Fetching
            const { data: { session } } = await _supabase.auth.getSession();
            if(session) {
                const { data: customerData } = await _supabase.from('customers').select('name, address, city, area').eq('email', session.user.email).single();
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
                    if (customerData.city) localStorage.setItem('faster_city', customerData.city);
                    if (customerData.area) localStorage.setItem('faster_area', customerData.area);
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

        // ==========================================
        // SMART AUTO-TRIGGER (Confirm Order Detection)
        // ==========================================
        let lowerVal = val.toLowerCase().replace(/[^a-z ]/g, '').trim(); 
        const confirmKeywords = ["ok", "okay", "done", "theek hai", "thek hai", "thk", "theek", "confirm", "confirm order", "order confirm", "done karo", "bhej do", "yes"];
        
        // Check karega ke customer ne pehle koi item (text, image, voice) bheja hai ya nahi
        let totalItems = draftData.texts.length + draftData.images.length + draftData.voices.length + draftData.videos.length + draftData.docs.length;
        
        // Agar pehle se order data maujood hai aur customer ne sirf exact keyword bheja hai
        if (totalItems > 0 && confirmKeywords.includes(lowerVal)) {
            if(typeof content !== 'string') {
                document.getElementById('orderInput').value = "";
                handleInput(document.getElementById('orderInput'));
            }
            // AI ko bhejne ke bajaye direct Confirm Popup khol dega
            handleConfirmPrompt();
            return; 
        }
        // ==========================================

        itemData = val;
        b.innerHTML = `<p class="whitespace-pre-wrap">${val}</p>`;

        if(typeof content !== 'string') {
            document.getElementById('orderInput').value = "";
            handleInput(document.getElementById('orderInput'));
        }
      //getAiReply(val);
    }
    else if (type === 'image') {
        const objUrl = URL.createObjectURL(content.file);
        b.innerHTML = `
            <img src="${objUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1">
            ${content.caption ? `<p class="mt-1 text-sm whitespace-pre-wrap">${content.caption}</p>` : ''}
        `;
        let promptText = content.caption ? content.caption : "Is tasveer ko dekhein aur isme majood items order mein shamil karein.";
        //sendMediaToAI(content.file, promptText);
    } 
    else if (type === 'voice') {
        const objUrl = URL.createObjectURL(content);
        
        b.innerHTML = `
            <div class="voice-player-container flex items-center gap-2 bg-[#0077b9] px-3 h-10 rounded-full shadow-sm max-w-[320px] my-1" style="border-radius: 50px 50px 0px 50px;">
        
        <button type="button" class="play-btn-custom flex items-center justify-center w-7 h-7 bg-[#e0532b] rounded-full text-white active:scale-95 transition-transform" style="min-width: 28px;">
            <i class="fas fa-play text-[10px] ml-0.5 pointer-events-none"></i>
        </button>
        
        <div class="flex items-center flex-grow gap-[3px] opacity-70 px-1 pointer-events-none">
            <div class="w-[3px] h-3 bg-white rounded-full"></div>
            <div class="w-[3px] h-5 bg-white rounded-full"></div>
            <div class="w-[3px] h-3 bg-white rounded-full"></div>
            <div class="w-[3px] h-6 bg-white rounded-full"></div>
            <div class="w-[3px] h-3 bg-white rounded-full"></div>
            <div class="w-[3px] h-5 bg-white rounded-full"></div>
            <div class="w-[3px] h-3 bg-white rounded-full"></div>
        </div>

        <div class="text-[10px] text-white font-medium min-w-[35px] text-right pointer-events-none">
            <span class="time-current">0:00</span>
        </div>
        
        <audio src="${objUrl}" playsinline preload="auto" style="display:none;"></audio>
        
        <div class="text-white pl-1 pointer-events-none">
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

        //sendMediaToAI(content, "Mera voice note sunein aur order items nikal kar summary mein add karein.");
    }
    else if (type === 'doc') {
        b.innerHTML = `<div class="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded"><i class="fas fa-file-pdf text-red-500 text-xl"></i> <span>Document File</span></div>`;
        //sendMediaToAI(content, "Is document ko read karein aur iski details order mein shamil karein.");
    }
    else if (type === 'video') {
        const objUrl = URL.createObjectURL(content);
        b.innerHTML = `<video controls src="${objUrl}" class="max-w-full h-auto rounded-lg mt-1 mb-1"></video>`;
        //sendMediaToAI(content, "Is video ko check karein.");
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
            micIcon.className = 'fas fa-microphone text-white';
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
    
    // Yahan humne AI ka naam "Faster AI" aur sath icon add kar diya hai
    b.className = "bubble ai-bubble animate-pop bg-gray-100 text-gray-800 p-3 rounded-lg my-2 max-w-[80%] self-start"; 
    b.id = bId;
    b.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <div class="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">
                <i class="fas fa-robot"></i>
            </div>
            <strong class="text-xs text-orange-600">Faster AI</strong>
        </div>
        <p class="whitespace-pre-wrap">${text}</p>
    `;
    
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight; 
}
//async function askAI() {
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

// Function parameters mein fileData aur mimeType add kiya gaya 645 se 787
async function getAiReply(userMessage, fileData = null, mimeType = null) {
    const btn = document.getElementById('sendBtn'); 
    const confirmBtn = document.getElementById('finalSubmitBtn'); 
    
    let originalContent = "";
    
    // ==========================================
    // 1. LOADING (SPINNER) LOGIC
    // ==========================================
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
        // ==========================================
        // 2. CHAT HISTORY LOGIC (Purana Wala)
        // ==========================================
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

        // ==========================================
        // 3. AI SYSTEM INSTRUCTION (Drafting Mode)
        // ==========================================
        // Yeh line AI ko order final karne se rokti hai jab tak customer button na dabaye. 
        // Agar customer naya item likhta hai, AI sirf summary update karega.
        const systemInstruction = `You are a professional order taker. 
        Current stage: Drafting/Updating Order.
        - ALWAYS update the order summary if the user adds new items (e.g., "Shimla add karein").
        - NEVER say "Order process ho raha hai" or "Live status check karein" unless the user explicitly confirms. Keep the customer in the order flow.`;

        const { data, error } = await _supabase.functions.invoke('chat-brain', {
            body: { message: userMessage, history: safeHistory, fileData: fileData, mimeType: mimeType, systemInstruction: systemInstruction }
        });

        // ==========================================
        // 4. ERROR & LIMIT CHECKING
        // ==========================================
        let hasError = false;
        let errorMsg = "";

        if (error) { hasError = true; errorMsg = error.message || error.toString(); }
        if (data && data.error) { hasError = true; errorMsg = data.error; }

        if (hasError) {
            let lowerError = errorMsg.toLowerCase();
            if (lowerError.includes("limit") || lowerError.includes("quota") || lowerError.includes("exceeded") || lowerError.includes("429")) {
                Dialog.show(
                    "Limit Reached", 
                    "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", 
                    "alert"
                );
            } else {
                addAiBubble(`⚠️ System Error: ${errorMsg}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
            }
            return; 
        }

        if (data && data.reply) {
            addAiBubble(data.reply);

            // ==========================================
            // 5. SMART AUTO-POPUP (Saare Spelling Variations)
            // ==========================================
            // Is Regex mein aapke diye gaye saare lafz aur unke milte-julte spellings shamil hain
            const confirmRegex = /\b(ok|oky|okay|okie|okei|ok\s*g|oky\s*g|okay\s*g|okie\s*g|okei\s*g|done|confirm|theek|theek\s*hai|theek\s*hai\s*g|thk|proceed|process)\b/i;
            
            // Latest message nikal kar check karenge
            let userLatestText = userMessage.split("|").pop().trim().toLowerCase();

            // Agar customer ne aapki list wala koi lafz bola hai
            if (confirmRegex.test(userLatestText)) {
                // 1 second ka delay taake customer apni aakhri summary dekh lay, phir popup aaye
                setTimeout(() => {
                    handleConfirmPrompt(); 
                }, 1000);
            }
        }

    } catch(err) {
        console.error("AI Error:", err);
        if (err.message.toLowerCase().includes("limit") || err.message.toLowerCase().includes("quota")) {
            Dialog.show(
                "Limit Reached", 
                "You have reached your voice recording limit for this order. To complete your request, please type your order details and send them.", 
                "alert"
            );
        } else {
            addAiBubble(`⚠️ System Error: ${err.message}\n\n*Apne order ki mukammal tafseelat bhejne ke baad 'Confirm Order' button dabayen.*`);
        }
    } finally {
        // ==========================================
        // 6. UI RESET (Buttons ko wapas theek karna)
        // ==========================================
        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        if (confirmBtn) {
            confirmBtn.innerHTML = `Confirm order <i class="fas fa-arrow-right ml-1 text-sm"></i>`;
            confirmBtn.classList.remove('opacity-50', 'pointer-events-none');
            confirmBtn.disabled = false; 
        }
    }
}

async function handleConfirmPrompt() {
    if (!navigator.onLine) return Dialog.show("No Internet", "Connect to the internet to submit your order.", "alert");
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) { await Dialog.show("Session Expired", "Please login again."); window.location.replace("index.html"); return; }

    // ==========================================
    // 🚀 HYBRID FEE CALCULATION (FIXED)
    // ==========================================
    const city = localStorage.getItem('faster_city') || "Lahore";
    const area = localStorage.getItem('faster_area') || "";
    const block = localStorage.getItem('faster_block') || ""; 
    const currentFee = await getFinalDeliveryFee(city, area, block, 
    document.getElementById('overviewAddress').value.trim()
);

    // ==========================================
    // MANUAL SUMMARY EXTRACTION
    // ==========================================
    const customerBubbles = document.querySelectorAll('.customer-bubble');
    let manualSummaryList = [];

    customerBubbles.forEach(bubble => {
        let text = bubble.innerText.trim();
        if (text) manualSummaryList.push("👉 " + text);
    });

    const captionData = draftData.images.filter(i => i.data.caption).map(i => "🖼️ Photo: " + i.data.caption);
    manualSummaryList = [...manualSummaryList, ...captionData];

    currentExtractedSummary = manualSummaryList.join("\n");

    if (!currentExtractedSummary && draftData.voices.length === 0 && draftData.images.length === 0 && draftData.videos.length === 0) {
        alert("Please enter order details or attach a file first.");
        return;
    }

    if (!currentExtractedSummary) {
        currentExtractedSummary = "Order details are in attached voice notes/images.";
    }

    // ==========================================
    // POPULATE POPUP DATA
    // ==========================================
    document.getElementById('overviewName').value = document.getElementById('editName').value || "";
    document.getElementById('overviewAddress').value = fullSavedAddress || document.getElementById('editAddress').value || "";
    
    // --- UPDATED UI: Dynamic Fee Display ---
    document.getElementById('overviewDcAmount').innerText = `Rs. ${currentFee}`;
    
    document.getElementById('overviewSummaryText').innerText = currentExtractedSummary;
    document.getElementById('overviewSchedule').value = ""; 

    // 3. Populate Images 
    const imgContainer = document.getElementById('overviewImages');
    imgContainer.innerHTML = '';
    draftData.images.forEach(imgObj => {
        const objUrl = URL.createObjectURL(imgObj.data.file || imgObj.data);
        const cap = (imgObj.data.caption || "").replace(/'/g, "\\'").replace(/"/g, "&quot;"); 
        imgContainer.innerHTML += `
            <div class="relative w-[70px] h-[70px] rounded-lg overflow-hidden border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-transform" 
                 onclick="openFullWithCaption('${objUrl}', '${cap}')">
                <img src="${objUrl}" class="w-full h-full object-cover">
                ${cap ? `<div class="absolute bottom-0 w-full bg-black/60 text-white text-[8px] p-0.5 text-center truncate">Caption</div>` : ''}
            </div>
        `;
    });

    // 4. Populate Voices
    const voiceContainer = document.getElementById('overviewVoices');
    voiceContainer.innerHTML = '';
    draftData.voices.forEach((vceObj, index) => {
        voiceContainer.innerHTML += `
            <div class="flex items-center gap-2 bg-blue-100 text-[#0077b9] px-3 py-2 rounded-lg text-xs font-bold border border-blue-200">
                <i class="fas fa-microphone"></i> Voice Note attached (${index + 1})
            </div>
        `;
    });

    // 5. Show Full Screen Popup
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
    
    if (captionText) {
        fc.innerText = captionText;
        fc.classList.remove('hidden');
    } else {
        fc.classList.add('hidden');
    }

    fv.onclick = function() {
        this.style.display = 'none';
        fc.classList.add('hidden');
    };
}

// 'sync' ko 'async' kar diya
async function confirmOrderFromOverview() {
    const { data: { session } } = await _supabase.auth.getSession();
    if(!session) return;

    const btn = document.getElementById('overviewSubmitBtn');
    // ==========================================
    // 🎨 INLINE ERROR FUNCTION (Aapki purani logic)
    // ==========================================
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
            </div>
        `;
        btn.parentNode.insertBefore(errDiv, btn); 
        setTimeout(() => {
            let errorToRemove = document.getElementById('inlineOrderError');
            if(errorToRemove) errorToRemove.remove();
        }, 8000); 
    }
    // ==========================================

    // --- FIX 1: LOCALSTORAGE FALLBACK & PROFILE REDIRECT ---
    let customerCity = localStorage.getItem('faster_city');
    let customerArea = localStorage.getItem('faster_area');

    if (!customerArea || customerArea === "null" || !customerCity) {
        try {
            const { data: custData } = await _supabase.from('customers').select('city, area').eq('phone', userPhone).single();
            if (custData && custData.area) {
                customerCity = custData.city;
                customerArea = custData.area;
                localStorage.setItem('faster_city', customerCity);
                localStorage.setItem('faster_area', customerArea);
            } else {
                // Agar area nahi hai, toh Dialog show karein aur profile.html par bhejein
                if (typeof Dialog !== 'undefined') {
                    await Dialog.show("Area Missing 📍", "Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.", "alert");
                } else {
                    alert("Order place karne ke liye apna Delivery Area set karna zaroori hai. Hum aapko Profile page par bhej rahe hain.");
                }
                window.location.href = "profile.html"; 
                return; // Code ko yahin rok do
            }
        } catch(e) {
            showInlineError("Network Error", "Area fetch nahi ho saka, internet check karein.");
            return;
        }
    }

    // --- FIX 2: STANDARDIZE AREA (Crash-Proof) ---
    const safeAreaToSave = (customerArea || "").trim().toLowerCase();

    if (customerCity === "Other City" || customerArea === "Other Area") {
        showInlineError("🚀 Coming Soon!", "Maaf kijiye, abhi hamari service aapke ilaqay mein dastiyab nahi hai.");
        return; 
    }

    // ==========================================
    // 🌍 SUPABASE SE AREA STATUS AUR DYNAMIC TIMING NIKALNA
    // ==========================================
    let openHour = 8; // Default 8 AM
    let closeHour = 1; // Default 1 AM
    let realDBAreaName = customerArea; // Admin panel formatting fallback

    try {
        // CHANGED: `.eq` ki jagah `.ilike` use kiya hai taake case-sensitivity ka masla na ho
        const { data: areaData } = await _supabase
            .from('delivery_areas')
            .select('area_name, is_active, open_hour, close_hour') 
            .eq('city', customerCity)
            .ilike('area_name', customerArea) 
            .maybeSingle(); // Safe row fetching ke liye maybeSingle behtar hai

        if (areaData) {
            // Admin panel par proper capitalize name dikhane ke liye real name uthayen
            realDBAreaName = areaData.area_name;

            // Agar Admin ne is area ki service band ki hui hai
            if (areaData.is_active === false) {
                showInlineError("⚠️ Service Unavailable", `Abhi ${realDBAreaName} mein hamari delivery service aarzi taur par band hai.`);
                return; 
            }
            
            if (areaData.open_hour !== null) openHour = areaData.open_hour;
            if (areaData.close_hour !== null) closeHour = areaData.close_hour;
        }
    } catch (err) {
        console.error("Area & Time check error: ", err);
    }

    const name = document.getElementById('overviewName').value.trim();
    const addr = document.getElementById('overviewAddress').value.trim(); 
    const scheduleTime = document.getElementById('overviewSchedule').value; 
    
    if(!name || !addr) {
        showInlineError("Missing Information", "Please enter your Name and Address to proceed.");
        return;
    }

    // ==========================================
    // 🕒 DYNAMIC TIME CHECK LOGIC (Admin Controlled) - UPDATED
    // ==========================================
    // Time ko minutes mein convert karne wala function taake 9:20 pm jaisi timings bhi cover hon
    function timeToMinutes(val, fallback) {
        if (val === null || val === undefined || val === '') return fallback * 60;
        if (typeof val === 'string' && val.includes(':')) {
            const parts = val.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        return parseInt(val) * 60;
    }

    // Customer ko time PM/AM format mein dikhane ka function
    function formatTimeMsg(val, fallback) {
        let h = fallback;
        let m = 0;
        if (val != null && val !== '') {
            if (typeof val === 'string' && val.includes(':')) {
                const parts = val.split(':');
                h = parseInt(parts[0]);
                m = parseInt(parts[1]);
            } else {
                h = parseInt(val);
            }
        }
        let ampm = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12;
        h12 = h12 ? h12 : 12;
        let mStr = m < 10 ? '0' + m : m;
        return `${h12}:${mStr} ${ampm}`;
    }

    const openMins = timeToMinutes(openHour, 8); // Default 8 AM
    const closeMins = timeToMinutes(closeHour, 17); // Default 5 PM (17:00)
    
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let isShopClosed = false;
    
    // Normal Shift (e.g. 8 AM to 5 PM) aur Night Shift (e.g. 8 PM to 1 AM) logic
    if (openMins <= closeMins) {
        isShopClosed = (currentMins < openMins) || (currentMins >= closeMins);
    } else {
        isShopClosed = (currentMins >= closeMins) && (currentMins < openMins);
    }

    const openStr = formatTimeMsg(openHour, 8);
    const closeStr = formatTimeMsg(closeHour, 17);

    // Condition 1: Normal Order - Service Band hai lekin schedule kar sakta hai
    if (isShopClosed && !scheduleTime) {
        // Aapka required message
        const msg = `Is waqt service time khatm hogya hai, aap apna order schedule kar sakte hain. (Timings: ${openStr} se ${closeStr})`;
        showInlineError("🕒 Service Closed", msg);
        return; // Process ruk jayega
    }

    // Condition 2: Scheduled Order - Close hours mein schedule karne ki koshish
    if (scheduleTime) {
        const schedDate = new Date(scheduleTime);
        const schedMins = schedDate.getHours() * 60 + schedDate.getMinutes();
        
        let isSchedClosed = false;
        if (openMins <= closeMins) {
            isSchedClosed = (schedMins < openMins) || (schedMins >= closeMins);
        } else {
            isSchedClosed = (schedMins >= closeMins) && (schedMins < openMins);
        }

        if (isSchedClosed) {
            // Error aur Supabase wala Dynamic Guide message
            showInlineError("🕒 Invalid Schedule Time", `Aap band waqt mein order schedule nahi kar sakte. Hamari service ${openStr} se ${closeStr} tak open rehti hai, kripya open hour ke mutabiq time chunein.`);
            return; // Process ruk jayega
        }
    }
    // ==========================================

    btn.disabled = true; 
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`; 
    btn.classList.replace('bg-orange-600', 'bg-gray-400');
    
    // ... ISKE NEECHAY WALA UPLOADING AUR INSERT CODE WAISA HI RAHEGA ...

    try {
        const editNameEl = document.getElementById('editName');
        if (editNameEl) editNameEl.value = name;
        
        const editAddressEl = document.getElementById('editAddress');
        if (editAddressEl) editAddressEl.value = addr;
        
        fullSavedAddress = addr;
        
        await _supabase.from('customers').update({ name: name, address: addr }).eq('email', session.user.email);

        // --- FIX 3: SAFE MEDIA UPLOADS ---
        const uploadAll = async (items, prefix, defaultExt) => {
            if (!items || items.length === 0) return "";
            const promises = items.map(async (item) => {
                try {
                    const file = item.data.file || item.data; 
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
                } catch (err) {
                    console.error("Single file skipped due to network:", err);
                    return null; // Return null instead of crashing
                }
            });
            const urls = await Promise.all(promises);
            return urls.filter(url => url !== null).join(","); // Only join successful uploads
        };
        
        const [imgURLs, vidURLs, vceURLs, docURLs] = await Promise.all([
            uploadAll(draftData.images, 'img', 'jpg'), uploadAll(draftData.videos, 'vid', 'mp4'),
            uploadAll(draftData.voices, 'voice', 'webm'), uploadAll(draftData.docs, 'doc', 'pdf')
        ]);

        let finalStatus = 'pending';
        let scheduledAtValue = null;
        if (scheduleTime) {
            finalStatus = 'scheduled'; 
            scheduledAtValue = new Date(scheduleTime).toISOString();
        }

        // 📍 INSERT SE THEEK PEHLE DYNAMIC FEE CALCULATE KAREIN (Yahan paste karein)
        const userBlock = localStorage.getItem('faster_block') || "";
        const finalFee = await getFinalDeliveryFee(customerCity, customerArea, userBlock, addr);

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone, 
            customer_name: name, 
            delivery_address: addr, 
            area: realDBAreaName, // ✅ Safely saved with correct DB database capitalization
            order_details: currentExtractedSummary, 
            image_url: imgURLs, 
            video_url: vidURLs, 
            voice_url: vceURLs, 
            doc_url: docURLs, 
            status: finalStatus, 
            scheduled_at: scheduledAtValue, 
            dc_amount: finalFee // ✅ Sahi final fee save ho rahi hai
        }]);
        
        if(error) throw error;
        
        closeOrderOverview();
        
        await Dialog.show("Success", "Your order has been placed successfully! ✅", "alert");
        window.location.href = "home.html";
        
    } catch (err) { 
        console.error("System Error: ", err);
        showInlineError("System Error", err.message || "Order place nahi ho saka.");
        
        btn.disabled = false; 
        btn.innerHTML = `Confirm & Place Order <i class="fas fa-check-circle ml-1"></i>`; 
        btn.classList.replace('bg-gray-400', 'bg-orange-600');
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

// 1. String ko clean karne ke liye (AA Block -> aablock)
function normalizeString(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\s+/g, ''); 
}

// 2. Hybrid Delivery Fee Calculator
async function getFinalDeliveryFee(cityName, areaName, userInputBlock, addressText = "") {
    const cleanCity = (cityName || "").trim();
    const cleanArea = (areaName || "").trim();

    // Block input ko basic clean karo (numbers, special chars, "block" word hatao)
    let rawBlockInput = (userInputBlock || "").trim()
        .replace(/[\d,.\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
        .replace(/\bblock\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    console.log("🔍 Fee lookup:", { cleanCity, cleanArea, rawBlockInput, addressText });

    try {
        // Sabse pehle area ke saare blocks fetch karo
        const { data: blocks, error: blockError } = await _supabase
            .from('delivery_blocks')
            .select('block_name, delivery_fee')
            .ilike('area_name', cleanArea);

        if (blockError) console.error("Block fetch error:", blockError);

        if (blocks && blocks.length > 0) {
            // DB block names ki cleaned list banao
            const dbBlocks = blocks.map(b => ({
                original: b.block_name.trim(),
                clean: (b.block_name || "").trim().toLowerCase(),
                fee: Number(b.delivery_fee) || 0
            }));

            // Helper: kisi bhi text string se known block dhundo (token match)
            const findBlockInText = (text) => {
                if (!text) return null;
                const tokens = text.split(/\s+/).filter(t => t.length > 0);
                // Har token ko DB blocks se match karo (exact)
                for (const token of tokens) {
                    const match = dbBlocks.find(db => db.clean === token);
                    if (match && match.fee > 0) return match;
                }
                return null;
            };

            // 1. Pehle block input scan karo
            if (rawBlockInput) {
                const blockMatch = findBlockInText(rawBlockInput);
                if (blockMatch) {
                    console.log("✅ Block matched from input:", blockMatch.original, blockMatch.fee);
                    return blockMatch.fee;
                }
            }

            // 2. Address scan (agar address text diya ho)
            if (addressText) {
                const cleanAddress = addressText
                    .replace(/[\d,.\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
                    .replace(/\bblock\b/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                console.log("🧹 Cleaned address:", cleanAddress);
                const addrMatch = findBlockInText(cleanAddress);
                if (addrMatch) {
                    console.log("✅ Block detected from address:", addrMatch.original, addrMatch.fee);
                    return addrMatch.fee;
                }
            }

            console.warn("⚠️ No block matched in input or address. Falling back to area fee.");
        }

        // 3. Fallback: delivery_areas
        const { data: areaData, error: areaError } = await _supabase
            .from('delivery_areas')
            .select('customer_delivery_fee')
            .ilike('city', cleanCity)
            .ilike('area_name', cleanArea)
            .maybeSingle();

        console.log("🏠 Area query result:", areaData, areaError);

        if (!areaError && areaData) {
            const fee = Number(areaData.customer_delivery_fee) || 0;
            console.log("🏠 Area fee fallback:", fee);
            return fee;
        }

        console.warn("⚠️ No fee found. Returning 0.");
        return 0;
    } catch (err) {
        console.error("Fee calculation error:", err);
        return 0;
    }
}
