const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let map;
let defaultLat = 31.5204; // Lahore as default
let defaultLng = 74.3587;

async function fetchBranding() {
    try {
        if(!navigator.onLine) return;
        const { data } = await _supabase.from('app_settings').select('logo_url').eq('id', 1).single();
        if (data && data.logo_url) {
            const img = document.getElementById('appLogo');
            img.src = data.logo_url;
            img.classList.remove('hidden');
            document.getElementById('logoFallback').classList.add('hidden');
        }
    } catch (err) { 
        console.warn("Branding fetch error:", err);
    }
}

// ==== MAP LOGIC ====

function openMapModal() {
    document.getElementById('mapModal').classList.remove('hidden');
    
    if (!map) {
        setTimeout(() => {
            map = L.map('map', { zoomControl: false }).setView([defaultLat, defaultLng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: 'Faster Delivery'
            }).addTo(map);

            getCurrentGPS();
        }, 300);
    }
}

function closeMapModal() {
    document.getElementById('mapModal').classList.add('hidden');
}

function getCurrentGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.flyTo([lat, lng], 18);
        }, (err) => {
            alert("Please allow location access to get exact pin.");
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
}

async function confirmLocation() {
    const center = map.getCenter();
    document.getElementById('latInput').value = center.lat;
    document.getElementById('lngInput').value = center.lng;

    document.getElementById('locationBadge').classList.remove('hidden');
    document.getElementById('mapBtnText').innerText = "Edit Pin";

    closeMapModal();

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lng}`);
        const data = await response.json();
        const detectedCity = data.address.city || data.address.town || data.address.county;
        
        if(detectedCity) {
            const citySelect = document.getElementById('citySelect');
            const cityOptions = Array.from(citySelect.options);
            const matchCity = cityOptions.find(opt => opt.value.toLowerCase().includes(detectedCity.toLowerCase()));
            
            if(matchCity) {
                citySelect.value = matchCity.value;
                await loadAreas(matchCity.value);
            }
        }
    } catch (err) {
        console.warn("Auto-detect city failed:", err);
    }
}

// ==== DROPDOWN & DYNAMIC BLOCK LOGIC ====

async function loadCities() {
    const citySelect = document.getElementById('citySelect');
    citySelect.innerHTML = '<option value="">Select City</option>';

    const { data, error } = await _supabase.from('delivery_areas').select('city').eq('is_active', true);
    
    if (data && data.length > 0) {
        const uniqueCities = [...new Set(data.map(item => item.city))].sort();
        uniqueCities.forEach(city => {
            citySelect.innerHTML += `<option value="${city}">${city}</option>`;
        });
    }
    
    citySelect.innerHTML += `<option value="Other City">Other / Not in my City</option>`;
}

async function loadAreas(selectedCity) {
    const areaSelect = document.getElementById('areaSelect');
    // Default option mein data-has-blocks false set kiya hai
    areaSelect.innerHTML = '<option value="" data-has-blocks="false">Select Area</option>'; 
    
    if(!selectedCity || selectedCity === "Other City") {
        if(selectedCity === "Other City"){
            areaSelect.innerHTML += `<option value="Other Area" data-has-blocks="false">Other Area</option>`;
        }
        checkBlockRequirement(); // Form reset hone par block hide karne ke liye
        return;
    }

    // Database se area_name ke sath 'has_blocks' bhi fetch kar rahe hain
    const { data, error } = await _supabase.from('delivery_areas')
        .select('area_name, has_blocks')
        .eq('city', selectedCity)
        .eq('is_active', true)
        .order('area_name');

    if (data && data.length > 0) {
        data.forEach(item => {
            // HTML attribute mein save kar diya taake bar bar database na check karna pare
            areaSelect.innerHTML += `<option value="${item.area_name}" data-has-blocks="${item.has_blocks || false}">${item.area_name}</option>`;
        });
    }
    
    areaSelect.innerHTML += `<option value="Other Area" data-has-blocks="false">Other / Not in my Area</option>`;
    checkBlockRequirement();
}

// Naya Function: Block hide/show karne aur lazmi qaraar dene ke liye
function checkBlockRequirement() {
    const areaSelect = document.getElementById('areaSelect');
    const blockContainer = document.getElementById('blockContainer'); // HTML me is div ki ID zaroor dein
    const blockInput = document.getElementById('blockInput');

    if (areaSelect.selectedIndex === -1) return;

    const selectedOption = areaSelect.options[areaSelect.selectedIndex];
    const hasBlocks = selectedOption.getAttribute('data-has-blocks') === 'true';

    if (hasBlocks) {
        if(blockContainer) blockContainer.classList.remove('hidden');
        blockInput.setAttribute('required', 'true');
    } else {
        if(blockContainer) blockContainer.classList.add('hidden');
        blockInput.removeAttribute('required');
        blockInput.value = ""; // Chote areas k liye field khali kar di
    }
}


// ==== AUTH & SAVE LOGIC ====

async function loginWithGoogle() {
    if (!navigator.onLine) {
        alert("No internet connection! Please check your network and try again.");
        return;
    }
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
}

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

        const { data: customerRecord } = await _supabase.from('customers').select('phone, name, city, area, block').eq('email', userEmail).maybeSingle();

        if (customerRecord && customerRecord.phone) {
            localStorage.setItem('faster_phone', customerRecord.phone);
            localStorage.setItem('faster_name', customerRecord.name);
            localStorage.setItem('faster_city', customerRecord.city || "");
            localStorage.setItem('faster_area', customerRecord.area || "");
            localStorage.setItem('faster_block', customerRecord.block || ""); 
            window.location.replace('home.html');
        } else {
            document.getElementById('nameInput').value = googleName || "";
            document.getElementById('profileFormSection').classList.remove('hidden');
        }
    } catch (err) {
        document.getElementById('googleLoginSection').classList.remove('hidden');
    } finally {
        document.getElementById('mainLoader').classList.add('hidden');
    }
}

async function saveProfile() {
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const city = document.getElementById('citySelect').value;
    const area = document.getElementById('areaSelect').value;
    const address = document.getElementById('addressInput').value.trim();
    
    const blockInput = document.getElementById('blockInput');
    const block = blockInput.value.trim();
    const isBlockRequired = blockInput.hasAttribute('required');
    
    const lat = document.getElementById('latInput').value;
    const lng = document.getElementById('lngInput').value;
    
    const btn = document.getElementById('saveBtn');
    
    // 1. Basic fields validation
    if (!name || !phone || !city || !area || !address) {
        alert("Please fill all required details!");
        return;
    }

    // 2. Dynamic Block Validation
    if (isBlockRequired && !block) {
        alert("Is area ke exact delivery charges nikaalne ke liye Block laazmi hai!");
        return;
    }

    if (!lat || !lng) {
        alert("Please set your location pin on the map!");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Saving...`;

    try {
        const { data: { session } } = await _supabase.auth.getSession();
        const userEmail = session.user.email.toLowerCase();

        // 3. STRONG UPSERT: Email ki base par check karega
        const { error } = await _supabase.from('customers').upsert([{ 
            email: userEmail, // Email ab identity check hai
            phone: phone, 
            name: name, 
            address: address, 
            city: city, 
            area: area, 
            block: block || null,
            lat: String(lat), 
            lng: String(lng)
        }], { onConflict: 'email' }); // Conflict hamesha email par!

        // 4. SMART ERROR HANDLING: Agar number pehle se majood hai
        if (error) {
            // Postgres error code '23505' ka matlab hai "Unique Violation"
            if (error.code === '23505' && error.message.includes('phone')) {
                throw new Error("Yeh phone number pehle hi kisi aur account ke sath register hai! Kripya apna sahi number darj karein.");
            }
            throw error; // Agar koi aur error hai toh normally handle kare
        }

        // 5. Success hone par LocalStorage update aur redirect
        localStorage.setItem('faster_phone', phone);
        localStorage.setItem('faster_name', name);
        localStorage.setItem('faster_city', city);
        localStorage.setItem('faster_area', area);
        localStorage.setItem('faster_block', block || ""); 
        
        window.location.replace('home.html');
        
    } catch (err) {
        // User ko clean error dikhayen
        alert(err.message || "Error saving profile. Please try again.");
        btn.disabled = false;
        btn.innerHTML = `<span>Save & Continue</span><i class="fas fa-arrow-right"></i>`;
    }
}

window.onload = async () => {
    fetchBranding();
    loadCities();
    
    // Dropdowns ke events
    document.getElementById('citySelect').addEventListener('change', (e) => loadAreas(e.target.value));
    document.getElementById('areaSelect').addEventListener('change', checkBlockRequirement);
    
    await checkAuthState();
};
