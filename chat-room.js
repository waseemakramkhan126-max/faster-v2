// R2 MIGRATION
/**
 * chat-room.js - Main chat room controller with Cloudflare R2 migration
 */

const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('orderId') || urlParams.get('order_id') || localStorage.getItem('faster_active_order_id');
const userPhone = (localStorage.getItem('faster_phone') || "").trim();

let isUploading = false;
let currentMessages = [];

document.addEventListener("DOMContentLoaded", () => {
    if (!userPhone) {
        window.location.replace('index.html');
        return;
    }
    initChatRoom();
    setupUploadListeners();
});

async function initChatRoom() {
    setupOfflineListeners();
    await loadMessages();
    setupRealtimeSubscription();
}

function setupOfflineListeners() {
    const banner = document.getElementById('offlineBanner');
    window.addEventListener('offline', () => {
        if (banner) banner.style.top = '0';
    });
    window.addEventListener('online', () => {
        if (banner) banner.style.top = '-50px';
        loadMessages();
    });
}

async function loadMessages() {
    if (!navigator.onLine || !orderId) return;

    try {
        const { data, error } = await _supabase
            .from('order_chats')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        currentMessages = data || [];
        renderMessages(currentMessages);
        markMessagesAsSeen();
    } catch (err) {
        console.error("Error loading messages:", err);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = messages.map(msg => {
        const isSent = msg.sender_phone === userPhone;
        const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        
        let contentHtml = '';
        if (msg.type === 'image' && msg.file_url) {
            contentHtml = `<img src="${msg.file_url}" class="rounded-lg max-h-60 w-full object-cover cursor-pointer mb-1 shadow-sm" onclick="openMediaViewer('${msg.file_url}', 'image')">`;
        } else if (msg.type === 'video' && msg.file_url) {
            contentHtml = `<video src="${msg.file_url}" controls class="rounded-lg max-h-60 w-full object-cover mb-1 shadow-sm"></video>`;
        } else if (msg.type === 'voice' && msg.file_url) {
            contentHtml = `<div class="py-1"><audio controls src="${msg.file_url}" class="h-8 w-48"></audio></div>`;
        } else if (msg.type === 'doc' && msg.file_url) {
            contentHtml = `<a href="${msg.file_url}" target="_blank" class="flex items-center gap-2 p-2 bg-black/5 rounded-lg text-xs font-bold text-blue-600 underline"><i class="fas fa-file-alt text-lg"></i> View Document</a>`;
        } else if (msg.type === 'location' && msg.file_url) {
            contentHtml = `
                <div class="location-preview mb-1 cursor-pointer" onclick="window.open('${msg.file_url}', '_blank')">
                    <div class="map-placeholder"><i class="fas fa-map-marked-alt text-2xl mr-2"></i> Open Location Map</div>
                    ${msg.message ? `<p class="p-2 text-xs text-white">${msg.message}</p>` : ''}
                </div>
            `;
        }

        if (msg.message && msg.type !== 'location') {
            contentHtml += `<p class="text-sm leading-relaxed">${escapeHtml(msg.message)}</p>`;
        }

        const readReceiptClass = msg.status === 'seen' ? 'read-receipt' : 'read-receipt unread';
        const receiptIcon = isSent ? `<i class="fas fa-check-double ${readReceiptClass}"></i>` : '';

        return `
            <div class="flex flex-col ${isSent ? 'items-end' : 'items-start'} w-full mb-2">
                <div class="bubble ${isSent ? 'bubble-sent' : 'bubble-received'}">
                    ${contentHtml}
                    <div class="bubble-meta">
                        <span>${timeStr}</span>
                        ${receiptIcon}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    scrollToBottom();
}

async function sendChatMessage() {
    const input = document.getElementById('msgInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !orderId) return;

    input.value = '';
    input.style.height = 'auto';

    const tempId = 'temp_' + Date.now();
    const tempMsg = {
        id: tempId,
        order_id: orderId,
        sender_phone: userPhone,
        message: text,
        type: 'text',
        status: 'sent',
        created_at: new Date().toISOString()
    };

    currentMessages.push(tempMsg);
    renderMessages(currentMessages);

    try {
        const { error } = await _supabase.from('order_chats').insert([{
            order_id: orderId,
            sender_phone: userPhone,
            message: text,
            type: 'text',
            status: 'sent'
        }]);

        if (error) throw error;
        await loadMessages();
    } catch (err) {
        console.error("Error sending message:", err);
    }
}

async function markMessagesAsSeen() {
    if (!orderId || !userPhone) return;
    try {
        await _supabase
            .from('order_chats')
            .update({ status: 'seen' })
            .eq('order_id', orderId)
            .neq('sender_phone', userPhone)
            .neq('status', 'seen');
    } catch (err) {
        console.error("Error marking seen:", err);
    }
}

function setupRealtimeSubscription() {
    if (!orderId) return;

    _supabase.channel(`chat-room-${orderId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_chats', filter: `order_id=eq.${orderId}` }, (payload) => {
            loadMessages();
            if (payload.eventType === 'INSERT' && payload.new.sender_phone !== userPhone) {
                playNotificationSound();
            }
        })
        .subscribe();
}

function playNotificationSound() {
    const sound = document.getElementById('notifSound');
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Audio play prevented:", e));
    }
}

function toggleAttachMenu() {
    if (isUploading) return;
    const popup = document.getElementById('attachPopup');
    const overlay = document.getElementById('attachPopupOverlay');
    const plusIcon = document.getElementById('plusIcon');

    if (popup && overlay) {
        const isHidden = popup.classList.contains('hidden');
        if (isHidden) {
            popup.classList.remove('hidden');
            overlay.classList.remove('hidden');
            setTimeout(() => popup.style.transform = 'translateY(0)', 10);
            if (plusIcon) plusIcon.style.transform = 'rotate(45deg)';
        } else {
            closeAttachPopup();
        }
    }
}

function closeAttachPopup() {
    const popup = document.getElementById('attachPopup');
    const overlay = document.getElementById('attachPopupOverlay');
    const plusIcon = document.getElementById('plusIcon');

    if (popup && overlay) {
        popup.style.transform = 'translateY(100%)';
        setTimeout(() => {
            popup.classList.add('hidden');
            overlay.classList.add('hidden');
        }, 300);
        if (plusIcon) plusIcon.style.transform = 'rotate(0deg)';
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Universal Cloudflare R2 Upload Helper with Presigned URLs
 * Bucket Mappings:
 * - Chat Images, Videos, Documents, Voice Notes -> 'fhd-chat-media'
 * - Order Files, Invoices, Attachments -> 'fhd-order-attachments'
 */
async function uploadFileToR2(file, bucketName = 'fhd-chat-media') {
    if (!file) throw new Error("No file provided for upload");

    // Validate file size < 50MB
    if (file.size > 50 * 1024 * 1024) {
        throw new Error("File size exceeds 50MB limit");
    }

    const fileType = file.type || 'application/octet-stream';
    const fileName = `${Date.now()}_${file.name || 'file'}`;

    // 1. Invoke Edge Function 'get-r2-upload-url'
    const { data, error } = await _supabase.functions.invoke('get-r2-upload-url', {
        body: { fileName, fileType, bucket: bucketName }
    });

    if (error || !data || !data.uploadUrl) {
        throw (error || new Error("Failed to get R2 presigned upload URL"));
    }

    // 2. Direct PUT upload to Cloudflare R2
    const uploadRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': fileType }
    });

    if (!uploadRes.ok) {
        throw new Error(`R2 Upload Failed with status ${uploadRes.status}`);
    }

    return data.publicUrl;
}

// R2 MIGRATION - ADD UPLOAD HANDLERS

// 1. File upload karke DB me save karega
async function handleFileUpload(file, type) {
    if (isUploading ||!file) return;
    isUploading = true;
    const sendBtn = document.getElementById('sendMsgBtn'); // YAHAN sendBtn -> sendMsgBtn kiya hai
    const originalBtnHtml = sendBtn? sendBtn.innerHTML : '';
    if(sendBtn) {
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;
    }

    try {
        const publicUrl = await uploadFileToR2(file, 'fhd-chat-media');

        const { error } = await _supabase.from('order_chats').insert([{
            order_id: orderId,
            sender_phone: userPhone,
            message: file.name,
            type: type,
            file_url: publicUrl,
            status: 'sent'
        }]);

        if (error) throw error;
        await loadMessages();
        closeAttachPopup();
    } catch (err) {
        console.error("Upload failed:", err);
        alert("Upload Failed: " + err.message);
    } finally {
        isUploading = false;
        if(sendBtn) {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane text-sm ml-0.5"></i>';
            sendBtn.disabled = false;
        }
    }
}

// Attach buttons ke liye helpers
function openGallery() { document.getElementById('hiddenGalleryInput')?.click(); }
function openCamera() { document.getElementById('hiddenCameraInput')?.click(); }
function openDocuments() { document.getElementById('hiddenDocumentInput')?.click(); }
function openAudio() { document.getElementById('hiddenAudioInput')?.click(); }

// 2. Attach menu ke inputs ko is function se connect karega - SIRF YE WALA RAKHO
function setupUploadListeners() {
    document.getElementById('hiddenGalleryInput')?.addEventListener('change', e => {
        if(e.target.files[0]) {
            const file = e.target.files[0];
            const type = file.type.startsWith('video')? 'video' : 'image';
            handleFileUpload(file, type);
        }
    });
    document.getElementById('hiddenCameraInput')?.addEventListener('change', e => {
        if(e.target.files[0]) handleFileUpload(e.target.files[0], 'image');
    });
    document.getElementById('hiddenDocumentInput')?.addEventListener('change', e => {
        if(e.target.files[0]) handleFileUpload(e.target.files[0], 'doc');
    });
    document.getElementById('hiddenAudioInput')?.addEventListener('change', e => {
        if(e.target.files[0]) handleFileUpload(e.target.files[0], 'voice');
    });
}
