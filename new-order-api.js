// ==========================================
// 4. DATABASE & SUBMIT LOGIC
// ==========================================

async function initPage() {
    if(!userPhone) { return window.location.replace('index.html'); }
    
    document.getElementById('editName').value = localStorage.getItem('faster_name') || "";
    document.getElementById('editAddress').value = localStorage.getItem('faster_address') || "";
    
    setupRealtime();

    try {
        if(navigator.onLine) {
            const { data: settings } = await _supabase.from('app_settings').select('customer_delivery_fee').limit(1);
            if (settings && settings.length > 0) { deliveryCharges = settings[0].customer_delivery_fee; }

            const { data: { session } } = await _supabase.auth.getSession();
            if(session) {
                const { data: customerData } = await _supabase.from('customers').select('name, address').eq('email', session.user.email).single();
                
                if (customerData) {
                    if (customerData.name) { 
                        document.getElementById('editName').value = customerData.name; 
                        localStorage.setItem('faster_name', customerData.name); 
                    }
                    if (customerData.address) { 
                        fullSavedAddress = customerData.address; 
                        let displayAddr = customerData.address;
                        if(displayAddr.includes(" | GPS: ")) {
                            displayAddr = displayAddr.split(" | GPS: ")[0].trim(); 
                        }
                        document.getElementById('editAddress').value = displayAddr; 
                        localStorage.setItem('faster_address', customerData.address); 
                    }
                }
            }
        }
    } catch (e) { console.error("Data fetch error:", e); }
}

initPage();

async function handleConfirmPrompt() {
    if (!navigator.onLine) {
        return Dialog.show("No Internet", "Connect to the internet to submit your order.", "alert");
    }
    
    const { data: { session } } = await _supabase.auth.getSession();
    
    if(!session) { 
        await Dialog.show("Session Expired", "Please login again."); 
        window.location.replace("index.html"); 
        return; 
    }
    
    const confirmMsg = `The Delivery Charges will be Rs. ${deliveryCharges}. Do you want to proceed?`;
    const userConfirmed = await Dialog.show("Confirm Order", confirmMsg, "confirm");
    
    if (userConfirmed) { finalSubmitOrder(session.user.email); }
}

async function finalSubmitOrder(userEmail) {
    const btn = document.getElementById('finalSubmitBtn');
    const name = document.getElementById('editName').value.trim();
    const addr = fullSavedAddress || document.getElementById('editAddress').value.trim(); 
    
    if(!name || !addr) { return Dialog.show("Missing Information", "Please provide Name and Address."); }

    // UI COLOR CONTROL: Upload hote waqt button gray ho jayega 'bg-gray-400'
    btn.disabled = true; 
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Processing...`; 
    btn.classList.replace('bg-orange-600', 'bg-gray-400');

    try {
        if (userEmail) {
            await _supabase.from('customers').update({ name: name, address: addr }).eq('email', userEmail);
        }

        const uploadAll = async (items, prefix, defaultExt) => {
            const promises = items.map(async (item) => {
                const file = item.data.file || item.data; 
                const ext = file.name ? file.name.split('.').pop() : defaultExt;
                const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2,4)}.${ext}`;
                
                const { error } = await _supabase.storage.from('order-files').upload(fileName, file);
                if(error) throw error;
                return _supabase.storage.from('order-files').getPublicUrl(fileName).data.publicUrl;
            });
            const urls = await Promise.all(promises);
            return urls.join(",");
        };
        
        const [imgURLs, vidURLs, vceURLs, docURLs] = await Promise.all([
            uploadAll(draftData.images, 'img', 'jpg'), 
            uploadAll(draftData.videos, 'vid', 'mp4'),
            uploadAll(draftData.voices, 'voice', 'webm'), 
            uploadAll(draftData.docs, 'doc', 'pdf')
        ]);
        
        const textData = draftData.texts.map(t => t.data);
        const captionData = draftData.images.filter(i => i.data.caption).map(i => "Photo Caption: " + i.data.caption);
        const combinedDetails = [...textData, ...captionData].join(" | ");

        const { error } = await _supabase.from('orders').insert([{
            customer_phone: userPhone, customer_name: name, delivery_address: addr, 
            order_details: combinedDetails, image_url: imgURLs, video_url: vidURLs, 
            voice_url: vceURLs, doc_url: docURLs, status: 'pending', dc_amount: deliveryCharges 
        }]);
        
        if(error) throw error;
        
        await Dialog.show("Success", "Your order has been placed successfully! ✅", "alert");
        window.location.href = "home.html";
        
    } catch (err) { 
        await Dialog.show("Error", "Error placing order: " + err.message, "alert"); 
        btn.disabled = false; 
        // UI COLOR CONTROL: Error aane par button wapas orange ho jayega 'bg-orange-600'
        btn.innerHTML = `Confirm order <i class="fas fa-check-circle text-white opacity-80 text-lg"></i>`; 
        btn.classList.replace('bg-gray-400', 'bg-orange-600');
    }
}
