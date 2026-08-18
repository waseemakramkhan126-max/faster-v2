// R2 MIGRATION
/**
 * chat-room-gallery-camera.js - Gallery picker, Camera & Media Preview with Cloudflare R2
 */

let selectedMediaFile = null;
let mediaType = 'image';
let drawingMode = false;
let currentDrawingTool = 'pen';
let currentColorHex = '#ef4444';
let canvasHistory = [];

function openGallery() {
    closeAttachPopup();
    const input = document.getElementById('hiddenGalleryInput');
    if (input) input.click();
}

function openCamera() {
    closeAttachPopup();
    const input = document.getElementById('hiddenCameraInput');
    if (input) input.click();
}

async function handleGalleryPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    
    if (file.size > 50 * 1024 * 1024) {
        alert("File size must be less than 50MB.");
        input.value = "";
        return;
    }

    selectedMediaFile = file;
    mediaType = file.type.startsWith('video') ? 'video' : 'image';

    if (mediaType === 'image') {
        openMediaPreview(file);
    } else {
        await uploadAndSendMedia(file, 'video');
    }
    input.value = "";
}

function openMediaPreview(file) {
    const previewUI = document.getElementById('mediaPreviewUI');
    if (!previewUI) return;
    previewUI.classList.remove('hidden');
    previewUI.classList.add('flex');

    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();

    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            saveCanvasState();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function closeMediaPreview() {
    const previewUI = document.getElementById('mediaPreviewUI');
    if (previewUI) {
        previewUI.classList.add('hidden');
        previewUI.classList.remove('flex');
    }
    selectedMediaFile = null;
}

async function sendCaptionedMedia() {
    if (!selectedMediaFile || isUploading) return;
    const captionInput = document.getElementById('mediaCaptionInput');
    const caption = captionInput ? captionInput.value.trim() : '';
    if (captionInput) captionInput.value = '';

    const canvas = document.getElementById('imageCanvas');
    if (drawingMode && canvas) {
        canvas.toBlob(async (blob) => {
            if (blob) {
                const editedFile = new File([blob], selectedMediaFile.name || 'image.jpg', { type: 'image/jpeg' });
                await uploadAndSendMedia(editedFile, 'image', caption);
            }
        }, 'image/jpeg', 0.9);
    } else {
        await uploadAndSendMedia(selectedMediaFile, 'image', caption);
    }
    closeMediaPreview();
}

async function uploadAndSendMedia(file, type, caption = '') {
    if (!navigator.onLine || isUploading) {
        alert("No internet connection!");
        return;
    }

    isUploading = true;
    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        // Upload to Cloudflare R2 bucket 'fhd-chat-media'
        const publicUrl = await uploadFileToR2(file, 'fhd-chat-media');

        const { error } = await _supabase.from('order_chats').insert([{
            order_id: orderId,
            sender_phone: userPhone,
            message: caption,
            type: type,
            file_url: publicUrl,
            status: 'sent'
        }]);

        if (error) throw error;
        await loadMessages();
    } catch (err) {
        console.error("Media upload error:", err);
        alert("Failed to upload media: " + (err.message || err));
    } finally {
        isUploading = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function saveCanvasState() {
    const canvas = document.getElementById('imageCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvasHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undoDrawing() {
    if (canvasHistory.length <= 1) return;
    canvasHistory.pop();
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const prevState = canvasHistory[canvasHistory.length - 1];
    ctx.putImageData(prevState, 0, 0);
}

function toggleDrawingMode() {
    drawingMode = !drawingMode;
    const tools = document.getElementById('drawingTools');
    const canvas = document.getElementById('imageCanvas');
    if (tools) tools.classList.toggle('hidden', !drawingMode);
    if (canvas) canvas.classList.toggle('drawing-mode', drawingMode);
}

function setDrawingTool(tool) {
    currentDrawingTool = tool;
}

function setDrawingColor() {
    currentColorHex = currentColorHex === '#ef4444' ? '#22c55e' : currentColorHex === '#22c55e' ? '#3b82f6' : '#ef4444';
    const indicator = document.getElementById('currentColor');
    if (indicator) indicator.style.backgroundColor = currentColorHex;
}

function toggleCropMode() {
    const cropBox = document.getElementById('cropBox');
    const overlay = document.getElementById('cropOverlay');
    const applyBtn = document.getElementById('applyCropBtn');
    if (cropBox && overlay) {
        cropBox.classList.toggle('hidden');
        overlay.classList.toggle('hidden');
        if (applyBtn) applyBtn.classList.toggle('hidden');
    }
}

function applyCrop() {
    toggleCropMode();
}

function openMediaViewer(url, type) {
    const viewer = document.getElementById('mediaViewer');
    const content = document.getElementById('mediaViewerContent');
    if (!viewer || !content) return;

    content.innerHTML = type === 'image' 
        ? `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg">`
        : `<video src="${url}" controls autoplay class="max-w-full max-h-full rounded-lg"></video>`;
    
    viewer.classList.remove('hidden');
    viewer.classList.add('flex');
}

function closeMediaViewer() {
    const viewer = document.getElementById('mediaViewer');
    if (viewer) {
        viewer.classList.add('hidden');
        viewer.classList.remove('flex');
    }
}
