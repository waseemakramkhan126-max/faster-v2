/* =====================================================
   Faster Delivery — index.js
   =====================================================
   Ye file index.html ke saath load hoti hai.
   Supabase client, auth, map, dropdowns, aur profile save
   ka saara logic yahan hai.
   ===================================================== */

// ==== SUPABASE CLIENT ====
const _supabase = supabase.createClient(
    "https://hkabhikizdlbavfkualt.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U"
);

// ==== GLOBAL STATE ====
let map;
let citiesList = [];
let currentAreas = [];
let selectedCity = null;
let selectedArea = null;
let exactLatLng = "";

window.cityAreaMap = new Map();
window.areaHasBlocksMap = new Map();

// ==== DELIVERY DATA LOAD ====
async function loadDeliveryData() {
    const { data, error } = await _supabase
        .from('delivery_areas')
        .select('city, area_name, has_blocks')
        .eq('is_active', true);

    if (error) { console.error(error); return; }

    const citySet = new Set();
    const cityAreaMap = new Map();
    const areaHasBlocksMap = new Map();

    data.forEach(row => {
        const c = row.city.trim();
        const a = row.area_name.trim();
        citySet.add(c);
        if (!cityAreaMap.has(c)) cityAreaMap.set(c, []);
        cityAreaMap.get(c).push(a);
        areaHasBlocksMap.set(a, row.has_blocks);
    });

    citiesList = Array.from(citySet).sort();
    window.cityAreaMap = cityAreaMap;
    window.areaHasBlocksMap = areaHasBlocksMap;
}

// ==== BLOCK VISIBILITY ====
function toggleBlockVisibility(areaName) {
    const container = document.getElementById('blockContainer');
    if (!areaName) {
        container.classList.add('hidden');
        return;
    }
    const hasBlocks = window.areaHasBlocksMap?.get(areaName) === true;
    if (hasBlocks) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

// ==== AUTH & REDIRECTION ====
async function checkAuthState() {
    try {
        if (!navigator.onLine) {
            document.getElementById('mainLoader').classList.add('hidden');
            document.getElementById('googleLoginSection').classList.remove('hidden');
            return;
        }

        const { data: { session }, error } = await _supabase.auth.getSession();

        if (error || !session) {
            document.getElementById('googleLoginSection').classList.remove('hidden');
            return;
        }

        const userEmail = session.user.email.toLowerCase();
        const googleName = session.user.user_metadata.full_name;
        const loggedOutFlag = localStorage.getItem('faster_logged_out');

        const { data: cust } = await _supabase
            .from('customers')
            .select('phone, name, city, area, block, address, customer_id')
            .eq('email', userEmail)
            .maybeSingle();

        // Normal login: agar phone mojood hai aur logout flag nahi hai -> direct home
        if (cust && cust.phone && loggedOutFlag !== 'true') {
            localStorage.setItem('faster_phone', cust.phone);
            localStorage.setItem('faster_name', cust.name || '');
            localStorage.setItem('faster_city', cust.city || '');
            localStorage.setItem('faster_area', cust.area || '');
            localStorage.setItem('faster_block', cust.block || '');
            localStorage.setItem('faster_customer_id', cust.customer_id || '');
            window.location.replace('home.html');
            return;
        }

        // Warna form dikhao (logout ke baad ya pehli baar)
        if (loggedOutFlag === 'true') {
            localStorage.removeItem('faster_logged_out');
        }

        if (cust) {
            document.getElementById('nameInput').value = cust.name || googleName || '';
            document.getElementById('phoneInput').value = cust.phone || '';
            document.getElementById('addressInput').value = cust.address || '';

            if (cust.city) {
                selectedCity = cust.city;
                const cityEl = document.getElementById('cityDisplay');
                cityEl.textContent = cust.city;
                cityEl.classList.remove('text-gray-500');
                cityEl.classList.add('text-gray-900');
                cityEl.closest('.dropdown-btn').classList.add('is-filled');
                await refreshAreasForCity(cust.city);
            }

            if (cust.area) {
                selectedArea = cust.area;
                const areaEl = document.getElementById('areaDisplay');
                areaEl.textContent = cust.area;
                areaEl.classList.remove('text-gray-500');
                areaEl.classList.add('text-gray-900');
                areaEl.closest('.dropdown-btn').classList.add('is-filled');
                toggleBlockVisibility(cust.area);
            }

            if (cust.block) {
                document.getElementById('blockInput').value = cust.block;
            }
        } else {
            document.getElementById('nameInput').value = googleName || '';
        }

        document.getElementById('profileFormSection').classList.remove('hidden');
    } catch (err) {
        console.error('Auth check error:', err);
        document.getElementById('googleLoginSection').classList.remove('hidden');
    } finally {
        document.getElementById('mainLoader').classList.add('hidden');
    }
}

async function loginWithGoogle() {
    if (!navigator.onLine) { alert('No internet!'); return; }
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://waseemakramkhan126-max.github.io/faster-v2/index.html' } // 👈 YEH NAYA LINK LAGAYEIN
    });
    if (error) alert(error.message);
}

// ==== MAP ====
function openMapModal() {
    document.getElementById('mapModal').classList.replace('map-leave', 'map-enter');
    if (!map) {
        map = L.map('map', { zoomControl: false }).setView([31.5204, 74.3587], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        setTimeout(() => { map.invalidateSize(); locateMe(); }, 300);
    }
}

function closeMapModal() {
    document.getElementById('mapModal').classList.replace('map-enter', 'map-leave');
}

function locateMe() {
    if (!navigator.geolocation) { alert('GPS not supported'); return; }
    navigator.geolocation.getCurrentPosition(
        pos => map.flyTo([pos.coords.latitude, pos.coords.longitude], 18, { duration: 1.5 }),
        () => alert('Enable location permission.'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

async function confirmLocation() {
    const center = map.getCenter();
    document.getElementById('latInput').value = center.lat;
    document.getElementById('lngInput').value = center.lng;
    exactLatLng = `${center.lat},${center.lng}`;
    document.getElementById('locationBadge').classList.remove('hidden');
    document.getElementById('locBtn').classList.add('pin-saved');
    closeMapModal();

    // Auto-detect city
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lng}`);
        const data = await res.json();
        const addr = data.address || {};
        const detectedCity = addr.city || addr.town || addr.county;
        if (detectedCity && citiesList.includes(detectedCity)) {
            selectCityByName(detectedCity);
        }
    } catch (e) { console.warn('City auto-detect failed'); }
}

function selectCityByName(cityName) {
    selectedCity = cityName;
    const cityEl = document.getElementById('cityDisplay');
    cityEl.textContent = cityName;
    cityEl.classList.remove('text-gray-500');
    cityEl.classList.add('text-gray-900');
    cityEl.closest('.dropdown-btn').classList.add('is-filled');

    selectedArea = null;
    const areaEl = document.getElementById('areaDisplay');
    areaEl.textContent = 'Select area';
    areaEl.classList.add('text-gray-500');
    areaEl.classList.remove('text-gray-900');
    areaEl.closest('.dropdown-btn').classList.remove('is-filled');
    toggleBlockVisibility(null);
    refreshAreasForCity(cityName);
}

// ==== CITY / AREA MODALS ====
function openCityModal() {
    document.getElementById('modalTitle').textContent = 'Select City';
    const list = document.getElementById('modalList');
    list.innerHTML = '';

    // Not in my city
    const notListed = document.createElement('div');
    notListed.className = 'list-item font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer flex justify-between';
    notListed.innerHTML = '<span>Not in my city</span><i class="fas fa-times-circle text-gray-300"></i>';
    notListed.onclick = () => {
        selectedCity = null;
        const cityEl = document.getElementById('cityDisplay');
        cityEl.textContent = 'Select city';
        cityEl.classList.add('text-gray-500');
        cityEl.classList.remove('text-gray-900');
        cityEl.closest('.dropdown-btn').classList.remove('is-filled');

        selectedArea = null;
        const areaEl = document.getElementById('areaDisplay');
        areaEl.textContent = 'Select area';
        areaEl.classList.add('text-gray-500');
        areaEl.classList.remove('text-gray-900');
        areaEl.closest('.dropdown-btn').classList.remove('is-filled');
        toggleBlockVisibility(null);
        closeSelectionModal();
    };
    list.appendChild(notListed);

    citiesList.forEach(city => {
        const div = document.createElement('div');
        div.className = 'list-item font-semibold text-gray-700 hover:bg-blue-50 cursor-pointer flex justify-between';
        div.textContent = city;
        if (selectedCity === city) div.classList.add('bg-blue-50', 'text-blue-700');
        div.onclick = () => selectCity(city);
        list.appendChild(div);
    });

    showSelectionModal();
}

function selectCity(city) {
    selectedCity = city;
    const cityEl = document.getElementById('cityDisplay');
    cityEl.textContent = city;
    cityEl.classList.remove('text-gray-500');
    cityEl.classList.add('text-gray-900');
    cityEl.closest('.dropdown-btn').classList.add('is-filled');

    selectedArea = null;
    const areaEl = document.getElementById('areaDisplay');
    areaEl.textContent = 'Select area';
    areaEl.classList.add('text-gray-500');
    areaEl.classList.remove('text-gray-900');
    areaEl.closest('.dropdown-btn').classList.remove('is-filled');
    toggleBlockVisibility(null);
    refreshAreasForCity(city);
    closeSelectionModal();
}

function openAreaModal() {
    if (!selectedCity) { alert('Please select city first.'); return; }
    document.getElementById('modalTitle').textContent = 'Select Area';
    const list = document.getElementById('modalList');
    list.innerHTML = '';

    const notListed = document.createElement('div');
    notListed.className = 'list-item font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer flex justify-between';
    notListed.innerHTML = '<span>Not in my area</span><i class="fas fa-times-circle text-gray-300"></i>';
    notListed.onclick = () => {
        selectedArea = null;
        const areaEl = document.getElementById('areaDisplay');
        areaEl.textContent = 'Select area';
        areaEl.classList.add('text-gray-500');
        areaEl.classList.remove('text-gray-900');
        areaEl.closest('.dropdown-btn').classList.remove('is-filled');
        toggleBlockVisibility(null);
        closeSelectionModal();
    };
    list.appendChild(notListed);

    if (currentAreas.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'p-3 text-center text-gray-400 font-semibold';
        empty.textContent = 'No areas found.';
        list.appendChild(empty);
    } else {
        currentAreas.forEach(area => {
            const div = document.createElement('div');
            div.className = 'list-item font-semibold text-gray-700 hover:bg-blue-50 cursor-pointer flex justify-between';
            div.textContent = area;
            if (selectedArea === area) div.classList.add('bg-blue-50', 'text-blue-700');
            div.onclick = () => selectArea(area);
            list.appendChild(div);
        });
    }

    showSelectionModal();
}

function selectArea(area) {
    selectedArea = area;
    const areaEl = document.getElementById('areaDisplay');
    areaEl.textContent = area;
    areaEl.classList.remove('text-gray-500');
    areaEl.classList.add('text-gray-900');
    areaEl.closest('.dropdown-btn').classList.add('is-filled');
    toggleBlockVisibility(area);
    closeSelectionModal();
}

function showSelectionModal() {
    const m = document.getElementById('selectionModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
}

function closeSelectionModal() {
    const m = document.getElementById('selectionModal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

async function refreshAreasForCity(city) {
    if (!window.cityAreaMap || !window.cityAreaMap.has(city)) {
        currentAreas = [];
        return;
    }
    const { data } = await _supabase
        .from('delivery_areas')
        .select('area_name')
        .eq('city', city)
        .eq('is_active', true);
    currentAreas = data ? data.map(r => r.area_name.trim()).sort() : [];
}

// ==== SAVE PROFILE (with guest merge + orphan backfill) ====
async function saveProfile() {
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const address = document.getElementById('addressInput').value.trim();
    const block = document.getElementById('blockInput').value.trim();
    const lat = document.getElementById('latInput').value;
    const lng = document.getElementById('lngInput').value;

    // Basic validation
    if (!name || !phone || !selectedCity || !selectedArea || !address) {
        alert('Please fill all required fields.');
        return;
    }

    // Block validation
    const needsBlock = window.areaHasBlocksMap?.get(selectedArea) === true;
    if (needsBlock && !block) {
        alert('Is area ke exact delivery charges nikaalne ke liye Block laazmi hai!');
        return;
    }

    // Location validation
    if (!lat || !lng) {
        alert('Please pin your location on the map.');
        return;
    }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    document.getElementById('btnIcon').className = 'fas fa-spinner fa-spin';
    document.getElementById('btnText').textContent = 'Saving...';

    try {
        const { data: { session } } = await _supabase.auth.getSession();
        const userEmail = session.user.email.toLowerCase();

        const profileData = {
            name,
            address,
            city: selectedCity,
            area: selectedArea,
            block: block || null,
            lat: String(lat),
            lng: String(lng),
            location: `${lat},${lng}`
        };

        // Step 1: Phone se guest record dhoondo
        const { data: guestRecord } = await _supabase
            .from('customers')
            .select('customer_id, email')
            .eq('phone', phone)
            .maybeSingle();

        // Step 2: Email se existing record dhoondo
        const { data: emailRecord } = await _supabase
            .from('customers')
            .select('customer_id')
            .eq('email', userEmail)
            .maybeSingle();

        let finalCustomerId = null;

        if (guestRecord) {
            if (guestRecord.email === userEmail) {
                // Same email+phone -> normal update
                const { data, error } = await _supabase.from('customers')
                    .update(profileData).eq('customer_id', guestRecord.customer_id).select('customer_id');
                if (error) throw error;
                if (data?.[0]) finalCustomerId = data[0].customer_id;
            } else if (guestRecord.email && !guestRecord.email.includes('@faster.local')) {
                // Phone kisi aur real account se juda hai -> error
                throw new Error("Yeh phone number pehle hi kisi aur account ke sath register hai! Kripya apna sahi number darj karein.");
            } else {
                // Guest record (WhatsApp link wala) -> is Google email se link kar do
                if (emailRecord && emailRecord.customer_id !== guestRecord.customer_id) {
                    // Agar is user ka koi khali record pehle se hai, use delete karo
                    await _supabase.from('customers').delete().eq('customer_id', emailRecord.customer_id);
                }
                const { data, error } = await _supabase.from('customers')
                    .update({ email: userEmail, phone, ...profileData })
                    .eq('customer_id', guestRecord.customer_id).select('customer_id');
                if (error) throw error;
                if (data?.[0]) finalCustomerId = data[0].customer_id;
            }
        } else {
            if (emailRecord) {
                // Email ka record hai -> naya phone add karo
                const { data, error } = await _supabase.from('customers')
                    .update({ phone, ...profileData })
                    .eq('customer_id', emailRecord.customer_id).select('customer_id');
                if (error) {
                    if (error.code === '23505' && error.message.toLowerCase().includes('phone')) {
                        throw new Error('This phone number is already registered with another account.');
                    }
                    throw error;
                }
                if (data?.[0]) finalCustomerId = data[0].customer_id;
            } else {
                // Bilkul naya user -> insert
                const { data, error } = await _supabase.from('customers')
                    .insert([{ email: userEmail, phone, ...profileData }]).select('customer_id');
                if (error) {
                    if (error.code === '23505' && error.message.toLowerCase().includes('phone')) {
                        throw new Error('This phone number is already registered with another account.');
                    }
                    throw error;
                }
                if (data?.[0]) finalCustomerId = data[0].customer_id;
            }
        }

        // Step 3: PURANE ORPHAN ORDERS KO LINK KARO
        // (jo guest orders customer_id = NULL ke saath pade hain)
        if (finalCustomerId) {
            const { error: backfillErr } = await _supabase.from('orders')
                .update({ customer_id: finalCustomerId })
                .eq('customer_phone', phone)
                .is('customer_id', null);
            if (backfillErr) console.warn('Orphan orders backfill failed:', backfillErr);
        }

        // LocalStorage update
        localStorage.setItem('faster_phone', phone);
        localStorage.setItem('faster_name', name);
        localStorage.setItem('faster_city', selectedCity);
        localStorage.setItem('faster_area', selectedArea);
        localStorage.setItem('faster_block', block || '');
        if (finalCustomerId) {
            localStorage.setItem('faster_customer_id', String(finalCustomerId));
        }

        window.location.replace('home.html');
    } catch (err) {
        alert(err.message || 'Error saving profile. Please try again.');
        btn.disabled = false;
        document.getElementById('btnIcon').className = 'fas fa-arrow-right';
        document.getElementById('btnText').textContent = 'Save & Continue';
    }
}

// ==== INIT ====
window.addEventListener('DOMContentLoaded', async () => {
    // Selection modal ke bahar click par close
    const selModal = document.getElementById('selectionModal');
    if (selModal) {
        selModal.addEventListener('click', e => {
            if (e.target === selModal) closeSelectionModal();
        });
    }

    await loadDeliveryData();
    await checkAuthState();
});
