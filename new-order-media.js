// ==========================================
// 3. CAMERA & VOICE RECORDING
// ==========================================

async function startCustomCamera() {
    toggleAttachMenu();
    document.getElementById('customCamOverlay').classList.remove('hidden');
    document.getElementById('customCamOverlay').classList.add('flex');
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: currentFacingMode }, audio: true 
        });
        document.getElementById('v').srcObject = stream;
    } catch (e) { 
        alert("Camera Access Denied! Please enable camera permissions."); 
        stopCustomCamera(); 
    }
}

function stopCustomCamera() {
    if(stream) { stream.getTracks().forEach(t => t.stop()); }
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
    // UI COLOR CONTROL: Camera mein Photo/Video select hone par jo safed line aati hai
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
        if(isRecording) { stopVideo(); } else { startVideo(); }
    }
}

function startVideo() {
    isRecording = true; 
    videoChunks = [];
    camMediaRecorder = new MediaRecorder(stream);
    camMediaRecorder.ondataavailable = e => videoChunks.push(e.data);
    camMediaRecorder.onstop = () => { addToDraft('video', new Blob(videoChunks, {type:'video/mp4'})); };
    
    camMediaRecorder.start();
    document.getElementById('camTimerDisplay').classList.remove('hidden');
    document.getElementById('camBtn').classList.add('animate-pulse');
    
    let s = 0; 
    camTimerInterval = setInterval(() => {
        s++; 
        document.getElementById('camTimerDisplay').innerText = `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    }, 1000);
}

function stopVideo() {
    isRecording = false; 
    camMediaRecorder.stop();
    clearInterval(camTimerInterval);
    document.getElementById('camBtn').classList.remove('animate-pulse');
    document.getElementById('camTimerDisplay').classList.add('hidden');
    stopCustomCamera();
}

function startVoiceTimer() {
    voiceSeconds = 0; 
    document.getElementById('recordTimer').innerText = "00:00";
    document.getElementById('textInputWrapper').classList.add('hidden');
    document.getElementById('recordingTimerUI').classList.remove('hidden');
    document.getElementById('recordingTimerUI').classList.add('flex');
    
    voiceTimerInterval = setInterval(() => {
        voiceSeconds++; 
        const m = Math.floor(voiceSeconds / 60).toString().padStart(2, '0');
        const s = (voiceSeconds % 60).toString().padStart(2, '0');
        document.getElementById('recordTimer').innerText = `${m}:${s}`;
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
    
    if (!navigator.mediaDevices) { return Dialog.show("Error", "Microphone access blocked.", "alert"); }

    try {
        if (!audioRecorder || audioRecorder.state === "inactive") {
            const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioRecorder = new MediaRecorder(aStream); 
            audioChunks = [];
            audioRecorder.ondataavailable = e => audioChunks.push(e.data);
            audioRecorder.onstop = () => { 
                addToDraft('voice', new Blob(audioChunks, { type: 'audio/webm' })); 
                aStream.getTracks().forEach(track => track.stop()); 
                stopVoiceTimer(); 
            };
            audioRecorder.start(); 
            startVoiceTimer();
            // UI COLOR CONTROL: Recording ke doran button ka blinking red color CSS file mein (.voice-active) hai
            vBtn.classList.add('voice-active'); 
            micIcon.className = 'fas fa-stop';
        } else {
            audioRecorder.stop(); 
            vBtn.classList.remove('voice-active'); 
            micIcon.className = 'fas fa-microphone';
        }
    } catch (e) { Dialog.show("Error", "Please allow microphone permission.", "alert"); }
}
