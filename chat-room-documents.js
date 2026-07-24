// =========================================================
// DOCUMENTS MODULE
// =========================================================

// Open Documents Picker
function openDocuments() {
    closeAttachPopup();
    setTimeout(() => {
        document.getElementById('hiddenDocumentInput').click();
    }, 350);
}

// Document Pick Handler
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
    
    // Set document preview content
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
    
    // Force show UI
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
