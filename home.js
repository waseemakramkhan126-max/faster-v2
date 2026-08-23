// ============================================================
// SUPABASE CONFIG
// ============================================================
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const userPhone = (localStorage.getItem('faster_phone') || "").trim();
const customerId = localStorage.getItem('faster_customer_id') || '';
const userName = localStorage.getItem('faster_name') || 'Customer';

if (!userPhone && window.location.protocol !== 'file:') {
    window.location.replace('index.html');
}

const sound = document.getElementById('notifSound');

// ============================================================
// ORIGINAL FUNCTIONS (UNCHANGED)
// ============================================================
async function initializeApp() {
    if (!navigator.onLine) return;
    document.getElementById('userName').innerText = userName;

    try {
        const { data: settings } = await _supabase.from('app_settings').select('logo_url').eq('id', 1).single();
        if (settings && settings.logo_url) {
            const imgH = document.getElementById('appLogo');
            const imgS = document.getElementById('sideLogo');
            imgH.src = imgS.src = settings.logo_url;
            imgH.classList.remove('hidden');
            imgS.classList.remove('hidden');
            document.getElementById('logoFallback').classList.add('hidden');
        }
    } catch (err) { console.error("Logo Error:", err); }

    checkNotifications();
    updateActiveOrdersCard();
    fetchWalletBalance();
    setupRealtime();
}

async function fetchWalletBalance() {
    if (!navigator.onLine) return;
    document.getElementById('walletLoading').classList.remove('hidden');
    try {
        let currentBal = 0;
        const { data: walletData, error: walErr } = await _supabase
            .from('wallets')
            .select('current_balance')
            .eq('customer_id', customerId)
            .maybeSingle();

        if (!walErr && walletData) {
            currentBal = parseFloat(walletData.current_balance || 0);
        } else {
            const { data: orders, error: ordErr } = await _supabase
                .from('orders')
                .select('balance_amount')
                .eq('customer_id', customerId)
                .in('status', ['completed', 'canceled', 'CANCELLED', 'cancelled'])
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!ordErr && orders && orders.length > 0) {
                currentBal = parseFloat(orders[0].balance_amount || 0);
            }
        }

        const hPend = document.getElementById('homePend');
        const pBox = document.getElementById('homePendBox');
        const hRem = document.getElementById('homeRem');
        const rBox = document.getElementById('homeRemBox');

        if (currentBal > 0) {
            hPend.innerText = `Rs. ${currentBal}`;
            pBox.classList.remove('hidden');
            rBox.classList.add('hidden');
        } else if (currentBal < 0) {
            hRem.innerText = `Rs. ${Math.abs(currentBal)}`;
            rBox.classList.remove('hidden');
            pBox.classList.add('hidden');
        } else {
            pBox.classList.add('hidden');
            rBox.classList.add('hidden');
        }
    } catch (e) { console.error("Wallet error:", e); }
    document.getElementById('walletLoading').classList.add('hidden');
}

async function checkNotifications() {
    if (!navigator.onLine) return;
    try {
        const lastRead = localStorage.getItem('last_notif_read') || '2000-01-01T00:00:00.000Z';
        const [orderRes, notifRes, promoRes, topupRes, withdrawRes] = await Promise.all([
            _supabase.from('orders').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).gt('updated_at', lastRead),
            _supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('customer_phone', userPhone).gt('created_at', lastRead),
            _supabase.from('promotions').select('*', { count: 'exact', head: true }).eq('promo_active', true).gt('created_at', lastRead),
            _supabase.from('topup_requests').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).gt('updated_at', lastRead),
            _supabase.from('withdraw_requests').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).gt('created_at', lastRead)
        ]);

        const totalUpdates = (orderRes.count || 0) + (notifRes.count || 0) + (promoRes.count || 0) + (topupRes.count || 0) + (withdrawRes.count || 0);
        const bell = document.getElementById('notifBell');
        const badge = document.getElementById('notifBadge');
        const countEl = document.getElementById('notifCount');

        if (totalUpdates > 0) {
            badge.classList.add('active');
            bell.classList.add('bell-active');
            if (countEl) countEl.innerText = totalUpdates > 9 ? '9+' : totalUpdates;
        } else {
            badge.classList.remove('active');
            bell.classList.remove('bell-active');
            if (countEl) countEl.innerText = '0';
        }
    } catch (e) { console.error("Notification sync failed", e); }
}

function openNotifications() {
    localStorage.setItem('last_notif_read', new Date().toISOString());
    window.location.href = 'notifications.html';
}

async function updateActiveOrdersCard() {
    if (!navigator.onLine) return;
    try {
        const { data: activeOrders } = await _supabase
            .from('orders').select('id, updated_at').eq('customer_id', customerId)
            .not('status', 'in', '("completed","canceled","CANCELLED","cancelled")');
        const card = document.getElementById('activeOrdersCard');
        const badge = document.getElementById('activeCountBadge');
        if (activeOrders && activeOrders.length > 0) {
            card.classList.add('active-order-continuous-glow');
            badge.innerText = activeOrders.length;
        } else {
            card.classList.remove('active-order-continuous-glow');
            badge.innerText = '0';
        }

        const { count: doneCount } = await _supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', customerId)
            .in('status', ['completed']);
        document.getElementById('doneCountBadge').innerText = doneCount || 0;

    } catch (e) { console.error("Orders update error:", e); }
}

function openActiveOrders() {
    localStorage.setItem('last_active_orders_visit', new Date().toISOString());
    window.location.href = 'active-orders.html';
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

async function logout() {
    if (confirm("Are you sure you want to logout?")) {
        await _supabase.auth.signOut();
        localStorage.clear();
        localStorage.setItem('faster_logged_out', 'true');
        setTimeout(() => { window.location.replace("index.html"); }, 500);
    }
}

function setGreeting() {
    const hour = new Date().getHours();
    let text = hour < 12 ? 'GOOD MORNING' : (hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING');
    document.getElementById('appbarGreeting').innerText = text;
}

function openChat(conversationId) {
    alert('Opening chat ID: ' + conversationId);
    // window.location.href = 'chat.html?conversation=' + conversationId;
}

let _homeRealtimeChannel = null; // sirf apni khud ki channel track karo - removeAllChannels() poori app ki
                                   // baaki channels (jaise global-message-notify.js) bhi hata deta tha
function setupRealtime() {
    if (_homeRealtimeChannel) _supabase.removeChannel(_homeRealtimeChannel);
    _homeRealtimeChannel = _supabase.channel('customer-home-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_chats' }, () => updateActiveOrdersCard())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
            updateActiveOrdersCard();
            checkNotifications();
            fetchWalletBalance();
            if (payload.new && String(payload.new.customer_id) === customerId) {
                sound.play().catch(e => console.log("Sound error:", e));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => fetchWalletBalance())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
            if (payload.new && (payload.new.customer_phone === userPhone || payload.new.phone === userPhone)) {
                checkNotifications();
                sound.play().catch(e => console.log("Sound error:", e));
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'promotions' }, () => {
            checkNotifications();
            sound.play().catch(e => console.log("Sound error:", e));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_requests' }, (payload) => {
            if (payload.new && String(payload.new.customer_id) === customerId) {
                checkNotifications();
                sound.play().catch(e => console.log("Sound error:", e));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'withdraw_requests' }, (payload) => {
            if (payload.new && String(payload.new.customer_id) === customerId) {
                checkNotifications();
                sound.play().catch(e => console.log("Sound error:", e));
            }
        })
        .subscribe();
}

// ============================================================
// VENDORS STRIP - کوئی ڈپلیکیٹ نہیں، صرف اصلی ڈیٹا
// ============================================================
let vendorStrip, vendorWrapper;
let vendorAutoScrollInterval = null;
let vendorIsPaused = false;
let vendorIsDragging = false;
let vendorStartX = 0;
let vendorScrollLeft = 0;
let vendorInteractionTimeout = null;
let vendorData = [];

async function initVendorStrip() {
    vendorStrip = document.getElementById('vendorStrip');
    vendorWrapper = document.getElementById('vendorStripWrapper');
    vendorStrip.innerHTML = '';

    try {
        const { data, error } = await _supabase
            .from('vendors')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error || !data || data.length === 0) {
            vendorWrapper.classList.add('hidden');
            return;
        }

        vendorData = data;
        vendorWrapper.classList.remove('hidden');

        data.forEach((v) => {
            const item = createVendorItem(v);
            vendorStrip.appendChild(item);
        });

        vendorStrip.addEventListener('scroll', () => {
            const maxScroll = vendorStrip.scrollWidth - vendorStrip.clientWidth;
            if (vendorStrip.scrollLeft >= maxScroll - 10) {
                vendorStrip.style.scrollBehavior = 'auto';
                vendorStrip.scrollLeft = 0;
                setTimeout(() => {
                    vendorStrip.style.scrollBehavior = 'smooth';
                }, 50);
            }
        });

        vendorStrip.addEventListener('mousedown', startVendorDrag);
        vendorStrip.addEventListener('touchstart', startVendorDragTouch, { passive: true });
        vendorStrip.addEventListener('mouseleave', endVendorDrag);
        vendorStrip.addEventListener('mouseup', endVendorDrag);
        vendorStrip.addEventListener('touchend', endVendorDragTouch, { passive: true });
        vendorStrip.addEventListener('mouseenter', pauseVendorAutoScroll);
        vendorStrip.addEventListener('mouseleave', resumeVendorAutoScroll);

        startVendorAutoScroll();

    } catch (err) {
        console.warn('⚠️ Error fetching vendors:', err);
        vendorWrapper.classList.add('hidden');
    }
}

// 🔥 یہاں تبدیلی کی گئی ہے – وینڈر کلک پر vendor-products.html کھلے گا
function createVendorItem(v, isClone = false) {
    const item = document.createElement('div');
    item.className = 'vendor-item';
    if (isClone) item.dataset.clone = true;

    const name = v.name || 'Store';
    const logo = v.logo_url || '';
    const color = v.category === 'Fast Food' ? '#C62828' :
                  v.category === 'Groceries' ? '#4CAF50' :
                  v.category === 'Electronics' ? '#1E88E5' : '#64748b';

    let emoji = '';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('rainbow')) emoji = '🌈';
    else if (lowerName.includes('imtiaz')) emoji = '🛍️';
    else if (lowerName.includes('kfc')) emoji = '🍗';
    else if (lowerName.includes('mcdonald')) emoji = '🍔';
    else if (lowerName.includes('pizza')) emoji = '🍕';
    else emoji = name.charAt(0);

    item.innerHTML = `
        <div class="vendor-avatar" style="background: ${color};">
            ${logo ? `<img src="${logo}" class="w-full h-full object-cover rounded-full" onerror="this.style.display='none'">` : `<span class="text-2xl">${emoji}</span>`}
        </div>
        <span class="vendor-name">${name}</span>
    `;

    // ✅ وینڈر کلک پر vendor-products.html کھلے گا
    item.addEventListener('click', () => {
        window.location.href = 'vendor-products.html?id=' + v.id;
    });

    return item;
}

function startVendorDrag(e) {
    vendorIsDragging = true;
    vendorStartX = e.pageX - vendorStrip.offsetLeft;
    vendorScrollLeft = vendorStrip.scrollLeft;
    vendorStrip.style.cursor = 'grabbing';
    pauseVendorAutoScroll();
}

function startVendorDragTouch(e) {
    const touch = e.touches[0];
    vendorIsDragging = true;
    vendorStartX = touch.pageX - vendorStrip.offsetLeft;
    vendorScrollLeft = vendorStrip.scrollLeft;
    pauseVendorAutoScroll();
}

function endVendorDrag() {
    if (!vendorIsDragging) return;
    vendorIsDragging = false;
    vendorStrip.style.cursor = 'grab';
    clearTimeout(vendorInteractionTimeout);
    vendorInteractionTimeout = setTimeout(() => {
        if (!vendorIsDragging) resumeVendorAutoScroll();
    }, 3000);
}

function endVendorDragTouch() {
    if (!vendorIsDragging) return;
    vendorIsDragging = false;
    clearTimeout(vendorInteractionTimeout);
    vendorInteractionTimeout = setTimeout(() => {
        if (!vendorIsDragging) resumeVendorAutoScroll();
    }, 3000);
}

function startVendorAutoScroll() {
    if (vendorAutoScrollInterval) clearInterval(vendorAutoScrollInterval);
    vendorAutoScrollInterval = setInterval(() => {
        if (vendorIsPaused || vendorIsDragging || vendorData.length === 0) return;
        const container = vendorStrip;
        const itemWidth = container.querySelector('.vendor-item')?.offsetWidth + 24 || 70;
        let nextScroll = container.scrollLeft + itemWidth;
        if (nextScroll >= container.scrollWidth - container.clientWidth) {
            nextScroll = 0;
        }
        container.scrollTo({ left: nextScroll, behavior: 'smooth' });
    }, 2500);
}

function pauseVendorAutoScroll() { vendorIsPaused = true; }
function resumeVendorAutoScroll() { vendorIsPaused = false; }

document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseVendorAutoScroll();
    else setTimeout(resumeVendorAutoScroll, 1000);
});

// ============================================================
// PROMOTIONS (Original – unchanged)
// ============================================================
let currentSlideIndex = 0, isAutoScrolling = false;
let promosData = [];

async function fetchPromotions() {
    if (!navigator.onLine) return;
    try {
        const { data: promos, error } = await _supabase
            .from('promotions')
            .select('*')
            .eq('promo_active', true)
            .order('sort_order', { ascending: true });

        if (error || !promos || promos.length === 0) {
            document.getElementById('promoSlider').innerHTML = '<p class="text-center text-gray-400 text-sm py-4">No promotions available</p>';
            return;
        }

        promosData = promos;
        const slider = document.getElementById('promoSlider');
        slider.innerHTML = '';

        promos.forEach((promo, index) => {
            const slide = document.createElement('div');
            slide.className = 'promo-slide relative cursor-pointer';
            slide.setAttribute('data-index', index);

            const isVideo = promo.promo_type === 'video';
            const mediaSrc = promo.promo_url || '';
            const mediaTag = isVideo
                ? `<video id="vid_${index}" src="${mediaSrc}" muted autoplay loop playsinline class="w-full h-full object-cover"></video>`
                : `<img src="${mediaSrc || 'https://via.placeholder.com/160x100/f3f4f6/888?text=Promo'}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/160x100/f3f4f6/888?text=Promo'">`;

            slide.innerHTML = `
                <div class="media-box w-full h-full relative" onclick="handleMediaTap(event, ${index})">
                    ${mediaTag}
                    <div class="promo-overlay"></div>
                    <div class="promo-text-box">
                        <h3>${promo.title || 'Special Offer'}</h3>
                        <p>${promo.promo_text || ''}</p>
                    </div>
                    <span class="promo-tag">${promo.category || 'Offer'}</span>
                </div>
            `;
            slider.appendChild(slide);
        });

        document.querySelectorAll('.promo-slide').forEach(el => {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.media-box')) return;
                const idx = parseInt(this.dataset.index);
                toggleTikTokFullscreen(idx);
            });
        });

    } catch (err) { console.error("Promotions error:", err); }
}

function handleMediaTap(e, index) {
    if (e.target.closest('button')) return;
    toggleTikTokFullscreen(index);
}

function toggleTikTokFullscreen(targetIndex = 0) {
    const container = document.getElementById('promoContainer');
    const slider = document.getElementById('promoSlider');
    const isEntering = !container.classList.contains('tiktok-fullscreen');

    container.classList.toggle('tiktok-fullscreen');
    document.body.style.overflow = isEntering ? 'hidden' : 'auto';

    if (isEntering) {
        currentSlideIndex = targetIndex;
        slider.style.scrollSnapType = 'y mandatory';
        setTimeout(() => {
            slider.scrollTop = window.innerHeight * currentSlideIndex;
            const vid = document.getElementById(`vid_${currentSlideIndex}`);
            if (vid) { vid.muted = false; vid.play().catch(e => console.log(e)); }
        }, 100);
    } else {
        slider.style.scrollSnapType = '';
        document.querySelectorAll('.promo-slide video').forEach(v => { v.pause(); v.muted = true; });
        const slideWidth = 160 + 14;
        slider.scrollLeft = currentSlideIndex * slideWidth;
    }
}

// ============================================================
// FAMILY CHATS - Supabase (real data)
// ============================================================
async function fetchRecentChats() {
    const container = document.getElementById('recentChatsContainer');
    container.innerHTML = '<p class="text-center text-gray-400 text-sm py-6">Loading chats...</p>';

    try {
        const { data: conversations, error: convErr } = await _supabase
            .from('family_conversations')
            .select('*')
            .contains('participants', [userPhone])
            .order('updated_at', { ascending: false });

        if (convErr || !conversations || conversations.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 text-sm py-6">No conversations found</p>';
            return;
        }

        container.innerHTML = '';
        const chatColors = ['bg-c1', 'bg-c2', 'bg-c3', 'bg-c4'];

        for (let i = 0; i < conversations.length; i++) {
            const conv = conversations[i];
            const colorClass = chatColors[i % chatColors.length];
            
            const otherParticipants = conv.participants.filter(p => p !== userPhone);
            const otherPhone = otherParticipants[0] || 'Unknown';
            
            let otherName = otherPhone;
            try {
                const { data: userData } = await _supabase
                    .from('customers')
                    .select('name')
                    .eq('phone', otherPhone)
                    .single();
                if (userData) otherName = userData.name;
            } catch (e) {}

            const { data: latestMsg, error: msgErr } = await _supabase
                .from('family_messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1);

            const lastMsg = (latestMsg && latestMsg.length > 0) ? latestMsg[0] : null;
            const messageText = lastMsg?.message || 'Start chatting...';
            const time = lastMsg ? formatTime(lastMsg.created_at) : 'Now';
            const status = lastMsg?.status || 'sent';
            
            const { count: unreadCount } = await _supabase
                .from('family_messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id)
                .neq('sender_phone', userPhone)
                .neq('status', 'read');

            const tickIcon = status === 'read' ? 'fa-check-double tick' : 'fa-check tick grey';
            const online = false;

            const div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = `
                <div class="chat-avatar ${colorClass}">
                    <span>${otherName.charAt(0).toUpperCase()}</span>
                    ${online ? '<span class="online-dot"></span>' : ''}
                </div>
                <div class="chat-info">
                    <div class="chat-name-row">
                        <span class="chat-name">${otherName}</span>
                        <span class="chat-time">${time}</span>
                    </div>
                    <div class="chat-msg-row">
                        <span class="chat-msg">
                            <i class="fas ${tickIcon}"></i> ${messageText}
                        </span>
                        ${unreadCount > 0 ? `<span class="chat-badge">${unreadCount}</span>` : ''}
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5">${otherPhone}</div>
                </div>
            `;
            div.addEventListener('click', () => {
                openChat(conv.id);
            });
            container.appendChild(div);
        }

    } catch (e) {
        console.error("Error fetching chats:", e);
        container.innerHTML = '<p class="text-center text-gray-400 text-sm py-6">Failed to load chats</p>';
    }
}

function formatTime(timestamp) {
    if (!timestamp) return 'Now';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return 'Yesterday';
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// ============================================================
// NEW DESIGN ADDITIONS (dots, trending cards, offers strip)
// These are additive - none of the original functions above were removed.
// ============================================================

// ---- Promo carousel dots (reuses promosData already fetched by fetchPromotions) ----
function renderPromoDots() {
    const dotsWrap = document.getElementById('promoDots');
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    if (!promosData || promosData.length <= 1) return;

    promosData.forEach((_, i) => {
        const d = document.createElement('div');
        d.className = 'dot' + (i === 0 ? ' active' : '');
        dotsWrap.appendChild(d);
    });

    const slider = document.getElementById('promoSlider');
    if (!slider || slider.dataset.dotsBound) return;
    slider.dataset.dotsBound = 'true';
    slider.addEventListener('scroll', () => {
        if (slider.classList.contains('tiktok-fullscreen')) return;
        const slideWidth = slider.clientWidth || 1;
        const idx = Math.round(slider.scrollLeft / slideWidth);
        document.querySelectorAll('#promoDots .dot').forEach((d, i) => {
            d.classList.toggle('active', i === idx);
        });
    });
}

// ---- Trending Foodie Shorts & Reels (reuses vendor data fetched by initVendorStrip) ----
function renderTrendingSection(vendors) {
    const strip = document.getElementById('trendingReelsStrip');
    if (!strip) return;

    if (!vendors || vendors.length === 0) {
        strip.innerHTML = '<p class="text-center text-gray-400 text-xs py-6 w-full">No trending items yet</p>';
        return;
    }

    strip.innerHTML = '';
    vendors.slice(0, 10).forEach(v => {
        const card = document.createElement('div');
        card.className = 'trend-card';
        const img = v.logo_url || '';
        card.innerHTML = `
            ${img
                ? `<img src="${img}" onerror="this.src='https://via.placeholder.com/130x150/1e293b/ffffff?text=${encodeURIComponent(v.name || 'Store')}'">`
                : `<img src="https://via.placeholder.com/130x150/1e293b/ffffff?text=${encodeURIComponent(v.name || 'Store')}">`
            }
            <i class="fas fa-play-circle trend-play-icon"></i>
            <div class="trend-info">
                <div class="trend-name">${v.name || 'Store'}</div>
                <div class="trend-meta"><i class="fas fa-star"></i> ${v.rating || '4.5'} &nbsp; ${v.delivery_time || '30-40 min'}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            window.location.href = 'vendor-products.html?id=' + v.id;
        });
        strip.appendChild(card);
    });
}

// ---- Auto-slide for the full-width Promotions & Offers banner (manual swipe already works natively via scroll) ----
let promoAutoScrollInterval = null;
let promoIsPaused = false;

function initPromoBannerAutoSlide() {
    const slider = document.getElementById('promoSlider');
    if (!slider || slider.dataset.autoSlideBound) return;
    slider.dataset.autoSlideBound = 'true';

    slider.addEventListener('touchstart', () => { promoIsPaused = true; }, { passive: true });
    slider.addEventListener('touchend', () => { setTimeout(() => { promoIsPaused = false; }, 3000); });
    slider.addEventListener('mouseenter', () => { promoIsPaused = true; });
    slider.addEventListener('mouseleave', () => { promoIsPaused = false; });

    if (promoAutoScrollInterval) clearInterval(promoAutoScrollInterval);
    promoAutoScrollInterval = setInterval(() => {
        if (promoIsPaused || !promosData || promosData.length <= 1) return;
        if (slider.classList.contains('tiktok-fullscreen')) return;
        const slideWidth = slider.clientWidth || 1;
        let nextScroll = slider.scrollLeft + slideWidth;
        if (nextScroll >= slider.scrollWidth - slideWidth / 2) nextScroll = 0;
        slider.scrollTo({ left: nextScroll, behavior: 'smooth' });
    }, 4000);
}

// Hook into the existing fetchPromotions result without editing its internals:
const _origFetchPromotions = fetchPromotions;
fetchPromotions = async function() {
    await _origFetchPromotions();
    renderPromoDots();
    initPromoBannerAutoSlide();
};

const _origInitVendorStrip = initVendorStrip;
initVendorStrip = async function() {
    await _origInitVendorStrip();
    renderTrendingSection(vendorData);
};

// ============================================================
// WINDOW ONLOAD
// ============================================================
window.onload = () => {
    setGreeting();
    initializeApp();
    initVendorStrip();
    fetchPromotions();
    // fetchRecentChats() no longer called - Recent Chats section removed from home page
};
