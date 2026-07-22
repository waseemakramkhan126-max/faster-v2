// Supabase Connection
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // Apni key yahan rakhein
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const myPhone = localStorage.getItem('faster_phone');
const myId = localStorage.getItem('faster_customer_id') || myPhone;

// 🟢 1. Main Search Logic (Phone number lakar check karega)
async function searchUser(phoneNumber) {
    if(!phoneNumber) return alert("Please enter a phone number");

    const { data, error } = await _supabase
        .from('customers')
        .select('customer_id, name, phone')
        .eq('phone', phoneNumber)
        .maybeSingle();

    const resultDiv = document.getElementById('searchResult');
    if(error || !data) {
        resultDiv.innerHTML = `<p class="text-red-500 font-bold text-sm bg-red-50 p-2 rounded-lg text-center">User not found on Faster. Invite them!</p>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    if(data.customer_id === myId) {
        resultDiv.innerHTML = `<p class="text-orange-500 font-bold text-sm bg-orange-50 p-2 rounded-lg text-center">You cannot chat with yourself!</p>`;
        resultDiv.classList.remove('hidden');
        return;
    }

    // Found user - Show Start Chat button
    resultDiv.innerHTML = `
        <div class="bg-blue-50 p-3 rounded-xl flex justify-between items-center border border-blue-200 shadow-sm">
            <div>
                <p class="font-bold text-gray-800">${data.name}</p>
                <p class="text-xs text-gray-500">${data.phone}</p>
            </div>
            <button onclick="startChat('${data.customer_id}')" class="bg-[#0077b9] text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm active:scale-95 transition-transform">Start Chat</button>
        </div>
    `;
    resultDiv.classList.remove('hidden');
}

// 🟢 2. Top Search Button se call hoga
function searchUserFromTop() {
    const phone = document.getElementById('searchPhone').value.trim();
    searchUser(phone);
}

// 🟢 3. Footer (Neche wale) Send Arrow se call hoga
function searchUserFromFooter() {
    const phone = document.getElementById('searchPhoneFooter').value.trim();
    searchUser(phone);
    // Search karne ke baad input clear kar dijiye (optional)
    document.getElementById('searchPhoneFooter').value = '';
}

// 🟢 4. Start Chat Function (Same as before)
async function startChat(otherUserId) {
    const { data: convId, error } = await _supabase
        .rpc('get_or_create_conversation', { 
            user1: myId, 
            user2: otherUserId 
        });

    if(error) {
        console.error(error);
        return alert("Error creating chat room. Try again.");
    }

    window.location.href = `chat-room.html?conversation_id=${convId}`;
}
