/**
 * chat-room-audio.js - Audio FILE picker (gallery se audio file select karna)
 *
 * NOTE: Live voice-recording (mic button) is chat-room.js mein already sahi tarah
 * implement hai (handleChatVoice, stopVoiceRecording, cancelVoiceRecording,
 * toggleVoicePause, sendRecordedVoice) - unhe yahan dobara define NAHI karna,
 * warna woh sahi wali functions ko overwrite kar dete the (jo pehle bug tha).
 * Yeh file sirf "Attach -> Audio" (device se audio FILE pick karna) handle karti hai.
 */

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
        await sendMessageWithProgress('', file, 'voice');
    } catch (err) {
        console.error("Audio upload error:", err);
        alert("Failed to upload audio: " + (err.message || err));
    } finally {
        isUploading = false;
        input.value = "";
    }
}
