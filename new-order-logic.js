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
    sound.currentTime = 0; // Aawaz ko shuru se play karne ke liye
    
    // Play() ek promise return karta hai, hum usko check karte hain
    let playPromise = sound.play();

    if (playPromise !== undefined) {
        playPromise.then(_ => {
            // Aawaz theek se play ho gayi
        })
        .catch(error => {
            // Browser ne aawaz block kar di kyunke user ne abhi click nahi kiya tha
            console.log("Browser ne aawaz block kar di. User interaction required.");
        });
    }
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
// SCROLL LOGIC TO HIDE/SHOW APPBAR (BLINKING FIXED)
// -----------------------------------------------------
const chatArea = document.getElementById('chatArea');
const topAppBar = document.getElementById('topAppBar');
let lastScrollTop = 0;

chatArea.addEventListener('scroll', function() {
    let scrollTop = chatArea.scrollTop;
    
    // Agar scroll bohat mamooli sa ho to kuch mat karo (Blinking rokne ke liye)
    if (Math.abs(scrollTop - lastScrollTop) <= 15) return; 

    if (scrollTop > lastScrollTop && scrollTop > 20) {
        // Scroll Down (Hide AppBar)
        topAppBar.style.height = '0px';
        topAppBar.style.paddingTop = '0px';
        topAppBar.style.paddingBottom = '0px';
        topAppBar.style.opacity = '0';
        topAppBar.style.overflow = 'hidden'; // Ye line jhatka (blink) rokti hai
    } else {
        // Scroll Up (Show AppBar)
        topAppBar.style.height = ''; 
        topAppBar.style.paddingTop = '';
        topAppBar.style.paddingBottom = '';
        topAppBar.style.opacity = '1';
    }
    lastScrollTop = scrollTop;
});
// -----------------------------------------------------

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

// Naya function: Camera stream ko properly band karne ke liye
function stopCustomCamera() {
    if(stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null; // Stream ko null karna zaroori hai taake camera background mein band ho jaye
    }
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
    
    // Values stored in hidden inputs for submission processing
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

function addToDraft(type, content) {
    document.getElementById('emptyPlaceholder').style.display = 'none';
    const chat = document.getElementById('chatArea');
    const bId = "b-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const b = document.createElement('div');
    b.className = "bubble customer-bubble animate-pop"; b.id = bId;

    let itemData = content;
    
    if (type === 'text') {

    const val = (typeof content === 'string')
        ? content
        : document.getElementById('orderInput').value.trim();

    if(!val) return;

    itemData = val;

    b.innerHTML = `<p class="whitespace-pre-wrap">${val}</p>`;

    if(typeof content !== 'string') {

        document.getElementById('orderInput').value = "";

        handleInput(document.getElementById('orderInput'));

    }

    askAI(val);

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
        document.getElementById('topAppBar').classList.add('hidden'); // Selection me title chhupa denge
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
    document.getElementById('topAppBar').classList.remove('hidden'); // title wapas display hojaye
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

async function handleVoice() {
    const vBtn = document.getElementById('voiceBtn');
    const micIcon = document.getElementById('micIcon');
    if (!navigator.mediaDevices) return Dialog.show("Error", "Microphone access blocked.", "alert");
    try {
        if (!audioRecorder || audioRecorder.state === "inactive") {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioRecorder = new MediaRecorder(aStream); audioChunks = [];
            audioRecorder.ondataavailable = e => audioChunks.push(e.data);
            audioRecorder.onstop = () => { 
                addToDraft('voice', new Blob(audioChunks, { type: 'audio/webm' })); 
                aStream.getTracks().forEach(track => track.stop()); stopVoiceTimer(); 
            };
            audioRecorder.start(); startVoiceTimer();
            vBtn.classList.add('voice-active'); micIcon.className = 'fas fa-stop';
        } else {
            audioRecorder.stop(); vBtn.classList.remove('voice-active'); micIcon.className = 'fas fa-microphone';
        }
    } catch (e) { Dialog.show("Error", "Please allow microphone permission.", "alert"); }
}

// AI Message Bubble
function addAiBubble(text) {
    const chat = document.getElementById('chatArea');
    const b = document.createElement('div');
    b.className = "bubble self-start ai-bubble";
    b.innerHTML = `<p class="font-bold text-xs mb-1 opacity-70">AI Assistant:</p><p>${text}</p>`;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
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
    // Submit hone se theek pehle dobara internet check
    if (!navigator.onLine) {
        return Dialog.show("No Internet", "Internet connection nahi hai. Kripya online aane ka intezar karein.", "alert");
    }
    
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
                const ext = file.name ? file.name.split('.').pop() : defaultExt;
                // File name se spaces aur special characters hata kar underscore lagana
                const cleanName = file.name ? file.name.replace(/[^a-zA-Z0-9.\-]/g, '_') : 'file';
                const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2,6)}_${cleanName}`;
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
        
        const textData = draftData.texts.map(t => t.data);
        const captionData = draftData.images.filter(i => i.data.caption).map(i => "Photo Caption: " + i.data.caption);
        const combinedDetails = [...textData, ...captionData].join(" | ");

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone, customer_name: name, delivery_address: addr, 
            order_details: combinedDetails, image_url: imgURLs, video_url: vidURLs, 
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

async function askAI(userMessage) {
    try {
        // 1. Screen se pichli saari chat read karna taake AI ko context bheja ja sake
        const chatElements = document.querySelectorAll('#chatArea .bubble');
        let chatHistory = [];

        chatElements.forEach(el => {
            const text = el.innerText.trim();
            // Errors ya khali messages ko history mein mat daalo
            if (text && !text.startsWith("⚠️ AI Error")) { 
                if (el.classList.contains('ai-bubble')) {
                    // "AI Assistant:" wala label hata kar sirf asal text bhejna
                    let cleanText = text.replace("AI Assistant:", "").trim();
                    chatHistory.push({ role: 'model', content: cleanText });
                } else if (el.classList.contains('customer-bubble')) {
                    chatHistory.push({ role: 'user', content: text });
                }
            }
        });

        // Current user message history mein sab se aakhir mein aya hoga, usko remove karna
        // kyunke usko hum 'message' parameter mein alag se bhej rahe hain
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].content === userMessage) {
            chatHistory.pop();
        }

        // 2. Supabase Edge Function ko Message + History dono bhejna
        const { data, error } = await _supabase.functions.invoke('chat-brain', {
            body: { 
                message: userMessage,
                history: chatHistory // NAYA: Ab AI pichli baatein nahi bhoolega
            }
        });

        if (error) {
            throw error;
        }

        if (data && data.reply) {
            addAiBubble(data.reply); 
            console.log("AI Reply:", data.reply);
            return data.reply;
        } else {
            throw new Error("AI API se koi text receive nahi hua.");
        }

    } catch (err) {
        console.error("AI Error:", err.message);
        addAiBubble(`⚠️ AI Error: ${err.message}. Kripya thori der baad dobara koshish karein.`);
    }
}
