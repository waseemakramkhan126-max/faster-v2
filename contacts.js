// Supabase Connection
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const myPhone = localStorage.getItem('faster_phone');
const myId = localStorage.getItem('faster_customer_id') || myPhone;

let allChats = [];      // full fetched list, each: {conversationId, otherId, name, phone, avatarUrl, lastMessage, lastAt, lastSenderIsMe, lastType, readAt, unreadCount}
let currentTab = 'all';

// =========================================================
// 1. Search User by Phone (existing feature - kept as-is, only restyled to match dark theme)
// =========================================================
async function searchUser() {
    const phone = document.getElementById('searchPhone').value.trim();
    if(!phone) return alert("Please enter a phone number");

    const { data, error } = await _supabase
        .from('customers')
        .select('customer_id, name, phone')
        .eq('phone', phone)
        .maybeSingle();

    const resultDiv = document.getElementById('searchResult');
    if(error || !data) {
        resultDiv.innerHTML = `<p class="wa-msg error">User not found on Faster. Invite them!</p>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    if(data.customer_id === myId) {
        resultDiv.innerHTML = `<p class="wa-msg warn">You cannot chat with yourself!</p>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    resultDiv.innerHTML = `
        <div class="wa-found-user">
            <div>
                <p class="name">${data.name}</p>
                <p class="phone">${data.phone}</p>
            </div>
            <button onclick="startChat('${data.customer_id}')">Start Chat</button>
        </div>
    `;
    resultDiv.classList.remove('hidden');
}

// =========================================================
// 2. Start Chat (existing feature - unchanged)
// =========================================================
async function startChat(otherUserId) {
    const { data: convId, error } = await _supabase
        .rpc('get_or_create_conversation', {
            user1: myId,
            user2: otherUserId
        });

    if(error) {
        console.error(error);
        return alert("Error creating chat room. Try again.");
    }

    window.location.href = `chat-room.html?conversation_id=${convId}`;
}

// =========================================================
// 3. New Chat panel toggle (wraps the existing search feature)
// =========================================================
function toggleNewChatPanel() {
    const overlay = document.getElementById('newChatOverlay');
    overlay.classList.toggle('hidden');
    if (!overlay.classList.contains('hidden')) {
        document.getElementById('searchPhone').value = '';
        document.getElementById('searchResult').classList.add('hidden');
        setTimeout(() => document.getElementById('searchPhone').focus(), 200);
    }
}

// =========================================================
// 4. Recent Chats list (new - WhatsApp-style)
// =========================================================
const AVATAR_COLORS = ['#e91e63','#9c27b0','#673ab7','#3f51b5','#009688','#ff5722','#795548','#607d8b','#f57c00'];
function colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatChatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);

    if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (isYesterday) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function previewForMessage(type, content) {
    switch (type) {
        case 'image': return '<i class="fas fa-camera"></i> Photo';
        case 'video': return '<i class="fas fa-video"></i> Video';
        case 'voice':
        case 'audio': return '<i class="fas fa-microphone"></i> Voice message';
        case 'document':
        case 'doc': return '<i class="fas fa-file"></i> Document';
        default: return (content || '').replace(/</g, '&lt;');
    }
}

let _lastFetchTime = 0;
async function fetchRecentConversations(silent = false) {
    // Debounce: agar 2 second ke andar dobara call ho (jaise visibilitychange + focus
    // ek sath fire ho jayen), to duplicate query mat maaro
    const now = Date.now();
    if (silent && now - _lastFetchTime < 2000) return;
    _lastFetchTime = now;

    const container = document.getElementById('chatListContainer');
    if (!myId) {
        container.innerHTML = `<p class="wa-empty">Please log in to see your chats.</p>`;
        return;
    }
    if (!silent) container.innerHTML = `<p class="wa-loading">Loading chats...</p>`;

    try {
        // Step 1: my conversation ids
        const { data: myConvRows, error: convErr } = await _supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', String(myId));

        if (convErr) {
            console.error('Could not refresh chats (keeping cached view):', convErr);
            return; // cached/existing allChats ko chhedo mat, sirf silently fail ho jao
        }
        if (!myConvRows || myConvRows.length === 0) {
            allChats = [];
            renderChatList();
            saveChatsToCache();
            return;
        }
        const convIds = myConvRows.map(r => r.conversation_id);

        // Step 2: other participant per conversation
        const { data: otherRows } = await _supabase
            .from('conversation_participants')
            .select('conversation_id, user_id')
            .in('conversation_id', convIds)
            .neq('user_id', String(myId));

        const otherIdByConv = {};
        (otherRows || []).forEach(r => { otherIdByConv[r.conversation_id] = r.user_id; });
        const otherIds = [...new Set(Object.values(otherIdByConv))];

        // Step 3: conversation metadata (last message text + time)
        const { data: convsMeta } = await _supabase
            .from('conversations')
            .select('id, last_message, last_message_at')
            .in('id', convIds);
        const metaByConv = {};
        (convsMeta || []).forEach(c => { metaByConv[c.id] = c; });

        // Step 4: customer info for all other participants
        const { data: customersData } = await _supabase
            .from('customers')
            .select('customer_id, name, phone, avatar_url')
            .in('customer_id', otherIds);
        const custById = {};
        (customersData || []).forEach(c => { custById[c.customer_id] = c; });

        // Step 5 + 6: latest message details + unread count, per conversation (parallel)
        const details = await Promise.all(convIds.map(async (cid) => {
            const [lastMsgRes, unreadRes] = await Promise.all([
                _supabase.from('messages')
                    .select('sender_id, type, content, read_at, created_at')
                    .eq('conversation_id', cid)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                _supabase.from('messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('conversation_id', cid)
                    .neq('sender_id', String(myId))
                    .is('read_at', null)
            ]);
            return { cid, lastMsg: lastMsgRes.data, unreadCount: unreadRes.count || 0 };
        }));
        const detailByConv = {};
        details.forEach(d => { detailByConv[d.cid] = d; });

        // Assemble final list
        allChats = convIds.map(cid => {
            const otherId = otherIdByConv[cid];
            const cust = custById[otherId] || {};
            const meta = metaByConv[cid] || {};
            const det = detailByConv[cid] || {};
            const lastMsg = det.lastMsg;

            return {
                conversationId: cid,
                otherId,
                name: cust.name || cust.phone || 'Unknown User',
                phone: cust.phone || '',
                avatarUrl: cust.avatar_url || '',
                lastMessage: lastMsg ? lastMsg.content : (meta.last_message || ''),
                lastType: lastMsg ? lastMsg.type : 'text',
                lastAt: lastMsg ? lastMsg.created_at : meta.last_message_at,
                lastSenderIsMe: lastMsg ? String(lastMsg.sender_id) === String(myId) : false,
                lastReadAt: lastMsg ? lastMsg.read_at : null,
                unreadCount: det.unreadCount || 0
            };
        }).sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));

        renderChatList();
        saveChatsToCache();
    } catch (err) {
        console.error('fetchRecentConversations error:', err);
        container.innerHTML = `<p class="wa-empty">Could not load chats. Pull down to retry.</p>`;
    }
}

function renderChatList() {
    const container = document.getElementById('chatListContainer');
    const searchTerm = (document.getElementById('chatSearchInput').value || '').toLowerCase().trim();

    if (currentTab === 'favorites') {
        container.innerHTML = `<p class="wa-empty"><i class="fas fa-star" style="font-size:28px;opacity:0.4;display:block;margin-bottom:10px;"></i>No favorites yet</p>`;
        return;
    }
    if (currentTab === 'groups') {
        container.innerHTML = `<p class="wa-empty"><i class="fas fa-user-group" style="font-size:28px;opacity:0.4;display:block;margin-bottom:10px;"></i>No groups yet</p>`;
        return;
    }

    let list = allChats;
    if (currentTab === 'unread') list = list.filter(c => c.unreadCount > 0);
    if (searchTerm) list = list.filter(c => c.name.toLowerCase().includes(searchTerm));

    if (list.length === 0) {
        container.innerHTML = `<p class="wa-empty">${allChats.length === 0 ? 'No chats yet. Tap + to start one!' : 'No matching chats'}</p>`;
        return;
    }

    container.innerHTML = list.map(chat => {
        const initial = (chat.name || '?').charAt(0).toUpperCase();
        const avatarHtml = chat.avatarUrl
            ? `<img src="${chat.avatarUrl}" onerror="this.parentElement.innerHTML='${initial}'">`
            : initial;

        let tickHtml = '';
        if (chat.lastSenderIsMe && chat.lastMessage !== undefined) {
            tickHtml = chat.lastReadAt
                ? '<i class="fas fa-check-double wa-tick read"></i>'
                : '<i class="fas fa-check-double wa-tick unread"></i>';
        }

        const previewText = chat.lastSenderIsMe
            ? `You: ${previewForMessage(chat.lastType, chat.lastMessage)}`
            : previewForMessage(chat.lastType, chat.lastMessage);

        return `
            <div class="wa-chat-row" onclick="window.location.href='chat-room.html?conversation_id=${chat.conversationId}'">
                <div class="wa-avatar" style="background:${colorFromString(chat.name)}">${avatarHtml}</div>
                <div class="wa-chat-info">
                    <div class="wa-chat-top-row">
                        <span class="wa-chat-name">${chat.name}</span>
                        <span class="wa-chat-time ${chat.unreadCount > 0 ? 'unread-time' : ''}">${formatChatTime(chat.lastAt)}</span>
                    </div>
                    <div class="wa-chat-bottom-row">
                        <span class="wa-chat-preview">${tickHtml}${previewText || 'Tap to start chatting'}</span>
                        ${chat.unreadCount > 0 ? `<span class="wa-unread-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterChatList() {
    renderChatList();
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.wa-tab').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.wa-tab[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.wa-nav-item').forEach(n => n.classList.remove('active'));
    if (tab === 'all' || tab === 'unread') {
        document.querySelector('.wa-nav-item')?.classList.add('active');
    }
    renderChatList();
}

// =========================================================
// 5. REALTIME - page sirf 1 baar load hoti hai, uske baad sab kuch live push se update hota hai
//    (koi dobara database fetch nahi hoti - naya message/DP-change/seen-status seedha in-memory
//    allChats array update karta hai aur sirf list ko local re-render karta hai)
// =========================================================
function findChatIndexByConvId(convId) {
    return allChats.findIndex(c => String(c.conversationId) === String(convId));
}

let _contactsChannel = null;

function setupContactsRealtime(forceFresh = false) {
    if (forceFresh && _contactsChannel) {
        _supabase.removeChannel(_contactsChannel); // purani (shayad disconnected) channel hatao
        _contactsChannel = null;
    }
    if (_contactsChannel) return; // already ek live channel hai, dobara mat banao

    _contactsChannel = _supabase.channel('contacts-live-' + Date.now())
        // ---- Naya message aaya (kisi bhi conversation mein) ----
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;
            const idx = findChatIndexByConvId(msg.conversation_id);
            if (idx === -1) {
                // Yeh conversation abhi list mein nahi hai (pehla message hi ho sakta hai) - sirf isi ek conversation ko halka sa fetch kar lo
                fetchSingleConversationAndPrepend(msg.conversation_id);
                return;
            }
            const chat = allChats[idx];
            chat.lastMessage = msg.content;
            chat.lastType = msg.type;
            chat.lastAt = msg.created_at;
            chat.lastSenderIsMe = String(msg.sender_id) === String(myId);
            chat.lastReadAt = msg.read_at || null;
            if (!chat.lastSenderIsMe) chat.unreadCount = (chat.unreadCount || 0) + 1;

            // Sabse naya message upar aana chahiye (WhatsApp jaisa)
            allChats.splice(idx, 1);
            allChats.unshift(chat);
            renderChatList();
            saveChatsToCache();

            // Naye message pe halki si notification sound (agar main hi receiver hun)
            if (!chat.lastSenderIsMe) {
                const sound = document.getElementById('notifSound');
                if (sound) sound.play().catch(() => {});
            }
        })
        // ---- Message ka read_at update hua (seen/delivered status badla) ----
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;
            const idx = findChatIndexByConvId(msg.conversation_id);
            if (idx === -1) return;
            const chat = allChats[idx];

            // Agar yeh humne bheja hua last message tha aur ab "read" ho gaya -> blue tick
            if (String(msg.sender_id) === String(myId)) {
                chat.lastReadAt = msg.read_at || chat.lastReadAt;
            }

            // Agar dusre insaan ka message tha aur ab hum ne parh liya -> unread count kam karo
            if (String(msg.sender_id) !== String(myId) && msg.read_at) {
                chat.unreadCount = Math.max(0, (chat.unreadCount || 0) - 1);
            }
            renderChatList();
            saveChatsToCache();
        })
        // ---- Kisi customer ne apni profile photo (DP) change ki ----
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, (payload) => {
            const cust = payload.new;
            let changed = false;
            allChats.forEach(chat => {
                if (String(chat.otherId) === String(cust.customer_id)) {
                    chat.avatarUrl = cust.avatar_url || '';
                    chat.name = cust.name || chat.name;
                    changed = true;
                }
            });
            if (changed) { renderChatList(); saveChatsToCache(); }
        })
        .subscribe();
}

// Naye conversation ke liye (jo abhi list mein nahi tha) sirf usi ek ka data lao - poori list dobara nahi
async function fetchSingleConversationAndPrepend(convId) {
    try {
        const { data: participants } = await _supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convId);

        if (!participants || !participants.some(p => String(p.user_id) === String(myId))) return; // yeh mera conversation nahi hai

        const other = participants.find(p => String(p.user_id) !== String(myId));
        if (!other) return;

        const [{ data: cust }, { data: lastMsg }] = await Promise.all([
            _supabase.from('customers').select('customer_id, name, phone, avatar_url').eq('customer_id', other.user_id).maybeSingle(),
            _supabase.from('messages').select('sender_id, type, content, read_at, created_at').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        ]);

        const newChat = {
            conversationId: convId,
            otherId: other.user_id,
            name: cust?.name || cust?.phone || 'Unknown User',
            phone: cust?.phone || '',
            avatarUrl: cust?.avatar_url || '',
            lastMessage: lastMsg?.content || '',
            lastType: lastMsg?.type || 'text',
            lastAt: lastMsg?.created_at || new Date().toISOString(),
            lastSenderIsMe: lastMsg ? String(lastMsg.sender_id) === String(myId) : false,
            lastReadAt: lastMsg?.read_at || null,
            unreadCount: lastMsg && String(lastMsg.sender_id) !== String(myId) && !lastMsg.read_at ? 1 : 0
        };
        allChats.unshift(newChat);
        renderChatList();
        saveChatsToCache();
    } catch (err) {
        console.error('fetchSingleConversationAndPrepend error:', err);
    }
}

// =========================================================
// INSTANT LOAD (WhatsApp jaisa) - pehle cached data turant dikhao, phir background mein fresh karo
// =========================================================
const CHATS_CACHE_KEY = 'faster_cached_chats_' + myId;

// chat-room.js jab bhi message bhejta hai, wo 'faster_chats_dirty' mein poora data likh deta
// hai (conversationId + message). Isse hum turant (bina kisi network call ke) us specific
// chat ko top pe la sakte hain - "light speed" instant, background fetch ka wait nahi karna
function checkForNewMessagesFlag() {
    const raw = localStorage.getItem('faster_chats_dirty');
    if (!raw) return false;
    localStorage.removeItem('faster_chats_dirty');
    _lastFetchTime = 0; // debounce bypass - yeh definite signal hai ke kuch naya hai

    let signal;
    try { signal = JSON.parse(raw); } catch (e) { return false; } // purana format (sirf '1') ho to ignore

    const idx = findChatIndexByConvId(signal.conversationId);

    if (idx !== -1) {
        // Existing chat - turant, instantly (0ms, koi network call nahi) top pe le jao
        const chat = allChats[idx];
        chat.lastMessage = signal.lastMessage;
        chat.lastType = signal.lastType;
        chat.lastAt = signal.sentAt;
        chat.lastSenderIsMe = true;
        chat.lastReadAt = null;
        allChats.splice(idx, 1);
        allChats.unshift(chat);
        renderChatList();
        saveChatsToCache();
    } else {
        // Bilkul naya conversation (list mein tha hi nahi) - isko dedicated fetch se laao
        fetchSingleConversationAndPrepend(signal.conversationId);
    }
    return true;
}

function loadChatsFromCache() {
    try {
        const cached = localStorage.getItem(CHATS_CACHE_KEY);
        if (cached) {
            allChats = JSON.parse(cached);
            renderChatList();
            return true;
        }
    } catch (e) { console.warn('Cache read failed:', e); }
    return false;
}

function saveChatsToCache() {
    try {
        localStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(allChats));
    } catch (e) { console.warn('Cache save failed:', e); }
}

// =========================================================
// INIT
// =========================================================
function initContactsPage() {
    const hadCache = loadChatsFromCache();       // turant purana data dikhao (agar hai)
    fetchRecentConversations(hadCache);          // background mein fresh karo (agar cache tha to "Loading..." nahi dikhega)
    setupContactsRealtime();
}

window.addEventListener('DOMContentLoaded', initContactsPage);

// pageshow hamesha chalta hai - fresh page-load pe bhi aur bfcache-restore pe bhi (yeh
// spec-compliant, sabse reliable event hai "same-tab wapas aane" ko detect karne ke liye -
// visibilitychange/focus generally sirf TAB-switching ke liye fire hote hain, same-tab ke
// andar ek page se dusre pe navigate karne ke liye nahi). Debounce (2s) already guard karta
// hai taake fresh-load ke waqt DOMContentLoaded ke sath duplicate fetch na ho.
window.addEventListener('pageshow', () => {
    setupContactsRealtime(true);          // purani (background mein mari hui) connection ko fresh karo - "seen" status jaisi updates dobara live milne lagengi
    const handledLocally = checkForNewMessagesFlag(); // turant, bina network ke, local update try karo

    if (!handledLocally) {
        // Koi signal nahi tha (ya purana format tha) - normal background refresh karo
        fetchRecentConversations(true);
    } else {
        // Signal handle ho chuka - poori list ko turant overwrite NAHI karna (race condition
        // se bachne ke liye - naya conversation abhi DB mein poori tarah "settle" nahi hua
        // hota). Thodi der baad silently reconcile kar lo.
        setTimeout(() => fetchRecentConversations(true), 3000);
    }
});

// Note: visibilitychange/focus jaan boojh kar nahi rakhe - yeh same-tab navigation
// (contacts -> chat-room -> wapas) ke liye reliably fire nahi hote, sirf tab-switching
// ke liye hote hain. pageshow hi sahi tareeqa hai. Aur koi setInterval/polling bhi nahi
// rakha - wo continuously Supabase ko query maarta rehta (bill badhata), chahe kuch naya
// na ho. Realtime (jo aap ne already ON kar diya hai) + pageshow + chat-room.js ka signal
// (neeche) hi kaafi hain, aur yeh sirf tab chalte hain jab actually kuch badalta hai.

