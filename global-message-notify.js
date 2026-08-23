// =========================================================
// global-message-notify.js
// Kaam: Chahe customer app ke kisi bhi page pe ho (home, wallet, new-order,
// profile wagera), naya message aane par ringtone bajaye - bilkul WhatsApp
// jaisa. Sirf contacts.html/chat-room.html tak mehdood nahi.
// =========================================================

(function() {
    let attempts = 0;
    let alreadySubscribed = false; // duplicate channel/double-sound se bachne ke liye

    async function setupGlobalMessageListener() {
        if (alreadySubscribed) return; // pehle se ho chuka hai, dobara mat karo
        attempts++;
        const myId = localStorage.getItem('faster_customer_id');

        // Agar _supabase ya myId abhi tak ready nahi hai, thodi der baad dobara try karo
        // (fresh/direct page-load ke waqt kabhi kabhi timing miss ho jati thi)
        if (!myId || typeof _supabase === 'undefined') {
            if (attempts < 10) setTimeout(setupGlobalMessageListener, 300);
            return;
        }

        try {
            // Sab conversation_ids nikalo jinka main hissa hoon
            const { data: myConvs, error } = await _supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', String(myId));

            if (alreadySubscribed) return; // is beech mein koi doosra attempt safal ho gaya ho
            if (error || !myConvs) {
                if (attempts < 10) setTimeout(setupGlobalMessageListener, 500);
                return;
            }

            alreadySubscribed = true;
            const myConvIds = new Set(myConvs.map(c => String(c.conversation_id)));
            console.log('[global-notify] Setup ho gaya, conversations:', myConvIds.size, 'myId:', myId);

            _supabase.channel('global-notify-' + Date.now())
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                    console.log('[global-notify] NAYA MESSAGE MILA:', payload.new);
                    const msg = payload.new;
                    if (String(msg.sender_id) === String(myId)) { console.log('[global-notify] Apna hi message hai, skip'); return; }
                    if (!myConvIds.has(String(msg.conversation_id))) { console.log('[global-notify] Yeh meri conversation nahi hai, skip'); return; }

                    console.log('[global-notify] Ring bajane ki koshish kar raha hoon...');
                    const sound = document.getElementById('notifSound');
                    if (sound) {
                        sound.currentTime = 0;
                        sound.play().then(() => {
                            console.log('[global-notify] ✅ Sound bilkul bajayi!');
                        }).catch((err) => {
                            console.log('[global-notify] ❌ Sound bajane mein error:', err.message);
                        });
                    } else {
                        console.log('[global-notify] ❌ #notifSound element hi nahi mila is page pe!');
                    }
                })
                .subscribe((status) => {
                    console.log('[global-notify] Channel status:', status);
                });
        } catch (e) {
            if (attempts < 10 && !alreadySubscribed) setTimeout(setupGlobalMessageListener, 500);
        }
    }

    // Turant try karo, aur DOM/load events pe bhi (jo bhi pehle mile) - guard flag
    // duplicate subscription rok deta hai chahe multiple triggers chalein
    setupGlobalMessageListener();
    document.addEventListener('DOMContentLoaded', setupGlobalMessageListener);
    window.addEventListener('load', () => setTimeout(setupGlobalMessageListener, 300));
})();

