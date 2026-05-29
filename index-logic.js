const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Fetch Branding safely
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
        console.warn("Branding failed to load gracefully", err); 
    }
}

// Dropdowns me Cities Load karein
async function loadCities() {
    const { data, error } = await _supabase.from('delivery_areas').select('city').order('city');
    if (data && data.length > 0) {
        const uniqueCities = [...new Set(data.map(item => item.city))];
        const citySelect = document.getElementById('citySelect');
        uniqueCities.forEach(city => {
            citySelect.innerHTML += `<option value="${city}">${city}</option>`;
        });
    }
}

// City select hone par uske Areas load karein
async function loadAreas(selectedCity) {
    const areaSelect = document.getElementById('areaSelect');
    areaSelect.innerHTML = '<option value="">Select Area</option>'; 
    
    if(!selectedCity) return;

    const { data, error } = await _supabase.from('delivery_areas').select('area_name').eq('city', selectedCity).order('area_name');
    if (data && data.length > 0) {
        data.forEach(item => {
            areaSelect.innerHTML += `<option value="${item.area_name}">${item.area_name}</option>`;
        });
        areaSelect.innerHTML += `<option value="Other Area">Other Area</option>`;
    }
}

// GPS Location Autofill (OpenStreetMap)
async function autoDetectLocation() {
    const gpsBtnText = document.getElementById('gpsBtnText');
    const originalText = gpsBtnText.innerText;
    gpsBtnText.innerText = "Detecting...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await response.json();
                
                const detectedCity = data.address.city || data.address.town || data.address.county;
                
                if(detectedCity) {
                    const citySelect = document.getElementById('citySelect');
                    const cityOptions = Array.from(citySelect.options);
                    // Dropdown mein match check karega
                    const matchCity = cityOptions.find(opt => opt.value.toLowerCase().includes(detectedCity.toLowerCase()));
                    
                    if(matchCity) {
                        citySelect.value = matchCity.value;
                        await loadAreas(matchCity.value); // Us city ke areas load karega
                    }
                }
                
                // Address input wali line yahan se HATA di gayi hai
                // Ab Address dabba khali rahega taake customer khud apna makaan number likh sake
                
                gpsBtnText.innerText = "City & Area Detected!";
                setTimeout(() => gpsBtnText.innerText = originalText, 3000);

            } catch (err) {
                alert("Location fail ho gayi. Please manual type karein.");
                gpsBtnText.innerText = originalText;
            }
        }, (error) => {
            alert("Aapne location access deny kar diya hai.");
            gpsBtnText.innerText = originalText;
        });
    } else {
        alert("Aapka browser GPS support nahi karta.");
    }
}

// Google OAuth configuration
async function loginWithGoogle() {
    if (!navigator.onLine) {
        alert("No internet connection! Please check your network and try again.");
        return;
    }
    document.getElementById('loadingText').classList.remove('hidden');
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
    if (error) {
        alert("Login failed: " + error.message);
        document.getElementById('loadingText').classList.add('hidden');
    }
}

// Production-Grade Fail-Safe Auth Router
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

        const { data: customerRecord, error: dbError } = await _supabase
            .from('customers')
            .select('phone, name, city, area')
            .eq('email', userEmail)
            .maybeSingle();

        if (customerRecord && customerRecord.phone) {
            localStorage.setItem('faster_phone', customerRecord.phone);
            localStorage.setItem('faster_name', customerRecord.name);
            localStorage.setItem('faster_city', customerRecord.city || "");
            localStorage.setItem('faster_area', customerRecord.area || "");
            window.location.replace('home.html');
        } else {
            document.getElementById('nameInput').value = googleName || "";
            document.getElementById('subTitle').innerText = "Complete Your Profile";
            document.getElementById('profileFormSection').classList.remove('hidden');
        }

    } catch (err) {
        console.error("Auth Exception handled:", err);
        document.getElementById('googleLoginSection').classList.remove('hidden');
    } finally {
        document.getElementById('mainLoader').classList.add('hidden');
    }
}

// Update Profile Save Logic
async function saveProfile() {
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const city = document.getElementById('citySelect').value;
    const area = document.getElementById('areaSelect').value;
    const address = document.getElementById('addressInput').value.trim();
    
    const btn = document.getElementById('saveBtn');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');

    if (!name || !phone || !city || !area || !address) {
        alert("Please fill all fields, including City and Area!");
        return;
    }

    btn.disabled = true;
    btnText.innerText = 'Saving...';
    btnIcon.className = 'fas fa-circle-notch fa-spin';

    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            alert("Session expired. Please log in again.");
            window.location.reload();
            return;
        }

        const userEmail = session.user.email.toLowerCase();

        const { error } = await _supabase.from('customers').insert([{ 
            phone: phone, 
            name: name, 
            email: userEmail, 
            address: address,
            city: city,
            area: area
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
        btnText.innerText = 'Save & Continue';
        btnIcon.className = 'fas fa-arrow-right';
    }
}

// Initialize on load
window.onload = async () => {
    fetchBranding();
    loadCities(); // Yeh line dropdowns load karegi
    await checkAuthState();
};
