// ============================================================
// SUPABASE CONFIG
// ============================================================
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const userPhone = (localStorage.getItem('faster_phone') || "").trim();
const customerId = localStorage.getItem('faster_customer_id') || '';
const userName = localStorage.getItem('faster_name') || 'Customer';

// ============================================================
// URL PARAMS
// ============================================================
const urlParams = new URLSearchParams(window.location.search);
const vendorId = urlParams.get('id');

// ============================================================
// DOM REFERENCES
// ============================================================
const vendorNameEl = document.getElementById('vendorName');
const vendorTitleEl = document.getElementById('vendorTitle');
const vendorDescEl = document.getElementById('vendorDesc');
const vendorInitialEl = document.getElementById('vendorInitial');
const productsContainer = document.getElementById('productsContainer');
const cartBadge = document.getElementById('cartCountBadge');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// ============================================================
// CART FUNCTIONS
// ============================================================
function getCart() {
    try {
        return JSON.parse(localStorage.getItem('faster_cart')) || [];
    } catch { return []; }
}

function saveCart(cart) {
    localStorage.setItem('faster_cart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (total > 0) {
        cartBadge.innerText = total;
        cartBadge.classList.remove('hidden');
    } else {
        cartBadge.classList.add('hidden');
    }
}

function addToCart(productId, name, price) {
    const cart = getCart();
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id: productId, name, price, quantity: 1 });
    }
    saveCart(cart);
    showToast(`${name} added to cart`);
}

function showToast(msg) {
    toastMessage.innerText = msg;
    toast.classList.remove('opacity-0', 'translate-y-10');
    toast.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-10');
    }, 2000);
}

function openCart() {
    const cart = getCart();
    if (cart.length === 0) {
        showToast('Cart is empty');
        return;
    }
    let msg = '🛒 Your Cart:\n\n';
    let totalAmount = 0;
    cart.forEach(item => {
        msg += `${item.name} x${item.quantity} = Rs.${item.price * item.quantity}\n`;
        totalAmount += item.price * item.quantity;
    });
    msg += `\nTotal: Rs.${totalAmount}`;
    alert(msg);
    // Future: navigate to cart page
}

// ============================================================
// LOAD VENDOR & PRODUCTS
// ============================================================
async function loadVendorAndProducts() {
    if (!vendorId) {
        productsContainer.innerHTML = '<p class="col-span-2 text-center text-red-500 text-sm py-6">Vendor not specified</p>';
        return;
    }

    try {
        // 1. Fetch vendor details
        const { data: vendor, error: vErr } = await _supabase
            .from('vendors')
            .select('*')
            .eq('id', vendorId)
            .single();

        if (vErr || !vendor) {
            productsContainer.innerHTML = '<p class="col-span-2 text-center text-gray-500 text-sm py-6">Vendor not found</p>';
            return;
        }

        // Update header and vendor info
        vendorNameEl.innerText = vendor.name;
        vendorTitleEl.innerText = vendor.name;
        vendorDescEl.innerText = vendor.description || '';
        vendorInitialEl.innerText = vendor.name.charAt(0).toUpperCase();

        // 2. Fetch products
        const { data: products, error: pErr } = await _supabase
            .from('products')
            .select('*')
            .eq('vendor_id', vendorId)
            .eq('is_available', true)
            .order('sort_order', { ascending: true });

        if (pErr || !products || products.length === 0) {
            productsContainer.innerHTML = '<p class="col-span-2 text-center text-gray-400 text-sm py-6">No products available</p>';
            return;
        }

        renderProducts(products);

    } catch (e) {
        console.error('Error loading vendor:', e);
        productsContainer.innerHTML = '<p class="col-span-2 text-center text-red-500 text-sm py-6">Failed to load</p>';
    }
}

// ============================================================
// RENDER PRODUCTS
// ============================================================
function renderProducts(products) {
    productsContainer.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        const imgSrc = p.image_url || 'https://via.placeholder.com/300x120/f3f4f6/888?text=Product';

        card.innerHTML = `
            <img src="${imgSrc}" class="product-image" alt="${p.name}" onerror="this.src='https://via.placeholder.com/300x120/f3f4f6/888?text=Product'">
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-price">Rs. ${p.price}</div>
                <button class="add-to-cart-btn" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}">Add to Cart</button>
            </div>
        `;

        const btn = card.querySelector('.add-to-cart-btn');
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = this.dataset.id;
            const name = this.dataset.name;
            const price = parseFloat(this.dataset.price);
            addToCart(id, name, price);

            // Visual feedback
            this.innerText = 'Added ✓';
            this.classList.add('added');
            setTimeout(() => {
                this.innerText = 'Add to Cart';
                this.classList.remove('added');
            }, 2000);
        });

        productsContainer.appendChild(card);
    });
}

// ============================================================
// SIDEBAR & HEADER FUNCTIONS
// ============================================================
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function setGreeting() {
    const hour = new Date().getHours();
    let text = hour < 12 ? 'GOOD MORNING' : (hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING');
    document.getElementById('appbarGreeting').innerText = text;
}

function openNotifications() {
    localStorage.setItem('last_notif_read', new Date().toISOString());
    window.location.href = 'notifications.html';
}

async function logout() {
    if (confirm("Are you sure you want to logout?")) {
        await _supabase.auth.signOut();
        localStorage.clear();
        localStorage.setItem('faster_logged_out', 'true');
        setTimeout(() => { window.location.replace("index.html"); }, 500);
    }
}

// ============================================================
// CHECK NOTIFICATIONS (optional)
// ============================================================
async function checkNotifications() {
    // Minimal check – can be expanded
    try {
        const lastRead = localStorage.getItem('last_notif_read') || '2000-01-01T00:00:00.000Z';
        const { count } = await _supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('customer_phone', userPhone)
            .gt('created_at', lastRead);

        const badge = document.getElementById('notifBadge');
        const bell = document.getElementById('notifBell');
        if (count > 0) {
            badge.classList.add('active');
            bell.classList.add('bell-active');
        } else {
            badge.classList.remove('active');
            bell.classList.remove('bell-active');
        }
    } catch (e) { console.error("Notification check failed", e); }
}

// ============================================================
// LOAD LOGO
// ============================================================
async function loadLogo() {
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
}

// ============================================================
// WINDOW ONLOAD
// ============================================================
window.onload = () => {
    setGreeting();
    loadLogo();
    checkNotifications();
    updateCartBadge();
    loadVendorAndProducts();
};
