// =========================================================
// LOCATION MODULE
// =========================================================

let selectedLat = null;
let selectedLng = null;
let selectedLocName = '';
let selectedLocAddress = '';
let locationMap = null;
let locationMarker = null;

// Open full screen location
function shareLocation() {
    closeAttachPopup();
    setTimeout(() => {
        const popup = document.getElementById('locationPopup');
        const overlay = document.getElementById('locationPopupOverlay');
        popup.classList.remove('hidden');
        overlay.classList.remove('hidden');
        popup.style.display = 'flex';
        
        // Reset
        selectedLat = null;
        selectedLng = null;
        var sendBtn = document.getElementById('sendLocationBtn');
        if (sendBtn) sendBtn.disabled = true;
        var selCard = document.getElementById('locationSelectedCard');
        if (selCard) selCard.classList.add('hidden');
        
        // Init map
        setTimeout(() => initLocationMap(), 300);
    }, 350);
}

// Close location
function closeLocationPopup() {
    const popup = document.getElementById('locationPopup');
    const overlay = document.getElementById('locationPopupOverlay');
    popup.classList.add('hidden');
    overlay.classList.add('hidden');
    popup.style.display = '';
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
}

// Initialize Map
function initLocationMap() {
    const container = document.getElementById('locationMap');
    if (!container) return;
    
    if (locationMap) {
        locationMap.remove();
        locationMap = null;
    }
    
    const defaultLat = 30.3753;
    const defaultLng = 69.3451;
    
    locationMap = L.map('locationMap', {
        center: [defaultLat, defaultLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(locationMap);
    
    setTimeout(() => {
        locationMap.invalidateSize();
    }, 500);
    
    // Update location on map move
    locationMap.on('moveend', function() {
        const center = locationMap.getCenter();
        updateLocationInfo(center.lat, center.lng);
    });
    
    // Get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
                updateLocationInfo(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
                updateLocationInfo(defaultLat, defaultLng);
            }
        );
    }
}

// Go to my location
function goToMyLocation() {
    if (!locationMap) return;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locationMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
            },
            () => alert("Location access denied.")
        );
    }
}

// Update location info
function updateLocationInfo(lat, lng) {
    selectedLat = lat;
    selectedLng = lng;
    
    const card = document.getElementById('locationSelectedCard');
    const nameEl = document.getElementById('locationCardName');
    const addrEl = document.getElementById('locationCardAddress');
    const sendBtn = document.getElementById('sendLocationBtn');
    
    nameEl.textContent = 'Selected Location';
    addrEl.textContent = '';
    card.classList.remove('hidden');
    sendBtn.disabled = false;
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.display_name) {
                selectedLocName = data.display_name.split(',')[0] || 'Selected Location';
                selectedLocAddress = data.display_name;
            } else {
                selectedLocName = 'Selected Location';
                selectedLocAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
            nameEl.textContent = selectedLocName;
            addrEl.textContent = selectedLocAddress;
        })
        .catch(() => {
            selectedLocName = 'Selected Location';
            selectedLocAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            nameEl.textContent = selectedLocName;
            addrEl.textContent = selectedLocAddress;
        });
}

// Confirm and send location
async function confirmLocation() {
    if (!selectedLat || !selectedLng) {
        alert("Select a location first.");
        return;
    }
    const comment = document.getElementById('locationComment').value.trim();
    const mapUrl = `https://maps.google.com/maps?q=${selectedLat},${selectedLng}`;
    const msg = `📍 ${selectedLocName}${comment ? '\n' + comment : ''}\n${mapUrl}`;
    closeLocationPopup();
    await sendMessage(msg);
}

// Smart Back Button Handling
function handleLocationBack() {
    closeLocationPopup();
}

// Override back button (runs after DOM loads)
document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.querySelector('#locationTopBar button');
    if (backBtn) {
        backBtn.onclick = handleLocationBack;
    }
});
