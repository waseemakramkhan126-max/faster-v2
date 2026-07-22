// Supabase Connection
const SB_URL = "https://hkabhikizdlbavfkualt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrYWJoaWtpemRsYmF2Zmt1YWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODgyMjUsImV4cCI6MjA5MjA2NDIyNX0.iMlS6-M1aylW8K915LPYDHOg7qUxwu5GelH_CPHLP2U";
const _supabase = supabase.createClient(SB_URL, SB_KEY);

const myPhone = localStorage.getItem('faster_phone');
const myId = localStorage.getItem('faster_customer_id') || myPhone;

// 1. Search User by Phone
async function searchUser() {
    const phone = document.getElementById('searchPhone').value.trim();
    if(!phone) return alert("Please enter a phone number");

    const { data, error } = await _supabase
        .from('customers')
        .select('customer_id, name, phone')
        .eq('phone', phone)
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

// 2. Start Chat (Call the SQL function we created earlier)
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

    // Redirect to the chat room we just built
    window.location.href = `chat-room.html?conversation_id=${convId}`;
}
