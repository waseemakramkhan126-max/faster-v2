// =========================================================
// CONTACTS MODULE
// =========================================================

// Share Contact
async function shareContact() {
    closeAttachPopup();
    
    if ('contacts' in navigator && 'select' in navigator.contacts) {
        try {
            const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const name = contact.name || 'Unknown';
                const phone = contact.tel || '';
                
                const contactMsg = `👤 Contact: ${name}\n📞 ${phone}`;
                await sendMessage(contactMsg);
            }
        } catch (err) {
            console.error("Contact selection failed:", err);
            alert("Contact access denied.");
        }
    } else {
        // Manual contact share prompt
        const name = prompt("Enter contact name:");
        if (!name) return;
        const phone = prompt("Enter phone number:");
        if (!phone) return;
        const contactMsg = `👤 Contact: ${name}\n📞 ${phone}`;
        await sendMessage(contactMsg);
    }
}
