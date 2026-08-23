// =========================================================
// global-message-notify.js
// Kaam: Chahe customer app ke kisi bhi page pe ho (home, wallet, new-order,
// profile wagera), naya message aane par ringtone bajaye - bilkul WhatsApp
// jaisa. Sirf contacts.html/chat-room.html tak mehdood nahi.
// =========================================================

(function() {
    async function setupGlobalMessageListener() {
        const myId = localStorage.getItem('faster_customer_id');
        if (!myId || typeof _supabase === 'undefined') return;

        // Sab conversation_ids nikalo jinka main hissa hoon
        const { data: myConvs, error } = await _supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', String(myId));

        if (error || !myConvs) return;
        const myConvIds = new Set(myConvs.map(c => String(c.conversation_id)));

        _supabase.channel('global-notify-' + Date.now())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const msg = payload.new;
                if (String(msg.sender_id) === String(myId)) return; // apna khud ka message mat bajao
                if (!myConvIds.has(String(msg.conversation_id))) return; // sirf apni chats ka

                const sound = document.getElementById('notifSound');
                if (sound) {
                    sound.currentTime = 0;
                    sound.play().catch(() => {}); // agar autoplay block ho to chup chaap ignore karo
                }
            })
            .subscribe();
    }

    // _supabase client load hone ka wait karo (kuch pages mein thoda late define hota hai)
    if (typeof _supabase !== 'undefined') {
        setupGlobalMessageListener();
    } else {
        window.addEventListener('load', () => {
            setTimeout(setupGlobalMessageListener, 500);
        });
    }
})();
