// R2 MIGRATION
/**
 * chat-room-documents.js - Document sharing with Cloudflare R2 migration
 */

function openDocuments() {
    closeAttachPopup();
    const input = document.getElementById('hiddenDocumentInput');
    if (input) input.click();
}

async function handleDocumentPick(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (file.size > 50 * 1024 * 1024) {
        alert("Document size must be less than 50MB.");
        input.value = "";
        return;
    }

    if (!navigator.onLine || isUploading) {
        alert("No internet connection!");
        input.value = "";
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
            message: file.name || 'Document',
            type: 'doc',
            file_url: publicUrl,
            status: 'sent'
        }]);

        if (error) throw error;
        await loadMessages();
    } catch (err) {
        console.error("Document upload error:", err);
        alert("Failed to upload document: " + (err.message || err));
    } finally {
        isUploading = false;
        if (sendBtn) sendBtn.disabled = false;
        input.value = "";
    }
}
