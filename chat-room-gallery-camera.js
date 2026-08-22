// =========================================================
// GALLERY & CAMERA MODULE
// =========================================================

// =========================================================
// ADVANCED MEDIA PREVIEW (Draw + Crop + Send)
// =========================================================
let pendingMediaFile = null;
let pendingMediaType = 'image';
let canvasImage = null;
let canvas = null;
let ctx = null;

// Drawing state
let isDrawingMode = false;
let isDrawing = false;
let currentTool = 'pen';
let drawColor = '#ff0000';
let startX, startY;
let drawings = [];

// Crop state
let isCropMode = false;
let cropBox = null;
let cropOverlay = null;
let cropDragState = null;

// HD / Rotate state (naye toolbar tools)
let isHdMode = false;
let currentRotation = 0; // 0, 90, 180, 270

// 1. Preview open karne ka function
async function previewChatMedia(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    pendingMediaFile = file;
    pendingMediaType = file.type.startsWith('video') ? 'video' : 'image';

    const ui = document.getElementById('mediaPreviewUI');
    const captionInput = document.getElementById('mediaCaptionInput');
    if (captionInput) captionInput.value = '';

    const url = URL.createObjectURL(file);
    
    if (pendingMediaType === 'image') {
        ui.classList.remove('hidden');
        ui.style.display = 'flex';
        
        canvasImage = new Image();
        canvasImage.onload = () => {
            setupCanvas(canvasImage);
            resetEditorState();
        };
        canvasImage.onerror = () => {
            ui.classList.add('hidden');
            alert("Image could not be loaded. Please try again.");
        };
        canvasImage.src = url;
    } else {
        // Video preview
        const vid = document.getElementById('mediaPreviewVideo');
        vid.src = url;
        vid.classList.remove('hidden');
        vid.style.display = 'block';
        document.getElementById('mediaPreviewImg').classList.add('hidden');
        document.getElementById('imageCanvas').classList.add('hidden');
        document.getElementById('toggleDrawBtn').classList.add('hidden');
        document.getElementById('toggleCropBtn').classList.add('hidden');
        document.getElementById('drawingTools').classList.add('hidden');
        document.getElementById('captionBar').classList.remove('hidden');
        document.getElementById('editorTopBar').style.display = 'flex';
        document.getElementById('captionBar').style.display = 'block';
        // Note: canvasContainer.innerHTML ko clear NAHI karte - warna imageCanvas/mediaPreviewImg
        // permanently DOM se hat jate, aur agli baar image preview kaam karna band ho jata
        ui.classList.remove('hidden');
        ui.style.display = 'flex';
    }

    input.value = '';
}

// 2. Setup Canvas with Image
function setupCanvas(img) {
    canvas = document.getElementById('imageCanvas');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    canvas.classList.remove('hidden');
    canvas.style.display = 'block';
    
    // 🟢 FIXED: Better size calculation for all image types
    const containerWidth = document.getElementById('canvasContainer').clientWidth || window.innerWidth;
    const containerHeight = document.getElementById('canvasContainer').clientHeight || window.innerHeight - 200;
    
    let width = img.width;
    let height = img.height;
    
    // Fit image within container while maintaining aspect ratio
    const ratioX = containerWidth / width;
    const ratioY = containerHeight / height;
    const ratio = Math.min(ratioX, ratioY, 1); // Don't upscale
    
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
    
    canvas.width = width;
    canvas.height = height;
    
    // Center canvas
    canvas.style.margin = 'auto';
    canvas.style.position = 'absolute';
    canvas.style.top = '50%';
    canvas.style.left = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
    
    ctx.drawImage(img, 0, 0, width, height);
    
    // Show UI elements
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.style.display = 'block';
        canvasContainer.style.position = 'relative';
    }
    
    const editorTopBar = document.getElementById('editorTopBar');
    if (editorTopBar) editorTopBar.style.display = 'flex';
    
    const captionBar = document.getElementById('captionBar');
    if (captionBar) {
        captionBar.classList.remove('hidden');
        captionBar.style.display = 'block';
    }
    
    setupCanvasEvents();
}

// 3. Canvas Event Listeners
function setupCanvasEvents() {
    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;
    
    canvas.addEventListener('mousedown', (e) => {
        if (!isDrawingMode || isCropMode) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        startX = (e.clientX - rect.left) * (canvas.width / rect.width);
        startY = (e.clientY - rect.top) * (canvas.height / rect.height);
        drawings.push({ tool: currentTool, color: drawColor, startX, startY, endX: startX, endY: startY });
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || isCropMode) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        drawings[drawings.length - 1].endX = x;
        drawings[drawings.length - 1].endY = y;
        redrawCanvas();
    });

    canvas.addEventListener('mouseup', () => { isDrawing = false; });
    canvas.addEventListener('mouseleave', () => { isDrawing = false; });

    canvas.addEventListener('touchstart', (e) => {
        if (!isDrawingMode || isCropMode) return;
        e.preventDefault();
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        startX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        startY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        drawings.push({ tool: currentTool, color: drawColor, startX, startY, endX: startX, endY: startY });
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!isDrawing || isCropMode) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        drawings[drawings.length - 1].endX = x;
        drawings[drawings.length - 1].endY = y;
        redrawCanvas();
    });

    canvas.addEventListener('touchend', () => { isDrawing = false; });
}

// 4. Reset Editor
function resetEditorState() {
    isDrawingMode = false;
    isCropMode = false;
    drawings = [];
    document.getElementById('drawingTools').classList.add('hidden');
    document.getElementById('toggleDrawBtn').classList.remove('bg-[#0077b9]');
    document.getElementById('toggleDrawBtn').classList.add('bg-white/10');
    document.getElementById('toggleCropBtn').classList.remove('bg-[#0077b9]');
    document.getElementById('toggleCropBtn').classList.add('bg-white/10');
    document.getElementById('applyCropBtn').classList.add('hidden');
    document.getElementById('captionBar').classList.remove('hidden');
    cropBox = document.getElementById('cropBox');
    cropOverlay = document.getElementById('cropOverlay');
    if (cropBox) cropBox.classList.add('hidden');
    if (cropOverlay) cropOverlay.classList.add('hidden');
    setupCropBoxEvents();
    document.getElementById('imageCanvas').classList.remove('drawing-mode');
}

function setupCropBoxEvents() {
    if (!cropBox) return;
    cropBox.onmousedown = null;
    cropBox.addEventListener('mousedown', (e) => {
        if (!isCropMode) return;
        e.stopPropagation();
        cropDragState = {
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            startLeft: cropBox.offsetLeft,
            startTop: cropBox.offsetTop
        };
    });
}

// 5. Drawing Functions
function toggleDrawingMode() {
    if (isCropMode) toggleCropMode();
    isDrawingMode = !isDrawingMode;
    const tools = document.getElementById('drawingTools');
    const btn = document.getElementById('toggleDrawBtn');
    
    if (isDrawingMode) {
        tools.classList.remove('hidden');
        btn.classList.add('bg-[#0077b9]');
        btn.classList.remove('bg-white/10');
        canvas.classList.add('drawing-mode');
        document.getElementById('captionBar').classList.add('hidden');
        setDrawingTool('pen');
    } else {
        tools.classList.add('hidden');
        btn.classList.remove('bg-[#0077b9]');
        btn.classList.add('bg-white/10');
        canvas.classList.remove('drawing-mode');
        document.getElementById('captionBar').classList.remove('hidden');
    }
}

function setDrawingTool(tool) {
    currentTool = tool;
    document.querySelectorAll('#drawingTools button[id$="Tool"]').forEach(btn => {
        btn.classList.add('bg-white/10');
        btn.classList.remove('bg-[#0077b9]');
    });
    const activeBtn = document.getElementById(tool + 'Tool');
    if (activeBtn) {
        activeBtn.classList.add('bg-[#0077b9]');
        activeBtn.classList.remove('bg-white/10');
    }
}

function setDrawingColor() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'];
    const current = document.getElementById('currentColor');
    const idx = colors.indexOf(drawColor);
    drawColor = colors[(idx + 1) % colors.length];
    if (current) current.style.backgroundColor = drawColor;
}

function redrawCanvas() {
    if (!ctx || !canvasImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvasImage, 0, 0, canvas.width, canvas.height);
    
    drawings.forEach(d => {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 3;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        
        if (d.tool === 'pen') {
            ctx.moveTo(d.startX, d.startY);
            ctx.lineTo(d.endX, d.endY);
        } else if (d.tool === 'circle') {
            const radius = Math.sqrt(Math.pow(d.endX - d.startX, 2) + Math.pow(d.endY - d.startY, 2));
            ctx.ellipse(d.startX, d.startY, radius, radius, 0, 0, 2 * Math.PI);
        } else if (d.tool === 'arrow') {
            const angle = Math.atan2(d.endY - d.startY, d.endX - d.startX);
            ctx.moveTo(d.startX, d.startY);
            ctx.lineTo(d.endX, d.endY);
            ctx.lineTo(d.endX - 10 * Math.cos(angle - Math.PI / 6), d.endY - 10 * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(d.endX, d.endY);
            ctx.lineTo(d.endX - 10 * Math.cos(angle + Math.PI / 6), d.endY - 10 * Math.sin(angle + Math.PI / 6));
        }
        ctx.stroke();
    });
}

function undoDrawing() {
    drawings.pop();
    redrawCanvas();
}

// 6. Crop Functions
function toggleCropMode() {
    if (isDrawingMode) toggleDrawingMode();
    isCropMode = !isCropMode;
    cropBox = document.getElementById('cropBox');
    cropOverlay = document.getElementById('cropOverlay');
    const btn = document.getElementById('toggleCropBtn');
    const applyBtn = document.getElementById('applyCropBtn');
    
    if (isCropMode) {
        btn.classList.add('bg-[#0077b9]');
        btn.classList.remove('bg-white/10');
        applyBtn.classList.remove('hidden');
        cropOverlay.classList.remove('hidden');
        cropBox.classList.remove('hidden');
        document.getElementById('captionBar').classList.add('hidden');
        document.getElementById('toggleDrawBtn').classList.add('hidden');
    } else {
        btn.classList.remove('bg-[#0077b9]');
        btn.classList.add('bg-white/10');
        applyBtn.classList.add('hidden');
        cropOverlay.classList.add('hidden');
        cropBox.classList.add('hidden');
        document.getElementById('captionBar').classList.remove('hidden');
        document.getElementById('toggleDrawBtn').classList.remove('hidden');
    }
}

document.addEventListener('mousemove', (e) => {
    if (!cropDragState) return;
    const dx = e.clientX - cropDragState.startX;
    const dy = e.clientY - cropDragState.startY;
    cropBox.style.left = (cropDragState.startLeft + dx) + 'px';
    cropBox.style.top = (cropDragState.startTop + dy) + 'px';
    cropBox.style.transform = 'none';
});

document.addEventListener('mouseup', () => { cropDragState = null; });

function applyCrop() {
    if (!isCropMode || !canvasImage) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();
    
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    
    const sx = (boxRect.left - canvasRect.left) * scaleX;
    const sy = (boxRect.top - canvasRect.top) * scaleY;
    const sw = boxRect.width * scaleX;
    const sh = boxRect.height * scaleY;
    
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(canvasImage, sx, sy, sw, sh, 0, 0, sw, sh);
    
    canvasImage = new Image();
    canvasImage.src = canvas.toDataURL();
    toggleCropMode();
}

// =========================================================
// 6.5 NAYE TOOLS: Download, HD, Rotate, Stickers, Text
// =========================================================

// Download - current edited image ko device pe save karo
function downloadEditedImage() {
    if (!canvas) return;
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'faster_image_' + Date.now() + '.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/jpeg', 1.0);
}

// HD toggle - ON hone par bhejte waqt zyada quality (kam compression) use hoti hai
function toggleHdMode() {
    isHdMode = !isHdMode;
    const btn = document.getElementById('hdToggleBtn');
    if (btn) {
        btn.classList.toggle('bg-[#0077b9]', isHdMode);
        btn.classList.toggle('bg-white/10', !isHdMode);
    }
}

// Rotate - image ko 90 degree clockwise ghumao
function rotateImage() {
    if (!canvas || !ctx || !canvasImage) return;

    const w = canvas.width;
    const h = canvas.height;

    // Naya canvas banate hain rotated size ke sath (width/height swap)
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = h;
    rotatedCanvas.height = w;
    const rctx = rotatedCanvas.getContext('2d');
    rctx.translate(h / 2, w / 2);
    rctx.rotate(90 * Math.PI / 180);
    rctx.drawImage(canvas, -w / 2, -h / 2, w, h);

    canvas.width = rotatedCanvas.width;
    canvas.height = rotatedCanvas.height;
    ctx.drawImage(rotatedCanvas, 0, 0);

    // canvasImage ko bhi update karo taake redraw/crop sahi kaam kare
    canvasImage = new Image();
    canvasImage.src = canvas.toDataURL();
    currentRotation = (currentRotation + 90) % 360;
}

// Stickers/Emoji - chhota sa picker dikhao, tap karne pe canvas ke center mein stamp ho jaye
const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😍', '👏'];
function toggleStickerPicker() {
    let picker = document.getElementById('stickerPicker');
    if (picker) { picker.remove(); return; }

    picker = document.createElement('div');
    picker.id = 'stickerPicker';
    picker.className = 'absolute top-16 left-1/2 -translate-x-1/2 bg-[#1a1a1a] rounded-2xl p-3 flex gap-2 z-30 shadow-xl flex-wrap max-w-[280px] justify-center';
    QUICK_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.className = 'text-2xl active:scale-90 transition-transform';
        btn.onclick = () => {
            stampEmojiOnCanvas(emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });
    document.getElementById('mediaPreviewUI').appendChild(picker);
}

function stampEmojiOnCanvas(emoji) {
    if (!ctx || !canvas) return;
    const size = Math.min(canvas.width, canvas.height) * 0.18;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Har naye sticker ko thoda offset karte hain taake purane ke upar bilkul na baithe
    const offset = (drawings.length % 4) * 15;
    ctx.fillText(emoji, canvas.width / 2 + offset, canvas.height / 2 + offset);
}

// Text tool (Aa) - prompt se text lo, canvas ke center mein likh do
function addTextToImage() {
    const text = prompt("Text likho:");
    if (!text || !text.trim()) return;
    if (!ctx || !canvas) return;

    const fontSize = Math.max(24, Math.min(canvas.width, canvas.height) * 0.08);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = drawColor;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = fontSize * 0.06;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

// 7. Send Functions
function closeMediaPreview() {
    const ui = document.getElementById('mediaPreviewUI');
    
    // 🟢 FIXED: Force hide all UI elements
    ui.classList.add('hidden');
    ui.style.display = 'none';
    
    // Clear canvas
    if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.classList.add('hidden');
        canvas.style.display = 'none';
    }
    
    // Hide video element
    const vid = document.getElementById('mediaPreviewVideo');
    if (vid) {
        vid.classList.add('hidden');
        vid.style.display = 'none';
        vid.src = '';
    }
    
    // Hide image element
    const img = document.getElementById('mediaPreviewImg');
    if (img) {
        img.classList.add('hidden');
        img.style.display = 'none';
        img.src = '';
    }
    
    // Reset canvas container - sirf style reset karo, children ko DESTROY mat karo
    // (imageCanvas/mediaPreviewVideo/mediaPreviewImg permanent elements hain, dobara banane
    // ki zaroorat nahi honi chahiye - warna agli baar attachment kaam karna band ho jata)
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.style.display = '';
    }
    
    // Hide editor top bar
    const editorTopBar = document.getElementById('editorTopBar');
    if (editorTopBar) {
        editorTopBar.style.display = 'none';
    }
    
    // Hide caption bar
    const captionBar = document.getElementById('captionBar');
    if (captionBar) {
        captionBar.classList.add('hidden');
        captionBar.style.display = 'none';
    }
    
    // Hide drawing tools
    const drawingTools = document.getElementById('drawingTools');
    if (drawingTools) {
        drawingTools.classList.add('hidden');
    }
    
    // Reset state
    pendingMediaFile = null;
    canvasImage = null;
    drawings = [];
    isDrawingMode = false;
    isCropMode = false;
    
    document.getElementById('mediaCaptionInput').value = '';
}
let isSendingMedia = false; // double-tap/double-send guard

// Editor UI ko TURANT aur POORI tarah band karta hai (sirf class change karna kaafi nahi tha -
// inline style="display:flex" already set hoti hai jab editor khulta hai, jo class se override
// nahi hoti - isi wajah se editor "atka hua" dikhta tha aur dobara tap karne pe double-send hota tha)
function hideMediaPreviewUIImmediately() {
    const ui = document.getElementById('mediaPreviewUI');
    ui.classList.add('hidden');
    ui.style.display = 'none';
}

async function sendCaptionedMedia() {
    if (!canvasImage && !pendingMediaFile) return;
    if (isSendingMedia) return; // pehle se bhej rahe hain - dobara tap ko ignore karo
    isSendingMedia = true;

    const caption = document.getElementById('mediaCaptionInput').value.trim();
    
    if (pendingMediaType === 'image' && canvasImage) {
        // Turant (fast, synchronous) low-quality preview - taake bubble bijli ki speed se dikhe
        const instantPreview = canvas.toDataURL('image/jpeg', 0.5);
        // Poori quality wali file background mein banao (Promise - slow ho sakta hai, wait nahi karte)
        const filePromise = new Promise(resolve => {
            canvas.toBlob(blob => {
                resolve(new File([blob], 'edited_' + Date.now() + '.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', isHdMode ? 1.0 : 0.9);
        });

        hideMediaPreviewUIImmediately();
        document.getElementById('mediaCaptionInput').value = '';
        await sendMessageWithProgress(caption, filePromise, 'image', instantPreview);
        closeMediaPreview();
        isSendingMedia = false;
        return;
    } else if (pendingMediaType === 'document') {
        const fileToUpload = pendingMediaFile;
        const docName = pendingMediaFile.name;
        const captionWithName = caption ? `${caption}\n📄 ${docName}` : `📄 ${docName}`;
        pendingMediaFile = null;
        hideMediaPreviewUIImmediately();
        document.getElementById('mediaCaptionInput').value = '';
        await sendMessageWithProgress(captionWithName, fileToUpload, 'document');
        closeMediaPreview();
        isSendingMedia = false;
        return;
    } else if (pendingMediaType === 'video') {
        const fileToUpload = pendingMediaFile;
        const videoCaption = caption || '';
        // File already available hai (koi conversion nahi chahiye) - turant preview dikha sakte hain
        const instantPreview = URL.createObjectURL(fileToUpload);
        pendingMediaFile = null;
        hideMediaPreviewUIImmediately();
        document.getElementById('mediaCaptionInput').value = '';
        await sendMessageWithProgress(videoCaption, fileToUpload, 'video', instantPreview);
        closeMediaPreview();
        isSendingMedia = false;
        return;
    } else if (pendingMediaType === 'audio') {
        const fileToUpload = pendingMediaFile;
        const audioCaption = caption || '';
        pendingMediaFile = null;
        hideMediaPreviewUIImmediately();
        document.getElementById('mediaCaptionInput').value = '';
        await sendMessageWithProgress(audioCaption, fileToUpload, 'audio');
        closeMediaPreview();
        isSendingMedia = false;
        return;
    }
    
    const fileToUpload = pendingMediaFile;
    pendingMediaFile = null;
    hideMediaPreviewUIImmediately();
    document.getElementById('mediaCaptionInput').value = '';
    await sendMessageWithProgress(caption || '', fileToUpload, pendingMediaType);
    closeMediaPreview();
    isSendingMedia = false;
}

// 8. Gallery/Camera Pick Handler
async function handleGalleryPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    
    if (file.type.startsWith('image/')) {
        await previewChatMedia(input);
    } else if (file.type.startsWith('video/')) {
        pendingMediaFile = file;
        pendingMediaType = 'video';
        
        const ui = document.getElementById('mediaPreviewUI');
        const vid = document.getElementById('mediaPreviewVideo');
        const img = document.getElementById('mediaPreviewImg');
        const captionInput = document.getElementById('mediaCaptionInput');
        
        captionInput.value = '';
        const url = URL.createObjectURL(file);
        vid.src = url;
        vid.classList.remove('hidden');
        img.classList.add('hidden');
        
        document.getElementById('imageCanvas').classList.add('hidden');
        document.getElementById('toggleDrawBtn').classList.add('hidden');
        document.getElementById('toggleCropBtn').classList.add('hidden');
        document.getElementById('applyCropBtn').classList.add('hidden');
        document.getElementById('drawingTools').classList.add('hidden');
        document.getElementById('captionBar').classList.remove('hidden');
        document.getElementById('editorTopBar').style.display = 'flex';
        document.getElementById('captionBar').style.display = 'block';
        // Note: canvasContainer.innerHTML clear NAHI karte (vid already static child hai HTML mein)

        ui.classList.remove('hidden');
        input.value = '';
    }
}
