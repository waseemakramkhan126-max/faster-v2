// ============================================================
// SUPABASE CONFIG (ORIGINAL)
// ============================================================
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const userPhone = (localStorage.getItem('faster_phone') || "").trim();
const customerId = localStorage.getItem('faster_customer_id') || '';
const userName = localStorage.getItem('faster_name') || 'Customer';

const isLocalPreview = window.location.protocol === 'file:';
if (!userPhone && !isLocalPreview) {
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
            imgH.classList.remove('hidden'); imgS.classList.remove('hidden');
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
        let foundWallet = false;

        const { data: walletData, error: walErr } = await _supabase
            .from('wallets')
            .select('current_balance')
            .eq('customer_id', customerId)
            .maybeSingle();

        if (!walErr && walletData) {
            currentBal = parseFloat(walletData.current_balance || 0);
            foundWallet = true;
        }

        if (!foundWallet) {
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
    } catch (e) {
        console.error("Wallet error", e);
    } finally {
        document.getElementById('walletLoading').classList.add('hidden');
    }
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

        const totalUpdates = (orderRes.count || 0) +
            (notifRes.count || 0) +
            (promoRes.count || 0) +
            (topupRes.count || 0) +
            (withdrawRes.count || 0);

        const bell = document.getElementById('notifBell');
        const badge = document.getElementById('notifBadge');

        if (totalUpdates > 0) {
            badge.classList.add('active');
            bell.classList.add('bell-active');
        } else {
            badge.classList.remove('active');
            bell.classList.remove('bell-active');
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
        const badge = document.getElementById('activeChatBadge');
        if (activeOrders && activeOrders.length > 0) {
            card.classList.add('active-order-continuous-glow');
            const orderIds = activeOrders.map(o => o.id);
            const { data: unreadMsgs } = await _supabase
                .from('order_chats').select('id').in('order_id', orderIds)
                .neq('sender_phone', userPhone).neq('status', 'seen');
            let unreadMsgCount = unreadMsgs ? unreadMsgs.length : 0;
            let lastVisit = localStorage.getItem('last_active_orders_visit') || '2000-01-01T00:00:00.000Z';
            let unseenStatusCount = activeOrders.filter(o => o.updated_at > lastVisit).length;
            let totalAlerts = unreadMsgCount + unseenStatusCount;
            if (totalAlerts > 0) { badge.innerText = totalAlerts;
                badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
        } else {
            card.classList.remove('active-order-continuous-glow');
            badge.classList.add('hidden');
        }
    } catch (e) { console.error("Active orders UI fail:", e); }
}

function openActiveOrders() {
    localStorage.setItem('last_active_orders_visit', new Date().toISOString());
    window.location.href = 'active-orders.html';
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
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
    let text = hour < 12 ? 'Good Morning' : (hour < 17 ? 'Good Afternoon' : 'Good Evening');
    document.getElementById('appbarGreeting').innerText = text;
}

function setupRealtime() {
    _supabase.removeAllChannels();
    _supabase.channel('customer-home-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_chats' }, () => {
            updateActiveOrdersCard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
            updateActiveOrdersCard();
            checkNotifications();
            fetchWalletBalance();
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (payload.new && String(payload.new.customer_id) === customerId) {
                    sound.play().catch(e => console.log("Sound error:", e));
                }
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => {
            fetchWalletBalance();
        })
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
// PROMOTIONS (ORIGINAL - UNCHANGED)
// ============================================================
let currentSlideIndex = 0, slideTimer, isAutoScrolling = false;
let promosData = [], userInterests = new Set();
let slideStartTime = 0, consecutiveInterestShown = 0, consecutiveSwipes = 0;

async function fetchPromotions() {
    if (!navigator.onLine) return;
    try {
        const { data: promos, error } = await _supabase.from('promotions').select('*').eq('promo_active', true).order('sort_order', { ascending: true });
        if (error) throw error;
        if (promos && promos.length > 0) {
            promosData = promos;
            const slider = document.getElementById('promoSlider');
            const container = document.getElementById('promoContainer');
            slider.innerHTML = '';
            promos.forEach((promo, index) => {
                const slide = document.createElement('div');
                slide.className = 'promo-slide overflow-hidden shrink-0';
                const overlay = `<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none"></div>`;
                const textHTML = `<div class="promo-text-box p-4 bg-gradient-to-br from-white to-orange-50 relative z-30"><div class="flex items-center gap-2 mb-1"><span class="w-2 h-2 bg-orange-500 rounded-full animate-ping"></span><h3 class="font-black text-orange-600 text-[10px] uppercase tracking-widest">${promo.title || 'Special Offer'}</h3></div><p class="text-xs text-gray-700 font-bold leading-tight line-clamp-2">${promo.promo_text || ''}</p></div>`;
                let mediaHTML = promo.promo_type === 'video' ?
                    `<div class="media-box relative w-full transition-all" onclick="handleMediaTap(event, ${index}, 'video')"><video id="vid_${index}" src="${promo.promo_url}" preload="${index === 0 ? 'auto' : 'none'}" muted playsinline class="promo-video w-full h-full object-cover bg-black"></video>${overlay}<div id="pause_overlay_${index}" class="pause-icon-overlay"><i class="fas fa-play"></i></div><button onclick="toggleSliderAudio(event, 'vid_${index}')" class="absolute bottom-2 right-2 w-7 h-7 bg-black/40 text-white rounded-full flex items-center justify-center z-40 backdrop-blur-md border border-white/20 shadow-lg"><i id="icon_vid_${index}" class="fas fa-volume-mute text-[9px]"></i></button></div>` :
                    `<div class="media-box relative w-full transition-all" onclick="handleMediaTap(event, ${index}, 'image')"><img src="${promo.promo_url}" class="w-full h-full object-cover">${overlay}</div>`;
                slide.innerHTML = mediaHTML + textHTML;
                slider.appendChild(slide);
            });
            container.classList.remove('hidden');
            slider.addEventListener('scroll', () => {
                if (isAutoScrolling) return;
                clearTimeout(slider.scrollTimeout);
                slider.scrollTimeout = setTimeout(() => {
                    let newIndex = Math.round(slider.scrollTop / slider.offsetHeight);
                    if (newIndex !== currentSlideIndex && newIndex >= 0 && newIndex < promos.length) {
                        activateSlide(newIndex, false);
                    }
                }, 40);
            });
            activateSlide(0, false);
        }
    } catch (err) { console.log("Promo Slider Error:", err); }
}

function handleMediaTap(e, index, type) {
    if (e.target.closest('button')) return;
    const container = document.getElementById('promoContainer');
    if (!container.classList.contains('tiktok-fullscreen')) {
        toggleTikTokFullscreen();
    } else if (type === 'video') {
        const vid = document.getElementById(`vid_${index}`);
        if (vid.paused) vid.play();
        else vid.pause();
    }
}

function toggleTikTokFullscreen() {
    const container = document.getElementById('promoContainer');
    const slider = document.getElementById('promoSlider');
    const isEntering = !container.classList.contains('tiktok-fullscreen');
    container.classList.toggle('tiktok-fullscreen');
    const vid = document.getElementById(`vid_${currentSlideIndex}`);
    if (vid) {
        vid.muted = !isEntering;
        const icon = document.getElementById(`icon_${vid.id}`);
        if (icon) icon.className = vid.muted ? 'fas fa-volume-mute text-[9px]' : 'fas fa-volume-up text-[9px]';
    }
    setTimeout(() => {
        slider.scrollTop = slider.offsetHeight * currentSlideIndex;
    }, 50);
}

function activateSlide(index, autoScroll = true) {
    currentSlideIndex = index;
    const slider = document.getElementById('promoSlider');
    if (autoScroll) {
        isAutoScrolling = true;
        slider.scrollTop = slider.offsetHeight * index;
        setTimeout(() => { isAutoScrolling = false; }, 500);
    }
    document.querySelectorAll('.promo-video').forEach(v => {
        v.pause();
        v.muted = true;
    });
    const promo = promosData[index];
    if (promo && promo.promo_type === 'video') {
        const vid = document.getElementById(`vid_${index}`);
        if (vid) {
            const isFull = document.getElementById('promoContainer').classList.contains('tiktok-fullscreen');
            vid.muted = !isFull;
            vid.play().catch(e => console.log(e));
        }
    }
}

function toggleSliderAudio(e, vidId) {
    e.stopPropagation();
    const vid = document.getElementById(vidId);
    const icon = document.getElementById(`icon_${vidId}`);
    if (vid) { vid.muted = !vid.muted;
        icon.className = vid.muted ? 'fas fa-volume-mute text-[9px]' : 'fas fa-volume-up text-[9px]'; }
}

// ============================================================
// NEW: VENDORS STRIP (Supabase)
// ============================================================
let vendorStrip, vendorWrapper;
let vendorAutoScrollInterval = null;
let vendorIsPaused = false;
let vendorIsDragging = false;
let vendorStartX = 0;
let vendorScrollLeft = 0;
let vendorInteractionTimeout = null;
let vendorOriginalWidth = 0;
let vendorData = [];

// Fallback vendors (only if database empty)
const FALLBACK_VENDORS = [
    { name: 'Rainbow', icon: 'fa-rainbow', color: '#FF8F00' },
    { name: 'Imtiaz', icon: 'fa-shopping-bag', color: '#7B1FA2' },
    { name: 'KFC', icon: 'fa-drumstick-bite', color: '#C62828' },
    { name: "McDonald's", icon: 'fa-burger', color: '#D84315' },
];

async function initVendorStrip() {
    vendorStrip = document.getElementById('vendorStrip');
    vendorWrapper = document.getElementById('vendorStripWrapper');
    vendorStrip.innerHTML = '';

    let vendors = [];
    try {
        const { data, error } = await _supabase
            .from('vendors')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (!error && data && data.length > 0) {
            vendors = data;
            console.log('✅ Vendors loaded from database:', vendors.length);
        } else {
            // Try stores table
            const { data: storeData, error: storeErr } = await _supabase
                .from('stores')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (!storeErr && storeData && storeData.length > 0) {
                vendors = storeData;
                console.log('✅ Stores loaded from database:', vendors.length);
            } else {
                // Use fallback
                vendors = FALLBACK_VENDORS;
                console.log('ℹ️ Using fallback vendors');
            }
        }
    } catch (err) {
        console.warn('⚠️ Error fetching vendors, using fallback:', err);
        vendors = FALLBACK_VENDORS;
    }

    if (vendors.length === 0) {
        vendorWrapper.classList.add('hidden');
        return;
    }

    vendorWrapper.classList.remove('hidden');
    vendorData = vendors;

    vendors.forEach((v) => {
        const item = createVendorItem(v);
        vendorStrip.appendChild(item);
    });

    const cloneCount = 2;
    for (let i = 0; i < cloneCount; i++) {
        vendors.forEach((v) => {
            const clone = createVendorItem(v, true);
            vendorStrip.appendChild(clone);
        });
    }

    setTimeout(() => {
        const firstItem = vendorStrip.querySelector('.vendor-item');
        if (firstItem) {
            const itemWidth = firstItem.offsetWidth + 20;
            vendorOriginalWidth = vendors.length * itemWidth;
        }
        vendorStrip.scrollLeft = 0;
    }, 50);

    vendorStrip.addEventListener('scroll', () => {
        const maxScroll = vendorStrip.scrollWidth - vendorStrip.clientWidth;
        if (vendorStrip.scrollLeft >= vendorOriginalWidth * 1.5) {
            vendorStrip.style.scrollBehavior = 'auto';
            vendorStrip.scrollLeft = vendorStrip.scrollLeft - vendorOriginalWidth;
            vendorStrip.style.scrollBehavior = 'smooth';
        } else if (vendorStrip.scrollLeft < 0) {
            vendorStrip.style.scrollBehavior = 'auto';
            vendorStrip.scrollLeft = vendorStrip.scrollLeft + vendorOriginalWidth;
            vendorStrip.style.scrollBehavior = 'smooth';
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
}

function createVendorItem(v, isClone = false) {
    const item = document.createElement('div');
    item.className = 'vendor-item';
    if (isClone) item.dataset.clone = true;

    const name = v.name || v.vendor_name || 'Store';
    const icon = v.icon || v.icon_class || 'fa-store';
    const color = v.color || v.theme_color || '#64748b';

    // Emoji fallback for common vendors
    let emoji = '';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('rainbow')) emoji = '🌈';
    else if (lowerName.includes('imtiaz')) emoji = '🛍️';
    else if (lowerName.includes('kfc')) emoji = '🍗';
    else if (lowerName.includes('mcdonald')) emoji = '🍔';
    else if (lowerName.includes('easy mart')) emoji = '🏪';
    else if (lowerName.includes('alfa')) emoji = '🏢';

    item.innerHTML = `
        <div class="vendor-avatar" style="background: ${color};">
            ${emoji || `<i class="fas ${icon}"></i>`}
        </div>
        <span class="vendor-name">${name}</span>
    `;
    item.addEventListener('click', () => {
        console.log('Vendor clicked:', name);
        alert(`Opening ${name}...`);
        // Navigate to vendor page: window.location.href = 'vendor.html?id='+v.id;
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

function endVendorDrag(e) {
    if (!vendorIsDragging) return;
    vendorIsDragging = false;
    vendorStrip.style.cursor = 'grab';
    clearTimeout(vendorInteractionTimeout);
    vendorInteractionTimeout = setTimeout(() => {
        if (!vendorIsDragging) resumeVendorAutoScroll();
    }, 3000);
}

function endVendorDragTouch(e) {
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
        const itemWidth = container.querySelector('.vendor-item')?.offsetWidth + 20 || 70;
        const step = itemWidth;
        let nextScroll = container.scrollLeft + step;
        if (nextScroll >= container.scrollWidth - container.clientWidth) {
            nextScroll = nextScroll - vendorOriginalWidth;
        }
        container.scrollTo({ left: nextScroll, behavior: 'smooth' });
    }, 2500);
}

function pauseVendorAutoScroll() {
    vendorIsPaused = true;
}

function resumeVendorAutoScroll() {
    vendorIsPaused = false;
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseVendorAutoScroll();
    } else {
        setTimeout(resumeVendorAutoScroll, 1000);
    }
});

// ============================================================
// NEW: FAMILY/FRIENDS CHAT WITH SEARCH
// ============================================================
// Dummy chat data (will be replaced with Supabase data)
let familyChats = [
    { id: 1, name: 'Sara Mehmood', phone: '0300-1234567', lastMessage: 'Okay, main aa rahi hoon', time: '10:30', unread: 2, online: true, avatar: 'SM', bg: 'chat-bg-1' },
    { id: 2, name: 'Ali Ahmed', phone: '0312-7654321', lastMessage: 'Bhai kal milte hain?', time: '09:15', unread: 0, online: true, avatar: 'AA', bg: 'chat-bg-2' },
    { id: 3, name: 'Fatima Khan', phone: '0333-9876543', lastMessage: 'Thank you so much! 💖', time: 'Yesterday', unread: 0, online: false, avatar: 'FK', bg: 'chat-bg-3' },
    { id: 4, name: 'Family Group', phone: '0301-4567890', lastMessage: 'Ammi: Doston ko bhi bula lo', time: '12:45', unread: 0, online: true, avatar: '🏠', bg: 'chat-bg-4' },
    { id: 5, name: 'Usman Brothers', phone: '0315-6549873', lastMessage: 'Meeting at 6 PM', time: '11:20', unread: 1, online: false, avatar: 'UB', bg: 'chat-bg-5' },
    { id: 6, name: 'Ayesha Tariq', phone: '0345-7890123', lastMessage: 'See you tomorrow!', time: '08:45', unread: 0, online: true, avatar: 'AT', bg: 'chat-bg-6' },
];

let filteredChats = [...familyChats];

function renderFamilyChats(chats) {
    const container = document.getElementById('familyChatList');
    if (!chats || chats.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 text-sm py-6">No chats found</p>`;
        return;
    }

    container.innerHTML = '';
    chats.forEach((chat, index) => {
        const div = document.createElement('div');
        div.className = 'chat-list-item';
        div.setAttribute('data-index', index);

        const onlineDot = chat.online ? `<span class="online-dot"></span>` : '';

        div.innerHTML = `
            <div class="chat-list-avatar ${chat.bg || 'chat-bg-1'}">
                <span>${chat.avatar}</span>
                ${onlineDot}
            </div>
            <div class="chat-list-info">
                <div class="flex justify-between items-start">
                    <span class="chat-list-name">${chat.name}</span>
                    <span class="chat-list-time">${chat.time}</span>
                </div>
                <div class="flex justify-between items-center mt-0.5">
                    <span class="chat-list-phone">${chat.phone}</span>
                    ${chat.unread > 0 ? `<span class="chat-list-badge">${chat.unread}</span>` : ''}
                </div>
                <div class="text-xs text-gray-400 truncate mt-0.5">${chat.lastMessage || ''}</div>
            </div>
        `;

        div.addEventListener('click', () => {
            console.log('Opening chat with:', chat.name);
            alert(`Opening chat with ${chat.name} (${chat.phone})`);
            // Navigate to chat page: window.location.href = 'chat.html?id='+chat.id;
        });

        container.appendChild(div);
    });
}

// Search functionality
function setupChatSearch() {
    const searchInput = document.getElementById('chatSearchInput');
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        if (query === '') {
            filteredChats = [...familyChats];
        } else {
            filteredChats = familyChats.filter(chat =>
                chat.name.toLowerCase().includes(query) ||
                chat.phone.includes(query)
            );
        }
        renderFamilyChats(filteredChats);
    });
}

// New Chat button
function openNewChat() {
    const name = prompt('Enter friend/family name:');
    if (!name) return;
    const phone = prompt('Enter phone number:');
    if (!phone) return;

    // Add new chat to list
    const newChat = {
        id: Date.now(),
        name: name,
        phone: phone,
        lastMessage: 'Start chatting...',
        time: 'Now',
        unread: 0,
        online: true,
        avatar: name.charAt(0).toUpperCase(),
        bg: 'chat-bg-' + (Math.floor(Math.random() * 7) + 1)
    };

    familyChats.unshift(newChat);
    filteredChats = [...familyChats];
    renderFamilyChats(filteredChats);
    alert(`✅ "${name}" added to your chats!`);
}

// ============================================================
// WINDOW ONLOAD
// ============================================================
window.onload = () => {
    setGreeting();
    initializeApp();
    initVendorStrip();
    fetchPromotions();
    renderFamilyChats(familyChats);
    setupChatSearch();
};
