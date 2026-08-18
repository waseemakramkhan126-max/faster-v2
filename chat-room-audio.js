// R2 MIGRATION
/**
 * chat-room-audio.js - Audio recording & sharing with Cloudflare R2 migration
 */

let mediaRecorder = null;
let audioRecordChunks = [];
let audioTimerInterval = null;
let audioSeconds = 0;
let isAudioPaused = false;

function openAudio() {
    closeAttachPopup();
    const input = document.getElementById('hiddenAudioInput');
    if (input) input.click();
}

async function handleAudioPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (file.size > 50 * 1024 * 1024) {
        alert("Audio file must be less than 50MB.");
        input.value = "";
        return;
    }

    if (!navigator.onLine || isUploading) {
        alert("No internet connection!");
        input.value = "";
        return;
    }

    isUploading = true;
    try {
        const publicUrl = await uploadFileToR2(file, 'fhd-chat-media');
        await _supabase.from('order_chats').insert([{
            order_id: orderId,
            sender_phone: userPhone,
            message: 'Audio Recording',
            type: 'voice',
            file_url: publicUrl,
            status: 'sent'
        }]);
        await loadMessages();
    } catch (err) {
        console.error("Audio upload error:", err);
        alert("Failed to upload audio: " + (err.message || err));
    } finally {
        isUploading = false;
        input.value = "";
    }
}

async function handleChatVoice() {
    if (isUploading) return;
    if (!navigator.onLine) {
        alert("No internet connection!");
        return;
    }

    const recUI = document.getElementById('voiceRecorderUI');
    const timerDisplay = document.getElementById('voiceTimerDisplay');
    const waveform = document.getElementById('voiceWaveform');

    try {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioRecordChunks = [];

            mediaRecorder.ondataavailable = e => audioRecordChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioRecordChunks, { type: 'audio/webm' });
                if (blob.size > 0) {
                    await uploadAndSendRecordedAudio(blob);
                }
            };

            mediaRecorder.start();
            if (recUI) {
                recUI.classList.remove('hidden');
                recUI.classList.add('flex');
            }
            if (waveform) waveform.classList.add('recording');

            audioSeconds = 0;
            if (timerDisplay) timerDisplay.innerText = "00:00";
            audioTimerInterval = setInterval(() => {
                if (!isAudioPaused) {
                    audioSeconds++;
                    const m = Math.floor(audioSeconds / 60).toString().padStart(2, '0');
                    const s = (audioSeconds % 60).toString().padStart(2, '0');
                    if (timerDisplay) timerDisplay.innerText = `${m}:${s}`;
                }
            }, 1000);

        } else {
            stopVoiceRecording();
        }
    } catch (err) {
        console.error("Microphone error:", err);
        alert("Microphone permission denied or unavailable.");
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    clearInterval(audioTimerInterval);
    const recUI = document.getElementById('voiceRecorderUI');
    const waveform = document.getElementById('voiceWaveform');
    if (recUI) {
        recUI.classList.add('hidden');
        recUI.classList.remove('flex');
    }
    if (waveform) waveform.classList.remove('recording');
    isAudioPaused = false;
}

function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
    }
    clearInterval(audioTimerInterval);
    const recUI = document.getElementById('voiceRecorderUI');
    if (recUI) {
        recUI.classList.add('hidden');
        recUI.classList.remove('flex');
    }
    isAudioPaused = false;
}

function toggleVoicePause() {
    isAudioPaused = !isAudioPaused;
    if (mediaRecorder) {
        if (isAudioPaused && mediaRecorder.state === "recording") {
            mediaRecorder.pause();
        } else if (!isAudioPaused && mediaRecorder.state === "paused") {
            mediaRecorder.resume();
        }
    }
    const icon = document.getElementById('voicePauseIcon');
    const text = document.getElementById('voicePauseText');
    if (icon) icon.className = isAudioPaused ? 'fas fa-play' : 'fas fa-pause';
    if (text) text.innerText = isAudioPaused ? 'Resume' : 'Pause';
}

function sendRecordedVoice() {
    stopVoiceRecording();
}

async function uploadAndSendRecordedAudio(blob) {
    if (!navigator.onLine || isUploading) return;
    isUploading = true;

    try {
        const audioFile = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        const publicUrl = await uploadFileToR2(audioFile, 'fhd-chat-media');

        const { error } = await _supabase.from('order_chats').insert([{
            order_id: orderId,
            sender_phone: userPhone,
            message: 'Voice Note',
            type: 'voice',
            file_url: publicUrl,
            status: 'sent'
        }]);

        if (error) throw error;
        await loadMessages();
    } catch (err) {
        console.error("Voice upload error:", err);
        alert("Failed to send voice note: " + (err.message || err));
    } finally {
        isUploading = false;
    }
}
