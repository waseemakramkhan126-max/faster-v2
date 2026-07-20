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

function setupRealtime() {
    _supabase.removeAllChannels();
    _supabase.channel('customer-home-live')
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
// VENDORS STRIP - اب کوئی ڈپلیکیٹ نہیں (سنگل سیٹ، خودکار ری سیٹ)
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

        // صرف ایک بار ڈالیں (کوئی کلون نہیں)
        data.forEach((v
