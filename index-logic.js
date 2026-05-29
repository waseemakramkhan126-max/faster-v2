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
    } catch (err) { }
}

// ==== MAP LOGIC ====

function openMapModal() {
    document.getElementById('mapModal').classList.remove('hidden');
    
    // Agar map pehle se load nahi hai toh banayein
    if (!map) {
        setTimeout(() => {
            map = L.map('map', { zoomControl: false }).setView([defaultLat, defaultLng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: 'Faster Delivery'
            }).addTo(map);

            // Open hote hi current location dhoondne ki koshish kare
            getCurrentGPS();
        }, 300); // UI load hone ka chota sa delay
    }
}

function closeMapModal() {
    document.getElementById('mapModal').classList.add('hidden');
}

// High Accuracy GPS function (5/6 foot area)
function getCurrentGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.flyTo([lat, lng], 18); // 18 is very high zoom level
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

    // Chota dabba show karein aur button ka text change karein
    document.getElementById('locationBadge').classList.remove('hidden');
    document.getElementById('mapBtnText').innerText = "Edit Pin";

    closeMapModal();

    // Map confirm hone par City/Area Dropdown auto-select karne ki koshish
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
    } catch (err) { }
}

// ==== DROPDOWN LOGIC (With "is_active" Filter & "Other" Option) ====

async function loadCities() {
    const citySelect = document.getElementById('citySelect');
    citySelect.innerHTML = '<option value="">Select City</option>';

    // Sirf woh cities uthao jinki service chal rahi hai (is_active = true)
    const { data, error } = await _supabase.from('delivery_areas').select('city').eq('is_active', true);
    
    if (data && data.length > 0) {
        const uniqueCities = [...new Set(data.map(item => item.city))].sort();
        uniqueCities.forEach(city => {
            citySelect.innerHTML += `<option value="${city}">${city}</option>`;
        });
    }
    
    // End par ek option jo service area mein nahi hain
    citySelect.innerHTML += `<option value="Other City">Other / Not in my City</option>`;
}

async function loadAreas(selectedCity) {
    const areaSelect = document.getElementById('areaSelect');
    areaSelect.innerHTML = '<option value="">Select Area</option>'; 
    
    // Agar "Other City" select kiya hai toh area mein bhi "Other" dikhao
    if(!selectedCity || selectedCity === "Other City") {
        if(selectedCity === "Other City"){
            areaSelect.innerHTML += `<option value="Other Area">Other Area</option>`;
        }
        return;
    }

    // Sirf Active areas uthao
    const { data, error } = await _supabase.from('delivery_areas')
        .select('area_name')
        .eq('city', selectedCity)
        .eq('is_active', true)
        .order('area_name');

    if (data && data.length > 0) {
        data.forEach(item => {
            areaSelect.innerHTML += `<option value="${item.area_name}">${item.area_name}</option>`;
        });
    }
    
    // End par "Other Area"
    areaSelect.innerHTML += `<option value="Other Area">Other / Not in my Area</option>`;
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
    if (localStorage.getItem('faster_phone')) {
        window.location.replace('home.html');
        return;
    }

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

        const { data: customerRecord } = await _supabase.from('customers').select('phone, name, city, area').eq('email', userEmail).maybeSingle();

        if (customerRecord && customerRecord.phone) {
            localStorage.setItem('faster_phone', customerRecord.phone);
            localStorage.setItem('faster_name', customerRecord.name);
            localStorage.setItem('faster_city', customerRecord.city || "");
            localStorage.setItem('faster_area', customerRecord.area || "");
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
    
    // Map Lat/Lng
    const lat = document.getElementById('latInput').value;
    const lng = document.getElementById('lngInput').value;
    
    const btn = document.getElementById('saveBtn');
    
    if (!name || !phone || !city || !area || !address) {
        alert("Please fill all details!");
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

        // Saving to database including Lat and Lng
        const { error } = await _supabase.from('customers').insert([{ 
            phone: phone, name: name, email: userEmail, 
            address: address, city: city, area: area,
            lat: String(lat), lng: String(lng)
        }]);

        if (error) throw error;

        localStorage.setItem('faster_phone', phone);
        localStorage.setItem('faster_name', name);
        localStorage.setItem('faster_city', city);
        localStorage.setItem('faster_area', area);
        window.location.replace('home.html');
        
    } catch (err) {
        alert("Error saving profile: " + err.message);
        btn.disabled = false;
        btn.innerHTML = `<span>Save & Continue</span><i class="fas fa-arrow-right"></i>`;
    }
}

window.onload = async () => {
    fetchBranding();
    loadCities();
    await checkAuthState();
};
