// =========================================================
// AUDIO MODULE
// =========================================================

// Open Audio Picker
function openAudio() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenAudioInput').click();
    }, 350);
}

// Audio Pick Handler
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
    
    // Safely hide elements
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
    
    // Set audio preview content
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
    
    // Force show UI
    ui.classList.remove('hidden');
    ui.style.display = 'flex';
    console.log("✅ Audio preview opened:", file.name);
    
    input.value = '';
}
