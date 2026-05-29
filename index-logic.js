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
    // Fast UI check: Agar local state valid hai to bina delay redirect karein
    if (localStorage.getItem('faster_phone')) {
        window.location.replace('home.html');
        return;
    }

    try {
        // Network check fallback
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
            .select('phone, name')
            .eq('email', userEmail)
            .maybeSingle();

        if (customerRecord && customerRecord.phone) {
            localStorage.setItem('faster_phone', customerRecord.phone);
            localStorage.setItem('faster_name', customerRecord.name);
            window.location.replace('home.html');
        } else {
            // Pre-fill profile creation form
            document.getElementById('nameInput').value = googleName || "";
            document.getElementById('subTitle').innerText = "Complete Your Profile";
            document.getElementById('profileFormSection').classList.remove('hidden');
        }

    } catch (err) {
        console.error("Auth Exception handled:", err);
        // Fallback option in case of connection drop
        document.getElementById('googleLoginSection').classList.remove('hidden');
    } finally {
        // Yeh block hamesha chalega aur loader ko crash state me bhi khatam kar dega
        document.getElementById('mainLoader').classList.add('hidden');
    }
}

// Save Profile Pipeline
async function saveProfile() {
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const address = document.getElementById('addressInput').value.trim();
    
    const btn = document.getElementById('saveBtn');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');

    if (!name || !phone || !address) {
        alert("Please fill all fields properly!");
        return;
    }

    if (!navigator.onLine) {
        alert("No internet connection! Please check your network and try again.");
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
            address: address 
        }]);

        if (error) throw error;

        localStorage.setItem('faster_phone', phone);
        localStorage.setItem('faster_name', name);
        window.location.replace('home.html');
        
    } catch (err) {
        alert("Error saving profile: " + err.message);
        btn.disabled = false;
        btnText.innerText = 'Save & Continue';
        btnIcon.className = 'fas fa-arrow-right';
    }
}

window.onload = async () => {
    fetchBranding();
    await checkAuthState();
};
