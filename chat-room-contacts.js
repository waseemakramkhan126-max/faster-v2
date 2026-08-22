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
                // contact.name aur contact.tel ARRAYS hote hain (Contact Picker API standard),
                // seedha template mein daalne se poora array ".toString()" ho jata tha jo comma
                // se saare entries jod deta - isi wajah se number 2 baar dikh raha tha
                const name = (Array.isArray(contact.name) ? contact.name[0] : contact.name) || 'Unknown';
                const phone = (Array.isArray(contact.tel) ? contact.tel[0] : contact.tel) || '';
                
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
