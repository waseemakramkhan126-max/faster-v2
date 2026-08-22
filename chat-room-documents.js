/**
 * chat-room-documents.js - Document sharing (R2 upload, current messages/conversationId system)
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
        await sendMessageWithProgress(file.name || 'Document', file, 'document');
    } catch (err) {
        console.error("Document upload error:", err);
        alert("Failed to upload document: " + (err.message || err));
    } finally {
        isUploading = false;
        if (sendBtn) sendBtn.disabled = false;
        input.value = "";
    }
}
